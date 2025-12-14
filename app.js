/* ICU Stock Management - GitHub Pages frontend with additional pages
 *
 * This script drives the UI for the ICU stock management app when
 * deployed to GitHub Pages. It communicates with a Google Apps Script
 * backend via a JSON API (post requests with an `action` parameter).
 *
 * Key features:
 *   • Responsive layout: fixed sidebar on desktop, bottom nav on mobile.
 *   • Role based navigation: Admin, RN and PN see different menus.
 *   • Bottom action sheet for Admin on mobile to access extra pages.
 *   • Handles inventory (view, add/edit/delete), daily checks, reorder,
 *     expired items, reporting with PDF/email, staff management, profile.
 *   • NEW: Shift summary tab, usage logs tab, backup tab and settings tab.
 *   • Uses fetch() to talk to the backend, storing a session token on
 *     successful login. Basic error handling is included.
 */

const CFG = window.APP_CONFIG || {};

// Constants for roles
const ROLES = { ADMIN: "Admin", RN: "RN", PN: "PN" };

// Define the menu structure. Each entry maps to a tab section by id.
// Only roles present in the `roles` array can see the menu entry. Some
// entries are hidden on the sidebar (e.g. profile) but accessible via
// other means.
const MENU = [
  { id: "dashboardTab", label: "หน้าแรก", icon: "fa-house", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "dailyCheckSupplyTab", label: "ตรวจสต็อกเวชภัณฑ์", icon: "fa-clipboard-check", roles: [ROLES.ADMIN, ROLES.PN] },
  { id: "dailyCheckMedicineTab", label: "ตรวจสต็อกยา", icon: "fa-clipboard-check", roles: [ROLES.ADMIN, ROLES.RN] },
  { id: "inventoryTab", label: "คลัง", icon: "fa-boxes-stacked", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "reorderTab", label: "รายการต้องสั่งซื้อ", icon: "fa-cart-shopping", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "expiredTab", label: "รายการใกล้หมดอายุ", icon: "fa-triangle-exclamation", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "reportTab", label: "รายงาน", icon: "fa-file-pdf", roles: [ROLES.ADMIN] },
  { id: "userManagementTab", label: "จัดการสมาชิก", icon: "fa-users", roles: [ROLES.ADMIN] },
  // new pages
  { id: "shiftSummaryTab", label: "สรุปรอบ", icon: "fa-clock", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "usageLogTab", label: "เบิกจ่าย", icon: "fa-notes-medical", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "backupTab", label: "สำรองข้อมูล", icon: "fa-cloud-arrow-down", roles: [ROLES.ADMIN] },
  { id: "settingsTab", label: "ตั้งค่า", icon: "fa-gear", roles: [ROLES.ADMIN] },
  { id: "profileTab", label: "โปรไฟล์", icon: "fa-user", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN], hiddenOnSidebar: true }
];

// Buttons available in the admin action sheet on mobile. These items
// mirror the admin-only menu entries and those less commonly used on
// small screens. Clicking an item switches to the corresponding tab.
const ADMIN_SHEET_MENU = [
  { id: "reorderTab", label: "Reorder", icon: "fa-cart-shopping" },
  { id: "expiredTab", label: "Expiry", icon: "fa-triangle-exclamation" },
  { id: "reportTab", label: "Report", icon: "fa-file-pdf" },
  { id: "userManagementTab", label: "Users", icon: "fa-users" },
  { id: "shiftSummaryTab", label: "Shift", icon: "fa-clock" },
  { id: "usageLogTab", label: "Usage", icon: "fa-notes-medical" },
  { id: "backupTab", label: "Backup", icon: "fa-cloud-arrow-down" },
  { id: "settingsTab", label: "Settings", icon: "fa-gear" }
];

// Shortcuts for DOM queries
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Global state stores the logged in session and loaded data. Some
// collections are loaded via getSnapshot(), while others are loaded on
// demand (shift summaries, usage logs, settings).
const state = {
  session: null, // {staffId, staffName, role, token}
  data: {
    inventory: [],
    reorder: [],
    expired: [],
    staff: [],
    emailRecipients: [],
    cabinets: [],
    shiftSummary: [],
    usageLogs: [],
    settings: {
      emailList: [],
      expiryThresholds: { critical: 30, warning: 60, caution: 180 }
    }
  },
  currentTab: "dashboardTab",
  editItemImageUrl: ""
};

/* ------------------------ Utility functions ------------------------ */

