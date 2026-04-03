// ── GLOBALS, CONSTANTS & SHARED STATE ──

let currentUser = null;
let allLogs = [];
let currentPage = 1;
let filteredTotal = 0;
let allExpenses = [];
let allDeposits = [];
const ITEMS_PER_PAGE = 10;

// ── PERSISTENT STORES (localStorage-backed) ──
// All overrides survive page refresh by reading/writing localStorage.

const LS_KEY_MONTHLY   = 'momocart_monthlyOverrides';
const LS_KEY_DEPOSIT   = 'momocart_depositRowsByMonth';
const LS_KEY_GRANDTOT  = 'momocart_grandTotalOverrides';
const LS_KEY_DEP_OV    = 'momocart_depositOverrides';
const LS_KEY_RECEIPTS  = 'momocart_depositReceipts'; // depositId → base64 image

function _lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch(e) { return {}; }
}
function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { /* quota ignore */ }
}

// Proxy-like accessors so existing code using [key] still works
// Monthly row overrides
const monthlyOverrides = new Proxy(_lsGet(LS_KEY_MONTHLY), {
    set(t, k, v) { t[k] = v; _lsSet(LS_KEY_MONTHLY, t); return true; },
    deleteProperty(t, k) { delete t[k]; _lsSet(LS_KEY_MONTHLY, t); return true; }
});

// Deposit manual rows
const depositRowsByMonth = new Proxy(_lsGet(LS_KEY_DEPOSIT), {
    set(t, k, v) { t[k] = v; _lsSet(LS_KEY_DEPOSIT, t); return true; },
    deleteProperty(t, k) { delete t[k]; _lsSet(LS_KEY_DEPOSIT, t); return true; }
});

// Grand total overrides
const grandTotalOverrides = new Proxy(_lsGet(LS_KEY_GRANDTOT), {
    set(t, k, v) { t[k] = v; _lsSet(LS_KEY_GRANDTOT, t); return true; },
    deleteProperty(t, k) { delete t[k]; _lsSet(LS_KEY_GRANDTOT, t); return true; }
});
// Notification polling timer
let notifPollTimer = null;

// Always send session cookie with every API request
function apiFetch(url, options = {}) {
    return fetch(url, { credentials: 'include', ...options });
}

// ── TIME FORMAT HELPER (24h → 12h AM/PM) ──
function to12h(timeStr) {
    if (!timeStr || timeStr === '--:--' || timeStr === '00:00') return null;
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
}


let activeBranch = 'all';   // 'all' | 'baliwag' | 'pampanga' | 'trinoma'
let activePeriod = 'daily';

const BRANCH_USERS = {
    baliwag:     ['baliwag'],
    pampanga:    ['pampanga'],
    trinoma:     ['trinoma'],
    smartwheels: ['smartwheels'],
    bataan:      ['bataan'],
};

const PRICES_REGULAR  = { '15kiddie': 120, '30': 100, '60': 150, '120': 300, '180': 450, 'unlimited': 600 };
const PRICES_DISCOUNT = { '15kiddie': 120, '30': 100, '60': 120, '120': 240, '180': 350, 'unlimited': 550 };
const PRICES_KIDDIE   = { '15kiddie': 120 };