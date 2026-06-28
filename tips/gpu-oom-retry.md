# GPU 工具不声明 conflicts，靠 OOM 重试
type: method
date: 2026-06-28
source: 部署 Confucius4-TTS 时讨论 GPU 工具冲突管理方案

## 现象

工具架 manifest 的 `conflicts` 字段靠人手工声明哪些 GPU 工具不能同时跑。声明的依据是"预估显存占用"，但实际占用因模型/输入而异。写保守了浪费显存，写错了 OOM。

## 根因

人预测不了 GPU 的真实显存分配。`conflicts` 是对硬件的软件层猜测——硬件（CUDA）自己知道还剩多少显存，会在分配失败时抛 `OutOfMemoryError`。OOM 不是 bug，是自然反压信号。

## 方法

**不声明 conflicts，不建调度队列。跑就是了，OOM 就重试。**

```python
import time, torch

def _oom_retry(fn, *args, max_retries=3, **kwargs):
    """Try GPU op, retry on OOM with cache clear + exponential backoff."""
    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt * 5  # 5s, 10s, 20s
            print(f"GPU busy (attempt {attempt+1}/{max_retries}), retrying in {wait}s...")
            time.sleep(wait)
```

调用方式：把 GPU 操作包成一个函数传进去。

```python
def _run():
    model = load_model(device="cuda")
    return model.generate(text)

model, output = _oom_retry(_run, max_retries=3)
```

**适用条件**：
- 工具是一次性 CLI 推理（非持久服务）
- OOM 时释放显存重来不会破坏业务逻辑（不写盘、不发请求、不打款）

**不适用**：持久 GPU 服务（始终在显存中）→ 应用层做准入控制更合理。

## 预防

- 新 GPU 工具部署时，manifest 的 `conflicts` 留空 `[]`
- CLI 入口点包 `_oom_retry`，不要写在 manifest 的 agent_notes 里期望 agent 手工调用
- agent_notes 只写"如何用"，不写"如何避冲突"
