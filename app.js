/* ICU Stock Management — GitHub Pages SPA (Vanilla JS)
 * ✅ Compatible with the “working logic” you pasted (same API actions/envelope)
 * ✅ Fix: Login “no change” by making DOM binding resilient (supports both old/new index.html IDs)
 * ✅ Adds: Role-based navigation + Desktop Sidebar + Mobile Bottom Nav + Admin Bottom Sheet toggle
 * ✅ Uses: fetch POST text/plain;charset=utf-8 (avoid preflight) + timeout + retry
 *
 * IMPORTANT:
 * - This file assumes your backend returns envelope:
 *   { success:boolean, action, requestId, data, message, error, details, serverTime }
 */

const APP_NAME = "ICU Stock Management";
const TIMEZONE = "Asia/Bangkok";
const LOCALE = "th-TH";
const API_BASE_URL =
  (window.API_BASE_URL && String(window.API_BASE_URL)) ||
  "https://script.google.com/macros/s/AKfycbxk8YusmqCrn0fcPITsHYS_9UIYu9mdT-3R-pKjDyOy8R3TuLekUW0akCm0iWd_X_kcuA/exec"; // you can override in config.js

const sessionKeys = {
  staffId: "icu_staffId",
  staffName: "icu_staffName",
  role: "icu_role",
};

const state = {
  staffId: "",
  staffName: "",
  role: "",
  activeTab: "home",
  inventory: [],
  cabinets: [],
};

const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const $ = (sel, root = document) => root.querySelector(sel);

// Backward/forward compatible element getter (supports both old/new index.html IDs)
function elAny(...ids) {
  for (const id of ids) {
    const n = document.getElementById(id);
    if (n) return n;
  }
  return null;
}

/** =========================
 * UI helpers
 * ========================= */
function setLoading(on, text) {
  const overlay = elAny("loadingOverlay", "loading");
  if (!overlay) return;
  overlay.hidden = !on;

  const t = elAny("loadingText", "loadingLabel");
  if (t && typeof text === "string") t.textContent = text;
}

function showMsg(title, bodyHtml) {
  const modal = elAny("msgModal", "messageModal");
  const titleEl = elAny("msgTitle", "messageTitle");
  const bodyEl = elAny("msgBody", "messageBody");
  if (!modal || !titleEl || !bodyEl) {
    // fallback
    alert(`${title}\n\n${String(bodyHtml).replace(/<[^>]*>/g, "")}`);
    return;
  }
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  modal.hidden = false;
}

