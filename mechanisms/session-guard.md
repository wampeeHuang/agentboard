# Session Guard

## 是什么

每次 Claude Code SessionStart 自动启动一个 detached guard 进程，监控 claude.exe 退出事件。退出时记录诊断信息（退出码、网络状态、其他存活 session），然后清理孤儿进程树。

## 为什么有

多个 Claude Code 会话同时死亡——一个退出会牵连另一个。guard 确保每个 session 退出后：
1. 有诊断数据（不再靠猜）
2. 孤儿子进程被清理（不残留）

## 文件位置

```
~/.claude/
  hooks/
    session-guard-launcher.ps1   ← SessionStart 触发，启动 guard
    session-guard.ps1             ← guard 主脚本（由 launcher 调用，detached）
  _runtime/
    session-guard.log             ← 诊断日志，自轮转 500 行
    guard-{claudePid}.pid         ← guard 进程 ID 文件，自清理
  settings.json                   ← hooks.SessionStart 注册
```

## 关键设计

### 反堆叠

SessionStart 可能多次触发（模型切换、重连），但 Claude 进程 PID 不变。Launcher 用 `guard-{claudePid}.pid` 文件做互斥锁——同 PID 已有 guard → 先杀旧 → 再启新。

### 深度限制

Guard 需要从自身进程向上找 claude.exe 祖先。限制 5 层——找不到就报错退出，不上溯到错误祖先。

### 生命周期

```
SessionStart
  → 日志轮转（>500 行 → 保留最近 500）
  → 清僵尸 PID（guard 进程已死的 pid 文件）
  → 反堆叠（杀同 PID 旧 guard）
  → 启动新 guard（detached，写 pid 文件）
  → guard 等 claude 退出
    → 记退出码 + 时间（毫秒精度）
    → 诊断：其他 claude 存活数
    → 诊断：api.deepseek.com 网络可达性
    → 等 3 秒（让 Stop hook 先跑完）
    → 杀孤儿进程树
    → 清 pid 文件
    → guard 退出
```

### Crash 诊断

Guard 在 Claude 退出后自动记录三段：

| 诊断项 | 说明 |
|--------|------|
| 退出码 | 0=正常退出，1=错误，unknown=外部杀死 |
| 其他 claude 存活 | 数量 + PID + 启动时间 + 内存占用 |
| 网络 | api.deepseek.com 可达性 |

根因仍有未确认的假设（手机热点断连），诊断数据下次 crash 时给出证据。

## 什么时候看

Session 异常退出时查 `~/.claude/_runtime/session-guard.log`。

## 与其他 hook 的关系

| Hook | 脚本 | 窗口 |
|------|------|------|
| SessionStart | caveman-activate.js | Hidden |
| SessionStart | session-guard-launcher.ps1 → guard.ps1 | Hidden（detached） |
| PreToolUse | checkpoint.js → 写 `CHECKPOINT.md` | Hidden |
| UserPromptSubmit | caveman-mode-tracker.js | Hidden |
| Stop | cleanup-session-debris.sh | Hidden |

所有 hook 命令外层包裹 `powershell -WindowStyle Hidden -Command "..."`。node.exe 是 console subsystem，不包会弹出可见终端窗口。

---

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Code Session                          │
│                                                                  │
│  settings.json ──────────────────────────────────────────────┐  │
│  │ hooks.SessionStart                                         │  │
│  │   ├─ caveman-activate.js (Hidden)                          │  │
│  │   └─ session-guard-launcher.ps1 (Hidden) ──┐               │  │
│  │ hooks.PreToolUse                            │               │  │
│  │   └─ checkpoint.js → CHECKPOINT.md (Hidden) │               │  │
│  │ hooks.UserPromptSubmit                      │               │  │
│  │   └─ caveman-mode-tracker.js (Hidden)       │               │  │
│  │ hooks.Stop                                  │               │  │
│  │   └─ cleanup-session-debris.sh (Hidden)     │               │  │
│  └─────────────────────────────────────────────┘               │  │
│                                                                  │  │
└──────────────────────────────────────────────────────────────────┘  │
                                                                       │
                          ┌────────────────────────────────────────────┘
                          ▼
              ┌──────────────────────┐
              │  session-guard-      │
              │  launcher.ps1        │
              │                      │
              │  ① 日志轮转 (500行)  │
              │  ② 清僵尸 PID        │
              │  ③ 反堆叠 (杀旧guard)│
              │  ④ 启动新 guard      │
              │  ⑤ 写 PID 文件       │
              └──────┬───────────────┘
                     │ Start-Process -WindowStyle Hidden (detached)
                     ▼
              ┌──────────────────────┐
              │  session-guard.ps1   │
              │  watch: Claude PID   │
              │                      │
              │  ① WaitForExit()     │
              │  ② 记退出码+时间     │
              │  ③ 诊断: 其他claude  │
              │  ④ 诊断: 网络可达性  │
              │  ⑤ sleep 3s          │
              │  ⑥ Kill-Tree()       │
              │  ⑦ 清 PID 文件       │
              └──────────────────────┘

                      ░░░░░░░░░░░░░░
                      ░ _runtime/    ░
                      ░              ░
                      ░ session-     ░
                      ░ guard.log    ░  ← 查这里
                      ░              ░
                      ░ guard-{pid}. ░  ← 自清理
                      ░ pid          ░
                      ░░░░░░░░░░░░░░░░
```

## 维护指南

- **Guard 脚本改了**：下次 SessionStart 生效（新 guard 被 launcher 启动）
- **settings.json hook 命令改了**：下次 Claude Code 启动生效
- **Guard 没启动**：查 `_runtime/session-guard.log` → `[launcher]` 行
- **Guard 启动了但诊断不完整**：查 guard 部分日志 → `[guard-{pid}]` 行
