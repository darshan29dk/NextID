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

