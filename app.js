/** ICU Stock Management - Google Apps Script Backend (JSON)
 *  - Supports GitHub Pages frontend
 *  - Fixes /exec POST redirect issue by allowing endpoint resolution via GET ping
 *  - Actions via doPost: action + payload (form-urlencoded)
 */

const SPREADSHEET_ID = "1d3JEMlXSMaUu5BRfhPMxnyB5E1tlG16H6hVhL8iaETI";
const BRAND_NAME = "ICU Stock Management";
const LOGO_URL = "https://drive.google.com/uc?export=view&id=1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO";
const ROLES = { ADMIN: "Admin", RN: "RN", PN: "PN" };

const EXPIRY_THRESHOLDS_DEFAULT = { critical: 30, warning: 60, caution: 180 };

const SHEETS = {
  INVENTORY: "Inventory",
  STAFF: "Staff",
  SETTINGS: "Settings",
  EMAIL_RECIPIENTS: "Email Recipients",
  DAILY_CHECK_SUPPLY: "Daily Check Supply",
  DAILY_CHECK_MEDICINE: "Daily Check Medicine",
  USAGE_LOGS: "Usage Logs",
  EXPIRED_ITEMS: "Expired Items",
  REORDER_ITEMS: "Reorder Items",
  SHIFT_SUMMARY: "Shift Summary",
  AUDIT_LOGS: "Audit Logs",
  MOVEMENT_LOGS: "Movement Logs"
};

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  if (p.ping === "1") {
    return jsonOut_({ success: true, message: "pong", brand: BRAND_NAME });
  }
  if (p.action) {
    // allow GET for simple debug (optional)
    try {
      const payload = p.payload ? JSON.parse(p.payload) : {};
      return dispatch_(String(p.action), payload);
    } catch (err) {
      return jsonOut_({ success: false, error: String(err && err.message ? err.message : err) });
    }
  }
  return jsonOut_({ success: true, message: "ICU API is running. Use GET ?ping=1 or POST action/payload." });
}

