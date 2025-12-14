/* ICU Stock Management - GitHub Pages Frontend (Tailwind)
   - Sidebar (Desktop) + Bottom Nav (Mobile)
   - Admin Action Sheet (Expandable Bottom Sheet)
   - Role-Based Navigation
   - Fetch JSON API from Google Apps Script Web App
*/

const CFG = window.APP_CONFIG;

const ROLES = { ADMIN: "Admin", RN: "RN", PN: "PN" };

const MENU = [
  { id: "dashboardTab", label: "หน้าแรก", icon: "fa-house", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "dailyCheckSupplyTab", label: "ตรวจสต็อกเวชภัณฑ์", icon: "fa-clipboard-check", roles: [ROLES.ADMIN, ROLES.PN] },
  { id: "dailyCheckMedicineTab", label: "ตรวจสต็อกยา", icon: "fa-clipboard-check", roles: [ROLES.ADMIN, ROLES.RN] },
  { id: "inventoryTab", label: "คลัง", icon: "fa-boxes-stacked", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "reorderTab", label: "รายการต้องสั่งซื้อ", icon: "fa-cart-shopping", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "expiredTab", label: "รายการใกล้หมดอายุ", icon: "fa-triangle-exclamation", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN] },
  { id: "reportTab", label: "รายงาน", icon: "fa-file-pdf", roles: [ROLES.ADMIN] },
  { id: "userManagementTab", label: "จัดการสมาชิก", icon: "fa-users", roles: [ROLES.ADMIN] },
  { id: "profileTab", label: "โปรไฟล์", icon: "fa-user", roles: [ROLES.ADMIN, ROLES.RN, ROLES.PN], hiddenOnSidebar: true }
];

const ADMIN_SHEET_MENU = [
  { id: "reorderTab", label: "Reorder", icon: "fa-cart-shopping" },
  { id: "expiredTab", label: "Expired", icon: "fa-triangle-exclamation" },
  { id: "reportTab", label: "Report", icon: "fa-file-pdf" },
  { id: "userManagementTab", label: "Users", icon: "fa-users" },
  { id: "inventoryTab", label: "Inventory", icon: "fa-boxes-stacked" }
];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  session: null, // {staffId, staffName, role, token}
  data: {
    inventory: [],
    reorder: [],
    expired: [],
    staff: [],
    emailRecipients: [],
    cabinets: []
  },
  currentTab: "dashboardTab",
  editItemImageUrl: ""
};

function showToast(msg) {
  const toast = $("#toast");
  $("#toastInner").textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

function showLoading(text = "กำลังโหลด...") {
  $("#loadingText").textContent = text;
  $("#loading").classList.remove("hidden");
}
function hideLoading() { $("#loading").classList.add("hidden"); }

function setBrand() {
  $("#brandLogoLogin").src = CFG.LOGO_URL;
  $("#brandNameLogin").textContent = CFG.BRAND_NAME;

  $("#brandLogo").src = CFG.LOGO_URL;
  $("#brandName").textContent = CFG.BRAND_NAME;

  $("#brandLogoMobile").src = CFG.LOGO_URL;
  $("#brandNameMobile").textContent = CFG.BRAND_NAME;
}

async function api(action, payload = {}) {
  const body = {
    action,
    ...payload,
    staffId: state.session?.staffId || payload.staffId,
    token: state.session?.token || payload.token
  };

  const res = await fetch(CFG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoid preflight
    body: JSON.stringify(body),
    redirect: "follow"
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 200)); }

  if (!json.success) throw new Error(json.error || "API error");
  return json;
}

