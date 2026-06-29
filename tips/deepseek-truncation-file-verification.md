# DeepSeek v4-pro 长管线截断 + file 模式验证修复

type: diagnostic + fix
date: 2026-06-29
source: 猫波信号站 cron job 只跑阶段 A 不跑阶段 B/C

## 现象
cron job 的 agent 跑完阶段 A（选题巡检）后干净退出（exit 0，stderr 空），阶段 B/C 从未执行。stdout 最后一行是"现在进入阶段B..."的声明，之后无输出。调度器 stdout 验证通过（894 bytes > 0），判为成功。

## 根因
DeepSeek v4-pro 在处理超长多阶段 prompt 时会在阶段边界截断输出。模型不是报错退出，而是"说完阶段 A 就闭嘴了"。stdout 验证（`stat.size > 0`）对这种部分完成完全盲视。

## 修复
把 output_kind 从 `stdout` 改为 `file`，指向管线最终阶段必须产出的文件：
1. scheduler 在 agent 启动前 `fs.unlinkSync(targetPath)` 删除目标文件
2. agent 退出后 `verifyOutput()` 检查文件是否重生
3. 文件不存在 → `output_missing` → 自动重试（最多 3 次/窗口）

核心理念：**不信任模型输出内容，只信任可验证的产出文件。** 每个阶段产生文件后才进入下一阶段，最终阶段文件 = 管线完成证明。

## 依赖
- scheduler.js 已有 file 模式验证（`verifyOutput` 函数）
- job 的 `output.kind: "file"` + `output.path` 指向阶段 C 产出
- prompt 中明确声明"产出文件不存在 = 阶段未完成 = 必须重跑"

## 适用范围
任何多阶段 cron agent 任务。不止 DeepSeek，任何模型都可能中途截断。file 模式是通用的管道完整性保障。
