---
type: diagnosis
date: 2026-09-11
domain: general
author: dsh-agent
source: 灵感图库会话：用 PowerShell 改 index.html 一行 link，把两个 HTML 的中文全部写坏并白屏
---

# Windows PowerShell 5.x 默认不是 UTF-8：文件读写与 HTTP 请求体两条路径都会静默损坏中文

## 现象

用管道做一次很小的文本替换：

```powershell
(Get-Content file.html -Raw) -replace '<pattern>', '' | Set-Content file.html -Encoding UTF8
```

结果：文件从 125766 字节变成 133354 字节（约 +6%），源码里中文全变成 `婧簮锛氫粠鏈ā鏉胯鐢熺殑`，页面白屏——浏览器只拿到 2 个请求、正文 0 字符、字体回退 Times New Roman。控制台没有任何报错提示编码问题。

## 根因

Windows PowerShell 5.x 的 `Get-Content` 在**没有 BOM 的 UTF-8 文件**上不会自动识别 UTF-8，而是按系统 ANSI 代码页（中文环境 = GBK/cp936）解码。每个中文字符被解成两个双字节垃圾；`Set-Content -Encoding UTF8` 再把垃圾按 UTF-8 编码写回，于是每个中文字符从 3 字节膨胀成 6 字节。

**关键：这不是"忘加 -Encoding"的问题。** 写的那头编码是明确的，坏在读的那头；`-Encoding UTF8` 只保证把已损坏的内容忠实地写成 UTF-8。

## 修复/步骤

这种损坏**不可逆**——用 GBK 回转尝试恢复会丢字节（实测得到 `从�?��板�?生` 这类残字），因为一个 GBK 双字节序列可能解出非法字符并被替换成 U+FFFD。

只能从外部完好副本整体恢复：

1. 先原地留证：把损坏文件复制到项目 `_runtime/` 下（不要直接覆盖，保留现场）。
2. 找**近期、完好的整文件副本**——本次是 robocopy 镜像（`F:\warehouse\inbox\projects\<项目>\`），它恰好是损坏前状态，且连未提交的改动都在。
3. 整文件覆盖回来，然后校验：乱码特征行数为 0、关键中文串正常、`git diff` 与损坏前一致。
4. 用**文件编辑工具**（按 UTF-8 读写）重做那处小改动，不要再用 PowerShell 管道。

## 第二条路径：`Invoke-WebRequest -Body` 把中文编成 `?`，接口照样回 200

同一台机器、同一个 5.1 运行时，换到 HTTP 写入就换了一种坏法，而且更隐蔽：**请求成功、响应 200，数据已经坏了**。

```powershell
$body = @{ displayName = '飞书即时通讯'; category = '飞书与办公' } | ConvertTo-Json -Compress
Invoke-WebRequest -Method POST -ContentType 'application/json' -Body $body ...
# → HTTP 200  {"displayName":"??????","category":"其他"}
```

`-Body` 收字符串时按非 UTF-8 编码转字节，中文全部变成字面的 `?`，服务端收到的是合法 JSON、校验也过（`?` 是合法字符），于是把垃圾写进了状态文件。本次实测把能力地图的 `lark-im` 登记项写坏成 `??????`，靠回读才发现。

修法（任选其一）：

```powershell
# 一：自己把字符串编成 UTF-8 字节数组再传（body 收 byte[] 时不再转换）
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
Invoke-WebRequest ... -Body $bytes

# 二：写进文件再 -InFile
[System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding($false)))
Invoke-WebRequest ... -InFile $tmp

# 三：直接用 node/curl 发请求，绕开 PowerShell 的编码层（本机最省事）
```

## 预防

- **改文本文件一律用编辑工具**（Claude Code 的 Edit/Write、或 Python 的 `Path.read_text(encoding='utf-8')` / `write_text`），不要用 `Get-Content | Set-Content`。
- 确实必须在 PowerShell 里处理文本时，两头都显式指定：
  - 读：`[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)`
  - 写：`[System.IO.File]::WriteAllText($p, $text, (New-Object System.Text.UTF8Encoding($false)))`（`$false` = 不写 BOM）
- **用 PowerShell 调 API 写中文时，落盘 ≠ 成功**：`Invoke-WebRequest` 的 `-Body` 默认不按 UTF-8 编码字符串。发完必须**回读一次**确认中文完整，别只看 200；日志里若出现 `??????` 就是它。
- 通用判据：`?` 是"编码失败被替换"的痕迹，而**替换字符不会报错**——凡是中文经 PowerShell 走一遍文件或网络，都要有回读校验。
- 改动前确认有近期完好副本；robocopy 镜像这类"整文件防线"要在关键节点真的跑，不能只在文档里写着。
- 换个角度：**这次事故能被救回来，全靠镜像存在**。任何"只是改一行"的操作，在 UTF-8 项目里都值得先确认回退路径。
