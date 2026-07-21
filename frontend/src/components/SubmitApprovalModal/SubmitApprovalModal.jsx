import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { getRolePreview, submitRoleForApproval } from '../../services/candidateRoleWorkbenchService';

const SubmitApprovalModal = ({ isOpen, onClose, role, onSubmitSuccess }) => {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [sodViolations, setSodViolations] = useState([]);
  const [priority, setPriority] = useState('Medium');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && role) {
      setError('');
      setRemarks('');
      setPriority('Medium');
      fetchRolePreviewData();
    }
  }, [isOpen, role]);

  const fetchRolePreviewData = async () => {
    try {
      setLoadingPreview(true);
      const data = await getRolePreview(role.id);
      setPreviewData(data);
      setSodViolations(data.sod_violations || []);
    } catch (err) {
      console.error("Failed to load role preview in submit checklist:", err);
    } finally {
      setLoadingPreview(false);
    }
  };

  if (!isOpen || !role) return null;

  // Checklist verification flags
  const hasDesc = !!(role.role_description && role.role_description.trim());
  const hasClassification = !!role.classification;
  const hasOwner = !!role.primary_owner_name;
  const hasApps = (role.application_count || 0) > 0;
  const hasEntitlements = (role.entitlement_count || 0) > 0;
  const hasUsers = (role.user_count || 0) > 0;

  const allPass = hasDesc && hasClassification && hasOwner && hasApps && hasEntitlements && hasUsers;

  const handleSubmit = async () => {
    if (!allPass) return;
    try {
      setSubmitting(true);
      setError('');
      await submitRoleForApproval({
        candidate_role_id: role.id,
        priority,
        remarks: remarks.trim() || undefined
      });
      onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Submit for approval failed:", err);
      setError(err.response?.data?.detail || "Failed to submit role for approval. Ensure the role satisfies all requirements.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay-custom" style={{ zIndex: 1100 }}>
      <div className="modal-dialog-panel" style={{ maxWidth: '520px' }}>
        <div className="modal-dialog-header">
          <h4>Submit for Approval — {role.role_name}</h4>
          <button type="button" className="btn-drawer-close" onClick={onClose} disabled={submitting}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
          
          <div className="text-muted" style={{ fontSize: '13px', lineHeight: 1.5 }}>
            Verify that this candidate role satisfies all required criteria before launching the business approval workflow.
          </div>

          {/* Checklist Panel */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px',
            padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-hover)'
          }}>
            <h5 style={{ fontSize: '13px', margin: '0 0 6px 0', fontWeight: 600 }}>Validation Checklist</h5>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Role has Description</span>
              {hasDesc ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Role has Classification ({role.classification || 'None'})</span>
              {hasClassification ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Role has Primary Owner assigned</span>
              {hasOwner ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Applications Mapped ({role.application_count || 0})</span>
              {hasApps ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Entitlements Mapped ({role.entitlement_count || 0})</span>
              {hasEntitlements ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Users Mapped ({role.user_count || 0})</span>
              {hasUsers ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <XCircle size={16} style={{ color: 'var(--danger)' }} />}
            </div>
          </div>

          {/* SoD Violations Warning Alert */}
          {loadingPreview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
              <Loader2 className="animate-spin" size={14} /> Checking for SoD violations...
            </div>
          ) : (
            sodViolations.length > 0 && (
              <div style={{
                display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '6px',
                border: '1px solid var(--danger)', backgroundColor: 'rgba(239,68,68,0.05)',
                color: 'var(--text-main)', fontSize: '13px', lineHeight: 1.5
              }}>
                <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--danger)' }}>SoD Warning: </strong>
                  This candidate role contains <strong>{sodViolations.length}</strong> Segregation of Duties (SoD) violations. Review policies before submitting to prevent audit issues.
                </div>
              </div>
            )
          )}

          {/* Submission Input Fields */}
          {allPass && (
            <>
              <div className="form-input-group">
                <label>Submission Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="form-input-group">
                <label>Justification / Remarks <span className="text-muted">(optional)</span></label>
                <textarea
                  placeholder="Provide context or explanation for this approval request..."
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  style={{
                    width: '100%', minHeight: '80px', padding: '8px 12px',
                    borderRadius: '6px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', color: 'var(--text-main)',
                    fontSize: '13px', resize: 'vertical'
                  }}
                />
              </div>
            </>
          )}

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '6px',
              backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
              color: 'var(--danger)', fontSize: '12px'
            }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className="modal-dialog-footer">
          <button
            type="button"
            className="btn-action-premium"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn-action-premium primary`}
            onClick={handleSubmit}
            disabled={submitting || !allPass}
            style={{
              opacity: allPass ? 1 : 0.6,
              cursor: allPass ? 'pointer' : 'not-allowed'
            }}
          >
            {submitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitApprovalModal;
