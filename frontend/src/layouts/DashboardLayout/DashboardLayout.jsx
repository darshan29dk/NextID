import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import Header from '../../components/Header/Header';
import { getProfile, getNotifications, getTheme, updateTheme } from '../../services/dashboardService';
import './DashboardLayout.css';

const DashboardLayout = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState('light');
  const [profile, setProfile] = useState({ name: 'Darshan Kumar', role: 'Platform Administrator', avatar: 'DA' });
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
    };

    loadAppData();
  }, []);

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
