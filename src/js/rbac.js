// src/js/rbac.js
// Role-Based Access Control — 3-role system: admin | staff | cashier
import auth from './auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// PAGE → ALLOWED ROLES MAP
//
//   admin   → every page
//   staff   → inventory, products, sales history, reports   (NO pos, NO dashboard)
//   cashier → pos only                                       (NO dashboard, NO anything else)
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_ACCESS = {
  'dashboard.html':  ['admin'],
  'pos.html':        ['admin', 'cashier'],
  'inventory.html':  ['admin', 'staff'],
  'products.html':   ['admin', 'staff'],
  'sales.html':      ['admin', 'staff'],
  'reports.html':    ['admin', 'staff'],
  // admin-only management pages
  'users.html':      ['admin'],
  'settings.html':   ['admin'],
  'stores.html':     ['admin'],
};

// ── Permission → allowed roles ────────────────────────────────────────────────
export const PERMISSIONS = {
  // Dashboard (admin only)
  'dashboard.view':        ['admin'],

  // POS (admin + cashier)
  'pos.access':            ['admin', 'cashier'],
  'pos.open_session':      ['admin', 'cashier'],
  'pos.close_session':     ['admin', 'cashier'],
  'pos.cash_in_out':       ['admin', 'cashier'],
  'pos.price_override':    ['admin'],
  'pos.item_discount':     ['admin'],
  'pos.void_transaction':  ['admin'],
  'pos.process_returns':   ['admin'],

  // Sales History (admin + staff)
  'sales.view':            ['admin', 'staff'],

  // Products (admin + staff)
  'products.view':         ['admin', 'staff'],
  'products.create':       ['admin', 'staff'],
  'products.edit':         ['admin', 'staff'],
  'products.delete':       ['admin'],
  'products.import':       ['admin'],

  // Inventory (admin + staff)
  'inventory.view':        ['admin', 'staff'],
  'inventory.adjust':      ['admin', 'staff'],
  'inventory.view_cost':   ['admin', 'staff'],

  // Reports (admin + staff)
  'reports.view_store':    ['admin', 'staff'],
  'reports.view_all':      ['admin'],
  'reports.export':        ['admin', 'staff'],

  // Admin-only
  'users.manage':          ['admin'],
  'settings.manage':       ['admin'],
  'branch.monitor':        ['admin'],
};

