let tempAdminUserId = null;
let adminResendTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    checkAdminAuth();
    setupAdminOtpInputs('admin-otp-boxes');
});

function setupAdminOtpInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inputs = container.querySelectorAll('input');
    
    inputs.forEach((input, index) => {
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
            if (!pastedData) return;
            for (let i = 0; i < pastedData.length; i++) {
                if (inputs[i]) inputs[i].value = pastedData[i];
            }
            const nextFocus = Math.min(pastedData.length, 5);
            inputs[nextFocus].focus();
        });

        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value !== '' && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value === '') {
                if (index > 0) {
                    inputs[index - 1].value = '';
                    inputs[index - 1].focus();
                }
            }
        });
    });
}

function getAdminOtpValue() {
    const inputs = document.querySelectorAll('#admin-otp-boxes input');
    let code = '';
    inputs.forEach(input => code += input.value);
    return code;
}

function clearAdminOtpInputs() {
    const inputs = document.querySelectorAll('#admin-otp-boxes input');
    inputs.forEach(input => input.value = '');
    if(inputs.length > 0) inputs[0].focus();
}

window.startAdminResendCooldown = function(seconds = 60) {
    const btn = document.getElementById('adminResendOtpBtn');
    if (!btn) return;
    
    let timeLeft = seconds;
    btn.disabled = true;
    btn.innerText = `Resend Code (${timeLeft}s)`;
    
    clearInterval(adminResendTimerInterval);
    adminResendTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(adminResendTimerInterval);
            btn.disabled = false;
            btn.innerText = "Resend Code";
        } else {
            btn.innerText = `Resend Code (${timeLeft}s)`;
        }
    }, 1000);
}

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    container.className = 'fixed top-4 sm:top-auto sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:-translate-x-0 sm:right-6 z-[9999] flex flex-col sm:flex-col items-center sm:items-end gap-2 pointer-events-none w-[90%] sm:w-auto';

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isInfo = type === 'info';
    const icon = isError ? 'alert-circle' : (isInfo ? 'loader-2' : 'check-circle');
    const colorClass = isError ? 'text-red-500' : (isInfo ? 'text-[#5865F2]' : 'text-emerald-500');
    
    toast.className = `flex items-center gap-3 bg-[#1e1f22] border border-[#2b2d31] p-3 sm:p-4 rounded-md shadow-2xl transform sm:translate-x-full -translate-y-full sm:translate-y-0 opacity-0 transition-all duration-300 pointer-events-auto w-full sm:w-[350px]`;
    toast.innerHTML = `
        <div class="${colorClass} shrink-0">
            <i data-lucide="${icon}" class="w-5 h-5 ${isInfo ? 'animate-spin' : ''}"></i>
        </div>
        <p class="text-sm font-medium text-gray-200 flex-1 break-words">${message}</p>
        <button onclick="this.parentElement.classList.add('opacity-0', 'scale-95'); setTimeout(()=>this.parentElement.remove(),300)" class="text-gray-400 hover:text-white transition shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
    `;
    
    container.appendChild(toast);
    lucide.createIcons({ root: toast });
    
    requestAnimationFrame(() => {
        toast.classList.remove('sm:translate-x-full', '-translate-y-full', 'opacity-0');
    });
    
    if(!isInfo) {
        setTimeout(() => { 
            toast.classList.add('opacity-0', 'scale-95'); 
            setTimeout(() => toast.remove(), 300); 
        }, 4000);
    }
    return toast;
}

window.showConfirm = function(title, message, confirmText = 'Confirm', isDanger = true) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const msgEl = document.getElementById('confirmMessage');
        const confirmBtn = document.getElementById('confirmActionBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const iconCont = document.getElementById('confirmIconContainer');
        const icon = document.getElementById('confirmIcon');

        titleEl.innerText = title;
        msgEl.innerText = message;
        confirmBtn.innerText = confirmText;

        if(isDanger) {
            confirmBtn.className = "flex-1 bg-red-500 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-red-600 transition shadow-[0_0_15px_rgba(239,68,68,0.2)]";
            iconCont.className = "w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20";
            icon.setAttribute('data-lucide', 'alert-triangle');
            icon.setAttribute('class', 'w-6 h-6 text-red-500'); 
        } else {
            confirmBtn.className = "flex-1 bg-kymor-accent text-black font-bold px-5 py-2.5 rounded-lg hover:bg-[#0d9488] transition shadow-[0_0_15px_rgba(20,184,166,0.2)]";
            iconCont.className = "w-12 h-12 rounded-full bg-kymor-accent/10 flex items-center justify-center mb-4 border border-kymor-accent/20";
            icon.setAttribute('data-lucide', 'help-circle');
            icon.setAttribute('class', 'w-6 h-6 text-kymor-accent');
        }

        lucide.createIcons({ root: iconCont.parentElement });
        modal.classList.remove('hidden');
        
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.transform').classList.remove('scale-95');
        });

        const cleanup = () => {
            modal.classList.add('opacity-0');
            modal.querySelector('.transform').classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 200);
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