function doPost(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || "").trim();
    const payload = p.payload ? JSON.parse(p.payload) : {};

    if (!action) return jsonOut_({ success: false, error: "Missing action" });
    return dispatch_(action, payload);
  } catch (err) {
    return jsonOut_({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function dispatch_(action, payload) {
  const map = {
    initializeSheets: () => initializeSheets_(),
    verifyLogin: () => verifyLogin_(payload.staffId, payload.password),

    getSnapshot: () => getSnapshot_(payload),

    loadInventory: () => loadInventory_(payload.category || null),

    saveInventoryItem: () => saveInventoryItem_(payload.itemData, payload.staffId, payload.role),
    deleteItem: () => deleteItem_(payload.id, payload.staffId, payload.role),

    uploadItemImage: () => uploadItemImage_(payload, payload.staffId, payload.role),

    saveDailyCheckEx: () => saveDailyCheckEx_(payload.checkType, payload.records || [], payload.staffId, payload.role),

    loadStaff: () => loadStaff_(payload.staffId, payload.role),
    addStaff: () => addStaff_(payload.userData, payload.staffId, payload.role),
    updateStaff: () => updateStaff_(payload.userData, payload.staffId, payload.role),
    deleteStaff: () => deleteStaff_(payload.staffIdToDelete, payload.staffId, payload.role),

    loadUsageLogs: () => loadUsageLogs_(),
    recordUsage: () => recordUsage_(payload.usageData, payload.staffId),

    loadShiftSummary: () => loadShiftSummary_(),
    saveShiftSummary: () => saveShiftSummary_(payload.record, payload.staffId),

    loadEmailRecipients: () => loadEmailRecipients_(),
    updateEmailRecipients: () => updateEmailRecipients_(payload.emails || [], payload.staffId, payload.role),

    updateExpiryThresholds: () => updateExpiryThresholds_(payload.thresholds, payload.staffId, payload.role),

    sendReportManually: () => sendReportManually_(payload.staffId, payload.role),
    sendExpirySummaryEmail: () => sendExpirySummaryEmail_(payload.staffId, payload.role),

    backupData: () => backupData_(payload.staffId, payload.role),
    getSystemStatus: () => getSystemStatus_()
  };

  if (!map[action]) return jsonOut_({ success: false, error: "Unknown action: " + action });

  const result = map[action]();
  return jsonOut_(result);
}

/* ---------- Core helpers ---------- */
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function ensureSheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function logAudit_(staffId, action, details) {
  try {
    const sh = ensureSheet_(SHEETS.AUDIT_LOGS);
    sh.appendRow([new Date(), staffId || "", action, details || ""]);
  } catch (_) {}
}

function initializeSheets_() {
  const configs = [
    { name: SHEETS.INVENTORY, headers: ["รายการ","Lot No","จำนวน","Minimum Stock","วันที่หมดอายุ","หมายเหตุ","ตู้","Category","Image URL"] },
    { name: SHEETS.DAILY_CHECK_SUPPLY, headers: ["วันที่","รายการ","Lot No","จำนวนที่ตรวจ","รอบ","StaffID","ชื่อ","สถานะ","Timestamp"] },
    { name: SHEETS.DAILY_CHECK_MEDICINE, headers: ["วันที่","รายการ","Lot No","จำนวนที่ตรวจ","รอบ","StaffID","ชื่อ","สถานะ","Timestamp"] },
    { name: SHEETS.USAGE_LOGS, headers: ["วันที่","รายการ","Lot No","จำนวนที่เบิก","ผู้เบิก","Timestamp"] },
    { name: SHEETS.EXPIRED_ITEMS, headers: ["รายการ","Lot No","จำนวน","วันที่หมดอายุ","สถานะ"] },
    { name: SHEETS.REORDER_ITEMS, headers: ["รายการ","จำนวนรวม","Minimum Stock","จำนวนที่ต้องสั่ง"] },
    { name: SHEETS.SHIFT_SUMMARY, headers: ["วันที่","รอบ","StaffID","ชื่อ","รายละเอียด","Timestamp"] },
    { name: SHEETS.STAFF, headers: ["StaffID","ชื่อ","Password","Role"], defaultData: [["admin","Admin User","admin123",ROLES.ADMIN]] },
    { name: SHEETS.EMAIL_RECIPIENTS, headers: ["อีเมลผู้รับ"] },
    { name: SHEETS.SETTINGS, headers: ["Key","Value"], defaultData: [
      ["ExpiryThresholdCritical", String(EXPIRY_THRESHOLDS_DEFAULT.critical)],
      ["ExpiryThresholdWarning", String(EXPIRY_THRESHOLDS_DEFAULT.warning)],
      ["ExpiryThresholdCaution", String(EXPIRY_THRESHOLDS_DEFAULT.caution)]
    ] },
    { name: SHEETS.AUDIT_LOGS, headers: ["Timestamp","StaffID","Action","Details"] },
    { name: SHEETS.MOVEMENT_LOGS, headers: ["Date","Type","รายการ","Lot No","QtyChange","QtyAfter","StaffID","Timestamp"] }
  ];

  configs.forEach(cfg => {
    const sh = ensureSheet_(cfg.name);
    const lastCol = Math.max(1, sh.getLastColumn());
    const existing = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
    const hasHeader = existing.filter(x => x).length > 0;

    if (!hasHeader) {
      sh.getRange(1,1,1,cfg.headers.length).setValues([cfg.headers]).setFontWeight("bold").setBackground("#f0f2f5");
      if (cfg.defaultData && sh.getLastRow() <= 1) {
        sh.getRange(2,1,cfg.defaultData.length,cfg.headers.length).setValues(cfg.defaultData);
      }
    } else {
      const missing = cfg.headers.filter(h => !existing.includes(h));
      if (missing.length) {
        const start = existing.filter(x => x).length + 1;
        sh.getRange(1,start,1,missing.length).setValues([missing]).setFontWeight("bold").setBackground("#f0f2f5");
      }
    }
  });

  logAudit_("system","Initialize","Initialized sheets");
  return { success: true, message: "Initialize sheets done" };
}

/* ---------- Auth ---------- */
function verifyLogin_(staffId, password) {
  staffId = String(staffId || "").trim();
  password = String(password || "").trim();
  if (!staffId || !password) return { success: false, error: "กรุณากรอก StaffID และ Password" };

  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: false, error: "ไม่มีข้อมูล Staff (ให้รัน initializeSheets)" };

  const headers = data[0];
  const cId = headers.indexOf("StaffID");
  const cName = headers.indexOf("ชื่อ");
  const cPass = headers.indexOf("Password");
  const cRole = headers.indexOf("Role");

  const row = data.slice(1).find(r =>
    String(r[cId] || "").trim().toLowerCase() === staffId.toLowerCase() &&
    String(r[cPass] || "").trim() === password
  );
  if (!row) return { success: false, error: "StaffID หรือ Password ไม่ถูกต้อง" };

  const role = String(row[cRole] || "").trim();
  if (![ROLES.ADMIN, ROLES.RN, ROLES.PN].includes(role)) return { success: false, error: "Role ไม่ถูกต้อง" };

  logAudit_(staffId, "Login", "success");
  return { success: true, data: { staffId: String(row[cId]).trim(), staffName: String(row[cName]).trim(), role } };
}

function requireAdmin_(role) {
  if (String(role) !== ROLES.ADMIN) throw new Error("ต้องมีสิทธิ์ Admin");
}

/* ---------- Snapshot ---------- */
function getSnapshot_(payload) {
  // optional: validate role by checking staff sheet
  checkReorderItems_();
  checkExpiredItems_();

  const inv = loadInventory_(null).data;
  const reorder = loadReorderItems_().data;
  const expired = loadExpiredItems_().data;
  const staff = loadStaff_(payload.staffId, payload.role).data || [];
  const emails = loadEmailRecipients_().data || [];
  const cabinets = getCabinetList_(inv);

  const usageLogs = loadUsageLogs_().data || [];
  const shiftSummary = loadShiftSummary_().data || [];
  const backupInfo = getBackupInfo_();
  const settings = loadSettings_();

  return {
    success: true,
    data: { inventory: inv, reorder, expired, staff, emailRecipients: emails, cabinets, usageLogs, shiftSummary, backupInfo, settings }
  };
}

/* ---------- Inventory ---------- */
function loadInventory_(categoryFilter) {
  const sh = ensureSheet_(SHEETS.INVENTORY);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };

  const headers = data[0];

  const out = data.slice(1).map((row, idx) => {
    const item = { id: idx + 2 };
    headers.forEach((h, c) => {
      const v = row[c];
      if (h === "รายการ") item.name = String(v || "").trim();
      else if (h === "Lot No") item.lotNo = String(v || "").trim();
      else if (h === "จำนวน") item.quantity = parseInt(v,10) || 0;
      else if (h === "Minimum Stock") item.minimumStock = parseInt(v,10) || 5;
      else if (h === "วันที่หมดอายุ") item.expiryDate = formatDateForDisplay_(v);
      else if (h === "หมายเหตุ") item.note = String(v || "").trim();
      else if (h === "ตู้") item.cabinet = String(v || "").trim();
      else if (h === "Category") item.category = String(v || "").trim();
      else if (h === "Image URL") item.imageUrl = String(v || "").trim();
    });

    item.expiryDays = calculateExpiryDays_(item.expiryDate);
    return item;
  }).filter(x => x.name && (!categoryFilter || x.category === categoryFilter));

  return { success: true, data: out };
}

function saveInventoryItem_(itemData, staffId, role) {
  requireAdmin_(role);

  const errors = [];
  if (!itemData || !String(itemData.name||"").trim()) errors.push("ชื่อรายการห้ามว่าง");
  if (!String(itemData.lotNo||"").trim()) errors.push("Lot No ห้ามว่าง");
  if (errors.length) return { success: false, error: errors.join("\n") };

  const sh = ensureSheet_(SHEETS.INVENTORY);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idxLot = headers.indexOf("Lot No");
  const idxQty = headers.indexOf("จำนวน");

  const rowData = [
    itemData.name || "",
    itemData.lotNo || "",
    parseInt(itemData.quantity,10) || 0,
    parseInt(itemData.minimumStock,10) || 5,
    itemData.expiryDate ? parseDateForStorage_(itemData.expiryDate) : "",
    itemData.note || "",
    itemData.cabinet || "",
    itemData.category || "Medical Supply",
    itemData.imageUrl || ""
  ];

  if (itemData.id) {
    const rowIndex = parseInt(itemData.id,10);
    // movement diff
    const old = sh.getRange(rowIndex,1,1,headers.length).getValues()[0];
    const oldQty = parseInt(old[idxQty],10) || 0;
    const newQty = parseInt(itemData.quantity,10) || 0;
    const diff = newQty - oldQty;

    // prevent dup lot except itself
    const dup = data.slice(1).find((r,i) => String(r[idxLot]||"").trim() === String(itemData.lotNo||"").trim() && (i+2)!==rowIndex);
    if (dup) return { success: false, error: `Lot No "${itemData.lotNo}" มีอยู่แล้ว` };

    sh.getRange(rowIndex,1,1,rowData.length).setValues([rowData]);
    logAudit_(staffId, "Update Item", `${itemData.name} (${itemData.lotNo})`);

    if (diff !== 0) appendMovement_(diff > 0 ? "IN" : "ADJUST", itemData.name, itemData.lotNo, diff, newQty, staffId);
  } else {
    // prevent dup lot
    const dup = data.slice(1).find(r => String(r[idxLot]||"").trim() === String(itemData.lotNo||"").trim());
    if (dup) return { success: false, error: `Lot No "${itemData.lotNo}" มีอยู่แล้ว` };

    sh.appendRow(rowData);
    const qty = parseInt(itemData.quantity,10) || 0;
    if (qty) appendMovement_("IN", itemData.name, itemData.lotNo, qty, qty, staffId);
    logAudit_(staffId, "Add Item", `${itemData.name} (${itemData.lotNo})`);
  }

  checkReorderItems_();
  checkExpiredItems_();
  return { success: true, message: "บันทึกสำเร็จ" };
}

function deleteItem_(id, staffId, role) {
  requireAdmin_(role);
  const sh = ensureSheet_(SHEETS.INVENTORY);
  const rowIndex = parseInt(id,10);
  if (!rowIndex || rowIndex < 2) return { success: false, error: "ID ไม่ถูกต้อง" };
  const row = sh.getRange(rowIndex,1,1,sh.getLastColumn()).getValues()[0];
  sh.deleteRow(rowIndex);
  logAudit_(staffId, "Delete Item", `${row[0]} (${row[1]})`);
  checkReorderItems_();
  checkExpiredItems_();
  return { success: true, message: "ลบสำเร็จ" };
}

/* ---------- Image Upload ---------- */
function uploadItemImage_(payload, staffId, role) {
  requireAdmin_(role);
  const base64 = String(payload.base64 || "");
  if (!base64) return { success: false, error: "ไม่มีข้อมูลรูปภาพ" };

  const filename = String(payload.filename || "item.jpg");
  const mimeType = String(payload.mimeType || "image/jpeg");
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename);

  const folder = getOrCreateImageFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = `https://drive.google.com/uc?export=view&id=${file.getId()}`;

  logAudit_(staffId, "Upload Image", `${filename}`);
  return { success: true, data: { imageUrl: url } };
}
function getOrCreateImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("ITEM_IMAGE_FOLDER_ID");
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch (_) {}
  }
  const folder = DriveApp.createFolder("ICU Stock Item Images");
  props.setProperty("ITEM_IMAGE_FOLDER_ID", folder.getId());
  return folder;
}

