import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  ClipboardList,
  FileSearch,
} from 'lucide-react';
import { api } from '../api';
import { PageHeader, StatCard, SeverityBadge, StatusBadge, LoadingState, EmptyState, ErrorBanner, formatDate, formatDateTime } from './ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "'Manrope', sans-serif";
ChartJS.defaults.color = '#5b6776';

const PALETTE = ['#17324f', '#2d7a80', '#6aa5aa', '#b8893a', '#a65d5d', '#7c8b9c', '#a9bdc9'];
const tooltip = { backgroundColor: '#10243b', padding: 10, cornerRadius: 6, titleFont: { weight: '600' } };

function shortDate(value) {
  const d = new Date(String(value).replace(' ', 'T'));
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardView({ dashboardData, loading, error, onSelectAlert, onNavigate, currentUser, readOnly = false }) {
  const [recentCases, setRecentCases] = useState([]);
  const [recentInvestigations, setRecentInvestigations] = useState([]);

  // Recent activity feeds use the existing /cases and /investigations endpoints.
  useEffect(() => {
    if (readOnly) return undefined; // public accounts cannot call these endpoints
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getCases({ page: 1, limit: 5 });
        if (!cancelled) setRecentCases(res.data || []);
      } catch {
        if (!cancelled) setRecentCases([]);
      }
      try {
        const res = await api.getInvestigations();
        if (!cancelled) setRecentInvestigations((res.data || []).slice(0, 5));
      } catch {
        if (!cancelled) setRecentInvestigations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardData, readOnly]);

  if (loading) return <LoadingState message="Loading surveillance data…" />;

  if (error) {
    return (
      <ErrorBanner title="Unable to load the dashboard">
        {error}. Check that the backend is running and the MySQL settings in <code>server/.env</code> are correct.
      </ErrorBanner>
    );
  }

  const {
    summary = {},
    alerts = {},
    disease_distribution = [],
    regional_stats = [],
    timeline = [],
    recent_alerts = [],
  } = dashboardData || {};

  const firstName = (currentUser?.full_name || '').replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(' ')[0];
  const activeAlerts = (alerts.New || 0) + (alerts.Investigating || 0);
  const hospRate = summary.total_cases > 0 ? ((summary.total_hospitalized / summary.total_cases) * 100).toFixed(1) : '0.0';
  const growth = summary.weekly_growth_percentage || 0;

  const trendData = {
    labels: timeline.map((t) => shortDate(t.report_date)),
    datasets: [
      {
        label: 'Reported cases',
        data: timeline.map((t) => parseInt(t.total_cases, 10)),
        borderColor: '#17324f',
        backgroundColor: 'rgba(23, 50, 79, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
      {
        label: 'Hospitalized',
        data: timeline.map((t) => parseInt(t.hospitalized_cases || 0, 10)),
        borderColor: '#a65d5d',
        backgroundColor: 'transparent',
        tension: 0.3,
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        pointHoverRadius: 4,
      },
    ],
  };
  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: '#edf0f4' }, border: { display: false }, ticks: { precision: 0 } },
    },
  };

  const diseaseData = {
    labels: disease_distribution.map((d) => d.name),
    datasets: [
      {
        data: disease_distribution.map((d) => d.total_cases),
        backgroundColor: disease_distribution.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };
  const diseaseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 } }, tooltip },
  };

  const regionData = {
    labels: regional_stats.map((r) => r.name),
    datasets: [
      {
        label: 'Cases',
        data: regional_stats.map((r) => r.total_cases),
        backgroundColor: '#2d7a80',
        borderRadius: 3,
        maxBarThickness: 22,
      },
    ],
  };
  const regionOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip },
    scales: {
      x: { beginAtZero: true, grid: { color: '#edf0f4' }, border: { display: false }, ticks: { precision: 0 } },
      y: { grid: { display: false } },
    },
  };

  return (
    <div>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Surveillance summary across all monitored regions and reporting facilities."
      />

      <div className="stats-grid">
        <StatCard label="Total reported cases" icon={Activity} value={(summary.total_cases || 0).toLocaleString()}>
          <span>{(summary.total_reports || 0).toLocaleString()} facility reports</span>
        </StatCard>
        <StatCard label="Hospitalized cases" icon={BedDouble} value={(summary.total_hospitalized || 0).toLocaleString()}>
          <span>{hospRate}% of reported cases</span>
        </StatCard>
        <StatCard label="Active alerts" icon={AlertTriangle} value={activeAlerts} critical={(alerts.New || 0) > 0}>
          <span>{alerts.New || 0} new</span>
          <span>{alerts.Investigating || 0} investigating</span>
        </StatCard>
        <StatCard label="Cases in last 7 days" icon={CalendarDays} value={(summary.cases_last_7_days || 0).toLocaleString()}>
          {summary.cases_prior_7_days > 0 ? (
            growth >= 0 ? (
              <span className="trend-up">
                <ArrowUpRight size={14} /> {growth}% vs prior week
              </span>
            ) : (
              <span className="trend-down">
                <ArrowDownRight size={14} /> {Math.abs(growth)}% vs prior week
              </span>
            )
          ) : (
            <span>No prior-week baseline</span>
          )}
        </StatCard>
      </div>

      <div className="grid-charts">
        <div className="card">
          <div className="card-header">
            <div className="card-title">30-day reporting trend</div>
          </div>
          <div className="card-body">
            <div className="chart-box">
              {timeline.length > 0 ? <Line data={trendData} options={trendOptions} /> : <EmptyState title="No reports in the last 30 days" />}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Disease distribution</div>
          </div>
          <div className="card-body">
            <div className="chart-box">
              {disease_distribution.some((d) => d.total_cases > 0) ? (
                <Doughnut data={diseaseData} options={diseaseOptions} />
              ) : (
                <EmptyState title="No cases recorded yet" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-charts">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cases by region</div>
            {!readOnly && (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('reports')}>
                Open analytics
              </button>
            )}
          </div>
          <div className="card-body">
            <div className="chart-box short">
              {regional_stats.length > 0 ? <Bar data={regionData} options={regionOptions} /> : <EmptyState title="No regions configured" />}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Alert overview</div>
            {!readOnly && (
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('alerts')}>
                View alerts
              </button>
            )}
          </div>
          <div className="status-split">
            <div className="status-split-item">
              <div className="status-split-value">{alerts.New || 0}</div>
              <div className="status-split-label">
                <StatusBadge value="New" />
              </div>
            </div>
            <div className="status-split-item">
              <div className="status-split-value">{alerts.Investigating || 0}</div>
              <div className="status-split-label">
                <StatusBadge value="Investigating" />
              </div>
            </div>
            <div className="status-split-item">
              <div className="status-split-value">{alerts.Resolved || 0}</div>
              <div className="status-split-label">
                <StatusBadge value="Resolved" />
              </div>
            </div>
          </div>
          <div className="card-footer" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {alerts.total || 0} alerts in total, including {alerts['False Alarm'] || 0} marked as false alarm.
          </div>
        </div>
      </div>

      <div className={readOnly ? 'grid-two' : 'grid-three'}>
        {!readOnly && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Latest case reports</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('cases-list')}>
              View all
            </button>
          </div>
          {recentCases.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No reports yet" />
          ) : (
            <ul className="activity-list">
              {recentCases.map((c) => (
                <li className="activity-item" key={c.id}>
                  <span className="activity-mark" />
                  <div>
                    <div className="activity-title">
                      {c.case_count} × {c.disease_name}
                    </div>
                    <div className="activity-meta">
                      {c.region_name} · {c.facility_name}
                    </div>
                    <div className="activity-meta">{formatDate(c.report_date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        )}

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent alerts</div>
          </div>
          {recent_alerts.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No alerts generated" />
          ) : (
            <ul className="activity-list">
              {recent_alerts.map((a) => (
                <li className="activity-item" key={a.id}>
                  <span className={`activity-mark ${String(a.status).toLowerCase().replace(/\s+/g, '-')}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="activity-title">
                      {a.disease_name} — {a.region_name}
                    </div>
                    <div className="activity-meta">
                      {a.case_count_snapshot} cases vs threshold {a.threshold_snapshot} · {formatDate(a.alert_date)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <SeverityBadge value={a.severity} />
                      <StatusBadge value={a.status} />
                      {!readOnly && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onSelectAlert(a)}>
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!readOnly && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Investigation updates</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('investigations')}>
              View all
            </button>
          </div>
          {recentInvestigations.length === 0 ? (
            <EmptyState icon={FileSearch} title="No investigation updates" />
          ) : (
            <ul className="activity-list">
              {recentInvestigations.map((l) => (
                <li className="activity-item" key={l.id}>
                  <span className={`activity-mark ${String(l.new_status).toLowerCase().replace(/\s+/g, '-')}`} />
                  <div>
                    <div className="activity-title">
                      {l.disease_name} — {l.region_name}
                    </div>
                    <div className="activity-meta">
                      {l.previous_status} → {l.new_status} · {l.reviewer_name || 'Staff officer'}
                    </div>
                    <div className="activity-meta">{formatDateTime(l.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
