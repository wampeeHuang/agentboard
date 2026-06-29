# ACESTEP_INIT_LLM=auto 不生效：env_bool 不认 "auto"
type: diagnosis
date: 2026-06-29
source: ACE Step 引擎启动，AI Format 报 500，追踪发现 LLM 未初始化

## 现象
`.env` 设 `ACESTEP_INIT_LLM=auto`，引擎启动后 LLM 未加载。调用 `/format_input` 时报 LLM not initialized。日志显示 "Server is ready to accept requests (models not loaded yet)"。

## 根因
`acestep/api/server_utils.py` 的 `env_bool()` 函数只认 `{1, true, yes, y, on}`，其余值一律返回 False：

```python
def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}
```

`"auto"` 不在白名单 → False → LLM 不初始化。

## 修复
`.env` 中把 `ACESTEP_INIT_LLM=auto` 改成 `ACESTEP_INIT_LLM=true`。

## 预防
ACE Step 的 `.env` 布尔类配置只用 `true` 或 `false`。不要用 `auto`、`1`、`enable` 等任何其他写法。
