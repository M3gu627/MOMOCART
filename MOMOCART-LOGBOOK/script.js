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

// Admin filter state
let activeBranch = 'all';   // 'all' | 'baliwag' | 'pampanga' | 'trinoma'
let activePeriod = 'daily';

// ── INITIALIZATION ──
window.onload = async function() {
    if (window.location.pathname.includes('dashboard.html')) {
        await checkSession();
    }

    const dateInput = document.getElementById('header-date');
    if (dateInput) {
        dateInput.addEventListener('change', () => {
            currentPage = 1;
            renderTable();
        });
    }
};

// ── SESSION CHECK ──
// Uses a dedicated endpoint to avoid any conflict with the login action
async function checkSession() {
    try {
        const response = await apiFetch('api.php?action=checkSession');
        const result = await response.json();
        if (result.success && result.user) {
            currentUser = result.user;
            const dateInput = document.getElementById('header-date');
            if (dateInput) {
                // Use local date (not UTC) so Philippine timezone shows correct date
                const today = new Date();
                const localDate = today.getFullYear() + '-' +
                    String(today.getMonth() + 1).padStart(2, '0') + '-' +
                    String(today.getDate()).padStart(2, '0');
                dateInput.value = localDate;
            }
            renderApp();
            await loadLogs();
        } else {
            window.location.href = 'index.html';
        }
    } catch (e) {
        console.error("Session check failed:", e);
        window.location.href = 'index.html';
    }
}

// ── AUTH ──

// Admin login (called from index.html button)
async function handleAdminLogin() {
    const pw = document.getElementById('password-input').value;
    if (!pw) return;
    const formData = new FormData();
    formData.append('username', 'admin');
    formData.append('password', pw);
    await performLogin(formData);
}

// Branch modal state
let currentBranchUsername = null;

function showBranchModal(branch) {
    currentBranchUsername = branch;
    const titles = { pampanga: 'Pampanga', baliwag: 'Baliwag', trinoma: 'Trinoma', smartwheels: 'Smart Wheels', bataan: 'Bataan' };
    document.getElementById('branch-modal-sub').textContent = titles[branch] + ' Branch Login';
    document.getElementById('branch-password-input').value = '';
    document.getElementById('branch-login-error').classList.add('hidden');
    document.getElementById('branch-modal').showModal();
    setTimeout(() => document.getElementById('branch-password-input').focus(), 100);
}

function closeBranchModal() {
    document.getElementById('branch-modal').close();
    currentBranchUsername = null;
}

async function submitBranchLogin() {
    if (!currentBranchUsername) return;
    const pw = document.getElementById('branch-password-input').value;
    if (!pw) return;

    const formData = new FormData();
    formData.append('username', currentBranchUsername);
    formData.append('password', pw);

    const errEl = document.getElementById('branch-login-error');
    errEl.classList.add('hidden');

    try {
        const response = await apiFetch('api.php?action=login', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            window.location.href = 'dashboard.html';
        } else {
            errEl.classList.remove('hidden');
            document.getElementById('branch-password-input').value = '';
            document.getElementById('branch-password-input').focus();
        }
    } catch (error) {
        alert("❌ Login error. Please try again.");
    }
}

async function performLogin(formData) {
    try {
        const response = await apiFetch('api.php?action=login', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            window.location.href = 'dashboard.html';
        } else {
            alert("❌ Login failed: " + (result.message || 'Invalid credentials'));
        }
    } catch (error) {
        alert("❌ Login error.");
    }
}

async function logout() {
    await apiFetch('api.php?action=logout');
    window.location.href = 'index.html';
}

// ── DELETE LOG ──
let pendingDeleteId = null;

// Single unified event delegation — edit + delete, no conflicts
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
        e.stopPropagation();
        const id = parseInt(editBtn.dataset.editId);
        if (id) openEditPanel(id);
        return;
    }
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
        e.stopPropagation();
        const id   = parseInt(deleteBtn.dataset.deleteId);
        const name = deleteBtn.dataset.deleteName;
        showDeleteModal(id, name);
        return;
    }
});

function showDeleteModal(id, name) {
    pendingDeleteId = id;
    document.getElementById('delete-modal-desc').textContent = `Customer: ${name}`;
    document.getElementById('delete-modal').showModal();
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal').close();
}

async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
        const res = await apiFetch('api.php?action=deleteLog', {
            method: 'POST',
            body: JSON.stringify({ id: pendingDeleteId })
        });
        const result = await res.json();
        if (result.success) {
            closeDeleteModal();
            await loadLogs();
        } else {
            alert('❌ Failed to delete: ' + (result.message || 'Unknown error'));
        }
    } catch (e) {
        alert('❌ Network error. Please try again.');
    }
}

// ── DASHBOARD LOGIC ──
async function loadLogs() {
    try {
        const [logsRes, expRes, depRes] = await Promise.all([
            apiFetch('api.php?action=getLogs'),
            apiFetch('api.php?action=getExpenses'),
            apiFetch('api.php?action=getDeposits')
        ]);
        const logsData = await logsRes.json();
        const expData  = await expRes.json();
        const depData  = await depRes.json();
        allLogs     = Array.isArray(logsData) ? logsData : [];
        allExpenses = Array.isArray(expData)  ? expData  : [];
        allDeposits = Array.isArray(depData)  ? depData  : [];
    } catch(e) {
        console.error('loadLogs error:', e);
        allLogs = []; allExpenses = []; allDeposits = [];
    }
    renderCurrentTab();
}

function renderApp() {
    document.getElementById('user-name').textContent = currentUser.displayName;
    document.getElementById('user-role').innerHTML = currentUser.role === 'admin'
        ? '👑 PARENT ACCOUNT • Can view ALL records'
        : '👷 EMPLOYEE ACCOUNT';

    if (currentUser.role === 'admin') {
        // Hide individual action buttons
        const expBtn = document.getElementById('expenses-btn');
        if (expBtn) expBtn.classList.add('hidden');
        const recBtn = document.getElementById('new-entry-btn');
        if (recBtn) recBtn.classList.add('hidden');

        // Hide the entire action buttons wrapper
        const actionWrap = document.getElementById('action-buttons-wrap');
        if (actionWrap) {
            actionWrap.classList.add('hidden');
            actionWrap.classList.remove('flex');
        }

        // Hide the Floating Action Button (FAB) for mobile
        const fabBtn = document.getElementById('fab-btn');
        if (fabBtn) fabBtn.classList.add('hidden');

        // Hide branch and period header elements
        const branchEl = document.getElementById('header-branch-wrap');
        if (branchEl) branchEl.classList.add('hidden');

        const periodHeader = document.getElementById('period-header-wrap');
        if (periodHeader) periodHeader.classList.add('hidden');

        document.getElementById('th-employee').classList.remove('hidden');

        // Admin gets all tabs — show Weekly, Monthly, Yearly, Daily
        ['tab-daily', 'tab-weekly', 'tab-monthly', 'tab-yearly'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('hidden');
        });
        // Hide employee-only tabs from admin
        ['tab-expenses', 'tab-deposit'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
        });
        // Also hide deposit button from admin action bar (already hidden via action-buttons-wrap)
        const depBtn = document.getElementById('deposit-btn');
        if (depBtn) depBtn.classList.add('hidden');

        buildAdminToolbar();

        // Show notification bell (admin only) and start polling
        const notifWrap = document.getElementById('notif-wrap');
        if (notifWrap) notifWrap.classList.remove('hidden');
        startNotifPolling();
    } else {
        // Reveal action buttons only for non-admin employees
        const actionWrap = document.getElementById('action-buttons-wrap');
        if (actionWrap) { actionWrap.classList.remove('hidden'); actionWrap.classList.add('flex'); }
        const fabBtn = document.getElementById('fab-btn');
        if (fabBtn) fabBtn.classList.remove('hidden');

        // Hide Weekly, Monthly, Yearly, Daily tabs — branch accounts see Logs, Expenses, Deposit
        ['tab-daily', 'tab-weekly', 'tab-monthly', 'tab-yearly'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
        });
        // Show employee-specific tabs
        ['tab-expenses', 'tab-deposit'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('hidden');
        });
    }
    currentTab = 0;
}


function buildAdminToolbar() {
    const titleEl = document.getElementById('view-title');
    if (titleEl) titleEl.innerHTML = `ALL EMPLOYEES LOGBOOK`;

    const tableHeaderBar = document.getElementById('table-header-bar');
    if (!tableHeaderBar) return;

    const branches = [
        { key: 'all',         label: 'All' },
        { key: 'baliwag',     label: 'Baliwag' },
        { key: 'pampanga',    label: 'Pampanga' },
        { key: 'trinoma',     label: 'Trinoma' },
        { key: 'smartwheels', label: 'Smart Wheels' },
        { key: 'bataan',      label: 'Bataan' },
    ];

    let toolbar = document.getElementById('admin-toolbar');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'admin-toolbar';
        toolbar.className = 'px-4 sm:px-5 py-3 border-b bg-slate-50 flex flex-wrap gap-2 items-center justify-between';
        tableHeaderBar.after(toolbar);
    }

    toolbar.innerHTML = `
        <div class="flex flex-wrap gap-2 items-center">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Branch:</span>
            ${branches.map(b => `
                <button onclick="setBranch('${b.key}')"
                    id="branch-btn-${b.key}"
                    class="branch-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${activeBranch === b.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}">
                    ${b.label}
                </button>
            `).join('')}
        </div>
    `;
}

function setBranch(branch) {
    activeBranch = branch;
    currentPage = 1;
    buildAdminToolbar();
    renderCurrentTab();
}

// setPeriod removed — period buttons removed from header UI


// Branch → username mapping
const BRANCH_USERS = {
    baliwag:     ['baliwag'],
    pampanga:    ['pampanga'],
    trinoma:     ['trinoma'],
    smartwheels: ['smartwheels'],
    bataan:      ['bataan'],
};

function renderTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const selectedDate = document.getElementById('header-date').value;

    let filteredLogs = currentUser.role === 'admin'
        ? allLogs
        : allLogs.filter(log => log.employee_username === currentUser.username);

    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const branchUsers = BRANCH_USERS[activeBranch] || [];
        filteredLogs = filteredLogs.filter(log => branchUsers.includes(log.employee_username));
    }

    if (selectedDate) {
        filteredLogs = filteredLogs.filter(log => log.created_at && log.created_at.startsWith(selectedDate));
    }

    const allPagesTotal = filteredLogs.reduce((sum, log) => {
        const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
        const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
        return sum + base + addl;
    }, 0);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    if (filteredLogs.length === 0) {
        document.getElementById('empty-state').classList.remove('hidden');
        updateTotalsDisplay(0, 0, 0);
        renderPagination(0);
        return;
    }

    document.getElementById('empty-state').classList.add('hidden');

    let pageTotal = 0;

    paginatedLogs.forEach((log, index) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 border-b border-slate-100';
        const isReturned = log.return_status === 'Returned';

        let html = '';

        if (currentUser.role === 'admin')
            html += `<td class="px-4 py-4 font-bold text-cyan-600">${log.employee_username}</td>`;

        const baseAmount = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
        const addlAmount = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
        const rowTotal = baseAmount + addlAmount;
        pageTotal += rowTotal;

        const isUnlimited = !log.time_out || log.time_out === '00:00';
        const timeInDisplay = to12h(log.time_in) || '—';
        const timeOutDisplay = isUnlimited
            ? '<span class="text-slate-400 text-[10px] font-mono">No Limit</span>'
            : `<span class="font-mono text-rose-500">${to12h(log.time_out)}</span>`;
        const returnTimeDisplay = log.return_time
            ? `<span class="font-mono text-slate-600">${to12h(log.return_time) || log.return_time}</span>`
            : '<span class="text-slate-300">—</span>';

        const actionCell = currentUser.role === 'admin'
            ? `<td class="px-4 py-4 text-center">
                <div class="flex flex-col items-center gap-1">
                    <button data-edit-id="${log.id}"
                        class="action-btn edit-btn bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors">
                        EDIT
                    </button>
                    <button data-delete-id="${log.id}" data-delete-name="${log.name.replace(/"/g, '&quot;')}"
                        class="action-btn delete-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                        DELETE
                    </button>
                </div>
               </td>`
            : `<td class="px-4 py-4 text-center">
                <div class="flex flex-col items-center gap-1">
                    ${isReturned || log.return_time
                        ? `<span class="text-emerald-600 text-[10px] font-bold">✓ ${to12h(log.return_time) || log.return_time}</span>`
                        : `<button onclick="markReturned(${log.id})" class="bg-amber-400 text-white px-3 py-1 rounded-xl text-[10px] font-bold">RETURN</button>`}
                    <button data-edit-id="${log.id}"
                        class="action-btn edit-btn bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors mt-1">
                        EDIT
                    </button>
                    <button data-delete-id="${log.id}" data-delete-name="${log.name.replace(/"/g, '&quot;')}"
                        class="action-btn delete-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors mt-1">
                        DELETE
                    </button>
                </div>
               </td>`;

        html += `
            <td class="px-4 py-4 text-slate-400">${startIndex + index + 1}</td>
            <td class="px-4 py-4 font-bold text-slate-700">${log.name}</td>
            <td class="px-4 py-4 text-slate-500 text-[10px]">${log.address || '—'}</td>
            <td class="px-4 py-4">${log.waiver}</td>
            <td class="px-4 py-4 font-mono text-[10px]">${log.or_number}</td>
            <td class="px-4 py-4">${log.cart_number}</td>
            <td class="px-4 py-4">${log.valid_id}</td>
            <td class="px-4 py-4 font-mono text-emerald-600 whitespace-nowrap">${timeInDisplay}</td>
            <td class="px-4 py-4 whitespace-nowrap">${timeOutDisplay}</td>
            <td class="px-4 py-4 whitespace-nowrap">${returnTimeDisplay}</td>
            <td class="px-4 py-4">${(()=>{
                if (!log.return_time || !log.time_out || log.time_out === '00:00') return '<span class="text-slate-300">—</span>';
                const [outH, outM] = log.time_out.split(':').map(Number);
                const [retH, retM] = log.return_time.split(':').map(Number);
                const diffSecs = (retH * 3600 + retM * 60) - (outH * 3600 + outM * 60);
                if (diffSecs <= 0) return '<span class="text-emerald-500 text-[10px] font-bold">On Time</span>';
                const h = Math.floor(diffSecs/3600), m = Math.floor((diffSecs%3600)/60), s = diffSecs%60;
                return '<span class="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-lg border border-red-200">' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '</span>';
            })()}</td>
            <td class="px-4 py-4 text-[10px] font-bold">${log.payment_method || '-'}</td>
            <td class="px-4 py-4 text-right font-mono">₱${baseAmount.toFixed(2)}</td>
            <td class="px-4 py-4 text-right font-mono">${addlAmount > 0 ? '<span class="text-amber-600 font-bold">₱' + addlAmount.toFixed(2) + '</span>' : '<span class="text-slate-300">—</span>'}</td>
            <td class="px-4 py-4 text-right font-mono font-bold text-slate-800">₱${rowTotal.toFixed(2)}</td>
        `;
        html += actionCell;

        row.innerHTML = html;
        tbody.appendChild(row);
    });

    updateTotalsDisplay(pageTotal, allPagesTotal, filteredLogs.length);
    filteredTotal = filteredLogs.length;
    renderPagination(filteredLogs.length);
}

function updateTotalsDisplay(pageTotal, allPagesTotal, totalRecords) {
    const grandTotalEl = document.getElementById('grand-total');
    const pageTotalEl  = document.getElementById('page-total');
    if (grandTotalEl) grandTotalEl.innerHTML = `₱${allPagesTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    if (pageTotalEl) {
        pageTotalEl.innerHTML = totalRecords > ITEMS_PER_PAGE
            ? `This page: <span class="font-bold text-slate-700">₱${pageTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>`
            : '';
    }
}

function renderPagination(totalItems) {
    let container = document.getElementById('pagination');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pagination';
        container.className = 'flex justify-center items-center gap-4 p-4';
        document.querySelector('.table-container').after(container);
    }

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <button onclick="prevPage()" ${currentPage === 1 ? 'disabled class="px-4 py-2 bg-slate-100 text-slate-300 rounded-xl cursor-not-allowed"' : 'class="px-4 py-2 bg-slate-200 rounded-xl hover:bg-slate-300"'}>&lt;</button>
        <span class="px-4 py-2 font-bold text-sm">Page ${currentPage} / ${totalPages}</span>
        <button onclick="nextPage()" ${currentPage === totalPages ? 'disabled class="px-4 py-2 bg-slate-100 text-slate-300 rounded-xl cursor-not-allowed"' : 'class="px-4 py-2 bg-slate-200 rounded-xl hover:bg-slate-300"'}>&gt;</button>
    `;
}

function nextPage() {
    const totalPages = Math.ceil(filteredTotal / ITEMS_PER_PAGE);
    if (currentPage < totalPages) { currentPage++; renderTable(); }
}
function prevPage() {
    if (currentPage > 1) { currentPage--; renderTable(); }
}

// ── HELPERS ──
function autoCalculateTimeOut() {
    const timeInStr = document.getElementById('form-timein').value;
    const durationVal = document.getElementById('form-duration').value;
    const timeoutInput = document.getElementById('form-timeout');
    if (durationVal === 'unlimited') {
        timeoutInput.value = '00:00';
        timeoutInput.disabled = true;
        timeoutInput.placeholder = '--:-- No Time Limit';
        timeoutInput.classList.add('opacity-40', 'cursor-not-allowed');
        return;
    }
    timeoutInput.disabled = false;
    timeoutInput.placeholder = '';
    timeoutInput.classList.remove('opacity-40', 'cursor-not-allowed');
    if (!timeInStr) return;
    const [hours, minutes] = timeInStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes + parseInt(durationVal), 0, 0);
    timeoutInput.value = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}


function stampReturnNow() {
    const returnInput = document.getElementById('form-return-time');
    // Don't overwrite if already filled
    if (returnInput.value) return;
    const now = new Date();
    returnInput.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    calcOvertime();
    updateReturnButtonState();
}

function updateReturnButtonState() {
    const returnInput = document.getElementById('form-return-time');
    const returnBtn   = document.getElementById('form-return-btn');
    if (!returnBtn) return;
    const hasValue = !!returnInput.value;
    returnBtn.disabled = hasValue;
    returnBtn.classList.toggle('opacity-40', hasValue);
    returnBtn.classList.toggle('cursor-not-allowed', hasValue);
}

function calcOvertime() {
    const timeoutStr = document.getElementById('form-timeout').value;
    const returnStr  = document.getElementById('form-return-time').value;
    const wrap  = document.getElementById('overtime-wrap');
    const label = document.getElementById('overtime-label');
    const icon  = wrap.querySelector('svg');

    const reset = () => {
        wrap.className = 'flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-h-[52px]';
        icon.className = 'w-4 h-4 text-slate-300 shrink-0';
        label.className = 'text-sm font-mono text-slate-300';
        label.textContent = '--:--:--';
    };

    if (!timeoutStr || !returnStr || timeoutStr === '00:00') { reset(); updateReturnButtonState(); return; }

    const [outH, outM] = timeoutStr.split(':').map(Number);
    const [retH, retM] = returnStr.split(':').map(Number);
    const diffSecs = (retH * 3600 + retM * 60) - (outH * 3600 + outM * 60);

    if (diffSecs > 0) {
        const h = Math.floor(diffSecs/3600), m = Math.floor((diffSecs%3600)/60), s = diffSecs%60;
        wrap.className = 'flex items-center gap-3 bg-red-50 border-2 border-red-400 rounded-xl px-4 py-3 min-h-[52px]';
        icon.className = 'w-4 h-4 text-red-500 shrink-0';
        label.className = 'text-lg font-bold text-red-600 font-mono tracking-widest';
        label.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
        reset();
    }
    updateReturnButtonState();
}

const PRICES_REGULAR  = { '30': 100, '60': 150, '120': 300, '180': 450, 'unlimited': 600 };
const PRICES_DISCOUNT = { '30': 100, '60': 120, '120': 240, '180': 300, 'unlimited': 550 };

function autoSetRentalAmount() {
    const duration = document.getElementById('form-duration').value;
    const isDisc = ['Senior', 'PWD'].includes(document.getElementById('form-validid').value);
    document.getElementById('form-amount').value = isDisc ? PRICES_DISCOUNT[duration] : PRICES_REGULAR[duration];
    updateLiveTotal();
}

function handleValidIdChange() {
    const isDisc = ['Senior', 'PWD'].includes(document.getElementById('form-validid').value);
    document.getElementById('discount-note').classList.toggle('hidden', !isDisc);
    autoSetRentalAmount();
}

function updateLiveTotal() {
    const amount = parseFloat(document.getElementById('form-amount').value) || 0;
    const addl   = parseFloat(document.getElementById('form-add-charge').value) || 0;
    document.getElementById('live-total').innerHTML = `₱${(amount + addl).toFixed(2)}`;
}

function showAddModal() {
    document.getElementById('form-name').value = '';
    document.getElementById('form-address').value = '';
    document.getElementById('form-waiver').value = '';
    document.getElementById('form-or').value = '';
    document.getElementById('form-cart').value = '';
    document.getElementById('form-timein').value = '';
    document.getElementById('form-timeout').value = '';
    document.getElementById('form-return-time').value = '';
    document.getElementById('form-amount').value = '';
    document.getElementById('form-add-charge').value = '';
    document.getElementById('form-duration').value = '';
    document.getElementById('form-validid').value = 'Regular';
    document.getElementById('form-payment-method').value = 'Cash';
    document.getElementById('form-payment-other').value = '';
    document.getElementById('payment-other-wrap').classList.add('hidden');
    document.getElementById('discount-note').classList.add('hidden');
    document.getElementById('live-total').innerHTML = '₱0.00';
    const otWrap = document.getElementById('overtime-wrap');
    const otLabel = document.getElementById('overtime-label');
    const otIcon = otWrap ? otWrap.querySelector('svg') : null;
    if (otWrap) otWrap.className = 'flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 min-h-[52px]';
    if (otIcon) otIcon.className = 'w-4 h-4 text-slate-300 shrink-0';
    if (otLabel) { otLabel.className = 'text-sm font-mono text-slate-300'; otLabel.textContent = '--:--:--'; }
    const timeoutInput = document.getElementById('form-timeout');
    timeoutInput.disabled = false;
    timeoutInput.placeholder = '';
    timeoutInput.classList.remove('opacity-40', 'cursor-not-allowed');
    autoSetRentalAmount();
    updateReturnButtonState();
    document.getElementById('add-modal').showModal();
}
function hideAddModal() { document.getElementById('add-modal').close(); }

function stampTimeInNow() {
    const now = new Date();
    const val = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    document.getElementById('form-timein').value = val;
    autoCalculateTimeOut();
}

// Confirm/lock the time-in value and recalculate timeout
function confirmTimeIn() {
    const val = document.getElementById('form-timein').value;
    if (!val) {
        stampTimeInNow();
    }
    autoCalculateTimeOut();
    autoSetRentalAmount();
}

