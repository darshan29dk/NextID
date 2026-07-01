import React from 'react';
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
  Settings, 
  ChevronRight, 
  ChevronLeft,
  Server
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ isCollapsed, toggleCollapse }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = location.pathname.substring(1) || 'dashboard';

  const navItems = [
    { type: 'heading', label: 'DATA FOUNDATION' },
    { type: 'item', label: 'Data Foundation', icon: Database, path: 'data-foundation', hasSub: true },
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
    { type: 'item', label: 'Administration', icon: Settings, path: 'administration', hasSub: true }
  ];

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="logo-container">
          <div className="logo-icon">
            <Server size={18} />
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
