// src/js/utils.js

/**
 * Format amount as Philippine Peso
 */
export function formatPeso(amount, decimals = 2) {
  if (isNaN(amount) || amount === null || amount === undefined) return '₱0.00';
  return '₱' + parseFloat(amount).toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format date to Philippine timezone (Asia/Manila)
 */
export function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '';
  const opts = {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  if (includeTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    opts.second = '2-digit';
    opts.hour12 = true;
  }
  return new Date(dateStr).toLocaleString('en-PH', opts);
}

/**
 * Get current Manila time as ISO string
 */
export function manilaTime() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Manila' });
}

/**
 * Get today's date string YYYYMMDD in Manila time
 */
export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).replace(/-/g, '');
}

/**
 * Compute VAT breakdown (VAT-inclusive)
 */
export function computeVat(total, vatRegistered = true) {
  if (!vatRegistered) {
    return { vatableSales: 0, vatAmount: 0, exemptSales: total };
  }
  const vatableSales = total / 1.12;
  const vatAmount = vatableSales * 0.12;
  return {
    vatableSales: parseFloat(vatableSales.toFixed(2)),
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    exemptSales: 0
  };
}

/**
 * Senior/PWD discount: 20% on VAT-exclusive amount
 */
export function computeSeniorDiscount(total) {
  const vatExclusive = total / 1.12;
  return parseFloat((vatExclusive * 0.20).toFixed(2));
}

/**
 * Generate a unique short ID
 */
export function shortId() {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

/**
 * Debounce function
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Show Bootstrap Toast notification
 */
export function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const id = 'toast-' + Date.now();
  const icons = {
    success: 'check-circle-fill',
    danger: 'exclamation-triangle-fill',
    warning: 'exclamation-circle-fill',
    info: 'info-circle-fill'
  };
  const colors = {
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  const toastHTML = `
    <div id="${id}" class="toast align-items-center border-0 mb-2" role="alert" style="background: #1e293b; border-left: 3px solid ${colors[type]} !important;">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2" style="color:#e2e8f0;">
          <i class="bi bi-${icons[type] || 'info-circle-fill'}" style="color:${colors[type]};font-size:1rem;"></i>
          <span>${message}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHTML);
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: duration });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

/**
 * Show loading overlay
 */
export function showLoading(text = 'Loading...') {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.querySelector('.loading-text').textContent = text;
    overlay.classList.remove('d-none');
  }
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('d-none');
}

/**
 * Confirm dialog using Bootstrap modal
 */
export function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) { resolve(window.confirm(message)); return; }
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    const btn = document.getElementById('confirm-ok-btn');
    const handler = () => { bsModal.hide(); resolve(true); btn.removeEventListener('click', handler); };
    btn.addEventListener('click', handler);
    modal.addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
  });
}

/**
 * Export array of objects to CSV
 */
export function exportToCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')];
  data.forEach(row => {
    rows.push(headers.map(h => {
      const val = row[h] === null || row[h] === undefined ? '' : row[h];
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse CSV text to array of objects
 */
export function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });
}

/**
 * Validate required fields in form
 */
export function validateForm(form) {
  let valid = true;
  form.querySelectorAll('[required]').forEach(el => {
    if (!el.value.trim()) {
      el.classList.add('is-invalid');
      valid = false;
    } else {
      el.classList.remove('is-invalid');
    }
  });
  return valid;
}

/**
 * Format number with commas
 */
export function formatNumber(n, decimals = 2) {
  return parseFloat(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Get first/last day of current month
 */
export function getCurrentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { first, last };
}

/**
 * Get date range for last N days
 */
export function getLastNDays(n) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n);
  return {
    first: start.toISOString().split('T')[0],
    last: end.toISOString().split('T')[0]
  };
}

export default {
  formatPeso, formatDate, manilaTime, todayStr,
  computeVat, computeSeniorDiscount, shortId,
  debounce, showToast, showLoading, hideLoading,
  confirmDialog, exportToCSV, parseCSV,
  validateForm, formatNumber, getCurrentMonthRange, getLastNDays
};
