import React from 'react';
import {
  LayoutDashboard,
  ClipboardPlus,
  TableProperties,
  AlertTriangle,
  FileSearch,
  TrendingUp,
  Sliders,
  LogOut,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { ROLE_LABELS } from './ui';

export default function Sidebar({
  currentView,
  setCurrentView,
  alertCounts,
  isOpen,
  setIsOpen,
  collapsed,
  setCollapsed,
  currentUser,
  onLogout,
}) {
  const isAdmin = currentUser?.role === 'admin';
  const isPublic = currentUser?.role === 'public';
  const canReportCases = currentUser?.role !== 'analyst';

  const allSections = [
    {
      label: 'Overview',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      label: 'Surveillance',
      items: [
        { id: 'cases-list', label: 'Case Reports', icon: TableProperties },
        ...(canReportCases ? [{ id: 'report-case', label: 'Submit New Report', icon: ClipboardPlus }] : []),
        {
          id: 'alerts',
          label: 'Alerts',
          icon: AlertTriangle,
          badge: alertCounts?.New > 0 ? alertCounts.New : null,
          badgeType: 'badge-red',
        },
        {
          id: 'investigations',
          label: 'Investigation Tracker',
          icon: FileSearch,
          badge: alertCounts?.Investigating > 0 ? alertCounts.Investigating : null,
          badgeType: 'badge-amber',
        },
      ],
    },
    {
      label: 'Analysis',
      items: [{ id: 'reports', label: 'Reports & Analytics', icon: TrendingUp }],
    },
    ...(isAdmin
      ? [
          {
            label: 'Administration',
            items: [{ id: 'thresholds', label: 'Threshold Configuration', icon: Sliders }],
          },
        ]
      : []),
  ];

  // Public accounts only ever see the dashboard
  const sections = isPublic ? allSections.filter((s) => s.label === 'Overview') : allSections;

  const go = (viewId) => {
    setCurrentView(viewId);
    setIsOpen(false);
  };

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <div className="sidebar-header">
          <div className="brand-icon">
            <Activity size={19} />
          </div>
          <div className="brand-text" style={{ flex: 1 }}>
            <div className="brand-title">Community Disease Surveillance</div>
            <div className="brand-subtitle">Early-warning system</div>
          </div>
          {isOpen && (
            <button
              className="icon-btn"
              style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.15)', color: '#c9d5e2' }}
              onClick={() => setIsOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`nav-item ${currentView === item.id ? 'active' : ''}`}
                    onClick={() => go(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-current={currentView === item.id ? 'page' : undefined}
                  >
                    <Icon size={18} />
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className={`nav-badge ${item.badgeType}`}>{item.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {(() => {
            const cardInner = (
              <>
                <div className="avatar">{(currentUser?.full_name || 'U').charAt(0).toUpperCase()}</div>
                <div className="user-card-text">
                  <div className="user-card-name">{currentUser?.full_name || 'User'}</div>
                  <div className="user-card-role">{ROLE_LABELS[currentUser?.role] || 'User profile'}</div>
                </div>
              </>
            );
            return isPublic ? (
              <div className="user-card" style={{ cursor: 'default' }}>{cardInner}</div>
            ) : (
              <button className={`user-card ${currentView === 'profile' ? 'active' : ''}`} onClick={() => go('profile')} title="User profile">
                {cardInner}
              </button>
            );
          })()}
          <button className="nav-item" onClick={onLogout} title={collapsed ? 'Log out' : undefined}>
            <LogOut size={18} />
            <span className="nav-label">Log out</span>
          </button>
          <button
            className="nav-item collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="nav-label">Collapse sidebar</span>
          </button>
        </div>
      </aside>
    </>
  );
}
