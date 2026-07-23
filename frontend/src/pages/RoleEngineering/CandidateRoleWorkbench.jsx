import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  SlidersHorizontal, 
  AlertTriangle, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Edit, 
  Trash2, 
  User, 
  Folder, 
  Calendar, 
  ShieldAlert, 
  History, 
  ChevronDown, 
  Check, 
  Layers, 
  Shield, 
  Briefcase,
  Cpu,
  Boxes,
  Info,
  BadgeCheck,
  UserCheck,
  UserPlus,
  UserMinus,
  ClipboardList,
  FileJson,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gauge,
  GitMerge,
  Scissors,
  BookOpen,
  Maximize2,
  Minimize2,
  PieChart,
  Lightbulb,
  ArrowRightCircle
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import RoleMiningMatrix from '../../components/RoleMiningMatrix/RoleMiningMatrix';
import RoleAnalyticalCharts, { VIEW_MODES } from '../../components/RoleMiningMatrix/RoleAnalyticalCharts';
import {
  getCandidateRoleStats,
  getCandidateRoles,
  getCandidateRoleDetail,
  getCandidateRolesMatrix,
  createCandidateRole,
  updateCandidateRole,
  deleteCandidateRole,
  getClassifications,
  updateRoleClassification,
  bulkClassifyRoles,
  exportCandidateRolesCSV,
  exportCandidateRolesExcel,
  searchPlatformUsers,
  getCurrentOwners,
  assignOwner,
  removeOwner,
  getOwnerHistory,
  getRolePreview,
  exportRolePreviewJSON,
  exportRolePreviewCSV,
  exportRolePreviewExcel,
  previewMerge,
  executeMerge,
  previewSplit,
  executeSplit,
  getClassificationRanges,
  saveClassificationRanges,
  runAutoClassification
} from '../../services/candidateRoleWorkbenchService';
import { publishRole } from '../../services/roleCatalogService';
import './CandidateRoleWorkbench.css';
import { useAuth } from '../../context/AuthContext';
import SubmitApprovalModal from '../../components/SubmitApprovalModal/SubmitApprovalModal';

const ANALYTICAL_VIEW_HINTS = {
  grid: 'Entitlement grants by member, based on verified account data.',
  coverage: 'Member coverage percentage per entitlement.',
  core: 'Core and non-core entitlement distribution.',
  member: 'Entitlement match percentage per member.',
  role: 'Entitlement distribution across candidate roles.',
};

