# Novel AI Global

海外网文 AI 工作台：用 **Gemini** 生成英文（及西/葡/印尼/菲律宾/法/土耳其语）网文，按平台风格写作，一键复制/导出后发布到：

| 平台 | 主打题材 | 建议粘贴格式 |
|---|---|---|
| Stary Writing / Dreame | 狼人、霸总、黑手党言情 | 纯文本 |
| Webnovel | 修仙、系统、都市异能 | 纯文本 |
| Royal Road | LitRPG、进阶流 | 富文本 + AI 声明 |
| Wattpad | 青春、言情、奇幻 | 富文本 |

> 这些平台都**没有公开发布 API**，所以本项目只生成和导出，不做模拟登录自动发布（避免封号）。
> Royal Road 官方政策要求 AI 生成的作品打上 **AI-Generated Content** 标签；其他平台发布前请在作者后台确认最新的 AI 条款。

## 架构

```
Cloudflare Worker (Hono, TypeScript)
 ├── /api/*         REST API，Bearer 口令鉴权
 ├── 静态资源       Vue 3 前端 (web/dist)，同一个 Worker 托管
 ├── D1             books / chapters / jobs / settings
 ├── Cron           每天 UTC 06:17 为开启“每日自动更新”的书续写
 └── Gemini API     generateContent（结构化 JSON 输出用于设定/大纲）
```

生成流程：**故事设定**（卖点、简介、标签、人物、世界观、前 20 章大纲）→ **逐章生成**（带平台写作规则、前 12 章摘要、上一章结尾、本章大纲）→ 自动生成章节摘要保持连贯 → 大纲用完时自动续写 20 章 → 手动审核、改写、复制发布、标记已发布。

每章生成后会自动跑一次一致性检查：发现严重问题就修一次再复查，结果存进数据库，离开页面也不用重查。每次生成、改写或手动保存覆盖正文前，旧正文都会先存为历史版本（章节页“历史版本”里可恢复）；改写、重生成或删章后，后续章节的连续性账本会按顺序重算，事实按并集合并，不会因一章写薄就丢线索。编辑器里选中一段文字可直接改写 / 扩写 / 缩写 / 换风格 / 出 3 个候选。

## 部署

```bash
npm install
npx wrangler login
npx wrangler d1 create novel_ai          # 把返回的 database_id 填入 wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put GEMINI_API_KEY   # https://aistudio.google.com/apikey
npx wrangler secret put ADMIN_TOKEN      # 自己设一个长随机口令，用于登录网页
npm run deploy
```

打开 `https://novel-ai-global.<你的子域>.workers.dev`，输入 ADMIN_TOKEN 登录。

可选：在 `.dev.vars` / secret 中设置 `GEMINI_BASE_URL` 为 Cloudflare AI Gateway 地址
（`https://gateway.ai.cloudflare.com/v1/<ACCOUNT_ID>/<GATEWAY>/google-ai-studio`），可获得请求日志、缓存和限流。

默认模型 `gemini-3.8-flash`（可在网页“设置”里切换或填自定义模型 ID）。

## 本地开发

```bash
cp .dev.vars.example .dev.vars           # 填 key 和口令
npm run db:migrate:local
npm run dev                              # http://localhost:8787
```

不想消耗额度时可用假 Gemini：`node scripts/mock-gemini.mjs`，并在 `.dev.vars` 设
`GEMINI_BASE_URL=http://127.0.0.1:9999`。

```bash
npm test          # 单元测试
npm run typecheck
```

## 说明与限制

- 一章生成通常 30–120 秒，请求期间请保持页面打开；若连接中断，页面会轮询等服务器完成。同一本书同时只允许一个生成任务（超过 5 分钟视为失效）。
- Cron 每次最多生成 10 章（Workers 定时任务有 15 分钟上限）。需要更大批量可升级 Workers Paid 并改用 Queues。
- 内容安全：所有恋爱/性相关角色强制为成年人；尺度上限为“火热（不露骨）”。
- 旧版本（番茄/起点自动发布、微信小程序、Java 后端）在 `main` 分支历史中保留。
