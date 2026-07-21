import React, { useState, useEffect } from "react";
import { X, ShieldCheck, ShieldX, RotateCcw, AlertTriangle } from "lucide-react";
import {
  approveSecurityRequest,
  rejectSecurityRequest,
  returnSecurityRequest,
} from "../../services/candidateRoleWorkbenchService";

/**
 * SecurityActionModal
 *
 * Improvements over BusinessActionModal:
 *  - Remarks are MANDATORY for Reject and Return (frontend validation mirrors backend).
 *  - Submit button disabled until remarks filled for those actions.
 *  - Inline warning shown when remarks are required but empty.
 *  - Clear error display from backend (400 / 403 / 500).
 */
const SecurityActionModal = ({ isOpen, onClose, actionType, requestId, onActionSuccess }) => {
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setRemarks("");
      setError("");
    }
  }, [isOpen, actionType]);

  if (!isOpen || !requestId) return null;

  const requiresRemarks = actionType === "Reject" || actionType === "Return";
  const remarksEmpty = !remarks.trim();
  const submitDisabled = submitting || (requiresRemarks && remarksEmpty);

  // Visual config per action
  const config = {
    Approve: {
      title: "Security Approval",
      subtitle: "Approve this request. The role will be marked Ready For Publish.",
      btnText: "Approve",
      btnColor: "var(--success)",
      Icon: ShieldCheck,
    },
    Reject: {
      title: "Security Rejection",
      subtitle: "Reject this request permanently. Remarks are required.",
      btnText: "Reject",
      btnColor: "var(--danger)",
      Icon: ShieldX,
    },
    Return: {
      title: "Return for Rework",
      subtitle: "Return to the role engineer for rework. Remarks are required.",
      btnText: "Return for Rework",
      btnColor: "var(--warning)",
      Icon: RotateCcw,
    },
  }[actionType] || {};

  const handleAction = async () => {
    if (requiresRemarks && remarksEmpty) {
      setError("Remarks are required for this action. Please provide a reason.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      const payload = { remarks: remarks.trim() || null };
      if (actionType === "Approve") {
        await approveSecurityRequest(requestId, payload);
      } else if (actionType === "Reject") {
        await rejectSecurityRequest(requestId, payload);
      } else if (actionType === "Return") {
        await returnSecurityRequest(requestId, payload);
      }
      onActionSuccess();
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || `Failed to ${actionType.toLowerCase()} the request. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const { title, subtitle, btnText, btnColor, Icon } = config;

  return (
    <div className="modal-overlay-custom" style={{ zIndex: 1100 }}>
      <div className="modal-dialog-panel" style={{ maxWidth: "480px" }}>
        {/* Header */}
        <div className="modal-dialog-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {Icon && <Icon size={18} style={{ color: btnColor }} />}
            <h4 style={{ margin: 0 }}>{title}</h4>
          </div>
          <button type="button" className="btn-drawer-close" onClick={onClose} disabled={submitting}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-dialog-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "13px", margin: 0, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {subtitle}
          </p>

          <div className="form-input-group">
            <label style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "block" }}>
              {requiresRemarks ? (
                <>
                  Remarks / Justification{" "}
                  <span style={{ color: "var(--danger)", fontWeight: 700 }}>*required</span>
                </>
              ) : (
                <>Remarks / Justification <span className="text-muted">(optional)</span></>
              )}
            </label>
            <textarea
              placeholder={
                requiresRemarks
                  ? "Provide a clear reason for this decision (required)..."
                  : "Write reviewer remarks here..."
              }
              value={remarks}
              onChange={(e) => { setRemarks(e.target.value); if (error) setError(""); }}
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "8px 12px",
                borderRadius: "6px",
                border: `1px solid ${requiresRemarks && remarksEmpty && error ? "var(--danger)" : "var(--border-color)"}`,
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "13px",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            {requiresRemarks && remarksEmpty && !error && (
              <p style={{ fontSize: "11px", color: "var(--warning)", margin: "4px 0 0 0" }}>
                ⚠ Remarks are required before submitting.
              </p>
            )}
          </div>

          {error && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                padding: "10px 12px", borderRadius: "6px",
                backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid var(--danger)",
                color: "var(--danger)", fontSize: "12px",
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
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
            disabled={submitDisabled}
            style={{
              backgroundColor: submitDisabled ? "var(--text-muted)" : btnColor,
              borderColor: submitDisabled ? "var(--text-muted)" : btnColor,
              cursor: submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Processing..." : btnText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityActionModal;
