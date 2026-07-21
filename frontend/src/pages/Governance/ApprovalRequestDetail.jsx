import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, Clock, AlertTriangle, Loader2, XCircle,
  MessageSquare, Send, Trash2, RotateCw
} from 'lucide-react';
import {
  getRolePreview, getApprovalRequestById,
  getApprovalComments, addApprovalComment, deleteApprovalComment
} from '../../services/candidateRoleWorkbenchService';
import { useAuth } from '../../context/AuthContext';
import BusinessActionModal from '../../components/BusinessActionModal/BusinessActionModal';
import SecurityActionModal from '../../components/SecurityActionModal/SecurityActionModal';

// Full-page version of the approval request detail view.
// Built to replace the slide-in ApprovalDetailDrawer, whose "View Details" eye
// icon could not be reliably triggered in testing (see APR module test notes).
// Same data + same tabs, just rendered as a normal routed page instead of an
// overlay panel, so there's no drawer/portal/z-index machinery that can fail silently.
const ApprovalRequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState('general');
  const [request, setRequest] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Actions state
  const [isBusinessModalOpen, setIsBusinessModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [actionType, setActionType] = useState('Approve');

  // Comments (APR-004) state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (id) {
      setActiveTab('general');
      fetchDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const reqData = await getApprovalRequestById(id);
      setRequest(reqData);

      const prevData = await getRolePreview(reqData.candidate_role_id);
      setPreview(prevData);

      fetchComments();
    } catch (err) {
      console.error("Failed to load approval request details:", err);
      setError("Failed to load request details. The candidate role may have been restructured or deleted.");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const data = await getApprovalComments(id);
      setComments(data || []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    try {
      setPostingComment(true);
      await addApprovalComment(id, newComment.trim());
      setNewComment('');
      fetchComments();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to post comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteApprovalComment(commentId);
      fetchComments();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete comment.");
    }
  };

  const getStatusBadge = (status) => {
    let bg = 'rgba(156,163,175,0.1)';
    let color = 'var(--text-muted)';

    if (status === 'Business Approved' || status === 'Security Approved' || status === 'Approved') {
      bg = 'rgba(16,185,129,0.1)';
      color = 'var(--success)';
    } else if (status === 'Business Rejected' || status === 'Security Rejected' || status === 'Rejected') {
      bg = 'rgba(239,68,68,0.1)';
      color = 'var(--danger)';
    } else if (status === 'Returned For Rework' || status === 'Returned') {
      bg = 'rgba(245,158,11,0.1)';
      color = 'var(--warning)';
    } else if (status === 'Business Review' || status === 'Security Review') {
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

  const isPlatformAdmin = currentUser?.role === 'Platform Administrator';
  const isSecurityAdmin = currentUser?.role === 'Security Administrator';

  const canPerformBusinessAction = request && (
    isPlatformAdmin || 
    (currentUser?.role !== 'Role Engineer' && currentUser?.role !== 'Viewer' &&
     (request.primary_owner_name === currentUser?.name || request.backup_owner_name === currentUser?.name))
  );

  const canPerformSecurityAction = request && (
    isPlatformAdmin || isSecurityAdmin
  );

  return (
    <div className="workbench-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-action-premium"
            onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
              {loading ? 'Loading Details...' : (request?.role_name || `Request #${id}`)}
            </h2>
            {request && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '4px' }}>
                <span className="text-muted">Request ID: #{request.id}</span>
                <span>•</span>
                {getStatusBadge(request.status)}
              </div>
            )}
          </div>
        </div>

        {/* Action Section */}
        {request && !loading && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {request.status === 'Business Review' && canPerformBusinessAction && (
              <>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Approve'); setIsBusinessModalOpen(true); }}
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Reject'); setIsBusinessModalOpen(true); }}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Return'); setIsBusinessModalOpen(true); }}
                >
                  <RotateCw size={14} /> Return for Rework
                </button>
              </>
            )}

            {request.status === 'Security Review' && canPerformSecurityAction && (
              <>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Approve'); setIsSecurityModalOpen(true); }}
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Reject'); setIsSecurityModalOpen(true); }}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  type="button"
                  className="btn-action-premium"
                  style={{ backgroundColor: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => { setActionType('Return'); setIsSecurityModalOpen(true); }}
                >
                  <RotateCw size={14} /> Return for Rework
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
            <span className="text-muted" style={{ fontSize: '12px' }}>Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: '20px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : request && (
        <>
          {/* Tabs header */}
          <div className="workbench-tabs-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '20px', backgroundColor: 'var(--bg-card)', padding: '0 4px' }}>
            <button className={`tab-link-premium ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
            <button className={`tab-link-premium ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>Role Preview</button>
            <button className={`tab-link-premium ${activeTab === 'entitlements' ? 'active' : ''}`} onClick={() => setActiveTab('entitlements')}>Entitlements ({preview?.entitlements?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Users ({preview?.members?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Timeline</button>
            <button className={`tab-link-premium ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>Comments ({comments.length})</button>
          </div>

          {/* Tab contents */}
          <div style={{ padding: '4px', maxWidth: '900px' }}>
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-hover)'
                }}>
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

                <div>
                  <h4 style={{ fontSize: '13px', margin: '0 0 10px 0', fontWeight: 600 }}>Readiness Checks ({preview.readiness.passed} / {preview.readiness.total} Passed)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {preview.readiness.checks.map((chk, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: '6px',
                        border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {chk.passed ? (
                            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                          ) : chk.severity === 'error' ? (
                            <XCircle size={14} style={{ color: 'var(--danger)' }} />
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
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
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
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
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
                  <div style={{
                    position: 'absolute', left: '7px', top: '8px', bottom: '8px',
                    width: '2px', backgroundColor: 'var(--border-color)', zIndex: 1
                  }} />

                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 2 }}>
                    <div style={{
                      position: 'absolute', left: '-24px', top: '2px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      backgroundColor: 'var(--success)', border: '4px solid var(--bg-card)'
                    }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13px' }}>Role Submitted</strong>
                      <span className="text-muted" style={{ fontSize: '11px' }}>
                        {request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>By Submitter: {request.submitted_by}</span>
                  </div>

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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

            {activeTab === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Discussion ({comments.length})</h4>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment for the submitter, owner, or reviewers..."
                    rows={2}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit'
                    }}
                  />
                  <button
                    className="btn-action-premium"
                    onClick={handlePostComment}
                    disabled={postingComment || !newComment.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                  >
                    <Send size={13} /> Post
                  </button>
                </div>

                {commentsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                    <Loader2 className="animate-spin text-muted" size={20} />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px', padding: '12px 0' }}>
                    No comments yet. Start the discussion above.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {comments.map((c) => {
                      const canDelete = currentUser?.role === 'Platform Administrator' || c.commented_by === currentUser?.name;
                      return (
                        <div key={c.id} style={{
                          padding: '10px 14px', borderRadius: '6px',
                          border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <MessageSquare size={12} style={{ color: 'var(--text-muted)' }} />
                              <strong style={{ fontSize: '12px' }}>{c.commented_by}</strong>
                              {c.commented_by_role && (
                                <span className="text-muted" style={{ fontSize: '11px' }}>({c.commented_by_role})</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="text-muted" style={{ fontSize: '11px' }}>
                                {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                              </span>
                              {canDelete && (
                                <button
                                  className="btn-icon-action"
                                  title="Delete comment"
                                  onClick={() => handleDeleteComment(c.id)}
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '13px', lineHeight: 1.4 }}>{c.comment_text}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Modals */}
      <BusinessActionModal
        isOpen={isBusinessModalOpen}
        onClose={() => setIsBusinessModalOpen(false)}
        actionType={actionType}
        requestIds={request ? [request.id] : []}
        onActionSuccess={fetchDetails}
      />
      <SecurityActionModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        actionType={actionType}
        requestId={request ? request.id : null}
        onActionSuccess={fetchDetails}
      />
    </div>
  );
};

export default ApprovalRequestDetail;
