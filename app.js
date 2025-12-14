const API_URL = window.APP_CONFIG?.API_URL;
if (!API_URL || API_URL.includes("PASTE_")) {
  document.getElementById("app").innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="max-w-xl w-full bg-white border border-slate-200 rounded-2xl p-5">
        <div class="font-semibold text-lg">Config ไม่ถูกต้อง</div>
        <div class="text-sm text-slate-600 mt-2">กรุณาแก้ไฟล์ <b>config.js</b> ใส่ค่า API_URL ของ Apps Script Web App (ลงท้ายด้วย /exec)</div>
      </div>
    </div>`;
  throw new Error("Missing API_URL");
}

const LOGO_URL = "https://lh5.googleusercontent.com/d/1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO";
const ROLE = { Admin:"Admin", RN:"RN", PN:"PN" };

const state = {
  token: localStorage.getItem("icu_token") || "",
  user: JSON.parse(localStorage.getItem("icu_user") || "null"),
  snapshot: null,
  lastUpdated: "",
  active: "home",
  poll: null
};

// เมนูหลักคงเดิม
const MENU = [
  {key:"dailySupply", label:"Daily Check Supply", icon:"fa-clipboard-check", roles:[ROLE.Admin, ROLE.PN]},
  {key:"dailyMedicine", label:"Daily Check Medicine", icon:"fa-clipboard-check", roles:[ROLE.Admin, ROLE.RN]},
  {key:"inventory", label:"Inventory", icon:"fa-boxes-stacked", roles:[ROLE.Admin]},
  {key:"reorder", label:"Reorder", icon:"fa-arrows-rotate", roles:[ROLE.Admin, ROLE.RN, ROLE.PN]},
  {key:"expired", label:"Expired", icon:"fa-triangle-exclamation", roles:[ROLE.Admin, ROLE.RN, ROLE.PN]},
  {key:"shift", label:"Shift Summary", icon:"fa-users-line", roles:[ROLE.Admin]},
  {key:"users", label:"User Management", icon:"fa-users-gear", roles:[ROLE.Admin]},
  {key:"report", label:"Report", icon:"fa-file-pdf", roles:[ROLE.Admin, ROLE.RN, ROLE.PN]}
];

const $ = (sel)=>document.querySelector(sel);
const esc = (s)=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

function setApp(html){ document.getElementById("app").innerHTML = html; }

function loading(on, text="กำลังทำงาน..."){
  const el = $("#loading");
  if(!el) return;
  el.classList.toggle("hidden", !on);
  $("#loadingText").textContent = text;
}

function toast(type, msg){
  const el = $("#toast");
  if(!el) return;
  el.className = "mb-4 rounded-xl border px-3 py-2 text-sm";
  el.classList.add(type==="error" ? "border-rose-200 bg-rose-50 text-rose-700"
               : type==="success" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
               : "border-slate-200 bg-slate-50 text-slate-700");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"), 4000);
}

// สำคัญ: ใช้ text/plain เพื่อหลีกเลี่ยง CORS preflight (Apps Script ไม่รองรับ OPTIONS)
async function api(action, data = {}) {
  const payload = { action, token: state.token, ...data };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  return json;
}

function saveSession(token, user){
  state.token = token;
  state.user = user;
  localStorage.setItem("icu_token", token);
  localStorage.setItem("icu_user", JSON.stringify(user));
}
function clearSession(){
  state.token = "";
  state.user = null;
  localStorage.removeItem("icu_token");
  localStorage.removeItem("icu_user");
}

function canAccess(key){
  if(key==="home") return true;
  const m = MENU.find(x=>x.key===key);
  return m ? m.roles.includes(state.user?.role) : false;
}

// ---------- UI Shell ----------
function renderLogin(){
  setApp(`
  <section class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-8 bg-slate-900 text-white">
        <div class="flex items-center gap-3">
          <img class="h-12 w-12 rounded-xl bg-white/10 object-contain p-2" src="${LOGO_URL}">
          <div>
            <div class="text-2xl font-semibold">ICU Stock</div>
            <div class="text-white/75 text-sm mt-1">GitHub Pages UI + Apps Script API</div>
          </div>
        </div>
        <ul class="mt-8 text-sm text-white/80 space-y-2">
          <li><i class="fa-solid fa-check mr-2"></i>Role-based navigation</li>
          <li><i class="fa-solid fa-check mr-2"></i>Admin action sheet (mobile)</li>
          <li><i class="fa-solid fa-check mr-2"></i>PDF report + email</li>
        </ul>
      </div>

      <div class="p-8">
        <div class="text-xl font-semibold">เข้าสู่ระบบ</div>
        <div id="toast" class="hidden mt-4"></div>

        <form id="loginForm" class="mt-6 space-y-4">
          <div>
            <label class="text-sm font-medium">StaffID</label>
            <input id="sid" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" required>
          </div>
          <div>
            <label class="text-sm font-medium">Password</label>
            <input id="pwd" type="password" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" required>
          </div>
          <button class="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800">
            <i class="fa-solid fa-right-to-bracket mr-2"></i>Login
          </button>
        </form>

        <div id="loading" class="hidden mt-6 rounded-xl border border-slate-200 bg-white p-3 text-sm flex items-center gap-2">
          <div class="h-4 w-4 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin"></div>
          <div id="loadingText">กำลังทำงาน...</div>
        </div>
      </div>
    </div>
  </section>
  `);

  $("#loginForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      loading(true, "กำลังเริ่มระบบ...");
      await api("init"); // สร้างชีตครั้งแรก (safe to call)
      loading(true, "กำลังเข้าสู่ระบบ...");
      const res = await api("login", { staffId: $("#sid").value.trim(), password: $("#pwd").value.trim() });
      if(!res.success) throw new Error(res.error);
      saveSession(res.token, res.user);
      renderAppShell();
      await refresh(true);
      startPoll();
      setTab(state.user.role===ROLE.Admin ? "inventory" : (state.user.role===ROLE.RN ? "dailyMedicine" : "dailySupply"));
    }catch(err){
      toast("error", err.message || String(err));
    }finally{
      loading(false);
    }
  });
}

function renderAppShell(){
  const isAdmin = state.user?.role === ROLE.Admin;

  setApp(`
  <section class="min-h-screen">
    <header class="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div class="px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img class="h-9 w-9 rounded-xl bg-slate-100 object-contain p-2" src="${LOGO_URL}">
          <div>
            <div id="pageTitle" class="font-semibold">—</div>
            <div id="pageSub" class="text-xs text-slate-500">${esc(state.user.staffName)} (${esc(state.user.staffId)}) • ${esc(state.user.role)}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <button id="btnRefresh" class="h-10 px-4 rounded-xl border border-slate-200 text-sm hover:bg-slate-50">
            <i class="fa-solid fa-rotate mr-2"></i>Refresh
          </button>
          <button id="btnLogout" class="h-10 px-4 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800">
            Logout
          </button>
        </div>
      </div>
    </header>

    <main class="p-4 pb-24 max-w-6xl mx-auto">
      <div id="toast" class="hidden mb-4"></div>
      <div id="view"></div>

      <div id="loading" class="hidden mt-6 rounded-xl border border-slate-200 bg-white p-3 text-sm flex items-center gap-2">
        <div class="h-4 w-4 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin"></div>
        <div id="loadingText">กำลังทำงาน...</div>
      </div>
    </main>

    <!-- mobile bottom nav -->
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
        <button class="bn px-2 py-2 text-slate-600 text-xs flex flex-col items-center gap-1" data-key="report">
          <i class="fa-solid fa-file-pdf text-base"></i>รายงาน
        </button>
      </div>
    </nav>

    <!-- admin action sheet -->
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
  </section>
  `);

  $("#btnLogout").onclick = logout;
  $("#btnRefresh").onclick = async ()=>{ try{ loading(true,"Refreshing..."); await refresh(true); toast("success","อัปเดตแล้ว"); } catch(e){ toast("error", e.message||String(e)); } finally{ loading(false); } };

  // bottom nav
  document.querySelectorAll(".bn").forEach(b=>{
    b.addEventListener("click", ()=>{
      const k = b.dataset.key;
      if(k==="main") setTab(state.user.role===ROLE.RN ? "dailyMedicine" : "dailySupply");
      else if(k==="alerts") setTab("expired");
      else if(k==="report") setTab("report");
      else setTab("home");
    });
  });

  // admin sheet
  if(state.user.role===ROLE.Admin){
    $("#bnAdmin").onclick = ()=>toggleAdminSheet();
    $("#adminSheetBackdrop").onclick = ()=>toggleAdminSheet(false);
    $("#adminSheetClose").onclick = ()=>toggleAdminSheet(false);

    const grid = $("#adminSheetGrid");
    grid.innerHTML = MENU.filter(m=>m.roles.includes(ROLE.Admin)).map(m=>`
      <button class="rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50" data-ak="${m.key}">
        <div class="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
          <i class="fa-solid ${m.icon}"></i>
        </div>
        <div class="mt-2 text-xs font-semibold">${m.label}</div>
      </button>
    `).join("");
    grid.querySelectorAll("[data-ak]").forEach(b=>{
      b.onclick=()=>{ toggleAdminSheet(false); setTab(b.dataset.ak); };
    });
  }
}

function toggleAdminSheet(force){
  const w = $("#adminSheetWrap");
  const open = !w.classList.contains("hidden");
  if(force===true || (!open && force!==false)) w.classList.remove("hidden");
  if(force===false || (open && force!==true)) w.classList.add("hidden");
}

// ---------- Data ----------
async function refresh(force){
  const since = force ? "" : state.lastUpdated;
  const res = await api("snapshot", { since });
  if(!res.success) throw new Error(res.error);
  if(res.changed){
    state.snapshot = res.snapshot;
    state.lastUpdated = res.lastUpdated;
  }
  renderActive();
}

function startPoll(){
  stopPoll();
  state.poll = setInterval(async ()=>{ try{ await refresh(false); }catch(e){} }, 30000);
}
function stopPoll(){ if(state.poll) clearInterval(state.poll); state.poll=null; }

// ---------- Navigation ----------
function setTab(key){
  if(!canAccess(key)) return toast("error","คุณไม่มีสิทธิ์เข้าถึงเมนูนี้");
  state.active = key;
  renderActive();
}
function renderActive(){
  const v = $("#view");
  if(!v) return;
  if(!state.snapshot){
    $("#pageTitle").textContent = "Loading...";
    v.innerHTML = `<div class="text-slate-500">กำลังโหลดข้อมูล...</div>`;
    return;
  }

  const s = state.snapshot;
  $("#pageTitle").textContent = state.active;

  if(state.active==="home"){
    v.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-4"><div class="text-xs text-slate-500">Total Lots</div><div class="text-2xl font-semibold">${s.summary.totalLots}</div></div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4"><div class="text-xs text-slate-500">Low Stock</div><div class="text-2xl font-semibold">${s.summary.lowStockItems}</div></div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4"><div class="text-xs text-slate-500">Expiry ≤ 180</div><div class="text-2xl font-semibold">${s.summary.expiryItems}</div></div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4"><div class="text-xs text-slate-500">Shift</div><div class="text-2xl font-semibold">${esc(s.shiftNow)}</div></div>
      </div>`;
    return;
  }

  if(state.active==="report"){
    v.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="font-semibold">ส่งรายงาน PDF</div>
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
          <div class="font-semibold">Email Recipients (Admin)</div>
          <textarea id="rcp" rows="10" class="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">${(s.recipients||[]).join("\n")}</textarea>
          <button id="saveRcp" class="mt-3 w-full rounded-xl border border-slate-200 py-2.5 hover:bg-slate-50">บันทึกผู้รับ</button>
          <button id="setTrig" class="mt-2 w-full rounded-xl border border-slate-200 py-2.5 hover:bg-slate-50">ตั้ง Trigger 08:00</button>
        </div>
      </div>
    `;
    $("#sendPdf").onclick = async ()=>{
      try{ loading(true,"กำลังส่งรายงาน..."); const r=await api("sendReport"); if(!r.success) throw new Error(r.error); toast("success", r.message); }
      catch(e){ toast("error", e.message||String(e)); }
      finally{ loading(false); }
    };
    document.querySelectorAll(".expBtn").forEach(b=>{
      b.onclick = async ()=>{
        try{ loading(true,"กำลังส่งสรุป..."); const r=await api("sendExpirySummary",{days:Number(b.dataset.d)}); if(!r.success) throw new Error(r.error); toast("success", r.message); }
        catch(e){ toast("error", e.message||String(e)); }
        finally{ loading(false); }
      };
    });
    $("#saveRcp").onclick = async ()=>{
      try{
        loading(true,"กำลังบันทึกผู้รับ...");
        const emails = $("#rcp").value.split("\n").map(x=>x.trim()).filter(Boolean);
        const r = await api("updateRecipients",{emails});
        if(!r.success) throw new Error(r.error);
        toast("success", r.message);
        await refresh(true);
      }catch(e){ toast("error", e.message||String(e)); }
      finally{ loading(false); }
    };
    $("#setTrig").onclick = async ()=>{
      try{ loading(true,"กำลังตั้ง Trigger..."); const r=await api("setupTrigger"); if(!r.success) throw new Error(r.error); toast("success", r.message); }
      catch(e){ toast("error", e.message||String(e)); }
      finally{ loading(false); }
    };
    return;
  }

  // (ตัวอย่าง) inventory แบบย่อ: แสดง + ลบ (Admin)
  if(state.active==="inventory"){
    const inv = s.inventory || [];
    v.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 overflow-auto">
        <div class="font-semibold mb-3">Inventory (Admin)</div>
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 bg-slate-50">
            <tr><th class="text-left p-3">รูป</th><th class="text-left p-3">รายการ</th><th class="text-left p-3">Lot</th><th class="text-left p-3">Qty</th><th class="text-left p-3">Exp</th><th class="text-left p-3">Action</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${inv.map(x=>`
              <tr>
                <td class="p-3"><img class="h-10 w-10 rounded-xl border border-slate-200 object-cover bg-slate-50" src="${x.imageUrl||"https://placehold.co/100x100?text=No+Image"}"></td>
                <td class="p-3 font-semibold">${esc(x.name)}</td>
                <td class="p-3">${esc(x.lotNo)}</td>
                <td class="p-3">${x.quantity}</td>
                <td class="p-3">${esc(x.expiryDate||"-")}</td>
                <td class="p-3"><button class="del rounded-xl border border-rose-200 text-rose-700 px-3 py-1.5 text-xs hover:bg-rose-50" data-id="${x.id}">ลบ</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    document.querySelectorAll(".del").forEach(b=>{
      b.onclick = async ()=>{
        if(!confirm("ยืนยันลบ?")) return;
        try{ loading(true,"กำลังลบ..."); const r=await api("deleteItem",{rowId:Number(b.dataset.id)}); if(!r.success) throw new Error(r.error); toast("success","ลบสำเร็จ"); await refresh(true); }
        catch(e){ toast("error", e.message||String(e)); }
        finally{ loading(false); }
      };
    });
    return;
  }

  v.innerHTML = `<div class="text-slate-500">หน้า ${esc(state.active)} (สามารถนำ UI เดิมมาวางต่อได้ โดยเรียก api() แทน google.script.run)</div>`;
}

// ---------- Logout ----------
async function logout(){
  try{ if(state.token) await api("logout"); } catch(e){}
  stopPoll();
  clearSession();
  renderLogin();
}

// ---------- Boot ----------
(async function boot(){
  // ถ้ามี token ค้างไว้ ลองดึง snapshot ถ้า token หมดอายุจะกลับไป login
  if(state.token && state.user){
    try{
      renderAppShell();
      await refresh(true);
      startPoll();
      setTab(state.user.role===ROLE.Admin ? "inventory" : (state.user.role===ROLE.RN ? "dailyMedicine" : "dailySupply"));
      return;
    }catch(e){
      clearSession();
    }
  }
  renderLogin();
})();
