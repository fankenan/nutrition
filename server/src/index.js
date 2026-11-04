const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('./db');
const { attachAuth } = require('./lib/auth');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachAuth);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/foods', require('./routes/foods'));
app.use('/api/mapping', require('./routes/mapping'));
app.use('/api/recipes', require('./routes/recipes'));
app.use('/api/analyze', require('./routes/analyze'));
app.use('/api/standards', require('./routes/standards'));
app.use('/api/parse', require('./routes/parse'));
app.use('/api/dishes', require('./routes/dishes'));
app.use('/api/prices', require('./routes/prices'));

app.get('/api/health', async (req, res) => {
  try {
    const [[{ c }]] = await db.query('SELECT COUNT(*) c FROM foods');
    res.json({ ok: true, foods: c, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 前端静态资源（生产构建后由 dist 提供）
const dist = path.join(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const PORT = Number(process.env.PORT || 18080);
const { ensureDishLibrary } = require('./lib/dishLibrary');
const { ensurePriceTables } = require('./lib/prices');
const { ensureFetchLog, startScheduler } = require('./lib/fetchPrices');
ensureDishLibrary().catch((e) => console.error('[dish_library] 初始化失败：', e.message));
ensurePriceTables()
  .then(() => ensureFetchLog())
  .then(() => startScheduler(console.log))
  .catch((e) => console.error('[prices] 初始化失败：', e.message));

app.listen(PORT, '0.0.0.0', () => console.log(`营养分析系统已启动：http://0.0.0.0:${PORT}`));
