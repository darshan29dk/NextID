import { apiClient } from './dashboardService';

// NOTE: this file previously used the raw `axios` library with a relative
// '/api' path instead of the shared, properly-configured `apiClient`. That
// meant every request here resolved against the frontend's own dev server
// origin (e.g. localhost:5173) instead of the actual backend
// (localhost:8000), so every call silently failed to reach the backend at
// all - explaining "Failed to save approval workflow" with nothing in the
// backend logs. Fixed to use apiClient like every other service in the app.

export const getApprovalWorkflows = async (params = {}) => {
  const response = await apiClient.get('/approval-workflows', { params });
  return response.data;
};

export const getApprovalWorkflowById = async (id) => {
  const response = await apiClient.get(`/approval-workflows/${id}`);
  return response.data;
};

export const createApprovalWorkflow = async (payload) => {
  const response = await apiClient.post('/approval-workflows', payload);
  return response.data;
};

export const updateApprovalWorkflow = async (id, payload) => {
  const response = await apiClient.put(`/approval-workflows/${id}`, payload);
  return response.data;
};

export const deleteApprovalWorkflow = async (id) => {
  const response = await apiClient.delete(`/approval-workflows/${id}`);
  return response.data;
};

export const getWorkflowMetaOptions = async () => {
  const response = await apiClient.get('/approval-workflows/meta/options');
  return response.data;
};
