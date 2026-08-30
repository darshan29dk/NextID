import React, { useState } from 'react';
import './AttributeValidation.css';

const DEFAULT_VALIDATION_RULES = [
  { id: 'vr_1', attribute: 'email', ruleType: 'REGEX', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', description: 'Standard corporate RFC-compliant email address', status: 'ACTIVE' },
  { id: 'vr_2', attribute: 'employee_id', ruleType: 'REGEX', pattern: '^EMP-[0-9]{5}$', description: 'Employee ID format: EMP-12345', status: 'ACTIVE' },
  { id: 'vr_3', attribute: 'department', ruleType: 'ALLOWED_ENUM', pattern: 'FINANCE,ENGINEERING,HR,SALES,SECURITY', description: 'Restricted corporate department names', status: 'ACTIVE' },
  { id: 'vr_4', attribute: 'cost_center', ruleType: 'MIN_LENGTH', pattern: '4', description: 'Cost center code minimum length requirement', status: 'ACTIVE' }
];

export default function AttributeValidation() {
  const [rules, setRules] = useState(DEFAULT_VALIDATION_RULES);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ attribute: '', ruleType: 'REGEX', pattern: '', description: '' });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.attribute || !form.pattern) return;
    const newRule = {
      id: `vr_${Date.now()}`,
      ...form,
      status: 'ACTIVE'
    };
    setRules([...rules, newRule]);
    setShowModal(false);
    setForm({ attribute: '', ruleType: 'REGEX', pattern: '', description: '' });
  };

  return (
    <div className="val-rules-container">
      <div className="val-rules-header">
        <div>
          <h2 className="val-rules-title">Attribute Validation Rules Engine</h2>
          <p className="val-rules-subtitle">
            Configure sanitization, regex patterns, and constraints enforced during inbound identity & account ingestion.
          </p>
        </div>
        <button className="btn-add-attr" onClick={() => setShowModal(true)}>+ Add Validation Rule</button>
      </div>

      <div className="val-table-card">
        <table className="val-table">
          <thead>
            <tr>
              <th>Target Attribute</th>
              <th>Rule Type</th>
              <th>Pattern / Expression</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id}>
                <td><code>{rule.attribute}</code></td>
                <td><span className="type-tag">{rule.ruleType}</span></td>
                <td><code>{rule.pattern}</code></td>
                <td>{rule.description}</td>
                <td><span className="badge-active">{rule.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Create Attribute Validation Rule</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Target Attribute Name</label>
                <input className="form-input" placeholder="e.g. email or employee_id" value={form.attribute} onChange={e => setForm({ ...form, attribute: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Rule Validation Mechanism</label>
                <select className="form-input" value={form.ruleType} onChange={e => setForm({ ...form, ruleType: e.target.value })}>
                  <option value="REGEX">REGEX MATCHING</option>
                  <option value="ALLOWED_ENUM">ALLOWED ENUM VALUES</option>
                  <option value="MIN_LENGTH">MINIMUM LENGTH</option>
                  <option value="MAX_LENGTH">MAXIMUM LENGTH</option>
                </select>
              </div>
              <div className="form-group">
                <label>Pattern / Rule Value</label>
                <input className="form-input" placeholder="Pattern regex or comma-separated values" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input className="form-input" placeholder="Human-readable description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <button type="button" className="btn-config" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-add-attr">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
