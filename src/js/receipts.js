// src/js/receipts.js
import { formatPeso, formatDate } from './utils.js';

export const receipts = {
  /**
   * Generate 80mm thermal receipt HTML
   */
  generate(sale) {
    const store = sale.stores || {};
    const items = sale.sale_items || [];
    const payments = Array.isArray(sale.payment_json) ? sale.payment_json : [];
    const isVatRegistered = store.vat_registered !== false;

    const paymentMethodLabels = {
      cash: 'Cash',
      gcash: 'GCash',
      maya: 'Maya',
      card: 'Card/Credit'
    };

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt ${sale.txn_no}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    width: 280px;
    padding: 8px;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .divider-solid { border-top: 1px solid #000; margin: 4px 0; }
  .store-name { font-size: 14px; font-weight: bold; }
  .row { display: flex; justify-content: space-between; }
  .row-3 { display: flex; }
  .row-3 .col-name { flex: 1; }
  .row-3 .col-qty { width: 40px; text-align: center; }
  .row-3 .col-price { width: 65px; text-align: right; }
  .spacer { height: 4px; }
  .footer { text-align: center; font-size: 10px; margin-top: 6px; }
  @media print {
    body { width: 280px; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="store-name">${store.name || 'POS Store'}</div>
    <div>${store.address || ''}</div>
    <div>TIN: ${store.tin || 'N/A'}</div>
    ${isVatRegistered ? '<div>VAT-Registered</div>' : ''}
  </div>
  
  <div class="divider-solid"></div>
  
  <div class="row"><span>OR No:</span><span class="bold">${sale.txn_no}</span></div>
  <div class="row"><span>Date:</span><span>${formatDate(sale.created_at, true)}</span></div>
  <div class="row"><span>Cashier:</span><span>${sale.profiles?.full_name || 'N/A'}</span></div>
  ${sale.customer_name ? `<div class="row"><span>Customer:</span><span>${sale.customer_name}</span></div>` : ''}
  ${(sale.is_senior || sale.is_pwd) ? `<div class="row"><span>Discount Type:</span><span>${sale.is_senior ? 'Senior' : 'PWD'}</span></div>` : ''}
  
  <div class="divider"></div>
  
  <div class="row-3 bold">
    <div class="col-name">Item</div>
    <div class="col-qty">Qty</div>
    <div class="col-price">Amount</div>
  </div>
  
  <div class="divider"></div>
  
  ${items.map(item => `
    <div class="row-3">
      <div class="col-name">${item.product_name || item.products?.name || ''}</div>
      <div class="col-qty">${item.qty}</div>
      <div class="col-price">${formatPeso(item.line_total)}</div>
    </div>
    <div style="font-size:10px; padding-left:2px;">
      ${formatPeso(item.price)} x ${item.qty}
      ${item.discount > 0 ? ` (Disc: ${formatPeso(item.discount)})` : ''}
    </div>
  `).join('')}
  
  <div class="divider"></div>
  
  <div class="row"><span>Subtotal:</span><span>${formatPeso(sale.subtotal)}</span></div>
  ${(sale.discount_total > 0) ? `<div class="row"><span>Discount:</span><span>-${formatPeso(sale.discount_total)}</span></div>` : ''}
  ${(sale.senior_discount > 0) ? `<div class="row"><span>Senior/PWD Disc:</span><span>-${formatPeso(sale.senior_discount)}</span></div>` : ''}
  
  <div class="divider-solid"></div>
  <div class="row bold"><span>TOTAL:</span><span>${formatPeso(sale.total)}</span></div>
  <div class="divider-solid"></div>
  
  <div class="spacer"></div>
  
  ${payments.map(p => `
    <div class="row"><span>${paymentMethodLabels[p.method] || p.method}:</span><span>${formatPeso(p.amount)}</span></div>
  `).join('')}
  
  ${sale.change_amount > 0 ? `<div class="row"><span>Change:</span><span>${formatPeso(sale.change_amount)}</span></div>` : ''}
  
  ${isVatRegistered ? `
    <div class="divider"></div>
    <div style="font-size:10px;">
      <div class="row"><span>VATable Sales:</span><span>${formatPeso(sale.vatable_sales)}</span></div>
      <div class="row"><span>VAT (12%):</span><span>${formatPeso(sale.vat_amount)}</span></div>
      <div class="row"><span>VAT-Exempt:</span><span>${formatPeso(sale.exempt_sales || 0)}</span></div>
    </div>
  ` : ''}
  
  <div class="divider"></div>
  <div class="footer">
    <div>${store.receipt_footer || 'Thank you for shopping with us!'}</div>
    <div class="spacer"></div>
    <div>This serves as your Official Receipt</div>
    <div style="font-size:9px;">Powered by PH-POS System</div>
  </div>
</body>
</html>`;
  },

  /**
   * Print receipt in new window
   */
  print(sale) {
    const html = this.generate(sale);
    const win = window.open('', '_blank', 'width=350,height=600,scrollbars=yes');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  },

  /**
   * Generate X Report (current session summary)
   */
  generateXReport(summary, store, cashier) {
    const { session, totalSales, totalTransactions, totalDiscounts, totalVat, totalCashIn, totalCashOut, movements } = summary;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>X Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 280px; padding: 8px; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; margin: 1px 0; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  @media print { @page { margin: 0; size: 80mm auto; } }
</style>
</head>
<body>
  <div class="center bold">*** X-REPORT ***</div>
  <div class="center">${store?.name || ''}</div>
  <div class="center">${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</div>
  <div class="divider"></div>
  <div class="row"><span>Cashier:</span><span>${cashier || ''}</span></div>
  <div class="row"><span>Session Start:</span><span>${new Date(session?.opened_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span></div>
  <div class="divider"></div>
  <div class="row"><span>Total Transactions:</span><span>${totalTransactions}</span></div>
  <div class="row"><span>Total Sales:</span><span>${formatPeso(totalSales)}</span></div>
  <div class="row"><span>Total Discounts:</span><span>-${formatPeso(totalDiscounts)}</span></div>
  <div class="row"><span>VAT Amount:</span><span>${formatPeso(totalVat)}</span></div>
  <div class="divider"></div>
  <div class="row"><span>Opening Cash:</span><span>${formatPeso(session?.opening_cash)}</span></div>
  <div class="row"><span>Cash In:</span><span>${formatPeso(totalCashIn)}</span></div>
  <div class="row"><span>Cash Out:</span><span>-${formatPeso(totalCashOut)}</span></div>
  <div class="row bold"><span>Expected Cash:</span><span>${formatPeso((session?.opening_cash || 0) + totalCashIn - totalCashOut)}</span></div>
  <div class="divider"></div>
  <div class="center">--- NOT OFFICIAL RECEIPT ---</div>
</body>
</html>`;
  },

  printXReport(summary, store, cashier) {
    const html = this.generateXReport(summary, store, cashier);
    const win = window.open('', '_blank', 'width=350,height=500');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }
};

export default receipts;
