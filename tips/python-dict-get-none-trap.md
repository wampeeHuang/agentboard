# Python dict.get() 链式调用 None 值陷阱

type: language-gotcha
date: 2026-07-15
source: O1 纪录片管线 compile_o1_phase03.py 解析 MiniCPM-V 评估结果

## 现象

```python
d = {"parsed": None}
result = d.get("parsed", {}).get("overall")
# AttributeError: 'NoneType' object has no attribute 'get'
```

## 根因

`dict.get(key, default)` 只在 key **不存在**时返回 default。key 存在但值为 None 时，返回 None——不触发 default。

```python
d.get("parsed", {})  # key存在，值是None → 返回 None（不是 {}）
# None.get("overall") → AttributeError
```

与直觉相反：设了 `{}` 当默认值，以为能防止 None，实际不能。

## 修复

```python
# 写1: 显式检查
parsed = d.get("parsed")
if parsed and isinstance(parsed, dict):
    return parsed.get("overall")

# 写2: or 短路
parsed = d.get("parsed") or {}
return parsed.get("overall")
```

## 预防

- JSON 解析结果（`json.loads()` 可能返回 None）赋值后用 `isinstance(x, dict)` 检查类型，不等 `get()` 链抛异常
- 代码评审时 grep `.get(` → 检查每处是否存在 key-exists-but-None 路径
