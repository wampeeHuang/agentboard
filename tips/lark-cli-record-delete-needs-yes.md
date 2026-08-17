# lark-cli +record-delete silently fails without --yes

type: tip
date: 2026-07-16
source: O3 历史管线 Phase 04 重复记录清理

## 现象

`lark-cli base +record-delete` 不加 `--yes`，返回空响应（无 `ok` 字段也无 `error`），记录未被删除，无任何报错。脚本打印 `FAIL: ?`，无法定位问题。

## 根因

`+record-delete` 是高风险写操作，lark-cli 设计了确认机制但**静默等待**——不提示、不报错、不返回错误码，直接返回空 JSON `{}`。不加 `--yes` = 命令未执行。

## 修复

```bash
# 错误：静默失败
lark-cli base +record-delete --base-token <token> --table-id <tbl> --record-id recXXXX --as bot

# 正确：显式确认
lark-cli base +record-delete --base-token <token> --table-id <tbl> --record-id recXXXX --as bot --yes
```

## 预防

- `+record-delete` 永远加 `--yes`
- 脚本中检查返回值：`resp.get("ok")` 为 falsy 时打印完整响应体，不只是 `resp.get("error")`
- 空响应 `{}` + 记录仍在 = 缺少 `--yes`
