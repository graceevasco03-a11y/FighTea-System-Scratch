-- ============================================================
-- FighTea — User Accounts  v3
-- File: /database/users.sql
-- Run AFTER schema.sql
--
-- FIX: Uses INSERT IGNORE to prevent duplicate email errors.
--      Only the default admin account is seeded.
--      All sample/test customer data removed.
--
-- IMPORTANT: Replace the password_hash placeholder with a
--   real bcrypt hash before deploying to production.
--
--   Node.js:  const hash = await bcrypt.hash('Admin@FighTea2024', 12);
--   PHP:      $hash = password_hash('Admin@FighTea2024', PASSWORD_BCRYPT);
-- ============================================================
USE `fightea_db`;

-- ─── DEFAULT ADMIN ACCOUNT ───────────────────────────────
-- Password: Admin@FighTea2024
-- Replace the hash below with a real bcrypt-generated value!
INSERT IGNORE INTO `users` (`full_name`,`email`,`phone`,`password_hash`,`role`)
VALUES (
  'FighTea Admin',
  'admin@fightea.com',
  '09171234567',
  '$2y$12$REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH',
  'admin'
);

-- ─── HOW TO GENERATE A REAL HASH ─────────────────────────
-- Node.js example:
--   const bcrypt = require('bcrypt');
--   const hash   = await bcrypt.hash('Admin@FighTea2024', 12);
--   console.log(hash);  -- paste the output above
--
-- PHP example:
--   echo password_hash('Admin@FighTea2024', PASSWORD_BCRYPT);
--
-- After replacing: the admin can log in via admin@fightea.com
-- ─────────────────────────────────────────────────────────

-- ─── PERMISSIONS SUMMARY ─────────────────────────────────
-- role = 'admin'    → Full access: queue, menu CRUD, users, analytics, settings
-- role = 'staff'    → Queue access only: can view and edit orders in queue
-- role = 'customer' → Frontend only: browse menu, customize, order, pay
--
-- Additional staff/admin accounts should be created via the
-- Admin Dashboard → Users tab, or inserted here using INSERT IGNORE.
