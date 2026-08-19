---
type: diagnosis
date: 2026-07-14
source: cross-border-arbitrage O2 素材筛选 · Roommy 案例
---

# MiniCPM-V 结构化评估的矛盾检测

## 现象

MiniCPM-V 对同一张截图做 F1-F4 四维结构化评估时，四条维度全部通过（F1=decent, F2=indoor, F3=yes, F4=Japanese Nordic style），但 `overall_assessment: "FAIL_at_least_1"`。模型说每条都过了，总判却说至少一条没过——自相矛盾。

## 根因

LLM 的 overall 判断和维度评分是两条独立推理路径，不是对维度评分的汇总计算。模型在生成 overall 字段时可能"忘了"自己刚给的维度评分，或对不同字段施加了不一致的判断标准。这不是 MiniCPM-V 独有的问题——任何让模型同时产出维度分数 + 总判的结构化 prompt 都可能触发。

## 修复

每次收到结构化评估结果后，对维度做布尔化交叉校验：

```python
f1_ok = any(x in str(f1).lower() for x in ['professional', 'decent'])
f2_ok = 'indoor' in str(f2).lower()
f3_ok = any(x in str(f3).lower() for x in ['yes', 'likely_edited', 'likely'])
f4_ok = any(x in str(f4).lower() for x in ['yes:', 'yes_other']) or \
        (f4 and 'no_generic' not in str(f4).lower() and f4 not in ('','?'))

if 'FAIL' in overall and f1_ok and f2_ok and f3_ok and f4_ok:
    # 矛盾：四维全过但总判FAIL → 人工复核
    tag_as_contradiction()
```

对矛盾案例：标记为人工复核而非静默改写，附可见注释说明矛盾原因。不要让"数据干净"掩盖模型的不确定性。

## 预防

- 结构化评估 prompt 中显式要求：overall 必须等于各维度的 AND 结果
- 或者：不要求模型产 overall，由代码根据各维度评分计算
- 3 次以上同模式矛盾 → 降低该维度对模型的依赖，改用代码规则判定
