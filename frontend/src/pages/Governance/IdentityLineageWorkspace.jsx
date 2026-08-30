import React from 'react';
import ProvenanceGraphVisualizer from './ProvenanceGraphVisualizer';
import './IdentityLineageWorkspace.css';

export default function IdentityLineageWorkspace() {
  return (
    <div className="lineage-workspace">
      <div className="lineage-header">
        <h2 className="lineage-title">Interactive Identity Lineage & Provenance Workspace</h2>
        <p className="lineage-subtitle">
          Trace identity authority epochs, entitlement delegation trees, and JIT credential lineage across time.
        </p>
      </div>

      <ProvenanceGraphVisualizer />
    </div>
  );
}
