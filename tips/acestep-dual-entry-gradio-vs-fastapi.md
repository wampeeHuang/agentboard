# ACE Step 双入口陷阱：acestep(Gradio) vs acestep-api(FastAPI)
type: diagnosis
date: 2026-06-29
source: AI Format 按钮报 "LLM may not be available"，前端调 Node API → Python 引擎返回 404

## 现象
ACE Step 前端点 AI Format 按钮，报 "Format failed. The LLM may not be available."。Node API (`:3001`) 调 Python 引擎 `POST /format_input` 返回 404。

## 根因
ACE Step 同一个包注册了两条 CLI 入口（`pyproject.toml` entry_points）：

| 命令 | 入口函数 | 协议 |
|------|---------|------|
| `acestep` | `acestep_v15_pipeline:main` | Gradio UI |
| `acestep-api` | `api_server:main` | FastAPI |

`/format_input` 端点只存在于 FastAPI 版本。如果用 `acestep.exe` 启动，跑的是 Gradio，没有这个路由。

Node API 的错误处理只捕获 `ECONNREFUSED`，404 被吞掉 → 前端只能看到 "LLM may not be available" 这个误导性提示。

## 修复
用 `acestep-api.exe` 启动，不是 `acestep.exe`：

```powershell
.\.venv\Scripts\acestep-api.exe --port 8001 --host 0.0.0.0 --init-llm
```

## 预防
- ACE Step 引擎启动永远用 `acestep-api`，不用 `acestep`
- `start-all.bat` 里确认用的是正确命令
- 装完新版本后检查 `pyproject.toml` → `[project.scripts]` 确认入口未变
