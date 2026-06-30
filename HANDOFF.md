# HANDOFF 2026-06-30

## 已做
- **CodexRelay 修复**：根因 SakuraCat fake-ip DNS 劫持 `api.deepseek.com`。config.yaml fake-ip-filter 加白名单，删 cache.db 重启。
- **MCP 补齐**：agentboard_create_tool / agentboard_update_tool + schema TYPE_VALUES 校验（需重启 Claude Code 生效）
- **SakuraCat 信息页改造**：五分区（故障信号 → 白名单注册表 → 修复步骤 → 配置文件 → 架构）
- **白名单数据结构化**：manifest.json `whitelist` 数组，manifest 是唯一真相源
- **tip**: sakuracat-fakeip-filter-overwrite.md

## 恢复速查
下次代理覆盖导致断连：
1. 读 `~/.agentboard/tools/sakuracat-proxy/manifest.json` → `whitelist` 数组拿域名
2. 读 config.yaml → grep fake-ip-filter → 补缺失域名
3. 删 cache.db → 重启 SakuraCat → nslookup 验证

## 待办
- 用户需重启 Claude Code，新版 mcp-server 才生效
