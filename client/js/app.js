import { io } from "socket.io-client";

let currentHubId = null;
let currentHubName = null;
let currentHubApiKey = null;
let activeKeys = [];
let activeScripts = [];
let activeCheckpoints = [];
let analyticsChartInstance = null;
let animationId = null;
let myGlobe = null;
let currentPhi = 0;
let targetPhi = 0;
let currentTheta = 0.2;
let targetTheta = 0.2;
let pointerInteractingX = null;
let pointerInteractingY = null;
let pointerMovementX = 0;
let pointerMovementY = 0;
let baseRotation = 0;
let pageElements = [];
let isPremiumUser = false;
let globalAnalyticsLogs = [];
let rewardsChartInstance = null;
let currentRewardSessions = [];
const MAX_ELEMENTS = 8;

const authChannel = new BroadcastChannel("kymor_auth_sync");
authChannel.onmessage = (e) => {
  if (e.data === "force_logout") handleLocalLogout();
};

window.checkMaintenanceMode = async function () {
  try {
    const res = await fetch("/api/platform/settings");
    const data = await res.json();

    if (data.maintenanceMode) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background-color:#050505;color:white;font-family:sans-serif;text-align:center;padding:20px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:20px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <h1 style="font-size:2rem;font-weight:bold;margin-bottom:10px;">Under Maintenance</h1>
          <p style="color:#9ca3af;max-width:400px;line-height:1.5;">Kymor is currently undergoing scheduled maintenance to upgrade our systems. We will be back online shortly!</p>
        </div>
      `;
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

window.initRealTime = function () {
  if (typeof io === "undefined") return;

  window.socket = io();

  window.socket.on("force_logout", (data) => {
    window.showToast(data.message || "Session terminated by server.", "error");
    setTimeout(window.logout, 2000);
  });

  window.socket.on("update_hubs", () => {
    if (!currentHubId) window.loadHubs();
  });

  window.socket.on("update_analytics", (hubId) => {
    if (
      currentHubId === hubId &&
      localStorage.getItem("kymor_last_tab") === "analytics"
    ) {
      window.loadAnalytics();
    }
  });

  window.socket.on("update_rewards", (hubId) => {
    if (
      currentHubId === hubId &&
      localStorage.getItem("kymor_last_tab") === "rewards"
    ) {
      window.loadSessions();
    }
  });
};

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) lucide.createIcons();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("error") === "admin_requires_2fa") {
    setTimeout(() => {
      window.showToast(
        "Admin Panel Access Denied: You must enable 2FA in your Account Settings first.",
        "error",
      );
      window.history.replaceState({}, document.title, "/dashboard");
    }, 500);
  }

  const isMaintenance = await window.checkMaintenanceMode();
  if (isMaintenance) return;

  window.initRealTime();
  window.checkLogin();

  const picker = document.getElementById("pageColorPicker");
  const hex = document.getElementById("pageColorHex");
  if (picker && hex) {
    picker.addEventListener("input", (e) => (hex.value = e.target.value));
    hex.addEventListener("input", (e) => (picker.value = e.target.value));
  }
});

window.showToast = function (message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  if (type === "success" || type === "error") {
    container.innerHTML = "";
  }

  container.className =
    "fixed top-4 sm:top-auto sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:-translate-x-0 sm:right-6 z-[9999] flex flex-col sm:flex-col items-center sm:items-end gap-2 pointer-events-none w-[90%] sm:w-auto";

  const toast = document.createElement("div");
  const isError = type === "error";
  const isInfo = type === "info";
  const icon = isError ? "alert-circle" : isInfo ? "loader-2" : "check-circle";
  const colorClass = isError
    ? "text-red-500"
    : isInfo
      ? "text-[#5865F2]"
      : "text-[#14b8a6]";

  toast.className = `flex items-center gap-3 bg-[#1e1f22] border border-[#2b2d31] p-3 sm:p-4 rounded-md shadow-2xl transform sm:translate-x-full -translate-y-full sm:translate-y-0 opacity-0 transition-all duration-300 pointer-events-auto w-full sm:w-[350px]`;
  toast.innerHTML = `
    <div class="${colorClass} shrink-0">
      <i data-lucide="${icon}" class="w-5 h-5 ${isInfo ? "animate-spin" : ""}"></i>
    </div>
    <p class="text-sm font-medium text-gray-200 flex-1 break-words">${message}</p>
    <button onclick="this.parentElement.classList.add('opacity-0', 'scale-95'); setTimeout(()=>this.parentElement.remove(),300)" class="text-gray-400 hover:text-white transition shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });

  requestAnimationFrame(() => {
    toast.classList.remove(
      "sm:translate-x-full",
      "-translate-y-full",
      "opacity-0",
    );
  });

  if (!isInfo) {
    setTimeout(() => {
      toast.classList.add("opacity-0", "scale-95");
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  return toast;
};

window.showConfirm = function (
  title,
  message,
  confirmText = "Confirm",
  isDanger = true,
) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customConfirmModal");
    if (!modal) return resolve(false);

    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const confirmBtn = document.getElementById("confirmActionBtn");
    const cancelBtn = document.getElementById("confirmCancelBtn");
    const iconCont = document.getElementById("confirmIconContainer");
    const icon = document.getElementById("confirmIcon");

    titleEl.innerText = title;
    msgEl.innerText = message;
    confirmBtn.innerText = confirmText;

    if (isDanger) {
      confirmBtn.className =
        "flex-1 bg-red-500 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-red-600 transition shadow-[0_0_15px_rgba(239,68,68,0.2)]";
      iconCont.className =
        "w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20";
      icon.setAttribute("data-lucide", "alert-triangle");
      icon.setAttribute("class", "w-6 h-6 text-red-500");
    } else {
      confirmBtn.className =
        "flex-1 bg-[#14b8a6] text-black font-bold px-5 py-2.5 rounded-lg hover:bg-[#0d9488] transition shadow-[0_0_15px_rgba(20,184,166,0.2)]";
      iconCont.className =
        "w-12 h-12 rounded-full bg-[#14b8a6]/10 flex items-center justify-center mb-4 border border-[#14b8a6]/20";
      icon.setAttribute("data-lucide", "help-circle");
      icon.setAttribute("class", "w-6 h-6 text-[#14b8a6]");
    }

    if (window.lucide) lucide.createIcons({ root: iconCont.parentElement });
    modal.classList.remove("hidden");

    requestAnimationFrame(() => {
      modal.classList.remove("opacity-0");
      const transformEl = modal.querySelector(".transform");
      if (transformEl) transformEl.classList.remove("scale-95");
    });

    const cleanup = () => {
      modal.classList.add("opacity-0");
      const transformEl = modal.querySelector(".transform");
      if (transformEl) transformEl.classList.add("scale-95");
      setTimeout(() => modal.classList.add("hidden"), 200);
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
};

window.copyToClipboard = function (text, successMsg) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => window.showToast(successMsg))
      .catch(() => window.showToast("Failed to copy.", "error"));
  } else {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      window.showToast(successMsg);
    } catch (err) {
      window.showToast("Failed to copy.", "error");
    }
    document.body.removeChild(textArea);
  }
};

window.checkLogin = async function () {
  const isValid = await window.loadUserProfile();
  if (!isValid) return;

  const savedHubId = localStorage.getItem("kymor_last_hub_id");
  const savedHubName = localStorage.getItem("kymor_last_hub_name");
  const savedTab = localStorage.getItem("kymor_last_tab") || "analytics";

  if (savedHubId && savedHubName) {
    window.openHub(savedHubId, savedHubName, savedTab);
  } else {
    window.loadHubs();
  }
};

window.loadUserProfile = async function () {
  try {
    const res = await window.apiFetch("/api/user/me");
    if (res.status === 401 || res.status === 403) {
      window.logout();
      return false;
    }
    if (res.ok) {
      const user = await res.json();

      const adminNavBtn = document.getElementById("nav-admin-panel");
      if (
        adminNavBtn &&
        (user.role === "admin" || user.role === "moderator" || user.isAdmin)
      ) {
        adminNavBtn.classList.remove("hidden");
      }
      isPremiumUser = user.isPremium;
      const un = document.getElementById("ui-username");
      if (un) un.innerText = user.username;
      const apiIn = document.getElementById("discordApiKeyInput");
      if (apiIn) apiIn.value = user.api_key;

      const planName = document.getElementById("planName");
      const hubCountText = document.getElementById("hubCountText");
      const actionBox = document.getElementById("upgradeActionBox");

      const pageSlugInput = document.getElementById("pageSlug");
      const slugLockIcon = document.getElementById("lock-slug");
      const setupDiscordOverlay = document.getElementById(
        "overlay-setup-discord",
      );
      const freePlanKeyBanner = document.getElementById("freePlanKeyBanner");
      const luaconLimitText = document.getElementById("luacon-limit-text");
      const rewardsPremiumOverlay = document.getElementById(
        "overlay-rewards-premium",
      );

      if (isPremiumUser) {
        if (planName)
          planName.innerHTML = `<i data-lucide="crown" class="w-3 h-3 text-[#14b8a6]"></i> <span class="text-[#14b8a6]">Premium Plan</span>`;
        if (hubCountText) hubCountText.innerText = `${user.hubCount}/50 HUBS`;

        if (actionBox)
          actionBox.innerHTML = `
            <a href="/upgrade" class="w-full flex items-center justify-center gap-2 bg-[#14b8a6]/10 border border-[#14b8a6]/20 text-[#14b8a6] hover:bg-[#14b8a6]/20 font-bold py-2.5 rounded-lg text-sm transition shadow-inner">
              <i data-lucide="gift" class="w-4 h-4"></i> Gift Premium
            </a>
          `;

        if (pageSlugInput) {
          pageSlugInput.disabled = false;
          pageSlugInput.placeholder = "my-custom-slug";
        }
        if (slugLockIcon) slugLockIcon.classList.add("hidden");
        if (setupDiscordOverlay) setupDiscordOverlay.classList.add("hidden");
        if (freePlanKeyBanner) freePlanKeyBanner.classList.add("hidden");
        if (luaconLimitText) luaconLimitText.innerText = "Unlimited";
        if (rewardsPremiumOverlay)
          rewardsPremiumOverlay.classList.add("hidden");
      } else {
        if (planName) planName.innerText = "FREE PLAN";
        if (hubCountText) hubCountText.innerText = `${user.hubCount}/1 HUB`;
        if (actionBox)
          actionBox.innerHTML = `
            <a href="/upgrade" class="w-full flex items-center justify-center gap-2 bg-[#14b8a6] hover:bg-[#0d9488] text-black font-bold py-2.5 rounded-lg text-sm transition shadow-[0_0_15px_rgba(20,184,166,0.2)]">
              <i data-lucide="star" class="w-4 h-4 text-black fill-black"></i> Upgrade — $10
            </a>
          `;

        if (pageSlugInput) {
          pageSlugInput.disabled = true;
          pageSlugInput.placeholder = "Premium Only";
          pageSlugInput.value = "";
        }
        if (slugLockIcon) slugLockIcon.classList.remove("hidden");
        if (setupDiscordOverlay) setupDiscordOverlay.classList.remove("hidden");
        if (freePlanKeyBanner) freePlanKeyBanner.classList.remove("hidden");
        if (rewardsPremiumOverlay)
          rewardsPremiumOverlay.classList.remove("hidden");

        const remaining = Math.max(0, 3 - (user.obfuscations_today || 0));
        if (luaconLimitText) luaconLimitText.innerText = `${remaining}/3`;
      }

      if (window.lucide) window.lucide.createIcons();
      return true;
    }
  } catch (e) {
    window.logout();
    return false;
  }
};

window.handleLocalLogout = async function () {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {}
  localStorage.removeItem("is_logged_in");
  localStorage.removeItem("kymor_last_hub_id");
  localStorage.removeItem("kymor_last_hub_name");
  localStorage.removeItem("kymor_last_tab");
  window.location.href = "/login";
};

window.logout = function () {
  authChannel.postMessage("force_logout");
  window.handleLocalLogout();
};

window.apiFetch = async function (url, options = {}) {
  options.credentials = "include";
  options.headers = { ...options.headers, "Content-Type": "application/json" };
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    window.logout();
    throw new Error("Unauthorized");
  }
  return res;
};

window.toggleSidebar = function () {
  document.getElementById("sidebar").classList.toggle("-translate-x-full");
  document.getElementById("mobileOverlay").classList.toggle("hidden");
};

window.toggleModal = function (id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.toggle("hidden");
};

window.showSection = function (section) {
  const sections = ["hubs", "hub-details", "discord", "docs"];
  sections.forEach((t) => {
    const viewEl = document.getElementById(`section-${t}`);
    if (viewEl) viewEl.classList.add("hidden");
  });

  const navIds = ["hubs", "discord", "docs"];
  navIds.forEach((t) => {
    const btn = document.getElementById(`nav-${t}`);
    if (btn) {
      let margin = t === "docs" ? "mb-8" : "mb-1";
      btn.className = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition ${margin} border border-transparent`;
    }
  });

  const targetSectionId =
    section === "details" ? "section-hub-details" : `section-${section}`;
  const activeSection = document.getElementById(targetSectionId);
  if (activeSection) activeSection.classList.remove("hidden");

  const targetNavId = section === "details" ? "hubs" : section;
  const activeBtn = document.getElementById(`nav-${targetNavId}`);

  if (activeBtn) {
    let margin = targetNavId === "docs" ? "mb-8" : "mb-1";
    activeBtn.className = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-[#14b8a6] bg-[#14b8a6]/10 transition ${margin} border border-[#14b8a6]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`;
  }

  if (section === "hubs") {
    localStorage.removeItem("kymor_last_hub_id");
    localStorage.removeItem("kymor_last_hub_name");
    localStorage.removeItem("kymor_last_tab");
    window.loadHubs();
  }

  const overlay = document.getElementById("mobileOverlay");
  if (
    window.innerWidth < 768 &&
    overlay &&
    !overlay.classList.contains("hidden")
  ) {
    window.toggleSidebar();
  }
};

