import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  RefreshCw,
  UserX,
  UserCheck,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Zap,
  Activity,
  Layers,
  ChevronRight,
  Database
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { apiClient } from '../../services/dashboardService';
import './JMLWorkspace.css';

const JMLWorkspace = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState(null); // 'JOINER' | 'MOVER' | 'LEAVER' | 'REHIRE' | 'DETAILS'
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    principal_id: '',
    display_name: '',
    email: '',
    department: 'Engineering',
    job_title: 'Software Engineer',
    location: 'US-East'
  });

  const fetchJMLEvents = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/v1/jml/events');
      setEvents(res.data || []);
    } catch (err) {
      console.error('Failed to fetch JML events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJMLEvents();
  }, []);

  const openModal = (type) => {
    setActiveModal(type);
    setActionError(null);
    setActionMessage(null);
    setFormData({
      principal_id: `usr_${Math.floor(1000 + Math.random() * 9000)}`,
      display_name: '',
      email: '',
      department: 'Engineering',
      job_title: 'Software Engineer',
      location: 'US-East'
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.principal_id.trim()) {
      setActionError('Principal ID is required.');
      return;
    }

    try {
      setSubmitting(true);
      setActionError(null);
      setActionMessage(null);

      const payload = {
        event_type: activeModal,
        principal_id: formData.principal_id.trim(),
        display_name: formData.display_name.trim() || undefined,
        email: formData.email.trim() || undefined,
        attributes: {
          department: formData.department,
          job_title: formData.job_title,
          location: formData.location
        }
      };

      const res = await apiClient.post('/v1/jml/events', payload);
      setActionMessage(`[${activeModal} EVENT PROCESSED] Successfully executed lifecycle transition for ${formData.principal_id}.`);
      fetchJMLEvents();
      setTimeout(() => {
        setActiveModal(null);
      }, 1200);
    } catch (err) {
      console.error('Error triggering JML event:', err);
      setActionError(err.response?.data?.detail || 'Failed to execute lifecycle event.');
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics computation
  const totalEvents = events.length;
  const joinerCount = events.filter(e => (e.event_type || '').toUpperCase() === 'JOINER').length;
  const moverCount = events.filter(e => (e.event_type || '').toUpperCase() === 'MOVER').length;
  const leaverCount = events.filter(e => (e.event_type || '').toUpperCase() === 'LEAVER').length;
  const rehireCount = events.filter(e => (e.event_type || '').toUpperCase() === 'REHIRE').length;

  const filteredEvents = events.filter(e => {
    const matchesType = filterType === 'ALL' || (e.event_type || '').toUpperCase() === filterType;
    const matchesSearch = !searchQuery || 
      (e.principal_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.source || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getEventBadge = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'JOINER':
        return <span className="jml-badge joiner"><UserPlus size={13} /> Joiner</span>;
      case 'MOVER':
        return <span className="jml-badge mover"><RefreshCw size={13} /> Mover</span>;
      case 'LEAVER':
        return <span className="jml-badge leaver"><UserX size={13} /> Leaver</span>;
      case 'REHIRE':
        return <span className="jml-badge rehire"><UserCheck size={13} /> Rehire</span>;
      default:
        return <span className="jml-badge generic"><Activity size={13} /> {type}</span>;
    }
  };

  return (
    <div className="jml-workspace-page">
      <Breadcrumb items={[{ label: 'Governance', path: '/governance/dashboard' }, { label: 'JML Lifecycle Control Plane', active: true }]} />

      {/* Header */}
      <div className="jml-header">
        <div>
          <h2>Joiner • Mover • Leaver (JML) Control Center</h2>
          <p className="jml-subtitle">
            Autonomous lifecycle state machine orchestrating unified Joiner provisioning, Mover epoch bumps, Leaver cascade freezes, and Zero-Trust Rehire transitions.
          </p>
        </div>
        <div className="jml-header-actions">
          <button className="jml-action-btn joiner-btn" onClick={() => openModal('JOINER')}>
            <UserPlus size={16} /> Process Joiner
          </button>
          <button className="jml-action-btn mover-btn" onClick={() => openModal('MOVER')}>
            <RefreshCw size={16} /> Process Mover
          </button>
          <button className="jml-action-btn leaver-btn" onClick={() => openModal('LEAVER')}>
            <UserX size={16} /> Emergency Leaver
          </button>
          <button className="jml-action-btn rehire-btn" onClick={() => openModal('REHIRE')}>
            <UserCheck size={16} /> Process Rehire
          </button>
        </div>
      </div>

      {/* Action Notice */}
      {actionMessage && (
        <div className="jml-banner success">
          <CheckCircle2 size={16} /> {actionMessage}
        </div>
      )}

      {/* KPI Cards */}
      <div className="jml-stats-grid">
        <div className="jml-stat-card">
          <div className="stat-icon total"><Activity size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Total Lifecycle Events</span>
            <span className="stat-val">{totalEvents}</span>
          </div>
        </div>
        <div className="jml-stat-card">
          <div className="stat-icon joiner"><UserPlus size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Joiners Onboarded</span>
            <span className="stat-val">{joinerCount}</span>
          </div>
        </div>
        <div className="jml-stat-card">
          <div className="stat-icon mover"><RefreshCw size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Mover Role Shifts</span>
            <span className="stat-val">{moverCount}</span>
          </div>
        </div>
        <div className="jml-stat-card">
          <div className="stat-icon leaver"><UserX size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Leaver Revocations</span>
            <span className="stat-val">{leaverCount}</span>
          </div>
        </div>
        <div className="jml-stat-card">
          <div className="stat-icon rehire"><UserCheck size={20} /></div>
          <div className="stat-info">
            <span className="stat-label">Rehires Certified</span>
            <span className="stat-val">{rehireCount}</span>
          </div>
        </div>
      </div>

      {/* Audit Log / Event Feed Section */}
      <div className="jml-table-container">
        <div className="jml-table-toolbar">
          <div className="jml-search-box">
            <Search size={15} />
            <input 
              type="text" 
              placeholder="Search by Principal ID, Event ID, Source..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="jml-filters">
            {['ALL', 'JOINER', 'MOVER', 'LEAVER', 'REHIRE'].map((type) => (
              <button 
                key={type} 
                className={`filter-chip ${filterType === type ? 'active' : ''}`}
                onClick={() => setFilterType(type)}
              >
                {type}
              </button>
            ))}
            <button className="refresh-icon-btn" onClick={fetchJMLEvents} title="Refresh Feed">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="jml-loading">
            <RefreshCw className="spin" size={24} />
            <span>Loading Lifecycle Event Streams...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="jml-empty">
            <FileText size={32} />
            <p>No lifecycle events found matching current criteria.</p>
          </div>
        ) : (
          <table className="jml-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Lifecycle Type</th>
                <th>Target Principal</th>
                <th>Authority Source</th>
                <th>Engine Status</th>
                <th>Timestamp</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((evt) => (
                <tr key={evt.id}>
                  <td className="font-mono text-muted">{evt.id.substring(0, 18)}...</td>
                  <td>{getEventBadge(evt.event_type)}</td>
                  <td className="font-bold">{evt.principal_id}</td>
                  <td>
                    <span className="source-pill">{evt.source || 'HRMS'}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${evt.status?.toLowerCase()}`}>
                      <CheckCircle2 size={12} /> {evt.status}
                    </span>
                  </td>
                  <td className="text-muted">
                    {evt.created_at ? new Date(evt.created_at).toLocaleString() : 'Just now'}
                  </td>
                  <td>
                    <button 
                      className="jml-detail-btn"
                      onClick={() => {
                        setSelectedEvent(evt);
                        setActiveModal('DETAILS');
                      }}
                    >
                      Inspect <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lifecycle Action Modal */}
      {activeModal && activeModal !== 'DETAILS' && (
        <div className="jml-modal-overlay">
          <div className="jml-modal">
            <div className="jml-modal-header">
              <h3>
                {activeModal === 'JOINER' && <><UserPlus size={18} /> Trigger Joiner Onboarding</>}
                {activeModal === 'MOVER' && <><RefreshCw size={18} /> Trigger Mover Transition</>}
                {activeModal === 'LEAVER' && <><UserX size={18} /> Trigger Leaver Emergency Revocation</>}
                {activeModal === 'REHIRE' && <><UserCheck size={18} /> Trigger Zero-Trust Rehire</>}
              </h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>×</button>
            </div>

            {actionError && <div className="jml-banner error">{actionError}</div>}
            {actionMessage && <div className="jml-banner success">{actionMessage}</div>}

            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label>Principal Identifier *</label>
                <input 
                  type="text" 
                  value={formData.principal_id}
                  onChange={(e) => setFormData({ ...formData, principal_id: e.target.value })}
                  placeholder="e.g. usr_1049 or alex.mercer"
                  required
                />
              </div>

              {(activeModal === 'JOINER' || activeModal === 'REHIRE') && (
                <>
                  <div className="form-group">
                    <label>Full Display Name</label>
                    <input 
                      type="text" 
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="e.g. Alex Mercer"
                      required={activeModal === 'JOINER'}
                    />
                  </div>
                  <div className="form-group">
                    <label>Corporate Email</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. alex.m@corp.internal"
                    />
                  </div>
                </>
              )}

              {(activeModal === 'JOINER' || activeModal === 'MOVER' || activeModal === 'REHIRE') && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Department</label>
                    <select 
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      <option value="Engineering">Engineering</option>
                      <option value="Finance">Finance</option>
                      <option value="Security">Security</option>
                      <option value="Operations">Operations</option>
                      <option value="Sales">Sales</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Job Title</label>
                    <input 
                      type="text" 
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                      placeholder="e.g. Cloud Security Architect"
                    />
                  </div>
                </div>
              )}

              {activeModal === 'LEAVER' && (
                <div className="leaver-warning">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>Immediate Authority Freeze & Cascade Invariant:</strong>
                    <p>Executing LEAVER will immediately freeze the principal, increment authority epoch to invalidate runtime tokens, and dispatch dual-lineage cascade revocation across all linked cloud accounts and delegations.</p>
                  </div>
                </div>
              )}

              <div className="jml-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                <button type="submit" className={`btn-primary ${activeModal.toLowerCase()}`} disabled={submitting}>
                  {submitting ? 'Executing JML Pipeline...' : `Execute ${activeModal} Event`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Details Inspection Modal */}
      {activeModal === 'DETAILS' && selectedEvent && (
        <div className="jml-modal-overlay">
          <div className="jml-modal detail-modal">
            <div className="jml-modal-header">
              <h3><FileText size={18} /> Lifecycle Event Inspection: {selectedEvent.id}</h3>
              <button className="close-btn" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="event-detail-content">
              <div className="detail-row">
                <span className="label">Event Type:</span>
                <span className="value">{getEventBadge(selectedEvent.event_type)}</span>
              </div>
              <div className="detail-row">
                <span className="label">Target Principal:</span>
                <span className="value font-bold">{selectedEvent.principal_id}</span>
              </div>
              <div className="detail-row">
                <span className="label">Source System:</span>
                <span className="value">{selectedEvent.source || 'HRMS'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Status:</span>
                <span className="value status-badge">{selectedEvent.status}</span>
              </div>
              <div className="detail-row">
                <span className="label">Timestamp:</span>
                <span className="value">{selectedEvent.created_at ? new Date(selectedEvent.created_at).toLocaleString() : 'N/A'}</span>
              </div>
              <div className="payload-box">
                <label>Engine Payload & Metadata</label>
                <pre>{JSON.stringify(selectedEvent.payload || {}, null, 2)}</pre>
              </div>
            </div>
            <div className="jml-modal-actions">
              <button className="btn-primary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JMLWorkspace;
