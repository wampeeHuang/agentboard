# 长管线 cron 拆 agentTurn + shell，不靠 LLM 跑全程

type: method
date: 2026-07-02
source: 猫波信号站 cron 管线两次静默失败，DeepSeek 3000+ 字 prompt 上下文耗尽截断 Stage B+C

## 现象
cron job 配了一个 3000+ 字的 agentTurn prompt，包含三个完整阶段。agent 跑完第一阶段后干净退出（exit 0，stderr 空），后续阶段从未执行。file 验证只能发现"最终产出缺失"触发重试，但不能阻止截断发生。

## 根因
agentTurn 的本质是 Claude Code 收到 prompt 然后自主执行。DeepSeek v4-pro 的上下文在 Stage A（35 个 YouTube 频道扫描 + 飞书 API 调用 + B站交叉检索）就耗尽了。模型不是报错，而是"说完第一阶段就闭嘴"。exit 0，stdout 有内容，但管线实际上只跑了 1/3。

## 修复：拆成两个 job，链式触发

```
旧: 1 个 agentTurn → agent 跑 A + B + C（上下文不够）
新: 2 个 job 串行
  Job A (agentTurn): 选题 → _curation/YYYY-MM-DD.json
  Job B (shell):     python orchestrator.py --date today
```

**Job A (agentTurn)** — prompt 只含 Stage A（选题巡检）。产出是单个 JSON 文件。轻量，上下文够用。

**Job B (shell)** — `payload.kind: "shell"`，不经过 LLM。scheduler 直接 `spawn()` 命令，run orchestrator.py 逐候选跑 pipeline → metadata → cover → epub → publish_panel → validate → 飞书更新 → status_board。shell 没有上下文窗口、没有截断、没有模型幻觉。

关键：scheduler 的链式触发（一个 job 成功后 30s 触发下一个）或 cron 时间差（A 09:00 → B 10:30）都能实现串行。

## 适用场景

任何满足以下条件的 cron agentTurn job：
- prompt > 1500 字
- 包含多阶段工作流
- 部分阶段是纯机械执行（不需要 AI 判断）

拆法：
1. 识别哪部分需要 AI（选题判断、语义理解）→ agentTurn
2. 识别哪部分是机械执行（跑脚本、调 API、生成文件）→ shell
3. agentTurn 产出结构化中间文件（JSON）
4. shell 读中间文件，逐条机械执行

## Scheduler shell job 注册要点

- executor: "shell"
- 必须同时填 `prompt` 和 `command`（API 校验两者都查）
- timeout_sec: 给足余量（视频渲染等长任务按候选数 × 单候选最长时间估算）
- output_kind: "file" → 指向最终产出文件，用于验证
