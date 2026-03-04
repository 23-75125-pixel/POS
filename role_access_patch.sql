-- Apply updated role access matrix
-- Admin: full access
-- Staff: products + inventory + sales history
-- Cashier: POS only

-- CATEGORIES policies
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (get_user_role() = 'admin');
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (get_user_role() = 'admin');

-- PRODUCTS policies
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (get_user_role() IN ('admin','staff'));
CREATE POLICY "products_update" ON products FOR UPDATE USING (get_user_role() IN ('admin','staff'));

-- STORE PRODUCTS policies
DROP POLICY IF EXISTS "sp_insert" ON store_products;
DROP POLICY IF EXISTS "sp_update" ON store_products;
CREATE POLICY "sp_insert" ON store_products FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','staff'));
CREATE POLICY "sp_update" ON store_products FOR UPDATE
  USING (has_store_access(store_id) AND get_user_role() IN ('admin','staff','cashier'));

-- STOCK MOVEMENTS policies
DROP POLICY IF EXISTS "sm_insert" ON stock_movements;
CREATE POLICY "sm_insert" ON stock_movements FOR INSERT
  WITH CHECK (
    has_store_access(store_id)
    AND (
      get_user_role() IN ('admin','staff')
      OR (get_user_role() = 'cashier' AND reason IN ('sale','return'))
    )
  );

-- POS SESSIONS policies
DROP POLICY IF EXISTS "sessions_insert" ON pos_sessions;
DROP POLICY IF EXISTS "sessions_update" ON pos_sessions;
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
DROP POLICY IF EXISTS "cm_insert" ON cash_movements;
CREATE POLICY "cm_insert" ON cash_movements FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','cashier'));

-- SALES policies
DROP POLICY IF EXISTS "sales_insert" ON sales;
DROP POLICY IF EXISTS "sales_update" ON sales;
CREATE POLICY "sales_insert" ON sales FOR INSERT
  WITH CHECK (has_store_access(store_id) AND cashier_id = auth.uid() AND get_user_role() IN ('admin','cashier'));
CREATE POLICY "sales_update" ON sales FOR UPDATE
  USING (has_store_access(store_id) AND get_user_role() = 'admin');

-- RETURNS policies
DROP POLICY IF EXISTS "returns_insert" ON returns;
CREATE POLICY "returns_insert" ON returns FOR INSERT
  WITH CHECK (has_store_access(store_id) AND get_user_role() IN ('admin','cashier'));

-- RETURN ITEMS policies
DROP POLICY IF EXISTS "ri_insert" ON return_items;
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
CREATE POLICY "al_select" ON audit_logs FOR SELECT
  USING (user_id = auth.uid() OR get_user_role() = 'admin');
