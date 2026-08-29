---
type: diagnosis
date: 2026-08-19
source: 猫波信号站 生产 cron 任务
---

# PowerShell 5.1 `2>$null` 污染 native 命令退出码

## 现象
cron shell 任务跑完，管线 stdout 显示全部成功（`ALL CHECKS PASSED`、`SUMMARY: 3 completed, 0 failed`），但调度器判 failed。`lastError` 只显示笼统的 `failed`，stderr 空，看不到真错误。连续失败 5 次。

## 根因
PowerShell 5.1 的退出码污染。生产任务 prompt 用 `2>$null` 重定向 python 的 stderr，而 python 运行时往 stderr 写了 `DeprecationWarning`。PS 5.1 遇到「native 命令写 stderr + 被 `2>$null` 重定向」组合，把进程退出码从真实的 0 污染成 1。调度器 `runner.js` 按 `code === 0` 判 success，收到 1 就判 failed。stderr 又被 `2>$null` 吞掉，错误无痕。

实测（PS 5.1）：
- `python 写stderr + exit 0` 无重定向 → 退出码 **0**（正确）
- `python 写stderr + exit 0` 加 `2>$null` → 退出码 **1**（污染）
- `python 写stderr + exit 0` 加 `2>&1` → 退出码 **1**（污染）

## 修复
架构收敛：编排逻辑从 PowerShell prompt 挪进 Python 入口脚本 `run_production.py`，cron prompt 只做单行转发：

```
powershell -NoProfile -Command "python D:\workspace\...\scripts\run_production.py"
```

Python 侧 `subprocess.run(cmd)` 不捕获输出（stderr 自然继承、不静默失败），退出码透传。PowerShell 不再做任何重定向/if 分支/`$LASTEXITCODE` 判断，彻底避开污染坑。

## 预防
- cron shell 任务里**禁止 `2>$null` 吞 native 命令的 stderr**——既静默失败，又触发 PS 5.1 退出码污染
- 复杂编排逻辑（多步、退出码判断、重定向）收敛到脚本文件（.py/.ps1），不写进 jobs.json 的 prompt 字符串——字符串里的逻辑无法测试、无法版本控制
- stderr 是唯一错误可见渠道，吞掉 = 失败无痕，违反「禁止静默失败」
