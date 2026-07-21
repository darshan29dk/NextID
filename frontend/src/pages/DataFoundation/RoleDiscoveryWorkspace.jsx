import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Trash2, X, AlertTriangle, ArrowLeft, RotateCcw,
  CheckCircle2, XCircle, Info, Users, Layers, Target, PieChart,
  GitCompare, ShieldAlert, Boxes, KeyRound, Gauge, ChevronLeft, ChevronRight
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import RoleMiningMatrix from '../../components/RoleMiningMatrix/RoleMiningMatrix';
import RoleAnalyticalCharts, { VIEW_MODES } from '../../components/RoleMiningMatrix/RoleAnalyticalCharts';
import { ToastContainer, showToast } from '../../components/Toast/Toast';
import {
  getMiningCampaigns,
  createMiningCampaign,
  deleteMiningCampaign,
  runMiningCampaign,
  getCandidateRoles,
  getCandidateRoleDetail,
  compareCandidateRoles,
  getCampaignOutliers,
  getCampaignMatrix
} from '../../services/roleDiscoveryService';
import { getApplications } from '../../services/applicationService';
import { canCreate, canEdit, canDelete } from '../../utils/permissions';
import './RoleDiscoveryWorkspace.css';

const INITIAL_FORM = {
  campaign_name: '', description: '', scope_type: 'All', application_id: '',
  eps: 0.4, min_samples: 2
};

const ANALYTICAL_VIEW_HINTS = {
  grid: 'Entitlement grants by member, based on verified account data.',
  coverage: 'Member coverage percentage per entitlement.',
  core: 'Core and non-core entitlement distribution.',
  member: 'Entitlement match percentage per member.',
  role: 'Entitlement distribution across candidate roles.',
};

