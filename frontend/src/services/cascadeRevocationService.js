import { apiClient } from './dashboardService';

export const triggerRevocation = async (payload) => {
  const response = await apiClient.post('/revocation-events', payload);
  return response.data;
};

export const getRevocationEvents = async (params) => {
  const response = await apiClient.get('/revocation-events', { params });
  return response.data;
};

export const getRevocationEvent = async (id) => {
  const response = await apiClient.get(`/revocation-events/${id}`);
  return response.data;
};

export const getRevocationEventStatus = async (id) => {
  const response = await apiClient.get(`/revocation-events/${id}/status`);
  return response.data;
};

export const retryFailedActions = async (id) => {
  const response = await apiClient.post(`/revocation/jobs/${id}/retry`);
  return response.data;
};

export const getRevocationStats = async (params) => {
  const response = await apiClient.get('/revocation-events/stats', { params });
  return response.data;
};

export const simulateRevocation = async (payload) => {
  const response = await apiClient.post('/revocation-events/simulate', payload);
  return response.data;
};

export const getOrphanedAuthorityReport = async () => {
  const response = await apiClient.get('/revocation-events/orphaned-authority-report');
  return response.data;
};

export const getDelegationGraph = async (identityId) => {
  const response = await apiClient.get(`/delegation-links/graph/${identityId}`);
  return response.data;
};

export const createDelegationLink = async (payload) => {
  const response = await apiClient.post('/delegation-links', payload);
  return response.data;
};
