// ── EXPENSES, DEPOSITS, NOTIFICATIONS, MEDIA/CAMERA ──

function renderExpensesTab() {
    // Use header date if set, otherwise real today
    const headerDate = document.getElementById('header-date')?.value;
    const today = new Date();
    const todayStr = headerDate || (today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0'));

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
        const safeParticulars = (exp.particulars || '').replace(/'/g, "\\'");
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${exp.expense_date}</td>
                <td class="px-4 py-3">${exp.particulars}</td>
                <td class="px-4 py-3 text-right font-mono text-amber-600 whitespace-nowrap">₱${parseFloat(exp.amount).toFixed(2)}</td>
                <td class="px-4 py-3 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openEditExpense(${exp.id})"
                                class="action-btn bg-amber-100 text-amber-700 hover:bg-amber-500 hover:text-white transition-colors">
                            EDIT
                        </button>
                        <button onclick="openDeleteExpDep('expense', ${exp.id}, '${safeParticulars}')"
                                class="action-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                            DELETE
                        </button>
                    </div>
                </td>
            </tr>`;
    });
    totalEl.textContent = `₱${total.toFixed(2)}`;
}

function renderDepositTab() {
    // Use header date if set, otherwise real today
    const headerDate = document.getElementById('header-date')?.value;
    const today = new Date();
    const todayStr = headerDate || (today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0'));

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
        const receiptThumb = dep.receipt_photo
            ? `<button onclick="openReceiptLightbox('${dep.receipt_photo.replace(/'/g,"\\'")}', event)"
                       class="inline-block w-12 h-12 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 shadow-sm hover:shadow-md transition-all active:scale-95">
                   <img src="${dep.receipt_photo}" alt="Receipt" class="w-full h-full object-cover">
               </button>`
            : '<span class="text-slate-300 text-[10px]">—</span>';
        const safeDesc = (dep.description || 'Deposit').replace(/'/g, "\\'");
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${dep.deposit_date}</td>
                <td class="px-4 py-3 font-mono text-blue-600 whitespace-nowrap">${time12}</td>
                <td class="px-4 py-3">${dep.description || '—'}</td>
                <td class="px-4 py-3 text-center">${receiptThumb}</td>
                <td class="px-4 py-3 text-right font-mono text-blue-700 whitespace-nowrap">₱${parseFloat(dep.amount).toFixed(2)}</td>
                <td class="px-4 py-3 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openEditDeposit(${dep.id})"
                                class="action-btn bg-blue-100 text-blue-700 hover:bg-blue-500 hover:text-white transition-colors">
                            EDIT
                        </button>
                        <button onclick="openDeleteExpDep('deposit', ${dep.id}, '${safeDesc}')"
                                class="action-btn bg-red-100 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                            DELETE
                        </button>
                    </div>
                </td>
            </tr>`;
    });
    totalEl.textContent = `₱${total.toFixed(2)}`;
}

let _pendingReceiptBase64 = null;

function showDepositModal() {
    document.getElementById('dep-amount').value = '';
    document.getElementById('dep-description').value = '';
    // Seed the record date from the header date selector
    const headerDate = document.getElementById('header-date')?.value;
    const today = new Date();
    const localDate = headerDate || (today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0'));
    const depDateEl = document.getElementById('dep-record-date');
    if (depDateEl) depDateEl.value = localDate;
    // Reset photo state
    _pendingReceiptBase64 = null;
    document.getElementById('dep-receipt-base64').value = '';
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
    closeDepReceiptCamera();
}

// Called when user selects a receipt image via file picker
function onDepositReceiptSelected(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('❌ Image is too large. Please use a photo under 5MB.');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        setDepReceiptPreview(e.target.result);
    };
    reader.readAsDataURL(file);
}

function _depReceiptShowPlaceholder() {
    const placeholder = document.getElementById('dep-receipt-placeholder');
    const preview     = document.getElementById('dep-receipt-preview-wrap');
    if (placeholder) placeholder.classList.remove('hidden');
    if (preview)     preview.classList.add('hidden');
}

function setDepReceiptPreview(src) {
    _pendingReceiptBase64 = src;
    document.getElementById('dep-receipt-base64').value = src;
    const placeholder = document.getElementById('dep-receipt-placeholder');
    const preview     = document.getElementById('dep-receipt-preview-wrap');
    const img         = document.getElementById('dep-receipt-img');
    if (placeholder) placeholder.classList.add('hidden');
    if (img)         img.src = src;
    if (preview)     preview.classList.remove('hidden');
}

function removeDepositReceipt() {
    _pendingReceiptBase64 = null;
    document.getElementById('dep-receipt-base64').value = '';
    const fileInput = document.getElementById('dep-receipt-file');
    if (fileInput) fileInput.value = '';
    _depReceiptShowPlaceholder();
}