const RoleDiscoveryWorkspace = () => {
  const [view, setView] = useState('list');

  // List state
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // Pagination for campaigns list
  const CAMPAIGNS_PER_PAGE = 10;
  const [campaignPage, setCampaignPage] = useState(1);

  // Add Campaign modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [applications, setApplications] = useState([]);

  // Delete confirm modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Run state
  const [runningCampaignId, setRunningCampaignId] = useState(null);

  // Detail state
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [detailTab, setDetailTab] = useState('roles');
  const [candidateRoles, setCandidateRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [outliers, setOutliers] = useState([]);
  const [outliersLoading, setOutliersLoading] = useState(false);

  // Role detail drawer
  const [selectedRoleDetail, setSelectedRoleDetail] = useState(null);
  const [roleDetailLoading, setRoleDetailLoading] = useState(false);

  // Compare
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Matrix view (sir's Role Studio reference - multiple roles, color-coded, real grants)
  const [campaignMatrix, setCampaignMatrix] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const [analyticalViewMode, setAnalyticalViewMode] = useState('grid'); // 'grid' | 'coverage' | 'core' | 'member' | 'role'

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await getMiningCampaigns({ search: search.trim() || undefined, limit: 50 });
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to load mining campaigns:', err);
      setErrorMsg('Failed to load mining campaigns.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  useEffect(() => {
    getApplications({ limit: 100 }).then((data) => setApplications(data.applications || [])).catch(() => {});
  }, []);

  const kpiStats = {
    total: campaigns.length,
    completed: campaigns.filter((c) => c.status === 'Completed').length,
    totalRoles: campaigns.reduce((sum, c) => sum + (c.total_candidate_roles || 0), 0),
    avgCoverage: campaigns.length
      ? Math.round(campaigns.reduce((sum, c) => sum + (c.coverage_percentage || 0), 0) / campaigns.length)
      : 0
  };

  // ---------------------------------------------------------------
  // Add Campaign
  // ---------------------------------------------------------------
  const handleOpenAddModal = () => {
    setFormData(INITIAL_FORM);
    setFormError(null);
    setShowFormModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormSubmitting(true);
      setFormError(null);
      const payload = {
        campaign_name: formData.campaign_name,
        description: formData.description || null,
        scope_type: formData.scope_type,
        application_id: formData.scope_type === 'Application' && formData.application_id
          ? parseInt(formData.application_id, 10) : null,
        eps: parseFloat(formData.eps) || 0.4,
        min_samples: parseInt(formData.min_samples, 10) || 2
      };
      await createMiningCampaign(payload);
      setShowFormModal(false);
      fetchCampaigns();
    } catch (err) {
      console.error('Failed to create campaign:', err);
      setFormError(err.response?.data?.detail || 'Failed to create mining campaign.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // ---------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------
  const handleOpenDeleteConfirm = (campaign, e) => {
    if (e) e.stopPropagation();
    setCampaignToDelete(campaign);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!campaignToDelete) return;
    try {
      setDeleteSubmitting(true);
      await deleteMiningCampaign(campaignToDelete.id);
      setShowDeleteConfirm(false);
      setCampaignToDelete(null);
      fetchCampaigns();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete campaign.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ---------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------
  const handleRunCampaign = async (campaign, e) => {
    if (e) e.stopPropagation();
    try {
      setErrorMsg(null);
      setRunningCampaignId(campaign.id);
      const updated = await runMiningCampaign(campaign.id);
      fetchCampaigns();
      if (view === 'detail' && selectedCampaign?.id === campaign.id) {
        setSelectedCampaign(updated);
        fetchCandidateRoles(campaign.id);
        fetchOutliers(campaign.id);
      }
      // No blocking popup on success - the KPI cards update in place, and
      // the backend already raises a bell notification with the same
      // summary (accounts analyzed, roles found, coverage), so the result
      // is visible in-platform without interrupting the flow.
    } catch (err) {
      console.error('Mining run failed:', err);
      setErrorMsg(err.response?.data?.detail || 'Mining run failed.');
    } finally {
      setRunningCampaignId(null);
    }
  };

  // ---------------------------------------------------------------
  // Detail view
  // ---------------------------------------------------------------
  const fetchCandidateRoles = useCallback(async (campaignId) => {
    try {
      setRolesLoading(true);
      const data = await getCandidateRoles(campaignId);
      setCandidateRoles(data.roles || []);
    } catch (err) {
      console.error('Failed to load candidate roles:', err);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const fetchOutliers = useCallback(async (campaignId) => {
    try {
      setOutliersLoading(true);
      const data = await getCampaignOutliers(campaignId);
      setOutliers(data.outliers || []);
    } catch (err) {
      console.error('Failed to load outliers:', err);
    } finally {
      setOutliersLoading(false);
    }
  }, []);

  const handleOpenDetail = (campaign) => {
    setSelectedCampaign(campaign);
    setDetailTab('roles');
    setSelectedForCompare([]);
    setCampaignMatrix(null);
    setView('detail');
    fetchCandidateRoles(campaign.id);
    fetchOutliers(campaign.id);
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedCampaign(null);
    setCandidateRoles([]);
    setOutliers([]);
    setCampaignMatrix(null);
    fetchCampaigns();
  };

  const fetchCampaignMatrixData = useCallback(async (campaignId, roleIds) => {
    try {
      setMatrixLoading(true);
      setMatrixError('');
      const data = await getCampaignMatrix(campaignId, roleIds && roleIds.length ? roleIds : undefined);
      setCampaignMatrix(data);
    } catch (err) {
      console.error('Failed to load campaign matrix:', err);
      setMatrixError('Failed to load matrix view.');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  const handleOpenRoleDetail = async (roleId) => {
    try {
      setRoleDetailLoading(true);
      const data = await getCandidateRoleDetail(roleId);
      setSelectedRoleDetail(data);
    } catch (err) {
      showToast('Failed to load candidate role details.', 'error');
    } finally {
      setRoleDetailLoading(false);
    }
  };

  const toggleCompareSelection = (roleId) => {
    setSelectedForCompare((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleCompare = async () => {
    if (selectedForCompare.length < 2) {
      showToast('Select at least 2 candidate roles to compare.', 'warning');
      return;
    }
    try {
      const data = await compareCandidateRoles(selectedForCompare);
      setCompareResult(data);
      setShowCompareModal(true);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to compare candidate roles.', 'error');
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return <span className="status-badge connected"><CheckCircle2 size={12} /> Completed</span>;
      case 'Running':
        return <span className="status-badge draft"><RotateCcw size={12} className="spinner-icon" /> Running</span>;
      case 'Failed':
        return <span className="status-badge failed"><XCircle size={12} /> Failed</span>;
      default:
        return <span className="status-badge disabled"><Info size={12} /> Draft</span>;
    }
  };

  // =================================================================
  // DETAIL VIEW
  // =================================================================
  if (view === 'detail' && selectedCampaign) {
    return (
      <div className="connector-workspace-page">
        <Breadcrumb
          items={[
            { label: 'Role Discovery', active: false },
            { label: selectedCampaign.campaign_name, active: true }
          ]}
        />

        <button className="btn-back-link" onClick={handleBackToList} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '12px', fontSize: '13px' }}>
          <ArrowLeft size={14} /> Back to Campaigns
        </button>

        <div className="page-header-actions">
          <div className="header-title-section">
            <h2>{selectedCampaign.campaign_name}</h2>
            <p>{selectedCampaign.description || 'Scope: ' + (selectedCampaign.scope_type === 'Application' ? 'Single Application' : 'All correlated accounts')}</p>
          </div>
          <div className="header-buttons-section">
            {canEdit('Role Discovery') && (
              <button
                className="btn-add-connector"
                onClick={(e) => handleRunCampaign(selectedCampaign, e)}
                disabled={runningCampaignId === selectedCampaign.id}
              >
                <RotateCcw size={14} className={runningCampaignId === selectedCampaign.id ? 'spinner-icon' : ''} />
                <span>{runningCampaignId === selectedCampaign.id ? 'Running...' : 'Run Mining'}</span>
              </button>
            )}
          </div>
        </div>

        {errorMsg && <div className="error-banner" style={{ margin: '0 0 16px' }}>{errorMsg}</div>}

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <DashboardCard title="Identities Analyzed" value={selectedCampaign.identities_analyzed ?? 0} icon={Users} color="blue" loading={false} />
          <DashboardCard title="Applications Analyzed" value={selectedCampaign.applications_analyzed ?? 0} icon={Boxes} color="cyan" loading={false} />
          <DashboardCard title="Accounts Correlated" value={selectedCampaign.total_accounts_analyzed} icon={CheckCircle2} color="teal" loading={false} />
          <DashboardCard title="Entitlements Analyzed" value={selectedCampaign.entitlements_analyzed ?? 0} icon={KeyRound} color="purple" loading={false} />
          <DashboardCard title="Discovered Role Candidates" value={selectedCampaign.total_candidate_roles} icon={Layers} color="green" loading={false} />
          <DashboardCard title="Coverage" value={`${selectedCampaign.coverage_percentage}%`} icon={PieChart} color="violet" loading={false} />
          <DashboardCard title="Confidence" value={`${selectedCampaign.avg_confidence_score ?? 0}%`} icon={Gauge} color="blue" loading={false} />
          <DashboardCard title="Outliers" value={selectedCampaign.total_outliers} icon={ShieldAlert} color="yellow" loading={false} />
        </div>

        <div className="controls-card" style={{ display: 'flex', gap: '8px', padding: '4px', marginBottom: '16px' }}>
          <button
            className={`drawer-tab-btn ${detailTab === 'roles' ? 'active' : ''}`}
            onClick={() => setDetailTab('roles')}
            style={{ padding: '10px 18px' }}
          >
            <Layers size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Candidate Roles ({candidateRoles.length})
          </button>
          <button
            className={`drawer-tab-btn ${detailTab === 'outliers' ? 'active' : ''}`}
            onClick={() => setDetailTab('outliers')}
            style={{ padding: '10px 18px' }}
          >
            <ShieldAlert size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Outliers ({outliers.length})
          </button>
          <button
            className={`drawer-tab-btn ${detailTab === 'matrix' ? 'active' : ''}`}
            onClick={() => { setDetailTab('matrix'); if (!campaignMatrix) fetchCampaignMatrixData(selectedCampaign.id, selectedForCompare); }}
            style={{ padding: '10px 18px' }}
          >
            <PieChart size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Analytical View
          </button>
        </div>

        {detailTab === 'roles' && (
          <>
            {selectedForCompare.length > 0 && (
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="text-muted" style={{ fontSize: '13px' }}>{selectedForCompare.length} selected</span>
                <button className="btn-add-connector" onClick={handleCompare} disabled={selectedForCompare.length < 2} style={{ padding: '8px 14px', fontSize: '12.5px' }}>
                  <GitCompare size={13} /> <span>Compare Selected</span>
                </button>
              </div>
            )}
            <div className="table-card">
              <table className="detail-inner-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th></th>
                    <th style={{ textAlign: 'left' }}>Role Name</th>
                    <th style={{ textAlign: 'left' }}>Job Function</th>
                    <th style={{ textAlign: 'center' }}>Members</th>
                    <th style={{ textAlign: 'center' }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rolesLoading ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
                  ) : candidateRoles.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px' }} className="text-muted">
                      No candidate roles yet. Click "Run Mining" above to analyze this campaign's scope.
                    </td></tr>
                  ) : candidateRoles.map((role, idx) => (
                    <tr key={role.id} onClick={() => handleOpenRoleDetail(role.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedForCompare.includes(role.id)}
                          onChange={() => toggleCompareSelection(role.id)}
                        />
                      </td>
                      <td style={{ fontWeight: '600' }}>{role.role_name}</td>
                      <td>{role.job_function}</td>
                      <td style={{ textAlign: 'center' }}>{role.member_count}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`status-badge ${role.confidence_score >= 85 ? 'connected' : role.confidence_score >= 70 ? 'draft' : 'disabled'}`}>
                          {role.confidence_score}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {candidateRoles.length > 0 && (
                <div className="table-pagination-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 24px' }}>
                  <div className="pagination-info">
                    Showing <b>1</b> to <b>{candidateRoles.length}</b> of <b>{candidateRoles.length}</b> candidate roles
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {detailTab === 'outliers' && (
          <div className="table-card">
            <table className="detail-inner-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th style={{ textAlign: 'left' }}>Account</th>
                  <th style={{ textAlign: 'left' }}>Application</th>
                  <th style={{ textAlign: 'left' }}>Job Function</th>
                </tr>
              </thead>
              <tbody>
                {outliersLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>Loading...</td></tr>
                ) : outliers.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px' }} className="text-muted">
                    No outliers — every scoped account either fit a candidate role or hasn't been analyzed yet.
                  </td></tr>
                ) : outliers.map((o, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ fontWeight: '600' }}>{o.account_name || o.account_id}</td>
                    <td>{o.application_name}</td>
                    <td>{o.job_function || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outliers.length > 0 && (
              <div className="table-pagination-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 24px' }}>
                <div className="pagination-info">
                  Showing <b>1</b> to <b>{outliers.length}</b> of <b>{outliers.length}</b> outliers
                </div>
              </div>
            )}
          </div>
        )}

        {detailTab === 'matrix' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="analytical-view-toolbar">
              <div className="analytical-view-caption">
                <span className="analytical-view-caption-title">
                  {selectedForCompare.length > 0
                    ? `Scope: ${selectedForCompare.length} selected role(s)`
                    : 'Scope: Top 10 roles by confidence score'}
                </span>
                <span className="analytical-view-caption-desc">{ANALYTICAL_VIEW_HINTS[analyticalViewMode]}</span>
              </div>
              <div className="analytical-view-controls">
                <select
                  className="analytical-view-select"
                  value={analyticalViewMode}
                  onChange={(e) => setAnalyticalViewMode(e.target.value)}
                >
                  {VIEW_MODES.map((vm) => (
                    <option key={vm.value} value={vm.value}>{vm.label}</option>
                  ))}
                </select>
                <button
                  className="btn-add-connector"
                  onClick={() => fetchCampaignMatrixData(selectedCampaign.id, selectedForCompare)}
                  style={{ padding: '8px 14px', fontSize: '12.5px' }}
                >
                  <RotateCcw size={13} className={matrixLoading ? 'spinner-icon' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
            {matrixError && <div className="drawer-tab-empty-msg"><p>{matrixError}</p></div>}
            {analyticalViewMode === 'grid' ? (
              <RoleMiningMatrix
                loading={matrixLoading}
                entitlements={campaignMatrix?.entitlements || []}
                members={campaignMatrix?.members || []}
                cells={campaignMatrix?.cells || []}
                roles={campaignMatrix?.roles || []}
                emptyMessage="No candidate roles with mined entitlements/members yet - run mining first."
              />
            ) : (
              <RoleAnalyticalCharts
                loading={matrixLoading}
                mode={analyticalViewMode}
                entitlements={campaignMatrix?.entitlements || []}
                members={campaignMatrix?.members || []}
                cells={campaignMatrix?.cells || []}
                emptyMessage="No candidate roles with mined entitlements/members yet - run mining first."
              />
            )}
          </div>
        )}

        {/* Candidate Role detail drawer */}
        {selectedRoleDetail && (
          <div className="modal-overlay-custom" onClick={() => setSelectedRoleDetail(null)}>
            <div className="modal-content-custom" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-custom">
                <h3>{selectedRoleDetail.role_name}</h3>
                <button className="modal-close-btn-custom" onClick={() => setSelectedRoleDetail(null)}><X size={18} /></button>
              </div>
              <div className="modal-scrollable-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                  {selectedRoleDetail.job_function} &middot; {selectedRoleDetail.member_count} member(s) &middot; {selectedRoleDetail.confidence_score}% confidence
                </p>
                <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>Entitlements</h4>
                <table className="detail-inner-table" style={{ marginBottom: '20px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Entitlement</th>
                      <th style={{ textAlign: 'center' }}>Member Coverage</th>
                      <th style={{ textAlign: 'center' }}>Core</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRoleDetail.entitlements.map((e, i) => (
                      <tr key={i}>
                        <td>{e.entitlement_name}</td>
                        <td style={{ textAlign: 'center' }}>{e.member_coverage_pct}%</td>
                        <td style={{ textAlign: 'center' }}>{e.is_core ? <CheckCircle2 size={14} color="var(--success, #10b981)" /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>Members</h4>
                <table className="detail-inner-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Account</th>
                      <th style={{ textAlign: 'left' }}>Application</th>
                      <th style={{ textAlign: 'center' }}>Similarity to Core</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRoleDetail.members.map((m, i) => (
                      <tr key={i}>
                        <td>{m.account_name || m.account_id}</td>
                        <td>{m.application_name}</td>
                        <td style={{ textAlign: 'center' }}>{m.similarity_score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Compare modal */}
        {showCompareModal && compareResult && (
          <div className="modal-overlay-custom" onClick={() => setShowCompareModal(false)}>
            <div className="modal-content-custom" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-custom">
                <h3>Role Comparison</h3>
                <button className="modal-close-btn-custom" onClick={() => setShowCompareModal(false)}><X size={18} /></button>
              </div>
              <div className="modal-scrollable-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                  {compareResult.shared_entitlement_count} entitlement(s) shared across all selected roles.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${compareResult.roles.length}, 1fr)`, gap: '16px' }}>
                  {compareResult.roles.map((r) => (
                    <div key={r.id} className="detail-section-card" style={{ padding: '14px' }}>
                      <h4 style={{ fontSize: '13px', marginBottom: '4px' }}>{r.role_name}</h4>
                      <p className="text-muted" style={{ fontSize: '12px', marginBottom: '10px' }}>
                        {r.job_function} &middot; {r.member_count} members &middot; {r.confidence_score}% confidence
                      </p>
                      <p style={{ fontSize: '12.5px', fontWeight: '600', marginBottom: '4px' }}>
                        Unique to this role ({r.unique_to_this_role.length}):
                      </p>
                      <ul style={{ fontSize: '12px', paddingLeft: '18px', margin: 0 }}>
                        {r.unique_to_this_role.length === 0
                          ? <li className="text-muted">None — fully overlaps with the others</li>
                          : r.unique_to_this_role.map((name, i) => <li key={i}>{name}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                {compareResult.shared_entitlement_count > 0 && (
                  <>
                    <p style={{ fontSize: '12.5px', fontWeight: '600', margin: '16px 0 4px' }}>Shared by all:</p>
                    <ul style={{ fontSize: '12px', paddingLeft: '18px', margin: 0 }}>
                      {compareResult.roles[0].shared_with_all.map((name, i) => <li key={i}>{name}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =================================================================
  // LIST VIEW
  // =================================================================
  return (
    <div className="connector-workspace-page">
      <Breadcrumb items={[{ label: 'Role Discovery', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Role Discovery</h2>
          <p>Analyzes correlated identity and application access data to surface discovered role candidates for refinement in Role Engineering.</p>
        </div>
        <div className="header-buttons-section">
          {canCreate('Role Discovery') && (
            <button className="btn-add-connector" onClick={handleOpenAddModal}>
              <Plus size={14} />
              <span>New Mining Campaign</span>
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Total Campaigns" value={kpiStats.total} icon={Target} color="blue" loading={loading} />
        <DashboardCard title="Completed" value={kpiStats.completed} icon={CheckCircle2} color="green" loading={loading} />
        <DashboardCard title="Candidate Roles Found" value={kpiStats.totalRoles} icon={Layers} color="indigo" loading={loading} />
        <DashboardCard title="Avg. Coverage" value={`${kpiStats.avgCoverage}%`} icon={PieChart} color="yellow" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        <div className="table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th style={{ textAlign: 'left' }}>Campaign</th>
                <th style={{ textAlign: 'left' }}>Scope</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Candidate Roles</th>
                <th style={{ textAlign: 'center' }}>Coverage</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7">
                    <div className="table-loading-container">
                      <div className="spinner-element"></div>
                      <p>Loading mining campaigns...</p>
                    </div>
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="table-empty-container">
                      <Target size={36} className="text-muted" />
                      <div className="empty-state-text">
                        <h4>No Mining Campaigns Yet</h4>
                        <p>Click "New Mining Campaign" to scope and run your first role discovery.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                campaigns
                  .slice((campaignPage - 1) * CAMPAIGNS_PER_PAGE, campaignPage * CAMPAIGNS_PER_PAGE)
                  .map((c, idx) => (
                  <tr key={c.id} className="row-clickable" onClick={() => handleOpenDetail(c)}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{(campaignPage - 1) * CAMPAIGNS_PER_PAGE + idx + 1}</td>
                    <td className="connector-name-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Target size={16} className="type-icon" />
                        <span className="font-semibold text-main">{c.campaign_name}</span>
                      </div>
                    </td>
                    <td>{c.scope_type === 'Application' ? 'Single Application' : 'All Correlated Accounts'}</td>
                    <td style={{ textAlign: 'center' }}>{renderStatusBadge(c.status)}</td>
                    <td style={{ textAlign: 'center' }}>{c.total_candidate_roles}</td>
                    <td style={{ textAlign: 'center' }}>{c.coverage_percentage}%</td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div className="actions-cell-menu">
                        {canEdit('Role Discovery') && (
                          <button
                            className="btn-row-action"
                            title="Run Mining"
                            onClick={(e) => handleRunCampaign(c, e)}
                            disabled={runningCampaignId === c.id}
                          >
                            <RotateCcw size={14} className={runningCampaignId === c.id ? 'spinner-icon' : ''} />
                          </button>
                        )}
                        {canDelete('Role Discovery') && (
                          <button className="btn-row-action delete" title="Delete" onClick={(e) => handleOpenDeleteConfirm(c, e)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {campaigns.length > 0 && (() => {
          const totalPages = Math.ceil(campaigns.length / CAMPAIGNS_PER_PAGE);
          const startIdx = (campaignPage - 1) * CAMPAIGNS_PER_PAGE;
          const endIdx = Math.min(startIdx + CAMPAIGNS_PER_PAGE, campaigns.length);
          return (
            <div className="table-pagination-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 24px' }}>
              <div className="pagination-info">
                Showing <b>{startIdx + 1}</b> to <b>{endIdx}</b> of <b>{campaigns.length}</b> campaigns
              </div>
              {totalPages > 1 && (
                <div className="pagination-buttons">
                  <button className="btn-page-nav" disabled={campaignPage === 1} onClick={() => setCampaignPage(campaignPage - 1)}>
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                    <button key={pNum} className={`btn-page-number ${campaignPage === pNum ? 'active' : ''}`} onClick={() => setCampaignPage(pNum)}>
                      {pNum}
                    </button>
                  ))}
                  <button className="btn-page-nav" disabled={campaignPage === totalPages} onClick={() => setCampaignPage(campaignPage + 1)}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Add Campaign Modal */}
      {showFormModal && (
        <div className="modal-overlay-custom" onClick={() => setShowFormModal(false)}>
          <div className="modal-content-custom" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-custom">
              <h3>New Mining Campaign</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowFormModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="modal-scrollable-body">
                {formError && <div className="error-banner" style={{ marginBottom: '12px' }}>{formError}</div>}
                <div className="input-group-custom">
                  <label>Campaign Name *</label>
                  <input type="text" name="campaign_name" value={formData.campaign_name} onChange={handleFormChange} required placeholder="e.g. Q3 Finance Role Mining" />
                </div>
                <div className="input-group-custom">
                  <label>Description</label>
                  <textarea name="description" value={formData.description} onChange={handleFormChange} rows={2} placeholder="Optional notes about this campaign" />
                </div>
                <div className="input-group-custom">
                  <label>Scope</label>
                  <select name="scope_type" value={formData.scope_type} onChange={handleFormChange}>
                    <option value="All">All correlated accounts (every application)</option>
                    <option value="Application">Single application</option>
                  </select>
                </div>
                {formData.scope_type === 'Application' && (
                  <div className="input-group-custom">
                    <label>Application *</label>
                    <select name="application_id" value={formData.application_id} onChange={handleFormChange} required>
                      <option value="">Select an application...</option>
                      {applications.map((app) => (
                        <option key={app.id} value={app.id}>{app.application_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="input-group-custom" style={{ flex: 1 }}>
                    <label>Similarity Threshold (eps)</label>
                    <input type="number" name="eps" min="0.05" max="0.9" step="0.05" value={formData.eps} onChange={handleFormChange} />
                    <span className="text-muted" style={{ fontSize: '11px' }}>Lower = stricter match required. Default 0.4.</span>
                  </div>
                  <div className="input-group-custom" style={{ flex: 1 }}>
                    <label>Minimum Cluster Size</label>
                    <input type="number" name="min_samples" min="2" step="1" value={formData.min_samples} onChange={handleFormChange} />
                    <span className="text-muted" style={{ fontSize: '11px' }}>Smallest group of people to count as a role. Default 2.</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowFormModal(false)} disabled={formSubmitting}>Cancel</button>
                <button type="submit" className="btn-modal-submit" disabled={formSubmitting}>
                  {formSubmitting ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Delete Mining Campaign?</h4>
                <p>
                  Are you sure you want to delete <b>{campaignToDelete?.campaign_name}</b>?
                  This removes the campaign and every candidate role it discovered.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" type="button" disabled={deleteSubmitting} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-modal-delete" type="button" disabled={deleteSubmitting} onClick={handleDeleteSubmit}>
                {deleteSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default RoleDiscoveryWorkspace;
