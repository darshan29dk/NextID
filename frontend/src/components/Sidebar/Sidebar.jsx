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
  SlidersHorizontal
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

  useEffect(() => {
    if (ATTRIBUTE_GROUP_CHILDREN.some((child) => child.path === activePath)) {
      setIsAttributesOpen(true);
    }
  }, [activePath]);

  const navItems = [
    { type: 'heading', label: 'ROLE DISCOVERY' },
    { type: 'item', label: 'Role Discovery', icon: Search, path: 'role-discovery', hasSub: true },
    { type: 'heading', label: 'ROLE ENGINEERING' },
    { type: 'item', label: 'Role Engineering', icon: Wrench, path: 'role-engineering', hasSub: true },
    { type: 'heading', label: 'ROLE CATALOG' },
    { type: 'item', label: 'Role Catalog', icon: BookOpen, path: 'role-catalog', hasSub: true },
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

        {navItems.map((item, idx) => {
          if (item.type === 'heading') {
            if (isCollapsed) return null;
            return <div key={`heading-${idx}`} className="nav-heading">{item.label}</div>;
          }
          const Icon = item.icon;
          return (
            <div 
              key={`item-${idx}`} 
              className={`nav-item ${activePath === item.path ? 'active' : ''}`}
              onClick={() => navigate('/' + item.path)}
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
        })}
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