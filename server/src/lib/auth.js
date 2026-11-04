const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'nutrition-secret-change-me';

function sign(user) {
  return jwt.sign({ uid: user.id, role: user.role, username: user.username }, SECRET, { expiresIn: '7d' });
}

function hash(pwd) {
  return bcrypt.hashSync(pwd, 10);
}

function verify(pwd, hashed) {
  return bcrypt.compareSync(pwd, hashed);
}

// 解析身份：登录用户 / 游客(guest)
async function resolveUser(req) {
  if (req.header('x-guest') === '1') return { id: null, role: 'guest', username: 'guest' };
  const h = req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return null;
  try {
    const p = jwt.verify(token, SECRET);
    const [rows] = await db.query('SELECT id, username, role, display_name, status FROM users WHERE id = ?', [p.uid]);
    if (!rows.length || Number(rows[0].status) !== 1) return null;
    return { ...rows[0], role: rows[0].role };
  } catch {
    return null;
  }
}

function attachAuth(req, _res, next) {
  resolveUser(req).then((u) => {
    req.user = u; // null | {role:'guest'} | {role:'admin'|'user'}
    next();
  }).catch(() => next());
}

function requireLogin(req, res, next) {
  if (!req.user || req.user.role === 'guest') return res.status(401).json({ error: '请先登录（游客无法使用该功能）' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

module.exports = { sign, hash, verify, attachAuth, requireLogin, requireAdmin, SECRET };
