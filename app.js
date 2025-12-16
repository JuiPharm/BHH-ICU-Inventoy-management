/* ICU Stock Management - GitHub Pages Frontend (Tailwind)
 * FIXED (Load-from-Sheet):
 * - รองรับ shape ของ backend เดิม: loadInventory -> data.items
 * - รองรับ getCabinetList -> data.cabinets
 * - รองรับ loadUsageLogs -> data.rows
 * FIXED (Daily/Usage payload):
 * - saveDailyCheck -> { date, round, type, checks }
 * - recordUsage -> { usageData:{ date, item, lotNo, qtyUsed, requester } }
 * FIXED (Auth context):
 * - เติม staffId/role อัตโนมัติทุก action (ยกเว้น verifyLogin)
 */

(() => {
  const CFG = window.APP_CONFIG || {};
  const APP_NAME = CFG.APP_NAME || "ICU Stock Management";
  const API_BASE_URL = CFG.API_BASE_URL || "<PUT_WEB_APP_EXEC_URL_HERE>";
  const LOCALE = CFG.LOCALE || "th-TH";
  const TIMEZONE = CFG.TIMEZONE || "Asia/Bangkok";
  const LOGO_URL = CFG.LOGO_URL || "https://lh5.googleusercontent.com/d/1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO";

  const state = {
    user: null, // { staffId, staffName, role }
    inventory: [], // normalized: { rowNumber,item,lotNo,qty,minStock,expiryDate,note,cabinet,category }
    usageRows: [], // normalized: { date,item,lotNo,qtyUsed,requester,timestamp }
    cabinets: [],
    isAdminSheetOpen: false,
  };

  const $ = (id) => document.getElementById(id);

  // ---------- DOM (ต้องตรงกับ index.html ของชุด Tailwind) ----------
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

  // Home
  const systemStatus = $("systemStatus");
  const inventoryCount = $("inventoryCount");
  const roleHint = $("roleHint");

  // Inventory
  const invSearch = $("invSearch");
  const invCabinetFilter = $("invCabinetFilter");
  const invCategoryFilter = $("invCategoryFilter");
  const refreshInventoryBtn = $("refreshInventoryBtn");
  const exportCsvBtn = $("exportCsvBtn");
  const importCsvInput = $("importCsvInput");
  const invTbody = $("invTbody");
  const invEmpty = $("invEmpty");

  // Daily
  const dailyRoleHint = $("dailyRoleHint");
  const dailyDate = $("dailyDate");
  const dailyShift = $("dailyShift");
  const dailySearch = $("dailySearch");
  const dailyCabinetFilter = $("dailyCabinetFilter");
  const refreshDailyBtn = $("refreshDailyBtn");
  const submitDailyBtn = $("submitDailyBtn");
  const dailyList = $("dailyList");
  const dailyEmpty = $("dailyEmpty");

  // Usage
  const refreshUsageBtn = $("refreshUsageBtn");
  const usageTbody = $("usageTbody");
  const usageEmpty = $("usageEmpty");

  // Admin
  const adminOutput = $("adminOutput");

  // ---------- Utils ----------
  function safeText(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function fmtDateDisplay(yyyyMmDd) {
    if (!yyyyMmDd) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
      const [y, m, d] = yyyyMmDd.split("-");
      return `${d}/${m}/${y}`;
    }
    return yyyyMmDd;
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function showLoading(msg = "Loading...") {
    if (!loadingOverlay) return;
    if (loadingText) loadingText.textContent = msg;
    setVisible(loadingOverlay, true);
  }

  function hideLoading() {
    if (!loadingOverlay) return;
    setVisible(loadingOverlay, false);
  }

  function setMessageBar(type, text) {
    if (!messageBar) return;
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
    if (!messageBar) return;
    setVisible(messageBar, false);
    messageBar.textContent = "";
  }

  function showModal(title, body) {
    if (!modalBackdrop) return;
    if (modalTitle) modalTitle.textContent = title || "Message";
    if (modalBody) modalBody.textContent = body || "";
    setVisible(modalBackdrop, true);
  }

  function hideModal() {
    if (!modalBackdrop) return;
    setVisible(modalBackdrop, false);
    if (modalTitle) modalTitle.textContent = "Message";
    if (modalBody) modalBody.textContent = "";
  }

  function roleIsAdmin() {
    return state.user?.role === "Admin";
  }

  function roleDailyCategory() {
    if (state.user?.role === "RN") return "Medicine";
    if (state.user?.role === "PN") return "Medical Supply";
    return ""; // Admin = all
  }

  // ---------- API Client ----------
  async function apiCall(action, payload = {}, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const retries = opts.retries ?? 1;

    const requestId = uuid();

    // เติม staffId/role อัตโนมัติ (ยกเว้น verifyLogin)
    const NO_AUTH_ACTIONS = new Set(["verifyLogin", "initializeSheets", "debugSelfTest"]); // จะให้ 2 อันหลังมี auth ก็ได้ แต่ไม่บังคับ
    let finalPayload = payload;

    if (!NO_AUTH_ACTIONS.has(action) && state.user && finalPayload && typeof finalPayload === "object" && !Array.isArray(finalPayload)) {
      if (!("staffId" in finalPayload)) finalPayload = { ...finalPayload, staffId: state.user.staffId };
      if (!("role" in finalPayload)) finalPayload = { ...finalPayload, role: state.user.role };
    }

    const bodyObj = { action, payload: finalPayload, requestId, clientTime: nowISO() };

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
        } catch {
          throw new Error(
            [
              "Response is not valid JSON (often CORS/deploy issue).",
              `HTTP ${res.status}`,
              `action=${action}`,
              `requestId=${requestId}`,
              `raw=${raw.slice(0, 300)}`
            ].join("\n")
          );
        }

        json.action = json.action || action;
        json.requestId = json.requestId || requestId;

        if (!json || typeof json.success !== "boolean") {
          throw new Error(`Malformed API envelope: missing success. requestId=${json.requestId}`);
        }

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
        const isNetwork = err instanceof TypeError || /failed to fetch/i.test(String(err?.message || ""));
        const retryable = isAbort || isNetwork;

        if (attempt < retries && retryable) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        throw err;
      } finally {
        clearTimeout(t);
      }
    }

    throw lastErr || new Error("Unknown API error");
  }

  async function apiPing() {
    try {
      const url = new URL(API_BASE_URL);
      url.searchParams.set("action", "ping");
      const res = await fetch(url.toString(), { method: "GET" });
      const txt = await res.text();
      const json = JSON.parse(txt);
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
  const NAV_ADMIN = [{ key: "admin", label: "Admin Console", icon: "fa-shield-halved" }];

  function renderSidebarNav() {
    if (!sidebarNav) return;
    const items = roleIsAdmin() ? [...NAV_COMMON, ...NAV_ADMIN] : [...NAV_COMMON];
    sidebarNav.innerHTML = "";

    for (const it of items) {
      const btn = document.createElement("button");
      btn.className =
        "w-full text-left rounded-xl px-3 py-2 hover:bg-slate-900/60 border border-transparent hover:border-slate-800 flex items-center gap-3";
      btn.dataset.nav = it.key;
      btn.innerHTML = `<i class="fa-solid ${it.icon} text-slate-200 w-5"></i><span class="text-sm text-slate-200">${it.label}</span>`;
      btn.addEventListener("click", () => setView(it.key));
      sidebarNav.appendChild(btn);
    }
  }

  function renderBottomNav() {
    if (!adminCenterBtn) return;
    setVisible(adminCenterBtn, roleIsAdmin());
  }

  function setView(key) {
    if (!views.includes(key)) key = "home";
    views.forEach((k) => setVisible($(`view_${k}`), k === key));
    if (activeViewBadge) activeViewBadge.textContent = key;

    const titleMap = {
      home: "Dashboard",
      inventory: "Inventory",
      daily: "Daily Check",
      usage: "Usage Logs",
      profile: "Profile",
      admin: "Admin Console",
    };
    const headerTitle = document.querySelector("header .text-lg.font-semibold");
    if (headerTitle) headerTitle.textContent = titleMap[key] || "Dashboard";

    if (key === "home") void refreshHome();
    if (key === "inventory") void refreshInventory();
    if (key === "daily") void refreshDaily();
    if (key === "usage") void refreshUsage();
    if (key === "profile") renderProfile();
  }

  // ---------- Data normalize (ให้ตรง backend เดิม) ----------
  function normalizeInventoryRow(r) {
    // backend เดิม: { rowNumber,item,lotNo,qty,minStock,expiryDate,note,cabinet,category }
    return {
      rowNumber: Number(r.rowNumber ?? r.id ?? 0) || undefined,
      item: safeText(r.item ?? r["รายการ"] ?? r.itemName ?? ""),
      lotNo: safeText(r.lotNo ?? r["Lot No"] ?? ""),
      qty: Number(r.qty ?? r["จำนวน"] ?? r.quantity ?? 0) || 0,
      minStock: Number(r.minStock ?? r["Minimum Stock"] ?? r.minimum ?? 0) || 0,
      expiryDate: safeText(r.expiryDate ?? r["วันที่หมดอายุ"] ?? r.expiry ?? ""),
      note: safeText(r.note ?? r["หมายเหตุ"] ?? ""),
      cabinet: safeText(r.cabinet ?? r["ตู้"] ?? ""),
      category: safeText(r.category ?? r["Category"] ?? ""),
    };
  }

  function setCabinetOptions(selectEl, cabinets) {
    if (!selectEl) return;
    const current = selectEl.value || "";
    selectEl.innerHTML =
      `<option value="">ทุกตู้</option>` +
      (cabinets || []).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    selectEl.value = (cabinets || []).includes(current) ? current : "";
  }

  function matchesInvFilters(row) {
    const q = (invSearch?.value || "").trim().toLowerCase();
    const cabinet = invCabinetFilter?.value || "";
    const cat = invCategoryFilter?.value || "";

    if (cabinet && safeText(row.cabinet) !== cabinet) return false;
    if (cat && safeText(row.category) !== cat) return false;

    if (!q) return true;
    const hay = [row.item, row.lotNo, row.note, row.cabinet, row.category].map((v) => safeText(v).toLowerCase()).join(" | ");
    return hay.includes(q);
  }

  function renderInventory() {
    if (!invTbody || !invEmpty) return;

    const filtered = state.inventory.filter(matchesInvFilters);
    invTbody.innerHTML = "";

    if (filtered.length === 0) {
      setVisible(invEmpty, true);
      return;
    }
    setVisible(invEmpty, false);

    for (const r of filtered) {
      const qty = Number(r.qty ?? 0);
      const min = Number(r.minStock ?? 0);
      const low = min > 0 && qty < min;

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-900/40";
      tr.innerHTML = `
        <td class="px-4 py-3">${escapeHtml(r.item || "")}</td>
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

    if (inventoryCount) inventoryCount.textContent = `${state.inventory.length} items`;
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
    if (!dailyList || !dailyEmpty) return;

    const q = (dailySearch?.value || "").trim().toLowerCase();
    const cabinet = dailyCabinetFilter?.value || "";
    const catLimit = roleDailyCategory();

    let items = [...state.inventory];
    if (catLimit) items = items.filter((x) => safeText(x.category) === catLimit);
    if (cabinet) items = items.filter((x) => safeText(x.cabinet) === cabinet);
    if (q) {
      items = items.filter((x) => (`${safeText(x.item)}|${safeText(x.lotNo)}`).toLowerCase().includes(q));
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

        const key = `${it.item}||${it.lotNo}`; // key สำหรับจับคู่ qty/status
        row.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <div class="min-w-0">
              <div class="font-semibold truncate">${escapeHtml(it.item || "")}</div>
              <div class="text-xs text-slate-300">
                Lot: ${escapeHtml(it.lotNo || "-")} • คงเหลือ: ${escapeHtml(it.qty ?? 0)}
                • หมดอายุ: ${escapeHtml(fmtDateDisplay(it.expiryDate || ""))}
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input type="number" min="0" step="1"
                class="dailyQty rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                data-key="${escapeHtml(key)}"
                placeholder="จำนวนที่ตรวจ" value="${escapeHtml(it.qty ?? 0)}"/>
              <select
                class="dailyStatus rounded-xl bg-slate-950/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                data-key="${escapeHtml(key)}">
                <option value="OK">OK</option>
                <option value="LOW">LOW</option>
                <option value="MISSING">MISSING</option>
                <option value="EXPIRED">EXPIRED</option>
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
    if (!usageTbody || !usageEmpty) return;

    usageTbody.innerHTML = "";
    if (!state.usageRows || state.usageRows.length === 0) {
      setVisible(usageEmpty, true);
      return;
    }
    setVisible(usageEmpty, false);

    for (const r of state.usageRows) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-900/40";
      tr.innerHTML = `
        <td class="px-4 py-3">${escapeHtml(fmtDateDisplay(r.date || ""))}</td>
        <td class="px-4 py-3">${escapeHtml(r.item || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.lotNo || "")}</td>
        <td class="px-4 py-3 text-right">${escapeHtml(r.qtyUsed ?? "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.requester || "")}</td>
        <td class="px-4 py-3">${escapeHtml(r.timestamp || "")}</td>
      `;
      usageTbody.appendChild(tr);
    }
  }

  function renderProfile() {
    const u = state.user;
    const box = $("profileBox");
    if (!box) return;

    box.innerHTML = `
      <div class="space-y-1">
        <div><span class="text-slate-400">Name:</span> <span class="font-semibold">${escapeHtml(u?.staffName || "-")}</span></div>
        <div><span class="text-slate-400">StaffID:</span> <span class="font-mono">${escapeHtml(u?.staffId || "-")}</span></div>
        <div><span class="text-slate-400">Role:</span> <span class="font-semibold">${escapeHtml(u?.role || "-")}</span></div>
      </div>
    `;
  }

  // ---------- Loaders (สำคัญ: parse shape ให้ตรง backend เดิม) ----------
  async function refreshCabinets() {
    try {
      const res = await apiCall("getCabinetList", {}, { retries: 1 });
      const cabinets = res?.data?.cabinets ?? res?.data ?? [];
      state.cabinets = Array.isArray(cabinets) ? cabinets.filter(Boolean) : [];
    } catch {
      const set = new Set(state.inventory.map((x) => safeText(x.cabinet)).filter(Boolean));
      state.cabinets = [...set];
    }

    setCabinetOptions(invCabinetFilter, state.cabinets);
    setCabinetOptions(dailyCabinetFilter, state.cabinets);
  }

  async function refreshInventory() {
    clearMessageBar();
    try {
      showLoading("Loading inventory...");
      const res = await apiCall("loadInventory", {}, { retries: 1, timeoutMs: 20000 });

      // backend เดิม: res.data.items
      const items = res?.data?.items ?? res?.data ?? [];
      const arr = Array.isArray(items) ? items : [];
      state.inventory = arr.map(normalizeInventoryRow);

      if (inventoryCount) inventoryCount.textContent = `${state.inventory.length} items`;

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

  async function refreshHome() {
    clearMessageBar();
    try {
      showLoading("Loading system status...");
      const res = await apiCall("getSystemStatus", {}, { retries: 1, timeoutMs: 20000 });
      systemStatus.textContent = safeText(res?.data?.status || res?.data?.ok || "OK");
    } catch (e) {
      if (systemStatus) systemStatus.textContent = "ERROR";
      setMessageBar("error", e.message);
    } finally {
      hideLoading();
    }

    if (inventoryCount) inventoryCount.textContent = `${state.inventory.length} items`;
    if (roleHint) roleHint.textContent = state.user?.role || "-";
  }

  async function refreshDaily() {
    clearMessageBar();

    if (dailyRoleHint) {
      dailyRoleHint.textContent = roleDailyCategory()
        ? `สิทธิ์ของคุณ: ตรวจเฉพาะ Category="${roleDailyCategory()}"`
        : `สิทธิ์ของคุณ: ตรวจได้ทุก Category`;
    }

    if (dailyDate && !dailyDate.value) dailyDate.valueAsDate = new Date();
    if (dailyShift && !dailyShift.value) dailyShift.value = "Day";

    if (!state.inventory.length) await refreshInventory();
    await refreshCabinets();
    renderDaily();
  }

  async function refreshUsage() {
    clearMessageBar();
    try {
      showLoading("Loading usage logs...");
      const res = await apiCall("loadUsageLogs", {}, { retries: 1, timeoutMs: 20000 });

      // backend เดิม: res.data.rows
      const rows = res?.data?.rows ?? res?.data ?? [];
      const arr = Array.isArray(rows) ? rows : [];

      state.usageRows = arr.map((r) => ({
        date: safeText(r.date ?? r["วันที่"] ?? ""),
        item: safeText(r.item ?? r["รายการ"] ?? ""),
        lotNo: safeText(r.lotNo ?? r["Lot No"] ?? ""),
        qtyUsed: Number(r.qtyUsed ?? r["จำนวนที่เบิก"] ?? r.qty ?? 0) || 0,
        requester: safeText(r.requester ?? r["ผู้เบิก"] ?? ""),
        timestamp: safeText(r.timestamp ?? r["Timestamp"] ?? ""),
      }));

      renderUsage();
    } catch (e) {
      setMessageBar("error", e.message);
      state.usageRows = [];
      renderUsage();
    } finally {
      hideLoading();
    }
  }

  // ---------- CSV (Inventory) ----------
  function toCsvValue(v) {
    const s = safeText(v).replaceAll('"', '""');
    return `"${s}"`;
  }

  function exportInventoryCsv() {
    const header = ["รายการ", "Lot No", "จำนวน", "Minimum Stock", "วันที่หมดอายุ", "หมายเหตุ", "ตู้", "Category"];
    const lines = [header.map(toCsvValue).join(",")];

    for (const r of state.inventory) {
      lines.push([r.item, r.lotNo, r.qty, r.minStock, r.expiryDate, r.note, r.cabinet, r.category].map(toCsvValue).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`;
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
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
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
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  }

  function tryNormalizeExpiry(s) {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      return `${y}-${m}-${d}`;
    }
    return s;
  }

  async function importInventoryCsv(file) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV ไม่มีข้อมูล");

    const header = rows[0].map((h) => h.trim());
    const idx = (name) => header.indexOf(name);

    const required = ["รายการ", "Lot No", "จำนวน", "Minimum Stock", "วันที่หมดอายุ", "หมายเหตุ", "ตู้", "Category"];
    for (const h of required) {
      if (idx(h) < 0) throw new Error(`CSV header ขาดคอลัมน์: ${h}`);
    }

    let ok = 0;
    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];
      const itemData = {
        rowNumber: undefined, // add ใหม่; ถ้าต้องการ update ให้ใส่ rowNumber เอง
        item: (line[idx("รายการ")] || "").trim(),
        lotNo: (line[idx("Lot No")] || "").trim(),
        qty: Number(line[idx("จำนวน")] || 0),
        minStock: Number(line[idx("Minimum Stock")] || 0),
        expiryDate: tryNormalizeExpiry((line[idx("วันที่หมดอายุ")] || "").trim()),
        note: (line[idx("หมายเหตุ")] || "").trim(),
        cabinet: (line[idx("ตู้")] || "").trim(),
        category: (line[idx("Category")] || "").trim(),
      };

      if (!itemData.item || !itemData.lotNo) continue;

      showLoading(`Importing... (${r}/${rows.length - 1})`);
      await apiCall("saveInventoryItem", { itemData }, { retries: 1, timeoutMs: 30000 });
      ok++;
    }

    hideLoading();
    showModal("Import CSV", `นำเข้าเสร็จสิ้น: ${ok} รายการ`);
    await refreshInventory();
  }

  // ---------- Daily Submit (ให้ตรง backend เดิม) ----------
  async function submitDaily() {
    clearMessageBar();
    try {
      const date = dailyDate?.value || new Date().toISOString().slice(0, 10);
      const round = dailyShift?.value || "Day";

      // type: Admin เลือกได้เฉพาะ UI อื่น; ในชุดนี้ให้ยึดตาม role
      const wantCategory = roleDailyCategory() || "Medical Supply"; // Admin default supply
      const type = (wantCategory === "Medicine") ? "Medicine" : "Supply"; // backend เดิมใช้ Supply/Medicine

      const qtyEls = [...document.querySelectorAll(".dailyQty")];
      const statusEls = [...document.querySelectorAll(".dailyStatus")];

      const statusMap = new Map(statusEls.map((el) => [el.dataset.key, el.value]));
      const checks = [];

      for (const el of qtyEls) {
        const key = el.dataset.key;
        const [item, lotNo] = String(key || "").split("||");
        const checkedQty = Number(el.value || 0);
        const status = statusMap.get(key) || "OK";

        checks.push({ item, lotNo, checkedQty, status });
      }

      if (checks.length === 0) {
        showModal("Daily Check", "ไม่พบรายการให้บันทึก");
        return;
      }

      showLoading("Submitting daily check...");
      const res = await apiCall("saveDailyCheck", { date, round, type, checks }, { retries: 1, timeoutMs: 30000 });
      hideLoading();
      showModal("Daily Check", `บันทึกสำเร็จ\nrequestId=${res.requestId || "-"}`);
    } catch (e) {
      hideLoading();
      showModal("Daily Check Error", e.message);
    }
  }

  // ---------- Admin ----------
  function setAdminOutput(obj) {
    if (!adminOutput) return;
    adminOutput.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  }

  async function runAdminAction(action) {
    if (!roleIsAdmin()) {
      showModal("Permission", "ต้องเป็น Admin เท่านั้น");
      return;
    }
    try {
      showLoading(`Running ${action}...`);
      const res = await apiCall(action, {}, { retries: 0, timeoutMs: 60000 });
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
    if (!roleIsAdmin() || !adminSheetBackdrop || !adminSheetPanel) return;
    setVisible(adminSheetBackdrop, true);
    requestAnimationFrame(() => {
      adminSheetPanel.classList.remove("translate-y-full");
      adminSheetPanel.classList.add("translate-y-0");
    });
    state.isAdminSheetOpen = true;
  }

  function closeAdminSheet() {
    if (!adminSheetBackdrop || !adminSheetPanel) return;
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
        staffName: d.staffName || d.name || "",
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
    state.usageRows = [];
    state.cabinets = [];
    setVisible(appShell, false);
    setVisible(loginView, true);
    if (adminCenterBtn) setVisible(adminCenterBtn, false);
    closeAdminSheet();
    setMessageBar("info", "Logged out");
    setTimeout(clearMessageBar, 1500);
  }

  async function enterApp() {
    if (loginAppName) loginAppName.textContent = APP_NAME;
    if (appName) appName.textContent = APP_NAME;

    if (loginLogo) loginLogo.src = LOGO_URL;
    if (appLogo) appLogo.src = LOGO_URL;

    const uText = `${state.user.staffName || "-"} (${state.user.staffId || "-"}) • ${state.user.role || "-"}`;
    if (userBadge) userBadge.textContent = uText;
    if (topUserInfo) topUserInfo.textContent = uText;

    renderSidebarNav();
    renderBottomNav();

    setVisible(loginView, false);
    setVisible(appShell, true);

    await refreshInventory(); // <-- สำคัญ: จะ set state.inventory จาก data.items
    await refreshHome();
    setView("home");
  }

  // ---------- Events ----------
  function bindEvents() {
    togglePasswordBtn?.addEventListener("click", () => {
      const isPw = loginPassword.type === "password";
      loginPassword.type = isPw ? "text" : "password";
      if (togglePasswordText) togglePasswordText.textContent = isPw ? "Hide" : "Show";
    });

    modalOkBtn?.addEventListener("click", hideModal);

    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const staffId = (loginStaffId?.value || "").trim();
      const password = loginPassword?.value || "";
      if (!staffId || !password) {
        showModal("Login", "กรุณากรอก StaffID และ Password");
        return;
      }
      await login(staffId, password);
    });

    initSheetsBtn?.addEventListener("click", async () => {
      // สำหรับ first-time setup: เรียก initializeSheets ได้เลย (ไม่บังคับ auth ใน client)
      try {
        showLoading("Initializing sheets...");
        const res = await apiCall("initializeSheets", {}, { retries: 0, timeoutMs: 60000 });
        hideLoading();
        showModal("Initialize Sheets", `สำเร็จ\nrequestId=${res.requestId || "-"}`);
      } catch (e) {
        hideLoading();
        showModal("Initialize Sheets Error", e.message);
      }
    });

    logoutBtnDesktop?.addEventListener("click", logout);
    logoutBtnMobileTop?.addEventListener("click", logout);

    bottomNav?.querySelectorAll("[data-nav]")?.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.nav));
    });

    adminCenterBtn?.addEventListener("click", () => {
      state.isAdminSheetOpen ? closeAdminSheet() : openAdminSheet();
    });
    closeAdminSheetBtn?.addEventListener("click", closeAdminSheet);
    adminSheetDim?.addEventListener("click", closeAdminSheet);

    adminSheetBackdrop?.querySelectorAll("[data-admin-action]")?.forEach((btn) => {
      btn.addEventListener("click", async () => {
        closeAdminSheet();
        await runAdminAction(btn.dataset.adminAction);
      });
    });

    document.querySelectorAll(".adminBtn").forEach((btn) => {
      btn.addEventListener("click", async () => runAdminAction(btn.dataset.adminAction));
    });

    refreshInventoryBtn?.addEventListener("click", refreshInventory);
    invSearch?.addEventListener("input", renderInventory);
    invCabinetFilter?.addEventListener("change", renderInventory);
    invCategoryFilter?.addEventListener("change", renderInventory);

    exportCsvBtn?.addEventListener("click", () => {
      if (!state.inventory.length) {
        showModal("Export CSV", "ไม่มีข้อมูลใน Inventory");
        return;
      }
      exportInventoryCsv();
    });

    importCsvInput?.addEventListener("change", async () => {
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

    refreshDailyBtn?.addEventListener("click", refreshDaily);
    dailySearch?.addEventListener("input", renderDaily);
    dailyCabinetFilter?.addEventListener("change", renderDaily);
    submitDailyBtn?.addEventListener("click", submitDaily);

    refreshUsageBtn?.addEventListener("click", refreshUsage);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modalBackdrop && !modalBackdrop.classList.contains("hidden")) hideModal();
        if (state.isAdminSheetOpen) closeAdminSheet();
      }
    });
  }

  // ---------- Boot ----------
  async function boot() {
    if (loginLogo) loginLogo.src = LOGO_URL;
    if (appLogo) appLogo.src = LOGO_URL;
    if (loginAppName) loginAppName.textContent = APP_NAME;
    if (appName) appName.textContent = APP_NAME;

    const ping = await apiPing();
    if (apiStatusBadge) {
      apiStatusBadge.textContent = ping.ok ? "API: OK" : "API: ERROR";
      apiStatusBadge.className = ping.ok
        ? "text-xs px-2 py-1 rounded-full border border-emerald-700/50 text-emerald-200"
        : "text-xs px-2 py-1 rounded-full border border-rose-700/50 text-rose-200";
    }

    bindEvents();

    const sess = loadSession();
    if (sess?.staffId && sess?.role) {
      state.user = sess;
      await enterApp();
    } else {
      setVisible(loginView, true);
      setVisible(appShell, false);

      if (!API_BASE_URL || API_BASE_URL.includes("<PUT_WEB_APP_EXEC_URL_HERE>")) {
        showModal("Config required", "กรุณาตั้งค่า API_BASE_URL ให้เป็น Apps Script Web App /exec URL");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
