# 飞书多维表格日期字段格式陷阱

type: capability
date: 2026-07-15
source: 猫波信号站状态面板 录入/日期列全显示"-"

## 现象
`gen_status_board.py` 读飞书 bitable 的日期字段（`录入时间`、`视频发布日期`），显示到 HTML 面板时全部变成 `-`。

## 根因
飞书 bitable 日期字段通过 API (`lark-cli base +record-list`) 返回的是字符串 `"2025-04-10 00:00:00"`，**不是毫秒时间戳**。

原代码 `_fmt_ts()` 用 `int(ms_val) / 1000` 解析 —— `int("2025-04-10 00:00:00")` 直接 ValueError，异常被吞，返回 `"-"`。

## 修复
日期解析函数需同时处理两种格式：
1. 飞书字符串 `"YYYY-MM-DD HH:MM:SS"` → 取前10位
2. 毫秒时间戳 → `datetime.fromtimestamp(int(ms) / 1000)`（兼容旧数据）

## 预防
写任何读飞书 bitable 的 Python 代码时，不要假设日期字段是数字。始终用字符串解析兜底。
