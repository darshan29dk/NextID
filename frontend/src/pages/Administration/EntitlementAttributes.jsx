import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  Download,
  Upload,
  Edit,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Sliders,
  Database,
  Shield,
  Clock,
  ArrowUpDown,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Users,
  Copy,
  Info,
  Key,
  HelpCircle
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { useAuth } from '../../context/AuthContext';
import {
  getEntitlementAttributes,
  getEntitlementAttribute,
  createEntitlementAttribute,
  updateEntitlementAttribute,
  deleteEntitlementAttribute,
  restoreEntitlementAttribute,
  bulkUpdateEntitlementStatus,
  bulkDeleteEntitlements,
  importEntitlementAttributes,
  getAttributeCategories
} from '../../services/dashboardService';
import './EntitlementAttributes.css';

const DATA_TYPES = [
  "String", "Integer", "Boolean", "Date", "DateTime",
  "Email", "Phone", "Dropdown", "Multi Select", "Number", "Text Area"
];

const APPLICATION_NAMES = [
  "Generic", "Active Directory", "Entra ID", "Okta", "SAP", "Oracle",
  "Salesforce", "ServiceNow", "Jira", "Linux", "Unix",
  "SQL Server", "AWS", "Azure", "GCP"
];

const ENTITLEMENT_TYPES = [
  "Role", "Group", "Permission", "License", "Profile",
  "Responsibility", "Privilege", "Membership"
];

const STATUSES = ["Active", "Inactive", "Deprecated"];

const INITIAL_FORM_STATE = {
  attribute_name: '',
  display_name: '',
  description: '',
  category_id: '',
  application_name: 'Generic',
  entitlement_type: 'Role',
  data_type: 'String',
  attribute_type: 'Custom',
  is_required: false,
  is_unique: false,
  is_searchable: true,
  is_editable: true,
  default_value: '',
  validation_rule: '',
  display_order: 0,
  status: 'Active',
  is_system: false
};

