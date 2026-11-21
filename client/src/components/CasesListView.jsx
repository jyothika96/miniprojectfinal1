import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { Search, Trash2, Pencil, Eye, X, FileX, ChevronLeft, ChevronRight, RefreshCw, Plus, Info } from 'lucide-react';
import { PageHeader, SeverityBadge, LoadingState, EmptyState, ErrorBanner, formatDate } from './ui';

const PAGE_SIZE = 15;
const OPEN_ALERT_STATUSES = ['New', 'Investigating'];

function dayNumber(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * A report is linked to an alert when it is for the same disease and region and was filed
 * within the window the alert detail page already uses (14 days before to 7 days after the alert).
 * Ongoing = linked to an alert that is still New or Investigating.
 * Completed = everything else (alerts resolved or marked false alarm, or no alert was ever raised).
 */
function isOngoing(report, alerts) {
  const r = dayNumber(report.report_date);
  return alerts.some((a) => {
    if (!OPEN_ALERT_STATUSES.includes(a.status)) return false;
    if (a.disease_id !== report.disease_id || a.region_id !== report.region_id) return false;
    const diff = r - dayNumber(a.alert_date);
    return diff >= -14 && diff <= 7;
  });
}

const GROUPS = [
  { id: 'all', label: 'All reports' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'severe', label: 'Severe' },
];

export default function CasesListView({ meta, onCaseUpdated, currentUser, onNavigate }) {
  const { regions = [], facilities = [], diseases = [] } = meta || {};

  const [allCases, setAllCases] = useState([]);
  const [alertList, setAlertList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState('all');
  const [page, setPage] = useState(1);

  const emptyFilters = { disease_id: '', region_id: '', facility_id: '', severity: '', startDate: '', endDate: '', search: '' };
  const [filters, setFilters] = useState(emptyFilters);

  const [viewingCase, setViewingCase] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [updating, setUpdating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'epidemiologist';
  const canDelete = currentUser?.role === 'admin';
  const canSubmit = currentUser?.role !== 'analyst';

  // Loads every report that matches the filters (the API returns at most 100 per page), plus the
  // alerts used to work out which reports are still ongoing. Grouping and paging happen in the browser.
  const fetchCases = async (overrideFilters) => {
    setLoading(true);
    setError(null);
    try {
      const active = overrideFilters || filters;
      let rows = [];
      let pageNum = 1;
      let totalPages = 1;
      do {
        const response = await api.getCases({ page: pageNum, limit: 100, ...active });
        rows = rows.concat(response.data || []);
        totalPages = response.pagination?.totalPages || 1;
        pageNum += 1;
      } while (pageNum <= totalPages && pageNum <= 30);
      setAllCases(rows);

      try {
        const alertRes = await api.getAlerts();
        setAlertList(alertRes.data || []);
      } catch {
        setAlertList([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchCases();
  }, [filters.disease_id, filters.region_id, filters.facility_id, filters.severity, filters.startDate, filters.endDate]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCases();
  };

  const resetFilters = () => {
    // Search text is not part of the auto-refetch dependencies, so refetch explicitly if it was set.
    const hadSearch = Boolean(filters.search);
    setFilters(emptyFilters);
    setPage(1);
    if (hadSearch) fetchCases(emptyFilters);
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteCase(id);
      setDeleteConfirmId(null);
      fetchCases();
      if (onCaseUpdated) onCaseUpdated();
    } catch (err) {
      alert(`Failed to delete case: ${err.message}`);
    }
  };

  const openEditModal = (caseItem) => {
    setEditingCase(caseItem);
    setEditForm({
      report_date: caseItem.report_date,
      disease_id: caseItem.disease_id,
      region_id: caseItem.region_id,
      facility_id: caseItem.facility_id,
      case_count: caseItem.case_count,
      hospitalized_count: caseItem.hospitalized_count || 0,
      severity_level: caseItem.severity_level,
      suspected_source: caseItem.suspected_source || '',
      notes: caseItem.notes || '',
    });
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      await api.updateCase(editingCase.id, editForm);
      setEditingCase(null);
      fetchCases();
      if (onCaseUpdated) onCaseUpdated();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const facilityOptions = filters.region_id ? facilities.filter((f) => f.region_id === parseInt(filters.region_id, 10)) : facilities;
  const hasFilters = Object.values(filters).some(Boolean);

  const classified = useMemo(
    () => allCases.map((c) => ({ ...c, _ongoing: isOngoing(c, alertList), _severe: c.severity_level === 'Severe' })),
    [allCases, alertList]
  );
  const counts = useMemo(
    () => ({
      all: classified.length,
      ongoing: classified.filter((c) => c._ongoing).length,
      completed: classified.filter((c) => !c._ongoing).length,
      severe: classified.filter((c) => c._severe).length,
    }),
    [classified]
  );
  const grouped = useMemo(() => {
    if (group === 'ongoing') return classified.filter((c) => c._ongoing);
    if (group === 'completed') return classified.filter((c) => !c._ongoing);
    if (group === 'severe') return classified.filter((c) => c._severe);
    return classified;
  }, [classified, group]);

  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const cases = grouped.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pagination = { page: currentPage, total: grouped.length, totalPages };

  return (
    <div>
      <PageHeader title="Case reports" subtitle="Search, filter and manage the case reports submitted by healthcare facilities.">
        {canSubmit && (
          <button className="btn btn-primary" onClick={() => onNavigate && onNavigate('report-case')}>
            <Plus size={16} />
            <span>Submit new report</span>
          </button>
        )}
      </PageHeader>

      <div className="filter-bar">
        <form onSubmit={handleSearchSubmit} className="grow" style={{ display: 'flex', gap: '0.5rem' }}>
          <div className="input-icon" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              type="text"
              name="search"
              className="filter-input"
              style={{ width: '100%' }}
              placeholder="Search notes and sources"
              aria-label="Search case reports"
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            Search
          </button>
        </form>

        <select name="disease_id" className="filter-input" value={filters.disease_id} onChange={handleFilterChange} aria-label="Filter by disease">
          <option value="">All diseases</option>
          {diseases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select name="region_id" className="filter-input" value={filters.region_id} onChange={(e) => setFilters((p) => ({ ...p, region_id: e.target.value, facility_id: '' }))} aria-label="Filter by region">
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select name="facility_id" className="filter-input" value={filters.facility_id} onChange={handleFilterChange} aria-label="Filter by facility">
          <option value="">All facilities</option>
          {facilityOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <select name="severity" className="filter-input" value={filters.severity} onChange={handleFilterChange} aria-label="Filter by severity">
          <option value="">All severities</option>
          <option value="Mild">Mild</option>
          <option value="Moderate">Moderate</option>
          <option value="Severe">Severe</option>
        </select>

        <label className="filter-field">
          From
          <input type="date" name="startDate" className="filter-input" value={filters.startDate} onChange={handleFilterChange} />
        </label>
        <label className="filter-field">
          To
          <input type="date" name="endDate" className="filter-input" value={filters.endDate} onChange={handleFilterChange} />
        </label>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
            Clear filters
          </button>
        )}
        <button className="btn btn-secondary btn-icon" onClick={() => fetchCases()} aria-label="Refresh table" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Group case reports">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            className={`tab ${group === g.id ? 'active' : ''}`}
            onClick={() => {
              setGroup(g.id);
              setPage(1);
            }}
          >
            {g.label} <span className="badge badge-count no-dot">{counts[g.id]}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>{GROUPS.find((g) => g.id === group)?.label}</span>
            <span className="badge badge-count">{pagination.total} records</span>
          </div>
          <span className="card-subtitle">
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </div>

        {loading ? (
          <LoadingState message="Loading case reports…" />
        ) : error ? (
          <div className="card-body">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        ) : cases.length === 0 ? (
          <EmptyState icon={FileX} title="No case reports found">
            {group === 'all' ? 'Try changing or clearing the filters.' : 'No reports in this group. Try another group or clear the filters.'}
          </EmptyState>
        ) : (
          <div className="table-container">
            <table className="custom-table responsive-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Date</th>
                  <th>Disease</th>
                  <th>Region / facility</th>
                  <th className="num">Cases</th>
                  <th className="num">Hospitalized</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Report">
                      <code>#{c.id}</code>
                    </td>
                    <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(c.report_date)}
                    </td>
                    <td data-label="Disease">
                      <div className="cell-primary">{c.disease_name}</div>
                      <div className="cell-secondary">{c.icd_code}</div>
                    </td>
                    <td data-label="Region / facility">
                      <div>{c.region_name}</div>
                      <div className="cell-secondary">{c.facility_name}</div>
                    </td>
                    <td data-label="Cases" className="num cell-primary">
                      {c.case_count}
                    </td>
                    <td data-label="Hospitalized" className="num" style={{ color: c.hospitalized_count > 0 ? 'var(--critical)' : 'var(--text-dim)', fontWeight: c.hospitalized_count > 0 ? 600 : 400 }}>
                      {c.hospitalized_count || 0}
                    </td>
                    <td data-label="Status">
                      {c._ongoing ? (
                        <span className="badge badge-investigating" title="Linked to an alert that is still New or Investigating">Ongoing</span>
                      ) : (
                        <span className="badge badge-resolved" title="No open alert is linked to this report">Completed</span>
                      )}
                    </td>
                    <td data-label="Severity">
                      <SeverityBadge value={c.severity_level} />
                    </td>
                    <td data-label="Source" className="cell-clamp">
                      {c.suspected_source || '—'}
                    </td>
                    <td data-label="">
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-icon" onClick={() => setViewingCase(c)} title="View report" aria-label={`View report ${c.id}`}>
                          <Eye size={14} />
                        </button>
                        {canEdit && (
                          <button className="btn btn-secondary btn-icon" onClick={() => openEditModal(c)} title="Edit report" aria-label={`Edit report ${c.id}`}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-secondary btn-icon" style={{ color: 'var(--critical)' }} onClick={() => setDeleteConfirmId(c.id)} title="Delete report (admin only)" aria-label={`Delete report ${c.id}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Ongoing</strong> reports are linked to an alert that is still New or Investigating (same disease and region, filed within 14 days before to 7 days after the alert). <strong>Completed</strong> reports have no open alert. <strong>Severe</strong> reports are those recorded with severe severity, whatever their status.
          </span>
        </div>

        {pagination.totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>
              <ChevronLeft size={15} />
              <span>Previous</span>
            </button>
            <span className="pagination-info">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>
              <span>Next</span>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {viewingCase && (
        <div className="modal-overlay" onClick={() => setViewingCase(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Case report #{viewingCase.id}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewingCase(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid" style={{ marginBottom: 0 }}>
                {[
                  ['Disease', `${viewingCase.disease_name} (${viewingCase.icd_code})`],
                  ['Report date', formatDate(viewingCase.report_date)],
                  ['Region', viewingCase.region_name],
                  ['Facility', `${viewingCase.facility_name} (${viewingCase.facility_type})`],
                  ['Cases', viewingCase.case_count],
                  ['Hospitalized', viewingCase.hospitalized_count || 0],
                  ['Transmission', viewingCase.transmission_type],
                  ['Suspected source', viewingCase.suspected_source || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="detail-label">{label}</div>
                    <div className="detail-value">{value}</div>
                  </div>
                ))}
                <div>
                  <div className="detail-label">Severity</div>
                  <SeverityBadge value={viewingCase.severity_level} />
                </div>
              </div>
              <div style={{ marginTop: '1.25rem' }}>
                <div className="detail-label">Field notes</div>
                <p style={{ fontSize: '0.88rem' }}>{viewingCase.notes || 'No notes recorded.'}</p>
              </div>
            </div>
            <div className="modal-footer">
              {canEdit && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const c = viewingCase;
                    setViewingCase(null);
                    openEditModal(c);
                  }}
                >
                  <Pencil size={14} />
                  <span>Edit</span>
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setViewingCase(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editingCase && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Edit case report #{editingCase.id}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingCase(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Report date</label>
                    <input type="date" className="form-control" value={editForm.report_date} onChange={(e) => setEditForm({ ...editForm, report_date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Severity</label>
                    <select className="form-control" value={editForm.severity_level} onChange={(e) => setEditForm({ ...editForm, severity_level: e.target.value })}>
                      <option value="Mild">Mild</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Severe">Severe</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Number of cases</label>
                    <input type="number" className="form-control" min="1" value={editForm.case_count} onChange={(e) => setEditForm({ ...editForm, case_count: parseInt(e.target.value, 10) })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hospitalized cases</label>
                    <input type="number" className="form-control" min="0" max={editForm.case_count || 1} value={editForm.hospitalized_count} onChange={(e) => setEditForm({ ...editForm, hospitalized_count: parseInt(e.target.value, 10) })} />
                  </div>
                  <div className="form-group span-2">
                    <label className="form-label">Suspected source</label>
                    <input type="text" className="form-control" value={editForm.suspected_source} onChange={(e) => setEditForm({ ...editForm, suspected_source: e.target.value })} />
                  </div>
                  <div className="form-group span-2">
                    <label className="form-label">Field notes</label>
                    <textarea className="form-control" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingCase(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updating}>
                  {updating ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Delete report #{deleteConfirmId}?</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirmId(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p>This permanently removes the case report. This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirmId)}>
                Delete report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
