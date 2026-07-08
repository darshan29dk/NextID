import { apiClient } from './dashboardService';

export const getConnectors = async (params) => {
  const response = await apiClient.get('/connectors', { params });
  return response.data;
};

export const getConnector = async (id) => {
  const response = await apiClient.get(`/connectors/${id}`);
  return response.data;
};

export const createConnector = async (connectorData) => {
  const response = await apiClient.post('/connectors', connectorData);
  return response.data;
};

export const updateConnector = async (id, connectorData) => {
  const response = await apiClient.put(`/connectors/${id}`, connectorData);
  return response.data;
};

export const deleteConnector = async (id) => {
  const response = await apiClient.delete(`/connectors/${id}`);
  return response.data;
};

export const uploadConnectorFile = async (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/connectors/${id}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const readExcelSheets = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/connectors/read-sheets', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getConnectorLogs = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/logs`);
  return response.data;
};

export const getConnectorFiles = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/files`);
  return response.data;
};

export const getConnectorAuditLogs = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/audit-logs`);
  return response.data;
};

export const testConnector = async (id) => {
  const response = await apiClient.post(`/connectors/${id}/test`);
  return response.data;
};

export const getConnectorTables = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/tables`);
  return response.data;
};

export const getConnectorSchema = async (id, tableName) => {
  const response = await apiClient.get(`/connectors/${id}/schema`, {
    params: tableName ? { table_name: tableName } : {}
  });
  return response.data;
};

export const getConnectorMappings = async (id) => {
  const response = await apiClient.get(`/connectors/${id}/mappings`);
  return response.data;
};

export const saveConnectorMappings = async (id, mappings) => {
  const response = await apiClient.put(`/connectors/${id}/mappings`, mappings);
  return response.data;
};
export const updateConnectorSchedule = async (id, scheduleEnabled, scheduleFrequency) => {
  const params = { schedule_enabled: scheduleEnabled };
  if (scheduleFrequency) params.schedule_frequency = scheduleFrequency;
  const response = await apiClient.put(`/connectors/${id}/schedule`, null, { params });
  return response.data;
};