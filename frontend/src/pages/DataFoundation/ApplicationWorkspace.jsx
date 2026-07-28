import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
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
  RotateCcw,
  User,
  Eye,
  ArrowLeft,
  Clock,
  Users,
  Shield,
  Key,
  ArrowRightLeft,
  Save,
  History,
  ChevronDown
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { getPageNumbers } from '../../utils/pagination';
import {
  getApplications,
  getApplication,
  createApplication,
  updateApplication,
  deleteApplication,
  uploadApplicationFile,
  readApplicationExcelSheets,
  getApplicationAuditLogs,
  testApplication,
  getApplicationSchema,
  importApplicationAccounts,
  getApplicationAccounts,
  bulkDeleteApplicationAccounts,
  importApplicationEntitlements,
  getApplicationEntitlements,
  importApplicationRoles,
  getApplicationRoles,
  getApplicationMappings,
  saveApplicationMappings,
  getApplicationImportHistory,
  searchOwnerCandidates
} from '../../services/applicationService';
import './ApplicationWorkspace.css';
const MAPPING_MODULES = ['Account', 'Entitlement', 'Role'];

const TARGET_ATTRIBUTE_OPTIONS = {
  Account: [
    { value: 'account_id', label: 'Account ID' },
    { value: 'account_name', label: 'Account Name' },
    { value: 'email', label: 'Email' },
    { value: 'status', label: 'Status' },
    { value: 'entitlements', label: 'Entitlements (comma-separated)' }
  ],
  Entitlement: [
    { value: 'entitlement_name', label: 'Entitlement Name' },
    { value: 'entitlement_type', label: 'Entitlement Type' },
    { value: 'description', label: 'Description' }
  ],
  Role: [
    { value: 'role_name', label: 'Role Name' },
    { value: 'description', label: 'Description' }
  ]
};
// Step 1 "Choose Application Ingestion Type" options - same dropdown
// pattern used on the Data Source wizard's connector-type step.
const APPLICATION_TYPE_OPTIONS = [
  {
    value: 'CSV', label: 'CSV Flat File', icon: FileText, color: '#2563eb',
    description: 'Upload comma or character separated values files directly from application exports.'
  },
  {
    value: 'Excel', label: 'Excel Workbook', icon: FileSpreadsheet, color: '#16a34a',
    description: 'Import sheets from Microsoft Excel xlsx files with multi-sheet parsing capabilities.'
  },
];

const INITIAL_FORM_STATE = {
  application_name: '',
  application_type: 'CSV',
  description: '',
  status: 'Draft',
  health_status: 'Unknown',
  environment: 'Development',
  tags: '',
  owner_id: null,
  owner_employee_id: '',
  owner_name: '',
  owner_email: '',
  csv_delimiter: ',',
  csv_encoding: 'UTF-8',
  excel_sheet_name: '',
  file_path: ''
};

