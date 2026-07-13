import React, { useState, useEffect } from 'react';
import { X, Shield, Users, Layers, Award, FileText, CheckCircle, Clock, AlertTriangle, Play, HelpCircle, Activity, Loader2, XCircle } from 'lucide-react';
import { getRolePreview, getApprovalRequestById } from '../../services/candidateRoleWorkbenchService';

const ApprovalDetailDrawer = ({ isOpen, onClose, requestId }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [request, setRequest] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && requestId) {
      setActiveTab('general');
      fetchDetails();
    }
  }, [isOpen, requestId]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError('');
      // Get request details
      const reqData = await getApprovalRequestById(requestId);
      setRequest(reqData);
      
      // Get role preview metrics (Risk score, readiness checks)
      const prevData = await getRolePreview(reqData.candidate_role_id);
      setPreview(prevData);
    } catch (err) {
      console.error("Failed to load approval request details:", err);
      setError("Failed to load request details. The candidate role may have been restructured or deleted.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Helper: Status badge color resolver
  const getStatusBadge = (status) => {
    let bg = 'rgba(156,163,175,0.1)';
    let color = 'var(--text-muted)';
    
    if (status === 'Business Approved' || status === 'Approved') {
      bg = 'rgba(16,185,129,0.1)';
      color = 'var(--success)';
    } else if (status === 'Business Rejected' || status === 'Rejected') {
      bg = 'rgba(239,68,68,0.1)';
      color = 'var(--danger)';
    } else if (status === 'Returned For Rework' || status === 'Returned') {
      bg = 'rgba(245,158,11,0.1)';
      color = 'var(--warning)';
    } else if (status === 'Submitted' || status === 'Business Review') {
      bg = 'rgba(59,130,246,0.1)';
      color = 'var(--primary)';
    }

    return (
      <span style={{
        padding: '3px 8px', borderRadius: '4px',
        backgroundColor: bg, color: color,
        fontWeight: 600, fontSize: '11px', textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  const getPriorityStyle = (priority) => {
    if (priority === 'High') return { color: 'var(--danger)', fontWeight: 600 };
    if (priority === 'Medium') return { color: 'var(--warning)', fontWeight: 600 };
    return { color: 'var(--text-muted)' };
  };

  return (
    <div className={`detail-drawer-panel ${isOpen ? 'open' : ''}`} style={{ zIndex: 1050, width: '640px', maxWidth: '100%' }}>
      <div className="drawer-header-custom" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-card)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            {loading ? 'Loading Details...' : (request?.role_name || `Request #${requestId}`)}
          </h3>
          {request && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span className="text-muted">Request ID: #{request.id}</span>
              <span>•</span>
              {getStatusBadge(request.status)}
            </div>
          )}
        </div>
        <button type="button" className="btn-drawer-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <LoaderSpinner />
        </div>
      ) : error ? (
        <div style={{ padding: '20px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : request && (
        <>
          {/* Tabs header */}
          <div className="workbench-tabs-header" style={{ borderBottom: '1px solid var(--border-color)', padding: '0 20px', display: 'flex', gap: '20px', backgroundColor: 'var(--bg-card)' }}>
            <button className={`tab-link-premium ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
            <button className={`tab-link-premium ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>Role Preview</button>
            <button className={`tab-link-premium ${activeTab === 'entitlements' ? 'active' : ''}`} onClick={() => setActiveTab('entitlements')}>Entitlements ({preview?.entitlements?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Users ({preview?.members?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Timeline</button>
          </div>

          {/* Tab contents */}
          <div className="drawer-body-custom" style={{ padding: '20px', overflowY: 'auto', height: 'calc(100vh - 120px)' }}>
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Meta details */}
                <div className="grid-details-premium" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="detail-item-box">
                    <span className="label text-muted">Submitted By</span>
                    <span className="value">{request.submitted_by}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Submitted Date</span>
                    <span className="value">{request.submitted_at ? new Date(request.submitted_at).toLocaleString() : 'N/A'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">SLA Due Date</span>
                    <span className="value" style={request.is_escalated ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
                      {request.due_date ? new Date(request.due_date).toLocaleDateString() : 'N/A'}
                      {request.is_escalated && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 4px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '3px' }}>BREACHED</span>}
                    </span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Priority</span>
                    <span className="value" style={getPriorityStyle(request.priority)}>{request.priority}</span>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                {/* Role Details */}
                <div>
                  <h4 style={{ fontSize: '13px', margin: '0 0 10px 0', fontWeight: 600 }}>Role Profile</h4>
                  <div className="grid-details-premium" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item-box">
                      <span className="label text-muted">Classification</span>
                      <span className="value">{request.classification || 'None'}</span>
                    </div>
                    <div className="detail-item-box">
                      <span className="label text-muted">Role Type</span>
                      <span className="value">{request.role_type || 'None'}</span>
                    </div>
                    <div className="detail-item-box">
                      <span className="label text-muted">Primary Owner</span>
                      <span className="value">{request.primary_owner_name || 'Unassigned'}</span>
                    </div>
                    <div className="detail-item-box">
                      <span className="label text-muted">Backup Owner</span>
                      <span className="value">{request.backup_owner_name || 'Unassigned'}</span>
                    </div>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                <div>
                  <span className="label text-muted" style={{ display: 'block', marginBottom: '6px' }}>Submission Remarks</span>
                  <div style={{
                    padding: '10px 14px', borderRadius: '6px',
                    backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                    fontSize: '13px', fontStyle: request.remarks ? 'normal' : 'italic',
                    color: request.remarks ? 'var(--text-main)' : 'var(--text-muted)',
                    lineHeight: 1.4
                  }}>
                    {request.remarks || "No remarks provided at submission."}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'preview' && preview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Composite Risk Score Gauge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-hover)'
                }}>
                  {/* Circle score indicator */}
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    border: '4px solid ' + (preview.role.risk_score > 70 ? 'var(--danger)' : preview.role.risk_score > 40 ? 'var(--warning)' : 'var(--success)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 700, flexShrink: 0
                  }}>
                    {preview.role.risk_score}
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600 }}>Role Composite Risk Score</h5>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Calculated on-the-fly based on entitlement privilege levels, SoD conflicts (+15 per breach), and classification policies.
                    </p>
                  </div>
                </div>

                {/* Readiness Validation Checks */}
                <div>
                  <h4 style={{ fontSize: '13px', margin: '0 0 10px 0', fontWeight: 600 }}>Readiness Checks ({preview.readiness.passed} / {preview.readiness.total} Passed)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {preview.readiness.checks.map((chk, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyBehavior: 'space-between',
                        padding: '10px 14px', borderRadius: '6px',
                        border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {chk.passed ? (
                            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                          ) : chk.severity === 'error' ? (
                            <XCircleIcon size={14} />
                          ) : (
                            <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                          )}
                          <span style={{ fontSize: '13px', fontWeight: 500 }}>{chk.check}</span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{chk.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'entitlements' && preview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Mapped Entitlements ({preview.entitlements.length})</h4>
                {preview.entitlements.length === 0 ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>No entitlements mapped.</div>
                ) : (
                  preview.entitlements.map((e, idx) => (
                    <div key={idx} style={{
                      padding: '10px 14px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyBehavior: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{e.entitlement_name}</div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>Application: {e.application_name}</div>
                      </div>
                      <span className={`badge-premium ${e.risk === 'High' ? 'danger' : e.risk === 'Medium' ? 'warning' : 'success'}`} style={{ textTransform: 'uppercase' }}>
                        {e.risk || 'Low'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'members' && preview && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Mapped Members ({preview.members.length})</h4>
                {preview.members.length === 0 ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>No members assigned.</div>
                ) : (
                  preview.members.map((m, idx) => (
                    <div key={idx} style={{
                      padding: '10px 14px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyBehavior: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{m.employee_name}</div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>Emp ID: {m.employee_id} • Dept: {m.department}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Approval Timeline Stepper</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px' }}>
                  
                  {/* Left connector line */}
                  <div style={{
                    position: 'absolute', left: '7px', top: '8px', bottom: '8px',
                    width: '2px', backgroundColor: 'var(--border-color)', zIndex: 1
                  }} />

                  {/* Submission stage */}
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 2 }}>
                    <div style={{
                      position: 'absolute', left: '-24px', top: '2px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      backgroundColor: 'var(--success)', border: '4px solid var(--bg-card)'
                    }} />
                    <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px' }}>Role Submitted</strong>
                      <span className="text-muted" style={{ fontSize: '11px' }}>
                        {request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>By Submitter: {request.submitted_by}</span>
                  </div>

                  {/* Steps mapping */}
                  {request.steps.map((st, idx) => {
                    let dotColor = 'var(--border-color)';
                    if (st.status === 'Approved') dotColor = 'var(--success)';
                    else if (st.status === 'Rejected') dotColor = 'var(--danger)';
                    else if (st.status === 'Returned') dotColor = 'var(--warning)';
                    else if (st.status === 'Pending') dotColor = 'var(--primary)';

                    return (
                      <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 2 }}>
                        <div style={{
                          position: 'absolute', left: '-24px', top: '2px',
                          width: '16px', height: '16px', borderRadius: '50%',
                          backgroundColor: dotColor, border: '4px solid var(--bg-card)'
                        }} />
                        <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '13px' }}>{st.step_name} ({st.status})</strong>
                          {st.action_at && (
                            <span className="text-muted" style={{ fontSize: '11px' }}>
                              {new Date(st.action_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Assigned to approver: {st.approver_name || 'Unassigned'}
                        </span>
                        {st.remarks && (
                          <div style={{
                            marginTop: '4px', padding: '6px 10px', borderRadius: '4px',
                            background: 'var(--bg-hover)', fontSize: '12px', fontStyle: 'italic',
                            borderLeft: '2px solid ' + dotColor
                          }}>
                            "{st.remarks}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Simple spinner helper
const LoaderSpinner = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
    <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
    <span className="text-muted" style={{ fontSize: '12px' }}>Loading...</span>
  </div>
);

// XCircle fallback icon helper
const XCircleIcon = ({ size }) => (
  <XCircle size={size} style={{ color: 'var(--danger)' }} />
);

export default ApprovalDetailDrawer;