window.switchTab = function (tab) {
  if (tab !== "analytics") window.cleanupGlobe();

  ["scripts", "keys", "rewards", "analytics", "setup", "page", "blacklist"].forEach((t) => {
    const view = document.getElementById(`view-${t}`);
    const btn =
      document.getElementById(`tab-${t}`) ||
      document.getElementById(`tab-btn-${t}`);
    if (view) view.classList.add("hidden");
    if (btn) {
      btn.classList.remove("text-white", "border-[#14b8a6]");
      btn.classList.add("text-gray-400", "border-transparent");
    }
  });

  const activeView =
    document.getElementById(`view-${tab}`) ||
    document.getElementById(`tab-${tab}`);
  const activeBtn =
    document.getElementById(`tab-${tab}`) ||
    document.getElementById(`tab-btn-${tab}`);

  if (activeView) activeView.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.classList.add("text-white", "border-[#14b8a6]");
    activeBtn.classList.remove("text-gray-400", "border-transparent");
  }

  if (tab === "scripts") window.loadScripts();
  if (tab === "keys") window.loadKeys();
  if (tab === "blacklist") window.loadBlacklist();
  if (tab === "rewards") window.loadRewards();
  if (tab === "analytics") window.loadAnalytics();

  localStorage.setItem("kymor_last_tab", tab);
  const tabNames = {
    scripts: "Scripts",
    keys: "Keys & Auth",
    rewards: "Rewards",
    setup: "Setup",
    analytics: "Analytics",
    page: "Page System",
  };
  const tabText = document.getElementById("active-tab-name");
  if (tabText) tabText.innerText = tabNames[tab] || "Overview";
};

window.openAccountSettings = async function () {
  try {
    const res = await window.apiFetch("/api/user/me");
    const user = await res.json();

    document.getElementById("settingsEmail").value = user.email || "";
    document.getElementById("settingsUsername").value = user.username || "";
    document.getElementById("toggle2FA").checked =
      user.isTwoFactorEnabled || false;
    document.getElementById("settingsNewPassword").value = "";

    window.toggleModal("accountSettingsModal");
  } catch (e) {
    window.showToast("Failed to load settings.", "error");
  }
};

window.updateUsername = async function () {
  const newUsername = document.getElementById("settingsUsername").value;
  if (!newUsername)
    return window.showToast("Username cannot be empty", "error");

  try {
    const res = await window.apiFetch("/api/user/username", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername }),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast("Username updated successfully!");
      const un = document.getElementById("ui-username");
      if (un) un.innerText = newUsername;
    } else {
      window.showToast(data.error || "Failed to update username", "error");
    }
  } catch (e) {
    window.showToast("Network error", "error");
  }
};

window.updatePassword = async function () {
  const newPassword = document.getElementById("settingsNewPassword").value;
  if (newPassword.length < 8)
    return window.showToast("Password must be at least 8 characters", "error");

  try {
    const res = await window.apiFetch("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast("Password updated successfully!");
      document.getElementById("settingsNewPassword").value = "";
    } else {
      window.showToast(data.error || "Failed to update password", "error");
    }
  } catch (e) {
    window.showToast("Network error", "error");
  }
};

window.update2FA = async function (enabled) {
  try {
    const res = await window.apiFetch("/api/user/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enable: enabled }),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast(enabled ? "2FA Enabled" : "2FA Disabled");
    } else {
      window.showToast(data.error || "Failed to update 2FA.", "error");
      document.getElementById("toggle2FA").checked = !enabled;
    }
  } catch (e) {
    window.showToast("Network error.", "error");
    document.getElementById("toggle2FA").checked = !enabled;
  }
};

window.copyApiKey = function () {
  const val = document.getElementById("discordApiKeyInput");
  if (val && val.value)
    window.copyToClipboard(val.value, "Global Discord API Key copied!");
};

window.regenerateApiKey = async function () {
  if (
    !(await window.showConfirm(
      "Regenerate Global Key",
      "Your Discord bot will disconnect from all hubs until you relogin on Discord. Continue?",
      "Regenerate",
      true,
    ))
  )
    return;
  try {
    const res = await window.apiFetch(`/api/user/regenerate-key`, {
      method: "POST",
    });
    const data = await res.json();
    const apiIn = document.getElementById("discordApiKeyInput");
    if (apiIn) apiIn.value = data.api_key;
    window.showToast("Global API Key Regenerated!");
  } catch (e) {
    window.showToast("Failed to regenerate key.", "error");
  }
};

window.loadHubs = async function () {
  try {
    const res = await window.apiFetch("/api/hubs");
    const hubs = await res.json();
    const c = document.getElementById("hubs-container");
    if (!c) return;

    if (hubs.length === 0) {
      c.innerHTML =
        '<p class="text-center text-gray-500 mt-10">No Hubs yet. Create one!</p>';
      return;
    }

    let html =
      '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">';
    hubs.forEach((h) => {
      const safeName = h.name ? h.name.replace(/'/g, "\\'") : "Unnamed Hub";
      html += `<div onclick="window.openHub('${h.short_id}', '${safeName}')" class="bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/5 p-6 rounded-3xl cursor-pointer hover:border-white/20 transition-all hover:-translate-y-1 relative group shadow-lg">
                <div class="flex justify-between items-start mb-6">
                    <div class="bg-[#14b8a6]/10 text-[#14b8a6] w-12 h-12 rounded-2xl flex items-center justify-center border border-[#14b8a6]/20 shadow-inner"><i data-lucide="crown" class="w-6 h-6"></i></div>
                    <button onclick="event.stopPropagation(); window.deleteHubCard('${h.short_id}')" class="text-gray-500 hover:text-red-500 transition relative z-20 p-3 -mr-3 -mt-3"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>
                <h3 class="font-black text-xl text-white mb-1 w-full truncate tracking-tight">${h.name}</h3>
                <div class="inline-block bg-[#1a1a1c] text-gray-400 text-[10px] font-mono px-2 py-0.5 rounded border border-white/5 mb-6">${h.short_id}</div>
                <div class="grid grid-cols-4 gap-2">
                    <div class="bg-[#050505] border border-white/5 p-2 rounded-xl text-center"><p class="text-[9px] text-gray-500 font-bold uppercase mb-1">ONLINE</p><p class="text-green-500 font-black text-sm">${h.online_count || 0}</p></div>
                    <div class="bg-[#050505] border border-white/5 p-2 rounded-xl text-center"><p class="text-[9px] text-gray-500 font-bold uppercase mb-1">HITS</p><p class="text-white font-black text-sm">${h.stats.executions}</p></div>
                    <div class="bg-[#050505] border border-white/5 p-2 rounded-xl text-center"><p class="text-[9px] text-gray-500 font-bold uppercase mb-1">SCRIPTS</p><p class="text-[#3b82f6] font-black text-sm">${h.stats.scripts}</p></div>
                    <div class="bg-[#050505] border border-white/5 p-2 rounded-xl text-center"><p class="text-[9px] text-gray-500 font-bold uppercase mb-1">KEYS</p><p class="text-[#f59e0b] font-black text-sm">${h.stats.keys}</p></div>
                </div>
            </div>`;
    });
    c.innerHTML = html + "</div>";
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error(e);
  }
};

window.createHub = async function () {
  const el = document.getElementById("newHubName");
  if (!el || !el.value)
    return window.showToast("Hub Name is required.", "error");
  try {
    const res = await window.apiFetch("/api/hubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: el.value }),
    });
    const data = await res.json();
    if (data.error) {
      if (data.error.includes("Plan limit reached")) {
        window.toggleModal("hubModal");
        window.toggleModal("hubLimitModal");
        return;
      }
      return window.showToast(data.error, "error");
    }

    el.value = "";
    window.toggleModal("hubModal");
    window.loadHubs();
    window.showToast("Hub created!");
    window.loadUserProfile();
  } catch (e) {
    window.showToast("Failed to create hub.", "error");
  }
};

window.openHub = async function(id, name, specificTab = 'scripts') {
    currentHubId = id; 
    currentHubName = name;
    localStorage.setItem('kymor_last_hub_id', id);
    localStorage.setItem('kymor_last_hub_name', name);
    
    const hn = document.getElementById('active-hub-name');
    if(hn) hn.innerText = name; 
    
    const shn = document.getElementById('settingHubName');
    if(shn) shn.value = name; 
    
    try {
        const hubs = await (await window.apiFetch('/api/hubs')).json();
        const hub = hubs.find(h => h.short_id === id);
        
        const hookInput = document.getElementById('setupWebhookUrl');
        if(hookInput && hub) hookInput.value = hub.webhook_url || '';
        
        if(hub) {
            window.loadPageSettingsToUI(hub);
        }
    } catch(e) {}
    
    window.showSection('details');
    window.switchTab(specificTab);
}