const CandidateRoleWorkbench = () => {
  const { currentUser } = useAuth();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Query & lists state
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Search & Filters state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [classificationFilter, setClassificationFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [buFilter, setBuFilter] = useState('');
  
  // Sorting state
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Selection state for Bulk Actions
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  // RE-002: Merge Roles state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergePreviewData, setMergePreviewData] = useState(null);
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false);
  const [mergePreviewError, setMergePreviewError] = useState('');
  const [mergeDestinationName, setMergeDestinationName] = useState('');
  const [mergeDescription, setMergeDescription] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  // RE-003: Split Role state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTargetRole, setSplitTargetRole] = useState(null);
  const [splitMethod, setSplitMethod] = useState('application');
  const [splitPreviewData, setSplitPreviewData] = useState(null);
  const [splitPreviewLoading, setSplitPreviewLoading] = useState(false);
  const [splitPreviewError, setSplitPreviewError] = useState('');
  const [splitReason, setSplitReason] = useState('');
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // UI Loading/Error states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  
  // Right Drawer state
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('info'); // 'info', 'entitlements', 'users', 'sod', 'timeline'
  
  // Classification Panel state
  const [editClassification, setEditClassification] = useState('');
  const [showConfirmClassify, setShowConfirmClassify] = useState(false);
  
  // Edit Role Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    role_name: '',
    role_description: '',
    role_type: 'Business',
    risk_level: 'Low',
    status: 'Draft',
    department: '',
    business_unit: ''
  });
  
  // Delete Confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState(null);
  const [deleteRoleName, setDeleteRoleName] = useState('');

  // KPI Stats state
  const [kpiStats, setKpiStats] = useState({
    total: 0,
    classified: 0,
    notClassified: 0,
    business: 0,
    technical: 0,
    composite: 0,
    birthright: 0,
    requestBased: 0,
    draft: 0
  });

  // ── Range Config & Auto-Classification State ─────────────────────────────
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [birthrightMin, setBirthrightMin] = useState(80);
  const [requestBasedMin, setRequestBasedMin] = useState(50);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [savingRanges, setSavingRanges] = useState(false);
  const [autoClassifying, setAutoClassifying] = useState(false);
  const [autoClassifyResult, setAutoClassifyResult] = useState('');

  // Unique filters data (departments and business units gathered from roles)
  const [uniqueDepartments, setUniqueDepartments] = useState([]);
  const [uniqueBUs, setUniqueBUs] = useState([]);

  const handleFetchRanges = async () => {
    try {
      const ranges = await getClassificationRanges();
      if (ranges) {
        const b = ranges.birthright_min !== undefined ? ranges.birthright_min : (ranges.ranges?.birthright_min ?? 80);
        const r = ranges.request_based_min !== undefined ? ranges.request_based_min : (ranges.ranges?.request_based_min ?? 50);
        setBirthrightMin(b);
        setRequestBasedMin(r);
      }
    } catch (err) {
      console.error("Failed to load classification ranges:", err);
    }
  };

  const sanitizeRanges = () => {
    let bMin = typeof birthrightMin === 'number' ? birthrightMin : parseFloat(birthrightMin);
    let rMin = typeof requestBasedMin === 'number' ? requestBasedMin : parseFloat(requestBasedMin);
    if (isNaN(bMin)) bMin = 80;
    if (isNaN(rMin)) rMin = 50;

    bMin = Math.min(100, Math.max(10, bMin));
    rMin = Math.min(bMin - 1, Math.max(0, rMin));

    setBirthrightMin(bMin);
    setRequestBasedMin(rMin);
    return { bMin, rMin };
  };

  const handleSaveRangesOnly = async () => {
    try {
      setSavingRanges(true);
      setAutoClassifyResult('');
      const { bMin, rMin } = sanitizeRanges();
      const res = await saveClassificationRanges({
        birthright_min: bMin,
        request_based_min: rMin
      });
      setAutoClassifyResult(res.message || 'Classification ranges saved successfully.');
      setTimeout(() => {
        setShowRangeModal(false);
        setAutoClassifyResult('');
      }, 400);
    } catch (err) {
      console.error("Failed to save classification ranges:", err);
      setAutoClassifyResult('Failed to save classification ranges.');
    } finally {
      setSavingRanges(false);
    }
  };

  const handleRunAutoClassify = async () => {
    try {
      setAutoClassifying(true);
      setAutoClassifyResult('');
      const { bMin, rMin } = sanitizeRanges();
      const res = await runAutoClassification({
        birthright_min: bMin,
        request_based_min: rMin,
        overwrite_existing: overwriteExisting
      });
      setAutoClassifyResult(res.message || 'Auto-classification complete.');
      fetchKPIStats();
      fetchRolesData();
      setTimeout(() => {
        setShowRangeModal(false);
        setAutoClassifyResult('');
      }, 500);
    } catch (err) {
      console.error("Auto-classification failed:", err);
      setAutoClassifyResult('Failed to run auto-classification.');
    } finally {
      setAutoClassifying(false);
    }
  };

  // ── RE-005 Owner State ────────────────────────────────────────────────────
  const [ownerData, setOwnerData] = useState({ primary: null, backup: null });
  const [ownerHistory, setOwnerHistory] = useState([]);
  const [ownerHistoryLoading, setOwnerHistoryLoading] = useState(false);
  const [showOwnerHistory, setShowOwnerHistory] = useState(false);

  // Owner assignment form
  const [showAssignOwnerForm, setShowAssignOwnerForm] = useState(false);
  const [assignOwnerType, setAssignOwnerType] = useState('Primary');
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerSearchResults, setOwnerSearchResults] = useState([]);
  const [ownerSearchLoading, setOwnerSearchLoading] = useState(false);
  const [selectedOwnerUser, setSelectedOwnerUser] = useState(null);
  const [ownerReviewDate, setOwnerReviewDate] = useState('');
  const [ownerChangeReason, setOwnerChangeReason] = useState('');
  const [ownerFormError, setOwnerFormError] = useState('');
  const [ownerSubmitting, setOwnerSubmitting] = useState(false);
  const ownerSearchRef = useRef(null);

  // ── RE-006 Preview State ──────────────────────────────────────────────────
  const [rolePreview, setRolePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [exportingPreview, setExportingPreview] = useState('');

  // ── Analytical View (sir's Role Studio reference) - list-level now, not
  // per-role, per sir's feedback. Scoped to whatever's checked in the table,
  // or the top 10 roles by confidence if nothing's checked. ─────────────────
  const [showAnalyticalView, setShowAnalyticalView] = useState(false);
  const [multiRoleMatrix, setMultiRoleMatrix] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const [analyticalViewMode, setAnalyticalViewMode] = useState('grid'); // 'grid' | 'coverage' | 'core' | 'member' | 'role'

  // ── Drawer fullscreen toggle - the matrix needs the room ─────────────────
  const [drawerFullscreen, setDrawerFullscreen] = useState(false);

  // Fetch KPI Stats — DB-aggregated counts + filter dropdown options,
  // instead of pulling up to 1000 full role rows and counting client-side.
  const fetchKPIStats = async () => {
    try {
      const stats = await getCandidateRoleStats();

      setKpiStats({
        total: stats.total || 0,
        classified: stats.classified || 0,
        notClassified: stats.not_classified || 0,
        birthright: stats.birthright || 0,
        requestBased: stats.request_based || 0,
        business: stats.business || 0,
        technical: stats.technical || 0,
        composite: stats.composite || 0,
        draft: stats.draft || 0
      });

      setUniqueDepartments(stats.departments || []);
      setUniqueBUs(stats.business_units || []);
    } catch (err) {
      console.error("Failed to load KPI statistics:", err);
    }
  };

  // Fetch Roles List based on filters and pagination
  const fetchRolesData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const queryParams = {
        page,
        limit,
        search: search.trim() || undefined,
        sort_by: sortBy || undefined,
        sort_order: sortOrder || undefined,
        classification: classificationFilter || undefined,
        status: statusFilter || undefined,
        risk_level: riskFilter || undefined,
        department: deptFilter || undefined,
        business_unit: buFilter || undefined,
        role_type: typeFilter || undefined
      };
      
      const response = await getCandidateRoles(queryParams);
      setRoles(response.roles || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);
      
      // Also sync selected IDs check
      setSelectedRoleIds(prev => prev.filter(id => (response.roles || []).some(r => r.id === id)));
    } catch (err) {
      console.error("Failed to fetch candidate roles list:", err);
      setErrorMsg("Failed to load candidate roles. Please verify database schema and API connectivity.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, sortBy, sortOrder, classificationFilter, statusFilter, riskFilter, deptFilter, buFilter, typeFilter]);

  useEffect(() => {
    fetchRolesData();
    fetchKPIStats();
  }, [fetchRolesData]);

  // Debounce search input
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchInput]);

  // Handle Sort Change
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Toggle Single Row Selection
  const handleToggleSelectRow = (roleId) => {
    setSelectedRoleIds(prev => 
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    );
  };

  // Toggle All Rows Selection
  const handleToggleSelectAll = () => {
    const pageIds = roles.map(r => r.id);
    const allSelected = pageIds.every(id => selectedRoleIds.includes(id));
    
    if (allSelected) {
      setSelectedRoleIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedRoleIds(prev => [...new Set([...prev, ...pageIds])]);
    }
  };

  // Refresh data handler
  const handleRefresh = () => {
    fetchRolesData();
    fetchKPIStats();
    if (selectedRole) {
      handleOpenDrawer(selectedRole.id);
    }
  };

  // Reset all filters handler
  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setClassificationFilter('');
    setRiskFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setDeptFilter('');
    setBuFilter('');
    setPage(1);
  };

  // Open detail drawer
  const handleOpenDrawer = async (roleId) => {
    try {
      setShowDrawer(true);
      setDrawerLoading(true);
      setDetailTab('info');
      setOwnerData({ primary: null, backup: null });
      setOwnerHistory([]);
      setRolePreview(null);
      setDrawerFullscreen(true);
      setShowAssignOwnerForm(false);
      setShowOwnerHistory(false);
      
      const [detailResult, ownersResult] = await Promise.allSettled([
        getCandidateRoleDetail(roleId),
        getCurrentOwners(roleId)
      ]);

      if (detailResult.status === 'rejected') {
        throw detailResult.reason;
      }
      setSelectedRole(detailResult.value);
      setEditClassification(detailResult.value.classification || '');

      // Eagerly load owners (owners table may not have data yet, so ignore failures)
      if (ownersResult.status === 'fulfilled') {
        setOwnerData({ primary: ownersResult.value.primary, backup: ownersResult.value.backup });
      }
    } catch (err) {
      console.error('Failed to load candidate role detail drawer:', err);
      setErrorMsg('Failed to load role details. Please try again.');
      setShowDrawer(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Close detail drawer
  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setSelectedRole(null);
    setOwnerData({ primary: null, backup: null });
    setOwnerHistory([]);
    setRolePreview(null);
    setDrawerFullscreen(false);
    setShowAssignOwnerForm(false);
    setShowOwnerHistory(false);
  };

  // Classification saving trigger
  const handleSaveClassification = () => {
    setShowConfirmClassify(true);
  };

  // Confirm and save classification
  const handleConfirmClassification = async () => {
    try {
      setSubmitting(true);
      await updateRoleClassification(selectedRole.id, editClassification);
      setShowConfirmClassify(false);
      
      // Refresh details and summary list
      await handleOpenDrawer(selectedRole.id);
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to update role classification:", err);
      setErrorMsg("Failed to change role classification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk classify action
  const handleBulkClassify = async (classification) => {
    try {
      if (selectedRoleIds.length === 0) return;
      setSubmitting(true);
      await bulkClassifyRoles(selectedRoleIds, classification);
      setShowBulkMenu(false);
      setSelectedRoleIds([]);
      
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to bulk classify candidate roles:", err);
      setErrorMsg("Failed to execute bulk classification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── RE-002: Merge Roles ────────────────────────────────────────────────────
  const handleOpenMergeModal = async () => {
    if (selectedRoleIds.length < 2) return;
    setShowMergeModal(true);
    setMergePreviewData(null);
    setMergePreviewError('');
    setMergeDestinationName('');
    setMergeDescription('');
    setMergeReason('');
    try {
      setMergePreviewLoading(true);
      const data = await previewMerge(selectedRoleIds);
      setMergePreviewData(data);
    } catch (err) {
      console.error("Failed to preview merge:", err);
      setMergePreviewError(err.response?.data?.detail || "Failed to load merge preview.");
    } finally {
      setMergePreviewLoading(false);
    }
  };

  const handleCloseMergeModal = () => {
    setShowMergeModal(false);
    setMergePreviewData(null);
    setMergePreviewError('');
  };

  const handleConfirmMerge = async () => {
    if (!mergeDestinationName.trim()) {
      setMergePreviewError("Destination role name is required.");
      return;
    }
    try {
      setMergeSubmitting(true);
      setMergePreviewError('');
      await executeMerge({
        roleIds: selectedRoleIds,
        destinationName: mergeDestinationName.trim(),
        description: mergeDescription.trim(),
        mergeReason: mergeReason.trim()
      });
      handleCloseMergeModal();
      setSelectedRoleIds([]);
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to execute merge:", err);
      setMergePreviewError(err.response?.data?.detail || "Failed to merge the selected roles. Please try again.");
    } finally {
      setMergeSubmitting(false);
    }
  };

  // ── RE-003: Split Role ─────────────────────────────────────────────────────
  const handleOpenSplitModal = (role) => {
    setSplitTargetRole(role);
    setShowSplitModal(true);
    setSplitMethod('application');
    setSplitPreviewData(null);
    setSplitPreviewError('');
    setSplitReason('');
    fetchSplitPreview(role.id, 'application');
  };

  const fetchSplitPreview = async (roleId, method) => {
    try {
      setSplitPreviewLoading(true);
      setSplitPreviewError('');
      const data = await previewSplit(roleId, method);
      setSplitPreviewData(data);
    } catch (err) {
      console.error("Failed to preview split:", err);
      setSplitPreviewError(err.response?.data?.detail || "Failed to load split preview.");
      setSplitPreviewData(null);
    } finally {
      setSplitPreviewLoading(false);
    }
  };

  const handleSplitMethodChange = (method) => {
    setSplitMethod(method);
    if (splitTargetRole) {
      fetchSplitPreview(splitTargetRole.id, method);
    }
  };

  const handleCloseSplitModal = () => {
    setShowSplitModal(false);
    setSplitTargetRole(null);
    setSplitPreviewData(null);
    setSplitPreviewError('');
  };

  const handleConfirmSplit = async () => {
    if (!splitPreviewData || !splitPreviewData.splits || splitPreviewData.splits.length < 2) {
      setSplitPreviewError("This role can't be split into at least two groups with the selected method. Try a different method.");
      return;
    }
    try {
      setSplitSubmitting(true);
      setSplitPreviewError('');
      await executeSplit(splitTargetRole.id, {
        splitMethod,
        splits: splitPreviewData.splits.map(s => ({
          role_name: s.role_name,
          role_description: s.role_description,
          entitlements: s.entitlements,
          members: s.members
        })),
        splitReason: splitReason.trim()
      });
      handleCloseSplitModal();
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to execute split:", err);
      setSplitPreviewError(err.response?.data?.detail || "Failed to split this role. Please try again.");
    } finally {
      setSplitSubmitting(false);
    }
  };

  // RC-001: Publish a role that's finished Security Approval ("Ready For Publish")
  // to the Role Catalog.
  const handlePublishToCatalog = () => {
    if (!selectedRole) return;
    setShowPublishConfirm(true);
  };

  const handleConfirmPublish = async () => {
    if (!selectedRole) return;
    try {
      setPublishing(true);
      await publishRole(selectedRole.id);
      await handleOpenDrawer(selectedRole.id);
      fetchRolesData();
      fetchKPIStats();
      setShowPublishConfirm(false);
    } catch (err) {
      console.error("Failed to publish role to catalog:", err);
      setErrorMsg(err.response?.data?.detail || "Failed to publish this role. Please try again.");
      setShowPublishConfirm(false);
    } finally {
      setPublishing(false);
    }
  };

  // Edit candidate role trigger
  const handleOpenEditModal = (role) => {
    setEditFormData({
      role_name: role.role_name,
      role_description: role.role_description || '',
      role_type: role.role_type || 'Business',
      risk_level: role.risk_level || 'Low',
      status: role.status || 'Draft',
      department: role.department || '',
      business_unit: role.business_unit || ''
    });
    setSelectedRole(role);
    setShowEditModal(true);
  };

  // Save candidate role edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await updateCandidateRole(selectedRole.id, editFormData);
      setShowEditModal(false);
      
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to save candidate role edit:", err);
      setErrorMsg("Failed to update candidate role. Please verify input fields.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete candidate role trigger
  const handleOpenDeleteConfirm = (role) => {
    setDeleteRoleId(role.id);
    setDeleteRoleName(role.role_name);
    setShowDeleteConfirm(true);
  };

  // Confirm delete candidate role
  const handleConfirmDelete = async () => {
    try {
      setSubmitting(true);
      await deleteCandidateRole(deleteRoleId);
      setShowDeleteConfirm(false);
      
      fetchRolesData();
      fetchKPIStats();
    } catch (err) {
      console.error("Failed to delete candidate role:", err);
      setErrorMsg("Failed to delete candidate role. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      const queryParams = {
        search: search.trim() || undefined,
        classification: classificationFilter || undefined,
        status: statusFilter || undefined,
        risk_level: riskFilter || undefined,
        department: deptFilter || undefined,
        business_unit: buFilter || undefined,
        role_type: typeFilter || undefined
      };
      const blobData = await exportCandidateRolesCSV(queryParams);
      
      // Trigger download
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `candidate_roles_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export to CSV:", err);
      setErrorMsg("Failed to generate CSV export file.");
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const queryParams = {
        search: search.trim() || undefined,
        classification: classificationFilter || undefined,
        status: statusFilter || undefined,
        risk_level: riskFilter || undefined,
        department: deptFilter || undefined,
        business_unit: buFilter || undefined,
        role_type: typeFilter || undefined
      };
      const blobData = await exportCandidateRolesExcel(queryParams);
      
      // Trigger download
      const url = window.URL.createObjectURL(new Blob([blobData]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `candidate_roles_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export to Excel:", err);
      setErrorMsg("Failed to generate Excel export file.");
    }
  };

  // Render list pagination numbers
  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-page-number ${i === page ? 'active' : ''}`}
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  // ── RE-005: Owner search debounce ────────────────────────────────────────
  useEffect(() => {
    if (!showAssignOwnerForm) return;
    const t = setTimeout(async () => {
      if (!ownerSearchQuery.trim()) { setOwnerSearchResults([]); return; }
      try {
        setOwnerSearchLoading(true);
        const results = await searchPlatformUsers(ownerSearchQuery, 15);
        setOwnerSearchResults(results);
      } catch (_) { setOwnerSearchResults([]); }
      finally { setOwnerSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [ownerSearchQuery, showAssignOwnerForm]);

  // ── RE-005: Handle owner assignment ─────────────────────────────────────
  const handleAssignOwner = async () => {
    setOwnerFormError('');
    if (!ownerSearchQuery.trim() && !selectedOwnerUser) {
      setOwnerFormError('Please search and select an owner.');
      return;
    }
    if (!ownerReviewDate) {
      setOwnerFormError('Please set a review / expiry date and time.');
      return;
    }
    try {
      setOwnerSubmitting(true);
      const payload = {
        owner_type: assignOwnerType,
        owner_name: selectedOwnerUser ? selectedOwnerUser.full_name : ownerSearchQuery,
        owner_email: selectedOwnerUser ? selectedOwnerUser.email : null,
        owner_user_id: selectedOwnerUser ? selectedOwnerUser.id : null,
        review_date: ownerReviewDate,
        change_reason: ownerChangeReason || null
      };
      await assignOwner(selectedRole.id, payload);
      // Refresh owners and role details
      const [owners, updatedDetail] = await Promise.all([
        getCurrentOwners(selectedRole.id),
        getCandidateRoleDetail(selectedRole.id)
      ]);
      setOwnerData({ primary: owners.primary, backup: owners.backup });
      setSelectedRole(updatedDetail);
      fetchRolesData();
      
      setShowAssignOwnerForm(false);
      setSelectedOwnerUser(null);
      setOwnerSearchQuery('');
      setOwnerReviewDate('');
      setOwnerChangeReason('');
    } catch (err) {
      setOwnerFormError(err?.response?.data?.detail || 'Failed to assign owner.');
    } finally {
      setOwnerSubmitting(false);
    }
  };

  // ── RE-005: Handle owner removal ─────────────────────────────────────────
  const handleRemoveOwner = async (ownerType) => {
    try {
      setOwnerSubmitting(true);
      await removeOwner(selectedRole.id, ownerType);
      const [owners, updatedDetail] = await Promise.all([
        getCurrentOwners(selectedRole.id),
        getCandidateRoleDetail(selectedRole.id)
      ]);
      setOwnerData({ primary: owners.primary, backup: owners.backup });
      setSelectedRole(updatedDetail);
      fetchRolesData();
    } catch (err) {
      setOwnerFormError(err?.response?.data?.detail || `Failed to remove ${ownerType} owner.`);
    } finally {
      setOwnerSubmitting(false);
    }
  };

  // ── RE-005: Load owner history ───────────────────────────────────────────
  const handleLoadOwnerHistory = async () => {
    try {
      setOwnerHistoryLoading(true);
      const hist = await getOwnerHistory(selectedRole.id);
      setOwnerHistory(hist);
      setShowOwnerHistory(true);
    } catch (_) {}
    finally { setOwnerHistoryLoading(false); }
  };

  // ── Load entitlement x user matrix across the checked (or top 10) roles ──
  const handleLoadMultiRoleMatrix = async () => {
    try {
      setMatrixLoading(true);
      setMatrixError('');
      const matrix = await getCandidateRolesMatrix(selectedRoleIds);
      setMultiRoleMatrix(matrix);
    } catch (err) {
      setMatrixError(err?.response?.data?.detail || 'Failed to load matrix.');
    } finally {
      setMatrixLoading(false);
    }
  };

  // ── RE-006: Load preview ─────────────────────────────────────────────────
  const handleLoadPreview = async (roleId) => {
    try {
      setPreviewLoading(true);
      setPreviewError('');
      const preview = await getRolePreview(roleId);
      setRolePreview(preview);
    } catch (err) {
      setPreviewError(err?.response?.data?.detail || 'Failed to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── RE-006: Export preview file ──────────────────────────────────────────
  const handleExportPreview = async (format) => {
    try {
      setExportingPreview(format);
      let blob;
      let filename;
      if (format === 'json') {
        blob = await exportRolePreviewJSON(selectedRole.id);
        filename = `role_${selectedRole.id}_preview.json`;
      } else if (format === 'csv') {
        blob = await exportRolePreviewCSV(selectedRole.id);
        filename = `role_${selectedRole.id}_preview.csv`;
      } else {
        blob = await exportRolePreviewExcel(selectedRole.id);
        filename = `role_${selectedRole.id}_preview.xlsx`;
      }
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setPreviewError('Failed to export preview.');
    } finally {
      setExportingPreview('');
    }
  };

  // Helper for risk score color
  const getRiskScoreColor = (score) => {
    if (score >= 70) return 'var(--danger)';
    if (score >= 40) return '#f59e0b';
    return 'var(--success)';
  };

  return (
    <div className="workbench-container">
      <Breadcrumb items={['Role Engineering', 'Candidate Role Workbench']} />

      <div className="page-header-actions" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="header-title-section">
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Role Engineering</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
            Refines discovered role candidates through ownership assignment, classification, and SoD review prior to Approval.
          </p>
        </div>

        <button
          className="btn-action-premium primary"
          style={{ padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
          onClick={() => {
            setShowRangeModal(true);
            handleFetchRanges();
          }}
        >
          <SlidersHorizontal size={16} />
          <span>Define Classification Ranges</span>
        </button>
      </div>

      {errorMsg && (
        <div className="error-banner-alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={handleRefresh}>Retry</button>
        </div>
      )}

      {/* KPI Cards section */}
      <div className="kpi-cards-grid">
        <DashboardCard 
          title="Total Candidate Roles" 
          value={kpiStats.total} 
          icon={Layers} 
          color="blue" 
        />
        <DashboardCard
          title="Birthright Roles"
          value={kpiStats.birthright}
          icon={BadgeCheck}
          color="green"
        />
        <DashboardCard
          title="Request-Based Roles"
          value={kpiStats.requestBased}
          icon={Shield}
          color="purple"
        />
        <DashboardCard
          title="Business Roles"
          value={kpiStats.business}
          icon={ShieldAlert}
          color="yellow"
        />
        <DashboardCard
          title="Technical Roles"
          value={kpiStats.technical}
          icon={ShieldAlert}
          color="cyan"
        />
        <DashboardCard
          title="Composite Roles"
          value={kpiStats.composite}
          icon={ShieldAlert}
          color="indigo"
        />
        <DashboardCard
          title="Draft Roles"
          value={kpiStats.draft}
          icon={History}
          color="red"
        />
      </div>

      {/* Sub-Navigation Tabs by Role Type and Classification */}
      <div className="controls-card">
        <button
          className={`drawer-tab-btn ${typeFilter === '' && classificationFilter === '' ? 'active' : ''}`}
          onClick={() => { setTypeFilter(''); setClassificationFilter(''); setPage(1); }}
        >
          <Shield size={14} />
          <span>All Roles ({kpiStats.total})</span>
        </button>
        <button
          className={`drawer-tab-btn ${classificationFilter === 'Classified' ? 'active' : ''}`}
          onClick={() => { setClassificationFilter('Classified'); setTypeFilter(''); setPage(1); }}
        >
          <BadgeCheck size={14} style={{ color: 'var(--success, #10b981)' }} />
          <span>Classified ({kpiStats.classified || 0})</span>
        </button>
        <button
          className={`drawer-tab-btn ${classificationFilter === 'Not Classified' ? 'active' : ''}`}
          onClick={() => { setClassificationFilter('Not Classified'); setTypeFilter(''); setPage(1); }}
        >
          <XCircle size={14} style={{ color: 'var(--warning, #f59e0b)' }} />
          <span>Not Classified ({kpiStats.notClassified || 0})</span>
        </button>
        <button
          className={`drawer-tab-btn ${typeFilter === 'Business' ? 'active' : ''}`}
          onClick={() => { setTypeFilter('Business'); setClassificationFilter(''); setPage(1); }}
        >
          <Briefcase size={14} />
          <span>Business Roles ({kpiStats.business})</span>
        </button>
        <button
          className={`drawer-tab-btn ${typeFilter === 'Technical' ? 'active' : ''}`}
          onClick={() => { setTypeFilter('Technical'); setClassificationFilter(''); setPage(1); }}
        >
          <Cpu size={14} />
          <span>Technical Roles ({kpiStats.technical})</span>
        </button>
        <button
          className={`drawer-tab-btn ${typeFilter === 'Composite' ? 'active' : ''}`}
          onClick={() => { setTypeFilter('Composite'); setClassificationFilter(''); setPage(1); }}
        >
          <Boxes size={14} />
          <span>Composite Roles ({kpiStats.composite})</span>
        </button>
      </div>

      {/* Filters & Actions Toolbar */}
      <div className="toolbar-section">
        <div className="toolbar-row">
          <div className="search-input-wrapper">
            <Search size={16} className="text-muted" />
            <input
              type="text"
              placeholder="Search by role name, department, business unit, application..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="toolbar-actions">
            <button
              className={`btn-action-premium ${showAnalyticalView ? 'primary' : ''}`}
              onClick={() => {
                const next = !showAnalyticalView;
                setShowAnalyticalView(next);
                if (next) handleLoadMultiRoleMatrix();
              }}
            >
              <PieChart size={14} />
              <span>Analytical View</span>
            </button>

            <button
              className={`btn-action-premium ${showFilters ? 'primary' : ''}`}
              onClick={() => setShowFilters(prev => !prev)}
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
            </button>

            <button className="btn-action-premium" onClick={handleRefresh}>
              <RefreshCw size={14} className={loading ? 'spin-element' : ''} />
              <span>Refresh</span>
            </button>

            <button className="btn-action-premium" onClick={handleExportCSV}>
              <Download size={14} />
              <span>CSV</span>
            </button>

            <button className="btn-action-premium" onClick={handleExportExcel}>
              <Download size={14} />
              <span>Excel</span>
            </button>

            {/* Bulk actions menu */}
            {selectedRoleIds.length > 0 && (
              <div className="bulk-menu-container">
                <button 
                  className="btn-action-premium primary"
                  onClick={() => setShowBulkMenu(prev => !prev)}
                >
                  <span>Bulk Classify ({selectedRoleIds.length})</span>
                  <ChevronDown size={14} />
                </button>
                {showBulkMenu && (
                  <div className="bulk-dropdown-menu">
                    <button className="bulk-dropdown-item" onClick={() => handleBulkClassify('Birthright')}>
                      Mark as Birthright
                    </button>
                    <button className="bulk-dropdown-item" onClick={() => handleBulkClassify('Request-Based')}>
                      Mark as Request-Based
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* RE-002: Merge Roles trigger — needs at least 2 roles selected */}
            {selectedRoleIds.length >= 2 && (
              <button className="btn-action-premium primary" onClick={handleOpenMergeModal}>
                <GitMerge size={14} />
                <span>Merge Selected ({selectedRoleIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Expanded Filters grid */}
        {showFilters && (
          <div className="filters-grid-expand">
            <div className="filter-select-group">
              <label>Classification</label>
              <select value={classificationFilter} onChange={(e) => { setClassificationFilter(e.target.value); setPage(1); }}>
                <option value="">All Classifications</option>
                <option value="Classified">Classified (Any Category)</option>
                <option value="Not Classified">Not Classified (Unassigned)</option>
                <option value="Birthright">Birthright</option>
                <option value="Request-Based">Request-Based</option>
              </select>
            </div>

            <div className="filter-select-group">
              <label>Risk</label>
              <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}>
                <option value="">All Risks</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="filter-select-group">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Published">Published</option>
              </select>
            </div>

            <div className="filter-select-group">
              <label>Department</label>
              <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                {uniqueDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="filter-select-group">
              <label>Business Unit</label>
              <select value={buFilter} onChange={(e) => { setBuFilter(e.target.value); setPage(1); }}>
                <option value="">All Business Units</option>
                {uniqueBUs.map(bu => <option key={bu} value={bu}>{bu}</option>)}
              </select>
            </div>

            <div className="filter-select-group" style={{ justifyContent: 'flex-end' }}>
              <button 
                className="btn-action-premium" 
                onClick={handleResetFilters}
                style={{ padding: '8px 12px', height: '36px' }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table view */}
      {!showAnalyticalView && (
      <div className="workbench-table-wrapper">
        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading candidate roles...</p>
          </div>
        ) : roles.length === 0 ? (
          <div className="table-empty-container">
            <div className="confirm-icon-box" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <Layers size={22} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600 }}>No Candidate Roles found</h4>
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                Adjust search keywords or filter dropdown values.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="workbench-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', paddingLeft: '16px' }}>
                      <input 
                        type="checkbox" 
                        checked={roles.length > 0 && roles.every(r => selectedRoleIds.includes(r.id))}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th className="sortable" onClick={() => handleSort('role_name')}>Role Name</th>
                    <th className="sortable" onClick={() => handleSort('classification')}>Classification</th>
                    <th className="sortable" onClick={() => handleSort('role_type')}>Role Type</th>
                    <th className="sortable" onClick={() => handleSort('risk_level')}>Risk</th>
                    <th>Users</th>
                    <th>Applications</th>
                    <th>Entitlements</th>
                    <th className="sortable" onClick={() => handleSort('confidence_score')}>Confidence</th>
                    <th className="sortable" onClick={() => handleSort('status')}>Status</th>
                    <th className="sortable" onClick={() => handleSort('generated_on')}>Generated On</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: '16px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedRoleIds.includes(r.id)}
                          onChange={() => handleToggleSelectRow(r.id)}
                        />
                      </td>
                      <td>
                        <div className="role-name-cell">
                          <span 
                            style={{ cursor: 'pointer', color: 'var(--primary)' }}
                            onClick={() => handleOpenDrawer(r.id)}
                          >
                            {r.role_name}
                          </span>
                          {r.sod_violation_count > 0 && (
                            <span 
                              className="sod-violation-indicator"
                              title={`${r.sod_violation_count} Segregation of Duties conflicts detected!`}
                            >
                              <ShieldAlert size={14} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {r.classification ? (
                          <span className={`classification-tag ${r.classification.toLowerCase()}`}>
                            {r.classification}
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '11px' }}>-</span>
                        )}
                      </td>
                      <td>{r.role_type}</td>
                      <td>
                        <span className={`risk-badge ${r.risk_level.toLowerCase()}`}>
                          {r.risk_level}
                        </span>
                      </td>
                      <td>{r.user_count}</td>
                      <td>{r.application_count}</td>
                      <td>{r.entitlement_count}</td>
                      <td>{r.confidence_score}%</td>
                      <td>
                        <span className={`status-badge ${r.status.toLowerCase()}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.generated_on ? new Date(r.generated_on).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn-row-action" onClick={() => handleOpenDrawer(r.id)} title="View Detail">
                            <Eye size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleOpenEditModal(r)} title="Edit Role">
                            <Edit size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleOpenSplitModal(r)} title="Split Role">
                            <Scissors size={13} />
                          </button>
                          <button className="btn-row-action delete" onClick={() => handleOpenDeleteConfirm(r)} title="Delete Role">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-footer">
              <span>
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> candidate roles
              </span>
              
              <div className="pagination-controls">
                <button
                  className="btn-page-step"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                {renderPageNumbers()}
                <button
                  className="btn-page-step"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Analytical View - list-level, spans the checked (or top 10) candidate roles */}
      {showAnalyticalView && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="analytical-view-toolbar">
            <div className="analytical-view-caption">
              <span className="analytical-view-caption-title">
                {selectedRoleIds.length > 0 ? `Scope: ${selectedRoleIds.length} selected role(s)` : 'Scope: Top 10 roles by confidence score'}
              </span>
              <span className="analytical-view-caption-desc">{ANALYTICAL_VIEW_HINTS[analyticalViewMode]}</span>
            </div>
            <div className="analytical-view-controls">
              <select
                className="analytical-view-select"
                value={analyticalViewMode}
                onChange={(e) => setAnalyticalViewMode(e.target.value)}
              >
                {VIEW_MODES.map((vm) => (
                  <option key={vm.value} value={vm.value}>{vm.label}</option>
                ))}
              </select>
              <button className="btn-action-premium" onClick={handleLoadMultiRoleMatrix}>
                <RefreshCw size={14} className={matrixLoading ? 'spin-element' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
          {matrixError && <div className="drawer-tab-empty-msg"><p>{matrixError}</p></div>}
          {analyticalViewMode === 'grid' ? (
            <RoleMiningMatrix
              loading={matrixLoading}
              entitlements={multiRoleMatrix?.entitlements || []}
              members={multiRoleMatrix?.members || []}
              cells={multiRoleMatrix?.cells || []}
              roles={multiRoleMatrix?.roles || []}
              emptyMessage="No candidate roles with mined entitlements/members yet."
            />
          ) : (
            <RoleAnalyticalCharts
              loading={matrixLoading}
              mode={analyticalViewMode}
              entitlements={multiRoleMatrix?.entitlements || []}
              members={multiRoleMatrix?.members || []}
              cells={multiRoleMatrix?.cells || []}
              emptyMessage="No candidate roles with mined entitlements/members yet."
            />
          )}
        </div>
      )}

      {/* Right Detail Panel Drawer */}
      <div 
        className={`drawer-overlay-overlay ${showDrawer ? 'open' : ''}`}
        onClick={handleCloseDrawer}
      />
      <div className={`drawer-panel-custom ${showDrawer ? 'open' : ''} ${drawerFullscreen ? 'fullscreen' : ''}`}>
        {selectedRole && (
          <>
             <div className="drawer-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <div className="drawer-title-sub" style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }} title={selectedRole.role_name}>
                  {selectedRole.role_name}
                </h4>
                <p style={{ margin: '4px 0 0 0' }}>ID: {selectedRole.id} • Job Cluster: {selectedRole.job_function || 'Custom'}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  className="btn-drawer-close"
                  title={drawerFullscreen ? 'Exit full screen' : 'View full screen'}
                  onClick={() => setDrawerFullscreen((prev) => !prev)}
                >
                  {drawerFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                {currentUser?.role !== 'Viewer' && ['Draft', 'Reviewed'].includes(selectedRole.status) && (
                  <button
                    className="btn-action-premium primary"
                    style={{ fontSize: '11px', padding: '4px 10px', height: 'auto' }}
                    onClick={() => setShowSubmitModal(true)}
                  >
                    Submit for Approval
                  </button>
                )}
                {currentUser?.role !== 'Viewer' && ['Ready For Publish', 'Published'].includes(selectedRole.status) && (
                  <button
                    className="btn-action-premium primary"
                    style={{ fontSize: '11px', padding: '4px 10px', height: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={handlePublishToCatalog}
                    disabled={publishing}
                  >
                    <BookOpen size={12} />
                    {publishing ? 'Publishing...' : selectedRole.status === 'Published' ? 'Re-publish to Catalog' : 'Publish to Catalog'}
                  </button>
                )}
                <button 
                  className="btn-action-premium" 
                  style={{ fontSize: '11px', padding: '4px 10px', height: 'auto' }} 
                  onClick={handleCloseDrawer}
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="drawer-tabs-navigation">
              <button 
                className={`drawer-tab-btn ${detailTab === 'info' ? 'active' : ''}`}
                onClick={() => setDetailTab('info')}
              >
                General Info
              </button>
              <button
                className={`drawer-tab-btn ${detailTab === 'insights' ? 'active' : ''}`}
                onClick={() => setDetailTab('insights')}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Lightbulb size={13} />
                Discovery Insights
              </button>
              <button
                className={`drawer-tab-btn ${detailTab === 'entitlements' ? 'active' : ''}`}
                onClick={() => setDetailTab('entitlements')}
              >
                Entitlements ({selectedRole.entitlements ? selectedRole.entitlements.length : 0})
              </button>
              <button 
                className={`drawer-tab-btn ${detailTab === 'users' ? 'active' : ''}`}
                onClick={() => setDetailTab('users')}
              >
                Assigned Users ({selectedRole.members ? selectedRole.members.length : 0})
              </button>
              {selectedRole.sod_violation_count > 0 && (
                <button 
                  className={`drawer-tab-btn ${detailTab === 'sod' ? 'active' : ''}`}
                  onClick={() => setDetailTab('sod')}
                  style={{ color: 'var(--danger)' }}
                >
                  SoD Violations ({selectedRole.sod_violation_count})
                </button>
              )}
              <button 
                className={`drawer-tab-btn ${detailTab === 'owners' ? 'active' : ''}`}
                onClick={() => setDetailTab('owners')}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <UserCheck size={13} />
                Owners
                {(ownerData.primary || ownerData.backup) && (
                  <span style={{ background: 'var(--success)', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '9px', fontWeight: 700 }}>
                    {[ownerData.primary, ownerData.backup].filter(Boolean).length}
                  </span>
                )}
              </button>
              <button 
                className={`drawer-tab-btn ${detailTab === 'preview' ? 'active' : ''}`}
                onClick={() => { setDetailTab('preview'); if (!rolePreview) handleLoadPreview(selectedRole.id); }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ClipboardList size={13} />
                Preview
              </button>
              <button 
                className={`drawer-tab-btn ${detailTab === 'timeline' ? 'active' : ''}`}
                onClick={() => setDetailTab('timeline')}
              >
                Audit Timeline
              </button>
            </div>

            <div className="drawer-scroll-body-wrapper">
              {drawerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '40px 0' }}>
                  <div className="spinner-element"></div>
                  <p className="text-muted" style={{ fontSize: '12px' }}>Loading role details...</p>
                </div>
              ) : (
                <>
                  {detailTab === 'info' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="meta-attribute-item">
                        <label>Description</label>
                        <span>{selectedRole.role_description || 'No description provided.'}</span>
                      </div>

                      {/* SoD Conflict Box */}
                      {selectedRole.sod_violation_count > 0 && (
                        <div className="sod-conflict-alert-box">
                          <ShieldAlert size={20} style={{ flexShrink: 0 }} />
                          <div>
                            <span style={{ fontWeight: 600 }}>Segregation of Duties Conflicts Detected!</span>
                            <p style={{ marginTop: '4px' }}>
                              This role contains conflicting administrative or writing privileges that violate policies. Classifying or publishing this role requires strict authorization.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Classification editor panel */}
                      <div className="classification-editor-panel">
                        <h5>Role Classification</h5>
                        <div className="classification-options-layout">
                          {['Birthright', 'Request-Based'].map(opt => (
                            <div 
                              key={opt}
                              className={`classification-option-row ${editClassification === opt ? 'selected' : ''}`}
                              onClick={() => setEditClassification(opt)}
                            >
                              <input 
                                type="radio" 
                                name="classify-option"
                                checked={editClassification === opt}
                                onChange={() => setEditClassification(opt)}
                              />
                              <div className="classification-option-label">
                                <span>{opt}</span>
                                <span className="classification-option-desc">
                                  {opt === 'Birthright' && 'Assigned automatically to all new identities matching their job function.'}
                                  {opt === 'Request-Based' && 'Available for identities to request on demand, subject to approval.'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {editClassification !== (selectedRole.classification || '') && (
                          <div className="classification-editor-actions">
                            <button 
                              className="btn-action-premium"
                              onClick={() => setEditClassification(selectedRole.classification || '')}
                            >
                              Cancel
                            </button>
                            <button 
                              className="btn-action-premium primary"
                              onClick={handleSaveClassification}
                            >
                              Save Classification
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="meta-attributes-list">
                        <div className="meta-attribute-item">
                          <label>Role Type</label>
                          <span>{selectedRole.role_type}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Risk Level</label>
                          <span>{selectedRole.risk_level}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Confidence Score</label>
                          <span>{selectedRole.confidence_score}%</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Status</label>
                          <span>{selectedRole.status}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Department</label>
                          <span>{selectedRole.department || '-'}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Business Unit</label>
                          <span>{selectedRole.business_unit || '-'}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Source</label>
                          <span>{selectedRole.source}</span>
                        </div>
                        <div className="meta-attribute-item">
                          <label>Generated By</label>
                          <span>{selectedRole.generated_by}</span>
                        </div>
                        <div className="meta-attribute-item" style={{ gridColumn: 'span 2' }}>
                          <label>Discovered Date</label>
                          <span>{selectedRole.generated_on ? new Date(selectedRole.generated_on).toLocaleString() : '-'}</span>
                        </div>
                      </div>

                      <div className="meta-attribute-item">
                        <label>Mapped Applications</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {selectedRole.applications && selectedRole.applications.length > 0 ? (
                            selectedRole.applications.map(app => (
                              <span key={app} className="status-badge reviewed" style={{ textTransform: 'none' }}>
                                {app}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted" style={{ fontSize: '13px' }}>No applications mapped.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {detailTab === 'insights' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {selectedRole.discovery_insights ? (
                        <>
                          <div className="meta-attribute-item">
                            <label>How This Role Was Discovered</label>
                            <span>{selectedRole.discovery_insights.summary}</span>
                          </div>

                          <div className="meta-attributes-list">
                            <div className="meta-attribute-item">
                              <label>Job Function</label>
                              <span>{selectedRole.discovery_insights.job_function || '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Mining Campaign</label>
                              <span>{selectedRole.discovery_insights.campaign_name || '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Similarity Threshold (eps)</label>
                              <span>{selectedRole.discovery_insights.similarity_eps ?? '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Minimum Cluster Size</label>
                              <span>{selectedRole.discovery_insights.min_cluster_size ?? '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Core Entitlement Threshold</label>
                              <span>{selectedRole.discovery_insights.core_threshold_pct}%</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Confidence Score</label>
                              <span>{selectedRole.discovery_insights.confidence_score}%</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="drawer-tab-empty-msg">
                          <p>No discovery insights available for this role.</p>
                        </div>
                      )}

                      {selectedRole.recommended_action && (
                        <div className="classification-editor-panel">
                          <h5 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowRightCircle size={15} />
                            Recommended Action
                          </h5>
                          <div style={{ marginTop: '10px' }}>
                            <span className={`status-badge ${
                              selectedRole.recommended_action.action === 'Publish' ? 'approved' :
                              selectedRole.recommended_action.action === 'Merge' ? 'reviewed' :
                              selectedRole.recommended_action.action === 'Split' ? 'rejected' :
                              'draft'
                            }`}>
                              {selectedRole.recommended_action.action}
                            </span>
                          </div>
                          <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
                            {selectedRole.recommended_action.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'entitlements' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selectedRole.entitlements && selectedRole.entitlements.length > 0 ? (
                        selectedRole.entitlements.map(ent => (
                          <div 
                            key={ent.id}
                            style={{
                              padding: '12px',
                              backgroundColor: 'var(--bg-hover)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{ent.entitlement_name}</div>
                              <div className="text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                                App: {ent.application_name || 'System Default'} • Coverage: {ent.member_coverage_pct}%
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {ent.is_core && (
                                <span className="status-badge approved" style={{ fontSize: '9px', padding: '2px 6px' }}>
                                  Core
                                </span>
                              )}
                              <span className={`risk-badge ${ent.risk.toLowerCase()}`}>
                                {ent.risk}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="drawer-tab-empty-msg">
                          <p>No entitlements mapped to this candidate role.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'users' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {selectedRole.members && selectedRole.members.length > 0 ? (
                        selectedRole.members.map(member => (
                          <div 
                            key={member.id}
                            style={{
                              padding: '12px',
                              backgroundColor: 'var(--bg-hover)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px'
                            }}
                          >
                            <div 
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary-light)',
                                color: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              {member.employee_name ? member.employee_name[0] : 'U'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{member.employee_name}</div>
                              <div className="text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                                Emp ID: {member.employee_id || '-'} • Dept: {member.department || '-'}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="drawer-tab-empty-msg">
                          <p>No assigned identities found for this candidate role.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'sod' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="sod-conflict-alert-box">
                        <ShieldAlert size={20} style={{ flexShrink: 0 }} />
                        <span>The following toxic combinations are violations of Segregation of Duties.</span>
                      </div>
                      
                      <div className="sod-conflict-list">
                        {selectedRole.sod_violations && selectedRole.sod_violations.map((vio, idx) => (
                          <div key={idx} className="sod-conflict-item-detail">
                            <div>
                              <strong>Conflicting pair:</strong> {vio.entitlement_1} & {vio.entitlement_2}
                            </div>
                            <p style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              {vio.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detailTab === 'owners' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                      {/* Owner Cards */}
                      {['Primary', 'Backup'].map(type => {
                        const owner = type === 'Primary' ? ownerData.primary : ownerData.backup;
                        return (
                          <div key={type} style={{
                            border: `1.5px solid ${owner ? (owner.is_expired ? 'var(--danger)' : 'var(--border-color)') : 'var(--border-color)'}`,
                            borderRadius: '10px',
                            padding: '16px',
                            backgroundColor: 'var(--bg-hover)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <UserCheck size={16} style={{ color: type === 'Primary' ? 'var(--primary)' : 'var(--text-muted)' }} />
                                <span style={{ fontWeight: 700, fontSize: '13px' }}>{type} Owner</span>
                                {owner?.is_expired && (
                                  <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '10px', fontWeight: 600 }}>EXPIRED</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  className="btn-action-premium"
                                  style={{ padding: '4px 10px', fontSize: '11px', height: 'auto' }}
                                  onClick={() => { setAssignOwnerType(type); setShowAssignOwnerForm(true); setOwnerFormError(''); }}
                                >
                                  <UserPlus size={11} /> {owner ? 'Reassign' : 'Assign'}
                                </button>
                                {owner && (
                                  <button
                                    className="btn-action-premium"
                                    style={{ padding: '4px 10px', fontSize: '11px', height: 'auto', background: 'var(--danger-light)', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                    onClick={() => handleRemoveOwner(type)}
                                    disabled={ownerSubmitting}
                                  >
                                    <UserMinus size={11} /> Remove
                                  </button>
                                )}
                              </div>
                            </div>

                            {owner ? (
                              <div className="meta-attributes-list" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="meta-attribute-item">
                                  <label>Name</label>
                                  <span style={{ fontWeight: 600 }}>{owner.owner_name}</span>
                                </div>
                                <div className="meta-attribute-item">
                                  <label>Email</label>
                                  <span>{owner.owner_email || '-'}</span>
                                </div>
                                <div className="meta-attribute-item">
                                  <label>Review Date</label>
                                  <span style={{ color: owner.is_expired ? 'var(--danger)' : 'inherit' }}>
                                    {owner.review_date ? new Date(owner.review_date).toLocaleDateString() : 'Not set'}
                                  </span>
                                </div>
                                <div className="meta-attribute-item">
                                  <label>Assigned By</label>
                                  <span>{owner.assigned_by}</span>
                                </div>
                                <div className="meta-attribute-item" style={{ gridColumn: 'span 2' }}>
                                  <label>Assigned At</label>
                                  <span>{owner.assigned_at ? new Date(owner.assigned_at).toLocaleString() : '-'}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-muted" style={{ fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>
                                No {type} Owner assigned. Click Assign to configure.
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {/* Owner History Toggle */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          className="btn-action-premium"
                          style={{ fontSize: '11px', padding: '5px 14px' }}
                          onClick={handleLoadOwnerHistory}
                          disabled={ownerHistoryLoading}
                        >
                          <History size={12} /> {ownerHistoryLoading ? 'Loading...' : 'View Owner History'}
                        </button>
                      </div>

                      {showOwnerHistory && ownerHistory.length > 0 && (
                        <div>
                          <h5 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner Change History</h5>
                          {ownerHistory.map(h => (
                            <div key={h.id} style={{
                              padding: '10px 12px',
                              borderLeft: `3px solid ${h.is_active ? 'var(--primary)' : 'var(--border-color)'}`,
                              marginBottom: '8px',
                              backgroundColor: 'var(--bg-hover)',
                              borderRadius: '0 6px 6px 0',
                              fontSize: '12px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 600 }}>{h.owner_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({h.owner_type})</span></span>
                                <span className={`status-badge ${h.is_active ? 'approved' : 'draft'}`} style={{ fontSize: '9px' }}>
                                  {h.is_active ? 'Active' : 'Removed'}
                                </span>
                              </div>
                              <div className="text-muted">
                                Assigned: {h.assigned_at ? new Date(h.assigned_at).toLocaleDateString() : '-'}
                                {h.removed_at && ` • Removed: ${new Date(h.removed_at).toLocaleDateString()}`}
                              </div>
                              {h.change_reason && <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--text-muted)' }}>Reason: {h.change_reason}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'preview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {previewLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0' }}>
                          <div className="spinner-element" />
                          <p className="text-muted" style={{ fontSize: '12px', marginTop: '12px' }}>Building role preview...</p>
                        </div>
                      ) : previewError ? (
                        <div className="sod-conflict-alert-box">
                          <AlertTriangle size={18} />
                          <span>{previewError}</span>
                        </div>
                      ) : rolePreview ? (
                        <>
                          {/* Export Buttons */}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', alignSelf: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Export Preview:</span>
                            <button className="btn-action-premium" style={{ fontSize: '11px', padding: '4px 12px', height: 'auto' }} onClick={() => handleExportPreview('json')} disabled={!!exportingPreview}>
                              <FileJson size={12} /> {exportingPreview === 'json' ? 'Exporting...' : 'JSON'}
                            </button>
                            <button className="btn-action-premium" style={{ fontSize: '11px', padding: '4px 12px', height: 'auto' }} onClick={() => handleExportPreview('csv')} disabled={!!exportingPreview}>
                              <FileText size={12} /> {exportingPreview === 'csv' ? 'Exporting...' : 'CSV'}
                            </button>
                            <button className="btn-action-premium" style={{ fontSize: '11px', padding: '4px 12px', height: 'auto' }} onClick={() => handleExportPreview('excel')} disabled={!!exportingPreview}>
                              <FileSpreadsheet size={12} /> {exportingPreview === 'excel' ? 'Exporting...' : 'Excel'}
                            </button>
                          </div>

                          {/* Risk Score Gauge */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '16px',
                            padding: '16px', borderRadius: '10px',
                            border: '1.5px solid var(--border-color)',
                            backgroundColor: 'var(--bg-hover)'
                          }}>
                            <div style={{
                              width: '64px', height: '64px', borderRadius: '50%',
                              border: `4px solid ${getRiskScoreColor(rolePreview.role.risk_score)}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <span style={{ fontSize: '18px', fontWeight: 800, color: getRiskScoreColor(rolePreview.role.risk_score) }}>
                                {rolePreview.role.risk_score}
                              </span>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px' }}>Composite Risk Score</div>
                              <div className="text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>
                                Based on risk level, SoD violations, entitlement risk, and classification
                              </div>
                              <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span className={`risk-badge ${rolePreview.role.risk_level?.toLowerCase()}`}>{rolePreview.role.risk_level}</span>
                                {rolePreview.sod_violations.length > 0 && (
                                  <span className="sod-violation-indicator" style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '4px' }}>
                                    <ShieldAlert size={10} /> {rolePreview.sod_violations.length} SoD
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Readiness Checks */}
                          <div style={{ border: '1.5px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{
                              padding: '12px 16px',
                              backgroundColor: rolePreview.readiness.is_ready ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)',
                              borderBottom: '1px solid var(--border-color)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {rolePreview.readiness.is_ready
                                  ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                                  : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
                                <span style={{ fontWeight: 700, fontSize: '13px' }}>
                                  {rolePreview.readiness.is_ready ? 'Role is Ready for Approval' : 'Role Has Blocking Issues'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                                <span style={{ color: 'var(--success)' }}>✓ {rolePreview.readiness.passed} passed</span>
                                {rolePreview.readiness.error_count > 0 && <span style={{ color: 'var(--danger)' }}>✗ {rolePreview.readiness.error_count} errors</span>}
                                {rolePreview.readiness.warning_count > 0 && <span style={{ color: '#f59e0b' }}>⚠ {rolePreview.readiness.warning_count} warnings</span>}
                              </div>
                            </div>
                            {rolePreview.readiness.checks.map((chk, idx) => (
                              <div key={idx} style={{
                                padding: '10px 16px',
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                borderBottom: idx < rolePreview.readiness.checks.length - 1 ? '1px solid var(--border-color)' : 'none',
                                backgroundColor: chk.passed ? 'transparent' : (chk.severity === 'error' ? 'rgba(239,68,68,0.04)' : 'rgba(245,158,11,0.04)')
                              }}>
                                {chk.passed
                                  ? <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '1px' }} />
                                  : chk.severity === 'error'
                                    ? <XCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '1px' }} />
                                    : <AlertCircle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />}
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{chk.check}</div>
                                  <div className="text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>{chk.message}</div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Owner Summary in Preview */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {['primary', 'backup'].map(type => (
                              <div key={type} style={{
                                padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-hover)'
                              }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                  {type} Owner
                                </div>
                                {rolePreview.owners[type] ? (
                                  <>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{rolePreview.owners[type].owner_name}</div>
                                    <div className="text-muted" style={{ fontSize: '11px' }}>{rolePreview.owners[type].owner_email || '-'}</div>
                                    {rolePreview.owners[type].is_expired && (
                                      <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '8px', padding: '1px 6px', fontSize: '9px', fontWeight: 600, marginTop: '4px', display: 'inline-block' }}>EXPIRED</span>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-muted" style={{ fontSize: '12px' }}>Not assigned</div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Metadata summary */}
                          <div className="meta-attributes-list">
                            <div className="meta-attribute-item">
                              <label>Classification</label>
                              <span>{rolePreview.role.classification || '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Status</label>
                              <span className={`status-badge ${(rolePreview.role.status || 'draft').toLowerCase()}`}>{rolePreview.role.status}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Members</label>
                              <span>{rolePreview.members.length}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Core Entitlements</label>
                              <span>{rolePreview.entitlements.filter(e => e.is_core).length} / {rolePreview.entitlements.length}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>Applications</label>
                              <span>{rolePreview.applications.join(', ') || '-'}</span>
                            </div>
                            <div className="meta-attribute-item">
                              <label>SoD Violations</label>
                              <span style={{ color: rolePreview.sod_violations.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                {rolePreview.sod_violations.length}
                              </span>
                            </div>
                          </div>

                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right' }}>
                            Preview generated at {new Date(rolePreview.generated_at).toLocaleString()}
                            <button
                              className="btn-action-premium"
                              style={{ marginLeft: '10px', fontSize: '10px', padding: '3px 10px', height: 'auto' }}
                              onClick={() => handleLoadPreview(selectedRole.id)}
                            >
                              <RefreshCw size={10} /> Refresh
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: '12px' }}>
                          <ClipboardList size={36} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-muted" style={{ fontSize: '13px' }}>Preview not loaded yet.</p>
                          <button className="btn-action-premium primary" onClick={() => handleLoadPreview(selectedRole.id)}>
                            Load Preview
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === 'timeline' && (
                    <div className="timeline-logs-wrapper">
                      {selectedRole.audit_timeline && selectedRole.audit_timeline.length > 0 ? (
                        selectedRole.audit_timeline.map(log => (
                          <div key={log.id} className="timeline-log-row">
                            <div className="timeline-marker-dot active">
                              <History size={11} />
                            </div>
                            <div className="timeline-log-details">
                              <div className="timeline-log-header">
                                <span className="timeline-log-action">{log.action}</span>
                                <span className="timeline-log-time">
                                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                                </span>
                              </div>
                              <span className="timeline-log-user">Performed by: {log.performed_by}</span>
                              {log.new_value && (
                                <pre className="timeline-log-diff">
                                  {JSON.stringify(JSON.parse(log.new_value), null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="drawer-tab-empty-msg">
                          <p>No audit timeline events recorded for this candidate role.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog: classification change */}
      {showConfirmClassify && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel">
            <div className="confirm-dialog-content">
              <div className="confirm-icon-box">
                <AlertTriangle size={20} />
              </div>
              <div className="confirm-text-desc">
                <h4>Confirm Classification</h4>
                <p>
                  Are you sure you want to classify this role as <b>{editClassification}</b>? 
                  This update will alter the classification status, trigger audit logs, and affect downstream governance provisioning rules.
                </p>
              </div>
            </div>
            <div className="modal-dialog-footer">
              <button 
                className="btn-action-premium" 
                onClick={() => setShowConfirmClassify(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                className="btn-action-premium primary" 
                onClick={handleConfirmClassification}
                disabled={submitting}
              >
                {submitting ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Role Modal */}
      {showEditModal && (
        <div className="modal-overlay-custom">
          <form className="modal-dialog-panel" onSubmit={handleSaveEdit}>
            <div className="modal-dialog-header">
              <h4>Edit Candidate Role</h4>
              <button 
                type="button" 
                className="btn-drawer-close"
                onClick={() => setShowEditModal(false)}
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="modal-dialog-body">
              <div className="form-input-group">
                <label>Role Name *</label>
                <input 
                  type="text" 
                  value={editFormData.role_name}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, role_name: e.target.value }))}
                  required
                />
              </div>

              <div className="form-input-group">
                <label>Description</label>
                <textarea 
                  value={editFormData.role_description}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, role_description: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-input-group">
                  <label>Role Type</label>
                  <select 
                    value={editFormData.role_type}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, role_type: e.target.value }))}
                  >
                    <option value="Business">Business</option>
                    <option value="Technical">Technical</option>
                    <option value="Composite">Composite</option>
                  </select>
                </div>

                <div className="form-input-group">
                  <label>Risk Level</label>
                  <select 
                    value={editFormData.risk_level}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, risk_level: e.target.value }))}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-input-group">
                  <label>Department</label>
                  <input 
                    type="text" 
                    value={editFormData.department}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, department: e.target.value }))}
                  />
                </div>

                <div className="form-input-group">
                  <label>Business Unit</label>
                  <input 
                    type="text" 
                    value={editFormData.business_unit}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, business_unit: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-input-group">
                <label>Status</label>
                <select 
                  value={editFormData.status}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="Draft">Draft</option>
                  <option value="Reviewed">Reviewed</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Published">Published</option>
                </select>
              </div>
            </div>

            <div className="modal-dialog-footer">
              <button 
                type="button" 
                className="btn-action-premium" 
                onClick={() => setShowEditModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-action-premium primary"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel">
            <div className="confirm-dialog-content">
              <div className="confirm-icon-box danger">
                <Trash2 size={20} />
              </div>
              <div className="confirm-text-desc">
                <h4>Delete Candidate Role</h4>
                <p>
                  Are you sure you want to delete the candidate role <b>{deleteRoleName}</b>? 
                  This performs a soft delete, flagging it as deleted. This action can be audited and reversed.
                </p>
              </div>
            </div>
            <div className="modal-dialog-footer">
              <button 
                className="btn-action-premium" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                className="btn-action-premium primary" 
                style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={handleConfirmDelete}
                disabled={submitting}
              >
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showPublishConfirm && selectedRole && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel">
            <div className="confirm-dialog-content">
              <div className="confirm-icon-box">
                <BookOpen size={20} />
              </div>
              <div className="confirm-text-desc">
                <h4>Publish to Role Catalog</h4>
                <p>
                  Publish <b>{selectedRole.role_name}</b> to the Role Catalog? It will become
                  visible in the Published/Business/Technical Role views.
                </p>
              </div>
            </div>
            <div className="modal-dialog-footer">
              <button
                className="btn-action-premium"
                onClick={() => setShowPublishConfirm(false)}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                className="btn-action-premium primary"
                onClick={handleConfirmPublish}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Assign Owner Modal */}
      {showAssignOwnerForm && selectedRole && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel" style={{ maxWidth: '480px' }}>
            <div className="modal-dialog-header">
              <h4>Assign {assignOwnerType} Owner — {selectedRole.role_name}</h4>
              <button type="button" className="btn-drawer-close" onClick={() => { setShowAssignOwnerForm(false); setOwnerFormError(''); }}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-input-group">
                <label>Owner Type</label>
                <select value={assignOwnerType} onChange={e => setAssignOwnerType(e.target.value)}>
                  <option value="Primary">Primary Owner</option>
                  <option value="Backup">Backup Owner</option>
                </select>
              </div>

              <div className="form-input-group" style={{ position: 'relative' }}>
                <label>Search Platform User *</label>
                {selectedOwnerUser ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 12px', border: '1px solid var(--primary)',
                    borderRadius: '6px', backgroundColor: 'var(--bg-hover)'
                  }}>
                    <UserCheck size={14} style={{ color: 'var(--primary)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{selectedOwnerUser.full_name}</div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>{selectedOwnerUser.email} • {selectedOwnerUser.department || 'No dept'}</div>
                    </div>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      onClick={() => { setSelectedOwnerUser(null); setOwnerSearchQuery(''); }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search by name, email, or employee ID..."
                      value={ownerSearchQuery}
                      onChange={e => setOwnerSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {ownerSearchLoading && (
                      <div className="text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>Searching...</div>
                    )}
                    {ownerSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        maxHeight: '200px', overflowY: 'auto', marginTop: '2px'
                      }}>
                        {ownerSearchResults.map(u => (
                          <div
                            key={u.id}
                            style={{
                              padding: '8px 12px', cursor: 'pointer',
                              borderBottom: '1px solid var(--border-color)',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={() => { setSelectedOwnerUser(u); setOwnerSearchQuery(u.full_name); setOwnerSearchResults([]); }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{u.full_name}</div>
                            <div className="text-muted" style={{ fontSize: '11px' }}>{u.email} • {u.department || 'No department'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="form-input-group">
                <label>Review / Expiry Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="datetime-local"
                  value={ownerReviewDate}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => setOwnerReviewDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-input-group">
                <label>Change Reason <span className="text-muted">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Reason for this assignment..."
                  value={ownerChangeReason}
                  onChange={e => setOwnerChangeReason(e.target.value)}
                />
              </div>

              {ownerFormError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
                  color: 'var(--danger)', fontSize: '12px'
                }}>
                  <AlertTriangle size={14} />
                  {ownerFormError}
                </div>
              )}
            </div>

            <div className="modal-dialog-footer">
              <button
                type="button"
                className="btn-action-premium"
                onClick={() => { setShowAssignOwnerForm(false); setOwnerFormError(''); }}
                disabled={ownerSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action-premium primary"
                onClick={handleAssignOwner}
                disabled={ownerSubmitting || (!selectedOwnerUser && !ownerSearchQuery.trim()) || !ownerReviewDate}
              >
                {ownerSubmitting ? 'Assigning...' : `Assign ${assignOwnerType} Owner`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RE-002: Merge Roles Modal */}
      {showMergeModal && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel" style={{ maxWidth: '620px' }}>
            <div className="modal-dialog-header">
              <h4>Merge {selectedRoleIds.length} Candidate Roles</h4>
              <button type="button" className="btn-drawer-close" onClick={handleCloseMergeModal}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '65vh', overflowY: 'auto' }}>
              {mergePreviewLoading ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>Loading merge preview...</div>
              ) : mergePreviewData ? (
                <>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Source Roles</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {mergePreviewData.source_roles.map(r => (
                        <span key={r.id} className={`status-badge ${r.status.toLowerCase()}`} style={{ fontSize: '11px' }}>
                          {r.role_name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div className="form-input-group">
                      <label>Combined Users</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.combined_user_count}</div>
                    </div>
                    <div className="form-input-group">
                      <label>Combined Entitlements</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.combined_entitlement_count}</div>
                    </div>
                    <div className="form-input-group">
                      <label>Combined Applications</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.combined_application_count}</div>
                    </div>
                    <div className="form-input-group">
                      <label>Duplicate Users</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.duplicate_user_count}</div>
                    </div>
                    <div className="form-input-group">
                      <label>Duplicate Entitlements</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.duplicate_entitlement_count}</div>
                    </div>
                    <div className="form-input-group">
                      <label>Est. Confidence</label>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{mergePreviewData.estimated_confidence_score}%</div>
                    </div>
                  </div>

                  {mergePreviewData.sod_violation_count > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                      padding: '10px 12px', borderRadius: '6px',
                      backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
                      color: 'var(--danger)', fontSize: '12px'
                    }}>
                      <AlertTriangle size={14} style={{ marginTop: '1px', flexShrink: 0 }} />
                      <span>{mergePreviewData.sod_violation_count} Segregation of Duties conflict(s) would exist in the merged role. Review before confirming.</span>
                    </div>
                  )}

                  <div className="form-input-group">
                    <label>Destination Role Name *</label>
                    <input
                      type="text"
                      placeholder="Name for the merged role..."
                      value={mergeDestinationName}
                      onChange={e => setMergeDestinationName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="form-input-group">
                    <label>Description <span className="text-muted">(optional)</span></label>
                    <input
                      type="text"
                      placeholder="Describe the merged role..."
                      value={mergeDescription}
                      onChange={e => setMergeDescription(e.target.value)}
                    />
                  </div>

                  <div className="form-input-group">
                    <label>Merge Reason <span className="text-muted">(optional)</span></label>
                    <input
                      type="text"
                      placeholder="Why are these roles being merged?"
                      value={mergeReason}
                      onChange={e => setMergeReason(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {mergePreviewError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
                  color: 'var(--danger)', fontSize: '12px'
                }}>
                  <AlertTriangle size={14} />
                  {mergePreviewError}
                </div>
              )}
            </div>

            <div className="modal-dialog-footer">
              <button type="button" className="btn-action-premium" onClick={handleCloseMergeModal} disabled={mergeSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-action-premium primary"
                onClick={handleConfirmMerge}
                disabled={mergeSubmitting || mergePreviewLoading || !mergePreviewData}
              >
                {mergeSubmitting ? 'Merging...' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RE-003: Split Role Modal */}
      {showSplitModal && splitTargetRole && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel" style={{ maxWidth: '680px' }}>
            <div className="modal-dialog-header">
              <h4>Split Role — {splitTargetRole.role_name}</h4>
              <button type="button" className="btn-drawer-close" onClick={handleCloseSplitModal}>
                <X size={14} />
              </button>
            </div>

            <div className="modal-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '65vh', overflowY: 'auto' }}>
              <div className="form-input-group">
                <label>Split Method</label>
                <select value={splitMethod} onChange={e => handleSplitMethodChange(e.target.value)}>
                  <option value="application">By Application</option>
                  <option value="department">By Department</option>
                  <option value="business_unit">By Business Unit</option>
                  <option value="entitlement_group">By Entitlement Risk Level</option>
                  <option value="manual">Manual (split in half)</option>
                </select>
              </div>

              {splitPreviewLoading ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>Loading split preview...</div>
              ) : splitPreviewData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {splitPreviewData.splits.map((s, idx) => (
                    <div key={idx} style={{
                      border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px',
                      backgroundColor: 'var(--bg-hover)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '13px' }}>{s.role_name}</strong>
                        <span className="text-muted" style={{ fontSize: '11px' }}>{s.estimated_confidence_score}% confidence</span>
                      </div>
                      <p className="text-muted" style={{ fontSize: '12px', marginBottom: '8px' }}>{s.role_description}</p>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                        <span>{s.user_count} users</span>
                        <span>{s.entitlement_count} entitlements</span>
                        <span>{s.application_count} apps</span>
                        {s.sod_violation_count > 0 && (
                          <span style={{ color: 'var(--danger)' }}>{s.sod_violation_count} SoD conflict(s)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="form-input-group">
                <label>Split Reason <span className="text-muted">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Why is this role being split?"
                  value={splitReason}
                  onChange={e => setSplitReason(e.target.value)}
                />
              </div>

              {splitPreviewError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
                  color: 'var(--danger)', fontSize: '12px'
                }}>
                  <AlertTriangle size={14} />
                  {splitPreviewError}
                </div>
              )}
            </div>

            <div className="modal-dialog-footer">
              <button type="button" className="btn-action-premium" onClick={handleCloseSplitModal} disabled={splitSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-action-premium primary"
                onClick={handleConfirmSplit}
                disabled={splitSubmitting || splitPreviewLoading || !splitPreviewData || splitPreviewData.splits.length < 2}
              >
                {splitSubmitting ? 'Splitting...' : 'Confirm Split'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Range Configurator Modal */}
      {showRangeModal && (
        <div className="modal-overlay-custom">
          <div className="modal-dialog-panel" style={{ maxWidth: '620px' }}>
            <div className="modal-dialog-header">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '16px', fontWeight: 700 }}>
                <SlidersHorizontal size={18} style={{ color: 'var(--primary, #2563eb)' }} />
                Confidence Score Range Configuration
              </h4>
              <button type="button" className="btn-drawer-close" onClick={() => setShowRangeModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-dialog-body">
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Define confidence score percentage thresholds to automatically classify candidate roles into access governance categories.
              </p>

              {/* Range Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '8px' }}>

                {/* Birthright Range Card */}
                <div style={{ padding: '14px', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', color: '#10b981' }}>
                      <BadgeCheck size={16} />
                      Birthright Role Range
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                      &ge; {birthrightMin}%
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                    Candidate roles with high similarity score (&ge; {birthrightMin}%) will be automatically classified as <b>Birthright</b>.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="1"
                      value={birthrightMin || 80}
                      onChange={e => setBirthrightMin(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#10b981' }}
                    />
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={birthrightMin}
                      onChange={e => {
                        const val = e.target.value;
                        setBirthrightMin(val === '' ? '' : parseFloat(val));
                      }}
                      onBlur={() => sanitizeRanges()}
                      style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 600 }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>%</span>
                  </div>
                </div>

                {/* Request-Based Range Card */}
                <div style={{ padding: '14px', border: '1px solid rgba(147, 51, 234, 0.3)', borderRadius: '8px', background: 'rgba(147, 51, 234, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', color: '#9333ea' }}>
                      <Shield size={16} />
                      Request-Based Role Range
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, background: '#9333ea', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                      {requestBasedMin}% to {((parseFloat(birthrightMin) || 80) - 0.1).toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                    Candidate roles with moderate similarity score ({requestBasedMin}% - {((parseFloat(birthrightMin) || 80) - 0.1).toFixed(1)}%) will be classified as <b>Request-Based</b>.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(10, (parseFloat(birthrightMin) || 80) - 1)}
                      step="1"
                      value={requestBasedMin || 50}
                      onChange={e => setRequestBasedMin(parseFloat(e.target.value))}
                      style={{ flex: 1, accentColor: '#9333ea' }}
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(10, (parseFloat(birthrightMin) || 80) - 1)}
                      value={requestBasedMin}
                      onChange={e => {
                        const val = e.target.value;
                        setRequestBasedMin(val === '' ? '' : parseFloat(val));
                      }}
                      onBlur={() => sanitizeRanges()}
                      style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 600 }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>%</span>
                  </div>
                </div>

                {/* Not Classified Card */}
                <div style={{ padding: '14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-muted, rgba(0,0,0,0.02))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '14px', color: 'var(--text-muted)' }}>
                      <XCircle size={16} />
                      Not Classified (Unassigned) Range
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, background: 'var(--text-muted)', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                      &lt; {requestBasedMin}%
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Candidate roles with similarity below {requestBasedMin}% remain <b>Not Classified</b> for manual review.
                  </p>
                </div>

              </div>

              {/* Overwrite Option */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <input
                  type="checkbox"
                  id="chk-overwrite-cls"
                  checked={overwriteExisting}
                  onChange={e => setOverwriteExisting(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="chk-overwrite-cls" style={{ fontSize: '12.5px', color: 'var(--text-main)', cursor: 'pointer', margin: 0 }}>
                  Re-evaluate and overwrite existing candidate role classifications during auto-classification
                </label>
              </div>

              {/* Feedback Banner */}
              {autoClassifyResult && (
                <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>{autoClassifyResult}</span>
                </div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="modal-dialog-footer">
              <button
                className="btn-action-premium"
                type="button"
                onClick={() => setShowRangeModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-action-premium"
                type="button"
                disabled={savingRanges || autoClassifying}
                onClick={handleSaveRangesOnly}
                style={{ background: 'var(--bg-card)', borderColor: 'var(--primary, #2563eb)', color: 'var(--primary, #2563eb)', fontWeight: 600 }}
              >
                {savingRanges ? "Saving..." : "Save Ranges Only"}
              </button>
              <button
                className="btn-action-premium primary"
                type="button"
                disabled={savingRanges || autoClassifying}
                onClick={handleRunAutoClassify}
              >
                {autoClassifying ? "Classifying & Publishing Roles..." : "Save, Classify & Auto-Publish Roles"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Approval Modal */}
      <SubmitApprovalModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        role={selectedRole}
        onSubmitSuccess={() => {
          fetchRolesData();
          fetchKPIStats();
          handleCloseDrawer();
        }}
      />
    </div>
  );
};

export default CandidateRoleWorkbench;


