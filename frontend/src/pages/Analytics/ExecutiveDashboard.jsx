import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Layers, Shield, BookOpen, Key, AlertOctagon, CheckCircle2, Target, RotateCw, Download, FileSpreadsheet, LayoutDashboard } from 'lucide-react';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { DepartmentBarChart } from '../Governance/RiskCharts';
import { getExecutiveDashboard } from '../../services/analyticsService';
import { apiClient } from '../../services/dashboardService';
import './Analytics.css';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import RoleAnalytics from './RoleAnalytics';
import CoverageReports from './CoverageReports';

// AN-001: Executive Dashboard — platform-wide KPI overview, built entirely
// from real data (identities, applications, candidate roles, entitlements,
// SoD violations/exceptions). No fabricated/seeded numbers.
const ExecutiveDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTabFromPath = (path) => {
    if (path.includes('role-analytics')) return 'role';
    if (path.includes('coverage-reports')) return 'coverage';
    return 'executive';
  };

  const [mainTab, setMainTab] = useState(getActiveTabFromPath(location.pathname));

  useEffect(() => {
    setMainTab(getActiveTabFromPath(location.pathname));
  }, [location.pathname]);
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
      <Breadcrumb
        items={[
          { label: 'Analytics', active: false },
          { label: 'Intelligence Center', active: true }
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Analytics</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
            {mainTab === 'executive' 
              ? 'Platform-wide KPI overview across identities, roles, and governance.'
              : mainTab === 'role'
              ? 'Role-level metrics — type, risk, source, and ownership coverage.'
              : 'How much of your uploaded identity and entitlement data has been captured into active roles.'
            }
          </p>
        </div>
        {mainTab === 'executive' && (
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
        )}
      </div>

      <div className="controls-card" style={{ display: 'flex', gap: '8px', padding: '4px', marginBottom: '16px' }}>
        <button
          className={`drawer-tab-btn ${mainTab === 'executive' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('executive');
            navigate('/analytics/executive');
          }}
          style={{ padding: '10px 18px' }}
        >
          <LayoutDashboard size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Executive Dashboard
        </button>
        <button
          className={`drawer-tab-btn ${mainTab === 'role' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('role');
            navigate('/analytics/role-analytics');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Key size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Role Analytics
        </button>
        <button
          className={`drawer-tab-btn ${mainTab === 'coverage' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('coverage');
            navigate('/analytics/coverage-reports');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Target size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Coverage Reports
        </button>
      </div>

      {mainTab === 'executive' ? (
        <>

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
          <DepartmentBarChart data={charts.roles_by_classification || {}} onDrilldown={() => {}} emptyLabel="No candidate roles yet." />
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
          <DepartmentBarChart data={charts.roles_by_status || {}} onDrilldown={() => {}} emptyLabel="No candidate roles yet." />
        </div>
      </div>
        </>
      ) : mainTab === 'role' ? (
        <RoleAnalytics hideHeader={true} />
      ) : (
        <CoverageReports hideHeader={true} />
      )}
    </div>
  );
};

export default ExecutiveDashboard;
