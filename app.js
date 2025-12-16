/**
 * ICU Stock Management - Frontend Application
 * Complete JavaScript with API client and UI management
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
    // IMPORTANT: Replace this with your actual Google Apps Script Web App URL
    API_BASE_URL: "https://script.google.com/macros/s/AKfycbxk8YusmqCrn0fcPITsHYS_9UIYu9mdT-3R-pKjDyOy8R3TuLekUW0akCm0iWd_X_kcuA/exec", // e.g., "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
    
    // Application settings
    APP_NAME: "ICU Stock Management",
    TIMEOUT: 30000, // 30 seconds
    MAX_RETRIES: 2,
    
    // Role definitions
    ROLES: {
        ADMIN: "Admin",
        RN: "RN",
        PN: "PN"
    }
};

// ==================== GLOBAL STATE ====================
let currentUser = null;
let currentTab = 'inventory';
let inventoryData = [];
let staffData = [];

// ==================== UTILITY FUNCTIONS ====================

function generateId() {
    return uuid.v4();
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH');
}

function formatDateInput(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function showMessage(title, message, type = 'info') {
    const messageBox = document.getElementById('messageBox');
    const icon = messageBox.querySelector('.message-icon');
    const titleEl = messageBox.querySelector('.message-title');
    const bodyEl = messageBox.querySelector('.message-body');
    
    // Set icon based on type
    icon.className = 'message-icon';
    switch (type) {
        case 'success':
            icon.classList.add('fas', 'fa-check-circle');
            break;
        case 'error':
            icon.classList.add('fas', 'fa-exclamation-circle');
            break;
        case 'warning':
            icon.classList.add('fas', 'fa-exclamation-triangle');
            break;
        default:
            icon.classList.add('fas', 'fa-info-circle');
    }
    
    titleEl.textContent = title;
    bodyEl.textContent = message;
    
    messageBox.className = `message-box ${type}`;
    messageBox.style.display = 'flex';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        hideMessage();
    }, 5000);
}

function hideMessage() {
    document.getElementById('messageBox').style.display = 'none';
}

function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// ==================== API CLIENT ====================

async function apiCall(action, payload = {}, retries = 0) {
    const requestId = generateId();
    const clientTime = new Date().toISOString();
    
    const requestBody = {
        action,
        payload,
        requestId,
        clientTime
    };
    
    try {
        console.log(`API Call: ${action} (Request ID: ${requestId})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
        
        const response = await fetch(CONFIG.API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'API request failed');
        }
        
        console.log(`API Success: ${action} (Request ID: ${requestId})`);
        return data;
        
    } catch (error) {
        console.error(`API Error: ${action} (Request ID: ${requestId})`, error);
        
        // Retry on network errors
        if (retries < CONFIG.MAX_RETRIES && (error.name === 'AbortError' || error.message.includes('Network'))) {
            console.log(`Retrying ${action} (attempt ${retries + 1}/${CONFIG.MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
            return apiCall(action, payload, retries + 1);
        }
        
        // Format error message for user
        let errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
        if (error.name === 'AbortError') {
            errorMessage = 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง';
        } else if (error.message.includes('Network')) {
            errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสัญญาณอินเทอร์เน็ต';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        throw new Error(`${errorMessage} (Request ID: ${requestId})`);
    }
}

// ==================== AUTHENTICATION ====================

async function login() {
    const staffId = document.getElementById('staffId').value.trim();
    const password = document.getElementById('password').value;
    
    if (!staffId || !password) {
        showMessage('กรุณากรอกข้อมูล', 'กรุณากรอกรหัสพนักงานและรหัสผ่าน', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('verifyLogin', { staffId, password });
        
        if (response.success) {
            currentUser = response.data;
            
            // Save session
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Update UI
            updateUserInfo();
            showMainScreen();
            
            // Load initial data
            await Promise.all([
                loadInventory(),
                loadReorderItems(),
                loadExpiredItems()
            ]);
            
            showMessage('เข้าสู่ระบบสำเร็จ', `ยินดีต้อนรับ ${currentUser.name}`, 'success');
        } else {
            showMessage('เข้าสู่ระบบไม่สำเร็จ', response.error || 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง', 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    
    // Clear form
    document.getElementById('staffId').value = '';
    document.getElementById('password').value = '';
    
    // Show login screen
    showLoginScreen();
    
    showMessage('ออกจากระบบ', 'คุณได้ออกจากระบบเรียบร้อยแล้ว', 'info');
}

function checkSession() {
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateUserInfo();
            showMainScreen();
            return true;
        } catch (e) {
            sessionStorage.removeItem('currentUser');
        }
    }
    return false;
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').textContent = currentUser.role;
        document.getElementById('userRole').className = `role-badge ${currentUser.role.toLowerCase()}`;
        
        // Show admin tabs if user is admin
        if (currentUser.role === CONFIG.ROLES.ADMIN) {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'block';
            });
        }
    }
}

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const icon = passwordInput.nextElementSibling.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// ==================== UI NAVIGATION ====================

function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('mainScreen').classList.remove('active');
}

function showMainScreen() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    
    // Set today's date as default
    document.getElementById('checkDate').value = formatDateInput(new Date());
    document.getElementById('usageDate').value = formatDateInput(new Date());
}

function switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    currentTab = tabName;
    
    // Load tab-specific data
    switch (tabName) {
        case 'inventory':
            loadInventory();
            break;
        case 'dailyCheck':
            loadDailyCheckItems();
            break;
        case 'reorder':
            loadReorderItems();
            break;
        case 'expired':
            loadExpiredItems();
            break;
        case 'usage':
            loadUsageLogs();
            break;
        case 'reports':
            // Reports are generated on demand
            break;
        case 'admin':
            loadAdminData();
            break;
    }
}

// ==================== INVENTORY MANAGEMENT ====================

async function loadInventory() {
    if (currentTab !== 'inventory') return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('loadInventory');
        inventoryData = response.data || [];
        renderInventoryTable(inventoryData);
    } catch (error) {
        showMessage('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-data">ไม่มีข้อมูลสินค้า</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.รายการ}</td>
            <td>${item.lotNo}</td>
            <td class="number">${item.จำนวน}</td>
            <td class="number">${item.minimumStock}</td>
            <td class="date">${item.วันที่หมดอายุ}</td>
            <td>${item.ตู้}</td>
            <td><span class="category-badge ${item.category.toLowerCase()}">${item.category}</span></td>
            <td class="actions">
                ${currentUser.role === CONFIG.ROLES.ADMIN ? `
                    <button class="btn-icon" onclick="editItem(${item.id})" title="แก้ไข">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-danger" onclick="deleteItem(${item.id})" title="ลบ">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function searchInventory() {
    const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
    const filteredData = inventoryData.filter(item => 
        item.รายการ.toLowerCase().includes(searchTerm) ||
        item.lotNo.toLowerCase().includes(searchTerm) ||
        item.ตู้.toLowerCase().includes(searchTerm)
    );
    renderInventoryTable(filteredData);
}

function refreshInventory() {
    loadInventory();
}

// ==================== ITEM MODAL ====================

let currentEditItem = null;

function showAddItemModal() {
    currentEditItem = null;
    document.getElementById('itemModalTitle').textContent = 'เพิ่มรายการสินค้า';
    document.getElementById('itemForm').reset();
    document.getElementById('itemModal').classList.add('active');
}

function editItem(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;
    
    currentEditItem = item;
    document.getElementById('itemModalTitle').textContent = 'แก้ไขรายการสินค้า';
    
    // Fill form
    document.getElementById('itemName').value = item.รายการ;
    document.getElementById('itemLotNo').value = item.lotNo;
    document.getElementById('itemQuantity').value = item.จำนวน;
    document.getElementById('itemMinStock').value = item.minimumStock;
    document.getElementById('itemExpiryDate').value = item.วันที่หมดอายุ ? formatDateInput(item.วันที่หมดอายุ) : '';
    document.getElementById('itemCabinet').value = item.ตู้;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemNotes').value = item.หมายเหตุ;
    
    document.getElementById('itemModal').classList.add('active');
}

function closeItemModal() {
    document.getElementById('itemModal').classList.remove('active');
    currentEditItem = null;
}

async function saveItem(event) {
    event.preventDefault();
    
    const itemData = {
        รายการ: document.getElementById('itemName').value,
        lotNo: document.getElementById('itemLotNo').value,
        จำนวน: parseInt(document.getElementById('itemQuantity').value),
        minimumStock: parseInt(document.getElementById('itemMinStock').value),
        วันที่หมดอายุ: document.getElementById('itemExpiryDate').value,
        ตู้: document.getElementById('itemCabinet').value,
        category: document.getElementById('itemCategory').value,
        หมายเหตุ: document.getElementById('itemNotes').value
    };
    
    if (currentEditItem) {
        itemData.id = currentEditItem.id;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('saveInventoryItem', {
            itemData,
            staffId: currentUser.staffId,
            role: currentUser.role
        });
        
        if (response.success) {
            showMessage('บันทึกสำเร็จ', response.message, 'success');
            closeItemModal();
            loadInventory();
        } else {
            showMessage('บันทึกไม่สำเร็จ', response.error, 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteItem(id) {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?')) return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('deleteItem', {
            id,
            staffId: currentUser.staffId,
            role: currentUser.role
        });
        
        if (response.success) {
            showMessage('ลบสำเร็จ', response.message, 'success');
            loadInventory();
        } else {
            showMessage('ลบไม่สำเร็จ', response.error, 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== DAILY CHECK ====================

async function loadDailyCheckItems() {
    if (currentTab !== 'dailyCheck') return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('loadInventory');
        const inventory = response.data || [];
        
        // Filter items based on user role
        let itemsToCheck = [];
        if (currentUser.role === CONFIG.ROLES.RN) {
            itemsToCheck = inventory.filter(item => item.category === 'Medicine');
        } else if (currentUser.role === CONFIG.ROLES.PN) {
            itemsToCheck = inventory.filter(item => item.category === 'Medical Supply');
        } else {
            itemsToCheck = inventory; // Admin can check all
        }
        
        renderDailyCheckItems(itemsToCheck);
        
    } catch (error) {
        showMessage('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderDailyCheckItems(items) {
    const container = document.getElementById('checkItemsList');
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<p class="no-items">ไม่มีรายการที่ต้องตรวจสำหรับบทบาทของคุณ</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'check-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>รายการ</th>
                <th>Lot No</th>
                <th>จำนวน</th>
                <th>จำนวนที่ตรวจ</th>
                <th>สถานะ</th>
                <th>หมายเหตุ</th>
            </tr>
        </thead>
        <tbody id="checkItemsTableBody"></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    items.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.รายการ}</td>
            <td>${item.lotNo}</td>
            <td class="number">${item.จำนวน}</td>
            <td>
                <input type="number" class="check-quantity" 
                       data-index="${index}" 
                       data-item="${item.รายการ}" 
                       data-lot="${item.lotNo}"
                       data-category="${item.category}"
                       min="0" required>
            </td>
            <td>
                <select class="check-status" data-index="${index}">
                    <option value="Normal">ปกติ</option>
                    <option value="Low">ต่ำกว่าเกณฑ์</option>
                    <option value="Expiring">ใกล้หมดอายุ</option>
                    <option value="Damaged">ชำรุด</option>
                </select>
            </td>
            <td>
                <input type="text" class="check-notes" data-index="${index}" placeholder="หมายเหตุ">
            </td>
        `;
        tbody.appendChild(row);
    });
    
    container.appendChild(table);
}

async function saveDailyCheck() {
    const date = document.getElementById('checkDate').value;
    const round = document.getElementById('checkRound').value;
    
    if (!date || !round) {
        showMessage('กรุณากรอกข้อมูล', 'กรุณาเลือกวันที่และรอบการตรวจ', 'warning');
        return;
    }
    
    // Collect check data
    const checkDataArray = [];
    const quantityInputs = document.querySelectorAll('.check-quantity');
    
    quantityInputs.forEach(input => {
        const index = input.dataset.index;
        const quantity = parseInt(input.value);
        
        if (quantity >= 0) {
            const status = document.querySelector(`.check-status[data-index="${index}"]`).value;
            const notes = document.querySelector(`.check-notes[data-index="${index}"]`).value;
            
            checkDataArray.push({
                วันที่: date,
                รายการ: input.dataset.item,
                lotNo: input.dataset.lot,
                จำนวนที่ตรวจ: quantity,
                รอบ: round,
                staffId: currentUser.staffId,
                staffName: currentUser.name,
                สถานะ: status,
                category: input.dataset.category,
                หมายเหตุ: notes
            });
        }
    });
    
    if (checkDataArray.length === 0) {
        showMessage('ไม่มีข้อมูล', 'กรุณากรอกจำนวนที่ตรวจอย่างน้อย 1 รายการ', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('saveDailyCheck', {
            checkDataArray,
            staffId: currentUser.staffId,
            role: currentUser.role
        });
        
        if (response.success) {
            showMessage('บันทึกสำเร็จ', response.message, 'success');
            // Clear form
            document.querySelectorAll('.check-quantity').forEach(input => input.value = '');
            document.querySelectorAll('.check-notes').forEach(input => input.value = '');
        } else {
            showMessage('บันทึกไม่สำเร็จ', response.error, 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== USAGE MANAGEMENT ====================

async function loadUsageLogs() {
    if (currentTab !== 'usage') return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('loadUsageLogs');
        const usageData = response.data || [];
        renderUsageTable(usageData);
    } catch (error) {
        showMessage('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderUsageTable(data) {
    const tbody = document.getElementById('usageTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">ไม่มีข้อมูลการเบิก</td></tr>';
        return;
    }
    
    data.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="date">${log.วันที่}</td>
            <td>${log.รายการ}</td>
            <td>${log.lotNo}</td>
            <td class="number">${log.จำนวนที่เบิก}</td>
            <td>${log.ผู้เบิก}</td>
        `;
        tbody.appendChild(row);
    });
}

function showRecordUsageModal() {
    document.getElementById('usageModal').classList.add('active');
    loadUsageItems();
}

function closeUsageModal() {
    document.getElementById('usageModal').classList.remove('active');
    document.getElementById('usageForm').reset();
}

async function loadUsageItems() {
    try {
        const response = await apiCall('loadInventory');
        const inventory = response.data || [];
        
        const itemSelect = document.getElementById('usageItem');
        itemSelect.innerHTML = '<option value="">เลือกรายการ</option>';
        
        inventory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.รายการ;
            option.textContent = item.รายการ;
            option.dataset.lots = JSON.stringify(inventory.filter(i => i.รายการ === item.รายการ).map(i => i.lotNo));
            itemSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading usage items:', error);
    }
}

document.getElementById('usageItem').addEventListener('change', function() {
    const selectedOption = this.options[this.selectedIndex];
    const lots = JSON.parse(selectedOption.dataset.lots || '[]');
    
    const lotSelect = document.getElementById('usageLotNo');
    lotSelect.innerHTML = '<option value="">เลือก Lot No</option>';
    
    lots.forEach(lot => {
        const option = document.createElement('option');
        option.value = lot;
        option.textContent = lot;
        lotSelect.appendChild(option);
    });
});

async function recordUsage(event) {
    event.preventDefault();
    
    const usageData = {
        วันที่: document.getElementById('usageDate').value,
        รายการ: document.getElementById('usageItem').value,
        lotNo: document.getElementById('usageLotNo').value,
        จำนวนที่เบิก: parseInt(document.getElementById('usageQuantity').value)
    };
    
    showLoading(true);
    
    try {
        const response = await apiCall('recordUsage', {
            usageData,
            staffId: currentUser.staffId
        });
        
        if (response.success) {
            showMessage('บันทึกสำเร็จ', response.message, 'success');
            closeUsageModal();
            loadUsageLogs();
        } else {
            showMessage('บันทึกไม่สำเร็จ', response.error, 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function refreshUsageLogs() {
    loadUsageLogs();
}

// ==================== REPORTS ====================

async function loadReorderItems() {
    if (currentTab !== 'reorder') return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('loadReorderItems');
        const reorderData = response.data || [];
        renderReorderTable(reorderData);
    } catch (error) {
        showMessage('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderReorderTable(data) {
    const tbody = document.getElementById('reorderTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">ไม่มีรายการที่ต้องสั่งซื้อ</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const urgency = item.จำนวนต้องสั่ง > (item.minimumStock * 0.5) ? 'high' : 'medium';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.รายการ}</td>
            <td class="number">${item.จำนวนรวม}</td>
            <td class="number">${item.minimumStock}</td>
            <td class="number">${item.จำนวนที่ต้องสั่ง}</td>
            <td><span class="urgency-badge ${urgency}">${urgency === 'high' ? 'เร่งด่วน' : 'ปกติ'}</span></td>
        `;
        tbody.appendChild(row);
    });
}

async function loadExpiredItems() {
    if (currentTab !== 'expired') return;
    
    showLoading(true);
    
    try {
        const response = await apiCall('loadExpiredItems');
        const expiredData = response.data || [];
        renderExpiredTable(expiredData);
    } catch (error) {
        showMessage('โหลดข้อมูลไม่สำเร็จ', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function renderExpiredTable(data) {
    const tbody = document.getElementById('expiredTableBody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">ไม่มีรายการหมดอายุ</td></tr>';
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.รายการ}</td>
            <td>${item.lotNo}</td>
            <td class="number">${item.จำนวน}</td>
            <td class="date expired">${item.วันที่หมดอายุ}</td>
            <td><span class="status-badge expired">หมดอายุ</span></td>
        `;
        tbody.appendChild(row);
    });
}

function refreshReorderItems() {
    loadReorderItems();
}

function refreshExpiredItems() {
    loadExpiredItems();
}

function generateReorderReport() {
    loadReorderItems();
    switchTab('reorder');
}

function generateExpiredReport() {
    loadExpiredItems();
    switchTab('expired');
}

function generateUsageReport() {
    loadUsageLogs();
    switchTab('usage');
}

// ==================== ADMIN FUNCTIONS ====================

async function loadAdminData() {
    if (currentTab !== 'admin') return;
    
    if (currentUser.role !== CONFIG.ROLES.ADMIN) {
        showMessage('ไม่มีสิทธิ์เข้าถึง', 'คุณไม่มีสิทธิ์เข้าถึงหน้าตั้งค่า', 'error');
        switchTab('inventory');
        return;
    }
}

function showStaffManagement() {
    // This would open a staff management modal or navigate to a staff management page
    showMessage('ฟังก์ชั่นนี้ยังไม่เปิดใช้งาน', 'ระบบจัดการผู้ใช้จะเปิดใช้งานในเวอร์ชันถัดไป', 'info');
}

function showEmailSettings() {
    showMessage('ฟังก์ชั่นนี้ยังไม่เปิดใช้งาน', 'ระบบตั้งค่าอีเมลจะเปิดใช้งานในเวอร์ชันถัดไป', 'info');
}

async function backupData() {
    if (currentUser.role !== CONFIG.ROLES.ADMIN) {
        showMessage('ไม่มีสิทธิ์', 'ต้องเป็นผู้ดูแลระบบเท่านั้น', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await apiCall('backupData', {
            staffId: currentUser.staffId,
            role: currentUser.role
        });
        
        if (response.success) {
            showMessage('สำรองข้อมูลสำเร็จ', response.message, 'success');
        } else {
            showMessage('สำรองข้อมูลไม่สำเร็จ', response.error, 'error');
        }
    } catch (error) {
        showMessage('เกิดข้อผิดพลาด', error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function setupNotifications() {
    showMessage('ฟังก์ชั่นนี้ยังไม่เปิดใช้งาน', 'ระบบตั้งค่าการแจ้งเตือนจะเปิดใช้งานในเวอร์ชันถัดไป', 'info');
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', function() {
    // Check for existing session
    checkSession();
    
    // Set up form submissions
    document.getElementById('itemForm').addEventListener('submit', saveItem);
    document.getElementById('usageForm').addEventListener('submit', recordUsage);
    
    // Set up keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // ESC to close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
            hideMessage();
        }
        
        // Enter to submit login form
        if (e.key === 'Enter' && document.getElementById('loginScreen').classList.contains('active')) {
            login();
        }
    });
    
    // Set up click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
    
    // Check API connection on load
    testApiConnection();
});

async function testApiConnection() {
    try {
        // Try to ping the API
        const response = await fetch(CONFIG.API_BASE_URL + '?action=ping');
        if (response.ok) {
            console.log('API connection successful');
        } else {
            console.error('API connection failed');
            showMessage('คำเตือน', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการตั้งค่า API URL', 'warning');
        }
    } catch (error) {
        console.error('API connection error:', error);
        showMessage('คำเตือน', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการตั้งค่า API URL', 'warning');
    }
}

// ==================== INITIALIZATION ====================

// Initialize app when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

function initializeApp() {
    console.log('ICU Stock Management App initialized');
    
    // Check if API URL is configured
    if (CONFIG.API_BASE_URL === '<PUT_WEB_APP_EXEC_URL_HERE>' || !CONFIG.API_BASE_URL) {
        showMessage('กรุณาตั้งค่า API URL', 'กรุณาแก้ไขค่า API_BASE_URL ในไฟล์ app.js ก่อนใช้งาน', 'error');
    }
}
