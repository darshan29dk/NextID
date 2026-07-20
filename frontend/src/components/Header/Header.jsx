import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Bell, Sun, Moon, LogOut, User as UserIcon, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { markNotificationRead, markAllNotificationsRead } from '../../services/dashboardService';
import './Header.css';

// Static list of searchable pages, built from the real routes in App.jsx.
// Under-construction placeholder pages are intentionally excluded since
// navigating to them wouldn't be useful.
const SEARCHABLE_PAGES = [
  { name: 'Dashboard', route: '/dashboard', keywords: ['home', 'overview'] },
  { name: 'Identity Attributes', route: '/data-foundation/identity', keywords: ['identity', 'attributes'] },
  { name: 'Account Attributes', route: '/data-foundation/account', keywords: ['account', 'attributes'] },
  { name: 'Entitlement Attributes', route: '/data-foundation/entitlement', keywords: ['entitlement', 'attributes'] },
  { name: 'Role Attributes', route: '/data-foundation/role', keywords: ['role', 'attributes'] },
  { name: 'Attribute Categories', route: '/data-foundation/categories', keywords: ['categories', 'attribute'] },
  { name: 'Platform Users', route: '/administration/users', keywords: ['users', 'admin', 'administration'] },
  { name: 'Platform Roles', route: '/administration/roles', keywords: ['roles', 'admin', 'administration'] },
  { name: 'Audit Logs', route: '/administration/audit-logs', keywords: ['audit', 'logs', 'history'] },
  { name: 'Settings', route: '/system/settings', keywords: ['settings', 'configuration', 'preferences'] },
  { name: 'License Management', route: '/system/license-management', keywords: ['license', 'licenses', 'licensing'] },
  { name: 'My Profile', route: '/profile', keywords: ['profile', 'account', 'me'] },
];

const Header = ({ 
  theme, 
  toggleTheme, 
  profile, 
  notifications = []
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);

  // Local mirror of the notifications prop so read/unread state can update
  // instantly on click without waiting on the parent to refetch.
  const [localNotifications, setLocalNotifications] = useState(notifications);
  useEffect(() => { setLocalNotifications(notifications); }, [notifications]);

  const handleNotificationClick = async (id) => {
    setLocalNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, status: 'read' })));
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  
  const { logout } = useAuth();
  const navigate = useNavigate();

  const profileRef = useRef(null);
  const notificationRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = localNotifications.filter(n => n.status === 'unread').length;

  const handleGoToProfile = () => {
    setShowProfileMenu(false);
    navigate('/profile');
  };

  // Filters the searchable pages list against the current query, matching
  // against both the page name and its keyword aliases.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCHABLE_PAGES.filter((page) => {
      const nameMatch = page.name.toLowerCase().includes(q);
      const keywordMatch = page.keywords.some((k) => k.includes(q));
      return nameMatch || keywordMatch;
    });
  }, [searchQuery]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setShowSearchDropdown(true);
    setActiveResultIndex(0);
  };

  const handleSelectResult = (route) => {
    navigate(route);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowSearchDropdown(false);
      return;
    }
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectResult(searchResults[activeResultIndex].route);
    }
  };

  return (
    <header className="header">
      <div className="search-container" ref={searchRef} style={{ position: 'relative' }}>
        <Search className="search-icon" size={16} />
        <input 
          type="text" 
          placeholder="Search roles, identities..." 
          className="search-input"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => searchQuery && setShowSearchDropdown(true)}
          onKeyDown={handleSearchKeyDown}
        />
        <kbd className="search-kbd">Ctrl+K</kbd>

        {showSearchDropdown && searchQuery && (
          <div className="search-results-dropdown">
            {searchResults.length === 0 ? (
              <div className="search-no-results">No matching pages found.</div>
            ) : (
              searchResults.map((page, idx) => (
                <button
                  key={page.route}
                  className={`search-result-item ${idx === activeResultIndex ? 'active' : ''}`}
                  onClick={() => handleSelectResult(page.route)}
                  onMouseEnter={() => setActiveResultIndex(idx)}
                >
                  {page.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="header-actions">
        <button className="action-btn" onClick={toggleTheme} title="Toggle Theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="dropdown-container" ref={notificationRef}>
          <button 
            className="action-btn notification-btn" 
            onClick={() => setShowNotificationMenu(!showNotificationMenu)}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>
          
          {showNotificationMenu && (
            <div className="dropdown-menu notification-menu">
              <div className="menu-header">
                <h4>Notifications</h4>
                {unreadCount > 0 ? (
                  <button className="mark-all-read-btn" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                ) : null}
              </div>
              <div className="notifications-list">
                {localNotifications.length === 0 ? (
                  <div className="empty-state">No new notifications</div>
                ) : (
                  localNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`notification-item ${notif.status}`}
                      onClick={() => notif.status === 'unread' && handleNotificationClick(notif.id)}
                      style={{ cursor: notif.status === 'unread' ? 'pointer' : 'default' }}
                    >
                      <div className="notification-dot"></div>
                      <div className="notification-content">
                        <p className="notification-title">{notif.title}</p>
                        <p className="notification-desc">{notif.message}</p>
                        <span className="notification-time">
                          {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="header-divider"></div>

        <div className="dropdown-container" ref={profileRef}>
          <div 
            className="profile-trigger" 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="user-avatar-circle">
              {profile.avatar && profile.avatar.length <= 2 ? (
                <span>{profile.avatar}</span>
              ) : (
                <img src={profile.avatar || ''} alt={profile.name} className="user-avatar-img" />
              )}
            </div>
            <div className="profile-info-text">
              <span className="profile-name">{profile.name}</span>
              <span className="profile-role">{profile.role}</span>
            </div>
          </div>

          {showProfileMenu && (
            <div className="dropdown-menu profile-menu">
              <div className="profile-menu-header">
                <p className="menu-username">{profile.name}</p>
                <p className="menu-useremail">{profile.email}</p>
              </div>
              <div className="menu-divider"></div>
              <button className="menu-item" onClick={handleGoToProfile}>
                <UserIcon size={14} />
                <span>My Profile</span>
              </button>
              <button className="menu-item">
                <HelpCircle size={14} />
                <span>Help Center</span>
              </button>
              <div className="menu-divider"></div>
              <button 
                className="menu-item logout"
                onClick={() => { logout(); navigate('/login'); }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;