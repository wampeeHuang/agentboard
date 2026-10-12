---
type: diagnosis
domain: general
author: 其他
date: 2026-10-03
source: 拿"日志文件没增长"当同步卡死证据，误判一次
---

# 同步任务的日志是缓冲的：日志不涨 ≠ 卡住

## 现象

Obsidian Air Sync 点 Sync now 后，日志文件整整两分钟没新增一行、同步基线文件也没出现，
据此判定"卡死了"，还让用户去点 Rescan。而用户屏幕上进度数字一直在涨——其实一直在正常传。

## 根因

该插件的 `logger.flush()` **只在一轮同步收尾时调用**（源码：`executePlan` 结束后 `await logger.flush()`），
进行中全部留在内存 buffer ⇒ 日志文件 mtime **完全不能反映运行状态**。

## 判断"到底在不在干活"的正确办法

```bash
# 1) CPU 采样：空闲 ≈ 0.06 CPU秒/10秒；真在跑（哈希/上传）会到 ~1 CPU秒/10秒
powershell -c "(Get-Process <app>|Measure-Object CPU -Sum).Sum"   # 隔 10 秒采两次相减
# 2) 有没有活跃出网连接（注意本地代理会显示为 127.0.0.1:<proxy port>）
powershell -c "Get-NetTCPConnection -State Established | Where OwningProcess -in <pids>"
```

再有就是看**产品自己给的进度 UI**：本例状态栏 `Syncing 3/512…`，
源码 `onProgress: E => deps.onProgress(\`Syncing ${E}/${m}...\`)`——斜杠后那个数就是总任务数。

## 预防

判断长任务是否卡死，优先顺序：①产品自身的进度指示 ②进程 CPU ③网络连接，
**日志文件 mtime 排最后**——先确认它的写入策略（缓冲 / 定时 / 逐行 flush）再拿它当证据。