window.loadScripts = async function() {
    try {
        const res = await window.apiFetch(`/api/hubs/${currentHubId}/scripts`);
        const scripts = await res.json();
        const container = document.getElementById('scripts-container');
        
        if(!container) return;
        
        if (scripts.length === 0) { 
            container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500">No scripts added yet.</td></tr>'; 
            return; 
        }
        
        container.innerHTML = scripts.map(s => {
            const safeName = s.name ? s.name.replace(/'/g, "\\'") : 'Unnamed';
            const b64Code = btoa(unescape(encodeURIComponent(s.code || '')));
            const activeColor = s.is_active === false ? 'text-red-500 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : 'text-green-500 border-green-500/30 bg-green-500/10 hover:bg-green-500/20';
            const activeIcon = s.is_active === false ? 'power-off' : 'power';
            
            return `<tr class="border-b border-white/5 hover:bg-white/5 transition">
                        <td class="py-4 px-2 font-bold text-white">
                            <div class="flex items-center">
                                <span class="truncate max-w-[150px] sm:max-w-[250px] block">${s.name}</span>
                            </div>
                        </td>
                        <td class="py-4 px-2 font-mono text-gray-500 text-xs">${s.script_id}</td>
                        <td class="py-4 px-2 capitalize text-gray-400 font-medium">${s.obfuscator}</td>
                        <td class="py-4 px-2 text-right flex justify-end gap-2">
                            <button onclick="window.toggleKillSwitch('${s.script_id}')" class="p-2 border rounded-lg transition shadow-sm ${activeColor}">
                                <i data-lucide="${activeIcon}" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.copyLoaderCode('${s.script_id}')" class="bg-[#14b8a6]/10 text-[#14b8a6] border border-[#14b8a6]/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#14b8a6] hover:text-black transition">Loader</button>
                            <button onclick="window.openEditScriptWrapper('${s.script_id}', '${safeName}', '${b64Code}', '${s.obfuscator}')" class="p-2 bg-[#121214] border border-white/10 rounded-lg text-gray-400 hover:text-white transition">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.deleteScript('${s.script_id}')" class="p-2 bg-[#121214] border border-white/10 rounded-lg text-red-500 hover:bg-red-500 hover:border-red-500 hover:text-white transition">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </td>
                    </tr>`;
        }).join('');
        if(window.lucide) lucide.createIcons();
    } catch(e) { window.showToast("Failed to load scripts.", "error"); }
}

window.openEditScriptWrapper = function(id, name, b64Code, obfuscator) {
    try {
        const decodedName = unescape(name);
        const decodedCode = decodeURIComponent(escape(atob(b64Code)));
        document.getElementById('editScriptId').value = id;
        document.getElementById('newScriptName').value = decodedName;
        document.getElementById('newScriptCode').value = decodedCode;
        document.getElementById('scriptModalTitle').innerText = "Edit Script";
        
        const obfRadios = document.querySelectorAll('input[name="obfuscator"]');
        obfRadios.forEach(r => { if(r.value === obfuscator) r.checked = true; });
        
        window.toggleModal('scriptModal');
    } catch (e) { window.showToast("Failed to load script for editing.", "error"); }
};

window.saveScript = async function() {
    const idEl = document.getElementById('editScriptId');
    const nameEl = document.getElementById('newScriptName');
    const codeEl = document.getElementById('newScriptCode');
    const obfEl = document.querySelector('input[name="obfuscator"]:checked');
    
    if(!nameEl || !codeEl || !nameEl.value || !codeEl.value) return window.showToast("Name and Code are required.", "error");
    
    const id = idEl ? idEl.value : "";
    const obf = obfEl ? obfEl.value : 'none';
    const script_content = codeEl.value;
    
    try { 
        const res = await window.apiFetch(id ? `/api/hubs/${currentHubId}/scripts/${id}` : `/api/hubs/${currentHubId}/scripts`, { 
            method: id ? 'PUT' : 'POST', 
            body: JSON.stringify({ name: nameEl.value, code: script_content, obfuscator: obf }) 
        }); 
        const data = await res.json();
        
        if(data.error) return window.showToast(data.error, "error");
        
        window.toggleModal('scriptModal'); 
        window.loadScripts(); 
        window.showToast("Script saved!");
    } catch(e) { window.showToast("Failed to save script.", "error"); }
}

window.toggleKillSwitch = async function(scriptId) {
    try {
        const res = await window.apiFetch(`/api/hubs/${currentHubId}/scripts/${scriptId}/toggle`, { method: 'PUT' });
        if ((await res.json()).success) { 
            window.showToast("Kill Switch Toggled!"); 
            window.loadScripts(); 
        }
    } catch (e) { window.showToast("Failed to toggle script.", "error"); }
}

window.handleScriptFileUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) return window.showToast("File is too large. Max 50MB.", "error");
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('newScriptCode').value = e.target.result;
        const nameInput = document.getElementById('newScriptName');
        
        if (!nameInput.value) nameInput.value = file.name.replace(/\.[^/.]+$/, ""); 
        window.showToast("File loaded successfully!");
    };
    reader.readAsText(file);
    event.target.value = '';
};

window.renameHub = async function () {
  const el = document.getElementById("settingHubName");
  if (!el || !el.value) return window.showToast("Name is required.", "error");
  try {
    await window.apiFetch(`/api/hubs/${currentHubId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: el.value }),
    });
    const hn = document.getElementById("active-hub-name");
    if (hn) hn.innerText = el.value;
    window.showToast("Hub renamed successfully!");
    window.loadHubs();
  } catch (e) {
    window.showToast("Failed to rename hub.", "error");
  }
};

window.deleteHub = async function () {
  if (
    await window.showConfirm(
      "Delete Hub",
      "Are you absolutely sure you want to permanently delete this Hub and all of its data?",
      "Delete Hub",
    )
  ) {
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}`, { method: "DELETE" });
      window.showSection("hubs");
      window.loadHubs();
      window.showToast("Hub deleted.");
      window.loadUserProfile();
    } catch (e) {
      window.showToast("Failed to delete hub.", "error");
    }
  }
};

window.deleteHubCard = async function (id) {
  if (
    await window.showConfirm(
      "Delete Hub",
      "Are you absolutely sure you want to permanently delete this Hub?",
      "Delete Hub",
    )
  ) {
    try {
      await window.apiFetch(`/api/hubs/${id}`, { method: "DELETE" });
      window.loadHubs();
      window.showToast("Hub deleted.");
      window.loadUserProfile();
    } catch (e) {
      window.showToast("Failed to delete hub.", "error");
    }
  }
};

window.saveWebhook = async function () {
  const url = document.getElementById("setupWebhookUrl").value;
  try {
    const res = await window.apiFetch(`/api/hubs/${currentHubId}/webhook`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_url: url }),
    });
    const data = await res.json();
    if (data.error) return window.showToast(data.error, "error");
    window.showToast("Discord Webhook saved successfully!");
  } catch (e) {
    window.showToast("Webhook save failed.", "error");
  }
};

window.copyLoaderCode = function (scriptId) {
  const host = window.location.origin.includes("localhost")
    ? "http://localhost:3000"
    : window.location.origin;
    
  const code = 
`getgenv().kymor_key = "PASTE_YOUR_KEY_HERE"

local KymorSDK = loadstring(game:HttpGet("${host}/sdk/library.lua"))()
KymorSDK.script_id = "${scriptId}"

local status = KymorSDK.check_key(getgenv().kymor_key)

if status.code == "KEY_VALID" then 
    KymorSDK.load_script() 
else 
    game.Players.LocalPlayer:Kick("Auth Error: " .. tostring(status.message)) 
end`;

  window.copyToClipboard(code, "Loader script copied to clipboard!");
};

window.openAddScript = function () {
  if (document.getElementById("scriptModalTitle"))
    document.getElementById("scriptModalTitle").innerText = "Store Script";
  if (document.getElementById("editScriptId"))
    document.getElementById("editScriptId").value = "";
  if (document.getElementById("newScriptName"))
    document.getElementById("newScriptName").value = "";
  if (document.getElementById("newScriptCode"))
    document.getElementById("newScriptCode").value = "";
  const noneRadio = document.querySelector(
    'input[name="obfuscator"][value="none"]',
  );
  if (noneRadio) noneRadio.checked = true;
  window.toggleModal("scriptModal");
};

window.openEditScript = function (id, name, code, obf) {
  if (document.getElementById("scriptModalTitle"))
    document.getElementById("scriptModalTitle").innerText = "Edit Script";
  if (document.getElementById("editScriptId"))
    document.getElementById("editScriptId").value = id;
  if (document.getElementById("newScriptName"))
    document.getElementById("newScriptName").value = name;
  if (document.getElementById("newScriptCode"))
    document.getElementById("newScriptCode").value = code;
  const obfRadio = document.querySelector(
    `input[name="obfuscator"][value="${obf}"]`,
  );
  if (obfRadio) obfRadio.checked = true;
  window.toggleModal("scriptModal");
};

