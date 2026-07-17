import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, Search, Download, Trash2, CheckCircle2, 
  AlertOctagon, X, Eye, ChevronLeft, ChevronRight, Play,
  FileSpreadsheet, Filter, CheckCircle, RefreshCw, FileText,
  UserCheck, ShieldAlert
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import './SoDExceptions.css';

// API Client
import { apiClient } from '../../services/dashboardService';
import { formatLocalDate } from '../../utils/dateUtils';

const EXCEPTION_TEMPLATES = [
  {
    name: "Custom (Empty)",
    justification: "",
    controls: "",
    type: "TEMPORARY"
  },
  {
    name: "Temporary Contractor / Vendor Support Authorization",
    justification: "Temporary administrative support required during systems upgrade cycle.",
    controls: "All contractor logins require secondary manager approval before executing write operations.",
    type: "TEMPORARY"
  },
  {
    name: "Quarter-End Financial Adjustment Authorization",
    justification: "Bypass required for quarter-end reporting entries and account reconciliation reconciler.",
    controls: "Daily reconciliation audits performed on adjustment log overrides. Revoked automatically post close.",
    type: "TEMPORARY"
  },
  {
    name: "Emergency Production Hotfix Authorization",
    justification: "Emergency production system developer bypass to apply high-severity software patches.",
    controls: "Screen recordings activated on session logins. Revoked within 48 hours.",
    type: "TEMPORARY"
  }
];