function hideMsg() {
  const modal = elAny("msgModal", "messageModal");
  if (modal) modal.hidden = true;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function cssEsc(s) {
  return String(s || "").replace(/["\\]/g, "\\$&");
}

function uuidv4() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDisplayDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setLoggedInUI(on) {
  const loginView = elAny("loginView", "loginPage");
  const appView = elAny("appView", "appShell", "mainApp");
  if (loginView) loginView.hidden = on;
  if (appView) appView.hidden = !on;

  const userName = elAny("userName", "topUserName");
  const userRole = elAny("userRole", "topUserRole");
  if (on) {
    if (userName) userName.textContent = state.staffName || state.staffId || "-";
    if (userRole) userRole.textContent = state.role || "-";
  } else {
    if (userName) userName.textContent = "";
    if (userRole) userRole.textContent = "";
  }

  // show/hide admin sheet button in bottom nav (if exists)
  const adminFab = elAny("adminFabBtn");
  if (adminFab) adminFab.classList.toggle("hidden", state.role !== "Admin");
}

function setPanelTitle(title) {
  const t = elAny("panelTitle", "contentTitle");
  if (t) t.textContent = title;
}
function setPanelActions(nodes) {
  const a = elAny("panelActions", "contentActions");
  if (!a) return;
  a.innerHTML = "";
  (nodes || []).forEach((n) => a.appendChild(n));
}
function setPanelBody(html) {
  const b = elAny("panelBody", "contentBody");
  if (!b) return;
  b.innerHTML = html;
}

function button(text, onClick, variant = "secondary") {
  const b = document.createElement("button");
  b.type = "button";
  b.className =
    variant === "primary"
      ? "px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow"
      : variant === "danger"
        ? "px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold shadow"
        : "px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/10";
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

async function withLoading(fn, label) {
  setLoading(true, label || "Loading...");
  try {
    return await fn();
  } catch (err) {
    const rid = err && err.requestId ? `<div class="text-xs opacity-70 mt-2">requestId: ${escapeHtml(err.requestId)}</div>` : "";
    showMsg("Error", `<div class="text-rose-300 whitespace-pre-wrap">${escapeHtml(err.message || String(err))}</div>${rid}`);
    throw err;
  } finally {
    setLoading(false);
  }
}

/** =========================
 * Session
 * ========================= */
function loadSession() {
  state.staffId = sessionStorage.getItem(sessionKeys.staffId) || "";
  state.staffName = sessionStorage.getItem(sessionKeys.staffName) || "";
  state.role = sessionStorage.getItem(sessionKeys.role) || "";
}
function saveSession(staffId, staffName, role) {
  sessionStorage.setItem(sessionKeys.staffId, staffId);
  sessionStorage.setItem(sessionKeys.staffName, staffName);
  sessionStorage.setItem(sessionKeys.role, role);
  loadSession();
}
function clearSession() {
  sessionStorage.removeItem(sessionKeys.staffId);
  sessionStorage.removeItem(sessionKeys.staffName);
  sessionStorage.removeItem(sessionKeys.role);
  loadSession();
}

function authPayload(extra) {
  return Object.assign({}, extra || {}, { staffId: state.staffId, role: state.role });
}

/** =========================
 * API client
 * ========================= */
async function apiCall(action, payload = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 1;

  const requestId = uuidv4();
  const clientTime = new Date().toISOString();

  const body = JSON.stringify({ action, payload, requestId, clientTime });
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        signal: controller.signal,
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Response is not valid JSON. HTTP ${res.status}.\n` +
            `Possible causes: wrong /exec URL, deployment access, or HTML error page.\n\n` +
            `Raw response (first 300 chars):\n${text.slice(0, 300)}`
        );
      }

      if (!json || typeof json.success !== "boolean") {
        throw new Error("Malformed API envelope. Missing success field.");
      }

      if (!json.success) {
        const rid = json.requestId ? ` (requestId: ${json.requestId})` : "";
        const err = json.error || "ERROR";
        const details = json.details
          ? `<pre class="text-xs bg-black/40 border border-white/10 rounded-xl p-3 mt-3 overflow-auto">${escapeHtml(
              JSON.stringify(json.details, null, 2)
            )}</pre>`
          : "";
        const e2 = new Error(`API error: ${err}${rid}`);
        e2._api = json;
        e2.requestId = requestId;
        // keep details in modal for visibility
        e2.message = `API error: ${err}${rid}\n${json.message ? `\n${json.message}` : ""}`;
        if (details) e2._detailsHtml = details;
        throw e2;
      }

      return json;
    } catch (err) {
      lastErr = err;

      const isAbort = err && err.name === "AbortError";
      const isNetwork = String(err && err.message ? err.message : "").toLowerCase().includes("failed to fetch");
      const shouldRetry = attempt < retries && (isAbort || isNetwork);

      if (shouldRetry) {
        await sleep(500 * (attempt + 1));
        continue;
      }

      err.requestId = requestId;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error("Unknown API error");
}

/** =========================
 * Data loaders
 * ========================= */
async function refreshInventory() {
  const res = await apiCall("loadInventory", authPayload({}), { timeoutMs: 20000, retries: 1 });
  state.inventory = (res.data && res.data.items) ? res.data.items : [];
}
async function refreshCabinets() {
  const res = await apiCall("getCabinetList", authPayload({}), { timeoutMs: 15000, retries: 1 });
  state.cabinets = (res.data && res.data.cabinets) ? res.data.cabinets : [];
}
async function primeData() {
  await refreshCabinets();
  await refreshInventory();
}

/** =========================
 * Navigation (Desktop sidebar + Mobile bottom nav + Admin sheet)
 * ========================= */
function getMenuModel() {
  const common = [
    { id: "home", label: "Home", icon: iconHome },
    { id: "inventory", label: "Inventory", icon: iconBox },
    { id: "daily", label: "Daily Check", icon: iconClipboard },
    { id: "usage", label: "Usage", icon: iconActivity },
  ];
  const more = [
    { id: "reorder", label: "Reorder", icon: iconCart },
    { id: "expired", label: "Expired", icon: iconAlert },
    { id: "shift", label: "Shift Summary", icon: iconClock },
  ];
  const admin = [{ id: "admin", label: "Report / Settings", icon: iconShield }];

  const full = common.concat(more, state.role === "Admin" ? admin : []);
  // bottom nav: 3-4 items + admin FAB
  const bottom = state.role === "Admin"
    ? [
        { id: "home", label: "Home", icon: iconHome },
        { id: "inventory", label: "Inventory", icon: iconBox },
        { id: "daily", label: "Daily", icon: iconClipboard },
        { id: "usage", label: "Usage", icon: iconActivity },
      ]
    : [
        { id: "home", label: "Home", icon: iconHome },
        { id: "inventory", label: "Inventory", icon: iconBox },
        { id: "daily", label: "Daily", icon: iconClipboard },
        { id: "usage", label: "Usage", icon: iconActivity },
      ];

  // admin sheet (grid menu)
  const adminSheet = state.role === "Admin"
    ? [
        { id: "admin", label: "Admin Console", icon: iconShield },
        { id: "reorder", label: "Reorder", icon: iconCart },
        { id: "expired", label: "Expired", icon: iconAlert },
        { id: "shift", label: "Shift Summary", icon: iconClock },
      ]
    : [];

  return { full, bottom, adminSheet };
}

function buildDesktopSidebar() {
  const host = elAny("sidebarNav", "sidebarMenu", "menuList");
  if (!host) return;

  const { full } = getMenuModel();
  host.innerHTML = "";

  full.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 " +
      (state.activeTab === m.id ? "bg-blue-600/20 border-blue-400/30" : "bg-white/5 hover:bg-white/10");
    btn.innerHTML = `
      <span class="shrink-0 opacity-90">${m.icon(20)}</span>
      <span class="text-sm font-semibold">${escapeHtml(m.label)}</span>
    `;
    btn.onclick = () => navTo(m.id);
    host.appendChild(btn);
  });
}

function buildBottomNav() {
  const host = elAny("bottomNav", "mobileNav");
  if (!host) return;

  const { bottom } = getMenuModel();
  const isAdmin = state.role === "Admin";

  host.innerHTML = "";

  // left items (2)
  const left = bottom.slice(0, 2);
  const right = bottom.slice(2);

  const mkItem = (m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-2xl " +
      (state.activeTab === m.id ? "bg-blue-600/20 text-white" : "text-white/80 hover:bg-white/10");
    b.innerHTML = `${m.icon(22)}<span class="text-[11px] font-semibold">${escapeHtml(m.label)}</span>`;
    b.onclick = () => navTo(m.id);
    return b;
  };

  const leftWrap = document.createElement("div");
  leftWrap.className = "flex flex-1 items-center justify-around";
  left.forEach((m) => leftWrap.appendChild(mkItem(m)));

  const rightWrap = document.createElement("div");
  rightWrap.className = "flex flex-1 items-center justify-around";
  right.forEach((m) => rightWrap.appendChild(mkItem(m)));

  host.appendChild(leftWrap);

  // center admin button (FAB) for Admin
  if (isAdmin) {
    const fab = document.createElement("button");
    fab.type = "button";
    fab.id = "adminFabBtn";
    fab.className =
      "mx-2 -mt-7 w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-lg border border-white/20 flex items-center justify-center";
    fab.innerHTML = iconGrid(26);
    fab.onclick = toggleAdminSheet;
    host.appendChild(fab);
  }

  host.appendChild(rightWrap);
}

function buildAdminSheet() {
  const sheet = elAny("adminSheet", "adminBottomSheet");
  const grid = elAny("adminSheetGrid", "adminSheetMenu");
  if (!sheet || !grid) return;

  const { adminSheet } = getMenuModel();
  grid.innerHTML = "";

  adminSheet.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-4 text-left flex gap-3 items-center";
    b.innerHTML = `
      <div class="shrink-0">${m.icon(22)}</div>
      <div>
        <div class="text-sm font-semibold">${escapeHtml(m.label)}</div>
        <div class="text-xs opacity-70">${escapeHtml(APP_NAME)}</div>
      </div>
    `;
    b.onclick = () => {
      toggleAdminSheet(false);
      navTo(m.id);
    };
    grid.appendChild(b);
  });

  const closeBtn = elAny("adminSheetClose");
  if (closeBtn) closeBtn.onclick = () => toggleAdminSheet(false);

  // click backdrop to close
  const backdrop = elAny("adminSheetBackdrop");
  if (backdrop) backdrop.onclick = () => toggleAdminSheet(false);
}

function toggleAdminSheet(force) {
  const sheet = elAny("adminSheet", "adminBottomSheet");
  if (!sheet) return;
  const on = typeof force === "boolean" ? force : sheet.classList.contains("hidden");
  sheet.classList.toggle("hidden", !on);
}

async function navTo(tabId) {
  state.activeTab = tabId;
  buildDesktopSidebar();
  buildBottomNav();
  await renderActiveTab();
}

/** =========================
 * Pages / Tabs
 * ========================= */
async function renderActiveTab() {
  if (state.activeTab === "home") return renderHomeTab();
  if (state.activeTab === "inventory") return renderInventoryTab();
  if (state.activeTab === "daily") return renderDailyTab();
  if (state.activeTab === "reorder") return renderReorderTab();
  if (state.activeTab === "expired") return renderExpiredTab();
  if (state.activeTab === "shift") return renderShiftTab();
  if (state.activeTab === "usage") return renderUsageTab();
  if (state.activeTab === "admin") return renderAdminTab();
  return renderHomeTab();
}

async function renderHomeTab() {
  setPanelTitle("Dashboard");
  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await primeData();
      await renderHomeTab();
    }, "Refreshing...");
  }, "secondary");
  setPanelActions([btnRefresh]);

  const invCount = state.inventory.length;

  setPanelBody(`
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="text-sm opacity-70">System</div>
        <div class="mt-2 text-2xl font-bold">OK</div>
        <div class="mt-2 text-xs opacity-70">Web App + GitHub Pages</div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="text-sm opacity-70">Inventory</div>
        <div class="mt-2 text-2xl font-bold">${escapeHtml(invCount)}</div>
        <div class="mt-2 text-xs opacity-70">items loaded</div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div class="text-sm opacity-70">Role</div>
        <div class="mt-2 text-2xl font-bold">${escapeHtml(state.role || "-")}</div>
        <div class="mt-2 text-xs opacity-70">RN: Medicine • PN: Medical Supply • Admin: All</div>
      </div>
    </div>
  `);
}

/** Inventory (same working logic, improved markup) */
async function renderInventoryTab() {
  setPanelTitle("Inventory");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await refreshCabinets();
      await refreshInventory();
      await renderInventoryTab();
    }, "Loading inventory...");
  });
  setPanelActions([btnRefresh]);

  await withLoading(async () => {
    await refreshInventory();
  }, "Loading inventory...");

  const canEdit = state.role === "Admin";

  const rows = state.inventory.map((it) => {
    const exp = it.expiryDate ? formatDisplayDate(it.expiryDate) : "";
    const actions = canEdit
      ? `
        <div class="flex gap-2">
          <button class="px-3 py-1.5 rounded-xl bg-blue-600/20 border border-blue-400/20 hover:bg-blue-600/30 text-sm font-semibold" data-act="edit" data-id="${it.rowNumber}">Edit</button>
          <button class="px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-400/20 hover:bg-rose-600/30 text-sm font-semibold" data-act="del" data-id="${it.rowNumber}">Delete</button>
        </div>
      `
      : `<span class="text-xs opacity-70">View only</span>`;

    return `
      <tr class="border-t border-white/10">
        <td class="py-3 pr-3 font-semibold">${escapeHtml(it.item)}</td>
        <td class="py-3 pr-3">${escapeHtml(it.lotNo)}</td>
        <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.qty)}</td>
        <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.minStock)}</td>
        <td class="py-3 pr-3">${escapeHtml(exp)}</td>
        <td class="py-3 pr-3">${escapeHtml(it.note || "")}</td>
        <td class="py-3 pr-3">${escapeHtml(it.cabinet || "")}</td>
        <td class="py-3 pr-3">${escapeHtml(it.category || "")}</td>
        <td class="py-3 pr-3">${actions}</td>
      </tr>
    `;
  }).join("");

  const form = canEdit ? renderInventoryForm() : `
    <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm opacity-80">
      RN/PN สามารถดูรายการได้ แต่แก้ไข Inventory ได้เฉพาะ Admin
    </div>`;

  setPanelBody(`
    <div class="space-y-4">
      ${form}

      <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div class="overflow-auto">
          <table class="min-w-[1100px] w-full text-sm">
            <thead class="bg-white/5 text-white/90">
              <tr>
                <th class="text-left p-3">รายการ</th>
                <th class="text-left p-3">Lot No</th>
                <th class="text-right p-3">จำนวน</th>
                <th class="text-right p-3">Minimum Stock</th>
                <th class="text-left p-3">วันที่หมดอายุ</th>
                <th class="text-left p-3">หมายเหตุ</th>
                <th class="text-left p-3">ตู้</th>
                <th class="text-left p-3">Category</th>
                <th class="text-left p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td class="p-4 opacity-70" colspan="9">No data</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);

  if (canEdit) {
    $$("#panelBody button[data-act]").forEach((b) => {
      b.onclick = async () => {
        const act = b.getAttribute("data-act");
        const id = Number(b.getAttribute("data-id"));
        if (act === "del") return onDeleteInventory(id);
        if (act === "edit") return onEditInventory(id);
      };
    });

    elAny("invCancelEdit")?.addEventListener("click", () => clearInvForm());
    elAny("invSave")?.addEventListener("click", () => onSaveInventory());
  }
}

