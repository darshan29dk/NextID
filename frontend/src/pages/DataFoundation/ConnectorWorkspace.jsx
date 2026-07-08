import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Server,
  Plus,
  Search,
  Trash2,
  Edit,
  SlidersHorizontal,
  Layers,
  Activity,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  UploadCloud,
  Check,
  FileSpreadsheet,
  Cpu,
  History,
  RotateCcw,
  User,
  Eye,
  Lock,
  Globe,
  Save,
  ArrowRightLeft,
  ArrowLeft
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import {
  getConnectors,
  getConnector,
  createConnector,
  updateConnector,
  deleteConnector,
  uploadConnectorFile,
  readExcelSheets,
  getConnectorLogs,
  getConnectorFiles,
  getConnectorAuditLogs,
  testConnector,
  getConnectorTables,
  getConnectorSchema,
  getConnectorMappings,
  saveConnectorMappings
} from '../../services/connectorService';
import {
  getIdentityAttributes,
  getAccountAttributes,
  getEntitlementAttributes,
  getRoleAttributes
} from '../../services/dashboardService';
import './ConnectorWorkspace.css';

const INITIAL_FORM_STATE = {
  connector_name: '',
  connector_type: 'CSV',
  description: '',
  status: 'Draft',
  health_status: 'Unknown',
  environment: 'Development',
  auth_type: 'None',
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
  excel_sheet_name: '',
  file_path: ''
};

const DEFAULT_PORTS = {
  MySQL: 3306,
  'SQL Server': 1433,
  Oracle: 1521,
  PostgreSQL: 5432
};

const MAPPING_MODULES = ['Identity', 'Account', 'Entitlement', 'Role'];

