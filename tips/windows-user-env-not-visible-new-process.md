# Windows User 级环境变量设置后新终端看不到——所有 Claude Code 会话集体失 auth

type: diagnosis
date: 2026-06-27
source: 将 ANTHROPIC_AUTH_TOKEN 从 settings.json 移到 User 级环境变量后，除当前会话外所有新会话报 "Not logged in"

## 现象
`[Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", "sk-...", "User")` 执行成功。注册表里能读到，`[Environment]::GetEnvironmentVariable(..., "User")` 返回正确的值。但同一个终端里开的新 Claude Code 会话全部 "Not logged in"，发不出 API 请求。只有当时已在运行的会话存活。

## 根因
`[Environment]::SetEnvironmentVariable("User")` 写的是 `HKCU\Environment` 注册表键，**不广播 `WM_SETTINGCHANGE`**。已运行的进程（包括终端模拟器 Windows Terminal / ConEmu 等）持有启动时的环境块快照，不会主动重读注册表。

终端里开新 Tab/窗口 → 子进程继承终端的旧环境 → 看不到新变量。

Claude Code 把 `settings.json` 里的 `env` 字段注入进程环境。我们把它从那里删了，新进程既没有 settings.json 里的值、也没有继承到的环境变量——两条路全断。

当前会话存活的原因：它在 token 删除前启动，进程环境里已有 token。

## 修复/步骤
1. **回退**：把 token 放回 `settings.json` → `env` 段（立即可用）
2. **根治**（选一个）：
   - 彻底退出终端程序（关所有窗口），重新打开 → 新进程从注册表读到 env var → 验证 `echo $env:ANTHROPIC_AUTH_TOKEN` 有值 → 再从 settings.json 删掉
   - 注销/重登 Windows → 同上验证 → 再删
3. **验证**：删 settings.json 里的 token 后，打开一个**全新终端**跑 `claude`，确认不报 "Not logged in"，确认能正常对话一轮

## 预防
- Windows 上迁移凭据到 User 级环境变量后，**必须先在新终端验证可读**，再删 settings.json 里的备份
- 迁移验证流程：改 env var → 关掉当前终端 → 开全新终端 → `$env:VAR_NAME` 确认有值 → 启动 Claude Code 确认能用 → 最后删 settings.json 里的值
- 敏感凭据如果一定要保留在 settings.json，至少确保 `.gitignore` 里排除 `settings.json`
