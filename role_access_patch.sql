-- ============================================================
-- PH-POS Role Access Patch v2
-- 3-Role System: admin | staff | cashier  (manager removed)
-- Run this in Supabase SQL Editor AFTER supabase_schema.sql
-- ============================================================

-- ─── 1. Lock role CHECK to 3 roles only ────────────────────
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','staff','cashier'));

ALTER TABLE login_users
  DROP CONSTRAINT IF EXISTS login_users_role_check;
ALTER TABLE login_users
  ADD CONSTRAINT login_users_role_check
  CHECK (role IN ('admin','staff','cashier'));

-- Migrate any lingering 'manager' rows to 'staff'
UPDATE profiles    SET role = 'staff', updated_at = NOW() WHERE role = 'manager';
UPDATE login_users SET role = 'staff', updated_at = NOW() WHERE role = 'manager';

-- ─── 2. Fix handle_new_user() – only 3 valid roles ─────────
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
  v_role      := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'cashier');

  IF v_role NOT IN ('admin', 'staff', 'cashier') THEN
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
    SET user_id    = EXCLUDED.user_id,
        role       = EXCLUDED.role,
        is_active  = TRUE,
        updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 3. Helper functions (idempotent) ──────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_store_access(p_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM user_store_access
    WHERE user_id = auth.uid() AND store_id = p_store_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─── 4. PROFILES RLS ────────────────────────────────────────
-- Allow ALL authenticated users to SELECT profiles.
-- Needed for receipt joins (cashier name on sales) and for
-- admin user-management page.
DROP POLICY IF EXISTS "profiles_select_own"      ON profiles;
DROP POLICY IF EXISTS "profiles_select_all_auth" ON profiles;
CREATE POLICY "profiles_select_all_auth" ON profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING    (id = auth.uid() OR get_user_role() = 'admin')
  WITH CHECK (id = auth.uid() OR get_user_role() = 'admin');

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR get_user_role() = 'admin');

-- ─── 5. LOGIN_USERS RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "login_users_public_lookup" ON login_users;
DROP POLICY IF EXISTS "login_users_admin_manage"  ON login_users;
CREATE POLICY "login_users_admin_manage" ON login_users
  FOR ALL TO authenticated
  USING    (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ─── 6. STORES RLS ──────────────────────────────────────────
DROP POLICY IF EXISTS "stores_select" ON stores;
DROP POLICY IF EXISTS "stores_insert" ON stores;
DROP POLICY IF EXISTS "stores_update" ON stores;
CREATE POLICY "stores_select" ON stores
  FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(id));
CREATE POLICY "stores_insert" ON stores
  FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "stores_update" ON stores
  FOR UPDATE USING (get_user_role() = 'admin');

-- ─── 7. USER STORE ACCESS RLS ───────────────────────────────
DROP POLICY IF EXISTS "usa_select" ON user_store_access;
DROP POLICY IF EXISTS "usa_insert" ON user_store_access;
DROP POLICY IF EXISTS "usa_delete" ON user_store_access;
CREATE POLICY "usa_select" ON user_store_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "usa_insert" ON user_store_access
  FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "usa_delete" ON user_store_access
  FOR DELETE USING (get_user_role() = 'admin');

-- ─── 8. CATEGORIES RLS ──────────────────────────────────────
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- ─── 9. PRODUCTS RLS ────────────────────────────────────────
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (get_user_role() IN ('admin','staff'));
CREATE POLICY "products_update" ON products FOR UPDATE USING (get_user_role() IN ('admin','staff'));
CREATE POLICY "products_delete" ON products FOR DELETE USING (get_user_role() = 'admin');

-- ─── 10. STORE PRODUCTS RLS ─────────────────────────────────
DROP POLICY IF EXISTS "sp_select" ON store_products;
DROP POLICY IF EXISTS "sp_insert" ON store_products;
DROP POLICY IF EXISTS "sp_update" ON store_products;
CREATE POLICY "sp_select" ON store_products FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "sp_insert" ON store_products FOR INSERT
  WITH CHECK ((get_user_role() = 'admin' OR has_store_access(store_id)) AND get_user_role() IN ('admin','staff'));
CREATE POLICY "sp_update" ON store_products FOR UPDATE
  USING ((get_user_role() = 'admin' OR has_store_access(store_id)) AND get_user_role() IN ('admin','staff','cashier'));

-- ─── 11. STOCK MOVEMENTS RLS ────────────────────────────────
DROP POLICY IF EXISTS "sm_select" ON stock_movements;
DROP POLICY IF EXISTS "sm_insert" ON stock_movements;
CREATE POLICY "sm_select" ON stock_movements FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "sm_insert" ON stock_movements FOR INSERT
  WITH CHECK (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND (
      get_user_role() IN ('admin','staff')
      OR (get_user_role() = 'cashier' AND reason IN ('sale','return'))
    )
  );

-- ─── 12. CUSTOMERS RLS ──────────────────────────────────────
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated USING (true);

