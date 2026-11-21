const { query } = require('../config/db');

/**
 * Controller for comprehensive dashboard epidemiological statistics
 */
async function getDashboardSummary(req, res, next) {
  try {
    // 1. Overall aggregated metrics
    const [overallStats] = await query(`
      SELECT
        COALESCE(SUM(case_count), 0) AS total_cases,
        COALESCE(SUM(hospitalized_count), 0) AS total_hospitalized,
        COUNT(id) AS total_reports
      FROM case_reports
    `);

    // 2. Window statistics: Last 7 days vs previous 7 days
    const [recentWindow] = await query(`
      SELECT COALESCE(SUM(case_count), 0) AS cases_last_7_days
      FROM case_reports
      WHERE report_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);

    const [priorWindow] = await query(`
      SELECT COALESCE(SUM(case_count), 0) AS cases_prior_7_days
      FROM case_reports
      WHERE report_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND DATE_SUB(CURDATE(), INTERVAL 8 DAY)
    `);

    const casesLast7 = parseInt(recentWindow.cases_last_7_days, 10);
    const casesPrior7 = parseInt(priorWindow.cases_prior_7_days, 10);
    let weeklyGrowthPercentage = 0;
    if (casesPrior7 > 0) {
      weeklyGrowthPercentage = Math.round(((casesLast7 - casesPrior7) / casesPrior7) * 100);
    }

    // 3. Alerts status summary
    const alertStatusRows = await query(`
      SELECT
        status,
        COUNT(*) AS count
      FROM alerts
      GROUP BY status
    `);

    const alertCounts = {
      total: 0,
      New: 0,
      Investigating: 0,
      Resolved: 0,
      'False Alarm': 0,
    };

    alertStatusRows.forEach((row) => {
      alertCounts[row.status] = parseInt(row.count, 10);
      alertCounts.total += parseInt(row.count, 10);
    });

    // 4. Disease-wise case distribution
    const diseaseDistribution = await query(`
      SELECT
        dc.id,
        dc.name,
        dc.icd_code,
        dc.transmission_type,
        COALESCE(SUM(cr.case_count), 0) AS total_cases,
        COALESCE(SUM(cr.hospitalized_count), 0) AS hospitalized_cases
      FROM disease_categories dc
      LEFT JOIN case_reports cr ON dc.id = cr.disease_id
      GROUP BY dc.id, dc.name, dc.icd_code, dc.transmission_type
      ORDER BY total_cases DESC
    `);

    const totalAllCases = parseInt(overallStats.total_cases, 10) || 1;
    const diseaseDistributionWithPct = diseaseDistribution.map((d) => ({
      ...d,
      total_cases: parseInt(d.total_cases, 10),
      percentage: Number(((parseInt(d.total_cases, 10) / totalAllCases) * 100).toFixed(1)),
    }));

    // 5. Regional Statistics (attack rate / cases per 100k population)
    const regionalStats = await query(`
      SELECT
        r.id,
        r.name,
        r.code,
        r.population,
        r.risk_level,
        r.climate_zone,
        COALESCE(SUM(cr.case_count), 0) AS total_cases,
        COUNT(DISTINCT f.id) AS facility_count
      FROM regions r
      LEFT JOIN facilities f ON r.id = f.region_id
      LEFT JOIN case_reports cr ON r.id = cr.region_id
      GROUP BY r.id, r.name, r.code, r.population, r.risk_level, r.climate_zone
      ORDER BY total_cases DESC
    `);

    const regionalStatsWithRate = regionalStats.map((r) => {
      const cases = parseInt(r.total_cases, 10);
      const pop = parseInt(r.population, 10);
      const attackRatePer100k = pop > 0 ? Number(((cases / pop) * 100000).toFixed(1)) : 0;
      return {
        ...r,
        total_cases: cases,
        attack_rate_per_100k: attackRatePer100k,
      };
    });

    // 6. 30-Day Trend Timeline (Daily aggregated cases)
    const timelineRows = await query(`
      SELECT
        report_date,
        SUM(case_count) AS total_cases,
        SUM(hospitalized_count) AS hospitalized_cases
      FROM case_reports
      WHERE report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY report_date
      ORDER BY report_date ASC
    `);

    // Disease breakdown over past 30 days for stacked/multi-line chart
    const diseaseTimelineRows = await query(`
      SELECT
        cr.report_date,
        dc.name AS disease_name,
        SUM(cr.case_count) AS cases
      FROM case_reports cr
      JOIN disease_categories dc ON cr.disease_id = dc.id
      WHERE cr.report_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY cr.report_date, dc.name
      ORDER BY cr.report_date ASC
    `);

    // 7. Recent active alerts
    const recentAlerts = await query(`
      SELECT
        a.id,
        a.trigger_type,
        a.severity,
        a.case_count_snapshot,
        a.threshold_snapshot,
        a.status,
        a.message,
        a.alert_date,
        a.created_at,
        dc.name AS disease_name,
        r.name AS region_name,
        f.name AS facility_name
      FROM alerts a
      JOIN disease_categories dc ON a.disease_id = dc.id
      JOIN regions r ON a.region_id = r.id
      LEFT JOIN facilities f ON a.facility_id = f.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `);

    // 8. Monitored facilities count
    const [facilitiesCountRow] = await query('SELECT COUNT(*) AS total_facilities FROM facilities');
    const [regionsCountRow] = await query('SELECT COUNT(*) AS total_regions FROM regions');

    res.json({
      success: true,
      data: {
        summary: {
          total_cases: parseInt(overallStats.total_cases, 10),
          total_hospitalized: parseInt(overallStats.total_hospitalized, 10),
          total_reports: parseInt(overallStats.total_reports, 10),
          cases_last_7_days: casesLast7,
          cases_prior_7_days: casesPrior7,
          weekly_growth_percentage: weeklyGrowthPercentage,
          total_facilities: parseInt(facilitiesCountRow.total_facilities, 10),
          total_regions: parseInt(regionsCountRow.total_regions, 10),
        },
        alerts: alertCounts,
        disease_distribution: diseaseDistributionWithPct,
        regional_stats: regionalStatsWithRate,
        timeline: timelineRows,
        disease_timeline: diseaseTimelineRows,
        recent_alerts: recentAlerts,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardSummary,
};
