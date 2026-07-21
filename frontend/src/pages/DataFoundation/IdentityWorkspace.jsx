import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Users, UserCheck, UserX, Building2, ChevronLeft, ChevronRight,
  ArrowLeft, Clock, Link2, History, Eye, RotateCcw,
  Info, CheckCircle2, AlertCircle, XCircle, User, Shield,
  Plus, Edit, Trash2, X, UploadCloud, AlertTriangle
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import CorrelationWorkspace from './CorrelationWorkspace';
import { ToastContainer, showToast } from '../../components/Toast/Toast';
import {
  getIdentities,
  getIdentityStats,
  getIdentityFilterMeta,
  getIdentity,
  getIdentityAccounts,
  getIdentityTimeline,
  getIdentityEntitlements,
  createIdentity,
  updateIdentity,
  deleteIdentity,
  bulkUploadIdentities,
  resetBulkUploadIdentities,
  bulkDeleteIdentities,
  runAutoCorrelation,
  manualLinkAccount,
  manualUnlinkAccount,
  getUnlinkedAccounts
} from '../../services/identityService';
import { canCreate, canEdit, canDelete } from '../../utils/permissions';
import './IdentityWorkspace.css';

const IdentityWorkspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState(
    location.pathname.includes('correlation') ? 'correlation' : 'identity'
  );

  useEffect(() => {
    setMainTab(location.pathname.includes('correlation') ? 'correlation' : 'identity');
  }, [location.pathname]);

  const [view, setView] = useState('list');

  // List state
  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [filterMeta, setFilterMeta] = useState({ departments: [], statuses: [] });
  const [kpiStats, setKpiStats] = useState({ total: 0, active: 0, inactive: 0, departments: 0 });

  // Detail state
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const [detailTab, setDetailTab] = useState('profile');
  const [detailLoading, setDetailLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [correlationNote, setCorrelationNote] = useState(null);
  
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [unlinkedAccounts, setUnlinkedAccounts] = useState([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [runningAutoCorrelation, setRunningAutoCorrelation] = useState(false);

  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [entitlements, setEntitlements] = useState([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsNote, setEntitlementsNote] = useState(null);

  // Add / Edit Identity modal state
  const INITIAL_IDENTITY_FORM = {
    employee_id: '', first_name: '', last_name: '', email: '',
    department: '', job_title: '', manager: '', status: 'Active'
  };
  const [showFormModal, setShowFormModal] = useState(false);
  const [editIdentityId, setEditIdentityId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_IDENTITY_FORM);
  const [formBannerError, setFormBannerError] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Unlink confirm modal
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkAccountId, setUnlinkAccountId] = useState(null);
  const [unlinkSubmitting, setUnlinkSubmitting] = useState(false);

  // Bulk Upload modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState(null);

  // Delete confirm modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [identityToDelete, setIdentityToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Reset Bulk Upload confirm modal state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Bulk multi-select delete state
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);

  const fetchIdentitiesList = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const params = {
        page, limit,
        search: search.trim() || undefined,
        department: filterDepartment || undefined,
        status: filterStatus || undefined,
        sortBy, sortOrder
      };
      const data = await getIdentities(params);
      setIdentities(data.identities || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch (err) {
      console.error('Failed to load identities:', err);
      setErrorMsg('Failed to load identities. Please verify backend connection.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filterDepartment, filterStatus, sortBy, sortOrder]);

  const fetchFilterMeta = useCallback(async () => {
    try {
      const data = await getIdentityFilterMeta();
      setFilterMeta({ departments: data.departments || [], statuses: data.statuses || [] });
    } catch (err) {
      console.error('Failed to load filter metadata:', err);
    }
  }, []);

  const fetchKPIStats = useCallback(async () => {
    try {
      const stats = await getIdentityStats();
      setKpiStats({
        total: stats.total || 0,
        active: stats.active || 0,
        inactive: stats.inactive || 0,
        departments: stats.departments || 0
      });
    } catch (err) {
      console.error('Failed to calculate identity KPIs:', err);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') {
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
    }
  }, [fetchIdentitiesList, fetchFilterMeta, fetchKPIStats, view]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterDepartment('');
    setFilterStatus('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleOpenDetail = async (identity) => {
    setSelectedIdentity(identity);
    setDetailTab('profile');
    setView('detail');
    setAccounts([]);
    setCorrelationNote(null);
    setTimelineEvents([]);
    setEntitlements([]);
    setEntitlementsNote(null);
    try {
      setDetailLoading(true);
      const fresh = await getIdentity(identity.id);
      setSelectedIdentity(fresh);
    } catch (err) {
      console.error('Failed to load identity detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedIdentity(null);
    fetchIdentitiesList();
    fetchKPIStats();
  };

  const fetchAccounts = useCallback(async () => {
    if (!selectedIdentity) return;
    try {
      setAccountsLoading(true);
      const res = await getIdentityAccounts(selectedIdentity.id);
      setAccounts(res.accounts || []);
      setCorrelationNote(res.correlation_note || null);
    } catch (err) {
      console.error('Failed to load correlated accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  }, [selectedIdentity]);

  const handleRunAutoCorrelation = async () => {
    try {
      setRunningAutoCorrelation(true);
      const res = await runAutoCorrelation();
      showToast(res.message || 'Auto-correlation complete!', 'success');
      if (view === 'detail') {
        fetchAccounts();
      } else {
        fetchIdentities();
      }
    } catch (err) {
      console.error('Auto-correlation failed:', err);
      showToast('Auto-correlation failed.', 'error');
    } finally {
      setRunningAutoCorrelation(false);
    }
  };

  const handleOpenLinkModal = () => {
    setLinkSearch('');
    setUnlinkedAccounts([]);
    setShowLinkModal(true);
    fetchUnlinkedAccounts('');
  };

  const handleLinkSearchChange = (e) => {
    const val = e.target.value;
    setLinkSearch(val);
    fetchUnlinkedAccounts(val.trim());
  };

  const fetchUnlinkedAccounts = async (searchVal) => {
    try {
      setUnlinkedLoading(true);
      const res = await getUnlinkedAccounts(searchVal);
      setUnlinkedAccounts(res.accounts || []);
    } catch (err) {
      console.error('Failed to search unlinked accounts:', err);
    } finally {
      setUnlinkedLoading(false);
    }
  };

  const handleLinkAccount = async (accountId) => {
    try {
      setLinkSubmitting(true);
      await manualLinkAccount(accountId, selectedIdentity.id);
      setShowLinkModal(false);
      fetchAccounts();
      showToast('Account linked successfully.', 'success');
    } catch (err) {
      console.error('Failed to link account:', err);
      showToast('Failed to link account.', 'error');
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleOpenUnlinkConfirm = (accountId) => {
    setUnlinkAccountId(accountId);
    setShowUnlinkConfirm(true);
  };

  const handleUnlinkAccount = async () => {
    if (!unlinkAccountId) return;
    try {
      setUnlinkSubmitting(true);
      await manualUnlinkAccount(unlinkAccountId);
      setShowUnlinkConfirm(false);
      setUnlinkAccountId(null);
      fetchAccounts();
      showToast('Account unlinked successfully.', 'success');
    } catch (err) {
      console.error('Failed to unlink account:', err);
      showToast('Failed to unlink account.', 'error');
    } finally {
      setUnlinkSubmitting(false);
    }
  };

  useEffect(() => {
    if (detailTab === 'accounts' && selectedIdentity) {
      fetchAccounts();
    }
  }, [detailTab, fetchAccounts, selectedIdentity]);

  const fetchEntitlements = useCallback(async () => {
    if (!selectedIdentity) return;
    try {
      setEntitlementsLoading(true);
      const res = await getIdentityEntitlements(selectedIdentity.id);
      setEntitlements(res.entitlements || []);
      setEntitlementsNote(res.correlation_note || null);
    } catch (err) {
      console.error('Failed to load entitlements:', err);
    } finally {
      setEntitlementsLoading(false);
    }
  }, [selectedIdentity]);

  useEffect(() => {
    if (detailTab === 'entitlements' && selectedIdentity) {
      fetchEntitlements();
    }
  }, [detailTab, fetchEntitlements, selectedIdentity]);

  const fetchTimeline = useCallback(async () => {
    if (!selectedIdentity) return;
    try {
      setTimelineLoading(true);
      const res = await getIdentityTimeline(selectedIdentity.id);
      setTimelineEvents(res.events || []);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }, [selectedIdentity]);

  useEffect(() => {
    if (detailTab === 'timeline' && selectedIdentity) {
      fetchTimeline();
    }
  }, [detailTab, fetchTimeline, selectedIdentity]);

  const handleOpenAddModal = () => {
    setEditIdentityId(null);
    setFormData(INITIAL_IDENTITY_FORM);
    setFormBannerError(null);
    setShowFormModal(true);
  };

  const handleOpenEditModal = (identity, e) => {
    if (e) e.stopPropagation();
    setEditIdentityId(identity.id);
    setFormData({
      employee_id: identity.employee_id || '',
      first_name: identity.first_name || '',
      last_name: identity.last_name || '',
      email: identity.email || '',
      department: identity.department || '',
      job_title: identity.job_title || '',
      manager: identity.manager || '',
      status: identity.status || 'Active'
    });
    setFormBannerError(null);
    setShowFormModal(true);
  };

  const handleFormFieldChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitIdentityForm = async () => {
    try {
      setFormSubmitting(true);
      setFormBannerError(null);
      if (editIdentityId) {
        await updateIdentity(editIdentityId, formData);
      } else {
        await createIdentity(formData);
      }
      setShowFormModal(false);
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
    } catch (err) {
      console.error('Failed to save identity:', err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save identity.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleOpenBulkModal = () => {
    setBulkFile(null);
    setBulkResult(null);
    setBulkError(null);
    setShowBulkModal(true);
  };

  const handleBulkFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setBulkFile(file);
  };

  const handleSubmitBulkUpload = async () => {
    if (!bulkFile) return;
    try {
      setBulkSubmitting(true);
      setBulkError(null);
      setBulkResult(null);
      const result = await bulkUploadIdentities(bulkFile);
      setBulkResult(result);
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
    } catch (err) {
      console.error('Bulk upload failed:', err);
      setBulkError(err.response?.data?.detail || 'Bulk upload failed unexpectedly.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleOpenDeleteConfirm = (identity, e) => {
    if (e) e.stopPropagation();
    setIdentityToDelete(identity);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!identityToDelete) return;
    try {
      setDeleteSubmitting(true);
      await deleteIdentity(identityToDelete.id);
      setShowDeleteConfirm(false);
      setIdentityToDelete(null);
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
      showToast('Identity deleted successfully.', 'success');
    } catch (err) {
      console.error('Failed to delete identity:', err);
      showToast(err.response?.data?.detail || 'Failed to delete identity.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleResetBulkUpload = async () => {
    try {
      setResetSubmitting(true);
      const result = await resetBulkUploadIdentities();
      setShowResetConfirm(false);
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
      showToast(
        result.deleted > 0
          ? `Removed ${result.deleted} bulk-uploaded identit${result.deleted === 1 ? 'y' : 'ies'}. Connector-imported and manually created identities were not affected.`
          : 'No bulk-uploaded identities were found — nothing to reset.',
        result.deleted > 0 ? 'success' : 'info'
      );
    } catch (err) {
      console.error('Failed to reset bulk-uploaded identities:', err);
      showToast(err.response?.data?.detail || 'Failed to reset bulk-uploaded identities.', 'error');
    } finally {
      setResetSubmitting(false);
    }
  };

  // ---------------------------------------------------------------
  // Bulk multi-select delete
  // ---------------------------------------------------------------
  const toggleSelectRow = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = identities.map((i) => i.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => allSelected
      ? prev.filter((id) => !pageIds.includes(id))
      : [...new Set([...prev, ...pageIds])]);
  };

  const handleBulkDeleteSubmit = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkDeleteSubmitting(true);
      const result = await bulkDeleteIdentities(selectedIds);
      setShowBulkDeleteConfirm(false);
      setSelectedIds([]);
      fetchIdentitiesList();
      fetchFilterMeta();
      fetchKPIStats();
      showToast(`Deleted ${result.deleted} identit${result.deleted === 1 ? 'y' : 'ies'}.`, 'success');
    } catch (err) {
      console.error('Failed to bulk delete identities:', err);
      showToast(err.response?.data?.detail || 'Failed to delete selected identities.', 'error');
    } finally {
      setBulkDeleteSubmitting(false);
    }
  };


  const renderStatusBadge = (status) => {
    switch (status) {
      case 'Active':
        return <span className="status-badge connected"><CheckCircle2 size={12} /> Active</span>;
      case 'Terminated':
        return <span className="status-badge failed"><XCircle size={12} /> Terminated</span>;
      case 'Inactive':
        return <span className="status-badge disabled"><AlertCircle size={12} /> Inactive</span>;
      default:
        return <span className="status-badge draft"><Info size={12} /> {status || 'Unknown'}</span>;
    }
  };

  const displayName = (i) => i.display_name || `${i.first_name || ''} ${i.last_name || ''}`.trim() || i.email || `Identity #${i.id}`;

  if (view === 'detail') {
    return (
      <div className="connector-workspace-page">
        <Breadcrumb
          items={[
            { label: 'Data Foundation', active: false },
            { label: 'Identity Repository', active: false, onClick: handleBackToList },
            { label: selectedIdentity ? displayName(selectedIdentity) : 'Loading...', active: true }
          ]}
        />

        <button className="detail-back-btn" onClick={handleBackToList}>
          <ArrowLeft size={14} />
          Back to Identity Repository
        </button>

        {selectedIdentity && (
          <>
            <div className="page-header-actions" style={{ marginTop: '16px' }}>
              <div className="header-title-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <User size={18} />
                  <h2 style={{ margin: 0 }}>{displayName(selectedIdentity)}</h2>
                  {renderStatusBadge(selectedIdentity.status)}
                </div>
                <p>{selectedIdentity.job_title || 'No job title on file'} {selectedIdentity.department ? `· ${selectedIdentity.department}` : ''}</p>
              </div>
            </div>

            <div className="drawer-tabs-navigation" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <button className={`drawer-tab-btn ${detailTab === 'profile' ? 'active' : ''}`} onClick={() => setDetailTab('profile')}>
                <Info size={13} /> Profile
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'accounts' ? 'active' : ''}`} onClick={() => setDetailTab('accounts')}>
                <Link2 size={13} /> Accounts ({accounts.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'entitlements' ? 'active' : ''}`} onClick={() => setDetailTab('entitlements')}>
                <Shield size={13} /> Entitlements ({entitlements.length})
              </button>
              <button className={`drawer-tab-btn ${detailTab === 'timeline' ? 'active' : ''}`} onClick={() => setDetailTab('timeline')}>
                <History size={13} /> Timeline
              </button>
            </div>

            <div className="detail-section-card">
              <div className="detail-section-body">
                {detailLoading ? (
                  <div className="drawer-loading-box">
                    <div className="spinner-element"></div>
                    <p>Loading identity...</p>
                  </div>
                ) : (
                  <div className="drawer-tab-pane-container">
                    {detailTab === 'profile' && (
                      <div className="drawer-tab-info-pane">
                        <div className="info-summary-group">
                          <h5>Identity Attributes</h5>
                          <div className="info-summary-grid">
                            <div className="summary-item"><label>Employee ID</label><span>{selectedIdentity.employee_id || '—'}</span></div>
                            <div className="summary-item"><label>First Name</label><span>{selectedIdentity.first_name || '—'}</span></div>
                            <div className="summary-item"><label>Last Name</label><span>{selectedIdentity.last_name || '—'}</span></div>
                            <div className="summary-item"><label>Email</label><span>{selectedIdentity.email || '—'}</span></div>
                            <div className="summary-item"><label>Department</label><span>{selectedIdentity.department || '—'}</span></div>
                            <div className="summary-item"><label>Job Title</label><span>{selectedIdentity.job_title || '—'}</span></div>
                            <div className="summary-item"><label>Manager</label><span>{selectedIdentity.manager || '—'}</span></div>
                            <div className="summary-item"><label>Status</label><span>{renderStatusBadge(selectedIdentity.status)}</span></div>
                          </div>
                        </div>

                        <div className="info-summary-group">
                          <h5>Source &amp; Import Info</h5>
                          <div className="info-summary-grid">
                            <div className="summary-item"><label>Source Connector</label><span>{selectedIdentity.source_connector_name || '—'}</span></div>
                            <div className="summary-item"><label>Imported At</label><span>{selectedIdentity.imported_at ? new Date(selectedIdentity.imported_at).toLocaleString() : '—'}</span></div>
                            <div className="summary-item"><label>Created At</label><span>{new Date(selectedIdentity.created_at).toLocaleString()}</span></div>
                            <div className="summary-item"><label>Last Updated</label><span>{new Date(selectedIdentity.updated_at).toLocaleString()}</span></div>
                          </div>
                        </div>

                        {selectedIdentity.attributes && Object.keys(selectedIdentity.attributes).length > 0 && (
                          <div className="info-summary-group">
                            <h5>All Imported Fields (Raw)</h5>
                            <div className="info-summary-grid">
                              {Object.entries(selectedIdentity.attributes).map(([k, v]) => (
                                <div className="summary-item" key={k}><label>{k}</label><span>{String(v ?? '—')}</span></div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === 'accounts' && (
                      <div className="drawer-tab-info-pane">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <h5>Correlated Application Accounts</h5>
                            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                              Accounts mapped automatically or manually linked to this identity.
                            </p>
                          </div>
                          {canEdit('Identity Repository') && (
                            <button 
                              className="btn-add-connector" 
                              onClick={handleOpenLinkModal}
                              style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Link2 size={13} /> Link Account
                            </button>
                          )}
                        </div>

                        {correlationNote && (
                          <div className="error-banner" style={{ marginBottom: '12px' }}>{correlationNote}</div>
                        )}

                        {accountsLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading correlated accounts...</p>
                          </div>
                        ) : accounts.length === 0 && !correlationNote ? (
                          <div className="drawer-tab-empty-msg">
                            <Link2 size={24} className="text-muted" />
                            <p>No correlated accounts found. This identity's email does not match any imported application account yet.</p>
                          </div>
                        ) : accounts.length > 0 ? (
                          <table className="detail-inner-table">
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Application</th>
                                <th style={{ textAlign: 'left' }}>Account ID</th>
                                <th style={{ textAlign: 'left' }}>Account Name</th>
                                <th style={{ textAlign: 'left' }}>Correlation</th>
                                <th style={{ textAlign: 'left' }}>Status</th>
                                <th style={{ textAlign: 'left' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accounts.map((a) => (
                                <tr key={a.id}>
                                  <td style={{ fontWeight: '600' }}>{a.application_name}</td>
                                  <td>{a.account_id}</td>
                                  <td>{a.account_name || '—'}</td>
                                  <td>
                                    {a.correlation_method === 'Manual' ? (
                                      <span className="status-badge connected" style={{ fontSize: '11px', padding: '2px 6px' }}>
                                        Manual (100%)
                                      </span>
                                    ) : a.correlation_method === 'Automatic' ? (
                                      <span className={`status-badge ${a.correlation_status === 'Needs Review' ? 'disabled' : 'connected'}`} style={{ fontSize: '11px', padding: '2px 6px' }}>
                                        Auto ({a.correlation_confidence}%)
                                      </span>
                                    ) : (
                                      <span className="status-badge draft" style={{ fontSize: '11px', padding: '2px 6px' }}>
                                        Uncorrelated
                                      </span>
                                    )}
                                  </td>
                                  <td>{a.status}</td>
                                  <td>
                                    {canEdit('Identity Repository') && (
                                      <button 
                                        className="btn-row-action delete" 
                                        title="Unlink account" 
                                        onClick={() => handleOpenUnlinkConfirm(a.id)}
                                        style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                                      >
                                        <Link2 size={11} /> Unlink
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                      </div>
                    )}

                    {detailTab === 'entitlements' && (
                      <div className="drawer-tab-info-pane">
                        <h5>Correlated Entitlements</h5>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                          Entitlements held by this identity's correlated accounts, linked during Account import.
                        </p>

                        {entitlementsNote && (
                          <div className="error-banner" style={{ marginBottom: '12px' }}>{entitlementsNote}</div>
                        )}

                        {entitlementsLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading entitlements...</p>
                          </div>
                        ) : entitlements.length === 0 && !entitlementsNote ? (
                          <div className="drawer-tab-empty-msg">
                            <Shield size={24} className="text-muted" />
                            <p>No entitlements found for this identity yet.</p>
                          </div>
                        ) : entitlements.length > 0 ? (
                          <table className="detail-inner-table">
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left' }}>Application</th>
                                <th style={{ textAlign: 'left' }}>Entitlement</th>
                                <th style={{ textAlign: 'left' }}>Type</th>
                                <th style={{ textAlign: 'left' }}>Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entitlements.map((e, idx) => (
                                <tr key={idx}>
                                  <td style={{ fontWeight: '600' }}>{e.application_name || '—'}</td>
                                  <td>
                                    {e.entitlement_name}
                                    {!e.matched && (
                                      <span className="status-badge disabled" style={{ marginLeft: '8px' }}>Unmatched</span>
                                    )}
                                  </td>
                                  <td>{e.entitlement_type || '—'}</td>
                                  <td className="text-muted">{e.description || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null}
                      </div>
                    )}

                    {detailTab === 'timeline' && (
                      <div className="drawer-tab-logs-pane">
                        <h5>Identity Timeline</h5>
                        {timelineLoading ? (
                          <div className="drawer-loading-box">
                            <div className="spinner-element"></div>
                            <p>Loading timeline...</p>
                          </div>
                        ) : timelineEvents.length === 0 ? (
                          <div className="drawer-tab-empty-msg">
                            <Clock size={24} className="text-muted" />
                            <p>No timeline events recorded yet.</p>
                          </div>
                        ) : (
                          <div className="drawer-history-records-list">
                            {timelineEvents.map((ev, idx) => (
                              <div key={idx} className="history-record-card audit-card">
                                <div className="audit-card-header">
                                  <Clock size={13} className="text-muted" />
                                  <span className="audit-user-text font-semibold">{ev.event}</span>
                                </div>
                                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '6px 0' }}>{ev.details}</p>
                                <span className="audit-time-text">{ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="connector-workspace-page">
      <Breadcrumb
        items={[
          { label: 'Data Foundation', active: false },
          { label: 'Identity Repository', active: true }
        ]}
      />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Identity Repository</h2>
          <p>
            {mainTab === 'identity' 
              ? 'Every identity imported through connectors, created manually, or bulk uploaded, correlated against Application accounts by email.' 
              : 'Configure dynamic matching rules, evaluate credentials automatically, and review unmatched account recommendations.'
            }
          </p>
        </div>
        {mainTab === 'identity' && (
          <div className="header-buttons-section">
            {canDelete('Identity Repository') && selectedIds.length > 0 && (
              <button
                className="btn-browse-file"
                onClick={() => setShowBulkDeleteConfirm(true)}
                style={{ padding: '10px 16px', fontSize: '12.5px', border: '1px solid var(--failed, #ef4444)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)', color: 'var(--failed, #ef4444)', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Trash2 size={14} />
                <span>Delete Selected ({selectedIds.length})</span>
              </button>
            )}
            {canDelete('Identity Repository') && (
              <button
                className="btn-browse-file"
                onClick={() => setShowResetConfirm(true)}
                title="Remove identities added via Bulk Upload, leaving connector-imported and manually created identities untouched"
                style={{ padding: '10px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <RotateCcw size={14} />
                <span>Reset Bulk Upload</span>
              </button>
            )}
            {canEdit('Identity Repository') && (
              <button
                className="btn-browse-file"
                onClick={handleRunAutoCorrelation}
                disabled={runningAutoCorrelation || loading}
                style={{ padding: '10px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <RotateCcw size={14} className={runningAutoCorrelation ? 'spinner-icon' : ''} />
                <span>{runningAutoCorrelation ? 'Correlating...' : 'Auto-Correlate'}</span>
              </button>
            )}
            {canCreate('Identity Repository') && (
              <>
                <button
                  className="btn-browse-file"
                  onClick={handleOpenBulkModal}
                  style={{ padding: '10px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <UploadCloud size={14} />
                  <span>Bulk Upload</span>
                </button>
                <button className="btn-add-connector" onClick={handleOpenAddModal}>
                  <Plus size={14} />
                  <span>Add Identity</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="controls-card" style={{ display: 'flex', gap: '8px', padding: '4px', marginBottom: '16px' }}>
        <button
          className={`drawer-tab-btn ${mainTab === 'identity' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('identity');
            navigate('/data-foundation/identities');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Users size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Identity Workspace
        </button>
        <button
          className={`drawer-tab-btn ${mainTab === 'correlation' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('correlation');
            navigate('/data-foundation/correlation');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Link2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Correlation Workspace
        </button>
      </div>

      {mainTab === 'identity' ? (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <DashboardCard title="Total Identities" value={kpiStats.total} icon={Users} color="blue" loading={loading} />
        <DashboardCard title="Active" value={kpiStats.active} icon={UserCheck} color="green" loading={loading} />
        <DashboardCard title="Inactive / Other" value={kpiStats.inactive} icon={UserX} color="yellow" loading={loading} />
        <DashboardCard title="Departments" value={kpiStats.departments} icon={Building2} color="indigo" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input type="text" className="search-field" value={search} onChange={handleSearchChange} placeholder="Search by name, email, or employee ID..." />
        </div>

        <div className="filter-dropdowns">
          <select className="filter-dropdown" value={filterDepartment} onChange={(e) => { setFilterDepartment(e.target.value); setPage(1); }}>
            <option value="">All Departments</option>
            {filterMeta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="filter-dropdown" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {filterMeta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {(search || filterDepartment || filterStatus) && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reset Filters
          </button>
        )}
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        <div className="table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                {canDelete('Identity Repository') && (
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={identities.length > 0 && identities.every((i) => selectedIds.includes(i.id))}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                )}
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('display_name')}>
                  Name {sortBy === 'display_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('employee_id')}>
                  Employee ID {sortBy === 'employee_id' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('email')}>
                  Email {sortBy === 'email' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('department')}>
                  Department {sortBy === 'department' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                  Status {sortBy === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                </th>
                <th>Source</th>
                <th style={{ textAlign: 'right', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9">
                    <div className="table-loading-container">
                      <div className="spinner-element"></div>
                      <p>Loading identities...</p>
                    </div>
                  </td>
                </tr>
              ) : identities.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="table-empty-container">
                      <Users size={36} className="text-muted" />
                      <div className="empty-state-text">
                        <h4>No Identities Found</h4>
                        <p>No identities match current filters. Import identities from a connector in Data Sources first.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                identities.map((i, idx) => (
                  <tr key={i.id} className="row-clickable" onClick={() => handleOpenDetail(i)}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {(page - 1) * limit + idx + 1}
                    </td>
                    {canDelete('Identity Repository') && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(i.id)}
                          onChange={(e) => toggleSelectRow(i.id, e)}
                        />
                      </td>
                    )}
                    <td className="connector-name-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={16} className="type-icon" />
                        <span className="font-semibold text-main">{displayName(i)}</span>
                      </div>
                    </td>
                    <td>{i.employee_id || '—'}</td>
                    <td>{i.email || '—'}</td>
                    <td>{i.department || '—'}</td>
                    <td>{renderStatusBadge(i.status)}</td>
                    <td>{i.source_connector_name || '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="actions-cell-menu">
                        <button className="btn-row-action" title="View profile" onClick={() => handleOpenDetail(i)}>
                          <Eye size={13} />
                        </button>
                        {canEdit('Identity Repository') && (
                          <button className="btn-row-action" title="Edit identity" onClick={(e) => handleOpenEditModal(i, e)}>
                            <Edit size={13} />
                          </button>
                        )}
                        {canDelete('Identity Repository') && (
                          <button className="btn-row-action delete" title="Delete identity" onClick={(e) => handleOpenDeleteConfirm(i, e)}>
                            <Trash2 size={13} />
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

        {totalCount > 0 && (
          <div className="table-pagination-footer">
            <div className="pagination-info">
              Showing <b>{totalCount === 0 ? 0 : (page - 1) * limit + 1}</b> to <b>{Math.min(totalCount, page * limit)}</b> of <b>{totalCount}</b> identities
            </div>
            {totalPages > 1 && (
              <div className="pagination-buttons">
                <button className="btn-page-nav" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                  <button key={pNum} className={`btn-page-number ${page === pNum ? 'active' : ''}`} onClick={() => setPage(pNum)}>
                    {pNum}
                  </button>
                ))}
                <button className="btn-page-nav" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showFormModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom connector-wizard-content">
            <div className="modal-header-custom">
              <h3>{editIdentityId ? 'Edit Identity' : 'Add Identity'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowFormModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-form-custom">
              <div className="modal-scrollable-body wizard-body-section">
                {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}
                <div className="wizard-details-form">
                  <div className="form-row-2col">
                    <div className="input-group-custom">
                      <label>Employee ID</label>
                      <input type="text" name="employee_id" value={formData.employee_id} onChange={handleFormFieldChange} placeholder="e.g. E1006" />
                    </div>
                    <div className="input-group-custom">
                      <label>Status</label>
                      <select name="status" value={formData.status} onChange={handleFormFieldChange}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Terminated">Terminated</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row-2col">
                    <div className="input-group-custom">
                      <label>First Name</label>
                      <input type="text" name="first_name" value={formData.first_name} onChange={handleFormFieldChange} placeholder="e.g. Priya" />
                    </div>
                    <div className="input-group-custom">
                      <label>Last Name</label>
                      <input type="text" name="last_name" value={formData.last_name} onChange={handleFormFieldChange} placeholder="e.g. Sharma" />
                    </div>
                  </div>
                  <div className="input-group-custom">
                    <label>Email</label>
                    <input type="text" name="email" value={formData.email} onChange={handleFormFieldChange} placeholder="e.g. psharma@testcorp.com" />
                  </div>
                  <div className="form-row-2col">
                    <div className="input-group-custom">
                      <label>Department</label>
                      <input type="text" name="department" value={formData.department} onChange={handleFormFieldChange} placeholder="e.g. Finance" />
                    </div>
                    <div className="input-group-custom">
                      <label>Job Title</label>
                      <input type="text" name="job_title" value={formData.job_title} onChange={handleFormFieldChange} placeholder="e.g. Analyst" />
                    </div>
                  </div>
                  <div className="input-group-custom">
                    <label>Manager</label>
                    <input type="text" name="manager" value={formData.manager} onChange={handleFormFieldChange} placeholder="e.g. John Doe" />
                  </div>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" onClick={() => setShowFormModal(false)}>Cancel</button>
                <button className="btn-modal-submit" type="button" disabled={formSubmitting} onClick={handleSubmitIdentityForm}>
                  {formSubmitting ? 'Saving...' : (editIdentityId ? 'Save Changes' : 'Create Identity')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom connector-wizard-content">
            <div className="modal-header-custom">
              <h3>Bulk Upload Identities</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowBulkModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-form-custom">
              <div className="modal-scrollable-body wizard-body-section">
                <p className="subtitle">
                  Upload a CSV with columns like employee_id, first_name, last_name, email, department, job_title, manager, status.
                  Rows matching an existing identity's email or employee ID will update that record instead of creating a duplicate.
                </p>
                {bulkError && <div className="modal-form-banner-error">{bulkError}</div>}
                <div className="input-group-custom">
                  <label className="required">CSV File</label>
                  <div className="file-drop-area">
                    <UploadCloud className="upload-icon" size={24} />
                    <span style={{ marginBottom: '8px' }}>{bulkFile ? bulkFile.name : 'Select or drop CSV file'}</span>
                    <button type="button" className="btn-browse-file" onClick={(e) => { e.stopPropagation(); document.getElementById('identity-bulk-file-input').click(); }}
                      style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                      Browse Local File
                    </button>
                    <input type="file" id="identity-bulk-file-input" accept=".csv" onChange={handleBulkFileChange} style={{ display: 'none' }} />
                  </div>
                </div>

                {bulkResult && (
                  <div style={{
                    margin: '16px 0 0', padding: '12px 16px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: '500',
                    backgroundColor: 'var(--success-light, #10b98120)', color: 'var(--success, #10b981)',
                    border: '1px solid var(--success, #10b981)'
                  }}>
                    ✓ Processed {bulkResult.total} row(s): {bulkResult.created} created, {bulkResult.updated} updated{bulkResult.errors ? `, ${bulkResult.errors} errors` : ''}.
                  </div>
                )}
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" onClick={() => setShowBulkModal(false)}>Close</button>
                <button className="btn-modal-submit" type="button" disabled={!bulkFile || bulkSubmitting} onClick={handleSubmitBulkUpload}>
                  {bulkSubmitting ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Delete Identity?</h4>
                <p>
                  Are you sure you want to delete <b>{identityToDelete ? displayName(identityToDelete) : ''}</b>?
                  This soft-deletes the identity, but it will no longer show in Identity Repository or account correlation.
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

      {showResetConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Reset Bulk Upload Data?</h4>
                <p>
                  This removes every identity that was added through Bulk Upload in Identity Repository.
                  Identities imported through a connector or created manually will not be affected, and
                  correlated Accounts / Entitlements from Application Workspace and Connector Workspace
                  keep working as normal — they're matched live by email, not stored on the identity.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" type="button" disabled={resetSubmitting} onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="btn-modal-delete" type="button" disabled={resetSubmitting} onClick={handleResetBulkUpload}>
                {resetSubmitting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Delete {selectedIds.length} Identit{selectedIds.length === 1 ? 'y' : 'ies'}?</h4>
                <p>
                  This removes the selected identit{selectedIds.length === 1 ? 'y' : 'ies'} from Identity Repository.
                  Correlated Accounts / Entitlements in Application Workspace and Connector Workspace are not
                  affected — this only deletes the identity record itself.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" type="button" disabled={bulkDeleteSubmitting} onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</button>
              <button className="btn-modal-delete" type="button" disabled={bulkDeleteSubmitting} onClick={handleBulkDeleteSubmit}>
                {bulkDeleteSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showLinkModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom connector-wizard-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header-custom">
              <h3>Link Uncorrelated Account</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowLinkModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-form-custom">
              <div className="modal-scrollable-body wizard-body-section" style={{ minHeight: '300px' }}>
                <p className="subtitle" style={{ marginBottom: '16px' }}>
                  Search and select an uncorrelated application account to link to <b>{selectedIdentity ? displayName(selectedIdentity) : ''}</b>.
                </p>
                <div className="search-input-wrapper" style={{ marginBottom: '16px', width: '100%' }}>
                  <Search size={16} className="text-muted" />
                  <input 
                    type="text" 
                    className="search-field" 
                    value={linkSearch} 
                    onChange={handleLinkSearchChange} 
                    placeholder="Search by Account ID, Name, Email, or Application..." 
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {unlinkedLoading ? (
                  <div className="drawer-loading-box" style={{ padding: '20px 0' }}>
                    <div className="spinner-element"></div>
                    <p>Searching unlinked accounts...</p>
                  </div>
                ) : unlinkedAccounts.length === 0 ? (
                  <div className="drawer-tab-empty-msg" style={{ padding: '20px 0' }}>
                    <Link2 size={24} className="text-muted" />
                    <p>No unlinked accounts found matching "{linkSearch}".</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <table className="detail-inner-table" style={{ margin: 0, width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '8px' }}>Application</th>
                          <th style={{ textAlign: 'left', padding: '8px' }}>Account ID</th>
                          <th style={{ textAlign: 'left', padding: '8px' }}>Name / Email</th>
                          <th style={{ textAlign: 'center', padding: '8px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unlinkedAccounts.map((ua) => (
                          <tr key={ua.id}>
                            <td style={{ padding: '8px', fontWeight: '600' }}>{ua.application_name}</td>
                            <td style={{ padding: '8px' }}>{ua.account_id}</td>
                            <td style={{ padding: '8px', fontSize: '12px' }}>
                              <div>{ua.account_name || '—'}</div>
                              <div className="text-muted">{ua.email || ''}</div>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <button
                                className="btn-add-connector"
                                onClick={() => handleLinkAccount(ua.id)}
                                disabled={linkSubmitting}
                                style={{ padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                Link
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" onClick={() => setShowLinkModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unlink account confirmation modal */}
      {showUnlinkConfirm && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Unlink Account?</h4>
                <p>
                  Are you sure you want to break the correlation link for this account?
                  The account will become uncorrelated.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" type="button" disabled={unlinkSubmitting} onClick={() => setShowUnlinkConfirm(false)}>Cancel</button>
              <button className="btn-modal-delete" type="button" disabled={unlinkSubmitting} onClick={handleUnlinkAccount}>
                {unlinkSubmitting ? 'Unlinking...' : 'Confirm Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      ) : (
        <CorrelationWorkspace hideHeader={true} />
      )}
      <ToastContainer />
    </div>
  );
};

export default IdentityWorkspace;