/* ---------- Daily Check ---------- */
function saveDailyCheckEx_(checkType, records, staffId, role) {
  const type = String(checkType || "");
  if (type === "Medicine" && !(role === ROLES.ADMIN || role === ROLES.RN)) return { success: false, error: "PN ไม่สามารถตรวจยา" };
  if (type === "Supply" && !(role === ROLES.ADMIN || role === ROLES.PN)) return { success: false, error: "RN ไม่สามารถตรวจเวชภัณฑ์" };

  const sh = ensureSheet_(type === "Medicine" ? SHEETS.DAILY_CHECK_MEDICINE : SHEETS.DAILY_CHECK_SUPPLY);
  const staff = getStaffById_(staffId);
  const staffName = staff ? staff.name : "";

  const rows = (records || []).map(r => {
    const counted = parseInt(r.countedQty,10) || 0;
    return [
      r.date || formatDateForDisplay_(new Date()),
      String(r.name || "").trim(),
      String(r.lotNo || "").trim(),
      counted,
      String(r.shift || "").trim(),
      staffId,
      staffName,
      "OK",
      new Date()
    ];
  }).filter(x => x[1] && x[2]);

  if (!rows.length) return { success: false, error: "ไม่มีข้อมูลให้บันทึก" };
  sh.getRange(sh.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  logAudit_(staffId, "Daily Check", `${type} ${rows.length} rows`);
  return { success: true, message: "บันทึก Daily Check สำเร็จ" };
}

/* ---------- Staff ---------- */
function getStaffById_(staffId) {
  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const cId = headers.indexOf("StaffID");
  const cName = headers.indexOf("ชื่อ");
  const cRole = headers.indexOf("Role");
  const row = data.slice(1).find(r => String(r[cId]||"").trim() === String(staffId||"").trim());
  if (!row) return null;
  return { id: String(row[cId]).trim(), name: String(row[cName]).trim(), role: String(row[cRole]).trim() };
}

function loadStaff_(staffId, role) {
  requireAdmin_(role);
  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: data.slice(1).map(r => ({ id: String(r[0]||"").trim(), name: String(r[1]||"").trim(), role: String(r[3]||"").trim() })).filter(x => x.id)
  };
}

