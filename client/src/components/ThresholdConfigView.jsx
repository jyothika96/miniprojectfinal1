import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Check, Save, Lock } from 'lucide-react';
import { PageHeader, LoadingState, EmptyState, ErrorBanner, formatDateTime } from './ui';

export default function ThresholdConfigView({ currentUser, onThresholdUpdated }) {
  const isAdmin = currentUser?.role === 'admin';

  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savedSuccessId, setSavedSuccessId] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const fetchThresholds = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getThresholds();
      setThresholds(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load threshold settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchThresholds();
  }, [isAdmin]);

  const handleInputChange = (diseaseId, field, val) => {
    setThresholds((prev) => prev.map((item) => (item.disease_id === diseaseId ? { ...item, [field]: val } : item)));
  };

  const handleSave = async (item) => {
    setSavingId(item.disease_id);
    setSavedSuccessId(null);
    setSaveError(null);
    try {
      await api.updateThreshold(item.disease_id, {
        weekly_threshold: parseInt(item.weekly_threshold || 15, 10),
        spike_percentage: parseInt(item.spike_percentage || 40, 10),
        // Rows with no saved settings yet come back with is_active = null and are shown as Active
        is_active: item.is_active !== 0 && item.is_active !== false,
        notification_email: item.notification_email || '',
      });
      setSavedSuccessId(item.disease_id);
      setTimeout(() => setSavedSuccessId(null), 2500);
      if (onThresholdUpdated) onThresholdUpdated();
    } catch (err) {
      setSaveError(`Could not save ${item.disease_name}: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Threshold configuration" />
        <div className="card">
          <EmptyState icon={Lock} title="Administrator access required">
            Only system administrators can change the thresholds that trigger early-warning alerts.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Threshold configuration" subtitle="Control when the system raises an early-warning alert for each disease. Changes apply to new case reports." />

      <div className="threshold-intro">
        <div className="explain">
          <h4>Weekly case threshold</h4>
          <p>An alert is raised when the cases reported for a disease in a region over the 7-day window reach this number.</p>
        </div>
        <div className="explain">
          <h4>Spike sensitivity (%)</h4>
          <p>An alert is also raised when weekly cases rise by at least this percentage over the previous week. Lower values detect smaller increases.</p>
        </div>
        <div className="explain">
          <h4>Status and notification email</h4>
          <p>Disabled diseases do not generate alerts. The notification email receives alert messages for that disease.</p>
        </div>
      </div>

      {saveError && <ErrorBanner>{saveError}</ErrorBanner>}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Disease thresholds</div>
          <span className="card-subtitle">Each rule applies to all regions.</span>
        </div>

        {loading ? (
          <LoadingState message="Loading threshold settings…" />
        ) : error ? (
          <div className="card-body">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table responsive-table">
              <thead>
                <tr>
                  <th>Disease category</th>
                  <th>Weekly threshold (cases)</th>
                  <th>Spike sensitivity (%)</th>
                  <th>Notification email</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((item) => {
                  const saved = savedSuccessId === item.disease_id;
                  return (
                    <tr key={item.disease_id}>
                      <td data-label="Disease">
                        <div className="cell-primary">{item.disease_name}</div>
                        <div className="cell-secondary">
                          {item.icd_code} · default {item.default_alert_threshold}/week
                        </div>
                      </td>
                      <td data-label="Weekly threshold">
                        <input type="number" className="form-control threshold-input" min="1" max="1000" aria-label={`Weekly threshold for ${item.disease_name}`} value={item.weekly_threshold || 15} onChange={(e) => handleInputChange(item.disease_id, 'weekly_threshold', e.target.value)} />
                      </td>
                      <td data-label="Spike sensitivity">
                        <input type="number" className="form-control threshold-input" min="5" max="500" aria-label={`Spike percentage for ${item.disease_name}`} value={item.spike_percentage || 40} onChange={(e) => handleInputChange(item.disease_id, 'spike_percentage', e.target.value)} />
                      </td>
                      <td data-label="Notification email">
                        <input type="email" className="form-control" style={{ minWidth: '190px' }} placeholder="name@example.org" aria-label={`Notification email for ${item.disease_name}`} value={item.notification_email || ''} onChange={(e) => handleInputChange(item.disease_id, 'notification_email', e.target.value)} />
                      </td>
                      <td data-label="Status">
                        <label className="switch">
                          <input type="checkbox" checked={item.is_active !== 0 && item.is_active !== false} onChange={(e) => handleInputChange(item.disease_id, 'is_active', e.target.checked)} />
                          <span>{item.is_active !== 0 && item.is_active !== false ? 'Active' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td data-label="Last updated" className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>
                        {item.updated_at ? formatDateTime(item.updated_at) : 'Not yet saved'}
                      </td>
                      <td data-label="">
                        <button className={`btn btn-sm ${saved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingId === item.disease_id} onClick={() => handleSave(item)} style={saved ? { color: 'var(--success)' } : undefined}>
                          {saved ? (
                            <>
                              <Check size={13} />
                              <span>Saved</span>
                            </>
                          ) : savingId === item.disease_id ? (
                            'Saving…'
                          ) : (
                            <>
                              <Save size={13} />
                              <span>{item.id ? 'Update' : 'Save'}</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
