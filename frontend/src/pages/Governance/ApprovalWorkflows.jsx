import React, { useState, useEffect, useCallback } from 'react';
import { 
  Shield, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Info, 
  Check, 
  X, 
  User, 
  Layers, 
  RefreshCw, 
  AlertTriangle,
  Clock,
  CheckCircle2,
  SlidersHorizontal
} from 'lucide-react';
import './ApprovalWorkflows.css';
import { 
  getApprovalWorkflows, 
  createApprovalWorkflow, 
  updateApprovalWorkflow, 
  deleteApprovalWorkflow, 
  getWorkflowMetaOptions 
} from '../../services/approvalWorkflowService';
import { searchOwnerCandidates } from '../../services/applicationService';
import { ToastContainer, showToast } from '../../components/Toast/Toast';

const INITIAL_LEVEL = {
  level_number: 1,
  approver_type: 'Manager of the user',
  specific_approver_id: null,
  specific_approver_name: '',
  specific_approver_email: '',
  timeout_hours: 48,
  quorum: 'ALL — every resolved approver must approve',
  fallback_action: 'No fallback — remind approver & alert admins'
};

const INITIAL_FORM_STATE = {
  name: '',
  scope: 'Default — all applications',
  risk_level: 'ALL',
  workflow_mode: 'Unified',
  description: '',
  is_active: true,
  is_default: false,
  levels: [{ ...INITIAL_LEVEL, level_number: 1 }]
};

const ApprovalWorkflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [metaOptions, setMetaOptions] = useState({
    scopes: ['Default — all applications'],
    risk_levels: ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    workflow_modes: ['Unified', 'Lane'],
    approver_types: [
      'Manager of the user',
      'Application owner',
      'Role owner',
      'Specific Person',
      'Workgroup Admin',
      'Security Admin',
      'Governance Admin'
    ],
    quorum_options: [
      'ALL — every resolved approver must approve',
      'ANY — any single approver can approve'
    ],
    fallback_actions: [
      'No fallback — remind approver & alert admins',
      'Escalate to manager',
      'Auto-approve',
      'Auto-reject'
    ]
  });

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // User Candidate Search for "Specific Person" approver
  const [personSearchQueries, setPersonSearchQueries] = useState({});
  const [personCandidates, setPersonCandidates] = useState({});
  const [personLoading, setPersonLoading] = useState({});
  const [showPersonDropdown, setShowPersonDropdown] = useState({});

  // Delete Confirm Dialog State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchMetaOptions = useCallback(async () => {
    try {
      const res = await getWorkflowMetaOptions();
      setMetaOptions((prev) => ({ ...prev, ...res }));
    } catch (err) {
      console.error('Failed to load workflow meta options:', err);
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search) params.search = search.trim();
      if (scopeFilter) params.scope = scopeFilter;
      if (riskFilter) params.risk_level = riskFilter;

      const res = await getApprovalWorkflows(params);
      setWorkflows(res.workflows || []);
    } catch (err) {
      console.error('Failed to fetch approval workflows:', err);
      setError(err.response?.data?.detail || 'Failed to load approval workflows.');
    } finally {
      setLoading(false);
    }
  }, [search, scopeFilter, riskFilter]);

  useEffect(() => {
    fetchMetaOptions();
  }, [fetchMetaOptions]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Modal Handlers
  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormState(INITIAL_FORM_STATE);
    setFormErrors({});
    setShowModal(true);
  };

  const handleOpenEditModal = (wf) => {
    setEditingId(wf.id);
    setFormState({
      name: wf.name || '',
      scope: wf.scope || 'Default — all applications',
      risk_level: wf.risk_level || 'ALL',
      workflow_mode: wf.workflow_mode || 'Unified',
      description: wf.description || '',
      is_active: wf.is_active ?? true,
      is_default: wf.is_default ?? false,
      levels: wf.levels && wf.levels.length > 0
        ? wf.levels.map((l, idx) => ({ ...l, level_number: idx + 1 }))
        : [{ ...INITIAL_LEVEL, level_number: 1 }]
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleAddLevel = () => {
    setFormState((prev) => ({
      ...prev,
      levels: [
        ...prev.levels,
        { ...INITIAL_LEVEL, level_number: prev.levels.length + 1 }
      ]
    }));
  };

  const handleRemoveLevel = (index) => {
    if (formState.levels.length <= 1) return;
    const updated = formState.levels
      .filter((_, idx) => idx !== index)
      .map((lvl, idx) => ({ ...lvl, level_number: idx + 1 }));
    setFormState((prev) => ({ ...prev, levels: updated }));
  };

  const handleMoveLevelUp = (index) => {
    if (index === 0) return;
    const newLevels = [...formState.levels];
    const temp = newLevels[index - 1];
    newLevels[index - 1] = newLevels[index];
    newLevels[index] = temp;
    const reordered = newLevels.map((lvl, idx) => ({ ...lvl, level_number: idx + 1 }));
    setFormState((prev) => ({ ...prev, levels: reordered }));
  };

  const handleMoveLevelDown = (index) => {
    if (index === formState.levels.length - 1) return;
    const newLevels = [...formState.levels];
    const temp = newLevels[index + 1];
    newLevels[index + 1] = newLevels[index];
    newLevels[index] = temp;
    const reordered = newLevels.map((lvl, idx) => ({ ...lvl, level_number: idx + 1 }));
    setFormState((prev) => ({ ...prev, levels: reordered }));
  };

  const handleLevelFieldChange = (index, field, value) => {
    setFormState((prev) => {
      const updated = [...prev.levels];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, levels: updated };
    });
  };

  // Specific Person Search for Level Approver
  const handlePersonSearch = async (index, query) => {
    setPersonSearchQueries((prev) => ({ ...prev, [index]: query }));
    if (!query || query.trim().length < 1) {
      setPersonCandidates((prev) => ({ ...prev, [index]: [] }));
      setShowPersonDropdown((prev) => ({ ...prev, [index]: false }));
      return;
    }
    try {
      setPersonLoading((prev) => ({ ...prev, [index]: true }));
      const res = await searchOwnerCandidates(query.trim());
      setPersonCandidates((prev) => ({ ...prev, [index]: res || [] }));
      setShowPersonDropdown((prev) => ({ ...prev, [index]: true }));
    } catch (err) {
      console.error('Failed to search person candidates:', err);
    } finally {
      setPersonLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleSelectPerson = (index, person) => {
    setFormState((prev) => {
      const updated = [...prev.levels];
      updated[index] = {
        ...updated[index],
        specific_approver_id: person.id,
        specific_approver_name: person.name,
        specific_approver_email: person.email
      };
      return { ...prev, levels: updated };
    });
    setShowPersonDropdown((prev) => ({ ...prev, [index]: false }));
  };

  const handleSaveWorkflow = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formState.name.trim()) errors.name = 'Workflow name is required.';
    if (!formState.scope) errors.scope = 'Scope is required.';
    if (!formState.risk_level) errors.risk_level = 'Risk level is required.';
    if (formState.levels.length === 0) errors.levels = 'At least one approval level is required.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await updateApprovalWorkflow(editingId, formState);
      } else {
        await createApprovalWorkflow(formState);
      }
      setShowModal(false);
      fetchWorkflows();
    } catch (err) {
      console.error('Failed to save approval workflow:', err);
      showToast(err.response?.data?.detail || 'Failed to save approval workflow.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Handlers
  const handleOpenDeleteModal = (wf) => {
    setItemToDelete(wf);
    setShowDeleteModal(true);
  };

  const handleDeleteSubmit = async () => {
    if (!itemToDelete) return;
    try {
      setDeleteSubmitting(true);
      await deleteApprovalWorkflow(itemToDelete.id);
      setShowDeleteModal(false);
      setItemToDelete(null);
      fetchWorkflows();
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      showToast(err.response?.data?.detail || 'Failed to delete approval workflow.', 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const renderRiskBadge = (risk) => {
    const riskUpper = (risk || 'ALL').toUpperCase();
    switch (riskUpper) {
      case 'LOW':
        return <span className="aw-badge-risk low">LOW RISK</span>;
      case 'MEDIUM':
        return <span className="aw-badge-risk medium">MEDIUM RISK</span>;
      case 'HIGH':
        return <span className="aw-badge-risk high">HIGH RISK</span>;
      case 'CRITICAL':
        return <span className="aw-badge-risk critical">CRITICAL RISK</span>;
      default:
        return <span className="aw-badge-risk all">ALL RISKS</span>;
    }
  };

  return (
    <div className="approval-workflows-page">
      {/* Page Header */}
      <div className="aw-header-section">
        <div className="aw-header-titles">
          <h2>
            <Shield size={24} className="text-primary" /> Approval Workflows
          </h2>
          <p>Define who approves access requests, level by level (L1, L2, L3...)</p>
        </div>
        <button className="btn-primary-action" onClick={handleOpenAddModal}>
          <Plus size={16} />
          <span>New Workflow</span>
        </button>
      </div>

      {/* Info Callout Banner */}
      <div className="aw-info-banner">
        <Info size={18} />
        <div>
          <b>Workflow Routing Engine:</b> Lane workflows split requests into per-application, per-risk lanes that approve independently. Unified workflows route the whole request through one sequential chain based on the highest item risk — rejection cancels the entire request.
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="aw-controls-bar">
        <div className="aw-filter-group">
          <div className="aw-search-box">
            <Search size={14} className="aw-search-icon" />
            <input
              type="text"
              placeholder="Search workflows by name or scope..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="aw-select-filter"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
          >
            <option value="">All Scopes</option>
            {metaOptions.scopes.map((sc) => (
              <option key={sc} value={sc}>{sc}</option>
            ))}
          </select>

          <select
            className="aw-select-filter"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="">All Risk Levels</option>
            {metaOptions.risk_levels.map((rk) => (
              <option key={rk} value={rk}>{rk} Risk</option>
            ))}
          </select>
        </div>

        <button className="btn-card-action" onClick={fetchWorkflows} title="Refresh Workflows">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="table-loading-container" style={{ padding: '60px 0' }}>
          <div className="spinner-element"></div>
          <p>Loading approval workflow configurations...</p>
        </div>
      ) : error ? (
        <div className="table-empty-container" style={{ padding: '40px 0' }}>
          <AlertTriangle size={36} className="text-danger" />
          <div className="empty-state-text">
            <h4>Failed to Load Workflows</h4>
            <p>{error}</p>
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="table-empty-container" style={{ padding: '60px 0' }}>
          <Shield size={40} className="text-muted" />
          <div className="empty-state-text">
            <h4>No Approval Workflows Found</h4>
            <p>No workflow policies matching current filters. Click "New Workflow" to configure a custom policy.</p>
          </div>
        </div>
      ) : (
        <div className="aw-cards-grid">
          {workflows.map((wf) => (
            <div key={wf.id} className="aw-workflow-card">
              <div>
                <div className="aw-card-header">
                  <div className="aw-card-title-group">
                    <h4>{wf.name}</h4>
                    <div className="aw-card-badges">
                      {renderRiskBadge(wf.risk_level)}
                      <span className="aw-badge-mode">{wf.workflow_mode || 'Unified'}</span>
                    </div>
                  </div>
                  <div className="aw-card-actions">
                    <button className="btn-card-action" title="Edit Workflow" onClick={() => handleOpenEditModal(wf)}>
                      <Edit size={13} />
                    </button>
                    {!wf.is_default && (
                      <button className="btn-card-action delete" title="Delete Workflow" onClick={() => handleOpenDeleteModal(wf)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Scope: <b style={{ color: 'var(--text-main)' }}>{wf.scope}</b>
                  {wf.description && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{wf.description}</div>}
                </div>

                {/* Level list */}
                <div className="aw-levels-list">
                  {wf.levels && wf.levels.length > 0 ? (
                    wf.levels.map((lvl) => (
                      <div key={lvl.id || lvl.level_number} className="aw-level-item-row">
                        <span className="aw-level-number-badge">L{lvl.level_number}</span>
                        <span className="aw-level-approver-name">
                          {lvl.approver_type === 'Specific Person'
                            ? `Person: ${lvl.specific_approver_name || 'Unassigned'}`
                            : lvl.approver_type}
                        </span>
                        <span className="aw-level-meta-text">
                          <Clock size={11} style={{ display: 'inline', marginRight: '3px' }} />
                          {lvl.timeout_hours}h
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No approval levels configured.</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: New / Edit Approval Workflow */}
      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom aw-modal-content">
            <div className="modal-header-custom aw-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '17px', fontWeight: 700 }}>
                <Shield size={18} className="text-primary" /> {editingId ? 'Edit Approval Workflow' : 'New Approval Workflow'}
              </h3>
              <button className="modal-close-btn-custom" type="button" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveWorkflow} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0 }}>
              <div className="aw-modal-body">
                <div className="input-group-custom" style={{ marginBottom: '16px' }}>
                  <label className="required">Workflow Name</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g. Default (all applications) - Medium Risk"
                  />
                  {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
                </div>

                <div className="form-row-2col" style={{ marginBottom: '16px' }}>
                  <div className="input-group-custom">
                    <label className="required">Scope</label>
                    <select
                      value={formState.scope}
                      onChange={(e) => setFormState({ ...formState, scope: e.target.value })}
                    >
                      {metaOptions.scopes.map((sc) => (
                        <option key={sc} value={sc}>{sc}</option>
                      ))}
                    </select>
                    <div className="aw-helper-text">
                      Workgroup-scoped workflows take priority over the default/application matrix for requests made by members of that workgroup.
                    </div>
                  </div>

                  <div className="input-group-custom">
                    <label className="required">Risk level</label>
                    <select
                      value={formState.risk_level}
                      onChange={(e) => setFormState({ ...formState, risk_level: e.target.value })}
                    >
                      {metaOptions.risk_levels.map((rk) => (
                        <option key={rk} value={rk}>{rk}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="input-group-custom" style={{ marginBottom: '20px' }}>
                  <label className="required">Workflow mode</label>
                  <select
                    value={formState.workflow_mode}
                    onChange={(e) => setFormState({ ...formState, workflow_mode: e.target.value })}
                  >
                    {metaOptions.workflow_modes.map((wm) => (
                      <option key={wm} value={wm}>
                        {wm === 'Lane' ? 'Lane — per app/risk lanes approve independently' : 'Unified — whole request approved sequentially'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Approval Levels Builder */}
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>Approval levels</h4>
                  <button
                    type="button"
                    className="btn-card-action"
                    onClick={handleAddLevel}
                    style={{ color: 'var(--primary)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={13} /> Add level
                  </button>
                </div>

                {formState.levels.map((lvl, index) => (
                  <div key={index} className="aw-level-builder-card">
                    <div className="aw-level-builder-header">
                      <span className="aw-level-builder-title">
                        L{index + 1}
                      </span>
                      <div className="aw-level-builder-controls">
                        <button
                          type="button"
                          className="btn-icon-control"
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => handleMoveLevelUp(index)}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon-control"
                          title="Move down"
                          disabled={index === formState.levels.length - 1}
                          onClick={() => handleMoveLevelDown(index)}
                        >
                          <ArrowDown size={12} />
                        </button>
                        {formState.levels.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon-control danger"
                            title="Delete level"
                            onClick={() => handleRemoveLevel(index)}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Level Form Fields */}
                    <div className="form-row-2col" style={{ marginBottom: '10px' }}>
                      <div className="input-group-custom">
                        <label>Approver</label>
                        <select
                          value={lvl.approver_type}
                          onChange={(e) => handleLevelFieldChange(index, 'approver_type', e.target.value)}
                        >
                          {metaOptions.approver_types.map((at) => (
                            <option key={at} value={at}>{at}</option>
                          ))}
                        </select>
                      </div>

                      <div className="input-group-custom">
                        <label>Timeout (hours)</label>
                        <input
                          type="number"
                          min="1"
                          max="720"
                          value={lvl.timeout_hours}
                          onChange={(e) => handleLevelFieldChange(index, 'timeout_hours', parseInt(e.target.value) || 48)}
                        />
                      </div>
                    </div>

                    {/* Specific Person Picker */}
                    {lvl.approver_type === 'Specific Person' && (
                      <div className="input-group-custom" style={{ position: 'relative', marginBottom: '10px' }}>
                        <label className="required">Person</label>
                        <input
                          type="text"
                          placeholder="Search person by name or email..."
                          value={personSearchQueries[index] !== undefined ? personSearchQueries[index] : (lvl.specific_approver_name || '')}
                          onChange={(e) => handlePersonSearch(index, e.target.value)}
                          onFocus={() => { if ((personCandidates[index] || []).length > 0) setShowPersonDropdown((prev) => ({ ...prev, [index]: true })); }}
                        />
                        {personLoading[index] && (
                          <span style={{ position: 'absolute', right: '12px', top: '35px', fontSize: '11px', color: 'var(--text-muted)' }}>Searching...</span>
                        )}
                        {showPersonDropdown[index] && (personCandidates[index] || []).length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: 'var(--shadow-lg)', maxHeight: '150px', overflowY: 'auto', marginTop: '2px' }}>
                            {(personCandidates[index] || []).map((cand) => (
                              <div
                                key={`${cand.source}-${cand.id}-${cand.email}`}
                                onClick={() => handleSelectPerson(index, cand)}
                                style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '12px' }}
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                <div style={{ fontWeight: '600' }}>{cand.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cand.email}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="input-group-custom" style={{ marginBottom: '10px' }}>
                      <label>Quorum</label>
                      <select
                        value={lvl.quorum}
                        onChange={(e) => handleLevelFieldChange(index, 'quorum', e.target.value)}
                      >
                        {metaOptions.quorum_options.map((qo) => (
                          <option key={qo} value={qo}>{qo}</option>
                        ))}
                      </select>
                      <div className="aw-helper-text">
                        Workgroup levels usually use ANY (one member can approve); role/owner levels usually use ALL.
                      </div>
                    </div>

                    <div className="input-group-custom">
                      <label>Escalate to when overdue (optional)</label>
                      <select
                        value={lvl.fallback_action}
                        onChange={(e) => handleLevelFieldChange(index, 'fallback_action', e.target.value)}
                      >
                        {metaOptions.fallback_actions.map((fa) => (
                          <option key={fa} value={fa}>{fa}</option>
                        ))}
                      </select>
                      <div className="aw-helper-text">
                        When overdue, the step escalates to the approver's manager first. This person is the fallback used only when the approver has no manager. Both parties are notified by email.
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sticky Footer */}
              <div className="aw-modal-footer">
                <button className="btn-modal-cancel" type="button" disabled={submitting} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="btn-modal-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Saving Workflow...' : 'Save Workflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon"><AlertTriangle size={24} /></div>
              <div className="delete-dialog-text">
                <h4>Delete Approval Workflow?</h4>
                <p>
                  Are you sure you want to delete <b>{itemToDelete?.name}</b>?
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" type="button" disabled={deleteSubmitting} onClick={() => setShowDeleteModal(false)}>Cancel</button>
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

export default ApprovalWorkflows;
