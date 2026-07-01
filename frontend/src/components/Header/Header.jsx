import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, HelpCircle, Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import './Header.css';

const Header = ({ 
  theme, 
  toggleTheme, 
  profile, 
  notifications = []
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  
  const profileRef = useRef(null);
  const notificationRef = useRef(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  return (
    <header className="header">
      <div className="search-container">
        <Search className="search-icon" size={16} />
        <input 
          type="text" 
          placeholder="Search roles, identities..." 
          className="search-input"
        />
        <kbd className="search-kbd">Ctrl+K</kbd>
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
                {unreadCount > 0 && <span className="unread-lbl">{unreadCount} unread</span>}
              </div>
              <div className="notifications-list">
                {notifications.length === 0 ? (
                  <div className="empty-state">No new notifications</div>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.id} className={`notification-item ${notif.status}`}>
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

        <button className="action-btn" title="Help & Documentation">
          <HelpCircle size={18} />
        </button>

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
                <p className="menu-useremail">darshan.kumar@ranalyzer.io</p>
              </div>
              <div className="menu-divider"></div>
              <button className="menu-item">
                <UserIcon size={14} />
                <span>My Profile</span>
              </button>
              <button className="menu-item">
                <HelpCircle size={14} />
                <span>Help Center</span>
              </button>
              <div className="menu-divider"></div>
              <button className="menu-item logout">
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
