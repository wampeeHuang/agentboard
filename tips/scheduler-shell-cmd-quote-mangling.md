# scheduler shell job 命令含引号 → cmd /d /c 路径吞噬

type: diagnosis
date: 2026-07-14
source: JSONL 冷存储迁移 cron job — `node "F:\warehouse\jsonl-archive\migrate.js"` 报 Cannot find module

## 现象
- cron job shell 类型，prompt 为 `node "带引号的路径"`
- 执行报 `Error: Cannot find module 'D:\Openclaw\"F:\warehouse\jsonl-archive\migrate.js"'`
- 错误信息里引号 `"` 出现在路径字面量中，且前面被拼上了 scheduler 的工作目录

## 根因
scheduler `runner.js` 的 `runShell()` 经过三层壳：

```
spawn('cmd', ['/d', '/c', prompt])
  → cmd.exe 解析 prompt
    → 目标命令执行
```

cmd.exe 对引号的处理与 PowerShell/Bash 不同。`node "F:\path\to\script.js"` 经 cmd /d /c 后，引号被当作路径字面量的一部分而非分隔符。Node.js 把剩余部分当相对路径，前面拼上 spawn 的 cwd。

## 修复
路径没有空格时不加引号：

```
- node "F:\warehouse\jsonl-archive\migrate.js"
+ node F:\warehouse\jsonl-archive\migrate.js
```

如果路径确实有空格（不推荐），用 PowerShell executor 而非 shell executor。

## 预防
- shell 类 cron job 的 prompt 按 cmd.exe 语法写，不是按 PowerShell 语法
- 路径一律不用引号——没有空格不需要，有空格换 PowerShell executor
- 新 shell job 上线前手动 run 一次验证，不要只看 enqueued