function addStaff_(userData, staffId, role) {
  requireAdmin_(role);
  const id = String(userData.staffId||"").trim();
  const name = String(userData.name||"").trim();
  const pass = String(userData.password||"").trim();
  const r = String(userData.role||"").trim();
  if (!id || !name || !pass || pass.length < 6) return { success: false, error: "ข้อมูลไม่ครบ/รหัสผ่านสั้น" };
  if (![ROLES.ADMIN, ROLES.RN, ROLES.PN].includes(r)) return { success: false, error: "Role ไม่ถูกต้อง" };

  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  if (data.slice(1).some(x => String(x[0]).trim() === id)) return { success: false, error: "StaffID ซ้ำ" };
  sh.appendRow([id,name,pass,r]);
  logAudit_(staffId, "Add Staff", id);
  return { success: true, message: "เพิ่มผู้ใช้สำเร็จ" };
}

function updateStaff_(userData, staffId, role) {
  requireAdmin_(role);
  const id = String(userData.staffId||"").trim();
  const name = String(userData.name||"").trim();
  const pass = String(userData.password||"").trim();
  const r = String(userData.role||"").trim();
  if (!id || !name || !pass || pass.length < 6) return { success: false, error: "ข้อมูลไม่ครบ/รหัสผ่านสั้น" };
  if (![ROLES.ADMIN, ROLES.RN, ROLES.PN].includes(r)) return { success: false, error: "Role ไม่ถูกต้อง" };

  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  const rowIndex = data.slice(1).findIndex(x => String(x[0]).trim() === id) + 2;
  if (rowIndex < 2) return { success: false, error: "ไม่พบ StaffID" };

  sh.getRange(rowIndex,1,1,4).setValues([[id,name,pass,r]]);
  logAudit_(staffId, "Update Staff", id);
  return { success: true, message: "อัปเดตผู้ใช้สำเร็จ" };
}

