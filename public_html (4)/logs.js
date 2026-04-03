// ── LOGS TABLE, DASHBOARD, DELETE, EXPORT, TAB SYSTEM ──

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
    const invoiceBtn = e.target.closest('.invoice-btn');
    if (invoiceBtn) {
        e.stopPropagation();
        const id = parseInt(invoiceBtn.dataset.invoiceId);
        if (id) openInvoiceModal(id);
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
        // Show all action buttons for admin
        const expBtn = document.getElementById('expenses-btn');
        if (expBtn) expBtn.classList.remove('hidden');
        const recBtn = document.getElementById('new-entry-btn');
        if (recBtn) recBtn.classList.remove('hidden');

        // Show the entire action buttons wrapper
        const actionWrap = document.getElementById('action-buttons-wrap');
        if (actionWrap) {
            actionWrap.classList.remove('hidden');
            actionWrap.classList.add('flex');
        }

        // Show the Floating Action Button (FAB) for mobile
        const fabBtn = document.getElementById('fab-btn');
        if (fabBtn) fabBtn.classList.remove('hidden');

        // Show branch and period header elements
        const branchEl = document.getElementById('header-branch-wrap');
        if (branchEl) branchEl.classList.remove('hidden');

        const periodHeader = document.getElementById('period-header-wrap');
        if (periodHeader) periodHeader.classList.remove('hidden');

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
        // Show deposit button for admin
        const depBtn = document.getElementById('deposit-btn');
        if (depBtn) depBtn.classList.remove('hidden');

        buildAdminToolbar();

        // Show Invoice button (admin only)
        const invBtn = document.getElementById('invoice-search-btn');
        if (invBtn) { invBtn.classList.remove('hidden'); invBtn.classList.add('flex'); }

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
                    <button data-invoice-id="${log.id}"
                        class="action-btn invoice-btn bg-violet-100 text-violet-600 hover:bg-violet-500 hover:text-white transition-colors">
                        INVOICE
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
            <td class="px-4 py-4 text-center">${log.id_photo
                ? `<button onclick="viewIdPhoto('${log.id}')" class="action-btn bg-indigo-100 text-indigo-600 hover:bg-indigo-500 hover:text-white transition-colors">VIEW</button>`
                : '<span class="text-slate-300 text-[10px]">—</span>'
            }</td>
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

function exportToCSV() {
    function doExport() {
        const dateStr = document.getElementById('header-date')?.value || new Date().toISOString().slice(0,10);

        const rows = allLogs.map((l, i) => {
            const base = parseFloat(l.amount_cash >= 0 ? l.amount_cash : (l.amount_gcash >= 0 ? l.amount_gcash : 0)) || 0;
            const addl = parseFloat(l.additional_cash > 0 ? l.additional_cash : (l.additional_gcash > 0 ? l.additional_gcash : 0)) || 0;
            const totalSales = base + addl;

            // VAT-inclusive breakdown (VAT = total × 12/112)
            const lessVat   = totalSales * 12 / 112;
            const netOfVat  = totalSales - lessVat;

            // Discount: compare to regular price for same duration
            const isDiscounted = ['Senior', 'PWD'].includes(l.valid_id);
            let discountAmt = 0;
            if (isDiscounted && l.time_in && l.time_out && l.time_out !== '00:00') {
                const [ih, im] = (l.time_in || '00:00').split(':').map(Number);
                const [oh, om] = (l.time_out || '00:00').split(':').map(Number);
                const diff = (oh * 60 + om) - (ih * 60 + im);
                let durKey = '';
                if (diff <= 15)       durKey = '15kiddie';
                else if (diff <= 30)  durKey = '30';
                else if (diff <= 60)  durKey = '60';
                else if (diff <= 120) durKey = '120';
                else if (diff <= 180) durKey = '180';
                else                  durKey = 'unlimited';
                const regularPrice = PRICES_REGULAR[durKey] || totalSales;
                discountAmt = Math.max(0, regularPrice - totalSales);
            }

            return {
                'No':                   i + 1,
                'Name':                 l.name || '',
                'Address':              l.address || '',
                'O.R. #':               l.or_number || '',
                'Valid ID':             l.valid_id || '',
                'Total Sales (VAT Incl.)': totalSales,
                'Less VAT (12%)':       lessVat,
                'Discounted':           discountAmt,
                'Amount Net of VAT':    netOfVat,
                'Total Amount Due':     totalSales,
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);

        // Column widths
        ws['!cols'] = [
            { wch: 5  },   // No
            { wch: 28 },   // Name
            { wch: 30 },   // Address
            { wch: 12 },   // O.R. #
            { wch: 14 },   // Valid ID
            { wch: 22 },   // Total Sales (VAT Incl.)
            { wch: 16 },   // Less VAT
            { wch: 14 },   // Discounted
            { wch: 20 },   // Net of VAT
            { wch: 18 },   // Total Amount Due
        ];

        // Apply currency format to all money columns (cols 5–9, 0-indexed)
        const moneyCols = [5, 6, 7, 8, 9];
        rows.forEach((_, ri) => {
            moneyCols.forEach(ci => {
                const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
                if (ws[cellRef]) ws[cellRef].z = '#,##0.00';
            });
        });

        // Style header row bold (requires write with styles — use basic approach)
        const headerRange = XLSX.utils.decode_range(ws['!ref']);
        for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
            const hCell = XLSX.utils.encode_cell({ r: 0, c });
            if (ws[hCell]) {
                ws[hCell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FDE047' } } };
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rental Logs');
        XLSX.writeFile(wb, `momocart-logs-${dateStr}.xlsx`);
    }

    if (typeof XLSX !== 'undefined') {
        doExport();
    } else {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = doExport;
        s.onerror = () => alert('Failed to load Excel library. Check your internet connection.');
        document.head.appendChild(s);
    }
}

// ── TAB SYSTEM ──

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

function renderCurrentTab() {
    if (currentTab === 0) renderTable();
    else if (currentTab === 1) renderDailySummary();
    else if (currentTab === 2) renderWeeklySummary();
    else if (currentTab === 3) renderMonthlySummary();
    else if (currentTab === 4) renderYearlySummary();
    else if (currentTab === 5) renderExpensesTab();
    else if (currentTab === 6) renderDepositTab();
}