window.deleteScript = async function (id) {
  if (
    await window.showConfirm(
      "Delete Script",
      "Are you sure you want to delete this script?",
    )
  ) {
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}/scripts/${id}`, {
        method: "DELETE",
      });
      window.loadScripts();
      window.showToast("Script deleted.");
    } catch (e) {
      window.showToast("Failed to delete.", "error");
    }
  }
};

window.loadKeys = async function () {
  try {
    const keysRes = await window.apiFetch(`/api/hubs/${currentHubId}/keys`);
    activeKeys = await keysRes.json();
    
    const scriptsRes = await window.apiFetch(`/api/hubs/${currentHubId}/scripts`);
    activeScripts = await scriptsRes.json();
    
    const searchIn = document.getElementById("searchKeysInput");
    if(searchIn) searchIn.value = "";
    
    window.renderKeysList(activeKeys);

    const bindEls = [document.getElementById("genKeyBind"), document.getElementById("bulkBind")];
    bindEls.forEach((el) => {
      if (el) el.innerHTML = '<option value="">All Scripts (Global Key)</option>' + activeScripts.map((s) => `<option value="${s.script_id}">${s.name}</option>`).join("");
    });
  } catch (e) {
    console.error(e);
  }
};

window.searchKeys = function() {
  const query = document.getElementById("searchKeysInput").value.toLowerCase();
  if (!query) return window.renderKeysList(activeKeys);
  
  const filtered = activeKeys.filter(k => 
    (k.key_string && k.key_string.toLowerCase().includes(query)) ||
    (k.note && k.note.toLowerCase().includes(query)) ||
    (k.hwid && k.hwid.toLowerCase().includes(query)) ||
    (k.status && k.status.toLowerCase().includes(query))
  );
  window.renderKeysList(filtered);
};

window.renderKeysList = function(keysArray) {
  const container = document.getElementById("keys-container");
  if (!container) return;

  if (keysArray.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-gray-500">No keys match this search.</td></tr>';
    return;
  }

  const now = new Date().getTime();
  container.innerHTML = keysArray.map((k) => {
    const isBanned = k.status === "BANNED";
    const isExpired = k.expires_at && now > new Date(k.expires_at).getTime();
    const lockIcon = k.hwid ? `<i data-lucide="lock" class="w-3 h-3 inline mr-1 text-green-500"></i>` : `<i data-lucide="unlock" class="w-3 h-3 inline mr-1 text-gray-400"></i>`;
    const hwidStatus = k.hwid ? `<span class="text-green-500 truncate max-w-[120px] inline-block align-bottom">${k.hwid}</span>` : k.non_hwid ? `<span class="text-gray-400">Shareable</span>` : `<span class="text-gray-400">Unused</span>`;
    
    let bindBadge = `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest mt-1.5 inline-block">Global Key</span>`;
    
    if (k.bound_script_id) {
        const boundScript = activeScripts.find(s => s.script_id === k.bound_script_id);
        const scriptName = boundScript ? boundScript.name : "Deleted Script";
        bindBadge = `<span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest mt-1.5 inline-block truncate max-w-[120px]" title="${scriptName}">Bound: ${scriptName}</span>`;
    }

    let durationText = "Lifetime";
    if (k.expires_at) {
        const d = new Date(k.expires_at);
        durationText = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    let statusText = "Active";
    let statusColor = "text-green-500";
    let statusBg = "bg-green-500";

    if (isBanned) {
        statusText = "Banned"; statusColor = "text-red-500"; statusBg = "bg-red-500";
    } else if (isExpired) {
        statusText = "Expired"; statusColor = "text-orange-500"; statusBg = "bg-orange-500";
    }

    return `<tr class="border-b border-white/5 hover:bg-white/5 transition">
        <td class="py-4 px-4 font-mono text-[#14b8a6] font-bold text-xs">
            <span class="cursor-pointer hover:underline" onclick="window.copyToClipboard('${k.key_string}', 'Key Copied!')">${k.key_string}</span>
            <br>${bindBadge}
        </td>
        <td class="py-4 px-4 text-xs text-gray-300 font-medium"><span class="truncate block max-w-[150px]">${window.escapeHtml(k.note) || "Mass Generated"}</span><span class="text-gray-500 font-normal">${durationText}</span></td>
        <td class="py-4 px-4 text-xs text-green-500 font-bold">${lockIcon}${hwidStatus}<br><span class="text-gray-500 font-normal">${k.executions} execs</span></td>
        <td class="py-4 px-4"><span class="flex items-center text-xs font-bold ${statusColor}"><span class="w-2 h-2 rounded-full mr-2 ${statusBg}"></span>${statusText}</span></td>
        <td class="py-4 px-4 text-right flex justify-end gap-2 items-center h-full">
          <button onclick="window.keyAction('${k._id}', '${isBanned ? "unban" : "ban"}')" class="w-8 h-8 rounded-lg bg-[#121214] border border-white/10 text-gray-400 hover:text-orange-400 hover:border-orange-400/50 transition flex items-center justify-center" title="${isBanned ? 'Unban Key' : 'Ban Key'}"><i data-lucide="slash" class="w-4 h-4"></i></button>
          <button onclick="window.keyAction('${k._id}', 'reset_hwid')" class="w-8 h-8 rounded-lg bg-[#121214] border border-white/10 text-gray-400 hover:text-blue-400 hover:border-blue-400/50 transition flex items-center justify-center" title="Reset HWID"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
          <button onclick="window.deleteKey('${k._id}')" class="w-8 h-8 rounded-lg bg-[#121214] border border-white/10 text-red-500 hover:bg-red-500 hover:border-red-500 hover:text-white transition flex items-center justify-center" title="Delete Key"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td>
    </tr>`;
  }).join("");
  
  if (window.lucide) lucide.createIcons();
};

window.openGenerateKeys = function () {
  if (document.getElementById("genKeyAmount"))
    document.getElementById("genKeyAmount").value = 1;
  if (document.getElementById("genKeyDuration"))
    document.getElementById("genKeyDuration").value = "Lifetime";
  if (document.getElementById("genKeyCustom"))
    document.getElementById("genKeyCustom").value = "";
  if (document.getElementById("genKeyNote"))
    document.getElementById("genKeyNote").value = "";
  if (document.getElementById("genKeyBind"))
    document.getElementById("genKeyBind").value = "";
  if (document.getElementById("genKeyNonHwid"))
    document.getElementById("genKeyNonHwid").checked = false;
  window.toggleModal("generateKeysModal");
};

window.executeGenerateKeys = async function () {
  const amtEl = document.getElementById("genKeyAmount");
  const durValEl = document.getElementById("genKeyDurationVal");
  const durUnitEl = document.getElementById("genKeyDurationUnit");
  const bindEl = document.getElementById("genKeyBind");
  const nonHwEl = document.getElementById("genKeyNonHwid");
  const noteEl = document.getElementById("genKeyNote");
  const customEl = document.getElementById("genKeyCustom");

  const amount = amtEl ? parseInt(amtEl.value) || 1 : 1;
  const custom_key = customEl ? customEl.value.trim() : "";

  const durVal = durValEl && durValEl.value ? parseInt(durValEl.value) || 0 : 0;
  const durUnit = durUnitEl ? parseInt(durUnitEl.value) || 1 : 1;
  const duration_seconds = durVal * durUnit;

  const body = {
    amount: amount,
    duration_seconds: duration_seconds,
    bound_script_id: bindEl ? bindEl.value : null,
    non_hwid: nonHwEl ? nonHwEl.checked : false,
    note: noteEl ? noteEl.value : "",
    custom_key: custom_key,
  };

  try {
    const res = await window.apiFetch(
      `/api/hubs/${currentHubId}/keys/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (data.error) return window.showToast(data.error, "error");

    window.toggleModal("generateKeysModal");
    window.loadKeys();

    if (custom_key) {
      window.showToast("Custom Key Generated!");
    } else {
      window.showToast(`${amount} Key(s) Generated!`);
    }
  } catch (e) {
    window.showToast("Key generation failed.", "error");
  }
};

window.executeBulkGenerate = async function () {
  const amtEl = document.getElementById("bulkAmount");
  const durValEl = document.getElementById("bulkDurationVal");
  const durUnitEl = document.getElementById("bulkDurationUnit");
  const bindEl = document.getElementById("bulkBind");
  const nonHwEl = document.getElementById("bulkNonHwid");

  const amount = amtEl ? parseInt(amtEl.value) || 1 : 1;
  
  const durVal = durValEl && durValEl.value ? parseInt(durValEl.value) || 0 : 0;
  const durUnit = durUnitEl ? parseInt(durUnitEl.value) || 1 : 1;
  const duration_seconds = durVal * durUnit;

  const body = {
    amount: amount,
    duration_seconds: duration_seconds,
    bound_script_id: bindEl ? bindEl.value : null,
    non_hwid: nonHwEl ? nonHwEl.checked : false,
    note: "Mass Generated",
  };
  
  try {
    const res = await window.apiFetch(
      `/api/hubs/${currentHubId}/keys/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json();
    if (data.error) return window.showToast(data.error, "error");
    
    window.toggleModal("bulkKeysModal");
    window.loadKeys();
    window.showToast(`${amount} Key(s) Generated!`);
  } catch (e) {
    window.showToast("Key generation failed.", "error");
  }
};

window.keyAction = async function (id, action) {
  try {
    await window.apiFetch(`/api/keys/${id}/action`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    window.loadKeys();
    window.showToast("Key updated.");
  } catch (e) {
    window.showToast("Failed to update key.", "error");
  }
};

window.deleteKey = async function (id) {
  if (
    await window.showConfirm(
      "Delete Key",
      "Are you sure you want to delete this key?",
    )
  ) {
    try {
      await window.apiFetch(`/api/keys/${id}`, { method: "DELETE" });
      window.loadKeys();
      window.showToast("Key deleted.");
    } catch (e) {
      window.showToast("Failed to delete key.", "error");
    }
  }
};

window.deleteUnusedKeys = async function () {
  if (
    await window.showConfirm(
      "Delete Unused Keys",
      "Are you sure you want to delete ALL unused keys?",
    )
  ) {
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}/keys/unused`, {
        method: "DELETE",
      });
      window.loadKeys();
      window.showToast("Unused keys deleted.");
    } catch (e) {
      window.showToast("Failed to delete keys.", "error");
    }
  }
};

window.exportKeys = async function(format) {
    try {
        const btn = event.currentTarget;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Exporting...`;
        lucide.createIcons({ root: btn });

        const res = await window.apiFetch(`/api/hubs/${currentHubId}/keys`);
        const keys = await res.json();
        
        btn.innerHTML = originalHtml;
        lucide.createIcons({ root: btn });

        if (!keys || keys.length === 0) {
            return window.showToast("No keys found to export.", "error");
        }

        const unusedKeys = keys.filter(k => !k.hwid && k.status !== 'BANNED');
        const usedKeys = keys.filter(k => k.hwid || k.status === 'BANNED');

        if (format === 'txt') {
            if (unusedKeys.length > 0) {
                const unusedText = unusedKeys.map(k => k.key_string).join('\n');
                downloadExportFile(`unused_keys_${currentHubId}.txt`, unusedText, 'text/plain');
            }
            if (usedKeys.length > 0) {
                setTimeout(() => {
                    const usedText = usedKeys.map(k => k.key_string).join('\n');
                    downloadExportFile(`used_keys_${currentHubId}.txt`, usedText, 'text/plain');
                }, 400);
            }
            window.showToast(`Exported ${unusedKeys.length} Unused & ${usedKeys.length} Used keys!`);
        } else if (format === 'json') {
            const combinedKeys = [...unusedKeys, ...usedKeys];
            const jsonText = JSON.stringify(combinedKeys, null, 2);
            downloadExportFile(`hub_keys_backup_${currentHubId}.json`, jsonText, 'application/json');
            window.showToast("Full Key Backup Exported!");
        }
    } catch (e) {
        window.showToast("Export failed.", "error");
    }
};

function downloadExportFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.importKeys = function (event) {
  const btn = event ? event.currentTarget : null;
  let originalHtml = "";
  if (btn) {
    originalHtml = btn.innerHTML;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (btn) {
      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> IMPORTING...`;
      btn.disabled = true;
      btn.classList.add("opacity-50", "cursor-wait");
      lucide.createIcons({ root: btn });
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const keys = JSON.parse(ev.target.result);
        const res = await window.apiFetch(
          `/api/hubs/${currentHubId}/keys/import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keys }),
          },
        );
        const data = await res.json();
        
        if (btn) {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
          btn.classList.remove("opacity-50", "cursor-wait");
          lucide.createIcons({ root: btn });
        }

        if (data.success) {
          window.showToast(`Successfully imported ${data.imported} keys!`);
          window.toggleModal("bulkKeysModal");
          window.loadKeys();
        } else {
          window.showToast(data.error || "Failed to import keys", "error");
        }
      } catch (err) {
        if (btn) {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
          btn.classList.remove("opacity-50", "cursor-wait");
          lucide.createIcons({ root: btn });
        }
        window.showToast("Invalid JSON file formatting", "error");
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
};

