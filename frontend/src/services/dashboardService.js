import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the currently logged-in user's name and role to every outgoing request,
// so the backend can record who actually performed each action (for audit logging)
// and enforce role-based permission checks (e.g. Platform Administrator-only actions).
apiClient.interceptors.request.use((config) => {
  try {
    const saved = localStorage.getItem('ranalyzer_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (user?.name) {
        config.headers['X-User-Name'] = user.name;
      }
      if (user?.role) {
        config.headers['X-User-Role'] = user.role;
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

export const getMenuPermissions = async (params) => {
  const response = await apiClient.get('/menu-permissions', { params });
  return response.data;
};

export const getMenuPermissionsByRole = async (roleId) => {
  const response = await apiClient.get(`/menu-permissions/${roleId}`);
  return response.data;
};

export const createMenuPermission = async (data) => {
  const response = await apiClient.post('/menu-permissions', data);
  return response.data;
};

export const updateMenuPermissionsForRole = async (roleId, list) => {
  const response = await apiClient.put(`/menu-permissions/${roleId}`, list);
  return response.data;
};

export const updateSinglePermissionRecord = async (id, data) => {
  const response = await apiClient.put(`/menu-permissions/record/${id}`, data);
  return response.data;
};

export const deleteMenuPermission = async (id) => {
  const response = await apiClient.delete(`/menu-permissions/${id}`);
  return response.data;
};

export const getLicenses = async (params) => {
  const response = await apiClient.get('/licenses', { params });
  return response.data;
};

export const getIdentityAttributes = async (params) => {
  const response = await apiClient.get('/identity-attributes', { params });
  return response.data;
};

export const getIdentityAttribute = async (id) => {
  const response = await apiClient.get(`/identity-attributes/${id}`);
  return response.data;
};

export const createIdentityAttribute = async (data) => {
  const response = await apiClient.post('/identity-attributes', data);
  return response.data;
};

export const updateIdentityAttribute = async (id, data) => {
  const response = await apiClient.put(`/identity-attributes/${id}`, data);
  return response.data;
};

export const deleteIdentityAttribute = async (id) => {
  const response = await apiClient.delete(`/identity-attributes/${id}`);
  return response.data;
};

export const getAccountAttributes = async (params) => {
  const response = await apiClient.get('/account-attributes', { params });
  return response.data;
};

export const getAccountAttribute = async (id) => {
  const response = await apiClient.get(`/account-attributes/${id}`);
  return response.data;
};

export const createAccountAttribute = async (data) => {
  const response = await apiClient.post('/account-attributes', data);
  return response.data;
};

export const updateAccountAttribute = async (id, data) => {
  const response = await apiClient.put(`/account-attributes/${id}`, data);
  return response.data;
};

export const deleteAccountAttribute = async (id) => {
  const response = await apiClient.delete(`/account-attributes/${id}`);
  return response.data;
};

export const restoreAccountAttribute = async (id) => {
  const response = await apiClient.post(`/account-attributes/${id}/restore`);
  return response.data;
};

export const getEntitlementAttributes = async (params) => {
  const response = await apiClient.get('/entitlement-attributes', { params });
  return response.data;
};

export const getEntitlementAttribute = async (id) => {
  const response = await apiClient.get(`/entitlement-attributes/${id}`);
  return response.data;
};

export const createEntitlementAttribute = async (data) => {
  const response = await apiClient.post('/entitlement-attributes', data);
  return response.data;
};

export const updateEntitlementAttribute = async (id, data) => {
  const response = await apiClient.put(`/entitlement-attributes/${id}`, data);
  return response.data;
};

export const deleteEntitlementAttribute = async (id) => {
  const response = await apiClient.delete(`/entitlement-attributes/${id}`);
  return response.data;
};

export const restoreEntitlementAttribute = async (id) => {
  const response = await apiClient.post(`/entitlement-attributes/${id}/restore`);
  return response.data;
};

export const bulkUpdateEntitlementStatus = async (ids, status) => {
  const response = await apiClient.post('/entitlement-attributes/bulk-status', { ids, status });
  return response.data;
};

export const bulkDeleteEntitlements = async (ids) => {
  const response = await apiClient.post('/entitlement-attributes/bulk-delete', { ids });
  return response.data;
};

export const importEntitlementAttributes = async (csvFile) => {
  const formData = new FormData();
  formData.append('file', csvFile);
  const response = await apiClient.post('/entitlement-attributes/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const getAttributeCategories = async () => {
  const response = await apiClient.get('/attribute-categories');
  return response.data;
};

export const createAttributeCategory = async (data) => {
  const response = await apiClient.post('/attribute-categories', data);
  return response.data;
};

export const updateAttributeCategory = async (id, data) => {
  const response = await apiClient.put(`/attribute-categories/${id}`, data);
  return response.data;
};

export const deleteAttributeCategory = async (id) => {
  const response = await apiClient.delete(`/attribute-categories/${id}`);
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

// ── Role Attributes (AM-004) ──────────────────────────────────────
export const getRoleAttributes = async (params) => {
  const response = await apiClient.get('/role-attributes', { params });
  return response.data;
};

export const getRoleAttribute = async (id) => {
  const response = await apiClient.get(`/role-attributes/${id}`);
  return response.data;
};

export const createRoleAttribute = async (data) => {
  const response = await apiClient.post('/role-attributes', data);
  return response.data;
};

export const updateRoleAttribute = async (id, data) => {
  const response = await apiClient.put(`/role-attributes/${id}`, data);
  return response.data;
};

export const deleteRoleAttribute = async (id) => {
  const response = await apiClient.delete(`/role-attributes/${id}`);
  return response.data;
};

export const restoreRoleAttribute = async (id) => {
  const response = await apiClient.post(`/role-attributes/${id}/restore`);
  return response.data;
};

export const importRoleAttributes = async (csvFile) => {
  const formData = new FormData();
  formData.append('file', csvFile);
  const response = await apiClient.post('/role-attributes/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

// ── Connectors (DS-001, DS-002, DS-003) ──────────────────────────
export const getConnectors = async (params) => {
  const response = await apiClient.get('/connectors', { params });
  return response.data;
};

export const getConnector = async (id) => {
  const response = await apiClient.get(`/connectors/${id}`);
  return response.data;
};

export const createConnector = async (data) => {
  const response = await apiClient.post('/connectors', data);
  return response.data;
};

export const updateConnector = async (id, data) => {
  const response = await apiClient.put(`/connectors/${id}`, data);
  return response.data;
};

export const deleteConnector = async (id) => {
  const response = await apiClient.delete(`/connectors/${id}`);
  return response.data;
};

export const cloneConnector = async (id) => {
  const response = await apiClient.post(`/connectors/${id}/clone`);
  return response.data;
};

export const testConnectorConnection = async (id) => {
  const response = await apiClient.post(`/connectors/${id}/test`);
  return response.data;
};

export const bulkDeleteConnectors = async (ids) => {
  const response = await apiClient.post('/connectors/bulk-delete', { ids });
  return response.data;
};

export const bulkUpdateConnectorsStatus = async (ids, status) => {
  const response = await apiClient.post('/connectors/bulk-status', { ids, status });
  return response.data;
};

export const uploadConnectorFile = async (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/connectors/${id}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getConnectorLogs = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/logs`);
  return response.data;
};

export const getConnectorFiles = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/files`);
  return response.data;
};