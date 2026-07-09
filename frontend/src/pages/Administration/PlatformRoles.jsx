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
  Key,
  ShieldAlert,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  FileSpreadsheet,
  Shield,
  Users,
  ArrowLeft,
  Clock,
  Info,
  Lock,
  Save
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import {
  getPlatformRoles,
  getPlatformRole,
  createPlatformRole,
  updatePlatformRole,
  deletePlatformRole,
  getMenuPermissionsByRole,
  updateMenuPermissionsForRole
} from '../../services/dashboardService';
import './PlatformRoles.css';

const ROLE_TYPES = ['System', 'Business', 'Application', 'Technical', 'Shared'];
const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['Draft', 'Active', 'Inactive', 'Deprecated'];

// The full set of menus/pages that permissions can be configured for.
// Names match the Title Case convention already used elsewhere
// (e.g. MenuPermission.menu_name == "Platform Roles" in role_attribute.py).
const MENU_LIST = [
  'Dashboard',
  'Identity Attributes',
  'Account Attributes',
  'Entitlement Attributes',
  'Role Attributes',
  'Attribute Categories',
  'Connector Workspace',
  'Application Workspace',
  'Identity Repository',
  'Platform Users',
  'Platform Roles',
  'Audit Logs',
  'Settings',
  'License Management'
];

