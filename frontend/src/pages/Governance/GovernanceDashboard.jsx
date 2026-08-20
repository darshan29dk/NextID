import React, { useState, useEffect, useCallback } from 'react';
import { 
  Download, FileSpreadsheet, RefreshCw, Clock, Search,
  Play, StopCircle, CheckCircle2, AlertOctagon, HelpCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { KpiCard, ScoreWidget } from './DashboardWidgets';
import { SeverityDonut, DepartmentBarChart, ApplicationBarChart, TrendLineChart } from './RiskCharts';
import RiskHeatmap from './RiskHeatmap';
import ExecutiveSummary from './ExecutiveSummary';
import './GovernanceDashboard.css';

// API Client
import { apiClient } from '../../services/dashboardService';

const REFRESH_INTERVALS = [
  { label: 'Manual Only', value: 0 },
  { label: 'Every 30s', value: 30000 },
  { label: 'Every 60s', value: 60000 },
  { label: 'Every 5m', value: 300000 }
];

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["OPEN", "UNDER_REVIEW", "MITIGATED", "EXCEPTION_APPROVED", "CLOSED"];

const GovernanceDashboard = () => {
  const navigate = useNavigate();

  // Filters
  const [deptFilter, setDeptFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto refresh interval setting
  const [refreshMs, setRefreshMs] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // States
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchDashboard = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        department: deptFilter || undefined,
        application: appFilter || undefined,
        risk_level: sevFilter || undefined,
        status: statusFilter || undefined,
        force_refresh: isSilent ? true : undefined
      };
      
      const res = await apiClient.get('/governance/dashboard', { params });
      setDashboardData(res.data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      setErrorMsg("Failed to retrieve governance risk intelligence telemetry.");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [deptFilter, appFilter, sevFilter, statusFilter]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Polling Auto Refresh
  useEffect(() => {
    if (refreshMs === 0) return;
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, refreshMs);
    return () => clearInterval(interval);
  }, [refreshMs, fetchDashboard]);

  // Drilldown Click Handler
  const handleDrilldown = (target) => {
    // If specific violation id selected
    if (target.violationId) {
      navigate(`/governance/violations/${target.violationId}`);
      return;
    }
    
    // If pending status is chosen, exception drill-down is expected
    if (target.status === 'PENDING') {
      navigate('/governance/exceptions?status=PENDING');
      return;
    }

    // Build URL query mappings
    const params = new URLSearchParams();
    if (target.severity) params.append('risk_level', target.severity);
    if (target.department) params.append('department', target.department);
    if (target.application) params.append('application', target.application);
    if (target.status) params.append('status', target.status);
    if (target.search) params.append('search', target.search);
    if (target.policy) params.append('search', target.policy);
    
    navigate(`/governance/violations?${params.toString()}`);
  };

  const handleExportCSV = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/dashboard/export/csv`, '_blank');
  };

  const handleExportExcel = () => {
    window.open(`${apiClient.defaults.baseURL}/governance/dashboard/export/excel`, '_blank');
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

  if (loading) {
    return (
      <div className="table-loading-container" style={{ minHeight: '450px' }}>
        <div className="spinner-element"></div>
        <p className="text-muted">Loading risk metrics dashboard...</p>
      </div>
    );
  }

  const kpis = dashboardData?.kpis || {};
  const charts = dashboardData?.charts || {};
  const heatmap = dashboardData?.heatmap || [];
  const execSummary = dashboardData?.executive_summary || {};

  // Local Search filtering logic for the dashboard widgets values
  const matchesSearch = (val) => {
    if (!searchQuery) return true;
    return val?.toLowerCase().includes(searchQuery.toLowerCase());
  };

  return (
    <div className="governance-dashboard-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'Risk Dashboard', path: '/governance/dashboard', active: true }
      ]} />

      {/* Header controls */}
      <div className="sod-page-header">
        <div className="header-titles">
          <h1>Governance Risk Control Center</h1>
          <p className="subtitle">Ongoing oversight of roles published to the catalog — active policy conflicts, exception bounds, and SLA alerts.</p>
        </div>
        <div className="header-actions">
          {lastRefreshed && (
            <span className="last-refresh-lbl text-muted">
              Last updated: {lastRefreshed}
            </span>
          )}
          <select 
            value={refreshMs} 
            onChange={(e) => setRefreshMs(parseInt(e.target.value))}
            className="refresh-interval-select"
            title="Auto refresh timer settings"
          >
            {REFRESH_INTERVALS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => fetchDashboard()} disabled={loading} title="Refresh now">
            <RefreshCw size={14} className={loading ? "spin-animation" : ""} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>
          <button className="btn-secondary" onClick={handleExportCSV} title="Export CSV Summary">
            <Download size={14} />
            <span>CSV Report</span>
          </button>
          <button className="btn-secondary" onClick={handleExportExcel} title="Export Excel Details">
            <FileSpreadsheet size={14} />
            <span>Excel Details</span>
          </button>
        </div>
      </div>

      {/* Search Bar filter */}
      <div className="dashboard-global-search" style={{ marginBottom: '16px' }}>
        <div className="search-input-wrapper">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search dashboard metrics (User name, Application, Policy Code)..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Global Dashboard Filters */}
      <div className="sod-filter-card">
        <div className="filters-group">
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
            <option value="">All Risk Levels</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Violation Statuses</option>
            {STATUSES.map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
          </select>
          <input 
            type="text" 
            placeholder="Filter Department..." 
            value={deptFilter} 
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{ width: '150px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          />
          <input 
            type="text" 
            placeholder="Filter Application..." 
            value={appFilter} 
            onChange={(e) => setAppFilter(e.target.value)}
            style={{ width: '150px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
          />
          <button className="btn-reset" onClick={() => { setDeptFilter(''); setAppFilter(''); setSevFilter(''); setStatusFilter(''); }}>
            Reset Filters
          </button>
        </div>
      </div>

      {/* Toast logs */}
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

      {/* KPI Stats cards row */}
      <div className="sod-kpi-grid">
        <KpiCard 
          title="Total Policies" 
          value={kpis.total_policies} 
          trend={`${kpis.active_policies} Active`}
          trendType="neutral"
          onClick={() => navigate('/governance/sod-policies')} 
        />
        <KpiCard 
          title="Open Violations" 
          value={kpis.open_violations} 
          trend={kpis.violation_trend_pct > 0 ? `+${kpis.violation_trend_pct}%` : `${kpis.violation_trend_pct}%`}
          trendType="good"
          icon={AlertOctagon}
          onClick={() => handleDrilldown({ status: 'OPEN' })} 
        />
        <KpiCard 
          title="Active Exceptions" 
          value={kpis.approved_exceptions} 
          trend={kpis.exception_trend_pct > 0 ? `+${kpis.exception_trend_pct}%` : `${kpis.exception_trend_pct}%`}
          trendType="neutral"
          icon={CheckCircle2}
          onClick={() => navigate('/governance/exceptions')} 
        />
        <ScoreWidget 
          score={kpis.governance_score} 
          onClick={() => handleDrilldown({})} 
        />
      </div>

      {/* Visual Charts grid row */}
      <div className="dashboard-visuals-grid">
        {/* Severity donut */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Active Violations by Severity</h3>
            <p>Risk distribution levels</p>
          </div>
          <div className="card-body">
            <SeverityDonut data={charts.severity} onDrilldown={handleDrilldown} />
          </div>
        </div>

        {/* Top departments */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Violations by Department</h3>
            <p>Top 5 department counts</p>
          </div>
          <div className="card-body">
            <DepartmentBarChart data={charts.department} onDrilldown={handleDrilldown} />
          </div>
        </div>

        {/* Top applications */}
        <div className="visual-card">
          <div className="card-header">
            <h3>Violations by Connected Application</h3>
            <p>Conflicts mapped per client application</p>
          </div>
          <div className="card-body">
            <ApplicationBarChart data={charts.application} onDrilldown={handleDrilldown} />
          </div>
        </div>
      </div>

      {/* Historical line trends row */}
      <div className="dashboard-visuals-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="visual-card">
          <div className="card-header">
            <h3>30-Day Violation Rate Trend</h3>
            <p>Violations detected timeline log</p>
          </div>
          <div className="card-body">
            <TrendLineChart data={charts.violation_trend} strokeColor="var(--danger)" />
          </div>
        </div>

        <div className="visual-card">
          <div className="card-header">
            <h3>30-Day Exception Requests Trend</h3>
            <p>Exceptions request rate metrics</p>
          </div>
          <div className="card-body">
            <TrendLineChart data={charts.exception_trend} strokeColor="var(--primary)" />
          </div>
        </div>
      </div>

      {/* Risk Heatmap section */}
      <div className="dashboard-visuals-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="visual-card">
          <div className="card-header">
            <h3>Department vs Application Risk Heatmap Matrix</h3>
            <p>Hover and click grid cells to drill down into active department-application overrides.</p>
          </div>
          <div className="card-body">
            <RiskHeatmap data={heatmap} onCellClick={handleDrilldown} />
          </div>
        </div>
      </div>

      {/* Executive Summary lists section */}
      <div className="dashboard-visuals-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="visual-card">
          <div className="card-header">
            <h3>Executive Compliance Report & Summaries</h3>
            <p>System summaries generated for executive review and external compliance audits.</p>
          </div>
          <div className="card-body">
            <ExecutiveSummary data={execSummary} kpis={kpis} onDrilldown={handleDrilldown} />
          </div>
        </div>
      </div>

    </div>
  );
};

export default GovernanceDashboard;
