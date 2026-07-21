import React from 'react';
import { ShieldAlert, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';

const ExecutiveSummary = ({ data = {}, kpis = {}, onDrilldown }) => {
  const { critical_risks = [], violated_policies = [], high_risk_users = [], recently_closed = [] } = data;

  return (
    <div className="exec-summary-grid">
      
      {/* SLA & Action alerts */}
      <div className="summary-card flex-colspan-2">
        <div className="summary-card-header">
          <Clock size={16} className="text-warning" />
          <h3>SLA Alerts & Action Center</h3>
        </div>
        <div className="sla-alerts-container">
          {kpis.overdue_sla_violations > 0 && (
            <div className="sla-alert-banner danger">
              <AlertTriangle size={18} />
              <div>
                <b>{kpis.overdue_sla_violations} Unresolved Violations Past 30-Day SLA</b>
                <p>Immediate mitigation review required to prevent compliance audit failure.</p>
              </div>
              <button className="btn-alert-action" onClick={() => onDrilldown({ status: 'OPEN' })}>Resolve</button>
            </div>
          )}
          {kpis.pending_exceptions > 0 && (
            <div className="sla-alert-banner warning">
              <ShieldAlert size={18} />
              <div>
                <b>{kpis.pending_exceptions} Exception Requests Awaiting Review</b>
                <p>SLA countdown active. Assign reviewers to complete manager/security approvals.</p>
              </div>
              <button className="btn-alert-action" onClick={() => onDrilldown({ status: 'PENDING' })}>Review</button>
            </div>
          )}
          {kpis.overdue_sla_violations === 0 && kpis.pending_exceptions === 0 && (
            <div className="sla-alert-banner success">
              <ShieldCheck size={18} />
              <div>
                <b>All Compliance Operations Clear</b>
                <p>No SLA breaches recorded. All exceptions and violations are current.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top 5 Critical Risks */}
      <div className="summary-card">
        <div className="summary-card-header">
          <ShieldAlert size={16} className="text-danger" />
          <h3>Top Critical Incidents</h3>
        </div>
        <div className="summary-list">
          {critical_risks.length === 0 ? (
            <p className="text-muted text-center" style={{ padding: '16px' }}>No critical incidents recorded.</p>
          ) : (
            critical_risks.map(r => (
              <div key={r.id} className="summary-list-item clickable-item" onClick={() => onDrilldown({ violationId: r.id })}>
                <div className="item-info">
                  <b>{r.username}</b>
                  <span className="text-muted">{r.policy_code}</span>
                </div>
                <div className="item-badge-score score-high">{r.risk_score}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top 5 Violated Policies */}
      <div className="summary-card">
        <div className="summary-card-header">
          <AlertTriangle size={16} className="text-warning" />
          <h3>Top Violated Policies</h3>
        </div>
        <div className="summary-list">
          {violated_policies.length === 0 ? (
            <p className="text-muted text-center" style={{ padding: '16px' }}>No violations found.</p>
          ) : (
            violated_policies.map(p => (
              <div key={p.policy_code} className="summary-list-item clickable-item" onClick={() => onDrilldown({ policy: p.policy_code })}>
                <div className="item-info">
                  <b>{p.policy_code}</b>
                  <span className="text-muted font-sm">{p.policy_name}</span>
                </div>
                <div className="item-badge-count">{p.open_violations} open</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top 10 High Risk Users */}
      <div className="summary-card flex-colspan-2">
        <div className="summary-card-header">
          <ShieldAlert size={16} className="text-danger" />
          <h3>Top High Risk Users</h3>
        </div>
        <div className="summary-table-wrapper">
          <table className="summary-table">
            <thead>
              <tr>
                <th>User Display Name</th>
                <th>Username</th>
                <th>Department</th>
                <th>Open Conflicts</th>
                <th>Highest Threat Score</th>
              </tr>
            </thead>
            <tbody>
              {high_risk_users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted">No high risk users recorded.</td>
                </tr>
              ) : (
                high_risk_users.map(u => (
                  <tr key={u.username} className="clickable-row" onClick={() => onDrilldown({ search: u.username })}>
                    <td><b>{u.display_name}</b></td>
                    <td>{u.username}</td>
                    <td>{u.department}</td>
                    <td>{u.violations_count}</td>
                    <td>
                      <span className={`status-badge ${u.max_risk_score > 70 ? 'badge-danger' : 'badge-warning'}`}>
                        {u.max_risk_score}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recently Resolved Risks */}
      <div className="summary-card flex-colspan-2">
        <div className="summary-card-header">
          <ShieldCheck size={16} className="text-success" />
          <h3>Recently Resolved Risks</h3>
        </div>
        <div className="summary-list">
          {recently_closed.length === 0 ? (
            <p className="text-muted text-center" style={{ padding: '16px' }}>No recently resolved risks found.</p>
          ) : (
            recently_closed.map(v => (
              <div key={v.id} className="summary-list-item clickable-item" onClick={() => onDrilldown({ violationId: v.id })}>
                <div className="item-info">
                  <b>{v.username}</b>
                  <span className="text-muted">Policy Code: {v.policy_code}</span>
                </div>
                <div className="item-resolved-date">
                  <span className="text-success font-bold">Resolved</span>
                  <span className="text-muted font-sm block-node">By {v.resolved_by}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default ExecutiveSummary;
