import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCw, AlertTriangle, Eye, BookOpen, Briefcase, Cpu, Layers } from 'lucide-react';
import { getPublishedRoles, getCatalogKpi, publishRole } from '../../services/roleCatalogService';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import './RoleCatalog.css';

// Shared list view backing RC-001 (Published Roles, no filter), RC-002
// (Business Roles, roleTypeFilter="Business") and RC-003 (Technical Roles,
// roleTypeFilter="Technical"). All three are the same catalog query with a
// different default role_type filter, so they share this one component
// instead of three near-duplicate page files.
const RoleCatalogList = ({ title, subtitle, roleTypeFilter, headerIcon: HeaderIcon, hideHeader }) => {
  const navigate = useNavigate();

  const [roles, setRoles] = useState([]);
  const [kpi, setKpi] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [classification, setClassification] = useState('');
  const [activeTab, setActiveTab] = useState('published');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [listRes, kpiRes] = await Promise.all([
        getPublishedRoles({
          page,
          limit,
          search: search.trim() || undefined,
          role_type: roleTypeFilter || undefined,
          classification: classification || undefined,
          status: activeTab === 'published' ? 'Published' : 'Ready For Publish'
        }),
        getCatalogKpi()
      ]);
      setRoles(listRes.roles || []);
      setTotal(listRes.total || 0);
      setTotalPages(listRes.total_pages || 0);
      setKpi(kpiRes || {});
    } catch (err) {
      console.error("Failed to load role catalog:", err);
      setError("Failed to load the role catalog. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, classification, roleTypeFilter, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 whenever the route (role type filter) changes
  useEffect(() => {
    setPage(1);
    setSearch('');
    setSearchInput('');
    setClassification('');
    setActiveTab('published');
  }, [roleTypeFilter]);

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      setPage(1);
      setSearch(searchInput);
    }
  };

  const handlePublish = async (roleId, roleName) => {
    const summary = window.prompt(`Publish '${roleName}' to the Role Catalog? Add a change summary (optional):`, "Initial publish to catalog");
    if (summary === null) return;
    try {
      setLoading(true);
      await publishRole(roleId, summary);
      fetchData();
    } catch (err) {
      console.error("Failed to publish role:", err);
      alert(err.response?.data?.detail || "Failed to publish role.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={hideHeader ? "" : "workbench-container"} style={hideHeader ? { display: 'flex', flexDirection: 'column', gap: '20px' } : { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {HeaderIcon && <HeaderIcon size={20} style={{ color: '#2563eb' }} />}
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{title}</h2>
            <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>{subtitle}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="workbench-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <DashboardCard title="Total Published" value={kpi.total_published ?? 0} icon={BookOpen} trend="" />
        <DashboardCard title="Business Roles" value={kpi.business_roles ?? 0} icon={Briefcase} trend="" />
        <DashboardCard title="Technical Roles" value={kpi.technical_roles ?? 0} icon={Cpu} trend="" />
        <DashboardCard title="Pending Publish" value={kpi.pending_publish ?? 0} icon={Layers} trend="" />
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
        <button
          onClick={() => { setActiveTab('published'); setPage(1); }}
          className={`drawer-tab-btn ${activeTab === 'published' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: activeTab === 'published' ? '#2563eb' : 'var(--text-muted)', borderBottom: activeTab === 'published' ? '2px solid #2563eb' : 'none' }}
        >
          Published Roles
        </button>
        <button
          onClick={() => { setActiveTab('pending'); setPage(1); }}
          className={`drawer-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: activeTab === 'pending' ? '#2563eb' : 'var(--text-muted)', borderBottom: activeTab === 'pending' ? '2px solid #2563eb' : 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          Pending Publish
          {kpi.pending_publish > 0 && (
            <span style={{ backgroundColor: '#2563eb', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '10px' }}>
              {kpi.pending_publish}
            </span>
          )}
        </button>
      </div>

      {/* Toolbar */}
      <div className="workbench-toolbar" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-card)', gap: '12px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <div className="search-input-container" style={{ flex: 1 }}>
            <Search className="search-icon" size={14} />
            <input
              type="text"
              placeholder="Search by role name, department, business unit... (Press Enter)"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyPress}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select value={classification} onChange={e => { setClassification(e.target.value); setPage(1); }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '13px' }}>
            <option value="">All Classifications</option>
            <option value="Birthright">Birthright</option>
            <option value="Request-Based">Request-Based</option>
          </select>

          <button onClick={fetchData} className="btn-action-premium" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--danger)', borderRadius: '6px', border: '1px solid var(--danger)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="table-responsive-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
        <table className="table-premium">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Classification</th>
              <th>Role Type</th>
              <th>Risk</th>
              <th>Owner</th>
              <th>Users</th>
              <th>Entitlements</th>
              <th>Version</th>
              <th>{activeTab === 'pending' ? 'Approved Date' : 'Published Date'}</th>
              <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px' }}>
                  <RotateCw className="animate-spin text-muted" size={24} style={{ margin: '0 auto' }} />
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No {activeTab === 'pending' ? 'pending' : 'published'} roles found{roleTypeFilter ? ` for role type '${roleTypeFilter}'` : ''}.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.role_name}</td>
                  <td>
                    {r.classification ? (
                      <span className={`classification-tag ${r.classification.toLowerCase()}`}>{r.classification}</span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>{r.role_type || '-'}</td>
                  <td>
                    <span className={`risk-badge ${(r.risk_level || 'low').toLowerCase()}`}>{r.risk_level || 'Low'}</span>
                  </td>
                  <td>{r.primary_owner_name || '-'}</td>
                  <td>{r.user_count}</td>
                  <td>{r.entitlement_count}</td>
                  <td>v{r.current_version}</td>
                  <td>{r.published_at ? new Date(r.published_at).toLocaleDateString() : (r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '-')}</td>
                  <td style={{ textAlign: 'right' }}>
                    {activeTab === 'pending' ? (
                      <button
                        className="btn-action-premium primary"
                        style={{ fontSize: '11px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px', height: 'auto', marginLeft: 'auto' }}
                        onClick={() => handlePublish(r.id, r.role_name)}
                      >
                        <BookOpen size={12} /> Publish
                      </button>
                    ) : (
                      <button
                        className="btn-icon-action"
                        title="View Role Workspace"
                        onClick={() => navigate(`/role-catalog/${r.id}`)}
                      >
                        <Eye size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
            <span className="text-muted" style={{ fontSize: '13px' }}>
              Showing Page {page} of {totalPages} ({total} total)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-action-premium"
                disabled={page === 1 || loading}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-action-premium"
                disabled={page === totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleCatalogList;
