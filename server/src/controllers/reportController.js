const { query } = require('../config/db');

/**
 * Helper to escape CSV values according to RFC 4180
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Get comprehensive analytical surveillance report data
 */
async function getReports(req, res, next) {
  try {
    const { startDate, endDate, disease_id, region_id, facility_id, severity } = req.query;

    const conditions = [];
    const params = [];

    if (startDate) {
      conditions.push('cr.report_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('cr.report_date <= ?');
      params.push(endDate);
    }

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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Summary totals for filtered range
    const summarySql = `
      SELECT
        COALESCE(SUM(cr.case_count), 0) AS total_cases,
        COALESCE(SUM(cr.hospitalized_count), 0) AS total_hospitalized,
        COUNT(cr.id) AS total_entries,
        COUNT(DISTINCT cr.disease_id) AS distinct_diseases,
        COUNT(DISTINCT cr.region_id) AS distinct_regions
      FROM case_reports cr
      ${whereClause}
    `;
    const [summaryRows] = await query(summarySql, params);

    // Detailed rows
    const rowsSql = `
      SELECT
        cr.id,
        cr.report_date,
        cr.case_count,
        cr.hospitalized_count,
        cr.severity_level,
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
      LIMIT 500
    `;
    const rows = await query(rowsSql, params);

    res.json({
      success: true,
      summary: summaryRows,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Export filtered surveillance records to CSV format
 */
async function exportCsv(req, res, next) {
  try {
    const { startDate, endDate, disease_id, region_id, facility_id, severity } = req.query;

    const conditions = [];
    const params = [];

    if (startDate) {
      conditions.push('cr.report_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('cr.report_date <= ?');
      params.push(endDate);
    }

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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        cr.id,
        cr.report_date,
        dc.name AS disease_name,
        dc.icd_code,
        dc.transmission_type,
        r.name AS region_name,
        r.code AS region_code,
        f.name AS facility_name,
        f.facility_type,
        cr.case_count,
        cr.hospitalized_count,
        cr.severity_level,
        cr.suspected_source,
        cr.notes,
        COALESCE(u.full_name, 'System') AS reported_by,
        cr.created_at
      FROM case_reports cr
      JOIN disease_categories dc ON cr.disease_id = dc.id
      JOIN regions r ON cr.region_id = r.id
      JOIN facilities f ON cr.facility_id = f.id
      LEFT JOIN users u ON cr.reported_by = u.id
      ${whereClause}
      ORDER BY cr.report_date DESC, cr.id DESC
      LIMIT 2000
    `;

    const records = await query(sql, params);

    // CSV Headers
    const headers = [
      'Report ID',
      'Report Date',
      'Disease Name',
      'ICD Code',
      'Transmission Type',
      'Region Name',
      'Region Code',
      'Facility Name',
      'Facility Type',
      'Case Count',
      'Hospitalized Count',
      'Severity Level',
      'Suspected Transmission Source',
      'Surveillance Notes',
      'Reported By',
      'Logged Timestamp',
    ];

    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    csvContent += headers.map(escapeCsvValue).join(',') + '\r\n';

    records.forEach((row) => {
      const line = [
        row.id,
        row.report_date,
        row.disease_name,
        row.icd_code,
        row.transmission_type,
        row.region_name,
        row.region_code,
        row.facility_name,
        row.facility_type,
        row.case_count,
        row.hospitalized_count,
        row.severity_level,
        row.suspected_source || '',
        row.notes || '',
        row.reported_by,
        row.created_at,
      ];
      csvContent += line.map(escapeCsvValue).join(',') + '\r\n';
    });

    const dateTag = new Date().toISOString().split('T')[0];
    const filename = `disease_surveillance_export_${dateTag}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getReports,
  exportCsv,
};
