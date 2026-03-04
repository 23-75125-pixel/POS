// src/js/products.js
import db from './supabaseClient.js';
import auth from './auth.js';
import { showToast, exportToCSV, parseCSV } from './utils.js';

export const products = {
  async getAll(includeInactive = false) {
    let q = db.from('products')
      .select(`*, categories(id, name, color)`)
      .order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getWithStock(storeId) {
    const { data, error } = await db
      .from('products')
      .select(`
        *,
        categories(id, name, color),
        store_products!inner(store_id, stock, reorder_level, is_available)
      `)
      .eq('store_products.store_id', storeId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data || []).map(p => ({
      ...p,
      stock: Number(p.store_products[0]?.stock || 0),
      reorder_level: Number(p.store_products[0]?.reorder_level || 5),
      is_available: p.store_products[0]?.is_available !== false
    }));
  },

  async getById(id) {
    const { data, error } = await db.from('products')
      .select(`*, categories(id, name, color)`)
      .eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async searchByBarcode(barcode, storeId) {
    const { data, error } = await db
      .from('products')
      .select(`
        *,
        categories(id, name, color),
        store_products(store_id, stock, reorder_level, is_available)
      `)
      .eq('barcode', barcode)
      .eq('is_active', true)
      .eq('store_products.store_id', storeId)
      .limit(1).single();
    if (error) return null;
    const sp = data?.store_products?.find(sp => sp.store_id === storeId);
    return {
      ...data,
      stock: Number(sp?.stock || 0),
      reorder_level: Number(sp?.reorder_level || 5),
      is_available: sp?.is_available !== false
    };
  },

  async create(productData) {
    const { data, error } = await db.from('products').insert(productData).select().single();
    if (error) throw error;
    await auth.logAction('product_create', 'products', data.id, null, productData);
    return data;
  },

  async update(id, updates) {
    const old = await this.getById(id);
    const { data, error } = await db.from('products').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    await auth.logAction('product_update', 'products', id, old, updates);
    return data;
  },

  async delete(id) {
    const { error } = await db.from('products').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    await auth.logAction('product_delete', 'products', id);
  },

  async adjustStock(storeId, productId, qtyChange, reason, notes = '') {
    // Get current stock
    const { data: sp, error: stockReadError } = await db.from('store_products')
      .select('stock').eq('store_id', storeId).eq('product_id', productId).single();
    if (stockReadError) throw stockReadError;

    const qtyBefore = sp?.stock || 0;
    const qtyAfter = qtyBefore + qtyChange;

    if (qtyAfter < 0) throw new Error('Insufficient stock');

    // Update stock
    const { error: stockUpdateError } = await db.from('store_products')
      .update({ stock: qtyAfter, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('product_id', productId);
    if (stockUpdateError) throw stockUpdateError;

    // Log movement
    const { error: movementError } = await db.from('stock_movements').insert({
      store_id: storeId,
      product_id: productId,
      qty_change: qtyChange,
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      reason,
      notes,
      created_by: auth.currentUser?.id
    });
    if (movementError) throw movementError;

    return { qtyBefore, qtyAfter };
  },

  async getStockMovements(storeId, productId = null, limit = 50) {
    let q = db.from('stock_movements')
      .select(`*, products(name, sku), profiles(full_name)`)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getLowStock(storeId) {
    const { data, error } = await db.from('store_products')
      .select(`*, products(name, sku, unit)`)
      .eq('store_id', storeId);
    if (error) throw error;
    return (data || []).filter(row => Number(row.stock || 0) <= Number(row.reorder_level || 0));
  },

  async importFromCSV(csvText, storeId) {
    const rows = parseCSV(csvText);
    const results = { success: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        if (!row.name || !row.sku || !row.price) {
          results.failed++;
          results.errors.push(`Row skipped: missing required fields (name, sku, price)`);
          continue;
        }

        const productData = {
          sku: row.sku?.trim(),
          barcode: row.barcode?.trim() || null,
          name: row.name?.trim(),
          unit: row.unit?.trim() || 'pcs',
          cost: parseFloat(row.cost) || 0,
          price: parseFloat(row.price),
          vat_inclusive: row.vat_inclusive?.toLowerCase() !== 'false'
        };

        // Find category
        if (row.category) {
          const { data: cat, error: categoryError } = await db.from('categories').select('id').ilike('name', row.category).single();
          if (categoryError && categoryError.code !== 'PGRST116') throw categoryError;
          if (cat) productData.category_id = cat.id;
        }

        // Upsert product
        const { data: prod, error } = await db.from('products')
          .upsert(productData, { onConflict: 'sku' }).select().single();
        if (error) throw error;

        // Set stock for store
        const stock = parseFloat(row.stock) || 0;
        const { error: storeProductUpsertError } = await db.from('store_products').upsert({
          store_id: storeId,
          product_id: prod.id,
          stock,
          reorder_level: parseFloat(row.reorder_level) || 5
        }, { onConflict: 'store_id,product_id' });
        if (storeProductUpsertError) throw storeProductUpsertError;

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${row.sku || row.name}: ${err.message}`);
      }
    }
    return results;
  },

  async exportToCSV(storeId) {
    const prods = await this.getWithStock(storeId);
    const rows = prods.map(p => ({
      sku: p.sku,
      barcode: p.barcode || '',
      name: p.name,
      category: p.categories?.name || '',
      unit: p.unit,
      cost: p.cost,
      price: p.price,
      vat_inclusive: p.vat_inclusive,
      stock: p.stock,
      reorder_level: p.reorder_level
    }));
    exportToCSV(rows, `products_${storeId}_${new Date().toISOString().split('T')[0]}`);
  }
};

// Categories
export const categories = {
  async getAll() {
    const { data, error } = await db.from('categories').select('*').order('sort_order');
    if (error) throw error;
    return data || [];
  },
  async create(data) {
    const { data: cat, error } = await db.from('categories').insert(data).select().single();
    if (error) throw error;
    return cat;
  },
  async update(id, data) {
    const { data: cat, error } = await db.from('categories').update(data).eq('id', id).select().single();
    if (error) throw error;
    return cat;
  },
  async delete(id) {
    const { error } = await db.from('categories').delete().eq('id', id);
    if (error) throw error;
  }
};

export default products;
