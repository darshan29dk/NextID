import { apiClient } from './dashboardService';

// ── RC-001: Publish ──────────────────────────────────────────────────────

export const publishRole = async (roleId, changeSummary) => {
  const response = await apiClient.post(`/role-catalog/${roleId}/publish`, {
    change_summary: changeSummary || undefined
  });
  return response.data;
};

// ── RC-001/RC-002/RC-003: Listing ────────────────────────────────────────

export const getCatalogKpi = async () => {
  const response = await apiClient.get('/role-catalog/kpi');
  return response.data;
};

export const getPublishedRoles = async (params) => {
  const response = await apiClient.get('/role-catalog/published', { params });
  return response.data;
};

// ── RC-004: Role Details workspace ───────────────────────────────────────

export const getRoleCatalogDetail = async (roleId) => {
  const response = await apiClient.get(`/role-catalog/${roleId}`);
  return response.data;
};

// ── RC-005: Version History ──────────────────────────────────────────────

export const getVersionHistory = async (roleId) => {
  const response = await apiClient.get(`/role-catalog/${roleId}/versions`);
  return response.data;
};
