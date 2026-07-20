import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, User, ChevronLeft, Calendar, FileText, 
  Send, Upload, Clock, ShieldCheck, CheckCircle2, 
  AlertOctagon, MessageSquare, Paperclip, Activity
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import './SoDViolations.css';

// API Client
import { apiClient } from '../../services/dashboardService';
import { formatLocalDateTime, formatLocalTime } from '../../utils/dateUtils';

const STATUSES = ["OPEN", "UNDER_REVIEW", "MITIGATED", "EXCEPTION_APPROVED", "CLOSED"];

const SoDViolationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Detail Data
  const [violation, setViolation] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Comments / Attachments
  const [commentText, setCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Edit fields
  const [statusVal, setStatusVal] = useState('OPEN');
  const [assignedTo, setAssignedTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isFalsePositive, setIsFalsePositive] = useState(false);
  const [falsePositiveReason, setFalsePositiveReason] = useState('');
  const [updatingFields, setUpdatingFields] = useState(false);

  const fetchViolationDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [detailResult] = await Promise.allSettled([
        apiClient.get(`/governance/violations/${id}`),
        // Load timeline audit logs (we can query audit or violations list)
        apiClient.get(`/governance/violations`)
      ]);

      if (detailResult.status === 'rejected') {
        throw detailResult.reason;
      }

      const data = detailResult.value.data;
      setViolation(data);

      // Initialize edit fields
      setStatusVal(data.status);
      setAssignedTo(data.assigned_to || '');
      setRemarks(data.remarks || '');
      setIsFalsePositive(data.is_false_positive);
      setFalsePositiveReason(data.false_positive_reason || '');

      setTimeline(data.audit_trail || []);
    } catch (err) {
      setErrorMsg("Failed to load SoD violation diagnostic details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchViolationDetail();
  }, [fetchViolationDetail]);

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    setUpdatingFields(true);
    try {
      const payload = {
        status: statusVal,
        assigned_to: assignedTo || null,
        remarks: remarks || null,
        is_false_positive: isFalsePositive,
        false_positive_reason: isFalsePositive ? falsePositiveReason : null
      };
      await apiClient.patch(`/governance/violations/${id}`, payload);
      showToast("Changes saved successfully", "success");
      fetchViolationDetail();
    } catch (err) {
      showToast("Failed to save changes", "error");
    } finally {
      setUpdatingFields(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      await apiClient.post(`/governance/violations/${id}/comments`, { comment_text: commentText });
      setCommentText('');
      showToast("Comment added", "success");
      fetchViolationDetail();
    } catch (err) {
      showToast("Failed to add comment", "error");
    } finally {
      setAddingComment(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFile(true);
    const body = new FormData();
    body.append("file", file);
    try {
      await apiClient.post(`/governance/violations/${id}/attachments`, body, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast("File uploaded successfully", "success");
      fetchViolationDetail();
    } catch (err) {
      showToast("Failed to upload file", "error");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRescan = async () => {
    try {
      await apiClient.post(`/governance/violations/${id}/rescan`);
      showToast("Rescan complete", "success");
      fetchViolationDetail();
    } catch (err) {
      showToast("Rescan failed", "error");
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
        <p className="text-muted">Loading violation diagnostics...</p>
      </div>
    );
  }

  if (!violation) {
    return (
      <div className="table-empty-container">
        <h3>Violation Not Found</h3>
        <button className="btn-secondary" onClick={() => navigate('/governance/violations')}>Back to Cockpit</button>
      </div>
    );
  }

  // Parse evidence JSON
  let evidenceObj = null;
  try {
    if (violation.evidence) {
      evidenceObj = JSON.parse(violation.evidence);
    }
  } catch (e) {
    console.error("Failed to parse evidence payload:", e);
  }

  return (
    <div className="sod-detail-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Violations', path: '/governance/violations' },
        { label: 'Violation Details', path: '', active: true }
      ]} />

      <button className="btn-back" onClick={() => navigate('/governance/violations')}>
        <ChevronLeft size={14} /> Back to Cockpit
      </button>

      {/* Banners */}
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

      {/* Main Layout Grid */}
      <div className="detail-layout-grid">
        
        {/* Left Side: General diagnostics & evidence */}
        <div className="detail-left-column">
          {/* User card profile */}
          <div className="detail-card user-profile-card">
            <div className="user-profile-header">
              <div className="avatar-placeholder">
                <User size={32} />
              </div>
              <div>
                <h2>{violation.display_name || violation.username}</h2>
                <span className="text-muted font-mono">{violation.username}</span>
              </div>
            </div>
            <div className="profile-attributes-grid">
              <div className="profile-attr">
                <span className="attr-lbl">Department</span>
                <span>{violation.department || '-'}</span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">Manager</span>
                <span>{violation.manager || '-'}</span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">Identity Risk Score</span>
                <span className="score-val"><b>{violation.risk_score}</b> / 100</span>
              </div>
              <div className="profile-attr">
                <span className="attr-lbl">Conflict Detected Date</span>
                <span>{formatLocalDateTime(violation.detected_date)}</span>
              </div>
            </div>
          </div>

          {/* Evidence Details Card */}
          <div className="detail-card evidence-card">
            <div className="card-title-icon">
              <ShieldAlert size={18} className="text-danger" />
              <h3>Matched Policy & Evidence</h3>
            </div>
            <div className="matched-policy-banner">
              <div>
                <span className="policy-code-tag">{violation.policy_code}</span>
                <h4>{violation.policy_name}</h4>
              </div>
              <span className={`status-badge ${violation.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`}>
                {violation.severity}
              </span>
            </div>

            <div className="evidence-details-workspace">
              <h4>Matching Conflicting Assigned Entitlements:</h4>
              <div className="evidence-rules-timeline">
                {evidenceObj?.matches?.map((match, idx) => (
                  <div key={idx} className="match-card">
                    <div className="match-card-header">
                      <span>Application: <b>{match.application}</b></span>
                    </div>
                    <div className="match-rules-expression">
                      <span className="ent-tag">{match.entitlement_one}</span>
                      <span className="logic-connector">{match.operator}</span>
                      <span className="ent-tag">{match.entitlement_two}</span>
                    </div>
                    {match.detected_entitlements && (
                      <div className="detected-assignments-box">
                        <span className="box-lbl">User Accounts Holds:</span>
                        <ul className="assignments-list font-mono">
                          {match.detected_entitlements.map(e => <li key={e}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Comments trail workspace */}
          <div className="detail-card comments-card">
            <div className="card-title-icon">
              <MessageSquare size={18} />
              <h3>Review Notes & Comments ({violation.comments.length})</h3>
            </div>
            
            <form onSubmit={handleAddComment} className="comment-form-group">
              <textarea 
                placeholder="Write a remediation review note or exception comment..." 
                rows={3}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary btn-sm" disabled={addingComment || !commentText.trim()}>
                <Send size={12} />
                <span>Post Note</span>
              </button>
            </form>

            <div className="comments-timeline-list">
              {violation.comments.map(c => (
                <div key={c.id} className="comment-row">
                  <div className="comment-header">
                    <b>{c.created_by}</b>
                    <span className="text-muted">{formatLocalDateTime(c.created_at)}</span>
                  </div>
                  <p>{c.comment_text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attachments justification card */}
          <div className="detail-card attachments-card">
            <div className="card-title-icon">
              <Paperclip size={18} />
              <h3>Compliance Justification Attachments ({violation.attachments.length})</h3>
            </div>

            <div className="attachment-upload-row">
              <label className="btn-secondary btn-sm select-file-label">
                <Upload size={12} />
                <span>{uploadingFile ? "Uploading..." : "Upload Justification Document"}</span>
                <input 
                  type="file" 
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                  disabled={uploadingFile}
                />
              </label>
              <p className="text-muted" style={{ fontSize: '11px' }}>
                Supported: PDF, DOCX, PNG (Max 5MB)
              </p>
            </div>

            <div className="attachments-list-grid">
              {violation.attachments.map(a => (
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

        {/* Right Side: Resolution Workflow actions & Timeline history */}
        <div className="detail-right-column">
          
          {/* Resolution form card */}
          <div className="detail-card workflow-action-card">
            <h3>Workflow & Resolution</h3>
            <form onSubmit={handleSaveChanges} className="workflow-form">
              
              <div className="form-group">
                <label>Review Status</label>
                <select value={statusVal} onChange={e => setStatusVal(e.target.value)}>
                  {STATUSES.map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Assigned Reviewer</label>
                <input 
                  type="text" 
                  placeholder="Reviewer name or email..." 
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                />
              </div>

              <div className="form-group fp-checkbox-row">
                <input 
                  type="checkbox" 
                  id="fpCheck"
                  checked={isFalsePositive} 
                  onChange={e => setIsFalsePositive(e.target.checked)} 
                />
                <label htmlFor="fpCheck">Mark as False Positive</label>
              </div>

              {isFalsePositive && (
                <div className="form-group">
                  <label>False Positive Justification Reason <span className="text-danger">*</span></label>
                  <textarea 
                    placeholder="Provide compliance notes or audit bypass reason..." 
                    rows={2}
                    value={falsePositiveReason}
                    onChange={e => setFalsePositiveReason(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Resolution Remarks & Notes</label>
                <textarea 
                  placeholder="Write final decision logs or exception approval keys..." 
                  rows={3}
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                />
              </div>

              <div className="form-buttons-row">
                <button type="button" className="btn-secondary" onClick={handleRescan}>
                  Rescan User
                </button>
                <button type="submit" className="btn-primary" disabled={updatingFields}>
                  {updatingFields ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>

          {/* Audit Timeline card */}
          <div className="detail-card audit-timeline-card">
            <div className="card-title-icon">
              <Activity size={18} />
              <h3>Incident Log Timeline</h3>
            </div>
            <div className="timeline-flow">
              {timeline.map(aud => (
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

export default SoDViolationDetail;
