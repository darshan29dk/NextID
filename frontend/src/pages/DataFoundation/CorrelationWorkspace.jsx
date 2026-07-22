import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Link2, RotateCcw, CheckCircle2, AlertCircle, XCircle, Info,
  Plus, Edit, Trash2, X, AlertTriangle, Layers, User, Settings, SlidersHorizontal, ShieldAlert
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { apiClient } from '../../services/dashboardService';
import { canEdit } from '../../utils/permissions';
import { ToastContainer, showToast } from '../../components/Toast/Toast';
import '../DataFoundation/IdentityWorkspace.css';

const CorrelationWorkspace = ({ hideHeader }) => {
  const [activeTab, setActiveTab] = useState('queue');

  // Review Queue State
  const [queueItems, setQueueItems] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All'); // "All", "Review", "Uncorrelated"
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [runningAction, setRunningAction] = useState(false);

  // Manual Link State
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [identitiesSearch, setIdentitiesSearch] = useState('');
  const [identitiesList, setIdentitiesList] = useState([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);

  // Rules State
  const [rules, setRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleFormData, setRuleFormData] = useState({
    rule_name: '',
    identity_attribute: 'email',
    account_attribute: 'email',
    match_type: 'Exact',
    confidence_score: 85,
    is_active: true
  });
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  // Fetch Review Queue Items
  const fetchReviewQueue = useCallback(async () => {
    try {
      setLoadingQueue(true);
      const params = {
        page,
        limit,
        filter_type: filterType,
        search: searchQuery.trim() || undefined
      };
      const response = await apiClient.get('/correlation/review-queue', { params });
      setQueueItems(response.data.items || []);
      setTotalCount(response.data.total || 0);
      setTotalPages(response.data.total_pages || 0);
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  }, [page, limit, filterType, searchQuery]);

  // Fetch Correlation Rules
  const fetchRules = useCallback(async () => {
    try {
      setLoadingRules(true);
      const response = await apiClient.get('/correlation/rules');
      setRules(response.data.rules || []);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchReviewQueue();
    } else {
      fetchRules();
    }
  }, [activeTab, fetchReviewQueue, fetchRules]);

  // The "Matching Rules (n)" tab badge reads `rules`, but `rules` was only ever
  // fetched when that tab was actively clicked. Fetch it once on mount too, so the
  // count is accurate immediately instead of showing a stale "(0)" on page load.
  useEffect(() => {
    fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    setPage(1);
    setSelectedAccountIds([]);
  };

  // Checkbox Selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedAccountIds(queueItems.map(item => item.id));
    } else {
      setSelectedAccountIds([]);
    }
  };

  const handleSelectItem = (e, id) => {
    if (e.target.checked) {
      setSelectedAccountIds(prev => [...prev, id]);
    } else {
      setSelectedAccountIds(prev => prev.filter(item => item !== id));
    }
  };

  // Batch Approval
  const handleBatchApprove = async () => {
    if (selectedAccountIds.length === 0) return;
    try {
      setRunningAction(true);
      await apiClient.post('/correlation/review-queue/approve', { account_ids: selectedAccountIds });
      setSelectedAccountIds([]);
      fetchReviewQueue();
      showToast('Approved matching recommendations successfully.', 'success');
    } catch (err) {
      console.error('Batch approval failed:', err);
      showToast('Failed to approve matches.', 'error');
    } finally {
      setRunningAction(false);
    }
  };

  // Batch Rejection
  const handleBatchReject = async () => {
    if (selectedAccountIds.length === 0) return;
    try {
      setRunningAction(true);
      await apiClient.post('/correlation/review-queue/reject', { account_ids: selectedAccountIds });
      setSelectedAccountIds([]);
      fetchReviewQueue();
      showToast('Rejected matching recommendations successfully.', 'success');
    } catch (err) {
      console.error('Batch rejection failed:', err);
      showToast('Failed to reject matches.', 'error');
    } finally {
      setRunningAction(false);
    }
  };

  // Single Action Approvals/Rejections
  const handleSingleApprove = async (accountId) => {
    try {
      setRunningAction(true);
      await apiClient.post('/correlation/review-queue/approve', { account_ids: [accountId] });
      fetchReviewQueue();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setRunningAction(false);
    }
  };

  const handleSingleReject = async (accountId) => {
    try {
      setRunningAction(true);
      await apiClient.post('/correlation/review-queue/reject', { account_ids: [accountId] });
      fetchReviewQueue();
    } catch (err) {
      console.error('Rejection failed:', err);
    } finally {
      setRunningAction(false);
    }
  };

  // Manual Link Logic
  const handleOpenManualModal = (account) => {
    setSelectedAccount(account);
    setIdentitiesSearch('');
    setIdentitiesList([]);
    setShowManualModal(true);
    fetchIdentities('');
  };

  const fetchIdentities = async (searchVal) => {
    try {
      setLoadingIdentities(true);
      const params = { page: 1, limit: 10, search: searchVal || undefined };
      const response = await apiClient.get('/identities', { params });
      setIdentitiesList(response.data.identities || []);
    } catch (err) {
      console.error('Failed to query identities:', err);
    } finally {
      setLoadingIdentities(false);
    }
  };

  const handleIdentitySearchChange = (e) => {
    const val = e.target.value;
    setIdentitiesSearch(val);
    fetchIdentities(val.trim());
  };

  const handleLinkAccount = async (identityId) => {
    if (!selectedAccount) return;
    try {
      setRunningAction(true);
      await apiClient.post('/correlation/link', {
        account_id: selectedAccount.id,
        identity_id: identityId
      });
      setShowManualModal(false);
      fetchReviewQueue();
    } catch (err) {
      console.error('Failed to manually link account:', err);
      showToast('Failed to link account.', 'error');
    } finally {
      setRunningAction(false);
    }
  };

  // Rules Actions
  const handleOpenAddRuleModal = () => {
    setEditingRuleId(null);
    setRuleFormData({
      rule_name: '',
      identity_attribute: 'email',
      account_attribute: 'email',
      match_type: 'Exact',
      confidence_score: 85,
      is_active: true
    });
    setShowRuleModal(true);
  };

  const handleOpenEditRuleModal = (rule) => {
    setEditingRuleId(rule.id);
    setRuleFormData({
      rule_name: rule.rule_name,
      identity_attribute: rule.identity_attribute,
      account_attribute: rule.account_attribute,
      match_type: rule.match_type,
      confidence_score: rule.confidence_score,
      is_active: rule.is_active
    });
    setShowRuleModal(true);
  };

  const handleRuleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRuleFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveRule = async () => {
    if (!ruleFormData.rule_name.trim()) return;
    try {
      setRuleSubmitting(true);
      if (editingRuleId) {
        await apiClient.put(`/correlation/rules/${editingRuleId}`, ruleFormData);
      } else {
        await apiClient.post('/correlation/rules', ruleFormData);
      }
      setShowRuleModal(false);
      fetchRules();
    } catch (err) {
      console.error('Failed to save rule:', err);
      showToast('Failed to save rule.', 'error');
    } finally {
      setRuleSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await apiClient.delete(`/correlation/rules/${ruleId}`);
      fetchRules();
      showToast('Rule deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete rule:', err);
      showToast('Failed to delete rule.', 'error');
    }
  };

  const handleToggleRuleActive = async (rule) => {
    try {
      await apiClient.put(`/correlation/rules/${rule.id}`, {
        ...rule,
        is_active: !rule.is_active
      });
      fetchRules();
    } catch (err) {
      console.error('Failed to toggle rule active state:', err);
    }
  };

  return (
    <div className={hideHeader ? "" : "connector-workspace-page"}>
      {!hideHeader && (
        <>
          <Breadcrumb
            items={[
              { label: 'Data Foundation', active: false },
              { label: 'Correlation Workspace', active: true }
            ]}
          />

          <div className="page-header-actions">
            <div className="header-title-section">
              <h2>Correlation Workspace</h2>
              <p>Configure dynamic matching rules, evaluate credentials automatically, and review unmatched account recommendations.</p>
            </div>
          </div>
        </>
      )}

      <div className="drawer-tabs-navigation" style={{ marginBottom: '16px', display: 'flex', gap: '4px' }}>
        <button className={`drawer-tab-btn ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>
          <ShieldAlert size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Review Queue ({totalCount})
        </button>
        <button className={`drawer-tab-btn ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>
          <SlidersHorizontal size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Matching Rules ({rules.length})
        </button>
      </div>

      {activeTab === 'queue' ? (
        <>
          <div className="controls-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <div className="search-input-wrapper" style={{ flex: 1, maxWidth: '400px' }}>
                <Search size={16} className="text-muted" />
                <input type="text" className="search-field" value={searchQuery} onChange={handleSearchChange} placeholder="Search pending accounts..." />
              </div>
              <div className="filter-dropdowns" style={{ display: 'flex', gap: '4px' }}>
                <button className={`filter-dropdown ${filterType === 'All' ? 'active-filter' : ''}`} onClick={() => handleFilterTypeChange('All')}
                  style={{ padding: '8px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: filterType === 'All' ? 'var(--primary-light)' : 'var(--bg-card)', color: filterType === 'All' ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                  All Pending
                </button>
                <button className={`filter-dropdown ${filterType === 'Review' ? 'active-filter' : ''}`} onClick={() => handleFilterTypeChange('Review')}
                  style={{ padding: '8px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: filterType === 'Review' ? 'var(--primary-light)' : 'var(--bg-card)', color: filterType === 'Review' ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                  Needs Review
                </button>
                <button className={`filter-dropdown ${filterType === 'Uncorrelated' ? 'active-filter' : ''}`} onClick={() => handleFilterTypeChange('Uncorrelated')}
                  style={{ padding: '8px 16px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: filterType === 'Uncorrelated' ? 'var(--primary-light)' : 'var(--bg-card)', color: filterType === 'Uncorrelated' ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
                  Uncorrelated
                </button>
              </div>
            </div>

            {selectedAccountIds.length > 0 && canEdit('Identity Repository') && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-add-connector" onClick={handleBatchApprove} disabled={runningAction} style={{ backgroundColor: 'var(--success, #10b981)', padding: '8px 16px', fontSize: '12.5px' }}>
                  Batch Approve ({selectedAccountIds.length})
                </button>
                <button className="btn-browse-file" onClick={handleBatchReject} disabled={runningAction} style={{ border: '1px solid var(--failed, #ef4444)', color: 'var(--failed, #ef4444)', padding: '8px 16px', fontSize: '12.5px' }}>
                  Batch Reject
                </button>
              </div>
            )}
          </div>

          <div className="table-card">
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                    <th style={{ width: '40px', paddingLeft: '24px' }}>
                      <input type="checkbox" onChange={handleSelectAll} checked={queueItems.length > 0 && selectedAccountIds.length === queueItems.length} />
                    </th>
                    <th>Application / Account</th>
                    <th>Name / Email</th>
                    <th>Status</th>
                    <th>Recommended Candidate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingQueue ? (
                    <tr>
                      <td colSpan="7">
                        <div className="table-loading-container">
                          <div className="spinner-element"></div>
                          <p>Loading review queue...</p>
                        </div>
                      </td>
                    </tr>
                  ) : queueItems.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <div className="table-empty-container">
                          <CheckCircle2 size={36} className="text-muted" style={{ color: 'var(--success)' }} />
                          <div className="empty-state-text">
                            <h4>Review Queue Clean!</h4>
                            <p>No accounts currently require correlation review.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    queueItems.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {(page - 1) * limit + idx + 1}
                        </td>
                        <td style={{ paddingLeft: '24px' }}>
                          <input type="checkbox" checked={selectedAccountIds.includes(item.id)} onChange={(e) => handleSelectItem(e, item.id)} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={14} className="text-muted" />
                            <div>
                              <div className="font-semibold text-main">{item.account_id}</div>
                              <div className="text-muted" style={{ fontSize: '11.5px' }}>{item.application_name}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>{item.account_name || '—'}</div>
                          <div className="text-muted" style={{ fontSize: '11.5px' }}>{item.email || '—'}</div>
                        </td>
                        <td>
                          <span className={`status-badge ${item.correlation_status === 'Needs Review' ? 'draft' : 'disabled'}`}>
                            {item.correlation_status === 'Needs Review' ? 'Needs Review' : 'No Match'}
                          </span>
                        </td>
                        <td>
                          {item.recommended_identity ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <User size={14} className="text-muted" />
                              <div>
                                <div style={{ fontWeight: '600' }}>
                                  {item.recommended_identity.display_name} 
                                  <span className="status-badge connected" style={{ marginLeft: '8px', fontSize: '10.5px', padding: '1px 5px' }}>
                                    {item.correlation_confidence}% match
                                  </span>
                                </div>
                                <div className="text-muted" style={{ fontSize: '11.5px' }}>
                                  {item.recommended_identity.email || 'No email'} · {item.recommended_identity.employee_id || 'No ID'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12.5px' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="actions-cell-menu" style={{ display: 'flex', gap: '6px' }}>
                            {item.recommended_identity && canEdit('Identity Repository') && (
                              <>
                                <button className="btn-row-action" title="Approve match" onClick={() => handleSingleApprove(item.id)} disabled={runningAction}
                                  style={{ padding: '4px 8px', border: '1px solid var(--success-light)', color: 'var(--success)' }}>
                                  Approve
                                </button>
                                <button className="btn-row-action delete" title="Reject recommendation" onClick={() => handleSingleReject(item.id)} disabled={runningAction}
                                  style={{ padding: '4px 8px' }}>
                                  Reject
                                </button>
                              </>
                            )}
                            {canEdit('Identity Repository') && (
                              <button className="btn-row-action" title="Manual Link" onClick={() => handleOpenManualModal(item)} disabled={runningAction}
                                style={{ padding: '4px 8px', border: '1px solid var(--border-color)', color: 'var(--text-main)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Link2 size={12} /> Link
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
                  Showing <b>{totalCount === 0 ? 0 : (page - 1) * limit + 1}</b> to <b>{Math.min(totalCount, page * limit)}</b> of <b>{totalCount}</b> accounts
                </div>
                {totalPages > 1 && (
                  <div className="pagination-buttons">
                    <button className="btn-page-nav" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
                    <button className="btn-page-nav" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="controls-card" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {canEdit('Identity Repository') && (
              <button className="btn-add-connector" onClick={handleOpenAddRuleModal}>
                <Plus size={14} />
                <span>Add Matching Rule</span>
              </button>
            )}
          </div>

          <div className="table-card">
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '24px' }}>Rule Name</th>
                    <th>Identity Field</th>
                    <th>Account Field</th>
                    <th>Match Type</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRules ? (
                    <tr>
                      <td colSpan="7">
                        <div className="table-loading-container">
                          <div className="spinner-element"></div>
                          <p>Loading matching rules...</p>
                        </div>
                      </td>
                    </tr>
                  ) : rules.length === 0 ? (
                    <tr>
                      <td colSpan="7">
                        <div className="table-empty-container">
                          <Settings size={36} className="text-muted" />
                          <div className="empty-state-text">
                            <h4>No Rules Configured</h4>
                            <p>Add a correlation rule to start matching accounts to identity profiles.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rules.map((rule) => (
                      <tr key={rule.id}>
                        <td style={{ paddingLeft: '24px', fontWeight: '600' }} className="text-main">{rule.rule_name}</td>
                        <td>{rule.identity_attribute}</td>
                        <td>{rule.account_attribute}</td>
                        <td>{rule.match_type}</td>
                        <td>
                          <span className="status-badge connected" style={{ padding: '2px 8px', fontSize: '11.5px' }}>
                            {rule.confidence_score}%
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleToggleRuleActive(rule)}
                            disabled={!canEdit('Identity Repository')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: canEdit('Identity Repository') ? 'pointer' : 'default',
                              border: rule.is_active ? '1px solid var(--success-light, #10b98120)' : '1px solid var(--border-color)',
                              backgroundColor: rule.is_active ? 'var(--success-light, #10b98110)' : 'transparent',
                              color: rule.is_active ? 'var(--success, #10b981)' : 'var(--text-muted)'
                            }}
                          >
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td>
                          <div className="actions-cell-menu" style={{ display: 'flex', gap: '6px' }}>
                            {canEdit('Identity Repository') && (
                              <>
                                <button className="btn-row-action" title="Edit rule" onClick={() => handleOpenEditRuleModal(rule)}>
                                  <Edit size={13} />
                                </button>
                                <button className="btn-row-action delete" title="Delete rule" onClick={() => handleDeleteRule(rule.id)}>
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Manual Link Modal */}
      {showManualModal && selectedAccount && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom connector-wizard-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header-custom">
              <h3>Link Account Manually</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowManualModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-form-custom">
              <div className="modal-scrollable-body wizard-body-section" style={{ minHeight: '300px' }}>
                <p className="subtitle" style={{ marginBottom: '16px' }}>
                  Map account <b>{selectedAccount.account_id}</b> ({selectedAccount.application_name}) to an identity profile.
                </p>
                <div className="search-input-wrapper" style={{ marginBottom: '16px', width: '100%' }}>
                  <Search size={16} className="text-muted" />
                  <input type="text" className="search-field" value={identitiesSearch} onChange={handleIdentitySearchChange} placeholder="Search identities..." style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>

                {loadingIdentities ? (
                  <div className="drawer-loading-box" style={{ padding: '20px 0' }}>
                    <div className="spinner-element"></div>
                    <p>Querying identities...</p>
                  </div>
                ) : identitiesList.length === 0 ? (
                  <div className="drawer-tab-empty-msg" style={{ padding: '20px 0' }}>
                    <User size={24} className="text-muted" />
                    <p>No identities found.</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <table className="detail-inner-table" style={{ margin: 0, width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px' }}>Name</th>
                          <th style={{ padding: '8px' }}>Email</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {identitiesList.map((idnty) => (
                          <tr key={idnty.id}>
                            <td style={{ padding: '8px', fontWeight: '600' }}>
                              {idnty.display_name || `${idnty.first_name || ''} ${idnty.last_name || ''}`.trim()}
                            </td>
                            <td style={{ padding: '8px' }}>{idnty.email || '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <button className="btn-add-connector" onClick={() => handleLinkAccount(idnty.id)} disabled={runningAction} style={{ padding: '4px 8px', fontSize: '11px' }}>
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
                <button className="btn-modal-cancel" type="button" onClick={() => setShowManualModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rule Form Modal */}
      {showRuleModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom connector-wizard-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header-custom">
              <h3>{editingRuleId ? 'Edit Correlation Rule' : 'Add Correlation Rule'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowRuleModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-form-custom">
              <div className="modal-scrollable-body wizard-body-section">
                <div className="input-group-custom" style={{ marginBottom: '12px' }}>
                  <label className="required">Rule Name</label>
                  <input type="text" name="rule_name" value={ruleFormData.rule_name} onChange={handleRuleFormChange} placeholder="e.g. Email Match Rule" required />
                </div>
                <div className="form-row-2col" style={{ marginBottom: '12px' }}>
                  <div className="input-group-custom">
                    <label>Identity Field</label>
                    <select name="identity_attribute" value={ruleFormData.identity_attribute} onChange={handleRuleFormChange}>
                      <option value="email">Email</option>
                      <option value="display_name">Display Name</option>
                      <option value="first_name">First Name</option>
                      <option value="last_name">Last Name</option>
                      <option value="employee_id">Employee ID</option>
                      <option value="department">Department</option>
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label>Account Field</label>
                    <select name="account_attribute" value={ruleFormData.account_attribute} onChange={handleRuleFormChange}>
                      <option value="email">Email</option>
                      <option value="account_name">Account Name</option>
                      <option value="account_id">Account ID</option>
                    </select>
                  </div>
                </div>
                <div className="form-row-2col" style={{ marginBottom: '12px' }}>
                  <div className="input-group-custom">
                    <label>Match Type</label>
                    <select name="match_type" value={ruleFormData.match_type} onChange={handleRuleFormChange}>
                      <option value="Exact">Exact Match</option>
                      <option value="Partial">Partial Match (Contains)</option>
                    </select>
                  </div>
                  <div className="input-group-custom">
                    <label>Confidence Score (%)</label>
                    <input type="number" name="confidence_score" value={ruleFormData.confidence_score} onChange={handleRuleFormChange} min="0" max="100" />
                  </div>
                </div>
                <div className="input-group-custom" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                  <input type="checkbox" id="rule-active-chk" name="is_active" checked={ruleFormData.is_active} onChange={handleRuleFormChange} />
                  <label htmlFor="rule-active-chk" style={{ cursor: 'pointer', margin: 0 }}>Active</label>
                </div>
              </div>
              <div className="modal-footer-custom">
                <button className="btn-modal-cancel" type="button" onClick={() => setShowRuleModal(false)}>Cancel</button>
                <button className="btn-modal-submit" type="button" onClick={handleSaveRule} disabled={ruleSubmitting || !ruleFormData.rule_name.trim()}>
                  {ruleSubmitting ? 'Saving...' : 'Save Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default CorrelationWorkspace;
