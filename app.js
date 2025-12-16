/* ICU Stock Management — GitHub Pages SPA (Vanilla JS)
 * - fetch POST text/plain;charset=utf-8 to Apps Script Web App
 * - timeout + retry
 * - sessionStorage state
 */

const APP_NAME = "ICU Stock Management";
const TIMEZONE = "Asia/Bangkok";
const LOCALE = "th-TH";
const API_BASE_URL = (window.API_BASE_URL && String(window.API_BASE_URL)) || "<PUT_WEB_APP_EXEC_URL_HERE>";

const sessionKeys = {
  staffId: "icu_staffId",
  staffName: "icu_staffName",
  role: "icu_role"
};

const state = {
  staffId: "",
  staffName: "",
  role: "",
  activeTab: "inventory",
  inventory: [],
  cabinets: []
};

const el = (id) => document.getElementById(id);

function setLoading(on) {
  el("loadingOverlay").hidden = !on;
}

function showMsg(title, bodyHtml) {
  el("msgTitle").textContent = title;
  el("msgBody").innerHTML = bodyHtml;
  el("msgModal").hidden = false;
}

function hideMsg() {
  el("msgModal").hidden = true;
}

function uuidv4() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function formatDisplayDate(ymd) {
  // ymd -> DD/MM/YYYY (Gregorian)
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${dd}/${mm}/${y}`;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/** =========================
 * API CLIENT (timeout + retry)
 * ========================= */
async function apiCall(action, payload = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 1;

  const requestId = uuidv4();
  const clientTime = new Date().toISOString();

  const body = JSON.stringify({
    action,
    payload,
    requestId,
    clientTime
  });

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        signal: controller.signal
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error(
          `Response is not valid JSON. HTTP ${res.status}. ` +
          `This is often a CORS / deployment issue.\n\n` +
          `Raw response (first 300 chars):\n${text.slice(0, 300)}`
        );
      }

      if (!json || typeof json.success !== "boolean") {
        throw new Error("Malformed API envelope. Missing success field.");
      }

      if (!json.success) {
        const rid = json.requestId ? ` (requestId: ${json.requestId})` : "";
        const err = json.error || "ERROR";
        const details = json.details ? `<pre class="pre">${escapeHtml(JSON.stringify(json.details, null, 2))}</pre>` : "";
        const msg = `API error: ${escapeHtml(err)}${rid}${details}`;
        const e2 = new Error(msg);
        e2._api = json;
        throw e2;
      }

      return json;
    } catch (err) {
      lastErr = err;

      // Retry only for network/timeout-like failures
      const isAbort = (err && err.name === "AbortError");
      const isNetwork = (err && String(err.message || "").toLowerCase().includes("failed to fetch"));
      const shouldRetry = attempt < retries && (isAbort || isNetwork);

      if (shouldRetry) {
        await sleep(500 * (attempt + 1));
        continue;
      }

      // add requestId to thrown errors
      err.requestId = requestId;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error("Unknown API error");
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/** =========================
 * SESSION
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

/** =========================
 * RESPONSIVE NAV (BottomNav + ActionSheet)
 * - Toggle Visibility Class via hidden property + class toggles
 * ========================= */
function isAdmin_() {
  return state.role === "Admin";
}

function openSheet_() {
  const s = el("actionSheet");
  if (!s) return;
  s.hidden = false;
}

function closeSheet_() {
  const s = el("actionSheet");
  if (!s) return;
  s.hidden = true;
}

function toggleSheet_() {
  const s = el("actionSheet");
  if (!s) return;
  s.hidden ? openSheet_() : closeSheet_();
}

function updateRoleBasedNav_() {
  // bottom nav visibility per role
  const navMenu = el("navMenu");
  const sheetAdminBtn = el("sheetAdminBtn");

  if (navMenu) navMenu.hidden = !isAdmin_();
  if (sheetAdminBtn) sheetAdminBtn.hidden = !isAdmin_();
}

function setNavActive_() {
  const ids = ["navHome", "navInventory", "navDaily", "navUsage", "navMenu"];
  ids.forEach(id => {
    const b = el(id);
    if (!b) return;
    b.classList.remove("is-active");
  });

  // Highlight logic:
  // - inventory => highlight Inventory
  // - daily => highlight Daily
  // - usage => highlight Usage
  // - reorder/expired/shift/admin => highlight Menu (if admin) else Inventory
  const tab = state.activeTab;
  if (tab === "inventory") el("navInventory")?.classList.add("is-active");
  else if (tab === "daily") el("navDaily")?.classList.add("is-active");
  else if (tab === "usage") el("navUsage")?.classList.add("is-active");
  else if (["reorder","expired","shift","admin"].includes(tab)) {
    if (isAdmin_()) el("navMenu")?.classList.add("is-active");
    else el("navInventory")?.classList.add("is-active");
  }
}

function navigateTo_(tabId) {
  state.activeTab = tabId;
  closeSheet_();
  buildTabs();
  setNavActive_();
  return renderActiveTab();
}

/** =========================
 * UI BOOT
 * ========================= */
function setLoggedInUI(on) {
  el("loginView").hidden = on;
  el("appView").hidden = !on;
  el("userBox").hidden = !on;

  // NEW: Show/hide sidebar + bottom nav
  const sb = el("sidebar");
  const bn = el("bottomNav");
  if (sb) sb.hidden = !on;
  if (bn) bn.hidden = !on;

  if (!on) closeSheet_();

  if (on) {
    el("userName").textContent = state.staffName || state.staffId;
    el("userRole").textContent = state.role || "";
  }

  updateRoleBasedNav_();
  setNavActive_();
}

function buildTabs() {
  const tabs = [
    { id: "inventory", label: "Inventory" },
    { id: "daily", label: "Daily Check" },
    { id: "reorder", label: "Reorder" },
    { id: "expired", label: "Expired" },
    { id: "shift", label: "Shift Summary" },
    { id: "usage", label: "Usage" }
  ];

  if (state.role === "Admin") {
    tabs.push({ id: "admin", label: "Report / Settings" });
  }

  const container = el("tabs");
  container.innerHTML = "";
  tabs.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab" + (state.activeTab === t.id ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => navigateTo_(t.id);
    container.appendChild(b);
  });

  setNavActive_();
}

function setPanelTitle(title) {
  el("panelTitle").textContent = title;
}

function setPanelActions(nodes) {
  const pa = el("panelActions");
  pa.innerHTML = "";
  (nodes || []).forEach(n => pa.appendChild(n));
}

function setPanelBody(html) {
  el("panelBody").innerHTML = html;
}

/** =========================
 * LOGIN FLOW
 * ========================= */
async function onLogin() {
  const staffId = el("loginStaffId").value.trim();
  const password = el("loginPassword").value;

  if (!staffId || !password) {
    showMsg("Login", "กรุณากรอก StaffID และ Password");
    return;
  }

  setLoading(true);
  try {
    const res = await apiCall("verifyLogin", { staffId, password }, { timeoutMs: 15000, retries: 1 });
    const data = res.data;
    saveSession(data.staffId, data.staffName, data.role);

    setLoggedInUI(true);
    buildTabs();
    await primeData();
    await renderActiveTab();
  } catch (err) {
    showMsg("Login failed", `<div class="error">${escapeHtml(err.message || String(err))}</div>`);
  } finally {
    setLoading(false);
  }
}

async function onFirstTimeInit() {
  setLoading(true);
  el("loginInfo").hidden = true;
  try {
    const res = await apiCall("initializeSheets", {}, { timeoutMs: 30000, retries: 0 });
    const b = [];
    b.push(`<div class="ok">Initialize complete.</div>`);
    if (res.data && res.data.bootstrapAdmin && res.data.bootstrapAdmin.created) {
      b.push(
        `<div class="warn"><b>Default Admin Created</b><br/>` +
        `StaffID: <b>${escapeHtml(res.data.bootstrapAdmin.staffId)}</b><br/>` +
        `Password: <b>${escapeHtml(res.data.bootstrapAdmin.password)}</b><br/>` +
        `${escapeHtml(res.data.bootstrapAdmin.note || "")}</div>`
      );
    } else {
      b.push(`<div class="info">Sheets created/ensured. If Staff already exists, please login with existing Admin.</div>`);
    }
    el("loginInfo").innerHTML = b.join("");
    el("loginInfo").hidden = false;
  } catch (err) {
    el("loginInfo").innerHTML = `<div class="error">${escapeHtml(err.message || String(err))}</div>`;
    el("loginInfo").hidden = false;
  } finally {
    setLoading(false);
  }
}

/** =========================
 * DATA PRIMING
 * ========================= */
async function primeData() {
  // Prime cabinet list + inventory cache
  await refreshCabinets();
  await refreshInventory();
}

async function refreshInventory() {
  const res = await apiCall("loadInventory", authPayload({}), { timeoutMs: 20000, retries: 1 });
  state.inventory = (res.data && res.data.items) ? res.data.items : [];
}

async function refreshCabinets() {
  const res = await apiCall("getCabinetList", authPayload({}), { timeoutMs: 15000, retries: 1 });
  state.cabinets = (res.data && res.data.cabinets) ? res.data.cabinets : [];
}

function authPayload(extra) {
  return Object.assign({}, extra || {}, { staffId: state.staffId, role: state.role });
}

/** =========================
 * RENDER TABS
 * ========================= */
async function renderActiveTab() {
  setNavActive_();
  if (state.activeTab === "inventory") return renderInventoryTab();
  if (state.activeTab === "daily") return renderDailyTab();
  if (state.activeTab === "reorder") return renderReorderTab();
  if (state.activeTab === "expired") return renderExpiredTab();
  if (state.activeTab === "shift") return renderShiftTab();
  if (state.activeTab === "usage") return renderUsageTab();
  if (state.activeTab === "admin") return renderAdminTab();
}

/** Inventory */
async function renderInventoryTab() {
  setPanelTitle("Inventory");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await refreshCabinets();
      await refreshInventory();
      await renderInventoryTab();
    });
  });

  setPanelActions([btnRefresh]);

  await withLoading(async () => { await refreshInventory(); });

  const canEdit = (state.role === "Admin");

  const rows = state.inventory.map(it => {
    const exp = it.expiryDate ? formatDisplayDate(it.expiryDate) : "";
    const actions = canEdit
      ? `<div class="row gap">
           <button class="btn btn-sm" data-act="edit" data-id="${it.rowNumber}">Edit</button>
           <button class="btn btn-sm btn-danger" data-act="del" data-id="${it.rowNumber}">Delete</button>
         </div>`
      : `<span class="muted">View only</span>`;

    return `<tr>
      <td>${escapeHtml(it.item)}</td>
      <td>${escapeHtml(it.lotNo)}</td>
      <td class="num">${escapeHtml(it.qty)}</td>
      <td class="num">${escapeHtml(it.minStock)}</td>
      <td>${escapeHtml(exp)}</td>
      <td>${escapeHtml(it.note || "")}</td>
      <td>${escapeHtml(it.cabinet || "")}</td>
      <td>${escapeHtml(it.category || "")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");

  const form = canEdit ? renderInventoryForm() : `<div class="hint">RN/PN สามารถดูรายการได้ แต่แก้ไข Inventory ได้เฉพาะ Admin</div>`;

  setPanelBody(`
    ${form}
    <div class="tablewrap">
      <table class="table">
        <thead>
          <tr>
            <th>รายการ</th><th>Lot No</th><th class="num">จำนวน</th><th class="num">Minimum Stock</th>
            <th>วันที่หมดอายุ</th><th>หมายเหตุ</th><th>ตู้</th><th>Category</th><th>Action</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="9" class="muted">No data</td></tr>`}</tbody>
      </table>
    </div>
  `);

  if (canEdit) {
    // attach edit/delete handlers
    el("panelBody").querySelectorAll("button[data-act]").forEach(b => {
      b.onclick = async () => {
        const act = b.getAttribute("data-act");
        const id = Number(b.getAttribute("data-id"));
        if (act === "del") return onDeleteInventory(id);
        if (act === "edit") return onEditInventory(id);
      };
    });

    el("invCancelEdit")?.addEventListener("click", () => clearInvForm());
    el("invSave")?.addEventListener("click", () => onSaveInventory());
  }
}

function renderInventoryForm() {
  return `
    <div class="card inner">
      <h3>เพิ่ม/แก้ไขรายการ (Admin)</h3>
      <input type="hidden" id="invRowNumber" />
      <div class="grid4">
        <label><div class="label">รายการ</div><input id="invItem" type="text" /></label>
        <label><div class="label">Lot No</div><input id="invLot" type="text" /></label>
        <label><div class="label">จำนวน</div><input id="invQty" type="number" min="0" step="1" value="0" /></label>
        <label><div class="label">Minimum Stock</div><input id="invMin" type="number" min="0" step="1" value="0" /></label>

        <label><div class="label">วันที่หมดอายุ</div><input id="invExp" type="date" /></label>
        <label><div class="label">ตู้</div>
          <input id="invCabinet" list="cabList" placeholder="เช่น A1" />
          <datalist id="cabList">${state.cabinets.map(c => `<option value="${escapeHtml(c)}"></option>`).join("")}</datalist>
        </label>
        <label><div class="label">Category</div>
          <select id="invCat">
            <option value="">(เลือก)</option>
            <option value="Medicine">Medicine</option>
            <option value="Medical Supply">Medical Supply</option>
          </select>
        </label>
        <label><div class="label">หมายเหตุ</div><input id="invNote" type="text" /></label>
      </div>
      <div class="row gap">
        <button class="btn" id="invSave" type="button">Save</button>
        <button class="btn btn-secondary" id="invCancelEdit" type="button">Clear</button>
      </div>
      <div class="hint">หมายเหตุ: Category ใช้สำหรับ RBAC ของ Daily Check (RN=Medicine, PN=Medical Supply)</div>
    </div>
  `;
}

function clearInvForm() {
  el("invRowNumber").value = "";
  el("invItem").value = "";
  el("invLot").value = "";
  el("invQty").value = "0";
  el("invMin").value = "0";
  el("invExp").value = "";
  el("invNote").value = "";
  el("invCabinet").value = "";
  el("invCat").value = "";
}

async function onEditInventory(rowNumber) {
  const it = state.inventory.find(x => Number(x.rowNumber) === Number(rowNumber));
  if (!it) return;

  el("invRowNumber").value = String(it.rowNumber);
  el("invItem").value = it.item || "";
  el("invLot").value = it.lotNo || "";
  el("invQty").value = String(it.qty ?? 0);
  el("invMin").value = String(it.minStock ?? 0);
  el("invExp").value = it.expiryDate || "";
  el("invNote").value = it.note || "";
  el("invCabinet").value = it.cabinet || "";
  el("invCat").value = it.category || "";
  showMsg("Edit", "โหลดข้อมูลเข้าฟอร์มแล้ว (แก้ไขและกด Save)");
}

async function onSaveInventory() {
  const itemData = {
    rowNumber: el("invRowNumber").value ? Number(el("invRowNumber").value) : undefined,
    item: el("invItem").value.trim(),
    lotNo: el("invLot").value.trim(),
    qty: Number(el("invQty").value),
    minStock: Number(el("invMin").value),
    expiryDate: el("invExp").value || "",
    note: el("invNote").value.trim(),
    cabinet: el("invCabinet").value.trim(),
    category: el("invCat").value
  };

  await withLoading(async () => {
    await apiCall("saveInventoryItem", authPayload({ itemData }), { timeoutMs: 30000, retries: 1 });
    await refreshCabinets();
    await refreshInventory();
    clearInvForm();
    await renderInventoryTab();
  });

  showMsg("Saved", "บันทึกเรียบร้อย");
}

async function onDeleteInventory(rowNumber) {
  const ok = confirm(`Delete inventory row ${rowNumber}?`);
  if (!ok) return;

  await withLoading(async () => {
    await apiCall("deleteItem", authPayload({ id: rowNumber }), { timeoutMs: 30000, retries: 1 });
    await refreshInventory();
    await renderInventoryTab();
  });

  showMsg("Deleted", "ลบเรียบร้อย");
}

/** Daily Check */
async function renderDailyTab() {
  setPanelTitle("Daily Check");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => {
      await refreshInventory();
      await renderDailyTab();
    });
  });

  setPanelActions([btnRefresh]);

  await withLoading(async () => { await refreshInventory(); });

  const role = state.role;
  const type = (role === "RN") ? "Medicine" : (role === "PN") ? "Supply" : "Supply";

  const body = `
    <div class="card inner">
      <h3>บันทึกการตรวจประจำเวร</h3>
      <div class="grid3">
        <label><div class="label">วันที่</div><input id="dcDate" type="date" value="${todayYmd()}" /></label>
        <label><div class="label">รอบ</div>
          <select id="dcRound">
            <option value="Day">Day</option>
            <option value="Night">Night</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label><div class="label">ประเภท</div>
          ${role === "Admin" ? `
            <select id="dcType">
              <option value="Supply">Supply (Medical Supply)</option>
              <option value="Medicine">Medicine</option>
            </select>
          ` : `
            <input id="dcType" type="text" value="${escapeHtml(type)}" disabled />
          `}
        </label>
      </div>
      <div class="hint">
        RN ตรวจได้เฉพาะ Category=Medicine • PN ตรวจได้เฉพาะ Category=Medical Supply • Admin เลือกประเภทได้
      </div>
      <div class="row gap">
        <button class="btn" id="dcSave" type="button">Save Daily Check</button>
      </div>
    </div>

    ${renderDailyCheckTable(type)}
  `;

  setPanelBody(body);

  if (role === "Admin") el("dcType").value = "Supply";

  el("dcSave").onclick = async () => {
    const date = el("dcDate").value;
    const round = el("dcRound").value;
    const t = (role === "Admin") ? el("dcType").value : type;

    const checks = [];
    document.querySelectorAll("input[data-dc='qty']").forEach(inp => {
      const item = inp.getAttribute("data-item");
      const lotNo = inp.getAttribute("data-lot");
      const checkedQty = Number(inp.value);
      const st = document.querySelector(`select[data-dc='status'][data-item='${cssEsc(item)}'][data-lot='${cssEsc(lotNo)}']`);
      const status = st ? st.value : "OK";
      checks.push({ item, lotNo, checkedQty, status });
    });

    await withLoading(async () => {
      await apiCall("saveDailyCheck", authPayload({ date, round, type: (t === "Medicine" ? "Medicine" : "Supply"), checks }), { timeoutMs: 30000, retries: 1 });
    });

    showMsg("Saved", "บันทึก Daily Check เรียบร้อย");
  };
}

function renderDailyCheckTable(type) {
  const wantCategory =
    (state.role === "RN") ? "Medicine" :
    (state.role === "PN") ? "Medical Supply" :
    (type === "Medicine") ? "Medicine" : "Medical Supply";

  const items = state.inventory.filter(it => String(it.category || "") === wantCategory);

  const rows = items.map(it => {
    const exp = it.expiryDate ? formatDisplayDate(it.expiryDate) : "";
    return `<tr>
      <td>${escapeHtml(it.item)}</td>
      <td>${escapeHtml(it.lotNo)}</td>
      <td>${escapeHtml(it.cabinet || "")}</td>
      <td>${escapeHtml(exp)}</td>
      <td class="num">${escapeHtml(it.qty)}</td>
      <td class="num">
        <input class="in-sm" data-dc="qty" data-item="${escapeHtmlAttr(it.item)}" data-lot="${escapeHtmlAttr(it.lotNo)}" type="number" min="0" step="1" value="${escapeHtmlAttr(it.qty)}" />
      </td>
      <td>
        <select class="in-sm" data-dc="status" data-item="${escapeHtmlAttr(it.item)}" data-lot="${escapeHtmlAttr(it.lotNo)}">
          <option value="OK">OK</option>
          <option value="LOW">LOW</option>
          <option value="MISSING">MISSING</option>
          <option value="EXPIRED">EXPIRED</option>
        </select>
      </td>
    </tr>`;
  }).join("");

  return `
    <div class="tablewrap">
      <table class="table">
        <thead>
          <tr>
            <th>รายการ</th><th>Lot No</th><th>ตู้</th><th>หมดอายุ</th><th class="num">คงเหลือ</th><th class="num">จำนวนที่ตรวจ</th><th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="muted">No items for category: ${escapeHtml(wantCategory)}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/** Reorder */
async function renderReorderTab() {
  setPanelTitle("Reorder Items");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => { await renderReorderTab(); });
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadReorderItems", authPayload({}), { timeoutMs: 30000, retries: 1 });
    data = res.data;
  });

  const rows = (data.items || []).map(it => `
    <tr>
      <td>${escapeHtml(it.item)}</td>
      <td class="num">${escapeHtml(it.totalQty)}</td>
      <td class="num">${escapeHtml(it.minStock)}</td>
      <td class="num"><b>${escapeHtml(it.reorderQty)}</b></td>
    </tr>
  `).join("");

  setPanelBody(`
    <div class="hint">ระบบคำนวณจาก Inventory (รวมจำนวนต่อ “รายการ”) และซิงก์ไปยังชีต “Reorder Items”</div>
    <div class="tablewrap">
      <table class="table">
        <thead><tr><th>รายการ</th><th class="num">จำนวนรวม</th><th class="num">Minimum Stock</th><th class="num">จำนวนที่ต้องสั่ง</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No reorder needed</td></tr>`}</tbody>
      </table>
    </div>
  `);
}

/** Expired */
async function renderExpiredTab() {
  setPanelTitle("Expired Items");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => { await renderExpiredTab(); });
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadExpiredItems", authPayload({}), { timeoutMs: 30000, retries: 1 });
    data = res.data;
  });

  const rows = (data.items || []).map(it => `
    <tr>
      <td>${escapeHtml(it.item)}</td>
      <td>${escapeHtml(it.lotNo)}</td>
      <td class="num">${escapeHtml(it.qty)}</td>
      <td>${escapeHtml(formatDisplayDate(it.expiryDate))}</td>
      <td>${escapeHtml(it.status)}</td>
    </tr>
  `).join("");

  const soon = (data.soonExpiring || []).slice(0, 20).map(x =>
    `<li>${escapeHtml(x.item)} | Lot ${escapeHtml(x.lotNo)} | Exp ${escapeHtml(formatDisplayDate(x.expiryDate))} | Qty ${escapeHtml(x.qty)}</li>`
  ).join("");

  setPanelBody(`
    <div class="hint">ระบบคำนวณจาก Inventory และซิงก์ไปยังชีต “Expired Items”</div>

    <div class="tablewrap">
      <table class="table">
        <thead><tr><th>รายการ</th><th>Lot No</th><th class="num">จำนวน</th><th>วันที่หมดอายุ</th><th>สถานะ</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">No expired items</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card inner">
      <h3>Expiring Soon (<= 30 days)</h3>
      <ul>${soon || `<li class="muted">None</li>`}</ul>
    </div>
  `);
}

/** Shift Summary */
async function renderShiftTab() {
  setPanelTitle("Shift Summary");

  const btnRefresh = button("Refresh", async () => {
    await withLoading(async () => { await renderShiftTab(); });
  });
  setPanelActions([btnRefresh]);

  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadShiftSummary", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data;
  });

  const rows = (data.rows || []).slice().reverse().slice(0, 200).map(r => `
    <tr>
      <td>${escapeHtml(formatDisplayDate(r.date))}</td>
      <td>${escapeHtml(r.round)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${escapeHtml(r.inspector)}</td>
    </tr>
  `).join("");

  setPanelBody(`
    <div class="tablewrap">
      <table class="table">
        <thead><tr><th>วันที่</th><th>รอบ</th><th>เวลา</th><th>ผู้ตรวจสอบ</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No data</td></tr>`}</tbody>
      </table>
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
    });
  });
  setPanelActions([btnRefresh]);

  await withLoading(async () => { await refreshInventory(); });

  const options = state.inventory.map(it => {
    const label = `${it.item} | Lot ${it.lotNo} | Qty ${it.qty} | Exp ${it.expiryDate || "-"}`;
    return `<option value="${escapeHtmlAttr(it.item)}||${escapeHtmlAttr(it.lotNo)}">${escapeHtml(label)}</option>`;
  }).join("");

  setPanelBody(`
    <div class="card inner">
      <h3>Record Usage</h3>
      <div class="grid3">
        <label><div class="label">วันที่</div><input id="useDate" type="date" value="${todayYmd()}" /></label>
        <label><div class="label">รายการ/ล็อต</div>
          <select id="useSel">
            <option value="">(เลือก)</option>
            ${options}
          </select>
        </label>
        <label><div class="label">จำนวนที่เบิก</div><input id="useQty" type="number" min="1" step="1" value="1" /></label>
        <label><div class="label">ผู้เบิก</div><input id="useRequester" type="text" value="${escapeHtmlAttr(state.staffName || state.staffId)}" /></label>
      </div>
      <div class="row gap">
        <button class="btn" id="btnUseSave" type="button">Save Usage</button>
      </div>
      <div class="hint">ระบบจะตัดสต็อกจาก Inventory (ตาม item+lot) และเพิ่มบรรทัดใน “Usage Logs”</div>
    </div>

    <div id="usageLogs"></div>
  `);

  el("btnUseSave").onclick = async () => {
    const date = el("useDate").value;
    const sel = el("useSel").value;
    const qtyUsed = Number(el("useQty").value);
    const requester = el("useRequester").value.trim();

    if (!sel) return showMsg("Usage", "กรุณาเลือกรายการ/ล็อต");
    const [item, lotNo] = sel.split("||");

    await withLoading(async () => {
      await apiCall("recordUsage", authPayload({ usageData: { date, item, lotNo, qtyUsed, requester } }), { timeoutMs: 30000, retries: 1 });
      await refreshInventory();
      await renderUsageLogs();
    });

    showMsg("Saved", "บันทึกการเบิกเรียบร้อย");
  };

  await renderUsageLogs();
}

async function renderUsageLogs() {
  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadUsageLogs", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data;
  });

  const rows = (data.rows || []).slice().reverse().slice(0, 300).map(r => `
    <tr>
      <td>${escapeHtml(formatDisplayDate(r.date))}</td>
      <td>${escapeHtml(r.item)}</td>
      <td>${escapeHtml(r.lotNo)}</td>
      <td class="num">${escapeHtml(r.qtyUsed)}</td>
      <td>${escapeHtml(r.requester)}</td>
      <td class="muted">${escapeHtml(r.timestamp)}</td>
    </tr>
  `).join("");

  el("usageLogs").innerHTML = `
    <div class="tablewrap">
      <table class="table">
        <thead><tr><th>วันที่</th><th>รายการ</th><th>Lot No</th><th class="num">จำนวนที่เบิก</th><th>ผู้เบิก</th><th>Timestamp</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No usage logs</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

/** Admin */
async function renderAdminTab() {
  setPanelTitle("Report / Settings (Admin)");

  const btnStatus = button("System Status", async () => {
    await withLoading(async () => {
      const res = await apiCall("getSystemStatus", authPayload({}), { timeoutMs: 20000, retries: 1 });
      showMsg("System Status", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  const btnSelfTest = button("debugSelfTest()", async () => {
    await withLoading(async () => {
      const res = await apiCall("debugSelfTest", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("debugSelfTest", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  const btnBackup = button("Backup Now", async () => {
    await withLoading(async () => {
      const res = await apiCall("backupData", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("Backup", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  const btnTrigger = button("Setup Trigger", async () => {
    await withLoading(async () => {
      const res = await apiCall("setupDailyTrigger", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("Trigger", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  const btnAutoEmail = button("Run autoCheckAndEmail()", async () => {
    await withLoading(async () => {
      const res = await apiCall("autoCheckAndEmail", authPayload({}), { timeoutMs: 30000, retries: 0 });
      showMsg("autoCheckAndEmail", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  const btnPdf = button("Generate PDF + Email", async () => {
    await withLoading(async () => {
      const res = await apiCall("generatePDFandEmail", authPayload({}), { timeoutMs: 60000, retries: 0 });
      showMsg("PDF", `<pre class="pre">${escapeHtml(JSON.stringify(res.data, null, 2))}</pre>`);
    });
  });

  setPanelActions([btnStatus, btnSelfTest, btnBackup, btnTrigger, btnAutoEmail, btnPdf]);

  const staffHtml = await renderStaffAdmin();
  const emailHtml = await renderEmailAdmin();

  setPanelBody(`
    <div class="grid2">
      <div>${staffHtml}</div>
      <div>${emailHtml}</div>
    </div>

    <div class="card inner">
      <h3>Notes (Security Hardening)</h3>
      <ul class="hint">
        <li>ปัจจุบันใช้ StaffID/Password แบบง่าย (hash ในชีต) — แนะนำเพิ่ม session token/HMAC และ expiry</li>
        <li>จำกัดการ Deploy Web App ให้ “Anyone” เฉพาะกรณีจำเป็น และควบคุมการเข้าถึงเครือข่าย/โดเมน</li>
        <li>พิจารณาแยก Spreadsheet ต่อหน่วยงานและใช้บัญชีบริการ/Workspace controls</li>
      </ul>
    </div>
  `);

  wireStaffAdminEvents();
  wireEmailAdminEvents();
}

async function renderStaffAdmin() {
  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadStaff", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data;
  });

  const rows = (data.staff || []).map(s => `
    <tr>
      <td>${escapeHtml(s.staffId)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.role)}</td>
      <td class="row gap">
        <button class="btn btn-sm" data-staff-act="edit" data-staff-id="${escapeHtmlAttr(s.staffId)}">Edit</button>
        <button class="btn btn-sm btn-danger" data-staff-act="del" data-staff-id="${escapeHtmlAttr(s.staffId)}">Delete</button>
      </td>
    </tr>
  `).join("");

  return `
    <div class="card inner">
      <h3>Staff (Admin)</h3>

      <input type="hidden" id="stOriginalId" />
      <div class="grid4">
        <label><div class="label">StaffID</div><input id="stId" type="text" /></label>
        <label><div class="label">ชื่อ</div><input id="stName" type="text" /></label>
        <label><div class="label">Role</div>
          <select id="stRole">
            <option value="Admin">Admin</option>
            <option value="RN">RN</option>
            <option value="PN">PN</option>
          </select>
        </label>
        <label><div class="label">Password (ใส่เพื่อเปลี่ยน)</div><input id="stPw" type="password" /></label>
      </div>

      <div class="row gap">
        <button class="btn" id="stSave" type="button">Save (Add/Update)</button>
        <button class="btn btn-secondary" id="stClear" type="button">Clear</button>
      </div>

      <div class="tablewrap">
        <table class="table">
          <thead><tr><th>StaffID</th><th>ชื่อ</th><th>Role</th><th>Action</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4" class="muted">No staff</td></tr>`}</tbody>
        </table>
      </div>

      <div class="hint">Password จะถูกเก็บเป็น SHA-256 hash ในชีต (ไม่ส่งกลับมาที่หน้าเว็บ)</div>
    </div>
  `;
}

function wireStaffAdminEvents() {
  document.querySelectorAll("button[data-staff-act]").forEach(b => {
    b.onclick = async () => {
      const act = b.getAttribute("data-staff-act");
      const sid = b.getAttribute("data-staff-id");
      if (act === "edit") {
        const res = await apiCall("loadStaff", authPayload({}), { timeoutMs: 20000, retries: 1 });
        const rec = (res.data.staff || []).find(x => x.staffId === sid);
        if (!rec) return;
        el("stOriginalId").value = rec.staffId;
        el("stId").value = rec.staffId;
        el("stName").value = rec.name;
        el("stRole").value = rec.role;
        el("stPw").value = "";
        showMsg("Edit Staff", "โหลดข้อมูลเข้าฟอร์มแล้ว (ใส่ Password เฉพาะเมื่อจะเปลี่ยน)");
      }
      if (act === "del") {
        const ok = confirm(`Delete staff ${sid}?`);
        if (!ok) return;
        await withLoading(async () => {
          await apiCall("deleteStaff", authPayload({ staffIdToDelete: sid }), { timeoutMs: 30000, retries: 0 });
          await renderAdminTab();
        });
        showMsg("Deleted", "ลบ Staff เรียบร้อย");
      }
    };
  });

  el("stSave").onclick = async () => {
    const originalStaffId = el("stOriginalId").value.trim();
    const staffData = {
      staffId: el("stId").value.trim(),
      name: el("stName").value.trim(),
      role: el("stRole").value,
      password: el("stPw").value
    };

    if (!staffData.staffId || !staffData.name || !staffData.role) return showMsg("Staff", "กรุณากรอกข้อมูลให้ครบ");

    await withLoading(async () => {
      if (originalStaffId) {
        await apiCall("updateStaff", authPayload({ staffData, originalStaffId }), { timeoutMs: 30000, retries: 0 });
      } else {
        if (!staffData.password) return showMsg("Staff", "การเพิ่ม Staff ใหม่ ต้องกำหนด Password");
        await apiCall("addStaff", authPayload({ staffData }), { timeoutMs: 30000, retries: 0 });
      }
      await renderAdminTab();
    });

    showMsg("Saved", "บันทึก Staff เรียบร้อย");
  };

  el("stClear").onclick = () => {
    el("stOriginalId").value = "";
    el("stId").value = "";
    el("stName").value = "";
    el("stRole").value = "Admin";
    el("stPw").value = "";
  };
}

async function renderEmailAdmin() {
  let data = null;
  await withLoading(async () => {
    const res = await apiCall("loadEmailRecipients", authPayload({}), { timeoutMs: 20000, retries: 1 });
    data = res.data;
  });

  const emails = (data.emails || []).join("\n");

  return `
    <div class="card inner">
      <h3>Email Recipients (Admin)</h3>
      <textarea id="emList" rows="10" placeholder="one email per line">${escapeHtml(emails)}</textarea>
      <div class="row gap">
        <button class="btn" id="emSave" type="button">Save Recipients</button>
      </div>
      <div class="hint">ใช้สำหรับ autoCheckAndEmail() และ generatePDFandEmail()</div>
    </div>
  `;
}

function wireEmailAdminEvents() {
  el("emSave").onclick = async () => {
    const lines = el("emList").value.split("\n").map(x => x.trim()).filter(Boolean);
    await withLoading(async () => {
      await apiCall("updateEmailRecipients", authPayload({ emails: lines }), { timeoutMs: 30000, retries: 0 });
    });
    showMsg("Saved", "อัปเดตรายชื่อผู้รับอีเมลเรียบร้อย");
  };
}

/** =========================
 * UI HELPERS
 * ========================= */
function button(text, onClick) {
  const b = document.createElement("button");
  b.className = "btn btn-secondary";
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

async function withLoading(fn) {
  setLoading(true);
  try {
    return await fn();
  } catch (err) {
    const rid = err && err.requestId ? `<div class="muted">requestId: ${escapeHtml(err.requestId)}</div>` : "";
    showMsg("Error", `<div class="error">${escapeHtml(err.message || String(err))}</div>${rid}`);
    throw err;
  } finally {
    setLoading(false);
  }
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// For querySelector attribute matching; minimal
function cssEsc(s) {
  return String(s || "").replace(/["\\]/g, "\\$&");
}

/** =========================
 * INIT
 * ========================= */
function wireGlobalNavHandlers_() {
  // Delegated clicks for bottom nav + sheet buttons
  document.addEventListener("click", (ev) => {
    const tabBtn = ev.target.closest("[data-go-tab]");
    if (tabBtn) {
      const tab = tabBtn.getAttribute("data-go-tab");
      if (tab) navigateTo_(tab);
      return;
    }

    const toggle = ev.target.closest("[data-toggle-sheet]");
    if (toggle) {
      toggleSheet_();
      return;
    }

    const close = ev.target.closest("[data-close-sheet]");
    if (close) {
      closeSheet_();
      return;
    }

    if (ev.target && ev.target.id === "sheetBackdrop") {
      closeSheet_();
      return;
    }
  });
}

function boot() {
  el("msgOk").onclick = hideMsg;

  wireGlobalNavHandlers_();

  el("btnTogglePw").onclick = () => {
    const p = el("loginPassword");
    if (p.type === "password") {
      p.type = "text";
      el("btnTogglePw").textContent = "Hide";
    } else {
      p.type = "password";
      el("btnTogglePw").textContent = "Show";
    }
  };

  el("btnLogin").onclick = onLogin;
  el("btnFirstTimeInit").onclick = onFirstTimeInit;

  el("btnLogout").onclick = async () => {
    clearSession();
    closeSheet_();
    setLoggedInUI(false);
    el("loginPassword").value = "";
    showMsg("Logout", "Logged out");
  };

  loadSession();

  if (state.staffId && state.role) {
    setLoggedInUI(true);
    buildTabs();
    withLoading(async () => {
      await primeData();
      await renderActiveTab();
    });
  } else {
    setLoggedInUI(false);
  }

  // Quick API_BASE_URL check
  if (!API_BASE_URL || API_BASE_URL.includes("<PUT_WEB_APP_EXEC_URL_HERE>")) {
    showMsg("Config required", `
      <div class="warn">
        กรุณาตั้งค่า <b>window.API_BASE_URL</b> ใน index.html ให้เป็น Apps Script Web App <b>/exec</b> URL
      </div>
    `);
  }
}

document.addEventListener("DOMContentLoaded", boot);
