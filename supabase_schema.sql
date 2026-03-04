-- ============================================================
-- Philippines Multi-Store POS System - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- STORES
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  tin VARCHAR(20),
  vat_registered BOOLEAN DEFAULT TRUE,
  phone VARCHAR(20),
  email VARCHAR(100),
  receipt_footer TEXT DEFAULT 'Thank you for shopping with us!',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','staff','cashier')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================
-- LOGIN USERS (username/email + password hash metadata)
-- NOTE: Supabase Auth (auth.users) remains the source of truth for sign-in.
-- This table is used for username lookup and account metadata in the app.
-- ============================================================
CREATE TABLE IF NOT EXISTS login_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','staff','cashier')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_users_username ON login_users(username);
CREATE INDEX IF NOT EXISTS idx_login_users_email ON login_users(email);

-- ============================================================
-- USER STORE ACCESS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_store_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_store_access_user ON user_store_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_store_access_store ON user_store_access(store_id);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7) DEFAULT '#6366f1',
  icon VARCHAR(50) DEFAULT 'tag',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- ============================================================
-- PRODUCTS (global master)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  barcode VARCHAR(100),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  unit VARCHAR(20) DEFAULT 'pcs',
  cost NUMERIC(12,2) DEFAULT 0,
  price NUMERIC(12,2) NOT NULL,
  vat_inclusive BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ============================================================
-- STORE PRODUCTS (per-store stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock NUMERIC(12,2) DEFAULT 0,
  reorder_level NUMERIC(12,2) DEFAULT 5,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_products_store ON store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_product ON store_products(product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_low_stock ON store_products(store_id, stock, reorder_level);

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_change NUMERIC(12,2) NOT NULL,
  qty_before NUMERIC(12,2) NOT NULL,
  qty_after NUMERIC(12,2) NOT NULL,
  reason VARCHAR(50) NOT NULL CHECK (reason IN ('sale','return','adjustment','purchase','transfer_in','transfer_out','damage','opening')),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

-- ============================================================
-- CUSTOMERS (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  is_senior BOOLEAN DEFAULT FALSE,
  is_pwd BOOLEAN DEFAULT FALSE,
  discount_card VARCHAR(50),
  total_purchases NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============================================================
-- POS SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(12,2) DEFAULT 0,
  closing_cash NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  variance NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_store ON pos_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_cashier ON pos_sessions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON pos_sessions(status);

-- ============================================================
-- CASH MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('opening','cash_in','cash_out','sale','refund','closing')),
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

-- ============================================================
-- SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id UUID REFERENCES pos_sessions(id),
  cashier_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES customers(id),
  txn_no VARCHAR(30) UNIQUE NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) DEFAULT 0,
  vatable_sales NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  exempt_sales NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_tendered NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  payment_json JSONB DEFAULT '[]',
  customer_name VARCHAR(100),
  customer_tin VARCHAR(20),
  is_senior BOOLEAN DEFAULT FALSE,
  is_pwd BOOLEAN DEFAULT FALSE,
  senior_discount NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed','voided','returned')),
  void_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_session ON sales(session_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_txn_no ON sales(txn_no);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(150) NOT NULL,
  sku VARCHAR(50),
  qty NUMERIC(12,2) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  original_price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) DEFAULT 0,
  discount_type VARCHAR(10) DEFAULT 'fixed' CHECK (discount_type IN ('fixed','percent')),
  cost_snapshot NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- ============================================================
-- RETURNS
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id),
  sale_id UUID NOT NULL REFERENCES sales(id),
  cashier_id UUID NOT NULL REFERENCES auth.users(id),
  return_txn_no VARCHAR(30) UNIQUE NOT NULL,
  total_refund NUMERIC(12,2) NOT NULL,
  refund_method VARCHAR(20) DEFAULT 'cash',
  reason TEXT,
  restock BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_store ON returns(store_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);

