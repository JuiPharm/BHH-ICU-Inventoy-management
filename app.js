/* ICU Stock Management - GitHub Pages Frontend (Tailwind)
 * FIXED: auto-inject staffId/role into payload for all actions after login
 * - POST simple request: Content-Type: text/plain;charset=utf-8
 * - Toggle visibility via class "hidden"
 */

(() => {
  const CFG = window.APP_CONFIG || {};
  const APP_NAME = CFG.APP_NAME || "ICU Stock Management";
  const API_BASE_URL = CFG.API_BASE_URL || "<PUT_WEB_APP_EXEC_URL_HERE>";
  const LOCALE = CFG.LOCALE || "th-TH";
  const TIMEZONE = CFG.TIMEZONE || "Asia/Bangkok";
  const LOGO_URL = CFG.LOGO_URL || "https://lh5.googleusercontent.com/d/1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO";

  const state = {
    user: null, // { staffId, name, role }
    inventory: [],
    usageLogs: [],
    cabinets: [],
    isAdminSheetOpen: false,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const loginView = $("loginView");
  const appShell = $("appShell");

  const loginLogo = $("loginLogo");
  const appLogo = $("appLogo");
  const loginAppName = $("loginAppName");
  const appName = $("appName");

  const apiStatusBadge = $("apiStatusBadge");

  const loginForm = $("loginForm");
  const loginStaffId = $("login_staffId");
  const loginPassword = $("login_password");
  const togglePasswordBtn = $("togglePasswordBtn");
  const togglePasswordText = $("togglePasswordText");
  const initSheetsBtn = $("initSheetsBtn");

  const sidebarNav = $("sidebarNav");
  const logoutBtnDesktop = $("logoutBtnDesktop");
  const logoutBtnMobileTop = $("logoutBtnMobileTop");
  const topUserInfo = $("topUserInfo");
  const userBadge = $("userBadge");
  const activeViewBadge = $("activeViewBadge");

  const messageBar = $("messageBar");

  const loadingOverlay = $("loadingOverlay");
  const loadingText = $("loadingText");

  const modalBackdrop = $("modalBackdrop");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalOkBtn = $("modalOkBtn");

  const bottomNav = $("bottomNav");
  const adminCenterBtn = $("adminCenterBtn");
  const adminSheetBackdrop = $("adminSheetBackdrop");
  const adminSheetPanel = $("adminSheetPanel");
  const adminSheetDim = $("adminSheetDim");
  const closeAdminSheetBtn = $("closeAdminSheetBtn");

  // Views
  const views = ["home", "inventory", "daily", "usage", "profile", "admin"];

  // Home widgets
  const systemStatus = $("systemStatus");
  const inventoryCount = $("inventoryCount");
  const roleHint = $("roleHint");

  // Inventory widgets
  const invSearch = $("invSearch");
  const invCabinetFilter = $("invCabinetFilter");
  const invCategoryFilter = $("invCategoryFilter");
  const refreshInventoryBtn = $("refreshInventoryBtn");
  const exportCsvBtn = $("exportCsvBtn");
  const importCsvInput = $("importCsvInput");
  const invTbody = $("invTbody");
  const invEmpty = $("invEmpty");

  // Daily widgets
  const dailyRoleHint = $("dailyRoleHint");
  const dailyDate = $("dailyDate");
  const dailyShift = $("dailyShift");
  const dailySearch = $("dailySearch");
  const dailyCabinetFilter = $("dailyCabinetFilter");
  const refreshDailyBtn = $("refreshDailyBtn");
  const submitDailyBtn = $("submitDailyBtn");
  const dailyList = $("dailyList");
  const dailyEmpty = $("dailyEmpty");

  // Usage widgets
  const refreshUsageBtn = $("refreshUsageBtn");
  const usageTbody = $("usageTbody");
  const usageEmpty = $("usageEmpty");

  // Admin widgets
  const adminOutput = $("adminOutput");

  // ---------- Utils ----------
  function safeText(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    // fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function fmtDateDisplay(yyyyMmDd) {
    if (!yyyyMmDd) return "";
    const [y, m, d] = yyyyMmDd.split("-");
    if (!y || !m || !d) return yyyyMmDd;
    return `${d}/${m}/${y}`;
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function showLoading(msg = "Loading...") {
    loadingText.textContent = msg;
    setVisible(loadingOverlay, true);
  }

  function hideLoading() {
    setVisible(loadingOverlay, false);
  }

  function setMessageBar(type, text) {
    // type: success|error|info
    const classes = {
      success: "border-emerald-700/50 bg-emerald-950/40 text-emerald-100",
      error: "border-rose-700/50 bg-rose-950/40 text-rose-100",
      info: "border-slate-700 bg-slate-950/40 text-slate-100",
    };
    messageBar.className = `mb-4 rounded-xl border px-4 py-3 text-sm ${classes[type] || classes.info}`;
    messageBar.textContent = text;
    setVisible(messageBar, true);
  }

  function clearMessageBar() {
    setVisible(messageBar, false);
    messageBar.textContent = "";
  }

  function showModal(title, body) {
    modalTitle.textContent = title || "Message";
    modalBody.textContent = body || "";
    setVisible(modalBackdrop, true);
  }

  function hideModal() {
    setVisible(modalBackdrop, false);
    modalTitle.textContent = "Message";
    modalBody.textContent = "";
  }

  function roleIsAdmin() {
    return state.user?.role === "Admin";
  }

  function roleDailyCategory() {
    // RBAC note: backend must enforce; this is only UI hint
    if (state.user?.role === "RN") return "Medicine";
    if (state.user?.role === "PN") return "Medical Supply";
    return ""; // Admin = all
  }

  // ---------- API Client (FIXED) ----------
  async function apiCall(action, payload = {}, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const retries = opts.retries ?? 1;

    const requestId = uuid();

    // FIX: auto-inject auth context for all actions after login
    const NO_AUTH_ACTIONS = new Set(["verifyLogin"]); // extend if needed
    let finalPayload = payload;

    if (!NO_AUTH_ACTIONS.has(action) && state.user && finalPayload && typeof finalPayload === "object" && !Array.isArray(finalPayload)) {
      if (!("staffId" in finalPayload)) finalPayload = { ...finalPayload, staffId: state.user.staffId };
      if (!("role" in finalPayload)) finalPayload = { ...finalPayload, role: state.user.role };
    }

    const bodyObj = {
      action,
      payload: finalPayload,
      requestId,
      clientTime: nowISO(),
    };

    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(API_BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(bodyObj),
          signal: controller.signal,
        });

        const raw = await res.text();
        let json;
        try {
          json = JSON.parse(raw);
        } catch (e) {
          const msg = [
            "Invalid JSON response",
            `HTTP ${res.status}`,
            `action=${action}`,
            `requestId=${requestId}`,
            `raw=${raw.slice(0, 300)}`
          ].join("\n");
          throw new Error(msg);
        }

        json.action = json.action || action;
        json.requestId = json.requestId || requestId;

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} (${res.statusText}) requestId=${json.requestId}`);
        }

        if (json.success === false) {
          const err = json.error || "REQUEST_FAILED";
          const details = json.details ? `\ndetails=${JSON.stringify(json.details)}` : "";
          throw new Error(`${err} requestId=${json.requestId}${details}`);
        }

        return json;
      } catch (err) {
        lastErr = err;

        const isAbort = err?.name === "AbortError";
        const isNetwork = err instanceof TypeError; // often CORS/network
        const retryable = isAbort || isNetwork;

        if (attempt < retries && retryable) {
          await new Promise((r) => setTimeout(r, 400 + attempt * 600));
          continue;
        }

        if (isNetwork) {
          throw new Error(
            [
              "Network/CORS error while calling Apps Script Web App.",
              `action=${action}`,
              `requestId=${requestId}`,
              "",
              "Checklist:",
              "1) Apps Script Web App Deploy: Execute as 'Me', Who has access = 'Anyone' (or 'Anyone with link')",
              "2) ใช้ URL แบบ .../exec (ไม่ใช่ /dev) และเป็นตัวล่าสุดหลัง Deploy",
              "3) ตรวจว่า API_BASE_URL ใน config.js ถูกต้อง",
              "4) ลองเปิด API_BASE_URL?action=ping ใน browser โดยตรง",
            ].join("\n")
          );
        }

        throw err;
      } finally {
        clearTimeout(t);
      }
    }

    throw lastErr || new Error("REQUEST_FAILED");
  }

  async function apiPing() {
    const url = new URL(API_BASE_URL);
    url.searchParams.set("action", "ping");
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const raw = await res.text();
      const json = JSON.parse(raw);
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  // ---------- Session ----------
  function saveSession(user) {
    sessionStorage.setItem("icu_user", JSON.stringify(user));
  }

  function loadSession() {
    try {
      const s = sessionStorage.getItem("icu_user");
      if (!s) return null;
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem("icu_user");
  }

  // ---------- Navigation ----------
  const NAV_COMMON = [
    { key: "home", label: "Home", icon: "fa-house" },
    { key: "inventory", label: "Inventory", icon: "fa-boxes-stacked" },
    { key: "daily", label: "Daily Check", icon: "fa-clipboard-check" },
    { key: "usage", label: "Usage Logs", icon: "fa-list-check" },
    { key: "profile", label: "Profile", icon: "fa-user" },
  ];

  const NAV_ADMIN = [
    { key: "admin", label: "Admin Console", icon: "fa-shield-halved" },
  ];

  function renderSidebarNav() {
    const items = roleIsAdmin() ? [...NAV_COMMON, ...NAV_ADMIN] : [...NAV_COMMON];
    sidebarNav.innerHTML = "";

    for (const it of items) {
      const btn = document.createElement("button");
      btn.className = "w-full text-left rounded-xl px-3 py-2 hover:bg-slate-900/60 border border-transparent hover:border-slate-800 flex items-center gap-3";
      btn.dataset.nav = it.key;
      btn.innerHTML = `<i class="fa-solid ${it.icon} text-slate-200 w-5"></i><span class="text-sm text-slate-200">${it.label}</span>`;
      btn.addEventListener("click", () => setView(it.key));
      sidebarNav.appendChild(btn);
    }
  }

  function renderBottomNav() {
    setVisible(adminCenterBtn, roleIsAdmin());
  }

  function setView(key) {
    if (!views.includes(key)) key = "home";
    views.forEach((k) => setVisible($(`view_${k}`), k === key));
    activeViewBadge.textContent = key;

    const titleMap = {
      home: "Dashboard",
      inventory: "Inventory",
      daily: "Daily Check",
      usage: "Usage Logs",
      profile: "Profile",
      admin: "Admin Console",
    };
    const t = document.querySelector("header .text-lg.font-semibold");
    if (t) t.textContent = titleMap[key] || "Dashboard";

    if (key === "inventory") void refreshInventory();
    if (key === "daily") void refreshDaily();
    if (key === "usage") void refreshUsage();
    if (key === "home") void refreshHome();
    if (key === "profile") renderProfile();
  }

  // ---------- Data / Rendering ----------
  function setCabinetOptions(selectEl, cabinets) {
    const current = selectEl.value || "";
    selectEl.innerHTML = `<option value="">ทุกตู้</option>` + cabinets.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    selectEl.value = cabinets.includes(current) ? current : "";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function matchesInvFilters(row) {
    const q = invSearch.value.trim().toLowerCase();
    const cabinet = invCabinetFilter.value;
    const cat = invCategoryFilter.value;

    if (cabinet && safeText(row.cabinet) !== cabinet) return false;
    if (cat && safeText(row.category) !== cat) return false;

    if (!q) return true;
    const hay = [
      row.itemName, row.lotNo, row.note, row.cabinet, row.category
    ].map(v => safeText(v).toLowerCase()).join(" | ");
    return hay.includes(q);
  }

  function renderInventory() {
    const filtered = state.inventory.filter(matchesInvFilters);
    invTbody.innerHTML = "";

    if (filtered.length === 0) {
      setVisible(invEmpty, true);
      return;
    }
    setVisible(invEmpty, false);

    for (const r of filtered) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-900/40";

      const qty = Number(r.quantity ?? 0);
      const min = Number(r.minStock ?? 0);
      const low = min > 0 && qty < min;

      tr.innerHTML = `
        <td class="px-4 py-3">${escapeHtml(r.itemName || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.lotNo || "")}</td>
        <td class="px-4 py-3 text-right ${low ? "text-rose-300 font-semibold" : ""}">${escapeHtml(qty)}</td>
        <td class="px-4 py-3 text-right">${escapeHtml(min)}</td>
        <td class="px-4 py-3">${escapeHtml(fmtDateDisplay(r.expiryDate || ""))}</td>
        <td class="px-4 py-3">${escapeHtml(r.note || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.cabinet || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.category || "")}</td>
      `;
      invTbody.appendChild(tr);
    }

    inventoryCount.textContent = `${state.inventory.length} items`;
  }

  function groupByCabinet(items) {
    const map = new Map();
    for (const it of items) {
      const cab = safeText(it.cabinet) || "(ไม่ระบุตู้)";
      if (!map.has(cab)) map.set(cab, []);
      map.get(cab).push(it);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }

  function renderDaily() {
    const q = dailySearch.value.trim().toLowerCase();
    const cabinet = dailyCabinetFilter.value;
    const catLimit = roleDailyCategory();

    let items = [...state.inventory];

    if (catLimit) items = items.filter(x => safeText(x.category) === catLimit);
    if (cabinet) items = items.filter(x => safeText(x.cabinet) === cabinet);

    if (q) {
      items = items.filter(x => {
        const hay = `${safeText(x.itemName)}|${safeText(x.lotNo)}`.toLowerCase();
        return hay.includes(q);
      });
    }

    dailyList.innerHTML = "";
    if (items.length === 0) {
      setVisible(dailyEmpty, true);
      return;
    }
    setVisible(dailyEmpty, false);

    const groups = groupByCabinet(items);

    for (const [cab, arr] of groups) {
      const section = document.createElement("div");
      section.className = "rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden";

      const header = document.createElement("div");
      header.className = "px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between";
      header.innerHTML = `<div class="font-semibold">${escapeHtml(cab)}</div><div class="text-xs text-slate-300">${arr.length} รายการ</div>`;
      section.appendChild(header);

      const body = document.createElement("div");
      body.className = "p-4 space-y-3";

      for (const it of arr) {
        const row = document.createElement("div");
        row.className = "rounded-xl border border-slate-800 bg-slate-950/40 p-3";

        row.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <div class="min-w-0">
              <div class="font-semibold truncate">${escapeHtml(it.itemName || "")}</div>
              <div class="text-xs text-slate-300">Lot: ${escapeHtml(it.lotNo || "-")} • คงเหลือ: ${escapeHtml(it.quantity ?? 0)} • หมดอายุ: ${escapeHtml(fmtDateDisplay(it.expiryDate || ""))}</div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input type="number" min="0" step="1"
                class="dailyQty rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                data-item="${escapeHtml(it.itemName || "")}" data-lot="${escapeHtml(it.lotNo || "")}"
                placeholder="จำนวนที่ตรวจ"/>
              <select
                class="dailyStatus rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                data-item="${escapeHtml(it.itemName || "")}" data-lot="${escapeHtml(it.lotNo || "")}">
                <option value="OK">OK</option>
                <option value="Low">Low</option>
                <option value="Expired">Expired</option>
              </select>
              <div class="hidden sm:block text-xs text-slate-400 self-center">Category: ${escapeHtml(it.category || "")}</div>
            </div>
          </div>
        `;
        body.appendChild(row);
      }

      section.appendChild(body);
      dailyList.appendChild(section);
    }
  }

  function renderUsage() {
    usageTbody.innerHTML = "";
    if (!state.usageLogs || state.usageLogs.length === 0) {
      setVisible(usageEmpty, true);
      return;
    }
    setVisible(usageEmpty, false);

    for (const r of state.usageLogs) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-900/40";
      tr.innerHTML = `
        <td class="px-4 py-3">${escapeHtml(r.date || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.itemName || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.lotNo || "")}</td>
        <td class="px-4 py-3 text-right">${escapeHtml(r.qty ?? "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.requester || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.timestamp || "")}</td>
      `;
      usageTbody.appendChild(tr);
    }
  }

  function renderProfile() {
    const u = state.user;
    $("profileBox").innerHTML = `
      <div class="space-y-1">
        <div><span class="text-slate-400">Name:</span> <span class="font-semibold">${escapeHtml(u?.name || "-")}</span></div>
        <div><span class="text-slate-400">StaffID:</span> <span class="font-mono">${escapeHtml(u?.staffId || "-")}</span></div>
        <div><span class="text-slate-400">Role:</span> <span class="font-semibold">${escapeHtml(u?.role || "-")}</span></div>
        <div class="pt-2 text-xs text-slate-400">
          (Hardening) แนะนำเพิ่ม token/session + server-side nonce ในอนาคต แต่ backend ต้องเป็นผู้ตรวจสิทธิ์ทุกครั้ง
        </div>
      </div>
    `;
  }

  // ---------- Loaders ----------
  async function refreshHome() {
    clearMessageBar();
    try {
      showLoading("Loading system status...");
      const res = await apiCall("getSystemStatus", {}, { retries: 1 });
      systemStatus.textContent = safeText(res.data?.status || "OK");
    } catch (e) {
      systemStatus.textContent = "ERROR";
      setMessageBar("error", e.message);
    } finally {
      hideLoading();
    }

    inventoryCount.textContent = `${state.inventory.length} items`;
    roleHint.textContent = state.user?.role ? `${state.user.role}` : "-";
  }

  async function refreshCabinets() {
    try {
      const res = await apiCall("getCabinetList", {}, { retries: 1 });
      const list = Array.isArray(res.data) ? res.data : (res.data?.cabinets || []);
      state.cabinets = (list || []).filter(Boolean);
    } catch {
      const set = new Set(state.inventory.map(x => safeText(x.cabinet)).filter(Boolean));
      state.cabinets = [...set];
    }
    setCabinetOptions(invCabinetFilter, state.cabinets);
    setCabinetOptions(dailyCabinetFilter, state.cabinets);
  }

  async function refreshInventory() {
    clearMessageBar();
    try {
      showLoading("Loading inventory...");
      const res = await apiCall("loadInventory", {}, { retries: 1 });
      const rows = Array.isArray(res.data) ? res.data : [];
      state.inventory = rows.map(normalizeInventoryRow);
      inventoryCount.textContent = `${state.inventory.length} items`;
      await refreshCabinets();
      renderInventory();
    } catch (e) {
      setMessageBar("error", e.message);
      state.inventory = [];
      renderInventory();
    } finally {
      hideLoading();
    }
  }

  function normalizeInventoryRow(r) {
    return {
      itemName: r.itemName ?? r["รายการ"] ?? r.item ?? "",
      lotNo: r.lotNo ?? r["Lot No"] ?? r.lot ?? "",
      quantity: r.quantity ?? r["จำนวน"] ?? r.qty ?? 0,
      minStock: r.minStock ?? r["Minimum Stock"] ?? r.minimum ?? 0,
      expiryDate: r.expiryDate ?? r["วันที่หมดอายุ"] ?? r.expiry ?? "",
      note: r.note ?? r["หมายเหตุ"] ?? "",
      cabinet: r.cabinet ?? r["ตู้"] ?? "",
      category: r.category ?? r["Category"] ?? "",
    };
  }

  async function refreshDaily() {
    clearMessageBar();
    dailyRoleHint.textContent = roleDailyCategory()
      ? `สิทธิ์ของคุณ: ตรวจเฉพาะ Category="${roleDailyCategory()}"`
      : `สิทธิ์ของคุณ: ตรวจได้ทุก Category`;

    if (!dailyDate.value) dailyDate.valueAsDate = new Date();
    if (!dailyShift.value) dailyShift.value = "เช้า";

    if (!state.inventory.length) await refreshInventory();
    await refreshCabinets();
    renderDaily();
  }

  async function refreshUsage() {
    clearMessageBar();
    try {
      showLoading("Loading usage logs...");
      const res = await apiCall("loadUsageLogs", {}, { retries: 1 });
      const rows = Array.isArray(res.data) ? res.data : [];
      state.usageLogs = rows.map(r => ({
        date: r.date ?? r["วันที่"] ?? "",
        itemName: r.itemName ?? r["รายการ"] ?? "",
        lotNo: r.lotNo ?? r["Lot No"] ?? "",
        qty: r.qty ?? r["จำนวนที่เบิก"] ?? "",
        requester: r.requester ?? r["ผู้เบิก"] ?? "",
        timestamp: r.timestamp ?? r["Timestamp"] ?? "",
      }));
      renderUsage();
    } catch (e) {
      setMessageBar("error", e.message);
      state.usageLogs = [];
      renderUsage();
    } finally {
      hideLoading();
    }
  }

  // ---------- CSV ----------
  function toCsvValue(v) {
    const s = safeText(v).replaceAll('"', '""');
    return `"${s}"`;
  }

  function exportInventoryCsv() {
    const header = ["รายการ","Lot No","จำนวน","Minimum Stock","วันที่หมดอายุ","หมายเหตุ","ตู้","Category"];
    const lines = [header.map(toCsvValue).join(",")];

    for (const r of state.inventory) {
      lines.push([
        r.itemName, r.lotNo, r.quantity, r.minStock, r.expiryDate, r.note, r.cabinet, r.category
      ].map(toCsvValue).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;

    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field = ""; i++; continue; }
        if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
        if (c === "\r") { i++; continue; }
        field += c; i++; continue;
      }
    }
    row.push(field);
    rows.push(row);
    return rows.filter(r => r.some(x => String(x).trim() !== ""));
  }

  function tryNormalizeExpiry(s) {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d,m,y] = s.split("/");
      return `${y}-${m}-${d}`;
    }
    return s;
  }

  async function importInventoryCsv(file) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV ไม่มีข้อมูล");

    const header = rows[0].map(h => h.trim());
    const idx = (name) => header.indexOf(name);

    const required = ["รายการ","Lot No","จำนวน","Minimum Stock","วันที่หมดอายุ","หมายเหตุ","ตู้","Category"];
    for (const h of required) {
      if (idx(h) < 0) throw new Error(`CSV header ขาดคอลัมน์: ${h}`);
    }

    let ok = 0;
    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];
      const itemData = {
        itemName: line[idx("รายการ")]?.trim() || "",
        lotNo: line[idx("Lot No")]?.trim() || "",
        quantity: Number(line[idx("จำนวน")] || 0),
        minStock: Number(line[idx("Minimum Stock")] || 0),
        expiryDate: tryNormalizeExpiry(line[idx("วันที่หมดอายุ")]?.trim() || ""),
        note: line[idx("หมายเหตุ")]?.trim() || "",
        cabinet: line[idx("ตู้")]?.trim() || "",
        category: line[idx("Category")]?.trim() || "",
      };

      if (!itemData.itemName || !itemData.lotNo) continue;

      showLoading(`Importing... (${r}/${rows.length - 1})`);
      await apiCall("saveInventoryItem", { itemData }, { retries: 1, timeoutMs: 20000 });
      ok++;
    }

    hideLoading();
    showModal("Import CSV", `นำเข้าเสร็จสิ้น: ${ok} รายการ`);
    await refreshInventory();
  }

  // ---------- Daily Submit ----------
  async function submitDaily() {
    clearMessageBar();
    try {
      const date = dailyDate.value || new Date().toISOString().slice(0,10);
      const shift = dailyShift.value || "เช้า";

      const qtyEls = [...document.querySelectorAll(".dailyQty")];
      const statusEls = [...document.querySelectorAll(".dailyStatus")];

      const statusMap = new Map(statusEls.map(el => [`${el.dataset.item}||${el.dataset.lot}`, el.value]));
      const checks = [];

      for (const el of qtyEls) {
        const item = el.dataset.item || "";
        const lot = el.dataset.lot || "";
        const qty = Number(el.value || 0);
        const status = statusMap.get(`${item}||${lot}`) || "OK";
        if (qty <= 0) continue;

        checks.push({
          date, itemName: item, lotNo: lot,
          checkedQty: qty,
          shift,
          staffId: state.user.staffId,
          staffName: state.user.name,
          status
        });
      }

      if (checks.length === 0) {
        showModal("Daily Check", "กรุณากรอกจำนวนที่ตรวจอย่างน้อย 1 รายการ");
        return;
      }

      showLoading("Submitting daily check...");
      const res = await apiCall("saveDailyCheck", { checkDataArray: checks }, { retries: 1, timeoutMs: 25000 });
      hideLoading();
      showModal("Daily Check", `บันทึกสำเร็จ\nrequestId=${res.requestId || "-"}`);
    } catch (e) {
      hideLoading();
      showModal("Daily Check Error", e.message);
    }
  }

  // ---------- Admin Actions ----------
  function setAdminOutput(obj) {
    adminOutput.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }

  async function runAdminAction(action) {
    if (!roleIsAdmin()) {
      showModal("Permission", "ต้องเป็น Admin เท่านั้น");
      return;
    }

    try {
      showLoading(`Running ${action}...`);
      const res = await apiCall(action, {}, { retries: 1, timeoutMs: 30000 });
      setAdminOutput(res);
      showModal("Admin", `สำเร็จ: ${action}\nrequestId=${res.requestId || "-"}`);
    } catch (e) {
      setAdminOutput(e.message);
      showModal("Admin Error", e.message);
    } finally {
      hideLoading();
    }
  }

  // ---------- Admin Sheet ----------
  function openAdminSheet() {
    if (!roleIsAdmin()) return;
    setVisible(adminSheetBackdrop, true);
    requestAnimationFrame(() => {
      adminSheetPanel.classList.remove("translate-y-full");
      adminSheetPanel.classList.add("translate-y-0");
    });
    state.isAdminSheetOpen = true;
  }

  function closeAdminSheet() {
    adminSheetPanel.classList.add("translate-y-full");
    adminSheetPanel.classList.remove("translate-y-0");
    setTimeout(() => setVisible(adminSheetBackdrop, false), 180);
    state.isAdminSheetOpen = false;
  }

  // ---------- Auth ----------
  async function login(staffId, password) {
    clearMessageBar();
    showLoading("Signing in...");
    try {
      const res = await apiCall("verifyLogin", { staffId, password }, { retries: 1, timeoutMs: 20000 });
      const d = res.data || {};
      const user = {
        staffId: d.staffId || staffId,
        name: d.name || d.staffName || "",
        role: d.role || "",
      };

      state.user = user;
      saveSession(user);

      await enterApp();
      hideLoading();
    } catch (e) {
      hideLoading();
      showModal("Login Failed", e.message);
    }
  }

  async function logout() {
    clearSession();
    state.user = null;
    state.inventory = [];
    state.usageLogs = [];
    state.cabinets = [];
    setVisible(appShell, false);
    setVisible(loginView, true);
    setVisible(adminCenterBtn, false);
    closeAdminSheet();
    setMessageBar("info", "Logged out");
    setTimeout(clearMessageBar, 1500);
  }

  async function enterApp() {
    loginAppName.textContent = APP_NAME;
    appName.textContent = APP_NAME;

    loginLogo.src = LOGO_URL;
    appLogo.src = LOGO_URL;

    userBadge.textContent = `${state.user.name || "-"} (${state.user.staffId || "-"}) • ${state.user.role || "-"}`;
    topUserInfo.textContent = userBadge.textContent;

    renderSidebarNav();
    renderBottomNav();

    setVisible(loginView, false);
    setVisible(appShell, true);

    if (!roleIsAdmin()) setVisible($("view_admin"), false);

    await refreshInventory();
    await refreshHome();
    setView("home");

    dailyRoleHint.textContent = roleDailyCategory()
      ? `สิทธิ์ของคุณ: ตรวจเฉพาะ Category="${roleDailyCategory()}"`
      : `สิทธิ์ของคุณ: ตรวจได้ทุก Category`;
  }

  // ---------- Events ----------
  function bindEvents() {
    togglePasswordBtn.addEventListener("click", () => {
      const isPw = loginPassword.type === "password";
      loginPassword.type = isPw ? "text" : "password";
      togglePasswordText.textContent = isPw ? "Hide" : "Show";
    });

    modalOkBtn.addEventListener("click", hideModal);

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const staffId = loginStaffId.value.trim();
      const password = loginPassword.value;
      if (!staffId || !password) {
        showModal("Login", "กรุณากรอก StaffID และ Password");
        return;
      }
      await login(staffId, password);
    });

    initSheetsBtn.addEventListener("click", async () => {
      showModal("Initialize Sheets", "แนะนำให้ทำผ่าน Admin หลัง login");
    });

    logoutBtnDesktop.addEventListener("click", logout);
    logoutBtnMobileTop.addEventListener("click", logout);

    bottomNav.querySelectorAll("[data-nav]").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.nav));
    });

    adminCenterBtn.addEventListener("click", () => {
      state.isAdminSheetOpen ? closeAdminSheet() : openAdminSheet();
    });
    closeAdminSheetBtn.addEventListener("click", closeAdminSheet);
    adminSheetDim.addEventListener("click", closeAdminSheet);

    adminSheetBackdrop.querySelectorAll("[data-admin-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        closeAdminSheet();
        await runAdminAction(btn.dataset.adminAction);
      });
    });

    document.querySelectorAll(".adminBtn").forEach(btn => {
      btn.classList.add(
        "rounded-xl", "border", "border-slate-800", "bg-slate-950/60",
        "hover:bg-slate-900", "px-4", "py-2", "text-slate-200"
      );
      btn.addEventListener("click", async () => runAdminAction(btn.dataset.adminAction));
    });

    refreshInventoryBtn.addEventListener("click", refreshInventory);
    invSearch.addEventListener("input", renderInventory);
    invCabinetFilter.addEventListener("change", renderInventory);
    invCategoryFilter.addEventListener("change", renderInventory);

    exportCsvBtn.addEventListener("click", () => {
      if (!state.inventory.length) {
        showModal("Export CSV", "ไม่มีข้อมูลใน Inventory");
        return;
      }
      exportInventoryCsv();
    });

    importCsvInput.addEventListener("change", async () => {
      const file = importCsvInput.files?.[0];
      importCsvInput.value = "";
      if (!file) return;

      if (!roleIsAdmin()) {
        showModal("Import CSV", "ต้องเป็น Admin เท่านั้น");
        return;
      }

      try {
        await importInventoryCsv(file);
      } catch (e) {
        hideLoading();
        showModal("Import CSV Error", e.message);
      }
    });

    refreshDailyBtn.addEventListener("click", refreshDaily);
    dailySearch.addEventListener("input", renderDaily);
    dailyCabinetFilter.addEventListener("change", renderDaily);
    submitDailyBtn.addEventListener("click", submitDaily);

    refreshUsageBtn.addEventListener("click", refreshUsage);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!modalBackdrop.classList.contains("hidden")) hideModal();
        if (state.isAdminSheetOpen) closeAdminSheet();
      }
    });
  }

  // ---------- Boot ----------
  async function boot() {
    loginLogo.src = LOGO_URL;
    appLogo.src = LOGO_URL;
    loginAppName.textContent = APP_NAME;
    appName.textContent = APP_NAME;

    const ping = await apiPing();
    apiStatusBadge.textContent = ping.ok ? "API: OK" : "API: ERROR";
    apiStatusBadge.className = ping.ok
      ? "text-xs px-2 py-1 rounded-full border border-emerald-700/50 text-emerald-200"
      : "text-xs px-2 py-1 rounded-full border border-rose-700/50 text-rose-200";

    bindEvents();

    const sess = loadSession();
    if (sess?.staffId && sess?.role) {
      state.user = sess;
      await enterApp();
    } else {
      setVisible(loginView, true);
      setVisible(appShell, false);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
