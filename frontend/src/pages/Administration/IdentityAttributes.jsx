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
  Info
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { useAuth } from '../../context/AuthContext';
import { canCreate, canEdit, canDelete } from '../../utils/permissions';
import {
  getIdentityAttributes,
  getIdentityAttribute,
  createIdentityAttribute,
  updateIdentityAttribute,
  deleteIdentityAttribute,
  getAttributeCategories
} from '../../services/dashboardService';
import './IdentityAttributes.css';

const DATA_TYPES = [
  "String", "Integer", "Boolean", "Date", "DateTime",
  "Email", "Phone", "Dropdown", "Multi Select", "Number", "Text Area"
];

const STATUSES = ["Active", "Inactive", "Deprecated"];

const INITIAL_FORM_STATE = {
  attribute_name: '',
  display_name: '',
  description: '',
  category_id: '',
  data_type: 'String',
  attribute_type: 'Custom',
  is_required: false,
  is_unique: false,
  is_searchable: false,
  is_editable: true,
  default_value: '',
  validation_rule: '',
  display_order: 0,
  status: 'Active'
};

const IdentityAttributes = () => {
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
  const [dataTypeFilter, setDataTypeFilter] = useState('');
  const [requiredFilter, setRequiredFilter] = useState('');
  const [searchableFilter, setSearchableFilter] = useState('');

  // UI state overlays
  const [showModal, setShowModal] = useState(false);
  const [editAttributeId, setEditAttributeId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [formBannerError, setFormBannerError] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAttr, setDeleteAttr] = useState(null);

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
    required: 0,
    searchable: 0,
    active: 0
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
        data_type: dataTypeFilter || undefined,
        is_required: requiredFilter !== '' ? requiredFilter === 'true' : undefined,
        is_searchable: searchableFilter !== '' ? searchableFilter === 'true' : undefined,
        sortBy,
        sortOrder
      };

      const [listResult, kpiResult] = await Promise.allSettled([
        getIdentityAttributes(params),
        // Fetch absolute KPIs without pagination/filtering parameters to keep the top cards accurate
        getIdentityAttributes({ limit: 1000 })
      ]);

      if (listResult.status === 'rejected') {
        throw listResult.reason;
      }
      const response = listResult.value;
      setAttributes(response.attributes || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);

      if (kpiResult.status === 'fulfilled') {
        const kpis = kpiResult.value.attributes || [];
        setKpiStats({
          total: kpis.length,
          required: kpis.filter(a => a.is_required).length,
          searchable: kpis.filter(a => a.is_searchable).length,
          active: kpis.filter(a => a.status === 'Active').length
        });
      }

    } catch (err) {
      console.error('Failed to load attributes:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to fetch identity attributes. Please check connections.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, statusFilter, categoryFilter, dataTypeFilter, requiredFilter, searchableFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  // Search Submit/Debounce simulated
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Sort handler
  const handleSort = (field) => {
    const order = (sortBy === field && sortOrder === 'asc') ? 'desc' : 'asc';
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setStatusFilter('');
    setCategoryFilter('');
    setDataTypeFilter('');
    setRequiredFilter('');
    setSearchableFilter('');
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
      
      const response = await getIdentityAttribute(attr.id);
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
      attribute_type: 'Custom', // Copied ones become Custom
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
      category_id: attr.category_id || ''
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
      errors.attribute_name = "Name must contain only lowercase letters, numbers, and underscores (e.g. hire_date)";
    }

    if (!formData.display_name || !formData.display_name.trim()) {
      errors.display_name = "Display Name is required";
    }

    if (isNaN(formData.display_order) || formData.display_order === '') {
      errors.display_order = "Display Order must be numeric";
    }

    if (!formData.data_type) {
      errors.data_type = "Data Type must be selected";
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
        await updateIdentityAttribute(editAttributeId, payload);
      } else {
        await createIdentityAttribute(payload);
      }

      setShowModal(false);
      fetchAttributes();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save identity attribute. Please check fields.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete handlers
  const handleOpenDeleteConfirm = (e, attr) => {
    e.stopPropagation();
    if (attr.attribute_type === 'System') {
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
      await deleteIdentityAttribute(deleteAttr.id);
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
    const headers = ["Attribute Name", "Display Name", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
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
    link.setAttribute("download", `rAnalyzer_identity_attributes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportDropdown(false);
  };

  // Excel (friendly CSV/XML) Export
  const handleExportExcel = () => {
    const headers = ["Attribute Name", "Display Name", "Data Type", "Category", "Required", "Unique", "Searchable", "Editable", "Status", "Display Order", "Description"];
    const rows = attributes.map(a => [
      a.attribute_name,
      a.display_name,
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

    // Use tab delimiters so Excel parses it easily as a UTF-16 text format or direct spreadsheet format
    const excelContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
    const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rAnalyzer_identity_attributes_${new Date().toISOString().slice(0, 10)}.xls`);
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

  const handleKpiTotalClick = () => {
    setRequiredFilter('');
    setSearchableFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setDataTypeFilter('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const handleKpiRequiredClick = () => {
    setRequiredFilter('true');
    setSearchableFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setDataTypeFilter('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const handleKpiSearchableClick = () => {
    setRequiredFilter('');
    setSearchableFilter('true');
    setStatusFilter('');
    setCategoryFilter('');
    setDataTypeFilter('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const handleKpiActiveClick = () => {
    setRequiredFilter('');
    setSearchableFilter('');
    setStatusFilter('Active');
    setCategoryFilter('');
    setDataTypeFilter('');
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="identity-attributes-page">
      <Breadcrumb items={[
        { label: 'Data Foundation', active: false },
        { label: 'Identity Attributes', active: true }
      ]} />

      {/* Page Header */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Identity Attributes</h2>
          <p>Manage the identity schema used across rAnalyzer. Click any attribute row to view full logs.</p>
        </div>
        <div className="header-buttons-section">
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
          {canCreate('Identity Attributes') && (
            <button className="btn-add-attribute" onClick={handleOpenAddModal}>
              <Plus size={14} />
              <span>Add Attribute</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="attributes-kpi-grid">
        <DashboardCard title="Total Attributes" value={kpiStats.total} icon={Database} color="blue" loading={loading} onClick={handleKpiTotalClick} />
        <DashboardCard title="Required Attributes" value={kpiStats.required} icon={Sliders} color="purple" loading={loading} onClick={handleKpiRequiredClick} />
        <DashboardCard title="Searchable Attributes" value={kpiStats.searchable} icon={Search} color="teal" loading={loading} onClick={handleKpiSearchableClick} />
        <DashboardCard title="Active Attributes" value={kpiStats.active} icon={CheckCircle} color="green" loading={loading} onClick={handleKpiActiveClick} />
      </div>

      {/* Filters Toolbar */}
      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, display name, description..."
          />
        </div>
        <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
        <select className="filter-select" value={dataTypeFilter} onChange={(e) => { setDataTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All Data Types</option>
          {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={requiredFilter} onChange={(e) => { setRequiredFilter(e.target.value); setPage(1); }}>
          <option value="">Required: All</option>
          <option value="true">Required Only</option>
          <option value="false">Optional Only</option>
        </select>
        <select className="filter-select" value={searchableFilter} onChange={(e) => { setSearchableFilter(e.target.value); setPage(1); }}>
          <option value="">Searchable: All</option>
          <option value="true">Searchable Only</option>
          <option value="false">Non-Searchable Only</option>
        </select>
        {(searchInput || statusFilter || categoryFilter || dataTypeFilter || requiredFilter || searchableFilter || sortBy !== 'display_order' || sortOrder !== 'asc') && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px' }} />
            Reset
          </button>
        )}
      </div>

      {/* Main Grid View */}
      <div className="attributes-grid-container">
        <div className="attributes-table-header">
          <div style={{ width: '40px' }}>#</div>
          <div onClick={() => handleSort('attribute_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Attribute Name <ArrowUpDown size={11} />
          </div>
          <div onClick={() => handleSort('attribute_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Display Name <ArrowUpDown size={11} />
          </div>
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
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading attributes schema...</p>
          </div>
        ) : attributes.length === 0 ? (
          <div className="table-empty-container">
            <div className="empty-state-icon">
              <Database size={24} />
            </div>
            <h4>No Identity Attributes Found</h4>
            <p>Click 'Add Attribute' to create custom attribute mappings.</p>
          </div>
        ) : (
          <div className="attributes-table-body">
            {attributes.map((attr, idx) => (
              <div
                key={attr.id}
                className="attributes-table-row"
                onClick={() => handleOpenDrawer(attr)}
                title="Click to view change log and metadata"
              >
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(page - 1) * limit + idx + 1}</div>

                {/* Name */}
                <div className="attr-name-cell">
                  <span className="attr-name-lbl">{attr.attribute_name}</span>
                  <span className={`attr-type-tag ${attr.attribute_type.toLowerCase()}`}>{attr.attribute_type}</span>
                </div>

                {/* Display Name */}
                <div className="attr-display-lbl">{attr.display_name}</div>

                {/* Data Type */}
                <div>
                  <span className="attr-datatype-badge">{attr.data_type}</span>
                </div>

                {/* Category */}
                <div className="text-highlight">{attr.category?.category_name || "General"}</div>

                {/* Flags list */}
                <div className="attr-flags-list">
                  {attr.is_required && <span className="flag-badge req" title="Required">REQ</span>}
                  {attr.is_unique && <span className="flag-badge uniq" title="Unique">UNIQ</span>}
                  {attr.is_searchable && <span className="flag-badge search" title="Searchable">SRCH</span>}
                  {!attr.is_editable && <span className="flag-badge locked" title="System Locked">LOCK</span>}
                </div>

                {/* Status */}
                <div>
                  <span className={`status-badge ${attr.status.toLowerCase()}`}>{attr.status}</span>
                </div>

                {/* Display Order */}
                <div style={{ justifySelf: 'center', fontWeight: '600' }}>{attr.display_order}</div>

                {/* Actions */}
                <div className="row-actions-col" onClick={e => e.stopPropagation()}>
                  {canEdit('Identity Attributes') && (
                    <button className="btn-row-action" onClick={(e) => handleOpenEditModal(e, attr)} title="Edit">
                      <Edit size={13} />
                    </button>
                  )}
                  {canCreate('Identity Attributes') && (
                    <button className="btn-row-action" onClick={() => handleDuplicate(attr)} title="Duplicate">
                      <Copy size={13} />
                    </button>
                  )}
                  {canDelete('Identity Attributes') && attr.attribute_type !== 'System' && (
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
              Showing <b>{total === 0 ? 0 : (page - 1) * limit + 1}</b> to <b>{Math.min(page * limit, total)}</b> of <b>{total}</b> identity attributes
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
              <h3>{editAttributeId ? 'Edit Attribute Schema' : 'Add Identity Attribute'}</h3>
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
                      placeholder="e.g. country_code"
                      disabled={editAttributeId && formData.attribute_type === 'System'}
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
                      placeholder="e.g. Country Code"
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
                      disabled={editAttributeId && formData.attribute_type === 'System'}
                    >
                      {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

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
                </div>

                {/* Description */}
                <div className="form-group-custom">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    rows="2"
                    value={formData.description || ''}
                    onChange={handleInputChange}
                    placeholder="Enter short details explaining the attribute usage..."
                  />
                </div>

                {/* Flags Checkbox Grid */}
                <div className="form-flags-checkbox-grid">
                  <label className="checkbox-tile">
                    <input
                      type="checkbox"
                      name="is_required"
                      checked={formData.is_required}
                      onChange={handleInputChange}
                    />
                    <div className="checkbox-tile-content">
                      <span>Required</span>
                      <p>Validation mandates this field.</p>
                    </div>
                  </label>

                  <label className="checkbox-tile">
                    <input
                      type="checkbox"
                      name="is_unique"
                      checked={formData.is_unique}
                      onChange={handleInputChange}
                    />
                    <div className="checkbox-tile-content">
                      <span>Unique</span>
                      <p>Requires unique values.</p>
                    </div>
                  </label>

                  <label className="checkbox-tile">
                    <input
                      type="checkbox"
                      name="is_searchable"
                      checked={formData.is_searchable}
                      onChange={handleInputChange}
                    />
                    <div className="checkbox-tile-content">
                      <span>Searchable</span>
                      <p>Index for filters and lookups.</p>
                    </div>
                  </label>

                  <label className="checkbox-tile">
                    <input
                      type="checkbox"
                      name="is_editable"
                      checked={formData.is_editable}
                      onChange={handleInputChange}
                      disabled={editAttributeId && formData.attribute_type === 'System'}
                    />
                    <div className="checkbox-tile-content">
                      <span>Editable</span>
                      <p>Allow profiles to modify.</p>
                    </div>
                  </label>
                </div>

                <div className="form-grid-3col">
                  {/* Default Value */}
                  <div className="form-group-custom">
                    <label htmlFor="default_value">Default Value</label>
                    <input
                      type="text"
                      id="default_value"
                      name="default_value"
                      value={formData.default_value || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. N/A"
                    />
                  </div>

                  {/* Validation Rule */}
                  <div className="form-group-custom">
                    <label htmlFor="validation_rule">Validation Rule (Regex)</label>
                    <input
                      type="text"
                      id="validation_rule"
                      name="validation_rule"
                      value={formData.validation_rule || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. ^[A-Z]{2}$"
                    />
                  </div>

                  {/* Status */}
                  <div className="form-group-custom">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Attribute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Dialog Confirm */}
      {showDeleteConfirm && deleteAttr && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="delete-dialog-text">
                <h4>Delete Schema Attribute</h4>
                <p>
                  Are you sure you want to delete attribute <b>{deleteAttr.display_name}</b>?
                  This is a soft delete. The attribute definition will be removed from all active catalogs.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-modal-delete" onClick={handleDeleteSubmit} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete Attribute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer (Right panel slide-in) */}
      <div className={`detail-drawer-backdrop ${showDrawer ? 'open' : ''}`} onClick={() => setShowDrawer(false)}>
        <div className="detail-drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <div className="drawer-title-block">
              <h3>Schema Properties</h3>
              <p>Details and revision history logs</p>
            </div>
            <button className="drawer-close-btn" onClick={() => setShowDrawer(false)}>
              <X size={18} />
            </button>
          </div>

          {drawerLoading ? (
            <div className="drawer-loading-spinner">
              <div className="spinner-element"></div>
              <p>Loading properties...</p>
            </div>
          ) : drawerAttr && (
            <div className="drawer-content-scrollable">
              {/* Properties Grid */}
              <div className="drawer-section">
                <h4>General Information</h4>
                <div className="properties-list-grid">
                  <div className="prop-row">
                    <span className="prop-lbl">Attribute Name</span>
                    <span className="prop-val code">{drawerAttr.attribute_name}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Display Name</span>
                    <span className="prop-val bold">{drawerAttr.display_name}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Description</span>
                    <span className="prop-val italic">{drawerAttr.description || "No description provided."}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Category</span>
                    <span className="prop-val">{drawerAttr.category?.category_name || "General"}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Data Type</span>
                    <span className="prop-val font-badge">{drawerAttr.data_type}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Validation Rule</span>
                    <span className="prop-val code">{drawerAttr.validation_rule || "N/A"}</span>
                  </div>
                  <div className="prop-row">
                    <span className="prop-lbl">Default Value</span>
                    <span className="prop-val">{drawerAttr.default_value || "None"}</span>
                  </div>
                </div>
              </div>

              {/* Flags Grid */}
              <div className="drawer-section">
                <h4>Flags Configuration</h4>
                <div className="drawer-flags-row">
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

              {/* Meta details */}
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
                    <span className="prop-lbl">Last Modified Date</span>
                    <span className="prop-val">{new Date(drawerAttr.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Audit history */}
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
    </div>
  );
};

export default IdentityAttributes;
