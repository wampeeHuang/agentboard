---
type: diagnosis
date: 2026-10-02
domain: general
author: workbuddy
source: 灵感图库 2026-10-02：工具架起的实例所有保存失败（[WinError 5]），排查两轮后由"重启守护链"解决
---

# Supervisor 若被起在受限容器里，它 spawn 的每个服务都改不了已存在的文件

## 现象
- 工具架起出来的**常驻服务**所有保存失败：改已有文件报 `[WinError 5] 拒绝访问` / `[Errno 13]`，
  但**新建文件成功、读也成功**。重启服务、换解释器都没用。
- 同一文件、同一时刻，从**外部进程**（同用户同终端）`os.replace` **却成功** ⇒ 文件没被占、ACL 也没问题。
- 两个误导信号：服务自报 `sandbox: false`；重试预算调大后"看起来有反应"（其实治的是另一类故障）。

## 根因
- 服务是被 **Supervisor**（`~/.supervisor/supervisor.js`，`:3097`）spawn 的，而 Supervisor 自身被起在
  **受限容器**里；容器限制**沿进程树继承**，于是它 spawn 的每个服务都**改不了「已存在」的文件**。
- 它**在令牌上看不出来**（实测已排除）：完整性级别（服务/Supervisor/agentboard 全是 Medium）、
  受限 SID、AppContainer、文件 ACL 与只读属性、安全删除 shim（只钩删除类 API，**不碰 `os.replace`**；
  把 shim 激活后 `os.replace` 仍原生成功）、解释器（3.11/3.13 都能替换）、第三方持有句柄。
- 唯一判据：**同一时刻、同一文件，外部进程全成功而服务全失败**（+ 1 秒后重试仍失败 ⇒ 不是瞬时锁）。

## 修复/步骤
1. 拿现场取证再动手：服务侧失败会自动落 `%TEMP%\iw-atomic-failure-*.json`，
   含 `open_rb / open_r+b / open_ab / retry_after_1s`（本仓 `src/ai_services.py::_forensics`）。
   判读：`open_rb=ok` + 写模式全拒绝 + `retry_after_1s=仍拒绝` ⇒ 就是这个病。
2. **重启守护链**：在不被限制的终端里重启 `~/.supervisor/supervisor.js`（别从 agent 会话里起它）。
   约 1 分钟把 40 个服务里 `autoStart=true` 的 14 个拉回来。
3. ⚠ **换血后必须显式 `stop` + `start` 目标服务**：老实例会在 Supervisor 被杀后**存活**、
   被新 Supervisor「adopt as running」（日志原话），端口上仍是旧的受限进程 —— 不重启就看不出变化。
4. 兜底：`cd <repo> && nohup python scripts/serve.py > _runtime/serve-unsandboxed.log 2>&1 &`。

## 预防
- **宿主/守护进程的启动上下文会被所有子进程继承**：「某个服务写不了文件」的根因可能在**启动它的那条链**上，
  先查链，别急着改那个服务。
- **先归类再修**：`能新建、不能改已有` ⇒ 先怀疑进程容器；`改什么都失败` ⇒ 先怀疑权限模型；
  `1 秒后重试成功` ⇒ 才是瞬时锁。三类的出路完全不同，**加预算治不了前两类**。
- 排查记录要写**已排除项 + 判据**，不要只写结论 —— 否则下一个人会把令牌/ACL/shim/句柄再查一遍。
