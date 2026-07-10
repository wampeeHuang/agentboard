# 调度器原子写 + 归档恢复

type: architecture
date: 2026-07-10
source: BOM 污染 jobs.json → 调度器全盲事件的事后架构加固

## 问题

jobs.json 被 PowerShell 写入 BOM → JSON.parse 拒绝解析 → 18 个 cron 任务静默。修了 BOM，但根本问题没解决——任何进程都能直接写裸 JSON 文件，写入无原子性保证。

## 方案

三层防御，这次是 L2（架构层）：

**L1（已有）**：读端 BOM 剥离 — `readJsonFile()` 在 JSON.parse 前剥 U+FEFF
**L2（本次）**：原子写 + 归档恢复 — `safeWriteJson()` 保证写不坏 + `loadAllJobs()` 坏了自愈
**L3（已有）**：CLI 固化 — Agent 走 CLI → REST API，不碰文件

## L2 实现

### 原子写 (safeWriteJson)

```
① 归档当前有效文件 → _archive/jobs-{timestamp}.json
② 写 .tmp → JSON.parse 验证 → fs.rename（NTFS 原子）
③ rename 失败 → 旧文件完好，返回 error
④ 保留最近 50 份归档，超出自动删旧
```

### 读端自愈 (loadAllJobs)

```
① 读 jobs.json → JSON.parse
② parse 失败 → 列出 _archive/ 最新归档 → 解析归档
③ 归档有效 → 自动 copyFileSync 恢复到 jobs.json
④ 写 crash.log 标记 "RECOVERED from archive"
⑤ 返回恢复后的 jobs 数组
```

## 关键设计决策

- **不改存储形式**：job 定义仍用 JSON 文件，不加 SQLite。归档实现简单，效果等价
- **同一机制覆盖两进程**：scheduler.js（执行路径）+ server.js（API 路径）的 loadAllJobs 都有归档兜底
- **健康检查也走 loadAllJobs**：不再直接 readJsonFile，确保健康检查也能触发恢复

## 验证

故意注入 BOM + 无效 JSON → API 调用触发 loadAllJobs → 自动从归档恢复 → jobs.json 恢复为有效 JSON → 健康检查 pass=true → 调度器无中断

## 待做

- [ ] `cli.js restore <archive-file>` 命令 — 手动从指定归档恢复
- [ ] 飞书告警：检测到从归档恢复时通知
