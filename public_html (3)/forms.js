// ── FORMS: ADD MODAL, EDIT PANEL, FORM HELPERS, INVOICE ──

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
    // Map duration key to minutes
    const durationMinutes = durationVal === '15kiddie' ? 15 : parseInt(durationVal, 10);
    if (!durationMinutes) return;
    const date = new Date();
    date.setHours(hours, minutes + durationMinutes, 0, 0);
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


function autoSetRentalAmount() {
    const duration = document.getElementById('form-duration').value;
    const validId  = document.getElementById('form-validid').value;
    const isDisc   = ['Senior', 'PWD'].includes(validId);
    const isKiddie = validId === 'Kiddie';
    let price = 0;
    if (isKiddie) {
        price = PRICES_KIDDIE[duration] || 0;
    } else if (isDisc) {
        price = PRICES_DISCOUNT[duration] || 0;
    } else {
        price = PRICES_REGULAR[duration] || 0;
    }
    document.getElementById('form-amount').value = price;
    updateLiveTotal();
}

function handleValidIdChange() {
    const validId  = document.getElementById('form-validid').value;
    const isDisc   = ['Senior', 'PWD'].includes(validId);
    const isKiddie = validId === 'Kiddie';
    document.getElementById('discount-note').classList.toggle('hidden', !isDisc);

    // Save current duration before rebuilding the dropdown
    const durationSel    = document.getElementById('form-duration');
    const previousDuration = durationSel.value;

    const allOptions = [
        { value: '',          text: '-- Select --',          forKiddie: true,  forRegular: true  },
        { value: '15kiddie',  text: '15 Mins (Kiddie Cart)',  forKiddie: true,  forRegular: true  },
        { value: '30',        text: '30 Mins',               forKiddie: false, forRegular: true  },
        { value: '60',        text: '1 Hour',                forKiddie: false, forRegular: true  },
        { value: '120',       text: '2 Hours',               forKiddie: false, forRegular: true  },
        { value: '180',       text: '3 Hours',               forKiddie: false, forRegular: true  },
        { value: 'unlimited', text: 'Unlimited',             forKiddie: false, forRegular: true  },
    ];
    durationSel.innerHTML = '';
    allOptions.forEach(opt => {
        if (isKiddie && !opt.forKiddie) return;
        if (!isKiddie && !opt.forRegular) return;
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text;
        durationSel.appendChild(o);
    });

    if (isKiddie) {
        // Kiddie always locks to 15-min kiddie cart
        durationSel.value = '15kiddie';
        autoCalculateTimeOut();
    } else {
        // Restore previous duration if it still exists in the rebuilt dropdown,
        // otherwise leave on blank '-- Select --'
        const optionExists = [...durationSel.options].some(o => o.value === previousDuration);
        durationSel.value = optionExists ? previousDuration : '';
    }
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
    // Reset ID photo
    document.getElementById('form-id-photo').value = '';
    document.getElementById('id-photo-preview').src = '';
    document.getElementById('id-photo-preview-wrap').classList.add('hidden');
    document.getElementById('id-photo-placeholder').classList.remove('hidden');
    const fileInput = document.getElementById('id-photo-file');
    if (fileInput) fileInput.value = '';
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

    // Admin-only: show/hide branch selector and reset it
    const branchWrap = document.getElementById('form-branch-wrap');
    if (branchWrap) branchWrap.classList.toggle('hidden', !(currentUser && currentUser.role === 'admin'));
    const branchSel = document.getElementById('form-branch');
    if (branchSel) branchSel.value = 'admin';

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
        <!-- Two-column body, each side scrolls independently -->
        <div id="ep-form-grid" style="flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0;border-top:1px solid #e2e8f0;">

              <!-- LEFT COLUMN: Customer info -->
              <div style="overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:16px;border-right:1px solid #e2e8f0;background:#f8fafc;">
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
                      <option value="Kiddie"  ${log.valid_id==='Kiddie'?'selected':''}>Kiddie Cart</option>
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
              </div><!-- end left scroll col -->

              <!-- RIGHT COLUMN: Payment + ID Photo + actions -->
              <div style="overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:16px;background:#f8fafc;">
                <!-- Scroll hint -->
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:8px 14px;display:flex;align-items:center;gap:8px;font-size:11px;color:#1d4ed8;font-weight:600;">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  Scroll down to see ID Photo &amp; Save button
                </div>
                <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;flex-direction:column;gap:14px;">
                  <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Payment Details</p>
                  <div>
                    <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Method <span style="color:#ef4444;">*</span></label>
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

                <!-- ID Photo section -->
                <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;flex-direction:column;gap:12px;border:1.5px solid ${log.id_photo ? '#a7f3d0' : '#fde68a'};">
                  <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0;">Customer ID Photo <span style="color:#ef4444;">*</span></p>

                  <!-- Hidden base64 store -->
                  <input id="ep-id-photo" type="hidden" value="${log.id_photo ? esc(log.id_photo) : ''}">

                  <!-- Preview (shown when photo exists) -->
                  <div id="ep-photo-preview-wrap" style="${log.id_photo ? '' : 'display:none;'}position:relative;">
                    <img id="ep-photo-preview" src="${log.id_photo ? log.id_photo : ''}" alt="ID Photo"
                         style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;border:2px solid #a5f3fc;display:block;">
                    <button type="button" onclick="epClearPhoto()"
                            style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:#ef4444;border:none;color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">&#x2715;</button>
                  </div>

                  <!-- Placeholder (shown when no photo) — amber warning -->
                  <div id="ep-photo-placeholder" style="${log.id_photo ? 'display:none;' : ''}width:100%;height:96px;background:#fffbeb;border:2px dashed #fbbf24;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#92400e;">
                    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" opacity="0.6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">No ID photo — tap to add</span>
                  </div>

                  <!-- Camera + Upload buttons -->
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <button type="button" onclick="epOpenCamera()"
                            style="display:flex;align-items:center;justify-content:center;gap:8px;background:#0891b2;color:#fff;border:none;border-radius:12px;padding:12px;font-size:12px;font-weight:700;cursor:pointer;">
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                      Retake / Camera
                    </button>
                    <label style="display:flex;align-items:center;justify-content:center;gap:8px;background:#475569;color:#fff;border:none;border-radius:12px;padding:12px;font-size:12px;font-weight:700;cursor:pointer;">
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                      Replace / Upload
                      <input id="ep-photo-file" type="file" accept="image/*" style="display:none;" onchange="epHandlePhotoUpload(event)">
                    </label>
                  </div>
                </div>

                <div style="background:#fff;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                  <div id="ep-error" style="display:none;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:12px 16px;color:#dc2626;font-size:12px;font-weight:600;margin-bottom:14px;"></div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <button id="ep-cancel" style="padding:15px;border-radius:14px;border:1.5px solid #e2e8f0;background:#fff;color:#475569;font-weight:700;font-size:14px;cursor:pointer;">Cancel</button>
                    <button id="ep-save" style="padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.3);">Save Changes</button>
                  </div>
                </div>
              </div><!-- end right scroll col -->

        </div><!-- end ep-form-grid -->

        <!-- EP Camera Overlay -->
        <div id="ep-camera-overlay" style="display:none;position:fixed;inset:0;z-index:10010;background:#000;flex-direction:column;">
          <div style="background:#0f172a;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
            <div>
              <p style="color:#fff;font-weight:700;font-size:14px;margin:0;">Retake Customer ID Photo</p>
              <p style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin:4px 0 0;">Position the ID clearly in the frame</p>
            </div>
            <button onclick="epCloseCamera()" style="color:#94a3b8;background:rgba(255,255,255,0.06);border:none;border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
          </div>
          <div style="flex:1;position:relative;overflow:hidden;">
            <video id="ep-camera-video" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
              <div style="border:2px solid #22d3ee;border-radius:12px;width:80%;max-width:360px;height:200px;box-shadow:0 0 0 9999px rgba(0,0,0,0.5);"></div>
            </div>
          </div>
          <canvas id="ep-camera-canvas" style="display:none;"></canvas>
          <div style="background:#0f172a;padding:20px;display:flex;align-items:center;justify-content:center;">
            <button onclick="epCapturePhoto()"
                    style="width:68px;height:68px;border-radius:50%;background:#fff;border:4px solid #22d3ee;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.4);">
              <svg width="28" height="28" fill="none" stroke="#0f172a" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
            </button>
          </div>
        </div>
    `;

    document.body.appendChild(panel);

    // Responsive: stack columns on mobile, side-by-side on tablet+
    function _epResize() {
        const g = document.getElementById('ep-form-grid');
        if (!g) return;
        if (window.innerWidth < 640) {
            // Mobile: single column, full scroll on panel
            g.style.gridTemplateColumns = '1fr';
            g.style.overflow = 'auto';
            g.querySelectorAll(':scope > div').forEach(col => {
                col.style.overflowY = 'visible';
                col.style.borderRight = 'none';
                col.style.borderBottom = '1px solid #e2e8f0';
            });
        } else {
            // Tablet+: two columns each independently scrolling
            g.style.gridTemplateColumns = '1fr 1fr';
            g.style.overflow = 'hidden';
            g.querySelectorAll(':scope > div').forEach((col, i) => {
                col.style.overflowY = 'auto';
                col.style.borderBottom = 'none';
                if (i === 0) col.style.borderRight = '1px solid #e2e8f0';
            });
        }
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

function epUpdateTotal() {
    const amt  = parseFloat(document.getElementById('ep-amount')?.value) || 0;
    const addl = parseFloat(document.getElementById('ep-addl')?.value)   || 0;
    const el = document.getElementById('ep-live-total');
    if (el) el.textContent = '\u20B1' + (amt + addl).toFixed(2);
}

// ── EDIT PANEL PHOTO HELPERS ──
let _epCameraStream = null;

function epSetPhotoPreview(dataUrl) {
    const hidden   = document.getElementById('ep-id-photo');
    const preview  = document.getElementById('ep-photo-preview');
    const preWrap  = document.getElementById('ep-photo-preview-wrap');
    const placeholder = document.getElementById('ep-photo-placeholder');
    if (!hidden) return;
    hidden.value = dataUrl;
    if (preview)  { preview.src = dataUrl; }
    if (preWrap)  { preWrap.style.display = ''; }
    if (placeholder) { placeholder.style.display = 'none'; }
}

function epClearPhoto() {
    const hidden   = document.getElementById('ep-id-photo');
    const preview  = document.getElementById('ep-photo-preview');
    const preWrap  = document.getElementById('ep-photo-preview-wrap');
    const placeholder = document.getElementById('ep-photo-placeholder');
    if (hidden)  hidden.value = '';
    if (preview) preview.src = '';
    if (preWrap) preWrap.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
    const fi = document.getElementById('ep-photo-file');
    if (fi) fi.value = '';
}

function epHandlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => epSetPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
}

function epOpenCamera() {
    const overlay = document.getElementById('ep-camera-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            _epCameraStream = stream;
            const video = document.getElementById('ep-camera-video');
            if (video) video.srcObject = stream;
        })
        .catch(() => {
            overlay.style.display = 'none';
            alert('Camera access denied or not available. Use the Upload button instead.');
        });
}

function epCloseCamera() {
    if (_epCameraStream) {
        _epCameraStream.getTracks().forEach(t => t.stop());
        _epCameraStream = null;
    }
    const overlay = document.getElementById('ep-camera-overlay');
    if (overlay) overlay.style.display = 'none';
}

function epCapturePhoto() {
    const video  = document.getElementById('ep-camera-video');
    const canvas = document.getElementById('ep-camera-canvas');
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    epSetPhotoPreview(dataUrl);
    epCloseCamera();
}


function closeEditPanel() {
    const panel = document.getElementById('edit-panel');
    if (!panel) return;
    // Stop camera if it was open
    if (_epCameraStream) {
        _epCameraStream.getTracks().forEach(t => t.stop());
        _epCameraStream = null;
    }
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
        id_photo:         document.getElementById('ep-id-photo')?.value || '',
        target_branch:    (currentUser && currentUser.role === 'admin')
            ? (document.getElementById('ep-branch')?.value || 'admin')
            : (currentUser?.username || ''),
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
    const headerDate = document.getElementById('header-date')?.value || '';
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
        total: (parseFloat(document.getElementById('form-amount').value) || 0) + (parseFloat(document.getElementById('form-add-charge').value) || 0),
        id_photo: document.getElementById('form-id-photo').value || '',
        record_date: headerDate,
        target_branch: (currentUser && currentUser.role === 'admin')
            ? (document.getElementById('form-branch')?.value || 'admin')
            : (currentUser?.username || '')
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


// ── INVOICE MODAL (per-row, opened via INVOICE button on each log row) ──

function openInvoiceModal(logId) {
    const log = allLogs.find(l => l.id === logId);
    if (!log) return;

    const r   = _calcInvoiceRow(log);
    const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('inv-or').textContent      = log.or_number || '—';
    document.getElementById('inv-date').textContent    = log.date || document.getElementById('header-date')?.value || '—';
    document.getElementById('inv-name').textContent    = log.name || '—';
    document.getElementById('inv-address').textContent = log.address || '—';
    document.getElementById('inv-validid').textContent = log.valid_id || '—';

    document.getElementById('inv-total-sales').textContent = fmt(r.totalSales);
    document.getElementById('inv-vat').textContent         = '(' + fmt(r.lessVat) + ')';
    document.getElementById('inv-net-vat').textContent     = fmt(r.netOfVat);
    document.getElementById('inv-total-due').textContent   = fmt(r.totalDue);

    const discRow = document.getElementById('inv-discount-row');
    const discAmt = document.getElementById('inv-discount-amt');
    if (r.discount > 0) {
        discRow.classList.remove('hidden');
        discAmt.textContent = '(' + fmt(r.discount) + ')';
    } else {
        discRow.classList.add('hidden');
    }

    document.getElementById('invoice-modal').showModal();
}

// ── INVOICE FULLSCREEN TABLE (admin only) ──

function _calcInvoiceRow(l) {
    const base = parseFloat(l.amount_cash >= 0 ? l.amount_cash : (l.amount_gcash >= 0 ? l.amount_gcash : 0)) || 0;
    const addl = parseFloat(l.additional_cash > 0 ? l.additional_cash : (l.additional_gcash > 0 ? l.additional_gcash : 0)) || 0;
    const totalSales = base + addl;
    const lessVat    = totalSales * 12 / 112;
    const netOfVat   = totalSales - lessVat;
    const isDisc     = ['Senior', 'PWD'].includes(l.valid_id);
    let discount = 0;
    if (isDisc && l.time_in && l.time_out && l.time_out !== '00:00') {
        const [ih, im] = (l.time_in || '00:00').split(':').map(Number);
        const [oh, om] = (l.time_out || '00:00').split(':').map(Number);
        const diff = (oh * 60 + om) - (ih * 60 + im);
        let dk = diff <= 15 ? '15kiddie' : diff <= 30 ? '30' : diff <= 60 ? '60' : diff <= 120 ? '120' : diff <= 180 ? '180' : 'unlimited';
        discount = Math.max(0, (PRICES_REGULAR[dk] || totalSales) - totalSales);
    }
    return { totalSales, lessVat, netOfVat, discount, totalDue: totalSales };
}

function openInvoicePanel() {
    const panel = document.getElementById('invoice-panel');
    if (!panel) return;
    panel.style.display = 'flex';

    // Initialize date filter to today if not already set
    const dateEl = document.getElementById('invoice-date-filter');
    if (dateEl && !dateEl.value) {
        const today = new Date();
        const ph = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        dateEl.value = ph.toISOString().slice(0, 10);
    }

    const searchEl = document.getElementById('invoice-panel-search');
    if (searchEl) { searchEl.value = ''; }
    renderInvoiceTable();
    setTimeout(() => { if (searchEl) searchEl.focus(); }, 80);
}

function closeInvoicePanel() {
    const panel = document.getElementById('invoice-panel');
    if (panel) panel.style.display = 'none';
}

function renderInvoiceTable() {
    const query      = (document.getElementById('invoice-panel-search')?.value || '').toLowerCase().trim();
    const dateFilter = document.getElementById('invoice-date-filter')?.value || '';
    const wrapper    = document.getElementById('invoice-tables-wrapper');
    if (!wrapper) return;

    const fmt = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Branch display name map
    const BRANCH_LABELS = {
        baliwag:     'Baliwag',
        pampanga:    'Pampanga',
        trinoma:     'Trinoma',
        smartwheels: 'Smart Wheels',
        bataan:      'Bataan',
        admin:       'Admin',
    };

    // 1. Filter by date first (only records matching selected date)
    let logs = dateFilter
        ? allLogs.filter(l => l.created_at && l.created_at.startsWith(dateFilter))
        : allLogs;

    // 2. Apply name/OR search
    if (query) {
        logs = logs.filter(l =>
            (l.or_number && l.or_number.toLowerCase().includes(query)) ||
            (l.name && l.name.toLowerCase().includes(query))
        );
    }

    if (logs.length === 0) {
        const dateLabel = dateFilter
            ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
            : 'all dates';
        wrapper.innerHTML = `
            <div style="text-align:center;padding:64px 24px;color:#94a3b8;">
                <svg style="width:48px;height:48px;margin:0 auto 12px;opacity:0.3;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p style="font-size:14px;font-weight:700;margin-bottom:4px;">No records found</p>
                <p style="font-size:12px;">No entries for <strong>${dateLabel}</strong>${query ? ' matching <em>' + query + '</em>' : ''}.</p>
            </div>`;
        return;
    }

    // 3. Group by branch (employee_username)
    const branchMap = {};
    logs.forEach(l => {
        const key = l.employee_username || 'unknown';
        if (!branchMap[key]) branchMap[key] = [];
        branchMap[key].push(l);
    });

    const dateDisplayLabel = dateFilter
        ? new Date(dateFilter + 'T00:00:00').toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
        : 'All Dates';

    // 4. Render one table per branch
    let html = '';
    let grandTotSales = 0, grandTotVat = 0, grandTotNet = 0, grandTotDisc = 0, grandTotDue = 0;

    Object.entries(branchMap).forEach(([branchKey, branchLogs]) => {
        const branchLabel = BRANCH_LABELS[branchKey] || branchKey.charAt(0).toUpperCase() + branchKey.slice(1);
        let totSales = 0, totVat = 0, totNet = 0, totDisc = 0, totDue = 0;

        const rows = branchLogs.map((l, i) => {
            const r = _calcInvoiceRow(l);
            totSales += r.totalSales; totVat += r.lessVat; totNet += r.netOfVat;
            totDisc  += r.discount;   totDue  += r.totalDue;
            const rowBg = i % 2 === 0 ? '#fff' : '#f8fafc';
            return `<tr style="background:${rowBg};border-bottom:1px solid #f1f5f9;">
                <td style="padding:11px 14px;color:#94a3b8;font-size:11px;">${i + 1}</td>
                <td style="padding:11px 14px;font-weight:700;color:#0f172a;">${l.name || '—'}</td>
                <td style="padding:11px 14px;color:#64748b;font-size:11px;">${l.address || '—'}</td>
                <td style="padding:11px 14px;font-family:monospace;color:#0f172a;">${l.or_number || '—'}</td>
                <td style="padding:11px 14px;color:#64748b;">${l.valid_id || '—'}</td>
                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:600;color:#0f172a;">${fmt(r.totalSales)}</td>
                <td style="padding:11px 14px;text-align:right;font-family:monospace;color:#64748b;">(${fmt(r.lessVat)})</td>
                <td style="padding:11px 14px;text-align:right;font-family:monospace;color:${r.discount > 0 ? '#10b981' : '#cbd5e1'};">${r.discount > 0 ? '(' + fmt(r.discount) + ')' : '—'}</td>
                <td style="padding:11px 14px;text-align:right;font-family:monospace;color:#0f172a;">${fmt(r.netOfVat)}</td>
                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:700;color:#10b981;">${fmt(r.totalDue)}</td>
            </tr>`;
        }).join('');

        grandTotSales += totSales; grandTotVat += totVat; grandTotNet += totNet;
        grandTotDisc  += totDisc;  grandTotDue += totDue;

        html += `
        <div style="margin-bottom:28px;">
            <!-- Branch header -->
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                <div style="background:#0f172a;color:#fde047;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;padding:5px 14px;border-radius:20px;">${branchLabel}</div>
                <div style="font-size:11px;color:#64748b;font-weight:600;">${dateDisplayLabel}</div>
                <div style="margin-left:auto;font-size:11px;font-weight:700;color:#64748b;">${branchLogs.length} record${branchLogs.length !== 1 ? 's' : ''}</div>
            </div>
            <!-- Table -->
            <div style="background:white;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:860px;">
                        <thead>
                            <tr style="background:#0f172a;">
                                <th style="padding:11px 14px;text-align:left;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">No</th>
                                <th style="padding:11px 14px;text-align:left;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Name</th>
                                <th style="padding:11px 14px;text-align:left;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Address</th>
                                <th style="padding:11px 14px;text-align:left;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">O.R. #</th>
                                <th style="padding:11px 14px;text-align:left;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Valid ID</th>
                                <th style="padding:11px 14px;text-align:right;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Total Sales (VAT Incl.)</th>
                                <th style="padding:11px 14px;text-align:right;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Less VAT (12%)</th>
                                <th style="padding:11px 14px;text-align:right;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Discounted</th>
                                <th style="padding:11px 14px;text-align:right;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Net of VAT</th>
                                <th style="padding:11px 14px;text-align:right;color:white;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;">Total Due</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                        <tfoot>
                            <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0;">
                                <td colspan="5" style="padding:11px 14px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">
                                    Subtotal (${branchLogs.length})
                                </td>
                                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">${fmt(totSales)}</td>
                                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:700;color:#64748b;">(${fmt(totVat)})</td>
                                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:700;color:#10b981;">${totDisc > 0 ? '(' + fmt(totDisc) + ')' : '—'}</td>
                                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">${fmt(totNet)}</td>
                                <td style="padding:11px 14px;text-align:right;font-family:monospace;font-weight:800;color:#10b981;font-size:13px;">${fmt(totDue)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>`;
    });

    // 5. Grand total summary across all branches
    const branchCount = Object.keys(branchMap).length;
    if (branchCount > 1) {
        html += `
        <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:14px;padding:18px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:8px;">
            <span style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-right:8px;">ALL BRANCHES TOTAL</span>
            <div style="display:flex;flex-wrap:wrap;gap:20px;margin-left:auto;">
                <div style="text-align:right;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Total Sales</div>
                    <div style="font-family:monospace;font-weight:800;color:white;font-size:15px;">${fmt(grandTotSales)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Less VAT</div>
                    <div style="font-family:monospace;font-weight:700;color:#94a3b8;font-size:13px;">(${fmt(grandTotVat)})</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Net of VAT</div>
                    <div style="font-family:monospace;font-weight:700;color:#e2e8f0;font-size:13px;">${fmt(grandTotNet)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Total Due</div>
                    <div style="font-family:monospace;font-weight:800;color:#6ee7b7;font-size:18px;">${fmt(grandTotDue)}</div>
                </div>
            </div>
        </div>`;
    }

    wrapper.innerHTML = html;
}

function exportInvoiceCSV() {
    function doExport() {
        const dateFilter = document.getElementById('invoice-date-filter')?.value || new Date().toISOString().slice(0,10);
        const query = (document.getElementById('invoice-panel-search')?.value || '').toLowerCase().trim();

        let logs = dateFilter
            ? allLogs.filter(l => l.created_at && l.created_at.startsWith(dateFilter))
            : allLogs;
        if (query) logs = logs.filter(l =>
            (l.or_number && l.or_number.toLowerCase().includes(query)) ||
            (l.name && l.name.toLowerCase().includes(query))
        );

        const BRANCH_LABELS = {
            baliwag:'Baliwag', pampanga:'Pampanga', trinoma:'Trinoma',
            smartwheels:'Smart Wheels', bataan:'Bataan', admin:'Admin',
        };

        const rows = logs.map((l, i) => {
            const r = _calcInvoiceRow(l);
            const branchKey = l.employee_username || '';
            return {
                'Branch':                    BRANCH_LABELS[branchKey] || branchKey,
                'No':                        i + 1,
                'Name':                      l.name || '',
                'Address':                   l.address || '',
                'Waiver':                    l.waiver || '',
                'O.R. #':                    l.or_number || '',
                'Valid ID':                  l.valid_id || '',
                'Total Sales (VAT Incl.)':   r.totalSales,
                'Less VAT (12%)':            r.lessVat,
                'Net of VAT':                r.netOfVat,
                'Discount':                  r.discount,
                'Total Amount Due':          r.totalDue,
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
            { wch: 14 }, { wch: 5 }, { wch: 28 }, { wch: 30 }, { wch: 12 }, { wch: 12 },
            { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 }
        ];
        const moneyCols = [7, 8, 9, 10, 11];
        rows.forEach((_, ri) => {
            moneyCols.forEach(ci => {
                const ref = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
                if (ws[ref]) ws[ref].z = '#,##0.00';
            });
        });
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let c = range.s.c; c <= range.e.c; c++) {
            const hCell = XLSX.utils.encode_cell({ r: 0, c });
            if (ws[hCell]) ws[hCell].s = { font: { bold: true }, fill: { fgColor: { rgb: 'A78BFA' } } };
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
        XLSX.writeFile(wb, `momocart-invoice-${dateFilter}.xlsx`);
    }

    if (typeof XLSX !== 'undefined') {
        doExport();
    } else {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = doExport;
        s.onerror = () => alert('Failed to load Excel library.');
        document.head.appendChild(s);
    }
}