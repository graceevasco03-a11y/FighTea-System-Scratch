# FighTea — Milk Tea Shop POS System  v4.0

A fully responsive, professional web-based Point-of-Sale and ordering system for a small milk tea business. Built with HTML5, CSS3, and Vanilla JavaScript (no frameworks needed). Designed for a Node.js + MySQL backend.

---

## What's New in v4.0

| # | Change |
|---|--------|
| 1 | Toppings are fully admin-editable: Add, Edit, Remove from the Menu Manager tab |
| 2 | Categories are fully admin-editable: Add, Rename, Remove from the Menu Manager tab |
| 3 | Sugar level options removed from the entire system |
| 4 | Demo credentials removed from the login UI |
| 5 | Homepage "Why FighTea?" topics updated: Affordable, Customizable Drink, Friendly, Mode of Payment |
| 6 | All sample menu data removed — admin enters their own menu from scratch |
| 7 | Menu starts empty; customers see a "coming soon" message until admin adds items |
| 8 | README completed with full deploy guide |

---

## Project Structure

```
FighTea/
├── html/
│   └── index.html          ← Complete single-page app (all views + modals)
├── css/
│   └── style.css           ← Full design system, responsive breakpoints
├── js/
│   ├── data.js             ← App state, empty data arrays, analytics, utils
│   ├── app.js              ← Auth, menu rendering, cart, checkout, GCash
│   └── admin.js            ← Queue, order editing, menu/category/topping CRUD, users
├── database/
│   ├── schema.sql          ← All MySQL tables (run first)
│   ├── inventory.sql       ← Size and ice options only (no sample data)
│   ├── users.sql           ← Admin account only
│   ├── orders.sql          ← Analytics SQL queries reference
│   └── payments.sql        ← Payment schema
└── README.md               ← This file
```

---

## Quick Start (No Server — Open in Browser)

1. Extract the ZIP file to any folder
2. Open `html/index.html` in Chrome, Firefox, or Edge
3. Log in as admin: **admin@fightea.com** / **Admin@FighTea2024**

> All data (menu, orders, users) lives in browser memory. Nothing persists after page reload until you connect a backend. See the Backend Integration section below.

---

## Admin First-Time Setup (Step by Step)

Once you open the app and log in as admin, do this in order:

### Step 1 — Add Categories
1. Go to **Admin Dashboard → Menu Manager**
2. Scroll to the **Categories** section
3. Click **+ Add Category**
4. Enter a name (e.g. "Milk Tea") and save
5. Repeat for each category (e.g. "Fruit Tea", "Specialty", "Coffee")

### Step 2 — Add Toppings
1. Still in **Menu Manager**, scroll to **Toppings**
2. Click **+ Add Topping**
3. Enter the name (e.g. "Tapioca Pearls"), an emoji (e.g. ⚫), and the add-on price (e.g. 15)
4. Repeat for all toppings you offer

### Step 3 — Add Menu Items
1. Click **+ Add Drink** at the top of Menu Manager
2. Fill in: name, category (from the ones you just created), price, description
3. Upload a product photo or paste an image URL
4. Check "Mark as Best Seller" if this drink should appear on the homepage
5. Click **Save Drink**
6. Repeat for all your drinks

### Step 4 — Add Staff Accounts (optional)
1. Go to **Admin Dashboard → Users**
2. Click **+ Add User**
3. Choose role "Staff" — staff can edit and update orders in the queue
4. Give them their login credentials

### Step 5 — Update GCash Number
1. Go to **Admin Dashboard → Settings**
2. Update the **GCash Number** field to your real GCash number
3. This number appears in the checkout flow for customers

---

## Responsive Breakpoints

| Breakpoint | Target | Notes |
|------------|--------|-------|
| 1200px+ | Large desktop | Full layout, wide grids |
| 768–1199px | Tablet / laptop | Narrower sidebar (200px) |
| 600–767px | Tablet portrait / large phone | Mobile nav hamburger, admin drawer |
| 480–599px | Medium phone | Compact grids, condensed queue |
| < 480px | Small phone | Full-width cart, stacked modals |

---

## Role Permissions

| Feature | Admin | Staff | Customer |
|---------|:-----:|:-----:|:--------:|
| Browse menu & order | ✅ | ✅ | ✅ |
| View / edit order queue | ✅ | ✅ | ❌ |
| Menu Manager (drinks, categories, toppings) | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ |
| Analytics | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

---

## MySQL Database Setup

### Step 1 — Run SQL files in order

