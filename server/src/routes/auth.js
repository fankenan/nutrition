const express = require('express');
const db = require('../db');
const { sign, hash, verify, requireLogin, requireAdmin } = require('../lib/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (!rows.length || !verify(password, rows[0].password_hash)) return res.status(401).json({ error: '用户名或密码错误' });
  if (Number(rows[0].status) !== 1) return res.status(403).json({ error: '账号已停用' });
  res.json({ token: sign(rows[0]), user: { id: rows[0].id, username: rows[0].username, role: rows[0].role, display_name: rows[0].display_name } });
});

router.post('/register', async (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const [exists] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
  if (exists.length) return res.status(400).json({ error: '用户名已存在' });
  const [r] = await db.query('INSERT INTO users (username, password_hash, display_name, role) VALUES (?,?,?,?)',
    [username, hash(password), display_name || username, 'user']);
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.json({ token: sign(rows[0]), user: { id: rows[0].id, username, role: 'user', display_name: rows[0].display_name } });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, username: req.user.username, role: req.user.role, display_name: req.user.display_name } : null });
});

router.get('/users', requireAdmin, async (req, res) => {
  const [rows] = await db.query('SELECT id, username, display_name, role, status, created_at FROM users ORDER BY id');
  res.json({ users: rows });
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  const { role, status, display_name } = req.body || {};
  await db.query('UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status), display_name = COALESCE(?, display_name) WHERE id = ?',
    [role ?? null, status ?? null, display_name ?? null, req.params.id]);
  res.json({ ok: true });
});

router.post('/password', requireLogin, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length || !verify(old_password || '', rows[0].password_hash)) return res.status(400).json({ error: '原密码错误' });
  await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash(new_password), req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
