/* ICU Stock Management - GitHub Pages UI
 * Uses JSONP to call Apps Script Web App API (avoids typical CORS/preflight issues).
 * Image upload uses POST no-cors, then refresh data.
 */

const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || "";
const LOGO_URL = (window.APP_BRAND && window.APP_BRAND.LOGO_URL) || "";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  token: null,
  staff: { id: "", name: "", role: "" },
  lastUpdatedIso: null,
  data: {
    inventory: [],
    reorder: [],
    expired: [],
    shiftSummary: [],
    staff: [],
    recipients: []
  },
  ui: {
    route: "daily-supply",
    dailySupply: { q: "", cabinet: "", page: 1, pageSize: 10 },
    dailyMedicine: { q: "", cabinet: "", page: 1, pageSize: 10 },
    inventory: { q: "", cabinet: "" },
    modal: { currentItemName: null }
  }
};

/* ----------------------------- JSONP API ----------------------------- */

function jsonp(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!API_URL) return reject(new Error("API_URL not set"));
    const cbName = "__icu_cb_" + Math.random().toString(36).slice(2);

    const params = new URLSearchParams();
    params.set("action", action);
    params.set("callback", cbName);

    // attach token if present
    if (state.token) params.set("token", state.token);

    // keep payload small; daily-check will send per-page
    params.set("payload", JSON.stringify(payload));
    params.set("_", Date.now().toString()); // cache buster

    const src = API_URL + "?" + params.toString();

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed: " + action));
    };

    function cleanup() {
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    document.body.appendChild(script);
  });
}

async function api(action, payload) {
  const res = await jsonp(action, payload);
  if (!res || typeof res !== "object") throw new Error("Bad API response");
  if (!res.success) throw new Error(res.error || "API error");
  return res;
}

/* ----------------------------- UI Helpers ---------------------------- */

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }
function setText(el, t) { el.textContent = t; }

function toast(msg) {
  const el = $("#toast");
  setText(el, msg);
  show(el);
  setTimeout(() => hide(el), 2500);
}

function loading(on, text = "กำลังทำงาน...") {
  const ov = $("#loadingOverlay");
  setText($("#loadingText"), text);
  if (on) show(ov); else hide(ov);
}

function setLogo() {
  $("#brandLogoLogin").src = LOGO_URL || "";
  $("#brandLogoSidebar").src = LOGO_URL || "";
}

function saveSession() {
  localStorage.setItem("icu_token", state.token || "");
  localStorage.setItem("icu_staff", JSON.stringify(state.staff));
}

function loadSession() {
  const token = localStorage.getItem("icu_token");
  const staffRaw = localStorage.getItem("icu_staff");
  if (token) state.token = token;
  if (staffRaw) {
    try { state.staff = JSON.parse(staffRaw); } catch (_) {}
  }
}

function clearSession() {
  state.token = null;
  state.staff = { id: "", name: "", role: "" };
  state.lastUpdatedIso = null;
  localStorage.removeItem("icu_token");
  localStorage.removeItem("icu_staff");
}

/* ------------------------------ Routing ------------------------------ */

const routes = {
  "daily-supply": { title: "Daily Check (Supply)", subtitle: "ตรวจนับเวชภัณฑ์", page: "#page-daily-supply" },
  "daily-medicine": { title: "Daily Check (Medicine)", subtitle: "ตรวจนับยา", page: "#page-daily-medicine" },
  "reorder": { title: "Reorder Items", subtitle: "รายการที่ต้องสั่งซื้อ", page: "#page-reorder" },
  "expired": { title: "Expired Items", subtitle: "หมดอายุ / ใกล้หมดอายุ", page: "#page-expired" },
  "report": { title: "Report", subtitle: "PDF + ส่งอีเมล", page: "#page-report" },
  "inventory": { title: "Inventory (Admin)", subtitle: "เพิ่ม/แก้ไขรายการ + รูป", page: "#page-inventory", admin: true },
  "shift-summary": { title: "Shift Summary (Admin)", subtitle: "สรุปการตรวจเวร", page: "#page-shift-summary", admin: true },
  "user-management": { title: "User Management (Admin)", subtitle: "จัดการสมาชิก", page: "#page-user-management", admin: true },
  "settings": { title: "Settings (Admin)", subtitle: "สถานะระบบ/สำรองข้อมูล", page: "#page-settings", admin: true }
};

