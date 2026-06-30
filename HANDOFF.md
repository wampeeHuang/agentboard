# HANDOFF 2026-06-30

## 本次会话已完成

### 工具停用机制 — toggle 开关 + 筛选

| 文件 | 改动 |
|------|------|
| `index.html` | iOS-style toggle 替代按钮；停用卡片灰色显示；"已停用"筛选标签；BOM 移除 |
| `lib/manifest-schema.js` | 新增 `disabled` (boolean) 字段 |
| `lib/tool-registry.js` | `disabled` 加入 BASE_FIELDS 和 scanTools 输出 |
| `mcp-server.js` | `list_tools` 过滤停用工具，AI 不可见 |
| `tools/*/manifest.json` | 所有工具补齐 `disabled` 字段（coze-wx-extract/coze-xhs-scraper/bitbrowser-panel 为 true） |

**MCP 行为**：`list_tools` 不返回停用工具（44/47）。`get_tool` 通过 ID 仍可查到。AI 视角看不到停用工具，但明确查询可获取。

### SakuraCat 代理 — ToDesk 白名单 + 修复流程升级

- server.js 工具信息页改为从 manifest `fix_steps`/`pitfalls` 动态渲染
- sakuracat-proxy manifest 新增结构化修复步骤和踩坑
- API 热重载（PUT /configs）替代手动关 GUI+删缓存

## 待办

- agentboard server.js 改过后需重启（manifest 改动自动生效无需重启）
- 上轮遗留：用户需重启 Claude Code，新版 mcp-server 才生效
