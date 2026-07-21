import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  Download,
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
  Monitor
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { useAuth } from '../../context/AuthContext';
import {
  getAccountAttributes,
  getAccountAttribute,
  createAccountAttribute,
  updateAccountAttribute,
  deleteAccountAttribute,
  restoreAccountAttribute,
  getAttributeCategories
} from '../../services/dashboardService';
import './AccountAttributes.css';

const DATA_TYPES = [
  "String", "Integer", "Boolean", "Date", "DateTime",
  "Email", "Phone", "Dropdown", "Multi Select", "Number", "Text Area"
];

const APPLICATION_TYPES = [
  "Active Directory", "Entra ID", "Okta", "SAP", "Oracle",
  "Salesforce", "ServiceNow", "Jira", "Linux", "Unix",
  "SQL Server", "AWS", "Azure", "GCP"
];

const STATUSES = ["Active", "Inactive", "Deprecated"];

const INITIAL_FORM_STATE = {
  attribute_name: '',
  display_name: '',
  description: '',
  category_id: '',
  application_type: 'Active Directory',
  data_type: 'String',
  attribute_type: 'Custom',
  is_required: false,
  is_unique: false,
  is_searchable: false,
  is_editable: true,
  default_value: '',
  validation_rule: '',
  display_order: 0,
  status: 'Active',
  is_system: false
};

