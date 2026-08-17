# Feishu formula field returns string in API

type: reference
date: 2026-08-01
source: decheng-landing-page 定价引擎迁移 Phase 5 验证

## 现象
Python 脚本对比 Feishu API 返回的公式字段值与预期值：`1 == "1"` → `False`，所有验证断言误报为失败。

## 根因
飞书 API 中 `type: formula` 的字段，即使计算结果为数字，JSON 序列化也是**字符串**（`"3"` 而非 `3`）。普通 `type: number` 字段返回数字类型（`10` 而非 `"10"`）。两种字段混在同一张表、同一个 data 数组里，类型不一致。

## 修复
```python
def to_num(v):
    """Convert feishu value to number. Formula fields return strings."""
    v = norm(v)  # unwrap list if needed
    if v is None or v == "": return None
    try: return float(v) if '.' in str(v) else int(v)
    except: return v
```

对所有从飞书 API 读取的数值字段，不要直接 `==` 比较，先走 `to_num()`。

## 预防
写验证脚本时：接入飞书字段前先 `print(type(value), repr(value))` 确认类型。不假设飞书的类型映射和 Python 一致。
