const ThresholdService = require('./thresholdService');

let schedulerTimer = null;

/**
 * Scheduled Alert Monitoring Service
 * Periodically scans all diseases and regions to detect threshold breaches and spikes,
 * ensuring early warnings are raised even without new report submissions.
 */
class AlertScheduler {
  /**
   * Start periodic threshold surveillance evaluation
   * @param {number} [intervalMinutes] - Interval in minutes
   */
  static startScheduler(intervalMinutes) {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
    }

    const interval =
      (parseInt(intervalMinutes || process.env.THRESHOLD_SCAN_INTERVAL_MINUTES || '15', 10)) * 60 * 1000;

    console.log(`[AlertScheduler] Periodic threshold surveillance monitor initialized (Interval: ${interval / 60000} minutes)`);

    // Initial evaluation after 5 seconds of server startup
    setTimeout(async () => {
      try {
        console.log('[AlertScheduler] Executing initial periodic threshold scan...');
        const result = await ThresholdService.evaluateAllSurveillanceSignals();
        if (result.triggeredCount > 0) {
          console.log(`[AlertScheduler] Initial scan completed: ${result.triggeredCount} new early-warning alert(s) triggered.`);
        } else {
          console.log('[AlertScheduler] Initial scan completed: All surveillance signals within baseline limits.');
        }
      } catch (err) {
        console.error('[AlertScheduler] Initial scan error:', err.message);
      }
    }, 5000);

    // Periodic interval execution
    schedulerTimer = setInterval(async () => {
      try {
        console.log(`[AlertScheduler] Executing scheduled threshold scan at ${new Date().toISOString()}...`);
        const result = await ThresholdService.evaluateAllSurveillanceSignals();
        if (result.triggeredCount > 0) {
          console.log(`[AlertScheduler] Scheduled scan triggered ${result.triggeredCount} new alert(s).`);
        }
      } catch (err) {
        console.error('[AlertScheduler] Scheduled scan error:', err.message);
      }
    }, interval);

    // Unref so timer doesn't prevent graceful process exit
    if (schedulerTimer.unref) {
      schedulerTimer.unref();
    }
  }

  /**
   * Stop scheduled monitoring
   */
  static stopScheduler() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
      console.log('[AlertScheduler] Periodic threshold surveillance monitor stopped.');
    }
  }
}

module.exports = AlertScheduler;
