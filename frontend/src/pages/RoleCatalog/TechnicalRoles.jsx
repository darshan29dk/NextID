import React from 'react';
import { Cpu } from 'lucide-react';
import RoleCatalogList from './RoleCatalogList';

// RC-003: Technical Roles — catalog filtered to role_type "Technical".
const TechnicalRoles = () => (
  <RoleCatalogList
    title="Technical Roles"
    subtitle="Approved roles of type Technical, published to the catalog for provisioning and ongoing governance."
    roleTypeFilter="Technical"
    headerIcon={Cpu}
  />
);

export default TechnicalRoles;