Open a terminal and run:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p fightea_db < database/inventory.sql
mysql -u root -p fightea_db < database/users.sql
```

> All files use `INSERT IGNORE` — safe to re-run without duplicate errors.

### Step 2 — Generate a real bcrypt password hash

The admin password hash in `users.sql` is a placeholder. Replace it before going live:

**Node.js:**
```bash
node -e "require('bcrypt').hash('YourNewPassword', 12).then(h => console.log(h))"
```

**PHP:**
```php
echo password_hash('YourNewPassword', PASSWORD_BCRYPT);
```

1. Copy the output hash
2. Open `database/users.sql`
3. Replace `$2y$12$REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH` with your hash
4. Re-run: `mysql -u root -p fightea_db < database/users.sql`

---

## Backend Integration (Node.js + Express)

### Installation

```bash
mkdir fightea-backend && cd fightea-backend
npm init -y
npm install express mysql2 bcrypt jsonwebtoken cors dotenv multer
```

### Environment file (`.env`)

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=fightea_db
JWT_SECRET=change_this_to_a_long_random_string_at_least_32_chars
PORT=4000
SITE_URL=http://localhost:3000
```

### Server boilerplate (`server.js`)

```js
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
```

---

## Connecting the Frontend to the Backend

After the backend is running, update these three functions in `js/data.js` and `js/app.js`:

### 1. Replace in-memory auth with JWT

In `js/data.js`, update `saveSession` and `loadSession`:
```js
function saveSession(userData) {
  App.currentUser = userData.user;
  localStorage.setItem('fightea_token', userData.token);
}
async function loadSession() {
  const token = localStorage.getItem('fightea_token');
  if (!token) return;
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) App.currentUser = await res.json();
  else clearSession();
}
```

### 2. Replace in-memory menu with API call

At the start of `renderMenuPage()` in `js/app.js`:
```js
async function renderMenuPage(filterCat) {
  // Load from API if MENU_ITEMS is empty
  if (MENU_ITEMS.length === 0) {
    const res = await fetch('/api/menu');
    const items = await res.json();
    MENU_ITEMS.push(...items.map(p => ({
      id: p.id, cat: p.category, name: p.name, desc: p.description,
      price: p.base_price, image: p.image_url, emoji: p.emoji,
      bestseller: !!p.is_bestseller, available: !!p.is_available,
    })));
    const catRes = await fetch('/api/categories');
    const cats = await catRes.json();
    MENU_CATEGORIES.push(...cats.map(c => c.name));
    const topRes = await fetch('/api/toppings');
    const tops = await topRes.json();
    TOPPINGS.push(...tops.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, price: t.price })));
  }
  // ... rest of function unchanged
}
```

### 3. Replace in-memory order save with API call

In `placeOrder()` in `js/app.js`, replace `ORDERS.unshift(order)` with:
```js
const token = localStorage.getItem('fightea_token');
const res = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    items: App.cart.map(i => ({
      product_id: i.itemId, name: i.name, size: i.size,
      size_price: SIZE_OPTIONS.find(s => s.label === i.size)?.priceAdd || 0,
      ice: i.ice, toppings: i.toppings.map(name => {
        const t = TOPPINGS.find(t => t.name === name);
        return { name, price: t?.price || 15 };
      }),
      qty: i.qty, unit_price: i.price / i.qty, line_total: i.price * i.qty,
    })),
    payment_method: selectedPayment,
    gcash_ref: gcashRef,
    notes: document.getElementById('order-notes')?.value || '',
  }),
});
const data = await res.json();
if (!res.ok) { showToast('Order failed. Please try again.', 'error'); return; }
showOrderConfirmation({ id: data.order_number, total: cartTotal(), payment: selectedPayment, gcashRef });
```

---

## GCash Integration

### Deep link (already in app.js)
On mobile, tapping "Open GCash App" fires:
```js
window.location = `gcash://pay?amount=${total}&merchant=FighTea`;
```
If GCash is not installed, a fallback reference number entry appears after 1.5 seconds.

### Production — PayMongo (automated verification)
Sign up at [dashboard.paymongo.com](https://dashboard.paymongo.com) and add to server.js:
```js
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
```

---

## Deploying Online

### Option A — Free tier (for testing)

1. **Database**: Create a free MySQL database at [PlanetScale](https://planetscale.com), [Railway](https://railway.app), or [Clever Cloud](https://clever-cloud.com)
2. **Backend**: Deploy the Node.js server to [Railway](https://railway.app) or [Render](https://render.com) (both have free tiers)
3. **Frontend**: Host the `/html`, `/css`, `/js` folders on [Netlify](https://netlify.com) or [Vercel](https://vercel.com)

Step by step for Railway (simplest):
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. In your backend folder (where server.js lives)
railway init
railway up

# 4. Add environment variables in the Railway dashboard
#    DB_HOST, DB_USER, DB_PASS, DB_NAME, JWT_SECRET, SITE_URL
```

