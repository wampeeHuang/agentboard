# ACE Step LM 歌词前几句被吃掉：必须加诱饵行
type: method
date: 2026-06-29
source: 国宝主题曲生成，迭代 5+ 轮发现 LM 1.7B 固定吃掉前 5-7 行歌词

## 现象
歌词粘贴进去、AI Format 没用、Duration 从 150 压到 80、CFG Scale 拉到 3.0 — 但 5Hz LM 生成时仍然从**第 5-7 行**开始唱。前面整段被跳过（约 20-30 秒前奏后开口，第一段没了）。

## 根因
1.7B 的 5Hz Language Model 在生成 DiT 条件序列时，会预留固定长度的"氛围建立段"（intro buildup），这段时间不分配人声 token。无论歌词多短、参数多激进，这个行为不变 — 是模型的结构性偏差，不是 bug。

- 代码层面：LM 在 CoT 阶段规划的音乐结构会给 intro 预留固定帧数，前几句歌词对应的码被 intro 的"静音/器乐"码覆盖
- 参数层面：Duration 缩短只能压缩整体窗口，但不能消除 intro 占比
- 模型层面：这是 1.7B 的学习行为 — 训练数据中大部分音乐有前奏，模型学到了"前几句=器乐引入"

## 修复/步骤
**在歌词最前面加 2-3 行无意义的"诱饵"**：

```
啊～
啊～
断梭三年无人望
残谱半卷入旧箱
...
```

诱饵被 LM 吃掉当 intro，真正歌词从第 3 行开始安全。诱饵字符不计入有效歌词字数统计。

配套参数（RTX 5060 Ti 16GB，turbo 模型）：
- Duration: 100s
- LM CFG Scale: 3.0
- LM Backend: PT（VLLM 在 Blackwell 上有数值偏差）
- Inference Steps: 20（turbo 上限）
- **不要点 AI Format 优化歌词** — LM 会自动加回 `[Intro]` `[Verse]` 等标记，加剧问题

## 预防
每次写 ACE Step 歌词时预留 2-3 行顶头诱饵。歌词字数统计从真正的第一行开始，不包含诱饵。

## 相关
- 歌词总字数控制在 **150 字以内**（诱饵不算），超了 5Hz LM 上下文截断
- `~/.agentboard/tools/ace-step/manifest.json` — LM Backend PT 的 agent_notes
