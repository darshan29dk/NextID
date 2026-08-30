import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  RefreshCw,
  UserX,
  UserCheck,
  Shield,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Zap,
  Activity,
  Layers,
  ChevronRight,
  Database,
  SlidersHorizontal,
  Fingerprint,
  Cpu,
  GitBranch,
  Play,
  Eye,
  Check,
  X,
  Sparkles
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { apiClient } from '../../services/dashboardService';
import './JMLWorkbench.css';

const JMLWorkbench = () => {
  const [activeTab, setActiveTab] = useState('OPERATIONS'); // 'OPERATIONS' | 'AUDIT_FEED' | 'PRINCIPALS'
  const [metrics, setMetrics] = useState({
    total_events: 0,
    joiners: 0,
    movers: 0,
    leavers: 0,
    rehires: 0,
    active_principals: 0,
    frozen_principals: 0,
    active_birthright_policies: 0
  });
  const [events, setEvents] = useState([]);
  const [principals, setPrincipals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Operation Wizard State
  const [selectedOperation, setSelectedOperation] = useState('JOINER'); // 'JOINER' | 'MOVER' | 'LEAVER' | 'REHIRE'
  const [formPrincipalType, setFormPrincipalType] = useState('HUMAN'); // 'HUMAN' | 'AI_AGENT' | 'SERVICE_ACCOUNT'
  const [formPrincipalId, setFormPrincipalId] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDepartment, setFormDepartment] = useState('Engineering');
  const [formJobTitle, setFormJobTitle] = useState('Senior Site Reliability Engineer');
  const [formManager, setFormManager] = useState('');
  const [formLocation, setFormLocation] = useState('US-East');
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Dynamic Role Options from Role Engineering & Identity Repository
  const [roleOptions, setRoleOptions] = useState({
    departments: [
      'Engineering',
      'Security',
      'IT & Infrastructure',
      'Finance',
      'Operations',
      'Product',
      'Human Resources',
      'Sales & Marketing'
    ],
    roles_by_department: {
      'Engineering': [
        'Senior Site Reliability Engineer',
        'Cloud Infrastructure Architect',
        'Staff Backend Engineer',
        'DevOps Automation Specialist',
        'Principal Software Engineer',
        'Lead Systems Architect',
        'Frontend Platform Engineer'
      ],
      'Security': [
        'Security Operations Analyst',
        'IAM Infrastructure Lead',
        'Cloud Security Engineer',
        'Lead Penetration Tester',
        'Threat Intelligence Specialist',
        'GRC & Audit Officer'
      ],
      'IT & Infrastructure': [
        'IT Systems Administrator',
        'Senior Network Engineer',
        'Database Administrator',
        'Enterprise Service Desk Lead',
        'Virtualization Engineer'
      ],
      'Finance': [
        'Financial Controller',
        'Accounts Payable Specialist',
        'Corporate Treasury Analyst',
        'Senior Payroll Accountant',
        'Internal Audit Manager'
      ],
      'Operations': [
        'Operations Strategy Lead',
        'Global Logistics Coordinator',
        'Facilities Operations Manager',
        'Business Process Analyst'
      ],
      'Product': [
        'Principal Product Manager',
        'Technical Product Owner',
        'UX Research Lead',
        'Product Operations Manager'
      ],
      'Human Resources': [
        'People Operations Partner',
        'Talent Acquisition Lead',
        'HR Compliance Director',
        'Total Rewards Specialist'
      ],
      'Sales & Marketing': [
        'Enterprise Account Executive',
        'Solutions Architect (Pre-Sales)',
        'Product Marketing Manager',
        'Demand Generation Specialist'
      ]
    }
  });

  // Inspection Modal
  const [inspectEvent, setInspectEvent] = useState(null);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [metricsRes, eventsRes, principalsRes, roleOptsRes] = await Promise.allSettled([
        apiClient.get('/v1/jml/metrics'),
        apiClient.get('/v1/jml/events'),
        apiClient.get('/v1/jml/principals'),
        apiClient.get('/v1/jml/role-options')
      ]);

      if (metricsRes.status === 'fulfilled' && metricsRes.value?.data && typeof metricsRes.value.data === 'object') {
        setMetrics(metricsRes.value.data);
      }
      if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value?.data)) {
        setEvents(eventsRes.value.data);
      }
      if (principalsRes.status === 'fulfilled' && Array.isArray(principalsRes.value?.data)) {
        setPrincipals(principalsRes.value.data);
      }
      if (roleOptsRes.status === 'fulfilled' && roleOptsRes.value?.data?.roles_by_department) {
        setRoleOptions(roleOptsRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load JML data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleDepartmentChange = (dept) => {
    setFormDepartment(dept);
    const availableRoles = roleOptions.roles_by_department?.[dept] || [];
    if (availableRoles.length > 0) {
      setFormJobTitle(availableRoles[0]);
    }
  };

  const principalList = Array.isArray(principals) ? principals : [];
  const eventList = Array.isArray(events) ? events : [];

  const handleSelectPrincipal = (pId) => {
    setFormPrincipalId(pId);
    const p = principalList.find(item => item && item.id === pId);
    if (p) {
      setFormDisplayName(p.display_name || '');
      setFormEmail(p.email || '');
    }
    setSimulationResult(null);
    setActionSuccess(null);
    setActionError(null);
  };

  const handleRunSimulation = async () => {
    if (!formPrincipalId.trim()) {
      setActionError('Principal Identifier is required for pre-flight simulation.');
      return;
    }
    try {
      setSimulating(true);
      setActionError(null);
      setActionSuccess(null);
      const payload = {
        event_type: selectedOperation,
        principal_id: formPrincipalId.trim(),
        attributes: {
          principal_type: formPrincipalType,
          department: formDepartment,
          job_title: formJobTitle,
          manager: formManager.trim() || undefined,
          location: formLocation
        }
      };
      const res = await apiClient.post('/v1/jml/simulate', payload);
      setSimulationResult(res.data);
    } catch (err) {
      console.error('Simulation error:', err);
      setActionError(err.response?.data?.detail || 'Simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  const handleExecuteLifecycleEvent = async () => {
    if (!formPrincipalId.trim()) {
      setActionError('Principal Identifier is required.');
      return;
    }
    try {
      setExecuting(true);
      setActionError(null);
      setActionSuccess(null);

      const effectiveDisplayName = formDisplayName.trim() || formPrincipalId.trim();
      const payload = {
        event_type: selectedOperation,
        principal_id: formPrincipalId.trim(),
        display_name: effectiveDisplayName,
        email: formEmail.trim() || `${formPrincipalId.trim()}@nextid.internal`,
        attributes: {
          principal_type: formPrincipalType,
          department: formDepartment,
          job_title: formJobTitle,
          manager: formManager.trim() || undefined,
          location: formLocation
        }
      };

      const res = await apiClient.post('/v1/jml/events', payload);
      setActionSuccess(`[${selectedOperation} PROCESSED] Successfully onboarded/transitioned Principal ${formPrincipalId}. Authority epoch incremented and policies applied.`);
      setSimulationResult(null);
      fetchAllData();
    } catch (err) {
      console.error('Execution error:', err);
      setActionError(err.response?.data?.detail || 'Failed to execute lifecycle event.');
    } finally {
      setExecuting(false);
    }
  };

  const filteredEvents = eventList.filter(e => {
    if (!e) return false;
    const matchesType = filterType === 'ALL' || String(e.event_type || '').toUpperCase() === filterType;
    const matchesSearch = !searchQuery ||
      String(e.principal_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(e.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getEventBadge = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'JOINER': return <span className="jml-badge joiner"><UserPlus size={12} /> Joiner</span>;
      case 'MOVER': return <span className="jml-badge mover"><RefreshCw size={12} /> Mover</span>;
      case 'LEAVER': return <span className="jml-badge leaver"><UserX size={12} /> Leaver</span>;
      case 'REHIRE': return <span className="jml-badge rehire"><UserCheck size={12} /> Rehire</span>;
      default: return <span className="jml-badge generic">{type}</span>;
    }
  };

  return (
    <div className="jml-hub-page">
      <Breadcrumb items={[{ label: 'Identity Lifecycle (JML)', active: true }]} />

      {/* Top Header */}
      <div className="jml-hub-header">
        <div>
          <div className="jml-title-row">
            <h2>Identity Lifecycle (JML) Control Center</h2>
            <span className="live-status-pill">● Engine Active</span>
          </div>
          <p className="jml-hub-sub">
            Centralized orchestration connecting HRMS onboarding (Joiner), attribute-driven birthright shifts (Mover), emergency freeze & dual-lineage cascade revocation (Leaver), and zero-trust reactivation (Rehire).
          </p>
        </div>
        <div className="jml-tab-switcher">
          <button 
            className={`tab-btn ${activeTab === 'OPERATIONS' ? 'active' : ''}`}
            onClick={() => setActiveTab('OPERATIONS')}
          >
            <Zap size={14} /> Operations & Dispatcher
          </button>
            <button 
              className={`tab-btn ${activeTab === 'AUDIT_FEED' ? 'active' : ''}`}
              onClick={() => setActiveTab('AUDIT_FEED')}
            >
              <FileText size={14} /> Event Audit Feed ({eventList.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'PRINCIPALS' ? 'active' : ''}`}
              onClick={() => setActiveTab('PRINCIPALS')}
            >
              <Fingerprint size={14} /> Principals Directory ({principalList.length})
            </button>
          </div>
        </div>

      {/* KPI Cards */}
      <div className="jml-kpi-grid">
        <div className="jml-kpi-card total">
          <div className="kpi-icon"><Activity size={20} /></div>
          <div className="kpi-info">
            <span className="kpi-title">Total Lifecycle Events</span>
            <span className="kpi-number">{metrics.total_events || events.length}</span>
            <span className="kpi-sub">HRMS & System synced</span>
          </div>
        </div>

        <div className="jml-kpi-card joiner">
          <div className="kpi-icon"><UserPlus size={20} /></div>
          <div className="kpi-info">
            <span className="kpi-title">Active Joiners</span>
            <span className="kpi-number">{metrics.joiners || 0}</span>
            <span className="kpi-sub">Birthright auto-assigned</span>
          </div>
        </div>

        <div className="jml-kpi-card mover">
          <div className="kpi-icon"><RefreshCw size={20} /></div>
          <div className="kpi-info">
            <span className="kpi-title">Mover Transitions</span>
            <span className="kpi-number">{metrics.movers || 0}</span>
            <span className="kpi-sub">Epoch shifts & SoD checks</span>
          </div>
        </div>

        <div className="jml-kpi-card leaver">
          <div className="kpi-icon"><UserX size={20} /></div>
          <div className="kpi-info">
            <span className="kpi-title">Frozen Leavers</span>
            <span className="kpi-number">{metrics.leavers || 0}</span>
            <span className="kpi-sub">Cascade revocations locked</span>
          </div>
        </div>

        <div className="jml-kpi-card rehire">
          <div className="kpi-icon"><UserCheck size={20} /></div>
          <div className="kpi-info">
            <span className="kpi-title">Zero-Trust Rehires</span>
            <span className="kpi-number">{metrics.rehires || 0}</span>
            <span className="kpi-sub">Clean epoch evaluation</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {actionSuccess && (
        <div className="jml-alert success">
          <CheckCircle2 size={16} /> {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="jml-alert error">
          <AlertTriangle size={16} /> {actionError}
        </div>
      )}

      {/* TAB 1: OPERATIONS & DISPATCHER */}
      {activeTab === 'OPERATIONS' && (
        <div className="jml-operations-grid">
          {/* Left Panel: Operation Configuration */}
          <div className="jml-panel operation-panel">
            <div className="panel-header">
              <h3><Zap size={16} /> Lifecycle Transition Dispatcher</h3>
              <span className="badge-step">Workflow Engine Connected</span>
            </div>

            {/* Operation Type Selector */}
            <div className="operation-selector">
              <button 
                className={`op-btn joiner ${selectedOperation === 'JOINER' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedOperation('JOINER');
                  setFormPrincipalId(`usr_${Math.floor(1000 + Math.random() * 9000)}`);
                  setSimulationResult(null);
                }}
              >
                <UserPlus size={16} />
                <div>
                  <strong>Joiner</strong>
                  <span>Onboard & Birthright</span>
                </div>
              </button>

              <button 
                className={`op-btn mover ${selectedOperation === 'MOVER' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedOperation('MOVER');
                  setSimulationResult(null);
                }}
              >
                <RefreshCw size={16} />
                <div>
                  <strong>Mover</strong>
                  <span>Role & Attribute Shift</span>
                </div>
              </button>

              <button 
                className={`op-btn leaver ${selectedOperation === 'LEAVER' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedOperation('LEAVER');
                  setSimulationResult(null);
                }}
              >
                <UserX size={16} />
                <div>
                  <strong>Leaver</strong>
                  <span>Emergency Freeze</span>
                </div>
              </button>

              <button 
                className={`op-btn rehire ${selectedOperation === 'REHIRE' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedOperation('REHIRE');
                  setSimulationResult(null);
                }}
              >
                <UserCheck size={16} />
                <div>
                  <strong>Rehire</strong>
                  <span>Zero-Trust Reactivation</span>
                </div>
              </button>
            </div>

            {/* Form Fields */}
            <div className="jml-form-body">
              {selectedOperation !== 'JOINER' && (
                <div className="form-item">
                  <label>Select Existing Principal *</label>
                  <select 
                    value={formPrincipalId}
                    onChange={(e) => handleSelectPrincipal(e.target.value)}
                  >
                    <option value="">-- Choose Principal --</option>
                    {principalList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id} ({p.display_name || 'No Name'}) - {p.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedOperation === 'JOINER' && (
                <div className="form-item">
                  <label>Principal Authority Type *</label>
                  <select 
                    value={formPrincipalType}
                    onChange={(e) => setFormPrincipalType(e.target.value)}
                  >
                    <option value="HUMAN">👤 Human Employee / Contractor</option>
                    <option value="AI_AGENT">🤖 Autonomous AI Agent / Bot</option>
                    <option value="SERVICE_ACCOUNT">⚙️ Application Service Account</option>
                  </select>
                </div>
              )}

              <div className="form-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>Principal ID *</label>
                  {selectedOperation === 'JOINER' && (
                    <button 
                      type="button"
                      onClick={() => setFormPrincipalId(`usr_${Math.floor(1000 + Math.random() * 9000)}`)}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Auto-generate ID
                    </button>
                  )}
                </div>
                <input 
                  type="text" 
                  value={formPrincipalId}
                  onChange={(e) => setFormPrincipalId(e.target.value)}
                  placeholder="e.g. usr_1048"
                  required
                />
              </div>

              {(selectedOperation === 'JOINER' || selectedOperation === 'REHIRE') && (
                <div className="form-row">
                  <div className="form-item">
                    <label>Full Display Name</label>
                    <input 
                      type="text" 
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      placeholder="e.g. Alex Mercer"
                    />
                  </div>
                  <div className="form-item">
                    <label>Corporate Email</label>
                    <input 
                      type="email" 
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="e.g. alex.m@corp.internal"
                    />
                  </div>
                </div>
              )}

              {(selectedOperation === 'JOINER' || selectedOperation === 'MOVER' || selectedOperation === 'REHIRE') && (
                <div className="form-row">
                  <div className="form-item">
                    <label>Target Department (Role Engineering) *</label>
                    <select 
                      value={formDepartment}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                    >
                      {(roleOptions.departments || []).map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-item">
                    <label>Target Job Title / Engineered Role *</label>
                    <select 
                      value={formJobTitle}
                      onChange={(e) => setFormJobTitle(e.target.value)}
                    >
                      {((roleOptions.roles_by_department && roleOptions.roles_by_department[formDepartment]) || [
                        'Senior Site Reliability Engineer',
                        'Cloud Infrastructure Architect',
                        'Staff Backend Engineer',
                        'DevOps Automation Specialist',
                        'Principal Software Engineer'
                      ]).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {selectedOperation === 'JOINER' && (
                <div className="form-row">
                  <div className="form-item">
                    <label>{formPrincipalType === 'HUMAN' ? 'Reporting Manager ID' : 'Responsible Sponsor ID'}</label>
                    <input 
                      type="text" 
                      value={formManager}
                      onChange={(e) => setFormManager(e.target.value)}
                      placeholder="e.g. usr_1001 or admin"
                    />
                  </div>
                  <div className="form-item">
                    <label>Location / Region</label>
                    <select 
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                    >
                      <option value="US-East">US-East (N. Virginia)</option>
                      <option value="US-West">US-West (Oregon)</option>
                      <option value="EU-Central">EU-Central (Frankfurt)</option>
                      <option value="APAC-South">APAC-South (Mumbai)</option>
                      <option value="Remote">Global Remote</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedOperation === 'LEAVER' && (
                <div className="leaver-action-callout">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>Leaver Invariant Enforcement:</strong>
                    <p>Executing will set <code>status: FROZEN</code>, bump authority epoch to invalidate active tokens, and initiate automated dual-lineage cascade revocation across AWS, GitHub, and SaaS sub-delegations.</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="form-actions-row">
                <button 
                  className="btn-simulate"
                  onClick={handleRunSimulation}
                  disabled={simulating || executing}
                >
                  <Sparkles size={14} /> {simulating ? 'Simulating Impact...' : 'Pre-Flight Simulation'}
                </button>
                <button 
                  className={`btn-commit ${selectedOperation.toLowerCase()}`}
                  onClick={handleExecuteLifecycleEvent}
                  disabled={executing || simulating}
                >
                  <Play size={14} /> {executing ? 'Executing Pipeline...' : `Commit ${selectedOperation} Transition`}
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Live Impact Simulation Preview */}
          <div className="jml-panel preview-panel">
            <div className="panel-header">
              <h3><Eye size={16} /> Workflow Impact & Policy Projection</h3>
              {simulationResult ? (
                <span className="badge-ready">Pre-Flight Certified</span>
              ) : (
                <span className="badge-idle">Awaiting Simulation</span>
              )}
            </div>

            {!simulationResult ? (
              <div className="empty-preview">
                <SlidersHorizontal size={36} />
                <p>Run a <strong>Pre-Flight Simulation</strong> to inspect projected Birthright Policies, Segregation of Duties (SoD) conflicts, and Cascade Revocation blast radius before committing.</p>
              </div>
            ) : (
              <div className="simulation-body">
                <div className="sim-meta-grid">
                  <div className="sim-meta-item">
                    <span className="meta-lbl">Target Principal:</span>
                    <span className="meta-val font-mono">{simulationResult.principal_id}</span>
                  </div>
                  <div className="sim-meta-item">
                    <span className="meta-lbl">Current Status:</span>
                    <span className="meta-val">{simulationResult.current_status}</span>
                  </div>
                  <div className="sim-meta-item">
                    <span className="meta-lbl">Current Epoch:</span>
                    <span className="meta-val">{simulationResult.current_epoch}</span>
                  </div>
                  <div className="sim-meta-item">
                    <span className="meta-lbl">Projected Epoch:</span>
                    <span className="meta-val highlight">{simulationResult.projected_epoch}</span>
                  </div>
                </div>

                {/* Impact Summary */}
                <div className="sim-section">
                  <h4><CheckCircle2 size={14} className="text-success" /> Projected Workflow Actions</h4>
                  <ul className="impact-list">
                    {simulationResult.impact_summary?.map((act, i) => (
                      <li key={i}><ChevronRight size={13} /> {act}</li>
                    ))}
                  </ul>
                </div>

                {/* Birthright Policies */}
                {simulationResult.birthright_matches && simulationResult.birthright_matches.length > 0 && (
                  <div className="sim-section">
                    <h4><Shield size={14} className="text-primary" /> Matched Birthright Policies ({simulationResult.birthright_matches.length})</h4>
                    <div className="policy-chips">
                      {simulationResult.birthright_matches.map((p, i) => (
                        <div key={i} className="policy-chip">
                          <span className="policy-name">{p.policy_name || p.name || p.entitlement_id}</span>
                          <span className="policy-badge">Auto-Provision</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SoD Conflicts */}
                {simulationResult.sod_conflicts && simulationResult.sod_conflicts.length > 0 ? (
                  <div className="sim-section sod-alert-box">
                    <h4><ShieldAlert size={14} className="text-danger" /> SoD Toxic Conflicts Detected ({simulationResult.sod_conflicts.length})</h4>
                    <p className="sod-warning-text">Transition introduces Segregation of Duties conflicts. An Approval Workflow request will be required.</p>
                  </div>
                ) : (
                  <div className="sim-section sod-ok-box">
                    <span><CheckCircle2 size={13} /> Zero SoD Toxic Conflicts Detected</span>
                  </div>
                )}

                {/* Cascade Blast Radius */}
                {simulationResult.cascade_blast_radius && (
                  <div className="sim-section blast-box">
                    <h4><Zap size={14} className="text-warning" /> Cascade Revocation Blast Radius</h4>
                    <div className="blast-stats">
                      <span>Accounts to Disable: <strong>{simulationResult.cascade_blast_radius.accounts_count || 0}</strong></span>
                      <span>Delegations Revoked: <strong>{simulationResult.cascade_blast_radius.delegations_count || 0}</strong></span>
                      <span>Credentials Invalidated: <strong>{simulationResult.cascade_blast_radius.credentials_count || 0}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EVENT AUDIT FEED */}
      {activeTab === 'AUDIT_FEED' && (
        <div className="jml-audit-container">
          <div className="audit-toolbar">
            <div className="search-input-wrap">
              <Search size={14} />
              <input 
                type="text" 
                placeholder="Search by Principal ID or Event ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="filter-group">
              {['ALL', 'JOINER', 'MOVER', 'LEAVER', 'REHIRE'].map(type => (
                <button 
                  key={type}
                  className={`chip ${filterType === type ? 'active' : ''}`}
                  onClick={() => setFilterType(type)}
                >
                  {type}
                </button>
              ))}
              <button className="btn-refresh" onClick={fetchAllData} title="Refresh Feed">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          <table className="jml-audit-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Lifecycle Type</th>
                <th>Target Principal</th>
                <th>Source</th>
                <th>Status</th>
                <th>Effective Timestamp</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-table-row">No lifecycle events recorded.</td>
                </tr>
              ) : (
                filteredEvents.map(evt => (
                  <tr key={evt.id || Math.random()}>
                    <td className="font-mono text-muted">{evt.id ? String(evt.id).substring(0, 18) : 'N/A'}...</td>
                    <td>{getEventBadge(evt.event_type)}</td>
                    <td className="font-bold">{evt.principal_id}</td>
                    <td><span className="source-tag">{evt.source || 'HRMS'}</span></td>
                    <td><span className="status-tag success"><CheckCircle2 size={12} /> {evt.status}</span></td>
                    <td className="text-muted">{evt.created_at ? new Date(evt.created_at).toLocaleString() : 'Just now'}</td>
                    <td>
                      <button className="btn-inspect" onClick={() => setInspectEvent(evt)}>
                        Inspect <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: PRINCIPALS REGISTRY */}
      {activeTab === 'PRINCIPALS' && (
        <div className="jml-audit-container">
          <div className="audit-toolbar">
            <div className="search-input-wrap">
              <Search size={14} />
              <input 
                type="text" 
                placeholder="Search principal directory..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn-refresh" onClick={fetchAllData} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>

          <table className="jml-audit-table">
            <thead>
              <tr>
                <th>Principal ID</th>
                <th>Type</th>
                <th>Display Name & Email</th>
                <th>Department & Role</th>
                <th>Authority Epoch</th>
                <th>Status</th>
                <th>Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody>
              {principalList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-table-row">No principals registered in directory.</td>
                </tr>
              ) : (
                principalList
                  .filter(p => !p ? false : (!searchQuery || String(p.id || '').toLowerCase().includes(searchQuery.toLowerCase()) || String(p.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || String(p.department || '').toLowerCase().includes(searchQuery.toLowerCase())))
                  .map(p => (
                    <tr key={p.id}>
                      <td className="font-mono font-bold">{p.id}</td>
                      <td>
                        <span className="source-tag" style={{
                          background: p.principal_type === 'AI_AGENT' ? 'rgba(168, 85, 247, 0.15)' : p.principal_type === 'SERVICE_ACCOUNT' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: p.principal_type === 'AI_AGENT' ? '#c084fc' : p.principal_type === 'SERVICE_ACCOUNT' ? '#fbbf24' : '#60a5fa',
                          borderColor: p.principal_type === 'AI_AGENT' ? 'rgba(168, 85, 247, 0.3)' : p.principal_type === 'SERVICE_ACCOUNT' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                        }}>
                          {p.principal_type || 'HUMAN'}
                        </span>
                      </td>
                      <td>
                        <div>
                          <strong>{p.display_name || 'N/A'}</strong>
                          <div className="text-muted" style={{ fontSize: '11px' }}>{p.email || 'N/A'}</div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <span>{p.department || 'General'}</span>
                          <div className="text-muted" style={{ fontSize: '11px' }}>{p.job_title || 'Staff'}</div>
                        </div>
                      </td>
                      <td><span className="epoch-pill">Epoch {p.authority_epoch ?? 1}</span></td>
                      <td>
                        <span className={`status-tag ${String(p.status || '').toLowerCase()}`}>
                          {p.is_frozen ? '● Frozen' : `● ${p.status || 'Active'}`}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!p.is_frozen ? (
                            <>
                              <button 
                                className="btn-inspect"
                                title="Promote or Change Role (Mover)"
                                onClick={() => {
                                  handleSelectPrincipal(p.id);
                                  setSelectedOperation('MOVER');
                                  setActiveTab('OPERATIONS');
                                }}
                              >
                                Mover <RefreshCw size={11} />
                              </button>
                              <button 
                                className="btn-inspect"
                                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                                title="Emergency Freeze & Cascade Revocation"
                                onClick={() => {
                                  handleSelectPrincipal(p.id);
                                  setSelectedOperation('LEAVER');
                                  setActiveTab('OPERATIONS');
                                }}
                              >
                                Freeze <UserX size={11} />
                              </button>
                            </>
                          ) : (
                            <button 
                              className="btn-inspect"
                              style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
                              title="Rehire with Clean Epoch"
                              onClick={() => {
                                handleSelectPrincipal(p.id);
                                setSelectedOperation('REHIRE');
                                setActiveTab('OPERATIONS');
                              }}
                            >
                              Rehire <UserCheck size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspection Modal */}
      {inspectEvent && (
        <div className="jml-modal-overlay">
          <div className="jml-modal">
            <div className="jml-modal-header">
              <h3><FileText size={18} /> Lifecycle Event Evidence: {inspectEvent.id}</h3>
              <button className="close-btn" onClick={() => setInspectEvent(null)}>×</button>
            </div>
            <div className="inspect-body">
              <div className="inspect-row">
                <span className="lbl">Type:</span>
                <span>{getEventBadge(inspectEvent.event_type)}</span>
              </div>
              <div className="inspect-row">
                <span className="lbl">Principal:</span>
                <span className="font-bold">{inspectEvent.principal_id}</span>
              </div>
              <div className="inspect-row">
                <span className="lbl">Source:</span>
                <span>{inspectEvent.source || 'HRMS'}</span>
              </div>
              <div className="inspect-row">
                <span className="lbl">Timestamp:</span>
                <span>{inspectEvent.created_at ? new Date(inspectEvent.created_at).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="json-box">
                <label>Engine Payload & Workflow Verification</label>
                <pre>{JSON.stringify(inspectEvent.payload || {}, null, 2)}</pre>
              </div>
            </div>
            <div className="jml-modal-actions">
              <button className="btn-commit" onClick={() => setInspectEvent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JMLWorkbench;
