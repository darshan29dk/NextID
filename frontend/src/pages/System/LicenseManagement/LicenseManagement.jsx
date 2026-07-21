import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Building2
} from 'lucide-react';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../../components/DashboardCard/DashboardCard';
import {
  getLicenses,
  createLicense,
  updateLicense,
  deleteLicense
} from '../../../services/dashboardService';
import './LicenseManagement.css';

const PLAN_TYPES = ["Trial", "Standard", "Enterprise"];

const INITIAL_FORM_STATE = {
  company_name: '',
  license_key: '',
  plan_type: 'Standard',
  valid_from: '',
  valid_until: '',
  max_users: '',
  current_users: 0
};

const LicenseManagement = () => {
  const [licenses, setLicenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [formBannerError, setFormBannerError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editLicenseId, setEditLicenseId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLicenseId, setDeleteLicenseId] = useState(null);
  const [deleteLicenseCompany, setDeleteLicenseCompany] = useState('');

  const [kpiStats, setKpiStats] = useState({
    total: 0,
    active: 0,
    expiringSoon: 0,
    expired: 0
  });

  const fetchLicensesData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const queryParams = {
        page,
        limit,
        search: search.trim() || undefined,
        plan_type: planFilter || undefined,
        status: statusFilter || undefined
      };

      const [listResult, statsResult] = await Promise.allSettled([
        getLicenses(queryParams),
        // Broader fetch for accurate KPI counts regardless of active filters
        getLicenses({ limit: 1000 })
      ]);

      if (listResult.status === 'rejected') {
        throw listResult.reason;
      }
      const response = listResult.value;
      setLicenses(response.licenses);
      setTotal(response.total);
      setTotalPages(response.total_pages);

      if (statsResult.status === 'fulfilled') {
        const statsRes = statsResult.value;
        const activeCount = statsRes.licenses.filter(l => l.status === 'Active').length;
        const expiringCount = statsRes.licenses.filter(l => l.status === 'Expiring Soon').length;
        const expiredCount = statsRes.licenses.filter(l => l.status === 'Expired').length;

        setKpiStats({
          total: statsRes.total,
          active: activeCount,
          expiringSoon: expiringCount,
          expired: expiredCount
        });
      }
    } catch (err) {
      console.error("Failed to load licenses:", err);
      setErrorMsg("Failed to load licenses. Please check backend connection.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, planFilter, statusFilter]);

  useEffect(() => {
    fetchLicensesData();
  }, [fetchLicensesData]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchInput]);

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setPlanFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
    setFormBannerError(null);
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.company_name || !formData.company_name.trim()) {
      errors.company_name = 'Company name is required';
    }
    if (!formData.license_key || !formData.license_key.trim()) {
      errors.license_key = 'License key is required';
    }
    if (!formData.valid_from) {
      errors.valid_from = 'Valid From date is required';
    }
    if (!formData.valid_until) {
      errors.valid_until = 'Valid Until date is required';
    }
    if (formData.valid_from && formData.valid_until && formData.valid_until <= formData.valid_from) {
      errors.valid_until = 'Valid Until must be after Valid From';
    }
    if (!formData.max_users || parseInt(formData.max_users) < 1) {
      errors.max_users = 'Max users must be at least 1';
    }
    if (
      formData.current_users !== '' &&
      formData.max_users &&
      parseInt(formData.current_users) > parseInt(formData.max_users)
    ) {
      errors.current_users = 'Current users cannot exceed max users';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenAddModal = () => {
    setEditLicenseId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (lic) => {
    setEditLicenseId(lic.id);
    setFormData({
      company_name: lic.company_name,
      license_key: lic.license_key,
      plan_type: lic.plan_type,
      valid_from: lic.valid_from,
      valid_until: lic.valid_until,
      max_users: lic.max_users,
      current_users: lic.current_users
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

      const payload = {
        ...formData,
        max_users: parseInt(formData.max_users),
        current_users: formData.current_users === '' ? 0 : parseInt(formData.current_users)
      };

      if (editLicenseId) {
        await updateLicense(editLicenseId, payload);
      } else {
        await createLicense(payload);
      }

      setShowModal(false);
      fetchLicensesData();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || "An error occurred while saving the license.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteConfirm = (lic) => {
    setDeleteLicenseId(lic.id);
    setDeleteLicenseCompany(lic.company_name);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    try {
      setSubmitting(true);
      await deleteLicense(deleteLicenseId);
      setShowDeleteConfirm(false);
      if (licenses.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchLicensesData();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to delete license. Please try again.");
      setShowDeleteConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadgeClass = (status) => {
    switch (status) {
      case 'Active': return 'status-badge active';
      case 'Expired': return 'status-badge inactive';
      case 'Expiring Soon': return 'status-badge warning';
      default: return 'status-badge';
    }
  };

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
    <div className="license-management-page">
      <Breadcrumb items={[{ label: 'System', active: false }, { label: 'License Management', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>License Management</h2>
          <p>Manage client licenses, plan types, and user limits across companies.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-add-user" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add License</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <DashboardCard title="Total Licenses" value={kpiStats.total} icon={KeyRound} color="blue" loading={loading} />
        <DashboardCard title="Active" value={kpiStats.active} icon={ShieldCheck} color="green" loading={loading} />
        <DashboardCard title="Expiring Soon" value={kpiStats.expiringSoon} icon={ShieldAlert} color="purple" loading={loading} />
        <DashboardCard title="Expired" value={kpiStats.expired} icon={ShieldAlert} color="red" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by company name or license key..."
          />
        </div>

        <select
          className="filter-select"
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Plans</option>
          {PLAN_TYPES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Expiring Soon">Expiring Soon</option>
          <option value="Expired">Expired</option>
          <option value="Upcoming">Upcoming</option>
        </select>

        {(searchInput || planFilter || statusFilter) && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reset Filters
          </button>
        )}
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading licenses...</p>
          </div>
        ) : licenses.length === 0 ? (
          <div className="table-empty-container">
            <div className="delete-dialog-icon" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <Building2 size={22} />
            </div>
            <div className="empty-state-text">
              <h4>No licenses found</h4>
              <p>Try adjusting your search keywords or filter values.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>License Key</th>
                    <th>Plan</th>
                    <th>Valid Period</th>
                    <th>Users</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((lic) => (
                    <tr key={lic.id}>
                      <td>{lic.company_name}</td>
                      <td>{lic.license_key}</td>
                      <td>{lic.plan_type}</td>
                      <td>{lic.valid_from} → {lic.valid_until}</td>
                      <td>{lic.current_users} / {lic.max_users}</td>
                      <td>
                        <span className={statusBadgeClass(lic.status)}>{lic.status}</span>
                      </td>
                      <td>
                        <div className="actions-cell-menu">
                          <button className="btn-row-action" onClick={() => handleOpenEditModal(lic)} title="Edit License">
                            <Edit size={13} />
                          </button>
                          <button className="btn-row-action delete" onClick={() => handleOpenDeleteConfirm(lic)} title="Delete License">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-footer">
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> licenses
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

      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>{editLicenseId ? 'Edit License' : 'Add New License'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="modal-form-custom">
              <div className="modal-scrollable-body">
                {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Company Name</label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      placeholder="e.g. ABC Bank"
                    />
                    {formErrors.company_name && <span className="form-error-text">{formErrors.company_name}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label className="required">License Key</label>
                    <input
                      type="text"
                      name="license_key"
                      value={formData.license_key}
                      onChange={handleInputChange}
                      placeholder="e.g. RAN-ENT-2026-0001"
                    />
                    {formErrors.license_key && <span className="form-error-text">{formErrors.license_key}</span>}
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Plan Type</label>
                    <select name="plan_type" value={formData.plan_type} onChange={handleInputChange}>
                      {PLAN_TYPES.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Max Users</label>
                    <input
                      type="number"
                      name="max_users"
                      min="1"
                      value={formData.max_users}
                      onChange={handleInputChange}
                      placeholder="e.g. 5000"
                    />
                    {formErrors.max_users && <span className="form-error-text">{formErrors.max_users}</span>}
                  </div>
                </div>

                <div className="form-row-grid-2">
                  <div className="input-group-custom">
                    <label className="required">Valid From</label>
                    <input
                      type="date"
                      name="valid_from"
                      value={formData.valid_from}
                      onChange={handleInputChange}
                    />
                    {formErrors.valid_from && <span className="form-error-text">{formErrors.valid_from}</span>}
                  </div>
                  <div className="input-group-custom">
                    <label className="required">Valid Until</label>
                    <input
                      type="date"
                      name="valid_until"
                      value={formData.valid_until}
                      onChange={handleInputChange}
                    />
                    {formErrors.valid_until && <span className="form-error-text">{formErrors.valid_until}</span>}
                  </div>
                </div>

                <div className="input-group-custom">
                  <label>Current Users</label>
                  <input
                    type="number"
                    name="current_users"
                    min="0"
                    value={formData.current_users}
                    onChange={handleInputChange}
                    placeholder="e.g. 3721"
                  />
                  <span className="field-hint">Number of users currently active under this license.</span>
                  {formErrors.current_users && <span className="form-error-text">{formErrors.current_users}</span>}
                </div>
              </div>

              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="delete-dialog-text">
                <h4>Delete License</h4>
                <p>Are you sure you want to delete the license for <b>{deleteLicenseCompany}</b>? This will hide it from all active reports, but the record remains archived for compliance auditing.</p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn-modal-delete" onClick={handleDeleteSubmit} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete License'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicenseManagement;