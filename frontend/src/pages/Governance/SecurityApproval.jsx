import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./ApprovalInbox.css";
import {
  ShieldAlert, RotateCw, AlertTriangle, Eye,
  ShieldCheck, ShieldX, RotateCcw, TrendingUp,
  CheckCircle2, XCircle, Clock, Star
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  getSecurityApprovalKpi,
  getSecurityApprovals,
} from "../../services/candidateRoleWorkbenchService";
import SecurityActionModal from "../../components/SecurityActionModal/SecurityActionModal";

// Helper: convert status string to CSS class
const statusClass = (s = "") => s.toLowerCase().replace(/\s+/g, "-");

const KpiCard = ({ label, value, icon: Icon, color }) => (
  <div
    style={{
      flex: "1 1 140px",
      padding: "16px 20px",
      borderRadius: "10px",
      border: "1px solid var(--border-color)",
      backgroundColor: "var(--bg-card)",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      boxShadow: "var(--shadow-sm)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </span>
      <Icon size={16} style={{ color }} />
    </div>
    <span style={{ fontSize: "26px", fontWeight: 700, color }}>{value ?? "-"}</span>
  </div>
);

const SecurityApproval = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [kpi, setKpi] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  // Action modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionType, setActionType] = useState("Approve");
  const [actionRequestId, setActionRequestId] = useState(null);

  // RBAC
  const canAction =
    currentUser?.role === "Platform Administrator" ||
    currentUser?.role === "Security Administrator";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [kpiRes, listRes] = await Promise.all([
        getSecurityApprovalKpi(),
        getSecurityApprovals({
          page: 1,
          limit: 1000,
          search: search || undefined,
          status: filterStatus || undefined,
          priority: filterPriority || undefined,
        }),
      ]);
      setKpi(kpiRes);
      setRequests(listRes.requests || []);
    } catch (err) {
      console.error("Failed to load security approvals:", err);
      setError("Failed to load Security Review queue. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterPriority]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = (type, id) => {
    setActionType(type);
    setActionRequestId(id);
    setIsModalOpen(true);
  };

  const openDrawer = (id) => {
    navigate(`/approval-workflow/requests/${id}`);
  };

  const securityStatuses = [
    "Security Review", "Security Approved", "Security Rejected",
    "Returned For Rework", "Ready For Publish",
  ];

  return (
    <div
      className="workbench-container"
      style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldAlert size={20} style={{ color: "#7c3aed" }} />
            Security Approval Queue
          </h2>
          <p className="text-muted" style={{ fontSize: "13px", margin: "4px 0 0 0" }}>
            Review, approve, reject, or return roles that have passed Business Approval.
          </p>
        </div>
        <button onClick={fetchData} className="btn-action-premium" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <RotateCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
        <KpiCard label="Pending Review" value={kpi.pending_review} icon={Clock} color="#7c3aed" />
        <KpiCard label="Approved" value={kpi.approved} icon={ShieldCheck} color="var(--success)" />
        <KpiCard label="Rejected" value={kpi.rejected} icon={ShieldX} color="var(--danger)" />
        <KpiCard label="Returned" value={kpi.returned} icon={RotateCcw} color="var(--warning)" />
        <KpiCard label="Ready For Publish" value={kpi.ready_for_publish} icon={Star} color="#059669" />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px", backgroundColor: "rgba(239,68,68,0.08)",
          color: "var(--danger)", borderRadius: "6px", border: "1px solid var(--danger)",
          fontSize: "13px", display: "flex", alignItems: "center", gap: "8px",
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search by role name or submitter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px", padding: "8px 12px", borderRadius: "6px",
            border: "1px solid var(--border-color)", background: "var(--bg-card)",
            color: "var(--text-main)", fontSize: "13px",
          }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px",
          }}
        >
          <option value="">All Statuses</option>
          {securityStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{
            padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px",
          }}
        >
          <option value="">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Table */}
      <div
        className="table-responsive-wrapper"
        style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden", backgroundColor: "var(--bg-card)" }}
      >
        <table className="table-premium">
          <thead>
            <tr>
              <th>#</th>
              <th>Role Name</th>
              <th>Classification</th>
              <th>Business Owner</th>
              <th>Security Reviewer</th>
              <th>Submitted By</th>
              <th>Biz Approved</th>
              <th>Priority</th>
              <th>Status</th>
              <th style={{ textAlign: "right", width: "160px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "40px" }}>
                  <RotateCw className="animate-spin text-muted" size={24} style={{ margin: "0 auto" }} />
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No Security Review requests found.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: "11px", color: "var(--text-muted)" }}>#{r.id}</td>
                  <td style={{ fontWeight: 600 }}>{r.role_name}</td>
                  <td>
                    {r.classification ? (
                      <span className={`badge-premium`} style={{ fontSize: "11px" }}>{r.classification}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>{r.primary_owner_name || "—"}</td>
                  <td>{r.security_reviewer_name || <span className="text-muted">Pending</span>}</td>
                  <td>{r.submitted_by}</td>
                  <td style={{ fontSize: "12px" }}>
                    {r.business_approved_at
                      ? new Date(r.business_approved_at).toLocaleDateString()
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    <span className={`priority-tag ${r.priority?.toLowerCase()}`} style={{ fontSize: "11px" }}>
                      {r.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge-custom ${statusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                      <button
                        className="btn-icon-action"
                        title="View Details"
                        onClick={() => openDrawer(r.id)}
                      >
                        <Eye size={13} />
                      </button>
                      {canAction && r.status === "Security Review" && (
                        <>
                          <button
                            className="btn-icon-action"
                            style={{ color: "var(--success)" }}
                            title="Approve"
                            onClick={() => openModal("Approve", r.id)}
                          >
                            <ShieldCheck size={13} />
                          </button>
                          <button
                            className="btn-icon-action"
                            style={{ color: "var(--danger)" }}
                            title="Reject"
                            onClick={() => openModal("Reject", r.id)}
                          >
                            <ShieldX size={13} />
                          </button>
                          <button
                            className="btn-icon-action"
                            style={{ color: "var(--warning)" }}
                            title="Return for Rework"
                            onClick={() => openModal("Return", r.id)}
                          >
                            <RotateCcw size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Security Action Modal */}
      <SecurityActionModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setActionRequestId(null); }}
        actionType={actionType}
        requestId={actionRequestId}
        onActionSuccess={fetchData}
      />
    </div>
  );
};

export default SecurityApproval;
