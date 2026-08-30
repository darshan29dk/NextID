import React, { useState } from 'react';
import './ProvenanceGraphVisualizer.css';

export default function ProvenanceGraphVisualizer() {
  const [activeEpoch, setActiveEpoch] = useState(1);

  return (
    <div className="graph-vis-container">
      <div className="graph-vis-header">
        <div>
          <h3 className="graph-vis-title">Temporal Identity & Credential Lineage Graph</h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Interactive DAG visualization of identity state, entitlement delegation, and JIT credential lineage.</span>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>Epoch Version:</label>
          <select 
            value={activeEpoch} 
            onChange={e => setActiveEpoch(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value={1}>Epoch 1 (Initial Joiner)</option>
            <option value={2}>Epoch 2 (Mover Event)</option>
            <option value={3}>Epoch 3 (JIT Elevated)</option>
          </select>
        </div>
      </div>

      <div className="graph-canvas-area">
        <div className="node-flow">
          <div className="graph-node" style={{ borderColor: '#3b82f6' }}>
            <div className="node-title">Identity Node</div>
            <div className="node-sub">P-1001 (Alice)</div>
            <div className="node-sub">Epoch #{activeEpoch}</div>
          </div>

          <div className="node-edge">➔ [Correlated] ➔</div>

          <div className="graph-node" style={{ borderColor: '#8b5cf6' }}>
            <div className="node-title">Account Node</div>
            <div className="node-sub">acc_aws_corp</div>
            <div className="node-sub">AWS IAM</div>
          </div>

          <div className="node-edge">➔ [Granted] ➔</div>

          <div className="graph-node" style={{ borderColor: '#ec4899' }}>
            <div className="node-title">Entitlement</div>
            <div className="node-sub">AdministratorAccess</div>
            <div className="node-sub">Risk: CRITICAL</div>
          </div>

          {activeEpoch >= 3 && (
            <>
              <div className="node-edge">➔ [JIT Lease] ➔</div>
              <div className="graph-node" style={{ borderColor: '#10b981' }}>
                <div className="node-title">JIT Credential</div>
                <div className="node-sub">Temp Access Key</div>
                <div className="node-sub">TTL: 4h Capped</div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 24 }}>
          <div>Provenance Engine: Deterministic Temporal DAG</div>
          <div>Status: Real-Time Verified</div>
        </div>
      </div>
    </div>
  );
}
