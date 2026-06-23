# HANDOFF — 2026-06-22

## 本次完成

**自启脚本修复 — start /b → start /min**
- 根因: 系统 21:33 重启后，启动文件夹的 `start /b node` 脚本因共享控制台导致 agentboard 子进程被杀。inspector 依赖 agentboard 管理 → 没人拉 → 卡"启动中"。
- 修复 4 个文件:
  - `start-agentboard.bat` — `start /b node` → `start "" /min "C:\Program Files\nodejs\node.exe"`
  - `~/.agentboard/launch.bat` — 同上
  - `lark-channel-bridge.vbs` — `start /b` → `start "" /min 绝对路径`
  - `~/.scheduler/MAINTENANCE.md` — 文档推荐写法修正
- 规则: Windows 自启常驻服务一律用 `start "" /min 绝对路径`，不用 `start /b`
- Tips 已写入: `windows-start-b-kills-children.md`

**运行时漂移检测**
- `lib/manifest-schema.js` 新增 `auditRuntime()` — 对照文件系统/netstat/PATH，检查 projectPath 存在性、startCommand exe 可达性、孤儿目录、端口监听。`auditAll()` 不变（schema 合规校验）。
- 修复误报: `%USERPROFILE%` 展开、PowerShell cmdlet (Start-Process 等) 识别为 builtin。
- `auditAll` 和 `auditRuntime` 只做 lib 函数，不做 MCP tool。独立巡检脚本直接 require 调用。

**MCP server 精简**
- 9→4 工具: 砍掉 search_tools, create_tool, update_tool, create_cron_task, update_cron_task。保留核心四件: list_tools, get_tool, start_tool, stop_tool。
- 删 cp/fs/os/path/schema/taskSchema 依赖，433→177 行。

**历史 (本日较早)**
- scanTools netstat 23次→1次+Set, 725ms→~50ms + 500ms TTL
- server.js proxy 守卫 + fetchCronState 指数退避
- index.html 删 ~30行死代码
- 新建 manifest-schema.js + 批量补齐 24 owner
- 修正 4 projectPath，删 2 孤儿 manifest
- 三骨件架构确立: `~/.claude/`, `~/.agentboard/`, `~/.scheduler/`
- Inspector 质检员独立上岗: `~/.inspector/`, port :3101

## 待定

- [ ] 独立巡检脚本（auditRuntime 已在 lib 里可用）
- [ ] phone-frame 源文件丢失，待找回

## 运行状态

- agentboard :3099
- scheduler :3100
- inspector :3101
