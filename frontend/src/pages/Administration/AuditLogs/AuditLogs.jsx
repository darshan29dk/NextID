import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, RotateCcw, FileText, ChevronDown, ChevronUp, Download, FileSpreadsheet } from 'lucide-react';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import { getAuditLogs, getAuditLogModules, getAuditLogActions, getSettings } from '../../../services/dashboardService';
import './AuditLogs.css';

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
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

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportDropdownRef = useRef(null);

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

  // Close export dropdown when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  // Fetches every log row matching the CURRENT filters, ignoring pagination.
  // This is what makes "Export" mean "all filtered results", not just the
  // 10 rows currently visible on screen.
  const fetchAllFilteredLogs = async () => {
    const queryParams = {
      page: 1,
      limit: 10000,
      search: search.trim() || undefined,
      module: moduleFilter || undefined,
      action: actionFilter || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    };
    const response = await getAuditLogs(queryParams);
    return response.logs || [];
  };

  const buildExportRows = (allLogs) => {
    const headers = ["Module", "Action", "Performed By", "Timestamp", "Old Value", "New Value"];
    const rows = allLogs.map((log) => [
      log.module,
      log.action,
      log.performed_by,
      formatTimestamp(log.timestamp),
      log.old_value || '',
      log.new_value || ''
    ]);
    return { headers, rows };
  };

  const buildExportFilenameSuffix = () => {
    // Reflects the active module filter in the filename so exported files
    // are easy to tell apart, e.g. "identity_attributes" vs "all_modules".
    const modulePart = moduleFilter ? moduleFilter.toLowerCase().replace(/\s+/g, '_') : 'all_modules';
    return `${modulePart}_${new Date().toISOString().slice(0, 10)}`;
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const allLogs = await fetchAllFilteredLogs();
      const { headers, rows } = buildExportRows(allLogs);

      const csvContent = "data:text/csv;charset=utf-8,"
        + [headers.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `rAnalyzer_audit_logs_${buildExportFilenameSuffix()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export audit logs as CSV:', err);
      alert('Failed to export audit logs. Please try again.');
    } finally {
      setExporting(false);
      setShowExportDropdown(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const allLogs = await fetchAllFilteredLogs();
      const { headers, rows } = buildExportRows(allLogs);

      // Tab-delimited so Excel parses it cleanly as a spreadsheet.
      const excelContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `rAnalyzer_audit_logs_${buildExportFilenameSuffix()}.xls`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export audit logs as Excel:', err);
      alert('Failed to export audit logs. Please try again.');
    } finally {
      setExporting(false);
      setShowExportDropdown(false);
    }
  };

  return (
    <div className="audit-logs-page">
      <Breadcrumb items={[{ label: 'Administration', active: false }, { label: 'Audit Logs', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Audit Logs</h2>
          <p>Track every change made across the platform — who did what, and when.</p>
        </div>
        <div className="header-buttons-section">
          <div className="btn-export-dropdown-wrapper" ref={exportDropdownRef}>
            <button
              className="btn-export-select"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={exporting}
            >
              <Download size={14} />
              <span>{exporting ? 'Exporting...' : 'Export'}</span>
            </button>
            {showExportDropdown && (
              <div className="export-menu-dropdown">
                <button className="export-menu-item" onClick={handleExportCSV}>
                  <FileSpreadsheet size={13} /> Export CSV
                </button>
                <button className="export-menu-item" onClick={handleExportExcel}>
                  <FileSpreadsheet size={13} /> Export Excel
                </button>
              </div>
            )}
          </div>
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