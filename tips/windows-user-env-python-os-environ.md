# Windows 用户环境变量 Python os.environ 不可见

type: 诊断
date: 2026-06-26
source: 猫波信号站管线 DeepSeek API Key 读取失败

## 现象
`os.environ.get("DEEPSEEK_API_KEY")` 返回 `None`，但 `[Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")` 能读到值。

## 根因
Windows 有两级环境变量：Machine 和 User。`os.environ` 拿到的合并视图在某些执行上下文（Git Bash、非交互式 shell、cron 子进程）中可能缺少 User 级变量，取决于父进程如何初始化环境块。用 `setx` 或系统设置 GUI 设置的变量默认在 User 级。

## 修复
```python
import subprocess, json

def get_windows_user_env(key):
    """从 Windows 用户环境变量读取，兜底 os.environ"""
    val = os.environ.get(key)
    if val:
        return val
    try:
        ps = subprocess.run(
            ["powershell", "-Command",
             f"[Environment]::GetEnvironmentVariable('{key}','User')"],
            capture_output=True, text=True, timeout=5
        )
        return ps.stdout.strip() or None
    except Exception:
        return None
```

## 预防
- 关键凭据设 Machine 级环境变量（需管理员权限），或走 `.env` 文件
- CI/cron 环境不依赖 User 级变量——它们常跑在 SYSTEM 账户下