function saveSession(sess) {
  state.session = sess;
  sessionStorage.setItem("ICU_SESSION", JSON.stringify(sess));
}
function loadSession() {
  const raw = sessionStorage.getItem("ICU_SESSION");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function clearSession() {
  state.session = null;
  sessionStorage.removeItem("ICU_SESSION");
}

function roleAllows(menuId) {
  const m = MENU.find(x => x.id === menuId);
  if (!m) return false;
  return m.roles.includes(state.session.role);
}

function setUserBadges() {
  const t = `${state.session.staffName} • ${state.session.role}`;
  $("#userBadge").textContent = t;
  $("#userBadgeMobile").textContent = t;

  $("#profileStaffId").textContent = state.session.staffId;
  $("#profileStaffName").textContent = state.session.staffName;
  $("#profileRole").textContent = state.session.role;

  $("#kpiRole").textContent = state.session.role;
}

function buildSidebar() {
  const nav = $("#sidebarNav");
  nav.innerHTML = "";

  MENU.filter(m => !m.hiddenOnSidebar).forEach(m => {
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

function highlightSidebar() {
  $$("#sidebarNav button").forEach(b => {
    const active = b.dataset.tab === state.currentTab;
    b.classList.toggle("bg-slate-900", active);
    b.classList.toggle("text-white", active);
    b.querySelector("i")?.classList.toggle("text-white", active);
    b.querySelector("i")?.classList.toggle("text-slate-700", !active);
  });
}

function showTab(tabId) {
  // special: dailyCheckAuto -> choose based on role
  if (tabId === "dailyCheckAuto") {
    if (state.session.role === ROLES.RN) tabId = "dailyCheckMedicineTab";
    else tabId = "dailyCheckSupplyTab";
  }

  if (!roleAllows(tabId)) {
    showToast("ไม่มีสิทธิ์เข้าหน้านี้");
    return;
  }

  state.currentTab = tabId;
  $$(".tabContent").forEach(s => s.classList.add("hidden"));
  const target = $("#" + tabId);
  if (target) target.classList.remove("hidden");
  highlightSidebar();

  // render each tab
  if (tabId === "dashboardTab") renderDashboard();
  if (tabId === "inventoryTab") renderInventory();
  if (tabId === "reorderTab") renderReorder();
  if (tabId === "expiredTab") renderExpired();
  if (tabId === "userManagementTab") renderStaff();
  if (tabId === "reportTab") renderReport();
  if (tabId === "dailyCheckSupplyTab") renderDaily("supply");
  if (tabId === "dailyCheckMedicineTab") renderDaily("medicine");
}

function setBottomNavForRole() {
  // Admin: show center button, and make grid 4->5 visually by showing it
  const adminFab = $("#adminFab");
  if (state.session.role === ROLES.ADMIN) adminFab.classList.remove("hidden");
  else adminFab.classList.add("hidden");
}

function openAdminSheet() {
  $("#adminSheetOverlay").classList.remove("hidden");
  requestAnimationFrame(() => $("#adminSheet").classList.remove("sheet-hidden"));
  $("#adminSheet").classList.add("sheet-show");
}
function closeAdminSheet() {
  $("#adminSheet").classList.add("sheet-hidden");
  setTimeout(() => $("#adminSheetOverlay").classList.add("hidden"), 180);
}

function buildAdminSheetGrid() {
  const grid = $("#adminSheetGrid");
  grid.innerHTML = "";
  ADMIN_SHEET_MENU.forEach(m => {
    const b = document.createElement("button");
    b.className = "rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50";
    b.innerHTML = `
      <div class="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
        <i class="fa-solid ${m.icon}"></i>
      </div>
      <div class="mt-2 text-sm font-semibold">${m.label}</div>`;
    b.addEventListener("click", () => {
      closeAdminSheet();
      showTab(m.id);
    });
    grid.appendChild(b);
  });
}

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

function formatExpiryBadge(item) {
  const d = item.expiryDays;
  if (d === null || d === undefined) return `<span class="text-slate-400">-</span>`;
  if (d <= 0) return `<span class="text-red-700 font-semibold">หมดอายุ</span>`;
  if (d <= 30) return `<span class="text-red-700 font-semibold">≤30 วัน</span>`;
  if (d <= 60) return `<span class="text-amber-700 font-semibold">≤60 วัน</span>`;
  if (d <= 180) return `<span class="text-yellow-700 font-semibold">≤180 วัน</span>`;
  return `<span class="text-slate-500">ปกติ</span>`;
}

function nowTh() {
  return new Date().toLocaleString("th-TH");
}

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

    // refresh current tab
    showTab(state.currentTab);
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const reorderTop = state.data.reorder.slice(0, 5).map(r =>
    `• ${r.name} (ต้องสั่ง ${r.toOrder})`
  ).join("<br>") || "—";

  const expiryTop = state.data.expired.slice(0, 5).map(x =>
    `• ${x.name} (Lot ${x.lotNo}) ${x.expiryDate} — ${x.status}`
  ).join("<br>") || "—";

  $("#reorderTop").innerHTML = reorderTop;
  $("#expiryTop").innerHTML = expiryTop;
}

/* ---------------- Reorder ---------------- */
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

/* ---------------- Expired ---------------- */
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

  // admin actions
  const isAdmin = state.session.role === ROLES.ADMIN;
  $("#sendExpirySummaryBtn").classList.toggle("hidden", !isAdmin);
}

/* ---------------- Report ---------------- */
function renderReport() {
  const isAdmin = state.session.role === ROLES.ADMIN;
  $("#sendReportBtn").classList.toggle("hidden", !isAdmin);

  const box = $("#emailRecipientsBox");
  const emails = state.data.emailRecipients || [];
  box.innerHTML = emails.length ? emails.map(e => `• ${e}`).join("<br>") : "—";
}

async function sendReport() {
  showLoading("กำลังสร้าง PDF และส่งอีเมล...");
  try {
    const r = await api("sendReportManually", {});
    showToast(r.message || "ส่งรายงานสำเร็จ");
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

async function sendExpirySummary() {
  showLoading("กำลังส่งอีเมลสรุปใกล้หมดอายุ...");
  try {
    const r = await api("sendExpirySummaryEmail", {});
    showToast(r.message || "ส่งสำเร็จ");
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

/* ---------------- Inventory ---------------- */
function renderInventory() {
  const isAdmin = state.session.role === ROLES.ADMIN;
  $("#openAddItemBtn").classList.toggle("hidden", !isAdmin);

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
    rows = rows.filter(x =>
      (x.name || "").toLowerCase().includes(search) ||
      (x.lotNo || "").toLowerCase().includes(search) ||
      (x.cabinet || "").toLowerCase().includes(search) ||
      (x.category || "").toLowerCase().includes(search)
    );
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

    tr.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      ev.stopPropagation();
      const act = btn.dataset.act;
      if (act === "edit") openEditItem(item.id);
      if (act === "del") deleteItem(item.id);
      if (act === "view") openItemDetail(decodeURIComponent(btn.dataset.name));
    });

    // allow click row to view detail for all roles
    tr.addEventListener("dblclick", () => openItemDetail(item.name));

    tb.appendChild(tr);
  });
}

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

    const img = d.imageUrl ? `<img src="${d.imageUrl}" class="w-24 h-24 rounded-2xl object-cover border border-slate-200" />`
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
              <tr>
                <th class="text-left py-2 pr-3">Lot</th>
                <th class="text-left py-2 pr-3">จำนวน</th>
                <th class="text-left py-2 pr-3">Expiry</th>
                <th class="text-left py-2 pr-3">ตู้</th>
              </tr>
            </thead>
            <tbody>${lotsHtml || `<tr><td colspan="4" class="py-3 text-slate-500">—</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;

    $("#itemModal").classList.remove("hidden");
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

function closeItemModal() { $("#itemModal").classList.add("hidden"); }

function openItemEditModal() { $("#itemEditModal").classList.remove("hidden"); }
function closeItemEditModal() { $("#itemEditModal").classList.add("hidden"); }

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

function openAddItem() {
  if (state.session.role !== ROLES.ADMIN) return;
  $("#itemEditTitle").textContent = "เพิ่มรายการ";
  resetItemForm();
  openItemEditModal();
}

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

async function deleteItem(id) {
  if (state.session.role !== ROLES.ADMIN) return;
  if (!confirm("ยืนยันลบรายการนี้?")) return;

  showLoading("กำลังลบ...");
  try {
    const r = await api("deleteItem", { id });
    showToast(r.message || "ลบสำเร็จ");
    await refreshAll();
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result).split(",")[1]); // base64 only
    rd.onerror = reject;
    rd.readAsDataURL(file);
  });
}

async function saveItem(ev) {
  ev.preventDefault();
  if (state.session.role !== ROLES.ADMIN) return;

  showLoading("กำลังบันทึกรายการ...");

  try {
    let imageUrl = state.editItemImageUrl;

    const f = $("#itemImage").files?.[0];
    if (f) {
      const b64 = await fileToBase64(f);
      const up = await api("uploadItemImage", {
        filename: f.name,
        mimeType: f.type || "image/jpeg",
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

    const r = await api("saveInventoryItem", payload);
    showToast(r.message || "บันทึกสำเร็จ");
    closeItemEditModal();
    await refreshAll();
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

/* ---------------- Daily Check ---------------- */
function currentShiftLocal() {
  const h = new Date().getHours();
  if (h >= 7 && h < 15) return "เช้า";
  if (h >= 15 && h < 23) return "บ่าย";
  return "ดึก";
}

function renderDaily(kind) {
  const isSupply = kind === "supply";
  const role = state.session.role;

  // role guard
  if (isSupply && !(role === ROLES.ADMIN || role === ROLES.PN)) {
    showToast("RN ไม่สามารถตรวจเวชภัณฑ์ (ตามสิทธิ์เดิม)");
    showTab("dashboardTab");
    return;
  }
  if (!isSupply && !(role === ROLES.ADMIN || role === ROLES.RN)) {
    showToast("PN ไม่สามารถตรวจยา (ตามสิทธิ์เดิม)");
    showTab("dashboardTab");
    return;
  }

  const shift = currentShiftLocal();
  if (isSupply) $("#dailySupplyShift").textContent = shift;
  else $("#dailyMedicineShift").textContent = shift;

  const search = (isSupply ? $("#dailySupplySearch").value : $("#dailyMedicineSearch").value).toLowerCase().trim();
  const cab = (isSupply ? $("#dailySupplyCabinet").value : $("#dailyMedicineCabinet").value);

  const category = isSupply ? "Medical Supply" : "Medicine";
  let rows = state.data.inventory.filter(x => (x.category || "") === category);

  if (cab) rows = rows.filter(x => (x.cabinet || "") === cab);
  if (search) {
    rows = rows.filter(x =>
      (x.name || "").toLowerCase().includes(search) ||
      (x.lotNo || "").toLowerCase().includes(search) ||
      (x.cabinet || "").toLowerCase().includes(search)
    );
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
      <td class="py-2 pr-3">
        <input data-check="qty" data-id="${x.id}" type="number" min="0"
          class="w-24 rounded-xl border border-slate-200 px-2 py-1 text-sm" value="${x.quantity}">
      </td>
      <td class="py-2 pr-3">${x.cabinet || "-"}</td>
      <td class="py-2 pr-3">${x.expiryDate || "-"} ${formatExpiryBadge(x)}</td>
    `;
    tb.appendChild(tr);
  });
}