function switchRoute(route) {
  if (!routes[route]) route = "daily-supply";
  if (routes[route].admin && state.staff.role !== "Admin") route = "daily-supply";

  state.ui.route = route;

  $$(".page").forEach(hide);
  show($(routes[route].page));

  setText($("#pageTitle"), routes[route].title);
  setText($("#pageSubtitle"), `${state.staff.name} (${state.staff.role}) • LastUpdated: ${state.lastUpdatedIso || "-"}`);

  // active styles
  $$(".navBtn").forEach(btn => btn.classList.remove("bg-slate-900", "text-white"));
  $$(".navBtn").forEach(btn => {
    if (btn.dataset.route === route) btn.classList.add("bg-slate-900", "text-white");
  });

  // render current page
  if (route === "daily-supply") renderDaily("Supply");
  if (route === "daily-medicine") renderDaily("Medicine");
  if (route === "reorder") renderReorder();
  if (route === "expired") renderExpired();
  if (route === "inventory") renderInventory();
  if (route === "shift-summary") renderShiftSummary();
  if (route === "user-management") renderUsers();
}

/* ------------------------------ Data Load ---------------------------- */

async function bootstrap() {
  loading(true, "กำลังโหลดข้อมูล...");
  try {
    const res = await api("bootstrap", {});
    state.data.inventory = res.data.inventory || [];
    state.data.reorder = res.data.reorder || [];
    state.data.expired = res.data.expired || [];
    state.data.shiftSummary = res.data.shiftSummary || [];
    state.data.recipients = res.data.recipients || [];
    state.data.staff = res.data.staff || [];

    state.lastUpdatedIso = res.data.lastUpdatedIso || state.lastUpdatedIso;

    // build cabinet lists
    buildCabinetSelectors();

    // recipients UI
    $("#emailRecipientsInput").value = (state.data.recipients || []).join("\n");

    // role based menus
    if (state.staff.role === "Admin") {
      show($("#adminMenus"));
      show($("#bnAdminBtn"));

      // bottom nav layout for admin (5 buttons feel). To keep markup simple: replace grid
      const bottomNav = $("#bottomNav");
      bottomNav.className = "grid grid-cols-5";
      bottomNav.innerHTML = `
        <button class="bnBtn py-3" data-route="daily-supply">
          <div class="text-center text-xs"><i class="fa-solid fa-clipboard-check text-base"></i><div>Daily</div></div>
        </button>
        <button class="bnBtn py-3" data-route="reorder">
          <div class="text-center text-xs"><i class="fa-solid fa-cart-shopping text-base"></i><div>Reorder</div></div>
        </button>
        <button id="bnAdminBtnInner" class="bnBtn py-3">
          <div class="text-center text-xs"><i class="fa-solid fa-bars text-base"></i><div>Admin</div></div>
        </button>
        <button class="bnBtn py-3" data-route="expired">
          <div class="text-center text-xs"><i class="fa-solid fa-triangle-exclamation text-base"></i><div>Expired</div></div>
        </button>
        <button class="bnBtn py-3" data-route="report">
          <div class="text-center text-xs"><i class="fa-solid fa-file-pdf text-base"></i><div>Report</div></div>
        </button>
      `;
      // rebind admin button
      setTimeout(() => {
        const btn = $("#bnAdminBtnInner");
        if (btn) btn.addEventListener("click", toggleAdminSheet);
        bindBottomNavButtons();
      }, 0);
    } else {
      hide($("#adminMenus"));
      hide($("#bnAdminBtn"));
      bindBottomNavButtons();
    }

    switchRoute(state.ui.route || "daily-supply");
  } finally {
    loading(false);
  }
}

async function pollLastUpdated() {
  try {
    const res = await api("getLastUpdated", {});
    const iso = res.data && res.data.lastUpdatedIso;
    if (iso && state.lastUpdatedIso && iso !== state.lastUpdatedIso) {
      state.lastUpdatedIso = iso;
      toast("มีการอัปเดตข้อมูล — รีโหลดอัตโนมัติ");
      await bootstrap();
    } else if (iso && !state.lastUpdatedIso) {
      state.lastUpdatedIso = iso;
    }
  } catch (_) {
    // ignore silent
  }
}

/* ------------------------------ Rendering ---------------------------- */

function buildCabinetSelectors() {
  const cabinets = Array.from(new Set(state.data.inventory.map(x => (x.cabinet || "").trim()).filter(Boolean))).sort();
  const options = [`<option value="">ทั้งหมด</option>`].concat(cabinets.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));

  $("#dailySupplyCabinet").innerHTML = options.join("");
  $("#dailyMedicineCabinet").innerHTML = options.join("");
  $("#invCabinetFilter").innerHTML = options.join("");
}