-- ============================================================
-- RETURN ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  qty NUMERIC(12,2) NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  store_id UUID REFERENCES stores(id),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- TXN COUNTER (per store per day)
-- ============================================================
CREATE TABLE IF NOT EXISTS txn_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id),
  date_str VARCHAR(10) NOT NULL,
  counter INT DEFAULT 0,
  UNIQUE(store_id, date_str)
);

-- ============================================================
-- FUNCTION: get next txn number
-- ============================================================
CREATE OR REPLACE FUNCTION get_next_txn_no(p_store_id UUID, p_store_code TEXT)
RETURNS TEXT AS $$
DECLARE
  v_date TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMMDD');
  v_counter INT;
BEGIN
  INSERT INTO txn_counters (store_id, date_str, counter)
  VALUES (p_store_id, v_date, 1)
  ON CONFLICT (store_id, date_str)
  DO UPDATE SET counter = txn_counters.counter + 1
  RETURNING counter INTO v_counter;
  
  RETURN p_store_code || '-' || v_date || '-' || LPAD(v_counter::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_role TEXT;
BEGIN
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, 'New User');
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'cashier');

  IF v_role NOT IN ('admin', 'manager', 'staff', 'cashier') THEN
    v_role := 'cashier';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, v_full_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.login_users (user_id, username, email, role, is_active)
  VALUES (
    NEW.id,
    LOWER(SPLIT_PART(COALESCE(NEW.email, v_full_name), '@', 1)),
    LOWER(COALESCE(NEW.email, '')),
    v_role,
    TRUE
  )
  ON CONFLICT (email) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        role = EXCLUDED.role,
        is_active = TRUE,
        updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FUNCTION: auto-link new products to all stores
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_product_store_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_products (store_id, product_id, stock, reorder_level)
  SELECT s.id, NEW.id, 0, 5
  FROM public.stores s
  ON CONFLICT (store_id, product_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_product_created_link_stores ON public.products;
CREATE TRIGGER on_product_created_link_stores
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION handle_new_product_store_links();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE txn_counters ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to check store access
CREATE OR REPLACE FUNCTION has_store_access(p_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM user_store_access 
    WHERE user_id = auth.uid() AND store_id = p_store_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- RELATIONSHIP FIXES: make profiles embeds resolvable in PostgREST
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_cashier_id_profiles_fkey'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_cashier_id_profiles_fkey
      FOREIGN KEY (cashier_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_created_by_profiles_fkey'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_user_id_profiles_fkey'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_cashier_id_profiles_fkey'
      AND conrelid = 'public.returns'::regclass
  ) THEN
    ALTER TABLE public.returns
      ADD CONSTRAINT returns_cashier_id_profiles_fkey
      FOREIGN KEY (cashier_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_sessions_cashier_id_profiles_fkey'
      AND conrelid = 'public.pos_sessions'::regclass
  ) THEN
    ALTER TABLE public.pos_sessions
      ADD CONSTRAINT pos_sessions_cashier_id_profiles_fkey
      FOREIGN KEY (cashier_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_movements_created_by_profiles_fkey'
      AND conrelid = 'public.cash_movements'::regclass
  ) THEN
    ALTER TABLE public.cash_movements
      ADD CONSTRAINT cash_movements_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- STORES policies
DROP POLICY IF EXISTS "stores_select" ON stores;
DROP POLICY IF EXISTS "stores_insert" ON stores;
DROP POLICY IF EXISTS "stores_update" ON stores;
CREATE POLICY "stores_select" ON stores FOR SELECT
  USING (has_store_access(id));
CREATE POLICY "stores_insert" ON stores FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "stores_update" ON stores FOR UPDATE
  USING (get_user_role() = 'admin');

-- PROFILES policies
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  USING (id = auth.uid() OR get_user_role() IN ('admin','manager'));
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR get_user_role() = 'admin');

-- LOGIN USERS policies
DROP POLICY IF EXISTS "login_users_public_lookup" ON login_users;
DROP POLICY IF EXISTS "login_users_admin_manage" ON login_users;
CREATE POLICY "login_users_public_lookup" ON login_users FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');
CREATE POLICY "login_users_admin_manage" ON login_users FOR ALL TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Resolve username/email for login (safe: single-row lookup only)
CREATE OR REPLACE FUNCTION resolve_login_identity(p_login TEXT)
RETURNS TABLE (
  email TEXT,
  role TEXT,
  is_active BOOLEAN,
  has_auth_user BOOLEAN
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT
    lu.email,
    lu.role,
    lu.is_active,
    (au.id IS NOT NULL) AS has_auth_user
  FROM public.login_users lu
  LEFT JOIN auth.users au ON au.id = lu.user_id
  WHERE LOWER(lu.username) = LOWER(p_login)
     OR LOWER(lu.email) = LOWER(p_login)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_login_identity(TEXT) TO anon, authenticated;

-- Admin-only authentication sync status (for troubleshooting)
CREATE OR REPLACE FUNCTION admin_auth_sync_status()
RETURNS TABLE (
  username TEXT,
  email TEXT,
  role TEXT,
  is_active BOOLEAN,
  auth_user_id UUID,
  has_auth_user BOOLEAN,
  profile_exists BOOLEAN
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT
    lu.username,
    lu.email,
    lu.role,
    lu.is_active,
    lu.user_id AS auth_user_id,
    (au.id IS NOT NULL) AS has_auth_user,
    (p.id IS NOT NULL) AS profile_exists
  FROM public.login_users lu
  LEFT JOIN auth.users au ON au.id = lu.user_id
  LEFT JOIN public.profiles p ON p.id = lu.user_id
  WHERE get_user_role() = 'admin'
  ORDER BY lu.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION admin_auth_sync_status() TO authenticated;

-- USER STORE ACCESS policies
DROP POLICY IF EXISTS "usa_select" ON user_store_access;
DROP POLICY IF EXISTS "usa_insert" ON user_store_access;
DROP POLICY IF EXISTS "usa_delete" ON user_store_access;
CREATE POLICY "usa_select" ON user_store_access FOR SELECT
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "usa_insert" ON user_store_access FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "usa_delete" ON user_store_access FOR DELETE
  USING (get_user_role() = 'admin');

-- CATEGORIES policies
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (get_user_role() = 'admin');

-- PRODUCTS policies
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "products_update" ON products FOR UPDATE USING (get_user_role() = 'admin');
CREATE POLICY "products_delete" ON products FOR DELETE USING (get_user_role() = 'admin');

-- STORE PRODUCTS policies
DROP POLICY IF EXISTS "sp_select" ON store_products;
DROP POLICY IF EXISTS "sp_insert" ON store_products;
DROP POLICY IF EXISTS "sp_update" ON store_products;
CREATE POLICY "sp_select" ON store_products FOR SELECT
  USING (has_store_access(store_id));
CREATE POLICY "sp_insert" ON store_products FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','staff'));
CREATE POLICY "sp_update" ON store_products FOR UPDATE
  USING (has_store_access(store_id) AND get_user_role() IN ('admin','staff'));

-- STOCK MOVEMENTS policies
DROP POLICY IF EXISTS "sm_select" ON stock_movements;
DROP POLICY IF EXISTS "sm_insert" ON stock_movements;
CREATE POLICY "sm_select" ON stock_movements FOR SELECT
  USING (has_store_access(store_id));
CREATE POLICY "sm_insert" ON stock_movements FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','staff','cashier'));

-- CUSTOMERS policies
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated USING (true);

-- POS SESSIONS policies
DROP POLICY IF EXISTS "sessions_select" ON pos_sessions;
DROP POLICY IF EXISTS "sessions_insert" ON pos_sessions;
DROP POLICY IF EXISTS "sessions_update" ON pos_sessions;
CREATE POLICY "sessions_select" ON pos_sessions FOR SELECT
  USING (has_store_access(store_id));
CREATE POLICY "sessions_insert" ON pos_sessions FOR INSERT
  WITH CHECK (has_store_access(store_id) AND cashier_id = auth.uid() AND get_user_role() IN ('admin','cashier'));
CREATE POLICY "sessions_update" ON pos_sessions FOR UPDATE
  USING (
    has_store_access(store_id)
    AND (
      (cashier_id = auth.uid() AND get_user_role() IN ('admin','cashier'))
      OR get_user_role() = 'admin'
    )
  );

-- CASH MOVEMENTS policies
DROP POLICY IF EXISTS "cm_select" ON cash_movements;
DROP POLICY IF EXISTS "cm_insert" ON cash_movements;
CREATE POLICY "cm_select" ON cash_movements FOR SELECT
  USING (has_store_access(store_id));
CREATE POLICY "cm_insert" ON cash_movements FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','cashier'));

-- SALES policies
DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;
CREATE POLICY "sales_select" ON sales FOR SELECT
  USING (has_store_access(store_id));
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (has_store_access(store_id) AND cashier_id = auth.uid() AND get_user_role() IN ('admin','cashier'));
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (has_store_access(store_id) AND get_user_role() = 'admin');

-- SALE ITEMS policies
DROP POLICY IF EXISTS "si_select" ON sale_items;
DROP POLICY IF EXISTS "si_insert" ON sale_items;
CREATE POLICY "si_select" ON sale_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM sales WHERE id = sale_items.sale_id AND has_store_access(store_id)));
CREATE POLICY "si_insert" ON sale_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM sales WHERE id = sale_items.sale_id AND has_store_access(store_id)));