window.copyToClipboard = function(text, msg) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => showToast(msg)).catch(() => showToast("Failed to copy", "error"));
    } else {
        let t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; document.body.appendChild(t); t.focus(); t.select();
        try { document.execCommand('copy'); showToast(msg); } catch (err) { showToast("Failed to copy", "error"); } document.body.removeChild(t);
    }
}

window.adminFetch = async function(url, options = {}) {
    options.credentials = 'include'; 
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { window.handleAdminLogout(); throw new Error("Unauthorized"); }
    return res;
}

window.checkAdminAuth = async function() {
    const overlay = document.getElementById('adminAuthOverlay');
    
    try {
        const res = await fetch('/api/user/me');
        const userData = await res.json();

        if (userData.role !== 'admin' && userData.role !== 'moderator') {
            window.location.replace('/dashboard');
            return;
        }

        if (!userData.isTwoFactorEnabled) {
            window.location.replace('/dashboard?error=admin_requires_2fa');
            return;
        }
        const isUnlocked = sessionStorage.getItem('admin_terminal_unlocked');
        if (isUnlocked === 'true') {
            overlay.classList.add('hidden');
            window.loadAdminData();
        }
    } catch (e) {
        window.location.replace('/dashboard');
    }
}

window.loginAdmin = async function() {
    const u = document.getElementById('adminUser').value;
    const p = document.getElementById('adminPass').value;
    const btn = document.getElementById('adminAuthBtn');
    const originalText = btn.innerText;

    if(!u || !p) return window.showToast("Enter credentials", "error");

    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    lucide.createIcons({root: btn.parentElement});
    
    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ identifier: u, password: p })
        });
        const data = await res.json();
        
        if (data.requires_otp) {
            tempAdminUserId = data.userId;
            
            document.getElementById('credentialInputs').classList.add('hidden');
            const otpContainer = document.getElementById('otpContainer');
            otpContainer.classList.remove('hidden');
            
            requestAnimationFrame(() => {
                otpContainer.classList.remove('scale-95', 'opacity-0');
                otpContainer.classList.add('scale-100', 'opacity-100');
            });
            
            clearAdminOtpInputs();
            window.startAdminResendCooldown();
            
            btn.innerText = "Verify Code";
            btn.className = "w-full bg-kymor-accent text-black font-bold py-3 rounded-lg hover:bg-[#0d9488] transition shadow-[0_0_15px_rgba(20,184,166,0.3)]";
            btn.setAttribute('onclick', 'window.verifyAdminOtp()');
            
            window.showToast("2FA Code sent to your email.", "success");
        } else {
            window.showToast(data.error || "Invalid Credentials", "error");
            btn.innerText = originalText;
        }
    } catch (e) {
        window.showToast("Authentication Failed", "error");
        btn.innerText = originalText;
    }
}

window.triggerAdminResend = async function() {
    if (!tempAdminUserId) return;
    
    window.startAdminResendCooldown();
    window.showToast("Requesting new code...", "info");
    
    try {
        const res = await fetch('/api/admin/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: tempAdminUserId })
        });
        const data = await res.json();
        
        if (data.success) {
            window.showToast("A new code has been sent to your email.", "success");
            clearAdminOtpInputs();
        } else {
            window.showToast(data.error || "Failed to resend code.", "error");
            clearInterval(adminResendTimerInterval);
            const btn = document.getElementById('adminResendOtpBtn');
            btn.disabled = false;
            btn.innerText = "Resend Code";
        }
    } catch (err) {
        window.showToast("Connection error.", "error");
    }
}

