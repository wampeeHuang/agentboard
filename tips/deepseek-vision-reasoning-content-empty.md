---
type: diagnosis
date: 2026-08-21
source: vivi-harness 首页截图用 DeepSeek vision API 校验文本截断；2026-08-26 supervisor 全景图密集图 reasoning 螺旋（max_tokens 2000/4000/12000 三次全 finish=length）
---

# DeepSeek vision API content 为空但 exit 0：分析全在 reasoning_content

## 现象
调 DeepSeek vision API（`/chat/completions`，模型 `deepseek-v4-flash-vision-exp`）验截图，HTTP 返回正常、exit 0，但解析出的 `content` 字段是空的——看似"调用成功"，实际没有任何视觉结论。

## 根因
DeepSeek 系模型会把完整分析先写进 `reasoning_content`。当 `max_tokens` 设得太低（几百），模型把预算全花在 reasoning 上，`content` 字段空手而归——不报错、不失败，静默产出空结果。

## 修复/步骤
1. `max_tokens` 设 ≥1500，别省。
2. 解析时同时读 `content` 与 `reasoning_content` 两个字段，哪个有内容用哪个。
3. 返回前 assert：两个字段都为空才算失败，不能只信 `content`。

```python
r = requests.post(url, headers=headers, json={...}, timeout=60).json()
text = r["choices"][0]["message"].get("content") or r["choices"][0]["message"].get("reasoning_content")
assert text, f"vision 返回空: {r}"
```

## 预防
- 用 DeepSeek 类模型（输出分 reasoning/content 两段）时，任何"调用成功但结果空"先查 reasoning_content。
- exit 0 / HTTP 200 ≠ 有结果。与 `cron-run-ok-means-nothing` 同源：成功码不可信，看产物。

## 变体：密集图 reasoning 螺旋，max_tokens 拉满也出不来

**现象**：一张全景架构图（几十个 text+rect 节点）验证文字遮挡，3 次调用（max_tokens 2000/4000/12000）全部 `finish=length`、`content` 空，`reasoning_content` 一路涨到 19629 tokens 还在自我分析，永不收敛。

**根因**：reasoning 模型在信息密度高的图上一旦开始"逐块核对"，没有停止条件——它一直在想，`content` 永远轮不到。这不是 max_tokens 不够，是**该问题类型不该走视觉 LLM**。

**判定**：`finish=length` + reasoning_content 持续膨胀 = 死循环。第 1 次就该止损，第 2 次是确认，没有第 3 次。

**对策**：
- 密集图 / 精确布局问题（遮挡、对齐、像素级错位）→ 不走视觉 LLM，走**确定性几何**：DOM `getBBox()` + 绘制顺序模拟（后画的盖先画的）。见 `svg-paint-order-covers-labels.md`。
- 视觉 LLM 只适合粗粒度判断：整体氛围、有无明显缺块、"这图大概长什么样"。不做逐元素精确核对。
