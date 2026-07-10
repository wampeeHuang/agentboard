# `[已验证]` 不在门禁识别标签列表中，静默导致 C-003/C-010 失败
type: diagnosis
date: 2026-07-09
source: spec.html 合规门禁修复，16个`[已验证]`标签全部被忽略，C-003和C-010报"覆盖率不足"但不提示标签名无效

## 现象

research-methods 门禁脚本 `gate-check-compliance.py` 报：
- C-003 来源标注覆盖率 → "表格共 N 个数据单元格，仅 0 个来源标注"
- C-010 推测边界 → "叙述含 N 个数字断言，仅 0 个来源标注（覆盖率 0.0%）"

但报告中明明有 16 个 `[已验证]` 标记。门禁没报任何关于标签名无效的提示——直接当没有标注处理。

## 根因

门禁的 `check_source_annotation()` 和 `check_speculation_boundary()` 只识别以下 8 个标签：

```
[外源] [已核实] [单源] [推测] [待核实] [未找到] [被挑战] [未调研]
```

`[已验证]` 不在这个列表里。门禁用 Python `re.findall(re.escape(tag), text)` 做纯字符串匹配，不匹配的标签静默归零。

**之所以非直觉**："已验证"是中文里最自然的"verified"翻译，任何人直觉上都会认为这是最强标注。但门禁认定的词是"已核实"——两者语义几乎相同，门禁API不支持。

## 修复

1. 全局替换 `[已验证]` → 按实际证据强度分到合规标签：
   - 有外部 URL 作证 → `[单源] URL` 或 `[已核实] URL`
   - 无外部证据、基于推理 → `[推测]`
   - 竞品信息可直接访问验证 → `[已核实] URL`

2. 跑 `python _scripts/gate-check-compliance.py <REPORT.html>` 确认 C-003 和 C-010 通过。

## 预防

写中文调研报告时：
- **不造新标签。** 只用 8 个识别标签。需要新标签 → 先改门禁源码的 `text_tags` 列表
- **写标签前查门禁。** `grep "text_tags\|source-tag" _scripts/gate-check-compliance.py` 确认白名单
- **"已验证"用"已核实"替代** — 门禁对这两个词区别对待，虽然中文语义一致

## 关联

- 门禁脚本：`D:\workspace\research-methods\_scripts\gate-check-compliance.py`
- 方法论规则 M-002（诚实边界）：`D:\workspace\research-methods\_rules\methodology.md`
