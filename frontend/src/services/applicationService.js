import { apiClient } from './dashboardService';

export const getApplications = async (params) => {
  const response = await apiClient.get('/applications', { params });
  return response.data;
};

export const getApplication = async (id) => {
  const response = await apiClient.get(`/applications/${id}`);
  return response.data;
};

export const createApplication = async (applicationData) => {
  const response = await apiClient.post('/applications', applicationData);
  return response.data;
};

export const updateApplication = async (id, applicationData) => {
  const response = await apiClient.put(`/applications/${id}`, applicationData);
  return response.data;
};

export const deleteApplication = async (id) => {
  const response = await apiClient.delete(`/applications/${id}`);
  return response.data;
};

export const uploadApplicationFile = async (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/applications/${id}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const readApplicationExcelSheets = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/applications/read-sheets', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getApplicationAuditLogs = async (id) => {
  const response = await apiClient.get(`/applications/${id}/audit-logs`);
  return response.data;
};

export const testApplication = async (id) => {
  const response = await apiClient.post(`/applications/${id}/test`);
  return response.data;
};

export const getApplicationSchema = async (id) => {
  const response = await apiClient.get(`/applications/${id}/schema`);
  return response.data;
};

export const importApplicationAccounts = async (id) => {
  const response = await apiClient.post(`/applications/${id}/import-accounts`);
  return response.data;
};

export const getApplicationAccounts = async (id, params) => {
  const response = await apiClient.get(`/applications/${id}/accounts`, { params });
  return response.data;
};

export const bulkDeleteApplicationAccounts = async (id, search) => {
  const response = await apiClient.delete(`/applications/${id}/accounts`, { params: { search } });
  return response.data;
};

export const importApplicationEntitlements = async (id) => {
  const response = await apiClient.post(`/applications/${id}/import-entitlements`);
  return response.data;
};

export const getApplicationEntitlements = async (id, params) => {
  const response = await apiClient.get(`/applications/${id}/entitlements`, { params });
  return response.data;
};

export const importApplicationRoles = async (id) => {
  const response = await apiClient.post(`/applications/${id}/import-roles`);
  return response.data;
};

export const getApplicationRoles = async (id, params) => {
  const response = await apiClient.get(`/applications/${id}/roles`, { params });
  return response.data;
};

export const getApplicationMappings = async (id) => {
  const response = await apiClient.get(`/applications/${id}/mappings`);
  return response.data;
};

export const saveApplicationMappings = async (id, mappings) => {
  const response = await apiClient.put(`/applications/${id}/mappings`, mappings);
  return response.data;
};
export const getApplicationImportHistory = async (id, params) => {
  const response = await apiClient.get(`/applications/${id}/import-history`, { params });
  return response.data;
};

export const searchOwnerCandidates = async (query) => {
  const response = await apiClient.get('/applications-owner-candidates', { params: { q: query } });
  return response.data;
};