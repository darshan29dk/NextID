import React from 'react';
import { BookOpen } from 'lucide-react';
import RoleCatalogList from './RoleCatalogList';

// RC-001: Published Roles — the full catalog, no role_type filter.
const PublishedRoles = () => (
  <RoleCatalogList
    title="Published Roles"
    subtitle="All roles published to the Role Catalog after completing the Approval Workflow."
    roleTypeFilter={null}
    headerIcon={BookOpen}
  />
);

export default PublishedRoles;