function renderInventoryForm() {
  // Use datalist (same as your working code)
  return `
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-base font-bold">เพิ่ม/แก้ไขรายการ (Admin)</div>
          <div class="text-xs opacity-70 mt-1">Category ใช้สำหรับ RBAC ของ Daily Check (RN=Medicine, PN=Medical Supply)</div>
        </div>
      </div>

      <input type="hidden" id="invRowNumber" />

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
        <label class="block">
          <div class="text-xs opacity-70 mb-1">รายการ</div>
          <input id="invItem" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="text" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">Lot No</div>
          <input id="invLot" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="text" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">จำนวน</div>
          <input id="invQty" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="number" min="0" step="1" value="0" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">Minimum Stock</div>
          <input id="invMin" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="number" min="0" step="1" value="0" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">วันที่หมดอายุ</div>
          <input id="invExp" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="date" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">ตู้</div>
          <input id="invCabinet" list="cabList" placeholder="เช่น A1"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" />
          <datalist id="cabList">${state.cabinets.map((c) => `<option value="${escapeHtmlAttr(c)}"></option>`).join("")}</datalist>
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">Category</div>
          <select id="invCat" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="">(เลือก)</option>
            <option value="Medicine">Medicine</option>
            <option value="Medical Supply">Medical Supply</option>
          </select>
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">หมายเหตุ</div>
          <input id="invNote" class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" type="text" />
        </label>
      </div>

      <div class="flex gap-2 mt-4">
        <button class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow" id="invSave" type="button">Save</button>
        <button class="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold border border-white/10" id="invCancelEdit" type="button">Clear</button>
      </div>
    </div>
  `;
}

