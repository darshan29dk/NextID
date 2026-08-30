import React, { useState } from 'react';
import './ComplianceReportWorkspace.css';

const FRAMEWORKS = [
  { id: 'SOX', name: 'SOX Section 404', badge: 'FINANCIAL CONTROL', desc: 'Sarbanes-Oxley compliance covering IT General Controls (ITGC), segregation of duties, and authorization logs.' },
  { id: 'SOC2', name: 'SOC 2 Type II', badge: 'SECURITY & TRUST', desc: 'Trust Services Criteria auditing access control, logical boundaries, and emergency break-glass procedures.' },
  { id: 'ISO27001', name: 'ISO/IEC 27001:2022', badge: 'ISMS AUDIT', desc: 'Annex A.9 access control & identity lifecycle management policy enforcement evidence.' },
  { id: 'HIPAA', name: 'HIPAA Security Rule', badge: 'HEALTHCARE PRIVACY', desc: 'Protected Health Information (PHI) access control, audit controls (§164.312), and termination workflows.' }
];

export default function ComplianceReportWorkspace() {
  const [selectedFramework, setSelectedFramework] = useState('SOX');
  const [format, setFormat] = useState('json');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/compliance-reports/generate?framework=${selectedFramework}&format=${format}`);
      if (format === 'csv') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Compliance_Report_${selectedFramework}.csv`;
        a.click();
        setLoading(false);
        return;
      }
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Failed to generate compliance report:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="compliance-workspace">
      <div className="compliance-header">
        <div>
          <h2 className="compliance-title">Automated Compliance Report Generator</h2>
          <p className="compliance-subtitle">
            Instantly aggregate evidence-backed audit packages across SOX, SOC2, ISO27001, and HIPAA frameworks.
          </p>
        </div>
      </div>

      <div className="framework-cards">
        {FRAMEWORKS.map(fw => (
          <div 
            key={fw.id} 
            className={`framework-card ${selectedFramework === fw.id ? 'active' : ''}`}
            onClick={() => setSelectedFramework(fw.id)}
          >
            <span className="framework-badge">{fw.badge}</span>
            <h3 className="framework-name">{fw.name}</h3>
            <p className="framework-desc">{fw.desc}</p>
          </div>
        ))}
      </div>

      <div className="report-controls">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Export Format:</label>
          <select 
            value={format} 
            onChange={e => setFormat(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14 }}
          >
            <option value="json">JSON Evidence Package</option>
            <option value="csv">CSV Audit Spreadsheet</option>
          </select>
        </div>

        <button className="btn-generate" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Compiling Audit Evidence...' : `Generate ${selectedFramework} Report`}
        </button>
      </div>

      {reportData && format === 'json' && (
        <div className="report-preview-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Generated Report Package ({reportData.metadata?.framework})</h3>
            <span style={{ fontWeight: 700, color: '#10b981' }}>Health Score: {reportData.metadata?.summary?.compliance_health_score}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>SoD Violations</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reportData.metadata?.summary?.sod_violations_count}</div>
            </div>
            <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Certification Campaigns</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reportData.metadata?.summary?.certification_campaigns_count}</div>
            </div>
            <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Break-Glass Incidents</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reportData.metadata?.summary?.break_glass_incidents_count}</div>
            </div>
            <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>JML Lifecycle Events</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{reportData.metadata?.summary?.jml_lifecycle_events_count}</div>
            </div>
          </div>

          <pre className="preview-json">{JSON.stringify(reportData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
