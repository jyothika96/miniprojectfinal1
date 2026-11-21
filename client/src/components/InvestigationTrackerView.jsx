import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { RefreshCw, FileSearch, ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { PageHeader, SeverityBadge, StatusBadge, LoadingState, EmptyState, ErrorBanner, formatDate, formatDateTime } from './ui';

export default function InvestigationTrackerView({ onSelectAlertForReview, onNavigate }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState({});

  const fetchInvestigations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getInvestigations({ status: statusFilter });
      setLogs(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load investigation logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestigations();
  }, [statusFilter]);

  // The API returns individual log entries (newest first). Group them by alert so each
  // investigation shows its current state, officer and full history in one place.
  const investigations = useMemo(() => {
    const byAlert = new Map();
    logs.forEach((log) => {
      if (!byAlert.has(log.alert_id)) byAlert.set(log.alert_id, []);
      byAlert.get(log.alert_id).push(log);
    });
    return Array.from(byAlert.entries()).map(([alertId, entries]) => ({ alertId, latest: entries[0], entries }));
  }, [logs]);

  const openAlert = (alertId) => {
    if (onSelectAlertForReview) onSelectAlertForReview({ id: alertId });
    if (onNavigate) onNavigate('alerts');
  };

  return (
    <div>
      <PageHeader title="Investigation tracker" subtitle="Follow each alert from first response to resolution, with the officer, actions and notes behind every status change.">
        <select className="filter-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by alert status">
          <option value="">All statuses</option>
          <option value="Investigating">Investigating</option>
          <option value="Resolved">Resolved</option>
          <option value="False Alarm">False alarm</option>
        </select>
        <button className="btn btn-secondary btn-icon" onClick={fetchInvestigations} aria-label="Refresh" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </PageHeader>

      {loading ? (
        <div className="card">
          <LoadingState message="Loading investigations…" />
        </div>
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : investigations.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileSearch} title="No investigations logged">
            When officers review alerts and record actions, each investigation will appear here.
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="card-subtitle" style={{ marginBottom: '0.9rem' }}>
            {investigations.length} {investigations.length === 1 ? 'investigation' : 'investigations'} · {logs.length} logged {logs.length === 1 ? 'update' : 'updates'}
          </p>

          {investigations.map(({ alertId, latest, entries }) => {
            const isOpen = !!expanded[alertId];
            return (
              <div className="card case-card" key={alertId}>
                <div className="case-card-head">
                  <div>
                    <div className="case-card-title">
                      <h3 style={{ fontSize: '1rem' }}>
                        {latest.disease_name} — {latest.region_name}
                      </h3>
                      <SeverityBadge value={latest.alert_severity} />
                      <StatusBadge value={latest.current_alert_status || latest.new_status} />
                    </div>
                    <div className="case-card-meta">
                      <span>
                        Alert <strong>#{alertId}</strong>
                      </span>
                      <span>
                        Generated <strong>{formatDate(latest.alert_date)}</strong>
                      </span>
                      <span>
                        Assigned officer <strong>{latest.reviewer_name || 'Staff officer'}</strong>
                      </span>
                      <span>
                        Last update <strong>{formatDateTime(latest.created_at)}</strong>
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => openAlert(alertId)}>
                    <PenLine size={14} />
                    <span>Update status</span>
                  </button>
                </div>

                <div className="case-card-latest">
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Alert trigger: {latest.alert_message}</div>
                  <div className="timeline-notes" style={{ marginTop: 0 }}>
                    {latest.notes}
                  </div>
                  {latest.action_taken && <div className="timeline-action">Action: {latest.action_taken}</div>}
                </div>

                <div className="case-card-toggle">
                  <span className="card-subtitle">
                    {entries.length} {entries.length === 1 ? 'update' : 'updates'} in history
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((prev) => ({ ...prev, [alertId]: !prev[alertId] }))} aria-expanded={isOpen}>
                    <span>{isOpen ? 'Hide history' : 'Show history'}</span>
                    {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="case-card-history">
                    <div className="timeline-list">
                      {entries.map((item) => (
                        <div className="timeline-item" key={item.id}>
                          <div className={`timeline-dot dot-${String(item.new_status).toLowerCase().replace(/\s+/g, '-')}`} />
                          <div className="timeline-box">
                            <div className="timeline-meta">
                              <span>
                                <strong style={{ color: 'var(--text-main)' }}>{item.reviewer_name || 'Staff officer'}</strong> ({item.reviewer_role || 'health_officer'})
                              </span>
                              <span>{formatDateTime(item.created_at)}</span>
                            </div>
                            <div className="status-flow" style={{ fontSize: '0.8rem' }}>
                              <StatusBadge value={item.previous_status} />
                              <span aria-hidden="true">→</span>
                              <StatusBadge value={item.new_status} />
                            </div>
                            <div className="timeline-notes">{item.notes}</div>
                            {item.action_taken && <div className="timeline-action">Action: {item.action_taken}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
