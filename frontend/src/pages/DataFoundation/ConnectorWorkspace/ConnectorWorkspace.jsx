import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, Plus, Edit, Trash2, RotateCcw, ChevronLeft, ChevronRight, 
  AlertTriangle, X, Database, FileText, FileSpreadsheet, Server, 
  Globe, Info, CheckCircle, XCircle, Copy, Play, Layers, Shield,
  Clock, History, Upload, Trash, Tag, ShieldAlert, BarChart3, Settings2,
  Save, ArrowRightLeft
} from 'lucide-react';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../../components/DashboardCard/DashboardCard';
import { getPageNumbers } from '../../../utils/pagination';
import { 
  getConnectors, createConnector, updateConnector, deleteConnector, 
  cloneConnector, testConnectorConnection, bulkDeleteConnectors, 
  bulkUpdateConnectorsStatus, uploadConnectorFile, getConnectorLogs, getConnectorFiles,
  getIdentityAttributes, getAccountAttributes, getEntitlementAttributes, getRoleAttributes
} from '../../../services/dashboardService';
import {
  getConnectorTables,
  getConnectorSchema,
  getConnectorMappings,
  saveConnectorMappings,
  updateConnectorSchedule
} from '../../../services/connectorService';
import './ConnectorWorkspace.css';

const CONNECTOR_TYPES = [
  { id: 'CSV', label: 'CSV File', desc: 'Flat-file integration using comma or custom-delimited formatting', icon: FileText, color: 'var(--success)' },
  { id: 'Excel', label: 'Excel Spreadsheet', desc: 'Read structured sheets from XLSX files', icon: FileSpreadsheet, color: 'var(--info)' },
  { id: 'Database', label: 'Relational Database', desc: 'Integrate directly with MySQL, PostgreSQL, Oracle, or SQL Server', icon: Database, color: 'var(--primary)' }
];

const ENVIRONMENTS = ["Production", "Staging", "Development"];
const AUTH_TYPES = ["Basic", "OAuth2", "API Key", "IAM Role", "None"];
const MAPPING_MODULES = ['Identity', 'Account', 'Entitlement', 'Role'];

const INITIAL_FORM_STATE = {
  connector_name: '',
  connector_type: 'CSV',
  description: '',
  environment: 'Development',
  auth_type: 'Basic',
  tags: '',
  database_type: 'MySQL',
  host: '',
  port: '',
  database_name: '',
  username: '',
  password: '',
  ssl_enabled: false,
  connection_timeout: 30,
  csv_delimiter: ',',
  csv_encoding: 'UTF-8',
  excel_sheet_name: 'Sheet1',
  file_path: ''
};

