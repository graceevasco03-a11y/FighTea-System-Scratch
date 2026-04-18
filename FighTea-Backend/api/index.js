require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.SITE_URL }));
app.use('/assets', express.static('public/assets'));

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// ── Auth middleware ──────────────────────────────────────
function auth(role = null) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (role === 'admin' && decoded.role !== 'admin')
        return res.status(403).json({ error: 'Forbidden' });
      if (role === 'staff' && !['admin','staff'].includes(decoded.role))
        return res.status(403).json({ error: 'Forbidden' });
      req.user = decoded;
      next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
  };
}

// ── POST /api/auth/login ─────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await db.query(
    'SELECT * FROM users WHERE email = ? AND is_active = 1', [email]
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, name: user.full_name, email: user.email, role: user.role },
    process.env.JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, name: user.full_name, role: user.role } });
});

// ── POST /api/auth/register ──────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Missing required fields' });
  const hash = await bcrypt.hash(password, 12);
  try {
    await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "customer")',
      [name, email, phone || null, hash]
    );
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    throw e;
  }
});

// ── GET /api/menu ────────────────────────────────────────
app.get('/api/menu', async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, c.name AS category
     FROM products p
     JOIN categories c ON p.category_id = c.id
     WHERE p.is_available = 1
     ORDER BY c.sort_order, p.id`
  );
  res.json(rows);
});

// ── GET /api/categories ──────────────────────────────────
app.get('/api/categories', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order'
  );
  res.json(rows);
});

// ── GET /api/toppings ────────────────────────────────────
app.get('/api/toppings', async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM toppings WHERE is_available = 1 ORDER BY sort_order, id'
  );
  res.json(rows);
});

// ── POST /api/orders ─────────────────────────────────────
app.post('/api/orders', auth(), async (req, res) => {
  const { items, payment_method, gcash_ref, notes } = req.body;
  const total = items.reduce((s, i) => s + i.line_total, 0);
  const orderNum = 'FT-' + Date.now().toString().slice(-6);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO orders
       (order_number, user_id, customer_name, status, payment_method, gcash_ref, subtotal, total, notes)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [orderNum, req.user.id, req.user.name, payment_method, gcash_ref || null, total, total, notes || null]
    );
    const orderId = result.insertId;
    for (const item of items) {
      const [itemResult] = await conn.query(
        `INSERT INTO order_items
         (order_id, product_id, product_name, size_label, size_price, ice_label, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id || null, item.name, item.size, item.size_price || 0,
         item.ice || null, item.qty, item.unit_price, item.line_total]
      );
      for (const t of (item.toppings || [])) {
        await conn.query(
          'INSERT INTO order_item_toppings (order_item_id, topping_name, price) VALUES (?, ?, ?)',
          [itemResult.insertId, t.name, t.price || 15]
        );
      }
    }
    await conn.commit();
    res.json({ success: true, order_number: orderNum, order_id: orderId });
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
});

// ── GET /api/orders ──────────────────────────────────────
app.get('/api/orders', auth('staff'), async (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status && status !== 'all') {
    if (status === 'active') {
      sql += " WHERE status NOT IN ('completed','cancelled')";
    } else {
      sql += ' WHERE status = ?';
      params.push(status);
    }
  }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// ── PATCH /api/orders/:id/status ────────────────────────
app.patch('/api/orders/:id/status', auth('staff'), async (req, res) => {
  const { status } = req.body;
  const [[order]] = await db.query('SELECT status FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  await db.query(
    'INSERT INTO order_status_log (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
    [req.params.id, order.status, status, req.user.id]
  );
  res.json({ success: true });
});

// ── Image upload ─────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: 'public/assets/images/',
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});
app.post('/api/upload', auth('admin'), upload.single('image'), (req, res) => {
  res.json({ url: `/assets/images/${req.file.filename}` });
});