const ConnectorWorkspace = () => {
  // View state: 'list' | 'detail'
  const [view, setView] = useState('list');

  // Connector list state
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  // Pagination & Filter state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDbType, setFilterDbType] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [kpiStats, setKpiStats] = useState({
    total: 0, csv: 0, excel: 0, database: 0, ldap: 0, connected: 0, disconnected: 0, failed: 0
  });

  // Wizard / Modal state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editConnectorId, setEditConnectorId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [formBannerError, setFormBannerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [excelSheets, setExcelSheets] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  // Detail view state (was Drawer state)
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [connectorLogs, setConnectorLogs] = useState([]);
  const [connectorFiles, setConnectorFiles] = useState([]);
  const [connectorAudits, setConnectorAudits] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [connectorToDelete, setConnectorToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchConnectorsList = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = {
        page, limit,
        search: search.trim() || undefined,
        connector_type: filterType || undefined,
        status: filterStatus || undefined,
        database_type: filterDbType || undefined,
        sortBy, sortOrder
      };
      const data = await getConnectors(params);
      setConnectors(data.connectors || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch (err) {
      console.error('Failed to load connectors:', err);
      setErrorMsg('Failed to load connectors. Please verify backend connection.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filterType, filterStatus, filterDbType, sortBy, sortOrder]);

  const fetchKPIStats = useCallback(async () => {
    try {
      const data = await getConnectors({ page: 1, limit: 1000 });
      const list = data.connectors || [];
      setKpiStats({
        total: list.length,
        csv: list.filter((c) => c.connector_type === 'CSV').length,
        excel: list.filter((c) => c.connector_type === 'Excel').length,
        database: list.filter((c) => c.connector_type === 'Database').length,
        ldap: list.filter((c) => c.connector_type === 'LDAP').length,
        connected: list.filter((c) => c.status === 'Connected').length,
        disconnected: list.filter((c) => ['Draft', 'Configured', 'Disabled'].includes(c.status)).length,
        failed: list.filter((c) => c.status === 'Failed').length
      });
    } catch (err) {
      console.error('Failed to calculate connector KPIs:', err);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      fetchConnectorsList();
      fetchKPIStats();
    }
  }, [fetchConnectorsList, fetchKPIStats, view]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterType('');
    setFilterStatus('');
    setFilterDbType('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleOpenAddWizard = () => {
    setEditConnectorId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setSelectedFile(null);
    setExcelSheets([]);
    setWizardStep(1);
    setShowWizard(true);
  };

  const handleOpenEditWizard = (connector, e) => {
    if (e) e.stopPropagation();
    setEditConnectorId(connector.id);
    setFormData({
      connector_name: connector.connector_name,
      connector_type: connector.connector_type,
      description: connector.description || '',
      status: connector.status,
      health_status: connector.health_status,
      environment: connector.environment,
      auth_type: connector.auth_type,
      tags: connector.tags || '',
      database_type: connector.database_type || 'MySQL',
      host: connector.host || '',
      port: connector.port || '',
      database_name: connector.database_name || '',
      username: connector.username || '',
      password: '',
      ssl_enabled: connector.ssl_enabled || false,
      connection_timeout: connector.connection_timeout || 30,
      csv_delimiter: connector.csv_delimiter || ',',
      csv_encoding: connector.csv_encoding || 'UTF-8',
      excel_sheet_name: connector.excel_sheet_name || '',
      file_path: connector.file_path || ''
    });
    setFormErrors({});
    setFormBannerError(null);
    setSelectedFile(null);
    setExcelSheets([]);
    setWizardStep(1);
    setShowWizard(true);
  };

  const handleNextStep = async () => {
    const errors = {};
    if (wizardStep === 1) {
      if (!formData.connector_type) errors.connector_type = 'Please select a connector type';
    } else if (wizardStep === 2) {
      if (!formData.connector_name || !formData.connector_name.trim()) {
        errors.connector_name = 'Connector Name is required';
      }
    } else if (wizardStep === 3) {
      if (formData.connector_type === 'Database') {
        if (!formData.host || !formData.host.trim()) errors.host = 'Host is required';
        if (!formData.port) errors.port = 'Port is required';
        if (!formData.database_name || !formData.database_name.trim()) errors.database_name = 'Database Name is required';
        if (!formData.username || !formData.username.trim()) errors.username = 'Username is required';
        if (!editConnectorId && (!formData.password || !formData.password.trim())) {
          errors.password = 'Password is required';
        }
      } else if (formData.connector_type === 'LDAP') {
        if (!formData.host || !formData.host.trim()) errors.host = 'Host is required';
        if (!formData.port) errors.port = 'Port is required';
        if (!formData.database_name || !formData.database_name.trim()) errors.database_name = 'Base DN is required';
        if (!formData.username || !formData.username.trim()) errors.username = 'Bind DN is required';
        if (!editConnectorId && (!formData.password || !formData.password.trim())) {
          errors.password = 'Bind Password is required';
        }
      } else if (formData.connector_type === 'Excel') {
        if (!editConnectorId && !selectedFile) errors.file = 'Workbook file upload is required';
        if (excelSheets.length > 0 && !formData.excel_sheet_name) errors.excel_sheet_name = 'Please select an Excel Sheet';
      } else if (formData.connector_type === 'CSV') {
        if (!editConnectorId && !selectedFile) errors.file = 'CSV file upload is required';
        if (!formData.csv_delimiter) errors.csv_delimiter = 'Delimiter selection is required';
        if (!formData.csv_encoding) errors.csv_encoding = 'Encoding selection is required';
      }
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setWizardStep(wizardStep + 1);
  };

  const handlePrevStep = () => setWizardStep(wizardStep - 1);

  const handleFieldChange = (e) => {
    const { name, value, type, checked } = e.target;
    const finalVal = type === 'checkbox' ? checked : value;
    if (name === 'database_type') {
      setFormData((prev) => ({ ...prev, [name]: finalVal, port: DEFAULT_PORTS[finalVal] || '' }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: finalVal }));
    }
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setFormData((prev) => ({ ...prev, excel_sheet_name: '' }));
    if (formData.connector_type === 'Excel') {
      try {
        setSheetLoading(true);
        const res = await readExcelSheets(file);
        setExcelSheets(res.sheets || []);
        if (res.sheets && res.sheets.length > 0) {
          setFormData((prev) => ({ ...prev, excel_sheet_name: res.sheets[0] }));
        }
      } catch (err) {
        console.error('Failed to discover sheet names:', err);
        setFormErrors((prev) => ({ ...prev, file: 'Failed to discover sheet names. Is file a valid Excel workbook?' }));
      } finally {
        setSheetLoading(false);
      }
    }
  };

  const handleWizardSubmit = async () => {
    try {
      setSubmitting(true);
      setFormBannerError(null);
      let finalStatus = formData.status;
      if (formData.connector_type === 'Database' || formData.connector_type === 'LDAP') {
        finalStatus = 'Connected';
      } else {
        finalStatus = editConnectorId ? 'Configured' : 'Draft';
      }
      const payload = {
        ...formData,
        status: finalStatus,
        port: formData.port ? parseInt(formData.port) : null,
        connection_timeout: formData.connection_timeout ? parseInt(formData.connection_timeout) : 30
      };
      if (formData.connector_type !== 'Database') payload.database_type = null;
      if (editConnectorId && !payload.password) delete payload.password;

      let savedConnector;
      if (editConnectorId) {
        savedConnector = await updateConnector(editConnectorId, payload);
      } else {
        savedConnector = await createConnector(payload);
      }
      if (selectedFile && savedConnector && savedConnector.id) {
        await uploadConnectorFile(savedConnector.id, selectedFile);
      }
      setShowWizard(false);

      if (view === 'detail' && editConnectorId === selectedConnector?.id) {
        const updated = await getConnector(editConnectorId);
        setSelectedConnector(updated);
      } else {
        fetchConnectorsList();
        fetchKPIStats();
      }
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save connector configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetail = async (connector) => {
    setSelectedConnector(connector);
    setDetailTab('info');
    setView('detail');
    setTestResult(null);
    setSchemaFields([]);
    setSchemaError(null);
    setDbTables([]);
    setSelectedTableName('');
    setMappingRows([]);
    setMappingsError(null);
    setMappingsSaved(false);
    fetchDetailSubData(connector.id);
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedConnector(null);
    fetchConnectorsList();
    fetchKPIStats();
  };

  const fetchDetailSubData = async (connectorId) => {
    try {
      setDetailLoading(true);
      const [logs, files, audits] = await Promise.all([
        getConnectorLogs(connectorId),
        getConnectorFiles(connectorId),
        getConnectorAuditLogs(connectorId)
      ]);
      setConnectorLogs(logs || []);
      setConnectorFiles(files || []);
      setConnectorAudits(audits || []);
    } catch (err) {
      console.error('Failed to load detail history data:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedConnector) return;
    try {
      setTestingConnection(true);
      setTestResult(null);
      const result = await testConnector(selectedConnector.id);
      setTestResult(result);
      const updated = await getConnector(selectedConnector.id);
      setSelectedConnector(updated);
    } catch (err) {
      console.error('Connection test failed:', err);
      setTestResult({
        success: false,
        message: err.response?.data?.detail || 'Connection test failed unexpectedly.'
      });
    } finally {
      setTestingConnection(false);
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
    setDetailTab('mapping');
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

  const handleOpenDeleteConfirm = (connector, e) => {
    if (e) e.stopPropagation();
    setConnectorToDelete(connector);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!connectorToDelete) return;
    try {
      setDeleteSubmitting(true);
      await deleteConnector(connectorToDelete.id);
      setShowDeleteConfirm(false);
      setConnectorToDelete(null);
      if (selectedConnector?.id === connectorToDelete.id) {
        setView('list');
        setSelectedConnector(null);
      }
      fetchConnectorsList();
      fetchKPIStats();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to delete connector.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Connected':
        return <span className="status-badge connected"><CheckCircle2 size={12} /> Connected</span>;
      case 'Configured':
        return <span className="status-badge configured"><SlidersHorizontal size={12} /> Configured</span>;
      case 'Failed':
        return <span className="status-badge failed"><XCircle size={12} /> Failed</span>;
      case 'Disabled':
        return <span className="status-badge disabled"><AlertCircle size={12} /> Disabled</span>;
      default:
        return <span className="status-badge draft"><Info size={12} /> Draft</span>;
    }
  };

  const renderTypeIcon = (type) => {
    switch (type) {
      case 'CSV': return <FileText size={16} className="type-icon csv" />;
      case 'Excel': return <FileSpreadsheet size={16} className="type-icon excel" />;
      case 'Database': return <Database size={16} className="type-icon database" />;
      case 'LDAP': return <Globe size={16} className="type-icon ldap" style={{ color: '#0ea5e9' }} />;
      default: return <Layers size={16} className="type-icon" />;
    }
  };

  function renderModals() {
    return (
      <>
        {showWizard && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom connector-wizard-content">
              <div className="modal-header-custom">
                <h3>{editConnectorId ? 'Edit Connector' : 'Configure New Data Source'}</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowWizard(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="wizard-steps-indicator">
                <div className={`step-node ${wizardStep >= 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>
                  <div className="step-num">{wizardStep > 1 ? <Check size={12} /> : '1'}</div>
                  <div className="step-label">Connector Type</div>
                </div>
                <div className="step-line" />
                <div className={`step-node ${wizardStep >= 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}>
                  <div className="step-num">{wizardStep > 2 ? <Check size={12} /> : '2'}</div>
                  <div className="step-label">Details</div>
                </div>
                <div className="step-line" />
                <div className={`step-node ${wizardStep >= 3 ? 'active' : ''} ${wizardStep > 3 ? 'completed' : ''}`}>
                  <div className="step-num">{wizardStep > 3 ? <Check size={12} /> : '3'}</div>
                  <div className="step-label">Configuration</div>
                </div>
                <div className="step-line" />
                <div className={`step-node ${wizardStep === 4 ? 'active' : ''}`}>
                  <div className="step-num">4</div>
                  <div className="step-label">Review</div>
                </div>
              </div>

              <div className="modal-form-custom">
                <div className="modal-scrollable-body wizard-body-section">
                  {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}

                  {wizardStep === 1 && (
                    <div className="wizard-type-selection">
                      <h4>Choose Connector Ingestion Type</h4>
                      <p className="subtitle">Select the canonical format of this identity governance database.</p>
                      <div className="type-options-grid">
                        <div className={`type-option-card ${formData.connector_type === 'CSV' ? 'selected' : ''}`} onClick={() => setFormData((prev) => ({ ...prev, connector_type: 'CSV' }))}>
                          <div className="option-icon-wrapper csv"><FileText size={24} /></div>
                          <div className="option-text-wrapper">
                            <h5>CSV Flat File</h5>
                            <p>Upload comma or character separated values files directly from system exports.</p>
                          </div>
                          {formData.connector_type === 'CSV' && <div className="option-badge"><Check size={12} /></div>}
                        </div>
                        <div className={`type-option-card ${formData.connector_type === 'Excel' ? 'selected' : ''}`} onClick={() => setFormData((prev) => ({ ...prev, connector_type: 'Excel' }))}>
                          <div className="option-icon-wrapper excel"><FileSpreadsheet size={24} /></div>
                          <div className="option-text-wrapper">
                            <h5>Excel Workbook</h5>
                            <p>Import sheets from Microsoft Excel xlsx files with multi-sheet parsing capabilities.</p>
                          </div>
                          {formData.connector_type === 'Excel' && <div className="option-badge"><Check size={12} /></div>}
                        </div>
                        <div className={`type-option-card ${formData.connector_type === 'Database' ? 'selected' : ''}`} onClick={() => setFormData((prev) => ({ ...prev, connector_type: 'Database' }))}>
                          <div className="option-icon-wrapper database"><Database size={24} /></div>
                          <div className="option-text-wrapper">
                            <h5>Database JDBC / Direct</h5>
                            <p>Connect directly to relational DB engine instances (MySQL, Postgres, SQL Server, Oracle).</p>
                          </div>
                          {formData.connector_type === 'Database' && <div className="option-badge"><Check size={12} /></div>}
                        </div>
                        <div className={`type-option-card ${formData.connector_type === 'LDAP' ? 'selected' : ''}`} onClick={() => setFormData((prev) => ({ ...prev, connector_type: 'LDAP', port: 389, auth_type: 'Basic' }))}>
                          <div className="option-icon-wrapper database" style={{ color: '#0ea5e9' }}><Globe size={24} /></div>
                          <div className="option-text-wrapper">
                            <h5>LDAP Directory</h5>
                            <p>Connect directly to LDAP directories (Active Directory, OpenLDAP) for schema ingestion.</p>
                          </div>
                          {formData.connector_type === 'LDAP' && <div className="option-badge"><Check size={12} /></div>}
                        </div>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="wizard-details-form">
                      <div className="input-group-custom">
                        <label className="required">Connector Name</label>
                        <input type="text" name="connector_name" value={formData.connector_name} onChange={handleFieldChange} placeholder="e.g. HR CSV Employee Source" />
                        {formErrors.connector_name && <span className="form-error-text">{formErrors.connector_name}</span>}
                      </div>
                      <div className="input-group-custom">
                        <label>Description</label>
                        <textarea name="description" value={formData.description} onChange={handleFieldChange} placeholder="Provide details about the integration purpose..." rows={3} />
                      </div>
                      <div className="form-row-2col">
                        <div className="input-group-custom">
                          <label>Environment</label>
                          <select name="environment" value={formData.environment} onChange={handleFieldChange}>
                            <option value="Production">Production</option>
                            <option value="Staging">Staging</option>
                            <option value="Development">Development</option>
                          </select>
                        </div>
                        <div className="input-group-custom">
                          <label>Authentication Type</label>
                          <select name="auth_type" value={formData.auth_type} onChange={handleFieldChange}>
                            <option value="None">None</option>
                            <option value="Basic">Basic Credentials</option>
                            <option value="API Key">API Secret Key</option>
                            <option value="OAuth2">OAuth 2.0</option>
                          </select>
                        </div>
                      </div>
                      <div className="input-group-custom">
                        <label>Tags (Comma-separated)</label>
                        <input type="text" name="tags" value={formData.tags} onChange={handleFieldChange} placeholder="e.g. ActiveDirectory, System, Production" />
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="wizard-config-form">
                      {formData.connector_type === 'CSV' && (
                        <div className="config-type-section">
                          <h4>CSV Source Configuration</h4>
                          <div className="input-group-custom">
                            <label className={editConnectorId ? '' : 'required'}>
                              {editConnectorId ? 'Update CSV File (Optional)' : 'Upload CSV File'}
                            </label>
                            <div className="file-drop-area">
                              <UploadCloud className="upload-icon" size={24} />
                              <span style={{ marginBottom: '8px' }}>{selectedFile ? selectedFile.name : 'Select or drop CSV file'}</span>
                              <button type="button" className="btn-browse-file" onClick={(e) => { e.stopPropagation(); document.getElementById('csv-file-input').click(); }}
                                style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                Browse Local File
                              </button>
                              <input type="file" id="csv-file-input" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
                            </div>
                            {formErrors.file && <span className="form-error-text">{formErrors.file}</span>}
                            {formData.file_path && <span className="current-file-indicator">Current File: {formData.file_path}</span>}
                          </div>
                          <div className="form-row-2col">
                            <div className="input-group-custom">
                              <label className="required">Delimiter</label>
                              <select name="csv_delimiter" value={formData.csv_delimiter} onChange={handleFieldChange}>
                                <option value=",">Comma ( , )</option>
                                <option value=";">Semicolon ( ; )</option>
                                <option value="	">Tab ( \t )</option>
                                <option value="|">Pipe ( | )</option>
                              </select>
                            </div>
                            <div className="input-group-custom">
                              <label className="required">Encoding</label>
                              <select name="csv_encoding" value={formData.csv_encoding} onChange={handleFieldChange}>
                                <option value="UTF-8">UTF-8</option>
                                <option value="ASCII">ASCII</option>
                                <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {formData.connector_type === 'Excel' && (
                        <div className="config-type-section">
                          <h4>Excel Source Configuration</h4>
                          <div className="input-group-custom">
                            <label className={editConnectorId ? '' : 'required'}>
                              {editConnectorId ? 'Update Excel File (Optional)' : 'Upload Excel File (.xlsx)'}
                            </label>
                            <div className="file-drop-area">
                              <UploadCloud className="upload-icon" size={24} />
                              <span style={{ marginBottom: '8px' }}>{selectedFile ? selectedFile.name : 'Select or drop Excel file'}</span>
                              <button type="button" className="btn-browse-file" onClick={(e) => { e.stopPropagation(); document.getElementById('excel-file-input').click(); }}
                                style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                Browse Local File
                              </button>
                              <input type="file" id="excel-file-input" accept=".xlsx" onChange={handleFileChange} style={{ display: 'none' }} />
                            </div>
                            {formErrors.file && <span className="form-error-text">{formErrors.file}</span>}
                            {formData.file_path && <span className="current-file-indicator">Current File: {formData.file_path}</span>}
                          </div>
                          <div className="input-group-custom">
                            <label className="required">Sheet Name</label>
                            {sheetLoading ? (
                              <div className="sheet-loader">
                                <div className="spinner-element mini"></div>
                                <span>Discovering sheet names...</span>
                              </div>
                            ) : (
                              <select name="excel_sheet_name" value={formData.excel_sheet_name} onChange={handleFieldChange} disabled={excelSheets.length === 0 && !formData.excel_sheet_name}>
                                {excelSheets.length === 0 && !formData.excel_sheet_name && <option value="">Upload workbook file to view sheets</option>}
                                {formData.excel_sheet_name && !excelSheets.includes(formData.excel_sheet_name) && <option value={formData.excel_sheet_name}>{formData.excel_sheet_name}</option>}
                                {excelSheets.map((sh) => <option key={sh} value={sh}>{sh}</option>)}
                              </select>
                            )}
                            {formErrors.excel_sheet_name && <span className="form-error-text">{formErrors.excel_sheet_name}</span>}
                          </div>
                        </div>
                      )}

                      {formData.connector_type === 'Database' && (
                        <div className="config-type-section">
                          <h4>Database Connection Settings</h4>
                          <div className="form-row-2col">
                            <div className="input-group-custom">
                              <label className="required">Database Type</label>
                              <select name="database_type" value={formData.database_type} onChange={handleFieldChange}>
                                <option value="MySQL">MySQL</option>
                                <option value="SQL Server">SQL Server</option>
                                <option value="Oracle">Oracle</option>
                                <option value="PostgreSQL">PostgreSQL</option>
                              </select>
                            </div>
                            <div className="input-group-custom">
                              <label className="required">SSL Connection</label>
                              <div className="ssl-toggle-wrapper">
                                <input type="checkbox" id="ssl_enabled" name="ssl_enabled" checked={formData.ssl_enabled} onChange={handleFieldChange} />
                                <label htmlFor="ssl_enabled" className="toggle-label-text">Enable SSL Secure Socket</label>
                              </div>
                            </div>
                          </div>
                          <div className="form-row-3col">
                            <div className="input-group-custom grid-col-2">
                              <label className="required">Host Endpoint / IP</label>
                              <input type="text" name="host" value={formData.host} onChange={handleFieldChange} placeholder="e.g. 192.168.1.100 or rdb.amazon.com" />
                              {formErrors.host && <span className="form-error-text">{formErrors.host}</span>}
                            </div>
                            <div className="input-group-custom">
                              <label className="required">Port</label>
                              <input type="number" name="port" value={formData.port} onChange={handleFieldChange} placeholder="e.g. 3306" />
                              {formErrors.port && <span className="form-error-text">{formErrors.port}</span>}
                            </div>
                          </div>
                          <div className="input-group-custom">
                            <label className="required">Database Name</label>
                            <input type="text" name="database_name" value={formData.database_name} onChange={handleFieldChange} placeholder="e.g. governance_identity_db" />
                            {formErrors.database_name && <span className="form-error-text">{formErrors.database_name}</span>}
                          </div>
                          <div className="form-row-2col">
                            <div className="input-group-custom">
                              <label className="required">Username</label>
                              <input type="text" name="username" value={formData.username} onChange={handleFieldChange} placeholder="db_audit_reader" />
                              {formErrors.username && <span className="form-error-text">{formErrors.username}</span>}
                            </div>
                            <div className="input-group-custom">
                              <label className={editConnectorId ? '' : 'required'}>
                                Password {editConnectorId && '(Leave blank to preserve)'}
                              </label>
                              <div className="password-input-wrapper-wizard">
                                <Lock size={14} className="password-lock-icon" />
                                <input type="password" name="password" value={formData.password} onChange={handleFieldChange} placeholder="••••••••••••" />
                              </div>
                              {formErrors.password && <span className="form-error-text">{formErrors.password}</span>}
                            </div>
                          </div>
                          <div className="input-group-custom">
                            <label>Timeout (seconds)</label>
                            <input type="number" name="connection_timeout" value={formData.connection_timeout} onChange={handleFieldChange} placeholder="30" />
                          </div>
                        </div>
                      )}

                      {formData.connector_type === 'LDAP' && (
                        <div className="config-type-section">
                          <h4>LDAP Connection Settings</h4>
                          <div className="form-row-2col">
                            <div className="input-group-custom">
                              <label className="required">Secure Connection</label>
                              <div className="ssl-toggle-wrapper">
                                <input type="checkbox" id="ssl_enabled" name="ssl_enabled" checked={formData.ssl_enabled} onChange={handleFieldChange} />
                                <label htmlFor="ssl_enabled" className="toggle-label-text">Enable SSL/LDAPS Connection (Port 636)</label>
                              </div>
                            </div>
                            <div className="input-group-custom">
                              <label>Timeout (seconds)</label>
                              <input type="number" name="connection_timeout" value={formData.connection_timeout} onChange={handleFieldChange} placeholder="30" />
                            </div>
                          </div>
                          <div className="form-row-3col">
                            <div className="input-group-custom grid-col-2">
                              <label className="required">LDAP Server Host</label>
                              <input type="text" name="host" value={formData.host} onChange={handleFieldChange} placeholder="e.g. ldap.enterprise.com" />
                              {formErrors.host && <span className="form-error-text">{formErrors.host}</span>}
                            </div>
                            <div className="input-group-custom">
                              <label className="required">Port</label>
                              <input type="number" name="port" value={formData.port} onChange={handleFieldChange} placeholder="e.g. 389" />
                              {formErrors.port && <span className="form-error-text">{formErrors.port}</span>}
                            </div>
                          </div>
                          <div className="input-group-custom">
                            <label className="required">Base DN</label>
                            <input type="text" name="database_name" value={formData.database_name} onChange={handleFieldChange} placeholder="e.g. dc=enterprise,dc=com" />
                            {formErrors.database_name && <span className="form-error-text">{formErrors.database_name}</span>}
                          </div>
                          <div className="form-row-2col">
                            <div className="input-group-custom">
                              <label className="required">Bind DN (User)</label>
                              <input type="text" name="username" value={formData.username} onChange={handleFieldChange} placeholder="e.g. cn=read-only-admin,ou=users,dc=enterprise,dc=com" />
                              {formErrors.username && <span className="form-error-text">{formErrors.username}</span>}
                            </div>
                            <div className="input-group-custom">
                              <label className={editConnectorId ? '' : 'required'}>
                                Bind Password {editConnectorId && '(Leave blank to preserve)'}
                              </label>
                              <div className="password-input-wrapper-wizard">
                                <Lock size={14} className="password-lock-icon" />
                                <input type="password" name="password" value={formData.password} onChange={handleFieldChange} placeholder="••••••••••••" />
                              </div>
                              {formErrors.password && <span className="form-error-text">{formErrors.password}</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {wizardStep === 4 && (
                    <div className="wizard-review-summary">
                      <h4>Review Connector Configuration</h4>
                      <p className="subtitle">Verify details before adding this datasource to the system.</p>
                      <div className="review-cards-list">
                        <div className="review-card">
                          <h5>Identity Profile Info</h5>
                          <div className="review-grid">
                            <div className="review-item"><label>Name</label><span>{formData.connector_name}</span></div>
                            <div className="review-item"><label>Type</label><span>{formData.connector_type}</span></div>
                            <div className="review-item"><label>Environment</label><span>{formData.environment}</span></div>
                            <div className="review-item"><label>Auth Protocol</label><span>{formData.auth_type}</span></div>
                            {formData.description && (
                              <div className="review-item full-width"><label>Description</label><span>{formData.description}</span></div>
                            )}
                          </div>
                        </div>
                        <div className="review-card">
                          <h5>Technical Ingestion Specs</h5>
                          <div className="review-grid">
                            {formData.connector_type === 'CSV' && (
                              <>
                                <div className="review-item"><label>File Name</label><span>{selectedFile ? selectedFile.name : (formData.file_path || '—')}</span></div>
                                <div className="review-item"><label>Delimiter</label><span>{formData.csv_delimiter === '	' ? 'Tab' : formData.csv_delimiter}</span></div>
                                <div className="review-item"><label>Encoding</label><span>{formData.csv_encoding}</span></div>
                              </>
                            )}
                            {formData.connector_type === 'Excel' && (
                              <>
                                <div className="review-item"><label>Workbook</label><span>{selectedFile ? selectedFile.name : (formData.file_path || '—')}</span></div>
                                <div className="review-item"><label>Sheet Name</label><span>{formData.excel_sheet_name}</span></div>
                              </>
                            )}
                            {formData.connector_type === 'Database' && (
                              <>
                                <div className="review-item"><label>Engine</label><span>{formData.database_type}</span></div>
                                <div className="review-item"><label>Host Endpoint</label><span>{formData.host}</span></div>
                                <div className="review-item"><label>Port</label><span>{formData.port}</span></div>
                                <div className="review-item"><label>Database Name</label><span>{formData.database_name}</span></div>
                                <div className="review-item"><label>User Credential</label><span>{formData.username}</span></div>
                                <div className="review-item"><label>SSL Mode</label><span>{formData.ssl_enabled ? 'Secure (TLS)' : 'Standard (Non-TLS)'}</span></div>
                              </>
                            )}
                            {formData.connector_type === 'LDAP' && (
                              <>
                                <div className="review-item"><label>Host Endpoint</label><span>{formData.host}</span></div>
                                <div className="review-item"><label>Port</label><span>{formData.port}</span></div>
                                <div className="review-item"><label>Base DN</label><span>{formData.database_name}</span></div>
                                <div className="review-item"><label>Bind DN</label><span>{formData.username}</span></div>
                                <div className="review-item"><label>Security Mode</label><span>{formData.ssl_enabled ? 'LDAPS (Port 636 / SSL)' : 'Standard LDAP (Port 389)'}</span></div>
                                <div className="review-item"><label>Timeout</label><span>{formData.connection_timeout}s</span></div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-footer-custom">
                  {wizardStep > 1 && (
                    <button className="btn-modal-cancel" type="button" onClick={handlePrevStep}>Back</button>
                  )}
                  {wizardStep < 4 ? (
                    <button className="btn-modal-submit" type="button" onClick={handleNextStep}>Next</button>
                  ) : (
                    <button className="btn-modal-submit" type="button" disabled={submitting} onClick={handleWizardSubmit}>
                      {submitting ? 'Saving Configuration...' : 'Save Configuration'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom delete-dialog-content">
              <div className="delete-dialog-body">
                <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
                <div className="delete-dialog-text">
                  <h4>Delete Connector?</h4>
                  <p>
                    Are you sure you want to delete <b>{connectorToDelete?.connector_name}</b>?
                    This action is soft-deleting the datasource, but it will no longer display in active workspaces.
                  </p>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" disabled={deleteSubmitting} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="btn-modal-delete" type="button" disabled={deleteSubmitting} onClick={handleDeleteSubmit}>
                  {deleteSubmitting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (view === 'detail') {
    return (
      <div className="connector-workspace-page">
        <Breadcrumb
          items={[
            { label: 'Data Foundation', active: false },
            { label: 'Data Sources', active: false },
            { label: 'Connector Workspace', active: false, onClick: handleBackToList },
            { label: selectedConnector?.connector_name || 'Loading...', active: true }
          ]}
        />

        <button className="detail-back-btn" onClick={handleBackToList}>
          <ArrowLeft size={14} />
          Back to Connector Workspace
        </button>

        {selectedConnector && (
          <>
            <div className="page-header-actions" style={{ marginTop: '16px' }}>
              <div className="header-title-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {renderTypeIcon(selectedConnector.connector_type)}
                  <h2 style={{ margin: 0 }}>{selectedConnector.connector_name}</h2>
                  {renderStatusBadge(selectedConnector.status)}
                </div>
                <p>{selectedConnector.description || 'No description provided.'}</p>
              </div>
              <div className="header-buttons-section" style={{ gap: '8px' }}>
                <button
                  className="btn-browse-file"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  style={{
                    padding: '8px 14px', fontSize: '13px', border: '1px solid var(--border-color)',
                    borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)',
                    cursor: testingConnection ? 'default' : 'pointer', fontWeight: '600'
                  }}
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                <button className="btn-add-connector" onClick={(e) => handleOpenEditWizard(selectedConnector, e)}>
                  <Edit size={14} />
                  <span>Edit</span>
                </button>
                <button
                  className="btn-modal-delete"
                  style={{ padding: '8px 14px', borderRadius: '6px' }}
                  onClick={(e) => handleOpenDeleteConfirm(selectedConnector, e)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {testResult && (
              <div
                style={{
                  margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '500',
                  backgroundColor: testResult.success ? 'var(--success-light, #10b98120)' : 'var(--danger-light)',
                  color: testResult.success ? 'var(--success, #10b981)' : 'var(--danger)',
                  border: `1px solid ${testResult.success ? 'var(--success, #10b981)' : 'var(--danger)'}`
                }}
              >
                {testResult.success ? '✓ ' : '✗ '}{testResult.message}
                {testResult.duration_ms !== undefined && (
                  <span style={{ opacity: 0.7 }}> ({testResult.duration_ms}ms)</span>
                )}
              </div>
            )}

            <div className="drawer-tabs-navigation" style={{ marginBottom: '16px' }}>
              <button className={`drawer-tab-btn ${detailTab === 'info' ? 'active' : ''}`} onClick={() => setDetailTab('info')}>
                <Info size={13} /> Details
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'files' ? 'active' : ''}`} onClick={() => setDetailTab('files')}>
                <FileSpreadsheet size={13} /> Files ({connectorFiles.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'logs' ? 'active' : ''}`} onClick={() => setDetailTab('logs')}>
                <Activity size={13} /> Logs ({connectorLogs.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'audits' ? 'active' : ''}`} onClick={() => setDetailTab('audits')}>
                <FileText size={13} /> Audits ({connectorAudits.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'schema' ? 'active' : ''}`} onClick={() => setDetailTab('schema')}>
                <Layers size={13} /> Schema ({schemaFields.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'mapping' ? 'active' : ''}`} onClick={handleOpenMappingTab}>
                <ArrowRightLeft size={13} /> Mapping ({mappingRows.filter((r) => r.target_attribute_name).length})
              </button>
            </div>

            <div className="detail-section-card">
              <div className="detail-section-body">
                {detailLoading ? (
                  <div className="drawer-loading-box">
                    <div className="spinner-element"></div>
                    <p>Loading history metrics...</p>
                  </div>
                ) : (
                  <div className="drawer-tab-pane-container">
                    {detailTab === 'info' && (
                      <div className="drawer-tab-info-pane">
                        <div className="info-summary-group">
                          <h5>Connector Metadata</h5>
                          <div className="info-summary-grid">
                            <div className="summary-item"><label>Status</label><span>{renderStatusBadge(selectedConnector.status)}</span></div>
                            <div className="summary-item"><label>Connection Target</label><span>{selectedConnector.connector_type}</span></div>
                            <div className="summary-item"><label>Environment</label><span>{selectedConnector.environment || 'Development'}</span></div>
                            <div className="summary-item"><label>Auth Mechanism</label><span>{selectedConnector.auth_type || 'None'}</span></div>
                            <div className="summary-item"><label>System Version</label><span>v{selectedConnector.version}</span></div>
                            <div className="summary-item"><label>Created By</label><span>{selectedConnector.created_by}</span></div>
                            <div className="summary-item"><label>Created At</label><span>{new Date(selectedConnector.created_at).toLocaleString()}</span></div>
                            <div className="summary-item"><label>Last Updated</label><span>{new Date(selectedConnector.updated_at).toLocaleString()}</span></div>
                          </div>
                        </div>

                        <div className="info-summary-group">
                          <h5>Configuration Summary</h5>
                          <div className="info-summary-grid">
                            {selectedConnector.connector_type === 'CSV' && (
                              <>
                                <div className="summary-item"><label>File Path</label><span className="mono-text">{selectedConnector.file_path || '—'}</span></div>
                                <div className="summary-item"><label>Delimiter</label><span>{selectedConnector.csv_delimiter === '	' ? 'Tab' : selectedConnector.csv_delimiter}</span></div>
                                <div className="summary-item"><label>Encoding</label><span>{selectedConnector.csv_encoding}</span></div>
                              </>
                            )}
                            {selectedConnector.connector_type === 'Excel' && (
                              <>
                                <div className="summary-item"><label>Workbook Path</label><span className="mono-text">{selectedConnector.file_path || '—'}</span></div>
                                <div className="summary-item"><label>Active Sheet</label><span>{selectedConnector.excel_sheet_name || '—'}</span></div>
                              </>
                            )}
                            {selectedConnector.connector_type === 'Database' && (
                              <>
                                <div className="summary-item"><label>Engine type</label><span>{selectedConnector.database_type}</span></div>
                                <div className="summary-item"><label>Host / Port</label><span className="mono-text">{selectedConnector.host}:{selectedConnector.port}</span></div>
                                <div className="summary-item"><label>Schema Name</label><span>{selectedConnector.database_name}</span></div>
                                <div className="summary-item"><label>Username</label><span>{selectedConnector.username}</span></div>
                                <div className="summary-item"><label>Password Hash</label><span>•••••••••••• (Encrypted on write)</span></div>
                                <div className="summary-item"><label>SSL Enabled</label><span>{selectedConnector.ssl_enabled ? 'Yes' : 'No'}</span></div>
                                <div className="summary-item"><label>Timeout</label><span>{selectedConnector.connection_timeout} seconds</span></div>
                              </>
                            )}
                            {selectedConnector.connector_type === 'LDAP' && (
                              <>
                                <div className="summary-item"><label>LDAP Host / Port</label><span className="mono-text">{selectedConnector.host}:{selectedConnector.port}</span></div>
                                <div className="summary-item"><label>Base DN</label><span>{selectedConnector.database_name}</span></div>
                                <div className="summary-item"><label>Bind DN</label><span>{selectedConnector.username}</span></div>
                                <div className="summary-item"><label>Bind Password</label><span>•••••••••••• (Encrypted on write)</span></div>
                                <div className="summary-item"><label>Security Mode</label><span>{selectedConnector.ssl_enabled ? 'LDAPS (Secure SSL)' : 'Standard LDAP (Non-SSL)'}</span></div>
                                <div className="summary-item"><label>Timeout</label><span>{selectedConnector.connection_timeout} seconds</span></div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailTab === 'files' && (
                      <div className="drawer-tab-files-pane">
                        <h5>Uploaded Files Collection</h5>
                        {connectorFiles.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <UploadCloud size={24} className="text-muted" />
                            <p>No files have been uploaded for this connector yet.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {connectorFiles.map((f) => (
                              <div key={f.id} className="history-record-card file-card">
                                <div className="file-info-header">
                                  <FileText size={16} className="text-muted" />
                                  <span className="file-name-text" title={f.file_name}>{f.file_name}</span>
                                </div>
                                <div className="file-meta-row">
                                  <span>Size: {(f.file_size / 1024).toFixed(1)} KB</span>
                                  <span>By: {f.uploaded_by}</span>
                                  <span>Date: {new Date(f.upload_date).toLocaleDateString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === 'logs' && (
                      <div className="drawer-tab-logs-pane">
                        <h5>Connector Sync Activity Logs</h5>
                        {connectorLogs.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <History size={24} className="text-muted" />
                            <p>No activity logs recorded for this connector.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {connectorLogs.map((log) => (
                              <div key={log.id} className="history-record-card log-card">
                                <div className="log-badge-header">
                                  <span className={`log-status-indicator ${log.status.toLowerCase()}`}>{log.status}</span>
                                  <span className="log-action-text font-semibold">{log.action}</span>
                                </div>
                                <p className="log-details-text">{log.details}</p>
                                <span className="log-time-text">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === 'audits' && (
                      <div className="drawer-tab-audits-pane">
                        <h5>Configuration Changes Audit Trail</h5>
                        {connectorAudits.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <FileText size={24} className="text-muted" />
                            <p>No audit trail logs match this connector configuration.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {connectorAudits.map((aud) => (
                              <div key={aud.id} className="history-record-card audit-card">
                                <div className="audit-card-header">
                                  <User size={13} className="text-muted" />
                                  <span className="audit-user-text font-semibold">{aud.performed_by}</span>
                                  <span className="audit-action-badge">{aud.action}</span>
                                </div>
                                <div className="audit-diff-section">
                                  {aud.old_value && (
                                    <div className="diff-item old">
                                      <label>Old State</label>
                                      <pre>{JSON.stringify(JSON.parse(aud.old_value), null, 2)}</pre>
                                    </div>
                                  )}
                                  {aud.new_value && (
                                    <div className="diff-item new">
                                      <label>New State</label>
                                      <pre>{JSON.stringify(JSON.parse(aud.new_value), null, 2)}</pre>
                                    </div>
                                  )}
                                </div>
                                <span className="audit-time-text">{new Date(aud.timestamp).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === 'schema' && (
                      <div className="drawer-tab-info-pane">
                        <h5>Field Discovery</h5>

                        {selectedConnector.connector_type === 'Database' && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                              <button
                                className="btn-browse-file"
                                onClick={handleLoadDbTables}
                                disabled={dbTablesLoading}
                                style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: dbTablesLoading ? 'default' : 'pointer', fontWeight: '600' }}
                              >
                                {dbTablesLoading ? 'Loading Tables...' : 'List Tables'}
                              </button>
                              {dbTables.length > 0 && (
                                <select
                                  value={selectedTableName}
                                  onChange={(e) => setSelectedTableName(e.target.value)}
                                  style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                                >
                                  <option value="">Select a table...</option>
                                  {dbTables.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              )}
                            </div>
                          </div>
                        )}

                        <button
                          className="btn-browse-file"
                          onClick={handleDiscoverSchema}
                          disabled={schemaLoading || (selectedConnector.connector_type === 'Database' && !selectedTableName)}
                          style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', cursor: schemaLoading ? 'default' : 'pointer', fontWeight: '600', marginBottom: '12px' }}
                        >
                          {schemaLoading ? 'Discovering...' : 'Discover Schema'}
                        </button>

                        {schemaError && <div className="error-banner" style={{ marginBottom: '12px' }}>{schemaError}</div>}

                        {schemaFields.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <Layers size={24} className="text-muted" />
                            <p>No fields discovered yet. Click "Discover Schema" above.</p>
                          </div>
                        ) : (
                          <table className="detail-inner-table">
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Field Name</th>
                                <th style={{ textAlign: 'left' }}>Data Type</th>
                                <th style={{ textAlign: 'left' }}>Sample Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {schemaFields.map((f, idx) => (
                                <tr key={idx}>
                                  <td style={{ fontWeight: '600' }}>{f.field_name}</td>
                                  <td><span className="attr-datatype-badge">{f.data_type}</span></td>
                                  <td className="text-muted">{f.sample_value ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {detailTab === 'mapping' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h5 style={{ margin: 0 }}>Attribute Mapping</h5>
                          {mappingRows.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {mappingsSaved && (
                                <span style={{ fontSize: '12px', color: 'var(--success, #10b981)', fontWeight: '600' }}>Saved</span>
                              )}
                              <button
                                className="btn-browse-file"
                                onClick={handleSaveMappings}
                                disabled={mappingsSaving}
                                style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', cursor: mappingsSaving ? 'default' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Save size={13} />
                                {mappingsSaving ? 'Saving...' : 'Save Mapping'}
                              </button>
                            </div>
                          )}
                        </div>

                        {mappingsError && <div className="error-banner" style={{ marginBottom: '12px' }}>{mappingsError}</div>}

                        {schemaFields.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <ArrowRightLeft size={24} className="text-muted" />
                            <p>No fields available yet. Go to the "Schema" tab and click "Discover Schema" first.</p>
                          </div>
                        ) : mappingsLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading attribute mapping data...</p>
                          </div>
                        ) : (
                          <table className="detail-inner-table">
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Source Field</th>
                                <th style={{ textAlign: 'left' }}>Target Module</th>
                                <th style={{ textAlign: 'left' }}>Target Attribute</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mappingRows.map((row) => {
                                const moduleOptions = attributeOptions[row.target_module] || [];
                                return (
                                  <tr key={row.source_field}>
                                    <td style={{ fontWeight: '600' }}>{row.source_field}</td>
                                    <td>
                                      <select
                                        value={row.target_module}
                                        onChange={(e) => handleMappingModuleChange(row.source_field, e.target.value)}
                                        style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                                      >
                                        <option value="">Not Mapped</option>
                                        {MAPPING_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                    </td>
                                    <td>
                                      <select
                                        value={row.target_attribute_name}
                                        onChange={(e) => handleMappingAttributeChange(row.source_field, e.target.value)}
                                        disabled={!row.target_module}
                                        style={{ padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
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
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {renderModals()}
      </div>
    );
  }

  return (
    <div className="connector-workspace-page">
      <Breadcrumb
        items={[
          { label: 'Data Foundation', active: false },
          { label: 'Data Sources', active: false },
          { label: 'Connector Workspace', active: true }
        ]}
      />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Connector Workspace</h2>
          <p>Configure enterprise data source connectors to ingest identity, account, and entitlement mappings.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-add-connector" onClick={handleOpenAddWizard}>
            <Plus size={14} />
            <span>Add Connector</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <DashboardCard title="Total Connectors" value={kpiStats.total} icon={Layers} color="blue" loading={loading} />
        <DashboardCard title="CSV Connectors" value={kpiStats.csv} icon={FileText} color="indigo" loading={loading} />
        <DashboardCard title="Excel Connectors" value={kpiStats.excel} icon={FileSpreadsheet} color="teal" loading={loading} />
        <DashboardCard title="Database Connectors" value={kpiStats.database} icon={Database} color="purple" loading={loading} />
        <DashboardCard title="LDAP Connectors" value={kpiStats.ldap} icon={Globe} color="blue" loading={loading} />
        <DashboardCard title="Connected Sources" value={kpiStats.connected} icon={CheckCircle2} color="green" loading={loading} />
        <DashboardCard title="Configured / Draft" value={kpiStats.disconnected} icon={SlidersHorizontal} color="yellow" loading={loading} />
        <DashboardCard title="Failed Connections" value={kpiStats.failed} icon={XCircle} color="red" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input type="text" className="search-field" value={search} onChange={handleSearchChange} placeholder="Search by name, description or host..." />
        </div>

        <div className="filter-dropdowns">
          <select className="filter-dropdown" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
            <option value="">All Connector Types</option>
            <option value="CSV">CSV</option>
            <option value="Excel">Excel</option>
            <option value="Database">Database</option>
            <option value="LDAP">LDAP</option>
          </select>
          <select className="filter-dropdown" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Configured">Configured</option>
            <option value="Connected">Connected</option>
            <option value="Failed">Failed</option>
            <option value="Disabled">Disabled</option>
          </select>
          <select className="filter-dropdown" value={filterDbType} onChange={(e) => { setFilterDbType(e.target.value); setPage(1); }}>
            <option value="">All Database Types</option>
            <option value="MySQL">MySQL</option>
            <option value="SQL Server">SQL Server</option>
            <option value="Oracle">Oracle</option>
            <option value="PostgreSQL">PostgreSQL</option>
          </select>
        </div>

        {(search || filterType || filterStatus || filterDbType) && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reset Filters
          </button>
        )}
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        <div className="table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('connector_name')}>
                  Name {sortBy === 'connector_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('connector_type')}>
                  Type {sortBy === 'connector_type' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                  Status {sortBy === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('database_type')}>
                  Database Type {sortBy === 'database_type' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_tested')}>
                  Last Tested {sortBy === 'last_tested' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_sync')}>
                  Last Synced {sortBy === 'last_sync' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th>Created By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className="table-loading-container">
                      <div className="spinner-element"></div>
                      <p>Loading connectors...</p>
                    </div>
                  </td>
                </tr>
              ) : connectors.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="table-empty-container">
                      <Cpu size={36} className="text-muted" />
                      <div className="empty-state-text">
                        <h4>No Connectors Found</h4>
                        <p>No active connector configurations found matching current filters.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                connectors.map((c) => (
                  <tr key={c.id} className="row-clickable" onClick={() => handleOpenDetail(c)}>
                    <td className="connector-name-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {renderTypeIcon(c.connector_type)}
                        <span className="font-semibold text-main">{c.connector_name}</span>
                      </div>
                    </td>
                    <td>{c.connector_type}</td>
                    <td>{renderStatusBadge(c.status)}</td>
                    <td>{c.database_type || '—'}</td>
                    <td>{c.last_tested ? new Date(c.last_tested).toLocaleString() : 'Never'}</td>
                    <td>{c.last_sync ? new Date(c.last_sync).toLocaleString() : 'Never'}</td>
                    <td>{c.created_by}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="actions-cell-menu">
                        <button className="btn-row-action" title="View details" onClick={() => handleOpenDetail(c)}>
                          <Eye size={13} />
                        </button>
                        <button className="btn-row-action" title="Edit configuration" onClick={(e) => handleOpenEditWizard(c, e)}>
                          <Edit size={13} />
                        </button>
                        <button className="btn-row-action delete" title="Delete connector" onClick={(e) => handleOpenDeleteConfirm(c, e)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="table-pagination-footer">
            <div className="pagination-info">
              Showing page <b>{page}</b> of <b>{totalPages}</b> (Total {totalCount} records)
            </div>
            <div className="pagination-buttons">
              <button className="btn-page-nav" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                <button key={pNum} className={`btn-page-number ${page === pNum ? 'active' : ''}`} onClick={() => setPage(pNum)}>
                  {pNum}
                </button>
              ))}
              <button className="btn-page-nav" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {renderModals()}
    </div>
  );
};

export default ConnectorWorkspace;