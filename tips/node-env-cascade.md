---
type: diagnosis
date: 2026-07-10
source: supervisor 管理的 Next.js 服务 (forma) 因 NODE_ENV=production 退出
---

# NODE_ENV=production 进程传染链

## 现象
supervisor spawn 的 Next.js 服务启动后立即退出，stderr 显示：
```
⚠ You are using a non-standard "NODE_ENV" value in your environment.
```

## 根因
NODE_ENV=production 的传染链：
```
Claude Code 进程 (NODE_ENV=production)
  → PowerShell (继承 Process 级环境变量)
    → Start-Process -FilePath node ... (继承)
      → supervisor.js (process.env.NODE_ENV === 'production')
        → spawn(..., {env: process.env}) (继承)
          → forma (Next.js) → 检测到非标准 NODE_ENV → 退出
```

`[Environment]::GetEnvironmentVariable('NODE_ENV', 'Process')` = `production`，不在 User/Machine 级别，是 Claude Code 进程注入的。

## 修复
supervisor spawn 前清掉 NODE_ENV：

```javascript
let env = { ...process.env };
if (env.NODE_ENV) { env.NODE_ENV = ''; }
```

不删 `NODE_ENV` 变量本身（某些工具检查 `typeof process.env.NODE_ENV !== 'undefined'`），只清值为空字符串。

## 预防
- 任何 spawn 子进程的管理程序（supervisor/pm2/gateway），spawn 前检查并清理 NODE_ENV
- 不在 User/Machine 级环境变量设 NODE_ENV——会污染所有 Node.js 进程
- 需要 production 模式的进程自己设，不需要的继承父进程会踩坑
