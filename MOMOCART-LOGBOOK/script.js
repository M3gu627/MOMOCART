let currentUser = null;
let allLogs = [];
let currentPage = 1;
let filteredTotal = 0;
let allExpenses = [];
const ITEMS_PER_PAGE = 10;

// Always send session cookie with every API request
function apiFetch(url, options = {}) {
    return fetch(url, { credentials: 'include', ...options });
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
    const titles = { pampanga: 'Pampanga', baliwag: 'Baliwag', trinoma: 'Trinoma' };
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

// Event delegation — handles delete clicks for all dynamically rendered rows
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const id   = parseInt(btn.dataset.deleteId);
    const name = btn.dataset.deleteName;
    showDeleteModal(id, name);
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
        const [logsRes, expRes] = await Promise.all([
            apiFetch('api.php?action=getLogs'),
            apiFetch('api.php?action=getExpenses')
        ]);
        const logsData = await logsRes.json();
        const expData  = await expRes.json();
        allLogs     = Array.isArray(logsData) ? logsData : [];
        allExpenses = Array.isArray(expData)  ? expData  : [];
    } catch(e) {
        console.error('loadLogs error:', e);
        allLogs = []; allExpenses = [];
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

        // Admin gets all tabs — show Weekly, Monthly, Yearly
        ['tab-weekly', 'tab-monthly', 'tab-yearly'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('hidden');
        });

        buildAdminToolbar();
    } else {
        // Reveal action buttons only for non-admin employees
        const actionWrap = document.getElementById('action-buttons-wrap');
        if (actionWrap) { actionWrap.classList.remove('hidden'); actionWrap.classList.add('flex'); }
        const fabBtn = document.getElementById('fab-btn');
        if (fabBtn) fabBtn.classList.remove('hidden');

        // Hide Weekly, Monthly, Yearly tabs — branch accounts only see Logs & Daily
        ['tab-weekly', 'tab-monthly', 'tab-yearly'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
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
        { key: 'all',      label: 'All' },
        { key: 'baliwag',  label: 'Baliwag' },
        { key: 'pampanga', label: 'Pampanga' },
        { key: 'trinoma',  label: 'Trinoma' },
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
    baliwag:  ['baliwag'],
    pampanga: ['pampanga'],
    trinoma:  ['trinoma'],
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
        const timeOutDisplay = isUnlimited
            ? '<span class="text-slate-400 text-[10px] font-mono">--:-- No Limit</span>'
            : '<span class="font-mono text-rose-500">' + log.time_out + '</span>';

        const actionCell = currentUser.role === 'admin'
            ? `<td class="px-4 py-4 text-center">
                <button data-delete-id="${log.id}" data-delete-name="${log.name.replace(/"/g, '&quot;')}"
                    class="action-btn delete-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                    DELETE
                </button>
               </td>`
            : `<td class="px-4 py-4 text-center">
                <div class="flex flex-col items-center gap-1">
                    ${isReturned
                        ? `<span class="text-slate-400 text-[10px]">✓ ${log.return_time}</span>`
                        : `<button onclick="markReturned(${log.id})" class="bg-amber-400 text-white px-3 py-1 rounded-xl text-[10px] font-bold">RETURN</button>`}
                    <button data-delete-id="${log.id}" data-delete-name="${log.name.replace(/"/g, '&quot;')}"
                        class="action-btn delete-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors mt-1">
                        DELETE
                    </button>
                </div>
               </td>`;

        html += `
            <td class="px-4 py-4 text-slate-400">${startIndex + index + 1}</td>
            <td class="px-4 py-4 font-bold text-slate-700">${log.name}</td>
            <td class="px-4 py-4">${log.waiver}</td>
            <td class="px-4 py-4 font-mono text-[10px]">${log.or_number}</td>
            <td class="px-4 py-4">${log.cart_number}</td>
            <td class="px-4 py-4">${log.valid_id}</td>
            <td class="px-4 py-4 font-mono text-emerald-600">${log.time_in}</td>
            <td class="px-4 py-4">${timeOutDisplay}</td>
            <td class="px-4 py-4 font-mono text-slate-500">${log.return_time || '--:--'}</td>
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

function stampTimeInNow() {
    const now = new Date();
    document.getElementById('form-timein').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    autoCalculateTimeOut();
}

function stampReturnNow() {
    const now = new Date();
    document.getElementById('form-return-time').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
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
    document.getElementById('form-waiver').value = '';
    document.getElementById('form-or').value = '';
    document.getElementById('form-cart').value = '';
    document.getElementById('form-timein').value = '';
    document.getElementById('form-timeout').value = '';
    document.getElementById('form-return-time').value = '';
    document.getElementById('form-amount').value = '';
    document.getElementById('form-add-charge').value = '';
    document.getElementById('form-duration').value = '30';
    document.getElementById('form-validid').value = 'Regular';
    document.getElementById('form-payment-method').value = 'Cash';
    document.getElementById('form-payment-other').value = '';
    document.getElementById('payment-other-wrap').classList.add('hidden');
    document.getElementById('discount-note').classList.add('hidden');
    document.getElementById('live-total').innerHTML = '₱0.00';
    const timeoutInput = document.getElementById('form-timeout');
    timeoutInput.disabled = false;
    timeoutInput.placeholder = '';
    timeoutInput.classList.remove('opacity-40', 'cursor-not-allowed');
    autoSetRentalAmount();
    document.getElementById('add-modal').showModal();
}
function hideAddModal() { document.getElementById('add-modal').close(); }

async function submitNewEntry() {
    const log = {
        name: document.getElementById('form-name').value,
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
    // Branch accounts may only access Logs (0) and Daily (1)
    if (currentUser && currentUser.role !== 'admin' && tab > 1) return;

    currentTab = tab;
    document.querySelectorAll('#tab-container button').forEach((btn, i) => {
        btn.classList.toggle('active', i === tab);
    });
    ['logs-content','daily-content','weekly-content','monthly-content','yearly-content']
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
    }
}

// ── DAILY SUMMARY ──
function renderDailySummary() {
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

    const monthLabel = document.getElementById('daily-month-label');
    if (monthLabel) {
        const now = new Date();
        monthLabel.textContent = now.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
    }
    const branchLabel = document.getElementById('daily-branch-label');
    if (branchLabel) {
        if (currentUser.role === 'admin' && activeBranch !== 'all') {
            branchLabel.textContent = activeBranch.toUpperCase();
            branchLabel.classList.remove('hidden');
        } else {
            branchLabel.classList.add('hidden');
        }
    }

    // Group by date+branch key so every branch shows its own row per day
    const groups = {};  // key: "YYYY-MM-DD|username"

    logsToUse.forEach(log => {
        const dateStr = log.created_at ? log.created_at.split(' ')[0] : 'N/A';
        const key = `${dateStr}|${log.employee_username}`;
        if (!groups[key]) groups[key] = { dateStr, staff: log.employee_username, logs: [], exps: [] };
        groups[key].logs.push(log);
    });

    expsToUse.forEach(exp => {
        const dateStr = exp.expense_date;
        const key = `${dateStr}|${exp.employee_username}`;
        if (!groups[key]) groups[key] = { dateStr, staff: exp.employee_username, logs: [], exps: [] };
        groups[key].exps.push(exp);
    });

    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExpenses = 0;

    // Sort by date desc, then by staff name asc within same date
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        const [dateA, staffA] = a.split('|');
        const [dateB, staffB] = b.split('|');
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return staffA.localeCompare(staffB);
    });

    if (sortedKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-12 text-center text-slate-400 italic">No records for this branch/period.</td></tr>`;
        ['daily-total-sales','daily-total-gcash','daily-total-cash','daily-total-expenses','daily-grand-total']
            .forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = '₱0.00'; });
        return;
    }

    sortedKeys.forEach(key => {
        const { dateStr, staff, logs, exps } = groups[key];

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

        const [y, m, d] = dateStr.split('-').map(Number);
        const dayName = new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'short' });
        const netTotal = sales - dayExpenses;

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-4 font-medium text-cyan-700">${staff}</td>
                <td class="px-4 py-4">${dayName}</td>
                <td class="px-4 py-4">${dateStr}</td>
                <td class="px-4 py-4 text-right font-mono">₱${sales.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono">₱${gcash.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono">₱${cashOnHand.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-mono text-amber-600">₱${dayExpenses.toFixed(2)}</td>
                <td class="px-4 py-4 text-right font-bold">₱${netTotal.toFixed(2)}</td>
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
    document.getElementById('daily-grand-total').innerHTML    = `₱${(grandSales - grandExpenses).toFixed(2)}`;
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
        let sales = 0, gcash = 0, cash = 0;

        dl.forEach(log => {
            const base = parseFloat(log.amount_cash > 0 ? log.amount_cash : (log.amount_gcash > 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash > 0 && log.payment_method !== 'GCash') cash += rt;
            else gcash += rt;
        });

        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
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
                <td class="px-4 py-3 text-right font-mono">₱${cash.toFixed(2)}</td>
            </tr>`;

        grandSales    += sales;
        grandGCash    += gcash;
        grandCash     += cash;
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

    document.getElementById('weekly-total-sales').innerHTML    = `₱${grandSales.toFixed(2)}`;
    document.getElementById('weekly-total-gcash').innerHTML    = `₱${grandGCash.toFixed(2)}`;
    document.getElementById('weekly-total-expenses').innerHTML = `₱${grandExpenses.toFixed(2)}`;
    document.getElementById('weekly-total-cash').innerHTML     = `₱${grandCash.toFixed(2)}`;
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
    const salesBody    = document.getElementById('monthly-sales-body');
    const expensesBody = document.getElementById('monthly-expenses-body');
    salesBody.innerHTML    = '';
    expensesBody.innerHTML = '';

    const zero = '₱0.00';
    if (!selectedMonth) {
        salesBody.innerHTML    = `<tr><td colspan="5" class="py-12 text-center text-slate-400 italic">Select a month above.</td></tr>`;
        expensesBody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-slate-400 italic">—</td></tr>`;
        ['monthly-total-sales','monthly-total-gcash','monthly-total-expenses','monthly-total-cash','monthly-total-expense']
            .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = zero; });
        return;
    }

    const buckets = buildMonthBuckets();
    const bucket  = buckets[selectedMonth] || { logs: [], exps: [] };
    const { logs, exps } = bucket;

    // Group by day within the month
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
        salesBody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 italic">No records for this month.</td></tr>`;
    }

    sortedDays.forEach(ds => {
        const dl = dayGroups[ds].logs;
        const de = dayGroups[ds].exps;
        let sales = 0, gcash = 0, cash = 0;

        dl.forEach(log => {
            const base = parseFloat(log.amount_cash > 0 ? log.amount_cash : (log.amount_gcash > 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash > 0 && log.payment_method !== 'GCash') cash += rt;
            else gcash += rt;
        });

        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
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
                <td class="px-4 py-3 text-right font-mono">₱${cash.toFixed(2)}</td>
            </tr>`;

        grandSales    += sales;
        grandGCash    += gcash;
        grandCash     += cash;
        grandExpenses += dayExp;
    });

    if (exps.length === 0) {
        expensesBody.innerHTML = `<tr><td colspan="3" class="py-10 text-center text-slate-400 italic">No expenses this month.</td></tr>`;
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

    document.getElementById('monthly-total-sales').innerHTML    = `₱${grandSales.toFixed(2)}`;
    document.getElementById('monthly-total-gcash').innerHTML    = `₱${grandGCash.toFixed(2)}`;
    document.getElementById('monthly-total-expenses').innerHTML = `₱${grandExpenses.toFixed(2)}`;
    document.getElementById('monthly-total-cash').innerHTML     = `₱${grandCash.toFixed(2)}`;
    document.getElementById('monthly-total-expense').innerHTML  = `₱${grandExpenses.toFixed(2)}`;
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
    { key: 'technocargo', label: 'Technocargo', users: ['technocargo'] },
    { key: 'baliwag',     label: 'Baliwag',     users: ['baliwag'] },
    { key: 'sjdm',        label: 'SJDM',        users: ['sjdm'] },
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