import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, ShieldAlert, AlertTriangle, CheckCircle, Clock, 
  RotateCw, Play, Search, Eye, Filter, RefreshCw, FileText, Download, ChevronDown, ChevronRight
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import Toast from '../../components/Toast/Toast';
import DelegationGraphView from './DelegationGraphView';
import { 
  getRevocationStats, 
  getRevocationEvents, 
  getRevocationEvent, 
  getRevocationEventStatus, 
  triggerRevocation, 
  simulateRevocation, 
  getOrphanedAuthorityReport,
  exportComplianceReport
} from '../../services/cascadeRevocationService';
import { getIdentities } from '../../services/identityService';
import './CascadeRevocation.css';

const CascadeRevocation = () => {
  // Role & Permissions
  const userRole = localStorage.getItem('user_role') || 'Platform Administrator';
  const canApproveRevocation = userRole === 'Platform Administrator' || userRole === 'Security Officer' || userRole === 'Compliance Officer';

  // Stats
  const [stats, setStats] = useState(null);
  
  // Trigger Form State
  const [identities, setIdentities] = useState([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState('');
  const [identitySearch, setIdentitySearch] = useState('');
  const [triggerType, setTriggerType] = useState('Manual');
  const [reason, setReason] = useState('');

  // Simulation & Triggering State
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [exporting, setExporting] = useState(false);

  // History & Detail State
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [eventDetailMap, setEventDetailMap] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Orphaned Authority State
  const [orphanedData, setOrphanedData] = useState(null);

  // Toast
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false });

  const showToast = (message, type = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 4000);
  };

  const loadIdentities = useCallback(async () => {
    try {
      const data = await getIdentities({ limit: 50, search: identitySearch });
      const items = data.identities || data.items || data || [];
      setIdentities(items);
    } catch (err) {
      console.error('Failed to load identities:', err);
    }
  }, [identitySearch]);

  const loadStats = useCallback(async () => {
    try {
      const data = await getRevocationStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load revocation stats:', err);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const data = await getRevocationEvents();
      const items = Array.isArray(data) ? data : data.items || [];
      setEvents(items);
    } catch (err) {
      console.error('Failed to load revocation events history:', err);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadOrphanedReport = useCallback(async () => {
    try {
      const data = await getOrphanedAuthorityReport();
      setOrphanedData(data);
    } catch (err) {
      console.error('Failed to load orphaned authority report:', err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadEvents();
    loadOrphanedReport();
    loadIdentities();
  }, [loadStats, loadEvents, loadOrphanedReport, loadIdentities]);

  const handleSimulate = async () => {
    if (!selectedIdentityId) {
      showToast('Please select a target identity first.', 'error');
      return;
    }
    setSimulating(true);
    setSimulationResult(null);
    try {
      const result = await simulateRevocation({
        source_identity_id: parseInt(selectedIdentityId, 10),
        reason: reason || 'Pre-revocation impact simulation'
      });
      setSimulationResult(result);
      showToast(`Simulation complete: ${result.would_affect_count || 0} identities will be affected.`, 'info');
    } catch (err) {
      showToast(err.response?.data?.detail || 'Simulation failed.', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleTrigger = async () => {
    if (!canApproveRevocation) {
      showToast('Permission denied: your role does not have "approve" rights for Cascade Revocation.', 'error');
      return;
    }
    if (!selectedIdentityId) {
      showToast('Please select a target identity.', 'error');
      return;
    }
    setTriggering(true);
    showToast('Initiating cascade revocation sequence...', 'info');

    try {
      const job = await triggerRevocation({
        source_identity_id: parseInt(selectedIdentityId, 10),
        trigger_type: triggerType,
        reason: reason || `Cascade revocation initiated via UI (${triggerType})`
      });

      showToast(`Revocation Event #${job.id} dispatched! Polling status...`, 'success');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await getRevocationEventStatus(job.id);
          const currStatus = (statusRes.status || '').toLowerCase();

          if (currStatus !== 'in progress' && currStatus !== 'pending') {
            clearInterval(pollInterval);
            setTriggering(false);
            showToast(`Cascade Event #${job.id} completed with status '${statusRes.status}' in ${statusRes.duration_seconds || 0}s!`, 'success');
            loadStats();
            loadEvents();
            loadOrphanedReport();
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setTriggering(false);
          showToast('Status polling error.', 'error');
        }
      }, 2000);

    } catch (err) {
      setTriggering(false);
      showToast(err.response?.data?.detail || 'Failed to trigger revocation event.', 'error');
    }
  };

  const handleExportComplianceReport = async () => {
    setExporting(true);
    try {
      const data = await exportComplianceReport();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `soc2-cascade-revocation-report-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('SOC2 / ISO compliance package downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to download compliance report.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const toggleRowDetail = async (eventId) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }

    setExpandedEventId(eventId);
    if (!eventDetailMap[eventId]) {
      try {
        const fullDetail = await getRevocationEvent(eventId);
        setEventDetailMap((prev) => ({ ...prev, [eventId]: fullDetail }));
      } catch (err) {
        showToast('Failed to fetch event detail.', 'error');
      }
    }
  };

  return (
    <div className="cascade-revocation-page">
      <Breadcrumb items={[{ label: 'Governance', path: '/governance' }, { label: 'Cascade Revocation' }]} />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cascade Revocation Engine</h1>
          <p className="page-subtitle">
            Autonomous multi-hop delegation graph revocation, cross-org boundary tracking & propagation lag analytics
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleExportComplianceReport} disabled={exporting}>
            {exporting ? <RotateCw className="spin-icon" size={16} /> : <Download size={16} />} Export Compliance Package
          </button>
          <button className="btn-secondary" onClick={() => { loadStats(); loadEvents(); loadOrphanedReport(); }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon-wrapper blue">
            <Zap size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Events</span>
            <span className="stat-value">{stats ? stats.total_events : 0}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper green">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Avg Full Revocation</span>
            <span className="stat-value">{stats ? `${stats.avg_seconds}s` : '0.0s'}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper purple">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">P95 Time-to-Revoke</span>
            <span className="stat-value">{stats ? `${stats.p95_seconds}s` : '0.0s'}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper red">
            <ShieldAlert size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Events With Failures</span>
            <span className="stat-value">{stats ? stats.events_with_failures : 0}</span>
          </div>
        </div>
      </div>

      {/* Orphaned Authority Section */}
      {orphanedData && orphanedData.count > 0 && (
        <div className="orphaned-section">
          <div className="orphaned-header">
            <AlertTriangle className="warning-icon" size={20} />
            <div>
              <h3>Orphaned Authority Alert ({orphanedData.count})</h3>
              <p>Active delegations linked to an Inactive root ancestor identity — manual review required</p>
            </div>
          </div>
          <div className="table-responsive">
            <table className="data-table orphaned-table">
              <thead>
                <tr>
                  <th>Link ID</th>
                  <th>Root Identity</th>
                  <th>Orphaned Child Identity</th>
                  <th>Hop Depth</th>
                  <th>Delegation Created At</th>
                </tr>
              </thead>
              <tbody>
                {orphanedData.orphaned.map((item) => (
                  <tr key={item.delegation_link_id}>
                    <td>#{item.delegation_link_id}</td>
                    <td><strong>{item.root_identity_name}</strong> (ID: {item.root_identity_id})</td>
                    <td>{item.orphaned_identity_name} (ID: {item.orphaned_identity_id})</td>
                    <td><span className="hop-badge">Hop {item.hop_depth}</span></td>
                    <td>{new Date(item.delegation_created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trigger Revocation Panel */}
      <div className="panel-card trigger-panel">
        <div className="panel-header">
          <h2><Zap size={18} /> Trigger Cascade Revocation</h2>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Target Identity</label>
              <div className="search-select-wrapper">
                <input
                  type="text"
                  placeholder="Search identity by name, email or ID..."
                  value={identitySearch}
                  onChange={(e) => setIdentitySearch(e.target.value)}
                  className="form-control"
                />
                <select
                  value={selectedIdentityId}
                  onChange={(e) => setSelectedIdentityId(e.target.value)}
                  className="form-control identity-select"
                >
                  <option value="">-- Select Target Identity --</option>
                  {identities.map((id) => (
                    <option key={id.id} value={id.id}>
                      {id.display_name || id.email || id.employee_id} (ID: {id.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Trigger Type</label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="form-control"
              >
                <option value="Offboarding">Offboarding</option>
                <option value="Manual">Manual Trigger</option>
                <option value="Policy Violation">Policy Violation</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Revocation Reason</label>
              <textarea
                rows={2}
                placeholder="Reason for triggering cascade revocation..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          {/* Embedded Delegation Graph Hierarchy */}
          {selectedIdentityId && (
            <DelegationGraphView identityId={selectedIdentityId} />
          )}

          {/* Simulation Preview Output */}
          {simulationResult && (
            <div className="simulation-preview">
              <div className="simulation-header">
                <FileText size={16} />
                <span>Simulation Impact Preview</span>
              </div>
              <div className="simulation-metrics">
                <div>Would Affect: <strong>{simulationResult.would_affect_count} identities</strong></div>
                <div>Max Hop Depth: <strong>{simulationResult.max_hop_depth} hops</strong></div>
              </div>
              {simulationResult.warnings && simulationResult.warnings.length > 0 && (
                <div className="simulation-warnings">
                  {simulationResult.warnings.map((w, idx) => (
                    <div key={idx} className="warning-chip">
                      <AlertTriangle size={14} /> {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="panel-actions">
            <button
              className="btn-secondary"
              onClick={handleSimulate}
              disabled={simulating || !selectedIdentityId}
            >
              {simulating ? <RotateCw className="spin-icon" size={16} /> : <Eye size={16} />} Simulate Impact
            </button>

            <button
              className="btn-danger"
              onClick={handleTrigger}
              disabled={triggering || !selectedIdentityId || !canApproveRevocation}
              title={!canApproveRevocation ? "Requires 'approve' permission for Cascade Revocation" : "Trigger real revocation"}
            >
              {triggering ? <RotateCw className="spin-icon" size={16} /> : <Play size={16} />} Trigger Revocation
            </button>
          </div>
        </div>
      </div>

      {/* Revocation History Table */}
      <div className="panel-card">
        <div className="panel-header">
          <h2><Clock size={18} /> Revocation History</h2>
          <button className="btn-secondary" onClick={handleExportComplianceReport} disabled={exporting}>
            <Download size={14} /> Export Report
          </button>
        </div>
        <div className="panel-body">
          {loadingEvents ? (
            <div className="loading-state">Loading revocation history...</div>
          ) : events.length === 0 ? (
            <div className="empty-state">No revocation cascade events recorded yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Source Identity ID</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Revoked / Failed</th>
                    <th>Duration</th>
                    <th>Initiated At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map((evt) => {
                    const isExpanded = expandedEventId === evt.id;
                    const detail = eventDetailMap[evt.id];

                    return (
                      <React.Fragment key={evt.id}>
                        <tr className="history-row" onClick={() => toggleRowDetail(evt.id)}>
                          <td><strong>#{evt.id}</strong></td>
                          <td>Identity #{evt.source_identity_id}</td>
                          <td>{evt.reason || 'N/A'}</td>
                          <td>
                            <span className={`status-badge status-${(evt.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                              {evt.status}
                            </span>
                          </td>
                          <td>
                            <span className="success-text">{evt.revoked_count} revoked</span> / <span className="danger-text">{evt.failed_count} failed</span>
                          </td>
                          <td>{evt.duration_seconds ? `${evt.duration_seconds.toFixed(2)}s` : '0.0s'}</td>
                          <td>{new Date(evt.created_at).toLocaleString()}</td>
                          <td>
                            <button className="btn-icon">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="detail-expansion-row">
                            <td colSpan={8}>
                              <div className="expanded-action-list">
                                <h4>Per-Hop Execution Actions for Event #{evt.id}</h4>
                                {!detail || !detail.actions || detail.actions.length === 0 ? (
                                  <div className="no-actions">No per-hop actions logged yet.</div>
                                ) : (
                                  <table className="inner-action-table">
                                    <thead>
                                      <tr>
                                        <th>Target Identifier</th>
                                        <th>Hop Depth</th>
                                        <th>Action Type</th>
                                        <th>Status</th>
                                        <th>Error Message</th>
                                        <th>Executed At</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.actions.map((act) => (
                                        <tr key={act.id}>
                                          <td><code>{act.target_identifier}</code></td>
                                          <td><span className="hop-badge">Hop {act.hop_depth || 1}</span></td>
                                          <td>
                                            <span className={`action-type-badge ${act.action_type?.includes('Cross-Org') ? 'cross-org' : ''}`}>
                                              {act.action_type || 'REVOCATION'}
                                            </span>
                                          </td>
                                          <td>
                                            <span className={`status-badge status-${(act.status || '').toLowerCase()}`}>
                                              {act.status}
                                            </span>
                                          </td>
                                          <td className="error-cell">{act.error_message || '—'}</td>
                                          <td>{new Date(act.created_at).toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {events.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Showing {Math.min((currentPage - 1) * rowsPerPage + 1, events.length)} to {Math.min(currentPage * rowsPerPage, events.length)} of {events.length} events
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      className="btn-secondary"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    >
                      Previous
                    </button>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Page {currentPage} of {Math.ceil(events.length / rowsPerPage) || 1}</span>
                    <button 
                      className="btn-secondary"
                      disabled={currentPage >= (Math.ceil(events.length / rowsPerPage) || 1)}
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(events.length / rowsPerPage) || 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {toast.visible && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default CascadeRevocation;
