let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  // nodemailer package optional; dev mode fallback active
}

// Set to avoid duplicate emails for the same alert ID
const sentAlertEmailIds = new Set();

/**
 * Service to manage and dispatch email notifications for early-warning surveillance alerts
 */
class EmailService {
  /**
   * Check if real SMTP credentials are provided in environment
   */
  static isConfigured() {
    return Boolean(
      nodemailer &&
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );
  }

  /**
   * Get or create Nodemailer transporter
   */
  static getTransporter() {
    if (!EmailService.isConfigured() || !nodemailer) {
      return null;
    }

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send early-warning notification email
   * @param {object} alertData - Alert information object
   * @returns {Promise<{ sent: boolean, simulated?: boolean, message?: string }>}
   */
  static async sendAlertNotification(alertData) {
    const {
      id: alertId,
      disease_name,
      region_name,
      facility_name,
      severity = 'Medium',
      trigger_type = 'Threshold Breach',
      case_count_snapshot,
      threshold_snapshot,
      message,
      notification_email,
    } = alertData;

    // Prevent duplicate emails for the same alert ID
    if (alertId && sentAlertEmailIds.has(alertId)) {
      console.log(`[EmailService] Duplicate notification suppressed for Alert #${alertId}`);
      return { sent: false, duplicate: true };
    }

    const recipient =
      notification_email ||
      process.env.ALERT_NOTIFICATION_EMAIL ||
      'epidemiology-response@healthsurveillance.org';

    const fromAddress = process.env.SMTP_FROM || '"CDSEWS Early Warning System" <surveillance@healthsurveillance.org>';
    const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Subject
    const subject = `[CDSEWS Early-Warning Alert] [${severity.toUpperCase()}] ${disease_name} in ${region_name}`;

    // Plain text version
    const textBody = `
COMMUNITY DISEASE SURVEILLANCE & EARLY-WARNING NOTIFICATION
============================================================
Alert ID: #${alertId || 'Pending'}
Severity: ${severity.toUpperCase()}
Disease Category: ${disease_name}
Surveillance Region: ${region_name}
Facility: ${facility_name || 'All Regional Facilities'}
Trigger: ${trigger_type}
Reported Cases (7-day window): ${case_count_snapshot}
Configured Threshold: ${threshold_snapshot}

Summary / Anomaly Details:
${message}

Action Required:
Authorized epidemiologists and public health officers must review this alert,
verify laboratory samples, and log containment actions.

Access Alert Review:
${appUrl}

Disclaimer: Educational Prototype for Public Health Surveillance. Not clinical medical diagnosis.
    `.trim();

    // Color definitions for severity banner
    const severityColors = {
      Critical: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', badge: '#dc2626' },
      High: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', badge: '#ea580c' },
      Medium: { bg: '#fefce8', border: '#eab308', text: '#854d0e', badge: '#ca8a04' },
      Low: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', badge: '#16a34a' },
    };
    const colors = severityColors[severity] || severityColors.Medium;

    // HTML styled email
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #0284c7; color: #ffffff; padding: 18px 24px; }
    .header h2 { margin: 0; font-size: 18px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }
    .body { padding: 24px; }
    .alert-banner { background: ${colors.bg}; border-left: 5px solid ${colors.border}; padding: 14px 18px; border-radius: 6px; margin-bottom: 20px; }
    .badge { display: inline-block; background: ${colors.badge}; color: #ffffff; font-weight: bold; font-size: 11px; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; }
    .field-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 8px 0; font-size: 13px; }
    .field-label { color: #64748b; font-weight: 600; }
    .field-value { color: #0f172a; font-weight: 500; text-align: right; }
    .message-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0; font-size: 13px; line-height: 1.5; }
    .action-button { display: inline-block; background: #0284c7; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 13px; padding: 10px 20px; border-radius: 6px; margin: 16px 0; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #94a3b8; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Community Disease Surveillance & Early-Warning System</h2>
      <p>Automated Public Health Alert Notification</p>
    </div>
    <div class="body">
      <div class="alert-banner">
        <span class="badge">${severity} Severity</span>
        <h3 style="margin: 8px 0 4px; color: ${colors.text}; font-size: 16px;">${trigger_type}: ${disease_name}</h3>
        <p style="margin: 0; color: ${colors.text}; font-size: 13px;">${message}</p>
      </div>

      <div style="margin-bottom: 16px;">
        <div class="field-row">
          <span class="field-label">Disease Category:</span>
          <span class="field-value">${disease_name}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Surveillance Region:</span>
          <span class="field-value">${region_name}</span>
        </div>
        ${facility_name ? `
        <div class="field-row">
          <span class="field-label">Reporting Facility:</span>
          <span class="field-value">${facility_name}</span>
        </div>` : ''}
        <div class="field-row">
          <span class="field-label">Reported Cases (7-Day Sum):</span>
          <span class="field-value"><strong>${case_count_snapshot}</strong> cases</span>
        </div>
        <div class="field-row">
          <span class="field-label">Weekly Alert Threshold:</span>
          <span class="field-value"><strong>${threshold_snapshot}</strong> cases</span>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${appUrl}" class="action-button">Review & Investigate Alert in Dashboard</a>
      </div>
    </div>
    <div class="footer">
      <strong>Educational Prototype Notice:</strong> Alerts indicate statistical anomaly patterns requiring human epidemiological verification, not clinical diagnostic confirmation. Never use real patient-identifiable healthcare records.
    </div>
  </div>
</body>
</html>
    `.trim();

    // Dispatch via SMTP if configured
    if (EmailService.isConfigured()) {
      try {
        const transporter = EmailService.getTransporter();
        const info = await transporter.sendMail({
          from: fromAddress,
          to: recipient,
          subject,
          text: textBody,
          html: htmlBody,
        });

        if (alertId) sentAlertEmailIds.add(alertId);

        console.log(`[EmailService] Alert email sent successfully to ${recipient} (Message ID: ${info.messageId})`);
        return { sent: true, messageId: info.messageId, recipient };
      } catch (err) {
        console.error('[EmailService] SMTP Dispatch Failed:', err.message);
        return { sent: false, error: err.message, fallback: 'Logged to console' };
      }
    } else {
      // Graceful fallback for local development / testing without live SMTP credentials
      if (alertId) sentAlertEmailIds.add(alertId);
      console.log('\n======================================================');
      console.log('[EmailService (Dev Mode - Live SMTP Not Configured)]');
      console.log(`Alert Notification Dispatched:`);
      console.log(`  To       : ${recipient}`);
      console.log(`  Subject  : ${subject}`);
      console.log(`  Severity : ${severity}`);
      console.log(`  Message  : ${message}`);
      console.log('  Tip: Set SMTP_HOST, SMTP_USER, SMTP_PASS in server/.env to enable live transmission.');
      console.log('======================================================\n');
      return {
        sent: false,
        simulated: true,
        recipient,
        subject,
        message: 'Notification simulated in server console (SMTP not configured)',
      };
    }
  }
}

module.exports = EmailService;
