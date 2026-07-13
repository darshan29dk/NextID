import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, BookOpen, GitCommitHorizontal } from 'lucide-react';
import { getRoleCatalogDetail, getVersionHistory, publishRole } from '../../services/roleCatalogService';
import { useAuth } from '../../context/AuthContext';
import './RoleCatalog.css';

// RC-004 (Role Details / workspace) + RC-005 (Version History, as a tab within
// this same workspace rather than a separate route — version history only
// makes sense in the context of one specific role).
const RoleCatalogDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState('general');
  const [role, setRole] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [republishing, setRepublishing] = useState(false);

  useEffect(() => {
    if (id) {
      setActiveTab('general');
      fetchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getRoleCatalogDetail(id);
      setRole(data);
      fetchVersions();
    } catch (err) {
      console.error("Failed to load role catalog detail:", err);
      setError("Failed to load this role. It may not be published yet, or may have been removed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async () => {
    try {
      setVersionsLoading(true);
      const data = await getVersionHistory(id);
      setVersions(data || []);
    } catch (err) {
      console.error("Failed to load version history:", err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRepublish = async () => {
    if (!window.confirm(`Publish a new version of '${role.role_name}'? This records a fresh snapshot in Version History.`)) return;
    try {
      setRepublishing(true);
      await publishRole(id);
      await fetchDetail();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to publish a new version.");
    } finally {
      setRepublishing(false);
    }
  };

  const canRepublish = currentUser?.role !== 'Viewer' && role && ['Ready For Publish', 'Published'].includes(role.status);

  return (
    <div className="workbench-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-action-premium"
            onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
              {loading ? 'Loading...' : (role?.role_name || `Role #${id}`)}
            </h2>
            {role && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '4px' }}>
                <span className="text-muted">Role ID: #{role.id}</span>
                <span>•</span>
                <span className={`status-badge-custom ${(role.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{role.status}</span>
                <span>•</span>
                <span className="text-muted">v{role.current_version}</span>
              </div>
            )}
          </div>
        </div>
        {canRepublish && (
          <button
            className="btn-action-premium primary"
            onClick={handleRepublish}
            disabled={republishing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <BookOpen size={14} />
            {republishing ? 'Publishing...' : role.status === 'Published' ? 'Publish New Version' : 'Publish to Catalog'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--primary)' }} />
            <span className="text-muted" style={{ fontSize: '12px' }}>Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: '20px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : role && (
        <>
          <div className="workbench-tabs-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '20px', backgroundColor: 'var(--bg-card)', padding: '0 4px' }}>
            <button className={`tab-link-premium ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
            <button className={`tab-link-premium ${activeTab === 'entitlements' ? 'active' : ''}`} onClick={() => setActiveTab('entitlements')}>Entitlements ({role.entitlements?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>Users ({role.members?.length || 0})</button>
            <button className={`tab-link-premium ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>Version History ({versions.length})</button>
          </div>

          <div style={{ padding: '4px', maxWidth: '900px' }}>
            {activeTab === 'general' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="grid-details-premium" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="detail-item-box">
                    <span className="label text-muted">Classification</span>
                    <span className="value">{role.classification || 'None'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Role Type</span>
                    <span className="value">{role.role_type || 'None'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Risk Level</span>
                    <span className="value">{role.risk_level || 'Low'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Confidence Score</span>
                    <span className="value">{role.confidence_score}%</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Department</span>
                    <span className="value">{role.department || '-'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Business Unit</span>
                    <span className="value">{role.business_unit || '-'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Primary Owner</span>
                    <span className="value">{role.primary_owner_name || 'Unassigned'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Backup Owner</span>
                    <span className="value">{role.backup_owner_name || 'Unassigned'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Published By</span>
                    <span className="value">{role.published_by || '-'}</span>
                  </div>
                  <div className="detail-item-box">
                    <span className="label text-muted">Published Date</span>
                    <span className="value">{role.published_at ? new Date(role.published_at).toLocaleString() : '-'}</span>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                <div>
                  <span className="label text-muted" style={{ display: 'block', marginBottom: '6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</span>
                  <div style={{
                    padding: '10px 14px', borderRadius: '6px',
                    backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)',
                    fontSize: '13px', fontStyle: role.role_description ? 'normal' : 'italic',
                    color: role.role_description ? 'var(--text-main)' : 'var(--text-muted)',
                    lineHeight: 1.4
                  }}>
                    {role.role_description || "No description provided."}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'entitlements' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Mapped Entitlements ({role.entitlements?.length || 0})</h4>
                {(!role.entitlements || role.entitlements.length === 0) ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>No entitlements mapped.</div>
                ) : (
                  role.entitlements.map((e, idx) => (
                    <div key={idx} style={{
                      padding: '10px 14px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{e.entitlement_name}</div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>Application: {e.application_name}</div>
                      </div>
                      <span className={`risk-badge ${(e.risk || 'low').toLowerCase()}`}>{e.risk || 'Low'}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Mapped Members ({role.members?.length || 0})</h4>
                {(!role.members || role.members.length === 0) ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>No members assigned.</div>
                ) : (
                  role.members.map((m, idx) => (
                    <div key={idx} style={{
                      padding: '10px 14px', borderRadius: '6px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)'
                    }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{m.employee_name}</div>
                      <div className="text-muted" style={{ fontSize: '11px' }}>Emp ID: {m.employee_id} • Dept: {m.department}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'versions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>Version History</h4>
                {versionsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                    <Loader2 className="animate-spin text-muted" size={20} />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>
                    No versions recorded yet. Publishing this role will create version 1.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px' }}>
                    <div style={{
                      position: 'absolute', left: '7px', top: '8px', bottom: '8px',
                      width: '2px', backgroundColor: 'var(--border-color)', zIndex: 1
                    }} />
                    {versions.map((v) => (
                      <div key={v.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 2 }}>
                        <div style={{
                          position: 'absolute', left: '-24px', top: '2px',
                          width: '16px', height: '16px', borderRadius: '50%',
                          backgroundColor: 'var(--primary)', border: '4px solid var(--bg-card)'
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <GitCommitHorizontal size={13} /> Version {v.version_number}
                          </strong>
                          <span className="text-muted" style={{ fontSize: '11px' }}>
                            {v.created_at ? new Date(v.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {v.change_summary} — by {v.changed_by}
                        </span>
                        <div style={{
                          display: 'flex', gap: '16px', flexWrap: 'wrap',
                          fontSize: '11px', color: 'var(--text-muted)',
                          padding: '8px 12px', borderRadius: '6px',
                          backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)'
                        }}>
                          <span>Classification: <strong style={{ color: 'var(--text-main)' }}>{v.classification || '-'}</strong></span>
                          <span>Risk: <strong style={{ color: 'var(--text-main)' }}>{v.risk_level || '-'}</strong></span>
                          <span>Users: <strong style={{ color: 'var(--text-main)' }}>{v.user_count ?? '-'}</strong></span>
                          <span>Entitlements: <strong style={{ color: 'var(--text-main)' }}>{v.entitlement_count ?? '-'}</strong></span>
                          <span>Owner: <strong style={{ color: 'var(--text-main)' }}>{v.primary_owner_name || '-'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RoleCatalogDetail;
