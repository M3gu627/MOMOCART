// ── MOMOCART EXPORT MODULE ──
// Handles XLSX export for all tabs: LOGS, DAILY, WEEKLY, MONTHLY, YEARLY, EXPENSES, DEPOSIT
// File naming: momocart-{tab}-{branch}-{date}.xlsx
// Mirrors the exact column structure and data logic from each tab's render function.

// ── STYLE HELPERS ──
const XS = {
    headerDark: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: '0F172A' } }, alignment: { horizontal: 'center' } },
    headerYellow: { font: { bold: true, color: { rgb: '1E293B' }, sz: 10 }, fill: { fgColor: { rgb: 'FDE047' } }, alignment: { horizontal: 'left' } },
    headerYellowRight: { font: { bold: true, color: { rgb: '1E293B' }, sz: 10 }, fill: { fgColor: { rgb: 'FDE047' } }, alignment: { horizontal: 'right' } },
    footerDark: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } } },
    footerGreen: { font: { bold: true, color: { rgb: '6EE7B7' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
    footerBlue:  { font: { bold: true, color: { rgb: '93C5FD' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
    footerAmber: { font: { bold: true, color: { rgb: 'FCD34D' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
    footerWhite: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
    money:       { numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    moneyBold:   { font: { bold: true }, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
    label:       { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F8FAFC' } } },
    labelRight:  { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'F8FAFC' } }, alignment: { horizontal: 'right' } },
    rowEven:     { fill: { fgColor: { rgb: 'F8FAFC' } } },
    rowOdd:      { fill: { fgColor: { rgb: 'FFFFFF' } } },
    title:       { font: { bold: true, sz: 13, color: { rgb: '0F172A' } }, alignment: { horizontal: 'center' } },
    subtitle:    { font: { sz: 10, color: { rgb: '64748B' } }, alignment: { horizontal: 'center' } },
    cyan:        { font: { bold: true, color: { rgb: '0E7490' } } },
    amber:       { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: 'D97706' } } },
    blue:        { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: '2563EB' } } },
    green:       { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: '059669' } } },
    red:         { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: 'DC2626' } } },
};

// ── CELL BUILDER ──
function cell(v, s) {
    const t = typeof v;
    const c = { v, t: t === 'number' ? 'n' : (t === 'boolean' ? 'b' : 's') };
    if (s) c.s = s;
    if (s && s.numFmt) c.z = s.numFmt;
    return c;
}
function numCell(v, s) { return cell(v == null ? 0 : v, Object.assign({ numFmt: '#,##0.00', alignment: { horizontal: 'right' } }, s || {})); }
function strCell(v, s) { return cell(v == null ? '' : String(v), s); }

// ── SHEET BUILDER from 2D array of {v, s} cells ──
function buildSheet(rows2d, colWidths) {
    const ws = {};
    let maxC = 0;
    rows2d.forEach((row, r) => {
        if (row.length > maxC) maxC = row.length;
        row.forEach((c, cc) => {
            if (c == null) return;
            const ref = XLSX.utils.encode_cell({ r, c: cc });
            ws[ref] = c;
        });
    });
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows2d.length - 1, c: maxC - 1 } });
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
}

