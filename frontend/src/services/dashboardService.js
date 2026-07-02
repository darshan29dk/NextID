import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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


