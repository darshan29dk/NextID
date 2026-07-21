import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Monitor, 
  Layers, 
  Key, 
  Target, 
  BookOpen, 
  Shield, 
  ShieldCheck,
  AlertTriangle,
  Upload, 
  Play, 
  CheckSquare, 
  FileText,
  Activity,
  Database,
  Globe,
  ArrowRight,
  TrendingUp,
  PieChart,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInactivityTimer } from '../../hooks/useInactivityTimer';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import { 
  getDashboardStats, 
  getRecentActivities, 
  getApprovalQueue, 
  uploadIdentityData, 
  syncApiKey,
  getSettings
} from '../../services/dashboardService';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
const { logout, currentUser } = useAuth();

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(15);

  useEffect(() => {
    const fetchSessionSetting = async () => {
      try {
        const settings = await getSettings();
        if (settings?.session_timeout_minutes) {
          setSessionTimeoutMinutes(settings.session_timeout_minutes);
        }
      } catch (err) {
        console.error('Could not load session timeout setting, using default:', err);
      }
    };
    fetchSessionSetting();
  }, []);

  const logoutAfterMs = sessionTimeoutMinutes * 60 * 1000;
  const warningAfterMs = Math.max(logoutAfterMs - 60 * 1000, 0);
  const { showWarning, stayActive } = useInactivityTimer(handleLogout, warningAfterMs, logoutAfterMs);

  const [stats, setStats] = useState({
    totalUsers: 0,
    accounts: 0,
    applications: 0,
    entitlements: 0,
    candidateRoles: 0,
    publishedRoles: 0,
    birthrightRoles: 0,
    sodConflicts: 0,
    pendingApprovals: 0,
    departmentCoverage: [],
    riskDistribution: {},
    applicationDistribution: [],
    roleLifecycle: []
  });
  const [activities, setActivities] = useState([]);
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [status, setStatus] = useState({
    database: 'Checking...',
    backend: 'Checking...',
    api: 'Checking...'
  });

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [modalTab, setModalTab] = useState('upload');
  const [uploadFile, setUploadFile] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      // These three calls don't depend on each other - fire them together
      // instead of one at a time, which was tripling the wait on every
      // dashboard load (right after signing in, this is the page you land on).
      const [statsResult, activitiesResult, approvalResult] = await Promise.allSettled([
        getDashboardStats(),
        getRecentActivities(),
        getApprovalQueue()
      ]);

      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      if (activitiesResult.status === 'fulfilled') setActivities(activitiesResult.value);
      if (approvalResult.status === 'fulfilled') setApprovalQueue(approvalResult.value);

      const anyFailed = [statsResult, activitiesResult, approvalResult].some(r => r.status === 'rejected');
      if (anyFailed) {
        console.error('Some dashboard data failed to load:', { statsResult, activitiesResult, approvalResult });
        setError('Some dashboard data failed to load. Please verify connection.');
        setStatus({ database: 'Error', backend: 'Running', api: 'Disconnected' });
      } else {
        setError(null);
        setStatus({ database: 'Ready', backend: 'Running', api: 'Connected' });
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please verify connection.');
      setStatus({
        database: 'Error',
        backend: 'Running',
        api: 'Disconnected'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const downloadTemplate = (format) => {
    let content = '';
    let filename = '';
    let mimeType = '';
    
    if (format === 'csv') {
      content = 'username,email,department,role,applications,entitlements_count,risk_level,sod_conflict\n' +
                'john.smith,john.smith@corp.io,Finance,Finance Specialist,"Active Directory, Workday, Slack",15,High,1\n' +
                'jane.doe,jane.doe@corp.io,Engineering,Software Engineer,"Active Directory, GitHub, Slack",8,Low,0\n';
      filename = 'ranalyzer_identities_template.csv';
      mimeType = 'text/csv';
    } else if (format === 'xlsx') {
      content = 'username,email,department,role,applications,entitlements_count,risk_level,sod_conflict\n' +
                'john.smith,john.smith@corp.io,Finance,Finance Specialist,"Active Directory, Workday",15,High,1\n' +
                'jane.doe,jane.doe@corp.io,Engineering,Software Engineer,"Active Directory, GitHub",8,Low,0\n';
      filename = 'ranalyzer_identities_template_for_excel.csv';
      mimeType = 'text/csv';
    } else if (format === 'ldif') {
      content = 
`dn: uid=john.smith,ou=Finance,dc=corp,dc=io
objectClass: inetOrgPerson
uid: john.smith
cn: John Smith
mail: john.smith@corp.io
ou: Finance
title: Finance Specialist
memberOf: cn=ActiveDirectory,ou=Apps,dc=corp,dc=io

dn: uid=jane.doe,ou=Engineering,dc=corp,dc=io
objectClass: inetOrgPerson
uid: jane.doe
cn: Jane Doe
mail: jane.doe@corp.io
ou: Engineering
title: Software Engineer
memberOf: cn=GitHub,ou=Apps,dc=corp,dc=io
`;
      filename = 'ranalyzer_identities_template.ldif';
      mimeType = 'text/plain';
    } else if (format === 'sql') {
      content =
`-- rAnalyzer Identity Import Template
CREATE TABLE identities (
  username VARCHAR(100),
  email VARCHAR(150),
  department VARCHAR(100),
  role VARCHAR(100),
  applications TEXT,
  entitlements_count INT,
  risk_level VARCHAR(20),
  sod_conflict INT
);

INSERT INTO identities VALUES ('john.smith', 'john.smith@corp.io', 'Finance', 'Finance Specialist', 'Active Directory,Workday', 15, 'High', 1);
INSERT INTO identities VALUES ('jane.doe', 'jane.doe@corp.io', 'Engineering', 'Software Engineer', 'GitHub,Slack', 8, 'Low', 0);
`;
      filename = 'ranalyzer_identities_template.sql';
      mimeType = 'application/sql';
    } else {
      const templateData = [
        {
          "username": "john.smith",
          "email": "john.smith@ranalyzer.io",
          "department": "Finance",
          "role": "Finance Specialist",
          "applications": "Active Directory, Workday, Slack",
          "entitlements_count": 15,
          "risk_level": "High",
          "sod_conflict": 1
        },
        {
          "username": "jane.doe",
          "email": "jane.doe@ranalyzer.io",
          "department": "Engineering",
          "role": "Software Engineer",
          "applications": "Active Directory, GitHub, Slack",
          "entitlements_count": 8,
          "risk_level": "Low",
          "sod_conflict": 0
        }
      ];
      content = JSON.stringify(templateData, null, 2);
      filename = 'ranalyzer_identities_template.json';
      mimeType = 'application/json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUploadChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadFile(e.target.files[0]);
      setSyncError(null);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setSyncError('Please select a file to upload.');
      return;
    }
    try {
      setSyncLoading(true);
      setSyncError(null);
      const updatedStats = await uploadIdentityData(uploadFile);
      setStats(updatedStats);
      setSyncSuccess(true);
      setUploadFile(null);
      const activitiesData = await getRecentActivities();
      setActivities(activitiesData);
      setTimeout(() => {
        setSyncSuccess(false);
        setShowSyncModal(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      setSyncError(err.response?.data?.detail || 'Failed to upload and analyze identity file.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleApiSyncSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setSyncError('Please input a valid API Key / Token.');
      return;
    }
    try {
      setSyncLoading(true);
      setSyncError(null);
      const updatedStats = await syncApiKey('generic', apiKey);
      setStats(updatedStats);
      setSyncSuccess(true);
      setApiKey('');
      const activitiesData = await getRecentActivities();
      setActivities(activitiesData);
      setTimeout(() => {
        setSyncSuccess(false);
        setShowSyncModal(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      setSyncError(err.response?.data?.detail || 'Failed to synchronize with identity provider.');
    } finally {
      setSyncLoading(false);
    }
  };

  const renderDepartmentChart = (deptCoverage) => {
    if (!deptCoverage || deptCoverage.length === 0) return null;
    return (
      <svg viewBox="0 0 500 220" className="trend-svg" aria-label="Role Coverage by Department Double Bar Graph">
        <line x1="50" y1="30" x2="470" y2="30" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
        <line x1="50" y1="65" x2="470" y2="65" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
        <line x1="50" y1="100" x2="470" y2="100" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
        <line x1="50" y1="135" x2="470" y2="135" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
        <line x1="50" y1="170" x2="470" y2="170" stroke="var(--border-color)" strokeWidth="0.5" />
        <text x="35" y="34" className="axis-text">100%</text>
        <text x="35" y="69" className="axis-text">75%</text>
        <text x="35" y="104" className="axis-text">50%</text>
        <text x="35" y="139" className="axis-text">25%</text>
        <text x="35" y="174" className="axis-text">0%</text>
        {deptCoverage.map((dept, idx) => {
          const xOffset = 50 + idx * 52 + 10;
          const coveragePct = dept.target > 0 ? (dept.coverage / dept.target) * 100 : 0;
          const bar1Height = (coveragePct / 100) * 140;
          const bar2Height = 40 + (idx % 3) * 15;
          return (
            <g key={idx}>
              <rect x={xOffset} y={170 - bar1Height} width="8" height={Math.max(bar1Height, 2)} fill="#2563eb" rx="1.5" />
              <rect x={xOffset + 11} y={170 - bar2Height} width="8" height={bar2Height} fill="var(--border-color)" rx="1.5" />
              <text x={xOffset + 9} y="190" className="axis-text" textAnchor="middle" style={{ fontSize: '8px', fontWeight: 600 }}>
                {dept.department}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderDonutChart = (riskDist) => {
    const low = riskDist?.Low || 0;
    const medium = riskDist?.Medium || 0;
    const high = riskDist?.High || 0;
    const critical = riskDist?.Critical || 0;
    const total = low + medium + high + critical;
    
    if (total === 0) {
      return (
        <svg viewBox="0 0 100 100" className="donut-svg">
          <circle cx="50" cy="50" r="35" fill="transparent" stroke="var(--border-color)" strokeWidth="10" />
        </svg>
      );
    }
    
    const circ = 2 * Math.PI * 35;
    const lLen = (low / total) * circ;
    const mLen = (medium / total) * circ;
    const hLen = (high / total) * circ;
    const cLen = (critical / total) * circ;
    
    return (
      <svg viewBox="0 0 100 100" className="donut-svg" aria-label="Role Risk Donut Chart">
        <circle cx="50" cy="50" r="35" fill="transparent" stroke="#10b981" strokeWidth="10" strokeDasharray={`${lLen} ${circ}`} strokeDashoffset="0" />
        <circle cx="50" cy="50" r="35" fill="transparent" stroke="#f59e0b" strokeWidth="10" strokeDasharray={`${mLen} ${circ}`} strokeDashoffset={-lLen} />
        <circle cx="50" cy="50" r="35" fill="transparent" stroke="#f97316" strokeWidth="10" strokeDasharray={`${hLen} ${circ}`} strokeDashoffset={-(lLen + mLen)} />
        <circle cx="50" cy="50" r="35" fill="transparent" stroke="#ef4444" strokeWidth="10" strokeDasharray={`${cLen} ${circ}`} strokeDashoffset={-(lLen + mLen + hLen)} />
        <circle cx="50" cy="50" r="30" fill="var(--bg-card)" />
      </svg>
    );
  };

  return (
    <div className="dashboard-page">
      <Breadcrumb items={[{ label: 'Dashboard', active: true }]} />

      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-content">
          <span className="welcome-greet">{getGreeting()},</span>
          <h2 className="welcome-name">{currentUser?.name || 'User'}</h2>
          <p className="welcome-sub">Welcome back to rAnalyzer Role Governance dashboard.</p>
        </div>
        <div className="welcome-banner-actions">
          <button className="sync-banner-btn" onClick={() => { setModalTab('upload'); setShowSyncModal(true); }}>
            <Upload size={14} />
            <span>Sync Data / Upload</span>
          </button>

        </div>
      </div>

      {/* 8 Card Metric Grid */}
      <div className="kpi-grid-premium">
        <DashboardCard title="Identities" value={stats.totalUsers} icon={Users} color="blue" trend="+12" loading={loading} />
        <DashboardCard title="Accounts" value={stats.accounts} icon={Monitor} color="teal" trend="+34" loading={loading} />
        <DashboardCard title="Applications" value={stats.applications} icon={Layers} color="violet" trend="" loading={loading} />
        <DashboardCard title="Entitlements" value={stats.entitlements} icon={Key} color="purple" trend="+28" loading={loading} />
        <DashboardCard title="Candidate Roles" value={stats.candidateRoles} icon={Target} color="yellow" trend="+5" loading={loading} />
        <DashboardCard title="Published Roles" value={stats.publishedRoles} icon={BookOpen} color="green" trend="+2" loading={loading} />
        <DashboardCard title="Birthright Roles" value={stats.birthrightRoles} icon={Shield} color="cyan" trend="" loading={loading} />
        <DashboardCard title="SoD Violations" value={stats.sodConflicts} icon={AlertTriangle} color="red" trend="-3" loading={loading} />
      </div>

      {/* Charts Grid */}
      <div className="dashboard-visuals-grid">
        <div className="visual-card">
          <div className="card-header">
            <div>
              <h3>Role Coverage by Department</h3>
              <p>% of identities with an assigned published role</p>
            </div>
            <a href="#" onClick={(e) => { e.preventDefault(); }} className="view-all-link">View All</a>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="shimmer-text" style={{ height: '140px' }}></div>
            ) : (
              renderDepartmentChart(stats.departmentCoverage)
            )}
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot blue"></span>Coverage</span>
              <span className="legend-item"><span className="legend-dot grey"></span>Baseline Target</span>
            </div>
          </div>
        </div>

        <div className="visual-card">
          <div className="card-header">
            <div>
              <h3>Role Risk Distribution</h3>
              <p>Published roles by risk level</p>
            </div>
            <PieChart size={15} className="text-muted" />
          </div>
          <div className="card-body donut-card-body">
            <div className="donut-container">
              {loading ? (
                <div className="shimmer-circle" style={{ width: '80px', height: '80px', margin: 'auto' }}></div>
              ) : (
                renderDonutChart(stats.riskDistribution)
              )}
            </div>
            <div className="donut-legend-grid">
              <div className="donut-legend-item">
                <span className="legend-dot green"></span>
                <span className="legend-lbl">Low</span>
                <strong className="legend-val">{stats.riskDistribution?.Low || 0}</strong>
              </div>
              <div className="donut-legend-item">
                <span className="legend-dot yellow"></span>
                <span className="legend-lbl">Medium</span>
                <strong className="legend-val">{stats.riskDistribution?.Medium || 0}</strong>
              </div>
              <div className="donut-legend-item">
                <span className="legend-dot orange"></span>
                <span className="legend-lbl">High</span>
                <strong className="legend-val">{stats.riskDistribution?.High || 0}</strong>
              </div>
              <div className="donut-legend-item">
                <span className="legend-dot red"></span>
                <span className="legend-lbl">Critical</span>
                <strong className="legend-val">{stats.riskDistribution?.Critical || 0}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="visual-card">
          <div className="card-header">
            <div>
              <h3>Application Distribution</h3>
              <p>Top 6 by account count</p>
            </div>
            <Monitor size={15} className="text-muted" />
          </div>
          <div className="card-body bar-chart-body">
            {loading ? (
              <div className="shimmer-list">
                {[1, 2, 3].map(n => <div key={n} className="shimmer-text" style={{ height: '14px', marginBottom: '8px' }}></div>)}
              </div>
            ) : stats.applicationDistribution.map((app, idx) => {
              const widthPct = (app.accounts / app.max) * 100;
              return (
                <div key={idx} className="bar-row">
                  <div className="bar-row-label">
                    <span>{app.name}</span>
                    <strong>{app.accounts}</strong>
                  </div>
                  <div className="bar-container">
                    <div className="bar-fill" style={{ width: `${widthPct}%`, backgroundColor: app.color }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Secondary Charts */}
      <div className="dashboard-visuals-grid secondary-charts-grid">
        <div className="visual-card">
          <div className="card-header">
            <div>
              <h3>Role Mining Trend</h3>
              <p>Candidates vs Published (6mo)</p>
            </div>
            <TrendingUp size={15} className="text-muted" />
          </div>
          <div className="card-body">
            <svg viewBox="0 0 500 220" className="trend-svg" aria-label="Role Mining Trend Line Graph">
              <defs>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0"/>
                </linearGradient>
                <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.15"/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0"/>
                </linearGradient>
              </defs>
              <line x1="50" y1="40" x2="470" y2="40" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="50" y1="80" x2="470" y2="80" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="50" y1="120" x2="470" y2="120" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
              <line x1="50" y1="160" x2="470" y2="160" stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4" />
              <text x="35" y="44" className="axis-text">32</text>
              <text x="35" y="84" className="axis-text">24</text>
              <text x="35" y="124" className="axis-text">16</text>
              <text x="35" y="164" className="axis-text">8</text>
              <text x="35" y="200" className="axis-text">0</text>
              <text x="50%" y="110" textAnchor="middle" className="axis-text" style={{fontSize: '11px', fill: 'var(--text-muted)'}}>No mining data yet. Upload identity data to begin.</text>
            </svg>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot blue"></span>Candidates</span>
              <span className="legend-item"><span className="legend-dot green"></span>Published</span>
            </div>
          </div>
        </div>

        <div className="visual-card">
          <div className="card-header">
            <div>
              <h3>Role Lifecycle</h3>
              <p>Status distribution</p>
            </div>
            <ShieldCheck size={15} className="text-muted" />
          </div>
          <div className="card-body lifecycle-body">
            <div className="lifecycle-list">
              {loading ? (
                <div className="shimmer-list">
                  {[1, 2].map(n => <div key={n} className="shimmer-text" style={{ height: '14px' }}></div>)}
                </div>
              ) : stats.roleLifecycle.map((role, idx) => {
                const widthPct = (role.count / role.total) * 100;
                return (
                  <div key={idx} className="lifecycle-row">
                    <div className="lifecycle-row-header">
                      <span className="lifecycle-label">{role.label}</span>
                      <span className="lifecycle-count">{role.count}</span>
                    </div>
                    <div className="lifecycle-progress-bg">
                      <div className="lifecycle-progress-fill" style={{ width: `${widthPct}%`, backgroundColor: role.color }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="lifecycle-summary">
              <div className="summary-stat">
                <span className="summary-number">{stats.roleLifecycle.reduce((sum, item) => sum + item.count, 0)}</span>
                <span className="summary-lbl">Total Roles</span>
              </div>
              <div className="summary-stat">
                <span className="summary-number text-success">
                  {stats.roleLifecycle.length > 0 
                    ? Math.round((stats.roleLifecycle.find(r => r.label === 'Active')?.count / stats.roleLifecycle.reduce((sum, item) => sum + item.count, 0)) * 100) 
                    : 75}%
                </span>
                <span className="summary-lbl">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="dashboard-bottom-grid">
        <div className="visual-card activities-card">
          <div className="card-header">
            <h3>Recent Activity</h3>
            <a href="#" onClick={(e) => { e.preventDefault(); }} className="view-all-link">
              View All <ArrowRight size={13} />
            </a>
          </div>
          <div className="card-body scrollable-body">
            {error && <div className="error-banner">{error}</div>}
            {loading ? (
              <div className="shimmer-list">
                {[1, 2, 3].map(n => (
                  <div key={n} className="shimmer-item">
                    <div className="shimmer-circle"></div>
                    <div className="shimmer-text"></div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="empty-activities">No recent activities found.</div>
            ) : (
              <div className="activity-timeline">
                {activities.map((act) => {
                  let badgeClass = 'blue';
                  if (act.status === 'success') badgeClass = 'green';
                  if (act.status === 'warning') badgeClass = 'yellow';
                  if (act.status === 'danger') badgeClass = 'red';
                  if (act.status === 'info') badgeClass = 'blue';
                  return (
                    <div key={act.id} className="timeline-item">
                      <span className={`timeline-dot dot-${badgeClass}`}></span>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-title">{act.action}</span>
                          <span className="timeline-time">
                            {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className="timeline-user">Triggered by: {act.user}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="visual-card approvals-card">
          <div className="card-header">
            <h3>Approval Queue</h3>
            <button className="view-all-btn-blue">
              View All <span className="badge-count-inner">{approvalQueue.length}</span>
            </button>
          </div>
          <div className="card-body split-body-approvals">
            <div className="approvals-list-container">
              {loading ? (
                <div className="shimmer-list">
                  {[1, 2, 3].map(n => <div key={n} className="shimmer-text" style={{ height: '32px', marginBottom: '8px' }}></div>)}
                </div>
              ) : approvalQueue.length === 0 ? (
                <div className="empty-activities">No pending approval items.</div>
              ) : (
                approvalQueue.map((item) => (
                  <div key={item.id} className="approval-row-item">
                    <div className="approval-left-info">
                      <h4 className="approval-role-title">{item.role_name}</h4>
                      <p className="approval-subtext">{item.requester} • Due in {item.due_in_days} days</p>
                    </div>
                    <span className={`approval-risk-badge risk-${item.risk_level}`}>
                      {item.risk_level}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="approvals-footer-bar">
              <div className="approvals-summary-pills">
                <span className="pill-dot critical"></span>
                <span>{approvalQueue.filter(i => i.risk_level === 'critical').length} Critical</span>
                <span className="pill-divider">•</span>
                <span className="pill-dot high"></span>
                <span>{approvalQueue.filter(i => i.risk_level === 'high').length} High</span>
                <span className="pill-divider">•</span>
                <span className="pill-dot medium"></span>
                <span>{approvalQueue.filter(i => i.risk_level === 'medium').length} Medium</span>
              </div>
              <div className="approvals-clock-warning">
                <Clock size={12} className="clock-red-icon" />
                <span>{approvalQueue.filter(i => i.due_in_days <= 0).length} overdue today</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Center */}
      <div className="visual-card control-center-card">
        <div className="card-header">
          <h3>Control Center</h3>
          <span className="badge-control">System Overview</span>
        </div>
        <div className="card-body split-body">
          <div className="actions-section">
            <h4>Quick Actions</h4>
            <div className="actions-grid">
              <button className="action-tile-btn" onClick={() => { setModalTab('upload'); setShowSyncModal(true); }}>
                <Upload size={16} className="tile-icon text-blue" />
                <span>Upload Identity Data</span>
              </button>
              <button className="action-tile-btn" onClick={fetchData}>
                <Play size={16} className="tile-icon text-green" />
                <span>Run Role Mining</span>
              </button>
              <button className="action-tile-btn">
                <CheckSquare size={16} className="tile-icon text-yellow" />
                <span>Review Candidates</span>
              </button>
              <button className="action-tile-btn">
                <FileText size={16} className="tile-icon text-red" />
                <span>Generate Reports</span>
              </button>
            </div>
          </div>
          <div className="actions-divider"></div>
          <div className="status-section">
            <h4>System Status</h4>
            <div className="status-list">
              <div className="status-row">
                <div className="status-left">
                  <Database size={15} className="status-icon" />
                  <span>Database</span>
                </div>
                <span className={`status-indicator status-${status.database.toLowerCase()}`}>
                  {status.database}
                </span>
              </div>
              <div className="status-row">
                <div className="status-left">
                  <Activity size={15} className="status-icon" />
                  <span>Backend Server</span>
                </div>
                <span className="status-indicator status-running">{status.backend}</span>
              </div>
              <div className="status-row">
                <div className="status-left">
                  <Globe size={15} className="status-icon" />
                  <span>API Gateway</span>
                </div>
                <span className={`status-indicator status-${status.api.toLowerCase().replace(' ', '-')}`}>
                  {status.api}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="modal-backdrop-portal">
          <div className="modal-content-portal">
            <div className="modal-header-portal">
              <h3>Data Integration Portal</h3>
              <button className="modal-close-btn" onClick={() => setShowSyncModal(false)} aria-label="Close Modal">
                <XCircle size={18} />
              </button>
            </div>
            <div className="modal-tabs-portal">
              <button className={`tab-btn-portal ${modalTab === 'upload' ? 'active' : ''}`} onClick={() => { setModalTab('upload'); setSyncError(null); }}>
                Upload File (.csv / .json)
              </button>
              <button className={`tab-btn-portal ${modalTab === 'api' ? 'active' : ''}`} onClick={() => { setModalTab('api'); setSyncError(null); }}>
                API Key Integration
              </button>
            </div>
            <div className="modal-body-portal">
              {syncError && <div className="modal-error-banner">{syncError}</div>}
              {syncSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle size={16} />
                  <span>Analysis complete! Refreshing dashboard metrics...</span>
                </div>
              )}
              {modalTab === 'upload' && (
                <form onSubmit={handleUploadSubmit} className="upload-form-portal">
                  <div className="upload-dropzone">
                    <Upload size={32} className="dropzone-icon" />
                    <p className="dropzone-text">Drop your identity data file here</p>
                    <span className="dropzone-sub">CSV · JSON · Excel (.xlsx) · LDIF · SQL — enterprise import formats supported</span>
                    <input type="file" accept=".csv,.xlsx,.json,.ldif,.sql" onChange={handleFileUploadChange} className="dropzone-file-input" id="identity-file-upload" />
                    <label htmlFor="identity-file-upload" className="dropzone-select-btn">Choose File</label>
                    {uploadFile && <div className="selected-filename">Selected: {uploadFile.name}</div>}
                  </div>
                  <div className="modal-actions-portal">
                    <button type="button" className="cancel-btn" onClick={() => setShowSyncModal(false)}>Cancel</button>
                    <button type="submit" className="submit-btn" disabled={syncLoading || !uploadFile}>
                      {syncLoading ? 'Analyzing...' : 'Upload & Analyze Data'}
                    </button>
                  </div>
                </form>
              )}
              {modalTab === 'api' && (
                <form onSubmit={handleApiSyncSubmit} className="api-form-portal">
                  <div className="form-group-portal">
                    <label htmlFor="api-key-input">API Token / Access Key</label>
                    <input type="password" id="api-key-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your API token here..." className="portal-input" />
                    <p className="field-hint">Your token is used securely to fetch and analyse identity data.</p>
                  </div>
                  <div className="modal-actions-portal">
                    <button type="button" className="cancel-btn" onClick={() => setShowSyncModal(false)}>Cancel</button>
                    <button type="submit" className="submit-btn" disabled={syncLoading || !apiKey.trim()}>
                      {syncLoading ? 'Connecting...' : 'Connect & Import Stats'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inactivity Warning Modal */}
      {showWarning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '28px',
            maxWidth: '380px',
            width: '100%',
            margin: '0 16px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={20} color="#f59e0b" />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                Session About to Expire
              </h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              You've been inactive for a while. You'll be logged out automatically unless you stay active.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={stayActive}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Stay Logged In
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Logout Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;