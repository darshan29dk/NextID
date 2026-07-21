import React, { useState, useEffect, useCallback } from 'react';
import { Users, Layers, Shield, BookOpen, Key, AlertOctagon, CheckCircle2, Target, RotateCw, Download, FileSpreadsheet } from 'lucide-react';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { DepartmentBarChart } from '../Governance/RiskCharts';
import { getExecutiveDashboard } from '../../services/analyticsService';
import { apiClient } from '../../services/dashboardService';
import './Analytics.css';

// AN-001: Executive Dashboard — platform-wide KPI overview, built entirely
// from real data (identities, applications, candidate roles, entitlements,
// SoD violations/exceptions). No fabricated/seeded numbers.
const ExecutiveDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getExecutiveDashboard();
      setData(res);
    } catch (err) {
      console.error('Failed to load executive dashboard:', err);
      setError('Failed to load the executive dashboard. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};

  return (
    <div className="analytics-page" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Executive Dashboard</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
            Platform-wide KPI overview across identities, roles, and governance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/executive/export/csv`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> CSV
          </button>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/executive/export/excel`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
        <DashboardCard title="Total Identities" value={kpis.total_identities ?? 0} icon={Users} color="blue" loading={loading} />
        <DashboardCard title="Applications" value={kpis.total_applications ?? 0} icon={Layers} color="teal" loading={loading} />
        <DashboardCard title="Candidate Roles" value={kpis.total_candidate_roles ?? 0} icon={Key} color="violet" loading={loading} />
        <DashboardCard title="Published Roles" value={kpis.published_roles ?? 0} icon={BookOpen} color="green" loading={loading} />
        <DashboardCard title="Entitlements Mapped" value={kpis.total_entitlements_mapped ?? 0} icon={Shield} color="cyan" loading={loading} />
        <DashboardCard title="Open SoD Violations" value={kpis.open_violations ?? 0} icon={AlertOctagon} color="red" loading={loading} />
        <DashboardCard title="Active Exceptions" value={kpis.active_exceptions ?? 0} icon={CheckCircle2} color="yellow" loading={loading} />
        <DashboardCard title="Overall Role Coverage" value={`${kpis.overall_coverage_pct ?? 0}%`} icon={Target} color="blue" loading={loading} />
      </div>

      <div className="analytics-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Classification</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Birthright / Request-Based breakdown</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_classification || {}} onDrilldown={() => {}} />
        </div>

        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Identities by Department</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Headcount distribution across departments</p>
          </div>
          <DepartmentBarChart data={charts.identities_by_department || {}} onDrilldown={() => {}} />
        </div>

        <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Roles by Status</h3>
            <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>Draft / Reviewed / Published lifecycle breakdown</p>
          </div>
          <DepartmentBarChart data={charts.roles_by_status || {}} onDrilldown={() => {}} />
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
