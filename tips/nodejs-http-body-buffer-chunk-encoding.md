# Node.js HTTP body Buffer 逐片解码中文乱码

type: anti-pattern
date: 2026-08-07
source: feishu-bot /send 端点接收 supervisor 推送的中文告警，飞书收到乱码

## 现象

Node.js HTTP 服务器接收含中文的 POST body → `JSON.parse` 后中文变成 `����` 等乱码字符。英文 ASCII 部分正常，仅多字节字符损坏。

## 根因

```js
// 坏 — 每个 TCP 分片独立解码
let body = '';
req.on('data', c => body += c);
// c 是 Buffer，+= 隐式调用 buffer.toString('utf-8')
// TCP 分片切到 3 字节中文字符中间 → 该字符永久损坏
```

Windows loopback 接口 MTU 很大，日常不会触发。问题在特定条件（网络负载、大 body、proxy 中间层分包）下间歇出现，极难复现。

## 修复

```js
// 好 — 收集所有 chunk，最后统一解码
const chunks = [];
req.on('data', c => chunks.push(c));
req.on('end', () => {
  const body = Buffer.concat(chunks).toString('utf-8');
  // ...
});
```

## 预防

grep 项目中的 `+= c` 模式（`body += c` / `data += c`），全部替换为 Buffer.concat。不只是 `/send` ——所有 HTTP response 读取也有同样风险，只是 API 返回多为 ASCII JSON 所以未暴露。
