const { query } = require('../config/db');

/**
 * Get all investigation logs across the system for the Investigation Tracker
 */
async function getAllInvestigations(req, res, next) {
  try {
    const { status, alert_id } = req.query;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    if (alert_id) {
      conditions.push('ar.alert_id = ?');
      params.push(parseInt(alert_id, 10));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        ar.id,
        ar.alert_id,
        ar.previous_status,
        ar.new_status,
        ar.notes,
        ar.action_taken,
        ar.created_at,
        u.full_name AS reviewer_name,
        u.role AS reviewer_role,
        a.message AS alert_message,
        a.severity AS alert_severity,
        a.status AS current_alert_status,
        a.alert_date,
        dc.name AS disease_name,
        r.name AS region_name
      FROM alert_reviews ar
      JOIN alerts a ON ar.alert_id = a.id
      JOIN disease_categories dc ON a.disease_id = dc.id
      JOIN regions r ON a.region_id = r.id
      LEFT JOIN users u ON ar.reviewer_id = u.id
      ${whereClause}
      ORDER BY ar.created_at DESC
    `;

    const logs = await query(sql, params);

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add a new investigation progress note to an alert
 */
async function addReview(req, res, next) {
  try {
    const alertId = parseInt(req.params.alertId, 10);
    const { notes, action_taken = 'Investigation progress update', reviewer_id = 1, update_status } = req.body;

    if (!notes || notes.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Investigation notes cannot be empty.',
      });
    }

    const alertRows = await query('SELECT status FROM alerts WHERE id = ?', [alertId]);
    if (alertRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const currentStatus = alertRows[0].status;
    const requestedStatus = update_status || req.body.status;
    const newStatus = requestedStatus || currentStatus;

    if (requestedStatus && requestedStatus !== currentStatus) {
      await query('UPDATE alerts SET status = ? WHERE id = ?', [requestedStatus, alertId]);
    }

    const effectiveReviewerId = req.user ? req.user.id : (reviewer_id ? parseInt(reviewer_id, 10) : 1);
    const insertResult = await query(
      `INSERT INTO alert_reviews
       (alert_id, reviewer_id, previous_status, new_status, notes, action_taken)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        alertId,
        effectiveReviewerId,
        currentStatus,
        newStatus,
        notes.trim(),
        action_taken.trim(),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Investigation note added successfully',
      data: {
        id: insertResult.insertId,
        alert_id: alertId,
        previous_status: currentStatus,
        new_status: newStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllInvestigations,
  addReview,
};
