import React, { useState, useEffect, useRef } from 'react';
import { Save, Lock, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../../components/Breadcrumb/Breadcrumb';
import { getSettings, updateSettings, uploadSettingsLogo, removeSettingsLogo, FILES_BASE_URL } from '../../../services/dashboardService';
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

const CATEGORIES = [
  { value: 'general', label: 'General Settings' },
  { value: 'smtp', label: 'SMTP Settings' },
  { value: 'personalization', label: 'Personalization' },
];

const DEFAULT_FORM = {
  support_email: '',
  default_timezone: 'Asia/Kolkata',
  session_timeout_minutes: 15,
  otp_expiry_minutes: 10,
  default_theme: 'light',
  maintenance_mode: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_password_set: false,
  smtp_from_email: '',
  smtp_from_name: '',
  smtp_use_tls: true,
  company_display_name: '',
  logo_path: '',
  primary_color: '#4a90d9',
};

const Settings = () => {
  const navigate = useNavigate();
  const [category, setCategory] = useState('general');
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await getSettings();
        setFormData(data ? { ...DEFAULT_FORM, ...data, smtp_password: '' } : DEFAULT_FORM);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setErrorMsg('Failed to load settings. Please check backend connection.');
        setFormData(DEFAULT_FORM);
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

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLogoUploading(true);
      setErrorMsg(null);
      const updated = await uploadSettingsLogo(file);
      setFormData((prev) => ({ ...prev, logo_path: updated.logo_path }));
      setSuccessMsg('Logo uploaded successfully.');
    } catch (err) {
      console.error('Failed to upload logo:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to upload logo.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleLogoRemove = async () => {
    try {
      setLogoRemoving(true);
      setErrorMsg(null);
      const updated = await removeSettingsLogo();
      setFormData((prev) => ({ ...prev, logo_path: updated.logo_path || '' }));
      setSuccessMsg('Logo removed.');
    } catch (err) {
      console.error('Failed to remove logo:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to remove logo.');
    } finally {
      setLogoRemoving(false);
    }
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
        smtp_host: formData.smtp_host,
        smtp_port: formData.smtp_port,
        smtp_username: formData.smtp_username,
        smtp_from_email: formData.smtp_from_email,
        smtp_from_name: formData.smtp_from_name,
        smtp_use_tls: formData.smtp_use_tls,
        company_display_name: formData.company_display_name,
        primary_color: formData.primary_color,
      };
      // Only send a new password if the user actually typed one - leaving it
      // blank keeps whatever's already stored instead of wiping it out.
      if (formData.smtp_password) {
        payload.smtp_password = formData.smtp_password;
      }

      const updated = await updateSettings(payload);
      setFormData({ ...DEFAULT_FORM, ...updated, smtp_password: '' });
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
          <p>Configure general platform behavior, SMTP, and personalization.</p>
        </div>
      </div>

      {errorMsg && <div className="error-banner" style={{ marginBottom: '16px' }}>{errorMsg}</div>}
      {successMsg && <div className="success-banner" style={{ marginBottom: '16px' }}>{successMsg}</div>}

      <div className="settings-tabs-nav">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`settings-tab-btn ${category === c.value ? 'active' : ''}`}
            onClick={() => { setCategory(c.value); setSuccessMsg(null); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="settings-card">
        {category === 'general' && (
          <>
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
          </>
        )}

        {category === 'smtp' && (
          <div className="settings-section">
            <h4>SMTP Settings</h4>
            <p className="field-hint" style={{ marginBottom: '16px' }}>
              Used to send OTP and notification emails. Leave the password field blank to keep the one already saved.
            </p>
            <div className="form-row-grid-2">
              <div className="input-group-custom">
                <label>SMTP Host</label>
                <input
                  type="text"
                  name="smtp_host"
                  value={formData.smtp_host || ''}
                  onChange={handleChange}
                  placeholder="e.g. smtp.gmail.com"
                />
              </div>
              <div className="input-group-custom">
                <label>SMTP Port</label>
                <input
                  type="number"
                  name="smtp_port"
                  min="1"
                  value={formData.smtp_port ?? ''}
                  onChange={handleNumberChange}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="form-row-grid-2">
              <div className="input-group-custom">
                <label>SMTP Username</label>
                <input
                  type="text"
                  name="smtp_username"
                  value={formData.smtp_username || ''}
                  onChange={handleChange}
                  placeholder="e.g. notifications@company.com"
                />
              </div>
              <div className="input-group-custom">
                <label>SMTP Password {formData.smtp_password_set && <span className="field-hint">(already set)</span>}</label>
                <input
                  type="password"
                  name="smtp_password"
                  value={formData.smtp_password || ''}
                  onChange={handleChange}
                  placeholder={formData.smtp_password_set ? '••••••••' : 'Enter password'}
                />
              </div>
            </div>
            <div className="form-row-grid-2">
              <div className="input-group-custom">
                <label>From Email</label>
                <input
                  type="email"
                  name="smtp_from_email"
                  value={formData.smtp_from_email || ''}
                  onChange={handleChange}
                  placeholder="e.g. no-reply@company.com"
                />
              </div>
              <div className="input-group-custom">
                <label>From Name</label>
                <input
                  type="text"
                  name="smtp_from_name"
                  value={formData.smtp_from_name || ''}
                  onChange={handleChange}
                  placeholder="e.g. rAnalyzer"
                />
              </div>
            </div>
            <div className="toggle-row">
              <div>
                <label>Use TLS</label>
                <span className="field-hint">Recommended for most providers (port 587).</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  name="smtp_use_tls"
                  checked={!!formData.smtp_use_tls}
                  onChange={handleChange}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        )}

        {category === 'personalization' && (
          <div className="settings-section">
            <h4>Personalization</h4>
            <div className="input-group-custom" style={{ marginBottom: '20px' }}>
              <label>Company Logo</label>
              <div className="logo-upload-row">
                <div className="logo-preview-box">
                  {formData.logo_path ? (
                    <img src={`${FILES_BASE_URL}/${formData.logo_path}`} alt="Company logo" />
                  ) : (
                    <ImageIcon size={24} className="text-muted" />
                  )}
                </div>
                <div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,.webp"
                    style={{ display: 'none' }}
                    onChange={handleLogoSelect}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      style={{ border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading || logoRemoving}
                    >
                      <Upload size={13} />
                      {logoUploading ? 'Uploading...' : 'Upload Logo'}
                    </button>
                    {formData.logo_path && (
                      <button
                        type="button"
                        className="btn-modal-cancel"
                        style={{ border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)' }}
                        onClick={handleLogoRemove}
                        disabled={logoUploading || logoRemoving}
                      >
                        <Trash2 size={13} />
                        {logoRemoving ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                  <p className="field-hint" style={{ marginTop: '6px' }}>PNG, JPG, SVG, or WEBP. Max 2MB.</p>
                </div>
              </div>
            </div>

            <div className="form-row-grid-2">
              <div className="input-group-custom">
                <label>Company Display Name</label>
                <input
                  type="text"
                  name="company_display_name"
                  value={formData.company_display_name || ''}
                  onChange={handleChange}
                  placeholder="Shown on the login page and header"
                />
              </div>
              <div className="input-group-custom">
                <label>Primary Brand Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    name="primary_color"
                    value={formData.primary_color || '#4a90d9'}
                    onChange={handleChange}
                    style={{ width: '44px', height: '38px', padding: '2px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    name="primary_color"
                    value={formData.primary_color || ''}
                    onChange={handleChange}
                    placeholder="#4a90d9"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

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
