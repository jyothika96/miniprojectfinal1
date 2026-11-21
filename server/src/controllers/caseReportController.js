const { query } = require('../config/db');
const ThresholdService = require('../services/thresholdService');

/**
 * Get all surveillance case reports with search and multi-criteria filters
 */
async function getCases(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      disease_id,
      region_id,
      facility_id,
      severity,
      startDate,
      endDate,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (disease_id) {
      conditions.push('cr.disease_id = ?');
      params.push(parseInt(disease_id, 10));
    }

    if (region_id) {
      conditions.push('cr.region_id = ?');
      params.push(parseInt(region_id, 10));
    }

    if (facility_id) {
      conditions.push('cr.facility_id = ?');
      params.push(parseInt(facility_id, 10));
    }

    if (severity) {
      conditions.push('cr.severity_level = ?');
      params.push(severity);
    }

    if (startDate) {
      conditions.push('cr.report_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('cr.report_date <= ?');
      params.push(endDate);
    }

    if (search && search.trim() !== '') {
      conditions.push('(cr.notes LIKE ? OR cr.suspected_source LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) AS total
      FROM case_reports cr
      ${whereClause}
    `;
    const [countResult] = await query(countSql, params);
    const totalRecords = countResult.total;

    // Get paginated data
    const dataSql = `
      SELECT
        cr.id,
        cr.disease_id,
        cr.region_id,
        cr.facility_id,
        cr.report_date,
        cr.case_count,
        cr.severity_level,
        cr.hospitalized_count,
        cr.suspected_source,
        cr.notes,
        cr.created_at,
        dc.name AS disease_name,
        dc.icd_code,
        dc.transmission_type,
        r.name AS region_name,
        r.code AS region_code,
        f.name AS facility_name,
        f.facility_type,
        u.full_name AS reported_by_name
      FROM case_reports cr
      JOIN disease_categories dc ON cr.disease_id = dc.id
      JOIN regions r ON cr.region_id = r.id
      JOIN facilities f ON cr.facility_id = f.id
      LEFT JOIN users u ON cr.reported_by = u.id
      ${whereClause}
      ORDER BY cr.report_date DESC, cr.id DESC
      LIMIT ? OFFSET ?
    `;

    // Note: limit and offset should be passed as integers
    const paginatedParams = [...params, limitNum, offset];
    const cases = await query(dataSql, paginatedParams);

    res.json({
      success: true,
      data: cases,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single case report by ID
 */
async function getCaseById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await query(
      `SELECT
        cr.*,
        dc.name AS disease_name,
        dc.icd_code,
        r.name AS region_name,
        f.name AS facility_name,
        u.full_name AS reported_by_name
       FROM case_reports cr
       JOIN disease_categories dc ON cr.disease_id = dc.id
       JOIN regions r ON cr.region_id = r.id
       JOIN facilities f ON cr.facility_id = f.id
       LEFT JOIN users u ON cr.reported_by = u.id
       WHERE cr.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case report not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new case report with validation and automated early-warning threshold checking
 */
async function createCase(req, res, next) {
  try {
    const {
      disease_id,
      region_id,
      facility_id,
      report_date,
      case_count,
      severity_level = 'Moderate',
      hospitalized_count = 0,
      suspected_source = 'Community Transmission',
      notes = '',
      reported_by = 1,
    } = req.body;

    // Strict input validation
    const errors = [];
    if (!disease_id || isNaN(disease_id)) errors.push('Valid disease selection is required.');
    if (!region_id || isNaN(region_id)) errors.push('Valid region selection is required.');
    if (!facility_id || isNaN(facility_id)) errors.push('Valid healthcare facility is required.');

    // 1. Calendar Date Validation & Future Date Prevention
    if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
      errors.push('Report date is required in valid YYYY-MM-DD format.');
    } else {
      const parsedDate = new Date(report_date + 'T00:00:00');
      if (isNaN(parsedDate.getTime())) {
        errors.push('Report date is an invalid calendar date.');
      } else {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (parsedDate > today) {
          errors.push('Reporting date cannot be in the future.');
        }
      }
    }

    // 2. Case count validation
    if (case_count === undefined || case_count === null || isNaN(case_count) || parseInt(case_count, 10) < 1) {
      errors.push('Case count must be a positive integer greater than or equal to 1.');
    }

    // 3. Severity validation
    const validSeverities = ['Mild', 'Moderate', 'Severe'];
    if (!validSeverities.includes(severity_level)) {
      errors.push(`Severity level must be one of: ${validSeverities.join(', ')}`);
    }

    // 4. Hospitalized count validation
    const parsedCaseCount = parseInt(case_count, 10);
    const hospCount = Math.max(0, parseInt(hospitalized_count || 0, 10));
    if (isNaN(hospCount) || hospCount < 0) {
      errors.push('Hospitalized count cannot be negative.');
    } else if (hospCount > parsedCaseCount) {
      errors.push('Hospitalized count cannot exceed total reported case count.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors, message: errors.join(' ') });
    }

    // 5. Database entity validation: disease exists
    const diseaseCheck = await query('SELECT id FROM disease_categories WHERE id = ?', [disease_id]);
    if (diseaseCheck.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected disease category does not exist.' });
    }

    // 6. Database entity validation: facility belongs to selected region
    const facilityCheck = await query('SELECT id, region_id FROM facilities WHERE id = ?', [facility_id]);
    if (facilityCheck.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected healthcare facility does not exist.' });
    }
    if (facilityCheck[0].region_id !== parseInt(region_id, 10)) {
      return res.status(400).json({
        success: false,
        message: 'Discrepancy: The selected healthcare facility does not belong to the selected surveillance region.',
      });
    }

    // Capture authenticated user ID from verified token
    const effectiveReportedBy = req.user ? req.user.id : (reported_by ? parseInt(reported_by, 10) : null);

    // Insert case report using parameterized SQL
    const insertResult = await query(
      `INSERT INTO case_reports
       (disease_id, region_id, facility_id, report_date, case_count, severity_level, hospitalized_count, suspected_source, notes, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(disease_id, 10),
        parseInt(region_id, 10),
        parseInt(facility_id, 10),
        report_date,
        parsedCaseCount,
        severity_level,
        hospCount,
        suspected_source.trim() || 'Community Transmission',
        notes ? notes.trim() : null,
        effectiveReportedBy,
      ]
    );

    const newCaseId = insertResult.insertId;

    // Trigger Automated Threshold & Rapid Spike Evaluation
    const evaluation = await ThresholdService.evaluateSurveillanceSignals(
      parseInt(disease_id, 10),
      parseInt(region_id, 10),
      parseInt(facility_id, 10)
    );

    res.status(201).json({
      success: true,
      message: 'Case report logged successfully',
      data: {
        id: newCaseId,
        disease_id,
        region_id,
        facility_id,
        report_date,
        case_count: parsedCaseCount,
      },
      early_warning: evaluation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing case report
 */
async function updateCase(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      disease_id,
      region_id,
      facility_id,
      report_date,
      case_count,
      severity_level,
      hospitalized_count,
      suspected_source,
      notes,
    } = req.body;

    const existing = await query('SELECT * FROM case_reports WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Case report not found' });
    }

    const updated = {
      disease_id: disease_id ? parseInt(disease_id, 10) : existing[0].disease_id,
      region_id: region_id ? parseInt(region_id, 10) : existing[0].region_id,
      facility_id: facility_id ? parseInt(facility_id, 10) : existing[0].facility_id,
      report_date: report_date || existing[0].report_date,
      case_count: case_count !== undefined ? parseInt(case_count, 10) : existing[0].case_count,
      severity_level: severity_level || existing[0].severity_level,
      hospitalized_count: hospitalized_count !== undefined ? parseInt(hospitalized_count, 10) : existing[0].hospitalized_count,
      suspected_source: suspected_source !== undefined ? suspected_source.trim() : existing[0].suspected_source,
      notes: notes !== undefined ? notes.trim() : existing[0].notes,
    };

    const errors = [];
    if (updated.case_count < 1) {
      errors.push('Case count must be at least 1.');
    }
    if (updated.hospitalized_count < 0 || updated.hospitalized_count > updated.case_count) {
      errors.push('Hospitalized count cannot be negative and cannot exceed total cases.');
    }

    if (report_date) {
      const parsedDate = new Date(report_date + 'T00:00:00');
      if (isNaN(parsedDate.getTime())) {
        errors.push('Report date is invalid.');
      } else {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (parsedDate > today) {
          errors.push('Reporting date cannot be in the future.');
        }
      }
    }

    // Verify facility matches region
    const facilityCheck = await query('SELECT id, region_id FROM facilities WHERE id = ?', [updated.facility_id]);
    if (facilityCheck.length === 0 || facilityCheck[0].region_id !== updated.region_id) {
      errors.push('Selected facility does not exist or does not match the chosen region.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors, message: errors.join(' ') });
    }

    await query(
      `UPDATE case_reports
       SET disease_id = ?, region_id = ?, facility_id = ?, report_date = ?,
           case_count = ?, severity_level = ?, hospitalized_count = ?,
           suspected_source = ?, notes = ?
       WHERE id = ?`,
      [
        updated.disease_id,
        updated.region_id,
        updated.facility_id,
        updated.report_date,
        updated.case_count,
        updated.severity_level,
        updated.hospitalized_count,
        updated.suspected_source,
        updated.notes,
        id,
      ]
    );

    // Re-evaluate surveillance signal
    const evaluation = await ThresholdService.evaluateSurveillanceSignals(
      updated.disease_id,
      updated.region_id,
      updated.facility_id
    );

    res.json({
      success: true,
      message: 'Case report updated successfully',
      data: { id, ...updated },
      early_warning: evaluation,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a case report
 */
async function deleteCase(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query('DELETE FROM case_reports WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Case report not found' });
    }

    res.json({ success: true, message: 'Case report deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
};