const SoDExceptions = () => {
  const navigate = useNavigate();

  // Search & Paging
  const [exceptions, setExceptions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');

  // States
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // KPIs & charts
  const [kpis, setKpis] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    active: 0,
    expired: 0,
    rejected: 0,
    revoked: 0
  });

  const [charts, setCharts] = useState({
    status: {},
    department: {},
    application: {},
    type: {}
  });

  // Create Exception dialog
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [createFields, setCreateFields] = useState({
    policy_id: '',
    user_id: '',
    employee_id: '',
    username: '',
    display_name: '',
    department: '',
    application_name: '',
    violation_id: '',
    exception_type: 'TEMPORARY',
    business_justification: '',
    compensating_controls: '',
    expiry_date: '',
    risk_acceptance: false
  });
  
  const [policies, setPolicies] = useState([]);
  const [users, setUsers] = useState([]);
  const [violations, setViolations] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch lookups
  const fetchLookups = async () => {
    try {
      const polRes = await apiClient.get('/governance/policies');
      setPolicies(polRes.data.policies || polRes.data);
      const userRes = await apiClient.get('/identities');
      setUsers(userRes.data.identities || userRes.data);
      const violRes = await apiClient.get('/governance/violations');
      setViolations(violRes.data.violations || violRes.data);
    } catch (err) {
      console.error("Failed to load request form lookup objects:", err);
    }
  };

  const fetchExceptions = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        page,
        limit,
        search: search || undefined,
        exception_type: typeFilter || undefined,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        application: appFilter || undefined
      };
      const res = await apiClient.get('/governance/exceptions', { params });
      setExceptions(res.data.exceptions);
      setTotal(res.data.total);
      setTotalPages(Math.ceil(res.data.total / limit));

      const kpiRes = await apiClient.get('/governance/exceptions/dashboard');
      setKpis(kpiRes.data.kpis);
      setCharts(kpiRes.data.charts);
    } catch (err) {
      setErrorMsg("Failed to retrieve SoD exception authorizations.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, typeFilter, statusFilter, deptFilter, appFilter]);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const qSearch = queryParams.get('search');
    const qStatus = queryParams.get('status');
    const qType = queryParams.get('exception_type');
    const qDept = queryParams.get('department');
    const qApp = queryParams.get('application');

    if (qSearch) setSearch(qSearch);
    if (qStatus) setStatusFilter(qStatus);
    if (qType) setTypeFilter(qType);
    if (qDept) setDeptFilter(qDept);
    if (qApp) setAppFilter(qApp);
  }, []);

  useEffect(() => {
    fetchExceptions();
  }, [fetchExceptions]);

  useEffect(() => {
    if (showCreate) {
      fetchLookups();
    }
  }, [showCreate]);

  // Handle template selection
  const handleTemplateChange = (idx) => {
    setSelectedTemplateIdx(idx);
    const template = EXCEPTION_TEMPLATES[idx];
    setCreateFields(prev => ({
      ...prev,
      business_justification: template.justification,
      compensating_controls: template.controls,
      exception_type: template.type
    }));
  };

  // Pre-fill fields when selecting violation
  const handleViolationSelect = (violationId) => {
    const v = violations.find(x => x.id === violationId);
    if (!v) return;
    setCreateFields(prev => ({
      ...prev,
      violation_id: v.id,
      policy_id: v.policy_id,
      user_id: v.user_id,
      employee_id: v.employee_id || `EMP-${v.user_id}`,
      username: v.username,
      display_name: v.display_name,
      department: v.department || '',
      application_name: v.application_name
    }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createFields.business_justification.trim()) {
      showToast("Business justification is required.", "error");
      return;
    }
    if (createFields.exception_type === "TEMPORARY" && !createFields.expiry_date) {
      showToast("Expiry date is required for temporary exceptions.", "error");
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        violation_id: createFields.violation_id || null,
        policy_id: createFields.policy_id,
        user_id: parseInt(createFields.user_id),
        employee_id: createFields.employee_id,
        username: createFields.username,
        department: createFields.department || null,
        application_name: createFields.application_name,
        exception_type: createFields.exception_type,
        business_justification: createFields.business_justification,
        compensating_controls: createFields.compensating_controls || null,
        expiry_date: createFields.exception_type === "TEMPORARY" ? createFields.expiry_date : null,
        risk_acceptance: createFields.risk_acceptance
      };
      await apiClient.post('/governance/exceptions', payload);
      showToast("Exception request submitted successfully.", "success");
      setShowCreate(false);
      // Reset fields
      setCreateFields({
        policy_id: '', user_id: '', employee_id: '', username: '', display_name: '',
        department: '', application_name: '', violation_id: '', exception_type: 'TEMPORARY',
        business_justification: '', compensating_controls: '', expiry_date: '', risk_acceptance: false
      });
      setSelectedTemplateIdx(0);
      fetchExceptions();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to submit exception request.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk options
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(exceptions.map(x => x.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (actionType) => {
    if (!window.confirm(`Are you sure you want to bulk ${actionType} the ${selectedIds.length} selected requests?`)) return;
    try {
      await apiClient.post(`/governance/exceptions/bulk-${actionType}`, { ids: selectedIds });
      showToast(`Selected exception requests bulk-${actionType}ed successfully.`, "success");
      setSelectedIds([]);
      fetchExceptions();
    } catch (err) {
      showToast(err.response?.data?.detail || "Bulk action failed.", "error");
    }
  };

  const showToast = (msg, type) => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status.toUpperCase()) {
      case 'PENDING': return 'status-review';
      case 'UNDER_REVIEW': return 'status-review';
      case 'APPROVED': case 'ACTIVE': return 'status-mitigated';
      case 'EXPIRED': return 'status-open';
      case 'REJECTED': return 'status-open';
      case 'REVOKED': return 'status-closed';
      default: return '';
    }
  };

  const handleExportCSV = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/exceptions/export/csv`, '_blank');
  };

  const handleExportExcel = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/exceptions/export/excel`, '_blank');
  };

  return (
    <div className="sod-exceptions-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Exceptions', path: '/governance/exceptions', active: true }
      ]} />

      {/* Header */}
      <div className="sod-page-header">
        <div className="header-titles">
          <h1>SoD Exception Management</h1>
          <p className="subtitle">Submit, approve, or revoke temporal and permanent compliance overrides for SoD policies.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExportCSV} title="Export CSV">
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button className="btn-secondary" onClick={handleExportExcel} title="Export Excel">
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Play size={14} />
            <span>Request Exception</span>
          </button>
        </div>
      </div>

      {/* KPIs Summary Cards */}
      <div className="sod-kpi-grid">
        <DashboardCard title="Total Exceptions" value={kpis.total} icon={ShieldCheck} trend="Submitted overall" />
        <DashboardCard title="Pending Approvals" value={kpis.pending} icon={RefreshCw} status="warning" />
        <DashboardCard title="Active Exceptions" value={kpis.active} icon={CheckCircle2} status="success" />
        <DashboardCard title="Expired Exceptions" value={kpis.expired} icon={AlertOctagon} status="danger" />
        <DashboardCard title="Rejected Requests" value={kpis.rejected} icon={X} status="neutral" />
      </div>

      {/* Alerts */}
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

      {/* Charts Grid */}
      <div className="dashboard-visuals-grid">
        {/* Status Distribution */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Exceptions by Status</h3>
            <p>Active exceptions status distribution</p>
          </div>
          <div className="card-body donut-chart-body">
            <div className="custom-donut-bars">
              {Object.entries(charts.status || {}).map(([status, count]) => {
                const pct = kpis.total > 0 ? (count / kpis.total) * 100 : 0;
                return (
                  <div key={status} className="donut-bar-row">
                    <div className="donut-bar-label">
                      <span>{status.replace('_', ' ')}</span>
                      <span>{count} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="donut-bar-container">
                      <div className={`donut-bar-fill ${status === 'ACTIVE' ? 'low' : (status === 'PENDING' ? 'high' : 'critical')}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Department distributions */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Top Exception Departments</h3>
            <p>Exceptions allocated by division</p>
          </div>
          <div className="card-body bar-chart-body">
            {Object.entries(charts.department || {}).slice(0, 4).map(([dept, count]) => {
              const widthPct = kpis.total > 0 ? (count / kpis.total) * 100 : 0;
              return (
                <div key={dept} className="bar-row">
                  <div className="bar-row-label">
                    <span>{dept}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-container">
                    <div className="bar-fill blue" style={{ width: `${widthPct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Temporary vs Permanent */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Temporary vs Permanent</h3>
            <p>Allocations based on duration types</p>
          </div>
          <div className="card-body bar-chart-body">
            {Object.entries(charts.type || {}).map(([t, count]) => {
              const widthPct = kpis.total > 0 ? (count / kpis.total) * 100 : 0;
              return (
                <div key={t} className="bar-row">
                  <div className="bar-row-label">
                    <span>{t}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-container">
                    <div className={`bar-fill ${t === 'TEMPORARY' ? 'purple' : 'blue'}`} style={{ width: `${widthPct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="sod-filter-card">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search by User, Employee ID, Exception #, Manager, Policy Code..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          />
        </div>
        <div className="filters-group">
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            <option value="TEMPORARY">TEMPORARY</option>
            <option value="PERMANENT">PERMANENT</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="REVOKED">REVOKED</option>
          </select>
          <input 
            type="text" 
            placeholder="Filter Department..." 
            value={deptFilter} 
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            style={{ width: '140px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          />
          <button className="btn-reset" onClick={() => { setSearch(''); setTypeFilter(''); setStatusFilter(''); setDeptFilter(''); setAppFilter(''); setPage(1); }}>
            Reset
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions-toolbar">
          <span className="bulk-selection-count"><b>{selectedIds.length}</b> request(s) selected</span>
          <div className="bulk-buttons">
            <button className="btn-bulk-action" onClick={() => handleBulkAction('approve')}>Approve Selected</button>
            <button className="btn-bulk-action" onClick={() => handleBulkAction('reject')}>Reject Selected</button>
            <button className="btn-bulk-action delete" onClick={() => handleBulkAction('revoke')}>Revoke Selected</button>
          </div>
        </div>
      )}

      {/* Table grid */}
      <div className="sod-main-panel">
        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted">Loading exceptions logs...</p>
          </div>
        ) : exceptions.length === 0 ? (
          <div className="table-empty-container">
            <CheckCircle size={40} style={{ color: 'var(--success)' }} />
            <h3>No Exception Records Found</h3>
            <p>Congratulations! No policy override records match filters.</p>
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
                        checked={selectedIds.length === exceptions.length && exceptions.length > 0} 
                        onChange={handleSelectAll} 
                      />
                    </th>
                    <th>Exception #</th>
                    <th>User</th>
                    <th>Department</th>
                    <th>Matched Violation</th>
                    <th>Connected App</th>
                    <th>Type</th>
                    <th>AI Threat Analysis</th>
                    <th>Status / SLA</th>
                    <th>Expiry Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map(exc => (
                    <tr key={exc.id} className={selectedIds.includes(exc.id) ? 'selected-row' : ''}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(exc.id)} 
                          onChange={() => handleSelectRow(exc.id)} 
                        />
                      </td>
                      <td>
                        <span className="clickable-name" onClick={() => navigate(`/governance/exceptions/${exc.id}`)}>
                          {exc.exception_number}
                        </span>
                      </td>
                      <td>
                        <div className="user-info-cell">
                          <b>{exc.username}</b>
                          <span className="text-muted font-mono" style={{ fontSize: '11px' }}>{exc.employee_id}</span>
                        </div>
                      </td>
                      <td>{exc.department || '-'}</td>
                      <td>
                        <div className="policy-info-cell">
                          {exc.violation_id ? (
                            <span className="text-danger flex-align-center" style={{ gap: '4px', cursor: 'pointer' }} onClick={() => navigate(`/governance/violations/${exc.violation_id}`)}>
                              <ShieldAlert size={12} /> View Violation
                            </span>
                          ) : (
                            <span className="text-muted">Ad-Hoc Request</span>
                          )}
                        </div>
                      </td>
                      <td>{exc.application_name}</td>
                      <td>
                        <span className={`type-badge ${exc.exception_type.toLowerCase()}`}>{exc.exception_type}</span>
                      </td>
                      <td>
                        <div className="user-info-cell">
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: exc.ai_risk_score > 70 ? 'var(--danger)' : 'var(--text-main)' }}>
                            AI Risk: {exc.ai_risk_score}%
                          </span>
                          <span className="text-muted" style={{ fontSize: '10px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exc.ai_recommendation}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="user-info-cell">
                          <span className={`status-badge ${getStatusBadgeClass(exc.status)}`}>
                            {exc.status.replace('_', ' ')}
                          </span>
                          {exc.is_sla_overdue && (
                            <span className="text-danger" style={{ fontSize: '10px', fontWeight: 'bold' }}>
                              ● SLA OVERDUE
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {exc.expiry_date ? formatLocalDate(exc.expiry_date) : 'PERMANENT'}
                      </td>
                      <td>
                        <button className="btn-row-action" onClick={() => navigate(`/governance/exceptions/${exc.id}`)} title="View diagnostics">
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination-footer">
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> exceptions
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

      {/* Create Request Modal */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal-card import-modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2>Request SoD Policy Exception</h2>
              <button className="btn-close" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="form-scroll-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px' }}>
                
                {/* Template Selection Selector */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Exception Design Template</label>
                  <select 
                    value={selectedTemplateIdx} 
                    onChange={e => handleTemplateChange(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  >
                    {EXCEPTION_TEMPLATES.map((t, idx) => (
                      <option key={idx} value={idx}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Violation lookup link */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Link Active Violation</label>
                  <select 
                    value={createFields.violation_id} 
                    onChange={e => handleViolationSelect(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  >
                    <option value="">-- Direct Ad-Hoc Request (No Violation Link) --</option>
                    {violations.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.username} - {v.policy_code} ({v.severity})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row-two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Target Policy <span className="text-danger">*</span></label>
                    <select 
                      value={createFields.policy_id} 
                      onChange={e => setCreateFields({...createFields, policy_id: e.target.value})}
                      required
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    >
                      <option value="">Select Policy</option>
                      {policies.map(p => <option key={p.id} value={p.id}>{p.policy_code} - {p.policy_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Target User Identity <span className="text-danger">*</span></label>
                    <select 
                      value={createFields.user_id} 
                      onChange={e => {
                        const u = users.find(x => x.id === parseInt(e.target.value));
                        setCreateFields({
                          ...createFields,
                          user_id: e.target.value,
                          username: u?.email || '',
                          display_name: u?.display_name || '',
                          employee_id: u?.employee_id || '',
                          department: u?.department || ''
                        });
                      }}
                      required
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    >
                      <option value="">Select Identity</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row-two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Connected Application <span className="text-danger">*</span></label>
                    <input 
                      type="text" 
                      placeholder="e.g. SAP Production ERP" 
                      value={createFields.application_name}
                      onChange={e => setCreateFields({...createFields, application_name: e.target.value})}
                      required
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Duration Type</label>
                    <select 
                      value={createFields.exception_type} 
                      onChange={e => setCreateFields({...createFields, exception_type: e.target.value})}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    >
                      <option value="TEMPORARY">TEMPORARY (Timebound)</option>
                      <option value="PERMANENT">PERMANENT (Subject to Recertification)</option>
                    </select>
                  </div>
                </div>

                {createFields.exception_type === 'TEMPORARY' && (
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Temporary Expiry Date <span className="text-danger">*</span></label>
                    <input 
                      type="datetime-local" 
                      value={createFields.expiry_date}
                      onChange={e => setCreateFields({...createFields, expiry_date: e.target.value})}
                      required
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Business Justification Description <span className="text-danger">*</span></label>
                  <textarea 
                    placeholder="Provide full compliance and audit logs reasoning for access bypass..." 
                    rows={3}
                    value={createFields.business_justification}
                    onChange={e => setCreateFields({...createFields, business_justification: e.target.value})}
                    required
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Compensating Controls</label>
                  <textarea 
                    placeholder="Identify administrative barriers or transaction review logs..." 
                    rows={2}
                    value={createFields.compensating_controls}
                    onChange={e => setCreateFields({...createFields, compensating_controls: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                  />
                </div>

                <div className="form-group fp-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                  <input 
                    type="checkbox" 
                    id="riskAccept"
                    checked={createFields.risk_acceptance} 
                    onChange={e => setCreateFields({...createFields, risk_acceptance: e.target.checked})} 
                  />
                  <label htmlFor="riskAccept" style={{ cursor: 'pointer', fontSize: '13px' }}>
                    I acknowledge that I accept the security risks associated with this policy exception request.
                  </label>
                </div>

              </div>
              <div className="modal-footer" style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Exception"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoDExceptions;