window.verifyAdminOtp = async function() {
    const otp = getAdminOtpValue();
    const btn = document.getElementById('adminAuthBtn');
    
    if(!otp || otp.length !== 6) return window.showToast("Enter full 6-digit Code", "error");

    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
    lucide.createIcons({root: btn.parentElement});

    try {
        const res = await fetch('/api/admin/verify-otp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: tempAdminUserId, otp: otp })
        });
        const data = await res.json();

        if (data.success) {
            sessionStorage.setItem('admin_terminal_unlocked', 'true');
            document.getElementById('adminAuthOverlay').classList.add('hidden');
            window.showToast("Terminal Unlocked");
            window.loadAdminData();
        } else {
            window.showToast(data.error || "Invalid Code", "error");
            btn.innerText = "Verify Code";
            clearAdminOtpInputs();
        }
    } catch (e) {
        window.showToast("Verification Failed", "error");
        btn.innerText = "Verify Code";
    }
}

window.logoutAdmin = function() { window.handleAdminLogout(); }
window.handleAdminLogout = async function() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e) {}
    localStorage.removeItem('is_admin_logged_in');
    sessionStorage.removeItem('admin_terminal_unlocked');
    window.location.replace('/login');
}

window.toggleAdminSidebar = function() { 
    document.getElementById('adminSidebar').classList.toggle('-translate-x-full'); 
    document.getElementById('mobileAdminOverlay').classList.toggle('hidden'); 
}

window.switchAdminTab = function(tab) {
    const views = ['dashboard', 'users', 'hubs', 'keys', 'settings', 'analytics'];
    
    views.forEach(t => {
        const viewEl = document.getElementById(`view-${t}`);
        if(viewEl) viewEl.classList.add('hidden');
        
        const btn = document.getElementById(`nav-${t}`);
        if(btn) btn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition border border-transparent";
    });
    
    const targetView = document.getElementById(`view-${tab}`);
    if(targetView) targetView.classList.remove('hidden');
    
    const activeBtn = document.getElementById(`nav-${tab}`);
    let title = "Overview";
    
    if(tab === 'dashboard') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 bg-red-500/10 transition border border-red-500/20";
        window.loadAdminActivity(); window.loadStats();
        title = "Overview";
    } else if (tab === 'analytics') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-green-500 bg-green-500/10 transition border border-green-500/20";
        window.loadGlobalAnalytics();
        title = "Global Analytics";
    } else if(tab === 'users') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-kymor-accent bg-kymor-accent/10 transition border border-kymor-accent/20";
        window.loadUsers();
        title = "User Management";
    } else if(tab === 'hubs') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#3b82f6] bg-[#3b82f6]/10 transition border border-[#3b82f6]/20";
        window.loadGlobalHubs();
        title = "Global Hubs";
    } else if(tab === 'keys') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#b48600] bg-[#b48600]/10 transition border border-[#b48600]/20";
        window.loadPremiumKeys();
        title = "Premium Keys";
    } else if(tab === 'settings') {
        if(activeBtn) activeBtn.className = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 transition border border-white/20";
        window.loadConfigValues();
        title = "Platform Configurations";
    }

    const breadcrumb = document.getElementById('breadcrumb-current');
    if(breadcrumb) breadcrumb.innerText = title;
    
    const overlay = document.getElementById('mobileAdminOverlay');
    if(window.innerWidth < 768 && overlay && !overlay.classList.contains('hidden')) window.toggleAdminSidebar();
}

window.loadAdminData = async function() {
    window.loadStats();
    window.loadAdminActivity();
    window.loadConfigValues();
}

window.loadConfigValues = async function() {
    try {
        const res = await window.adminFetch('/api/admin/config');
        const data = await res.json();
        
        if(data.discordClientId) document.getElementById('adminDiscordClientId').value = data.discordClientId;
        if(data.discordClientSecret) document.getElementById('adminDiscordClientSecret').value = data.discordClientSecret;
        if(data.paypalClientId) document.getElementById('adminPaypalClientId').value = data.paypalClientId;
        if(data.paypalClientSecret) document.getElementById('adminPaypalClientSecret').value = data.paypalClientSecret;
        if(data.paymongoSecretKey) document.getElementById('adminPaymongoKey').value = data.paymongoSecretKey;
        
        const toggle = document.getElementById('adminMaintenanceMode');
        if(toggle) {
            toggle.checked = data.maintenanceMode === true;
        }
    } catch(e) {}
}

