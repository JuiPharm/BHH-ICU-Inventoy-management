/* ICU Stock Management — GitHub Pages SPA (Vanilla JS)
 * FIXED VERSION:
 * - Correct modal / overlay visibility using Tailwind `hidden`
 * - Login error now shows properly
 * - No change to backend contract
 */

const APP_NAME = "ICU Stock Management";
const API_BASE_URL =
  (window.API_BASE_URL && String(window.API_BASE_URL)) ||
  "https://script.google.com/macros/s/AKfycbxk8YusmqCrn0fcPITsHYS_9UIYu9mdT-3R-pKjDyOy8R3TuLekUW0akCm0iWd_X_kcuA/exec";

/* =========================
 * STATE
 * ========================= */
const sessionKeys = {
  staffId: "icu_staffId",
  staffName: "icu_staffName",
  role: "icu_role",
};

const state = {
  staffId: "",
  staffName: "",
  role: "",
  activeTab: "inventory",
};

/* =========================
 * DOM HELPERS
 * ========================= */
const el = (id) => document.getElementById(id);

/* =========================
 * VISIBILITY FIX (สำคัญมาก)
 * ========================= */
function setLoading(on) {
  const overlay = el("loadingOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !on);
}

function showMsg(title, bodyHtml) {
  const modal = el("msgModal");
  if (!modal) return;

  el("msgTitle").textContent = title || "Message";
  el("msgBody").innerHTML = bodyHtml || "";

  modal.classList.remove("hidden");
}

function hideMsg() {
  const modal = el("msgModal");
  if (!modal) return;
  modal.classList.add("hidden");
}

/* =========================
 * UTIL
 * ========================= */
function uuidv4() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/* =========================
 * API CLIENT
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
    clientTime,
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
        signal: controller.signal,
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          "Response is not valid JSON (likely CORS or wrong deploy URL)\n\n" +
            text.slice(0, 300)
        );
      }

      if (!json.success) {
        throw new Error(
          `${json.error || "API_ERROR"} (requestId: ${json.requestId || "-"})`
        );
      }

      return json;
    } catch (err) {
      lastErr = err;
      const retryable =
        err.name === "AbortError" ||
        String(err.message || "").includes("fetch");

      if (attempt < retries && retryable) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error("Unknown API error");
}

/* =========================
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
  Object.values(sessionKeys).forEach((k) => sessionStorage.removeItem(k));
  loadSession();
}

/* =========================
 * UI SWITCH
 * ========================= */
function setLoggedInUI(on) {
  el("loginView")?.classList.toggle("hidden", on);
  el("appView")?.classList.toggle("hidden", !on);

  if (on) {
    el("userName").textContent = state.staffName || state.staffId;
    el("userRole").textContent = state.role || "";
  }
}

/* =========================
 * LOGIN FLOW (FIXED)
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
    const res = await apiCall(
      "verifyLogin",
      { staffId, password },
      { timeoutMs: 15000, retries: 0 }
    );

    const d = res.data;
    saveSession(d.staffId, d.staffName, d.role);

    setLoggedInUI(true);
    showMsg("Login success", `ยินดีต้อนรับ ${escapeHtml(d.staffName)}`);
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    showMsg(
      "Login failed",
      `<div class="text-red-400 text-sm">${escapeHtml(
        err.message || String(err)
      )}</div>`
    );
  } finally {
    setLoading(false);
  }
}

/* =========================
 * INIT
 * ========================= */
function boot() {
  el("msgOk")?.addEventListener("click", hideMsg);

  el("btnTogglePw")?.addEventListener("click", () => {
    const p = el("loginPassword");
    p.type = p.type === "password" ? "text" : "password";
  });

  el("btnLogin")?.addEventListener("click", onLogin);

  el("btnLogout")?.addEventListener("click", () => {
    clearSession();
    setLoggedInUI(false);
    showMsg("Logout", "ออกจากระบบแล้ว");
  });

  loadSession();

  if (state.staffId && state.role) {
    setLoggedInUI(true);
  } else {
    setLoggedInUI(false);
  }

  if (!API_BASE_URL || API_BASE_URL.includes("<PUT_WEB_APP_EXEC_URL_HERE>")) {
    showMsg(
      "Config required",
      "กรุณาตั้งค่า <b>API_BASE_URL</b> ให้เป็น Apps Script /exec URL"
    );
  }
}

document.addEventListener("DOMContentLoaded", boot);
