# Node.js https.request 不读 HTTP_PROXY，得用 global-agent
type: fact
date: 2026-06-12
source: 飞书 API 调用脚本 execute.js 在代理环境下请求超时

## 现象
Node.js 脚本里用 `https.request()` 调飞书 API 全部超时，但同机器的 `curl` 和 PowerShell `Invoke-RestMethod` 用同样的代理设置就正常。

## 根因
Node.js 的 `http`/`https` 内置模块直接建立 TCP 连接，不读 `HTTP_PROXY` 环境变量。这是设计决定：Node 不自动走代理。它的 `http.Agent` 和 `https.Agent` 都是直连模式。

curl、PowerShell、Python requests 都会自动读 `HTTP_PROXY`，但 Node 不会。

## 对策

三种方式（按推荐度）：

```js
// 方式1: global-agent（一行注入，覆盖 http/https 全局）
// 安装: npm install global-agent
import 'global-agent/bootstrap';
// 或: node -r global-agent/register script.js

// 方式2: undici ProxyAgent（Node 18+ fetch 用 undici）
const { ProxyAgent } = require('undici');
const dispatcher = new ProxyAgent('http://127.0.0.1:7897');
fetch(url, { dispatcher });

// 方式3: 改用 child_process 调 curl
const { execSync } = require('child_process');
execSync('curl -s -x http://127.0.0.1:7897 https://api.example.com');
```

## 什么时候要注意
- Node 写的 API 调用脚本（飞书、GitHub、任何外网 API）
- 如果机器开着代理，必须显式处理
- Windows 上用 PowerShell 调用 Node 脚本 —— PS 自己走系统代理，但 Node 子进程不走