-- RETURNS policies
DROP POLICY IF EXISTS "returns_select" ON returns;
DROP POLICY IF EXISTS "returns_insert" ON returns;
CREATE POLICY "returns_select" ON returns FOR SELECT USING (has_store_access(store_id));
CREATE POLICY "returns_insert" ON returns FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','cashier'));

-- RETURN ITEMS policies
DROP POLICY IF EXISTS "ri_select" ON return_items;
DROP POLICY IF EXISTS "ri_insert" ON return_items;
CREATE POLICY "ri_select" ON return_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = return_items.return_id AND has_store_access(s.store_id)));
CREATE POLICY "ri_insert" ON return_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE r.id = return_items.return_id
        AND has_store_access(s.store_id)
        AND get_user_role() IN ('admin','cashier')
    )
  );

-- AUDIT LOGS policies
DROP POLICY IF EXISTS "al_select" ON audit_logs;
DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_select" ON audit_logs FOR SELECT
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "al_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- TXN COUNTERS policies
DROP POLICY IF EXISTS "tc_all" ON txn_counters;
CREATE POLICY "tc_all" ON txn_counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DATA: 4 Stores
-- ============================================================
INSERT INTO stores (code, name, address, tin, vat_registered) VALUES
  ('STR1', 'Branch 1', '123 Rizal Ave, Manila, NCR', '000-123-456-000', TRUE),
  ('STR2', 'Branch 2', '456 Ayala Ave, Makati City, NCR', '000-123-456-001', TRUE),
  ('STR3', 'Branch 3', '789 Quezon Ave, Quezon City, NCR', '000-123-456-002', TRUE),
  ('STR4', 'Branch 4', '321 Colon St, Cebu City, Region VII', '000-123-456-003', TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  tin = EXCLUDED.tin,
  vat_registered = EXCLUDED.vat_registered;

-- No dummy categories/products are seeded.
-- Add categories and products manually in the app after initial setup.

-- Seed default login aliases (metadata table only)
INSERT INTO login_users (username, email, role, is_active, password_hash)
VALUES
  ('admin', 'admin@phpos.ph', 'admin', true, crypt('password123', gen_salt('bf'))),
  ('staff', 'staff@phpos.ph', 'staff', true, crypt('password123', gen_salt('bf'))),
  ('cashier', 'cashier@phpos.ph', 'cashier', true, crypt('password123', gen_salt('bf')))
ON CONFLICT (username) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();

-- ============================================================
-- REALTIME: Ensure branch-critical tables are published
-- ============================================================
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'stores',
    'products',
    'store_products',
    'stock_movements',
    'pos_sessions',
    'cash_movements',
    'sales',
    'sale_items',
    'returns',
    'return_items',
    'audit_logs',
    'user_store_access',
    'login_users'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END
$$;
