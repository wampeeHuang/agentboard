---
type: diagnosis
date: 2026-08-04
source: 2026-08-04-codex-chatgpt-plus-setup
---

# OpenAI 服务代理区域限制

## 规则

| IP 区域 | ChatGPT | Codex CLI/Desktop | API |
|---------|---------|-------------------|-----|
| 日本 | ✅ | ✅ | ✅ |
| 新加坡 | ✅ | ✅ | ✅ |
| 美国 | ✅ | ✅ | ✅ |
| 香港 | ❌ 拒绝连接 | ❌ 拒绝连接 | ❌ 拒绝连接 |
| 中国大陆 | ❌ 拒绝连接 | ❌ 拒绝连接 | ❌ 拒绝连接 |

## 关键约束

**不能跨国跳。** 短时间内 IP 在不同国家之间切换 → OpenAI 判定账号共享 → 风控封号。

同一国家内部 IP 轮转（如日本不同节点）= OK，看起来像家宽正常换 IP。

## 本机配置

Vortex 代理（127.0.0.1:7897）→ 锁定日本自动模式。

Codex config.toml：
```toml
HTTPS_PROXY = "http://127.0.0.1:7897"
HTTP_PROXY = "http://127.0.0.1:7897"
```

## 排查

Codex 报网络错 → 先检查当前 IP 在哪：
```powershell
curl -x http://127.0.0.1:7897 https://api.openai.com/v1/models -H "Authorization: Bearer $(Get-Content ~/.codex/auth.json | jq -r .tokens.access_token)" -I
```

403/连接被拒 = IP 落到香港。
