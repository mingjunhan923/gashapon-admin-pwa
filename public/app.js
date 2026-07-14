const API_BASE = '';
let currentUser = null;
let allSlots = [];
let allSites = [];
let allDevices = [];
let allProducts = [];
let modalType = '';

// ===== 登录 =====
async function login() {
  const code = document.getElementById('auth-code').value.trim();
  if (!code) { showError('请输入授权码'); return; }
  try {
    const res = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('gashapon_auth', code);
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('main-app').classList.remove('hidden');
      loadDashboard();
    } else {
      showError(data.message || '授权码错误');
    }
  } catch (e) { showError('网络错误，请重试'); }
}
function showError(msg) {
  document.getElementById('login-error').textContent = msg;
}
function logout() {
  localStorage.removeItem('gashapon_auth');
  currentUser = null;
  location.reload();
}

// 自动登录
const savedCode = localStorage.getItem('gashapon_auth');
if (savedCode) {
  document.getElementById('auth-code').value = savedCode;
  login();
}

// ===== 页面导航 =====
function navTo(page) {
  document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(page + '-page').classList.add('active');
  document.querySelector(`.nav-item[onclick="navTo('${page}')"]`).classList.add('active');

  const titles = { dashboard: '数据看板', inventory: '库存管理', sales: '销售记录', restock: '补货清单', data: '基础数据' };
  document.getElementById('page-title').textContent = titles[page];

  if (page === 'dashboard') loadDashboard();
  if (page === 'inventory') loadInventory();
  if (page === 'sales') loadSales();
  if (page === 'restock') loadRestock();
  if (page === 'data') { loadSites(); loadDevices(); loadProducts(); }
}

// ===== 数据看板 =====
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const d = await res.json();
    document.getElementById('dash-sites').textContent = d.sites;
    document.getElementById('dash-devices').textContent = d.devices;
    document.getElementById('dash-products').textContent = d.products;
    document.getElementById('dash-slots').textContent = d.slots;
    document.getElementById('dash-lowstock').textContent = d.lowStock;
    document.getElementById('dash-warehouse').textContent = d.warehouseStock;
    document.getElementById('dash-today-sales').textContent = '¥' + d.todaySales.toFixed(2);
    document.getElementById('dash-today-qty').textContent = d.todayQty + ' 颗';
    document.getElementById('dash-total-sales').textContent = '¥' + d.totalSales.toFixed(2);
  } catch (e) { console.error(e); }
}

