import React from 'react';
import { Check, Minus, LogOut } from 'lucide-react';
import { PageHeader, ROLE_LABELS } from './ui';

// Mirrors the role checks enforced by the existing API routes.
const PERMISSIONS = [
  { label: 'View dashboard, cases, alerts and reports', roles: ['admin', 'epidemiologist', 'health_officer', 'analyst'] },
  { label: 'Submit case reports', roles: ['admin', 'epidemiologist', 'health_officer'] },
  { label: 'Edit case reports', roles: ['admin', 'epidemiologist'] },
  { label: 'Review alerts and log investigation updates', roles: ['admin', 'epidemiologist', 'health_officer'] },
  { label: 'Delete case reports', roles: ['admin'] },
  { label: 'Configure alert thresholds', roles: ['admin'] },
];

export default function ProfileView({ currentUser, onLogout }) {
  const role = currentUser?.role;

  const rows = [
    ['Full name', currentUser?.full_name],
    ['Username', currentUser?.username],
    ['Email', currentUser?.email],
    ['Phone', currentUser?.phone],
    ['Role', ROLE_LABELS[role] || role],
  ];

  return (
    <div>
      <PageHeader title="User profile" subtitle="Your account details and what your role allows you to do." />

      <div className="profile-grid">
        <div className="card">
          <div className="card-body">
            <div className="avatar avatar-lg">{(currentUser?.full_name || 'U').charAt(0).toUpperCase()}</div>
            <h3 style={{ fontSize: '1.05rem' }}>{currentUser?.full_name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '1.25rem' }}>
              {ROLE_LABELS[role] || role}
            </p>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Account details</div>
            </div>
            <div className="card-body">
              <div className="detail-grid" style={{ margin: 0 }}>
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <div className="detail-label">{label}</div>
                    <div className="detail-value">{value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Role permissions</div>
            </div>
            <div className="card-body">
              <ul className="permission-list">
                {PERMISSIONS.map((p) => {
                  const allowed = p.roles.includes(role);
                  return (
                    <li key={p.label}>
                      {allowed ? <Check size={16} className="yes" /> : <Minus size={16} className="no" />}
                      <span style={{ color: allowed ? 'var(--text-main)' : 'var(--text-dim)' }}>{p.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