function clearInvForm() {
  elAny("invRowNumber").value = "";
  elAny("invItem").value = "";
  elAny("invLot").value = "";
  elAny("invQty").value = "0";
  elAny("invMin").value = "0";
  elAny("invExp").value = "";
  elAny("invNote").value = "";
  elAny("invCabinet").value = "";
  elAny("invCat").value = "";
}

async function onEditInventory(rowNumber) {
  const it = state.inventory.find((x) => Number(x.rowNumber) === Number(rowNumber));
  if (!it) return;

  elAny("invRowNumber").value = String(it.rowNumber);
  elAny("invItem").value = it.item || "";
  elAny("invLot").value = it.lotNo || "";
  elAny("invQty").value = String(it.qty ?? 0);
  elAny("invMin").value = String(it.minStock ?? 0);
  elAny("invExp").value = it.expiryDate || "";
  elAny("invNote").value = it.note || "";
  elAny("invCabinet").value = it.cabinet || "";
  elAny("invCat").value = it.category || "";
  showMsg("Edit", "โหลดข้อมูลเข้าฟอร์มแล้ว (แก้ไขและกด Save)");
}

async function onSaveInventory() {
  const itemData = {
    rowNumber: elAny("invRowNumber").value ? Number(elAny("invRowNumber").value) : undefined,
    item: elAny("invItem").value.trim(),
    lotNo: elAny("invLot").value.trim(),
    qty: Number(elAny("invQty").value),
    minStock: Number(elAny("invMin").value),
    expiryDate: elAny("invExp").value || "",
    note: elAny("invNote").value.trim(),
    cabinet: elAny("invCabinet").value.trim(),
    category: elAny("invCat").value,
  };

  await withLoading(async () => {
    await apiCall("saveInventoryItem", authPayload({ itemData }), { timeoutMs: 30000, retries: 1 });
    await refreshCabinets();
    await refreshInventory();
    clearInvForm();
    await renderInventoryTab();
  }, "Saving...");

  showMsg("Saved", "บันทึกเรียบร้อย");
}