// Confirm/lock the return time value
function confirmReturnTime() {
    const returnInput = document.getElementById('form-return-time');
    if (!returnInput.value) {
        stampReturnNow();
    } else {
        calcOvertime();
        updateReturnButtonState();
    }
}

// ── EDIT PANEL ──

function openEditPanel(id) {
    const numId = parseInt(id, 10);
    const log = allLogs.find(l => parseInt(l.id, 10) === numId);
    if (!log) { console.warn('Edit: log not found for id', numId); return; }

    const baseAmount = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
    const addlAmount = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;

    const existing = document.getElementById('edit-panel');
    if (existing) existing.remove();

    const esc = s => (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const panel = document.createElement('div');
    panel.id = 'edit-panel';
    Object.assign(panel.style, {
        position:'fixed', inset:'0', zIndex:'9999',
        display:'flex', flexDirection:'column',
        background:'#f1f5f9', fontFamily:"'Plus Jakarta Sans',sans-serif",
        overflow:'hidden'
    });

    panel.innerHTML = `
        <div style="background:#0f172a;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>
                <div style="color:#fff;font-weight:800;font-size:16px;letter-spacing:-0.01em;">Edit Log Entry</div>
                <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;margin-top:3px;">Record ID #${log.id} &nbsp;&middot;&nbsp; ${esc(log.employee_username)}</div>
            </div>
            <button id="ep-close-btn" style="color:#94a3b8;background:rgba(255,255,255,0.06);border:none;border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:24px 20px;display:flex;justify-content:center;align-items:flex-start;">
          <div style="width:100%;max-width:900px;">
            <div id="ep-form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">

              <!-- LEFT COLUMN: Customer info -->
              <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;flex-direction:column;gap:14px;">
                <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Customer Information</p>
                <input id="ep-id" type="hidden" value="${log.id}">

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Customer Name</label>
                    <input id="ep-name" type="text" value="${esc(log.name)}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Address</label>
                    <input id="ep-address" type="text" value="${esc(log.address)}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Waiver</label>
                    <input id="ep-waiver" type="text" value="${esc(log.waiver)}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">O.R. #</label>
                    <input id="ep-or" type="text" value="${esc(log.or_number)}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:90px 1fr;gap:12px;">
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Cart #</label>
                    <input id="ep-cart" type="text" value="${esc(log.cart_number)}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Valid ID</label>
                    <select id="ep-validid" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                      <option value="Regular" ${log.valid_id==='Regular'?'selected':''}>Regular</option>
                      <option value="Senior"  ${log.valid_id==='Senior'?'selected':''}>Senior</option>
                      <option value="PWD"     ${log.valid_id==='PWD'?'selected':''}>PWD</option>
                    </select>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Time In</label>
                    <input id="ep-timein" type="time" value="${log.time_in||''}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Time Out</label>
                    <input id="ep-timeout" type="time" value="${log.time_out||''}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Return Time</label>
                    <input id="ep-return-time" type="time" value="${log.return_time||''}" class="ep-input" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                  </div>
                </div>

                <div>
                  <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Return Status</label>
                  <select id="ep-return-status" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                    <option value="Pending"  ${(log.return_status||'Pending')==='Pending'?'selected':''}>Pending</option>
                    <option value="Returned" ${log.return_status==='Returned'?'selected':''}>Returned</option>
                  </select>
                </div>
              </div>

              <!-- RIGHT COLUMN: Payment + actions -->
              <div style="display:flex;flex-direction:column;gap:16px;">
                <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;flex-direction:column;gap:14px;">
                  <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Payment Details</p>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Method</label>
                    <select id="ep-payment" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;">
                      <option value="Cash"  ${log.payment_method==='Cash'?'selected':''}>Cash</option>
                      <option value="GCash" ${log.payment_method==='GCash'?'selected':''}>GCash</option>
                      <option value="Other" ${log.payment_method==='Other'?'selected':''}>Other</option>
                    </select>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                      <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Base Amount</label>
                      <input id="ep-amount" type="number" step="0.01" value="${baseAmount}" oninput="epUpdateTotal()" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;text-align:right;font-family:monospace;">
                    </div>
                    <div>
                      <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Additional Charges</label>
                      <input id="ep-addl" type="number" step="0.01" value="${addlAmount}" oninput="epUpdateTotal()" style="width:100%;padding:12px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13px;box-sizing:border-box;outline:none;text-align:right;font-family:monospace;">
                    </div>
                  </div>
                  <div style="background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1.5px solid #a7f3d0;border-radius:16px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.1em;">Entry Total</span>
                    <span id="ep-live-total" style="font-size:26px;font-weight:800;color:#047857;font-family:monospace;">&#x20B1;${(baseAmount+addlAmount).toFixed(2)}</span>
                  </div>
                </div>

                <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                  <div id="ep-error" style="display:none;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:12px 16px;color:#dc2626;font-size:12px;font-weight:600;margin-bottom:14px;"></div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <button id="ep-cancel" style="padding:15px;border-radius:14px;border:1.5px solid #e2e8f0;background:#fff;color:#475569;font-weight:700;font-size:14px;cursor:pointer;">Cancel</button>
                    <button id="ep-save" style="padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.3);">Save Changes</button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
    `;

    document.body.appendChild(panel);

    // Responsive collapse
    function _epResize() {
        const g = document.getElementById('ep-form-grid');
        if (g) g.style.gridTemplateColumns = window.innerWidth < 640 ? '1fr' : '1fr 1fr';
    }
    _epResize();
    panel._resizeH = _epResize;
    window.addEventListener('resize', _epResize);

    document.getElementById('ep-close-btn').addEventListener('click', closeEditPanel);
    document.getElementById('ep-cancel').addEventListener('click', closeEditPanel);
    document.getElementById('ep-save').addEventListener('click', submitEditPanel);

    panel._keyH = e => { if (e.key === 'Escape') closeEditPanel(); };
    document.addEventListener('keydown', panel._keyH);

    setTimeout(() => { const f = document.getElementById('ep-name'); if(f) f.focus(); }, 50);
}

// Live total updater for edit panel
function epUpdateTotal() {
    const amt  = parseFloat(document.getElementById('ep-amount')?.value) || 0;
    const addl = parseFloat(document.getElementById('ep-addl')?.value)   || 0;
    const el = document.getElementById('ep-live-total');
    if (el) el.textContent = '\u20B1' + (amt + addl).toFixed(2);
}


function closeEditPanel() {
    const panel = document.getElementById('edit-panel');
    if (!panel) return;
    if (panel._resizeH) window.removeEventListener('resize', panel._resizeH);
    if (panel._keyH)    document.removeEventListener('keydown', panel._keyH);
    panel.remove();
}

async function submitEditPanel() {
    const id = parseInt(document.getElementById('ep-id').value, 10);
    if (!id || id <= 0) return;

    const saveBtn = document.getElementById('ep-save');
    const errEl   = document.getElementById('ep-error');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;
    errEl.style.display = 'none';

    const payment = document.getElementById('ep-payment').value;
    const amount  = parseFloat(document.getElementById('ep-amount').value) || 0;
    const addl    = parseFloat(document.getElementById('ep-addl').value)   || 0;

    const data = {
        id,
        name:             document.getElementById('ep-name').value,
        address:          document.getElementById('ep-address').value,
        waiver:           document.getElementById('ep-waiver').value,
        or_number:        document.getElementById('ep-or').value,
        cart_number:      document.getElementById('ep-cart').value,
        time_in:          document.getElementById('ep-timein').value,
        time_out:         document.getElementById('ep-timeout').value,
        return_time:      document.getElementById('ep-return-time').value,
        valid_id:         document.getElementById('ep-validid').value,
        payment_method:   payment,
        amount_cash:      payment === 'Cash'  ? amount : -1,
        amount_gcash:     payment === 'GCash' ? amount : -1,
        additional_cash:  payment === 'Cash'  ? addl : 0,
        additional_gcash: payment === 'GCash' ? addl : 0,
        total:            amount + addl,
        return_status:    document.getElementById('ep-return-status').value,
    };

    try {
        const res = await apiFetch('api.php?action=updateLog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            closeEditPanel();
            loadLogs();
        } else {
            errEl.textContent = '❌ ' + (result.message || 'Failed to update. Please try again.');
            errEl.style.display = 'block';
            saveBtn.textContent = 'Save Changes';
            saveBtn.disabled = false;
        }
    } catch (e) {
        errEl.textContent = '❌ Network error. Please try again.';
        errEl.style.display = 'block';
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
    }
}

async function submitNewEntry() {
    const log = {
        name: document.getElementById('form-name').value,
        address: document.getElementById('form-address').value,
        waiver: document.getElementById('form-waiver').value,
        or_number: document.getElementById('form-or').value,
        cart_number: document.getElementById('form-cart').value,
        valid_id: document.getElementById('form-validid').value,
        time_in: document.getElementById('form-timein').value,
        time_out: document.getElementById('form-timeout').value,
        return_time: document.getElementById('form-return-time').value,
        return_status: 'Pending',
        payment_method: document.getElementById('form-payment-method').value,
        amount: parseFloat(document.getElementById('form-amount').value) || 0,
        additional_charge: parseFloat(document.getElementById('form-add-charge').value) || 0,
        total: (parseFloat(document.getElementById('form-amount').value) || 0) + (parseFloat(document.getElementById('form-add-charge').value) || 0)
    };
    try {
        const res = await apiFetch('api.php?action=saveLog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        });
        const result = await res.json();
        if (result.success) {
            hideAddModal();
            loadLogs();
        } else {
            alert('❌ Failed to save: ' + (result.message || 'Unknown error'));
        }
    } catch (e) {
        alert('❌ Network error. Please try again.');
    }
}

async function markReturned(id) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    await apiFetch('api.php?action=markReturned', { method: 'POST', body: JSON.stringify({ id, return_time: time }) });
    loadLogs();
}

function handlePaymentMethodChange() {
    const method = document.getElementById('form-payment-method').value;
    document.getElementById('payment-other-wrap').classList.toggle('hidden', method !== 'Other');
}

function exportToCSV() {
    let csv = 'No,Employee,Name,OR,Cart,Total\n';
    allLogs.forEach((l, i) => csv += `${i+1},${l.employee_username},"${l.name}",${l.or_number},${l.cart_number},${l.total}\n`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'logs.csv';
    a.click();
}

// ── TAB SYSTEM ──
let currentTab = 0;

function switchTab(tab) {
    // Branch accounts can only access Logs(0), Expenses(5), Deposit(6)
    if (currentUser && currentUser.role !== 'admin' && [1,2,3,4].includes(tab)) return;

    currentTab = tab;
    document.querySelectorAll('#tab-container button').forEach((btn, i) => {
        btn.classList.toggle('active', i === tab);
    });
    ['logs-content','daily-content','weekly-content','monthly-content','yearly-content','expenses-content','deposit-content']
        .forEach(id => { const el = document.getElementById(id); if(el) el.classList.add('hidden'); });

    if (tab === 0) {
        document.getElementById('logs-content').classList.remove('hidden');
        renderTable();
    } else if (tab === 1) {
        document.getElementById('daily-content').classList.remove('hidden');
        renderDailySummary();
    } else if (tab === 2) {
        document.getElementById('weekly-content').classList.remove('hidden');
        renderWeeklySummary();
    } else if (tab === 3) {
        document.getElementById('monthly-content').classList.remove('hidden');
        renderMonthlySummary();
    } else if (tab === 4) {
        document.getElementById('yearly-content').classList.remove('hidden');
        renderYearlySummary();
    } else if (tab === 5) {
        document.getElementById('expenses-content').classList.remove('hidden');
        renderExpensesTab();
    } else if (tab === 6) {
        document.getElementById('deposit-content').classList.remove('hidden');
        renderDepositTab();
    }
}

// ── DAILY SUMMARY ──

// Tracks the currently selected date in the Daily tab
let selectedDailyDate = null;

function buildDailyDatePicker(logsToUse, expsToUse) {
    const picker = document.getElementById('daily-date-picker');
    if (!picker) return;

    // Collect all unique dates from logs and expenses
    const dateSet = new Set();
    logsToUse.forEach(log => { if (log.created_at) dateSet.add(log.created_at.split(' ')[0]); });
    expsToUse.forEach(exp => { if (exp.expense_date) dateSet.add(exp.expense_date); });

    // Always include today
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    dateSet.add(todayStr);

    const sortedDates = [...dateSet].sort().reverse(); // newest first

    // Preserve selection if still valid, else default to today
    if (!selectedDailyDate || !dateSet.has(selectedDailyDate)) {
        selectedDailyDate = dateSet.has(todayStr) ? todayStr : sortedDates[0];
    }

    picker.innerHTML = '';
    sortedDates.forEach(ds => {
        const [y, m, d] = ds.split('-').map(Number);
        const dayName = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = ds;
        opt.textContent = ds === todayStr ? `Today — ${dayName}` : dayName + ` (${ds})`;
        if (ds === selectedDailyDate) opt.selected = true;
        picker.appendChild(opt);
    });
}

function onDailyDateChange() {
    const picker = document.getElementById('daily-date-picker');
    if (picker) selectedDailyDate = picker.value;
    renderDailyTable();
}

function renderDailySummary() {
    let logsToUse = allLogs;
    let expsToUse = allExpenses;

    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const branchUsers = BRANCH_USERS[activeBranch] || [];
        logsToUse = allLogs.filter(log => branchUsers.includes(log.employee_username));
        expsToUse = allExpenses.filter(exp => branchUsers.includes(exp.employee_username));
    } else if (currentUser.role !== 'admin') {
        logsToUse = allLogs.filter(log => log.employee_username === currentUser.username);
        expsToUse = allExpenses.filter(exp => exp.employee_username === currentUser.username);
    }

    // Build the date dropdown (sets selectedDailyDate)
    buildDailyDatePicker(logsToUse, expsToUse);

    // Update branch badge
    const branchLabel = document.getElementById('daily-branch-label');
    if (branchLabel) {
        if (currentUser.role === 'admin' && activeBranch !== 'all') {
            branchLabel.textContent = activeBranch.toUpperCase();
            branchLabel.classList.remove('hidden');
        } else {
            branchLabel.classList.add('hidden');
        }
    }

    renderDailyTable();
}

function renderDailyTable() {
    const tbody = document.getElementById('daily-table-body');
    tbody.innerHTML = '';

    let logsToUse = allLogs;
    let expsToUse = allExpenses;

    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const branchUsers = BRANCH_USERS[activeBranch] || [];
        logsToUse = allLogs.filter(log => branchUsers.includes(log.employee_username));
        expsToUse = allExpenses.filter(exp => branchUsers.includes(exp.employee_username));
    } else if (currentUser.role !== 'admin') {
        logsToUse = allLogs.filter(log => log.employee_username === currentUser.username);
        expsToUse = allExpenses.filter(exp => exp.employee_username === currentUser.username);
    }

    // Filter to the selected day only
    const dayLogs = logsToUse.filter(log => log.created_at && log.created_at.startsWith(selectedDailyDate));
    const dayExps = expsToUse.filter(exp => exp.expense_date === selectedDailyDate);

    // Update the month label to show the selected date
    const monthLabel = document.getElementById('daily-month-label');
    if (monthLabel && selectedDailyDate) {
        const [y, m, d] = selectedDailyDate.split('-').map(Number);
        const label = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        monthLabel.textContent = label.toUpperCase();
    }

    // Group by staff (username) so each branch gets its own row
    const groups = {};

    dayLogs.forEach(log => {
        const key = log.employee_username;
        if (!groups[key]) groups[key] = { staff: key, logs: [], exps: [] };
        groups[key].logs.push(log);
    });

    dayExps.forEach(exp => {
        const key = exp.employee_username;
        if (!groups[key]) groups[key] = { staff: key, logs: [], exps: [] };
        groups[key].exps.push(exp);
    });

    const sortedKeys = Object.keys(groups).sort();

    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExpenses = 0;

    if (sortedKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-12 text-center text-slate-400 italic">No records for this day.</td></tr>`;
        ['daily-total-sales','daily-total-gcash','daily-total-cash','daily-total-expenses','daily-grand-total']
            .forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = '₱0.00'; });
        return;
    }

    const [y, m, d] = selectedDailyDate.split('-').map(Number);
    const dayName = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'short' });

    sortedKeys.forEach(key => {
        const { staff, logs, exps } = groups[key];

        let sales = 0, gcash = 0, cashOnHand = 0;

        logs.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rowTotal = base + addl;
            sales += rowTotal;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cashOnHand += rowTotal;
            else gcash += rowTotal;
        });

        const dayExpenses = exps.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
        grandExpenses += dayExpenses;

        // Net Total = Cash on Hand minus expenses only (GCash not deducted)
        const netTotal = cashOnHand - dayExpenses;

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-4 font-medium text-cyan-700">${staff}</td>
                <td class="px-4 py-4">${dayName}</td>
                <td class="px-4 py-4">${selectedDailyDate}</td>
                <td class="px-4 py-4 text-right font-mono">₱${sales.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono">₱${gcash.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono">₱${cashOnHand.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono text-amber-600">₱${dayExpenses.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-bold ${netTotal < 0 ? 'text-red-500' : 'text-slate-800'}">₱${netTotal.toFixed(2)}</td>
                <td class="px-4 py-4 text-slate-500">${exps.map(e => e.particulars).join(', ') || '—'}</td>
            </tr>`;

        grandSales += sales;
        grandGCash += gcash;
        grandCash += cashOnHand;
    });

    document.getElementById('daily-total-sales').innerHTML    = `₱${grandSales.toFixed(2)}`;
    document.getElementById('daily-total-gcash').innerHTML    = `₱${grandGCash.toFixed(2)}`;
    document.getElementById('daily-total-cash').innerHTML     = `₱${grandCash.toFixed(2)}`;
    document.getElementById('daily-total-expenses').innerHTML = `₱${grandExpenses.toFixed(2)}`;
    // Net = Cash on Hand - Expenses
    document.getElementById('daily-grand-total').innerHTML    = `₱${(grandCash - grandExpenses).toFixed(2)}`;

    // ── EXPENSES DETAIL TABLE (below summary) ──
    const expWrap = document.getElementById('daily-expenses-detail');
    if (!expWrap) return;
    if (dayExps.length === 0) {
        expWrap.innerHTML = `<p class="text-slate-400 italic text-xs py-4 text-center">No expenses recorded for this day.</p>`;
        return;
    }
    let expHtml = `
        <p class="stat-label text-amber-600 mb-2 mt-6">Expenses This Day</p>
        <div class="table-container overflow-x-auto">
        <table class="w-full text-xs">
            <thead class="bg-[#0f172a] text-white">
                <tr>
                    <th class="px-4 py-3.5 text-left">Staff</th>
                    <th class="px-4 py-3.5 text-left">Particulars</th>
                    <th class="px-4 py-3.5 text-right">Amount</th>
                </tr>
            </thead>
            <tbody class="divide-y bg-white">`;
    dayExps.forEach(exp => {
        expHtml += `
                <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 text-cyan-700 font-medium">${exp.employee_username}</td>
                    <td class="px-4 py-3">${exp.particulars}</td>
                    <td class="px-4 py-3 text-right font-mono text-amber-600">₱${parseFloat(exp.amount).toFixed(2)}</td>
                </tr>`;
    });
    const totalExp = dayExps.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    expHtml += `
            </tbody>
            <tfoot class="bg-amber-50 font-bold border-t-2 border-amber-100">
                <tr>
                    <td colspan="2" class="px-4 py-3.5 text-right text-[10px] uppercase tracking-widest text-amber-600">Total Expenses This Day</td>
                    <td class="px-4 py-3.5 text-right font-mono text-amber-600">₱${totalExp.toFixed(2)}</td>
                </tr>
            </tfoot>
        </table>
        </div>`;
    expWrap.innerHTML = expHtml;
}

// ── WEEKLY HELPERS ──
function getMondayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const diff = (dow === 0) ? -6 : 1 - dow;
    dt.setDate(dt.getDate() + diff);
    return dt.toISOString().split('T')[0];
}
function getSundayOf(mondayStr) {
    const [y, m, d] = mondayStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 6);
    return dt.toISOString().split('T')[0];
}
function fmtDate(ds) {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

let selectedWeekMonday = null;

function onWeekPickerChange() {
    const picker = document.getElementById('week-picker');
    selectedWeekMonday = picker.value || null;
    renderWeeklyTable();
}

function buildWeekBuckets() {
    let logsToUse = allLogs;
    let expsToUse = allExpenses;
    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const bu = BRANCH_USERS[activeBranch] || [];
        logsToUse = allLogs.filter(l => bu.includes(l.employee_username));
        expsToUse = allExpenses.filter(e => bu.includes(e.employee_username));
    } else if (currentUser.role !== 'admin') {
        logsToUse = allLogs.filter(l => l.employee_username === currentUser.username);
        expsToUse = allExpenses.filter(e => e.employee_username === currentUser.username);
    }

    const buckets = {};
    logsToUse.forEach(log => {
        const ds = log.created_at ? log.created_at.split(' ')[0] : null;
        if (!ds) return;
        const mon = getMondayOf(ds);
        if (!buckets[mon]) buckets[mon] = { logs: [], exps: [] };
        buckets[mon].logs.push(log);
    });
    expsToUse.forEach(exp => {
        const ds = exp.expense_date;
        if (!ds) return;
        const mon = getMondayOf(ds);
        if (!buckets[mon]) buckets[mon] = { logs: [], exps: [] };
        buckets[mon].exps.push(exp);
    });
    return buckets;
}

function buildWeekPicker(buckets) {
    const picker = document.getElementById('week-picker');
    const todayMon = getMondayOf(new Date().toISOString().split('T')[0]);
    const sortedMondays = Object.keys(buckets).sort().reverse();

    const byMonth = {};
    sortedMondays.forEach(mon => {
        const [y, m] = mon.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        if (!byMonth[label]) byMonth[label] = [];
        byMonth[label].push(mon);
    });

    const prev = selectedWeekMonday || todayMon;
    picker.innerHTML = '';

    Object.entries(byMonth).forEach(([monthLabel, mondays]) => {
        const grp = document.createElement('optgroup');
        grp.label = monthLabel;
        mondays.forEach(mon => {
            const sun = getSundayOf(mon);
            const isCurrent = mon === todayMon;
            const opt = document.createElement('option');
            opt.value = mon;
            opt.textContent = `${fmtDate(mon)} – ${fmtDate(sun)}${isCurrent ? ' (Current)' : ''}`;
            if (mon === prev) opt.selected = true;
            grp.appendChild(opt);
        });
        picker.appendChild(grp);
    });

    if (!picker.value && sortedMondays.length > 0) {
        picker.value = sortedMondays.includes(todayMon) ? todayMon : sortedMondays[0];
    }
    selectedWeekMonday = picker.value || null;
}

function renderWeeklyTable() {
    const salesBody    = document.getElementById('weekly-sales-body');
    const expensesBody = document.getElementById('weekly-expenses-body');
    salesBody.innerHTML    = '';
    expensesBody.innerHTML = '';

    const zero = '₱0.00';
    if (!selectedWeekMonday) {
        salesBody.innerHTML    = `<tr><td colspan="5" class="py-12 text-center text-slate-400 italic">Select a week above.</td></tr>`;
        expensesBody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400 italic">—</td></tr>`;
        ['weekly-total-sales','weekly-total-gcash','weekly-total-expenses','weekly-total-cash','weekly-total-expense']
            .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = zero; });
        return;
    }

    const buckets = buildWeekBuckets();
    const bucket  = buckets[selectedWeekMonday] || { logs: [], exps: [] };
    const { logs, exps } = bucket;

    const dayGroups = {};
    logs.forEach(log => {
        const ds = log.created_at.split(' ')[0];
        if (!dayGroups[ds]) dayGroups[ds] = { logs: [], exps: [] };
        dayGroups[ds].logs.push(log);
    });
    exps.forEach(exp => {
        const ds = exp.expense_date;
        if (!dayGroups[ds]) dayGroups[ds] = { logs: [], exps: [] };
        dayGroups[ds].exps.push(exp);
    });

    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExpenses = 0;
    const sortedDays = Object.keys(dayGroups).sort();

    if (sortedDays.length === 0) {
        salesBody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 italic">No records for this week.</td></tr>`;
    }

    sortedDays.forEach(ds => {
        const dl = dayGroups[ds].logs;
        const de = dayGroups[ds].exps;
        let sales = 0, gcash = 0, cashOnHand = 0;

        dl.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cashOnHand += rt;
            else gcash += rt;
        });

        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        // Net Total = Cash on Hand minus expenses only (GCash is not deducted)
        const netDay = cashOnHand - dayExp;
        const [yy, mm, dd] = ds.split('-').map(Number);
        const dayName = new Date(yy, mm - 1, dd).toLocaleString('en-US', { weekday: 'long' });

        salesBody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-3">
                    <span class="font-semibold text-slate-700">${dayName}</span>
                    <span class="text-slate-400 ml-1">${ds}</span>
                </td>
                <td class="px-4 py-3 text-right font-mono text-emerald-700">₱${sales.toFixed(2)}</td>
                <td class="px-4 py-3 text-right font-mono text-blue-500">₱${gcash.toFixed(2)}</td>
                <td class="px-4 py-3 text-right font-mono text-amber-500">${dayExp > 0 ? '₱' + dayExp.toFixed(2) : '—'}</td>
                <td class="px-4 py-3 text-right font-mono">₱${cashOnHand.toFixed(2)}</td>
                <td class="px-4 py-3 text-right font-mono font-bold text-slate-800">₱${netDay.toFixed(2)}</td>
            </tr>`;

        grandSales    += sales;
        grandGCash    += gcash;
        grandCash     += cashOnHand;
        grandExpenses += dayExp;
    });

    if (exps.length === 0) {
        expensesBody.innerHTML = `<tr><td colspan="3" class="py-12 text-center text-slate-400 italic">No expenses this week.</td></tr>`;
    } else {
        exps.sort((a, b) => a.expense_date.localeCompare(b.expense_date)).forEach(exp => {
            expensesBody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="px-4 py-3">${exp.expense_date}</td>
                    <td class="px-4 py-3">${exp.particulars}</td>
                    <td class="px-4 py-3 text-right font-mono text-amber-600">₱${parseFloat(exp.amount).toFixed(2)}</td>
                </tr>`;
        });
    }

    const grandNet = grandCash - grandExpenses;
    document.getElementById('weekly-total-sales').innerHTML    = `₱${grandSales.toFixed(2)}`;
    document.getElementById('weekly-total-gcash').innerHTML    = `₱${grandGCash.toFixed(2)}`;
    document.getElementById('weekly-total-expenses').innerHTML = `₱${grandExpenses.toFixed(2)}`;
    document.getElementById('weekly-total-cash').innerHTML     = `₱${grandCash.toFixed(2)}`;
    document.getElementById('weekly-total-net').innerHTML      = `₱${grandNet.toFixed(2)}`;
    document.getElementById('weekly-total-expense').innerHTML  = `₱${grandExpenses.toFixed(2)}`;
}

