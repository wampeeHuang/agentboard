# 数据管线下游消费方做显式字段兼容，不要求上游统一

type: method
date: 2026-07-20
source: evopearl-data 猫波驿站管线——agent 输出 JSON 用 source/score，飞书同步脚本用 source_channel/total_score

## 步骤

数据管线中不同写入阶段（agent 采集 → 人工策展 → 飞书同步 → 最终消费）可能产出不同字段名。下游消费脚本应显式声明多源兼容，不应要求上游统一命名。

```python
# 兼容读取：优先新字段，兜底旧字段
channel = c.get("source_channel") or c.get("source") or ""
total = c.get("total_score") if "total_score" in c else c.get("score", 0)
bili = c.get("bilibili_cross_check") or c.get("bilibili_cross_ref") or ""
```

三个要点：
1. **不静默吞掉差异** — 显式写出两个字段名，读者一看就知道有两个来源
2. **优先级明确** — 新字段优先、旧字段兜底，不随机
3. **不做上游归一化** — 每个写入方有自己的字段约定，消费方自己消化差异。强制上游统一 = 打破写入方的独立性，一根链上所有环节耦合

## 为什么不能用"改 agent prompt 统一字段名"

agent prompt 是软约束——LLM 可能在下次版本切换时回到旧字段名。飞书同步脚本可能是其他人维护的，改它的字段名 = 跨项目协调成本。让消费方兼容的成本最低——几行 or 链，不需要任何人配合。

## 预防
- 新管线上线时，消费脚本的字段读取一律写成兼容模式
- 兼容代码加注释标注哪个字段来自哪个写入方，防止后人误删
- JSON schema 或 TypeScript 类型定义可替代注释，但不强制——管线的写入方本身就是动态变化的
