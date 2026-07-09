import { apiClient } from './dashboardService';

export const getIdentities = async (params) => {
  const response = await apiClient.get('/identities', { params });
  return response.data;
};

export const getIdentityFilterMeta = async () => {
  const response = await apiClient.get('/identities/filters/meta');
  return response.data;
};

export const getIdentity = async (id) => {
  const response = await apiClient.get(`/identities/${id}`);
  return response.data;
};

export const getIdentityAccounts = async (id) => {
  const response = await apiClient.get(`/identities/${id}/accounts`);
  return response.data;
};

export const getIdentityEntitlements = async (id) => {
  const response = await apiClient.get(`/identities/${id}/entitlements`);
  return response.data;
};

export const getIdentityTimeline = async (id) => {
  const response = await apiClient.get(`/identities/${id}/timeline`);
  return response.data;
};

export const createIdentity = async (data) => {
  const response = await apiClient.post('/identities', data);
  return response.data;
};

export const updateIdentity = async (id, data) => {
  const response = await apiClient.put(`/identities/${id}`, data);
  return response.data;
};

export const deleteIdentity = async (id) => {
  const response = await apiClient.delete(`/identities/${id}`);
  return response.data;
};

export const bulkUploadIdentities = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/identities/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const resetBulkUploadIdentities = async () => {
  const response = await apiClient.delete('/identities/bulk-upload/reset');
  return response.data;
};
