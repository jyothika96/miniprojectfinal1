/**
 * Centralized API client for Community Disease Surveillance System
 * Includes Bearer JWT token injection, session handling & authenticated CSV exports
 */

const API_BASE = '/api';

export function getAuthToken() {
  try {
    return localStorage.getItem('cdsews_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem('cdsews_token', token);
    } else {
      localStorage.removeItem('cdsews_token');
    }
  } catch (e) {
    console.warn('Storage error:', e);
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Broadcast unauthorized event for session recovery
        window.dispatchEvent(new CustomEvent('cdsews:unauthorized', { detail: data }));
      }

      const errorMsg = data.message || data.errors?.join(' ') || `HTTP Error ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (error) {
    console.error(`API Request Failed: ${options.method || 'GET'} ${url}`, error);
    throw error;
  }
}

export const api = {
  // Authentication & Session
  login: async (credentials) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.success && res.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  getMe: () => request('/auth/me'),
  logout: () => {
    setAuthToken(null);
    try {
      localStorage.removeItem('cdsews_user');
    } catch {}
  },

  // Health & Diagnostics (public)
  getHealth: () => request('/health'),

  // Metadata
  getMeta: () => request('/meta/all'),
  getThresholds: () => request('/meta/thresholds'),
  updateThreshold: (diseaseId, payload) =>
    request(`/meta/thresholds/${diseaseId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Dashboard
  getDashboardSummary: () => request('/dashboard/summary'),

  // Cases
  getCases: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    return request(`/cases?${qs.toString()}`);
  },
  getCaseById: (id) => request(`/cases/${id}`),
  createCase: (payload) =>
    request('/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCase: (id, payload) =>
    request(`/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteCase: (id) =>
    request(`/cases/${id}`, {
      method: 'DELETE',
    }),

  // Alerts
  getAlerts: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    return request(`/alerts?${qs.toString()}`);
  },
  getAlertById: (id) => request(`/alerts/${id}`),
  createAlert: (payload) =>
    request('/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAlertStatus: (id, payload) =>
    request(`/alerts/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteAlert: (id) =>
    request(`/alerts/${id}`, {
      method: 'DELETE',
    }),

  // Investigations & Reviews
  getInvestigations: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    return request(`/investigations?${qs.toString()}`);
  },
  addInvestigationReview: (alertId, payload) =>
    request(`/alerts/${alertId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Reports & Authenticated CSV Export
  getReports: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    return request(`/reports/cases?${qs.toString()}`);
  },
  getExportCsvUrl: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qs.append(key, val);
      }
    });
    // Append token query param so browser direct downloads are authenticated
    const token = getAuthToken();
    if (token) {
      qs.append('token', token);
    }
    return `/api/reports/export-csv?${qs.toString()}`;
  },
};