### Option B — VPS (Hostinger, DigitalOcean, etc.)

**Manual steps:**

1. Buy a VPS (Ubuntu 22.04 recommended) — Hostinger VPS starts at ~$4/month
2. SSH into your server:
   ```bash
   ssh root@your-server-ip
   ```
3. Install Node.js and MySQL:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs mysql-server nginx
   ```
4. Secure MySQL and create the database:
   ```bash
   sudo mysql_secure_installation
   sudo mysql
   # Inside MySQL:
   CREATE DATABASE fightea_db;
   CREATE USER 'fightea'@'localhost' IDENTIFIED BY 'strong_password';
   GRANT ALL ON fightea_db.* TO 'fightea'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```
5. Upload your project (using scp or git):
   ```bash
   # From your local machine:
   scp -r FighTea/ root@your-server-ip:/var/www/fightea/
   ```
6. Run the SQL files:
   ```bash
   mysql -u fightea -p fightea_db < /var/www/fightea/database/schema.sql
   mysql -u fightea -p fightea_db < /var/www/fightea/database/inventory.sql
   mysql -u fightea -p fightea_db < /var/www/fightea/database/users.sql
   ```
7. Install Node dependencies and start the backend:
   ```bash
   cd /var/www/fightea/backend
   npm install
   npm install -g pm2
   pm2 start server.js --name fightea-api
   pm2 save && pm2 startup
   ```
8. Configure Nginx to serve frontend + proxy API:
   ```nginx
   # /etc/nginx/sites-available/fightea
   server {
       listen 80;
       server_name yourdomain.com;

       root /var/www/fightea/html;
       index index.html;
       location / { try_files $uri $uri/ /index.html; }

       location /api/ {
           proxy_pass http://localhost:4000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location /assets/ {
           alias /var/www/fightea/backend/public/assets/;
       }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/fightea /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
9. Enable HTTPS (required for GCash on mobile):
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
10. Update `.env` with production values (DB credentials, JWT secret, SITE_URL with https)
11. Restart the backend: `pm2 restart fightea-api`

---

## Deployment Checklist

### Database
- [ ] Run `schema.sql` on MySQL server
- [ ] Run `inventory.sql` (size + ice options)
- [ ] Generate real bcrypt hash and update `users.sql`
- [ ] Run `users.sql`

### Backend
- [ ] Create `.env` with real values
- [ ] Replace placeholder bcrypt hash in users.sql
- [ ] Test each API endpoint with Postman or curl
- [ ] Add input validation (check for SQL injection, XSS)
- [ ] Enable rate limiting (`npm install express-rate-limit`)
- [ ] Set CORS to your exact frontend domain only

### Frontend → Backend Wiring
- [ ] Replace in-memory `saveSession/loadSession` with JWT fetch
- [ ] Replace in-memory `MENU_ITEMS` loading with `GET /api/menu`
- [ ] Replace in-memory `TOPPINGS` with `GET /api/toppings`
- [ ] Replace in-memory `MENU_CATEGORIES` with `GET /api/categories`
- [ ] Replace `ORDERS.unshift()` with `POST /api/orders`
- [ ] Replace `getAnalytics()` with `GET /api/analytics/summary`

### Admin Setup (after going live)
- [ ] Log in as admin
- [ ] Add drink categories
- [ ] Add toppings with prices
- [ ] Add all menu items with photos
- [ ] Add staff accounts
- [ ] Update GCash number in Settings

### Production
- [ ] Enable HTTPS (required for GCash mobile deep link)
- [ ] Remove demo admin hint from any debug logs
- [ ] Change admin password to a strong unique password
- [ ] Set up automatic database backups
- [ ] Monitor server with `pm2 monit`

---

## Design System

| Token | Value | Use |
|-------|-------|-----|
| `--cream` | `#FBF5EA` | Page background |
| `--beige` | `#F0E4C8` | Cards, borders |
| `--brown` | `#7C4F2A` | Primary buttons, prices |
| `--brown-deep` | `#4A2C0E` | Hero, sidebar |
| `--blush` | `#DFA58A` | Logo accent, highlights |
| `--teal` | `#2D7268` | Success, ready status |
| `--gold` | `#C9921A` | Best seller ribbon |
| `--ivory` | `#FEFAF2` | Card backgrounds |
| Font display | Cormorant Garamond | Headings, logos |
| Font body | Outfit | All other text |

---

Built with love for small milk tea businesses. 🧋