function renderWeeklySummary() {
    const buckets = buildWeekBuckets();
    buildWeekPicker(buckets);
    renderWeeklyTable();
}

function renderCurrentTab() {
    if (currentTab === 0) renderTable();
    else if (currentTab === 1) renderDailySummary();
    else if (currentTab === 2) renderWeeklySummary();
    else if (currentTab === 3) renderMonthlySummary();
    else if (currentTab === 4) renderYearlySummary();
    else if (currentTab === 5) renderExpensesTab();
    else if (currentTab === 6) renderDepositTab();
}

// ── EXPENSES TAB (employee view — today only) ──
function renderExpensesTab() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const label = document.getElementById('expenses-date-label');
    if (label) {
        const [y, m, d] = todayStr.split('-').map(Number);
        label.textContent = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    }

    const myExpenses = allExpenses.filter(e =>
        e.employee_username === currentUser.username &&
        e.expense_date === todayStr
    );

    const tbody = document.getElementById('expenses-tab-body');
    const emptyEl = document.getElementById('expenses-tab-empty');
    const totalEl = document.getElementById('expenses-tab-total');
    tbody.innerHTML = '';

    if (myExpenses.length === 0) {
        emptyEl.classList.remove('hidden');
        totalEl.textContent = '₱0.00';
        return;
    }
    emptyEl.classList.add('hidden');

    let total = 0;
    myExpenses.forEach(exp => {
        total += parseFloat(exp.amount || 0);
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-3 text-slate-500">${exp.expense_date}</td>
                <td class="px-4 py-3">${exp.particulars}</td>
                <td class="px-4 py-3 text-right font-mono text-amber-600">₱${parseFloat(exp.amount).toFixed(2)}</td>
            </tr>`;
    });
    totalEl.textContent = `₱${total.toFixed(2)}`;
}

// ── DEPOSIT TAB (employee view — today only) ──
function renderDepositTab() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const label = document.getElementById('deposit-date-label');
    if (label) {
        const [y, m, d] = todayStr.split('-').map(Number);
        label.textContent = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
    }

    const myDeposits = allDeposits.filter(dep =>
        dep.employee_username === currentUser.username &&
        dep.deposit_date === todayStr
    );

    const tbody = document.getElementById('deposit-tab-body');
    const emptyEl = document.getElementById('deposit-tab-empty');
    const totalEl = document.getElementById('deposit-tab-total');
    tbody.innerHTML = '';

    if (myDeposits.length === 0) {
        emptyEl.classList.remove('hidden');
        totalEl.textContent = '₱0.00';
        return;
    }
    emptyEl.classList.add('hidden');

    let total = 0;
    myDeposits.forEach(dep => {
        total += parseFloat(dep.amount || 0);
        const timeDisplay = dep.deposit_time ? dep.deposit_time.slice(0,5) : '—';
        const [hStr, mStr] = timeDisplay.split(':');
        let h = parseInt(hStr, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const time12 = isNaN(h) ? timeDisplay : `${h}:${mStr} ${ampm}`;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-3 text-slate-500">${dep.deposit_date}</td>
                <td class="px-4 py-3 font-mono text-blue-600">${time12}</td>
                <td class="px-4 py-3">${dep.description || '—'}</td>
                <td class="px-4 py-3 text-right font-mono text-blue-700">₱${parseFloat(dep.amount).toFixed(2)}</td>
            </tr>`;
    });
    totalEl.textContent = `₱${total.toFixed(2)}`;
}

