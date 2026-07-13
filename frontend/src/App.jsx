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
import IdentityAttributes from './pages/Administration/IdentityAttributes';
import AccountAttributes from './pages/Administration/AccountAttributes';
import EntitlementAttributes from './pages/Administration/EntitlementAttributes';
import RoleAttributes from './pages/Administration/RoleAttributes';
import AttributeCategories from './pages/DataFoundation/AttributeCategories';
import ConnectorWorkspace from './pages/DataFoundation/ConnectorWorkspace';
import ApplicationWorkspace from './pages/DataFoundation/ApplicationWorkspace';
import IdentityWorkspace from './pages/DataFoundation/IdentityWorkspace';
import CorrelationWorkspace from './pages/DataFoundation/CorrelationWorkspace';
import RoleDiscoveryWorkspace from './pages/DataFoundation/RoleDiscoveryWorkspace';
import CandidateRoleWorkbench from './pages/RoleEngineering/CandidateRoleWorkbench';
import ApprovalRequests from './pages/Governance/ApprovalRequests';
import BusinessApproval from './pages/Governance/BusinessApproval';
import SecurityApproval from './pages/Governance/SecurityApproval';
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

                  {/* ── Data Foundation (new canonical routes) ── */}
                  <Route path="/data-foundation/identity" element={<IdentityAttributes />} />
                  <Route path="/data-foundation/account" element={<AccountAttributes />} />
                  <Route path="/data-foundation/entitlement" element={<EntitlementAttributes />} />
                  <Route path="/data-foundation/role" element={<RoleAttributes />} />
                  <Route path="/data-foundation/custom" element={<UnderConstruction title="Custom Attributes" />} />
                  <Route path="/data-foundation/categories" element={<AttributeCategories />} />
                  <Route path="/data-foundation/sources/workspace" element={<ConnectorWorkspace />} />
                  <Route path="/data-foundation/applications" element={<ApplicationWorkspace />} />
                  <Route path="/data-foundation/identities" element={<IdentityWorkspace />} />
                  <Route path="/data-foundation/correlation" element={<CorrelationWorkspace />} />
                  <Route path="/data-foundation/sources/cloud" element={<UnderConstruction title="Cloud Directories" />} />
                  <Route path="/data-foundation/sources/api-gateways" element={<Navigate to="/data-foundation/sources/workspace" replace />} />
                  <Route path="/data-foundation/validation" element={<UnderConstruction title="Attribute Validation" />} />

                  {/* ── Legacy redirects – preserve old bookmarks ── */}
                  <Route path="/attribute-management/identity"    element={<Navigate to="/data-foundation/identity"    replace />} />
                  <Route path="/attribute-management/account"     element={<Navigate to="/data-foundation/account"     replace />} />
                  <Route path="/attribute-management/entitlement" element={<Navigate to="/data-foundation/entitlement" replace />} />
                  <Route path="/attribute-management/roles"       element={<Navigate to="/data-foundation/role"        replace />} />
                  <Route path="/attribute-management/custom"      element={<Navigate to="/data-foundation/custom"      replace />} />
                  <Route path="/attribute-management/categories"  element={<Navigate to="/data-foundation/categories"  replace />} />
                  <Route path="/attribute-management/validation"  element={<Navigate to="/data-foundation/validation"  replace />} />

                  {/* ── Other modules (under construction) ── */}
                  <Route path="/data-foundation" element={<Navigate to="/data-foundation/identity" replace />} />
                  <Route path="/role-discovery" element={<RoleDiscoveryWorkspace />} />
                  <Route path="/role-engineering" element={<Navigate to="/role-engineering/workbench" replace />} />
                  <Route path="/role-engineering/workbench" element={<CandidateRoleWorkbench />} />
                  <Route path="/approval-workflow/requests" element={<ApprovalRequests />} />
                  <Route path="/approval-workflow/business" element={<BusinessApproval />} />
                  <Route path="/approval-workflow/security" element={<SecurityApproval />} />
                  <Route path="/role-catalog" element={<UnderConstruction title="Role Catalog" />} />
                  <Route path="/governance" element={<Navigate to="/approval-workflow/requests" replace />} />
                  <Route path="/role-lifecycle" element={<UnderConstruction title="Role Lifecycle" />} />
                  <Route path="/analytics" element={<UnderConstruction title="Analytics" />} />

                  {/* ── Administration ── */}
                  <Route path="/administration" element={<Navigate to="/administration/users" replace />} />
                  <Route path="/administration/users" element={<PlatformUsers />} />
                  <Route path="/administration/roles" element={<PlatformRoles />} />
                  <Route path="/administration/audit-logs" element={<AuditLogs />} />

                  {/* ── System ── */}
                  <Route path="/system/settings" element={<Settings />} />
                  <Route path="/system/license-management" element={<LicenseManagement />} />

                  <Route path="/profile" element={<Profile />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
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

