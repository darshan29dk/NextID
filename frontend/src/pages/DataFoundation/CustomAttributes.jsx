import React, { useState } from 'react';
import './CustomAttributes.css';

const DEFAULT_CUSTOM_ATTRS = [
  { id: 'ca_1', name: 'cost_center', displayName: 'Cost Center Code', type: 'STRING', target: 'IDENTITY', required: true, unique: false },
  { id: 'ca_2', name: 'security_clearance', displayName: 'Security Clearance Level', type: 'ENUM', target: 'IDENTITY', required: true, unique: false },
  { id: 'ca_3', name: 'device_asset_tag', displayName: 'Primary Laptop Asset Tag', type: 'STRING', target: 'ACCOUNT', required: false, unique: true },
  { id: 'ca_4', name: 'data_classification', displayName: 'Data Sensitivity Tag', type: 'ENUM', target: 'ENTITLEMENT', required: false, unique: false }
];

export default function CustomAttributes() {
  const [attributes, setAttributes] = useState(DEFAULT_CUSTOM_ATTRS);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', displayName: '', type: 'STRING', target: 'IDENTITY', required: false, unique: false });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name || !form.displayName) return;
    const newAttr = {
      id: `ca_${Date.now()}`,
      ...form
    };
    setAttributes([...attributes, newAttr]);
    setShowModal(false);
    setForm({ name: '', displayName: '', type: 'STRING', target: 'IDENTITY', required: false, unique: false });
  };

  return (
    <div className="custom-attrs-container">
      <div className="custom-attrs-header">
        <div>
          <h2 className="custom-attrs-title">Custom Schema Attributes</h2>
          <p className="custom-attrs-subtitle">
            Extend identity, account, and entitlement schemas with custom enterprise fields.
          </p>
        </div>
        <button className="btn-add-attr" onClick={() => setShowModal(true)}>+ Add Custom Attribute</button>
      </div>

      <div className="attrs-table-card">
        <table className="attrs-table">
          <thead>
            <tr>
              <th>Attribute Key</th>
              <th>Display Name</th>
              <th>Target Object</th>
              <th>Data Type</th>
              <th>Required</th>
              <th>Unique</th>
            </tr>
          </thead>
          <tbody>
            {attributes.map(attr => (
              <tr key={attr.id}>
                <td><code>{attr.name}</code></td>
                <td><strong>{attr.displayName}</strong></td>
                <td><span className="type-tag">{attr.target}</span></td>
                <td><span className="type-tag">{attr.type}</span></td>
                <td>{attr.required ? 'Yes' : 'No'}</td>
                <td>{attr.unique ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Create Custom Attribute</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Attribute Key Name (slug)</label>
                <input className="form-input" placeholder="e.g. project_code" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Display Label</label>
                <input className="form-input" placeholder="e.g. Primary Project Code" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Target Schema Entity</label>
                <select className="form-input" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                  <option value="IDENTITY">IDENTITY</option>
                  <option value="ACCOUNT">ACCOUNT</option>
                  <option value="ENTITLEMENT">ENTITLEMENT</option>
                  <option value="ROLE">ROLE</option>
                </select>
              </div>
              <div className="form-group">
                <label>Data Type</label>
                <select className="form-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="STRING">STRING</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="ENUM">ENUM</option>
                  <option value="DATE">DATE</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                <button type="button" className="btn-config" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-add-attr">Save Attribute</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
