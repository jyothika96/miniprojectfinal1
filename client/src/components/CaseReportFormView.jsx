import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { AlertTriangle, CheckCircle2, Send, RotateCcw } from 'lucide-react';
import { PageHeader, SeverityBadge, formatDate } from './ui';

export default function CaseReportFormView({ meta, onCaseCreated, onNavigate, currentUser }) {
  const { regions = [], facilities = [], diseases = [] } = meta || {};

  const todayStr = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    disease_id: '',
    region_id: '',
    facility_id: '',
    report_date: todayStr,
    case_count: 1,
    severity_level: 'Moderate',
    hospitalized_count: 0,
    suspected_source: 'Community Transmission',
    notes: '',
  });

  const [filteredFacilities, setFilteredFacilities] = useState(facilities);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);
  const [recentLoggedCases, setRecentLoggedCases] = useState([]);

  // Auto-filter facilities when region changes
  useEffect(() => {
    if (formData.region_id) {
      const regId = parseInt(formData.region_id, 10);
      const matched = facilities.filter((f) => f.region_id === regId);
      setFilteredFacilities(matched);
      if (matched.length > 0 && !matched.some((f) => f.id === parseInt(formData.facility_id, 10))) {
        setFormData((prev) => ({ ...prev, facility_id: matched[0].id }));
      }
    } else {
      setFilteredFacilities(facilities);
    }
  }, [formData.region_id, facilities]);

  // Default dropdown values once metadata loads
  useEffect(() => {
    if (diseases.length > 0 && !formData.disease_id) {
      setFormData((prev) => ({ ...prev, disease_id: diseases[0].id }));
    }
    if (regions.length > 0 && !formData.region_id) {
      setFormData((prev) => ({ ...prev, region_id: regions[0].id }));
    }
  }, [diseases, regions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrorMessage(null);
  };

  const handleReset = () => {
    const firstRegion = regions[0]?.id || '';
    setFormData({
      disease_id: diseases[0]?.id || '',
      region_id: firstRegion,
      facility_id: facilities.find((f) => f.region_id === firstRegion)?.id || '',
      report_date: todayStr,
      case_count: 1,
      severity_level: 'Moderate',
      hospitalized_count: 0,
      suspected_source: 'Community Transmission',
      notes: '',
    });
    setErrorMessage(null);
    setSuccessInfo(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    try {
      if (currentUser?.role === 'analyst') {
        throw new Error('Role Restriction: Surveillance Data Analysts have read-only access and cannot submit case reports.');
      }

      const diseaseId = parseInt(formData.disease_id, 10);
      const regionId = parseInt(formData.region_id, 10);
      const facilityId = parseInt(formData.facility_id, 10);

      if (!diseaseId || isNaN(diseaseId)) throw new Error('Please select a valid disease category.');
      if (!regionId || isNaN(regionId)) throw new Error('Please select a valid surveillance region.');
      if (!facilityId || isNaN(facilityId)) throw new Error('Please select a valid reporting healthcare facility.');

      if (!formData.report_date) {
        throw new Error('Report date is required.');
      }
      const selectedDate = new Date(formData.report_date);
      if (isNaN(selectedDate.getTime())) {
        throw new Error('Please enter a valid calendar date.');
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selectedDate > today) {
        throw new Error('Future reporting dates are not permitted. Please select today or an earlier date.');
      }

      const caseCount = Number(formData.case_count);
      if (isNaN(caseCount) || !Number.isInteger(caseCount) || caseCount < 1) {
        throw new Error('Number of reported cases must be a positive integer (at least 1).');
      }

      const hospCount = Number(formData.hospitalized_count || 0);
      if (isNaN(hospCount) || !Number.isInteger(hospCount) || hospCount < 0) {
        throw new Error('Hospitalized count must be a non-negative integer.');
      }

      if (hospCount > caseCount) {
        throw new Error('Hospitalized count cannot exceed total reported case count.');
      }

      if (!['Mild', 'Moderate', 'Severe'].includes(formData.severity_level)) {
        throw new Error('Please select a valid severity level (Mild, Moderate, or Severe).');
      }

      const chosenFacility = facilities.find((f) => f.id === facilityId);
      if (chosenFacility && chosenFacility.region_id !== regionId) {
        throw new Error('The selected healthcare facility does not belong to the selected region.');
      }

      const payload = {
        disease_id: diseaseId,
        region_id: regionId,
        facility_id: facilityId,
        report_date: formData.report_date,
        case_count: caseCount,
        severity_level: formData.severity_level,
        hospitalized_count: hospCount,
        suspected_source: formData.suspected_source?.trim() || null,
        notes: formData.notes?.trim() || null,
      };

      const response = await api.createCase(payload);
      setSuccessInfo(response);

      const diseaseObj = diseases.find((d) => d.id === payload.disease_id);
      const regionObj = regions.find((r) => r.id === payload.region_id);
      const facilityObj = facilities.find((f) => f.id === payload.facility_id);

      setRecentLoggedCases((prev) => [
        {
          id: response.data.id,
          date: payload.report_date,
          disease: diseaseObj?.name || 'Disease',
          region: regionObj?.name || 'Region',
          facility: facilityObj?.name || 'Facility',
          count: payload.case_count,
          hospitalized: payload.hospitalized_count,
          severity: payload.severity_level,
          alertTriggered: response.early_warning?.triggered,
        },
        ...prev,
      ]);

      setFormData((prev) => ({ ...prev, case_count: 1, hospitalized_count: 0, notes: '' }));

      if (onCaseCreated) {
        onCaseCreated(response);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit case report');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDisease = diseases.find((d) => d.id === parseInt(formData.disease_id, 10));

  return (
    <div>
      <PageHeader
        title="Submit case report"
        subtitle="Record aggregated cases seen at a facility. Each submission is checked against the configured alert thresholds."
      />

      {successInfo && (
        <div className="banner banner-success" role="status">
          <CheckCircle2 size={18} />
          <div>
            <div className="banner-title">Report #{successInfo.data.id} submitted</div>
            <div>The case report was saved to the surveillance database.</div>
          </div>
        </div>
      )}

      {successInfo?.early_warning?.triggered && (
        <div className="banner banner-error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <div className="banner-title">Early-warning alert generated</div>
            <div>{successInfo.early_warning.alert?.message}</div>
            <button className="btn btn-danger btn-sm" style={{ marginTop: '0.6rem' }} onClick={() => onNavigate('alerts')}>
              Open alerts
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="banner banner-error" role="alert">
          <AlertTriangle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid-form">
        <form className="card" onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="form-section-title">Where and what</div>
            <div className="form-section-desc">Identify the disease, the region and the facility that is reporting.</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="disease_id">
                  Disease category<span className="req">*</span>
                </label>
                <select id="disease_id" name="disease_id" className="form-control" value={formData.disease_id} onChange={handleChange} required>
                  <option value="">Select disease</option>
                  {diseases.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.icd_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="report_date">
                  Report date<span className="req">*</span>
                </label>
                <input id="report_date" type="date" name="report_date" className="form-control" value={formData.report_date} onChange={handleChange} max={todayStr} required />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="region_id">
                  Region<span className="req">*</span>
                </label>
                <select id="region_id" name="region_id" className="form-control" value={formData.region_id} onChange={handleChange} required>
                  <option value="">Select region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) — {r.risk_level} risk
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="facility_id">
                  Healthcare facility<span className="req">*</span>
                </label>
                <select id="facility_id" name="facility_id" className="form-control" value={formData.facility_id} onChange={handleChange} required>
                  <option value="">Select facility</option>
                  {filteredFacilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.facility_type})
                    </option>
                  ))}
                </select>
                <span className="form-helper">{filteredFacilities.length} facilities in the selected region.</span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Case counts</div>
            <div className="form-section-desc">Totals for the report date. Hospitalized cases are a subset of all cases.</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="case_count">
                  Number of cases<span className="req">*</span>
                </label>
                <input id="case_count" type="number" name="case_count" className="form-control" min="1" max="10000" value={formData.case_count} onChange={handleChange} required />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="hospitalized_count">
                  Hospitalized cases
                </label>
                <input id="hospitalized_count" type="number" name="hospitalized_count" className="form-control" min="0" max={formData.case_count || 1} value={formData.hospitalized_count} onChange={handleChange} />
                <span className="form-helper">Cannot exceed the number of cases.</span>
              </div>

              <div className="form-group span-2">
                <span className="form-label" id="severity-label">
                  Severity<span className="req">*</span>
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="severity-label">
                  {[
                    ['Mild', 'Outpatient or self-limiting'],
                    ['Moderate', 'Clinical management needed'],
                    ['Severe', 'Urgent care or ICU'],
                  ].map(([level, hint]) => (
                    <button
                      type="button"
                      key={level}
                      role="radio"
                      aria-checked={formData.severity_level === level}
                      title={hint}
                      className={formData.severity_level === level ? `on-${level.toLowerCase()}` : ''}
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, severity_level: level }));
                        setErrorMessage(null);
                      }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <span className="form-helper">Mild: outpatient or self-limiting · Moderate: clinical management needed · Severe: urgent care or ICU.</span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Context</div>
            <div className="form-section-desc">Optional details that help investigators.</div>
            <div className="form-grid">
              <div className="form-group span-2">
                <label className="form-label" htmlFor="suspected_source">
                  Suspected source or vector
                </label>
                <input id="suspected_source" type="text" name="suspected_source" className="form-control" placeholder="e.g. Stagnant rainwater, school cafeteria, public well" value={formData.suspected_source} onChange={handleChange} />
              </div>
              <div className="form-group span-2">
                <label className="form-label" htmlFor="notes">
                  Field notes
                </label>
                <textarea id="notes" name="notes" className="form-control" placeholder="Symptoms, age groups affected, contact tracing, laboratory status" value={formData.notes} onChange={handleChange} rows={3} />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              <RotateCcw size={15} />
              <span>Reset</span>
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Send size={15} />
              <span>{submitting ? 'Submitting…' : 'Submit report'}</span>
            </button>
          </div>
        </form>

        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Selected disease</div>
            </div>
            <div className="card-body">
              {selectedDisease ? (
                <>
                  <div className="cell-primary">{selectedDisease.name}</div>
                  <div className="cell-secondary" style={{ marginBottom: '0.9rem' }}>
                    {selectedDisease.icd_code} · {selectedDisease.transmission_type}
                  </div>
                  <div className="detail-label">Default weekly alert threshold</div>
                  <div className="detail-value" style={{ marginBottom: '0.6rem' }}>
                    {selectedDisease.default_alert_threshold} cases
                  </div>
                  <div className="detail-label">Typical incubation period</div>
                  <div className="detail-value">About {selectedDisease.incubation_period_days} days</div>
                </>
              ) : (
                <p className="form-helper">Choose a disease to see its alert threshold and incubation period.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Submitted this session</div>
            </div>
            {recentLoggedCases.length === 0 ? (
              <div className="card-body">
                <p className="form-helper">Reports you submit will be listed here.</p>
              </div>
            ) : (
              <ul className="activity-list">
                {recentLoggedCases.map((c) => (
                  <li className="activity-item" key={c.id}>
                    <span className="activity-mark" />
                    <div style={{ minWidth: 0 }}>
                      <div className="activity-title">
                        #{c.id} · {c.count} × {c.disease}
                      </div>
                      <div className="activity-meta">
                        {c.region} · {c.facility} · {formatDate(c.date)}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        <SeverityBadge value={c.severity} />
                        {c.alertTriggered ? <span className="badge badge-critical">Threshold breached</span> : <span className="badge badge-low">Within threshold</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
