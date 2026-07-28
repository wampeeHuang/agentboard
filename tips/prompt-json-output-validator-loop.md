# Prompt产出结构化JSON → 独立验证器自纠正循环

type: pattern
date: 2026-07-28
source: 猫波信号站 validate_curation.py

## 现象

AI prompt 产出结构化 JSON，下游代码消费。字段约束散落在 prompt 文本里，AI 有时漏字段、有时填错格式、有时违反硬性约束。下游代码在运行时炸——找不到字段、值越界、类型错误。

## 根因

Prompt 文本中的约束**不是可执行的**。AI 可以读但可以不遵守。提示词写"标题必须 ≤80 字"——AI 可能写 85 字。提示词写"嘉宾不能填节目名"——AI 填了"AI: Ep. 224"。这些约束在 prompt 里只是建议，没有强制执行机制。

## 修复

**每个产出结构化 JSON 的 prompt，配对写一个独立验证器脚本。**

验证器脚本做三件事：
1. 读 JSON → 逐条检查所有硬性约束
2. 输出 `[OK]` / `[FAIL]` / `[WARN]` 逐项报告
3. exit 0 = 全部通过，exit 1 = 有违规

在 prompt 里写死流程：**"写 JSON → 跑验证器 → FAIL 则按报错逐条修复 → 重跑 → 直到 PASS"**。验证器就是成功标准。

```python
# 示例结构
def validate_output(filepath: Path) -> tuple[bool, list[str]]:
    data = json.loads(filepath.read_text(...))
    results = []
    all_ok = True
    for item in data["items"]:
        if len(item["title"]) > MAX_TITLE_CHARS:
            results.append(f"[FAIL] 标题超长")
            all_ok = False
    return all_ok, results
```

## 预防

新管线阶段：先写验证器，再写 prompt。验证器定义"正确"长什么样，prompt 负责达到它。不要反过来——先写 prompt 再补验证器 = 永远追不上约束漂移。

## 边界

- 验证器只检查**结构性约束**（字段存在、类型正确、范围有效）——不做语义判断
- 外部 API 校验（去重、时长）可选，加 flag 控制
- 过渡期新字段用 WARN，稳定后升级 FAIL

## 相关 tips

- `manifest-silent-drop.md` — manifest 字段静默丢失的同根问题
- `agent_format_translation_drops_fields.md` — AI format 翻译丢字段的同类症状
- `status-field-data-contract.md` — 状态字段隐含数据完整性断言
