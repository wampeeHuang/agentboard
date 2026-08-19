---
type: method
date: 2026-07-16
source: O3 历史管线 Phase 04 飞书回填
---

# lark-cli select 字段在 number+select 混合 payload 中可能不生效

## 现象

一次 `+record-upsert` 同时传 number 字段（总分、内容适配、字幕友好、版权安全、供给缺口、更新稳定）和 select 字段（状态=入池、分级=入池），number 字段全部更新成功，但 `分级` 字段保持 `None`。help 文档写 select 值传字符串 `"Todo"`，但 API 响应中 select 值以数组形式返回。

## 根因

`lark-cli` 在单次 upsert 中混合 number 和 select 类型时，select 字段可能被静默跳过。具体触发条件未完全确定，但拆分调用后问题消失。

## 修复

```bash
# 错误：混合 number + select，select 可能不生效
lark-cli base +record-upsert --record-id recXXXX --json '{"总分":85,"状态":"入池"}' --as bot

# 正确：分两次调用，select 字段单独传
lark-cli base +record-upsert --record-id recXXXX --json '{"总分":85,"内容适配":25}' --as bot
lark-cli base +record-upsert --record-id recXXXX --json '{"状态":"入池"}' --as bot
```

## 预防

- 敏感 select 字段（分级、状态、版权等级）单独 upsert，不和 number 字段混传
- 回填后抽样验证：用 `+record-list` 检查目标字段是否确实写入
- help 文档写 select 传字符串 `"Todo"`，但实际 API 类型可能不匹配——以实测为准