function mergeCell(ws, r1, c1, r2, c2) {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

// ── FILENAME HELPER ──
function exportFilename(tab, branch, dateStr) {
    const b = (branch && branch !== 'all') ? branch : 'all';
    return `momocart-${tab}-${b}-${dateStr}.xlsx`;
}

// ── TITLE ROWS (2 rows: big title + subtitle) ──
function titleRows(title, subtitle, colCount) {
    return [
        [cell(title, XS.title), ...Array(colCount - 1).fill(null)],
        [cell(subtitle, XS.subtitle), ...Array(colCount - 1).fill(null)],
        Array(colCount).fill(null), // spacer
    ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 0: LOGS ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportLogs() {
    const dateStr = document.getElementById('header-date')?.value || new Date().toISOString().slice(0, 10);
    const branch = (currentUser.role === 'admin') ? activeBranch : currentUser.username;

    // Filter same as renderTable
    let logs = allLogs;
    if (currentUser.role === 'admin') {
        if (activeBranch !== 'all') {
            const bu = BRANCH_USERS[activeBranch] || [];
            logs = allLogs.filter(l => bu.includes(l.employee_username));
        }
        logs = logs.filter(l => l.created_at && l.created_at.startsWith(dateStr));
    } else {
        logs = allLogs.filter(l => l.employee_username === currentUser.username && l.created_at && l.created_at.startsWith(dateStr));
    }

    const headers = [
        currentUser.role === 'admin' ? 'Employee' : null,
        'No.', 'Name', 'Address', 'Waiver', 'O.R. #', 'Cart #', 'Valid ID',
        'Time In', 'Time Out', 'Return', 'Overtime', 'Method', 'Amount', "Add'l", 'Total'
    ].filter(Boolean);

    const isAdmin = currentUser.role === 'admin';
    const cols = isAdmin
        ? [14, 5, 26, 26, 8, 10, 8, 12, 10, 10, 10, 10, 10, 12, 12, 12]
        : [5, 26, 26, 8, 10, 8, 12, 10, 10, 10, 10, 10, 12, 12, 12];

    const [y, mo, d] = dateStr.split('-').map(Number);
    const dateLabel = new Date(y, mo - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const branchLabel = (isAdmin && activeBranch !== 'all') ? activeBranch.toUpperCase() : 'ALL BRANCHES';

    const rows2d = [
        ...titleRows(`MOMOCART • LOGBOOK EXPORT`, `${branchLabel} — ${dateLabel.toUpperCase()}`, headers.length),
    ];
    // Header row
    rows2d.push(headers.map(h => strCell(h, XS.headerDark)));

    let totalAmt = 0, totalAddl = 0, totalAll = 0;
    logs.forEach((l, i) => {
        const base = parseFloat(l.amount_cash >= 0 ? l.amount_cash : (l.amount_gcash >= 0 ? l.amount_gcash : 0)) || 0;
        const addl = parseFloat(l.additional_cash > 0 ? l.additional_cash : (l.additional_gcash > 0 ? l.additional_gcash : 0)) || 0;
        const total = base + addl;
        totalAmt += base; totalAddl += addl; totalAll += total;

        const rowStyle = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        const timeIn  = to12h((l.time_in  || '').slice(0,5)) || l.time_in  || '—';
        const timeOut = to12h((l.time_out || '').slice(0,5)) || l.time_out || '—';
        const overtime = l.overtime ? to12h(l.overtime.slice(0,5)) || l.overtime : '—';
        const ret = l.return_time ? to12h(l.return_time.slice(0,5)) || l.return_time : '—';

        const rowCells = [
            isAdmin ? strCell(l.employee_username || '', XS.cyan) : null,
            strCell(i + 1, rowStyle),
            strCell(l.name || '', rowStyle),
            strCell(l.address || '', rowStyle),
            strCell(l.waiver_signed ? 'Yes' : 'No', rowStyle),
            strCell(l.or_number || '', rowStyle),
            strCell(l.cart_number || '', rowStyle),
            strCell(l.valid_id || '', rowStyle),
            strCell(timeIn, rowStyle),
            strCell(timeOut, rowStyle),
            strCell(ret, rowStyle),
            strCell(overtime, { ...rowStyle, font: { color: { rgb: 'DC2626' } } }),
            strCell(l.payment_method || '', rowStyle),
            numCell(base, rowStyle),
            numCell(addl || 0, rowStyle),
            numCell(total, { ...rowStyle, font: { bold: true } }),
        ].filter(Boolean);

        rows2d.push(rowCells);
    });

    // Footer
    const footerLabel = isAdmin ? Array(headers.length - 3).fill(null) : Array(headers.length - 3).fill(null);
    rows2d.push([
        ...Array(headers.length - 3).fill(strCell('', XS.footerDark)),
        numCell(totalAmt, XS.footerGreen),
        numCell(totalAddl, XS.footerWhite),
        numCell(totalAll, XS.footerGreen),
    ]);

    const ws = buildSheet(rows2d, cols);
    // Merge title rows across all columns
    mergeCell(ws, 0, 0, 0, headers.length - 1);
    mergeCell(ws, 1, 0, 1, headers.length - 1);
    mergeCell(ws, 2, 0, 2, headers.length - 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Logs');
    XLSX.writeFile(wb, exportFilename('logs', branch, dateStr));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 1: DAILY SUMMARY ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportDaily() {
    const branch = (currentUser.role === 'admin') ? activeBranch : currentUser.username;
    const dateStr = selectedDailyDate || document.getElementById('header-date')?.value || new Date().toISOString().slice(0, 10);

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

    const dayLogs = logsToUse.filter(l => l.created_at && l.created_at.startsWith(dateStr));
    const dayExps = expsToUse.filter(e => e.expense_date === dateStr);

    const [y, mo, d] = dateStr.split('-').map(Number);
    const dayName = new Date(y, mo - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const branchLabel = (activeBranch !== 'all') ? activeBranch.toUpperCase() : 'ALL BRANCHES';

    // Groups by staff
    const groups = {};
    dayLogs.forEach(log => {
        const k = log.employee_username;
        if (!groups[k]) groups[k] = { staff: k, logs: [], exps: [] };
        groups[k].logs.push(log);
    });
    dayExps.forEach(exp => {
        const k = exp.employee_username;
        if (!groups[k]) groups[k] = { staff: k, logs: [], exps: [] };
        groups[k].exps.push(exp);
    });

    const headers = ['Staff', 'Day', 'Date', 'Total Sales', 'GCash', 'Cash on Hand', 'Expenses', 'Net Total', 'Expense Details'];
    const cols = [16, 12, 16, 14, 14, 14, 14, 14, 36];

    const rows2d = [
        ...titleRows('MOMOCART • DAILY SUMMARY', `${branchLabel} — ${dayName.toUpperCase()}`, headers.length),
        headers.map((h, i) => strCell(h, i >= 3 && i <= 7 ? XS.headerDark : XS.headerDark)),
    ];

    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExp = 0;
    const dn = new Date(y, mo - 1, d).toLocaleString('en-US', { weekday: 'short' });

    Object.keys(groups).sort().forEach((k, i) => {
        const { staff, logs, exps } = groups[k];
        let sales = 0, gcash = 0, cash = 0;
        logs.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cash += rt;
            else gcash += rt;
        });
        const dayExp = exps.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        const net = cash - dayExp;
        grandSales += sales; grandGCash += gcash; grandCash += cash; grandExp += dayExp;

        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        rows2d.push([
            strCell(staff, XS.cyan),
            strCell(dn, rs),
            strCell(dateStr, rs),
            numCell(sales, { ...rs, ...XS.green }),
            numCell(gcash, { ...rs, ...XS.blue }),
            numCell(cash, rs),
            numCell(dayExp, { ...rs, ...XS.amber }),
            numCell(net, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true, color: { rgb: net < 0 ? 'DC2626' : '0F172A' } } }),
            strCell(exps.map(e => e.particulars).join(', ') || '—', rs),
        ]);
    });

    rows2d.push([
        strCell('TOTAL', XS.footerDark),
        strCell('', XS.footerDark),
        strCell('', XS.footerDark),
        numCell(grandSales, XS.footerGreen),
        numCell(grandGCash, XS.footerBlue),
        numCell(grandCash, XS.footerWhite),
        numCell(grandExp, XS.footerAmber),
        numCell(grandCash - grandExp, XS.footerGreen),
        strCell('Cash on Hand − Expenses', XS.footerDark),
    ]);

    // Expenses detail section
    if (dayExps.length > 0) {
        rows2d.push(Array(headers.length).fill(null));
        rows2d.push([strCell('EXPENSES THIS DAY', { font: { bold: true, sz: 10, color: { rgb: 'D97706' } } }), ...Array(headers.length - 1).fill(null)]);
        rows2d.push(['Staff', 'Particulars', 'Amount'].map(h => strCell(h, XS.headerDark)));
        let expTotal = 0;
        dayExps.forEach((e, i) => {
            expTotal += parseFloat(e.amount || 0);
            rows2d.push([strCell(e.employee_username, XS.cyan), strCell(e.particulars, i % 2 === 0 ? XS.rowOdd : XS.rowEven), numCell(parseFloat(e.amount || 0), XS.amber)]);
        });
        rows2d.push([strCell('', XS.footerDark), strCell('TOTAL EXPENSES', XS.footerDark), numCell(expTotal, XS.footerAmber)]);
    }

    const ws = buildSheet(rows2d, cols);
    mergeCell(ws, 0, 0, 0, headers.length - 1);
    mergeCell(ws, 1, 0, 1, headers.length - 1);
    mergeCell(ws, 2, 0, 2, headers.length - 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Summary');
    XLSX.writeFile(wb, exportFilename('daily', branch, dateStr));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 2: WEEKLY SUMMARY ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportWeekly() {
    const branch = (currentUser.role === 'admin') ? activeBranch : currentUser.username;
    if (!selectedWeekMonday) { alert('Select a week first.'); return; }

    const monday = selectedWeekMonday;
    const sunday = getSundayOf(monday);
    const label  = `${fmtDate(monday)} – ${fmtDate(sunday)}`;
    const branchLabel = (activeBranch !== 'all') ? activeBranch.toUpperCase() : 'ALL BRANCHES';

    const buckets = buildWeekBuckets();
    const { logs, exps } = buckets[monday] || { logs: [], exps: [] };

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

    const salesHeaders = ['Date', 'Total Sales', 'GCash', 'Expenses', 'Cash on Hand', 'Net Total'];
    const expHeaders   = ['Date', 'Particulars', 'Amount'];

    // Sales table rows
    const salesRows = [];
    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExp = 0;

    Object.keys(dayGroups).sort().forEach((ds, i) => {
        const { logs: dl, exps: de } = dayGroups[ds];
        let sales = 0, gcash = 0, cash = 0;
        dl.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cash += rt;
            else gcash += rt;
        });
        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        const [yy, mm, dd] = ds.split('-').map(Number);
        const dn = new Date(yy, mm - 1, dd).toLocaleString('en-US', { weekday: 'long' });
        grandSales += sales; grandGCash += gcash; grandCash += cash; grandExp += dayExp;
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        salesRows.push([
            strCell(`${dn}, ${ds}`, rs),
            numCell(sales, { ...rs, ...XS.green }),
            numCell(gcash, { ...rs, ...XS.blue }),
            numCell(dayExp, { ...rs, ...XS.amber }),
            numCell(cash, rs),
            numCell(cash - dayExp, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } }),
        ]);
    });

    const expenseRows = [];
    let totalExpense = 0;
    exps.sort((a, b) => a.expense_date.localeCompare(b.expense_date)).forEach((exp, i) => {
        totalExpense += parseFloat(exp.amount || 0);
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        expenseRows.push([strCell(exp.expense_date, rs), strCell(exp.particulars, rs), numCell(parseFloat(exp.amount || 0), { ...rs, ...XS.amber })]);
    });

    // Build combined sheet (Sales | gap | Expenses side-by-side concept → stacked for simplicity)
    const rows2d = [
        ...titleRows('MOMOCART • WEEKLY SUMMARY', `${branchLabel} — ${label}`, salesHeaders.length),
        salesHeaders.map(h => strCell(h, XS.headerDark)),
        ...salesRows,
        [
            strCell('TOTAL', XS.footerDark),
            numCell(grandSales, XS.footerGreen),
            numCell(grandGCash, XS.footerBlue),
            numCell(grandExp, XS.footerAmber),
            numCell(grandCash, XS.footerWhite),
            numCell(grandCash - grandExp, XS.footerGreen),
        ],
        Array(salesHeaders.length).fill(null),
        [strCell('EXPENSES THIS WEEK', { font: { bold: true, sz: 10, color: { rgb: 'D97706' } } }), ...Array(salesHeaders.length - 1).fill(null)],
        expHeaders.map(h => strCell(h, XS.headerDark)),
        ...(expenseRows.length > 0 ? expenseRows : [[strCell('No expenses recorded.', { font: { italic: true, color: { rgb: '94A3B8' } } }), null, null]]),
        [strCell('', XS.footerDark), strCell('TOTAL WEEKLY EXPENSES', XS.footerDark), numCell(totalExpense, XS.footerAmber)],
    ];

    const ws = buildSheet(rows2d, [28, 14, 14, 14, 14, 14]);
    mergeCell(ws, 0, 0, 0, salesHeaders.length - 1);
    mergeCell(ws, 1, 0, 1, salesHeaders.length - 1);
    mergeCell(ws, 2, 0, 2, salesHeaders.length - 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Summary');
    XLSX.writeFile(wb, exportFilename('weekly', branch, monday));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 3: MONTHLY SUMMARY ──
// Exports: Sales table + Deposit table + Grand Total
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportMonthly() {
    const branch = (currentUser.role === 'admin') ? activeBranch : currentUser.username;
    if (!selectedMonth) { alert('Select a month first.'); return; }

    const [selYear, selMo] = selectedMonth.split('-').map(Number);
    const monthName = new Date(selYear, selMo - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase();
    const branchLabel = (currentUser.role === 'admin' && activeBranch !== 'all')
        ? activeBranch.toUpperCase()
        : (currentUser.displayName || currentUser.username).toUpperCase();

    const buckets = buildMonthBuckets();
    const { logs, exps } = buckets[selectedMonth] || { logs: [], exps: [] };
    const fmtAlways = v => v;

    // ── SALES TABLE ──
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

    const salesHeaders = ['Staff', 'Day', 'Date', 'Total Sales', 'G-Cash', 'Cash on Hand', 'Expenses', 'Total', 'Expenses Description'];
    const salesRows = [];
    let grandSales = 0, grandGCash = 0, grandCash = 0, grandExp = 0;

    Object.keys(dayStaffGroups).sort().forEach((key, i) => {
        const { ds, staff, logs: dl, exps: de } = dayStaffGroups[key];
        let sales = 0, gcash = 0, cash = 0;
        dl.forEach(log => {
            const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
            const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
            const rt = base + addl;
            sales += rt;
            if (log.amount_cash >= 0 && log.payment_method !== 'GCash') cash += rt;
            else gcash += rt;
        });
        const dayExp = de.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
        const ov = monthlyOverrides[key] || {};
        const dispSales = ov.sales    !== undefined ? ov.sales    : sales;
        const dispExp   = ov.expenses !== undefined ? ov.expenses : dayExp;
        const dispDesc  = ov.expDesc  !== undefined ? ov.expDesc
            : de.map(e => `${e.particulars.toUpperCase()} ${parseFloat(e.amount).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}`).join(' / ');
        const net = dispSales - dispExp;
        grandSales += dispSales; grandGCash += gcash; grandCash += cash; grandExp += dispExp;

        const [yy, mm, dd] = ds.split('-').map(Number);
        const dayName  = new Date(yy, mm - 1, dd).toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
        const dateLabel = new Date(yy, mm - 1, dd).toLocaleString('en-US', { month: 'long', day: 'numeric' }).toUpperCase() + `, ${yy}`;
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;

        salesRows.push([
            strCell(staff.toUpperCase(), XS.cyan),
            strCell(dayName, rs),
            strCell(dateLabel, rs),
            numCell(dispSales, { ...rs, ...XS.green }),
            numCell(gcash, { ...rs, ...XS.blue }),
            numCell(cash, rs),
            numCell(dispExp, { ...rs, ...XS.amber }),
            numCell(net, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true } }),
            strCell(dispDesc, rs),
        ]);
    });

    // ── DEPOSIT TABLE ──
    const monthKey = selectedMonth;
    const depRows2d = buildMonthlyDepositRows(monthKey);

    // ── GRAND TOTAL TABLE ──
    const gtRows = buildMonthlyGrandTotalRows(selectedMonth, grandSales, grandExp);

    // ── ASSEMBLE SHEET ──
    const rows2d = [
        ...titleRows(`MOMOCART • ${branchLabel} SALES ${selYear}`, `MONTH OF: ${monthName}`, salesHeaders.length),
        salesHeaders.map(h => strCell(h, XS.headerYellow)),
        ...salesRows,
        [
            strCell('', XS.footerDark), strCell('', XS.footerDark), strCell('TOTAL', XS.footerDark),
            numCell(grandSales, XS.footerGreen),
            numCell(grandGCash, XS.footerBlue),
            numCell(grandCash, XS.footerWhite),
            numCell(grandExp, XS.footerAmber),
            numCell(grandSales - grandExp, XS.footerGreen),
            strCell('', XS.footerDark),
        ],
        Array(salesHeaders.length).fill(null),
        // Deposit section
        [strCell('DEPOSIT', { font: { bold: true, sz: 11 }, alignment: { horizontal: 'center' } }), ...Array(salesHeaders.length - 1).fill(null)],
        [strCell(`MONTH OF: ${monthName}`, { font: { sz: 9, color: { rgb: '64748B' } }, alignment: { horizontal: 'center' } }), ...Array(salesHeaders.length - 1).fill(null)],
        ...depRows2d,
        Array(salesHeaders.length).fill(null),
        // Grand total section
        [strCell('GRAND TOTAL', { font: { bold: true, sz: 11 }, alignment: { horizontal: 'center' } }), ...Array(salesHeaders.length - 1).fill(null)],
        ...gtRows,
    ];

    const ws = buildSheet(rows2d, [16, 14, 22, 14, 14, 14, 14, 14, 40]);
    mergeCell(ws, 0, 0, 0, salesHeaders.length - 1);
    mergeCell(ws, 1, 0, 1, salesHeaders.length - 1);
    mergeCell(ws, 2, 0, 2, salesHeaders.length - 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Summary');
    XLSX.writeFile(wb, exportFilename('monthly', branch, selectedMonth));
}

function buildMonthlyDepositRows(monthKey) {
    const depHeaders = ['Date of Sales', 'Deposit Date', 'Total Cash Sales Covered', 'Deposit Amount (Receipt)', 'Discrepancy', 'Status', 'Description', 'Notes'];
    const rows = [depHeaders.map(h => strCell(h, XS.headerYellow))];

    // Build allRows same as renderMonthlyDepositTable logic
    const allRows = [];

    // DB-backed deposits for this month
    const [selYear, selMo] = monthKey.split('-').map(Number);
    const depBranch = (currentUser.role === 'admin' && activeBranch !== 'all') ? activeBranch : null;
    let depsToUse = allDeposits;
    if (depBranch) {
        const bu = BRANCH_USERS[depBranch] || [];
        depsToUse = allDeposits.filter(d => bu.includes(d.employee_username) || d.employee_username === 'admin');
    } else if (currentUser.role !== 'admin') {
        depsToUse = allDeposits.filter(d => d.employee_username === currentUser.username);
    }

    const buckets = buildMonthBuckets();
    const { logs } = buckets[monthKey] || { logs: [] };
    const dayGroups = {};
    logs.forEach(log => {
        const ds = log.created_at.split(' ')[0];
        if (!dayGroups[ds]) dayGroups[ds] = 0;
        const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
        const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
        if (log.amount_cash >= 0 && log.payment_method !== 'GCash') dayGroups[ds] += (base + addl);
    });

    // Monthly-grouped deposits from DB
    depsToUse.filter(d => {
        const ds = d.deposit_date || '';
        return ds.slice(0, 7) === monthKey;
    }).forEach(dep => {
        const overrideKey = `dep-${dep.id}`;
        const ov = (window._depositOverrides && window._depositOverrides[overrideKey]) || {};
        allRows.push({
            fromDB: true,
            dateOfSales: dep.deposit_date || '',
            depositDate: dep.deposit_date || '',
            covered: dayGroups[dep.deposit_date] || 0,
            receipt: parseFloat(dep.amount || 0),
            description: dep.description || '',
            status: ov.status || 'Balanced',
            notes: ov.notes || '',
        });
    });

    // Manual rows
    const manual = (depositRowsByMonth && depositRowsByMonth[monthKey]) ? depositRowsByMonth[monthKey] : [];
    manual.forEach(r => allRows.push({ ...r, fromDB: false }));

    let totalCovered = 0, totalReceipt = 0;
    allRows.forEach((row, i) => {
        const covered = parseFloat(row.covered) || 0;
        const receipt = parseFloat(row.receipt) || 0;
        const disc = receipt - covered;
        totalCovered += covered; totalReceipt += receipt;
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        rows.push([
            strCell(row.dateOfSales || '—', rs),
            strCell(row.depositDate || '—', rs),
            numCell(covered, { ...rs, ...XS.green }),
            numCell(receipt, { ...rs, ...XS.blue }),
            numCell(Math.abs(disc), disc < -0.01 ? { ...rs, numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: 'DC2626' } } } : { ...rs, ...XS.amber }),
            strCell(row.status || 'Balanced', rs),
            strCell(row.description || '—', rs),
            strCell(row.notes || '', rs),
        ]);
    });

    if (allRows.length === 0) {
        rows.push([strCell('No deposit records for this month.', { font: { italic: true, color: { rgb: '94A3B8' } } }), ...Array(7).fill(null)]);
    }

    rows.push([
        strCell('', XS.footerDark), strCell('TOTAL', XS.footerDark),
        numCell(totalCovered, XS.footerGreen),
        numCell(totalReceipt, XS.footerBlue),
        numCell(Math.abs(totalReceipt - totalCovered), XS.footerAmber),
        strCell('', XS.footerDark), strCell('', XS.footerDark), strCell('', XS.footerDark),
    ]);

    return rows;
}

function buildMonthlyGrandTotalRows(monthKey, totalSales, totalExp) {
    const ov = grandTotalOverrides[monthKey] || {};
    const salary15 = ov.salary15 || 0;
    const salary30 = ov.salary30 || 0;
    const soa      = ov.soa      || 0;
    const waiver   = ov.waiver   || 0;
    const orFee    = ov.or       || 0;
    const vat      = ov.vat      || 0;
    const totalDeductions = salary15 + salary30 + soa + waiver + orFee + vat;
    const grandNet = totalSales - totalExp - totalDeductions;

    const labelS = { font: { bold: true, sz: 10 } };
    const rows = [
        [strCell('Item', { ...XS.headerDark, alignment: { horizontal: 'left' } }), strCell('Amount', { ...XS.headerDark, alignment: { horizontal: 'right' } })],
        [strCell('Total Sales (Month)', labelS), numCell(totalSales, XS.green)],
        [strCell('Total Expenses', labelS), numCell(totalExp, XS.amber)],
        [strCell('Salary (15th)', labelS), numCell(salary15, XS.amber)],
        [strCell('Salary (30th)', labelS), numCell(salary30, XS.amber)],
        [strCell('SOA', labelS), numCell(soa, XS.amber)],
        [strCell('Waiver', labelS), numCell(waiver, XS.amber)],
        [strCell('O.R.', labelS), numCell(orFee, XS.amber)],
        [strCell('VAT', labelS), numCell(vat, XS.amber)],
        [strCell('NET (Grand Total)', XS.footerDark), numCell(grandNet, grandNet < 0 ? XS.footerAmber : XS.footerGreen)],
    ];
    return rows;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 4: YEARLY SUMMARY ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportYearly() {
    const branch = 'all'; // yearly is always all-branch
    if (!selectedYear) { alert('Select a year first.'); return; }

    const yr = selectedYear;
    const grossSales = {}, expenses = {}, deposit = {};
    YEARLY_BRANCHES.forEach(b => {
        grossSales[b.key] = new Array(12).fill(0);
        expenses[b.key]   = new Array(12).fill(0);
        deposit[b.key]    = new Array(12).fill(0);
    });

    allLogs.forEach(log => {
        if (!log.created_at) return;
        if (parseInt(log.created_at.slice(0, 4)) !== yr) return;
        const mi = parseInt(log.created_at.slice(5, 7)) - 1;
        const b = YEARLY_BRANCHES.find(bb => bb.users.includes(log.employee_username));
        if (!b) return;
        const base = parseFloat(log.amount_cash > 0 ? log.amount_cash : (log.amount_gcash > 0 ? log.amount_gcash : 0)) || 0;
        const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
        const total = base + addl;
        grossSales[b.key][mi] += total;
        if (log.amount_cash > 0 && log.payment_method !== 'GCash') deposit[b.key][mi] += total;
    });
    allExpenses.forEach(exp => {
        if (!exp.expense_date) return;
        if (parseInt(exp.expense_date.slice(0, 4)) !== yr) return;
        const mi = parseInt(exp.expense_date.slice(5, 7)) - 1;
        const b = YEARLY_BRANCHES.find(bb => bb.users.includes(exp.employee_username));
        if (!b) return;
        expenses[b.key][mi] += parseFloat(exp.amount || 0);
    });

    const branchLabels = YEARLY_BRANCHES.map(b => b.label);
    const headers = ['Month', ...branchLabels, 'Total'];

    function buildYearTable(label, getVal, footColor) {
        const rows = [
            [strCell(label, { font: { bold: true, sz: 11 } }), ...Array(headers.length - 1).fill(null)],
            headers.map(h => strCell(h, XS.headerDark)),
        ];
        const colTotals = new Array(YEARLY_BRANCHES.length).fill(0);
        let grandTotal = 0;
        MONTHS_LABELS.forEach((mon, mi) => {
            let rowTotal = 0;
            const cells = YEARLY_BRANCHES.map((b, bi) => {
                const v = getVal(b.key, mi);
                colTotals[bi] += v;
                rowTotal += v;
                return numCell(v, v > 0 ? XS.money : { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { color: { rgb: 'CBD5E1' } } });
            });
            grandTotal += rowTotal;
            rows.push([strCell(mon, { font: { bold: true } }), ...cells, numCell(rowTotal, XS.moneyBold)]);
        });
        rows.push([
            strCell('TOTAL', XS.footerDark),
            ...colTotals.map(v => numCell(v, footColor)),
            numCell(grandTotal, XS.footerGreen),
        ]);
        return rows;
    }

    const grossRows = buildYearTable('GROSS SALES',  (k, mi) => grossSales[k][mi],              XS.footerGreen);
    const expRows   = buildYearTable('EXPENSES',     (k, mi) => expenses[k][mi],                XS.footerAmber);
    const netRows   = buildYearTable('NET SALES',    (k, mi) => grossSales[k][mi] - expenses[k][mi], XS.footerGreen);
    const depRows   = buildYearTable('CASH DEPOSIT', (k, mi) => deposit[k][mi],                 XS.footerBlue);

    const spacer = [Array(headers.length).fill(null)];

    const rows2d = [
        ...titleRows(`MOMOCART • YEARLY SUMMARY ${yr}`, `ALL BRANCHES — ${yr}`, headers.length),
        ...grossRows, ...spacer,
        ...expRows,   ...spacer,
        ...netRows,   ...spacer,
        ...depRows,
    ];

    const ws = buildSheet(rows2d, [16, ...YEARLY_BRANCHES.map(() => 14), 14]);
    mergeCell(ws, 0, 0, 0, headers.length - 1);
    mergeCell(ws, 1, 0, 1, headers.length - 1);
    mergeCell(ws, 2, 0, 2, headers.length - 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Yearly Summary');
    XLSX.writeFile(wb, exportFilename('yearly', 'all', String(yr)));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 5: EXPENSES (employee) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportExpenses() {
    const dateStr = document.getElementById('header-date')?.value || new Date().toISOString().slice(0, 10);
    const branch = currentUser.username;
    const exps = allExpenses.filter(e => e.employee_username === currentUser.username && e.expense_date === dateStr);

    const [y, mo, d] = dateStr.split('-').map(Number);
    const dateLabel = new Date(y, mo - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const headers = ['Date', 'Particulars', 'Amount'];
    const rows2d = [
        ...titleRows('MOMOCART • DAILY EXPENSES', `${branch.toUpperCase()} — ${dateLabel.toUpperCase()}`, headers.length),
        headers.map(h => strCell(h, XS.headerDark)),
    ];

    let total = 0;
    exps.forEach((e, i) => {
        total += parseFloat(e.amount || 0);
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        rows2d.push([strCell(e.expense_date, rs), strCell(e.particulars, rs), numCell(parseFloat(e.amount || 0), { ...rs, ...XS.amber })]);
    });
    if (exps.length === 0) rows2d.push([strCell('No expenses recorded today.', { font: { italic: true, color: { rgb: '94A3B8' } } }), null, null]);
    rows2d.push([strCell('', XS.footerDark), strCell('TOTAL TODAY', XS.footerDark), numCell(total, XS.footerAmber)]);

    const ws = buildSheet(rows2d, [16, 40, 16]);
    mergeCell(ws, 0, 0, 0, 2);
    mergeCell(ws, 1, 0, 1, 2);
    mergeCell(ws, 2, 0, 2, 2);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, exportFilename('expenses', branch, dateStr));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── TAB 6: DEPOSIT (employee) ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportDeposit() {
    const dateStr = document.getElementById('header-date')?.value || new Date().toISOString().slice(0, 10);
    const branch = currentUser.username;
    const deps = allDeposits.filter(d => d.employee_username === currentUser.username && d.deposit_date === dateStr);

    const [y, mo, d] = dateStr.split('-').map(Number);
    const dateLabel = new Date(y, mo - 1, d).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const headers = ['Date', 'Time', 'Description', 'Amount'];
    const rows2d = [
        ...titleRows('MOMOCART • DAILY DEPOSITS', `${branch.toUpperCase()} — ${dateLabel.toUpperCase()}`, headers.length),
        headers.map(h => strCell(h, XS.headerDark)),
    ];

    let total = 0;
    deps.forEach((dep, i) => {
        total += parseFloat(dep.amount || 0);
        const timeRaw = dep.deposit_time ? dep.deposit_time.slice(0, 5) : '--:--';
        const time12 = to12h(timeRaw) || timeRaw;
        const rs = i % 2 === 0 ? XS.rowOdd : XS.rowEven;
        rows2d.push([strCell(dep.deposit_date, rs), strCell(time12, rs), strCell(dep.description || '—', rs), numCell(parseFloat(dep.amount || 0), { ...rs, ...XS.blue })]);
    });
    if (deps.length === 0) rows2d.push([strCell('No deposits recorded today.', { font: { italic: true, color: { rgb: '94A3B8' } } }), null, null, null]);
    rows2d.push([strCell('', XS.footerDark), strCell('', XS.footerDark), strCell('TOTAL TODAY', XS.footerDark), numCell(total, XS.footerBlue)]);

    const ws = buildSheet(rows2d, [16, 14, 36, 16]);
    mergeCell(ws, 0, 0, 0, 3);
    mergeCell(ws, 1, 0, 1, 3);
    mergeCell(ws, 2, 0, 2, 3);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deposits');
    XLSX.writeFile(wb, exportFilename('deposit', branch, dateStr));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── INVOICE EXPORT ──
// Exports the currently open invoice as a styled XLSX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportInvoice(logId) {
    // Find the log entry
    const log = allLogs.find(l => l.id === logId);
    if (!log) { alert('Invoice data not found.'); return; }

    const base = parseFloat(log.amount_cash >= 0 ? log.amount_cash : (log.amount_gcash >= 0 ? log.amount_gcash : 0)) || 0;
    const addl = parseFloat(log.additional_cash > 0 ? log.additional_cash : (log.additional_gcash > 0 ? log.additional_gcash : 0)) || 0;
    const totalSales = base + addl;
    const lessVat = totalSales * 12 / 112;
    const netOfVat = totalSales - lessVat;

    const isDiscounted = ['Senior', 'PWD'].includes(log.valid_id);
    let discountAmt = 0;
    if (isDiscounted && log.time_in && log.time_out && log.time_out !== '00:00') {
        const [ih, im] = (log.time_in || '00:00').split(':').map(Number);
        const [oh, om] = (log.time_out || '00:00').split(':').map(Number);
        const diff = (oh * 60 + om) - (ih * 60 + im);
        let durKey = diff <= 15 ? '15kiddie' : diff <= 30 ? '30' : diff <= 60 ? '60' : diff <= 120 ? '120' : diff <= 180 ? '180' : 'unlimited';
        const regularPrice = PRICES_REGULAR[durKey] || totalSales;
        discountAmt = Math.max(0, regularPrice - totalSales);
    }

    const dateStr = log.created_at ? log.created_at.split(' ')[0] : new Date().toISOString().slice(0, 10);
    const timeIn  = to12h((log.time_in || '').slice(0, 5)) || log.time_in || '—';
    const timeOut = to12h((log.time_out || '').slice(0, 5)) || log.time_out || '—';

    const titleStyle = { font: { bold: true, sz: 14, color: { rgb: '0F172A' } }, alignment: { horizontal: 'left' } };
    const subStyle   = { font: { sz: 10, color: { rgb: '64748B' } } };
    const kStyle     = { font: { bold: true, sz: 10, color: { rgb: '64748B' } }, alignment: { horizontal: 'right' } };
    const vStyle     = { font: { sz: 10 } };
    const divider    = { fill: { fgColor: { rgb: 'E2E8F0' } } };

    const rows2d = [
        [strCell('MOMO-CART • Official Receipt', titleStyle), null, null],
        [strCell(`Invoice — printed ${new Date().toLocaleString('en-PH')}`, subStyle), null, null],
        [strCell('', divider), strCell('', divider), strCell('', divider)],
        [strCell('Customer', kStyle), strCell(log.name || '', { font: { bold: true, sz: 11 } }), null],
        [strCell('Address', kStyle), strCell(log.address || '—', vStyle), null],
        [strCell('Valid ID', kStyle), strCell(log.valid_id || '—', vStyle), null],
        [strCell('O.R. #', kStyle), strCell(log.or_number || '—', vStyle), null],
        [strCell('Cart #', kStyle), strCell(log.cart_number || '—', vStyle), null],
        [strCell('Time In', kStyle), strCell(timeIn, vStyle), null],
        [strCell('Time Out', kStyle), strCell(timeOut, vStyle), null],
        [strCell('Payment Method', kStyle), strCell(log.payment_method || '—', vStyle), null],
        [strCell('Date', kStyle), strCell(dateStr, vStyle), null],
        [strCell('', divider), strCell('', divider), strCell('', divider)],
        [strCell('Item', { ...XS.headerDark, alignment: { horizontal: 'left' } }), null, strCell('Amount', XS.headerDark)],
        [strCell('Total Sales (VAT Incl.)', vStyle), null, numCell(totalSales, XS.money)],
        [strCell('Less VAT (12%)', vStyle), null, numCell(lessVat, XS.money)],
        [strCell('Amount Net of VAT', vStyle), null, numCell(netOfVat, XS.money)],
        ...(discountAmt > 0 ? [[strCell('Discount Applied', vStyle), null, numCell(discountAmt, XS.amber)]] : []),
        [strCell('', divider), strCell('', divider), strCell('', divider)],
        [strCell('TOTAL AMOUNT DUE', { font: { bold: true, sz: 11 } }), null, numCell(totalSales, { numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { bold: true, sz: 12, color: { rgb: '059669' } } })],
    ];

    const ws = buildSheet(rows2d, [26, 28, 18]);
    // Merge title and subtitle
    mergeCell(ws, 0, 0, 0, 2);
    mergeCell(ws, 1, 0, 1, 2);
    mergeCell(ws, 13, 0, 13, 1); // header item col
    mergeCell(ws, 14, 0, 14, 1);
    mergeCell(ws, 15, 0, 15, 1);
    mergeCell(ws, 16, 0, 16, 1);
    if (discountAmt > 0) mergeCell(ws, 17, 0, 17, 1);
    mergeCell(ws, rows2d.length - 1, 0, rows2d.length - 1, 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
    XLSX.writeFile(wb, `momocart-invoice-${log.or_number || log.id}-${dateStr}.xlsx`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── MAIN DISPATCHER ──
// Replaces the old exportToCSV() in logs.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function exportToCSV() {
    function doDispatch() {
        switch (currentTab) {
            case 0: exportLogs();     break;
            case 1: exportDaily();    break;
            case 2: exportWeekly();   break;
            case 3: exportMonthly();  break;
            case 4: exportYearly();   break;
            case 5: exportExpenses(); break;
            case 6: exportDeposit();  break;
            default: exportLogs();
        }
    }

    if (typeof XLSX !== 'undefined') {
        doDispatch();
    } else {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = doDispatch;
        s.onerror = () => alert('❌ Failed to load Excel library. Check your internet connection.');
        document.head.appendChild(s);
    }
}