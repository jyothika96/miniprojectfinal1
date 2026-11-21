import React from 'react';
import { AlertTriangle } from 'lucide-react';

/** Display names for the four existing roles (role values are unchanged). */
export const ROLE_LABELS = {
  admin: 'System Administrator',
  epidemiologist: 'Epidemiologist',
  health_officer: 'Health Officer',
  analyst: 'Data Analyst',
  public: 'Public (view-only)',
};

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/** Alert / region severity (Critical, High, Medium, Low) and case severity (Severe, Moderate, Mild). */
export function SeverityBadge({ value, suffix = '' }) {
  if (!value) return null;
  return <span className={`badge badge-${String(value).toLowerCase()}`}>{value}{suffix}</span>;
}

/** Alert status (New, Investigating, Resolved, False Alarm). */
export function StatusBadge({ value }) {
  if (!value) return null;
  return <span className={`badge badge-${String(value).toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>;
}

export function StatCard({ label, icon: Icon, value, critical = false, children }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{label}</span>
        {Icon && <Icon size={17} />}
      </div>
      <div className={`stat-value ${critical ? 'is-critical' : ''}`}>{value}</div>
      {children && <div className="stat-subtext">{children}</div>}
    </div>
  );
}

export function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="loading-spinner" role="status">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty-state">
      {Icon && <Icon className="empty-state-icon" />}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBanner({ title, children }) {
  return (
    <div className="banner banner-error" role="alert">
      <AlertTriangle size={18} />
      <div>
        {title && <div className="banner-title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Case count against its configured threshold. */
export function Meter({ count, threshold }) {
  const c = Number(count) || 0;
  const t = Number(threshold) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
  return (
    <div className="meter">
      <div className="meter-text">
        {c} <span>of {t}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${c >= t ? 'over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
