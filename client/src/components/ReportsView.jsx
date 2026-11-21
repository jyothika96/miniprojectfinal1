import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { api } from '../api';
import { Download, RefreshCw, Search, Activity, BedDouble, Stethoscope, MapPin, FileX } from 'lucide-react';
import { PageHeader, StatCard, SeverityBadge, LoadingState, EmptyState, ErrorBanner, formatDate } from './ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.font.family = "'Manrope', sans-serif";
ChartJS.defaults.color = '#5b6776';

const tooltip = { backgroundColor: '#10243b', padding: 10, cornerRadius: 6 };
const gridColor = '#edf0f4';
const PAGE_SIZE = 25;

function toKey(value) {
  return String(value).slice(0, 10);
}

// Monday of the week containing the given YYYY-MM-DD date
function weekStart(dateStr) {
  const d = new Date(`${toKey(dateStr)}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function shortDate(key) {
  const d = new Date(`${key}T00:00:00`);
  return isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function ReportsView({ meta }) {
  const { diseases = [], regions = [] } = meta || {};

  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const defaultFilters = { startDate: thirtyDaysAgoStr, endDate: todayStr, disease_id: '', region_id: '', severity: '' };

  const [filters, setFilters] = useState(defaultFilters);
  const [reportData, setReportData] = useState({ summary: {}, data: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [trendMode, setTrendMode] = useState('daily');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getReports(filters);
      setReportData(response);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [filters.startDate, filters.endDate, filters.disease_id, filters.region_id, filters.severity]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleDownloadCsv = () => {
    window.open(api.getExportCsvUrl(filters), '_blank');
  };

  const summary = reportData.summary || {};
  const cases = reportData.data || [];

  const totalCases = parseInt(summary.total_cases || 0, 10);
  const totalHosp = parseInt(summary.total_hospitalized || 0, 10);
  const hospRate = totalCases > 0 ? ((totalHosp / totalCases) * 100).toFixed(1) : '0.0';

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) =>
      [c.disease_name, c.icd_code, c.region_name, c.facility_name, c.suspected_source, c.reported_by_name, c.severity_level, c.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [cases, search]);

  // Aggregations for charts use the loaded records (up to 500 most recent matching rows).
  const aggregates = useMemo(() => {
    const byDisease = {};
    const byRegion = {};
    const daily = {};
    const weekly = {};
    cases.forEach((c) => {
      const n = Number(c.case_count) || 0;
      byDisease[c.disease_name] = (byDisease[c.disease_name] || 0) + n;
      byRegion[c.region_name] = (byRegion[c.region_name] || 0) + n;
      const day = toKey(c.report_date);
      daily[day] = (daily[day] || 0) + n;
      const wk = weekStart(day);
      weekly[wk] = (weekly[wk] || 0) + n;
    });
    const sortDesc = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const sortAsc = (obj) => Object.entries(obj).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return { diseases: sortDesc(byDisease), regions: sortDesc(byRegion), daily: sortAsc(daily), weekly: sortAsc(weekly) };
  }, [cases]);

  const trendSeries = trendMode === 'daily' ? aggregates.daily : aggregates.weekly;
  const trendData = {
    labels: trendSeries.map(([k]) => (trendMode === 'weekly' ? `Week of ${shortDate(k)}` : shortDate(k))),
    datasets: [
      {
        label: trendMode === 'daily' ? 'Cases per day' : 'Cases per week',
        data: trendSeries.map(([, v]) => v),
        borderColor: '#17324f',
        backgroundColor: 'rgba(23, 50, 79, 0.08)',
        fill: true,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: trendSeries.length > 40 ? 0 : 2.5,
        pointHoverRadius: 5,
      },
    ],
  };
  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { precision: 0 }, title: { display: true, text: 'Cases' } },
    },
  };

  const barOptions = (color, axisTitle) => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip },
    scales: {
      x: { beginAtZero: true, grid: { color: gridColor }, border: { display: false }, ticks: { precision: 0 }, title: { display: true, text: axisTitle } },
      y: { grid: { display: false } },
    },
  });
  const diseaseBar = {
    labels: aggregates.diseases.map(([k]) => k),
    datasets: [{ label: 'Cases', data: aggregates.diseases.map(([, v]) => v), backgroundColor: '#17324f', borderRadius: 3, maxBarThickness: 22 }],
  };
  const regionBar = {
    labels: aggregates.regions.map(([k]) => k),
    datasets: [{ label: 'Cases', data: aggregates.regions.map(([, v]) => v), backgroundColor: '#2d7a80', borderRadius: 3, maxBarThickness: 22 }],
  };

  const isTruncated = cases.length >= 500;

  return (
    <div>
      <PageHeader title="Reports & analytics" subtitle="Explore case trends by disease, region and time, and export the underlying records.">
        <button className="btn btn-primary" onClick={handleDownloadCsv} disabled={loading || cases.length === 0}>
          <Download size={16} />
          <span>Export CSV</span>
        </button>
      </PageHeader>

      <div className="filter-bar">
        <label className="filter-field">
          From
          <input type="date" name="startDate" className="filter-input" value={filters.startDate} onChange={handleFilterChange} />
        </label>
        <label className="filter-field">
          To
          <input type="date" name="endDate" className="filter-input" value={filters.endDate} onChange={handleFilterChange} />
        </label>
        <select name="disease_id" className="filter-input" value={filters.disease_id} onChange={handleFilterChange} aria-label="Filter by disease">
          <option value="">All diseases</option>
          {diseases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="region_id" className="filter-input" value={filters.region_id} onChange={handleFilterChange} aria-label="Filter by region">
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="severity" className="filter-input" value={filters.severity} onChange={handleFilterChange} aria-label="Filter by severity">
          <option value="">All severities</option>
          <option value="Mild">Mild</option>
          <option value="Moderate">Moderate</option>
          <option value="Severe">Severe</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setFilters(defaultFilters)}>
          Reset filters
        </button>
        <button className="btn btn-secondary btn-icon" onClick={fetchReport} aria-label="Refresh report" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="stats-grid">
        <StatCard label="Cases in period" icon={Activity} value={totalCases.toLocaleString()}>
          <span>{summary.total_entries || 0} facility reports</span>
        </StatCard>
        <StatCard label="Hospitalized" icon={BedDouble} value={totalHosp.toLocaleString()}>
          <span>{hospRate}% of cases</span>
        </StatCard>
        <StatCard label="Diseases reported" icon={Stethoscope} value={summary.distinct_diseases || 0}>
          <span>Distinct categories</span>
        </StatCard>
        <StatCard label="Regions reporting" icon={MapPin} value={summary.distinct_regions || 0}>
          <span>With at least one report</span>
        </StatCard>
      </div>

      {!loading && cases.length > 0 && (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span>Reporting trend</span>
              </div>
              <div className="segmented" style={{ gridTemplateColumns: 'repeat(2, auto)' }} role="radiogroup" aria-label="Trend interval">
                {['daily', 'weekly'].map((mode) => (
                  <button key={mode} type="button" role="radio" aria-checked={trendMode === mode} className={trendMode === mode ? 'on-mild' : ''} style={trendMode === mode ? { background: 'var(--teal-50)', color: 'var(--teal-700)' } : undefined} onClick={() => setTrendMode(mode)}>
                    {mode === 'daily' ? 'Daily' : 'Weekly'}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <div className="chart-box">
                <Line data={trendData} options={trendOptions} />
              </div>
            </div>
          </div>

          <div className="grid-two">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Cases by disease</div>
              </div>
              <div className="card-body">
                <div className="chart-box short">
                  <Bar data={diseaseBar} options={barOptions('#17324f', 'Cases')} />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Cases by region</div>
              </div>
              <div className="card-body">
                <div className="chart-box short">
                  <Bar data={regionBar} options={barOptions('#2d7a80', 'Cases')} />
                </div>
              </div>
            </div>
          </div>

          {isTruncated && (
            <div className="banner banner-info">
              <span>Charts and the table show the 500 most recent matching records. Totals above and the CSV export cover the full filtered range.</span>
            </div>
          )}
        </>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>Records</span>
            <span className="badge badge-count">{searched.length} shown</span>
          </div>
          <div className="input-icon" style={{ minWidth: '240px' }}>
            <Search size={16} />
            <input type="text" className="filter-input" style={{ width: '100%' }} placeholder="Search records" aria-label="Search records" value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} />
          </div>
        </div>

        {loading ? (
          <LoadingState message="Compiling report…" />
        ) : cases.length === 0 ? (
          <EmptyState icon={FileX} title="No records in this period">
            Widen the date range or clear filters to see data.
          </EmptyState>
        ) : searched.length === 0 ? (
          <EmptyState icon={Search} title="No records match your search">
            Try a different disease, region, facility or officer name.
          </EmptyState>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Disease</th>
                    <th>Region / facility</th>
                    <th className="num">Cases</th>
                    <th className="num">Hospitalized</th>
                    <th>Severity</th>
                    <th>Source</th>
                    <th>Reported by</th>
                  </tr>
                </thead>
                <tbody>
                  {searched.slice(0, visibleCount).map((c) => (
                    <tr key={c.id}>
                      <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>{formatDate(c.report_date)}</td>
                      <td data-label="Disease">
                        <div className="cell-primary">{c.disease_name}</div>
                        <div className="cell-secondary">{c.icd_code}</div>
                      </td>
                      <td data-label="Region / facility">
                        <div>{c.region_name}</div>
                        <div className="cell-secondary">{c.facility_name}</div>
                      </td>
                      <td data-label="Cases" className="num cell-primary">{c.case_count}</td>
                      <td data-label="Hospitalized" className="num">{c.hospitalized_count}</td>
                      <td data-label="Severity"><SeverityBadge value={c.severity_level} /></td>
                      <td data-label="Source" className="cell-clamp">{c.suspected_source || '—'}</td>
                      <td data-label="Reported by" className="cell-clamp">{c.reported_by_name || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleCount < searched.length && (
              <div className="pagination" style={{ justifyContent: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                  Show more ({searched.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
