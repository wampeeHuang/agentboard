# push-forma.py check_forma_alive 对 404 误判

type: capability
date: 2026-07-10
source: 20260710_AI定价困局 Forma 推送

## 现象

`check_forma_alive()` 返回 True 但 POST /api/save 返回 404。端口上跑的是 gallery/"对外ID管理" 而非 Forma——两个不同 Next.js 应用争抢 3101。

## 根因

```python
except urllib.error.HTTPError as e:
    if e.code == 400:    # Forma validation → alive
        return True
    if e.code in (401, 403):
        return False
    return e.code < 500  # ← 404 < 500 = True，误判！
```

## 修复

Forma 改用 3105 端口，避免与 gallery 3101 冲突。长期应在 `check_forma_alive` 中显式处理 404。

```python
if e.code == 404:
    return False  # 路由不存在 = 不是 Forma
```

## 预防

- 启动多个 Next.js 服务时确保端口不重叠
- Forma 默认 3101 与 gallery 默认 3101 冲突是已知问题
