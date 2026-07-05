import React from 'react';
import { Mail, Shield, Hash } from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import { useAuth } from '../../context/AuthContext';
import './Profile.css';

const Profile = () => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <div className="profile-page">
        <Breadcrumb items={[{ label: 'My Profile', active: true }]} />
        <div className="table-loading-container">
          <p className="text-muted" style={{ fontSize: '13px' }}>No user session found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Breadcrumb items={[{ label: 'My Profile', active: true }]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>My Profile</h2>
          <p>View your account details.</p>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-card-top">
          <div className="profile-avatar-large">
            {currentUser.avatar && currentUser.avatar.length <= 2 ? (
              <span>{currentUser.avatar}</span>
            ) : (
              <img src={currentUser.avatar || ''} alt={currentUser.name} />
            )}
          </div>
          <div>
            <h3 className="profile-display-name">{currentUser.name}</h3>
            <span className="profile-role-badge">{currentUser.role}</span>
          </div>
        </div>

        <div className="profile-detail-grid">
          <div className="profile-detail-item">
            <div className="profile-detail-icon">
              <Mail size={16} />
            </div>
            <div>
              <span className="profile-detail-label">Email Address</span>
              <span className="profile-detail-value">{currentUser.email}</span>
            </div>
          </div>

          <div className="profile-detail-item">
            <div className="profile-detail-icon">
              <Shield size={16} />
            </div>
            <div>
              <span className="profile-detail-label">Role</span>
              <span className="profile-detail-value">{currentUser.role}</span>
            </div>
          </div>

          <div className="profile-detail-item">
            <div className="profile-detail-icon">
              <Hash size={16} />
            </div>
            <div>
              <span className="profile-detail-label">User ID</span>
              <span className="profile-detail-value">{currentUser.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;