const EntitlementAttributes = () => {
  const { currentUser } = useAuth();

  // State Management
  const [attributes, setAttributes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Pagination & Sorting
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('display_order');
  const [sortOrder, setSortOrder] = useState('asc');

  // Search & Filters
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [appNameFilter, setAppNameFilter] = useState('');
  const [entTypeFilter, setEntTypeFilter] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState('');
  const [requiredFilter, setRequiredFilter] = useState('');

  // Row Selection (Bulk Actions)
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals & Drawers
  const [showModal, setShowModal] = useState(false);
  const [editAttributeId, setEditAttributeId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [formBannerError, setFormBannerError] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAttr, setDeleteAttr] = useState(null);

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLogs, setImportLogs] = useState(null);

  const [drawerAttr, setDrawerAttr] = useState(null);
  const [drawerAudit, setDrawerAudit] = useState([]);
  const [drawerUsage, setDrawerUsage] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerActiveTab, setDrawerActiveTab] = useState('overview'); // 'overview', 'usage', 'history'

  const [kpiStats, setKpiStats] = useState({
    total: 0,
    system: 0,
    custom: 0,
    required: 0
  });

  // Handle click outside export dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      const data = await getAttributeCategories();
      setCategories(data || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  // Fetch Listing & KPIs
  const fetchAttributes = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const params = {
        page,
        limit,
        search: searchQuery || undefined,
        status: statusFilter || undefined,
        category_id: categoryFilter || undefined,
        application_name: appNameFilter || undefined,
        entitlement_type: entTypeFilter || undefined,
        data_type: dataTypeFilter || undefined,
        is_required: requiredFilter !== '' ? requiredFilter === 'true' : undefined,
        sortBy,
        sortOrder
      };

      const [listResult, statsResult] = await Promise.allSettled([
        getEntitlementAttributes(params),
        // Fetch global KPI stats
        getEntitlementAttributes({ page: 1, limit: 1000 })
      ]);

      if (listResult.status === 'rejected') {
        throw listResult.reason;
      }
      const response = listResult.value;
      setAttributes(response.attributes || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);

      // Reset selection when data changes
      setSelectedIds([]);

      if (statsResult.status === 'fulfilled') {
        const items = statsResult.value.attributes || [];
        setKpiStats({
          total: items.length,
          system: items.filter(a => a.is_system || a.attribute_type === 'System').length,
          custom: items.filter(a => !a.is_system && a.attribute_type !== 'System').length,
          required: items.filter(a => a.is_required).length
        });
      }

    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || 'Failed to fetch entitlement attributes. Please check database connection.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    searchQuery,
    statusFilter,
    categoryFilter,
    appNameFilter,
    entTypeFilter,
    dataTypeFilter,
    requiredFilter,
    sortBy,
    sortOrder
  ]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  // Search Submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('');
    setCategoryFilter('');
    setAppNameFilter('');
    setEntTypeFilter('');
    setDataTypeFilter('');
    setRequiredFilter('');
    setSortBy('display_order');
    setSortOrder('asc');
    setPage(1);
    setSelectedIds([]);
  };

  // Checkboxes
  const handleSelectRow = (e, id) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const ids = attributes.map(a => a.id);
      setSelectedIds(ids);
    } else {
      setSelectedIds([]);
    }
  };

  // Bulk Actions Handlers
  const handleBulkStatusChange = async (targetStatus) => {
    if (selectedIds.length === 0) return;
    try {
      setSubmitting(true);
      await bulkUpdateStatus(selectedIds, targetStatus);
      alert(`Updated status to '${targetStatus}' for ${selectedIds.length} custom attributes.`);
      setSelectedIds([]);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to bulk update status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (currentUser?.role !== 'Platform Administrator') {
      alert("Access Denied: Only Platform Administrators can perform bulk deletions.");
      return;
    }
    if (!window.confirm(`Are you sure you want to soft-delete the ${selectedIds.length} selected custom attributes?`)) {
      return;
    }
    try {
      setSubmitting(true);
      const resp = await bulkDeleteEntitlements(selectedIds);
      alert(resp.detail);
      setSelectedIds([]);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to perform bulk deletion.');
    } finally {
      setSubmitting(false);
    }
  };

  const bulkUpdateStatus = async (ids, status) => {
    return await bulkUpdateEntitlementStatus(ids, status);
  };

  // View detail drawer
  const handleOpenDrawer = async (attr) => {
    try {
      setDrawerLoading(true);
      setShowDrawer(true);
      setDrawerAttr(attr);
      setDrawerAudit([]);
      setDrawerUsage(null);
      setDrawerActiveTab('overview');

      const response = await getEntitlementAttribute(attr.id);
      setDrawerAttr(response.attribute);
      setDrawerAudit(response.audit_history || []);
      setDrawerUsage(response.usage || null);
    } catch (err) {
      console.error('Failed to load detail drawer:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Add/Edit modal Handlers
  const handleOpenAddModal = () => {
    setEditAttributeId(null);
    setFormBannerError(null);
    setFormErrors({});
    setFormData({
      ...INITIAL_FORM_STATE,
      display_order: attributes.length > 0 ? Math.max(...attributes.map(a => a.display_order)) + 1 : 1
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (e, attr) => {
    e.stopPropagation();
    setEditAttributeId(attr.id);
    setFormBannerError(null);
    setFormErrors({});
    setFormData({
      ...attr,
      category_id: attr.category_id || '',
      application_name: attr.application_name || 'Generic',
      entitlement_type: attr.entitlement_type || 'Role'
    });
    setShowModal(true);
  };

  const handleDuplicate = (attr) => {
    setEditAttributeId(null);
    setFormBannerError(null);
    setFormErrors({});
    setFormData({
      ...attr,
      attribute_name: `${attr.attribute_name}_copy`,
      display_name: `${attr.display_name} (Copy)`,
      attribute_type: 'Custom',
      is_system: false,
      is_editable: true,
      display_order: Number(attr.display_order) + 1
    });
    setShowModal(true);
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

  const validateForm = () => {
    const errors = {};
    if (!formData.attribute_name || !formData.attribute_name.trim()) {
      errors.attribute_name = "Attribute Name is required";
    } else if (!/^[a-z0-9_]+$/.test(formData.attribute_name)) {
      errors.attribute_name = "Name must contain only lowercase letters, numbers, and underscores (e.g. ent_role_name)";
    }

    if (!formData.display_name || !formData.display_name.trim()) {
      errors.display_name = "Display Name is required";
    }

    if (isNaN(formData.display_order) || formData.display_order === '' || Number(formData.display_order) < 0) {
      errors.display_order = "Display Order must be a positive number";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      setFormBannerError(null);

      const payload = {
        ...formData,
        category_id: formData.category_id ? Number(formData.category_id) : null,
        display_order: Number(formData.display_order)
      };

      if (editAttributeId) {
        await updateEntitlementAttribute(editAttributeId, payload);
      } else {
        await createEntitlementAttribute(payload);
      }

      setShowModal(false);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save entitlement attribute.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Handlers
  const handleOpenDeleteConfirm = (e, attr) => {
    e.stopPropagation();
    if (attr.is_system || attr.attribute_type === 'System') {
      alert("System attributes cannot be deleted.");
      return;
    }
    setDeleteAttr(attr);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteAttr) return;
    try {
      setSubmitting(true);
      await deleteEntitlementAttribute(deleteAttr.id);
      setShowDeleteConfirm(false);
      setDeleteAttr(null);
      if (showDrawer && drawerAttr?.id === deleteAttr.id) {
        setShowDrawer(false);
      }
      fetchAttributes();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to delete attribute.');
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Ingestion
  const handleDownloadTemplate = () => {
    const templateHeaders = ["Attribute Name", "Display Name", "Data Type", "Application", "Entitlement Type", "Description", "Display Order", "Required", "Unique", "Searchable", "Editable", "Status", "Default Value", "Validation Rule"];
    const sampleRow = ["ent_privilege_scope", "Privilege Scope Scope", "Dropdown", "Entra ID", "Privilege", "Ingestion scope of privilege assignment", "22", "FALSE", "FALSE", "TRUE", "TRUE", "Active", "Read", "^[a-zA-Z]+$"];
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [templateHeaders.join(","), sampleRow.join(",")].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rAnalyzer_entitlement_attributes_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      alert("Please select a CSV file first.");
      return;
    }

    try {
      setSubmitting(true);
      setImportLogs(null);
      const resp = await importEntitlementAttributes(importFile);
      setImportLogs(resp);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Import request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    const headers = ["Attribute Name", "Display Name", "Application", "Entitlement Type", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
      a.application_name || "Generic",
      a.entitlement_type || "Role",
      a.data_type,
      a.category?.category_name || "General",
      a.is_required ? "YES" : "NO",
      a.is_unique ? "YES" : "NO",
      a.is_searchable ? "YES" : "NO",
      a.is_editable ? "YES" : "NO",
      a.status,
      a.display_order,
      a.description || ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rAnalyzer_entitlement_attributes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportDropdown(false);
  };

  const handleExportExcel = () => {
    const headers = ["Attribute Name", "Display Name", "Application", "Entitlement Type", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
      a.application_name || "Generic",
      a.entitlement_type || "Role",
      a.data_type,
      a.category?.category_name || "General",
      a.is_required ? "YES" : "NO",
      a.is_unique ? "YES" : "NO",
      a.is_searchable ? "YES" : "NO",
      a.is_editable ? "YES" : "NO",
      a.status,
      a.display_order,
      a.description || ""
    ]);

    const excelContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
    const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rAnalyzer_entitlement_attributes_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportDropdown(false);
  };

  // Timeline Auditing Diff
  const renderAuditDiff = (log) => {
    try {
      if (!log.old_value && log.new_value) {
        const val = JSON.parse(log.new_value);
        return <div className="audit-change-desc">Attribute initialized — Display: <b>{val.display_name}</b>, Type: <b>{val.data_type}</b></div>;
      }
      if (log.old_value && !log.new_value) {
        return <div className="audit-change-desc danger">Attribute deleted</div>;
      }
      if (log.old_value && log.new_value) {
        const oldVal = JSON.parse(log.old_value);
        const newVal = JSON.parse(log.new_value);
        const diffs = [];
        Object.keys(newVal).forEach((k) => {
          if (oldVal[k] !== newVal[k]) {
            diffs.push(
              <span key={k} className="diff-item">
                {k.replace(/_/g, ' ')}: <del>{String(oldVal[k])}</del> → <ins>{String(newVal[k])}</ins>
              </span>
            );
          }
        });
        return <div className="audit-change-desc">{diffs.length > 0 ? diffs : "Modified mapping settings"}</div>;
      }
    } catch {
      return <div className="audit-change-desc">Modified settings</div>;
    }
  };

  // Sorting
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // KPI card clicks
  const handleKpiClick = (type) => {
    handleResetFilters();
    if (type === 'required') setRequiredFilter('true');
    else if (type === 'system') setAppNameFilter('Generic'); // default seeded application name
  };

  return (
    <div className="entitlement-attributes-page">
      <Breadcrumb items={[
        { label: 'Data Foundation', active: false },
        { label: 'Entitlement Attributes', active: true }
      ]} />

      {/* Page Header */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Entitlement Attributes</h2>
          <p>Define metadata structure, validation, and usage tracking for target application privileges.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-import-attributes" onClick={() => { setShowImportModal(true); setImportLogs(null); setImportFile(null); }}>
            <Upload size={14} />
            <span>Import</span>
          </button>
          
          <div className="btn-export-dropdown-wrapper" ref={exportDropdownRef}>
            <button className="btn-export-select" onClick={() => setShowExportDropdown(!showExportDropdown)}>
              <Download size={14} />
              <span>Export</span>
            </button>
            {showExportDropdown && (
              <div className="export-menu-dropdown">
                <button className="export-menu-item" onClick={handleExportCSV}>
                  <FileSpreadsheet size={13} /> Export CSV
                </button>
                <button className="export-menu-item" onClick={handleExportExcel}>
                  <FileSpreadsheet size={13} /> Export Excel
                </button>
              </div>
            )}
          </div>
          
          <button className="btn-add-attribute" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add Attribute</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="attributes-kpi-grid">
        <DashboardCard title="Total Attributes" value={kpiStats.total} icon={Key} color="blue" loading={loading} onClick={() => handleKpiClick('total')} />
        <DashboardCard title="System Attributes" value={kpiStats.system} icon={Shield} color="purple" loading={loading} onClick={() => handleKpiClick('system')} />
        <DashboardCard title="Custom Attributes" value={kpiStats.custom} icon={Database} color="teal" loading={loading} />
        <DashboardCard title="Required Attributes" value={kpiStats.required} icon={Sliders} color="green" loading={loading} onClick={() => handleKpiClick('required')} />
      </div>

      {/* Bulk Actions overlay toolbar */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions-floating-bar animate-pop">
          <span className="selected-row-lbl">
            <b>{selectedIds.length}</b> schemas selected
          </span>
          <div className="bulk-action-btns-row">
            <button className="btn-bulk-act action" onClick={() => handleBulkStatusChange('Active')}>Activate</button>
            <button className="btn-bulk-act action warning" onClick={() => handleBulkStatusChange('Inactive')}>Deactivate</button>
            {currentUser?.role === 'Platform Administrator' && (
              <button className="btn-bulk-act action danger" onClick={handleBulkDelete}>Delete</button>
            )}
            <button className="btn-bulk-act cancel" onClick={() => setSelectedIds([])} title="Cancel Selection">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="attributes-toolbar-wrapper">
        <form className="search-form-section" onSubmit={handleSearchSubmit}>
          <div className="search-input-field">
            <Search className="search-bar-icon" size={15} />
            <input
              type="text"
              placeholder="Search by name, display name, or description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button type="button" className="btn-search-clear" onClick={handleClearSearch}>
                <X size={13} />
              </button>
            )}
          </div>
        </form>

        <div className="filters-dropdowns-row">
          {/* Category */}
          <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
          </select>

          {/* Application */}
          <select value={appNameFilter} onChange={e => { setAppNameFilter(e.target.value); setPage(1); }}>
            <option value="">All Target Systems</option>
            {APPLICATION_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Entitlement Type */}
          <select value={entTypeFilter} onChange={e => { setEntTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Entitlement Types</option>
            {ENTITLEMENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* Data Type */}
          <select value={dataTypeFilter} onChange={e => { setDataTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Data Types</option>
            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Required */}
          <select value={requiredFilter} onChange={e => { setRequiredFilter(e.target.value); setPage(1); }}>
            <option value="">Required: All</option>
            <option value="true">Required Only</option>
            <option value="false">Optional Only</option>
          </select>

          <button className="btn-reset-filters" onClick={handleResetFilters} title="Reset all filters">
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div className="attributes-table-container">
        <div className="attributes-table-header entitlement-columns">
          <div style={{ width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>#</div>
          <div className="checkbox-cell">
            <input
              type="checkbox"
              checked={attributes.length > 0 && selectedIds.length === attributes.length}
              onChange={handleSelectAll}
            />
          </div>
          <div onClick={() => handleSort('attribute_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Attribute Name <ArrowUpDown size={11} />
          </div>
          <div>Display Name</div>
          <div>Application</div>
          <div>Entitlement Type</div>
          <div>Data Type</div>
          <div>Category</div>
          <div>Flags</div>
          <div onClick={() => handleSort('status')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Status <ArrowUpDown size={11} />
          </div>
          <div onClick={() => handleSort('display_order')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', justifySelf: 'center' }}>
            Order <ArrowUpDown size={11} />
          </div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {errorMsg && <div className="error-banner" style={{ margin: '16px 0' }}>{errorMsg}</div>}

        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading entitlement attributes schema...</p>
          </div>
        ) : attributes.length === 0 ? (
          <div className="table-empty-container">
            <div className="empty-state-icon">
              <Key size={24} />
            </div>
            <h4>No Entitlement Attributes Found</h4>
            <p>Click 'Add Attribute' or 'Import' to establish mapping schema.</p>
          </div>
        ) : (
          <div className="attributes-table-body">
            {attributes.map((attr, idx) => (
              <div
                key={attr.id}
                className="attributes-table-row entitlement-columns"
                onClick={() => handleOpenDrawer(attr)}
                title="Click to view details and usage mappings"
              >
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(page - 1) * limit + idx + 1}
                </div>
                {/* Checkbox */}
                <div className="checkbox-cell" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(attr.id)}
                    onChange={(e) => handleSelectRow(e, attr.id)}
                  />
                </div>

                {/* Name */}
                <div className="attr-name-cell">
                  <span className="attr-name-lbl">{attr.attribute_name}</span>
                  <span className={`attr-type-tag ${attr.attribute_type.toLowerCase()}`}>{attr.attribute_type}</span>
                </div>

                {/* Display Name */}
                <div className="attr-display-lbl">{attr.display_name}</div>

                {/* Application */}
                <div className="text-highlight">{attr.application_name || "Generic"}</div>

                {/* Entitlement Type */}
                <div>
                  <span className="attr-ent-badge">{attr.entitlement_type || "Role"}</span>
                </div>

                {/* Data Type */}
                <div>
                  <span className="attr-datatype-badge">{attr.data_type}</span>
                </div>

                {/* Category */}
                <div>{attr.category?.category_name || "General"}</div>

                {/* Flags */}
                <div className="attr-flags-list">
                  {attr.is_required && <span className="flag-badge req" title="Required">REQ</span>}
                  {attr.is_unique && <span className="flag-badge uniq" title="Unique">UNIQ</span>}
                  {attr.is_searchable && <span className="flag-badge search" title="Searchable">SRCH</span>}
                  {(!attr.is_editable || attr.is_system) && <span className="flag-badge locked" title="System Locked">LOCK</span>}
                </div>

                {/* Status */}
                <div>
                  <span className={`status-badge ${attr.status.toLowerCase()}`}>{attr.status}</span>
                </div>

                {/* Display Order */}
                <div style={{ justifySelf: 'center', fontWeight: '600' }}>{attr.display_order}</div>

                {/* Actions */}
                <div className="row-actions-col" onClick={e => e.stopPropagation()}>
                  <button className="btn-row-action" onClick={(e) => handleOpenEditModal(e, attr)} title="Edit">
                    <Edit size={13} />
                  </button>
                  <button className="btn-row-action" onClick={() => handleDuplicate(attr)} title="Duplicate">
                    <Copy size={13} />
                  </button>
                  {currentUser?.role === 'Platform Administrator' && !attr.is_system && attr.attribute_type !== 'System' && (
                    <button className="btn-row-action delete" onClick={(e) => handleOpenDeleteConfirm(e, attr)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && total > 0 && (
          <div className="table-pagination-bar">
            <span className="pagination-count">
              Showing <b>{total === 0 ? 0 : (page - 1) * limit + 1}</b> to <b>{Math.min(page * limit, total)}</b> of <b>{total}</b> entitlement attributes
            </span>
            <div className="pagination-buttons">
              <button className="btn-page-arrow" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span className="pagination-active-lbl">Page {page} of {totalPages}</span>
              <button className="btn-page-arrow" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Attribute Modal */}
      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>{editAttributeId ? 'Edit Entitlement Schema' : 'Add Entitlement Attribute'}</h3>
              <button className="modal-close-x" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-body-custom">
                {formBannerError && <div className="modal-error-banner">{formBannerError}</div>}
                
                <div className="form-grid-2col">
                  {/* Name */}
                  <div className="form-group-custom">
                    <label htmlFor="attribute_name">Attribute Name *</label>
                    <input
                      type="text"
                      id="attribute_name"
                      name="attribute_name"
                      value={formData.attribute_name}
                      onChange={handleInputChange}
                      placeholder="e.g. ent_privilege_scope"
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      className={formErrors.attribute_name ? 'input-error' : ''}
                    />
                    {formErrors.attribute_name ? (
                      <span className="error-text">{formErrors.attribute_name}</span>
                    ) : (
                      <span className="input-hint">lowercase letters, numbers and underscores only.</span>
                    )}
                  </div>

                  {/* Display Name */}
                  <div className="form-group-custom">
                    <label htmlFor="display_name">Display Name *</label>
                    <input
                      type="text"
                      id="display_name"
                      name="display_name"
                      value={formData.display_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Privilege Scope"
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      className={formErrors.display_name ? 'input-error' : ''}
                    />
                    {formErrors.display_name && <span className="error-text">{formErrors.display_name}</span>}
                  </div>
                </div>

                <div className="form-grid-2col">
                  {/* Category */}
                  <div className="form-group-custom">
                    <label htmlFor="category_id">Category</label>
                    <select
                      id="category_id"
                      name="category_id"
                      value={formData.category_id}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      <option value="">General</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                    </select>
                  </div>

                  {/* Data Type */}
                  <div className="form-group-custom">
                    <label htmlFor="data_type">Data Type *</label>
                    <select
                      id="data_type"
                      name="data_type"
                      value={formData.data_type}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2col">
                  {/* Target Application */}
                  <div className="form-group-custom">
                    <label htmlFor="application_name">Application</label>
                    <select
                      id="application_name"
                      name="application_name"
                      value={formData.application_name}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      {APPLICATION_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>

                  {/* Entitlement Type */}
                  <div className="form-group-custom">
                    <label htmlFor="entitlement_type">Entitlement Type</label>
                    <select
                      id="entitlement_type"
                      name="entitlement_type"
                      value={formData.entitlement_type}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      {ENTITLEMENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="form-group-custom">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={formData.description || ''}
                    onChange={handleInputChange}
                    placeholder="Enter context/purpose..."
                  />
                </div>

                <div className="form-grid-2col">
                  {/* Default Value */}
                  <div className="form-group-custom">
                    <label htmlFor="default_value">Default Value</label>
                    <input
                      type="text"
                      id="default_value"
                      name="default_value"
                      value={formData.default_value || ''}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      placeholder="Optional default pre-fill..."
                    />
                  </div>

                  {/* Validation Regex */}
                  <div className="form-group-custom">
                    <label htmlFor="validation_rule">Validation Rule (Regex)</label>
                    <input
                      type="text"
                      id="validation_rule"
                      name="validation_rule"
                      value={formData.validation_rule || ''}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      placeholder="e.g. ^[a-zA-Z0-9]+$"
                    />
                  </div>
                </div>

                {/* Flags Checkboxes */}
                <div className="modal-flags-checkboxes-row">
                  <label className="checkbox-custom-label">
                    <input
                      type="checkbox"
                      name="is_required"
                      checked={formData.is_required}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      onChange={handleInputChange}
                    />
                    <span>Required</span>
                  </label>

                  <label className="checkbox-custom-label">
                    <input
                      type="checkbox"
                      name="is_unique"
                      checked={formData.is_unique}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      onChange={handleInputChange}
                    />
                    <span>Unique</span>
                  </label>

                  <label className="checkbox-custom-label">
                    <input
                      type="checkbox"
                      name="is_searchable"
                      checked={formData.is_searchable}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      onChange={handleInputChange}
                    />
                    <span>Searchable</span>
                  </label>

                  <label className="checkbox-custom-label">
                    <input
                      type="checkbox"
                      name="is_editable"
                      checked={formData.is_editable}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      onChange={handleInputChange}
                    />
                    <span>Editable</span>
                  </label>
                </div>

                <div className="form-grid-2col" style={{ marginTop: '12px' }}>
                  {/* Display Order */}
                  <div className="form-group-custom">
                    <label htmlFor="display_order">Display Order *</label>
                    <input
                      type="number"
                      id="display_order"
                      name="display_order"
                      value={formData.display_order}
                      onChange={handleInputChange}
                      className={formErrors.display_order ? 'input-error' : ''}
                    />
                    {formErrors.display_order && <span className="error-text">{formErrors.display_order}</span>}
                  </div>

                  {/* Status */}
                  <div className="form-group-custom">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-modal-save" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Ingestion Import Modal */}
      {showImportModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>Import Entitlement Attributes</h3>
              <button className="modal-close-x" onClick={() => setShowImportModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleImportSubmit}>
              <div className="modal-body-custom">
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Ingest schema settings from a formatted CSV. Download the template structure for reference.
                </p>
                <button type="button" className="btn-download-template" onClick={handleDownloadTemplate}>
                  <Download size={13} />
                  <span>Download CSV Template</span>
                </button>

                <div className="file-drop-area">
                  <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={(e) => setImportFile(e.target.files[0])}
                    id="import-csv-uploader"
                  />
                  <label htmlFor="import-csv-uploader" className="drop-lbl">
                    <Upload size={20} />
                    <span>{importFile ? importFile.name : 'Click to select CSV File'}</span>
                  </label>
                </div>

                {importLogs && (
                  <div className="import-logs-console animate-fade">
                    <h5>Ingestion Summary:</h5>
                    <div className="logs-summary-row">
                      <span className="log-success-count">Imported: <b>{importLogs.imported_count}</b></span>
                      <span className="log-skipped-count">Skipped: <b>{importLogs.skipped_count}</b></span>
                    </div>
                    {importLogs.errors && importLogs.errors.length > 0 && (
                      <div className="logs-errors-box">
                        {importLogs.errors.map((err, idx) => (
                          <div key={idx} className="err-log-line">
                            <AlertTriangle size={11} /> {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowImportModal(false)}>Close</button>
                <button type="submit" className="btn-modal-save" disabled={submitting || !importFile}>
                  {submitting ? 'Uploading...' : 'Process Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-confirm">
            <div className="modal-header-custom danger-header">
              <AlertTriangle className="header-alert-icon" size={20} />
              <h3>Confirm Attribute Deletion</h3>
            </div>
            <div className="modal-body-custom delete-text">
              <p>Are you sure you want to delete the attribute <b>{deleteAttr?.display_name}</b> (<code>{deleteAttr?.attribute_name}</code>)?</p>
              <p className="sub-warning-text">This will soft-delete the schema config mapping. Historical audit logs will remain intact.</p>
            </div>
            <div className="modal-footer-custom">
              <button type="button" className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button type="button" className="btn-modal-delete-confirm" disabled={submitting} onClick={handleDeleteSubmit}>
                {submitting ? 'Deleting...' : 'Delete Attribute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Details Sliding Drawer */}
      {showDrawer && drawerAttr && (
        <div className="sliding-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="sliding-drawer-content" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-box">
                <h3>{drawerAttr.display_name}</h3>
                <code className="drawer-name-code">{drawerAttr.attribute_name}</code>
              </div>
              <button className="btn-drawer-close" onClick={() => setShowDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Drawer Tabs */}
            <div className="drawer-tabs-row">
              <button className={`drawer-tab-btn ${drawerActiveTab === 'overview' ? 'active' : ''}`} onClick={() => setDrawerActiveTab('overview')}>Overview</button>
              <button className={`drawer-tab-btn ${drawerActiveTab === 'usage' ? 'active' : ''}`} onClick={() => setDrawerActiveTab('usage')}>Usage</button>
              <button className={`drawer-tab-btn ${drawerActiveTab === 'history' ? 'active' : ''}`} onClick={() => setDrawerActiveTab('history')}>History</button>
            </div>

            {drawerLoading ? (
              <div className="drawer-loading-box">
                <div className="spinner-element"></div>
                <p>Loading metadata...</p>
              </div>
            ) : (
              <div className="drawer-body">
                {/* 1. OVERVIEW TAB */}
                {drawerActiveTab === 'overview' && (
                  <div className="drawer-tab-content animate-fade">
                    <div className="drawer-section">
                      <h4>General Details</h4>
                      <p className="drawer-desc-txt">{drawerAttr.description || "No description provided for this entitlement attribute."}</p>
                      
                      <div className="drawer-flags-container">
                        <span className={`flag-status-pill ${drawerAttr.is_required ? 'active' : ''}`}>Required: {drawerAttr.is_required ? "YES" : "NO"}</span>
                        <span className={`flag-status-pill ${drawerAttr.is_unique ? 'active' : ''}`}>Unique: {drawerAttr.is_unique ? "YES" : "NO"}</span>
                        <span className={`flag-status-pill ${drawerAttr.is_searchable ? 'active' : ''}`}>Searchable: {drawerAttr.is_searchable ? "YES" : "NO"}</span>
                        <span className={`flag-status-pill ${drawerAttr.is_editable ? 'active' : ''}`}>Editable: {drawerAttr.is_editable ? "YES" : "NO"}</span>
                      </div>
                    </div>

                    <div className="drawer-section">
                      <h4>Technical Specification</h4>
                      <div className="properties-list-grid">
                        <div className="prop-row">
                          <span className="prop-lbl">Target System</span>
                          <span className="prop-val text-highlight">{drawerAttr.application_name || "Generic"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Entitlement Type</span>
                          <span className="prop-val">{drawerAttr.entitlement_type || "Role"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Category</span>
                          <span className="prop-val">{drawerAttr.category?.category_name || "General"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Data Type</span>
                          <span className="prop-val code">{drawerAttr.data_type}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Validation Pattern</span>
                          <span className="prop-val code">{drawerAttr.validation_rule || "None"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Default Value</span>
                          <span className="prop-val">{drawerAttr.default_value || "None"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="drawer-section">
                      <h4>Creation Metadata</h4>
                      <div className="properties-list-grid">
                        <div className="prop-row">
                          <span className="prop-lbl">Created By</span>
                          <span className="prop-val">{drawerAttr.created_by || "System"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Created Date</span>
                          <span className="prop-val">{new Date(drawerAttr.created_at).toLocaleString()}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Last Modified By</span>
                          <span className="prop-val">{drawerAttr.modified_by || "System"}</span>
                        </div>
                        <div className="prop-row">
                          <span className="prop-lbl">Last Modified Date</span>
                          <span className="prop-val">{new Date(drawerAttr.updated_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. USAGE TAB */}
                {drawerActiveTab === 'usage' && (
                  <div className="drawer-tab-content animate-fade">
                    <div className="drawer-section">
                      <h4>Schema References & Mappings</h4>
                      <p className="drawer-desc-txt">
                        Usage counts representing active integrations referencing the <code>{drawerAttr.attribute_name}</code> attribute.
                      </p>
                      
                      {drawerUsage ? (
                        <div className="usage-stats-grid">
                          <div className="usage-card">
                            <span className="usage-num">{drawerUsage.roles_count}</span>
                            <span className="usage-lbl">Linked Roles</span>
                          </div>
                          <div className="usage-card">
                            <span className="usage-num">{drawerUsage.systems_count}</span>
                            <span className="usage-lbl">Target Apps</span>
                          </div>
                          <div className="usage-card">
                            <span className="usage-num">{drawerUsage.policies_count}</span>
                            <span className="usage-lbl">Active Policies</span>
                          </div>
                          <div className="usage-card">
                            <span className="usage-num">{drawerUsage.active_mappings_count}</span>
                            <span className="usage-lbl">Account Mappings</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted">No usage statistics available for this attribute.</p>
                      )}
                    </div>

                    <div className="drawer-section" style={{ marginTop: '16px' }}>
                      <h4>Usage Guidelines</h4>
                      <div className="info-notes-block">
                        <Info size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                        <p style={{ fontSize: '12px', margin: 0 }}>
                          Changes to custom attribute definitions will propagate across all linked target systems and active mapping definitions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. HISTORY TAB */}
                {drawerActiveTab === 'history' && (
                  <div className="drawer-tab-content animate-fade">
                    <div className="drawer-section">
                      <h4>Revision Logs</h4>
                      {drawerAudit.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '12px' }}>No audit history records available.</p>
                      ) : (
                        <div className="drawer-timeline-container">
                          {drawerAudit.map((log) => (
                            <div key={log.id} className="timeline-log-item">
                              <span className="log-action-bullet"></span>
                              <div className="log-info-content">
                                <div className="log-header-info">
                                  <span className="log-performer">{log.performed_by}</span>
                                  <span className="log-time">{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                                {renderAuditDiff(log)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EntitlementAttributes;
