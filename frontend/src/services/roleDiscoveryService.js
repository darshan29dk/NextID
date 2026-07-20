import { apiClient } from './dashboardService';

export const getMiningCampaigns = async (params) => {
  const response = await apiClient.get('/mining-campaigns', { params });
  return response.data;
};

export const createMiningCampaign = async (data) => {
  const response = await apiClient.post('/mining-campaigns', data);
  return response.data;
};

export const getMiningCampaign = async (id) => {
  const response = await apiClient.get(`/mining-campaigns/${id}`);
  return response.data;
};

export const deleteMiningCampaign = async (id) => {
  const response = await apiClient.delete(`/mining-campaigns/${id}`);
  return response.data;
};

export const runMiningCampaign = async (id) => {
  const response = await apiClient.post(`/mining-campaigns/${id}/run`);
  return response.data;
};

export const getCandidateRoles = async (campaignId, params) => {
  const response = await apiClient.get(`/mining-campaigns/${campaignId}/candidate-roles`, { params });
  return response.data;
};

export const getCandidateRoleDetail = async (id) => {
  const response = await apiClient.get(`/role-discovery/candidate-roles/${id}`);
  return response.data;
};

export const compareCandidateRoles = async (ids) => {
  const response = await apiClient.get('/role-discovery/candidate-roles/compare', { params: { ids: ids.join(',') } });
  return response.data;
};

export const getCampaignOutliers = async (campaignId, params) => {
  const response = await apiClient.get(`/mining-campaigns/${campaignId}/outliers`, { params });
  return response.data;
};

export const getCampaignMatrix = async (campaignId, roleIds) => {
  const params = roleIds && roleIds.length ? { role_ids: roleIds.join(',') } : {};
  const response = await apiClient.get(`/mining-campaigns/${campaignId}/matrix`, { params });
  return response.data;
};
