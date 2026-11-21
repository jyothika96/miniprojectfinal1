const { query } = require('../config/db');
const EmailService = require('./emailService');

/**
 * Service to evaluate reported cases against epidemiological thresholds
 * and automatically raise early-warning alerts for public health review.
 */
class ThresholdService {
  /**
   * Evaluate recent surveillance data for a given disease and region
   * @param {number} diseaseId
   * @param {number} regionId
   * @param {number|null} facilityId
   * @returns {Promise<{ triggered: boolean, alert: object|null }>}
   */
  static async evaluateSurveillanceSignals(diseaseId, regionId, facilityId = null) {
    try {
      // 1. Fetch threshold configuration for this disease
      const thresholdRows = await query(
        `SELECT ts.*, dc.name AS disease_name, dc.default_alert_threshold
         FROM disease_categories dc
         LEFT JOIN threshold_settings ts ON dc.id = ts.disease_id
         WHERE dc.id = ?`,
        [diseaseId]
      );

      if (!thresholdRows || thresholdRows.length === 0) {
        return { triggered: false, alert: null };
      }

      const config = thresholdRows[0];
      const weeklyThreshold = config.weekly_threshold || config.default_alert_threshold || 15;
      const spikePercentage = config.spike_percentage || 40;
      const isActive = config.is_active !== 0;

      if (!isActive) {
        return { triggered: false, alert: null };
      }

      // 2. Fetch region details
      const regionRows = await query(`SELECT name, code FROM regions WHERE id = ?`, [regionId]);
      const regionName = regionRows.length > 0 ? regionRows[0].name : `Region #${regionId}`;

      // Fetch facility name if facilityId provided
      let facilityName = null;
      if (facilityId) {
        const facilityRows = await query(`SELECT name FROM facilities WHERE id = ?`, [facilityId]);
        if (facilityRows.length > 0) {
          facilityName = facilityRows[0].name;
        }
      }

      // 3. Calculate sum of cases in the last 7 days (current window)
      const currentWindowRows = await query(
        `SELECT COALESCE(SUM(case_count), 0) AS total_cases
         FROM case_reports
         WHERE disease_id = ?
           AND region_id = ?
           AND report_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [diseaseId, regionId]
      );
      const currentCases = parseInt(currentWindowRows[0].total_cases, 10);

      // 4. Calculate sum of cases in the prior 7 days (baseline window: days 8 to 14)
      const priorWindowRows = await query(
        `SELECT COALESCE(SUM(case_count), 0) AS prior_cases
         FROM case_reports
         WHERE disease_id = ?
           AND region_id = ?
           AND report_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND DATE_SUB(CURDATE(), INTERVAL 8 DAY)`,
        [diseaseId, regionId]
      );
      const priorCases = parseInt(priorWindowRows[0].prior_cases, 10);

      // 5. Check if an active alert for this disease + region already exists in the last 5 days
      const existingAlerts = await query(
        `SELECT id, status FROM alerts
         WHERE disease_id = ?
           AND region_id = ?
           AND status IN ('New', 'Investigating')
           AND alert_date >= DATE_SUB(CURDATE(), INTERVAL 5 DAY)`,
        [diseaseId, regionId]
      );

      if (existingAlerts.length > 0) {
        // Active alert already under review, prevent alert fatigue
        return {
          triggered: false,
          reason: 'Active alert already under investigation for this region/disease',
          existingAlertId: existingAlerts[0].id,
        };
      }

      // 6. Test criteria: Threshold Breach
      let shouldAlert = false;
      let triggerType = 'Threshold Breach';
      let severity = 'Medium';
      let message = '';

      if (currentCases >= weeklyThreshold) {
        shouldAlert = true;
        triggerType = 'Threshold Breach';

        if (currentCases >= weeklyThreshold * 2) {
          severity = 'Critical';
          message = `CRITICAL SURGE: ${currentCases} cases of ${config.disease_name} reported in ${regionName} in the past 7 days (Threshold: ${weeklyThreshold}). Rapid containment protocol advised.`;
        } else if (currentCases >= Math.round(weeklyThreshold * 1.4)) {
          severity = 'High';
          message = `HIGH ELEVATION: ${currentCases} cases of ${config.disease_name} in ${regionName} exceeded weekly threshold (${weeklyThreshold}). Field verification recommended.`;
        } else {
          severity = 'Medium';
          message = `THRESHOLD BREACH: ${currentCases} cases of ${config.disease_name} in ${regionName} reached surveillance limit (${weeklyThreshold}).`;
        }
      } else if (priorCases >= 4) {
        // Test criteria: Rapid Percentage Spike
        const percentageIncrease = Math.round(((currentCases - priorCases) / priorCases) * 100);
        if (percentageIncrease >= spikePercentage) {
          shouldAlert = true;
          triggerType = 'Rapid Spike';
          severity = percentageIncrease >= 100 ? 'High' : 'Medium';
          message = `RAPID ACCELERATION: ${config.disease_name} cases in ${regionName} jumped ${percentageIncrease}% (from ${priorCases} to ${currentCases}) week-over-week.`;
        }
      }

      if (shouldAlert) {
        // Insert new alert into alerts table
        const insertResult = await query(
          `INSERT INTO alerts
           (disease_id, region_id, facility_id, trigger_type, severity, case_count_snapshot, threshold_snapshot, status, message, alert_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?, CURDATE())`,
          [
            diseaseId,
            regionId,
            facilityId,
            triggerType,
            severity,
            currentCases,
            weeklyThreshold,
            message,
          ]
        );

        const newAlertId = insertResult.insertId;

        // Automatically dispatch Email Notification
        EmailService.sendAlertNotification({
          id: newAlertId,
          disease_name: config.disease_name,
          region_name: regionName,
          facility_name: facilityName,
          severity,
          trigger_type: triggerType,
          case_count_snapshot: currentCases,
          threshold_snapshot: weeklyThreshold,
          message,
          notification_email: config.notification_email,
        }).catch((err) => {
          console.error('[ThresholdService] Error sending alert email:', err.message);
        });

        return {
          triggered: true,
          alert: {
            id: newAlertId,
            diseaseId,
            regionId,
            triggerType,
            severity,
            currentCases,
            threshold: weeklyThreshold,
            message,
          },
        };
      }

      return { triggered: false, alert: null };
    } catch (error) {
      console.error('[ThresholdService Error]:', error.message);
      // Return gracefully so main report creation does not fail
      return { triggered: false, error: error.message };
    }
  }

  /**
   * Periodic surveillance evaluation across all active disease categories and regions
   * Used by scheduled monitoring
   */
  static async evaluateAllSurveillanceSignals() {
    try {
      const diseases = await query(`SELECT id, name FROM disease_categories`);
      const regions = await query(`SELECT id, name FROM regions`);

      const triggeredAlerts = [];

      for (const d of diseases) {
        for (const r of regions) {
          const result = await ThresholdService.evaluateSurveillanceSignals(d.id, r.id, null);
          if (result && result.triggered && result.alert) {
            triggeredAlerts.push(result.alert);
          }
        }
      }

      return {
        evaluatedDiseases: diseases.length,
        evaluatedRegions: regions.length,
        triggeredCount: triggeredAlerts.length,
        alerts: triggeredAlerts,
      };
    } catch (err) {
      console.error('[ThresholdService Scheduled Evaluation Error]:', err.message);
      return { error: err.message };
    }
  }
}

module.exports = ThresholdService;