export const rbac = {

  // ── Core helpers ─────────────────────────────────────────────────────────

  can(permission) {
    const roles = PERMISSIONS[permission];
    if (!roles) return false;
    return roles.includes(auth.getRole());
  },

  cannot(permission) {
    return !this.can(permission);
  },

  /**
   * Returns the correct home page for the current user's role.
   *   admin   → dashboard.html
   *   staff   → inventory.html
   *   cashier → pos.html
   */
  getHomeUrl() {
    const role = auth.getRole();
    if (role === 'admin')   return 'dashboard.html';
    if (role === 'cashier') return 'pos.html';
    return 'inventory.html'; // staff
  },

  // ── Page-level guard ─────────────────────────────────────────────────────

  /**
   * Call this at the top of every page's init() AFTER auth.init().
   *
   * Behaviour:
   *   1. If not logged in → redirect to login.html.
   *   2. Determine the current page filename.
   *   3. Look up who is allowed on this page in PAGE_ACCESS.
   *   4. If the current role is NOT allowed → call blockPage().
   *   5. If allowed → call updateUI() and return true.
   *
   * @returns {boolean} true = page is allowed, false = access denied (page blocked)
   */
  guardPage() {
    // 1. Must be logged in
    if (!auth.requireAuth()) return false;

    // 2. Derive page filename (strip query/hash, lowercase)
    const page = window.location.pathname
      .split('/')
      .pop()
      .split('?')[0]
      .split('#')[0]
      .toLowerCase() || 'index.html';

    // 3. Check access — if the page isn't in PAGE_ACCESS we allow it
    //    (unknown pages default to "admin only" as a safe fallback)
    const allowedRoles = PAGE_ACCESS[page] || ['admin'];
    const role = auth.getRole();

    if (!allowedRoles.includes(role)) {
      // 4. Block the page
      this.blockPage();
      return false;
    }

    // 5. Allowed — render nav & UI, then let the page continue
    this.updateUI();
    return true;
  },

  // ── Block overlay ────────────────────────────────────────────────────────

  /**
   * Render an "Access Restricted" overlay.
   *
   * - Calls updateUI() first so the sidebar is always visible.
   * - If .main-content exists → overlays only that area (sidebar stays).
   * - Otherwise → full-screen fallback (used on pos.html / no-sidebar pages).
   */
  blockPage() {
    const role = auth.getRole() || 'unknown';
    const roleLabelMap  = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };
    const accessMap     = {
      admin:   'All pages',
      staff:   'Inventory, Products, Sales History, Reports',
      cashier: 'Point of Sale',
    };

    const roleLabel = roleLabelMap[role] || role;
    const pages     = accessMap[role]    || 'None';
    const homeUrl   = this.getHomeUrl();

    // Render sidebar / nav first so the user can navigate
    this.updateUI();

    // Remove any stale overlay
    document.getElementById('rbac-access-denied')?.remove();

    const mainContent = document.querySelector('.main-content');
    const overlay     = document.createElement('div');
    overlay.id        = 'rbac-access-denied';

    if (mainContent) {
      mainContent.style.position = 'relative';
      overlay.style.cssText =
        'position:absolute;inset:0;z-index:500;' +
        'background:var(--bg,#f8fafc);display:flex;' +
        'align-items:center;justify-content:center;padding:24px;';
      overlay.innerHTML = _deniedCard(roleLabel, pages, homeUrl, false);
      mainContent.appendChild(overlay);
    } else {
      document.body.style.overflow = 'hidden';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;' +
        'align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = _deniedCard(roleLabel, pages, homeUrl, true);
      document.body.appendChild(overlay);
    }

    document.getElementById('rbac-signout-btn')
      ?.addEventListener('click', () => auth.logout());
  },

  // ── Permission-based UI rendering ────────────────────────────────────────

  /**
   * Lock/hide nav and UI elements according to data-permission / data-role attrs.
   *
   * Rules:
   *   .nav-section-label  → always visible (section dividers)
   *   .nav-item           → lock (visible + lock icon) when not allowed
   *   [data-nav-mobile]   → same lock behaviour
   *   everything else     → hidden when not allowed
   */
  applyPermissions() {
    const lockEl = (el) => {
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
    };

    const unlockEl = (el) => {
      el.classList.remove('nav-locked');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('tabindex');
      el.style.pointerEvents = '';
      if (el.dataset.origHref) {
        el.setAttribute('href', el.dataset.origHref);
        delete el.dataset.origHref;
      }
      el.querySelector('.nav-lock-icon')?.remove();
    };

    const isNavEl = (el) =>
      el.classList.contains('nav-item') || el.hasAttribute('data-nav-mobile');

    // data-permission attributes
    document.querySelectorAll('[data-permission]').forEach(el => {
      if (el.classList.contains('nav-section-label')) { el.style.display = ''; return; }
      const allowed = this.can(el.dataset.permission);
      if (isNavEl(el)) {
        allowed ? unlockEl(el) : lockEl(el);
      } else {
        el.style.display = allowed ? '' : 'none';
      }
    });

    // data-role attributes
    document.querySelectorAll('[data-role]').forEach(el => {
      if (el.classList.contains('nav-section-label')) { el.style.display = ''; return; }
      const roles   = el.dataset.role.split(',').map(r => r.trim());
      const allowed = roles.includes(auth.getRole());
      if (isNavEl(el)) {
        allowed ? unlockEl(el) : lockEl(el);
      } else {
        el.style.display = allowed ? '' : 'none';
      }
    });
  },

  /**
   * Populate all nav / header elements with current user + store info,
   * then apply permission locking.
   * Always call this before loading page content.
   */
  updateUI() {
    const roleLabels = { admin: 'Administrator', staff: 'Staff', cashier: 'Cashier' };

    document.querySelectorAll('[data-user-name]').forEach(
      el => (el.textContent = auth.currentProfile?.full_name || 'User')
    );
    document.querySelectorAll('[data-user-role]').forEach(
      el => (el.textContent = roleLabels[auth.getRole()] || 'User')
    );
    document.querySelectorAll('[data-current-store]').forEach(
      el => (el.textContent = auth.currentStore?.name || 'No Store')
    );

    const av = document.getElementById('user-avatar-letter');
    if (av) av.textContent = (auth.currentProfile?.full_name || 'U')[0].toUpperCase();

    // Store selector dropdown
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

    this.applyPermissions();
  },
};

// ── Private helpers ───────────────────────────────────────────────────────────

function _deniedCard(roleLabel, pages, homeUrl, dark) {
  if (dark) {
    return `
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
      </div>`;
  }
  return `
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
    </div>`;
}

export default rbac;