import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout/DashboardLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import Login from './pages/Login/Login';
import ForgotPassword from './pages/ForgotPassword/ForgotPassword';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import PlatformUsers from './pages/Administration/PlatformUsers';
import PlatformRoles from './pages/Administration/PlatformRoles';
import AuditLogs from './pages/Administration/AuditLogs/AuditLogs';
import Settings from './pages/Administration/Settings/Settings';
import LicenseManagement from './pages/System/LicenseManagement/LicenseManagement';
import Profile from './pages/Profile/Profile';
// import MenuPermissions from './pages/Administration/MenuPermissions';

const UnderConstruction = ({ title }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--border-radius)',
      boxShadow: 'var(--shadow-sm)',
      textAlign: 'center',
      minHeight: '400px'
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
        {title} Module Under Construction
      </h3>
      <p style={{ 
        color: 'var(--text-muted)', 
        marginTop: '8px', 
        fontSize: '13px',
        maxWidth: '400px',
        lineHeight: 1.5
      }}>
        This feature is part of upcoming build phases. Identity Governance mechanisms (ETL analysis, role engineering, SoD matrices) are currently locked.
      </p>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/data-foundation" element={<UnderConstruction title="Data Foundation" />} />
                  <Route path="/role-discovery" element={<UnderConstruction title="Role Discovery" />} />
                  <Route path="/role-engineering" element={<UnderConstruction title="Role Engineering" />} />
                  <Route path="/role-catalog" element={<UnderConstruction title="Role Catalog" />} />
                  <Route path="/governance" element={<UnderConstruction title="Governance" />} />
                  <Route path="/role-lifecycle" element={<UnderConstruction title="Role Lifecycle" />} />
                  <Route path="/analytics" element={<UnderConstruction title="Analytics" />} />
                  <Route path="/administration" element={<Navigate to="/administration/users" replace />} />
                  <Route path="/administration/users" element={<PlatformUsers />} />
                  <Route path="/administration/roles" element={<PlatformRoles />} />
                  <Route path="/administration/audit-logs" element={<AuditLogs />} />
                  <Route path="/system/settings" element={<Settings />} />
                  <Route path="/system/license-management" element={<LicenseManagement />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/profile" element={<Profile />} />
                </Routes>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;