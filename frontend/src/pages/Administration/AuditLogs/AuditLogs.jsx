import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RotateCcw, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import { getAuditLogs, getAuditLogModules, getAuditLogActions, getSettings } from '../../../services/dashboardService';
import './AuditLogs.css';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [modules, setModules] = useState([]);
  const [actions, setActions] = useState([]);

  const [timezone, setTimezone] = useState('Asia/Kolkata');

  useEffect(() => {
    const fetchTimezoneSetting = async () => {
      try {
        const settings = await getSettings();
        if (settings?.default_timezone) {
          setTimezone(settings.default_timezone);
        }
      } catch (err) {
        console.error('Could not load timezone setting, using default:', err);
      }
    };
    fetchTimezoneSetting();
  }, []);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [expandedRowId, setExpandedRowId] = useState(null);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [modRes, actRes] = await Promise.all([
          getAuditLogModules(),
          getAuditLogActions(),
        ]);
        setModules(modRes.modules || []);
        setActions(actRes.actions || []);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const queryParams = {
        page,
        limit,
        search: search.trim() || undefined,
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      };

      const response = await getAuditLogs(queryParams);
      setLogs(response.logs);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setErrorMsg('Failed to load audit logs. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, moduleFilter, actionFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchInput]);

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setModuleFilter('');
    setActionFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const toggleExpand = (id) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const formatTimestamp = (ts) => {
    // Backend sends UTC time without a timezone marker, so we explicitly
    // append 'Z' to tell JavaScript "this is UTC" — it will then correctly
    // convert to the configured timezone (from Settings) for display.
    const utcString = ts.endsWith('Z') ? ts : ts + 'Z';
    const d = new Date(utcString);
    return d.toLocaleString('en-US', { timeZone: timezone });
  };

  const prettyJson = (str) => {
    if (!str) return '—';
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  const actionBadgeClass = (action) => {
    const a = action.toLowerCase();
    if (a.includes('delete')) return 'action-badge delete';
    if (a.includes('create')) return 'action-badge create';
    if (a.includes('update') || a.includes('activate') || a.includes('deactivate')) return 'action-badge update';
    return 'action-badge default';
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-page-step ${page === i ? 'active' : ''}`}
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div className="audit-logs-page">
      <Breadcrumb items={[{ label: 'Administration', active: false }, { label: 'Audit Logs', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Audit Logs</h2>
          <p>Track every change made across the platform — who did what, and when.</p>
        </div>
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by module, action, or user..."
          />
        </div>

        <select
          className="filter-select"
          value={moduleFilter}
          onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <input
          type="date"
          className="filter-select"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
        />
        <input
          type="date"
          className="filter-select"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
        />

        {(searchInput || moduleFilter || actionFilter || startDate || endDate) && (
          <button className="btn-reset-filters" onClick={handleResetFilters}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reset Filters
          </button>
        )}
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="table-empty-container">
            <div className="delete-dialog-icon" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <FileText size={22} />
            </div>
            <div className="empty-state-text">
              <h4>No audit logs found</h4>
              <p>Try adjusting your search keywords or filter values.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Module</th>
                    <th>Action</th>
                    <th>Performed By</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr onClick={() => toggleExpand(log.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ width: '32px' }}>
                          {expandedRowId === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                        <td>{log.module}</td>
                        <td>
                          <span className={actionBadgeClass(log.action)}>{log.action}</span>
                        </td>
                        <td>{log.performed_by}</td>
                        <td>{formatTimestamp(log.timestamp)}</td>
                      </tr>
                      {expandedRowId === log.id && (
                        <tr className="audit-log-detail-row">
                          <td colSpan={5}>
                            <div className="audit-log-detail-grid">
                              <div>
                                <h5>Old Value</h5>
                                <pre>{prettyJson(log.old_value)}</pre>
                              </div>
                              <div>
                                <h5>New Value</h5>
                                <pre>{prettyJson(log.new_value)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-footer">
              <span className="pagination-info">
                Showing <b>{Math.min(total, (page - 1) * limit + 1)}</b> to <b>{Math.min(total, page * limit)}</b> of <b>{total}</b> audit logs
              </span>

              <div className="pagination-controls">
                <button
                  className="btn-page-step"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>
                {renderPageNumbers()}
                <button
                  className="btn-page-step"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;