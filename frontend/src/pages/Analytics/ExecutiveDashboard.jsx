import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Key, Target } from 'lucide-react';
import './Analytics.css';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import RoleAnalytics from './RoleAnalytics';
import CoverageReports from './CoverageReports';

// AN-001: platform-wide KPI overview used to live here as a separate
// "Executive Dashboard" tab, but it duplicated the main Dashboard page
// almost entirely — so those KPIs/charts were merged into the main
// Dashboard instead, and this page now only hosts Role Analytics and
// Coverage Reports (the two views that don't exist anywhere else).
const ExecutiveDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTabFromPath = (path) => {
    if (path.includes('coverage-reports')) return 'coverage';
    return 'role';
  };

  const [mainTab, setMainTab] = useState(getActiveTabFromPath(location.pathname));

  useEffect(() => {
    setMainTab(getActiveTabFromPath(location.pathname));
  }, [location.pathname]);

  return (
    <div className="analytics-page" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Breadcrumb
        items={[
          { label: 'Analytics', active: false },
          { label: 'Intelligence Center', active: true }
        ]}
      />

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Analytics</h2>
        <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
          {mainTab === 'role'
            ? 'Role-level metrics — type, risk, source, and ownership coverage.'
            : 'How much of your uploaded identity and entitlement data has been captured into active roles.'
          }
        </p>
      </div>

      <div className="controls-card" style={{ display: 'flex', gap: '8px', padding: '4px', marginBottom: '16px' }}>
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

      {mainTab === 'role' ? (
        <RoleAnalytics hideHeader={true} />
      ) : (
        <CoverageReports hideHeader={true} />
      )}
    </div>
  );
};

export default ExecutiveDashboard;
