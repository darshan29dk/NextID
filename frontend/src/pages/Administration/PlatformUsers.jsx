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
  UserCheck, 
  UserX, 
  Layers
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { 
  getPlatformUsers, 
  getPlatformRoles, 
  createPlatformUser, 
  updatePlatformUser, 
  deletePlatformUser 
} from '../../services/dashboardService';
import './PlatformUsers.css';

const DEPARTMENTS = [
  "Engineering", "Finance", "Sales", "HR", 
  "Operations", "IT", "Security", "Marketing"
];

const INITIAL_FORM_STATE = {
  employee_id: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  department: '',
  job_title: '',
  business_role: '',
  platform_role_id: '',
  status: 'Active',
  manager: ''
};

const PlatformUsers = () => {
  // Query and lists state
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Search & Filters state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [formBannerError, setFormBannerError] = useState(null);
  
  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState(null);
  const [deleteUserEmail, setDeleteUserEmail] = useState('');
  
  // KPI Stats state
  const [kpiStats, setKpiStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    departments: 0
  });

  // Fetch Roles
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await getPlatformRoles({ limit: 1000 });
        setRoles(response.roles || []);
      } catch (err) {
        console.error("Failed to load platform roles:", err);
      }
    };
    fetchRoles();
  }, []);

  // Fetch Users and KPIs
  const fetchUsersData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const queryParams = {
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        role_id: roleFilter ? parseInt(roleFilter) : undefined
      };
      
      const response = await getPlatformUsers(queryParams);
      setUsers(response.users);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      
      // Calculate KPI aggregates based on a broader query (limit=1000)
      // so stats remain accurate across filters
      const statsRes = await getPlatformUsers({ limit: 1000 });
      const activeCount = statsRes.users.filter(u => u.status === 'Active').length;
      const inactiveCount = statsRes.users.filter(u => u.status !== 'Active').length;
      const uniqueDepts = [...new Set(statsRes.users.map(u => u.department).filter(Boolean))].length;
      
      setKpiStats({
        total: statsRes.total,
        active: activeCount,
        inactive: inactiveCount,
        departments: uniqueDepts
      });
      
    } catch (err) {
      console.error("Failed to load platform users:", err);
      setErrorMsg("Failed to load platform users. Please check backend connection.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, deptFilter, roleFilter]);

  useEffect(() => {
    fetchUsersData();
  }, [fetchUsersData]);

  // Debounce search input
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setSearch(searchInput);
      setPage(1); // Reset to page 1 on search
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchInput]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setDeptFilter('');
    setRoleFilter('');
    setPage(1);
  };

  // Form Input Change Handler
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error on change
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
    setFormBannerError(null);
  };

  // Frontend Form Validation
  const validateForm = () => {
    const errors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^\+?[\d\s\-\(\)\.]{7,20}$/;

    if (!formData.employee_id || !formData.employee_id.trim()) {
      errors.employee_id = 'Employee ID is required';
    }
    if (!formData.first_name || !formData.first_name.trim()) {
      errors.first_name = 'First name is required';
    }
    if (!formData.last_name || !formData.last_name.trim()) {
      errors.last_name = 'Last name is required';
    }
    if (!formData.email || !formData.email.trim()) {
      errors.email = 'Email address is required';
    } else if (!emailPattern.test(formData.email)) {
      errors.email = 'Invalid email address format';
    }
    if (formData.phone && formData.phone.trim()) {
      if (!phonePattern.test(formData.phone)) {
        errors.phone = 'Invalid phone number format';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Open Add User modal
  const handleOpenAddModal = () => {
    setEditUserId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  // Open Edit User modal
  const handleOpenEditModal = (user) => {
    setEditUserId(user.id);
    setFormData({
      employee_id: user.employee_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone || '',
      department: user.department || '',
      job_title: user.job_title || '',
      business_role: user.business_role || '',
      platform_role_id: user.platform_role_id || '',
      status: user.status || 'Active',
      manager: user.manager || ''
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
        platform_role_id: formData.platform_role_id ? parseInt(formData.platform_role_id) : null
      };

      if (editUserId) {
        await updatePlatformUser(editUserId, payload);
      } else {
        await createPlatformUser(payload);
      }
      
      setShowModal(false);
      fetchUsersData();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || "An error occurred while saving the user.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User Handlers
  const handleOpenDeleteConfirm = (user) => {
    setDeleteUserId(user.id);
    setDeleteUserEmail(user.email);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    try {
      setSubmitting(true);
      await deletePlatformUser(deleteUserId);
      setShowDeleteConfirm(false);
      // If we are on page > 1 and delete causes page to empty, go back
      if (users.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchUsersData();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to delete user. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Exporter
  const handleExportCSV = async () => {
    try {
      // Fetch all non-deleted users matching active filters
      const queryParams = {
        limit: 1000,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        role_id: roleFilter ? parseInt(roleFilter) : undefined
      };
      
      const response = await getPlatformUsers(queryParams);
      const exportList = response.users;
      
      if (exportList.length === 0) {
        alert("No users found to export.");
        return;
      }
      
      // Build headers matching database layout
      const headers = [
        "Employee ID", "First Name", "Last Name", "Email", "Phone", 
        "Department", "Job Title", "Business Role", "Platform Role", "Status", "Manager"
      ];
      
      const csvRows = [headers.join(",")];
      
      for (const u of exportList) {
        const roleName = u.platform_role ? u.platform_role.name : "";
        const row = [
          `"${u.employee_id || ''}"`,
          `"${u.first_name || ''}"`,
          `"${u.last_name || ''}"`,
          `"${u.email || ''}"`,
          `"${u.phone || ''}"`,
          `"${u.department || ''}"`,
          `"${u.job_title || ''}"`,
          `"${u.business_role || ''}"`,
          `"${roleName}"`,
          `"${u.status || ''}"`,
          `"${u.manager || ''}"`
        ];
        csvRows.push(row.join(","));
      }
      
      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `platform_users_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export platform users.");
    }
  };

  // Render Page Numbers helpers
  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-page-step ${page === i ? 'active' : ''}`}
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div className="platform-users-page">
      <Breadcrumb items={[{ label: 'Administration', active: false }, { label: 'Platform Users', active: true }]} />

      {/* Title Header Bar */}
      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Platform Users</h2>
          <p>Manage system platform users, view job profiles, and assign access control policies.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-export-csv" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button className="btn-add-user" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <DashboardCard 
          title="Total Users" 
          value={kpiStats.total} 
          icon={Users} 
          color="blue"
          loading={loading}
        />
        <DashboardCard 
          title="Active Users" 
          value={kpiStats.active} 
          icon={UserCheck} 
          color="green"
          loading={loading}
        />
        <DashboardCard 
          title="Inactive Users" 
          value={kpiStats.inactive} 
          icon={UserX} 
          color="red"
          loading={loading}
        />
        <DashboardCard 
          title="Departments" 
          value={kpiStats.departments} 
          icon={Layers} 
          color="purple"
          loading={loading}
        />
      </div>

      {/* Search and Filters controls card */}
      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, employee ID..."
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select
          className="filter-select"
          value={deptFilter}
          onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Platform Roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.role_name}</option>
          ))}
        </select>

        {(searchInput || statusFilter || deptFilter || roleFilter) && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
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
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading platform users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="table-empty-container">
            <div className="delete-dialog-icon" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <Users size={22} />
            </div>
            <div className="empty-state-text">
              <h4>No platform users found</h4>
              <p>Try adjusting your search keywords or filter values.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Employee ID</th>
                    <th>Department</th>
                    <th>Job Title</th>
                    <th>Platform Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const avatarInitials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="user-identity-cell">
                            <div className="user-avatar-placeholder">
                              {avatarInitials}
                            </div>
                            <div className="user-info-meta">
                              <span className="user-display-name">{user.first_name} {user.last_name}</span>
                              <span className="user-email-address">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>{user.employee_id}</td>
                        <td>{user.department || '-'}</td>
                        <td>{user.job_title || '-'}</td>
                        <td>{user.platform_role ? user.platform_role.role_name : '-'}</td>
                        <td>
                          <span className={`status-badge ${user.status.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                            {user.status}
                          </span>
                        </td>
                        <td>
                          <div className="actions-cell-menu">
                            <button className="btn-row-action" onClick={() => handleOpenEditModal(user)} title="Edit User">
                              <Edit size={13} />
                            </button>
                            <button className="btn-row-action delete" onClick={() => handleOpenDeleteConfirm(user)} title="Delete User">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-footer">
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> platform users
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
                {renderPageNumbers()}
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

      {/* Add / Edit Form Modal */}
      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>{editUserId ? 'Edit Platform User' : 'Add New Platform User'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="modal-form-custom">
              <div className="modal-scrollable-body">
                {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}
                
                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">First Name</label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      placeholder="e.g. John"
                    />
                    {formErrors.first_name && <span className="form-error-text">{formErrors.first_name}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Last Name</label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Smith"
                    />
                    {formErrors.last_name && <span className="form-error-text">{formErrors.last_name}</span>}
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="e.g. john.smith@corp.com"
                    />
                    {formErrors.email && <span className="form-error-text">{formErrors.email}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Employee ID</label>
                    <input
                      type="text"
                      name="employee_id"
                      value={formData.employee_id}
                      onChange={handleInputChange}
                      placeholder="e.g. EMP1004"
                    />
                    {formErrors.employee_id && <span className="form-error-text">{formErrors.employee_id}</span>}
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label>Phone Number</label>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="e.g. +1 555-0199"
                    />
                    {formErrors.phone && <span className="form-error-text">{formErrors.phone}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label>Department</label>
                    <select
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Department</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label>Job Title</label>
                    <input
                      type="text"
                      name="job_title"
                      value={formData.job_title}
                      onChange={handleInputChange}
                      placeholder="e.g. Software Engineer"
                    />
                  </div>
                  <div className="input-group-custom">
                    <label>Business Role</label>
                    <input
                      type="text"
                      name="business_role"
                      value={formData.business_role}
                      onChange={handleInputChange}
                      placeholder="e.g. Lead Developer"
                    />
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label>Platform Role</label>
                    <select
                      name="platform_role_id"
                      value={formData.platform_role_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Platform Role</option>
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.role_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label>Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="input-group-custom">
                  <label>Reporting Manager</label>
                  <input
                    type="text"
                    name="manager"
                    value={formData.manager}
                    onChange={handleInputChange}
                    placeholder="e.g. Sarah Connor"
                  />
                </div>
              </div>
              
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save User'}
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
                <h4>Delete Platform User</h4>
                <p>Are you sure you want to delete user <b>{deleteUserEmail}</b>? This will hide the user from all active reports and lists, but their data will remain archived for compliance auditing.</p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn-modal-delete" onClick={handleDeleteSubmit} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformUsers;
