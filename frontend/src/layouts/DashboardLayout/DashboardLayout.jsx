import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Header from '../../components/Header/Header';
import { useAuth } from '../../context/AuthContext';
import { getProfile, getNotifications, getTheme, updateTheme } from '../../services/dashboardService';
import './DashboardLayout.css';

const DashboardLayout = ({ children }) => {
  const { currentUser } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState('light');
  const [profile, setProfile] = useState(() => {
  const saved = localStorage.getItem('ranalyzer_user')
  return saved ? JSON.parse(saved) : { name: 'User', role: 'Platform Administrator', avatar: 'U', email: '' }
});
  const [notifications, setNotifications] = useState([]);

  const applyTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.className = `theme-${newTheme}`;
  };

  const toggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    try {
      await updateTheme(nextTheme);
    } catch (err) {
      console.error('Failed to sync theme with backend:', err);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Below the same 768px breakpoint DashboardLayout.css already uses for
  // its mobile padding tweak, auto-collapse the sidebar to its icon-only
  // width instead of leaving it full-width and fixed on top of the page
  // content (which was hiding the breadcrumb/heading/search bar behind it
  // on narrow screens - the CSS margin-left:0 override alone didn't help
  // because nothing was actually shrinking the sidebar itself). The user
  // can still tap the collapse toggle to expand it back open manually.
  useEffect(() => {
    const collapseIfNarrow = () => {
      if (window.innerWidth <= 768) {
        setIsCollapsed(true);
      }
    };
    collapseIfNarrow();
    window.addEventListener('resize', collapseIfNarrow);
    return () => window.removeEventListener('resize', collapseIfNarrow);
  }, []);

  useEffect(() => {
    const loadAppData = async () => {
      const localTheme = localStorage.getItem('theme');
      if (localTheme) {
        applyTheme(localTheme);
      }
      
      // These three calls are independent of each other, so fire them
      // together instead of awaiting one at a time - that was tripling
      // the network round-trip cost to the remote DB on every load.
      const [themeResult, profileResult, notificationsResult] = await Promise.allSettled([
        getTheme(),
        getProfile(),
        getNotifications()
      ]);

      if (themeResult.status === 'fulfilled' && themeResult.value?.theme) {
        applyTheme(themeResult.value.theme);
      } else if (themeResult.status === 'rejected') {
        console.error('Could not load theme from backend:', themeResult.reason);
      }

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        setProfile(profileResult.value);
      } else if (profileResult.status === 'rejected') {
        console.error('Could not load profile:', profileResult.reason);
      }

      if (notificationsResult.status === 'fulfilled' && notificationsResult.value) {
        setNotifications(notificationsResult.value);
      } else if (notificationsResult.status === 'rejected') {
        console.error('Could not load notifications:', notificationsResult.reason);
      }

      // Set profile from logged in user
      if (currentUser) {
        setProfile({
          name: currentUser.name,
          role: currentUser.role,
          avatar: currentUser.avatar,
          email: currentUser.email
        });
      }
    };

    loadAppData();
  }, [currentUser]);

  return (
    <div className={`app-layout ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar 
        isCollapsed={isCollapsed} 
        toggleCollapse={toggleSidebar} 
      />

      <div className="main-container">
        <Header 
          theme={theme} 
          toggleTheme={toggleTheme} 
          profile={profile} 
          notifications={notifications} 
        />
        <main className="content-wrapper">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;