async function saveDaily(kind) {
  const isSupply = kind === "supply";
  const shift = currentShiftLocal();
  const category = isSupply ? "Medical Supply" : "Medicine";

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
      shift
    };
  }).filter(r => r.category === category);

  showLoading("กำลังบันทึก Daily Check...");
  try {
    const r = await api("saveDailyCheckEx", { checkType: isSupply ? "Supply" : "Medicine", records });
    showToast(r.message || "บันทึกสำเร็จ");
    await refreshAll();
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

/* ---------------- Staff ---------------- */
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
    tr.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const act = b.dataset.act;

      if (act === "edit") {
        $("#staffEditMode").value = "true";
        $("#staffIdInput").value = s.id;
        $("#staffIdInput").disabled = true;
        $("#staffNameInput").value = s.name;
        $("#staffRoleInput").value = s.role;
        $("#staffPassInput").value = ""; // require re-enter
      }

      if (act === "del") {
        if (!confirm(`ยืนยันลบ ${s.id}?`)) return;
        showLoading("กำลังลบผู้ใช้...");
        try {
          const r = await api("deleteStaff", { staffIdToDelete: s.id });
          showToast(r.message || "ลบสำเร็จ");
          await refreshAll();
        } catch (e) {
          showToast(e.message);
        } finally {
          hideLoading();
        }
      }
    });

    tb.appendChild(tr);
  });
}

