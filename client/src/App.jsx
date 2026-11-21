import React, { useState, useEffect } from 'react';
import { api, getAuthToken } from './api';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import CaseReportFormView from './components/CaseReportFormView';
import CasesListView from './components/CasesListView';
import AlertsView from './components/AlertsView';
import InvestigationTrackerView from './components/InvestigationTrackerView';
import ReportsView from './components/ReportsView';
import ThresholdConfigView from './components/ThresholdConfigView';
import ProfileView from './components/ProfileView';
import LoginPage from './components/LoginPage';
import { LoadingState } from './components/ui';

const RESTRICTED_MESSAGE = 'Access Restricted: Only System Administrators can configure early-warning threshold parameters.';

function readCollapsed() {
  try {
    return localStorage.getItem('cdsews_sidebar_collapsed') === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(readCollapsed);

  // Authenticated user state - verified on server via JWT, no hardcoded default
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Global State
  const [meta, setMeta] = useState({ regions: [], facilities: [], diseases: [], users: [] });
  const [dbStatus, setDbStatus] = useState({ connected: false });
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(null);

  // Selected alert to review in modal
  const [selectedAlertForReview, setSelectedAlertForReview] = useState(null);

  const setSidebarCollapsed = (value) => {
    setSidebarCollapsedState(value);
    try {
      localStorage.setItem('cdsews_sidebar_collapsed', value ? '1' : '0');
    } catch {
      /* storage unavailable - preference simply is not persisted */
    }
  };

  // Fetch initial metadata & health status
  const loadInitialData = async (user) => {
    try {
      const healthRes = await api.getHealth();
      setDbStatus(healthRes.database || { connected: false });
    } catch (err) {
      setDbStatus({ connected: false, error: err.message });
    }

    // Public accounts are limited to the dashboard and cannot load reference tables
    if (user?.role === 'public') return;

    try {
      const metaRes = await api.getMeta();
      if (metaRes.success) {
        setMeta(metaRes.data);
      }
    } catch (err) {
      console.warn('Metadata fetch warning:', err.message);
    }
  };

  // Fetch dashboard summary
  const loadDashboard = async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await api.getDashboardSummary();
      if (response.success) {
        setDashboardData(response.data);
      }
    } catch (err) {
      setDashboardError(err.message || 'Failed to connect to backend server');
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
    loadInitialData(user);
    loadDashboard();
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setDashboardData(null);
    setSidebarOpen(false);
    setCurrentView('dashboard');
  };

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const token = getAuthToken();
      let verifiedUser = null;
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success && res.user) {
            verifiedUser = res.user;
          }
        } catch {
          verifiedUser = null;
        }
      }

      if (verifiedUser) {
        setCurrentUser(verifiedUser);
        loadInitialData(verifiedUser);
        loadDashboard();
      } else {
        api.logout();
        setCurrentUser(null);
      }
      setAuthChecked(true);
    };

    checkAuthAndLoad();

    const handleUnauthorized = () => {
      api.logout();
      setCurrentUser(null);
    };

    window.addEventListener('cdsews:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('cdsews:unauthorized', handleUnauthorized);
  }, []);

  const handleCaseCreatedOrUpdated = () => {
    loadDashboard();
  };

  const handleAlertUpdated = () => {
    loadDashboard();
  };

  const handleInvestigateAlert = (alert) => {
    setSelectedAlertForReview(alert);
    setCurrentView('alerts');
  };

  const openThresholds = () => {
    if (currentUser?.role === 'admin') {
      setCurrentView('thresholds');
    } else {
      alert(RESTRICTED_MESSAGE);
    }
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState message="Checking your session…" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const isPublic = currentUser.role === 'public';
  // Public accounts can only ever see the dashboard, whatever the view state says
  const activeView = isPublic ? 'dashboard' : currentView;

  return (
    <div className={`app-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        currentView={activeView}
        setCurrentView={setCurrentView}
        alertCounts={dashboardData?.alerts || {}}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="main-wrapper">
        <Header
          currentView={activeView}
          setCurrentView={setCurrentView}
          dbStatus={dbStatus}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          currentUser={currentUser}
          alertCounts={dashboardData?.alerts || {}}
        />

        <main className="content-area">
          {activeView === 'dashboard' && (
            <DashboardView
              dashboardData={dashboardData}
              loading={dashboardLoading}
              error={dashboardError}
              onSelectAlert={handleInvestigateAlert}
              onNavigate={setCurrentView}
              currentUser={currentUser}
              readOnly={isPublic}
            />
          )}

          {activeView === 'report-case' && (
            <CaseReportFormView
              meta={meta}
              onCaseCreated={handleCaseCreatedOrUpdated}
              onNavigate={setCurrentView}
              currentUser={currentUser}
            />
          )}

          {activeView === 'cases-list' && (
            <CasesListView
              meta={meta}
              onCaseUpdated={handleCaseCreatedOrUpdated}
              currentUser={currentUser}
              onNavigate={setCurrentView}
            />
          )}

          {activeView === 'alerts' && (
            <AlertsView
              meta={meta}
              onAlertUpdated={handleAlertUpdated}
              selectedAlertForReview={selectedAlertForReview}
              setSelectedAlertForReview={setSelectedAlertForReview}
              openThresholds={openThresholds}
              currentUser={currentUser}
            />
          )}

          {activeView === 'investigations' && (
            <InvestigationTrackerView onSelectAlertForReview={handleInvestigateAlert} onNavigate={setCurrentView} />
          )}

          {activeView === 'reports' && <ReportsView meta={meta} />}

          {activeView === 'thresholds' && (
            <ThresholdConfigView currentUser={currentUser} onThresholdUpdated={loadDashboard} />
          )}

          {activeView === 'profile' && <ProfileView currentUser={currentUser} onLogout={handleLogout} />}
        </main>
      </div>
    </div>
  );
}
