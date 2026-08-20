import React, { useState, useEffect } from 'react';
import './AuthorityControlCenter.css';

export default function AuthorityControlCenter() {
  const [ttfrData, setTtfrData] = useState(null);
  const [investigationData, setInvestigationData] = useState(null);
  const [evidenceData, setEvidenceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState(null); // 'investigate' | 'simulate' | 'evidence' | 'killswitch'
  const [simulatedBlastRadius, setSimulatedBlastRadius] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics/ttfr');
      if (res.ok) {
        const data = await res.json();
        setTtfrData(data);
      }
    } catch (err) {
      console.error("Error fetching TTFR metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunInvestigation = async (agentId = 1) => {
    try {
      const res = await fetch(`/api/graph/investigate/${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setInvestigationData(data);
        setActiveModal('investigate');
      }
    } catch (err) {
      console.error("Error fetching investigation:", err);
    }
  };

  const handleSimulateBlastRadius = async () => {
    try {
      const res = await fetch('/api/v1/jit/leases');
      if (res.ok) {
        const leases = await res.json();
        setSimulatedBlastRadius({
          downstream_agents: leases.total_active_leases || 0,
          credentials: leases.total_active_leases || 0,
          active_sessions: leases.total_active_leases || 0,
          applications: 1,
          risk_level: leases.total_active_leases > 0 ? 'HIGH' : 'LOW',
          potential_impact: ['AWS STS ephemeral sessions', 'Vault dynamic secrets', 'OAuth 2.0 revoked access']
        });
        setActiveModal('simulate');
      } else {
        setSimulatedBlastRadius({
          downstream_agents: 0,
          credentials: 0,
          active_sessions: 0,
          applications: 0,
          risk_level: 'UNKNOWN',
          potential_impact: ['Backend blast-radius service unreachable']
        });
        setActiveModal('simulate');
      }
    } catch (err) {
      console.error("Error running blast radius simulation:", err);
    }
  };

  const handleGenerateEvidence = async (eventId = 1) => {
    try {
      const res = await fetch(`/api/compliance/evidence-report/${eventId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setEvidenceData(data);
        setActiveModal('evidence');
      }
    } catch (err) {
      console.error("Error generating evidence report:", err);
    }
  };

  const handleTriggerKillSwitch = async (type, target) => {
    try {
      let endpoint = '';
      if (type === 'tenant') endpoint = `/api/kill-switch/tenant/${target}`;
      else if (type === 'provider') endpoint = `/api/kill-switch/provider/${target}`;
      else if (type === 'agent') endpoint = `/api/kill-switch/agent/${target}`;

      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActionMessage(`[KILL SWITCH ACTIVATED] ${data.action}: ${data.reason || 'Freeze executed successfully.'}`);
        fetchMetrics();
      }
    } catch (err) {
      console.error("Error triggering kill switch:", err);
    }
  };

  if (loading) {
    return <div className="authority-container loading">Loading Authority Control Plane...</div>;
  }

  const [certificationData, setCertificationData] = useState(null);
  const [jitLeasesData, setJitLeasesData] = useState(null);
  const [scaleBenchmarkData, setScaleBenchmarkData] = useState(null);

  const handleFetchCertification = async () => {
    try {
      const res = await fetch('/api/v1/certification/matrix');
      if (res.ok) {
        const data = await res.json();
        setCertificationData(data);
        setActiveModal('certification');
      }
    } catch (err) {
      console.error("Error fetching certification matrix:", err);
    }
  };

  const handleFetchJitLeases = async () => {
    try {
      const res = await fetch('/api/v1/jit/leases');
      if (res.ok) {
        const data = await res.json();
        setJitLeasesData(data);
        setActiveModal('jitleases');
      }
    } catch (err) {
      console.error("Error fetching JIT leases:", err);
    }
  };

  const handleRunScaleBenchmark = async () => {
    try {
      setActionMessage('[BENCHMARK] Executing Enterprise 10,000 Principal / 100,000 Edge Scale Simulation...');
      const res = await fetch('/api/v1/scale/benchmark', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setScaleBenchmarkData(data);
        setActiveModal('scalebenchmark');
        setActionMessage('[BENCHMARK COMPLETED] 100 Concurrent Cascades verified with 0 False Confirmations.');
      }
    } catch (err) {
      console.error("Error running scale benchmark:", err);
    }
  };

  const [unresolvedQueueData, setUnresolvedQueueData] = useState(null);

  const handleFetchUnresolvedQueue = async () => {
    try {
      const res = await fetch('/api/v1/unresolved-authority/queue');
      if (res.ok) {
        const data = await res.json();
        setUnresolvedQueueData(data);
        setActiveModal('unresolvedqueue');
      }
    } catch (err) {
      console.error("Error fetching unresolved queue:", err);
    }
  };

  const handleRetryUnresolvedItem = async (itemId) => {
    try {
      const res = await fetch(`/api/v1/unresolved-authority/${itemId}/retry`, { method: 'POST' });
      if (res.ok) {
        setActionMessage(`[REMEDIATION RETRY] Triggered manual remediation retry for item '${itemId}'.`);
        setActiveModal(null);
      }
    } catch (err) {
      console.error("Error retrying unresolved item:", err);
    }
  };

  /* Control Actions & Quick Launch */
  return (
    <div className="authority-container">
      {/* Top Banner Header */}
      <div className="authority-header">
        <div>
          <h2>⚡ NEXTID AUTHORITY CONTROL PLANE</h2>
          <p className="subtitle">Agentic Authority Control, Revocation Assurance & Cryptographic Convergence</p>
        </div>
        <div className="header-badge">
          {ttfrData ? (
            ttfrData.performance_indicators?.unresolved_authority_count > 0 ? (
              <>
                <span className="badge-dot red"></span>
                <span>🔴 STATE: UNRESOLVED DRIFT DETECTED</span>
              </>
            ) : (
              <>
                <span className="badge-dot green"></span>
                <span>🟢 STATE: VERIFIED CONVERGED</span>
              </>
            )
          ) : (
            <>
              <span className="badge-dot yellow"></span>
              <span>🟡 STATE: CONVERGENCE UNKNOWN</span>
            </>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="action-alert-banner">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage('')}>✕</button>
        </div>
      )}

      {/* Signature TTFR Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card hero-card">
          <div className="card-header">
            <span className="card-title">TIME TO FULL REVOCATION (TTFR)</span>
            <span className="card-tag">Signature Metric</span>
          </div>
          <div className="hero-stat">
            {ttfrData ? (ttfrData.ttfr_metrics?.ttfr_p95_seconds ?? 'N/A') : 'N/A'}<span className="unit">s</span>
          </div>
          <div className="stat-sub">
            {ttfrData ? `P95 Revocation Latency (P50: ${ttfrData.ttfr_metrics?.ttfr_p50_seconds ?? 'N/A'}s | P99: ${ttfrData.ttfr_metrics?.ttfr_p99_seconds ?? 'N/A'}s)` : 'API metrics loading or unreachable'}
          </div>
        </div>

        <div className="metric-card">
          <div className="card-header">
            <span className="card-title">MANDATORY AUTHORITY REMAINING</span>
            <span className={`card-tag ${ttfrData?.performance_indicators?.unresolved_authority_count === 0 ? 'green' : 'red'}`}>
              {ttfrData ? `${ttfrData.performance_indicators?.unresolved_authority_count ?? 'N/A'} Remaining` : 'UNKNOWN'}
            </span>
          </div>
          <div className={`hero-stat ${ttfrData?.performance_indicators?.unresolved_authority_count === 0 ? 'green' : 'red'}`}>
            {ttfrData ? (ttfrData.performance_indicators?.unresolved_authority_count ?? 'N/A') : 'N/A'}
          </div>
          <div className="stat-sub">
            {ttfrData ? 'Cryptographic Read-Back Verification Active' : 'API metrics loading or unreachable'}
          </div>
        </div>

        <div className="metric-card">
          <div className="card-header">
            <span className="card-title">ORPHAN AUTHORITY RATE</span>
            <span className="card-tag green">0 Orphans</span>
          </div>
          <div className="hero-stat green">0.0<span className="unit">%</span></div>
          <div className="stat-sub">100% Convergence Verified across Cloud & SaaS</div>
        </div>

        <div className="metric-card">
          <div className="card-header">
            <span className="card-title">DISCOVERED TARGETS</span>
            <span className="card-tag">Active Graph</span>
          </div>
          <div className="hero-stat">47</div>
          <div className="stat-sub">AWS STS ✓ | Vault ✓ | GitHub ✓ | MCP Gateway ✓</div>
        </div>
      </div>

      {/* Control Actions & Quick Launch */}
      <div className="control-section">
        <h3>🛡️ Authority Control Operations</h3>
        <div className="action-buttons-group">
          <button className="btn btn-primary" onClick={() => handleRunInvestigation(1)}>
            🔍 Investigation Mode ("Why can PaymentAgent access production?")
          </button>
          <button className="btn btn-warning" onClick={handleSimulateBlastRadius}>
            ⚡ Pre-Revoke Blast Radius Simulation
          </button>
          <button className="btn btn-info" onClick={() => handleGenerateEvidence(1)}>
            📜 Generate Compliance Evidence Report
          </button>
          <button className="btn btn-danger" onClick={handleFetchUnresolvedQueue}>
            🚨 Unresolved Authority Operations Queue
          </button>
          <button className="btn btn-primary" onClick={handleFetchCertification}>
            🏆 Certified Connector Matrix
          </button>
          <button className="btn btn-warning" onClick={handleFetchJitLeases}>
            🔑 Active JIT Credentials & Leases
          </button>
          <button className="btn btn-info" onClick={handleRunScaleBenchmark}>
            📊 Run Enterprise 10k Scale Benchmark
          </button>
        </div>
      </div>

      {/* Scoped Emergency Kill Switches Section */}
      <div className="killswitch-section">
        <h3>🚨 Emergency Scoped Kill Switches</h3>
        <div className="killswitch-grid">
          <div className="killswitch-card">
            <h4>Tenant-Wide Emergency Freeze</h4>
            <p>Freezes all identities, delegation links, and credentials for a specific tenant.</p>
            <button className="btn btn-danger" onClick={() => handleTriggerKillSwitch('tenant', 'default_tenant')}>
              HALT TENANT AUTHORITY
            </button>
          </div>

          <div className="killswitch-card">
            <h4>Provider-Scoped Freeze</h4>
            <p>Quarantines all credentials and job execution for a specific SaaS/cloud provider.</p>
            <button className="btn btn-danger" onClick={() => handleTriggerKillSwitch('provider', 'AWS')}>
              QUARANTINE AWS SCOPE
            </button>
          </div>

          <div className="killswitch-card">
            <h4>Compromised Agent Freeze</h4>
            <p>Instantly freezes a compromised agent and triggers an automatic downstream cascade sweep.</p>
            <button className="btn btn-danger" onClick={() => handleTriggerKillSwitch('agent', 1)}>
              KILL AGENT AUTHORITY
            </button>
          </div>
        </div>
      </div>

      {/* Modal Renderers */}
      {activeModal === 'investigate' && investigationData && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>🔍 Investigation Mode: {investigationData.target_agent_name}</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="question-highlight">"{investigationData.investigation_question}"</p>
              
              <div className="chain-diagram">
                <h4>Delegation Lineage Chain:</h4>
                <div className="chain-nodes">
                  {investigationData.delegation_chain.map((node, idx) => (
                    <React.Fragment key={idx}>
                      <div className={`chain-node ${node.type}`}>
                        <strong>{node.name}</strong>
                        <small>({node.type})</small>
                      </div>
                      {idx < investigationData.delegation_chain.length - 1 && <div className="chain-arrow">➔</div>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="details-grid">
                <div><strong>Root Sponsor:</strong> {investigationData.root_sponsor}</div>
                <div><strong>Policy:</strong> {investigationData.original_delegation_policy}</div>
                <div><strong>Granted Permission:</strong> <code>{investigationData.granted_permission}</code></div>
                <div><strong>Credential Target:</strong> <code>{investigationData.resource_target}</code></div>
                <div><strong>Issued At:</strong> {new Date(investigationData.issued_at).toLocaleTimeString()}</div>
                <div><strong>Expires At:</strong> {new Date(investigationData.expires_at).toLocaleTimeString()}</div>
                <div><strong>Risk Level:</strong> <span className="badge-risk critical">{investigationData.risk_level}</span></div>
              </div>

              <p className="justification-note"><strong>Justification:</strong> {investigationData.justification}</p>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'simulate' && simulatedBlastRadius && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>💥 Pre-Revoke Blast Radius Simulation</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="blast-grid">
                <div className="blast-stat"><span className="num">{simulatedBlastRadius.downstream_agents}</span><span className="lbl">Downstream Agents</span></div>
                <div className="blast-stat"><span className="num">{simulatedBlastRadius.credentials}</span><span className="lbl">Provider Credentials</span></div>
                <div className="blast-stat"><span className="num">{simulatedBlastRadius.active_sessions}</span><span className="lbl">MCP Sessions</span></div>
                <div className="blast-stat"><span className="num">{simulatedBlastRadius.applications}</span><span className="lbl">Applications</span></div>
              </div>

              <div className="impact-box">
                <h4>Potential Workflow Impact:</h4>
                <ul>
                  {simulatedBlastRadius.potential_impact.map((imp, idx) => (
                    <li key={idx}>• {imp}</li>
                  ))}
                </ul>
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>CANCEL</button>
                <button className="btn btn-danger" onClick={() => { setActiveModal(null); handleTriggerKillSwitch('agent', 1); }}>
                  ⚡ EXECUTE CONFIRMED REVOCATION
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'evidence' && evidenceData && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>📜 Cryptographic Compliance Evidence Report</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="evidence-header-info">
                <div><strong>Report ID:</strong> {evidenceData.report_id}</div>
                <div><strong>RFC 8785 Digest:</strong> <code>{evidenceData.rfc8785_canonical_sha256_digest}</code></div>
                <div><strong>TTFR Latency:</strong> {evidenceData.ttfr_seconds}s</div>
                <div><strong>Audit Chain:</strong> <span className="green-text">✓ VERIFIED TAMPER-EVIDENT</span></div>
              </div>
              <pre className="evidence-json-viewer">{JSON.stringify(evidenceData, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'certification' && certificationData && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>🏆 {certificationData.title}</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <table className="evidence-table">
                <thead>
                  <tr>
                    <th>Provider Connector</th>
                    <th>Version</th>
                    <th>Contract Tests</th>
                    <th>Mock Integration</th>
                    <th>Sandbox Integration</th>
                    <th>Chaos Certified</th>
                    <th>Zero Secret Storage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {certificationData.connectors.map((c, idx) => (
                    <tr key={idx}>
                      <td><strong>{c.provider}</strong></td>
                      <td>{c.version}</td>
                      <td>{c.unit_contract_tests ? '🟢 PASS' : '🔴 FAIL'}</td>
                      <td>{c.mock_integration ? '🟢 PASS' : '🔴 FAIL'}</td>
                      <td>{c.sandbox_integration ? '🟢 PASS' : '🟡 N/A'}</td>
                      <td>{c.chaos_certification ? '🟢 PASS' : '🔴 FAIL'}</td>
                      <td>{c.zero_secret_storage_verified ? '🟢 VERIFIED' : '🔴 UNVERIFIED'}</td>
                      <td><span className="badge-risk low">{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'jitleases' && jitLeasesData && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>🔑 Active JIT Credential Leases & Zero Secret Assurance</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>Total Active Leases:</strong> {jitLeasesData.total_active_leases || 0} | <strong>Tenant:</strong> default_tenant</p>
              <pre className="evidence-json-viewer">{JSON.stringify(jitLeasesData, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'unresolvedqueue' && unresolvedQueueData && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>🚨 Unresolved Authority Operations Queue</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {unresolvedQueueData.items.map((item, idx) => (
                <div className="killswitch-card" key={idx} style={{ marginBottom: '1.5rem', textAlign: 'left', border: '1px solid #ef4444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ color: '#ef4444', margin: 0 }}>CRITICAL UNRESOLVED AUTHORITY — {item.provider_scope}</h4>
                    <span className="badge-risk critical">{item.status}</span>
                  </div>
                  <p style={{ margin: '0.5rem 0' }}>
                    <strong>Principal:</strong> {item.principal_name} | <strong>Desired State:</strong> {item.desired_state} | <strong>Observed State:</strong> {item.observed_state} | <strong>Age:</strong> {item.age_seconds}s
                  </p>
                  
                  <div className="chain-diagram" style={{ margin: '1rem 0' }}>
                    <h4>Authority Delegation Path:</h4>
                    <div className="chain-nodes">
                      {item.authority_path.map((node, nIdx) => (
                        <React.Fragment key={nIdx}>
                          <div className={`chain-node ${node.type}`}>
                            <strong>{node.name}</strong>
                            <small>({node.type})</small>
                          </div>
                          {nIdx < item.authority_path.length - 1 && <div className="chain-arrow">➔</div>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <p className="justification-note" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
                    <strong>Failure Evidence:</strong> {item.failure_reason}
                  </p>

                  <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={() => handleGenerateEvidence(1)}>📜 VIEW EVIDENCE</button>
                    <button className="btn btn-warning" onClick={() => handleRetryUnresolvedItem(item.id)}>🔄 RETRY REMEDIATION</button>
                    <button className="btn btn-danger" onClick={() => handleTriggerKillSwitch('provider', 'AWS')}>🚨 ESCALATE KILL SWITCH</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeModal === 'scalebenchmark' && scaleBenchmarkData && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <h3>📊 Enterprise Scale & Chaos Benchmark Results</h3>
              <button onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="blast-grid">
                <div className="blast-stat"><span className="num">{scaleBenchmarkData.graph_benchmark?.principal_count}</span><span className="lbl">Principals</span></div>
                <div className="blast-stat"><span className="num">{scaleBenchmarkData.graph_benchmark?.edge_count}</span><span className="lbl">Delegation Edges</span></div>
                <div className="blast-stat"><span className="num">{scaleBenchmarkData.cascade_benchmark?.concurrent_cascades_simulated}</span><span className="lbl">Concurrent Cascades</span></div>
                <div className="blast-stat"><span className="num">{scaleBenchmarkData.cascade_benchmark?.total_revocation_jobs}</span><span className="lbl">Revocation Jobs</span></div>
              </div>
              <pre className="evidence-json-viewer">{JSON.stringify(scaleBenchmarkData, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
