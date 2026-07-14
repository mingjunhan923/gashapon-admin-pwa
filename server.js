require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_2GAlYmN5hBMP@ep-solitary-dust-atsy552t-pooler.c-9.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require',
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== 认证 ==========
app.post('/api/auth', async (req, res) => {
  const { code } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE auth_code = $1', [code]);
    if (result.rows.length > 0) {
      await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [result.rows[0].id]);
      res.json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: '授权码错误' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 数据看板 ==========
app.get('/api/dashboard', async (req, res) => {
  try {
    const sites = await pool.query('SELECT COUNT(*) as count FROM sites');
    const devices = await pool.query('SELECT COUNT(*) as count FROM devices');
    const products = await pool.query('SELECT COUNT(*) as count FROM products');
    const slots = await pool.query('SELECT COUNT(*) as count FROM slots');
    const totalStock = await pool.query('SELECT COALESCE(SUM(current_stock), 0) as total FROM slots');
    const totalSales = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM sales');
    const todaySales = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total, COALESCE(SUM(quantity), 0) as qty 
      FROM sales WHERE sale_date = CURRENT_DATE
    `);
    const lowStock = await pool.query(`
      SELECT COUNT(*) as count FROM slots 
      WHERE current_stock < 15
    `);
    const warehouseStock = await pool.query('SELECT COALESCE(SUM(stock), 0) as total FROM warehouse');

    res.json({
      sites: parseInt(sites.rows[0].count),
      devices: parseInt(devices.rows[0].count),
      products: parseInt(products.rows[0].count),
      slots: parseInt(slots.rows[0].count),
      totalStock: parseInt(totalStock.rows[0].total),
      totalSales: parseFloat(totalSales.rows[0].total),
      todaySales: parseFloat(todaySales.rows[0].total),
      todayQty: parseInt(todaySales.rows[0].qty),
      lowStock: parseInt(lowStock.rows[0].count),
      warehouseStock: parseInt(warehouseStock.rows[0].total)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 场地 ==========
app.get('/api/sites', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sites ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sites', async (req, res) => {
  const { name, address, contact } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO sites (name, address, contact) VALUES ($1, $2, $3) RETURNING *',
      [name, address, contact]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 设备 ==========
app.get('/api/devices', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, s.name as site_name 
      FROM devices d 
      LEFT JOIN sites s ON d.site_id = s.id 
      ORDER BY d.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices', async (req, res) => {
  const { code, name, site_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO devices (code, name, site_id) VALUES ($1, $2, $3) RETURNING *',
      [code, name, site_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 商品 ==========
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, egg_size, cost, base_price, source, box_size } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, egg_size, cost, base_price, source, box_size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, egg_size, cost, base_price, source, box_size]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 仓位/库存 ==========
app.get('/api/slots', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sl.*, d.code as device_code, d.name as device_name, s.name as site_name,
             p.name as product_name, p.egg_size
      FROM slots sl
      LEFT JOIN devices d ON sl.device_id = d.id
      LEFT JOIN sites s ON d.site_id = s.id
      LEFT JOIN products p ON sl.product_id = p.id
      ORDER BY s.name, d.code, sl.slot_code
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/slots/:id', async (req, res) => {
  const { id } = req.params;
  const { current_stock, product_id, actual_price, full_capacity } = req.body;
  try {
    const result = await pool.query(
      'UPDATE slots SET current_stock = $1, product_id = $2, actual_price = $3, full_capacity = $4, update_time = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [current_stock, product_id, actual_price, full_capacity, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 销售记录 ==========
app.get('/api/sales', async (req, res) => {
  try {
    const { date } = req.query;
    let query = `
      SELECT sa.*, p.name as product_name, d.code as device_code, s.name as site_name
      FROM sales sa
      LEFT JOIN products p ON sa.product_id = p.id
      LEFT JOIN devices d ON sa.device_id = d.id
      LEFT JOIN sites s ON d.site_id = s.id
    `;
    const params = [];
    if (date) {
      query += ' WHERE sa.sale_date = $1';
      params.push(date);
    }
    query += ' ORDER BY sa.sale_date DESC, sa.id DESC LIMIT 200';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sales', async (req, res) => {
  const { product_id, product_name, quantity, amount, sale_date, device_id, slot_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO sales (product_id, product_name, quantity, amount, sale_date, device_id, slot_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [product_id, product_name, quantity, amount, sale_date, device_id, slot_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 仓库 ==========
app.get('/api/warehouse', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, p.name as product_name, p.egg_size, p.cost, p.box_size
      FROM warehouse w
      LEFT JOIN products p ON w.product_id = p.id
      ORDER BY p.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/warehouse/:id', async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;
  try {
    const result = await pool.query(
      'UPDATE warehouse SET stock = $1, update_time = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [stock, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 补货清单 ==========
app.get('/api/restock', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sl.*, d.code as device_code, s.name as site_name,
             p.name as product_name, p.egg_size, p.box_size
      FROM slots sl
      LEFT JOIN devices d ON sl.device_id = d.id
      LEFT JOIN sites s ON d.site_id = s.id
      LEFT JOIN products p ON sl.product_id = p.id
      WHERE sl.current_stock < 20
      ORDER BY s.name, d.code, sl.slot_code
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 启动 ==========
app.listen(PORT, () => {
  console.log(`扭蛋机管理后台已启动: http://localhost:${PORT}`);
});
