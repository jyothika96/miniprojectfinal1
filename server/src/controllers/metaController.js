const { query } = require('../config/db');

/**
 * Controller for metadata and reference tables
 */
async function getAllMeta(req, res, next) {
  try {
    const [regions, facilities, diseases, users] = await Promise.all([
      query('SELECT id, name, code, population, climate_zone, risk_level FROM regions ORDER BY name ASC'),
      query(
        `SELECT f.id, f.name, f.region_id, f.facility_type, f.bed_capacity, r.name as region_name
         FROM facilities f
         JOIN regions r ON f.region_id = r.id
         ORDER BY f.name ASC`
      ),
      query(
        `SELECT id, name, icd_code, transmission_type, incubation_period_days, default_alert_threshold, description
         FROM disease_categories
         ORDER BY name ASC`
      ),
      query('SELECT id, username, full_name, role, email FROM users WHERE is_active = TRUE ORDER BY full_name ASC'),
    ]);

    res.json({
      success: true,
      data: {
        regions,
        facilities,
        diseases,
        users,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getThresholds(req, res, next) {
  try {
    const thresholds = await query(
      `SELECT ts.id, ts.disease_id, ts.weekly_threshold, ts.spike_percentage, ts.is_active, ts.notification_email, ts.updated_at,
              dc.name AS disease_name, dc.icd_code, dc.default_alert_threshold, dc.transmission_type
       FROM disease_categories dc
       LEFT JOIN threshold_settings ts ON dc.id = ts.disease_id
       ORDER BY dc.name ASC`
    );

    res.json({
      success: true,
      data: thresholds,
    });
  } catch (error) {
    next(error);
  }
}

async function updateThreshold(req, res, next) {
  try {
    const diseaseId = parseInt(req.params.diseaseId, 10);
    const { weekly_threshold, spike_percentage, is_active, notification_email } = req.body;

    if (!diseaseId) {
      return res.status(400).json({ success: false, message: 'Valid disease ID is required' });
    }

    if (weekly_threshold !== undefined && (isNaN(weekly_threshold) || weekly_threshold < 1)) {
      return res.status(400).json({ success: false, message: 'Weekly threshold must be at least 1' });
    }

    if (spike_percentage !== undefined && (isNaN(spike_percentage) || spike_percentage < 5)) {
      return res.status(400).json({ success: false, message: 'Spike percentage must be at least 5%' });
    }

    // Check if threshold setting already exists
    const existing = await query('SELECT id FROM threshold_settings WHERE disease_id = ?', [diseaseId]);

    const wt = weekly_threshold !== undefined ? weekly_threshold : null;
    const sp = spike_percentage !== undefined ? spike_percentage : null;
    const act = is_active !== undefined ? (is_active ? 1 : 0) : null;
    const email = notification_email !== undefined ? notification_email : null;

    if (existing.length > 0) {
      await query(
        `UPDATE threshold_settings
         SET weekly_threshold = COALESCE(?, weekly_threshold),
             spike_percentage = COALESCE(?, spike_percentage),
             is_active = COALESCE(?, is_active),
             notification_email = COALESCE(?, notification_email)
         WHERE disease_id = ?`,
        [wt, sp, act, email, diseaseId]
      );
    } else {
      await query(
        `INSERT INTO threshold_settings (disease_id, weekly_threshold, spike_percentage, is_active, notification_email)
         VALUES (?, ?, ?, ?, ?)`,
        [diseaseId, wt || 15, sp || 40, act !== null ? act : 1, email || '']
      );
    }

    res.json({
      success: true,
      message: 'Threshold configuration updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllMeta,
  getThresholds,
  updateThreshold,
};