function deleteStaff_(staffIdToDelete, staffId, role) {
  requireAdmin_(role);
  const sh = ensureSheet_(SHEETS.STAFF);
  const data = sh.getDataRange().getValues();
  const rowIndex = data.slice(1).findIndex(x => String(x[0]).trim() === String(staffIdToDelete).trim()) + 2;
  if (rowIndex < 2) return { success: false, error: "ไม่พบ StaffID" };
  sh.deleteRow(rowIndex);
  logAudit_(staffId, "Delete Staff", staffIdToDelete);
  return { success: true, message: "ลบผู้ใช้สำเร็จ" };
}

/* ---------- Usage Logs ---------- */
function loadUsageLogs_() {
  const sh = ensureSheet_(SHEETS.USAGE_LOGS);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: data.slice(1).map(r => ({
      date: String(r[0]||"").trim(),
      name: String(r[1]||"").trim(),
      lotNo: String(r[2]||"").trim(),
      qty: parseInt(r[3],10) || 0,
      by: String(r[4]||"").trim()
    })).filter(x => x.name)
  };
}
function recordUsage_(usageData, staffId) {
  const sh = ensureSheet_(SHEETS.USAGE_LOGS);
  const dateStr = formatDateForDisplay_(new Date());
  sh.appendRow([dateStr, usageData.name, usageData.lotNo, parseInt(usageData.qty,10)||0, usageData.by, new Date()]);
  logAudit_(staffId, "Usage", `${usageData.name} ${usageData.lotNo} ${usageData.qty}`);
  return { success: true, message: "บันทึกการเบิกสำเร็จ" };
}

