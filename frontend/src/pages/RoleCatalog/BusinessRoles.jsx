import React from 'react';
import { Briefcase } from 'lucide-react';
import RoleCatalogList from './RoleCatalogList';

// RC-002: Business Roles — catalog filtered to role_type "Business".
const BusinessRoles = () => (
  <RoleCatalogList
    title="Business Roles"
    subtitle="Approved roles of type Business, published to the catalog for provisioning and ongoing governance."
    roleTypeFilter="Business"
    headerIcon={Briefcase}
  />
);

export default BusinessRoles;
