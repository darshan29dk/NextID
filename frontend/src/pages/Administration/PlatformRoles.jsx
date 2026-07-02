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
  Users, 
  Key,
  ShieldAlert,
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  ArrowUpDown,
  FileSpreadsheet
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { 
  getPlatformRoles, 
  getPlatformRole,
  createPlatformRole, 
  updatePlatformRole, 
  deletePlatformRole 
} from '../../services/dashboardService';
import './PlatformRoles.css';

const ROLE_TYPES = ["System", "Business", "Application", "Technical", "Shared"];
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Draft", "Active", "Inactive", "Deprecated"];

const INITIAL_FORM_STATE = {
  role_code: '',
  role_name: '',
  description: '',
  role_type: 'Business',
  risk_level: 'Low',
  status: 'Active',
  approval_required: false,
  is_system_role: false
};

const PlatformRoles = () => {
  // Query state
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  
  // Sort and Filters state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [formBannerError, setFormBannerError] = useState(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState(null);
  const [deleteRoleCode, setDeleteRoleCode] = useState('');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  
  // Detail Drawer state
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Statistics state
  const [kpiStats, setKpiStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    critical: 0
  });

  const exportDropdownRef = useRef(null);

  // Handle click outside export dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Fetch Roles and calculate KPIs
  const fetchRolesData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const queryParams = {
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        risk_level: riskFilter || undefined,
        role_type: typeFilter || undefined,
        sortBy,
        sortOrder
      };

      const response = await getPlatformRoles(queryParams);
      setRoles(response.roles);
      setTotal(response.total);
      setTotalPages(response.total_pages);

      // Fetch all roles to compute KPIs accurately
      const statsRes = await getPlatformRoles({ limit: 1000 });
      const activeCount = statsRes.roles.filter(r => r.status === 'Active').length;
      const inactiveCount = statsRes.roles.filter(r => r.status === 'Inactive').length;
      const criticalCount = statsRes.roles.filter(r => r.risk_level === 'Critical').length;

      setKpiStats({
        total: statsRes.total,
        active: activeCount,
        inactive: inactiveCount,
        critical: criticalCount
      });

    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load platform roles. Please check backend server.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, riskFilter, typeFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchRolesData();
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
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setRiskFilter('');
    setTypeFilter('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  // Form input validations
  const validateForm = () => {
    const errors = {};
    if (!formData.role_code || !formData.role_code.trim()) {
      errors.role_code = 'Role Code is required';
    } else if (!/^[A-Z0-9_]{3,30}$/.test(formData.role_code.trim())) {
      errors.role_code = 'Role Code must be uppercase alphanumeric and underscores only (3-30 chars)';
    }
    
    if (!formData.role_name || !formData.role_name.trim()) {
      errors.role_name = 'Role Name is required';
    }
    if (!formData.description || !formData.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!formData.role_type) {
      errors.role_type = 'Role Type is required';
    }
    if (!formData.risk_level) {
      errors.risk_level = 'Risk Level is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Input change handler
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
    setFormBannerError(null);
  };

  // Open Add modal
  const handleOpenAddModal = () => {
    setEditRoleId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  // Open Edit modal
  const handleOpenEditModal = (e, role) => {
    e.stopPropagation(); // Avoid opening detail drawer
    setEditRoleId(role.id);
    setFormData({
      role_code: role.role_code,
      role_name: role.role_name,
      description: role.description,
      role_type: role.role_type,
      risk_level: role.risk_level,
      status: role.status,
      approval_required: role.approval_required,
      is_system_role: role.is_system_role
    });
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  // Form Submit Handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      setFormBannerError(null);

      const payload = {
        ...formData,
        role_code: formData.role_code.toUpperCase().trim()
      };

      if (editRoleId) {
        await updatePlatformRole(editRoleId, payload);
      } else {
        await createPlatformRole(payload);
      }
      
      setShowModal(false);
      fetchRolesData();
      
      // Update drawer if it is open for this role
      if (showDrawer && drawerData?.role?.id === editRoleId) {
        handleOpenDrawer(editRoleId);
      }
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || "An error occurred while saving the platform role.");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Role Status (Activate / Deactivate)
  const handleToggleStatus = async (e, role) => {
    e.stopPropagation();
    try {
      const nextStatus = role.status === 'Active' ? 'Inactive' : 'Active';
      await updatePlatformRole(role.id, { status: nextStatus });
      fetchRolesData();
      
      if (showDrawer && drawerData?.role?.id === role.id) {
        handleOpenDrawer(role.id);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update status.");
    }
  };

  // Delete Handlers
  const handleOpenDeleteConfirm = (e, role) => {
    e.stopPropagation();
    setDeleteRoleId(role.id);
    setDeleteRoleCode(role.role_code);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    try {
      setSubmitting(true);
      await deletePlatformRole(deleteRoleId);
      setShowDeleteConfirm(false);
      
      if (showDrawer && drawerData?.role?.id === deleteRoleId) {
        setShowDrawer(false);
      }
      
      if (roles.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchRolesData();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete role.");
      setShowDeleteConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Drawer Details Panel
  const handleOpenDrawer = async (id) => {
    try {
      setDrawerLoading(true);
      setShowDrawer(true);
      setDrawerData(null);
      
      const detail = await getPlatformRole(id);
      setDrawerData(detail);
    } catch (err) {
      console.error(err);
      alert("Failed to load platform role details.");
      setShowDrawer(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Export Exporters
  const getFilteredExportList = async () => {
    const queryParams = {
      limit: 1000,
      search: search.trim() || undefined,
      status: statusFilter || undefined,
      risk_level: riskFilter || undefined,
      role_type: typeFilter || undefined,
      sortBy,
      sortOrder
    };
    const response = await getPlatformRoles(queryParams);
    return response.roles;
  };

  const handleExportCSV = async () => {
    try {
      const exportList = await getFilteredExportList();
      if (exportList.length === 0) {
        alert("No roles to export.");
        return;
      }

      const headers = ["Role Code", "Role Name", "Role Type", "Risk Level", "Status", "Users Assigned", "Approval Required", "System Role", "Created By", "Created Date"];
      const csvRows = [headers.join(",")];

      exportList.forEach(r => {
        const row = [
          `"${r.role_code}"`,
          `"${r.role_name}"`,
          `"${r.role_type}"`,
          `"${r.risk_level}"`,
          `"${r.status}"`,
          r.users_assigned,
          `"${r.approval_required ? 'Yes' : 'No'}"`,
          `"${r.is_system_role ? 'Yes' : 'No'}"`,
          `"${r.created_by}"`,
          `"${new Date(r.created_at).toLocaleDateString()}"`
        ];
        csvRows.push(row.join(","));
      });

      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `platform_roles_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export CSV.");
    } finally {
      setShowExportDropdown(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const exportList = await getFilteredExportList();
      if (exportList.length === 0) {
        alert("No roles to export.");
        return;
      }

      // XML schema format opened perfectly in MS Excel!
      let xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:mesh" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Platform Roles"><Table>';
      xml += '<Row>';
      const columns = ["Role Code", "Role Name", "Role Type", "Risk Level", "Status", "Users Assigned", "Approval Required", "System Role", "Created By", "Created Date"];
      columns.forEach(col => {
        xml += `<Cell><Data ss:Type="String">${col}</Data></Cell>`;
      });
      xml += '</Row>';

      exportList.forEach(r => {
        xml += '<Row>';
        xml += `<Cell><Data ss:Type="String">${r.role_code}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.role_name}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.role_type}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.risk_level}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.status}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${r.users_assigned}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.approval_required ? 'Yes' : 'No'}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.is_system_role ? 'Yes' : 'No'}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${r.created_by}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${new Date(r.created_at).toLocaleDateString()}</Data></Cell>`;
        xml += '</Row>';
      });

      xml += '</Table></Worksheet></Workbook>';
      const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `platform_roles_${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export Excel sheet.");
    } finally {
      setShowExportDropdown(false);
    }
  };

  // Helper to render Audit JSON Diffs
  const renderAuditDiff = (log) => {
    if (!log.old_value && log.new_value) {
      try {
        const val = JSON.parse(log.new_value);
        return <div className="audit-change-diff">Role created. (Code: <span className="audit-field-diff-badge">{val.role_code}</span>, Type: {val.role_type})</div>;
      } catch (e) {
        return <div className="audit-change-diff">Role created.</div>;
      }
    }
    if (log.old_value && !log.new_value) {
      try {
        const val = JSON.parse(log.old_value);
        return <div className="audit-change-diff">Role deleted. (Code: <span className="audit-field-diff-badge">{val.role_code}</span>)</div>;
      } catch (e) {
        return <div className="audit-change-diff">Role deleted.</div>;
      }
    }
    if (log.old_value && log.new_value) {
      try {
        const oldVal = JSON.parse(log.old_value);
        const newVal = JSON.parse(log.new_value);
        const diffs = [];
        Object.keys(newVal).forEach(k => {
          if (oldVal[k] !== newVal[k]) {
            diffs.push(
              <div key={k}>
                <span className="audit-field-diff-badge">{k.replace('_', ' ').toUpperCase()}</span>: "{String(oldVal[k])}" ➜ "{String(newVal[k])}"
              </div>
            );
          }
        });
        return <div className="audit-change-diff">{diffs.length > 0 ? diffs : "Updated fields."}</div>;
      } catch (e) {
        return <div className="audit-change-diff">Role values updated.</div>;
      }
    }
    return null;
  };

  return (
    <div className="platform-roles-page">
      <Breadcrumb items={[{ label: 'Administration', active: false }, { label: 'Platform Roles', active: true }]} />

      {/* Header section */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Platform Roles</h2>
          <p>Configure access control models, assign roles, enforce risk ratings, and review compliance audits.</p>
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
          <button className="btn-add-role" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add Role</span>
          </button>
        </div>
      </div>

      {/* Statistics dashboard cards */}
      <div className="stats-grid">
        <DashboardCard 
          title="Total Roles" 
          value={kpiStats.total} 
          icon={Key} 
          color="blue"
          loading={loading}
        />
        <DashboardCard 
          title="Active Roles" 
          value={kpiStats.active} 
          icon={CheckCircle} 
          color="green"
          loading={loading}
        />
        <DashboardCard 
          title="Inactive Roles" 
          value={kpiStats.inactive} 
          icon={XCircle} 
          color="red"
          loading={loading}
        />
        <DashboardCard 
          title="Critical Roles" 
          value={kpiStats.critical} 
          icon={ShieldAlert} 
          color="purple"
          loading={loading}
        />
      </div>

      {/* Search and Filterscontrols */}
      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by code, name, description..."
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          className="filter-select"
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Risks</option>
          {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Types</option>
          {ROLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {(searchInput || statusFilter || riskFilter || typeFilter || sortBy !== 'created_at' || sortOrder !== 'desc') && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px' }} />
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Table view */}
      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}
        
        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading platform roles...</p>
          </div>
        ) : roles.length === 0 ? (
          <div className="table-empty-container">
            <div className="delete-dialog-icon" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <Key size={22} />
            </div>
            <div className="empty-state-text">
              <h4>No platform roles found</h4>
              <p>Configure new authorization profiles by clicking 'Add Role'.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="roles-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('role_code')}>
                      Role Code <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline-block' }} />
                    </th>
                    <th onClick={() => handleSort('role_name')}>
                      Role Name <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline-block' }} />
                    </th>
                    <th>Role Type</th>
                    <th onClick={() => handleSort('risk_level')}>
                      Risk Level <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline-block' }} />
                    </th>
                    <th>Status</th>
                    <th>Users Assigned</th>
                    <th>Approval Required</th>
                    <th onClick={() => handleSort('created_at')}>
                      Created Date <ArrowUpDown size={12} style={{ marginLeft: '4px', display: 'inline-block' }} />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenDrawer(role.id)}>
                      <td>
                        <span className="role-code-badge">{role.role_code}</span>
                      </td>
                      <td style={{ fontWeight: '600' }}>{role.role_name}</td>
                      <td>
                        <span className="type-badge">{role.role_type}</span>
                      </td>
                      <td>
                        <span className={`risk-badge ${role.risk_level.toLowerCase()}`}>
                          {role.risk_level}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${role.status.toLowerCase()}`}>
                          {role.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: '600', paddingLeft: '32px' }}>{role.users_assigned}</td>
                      <td>{role.approval_required ? 'Yes' : 'No'}</td>
                      <td>{new Date(role.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="actions-cell-menu" onClick={(e) => e.stopPropagation()}>
                          <button className="btn-row-action" onClick={(e) => handleOpenEditModal(e, role)} title="Edit Role">
                            <Edit size={13} />
                          </button>
                          <button 
                            className="btn-row-action" 
                            onClick={(e) => handleToggleStatus(e, role)}
                            title={role.status === 'Active' ? 'Deactivate' : 'Activate'}
                          >
                            {role.status === 'Active' ? <XCircle size={13} /> : <CheckCircle size={13} />}
                          </button>
                          {!role.is_system_role && (
                            <button className="btn-row-action delete" onClick={(e) => handleOpenDeleteConfirm(e, role)} title="Delete Role">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-footer">
              <div className="pagination-size-selector">
                <span>Show</span>
                <select
                  className="page-size-select"
                  value={limit}
                  onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>entries</span>
              </div>

              <span className="pagination-info" style={{ marginLeft: 'auto', marginRight: '24px' }}>
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> platform roles
              </span>
              
              <div className="pagination-controls">
                <button
                  className="btn-page-step"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(i => (
                  <button
                    key={i}
                    className={`btn-page-step ${page === i ? 'active' : ''}`}
                    onClick={() => setPage(i)}
                  >
                    {i}
                  </button>
                ))}
                <button
                  className="btn-page-step"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sliding Sidebar Drawer for Details */}
      {showDrawer && (
        <div className="drawer-backdrop-custom" onClick={() => setShowDrawer(false)}>
          <div className="drawer-panel-custom" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header-custom">
              <div className="drawer-header-title">
                <h3>{drawerLoading ? 'Loading Details...' : drawerData?.role?.role_name}</h3>
                {!drawerLoading && <span>{drawerData?.role?.role_code}</span>}
              </div>
              <button className="modal-close-btn-custom" onClick={() => setShowDrawer(false)} aria-label="Close drawer">
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body-custom">
              {drawerLoading ? (
                <div className="table-loading-container" style={{ margin: 'auto' }}>
                  <div className="spinner-element"></div>
                  <p className="text-muted">Loading role details...</p>
                </div>
              ) : drawerData && (
                <>
                  {/* Role Information Metadata */}
                  <div>
                    <div className="drawer-section-title">Role Information</div>
                    <div className="drawer-meta-grid">
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Role Code</span>
                        <span className="drawer-meta-value" style={{ fontFamily: 'var(--font-mono)' }}>
                          {drawerData.role.role_code}
                        </span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Role Name</span>
                        <span className="drawer-meta-value">{drawerData.role.role_name}</span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Role Type</span>
                        <span className="drawer-meta-value">
                          <span className="type-badge">{drawerData.role.role_type}</span>
                        </span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Risk Level</span>
                        <span className="drawer-meta-value">
                          <span className={`risk-badge ${drawerData.role.risk_level.toLowerCase()}`}>
                            {drawerData.role.risk_level}
                          </span>
                        </span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Status</span>
                        <span className="drawer-meta-value">
                          <span className={`status-badge ${drawerData.role.status.toLowerCase()}`}>
                            {drawerData.role.status}
                          </span>
                        </span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Approval Required</span>
                        <span className="drawer-meta-value">{drawerData.role.approval_required ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">System Role</span>
                        <span className="drawer-meta-value">{drawerData.role.is_system_role ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="drawer-meta-item">
                        <span className="drawer-meta-label">Created By</span>
                        <span className="drawer-meta-value">{drawerData.role.created_by}</span>
                      </div>
                      <div className="drawer-meta-item full-width">
                        <span className="drawer-meta-label">Description</span>
                        <span className="drawer-meta-value" style={{ fontWeight: '500' }}>
                          {drawerData.role.description}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Users list */}
                  <div>
                    <div className="drawer-section-title">Assigned Users ({drawerData.assigned_users.length})</div>
                    {drawerData.assigned_users.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic' }}>No users currently assigned to this role.</p>
                    ) : (
                      <div className="drawer-small-table-wrapper">
                        <table className="drawer-small-table">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Name</th>
                              <th>Department</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drawerData.assigned_users.map(u => (
                              <tr key={u.id}>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{u.employee_id}</td>
                                <td style={{ fontWeight: '600' }}>{u.first_name} {u.last_name}</td>
                                <td>{u.department || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Audit History logs */}
                  <div>
                    <div className="drawer-section-title">Audit History ({drawerData.audit_history.length})</div>
                    {drawerData.audit_history.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '12px', fontStyle: 'italic' }}>No audit trail recorded for this role.</p>
                    ) : (
                      <div className="drawer-small-table-wrapper" style={{ maxHeight: '250px' }}>
                        <table className="drawer-small-table">
                          <thead>
                            <tr>
                              <th>Action / Performed By</th>
                              <th>Details</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drawerData.audit_history.map(log => (
                              <tr key={log.id}>
                                <td>
                                  <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{log.action}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>by {log.performed_by}</div>
                                </td>
                                <td>
                                  {renderAuditDiff(log)}
                                </td>
                                <td>
                                  {new Date(log.timestamp).toLocaleDateString()}<br />
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal Form */}
      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>{editRoleId ? 'Edit Platform Role' : 'Add New Platform Role'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="modal-form-custom">
              <div className="modal-scrollable-body">
                {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}
                
                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Role Code</label>
                    <input
                      type="text"
                      name="role_code"
                      value={formData.role_code}
                      onChange={handleInputChange}
                      disabled={!!editRoleId} // Disable code edits
                      placeholder="e.g. COMP_OFFICER"
                    />
                    {formErrors.role_code && <span className="form-error-text">{formErrors.role_code}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Role Name</label>
                    <input
                      type="text"
                      name="role_name"
                      value={formData.role_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Compliance Officer"
                    />
                    {formErrors.role_name && <span className="form-error-text">{formErrors.role_name}</span>}
                  </div>
                </div>

                <div className="input-group-custom">
                  <label className="required">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Provide a detailed explanation of this role's access levels..."
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      outline: 'none',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  {formErrors.description && <span className="form-error-text">{formErrors.description}</span>}
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Role Type</label>
                    <select
                      name="role_type"
                      value={formData.role_type}
                      onChange={handleInputChange}
                    >
                      {ROLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Risk Level</label>
                    <select
                      name="risk_level"
                      value={formData.risk_level}
                      onChange={handleInputChange}
                    >
                      {RISK_LEVELS.map(rl => <option key={rl} value={rl}>{rl}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label>Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="input-group-custom" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '24px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        name="approval_required"
                        checked={formData.approval_required}
                        onChange={handleInputChange}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      Approval Required
                    </label>
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        name="is_system_role"
                        checked={formData.is_system_role}
                        onChange={handleInputChange}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      Is System Role
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="delete-dialog-text">
                <h4>Delete Platform Role</h4>
                <p>Are you sure you want to delete role <b>{deleteRoleCode}</b>? This will soft delete the role. Active users linked to this role will lose their platform reference, but their records will remain intact.</p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn-modal-delete" onClick={handleDeleteSubmit} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformRoles;
