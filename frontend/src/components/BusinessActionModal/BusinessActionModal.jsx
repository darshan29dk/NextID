import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  approveApprovalRequest,
  rejectApprovalRequest,
  returnApprovalRequest,
  bulkApproveRequests,
  bulkRejectRequests,
  bulkReturnRequests
} from '../../services/candidateRoleWorkbenchService';

const BusinessActionModal = ({ isOpen, onClose, actionType, requestIds, onActionSuccess }) => {
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRemarks('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !requestIds || requestIds.length === 0) return null;

  const isBulk = requestIds.length > 1;

  // Resolve visual details
  let title = '';
  let btnText = '';
  let btnColor = '';
  let icon = null;

  if (actionType === 'Approve') {
    title = isBulk ? `Bulk Approve ${requestIds.length} Requests` : 'Approve Request';
    btnText = isBulk ? 'Bulk Approve' : 'Approve';
    btnColor = 'var(--success)';
    icon = <CheckCircle size={18} style={{ color: btnColor }} />;
  } else if (actionType === 'Reject') {
    title = isBulk ? `Bulk Reject ${requestIds.length} Requests` : 'Reject Request';
    btnText = isBulk ? 'Bulk Reject' : 'Reject';
    btnColor = 'var(--danger)';
    icon = <XCircle size={18} style={{ color: btnColor }} />;
  } else if (actionType === 'Return') {
    title = isBulk ? `Bulk Return ${requestIds.length} for Rework` : 'Return for Rework';
    btnText = isBulk ? 'Bulk Return' : 'Return for Rework';
    btnColor = 'var(--warning)';
    icon = <RefreshCw size={18} style={{ color: btnColor }} />;
  }

  const handleAction = async () => {
    try {
      setSubmitting(true);
      setError('');
      const payload = { remarks: remarks.trim() || undefined };

      if (isBulk) {
        const bulkPayload = { request_ids: requestIds, remarks: remarks.trim() || undefined };
        if (actionType === 'Approve') {
          await bulkApproveRequests(bulkPayload);
        } else if (actionType === 'Reject') {
          await bulkRejectRequests(bulkPayload);
        } else if (actionType === 'Return') {
          await bulkReturnRequests(bulkPayload);
        }
      } else {
        const singleId = requestIds[0];
        if (actionType === 'Approve') {
          await approveApprovalRequest(singleId, payload);
        } else if (actionType === 'Reject') {
          await rejectApprovalRequest(singleId, payload);
        } else if (actionType === 'Return') {
          await returnApprovalRequest(singleId, payload);
        }
      }

      onActionSuccess();
      onClose();
    } catch (err) {
      console.error(`Approval action (${actionType}) failed:`, err);
      setError(err.response?.data?.detail || `Failed to perform bulk/single ${actionType} action.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay-custom" style={{ zIndex: 1100 }}>
      <div className="modal-dialog-panel" style={{ maxWidth: '460px' }}>
        <div className="modal-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {icon}
            <h4 style={{ margin: 0 }}>{title}</h4>
          </div>
          <button type="button" className="btn-drawer-close" onClick={onClose} disabled={submitting}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {isBulk ? (
              <span>Are you sure you want to bulk-action these {requestIds.length} items? This will instantly transition the status of the associated candidate roles.</span>
            ) : (
              <span>Provide optional remarks or explanation for this decision. This will be stored in the request's audit timeline.</span>
            )}
          </p>

          <div className="form-input-group">
            <label>Remarks / Justification <span className="text-muted">(optional)</span></label>
            <textarea
              placeholder="Write reviewer remarks here..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              style={{
                width: '100%', minHeight: '90px', padding: '8px 12px',
                borderRadius: '6px', border: '1px solid var(--border-color)',
                background: 'var(--bg-card)', color: 'var(--text-main)',
                fontSize: '13px', resize: 'vertical'
              }}
            />
          </div>

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
            className="btn-action-premium primary"
            onClick={handleAction}
            disabled={submitting}
            style={{ backgroundColor: btnColor, borderColor: btnColor }}
          >
            {submitting ? 'Processing...' : btnText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BusinessActionModal;
