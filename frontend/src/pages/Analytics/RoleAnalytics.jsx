import React, { useState, useEffect, useCallback } from 'react';
import { Key, Gauge, ShieldAlert, UserCheck, RotateCw, Download, FileSpreadsheet } from 'lucide-react';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { DepartmentBarChart } from '../Governance/RiskCharts';
import { getRoleAnalytics } from '../../services/analyticsService';
import { apiClient } from '../../services/dashboardService';
import './Analytics.css';

// AN-002: Role Analytics — role-focused metrics (type, risk, source,
// department breakdown, confidence/owner coverage), built from real
// CandidateRole data.
const RoleAnalytics = ({ hideHeader }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getRoleAnalytics();
      setData(res);
    } catch (err) {
      console.error('Failed to load role analytics:', err);
      setError('Failed to load role analytics. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  return (
    <div className={hideHeader ? "" : "analytics-page"} style={hideHeader ? { display: 'flex', flexDirection: 'column', gap: '20px' } : { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {!hideHeader ? (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Role Analytics</h2>
            <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
              Role-level metrics — type, risk, source, and ownership coverage.
            </p>
          </div>
        ) : <div />}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/role-analytics/export/csv`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> CSV
          </button>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/role-analytics/export/excel`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button className="btn-action-premium" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)', borderRadius: '6px', border: '1px solid var(--danger)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div className="analytics-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <DashboardCard title="Total Roles" value={kpis.total_roles ?? 0} icon={Key} color="violet" loading={loading} />
        <DashboardCard title="Avg. Confidence Score" value={`${kpis.avg_confidence_score ?? 0}%`} icon={Gauge} color="blue" loading={loading} />
        <DashboardCard title="Avg. SoD Violations / Role" value={kpis.avg_sod_violation_count ?? 0} icon={ShieldAlert} color="red" loading={loading} />
        <DashboardCard title="Owner Coverage" value={`${kpis.owner_coverage_pct ?? 0}%`} icon={UserCheck} color="green" loading={loading} />
      </div>

      <div className="analytics-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Type</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Business / Technical / Composite</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_type || {}} onDrilldown={() => {}} emptyLabel="No candidate roles yet." />
        </div>

        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Risk Level</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Low / Medium / High</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_risk_level || {}} onDrilldown={() => {}} emptyLabel="No candidate roles yet." />
        </div>

        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Source</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Mining / Manual / Split / Merge</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_source || {}} onDrilldown={() => {}} emptyLabel="No candidate roles yet." />
        </div>

        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Department</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Where roles originate from</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_department || {}} onDrilldown={() => {}} />
        </div>
      </div>
    </div>
  );
};

export default RoleAnalytics;
