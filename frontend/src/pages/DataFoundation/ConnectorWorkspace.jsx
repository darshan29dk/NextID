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
  ArrowLeft,
  Sliders,
  ClipboardCheck,
  Play,
  Clock
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
  saveConnectorMappings,
  updateConnectorSchedule,
  importConnectorData
} from '../../services/connectorService';
import {
  getIdentityAttributes,
  getAccountAttributes,
  getEntitlementAttributes,
  getRoleAttributes,
  getTransformationRules,
  createTransformationRule,
  updateTransformationRule,
  deleteTransformationRule,
  testTransformationRule,
  getValidationRules,
  createValidationRule,
  updateValidationRule,
  deleteValidationRule,
  testValidationRule,
  generateConnectorPreview,
  getConnectorPreview,
  clearConnectorPreview
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
  const [userRole, setUserRole] = useState('Read Only');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ranalyzer_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.role) setUserRole(u.role);
        if (u?.name) setUserName(u.name);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Transformations State
  const [transformations, setTransformations] = useState([]);
  const [transformLoading, setTransformLoading] = useState(false);
  const [transformTotal, setTransformTotal] = useState(0);
  const [transformPage, setTransformPage] = useState(1);
  const [transformLimit] = useState(10);
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [transformFormData, setTransformFormData] = useState({
    id: null, rule_name: '', transformation_type: 'Trim', mapping_id: '', expression: '', parameters: '', execution_order: 0, enabled: true
  });
  const [transformSubmitting, setTransformSubmitting] = useState(false);
  
  // Test transformation sandbox
  const [testTransformValue, setTestTransformValue] = useState('');
  const [testTransformOutput, setTestTransformOutput] = useState('');
  const [testTransformError, setTestTransformError] = useState('');
  const [testingTransform, setTestingTransform] = useState(false);

  // Validations State
  const [validations, setValidations] = useState([]);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationTotal, setValidationTotal] = useState(0);
  const [validationPage, setValidationPage] = useState(1);
  const [validationLimit] = useState(10);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationFormData, setValidationFormData] = useState({
    id: null, rule_name: '', validation_type: 'Required', mapping_id: '', parameters: '', severity: 'Error', error_message: '', execution_order: 0, enabled: true
  });
  const [validationSubmitting, setValidationSubmitting] = useState(false);

  // Test validation sandbox
  const [testValidationValue, setTestValidationValue] = useState('');
  const [testValidationStatus, setTestValidationStatus] = useState('');
  const [testValidationMessage, setTestValidationMessage] = useState('');
  const [testingValidation, setTestingValidation] = useState(false);

  // Preview State
  const [previewRecords, setPreviewRecords] = useState([]);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit] = useState(10);
  const [previewStatusFilter, setPreviewStatusFilter] = useState('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [clearingPreview, setClearingPreview] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [connectorToDelete, setConnectorToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deletingRef = React.useRef(false);

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
    total: 0, csv: 0, excel: 0, database: 0, ldap: 0, api: 0, connected: 0, disconnected: 0, failed: 0
  });

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
  const [syncingData, setSyncingData] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

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

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState('Daily');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

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
        api: list.filter((c) => c.connector_type === 'API Gateway').length,
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
      } else if (formData.connector_type === 'API Gateway') {
        if (!formData.host || !formData.host.trim()) errors.host = 'API Endpoint URL is required';
        if (formData.file_path) {
          try {
            JSON.parse(formData.file_path);
          } catch (e) {
            errors.file_path = 'Headers must be a valid JSON string (e.g. {"Content-Type": "application/json"})';
          }
        }
        if (formData.auth_type === 'Basic') {
          if (!formData.username || !formData.username.trim()) errors.username = 'Username is required';
          if (!editConnectorId && (!formData.password || !formData.password.trim())) errors.password = 'Password is required';
        } else if (formData.auth_type === 'API Key') {
          if (!formData.username || !formData.username.trim()) errors.username = 'API Header Name is required';
          if (!editConnectorId && (!formData.password || !formData.password.trim())) errors.password = 'Token value is required';
        }
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
    setScheduleEnabled(!!connector.schedule_enabled);
    setScheduleFrequency(connector.schedule_frequency || 'Daily');
    setScheduleTime(connector.schedule_time || '12:00');
    setScheduleSaved(false);
    setScheduleError(null);
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

  const handleImportNow = async () => {
    if (!selectedConnector) return;
    try {
      setSyncingData(true);
      setSyncResult(null);
      setTestResult(null);
      const result = await importConnectorData(selectedConnector.id, selectedTableName || undefined);
      setSyncResult(result);
      const updated = await getConnector(selectedConnector.id);
      setSelectedConnector(updated);
      fetchDetailSubData(selectedConnector.id);
    } catch (err) {
      console.error('Import run failed:', err);
      setSyncResult({
        success: false,
        message: err.response?.data?.detail || 'Import run encountered a critical error.'
      });
    } finally {
      setSyncingData(false);
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

  const handleSaveSchedule = async () => {
    if (!selectedConnector) return;
    try {
      setScheduleSaving(true);
      setScheduleError(null);
      const result = await updateConnectorSchedule(
        selectedConnector.id,
        scheduleEnabled,
        scheduleEnabled ? scheduleFrequency : null,
        (scheduleEnabled && scheduleFrequency !== 'Hourly') ? scheduleTime : null
      );
      setScheduleSaved(true);
      setSelectedConnector((prev) => ({
        ...prev,
        schedule_enabled: result.schedule_enabled,
        schedule_frequency: result.schedule_frequency,
        schedule_time: result.schedule_time,
        next_scheduled_run: result.next_scheduled_run
      }));
      fetchConnectorsList();
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

  // ── Transformations Handlers ─────────────────────────────────────
  const fetchTransformations = useCallback(async () => {
    if (!selectedConnector) return;
    try {
      setTransformLoading(true);
      const res = await getTransformationRules(selectedConnector.id, { page: transformPage, limit: transformLimit });
      setTransformations(res.rules || []);
      setTransformTotal(res.total || 0);
    } catch (err) {
      console.error("Failed to fetch transformations:", err);
    } finally {
      setTransformLoading(false);
    }
  }, [selectedConnector, transformPage, transformLimit]);

  useEffect(() => {
    if (detailTab === 'transformations') {
      fetchTransformations();
    }
  }, [detailTab, fetchTransformations]);

  const handleOpenTransformAdd = () => {
    setTransformFormData({
      id: null, rule_name: '', transformation_type: 'Trim', mapping_id: mappingRows[0]?.source_field ? mappingRows.find(r => r.target_attribute_name)?.source_field || '' : '', expression: '', parameters: '', execution_order: transformations.length + 1, enabled: true
    });
    setTestTransformValue('');
    setTestTransformOutput('');
    setTestTransformError('');
    setShowTransformModal(true);
  };

  const handleOpenTransformEdit = (rule) => {
    const mapping = mappingRows.find(m => m.id === rule.mapping_id || (m.target_attribute_name && m.target_attribute_name === rule.mapping?.target_attribute_name));
    setTransformFormData({
      id: rule.id,
      rule_name: rule.rule_name,
      transformation_type: rule.transformation_type,
      mapping_id: mapping ? mapping.source_field : (rule.mapping_id || ''),
      expression: rule.expression || '',
      parameters: rule.parameters || '',
      execution_order: rule.execution_order,
      enabled: rule.enabled
    });
    setTestTransformValue('');
    setTestTransformOutput('');
    setTestTransformError('');
    setShowTransformModal(true);
  };

  const handleSaveTransformation = async () => {
    if (!transformFormData.rule_name.trim()) {
      alert("Rule name is required.");
      return;
    }
    const mapping = mappingRows.find(r => r.source_field === transformFormData.mapping_id);
    if (!mapping) {
      alert("A valid attribute mapping is required.");
      return;
    }

    try {
      setTransformSubmitting(true);
      const existingMappings = await getConnectorMappings(selectedConnector.id);
      const backendMapping = existingMappings.find(m => m.source_field === mapping.source_field);
      if (!backendMapping) {
        alert("The mapping was not found on the backend. Please save the Mappings tab configuration first.");
        return;
      }

      const payload = {
        connector_id: selectedConnector.id,
        mapping_id: backendMapping.id,
        rule_name: transformFormData.rule_name,
        transformation_type: transformFormData.transformation_type,
        expression: transformFormData.expression || null,
        parameters: transformFormData.parameters || null,
        execution_order: parseInt(transformFormData.execution_order) || 0,
        enabled: transformFormData.enabled
      };

      if (transformFormData.id) {
        await updateTransformationRule(transformFormData.id, payload);
      } else {
        await createTransformationRule(selectedConnector.id, payload);
      }
      setShowTransformModal(false);
      fetchTransformations();
    } catch (err) {
      alert("Failed to save rule: " + (err.response?.data?.detail || err.message));
    } finally {
      setTransformSubmitting(false);
    }
  };

  const handleDeleteTransformation = async (id) => {
    if (!window.confirm("Are you sure you want to delete this transformation rule?")) return;
    try {
      await deleteTransformationRule(id);
      fetchTransformations();
    } catch (err) {
      alert("Failed to delete rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDuplicateTransformation = async (rule) => {
    try {
      const payload = {
        connector_id: rule.connector_id,
        mapping_id: rule.mapping_id,
        rule_name: `${rule.rule_name} (Copy)`,
        transformation_type: rule.transformation_type,
        expression: rule.expression,
        parameters: rule.parameters,
        execution_order: rule.execution_order + 1,
        enabled: rule.enabled
      };
      await createTransformationRule(rule.connector_id, payload);
      fetchTransformations();
    } catch (err) {
      alert("Failed to duplicate rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggleTransformationEnabled = async (rule) => {
    try {
      await updateTransformationRule(rule.id, { enabled: !rule.enabled });
      fetchTransformations();
    } catch (err) {
      alert("Failed to toggle rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestTransformation = async () => {
    if (!testTransformValue) return;
    try {
      setTestingTransform(true);
      setTestTransformOutput('');
      setTestTransformError('');
      const res = await testTransformationRule({
        value: testTransformValue,
        transformation_type: transformFormData.transformation_type,
        expression: transformFormData.expression || null,
        parameters: transformFormData.parameters || null
      });
      if (res.success) {
        setTestTransformOutput(res.output_value);
      } else {
        setTestTransformError(res.error_message);
      }
    } catch (err) {
      setTestTransformError(err.response?.data?.detail || err.message);
    } finally {
      setTestingTransform(false);
    }
  };

  // ── Validations Handlers ─────────────────────────────────────────
  const fetchValidations = useCallback(async () => {
    if (!selectedConnector) return;
    try {
      setValidationLoading(true);
      const res = await getValidationRules(selectedConnector.id, { page: validationPage, limit: validationLimit });
      setValidations(res.rules || []);
      setValidationTotal(res.total || 0);
    } catch (err) {
      console.error("Failed to fetch validations:", err);
    } finally {
      setValidationLoading(false);
    }
  }, [selectedConnector, validationPage, validationLimit]);

  useEffect(() => {
    if (detailTab === 'validations') {
      fetchValidations();
    }
  }, [detailTab, fetchValidations]);

  const handleOpenValidationAdd = () => {
    setValidationFormData({
      id: null, rule_name: '', validation_type: 'Required', mapping_id: mappingRows[0]?.source_field ? mappingRows.find(r => r.target_attribute_name)?.source_field || '' : '', parameters: '', severity: 'Error', error_message: '', execution_order: validations.length + 1, enabled: true
    });
    setTestValidationValue('');
    setTestValidationStatus('');
    setTestValidationMessage('');
    setShowValidationModal(true);
  };

  const handleOpenValidationEdit = (rule) => {
    const mapping = mappingRows.find(m => m.id === rule.mapping_id || (m.target_attribute_name && m.target_attribute_name === rule.mapping?.target_attribute_name));
    setValidationFormData({
      id: rule.id,
      rule_name: rule.rule_name,
      validation_type: rule.validation_type,
      mapping_id: mapping ? mapping.source_field : (rule.mapping_id || ''),
      parameters: rule.parameters || '',
      severity: rule.severity,
      error_message: rule.error_message,
      execution_order: rule.execution_order,
      enabled: rule.enabled
    });
    setTestValidationValue('');
    setTestValidationStatus('');
    setTestValidationMessage('');
    setShowValidationModal(true);
  };

  const handleSaveValidation = async () => {
    if (!validationFormData.rule_name.trim()) {
      alert("Rule name is required.");
      return;
    }
    if (!validationFormData.error_message.trim()) {
      alert("Error message is required.");
      return;
    }
    const mapping = mappingRows.find(r => r.source_field === validationFormData.mapping_id);
    if (!mapping) {
      alert("A valid attribute mapping is required.");
      return;
    }

    try {
      setValidationSubmitting(true);
      const existingMappings = await getConnectorMappings(selectedConnector.id);
      const backendMapping = existingMappings.find(m => m.source_field === mapping.source_field);
      if (!backendMapping) {
        alert("The mapping was not found on the backend. Please save the Mappings tab configuration first.");
        return;
      }

      const payload = {
        connector_id: selectedConnector.id,
        mapping_id: backendMapping.id,
        rule_name: validationFormData.rule_name,
        validation_type: validationFormData.validation_type,
        parameters: validationFormData.parameters || null,
        severity: validationFormData.severity,
        error_message: validationFormData.error_message,
        execution_order: parseInt(validationFormData.execution_order) || 0,
        enabled: validationFormData.enabled
      };

      if (validationFormData.id) {
        await updateValidationRule(validationFormData.id, payload);
      } else {
        await createValidationRule(selectedConnector.id, payload);
      }
      setShowValidationModal(false);
      fetchValidations();
    } catch (err) {
      alert("Failed to save validation: " + (err.response?.data?.detail || err.message));
    } finally {
      setValidationSubmitting(false);
    }
  };

  const handleDeleteValidation = async (id) => {
    if (!window.confirm("Are you sure you want to delete this validation rule?")) return;
    try {
      await deleteValidationRule(id);
      fetchValidations();
    } catch (err) {
      alert("Failed to delete rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleDuplicateValidation = async (rule) => {
    try {
      const payload = {
        connector_id: rule.connector_id,
        mapping_id: rule.mapping_id,
        rule_name: `${rule.rule_name} (Copy)`,
        validation_type: rule.validation_type,
        parameters: rule.parameters,
        severity: rule.severity,
        error_message: rule.error_message,
        execution_order: rule.execution_order + 1,
        enabled: rule.enabled
      };
      await createValidationRule(rule.connector_id, payload);
      fetchValidations();
    } catch (err) {
      alert("Failed to duplicate rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggleValidationEnabled = async (rule) => {
    try {
      await updateValidationRule(rule.id, { enabled: !rule.enabled });
      fetchValidations();
    } catch (err) {
      alert("Failed to toggle rule: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleTestValidation = async () => {
    if (!testValidationValue) return;
    try {
      setTestingValidation(true);
      setTestValidationStatus('');
      setTestValidationMessage('');
      const res = await testValidationRule({
        value: testValidationValue,
        validation_type: validationFormData.validation_type,
        parameters: validationFormData.parameters || null
      });
      if (res.success) {
        setTestValidationStatus(res.status);
        setTestValidationMessage(res.message || "Value is valid!");
      } else {
        setTestValidationStatus("Error");
        setTestValidationMessage(res.message || "Failed to execute validation test.");
      }
    } catch (err) {
      setTestValidationStatus("Error");
      setTestValidationMessage(err.response?.data?.detail || err.message);
    } finally {
      setTestingValidation(false);
    }
  };

  // ── Preview Handlers ─────────────────────────────────────────────
  const handleGeneratePreview = async () => {
    if (!selectedConnector) return;
    try {
      setGeneratingPreview(true);
      await generateConnectorPreview(selectedConnector.id, selectedTableName || undefined);
      setPreviewPage(1);
      fetchPreviewData();
    } catch (err) {
      alert("Failed to generate preview: " + (err.response?.data?.detail || err.message));
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleClearPreview = async () => {
    if (!selectedConnector) return;
    if (!window.confirm("Are you sure you want to clear the dry-run preview cache?")) return;
    try {
      setClearingPreview(true);
      await clearConnectorPreview(selectedConnector.id);
      setPreviewRecords([]);
      setPreviewTotal(0);
      setPreviewSummary(null);
    } catch (err) {
      alert("Failed to clear preview cache: " + (err.response?.data?.detail || err.message));
    } finally {
      setClearingPreview(false);
    }
  };

  const handleExportPreview = (format) => {
    if (previewRecords.length === 0) {
      alert("No preview records found to export.");
      return;
    }
    
    const exportData = previewRecords.map(rec => {
      let source = {};
      let transformed = {};
      let errorsList = [];
      let warningsList = [];
      try { source = JSON.parse(rec.source_data); } catch(e){}
      try { transformed = JSON.parse(rec.transformed_data); } catch(e){}
      try { errorsList = JSON.parse(rec.errors) || []; } catch(e){}
      try { warningsList = JSON.parse(rec.warnings) || []; } catch(e){}
      
      const flat = {
        "Record Number": rec.record_number,
        "Validation Status": rec.status,
        "Errors": errorsList.join("; "),
        "Warnings": warningsList.join("; ")
      };
      
      Object.keys(source).forEach(k => {
        flat[`Source_${k}`] = source[k];
      });
      Object.keys(transformed).forEach(k => {
        flat[`Transformed_${k}`] = transformed[k];
      });
      
      return flat;
    });

    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `connector_${selectedConnector.connector_name}_preview.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      const headers = Object.keys(exportData[0]);
      const csvRows = [headers.join(",")];
      exportData.forEach(row => {
        const values = headers.map(header => {
          const val = row[header] === undefined ? "" : String(row[header]);
          const escaped = val.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(","));
      });
      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", csvContent);
      downloadAnchor.setAttribute("download", `connector_${selectedConnector.connector_name}_preview.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  const handleOpenDeleteConfirm = (connector, e) => {
    if (e) e.stopPropagation();
    setConnectorToDelete(connector);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!connectorToDelete || deletingRef.current) return;
    try {
      deletingRef.current = true;
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
      if (err.response?.status === 404) {
        // If it returns a 404, it means the connector has already been successfully deleted.
        // We handle this gracefully by closing the confirm modal and updating the view.
        setShowDeleteConfirm(false);
        setConnectorToDelete(null);
        if (selectedConnector?.id === connectorToDelete.id) {
          setView('list');
          setSelectedConnector(null);
        }
        fetchConnectorsList();
        fetchKPIStats();
      } else {
        alert(err.response?.data?.detail || 'Failed to delete connector.');
      }
    } finally {
      deletingRef.current = false;
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
      case 'API Gateway': return <Server size={16} className="type-icon api" style={{ color: '#8b5cf6' }} />;
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
                        <div className={`type-option-card ${formData.connector_type === 'API Gateway' ? 'selected' : ''}`} onClick={() => setFormData((prev) => ({ ...prev, connector_type: 'API Gateway', host: 'https://', database_name: 'data', file_path: '{}', auth_type: 'None' }))}>
                          <div className="option-icon-wrapper database" style={{ color: '#8b5cf6' }}><Server size={24} /></div>
                          <div className="option-text-wrapper">
                            <h5>API Gateway</h5>
                            <p>Query and sync REST/SCIM API endpoints to extract JSON user records.</p>
                          </div>
                          {formData.connector_type === 'API Gateway' && <div className="option-badge"><Check size={12} /></div>}
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
                      {formData.connector_type === 'API Gateway' && (
                        <div className="config-type-section">
                          <h4>API Gateway Endpoint Settings</h4>
                          <div className="input-group-custom">
                            <label className="required">API Endpoint URL</label>
                            <input type="text" name="host" value={formData.host} onChange={handleFieldChange} placeholder="e.g. https://api.system.com/v1/users" />
                            {formErrors.host && <span className="form-error-text">{formErrors.host}</span>}
                          </div>
                          <div className="input-group-custom">
                            <label>JSON Path Property (e.g. "data" or leave blank for root list)</label>
                            <input type="text" name="database_name" value={formData.database_name} onChange={handleFieldChange} placeholder="data" />
                          </div>
                          <div className="input-group-custom">
                            <label>Custom HTTP Headers (JSON Object String)</label>
                            <textarea
                              name="file_path"
                              value={formData.file_path}
                              onChange={handleFieldChange}
                              placeholder='{"Content-Type": "application/json", "X-Custom-Header": "Value"}'
                              rows={2}
                              style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            />
                            {formErrors.file_path && <span className="form-error-text">{formErrors.file_path}</span>}
                          </div>
                          
                          {formData.auth_type === 'Basic' && (
                            <div className="form-row-2col">
                              <div className="input-group-custom">
                                <label className="required">Username</label>
                                <input type="text" name="username" value={formData.username} onChange={handleFieldChange} placeholder="Username" />
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
                          )}

                          {formData.auth_type === 'API Key' && (
                            <div className="form-row-2col">
                              <div className="input-group-custom">
                                <label className="required">API Key Header Name</label>
                                <input type="text" name="username" value={formData.username} onChange={handleFieldChange} placeholder="e.g. Authorization" />
                                {formErrors.username && <span className="form-error-text">{formErrors.username}</span>}
                              </div>
                              <div className="input-group-custom">
                                <label className={editConnectorId ? '' : 'required'}>
                                  Token Value {editConnectorId && '(Leave blank to preserve)'}
                                </label>
                                <div className="password-input-wrapper-wizard">
                                  <Lock size={14} className="password-lock-icon" />
                                  <input type="password" name="password" value={formData.password} onChange={handleFieldChange} placeholder="e.g. Bearer token-value" />
                                </div>
                                {formErrors.password && <span className="form-error-text">{formErrors.password}</span>}
                              </div>
                            </div>
                          )}
                          <div className="input-group-custom">
                            <label>Timeout (seconds)</label>
                            <input type="number" name="connection_timeout" value={formData.connection_timeout} onChange={handleFieldChange} placeholder="30" />
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
                            {formData.connector_type === 'API Gateway' && (
                              <>
                                <div className="review-item"><label>REST URL</label><span>{formData.host}</span></div>
                                <div className="review-item"><label>JSON Path</label><span>{formData.database_name || 'root'}</span></div>
                                <div className="review-item"><label>Auth Scheme</label><span>{formData.auth_type}</span></div>
                                {formData.auth_type !== 'None' && (
                                  <div className="review-item"><label>API Key Header/Username</label><span>{formData.username}</span></div>
                                )}
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

        {showTransformModal && (
          <div className="modal-overlay-custom" style={{ zIndex: 1100 }}>
            <div className="modal-content-custom" style={{ maxWidth: '650px', width: '100%' }}>
              <div className="modal-header-custom">
                <h3>{transformFormData.id ? 'Edit Transformation Rule' : 'Add Transformation Rule'}</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowTransformModal(false)}><X size={18} /></button>
              </div>
              <div className="modal-body-custom" style={{ padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="input-group-custom">
                    <label className="required">Rule Name</label>
                    <input 
                      type="text" 
                      value={transformFormData.rule_name} 
                      onChange={e => setTransformFormData(prev => ({ ...prev, rule_name: e.target.value }))}
                      placeholder="e.g. Clean & Title Case Name"
                    />
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Mapped Attribute</label>
                    <select 
                      value={transformFormData.mapping_id} 
                      onChange={e => setTransformFormData(prev => ({ ...prev, mapping_id: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '100%' }}
                    >
                      <option value="">Select mapped attribute...</option>
                      {mappingRows.filter(r => r.target_attribute_name).map(r => (
                        <option key={r.source_field} value={r.source_field}>
                          {r.target_attribute_name} ({r.source_field})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="input-group-custom">
                    <label className="required">Transformation Type</label>
                    <select 
                      value={transformFormData.transformation_type} 
                      onChange={e => setTransformFormData(prev => ({ ...prev, transformation_type: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '100%' }}
                    >
                      {['Trim', 'Uppercase', 'Lowercase', 'Capitalize', 'Replace', 'Regex Replace', 'Split', 'Concatenate', 'Substring', 'Date Format', 'Number Format', 'Default Value', 'Lookup', 'Expression'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label>Execution Order</label>
                    <input 
                      type="number" 
                      value={transformFormData.execution_order} 
                      onChange={e => setTransformFormData(prev => ({ ...prev, execution_order: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                {/* Conditional Form Configs */}
                {['Replace', 'Regex Replace'].includes(transformFormData.transformation_type) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group-custom">
                      <label className="required">{transformFormData.transformation_type === 'Replace' ? 'Search Text' : 'Regex Pattern'}</label>
                      <input 
                        type="text" 
                        placeholder={transformFormData.transformation_type === 'Replace' ? 'e.g. old_text' : 'e.g. [0-9]+'}
                        value={(() => {
                          try {
                            const p = JSON.parse(transformFormData.parameters || '{}');
                            return p.search || p.pattern || '';
                          } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            if (prev.transformation_type === 'Replace') curr.search = val;
                            else curr.pattern = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                    <div className="input-group-custom">
                      <label>Replacement Text</label>
                      <input 
                        type="text" 
                        placeholder="e.g. new_text"
                        value={(() => {
                          try {
                            const p = JSON.parse(transformFormData.parameters || '{}');
                            return p.replace || '';
                          } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.replace = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {transformFormData.transformation_type === 'Split' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group-custom">
                      <label className="required">Delimiter</label>
                      <input 
                        type="text" 
                        placeholder="e.g. @ or , or space"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').delimiter || ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.delimiter = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                    <div className="input-group-custom">
                      <label>Select Index</label>
                      <input 
                        type="number" 
                        placeholder="0 for first part"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').index ?? ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.index = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {transformFormData.transformation_type === 'Concatenate' && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                      <div className="input-group-custom">
                        <label className="required">Fields to Join (Comma-separated)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. first_name, last_name"
                          value={(() => {
                            try { return (JSON.parse(transformFormData.parameters || '{}').fields || []).join(', '); } catch (e) { return ''; }
                          })()}
                          onChange={e => {
                            const val = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
                            setTransformFormData(prev => {
                              let curr = {};
                              try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                              curr.fields = val;
                              return { ...prev, parameters: JSON.stringify(curr) };
                            });
                          }}
                        />
                      </div>
                      <div className="input-group-custom">
                        <label>Delimiter</label>
                        <input 
                          type="text" 
                          placeholder="e.g. space or -"
                          value={(() => {
                            try { return JSON.parse(transformFormData.parameters || '{}').delimiter ?? ' '; } catch (e) { return ' '; }
                          })()}
                          onChange={e => {
                            const val = e.target.value;
                            setTransformFormData(prev => {
                              let curr = {};
                              try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                              curr.delimiter = val;
                              return { ...prev, parameters: JSON.stringify(curr) };
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div className="input-group-custom">
                        <label>Prefix text</label>
                        <input 
                          type="text" 
                          placeholder="Optional prefix"
                          value={(() => {
                            try { return JSON.parse(transformFormData.parameters || '{}').prefix || ''; } catch (e) { return ''; }
                          })()}
                          onChange={e => {
                            const val = e.target.value;
                            setTransformFormData(prev => {
                              let curr = {};
                              try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                              curr.prefix = val;
                              return { ...prev, parameters: JSON.stringify(curr) };
                            });
                          }}
                        />
                      </div>
                      <div className="input-group-custom">
                        <label>Suffix text</label>
                        <input 
                          type="text" 
                          placeholder="Optional suffix"
                          value={(() => {
                            try { return JSON.parse(transformFormData.parameters || '{}').suffix || ''; } catch (e) { return ''; }
                          })()}
                          onChange={e => {
                            const val = e.target.value;
                            setTransformFormData(prev => {
                              let curr = {};
                              try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                              curr.suffix = val;
                              return { ...prev, parameters: JSON.stringify(curr) };
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {transformFormData.transformation_type === 'Substring' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group-custom">
                      <label className="required">Start Index</label>
                      <input 
                        type="number" 
                        placeholder="0 for beginning"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').start ?? ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.start = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                    <div className="input-group-custom">
                      <label>Length / End Index</label>
                      <input 
                        type="number" 
                        placeholder="Leave blank for end of string"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').end ?? ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            if (val === null) delete curr.end;
                            else curr.end = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {transformFormData.transformation_type === 'Date Format' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group-custom">
                      <label className="required">Source Date Format</label>
                      <input 
                        type="text" 
                        placeholder="e.g. %Y-%m-%d"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').source_format ?? '%Y-%m-%d'; } catch (e) { return '%Y-%m-%d'; }
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.source_format = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                    <div className="input-group-custom">
                      <label className="required">Target Date Format</label>
                      <input 
                        type="text" 
                        placeholder="e.g. %d/%m/%Y"
                        value={(() => {
                          try { return JSON.parse(transformFormData.parameters || '{}').target_format ?? '%d/%m/%Y'; } catch (e) { return '%d/%m/%Y'; }
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          setTransformFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            curr.target_format = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {transformFormData.transformation_type === 'Number Format' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Decimal Places</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 2"
                      value={(() => {
                        try { return JSON.parse(transformFormData.parameters || '{}').decimals ?? 2; } catch (e) { return 2; }
                      })()}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setTransformFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.decimals = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {transformFormData.transformation_type === 'Default Value' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Fallback Value (If Empty)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Active / Standard"
                      value={(() => {
                        try { return JSON.parse(transformFormData.parameters || '{}').default ?? ''; } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const val = e.target.value;
                        setTransformFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.default = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {transformFormData.transformation_type === 'Lookup' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Lookup Mapping (JSON object of key-value matches)</label>
                    <textarea 
                      placeholder='e.g. {"active": "True", "inactive": "False"}'
                      rows={3}
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      value={(() => {
                        try {
                          const p = JSON.parse(transformFormData.parameters || '{}');
                          return p.lookup_map ? JSON.stringify(p.lookup_map) : '';
                        } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const text = e.target.value;
                        setTransformFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          try {
                            curr.lookup_map = JSON.parse(text);
                          } catch(err) {
                            // Keep raw text input inside lookup_map context while parsing
                          }
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {transformFormData.transformation_type === 'Expression' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Formula Expression (Placeholders like {first_name} supported)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. {first_name}.{last_name}@ranalyzer.com"
                      value={transformFormData.expression || ''}
                      onChange={e => setTransformFormData(prev => ({ ...prev, expression: e.target.value }))}
                    />
                  </div>
                )}

                <div className="input-group-custom" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                  <input 
                    type="checkbox" 
                    id="ruleEnabledChk"
                    checked={transformFormData.enabled}
                    onChange={e => setTransformFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="ruleEnabledChk" style={{ margin: 0, cursor: 'pointer', fontWeight: '600' }}>Enable Rule Execution</label>
                </div>

                {/* Dry Run sandbox (Jira 5) */}
                <div style={{ border: '1px dashed var(--border-color)', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.01)', marginBottom: '16px' }}>
                  <h5 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 'bold' }}>Test Rule Sandbox</h5>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Enter sample input string to test..."
                      value={testTransformValue}
                      onChange={e => setTestTransformValue(e.target.value)}
                      style={{ flex: 1, padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                    <button 
                      className="btn-browse-file" 
                      type="button"
                      disabled={testingTransform || !testTransformValue}
                      onClick={handleTestTransformation}
                      style={{ fontSize: '12px' }}
                    >
                      {testingTransform ? 'Testing...' : 'Test Rule'}
                    </button>
                  </div>
                  {testTransformOutput && (
                    <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '600', padding: '6px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '4px' }}>
                      Success: {testTransformOutput}
                    </div>
                  )}
                  {testTransformError && (
                    <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: '600', padding: '6px', backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: '4px' }}>
                      Error: {testTransformError}
                    </div>
                  )}
                </div>

              </div>
              <div className="modal-footer-custom" style={{ padding: '16px 20px' }}>
                <button className="btn-modal-cancel" type="button" onClick={() => setShowTransformModal(false)}>Cancel</button>
                <button className="btn-modal-submit" type="button" disabled={transformSubmitting} onClick={handleSaveTransformation}>
                  {transformSubmitting ? 'Saving...' : 'Save Transformation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showValidationModal && (
          <div className="modal-overlay-custom" style={{ zIndex: 1100 }}>
            <div className="modal-content-custom" style={{ maxWidth: '650px', width: '100%' }}>
              <div className="modal-header-custom">
                <h3>{validationFormData.id ? 'Edit Validation Rule' : 'Add Validation Rule'}</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowValidationModal(false)}><X size={18} /></button>
              </div>
              <div className="modal-body-custom" style={{ padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="input-group-custom">
                    <label className="required">Rule Name</label>
                    <input 
                      type="text" 
                      value={validationFormData.rule_name} 
                      onChange={e => setValidationFormData(prev => ({ ...prev, rule_name: e.target.value }))}
                      placeholder="e.g. Verify Email Format"
                    />
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Mapped Attribute</label>
                    <select 
                      value={validationFormData.mapping_id} 
                      onChange={e => setValidationFormData(prev => ({ ...prev, mapping_id: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '100%' }}
                    >
                      <option value="">Select mapped attribute...</option>
                      {mappingRows.filter(r => r.target_attribute_name).map(r => (
                        <option key={r.source_field} value={r.source_field}>
                          {r.target_attribute_name} ({r.source_field})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="input-group-custom">
                    <label className="required">Validation Type</label>
                    <select 
                      value={validationFormData.validation_type} 
                      onChange={e => setValidationFormData(prev => ({ ...prev, validation_type: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '100%' }}
                    >
                      {['Required', 'Email', 'Phone', 'Regex', 'Minimum Length', 'Maximum Length', 'Unique', 'Allowed Values', 'Numeric', 'Date', 'Range', 'Custom Expression'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Severity</label>
                    <select 
                      value={validationFormData.severity} 
                      onChange={e => setValidationFormData(prev => ({ ...prev, severity: e.target.value }))}
                      style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '100%' }}
                    >
                      <option value="Error">Error (Fails Ingestion)</option>
                      <option value="Warning">Warning (Ingests with Flag)</option>
                      <option value="Info">Info (Audit Log Only)</option>
                    </select>
                  </div>
                </div>

                <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                  <label className="required">Error Message</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Email must contain valid structure with domains"
                    value={validationFormData.error_message} 
                    onChange={e => setValidationFormData(prev => ({ ...prev, error_message: e.target.value }))}
                  />
                </div>

                {/* Conditional Parameter Fields */}
                {['Minimum Length', 'Maximum Length'].includes(validationFormData.validation_type) && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Length Limit (Number of characters)</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 5"
                      value={(() => {
                        try {
                          const p = JSON.parse(validationFormData.parameters || '{}');
                          return p.min_length || p.max_length || '';
                        } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setValidationFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          if (prev.validation_type === 'Minimum Length') curr.min_length = val;
                          else curr.max_length = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {validationFormData.validation_type === 'Regex' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Validation Regex Pattern</label>
                    <input 
                      type="text" 
                      placeholder="e.g. ^[0-9]{5}$"
                      value={(() => {
                        try { return JSON.parse(validationFormData.parameters || '{}').pattern || ''; } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const val = e.target.value;
                        setValidationFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.pattern = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {validationFormData.validation_type === 'Allowed Values' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Allowed Values (Comma-separated list)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Active, Inactive, Suspended"
                      value={(() => {
                        try { return (JSON.parse(validationFormData.parameters || '{}').allowed_values || []).join(', '); } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const val = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
                        setValidationFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.allowed_values = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {validationFormData.validation_type === 'Range' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="input-group-custom">
                      <label>Minimum Value</label>
                      <input 
                        type="number" 
                        placeholder="Optional min"
                        value={(() => {
                          try { return JSON.parse(validationFormData.parameters || '{}').min ?? ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                          setValidationFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            if (val === null) delete curr.min;
                            else curr.min = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                    <div className="input-group-custom">
                      <label>Maximum Value</label>
                      <input 
                        type="number" 
                        placeholder="Optional max"
                        value={(() => {
                          try { return JSON.parse(validationFormData.parameters || '{}').max ?? ''; } catch (e) { return ''; }
                        })()}
                        onChange={e => {
                          const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                          setValidationFormData(prev => {
                            let curr = {};
                            try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                            if (val === null) delete curr.max;
                            else curr.max = val;
                            return { ...prev, parameters: JSON.stringify(curr) };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}

                {validationFormData.validation_type === 'Date' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Date Format validation</label>
                    <input 
                      type="text" 
                      placeholder="e.g. %Y-%m-%d"
                      value={(() => {
                        try { return JSON.parse(validationFormData.parameters || '{}').format ?? '%Y-%m-%d'; } catch (e) { return '%Y-%m-%d'; }
                      })()}
                      onChange={e => {
                        const val = e.target.value;
                        setValidationFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.format = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                {validationFormData.validation_type === 'Custom Expression' && (
                  <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                    <label className="required">Validation Expression (e.g. len(value) &gt; 10)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. len(value) > 5 and value.startswith('ID')"
                      value={(() => {
                        try { return JSON.parse(validationFormData.parameters || '{}').expression || ''; } catch (e) { return ''; }
                      })()}
                      onChange={e => {
                        const val = e.target.value;
                        setValidationFormData(prev => {
                          let curr = {};
                          try { curr = JSON.parse(prev.parameters || '{}'); } catch(err){}
                          curr.expression = val;
                          return { ...prev, parameters: JSON.stringify(curr) };
                        });
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="input-group-custom">
                    <label>Execution Order</label>
                    <input 
                      type="number" 
                      value={validationFormData.execution_order} 
                      onChange={e => setValidationFormData(prev => ({ ...prev, execution_order: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="input-group-custom" style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'center', marginTop: '20px' }}>
                    <input 
                      type="checkbox" 
                      id="valEnabledChk"
                      checked={validationFormData.enabled}
                      onChange={e => setValidationFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="valEnabledChk" style={{ margin: 0, cursor: 'pointer', fontWeight: '600' }}>Enable Rule</label>
                  </div>
                </div>

                {/* Dry Run validation sandbox */}
                <div style={{ border: '1px dashed var(--border-color)', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.01)', marginBottom: '16px' }}>
                  <h5 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 'bold' }}>Test Validation Sandbox</h5>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="Enter sample input string to test..."
                      value={testValidationValue}
                      onChange={e => setTestValidationValue(e.target.value)}
                      style={{ flex: 1, padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                    <button 
                      className="btn-browse-file" 
                      type="button"
                      disabled={testingValidation || !testValidationValue}
                      onClick={handleTestValidation}
                      style={{ fontSize: '12px' }}
                    >
                      {testingValidation ? 'Testing...' : 'Test Validation'}
                    </button>
                  </div>
                  {testValidationStatus && (
                    <div style={{ 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      padding: '6px', 
                      backgroundColor: testValidationStatus === 'Valid' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', 
                      borderRadius: '4px',
                      color: testValidationStatus === 'Valid' ? 'var(--success)' : 'var(--danger)' 
                    }}>
                      Status: {testValidationStatus} {testValidationMessage ? `— ${testValidationMessage}` : ''}
                    </div>
                  )}
                </div>

              </div>
              <div className="modal-footer-custom" style={{ padding: '16px 20px' }}>
                <button className="btn-modal-cancel" type="button" onClick={() => setShowValidationModal(false)}>Cancel</button>
                <button className="btn-modal-submit" type="button" disabled={validationSubmitting} onClick={handleSaveValidation}>
                  {validationSubmitting ? 'Saving...' : 'Save Validation'}
                </button>
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
                <button
                  className="btn-primary"
                  onClick={handleImportNow}
                  disabled={syncingData}
                  style={{
                    padding: '8px 14px', fontSize: '13px', border: 'none',
                    borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff',
                    cursor: syncingData ? 'default' : 'pointer', fontWeight: '600',
                    display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Play size={14} />
                  {syncingData ? 'Importing...' : 'Import Now'}
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

            {syncResult && (
              <div
                style={{
                  margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '500',
                  backgroundColor: syncResult.success ? 'var(--success-light, #10b98120)' : 'var(--danger-light)',
                  color: syncResult.success ? 'var(--success, #10b981)' : 'var(--danger)',
                  border: `1px solid ${syncResult.success ? 'var(--success, #10b981)' : 'var(--danger)'}`
                }}
              >
                {syncResult.success ? (
                  <>
                    ✓ Import completed successfully in {syncResult.duration_ms}ms. 
                    <span style={{ marginLeft: '12px', fontWeight: 'bold' }}>
                      Processed: {syncResult.processed} | Imported: {syncResult.imported} | Warnings: {syncResult.warnings} | Errors: {syncResult.errors}
                    </span>
                  </>
                ) : (
                  <>✗ Sync failed: {syncResult.message}</>
                )}
              </div>
            )}

            {/* Sync Overview Dashboard (Metrics Panel) */}
            <div className="connector-metrics-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>SYNC HEALTH</span>
                  <div className={`status-dot ${selectedConnector.health_status === 'Healthy' ? 'active' : selectedConnector.health_status === 'Degraded' ? 'warning' : 'failed'}`} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>
                  {selectedConnector.health_status || 'Unknown'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Status: {selectedConnector.status}
                </div>
              </div>

              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>LAST SYNCHRONIZED</span>
                  <Clock size={14} className="text-muted" style={{ opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedConnector.last_sync ? new Date(selectedConnector.last_sync + 'Z').toLocaleString('en-US') : 'Never'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Last Tested: {selectedConnector.last_tested ? new Date(selectedConnector.last_tested + 'Z').toLocaleDateString() : 'Never'}
                </div>
              </div>

              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>SYNC ACTIVITY STATS</span>
                  <Activity size={14} className="text-muted" style={{ opacity: 0.7 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>
                  <span style={{ color: 'var(--success, #10b981)' }}>{selectedConnector.success_count || 0} <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)' }}>Success</span></span>
                  <span style={{ color: 'var(--danger, #ef4444)' }}>{selectedConnector.failure_count || 0} <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)' }}>Failed</span></span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Total Sync Executions
                </div>
              </div>

              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>SYNC RUN DURATION</span>
                  <History size={14} className="text-muted" style={{ opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>
                  {selectedConnector.last_sync_duration ? `${selectedConnector.last_sync_duration} ms` : '—'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Last Execution Latency
                </div>
              </div>
            </div>

            <div className="drawer-tabs-navigation" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
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
              <button className={`drawer-tab-btn ${detailTab === 'transformations' ? 'active' : ''}`} onClick={() => setDetailTab('transformations')}>
                <Sliders size={13} /> Transformations ({transformTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'validations' ? 'active' : ''}`} onClick={() => setDetailTab('validations')}>
                <ClipboardCheck size={13} /> Validation ({validationTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'preview' ? 'active' : ''}`} onClick={() => setDetailTab('preview')}>
                <Play size={13} /> Preview
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'schedule' ? 'active' : ''}`} onClick={() => setDetailTab('schedule')}>
                <Clock size={13} /> Schedule
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'import_history' ? 'active' : ''}`} onClick={() => setDetailTab('import_history')}>
                <History size={13} /> Import History ({connectorLogs.filter((l) => ['Import Started', 'Import Run'].includes(l.action)).length})
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
                            {selectedConnector.connector_type === 'API Gateway' && (
                              <>
                                <div className="summary-item" style={{ gridColumn: 'span 2' }}><label>REST API URL</label><span className="mono-text" style={{ wordBreak: 'break-all' }}>{selectedConnector.host}</span></div>
                                <div className="summary-item"><label>JSON Extraction Path</label><span className="mono-text">{selectedConnector.database_name || 'root (Entire Response)'}</span></div>
                                <div className="summary-item"><label>Custom HTTP Headers</label><span className="mono-text">{selectedConnector.file_path || '{}'}</span></div>
                                {selectedConnector.auth_type === 'Basic' && (
                                  <>
                                    <div className="summary-item"><label>Basic Auth Username</label><span>{selectedConnector.username}</span></div>
                                    <div className="summary-item"><label>Password</label><span>•••••••••••• (Encrypted on write)</span></div>
                                  </>
                                )}
                                {selectedConnector.auth_type === 'API Key' && (
                                  <>
                                    <div className="summary-item"><label>API Key Header</label><span className="mono-text">{selectedConnector.username}</span></div>
                                    <div className="summary-item"><label>Token Value</label><span>•••••••••••• (Encrypted on write)</span></div>
                                  </>
                                )}
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

                    {detailTab === 'transformations' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h5 style={{ margin: 0 }}>Transformation Rules</h5>
                          {(userRole === 'Platform Administrator' || userRole === 'Data Steward') && (
                            <button className="btn-primary" onClick={handleOpenTransformAdd} style={{ padding: '6px 12px', fontSize: '12px' }}>
                              <Plus size={13} /> Add Rule
                            </button>
                          )}
                        </div>

                        {transformLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading transformation rules...</p>
                          </div>
                        ) : transformations.length === 0 ? (
                          <div className="drawer-tab-empty-msg" style={{ padding: '40px 0' }}>
                            <Sliders size={24} className="text-muted" />
                            <p>No transformation rules configured for this connector source.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Rule Name</th>
                                  <th style={{ textAlign: 'left' }}>Mapped Attribute</th>
                                  <th style={{ textAlign: 'left' }}>Transformation Type</th>
                                  <th style={{ textAlign: 'left' }}>Order</th>
                                  <th style={{ textAlign: 'left' }}>Status</th>
                                  <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {transformations.map((rule) => (
                                  <tr key={rule.id}>
                                    <td style={{ fontWeight: '600' }}>{rule.rule_name}</td>
                                    <td>
                                      <span className="attr-category-tag" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5' }}>
                                        {rule.mapping?.target_attribute_name || '—'}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="attr-datatype-badge">{rule.transformation_type}</span>
                                    </td>
                                    <td>{rule.execution_order}</td>
                                    <td>
                                      <label className="switch-custom" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input 
                                          type="checkbox" 
                                          checked={rule.enabled} 
                                          onChange={() => handleToggleTransformationEnabled(rule)}
                                          disabled={userRole !== 'Platform Administrator' && userRole !== 'Data Steward'}
                                          style={{ marginRight: '6px' }}
                                        />
                                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                                      </label>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                                        {(userRole === 'Platform Administrator' || userRole === 'Data Steward') && (
                                          <>
                                            <button className="btn-table-action" title="Edit" onClick={() => handleOpenTransformEdit(rule)}>
                                              <Edit size={12} />
                                            </button>
                                            <button className="btn-table-action" title="Duplicate" onClick={() => handleDuplicateTransformation(rule)}>
                                              <Copy size={12} />
                                            </button>
                                          </>
                                        )}
                                        {userRole === 'Platform Administrator' && (
                                          <button className="btn-table-action action-delete" title="Delete" onClick={() => handleDeleteTransformation(rule.id)}>
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {transformTotal > transformLimit && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button 
                                  className="btn-pagination" 
                                  disabled={transformPage === 1}
                                  onClick={() => setTransformPage(prev => prev - 1)}
                                >
                                  Prev
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {transformPage}</span>
                                <button 
                                  className="btn-pagination" 
                                  disabled={transformPage * transformLimit >= transformTotal}
                                  onClick={() => setTransformPage(prev => prev + 1)}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'validations' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h5 style={{ margin: 0 }}>Validation Rules</h5>
                          {(userRole === 'Platform Administrator' || userRole === 'Data Steward') && (
                            <button className="btn-primary" onClick={handleOpenValidationAdd} style={{ padding: '6px 12px', fontSize: '12px' }}>
                              <Plus size={13} /> Add Rule
                            </button>
                          )}
                        </div>

                        {validationLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading validation rules...</p>
                          </div>
                        ) : validations.length === 0 ? (
                          <div className="drawer-tab-empty-msg" style={{ padding: '40px 0' }}>
                            <ClipboardCheck size={24} className="text-muted" />
                            <p>No validation rules configured for this connector source.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Rule Name</th>
                                  <th style={{ textAlign: 'left' }}>Mapped Attribute</th>
                                  <th style={{ textAlign: 'left' }}>Validation Type</th>
                                  <th style={{ textAlign: 'left' }}>Severity</th>
                                  <th style={{ textAlign: 'left' }}>Order</th>
                                  <th style={{ textAlign: 'left' }}>Status</th>
                                  <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {validations.map((rule) => (
                                  <tr key={rule.id}>
                                    <td style={{ fontWeight: '600' }}>{rule.rule_name}</td>
                                    <td>
                                      <span className="attr-category-tag" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5' }}>
                                        {rule.mapping?.target_attribute_name || '—'}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="attr-datatype-badge">{rule.validation_type}</span>
                                    </td>
                                    <td>
                                      <span className={`status-badge ${rule.severity === 'Error' ? 'failed' : rule.severity === 'Warning' ? 'disconnected' : 'connected'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                        {rule.severity}
                                      </span>
                                    </td>
                                    <td>{rule.execution_order}</td>
                                    <td>
                                      <label className="switch-custom" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <input 
                                          type="checkbox" 
                                          checked={rule.enabled} 
                                          onChange={() => handleToggleValidationEnabled(rule)}
                                          disabled={userRole !== 'Platform Administrator' && userRole !== 'Data Steward'}
                                          style={{ marginRight: '6px' }}
                                        />
                                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                                      </label>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                                        {(userRole === 'Platform Administrator' || userRole === 'Data Steward') && (
                                          <>
                                            <button className="btn-table-action" title="Edit" onClick={() => handleOpenValidationEdit(rule)}>
                                              <Edit size={12} />
                                            </button>
                                            <button className="btn-table-action" title="Duplicate" onClick={() => handleDuplicateValidation(rule)}>
                                              <Copy size={12} />
                                            </button>
                                          </>
                                        )}
                                        {userRole === 'Platform Administrator' && (
                                          <button className="btn-table-action action-delete" title="Delete" onClick={() => handleDeleteValidation(rule.id)}>
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {validationTotal > validationLimit && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button 
                                  className="btn-pagination" 
                                  disabled={validationPage === 1}
                                  onClick={() => setValidationPage(prev => prev - 1)}
                                >
                                  Prev
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {validationPage}</span>
                                <button 
                                  className="btn-pagination" 
                                  disabled={validationPage * validationLimit >= validationTotal}
                                  onClick={() => setValidationPage(prev => prev + 1)}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'preview' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h5 style={{ margin: 0 }}>Import Preview (Dry Run)</h5>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn-primary" 
                              onClick={handleGeneratePreview}
                              disabled={generatingPreview || mappingsLoading}
                              style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Play size={12} /> {generatingPreview ? 'Generating...' : 'Generate Preview'}
                            </button>
                            <button 
                              className="btn-modal-cancel" 
                              onClick={handleClearPreview}
                              disabled={clearingPreview || previewRecords.length === 0}
                              style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-main)' }}
                            >
                              Clear Preview
                            </button>
                          </div>
                        </div>

                        {previewLoading && previewRecords.length === 0 ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading import preview dataset...</p>
                          </div>
                        ) : previewRecords.length === 0 ? (
                          <div className="drawer-tab-empty-msg" style={{ padding: '50px 0' }}>
                            <Play size={24} className="text-muted" />
                            <p>No preview records loaded. Click "Generate Preview" to start a dry run.</p>
                          </div>
                        ) : (
                          <>
                            {/* Summary Statistics Cards */}
                            {previewSummary && (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                                  <div className="kpi-card" style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted, #71717a)', fontWeight: '500' }}>Total Records</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginTop: '4px' }}>{previewSummary.total_records}</div>
                                  </div>
                                  <div className="kpi-card" style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--success, #10b981)', fontWeight: '500' }}>Valid Records</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success, #10b981)', marginTop: '4px' }}>{previewSummary.valid_records}</div>
                                  </div>
                                  <div className="kpi-card" style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--warning, #f59e0b)', fontWeight: '500' }}>Warnings</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--warning, #f59e0b)', marginTop: '4px' }}>{previewSummary.warning_records}</div>
                                  </div>
                                  <div className="kpi-card" style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--danger, #ef4444)', fontWeight: '500' }}>Errors</div>
                                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--danger, #ef4444)', marginTop: '4px' }}>{previewSummary.error_records}</div>
                                  </div>
                                </div>

                                {/* Preview Summary Statistics grouped by mapped attributes */}
                                <div style={{ marginBottom: '24px' }}>
                                  <h6 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: '600' }}>Preview Summary Table (Failures by Field)</h6>
                                  {previewSummary.field_stats.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>All field validations passed successfully!</p>
                                  ) : (
                                    <table className="detail-inner-table" style={{ width: '100%' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', width: '40%' }}>Field Name</th>
                                          <th style={{ textAlign: 'center' }}>Errors Count</th>
                                          <th style={{ textAlign: 'center' }}>Warnings Count</th>
                                          <th style={{ textAlign: 'center' }}>Total Failures</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewSummary.field_stats.map(stat => (
                                          <tr key={stat.field_name}>
                                            <td style={{ fontWeight: '600' }}>{stat.field_name}</td>
                                            <td style={{ textAlign: 'center', color: stat.errors_count > 0 ? 'var(--danger)' : 'inherit' }}>{stat.errors_count}</td>
                                            <td style={{ textAlign: 'center', color: stat.warnings_count > 0 ? 'var(--warning)' : 'inherit' }}>{stat.warnings_count}</td>
                                            <td style={{ textAlign: 'center', fontWeight: '700' }}>{stat.total_failures}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </>
                            )}

                            {/* Filters & Export Row */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '12px', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <select 
                                  value={previewStatusFilter}
                                  onChange={e => { setPreviewStatusFilter(e.target.value); setPreviewPage(1); }}
                                  style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                                >
                                  <option value="">All Statuses</option>
                                  <option value="Valid">Valid</option>
                                  <option value="Warning">Warning</option>
                                  <option value="Error">Error</option>
                                </select>
                                <input 
                                  type="text"
                                  placeholder="Search preview records..."
                                  value={previewSearch}
                                  onChange={e => { setPreviewSearch(e.target.value); setPreviewPage(1); }}
                                  style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '220px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                                />
                                <button className="btn-browse-file" onClick={fetchPreviewData} style={{ padding: '6px 10px' }}>Search</button>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-browse-file" style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }} onClick={() => handleExportPreview('csv')}>
                                  <FileSpreadsheet size={13} /> Export CSV/Excel
                                </button>
                                <button className="btn-browse-file" style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }} onClick={() => handleExportPreview('json')}>
                                  <FileText size={13} /> Export JSON
                                </button>
                              </div>
                            </div>

                            {/* Main Preview Grid */}
                            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '16px' }}>
                              <table className="detail-inner-table" style={{ width: '100%', margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Record</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                                    {mappingRows.filter(r => r.target_attribute_name).map(r => (
                                      <th key={r.target_attribute_name} style={{ textAlign: 'left' }}>
                                        {r.target_attribute_name}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewRecords.map((rec) => {
                                    let srcData = {};
                                    let trsData = {};
                                    let valData = {};
                                    try { srcData = JSON.parse(rec.source_data) || {}; } catch(e){}
                                    try { trsData = JSON.parse(rec.transformed_data) || {}; } catch(e){}
                                    try { valData = JSON.parse(rec.validation_result) || {}; } catch(e){}

                                    const mappedFields = mappingRows.filter(r => r.target_attribute_name);

                                    return (
                                      <tr key={rec.id}>
                                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>#{rec.record_number}</td>
                                        <td style={{ textAlign: 'center' }}>
                                          <span className={`status-badge ${rec.status === 'Valid' ? 'connected' : rec.status === 'Warning' ? 'disconnected' : 'failed'}`}>
                                            {rec.status}
                                          </span>
                                        </td>
                                        {mappedFields.map(field => {
                                          const attr = field.target_attribute_name;
                                          const origVal = srcData[attr] ?? '';
                                          const transVal = trsData[attr] ?? '';
                                          const isChanged = origVal !== transVal;
                                          const fieldIssues = valData[attr] || [];
                                          const isError = fieldIssues.some(i => i.status === 'Error');
                                          const isWarning = fieldIssues.some(i => i.status === 'Warning');

                                          let cellStyle = { 
                                            position: 'relative', 
                                            padding: '10px',
                                            transition: 'all 0.2s'
                                          };
                                          
                                          if (isError) {
                                            cellStyle.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                                            cellStyle.borderLeft = '3px solid var(--danger, #ef4444)';
                                          } else if (isWarning) {
                                            cellStyle.backgroundColor = 'rgba(245, 158, 11, 0.08)';
                                            cellStyle.borderLeft = '3px solid var(--warning, #f59e0b)';
                                          } else if (isChanged) {
                                            cellStyle.backgroundColor = 'rgba(59, 130, 246, 0.06)';
                                          }

                                          return (
                                            <td key={attr} style={cellStyle}>
                                              <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {transVal || <span style={{ opacity: 0.35 }}>[blank]</span>}
                                                {isChanged && (
                                                  <span style={{ fontSize: '9px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '1px 4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                    Transformed
                                                  </span>
                                                )}
                                              </div>
                                              {isChanged && (
                                                <div style={{ fontSize: '10px', opacity: 0.55, textDecoration: 'line-through', marginTop: '2px' }}>
                                                  Orig: {origVal || '[blank]'}
                                                </div>
                                              )}
                                              {fieldIssues.map((issue, issueIdx) => (
                                                <div 
                                                  key={issueIdx} 
                                                  style={{ 
                                                    fontSize: '10px', 
                                                    fontWeight: '600', 
                                                    color: issue.status === 'Error' ? 'var(--danger)' : 'var(--warning)', 
                                                    marginTop: '3px' 
                                                  }}
                                                >
                                                  ⚠️ {issue.message}
                                                </div>
                                              ))}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {previewTotal > previewLimit && (
                              <div className="pagination-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button 
                                  className="btn-pagination" 
                                  disabled={previewPage === 1}
                                  onClick={() => { setPreviewPage(prev => prev - 1); fetchPreviewData(); }}
                                >
                                  Prev
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {previewPage}</span>
                                <button 
                                  className="btn-pagination" 
                                  disabled={previewPage * previewLimit >= previewTotal}
                                  onClick={() => { setPreviewPage(prev => prev + 1); fetchPreviewData(); }}
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'schedule' && (
                      <div className="drawer-tab-info-pane">
                        <h5>Automated Testing Schedule</h5>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                          When enabled, this connector's connection will be automatically re-tested on the interval below.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={scheduleEnabled}
                              onChange={(e) => { setScheduleEnabled(e.target.checked); setScheduleSaved(false); }}
                            />
                            <span style={{ fontWeight: '600', fontSize: '13px' }}>Enable Scheduled Testing</span>
                          </label>
                        </div>
                        {scheduleEnabled && (
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Frequency</label>
                              <select
                                value={scheduleFrequency}
                                onChange={(e) => { setScheduleFrequency(e.target.value); setScheduleSaved(false); }}
                                style={{ padding: '7px 10px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                              >
                                <option value="Hourly">Hourly</option>
                                <option value="Daily">Daily</option>
                                <option value="Weekly">Weekly</option>
                              </select>
                            </div>
                            {scheduleFrequency !== 'Hourly' && (
                              <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Execution Time</label>
                                <input
                                  type="time"
                                  value={scheduleTime}
                                  onChange={(e) => { setScheduleTime(e.target.value); setScheduleSaved(false); }}
                                  style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', width: '120px' }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {selectedConnector.next_scheduled_run && scheduleEnabled && (
                          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Next scheduled run: {new Date(selectedConnector.next_scheduled_run + 'Z').toLocaleString('en-US')}
                          </div>
                        )}
                        {scheduleError && (
                          <div className="error-banner" style={{ marginBottom: '12px' }}>{scheduleError}</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={handleSaveSchedule}
                            disabled={scheduleSaving}
                            style={{
                              padding: '8px 16px', fontSize: '13px', border: 'none', borderRadius: '6px',
                              backgroundColor: 'var(--primary)', color: '#fff',
                              cursor: scheduleSaving ? 'default' : 'pointer', fontWeight: '600',
                              display: 'inline-flex', alignItems: 'center', gap: '6px'
                            }}
                          >
                            <Save size={13} />
                            {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                          </button>
                          {scheduleSaved && (
                            <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: '600' }}>Saved</span>
                          )}
                        </div>
                      </div>
                    )}

                    {detailTab === 'import_history' && (
                      <div className="drawer-tab-logs-pane">
                        <h5>Connector Data Import History</h5>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                          A history of manual and automated sync imports executed for this connector.
                        </p>
                        {connectorLogs.filter((l) => ['Import Started', 'Import Run'].includes(l.action)).length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <History size={24} className="text-muted" />
                            <p>No data import runs have been executed yet.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {connectorLogs
                              .filter((l) => ['Import Started', 'Import Run'].includes(l.action))
                              .map((log) => (
                                <div key={log.id} className="history-record-card log-card" style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '10px', backgroundColor: 'var(--bg-card)' }}>
                                  <div className="log-badge-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span className={`status-badge ${log.status.toLowerCase() === 'success' ? 'connected' : log.status.toLowerCase() === 'failed' ? 'failed' : 'disconnected'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                                        {log.status}
                                      </span>
                                      <span className="log-action-text" style={{ fontWeight: '600', fontSize: '13px' }}>{log.action}</span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                      {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="log-details-text" style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-main)', lineHeight: '1.4' }}>
                                    {log.details}
                                  </p>
                                </div>
                              ))}
                          </div>
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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Total Connectors" value={kpiStats.total} icon={Layers} color="blue" loading={loading} />
        <DashboardCard title="CSV Connectors" value={kpiStats.csv} icon={FileText} color="indigo" loading={loading} />
        <DashboardCard title="Excel Connectors" value={kpiStats.excel} icon={FileSpreadsheet} color="teal" loading={loading} />
        <DashboardCard title="Database Connectors" value={kpiStats.database} icon={Database} color="purple" loading={loading} />
        <DashboardCard title="LDAP Connectors" value={kpiStats.ldap} icon={Globe} color="blue" loading={loading} />
        <DashboardCard title="API Gateways" value={kpiStats.api} icon={Server} color="purple" loading={loading} />
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
            <option value="API Gateway">API Gateway</option>
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