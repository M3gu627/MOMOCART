// ── SUMMARIES: DAILY, WEEKLY, MONTHLY, YEARLY ──

let selectedDailyDate = null;

function buildDailyDatePicker(logsToUse, expsToUse) {
    const picker = document.getElementById('daily-date-picker');
    if (!picker) return;

    // Collect all unique dates from logs and expenses
    const dateSet = new Set();
    logsToUse.forEach(log => { if (log.created_at) dateSet.add(log.created_at.split(' ')[0]); });
    expsToUse.forEach(exp => { if (exp.expense_date) dateSet.add(exp.expense_date); });

    // Use header date as the preferred default; fall back to real today
    const headerDate = document.getElementById('header-date')?.value;
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    const preferredDate = headerDate || todayStr;

    // Always include the preferred date so it appears even with no records yet
    dateSet.add(preferredDate);

    const sortedDates = [...dateSet].sort().reverse(); // newest first

    // Sync selectedDailyDate to header date whenever header changes
    if (!selectedDailyDate || !dateSet.has(selectedDailyDate)) {
        selectedDailyDate = dateSet.has(preferredDate) ? preferredDate : sortedDates[0];
    }
    // If header date is explicitly set, always snap the picker to it
    if (headerDate && dateSet.has(headerDate)) {
        selectedDailyDate = headerDate;
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
        logsToUse = allLogs.filter(log => branchUsers.includes(log.employee_username) || log.employee_username === 'admin');
        expsToUse = allExpenses.filter(exp => branchUsers.includes(exp.employee_username) || exp.employee_username === 'admin');
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
        logsToUse = allLogs.filter(log => branchUsers.includes(log.employee_username) || log.employee_username === 'admin');
        expsToUse = allExpenses.filter(exp => branchUsers.includes(exp.employee_username) || exp.employee_username === 'admin');
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
    } else {
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

    // ── DEPOSIT DETAIL TABLE (admin only, below expenses) ──
    renderDailyDepositSection(selectedDailyDate);
}

function renderDailyDepositSection(dateStr) {
    const depWrap = document.getElementById('daily-deposit-detail');
    if (!depWrap) return;

    // Only show for admin
    if (!currentUser || currentUser.role !== 'admin') {
        depWrap.innerHTML = '';
        return;
    }

    // Filter deposits for the selected day, respecting branch filter
    let depsToUse = allDeposits;
    if (activeBranch !== 'all') {
        const bu = BRANCH_USERS[activeBranch] || [];
        depsToUse = allDeposits.filter(d => bu.includes(d.employee_username) || d.employee_username === 'admin');
    }
    const dayDeps = depsToUse.filter(d => d.deposit_date === dateStr);

    const newDepBtn = `<button onclick="showDepositModal()"
            class="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow transition-colors active:scale-95">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
        New Deposit
    </button>`;

    if (dayDeps.length === 0) {
        depWrap.innerHTML = `
            <div class="mt-6 flex items-center justify-between mb-2">
                <p class="stat-label text-blue-600">Deposits This Day</p>
                ${newDepBtn}
            </div>
            <p class="text-slate-400 italic text-xs py-4 text-center">No deposits recorded for this day.</p>`;
        return;
    }

    let depHtml = `
        <div class="mt-6 flex items-center justify-between mb-2">
            <p class="stat-label text-blue-600">Deposits This Day</p>
            ${newDepBtn}
        </div>
        <div class="table-container overflow-x-auto">
        <table class="w-full text-xs">
            <thead class="bg-[#0f172a] text-white">
                <tr>
                    <th class="px-4 py-3.5 text-left">Staff</th>
                    <th class="px-4 py-3.5 text-left">Time</th>
                    <th class="px-4 py-3.5 text-left">Description</th>
                    <th class="px-4 py-3.5 text-center">Receipt</th>
                    <th class="px-4 py-3.5 text-right">Amount</th>
                    <th class="px-4 py-3.5 text-center">Action</th>
                </tr>
            </thead>
            <tbody class="divide-y bg-white">`;

    let totalDep = 0;
    dayDeps.forEach(dep => {
        totalDep += parseFloat(dep.amount || 0);
        const timeRaw = dep.deposit_time ? dep.deposit_time.slice(0, 5) : '--:--';
        const time12 = to12h(timeRaw) || timeRaw;
        const receiptThumb = dep.receipt_photo
            ? `<button onclick="openReceiptLightbox('${dep.receipt_photo.replace(/'/g, "\\'")}', event)"
                       class="inline-block w-12 h-12 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 shadow-sm transition-all active:scale-95">
                   <img src="${dep.receipt_photo}" alt="Receipt" class="w-full h-full object-cover">
               </button>`
            : '<span class="text-slate-300 text-[10px]">—</span>';
        const safeDesc = (dep.description || 'Deposit').replace(/'/g, "\\'");
        depHtml += `
                <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 text-cyan-700 font-medium">${dep.employee_username}</td>
                    <td class="px-4 py-3 font-mono text-blue-600">${time12}</td>
                    <td class="px-4 py-3">${dep.description || '—'}</td>
                    <td class="px-4 py-3 text-center">${receiptThumb}</td>
                    <td class="px-4 py-3 text-right font-mono text-blue-700">₱${parseFloat(dep.amount).toFixed(2)}</td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="openEditDeposit(${dep.id})"
                                    class="action-btn bg-blue-100 text-blue-700 hover:bg-blue-500 hover:text-white transition-colors">EDIT</button>
                            <button onclick="openDeleteExpDep('deposit', ${dep.id}, '${safeDesc}')"
                                    class="action-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors">DELETE</button>
                        </div>
                    </td>
                </tr>`;
    });

    depHtml += `
            </tbody>
            <tfoot class="bg-blue-50 font-bold border-t-2 border-blue-100">
                <tr>
                    <td colspan="4" class="px-4 py-3.5 text-right text-[10px] uppercase tracking-widest text-blue-600">Total Deposits This Day</td>
                    <td class="px-4 py-3.5 text-right font-mono text-blue-700">₱${totalDep.toFixed(2)}</td>
                    <td class="px-4 py-3.5"></td>
                </tr>
            </tfoot>
        </table>
        </div>`;
    depWrap.innerHTML = depHtml;
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
        logsToUse = allLogs.filter(l => bu.includes(l.employee_username) || l.employee_username === 'admin');
        expsToUse = allExpenses.filter(e => bu.includes(e.employee_username) || e.employee_username === 'admin');
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

let selectedMonth = null; // 'YYYY-MM'

function buildMonthBuckets() {
    let logsToUse = allLogs;
    let expsToUse = allExpenses;
    if (currentUser.role === 'admin' && activeBranch !== 'all') {
        // Include branch users AND admin's own expenses/logs for that branch view
        const bu = BRANCH_USERS[activeBranch] || [];
        logsToUse = allLogs.filter(l => bu.includes(l.employee_username) || l.employee_username === 'admin');
        expsToUse = allExpenses.filter(e => bu.includes(e.employee_username) || e.employee_username === 'admin');
    } else if (currentUser.role !== 'admin') {
        logsToUse = allLogs.filter(l => l.employee_username === currentUser.username);
        expsToUse = allExpenses.filter(e => e.employee_username === currentUser.username);
    }
    // When activeBranch === 'all', use all logs and expenses including admin's own

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
            receipt_photo: d.receipt_photo || ''
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

        // Receipt photo thumbnail — pulled from DB field directly
        const receiptImg = row.receipt_photo || '';
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

        // For manual rows: show editable date/amount fields + delete button; for DB rows: show data read-only
        const isManual = !row.fromDB;
        const manualIdx = isManual ? (allRows.filter((r,i) => !r.fromDB && i < idx).length) : -1;

        const dateOfSalesCell = isManual
            ? `<td class="px-3 py-2.5"><input type="date" value="${row.dateOfSales||''}"
                   onchange="updateManualDepRow('${monthKey}',${manualIdx},'dateOfSales',this.value)"
                   class="p-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:ring-2 focus:ring-emerald-400 w-full"></td>`
            : `<td class="px-3 py-2.5 font-mono text-slate-800 font-semibold">${row.dateOfSales || '—'}</td>`;

        const depositDateCell = isManual
            ? `<td class="px-3 py-2.5"><input type="date" value="${row.depositDate||''}"
                   onchange="updateManualDepRow('${monthKey}',${manualIdx},'depositDate',this.value)"
                   class="p-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:ring-2 focus:ring-emerald-400 w-full"></td>`
            : `<td class="px-3 py-2.5 font-mono text-slate-800 font-semibold">${row.depositDate || '—'}</td>`;

        const coveredCell = isManual
            ? `<td class="px-3 py-2.5"><input type="number" step="0.01" value="${covered||''}" placeholder="0.00"
                   onchange="updateManualDepRow('${monthKey}',${manualIdx},'covered',parseFloat(this.value)||0)"
                   class="p-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:ring-2 focus:ring-emerald-400 w-full text-right"></td>`
            : `<td class="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">${covered > 0 ? fmtAlways(covered) : '—'}</td>`;

        const receiptAmtCell = isManual
            ? `<td class="px-3 py-2.5"><input type="number" step="0.01" value="${receipt||''}" placeholder="0.00"
                   onchange="updateManualDepRow('${monthKey}',${manualIdx},'receipt',parseFloat(this.value)||0)"
                   class="p-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:ring-2 focus:ring-emerald-400 w-full text-right"></td>`
            : `<td class="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">${receipt > 0 ? fmtAlways(receipt) : '—'}</td>`;

        const descCell = isManual
            ? `<td class="px-3 py-2.5"><input type="text" value="${(row.description||'').replace(/"/g,'&quot;')}" placeholder="Description…"
                   onchange="updateManualDepRow('${monthKey}',${manualIdx},'description',this.value)"
                   class="p-1 bg-white border border-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-emerald-400 w-full"></td>`
            : `<td class="px-3 py-2.5 text-slate-800 font-semibold max-w-[160px] truncate" title="${(row.description||'').replace(/"/g,'&quot;')}">${row.description || '<span class="text-slate-400 italic">—</span>'}</td>`;

        const notesCell = isManual
            ? `<td class="px-3 py-2.5 flex items-center gap-2 min-w-[180px]">
                   <input type="text" placeholder="Notes…" value="${adminNotes.replace(/"/g,'&quot;')}"
                          onchange="(function(el,k){window._depositOverrides[k]=window._depositOverrides[k]||{};window._depositOverrides[k].notes=el.value;_lsSet(LS_KEY_DEP_OV,window._depositOverrides);})(this,'${overrideKey}')"
                          class="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-cyan-400 placeholder-slate-400">
                   <button onclick="deleteManualDepRow('${monthKey}',${manualIdx})"
                           class="shrink-0 w-6 h-6 bg-red-100 hover:bg-red-500 text-red-500 hover:text-white rounded-full flex items-center justify-center text-[10px] font-bold transition-colors" title="Delete row">&#x2715;</button>
               </td>`
            : `<td class="px-3 py-2.5 min-w-[160px]">
                   <input type="text" placeholder="Admin notes…" value="${adminNotes.replace(/"/g,'&quot;')}"
                          onchange="(function(el,k){window._depositOverrides[k]=window._depositOverrides[k]||{};window._depositOverrides[k].notes=el.value;_lsSet(LS_KEY_DEP_OV,window._depositOverrides);})(this,'${overrideKey}')"
                          class="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-cyan-400 placeholder-slate-400">
               </td>`;

        body.innerHTML += `
            <tr class="${rowBg} border-b border-slate-200 text-[11px]${isManual ? ' ring-1 ring-emerald-200' : ''}" id="dep-row-${monthKey}-${idx}">
                ${dateOfSalesCell}
                ${depositDateCell}
                ${coveredCell}
                ${receiptAmtCell}
                <td class="px-3 py-2.5 text-right font-mono font-semibold ${discColor}">${Math.abs(disc) > 0.01 ? fmtAlways(Math.abs(disc)) : '—'}</td>
                <td class="px-3 py-2.5 text-center">
                    <select onchange="(function(el,k){window._depositOverrides[k]=window._depositOverrides[k]||{};window._depositOverrides[k].status=el.value;_lsSet(LS_KEY_DEP_OV,window._depositOverrides);})(this,'${overrideKey}')"
                            class="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 outline-none cursor-pointer ${statusColor}">
                        <option value="Balanced" ${currentStatus === 'Balanced' ? 'selected' : ''}>Balanced</option>
                        <option value="Over"      ${currentStatus === 'Over'     ? 'selected' : ''}>Over</option>
                        <option value="Short"     ${currentStatus === 'Short'    ? 'selected' : ''}>Short</option>
                    </select>
                </td>
                ${descCell}
                ${receiptCell}
                ${notesCell}
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