import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, Search, Download, Trash2, CheckCircle2, 
  AlertOctagon, X, Eye, ChevronLeft, ChevronRight, Play,
  FileSpreadsheet, Filter, CheckCircle, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import './SoDViolations.css';

// API Client
import { apiClient } from '../../services/dashboardService';

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["OPEN", "UNDER_REVIEW", "MITIGATED", "EXCEPTION_APPROVED", "CLOSED"];

const SoDViolations = () => {
  const navigate = useNavigate();
  
  // List & pagination
  const [violations, setViolations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Advanced filters
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  
  // State
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Stats and charts distributions
  const [kpis, setKpis] = useState({
    total: 0,
    open: 0,
    critical: 0,
    high_risk_users: 0,
    resolved: 0,
    scans_today: 0
  });
  
  const [charts, setCharts] = useState({
    severity: {},
    department: {},
    application: {}
  });

  // Bulk dialogs
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [submittingBulk, setSubmittingBulk] = useState(false);

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        page,
        limit,
        search: search || undefined,
        risk_level: sevFilter || undefined,
        status: statusFilter || undefined,
        department: deptFilter || undefined,
        application: appFilter || undefined
      };
      
      const res = await apiClient.get('/governance/violations', { params });
      setViolations(res.data.violations);
      setTotal(res.data.total);
      setTotalPages(Math.ceil(res.data.total / limit));
      setKpis(res.data.kpis);
      setCharts(res.data.charts);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Failed to load SoD violations dashboard.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, sevFilter, statusFilter, deptFilter, appFilter]);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const qSearch = queryParams.get('search');
    const qRiskLevel = queryParams.get('risk_level');
    const qStatus = queryParams.get('status');
    const qDept = queryParams.get('department');
    const qApp = queryParams.get('application');

    if (qSearch) setSearch(qSearch);
    if (qRiskLevel) setSevFilter(qRiskLevel);
    if (qStatus) setStatusFilter(qStatus);
    if (qDept) setDeptFilter(qDept);
    if (qApp) setAppFilter(qApp);
  }, []);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // Bulk Actions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(violations.map(v => v.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkClose = async () => {
    if (!window.confirm(`Are you sure you want to close the ${selectedIds.length} selected violations?`)) return;
    try {
      await apiClient.post('/governance/violations/bulk-close', selectedIds);
      showToast("Selected violations closed successfully", "success");
      setSelectedIds([]);
      fetchViolations();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to bulk close violations", "error");
    }
  };

  const handleBulkAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assigneeName.trim()) return;
    setSubmittingBulk(true);
    try {
      await apiClient.post('/governance/violations/bulk-assign', selectedIds, {
        params: { assignee: assigneeName }
      });
      showToast(`Assigned selected violations to ${assigneeName}`, "success");
      setSelectedIds([]);
      setShowBulkAssign(false);
      setAssigneeName('');
      fetchViolations();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to assign violations", "error");
    } finally {
      setSubmittingBulk(false);
    }
  };

  // Direct rescan triggers
  const handleRescanUser = async (userId) => {
    try {
      await apiClient.post(`/governance/violations/rescan-user/${userId}`);
      showToast("Successfully rescanned violating user assignments", "success");
      fetchViolations();
    } catch (err) {
      showToast(err.response?.data?.detail || "Rescan failed", "error");
    }
  };

  const handleRescanPolicy = async (policyId) => {
    try {
      await apiClient.post(`/governance/violations/rescan-policy/${policyId}`);
      showToast("Successfully rescanned policy conflict matches", "success");
      fetchViolations();
    } catch (err) {
      showToast(err.response?.data?.detail || "Rescan failed", "error");
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

  // Color mappings
  const getSeverityBadgeClass = (sev) => {
    switch (sev.toUpperCase()) {
      case 'CRITICAL': return 'badge-danger';
      case 'HIGH': return 'badge-warning';
      case 'MEDIUM': return 'badge-info';
      case 'LOW': return 'badge-success';
      default: return '';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status.toUpperCase()) {
      case 'OPEN': return 'status-open';
      case 'UNDER_REVIEW': return 'status-review';
      case 'MITIGATED': return 'status-mitigated';
      case 'EXCEPTION_APPROVED': return 'status-exception';
      case 'CLOSED': return 'status-closed';
      default: return '';
    }
  };

  // Export URL triggers
  const handleExportCSV = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/violations/export/csv`, '_blank');
  };

  const handleExportExcel = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/violations/export/excel`, '_blank');
  };

  return (
    <div className="sod-violations-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Violations', path: '/governance/violations', active: true }
      ]} />

      {/* Header Panel */}
      <div className="sod-page-header">
        <div className="header-titles">
          <h1>SoD Violations Cockpit</h1>
          <p className="subtitle">Audit and review segregation of duties conflicts. Resolve, assign, or approve exceptions.</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => navigate('/governance/scan-history')}>
            <Play size={14} />
            <span>Scan History</span>
          </button>
          <button className="btn-secondary" onClick={handleExportCSV} title="Export to CSV">
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button className="btn-secondary" onClick={handleExportExcel} title="Export to Excel">
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* Summary Stats cards */}
      <div className="sod-kpi-grid">
        <DashboardCard 
          title="Total Violations" 
          value={kpis.total} 
          icon={ShieldAlert} 
          trend="Lifetime detected"
          onClick={() => { setSevFilter(''); setStatusFilter(''); setDeptFilter(''); setAppFilter(''); setSearch(''); setPage(1); }} 
        />
        <DashboardCard 
          title="Open Violations" 
          value={kpis.open} 
          icon={AlertOctagon} 
          status="danger"
          onClick={() => { setStatusFilter('OPEN'); setSevFilter(''); setPage(1); }} 
        />
        <DashboardCard 
          title="Critical Violations" 
          value={kpis.critical} 
          icon={AlertOctagon} 
          status="warning"
          onClick={() => { setSevFilter('CRITICAL'); setStatusFilter('OPEN'); setPage(1); }} 
        />
        <DashboardCard 
          title="High Risk Users" 
          value={kpis.high_risk_users} 
          icon={ShieldAlert} 
          status="info"
          onClick={() => { setSearch(''); setSevFilter('CRITICAL'); setPage(1); }} 
        />
        <DashboardCard 
          title="Resolved (Auto/Manual)" 
          value={kpis.resolved} 
          icon={CheckCircle2} 
          status="success"
          onClick={() => { setStatusFilter('MITIGATED'); setSevFilter(''); setPage(1); }} 
        />
        <DashboardCard 
          title="Scans Executed Today" 
          value={kpis.scans_today} 
          icon={RefreshCw} 
          status="neutral"
          onClick={() => { setStatusFilter(''); setSevFilter(''); setPage(1); }} 
        />
      </div>

      {/* Notifications banner */}
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

      {/* Multi-Dimensional Dashboard Charts widgets */}
      <div className="dashboard-visuals-grid">
        {/* Severity chart */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Violations by Severity</h3>
            <p>Active open conflicts</p>
          </div>
          <div className="card-body donut-chart-body">
            <div className="chart-wrapper">
              {/* Custom visual horizontal donut bars */}
              <div className="custom-donut-bars">
                {Object.entries(charts.severity).map(([sev, count]) => {
                  const pct = kpis.open > 0 ? (count / kpis.open) * 100 : 0;
                  return (
                    <div 
                      key={sev} 
                      className="donut-bar-row clickable-bar-row" 
                      onClick={() => { setSevFilter(sev); setPage(1); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="donut-bar-label">
                        <span>{sev}</span>
                        <span>{count} ({Math.round(pct)}%)</span>
                      </div>
                      <div className="donut-bar-container">
                        <div className={`donut-bar-fill ${sev.toLowerCase()}`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Top Department distributions */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Top Violating Departments</h3>
            <p>Department distribution overview</p>
          </div>
          <div className="card-body bar-chart-body">
            {Object.entries(charts.department).slice(0, 4).map(([dept, count]) => {
              const widthPct = kpis.open > 0 ? (count / kpis.open) * 100 : 0;
              return (
                <div 
                  key={dept} 
                  className="bar-row clickable-bar-row" 
                  onClick={() => { setDeptFilter(dept); setPage(1); }}
                  style={{ cursor: 'pointer' }}
                >
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

        {/* Top Application distributions */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Top Violated Applications</h3>
            <p>Conflicts by connected apps</p>
          </div>
          <div className="card-body bar-chart-body">
            {Object.entries(charts.application).slice(0, 4).map(([app, count]) => {
              const widthPct = kpis.open > 0 ? (count / kpis.open) * 100 : 0;
              return (
                <div 
                  key={app} 
                  className="bar-row clickable-bar-row" 
                  onClick={() => { setAppFilter(app); setPage(1); }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="bar-row-label">
                    <span>{app}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="bar-container">
                    <div className="bar-fill purple" style={{ width: `${widthPct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Advanced Filters Card */}
      <div className="sod-filter-card">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search by User, Manager, Employee ID, Policy Code..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          />
        </div>
        <div className="filters-group">
          <select value={sevFilter} onChange={(e) => { setSevFilter(e.target.value); setPage(1); }}>
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <input 
            type="text" 
            placeholder="Filter Department..." 
            value={deptFilter} 
            onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            style={{ width: '140px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          />
          <input 
            type="text" 
            placeholder="Filter Application..." 
            value={appFilter} 
            onChange={(e) => { setAppFilter(e.target.value); setPage(1); }}
            style={{ width: '140px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          />
          <button className="btn-reset" onClick={() => { setSearch(''); setSevFilter(''); setStatusFilter(''); setDeptFilter(''); setAppFilter(''); setPage(1); }}>
            Reset
          </button>
        </div>
      </div>

      {/* Bulk Action Actions Panel */}
      {selectedIds.length > 0 && (
        <div className="bulk-actions-toolbar">
          <span className="bulk-selection-count"><b>{selectedIds.length}</b> violations selected</span>
          <div className="bulk-buttons">
            <button className="btn-bulk-action" onClick={() => setShowBulkAssign(true)}>Assign Reviewer</button>
            <button className="btn-bulk-action delete" onClick={handleBulkClose}>Bulk Close</button>
          </div>
        </div>
      )}

      {/* Main Grid Workspace Table */}
      <div className="sod-main-panel">
        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted">Loading SoD violations...</p>
          </div>
        ) : violations.length === 0 ? (
          <div className="table-empty-container">
            <CheckCircle size={40} className="text-muted" style={{ color: 'var(--success)' }} />
            <h3>No Violations Found</h3>
            <p>Congratulations! No conflicts detected or mismatching filter selection.</p>
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
                        checked={selectedIds.length === violations.length && violations.length > 0} 
                        onChange={handleSelectAll} 
                      />
                    </th>
                    <th>User</th>
                    <th>Department</th>
                    <th>Policy Conflict</th>
                    <th>Connected App</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Detected Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map(v => (
                    <tr key={v.id} className={selectedIds.includes(v.id) ? 'selected-row' : ''}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(v.id)} 
                          onChange={() => handleSelectRow(v.id)} 
                        />
                      </td>
                      <td>
                        <div className="user-info-cell">
                          <span className="clickable-name" onClick={() => navigate(`/governance/violations/${v.id}`)}>
                            {v.display_name || v.username}
                          </span>
                          <span className="text-muted font-mono" style={{ fontSize: '11px' }}>{v.username}</span>
                        </div>
                      </td>
                      <td>{v.department || '-'}</td>
                      <td>
                        <div className="policy-info-cell">
                          <b>{v.policy_code}</b>
                          <span className="text-muted">{v.policy_name}</span>
                        </div>
                      </td>
                      <td>{v.application_name}</td>
                      <td>
                        <span className={`status-badge ${getSeverityBadgeClass(v.severity)}`}>
                          {v.severity} ({v.risk_score})
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(v.status)}`}>
                          {v.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(v.detected_date).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="actions-cell-menu">
                          <button className="btn-row-action" onClick={() => navigate(`/governance/violations/${v.id}`)} title="View violation evidence timeline">
                            <Eye size={13} />
                          </button>
                          <button className="btn-row-action" onClick={() => handleRescanUser(v.user_id)} title="Immediate user scan">
                            <RefreshCw size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination-footer">
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> violations
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

      {/* Bulk Assign Modal overlay */}
      {showBulkAssign && (
        <div className="modal-overlay">
          <div className="modal-card import-modal-card">
            <div className="modal-header">
              <h2>Assign Reviewer</h2>
              <button className="btn-close" onClick={() => setShowBulkAssign(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleBulkAssignSubmit}>
              <div className="form-scroll-body">
                <div className="form-group">
                  <label>Reviewer Email/Username <span className="text-danger">*</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. security_auditor@ranalyzer.com" 
                    value={assigneeName}
                    onChange={(e) => setAssigneeName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowBulkAssign(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submittingBulk}>
                  {submittingBulk ? "Assigning..." : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoDViolations;