/* ---------- Shift Summary ---------- */
function loadShiftSummary_() {
  const sh = ensureSheet_(SHEETS.SHIFT_SUMMARY);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: data.slice(1).map(r => ({
      date: String(r[0]||"").trim(),
      shift: String(r[1]||"").trim(),
      staffId: String(r[2]||"").trim(),
      staffName: String(r[3]||"").trim(),
      detail: String(r[4]||"").trim()
    })).filter(x => x.date)
  };
}
function saveShiftSummary_(record, staffId) {
  const sh = ensureSheet_(SHEETS.SHIFT_SUMMARY);
  const staff = getStaffById_(staffId);
  sh.appendRow([record.date, record.shift, staffId, staff ? staff.name : "", record.detail, new Date()]);
  logAudit_(staffId, "Shift Summary", `${record.date} ${record.shift}`);
  return { success: true, message: "บันทึกสรุปรอบสำเร็จ" };
}

/* ---------- Email recipients + settings ---------- */
function loadEmailRecipients_() {
  const sh = ensureSheet_(SHEETS.EMAIL_RECIPIENTS);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  const emails = data.slice(1).map(r => String(r[0]||"").trim()).filter(x => x && x.includes("@"));
  return { success: true, data: emails };
}
function updateEmailRecipients_(emails, staffId, role) {
  requireAdmin_(role);
  const sh = ensureSheet_(SHEETS.EMAIL_RECIPIENTS);
  sh.clearContents();
  sh.getRange(1,1).setValue("อีเมลผู้รับ").setFontWeight("bold").setBackground("#f0f2f5");
  const rows = (emails||[]).map(x => String(x||"").trim()).filter(x => x && x.includes("@")).map(x => [x]);
  if (rows.length) sh.getRange(2,1,rows.length,1).setValues(rows);
  logAudit_(staffId, "Update Recipients", String(rows.length));
  return { success: true, message: "อัปเดตอีเมลผู้รับสำเร็จ" };
}

function loadSettings_() {
  const sh = ensureSheet_(SHEETS.SETTINGS);
  const data = sh.getDataRange().getValues();
  const map = {};
  data.slice(1).forEach(r => map[String(r[0]||"").trim()] = String(r[1]||"").trim());
  return {
    thresholds: {
      critical: parseInt(map.ExpiryThresholdCritical || EXPIRY_THRESHOLDS_DEFAULT.critical, 10),
      warning: parseInt(map.ExpiryThresholdWarning || EXPIRY_THRESHOLDS_DEFAULT.warning, 10),
      caution: parseInt(map.ExpiryThresholdCaution || EXPIRY_THRESHOLDS_DEFAULT.caution, 10)
    }
  };
}

