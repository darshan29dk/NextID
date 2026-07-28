import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ApprovalInbox.css';
import { ShieldCheck, RotateCw, AlertTriangle, Eye, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApprovalRequests } from '../../services/candidateRoleWorkbenchService';
import BusinessActionModal from '../../components/BusinessActionModal/BusinessActionModal';

const BusinessApproval = ({ hideHeader }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection state for Bulk Actions
  const [selectedIds, setSelectedIds] = useState([]);

  // Business Action Modal state
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState('Approve');
  const [actionIds, setActionIds] = useState([]);

  // Pagination / Filter states
  const [search, setSearch] = useState('');

  // RBAC checks
  const isAdmin = currentUser?.role === 'Platform Administrator';
  const isRoleEngineer = currentUser?.role === 'Role Engineer';
  const isViewer = currentUser?.role === 'Viewer';
  // If user is a regular Business Owner/Engineer, we filter table rows on client side or let the backend return them.
  // The backend lists all. So client-side RBAC filter:
  // Business Owners can only action requests where their name matches the primary/backup owner.
  // Admins can action everything.
  // Role Engineers / Viewers cannot action anything.

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      setSelectedIds([]);
      // Only fetch pending requests (status = "Business Review")
      const params = {
        page: 1,
        limit: 1000,
        status: 'Business Review'
      };
      const res = await getApprovalRequests(params);

      // Everyone with view access sees every request here - ownership only
      // gates who can ACT on a row (see canUserAction), not who can see it.
      setRequests(res.requests || []);
    } catch (err) {
      console.error("Failed to load business approvals:", err);
      setError("Failed to load pending business approvals.");
    } finally {
      setLoading(false);
    }
  };

  const handleRowSelect = (id) => {
    // If read-only role, prevent selection
    if (isRoleEngineer || isViewer) return;
    // Bulk actions run through the same authorization as single-row actions -
    // don't let someone select (and therefore bulk-action) a request they
    // aren't the assigned owner of, same restriction as the per-row buttons.
    const row = requests.find(r => r.id === id);
    if (row && !canUserAction(row)) return;

    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (isRoleEngineer || isViewer) return;

    const actionableIds = requests.filter(r => canUserAction(r)).map(r => r.id);
    if (selectedIds.length === actionableIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(actionableIds);
    }
  };

  const handleOpenActionModal = (type, ids) => {
    setActionType(type);
    setActionIds(ids);
    setIsActionModalOpen(true);
  };

  const handleViewDetails = (id) => {
    navigate(`/approval-workflow/requests/${id}`);
  };

  // Determine if a row can be actioned by the current user.
  // Ownership is the only path to action - being a Platform Administrator no
  // longer grants an automatic bypass here. Admins can still SEE every
  // request (see the visibility filter above), just not act on one they
  // don't own. A dedicated, clearly-logged override path for genuinely
  // unavailable owners is a separate, deliberate feature to build later -
  // not a silent blanket bypass.
  const namesMatch = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

  const canUserAction = (r) => {
    if (isRoleEngineer || isViewer) return false;
    // Case/whitespace-insensitive - the owner picker's stored name and the
    // logged-in display name aren't guaranteed to match exactly in case
    // (e.g. "sania gupta" vs "Sania Gupta"), and a strict === here would
    // lock out the very owner the request is assigned to. Must mirror the
    // same normalization the backend applies in
    // BusinessApprovalService._validate_reviewer_auth, or the button could
    // show here and still get rejected server-side.
    return namesMatch(r.primary_owner_name, currentUser?.name) || namesMatch(r.backup_owner_name, currentUser?.name);
  };

  return (
    <div className={hideHeader ? "" : "workbench-container"} style={hideHeader ? { display: 'flex', flexDirection: 'column', gap: '20px' } : { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {!hideHeader ? (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Business Approval Inbox</h2>
            <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
              Review, approve, reject, or return submitted roles assigned to you.
            </p>
          </div>
        ) : <div />}
        <button onClick={fetchData} className="btn-action-premium" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RotateCw size={14} /> Refresh Queue
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)', borderRadius: '6px', border: '1px solid var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Bulk actions bar if items are selected */}
      {selectedIds.length > 0 && (
        <div style={{
          display: 'flex', justifyBehavior: 'space-between', alignItems: 'center',
          padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--border-color)',
          backgroundColor: 'rgba(59,130,246,0.05)', color: 'var(--primary)',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>
            {selectedIds.length} request(s) selected for bulk action
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleOpenActionModal('Approve', selectedIds)}
              className="btn-action-premium"
              style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={13} /> Bulk Approve
            </button>
            <button
              onClick={() => handleOpenActionModal('Reject', selectedIds)}
              className="btn-action-premium"
              style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <XCircle size={13} /> Bulk Reject
            </button>
            <button
              onClick={() => handleOpenActionModal('Return', selectedIds)}
              className="btn-action-premium"
              style={{ backgroundColor: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} /> Bulk Return
            </button>
          </div>
        </div>
      )}

      {/* Main Inbox Table */}
      <div className="table-responsive-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflowX: 'auto', backgroundColor: 'var(--bg-card)' }}>
        <table className="table-premium">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
              {!(isRoleEngineer || isViewer) && (
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={requests.length > 0 && selectedIds.length === requests.length}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              <th>Role Name</th>
              <th>Business Owner</th>
              <th>Submitted By</th>
              <th>Submitted Date</th>
              <th>SLA Due Date</th>
              <th>Priority</th>
              <th>Status</th>
              <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px' }}>
                  <RotateCw className="animate-spin text-muted" size={24} style={{ margin: '0 auto' }} />
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No pending business approval requests found in queue.
                </td>
              </tr>
            ) : (
              requests.map((r, idx) => {
                const isSelected = selectedIds.includes(r.id);
                const isOverdue = r.is_escalated;
                const canAction = canUserAction(r);

                return (
                  <tr key={r.id} className={isSelected ? 'selected' : ''}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {idx + 1}
                    </td>
                    {!(isRoleEngineer || isViewer) && (
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleRowSelect(r.id)}
                          disabled={!canAction}
                        />
                      </td>
                    )}
                    <td style={{ fontWeight: 600 }}>{r.role_name}</td>
                    <td>{r.primary_owner_name || '-'}</td>
                    <td>{r.submitted_by}</td>
                    <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <span style={isOverdue ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
                        {r.due_date ? new Date(r.due_date).toLocaleDateString() : '-'}
                        {isOverdue && (
                          <span style={{
                            marginLeft: '6px', fontSize: '9px', padding: '1px 4px',
                            background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '3px'
                          }}>
                            BREACHED
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`priority-tag ${r.priority.toLowerCase()}`} style={{ fontSize: '11px' }}>
                        {r.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge-custom ${r.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn-icon-action"
                          title="View Details"
                          onClick={() => handleViewDetails(r.id)}
                        >
                          <Eye size={13} />
                        </button>
                        {canAction && (
                          <>
                            <button
                              className="btn-icon-action"
                              style={{ color: 'var(--success)' }}
                              title="Approve"
                              onClick={() => handleOpenActionModal('Approve', [r.id])}
                            >
                              <CheckCircle2 size={13} />
                            </button>
                            <button
                              className="btn-icon-action"
                              style={{ color: 'var(--danger)' }}
                              title="Reject"
                              onClick={() => handleOpenActionModal('Reject', [r.id])}
                            >
                              <XCircle size={13} />
                            </button>
                            <button
                              className="btn-icon-action"
                              style={{ color: 'var(--warning)' }}
                              title="Return for Rework"
                              onClick={() => handleOpenActionModal('Return', [r.id])}
                            >
                              <RefreshCw size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {requests.length > 0 && (
          <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
            <span className="text-muted" style={{ fontSize: '13px' }}>
              Showing <b>1</b> to <b>{requests.length}</b> of <b>{requests.length}</b> business approvals
            </span>
          </div>
        )}
      </div>

      {/* Action Modal */}
      <BusinessActionModal
        isOpen={isActionModalOpen}
        onClose={() => { setIsActionModalOpen(false); setSelectedIds([]); }}
        actionType={actionType}
        requestIds={actionIds}
        onActionSuccess={fetchData}
      />
    </div>
  );
};

export default BusinessApproval;
