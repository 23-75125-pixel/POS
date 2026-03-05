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
  'reports.view_store': ['admin', 'staff'],
  'reports.view_all': ['admin'],
  'reports.export': ['admin', 'staff'],

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
   * Returns the appropriate home URL for the current user's role.
   */
  getHomeUrl() {
    const role = auth.currentProfile?.role;
    if (role === 'admin') return 'dashboard.html';
    if (role === 'cashier') return 'pos.html';
    return 'inventory.html'; // staff
  },

  /**
   * Show a full-screen access-denied overlay WITHOUT navigating away.
   * Call this instead of window.location.href when blocking page access.
   */
  blockPage() {
    const role = auth.currentProfile?.role || 'unknown';
    const roleLabel = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' }[role] || role;
    const accessPages = {
      admin: 'All pages',
      staff: 'Inventory, Sales History, Reports, Products',
      cashier: 'Point of Sale',
    };
    const pages = accessPages[role] || 'None';
    const homeUrl = this.getHomeUrl();

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Remove any existing overlay to avoid duplicates
    const existing = document.getElementById('rbac-access-denied');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rbac-access-denied';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;' +
      'align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="text-align:center;max-width:440px;background:#1e293b;border:1px solid #334155;
                  border-radius:16px;padding:44px 40px;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
        <div style="font-size:52px;margin-bottom:16px;">🔒</div>
        <h3 style="color:#f1f5f9;margin-bottom:8px;font-size:22px;font-weight:700;">Access Restricted</h3>
        <p style="color:#94a3b8;margin-bottom:4px;">
          Your role: <strong style="color:#e2e8f0;">${roleLabel}</strong>
        </p>
        <p style="color:#94a3b8;margin-bottom:20px;">This page is not available for your account.</p>
        <p style="color:#64748b;font-size:13px;margin-bottom:28px;line-height:1.6;">
          You can access: <strong style="color:#cbd5e1;">${pages}</strong>
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="${homeUrl}"
             style="padding:9px 22px;background:#3b82f6;color:#fff;border-radius:8px;
                    text-decoration:none;font-weight:600;font-size:14px;">
            <span>&#8962;</span> Go to My Home
          </a>
          <button id="rbac-signout-btn"
                  style="padding:9px 22px;background:#1e293b;color:#cbd5e1;border:1px solid #475569;
                         border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;">
            Sign Out
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('rbac-signout-btn').addEventListener('click', () => auth.logout());
  },

  /**
   * Hide/show elements based on permission
   * Add data-permission="permission.name" to elements
   */
  applyPermissions() {
    // Helper: lock a nav-item link (visible but not clickable, shows lock icon)
    function lockNavItem(el) {
      el.classList.add('nav-locked');
      // Save original href so we can restore if role changes without reload
      if (!el.dataset.origHref && el.getAttribute('href')) {
        el.dataset.origHref = el.getAttribute('href');
      }
      el.setAttribute('href', '#');
      el.setAttribute('tabindex', '-1');
      el.setAttribute('aria-disabled', 'true');
      // Add lock icon once
      if (!el.querySelector('.nav-lock-icon')) {
        const lock = document.createElement('i');
        lock.className = 'bi bi-lock-fill nav-lock-icon';
        el.appendChild(lock);
      }
    }

    // Helper: unlock a nav-item link
    function unlockNavItem(el) {
      el.classList.remove('nav-locked');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('tabindex');
      if (el.dataset.origHref) {
        el.setAttribute('href', el.dataset.origHref);
        delete el.dataset.origHref;
      }
      const lock = el.querySelector('.nav-lock-icon');
      if (lock) lock.remove();
    }

    document.querySelectorAll('[data-permission]').forEach(el => {
      const perm = el.dataset.permission;
      const allowed = this.can(perm);
      // Section labels: always show — they act as group separators
      if (el.classList.contains('nav-section-label')) {
        el.style.display = '';
        return;
      }
      // Nav link/button: lock or unlock instead of hide/show
      if (el.classList.contains('nav-item')) {
        if (!allowed) lockNavItem(el); else unlockNavItem(el);
      } else {
        // Any other element (e.g. action buttons, table columns) — hide
        el.style.display = allowed ? '' : 'none';
      }
    });

    document.querySelectorAll('[data-role]').forEach(el => {
      const roles = el.dataset.role.split(',').map(r => r.trim());
      const allowed = roles.includes(auth.currentProfile?.role);
      // Section labels: always show
      if (el.classList.contains('nav-section-label')) {
        el.style.display = '';
        return;
      }
      // Nav link/button: lock or unlock
      if (el.classList.contains('nav-item')) {
        if (!allowed) lockNavItem(el); else unlockNavItem(el);
      } else {
        el.style.display = allowed ? '' : 'none';
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
    const roleLabels = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };
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
