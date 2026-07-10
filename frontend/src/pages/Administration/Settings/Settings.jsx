import React, { useState, useEffect } from 'react';
import { Save, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import { getSettings, updateSettings } from '../../../services/dashboardService';
import './Settings.css';

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Tokyo',
];

const APP_NAME = 'rAnalyzer';

const Settings = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await getSettings();
        setFormData(data || {
          support_email: '',
          default_timezone: 'Asia/Kolkata',
          session_timeout_minutes: 15,
          otp_expiry_minutes: 10,
          default_theme: 'light',
          maintenance_mode: false,
        });
      } catch (err) {
        console.error('Failed to load settings:', err);
        setErrorMsg('Failed to load settings. Please check backend connection.');
        setFormData({
          support_email: '',
          default_timezone: 'Asia/Kolkata',
          session_timeout_minutes: 15,
          otp_expiry_minutes: 10,
          default_theme: 'light',
          maintenance_mode: false,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setSuccessMsg(null);
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value === '' ? '' : parseInt(value, 10),
    }));
    setSuccessMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const payload = {
        app_name: APP_NAME,
        support_email: formData.support_email,
        default_timezone: formData.default_timezone,
        session_timeout_minutes: formData.session_timeout_minutes,
        otp_expiry_minutes: formData.otp_expiry_minutes,
        default_theme: formData.default_theme,
        maintenance_mode: formData.maintenance_mode,
      };

      const updated = await updateSettings(payload);
      setFormData(updated);
      setSuccessMsg('Settings saved successfully.');

      // Apply the theme immediately, same way DashboardLayout does,
      // so the change is visible without needing a page reload.
      if (updated.default_theme) {
        localStorage.setItem('theme', updated.default_theme);
        document.body.className = `theme-${updated.default_theme}`;
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <Breadcrumb items={[{ label: 'System', active: false }, { label: 'Settings', active: true }]} />
        <div className="table-loading-container">
          <div className="spinner-element"></div>
          <p className="text-muted" style={{ fontSize: '13px' }}>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <Breadcrumb items={[{ label: 'System', active: false }, { label: 'Settings', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Settings</h2>
          <p>Configure general platform behavior, security, and defaults.</p>
        </div>
      </div>

      {errorMsg && <div className="error-banner" style={{ marginBottom: '16px' }}>{errorMsg}</div>}
      {successMsg && <div className="success-banner" style={{ marginBottom: '16px' }}>{successMsg}</div>}

      <form onSubmit={handleSubmit} className="settings-card">
        <div className="settings-section">
          <h4>General</h4>
          <div className="form-row-grid-2">
            <div className="input-group-custom">
              <label>Tool Name</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: '15px',
                  padding: '10px 14px',
                  background: 'var(--bg-hover)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <span>{APP_NAME}</span>
                <Lock size={14} className="text-muted" />
              </div>
            </div>
            <div className="input-group-custom">
              <label>Support Email</label>
              <input
                type="email"
                name="support_email"
                value={formData.support_email || ''}
                onChange={handleChange}
                placeholder="e.g. support@company.com"
              />
            </div>
          </div>

          <div className="form-row-grid-2">
            <div className="input-group-custom">
              <label>Default Timezone</label>
              <select name="default_timezone" value={formData.default_timezone || ''} onChange={handleChange}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div className="input-group-custom">
              <label>Default Theme (for new users)</label>
              <select name="default_theme" value={formData.default_theme || ''} onChange={handleChange}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h4>Security</h4>
          <div className="form-row-grid-2">
            <div className="input-group-custom">
              <label>Session Timeout (minutes)</label>
              <input
                type="number"
                name="session_timeout_minutes"
                min="1"
                value={formData.session_timeout_minutes ?? ''}
                onChange={handleNumberChange}
              />
              <span className="field-hint">How long a user can stay inactive before being auto-logged-out.</span>
            </div>
            <div className="input-group-custom">
              <label>OTP Expiry (minutes)</label>
              <input
                type="number"
                name="otp_expiry_minutes"
                min="1"
                value={formData.otp_expiry_minutes ?? ''}
                onChange={handleNumberChange}
              />
              <span className="field-hint">How long a password-reset OTP remains valid.</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h4>Platform</h4>
          <div className="toggle-row">
            <div>
              <label>Maintenance Mode</label>
              <span className="field-hint">When enabled, non-admin users will see a maintenance notice instead of the app.</span>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                name="maintenance_mode"
                checked={!!formData.maintenance_mode}
                onChange={handleChange}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>Account</h4>
          <div className="toggle-row">
            <div>
              <label>My Profile</label>
              <span className="field-hint">View your name, email, and role.</span>
            </div>
            <button
              type="button"
              className="btn-modal-cancel"
              style={{ border: '1px solid var(--border-color)' }}
              onClick={() => navigate('/profile')}
            >
              View Profile
            </button>
          </div>
        </div>

        <div className="settings-footer">
          {formData.updated_by && (
            <span className="last-updated-text">
              Last updated by <b>{formData.updated_by}</b>
            </span>
          )}
          <button type="submit" className="btn-modal-submit" disabled={saving}>
            <Save size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;