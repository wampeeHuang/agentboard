# PowerShell Invoke-RestMethod 默认 GBK 编码导致 HTTP body 中文变问号
type: diagnosis
date: 2026-06-30
source: 深圳求职巡检 cron job 调飞书 API 发卡片消息，中文全部显示为 ????

## 现象

Agent 通过 PowerShell 的 `Invoke-RestMethod` 调飞书 API 发送含中文的 JSON 卡片消息，飞书端收到的消息中所有中文字符变成问号（`?`）。API 返回成功（code=0，有 message_id），但消息内容不可读。

同一内容用 UTF-8 显式编码后发送，消息正常显示。

## 根因

PowerShell 5.1 的 `Invoke-RestMethod -Body $jsonString` 默认使用系统代码页编码请求体。中文 Windows 的系统代码页是 GBK/CP936，而飞书等几乎所有 Web API 期望 UTF-8。

关键验证数据：同一 JSON 内容，UTF-8 编码 404 字节 vs 系统默认编码 383 字节（差 21 字节 = 中文字符的编码差）。GBK 字节流被 Feishu 按 UTF-8 解析 → 非法字节序列 → 全部替换为 `?`。

更深层原因：Agent 工具链偏好问题。Claude Code 在 Windows 上的默认 shell 是 PowerShell，agent 做 HTTP POST 时倾向于用 `Invoke-RestMethod` 而非 `curl`。PS 的 string → bytes 隐式转换路径极不透明，不像 Python `open()` 那样有明确报错触发开发者注意。

## 修复

**首选方案：绕过 PowerShell，用 Bash(curl)。** curl 在 Git Bash 环境下默认 UTF-8，无需额外处理：

```bash
curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$BODY"
```

**备选方案：PowerShell 显式转 UTF-8 字节：**

```powershell
$body = @{...} | ConvertTo-Json -Depth 6 -Compress
$utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
Invoke-RestMethod -Uri "..." -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8"
```

对 cron job 场景，在 prompt 中硬编码"禁止用 PowerShell 调飞书 API，必须用 Bash(curl)"即可。

## 预防

- Windows 上任何需要发送中文 HTTP body 的自动化任务，首选 curl 而非 PowerShell
- Agent prompt 中的 API 调用示例，用 curl 写，不要用 `Invoke-RestMethod`
- 如必须用 PowerShell，`-Body` 必须是 `[byte[]]` 而非 `[string]`，且 `-ContentType` 必须含 `charset=utf-8`
- 同类影响：所有 Windows 上用 PS 调 UTF-8 API 的场景（飞书、企业微信、钉钉、Slack Webhook 等）