async function onDeleteInventory(rowNumber) {
  const ok = confirm(`Delete inventory row ${rowNumber}?`);
  if (!ok) return;

  await withLoading(async () => {
    await apiCall("deleteItem", authPayload({ id: rowNumber }), { timeoutMs: 30000, retries: 1 });
    await refreshInventory();
    await renderInventoryTab();
  }, "Deleting...");

  showMsg("Deleted", "ลบเรียบร้อย");
}

/** Daily Check */
async function renderDailyTab() {
  setPanelTitle("Daily Check");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await refreshInventory();
      await renderDailyTab();
    }, "Loading daily check...");
  });
  setPanelActions([btnRefresh]);

  await withLoading(async () => {
    await refreshInventory();
  }, "Loading daily check...");

  const role = state.role;
  const type = (role === "RN") ? "Medicine" : (role === "PN") ? "Supply" : "Supply";

  const body = `
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div class="text-base font-bold">บันทึกการตรวจประจำเวร</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <label class="block">
          <div class="text-xs opacity-70 mb-1">วันที่</div>
          <input id="dcDate" type="date"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40"
            value="${todayYmd()}" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">รอบ</div>
          <select id="dcRound"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="Day">Day</option>
            <option value="Night">Night</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">ประเภท</div>
          ${
            role === "Admin"
              ? `
                <select id="dcType"
                  class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40">
                  <option value="Supply">Supply (Medical Supply)</option>
                  <option value="Medicine">Medicine</option>
                </select>
              `
              : `
                <input id="dcType" type="text" value="${escapeHtmlAttr(type)}" disabled
                  class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 opacity-80" />
              `
          }
        </label>
      </div>

      <div class="text-xs opacity-70 mt-3">
        RN ตรวจได้เฉพาะ Category=Medicine • PN ตรวจได้เฉพาะ Category=Medical Supply • Admin เลือกประเภทได้
      </div>

      <div class="mt-4">
        <button class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow" id="dcSave" type="button">
          Save Daily Check
        </button>
      </div>
    </div>

    <div class="mt-4">
      ${renderDailyCheckTable(type)}
    </div>
  `;

  setPanelBody(body);

  if (role === "Admin") elAny("dcType").value = "Supply";

  elAny("dcSave").onclick = async () => {
    const date = elAny("dcDate").value;
    const round = elAny("dcRound").value;
    const t = (role === "Admin") ? elAny("dcType").value : type;

    const checks = [];
    $$("input[data-dc='qty']").forEach((inp) => {
      const item = inp.getAttribute("data-item");
      const lotNo = inp.getAttribute("data-lot");
      const checkedQty = Number(inp.value);
      const st = document.querySelector(
        `select[data-dc='status'][data-item='${cssEsc(item)}'][data-lot='${cssEsc(lotNo)}']`
      );
      const status = st ? st.value : "OK";
      checks.push({ item, lotNo, checkedQty, status });
    });

    await withLoading(async () => {
      await apiCall(
        "saveDailyCheck",
        authPayload({ date, round, type: (t === "Medicine" ? "Medicine" : "Supply"), checks }),
        { timeoutMs: 30000, retries: 1 }
      );
    }, "Saving daily check...");

    showMsg("Saved", "บันทึก Daily Check เรียบร้อย");
  };
}