// ── DEPOSIT MODAL ──
// Temp store for current deposit's selected receipt image (base64)
let _pendingReceiptBase64 = null;

function showDepositModal() {
    document.getElementById('dep-amount').value = '';
    document.getElementById('dep-description').value = '';
    // Reset photo state
    _pendingReceiptBase64 = null;
    const fileInput = document.getElementById('dep-receipt-file');
    if (fileInput) fileInput.value = '';
    _depReceiptShowPlaceholder();
    document.getElementById('deposit-modal').showModal();
    // Focus amount after dialog opens
    setTimeout(() => { const el = document.getElementById('dep-amount'); if(el) el.focus(); }, 150);
}

function hideDepositModal() {
    document.getElementById('deposit-modal').close();
    _pendingReceiptBase64 = null;
}

// Called when user selects/captures a receipt image
function onDepositReceiptSelected(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    // Enforce 5MB limit
    if (file.size > 5 * 1024 * 1024) {
        alert('❌ Image is too large. Please use a photo under 5MB.');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        _pendingReceiptBase64 = e.target.result; // full data URL
        _depReceiptShowPreview(_pendingReceiptBase64);
    };
    reader.readAsDataURL(file);
}

function _depReceiptShowPlaceholder() {
    const placeholder = document.getElementById('dep-receipt-placeholder');
    const preview     = document.getElementById('dep-receipt-preview');
    const zone        = document.getElementById('dep-receipt-zone');
    if (placeholder) placeholder.classList.remove('hidden');
    if (preview)     preview.classList.add('hidden');
    if (zone)        zone.style.minHeight = '160px';
}

function _depReceiptShowPreview(src) {
    const placeholder = document.getElementById('dep-receipt-placeholder');
    const preview     = document.getElementById('dep-receipt-preview');
    const img         = document.getElementById('dep-receipt-img');
    const zone        = document.getElementById('dep-receipt-zone');
    if (placeholder) placeholder.classList.add('hidden');
    if (img)         img.src = src;
    if (preview)     preview.classList.remove('hidden');
    if (zone)        zone.style.minHeight = '220px';
}

function removeDepositReceipt() {
    _pendingReceiptBase64 = null;
    const fileInput = document.getElementById('dep-receipt-file');
    if (fileInput) fileInput.value = '';
    _depReceiptShowPlaceholder();
}

async function submitDeposit() {
    const amount      = parseFloat(document.getElementById('dep-amount').value) || 0;
    const description = document.getElementById('dep-description').value.trim();

    if (amount <= 0) { alert('Please enter a valid amount'); return; }
    if (!description) { alert('Please enter a description'); return; }

    const saveBtn = document.getElementById('dep-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        const res = await apiFetch('api.php?action=saveDeposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, description })
        });

        const result = await res.json();
        if (result.success) {
            // If a receipt photo was attached, store it keyed by deposit date + amount
            // We use date+amount+description as a stable key since DB doesn't return the new ID
            if (_pendingReceiptBase64) {
                const today = new Date();
                const dateStr = today.getFullYear() + '-' +
                    String(today.getMonth()+1).padStart(2,'0') + '-' +
                    String(today.getDate()).padStart(2,'0');
                const receiptKey = `${dateStr}|${amount}|${description}`;
                const receipts = _lsGet(LS_KEY_RECEIPTS);
                receipts[receiptKey] = _pendingReceiptBase64;
                _lsSet(LS_KEY_RECEIPTS, receipts);
            }
            hideDepositModal();
            await loadLogs();
            switchTab(6);
        } else {
            alert('❌ Failed to save deposit: ' + (result.message || 'Unknown error'));
        }
    } catch(e) {
        alert('❌ Network error. Please try again.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Save Deposit`;
        }
    }
}

// ── EXPENSES MODAL ──
function showExpenseModal() {
    const today = new Date();
    const localDate = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    document.getElementById('exp-date').value = localDate;
    document.getElementById('exp-particulars').value = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('expense-modal').showModal();
}

function hideExpenseModal() {
    document.getElementById('expense-modal').close();
}

async function submitExpense() {
    const expense = {
        expense_date: document.getElementById('exp-date').value,
        particulars: document.getElementById('exp-particulars').value.trim(),
        amount: parseFloat(document.getElementById('exp-amount').value) || 0
    };

    if (!expense.particulars || expense.amount <= 0) {
        alert("Please fill description and amount");
        return;
    }

    const res = await apiFetch('api.php?action=saveExpense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense)
    });

    if ((await res.json()).success) {
        hideExpenseModal();
        loadLogs();
    } else {
        alert("Failed to save expense");
    }
}
// ── MONTHLY SUMMARY ──
let selectedMonth = null; // 'YYYY-MM'