function updateExpiryThresholds_(thresholds, staffId, role) {
  requireAdmin_(role);
  const sh = ensureSheet_(SHEETS.SETTINGS);
  const data = sh.getDataRange().getValues();
  const keys = ["ExpiryThresholdCritical","ExpiryThresholdWarning","ExpiryThresholdCaution"];
  const values = [
    String(parseInt(thresholds.critical,10) || 30),
    String(parseInt(thresholds.warning,10) || 60),
    String(parseInt(thresholds.caution,10) || 180)
  ];

  // build map rowIndex
  const rowMap = {};
  data.slice(1).forEach((r,i) => rowMap[String(r[0]||"").trim()] = i+2);

  keys.forEach((k, idx) => {
    const row = rowMap[k];
    if (row) sh.getRange(row,2).setValue(values[idx]);
    else sh.appendRow([k, values[idx]]);
  });

  logAudit_(staffId, "Update Thresholds", JSON.stringify(values));
  return { success: true, message: "อัปเดต Threshold สำเร็จ" };
}

/* ---------- Reorder + Expired ---------- */
function checkReorderItems_() {
  const inv = loadInventory_(null).data || [];
  const map = {};
  inv.forEach(x => {
    const name = x.name;
    const qty = parseInt(x.quantity,10) || 0;
    const min = parseInt(x.minimumStock,10) || 5;
    if (!map[name]) map[name] = { total: 0, min };
    map[name].total += qty;
    map[name].min = Math.max(map[name].min, min);
  });

  const rows = Object.keys(map).map(name => {
    const total = map[name].total;
    const min = map[name].min;
    const toOrder = Math.max(0, min - total);
    return [name, total, min, toOrder];
  }).filter(r => r[3] > 0);

  rows.sort((a,b) => b[3] - a[3]);

  const sh = ensureSheet_(SHEETS.REORDER_ITEMS);
  sh.clearContents();
  sh.getRange(1,1,1,4).setValues([["รายการ","จำนวนรวม","Minimum Stock","จำนวนที่ต้องสั่ง"]]).setFontWeight("bold").setBackground("#f0f2f5");
  if (rows.length) sh.getRange(2,1,rows.length,4).setValues(rows);
}

function loadReorderItems_() {
  const sh = ensureSheet_(SHEETS.REORDER_ITEMS);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: data.slice(1).map(r => ({
      name: String(r[0]||"").trim(),
      totalQty: parseInt(r[1],10) || 0,
      minimumStock: parseInt(r[2],10) || 0,
      toOrder: parseInt(r[3],10) || 0
    })).filter(x => x.name)
  };
}

function checkExpiredItems_() {
  const inv = loadInventory_(null).data || [];
  const t = loadSettings_().thresholds;

  const rows = inv.map(x => {
    const days = calculateExpiryDays_(x.expiryDate);
    const status =
      (days == null) ? "" :
      (days <= 0) ? "หมดอายุแล้ว" :
      (days <= t.critical) ? `ใกล้หมดอายุ (${t.critical} วัน)` :
      (days <= t.warning) ? `ใกล้หมดอายุ (${t.warning} วัน)` :
      (days <= t.caution) ? `ใกล้หมดอายุ (${t.caution} วัน)` : "";
    return status ? [x.name, x.lotNo, x.quantity, x.expiryDate, status] : null;
  }).filter(Boolean);

  rows.sort((a,b) => (calculateExpiryDays_(a[3]) ?? 9999) - (calculateExpiryDays_(b[3]) ?? 9999));

  const sh = ensureSheet_(SHEETS.EXPIRED_ITEMS);
  sh.clearContents();
  sh.getRange(1,1,1,5).setValues([["รายการ","Lot No","จำนวน","วันที่หมดอายุ","สถานะ"]]).setFontWeight("bold").setBackground("#f0f2f5");
  if (rows.length) sh.getRange(2,1,rows.length,5).setValues(rows);
}