const ApplicationWorkspace = () => {
  const [view, setView] = useState('list');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const deletingRef = React.useRef(false);

  // Application list state
  const [applications, setApplications] = useState([]);
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
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [kpiStats, setKpiStats] = useState({
    total: 0, csv: 0, excel: 0, healthy: 0, configured: 0, failed: 0
  });

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editApplicationId, setEditApplicationId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});

  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [formBannerError, setFormBannerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [excelSheets, setExcelSheets] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  // Detail view state
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [detailTab, setDetailTab] = useState('info');
  const [applicationAudits, setApplicationAudits] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(null);
  const [mappingRows, setMappingRows] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingsSaving, setMappingsSaving] = useState(false);
  const [mappingsSaved, setMappingsSaved] = useState(false);
  const [mappingsError, setMappingsError] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const [importHistoryLoading, setImportHistoryLoading] = useState(false);
  const [importHistoryTotal, setImportHistoryTotal] = useState(0);
  const [importHistoryTotalPages, setImportHistoryTotalPages] = useState(0);
  const [importHistoryPage, setImportHistoryPage] = useState(1);
  const [importHistoryLimit] = useState(10);
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsTotalPages, setAccountsTotalPages] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsLimit] = useState(10);
  const [accountsSearch, setAccountsSearch] = useState('');
  const [importingAccounts, setImportingAccounts] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [bulkDeletingAccounts, setBulkDeletingAccounts] = useState(false);
  const [showBulkDeleteAccountsConfirm, setShowBulkDeleteAccountsConfirm] = useState(false);

  const [entitlements, setEntitlements] = useState([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsTotal, setEntitlementsTotal] = useState(0);
  const [entitlementsTotalPages, setEntitlementsTotalPages] = useState(0);
  const [entitlementsPage, setEntitlementsPage] = useState(1);
  const [entitlementsLimit] = useState(10);
  const [entitlementsSearch, setEntitlementsSearch] = useState('');
  const [importingEntitlements, setImportingEntitlements] = useState(false);
  const [entitlementImportResult, setEntitlementImportResult] = useState(null);

  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesTotal, setRolesTotal] = useState(0);
  const [rolesTotalPages, setRolesTotalPages] = useState(0);
  const [rolesPage, setRolesPage] = useState(1);
  const [rolesLimit] = useState(10);
  const [rolesSearch, setRolesSearch] = useState('');
  const [importingRoles, setImportingRoles] = useState(false);
  const [roleImportResult, setRoleImportResult] = useState(null);

  // Owner picker state for wizard & quick modal
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerCandidates, setOwnerCandidates] = useState([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  // Quick Assign Owner modal state
  const [showAssignOwnerModal, setShowAssignOwnerModal] = useState(false);
  const [quickOwnerId, setQuickOwnerId] = useState(null);
  const [quickOwnerEmpId, setQuickOwnerEmpId] = useState('');
  const [quickOwnerName, setQuickOwnerName] = useState('');
  const [quickOwnerEmail, setQuickOwnerEmail] = useState('');
  const [quickOwnerSearchQuery, setQuickOwnerSearchQuery] = useState('');
  const [quickOwnerCandidates, setQuickOwnerCandidates] = useState([]);
  const [quickOwnerLoading, setQuickOwnerLoading] = useState(false);
  const [showQuickOwnerDropdown, setShowQuickOwnerDropdown] = useState(false);
  const [quickOwnerSubmitting, setQuickOwnerSubmitting] = useState(false);
  const latestOwnerQueryRef = React.useRef('');
  const latestOwnerSearchRef = React.useRef('');

  const handleOwnerSearch = async (q) => {
    setOwnerSearchQuery(q);
    latestOwnerSearchRef.current = q;
    if (!q || q.trim().length < 1) {
      setOwnerCandidates([]);
      setShowOwnerDropdown(false);
      return;
    }
    try {
      setOwnerLoading(true);
      const res = await searchOwnerCandidates(q.trim());
      if (latestOwnerSearchRef.current !== q) return; // a newer search superseded this one
      setOwnerCandidates(res || []);
      setShowOwnerDropdown(true);
    } catch (err) {
      console.error('Failed to search owner candidates:', err);
    } finally {
      if (latestOwnerSearchRef.current === q) setOwnerLoading(false);
    }
  };

  const handleSelectOwner = (candidate) => {
    setFormData((prev) => ({
      ...prev,
      owner_id: candidate.id,
      owner_employee_id: candidate.employee_id || '',
      owner_name: candidate.name,
      owner_email: candidate.email
    }));
    setOwnerSearchQuery('');
    setShowOwnerDropdown(false);
  };

  const handleClearOwner = () => {
    setFormData((prev) => ({
      ...prev,
      owner_id: null,
      owner_employee_id: '',
      owner_name: '',
      owner_email: ''
    }));
    setOwnerSearchQuery('');
    setShowOwnerDropdown(false);
  };

  const handleOpenAssignOwnerModal = () => {
    if (!selectedApplication) return;
    setQuickOwnerId(selectedApplication.owner_id || null);
    setQuickOwnerEmpId(selectedApplication.owner_employee_id || '');
    setQuickOwnerName(selectedApplication.owner_name || '');
    setQuickOwnerEmail(selectedApplication.owner_email || '');
    setQuickOwnerSearchQuery('');
    setQuickOwnerCandidates([]);
    setShowQuickOwnerDropdown(false);
    setShowAssignOwnerModal(true);
  };

  const handleQuickOwnerSearch = async (q) => {
    setQuickOwnerSearchQuery(q);
    // Guard against out-of-order responses: if the user types quickly, an
    // earlier keystroke's request can resolve AFTER a later one and
    // overwrite the correct results with stale ones. Track the latest
    // query issued and drop any response that isn't for it anymore.
    latestOwnerQueryRef.current = q;
    if (!q || q.trim().length < 1) {
      setQuickOwnerCandidates([]);
      setShowQuickOwnerDropdown(false);
      return;
    }
    try {
      setQuickOwnerLoading(true);
      const res = await searchOwnerCandidates(q.trim());
      if (latestOwnerQueryRef.current !== q) return; // a newer search superseded this one
      setQuickOwnerCandidates(res || []);
      setShowQuickOwnerDropdown(true);
    } catch (err) {
      console.error('Failed to search owner candidates:', err);
    } finally {
      if (latestOwnerQueryRef.current === q) setQuickOwnerLoading(false);
    }
  };

  const handleSelectQuickOwner = (cand) => {
    setQuickOwnerId(cand.id);
    setQuickOwnerEmpId(cand.employee_id || '');
    setQuickOwnerName(cand.name);
    setQuickOwnerEmail(cand.email);
    setQuickOwnerSearchQuery('');
    setShowQuickOwnerDropdown(false);
  };

  const handleSaveQuickOwner = async () => {
    if (!selectedApplication) return;
    try {
      setQuickOwnerSubmitting(true);
      const updated = await updateApplication(selectedApplication.id, {
        owner_id: quickOwnerId,
        owner_employee_id: quickOwnerEmpId.trim() || null,
        owner_name: quickOwnerName.trim() || null,
        owner_email: quickOwnerEmail.trim() || null
      });
      setSelectedApplication(updated);
      setShowAssignOwnerModal(false);
      fetchApplicationsList();
    } catch (err) {
      console.error('Failed to update owner:', err);
      alert(err.response?.data?.detail || 'Failed to update application owner.');
    } finally {
      setQuickOwnerSubmitting(false);
    }
  };

  const fetchApplicationsList = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = {
        page, limit,
        search: search.trim() || undefined,
        application_type: filterType || undefined,
        status: filterStatus || undefined,
        sortBy, sortOrder
      };
      const data = await getApplications(params);
      setApplications(data.applications || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch (err) {
      console.error('Failed to load applications:', err);
      setErrorMsg('Failed to load applications. Please verify backend connection.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filterType, filterStatus, sortBy, sortOrder]);

  const fetchKPIStats = useCallback(async () => {
    try {
      const data = await getApplications({ page: 1, limit: 1000 });
      const list = data.applications || [];
      setKpiStats({
        total: list.length,
        csv: list.filter((a) => a.application_type === 'CSV').length,
        excel: list.filter((a) => a.application_type === 'Excel').length,
        healthy: list.filter((a) => a.health_status === 'Healthy').length,
        configured: list.filter((a) => ['Draft', 'Configured'].includes(a.status)).length,
        failed: list.filter((a) => a.health_status === 'Unhealthy').length
      });
    } catch (err) {
      console.error('Failed to calculate application KPIs:', err);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      fetchApplicationsList();
      fetchKPIStats();
    }
  }, [fetchApplicationsList, fetchKPIStats, view]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterType('');
    setFilterStatus('');
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
    setEditApplicationId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setSelectedFile(null);
    setExcelSheets([]);
    setOwnerSearchQuery('');
    setOwnerCandidates([]);
    setShowOwnerDropdown(false);
    setWizardStep(1);
    setShowWizard(true);
  };

  const handleOpenEditWizard = (application, e) => {
    if (e) e.stopPropagation();
    setEditApplicationId(application.id);
    setFormData({
      application_name: application.application_name,
      application_type: application.application_type,
      description: application.description || '',
      status: application.status,
      health_status: application.health_status,
      environment: application.environment,
      tags: application.tags || '',
      owner_id: application.owner_id || null,
      owner_employee_id: application.owner_employee_id || '',
      owner_name: application.owner_name || '',
      owner_email: application.owner_email || '',
      csv_delimiter: application.csv_delimiter || ',',
      csv_encoding: application.csv_encoding || 'UTF-8',
      excel_sheet_name: application.excel_sheet_name || '',
      file_path: application.file_path || ''
    });
    setFormErrors({});
    setFormBannerError(null);
    setSelectedFile(null);
    setExcelSheets([]);
    setOwnerSearchQuery('');
    setOwnerCandidates([]);
    setShowOwnerDropdown(false);
    setWizardStep(1);
    setShowWizard(true);
  };

  const handleNextStep = async () => {
    const errors = {};
    if (wizardStep === 1) {
      if (!formData.application_type) errors.application_type = 'Please select an application type';
    } else if (wizardStep === 2) {
      if (!formData.application_name || !formData.application_name.trim()) {
        errors.application_name = 'Application Name is required';
      }
    } else if (wizardStep === 3) {
      if (formData.application_type === 'Excel') {
        if (!editApplicationId && !selectedFile) errors.file = 'Workbook file upload is required';
        if (excelSheets.length > 0 && !formData.excel_sheet_name) errors.excel_sheet_name = 'Please select an Excel Sheet';
      } else if (formData.application_type === 'CSV') {
        if (!editApplicationId && !selectedFile) errors.file = 'CSV file upload is required';
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
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setFormData((prev) => ({ ...prev, excel_sheet_name: '' }));
    if (formData.application_type === 'Excel') {
      try {
        setSheetLoading(true);
        const res = await readApplicationExcelSheets(file);
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
      const finalStatus = editApplicationId ? 'Configured' : 'Draft';
      const payload = {
        ...formData,
        status: finalStatus
      };

      let savedApplication;
      if (editApplicationId) {
        savedApplication = await updateApplication(editApplicationId, payload);
      } else {
        savedApplication = await createApplication(payload);
      }
      if (selectedFile && savedApplication && savedApplication.id) {
        await uploadApplicationFile(savedApplication.id, selectedFile);
      }
      setShowWizard(false);

      if (view === 'detail' && editApplicationId === selectedApplication?.id) {
        const updated = await getApplication(editApplicationId);
        setSelectedApplication(updated);
      } else {
        fetchApplicationsList();
        fetchKPIStats();
      }
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save application configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetail = async (application) => {
    setSelectedApplication(application);
    setDetailTab('info');
    setView('detail');
    setTestResult(null);
    setSchemaFields([]);
    setSchemaError(null);
    setAccounts([]);
    setAccountsTotal(0);
    setAccountsTotalPages(0);
    setAccountsPage(1);
    setAccountsSearch('');
    setImportResult(null);
    setEntitlements([]);
    setEntitlementsTotal(0);
    setEntitlementsTotalPages(0);
    setEntitlementsPage(1);
    setEntitlementsSearch('');
    setEntitlementImportResult(null);
    setRoles([]);
    setRolesTotal(0);
    setRolesTotalPages(0);
    setRolesPage(1);
    setRolesSearch('');
    setRoleImportResult(null);
    setMappingRows([]);
    setMappingsError(null);
    setMappingsSaved(false);
    setImportHistory([]);
    setImportHistoryPage(1);
    fetchDetailSubData(application.id);
  };

  const fetchAccounts = useCallback(async () => {
    if (!selectedApplication) return;
    try {
      setAccountsLoading(true);
      const params = { page: accountsPage, limit: accountsLimit };
      if (accountsSearch.trim()) params.search = accountsSearch.trim();
      const res = await getApplicationAccounts(selectedApplication.id, params);
      setAccounts(res.accounts || []);
      setAccountsTotal(res.total || 0);
      setAccountsTotalPages(res.total_pages || 0);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  }, [selectedApplication, accountsPage, accountsLimit, accountsSearch]);

  useEffect(() => {
    if (detailTab === 'accounts' && selectedApplication) {
      fetchAccounts();
    }
  }, [detailTab, fetchAccounts, selectedApplication]);

  const handleImportAccounts = async () => {
    if (!selectedApplication) return;
    try {
      setImportingAccounts(true);
      setImportResult(null);
      const result = await importApplicationAccounts(selectedApplication.id);
      setImportResult(result);
      setAccountsPage(1);
      fetchAccounts();
    } catch (err) {
      console.error('Account import failed:', err);
      setImportResult({
        success: false,
        message: err.response?.data?.detail || 'Account import failed unexpectedly.'
      });
    } finally {
      setImportingAccounts(false);
    }
  };

  const handleBulkDeleteAccounts = () => {
    if (!selectedApplication || !accountsSearch.trim()) return;
    setShowBulkDeleteAccountsConfirm(true);
  };

  const handleConfirmBulkDeleteAccounts = async () => {
    if (!selectedApplication || !accountsSearch.trim()) return;
    const term = accountsSearch.trim();
    try {
      setBulkDeletingAccounts(true);
      const result = await bulkDeleteApplicationAccounts(selectedApplication.id, term);
      setImportResult({ success: true, message: `Deleted ${result.deleted_count} account(s) matching "${term}".` });
      setAccountsPage(1);
      fetchAccounts();
      setShowBulkDeleteAccountsConfirm(false);
    } catch (err) {
      console.error('Bulk delete accounts failed:', err);
      setImportResult({
        success: false,
        message: err.response?.data?.detail || 'Bulk delete failed unexpectedly.'
      });
      setShowBulkDeleteAccountsConfirm(false);
    } finally {
      setBulkDeletingAccounts(false);
    }
  };
  const fetchEntitlements = useCallback(async () => {
    if (!selectedApplication) return;
    try {
      setEntitlementsLoading(true);
      const params = { page: entitlementsPage, limit: entitlementsLimit };
      if (entitlementsSearch.trim()) params.search = entitlementsSearch.trim();
      const res = await getApplicationEntitlements(selectedApplication.id, params);
      setEntitlements(res.entitlements || []);
      setEntitlementsTotal(res.total || 0);
      setEntitlementsTotalPages(res.total_pages || 0);
    } catch (err) {
      console.error('Failed to load entitlements:', err);
    } finally {
      setEntitlementsLoading(false);
    }
  }, [selectedApplication, entitlementsPage, entitlementsLimit, entitlementsSearch]);

  useEffect(() => {
    if (detailTab === 'entitlements' && selectedApplication) {
      fetchEntitlements();
    }
  }, [detailTab, fetchEntitlements, selectedApplication]);

  const handleImportEntitlements = async () => {
    if (!selectedApplication) return;
    try {
      setImportingEntitlements(true);
      setEntitlementImportResult(null);
      const result = await importApplicationEntitlements(selectedApplication.id);
      setEntitlementImportResult(result);
      setEntitlementsPage(1);
      fetchEntitlements();
    } catch (err) {
      console.error('Entitlement import failed:', err);
      setEntitlementImportResult({
        success: false,
        message: err.response?.data?.detail || 'Entitlement import failed unexpectedly.'
      });
    } finally {
      setImportingEntitlements(false);
    }
  };

  const fetchRoles = useCallback(async () => {
    if (!selectedApplication) return;
    try {
      setRolesLoading(true);
      const params = { page: rolesPage, limit: rolesLimit };
      if (rolesSearch.trim()) params.search = rolesSearch.trim();
      const res = await getApplicationRoles(selectedApplication.id, params);
      setRoles(res.roles || []);
      setRolesTotal(res.total || 0);
      setRolesTotalPages(res.total_pages || 0);
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setRolesLoading(false);
    }
  }, [selectedApplication, rolesPage, rolesLimit, rolesSearch]);

  useEffect(() => {
    if (detailTab === 'roles' && selectedApplication) {
      fetchRoles();
    }
  }, [detailTab, fetchRoles, selectedApplication]);

  const handleImportRoles = async () => {
    if (!selectedApplication) return;
    try {
      setImportingRoles(true);
      setRoleImportResult(null);
      const result = await importApplicationRoles(selectedApplication.id);
      setRoleImportResult(result);
      setRolesPage(1);
      fetchRoles();
    } catch (err) {
      console.error('Role import failed:', err);
      setRoleImportResult({
        success: false,
        message: err.response?.data?.detail || 'Role import failed unexpectedly.'
      });
    } finally {
      setImportingRoles(false);
    }
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedApplication(null);
    fetchApplicationsList();
    fetchKPIStats();
  };

  const fetchDetailSubData = async (applicationId) => {
    try {
      setDetailLoading(true);
      const audits = await getApplicationAuditLogs(applicationId);
      setApplicationAudits(audits || []);
    } catch (err) {
      console.error('Failed to load detail history data:', err);
    } finally {
      setDetailLoading(false);
    }

    // Fetch real Accounts/Entitlements/Roles counts for the tab badges
    // right away, regardless of which tab happens to be active. Without
    // this, the badges kept showing whatever was left over from the
    // previously-viewed application until the user actually clicked into
    // that specific tab (each tab only fetches its own data on click) -
    // e.g. opening a brand-new application could show a stale non-zero
    // "Accounts" count carried over from a different application.
    try {
      const [accountsRes, entitlementsRes, rolesRes] = await Promise.all([
        getApplicationAccounts(applicationId, { page: 1, limit: 1 }),
        getApplicationEntitlements(applicationId, { page: 1, limit: 1 }),
        getApplicationRoles(applicationId, { page: 1, limit: 1 })
      ]);
      setAccountsTotal(accountsRes.total || 0);
      setEntitlementsTotal(entitlementsRes.total || 0);
      setRolesTotal(rolesRes.total || 0);
    } catch (err) {
      console.error('Failed to load tab counts:', err);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedApplication) return;
    try {
      setTestingConnection(true);
      setTestResult(null);
      const result = await testApplication(selectedApplication.id);
      setTestResult(result);
      const updated = await getApplication(selectedApplication.id);
      setSelectedApplication(updated);
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

  const handleDiscoverSchema = async () => {
    if (!selectedApplication) return;
    try {
      setSchemaLoading(true);
      setSchemaError(null);
      setSchemaFields([]);
      const res = await getApplicationSchema(selectedApplication.id);
      setSchemaFields(res.fields || []);
    } catch (err) {
      console.error('Schema discovery failed:', err);
      setSchemaError(err.response?.data?.detail || 'Schema discovery failed unexpectedly.');
    } finally {
      setSchemaLoading(false);
    }
  };
  const handleOpenMappingTab = async () => {
    setDetailTab('mapping');
    if (!selectedApplication) return;
    if (schemaFields.length === 0) return;
    await loadMappingData();
  };

  const loadMappingData = async () => {
    try {
      setMappingsLoading(true);
      setMappingsError(null);
      setMappingsSaved(false);
      const existingMappings = await getApplicationMappings(selectedApplication.id);
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
    if (!selectedApplication) return;
    try {
      setMappingsSaving(true);
      setMappingsError(null);
      const payload = mappingRows
        .filter((r) => r.target_module && r.target_attribute_name)
        .map((r) => ({
          source_field: r.source_field,
          target_module: r.target_module,
          target_attribute_name: r.target_attribute_name
        }));
      await saveApplicationMappings(selectedApplication.id, payload);
      setMappingsSaved(true);
    } catch (err) {
      console.error('Failed to save mappings:', err);
      setMappingsError(err.response?.data?.detail || 'Failed to save attribute mappings.');
    } finally {
      setMappingsSaving(false);
    }
  };
  const fetchImportHistory = useCallback(async () => {
    if (!selectedApplication) return;
    try {
      setImportHistoryLoading(true);
      const params = { page: importHistoryPage, limit: importHistoryLimit };
      const res = await getApplicationImportHistory(selectedApplication.id, params);
      setImportHistory(res.history || []);
      setImportHistoryTotal(res.total || 0);
      setImportHistoryTotalPages(res.total_pages || 0);
    } catch (err) {
      console.error('Failed to load import history:', err);
    } finally {
      setImportHistoryLoading(false);
    }
  }, [selectedApplication, importHistoryPage, importHistoryLimit]);

  useEffect(() => {
    if (detailTab === 'import_history' && selectedApplication) {
      fetchImportHistory();
    }
  }, [detailTab, fetchImportHistory, selectedApplication]);

  const handleOpenDeleteConfirm = (application, e) => {
    if (e) e.stopPropagation();
    setApplicationToDelete(application);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!applicationToDelete || deletingRef.current) return;
    try {
      deletingRef.current = true;
      setDeleteSubmitting(true);
      await deleteApplication(applicationToDelete.id);
      setShowDeleteConfirm(false);
      setApplicationToDelete(null);
      if (selectedApplication?.id === applicationToDelete.id) {
        setView('list');
        setSelectedApplication(null);
      }
      fetchApplicationsList();
      fetchKPIStats();
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) {
        setShowDeleteConfirm(false);
        setApplicationToDelete(null);
        if (selectedApplication?.id === applicationToDelete.id) {
          setView('list');
          setSelectedApplication(null);
        }
        fetchApplicationsList();
        fetchKPIStats();
      } else {
        alert(err.response?.data?.detail || 'Failed to delete application.');
      }
    } finally {
      deletingRef.current = false;
      setDeleteSubmitting(false);
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
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
                <h3>{editApplicationId ? 'Edit Application' : 'Configure New Application'}</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowWizard(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="wizard-steps-indicator">
                <div className={`step-node ${wizardStep >= 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>
                  <div className="step-num">{wizardStep > 1 ? <Check size={12} /> : '1'}</div>
                  <div className="step-label">Application Type</div>
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
                      <h4>Choose Application Ingestion Type</h4>
                      <p className="subtitle">Select the source format for this application's account, entitlement, and role data.</p>

                      <div ref={typeDropdownRef} style={{ position: 'relative', maxWidth: '560px' }}>
                        <button
                          type="button"
                          onClick={() => setTypeDropdownOpen((o) => !o)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
                            padding: '14px 16px', borderRadius: '10px',
                            border: `1px solid ${typeDropdownOpen ? 'var(--primary)' : 'var(--border-color)'}`,
                            backgroundColor: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left'
                          }}
                        >
                          {(() => {
                            const selected = APPLICATION_TYPE_OPTIONS.find((o) => o.value === formData.application_type) || APPLICATION_TYPE_OPTIONS[0];
                            const SelectedIcon = selected.icon;
                            return (
                              <>
                                <div style={{
                                  width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  backgroundColor: `${selected.color}1a`, color: selected.color
                                }}>
                                  <SelectedIcon size={19} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{selected.label}</div>
                                  <div className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>{selected.description}</div>
                                </div>
                              </>
                            );
                          })()}
                          <ChevronDown
                            size={16}
                            className="text-muted"
                            style={{ flexShrink: 0, transition: 'transform 0.15s ease', transform: typeDropdownOpen ? 'rotate(180deg)' : 'none' }}
                          />
                        </button>

                        {typeDropdownOpen && (
                          <div style={{
                            marginTop: '6px',
                            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: '10px', overflow: 'hidden'
                          }}>
                            {APPLICATION_TYPE_OPTIONS.map((opt, idx) => {
                              const OptIcon = opt.icon;
                              const isSelected = formData.application_type === opt.value;
                              return (
                                <div
                                  key={opt.value}
                                  onClick={() => {
                                    setFormData((prev) => ({ ...prev, application_type: opt.value }));
                                    setTypeDropdownOpen(false);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                                    cursor: 'pointer',
                                    backgroundColor: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                                    borderBottom: idx < APPLICATION_TYPE_OPTIONS.length - 1 ? '1px solid var(--border-color)' : 'none'
                                  }}
                                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.03))'; }}
                                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  <div style={{
                                    width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: `${opt.color}1a`, color: opt.color
                                  }}>
                                    <OptIcon size={17} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{opt.label}</div>
                                    <div className="text-muted" style={{ fontSize: '11.5px', marginTop: '1px' }}>{opt.description}</div>
                                  </div>
                                  {isSelected && <Check size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="wizard-details-form">
                      <div className="input-group-custom">
                        <label className="required">Application Name</label>
                        <input type="text" name="application_name" value={formData.application_name} onChange={handleFieldChange} placeholder="e.g. Salesforce CRM" />
                        {formErrors.application_name && <span className="form-error-text">{formErrors.application_name}</span>}
                      </div>
                      <div className="input-group-custom">
                        <label>Description</label>
                        <textarea name="description" value={formData.description} onChange={handleFieldChange} placeholder="Provide details about this application..." rows={3} />
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
                          <label>Tags (Comma-separated)</label>
                          <input type="text" name="tags" value={formData.tags} onChange={handleFieldChange} placeholder="e.g. CRM, Sales, Production" />
                        </div>
                      </div>

                      <div className="input-group-custom" style={{ marginTop: '16px', position: 'relative' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                          <User size={15} /> Application Owner
                        </label>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          Assign a user as the designated owner responsible for this application.
                        </p>

                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Search existing users by name or email..."
                            value={ownerSearchQuery}
                            onChange={(e) => handleOwnerSearch(e.target.value)}
                            onFocus={() => { if (ownerCandidates.length > 0) setShowOwnerDropdown(true); }}
                            style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '100%', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                          />
                          {ownerLoading && (
                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--text-muted)' }}>Searching...</span>
                          )}
                          {showOwnerDropdown && ownerCandidates.length > 0 && (
                            <div className="owner-candidates-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', maxHeight: '180px', overflowY: 'auto', marginTop: '4px' }}>
                              {ownerCandidates.map((cand) => (
                                <div
                                  key={`${cand.source}-${cand.id}-${cand.email}`}
                                  onClick={() => handleSelectOwner(cand)}
                                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  <div>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)' }}>
                                      {cand.name} {cand.employee_id ? <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({cand.employee_id})</span> : ''}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cand.email} {cand.department ? `• ${cand.department}` : ''}</div>
                                  </div>
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--primary-light, #3b82f620)', color: 'var(--primary, #3b82f6)', fontWeight: '600' }}>{cand.source}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="form-row-3col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                          <div className="input-group-custom">
                            <label>Owner Emp ID</label>
                            <input
                              type="text"
                              name="owner_employee_id"
                              value={formData.owner_employee_id || ''}
                              onChange={handleFieldChange}
                              placeholder="e.g. EMP-1002"
                            />
                          </div>
                          <div className="input-group-custom">
                            <label>Owner Name</label>
                            <input
                              type="text"
                              name="owner_name"
                              value={formData.owner_name || ''}
                              onChange={handleFieldChange}
                              placeholder="e.g. Jane Smith"
                            />
                          </div>
                          <div className="input-group-custom">
                            <label>Owner Email</label>
                            <input
                              type="email"
                              name="owner_email"
                              value={formData.owner_email || ''}
                              onChange={handleFieldChange}
                              placeholder="e.g. jane.smith@company.com"
                            />
                          </div>
                        </div>

                        {(formData.owner_name || formData.owner_employee_id) && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-muted, rgba(0,0,0,0.03))', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontSize: '12px', color: 'var(--success, #10b981)', fontWeight: '600' }}>
                              ✓ Assigned Owner: {formData.owner_employee_id ? `[${formData.owner_employee_id}] ` : ''}{formData.owner_name || 'N/A'} {formData.owner_email ? `(${formData.owner_email})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={handleClearOwner}
                              style={{ border: 'none', background: 'none', color: 'var(--danger, #ef4444)', fontSize: '12px', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
                            >
                              Clear Owner
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="wizard-config-form">
                      {formData.application_type === 'CSV' && (
                        <div className="config-type-section">
                          <h4>CSV Source Configuration</h4>
                          <div className="input-group-custom">
                            <label className={editApplicationId ? '' : 'required'}>
                              {editApplicationId ? 'Update CSV File (Optional)' : 'Upload CSV File'}
                            </label>
                            <div className="file-drop-area">
                              <UploadCloud className="upload-icon" size={24} />
                              <span style={{ marginBottom: '8px' }}>{selectedFile ? selectedFile.name : 'Select or drop CSV file'}</span>
                              <button type="button" className="btn-browse-file" onClick={(e) => { e.stopPropagation(); document.getElementById('app-csv-file-input').click(); }}
                                style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                Browse Local File
                              </button>
                              <input type="file" id="app-csv-file-input" accept=".csv" multiple onChange={handleFileChange} style={{ display: 'none' }} />
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

                      {formData.application_type === 'Excel' && (
                        <div className="config-type-section">
                          <h4>Excel Source Configuration</h4>
                          <div className="input-group-custom">
                            <label className={editApplicationId ? '' : 'required'}>
                              {editApplicationId ? 'Update Excel File (Optional)' : 'Upload Excel File (.xlsx)'}
                            </label>
                            <div className="file-drop-area">
                              <UploadCloud className="upload-icon" size={24} />
                              <span style={{ marginBottom: '8px' }}>{selectedFile ? selectedFile.name : 'Select or drop Excel file'}</span>
                              <button type="button" className="btn-browse-file" onClick={(e) => { e.stopPropagation(); document.getElementById('app-excel-file-input').click(); }}
                                style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                                Browse Local File
                              </button>
                              <input type="file" id="app-excel-file-input" accept=".xlsx" multiple onChange={handleFileChange} style={{ display: 'none' }} />
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
                    </div>
                  )}

                  {wizardStep === 4 && (
                    <div className="wizard-review-summary">
                      <h4>Review Application Configuration</h4>
                      <p className="subtitle">Verify details before adding this application to the system.</p>
                      <div className="review-cards-list">
                        <div className="review-card">
                          <h5>Application Info</h5>
                          <div className="review-grid">
                            <div className="review-item"><label>Name</label><span>{formData.application_name}</span></div>
                            <div className="review-item"><label>Type</label><span>{formData.application_type}</span></div>
                            <div className="review-item"><label>Environment</label><span>{formData.environment}</span></div>
                            <div className="review-item"><label>Application Owner</label><span>{formData.owner_name || formData.owner_employee_id ? `${formData.owner_employee_id ? `[${formData.owner_employee_id}] ` : ''}${formData.owner_name || ''}${formData.owner_email ? ` (${formData.owner_email})` : ''}` : 'Unassigned'}</span></div>
                            {formData.description && (
                              <div className="review-item full-width"><label>Description</label><span>{formData.description}</span></div>
                            )}
                          </div>
                        </div>
                        <div className="review-card">
                          <h5>Technical Ingestion Specs</h5>
                          <div className="review-grid">
                            {formData.application_type === 'CSV' && (
                              <>
                                <div className="review-item"><label>File Name</label><span>{selectedFile ? selectedFile.name : (formData.file_path || '—')}</span></div>
                                <div className="review-item"><label>Delimiter</label><span>{formData.csv_delimiter === '	' ? 'Tab' : formData.csv_delimiter}</span></div>
                                <div className="review-item"><label>Encoding</label><span>{formData.csv_encoding}</span></div>
                              </>
                            )}
                            {formData.application_type === 'Excel' && (
                              <>
                                <div className="review-item"><label>Workbook</label><span>{selectedFile ? selectedFile.name : (formData.file_path || '—')}</span></div>
                                <div className="review-item"><label>Sheet Name</label><span>{formData.excel_sheet_name}</span></div>
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
                  <h4>Delete Application?</h4>
                  <p>
                    Are you sure you want to delete <b>{applicationToDelete?.application_name}</b>?
                    This action is soft-deleting the application, but it will no longer display in active workspaces.
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

        {showBulkDeleteAccountsConfirm && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom delete-dialog-content">
              <div className="delete-dialog-body">
                <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
                <div className="delete-dialog-text">
                  <h4>Delete Matching Accounts?</h4>
                  <p>
                    Delete every account for <b>{selectedApplication?.application_name}</b> whose ID, name, or
                    email matches "<b>{accountsSearch.trim()}</b>"? This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" disabled={bulkDeletingAccounts} onClick={() => setShowBulkDeleteAccountsConfirm(false)}>Cancel</button>
                <button className="btn-modal-delete" type="button" disabled={bulkDeletingAccounts} onClick={handleConfirmBulkDeleteAccounts}>
                  {bulkDeletingAccounts ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAssignOwnerModal && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom" style={{ maxWidth: '520px', width: '90%' }}>
              <div className="modal-header-custom">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={18} /> Assign Application Owner
                </h3>
                <button className="modal-close-btn-custom" onClick={() => setShowAssignOwnerModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="modal-form-custom" style={{ padding: '20px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '16px' }}>
                  Assign or update the designated owner for <b>{selectedApplication?.application_name}</b>.
                </p>

                <div className="input-group-custom" style={{ position: 'relative', marginBottom: '16px' }}>
                  <label style={{ fontWeight: '600', marginBottom: '6px' }}>Search Existing Users</label>
                  <input
                    type="text"
                    placeholder="Search by name, email, or department..."
                    value={quickOwnerSearchQuery}
                    onChange={(e) => handleQuickOwnerSearch(e.target.value)}
                    onFocus={() => { if (quickOwnerCandidates.length > 0) setShowQuickOwnerDropdown(true); }}
                    style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '100%', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  />
                  {quickOwnerLoading && (
                    <span style={{ position: 'absolute', right: '12px', top: '35px', fontSize: '12px', color: 'var(--text-muted)' }}>Searching...</span>
                  )}
                  {showQuickOwnerDropdown && quickOwnerCandidates.length > 0 && (
                    <div className="owner-search-dropdown">
                      {quickOwnerCandidates.map((cand) => (
                        <div
                          key={`${cand.source}-${cand.id}-${cand.email}`}
                          className="owner-search-result-row"
                          onClick={() => handleSelectQuickOwner(cand)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="owner-search-result-name">
                              {cand.name} {cand.employee_id ? <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>({cand.employee_id})</span> : ''}
                            </div>
                            <div className="owner-search-result-sub">{cand.email} {cand.department ? `• ${cand.department}` : ''}</div>
                          </div>
                          <span className="owner-search-result-badge">{cand.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-row-3col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="input-group-custom">
                    <label>Owner Emp ID</label>
                    <input
                      type="text"
                      value={quickOwnerEmpId}
                      onChange={(e) => setQuickOwnerEmpId(e.target.value)}
                      placeholder="e.g. EMP-1002"
                    />
                  </div>
                  <div className="input-group-custom">
                    <label>Owner Name</label>
                    <input
                      type="text"
                      value={quickOwnerName}
                      onChange={(e) => setQuickOwnerName(e.target.value)}
                      placeholder="e.g. Jane Smith"
                    />
                  </div>
                  <div className="input-group-custom">
                    <label>Owner Email</label>
                    <input
                      type="email"
                      value={quickOwnerEmail}
                      onChange={(e) => setQuickOwnerEmail(e.target.value)}
                      placeholder="e.g. jane.smith@company.com"
                    />
                  </div>
                </div>

                {(quickOwnerName || quickOwnerEmpId) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-muted, rgba(0,0,0,0.03))', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--success, #10b981)', fontWeight: '600' }}>
                      ✓ Owner: {quickOwnerEmpId ? `[${quickOwnerEmpId}] ` : ''}{quickOwnerName || 'N/A'} {quickOwnerEmail ? `(${quickOwnerEmail})` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setQuickOwnerId(null); setQuickOwnerEmpId(''); setQuickOwnerName(''); setQuickOwnerEmail(''); }}
                      style={{ border: 'none', background: 'none', color: 'var(--danger, #ef4444)', fontSize: '12px', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }}
                    >
                      Remove Owner
                    </button>
                  </div>
                )}

                <div className="modal-footer-custom" style={{ padding: 0, marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button className="btn-modal-cancel" type="button" disabled={quickOwnerSubmitting} onClick={() => setShowAssignOwnerModal(false)}>Cancel</button>
                  <button className="btn-modal-submit" type="button" disabled={quickOwnerSubmitting} onClick={handleSaveQuickOwner}>
                    {quickOwnerSubmitting ? 'Saving Owner...' : 'Save Owner'}
                  </button>
                </div>
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
            { label: 'Applications', active: false },
            { label: 'Application Workspace', active: false, onClick: handleBackToList },
            { label: selectedApplication?.application_name || 'Loading...', active: true }
          ]}
        />

        <button className="detail-back-btn" onClick={handleBackToList}>
          <ArrowLeft size={14} />
          Back to Application Workspace
        </button>

        {selectedApplication && (
          <>
            <div className="page-header-actions" style={{ marginTop: '16px' }}>
              <div className="header-title-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {renderTypeIcon(selectedApplication.application_type)}
                  <h2 style={{ margin: 0 }}>{selectedApplication.application_name}</h2>
                  {renderStatusBadge(selectedApplication.status)}
                </div>
                <p>{selectedApplication.description || 'No description provided.'}</p>
              </div>
              <div className="header-buttons-section" style={{ gap: '8px' }}>
                <button
                  className="btn-browse-file"
                  onClick={handleOpenAssignOwnerModal}
                  style={{
                    padding: '8px 14px', fontSize: '13px', border: '1px solid var(--border-color)',
                    borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)',
                    cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <User size={14} />
                  <span>Assign Owner</span>
                </button>
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
                <button className="btn-add-connector" onClick={(e) => handleOpenEditWizard(selectedApplication, e)}>
                  <Edit size={14} />
                  <span>Edit</span>
                </button>
                <button
                  className="btn-modal-delete"
                  style={{ padding: '8px 14px', borderRadius: '6px' }}
                  onClick={(e) => handleOpenDeleteConfirm(selectedApplication, e)}
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

            <div className="connector-metrics-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>HEALTH</span>
                  <div className={`status-dot ${selectedApplication.health_status === 'Healthy' ? 'active' : selectedApplication.health_status === 'Degraded' ? 'warning' : 'failed'}`} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)' }}>
                  {selectedApplication.health_status || 'Unknown'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Status: {selectedApplication.status}
                </div>
              </div>

              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>LAST TESTED</span>
                  <Clock size={14} className="text-muted" style={{ opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
                  {selectedApplication.last_tested ? new Date(selectedApplication.last_tested + 'Z').toLocaleString('en-US') : 'Never'}
                </div>
              </div>

              <div className="metric-card-custom" style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>TEST STATS</span>
                  <Activity size={14} className="text-muted" style={{ opacity: 0.7 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' }}>
                  <span style={{ color: 'var(--success, #10b981)' }}>{selectedApplication.success_count || 0} <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)' }}>Success</span></span>
                  <span style={{ color: 'var(--danger, #ef4444)' }}>{selectedApplication.failure_count || 0} <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)' }}>Failed</span></span>
                </div>
              </div>
            </div>

            <div className="drawer-tabs-navigation" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <button className={`drawer-tab-btn ${detailTab === 'info' ? 'active' : ''}`} onClick={() => setDetailTab('info')}>
                <Info size={13} /> Details
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'schema' ? 'active' : ''}`} onClick={() => setDetailTab('schema')}>
                <Layers size={13} /> Schema ({schemaFields.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'accounts' ? 'active' : ''}`} onClick={() => setDetailTab('accounts')}>
                <Users size={13} /> Accounts ({accountsTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'entitlements' ? 'active' : ''}`} onClick={() => setDetailTab('entitlements')}>
                <Shield size={13} /> Entitlements ({entitlementsTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'roles' ? 'active' : ''}`} onClick={() => setDetailTab('roles')}>
                <Key size={13} /> Roles ({rolesTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'mapping' ? 'active' : ''}`} onClick={handleOpenMappingTab}>
                <ArrowRightLeft size={13} /> Mapping ({mappingRows.filter((r) => r.target_attribute_name).length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'import_history' ? 'active' : ''}`} onClick={() => setDetailTab('import_history')}>
                <History size={13} /> Import Jobs ({importHistoryTotal})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'audits' ? 'active' : ''}`} onClick={() => setDetailTab('audits')}>
                <FileText size={13} /> Audits ({applicationAudits.length})
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h5 style={{ margin: 0 }}>Application Metadata</h5>
                            <button
                              type="button"
                              onClick={handleOpenAssignOwnerModal}
                              style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <User size={13} /> {selectedApplication.owner_name ? 'Change Owner' : 'Assign Owner'}
                            </button>
                          </div>
                          <div className="info-summary-grid">
                            <div className="summary-item"><label>Status</label><span>{renderStatusBadge(selectedApplication.status)}</span></div>
                            <div className="summary-item"><label>Application Owner</label><span style={{ fontWeight: '600', color: selectedApplication.owner_name ? 'var(--text-main)' : 'var(--text-muted)' }}>{selectedApplication.owner_name ? `${selectedApplication.owner_name}${selectedApplication.owner_email ? ` (${selectedApplication.owner_email})` : ''}` : 'Unassigned'}</span></div>
                            <div className="summary-item"><label>Owner Emp ID</label><span style={{ fontWeight: '600', color: selectedApplication.owner_employee_id ? 'var(--text-main)' : 'var(--text-muted)' }}>{selectedApplication.owner_employee_id || 'Unassigned'}</span></div>
                            <div className="summary-item"><label>Source Type</label><span>{selectedApplication.application_type}</span></div>
                            <div className="summary-item"><label>Environment</label><span>{selectedApplication.environment || 'Development'}</span></div>
                            <div className="summary-item"><label>System Version</label><span>v{selectedApplication.version}</span></div>
                            <div className="summary-item"><label>Created By</label><span>{selectedApplication.created_by}</span></div>
                            <div className="summary-item"><label>Created At</label><span>{new Date(selectedApplication.created_at).toLocaleString()}</span></div>
                            <div className="summary-item"><label>Last Updated</label><span>{new Date(selectedApplication.updated_at).toLocaleString()}</span></div>
                          </div>
                        </div>

                        <div className="info-summary-group">
                          <h5>Configuration Summary</h5>
                          <div className="info-summary-grid">
                            {selectedApplication.application_type === 'CSV' && (
                              <>
                                <div className="summary-item"><label>File Path</label><span className="mono-text">{selectedApplication.file_path || '—'}</span></div>
                                <div className="summary-item"><label>Delimiter</label><span>{selectedApplication.csv_delimiter === '	' ? 'Tab' : selectedApplication.csv_delimiter}</span></div>
                                <div className="summary-item"><label>Encoding</label><span>{selectedApplication.csv_encoding}</span></div>
                              </>
                            )}
                            {selectedApplication.application_type === 'Excel' && (
                              <>
                                <div className="summary-item"><label>Workbook Path</label><span className="mono-text">{selectedApplication.file_path || '—'}</span></div>
                                <div className="summary-item"><label>Active Sheet</label><span>{selectedApplication.excel_sheet_name || '—'}</span></div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailTab === 'schema' && (
                      <div className="drawer-tab-info-pane">
                        <h5>Field Discovery</h5>
                        <button
                          className="btn-browse-file"
                          onClick={handleDiscoverSchema}
                          disabled={schemaLoading}
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

                    {detailTab === 'accounts' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h5 style={{ margin: 0 }}>Imported Accounts</h5>
                          <button
                            className="btn-browse-file"
                            onClick={handleImportAccounts}
                            disabled={importingAccounts}
                            style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', cursor: importingAccounts ? 'default' : 'pointer', fontWeight: '600' }}
                          >
                            {importingAccounts ? 'Importing...' : 'Import Accounts'}
                          </button>
                        </div>

                        {importResult && (
                          <div
                            style={{
                              margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                              fontSize: '13px', fontWeight: '500',
                              backgroundColor: importResult.success !== false ? 'var(--success-light, #10b98120)' : 'var(--danger-light)',
                              color: importResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)',
                              border: `1px solid ${importResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)'}`
                            }}
                          >
                            {importResult.success !== false
                              ? `✓ Imported ${importResult.imported} of ${importResult.total} record(s) in ${importResult.duration_ms}ms${importResult.errors ? ` (${importResult.errors} errors)` : ''}.`
                              : `✗ ${importResult.message}`}
                          </div>
                        )}

                        {importResult && importResult.entitlement_assignments_imported > 0 && (
                          <div style={{
                            margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                            fontSize: '12.5px', fontWeight: '500',
                            backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
                            border: '1px solid var(--primary)'
                          }}>
                            Linked {importResult.entitlement_assignments_imported} entitlement assignment(s) from the "Entitlements" column.
                            {importResult.unmatched_entitlement_names && importResult.unmatched_entitlement_names.length > 0 && (
                              <> Could not match: {importResult.unmatched_entitlement_names.join(', ')} — check these exist in the Entitlements tab with matching names.</>
                            )}
                          </div>
                        )}

                        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="Search by account ID, name, or email..."
                            value={accountsSearch}
                            onChange={(e) => { setAccountsSearch(e.target.value); setAccountsPage(1); }}
                            style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '260px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                          />
                          {accountsSearch.trim() && (
                            <button
                              onClick={handleBulkDeleteAccounts}
                              disabled={bulkDeletingAccounts}
                              title="Delete every account matching the current search"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', border: '1px solid var(--danger)', borderRadius: '6px', backgroundColor: 'transparent', color: 'var(--danger)', cursor: bulkDeletingAccounts ? 'default' : 'pointer' }}
                            >
                              <Trash2 size={13} />
                              {bulkDeletingAccounts ? 'Deleting...' : 'Delete Matching'}
                            </button>
                          )}
                        </div>

                        {accountsLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading accounts...</p>
                          </div>
                        ) : accounts.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <Users size={24} className="text-muted" />
                            <p>No accounts imported yet. Click "Import Accounts" above.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Account ID</th>
                                  <th style={{ textAlign: 'left' }}>Account Name</th>
                                  <th style={{ textAlign: 'left' }}>Email</th>
                                  <th style={{ textAlign: 'left' }}>Status</th>
                                  <th style={{ textAlign: 'left' }}>Imported At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {accounts.map((a) => (
                                  <tr key={a.id}>
                                    <td style={{ fontWeight: '600' }}>{a.account_id}</td>
                                    <td>{a.account_name || '—'}</td>
                                    <td>{a.email || '—'}</td>
                                    <td>{a.status}</td>
                                    <td className="text-muted">{new Date(a.imported_at).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {accountsTotalPages > 1 && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button className="btn-page-nav" disabled={accountsPage === 1} onClick={() => setAccountsPage(p => p - 1)}>
                                  <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {accountsPage} of {accountsTotalPages}</span>
                                <button className="btn-page-nav" disabled={accountsPage === accountsTotalPages} onClick={() => setAccountsPage(p => p + 1)}>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'entitlements' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h5 style={{ margin: 0 }}>Imported Entitlements</h5>
                          <button
                            className="btn-browse-file"
                            onClick={handleImportEntitlements}
                            disabled={importingEntitlements}
                            style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', cursor: importingEntitlements ? 'default' : 'pointer', fontWeight: '600' }}
                          >
                            {importingEntitlements ? 'Importing...' : 'Import Entitlements'}
                          </button>
                        </div>

                        {entitlementImportResult && (
                          <div
                            style={{
                              margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                              fontSize: '13px', fontWeight: '500',
                              backgroundColor: entitlementImportResult.success !== false ? 'var(--success-light, #10b98120)' : 'var(--danger-light)',
                              color: entitlementImportResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)',
                              border: `1px solid ${entitlementImportResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)'}`
                            }}
                          >
                            {entitlementImportResult.success !== false
                              ? `✓ Imported ${entitlementImportResult.imported} of ${entitlementImportResult.total} record(s) in ${entitlementImportResult.duration_ms}ms${entitlementImportResult.errors ? ` (${entitlementImportResult.errors} errors)` : ''}.`
                              : `✗ ${entitlementImportResult.message}`}
                          </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                          <input
                            type="text"
                            placeholder="Search by entitlement name or type..."
                            value={entitlementsSearch}
                            onChange={(e) => { setEntitlementsSearch(e.target.value); setEntitlementsPage(1); }}
                            style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '260px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                          />
                        </div>

                        {entitlementsLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading entitlements...</p>
                          </div>
                        ) : entitlements.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <Shield size={24} className="text-muted" />
                            <p>No entitlements imported yet. Click "Import Entitlements" above.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Entitlement Name</th>
                                  <th style={{ textAlign: 'left' }}>Type</th>
                                  <th style={{ textAlign: 'left' }}>Description</th>
                                  <th style={{ textAlign: 'left' }}>Imported At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entitlements.map((e) => (
                                  <tr key={e.id}>
                                    <td style={{ fontWeight: '600' }}>{e.entitlement_name}</td>
                                    <td>{e.entitlement_type || '—'}</td>
                                    <td className="text-muted">{e.description || '—'}</td>
                                    <td className="text-muted">{new Date(e.imported_at).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {entitlementsTotalPages > 1 && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button className="btn-page-nav" disabled={entitlementsPage === 1} onClick={() => setEntitlementsPage(p => p - 1)}>
                                  <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {entitlementsPage} of {entitlementsTotalPages}</span>
                                <button className="btn-page-nav" disabled={entitlementsPage === entitlementsTotalPages} onClick={() => setEntitlementsPage(p => p + 1)}>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'roles' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h5 style={{ margin: 0 }}>Imported Roles</h5>
                          <button
                            className="btn-browse-file"
                            onClick={handleImportRoles}
                            disabled={importingRoles}
                            style={{ padding: '6px 12px', fontSize: '12px', border: 'none', borderRadius: '6px', backgroundColor: 'var(--primary)', color: '#fff', cursor: importingRoles ? 'default' : 'pointer', fontWeight: '600' }}
                          >
                            {importingRoles ? 'Importing...' : 'Import Roles'}
                          </button>
                        </div>

                        {roleImportResult && (
                          <div
                            style={{
                              margin: '0 0 16px', padding: '12px 16px', borderRadius: '8px',
                              fontSize: '13px', fontWeight: '500',
                              backgroundColor: roleImportResult.success !== false ? 'var(--success-light, #10b98120)' : 'var(--danger-light)',
                              color: roleImportResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)',
                              border: `1px solid ${roleImportResult.success !== false ? 'var(--success, #10b981)' : 'var(--danger)'}`
                            }}
                          >
                            {roleImportResult.success !== false
                              ? `✓ Imported ${roleImportResult.imported} of ${roleImportResult.total} record(s) in ${roleImportResult.duration_ms}ms${roleImportResult.errors ? ` (${roleImportResult.errors} errors)` : ''}.`
                              : `✗ ${roleImportResult.message}`}
                          </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                          <input
                            type="text"
                            placeholder="Search by role name..."
                            value={rolesSearch}
                            onChange={(e) => { setRolesSearch(e.target.value); setRolesPage(1); }}
                            style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', width: '260px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                          />
                        </div>

                        {rolesLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading roles...</p>
                          </div>
                        ) : roles.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <Key size={24} className="text-muted" />
                            <p>No roles imported yet. Click "Import Roles" above.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Role Name</th>
                                  <th style={{ textAlign: 'left' }}>Description</th>
                                  <th style={{ textAlign: 'left' }}>Imported At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roles.map((r) => (
                                  <tr key={r.id}>
                                    <td style={{ fontWeight: '600' }}>{r.role_name}</td>
                                    <td className="text-muted">{r.description || '—'}</td>
                                    <td className="text-muted">{new Date(r.imported_at).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {rolesTotalPages > 1 && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button className="btn-page-nav" disabled={rolesPage === 1} onClick={() => setRolesPage(p => p - 1)}>
                                  <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {rolesPage} of {rolesTotalPages}</span>
                                <button className="btn-page-nav" disabled={rolesPage === rolesTotalPages} onClick={() => setRolesPage(p => p + 1)}>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </>
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
                                const attrOptions = TARGET_ATTRIBUTE_OPTIONS[row.target_module] || [];
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
                                        {attrOptions.map((attr) => (
                                          <option key={attr.value} value={attr.value}>{attr.label}</option>
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

                    {detailTab === 'import_history' && (
                      <div className="drawer-tab-logs-pane">
                        <h5>Import Job History</h5>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                          A history of every Account, Entitlement, and Role import run for this application.
                        </p>
                        {importHistoryLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading import history...</p>
                          </div>
                        ) : importHistory.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <History size={24} className="text-muted" />
                            <p>No import runs yet. Try "Import Accounts," "Import Entitlements," or "Import Roles" on their respective tabs.</p>
                          </div>
                        ) : (
                          <>
                            <table className="detail-inner-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Run Type</th>
                                  <th style={{ textAlign: 'center' }}>Total</th>
                                  <th style={{ textAlign: 'center' }}>Valid</th>
                                  <th style={{ textAlign: 'center' }}>Warnings</th>
                                  <th style={{ textAlign: 'center' }}>Errors</th>
                                  <th style={{ textAlign: 'left' }}>Status</th>
                                  <th style={{ textAlign: 'left' }}>Run By</th>
                                  <th style={{ textAlign: 'left' }}>Run At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {importHistory.map((h) => (
                                  <tr key={h.id}>
                                    <td style={{ fontWeight: '600' }}>{h.run_type}</td>
                                    <td style={{ textAlign: 'center' }}>{h.total_records}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--success, #10b981)' }}>{h.valid_records}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--warning, #f59e0b)' }}>{h.warning_records}</td>
                                    <td style={{ textAlign: 'center', color: 'var(--danger, #ef4444)' }}>{h.error_records}</td>
                                    <td>
                                      <span className={`status-badge ${h.status === 'Completed' ? 'connected' : h.status === 'Failed' ? 'failed' : 'disabled'}`}>
                                        {h.status}
                                      </span>
                                    </td>
                                    <td>{h.run_by}</td>
                                    <td className="text-muted">{new Date(h.run_at).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {importHistoryTotalPages > 1 && (
                              <div className="pagination-bar" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button className="btn-page-nav" disabled={importHistoryPage === 1} onClick={() => setImportHistoryPage(p => p - 1)}>
                                  <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '13px', alignSelf: 'center' }}>Page {importHistoryPage} of {importHistoryTotalPages}</span>
                                <button className="btn-page-nav" disabled={importHistoryPage === importHistoryTotalPages} onClick={() => setImportHistoryPage(p => p + 1)}>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {detailTab === 'audits' && (
                      <div className="drawer-tab-audits-pane">
                        <h5>Configuration Changes Audit Trail</h5>
                        {applicationAudits.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <FileText size={24} className="text-muted" />
                            <p>No audit trail logs match this application configuration.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {applicationAudits.map((aud) => (
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
          { label: 'Applications', active: true }
        ]}
      />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Application Workspace</h2>
          <p>Configure target applications to import account, entitlement, and role data for role mining.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-add-connector" onClick={handleOpenAddWizard}>
            <Plus size={14} />
            <span>Add Application</span>
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Total Applications" value={kpiStats.total} icon={Layers} color="blue" loading={loading} />
        <DashboardCard title="CSV Applications" value={kpiStats.csv} icon={FileText} color="indigo" loading={loading} />
        <DashboardCard title="Excel Applications" value={kpiStats.excel} icon={FileSpreadsheet} color="teal" loading={loading} />
        <DashboardCard title="Healthy" value={kpiStats.healthy} icon={CheckCircle2} color="green" loading={loading} />
        <DashboardCard title="Configured / Draft" value={kpiStats.configured} icon={SlidersHorizontal} color="yellow" loading={loading} />
        <DashboardCard title="Failed" value={kpiStats.failed} icon={XCircle} color="red" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input type="text" className="search-field" value={search} onChange={handleSearchChange} placeholder="Search by name or description..." />
        </div>

        <div className="filter-dropdowns">
          <select className="filter-dropdown" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
            <option value="">All Application Types</option>
            <option value="CSV">CSV</option>
            <option value="Excel">Excel</option>
          </select>
          <select className="filter-dropdown" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Configured">Configured</option>
            <option value="Failed">Failed</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>

        {(search || filterType || filterStatus) && (
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
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('application_name')}>
                  Name {sortBy === 'application_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('application_type')}>
                  Type {sortBy === 'application_type' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('owner_name')}>
                  Owner {sortBy === 'owner_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                  Status {sortBy === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_tested')}>
                  Last Tested {sortBy === 'last_tested' && (sortOrder === 'asc' ? '▲' : '▼')}
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
                      <p>Loading applications...</p>
                    </div>
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="table-empty-container">
                      <Cpu size={36} className="text-muted" />
                      <div className="empty-state-text">
                        <h4>No Applications Found</h4>
                        <p>No active application configurations found matching current filters.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                applications.map((a, idx) => (
                  <tr key={a.id} className="row-clickable" onClick={() => handleOpenDetail(a)}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {(page - 1) * limit + idx + 1}
                    </td>
                    <td className="connector-name-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {renderTypeIcon(a.application_type)}
                        <span className="font-semibold text-main">{a.application_name}</span>
                      </div>
                    </td>
                    <td>{a.application_type}</td>
                    <td>
                      {a.owner_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={13} className="text-muted" />
                          <span className="font-semibold text-main" style={{ fontSize: '13px' }}>{a.owner_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td>{renderStatusBadge(a.status)}</td>
                    <td>{a.last_tested ? new Date(a.last_tested).toLocaleString() : 'Never'}</td>
                    <td>{a.created_by}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="actions-cell-menu">
                        <button className="btn-row-action" title="View details" onClick={() => handleOpenDetail(a)}>
                          <Eye size={13} />
                        </button>
                        <button className="btn-row-action" title="Edit configuration" onClick={(e) => handleOpenEditWizard(a, e)}>
                          <Edit size={13} />
                        </button>
                        <button className="btn-row-action delete" title="Delete application" onClick={(e) => handleOpenDeleteConfirm(a, e)}>
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

        {totalCount > 0 && (
          <div className="table-pagination-footer">
            <div className="pagination-info">
              Showing <b>{totalCount === 0 ? 0 : (page - 1) * limit + 1}</b> to <b>{Math.min(totalCount, page * limit)}</b> of <b>{totalCount}</b> applications
            </div>
            {totalPages > 1 && (
              <div className="pagination-buttons">
                <button className="btn-page-nav" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {getPageNumbers(page, totalPages).map((pNum, idx) => (
                  pNum === '...' ? (
                    <span key={`dots-${idx}`} className="pagination-ellipsis">...</span>
                  ) : (
                    <button key={pNum} className={`btn-page-number ${page === pNum ? 'active' : ''}`} onClick={() => setPage(pNum)}>
                      {pNum}
                    </button>
                  )
                ))}
                <button className="btn-page-nav" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {renderModals()}
    </div>
  );
};

export default ApplicationWorkspace;