import { apiClient } from './dashboardService';

export const getCandidateRoles = async (params) => {
  const response = await apiClient.get('/candidate-roles', { params });
  return response.data;
};

export const getCandidateRoleDetail = async (id) => {
  const response = await apiClient.get(`/candidate-roles/${id}`);
  return response.data;
};

export const createCandidateRole = async (data) => {
  const response = await apiClient.post('/candidate-roles', data);
  return response.data;
};

export const updateCandidateRole = async (id, data) => {
  const response = await apiClient.put(`/candidate-roles/${id}`, data);
  return response.data;
};

export const deleteCandidateRole = async (id) => {
  const response = await apiClient.delete(`/candidate-roles/${id}`);
  return response.data;
};

export const getClassifications = async () => {
  const response = await apiClient.get('/classifications');
  return response.data;
};

export const updateRoleClassification = async (id, classification) => {
  const response = await apiClient.put(`/candidate-roles/${id}/classification`, { classification });
  return response.data;
};

export const bulkClassifyRoles = async (roleIds, classification) => {
  const response = await apiClient.put('/candidate-roles/bulk-classification', {
    role_ids: roleIds,
    classification
  });
  return response.data;
};

export const exportCandidateRolesCSV = async (params) => {
  const response = await apiClient.get('/candidate-roles/export/csv', {
    params,
    responseType: 'blob'
  });
  return response.data;
};

export const exportCandidateRolesExcel = async (params) => {
  const response = await apiClient.get('/candidate-roles/export/excel', {
    params,
    responseType: 'blob'
  });
  return response.data;
};

export const previewMerge = async (roleIds) => {
  const response = await apiClient.post('/candidate-roles/merge/preview', { role_ids: roleIds });
  return response.data;
};

export const executeMerge = async (data) => {
  const response = await apiClient.post('/candidate-roles/merge', {
    role_ids: data.roleIds,
    destination_name: data.destinationName,
    description: data.description,
    merge_reason: data.mergeReason
  });
  return response.data;
};

export const undoMerge = async (historyId) => {
  const response = await apiClient.post(`/candidate-roles/merge/${historyId}/undo`);
  return response.data;
};

export const getMergeHistory = async () => {
  const response = await apiClient.get('/candidate-roles/merge-history');
  return response.data;
};

export const previewSplit = async (roleId, splitMethod) => {
  const response = await apiClient.post(`/candidate-roles/${roleId}/split/preview`, { split_method: splitMethod });
  return response.data;
};

export const executeSplit = async (roleId, data) => {
  const response = await apiClient.post(`/candidate-roles/${roleId}/split`, {
    split_method: data.splitMethod,
    splits: data.splits,
    split_reason: data.splitReason
  });
  return response.data;
};

export const undoSplit = async (historyId) => {
  const response = await apiClient.post(`/candidate-roles/split/${historyId}/undo`);
  return response.data;
};

export const getSplitHistory = async () => {
  const response = await apiClient.get('/candidate-roles/split-history');
  return response.data;
};

export const logAction = async (action, details) => {
  const response = await apiClient.post('/candidate-roles/log-action', { action, details });
  return response.data;
};

// ─── RE-005: Role Owner APIs ──────────────────────────────────────────────────

export const searchPlatformUsers = async (query = '', limit = 20) => {
  const response = await apiClient.get('/users/search-for-owner', { params: { q: query, limit } });
  return response.data;
};

export const getCurrentOwners = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/owners`);
  return response.data;
};

export const assignOwner = async (roleId, payload) => {
  const response = await apiClient.post(`/candidate-roles/${roleId}/owners`, payload);
  return response.data;
};

export const removeOwner = async (roleId, ownerType, reason = '') => {
  const response = await apiClient.delete(
    `/candidate-roles/${roleId}/owners/${ownerType}`,
    { params: reason ? { reason } : {} }
  );
  return response.data;
};

export const getOwnerHistory = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/owners/history`);
  return response.data;
};

export const enforceOwnerExpiry = async () => {
  const response = await apiClient.post('/role-owners/enforce-expiry');
  return response.data;
};

// ─── RE-006: Role Preview APIs ────────────────────────────────────────────────

export const getRolePreview = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/preview`);
  return response.data;
};

export const exportRolePreviewJSON = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/preview/export/json`, {
    responseType: 'blob'
  });
  return response.data;
};

export const exportRolePreviewCSV = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/preview/export/csv`, {
    responseType: 'blob'
  });
  return response.data;
};

export const exportRolePreviewExcel = async (roleId) => {
  const response = await apiClient.get(`/candidate-roles/${roleId}/preview/export/excel`, {
    responseType: 'blob'
  });
  return response.data;
};

