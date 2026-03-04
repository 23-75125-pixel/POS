// src/js/pos.js
import db from './supabaseClient.js';
import auth from './auth.js';
import { computeVat } from './utils.js';

export const posSession = {
  current: null,

  async loadCurrent(storeId, cashierId) {
    const { data, error } = await db.from('pos_sessions')
      .select('*')
      .eq('store_id', storeId)
      .eq('cashier_id', cashierId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    this.current = data;
    return data;
  },

  async open(storeId, cashierId, openingCash) {
    const { data, error } = await db.from('pos_sessions').insert({
      store_id: storeId,
      cashier_id: cashierId,
      opening_cash: parseFloat(openingCash),
      status: 'open'
    }).select().single();
    if (error) throw error;

    // Log opening cash movement
    await db.from('cash_movements').insert({
      session_id: data.id,
      store_id: storeId,
      type: 'opening',
      amount: parseFloat(openingCash),
      note: 'Opening cash',
      created_by: cashierId
    });

    this.current = data;
    await auth.logAction('session_open', 'pos_sessions', data.id, null, { opening_cash: openingCash });
    return data;
  },

  async close(sessionId, closingCash, notes = '') {
    // Calculate expected cash
    const { data: movements, error: movementsError } = await db.from('cash_movements')
      .select('type, amount')
      .eq('session_id', sessionId);
    if (movementsError) throw movementsError;

    let expected = 0;
    (movements || []).forEach(m => {
      if (['opening', 'cash_in', 'sale'].includes(m.type)) expected += m.amount;
      if (['cash_out', 'refund'].includes(m.type)) expected -= m.amount;
    });

    const variance = parseFloat(closingCash) - expected;

    const { data, error } = await db.from('pos_sessions').update({
      closed_at: new Date().toISOString(),
      closing_cash: parseFloat(closingCash),
      expected_cash: expected,
      variance,
      notes,
      status: 'closed'
    }).eq('id', sessionId).select().single();
    if (error) throw error;

    this.current = null;
    await auth.logAction('session_close', 'pos_sessions', sessionId, null, { closing_cash: closingCash, variance });
    return data;
  },

  async cashIn(sessionId, storeId, amount, note = '') {
    const { error } = await db.from('cash_movements').insert({
      session_id: sessionId,
      store_id: storeId,
      type: 'cash_in',
      amount: parseFloat(amount),
      note,
      created_by: auth.currentUser?.id
    });
    if (error) throw error;
  },

  async cashOut(sessionId, storeId, amount, note = '') {
    const { error } = await db.from('cash_movements').insert({
      session_id: sessionId,
      store_id: storeId,
      type: 'cash_out',
      amount: parseFloat(amount),
      note,
      created_by: auth.currentUser?.id
    });
    if (error) throw error;
  },

  async getSummary(sessionId) {
    const { data: session, error: sessionError } = await db.from('pos_sessions').select('*').eq('id', sessionId).single();
    if (sessionError) throw sessionError;
    const { data: sales, error: salesError } = await db.from('sales').select('total, discount_total, vat_amount, status').eq('session_id', sessionId);
    if (salesError) throw salesError;
    const { data: movements, error: movementsError } = await db.from('cash_movements').select('*').eq('session_id', sessionId);
    if (movementsError) throw movementsError;

    const completed = (sales || []).filter(s => s.status === 'completed');
    const totalSales = completed.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalDiscounts = completed.reduce((sum, s) => sum + (s.discount_total || 0), 0);
    const totalVat = completed.reduce((sum, s) => sum + (s.vat_amount || 0), 0);
    const totalCashIn = (movements || []).filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0);
    const totalCashOut = (movements || []).filter(m => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0);

    return {
      session,
      totalSales,
      totalTransactions: completed.length,
      totalDiscounts,
      totalVat,
      totalCashIn,
      totalCashOut,
      movements
    };
  }
};