window.savePlatformConfig = async function(btn) {
    const id = document.getElementById('adminDiscordClientId').value;
    const sec = document.getElementById('adminDiscordClientSecret').value;
    const payClient = document.getElementById('adminPaypalClientId').value;
    const paySecret = document.getElementById('adminPaypalClientSecret') ? document.getElementById('adminPaypalClientSecret').value : '';
    const paymongoKey = document.getElementById('adminPaymongoKey') ? document.getElementById('adminPaymongoKey').value : '';
    
    const toggle = document.getElementById('adminMaintenanceMode');
    const maintenance = toggle ? toggle.checked : false;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
    lucide.createIcons({root: btn});
    
    try {
        await window.adminFetch('/api/admin/config', { 
            method: 'POST', 
            body: JSON.stringify({
                clientId: id, 
                clientSecret: sec, 
                paypalClientId: payClient,
                paypalClientSecret: paySecret,
                paymongoSecretKey: paymongoKey,
                maintenanceMode: maintenance
            }) 
        });
        window.showToast("Platform configurations saved successfully!");
    } catch(e) { 
        window.showToast("Failed to save config", "error"); 
    }
    
    btn.innerHTML = originalText;
    lucide.createIcons({root: btn});
}

window.loadStats = async function() {
    try {
        const res = await window.adminFetch('/api/admin/stats');
        const data = await res.json();
        document.getElementById('stat-users').innerText = data.totalUsers || 0;
        document.getElementById('stat-premium').innerText = data.premiumUsers || 0;
        document.getElementById('stat-hubs').innerText = data.totalHubs || 0;
        document.getElementById('stat-execs').innerText = data.totalExecutions || 0;
    } catch(e) {}
}

window.loadAdminActivity = async function() {
    const c = document.getElementById('activityLogContainer');
    if(!c) return;
    try {
        const res = await window.adminFetch('/api/admin/activity');
        const logs = await res.json();
        if(logs.length === 0) { c.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-gray-500">No recent activity.</td></tr>'; return; }
        c.innerHTML = logs.map(l => `
            <tr class="border-b border-kymor-border/50 hover:bg-[#1a1a1c] transition">
                <td class="py-3 px-4 text-xs text-gray-500 font-mono">${new Date(l.createdAt).toLocaleString()}</td>
                <td class="py-3 px-4 text-xs text-gray-300 font-bold">${l.username||'System'}</td>
                <td class="py-3 px-4 text-xs text-white"><span class="bg-white/10 px-2 py-1 rounded">${l.action}</span></td>
                <td class="py-3 px-4 text-xs text-gray-400 flex items-center justify-between">
                    <span class="truncate max-w-[250px] block" title="${l.details}">${l.details}</span>
                    <button onclick="window.deleteLog('${l._id}')" class="text-gray-500 hover:text-red-500 transition ml-2" title="Delete Log"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>`).join('');
        lucide.createIcons();
    } catch(e) { c.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-red-500">Failed to load logs.</td></tr>'; }
}

window.deleteLog = async function(id) {
    if(!await window.showConfirm("Delete Log", "Delete this activity log entry?")) return;
    try {
        await window.adminFetch(`/api/admin/activity/${id}`, { method: 'DELETE' });
        window.showToast("Log deleted."); window.loadAdminActivity();
    } catch(e) { window.showToast("Failed to delete log", "error"); }
}

window.clearAllLogs = async function() {
    if(!await window.showConfirm("Wipe Activity Logs", "WARNING: This will permanently wipe ALL activity logs. This cannot be undone.", "Wipe Logs")) return;
    try {
        await window.adminFetch(`/api/admin/activity`, { method: 'DELETE' });
        window.showToast("All activity logs wiped successfully."); window.loadAdminActivity();
    } catch(e) { window.showToast("Failed to wipe logs", "error"); }
}

let adminChartInstance = null;

window.loadGlobalAnalytics = async function() {
    const c = document.getElementById('globalAnalyticsContainer');
    if(!c) return;
    try {
        const res = await window.adminFetch('/api/admin/analytics');
        const logs = await res.json();
        
        if(!logs || logs.length === 0) { 
            c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">No recent executions.</td></tr>'; 
        } else {
            c.innerHTML = logs.map(l => {
                const time = new Date(l.createdAt).toLocaleString();
                const location = (l.country && l.country !== 'Unknown') ? l.country : (l.ip || 'Unknown IP');
                return `
                <tr class="border-b border-kymor-border/50 hover:bg-[#1a1a1c] transition">
                    <td class="py-3 px-4 text-xs text-gray-500 font-mono">${time}</td>
                    <td class="py-3 px-4 text-xs text-green-500 font-bold">${l.executor || 'Unknown'}</td>
                    <td class="py-3 px-4 text-xs text-gray-400">${location}</td>
                    <td class="py-3 px-4 text-xs text-white font-mono">${l.script_name || 'N/A'}</td>
                    <td class="py-3 px-4 text-xs text-gray-500">${l.hub_owner || 'System'}</td>
                </tr>`;
            }).join('');
        }

        const canvas = document.getElementById('adminAnalyticsChart');
        if (canvas) {
            const execsPerPeriod = {};
            const now = new Date();

            for(let i=6; i>=0; i--) {
                const d = new Date(now.getTime() - i*24*60*60*1000);
                const label = `${d.getMonth()+1}/${d.getDate()}`;
                execsPerPeriod[label] = 0;
            }

            logs.forEach(log => {
                const logD = new Date(log.createdAt);
                if ((now - logD) <= 7*24*60*60*1000) {
                    const label = `${logD.getMonth()+1}/${logD.getDate()}`;
                    if(execsPerPeriod[label] !== undefined) execsPerPeriod[label]++;
                }
            });

            const ctx = canvas.getContext('2d');
            if(adminChartInstance) adminChartInstance.destroy();
            adminChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Object.keys(execsPerPeriod),
                    datasets: [{
                        label: 'Total Platform Executions',
                        data: Object.values(execsPerPeriod),
                        borderColor: '#14b8a6',
                        backgroundColor: 'rgba(20, 184, 166, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#0a0a0b',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#1f1f22' }, border: { dash: [4, 4] }, ticks: { color: '#64656b', precision: 0 } },
                        x: { grid: { display: false }, ticks: { color: '#64656b', maxRotation: 0 } }
                    }
                }
            });
        }

    } catch(e) { 
        c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-red-500">Failed to load analytics.</td></tr>'; 
    }
}