window.viewGiftKeys = async function () {
  const container = document.getElementById("giftKeysContainer");
  if (container.classList.contains("hidden")) {
    container.classList.remove("hidden");
    container.innerHTML = `<div class="text-center text-gray-500 text-xs py-4 flex flex-col items-center gap-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Loading keys...</div>`;
    if (window.lucide) lucide.createIcons({ root: container });

    try {
      const res = await window.apiFetch("/api/user/gift-keys");
      const keys = await res.json();

      if (keys.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 text-xs py-4">You haven't purchased any gift keys yet.</div>`;
      } else {
        container.innerHTML = keys
          .map(
            (k) => `
                    <div class="flex justify-between items-center bg-[#121214] p-3 rounded-lg border border-white/5">
                        <div>
                            <p class="text-xs font-mono font-bold ${k.used ? "text-gray-500 line-through" : "text-[#14b8a6]"}">${k.key_string}</p>
                            <p class="text-[9px] text-gray-500 uppercase mt-0.5 tracking-widest font-bold">${k.used ? "Redeemed" : "Unused"}</p>
                        </div>
                        <button onclick="window.copyToClipboard('${k.key_string}', 'Gift Key Copied!')" class="p-2 bg-[#050505] border border-white/10 rounded-md text-gray-400 hover:text-white transition shadow-sm">
                            <i data-lucide="copy" class="w-3 h-3"></i>
                        </button>
                    </div>
                `,
          )
          .join("");
        if (window.lucide) lucide.createIcons({ root: container });
      }
    } catch (e) {
      container.innerHTML = `<div class="text-center text-red-500 text-xs py-4">Failed to load keys.</div>`;
    }
  } else {
    container.classList.add("hidden");
  }
};

window.loadSessions = async function () {
  try {
    const res = await window.apiFetch(
      `/api/hubs/${currentHubId}/rewards/sessions`,
    );
    currentRewardSessions = await res.json();

    const sessionContainer = document.getElementById("sessions-container");
    if (sessionContainer) {
      sessionContainer.innerHTML =
        currentRewardSessions
          .map((s) => {
            const time = new Date(s.last_active).toLocaleString();
            const keyEarned = s.key_earned
              ? `<span class="text-green-500 font-mono text-xs">${s.key_earned}</span>`
              : `<span class="text-gray-600">-</span>`;
            return `<tr class="border-b border-white/5 hover:bg-white/5 transition">
                    <td class="py-4 px-4 text-gray-400 font-mono text-xs">${s.session_id.substring(0, 8)}...</td>
                    <td class="py-4 px-4 text-gray-400 font-mono text-xs">${s.ip || "Unknown"}</td>
                    <td class="py-4 px-4 text-white font-bold">${s.progress}</td>
                    <td class="py-4 px-4">${keyEarned}</td>
                    <td class="py-4 px-4 text-right text-gray-500 text-xs">${time}</td>
                </tr>`;
          })
          .join("") ||
        '<tr><td colspan="5" class="py-6 text-center text-gray-500">No sessions found.</td></tr>';
    }

    const totalCheckpoints = activeCheckpoints.length;
    const totalVisitors = currentRewardSessions.length;
    const completedSessions = currentRewardSessions.filter(
      (s) => s.key_earned || s.progress >= totalCheckpoints,
    ).length;

    if (document.getElementById("stat-registered-visitors"))
      document.getElementById("stat-registered-visitors").innerText =
        totalVisitors.toLocaleString();
    if (document.getElementById("stat-total-checkpoints"))
      document.getElementById("stat-total-checkpoints").innerText =
        totalCheckpoints.toLocaleString();

    if (document.getElementById("stat-visitors-text")) {
      document.getElementById("stat-visitors-text").innerText =
        `${completedSessions}/${totalVisitors} Completed`;
      const visitorPct =
        totalVisitors > 0 ? (completedSessions / totalVisitors) * 100 : 0;
      document.getElementById("stat-visitors-bar").style.width =
        `${visitorPct}%`;
    }

    if (document.getElementById("stat-checkpoints-text")) {
      document.getElementById("stat-checkpoints-text").innerText =
        `${totalCheckpoints} Active Steps`;
      document.getElementById("stat-checkpoints-bar").style.width =
        totalCheckpoints > 0 ? `100%` : `0%`;
    }

    window.renderCheckpoints();
    window.renderRewardsGraph();
  } catch (e) {
    console.error(e);
  }
};

window.renderCheckpoints = function () {
  const host = window.location.origin.includes("localhost")
    ? "http://localhost:3000"
    : window.location.origin;
  const container = document.getElementById("checkpoints-container");
  if (!container) return;

  if (activeCheckpoints.length === 0) {
    container.innerHTML =
      '<tr><td colspan="6" class="p-6 text-center text-gray-500">No checkpoints added yet.</td></tr>';
    return;
  }

  container.innerHTML = activeCheckpoints
    .map((c, i) => {
      const isLootlabs = c.provider === "Lootlabs";
      const isWorkInk = c.provider === "Work.Ink";
      const isShrtFly = c.provider === "ShrtFly";
      const hasToken = c.api_token && c.api_token.trim() !== "";
      const stepNum = i + 1;

      let providerHtml = `<div class="flex items-center gap-2 mb-1">
                 <div class="w-6 h-6 rounded bg-[#1a1a1c] flex items-center justify-center shrink-0 border border-white/5"><i data-lucide="link" class="w-3 h-3 text-[#14b8a6]"></i></div>
                 <span class="font-bold text-sm text-white">${c.provider}</span>
                 <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${hasToken ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}">API Token ${hasToken ? "SET" : "MISSING"}</span>
               </div>`;

      const shortUrlDisplay =
        c.short_url && c.short_url.trim() !== ""
          ? `<span class="text-gray-500 font-mono text-xs truncate max-w-[200px] block">${c.short_url}</span>`
          : `<span class="text-orange-400 text-[10px] font-bold px-2 py-1 bg-orange-400/10 border border-orange-400/20 rounded">AUTO-GENERATED</span>`;

      let setupHtml = "";
      const backendTargetUrl = `${host}/api/rewards/${currentHubId}/postback/${c.provider.toLowerCase()}?step=${stepNum}`;
      
      if (isLootlabs || isWorkInk || isShrtFly) {
        setupHtml = `<div class="text-gray-500 text-[10px] mb-1">Set as <strong>Destination/Postback URL</strong> in Dashboard:</div>
                         <div class="flex items-center gap-2">
                             <code class="text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded font-mono text-[11px] select-all border border-green-400/20">${backendTargetUrl}</code>
                             <button onclick="window.copyToClipboard('${backendTargetUrl}', 'URL Copied!')" class="p-1 hover:bg-[#1a1a1c] rounded transition text-gray-400 hover:text-white border border-white/10"><i data-lucide="copy" class="w-3 h-3"></i></button>
                         </div>`;
      } else {
        setupHtml = `<div class="text-gray-500 text-[10px] mb-1">Set as <strong>Target URL</strong> in Linkvertise:</div>
                         <div class="flex items-center gap-2">
                             <code class="text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded font-mono text-[11px] select-all border border-green-400/20">${backendTargetUrl}</code>
                             <button onclick="window.copyToClipboard('${backendTargetUrl}', 'Target URL Copied!')" class="p-1 hover:bg-[#1a1a1c] rounded transition text-gray-400 hover:text-white border border-white/10"><i data-lucide="copy" class="w-3 h-3"></i></button>
                         </div>`;
      }

      // NEW: Pull directly from the database tracking we added
      const completedThisStep = c.completed_count || 0;
      const cancelledThisStep = c.cancelled_count || 0;
      const reachedThisStep = completedThisStep + cancelledThisStep;

      const compPct =
        reachedThisStep > 0
          ? Math.round((completedThisStep / reachedThisStep) * 100)
          : 0;
      const cancPct = reachedThisStep > 0 ? 100 - compPct : 0;

      let totalStepTime = 0;
      let stepCompletions = 0;

      currentRewardSessions.forEach((s) => {
        if (s.step_times && s.step_times[i] !== undefined) {
          totalStepTime += s.step_times[i];
          stepCompletions++;
        }
      });

      let avgTimeText = "0 sec.";
      if (stepCompletions > 0) {
        const avgSeconds = Math.round(totalStepTime / stepCompletions);
        const m = Math.floor(avgSeconds / 60);
        const s = avgSeconds % 60;
        if (m > 0) {
          avgTimeText = `${m} min. ${s} sec.`;
        } else {
          avgTimeText = `${s} sec.`;
        }
      }

      return `<tr class="border-b border-white/5 hover:bg-white/5 transition">
            <td class="py-4 px-4 font-black text-white">${stepNum}</td>
            <td class="py-4 px-4 min-w-[250px]">${providerHtml}${shortUrlDisplay}</td>
            <td class="py-4 px-4 min-w-[300px]">${setupHtml}</td>
            <td class="py-4 px-4">
                <p class="text-xs font-bold mb-1.5"><span class="text-green-500">${completedThisStep.toLocaleString()}</span> <span class="text-gray-600">/</span> <span class="text-red-500">${cancelledThisStep.toLocaleString()}</span></p>
                <div class="flex w-32 md:w-40 h-1.5 bg-[#050505] border border-white/5 rounded-full overflow-hidden shadow-inner">
                    <div class="bg-green-500 h-full shadow-[0_0_5px_rgba(34,197,94,0.5)] transition-all duration-500" style="width: ${compPct}%;"></div>
                    <div class="bg-red-500 h-full shadow-[0_0_5px_rgba(239,68,68,0.5)] transition-all duration-500" style="width: ${cancPct}%;"></div>
                </div>
            </td>
            <td class="py-4 px-4">
                <span class="text-xs font-bold text-gray-300 bg-[#121214] px-2.5 py-1 rounded-md border border-white/5 flex items-center gap-1.5 w-max shadow-sm">
                    <i data-lucide="hourglass" class="w-3 h-3 text-yellow-500"></i> ${avgTimeText}
                </span>
            </td>
            <td class="py-4 px-4 text-right">
                <div class="flex justify-end gap-1.5 mb-2">
                    <button onclick="window.moveCheckpoint(${i}, -1)" ${i === 0 ? 'disabled class="opacity-30 cursor-not-allowed p-1.5"' : 'class="p-1.5 bg-[#121214] border border-white/10 hover:border-white/30 rounded-md text-gray-400 transition shadow-sm"'}><i data-lucide="arrow-up" class="w-3.5 h-3.5"></i></button>
                    <button onclick="window.moveCheckpoint(${i}, 1)" ${i === activeCheckpoints.length - 1 ? 'disabled class="opacity-30 cursor-not-allowed p-1.5"' : 'class="p-1.5 bg-[#121214] border border-white/10 hover:border-white/30 rounded-md text-gray-400 transition shadow-sm"'}><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
                </div>
                <div class="flex justify-end gap-2">
                    <button onclick="window.openCheckpointModal(${i})" class="bg-[#121214] border border-[#14b8a6]/20 text-[#14b8a6] hover:bg-[#14b8a6]/10 px-2 py-1.5 rounded-md text-[10px] font-bold transition flex items-center gap-1.5 shadow-sm"><i data-lucide="edit-2" class="w-3 h-3"></i> EDIT</button>
                    <button onclick="window.deleteCheckpoint(${i})" class="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 px-2 py-1.5 rounded-md text-[10px] font-bold transition flex items-center gap-1.5 shadow-sm"><i data-lucide="trash-2" class="w-3 h-3"></i> DELETE</button>
                </div>
            </td>
        </tr>`;
    })
    .join("");

  if (window.lucide) lucide.createIcons();
};

