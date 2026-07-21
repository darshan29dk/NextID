import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserCheck, UserX, Target, Shield, RotateCw, Download, FileSpreadsheet } from 'lucide-react';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { getCoverageReports } from '../../services/analyticsService';
import { apiClient } from '../../services/dashboardService';
import './Analytics.css';

// AN-003: Coverage Reports — how much of the real, uploaded identity data
// has actually been captured into an active role, broken down by
// department, plus the specific identities still uncovered (actionable
// follow-up list, not just a summary percentage).
const CoverageReports = ({ hideHeader }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getCoverageReports();
      setData(res);
    } catch (err) {
      console.error('Failed to load coverage reports:', err);
      setError('Failed to load coverage reports. Ensure backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = data?.kpis || {};
  const deptCoverage = data?.coverage_by_department || {};
  const uncovered = data?.uncovered_identities || [];

  const deptEntries = Object.entries(deptCoverage).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className={hideHeader ? "" : "analytics-page"} style={hideHeader ? { display: 'flex', flexDirection: 'column', gap: '20px' } : { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {!hideHeader ? (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Coverage Reports</h2>
            <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
              How much of your uploaded identity and entitlement data has been captured into active roles.
            </p>
          </div>
        ) : <div />}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/coverage-reports/export/csv`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> CSV
          </button>
          <button className="btn-action-premium" onClick={() => window.open(`${apiClient.defaults.baseURL}/analytics/coverage-reports/export/excel`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

      <div className="analytics-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
        <DashboardCard title="Total Identities" value={kpis.total_identities ?? 0} icon={Users} color="blue" loading={loading} />
        <DashboardCard title="Covered" value={kpis.covered_identities ?? 0} icon={UserCheck} color="green" loading={loading} />
        <DashboardCard title="Uncovered" value={kpis.uncovered_identities ?? 0} icon={UserX} color="red" loading={loading} />
        <DashboardCard title="Overall Coverage" value={`${kpis.overall_coverage_pct ?? 0}%`} icon={Target} color="violet" loading={loading} />
        <DashboardCard title="Entitlement Match Rate" value={`${kpis.entitlement_match_pct ?? 0}%`} icon={Shield} color="cyan" loading={loading} />
      </div>

      <div className="visual-card" style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)' }}>
        <div className="card-header" style={{ marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Coverage by Department</h3>
          <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 0 0' }}>What fraction of each department is captured by a role</p>
        </div>
        {deptEntries.length === 0 ? (
          <div className="text-muted" style={{ fontSize: '13px', padding: '12px 0' }}>No department data.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {deptEntries.map(([dept, stats]) => (
              <div key={dept}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>{dept}</span>
                  <strong>{stats.covered} / {stats.total} ({stats.coverage_pct}%)</strong>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stats.coverage_pct}%`, backgroundColor: 'var(--primary)', borderRadius: '4px' }}></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="table-responsive-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
        <div style={{ padding: '16px 16px 0 16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Uncovered Identities ({uncovered.length})</h3>
          <p className="text-muted" style={{ fontSize: '12px', margin: '2px 0 12px 0' }}>Real identities not yet captured by any active role</p>
        </div>
        <table className="table-premium">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
            </tr>
          </thead>
          <tbody>
            {uncovered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  All identities are covered by an active role.
                </td>
              </tr>
            ) : (
              uncovered.map((u, idx) => (
                <tr key={u.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email || '-'}</td>
                  <td>{u.department}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {uncovered.length > 0 && (
          <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
            <span className="text-muted" style={{ fontSize: '13px' }}>
              Showing <b>1</b> to <b>{uncovered.length}</b> of <b>{uncovered.length}</b> uncovered identities
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverageReports;
