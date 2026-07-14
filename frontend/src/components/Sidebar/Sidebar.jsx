import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Database, 
  Search, 
  Wrench, 
  BookOpen, 
  Shield, 
  History, 
  BarChart3, 
  Settings as SettingsIcon, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  Server,
  Users,
  Key,
  FileText,
  KeyRound,
  Monitor,
  Layers,
  ShieldAlert,
  FolderTree,
  BadgeCheck,
  Settings2,
  SlidersHorizontal,
  User,
  Fingerprint,
  Link2,
  Briefcase,
  Cpu
} from 'lucide-react';
import './Sidebar.css';

// The 5 attribute-related pages, now grouped under one collapsible parent
// instead of appearing as separate top-level sidebar entries.
const ATTRIBUTE_GROUP_CHILDREN = [
  { label: 'Identity Attributes', icon: Users, path: 'data-foundation/identity' },
  { label: 'Account Attributes', icon: Database, path: 'data-foundation/account' },
  { label: 'Entitlement Attributes', icon: Shield, path: 'data-foundation/entitlement' },
  { label: 'Role Attributes', icon: Users, path: 'data-foundation/role' },
  { label: 'Attribute Categories', icon: FolderTree, path: 'data-foundation/categories' },
];

const DATA_SOURCES_GROUP_CHILDREN = [
  { label: 'Connector Workspace', icon: Server, path: 'data-foundation/sources/workspace' },
];
const APPLICATIONS_GROUP_CHILDREN = [
  { label: 'Application Workspace', icon: Server, path: 'data-foundation/applications' },
];
const IDENTITY_GROUP_CHILDREN = [
  { label: 'Identity Workspace', icon: User, path: 'data-foundation/identities' },
  { label: 'Correlation Workspace', icon: Link2, path: 'data-foundation/correlation' }
];

const APPROVAL_WORKFLOW_GROUP_CHILDREN = [
  { label: 'Approval Requests', icon: FileText, path: 'approval-workflow/requests' },
  { label: 'Business Approval', icon: BadgeCheck, path: 'approval-workflow/business' },
  { label: 'Security Approval', icon: KeyRound, path: 'approval-workflow/security' },
];

const ROLE_CATALOG_GROUP_CHILDREN = [
  { label: 'Published Roles', icon: BookOpen, path: 'role-catalog/published' },
  { label: 'Business Roles', icon: Briefcase, path: 'role-catalog/business' },
  { label: 'Technical Roles', icon: Cpu, path: 'role-catalog/technical' },
];