function buildMonthBuckets() {
    let logsToUse = allLogs;
    let expsToUse = allExpenses;
    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const bu = BRANCH_USERS[activeBranch] || [];
        logsToUse = allLogs.filter(l => bu.includes(l.employee_username));
        expsToUse = allExpenses.filter(e => bu.includes(e.employee_username));
    } else if (currentUser.role !== 'admin') {
        logsToUse = allLogs.filter(l => l.employee_username === currentUser.username);
        expsToUse = allExpenses.filter(e => e.employee_username === currentUser.username);
    }

    const buckets = {};
    logsToUse.forEach(log => {
        const ds = log.created_at ? log.created_at.split(' ')[0] : null;
        if (!ds) return;
        const ym = ds.slice(0, 7);
        if (!buckets[ym]) buckets[ym] = { logs: [], exps: [] };
        buckets[ym].logs.push(log);
    });
    expsToUse.forEach(exp => {
        const ds = exp.expense_date;
        if (!ds) return;
        const ym = ds.slice(0, 7);
        if (!buckets[ym]) buckets[ym] = { logs: [], exps: [] };
        buckets[ym].exps.push(exp);
    });
    return buckets;
}

function buildMonthPicker() {
    const yearPicker = document.getElementById('month-year-picker');
    const monthPicker = document.getElementById('month-picker');
    const now = new Date();
    const thisYear = now.getFullYear();
    const startYear = 2026;

    // Build year options from 2026 to current year
    yearPicker.innerHTML = '';
    for (let y = startYear; y <= thisYear; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === thisYear) opt.selected = true;
        yearPicker.appendChild(opt);
    }

    // Set month picker to current month
    monthPicker.value = now.getMonth() + 1;

    // Set selectedMonth from current pickers
    const yr = parseInt(yearPicker.value);
    const mo = parseInt(monthPicker.value);
    selectedMonth = `${yr}-${String(mo).padStart(2, '0')}`;
}

function onMonthPickerChange() {
    const mo = document.getElementById('month-picker').value;
    const yr = document.getElementById('month-year-picker').value;
    if (mo && yr) {
        selectedMonth = `${yr}-${String(mo).padStart(2, '0')}`;
    }
    renderMonthlyTable();
}