window.renderRewardsGraph = function () {
  const canvas = document.getElementById("rewardsGraphCanvas");
  if (!canvas) return;

  const completedPerDay = {};
  const cancelledPerDay = {};
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    completedPerDay[label] = 0;
    cancelledPerDay[label] = 0;
  }

  currentRewardSessions.forEach((session) => {
    const sessionDate = new Date(session.last_active);
    if (now - sessionDate <= 7 * 24 * 60 * 60 * 1000) {
      const label = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}`;
      if (completedPerDay[label] !== undefined) {
        if (
          session.key_earned ||
          session.progress >= activeCheckpoints.length
        ) {
          completedPerDay[label]++;
        } else {
          cancelledPerDay[label]++;
        }
      }
    }
  });

  const ctx = canvas.getContext("2d");
  if (rewardsChartInstance) rewardsChartInstance.destroy();

  rewardsChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(completedPerDay),
      datasets: [
        {
          label: "Completed",
          data: Object.values(completedPerDay),
          backgroundColor: "#22c55e",
          borderRadius: 2,
          barPercentage: 0.6,
          categoryPercentage: 0.4,
        },
        {
          label: "Dropped Off",
          data: Object.values(cancelledPerDay),
          backgroundColor: "#ef4444",
          borderRadius: 2,
          barPercentage: 0.6,
          categoryPercentage: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255, 255, 255, 0.05)", drawBorder: false },
          ticks: { color: "#9ca3af", font: { size: 10 }, precision: 0 },
        },
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: "#9ca3af", font: { size: 10 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#121214",
          titleColor: "#fff",
          bodyColor: "#9ca3af",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          padding: 10,
        },
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
    },
  });
};

function populateTimeInput(totalSecs, valId, unitId) {
    if (!totalSecs || totalSecs === 0) {
        document.getElementById(valId).value = 0;
        document.getElementById(unitId).value = "3600"; 
    } else if (totalSecs >= 604800 && totalSecs % 604800 === 0) {
        document.getElementById(valId).value = totalSecs / 604800;
        document.getElementById(unitId).value = "604800"; 
    } else if (totalSecs >= 86400 && totalSecs % 86400 === 0) {
        document.getElementById(valId).value = totalSecs / 86400;
        document.getElementById(unitId).value = "86400"; 
    } else if (totalSecs >= 3600 && totalSecs % 3600 === 0) {
        document.getElementById(valId).value = totalSecs / 3600;
        document.getElementById(unitId).value = "3600"; 
    } else if (totalSecs >= 60 && totalSecs % 60 === 0) {
        document.getElementById(valId).value = totalSecs / 60;
        document.getElementById(unitId).value = "60"; 
    } else {
        document.getElementById(valId).value = totalSecs;
        document.getElementById(unitId).value = "60"; 
    }
}

function parseTimeInput(valId, unitId) {
    const valInput = document.getElementById(valId);
    const unitInput = document.getElementById(unitId);
    let rawVal = 0;
    
    if (valInput && valInput.value.trim() !== "") {
        rawVal = parseInt(valInput.value);
        if (isNaN(rawVal)) rawVal = 0;
    }
    
    const multiplier = unitInput && unitInput.value ? parseInt(unitInput.value) : 1;
    return rawVal * multiplier;
}

window.saveRewardsConfig = async function (event) {
    if (event) event.preventDefault();
    
    const payload = {
        enabled: document.getElementById("rewEnabled") ? document.getElementById("rewEnabled").checked : false,
        enable_free_keys: document.getElementById("rewFree") ? document.getElementById("rewFree").checked : false,
        key_duration_seconds: parseTimeInput("rewBaseDurationVal", "rewBaseDurationUnit"),
        add_time_seconds: parseTimeInput("rewAddTimeVal", "rewAddTimeUnit"),
        max_time_seconds: parseTimeInput("rewMaxTimeVal", "rewMaxTimeUnit"),
        cooldown_seconds: parseTimeInput("rewCooldownVal", "rewCooldownUnit"),
        checkpoint_timeout_mins: document.getElementById("rewTimeout") ? parseInt(document.getElementById("rewTimeout").value) || 70 : 70,
        max_keys: document.getElementById("rewMaxKeys") ? parseInt(document.getElementById("rewMaxKeys").value) || 2 : 2,
        allow_browser_reset: document.getElementById("rewReset") ? document.getElementById("rewReset").checked : true,
    };
    
    try {
        let btn, originalHtml;
        if (event && event.currentTarget) {
            btn = event.currentTarget;
            originalHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
            lucide.createIcons({ root: btn });
        }

        const res = await window.apiFetch(`/api/hubs/${currentHubId}/rewards/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        
        const data = await res.json();
        
        if (btn) {
            btn.innerHTML = originalHtml;
            lucide.createIcons({ root: btn });
        }

        if (data.error) return window.showToast(data.error, "error");
        window.showToast("Rewards configuration saved!");
    } catch (e) {
        window.showToast("Failed to save rewards.", "error");
    }
};

window.loadRewards = async function () {
    try {
        const hubs = await (await window.apiFetch("/api/hubs")).json();
        const h = hubs.find((x) => x.short_id === currentHubId);
        if (!h.rewards) h.rewards = { checkpoints: [] };

        if (document.getElementById("rewEnabled")) document.getElementById("rewEnabled").checked = h.rewards.enabled;
        if (document.getElementById("rewFree")) document.getElementById("rewFree").checked = h.rewards.enable_free_keys;
        if (document.getElementById("rewTimeout")) document.getElementById("rewTimeout").value = h.rewards.checkpoint_timeout_mins || 70;
        if (document.getElementById("rewMaxKeys")) document.getElementById("rewMaxKeys").value = h.rewards.max_keys || 2;
        if (document.getElementById("rewReset")) document.getElementById("rewReset").checked = h.rewards.allow_browser_reset !== false;

        populateTimeInput(h.rewards.key_duration_seconds, "rewBaseDurationVal", "rewBaseDurationUnit");
        populateTimeInput(h.rewards.add_time_seconds, "rewAddTimeVal", "rewAddTimeUnit");
        populateTimeInput(h.rewards.max_time_seconds, "rewMaxTimeVal", "rewMaxTimeUnit");
        populateTimeInput(h.rewards.cooldown_seconds, "rewCooldownVal", "rewCooldownUnit");

        const host = window.location.origin.includes("localhost") ? "http://localhost:3000" : window.location.origin;
        if (document.getElementById("rewUrl")) document.getElementById("rewUrl").value = `${host}/reward/${currentHubId}`;

        activeCheckpoints = h.rewards.checkpoints || [];
        await window.loadSessions();
    } catch (e) {}
};

window.openCheckpointModal = function (index = -1) {
  if (!isPremiumUser) return;
  if (document.getElementById("cpEditIndex"))
    document.getElementById("cpEditIndex").value = index;
  if (index >= 0) {
    if (document.getElementById("cpModalTitle"))
      document.getElementById("cpModalTitle").innerText = "Edit Checkpoint";
    if (document.getElementById("cpProvider"))
      document.getElementById("cpProvider").value =
        activeCheckpoints[index].provider;
    if (document.getElementById("cpUrl"))
      document.getElementById("cpUrl").value =
        activeCheckpoints[index].short_url;
    if (document.getElementById("cpToken"))
      document.getElementById("cpToken").value =
        activeCheckpoints[index].api_token || "";
  } else {
    if (document.getElementById("cpModalTitle"))
      document.getElementById("cpModalTitle").innerText = "Add Checkpoint";
    if (document.getElementById("cpUrl"))
      document.getElementById("cpUrl").value = "";
    if (document.getElementById("cpToken"))
      document.getElementById("cpToken").value = "";
  }
  window.toggleModal("checkpointModal");
};

window.saveCheckpoint = async function () {
  const idxEl = document.getElementById("cpEditIndex");
  if (!idxEl) return;
  const idx = parseInt(idxEl.value);

  const cp = {
    provider: document.getElementById("cpProvider")
      ? document.getElementById("cpProvider").value
      : "Linkvertise",
    short_url: document.getElementById("cpUrl")
      ? document.getElementById("cpUrl").value
      : "",
    api_token: document.getElementById("cpToken")
      ? document.getElementById("cpToken").value
      : "",
  };

  if (idx >= 0) activeCheckpoints[idx] = cp;
  else activeCheckpoints.push(cp);
  try {
    const res = await window.apiFetch(
      `/api/hubs/${currentHubId}/rewards/checkpoints`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoints: activeCheckpoints }),
      },
    );
    const data = await res.json();
    if (data.error) return window.showToast(data.error, "error");
    window.toggleModal("checkpointModal");
    window.renderCheckpoints();
    window.showToast("Checkpoint saved.");
  } catch (e) {
    window.showToast("Failed to save checkpoint.", "error");
  }
};

window.deleteCheckpoint = async function (idx) {
  if (!isPremiumUser) return;
  if (
    await window.showConfirm(
      "Delete Checkpoint",
      "Are you sure you want to delete this checkpoint?",
    )
  ) {
    activeCheckpoints.splice(idx, 1);
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}/rewards/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoints: activeCheckpoints }),
      });
      window.renderCheckpoints();
      window.showToast("Checkpoint deleted.");
    } catch (e) {
      window.showToast("Failed to delete.", "error");
    }
  }
};

window.moveCheckpoint = async function (idx, dir) {
  if (!isPremiumUser) return;
  const temp = activeCheckpoints[idx];
  activeCheckpoints[idx] = activeCheckpoints[idx + dir];
  activeCheckpoints[idx + dir] = temp;
  await window.apiFetch(`/api/hubs/${currentHubId}/rewards/checkpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkpoints: activeCheckpoints }),
  });
  window.renderCheckpoints();
};

window.wipeSessions = async function () {
  if (
    await window.showConfirm(
      "Wipe Sessions",
      "Are you sure you want to wipe all user sessions?",
    )
  ) {
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}/rewards/sessions`, {
        method: "DELETE",
      });
      window.loadSessions();
      window.showToast("Sessions wiped.");
    } catch (e) {
      window.showToast("Failed to wipe.", "error");
    }
  }
};

window.loadBlacklist = async function() {
  try {
    const res = await window.apiFetch(`/api/hubs/${currentHubId}/blacklist`);
    const data = await res.json();
    
    const container = document.getElementById("blacklist-container");
    const countEl = document.getElementById("blacklistCount");
    
    if (countEl) countEl.innerText = `${data.length} Banned`;

    if (!container) return;
    if (data.length === 0) {
      container.innerHTML = '<tr><td colspan="3" class="py-8 text-center text-gray-500 text-xs">No active restrictions.</td></tr>';
      return;
    }

    container.innerHTML = data.map(b => `
      <tr class="border-b border-white/5 hover:bg-white/5 transition">
        <td class="py-4 px-2 font-mono text-red-400 text-xs font-bold">${b.target}</td>
        <td class="py-4 px-2 text-xs text-gray-400 truncate max-w-[200px]">${window.escapeHtml(b.reason)}</td>
        <td class="py-4 px-2 text-right">
          <button onclick="window.removeBlacklist('${b._id}')" class="bg-[#121214] border border-white/10 text-gray-400 hover:text-white hover:border-white/30 px-3 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5 ml-auto shadow-sm">
            <i data-lucide="unlock" class="w-3 h-3"></i> Unban
          </button>
        </td>
      </tr>
    `).join("");
    
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error("Failed to load blacklist");
  }
};

