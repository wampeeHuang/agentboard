---
type: method
date: 2026-07-16
source: O3 历史管线 Phase 04 飞书回填
---

# lark-cli +record-upsert without --record-id creates new records, not upsert

## 现象

`lark-cli base +record-upsert` 不加 `--record-id`，期望按 Slug（业务键）自动匹配已有记录并更新。实际行为：每次都创建新记录。18 条回填产生了 18 条重复（总共 36 条）。

## 根因

命令名叫 "upsert" 但语义是：
- **不加 `--record-id`** → 创建新记录（insert only）
- **加 `--record-id`** → 更新指定记录（update only）

没有"按业务键自动匹配"的逻辑。`Slug` 是自定义 text 字段，lark-cli 不会把它当唯一键。

## 修复

```bash
# 错误：创建新记录
lark-cli base +record-upsert --base-token <token> --table-id <tbl> --json '{"Slug":"ARTE","总分":85}' --as bot

# 正确：更新已有记录
lark-cli base +record-upsert --base-token <token> --table-id <tbl> --record-id recXXXX --json '{"总分":85}' --as bot
```

批量操作前先 `+record-list` 获取所有 `record_id`，建立 Slug→record_id 映射，然后显式传 `--record-id`。

## 预防

- 所有 `+record-upsert` 调用必须带 `--record-id`，不存在不带此参数的"智能匹配"
- 批量写入新表（无已有记录）时用 `+record-upsert`（不加 `--record-id`）= create；更新已有表时必须映射 record_id
- 首次回填后运行 `+record-list` 做 count 校验，发现记录数翻倍立即排查
