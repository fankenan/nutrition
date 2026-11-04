# 食材价格与营养分析系统

面向学校食堂与学生营养餐的**食谱营养核算 + 食材价格查询**系统。核心是把「一周食谱 → 菜品 → 食材带量 → 食物成分」这条链路打通，给出可直接对照国家标准的营养核算结果，同时提供本地食材市场价格查询。

## 功能模块

| 模块 | 说明 |
|---|---|
| 工作台 | 食谱、食材、菜品、待确认映射四类总量概览与待办提醒 |
| 营养分析 | 选定食谱与学段/性别，输出日均能量、三大供能比、WS/T 554 达标率、DRIs 对比、逐日明细 |
| 食谱库 | 周食谱列表，按学段、学校筛选 |
| 食材营养库 | 食物成分查询（含 30+ 营养字段），支持手工录入库中缺失的食材 |
| 映射库 | 食材原始名称与食物成分的对应关系维护，未匹配食材闭环处理 |
| 价格行情 | 万邦、郑州、平台三路价格数据按报价日、分类、关键字查询 |
| 菜品库 | 菜品及其食材带量明细 |

## 技术栈

- **后端**：Node.js + Express 4 + MySQL 8（mysql2）、JWT 鉴权、bcryptjs
- **前端**：Vue 3 + Vite 5 + TDesign Vue Next + vue-router + axios
- **数据库**：MySQL 8，库名默认 `nutrition`

## 目录结构

```
.
├── server/                 # 后端服务
│   ├── src/
│   │   ├── index.js        # 入口，挂载路由与前端静态托管
│   │   ├── db.js           # mysql2 连接池
│   │   ├── schema.js       # 建表与基础数据
│   │   ├── lib/
│   │   │   ├── analysis.js      # 营养核算引擎（能量、供能比、达标判定）
│   │   │   ├── nutrients.js     # 营养字段元数据与食物分组规则
│   │   │   ├── standardsData.js # WS/T 554 与 DRIs 标准数据
│   │   │   ├── matcher.js       # 食材名匹配（精确→映射库→同义词→模糊）
│   │   │   ├── prices.js        # 价格数据处理
│   │   │   ├── fetchPrices.js   # 价格抓取
│   │   │   └── auth.js          # JWT 签发与权限中间件
│   │   ├── routes/         # auth / foods / dishes / recipes / analyze / mapping / prices / standards / parse
│   │   ├── seed/           # 初始化数据
│   │   └── fix/            # 数据修复脚本（带量回填、food_id 固化）
│   └── .env.example
└── web/                    # 前端工程
    ├── src/
    │   ├── views/          # 各功能页
    │   ├── components/     # 图标、KPI 卡、环形图、折线图
    │   ├── api/http.js     # axios 实例与鉴权拦截
    │   └── utils/          # 拼音筛选、营养展示、食材选项缓存
    └── vite.config.js
```

## 快速开始

### 1. 准备数据库

```sql
CREATE DATABASE nutrition DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nutrition'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON nutrition.* TO 'nutrition'@'localhost';
FLUSH PRIVILEGES;
```

### 2. 启动后端

```bash
cd server
cp .env.example .env      # 按实际情况修改数据库口令与 JWT_SECRET
npm install
node src/schema.js        # 建表
npm run seed              # 导入基础数据（菜品库、标准表等）
npm start                 # 默认 18080 端口
```

### 3. 启动前端

```bash
cd web
npm install
npm run dev               # 开发模式，/api 代理到 127.0.0.1:18080
```

生产构建：

```bash
npm run build             # 产物在 web/dist
```

后端会把 `web/dist` 作为静态目录托管，因此生产环境只需运行后端，访问 `http://服务器:18080/` 即可。

## 环境变量

见 `server/.env.example`：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 18080 |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接信息 |
| `JWT_SECRET` | JWT 签名密钥，**部署时必须替换为随机长字符串** |
| `ADMIN_INIT_PASSWORD` | 首次初始化管理员账号的密码 |

`.env` 已在 `.gitignore` 中排除，请勿提交到仓库。

## 营养核算口径

- **能量**：食物成分表以 kJ 记录，核算时按 `1 kcal = 4.184 kJ` 换算为千卡。
- **三大供能比**：蛋白质 4 kcal/g、脂肪 9 kcal/g、碳水化合物 4 kcal/g，分别占总能量比例。
- **WS/T 554《学生餐营养指南》**：按学段与性别取对应年龄组，逐项比对能量、营养素与食物分组供应量，输出达标项数与达标率，并按早/午/晚餐能量配比校验。
- **DRIs（2023 版）**：按年龄组取出参考摄入量，输出主要营养素的达成情况。
- **食材匹配**：食谱中的食材名先走精确匹配，再查映射库，最后做同义词与模糊匹配；未匹配项进入映射库待确认列表，确认后回写并参与后续核算。

营养数据统一按**每 100g 可食部**记录；食部比例用于把毛重换算为可食部重量。

## 数据说明

仓库不包含第三方食物成分表原始文件（xlsx/PDF）与市场报价原始数据，请按各自授权自行准备并导入：

- 食物成分数据：中国疾病预防控制中心营养与健康所《中国食物成分表》标准版
- 学生餐标准：WS/T 554—2017《学生餐营养指南》
- 膳食参考摄入量：中国营养学会《中国居民膳食营养素参考摄入量（2023 版）》
- 市场价格：万邦国际农产品物流城、郑州市发改委价格监测数据

## 许可

内部业务系统，未附加开源许可协议。如需对外复用，请先确认所用标准与数据的授权范围。