function renderDailyCheckTable(type) {
  const wantCategory =
    (state.role === "RN") ? "Medicine" :
    (state.role === "PN") ? "Medical Supply" :
    (type === "Medicine") ? "Medicine" : "Medical Supply";

  const items = state.inventory.filter((it) => String(it.category || "") === wantCategory);

  const rows = items.map((it) => {
    const exp = it.expiryDate ? formatDisplayDate(it.expiryDate) : "";
    return `
      <tr class="border-t border-white/10">
        <td class="py-3 pr-3 font-semibold">${escapeHtml(it.item)}</td>
        <td class="py-3 pr-3">${escapeHtml(it.lotNo)}</td>
        <td class="py-3 pr-3">${escapeHtml(it.cabinet || "")}</td>
        <td class="py-3 pr-3">${escapeHtml(exp)}</td>
        <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.qty)}</td>
        <td class="py-3 pr-3 text-right">
          <input class="w-28 rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40 text-right"
            data-dc="qty" data-item="${escapeHtmlAttr(it.item)}" data-lot="${escapeHtmlAttr(it.lotNo)}"
            type="number" min="0" step="1" value="${escapeHtmlAttr(it.qty)}" />
        </td>
        <td class="py-3 pr-3">
          <select class="w-40 rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40"
            data-dc="status" data-item="${escapeHtmlAttr(it.item)}" data-lot="${escapeHtmlAttr(it.lotNo)}">
            <option value="OK">OK</option>
            <option value="LOW">LOW</option>
            <option value="MISSING">MISSING</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-[900px] w-full text-sm">
          <thead class="bg-white/5 text-white/90">
            <tr>
              <th class="text-left p-3">รายการ</th>
              <th class="text-left p-3">Lot No</th>
              <th class="text-left p-3">ตู้</th>
              <th class="text-left p-3">หมดอายุ</th>
              <th class="text-right p-3">คงเหลือ</th>
              <th class="text-right p-3">จำนวนที่ตรวจ</th>
              <th class="text-left p-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr><td class="p-4 opacity-70" colspan="7">No items for category: ${escapeHtml(wantCategory)}</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/** Reorder */
async function renderReorderTab() {
  setPanelTitle("Reorder Items");
  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => await renderReorderTab(), "Loading reorder...");
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadReorderItems", authPayload({}), { timeoutMs: 30000, retries: 1 });
    data = res.data || {};
  }, "Loading reorder...");

  const rows = (data.items || []).map((it) => `
    <tr class="border-t border-white/10">
      <td class="py-3 pr-3 font-semibold">${escapeHtml(it.item)}</td>
      <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.totalQty)}</td>
      <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.minStock)}</td>
      <td class="py-3 pr-3 text-right tabular-nums font-bold">${escapeHtml(it.reorderQty)}</td>
    </tr>
  `).join("");

  setPanelBody(`
    <div class="text-xs opacity-70 mb-3">
      ระบบคำนวณจาก Inventory (รวมจำนวนต่อ “รายการ”) และซิงก์ไปยังชีต “Reorder Items”
    </div>

    <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-[700px] w-full text-sm">
          <thead class="bg-white/5 text-white/90">
            <tr>
              <th class="text-left p-3">รายการ</th>
              <th class="text-right p-3">จำนวนรวม</th>
              <th class="text-right p-3">Minimum Stock</th>
              <th class="text-right p-3">จำนวนที่ต้องสั่ง</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="p-4 opacity-70" colspan="4">No reorder needed</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `);
}

/** Expired */
async function renderExpiredTab() {
  setPanelTitle("Expired Items");
  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => await renderExpiredTab(), "Loading expired...");
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadExpiredItems", authPayload({}), { timeoutMs: 30000, retries: 1 });
    data = res.data || {};
  }, "Loading expired...");

  const rows = (data.items || []).map((it) => `
    <tr class="border-t border-white/10">
      <td class="py-3 pr-3 font-semibold">${escapeHtml(it.item)}</td>
      <td class="py-3 pr-3">${escapeHtml(it.lotNo)}</td>
      <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(it.qty)}</td>
      <td class="py-3 pr-3">${escapeHtml(formatDisplayDate(it.expiryDate))}</td>
      <td class="py-3 pr-3">${escapeHtml(it.status)}</td>
    </tr>
  `).join("");

  const soon = (data.soonExpiring || []).slice(0, 20).map((x) =>
    `<li class="py-1">${escapeHtml(x.item)} | Lot ${escapeHtml(x.lotNo)} | Exp ${escapeHtml(formatDisplayDate(x.expiryDate))} | Qty ${escapeHtml(x.qty)}</li>`
  ).join("");

  setPanelBody(`
    <div class="text-xs opacity-70 mb-3">ระบบคำนวณจาก Inventory และซิงก์ไปยังชีต “Expired Items”</div>

    <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-[800px] w-full text-sm">
          <thead class="bg-white/5 text-white/90">
            <tr>
              <th class="text-left p-3">รายการ</th>
              <th class="text-left p-3">Lot No</th>
              <th class="text-right p-3">จำนวน</th>
              <th class="text-left p-3">วันที่หมดอายุ</th>
              <th class="text-left p-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="p-4 opacity-70" colspan="5">No expired items</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="rounded-2xl border border-white/10 bg-white/5 p-5 mt-4">
      <div class="text-base font-bold">Expiring Soon (<= 30 days)</div>
      <ul class="text-sm opacity-90 mt-3">${soon || `<li class="opacity-70">None</li>`}</ul>
    </div>
  `);
}

/** Shift Summary */
async function renderShiftTab() {
  setPanelTitle("Shift Summary");
  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => await renderShiftTab(), "Loading shift...");
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadShiftSummary", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data || {};
  }, "Loading shift...");

  const rows = (data.rows || []).slice().reverse().slice(0, 200).map((r) => `
    <tr class="border-t border-white/10">
      <td class="py-3 pr-3">${escapeHtml(formatDisplayDate(r.date))}</td>
      <td class="py-3 pr-3">${escapeHtml(r.round)}</td>
      <td class="py-3 pr-3">${escapeHtml(r.time)}</td>
      <td class="py-3 pr-3 font-semibold">${escapeHtml(r.inspector)}</td>
    </tr>
  `).join("");

  setPanelBody(`
    <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-[700px] w-full text-sm">
          <thead class="bg-white/5 text-white/90">
            <tr>
              <th class="text-left p-3">วันที่</th>
              <th class="text-left p-3">รอบ</th>
              <th class="text-left p-3">เวลา</th>
              <th class="text-left p-3">ผู้ตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="p-4 opacity-70" colspan="4">No data</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `);
}

/** Usage */
async function renderUsageTab() {
  setPanelTitle("Usage");
  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await refreshInventory();
      await renderUsageTab();
    }, "Loading usage...");
  });
  setPanelActions([btnRefresh]);

  await withLoading(async () => {
    await refreshInventory();
  }, "Loading usage...");

  const options = state.inventory.map((it) => {
    const label = `${it.item} | Lot ${it.lotNo} | Qty ${it.qty} | Exp ${it.expiryDate || "-"}`;
    return `<option value="${escapeHtmlAttr(it.item)}||${escapeHtmlAttr(it.lotNo)}">${escapeHtml(label)}</option>`;
  }).join("");

  setPanelBody(`
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div class="text-base font-bold">Record Usage</div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <label class="block">
          <div class="text-xs opacity-70 mb-1">วันที่</div>
          <input id="useDate" type="date" value="${todayYmd()}"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" />
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">รายการ/ล็อต</div>
          <select id="useSel"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="">(เลือก)</option>
            ${options}
          </select>
        </label>

        <label class="block">
          <div class="text-xs opacity-70 mb-1">จำนวนที่เบิก</div>
          <input id="useQty" type="number" min="1" step="1" value="1"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" />
        </label>

        <label class="block md:col-span-2">
          <div class="text-xs opacity-70 mb-1">ผู้เบิก</div>
          <input id="useRequester" type="text" value="${escapeHtmlAttr(state.staffName || state.staffId)}"
            class="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/40" />
        </label>
      </div>

      <div class="mt-4">
        <button class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow" id="btnUseSave" type="button">Save Usage</button>
      </div>

      <div class="text-xs opacity-70 mt-3">ระบบจะตัดสต็อกจาก Inventory (ตาม item+lot) และเพิ่มบรรทัดใน “Usage Logs”</div>
    </div>

    <div id="usageLogs" class="mt-4"></div>
  `);

  elAny("btnUseSave").onclick = async () => {
    const date = elAny("useDate").value;
    const sel = elAny("useSel").value;
    const qtyUsed = Number(elAny("useQty").value);
    const requester = elAny("useRequester").value.trim();

    if (!sel) return showMsg("Usage", "กรุณาเลือกรายการ/ล็อต");
    const [item, lotNo] = sel.split("||");

    await withLoading(async () => {
      await apiCall(
        "recordUsage",
        authPayload({ usageData: { date, item, lotNo, qtyUsed, requester } }),
        { timeoutMs: 30000, retries: 1 }
      );
      await refreshInventory();
      await renderUsageLogs();
    }, "Saving usage...");

    showMsg("Saved", "บันทึกการเบิกเรียบร้อย");
  };

  await renderUsageLogs();
};

async function renderUsageLogs() {
  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadUsageLogs", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data || {};
  }, "Loading logs...");

  const rows = (data.rows || []).slice().reverse().slice(0, 300).map((r) => `
    <tr class="border-t border-white/10">
      <td class="py-3 pr-3">${escapeHtml(formatDisplayDate(r.date))}</td>
      <td class="py-3 pr-3 font-semibold">${escapeHtml(r.item)}</td>
      <td class="py-3 pr-3">${escapeHtml(r.lotNo)}</td>
      <td class="py-3 pr-3 text-right tabular-nums">${escapeHtml(r.qtyUsed)}</td>
      <td class="py-3 pr-3">${escapeHtml(r.requester)}</td>
      <td class="py-3 pr-3 text-xs opacity-70">${escapeHtml(r.timestamp)}</td>
    </tr>
  `).join("");

  const host = elAny("usageLogs");
  if (!host) return;

  host.innerHTML = `
    <div class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div class="overflow-auto">
        <table class="min-w-[900px] w-full text-sm">
          <thead class="bg-white/5 text-white/90">
            <tr>
              <th class="text-left p-3">วันที่</th>
              <th class="text-left p-3">รายการ</th>
              <th class="text-left p-3">Lot No</th>
              <th class="text-right p-3">จำนวนที่เบิก</th>
              <th class="text-left p-3">ผู้เบิก</th>
              <th class="text-left p-3">Timestamp</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td class="p-4 opacity-70" colspan="6">No usage logs</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