window.addBlacklist = async function() {
  const target = document.getElementById("blacklistTarget").value;
  const reason = document.getElementById("blacklistReason").value;
  
  if(!target) return window.showToast("Identifier is required.", "error");

  try {
    const res = await window.apiFetch(`/api/hubs/${currentHubId}/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, reason })
    });
    
    const data = await res.json();
    if(data.error) return window.showToast(data.error, "error");
    
    document.getElementById("blacklistTarget").value = "";
    document.getElementById("blacklistReason").value = "";
    
    window.showToast("Successfully added to blacklist.");
    window.loadBlacklist();
  } catch (e) {
    window.showToast("Failed to add to blacklist.", "error");
  }
};

window.removeBlacklist = async function(id) {
  if (await window.showConfirm("Remove Restriction", "Are you sure you want to unban this user?", "Unban", false)) {
    try {
      await window.apiFetch(`/api/hubs/${currentHubId}/blacklist/${id}`, { method: "DELETE" });
      window.showToast("User unbanned successfully.");
      window.loadBlacklist();
    } catch (e) {
      window.showToast("Failed to remove from blacklist.", "error");
    }
  }
};

window.escapeHtml = function (text) {
  return (text || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

window.updateLinkDisplay = function (shortId, slug, hubName) {
  const safeName = (hubName || "hub").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const identifier =
    slug && slug.trim() !== "" ? slug : `${safeName}-${shortId}`;
  const host = window.location.origin;
  const publicUrl = `${host}/p/${identifier}`;

  const urlEl = document.getElementById("page-public-url");
  if (urlEl) {
    urlEl.innerText = publicUrl;
    urlEl.href = publicUrl;
  }
};

window.loadPageSettingsToUI = function (hubData) {
  const page = hubData.page || {};

  document.getElementById("pageTitle").value =
    page.title || hubData.name || "My Hub";
  document.getElementById("pageSlug").value = page.slug || "";
  document.getElementById("pageKeyMode").value = page.key_mode || "none";
  document.getElementById("pagePublished").checked = page.published || false;
  document.getElementById("pageBuyLink").value = page.buy_link || "";
  document.getElementById("pageColorHex").value =
    page.accent_color || "#14b8a6";
  document.getElementById("pageColorPicker").value =
    page.accent_color || "#14b8a6";
  document.getElementById("pageDescription").value = page.description || "";

  pageElements = page.elements
    ? JSON.parse(JSON.stringify(page.elements)).map((el, index) => {
        el.id = el.id || el._id || `el_${Date.now()}_${index}`;
        return el;
      })
    : [];

  window.renderPageElements();
  window.updateLinkDisplay(hubData.short_id, page.slug, hubData.name);
};

const ELEMENT_SCHEMAS = {
  hero: {
    icon: "image",
    title: "Hero Section",
    data: { title: "Welcome to Hub", subtitle: "The most powerful script" },
  },
  text: {
    icon: "align-left",
    title: "Text Block",
    data: { heading: "Features", body: "• Fast Autofarm\n• High Security" },
  },
  features: {
    icon: "grid",
    title: "Features List",
    data: { items: "Aimbot, ESP, Fly" },
  },
  image: { icon: "image", title: "Image URL", data: { url: "https://" } },
  loader: {
    icon: "code",
    title: "Loader Source",
    data: { code: 'loadstring(game:HttpGet("..."))()' },
  },
  buy: {
    icon: "shopping-cart",
    title: "Buy Button",
    data: { label: "Purchase Now", url: "https://sellix.io/" },
  },
  key: { icon: "key", title: "Get Key", data: { label: "Get Free Key" } },
  divider: { icon: "minus", title: "Divider", data: {} },
  video: {
    icon: "play",
    title: "Video Link",
    data: { url: "https://youtube.com/..." },
  },
};

window.addPageElement = function (type) {
  const elementLimit = isPremiumUser ? 999 : MAX_ELEMENTS;
  if (pageElements.length >= elementLimit)
    return window.showToast(`Max elements reached (${elementLimit}).`, "error");

  const uniqueId = `el_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const schema = ELEMENT_SCHEMAS[type];
  if (!schema) return;

  pageElements.push({ id: uniqueId, type: type, data: { ...schema.data } });
  window.renderPageElements();
};

window.removePageElement = async function (id) {
  const elToDelete = pageElements.find((e) => e.id === id);
  if (
    elToDelete &&
    elToDelete.type === "image" &&
    elToDelete.data.url &&
    elToDelete.data.url.includes("/uploads/")
  ) {
    try {
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: elToDelete.data.url }),
      });
    } catch (e) {}
  }
  pageElements = pageElements.filter((e) => e.id !== id);
  window.renderPageElements();
};

window.movePageElement = function (id, direction) {
  const idx = pageElements.findIndex((e) => e.id === id);
  if (idx < 0) return;
  if (direction === -1 && idx > 0)
    [pageElements[idx], pageElements[idx - 1]] = [
      pageElements[idx - 1],
      pageElements[idx],
    ];
  else if (direction === 1 && idx < pageElements.length - 1)
    [pageElements[idx], pageElements[idx + 1]] = [
      pageElements[idx + 1],
      pageElements[idx],
    ];
  window.renderPageElements();
};

window.updateElementData = function (id, key, value) {
  const el = pageElements.find((e) => e.id === id);
  if (el) el.data[key] = value;
};

window.renderPageElements = function () {
  const container = document.getElementById("elements-container");
  const countDisplay = document.getElementById("elements-count-display");
  if (countDisplay) {
    if (isPremiumUser) {
      countDisplay.innerText = `${pageElements.length} (Premium)`;
    } else {
      countDisplay.innerText = `${pageElements.length}/${MAX_ELEMENTS} (Free)`;
    }
  }

  if (pageElements.length === 0) {
    container.innerHTML =
      '<div class="text-center py-10 text-gray-500 text-sm italic border border-dashed border-white/10 rounded-xl">No elements yet. Click a button above to add one.</div>';
    return;
  }

  container.innerHTML = pageElements
    .map((el) => {
      const schema = ELEMENT_SCHEMAS[el.type] || {
        icon: "box",
        title: "Block",
      };
      let inputsHtml = "";
      const v = (key) => window.escapeHtml(el.data[key]);

      if (el.type === "buy") {
        inputsHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="url" placeholder="Checkout URL" value="${v("url")}" oninput="window.updateElementData('${el.id}', 'url', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none"><input type="text" placeholder="Button Label" value="${v("label")}" oninput="window.updateElementData('${el.id}', 'label', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none"></div>`;
      } else if (el.type === "key") {
        inputsHtml = `<input type="text" placeholder="Get Key Button Label" value="${v("label")}" oninput="window.updateElementData('${el.id}', 'label', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none">`;
      } else if (el.type === "text") {
        inputsHtml = `<div class="space-y-3"><input type="text" placeholder="Heading" value="${v("heading")}" oninput="window.updateElementData('${el.id}', 'heading', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-sm font-bold shadow-inner focus:border-[#14b8a6] outline-none"><textarea oninput="window.updateElementData('${el.id}', 'body', this.value)" rows="3" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs resize-none shadow-inner focus:border-[#14b8a6] outline-none">${v("body")}</textarea></div>`;
      } else if (el.type === "hero") {
        inputsHtml = `<div class="grid grid-cols-2 gap-4"><input type="text" placeholder="Title" value="${v("title")}" oninput="window.updateElementData('${el.id}', 'title', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-sm font-bold shadow-inner focus:border-[#14b8a6] outline-none"><input type="text" placeholder="Subtitle" value="${v("subtitle")}" oninput="window.updateElementData('${el.id}', 'subtitle', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none"></div>`;
      } else if (el.type === "features") {
        inputsHtml = `<input type="text" placeholder="Features (Separated by commas)" value="${v("items")}" oninput="window.updateElementData('${el.id}', 'items', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none">`;
      } else if (el.type === "image" || el.type === "video") {
        inputsHtml = `<input type="url" placeholder="Direct URL (MP4/PNG/JPG)" value="${v("url")}" oninput="window.updateElementData('${el.id}', 'url', this.value)" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs shadow-inner focus:border-[#14b8a6] outline-none">`;
      } else if (el.type === "loader") {
        inputsHtml = `<textarea oninput="window.updateElementData('${el.id}', 'code', this.value)" rows="3" class="w-full bg-[#050505] border border-white/5 rounded-lg p-3 text-white text-xs font-mono resize-none shadow-inner focus:border-[#14b8a6] outline-none">${v("code")}</textarea>`;
      } else if (el.type === "divider") {
        inputsHtml = `<div class="h-px bg-white/10 w-full my-4"></div>`;
      }
      return `
            <div class="bg-[#0a0a0b]/80 backdrop-blur-md border border-white/5 rounded-2xl p-5 mb-4 w-full group transition hover:border-[#14b8a6]/40 shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-2 text-white font-bold text-[11px] uppercase tracking-wider">
                        <i data-lucide="${schema.icon}" class="w-4 h-4 text-[#14b8a6]"></i> ${schema.title}
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.movePageElement('${el.id}', -1)" class="p-1.5 text-gray-500 hover:text-white transition rounded border border-transparent hover:border-white/10"><i data-lucide="chevron-up" class="w-4 h-4"></i></button>
                        <button type="button" onclick="window.movePageElement('${el.id}', 1)" class="p-1.5 text-gray-500 hover:text-white transition rounded border border-transparent hover:border-white/10"><i data-lucide="chevron-down" class="w-4 h-4"></i></button>
                        <button type="button" onclick="window.removePageElement('${el.id}')" class="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition ml-2 border border-transparent hover:border-red-500/20"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>
                ${inputsHtml}
            </div>
        `;
    })
    .join("");
  if (window.lucide) lucide.createIcons();
};

window.savePageSettings = async function () {
  if (
    !isPremiumUser &&
    document.getElementById("pageSlug").value.trim() !== ""
  ) {
    return window.showToast("Custom slug requires Premium.", "error");
  }

  const payload = {
    published: document.getElementById("pagePublished").checked,
    title: document.getElementById("pageTitle").value,
    slug: isPremiumUser ? document.getElementById("pageSlug").value : "",
    key_mode: document.getElementById("pageKeyMode").value,
    buy_link: document.getElementById("pageBuyLink").value,
    accent_color: document.getElementById("pageColorHex").value,
    description: document.getElementById("pageDescription").value,
    elements: pageElements.map((el, i) => ({
      id: el.id,
      type: el.type,
      data: el.data,
      order: i,
    })),
  };

  try {
    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
    if (window.lucide) lucide.createIcons();

    const res = await window.apiFetch(`/api/hubs/${currentHubId}/page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: payload }),
    });
    const data = await res.json();

    if (data.success) {
      window.showToast("Landing Page Published!");
      window.updateLinkDisplay(currentHubId, payload.slug, currentHubName);
    } else {
      window.showToast(data.error || "Save failed.", "error");
    }
    btn.innerHTML = originalHtml;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    window.showToast("Session error. Please refresh.", "error");
  }
};

window.previewPage = function () {
  const urlEl = document.getElementById("page-public-url");
  if (!document.getElementById("pagePublished").checked) {
    return window.showToast("Enable 'Published' and save first!", "error");
  }
  if (urlEl && urlEl.href) {
    window.open(urlEl.href, "_blank");
  } else {
    window.showToast("Preview URL not found. Please save first.", "error");
  }
};

window.triggerImageUpload = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png, image/jpeg, image/gif, image/webp";

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024)
      return window.showToast("Image must be smaller than 5MB", "error");

    const elementLimit = isPremiumUser ? 999 : MAX_ELEMENTS;
    if (
      typeof pageElements !== "undefined" &&
      pageElements.length >= elementLimit
    ) {
      return window.showToast(
        `Max elements reached. Delete an element first.`,
        "error",
      );
    }

    const formData = new FormData();
    formData.append("image", file);

    const loadingToast = window.showToast("Uploading image...", "info");

    const clearLoader = () => {
      if (loadingToast) {
        loadingToast.classList.add("opacity-0", "scale-95");
        setTimeout(() => loadingToast.remove(), 300);
      }
    };

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      clearLoader();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403)
          return window.showToast("Session expired or invalid token.", "error");
        return window.showToast("Upload rejected by server.", "error");
      }

      const data = await res.json();
      if (data.success) {
        window.showToast("Image uploaded successfully!");
        pageElements.push({
          id: `el_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
          type: "image",
          data: { url: window.location.origin + data.url },
        });
        window.renderPageElements();
      } else {
        window.showToast(data.error || "Upload failed.", "error");
      }
    } catch (err) {
      clearLoader();
      window.showToast("Network error during upload.", "error");
    }
  };

  input.click();
};

