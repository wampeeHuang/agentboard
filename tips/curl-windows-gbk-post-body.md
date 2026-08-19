---
type: diagnosis
date: 2026-07-23
source: Supervisor 飞书告警推送乱码排查，用户收到 `[Supervisor ????]` 替换字符
---

# curl on Windows 发 POST 中文自动转 GBK，不是 UTF-8

## 现象

用 `curl -X POST http://127.0.0.1:3101/send -d '{"text":"飞书测试"}'` 发中文消息，接收端收到乱码、替换字符 `?`。

## 根因

Windows 版 curl 将 POST body 中的非 ASCII 字符按**系统默认编码（CP936/GBK）**发送，不是 UTF-8。

```
飞 (UTF-8) = e9 a3 9e  (3 bytes)
飞 (GBK)   = b7 c9      (2 bytes)
```

服务端按 UTF-8 解析 GBK 字节 → 非法字节序列 → `U+FFFD` 替换字符。

Node.js `http.request`/`fetch` 默认 UTF-8，不受影响。**只有 curl 有这个坑。**

## 修复/步骤

**方案 A**：不用 curl，用 Node.js 一行脚本测试：

```bash
node -e "const http=require('http');const d=JSON.stringify({text:'中文'});const r=http.request({hostname:'127.0.0.1',port:3101,method:'POST',path:'/send',headers:{'Content-Type':'application/json'}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>console.log(b))});r.write(d);r.end()"
```

**方案 B**：强制 curl 用 UTF-8（需文件传递）：

```bash
echo {"text":"中文"} | iconv -f UTF-8 -t UTF-8 > /tmp/body.json
curl -X POST http://127.0.0.1:3101/send -d @/tmp/body.json -H "Content-Type: application/json; charset=utf-8"
```

**方案 C**：用 `--data-binary` 从文件读取，绕过 shell 编码转换：

```bash
# PowerShell 写 UTF-8 文件，curl 用 --data-binary
$json = '{"text":"中文"}' ; [IO.File]::WriteAllBytes("$env:TEMP\body.json", [Text.Encoding]::UTF8.GetBytes($json))
curl --data-binary "@$env:TEMP\body.json" -H "Content-Type: application/json" http://127.0.0.1:3101/send
```

## 预防

Windows 上测试 HTTP API 中文参数：优先 Node.js 一行脚本，不依赖 curl。curl 的行为取决于编译选项和系统 locale，同一命令在不同 Windows 机器上编码行为不同。
