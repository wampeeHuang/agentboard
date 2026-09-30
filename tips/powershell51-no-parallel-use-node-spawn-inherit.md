---
type: method
domain: general
author: dsh-agent
date: 2026-09-28
source: 灵感墙 24 条浏览器门禁串行跑十几分钟，用户问"跑验证怎么跑这么久"
---

# 验证脚本并发跑：PowerShell 5.1 没有 -Parallel，改用 Node 驱动且子进程用 inherit

## 现象

24 条浏览器门禁（每条起一次 Playwright、加载两个页面）**串行要十几分钟**；
想并行时 `ForEach-Object -Parallel` 直接报错。

## 根因

1. 本机 `pwsh -Command` 实际是 **Windows PowerShell 5.1**（`$PSVersionTable.PSVersion` = 5.1.22621）；
   `ForEach-Object -Parallel` 是 **PowerShell 7+** 才有的参数集。
   报错是 `Parameter set cannot be resolved using the specified named parameters` ——
   **它不说"这个参数不存在"**，很容易被误读成自己语法写错了。
2. Windows 沙箱下 `child_process.spawn` 用默认 `stdio:'pipe'` 捕获别的程序输出会 EPERM；
   `stdio:'inherit'` 允许。

## 修复/步骤

写一个 Node 驱动（本项目 `_runtime/run_gates_parallel.mjs`）：

```js
import { spawn } from 'node:child_process';
const files = fs.readdirSync(here).filter(f => /^verify_.*\.mjs$/.test(f)).sort();
const limit = Number(process.argv[2]) || 6;   // 6~8 比较合适
// 维护"运行数 + 索引"的滑动窗口：
//   spawn(process.execPath, [file], { stdio: 'inherit' })
//   close 回调里只累加退出码，最后统一打印失败清单
```

要点：
- **不解析 stdout 判成败**，只看退出码（失败详情已 inherit 到终端）。
- 每条打印耗时，慢的那条一眼可见。
- 前提是这些门禁**互不共享状态**（各自起浏览器、各自打桩）—— 并发才安全。
- 效果：24 条 **十几分钟 → 45 秒**（8 并发）。

## 预防

> PowerShell 里"并行"报参数集错误 → 先 `$PSVersionTable.PSVersion`；
> 5.1 就别再折腾 `-Parallel`，直接换 Node 驱动；子进程输出用 `inherit`，不要用管道。

- 相关：`powershell-null-redirect-exitcode.md`、`cmd-nested-exit-b-masks-exit-code.md`、
  `windows-get-process-unreliable.md`
