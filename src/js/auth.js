// src/js/auth.js
import db from './supabaseClient.js';
import { showToast, showLoading, hideLoading } from './utils.js';

export const auth = {
  currentUser: null,
  currentProfile: null,
  currentStore: null,
  userStores: [],

  resetState() {
    this.currentUser = null;
    this.currentProfile = null;
    this.currentStore = null;
    this.userStores = [];
  },

  clearPersistedAuthStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /^sb-.*-auth-token$/.test(key)) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  },

  async forceLocalSignOut() {
    try {
      await db.auth.signOut({ scope: 'local' });
    } catch (_) {
      try { await db.auth.signOut(); } catch (_) {}
    }
    this.resetState();
    this.clearPersistedAuthStorage();
    localStorage.removeItem('pos_store_id');
  },

  async init() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) {
      // not fatal, but good to know
      console.warn('getSession error:', error.message);
    }

    if (session?.user) {
      this.currentUser = session.user;
      await this.loadProfile();
      if (!this.currentProfile) {
        await this.forceLocalSignOut();
        return null;
      }
    }

    db.auth.onAuthStateChange(async (event, session2) => {
      if (event === 'SIGNED_IN' && session2?.user) {
        this.currentUser = session2.user;
        await this.loadProfile();
        if (!this.currentProfile) {
          await this.forceLocalSignOut();
        }
      } else if (event === 'SIGNED_OUT') {
        this.resetState();
      }
    });

    return session;
  },

  async loadProfile() {
    if (!this.currentUser) return;

    // 1) Load profile
    const { data: profile, error: pErr } = await db
      .from('profiles')
      .select('*')
      .eq('id', this.currentUser.id)
      .single();

    if (pErr) {
      console.warn('loadProfile profiles error:', pErr.message);
      this.currentProfile = null;
      this.currentStore = null;
      this.userStores = [];
      return;
    }

    if (profile?.is_active === false) {
      this.currentProfile = null;
      this.currentStore = null;
      this.userStores = [];
      return;
    }

    // Normalize legacy 'manager' role → 'staff' (client-side fallback
    // until the SQL patch migrates the DB column).
    if (profile && profile.role === 'manager') {
      profile.role = 'staff';
    }

    this.currentProfile = profile;

    // 2) Load accessible stores
    if (profile?.role === 'admin') {
      const { data: stores, error: sErr } = await db
        .from('stores')
        .select('*')
        .order('name');

      if (sErr) console.warn('stores load error:', sErr.message);
      this.userStores = stores || [];
    } else {
      const { data: access, error: aErr } = await db
        .from('user_store_access')
        .select('store_id, stores(*)')
        .eq('user_id', this.currentUser.id);

      if (aErr) console.warn('user_store_access error:', aErr.message);
      this.userStores = access?.map(a => a.stores).filter(Boolean) || [];
    }

    // 3) Restore last selected store (safe compare)
    const savedStoreId = (localStorage.getItem('pos_store_id') || '').trim();
    if (savedStoreId) {
      this.currentStore =
        this.userStores.find(s => String(s.id) === savedStoreId) || this.userStores[0] || null;
    } else {
      this.currentStore = this.userStores[0] || null;
    }

    if (this.currentStore?.id) {
      localStorage.setItem('pos_store_id', String(this.currentStore.id));
    }
  },

  async login(email, password) {
    showLoading('Signing in...');
    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;

      this.currentUser = data.user;
      await this.loadProfile();

      if (!this.currentProfile) {
        await this.forceLocalSignOut();
        return { success: false, error: 'Profile not found. Please contact admin.' };
      }

      await this.logAction('login', null, null, null, { email });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      hideLoading();
    }
  },

  async logout() {
    try {
      await this.logAction('logout');
    } catch (_) {}

    try {
      await db.auth.signOut({ scope: 'global' });
    } catch (e) {
      try { await db.auth.signOut({ scope: 'local' }); } catch (_) {}
      console.warn('signOut error:', e?.message || e);
    } finally {
      this.resetState();
      this.clearPersistedAuthStorage();
      localStorage.removeItem('pos_store_id');
      window.location.href = `login.html?logged_out=1&t=${Date.now()}`;
    }
  },

  isLoggedIn() {
    return !!this.currentUser && !!this.currentProfile;
  },

  hasRole(...roles) {
    // Treat legacy 'manager' as 'staff' for backwards compatibility.
    const role = this.currentProfile?.role === 'manager'
      ? 'staff'
      : this.currentProfile?.role;
    return roles.includes(role);
  },

  requireAuth(redirectTo = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  requireRole(roles, redirectTo = 'dashboard.html') {
    if (!this.requireAuth()) return false;

    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!this.hasRole(...allowed)) {
      showToast('You do not have permission to access this page.', 'danger');
      setTimeout(() => (window.location.href = redirectTo), 1200);
      return false;
    }
    return true;
  },

  selectStore(storeId) {
    const id = String(storeId);
    this.currentStore = this.userStores.find(s => String(s.id) === id) || null;
    if (this.currentStore) localStorage.setItem('pos_store_id', id);
  },

  async logAction(action, entityType = null, entityId = null, oldVals = null, newVals = null) {
    try {
      await db.from('audit_logs').insert({
        user_id: this.currentUser?.id || null,
        store_id: this.currentStore?.id || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        old_values: oldVals,
        new_values: newVals
      });
    } catch (e) {
      // silent fail for audit
    }
  }
};

export default auth;