import React, { useState } from 'react';
import './CloudDirectories.css';

const DEFAULT_DIRECTORIES = [
  {
    id: 'dir_azure_01',
    provider: 'Microsoft Entra ID (Azure AD)',
    iconClass: 'azure-icon',
    iconText: 'MS',
    domain: 'corp.contoso.onmicrosoft.com',
    identitiesCount: 4250,
    groupsCount: 180,
    lastSync: '10 mins ago',
    status: 'CONNECTED'
  },
  {
    id: 'dir_okta_01',
    provider: 'Okta Identity Cloud',
    iconClass: 'okta-icon',
    iconText: 'OK',
    domain: 'acme.okta.com',
    identitiesCount: 1890,
    groupsCount: 95,
    lastSync: '1 hour ago',
    status: 'CONNECTED'
  },
  {
    id: 'dir_google_01',
    provider: 'Google Workspace',
    iconClass: 'google-icon',
    iconText: 'GW',
    domain: 'corp.google.com',
    identitiesCount: 3100,
    groupsCount: 120,
    lastSync: 'Syncing now...',
    status: 'SYNCING'
  },
  {
    id: 'dir_ping_01',
    provider: 'Ping Identity (PingFederate)',
    iconClass: 'ping-icon',
    iconText: 'PI',
    domain: 'auth.enterprise-ping.com',
    identitiesCount: 0,
    groupsCount: 0,
    lastSync: 'Never',
    status: 'DISABLED'
  }
];

export default function CloudDirectories() {
  const [directories, setDirectories] = useState(DEFAULT_DIRECTORIES);
  const [syncingId, setSyncingId] = useState(null);

  const handleTriggerSync = (id) => {
    setSyncingId(id);
    setTimeout(() => {
      setDirectories(prev => prev.map(d => d.id === id ? { ...d, lastSync: 'Just now', status: 'CONNECTED' } : d));
      setSyncingId(null);
    }, 1200);
  };

  return (
    <div className="cloud-directories-container">
      <div className="cloud-directories-header">
        <div>
          <h2 className="cloud-directories-title">Cloud Directories Synchronization</h2>
          <p className="cloud-directories-subtitle">
            Manage real-time inbound directory synchronization from Entra ID, Okta, and Google Workspace.
          </p>
        </div>
      </div>

      <div className="cloud-grid">
        {directories.map(dir => (
          <div key={dir.id} className="cloud-card">
            <div className="cloud-card-header">
              <div className={`cloud-provider-icon ${dir.iconClass}`}>
                {dir.iconText}
              </div>
              <span className={`cloud-status-badge ${
                dir.status === 'CONNECTED' ? 'badge-connected' :
                dir.status === 'SYNCING' ? 'badge-syncing' : 'badge-disabled'
              }`}>
                {dir.status}
              </span>
            </div>

            <h3 className="cloud-card-title">{dir.provider}</h3>
            <div className="cloud-card-meta">{dir.domain}</div>

            <div className="cloud-card-stats">
              <div><strong>Identities:</strong> {dir.identitiesCount.toLocaleString()}</div>
              <div><strong>Groups:</strong> {dir.groupsCount}</div>
            </div>
            <div className="cloud-card-stats" style={{ borderTop: 'none', paddingTop: 4 }}>
              <div><strong>Last Sync:</strong> {dir.lastSync}</div>
            </div>

            <div className="cloud-card-actions">
              <button 
                className="btn-sync" 
                onClick={() => handleTriggerSync(dir.id)}
                disabled={syncingId === dir.id}
              >
                {syncingId === dir.id ? 'Syncing...' : 'Sync Now'}
              </button>
              <button className="btn-config">Configure</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
