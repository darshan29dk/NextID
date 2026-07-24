import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, RefreshCw, CheckCircle2, AlertOctagon, 
  Clock, Server, ChevronLeft, Calendar, HelpCircle 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import './SoDViolations.css';

// API Client
import { apiClient } from '../../services/dashboardService';

const SoDScanHistory = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningScanId, setRunningScanId] = useState(null);
  
  // Alert messages
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [triggering, setTriggering] = useState(false);

  const fetchScanHistory = useCallback(async () => {
    try {
      const res = await apiClient.get('/governance/violations/scan-history');
      setHistory(res.data);
      
      // Check if there is an active running scan to poll
      const activeScan = res.data.find(s => s.status === 'RUNNING');
      if (activeScan) {
        setRunningScanId(activeScan.id);
      } else {
        setRunningScanId(null);
      }
    } catch (err) {
      console.error("Failed to load scan histories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScanHistory();
  }, [fetchScanHistory]);

  // Polling active scan progress
  useEffect(() => {
    if (!runningScanId) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.get('/governance/violations/scan-history');
        setHistory(res.data);
        const activeScan = res.data.find(s => s.status === 'RUNNING');
        if (!activeScan) {
          setRunningScanId(null);
          showToast("Background SoD scan completed successfully!", "success");
        }
      } catch (err) {
        console.error("Polling scan progress failed:", err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [runningScanId]);

  // Trigger scan API
  const handleTriggerScan = async (type) => {
    setTriggering(true);
    try {
      const url = type === 'INCREMENTAL' 
        ? '/governance/violations/scan/incremental' 
        : '/governance/violations/scan/full';
      const res = await apiClient.post(url);
      showToast(`${type.capitalize()} Scan started in the background.`, "success");
      setRunningScanId(res.data.scan_id);
      fetchScanHistory();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to trigger scan.", "error");
    } finally {
      setTriggering(false);
    }
  };

  const showToast = (msg, type) => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const toUTC = (str) => {
    if (!str) return '';
    if (typeof str !== 'string') return str;
    // Only a trailing timezone offset (e.g. "+05:30" or "-05:30") means the
    // string already carries zone info. A bare check for "-" anywhere wrongly
    // matched the date's own hyphens (e.g. "2026-07-23"), so it never
    // actually appended 'Z' - this was a no-op for every normal timestamp.
    if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
      return str + 'Z';
    }
    return str;
  };

  // Helper calculation
  const getDuration = (start, end) => {
    if (!start) return '-';
    const sTime = new Date(toUTC(start)).getTime();
    const eTime = end ? new Date(toUTC(end)).getTime() : Date.now();
    const diff = Math.max(0, eTime - sTime);
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ${secs % 60}s`;
  };

  return (
    <div className="sod-scan-history-page">
      <Breadcrumb items={[
        { label: 'Governance', path: '/governance' },
        { label: 'SoD Violations', path: '/governance/violations' },
        { label: 'Scan History', path: '', active: true }
      ]} />

      <button className="btn-back" onClick={() => navigate('/governance/violations')}>
        <ChevronLeft size={14} /> Back to Violations
      </button>

      {/* Header and triggers */}
      <div className="sod-page-header">
        <div className="header-titles">
          <h1>SoD Scan Audit History</h1>
          <p className="subtitle">Execute and track standard compliance scanning jobs over identity assignments.</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn-secondary" 
            disabled={triggering || runningScanId !== null}
            onClick={() => handleTriggerScan('INCREMENTAL')}
            title="Incremental Scan (users modified since last run)"
          >
            <Play size={14} />
            <span>Incremental Scan</span>
          </button>
          <button 
            className="btn-primary" 
            disabled={triggering || runningScanId !== null}
            onClick={() => handleTriggerScan('FULL')}
            title="Full System Scan (all active users)"
          >
            <Play size={14} />
            <span>Run Full Scan</span>
          </button>
        </div>
      </div>

      {/* Banners */}
      {successMsg && (
        <div className="toast toast-success" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="toast toast-error" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <AlertOctagon size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Scan Overview Stats */}
      <div className="sod-kpi-grid" style={{ marginBottom: '24px' }}>
        <DashboardCard title="Total Scans Run" value={history.length} icon={Server} trend="Execution history" />
        <DashboardCard
          title="Last Executed Scan"
          value={history.length > 0
            ? <span className={`type-badge ${history[0].scan_type.toLowerCase()}`}>{history[0].scan_type}</span>
            : '-'}
          icon={Clock}
          status="info"
        />
        <DashboardCard 
          title="Total Users Analyzed" 
          value={history.length > 0 ? history.reduce((acc, h) => acc + h.users_scanned, 0) : 0} 
          icon={CheckCircle2} 
          status="success" 
        />
        <DashboardCard 
          title="Total Violations Found" 
          value={history.length > 0 ? history.reduce((acc, h) => acc + h.violations_found, 0) : 0} 
          icon={AlertOctagon} 
          status="warning" 
        />
      </div>

      {/* Main List Workspace */}
      <div className="sod-main-panel">
        {loading ? (
          <div className="table-loading-container" style={{ minHeight: '300px' }}>
            <div className="spinner-element"></div>
            <p className="text-muted">Loading scan execution logs...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="table-empty-container">
            <Server size={40} className="text-muted" />
            <h3>No Scan Execution History</h3>
            <p>Trigger a FULL or INCREMENTAL scan to begin auditing.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="sod-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>Scan Name</th>
                  <th>Scan Type</th>
                  <th>Started By</th>
                  <th>Started Time</th>
                  <th>Completed Time</th>
                  <th>Duration</th>
                  <th>Progress</th>
                  <th>Violations Found</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                    <td><b>{s.scan_name}</b></td>
                    <td>
                      <span className={`type-badge ${s.scan_type.toLowerCase()}`}>{s.scan_type}</span>
                    </td>
                    <td>{s.started_by}</td>
                    <td>{new Date(toUTC(s.start_time)).toLocaleString()}</td>
                    <td>{s.end_time ? new Date(toUTC(s.end_time)).toLocaleString() : '-'}</td>
                    <td>{getDuration(s.start_time, s.end_time)}</td>
                    <td>
                      <div className="progress-bar-cell">
                        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{s.progress_pct}%</span>
                        <div className="progress-bar-container">
                          <div className="progress-bar-fill" style={{ width: `${s.progress_pct}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td><b>{s.violations_found}</b> user(s)</td>
                    <td>
                      <span className={`status-badge ${s.status === 'COMPLETED' ? 'status-closed' : (s.status === 'RUNNING' ? 'status-review' : 'status-open')}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length > 0 && (
              <div className="table-pagination-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 20px' }}>
                <div className="pagination-info">
                  Showing <b>1</b> to <b>{history.length}</b> of <b>{history.length}</b> scans
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// String helper
String.prototype.capitalize = function() {
  return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
};

export default SoDScanHistory;
