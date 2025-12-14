(() => {
  const API_URL = window.APP_CONFIG?.API_URL;
  const LOGO_URL = "https://lh5.googleusercontent.com/d/1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO";
  const ROLE = { Admin: "Admin", RN: "RN", PN: "PN" };

  const MENU = [
    { key: "dailySupply", label: "Daily Check Supply", icon: "fa-clipboard-check", roles: [ROLE.Admin, ROLE.PN] },
    { key: "dailyMedicine", label: "Daily Check Medicine", icon: "fa-clipboard-check", roles: [ROLE.Admin, ROLE.RN] },
    { key: "inventory", label: "Inventory", icon: "fa-boxes-stacked", roles: [ROLE.Admin] },
    { key: "reorder", label: "Reorder", icon: "fa-arrows-rotate", roles: [ROLE.Admin, ROLE.RN, ROLE.PN] },
    { key: "expired", label: "Expired", icon: "fa-triangle-exclamation", roles: [ROLE.Admin, ROLE.RN, ROLE.PN] },
    { key: "shift", label: "Shift Summary", icon: "fa-users-line", roles: [ROLE.Admin] },
    { key: "users", label: "User Management", icon: "fa-users-gear", roles: [ROLE.Admin] },
    { key: "report", label: "Report", icon: "fa-file-pdf", roles: [ROLE.Admin, ROLE.RN, ROLE.PN] }
  ];

  const state = {
    token: localStorage.getItem("icu_token") || "",
    user: safeJson(localStorage.getItem("icu_user")),
    snapshot: null,
    lastUpdated: "",
    active: "home",
    poll: null
  };

  // -------- utils --------
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function safeJson(v) { try { return v ? JSON.parse(v) : null; } catch { return null; } }
  function setApp(html) { document.getElementById("app").innerHTML = html; }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function toggle(el) { el.classList.toggle("hidden"); }

  function toast(type, msg) {
    const el = $("#toast");
    if (!el) return;
    el.className = "mb-4 rounded-xl border px-3 py-2 text-sm";
    el.classList.add(
      type === "error" ? "border-rose-200 bg-rose-50 text-rose-700"
        : type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-700"
    );
    el.textContent = msg;
    show(el);
    setTimeout(() => hide(el), 4500);
  }

  function loading(on, text = "กำลังทำงาน...") {
    const w = $("#loadingWrap");
    if (!w) return;
    $("#loadingText").textContent = text;
    on ? show(w) : hide(w);
  }

  function saveSession(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem("icu_token", token);
    localStorage.setItem("icu_user", JSON.stringify(user));
  }

  function clearSession() {
    state.token = "";
    state.user = null;
    localStorage.removeItem("icu_token");
    localStorage.removeItem("icu_user");
  }

  function canAccess(key) {
    if (key === "home") return true;
    const m = MENU.find(x => x.key === key);
    return m ? m.roles.includes(state.user?.role) : false;
  }

  // IMPORTANT: Avoid preflight by using text/plain (Apps Script web app commonly breaks on OPTIONS)
  async function api(action, data = {}) {
    if (!API_URL || !API_URL.includes("/exec")) {
      throw new Error("API_URL ไม่ถูกต้อง (ต้องเป็น Web App URL ที่ลงท้าย /exec) กรุณาแก้ config.js");
    }

    const payload = { action, token: state.token, ...data };
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      throw new Error("เชื่อมต่อ API ไม่ได้ (Network/CORS). ตรวจ API_URL และการ Deploy Web App");
    }

    const text = await res.text();

    // If deploy/access wrong -> often returns HTML login page
    if (text.trim().startsWith("<")) {
      const head = text.slice(0, 200).replace(/\s+/g, " ");
      throw new Error("API ตอบกลับเป็น HTML (มักเกิดจากใช้ /dev หรือ Access ไม่เป็น Anyone). ตัวอย่าง: " + head);
    }

    let json;
    try { json = JSON.parse(text); }
    catch {
      throw new Error("API ไม่ได้ตอบ JSON. ตัวอย่าง: " + text.slice(0, 200));
    }

    return json;
  }

  // -------- image resize helper --------
  async function readResize(file, max = 1024, q = 0.85) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", q));
        };
        img.onerror = () => reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // -------- Views --------
  function renderLogin() {
    setApp(`
      <section class="min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-8 bg-slate-900 text-white">
            <div class="flex items-center gap-3">
              <img class="h-12 w-12 rounded-xl bg-white/10 object-contain p-2" src="${LOGO_URL}" alt="logo">
              <div>
                <div class="text-2xl font-semibold">ICU Stock</div>
                <div class="text-white/75 text-sm mt-1">GitHub Pages UI + Apps Script API</div>
              </div>
            </div>
            <ul class="mt-8 text-sm text-white/80 space-y-2">
              <li><i class="fa-solid fa-check mr-2"></i>Desktop Sidebar + Mobile Bottom Nav</li>
              <li><i class="fa-solid fa-check mr-2"></i>Admin Action Sheet (Bottom Sheet)</li>
              <li><i class="fa-solid fa-check mr-2"></i>Inventory upload/camera + item detail modal</li>
              <li><i class="fa-solid fa-check mr-2"></i>PDF report + email + expiry summary</li>
            </ul>
          </div>

          <div class="p-8">
            <div class="text-xl font-semibold">เข้าสู่ระบบ</div>
            <div class="text-sm text-slate-500 mt-1">กรอก StaffID และ Password</div>

            <div id="toast" class="hidden mt-4"></div>

            <form id="loginForm" class="mt-6 space-y-4">
              <div>
                <label class="text-sm font-medium">StaffID</label>
                <input id="sid" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="เช่น admin001" required>
              </div>
              <div>
                <label class="text-sm font-medium">Password</label>
                <div class="mt-1 flex rounded-xl border border-slate-200 overflow-hidden">
                  <input id="pwd" type="password" class="w-full px-3 py-2 outline-none" required>
                  <button id="togglePwd" type="button" class="px-3 text-slate-600 hover:text-slate-900">
                    <i class="fa-regular fa-eye"></i>
                  </button>
                </div>
              </div>
              <button class="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800">
                <i class="fa-solid fa-right-to-bracket mr-2"></i>Login
              </button>
            </form>

            <div class="mt-8 text-xs text-slate-400">Developed by BHH IV Chemo Team © 2025</div>
          </div>
        </div>

        <div id="loadingWrap" class="hidden fixed inset-0 z-[60] flex items-center justify-center">
          <div class="absolute inset-0 backdrop"></div>
          <div class="relative bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <div class="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin"></div>
            <div id="loadingText" class="text-sm">กำลังทำงาน...</div>
          </div>
        </div>
      </section>
    `);

    $("#togglePwd").onclick = () => {
      const ip = $("#pwd");
      ip.type = ip.type === "password" ? "text" : "password";
    };

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        loading(true, "กำลังเริ่มระบบ...");
        const init = await api("init");
        if (!init.success) throw new Error(init.error || "init failed");

        loading(true, "กำลังเข้าสู่ระบบ...");
        const res = await api("login", { staffId: $("#sid").value.trim(), password: $("#pwd").value.trim() });
        if (!res.success) throw new Error(res.error || "login failed");

        saveSession(res.token, res.user);

        renderAppShell();
        await refresh(true);
        startPoll();

        if (state.user.role === ROLE.Admin) setTab("inventory");
        else setTab(state.user.role === ROLE.RN ? "dailyMedicine" : "dailySupply");

      } catch (err) {
        toast("error", err.message || String(err));
      } finally {
        loading(false);
      }
    });
  }

  function renderAppShell() {
    const isAdmin = state.user?.role === ROLE.Admin;

    setApp(`
      <section class="min-h-screen">

        <!-- Desktop Sidebar -->
        <aside class="hidden md:flex fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex-col">
          <div class="p-5 flex items-center gap-3 border-b border-slate-100">
            <img class="h-10 w-10 rounded-xl bg-slate-100 object-contain p-2" src="${LOGO_URL}" alt="logo">
            <div class="min-w-0">
              <div class="font-semibold">ICU Stock</div>
              <div class="text-xs text-slate-500 truncate">${esc(state.user.staffName)} (${esc(state.user.staffId)}) • ${esc(state.user.role)}</div>
            </div>
          </div>

          <nav id="sidebarMenu" class="p-3 space-y-1 overflow-y-auto"></nav>

          <div class="mt-auto p-3 border-t border-slate-100">
            <button id="logoutDesktop" class="w-full rounded-xl border border-slate-200 py-2 text-sm hover:bg-slate-50">
              <i class="fa-solid fa-right-from-bracket mr-2"></i>Logout
            </button>
          </div>
        </aside>

        <!-- Header -->
        <header class="md:ml-72 sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
          <div class="px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button id="openProfileMobile" class="md:hidden h-10 w-10 rounded-xl bg-slate-900 text-white">
                <i class="fa-solid fa-user"></i>
              </button>
              <div>
                <div id="pageTitle" class="font-semibold">—</div>
                <div id="pageSubtitle" class="text-xs text-slate-500">—</div>
              </div>
            </div>
            <button id="refreshBtn" class="h-10 px-4 rounded-xl border border-slate-200 text-sm hover:bg-slate-50">
              <i class="fa-solid fa-rotate mr-2"></i>Refresh
            </button>
          </div>
        </header>

        <!-- Content -->
        <main class="md:ml-72 pb-24 md:pb-8">
          <div class="p-4 md:p-6 max-w-6xl mx-auto">
            <div id="toast" class="hidden mb-4"></div>

            <section id="tab_home"></section>
            <section id="tab_dailySupply" class="hidden"></section>
            <section id="tab_dailyMedicine" class="hidden"></section>
            <section id="tab_inventory" class="hidden"></section>
            <section id="tab_reorder" class="hidden"></section>
            <section id="tab_expired" class="hidden"></section>
            <section id="tab_shift" class="hidden"></section>
            <section id="tab_users" class="hidden"></section>
            <section id="tab_report" class="hidden"></section>
          </div>
        </main>

        <!-- Mobile Bottom Nav -->
        <nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200">
          <div class="grid grid-cols-4 h-16 items-center">
            <button class="bn px-2 py-2 text-slate-600 text-xs flex flex-col items-center gap-1" data-key="home">
              <i class="fa-solid fa-house text-base"></i>หน้าแรก
            </button>
            <button class="bn px-2 py-2 text-slate-600 text-xs flex flex-col items-center gap-1" data-key="main">
              <i class="fa-solid fa-list-check text-base"></i>รายการ
            </button>

            <button id="bnAdmin" class="${isAdmin ? "" : "hidden"} relative -mt-8 mx-auto h-14 w-14 rounded-2xl bg-slate-900 text-white shadow-sm">
              <i class="fa-solid fa-bars"></i>
            </button>

            <button class="bn px-2 py-2 text-slate-600 text-xs flex flex-col items-center gap-1" data-key="alerts">
              <i class="fa-solid fa-triangle-exclamation text-base"></i>แจ้งเตือน
            </button>
            <button class="bn px-2 py-2 text-slate-600 text-xs flex flex-col items-center gap-1" data-key="profile">
              <i class="fa-solid fa-user text-base"></i>โปรไฟล์
            </button>
          </div>
        </nav>

        <!-- Admin Action Sheet -->
        <div id="adminSheetWrap" class="hidden fixed inset-0 z-50">
          <div class="absolute inset-0 backdrop" id="adminSheetBackdrop"></div>
          <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl border-t border-slate-200 p-4 pb-6">
            <div class="flex items-center justify-between">
              <div class="font-semibold">เมนูผู้ดูแลระบบ</div>
              <button id="adminSheetClose" class="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div id="adminSheetGrid" class="mt-4 grid grid-cols-3 gap-3"></div>
          </div>
        </div>

        <!-- Profile Modal -->
        <div id="profileWrap" class="hidden fixed inset-0 z-50">
          <div class="absolute inset-0 backdrop" data-close="profile"></div>
          <div class="absolute inset-x-0 top-12 mx-auto max-w-md bg-white rounded-2xl border border-slate-200 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-semibold text-lg">โปรไฟล์</div>
                <div class="text-xs text-slate-500">ข้อมูลผู้ใช้งาน</div>
              </div>
              <button class="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50" data-close="profile">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="mt-4 space-y-2 text-sm">
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="text-xs text-slate-500">ชื่อ</div>
                <div class="font-semibold">${esc(state.user.staffName)}</div>
              </div>
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="text-xs text-slate-500">StaffID</div>
                <div class="font-semibold">${esc(state.user.staffId)}</div>
              </div>
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="text-xs text-slate-500">Role</div>
                <div class="font-semibold">${esc(state.user.role)}</div>
              </div>
              <button id="logoutMobile" class="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800">
                <i class="fa-solid fa-right-from-bracket mr-2"></i>Logout
              </button>
            </div>
          </div>
        </div>

        <!-- Item Detail Modal -->
        <div id="itemDetailWrap" class="hidden fixed inset-0 z-50">
          <div class="absolute inset-0 backdrop" data-close="itemDetail"></div>
          <div class="absolute inset-x-0 top-10 mx-auto max-w-2xl bg-white rounded-2xl border border-slate-200 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div id="dTitle" class="text-lg font-semibold truncate">—</div>
                <div id="dSub" class="text-xs text-slate-500">—</div>
              </div>
              <button class="h-9 w-9 rounded-xl border border-slate-200 hover:bg-slate-50" data-close="itemDetail">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <img id="dImg" class="w-full aspect-square rounded-2xl border border-slate-200 object-cover bg-slate-50" alt="">
              <div class="md:col-span-2 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="rounded-xl border border-slate-200 p-3">
                    <div class="text-xs text-slate-500">คงเหลือ (Lot นี้)</div>
                    <div id="dQty" class="text-xl font-semibold">—</div>
                  </div>
                  <div class="rounded-xl border border-slate-200 p-3">
                    <div class="text-xs text-slate-500">วันหมดอายุใกล้ที่สุด</div>
                    <div id="dNear" class="text-sm font-semibold">—</div>
                    <div id="dNearQty" class="text-xs text-slate-500 mt-1">—</div>
                  </div>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <div class="text-sm font-semibold">เคลื่อนไหวล่าสุด</div>
                  <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><div class="text-xs text-slate-500">รับเข้าล่าสุด</div><div id="dIn">—</div></div>
                    <div><div class="text-xs text-slate-500">เบิกล่าสุด</div><div id="dOut">—</div></div>
                  </div>
                </div>
                <div class="rounded-xl border border-slate-200 p-3">
                  <div class="text-sm font-semibold">Lots ทั้งหมด</div>
                  <div class="mt-2 max-h-40 overflow-auto">
                    <table class="w-full text-sm">
                      <thead class="text-xs text-slate-500">
                        <tr><th class="text-left py-1 pr-2">Lot</th><th class="text-left py-1 pr-2">Qty</th><th class="text-left py-1 pr-2">Expiry</th></tr>
                      </thead>
                      <tbody id="dLots" class="divide-y divide-slate-100"></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div id="loadingWrap" class="hidden fixed inset-0 z-[60] flex items-center justify-center">
          <div class="absolute inset-0 backdrop"></div>
          <div class="relative bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
            <div class="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin"></div>
            <div id="loadingText" class="text-sm">กำลังทำงาน...</div>
          </div>
        </div>

      </section>
    `);

    buildNav();
    bindShellEvents();
  }

  function buildNav() {
    const side = $("#sidebarMenu");
    side.innerHTML = "";

    const all = [{ key: "home", label: "Dashboard", icon: "fa-house", roles: [ROLE.Admin, ROLE.RN, ROLE.PN] }, ...MENU];

    all.filter(m => m.roles.includes(state.user.role)).forEach(m => {
      const b = document.createElement("button");
      b.className = "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-slate-50 text-slate-700";
      b.innerHTML = `<i class="fa-solid ${m.icon} w-5 text-slate-500"></i><span class="font-medium">${m.label}</span>`;
      b.onclick = () => setTab(m.key);
      side.appendChild(b);
    });

    // Admin sheet grid
    const grid = $("#adminSheetGrid");
    if (grid) {
      grid.innerHTML = MENU.filter(m => m.roles.includes(ROLE.Admin)).map(m => `
        <button class="rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50" data-ak="${m.key}">
          <div class="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
            <i class="fa-solid ${m.icon}"></i>
          </div>
          <div class="mt-2 text-xs font-semibold">${m.label}</div>
        </button>
      `).join("");

      grid.querySelectorAll("[data-ak]").forEach(b => {
        b.onclick = () => { toggleAdminSheet(false); setTab(b.dataset.ak); };
      });
    }
  }

  function bindShellEvents() {
    $("#refreshBtn").onclick = async () => {
      try { loading(true, "Refreshing..."); await refresh(true); toast("success", "อัปเดตข้อมูลแล้ว"); }
      catch (e) { toast("error", e.message || String(e)); }
      finally { loading(false); }
    };

    $("#logoutDesktop").onclick = logout;
    $("#logoutMobile").onclick = logout;

    $("#openProfileMobile").onclick = () => show($("#profileWrap"));

    // bottom nav
    document.querySelectorAll(".bn").forEach(b => {
      b.addEventListener("click", () => {
        const k = b.dataset.key;
        if (k === "main") setTab(state.user.role === ROLE.RN ? "dailyMedicine" : "dailySupply");
        else if (k === "alerts") setTab("expired");
        else if (k === "profile") show($("#profileWrap"));
        else setTab("home");
      });
    });

    // admin sheet toggle
    const bnAdmin = $("#bnAdmin");
    if (bnAdmin) bnAdmin.onclick = () => toggleAdminSheet();
    $("#adminSheetBackdrop")?.addEventListener("click", () => toggleAdminSheet(false));
    $("#adminSheetClose")?.addEventListener("click", () => toggleAdminSheet(false));

    // close modals by backdrop
    document.addEventListener("click", (e) => {
      if (e.target?.dataset?.close === "profile") hide($("#profileWrap"));
      if (e.target?.dataset?.close === "itemDetail") hide($("#itemDetailWrap"));
    });
  }

  function toggleAdminSheet(force) {
    const w = $("#adminSheetWrap");
    const open = !w.classList.contains("hidden");
    if (force === true || (!open && force !== false)) show(w);
    if (force === false || (open && force !== true)) hide(w);
  }

  // -------- tabs + render --------
  const TABMAP = {
    home: "tab_home",
    dailySupply: "tab_dailySupply",
    dailyMedicine: "tab_dailyMedicine",
    inventory: "tab_inventory",
    reorder: "tab_reorder",
    expired: "tab_expired",
    shift: "tab_shift",
    users: "tab_users",
    report: "tab_report"
  };

  function setHeader(title, sub) {
    $("#pageTitle").textContent = title;
    $("#pageSubtitle").textContent = sub || "";
  }

  function setTab(key) {
    if (!canAccess(key)) return toast("error", "คุณไม่มีสิทธิ์เข้าถึงเมนูนี้");
    state.active = key;

    Object.values(TABMAP).forEach(id => hide($("#" + id)));
    show($("#" + (TABMAP[key] || "tab_home")));
    renderActive();
  }

  async function refresh(force) {
    const since = force ? "" : state.lastUpdated;
    const res = await api("snapshot", { since });
    if (!res.success) throw new Error(res.error || "snapshot failed");
    if (res.changed) {
      state.snapshot = res.snapshot;
      state.lastUpdated = res.lastUpdated;
    }
    renderActive();
  }

  function startPoll() {
    stopPoll();
    state.poll = setInterval(async () => { try { await refresh(false); } catch (_) {} }, 30000);
  }

  function stopPoll() {
    if (state.poll) clearInterval(state.poll);
    state.poll = null;
  }

  function renderActive() {
    if (!state.snapshot) {
      setHeader("Loading", "—");
      $("#tab_home").innerHTML = `<div class="text-slate-500">กำลังโหลดข้อมูล...</div>`;
      return;
    }

    const s = state.snapshot;

    if (state.active === "home") return renderHome(s);
    if (state.active === "dailySupply") return renderDaily("Supply", s);
    if (state.active === "dailyMedicine") return renderDaily("Medicine", s);
    if (state.active === "inventory") return renderInventory(s);
    if (state.active === "reorder") return renderReorder(s);
    if (state.active === "expired") return renderExpired(s);
    if (state.active === "shift") return renderShift(s);
    if (state.active === "users") return renderUsers(s);
    if (state.active === "report") return renderReport(s);
  }

  function renderHome(s) {
    setHeader("Dashboard", `Last updated: ${new Date(state.lastUpdated).toLocaleString("th-TH")}`);
    $("#tab_home").innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="text-xs text-slate-500">Total Lots</div><div class="text-2xl font-semibold">${s.summary.totalLots}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="text-xs text-slate-500">Low Stock</div><div class="text-2xl font-semibold">${s.summary.lowStockItems}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="text-xs text-slate-500">Expiry ≤ 180</div><div class="text-2xl font-semibold">${s.summary.expiryItems}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="text-xs text-slate-500">Shift</div><div class="text-2xl font-semibold">${esc(s.shiftNow)}</div>
        </div>
      </div>
    `;
  }

  function renderDaily(kind, s) {
    const isMed = kind === "Medicine";
    setHeader(isMed ? "Daily Check Medicine" : "Daily Check Supply", `Shift: ${esc(s.shiftNow)} • ${esc(state.user.staffName)}`);

    const list = (s.inventory || []).filter(x => x.category === (isMed ? "Medicine" : "Medical Supply"));
    const byCab = {};
    list.forEach(x => {
      const c = x.cabinet || "ไม่ระบุตู้";
      byCab[c] = byCab[c] || [];
      byCab[c].push(x);
    });

    const cabKeys = Object.keys(byCab).sort();
    const el = isMed ? $("#tab_dailyMedicine") : $("#tab_dailySupply");

    el.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-2">
        <div class="text-sm"><b>ผู้ตรวจ:</b> ${esc(state.user.staffName)} (${esc(state.user.staffId)})</div>
        <button id="dailySaveBtn" class="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">
          <i class="fa-solid fa-floppy-disk mr-2"></i>บันทึกการตรวจ
        </button>
      </div>

      <div class="mt-4 space-y-4">
        ${cabKeys.map(cab => `
          <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 font-semibold">${esc(cab)}</div>
            <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              ${byCab[cab].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(x => `
                <div class="rounded-2xl border border-slate-200 p-3 hover:bg-slate-50">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="font-semibold truncate">${esc(x.name)}</div>
                      <div class="text-xs text-slate-500 mt-1">Lot: ${esc(x.lotNo || "-")} • Exp: ${esc(x.expiryDate || "-")} • Min: ${x.minimumStock}</div>
                    </div>
                    <div class="text-xs text-slate-600">${esc(x.expiryStatus || "")}</div>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-3 items-end">
                    <div><div class="text-xs text-slate-500">คงเหลือ</div><div class="text-lg font-semibold">${x.quantity}</div></div>
                    <div>
                      <div class="text-xs text-slate-500">จำนวนที่ตรวจ</div>
                      <input class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        type="number" min="0" max="${x.quantity}"
                        data-check="1" data-id="${x.id}" value="${x.quantity}">
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;

    el.querySelector("#dailySaveBtn").onclick = async () => {
      const inputs = el.querySelectorAll("input[data-check='1']");
      const rows = [];
      for (const ip of inputs) {
        const qty = Number(ip.value);
        const max = Number(ip.getAttribute("max"));
        if (Number.isNaN(qty) || qty < 0) return toast("error", "จำนวนไม่ถูกต้อง");
        if (qty > max) return toast("error", "จำนวนที่ตรวจมากกว่าสต็อก");
        rows.push({ id: Number(ip.dataset.id), quantity: qty });
      }

      try {
        loading(true, "กำลังบันทึก...");
        const res = await api("dailyCheck", { rows });
        if (!res.success) throw new Error(res.error || "dailyCheck failed");
        toast("success", res.message || "บันทึกสำเร็จ");
        await refresh(true);
      } catch (e) {
        toast("error", e.message || String(e));
      } finally {
        loading(false);
      }
    };
  }

  function renderInventory(s) {
    setHeader("Inventory", "Admin: เพิ่ม/แก้ไข + Upload/Camera + คลิกดูรายละเอียด");
    const el = $("#tab_inventory");
    const inv = (s.inventory || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    el.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="font-semibold">เพิ่ม/แก้ไขรายการ</div>
          <form id="invForm" class="mt-3 space-y-2">
            <input id="fid" type="hidden">
            <input id="fimg" type="hidden">

            <input id="fname" class="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="รายการ" required>
            <input id="flot" class="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Lot No" required>

            <div class="grid grid-cols-2 gap-2">
              <input id="fqty" type="number" min="0" class="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="จำนวน" value="0">
              <input id="fmin" type="number" min="0" class="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Minimum" value="5">
            </div>

            <input id="fexp" type="date" class="w-full rounded-xl border border-slate-200 px-3 py-2">
            <input id="fcab" class="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="ตู้">
            <select id="fcat" class="w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="Medical Supply">Medical Supply</option>
              <option value="Medicine">Medicine</option>
            </select>
            <textarea id="fnote" class="w-full rounded-xl border border-slate-200 px-3 py-2" rows="2" placeholder="หมายเหตุ"></textarea>

            <div class="rounded-2xl border border-dashed border-slate-200 p-3">
              <div class="text-xs text-slate-500 mb-2">รูปภาพ (Upload/Camera)</div>
              <img id="imgPrev" class="h-24 w-24 rounded-2xl border border-slate-200 object-cover bg-slate-50" alt="">
              <input id="imgFile" type="file" accept="image/*" capture="environment"
                     class="mt-2 block w-full text-xs text-slate-600
                            file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-800">
              <button id="imgClear" type="button" class="mt-2 text-xs text-slate-600 hover:text-slate-900">ล้างรูป</button>
            </div>

            <div class="flex gap-2 pt-1">
              <button class="flex-1 rounded-xl bg-slate-900 text-white py-2 hover:bg-slate-800">บันทึก</button>
              <button id="freset" type="button" class="rounded-xl border border-slate-200 px-4 py-2 hover:bg-slate-50">ยกเลิก</button>
            </div>
          </form>
        </div>

        <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between gap-2">
            <div class="font-semibold">รายการทั้งหมด</div>
            <input id="q" class="w-56 max-w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="ค้นหา...">
          </div>
          <div class="mt-3 overflow-auto rounded-2xl border border-slate-100">
            <table class="w-full text-sm">
              <thead class="text-xs text-slate-500 bg-slate-50">
                <tr>
                  <th class="text-left p-3">รูป</th>
                  <th class="text-left p-3">รายการ</th>
                  <th class="text-left p-3">Lot</th>
                  <th class="text-left p-3">Qty</th>
                  <th class="text-left p-3">Exp</th>
                  <th class="text-left p-3">Action</th>
                </tr>
              </thead>
              <tbody id="tb" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const tb = el.querySelector("#tb");
    const q = el.querySelector("#q");

    function resetForm() {
      el.querySelector("#fid").value = "";
      el.querySelector("#fimg").value = "";
      el.querySelector("#fname").value = "";
      el.querySelector("#flot").value = "";
      el.querySelector("#fqty").value = 0;
      el.querySelector("#fmin").value = 5;
      el.querySelector("#fexp").value = "";
      el.querySelector("#fcab").value = "";
      el.querySelector("#fcat").value = "Medical Supply";
      el.querySelector("#fnote").value = "";
      el.querySelector("#imgPrev").src = "https://placehold.co/200x200?text=No+Image";
      el.querySelector("#imgFile").value = "";
    }

    function fillForm(id) {
      const x = inv.find(i => i.id === id);
      if (!x) return;
      el.querySelector("#fid").value = x.id;
      el.querySelector("#fimg").value = x.imageUrl || "";
      el.querySelector("#fname").value = x.name || "";
      el.querySelector("#flot").value = x.lotNo || "";
      el.querySelector("#fqty").value = x.quantity || 0;
      el.querySelector("#fmin").value = x.minimumStock || 0;
      el.querySelector("#fexp").value = x.expiryDateISO || "";
      el.querySelector("#fcab").value = x.cabinet || "";
      el.querySelector("#fcat").value = x.category || "Medical Supply";
      el.querySelector("#fnote").value = x.note || "";
      el.querySelector("#imgPrev").src = x.imageUrl || "https://placehold.co/200x200?text=No+Image";
    }

    async function openDetail(id) {
      try {
        loading(true, "กำลังโหลดรายละเอียด...");
        const res = await api("itemDetail", { rowId: id });
        if (!res.success) throw new Error(res.error || "itemDetail failed");
        const d = res.data;

        $("#dTitle").textContent = d.name || "-";
        $("#dSub").textContent = `Lot: ${d.lotNo || "-"} • Cabinet: ${d.cabinet || "-"} • Category: ${d.category || "-"}`;
        $("#dImg").src = d.imageUrl || "https://placehold.co/400x400?text=No+Image";
        $("#dQty").textContent = d.quantity ?? "-";
        $("#dNear").textContent = d.nearestExpiry?.date || "-";
        $("#dNearQty").textContent = d.nearestExpiry ? `รวมจำนวน (expiry นี้): ${d.nearestExpiry.totalQty}` : "-";
        $("#dIn").textContent = d.lastStockIn ? `${d.lastStockIn.qty} • ${d.lastStockIn.at} • ${d.lastStockIn.by}` : "-";
        $("#dOut").textContent = d.lastUsage ? `${d.lastUsage.qty} • ${d.lastUsage.at} • ${d.lastUsage.by}` : "-";

        $("#dLots").innerHTML = (d.lots || []).map(x => `
          <tr>
            <td class="py-2 pr-2">${esc(x.lotNo || "-")}</td>
            <td class="py-2 pr-2 font-semibold">${x.quantity || 0}</td>
            <td class="py-2 pr-2">${esc(x.expiryDate || "-")}</td>
          </tr>
        `).join("") || `<tr><td colspan="3" class="py-3 text-slate-500">ไม่มีข้อมูล</td></tr>`;

        show($("#itemDetailWrap"));
      } catch (e) {
        toast("error", e.message || String(e));
      } finally {
        loading(false);
      }
    }

    function draw() {
      const kw = q.value.trim().toLowerCase();
      const rows = inv.filter(x =>
        !kw || (x.name || "").toLowerCase().includes(kw) || (x.lotNo || "").toLowerCase().includes(kw)
      );

      tb.innerHTML = rows.map(x => `
        <tr class="hover:bg-slate-50 cursor-pointer" data-row="${x.id}">
          <td class="p-3"><img class="h-10 w-10 rounded-xl border border-slate-200 object-cover bg-slate-50" src="${x.imageUrl || "https://placehold.co/100x100?text=No+Image"}"></td>
          <td class="p-3">
            <div class="font-semibold">${esc(x.name)}</div>
            <div class="text-xs text-slate-500">${esc(x.category)}</div>
          </td>
          <td class="p-3">${esc(x.lotNo || "-")}</td>
          <td class="p-3 ${x.isLowStock ? "text-rose-700 font-semibold" : ""}">${x.quantity}</td>
          <td class="p-3">${esc(x.expiryDate || "-")}</td>
          <td class="p-3">
            <button class="px-3 py-1.5 rounded-xl border border-slate-200 text-xs hover:bg-white" data-act="edit" data-id="${x.id}">แก้ไข</button>
            <button class="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs hover:bg-rose-50" data-act="del" data-id="${x.id}">ลบ</button>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="6" class="p-4 text-slate-500">ไม่มีข้อมูล</td></tr>`;

      tb.querySelectorAll("tr[data-row]").forEach(tr => {
        tr.onclick = async (e) => {
          const act = e.target?.dataset?.act;
          const id = Number(tr.dataset.row);

          if (act === "edit") {
            e.stopPropagation();
            fillForm(id);
            return;
          }
          if (act === "del") {
            e.stopPropagation();
            if (!confirm("ยืนยันลบ?")) return;
            try {
              loading(true, "กำลังลบ...");
              const res = await api("deleteItem", { rowId: id });
              if (!res.success) throw new Error(res.error || "delete failed");
              toast("success", "ลบสำเร็จ");
              await refresh(true);
            } catch (err) {
              toast("error", err.message || String(err));
            } finally {
              loading(false);
            }
            return;
          }

          openDetail(id);
        };
      });
    }

    // init form/image
    el.querySelector("#imgPrev").src = "https://placehold.co/200x200?text=No+Image";
    el.querySelector("#imgClear").onclick = () => {
      el.querySelector("#fimg").value = "";
      el.querySelector("#imgPrev").src = "https://placehold.co/200x200?text=No+Image";
    };

    el.querySelector("#imgFile").onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        loading(true, "กำลังเตรียมรูป...");
        const dataUrl = await readResize(file, 1024, 0.85);
        el.querySelector("#imgPrev").src = dataUrl;

        loading(true, "กำลังอัปโหลดรูป...");
        const up = await api("uploadImage", { dataUrl, fileName: file.name });
        if (!up.success) throw new Error(up.error || "upload failed");

        el.querySelector("#fimg").value = up.url;
        toast("success", "อัปโหลดรูปสำเร็จ");
      } catch (e) {
        toast("error", e.message || String(e));
      } finally {
        loading(false);
      }
    };

    el.querySelector("#freset").onclick = resetForm;

    el.querySelector("#invForm").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        loading(true, "กำลังบันทึก...");
        const payload = {
          id: el.querySelector("#fid").value ? Number(el.querySelector("#fid").value) : null,
          name: el.querySelector("#fname").value.trim(),
          lotNo: el.querySelector("#flot").value.trim(),
          quantity: Number(el.querySelector("#fqty").value),
          minimumStock: Number(el.querySelector("#fmin").value),
          expiryDate: el.querySelector("#fexp").value || "",
          cabinet: el.querySelector("#fcab").value.trim(),
          category: el.querySelector("#fcat").value,
          note: el.querySelector("#fnote").value.trim(),
          imageUrl: el.querySelector("#fimg").value || ""
        };

        const res = await api("saveInventoryItem", { item: payload });
        if (!res.success) throw new Error(res.error || "save failed");
        toast("success", res.message || "บันทึกสำเร็จ");
        resetForm();
        await refresh(true);
      } catch (e) {
        toast("error", e.message || String(e));
      } finally {
        loading(false);
      }
    };

    q.oninput = draw;
    draw();
  }

  function renderReorder(s) {
    setHeader("Reorder", "รายการต่ำกว่า Minimum Stock (รวมทุก Lot)");
    const rows = s.reorder || [];
    $("#tab_reorder").innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 overflow-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 bg-slate-50">
            <tr><th class="text-left p-3">รายการ</th><th class="text-left p-3">จำนวนรวม</th><th class="text-left p-3">Minimum</th><th class="text-left p-3">ต้องสั่ง</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.map(r => `
              <tr>
                <td class="p-3 font-semibold">${esc(r.name)}</td>
                <td class="p-3">${r.currentStock}</td>
                <td class="p-3">${r.minimumStock}</td>
                <td class="p-3 font-semibold text-rose-700">${r.reorderQuantity}</td>
              </tr>
            `).join("") || `<tr><td colspan="4" class="p-4 text-slate-500">ไม่มีรายการสต็อกต่ำ</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderExpired(s) {
    setHeader("Expired", "หมดอายุ/ใกล้หมดอายุ (≤180 วัน)");
    const rows = s.expired || [];
    $("#tab_expired").innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 overflow-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 bg-slate-50">
            <tr><th class="text-left p-3">รายการ</th><th class="text-left p-3">Lot</th><th class="text-left p-3">Qty</th><th class="text-left p-3">Expiry</th><th class="text-left p-3">สถานะ</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.map(r => `
              <tr>
                <td class="p-3 font-semibold">${esc(r.name)}</td>
                <td class="p-3">${esc(r.lotNo)}</td>
                <td class="p-3">${r.quantity}</td>
                <td class="p-3">${esc(r.expiryDate)}</td>
                <td class="p-3">${esc(r.status)}</td>
              </tr>
            `).join("") || `<tr><td colspan="5" class="p-4 text-slate-500">ไม่มีรายการใกล้หมดอายุ</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderShift(s) {
    setHeader("Shift Summary", "สรุปการตรวจรายกะ");
    const rows = s.shiftSummary || [];
    $("#tab_shift").innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 overflow-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 bg-slate-50">
            <tr><th class="text-left p-3">วันที่</th><th class="text-left p-3">รอบ</th><th class="text-left p-3">เวลา</th><th class="text-left p-3">ผู้ตรวจสอบ</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows.map(r => `
              <tr>
                <td class="p-3">${esc(r.date)}</td>
                <td class="p-3">${esc(r.shift)}</td>
                <td class="p-3">${esc(r.time)}</td>
                <td class="p-3">${esc(r.staffName)}</td>
              </tr>
            `).join("") || `<tr><td colspan="4" class="p-4 text-slate-500">ไม่มีข้อมูล</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUsers(s) {
    setHeader("User Management", "Admin: แสดงรายการผู้ใช้งาน");
    const rows = s.staff || [];
    $("#tab_users").innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm text-slate-500">หมายเหตุ: CRUD ผู้ใช้สามารถต่อยอดเพิ่มได้ (ตอนนี้แสดงรายการจาก Staff sheet)</div>
        <div class="mt-3 overflow-auto rounded-2xl border border-slate-100">
          <table class="w-full text-sm">
            <thead class="text-xs text-slate-500 bg-slate-50">
              <tr><th class="text-left p-3">StaffID</th><th class="text-left p-3">ชื่อ</th><th class="text-left p-3">Role</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${rows.map(r => `
                <tr>
                  <td class="p-3 font-semibold">${esc(r.id)}</td>
                  <td class="p-3">${esc(r.name)}</td>
                  <td class="p-3">${esc(r.role)}</td>
                </tr>
              `).join("") || `<tr><td colspan="3" class="p-4 text-slate-500">ไม่มีข้อมูล</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderReport(s) {
    setHeader("Report", "PDF + Email / Expiry Summary / Recipients (Admin)");
    const isAdmin = state.user.role === ROLE.Admin;

    $("#tab_report").innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="font-semibold">ส่งรายงาน PDF</div>
          <div class="text-xs text-slate-500 mt-1">แนบไฟล์ PDF ใส่โลโก้</div>
          <button id="sendPdf" class="mt-4 w-full rounded-xl bg-slate-900 text-white py-2.5 hover:bg-slate-800">
            <i class="fa-solid fa-paper-plane mr-2"></i>ส่งรายงานเดี๋ยวนี้
          </button>

          <div class="mt-4 rounded-xl border border-slate-200 p-3">
            <div class="font-semibold text-sm">ส่งสรุปใกล้หมดอายุ</div>
            <div class="mt-2 flex gap-2">
              <button class="expBtn flex-1 rounded-xl border border-slate-200 py-2 text-sm hover:bg-slate-50" data-d="30">30 วัน</button>
              <button class="expBtn flex-1 rounded-xl border border-slate-200 py-2 text-sm hover:bg-slate-50" data-d="60">60 วัน</button>
              <button class="expBtn flex-1 rounded-xl border border-slate-200 py-2 text-sm hover:bg-slate-50" data-d="180">180 วัน</button>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="font-semibold">Email Recipients</div>
          <div class="text-xs text-slate-500 mt-1">ใส่ทีละบรรทัด (Admin เท่านั้นที่บันทึกได้)</div>
          <textarea id="rcp" rows="10" class="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">${(s.recipients || []).join("\n")}</textarea>

          ${isAdmin ? `
            <button id="saveRcp" class="mt-3 w-full rounded-xl border border-slate-200 py-2.5 hover:bg-slate-50">บันทึกผู้รับ</button>
            <button id="setTrig" class="mt-2 w-full rounded-xl border border-slate-200 py-2.5 hover:bg-slate-50">ตั้ง Trigger 08:00</button>
          ` : `<div class="mt-3 text-xs text-slate-500">เฉพาะ Admin แก้ไขผู้รับ/ตั้ง Trigger ได้</div>`}
        </div>
      </div>
    `;

    $("#sendPdf").onclick = async () => {
      try {
        loading(true, "กำลังสร้าง PDF และส่งเมล...");
        const res = await api("sendReport");
        if (!res.success) throw new Error(res.error || "sendReport failed");
        toast("success", res.message || "ส่งสำเร็จ");
      } catch (e) {
        toast("error", e.message || String(e));
      } finally {
        loading(false);
      }
    };

    document.querySelectorAll(".expBtn").forEach(b => {
      b.onclick = async () => {
        try {
          loading(true, "กำลังส่งสรุป...");
          const res = await api("sendExpirySummary", { days: Number(b.dataset.d) });
          if (!res.success) throw new Error(res.error || "sendExpirySummary failed");
          toast("success", res.message || "ส่งสำเร็จ");
        } catch (e) {
          toast("error", e.message || String(e));
        } finally {
          loading(false);
        }
      };
    });

    if (isAdmin) {
      $("#saveRcp").onclick = async () => {
        try {
          loading(true, "กำลังบันทึกผู้รับ...");
          const emails = $("#rcp").value.split("\n").map(x => x.trim()).filter(Boolean);
          const res = await api("updateRecipients", { emails });
          if (!res.success) throw new Error(res.error || "updateRecipients failed");
          toast("success", res.message || "บันทึกแล้ว");
          await refresh(true);
        } catch (e) {
          toast("error", e.message || String(e));
        } finally {
          loading(false);
        }
      };

      $("#setTrig").onclick = async () => {
        try {
          loading(true, "กำลังตั้ง Trigger...");
          const res = await api("setupTrigger");
          if (!res.success) throw new Error(res.error || "setupTrigger failed");
          toast("success", res.message || "ตั้งค่าแล้ว");
        } catch (e) {
          toast("error", e.message || String(e));
        } finally {
          loading(false);
        }
      };
    }
  }

  // -------- logout --------
  async function logout() {
    try { if (state.token) await api("logout"); } catch (_) {}
    stopPoll();
    clearSession();
    renderLogin();
  }

  // -------- boot --------
  async function boot() {
    // if session exists, try snapshot
    if (state.token && state.user) {
      try {
        renderAppShell();
        loading(true, "กำลังโหลดข้อมูล...");
        await refresh(true);
        startPoll();
        if (state.user.role === ROLE.Admin) setTab("inventory");
        else setTab(state.user.role === ROLE.RN ? "dailyMedicine" : "dailySupply");
        return;
      } catch (e) {
        clearSession();
        renderLogin();
        // แสดงเหตุผลให้รู้ว่าทำไม auto-login ไม่ผ่าน
        setTimeout(() => toast("error", e.message || String(e)), 50);
        return;
      } finally {
        loading(false);
      }
    }
    renderLogin();
  }

  boot();
})();