export const sales = {
  /**
   * Process a sale transaction
   */
  async process(saleData) {
    const {
      storeId, sessionId, cashierId, items,
      payments, discountTotal = 0,
      customerId = null, customerName = '',
      notes = ''
    } = saleData;

    const store = auth.currentStore;
    const vatRegistered = store?.vat_registered !== false;

    // Calculate subtotal from items
    let subtotal = items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    const grandTotal = subtotal - discountTotal;

    const finalTotal = grandTotal;
    const vatBreakdown = computeVat(finalTotal, vatRegistered);
    const amountTendered = payments.reduce((s, p) => s + p.amount, 0);
    const change = payments.find(p => p.method === 'cash')
      ? Math.max(0, amountTendered - finalTotal)
      : 0;

    // Get next TXN number
    const { data: txnData, error: txnError } = await db.rpc('get_next_txn_no', {
      p_store_id: storeId,
      p_store_code: store?.code || 'STR'
    });
    if (txnError) throw txnError;

    // Create sale record
    const { data: sale, error: saleError } = await db.from('sales').insert({
      store_id: storeId,
      session_id: sessionId,
      cashier_id: cashierId,
      customer_id: customerId,
      txn_no: txnData,
      subtotal,
      discount_total: discountTotal,
      vatable_sales: vatBreakdown.vatableSales,
      vat_amount: vatBreakdown.vatAmount,
      exempt_sales: vatBreakdown.exemptSales,
      total: finalTotal,
      amount_tendered: amountTendered,
      change_amount: change,
      payment_json: payments,
      customer_name: customerName,
      is_senior: false,
      is_pwd: false,
      senior_discount: 0,
      status: 'completed',
      notes
    }).select().single();
    if (saleError) throw saleError;

    // Create sale items
    const saleItems = items.map(item => ({
      sale_id: sale.id,
      product_id: item.product_id,
      product_name: item.name,
      sku: item.sku,
      qty: item.qty,
      price: item.price,
      original_price: item.original_price || item.price,
      discount: item.discount || 0,
      discount_type: item.discount_type || 'fixed',
      cost_snapshot: item.cost || 0,
      line_total: item.line_total
    }));

    const { error: saleItemsError } = await db.from('sale_items').insert(saleItems);
    if (saleItemsError) throw saleItemsError;

    // Deduct stock for each item
    for (const item of items) {
      await this.deductStock(storeId, item.product_id, item.qty, sale.id);
    }

    // Log cash movement for cash payment
    const cashPayment = payments.find(p => p.method === 'cash');
    if (cashPayment && sessionId) {
      const { error: cashMovementError } = await db.from('cash_movements').insert({
        session_id: sessionId,
        store_id: storeId,
        type: 'sale',
        amount: cashPayment.amount - change,
        note: `Sale ${txnData}`,
        created_by: cashierId
      });
      if (cashMovementError) throw cashMovementError;
    }

    return { ...sale, items: saleItems };
  },

  async deductStock(storeId, productId, qty, saleId) {
    const { data: sp, error: stockReadError } = await db.from('store_products')
      .select('stock').eq('store_id', storeId).eq('product_id', productId).single();
    if (stockReadError) throw stockReadError;

    const qtyBefore = sp?.stock || 0;
    const qtyAfter = Math.max(0, qtyBefore - qty);

    const { error: stockUpdateError } = await db.from('store_products')
      .update({ stock: qtyAfter, updated_at: new Date().toISOString() })
      .eq('store_id', storeId).eq('product_id', productId);
    if (stockUpdateError) throw stockUpdateError;

    const { error: movementError } = await db.from('stock_movements').insert({
      store_id: storeId,
      product_id: productId,
      qty_change: -qty,
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      reason: 'sale',
      reference_id: saleId,
      created_by: auth.currentUser?.id
    });
    if (movementError) throw movementError;
  },

  async getByTxnNo(txnNo) {
    const { data, error } = await db.from('sales')
      .select(`*, sale_items(*, products(name, sku, unit)), profiles(full_name), stores(name, code, address, tin, vat_registered)`)
      .eq('txn_no', txnNo).single();
    if (error) return null;
    return data;
  },

  async getById(id) {
    const { data, error } = await db.from('sales')
      .select(`*, sale_items(*, products(name, sku, unit)), profiles(full_name), stores(name, code, address, tin, vat_registered)`)
      .eq('id', id).single();
    if (error) return null;
    return data;
  },

  async voidSale(saleId, reason) {
    const sale = await this.getById(saleId);
    if (!sale) throw new Error('Sale not found');
    if (sale.status === 'voided') throw new Error('Already voided');

    const { error: voidError } = await db.from('sales').update({ status: 'voided', void_reason: reason }).eq('id', saleId);
    if (voidError) throw voidError;

    // Restock items
    for (const item of sale.sale_items || []) {
      const { data: sp, error: stockReadError } = await db.from('store_products')
        .select('stock').eq('store_id', sale.store_id).eq('product_id', item.product_id).single();
      if (stockReadError) throw stockReadError;
      const qtyBefore = sp?.stock || 0;
      const qtyAfter = qtyBefore + item.qty;

      const { error: stockUpdateError } = await db.from('store_products')
        .update({ stock: qtyAfter }).eq('store_id', sale.store_id).eq('product_id', item.product_id);
      if (stockUpdateError) throw stockUpdateError;

      const { error: movementError } = await db.from('stock_movements').insert({
        store_id: sale.store_id,
        product_id: item.product_id,
        qty_change: item.qty,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        reason: 'return',
        reference_id: saleId,
        created_by: auth.currentUser?.id
      });
      if (movementError) throw movementError;
    }

    await auth.logAction('sale_void', 'sales', saleId, null, { reason });
  },

  async processReturn(returnData) {
    const { storeId, saleId, cashierId, items, refundMethod, reason, restock } = returnData;

    const totalRefund = items.reduce((s, i) => s + i.line_total, 0);

    // Get return TXN number (prefix with RTN)
    const { data: txnData, error: txnError } = await db.rpc('get_next_txn_no', {
      p_store_id: storeId,
      p_store_code: 'RTN'
    });
    if (txnError) throw txnError;

    const { data: ret, error } = await db.from('returns').insert({
      store_id: storeId,
      sale_id: saleId,
      cashier_id: cashierId,
      return_txn_no: txnData,
      total_refund: totalRefund,
      refund_method: refundMethod,
      reason,
      restock
    }).select().single();
    if (error) throw error;

    // Create return items
    const { error: returnItemsError } = await db.from('return_items').insert(
      items.map(i => ({
        return_id: ret.id,
        sale_item_id: i.sale_item_id,
        product_id: i.product_id,
        qty: i.qty,
        price: i.price,
        line_total: i.line_total
      }))
    );
    if (returnItemsError) throw returnItemsError;

    // Restock if requested
    if (restock) {
      for (const item of items) {
        const { data: sp, error: stockReadError } = await db.from('store_products')
          .select('stock').eq('store_id', storeId).eq('product_id', item.product_id).single();
        if (stockReadError) throw stockReadError;
        const qtyBefore = sp?.stock || 0;
        const { error: stockUpdateError } = await db.from('store_products')
          .update({ stock: qtyBefore + item.qty }).eq('store_id', storeId).eq('product_id', item.product_id);
        if (stockUpdateError) throw stockUpdateError;
        const { error: movementError } = await db.from('stock_movements').insert({
          store_id: storeId, product_id: item.product_id,
          qty_change: item.qty, qty_before: qtyBefore, qty_after: qtyBefore + item.qty,
          reason: 'return', reference_id: ret.id, created_by: cashierId
        });
        if (movementError) throw movementError;
      }
    }

    await auth.logAction('sale_return', 'returns', ret.id, null, { total_refund: totalRefund });
    return ret;
  }
};

export default { posSession, sales };
