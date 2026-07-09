# claude -p 遇到 Windows 命令行 8191 字符限制

type: capability
date: 2026-07-08
source: 猫波选题 cron job 持续失败

## 现象
`claude -p $longPrompt` 在 PowerShell 脚本中报错 "no stdin data received"，但 prompt 内容确实非空。

## 根因
Windows cmd.exe 命令行长度限制 8191 字符。`claude -p "超长prompt"` 展开后超过限制，参数被截断，claude 收到空 stdin。

猫波选题的 prompt 从 `curation-prompt.txt` 读取，含 35 个内容源 URL + 评分标准，远超 8191 字符。

## 修复
```powershell
# Before (breaks when prompt > 8191 chars)
claude -p $prompt

# After (stdin pipe, no limit)
$prompt | claude
```

## 预防
- 所有从文件读取 prompt 再传给 claude 的脚本，默认用 stdin pipe 不用 `-p`
- 不可逆：`-p "短prompt"` 看起来简单但未来 prompt 可能变长
- 其他 CLI 工具同理：`git commit -m "$msg"` 等也受此限制
