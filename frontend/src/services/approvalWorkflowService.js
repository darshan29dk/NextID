import axios from 'axios';

const API_BASE = '/api';

export const getApprovalWorkflows = async (params = {}) => {
  const response = await axios.get(`${API_BASE}/approval-workflows`, { params });
  return response.data;
};

export const getApprovalWorkflowById = async (id) => {
  const response = await axios.get(`${API_BASE}/approval-workflows/${id}`);
  return response.data;
};

export const createApprovalWorkflow = async (payload) => {
  const response = await axios.post(`${API_BASE}/approval-workflows`, payload);
  return response.data;
};

export const updateApprovalWorkflow = async (id, payload) => {
  const response = await axios.put(`${API_BASE}/approval-workflows/${id}`, payload);
  return response.data;
};

export const deleteApprovalWorkflow = async (id) => {
  const response = await axios.delete(`${API_BASE}/approval-workflows/${id}`);
  return response.data;
};

export const getWorkflowMetaOptions = async () => {
  const response = await axios.get(`${API_BASE}/approval-workflows/meta/options`);
  return response.data;
};