-- ─── 13. POS SESSIONS RLS ───────────────────────────────────
DROP POLICY IF EXISTS "sessions_select" ON pos_sessions;
DROP POLICY IF EXISTS "sessions_insert" ON pos_sessions;
DROP POLICY IF EXISTS "sessions_update" ON pos_sessions;
CREATE POLICY "sessions_select" ON pos_sessions FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "sessions_insert" ON pos_sessions FOR INSERT
  WITH CHECK (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND cashier_id = auth.uid()
    AND get_user_role() IN ('admin','cashier')
  );
CREATE POLICY "sessions_update" ON pos_sessions FOR UPDATE
  USING (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND (
      (cashier_id = auth.uid() AND get_user_role() IN ('admin','cashier'))
      OR get_user_role() = 'admin'
    )
  );

-- ─── 14. CASH MOVEMENTS RLS ─────────────────────────────────
DROP POLICY IF EXISTS "cm_select" ON cash_movements;
DROP POLICY IF EXISTS "cm_insert" ON cash_movements;
CREATE POLICY "cm_select" ON cash_movements FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "cm_insert" ON cash_movements FOR INSERT
  WITH CHECK (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND get_user_role() IN ('admin','cashier')
  );

-- ─── 15. SALES RLS ──────────────────────────────────────────
DROP POLICY IF EXISTS "sales_select" ON sales;
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;
CREATE POLICY "sales_select" ON sales FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND cashier_id = auth.uid()
    AND get_user_role() IN ('admin','cashier')
  );
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND get_user_role() = 'admin'
  );

-- ─── 16. SALE ITEMS RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "si_select" ON sale_items;
DROP POLICY IF EXISTS "si_insert" ON sale_items;
CREATE POLICY "si_select" ON sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE id = sale_items.sale_id
        AND (get_user_role() = 'admin' OR has_store_access(store_id))
    )
  );
CREATE POLICY "si_insert" ON sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE id = sale_items.sale_id
        AND (get_user_role() = 'admin' OR has_store_access(store_id))
    )
  );

-- ─── 17. RETURNS RLS ────────────────────────────────────────
DROP POLICY IF EXISTS "returns_select" ON returns;
DROP POLICY IF EXISTS "returns_insert" ON returns;
CREATE POLICY "returns_select" ON returns FOR SELECT TO authenticated
  USING (get_user_role() = 'admin' OR has_store_access(store_id));
CREATE POLICY "returns_insert" ON returns FOR INSERT
  WITH CHECK (
    (get_user_role() = 'admin' OR has_store_access(store_id))
    AND get_user_role() IN ('admin','cashier')
  );

-- ─── 18. RETURN ITEMS RLS ───────────────────────────────────
DROP POLICY IF EXISTS "ri_select" ON return_items;
DROP POLICY IF EXISTS "ri_insert" ON return_items;
CREATE POLICY "ri_select" ON return_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE r.id = return_items.return_id
        AND (get_user_role() = 'admin' OR has_store_access(s.store_id))
    )
  );
CREATE POLICY "ri_insert" ON return_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE r.id = return_items.return_id
        AND (get_user_role() = 'admin' OR has_store_access(s.store_id))
        AND get_user_role() IN ('admin','cashier')
    )
  );

-- ─── 19. AUDIT LOGS RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "al_select" ON audit_logs;
DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_select" ON audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
CREATE POLICY "al_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 20. TXN COUNTERS RLS ───────────────────────────────────
DROP POLICY IF EXISTS "tc_all" ON txn_counters;
CREATE POLICY "tc_all" ON txn_counters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 21. Branch sales summary function (for admin dashboard) ─
CREATE OR REPLACE FUNCTION get_branch_sales_summary(
  p_date_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day',
  p_date_to   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  store_id       UUID,
  store_code     TEXT,
  store_name     TEXT,
  txn_count      BIGINT,
  total_revenue  NUMERIC,
  total_vat      NUMERIC,
  total_discount NUMERIC,
  total_profit   NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.store_id,
    st.code   AS store_code,
    st.name   AS store_name,
    COUNT(s.id)::BIGINT                    AS txn_count,
    COALESCE(SUM(s.total), 0)              AS total_revenue,
    COALESCE(SUM(s.vat_amount), 0)         AS total_vat,
    COALESCE(SUM(s.discount_total), 0)     AS total_discount,
    COALESCE(SUM(
      (SELECT COALESCE(SUM(si.line_total - si.cost_snapshot * si.qty), 0)
       FROM sale_items si WHERE si.sale_id = s.id)
    ), 0)                                  AS total_profit
  FROM public.sales s
  JOIN public.stores st ON st.id = s.store_id
  WHERE s.created_at >= p_date_from
    AND s.created_at <= p_date_to
    AND s.status = 'completed'
    AND (
      get_user_role() = 'admin'
      OR has_store_access(s.store_id)
    )
  GROUP BY s.store_id, st.code, st.name
  ORDER BY total_revenue DESC;
$$;

GRANT EXECUTE ON FUNCTION get_branch_sales_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ─── 22. resolve_login_identity (idempotent) ────────────────
CREATE OR REPLACE FUNCTION resolve_login_identity(p_login TEXT)
RETURNS TABLE (
  email        TEXT,
  role         TEXT,
  is_active    BOOLEAN,
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
     OR LOWER(lu.email)    = LOWER(p_login)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_login_identity(TEXT) TO anon, authenticated;
