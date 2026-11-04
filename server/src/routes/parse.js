const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireLogin } = require('../lib/auth');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads'), limits: { fileSize: 30 * 1024 * 1024 } });

const MEAL_MAP = { 早餐: 'breakfast', 早饭: 'breakfast', 午餐: 'lunch', 中餐: 'lunch', 午饭: 'lunch', 晚餐: 'dinner', 晚饭: 'dinner', 加餐: 'snack' };
const DAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

// 文本 → 结构化食谱
function parseMenuText(text) {
  const lines = String(text || '').split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const meals = [];
  let day = 1, mealType = 'lunch', cur = null, dish = null;

  const ensureMeal = () => {
    cur = meals.find((m) => m.day_index === day && m.meal_type === mealType);
    if (!cur) { cur = { day_index: day, meal_type: mealType, dishes: [] }; meals.push(cur); }
    return cur;
  };

  for (const line of lines) {
    const dayM = line.match(/(?:周|星期)([一二三四五六日天])/) || line.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    const mealM = Object.keys(MEAL_MAP).find((k) => line.includes(k));
    if (dayM && !/[一二三四五六日天]年级/.test(line)) {
      day = dayM[1] && DAY_MAP[dayM[1]] ? DAY_MAP[dayM[1]] : day;
      if (mealM) mealType = MEAL_MAP[mealM];
      continue;
    }
    if (mealM && line.length <= 12) { mealType = MEAL_MAP[mealM]; continue; }
    if (/年级/.test(line) && /\d/.test(line)) continue; // 分年级带量行，暂不解析

    // 提取“名称 + 带量”组合，如 肘花30 / 瘦猪肉 50 / 绿豆芽 70g
    const pairs = [...line.matchAll(/([^\s\d,，、;；:：|/]+)\s*(\d+(?:\.\d+)?)\s*(?:g|G|克|ml|毫升)?/g)]
      .map((m) => ({ raw_name: m[1].replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '').trim(), amount_g: Number(m[2]), idx: m.index }))
      .filter((p) => p.raw_name && p.amount_g > 0);

    if (pairs.length) {
      ensureMeal();
      const before = line.slice(0, pairs[0].idx).replace(/[、,，:：]/g, '').trim();
      // 行首剩余文字视为菜名（如“鱼香肉丝 瘦猪肉 50”、“莴苣炒木耳 莴苣 70”）
      if (before && before.length <= 20) {
        dish = { name: before, items: [] };
        cur.dishes.push(dish);
      } else if (!dish || !cur.dishes.includes(dish)) {
        dish = { name: '', items: [] };
        cur.dishes.push(dish);
      }
      for (const p of pairs) dish.items.push({ raw_name: p.raw_name, amount_g: p.amount_g });
      continue;
    }
    if (line.length <= 30 && !/\d/.test(line)) {
      ensureMeal();
      dish = { name: line, items: [] };
      cur.dishes.push(dish);
    }
  }
  return meals.filter((m) => m.dishes.length);
}

router.post('/text', (req, res) => {
  const meals = parseMenuText(req.body?.text || '');
  res.json({ meals });
});

// PDF：抽取文本层后解析；图片：返回提示（可在服务端配置 OCR 接口后自动启用）
router.post('/file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  try {
    if (ext === '.pdf') {
      const buf = fs.readFileSync(req.file.path);
      let text = '';
      try {
        const pdf = require('pdf-parse');
        const data = await pdf(buf);
        text = data.text || '';
      } catch (e) {
        fs.unlinkSync(req.file.path);
        return res.status(422).json({ error: 'PDF 解析失败（可能是扫描件图片版），请改用文本粘贴或手动录入：' + e.message });
      }
      fs.unlinkSync(req.file.path);
      return res.json({ meals: parseMenuText(text), text: text.slice(0, 5000), mode: 'pdf' });
    }
    if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(299).json({
        needOcr: true,
        message: '图片识别需要配置 OCR 服务（后端 OCR_API_URL/OCR_API_KEY 环境变量）。当前可先使用"粘贴文本解析"或手动录入。',
        meals: []
      });
    }
    if (['.txt'].includes(ext)) {
      const text = fs.readFileSync(req.file.path, 'utf8');
      fs.unlinkSync(req.file.path);
      return res.json({ meals: parseMenuText(text), text: text.slice(0, 5000), mode: 'text' });
    }
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(299).json({ needOcr: true, message: '表格解析模块开发中，可先复制内容用"粘贴文本解析"', meals: [] });
    }
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: '不支持的文件类型' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.parseMenuText = parseMenuText;