const Sidebar = ({ isCollapsed, toggleCollapse }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname.substring(1) || 'dashboard';

  // Whether the "Attributes" group is expanded. Auto-expanded below if the
  // current route is one of its children, so landing directly on e.g.
  // Role Attributes doesn't hide that you're inside the group.
  const [isAttributesOpen, setIsAttributesOpen] = useState(
    ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath)
  );
  const [isDataSourcesOpen, setIsDataSourcesOpen] = useState(
    DATA_SOURCES_GROUP_CHILDREN.some((child) => child.path === activePath)
  );
  const [isApplicationsOpen, setIsApplicationsOpen] = useState(
    APPLICATIONS_GROUP_CHILDREN.some((child) => child.path === activePath)
  );
  const [isIdentityOpen, setIsIdentityOpen] = useState(
    IDENTITY_GROUP_CHILDREN.some((child) => child.path === activePath)
  );
  const [isApprovalWorkflowOpen, setIsApprovalWorkflowOpen] = useState(
    APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath)
  );
  const [isRoleCatalogOpen, setIsRoleCatalogOpen] = useState(
    ROLE_CATALOG_GROUP_CHILDREN.some((child) => child.path === activePath)
  );

  useEffect(() => {
    if (ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsAttributesOpen(true);
    }
    if (DATA_SOURCES_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsDataSourcesOpen(true);
    }
    if (APPLICATIONS_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsApplicationsOpen(true);
    }
    if (IDENTITY_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsIdentityOpen(true);
    }
    if (APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsApprovalWorkflowOpen(true);
    }
    if (ROLE_CATALOG_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsRoleCatalogOpen(true);
    }
  }, [activePath]);

  const navItemsBefore = [
    { type: 'heading', label: 'ROLE DISCOVERY' },
    { type: 'item', label: 'Role Discovery', icon: Search, path: 'role-discovery', hasSub: true },
    { type: 'heading', label: 'ROLE ENGINEERING' },
    { type: 'item', label: 'Role Engineering', icon: Wrench, path: 'role-engineering/workbench' },
  ];

  const navItemsAfter = [
    { type: 'heading', label: 'GOVERNANCE' },
    { type: 'item', label: 'Governance', icon: Shield, path: 'governance', hasSub: true },
    { type: 'heading', label: 'ROLE LIFECYCLE' },
    { type: 'item', label: 'Role Lifecycle', icon: History, path: 'role-lifecycle', hasSub: true },
    { type: 'heading', label: 'ANALYTICS' },
    { type: 'item', label: 'Analytics', icon: BarChart3, path: 'analytics', hasSub: true },
    { type: 'heading', label: 'ADMINISTRATION' },
    { type: 'item', label: 'Platform Users', icon: Users, path: 'administration/users' },
    { type: 'item', label: 'Platform Roles', icon: Key, path: 'administration/roles' },
    { type: 'item', label: 'Audit Logs', icon: FileText, path: 'administration/audit-logs' },
    { type: 'heading', label: 'SYSTEM' },
    { type: 'item', label: 'Settings', icon: SettingsIcon, path: 'system/settings' },
    { type: 'item', label: 'License Management', icon: KeyRound, path: 'system/license-management' }
  ];

  const isAttributesGroupActive = ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath);
  const isDataSourcesGroupActive = DATA_SOURCES_GROUP_CHILDREN.some((child) => child.path === activePath);
  const isApplicationsGroupActive = APPLICATIONS_GROUP_CHILDREN.some((child) => child.path === activePath);
  const isIdentityGroupActive = IDENTITY_GROUP_CHILDREN.some((child) => child.path === activePath);
  const isApprovalWorkflowGroupActive = APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath);
  const isRoleCatalogGroupActive = ROLE_CATALOG_GROUP_CHILDREN.some((child) => child.path === activePath);

  // Reusable renderer for flat nav item arrays
  const renderNavItems = (items) => items.map((item, idx) => {
    if (item.type === 'heading') {
      if (isCollapsed) return null;
      return <div key={`heading-${idx}`} className="nav-heading">{item.label}</div>;
    }
    const Icon = item.icon;
    const isDisabled = item.disabled;
    return (
      <div
        key={`item-${idx}`}
        className={`nav-item ${activePath === item.path ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
        onClick={() => { if (!isDisabled) navigate('/' + item.path); }}
        style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
      >
        <Icon className="nav-icon" size={18} />
        {!isCollapsed && (
          <>
            <span className="nav-label">{item.label}</span>
            {item.hasSub && <ChevronRight className="nav-arrow" size={12} />}
          </>
        )}
      </div>
    );
  });
  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="logo-container">
          <div className="logo-icon">
            <img src="/logo.jpg" alt="rAnalyzer Logo" className="logo-image" />
          </div>
          {!isCollapsed && (
            <div className="logo-text">
              <span className="brand-name">rAnalyzer</span>
              <span className="brand-sub">ROLE INTELLIGENCE PLATFORM</span>
            </div>
          )}
        </div>
      </div>

      <nav className="nav-list">
        <div 
          className={`nav-item ${activePath === 'dashboard' ? 'active' : ''}`}
          onClick={() => navigate('/dashboard')}
        >
          <LayoutDashboard className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Dashboard</span>}
        </div>

        {!isCollapsed && <div className="nav-heading">DATA FOUNDATION</div>}

        {/* Collapsible "Attributes" group */}
        <div
          className={`nav-item ${isAttributesGroupActive && !isAttributesOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              // If the sidebar itself is collapsed, just go to the first child
              navigate('/' + ATTRIBUTE_GROUP_CHILDREN[0].path);
            } else {
              setIsAttributesOpen((prev) => !prev);
            }
          }}
        >
          <SlidersHorizontal className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Attributes</span>
              {isAttributesOpen ? (
                <ChevronDown className="nav-arrow" size={12} />
              ) : (
                <ChevronRight className="nav-arrow" size={12} />
              )}
            </>
          )}
        </div>

        {!isCollapsed && isAttributesOpen && (
          <div className="nav-sub-list">
            {ATTRIBUTE_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''}`}
                  onClick={() => navigate('/' + child.path)}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible "Data Sources" group */}
        <div
          className={`nav-item ${isDataSourcesGroupActive && !isDataSourcesOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + DATA_SOURCES_GROUP_CHILDREN[0].path);
            } else {
              setIsDataSourcesOpen((prev) => !prev);
            }
          }}
        >
          <Database className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Data Sources</span>
              {isDataSourcesOpen ? (
                <ChevronDown className="nav-arrow" size={12} />
              ) : (
                <ChevronRight className="nav-arrow" size={12} />
              )}
            </>
          )}
        </div>

        {!isCollapsed && isDataSourcesOpen && (
          <div className="nav-sub-list">
            {DATA_SOURCES_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''}`}
                  onClick={() => navigate('/' + child.path)}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}
        {/* Collapsible "Applications" group */}
        <div
          className={`nav-item ${isApplicationsGroupActive && !isApplicationsOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + APPLICATIONS_GROUP_CHILDREN[0].path);
            } else {
              setIsApplicationsOpen((prev) => !prev);
            }
          }}
        >
          <Layers className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Applications</span>
              {isApplicationsOpen ? (
                <ChevronDown className="nav-arrow" size={12} />
              ) : (
                <ChevronRight className="nav-arrow" size={12} />
              )}
            </>
          )}
        </div>

        {!isCollapsed && isApplicationsOpen && (
          <div className="nav-sub-list">
            {APPLICATIONS_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''}`}
                  onClick={() => navigate('/' + child.path)}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible "Identity Repository" group */}
        <div
          className={`nav-item ${isIdentityGroupActive && !isIdentityOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + IDENTITY_GROUP_CHILDREN[0].path);
            } else {
              setIsIdentityOpen((prev) => !prev);
            }
          }}
        >
          <Fingerprint className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Identity Repository</span>
              {isIdentityOpen ? (
                <ChevronDown className="nav-arrow" size={12} />
              ) : (
                <ChevronRight className="nav-arrow" size={12} />
              )}
            </>
          )}
        </div>

        {!isCollapsed && isIdentityOpen && (
          <div className="nav-sub-list">
            {IDENTITY_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''}`}
                  onClick={() => navigate('/' + child.path)}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {renderNavItems(navItemsBefore)}

        {/* Collapsible "Approval Workflow" group */}
        {!isCollapsed && <div className="nav-heading">APPROVAL WORKFLOW</div>}

        <div
          className={`nav-item ${isApprovalWorkflowGroupActive && !isApprovalWorkflowOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + APPROVAL_WORKFLOW_GROUP_CHILDREN[0].path);
            } else {
              setIsApprovalWorkflowOpen((prev) => !prev);
            }
          }}
        >
          <ShieldAlert className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Approval Workflow</span>
              {isApprovalWorkflowOpen
                ? <ChevronDown className="nav-arrow" size={12} />
                : <ChevronRight className="nav-arrow" size={12} />
              }
            </>
          )}
        </div>

        {!isCollapsed && isApprovalWorkflowOpen && (
          <div className="nav-sub-list">
            {APPROVAL_WORKFLOW_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              const isDisabled = child.disabled;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => { if (!isDisabled) navigate('/' + child.path); }}
                  style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible "Role Catalog" group */}
        {!isCollapsed && <div className="nav-heading">ROLE CATALOG</div>}

        <div
          className={`nav-item ${isRoleCatalogGroupActive && !isRoleCatalogOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + ROLE_CATALOG_GROUP_CHILDREN[0].path);
            } else {
              setIsRoleCatalogOpen((prev) => !prev);
            }
          }}
        >
          <BookOpen className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Role Catalog</span>
              {isRoleCatalogOpen
                ? <ChevronDown className="nav-arrow" size={12} />
                : <ChevronRight className="nav-arrow" size={12} />
              }
            </>
          )}
        </div>

        {!isCollapsed && isRoleCatalogOpen && (
          <div className="nav-sub-list">
            {ROLE_CATALOG_GROUP_CHILDREN.map((child) => {
              const ChildIcon = child.icon;
              return (
                <div
                  key={child.path}
                  className={`nav-item nav-sub-item ${activePath === child.path ? 'active' : ''}`}
                  onClick={() => navigate('/' + child.path)}
                >
                  <ChildIcon className="nav-icon" size={16} />
                  <span className="nav-label">{child.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {renderNavItems(navItemsAfter)}
      </nav>

      <div className="sidebar-footer">
        {!isCollapsed ? (
          <>
            <span className="footer-status">Production</span>
            <span className="footer-version">v1.0</span>
          </>
        ) : (
          <span className="footer-status-dot">●</span>
        )}
      </div>

      <button className="sidebar-toggle-btn" onClick={toggleCollapse} aria-label="Toggle Sidebar">
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
};

export default Sidebar;