import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Briefcase, Cpu } from 'lucide-react';
import RoleCatalogList from './RoleCatalogList';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';

const PublishedRoles = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTabFromPath = (path) => {
    if (path.includes('business')) return 'business';
    if (path.includes('technical')) return 'technical';
    return 'all';
  };

  const [mainTab, setMainTab] = useState(getActiveTabFromPath(location.pathname));

  useEffect(() => {
    setMainTab(getActiveTabFromPath(location.pathname));
  }, [location.pathname]);

  const roleTypeFilter = mainTab === 'business' ? 'Business' : mainTab === 'technical' ? 'Technical' : null;
  const title = mainTab === 'business' ? 'Business Roles' : mainTab === 'technical' ? 'Technical Roles' : 'Published Roles';
  const subtitle = mainTab === 'business' 
    ? 'Approved roles of type Business, published to the catalog for provisioning and ongoing governance.' 
    : mainTab === 'technical' 
    ? 'Approved roles of type Technical, published to the catalog for provisioning and ongoing governance.' 
    : 'All roles published to the Role Catalog after completing the Approval Workflow.';
  const HeaderIcon = mainTab === 'business' ? Briefcase : mainTab === 'technical' ? Cpu : BookOpen;

  return (
    <div className="workbench-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Breadcrumb
        items={[
          { label: 'Role Catalog', active: false },
          { label: 'Catalog Explorer', active: true }
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <HeaderIcon size={20} style={{ color: '#2563eb' }} />
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{title}</h2>
          <p className="text-muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>{subtitle}</p>
        </div>
      </div>

      <div className="controls-card" style={{ display: 'flex', gap: '8px', padding: '4px', marginBottom: '16px' }}>
        <button
          className={`drawer-tab-btn ${mainTab === 'all' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('all');
            navigate('/role-catalog/published');
          }}
          style={{ padding: '10px 18px' }}
        >
          <BookOpen size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Published Roles
        </button>
        <button
          className={`drawer-tab-btn ${mainTab === 'business' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('business');
            navigate('/role-catalog/business');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Briefcase size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Business Roles
        </button>
        <button
          className={`drawer-tab-btn ${mainTab === 'technical' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('technical');
            navigate('/role-catalog/technical');
          }}
          style={{ padding: '10px 18px' }}
        >
          <Cpu size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Technical Roles
        </button>
      </div>

      <RoleCatalogList
        roleTypeFilter={roleTypeFilter}
        hideHeader={true}
      />
    </div>
  );
};

export default PublishedRoles;