const ConnectorWorkspace = () => {
  const [connectors, setConnectors] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  const [selectedConnector, setSelectedConnector] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('config');
  const [connectorLogs, setConnectorLogs] = useState([]);
  const [connectorFiles, setConnectorFiles] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef(null);

  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(null);
  const [dbTables, setDbTables] = useState([]);
  const [dbTablesLoading, setDbTablesLoading] = useState(false);
  const [selectedTableName, setSelectedTableName] = useState('');

  const [mappingRows, setMappingRows] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingsSaving, setMappingsSaving] = useState(false);
  const [mappingsSaved, setMappingsSaved] = useState(false);
  const [mappingsError, setMappingsError] = useState(null);
  const [attributeOptions, setAttributeOptions] = useState({
    Identity: [], Account: [], Entitlement: [], Role: []
  });

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState('Daily');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  const [stats, setStats] = useState({
    total: 0,
    csv: 0,
    excel: 0,
    db: 0,
    connected: 0,
    disconnected: 0,
    failed: 0
  });

  const fetchConnectorsData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const params = {
        page,
        limit,
        search: search.trim() || undefined,
        connector_type: typeFilter || undefined,
        status: statusFilter || undefined,
        environment: envFilter || undefined
      };

      const [listResult, kpiResult] = await Promise.allSettled([
        getConnectors(params),
        getConnectors({ limit: 1000 })
      ]);

      if (listResult.status === 'fulfilled') {
        const response = listResult.value;
        setConnectors(response.connectors || []);
        setTotal(response.total);
        setTotalPages(response.total_pages);
      }

      if (kpiResult.status === 'fulfilled') {
        const kpiRes = kpiResult.value;
        const kpis = kpiRes.connectors || [];

        setStats({
          total: kpiRes.total,
          csv: kpis.filter(c => c.connector_type === 'CSV').length,
          excel: kpis.filter(c => c.connector_type === 'Excel').length,
          db: kpis.filter(c => c.connector_type === 'Database').length,
          connected: kpis.filter(c => c.status === 'Connected').length,
          disconnected: kpis.filter(c => c.status === 'Configured' || c.status === 'Draft' || c.status === 'Disabled').length,
          failed: kpis.filter(c => c.status === 'Failed').length
        });
      }

      if (listResult.status === 'rejected') {
        throw listResult.reason;
      }

    } catch (err) {
      console.error("Failed to load connectors:", err);
      setErrorMsg("Failed to load connectors. Check database connection.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, typeFilter, statusFilter, envFilter]);

  useEffect(() => {
    fetchConnectorsData();
  }, [fetchConnectorsData]);

  useEffect(() => {
    const delay = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(delay);
  }, [searchInput]);

  const handleSelectConnector = async (conn) => {
    setSelectedConnector(conn);
    setDrawerOpen(true);
    setDrawerTab('config');
    setSchemaFields([]);
    setSchemaError(null);
    setDbTables([]);
    setSelectedTableName('');
    setMappingRows([]);
    setMappingsError(null);
    setMappingsSaved(false);
    setScheduleEnabled(!!conn.schedule_enabled);
    setScheduleFrequency(conn.schedule_frequency || 'Daily');
    setScheduleSaved(false);
    setScheduleError(null);
    loadDrawerDetails(conn.id);
  };

  const loadDrawerDetails = async (id) => {
    try {
      const [logs, files] = await Promise.all([
        getConnectorLogs(id),
        getConnectorFiles(id)
      ]);
      setConnectorLogs(logs || []);
      setConnectorFiles(files || []);
    } catch (err) {
      console.error("Failed to load drawer details:", err);
    }
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setEnvFilter('');
    setPage(1);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateWizard = () => {
    const errors = {};
    if (wizardStep === 2) {
      if (!formData.connector_name || !formData.connector_name.trim()) {
        errors.connector_name = "Connector Name is required.";
      }
    }
    if (wizardStep === 3) {
      if (formData.connector_type === 'Database') {
        if (!formData.host || !formData.host.trim()) errors.host = "Database host is required.";
        if (!formData.port) errors.port = "Port is required.";
        if (!formData.database_name || !formData.database_name.trim()) errors.database_name = "Database name is required.";
        if (!formData.username || !formData.username.trim()) errors.username = "Username is required.";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateWizard()) {
      setWizardStep(prev => prev + 1);
    }
  };

  const handlePrevStep = () => {
    setWizardStep(prev => Math.max(1, prev - 1));
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_STATE);
    setWizardStep(1);
    setFormErrors({});
    setShowWizard(true);
  };

  const handleOpenEditModal = (conn, e) => {
    e.stopPropagation();
    setEditingId(conn.id);
    setFormData({
      connector_name: conn.connector_name,
      connector_type: conn.connector_type,
      description: conn.description || '',
      environment: conn.environment,
      auth_type: conn.auth_type,
      tags: conn.tags || '',
      database_type: conn.database_type || 'MySQL',
      host: conn.host || '',
      port: conn.port || '',
      database_name: conn.database_name || '',
      username: conn.username || '',
      password: '',
      ssl_enabled: conn.ssl_enabled || false,
      connection_timeout: conn.connection_timeout || 30,
      csv_delimiter: conn.csv_delimiter || ',',
      csv_encoding: conn.csv_encoding || 'UTF-8',
      excel_sheet_name: conn.excel_sheet_name || 'Sheet1',
      file_path: conn.file_path || ''
    });
    setWizardStep(2);
    setFormErrors({});
    setShowWizard(true);
  };

  const handleSaveConnector = async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      
      const payload = { ...formData };
      if (payload.port) payload.port = parseInt(payload.port);
      if (payload.connection_timeout) payload.connection_timeout = parseInt(payload.connection_timeout);

      if (editingId) {
        if (!payload.password) delete payload.password;
        await updateConnector(editingId, payload);
        showBannerSuccess(`Connector '${formData.connector_name}' updated successfully.`);
      } else {
        await createConnector(payload);
        showBannerSuccess(`Connector '${formData.connector_name}' created successfully.`);
      }

      setShowWizard(false);
      fetchConnectorsData();
    } catch (err) {
      console.error("Error saving connector:", err);
      const rawDetail = err.response?.data?.detail;
      let detail = "Error saving connector configuration.";
      if (typeof rawDetail === 'string') {
        detail = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        detail = rawDetail.map((d) => (typeof d === 'object' && d.msg ? d.msg : String(d))).join('; ');
      } else if (typeof rawDetail === 'object' && rawDetail !== null) {
        detail = rawDetail.msg || rawDetail.message || JSON.stringify(rawDetail);
      } else if (err.message) {
        detail = err.message;
      }
      setFormErrors({ banner: detail });
    } finally {
      setSubmitting(false);
    }
  };

  const showBannerSuccess = (msg) => {
    setSuccessBanner(msg);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  const handleDeleteConnector = async (id, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete connector '${name}'?`)) return;

    try {
      await deleteConnector(id);
      showBannerSuccess(`Connector '${name}' soft-deleted.`);
      if (selectedConnector?.id === id) {
        setDrawerOpen(false);
      }
      fetchConnectorsData();
    } catch (err) {
      console.error("Failed to delete connector:", err);
      setErrorMsg("Failed to delete connector.");
    }
  };

  const handleCloneConnector = async (id, name, e) => {
    e.stopPropagation();
    try {
      await cloneConnector(id);
      showBannerSuccess(`Cloned connector configuration from '${name}'.`);
      fetchConnectorsData();
    } catch (err) {
      console.error("Failed to clone connector:", err);
      setErrorMsg("Failed to clone connector.");
    }
  };

  const handleTestConnection = async (id, name, e) => {
    e.stopPropagation();
    try {
      showBannerSuccess(`Testing connection for '${name}'...`);
      const res = await testConnectorConnection(id);
      if (res.success) {
        showBannerSuccess(`Connection to '${name}' tested successfully: ${res.message}`);
      } else {
        setErrorMsg(`Connection to '${name}' failed: ${res.message}`);
      }
      fetchConnectorsData();
      if (selectedConnector?.id === id) {
        loadDrawerDetails(id);
      }
    } catch (err) {
      console.error("Connection test error:", err);
      setErrorMsg(`Failed to test connection for '${name}'.`);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(connectors.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected connectors?`)) return;
    try {
      await bulkDeleteConnectors(selectedIds);
      showBannerSuccess(`Bulk deleted ${selectedIds.length} connectors.`);
      setSelectedIds([]);
      fetchConnectorsData();
    } catch (err) {
      console.error("Bulk delete failed:", err);
      setErrorMsg("Bulk delete operation failed.");
    }
  };

  const handleBulkStatusChange = async (status) => {
    try {
      await bulkUpdateConnectorsStatus(selectedIds, status);
      showBannerSuccess(`Bulk status updated for ${selectedIds.length} connectors to ${status}.`);
      setSelectedIds([]);
      fetchConnectorsData();
    } catch (err) {
      console.error("Bulk status update failed:", err);
      setErrorMsg("Bulk status update failed.");
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile || !selectedConnector) return;
    try {
      setUploadLoading(true);
      await uploadConnectorFile(selectedConnector.id, uploadFile);
      showBannerSuccess(`Config file '${uploadFile.name}' uploaded successfully.`);
      setUploadFile(null);
      loadDrawerDetails(selectedConnector.id);
      fetchConnectorsData();
    } catch (err) {
      console.error("File upload failed:", err);
      setErrorMsg("Failed to upload connector file.");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleLoadDbTables = async () => {
    if (!selectedConnector) return;
    try {
      setDbTablesLoading(true);
      setSchemaError(null);
      const res = await getConnectorTables(selectedConnector.id);
      setDbTables(res.tables || []);
    } catch (err) {
      console.error('Failed to load tables:', err);
      setSchemaError(err.response?.data?.detail || 'Failed to load tables from database.');
    } finally {
      setDbTablesLoading(false);
    }
  };

  const handleDiscoverSchema = async () => {
    if (!selectedConnector) return;
    try {
      setSchemaLoading(true);
      setSchemaError(null);
      setSchemaFields([]);
      const res = await getConnectorSchema(selectedConnector.id, selectedTableName || undefined);
      setSchemaFields(res.fields || []);
      setMappingRows([]);
    } catch (err) {
      console.error('Schema discovery failed:', err);
      setSchemaError(err.response?.data?.detail || 'Schema discovery failed unexpectedly.');
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleOpenMappingTab = async () => {
    setDrawerTab('mapping');
    if (!selectedConnector) return;
    if (schemaFields.length === 0) return;
    await loadMappingData();
  };

  const loadMappingData = async () => {
    try {
      setMappingsLoading(true);
      setMappingsError(null);
      setMappingsSaved(false);
      const [existingMappings, identityRes, accountRes, entitlementRes, roleRes] = await Promise.all([
        getConnectorMappings(selectedConnector.id),
        getIdentityAttributes({ limit: 1000 }),
        getAccountAttributes({ limit: 1000 }),
        getEntitlementAttributes({ limit: 1000 }),
        getRoleAttributes({ limit: 1000 })
      ]);
      setAttributeOptions({
        Identity: identityRes.attributes || [],
        Account: accountRes.attributes || [],
        Entitlement: entitlementRes.attributes || [],
        Role: roleRes.attributes || []
      });
      const rows = schemaFields.map((f) => {
        const existing = existingMappings.find((m) => m.source_field === f.field_name);
        return {
          source_field: f.field_name,
          target_module: existing ? existing.target_module : '',
          target_attribute_name: existing ? existing.target_attribute_name : ''
        };
      });
      setMappingRows(rows);
    } catch (err) {
      console.error('Failed to load mapping data:', err);
      setMappingsError(err.response?.data?.detail || 'Failed to load attribute mapping data.');
    } finally {
      setMappingsLoading(false);
    }
  };

  const handleMappingModuleChange = (sourceField, newModule) => {
    setMappingRows((prev) =>
      prev.map((row) => row.source_field === sourceField ? { ...row, target_module: newModule, target_attribute_name: '' } : row)
    );
    setMappingsSaved(false);
  };

  const handleMappingAttributeChange = (sourceField, newAttrName) => {
    setMappingRows((prev) =>
      prev.map((row) => row.source_field === sourceField ? { ...row, target_attribute_name: newAttrName } : row)
    );
    setMappingsSaved(false);
  };

  const handleSaveSchedule = async () => {
    if (!selectedConnector) return;
    try {
      setScheduleSaving(true);
      setScheduleError(null);
      const result = await updateConnectorSchedule(
        selectedConnector.id,
        scheduleEnabled,
        scheduleEnabled ? scheduleFrequency : null
      );
      setScheduleSaved(true);
      setSelectedConnector((prev) => ({
        ...prev,
        schedule_enabled: result.schedule_enabled,
        schedule_frequency: result.schedule_frequency,
        next_scheduled_run: result.next_scheduled_run
      }));
      fetchConnectorsData();
    } catch (err) {
      console.error('Failed to save schedule:', err);
      setScheduleError(err.response?.data?.detail || 'Failed to save schedule settings.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSaveMappings = async () => {
    if (!selectedConnector) return;
    try {
      setMappingsSaving(true);
      setMappingsError(null);
      const payload = mappingRows
        .filter((r) => r.target_module && r.target_attribute_name)
        .map((r) => ({
          connector_id: selectedConnector.id,
          source_field: r.source_field,
          target_module: r.target_module,
          target_attribute_name: r.target_attribute_name
        }));
      await saveConnectorMappings(selectedConnector.id, payload);
      setMappingsSaved(true);
    } catch (err) {
      console.error('Failed to save mappings:', err);
      setMappingsError(err.response?.data?.detail || 'Failed to save attribute mappings.');
    } finally {
      setMappingsSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = status.toLowerCase();
    let badgeClass = "badge-draft";
    if (s === "connected") badgeClass = "badge-connected";
    if (s === "configured") badgeClass = "badge-configured";
    if (s === "failed") badgeClass = "badge-failed";
    if (s === "disabled") badgeClass = "badge-disabled";
    return <span className={`status-pill ${badgeClass}`}>{status}</span>;
  };

  const getHealthIcon = (health) => {
    if (health === "Healthy") return <CheckCircle size={15} color="var(--success)" title="Healthy" />;
    if (health === "Degraded") return <AlertTriangle size={15} color="var(--warning)" title="Degraded" />;
    if (health === "Unhealthy") return <XCircle size={15} color="var(--danger)" title="Unhealthy" />;
    return <Info size={15} color="var(--text-muted)" title="Unknown Health Status" />;
  };

  return (
    <div className="connector-workspace-container">
      <Breadcrumb items={[
        { label: 'Data Foundation', path: '/data-foundation' },
        { label: 'Data Sources', path: '#' },
        { label: 'Connector Workspace', path: '/data-foundation/sources/workspace', active: true }
      ]} />

      <div className="workspace-header">
        <div>
          <h1 className="workspace-title">Connector Workspace</h1>
          <p className="workspace-subtitle">Enterprise Data Source Integration Framework</p>
        </div>
      </div>

      <div className="kpi-grid">
        <DashboardCard title="Total Connectors" value={stats.total} icon={Server} trend="Connected & Draft states" />
        <DashboardCard title="Connected Sources" value={stats.connected} icon={CheckCircle} status="success" />
        <DashboardCard title="Disconnected / Draft" value={stats.disconnected} icon={Clock} status="warning" />
        <DashboardCard title="Failed Integrations" value={stats.failed} icon={ShieldAlert} status="danger" />
      </div>

      {successBanner && (
        <div className="alert-banner alert-success">
          <CheckCircle size={18} />
          <span>{successBanner}</span>
        </div>
      )}
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <XCircle size={18} />
          <span>{errorMsg}</span>
          <button className="close-alert-btn" onClick={() => setErrorMsg(null)}><X size={14} /></button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="bulk-actions-bar">
          <div className="bulk-actions-info">
            <span className="selected-count">{selectedIds.length}</span> selected items
          </div>
          <div className="bulk-actions-buttons">
            <button className="btn-bulk btn-bulk-enable" onClick={() => handleBulkStatusChange('Configured')}>
              <CheckCircle size={14} /> Enable
            </button>
            <button className="btn-bulk btn-bulk-disable" onClick={() => handleBulkStatusChange('Disabled')}>
              <XCircle size={14} /> Disable
            </button>
            <button className="btn-bulk btn-bulk-delete" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
          <button className="btn-bulk-cancel" onClick={() => setSelectedIds([])}><X size={16} /></button>
        </div>
      )}

      <div className="toolbar-card">
        <div className="search-wrapper">
          <Search className="search-icon" size={16} />
          <input 
            type="text" 
            placeholder="Search by name, description, tags..." 
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-input"
          />
          {searchInput && (
            <button className="clear-search-btn" onClick={() => setSearchInput('')}><X size={14} /></button>
          )}
        </div>

        <div className="filters-group">
          <select 
            value={typeFilter} 
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="CSV">CSV Connector</option>
            <option value="Excel">Excel Connector</option>
            <option value="Database">Database Connector</option>
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Configured">Configured</option>
            <option value="Connected">Connected</option>
            <option value="Failed">Failed</option>
            <option value="Disabled">Disabled</option>
          </select>

          <select 
            value={envFilter} 
            onChange={(e) => { setEnvFilter(e.target.value); setPage(1); }}
            className="filter-select"
          >
            <option value="">All Environments</option>
            {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
          </select>

          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <button className="btn-primary btn-add-connector" onClick={handleOpenAddModal}>
          <Plus size={16} /> Add Connector
        </button>
      </div>

      <div className="table-card">
        {loading && connectors.length === 0 ? (
          <div className="workspace-loader">
            <Server className="loading-spinner" size={24} />
            <span>Loading active connectors...</span>
          </div>
        ) : connectors.length === 0 ? (
          <div className="empty-workspace">
            <Server size={42} className="empty-icon" />
            <h3>No Connectors Configured</h3>
            <p>Get started by creating a CSV, Excel, or database connection profile.</p>
            <button className="btn-primary" onClick={handleOpenAddModal}><Plus size={16} /> Create Connector</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="workspace-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === connectors.length && connectors.length > 0} 
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Environment</th>
                  <th>Version</th>
                  <th>Last Tested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((conn) => (
                  <tr 
                    key={conn.id} 
                    onClick={() => handleSelectConnector(conn)}
                    className={selectedConnector?.id === conn.id ? 'row-selected' : ''}
                  >
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(conn.id)} 
                        onChange={(e) => handleSelectRow(conn.id, e)}
                      />
                    </td>
                    <td>
                      <div className="cell-name-wrapper">
                        <span className="connector-row-title">{conn.connector_name}</span>
                        {conn.tags && (
                          <div className="row-tags-wrapper">
                            {conn.tags.split(',').map((tag, idx) => (
                              <span key={idx} className="badge-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="type-indicator">
                        {conn.connector_type === 'Database' && <Database size={14} className="type-icon-db" />}
                        {conn.connector_type === 'CSV' && <FileText size={14} className="type-icon-csv" />}
                        {conn.connector_type === 'Excel' && <FileSpreadsheet size={14} className="type-icon-excel" />}
                        {conn.connector_type}
                      </span>
                    </td>
                    <td>{getStatusBadge(conn.status)}</td>
                    <td>
                      <div className="health-cell">
                        {getHealthIcon(conn.health_status)}
                        <span className="health-label">{conn.health_status}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`env-pill env-${conn.environment.toLowerCase()}`}>
                        {conn.environment}
                      </span>
                    </td>
                    <td>v{conn.version}.0</td>
                    <td>
                      <span className="timestamp-text">
                        {conn.last_tested ? new Date(conn.last_tested + 'Z').toLocaleString('en-US') : 'Never'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="actions-cell">
                        <button className="btn-action btn-test" onClick={(e) => handleTestConnection(conn.id, conn.connector_name, e)} title="Test Connection">
                          <Play size={14} />
                        </button>
                        <button className="btn-action btn-clone" onClick={(e) => handleCloneConnector(conn.id, conn.connector_name, e)} title="Clone Connector">
                          <Copy size={14} />
                        </button>
                        <button className="btn-action btn-edit" onClick={(e) => handleOpenEditModal(conn, e)} title="Edit Configuration">
                          <Edit size={14} />
                        </button>
                        <button className="btn-action btn-delete" onClick={(e) => handleDeleteConnector(conn.id, conn.connector_name, e)} title="Delete Connector">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination-wrapper">
            <span className="pagination-info">Showing {connectors.length} of {total} connectors</span>
            <div className="pagination-buttons">
              <button 
                className="btn-page" 
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              {getPageNumbers(page, totalPages).map((pNum, idx) => (
                pNum === '...' ? (
                  <span key={`dots-${idx}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={pNum}
                    className={`btn-page-number ${page === pNum ? 'active' : ''}`}
                    onClick={() => setPage(pNum)}
                  >
                    {pNum}
                  </button>
                )
              ))}
              <button 
                className="btn-page" 
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showWizard && (
        <div className="wizard-modal-overlay">
          <div className="wizard-modal-box">
            <div className="wizard-modal-header">
              <h3>{editingId ? 'Edit Connector' : 'New Connector Configuration'}</h3>
              <button className="close-wizard-btn" onClick={() => setShowWizard(false)}><X size={18} /></button>
            </div>

            <div className="wizard-steps-indicator">
              {!editingId && (
                <div className={`step-node ${wizardStep === 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>
                  <span className="step-num">1</span>
                  <span className="step-label">Select Type</span>
                </div>
              )}
              <div className={`step-node ${wizardStep === 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}>
                <span className="step-num">{editingId ? '1' : '2'}</span>
                <span className="step-label">Basic Info</span>
              </div>
              <div className={`step-node ${wizardStep === 3 ? 'active' : ''} ${wizardStep > 3 ? 'completed' : ''}`}>
                <span className="step-num">{editingId ? '2' : '3'}</span>
                <span className="step-label">Configuration</span>
              </div>
              <div className={`step-node ${wizardStep === 4 ? 'active' : ''}`}>
                <span className="step-num">{editingId ? '3' : '4'}</span>
                <span className="step-label">Review & Save</span>
              </div>
            </div>

            {formErrors.banner && (
              <div className="wizard-banner-error">
                <AlertTriangle size={15} />
                <span>{formErrors.banner}</span>
              </div>
            )}

            <div className="wizard-modal-body">
              {wizardStep === 1 && !editingId && (
                <div className="step-type-grid">
                  {CONNECTOR_TYPES.map(type => {
                    const Icon = type.icon;
                    return (
                      <div 
                        key={type.id} 
                        className={`type-card ${formData.connector_type === type.id ? 'type-card-selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, connector_type: type.id }))}
                      >
                        <div className="type-card-icon-wrapper" style={{ backgroundColor: type.color + '15', color: type.color }}>
                          <Icon size={24} />
                        </div>
                        <h4>{type.label}</h4>
                        <p>{type.desc}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {wizardStep === 2 && (
                <div className="form-step-container">
                  <div className="form-row">
                    <label>Connector Name <span className="req-star">*</span></label>
                    <input 
                      type="text" 
                      name="connector_name"
                      placeholder="e.g. HR Active Directory sync"
                      value={formData.connector_name}
                      onChange={handleInputChange}
                      className={formErrors.connector_name ? 'input-error' : ''}
                    />
                    {formErrors.connector_name && <span className="field-error-text">{formErrors.connector_name}</span>}
                  </div>

                  <div className="form-row">
                    <label>Description</label>
                    <textarea 
                      name="description" 
                      placeholder="Provide context regarding the data scope or application details."
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={3}
                    />
                  </div>

                  <div className="form-columns-2">
                    <div className="form-row">
                      <label>Target Environment</label>
                      <select name="environment" value={formData.environment} onChange={handleInputChange}>
                        {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
                      </select>
                    </div>

                    <div className="form-row">
                      <label>Authentication Type</label>
                      <select name="auth_type" value={formData.auth_type} onChange={handleInputChange}>
                        {AUTH_TYPES.map(auth => <option key={auth} value={auth}>{auth}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <label>Tags (Comma separated)</label>
                    <div className="tags-input-wrapper">
                      <Tag size={14} className="tag-input-icon" />
                      <input 
                        type="text" 
                        name="tags"
                        placeholder="HR, Finance, DB, ActiveDirectory"
                        value={formData.tags}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="form-step-container">
                  {formData.connector_type === 'CSV' && (
                    <div className="csv-config-box">
                      <h4 className="config-section-title"><FileText size={16} /> CSV Delimiter Settings</h4>
                      <div className="form-columns-2">
                        <div className="form-row">
                          <label>Delimiter</label>
                          <select name="csv_delimiter" value={formData.csv_delimiter} onChange={handleInputChange}>
                            <option value=",">Comma (,)</option>
                            <option value=";">Semicolon (;)</option>
                            <option value="&#9;">Tab (\t)</option>
                            <option value="|">Pipe (|)</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label>Character Encoding</label>
                          <select name="csv_encoding" value={formData.csv_encoding} onChange={handleInputChange}>
                            <option value="UTF-8">UTF-8</option>
                            <option value="ASCII">ASCII</option>
                            <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
                            <option value="UTF-16">UTF-16</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.connector_type === 'Excel' && (
                    <div className="excel-config-box">
                      <h4 className="config-section-title"><FileSpreadsheet size={16} /> Excel Document Settings</h4>
                      <div className="form-row">
                        <label>Default Worksheet Name</label>
                        <input 
                          type="text" 
                          name="excel_sheet_name"
                          placeholder="Sheet1"
                          value={formData.excel_sheet_name}
                          onChange={handleInputChange}
                        />
                      </div>
                    </div>
                  )}

                  {formData.connector_type === 'Database' && (
                    <div className="db-config-box">
                      <h4 className="config-section-title"><Database size={16} /> Database Authentication Config</h4>
                      
                      <div className="form-columns-2">
                        <div className="form-row">
                          <label>Database Server Type</label>
                          <select name="database_type" value={formData.database_type} onChange={handleInputChange}>
                            <option value="MySQL">MySQL Server</option>
                            <option value="PostgreSQL">PostgreSQL</option>
                            <option value="SQL Server">Microsoft SQL Server</option>
                            <option value="Oracle">Oracle Database</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label>SSL Security Option</label>
                          <label className="checkbox-switch">
                            <input 
                              type="checkbox" 
                              name="ssl_enabled" 
                              checked={formData.ssl_enabled}
                              onChange={handleInputChange}
                            />
                            <span className="switch-slider"></span>
                            <span className="switch-label">Enable Database SSL</span>
                          </label>
                        </div>
                      </div>

                      <div className="form-columns-3">
                        <div className="form-row-2">
                          <label>Hostname / Server IP <span className="req-star">*</span></label>
                          <input 
                            type="text" 
                            name="host" 
                            placeholder="e.g. 192.168.1.100" 
                            value={formData.host}
                            onChange={handleInputChange}
                            className={formErrors.host ? 'input-error' : ''}
                          />
                        </div>
                        <div className="form-row">
                          <label>Port <span className="req-star">*</span></label>
                          <input 
                            type="number" 
                            name="port" 
                            placeholder="3306" 
                            value={formData.port}
                            onChange={handleInputChange}
                            className={formErrors.port ? 'input-error' : ''}
                          />
                        </div>
                      </div>

                      <div className="form-columns-2">
                        <div className="form-row">
                          <label>Database Schema/Name <span className="req-star">*</span></label>
                          <input 
                            type="text" 
                            name="database_name" 
                            placeholder="rAnalyzer_production" 
                            value={formData.database_name}
                            onChange={handleInputChange}
                            className={formErrors.database_name ? 'input-error' : ''}
                          />
                        </div>
                        <div className="form-row">
                          <label>Connection Timeout (Seconds)</label>
                          <input 
                            type="number" 
                            name="connection_timeout" 
                            value={formData.connection_timeout}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>

                      <div className="form-columns-2">
                        <div className="form-row">
                          <label>Username <span className="req-star">*</span></label>
                          <input 
                            type="text" 
                            name="username" 
                            placeholder="db_read_only" 
                            value={formData.username}
                            onChange={handleInputChange}
                            className={formErrors.username ? 'input-error' : ''}
                          />
                        </div>
                        <div className="form-row">
                          <label>Password {editingId && <span className="password-update-note">(Leave blank to keep current)</span>}</label>
                          <input 
                            type="password" 
                            name="password" 
                            placeholder="••••••••••••••" 
                            value={formData.password}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 4 && (
                <div className="wizard-summary-container">
                  <div className="summary-left-pane">
                    <h4 className="summary-header">Configuration Summary</h4>
                    <div className="summary-details-grid">
                      <div className="summary-item">
                        <span className="summary-label">Connector Name</span>
                        <span className="summary-val">{formData.connector_name}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Connector Type</span>
                        <span className="summary-val">{formData.connector_type}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">Environment</span>
                        <span className="summary-val">{formData.environment}</span>
                      </div>
                      {formData.tags && (
                        <div className="summary-item">
                          <span className="summary-label">Tags</span>
                          <span className="summary-val">{formData.tags}</span>
                        </div>
                      )}

                      {formData.connector_type === 'CSV' && (
                        <>
                          <div className="summary-item">
                            <span className="summary-label">Delimiter</span>
                            <span className="summary-val">"{formData.csv_delimiter}"</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Encoding</span>
                            <span className="summary-val">{formData.csv_encoding}</span>
                          </div>
                        </>
                      )}

                      {formData.connector_type === 'Excel' && (
                        <div className="summary-item">
                          <span className="summary-label">Sheet Name</span>
                          <span className="summary-val">{formData.excel_sheet_name}</span>
                        </div>
                      )}

                      {formData.connector_type === 'Database' && (
                        <>
                          <div className="summary-item">
                            <span className="summary-label">Server Host</span>
                            <span className="summary-val">{formData.host}:{formData.port}</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Database Name</span>
                            <span className="summary-val">{formData.database_name}</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Authentication Type</span>
                            <span className="summary-val">{formData.auth_type}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="summary-right-pane">
                    <h4 className="summary-header">Validation Checklist</h4>
                    <ul className="wizard-checklist">
                      <li className="checklist-item ok">
                        <CheckCircle size={15} /> Name verification check completed
                      </li>
                      <li className="checklist-item ok">
                        <CheckCircle size={15} /> Type configuration successfully resolved
                      </li>
                      {formData.connector_type === 'Database' ? (
                        <li className="checklist-item warning">
                          <AlertTriangle size={15} /> Password credentials will be stored encrypted
                        </li>
                      ) : (
                        <li className="checklist-item warning">
                          <AlertTriangle size={15} /> Source configuration files must be uploaded after creation
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="wizard-modal-footer">
              <button 
                className="btn-wizard-sec" 
                onClick={handlePrevStep}
                disabled={wizardStep === 1 || (editingId && wizardStep === 2)}
              >
                Back
              </button>
              {wizardStep < 4 ? (
                <button className="btn-wizard-prim" onClick={handleNextStep}>
                  Next
                </button>
              ) : (
                <button className="btn-primary" onClick={handleSaveConnector} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Configuration'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`detail-drawer ${drawerOpen ? 'drawer-opened' : ''}`}>
        {selectedConnector && (
          <div className="drawer-inner">
            <div className="drawer-header">
              <div className="drawer-title-box">
                <span className="drawer-type-badge">{selectedConnector.connector_type} Connector</span>
                <h3>{selectedConnector.connector_name}</h3>
                <span className="drawer-status-pill">{getStatusBadge(selectedConnector.status)}</span>
              </div>
              <button className="close-drawer-btn" onClick={() => setDrawerOpen(false)}><X size={20} /></button>
            </div>

            <div className="drawer-tabs" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
              <button className={`drawer-tab-btn ${drawerTab === 'config' ? 'active' : ''}`} onClick={() => setDrawerTab('config')}>
                <Settings2 size={14} /> Config
              </button>
              <button className={`drawer-tab-btn ${drawerTab === 'logs' ? 'active' : ''}`} onClick={() => setDrawerTab('logs')}>
                <History size={14} /> Activity logs
              </button>
              <button className={`drawer-tab-btn ${drawerTab === 'files' ? 'active' : ''}`} onClick={() => setDrawerTab('files')}>
                <Upload size={14} /> Files history
              </button>
              <button className={`drawer-tab-btn ${drawerTab === 'schema' ? 'active' : ''}`} onClick={() => setDrawerTab('schema')}>
                <Layers size={14} /> Schema
              </button>
              <button className={`drawer-tab-btn ${drawerTab === 'mapping' ? 'active' : ''}`} onClick={handleOpenMappingTab}>
                <ArrowRightLeft size={14} /> Mapping
              </button>
              <button className={`drawer-tab-btn ${drawerTab === 'schedule' ? 'active' : ''}`} onClick={() => setDrawerTab('schedule')}>
                <Clock size={14} /> Schedule
              </button>
            </div>

            <div className="drawer-body">
              {drawerTab === 'config' && (
                <div className="drawer-config-panel">
                  <div className="config-grid">
                    <div className="config-meta-item">
                      <span className="meta-label">Environment</span>
                      <span className={`env-pill env-${selectedConnector.environment.toLowerCase()}`}>{selectedConnector.environment}</span>
                    </div>
                    <div className="config-meta-item">
                      <span className="meta-label">Health Status</span>
                      <div className="health-cell">
                        {getHealthIcon(selectedConnector.health_status)}
                        <span>{selectedConnector.health_status}</span>
                      </div>
                    </div>
                    <div className="config-meta-item">
                      <span className="meta-label">Version</span>
                      <span>v{selectedConnector.version}.0</span>
                    </div>
                    <div className="config-meta-item">
                      <span className="meta-label">Authentication Mode</span>
                      <span>{selectedConnector.auth_type}</span>
                    </div>
                  </div>

                  <hr className="drawer-divider" />

                  <h4 className="drawer-section-title">Integration details</h4>
                  <table className="drawer-config-details-table">
                    <tbody>
                      <tr>
                        <td>Created By</td>
                        <td>{selectedConnector.created_by}</td>
                      </tr>
                      <tr>
                        <td>Created Date</td>
                        <td>{new Date(selectedConnector.created_at + 'Z').toLocaleString('en-US')}</td>
                      </tr>
                      <tr>
                        <td>Modified By</td>
                        <td>{selectedConnector.modified_by}</td>
                      </tr>
                      <tr>
                        <td>Last Sync</td>
                        <td>{selectedConnector.last_sync ? new Date(selectedConnector.last_sync + 'Z').toLocaleString('en-US') : 'Never'}</td>
                      </tr>
                    </tbody>
                  </table>

                  <hr className="drawer-divider" />

                  <h4 className="drawer-section-title">Connector metrics</h4>
                  <div className="metrics-grid">
                    <div className="metric-box">
                      <span className="metric-val text-success">{selectedConnector.success_count}</span>
                      <span className="metric-lbl">Successful Syncs</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-val text-danger">{selectedConnector.failure_count}</span>
                      <span className="metric-lbl">Failed Syncs</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-val">{selectedConnector.last_sync_duration ? selectedConnector.last_sync_duration + 'ms' : '—'}</span>
                      <span className="metric-lbl">Last Latency</span>
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === 'logs' && (
                <div className="drawer-logs-panel">
                  {connectorLogs.length === 0 ? (
                    <div className="empty-logs">
                      <History size={24} className="text-muted" />
                      <span>No activity logs captured for this connector.</span>
                    </div>
                  ) : (
                    <div className="activity-timeline-vertical">
                      {connectorLogs.map((log) => (
                        <div key={log.id} className="timeline-node">
                          <div className={`timeline-indicator ${log.status === 'Success' ? 'indicator-success' : 'indicator-failed'}`}></div>
                          <div className="timeline-content">
                            <div className="timeline-meta">
                              <span className="timeline-action">{log.action}</span>
                              <span className="timeline-time">{new Date(log.timestamp + 'Z').toLocaleTimeString('en-US')}</span>
                            </div>
                            <p className="timeline-details">{log.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'files' && (
                <div className="drawer-files-panel">
                  {(selectedConnector.connector_type === 'CSV' || selectedConnector.connector_type === 'Excel') && (
                    <div className="upload-dropzone">
                      <Upload size={24} className="upload-dropzone-icon" />
                      <p>Drag files here or click to select config file</p>
                      <input 
                        type="file" 
                        accept={selectedConnector.connector_type === 'CSV' ? '.csv' : '.xlsx'} 
                        onChange={(e) => setUploadFile(e.target.files[0])}
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                      />
                      <button className="btn-select-file" onClick={() => fileInputRef.current.click()}>
                        {uploadFile ? uploadFile.name : 'Select file'}
                      </button>
                      {uploadFile && (
                        <button className="btn-primary btn-upload-now" onClick={handleFileUpload} disabled={uploadLoading}>
                          {uploadLoading ? 'Uploading...' : 'Upload Configuration File'}
                        </button>
                      )}
                    </div>
                  )}

                  <h4 className="files-section-title">Historical uploads</h4>
                  {connectorFiles.length === 0 ? (
                    <div className="empty-files">
                      <Upload size={24} className="text-muted" />
                      <span>No files uploaded.</span>
                    </div>
                  ) : (
                    <div className="files-list">
                      {connectorFiles.map((file) => (
                        <div key={file.id} className="file-history-row">
                          <div className="file-history-meta">
                            <FileText size={18} className="text-muted" />
                            <div>
                              <span className="file-name-span">{file.file_name}</span>
                              <span className="file-size-span">{(file.file_size / 1024).toFixed(1)} KB</span>
                            </div>
                          </div>
                          <div className="file-uploader-info">
                            <span className="uploader-name">{file.uploaded_by}</span>
                            <span className="upload-date-span">{new Date(file.upload_date + 'Z').toLocaleString('en-US')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'schema' && (
                <div style={{ padding: '4px 2px' }}>
                  <h4 className="drawer-section-title">Field Discovery</h4>

                  {selectedConnector.connector_type === 'Database' && (
                    <div style={{ marginBottom: '16px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={handleLoadDbTables}
                          disabled={dbTablesLoading}
                          style={{
                            padding: '7px 14px', fontSize: '13px', border: '1px solid var(--border-color)',
                            borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)',
                            cursor: dbTablesLoading ? 'default' : 'pointer', fontWeight: '600'
                          }}
                        >
                          {dbTablesLoading ? 'Loading Tables...' : 'List Tables'}
                        </button>
                        {dbTables.length > 0 && (
                          <select
                            value={selectedTableName}
                            onChange={(e) => setSelectedTableName(e.target.value)}
                            style={{
                              padding: '7px 10px', fontSize: '13px', border: '1px solid var(--border-color)',
                              borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)'
                            }}
                          >
                            <option value="">Select a table...</option>
                            {dbTables.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDiscoverSchema}
                    disabled={schemaLoading || (selectedConnector.connector_type === 'Database' && !selectedTableName)}
                    style={{
                      padding: '8px 16px', fontSize: '13px', border: 'none', borderRadius: '6px',
                      backgroundColor: 'var(--primary)', color: '#fff',
                      cursor: schemaLoading ? 'default' : 'pointer', fontWeight: '600', marginBottom: '14px', marginTop: '4px'
                    }}
                  >
                    {schemaLoading ? 'Discovering...' : 'Discover Schema'}
                  </button>

                  {schemaError && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>
                      {schemaError}
                    </div>
                  )}

                  {schemaFields.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <Layers size={24} style={{ marginBottom: '8px' }} />
                      <p>No fields discovered yet. Click "Discover Schema" above.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Field Name</th>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Data Type</th>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Sample Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schemaFields.map((f, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 6px', fontWeight: '600', fontSize: '13px' }}>{f.field_name}</td>
                            <td style={{ padding: '8px 6px', fontSize: '13px' }}>{f.data_type}</td>
                            <td style={{ padding: '8px 6px', fontSize: '13px', color: 'var(--text-muted)' }}>{f.sample_value ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {drawerTab === 'mapping' && (
                <div style={{ padding: '4px 2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 className="drawer-section-title" style={{ margin: 0 }}>Attribute Mapping</h4>
                    {mappingRows.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {mappingsSaved && (
                          <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '600' }}>Saved</span>
                        )}
                        <button
                          onClick={handleSaveMappings}
                          disabled={mappingsSaving}
                          style={{
                            padding: '7px 14px', fontSize: '13px', border: 'none', borderRadius: '6px',
                            backgroundColor: 'var(--primary)', color: '#fff',
                            cursor: mappingsSaving ? 'default' : 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px'
                          }}
                        >
                          <Save size={13} />
                          {mappingsSaving ? 'Saving...' : 'Save Mapping'}
                        </button>
                      </div>
                    )}
                  </div>

                  {mappingsError && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>
                      {mappingsError}
                    </div>
                  )}

                  {schemaFields.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <ArrowRightLeft size={24} style={{ marginBottom: '8px' }} />
                      <p>No fields available yet. Go to the "Schema" tab and click "Discover Schema" first.</p>
                    </div>
                  ) : mappingsLoading ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p>Loading attribute mapping data...</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Source Field</th>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Target Module</th>
                          <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '12px', color: 'var(--text-muted)' }}>Target Attribute</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappingRows.map((row) => {
                          const moduleOptions = attributeOptions[row.target_module] || [];
                          return (
                            <tr key={row.source_field} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 6px', fontWeight: '600', fontSize: '13px' }}>{row.source_field}</td>
                              <td style={{ padding: '8px 6px' }}>
                                <select
                                  value={row.target_module}
                                  onChange={(e) => handleMappingModuleChange(row.source_field, e.target.value)}
                                  style={{
                                    padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)',
                                    borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)'
                                  }}
                                >
                                  <option value="">Not Mapped</option>
                                  {MAPPING_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '8px 6px' }}>
                                <select
                                  value={row.target_attribute_name}
                                  onChange={(e) => handleMappingAttributeChange(row.source_field, e.target.value)}
                                  disabled={!row.target_module}
                                  style={{
                                    padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)',
                                    borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)'
                                  }}
                                >
                                  <option value="">Select attribute...</option>
                                  {moduleOptions.map((attr) => (
                                    <option key={attr.attribute_name} value={attr.attribute_name}>
                                      {attr.display_name} ({attr.attribute_name})
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {drawerTab === 'schedule' && (
                <div style={{ padding: '4px 2px' }}>
                  <h4 className="drawer-section-title">Automated Testing Schedule</h4>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                    When enabled, this connector's connection will be automatically re-tested on the interval below —
                    the same check as clicking "Test Connection" manually.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <label className="checkbox-switch" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={scheduleEnabled}
                        onChange={(e) => { setScheduleEnabled(e.target.checked); setScheduleSaved(false); }}
                      />
                      <span className="switch-slider"></span>
                      <span className="switch-label">Enable Scheduled Testing</span>
                    </label>
                  </div>

                  {scheduleEnabled && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Frequency</label>
                      <select
                        value={scheduleFrequency}
                        onChange={(e) => { setScheduleFrequency(e.target.value); setScheduleSaved(false); }}
                        style={{
                          padding: '7px 10px', fontSize: '13px', border: '1px solid var(--border-color)',
                          borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)'
                        }}
                      >
                        <option value="Hourly">Hourly</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                      </select>
                    </div>
                  )}

                  {selectedConnector.next_scheduled_run && scheduleEnabled && (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Next scheduled run: {new Date(selectedConnector.next_scheduled_run + 'Z').toLocaleString('en-US')}
                    </div>
                  )}

                  {scheduleError && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>
                      {scheduleError}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={handleSaveSchedule}
                      disabled={scheduleSaving}
                      style={{
                        padding: '8px 16px', fontSize: '13px', border: 'none', borderRadius: '6px',
                        backgroundColor: 'var(--primary)', color: '#fff',
                        cursor: scheduleSaving ? 'default' : 'pointer', fontWeight: '600'
                      }}
                    >
                      {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                    </button>
                    {scheduleSaved && (
                      <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '600' }}>Saved</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectorWorkspace;