// src/js/rbac.js
// Role-Based Access Control — 3-role system: admin | staff | cashier
import auth from './auth.js';

// ── Permission → allowed roles map ─────────────────────────────────────────
// NOTE: cashier CAN access pos.* only.
//       staff CAN access inventory, products, sales, reports — NOT dashboard/pos/admin.
//       admin has full access to everything.
export const PERMISSIONS = {
  // Dashboard (admin only — monitors ALL branches)
  'dashboard.view':     ['admin'],

  // POS (admin + cashier)
  'pos.access':         ['admin', 'cashier'],
  'pos.open_session':   ['admin', 'cashier'],
  'pos.close_session':  ['admin', 'cashier'],
  'pos.cash_in_out':    ['admin', 'cashier'],
  'pos.price_override': ['admin'],
  'pos.item_discount':  ['admin'],
  'pos.void_transaction':  ['admin'],
  'pos.process_returns':   ['admin'],

  // Sales History (admin + staff)
  'sales.view':         ['admin', 'staff'],

  // Products (admin + staff)
  'products.view':      ['admin', 'staff'],
  'products.create':    ['admin', 'staff'],
  'products.edit':      ['admin', 'staff'],
  'products.delete':    ['admin'],
  'products.import':    ['admin'],

  // Inventory (admin + staff)
  'inventory.view':      ['admin', 'staff'],
  'inventory.adjust':    ['admin', 'staff'],
  'inventory.view_cost': ['admin', 'staff'],

  // Reports (admin + staff)
  'reports.view_store':  ['admin', 'staff'],
  'reports.view_all':    ['admin'],
  'reports.export':      ['admin', 'staff'],

  // Admin-only
  'users.manage':    ['admin'],
  'settings.manage': ['admin'],
  'branch.monitor':  ['admin'],
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
   * Home page URL for each role.
   *   admin   → dashboard.html  (full access, monitors all branches)
   *   staff   → inventory.html  (default landing page)
   *   cashier → pos.html        (POS only)
   */
  getHomeUrl() {
    const role = auth.currentProfile?.role;
    if (role === 'admin')   return 'dashboard.html';
    if (role === 'cashier') return 'pos.html';
    return 'inventory.html'; // staff
  },

  /**
   * Block the current page for unauthorised roles.
   *
   * KEY BEHAVIOUR:
   * - Calls updateUI() FIRST so the sidebar is always rendered with the
   *   correct locked/unlocked items before anything is blocked.
   * - If the page has a .main-content div (all pages except pos.html):
   *     overlays ONLY that div → sidebar stays fully visible & interactive.
   * - If there is no .main-content (pos.html): falls back to full-screen.
   */
  blockPage() {
    const role     = auth.currentProfile?.role || 'unknown';
    const roleLabelMap = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };
    const roleLabel = roleLabelMap[role] || role;
    const accessMap = {
      admin:   'All pages',
      staff:   'Inventory, Products, Sales History, Reports',
      cashier: 'Point of Sale',
    };
    const pages   = accessMap[role] || 'None';
    const homeUrl = this.getHomeUrl();

    // ── 1. Render sidebar / nav FIRST so the user can see & use locked nav ──
    this.updateUI();

    // ── 2. Remove any stale overlay ──
    const old = document.getElementById('rbac-access-denied');
    if (old) old.remove();

    // ── 3. Decide overlay target ──
    const mainContent = document.querySelector('.main-content');

    const overlay = document.createElement('div');
    overlay.id = 'rbac-access-denied';

    if (mainContent) {
      // Cover only the content area; sidebar (z-index:200, fixed) remains visible.
      mainContent.style.position = 'relative';
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:500;' +
        'background:var(--bg,#f8fafc);display:flex;' +
        'align-items:center;justify-content:center;padding:24px;';
      overlay.innerHTML = `
        <div style="text-align:center;max-width:400px;
                    background:var(--bg-secondary,#fff);
                    border:1px solid var(--border,#e5e7eb);
                    border-radius:16px;padding:40px 36px;
                    box-shadow:var(--elevation-shadow,0 12px 30px rgba(15,23,42,.12));">
          <div style="font-size:48px;margin-bottom:14px;">🔒</div>
          <h3 style="color:var(--text-primary,#0f172a);margin:0 0 8px;font-size:20px;font-weight:700;">
            Access Restricted
          </h3>
          <p style="color:var(--text-secondary,#334155);margin:0 0 4px;font-size:14px;">
            Your role: <strong>${roleLabel}</strong>
          </p>
          <p style="color:var(--text-secondary,#334155);margin:0 0 16px;font-size:14px;">
            This page is not available for your account.
          </p>
          <p style="color:var(--text-muted,#64748b);font-size:12.5px;margin:0 0 26px;line-height:1.65;">
            You can access:<br>
            <strong style="color:var(--text-secondary,#334155);">${pages}</strong>
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <a href="${homeUrl}"
               style="padding:9px 20px;background:var(--accent,#4f46e5);color:#fff;
                      border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
              &#8962; Go to My Home
            </a>
            <button id="rbac-signout-btn"
                    style="padding:9px 20px;background:var(--bg-secondary,#fff);
                           color:var(--text-secondary,#334155);
                           border:1px solid var(--border,#e5e7eb);
                           border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">
              Sign Out
            </button>
          </div>
        </div>
      `;
      mainContent.appendChild(overlay);
    } else {
      // Fallback: full-screen (pos.html has no .main-content / no sidebar)
      document.body.style.overflow = 'hidden';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;' +
        'align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="text-align:center;max-width:420px;background:#1e293b;
                    border:1px solid #334155;border-radius:16px;padding:44px 40px;
                    box-shadow:0 25px 60px rgba(0,0,0,.5);">
          <div style="font-size:52px;margin-bottom:16px;">🔒</div>
          <h3 style="color:#f1f5f9;margin:0 0 8px;font-size:22px;font-weight:700;">Access Restricted</h3>
          <p style="color:#94a3b8;margin:0 0 4px;">
            Your role: <strong style="color:#e2e8f0;">${roleLabel}</strong>
          </p>
          <p style="color:#94a3b8;margin:0 0 20px;">This page is not available for your account.</p>
          <p style="color:#64748b;font-size:13px;margin:0 0 28px;line-height:1.6;">
            You can access: <strong style="color:#cbd5e1;">${pages}</strong>
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="${homeUrl}"
               style="padding:9px 22px;background:#3b82f6;color:#fff;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:14px;">
              &#8962; Go to My Home
            </a>
            <button id="rbac-signout-btn"
                    style="padding:9px 22px;background:#1e293b;color:#cbd5e1;
                           border:1px solid #475569;border-radius:8px;
                           cursor:pointer;font-weight:600;font-size:14px;">
              Sign Out
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    document.getElementById('rbac-signout-btn').addEventListener('click', () => auth.logout());
  },

  /**
   * Apply permission-based locking/hiding to nav and UI elements.
   *
   * Rules:
   *  - .nav-section-label  → always visible (section dividers)
   *  - .nav-item           → lock (visible + lock icon) when not allowed
   *  - [data-nav-mobile]   → same as nav-item: lock rather than hide
   *    (used for pos.html's top-bar mobile nav buttons so cashier/staff
   *     can still SEE them but cannot click them)
   *  - everything else     → hide when not allowed
   */
  applyPermissions() {
    function lockNavItem(el) {
      el.classList.add('nav-locked');
      if (!el.dataset.origHref && el.getAttribute('href')) {
        el.dataset.origHref = el.getAttribute('href');
      }
      el.setAttribute('href', '#');
      el.setAttribute('tabindex', '-1');
      el.setAttribute('aria-disabled', 'true');
      el.style.pointerEvents = 'none';
      if (!el.querySelector('.nav-lock-icon')) {
        const lock = document.createElement('i');
        lock.className = 'bi bi-lock-fill nav-lock-icon';
        lock.style.cssText = 'margin-left:auto;font-size:10px;opacity:.65;flex-shrink:0;';
        el.appendChild(lock);
      }
    }

    function unlockNavItem(el) {
      el.classList.remove('nav-locked');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('tabindex');
      el.style.pointerEvents = '';
      if (el.dataset.origHref) {
        el.setAttribute('href', el.dataset.origHref);
        delete el.dataset.origHref;
      }
      const lock = el.querySelector('.nav-lock-icon');
      if (lock) lock.remove();
    }

    // Function to determine if element should be locked (like nav-item) vs hidden
    function shouldLock(el) {
      return el.classList.contains('nav-item') || el.hasAttribute('data-nav-mobile');
    }

    document.querySelectorAll('[data-permission]').forEach(el => {
      const perm    = el.dataset.permission;
      const allowed = this.can(perm);

      // Section labels are always visible (they're just separators)
      if (el.classList.contains('nav-section-label')) {
        el.style.display = '';
        return;
      }

      if (shouldLock(el)) {
        // Nav-style element: lock (visible + lock icon) or unlock
        if (!allowed) lockNavItem(el); else unlockNavItem(el);
      } else {
        // Regular UI element: hide or show
        el.style.display = allowed ? '' : 'none';
      }
    });

    document.querySelectorAll('[data-role]').forEach(el => {
      const roles   = el.dataset.role.split(',').map(r => r.trim());
      const allowed = roles.includes(auth.currentProfile?.role);

      if (el.classList.contains('nav-section-label')) {
        el.style.display = '';
        return;
      }

      if (shouldLock(el)) {
        if (!allowed) lockNavItem(el); else unlockNavItem(el);
      } else {
        el.style.display = allowed ? '' : 'none';
      }
    });
  },

  /**
   * Update all nav / UI elements with current user, role, and store info.
   * Always call this before loading page content so the sidebar is correct.
   */
  updateUI() {
    // User name
    document.querySelectorAll('[data-user-name]').forEach(
      el => (el.textContent = auth.currentProfile?.full_name || 'User')
    );

    // Role label
    const roleLabels = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };
    document.querySelectorAll('[data-user-role]').forEach(
      el => (el.textContent = roleLabels[auth.currentProfile?.role] || 'User')
    );

    // Active store name
    document.querySelectorAll('[data-current-store]').forEach(
      el => (el.textContent = auth.currentStore?.name || 'No Store')
    );

    // Avatar letter
    const av = document.getElementById('user-avatar-letter');
    if (av) av.textContent = (auth.currentProfile?.full_name || 'U')[0].toUpperCase();

    // Populate store selector dropdown (if present)
    const storeSel = document.getElementById('store-selector');
    if (storeSel && auth.userStores.length > 0) {
      storeSel.innerHTML = auth.userStores
        .map(s =>
          `<option value="${s.id}" ${s.id === auth.currentStore?.id ? 'selected' : ''}>${s.name}</option>`
        )
        .join('');
      storeSel.onchange = (e) => {
        auth.selectStore(e.target.value);
        window.location.reload();
      };
    }

    // Apply permission locking to the sidebar and any in-page elements
    this.applyPermissions();
  },
};

  /**
   * Block the current page for unauthorised roles.
   *
   * KEY BEHAVIOUR:
   * - Calls updateUI() FIRST so the sidebar is always rendered with the
   *   correct locked/unlocked items before anything is blocked.
   * - If the page has a .main-content div (all pages except pos.html):
   *     overlays ONLY that div → sidebar stays fully visible & interactive.
   * - If there is no .main-content (pos.html): falls back to full-screen.
   */
  blockPage() {
    const role     = auth.currentProfile?.role || 'unknown';
    const roleLabelMap = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };
    const roleLabel = roleLabelMap[role] || role;
    const accessMap = {
      admin:   'All pages',
      staff:   'Products, Inventory, Sales History, Reports',
      cashier: 'Point of Sale',
    };
    const pages   = accessMap[role] || 'None';
    const homeUrl = this.getHomeUrl();

    // ── 1. Setup sidebar / nav FIRST so the user can see & use locked nav ──
    this.updateUI();

    // ── 2. Remove any stale overlay ──
    const old = document.getElementById('rbac-access-denied');
    if (old) old.remove();

    // ── 3. Decide overlay target ──
    const mainContent = document.querySelector('.main-content');

    const overlay = document.createElement('div');
    overlay.id = 'rbac-access-denied';

    if (mainContent) {
      // Cover only the content area; sidebar (z-index:200, fixed) remains visible.
      // An absolute child of a relatively-positioned .main-content sits entirely
      // to the right of the sidebar and never overlaps it.
      mainContent.style.position = 'relative';
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:500;' +
        'background:var(--bg,#f8fafc);display:flex;' +
        'align-items:center;justify-content:center;padding:24px;';
      overlay.innerHTML = `
        <div style="text-align:center;max-width:400px;
                    background:var(--bg-secondary,#fff);
                    border:1px solid var(--border,#e5e7eb);
                    border-radius:16px;padding:40px 36px;
                    box-shadow:var(--elevation-shadow,0 12px 30px rgba(15,23,42,.12));">
          <div style="font-size:48px;margin-bottom:14px;">🔒</div>
          <h3 style="color:var(--text-primary,#0f172a);margin:0 0 8px;font-size:20px;font-weight:700;">
            Access Restricted
          </h3>
          <p style="color:var(--text-secondary,#334155);margin:0 0 4px;font-size:14px;">
            Your role: <strong>${roleLabel}</strong>
          </p>
          <p style="color:var(--text-secondary,#334155);margin:0 0 16px;font-size:14px;">
            This page is not available for your account.
          </p>
          <p style="color:var(--text-muted,#64748b);font-size:12.5px;margin:0 0 26px;line-height:1.65;">
            You can access:<br>
            <strong style="color:var(--text-secondary,#334155);">${pages}</strong>
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <a href="${homeUrl}"
               style="padding:9px 20px;background:var(--accent,#4f46e5);color:#fff;
                      border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
              &#8962; Go to My Home
            </a>
            <button id="rbac-signout-btn"
                    style="padding:9px 20px;background:var(--bg-secondary,#fff);
                           color:var(--text-secondary,#334155);
                           border:1px solid var(--border,#e5e7eb);
                           border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">
              Sign Out
            </button>
          </div>
        </div>
      `;
      mainContent.appendChild(overlay);
    } else {
      // Fallback: full-screen (pos.html has no .main-content / no sidebar)
      document.body.style.overflow = 'hidden';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;' +
        'align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="text-align:center;max-width:420px;background:#1e293b;
                    border:1px solid #334155;border-radius:16px;padding:44px 40px;
                    box-shadow:0 25px 60px rgba(0,0,0,.5);">
          <div style="font-size:52px;margin-bottom:16px;">🔒</div>
          <h3 style="color:#f1f5f9;margin:0 0 8px;font-size:22px;font-weight:700;">Access Restricted</h3>
          <p style="color:#94a3b8;margin:0 0 4px;">
            Your role: <strong style="color:#e2e8f0;">${roleLabel}</strong>
          </p>
          <p style="color:#94a3b8;margin:0 0 20px;">This page is not available for your account.</p>
          <p style="color:#64748b;font-size:13px;margin:0 0 28px;line-height:1.6;">
            You can access: <strong style="color:#cbd5e1;">${pages}</strong>
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="${homeUrl}"
               style="padding:9px 22px;background:#3b82f6;color:#fff;border-radius:8px;
                      text-decoration:none;font-weight:600;font-size:14px;">
              &#8962; Go to My Home
            </a>
            <button id="rbac-signout-btn"
                    style="padding:9px 22px;background:#1e293b;color:#cbd5e1;
                           border:1px solid #475569;border-radius:8px;
                           cursor:pointer;font-weight:600;font-size:14px;">
              Sign Out
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

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
