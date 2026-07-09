// Reusable helper for reading the logged-in user's Menu Permissions
// (set in Platform Roles > Menu Permissions, resolved once at login and
// stored on the user object in localStorage as `allowed_menus`).
//
// Platform Administrator always gets full access, matching the same
// behavior already used at login and in the backend's require_permission().

const EMPTY_PERMS = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_export: false,
  can_approve: false
};

const FULL_PERMS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_export: true,
  can_approve: true
};

const getStoredUser = () => {
  try {
    const saved = localStorage.getItem('ranalyzer_user');
    return saved ? JSON.parse(saved) : null;
  } catch (err) {
    console.warn('Could not read stored user for permission check:', err);
    return null;
  }
};

export const getMenuPermission = (menuName) => {
  const user = getStoredUser();
  if (!user) return EMPTY_PERMS;
  if (user.role === 'Platform Administrator') return FULL_PERMS;

  const allowedMenus = user.allowed_menus || [];
  const found = allowedMenus.find((m) => m.menu_name === menuName);
  return found || EMPTY_PERMS;
};

export const canView = (menuName) => getMenuPermission(menuName).can_view;
export const canCreate = (menuName) => getMenuPermission(menuName).can_create;
export const canEdit = (menuName) => getMenuPermission(menuName).can_edit;
export const canDelete = (menuName) => getMenuPermission(menuName).can_delete;
export const canExport = (menuName) => getMenuPermission(menuName).can_export;
export const canApprove = (menuName) => getMenuPermission(menuName).can_approve;
