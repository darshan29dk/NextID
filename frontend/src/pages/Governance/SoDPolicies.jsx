import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, Search, Plus, Download, Edit, Trash2, 
  Copy, CheckCircle2, AlertOctagon, RefreshCw, X, Eye, 
  ChevronLeft, ChevronRight, Upload, Info, HelpCircle,
  FileSpreadsheet, History, Play
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import './SoDPolicies.css';

// Existing API client configuration (same as user management page)
import { apiClient } from '../../services/dashboardService';
import { formatLocalDateTime } from '../../utils/dateUtils';

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "SUSPENDED", "DEPRECATED"];
const POLICY_TYPES = ["STATIC", "DYNAMIC"];

const INITIAL_FORM_STATE = {
  policy_name: '',
  description: '',
  risk_level: 'LOW',
  policy_type: 'STATIC',
  status: 'DRAFT',
  business_owner: '',
  approver: '',
  rules: [
    { application_name: '', entitlement_one: '', entitlement_two: '', condition_type: 'AND' }
  ]
};

const SoDPolicies = () => {
  // Query, list & pagination state
  const [policies, setPolicies] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filters state
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // UI status
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);

  // Auto-complete dynamic lookup data
  const [availableApps, setAvailableApps] = useState([]);
  const [appEntitlements, setAppEntitlements] = useState({}); // { appName: [entName1, entName2] }

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [modalError, setModalError] = useState(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [policyAudit, setPolicyAudit] = useState([]);
  const [activeTab, setActiveTab] = useState('info'); // info | rules | audit | simulation

  // Simulation State
  const [simResults, setSimResults] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);

  // KPI Summary stats state
  const [kpis, setKpis] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    critical: 0,
    high: 0,
    draft: 0
  });

  // Fetch Lookups
  const fetchLookups = useCallback(async () => {
    try {
      const appRes = await apiClient.get('/governance/sod-policies/lookup/applications');
      setAvailableApps(appRes.data);
    } catch (err) {
      console.error("Failed to load application names lookup:", err);
    }
  }, []);

  const fetchEntitlementsForApp = async (appName) => {
    if (!appName || appEntitlements[appName]) return;
    try {
      const entRes = await apiClient.get('/governance/sod-policies/lookup/entitlements', {
        params: { application_name: appName }
      });
      setAppEntitlements(prev => ({
        ...prev,
        [appName]: entRes.data
      }));
    } catch (err) {
      console.error(`Failed to load entitlements for app ${appName}:`, err);
    }
  };

  // Main list fetch
  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        page,
        limit,
        search: search || undefined,
        risk_level: riskFilter || undefined,
        status: statusFilter || undefined,
        policy_type: typeFilter || undefined
      };
      const res = await apiClient.get('/governance/sod-policies', { params });
      setPolicies(res.data.policies);
      setTotal(res.data.total);
      setTotalPages(Math.ceil(res.data.total / limit));
      setKpis(res.data.kpis);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Failed to load Segregation of Duties policies.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, riskFilter, statusFilter, typeFilter]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  // Export handlers
  const handleExportCSV = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/sod-policies/export/csv`, '_blank');
  };

  const handleExportExcel = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/sod-policies/export/excel`, '_blank');
  };

  // Search & Filter changes
  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setRiskFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setPage(1);
  };

  // Checkbox handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(policies.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Bulk operation triggers
  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected policies?`)) return;
    try {
      await apiClient.post('/governance/sod-policies/bulk-delete', selectedIds);
      showToast("Successfully deleted selected policies", "success");
      setSelectedIds([]);
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Bulk delete failed", "error");
    }
  };

  const handleBulkActivate = async () => {
    try {
      await apiClient.post('/governance/sod-policies/bulk-activate', selectedIds);
      showToast("Successfully activated selected policies", "success");
      setSelectedIds([]);
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Bulk activation failed", "error");
    }
  };

  const handleBulkDeactivate = async () => {
    try {
      await apiClient.post('/governance/sod-policies/bulk-deactivate', selectedIds);
      showToast("Successfully deactivated selected policies", "success");
      setSelectedIds([]);
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Bulk deactivation failed", "error");
    }
  };

  // View Policy drawer details
  const handleViewPolicy = async (policy) => {
    setSelectedPolicy(policy);
    setActiveTab('info');
    setSimResults(null);
    setShowViewModal(true);
    try {
      const auditRes = await apiClient.get(`/governance/sod-policies/${policy.id}/audit`);
      setPolicyAudit(auditRes.data);
    } catch (err) {
      console.error("Failed to load audit trail:", err);
    }
  };

  // Simulation handler
  const runSimulation = async (id) => {
    setSimulating(true);
    setSimResults(null);
    try {
      const res = await apiClient.get(`/governance/sod-policies/${id}/simulate`);
      setSimResults(res.data);
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setSimulating(false);
    }
  };

  // Form Rule Builder handlers
  const handleAddRuleRow = () => {
    setFormData(prev => ({
      ...prev,
      rules: [...prev.rules, { application_name: '', entitlement_one: '', entitlement_two: '', condition_type: 'AND' }]
    }));
  };

  const handleRemoveRuleRow = (index) => {
    if (formData.rules.length === 1) return;
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.filter((_, idx) => idx !== index)
    }));
  };

  const handleRuleChange = (index, field, value) => {
    const updatedRules = [...formData.rules];
    updatedRules[index][field] = value;
    
    if (field === 'application_name') {
      updatedRules[index]['entitlement_one'] = '';
      updatedRules[index]['entitlement_two'] = '';
      fetchEntitlementsForApp(value);
    }

    setFormData(prev => ({ ...prev, rules: updatedRules }));
  };

  // Action handlers
  const handleOpenCreateModal = () => {
    setEditPolicyId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setModalError(null);
    setShowFormModal(true);
  };

  const handleOpenEditModal = (policy) => {
    setEditPolicyId(policy.id);
    setFormData({
      policy_name: policy.policy_name,
      description: policy.description || '',
      risk_level: policy.risk_level,
      policy_type: policy.policy_type,
      status: policy.status,
      business_owner: policy.business_owner,
      approver: policy.approver,
      rules: policy.rules.map(r => {
        fetchEntitlementsForApp(r.application_name);
        return {
          application_name: r.application_name,
          entitlement_one: r.entitlement_one,
          entitlement_two: r.entitlement_two,
          condition_type: r.condition_type
        };
      })
    });
    setFormErrors({});
    setModalError(null);
    setShowFormModal(true);
  };

  const handleDeletePolicy = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the SoD policy: "${name}"?`)) return;
    try {
      await apiClient.delete(`/governance/sod-policies/${id}`);
      showToast("Policy deleted successfully", "success");
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to delete policy", "error");
    }
  };

  const handleClonePolicy = async (id) => {
    try {
      await apiClient.post(`/governance/sod-policies/${id}/clone`);
      showToast("Policy cloned successfully as Draft", "success");
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to clone policy", "error");
    }
  };

  const handleToggleStatus = async (policy) => {
    const action = policy.status === 'ACTIVE' ? 'deactivate' : 'activate';
    try {
      await apiClient.patch(`/governance/sod-policies/${policy.id}/${action}`);
      showToast(`Policy status updated successfully`, "success");
      fetchPolicies();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update status", "error");
    }
  };

  // Form Submission
  const validateForm = () => {
    const errors = {};
    if (!formData.policy_name.trim()) errors.policy_name = "Policy name is required";
    if (!formData.business_owner.trim()) errors.business_owner = "Business owner is required";
    if (!formData.approver.trim()) errors.approver = "Approver is required";

    formData.rules.forEach((r, idx) => {
      if (!r.application_name) errors[`rule_${idx}_app`] = "Required";
      if (!r.entitlement_one) errors[`rule_${idx}_ent1`] = "Required";
      if (!r.entitlement_two) errors[`rule_${idx}_ent2`] = "Required";
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setModalError(null);
    try {
      if (editPolicyId) {
        await apiClient.put(`/governance/sod-policies/${editPolicyId}`, formData);
        showToast("Policy updated successfully", "success");
      } else {
        await apiClient.post('/governance/sod-policies', formData);
        showToast("Policy created successfully", "success");
      }
      setShowFormModal(false);
      setModalError(null);
      fetchPolicies();
    } catch (err) {
      const msg = err.response?.data?.detail || "An error occurred. Please check all fields and try again.";
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Import logic
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    const body = new FormData();
    body.append("file", importFile);
    setSubmitting(true);
    setImportStatus(null);
    try {
      const res = await apiClient.post('/governance/sod-policies/import', body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportStatus({ success: true, message: `Successfully imported ${res.data.imported} policies (Skipped: ${res.data.skipped})` });
      fetchPolicies();
    } catch (err) {
      setImportStatus({ success: false, message: err.response?.data?.detail || "Import failed" });
    } finally {
      setSubmitting(false);
    }
  };

  // Toast utils
  const showToast = (msg, type) => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Helpers
  const getRiskBadgeColor = (level) => {
    switch (level) {
      case 'CRITICAL': return 'badge-danger';
      case 'HIGH': return 'badge-warning';
      case 'MEDIUM': return 'badge-info';
      case 'LOW': return 'badge-success';
      default: return '';
    }
  };

  return (
    <div className="sod-policies-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Policies', path: '/governance/sod-policies', active: true }
      ]} />

      {/* Header and Actions Bar */}
      <div className="sod-page-header">
        <div className="header-titles">
          <h1>Segregation of Duties (SoD) Policies</h1>
          <p className="subtitle">Define, simulate, and configure rule pairs to detect identity entitlement conflicts.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowImportModal(true)} title="Import Policies from JSON">
            <Upload size={14} />
            <span>Import</span>
          </button>
          <button className="btn-secondary" onClick={handleExportCSV} title="Export to CSV">
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button className="btn-secondary" onClick={handleExportExcel} title="Export to Excel">
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
          <button className="btn-primary" onClick={handleOpenCreateModal}>
            <Plus size={14} />
            <span>Create Policy</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Dashboard */}
      <div className="sod-kpi-grid">
        <DashboardCard title="Total Policies" value={kpis.total} icon={ShieldAlert} trend="Standard IGA Scope" />
        <DashboardCard title="Active Policies" value={kpis.active} icon={CheckCircle2} status="success" />
        <DashboardCard title="Inactive Policies" value={kpis.inactive} icon={X} status="neutral" />
        <DashboardCard title="Critical Policies" value={kpis.critical} icon={AlertOctagon} status="danger" />
        <DashboardCard title="High Risk Policies" value={kpis.high} icon={ShieldAlert} status="warning" />
        <DashboardCard title="Draft Policies" value={kpis.draft} icon={Info} status="info" />
      </div>

      {/* Toast Alert Notifications */}
      {successMsg && (
        <div className="toast toast-success">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="toast toast-error">
          <AlertOctagon size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Panel */}
      <div className="sod-filter-card">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search policies by Name, Code, or Owner..." 
            value={search} 
            onChange={handleSearchChange} 
          />
        </div>
        <div className="filters-group">
          <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}>
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            {POLICY_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <button className="btn-reset" onClick={handleResetFilters}>Reset</button>
        </div>
      </div>

      {/* Bulk Action Actions Panel */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions-toolbar">
          <span className="bulk-selection-count"><b>{selectedIds.length}</b> policies selected</span>
          <div className="bulk-buttons">
            <button className="btn-bulk-action" onClick={handleBulkActivate}>Bulk Activate</button>
            <button className="btn-bulk-action" onClick={handleBulkDeactivate}>Bulk Deactivate</button>
            <button className="btn-bulk-action delete" onClick={handleBulkDelete}>Bulk Delete</button>
          </div>
        </div>
      )}

      {/* Main List Workspace */}
      <div className="sod-main-panel">
        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted">Loading Segregation of Duties policies...</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="table-empty-container">
            <ShieldAlert size={40} className="text-muted" />
            <h3>No SoD Policies Found</h3>
            <p>Modify search criteria, filter selections, or create a new policy constraint.</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="sod-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === policies.length && policies.length > 0} 
                        onChange={handleSelectAll} 
                      />
                    </th>
                    <th>Policy Code</th>
                    <th>Policy Name</th>
                    <th>Type</th>
                    <th>Risk Level</th>
                    <th>Status</th>
                    <th>Rules Count</th>
                    <th>Business Owner</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map(p => (
                    <tr key={p.id} className={selectedIds.includes(p.id) ? 'selected-row' : ''}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(p.id)} 
                          onChange={() => handleSelectRow(p.id)} 
                        />
                      </td>
                      <td className="code-cell font-mono">{p.policy_code}</td>
                      <td className="policy-name-cell">
                        <span onClick={() => handleViewPolicy(p)} className="clickable-name">{p.policy_name}</span>
                        <span className="policy-desc-subtext">{p.description || "No description provided."}</span>
                      </td>
                      <td>
                        <span className={`type-badge ${p.policy_type.toLowerCase()}`}>{p.policy_type}</span>
                      </td>
                      <td>
                        <span className={`status-badge ${getRiskBadgeColor(p.risk_level)}`}>
                          {p.risk_level}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${p.status.toLowerCase()}`}>
                          {p.status}
                        </span>
                      </td>
                      <td><b>{p.rules.length}</b> rule(s)</td>
                      <td>{p.business_owner}</td>
                      <td>
                        <div className="actions-cell-menu">
                          <button className="btn-row-action" onClick={() => handleViewPolicy(p)} title="View Policy details">
                            <Eye size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleOpenEditModal(p)} title="Edit Policy config">
                            <Edit size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleClonePolicy(p.id)} title="Clone Policy">
                            <Copy size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleToggleStatus(p)} title={p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}>
                            <RefreshCw size={13} />
                          </button>
                          <button className="btn-row-action delete" onClick={() => handleDeletePolicy(p.id, p.policy_name)} title="Delete Policy">
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
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> policies
              </span>
              
              <div className="pagination-controls">
                <button className="btn-page-step" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <span className="page-indicator">Page <b>{page}</b> of <b>{totalPages}</b></span>
                <button className="btn-page-step" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Form Drawer Modal (Create / Edit) */}
      {showFormModal && (
        <div className="modal-overlay">
          <div className="modal-card form-modal-card">
            <div className="modal-header">
              <h2>{editPolicyId ? "Edit SoD Policy" : "Create SoD Policy"}</h2>
              <button className="btn-close" onClick={() => { setShowFormModal(false); setModalError(null); }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-scroll-body">
                <div className="form-group">
                  <label>Policy Name <span className="text-danger">*</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. Finance Separation of Vendor Creation and Invoicing" 
                    value={formData.policy_name}
                    onChange={e => setFormData(prev => ({ ...prev, policy_name: e.target.value }))}
                  />
                  {formErrors.policy_name && <span className="error-text">{formErrors.policy_name}</span>}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Risk Level</label>
                    <select 
                      value={formData.risk_level}
                      onChange={e => setFormData(prev => ({ ...prev, risk_level: e.target.value }))}
                    >
                      {RISK_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Policy Type</label>
                    <select 
                      value={formData.policy_type}
                      onChange={e => setFormData(prev => ({ ...prev, policy_type: e.target.value }))}
                    >
                      {POLICY_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    >
                      {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Business Owner <span className="text-danger">*</span></label>
                    <input 
                      type="text" 
                      placeholder="e.g. Finance Governance Team" 
                      value={formData.business_owner}
                      onChange={e => setFormData(prev => ({ ...prev, business_owner: e.target.value }))}
                    />
                    {formErrors.business_owner && <span className="error-text">{formErrors.business_owner}</span>}
                  </div>
                  <div className="form-group">
                    <label>Approver <span className="text-danger">*</span></label>
                    <input 
                      type="text" 
                      placeholder="e.g. Chief Financial Officer" 
                      value={formData.approver}
                      onChange={e => setFormData(prev => ({ ...prev, approver: e.target.value }))}
                    />
                    {formErrors.approver && <span className="error-text">{formErrors.approver}</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea 
                    placeholder="Provide a detailed explanation of what this SoD conflict guards against." 
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                {/* Advanced Rule Builder Workspace */}
                <div className="rule-builder-section">
                  <div className="rule-builder-header">
                    <h3>SoD Rule Constraints</h3>
                    <button type="button" className="btn-secondary btn-sm" onClick={handleAddRuleRow}>
                      <Plus size={12} /> Add Rule Row
                    </button>
                  </div>
                  <p className="text-muted" style={{ fontSize: '12px', marginBottom: '12px' }}>
                    Select target application and the two conflicting entitlements.
                  </p>

                  <div className="rules-list-container">
                    {formData.rules.map((rule, index) => (
                      <div key={index} className="rule-builder-row">
                        <div className="row-fields">
                          <div className="field-group app-select">
                            <label>Application</label>
                            <select 
                              value={rule.application_name}
                              onChange={e => handleRuleChange(index, 'application_name', e.target.value)}
                            >
                              <option value="">Select App</option>
                              {availableApps.map(app => <option key={app} value={app}>{app}</option>)}
                            </select>
                            {formErrors[`rule_${index}_app`] && <span className="error-text">{formErrors[`rule_${index}_app`]}</span>}
                          </div>

                          <div className="field-group entitlement-select">
                            <label>Entitlement One</label>
                            <select 
                              value={rule.entitlement_one}
                              disabled={!rule.application_name}
                              onChange={e => handleRuleChange(index, 'entitlement_one', e.target.value)}
                            >
                              <option value="">Select Entitlement A</option>
                              {(appEntitlements[rule.application_name] || []).map(ent => (
                                <option key={ent} value={ent}>{ent}</option>
                              ))}
                            </select>
                            {formErrors[`rule_${index}_ent1`] && <span className="error-text">{formErrors[`rule_${index}_ent1`]}</span>}
                          </div>

                          <div className="field-group operator-select">
                            <label>Operator</label>
                            <select 
                              value={rule.condition_type}
                              onChange={e => handleRuleChange(index, 'condition_type', e.target.value)}
                            >
                              <option value="AND">AND</option>
                              <option value="OR">OR</option>
                              <option value="NOT">NOT</option>
                            </select>
                          </div>

                          <div className="field-group entitlement-select">
                            <label>Entitlement Two</label>
                            <select 
                              value={rule.entitlement_two}
                              disabled={!rule.application_name}
                              onChange={e => handleRuleChange(index, 'entitlement_two', e.target.value)}
                            >
                              <option value="">Select Entitlement B</option>
                              {(appEntitlements[rule.application_name] || []).map(ent => (
                                <option key={ent} value={ent}>{ent}</option>
                              ))}
                            </select>
                            {formErrors[`rule_${index}_ent2`] && <span className="error-text">{formErrors[`rule_${index}_ent2`]}</span>}
                          </div>
                        </div>

                        <button 
                          type="button" 
                          className="btn-icon-danger" 
                          disabled={formData.rules.length === 1}
                          onClick={() => handleRemoveRuleRow(index)}
                          title="Remove Rule Row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
                {modalError && (
                  <div style={{
                    width: '100%',
                    backgroundColor: 'var(--danger-light)',
                    color: 'var(--danger)',
                    border: '1px solid var(--danger)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertOctagon size={14} />
                    {modalError}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
                  <button type="button" className="btn-secondary" onClick={() => { setShowFormModal(false); setModalError(null); }}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Saving..." : editPolicyId ? "Save Changes" : "Create Policy"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details View Drawer / Modal */}
      {showViewModal && selectedPolicy && (
        <div className="modal-overlay">
          <div className="modal-card view-modal-card">
            <div className="modal-header">
              <div className="view-title-block">
                <span className="font-mono text-muted">{selectedPolicy.policy_code}</span>
                <h2>{selectedPolicy.policy_name}</h2>
              </div>
              <button className="btn-close" onClick={() => setShowViewModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-tabs">
              <button className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
                General Info
              </button>
              <button className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
                Rules ({selectedPolicy.rules.length})
              </button>
              <button className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                Audit Trail
              </button>
              <button className={`tab-btn ${activeTab === 'simulation' ? 'active' : ''}`} onClick={() => { setActiveTab('simulation'); runSimulation(selectedPolicy.id); }}>
                Impact Simulation
              </button>
            </div>

            <div className="view-scroll-body">
              {activeTab === 'info' && (
                <div className="info-tab-layout">
                  <div className="info-grid">
                    <div className="info-cell">
                      <span className="info-label">Risk Level</span>
                      <span className={`status-badge ${getRiskBadgeColor(selectedPolicy.risk_level)}`}>
                        {selectedPolicy.risk_level}
                      </span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Status</span>
                      <span className={`status-badge status-${selectedPolicy.status.toLowerCase()}`}>
                        {selectedPolicy.status}
                      </span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Policy Type</span>
                      <span className={`type-badge ${selectedPolicy.policy_type.toLowerCase()}`}>{selectedPolicy.policy_type}</span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Version</span>
                      <span>v{selectedPolicy.version}</span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Business Owner</span>
                      <span>{selectedPolicy.business_owner}</span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Approver</span>
                      <span>{selectedPolicy.approver}</span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Created By</span>
                      <span>{selectedPolicy.created_by}</span>
                    </div>
                    <div className="info-cell">
                      <span className="info-label">Created Date</span>
                      <span>{formatLocalDateTime(selectedPolicy.created_date)}</span>
                    </div>
                  </div>

                  <div className="description-box">
                    <h4>Description</h4>
                    <p>{selectedPolicy.description || "No description provided."}</p>
                  </div>
                </div>
              )}

              {activeTab === 'rules' && (
                <div className="rules-tab-layout">
                  <div className="rules-timeline">
                    {selectedPolicy.rules.map((rule, idx) => (
                      <div key={rule.id} className="rule-detail-card">
                        <div className="rule-badge">Rule {idx + 1}</div>
                        <div className="rule-expression">
                          <span className="app-tag">{rule.application_name}</span>
                          <div className="logic-expression">
                            <span className="ent-name">{rule.entitlement_one}</span>
                            <span className="logic-op">{rule.condition_type}</span>
                            <span className="ent-name">{rule.entitlement_two}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'audit' && (
                <div className="audit-tab-layout">
                  {policyAudit.length === 0 ? (
                    <p className="text-muted">No audit events logged for this policy.</p>
                  ) : (
                    <div className="audit-timeline">
                      {policyAudit.map(aud => (
                        <div key={aud.id} className="audit-event">
                          <div className="audit-header">
                            <div className="audit-action-tag">{aud.action}</div>
                            <span className="audit-time">{formatLocalDateTime(aud.timestamp)}</span>
                          </div>
                          <p className="audit-user">Performed by: <b>{aud.performed_by}</b></p>
                          {aud.new_value && (
                            <div className="audit-details font-mono">
                              {aud.new_value}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'simulation' && (
                <div className="simulation-tab-layout">
                  {simulating ? (
                    <div className="table-loading-container">
                      <div className="spinner-element"></div>
                      <p className="text-muted">Evaluating rules against database entitlements...</p>
                    </div>
                  ) : simResults ? (
                    <div className="simulation-results">
                      <div className="simulation-banner">
                        <Play size={18} />
                        <div>
                          <h4>Simulation Complete</h4>
                          <p>Currently, <b>{simResults.violators_count}</b> user(s) violate this SoD policy.</p>
                        </div>
                      </div>

                      {simResults.violators_count > 0 && (
                        <div className="violators-list">
                          <h4>Violating Identities</h4>
                          <div className="table-wrapper">
                            <table className="simulation-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Employee ID</th>
                                  <th>Email</th>
                                  <th>Department</th>
                                </tr>
                              </thead>
                              <tbody>
                                {simResults.violators.map(v => (
                                  <tr key={v.id}>
                                    <td><b>{v.name}</b></td>
                                    <td>{v.employee_id}</td>
                                    <td>{v.email}</td>
                                    <td>{v.department || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted">Failed to load simulation results.</p>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowViewModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-card import-modal-card">
            <div className="modal-header">
              <h2>Import SoD Policies</h2>
              <button className="btn-close" onClick={() => setShowImportModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleImportSubmit}>
              <div className="form-scroll-body">
                <div className="form-group">
                  <label>Select JSON File <span className="text-danger">*</span></label>
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={e => setImportFile(e.target.files[0])}
                  />
                  <p className="text-muted" style={{ fontSize: '11px', marginTop: '6px' }}>
                    Upload a JSON file containing an array of policies with rules mapping logic.
                  </p>
                </div>

                {importStatus && (
                  <div className={`import-status-banner ${importStatus.success ? 'success' : 'error'}`}>
                    {importStatus.success ? <CheckCircle2 size={16} /> : <AlertOctagon size={16} />}
                    <span>{importStatus.message}</span>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting || !importFile}>
                  {submitting ? "Importing..." : "Upload & Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoDPolicies;
