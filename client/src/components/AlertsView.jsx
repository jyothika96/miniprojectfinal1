import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Send, X, History, Sliders, ShieldCheck, BellRing } from 'lucide-react';
import { PageHeader, SeverityBadge, StatusBadge, Meter, LoadingState, EmptyState, ErrorBanner, formatDate, formatDateTime } from './ui';

export default function AlertsView({
  meta,
  onAlertUpdated,
  selectedAlertForReview,
  setSelectedAlertForReview,
  openThresholds,
  currentUser,
}) {
  const { diseases = [], regions = [] } = meta || {};

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('');
  const [diseaseFilter, setDiseaseFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const [activeAlertDetails, setActiveAlertDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [reviewForm, setReviewForm] = useState({ status: 'Investigating', notes: '', action_taken: '', reviewer_id: 1 });
  const [submittingReview, setSubmittingReview] = useState(false);

  const canReview = currentUser?.role !== 'analyst';

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (activeTab !== 'All') params.status = activeTab;
      if (severityFilter) params.severity = severityFilter;
      if (diseaseFilter) params.disease_id = diseaseFilter;
      if (regionFilter) params.region_id = regionFilter;

      const response = await api.getAlerts(params);
      setAlerts(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [activeTab, severityFilter, diseaseFilter, regionFilter]);

  // Parent may request a specific alert (from dashboard or investigation tracker)
  useEffect(() => {
    if (selectedAlertForReview) {
      handleOpenReview(selectedAlertForReview);
      setSelectedAlertForReview(null);
    }
  }, [selectedAlertForReview]);

  const handleOpenReview = async (alertItem) => {
    setLoadingDetails(true);
    try {
      const response = await api.getAlertById(alertItem.id);
      setActiveAlertDetails(response.data);
      setReviewForm({
        status: response.data.status === 'New' ? 'Investigating' : response.data.status,
        notes: '',
        action_taken: '',
        reviewer_id: currentUser?.id || 1,
      });
    } catch (err) {
      alert(`Could not load alert details: ${err.message}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewForm.notes.trim()) {
      alert('Please enter investigation notes.');
      return;
    }

    setSubmittingReview(true);
    try {
      await api.updateAlertStatus(activeAlertDetails.id, reviewForm);
      const refreshed = await api.getAlertById(activeAlertDetails.id);
      setActiveAlertDetails(refreshed.data);
      setReviewForm((prev) => ({ ...prev, notes: '', action_taken: '' }));

      fetchAlerts();
      if (onAlertUpdated) onAlertUpdated();
    } catch (err) {
      alert(`Failed to update alert: ${err.message}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  const statusTabs = ['All', 'New', 'Investigating', 'Resolved', 'False Alarm'];
  const hasFilters = severityFilter || diseaseFilter || regionFilter;

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Threshold breaches and case clusters that need review by a health professional.">
        <button className="btn btn-secondary" onClick={openThresholds}>
          <Sliders size={15} />
          <span>Threshold configuration</span>
        </button>
      </PageHeader>

      <div className="tabs" role="tablist">
        {statusTabs.map((tab) => (
          <button key={tab} role="tab" aria-selected={activeTab === tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select className="filter-input" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} aria-label="Filter by severity">
          <option value="">All severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select className="filter-input" value={diseaseFilter} onChange={(e) => setDiseaseFilter(e.target.value)} aria-label="Filter by disease">
          <option value="">All diseases</option>
          {diseases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="filter-input" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Filter by region">
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSeverityFilter('');
              setDiseaseFilter('');
              setRegionFilter('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>Alert queue</span>
            <span className="badge badge-count">{alerts.length} alerts</span>
          </div>
          <span className="card-subtitle">Newest first</span>
        </div>

        {loading ? (
          <LoadingState message="Loading alerts…" />
        ) : error ? (
          <div className="card-body">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No alerts match these filters">
            Surveillance indicators are within the configured thresholds, or the filters are too narrow.
          </EmptyState>
        ) : (
          <div className="table-container">
            <table className="custom-table responsive-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Disease</th>
                  <th>Region</th>
                  <th>Cases vs threshold</th>
                  <th>Generated</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className={`sev-${String(a.severity).toLowerCase()}`}>
                    <td data-label="Severity">
                      <SeverityBadge value={a.severity} />
                    </td>
                    <td data-label="Disease">
                      <div className="cell-primary">{a.disease_name}</div>
                      <div className="cell-secondary">
                        {a.trigger_type} · {a.icd_code}
                      </div>
                    </td>
                    <td data-label="Region">
                      <div>{a.region_name}</div>
                      <div className="cell-secondary">{a.facility_name || 'Regional cluster'}</div>
                    </td>
                    <td data-label="Cases vs threshold">
                      <Meter count={a.case_count_snapshot} threshold={a.threshold_snapshot} />
                    </td>
                    <td data-label="Generated" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(a.alert_date)}
                      <div className="cell-secondary">{a.review_count} {a.review_count === 1 ? 'note' : 'notes'}</div>
                    </td>
                    <td data-label="Status">
                      <StatusBadge value={a.status} />
                    </td>
                    <td data-label="">
                      <button className="btn btn-primary btn-sm" onClick={() => handleOpenReview(a)} disabled={loadingDetails}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeAlertDetails && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '760px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                <BellRing size={18} style={{ color: 'var(--text-muted)' }} />
                <h3 className="modal-title">
                  Alert #{activeAlertDetails.id} · {activeAlertDetails.disease_name}
                </h3>
                <SeverityBadge value={activeAlertDetails.severity} />
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setActiveAlertDetails(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontWeight: 600, marginBottom: '0.9rem' }}>{activeAlertDetails.message}</p>

              <div className="detail-grid">
                <div>
                  <div className="detail-label">Region</div>
                  <div className="detail-value">
                    {activeAlertDetails.region_name} ({activeAlertDetails.region_risk_level} risk)
                  </div>
                </div>
                <div>
                  <div className="detail-label">Trigger</div>
                  <div className="detail-value">{activeAlertDetails.trigger_type}</div>
                </div>
                <div>
                  <div className="detail-label">Cases vs threshold</div>
                  <div className="detail-value">
                    {activeAlertDetails.case_count_snapshot} of {activeAlertDetails.threshold_snapshot}
                  </div>
                </div>
                <div>
                  <div className="detail-label">Current status</div>
                  <StatusBadge value={activeAlertDetails.status} />
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div className="card-header">
                  <div className="card-title">Update status and log an action</div>
                </div>
                <form onSubmit={handleReviewSubmit}>
                  <div className="card-body">
                    <div className="form-grid" style={{ marginBottom: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="review-status">
                          New status<span className="req">*</span>
                        </label>
                        <select id="review-status" className="form-control" value={reviewForm.status} onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value })} required>
                          <option value="Investigating">Investigating — field response active</option>
                          <option value="Resolved">Resolved — containment verified</option>
                          <option value="False Alarm">False alarm — not an outbreak signal</option>
                          <option value="New">Reopen as new</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="review-officer">
                          Reviewing officer
                        </label>
                        <input id="review-officer" type="text" className="form-control" value={`${currentUser?.full_name || 'Public health officer'} (${currentUser?.role || 'staff'})`} disabled />
                      </div>
                      <div className="form-group span-2">
                        <label className="form-label" htmlFor="review-action">
                          Action taken
                        </label>
                        <input id="review-action" type="text" className="form-control" placeholder="e.g. Water sampling team dispatched, larvicide spraying started" value={reviewForm.action_taken} onChange={(e) => setReviewForm({ ...reviewForm, action_taken: e.target.value })} />
                      </div>
                      <div className="form-group span-2">
                        <label className="form-label" htmlFor="review-notes">
                          Investigation notes<span className="req">*</span>
                        </label>
                        <textarea id="review-notes" className="form-control" rows={3} placeholder="Findings, laboratory status, contacts screened" value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} required />
                      </div>
                    </div>
                  </div>
                  <div className="form-actions">
                    {!canReview && <span className="form-helper" style={{ alignSelf: 'center', marginRight: 'auto' }}>Data analysts have view-only access to alert reviews.</span>}
                    <button type="submit" className="btn btn-primary" disabled={submittingReview || !canReview}>
                      <Send size={14} />
                      <span>{submittingReview ? 'Saving…' : 'Save update'}</span>
                    </button>
                  </div>
                </form>
              </div>

              <h4 style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.9rem' }}>
                <History size={16} />
                <span>Investigation history ({activeAlertDetails.reviews?.length || 0})</span>
              </h4>

              {!activeAlertDetails.reviews || activeAlertDetails.reviews.length === 0 ? (
                <p className="form-helper">No updates logged yet. Use the form above to record the first action.</p>
              ) : (
                <div className="timeline-list">
                  {activeAlertDetails.reviews.map((rev) => (
                    <div className="timeline-item" key={rev.id}>
                      <div className={`timeline-dot dot-${String(rev.new_status).toLowerCase().replace(/\s+/g, '-')}`} />
                      <div className="timeline-box">
                        <div className="timeline-meta">
                          <span>
                            <strong style={{ color: 'var(--text-main)' }}>{rev.reviewer_name || 'Health officer'}</strong> ({rev.reviewer_role || 'staff'})
                          </span>
                          <span>{formatDateTime(rev.created_at)}</span>
                        </div>
                        <div className="status-flow" style={{ fontSize: '0.8rem' }}>
                          <StatusBadge value={rev.previous_status} />
                          <span aria-hidden="true">→</span>
                          <StatusBadge value={rev.new_status} />
                        </div>
                        <div className="timeline-notes">{rev.notes}</div>
                        {rev.action_taken && <div className="timeline-action">Action: {rev.action_taken}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveAlertDetails(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