function resetStaffForm() {
  $("#staffEditMode").value = "false";
  $("#staffIdInput").disabled = false;
  $("#staffIdInput").value = "";
  $("#staffNameInput").value = "";
  $("#staffPassInput").value = "";
  $("#staffRoleInput").value = "Admin";
}

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
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

/* ---------------- Auth ---------------- */
async function login(staffId, password) {
  showLoading("กำลังเข้าสู่ระบบ...");
  try {
    const r = await api("verifyLogin", { staffId, password, token: null });
    saveSession(r.data);
    initAfterLogin();
  } catch (e) {
    showToast(e.message);
  } finally {
    hideLoading();
  }
}

async function initAfterLogin() {
  $("#loginView").classList.add("hidden");
  $("#appShell").classList.remove("hidden");

  setUserBadges();
  buildSidebar();
  setBottomNavForRole();
  buildAdminSheetGrid();

  // admin-only buttons
  $("#sendReportBtn").addEventListener("click", sendReport);
  $("#sendExpirySummaryBtn").addEventListener("click", sendExpirySummary);

  await refreshAll();

  // default tab
  showTab("dashboardTab");

  // optional near real-time refresh (ทุก 60 วิ)
  setInterval(() => {
    // ไม่ force loading overlay เพื่อไม่รบกวนหน้างาน
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

function logout() {
  clearSession();
  location.reload();
}

/* ---------------- Events ---------------- */
function wireEvents() {
  setBrand();

  $("#togglePassword").addEventListener("click", () => {
    const inp = $("#loginPassword");
    const icon = $("#togglePassword i");
    inp.type = inp.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
  });

  $("#loginForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    login($("#loginStaffId").value.trim(), $("#loginPassword").value.trim());
  });

  $("#logoutBtnDesktop").addEventListener("click", logout);
  $("#logoutBtnMobile2").addEventListener("click", logout);

  $("#refreshBtnDesktop").addEventListener("click", refreshAll);
  $("#refreshBtnMobile").addEventListener("click", refreshAll);

  // Bottom nav
  $$("[data-bottom-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.bottomTab));
  });

  // Admin sheet
  $("#adminFab").addEventListener("click", () => {
    if (state.session?.role !== ROLES.ADMIN) return;
    openAdminSheet();
  });
  $("#adminSheetClose").addEventListener("click", closeAdminSheet);
  $("#adminSheetBackdrop").addEventListener("click", closeAdminSheet);

  // Item modals
  $("#itemModalClose").addEventListener("click", closeItemModal);
  $("#itemModalBackdrop").addEventListener("click", closeItemModal);

  $("#openAddItemBtn").addEventListener("click", openAddItem);
  $("#itemEditClose").addEventListener("click", closeItemEditModal);
  $("#itemEditBackdrop").addEventListener("click", closeItemEditModal);
  $("#itemFormCancel").addEventListener("click", closeItemEditModal);
  $("#itemForm").addEventListener("submit", saveItem);

  // Inventory filters
  $("#inventorySearch").addEventListener("input", () => renderInventory());
  $("#inventoryCabinet").addEventListener("change", () => renderInventory());
  $("#inventoryCategory").addEventListener("change", () => renderInventory());

  // Daily search
  $("#dailySupplySearch").addEventListener("input", () => renderDaily("supply"));
  $("#dailySupplyCabinet").addEventListener("change", () => renderDaily("supply"));
  $("#dailyMedicineSearch").addEventListener("input", () => renderDaily("medicine"));
  $("#dailyMedicineCabinet").addEventListener("change", () => renderDaily("medicine"));

  $("#saveDailySupplyBtn").addEventListener("click", () => saveDaily("supply"));
  $("#saveDailyMedicineBtn").addEventListener("click", () => saveDaily("medicine"));

  // Staff
  $("#staffForm").addEventListener("submit", saveStaff);
  $("#staffFormReset").addEventListener("click", resetStaffForm);
}

(async function boot() {
  wireEvents();

  // restore session
  const sess = loadSession();
  if (sess?.token && sess?.staffId) {
    state.session = sess;
    try {
      // quick validate token (optional)
      await api("ping", {});
      initAfterLogin();
    } catch {
      clearSession();
    }
  }
})();
