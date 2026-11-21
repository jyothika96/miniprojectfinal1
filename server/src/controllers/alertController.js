const { query } = require('../config/db');

/**
 * Get all alerts with filtering by status, severity, disease, and region
 */
async function getAlerts(req, res, next) {
  try {
    const { status, severity, disease_id, region_id, startDate, endDate } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    if (severity) {
      conditions.push('a.severity = ?');
      params.push(severity);
    }

    if (disease_id) {
      conditions.push('a.disease_id = ?');
      params.push(parseInt(disease_id, 10));
    }

    if (region_id) {
      conditions.push('a.region_id = ?');
      params.push(parseInt(region_id, 10));
    }

    if (startDate) {
      conditions.push('a.alert_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('a.alert_date <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        a.id,
        a.disease_id,
        a.region_id,
        a.facility_id,
        a.trigger_type,
        a.severity,
        a.case_count_snapshot,
        a.threshold_snapshot,
        a.status,
        a.message,
        a.alert_date,
        a.created_at,
        a.updated_at,
        dc.name AS disease_name,
        dc.icd_code,
        r.name AS region_name,
        r.code AS region_code,
        r.risk_level AS region_risk_level,
        f.name AS facility_name,
        COUNT(ar.id) AS review_count
      FROM alerts a
      JOIN disease_categories dc ON a.disease_id = dc.id
      JOIN regions r ON a.region_id = r.id
      LEFT JOIN facilities f ON a.facility_id = f.id
      LEFT JOIN alert_reviews ar ON a.id = ar.alert_id
      ${whereClause}
      GROUP BY a.id, a.disease_id, a.region_id, a.facility_id, a.trigger_type, a.severity,
               a.case_count_snapshot, a.threshold_snapshot, a.status, a.message, a.alert_date,
               a.created_at, a.updated_at, dc.name, dc.icd_code, r.name, r.code, r.risk_level, f.name
      ORDER BY
        FIELD(a.status, 'New', 'Investigating', 'Resolved', 'False Alarm'),
        FIELD(a.severity, 'Critical', 'High', 'Medium', 'Low'),
        a.created_at DESC
    `;

    const alerts = await query(sql, params);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get detailed alert by ID including investigation trail and recent case reports
 */
async function getAlertById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);

    const alertRows = await query(
      `SELECT
        a.*,
        dc.name AS disease_name,
        dc.icd_code,
        dc.transmission_type,
        r.name AS region_name,
        r.code AS region_code,
        r.population AS region_population,
        r.risk_level AS region_risk_level,
        f.name AS facility_name,
        f.facility_type
       FROM alerts a
       JOIN disease_categories dc ON a.disease_id = dc.id
       JOIN regions r ON a.region_id = r.id
       LEFT JOIN facilities f ON a.facility_id = f.id
       WHERE a.id = ?`,
      [id]
    );

    if (alertRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const alert = alertRows[0];

    // Fetch investigation review notes
    const reviews = await query(
      `SELECT
        ar.*,
        u.full_name AS reviewer_name,
        u.role AS reviewer_role,
        u.email AS reviewer_email
       FROM alert_reviews ar
       LEFT JOIN users u ON ar.reviewer_id = u.id
       WHERE ar.alert_id = ?
       ORDER BY ar.created_at ASC`,
      [id]
    );

    // Fetch related cases in that disease & region around the alert date
    const relatedCases = await query(
      `SELECT
        cr.id,
        cr.report_date,
        cr.case_count,
        cr.severity_level,
        cr.hospitalized_count,
        cr.suspected_source,
        f.name AS facility_name
       FROM case_reports cr
       JOIN facilities f ON cr.facility_id = f.id
       WHERE cr.disease_id = ?
         AND cr.region_id = ?
         AND cr.report_date BETWEEN DATE_SUB(?, INTERVAL 14 DAY) AND DATE_ADD(?, INTERVAL 7 DAY)
       ORDER BY cr.report_date DESC
       LIMIT 15`,
      [alert.disease_id, alert.region_id, alert.alert_date, alert.alert_date]
    );

    res.json({
      success: true,
      data: {
        ...alert,
        reviews,
        related_cases: relatedCases,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update alert status and automatically record an investigation review audit entry
 */
async function updateAlertStatus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, notes, action_taken, reviewer_id = 1 } = req.body;

    const validStatuses = ['New', 'Investigating', 'Resolved', 'False Alarm'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    if (!notes || notes.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Investigation notes are required when updating alert status.',
      });
    }

    // Check existing alert
    const existingRows = await query('SELECT id, status FROM alerts WHERE id = ?', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const previousStatus = existingRows[0].status;

    // Update alert status
    await query('UPDATE alerts SET status = ? WHERE id = ?', [status, id]);

    // Insert into alert_reviews for full investigation tracking
    const effectiveReviewerId = req.user ? req.user.id : (reviewer_id ? parseInt(reviewer_id, 10) : 1);
    await query(
      `INSERT INTO alert_reviews
       (alert_id, reviewer_id, previous_status, new_status, notes, action_taken)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        effectiveReviewerId,
        previousStatus,
        status,
        notes.trim(),
        action_taken ? action_taken.trim() : 'Status transition logged',
      ]
    );

    res.json({
      success: true,
      message: `Alert updated to '${status}' and investigation log recorded.`,
      data: {
        id,
        previousStatus,
        newStatus: status,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a manual early-warning alert (e.g. epidemiological suspicion or health officer signal)
 */
async function createAlert(req, res, next) {
  try {
    const {
      disease_id,
      region_id,
      facility_id,
      severity = 'Medium',
      message,
      case_count_snapshot = 0,
      threshold_snapshot = 15,
      trigger_type = 'Manual Signal',
    } = req.body;

    if (!disease_id || !region_id || !message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Disease, region, and alert explanation message are required.',
      });
    }

    const result = await query(
      `INSERT INTO alerts
       (disease_id, region_id, facility_id, trigger_type, severity, case_count_snapshot, threshold_snapshot, status, message, alert_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?, CURDATE())`,
      [
        parseInt(disease_id, 10),
        parseInt(region_id, 10),
        facility_id ? parseInt(facility_id, 10) : null,
        trigger_type,
        severity,
        parseInt(case_count_snapshot || 0, 10),
        parseInt(threshold_snapshot || 15, 10),
        message.trim(),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Alert generated successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an alert
 */
async function deleteAlert(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query('DELETE FROM alerts WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAlerts,
  getAlertById,
  updateAlertStatus,
  createAlert,
  deleteAlert,
};