window.cleanupGlobe = function () {
  if (myGlobe) {
    myGlobe.destroy();
    myGlobe = null;
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
};

window.loadAnalytics = async function () {
  try {
    const res = await window.apiFetch(`/api/hubs/${currentHubId}/analytics`);
    const data = await res.json();
    globalAnalyticsLogs = data.logs || [];

    let activeCount = 0;
    const executorCounts = {};

    globalAnalyticsLogs.forEach((log) => {
      if (log.executor)
        executorCounts[log.executor] = (executorCounts[log.executor] || 0) + 1;
    });

    let topExec = "--";
    let maxExec = 0;
    for (const [exe, count] of Object.entries(executorCounts)) {
      if (count > maxExec) {
        maxExec = count;
        topExec = exe;
      }
    }

    if (document.getElementById("stat-execs"))
      document.getElementById("stat-execs").innerText =
        globalAnalyticsLogs.length;
    if (document.getElementById("stat-top-executor"))
      document.getElementById("stat-top-executor").innerText = topExec;

    const topScriptsContainer = document.getElementById("stat-top-scripts");
    if (topScriptsContainer) {
      if (Object.keys(executorCounts).length > 0) {
        topScriptsContainer.innerHTML = Object.entries(executorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(
            ([exe, count]) =>
              `<div class="flex justify-between items-center bg-transparent py-2 border-b border-white/5 last:border-0"><span class="truncate pr-2 text-gray-300 font-medium">${exe}</span><span class="text-white font-bold shrink-0">${count}</span></div>`,
          )
          .join("");
      } else {
        topScriptsContainer.innerHTML =
          '<span class="text-gray-500">No data available.</span>';
      }
    }

    const activityContainer = document.getElementById(
      "recent-activity-container",
    );
    if (activityContainer) {
      if (data.recentActivity && data.recentActivity.length > 0) {
        activityContainer.innerHTML = data.recentActivity
          .map((l) => {
            activeCount++;
            const created = new Date(l.started_at).getTime();
            const lastPing = new Date(l.last_ping).getTime();
            const now = new Date().getTime();

            const diffSeconds = Math.floor((now - created) / 1000);
            const h = Math.floor(diffSeconds / 3600);
            const m = Math.floor((diffSeconds % 3600) / 60);
            const s = diffSeconds % 60;
            const uptime = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

            const pingSecondsAgo = Math.floor((now - lastPing) / 1000);
            let pingText =
              pingSecondsAgo < 10 ? "Just now" : `${pingSecondsAgo}s ago`;
            if (pingSecondsAgo > 60)
              pingText = `${Math.floor(pingSecondsAgo / 60)}m ago`;

            const playerName = l.player_name || "Unknown";
            const authBadge = l.discord_id
              ? `<span class="ml-2 bg-[#14b8a6]/10 text-[#14b8a6] px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold">Auth</span>`
              : `<span class="ml-2 bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold">Guest</span>`;

            const iconColor = l.discord_id ? "text-[#14b8a6]" : "text-gray-500";

            return `<tr class="border-b border-white/5 hover:bg-white/5 transition">
                        <td class="py-3 px-3 font-bold text-white text-xs">
                            <div class="flex items-center">
                                <div class="w-6 h-6 rounded-full bg-[#050505] border border-white/10 flex items-center justify-center shrink-0 mr-2">
                                    <i data-lucide="user" class="w-3 h-3 ${iconColor}"></i>
                                </div>
                                ${playerName} ${authBadge}
                            </div>
                        </td>
                        <td class="py-3 px-3 text-gray-300 text-xs">${l.executor || "Unknown"}</td>
                        <td class="py-3 px-3 text-gray-400 text-xs truncate max-w-[150px] font-medium">${l.game_name || "Unknown Game"}</td>
                        <td class="py-3 px-3 text-[#14b8a6] font-mono text-xs tabular-nums">${uptime}</td>
                        <td class="py-3 px-3 text-right text-gray-500 font-mono text-xs">${pingText}</td>
                    </tr>`;
          })
          .join("");
      } else {
        activityContainer.innerHTML =
          '<tr><td colspan="5" class="py-10 text-center text-gray-500 text-sm border-t border-white/5">No active sessions.</td></tr>';
      }
      if (document.getElementById("stat-active-sessions"))
        document.getElementById("stat-active-sessions").innerText = activeCount;
    }

    window.renderChart(1);
    window.renderGlobe(globalAnalyticsLogs);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error(e);
  }
};

window.renderChart = function (days) {
  ["1", "7", "30"].forEach((d) => {
    const b = document.getElementById("btn-chart-" + d);
    if (b) {
      if (d == days)
        b.className =
          "px-3 py-1.5 bg-[#14b8a6]/10 border border-[#14b8a6]/20 rounded text-[#14b8a6] shadow-inner";
      else b.className = "px-3 py-1.5 hover:text-white transition";
    }
  });

  const execsPerPeriod = {};
  const now = new Date();

  if (days === 1) {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      execsPerPeriod[`${d.getHours()}:00`] = 0;
    }
    globalAnalyticsLogs.forEach((log) => {
      const logD = new Date(log.createdAt);
      if (now - logD <= 24 * 60 * 60 * 1000) {
        const k = `${logD.getHours()}:00`;
        if (execsPerPeriod[k] !== undefined) execsPerPeriod[k]++;
      }
    });
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      execsPerPeriod[label] = 0;
    }
    globalAnalyticsLogs.forEach((log) => {
      const logD = new Date(log.createdAt);
      if (now - logD <= days * 24 * 60 * 60 * 1000) {
        const label = `${logD.getMonth() + 1}/${logD.getDate()}`;
        if (execsPerPeriod[label] !== undefined) execsPerPeriod[label]++;
      }
    });
  }

  const canvas = document.getElementById("analyticsChart");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (analyticsChartInstance) analyticsChartInstance.destroy();
    analyticsChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: Object.keys(execsPerPeriod),
        datasets: [
          {
            label: "Executions",
            data: Object.values(execsPerPeriod),
            borderColor: "#14b8a6",
            backgroundColor: "rgba(20, 184, 166, 0.1)",
            tension: 0.4,
            fill: true,
            pointBackgroundColor: "#0a0a0b",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "#1f1f22" },
            border: { dash: [4, 4] },
            ticks: { color: "#64656b", precision: 0 },
          },
          x: {
            grid: { display: false },
            ticks: { color: "#64656b", maxRotation: 0 },
          },
        },
      },
    });
  }
};

window.renderGlobe = function (logs = []) {
  const canvas = document.getElementById("geoGlobe");
  const wrapper = document.getElementById("globe-wrapper");
  if (!canvas || !window.createGlobe) return;

  window.cleanupGlobe();

  const countryCounts = {};
  const markers = [];
  let validGeoCount = 0;

  if (wrapper) {
    wrapper.querySelectorAll(".marker-label").forEach((el) => el.remove());
  }

  logs.forEach((log, index) => {
    if (log.country && log.country !== "Unknown") {
      countryCounts[log.country] = (countryCounts[log.country] || 0) + 1;
      validGeoCount++;
    }

    if (log.lat !== undefined && log.lon !== undefined && log.lat !== 0) {
      const markerId = `m_${index}`;

      markers.push({
        location: [parseFloat(log.lat), parseFloat(log.lon)],
        size: 0.06,
        id: markerId,
        color: [0.6, 0.2, 1.0],
      });

      if (wrapper) {
        const label = document.createElement("div");
        label.className = "marker-label";
        label.innerText =
          log.country && log.country !== "Unknown"
            ? log.country
            : log.executor || "Executed";
        label.style.positionAnchor = `--cobe-${markerId}`;
        label.style.opacity = `var(--cobe-visible-${markerId}, 0)`;
        wrapper.appendChild(label);
      }
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    pointerInteractingX = e.clientX - pointerMovementX;
    pointerInteractingY = e.clientY - pointerMovementY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("pointerup", () => {
    pointerInteractingX = null;
    pointerInteractingY = null;
    canvas.style.cursor = "grab";
  });

  canvas.addEventListener("pointerout", () => {
    pointerInteractingX = null;
    pointerInteractingY = null;
    canvas.style.cursor = "grab";
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointerInteractingX !== null) {
      pointerMovementX = e.clientX - pointerInteractingX;
      pointerMovementY = e.clientY - pointerInteractingY;
    }
  });

  myGlobe = window.createGlobe(canvas, {
    devicePixelRatio: 2,
    width: 1600,
    height: 1600,
    phi: 0,
    theta: 0.2,
    dark: 1,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: 13,
    baseColor: [0.3, 0.3, 0.3],
    markerColor: [1, 1, 1],
    glowColor: [0.2, 0.15, 0.35],
    markers: markers,
  });

  function animate() {
    if (pointerInteractingX === null) {
      baseRotation += 0.003;
    }

    targetPhi = baseRotation + pointerMovementX / 150;
    targetTheta = 0.2 + pointerMovementY / 350;
    targetTheta = Math.max(-1.57, Math.min(1.57, targetTheta));

    currentPhi += (targetPhi - currentPhi) * 0.1;
    currentTheta += (targetTheta - currentTheta) * 0.1;

    if (myGlobe) myGlobe.update({ phi: currentPhi, theta: currentTheta });

    animationId = requestAnimationFrame(animate);
  }
  animate();

  const list = document.getElementById("geo-stats-container");
  if (list) {
    const total = validGeoCount || 1;
    const sortedCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sortedCountries.length === 0) {
      list.innerHTML = `<p class="text-gray-500 text-sm py-4 italic">No geographic data yet.</p>`;
    } else {
      list.innerHTML = sortedCountries
        .map(([name, count]) => {
          const percent = Math.round((count / total) * 100);
          return `
            <div class="flex justify-between border-b border-white/5 pb-2 mb-2 last:border-0">
                <span class="text-white font-bold">${name}</span>
                <span class="text-purple-400 font-mono">${percent}%</span>
            </div>
          `;
        })
        .join("");
    }
  }
};