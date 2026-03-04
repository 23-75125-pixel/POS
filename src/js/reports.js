// src/js/reports.js
import db from './supabaseClient.js';
import { exportToCSV } from './utils.js';

function getDateRangeBounds(dateFrom, dateTo) {
  return {
    fromIso: `${dateFrom}T00:00:00+08:00`,
    toIso: `${dateTo}T23:59:59.999+08:00`
  };
}

export const reports = {
  async getSalesSummary(storeId, dateFrom, dateTo) {
    const { fromIso, toIso } = getDateRangeBounds(dateFrom, dateTo);
    let q = db.from('sales')
      .select('*, sale_items(qty, price, discount, cost_snapshot, line_total)')
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false });

    if (storeId) q = q.eq('store_id', storeId);

    const { data, error } = await q;
    if (error) throw error;

    const sales = data || [];
    const totalRevenue = sales.reduce((s, r) => s + (r.total || 0), 0);
    const totalCost = sales.reduce((s, r) => s + (r.sale_items || []).reduce((ss, i) => ss + ((i.cost_snapshot || 0) * i.qty), 0), 0);
    const totalVat = sales.reduce((s, r) => s + (r.vat_amount || 0), 0);
    const totalDiscount = sales.reduce((s, r) => s + (r.discount_total || 0), 0);
    const grossProfit = totalRevenue - totalCost;

    return {
      sales,
      summary: {
        totalTransactions: sales.length,
        totalRevenue,
        totalCost,
        grossProfit,
        grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0,
        totalVat,
        totalDiscount
      }
    };
  },

  async getTopProducts(storeId, dateFrom, dateTo, limit = 10) {
    const { fromIso, toIso } = getDateRangeBounds(dateFrom, dateTo);
    // Group by product from sale_items joining sales
    let salesQuery = db.from('sales')
      .select('id')
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (storeId) salesQuery = salesQuery.eq('store_id', storeId);

    const { data: salesIds, error: salesIdsError } = await salesQuery;
    if (salesIdsError) throw salesIdsError;

    if (!salesIds?.length) return [];

    const ids = salesIds.map(s => s.id);

    const { data, error } = await db.from('sale_items')
      .select('product_id, product_name, qty, line_total, cost_snapshot')
      .in('sale_id', ids);
    if (error) throw error;

    if (!data) return [];

    // Aggregate
    const map = {};
    data.forEach(item => {
      const key = item.product_id;
      if (!map[key]) {
        map[key] = { product_id: key, name: item.product_name, qty: 0, revenue: 0, cost: 0 };
      }
      map[key].qty += item.qty;
      map[key].revenue += item.line_total;
      map[key].cost += (item.cost_snapshot || 0) * item.qty;
    });

    return Object.values(map)
      .map(p => ({ ...p, profit: p.revenue - p.cost }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },

  async getCategorySales(storeId, dateFrom, dateTo) {
    const { fromIso, toIso } = getDateRangeBounds(dateFrom, dateTo);
    let salesQuery = db.from('sales')
      .select('id')
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (storeId) salesQuery = salesQuery.eq('store_id', storeId);

    const { data: salesIds, error: salesIdsError } = await salesQuery;
    if (salesIdsError) throw salesIdsError;

    if (!salesIds?.length) return [];

    const ids = salesIds.map(s => s.id);

    const { data, error } = await db.from('sale_items')
      .select('product_id, line_total, qty, products(category_id, categories(name, color))')
      .in('sale_id', ids);
    if (error) throw error;

    if (!data) return [];

    const map = {};
    data.forEach(item => {
      const catName = item.products?.categories?.name || 'Uncategorized';
      const catColor = item.products?.categories?.color || '#6b7280';
      if (!map[catName]) map[catName] = { name: catName, color: catColor, revenue: 0, qty: 0 };
      map[catName].revenue += item.line_total;
      map[catName].qty += item.qty;
    });

    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  },

  async getPaymentBreakdown(storeId, dateFrom, dateTo) {
    const { fromIso, toIso } = getDateRangeBounds(dateFrom, dateTo);
    let q = db.from('sales')
      .select('payment_json, total')
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    if (storeId) q = q.eq('store_id', storeId);

    const { data, error } = await q;
    if (error) throw error;

    if (!data) return [];

    const map = {};
    data.forEach(sale => {
      const payments = Array.isArray(sale.payment_json) ? sale.payment_json : [];
      payments.forEach(p => {
        if (!map[p.method]) map[p.method] = { method: p.method, amount: 0, count: 0 };
        map[p.method].amount += p.amount;
        map[p.method].count++;
      });
    });

    return Object.values(map).sort((a, b) => b.amount - a.amount);
  },

  async getDailySales(storeId, dateFrom, dateTo) {
    const { fromIso, toIso } = getDateRangeBounds(dateFrom, dateTo);
    let q = db.from('sales')
      .select('created_at, total, discount_total, vat_amount')
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at');
    if (storeId) q = q.eq('store_id', storeId);

    const { data, error } = await q;
    if (error) throw error;

    if (!data) return [];

    const map = {};
    data.forEach(sale => {
      const day = sale.created_at.split('T')[0];
      if (!map[day]) map[day] = { date: day, total: 0, count: 0, discount: 0, vat: 0 };
      map[day].total += sale.total;
      map[day].count++;
      map[day].discount += sale.discount_total || 0;
      map[day].vat += sale.vat_amount || 0;
    });

    return Object.values(map);
  },

  async getInventoryValuation(storeId) {
    const { data, error } = await db.from('store_products')
      .select('stock, products(name, sku, cost, price)')
      .eq('store_id', storeId);
    if (error) throw error;

    if (!data) return { items: [], totalCostValue: 0, totalRetailValue: 0 };

    const items = data.map(sp => ({
      name: sp.products?.name || '',
      sku: sp.products?.sku || '',
      stock: sp.stock,
      cost: sp.products?.cost || 0,
      price: sp.products?.price || 0,
      costValue: sp.stock * (sp.products?.cost || 0),
      retailValue: sp.stock * (sp.products?.price || 0)
    }));

    return {
      items,
      totalCostValue: items.reduce((s, i) => s + i.costValue, 0),
      totalRetailValue: items.reduce((s, i) => s + i.retailValue, 0)
    };
  },

  async exportSalesCSV(storeId, dateFrom, dateTo) {
    const { sales } = await this.getSalesSummary(storeId, dateFrom, dateTo);
    const rows = sales.map(s => ({
      txn_no: s.txn_no,
      date: s.created_at,
      subtotal: s.subtotal,
      discount: s.discount_total,
      vat: s.vat_amount,
      total: s.total,
      payment: JSON.stringify(s.payment_json),
      status: s.status
    }));
    exportToCSV(rows, `sales_${dateFrom}_${dateTo}`);
  }
};

export default reports;
