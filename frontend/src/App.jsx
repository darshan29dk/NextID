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
import CloudDirectories from './pages/DataFoundation/CloudDirectories';
import CustomAttributes from './pages/DataFoundation/CustomAttributes';
import AttributeValidation from './pages/DataFoundation/AttributeValidation';
import ConnectorWorkspace from './pages/DataFoundation/ConnectorWorkspace';
import ApplicationWorkspace from './pages/DataFoundation/ApplicationWorkspace';
import IdentityWorkspace from './pages/DataFoundation/IdentityWorkspace';
import CorrelationWorkspace from './pages/DataFoundation/CorrelationWorkspace';
import RoleDiscoveryWorkspace from './pages/DataFoundation/RoleDiscoveryWorkspace';
import CandidateRoleWorkbench from './pages/RoleEngineering/CandidateRoleWorkbench';
import ApprovalWorkflows from './pages/Governance/ApprovalWorkflows';
import ApprovalRequests from './pages/Governance/ApprovalRequests';
import BusinessApproval from './pages/Governance/BusinessApproval';
import SecurityApproval from './pages/Governance/SecurityApproval';
import ApprovalRequestDetail from './pages/Governance/ApprovalRequestDetail';
import SoDPolicies from './pages/Governance/SoDPolicies';
import SoDViolations from './pages/Governance/SoDViolations';
import SoDViolationDetail from './pages/Governance/SoDViolationDetail';
import SoDScanHistory from './pages/Governance/SoDScanHistory';
import SoDExceptions from './pages/Governance/SoDExceptions';
import SoDExceptionDetail from './pages/Governance/SoDExceptionDetail';
import GovernanceDashboard from './pages/Governance/GovernanceDashboard';
import RevocationWorkspace from './pages/Governance/RevocationWorkspace';
import CascadeRevocation from './pages/Governance/CascadeRevocation';
import ComplianceReportWorkspace from './pages/Governance/ComplianceReportWorkspace';
import IdentityLineageWorkspace from './pages/Governance/IdentityLineageWorkspace';
import JMLWorkbench from './pages/JML/JMLWorkbench';
import PublishedRoles from './pages/RoleCatalog/PublishedRoles';
import BusinessRoles from './pages/RoleCatalog/BusinessRoles';
import TechnicalRoles from './pages/RoleCatalog/TechnicalRoles';
import RoleCatalogDetail from './pages/RoleCatalog/RoleCatalogDetail';
import ExecutiveDashboard from './pages/Analytics/ExecutiveDashboard';
import RoleAnalytics from './pages/Analytics/RoleAnalytics';
import CoverageReports from './pages/Analytics/CoverageReports';
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
                  <Route path="/data-foundation/custom" element={<CustomAttributes />} />
                  <Route path="/data-foundation/categories" element={<AttributeCategories />} />
                  <Route path="/data-foundation/sources/workspace" element={<ConnectorWorkspace />} />
                  <Route path="/data-foundation/applications" element={<ApplicationWorkspace />} />
                  <Route path="/data-foundation/identities" element={<IdentityWorkspace />} />
                  <Route path="/data-foundation/correlation" element={<IdentityWorkspace />} />
                  <Route path="/data-foundation/sources/cloud" element={<CloudDirectories />} />
                  <Route path="/data-foundation/sources/api-gateways" element={<Navigate to="/data-foundation/sources/workspace" replace />} />
                  <Route path="/data-foundation/validation" element={<AttributeValidation />} />

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
                  {/* ApprovalRequests is the unified inbox (Workflows / Requests / Business /
                      Security tabs, all in one component - it renders <ApprovalWorkflows> itself
                      for the "workflows" tab). These routes previously all redirected to the bare
                      config page instead of this hub, so the Requests/Business/Security tabs -
                      the actual "act on a submitted approval" screens - were unreachable. */}
                  <Route path="/governance/approval-workflows" element={<ApprovalRequests />} />
                  <Route path="/approval-workflow" element={<Navigate to="/approval-workflow/workflows" replace />} />
                  <Route path="/approval-workflow/workflows" element={<ApprovalRequests />} />
                  <Route path="/approval-workflow/requests" element={<ApprovalRequests />} />
                  <Route path="/approval-workflow/requests/:id" element={<ApprovalRequestDetail />} />
                  <Route path="/approval-workflow/business" element={<ApprovalRequests />} />
                  <Route path="/approval-workflow/security" element={<ApprovalRequests />} />
                  <Route path="/role-catalog" element={<Navigate to="/role-catalog/published" replace />} />
                  <Route path="/role-catalog/published" element={<PublishedRoles />} />
                  <Route path="/role-catalog/business" element={<PublishedRoles />} />
                  <Route path="/role-catalog/technical" element={<PublishedRoles />} />
                  <Route path="/role-catalog/:id" element={<RoleCatalogDetail />} />
                  {/* ── Identity Lifecycle (JML) ── */}
                  <Route path="/jml" element={<Navigate to="/jml/workbench" replace />} />
                  <Route path="/jml/workbench" element={<JMLWorkbench />} />
                  <Route path="/jml/joiners" element={<JMLWorkbench />} />
                  <Route path="/jml/movers" element={<JMLWorkbench />} />
                  <Route path="/jml/leavers" element={<JMLWorkbench />} />
                  <Route path="/jml/rehires" element={<JMLWorkbench />} />

                  <Route path="/governance" element={<Navigate to="/governance/dashboard" replace />} />
                  <Route path="/governance/dashboard" element={<GovernanceDashboard />} />
                  <Route path="/governance/sod-policies" element={<SoDPolicies />} />
                  <Route path="/governance/violations" element={<SoDViolations />} />
                  <Route path="/governance/violations/:id" element={<SoDViolationDetail />} />
                  <Route path="/governance/exceptions" element={<SoDExceptions />} />
                  <Route path="/governance/exceptions/:id" element={<SoDExceptionDetail />} />
                  <Route path="/governance/scan-history" element={<SoDScanHistory />} />
                  <Route path="/governance/jml" element={<Navigate to="/jml/workbench" replace />} />
                  <Route path="/governance/revocation" element={<RevocationWorkspace />} />
                  <Route path="/governance/cascade-revocation" element={<CascadeRevocation />} />
                  <Route path="/governance/compliance-reports" element={<ComplianceReportWorkspace />} />
                  <Route path="/governance/identity-lineage" element={<IdentityLineageWorkspace />} />
                  <Route path="/analytics" element={<Navigate to="/analytics/role-analytics" replace />} />
                  <Route path="/analytics/executive" element={<Navigate to="/analytics/role-analytics" replace />} />
                  <Route path="/analytics/role-analytics" element={<ExecutiveDashboard />} />
                  <Route path="/analytics/coverage-reports" element={<ExecutiveDashboard />} />

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

