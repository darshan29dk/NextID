import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ApprovalInbox.css';
import { Search, RotateCw, Filter, ShieldAlert, CheckCircle, XCircle, RefreshCw, AlertTriangle, Eye, Ban, Calendar, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApprovalRequests, cancelApprovalRequest } from '../../services/candidateRoleWorkbenchService';
import DashboardCard from '../../components/DashboardCard/DashboardCard';

const ApprovalRequests = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  // Filters state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [submittedBy, setSubmittedBy] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // KPI stats state (derived or queried)
  const [kpiStats, setKpiStats] = useState({
    total: 0,
    submitted: 0,
    businessReview: 0,
    approved: 0,
    rejected: 0,
    returned: 0
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState(null);
  const [error, setError] = useState('');
  
  useEffect(() => {
    fetchData();
  }, [page, status, priority, submittedBy, sortBy, sortOrder]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        page,
        limit,
        search: search.trim() || undefined,
        status: status || undefined,
        priority: priority || undefined,
        submitted_by: submittedBy || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      };
      const res = await getApprovalRequests(params);
      setRequests(res.requests || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 0);

      // Fetch a larger list to compute raw KPI stats locally (or default from result count)
      const allRes = await getApprovalRequests({ page: 1, limit: 1000 });
      const list = allRes.requests || [];
      setKpiStats({
        total: list.length,
        businessReview: list.filter(r => r.status === 'Business Review').length,
        securityReview: list.filter(r => r.status === 'Security Review').length,
        approved: list.filter(r => r.status === 'Security Approved').length,
        rejected: list.filter(r => r.status === 'Business Rejected' || r.status === 'Security Rejected').length,
        returned: list.filter(r => r.status === 'Returned For Rework').length
      });
    } catch (err) {
      console.error("Failed to load approval requests:", err);
      setError("Failed to load approval requests. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      setPage(1);
      fetchData();
    }
  };

  const handleCancelSubmission = async (requestId) => {
    if (!window.confirm("Are you sure you want to cancel this submission? The role will revert to Draft state.")) return;
    try {
      setActioningId(requestId);
      await cancelApprovalRequest(requestId);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to cancel submission.");
    } finally {
      setActioningId(null);
    }
  };

  const handleViewDetails = (requestId) => {
    navigate(`/approval-workflow/requests/${requestId}`);
  };

  return (
    <div className="workbench-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Approval Requests</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>
            Submit, track, and monitor role engineering approvals across the organization.
          </p>
        </div>
      </div>

      {/* KPI Cards Panel */}
      <div className="workbench-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
        <DashboardCard title="Total Requests" value={kpiStats.total} icon={ShieldAlert} trend="" />
        <DashboardCard title="Business Review" value={kpiStats.businessReview} icon={Clock} trend="" />
        <DashboardCard title="Security Review" value={kpiStats.securityReview} icon={Filter} trend="" />
        <DashboardCard title="Approved" value={kpiStats.approved} icon={CheckCircle} trend="" />
        <DashboardCard title="Rejected" value={kpiStats.rejected} icon={XCircle} trend="" />
        <DashboardCard title="Returned" value={kpiStats.returned} icon={RefreshCw} trend="" />
      </div>

      {/* Toolbar */}
      <div className="workbench-toolbar" style={{
        display: 'flex', justifyBehavior: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-card)', gap: '12px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <div className="search-input-container" style={{ flex: 1 }}>
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search by role name or submitter... (Press Enter)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyPress}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px' }}>
            <option value="">All Statuses</option>
            <option value="Business Review">Business Review</option>
            <option value="Security Review">Security Review</option>
            <option value="Security Approved">Security Approved</option>
            <option value="Business Rejected">Business Rejected</option>
            <option value="Security Rejected">Security Rejected</option>
            <option value="Returned For Rework">Returned For Rework</option>
          </select>

          <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px' }}>
            <option value="">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>

          <button onClick={fetchData} className="btn-action-premium" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)', borderRadius: '6px', border: '1px solid var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="table-responsive-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
        <table className="table-premium">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>Req ID</th>
              <th>Role Name</th>
              <th>Classification</th>
              <th>Role Owner</th>
              <th>Submitted By</th>
              <th>Submitted Date</th>
              <th>SLA Due Date</th>
              <th>Priority</th>
              <th>Status</th>
              <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
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
                  No approval requests found matching criteria.
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const isOverdue = r.is_escalated;
                const canCancel = (r.status === 'Submitted' || r.status === 'Business Review') &&
                  (currentUser?.role === 'Platform Administrator' || r.submitted_by === currentUser?.name);

                return (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td style={{ fontWeight: 600 }}>{r.role_name}</td>
                    <td>{r.classification || '-'}</td>
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
                        {canCancel && (
                          <button
                            className="btn-icon-action"
                            style={{ color: 'var(--danger)' }}
                            title="Cancel Submission"
                            onClick={() => handleCancelSubmission(r.id)}
                            disabled={actioningId === r.id}
                          >
                            <Ban size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyBehavior: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
            <span className="text-muted" style={{ fontSize: '13px' }}>
              Showing Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-action-premium"
                disabled={page === 1 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-action-premium"
                disabled={page === totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalRequests;