/** Display a toast notification for a short time. */
function showToast(msg) {
  const toast = $("#toast");
  $("#toastInner").textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

/** Show loading overlay with optional message. */
function showLoading(text = "กำลังโหลด...") {
  $("#loadingText").textContent = text;
  $("#loading").classList.remove("hidden");
}

/** Hide loading overlay. */
function hideLoading() {
  $("#loading").classList.add("hidden");
}

/** Format date/time for Thai locale. */
function nowTh() {
  return new Date().toLocaleString("th-TH");
}

/** Simple API helper. Sends a POST request with JSON encoded payload to
 * the configured API_URL. Adds session token and staffId if present.
 * Throws error on non-success or network issues. */
async function api(action, payload = {}) {
  const url = CFG.API_URL;
  if (!url) throw new Error("API_URL is not configured");

  const body = {
    action,
    ...payload,
    staffId: state.session?.staffId || payload.staffId,
    token: state.session?.token || payload.token
  };

  const opt = {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    redirect: "follow"
  };
  let res;
  try {
    res = await fetch(url, opt);
  } catch (err) {
    throw new Error("Network error: " + err.message);
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error("API response is not valid JSON: " + text.slice(0, 200)); }
  if (!json.success) throw new Error(json.error || "API error");
  return json;
}

/** Persist session in sessionStorage. */
function saveSession(sess) {
  state.session = sess;
  sessionStorage.setItem("ICU_SESSION", JSON.stringify(sess));
}

/** Load session from sessionStorage if available. */
function loadSession() {
  const raw = sessionStorage.getItem("ICU_SESSION");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Clear session. */
function clearSession() {
  state.session = null;
  sessionStorage.removeItem("ICU_SESSION");
}

/** Check whether the current user can access a given menu item. */
function roleAllows(menuId) {
  const m = MENU.find(x => x.id === menuId);
  if (!m) return false;
  return m.roles.includes(state.session.role);
}

/** Update user badges and profile info in the UI. */
function setUserBadges() {
  const t = `${state.session.staffName} • ${state.session.role}`;
  $("#userBadge").textContent = t;
  $("#userBadgeMobile").textContent = t;
  $("#profileStaffId").textContent = state.session.staffId;
  $("#profileStaffName").textContent = state.session.staffName;
  $("#profileRole").textContent = state.session.role;
  $("#kpiRole").textContent = state.session.role;
}

/** Load brand logo and name into UI elements. */
function setBrand() {
  $("#brandLogoLogin").src = CFG.LOGO_URL;
  $("#brandNameLogin").textContent = CFG.BRAND_NAME;
  $("#brandLogo").src = CFG.LOGO_URL;
  $("#brandName").textContent = CFG.BRAND_NAME;
  $("#brandLogoMobile").src = CFG.LOGO_URL;
  $("#brandNameMobile").textContent = CFG.BRAND_NAME;
}

/** Build sidebar navigation based on role. */
function buildSidebar() {
  const nav = $("#sidebarNav");
  nav.innerHTML = "";
  MENU.forEach(m => {
    if (m.hiddenOnSidebar) return;
    if (!m.roles.includes(state.session.role)) return;
    const btn = document.createElement("button");
    btn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-slate-50";
    btn.dataset.tab = m.id;
    btn.innerHTML = `<i class="fa-solid ${m.icon} text-slate-700 w-5"></i><span class="text-slate-800">${m.label}</span>`;
    btn.addEventListener("click", () => showTab(m.id));
    nav.appendChild(btn);
  });
  highlightSidebar();
}

/** Highlight the active tab in the sidebar. */
function highlightSidebar() {
  $$("#sidebarNav button").forEach(b => {
    const active = b.dataset.tab === state.currentTab;
    b.classList.toggle("bg-slate-900", active);
    b.classList.toggle("text-white", active);
    const icon = b.querySelector("i");
    if (icon) {
      icon.classList.toggle("text-white", active);
      icon.classList.toggle("text-slate-700", !active);
    }
  });
}

/** Switch to a specific tab. Performs role checks. */
function showTab(tabId) {
  // On mobile, dailyCheckAuto resolves to supply or medicine based on role.
  if (tabId === "dailyCheckAuto") {
    tabId = (state.session.role === ROLES.RN) ? "dailyCheckMedicineTab" : "dailyCheckSupplyTab";
  }
  if (!roleAllows(tabId)) {
    showToast("ไม่มีสิทธิ์เข้าหน้านี้");
    return;
  }
  state.currentTab = tabId;
  $$(".tabContent").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove("hidden");
  highlightSidebar();
  // Render content for the tab
  if (tabId === "dashboardTab") renderDashboard();
  if (tabId === "inventoryTab") renderInventory();
  if (tabId === "reorderTab") renderReorder();
  if (tabId === "expiredTab") renderExpired();
  if (tabId === "reportTab") renderReport();
  if (tabId === "userManagementTab") renderStaff();
  if (tabId === "dailyCheckSupplyTab") renderDaily("supply");
  if (tabId === "dailyCheckMedicineTab") renderDaily("medicine");
  if (tabId === "shiftSummaryTab") renderShiftSummary();
  if (tabId === "usageLogTab") renderUsageLogs();
  if (tabId === "backupTab") renderBackup();
  if (tabId === "settingsTab") renderSettings();
}

/** Show/hide admin fab on bottom nav based on role. */
function setBottomNavForRole() {
  const fab = $("#adminFab");
  fab.classList.toggle("hidden", state.session.role !== ROLES.ADMIN);
}

/** Build the admin action sheet grid. */
function buildAdminSheetGrid() {
  const grid = $("#adminSheetGrid");
  grid.innerHTML = "";
  ADMIN_SHEET_MENU.forEach(item => {
    const b = document.createElement("button");
    b.className = "rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50";
    b.innerHTML = `
      <div class="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
        <i class="fa-solid ${item.icon}"></i>
      </div>
      <div class="mt-2 text-sm font-semibold">${item.label}</div>`;
    b.addEventListener("click", () => {
      closeAdminSheet();
      showTab(item.id);
    });
    grid.appendChild(b);
  });
}

/** Open admin sheet (mobile). */
function openAdminSheet() {
  $("#adminSheetOverlay").classList.remove("hidden");
  requestAnimationFrame(() => $("#adminSheet").classList.remove("sheet-hidden"));
  $("#adminSheet").classList.add("sheet-show");
}

/** Close admin sheet. */
function closeAdminSheet() {
  $("#adminSheet").classList.add("sheet-hidden");
  setTimeout(() => $("#adminSheetOverlay").classList.add("hidden"), 200);
}

/** Convert expiry days to a badge string. */
function formatExpiryBadge(item) {
  const d = item.expiryDays;
  if (d === null || d === undefined) return `<span class="text-slate-400">-</span>`;
  if (d <= 0) return `<span class="text-red-700 font-semibold">หมดอายุ</span>`;
  if (d <= 30) return `<span class="text-red-700 font-semibold">≤30 วัน</span>`;
  if (d <= 60) return `<span class="text-amber-700 font-semibold">≤60 วัน</span>`;
  if (d <= 180) return `<span class="text-yellow-700 font-semibold">≤180 วัน</span>`;
  return `<span class="text-slate-500">ปกติ</span>`;
}

/** Show item details in modal. */
async function openItemDetail(itemName) {
  showLoading("กำลังโหลดรายละเอียด...");
  try {
    const r = await api("getItemDetail", { itemName });
    const d = r.data;
    const lotsHtml = (d.lots || []).map(l => `
      <tr class="border-t border-slate-100">
        <td class="py-2 pr-3">${l.lotNo}</td>
        <td class="py-2 pr-3">${l.quantity}</td>
        <td class="py-2 pr-3">${l.expiryDate || "-"}</td>
        <td class="py-2 pr-3">${l.cabinet || "-"}</td>
      </tr>
    `).join("");
    const img = d.imageUrl
      ? `<img src="${d.imageUrl}" class="w-24 h-24 rounded-2xl object-cover border border-slate-200" />`
      : `<div class="w-24 h-24 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><i class="fa-solid fa-image"></i></div>`;
    $("#itemModalBody").innerHTML = `
      <div class="flex gap-4">
        ${img}
        <div class="min-w-0">
          <div class="text-base font-semibold">${d.name}</div>
          <div class="text-sm text-slate-600 mt-1">คงเหลือรวม: <span class="font-semibold">${d.totalQty}</span></div>
          <div class="text-sm text-slate-600">วันหมดอายุใกล้สุด: <span class="font-semibold">${d.nearestExpiry?.expiryDate || "-"}</span> (จำนวน ${d.nearestExpiry?.quantity || "-"})</div>
          <div class="text-sm text-slate-600">รับเข้าล่าสุด: <span class="font-semibold">${d.lastIn ? `${d.lastIn.qty} (${d.lastIn.date})` : "-"}</span></div>
          <div class="text-sm text-slate-600">เบิกล่าสุด: <span class="font-semibold">${d.lastOut ? `${d.lastOut.qty} (${d.lastOut.date})` : "-"}</span></div>
        </div>
      </div>
      <div class="mt-4 rounded-2xl border border-slate-200 p-3">
        <div class="font-semibold mb-2">Lots</div>
        <div class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead class="text-xs text-slate-500">
              <tr><th class="text-left py-2 pr-3">Lot</th><th class="text-left py-2 pr-3">จำนวน</th><th class="text-left py-2 pr-3">Expiry</th><th class="text-left py-2 pr-3">ตู้</th></tr>
            </thead>
            <tbody>${lotsHtml || `<tr><td colspan="4" class="py-3 text-slate-500">—</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
    $("#itemModal").classList.remove("hidden");
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Close item detail modal. */
function closeItemModal() { $("#itemModal").classList.add("hidden"); }

/** Open item edit modal for adding or editing. */
function openItemEditModal() { $("#itemEditModal").classList.remove("hidden"); }

/** Close item edit modal. */
function closeItemEditModal() { $("#itemEditModal").classList.add("hidden"); }

/** Reset the item form fields to default. */
function resetItemForm() {
  $("#itemId").value = "";
  $("#itemName").value = "";
  $("#itemLot").value = "";
  $("#itemQty").value = 0;
  $("#itemMin").value = 5;
  $("#itemExpiry").value = "";
  $("#itemCabinet").value = "";
  $("#itemCategory").value = "Medical Supply";
  $("#itemNote").value = "";
  $("#itemImage").value = "";
  state.editItemImageUrl = "";
}

/** Open add item modal for admin. */
function openAddItem() {
  if (state.session.role !== ROLES.ADMIN) return;
  $("#itemEditTitle").textContent = "เพิ่มรายการ";
  resetItemForm();
  openItemEditModal();
}

/** Open edit item modal with existing data. */
function openEditItem(id) {
  if (state.session.role !== ROLES.ADMIN) return;
  const item = state.data.inventory.find(x => String(x.id) === String(id));
  if (!item) return;
  $("#itemEditTitle").textContent = "แก้ไขรายการ";
  $("#itemId").value = item.id;
  $("#itemName").value = item.name || "";
  $("#itemLot").value = item.lotNo || "";
  $("#itemQty").value = item.quantity ?? 0;
  $("#itemMin").value = item.minimumStock ?? 5;
  $("#itemExpiry").value = item.expiryDate || "";
  $("#itemCabinet").value = item.cabinet || "";
  $("#itemCategory").value = item.category || "Medical Supply";
  $("#itemNote").value = item.note || "";
  $("#itemImage").value = "";
  state.editItemImageUrl = item.imageUrl || "";
  openItemEditModal();
}

/** Delete an inventory item after confirmation. */
async function deleteItem(id) {
  if (state.session.role !== ROLES.ADMIN) return;
  if (!confirm("ยืนยันลบรายการนี้?")) return;
  showLoading("กำลังลบ...");
  try {
    const res = await api("deleteItem", { id });
    showToast(res.message || "ลบสำเร็จ");
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Convert a File to base64 string (without prefix). */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Save inventory item on form submit. Handles upload if file selected. */
async function saveItem(ev) {
  ev.preventDefault();
  if (state.session.role !== ROLES.ADMIN) return;
  showLoading("กำลังบันทึกรายการ...");
  try {
    let imageUrl = state.editItemImageUrl;
    const file = $("#itemImage").files?.[0];
    if (file) {
      const b64 = await fileToBase64(file);
      const up = await api("uploadItemImage", {
        filename: file.name,
        mimeType: file.type || "image/jpeg",
        base64: b64
      });
      imageUrl = up.data.imageUrl;
    }
    const payload = {
      itemData: {
        id: $("#itemId").value || "",
        name: $("#itemName").value.trim(),
        lotNo: $("#itemLot").value.trim(),
        quantity: parseInt($("#itemQty").value || "0", 10),
        minimumStock: parseInt($("#itemMin").value || "5", 10),
        expiryDate: $("#itemExpiry").value.trim(),
        note: $("#itemNote").value.trim(),
        cabinet: $("#itemCabinet").value.trim(),
        category: $("#itemCategory").value,
        imageUrl
      }
    };
    const res = await api("saveInventoryItem", payload);
    showToast(res.message || "บันทึกสำเร็จ");
    closeItemEditModal();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Format snapshot data to update KPIs and top lists. */
function renderDashboard() {
  $("#lastSyncText").textContent = nowTh();
  $("#kpiLots").textContent = state.data.inventory.length;
  $("#kpiReorder").textContent = state.data.reorder.length;
  $("#kpiExpiry").textContent = state.data.expired.length;
  // top 5 reorder and expiry items
  const reorderTop = state.data.reorder.slice(0, 5).map(r => `• ${r.name} (ต้องสั่ง ${r.toOrder})`).join("<br>") || "—";
  const expiryTop = state.data.expired.slice(0, 5).map(x => `• ${x.name} (Lot ${x.lotNo}) ${x.expiryDate} — ${x.status}`).join("<br>") || "—";
  $("#reorderTop").innerHTML = reorderTop;
  $("#expiryTop").innerHTML = expiryTop;
}

/** Render reorder list. */
function renderReorder() {
  const tb = $("#reorderTbody");
  tb.innerHTML = "";
  if (!state.data.reorder.length) {
    tb.innerHTML = `<tr><td colspan="4" class="py-4 text-slate-500">ไม่มีรายการ</td></tr>`;
    return;
  }
  state.data.reorder.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-2 pr-3">${r.name}</td>
      <td class="py-2 pr-3">${r.totalQty}</td>
      <td class="py-2 pr-3">${r.minimumStock}</td>
      <td class="py-2 pr-3 font-semibold">${r.toOrder}</td>`;
    tb.appendChild(tr);
  });
}

/** Render expired items list. Shows admin-only button. */
function renderExpired() {
  const tb = $("#expiredTbody");
  tb.innerHTML = "";
  if (!state.data.expired.length) {
    tb.innerHTML = `<tr><td colspan="5" class="py-4 text-slate-500">ไม่มีรายการ</td></tr>`;
  } else {
    state.data.expired.forEach(x => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="py-2 pr-3">${x.name}</td>
        <td class="py-2 pr-3">${x.lotNo}</td>
        <td class="py-2 pr-3">${x.quantity}</td>
        <td class="py-2 pr-3">${x.expiryDate}</td>
        <td class="py-2 pr-3">${x.status}</td>`;
      tb.appendChild(tr);
    });
  }
  $("#sendExpirySummaryBtn").classList.toggle("hidden", state.session.role !== ROLES.ADMIN);
}

/** Render report tab. Only admin sees send report button. */
function renderReport() {
  const isAdmin = (state.session.role === ROLES.ADMIN);
  $("#sendReportBtn").classList.toggle("hidden", !isAdmin);
  const box = $("#emailRecipientsBox");
  const emails = state.data.emailRecipients || [];
  box.innerHTML = emails.length ? emails.map(e => `• ${e}`).join("<br>") : "—";
}

/** Send PDF report via API. */
async function sendReport() {
  showLoading("กำลังสร้าง PDF และส่งอีเมล...");
  try {
    const r = await api("sendReportManually", {});
    showToast(r.message || "ส่งรายงานสำเร็จ");
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Send expiry summary email via API. */
async function sendExpirySummary() {
  showLoading("กำลังส่งอีเมลสรุปใกล้หมดอายุ...");
  try {
    const r = await api("sendExpirySummaryEmail", {});
    showToast(r.message || "ส่งสำเร็จ");
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Render inventory list. Includes filters and admin actions. */
function renderInventory() {
  const isAdmin = (state.session.role === ROLES.ADMIN);
  $("#openAddItemBtn").classList.toggle("hidden", !isAdmin);
  // fill cabinet selects (inventory + daily) only once
  fillCabinetSelect($("#inventoryCabinet"), state.data.cabinets);
  fillCabinetSelect($("#dailySupplyCabinet"), state.data.cabinets);
  fillCabinetSelect($("#dailyMedicineCabinet"), state.data.cabinets);
  const search = ($("#inventorySearch").value || "").toLowerCase().trim();
  const cab = $("#inventoryCabinet").value;
  const cat = $("#inventoryCategory").value;
  let rows = state.data.inventory.slice();
  if (cat) rows = rows.filter(x => (x.category || "") === cat);
  if (cab) rows = rows.filter(x => (x.cabinet || "") === cab);
  if (search) {
    rows = rows.filter(x => {
      return (x.name || "").toLowerCase().includes(search) ||
             (x.lotNo || "").toLowerCase().includes(search) ||
             (x.cabinet || "").toLowerCase().includes(search) ||
             (x.category || "").toLowerCase().includes(search);
    });
  }
  const tb = $("#inventoryTbody");
  tb.innerHTML = "";
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8" class="py-4 text-slate-500">ไม่มีรายการ</td></tr>`;
    return;
  }
  rows.forEach(item => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2 pr-3 font-medium">${item.name}</td>
      <td class="py-2 pr-3">${item.lotNo}</td>
      <td class="py-2 pr-3">${item.quantity}</td>
      <td class="py-2 pr-3">${item.minimumStock}</td>
      <td class="py-2 pr-3">${item.expiryDate || "-"} ${formatExpiryBadge(item)}</td>
      <td class="py-2 pr-3">${item.cabinet || "-"}</td>
      <td class="py-2 pr-3">${item.category || "-"}</td>
      <td class="py-2 text-right">
        ${isAdmin ? `
          <button class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-white text-xs" data-act="edit" data-id="${item.id}">แก้ไข</button>
          <button class="ml-1 px-2 py-1 rounded-lg border border-slate-200 hover:bg-white text-xs text-red-700" data-act="del" data-id="${item.id}">ลบ</button>
        ` : `<button class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-white text-xs" data-act="view" data-name="${encodeURIComponent(item.name)}">ดู</button>`}
      </td>
    `;
    // row-level events
    tr.addEventListener("click", ev => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      ev.stopPropagation();
      const act = btn.dataset.act;
      if (act === "edit") openEditItem(btn.dataset.id);
      if (act === "del") deleteItem(btn.dataset.id);
      if (act === "view") openItemDetail(decodeURIComponent(btn.dataset.name));
    });
    tr.addEventListener("dblclick", () => openItemDetail(item.name));
    tb.appendChild(tr);
  });
}

/** Helper to fill a <select> with cabinet options. */
function fillCabinetSelect(sel, cabinets) {
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "ทุกตู้";
  sel.appendChild(optAll);
  cabinets.forEach(c => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });
}

/** Render daily check (supply or medicine). Checks role and fills table. */
function renderDaily(kind) {
  const isSupply = (kind === "supply");
  const role = state.session.role;
  // guard roles: RN cannot do supply, PN cannot do medicine (like original)
  if (isSupply && !(role === ROLES.ADMIN || role === ROLES.PN)) {
    showToast("RN ไม่สามารถตรวจเวชภัณฑ์");
    showTab("dashboardTab");
    return;
  }
  if (!isSupply && !(role === ROLES.ADMIN || role === ROLES.RN)) {
    showToast("PN ไม่สามารถตรวจยา");
    showTab("dashboardTab");
    return;
  }
  // set shift label
  const shift = currentShiftLocal();
  if (isSupply) $("#dailySupplyShift").textContent = shift;
  else $("#dailyMedicineShift").textContent = shift;
  // build rows
  const search = (isSupply ? $("#dailySupplySearch").value : $("#dailyMedicineSearch").value).toLowerCase().trim();
  const cab = (isSupply ? $("#dailySupplyCabinet").value : $("#dailyMedicineCabinet").value);
  const category = isSupply ? "Medical Supply" : "Medicine";
  let rows = state.data.inventory.filter(x => (x.category || "") === category);
  if (cab) rows = rows.filter(x => (x.cabinet || "") === cab);
  if (search) {
    rows = rows.filter(x => {
      return (x.name || "").toLowerCase().includes(search) ||
             (x.lotNo || "").toLowerCase().includes(search) ||
             (x.cabinet || "").toLowerCase().includes(search);
    });
  }
  const tb = isSupply ? $("#dailySupplyTbody") : $("#dailyMedicineTbody");
  tb.innerHTML = "";
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" class="py-4 text-slate-500">ไม่มีรายการ</td></tr>`;
    return;
  }
  rows.forEach(x => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-2 pr-3">${x.name}</td>
      <td class="py-2 pr-3">${x.lotNo}</td>
      <td class="py-2 pr-3">${x.quantity}</td>
      <td class="py-2 pr-3"><input data-check="qty" data-id="${x.id}" type="number" min="0" class="w-24 rounded-xl border border-slate-200 px-2 py-1 text-sm" value="${x.quantity}"></td>
      <td class="py-2 pr-3">${x.cabinet || "-"}</td>
      <td class="py-2 pr-3">${x.expiryDate || "-"} ${formatExpiryBadge(x)}</td>
    `;
    tb.appendChild(tr);
  });
}

/** Save daily check to backend. */
async function saveDaily(kind) {
  const isSupply = (kind === "supply");
  const tb = isSupply ? $("#dailySupplyTbody") : $("#dailyMedicineTbody");
  const inputs = Array.from(tb.querySelectorAll('input[data-check="qty"]'));
  const mapById = new Map(state.data.inventory.map(x => [String(x.id), x]));
  const records = inputs.map(inp => {
    const item = mapById.get(String(inp.dataset.id));
    const counted = parseInt(inp.value || "0", 10);
    return {
      date: new Date().toLocaleDateString("th-TH"),
      name: item.name,
      lotNo: item.lotNo,
      expectedQty: item.quantity,
      countedQty: counted,
      cabinet: item.cabinet || "",
      category: item.category || "",
      shift: currentShiftLocal()
    };
  }).filter(r => r.category === (isSupply ? "Medical Supply" : "Medicine"));
  if (!records.length) {
    showToast("ไม่มีรายการให้บันทึก");
    return;
  }
  showLoading("กำลังบันทึก...");
  try {
    const r = await api("saveDailyCheckEx", { checkType: isSupply ? "Supply" : "Medicine", records });
    showToast(r.message || "บันทึกสำเร็จ");
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Render staff management table. Only admin allowed. */
function renderStaff() {
  if (state.session.role !== ROLES.ADMIN) {
    showToast("ต้องเป็น Admin");
    showTab("dashboardTab");
    return;
  }
  const tb = $("#staffTbody");
  tb.innerHTML = "";
  const rows = state.data.staff || [];
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="4" class="py-4 text-slate-500">ไม่มีข้อมูล</td></tr>`;
    return;
  }
  rows.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-2 pr-3">${s.id}</td>
      <td class="py-2 pr-3">${s.name}</td>
      <td class="py-2 pr-3">${s.role}</td>
      <td class="py-2 text-right">
        <button class="px-2 py-1 rounded-lg border border-slate-200 hover:bg-white text-xs" data-act="edit">แก้ไข</button>
        <button class="ml-1 px-2 py-1 rounded-lg border border-slate-200 hover:bg-white text-xs text-red-700" data-act="del">ลบ</button>
      </td>
    `;
    tr.addEventListener("click", async ev => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "edit") {
        $("#staffEditMode").value = "true";
        $("#staffIdInput").value = s.id;
        $("#staffIdInput").disabled = true;
        $("#staffNameInput").value = s.name;
        $("#staffRoleInput").value = s.role;
        $("#staffPassInput").value = "";
      }
      if (act === "del") {
        if (!confirm(`ยืนยันลบ ${s.id}?`)) return;
        showLoading("กำลังลบผู้ใช้...");
        try {
          const r = await api("deleteStaff", { staffIdToDelete: s.id });
          showToast(r.message || "ลบสำเร็จ");
          await refreshAll();
        } catch (err) {
          showToast(err.message);
        } finally {
          hideLoading();
        }
      }
    });
    tb.appendChild(tr);
  });
}

/** Reset staff form. */
function resetStaffForm() {
  $("#staffEditMode").value = "false";
  $("#staffIdInput").disabled = false;
  $("#staffIdInput").value = "";
  $("#staffNameInput").value = "";
  $("#staffPassInput").value = "";
  $("#staffRoleInput").value = "Admin";
}

/** Save staff (add or update). */
async function saveStaff(ev) {
  ev.preventDefault();
  if (state.session.role !== ROLES.ADMIN) return;
  const isEdit = $("#staffEditMode").value === "true";
  const id = $("#staffIdInput").value.trim();
  const name = $("#staffNameInput").value.trim();
  const password = $("#staffPassInput").value.trim();
  const role = $("#staffRoleInput").value;
  if (!id || !name || !password || password.length < 6) {
    showToast("กรอกข้อมูลให้ครบ และรหัสผ่านอย่างน้อย 6 ตัวอักษร");
    return;
  }
  showLoading(isEdit ? "กำลังอัปเดต..." : "กำลังเพิ่ม...");
  try {
    const action = isEdit ? "updateStaff" : "addStaff";
    const r = await api(action, { userData: { staffId: id, name, password, role } });
    showToast(r.message || "บันทึกสำเร็จ");
    resetStaffForm();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Determine current shift based on hour (local). */
function currentShiftLocal() {
  const h = new Date().getHours();
  if (h >= 7 && h < 15) return "เช้า";
  if (h >= 15 && h < 23) return "บ่าย";
  return "ดึก";
}

/* --------------------- NEW: Shift Summary --------------------- */

/** Render shift summary table. Loads data from backend if necessary. */
async function renderShiftSummary() {
  // Admin sees add button
  $("#addShiftSummaryBtn").classList.toggle("hidden", state.session.role !== ROLES.ADMIN);
  showLoading("กำลังโหลดสรุปรอบ...");
  try {
    // fetch if not loaded or want refresh
    const res = await api("getShiftSummary", {});
    state.data.shiftSummary = res.data || [];
    const tb = $("#shiftSummaryTbody");
    tb.innerHTML = "";
    if (!state.data.shiftSummary.length) {
      tb.innerHTML = `<tr><td colspan="4" class="py-4 text-slate-500">ไม่มีข้อมูล</td></tr>`;
    } else {
      state.data.shiftSummary.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="py-2 pr-3">${row.date}</td>
          <td class="py-2 pr-3">${row.round}</td>
          <td class="py-2 pr-3">${row.staffName}</td>
          <td class="py-2 pr-3">${row.details}</td>
        `;
        tb.appendChild(tr);
      });
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Open shift summary modal. */
function openShiftModal() { $("#shiftModal").classList.remove("hidden"); }

/** Close shift summary modal. */
function closeShiftModal() { $("#shiftModal").classList.add("hidden"); }

/** Save a shift summary. Only admin allowed. */
async function saveShiftSummary(ev) {
  ev.preventDefault();
  if (state.session.role !== ROLES.ADMIN) return;
  const round = $("#shiftRound").value;
  const details = $("#shiftDetails").value.trim();
  if (!round || !details) {
    showToast("กรอกข้อมูลให้ครบ");
    return;
  }
  showLoading("กำลังบันทึก...");
  try {
    const r = await api("saveShiftSummary", { round, details });
    showToast(r.message || "บันทึกสำเร็จ");
    closeShiftModal();
    await renderShiftSummary();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/* --------------------- NEW: Usage Logs --------------------- */

/** Render usage logs table. */
async function renderUsageLogs() {
  // Admin sees add usage button
  $("#addUsageBtn").classList.toggle("hidden", state.session.role !== ROLES.ADMIN);
  showLoading("กำลังโหลดประวัติการเบิกจ่าย...");
  try {
    const res = await api("loadUsageLogs", {});
    state.data.usageLogs = res.data || [];
    const tb = $("#usageLogTbody");
    tb.innerHTML = "";
    if (!state.data.usageLogs.length) {
      tb.innerHTML = `<tr><td colspan="5" class="py-4 text-slate-500">ไม่มีข้อมูล</td></tr>`;
    } else {
      state.data.usageLogs.forEach(log => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="py-2 pr-3">${log.date}</td>
          <td class="py-2 pr-3">${log.name}</td>
          <td class="py-2 pr-3">${log.lotNo}</td>
          <td class="py-2 pr-3">${log.quantity}</td>
          <td class="py-2 pr-3">${log.staffName}</td>
        `;
        tb.appendChild(tr);
      });
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Open usage modal. */
function openUsageModal() { $("#usageModal").classList.remove("hidden"); }

/** Close usage modal. */
function closeUsageModal() { $("#usageModal").classList.add("hidden"); }

/** Save usage log. Only admin allowed. */
async function saveUsage(ev) {
  ev.preventDefault();
  if (state.session.role !== ROLES.ADMIN) return;
  const name = $("#usageItemName").value.trim();
  const lotNo = $("#usageLotNo").value.trim();
  const qty = parseInt($("#usageQty").value || "0", 10);
  const note = $("#usageNote").value.trim();
  if (!name || !lotNo || !qty || qty <= 0) {
    showToast("กรุณากรอกข้อมูลให้ครบ");
    return;
  }
  showLoading("กำลังบันทึก...");
  try {
    const r = await api("addUsage", { usageData: { name, lotNo, quantity: qty, note } });
    showToast(r.message || "บันทึกสำเร็จ");
    closeUsageModal();
    await renderUsageLogs();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/* --------------------- NEW: Backup --------------------- */

/** Render backup info and display button for admin. */
async function renderBackup() {
  // Only admin allowed
  if (state.session.role !== ROLES.ADMIN) {
    showToast("ต้องเป็น Admin");
    showTab("dashboardTab");
    return;
  }
  showLoading("กำลังโหลดข้อมูลสำรอง...");
  try {
    const res = await api("getBackupInfo", {});
    const info = res.data || {};
    $("#createBackupBtn").classList.toggle("hidden", false);
    $("#backupInfo").textContent = info.lastBackup ? `สำรองล่าสุด: ${info.lastBackup}` : "ยังไม่เคยสำรองข้อมูล";
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Create backup via API. */
async function createBackup() {
  showLoading("กำลังสร้างสำรองข้อมูล...");
  try {
    const r = await api("createBackup", {});
    showToast(r.message || "สร้างสำรองสำเร็จ");
    await renderBackup();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/* --------------------- NEW: Settings --------------------- */

/** Render settings page. Loads current settings. */
async function renderSettings() {
  if (state.session.role !== ROLES.ADMIN) {
    showToast("ต้องเป็น Admin");
    showTab("dashboardTab");
    return;
  }
  showLoading("กำลังโหลดการตั้งค่า...");
  try {
    const res = await api("loadSettings", {});
    state.data.settings = res.data || state.data.settings;
    const { emailList, expiryThresholds } = state.data.settings;
    $("#settingsEmailList").value = (emailList || []).join(", ");
    $("#settingsExpiryCritical").value = expiryThresholds.critical || 30;
    $("#settingsExpiryWarning").value = expiryThresholds.warning || 60;
    $("#settingsExpiryCaution").value = expiryThresholds.caution || 180;
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Save email recipients. */
async function saveEmailList() {
  const raw = $("#settingsEmailList").value || "";
  const emails = raw.split(/[,\n]/).map(s => s.trim()).filter(x => x && x.includes("@"));
  showLoading("กำลังบันทึกผู้รับอีเมล...");
  try {
    const r = await api("updateEmailRecipients", { emails });
    showToast(r.message || "บันทึกสำเร็จ");
    await renderSettings();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Save expiry thresholds. */
async function saveExpirySettings() {
  const critical = parseInt($("#settingsExpiryCritical").value || "0", 10);
  const warning = parseInt($("#settingsExpiryWarning").value || "0", 10);
  const caution = parseInt($("#settingsExpiryCaution").value || "0", 10);
  if (!critical || !warning || !caution) {
    showToast("กรอกค่าทั้งหมด");
    return;
  }
  showLoading("กำลังบันทึก Threshold...");
  try {
    const r = await api("updateExpiryThresholds", { thresholds: { critical, warning, caution } });
    showToast(r.message || "บันทึกสำเร็จ");
    await renderSettings();
    await refreshAll();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/* --------------------- Refresh Snapshot --------------------- */

/** Refresh snapshot data (inventory, reorder, expired, staff, emails, cabinets). */
async function refreshAll() {
  showLoading("กำลังดึงข้อมูล...");
  try {
    const snap = await api("getSnapshot", {});
    state.data.inventory = snap.data.inventory || [];
    state.data.reorder = snap.data.reorder || [];
    state.data.expired = snap.data.expired || [];
    state.data.staff = snap.data.staff || [];
    state.data.emailRecipients = snap.data.emailRecipients || [];
    state.data.cabinets = snap.data.cabinets || [];
    $("#lastSyncText").textContent = nowTh();
    $("#kpiLots").textContent = state.data.inventory.length;
    $("#kpiReorder").textContent = state.data.reorder.length;
    $("#kpiExpiry").textContent = state.data.expired.length;
    // refresh current tab only if not settings/shift/usage/backu
    switch (state.currentTab) {
      case "dashboardTab": renderDashboard(); break;
      case "inventoryTab": renderInventory(); break;
      case "reorderTab": renderReorder(); break;
      case "expiredTab": renderExpired(); break;
      case "userManagementTab": renderStaff(); break;
      case "reportTab": renderReport(); break;
      // other tabs use their own data and will refresh on next display
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/* --------------------- Authentication --------------------- */

/** Perform login. Uses verifyLogin action. Saves session. */
async function login(staffId, password) {
  showLoading("กำลังเข้าสู่ระบบ...");
  try {
    const r = await api("verifyLogin", { staffId, password, token: null });
    saveSession(r.data);
    await initAfterLogin();
  } catch (err) {
    showToast(err.message);
  } finally {
    hideLoading();
  }
}

/** Initialize app after login. Builds sidebar, admin sheet and refreshes data. */
async function initAfterLogin() {
  $("#loginView").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  setUserBadges();
  buildSidebar();
  setBottomNavForRole();
  buildAdminSheetGrid();
  // attach admin-only event listeners
  $("#sendReportBtn").addEventListener("click", sendReport);
  $("#sendExpirySummaryBtn").addEventListener("click", sendExpirySummary);
  $("#createBackupBtn").addEventListener("click", createBackup);
  await refreshAll();
  showTab("dashboardTab");
  // periodic refresh (every 60s) for snapshot
  setInterval(() => {
    api("getSnapshot", {}).then(snap => {
      state.data.inventory = snap.data.inventory || [];
      state.data.reorder = snap.data.reorder || [];
      state.data.expired = snap.data.expired || [];
      state.data.staff = snap.data.staff || [];
      state.data.emailRecipients = snap.data.emailRecipients || [];
      state.data.cabinets = snap.data.cabinets || [];
      $("#lastSyncText").textContent = nowTh();
      if (state.currentTab === "dashboardTab") renderDashboard();
    }).catch(() => {});
  }, 60000);
}

/** Logout and reload page. */
function logout() {
  clearSession();
  location.reload();
}

/* --------------------- Event wiring --------------------- */

function wireEvents() {
  setBrand();
  // password visibility toggle
  $("#togglePassword").addEventListener("click", () => {
    const inp = $("#loginPassword");
    const icon = $("#togglePassword i");
    inp.type = inp.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
  });
  // login form
  $("#loginForm").addEventListener("submit", ev => {
    ev.preventDefault();
    login($("#loginStaffId").value.trim(), $("#loginPassword").value.trim());
  });
  // logout buttons
  $("#logoutBtnDesktop").addEventListener("click", logout);
  $("#logoutBtnMobile2").addEventListener("click", logout);
  // refresh buttons
  $("#refreshBtnDesktop").addEventListener("click", refreshAll);
  $("#refreshBtnMobile").addEventListener("click", refreshAll);
  // bottom nav
  $$('[data-bottom-tab]').forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.bottomTab));
  });
  // admin sheet open/close
  $("#adminFab").addEventListener("click", () => {
    if (state.session?.role !== ROLES.ADMIN) return;
    openAdminSheet();
  });
  $("#adminSheetClose").addEventListener("click", closeAdminSheet);
  $("#adminSheetBackdrop").addEventListener("click", closeAdminSheet);
  // item modals
  $("#itemModalClose").addEventListener("click", closeItemModal);
  $("#itemModalBackdrop").addEventListener("click", closeItemModal);
  $("#itemEditClose").addEventListener("click", closeItemEditModal);
  $("#itemEditBackdrop").addEventListener("click", closeItemEditModal);
  $("#itemFormCancel").addEventListener("click", closeItemEditModal);
  $("#itemForm").addEventListener("submit", saveItem);
  $("#openAddItemBtn").addEventListener("click", openAddItem);
  // inventory filters
  $("#inventorySearch").addEventListener("input", () => renderInventory());
  $("#inventoryCabinet").addEventListener("change", () => renderInventory());
  $("#inventoryCategory").addEventListener("change", () => renderInventory());
  // daily check events
  $("#dailySupplySearch").addEventListener("input", () => renderDaily("supply"));
  $("#dailySupplyCabinet").addEventListener("change", () => renderDaily("supply"));
  $("#saveDailySupplyBtn").addEventListener("click", () => saveDaily("supply"));
  $("#dailyMedicineSearch").addEventListener("input", () => renderDaily("medicine"));
  $("#dailyMedicineCabinet").addEventListener("change", () => renderDaily("medicine"));
  $("#saveDailyMedicineBtn").addEventListener("click", () => saveDaily("medicine"));
  // staff management
  $("#staffForm").addEventListener("submit", saveStaff);
  $("#staffFormReset").addEventListener("click", resetStaffForm);
  // shift summary events
  $("#addShiftSummaryBtn").addEventListener("click", () => {
    $("#shiftDetails").value = "";
    $("#shiftRound").value = currentShiftLocal();
    openShiftModal();
  });
  $("#shiftModalClose").addEventListener("click", closeShiftModal);
  $("#shiftModalBackdrop").addEventListener("click", closeShiftModal);
  $("#shiftFormCancel").addEventListener("click", closeShiftModal);
  $("#shiftForm").addEventListener("submit", saveShiftSummary);
  // usage log events
  $("#addUsageBtn").addEventListener("click", () => {
    $("#usageItemName").value = "";
    $("#usageLotNo").value = "";
    $("#usageQty").value = 1;
    $("#usageNote").value = "";
    openUsageModal();
  });
  $("#usageModalClose").addEventListener("click", closeUsageModal);
  $("#usageModalBackdrop").addEventListener("click", closeUsageModal);
  $("#usageFormCancel").addEventListener("click", closeUsageModal);
  $("#usageForm").addEventListener("submit", saveUsage);
  // settings events
  $("#saveEmailListBtn").addEventListener("click", saveEmailList);
  $("#saveExpirySettingsBtn").addEventListener("click", saveExpirySettings);
}

// Initialise the app on page load
(function boot() {
  wireEvents();
  // restore session if exists
  const sess = loadSession();
  if (sess?.token && sess?.staffId) {
    state.session = sess;
    api("ping", {}).then(() => initAfterLogin()).catch(() => clearSession());
  }
})();
