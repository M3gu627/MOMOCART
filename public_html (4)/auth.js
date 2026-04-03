// ── AUTHENTICATION & SESSION ──

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