const AccountAttributes = () => {
  const { currentUser } = useAuth();

  // Main state lists
  const [attributes, setAttributes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Pagination & Sorting state
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('display_order');
  const [sortOrder, setSortOrder] = useState('asc');

  // Search & Filter state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [applicationTypeFilter, setApplicationTypeFilter] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState('');
  const [requiredFilter, setRequiredFilter] = useState('');
  const [searchableFilter, setSearchableFilter] = useState('');
  const [editableFilter, setEditableFilter] = useState('');

  // UI state overlays
  const [showModal, setShowModal] = useState(false);
  const [editAttributeId, setEditAttributeId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [formBannerError, setFormBannerError] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAttr, setDeleteAttr] = useState(null);

  const [showImportComingSoon, setShowImportComingSoon] = useState(false);

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  // Detail Drawer state
  const [drawerAttr, setDrawerAttr] = useState(null);
  const [drawerAudit, setDrawerAudit] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  // KPI calculations state
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

  // Fetch Attributes and KPIs
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
        application_type: applicationTypeFilter || undefined,
        data_type: dataTypeFilter || undefined,
        is_required: requiredFilter !== '' ? requiredFilter === 'true' : undefined,
        is_searchable: searchableFilter !== '' ? searchableFilter === 'true' : undefined,
        is_editable: editableFilter !== '' ? editableFilter === 'true' : undefined,
        sortBy,
        sortOrder
      };

      const [listResult, fullResult] = await Promise.allSettled([
        getAccountAttributes(params),
        // Fetch full list once to calculate global stats/KPIs
        getAccountAttributes({ page: 1, limit: 1000 })
      ]);

      if (listResult.status === 'rejected') {
        throw listResult.reason;
      }
      const response = listResult.value;
      setAttributes(response.attributes || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);

      if (fullResult.status === 'fulfilled') {
        const kpis = fullResult.value.attributes || [];
        setKpiStats({
          total: kpis.length,
          system: kpis.filter(a => a.is_system || a.attribute_type === 'System').length,
          custom: kpis.filter(a => !a.is_system && a.attribute_type !== 'System').length,
          required: kpis.filter(a => a.is_required).length
        });
      }

    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || 'Failed to fetch account attributes. Please check connections.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    searchQuery,
    statusFilter,
    categoryFilter,
    applicationTypeFilter,
    dataTypeFilter,
    requiredFilter,
    searchableFilter,
    editableFilter,
    sortBy,
    sortOrder
  ]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  // Search logic
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

  // Reset Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('');
    setCategoryFilter('');
    setApplicationTypeFilter('');
    setDataTypeFilter('');
    setRequiredFilter('');
    setSearchableFilter('');
    setEditableFilter('');
    setSortBy('display_order');
    setSortOrder('asc');
    setPage(1);
  };

  // Details drawer handler
  const handleOpenDrawer = async (attr) => {
    try {
      setDrawerLoading(true);
      setShowDrawer(true);
      setDrawerAttr(attr);
      setDrawerAudit([]);
      
      const response = await getAccountAttribute(attr.id);
      setDrawerAttr(response.attribute);
      setDrawerAudit(response.audit_history || []);
    } catch (err) {
      console.error('Failed to load attribute details:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Duplicate attribute handler
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

  // Open modal handlers
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
      application_type: attr.application_type || ''
    });
    setShowModal(true);
  };

  // Input changes
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

  // Client validations
  const validateForm = () => {
    const errors = {};
    if (!formData.attribute_name || !formData.attribute_name.trim()) {
      errors.attribute_name = "Attribute Name is required";
    } else if (!/^[a-z0-9_]+$/.test(formData.attribute_name)) {
      errors.attribute_name = "Name must contain only lowercase letters, numbers, and underscores (e.g. ad_username)";
    }

    if (!formData.display_name || !formData.display_name.trim()) {
      errors.display_name = "Display Name is required";
    }

    if (isNaN(formData.display_order) || formData.display_order === '') {
      errors.display_order = "Display Order must be numeric";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Add/Edit
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
        await updateAccountAttribute(editAttributeId, payload);
      } else {
        await createAccountAttribute(payload);
      }

      setShowModal(false);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save account attribute. Please check fields.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete handlers
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
      await deleteAccountAttribute(deleteAttr.id);
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

  // CSV Export
  const handleExportCSV = () => {
    const headers = ["Attribute Name", "Display Name", "Application Type", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
      a.application_type || "None",
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
    link.setAttribute("download", `rAnalyzer_account_attributes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportDropdown(false);
  };

  // Excel Export
  const handleExportExcel = () => {
    const headers = ["Attribute Name", "Display Name", "Application Type", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
      a.application_type || "None",
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
    link.setAttribute("download", `rAnalyzer_account_attributes_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportDropdown(false);
  };

  // Render Audit diff for Drawer
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
        return <div className="audit-change-desc">{diffs.length > 0 ? diffs : "Updated properties"}</div>;
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

  // KPIs Clicks
  const handleKpiClick = (type) => {
    handleResetFilters();
    if (type === 'required') setRequiredFilter('true');
    else if (type === 'system') setEditableFilter('false'); // Seeded system ones are locked
  };

  return (
    <div className="account-attributes-page">
      <Breadcrumb items={[
        { label: 'Data Foundation', active: false },
        { label: 'Account Attributes', active: true }
      ]} />

      {/* Page Header */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Account Attributes</h2>
          <p>Configure account schema definitions across application targets. Click any row to view audit logs.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-import-attributes" onClick={() => setShowImportComingSoon(true)}>
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
        <DashboardCard title="Total Attributes" value={kpiStats.total} icon={Database} color="blue" loading={loading} onClick={() => handleKpiClick('total')} />
        <DashboardCard title="System Attributes" value={kpiStats.system} icon={Shield} color="purple" loading={loading} onClick={() => handleKpiClick('system')} />
        <DashboardCard title="Custom Attributes" value={kpiStats.custom} icon={Monitor} color="teal" loading={loading} onClick={() => handleKpiClick('custom')} />
        <DashboardCard title="Required Attributes" value={kpiStats.required} icon={Sliders} color="green" loading={loading} onClick={() => handleKpiClick('required')} />
      </div>

      {/* Filters Toolbar */}
      <div className="attributes-toolbar-wrapper">
        <form className="search-form-section" onSubmit={handleSearchSubmit}>
          <div className="search-input-field">
            <Search className="search-bar-icon" size={15} />
            <input
              type="text"
              placeholder="Search by name, display, or description..."
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

          {/* Application Type */}
          <select value={applicationTypeFilter} onChange={e => { setApplicationTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Target Systems</option>
            {APPLICATION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
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

          {/* Searchable */}
          <select value={searchableFilter} onChange={e => { setSearchableFilter(e.target.value); setPage(1); }}>
            <option value="">Searchable: All</option>
            <option value="true">Searchable Only</option>
            <option value="false">Non-Searchable</option>
          </select>

          <button className="btn-reset-filters" onClick={handleResetFilters} title="Reset all filters">
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="attributes-table-container">
        <div className="attributes-table-header">
          <div onClick={() => handleSort('attribute_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Attribute Name <ArrowUpDown size={11} />
          </div>
          <div>Display Name</div>
          <div>Application Type</div>
          <div>Category</div>
          <div>Data Type</div>
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
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading attributes schema...</p>
          </div>
        ) : attributes.length === 0 ? (
          <div className="table-empty-container">
            <div className="empty-state-icon">
              <Database size={24} />
            </div>
            <h4>No Account Attributes Found</h4>
            <p>Click 'Add Attribute' to create custom attribute mappings.</p>
          </div>
        ) : (
          <div className="attributes-table-body">
            {attributes.map(attr => (
              <div
                key={attr.id}
                className="attributes-table-row"
                onClick={() => handleOpenDrawer(attr)}
                title="Click to view change log and metadata"
              >
                {/* Name */}
                <div className="attr-name-cell">
                  <span className="attr-name-lbl">{attr.attribute_name}</span>
                  <span className={`attr-type-tag ${attr.attribute_type.toLowerCase()}`}>{attr.attribute_type}</span>
                </div>

                {/* Display Name */}
                <div className="attr-display-lbl">{attr.display_name}</div>

                {/* Application Type */}
                <div className="text-highlight">{attr.application_type || "Generic"}</div>

                {/* Category */}
                <div>{attr.category?.category_name || "General"}</div>

                {/* Data Type */}
                <div>
                  <span className="attr-datatype-badge">{attr.data_type}</span>
                </div>

                {/* Flags list */}
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

        {/* Table Pagination */}
        {!loading && total > 0 && (
          <div className="table-pagination-bar">
            <span className="pagination-count">
              Showing <b>{(page - 1) * limit + 1}</b> to <b>{Math.min(page * limit, total)}</b> of <b>{total}</b> schemas
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
              <h3>{editAttributeId ? 'Edit Attribute Schema' : 'Add Account Attribute'}</h3>
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
                      placeholder="e.g. ad_username"
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      className={formErrors.attribute_name ? 'input-error' : ''}
                    />
                    {formErrors.attribute_name ? (
                      <span className="error-text">{formErrors.attribute_name}</span>
                    ) : (
                      <span className="input-hint">System identifier (lowercase, numbers and underscores only).</span>
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
                      placeholder="e.g. Active Directory Username"
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      className={formErrors.display_name ? 'input-error' : ''}
                    />
                    {formErrors.display_name && <span className="error-text">{formErrors.display_name}</span>}
                  </div>
                </div>

                <div className="form-grid-3col">
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

                  {/* Application Type */}
                  <div className="form-group-custom">
                    <label htmlFor="application_type">Application Type</label>
                    <select
                      id="application_type"
                      name="application_type"
                      value={formData.application_type}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                    >
                      <option value="">Generic</option>
                      {APPLICATION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
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

                {/* Description */}
                <div className="form-group-custom">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    value={formData.description || ''}
                    onChange={handleInputChange}
                    placeholder="Enter purpose of this attribute mapping..."
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

                  {/* Validation Rule (Regex) */}
                  <div className="form-group-custom">
                    <label htmlFor="validation_rule">Validation Rule (Regex)</label>
                    <input
                      type="text"
                      id="validation_rule"
                      name="validation_rule"
                      value={formData.validation_rule || ''}
                      onChange={handleInputChange}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      placeholder="e.g. ^CC-\d{3}$"
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
                    <span>Required Field</span>
                  </label>

                  <label className="checkbox-custom-label">
                    <input
                      type="checkbox"
                      name="is_unique"
                      checked={formData.is_unique}
                      disabled={editAttributeId && (formData.is_system || formData.attribute_type === 'System')}
                      onChange={handleInputChange}
                    />
                    <span>Unique Constraint</span>
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
                {submitting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Coming Soon Dialog */}
      {showImportComingSoon && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom info-box">
            <div className="modal-header-custom info-header">
              <Info className="header-alert-icon" size={20} />
              <h3>Import Accounts Schema</h3>
            </div>
            <div className="modal-body-custom text-info-block">
              <p>Account schema ingestion capabilities are coming soon in the next platform release.</p>
              <p className="sub-warning-text">You will be able to parse AD, Entra ID, or Okta schema dumps directly via JSON/CSV templates.</p>
            </div>
            <div className="modal-footer-custom">
              <button type="button" className="btn-modal-save" onClick={() => setShowImportComingSoon(false)}>Okay</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Sliding Drawer */}
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

            {drawerLoading ? (
              <div className="drawer-loading-box">
                <div className="spinner-element"></div>
                <p>Loading audit trail...</p>
              </div>
            ) : (
              <div className="drawer-body">
                {/* General Info */}
                <div className="drawer-section">
                  <h4>General Information</h4>
                  <p className="drawer-desc-txt">{drawerAttr.description || "No description provided for this attribute."}</p>
                  
                  <div className="drawer-flags-container">
                    <span className={`flag-status-pill ${drawerAttr.is_required ? 'active' : ''}`}>
                      Required: {drawerAttr.is_required ? "YES" : "NO"}
                    </span>
                    <span className={`flag-status-pill ${drawerAttr.is_unique ? 'active' : ''}`}>
                      Unique: {drawerAttr.is_unique ? "YES" : "NO"}
                    </span>
                    <span className={`flag-status-pill ${drawerAttr.is_searchable ? 'active' : ''}`}>
                      Searchable: {drawerAttr.is_searchable ? "YES" : "NO"}
                    </span>
                    <span className={`flag-status-pill ${drawerAttr.is_editable ? 'active' : ''}`}>
                      Editable: {drawerAttr.is_editable ? "YES" : "NO"}
                    </span>
                  </div>
                </div>

                {/* Technical Configuration */}
                <div className="drawer-section">
                  <h4>Technical Mapping</h4>
                  <div className="properties-list-grid">
                    <div className="prop-row">
                      <span className="prop-lbl">Target System</span>
                      <span className="prop-val text-highlight">{drawerAttr.application_type || "Generic"}</span>
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
                      <span className="prop-lbl">Validation Rule</span>
                      <span className="prop-val code">{drawerAttr.validation_rule || "None"}</span>
                    </div>
                    <div className="prop-row">
                      <span className="prop-lbl">Default Value</span>
                      <span className="prop-val">{drawerAttr.default_value || "None"}</span>
                    </div>
                  </div>
                </div>

                {/* Creation Metadata */}
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

                {/* Revision Logs (Audit history) */}
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
        </div>
      )}
    </div>
  );
};

export default AccountAttributes;