/** Admin (kept as simple action buttons; you can expand UI later) */
async function renderAdminTab() {
  setPanelTitle("Report / Settings (Admin)");

  const btnStatus = button("System Status", async () => {
    await withLoading(async () => {
      const res = await apiCall("getSystemStatus", authPayload({}), { timeoutMs: 20000, retries: 1 });
      showMsg("System Status", `<pre class="text-xs bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    }, "Loading status...");
  });

  const btnSelfTest = button("debugSelfTest()", async () => {
    await withLoading(async () => {
      const res = await apiCall("debugSelfTest", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("debugSelfTest", `<pre class="text-xs bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    }, "Running self test...");
  });

  const btnBackup = button("Backup Now", async () => {
    await withLoading(async () => {
      const res = await apiCall("backupData", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("Backup", `<pre class="text-xs bg-black/40 border border-white/10 rounded-xl p-3 overflow-auto">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    }, "Backing up...");
  });

  setPanelActions([btnStatus, btnSelfTest, btnBackup]);

  setPanelBody(`
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div class="text-base font-bold">Admin Console</div>
      <div class="text-sm opacity-80 mt-2">
        ใช้ปุ่มด้านบนเพื่อดูสถานะระบบ / self-test / backup
      </div>
      <div class="text-xs opacity-70 mt-4">
        หมายเหตุ: UI ส่วนจัดการ Staff/Email สามารถย้ายไปอยู่ใน Admin Bottom Sheet ได้ตามไฟล์ Word แนบ
      </div>
    </div>
  `);
}

/** =========================
 * Login flow
 * ========================= */
async function onLogin() {
  const staffIdEl = elAny("loginStaffId", "staffIdInput", "staffId");
  const pwEl = elAny("loginPassword", "passwordInput", "password");
  if (!staffIdEl || !pwEl) {
    showMsg("Login", "ไม่พบ input ของ Login (ตรวจสอบ index.html IDs)");
    return;
  }

  const staffId = staffIdEl.value.trim();
  const password = pwEl.value;

  if (!staffId || !password) {
    showMsg("Login", "กรุณากรอก StaffID และ Password");
    return;
  }

  await withLoading(async () => {
    const res = await apiCall("verifyLogin", { staffId, password }, { timeoutMs: 15000, retries: 1 });

    const data = res.data || {};
    saveSession(data.staffId, data.staffName, data.role);

    setLoggedInUI(true);

    // Build navigation UI for role
    buildDesktopSidebar();
    buildBottomNav();
    buildAdminSheet();

    await primeData();

    // default landing
    state.activeTab = "home";
    await renderActiveTab();
  }, "Signing in...");
}

async function onFirstTimeInit() {
  const info = elAny("loginInfo");
  if (info) info.hidden = true;

  await withLoading(async () => {
    const res = await apiCall("initializeSheets", {}, { timeoutMs: 30000, retries: 0 });

    const b = [];
    b.push(`<div class="text-emerald-300 font-semibold">Initialize complete.</div>`);
    if (res.data && res.data.bootstrapAdmin && res.data.bootstrapAdmin.created) {
      b.push(
        `<div class="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div class="font-semibold text-amber-200">Default Admin Created</div>
          <div class="text-sm mt-2">StaffID: <b>${escapeHtml(res.data.bootstrapAdmin.staffId)}</b></div>
          <div class="text-sm">Password: <b>${escapeHtml(res.data.bootstrapAdmin.password)}</b></div>
          <div class="text-xs opacity-70 mt-2">${escapeHtml(res.data.bootstrapAdmin.note || "")}</div>
        </div>`
      );
    } else {
      b.push(`<div class="text-sm opacity-80 mt-2">Sheets created/ensured. If Staff already exists, please login with existing Admin.</div>`);
    }

    if (info) {
      info.innerHTML = b.join("");
      info.hidden = false;
    } else {
      showMsg("Initialize", b.join(""));
    }
  }, "Initializing sheets...");
}

/** =========================
 * Boot
 * ========================= */
function boot() {
  // modal ok
  elAny("msgOk", "messageOk")?.addEventListener("click", hideMsg);

  // login buttons
  elAny("btnLogin", "loginBtn")?.addEventListener("click", onLogin);
  elAny("btnFirstTimeInit", "initBtn")?.addEventListener("click", onFirstTimeInit);

  // toggle pw
  elAny("btnTogglePw", "togglePwBtn")?.addEventListener("click", () => {
    const p = elAny("loginPassword", "passwordInput", "password");
    const t = elAny("btnTogglePw", "togglePwBtn");
    if (!p || !t) return;
    if (p.type === "password") {
      p.type = "text";
      t.textContent = "Hide";
    } else {
      p.type = "password";
      t.textContent = "Show";
    }
  });

  // logout
  elAny("btnLogout", "logoutBtn")?.addEventListener("click", () => {
    clearSession();
    setLoggedInUI(false);
    const p = elAny("loginPassword", "passwordInput", "password");
    if (p) p.value = "";
    state.activeTab = "home";
    showMsg("Logout", "Logged out");
  });

  // close admin sheet if ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleAdminSheet(false);
  });

  loadSession();

  // startup
  if (state.staffId && state.role) {
    setLoggedInUI(true);
    withLoading(async () => {
      buildDesktopSidebar();
      buildBottomNav();
      buildAdminSheet();
      await primeData();
      state.activeTab = "home";
      await renderActiveTab();
    }, "Loading...");
  } else {
    setLoggedInUI(false);
  }

  // config guard
  if (!API_BASE_URL || API_BASE_URL.includes("<PUT_WEB_APP_EXEC_URL_HERE>")) {
    showMsg(
      "Config required",
      `<div class="text-amber-200">
        กรุณาตั้งค่า <b>window.API_BASE_URL</b> ให้เป็น Apps Script Web App <b>/exec</b> URL
      </div>`
    );
  }
}

document.addEventListener("DOMContentLoaded", boot);

/** =========================
 * Icons (inline SVG)
 * ========================= */
function svgIcon(pathD, size = 22) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="opacity-90">
      <path d="${pathD}"></path>
    </svg>
  `;
}
function iconHome(size) {
  return svgIcon("M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z", size);
}
function iconBox(size) {
  return svgIcon("M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", size);
}
function iconClipboard(size) {
  return svgIcon("M9 2h6a2 2 0 0 1 2 2v2h-2V4H9v2H7V4a2 2 0 0 1 2-2zM7 8h10v14H7z", size);
}
function iconActivity(size) {
  return svgIcon("M22 12h-4l-3 9-4-18-3 9H2", size);
}
function iconCart(size) {
  return svgIcon("M6 6h15l-1.5 9h-13zM6 6l-2-3H1M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", size);
}
function iconAlert(size) {
  return svgIcon("M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01", size);
}
function iconClock(size) {
  return svgIcon("M12 8v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", size);
}
function iconShield(size) {
  return svgIcon("M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6z", size);
}
function iconGrid(size) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="opacity-95">
      <rect x="3" y="3" width="7" height="7" rx="2"></rect>
      <rect x="14" y="3" width="7" height="7" rx="2"></rect>
      <rect x="3" y="14" width="7" height="7" rx="2"></rect>
      <rect x="14" y="14" width="7" height="7" rx="2"></rect>
    </svg>
  `;
}
