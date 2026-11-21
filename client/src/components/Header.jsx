import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { ROLE_LABELS } from './ui';

const TITLES = {
  dashboard: 'Dashboard',
  'report-case': 'Submit Case Report',
  'cases-list': 'Case Reports',
  alerts: 'Alerts',
  investigations: 'Investigation Tracker',
  reports: 'Reports & Analytics',
  thresholds: 'Threshold Configuration',
  profile: 'User Profile',
};

export default function Header({
  currentView,
  setCurrentView,
  dbStatus,
  toggleSidebar,
  currentUser,
  alertCounts,
}) {
  const isPublic = currentUser?.role === 'public';
  const newAlerts = alertCounts?.New || 0;
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={toggleSidebar} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <h1 className="topbar-title">{TITLES[currentView] || 'Community Disease Surveillance'}</h1>
        <span className="topbar-date">{today}</span>
      </div>

      <div className="topbar-right">
        <div
          className={`connection-pill ${dbStatus?.connected ? 'connection-connected' : 'connection-disconnected'}`}
          title={
            dbStatus?.connected
              ? `Connected to MySQL: ${dbStatus.database} on ${dbStatus.host}:${dbStatus.port}`
              : `Database error: ${dbStatus?.error || 'Unavailable'}. Check server/.env`
          }
        >
          <span className="pulse-dot" />
          <span className="pill-text">{dbStatus?.connected ? 'Database connected' : 'Database offline'}</span>
        </div>

        {!isPublic && (
        <button
          className="icon-btn"
          onClick={() => setCurrentView('alerts')}
          aria-label={newAlerts > 0 ? `${newAlerts} new alerts` : 'Alerts'}
          title={newAlerts > 0 ? `${newAlerts} new alert${newAlerts === 1 ? '' : 's'} to review` : 'No new alerts'}
        >
          <Bell size={17} />
          {newAlerts > 0 && <span className="dot-count">{newAlerts > 99 ? '99+' : newAlerts}</span>}
        </button>
        )}

        <button
          className="topbar-user"
          style={{ background: 'none', border: 'none', borderLeft: '1px solid var(--border-color)', cursor: isPublic ? 'default' : 'pointer', textAlign: 'left', color: 'inherit' }}
          onClick={() => !isPublic && setCurrentView('profile')}
          title={isPublic ? undefined : 'Open profile'}
          disabled={isPublic}
        >
          <div className="avatar">{(currentUser?.full_name || 'U').charAt(0).toUpperCase()}</div>
          <div className="topbar-user-text">
            <div className="topbar-user-name">{currentUser?.full_name || 'User'}</div>
            <div className="topbar-role">{ROLE_LABELS[currentUser?.role] || ''}</div>
          </div>
        </button>
      </div>
    </header>
  );
}
