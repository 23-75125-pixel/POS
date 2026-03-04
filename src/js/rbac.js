// src/js/rbac.js
import auth from './auth.js';

export const PERMISSIONS = {
  // Dashboard
  'dashboard.view': ['admin'],

  // POS
  'pos.access': ['admin', 'cashier'],
  'pos.open_session': ['admin', 'cashier'],
  'pos.close_session': ['admin', 'cashier'],
  'pos.cash_in_out': ['admin', 'cashier'],
  'pos.price_override': ['admin'],
  'pos.item_discount': ['admin'],
  'pos.void_transaction': ['admin'],
  'pos.process_returns': ['admin'],

  // Sales History
  'sales.view': ['admin', 'staff'],

  // Products
  'products.view': ['admin', 'staff'],
  'products.create': ['admin', 'staff'],
  'products.edit': ['admin', 'staff'],
  'products.delete': ['admin'],
  'products.import': ['admin'],

  // Inventory
  'inventory.view': ['admin', 'staff'],
  'inventory.adjust': ['admin', 'staff'],
  'inventory.view_cost': ['admin', 'staff'],

  // Reports
  'reports.view_store': ['admin'],
  'reports.view_all': ['admin'],
  'reports.export': ['admin'],

  // Users
  'users.manage': ['admin'],

  // Settings
  'settings.manage': ['admin'],
};

export const rbac = {
  can(permission) {
    const roles = PERMISSIONS[permission];
    if (!roles) return false;
    return roles.includes(auth.currentProfile?.role);
  },

  cannot(permission) {
    return !this.can(permission);
  },

  /**
   * Hide/show elements based on permission
   * Add data-permission="permission.name" to elements
   */
  applyPermissions() {
    document.querySelectorAll('[data-permission]').forEach(el => {
      const perm = el.dataset.permission;
      if (!this.can(perm)) {
        el.style.display = 'none';
      }
    });

    document.querySelectorAll('[data-role]').forEach(el => {
      const roles = el.dataset.role.split(',').map(r => r.trim());
      if (!roles.includes(auth.currentProfile?.role)) {
        el.style.display = 'none';
      }
    });
  },

  /**
   * Update all nav/UI elements with user info
   */
  updateUI() {
    const nameEls = document.querySelectorAll('[data-user-name]');
    nameEls.forEach(el => el.textContent = auth.currentProfile?.full_name || 'User');

    const roleEls = document.querySelectorAll('[data-user-role]');
    const roleLabels = { admin: 'Administrator', manager: 'Staff', staff: 'Staff', cashier: 'Cashier' };
    roleEls.forEach(el => el.textContent = roleLabels[auth.currentProfile?.role] || 'User');

    const storeEls = document.querySelectorAll('[data-current-store]');
    storeEls.forEach(el => el.textContent = auth.currentStore?.name || 'No Store');

    // Populate store selector if present
    const storeSel = document.getElementById('store-selector');
    if (storeSel && auth.userStores.length > 0) {
      storeSel.innerHTML = auth.userStores.map(s =>
        `<option value="${s.id}" ${s.id === auth.currentStore?.id ? 'selected' : ''}>${s.name}</option>`
      ).join('');
      storeSel.addEventListener('change', (e) => {
        auth.selectStore(e.target.value);
        window.location.reload();
      });
    }

    this.applyPermissions();
  }
};

export default rbac;
