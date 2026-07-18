import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, User, ChevronLeft, Calendar, FileText, 
  Send, Upload, Clock, ShieldAlert, CheckCircle2, 
  AlertOctagon, MessageSquare, Paperclip, Activity,
  Sliders, Award, RefreshCw, XCircle, Trash2
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import './SoDExceptions.css';

// API Client
import { apiClient } from '../../services/dashboardService';
import { formatLocalDate, formatLocalDateTime, formatLocalTime } from '../../utils/dateUtils';

const SoDExceptionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Data states
  const [exception, setException] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Workflow fields
  const [comments, setComments] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [showExtend, setShowExtend] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Comment feeds
  const [commentText, setCommentText] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);

  const fetchExceptionDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.get(`/governance/exceptions/${id}`);
      setException(res.data);
      if (res.data.expiry_date) {
        setNewExpiry(res.data.expiry_date.substring(0, 16));
      }
    } catch (err) {
      setErrorMsg("Failed to retrieve SoD exception diagnostic details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchExceptionDetail();
  }, [fetchExceptionDetail]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/approve`, { comments: comments || "Approved." });
      showToast("Exception level approved successfully.", "success");
      setComments('');
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to approve exception level.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/reject`, { comments: comments || "Rejected." });
      showToast("Exception request rejected.", "success");
      setComments('');
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to reject exception request.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm("Are you sure you want to revoke this approved active exception? Linked violations will reappear.")) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/revoke`);
      showToast("Exception revoked successfully.", "success");
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to revoke exception.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenew = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/renew`);
      showToast("Exception renewal workflow re-triggered.", "success");
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to renew exception.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendSubmit = async (e) => {
    e.preventDefault();
    if (!newExpiry) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/extend`, { new_expiry: newExpiry });
      showToast("Exception expiry date extended successfully.", "success");
      setShowExtend(false);
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to extend exception expiry date.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentText.strip()) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/governance/exceptions/${id}/comments`, {
        comment: commentText,
        is_internal: isInternalComment
      });
      setCommentText('');
      setIsInternalComment(false);
      showToast("Comment posted.", "success");
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to add comment.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      await apiClient.post(`/governance/exceptions/${id}/attachments`, body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast("Justification document uploaded successfully.", "success");
      fetchExceptionDetail();
    } catch (err) {
      showToast("Failed to upload document.", "error");
    } finally {
      setUploading(false);
    }
  };

  const showToast = (msg, type) => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="table-loading-container" style={{ minHeight: '400px' }}>
        <div className="spinner-element"></div>
        <p className="text-muted">Loading exception details...</p>
      </div>
    );
  }

  if (!exception) {
    return (
      <div className="table-empty-container">
        <h3>Exception Request Not Found</h3>
        <button className="btn-secondary" onClick={() => navigate('/governance/exceptions')}>Back to List</button>
      </div>
    );
  }

  const getStatusBadgeClass = (status) => {
    switch (status.toUpperCase()) {
      case 'PENDING': return 'status-review';
      case 'UNDER_REVIEW': return 'status-review';
      case 'APPROVED': case 'ACTIVE': return 'status-mitigated';
      case 'EXPIRED': return 'status-open';
      case 'REJECTED': return 'status-open';
      case 'REVOKED': return 'status-closed';
      default: return '';
    }
  };

  return (
    <div className="sod-detail-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Exceptions', path: '/governance/exceptions' },
        { label: 'Exception Details', path: '', active: true }
      ]} />

      <button className="btn-back" onClick={() => navigate('/governance/exceptions')}>
        <ChevronLeft size={14} /> Back to Management
      </button>

      {/* Toast notifications */}
      {successMsg && (
        <div className="toast toast-success" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="toast toast-error" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <AlertOctagon size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Details layout */}
      <div className="detail-layout-grid">
        
        {/* Left column */}
        <div className="detail-left-column">
          {/* User profile card */}
          <div className="detail-card user-profile-card">
            <div className="user-profile-header">
              <div className="avatar-placeholder">
                <User size={32} />
              </div>
              <div>
                <h2>{exception.username}</h2>
                <span className="text-muted font-mono">{exception.employee_id}</span>
              </div>
            </div>
            <div className="profile-attributes-grid">
              <div className="profile-attr">
                <span className="attr-lbl">Department</span>
                <span>{exception.department || '-'}</span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">Exception Type</span>
                <span>{exception.exception_type}</span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">SLA Status</span>
                <span style={{ fontWeight: 'bold', color: exception.is_sla_overdue ? 'var(--danger)' : 'var(--text-main)' }}>
                  {exception.is_sla_overdue ? "SLA OVERDUE" : "WITHIN SLA"} (Due {formatLocalDate(exception.sla_due_date)})
                </span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">Risk Acceptance Acknowledged</span>
                <span>{exception.risk_acceptance ? "YES" : "NO"}</span>
              </div>
            </div>
          </div>

          {/* AI Risk Assessment Card */}
          <div className="detail-card ai-readiness-card" style={{ border: '1px solid var(--primary-light)', backgroundColor: 'rgba(59, 130, 246, 0.04)' }}>
            <div className="card-title-icon">
              <Award size={18} className="text-primary" />
              <h3>Auto Decision Assistant (Future-Ready)</h3>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div className="ai-badge-circle" style={{ width: '54px', height: '54px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: exception.ai_risk_score > 70 ? 'var(--danger-light)' : 'var(--primary-light)', color: exception.ai_risk_score > 70 ? 'var(--danger)' : 'var(--primary)', fontWeight: 'bold', fontSize: '18px' }}>
                {exception.ai_risk_score}%
              </div>
              <div>
                <b style={{ display: 'block', fontSize: '13px' }}>Auto Predicted Risk Level: {exception.ai_risk_score > 70 ? "HIGH" : "MEDIUM/LOW"}</b>
                <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                  {exception.ai_recommendation}
                </p>
              </div>
            </div>
          </div>

          {/* Justification details */}
          <div className="detail-card evidence-card">
            <div className="card-title-icon">
              <FileText size={18} />
              <h3>Compliance Justifications & Controls</h3>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Business Justification</b>
              <p className="text-box-justification" style={{ backgroundColor: 'var(--bg-hover)', padding: '12px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.5' }}>
                {exception.business_justification}
              </p>
            </div>

            <div>
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Compensating Controls</b>
              <p className="text-box-justification" style={{ backgroundColor: 'var(--bg-hover)', padding: '12px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.5' }}>
                {exception.compensating_controls || "No compensating controls documented."}
              </p>
            </div>
          </div>

          {/* Stepper timeline approval workflow */}
          <div className="detail-card workflow-stepper-card">
            <div className="card-title-icon">
              <Sliders size={18} />
              <h3>Workflow Approval Gates (Manager → Governance → Security)</h3>
            </div>
            <div className="approval-timeline-stepper" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', position: 'relative' }}>
              
              {/* Stepper line */}
              <div className="stepper-line-bg" style={{ position: 'absolute', top: '15px', left: '10%', right: '10%', height: '2px', backgroundColor: 'var(--border-color)', zIndex: 1 }}></div>

              {["Manager Review", "Governance Review", "Security Approval"].map((level, idx) => {
                const app = exception.approvals.find(x => x.approval_level === level);
                const isApproved = app?.approval_status === "APPROVED";
                const isRejected = app?.approval_status === "REJECTED";
                const isPending = app?.approval_status === "PENDING";
                
                return (
                  <div key={level} className="stepper-node" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                    <div className={`stepper-bullet ${isApproved ? 'approved' : (isRejected ? 'rejected' : 'pending')}`} style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isApproved ? 'var(--success)' : (isRejected ? 'var(--danger)' : 'var(--bg-hover)'), color: isApproved || isRejected ? '#fff' : 'var(--text-muted)', border: '2px solid var(--border-color)', fontWeight: 'bold', fontSize: '12px' }}>
                      {idx + 1}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '600', marginTop: '8px', color: 'var(--text-main)' }}>{level}</span>
                    <span className="text-muted" style={{ fontSize: '10px', marginTop: '2px' }}>
                      {isApproved ? `Approved by ${app.approver_name}` : (isRejected ? `Rejected` : 'Pending')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comments panel */}
          <div className="detail-card comments-card">
            <div className="card-title-icon">
              <MessageSquare size={18} />
              <h3>Threaded Comments Panel ({exception.comments.length})</h3>
            </div>
            
            <form onSubmit={handlePostComment} className="comment-form-group">
              <textarea 
                placeholder="Post an audit note or compliance review feedback..." 
                rows={3}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input 
                    type="checkbox" 
                    id="internalC"
                    checked={isInternalComment}
                    onChange={e => setIsInternalComment(e.target.checked)}
                  />
                  <label htmlFor="internalC" style={{ cursor: 'pointer', fontSize: '12px' }}>Mark as Internal Audit Note</label>
                </div>
                <button type="submit" className="btn-primary btn-sm" disabled={actionLoading || !commentText.trim()}>
                  <Send size={12} />
                  <span>Post Comment</span>
                </button>
              </div>
            </form>

            <div className="comments-timeline-list">
              {exception.comments.map(c => (
                <div key={c.id} className="comment-row" style={{ borderLeft: c.is_internal ? '4px solid var(--warning)' : '4px solid var(--primary-light)' }}>
                  <div className="comment-header">
                    <b>{c.created_by} {c.is_internal && <span className="internal-badge-tag" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--warning-light)', color: 'var(--warning)', fontWeight: 'bold' }}>INTERNAL</span>}</b>
                    <span className="text-muted">{formatLocalDateTime(c.created_date)}</span>
                  </div>
                  <p>{c.comment}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Document justify attachments */}
          <div className="detail-card attachments-card">
            <div className="card-title-icon">
              <Paperclip size={18} />
              <h3>Justification Attachments ({exception.attachments.length})</h3>
            </div>

            <div className="attachment-upload-row">
              <label className="btn-secondary btn-sm select-file-label">
                <Upload size={12} />
                <span>{uploading ? "Uploading..." : "Upload justification documentation"}</span>
                <input 
                  type="file" 
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              <p className="text-muted" style={{ fontSize: '11px' }}>
                Supported: PDF, DOCX, XLS (Max 5MB)
              </p>
            </div>

            <div className="attachments-list-grid">
              {exception.attachments.map(a => (
                <div key={a.id} className="attachment-row">
                  <FileText size={16} className="text-muted" />
                  <div className="file-info">
                    <span className="file-name">{a.filename}</span>
                    <span className="file-size text-muted">{(a.file_size / 1024).toFixed(1)} KB</span>
                  </div>
                  <span className="uploaded-by text-muted">Uploaded by: {a.uploaded_by}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="detail-right-column">
          {/* Resolution form approvals step */}
          <div className="detail-card workflow-action-card">
            <h3>Remediation Action Console</h3>
            <div className="workflow-form">
              
              <div className="form-group">
                <label>Current Status Badge</label>
                <div style={{ marginTop: '6px' }}>
                  <span className={`status-badge ${getStatusBadgeClass(exception.status)}`} style={{ fontSize: '13px', padding: '6px 12px' }}>
                    {exception.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {exception.status === 'PENDING' || exception.status === 'UNDER_REVIEW' ? (
                <>
                  <div className="form-group">
                    <label>Remediation Approval Comments</label>
                    <textarea 
                      placeholder="Write review comments or constraints to forward..." 
                      rows={2}
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                    />
                  </div>
                  <div className="form-buttons-row">
                    <button className="btn-secondary" onClick={handleReject} disabled={actionLoading} style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                      Reject
                    </button>
                    <button className="btn-primary" onClick={handleApprove} disabled={actionLoading} style={{ flex: 1 }}>
                      Approve Level
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-buttons-row" style={{ flexDirection: 'column', gap: '10px' }}>
                    {exception.status === 'ACTIVE' && (
                      <button className="btn-secondary" onClick={handleRevoke} disabled={actionLoading} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', width: '100%' }}>
                        Revoke Access Exception
                      </button>
                    )}
                    {(exception.status === 'EXPIRED' || exception.status === 'REJECTED' || exception.status === 'REVOKED') && (
                      <button className="btn-primary" onClick={handleRenew} disabled={actionLoading} style={{ width: '100%' }}>
                        Re-Trigger Renewal Workflow
                      </button>
                    )}
                    {exception.exception_type === 'TEMPORARY' && (
                      <button className="btn-secondary" onClick={() => setShowExtend(!showExtend)} style={{ width: '100%' }}>
                        Extend Expiry Date
                      </button>
                    )}
                  </div>

                  {showExtend && (
                    <form onSubmit={handleExtendSubmit} style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <div className="form-group">
                        <label>Extended Expiry Date</label>
                        <input 
                          type="datetime-local" 
                          value={newExpiry}
                          onChange={e => setNewExpiry(e.target.value)}
                          required
                          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                        />
                      </div>
                      <button type="submit" className="btn-primary btn-sm" style={{ marginTop: '10px', width: '100%' }}>
                        Save Extension
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Audit Timeline events */}
          <div className="detail-card audit-timeline-card">
            <div className="card-title-icon">
              <Activity size={18} />
              <h3>Chronological Audit Timelines</h3>
            </div>
            <div className="timeline-flow">
              {exception.audit_trail?.map(aud => (
                <div key={aud.id} className="timeline-node">
                  <div className="timeline-indicator-line"></div>
                  <div className="timeline-node-bullet">
                    <Clock size={10} />
                  </div>
                  <div className="timeline-node-content">
                    <div className="timeline-node-header">
                      <b>{aud.action}</b>
                      <span>{formatLocalTime(aud.timestamp)}</span>
                    </div>
                    <p className="text-muted">By: {aud.performed_by}</p>
                    {aud.new_value && (
                      <span className="timeline-detail-link font-mono">{aud.new_value.substring(0, 100)}...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

// String capitalization helper
String.prototype.strip = function() {
  return this.trim();
};

export default SoDExceptionDetail;