function renderMonthlyTable() {
    const salesBody = document.getElementById('monthly-sales-body');
    salesBody.innerHTML = '';

    const fmt = v => v > 0 ? `₱${v.toLocaleString('en-PH', {minimumFractionDigits:2})}` : '—';
    const fmtAlways = v => `₱${v.toLocaleString('en-PH', {minimumFractionDigits:2})}`;

    if (!selectedMonth) {
        salesBody.innerHTML = `<tr><td colspan="10" class="py-12 text-center text-slate-400 italic">Select a month above.</td></tr>`;
        return;
    }

    // Update title labels
    const [selYear, selMo] = selectedMonth.split('-').map(Number);
    const monthName = new Date(selYear, selMo - 1, 1).toLocaleString('en-US', {month:'long'}).toUpperCase();
    const titleEl = document.getElementById('monthly-sales-title');
    if (titleEl) {
        const branchName = (currentUser.role === 'admin' && activeBranch !== 'all')
            ? activeBranch.toUpperCase() + ' SALES ' + selYear
            : (currentUser.displayName || currentUser.username).toUpperCase() + ' SALES ' + selYear;
        titleEl.textContent = branchName;
    }
    const monthLabelEl = document.getElementById('monthly-sales-month-label');
    if (monthLabelEl) monthLabelEl.textContent = 'MONTH OF: ' + monthName;
    const depMonthEl = document.getElementById('monthly-deposit-month-label');
    if (depMonthEl) depMonthEl.textContent = 'MONTH OF: ' + monthName;
    const depBranchEl = document.getElementById('monthly-deposit-branch-label');
    if (depBranchEl) {
        if (currentUser.role === 'admin' && activeBranch !== 'all') {
            depBranchEl.textContent = 'BRANCH: ' + activeBranch.toUpperCase();
            depBranchEl.classList.remove('hidden');
        } else {
            depBranchEl.classList.add('hidden');
        }
    }

    const buckets = buildMonthBuckets();
    const bucket  = buckets[selectedMonth] || { logs: [], exps: [] };
    const { logs, exps } = bucket;

    // ── GROUP BY DAY+STAFF so each branch gets its own row ──
    const dayStaffGroups = {};
    logs.forEach(log => {
        const ds = log.created_at.split(' ')[0];
        const key = `${ds}|${log.employee_username}`;
        if (!dayStaffGroups[key]) dayStaffGroups[key] = { ds, staff: log.employee_username, logs: [], exps: [] };
        dayStaffGroups[key].logs.push(log);
    });
    exps.forEach(exp => {
        const ds = exp.expense_date;
        const key = `${ds}|${exp.employee_username}`;
        if (!dayStaffGroups[key]) dayStaffGroups[key] = { ds, staff: exp.employee_username, logs: [], exps: [] };
        dayStaffGroups[key].exps.push(exp);
    });

    // dayGroups still needed for deposit cash-by-day calculation
    const dayGroups = {};
    logs.forEach(log => {
        const ds = log.created_at.split(' ')[0];
        if (!dayGroups[ds]) dayGroups[ds] = { logs: [] };
        dayGroups[ds].logs.push(log);
    });
    const sortedDays = Object.keys(dayGroups).sort();

    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExpenses = 0;
    const sortedKeys = Object.keys(dayStaffGroups).sort();

    if (sortedKeys.length === 0) {
        salesBody.innerHTML = `<tr><td colspan="10" class="py-12 text-center text-slate-400 italic">No records for this month.</td></tr>`;
    }

    sortedKeys.forEach((key, idx) => {
        const { ds, staff, logs: dl, exps: de } = dayStaffGroups[key];
        let sales = 0, gcash = 0, cashOnHand = 0;

        dl.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rowTotal = base + addl;
            sales += rowTotal;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cashOnHand += rowTotal;
            else gcash += rowTotal;
        });

        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

        // Apply local overrides
        const ov = monthlyOverrides[key] || {};
        const dispSales   = ov.sales    !== undefined ? ov.sales    : sales;
        const dispExp     = ov.expenses !== undefined ? ov.expenses : dayExp;
        const dispExpDesc = ov.expDesc  !== undefined ? ov.expDesc
            : de.map(e => `${e.particulars.toUpperCase()} ${parseFloat(e.amount).toLocaleString('en-PH',{style:'currency',currency:'PHP'})}`).join(' / ');
        const net = dispSales - dispExp;

        const [yy, mm, dd] = ds.split('-').map(Number);
        const dayName   = new Date(yy, mm-1, dd).toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
        const dateLabel = new Date(yy, mm-1, dd).toLocaleString('en-US', { month: 'long', day: 'numeric' }).toUpperCase();
        const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
        const hasOv = !!monthlyOverrides[key];
        const safeDesc = dispExpDesc.replace(/`/g, "'");

        salesBody.innerHTML += `
            <tr class="${rowBg} hover:bg-yellow-50/40 border-b border-slate-100 text-[11px]">
                <td class="px-3 py-2.5 font-bold text-cyan-700 whitespace-nowrap border-r border-slate-100">${staff.toUpperCase()}</td>
                <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap border-r border-slate-100">${dayName}</td>
                <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap border-r border-slate-100">${dateLabel}, ${yy}</td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700 border-r border-slate-100">${dispSales > 0 ? fmtAlways(dispSales) : '—'}${hasOv ? ' <span class="text-[8px] text-cyan-400">✎</span>' : ''}</td>
                <td class="px-3 py-2.5 text-right font-mono text-blue-600 border-r border-slate-100">${gcash > 0 ? fmtAlways(gcash) : '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono text-slate-700 border-r border-slate-100">${cashOnHand > 0 ? fmtAlways(cashOnHand) : '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono text-amber-600 border-r border-slate-100">${dispExp > 0 ? fmtAlways(dispExp) : '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-800 border-r border-slate-100">${fmtAlways(net)}</td>
                <td class="px-3 py-2.5 text-slate-500 italic text-[10px] border-r border-slate-100">${dispExpDesc}</td>
                <td class="px-3 py-2.5 text-center">
                    <button onclick="openMonthlyEditModal('${key}','${ds}','${staff}',${dispSales},${dispExp},\`${safeDesc}\`)"
                            class="text-[9px] font-bold px-2 py-1 rounded-lg bg-cyan-50 text-cyan-600 hover:bg-cyan-500 hover:text-white transition-colors whitespace-nowrap">EDIT</button>
                </td>
            </tr>`;

        grandSales    += dispSales;
        grandGCash    += gcash;
        grandCash     += cashOnHand;
        grandExpenses += dispExp;
    });

    document.getElementById('monthly-total-sales').innerHTML    = fmtAlways(grandSales);
    document.getElementById('monthly-total-gcash').innerHTML    = grandGCash > 0 ? fmtAlways(grandGCash) : '—';
    document.getElementById('monthly-total-cash').innerHTML     = fmtAlways(grandCash);
    document.getElementById('monthly-total-expenses').innerHTML = grandExpenses > 0 ? fmtAlways(grandExpenses) : '—';
    document.getElementById('monthly-total-net').innerHTML      = fmtAlways(grandSales - grandExpenses);

    // ── GRAND TOTAL with overrides ──
    const gtOv = grandTotalOverrides[selectedMonth] || {};
    const fmtGT = v => v > 0 ? fmtAlways(v) : '—';
    const gtSal15 = gtOv.salary15 || 0;
    const gtSal30 = gtOv.salary30 || 0;
    const gtSoa   = gtOv.soa      || 0;
    const gtWaiv  = gtOv.waiver   || 0;
    const gtOr    = gtOv.or       || 0;
    const gtVat   = gtOv.vat      || 0;
    const gtTotalAllExp = grandExpenses + gtSal15 + gtSal30 + gtSoa + gtWaiv + gtOr + gtVat;
    const gtNet = grandSales - gtTotalAllExp;

    const _s = id => document.getElementById(id);
    if (_s('gt-total-sales'))    _s('gt-total-sales').textContent    = fmtAlways(grandSales);
    if (_s('gt-expenses'))       _s('gt-expenses').textContent       = grandExpenses > 0 ? fmtAlways(grandExpenses) : '—';
    if (_s('gt-salary15'))       _s('gt-salary15').textContent       = fmtGT(gtSal15);
    if (_s('gt-salary30'))       _s('gt-salary30').textContent       = fmtGT(gtSal30);
    if (_s('gt-soa'))            _s('gt-soa').textContent            = fmtGT(gtSoa);
    if (_s('gt-waiver'))         _s('gt-waiver').textContent         = fmtGT(gtWaiv);
    if (_s('gt-or'))             _s('gt-or').textContent             = fmtGT(gtOr);
    if (_s('gt-vat'))            _s('gt-vat').textContent            = fmtGT(gtVat);
    if (_s('gt-total-expenses')) _s('gt-total-expenses').textContent = fmtAlways(gtTotalAllExp);
    if (_s('gt-net-sales'))      _s('gt-net-sales').textContent      = fmtAlways(gtNet);

    // ── DEPOSIT TABLE (editable manual rows + real DB deposits) ──
    renderDepositSection(selectedMonth, grandCash, fmtAlways, cashByDayFromGroups(dayGroups));
}

function cashByDayFromGroups(dayGroups) {
    const cashByDay = {};
    Object.keys(dayGroups).forEach(ds => {
        let cash = 0;
        (dayGroups[ds].logs || []).forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : 0) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : 0) || 0;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cash += base + addl;
        });
        cashByDay[ds] = cash;
    });
    return cashByDay;
}

// ── DEPOSIT SECTION RENDERER ──
function renderDepositSection(monthKey, grandCash, fmtAlways, cashByDay) {
    const body = document.getElementById('monthly-deposit-body');
    if (!body) return;

    // Overrides store: status + notes keyed by "monthKey-idx" — persisted in localStorage
    if (!window._depositOverrides) window._depositOverrides = _lsGet(LS_KEY_DEP_OV);

    // Receipt photos store
    const receiptStore = _lsGet(LS_KEY_RECEIPTS);

    let depositsToUse = allDeposits;
    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const bu = BRANCH_USERS[activeBranch] || [];
        depositsToUse = allDeposits.filter(d => bu.includes(d.employee_username));
    } else if (currentUser.role !== 'admin') {
        depositsToUse = allDeposits.filter(d => d.employee_username === currentUser.username);
    }
    const dbRows = depositsToUse
        .filter(d => d.deposit_date && d.deposit_date.startsWith(monthKey))
        .map(d => ({
            dateOfSales: d.deposit_date,
            depositDate: d.deposit_date,
            covered: cashByDay ? (cashByDay[d.deposit_date] || 0) : 0,
            receipt: parseFloat(d.amount || 0),
            fromDB: true,
            description: d.description || '',
            // Match receipt photo by date|amount|description key
            receiptKey: `${d.deposit_date}|${parseFloat(d.amount||0)}|${(d.description||'').trim()}`
        }));

    // Manual rows come from the edit modal only (no add-row inline)
    const manualRows = depositRowsByMonth[monthKey] || [];
    const allRows = [...dbRows, ...manualRows];

    if (allRows.length === 0) {
        body.innerHTML = `<tr id="deposit-empty-row"><td colspan="9" class="py-10 text-center text-slate-500 italic text-xs">No deposit records yet.</td></tr>`;
        const c = document.getElementById('monthly-deposit-total-covered');
        const r = document.getElementById('monthly-deposit-total-receipt');
        const d = document.getElementById('monthly-deposit-total-discrepancy');
        if (c) c.textContent = '—'; if (r) r.textContent = '—'; if (d) d.textContent = '—';
        return;
    }

    body.innerHTML = '';
    let totalCovered = 0, totalReceipt = 0;

    allRows.forEach((row, idx) => {
        const covered = parseFloat(row.covered) || 0;
        const receipt = parseFloat(row.receipt) || 0;
        const disc    = receipt - covered;
        totalCovered += covered;
        totalReceipt += receipt;

        const overrideKey = `${monthKey}-${idx}`;
        const ov = window._depositOverrides[overrideKey] || {};

        // Status: use override if set, otherwise derive from discrepancy
        const savedStatus = ov.status || '';
        const autoStatus  = Math.abs(disc) < 0.01 ? 'Balanced' : disc > 0 ? 'Over' : 'Short';
        const currentStatus = savedStatus || autoStatus;

        const statusColor = currentStatus === 'Balanced' ? 'bg-emerald-100 text-emerald-800'
                          : currentStatus === 'Over'     ? 'bg-blue-100 text-blue-800'
                          :                                'bg-red-100 text-red-800';

        const discColor = Math.abs(disc) < 0.01 ? 'text-slate-800'
                        : disc > 0 ? 'text-slate-800'
                        : 'text-red-700 font-bold';

        const adminNotes = ov.notes || '';
        const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

        // Receipt photo thumbnail
        const receiptImg = row.receiptKey ? (receiptStore[row.receiptKey] || '') : '';
        const receiptCell = receiptImg
            ? `<td class="px-3 py-2 text-center">
                <button onclick="openReceiptLightbox('${receiptImg.replace(/'/g, "\\'")}', event)"
                        class="inline-block w-14 h-14 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 shadow-sm hover:shadow-md transition-all active:scale-95 focus:outline-none">
                    <img src="${receiptImg}" alt="Receipt" class="w-full h-full object-cover">
                </button>
               </td>`
            : `<td class="px-3 py-2 text-center">
                <span class="text-[10px] text-slate-300 italic">No photo</span>
               </td>`;

        body.innerHTML += `
            <tr class="${rowBg} border-b border-slate-200 text-[11px]" id="dep-row-${monthKey}-${idx}">
                <td class="px-3 py-2.5 font-mono text-slate-800 font-semibold">${row.dateOfSales || '—'}</td>
                <td class="px-3 py-2.5 font-mono text-slate-800 font-semibold">${row.depositDate || '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">${covered > 0 ? fmtAlways(covered) : '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">${receipt > 0 ? fmtAlways(receipt) : '—'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold ${discColor}">${Math.abs(disc) > 0.01 ? fmtAlways(Math.abs(disc)) : '—'}</td>
                <td class="px-3 py-2.5 text-center">
                    <select onchange="(function(el,k){window._depositOverrides[k]=window._depositOverrides[k]||{};window._depositOverrides[k].status=el.value;_lsSet(LS_KEY_DEP_OV,window._depositOverrides);})(this,'${overrideKey}')"
                            class="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 outline-none cursor-pointer ${statusColor}">
                        <option value="Balanced" ${currentStatus === 'Balanced' ? 'selected' : ''}>Balanced</option>
                        <option value="Over"      ${currentStatus === 'Over'     ? 'selected' : ''}>Over</option>
                        <option value="Short"     ${currentStatus === 'Short'    ? 'selected' : ''}>Short</option>
                    </select>
                </td>
                <td class="px-3 py-2.5 text-slate-800 font-semibold max-w-[160px] truncate" title="${(row.description || '').replace(/"/g, '&quot;')}">${row.description || '<span class="text-slate-400 italic">—</span>'}</td>
                ${receiptCell}
                <td class="px-3 py-2.5 min-w-[160px]">
                    <input type="text" placeholder="Admin notes…" value="${adminNotes.replace(/"/g, '&quot;')}"
                           onchange="(function(el,k){window._depositOverrides[k]=window._depositOverrides[k]||{};window._depositOverrides[k].notes=el.value;_lsSet(LS_KEY_DEP_OV,window._depositOverrides);})(this,'${overrideKey}')"
                           class="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-cyan-400 placeholder-slate-400">
                </td>
            </tr>`;
    });

    const totalDiscrep = totalReceipt - totalCovered;
    const covEl = document.getElementById('monthly-deposit-total-covered');
    const recEl = document.getElementById('monthly-deposit-total-receipt');
    const disEl = document.getElementById('monthly-deposit-total-discrepancy');
    if (covEl) covEl.textContent = totalCovered > 0 ? fmtAlways(totalCovered) : '—';
    if (recEl) recEl.textContent = totalReceipt > 0 ? fmtAlways(totalReceipt) : '—';
    if (disEl) disEl.textContent = Math.abs(totalDiscrep) > 0.01 ? fmtAlways(Math.abs(totalDiscrep)) : '—';
}

// ── RECEIPT LIGHTBOX ──
function openReceiptLightbox(src, event) {
    if (event) event.stopPropagation();
    const lb  = document.getElementById('receipt-lightbox');
    const img = document.getElementById('receipt-lightbox-img');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeReceiptLightbox() {
    const lb = document.getElementById('receipt-lightbox');
    if (lb) lb.classList.add('hidden');
    document.body.style.overflow = '';
}

// ── DEPOSIT EDIT MODAL ──
// Edit existing DB deposit values (description, covered, receipt, dates)
let _depositEditRows = [];

function openDepositEdit() {
    if (!selectedMonth) { alert('Select a month first.'); return; }

    // Build editable list from DB rows for this month + manual rows
    let depositsToUse = allDeposits;
    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        const bu = BRANCH_USERS[activeBranch] || [];
        depositsToUse = allDeposits.filter(d => bu.includes(d.employee_username));
    } else if (currentUser.role !== 'admin') {
        depositsToUse = allDeposits.filter(d => d.employee_username === currentUser.username);
    }
    const dbRows = depositsToUse
        .filter(d => d.deposit_date && d.deposit_date.startsWith(selectedMonth))
        .map(d => ({
            dateOfSales: d.deposit_date,
            depositDate: d.deposit_date,
            covered: 0,
            receipt: parseFloat(d.amount || 0),
            fromDB: true,
            description: d.description || ''
        }));
    const manualRows = JSON.parse(JSON.stringify(depositRowsByMonth[selectedMonth] || []));

    // Merge: DB rows shown read-only in fields except covered/receipt overrides; manual fully editable
    _depositEditRows = [
        ...dbRows.map(r => ({ ...r })),
        ...manualRows
    ];

    const label = document.getElementById('deposit-edit-month-label');
    if (label) label.textContent = 'Month: ' + selectedMonth;

    _renderDepositEditRows();
    document.getElementById('deposit-edit-modal').showModal();
}

function closeDepositEdit() {
    document.getElementById('deposit-edit-modal').close();
}

function _renderDepositEditRows() {
    const container = document.getElementById('deposit-edit-rows');
    if (!container) return;

    if (_depositEditRows.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 text-xs italic py-4">No deposit records for this month.</p>`;
        return;
    }

    container.innerHTML = _depositEditRows.map((row, i) => {
        const isDB = row.fromDB;
        return `
        <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Row ${i + 1}${isDB ? ' — Employee Deposit' : ' — Manual'}</span>
                ${!isDB ? `<button onclick="_removeDepositEditRow(${i})" class="text-[10px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">Remove</button>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Date of Sales</label>
                    <input type="date" value="${row.dateOfSales || ''}" ${isDB ? 'readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 outline-none cursor-default"' : `oninput="_depositEditRows[${i}].dateOfSales = this.value" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-blue-400 outline-none"`}>
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Deposit Date</label>
                    <input type="date" value="${row.depositDate || ''}" ${isDB ? 'readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 outline-none cursor-default"' : `oninput="_depositEditRows[${i}].depositDate = this.value" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-blue-400 outline-none"`}>
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Total Cash Sales Covered</label>
                    <input type="number" step="0.01" placeholder="0.00" value="${row.covered || ''}" oninput="_depositEditRows[${i}].covered = parseFloat(this.value) || 0"
                           class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-blue-400 outline-none font-mono text-right">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Deposit Amount (Receipt)</label>
                    <input type="number" step="0.01" placeholder="0.00" value="${row.receipt || ''}" ${isDB ? 'readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700 font-semibold outline-none font-mono text-right cursor-default"' : `oninput="_depositEditRows[${i}].receipt = parseFloat(this.value) || 0" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-blue-400 outline-none font-mono text-right"`}>
                </div>
            </div>
            <div>
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
                <input type="text" placeholder="${isDB ? 'Employee description (read-only)' : 'Enter description…'}" value="${(row.description || '').replace(/"/g, '&quot;')}" ${isDB ? 'readonly class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700 font-semibold outline-none cursor-default"' : `oninput="_depositEditRows[${i}].description = this.value" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-blue-400 outline-none"`}>
            </div>
        </div>`;
    }).join('');
}

function _removeDepositEditRow(idx) {
    _depositEditRows.splice(idx, 1);
    _renderDepositEditRows();
}

function saveDepositEdit() {
    // Save only the manual (non-DB) rows back
    depositRowsByMonth[selectedMonth] = _depositEditRows
        .filter(r => !r.fromDB)
        .map(r => ({ dateOfSales: r.dateOfSales, depositDate: r.depositDate, covered: r.covered, receipt: r.receipt, description: r.description || '' }));
    closeDepositEdit();
    renderMonthlyTable();
}

// Keep addDepositRow as internal — no longer called from UI
function addDepositRow() {
    if (!selectedMonth) return;
    if (!depositRowsByMonth[selectedMonth]) depositRowsByMonth[selectedMonth] = [];
    depositRowsByMonth[selectedMonth].push({ dateOfSales: selectedMonth + '-01', depositDate: selectedMonth + '-01', covered: 0, receipt: 0, description: '' });
    renderMonthlyTable();
}

function removeDepositRow(manualIdx, monthKey) {
    if (!depositRowsByMonth[monthKey]) return;
    depositRowsByMonth[monthKey].splice(manualIdx, 1);
    renderMonthlyTable();
}

function openMonthlyEditModal(key, ds, staff, currentSales, currentExp, currentExpDesc) {
    document.getElementById('me-date').value  = ds;
    document.getElementById('me-staff').value = staff;
    const [yy, mm, dd] = ds.split('-').map(Number);
    const dateStr = new Date(yy, mm-1, dd).toLocaleString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
    document.getElementById('monthly-edit-date-label').textContent = staff.toUpperCase() + ' — ' + dateStr.toUpperCase();
    document.getElementById('me-sales').value    = currentSales > 0 ? currentSales : '';
    document.getElementById('me-expenses').value = currentExp   > 0 ? currentExp   : '';
    document.getElementById('me-exp-desc').value = currentExpDesc || '';
    document.getElementById('monthly-edit-modal').showModal();
}

function closeMonthlyEditModal() { document.getElementById('monthly-edit-modal').close(); }

function saveMonthlyRowEdit() {
    const ds    = document.getElementById('me-date').value;
    const staff = document.getElementById('me-staff').value;
    const key   = `${ds}|${staff}`;
    const salesVal = parseFloat(document.getElementById('me-sales').value);
    const expVal   = parseFloat(document.getElementById('me-expenses').value);
    const expDesc  = document.getElementById('me-exp-desc').value.trim();
    monthlyOverrides[key] = {
        sales:    isNaN(salesVal) ? undefined : salesVal,
        expenses: isNaN(expVal)  ? undefined : expVal,
        expDesc:  expDesc || undefined,
    };
    closeMonthlyEditModal();
    renderMonthlyTable();
}

// ── GRAND TOTAL EDIT MODAL ──
function openGrandTotalEdit() {
    if (!selectedMonth) { alert('Select a month first.'); return; }
    const ov = grandTotalOverrides[selectedMonth] || {};
    document.getElementById('gte-salary15').value = ov.salary15 || '';
    document.getElementById('gte-salary30').value = ov.salary30 || '';
    document.getElementById('gte-soa').value      = ov.soa      || '';
    document.getElementById('gte-waiver').value   = ov.waiver   || '';
    document.getElementById('gte-or').value       = ov.or       || '';
    document.getElementById('gte-vat').value      = ov.vat      || '';
    document.getElementById('gt-edit-modal').showModal();
}

function closeGrandTotalEdit() { document.getElementById('gt-edit-modal').close(); }

function saveGrandTotalEdit() {
    if (!selectedMonth) return;
    grandTotalOverrides[selectedMonth] = {
        salary15: parseFloat(document.getElementById('gte-salary15').value) || 0,
        salary30: parseFloat(document.getElementById('gte-salary30').value) || 0,
        soa:      parseFloat(document.getElementById('gte-soa').value)      || 0,
        waiver:   parseFloat(document.getElementById('gte-waiver').value)   || 0,
        or:       parseFloat(document.getElementById('gte-or').value)       || 0,
        vat:      parseFloat(document.getElementById('gte-vat').value)      || 0,
    };
    closeGrandTotalEdit();
    renderMonthlyTable();
}

// ── NOTIFICATIONS ──
async function loadNotifications() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
        const res  = await apiFetch('api.php?action=getNotifications');
        const data = await res.json();
        renderNotifications(data);
    } catch(e) { /* silent */ }
}

function renderNotifications(items) {
    const list  = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (!list || !badge) return;
    const unread = items.filter(n => n.is_read == 0).length;
    if (unread > 0) { badge.textContent = unread > 99 ? '99+' : unread; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
    if (items.length === 0) { list.innerHTML = '<p class="py-8 text-center text-slate-400 text-xs italic">No activity yet.</p>'; return; }
    list.innerHTML = items.map(n => {
        const isEdit = n.action_type === 'EDIT';
        const bg  = n.is_read == 0 ? 'bg-blue-50' : 'bg-white';
        const dot = n.is_read == 0 ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1"></span>' : '<span class="w-1.5 h-1.5 shrink-0"></span>';
        const icon = isEdit
            ? '<span class="text-[10px] bg-cyan-100 text-cyan-700 font-bold px-1.5 py-0.5 rounded-md">EDIT</span>'
            : '<span class="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-md">DELETE</span>';
        const dt = new Date(n.created_at.replace(' ','T') + '+08:00');
        const timeStr = dt.toLocaleString('en-PH', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true});
        return `<div class="flex items-start gap-2 px-4 py-3 ${bg} hover:bg-slate-50 transition-colors">
            ${dot}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">${icon}
                    <span class="text-[10px] font-bold text-slate-700 uppercase">${n.employee_username}</span>
                    <span class="text-[9px] text-slate-400 ml-auto">${timeStr}</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-0.5 truncate">${n.detail}</p>
            </div></div>`;
    }).join('');
}

function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) loadNotifications();
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('notif-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.classList.add('hidden');
    }
});

async function markAllRead() {
    await apiFetch('api.php?action=markNotificationsRead', { method: 'POST' });
    loadNotifications();
}

function startNotifPolling() {
    loadNotifications();
    if (notifPollTimer) clearInterval(notifPollTimer);
    notifPollTimer = setInterval(loadNotifications, 30000);
}

function renderMonthlySummary() {
    buildMonthPicker();
    renderMonthlyTable();
}

// ── YEARLY SUMMARY ──
// Branches in order matching the spreadsheet
const YEARLY_BRANCHES = [
    { key: 'smartwheels', label: 'SmartWheels', users: ['smartwheels'] },
    { key: 'pampanga',    label: 'Pampanga',    users: ['pampanga'] },
    { key: 'dataan',      label: 'Dataan',      users: ['dataan'] },
    { key: 'trinoma',     label: 'Trinoma',     users: ['trinoma'] },
    { key: 'baliwag',     label: 'Baliwag',     users: ['baliwag'] },
];

const MONTHS_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let selectedYear = null;

function onYearPickerChange() {
    selectedYear = parseInt(document.getElementById('year-picker').value);
    renderYearlyTables();
}

function buildYearPicker() {
    const picker = document.getElementById('year-picker');
    const thisYear = new Date().getFullYear();
    const years = new Set();
    allLogs.forEach(l => { if(l.created_at) years.add(parseInt(l.created_at.slice(0,4))); });
    allExpenses.forEach(e => { if(e.expense_date) years.add(parseInt(e.expense_date.slice(0,4))); });
    if (!years.has(thisYear)) years.add(thisYear);

    const sorted = [...years].sort().reverse();
    picker.innerHTML = '';
    sorted.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + (y === thisYear ? ' (Current)' : '');
        picker.appendChild(opt);
    });
    if (!selectedYear || !years.has(selectedYear)) selectedYear = thisYear;
    picker.value = selectedYear;
}

function buildYearlyHeader(trEl) {
    trEl.innerHTML = `<th class="px-4 py-3.5 text-left whitespace-nowrap">Month</th>` +
        YEARLY_BRANCHES.map(b => `<th class="px-4 py-3.5 text-right whitespace-nowrap">${b.label}</th>`).join('') +
        `<th class="px-4 py-3.5 text-right whitespace-nowrap">Total</th>`;
}

function renderYearlyTables() {
    const yr = selectedYear;

    const grossSales = {};
    const expenses   = {};
    const deposit    = {};

    YEARLY_BRANCHES.forEach(b => {
        grossSales[b.key] = new Array(12).fill(0);
        expenses[b.key]   = new Array(12).fill(0);
        deposit[b.key]    = new Array(12).fill(0);
    });

    allLogs.forEach(log => {
        if (!log.created_at) return;
        const logYear = parseInt(log.created_at.slice(0,4));
        if (logYear !== yr) return;
        const monthIdx = parseInt(log.created_at.slice(5,7)) - 1;
        const branch = YEARLY_BRANCHES.find(b => b.users.includes(log.employee_username));
        if (!branch) return;
        const base = parseFloat(log.amount_cash > 0 ? log.amount_cash : (log.amount_gcash > 0 ? log.amount_gcash : 0)) || 0;
        const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
        const total = base + addl;
        grossSales[branch.key][monthIdx] += total;
        if (log.amount_cash > 0 && log.payment_method !== 'GCash') {
            deposit[branch.key][monthIdx] += total;
        }
    });

    allExpenses.forEach(exp => {
        if (!exp.expense_date) return;
        const expYear = parseInt(exp.expense_date.slice(0,4));
        if (expYear !== yr) return;
        const monthIdx = parseInt(exp.expense_date.slice(5,7)) - 1;
        const branch = YEARLY_BRANCHES.find(b => b.users.includes(exp.employee_username));
        if (!branch) return;
        expenses[branch.key][monthIdx] += parseFloat(exp.amount || 0);
    });

    const fmt = v => v > 0
        ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        : `<span class="text-slate-300">—</span>`;

    function buildTableRows(tbodyId, headerId, tfootId, totalFn, footColor) {
        const tbody = document.getElementById(tbodyId);
        const thead = document.getElementById(headerId);
        const tfoot = document.getElementById(tfootId);
        buildYearlyHeader(thead);
        tbody.innerHTML = '';

        let colTotals = new Array(YEARLY_BRANCHES.length).fill(0);
        let grandTotal = 0;

        MONTHS_LABELS.forEach((mon, mi) => {
            let rowTotal = 0;
            const cells = YEARLY_BRANCHES.map((b, bi) => {
                const val = totalFn(b.key, mi);
                colTotals[bi] += val;
                rowTotal += val;
                return `<td class="px-4 py-3 text-right font-mono text-[11px]">${fmt(val)}</td>`;
            });
            grandTotal += rowTotal;
            tbody.innerHTML += `<tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-3 font-semibold text-[11px] text-slate-700 whitespace-nowrap">${mon}</td>
                ${cells.join('')}
                <td class="px-4 py-3 text-right font-mono font-bold text-[11px] text-slate-800">${fmt(rowTotal)}</td>
            </tr>`;
        });

        // Totals footer row
        if (tfoot) {
            tfoot.innerHTML = `<tr>
                <td class="px-4 py-3.5 text-right text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap">Total</td>
                ${colTotals.map(v => `<td class="px-4 py-3.5 text-right font-mono text-[11px] ${footColor}">${fmt(v)}</td>`).join('')}
                <td class="px-4 py-3.5 text-right font-mono font-bold text-[11px] text-slate-800">${fmt(grandTotal)}</td>
            </tr>`;
        }
    }

    buildTableRows('yearly-gross-body', 'yearly-gross-header', 'yearly-gross-foot', (k, mi) => grossSales[k][mi], 'text-emerald-700');
    buildTableRows('yearly-exp-body',   'yearly-exp-header',   'yearly-exp-foot',   (k, mi) => expenses[k][mi],   'text-amber-600');
    buildTableRows('yearly-net-body',   'yearly-net-header',   'yearly-net-foot',   (k, mi) => grossSales[k][mi] - expenses[k][mi], 'text-slate-700');
    buildTableRows('yearly-dep-body',   'yearly-dep-header',   'yearly-dep-foot',   (k, mi) => deposit[k][mi],    'text-blue-600');
}

function renderYearlySummary() {
    buildYearPicker();
    renderYearlyTables();
}