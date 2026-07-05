import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the currently logged-in user's name to every outgoing request,
// so the backend can record who actually performed each action
// (used for audit logging instead of a hardcoded name).
apiClient.interceptors.request.use((config) => {
  try {
    const saved = localStorage.getItem('ranalyzer_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (user?.name) {
        config.headers['X-User-Name'] = user.name;
      }
    }
  } catch (err) {
    console.warn('Could not attach user header:', err);
  }
  return config;
});

export const getDashboardStats = async () => {
  const response = await apiClient.get('/dashboard');
  return response.data;
};

export const getRecentActivities = async () => {
  const response = await apiClient.get('/recent-activities');
  return response.data;
};

export const getNotifications = async () => {
  const response = await apiClient.get('/notifications');
  return response.data;
};

export const getProfile = async () => {
  const response = await apiClient.get('/profile');
  return response.data;
};

export const getTheme = async () => {
  const response = await apiClient.get('/theme');
  return response.data;
};

export const updateTheme = async (theme) => {
  const response = await apiClient.put('/theme', { theme });
  return response.data;
};

export const getApprovalQueue = async () => {
  const response = await apiClient.get('/approval-queue');
  return response.data;
};

export const uploadIdentityData = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/upload-data', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const syncApiKey = async (provider, apiKey) => {
  const response = await apiClient.post('/sync-api', { provider, apiKey });
  return response.data;
};

export const getPlatformUsers = async (params) => {
  const response = await apiClient.get('/platform-users', { params });
  return response.data;
};

export const getPlatformUser = async (id) => {
  const response = await apiClient.get(`/platform-users/${id}`);
  return response.data;
};

export const createPlatformUser = async (userData) => {
  const response = await apiClient.post('/platform-users', userData);
  return response.data;
};

export const updatePlatformUser = async (id, userData) => {
  const response = await apiClient.put(`/platform-users/${id}`, userData);
  return response.data;
};

export const deletePlatformUser = async (id) => {
  const response = await apiClient.delete(`/platform-users/${id}`);
  return response.data;
};

export const getPlatformRoles = async (params) => {
  const response = await apiClient.get('/platform-roles', { params });
  return response.data;
};

export const getPlatformRole = async (id) => {
  const response = await apiClient.get(`/platform-roles/${id}`);
  return response.data;
};

export const createPlatformRole = async (roleData) => {
  const response = await apiClient.post('/platform-roles', roleData);
  return response.data;
};

export const updatePlatformRole = async (id, roleData) => {
  const response = await apiClient.put(`/platform-roles/${id}`, roleData);
  return response.data;
};

export const deletePlatformRole = async (id) => {
  const response = await apiClient.delete(`/platform-roles/${id}`);
  return response.data;
};

export const getAuditLogs = async (params) => {
  const response = await apiClient.get('/audit-logs', { params });
  return response.data;
};

export const getAuditLogModules = async () => {
  const response = await apiClient.get('/audit-logs/modules');
  return response.data;
};

export const getAuditLogActions = async () => {
  const response = await apiClient.get('/audit-logs/actions');
  return response.data;
};

export const getSettings = async () => {
  const response = await apiClient.get('/settings');
  return response.data;
};

export const updateSettings = async (settingsData) => {
  const response = await apiClient.put('/settings', settingsData);
  return response.data;
};

export const getLicenses = async (params) => {
  const response = await apiClient.get('/licenses', { params });
  return response.data;
};

export const getLicense = async (id) => {
  const response = await apiClient.get(`/licenses/${id}`);
  return response.data;
};

export const createLicense = async (licenseData) => {
  const response = await apiClient.post('/licenses', licenseData);
  return response.data;
};

export const updateLicense = async (id, licenseData) => {
  const response = await apiClient.put(`/licenses/${id}`, licenseData);
  return response.data;
};

export const deleteLicense = async (id) => {
  const response = await apiClient.delete(`/licenses/${id}`);
  return response.data;
};