window.loadUsers = async function() {
    const c = document.getElementById('usersContainer');
    if(!c) return;
    try {
        const res = await window.adminFetch('/api/admin/users');
        const users = await res.json();
        if(users.length === 0) { c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">No users found.</td></tr>'; return; }
        c.innerHTML = users.map(u => {
            const premBadge = u.isPremium ? `<span class="bg-kymor-accent/20 text-kymor-accent px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"><i data-lucide="star" class="w-3 h-3 inline mr-1"></i>Premium</span>` : `<span class="bg-gray-500/20 text-gray-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Free</span>`;
            const roleSelect = `<select onchange="window.updateUserRole('${u._id}', this.value)" class="mt-1 bg-[#121214] border border-kymor-border rounded text-xs text-white p-1 outline-none"><option value="user" ${u.role==='user'?'selected':''}>User</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Moderator</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select>`;
            return `<tr class="border-b border-kymor-border/50 hover:bg-[#1a1a1c] transition"><td class="py-4 px-4 font-bold text-white">${u.username}</td><td class="py-4 px-4 font-mono text-gray-500 text-xs">${u._id}</td><td class="py-4 px-4 flex flex-col items-start gap-1">${premBadge}${roleSelect}</td><td class="py-4 px-4 text-xs text-gray-400">${new Date(u.createdAt).toLocaleDateString()}</td><td class="py-4 px-4 text-right"><div class="flex justify-end gap-2"><button onclick="window.togglePremium('${u._id}')" class="p-2 bg-[#121214] border border-kymor-border rounded-lg text-kymor-accent hover:bg-kymor-accent hover:text-black transition" title="Toggle Premium"><i data-lucide="star" class="w-4 h-4"></i></button><button onclick="window.deleteUser('${u._id}', '${u.username}')" class="p-2 bg-[#121214] border border-kymor-border rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition" title="Delete User"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></td></tr>`;
        }).join('');
        lucide.createIcons();
    } catch(e) { c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-red-500">Failed to load users.</td></tr>'; }
}

window.updateUserRole = async function(id, newRole) {
    try {
        const res = await window.adminFetch(`/api/admin/users/${id}/role`, { 
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if(data.success) {
            window.showToast("User role updated successfully.");
        } else {
            window.showToast(data.error || "Failed to update role", "error");
            window.loadUsers(); 
        }
    } catch(e) {
        window.showToast("Network error", "error");
        window.loadUsers();
    }
}

window.togglePremium = async function(id) {
    try {
        await window.adminFetch(`/api/admin/users/${id}/premium`, { method: 'PUT' });
        window.showToast("Premium status updated."); window.loadUsers(); window.loadStats();
    } catch(e) { window.showToast("Failed to update status", "error"); }
}

window.deleteUser = async function(id, name) {
    if(!await window.showConfirm("Delete User", `Permanently delete user ${name} and ALL their hubs, scripts, and keys?`, "Delete User")) return;
    try {
        await window.adminFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        window.showToast("User permanently deleted."); window.loadUsers(); window.loadStats();
    } catch(e) { window.showToast("Failed to delete user", "error"); }
}

window.loadGlobalHubs = async function() {
    const c = document.getElementById('globalHubsContainer');
    if(!c) return;
    try {
        const res = await window.adminFetch('/api/admin/hubs');
        const hubs = await res.json();
        if(hubs.length === 0) { c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">No hubs found.</td></tr>'; return; }
        c.innerHTML = hubs.map(h => {
            const ownerBadge = h.owner_premium ? `<i data-lucide="star" class="w-3 h-3 text-kymor-accent inline ml-1"></i>` : '';
            return `<tr class="border-b border-kymor-border/50 hover:bg-[#1a1a1c] transition"><td class="py-4 px-4 font-bold text-white">${h.name}</td><td class="py-4 px-4 font-mono text-[#3b82f6] text-xs bg-[#3b82f6]/10 px-2 rounded w-max">${h.short_id}</td><td class="py-4 px-4 text-sm text-gray-300 font-medium">${h.owner_name} ${ownerBadge}</td><td class="py-4 px-4 text-xs text-gray-500">${h.stats.scripts} Scripts | ${h.stats.keys} Keys</td><td class="py-4 px-4 text-right"><button onclick="window.deleteGlobalHub('${h.short_id}', '${h.name}')" class="p-2 bg-[#121214] border border-kymor-border rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`;
        }).join('');
        lucide.createIcons();
    } catch(e) { c.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-red-500">Failed to load hubs.</td></tr>'; }
}

window.deleteGlobalHub = async function(shortId, name) {
    if(!await window.showConfirm("Delete Hub", `Permanently delete hub '${name}'?`, "Delete Hub")) return;
    try {
        await window.adminFetch(`/api/admin/hubs/${shortId}`, { method: 'DELETE' });
        window.showToast("Hub deleted."); window.loadGlobalHubs(); window.loadStats();
    } catch(e) { window.showToast("Failed to delete hub", "error"); }
}

window.loadPremiumKeys = async function() {
    const c = document.getElementById('premiumKeysContainer');
    if(!c) return;
    try {
        const res = await window.adminFetch('/api/admin/premium-keys');
        const keys = await res.json();
        if(keys.length === 0) { c.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-500">No premium keys generated yet.</td></tr>'; return; }
        c.innerHTML = keys.map(k => {
            const statusHtml = k.used ? `<span class="bg-gray-500/20 text-gray-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Used</span>` : `<span class="bg-[#b48600]/20 text-[#b48600] px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Available</span>`;
            const date = new Date(k.createdAt).toLocaleDateString();
            return `<tr class="border-b border-kymor-border/50 hover:bg-[#1a1a1c] transition"><td class="py-4 px-4 font-mono text-[#b48600] text-sm cursor-pointer hover:underline" onclick="window.copyToClipboard('${k.key_string}', 'Key Copied')">${k.key_string}</td><td class="py-4 px-4">${statusHtml}</td><td class="py-4 px-4 text-xs text-gray-500">${date}</td><td class="py-4 px-4 text-right"><button onclick="window.deletePremiumKey('${k._id}')" class="p-2 bg-[#121214] border border-kymor-border rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`;
        }).join('');
        lucide.createIcons();
    } catch(e) { c.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-red-500">Failed to load keys.</td></tr>'; }
}

window.generatePremiumKeys = async function() {
    const amt = document.getElementById('premKeyAmount').value;
    try {
        const res = await window.adminFetch('/api/admin/premium-keys/generate', { method: 'POST', body: JSON.stringify({amount: amt}) });
        const data = await res.json();
        if(data.success) { window.showToast(`${amt} Premium Keys Generated!`); window.loadPremiumKeys(); }
        else { window.showToast(data.error, "error"); }
    } catch(e) { window.showToast("Generation failed", "error"); }
}

window.deletePremiumKey = async function(id) {
    if(!await window.showConfirm("Delete Key", "Permanently delete this premium key?")) return;
    try {
        await window.adminFetch(`/api/admin/premium-keys/${id}`, { method: 'DELETE' });
        window.showToast("Key deleted."); window.loadPremiumKeys();
    } catch(e) { window.showToast("Failed to delete", "error"); }
}