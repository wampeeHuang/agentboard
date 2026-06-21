# Codex CLI 通过聚合平台 API 运行：codex-relay 桥接方案
type: method
date: 2026-06-15
source: Codex CLI v0.139.0 使用 DeepSeek/AIGO 后端时报 404，因为 Codex 已移除 Chat Completions 支持，只用 Responses API

## 现象
- Codex CLI v0.139.0 用 DeepSeek 或 AIGO 聚合 API 时报 `404 Not Found: url: https://api.deepseek.com/v1/responses`
- 2026年2月起 Codex 彻底移除 `wire_api = "chat"` 支持
- 聚合平台只实现 Chat Completions API，没有 `/v1/responses` 端点

## 根因
OpenAI Codex CLI 只用 Responses API（`/v1/responses`），聚合平台只支持 Chat Completions API（`/v1/chat/completions`），协议不兼容。

## 修复/步骤

### 1. 安装 codex-relay
```bash
pip install codex-relay
```

### 2. 启动 relay
```bash
codex-relay --port 4446 --upstream https://aigoapi.com/v1 --api-key $AIGOAPI_API_KEY
```

### 3. 配置 Codex（~/.codex/config.toml）
```toml
model = "gpt-5.5"
model_provider = "aigoapi-relay"

[model_providers.aigoapi-relay]
name = "AIGOAPI (via relay)"
base_url = "http://127.0.0.1:4446/v1"
wire_api = "responses"
env_key = "AIGOAPI_API_KEY"
```

### 4. 开机自启
启动文件夹放 `.vbs` 脚本调用 `start-relay.bat`。

### 链路
Codex (Responses API) → relay :4446 (翻译) → 聚合平台 (Chat Completions)

## 预防
- 新装 Codex 版本先确认 `wire_api` 支持情况
- 聚合平台后端统一走 relay，不直连
- relay 上游模型列表变化后重启刷新