function renderReorder() {
  const tbody = $("#reorderTbody");
  const rows = state.data.reorder || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="p-3 text-slate-500" colspan="4">ไม่มีรายการที่ต้องสั่งซื้อเพิ่ม</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr class="border-b border-slate-100">
      <td class="p-2">${escapeHtml(r.name || "")}</td>
      <td class="p-2">${num(r.currentStock)}</td>
      <td class="p-2">${num(r.minimumStock)}</td>
      <td class="p-2 font-semibold">${num(r.reorderQuantity)}</td>
    </tr>
  `).join("");
}

function renderExpired() {
  const tbody = $("#expiredTbody");
  const rows = state.data.expired || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="p-3 text-slate-500" colspan="5">ไม่มีรายการหมดอายุหรือใกล้หมดอายุ</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr class="border-b border-slate-100">
      <td class="p-2">${escapeHtml(r.name || "")}</td>
      <td class="p-2">${escapeHtml(r.lotNo || "")}</td>
      <td class="p-2">${num(r.quantity)}</td>
      <td class="p-2">${escapeHtml(r.expiryDate || "")}</td>
      <td class="p-2">${badge(r.status || "")}</td>
    </tr>
  `).join("");
}

function renderShiftSummary() {
  const tbody = $("#shiftTbody");
  const rows = state.data.shiftSummary || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="p-3 text-slate-500" colspan="4">ยังไม่มีข้อมูลสรุปเวร</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr class="border-b border-slate-100">
      <td class="p-2">${escapeHtml(r.date || "")}</td>
      <td class="p-2">${escapeHtml(r.shift || "")}</td>
      <td class="p-2">${escapeHtml(r.staff || "")}</td>
      <td class="p-2">${escapeHtml(r.note || "")}</td>
    </tr>
  `).join("");
}

function renderUsers() {
  const tbody = $("#userTbody");
  const rows = state.data.staff || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="p-3 text-slate-500" colspan="4">ไม่มีผู้ใช้ในระบบ</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(u => `
    <tr class="border-b border-slate-100">
      <td class="p-2">${escapeHtml(u.id || "")}</td>
      <td class="p-2">${escapeHtml(u.name || "")}</td>
      <td class="p-2">${escapeHtml(u.role || "")}</td>
      <td class="p-2">
        <button class="rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-100"
                data-act="editUser" data-id="${escapeAttr(u.id)}">แก้ไข</button>
        <button class="rounded-lg border border-rose-300 text-rose-700 px-2 py-1 hover:bg-rose-50"
                data-act="delUser" data-id="${escapeAttr(u.id)}" data-name="${escapeAttr(u.name)}">ลบ</button>
      </td>
    </tr>
  `).join("");

  // bind actions
  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "editUser") {
        const id = btn.dataset.id;
        const u = rows.find(x => x.id === id);
        if (!u) return;
        $("#userEditMode").value = "true";
        $("#userOriginalId").value = u.id;
        $("#userId").value = u.id;
        $("#userName").value = u.name;
        $("#userPass").value = "";
        $("#userRole").value = u.role;
        $("#userId").disabled = true;
        toast("โหมดแก้ไขผู้ใช้");
      } else if (act === "delUser") {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (id === state.staff.id) return toast("ไม่สามารถลบผู้ใช้ของตัวเองได้");
        if (!confirm(`ยืนยันลบผู้ใช้ ${name} (${id}) ?`)) return;
        loading(true, "กำลังลบผู้ใช้...");
        try {
          await api("deleteStaff", { staffId: id });
          toast("ลบผู้ใช้สำเร็จ");
          await bootstrap();
        } catch (e) {
          toast("ลบไม่สำเร็จ: " + e.message);
        } finally {
          loading(false);
        }
      }
    });
  });
}

function renderInventory() {
  const tbody = $("#invTbody");
  const q = ($("#invSearch").value || "").trim().toLowerCase();
  const cab = $("#invCabinetFilter").value || "";

  const rows = (state.data.inventory || [])
    .filter(x => x && x.name)
    .filter(x => !q || (x.name + " " + (x.lotNo || "")).toLowerCase().includes(q))
    .filter(x => !cab || (x.cabinet || "") === cab);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td class="p-3 text-slate-500" colspan="8">ไม่มีรายการ</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(it => `
    <tr class="border-b border-slate-100">
      <td class="p-2">
        <button class="underline hover:no-underline" data-act="openItem" data-name="${escapeAttr(it.name)}">
          ${escapeHtml(it.name)}
        </button>
      </td>
      <td class="p-2">${escapeHtml(it.lotNo || "")}</td>
      <td class="p-2">${num(it.quantity)}</td>
      <td class="p-2">${num(it.minimumStock)}</td>
      <td class="p-2">${escapeHtml(it.expiryDate || "")}</td>
      <td class="p-2">${escapeHtml(it.cabinet || "")}</td>
      <td class="p-2">${escapeHtml(it.category || "")}</td>
      <td class="p-2">
        <button class="rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-100"
                data-act="editInv" data-id="${escapeAttr(it.id)}">แก้ไข</button>
        <button class="rounded-lg border border-rose-300 text-rose-700 px-2 py-1 hover:bg-rose-50"
                data-act="delInv" data-id="${escapeAttr(it.id)}">ลบ</button>
      </td>
    </tr>
  `).join("");

  // bind actions
  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "openItem") {
        openItemModal(btn.dataset.name);
      } else if (act === "editInv") {
        const id = btn.dataset.id;
        const it = rows.find(x => String(x.id) === String(id));
        if (!it) return;
        show($("#inventoryForm"));
        $("#invId").value = it.id;
        $("#invName").value = it.name || "";
        $("#invLot").value = it.lotNo || "";
        $("#invQty").value = it.quantity || 0;
        $("#invMin").value = it.minimumStock || 5;
        $("#invExpiry").value = (it.expiryDateISO || "") || "";
        $("#invNote").value = it.note || "";
        $("#invCabinet").value = it.cabinet || "";
        $("#invCategory").value = it.category || "Medical Supply";
        toast("โหมดแก้ไขรายการ");
      } else if (act === "delInv") {
        const id = btn.dataset.id;
        if (!confirm("ยืนยันลบรายการนี้?")) return;
        loading(true, "กำลังลบรายการ...");
        try {
          await api("deleteItem", { id });
          toast("ลบรายการสำเร็จ");
          await bootstrap();
        } catch (e) {
          toast("ลบไม่สำเร็จ: " + e.message);
        } finally {
          loading(false);
        }
      }
    });
  });
}

function renderDaily(kind /* Supply | Medicine */) {
  const isSupply = kind === "Supply";
  const searchEl = isSupply ? $("#dailySupplySearch") : $("#dailyMedicineSearch");
  const cabEl = isSupply ? $("#dailySupplyCabinet") : $("#dailyMedicineCabinet");
  const listEl = isSupply ? $("#dailySupplyList") : $("#dailyMedicineList");
  const prevEl = isSupply ? $("#dailySupplyPrev") : $("#dailyMedicinePrev");
  const nextEl = isSupply ? $("#dailySupplyNext") : $("#dailyMedicineNext");
  const pageInfoEl = isSupply ? $("#dailySupplyPageInfo") : $("#dailyMedicinePageInfo");

  const uiState = isSupply ? state.ui.dailySupply : state.ui.dailyMedicine;

  uiState.q = (searchEl.value || "").trim().toLowerCase();
  uiState.cabinet = cabEl.value || "";

  const rowsAll = (state.data.inventory || [])
    .filter(x => x && x.name)
    .filter(x => (x.category || "Medical Supply") === (isSupply ? "Medical Supply" : "Medicine"))
    .filter(x => !uiState.q || (x.name + " " + (x.lotNo || "")).toLowerCase().includes(uiState.q))
    .filter(x => !uiState.cabinet || (x.cabinet || "") === uiState.cabinet);

  const total = rowsAll.length;
  const pages = Math.max(1, Math.ceil(total / uiState.pageSize));
  uiState.page = Math.min(uiState.page, pages);

  const start = (uiState.page - 1) * uiState.pageSize;
  const rows = rowsAll.slice(start, start + uiState.pageSize);

  prevEl.disabled = uiState.page <= 1;
  nextEl.disabled = uiState.page >= pages;
  prevEl.classList.toggle("opacity-50", prevEl.disabled);
  nextEl.classList.toggle("opacity-50", nextEl.disabled);
  setText(pageInfoEl, `หน้า ${uiState.page}/${pages} • ${total} รายการ`);

  if (!rows.length) {
    listEl.innerHTML = `<div class="text-slate-500 text-sm">ไม่มีรายการ</div>`;
    return;
  }

  listEl.innerHTML = rows.map(it => `
    <div class="rounded-2xl border border-slate-200 bg-white p-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <button class="font-semibold underline hover:no-underline text-left" data-act="openItem" data-name="${escapeAttr(it.name)}">
            ${escapeHtml(it.name)}
          </button>
          <div class="text-xs text-slate-500 mt-1">
            Lot: ${escapeHtml(it.lotNo || "-")} • ตู้: ${escapeHtml(it.cabinet || "-")} • คงเหลือ: ${num(it.quantity)} • Min: ${num(it.minimumStock)}
          </div>
          <div class="text-xs mt-1">${expiryBadge(it.expiryStatus, it.expiryDays)}</div>
        </div>

        <div class="w-28">
          <label class="text-xs text-slate-500">ตรวจพบ</label>
          <input type="number" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                 data-check="qty" data-id="${escapeAttr(it.id)}" placeholder="${num(it.quantity)}" />
        </div>
      </div>
    </div>
  `).join("");

  // bind open item modal
  listEl.querySelectorAll("button[data-act='openItem']").forEach(btn => {
    btn.addEventListener("click", () => openItemModal(btn.dataset.name));
  });
}

/* ----------------------------- Item Modal ---------------------------- */

async function openItemModal(itemName) {
  state.ui.modal.currentItemName = itemName;
  loading(true, "กำลังโหลดรายละเอียด...");
  try {
    const res = await api("getItemDetail", { name: itemName });
    const d = res.data;

    setText($("#itemModalTitle"), d.name || "Item Detail");
    $("#itemModalImage").src = d.imageUrl || LOGO_URL || "";
    setText($("#itemModalTotalQty"), num(d.totalQuantity));
    setText($("#itemModalNearestExpiry"), d.nearestExpiry ? `${d.nearestExpiry.date} (Lot ${d.nearestExpiry.lotNo}, ${num(d.nearestExpiry.quantity)})` : "-");
    setText($("#itemModalLastReceive"), d.lastReceive ? `${d.lastReceive.date} (+${num(d.lastReceive.quantity)})` : "-");
    setText($("#itemModalLastUsage"), d.lastUsage ? `${d.lastUsage.date} (-${num(d.lastUsage.quantity)}) โดย ${d.lastUsage.by}` : "-");

    // lots
    const lotsEl = $("#itemModalLots");
    lotsEl.innerHTML = (d.lots || []).map(l => `
      <div class="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">
        <div class="text-sm">
          <div class="font-semibold">Lot: ${escapeHtml(l.lotNo || "")}</div>
          <div class="text-xs text-slate-500">คงเหลือ: ${num(l.quantity)} • หมดอายุ: ${escapeHtml(l.expiryDate || "-")}</div>
        </div>
        <div class="text-xs">${expiryBadge(l.expiryStatus, l.expiryDays)}</div>
      </div>
    `).join("");

    // usage lot select
    const lotSelect = $("#usageLotSelect");
    lotSelect.innerHTML = (d.lots || []).map(l => `<option value="${escapeAttr(l.lotNo)}">${escapeHtml(l.lotNo)} (คงเหลือ ${num(l.quantity)})</option>`).join("");

    // role-based buttons
    if (state.staff.role === "Admin") show($("#btnQuickEdit")); else hide($("#btnQuickEdit"));

    // open modal
    show($("#modalOverlay"));
    hide($("#quickUsageBox"));
    $("#usageQty").value = "";

    // bind quick edit => fill inventory form with the first lot row
    $("#btnQuickEdit").onclick = () => {
      const first = (d.lots && d.lots[0]) ? d.lots[0] : null;
      if (!first) return;
      switchRoute("inventory");
      show($("#inventoryForm"));
      $("#invId").value = first.id;
      $("#invName").value = d.name || "";
      $("#invLot").value = first.lotNo || "";
      $("#invQty").value = first.quantity || 0;
      $("#invMin").value = first.minimumStock || 5;
      $("#invExpiry").value = first.expiryDateISO || "";
      $("#invNote").value = first.note || "";
      $("#invCabinet").value = first.cabinet || "";
      $("#invCategory").value = first.category || "Medical Supply";
      hide($("#modalOverlay"));
      toast("เปิดหน้า Inventory เพื่อแก้ไข");
    };

  } catch (e) {
    toast("โหลดรายละเอียดไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

function toggleQuickUsage() {
  const box = $("#quickUsageBox");
  box.classList.toggle("hidden");
}

async function submitUsage() {
  const lotNo = $("#usageLotSelect").value;
  const qty = parseInt($("#usageQty").value || "0", 10);
  const name = state.ui.modal.currentItemName;

  if (!name) return toast("ไม่พบรายการ");
  if (!lotNo) return toast("กรุณาเลือก Lot");
  if (!qty || qty <= 0) return toast("กรุณาใส่จำนวนที่เบิก");

  loading(true, "กำลังบันทึกการเบิก...");
  try {
    await api("recordUsage", { itemName: name, lotNo, quantity: qty });
    toast("บันทึกการเบิกสำเร็จ");
    await bootstrap();
    // refresh modal
    await openItemModal(name);
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

/* ----------------------------- Submissions --------------------------- */

async function submitDaily(kind /* Supply | Medicine */) {
  const isSupply = kind === "Supply";
  const listEl = isSupply ? $("#dailySupplyList") : $("#dailyMedicineList");

  // collect inputs in current page only (small payload)
  const inputs = Array.from(listEl.querySelectorAll("input[data-check='qty']"));
  const records = [];
  inputs.forEach(inp => {
    const id = inp.dataset.id;
    const found = inp.value.trim();
    if (found === "") return; // allow partial
    const item = (state.data.inventory || []).find(x => String(x.id) === String(id));
    if (!item) return;
    records.push({
      itemName: item.name,
      lotNo: item.lotNo,
      checkedQuantity: parseInt(found, 10),
      expectedQuantity: parseInt(item.quantity || 0, 10),
      minimumStock: parseInt(item.minimumStock || 0, 10),
      expiryDate: item.expiryDate || ""
    });
  });

  if (!records.length) return toast("ยังไม่มีรายการที่กรอกจำนวนตรวจพบ");

  loading(true, "กำลังบันทึก Daily Check...");
  try {
    const sheetType = isSupply ? "Daily Check Supply" : "Daily Check Medicine";
    const res = await api("saveDailyCheck", { sheetType, records });
    toast(res.message || "บันทึกสำเร็จ");
    await bootstrap();
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

/* --------------------------- Inventory Form -------------------------- */

async function upsertInventory(e) {
  e.preventDefault();

  const payload = {
    id: $("#invId").value || "",
    name: $("#invName").value.trim(),
    lotNo: $("#invLot").value.trim(),
    quantity: parseInt($("#invQty").value || "0", 10),
    minimumStock: parseInt($("#invMin").value || "5", 10),
    expiryDate: $("#invExpiry").value || "",
    note: $("#invNote").value.trim(),
    cabinet: $("#invCabinet").value.trim(),
    category: $("#invCategory").value
  };

  if (!payload.name || !payload.lotNo) return toast("กรอก รายการ และ Lot ให้ครบ");

  loading(true, "กำลังบันทึกรายการ...");
  try {
    const res = await api("saveInventoryItem", payload);
    toast(res.message || "บันทึกสำเร็จ");

    // image upload (optional) via POST no-cors
    const file = ($("#invImage").files && $("#invImage").files[0]) ? $("#invImage").files[0] : null;
    if (file) {
      toast("กำลังอัปโหลดรูป...");
      await uploadImageNoCors(res.data && res.data.id ? res.data.id : (payload.id || ""), file);
      toast("อัปโหลดรูปแล้ว (กำลังรีโหลดข้อมูล)");
    }

    // reset form
    $("#inventoryForm").reset();
    $("#invId").value = "";
    $("#invMin").value = "5";
    $("#inventoryForm").classList.add("hidden");

    await bootstrap();
  } catch (e2) {
    toast("บันทึกไม่สำเร็จ: " + e2.message);
  } finally {
    loading(false);
  }
}

async function uploadImageNoCors(itemRowId, file) {
  if (!itemRowId) throw new Error("ไม่พบ id สำหรับอัปโหลดรูป");

  // compress image to keep base64 smaller (important for Apps Script)
  const compressed = await compressImage(file, 1024, 0.82);

  const fd = new FormData();
  fd.append("token", state.token);
  fd.append("id", String(itemRowId));
  fd.append("mimeType", compressed.type);
  fd.append("fileName", compressed.name);
  fd.append("base64", compressed.base64); // pure base64 (no data: prefix)

  // Important: no-cors => opaque response (we cannot read), so we refresh after
  await fetch(API_URL + "?action=uploadItemImage", {
    method: "POST",
    mode: "no-cors",
    body: fd
  });

  // give server time then refresh by polling
  await new Promise(r => setTimeout(r, 1200));
}

function compressImage(file, maxW = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const fr = new FileReader();

    fr.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(1, maxW / img.width);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const mime = "image/jpeg"; // normalize for size
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Compress failed"));
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result; // data:image/jpeg;base64,...
            const base64 = String(dataUrl).split(",")[1] || "";
            resolve({
              name: (file.name || "item") + ".jpg",
              type: mime,
              base64
            });
          };
          reader.readAsDataURL(blob);
        }, mime, quality);
      };

      img.onerror = reject;
      img.src = fr.result;
    };

    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/* ------------------------------ Users ------------------------------- */

async function upsertUser(e) {
  e.preventDefault();

  const editMode = $("#userEditMode").value === "true";
  const originalId = $("#userOriginalId").value || "";
  const staffId = $("#userId").value.trim();
  const name = $("#userName").value.trim();
  const password = $("#userPass").value; // optional on edit
  const role = $("#userRole").value;

  if (!staffId || !name) return toast("กรอก StaffID และ Name ให้ครบ");

  loading(true, "กำลังบันทึกผู้ใช้...");
  try {
    await api("upsertStaff", { editMode, originalId, staffId, name, password, role });
    toast("บันทึกผู้ใช้สำเร็จ");
    resetUserForm();
    await bootstrap();
  } catch (e2) {
    toast("บันทึกไม่สำเร็จ: " + e2.message);
  } finally {
    loading(false);
  }
}

function resetUserForm() {
  $("#userForm").reset();
  $("#userEditMode").value = "false";
  $("#userOriginalId").value = "";
  $("#userId").disabled = false;
}

/* ------------------------------ Report ------------------------------ */

async function saveRecipients() {
  const lines = ($("#emailRecipientsInput").value || "")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);

  loading(true, "กำลังบันทึกอีเมลผู้รับ...");
  try {
    await api("updateEmailRecipients", { emails: lines });
    toast("บันทึกอีเมลผู้รับสำเร็จ");
    await bootstrap();
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

async function sendReport() {
  loading(true, "กำลังสร้างและส่งรายงาน...");
  try {
    const res = await api("sendReportManually", {});
    toast(res.message || "ส่งรายงานสำเร็จ");
  } catch (e) {
    toast("ส่งรายงานไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

/* ------------------------------ Settings ---------------------------- */

async function loadStatus() {
  loading(true, "กำลังโหลดสถานะ...");
  try {
    const res = await api("getSystemStatus", {});
    $("#systemStatusBox").textContent = JSON.stringify(res.data || {}, null, 2);
    toast("โหลดสถานะแล้ว");
  } catch (e) {
    toast("โหลดสถานะไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

async function backupNow() {
  loading(true, "กำลังสำรองข้อมูล...");
  try {
    const res = await api("backupData", {});
    toast(res.message || "สำรองข้อมูลสำเร็จ");
  } catch (e) {
    toast("สำรองไม่สำเร็จ: " + e.message);
  } finally {
    loading(false);
  }
}

/* ------------------------------ Auth ------------------------------- */

async function login(staffId, password) {
  loading(true, "กำลังเข้าสู่ระบบ...");
  try {
    const res = await api("login", { staffId, password });
    state.token = res.data.token;
    state.staff = { id: res.data.staffId, name: res.data.name, role: res.data.role };
    saveSession();
    return true;
  } catch (e) {
    toast("Login ไม่สำเร็จ: " + e.message);
    return false;
  } finally {
    loading(false);
  }
}

function logout() {
  clearSession();
  hide($("#mainView"));
  show($("#loginView"));
  toast("ออกจากระบบแล้ว");
}

/* ----------------------------- Admin Sheet --------------------------- */

function toggleAdminSheet() {
  const overlay = $("#adminSheetOverlay");
  const sheet = $("#adminSheet");
  const isHidden = sheet.classList.contains("hidden");
  if (isHidden) { show(overlay); show(sheet); }
  else { hide(overlay); hide(sheet); }
}

function closeAdminSheet() {
  hide($("#adminSheetOverlay"));
  hide($("#adminSheet"));
}

/* ------------------------------ Events ------------------------------ */

function bindNavButtons() {
  $$(".navBtn").forEach(btn => {
    btn.addEventListener("click", () => switchRoute(btn.dataset.route));
  });
}

function bindBottomNavButtons() {
  $$(".bnBtn[data-route]").forEach(btn => {
    btn.addEventListener("click", () => switchRoute(btn.dataset.route));
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll('"', "&quot;"); }
function num(x) { const n = parseInt(x || 0, 10); return isNaN(n) ? "0" : String(n); }

function badge(status) {
  const s = String(status || "");
  const cls =
    s.includes("หมดอายุแล้ว") ? "bg-rose-100 text-rose-800" :
    s.includes("30") ? "bg-amber-100 text-amber-800" :
    s.includes("60") ? "bg-yellow-100 text-yellow-800" :
    s.includes("180") ? "bg-slate-100 text-slate-700" :
    "bg-slate-100 text-slate-700";
  return `<span class="px-2 py-1 rounded-lg text-xs ${cls}">${escapeHtml(s)}</span>`;
}

function expiryBadge(status, days) {
  const s = String(status || "");
  const d = (days === null || days === undefined) ? "" : ` (${days} วัน)`;
  return badge(s + d);
}

/* ------------------------------- Init ------------------------------- */

async function init() {
  setLogo();
  bindNavButtons();
  bindBottomNavButtons();

  // sidebar logout
  $("#btnLogoutSidebar").addEventListener("click", logout);

  // refresh
  $("#btnRefresh").addEventListener("click", async () => {
    await bootstrap();
    toast("รีเฟรชแล้ว");
  });

  // daily events
  $("#dailySupplySearch").addEventListener("input", () => { state.ui.dailySupply.page = 1; renderDaily("Supply"); });
  $("#dailySupplyCabinet").addEventListener("change", () => { state.ui.dailySupply.page = 1; renderDaily("Supply"); });
  $("#dailySupplyPrev").addEventListener("click", () => { state.ui.dailySupply.page--; renderDaily("Supply"); });
  $("#dailySupplyNext").addEventListener("click", () => { state.ui.dailySupply.page++; renderDaily("Supply"); });
  $("#btnDailySupplySubmit").addEventListener("click", () => submitDaily("Supply"));

  $("#dailyMedicineSearch").addEventListener("input", () => { state.ui.dailyMedicine.page = 1; renderDaily("Medicine"); });
  $("#dailyMedicineCabinet").addEventListener("change", () => { state.ui.dailyMedicine.page = 1; renderDaily("Medicine"); });
  $("#dailyMedicinePrev").addEventListener("click", () => { state.ui.dailyMedicine.page--; renderDaily("Medicine"); });
  $("#dailyMedicineNext").addEventListener("click", () => { state.ui.dailyMedicine.page++; renderDaily("Medicine"); });
  $("#btnDailyMedicineSubmit").addEventListener("click", () => submitDaily("Medicine"));

  // inventory
  $("#btnToggleInvForm").addEventListener("click", () => $("#inventoryForm").classList.toggle("hidden"));
  $("#btnInvCancel").addEventListener("click", () => {
    $("#inventoryForm").reset();
    $("#invId").value = "";
    $("#invMin").value = "5";
    hide($("#inventoryForm"));
  });
  $("#inventoryForm").addEventListener("submit", upsertInventory);
  $("#invSearch").addEventListener("input", renderInventory);
  $("#invCabinetFilter").addEventListener("change", renderInventory);

  // users
  $("#userForm").addEventListener("submit", upsertUser);
  $("#btnUserCancel").addEventListener("click", resetUserForm);

  // report
  $("#btnSaveRecipients").addEventListener("click", saveRecipients);
  $("#btnSendReport").addEventListener("click", sendReport);

  // settings
  $("#btnLoadStatus").addEventListener("click", loadStatus);
  $("#btnBackup").addEventListener("click", backupNow);

  // modal
  $("#btnCloseModal").addEventListener("click", () => hide($("#modalOverlay")));
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target === $("#modalOverlay")) hide($("#modalOverlay")); });
  $("#btnQuickUsage").addEventListener("click", toggleQuickUsage);
  $("#btnSubmitUsage").addEventListener("click", submitUsage);

  // admin sheet toggle visibility class
  $("#bnAdminBtn").addEventListener("click", toggleAdminSheet);
  $("#btnCloseAdminSheet").addEventListener("click", closeAdminSheet);
  $("#adminSheetOverlay").addEventListener("click", closeAdminSheet);

  $$(".adminSheetBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeAdminSheet();
      switchRoute(btn.dataset.route);
    });
  });

  // login form
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const staffId = $("#loginStaffId").value.trim();
    const password = $("#loginPassword").value;
    const ok = await login(staffId, password);
    if (!ok) return;
    hide($("#loginView"));
    show($("#mainView"));
    $("#sidebarUserMeta").textContent = `${state.staff.name} (${state.staff.role})`;

    await bootstrap();
    toast("เข้าสู่ระบบสำเร็จ");
  });

  // restore session
  loadSession();
  if (state.token) {
    hide($("#loginView"));
    show($("#mainView"));
    $("#sidebarUserMeta").textContent = `${state.staff.name} (${state.staff.role})`;
    try {
      await bootstrap();
    } catch (_) {
      // token expired
      logout();
    }
  }

  // poll last updated for near real-time
  setInterval(pollLastUpdated, 30000);
}

document.addEventListener("DOMContentLoaded", init);
