import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Zap, 
  Terminal, 
  Plus, 
  RefreshCw,
  GitBranch,
  Cloud,
  Cpu,
  Server,
  Filter
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { apiClient } from '../../services/dashboardService';
import './RevocationWorkspace.css';

const RevocationWorkspace = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  
  // Modal state for triggering new real revocation job
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [targetType, setTargetType] = useState('GITHUB');
  const [targetIdentity, setTargetIdentity] = useState('');
  const [targetEntitlement, setTargetEntitlement] = useState('');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.target_type = filterType;
      
      const res = await apiClient.get('/revocation/jobs', { params });
      setJobs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch revocation jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [filterStatus, filterType]);

  const handleTriggerRevocation = async (e) => {
    e.preventDefault();
    if (!targetIdentity.trim() || !targetEntitlement.trim()) {
      setActionError('Please enter both target identity and entitlement.');
      return;
    }
    
    try {
      setSubmitting(true);
      setActionError(null);
      await apiClient.post('/revocation/trigger', {
        target_type: targetType,
        target_identity: targetIdentity.trim(),
        target_entitlement: targetEntitlement.trim(),
        simulated_failure: simulateFailure
      });
      
      setShowTriggerModal(false);
      setTargetIdentity('');
      setTargetEntitlement('');
      setSimulateFailure(false);
      fetchJobs();
    } catch (err) {
      console.error(err);
      setActionError(err.response?.data?.detail || 'Failed to trigger revocation job.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryJob = async (jobId, forceSuccess = false) => {
    try {
      await apiClient.post(`/revocation/jobs/${jobId}/retry`, null, {
        params: { force_success: forceSuccess }
      });
      fetchJobs();
    } catch (err) {
      console.error('Retry error:', err);
      alert('Failed to retry revocation job.');
    }
  };

  // Metrics
  const totalCount = jobs.length;
  const confirmedCount = jobs.filter(j => j.status === 'CONFIRMED').length;
  const escalatedCount = jobs.filter(j => j.status === 'ESCALATED').length;
  const inProgressCount = jobs.filter(j => j.status === 'IN_PROGRESS' || j.status === 'PENDING' || j.status === 'FAILED').length;

  const getTypeIcon = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'GITHUB': return <GitBranch size={16} className="type-icon github" />;
      case 'AWS_IAM': return <Cloud size={16} className="type-icon aws" />;
      case 'MCP_SESSION': return <Cpu size={16} className="type-icon mcp" />;
      default: return <Server size={16} className="type-icon generic" />;
    }
  };

  const getStatusBadge = (job) => {
    switch (job.status) {
      case 'CONFIRMED':
        return (
          <span className="revocation-badge confirmed">
            <CheckCircle2 size={12} /> Confirmed
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="revocation-badge escalated">
            <AlertTriangle size={12} /> Escalated (3/3 Failed)
          </span>
        );
      case 'FAILED':
        return (
          <span className="revocation-badge failed">
            <RotateCw size={12} /> Failed ({job.retry_count}/{job.max_retries})
          </span>
        );
      default:
        return (
          <span className="revocation-badge in-progress">
            <Clock size={12} /> In Progress ({job.retry_count}/{job.max_retries})
          </span>
        );
    }
  };

  return (
    <div className="revocation-workspace-page">
      <Breadcrumb items={[{ label: 'Governance', path: '/governance/dashboard' }, { label: 'Revocation Engine', active: true }]} />
      
      {/* Header Banner */}
      <div className="revocation-header">
        <div>
          <h2>Real Revocation Engine</h2>
          <p>Execute and audit real-time entitlement revocations across GitHub, AWS IAM, and MCP Sessions.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="revocation-btn secondary" onClick={fetchJobs}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="revocation-btn primary" onClick={() => setShowTriggerModal(true)}>
            <Plus size={14} /> Trigger Revocation Hook
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="revocation-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">Total Revocation Jobs</span>
          <span className="kpi-value">{totalCount}</span>
        </div>
        <div className="kpi-card confirmed">
          <span className="kpi-title">Actually Confirmed</span>
          <span className="kpi-value">{confirmedCount}</span>
        </div>
        <div className="kpi-card in-progress">
          <span className="kpi-title">In Progress / Retrying</span>
          <span className="kpi-value">{inProgressCount}</span>
        </div>
        <div className="kpi-card escalated">
          <span className="kpi-title">Escalated (3 Retries Failed)</span>
          <span className="kpi-value">{escalatedCount}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="revocation-filters-bar">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="revocation-select">
            <option value="">All Identity Types</option>
            <option value="GITHUB">GitHub Org/Repo</option>
            <option value="AWS_IAM">AWS IAM User/Policy</option>
            <option value="MCP_SESSION">MCP Session Kill</option>
            <option value="GENERIC">Generic Connector</option>
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="revocation-select">
            <option value="">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="FAILED">Failed</option>
            <option value="ESCALATED">Escalated</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="revocation-table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading revocation jobs...</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No revocation jobs found. Click "Trigger Revocation Hook" to start a job.
          </div>
        ) : (
          <table className="revocation-table">
            <thead>
              <tr>
                <th>Target Type</th>
                <th>Target Identity</th>
                <th>Target Entitlement</th>
                <th>Status</th>
                <th>Attempted At</th>
                <th>Confirmed At</th>
                <th>Retries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getTypeIcon(job.target_type)}
                      <span style={{ fontWeight: 600 }}>{job.target_type}</span>
                    </div>
                  </td>
                  <td className="mono">{job.target_identity}</td>
                  <td>{job.target_entitlement}</td>
                  <td>{getStatusBadge(job)}</td>
                  <td className="time-col">
                    {job.attempted_at ? new Date(job.attempted_at).toLocaleString() : '—'}
                  </td>
                  <td className="time-col confirmed-time">
                    {job.confirmed_at ? (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        {new Date(job.confirmed_at).toLocaleString()}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not Confirmed</span>
                    )}
                  </td>
                  <td>
                    <span className={`retry-count-badge ${job.retry_count >= job.max_retries ? 'max' : ''}`}>
                      {job.retry_count} / {job.max_retries}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {job.status !== 'CONFIRMED' && (
                        <button
                          className="table-action-btn retry"
                          onClick={() => handleRetryJob(job.id, false)}
                          title="Retry Revocation Hook"
                        >
                          <RotateCw size={12} /> Retry
                        </button>
                      )}
                      {job.status === 'ESCALATED' && (
                        <button
                          className="table-action-btn force-confirm"
                          onClick={() => handleRetryJob(job.id, true)}
                          title="Manually Confirm Access Removal"
                        >
                          <CheckCircle2 size={12} /> Confirm
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trigger Revocation Hook Modal */}
      {showTriggerModal && (
        <div className="revocation-modal-overlay">
          <div className="revocation-modal">
            <h3>Trigger Revocation Hook</h3>
            <p className="modal-sub">Execute target system hook with confirmed status tracking and 3-retry escalation policy.</p>

            {actionError && <div className="modal-error">{actionError}</div>}

            <form onSubmit={handleTriggerRevocation}>
              <div className="form-group">
                <label>Target Identity Type</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="revocation-select full"
                >
                  <option value="GITHUB">GitHub (Repo / Org Access)</option>
                  <option value="AWS_IAM">AWS IAM (User Policy / Group)</option>
                  <option value="MCP_SESSION">MCP Session Kill (Subagent / Token)</option>
                  <option value="GENERIC">Generic Connector</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Identity Identifier</label>
                <input
                  type="text"
                  placeholder={
                    targetType === 'GITHUB' ? 'e.g. octocat or dev@corp.com' :
                    targetType === 'AWS_IAM' ? 'e.g. arn:aws:iam::123456789:user/dev_user' :
                    targetType === 'MCP_SESSION' ? 'e.g. mcp-session-subagent-99' : 'e.g. john.smith'
                  }
                  value={targetIdentity}
                  onChange={(e) => setTargetIdentity(e.target.value)}
                  className="revocation-input"
                />
              </div>

              <div className="form-group">
                <label>Target Entitlement / Policy / Token to Revoke</label>
                <input
                  type="text"
                  placeholder={
                    targetType === 'GITHUB' ? 'e.g. Repository Admin Access' :
                    targetType === 'AWS_IAM' ? 'e.g. AdministratorAccess Policy' :
                    targetType === 'MCP_SESSION' ? 'e.g. Token_Session_Key_881' : 'e.g. Admin_Role'
                  }
                  value={targetEntitlement}
                  onChange={(e) => setTargetEntitlement(e.target.value)}
                  className="revocation-input"
                />
              </div>

              <div className="form-group checkbox">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={simulateFailure}
                    onChange={(e) => setSimulateFailure(e.target.checked)}
                  />
                  <span>Simulate Hook Failure (Test Retry & Escalation Engine)</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="revocation-btn secondary"
                  onClick={() => setShowTriggerModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="revocation-btn primary"
                  disabled={submitting}
                >
                  {submitting ? 'Executing Hook...' : 'Execute Revocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevocationWorkspace;