// ===== 库存 =====
async function loadInventory() {
  try {
    const res = await fetch(`${API_BASE}/api/slots`);
    allSlots = await res.json();
    renderInventory(allSlots);
  } catch (e) { console.error(e); }
}
function renderInventory(slots) {
  const container = document.getElementById('inventory-list');
  if (!slots.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div>暂无库存数据</div></div>'; return; }
  container.innerHTML = slots.map(s => {
    const pct = Math.round((s.current_stock / (s.full_capacity || 80)) * 100);
    const barClass = pct > 30 ? 'safe' : pct > 15 ? 'warning' : 'danger';
    return `<div class="list-item">
      <div class="list-item-header">
        <span class="list-item-title">${s.site_name || '未分配'} · ${s.device_code || '-'}</span>
        <span class="list-item-badge ${pct < 20 ? 'warning' : ''}">${s.slot_code}</span>
      </div>
      <div class="list-item-info">
        <div>商品：${s.product_name || '未绑定'} ${s.egg_size ? '(' + s.egg_size + ')' : ''}</div>
        <div class="list-item-row"><span>库存：${s.current_stock}/${s.full_capacity || 80} 颗</span><span>定价：¥${s.actual_price || '-'}</span></div>
        <div class="stock-bar"><div class="stock-bar-fill ${barClass}" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
}
function filterInventory() {
  const kw = document.getElementById('inv-search').value.toLowerCase();
  const filtered = allSlots.filter(s =>
    (s.site_name || '').toLowerCase().includes(kw) ||
    (s.device_code || '').toLowerCase().includes(kw) ||
    (s.product_name || '').toLowerCase().includes(kw) ||
    (s.slot_code || '').toLowerCase().includes(kw)
  );
  renderInventory(filtered);
}

// ===== 销售 =====
async function loadSales() {
  const date = document.getElementById('sales-date').value;
  try {
    const url = date ? `${API_BASE}/api/sales?date=${date}` : `${API_BASE}/api/sales`;
    const res = await fetch(url);
    const sales = await res.json();
    const container = document.getElementById('sales-list');
    if (!sales.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><div>暂无销售记录</div></div>'; return; }
    container.innerHTML = sales.map(s => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${s.product_name || '-'}</span>
          <span class="list-item-badge">¥${parseFloat(s.amount).toFixed(2)}</span>
        </div>
        <div class="list-item-info">
          <div class="list-item-row"><span>数量：${s.quantity} 颗</span><span>日期：${s.sale_date}</span></div>
          <div>${s.site_name || '-'} · ${s.device_code || '-'}</div>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// ===== 补货 =====
async function loadRestock() {
  try {
    const res = await fetch(`${API_BASE}/api/restock`);
    const items = await res.json();
    const container = document.getElementById('restock-list');
    if (!items.length) { container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div>库存充足，无需补货</div></div>'; return; }
    container.innerHTML = items.map(s => {
      const bagSize = s.egg_size === '120mm' ? 17 : 25;
      const need = Math.max(0, (s.full_capacity || 80) - s.current_stock);
      const bags = Math.ceil(need / bagSize);
      return `<div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${s.site_name || '-'} · ${s.device_code || '-'}</span>
          <span class="list-item-badge warning">${s.slot_code}</span>
        </div>
        <div class="list-item-info">
          <div>商品：${s.product_name || '-'} (${s.egg_size || '-'})</div>
          <div class="list-item-row"><span>库存：${s.current_stock}/${s.full_capacity || 80}</span><span>需补：${need} 颗（${bags} 袋）</span></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

// ===== 基础数据 =====
async function loadSites() {
  try {
    const res = await fetch(`${API_BASE}/api/sites`);
    allSites = await res.json();
    const container = document.getElementById('sites-list');
    container.innerHTML = allSites.map(s => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${s.name}</span>
        </div>
        <div class="list-item-info">${s.address || ''} ${s.contact ? '· ' + s.contact : ''}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}
async function loadDevices() {
  try {
    const res = await fetch(`${API_BASE}/api/devices`);
    allDevices = await res.json();
    const container = document.getElementById('devices-list');
    container.innerHTML = allDevices.map(d => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${d.name || d.code}</span>
          <span class="list-item-badge">${d.site_name || '未分配'}</span>
        </div>
        <div class="list-item-info">编号：${d.code}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}
async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    allProducts = await res.json();
    const container = document.getElementById('products-list');
    container.innerHTML = allProducts.map(p => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${p.name}</span>
          <span class="list-item-badge">${p.egg_size || '-'}</span>
        </div>
        <div class="list-item-info">
          <div class="list-item-row"><span>成本：¥${p.cost || '-'}</span><span>售价：¥${p.base_price || '-'}</span></div>
          <div>货源：${p.source || '-'} · 箱装：${p.box_size || '-'} 颗</div>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}
function switchDataTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.data-tab').forEach(el => el.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick="switchDataTab('${tab}')"]`).classList.add('active');
  document.getElementById('data-tab-' + tab).classList.add('active');
}

// ===== 弹窗 =====
function showAddModal(type) {
  modalType = type;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  overlay.classList.remove('hidden');

  if (type === 'site') {
    title.textContent = '添加场地';
    body.innerHTML = '<input id="m-name" placeholder="场地名称"><input id="m-address" placeholder="地址"><input id="m-contact" placeholder="联系人/电话">';
  } else if (type === 'device') {
    title.textContent = '添加设备';
    let opts = allSites.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    body.innerHTML = `<input id="m-code" placeholder="设备编号"><input id="m-name" placeholder="设备名称"><select id="m-site">${opts}</select>`;
  } else if (type === 'product') {
    title.textContent = '添加商品';
    body.innerHTML = `<input id="m-name" placeholder="商品名称"><select id="m-size"><option value="100mm">100mm</option><option value="120mm">120mm</option></select><input id="m-cost" placeholder="成本价" type="number"><input id="m-price" placeholder="售价" type="number"><input id="m-source" placeholder="货源"><input id="m-box" placeholder="箱装数量" type="number">`;
  }
}
function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
function closeModal(e) {
  if (e.target === e.currentTarget) hideModal();
}
async function submitModal() {
  let body = {};
  if (modalType === 'site') {
    body = { name: document.getElementById('m-name').value, address: document.getElementById('m-address').value, contact: document.getElementById('m-contact').value };
  } else if (modalType === 'device') {
    body = { code: document.getElementById('m-code').value, name: document.getElementById('m-name').value, site_id: parseInt(document.getElementById('m-site').value) };
  } else if (modalType === 'product') {
    body = { name: document.getElementById('m-name').value, egg_size: document.getElementById('m-size').value, cost: parseFloat(document.getElementById('m-cost').value), base_price: parseFloat(document.getElementById('m-price').value), source: document.getElementById('m-source').value, box_size: parseInt(document.getElementById('m-box').value) };
  }
  try {
    await fetch(`${API_BASE}/api/${modalType}s`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    hideModal();
    if (modalType === 'site') loadSites();
    if (modalType === 'device') loadDevices();
    if (modalType === 'product') loadProducts();
  } catch (e) { alert('添加失败：' + e.message); }
}