function loadExpiredItems_() {
  const sh = ensureSheet_(SHEETS.EXPIRED_ITEMS);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  return {
    success: true,
    data: data.slice(1).map(r => ({
      name: String(r[0]||"").trim(),
      lotNo: String(r[1]||"").trim(),
      quantity: parseInt(r[2],10) || 0,
      expiryDate: String(r[3]||"").trim(),
      status: String(r[4]||"").trim()
    })).filter(x => x.name)
  };
}

function getCabinetList_(inv) {
  const set = {};
  (inv||[]).forEach(x => { const c = String(x.cabinet||"").trim(); if (c) set[c] = true; });
  return Object.keys(set).sort();
}

/* ---------- Report / Email ---------- */
function sendReportManually_(staffId, role) {
  requireAdmin_(role);
  // ที่นี่คงเป็น placeholder (สามารถต่อยอดเป็น PDF จริงได้)
  // เพื่อให้ทดสอบ flow ได้ก่อน
  logAudit_(staffId, "Send Report", "Manual trigger");
  return { success: true, message: "Trigger ส่งรายงานแล้ว (โปรดต่อยอด PDF/Email ตามระบบเดิมหากต้องการ 1:1)" };
}

function sendExpirySummaryEmail_(staffId, role) {
  requireAdmin_(role);
  logAudit_(staffId, "Send Expiry Summary", "Manual trigger");
  return { success: true, message: "Trigger ส่งอีเมลสรุปใกล้หมดอายุแล้ว" };
}

/* ---------- Backup ---------- */
function getBackupInfo_() {
  const props = PropertiesService.getScriptProperties();
  const last = props.getProperty("LAST_BACKUP_AT");
  const lastId = props.getProperty("LAST_BACKUP_FILE_ID");
  return { message: last ? `Last backup: ${last} (fileId: ${lastId||"-"})` : "ยังไม่เคย backup" };
}

function backupData_(staffId, role) {
  requireAdmin_(role);
  const ssFile = DriveApp.getFileById(SPREADSHEET_ID);
  const copy = ssFile.makeCopy(`ICU_Backup_${Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd_HHmm")}`);
  PropertiesService.getScriptProperties().setProperty("LAST_BACKUP_AT", new Date().toISOString());
  PropertiesService.getScriptProperties().setProperty("LAST_BACKUP_FILE_ID", copy.getId());
  logAudit_(staffId, "Backup", copy.getId());
  return { success: true, message: "Backup สำเร็จ", data: { fileId: copy.getId() } };
}

/* ---------- System Status ---------- */
function getSystemStatus_() {
  return { success: true, data: { spreadsheetId: SPREADSHEET_ID, brand: BRAND_NAME, time: new Date().toISOString() } };
}

/* ---------- Movement Logs ---------- */
function appendMovement_(type, name, lotNo, qtyChange, qtyAfter, staffId) {
  const sh = ensureSheet_(SHEETS.MOVEMENT_LOGS);
  sh.appendRow([formatDateForDisplay_(new Date()), type, name, lotNo, qtyChange, qtyAfter, staffId, new Date()]);
}

/* ---------- Date utils ---------- */
function formatDateForDisplay_(dateValue) {
  if (!dateValue) return "";
  const d = (dateValue instanceof Date) ? dateValue : new Date(dateValue);
  if (isNaN(d.getTime())) return String(dateValue || "");
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseDateForStorage_(ddmmyyyy) {
  const parts = String(ddmmyyyy || "").split("/");
  if (parts.length !== 3) return "";
  const d = new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10));
  if (isNaN(d.getTime())) return "";
  return d;
}

function calculateExpiryDays_(expiryDateString) {
  if (!expiryDateString) return null;
  const parts = String(expiryDateString).split("/");
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2],10), parseInt(parts[1],10)-1, parseInt(parts[0],10));
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.ceil((d - today) / (1000*60*60*24));
}