const PERMISSION_COLUMNS = [
  { key: 'can_view', label: 'View' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_export', label: 'Export' },
  { key: 'can_approve', label: 'Approve' }
];

const buildDefaultPermissionRow = (menuName) => ({
  menu_name: menuName,
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_export: false,
  can_approve: false
});

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

// Risk level to icon color mapping
const getRiskClass = (risk) => {
  if (!risk) return 'low';
  return risk.toLowerCase();
};

const getRiskIcon = (risk) => {
  switch ((risk || '').toLowerCase()) {
    case 'critical': return <ShieldAlert size={20} />;
    case 'high':     return <ShieldAlert size={20} />;
    case 'medium':   return <Shield size={20} />;
    default:         return <Shield size={20} />;
  }
};

const getAuditDotClass = (action) => {
  const a = (action || '').toLowerCase();
  if (a === 'delete' || a === 'deactivate') return 'danger';
  if (a === 'update') return 'warn';
  return '';
};

// Render readable audit diff from JSON strings
const renderAuditDiff = (log) => {
  try {
    if (!log.old_value && log.new_value) {
      const val = JSON.parse(log.new_value);
      return (
        <div className="audit-diff-block">
          Role created — Code: <span className="audit-diff-field">{val.role_code}</span>
          {val.role_type ? `, Type: ${val.role_type}` : ''}
        </div>
      );
    }
    if (log.old_value && !log.new_value) {
      const val = JSON.parse(log.old_value);
      return (
        <div className="audit-diff-block">
          Role deleted — Code: <span className="audit-diff-field">{val.role_code}</span>
        </div>
      );
    }
    if (log.old_value && log.new_value) {
      const oldVal = JSON.parse(log.old_value);
      const newVal = JSON.parse(log.new_value);
      const diffs = [];
      Object.keys(newVal).forEach((k) => {
        if (oldVal[k] !== newVal[k]) {
          diffs.push(
            <div key={k}>
              <span className="audit-diff-field">{k.replace(/_/g, ' ').toUpperCase()}</span>
              : "{String(oldVal[k])}" → "{String(newVal[k])}"
            </div>
          );
        }
      });
      if (diffs.length === 0) return <div className="audit-diff-block">No field changes recorded.</div>;
      return <div className="audit-diff-block">{diffs}</div>;
    }
  } catch (e) {
    // Parsing failed — show raw
  }
  return null;
};

const PlatformRoles = () => {
  // View state: 'list' | 'detail'
  const [view, setView] = useState('list');
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  // List state
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [formBannerError, setFormBannerError] = useState(null);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState(null);
  const [deleteRoleCode, setDeleteRoleCode] = useState('');
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Detail view state
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Menu Permissions state (lives inside the role detail view)
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [permissionsSaved, setPermissionsSaved] = useState(false);
  const [permissionsError, setPermissionsError] = useState(null);

  const exportDropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ============================================================
  // Fetch roles list
  // ============================================================
  const fetchRolesData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const params = {
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        risk_level: riskFilter || undefined,
        role_type: typeFilter || undefined,
        sortBy,
        sortOrder
      };

      const response = await getPlatformRoles(params);
      setRoles(response.roles);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load platform roles. Please check backend server.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, riskFilter, typeFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (view === 'list') fetchRolesData();
  }, [fetchRolesData, view]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ============================================================
  // Menu Permissions — fetch, merge with defaults, save
  // ============================================================
  const fetchPermissions = async (roleId) => {
    try {
      setPermissionsLoading(true);
      setPermissionsError(null);
      setPermissionsSaved(false);

      const existing = await getMenuPermissionsByRole(roleId);

      // Merge fetched records into the full MENU_LIST, so every menu has a
      // row even if no permission record exists for it yet.
      const merged = MENU_LIST.map((menuName) => {
        const found = existing.find((p) => p.menu_name === menuName);
        return found
          ? {
              menu_name: menuName,
              can_view: !!found.can_view,
              can_create: !!found.can_create,
              can_edit: !!found.can_edit,
              can_delete: !!found.can_delete,
              can_export: !!found.can_export,
              can_approve: !!found.can_approve
            }
          : buildDefaultPermissionRow(menuName);
      });

      setPermissions(merged);
    } catch (err) {
      console.error('Failed to load menu permissions:', err);
      setPermissionsError('Failed to load menu permissions for this role.');
      setPermissions(MENU_LIST.map(buildDefaultPermissionRow));
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleTogglePermission = (menuName, field) => {
    setPermissions((prev) =>
      prev.map((row) =>
        row.menu_name === menuName ? { ...row, [field]: !row[field] } : row
      )
    );
    setPermissionsSaved(false);
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return;
    try {
      setPermissionsSaving(true);
      setPermissionsError(null);

      const payload = permissions.map((row) => ({
        role_id: selectedRoleId,
        menu_name: row.menu_name,
        can_view: row.can_view,
        can_create: row.can_create,
        can_edit: row.can_edit,
        can_delete: row.can_delete,
        can_export: row.can_export,
        can_approve: row.can_approve
      }));

      await updateMenuPermissionsForRole(selectedRoleId, payload);
      setPermissionsSaved(true);
      // Re-fetch to reflect exactly what's stored (ids, timestamps, etc.)
      fetchPermissions(selectedRoleId);
    } catch (err) {
      console.error('Failed to save menu permissions:', err);
      setPermissionsError(err.response?.data?.detail || 'Failed to save menu permissions.');
    } finally {
      setPermissionsSaving(false);
    }
  };

  // ============================================================
  // Open role detail view
  // ============================================================
  const handleOpenDetail = async (id) => {
    try {
      setDetailLoading(true);
      setDetailData(null);
      setView('detail');
      setSelectedRoleId(id);

      const data = await getPlatformRole(id);
      setDetailData(data);

      // Load menu permissions for this role alongside the role details
      fetchPermissions(id);
    } catch (err) {
      console.error(err);
      alert('Failed to load role details.');
      setView('list');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setView('list');
    setDetailData(null);
    setSelectedRoleId(null);
    setPermissions([]);
    setPermissionsSaved(false);
    setPermissionsError(null);
    fetchRolesData();
  };

  // ============================================================
  // Sort
  // ============================================================
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

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

  // ============================================================
  // Form handlers
  // ============================================================
  const validateForm = () => {
    const errors = {};
    if (!formData.role_code || !formData.role_code.trim()) {
      errors.role_code = 'Role Code is required';
    } else if (!/^[A-Z0-9_]{3,30}$/.test(formData.role_code.trim())) {
      errors.role_code = 'Must be uppercase alphanumeric & underscores only (3–30 chars)';
    }
    if (!formData.role_name || !formData.role_name.trim()) errors.role_name = 'Role Name is required';
    if (!formData.description || !formData.description.trim()) errors.description = 'Description is required';
    if (!formData.role_type) errors.role_type = 'Role Type is required';
    if (!formData.risk_level) errors.risk_level = 'Risk Level is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
    setFormBannerError(null);
  };

  const handleOpenAddModal = () => {
    setEditRoleId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (e, role) => {
    e.stopPropagation();
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setSubmitting(true);
      setFormBannerError(null);
      const payload = { ...formData, role_code: formData.role_code.toUpperCase().trim() };
      if (editRoleId) {
        await updatePlatformRole(editRoleId, payload);
      } else {
        await createPlatformRole(payload);
      }
      setShowModal(false);
      // Refresh detail view if we edited the currently viewed role
      if (view === 'detail' && editRoleId === selectedRoleId) {
        handleOpenDetail(selectedRoleId);
      } else {
        fetchRolesData();
      }
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'An error occurred while saving the role.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (e, role) => {
    e.stopPropagation();
    try {
      const nextStatus = role.status === 'Active' ? 'Inactive' : 'Active';
      await updatePlatformRole(role.id, { status: nextStatus });
      if (view === 'detail' && selectedRoleId === role.id) {
        handleOpenDetail(role.id);
      } else {
        fetchRolesData();
      }
    } catch (err) {
      alert('Failed to update status.');
    }
  };

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
      if (view === 'detail' && selectedRoleId === deleteRoleId) {
        handleBackToList();
      } else if (roles.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchRolesData();
      }
    } catch (err) {
      alert('Failed to delete role.');
      setShowDeleteConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // Export helpers
  // ============================================================
  const getExportList = async () => {
    const response = await getPlatformRoles({
      limit: 1000,
      search: search.trim() || undefined,
      status: statusFilter || undefined,
      risk_level: riskFilter || undefined,
      role_type: typeFilter || undefined
    });
    return response.roles;
  };

  const handleExportCSV = async () => {
    try {
      const list = await getExportList();
      if (!list.length) { alert('No roles to export.'); return; }
      const headers = ['Role Code', 'Role Name', 'Role Type', 'Risk Level', 'Status', 'Users Assigned', 'Approval Required', 'System Role', 'Created By', 'Created Date'];
      const rows = [headers.join(',')];
      list.forEach((r) => {
        rows.push([
          `"${r.role_code}"`, `"${r.role_name}"`, `"${r.role_type}"`, `"${r.risk_level}"`,
          `"${r.status}"`, r.users_assigned, `"${r.approval_required ? 'Yes' : 'No'}"`,
          `"${r.is_system_role ? 'Yes' : 'No'}"`, `"${r.created_by}"`,
          `"${new Date(r.created_at).toLocaleDateString()}"`
        ].join(','));
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `platform_roles_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) { alert('Failed to export CSV.'); }
    finally { setShowExportDropdown(false); }
  };

  const handleExportExcel = async () => {
    try {
      const list = await getExportList();
      if (!list.length) { alert('No roles to export.'); return; }
      const cols = ['Role Code', 'Role Name', 'Role Type', 'Risk Level', 'Status', 'Users Assigned', 'Approval Required', 'System Role', 'Created By', 'Created Date'];
      let xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Platform Roles"><Table>';
      xml += '<Row>' + cols.map((c) => `<Cell><Data ss:Type="String">${c}</Data></Cell>`).join('') + '</Row>';
      list.forEach((r) => {
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
      const link = document.createElement('a');
      link.href = url;
      link.download = `platform_roles_${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) { alert('Failed to export Excel.'); }
    finally { setShowExportDropdown(false); }
  };

  // ============================================================
  // RENDER — DETAIL VIEW
  // ============================================================
  if (view === 'detail') {
    const role = detailData?.role;
    const assignedUsers = detailData?.assigned_users || [];
    const auditHistory = detailData?.audit_history || [];

    return (
      <div className="platform-roles-page">
        <Breadcrumb items={[
          { label: 'Administration', active: false },
          { label: 'Platform Roles', active: false, onClick: handleBackToList },
          { label: role?.role_name || 'Loading...', active: true }
        ]} />

        {/* Back button */}
        <button className="detail-back-btn" onClick={handleBackToList}>
          <ArrowLeft size={14} />
          Back to Platform Roles
        </button>

        {detailLoading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading role details...</p>
          </div>
        ) : role ? (
          <>
            {/* Hero Card */}
            <div className="detail-hero-card">
              <div className="detail-hero-left">
                <div className={`detail-hero-icon role-icon-circle ${getRiskClass(role.risk_level)}`}>
                  {getRiskIcon(role.risk_level)}
                </div>
                <div className="detail-hero-info">
                  <h2>{role.role_name}</h2>
                  <p>{role.description}</p>
                  <div className="detail-hero-meta">
                    <span className="role-code-small">{role.role_code}</span>
                    <span className="role-type-badge">{role.role_type}</span>
                    <span className={`risk-badge ${getRiskClass(role.risk_level)}`}>{role.risk_level}</span>
                    <span className={`status-badge ${role.status.toLowerCase()}`}>{role.status}</span>
                    {role.is_system_role && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>
                        🔒 System Role
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="detail-hero-right">
                <div className="detail-hero-stat">
                  <div className="stat-num">{role.users_assigned}</div>
                  <div className="stat-label">Assigned Users</div>
                </div>
                <div className="detail-action-btns">
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
                    <button className="btn-row-action delete" onClick={(e) => handleOpenDeleteConfirm(e, role)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Details & Users */}
            <div className="detail-grid-2">
              {/* Role Properties */}
              <div className="detail-section-card">
                <div className="detail-section-header">
                  <h4><Info size={14} /> Role Properties</h4>
                </div>
                <div className="detail-section-body">
                  <div className="detail-meta-grid">
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Role Code</span>
                      <span className="detail-meta-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                        {role.role_code}
                      </span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Role Type</span>
                      <span className="detail-meta-value">{role.role_type}</span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Risk Level</span>
                      <span className="detail-meta-value">
                        <span className={`risk-badge ${getRiskClass(role.risk_level)}`}>{role.risk_level}</span>
                      </span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Status</span>
                      <span className="detail-meta-value">
                        <span className={`status-badge ${role.status.toLowerCase()}`}>{role.status}</span>
                      </span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Approval Required</span>
                      <span className="detail-meta-value">{role.approval_required ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">System Role</span>
                      <span className="detail-meta-value">{role.is_system_role ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Created By</span>
                      <span className="detail-meta-value">{role.created_by}</span>
                    </div>
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">Created Date</span>
                      <span className="detail-meta-value">{new Date(role.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="detail-meta-item full-width">
                      <span className="detail-meta-label">Description</span>
                      <span className="detail-meta-value" style={{ fontWeight: '500', lineHeight: 1.5 }}>
                        {role.description}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Assigned Users */}
              <div className="detail-section-card">
                <div className="detail-section-header">
                  <h4><Users size={14} /> Assigned Users</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                    {assignedUsers.length} user{assignedUsers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ overflow: 'auto', maxHeight: '320px' }}>
                  {assignedUsers.length === 0 ? (
                    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No users are currently assigned to this role.
                    </div>
                  ) : (
                    <table className="detail-inner-table">
                      <thead>
                        <tr>
                          <th>Employee ID</th>
                          <th>Name</th>
                          <th>Department</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedUsers.map((u) => (
                          <tr key={u.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--primary)' }}>
                              {u.employee_id}
                            </td>
                            <td style={{ fontWeight: '600' }}>{u.first_name} {u.last_name}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{u.department || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Menu Permissions */}
            <div className="detail-section-card">
              <div className="detail-section-header">
                <h4><Lock size={14} /> Menu Permissions</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {permissionsSaved && (
                    <span style={{ fontSize: '12px', color: 'var(--success, #10b981)', fontWeight: '600' }}>
                      Saved
                    </span>
                  )}
                  <button
                    className="btn-add-role"
                    onClick={handleSavePermissions}
                    disabled={permissionsLoading || permissionsSaving}
                    style={{ padding: '7px 14px', fontSize: '12.5px' }}
                  >
                    <Save size={13} />
                    <span>{permissionsSaving ? 'Saving...' : 'Save Permissions'}</span>
                  </button>
                </div>
              </div>
              <div className="detail-section-body">
                {permissionsError && (
                  <div className="error-banner" style={{ marginBottom: '12px' }}>{permissionsError}</div>
                )}
                {permissionsLoading ? (
                  <div className="table-loading-container">
                    <div className="spinner-element"></div>
                    <p className="text-muted" style={{ fontSize: '13px' }}>Loading menu permissions...</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="detail-inner-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Menu</th>
                          {PERMISSION_COLUMNS.map((col) => (
                            <th key={col.key} style={{ textAlign: 'center' }}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {permissions.map((row) => (
                          <tr key={row.menu_name}>
                            <td style={{ fontWeight: '600' }}>{row.menu_name}</td>
                            {PERMISSION_COLUMNS.map((col) => (
                              <td key={col.key} style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={row[col.key]}
                                  onChange={() => handleTogglePermission(row.menu_name, col.key)}
                                  style={{ width: '15px', height: '15px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Timeline */}
            <div className="detail-section-card">
              <div className="detail-section-header">
                <h4><Clock size={14} /> Audit History</h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                  {auditHistory.length} event{auditHistory.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="detail-section-body">
                {auditHistory.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No audit records found for this role.
                  </p>
                ) : (
                  <div className="audit-timeline">
                    {auditHistory.map((log) => (
                      <div className="audit-timeline-item" key={log.id}>
                        <div className={`audit-dot ${getAuditDotClass(log.action)}`}></div>
                        <div className="audit-content">
                          <div className="audit-title">{log.action}</div>
                          <div className="audit-by">by {log.performed_by}</div>
                          {renderAuditDiff(log)}
                        </div>
                        <div className="audit-time">
                          {new Date(log.timestamp).toLocaleDateString()}
                          <br />
                          <span style={{ opacity: 0.7 }}>
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* Modals */}
        {renderModals()}
      </div>
    );
  }

  // ============================================================
  // RENDER — LIST VIEW
  // ============================================================
  function renderModals() {
    return (
      <>
        {/* Add / Edit Modal */}
        {showModal && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom">
              <div className="modal-header-custom">
                <h3>{editRoleId ? 'Edit Platform Role' : 'Add New Platform Role'}</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowModal(false)}>
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
                        disabled={!!editRoleId}
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
                      placeholder="Describe this role's access and permissions..."
                      style={{
                        backgroundColor: 'var(--bg-hover)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        outline: 'none',
                        fontSize: '13.5px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        width: '100%'
                      }}
                    />
                    {formErrors.description && <span className="form-error-text">{formErrors.description}</span>}
                  </div>

                  <div className="form-row-grid-2">
                    <div className="input-group-custom">
                      <label className="required">Role Type</label>
                      <select name="role_type" value={formData.role_type} onChange={handleInputChange}>
                        {ROLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="input-group-custom">
                      <label className="required">Risk Level</label>
                      <select name="risk_level" value={formData.risk_level} onChange={handleInputChange}>
                        {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row-grid-2">
                    <div className="input-group-custom">
                      <label>Status</label>
                      <select name="status" value={formData.status} onChange={handleInputChange}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="input-group-custom" style={{ justifyContent: 'flex-end', paddingTop: '24px' }}>
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

                  <div className="input-group-custom">
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        name="is_system_role"
                        checked={formData.is_system_role}
                        onChange={handleInputChange}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      Mark as System Role
                    </label>
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

        {/* Delete Confirm */}
        {showDeleteConfirm && (
          <div className="modal-overlay-custom">
            <div className="modal-content-custom delete-dialog-content">
              <div className="delete-dialog-body">
                <div className="delete-dialog-icon">
                  <AlertTriangle size={24} />
                </div>
                <div className="delete-dialog-text">
                  <h4>Delete Platform Role</h4>
                  <p>
                    Are you sure you want to delete role <b>{deleteRoleCode}</b>? This is a soft delete —
                    the role will be hidden but data will remain for audit compliance.
                  </p>
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
      </>
    );
  }

  return (
    <div className="platform-roles-page">
      <Breadcrumb items={[{ label: 'Administration', active: false }, { label: 'Platform Roles', active: true }]} />

      {/* Page Header */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Platform Roles</h2>
          <p>Define and manage platform authorization roles. Click a role to view its full details.</p>
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

      {/* Search & Filters */}
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
        <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}>
          <option value="">All Risks</option>
          {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          {ROLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {(searchInput || statusFilter || riskFilter || typeFilter || sortBy !== 'created_at' || sortOrder !== 'desc') && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px' }} />
            Reset
          </button>
        )}
      </div>

      {/* Roles List */}
      <div className="roles-list-grid">
        {/* Header Row */}
        <div className="roles-list-header">
          <div onClick={() => handleSort('role_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Name <ArrowUpDown size={11} />
          </div>
          <div>Type</div>
          <div onClick={() => handleSort('risk_level')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Risk <ArrowUpDown size={11} />
          </div>
          <div>Status</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {errorMsg && (
          <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>
        )}

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
              <p>Click 'Add Role' to create a new platform authorization role.</p>
            </div>
          </div>
        ) : (
          roles.map((role) => (
            <div
              key={role.id}
              className="roles-list-row"
              onClick={() => handleOpenDetail(role.id)}
              title="Click to view role details"
            >
              {/* Name + Code */}
              <div className="role-name-cell">
                <div className={`role-icon-circle ${getRiskClass(role.risk_level)}`}>
                  {getRiskIcon(role.risk_level)}
                </div>
                <div className="role-name-info">
                  <span className="role-name-label">{role.role_name}</span>
                  <span className="role-code-small">{role.role_code}</span>
                </div>
              </div>

              {/* Type */}
              <div>
                <span className="role-type-badge">{role.role_type}</span>
              </div>

              {/* Risk */}
              <div>
                <span className={`risk-badge ${getRiskClass(role.risk_level)}`}>{role.risk_level}</span>
              </div>

              {/* Status */}
              <div>
                <span className={`status-badge ${role.status.toLowerCase()}`}>{role.status}</span>
              </div>

              {/* Actions */}
              <div className="row-actions-col" onClick={(e) => e.stopPropagation()}>
                <button className="btn-row-action" onClick={(e) => handleOpenEditModal(e, role)} title="Edit">
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
                  <button className="btn-row-action delete" onClick={(e) => handleOpenDeleteConfirm(e, role)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}


      </div>

      {/* Modals */}
      {renderModals()}
    </div>
  );
};

export default PlatformRoles;