async function submitDeposit() {
    const amount      = parseFloat(document.getElementById('dep-amount').value) || 0;
    const description = document.getElementById('dep-description').value.trim();
    const receiptPhoto = document.getElementById('dep-receipt-base64').value || null;
    // Use the deposit record date field (pre-seeded from header date)
    const depDateEl   = document.getElementById('dep-record-date');
    const today       = new Date();
    const localToday  = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    const record_date = (depDateEl && depDateEl.value) ? depDateEl.value : localToday;

    if (amount <= 0) { alert('Please enter a valid amount'); return; }
    if (!description) { alert('Please enter a description'); return; }

    const saveBtn = document.getElementById('dep-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    // Admin: pass target_branch so the deposit is attributed to the correct branch
    const payload = { amount, description, receipt_photo: receiptPhoto, record_date };
    if (currentUser && currentUser.role === 'admin') {
        const branchSel = document.getElementById('dep-target-branch');
        if (branchSel && branchSel.value) payload.target_branch = branchSel.value;
    }

    try {
        const res = await apiFetch('api.php?action=saveDeposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.success) {
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
    // Use the header date selector if set; otherwise fall back to real today
    const headerDate = document.getElementById('header-date')?.value;
    const today = new Date();
    const localDate = headerDate || (today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0'));
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
    // Admin: pass target_branch so the expense is attributed to the correct branch
    if (currentUser && currentUser.role === 'admin') {
        const branchSel = document.getElementById('exp-target-branch');
        if (branchSel && branchSel.value) expense.target_branch = branchSel.value;
    }

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
            description: d.description || '',
            receipt_photo: d.receipt_photo || ''
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

// ── ADD MANUAL DEPOSIT ROW (inline in monthly table) ──
function addManualDepositRow() {
    if (!selectedMonth) { alert('Select a month first.'); return; }
    if (!depositRowsByMonth[selectedMonth]) depositRowsByMonth[selectedMonth] = [];

    const defaultDate = selectedMonth + '-01';
    depositRowsByMonth[selectedMonth].push({
        dateOfSales: defaultDate,
        depositDate: defaultDate,
        covered: 0,
        receipt: 0,
        description: '',
        receipt_photo: ''
    });
    renderMonthlyTable();

    // Scroll to bottom of deposit table so user sees the new row
    setTimeout(() => {
        const body = document.getElementById('monthly-deposit-body');
        if (body) {
            const lastRow = body.lastElementChild;
            if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function removeDepositRow(manualIdx, monthKey) {
    if (!depositRowsByMonth[monthKey]) return;
    depositRowsByMonth[monthKey].splice(manualIdx, 1);
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

// ── ID PHOTO FUNCTIONS ──

let _idCameraStream = null;

function openIdCamera() {
    const overlay = document.getElementById('id-camera-overlay');
    overlay.classList.remove('hidden');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            _idCameraStream = stream;
            const video = document.getElementById('id-camera-video');
            video.srcObject = stream;
        })
        .catch(err => {
            overlay.classList.add('hidden');
            alert('Camera access denied or not available. Please use the Upload button instead.');
        });
}

function closeIdCamera() {
    if (_idCameraStream) {
        _idCameraStream.getTracks().forEach(t => t.stop());
        _idCameraStream = null;
    }
    document.getElementById('id-camera-overlay').classList.add('hidden');
}

function captureIdPhoto() {
    const video  = document.getElementById('id-camera-video');
    const canvas = document.getElementById('id-camera-canvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    setIdPhotoPreview(dataUrl);
    closeIdCamera();
}

function handleIdPhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => setIdPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
}

function setIdPhotoPreview(dataUrl) {
    document.getElementById('form-id-photo').value = dataUrl;
    document.getElementById('id-photo-preview').src = dataUrl;
    document.getElementById('id-photo-preview-wrap').classList.remove('hidden');
    document.getElementById('id-photo-placeholder').classList.add('hidden');
}

function clearIdPhoto() {
    document.getElementById('form-id-photo').value = '';
    document.getElementById('id-photo-preview').src = '';
    document.getElementById('id-photo-preview-wrap').classList.add('hidden');
    document.getElementById('id-photo-placeholder').classList.remove('hidden');
    const fi = document.getElementById('id-photo-file');
    if (fi) fi.value = '';
}

// Open ID photo lightbox from logs table
function viewIdPhoto(logId) {
    const log = allLogs.find(l => String(l.id) === String(logId));
    if (!log || !log.id_photo) return;
    const lb  = document.getElementById('receipt-lightbox');
    const img = document.getElementById('receipt-lightbox-img');
    img.src = log.id_photo;
    lb.classList.remove('hidden');
}

// ── DEPOSIT RECEIPT CAMERA FUNCTIONS ──

let _depCameraStream = null;

function openDepReceiptCamera() {
    const overlay = document.getElementById('dep-camera-overlay');
    overlay.classList.remove('hidden');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            _depCameraStream = stream;
            const video = document.getElementById('dep-camera-video');
            video.srcObject = stream;
        })
        .catch(() => {
            overlay.classList.add('hidden');
            alert('Camera access denied or unavailable. Please use the Upload button instead.');
        });
}

function closeDepReceiptCamera() {
    if (_depCameraStream) {
        _depCameraStream.getTracks().forEach(t => t.stop());
        _depCameraStream = null;
    }
    const overlay = document.getElementById('dep-camera-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function captureDepReceiptPhoto() {
    const video  = document.getElementById('dep-camera-video');
    const canvas = document.getElementById('dep-camera-canvas');
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    setDepReceiptPreview(dataUrl);
    closeDepReceiptCamera();
}


function updateManualDepRow(monthKey, manualIdx, field, value) {
    const rows = depositRowsByMonth[monthKey];
    if (!rows) return;
    const manualRows = rows; // depositRowsByMonth only stores manual rows
    if (manualRows[manualIdx]) {
        manualRows[manualIdx][field] = value;
        depositRowsByMonth[monthKey] = manualRows; // trigger Proxy save
    }
}

function deleteManualDepRow(monthKey, manualIdx) {
    const rows = depositRowsByMonth[monthKey];
    if (!rows || rows[manualIdx] === undefined) return;
    rows.splice(manualIdx, 1);
    depositRowsByMonth[monthKey] = rows.length ? rows : [];
    renderMonthlyTable();
}
// ── EXPENSE / DEPOSIT EDIT & DELETE FUNCTIONS ──

let _pendingDeleteType = null;
let _pendingDeleteId   = null;

function openEditExpense(id) {
    const exp = allExpenses.find(e => String(e.id) === String(id));
    if (!exp) { alert('Expense not found.'); return; }
    document.getElementById('edit-expense-id').value          = exp.id;
    document.getElementById('edit-expense-particulars').value = exp.particulars || '';
    document.getElementById('edit-expense-amount').value      = parseFloat(exp.amount || 0).toFixed(2);
    document.getElementById('edit-expense-modal').showModal();
}

async function submitEditExpense() {
    const id          = document.getElementById('edit-expense-id').value;
    const particulars = document.getElementById('edit-expense-particulars').value.trim();
    const amount      = parseFloat(document.getElementById('edit-expense-amount').value) || 0;

    if (!particulars) { alert('Please enter a description.'); return; }
    if (amount <= 0)  { alert('Please enter a valid amount.'); return; }

    const btn = document.getElementById('edit-expense-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const res = await apiFetch('api.php?action=editExpense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, particulars, amount })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('edit-expense-modal').close();
            await loadLogs();
        } else {
            alert('❌ Failed to update: ' + (result.message || 'Unknown error'));
        }
    } catch(e) {
        alert('❌ Network error. Please try again.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
}

function openEditDeposit(id) {
    const dep = allDeposits.find(d => String(d.id) === String(id));
    if (!dep) { alert('Deposit not found.'); return; }
    document.getElementById('edit-deposit-id').value          = dep.id;
    document.getElementById('edit-deposit-description').value = dep.description || '';
    document.getElementById('edit-deposit-amount').value      = parseFloat(dep.amount || 0).toFixed(2);
    document.getElementById('edit-deposit-modal').showModal();
}

async function submitEditDeposit() {
    const id          = document.getElementById('edit-deposit-id').value;
    const description = document.getElementById('edit-deposit-description').value.trim();
    const amount      = parseFloat(document.getElementById('edit-deposit-amount').value) || 0;

    if (!description) { alert('Please enter a description.'); return; }
    if (amount <= 0)  { alert('Please enter a valid amount.'); return; }

    const btn = document.getElementById('edit-deposit-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const res = await apiFetch('api.php?action=editDeposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, description, amount })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('edit-deposit-modal').close();
            await loadLogs();
        } else {
            alert('❌ Failed to update: ' + (result.message || 'Unknown error'));
        }
    } catch(e) {
        alert('❌ Network error. Please try again.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
}

function openDeleteExpDep(type, id, label) {
    _pendingDeleteType = type;
    _pendingDeleteId   = id;
    const descEl = document.getElementById('delete-exp-dep-desc');
    if (descEl) descEl.textContent = (type === 'expense' ? 'Expense: ' : 'Deposit: ') + label;
    document.getElementById('delete-exp-dep-modal').showModal();
}

async function confirmDeleteExpDep() {
    if (!_pendingDeleteType || !_pendingDeleteId) return;
    const action = _pendingDeleteType === 'expense' ? 'deleteExpense' : 'deleteDeposit';
    try {
        const res = await apiFetch(`api.php?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: _pendingDeleteId })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('delete-exp-dep-modal').close();
            _pendingDeleteType = null;
            _pendingDeleteId   = null;
            await loadLogs();
        } else {
            alert('❌ Failed to delete: ' + (result.message || 'Unknown error'));
        }
    } catch(e) {
        alert('❌ Network error. Please try again.');
    }
}