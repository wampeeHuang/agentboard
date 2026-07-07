# HANDOFF — 2026-07-06

## 本次完成

### 飞书 Bot 独立 + 多租户统一
- 新服务 `~/.feishu-bot/server.js`，端口 3101，PM2 管理（`feishu-bot`）
- 4 个 Bot（虾/Claude code 终端/大CC/小微），每个独立 WS 连接 + token 缓存
- 消息处理：飞书事件 → `claude -p --model deepseek-v4-flash` → 飞书 API 回复
- HTML 仪表盘 `http://localhost:3101/health` — 4 Bot 状态卡片，深色模式
- JSON API 保留在 `/health/json`
- 旧 `feishu-bot-claude-code`（lark-channel-bridge + VBS）已删

### Agentboard 运行检测架构改造
- **PID 身份层**：启动写 `runtime/{id}.pid`，三段验证（端口→PID存活→进程名兜底），停止 `taskkill /PID /T /F` 精确杀
- **端口查重**：`createTool`/`updateTool` 写入前强制绕过缓存扫描，端口被占当场拦截
- **端口碰撞修复**：inspector(3101→3102), forma(3100→3103), search-server(3456→3459)
- **缓存分层**：scan/port 缓存 500→5000ms，进程缓存独立 30000ms
- **extractMeta 跳过**：manifest 已有 name+description 时不读 HTML
- **前端**：硬编码"46"→"—"占位
- **CLAUDE.md** 已更新架构文档

### 外部代码改动
- `~/.inspector/server.js:145` — 默认端口 3101→3102
- `~/.codex/mcp/search-server.js:17` — `const PORT = 3456`→`3459`

### 新增 tip
- `tips/agentboard-scan-too-slow.md` — `/api/tools` 响应慢的诊断修复

## 当前运行状态

| 服务 | 端口 | 管理方式 |
|------|------|---------|
| agentboard | 3099 | PM2 |
| scheduler | 3100 | schtasks guard (每小时) |
| feishu-bot | 3101 | PM2 |
| 个体户台账 | 3456 | PM2 |

## 端口分配（27 个，无碰撞）

| 端口 | 工具 |
|------|------|
| 3071 | html-video |
| 3080 | html-gallery |
| 3090 | nuwa-catalog |
| 3091 | logo-generator |
| 3095 | xhs-scraper |
| 3098 | source-rack |
| 3099 | dashboard |
| 3100 | cron-scheduler |
| 3101 | feishu-bot |
| 3102 | inspector |
| 3103 | forma |
| 3456 | 个体户驾驶舱 |
| 3457 | tax-wuyou |
| 3458 | shenzhen-housing |
| 3459 | search-server |
| 3460 | tmall-shopping |
| 4446 | codex-relay |
| 5173 | ace-step |
| 6767 | paseo |
| 7860 | stable-diffusion |
| 8000 | cosyvoice3 |
| 8080 | minicpm-v |
| 8188 | comfyui |
| 9222 | mcp-chrome |
| 11434 | ollama |
| 15502 | bitbrowser-panel |
| 18789 | openclaw |

## 已做 / 未做

- [x] 飞书 Bot 独立多租户服务
- [x] HTML 仪表盘 + JSON API
- [x] 工具架卡片规范化
- [x] 旧 lark-channel 卡片删除
- [x] Agentboard 性能优化（缓存分层 + 跳过无效 I/O）
- [x] 性能 tip 写入（agentboard-scan-too-slow.md）
- [x] Agentboard 对抗性审计
- [x] PID 身份层 + 端口查重实现
- [x] 3 组端口碰撞修复
- [x] CLAUDE.md 架构文档更新
- [ ] 飞书端到端实测（等真实消息触发）
- [ ] `~/.openclaw/` 清理（sessions.json 7.2MB）
- [ ] 飞书 Bot 长会话上下文（当前每次 `claude -p` 无状态）