// ── Category CRUD ────────────────────────────────────────
app.post('/api/categories', auth('admin'), async (req, res) => {
  const { name } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const [[maxOrder]] = await db.query('SELECT MAX(sort_order) AS m FROM categories');
  await db.query('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)',
    [name, slug, (maxOrder.m || 0) + 1]);
  res.json({ success: true });
});
app.put('/api/categories/:id', auth('admin'), async (req, res) => {
  const { name } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  await db.query('UPDATE categories SET name = ?, slug = ? WHERE id = ?', [name, slug, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/categories/:id', auth('admin'), async (req, res) => {
  const [[inUse]] = await db.query('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [req.params.id]);
  if (inUse.n > 0) return res.status(409).json({ error: 'Category has items assigned' });
  await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Topping CRUD ─────────────────────────────────────────
app.post('/api/toppings', auth('admin'), async (req, res) => {
  const { name, emoji, price } = req.body;
  await db.query('INSERT INTO toppings (name, emoji, price) VALUES (?, ?, ?)', [name, emoji || null, price]);
  res.json({ success: true });
});
app.put('/api/toppings/:id', auth('admin'), async (req, res) => {
  const { name, emoji, price } = req.body;
  await db.query('UPDATE toppings SET name = ?, emoji = ?, price = ? WHERE id = ?',
    [name, emoji || null, price, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/toppings/:id', auth('admin'), async (req, res) => {
  await db.query('DELETE FROM toppings WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Menu item CRUD ───────────────────────────────────────
app.post('/api/menu', auth('admin'), async (req, res) => {
  const { name, category_id, description, base_price, image_url, emoji, is_bestseller } = req.body;
  await db.query(
    'INSERT INTO products (category_id, name, description, base_price, image_url, emoji, is_bestseller) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [category_id, name, description || null, base_price, image_url || null, emoji || '🧋', is_bestseller ? 1 : 0]
  );
  res.json({ success: true });
});
app.put('/api/menu/:id', auth('admin'), async (req, res) => {
  const { name, category_id, description, base_price, image_url, emoji, is_bestseller, is_available } = req.body;
  await db.query(
    `UPDATE products SET category_id=?, name=?, description=?, base_price=?,
     image_url=?, emoji=?, is_bestseller=?, is_available=? WHERE id=?`,
    [category_id, name, description, base_price, image_url, emoji || '🧋',
     is_bestseller ? 1 : 0, is_available ? 1 : 0, req.params.id]
  );
  res.json({ success: true });
});
app.delete('/api/menu/:id', auth('admin'), async (req, res) => {
  await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── User CRUD ────────────────────────────────────────────
app.get('/api/users', auth('admin'), async (req, res) => {
  const [rows] = await db.query('SELECT id, full_name, email, phone, role, is_active, created_at FROM users ORDER BY id');
  res.json(rows);
});
app.post('/api/users', auth('admin'), async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone || null, hash, role]
  );
  res.json({ success: true });
});
app.put('/api/users/:id', auth('admin'), async (req, res) => {
  const { name, email, phone, role, password } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET full_name=?, email=?, phone=?, role=?, password_hash=? WHERE id=?',
      [name, email, phone, role, hash, req.params.id]);
  } else {
    await db.query('UPDATE users SET full_name=?, email=?, phone=?, role=? WHERE id=?',
      [name, email, phone, role, req.params.id]);
  }
  res.json({ success: true });
});
app.delete('/api/users/:id', auth('admin'), async (req, res) => {
  const [[u]] = await db.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
  await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Analytics ────────────────────────────────────────────
app.get('/api/analytics/summary', auth('admin'), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [[{total_revenue}]]  = await db.query(`SELECT COALESCE(SUM(total),0) AS total_revenue FROM orders WHERE payment_status='paid'`);
  const [[{today_revenue}]]  = await db.query(`SELECT COALESCE(SUM(total),0) AS today_revenue FROM orders WHERE payment_status='paid' AND order_date=?`, [today]);
  const [[{total_orders}]]   = await db.query('SELECT COUNT(*) AS total_orders FROM orders');
  const [[{today_orders}]]   = await db.query('SELECT COUNT(*) AS today_orders FROM orders WHERE order_date=?', [today]);
  const [[{completed}]]      = await db.query(`SELECT COUNT(*) AS completed FROM orders WHERE status='completed'`);
  const [[{gcash_count}]]    = await db.query(`SELECT COUNT(*) AS gcash_count FROM orders WHERE payment_method='gcash'`);
  const [[{cash_count}]]     = await db.query(`SELECT COUNT(*) AS cash_count FROM orders WHERE payment_method='cash'`);
  const [[{pending_revenue}]]= await db.query(`SELECT COALESCE(SUM(total),0) AS pending_revenue FROM orders WHERE payment_method='cash' AND payment_status='unpaid'`);
  const [topItems]           = await db.query(
    `SELECT p.name, p.emoji, p.image_url AS image,
            SUM(oi.quantity) AS count,
            SUM(oi.line_total) AS revenue
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     JOIN orders o ON oi.order_id = o.id
     WHERE o.status != 'cancelled'
     GROUP BY p.id ORDER BY count DESC LIMIT 5`
  );
  const [byStatus] = await db.query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
  res.json({
    total_revenue, today_revenue, total_orders, today_orders,
    completed, gcash_count, cash_count, pending_revenue, topItems,
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.n])),
    avg_order: total_orders ? (total_revenue / total_orders) : 0,
  });
});

app.listen(process.env.PORT || 4000, () =>
  console.log(`FighTea API → http://localhost:${process.env.PORT || 4000}`)
);
app.post('/api/payments/gcash', auth(), async (req, res) => {
  const axios = require('axios');
  const { amount, order_id } = req.body;
  const r = await axios.post('https://api.paymongo.com/v1/sources', {
    data: {
      attributes: {
        amount: amount * 100, currency: 'PHP', type: 'gcash',
        redirect: {
          success: `${process.env.SITE_URL}/payment/success?order=${order_id}`,
          failed:  `${process.env.SITE_URL}/payment/failed?order=${order_id}`,
        },
      },
    },
  }, {
    headers: { Authorization: 'Basic ' + Buffer.from(process.env.PAYMONGO_SECRET + ':').toString('base64') },
  });
  res.json({ checkout_url: r.data.data.attributes.redirect.checkout_url });
});