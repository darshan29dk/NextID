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

  useEffect(() => {
    const loadAppData = async () => {
      const localTheme = localStorage.getItem('theme');
      if (localTheme) {
        applyTheme(localTheme);
      }
      
      try {
        const themeData = await getTheme();
        if (themeData && themeData.theme) {
          applyTheme(themeData.theme);
        }
      } catch (err) {
        console.error('Could not load theme from backend:', err);
      }

      try {
        const profileData = await getProfile();
        if (profileData) {
          setProfile(profileData);
        }
      } catch (err) {
        console.error('Could not load profile:', err);
      }

      try {
        const notificationsData = await getNotifications();
        if (notificationsData) {
          setNotifications(notificationsData);
        }
      } catch (err) {
        console.error('Could not load notifications:', err);
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