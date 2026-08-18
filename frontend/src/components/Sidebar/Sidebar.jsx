import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Database, 
  Search, 
  Wrench, 
  BookOpen, 
  Shield, 
  ShieldCheck,
  History, 
  BarChart3, 
  Settings as SettingsIcon, 
  ChevronRight,
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
  Cpu,
  Target,
  Menu
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




const APPROVAL_WORKFLOW_GROUP_CHILDREN = [
  { label: 'Approval Workflows', icon: SlidersHorizontal, path: 'governance/approval-workflows' },
];



const GOVERNANCE_GROUP_CHILDREN = [
  { label: 'Risk Dashboard', icon: LayoutDashboard, path: 'governance/dashboard' },
  { label: 'SoD Policies', icon: Shield, path: 'governance/sod-policies' },
  { label: 'Violations', icon: ShieldAlert, path: 'governance/violations' },
  { label: 'Exceptions', icon: ShieldCheck, path: 'governance/exceptions' },
  { label: 'Scan History', icon: History, path: 'governance/scan-history' },
  { label: 'Revocation Engine', icon: Zap, path: 'governance/revocation' },
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


  const [isApprovalWorkflowOpen, setIsApprovalWorkflowOpen] = useState(
    APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath)
  );

  const [isGovernanceOpen, setIsGovernanceOpen] = useState(
    GOVERNANCE_GROUP_CHILDREN.some((child) => child.path === activePath)
  );


  useEffect(() => {
    if (ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsAttributesOpen(true);
    }


    if (APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsApprovalWorkflowOpen(true);
    }

    if (GOVERNANCE_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsGovernanceOpen(true);
    }

  }, [activePath]);

  const navItemsBefore = [
    { type: 'heading', label: 'ROLE DISCOVERY' },
    { type: 'item', label: 'Role Discovery', icon: Search, path: 'role-discovery' },
    { type: 'heading', label: 'ROLE LIFE CYCLE' },
    { type: 'item', label: 'Role Engineering', icon: Wrench, path: 'role-engineering/workbench' },
  ];

  const navItemsAfter = [
    { type: 'heading', label: 'ADMINISTRATION' },
    { type: 'item', label: 'Platform Users', icon: Users, path: 'administration/users' },
    { type: 'item', label: 'Platform Roles', icon: Key, path: 'administration/roles' },
    { type: 'item', label: 'Audit Logs', icon: FileText, path: 'administration/audit-logs' },
    { type: 'heading', label: 'SYSTEM' },
    { type: 'item', label: 'Settings', icon: SettingsIcon, path: 'system/settings' },
    { type: 'item', label: 'License Management', icon: KeyRound, path: 'system/license-management' }
  ];

  const isAttributesGroupActive = ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath);


  const isApprovalWorkflowGroupActive = APPROVAL_WORKFLOW_GROUP_CHILDREN.some((child) => child.path === activePath);

  const isGovernanceGroupActive = GOVERNANCE_GROUP_CHILDREN.some((child) => child.path === activePath);


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
        <button
          className="sidebar-toggle-brand-btn"
          onClick={toggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label="Toggle Sidebar"
        >
          <Menu size={16} />
        </button>
        <div className="logo-container">
          {!isCollapsed && (
            <div className="logo-text">
              <span className="brand-name">NextID</span>
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

        {/* Direct link for "Data Source" */}
        <div 
          className={`nav-item ${activePath === 'data-foundation/sources/workspace' ? 'active' : ''}`}
          onClick={() => navigate('/data-foundation/sources/workspace')}
        >
          <Database className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Data Source</span>}
        </div>

        {/* Direct link for "Application" */}
        <div 
          className={`nav-item ${activePath === 'data-foundation/applications' ? 'active' : ''}`}
          onClick={() => navigate('/data-foundation/applications')}
        >
          <Layers className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Application</span>}
        </div>

        {/* Direct link for "Identity Repository" */}
        <div 
          className={`nav-item ${activePath === 'data-foundation/identities' || activePath === 'data-foundation/correlation' ? 'active' : ''}`}
          onClick={() => navigate('/data-foundation/identities')}
        >
          <Fingerprint className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Identity Repository</span>}
        </div>

        {renderNavItems(navItemsBefore)}

        {/* Direct link for "Approval Workflows" */}
        <div 
          className={`nav-item ${activePath.startsWith('approval-workflow') || activePath.startsWith('governance/approval-workflows') ? 'active' : ''}`}
          onClick={() => navigate('/governance/approval-workflows')}
        >
          <ShieldAlert className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Approval Workflows</span>}
        </div>

        {/* Direct link for "Role Catalog" */}
        <div 
          className={`nav-item ${activePath.startsWith('role-catalog') ? 'active' : ''}`}
          onClick={() => navigate('/role-catalog/published')}
        >
          <BookOpen className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Role Catalog</span>}
        </div>

        {/* Collapsible "Governance" group */}
        {!isCollapsed && <div className="nav-heading">GOVERNANCE</div>}

        <div
          className={`nav-item ${isGovernanceGroupActive && !isGovernanceOpen ? 'active' : ''}`}
          onClick={() => {
            if (isCollapsed) {
              navigate('/' + GOVERNANCE_GROUP_CHILDREN[0].path);
            } else {
              setIsGovernanceOpen((prev) => !prev);
            }
          }}
        >
          <Shield className="nav-icon" size={18} />
          {!isCollapsed && (
            <>
              <span className="nav-label">Governance</span>
              {isGovernanceOpen
                ? <ChevronDown className="nav-arrow" size={12} />
                : <ChevronRight className="nav-arrow" size={12} />
              }
            </>
          )}
        </div>

        {!isCollapsed && isGovernanceOpen && (
          <div className="nav-sub-list">
            {GOVERNANCE_GROUP_CHILDREN.map((child) => {
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

        {/* Direct link for "Analytics" */}
        <div
          className={`nav-item ${activePath.startsWith('analytics') ? 'active' : ''}`}
          onClick={() => navigate('/analytics/role-analytics')}
        >
          <BarChart3 className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-label">Analytics</span>}
        </div>

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

    </aside>
  );
};

export default Sidebar;