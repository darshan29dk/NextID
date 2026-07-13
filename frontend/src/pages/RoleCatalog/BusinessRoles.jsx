import React from 'react';
import { Briefcase } from 'lucide-react';
import RoleCatalogList from './RoleCatalogList';

// RC-002: Business Roles — catalog filtered to role_type "Business".
const BusinessRoles = () => (
  <RoleCatalogList
    title="Business Roles"
    subtitle="Published roles classified as Business role type."
    roleTypeFilter="Business"
    headerIcon={Briefcase}
  />
);

export default BusinessRoles;
