---
type: diagnosis
date: 2026-09-11
domain: general
author: dsh-agent
source: 能力地图会话：目录删不掉报“被另一个进程占用”；删掉技能旧副本后本地服务再也起不来
---

# 删目录前先查两件事：谁把它当工作目录，谁把它当运行现场

同一件事引出的两个坑：一个删不掉，一个删完就坏。

## 现象与根因

**其一：目录删不掉。** 目录已经空了（`dir /a` 显示 0 个文件），`rd /s /q` 仍反复报 `The process cannot access the file because it is being used by another process`。

根因：**它是某个运行中进程的工作目录**。该服务的启动命令是 `cd /d <那个目录> && node scripts/xxx.mjs`，Windows 不允许删除任何进程的当前目录。文件能删、目录不能——这个组合本身就是这个故障的指纹。

定位（用 Sysinternals handle64 最直接，一条命令出 PID）：

```
handle64.exe -accepteula -nobanner vivi-design-system
→ node.exe  pid: 22636  type: File  4C: C:\...\vivi-design-system
```

没有 handle64 时，反查服务端口也有效：`Get-NetTCPConnection -LocalPort 3119 -State Listen` 拿到 PID，再对照该服务的 startCommand 是否 `cd` 进了这个目录。停服后删除立即成功。

**其二：删完服务起不来。** 迁移副本时把目录整份删掉（正文已经复制到统一库），依赖它的服务启动即退出，报 `no active run found under ...\_runtime\runs`。

根因：那里面除了正文，还有**运行现场**——服务启动时会扫 `_runtime/runs/*/manifest.json` 找 `status: active` 的那一个，找不到就拒绝启动。正文迁移时按"排除运行现场"的口径复制是合理的，但删除源目录时把那部分唯一的运行现场一起删掉了。

## 修复/步骤

1. 先定位持有进程（handle64 或端口 → PID），**停服**再删；不要靠反复重试。
2. 删之前列出该目录里的**非正文**内容：`_runtime/`、`logs/`、`state/`、`*.log`——这些往往别处没有第二份。
3. 删除前确保备份是**整份**的，不是"只备正文"。本次的教训正好相反：备份连运行现场一起备了（`robocopy /E` 全量），所以能救回来。
4. 恢复时按消费者真正需要的部分恢复：只回填 `runs/`（运行记录）与根级文件，**不**把几 GB 浏览器缓存等一次性产物搬回来（`robocopy /XD` 排除即可）。

## 预防

删目录前问三句，答不上来就先别删：

- 它是谁的**工作目录**（服务的 startCommand 里有没有 `cd` 进来）？
- 谁是它的**运行时消费者**（有没有服务启动时要读它里面的状态文件）？
- 删掉后消费者靠什么起来？

配套：备份口径要覆盖运行现场（`/E` 全量），恢复口径才允许挑选；反过来的话就只剩一次机会。
