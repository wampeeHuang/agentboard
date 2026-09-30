---
type: diagnosis
date: 2026-09-14
domain: general
author: dsh-agent
source: 给比特沙箱装 PostBot 扩展（2026-09-14）
---

# 比特浏览器只加载自带扩展，第三方扩展必须靠 /browser/open 的 args 带进去

## 现象

把扩展目录放进 `%APPDATA%\BitBrowser\BitExtensions\<扩展id>\<版本>_0\` 后，关掉重开沙箱，扩展**不加载**——启动参数里只有比特自带的两个扩展。

同时 `/browser/update` 回写 `args` 或 `extendIds` 返回 `success: true`，但 `/browser/detail` 复查发现两个字段都没落库：**接口报成功但没生效**，极易误判成"已经装好了"。

## 根因

比特从 `BitExtensions` 加载的只有它内置的那两个（`lbehohcbbmmipgcjejkohbihjfcgdpgc` 等）。第三方扩展不在它的扩展中心注册表里，不会被自动带上。

`args` 是**启动参数**而非持久配置，只有 `/browser/open` 接受它；`/browser/update` 的 `args`/`extendIds` 走另一条存储路径，写了不生效。

## 修复/步骤

1. **扩展必须拿到确定性 ID**。Chromium 规则：
   `ID = SHA256(manifest.key 的 SPKI-DER) 前 16 字节，每 nibble 映射到 a-p`。
   manifest 没有 `key` 时每次加载 ID 都会变，无法稳定引用。所以要先生成 RSA key、把 base64(DER) 写进 manifest 的 `key` 字段，再把扩展放到 `BitExtensions\<id>\<version>_0\`。
   自检算法：拿比特自带扩展的 `key` 反推 ID，应与它的目录名完全一致。

2. 用 `/browser/open` 的 `args` 传入（必须先 close 再 open）：
   ```powershell
   $base = 'http://localhost:54921'
   $ext  = '<BitExtensions>\<id>\<version>_0'
   Invoke-RestMethod "$base/browser/close" -Method Post -ContentType 'application/json' -Body (@{id=$bid} | ConvertTo-Json -Compress)
   Invoke-RestMethod "$base/browser/open"  -Method Post -ContentType 'application/json' -Body (@{id=$bid; args=@("--load-extension=$ext"); loadExtensions=$true} | ConvertTo-Json -Compress)
   ```

3. **两条独立证据**才算成功（只看一条会自欺）：
   - 进程启动参数出现该扩展 ID：`Get-CimInstance Win32_Process` 过滤 `BitBrowser.exe`、排除 `--type=`，取 `--load-extension` 段
   - 页面里出现扩展注入的 DOM 节点（如 PostBot 的 `DIV#postbot-container`），且 CDP `/json/list` 有该扩展的 `service_worker`

## 预防

- 本地 API 报 `success: true` ≠ 配置已落库——**改完必须 `/browser/detail` 或进程参数复查**
- 别以为往 `BitExtensions` 放完就装好了；比特不扫描这个目录找第三方扩展
- 扩展 ID 依赖 manifest 的 `key`，**私钥文件必须留档**；丢了 ID 就变，所有引用失效

## 附带坑

比特本地 API（:54921）只监听 IPv6 `::`，`127.0.0.1:54921` 连不上，必须用 `localhost:54921`。旧笔记记的"54921 因代理故障不可用"已过时。
