import { apiClient } from './dashboardService';

// ── AN-001: Executive Dashboard ─────────────────────────────────────────

export const getExecutiveDashboard = async () => {
  const response = await apiClient.get('/analytics/executive');
  return response.data;
};

// ── AN-002: Role Analytics ──────────────────────────────────────────────

export const getRoleAnalytics = async () => {
  const response = await apiClient.get('/analytics/role-analytics');
  return response.data;
};

// ── AN-003: Coverage Reports ────────────────────────────────────────────

export const getCoverageReports = async () => {
  const response = await apiClient.get('/analytics/coverage-reports');
  return response.data;
};
