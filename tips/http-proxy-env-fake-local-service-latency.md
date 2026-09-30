---
type: diagnosis
date: 2026-09-11
domain: general
author: dsh-agent
source: 灵感图库会话：测本地 8771 图片加载延迟，urllib 报每次约 2 秒，原始 socket 实测 15 毫秒
---

# http_proxy 环境变量会让 urllib 探测本地服务时走代理，制造出每请求约 2 秒的假延迟

## 现象

测本机 HTTP 服务（`http://localhost:8771/...`）的响应时间：

- `urllib.request.urlopen` 测得：静态文件 **2046 ms**、6 MB 原图 **2055 ms**、连 304 空响应也 **2059 ms**。
- 同一路径用**原始 socket** 发 `GET ... Connection: close` 实测：**15 ms**。
- 更迷惑的是：同一台服务上 `/favicon.svg` 用 urllib 有时 14 ms、有时 2000 ms。

差点据此得出"服务端每请求固定阻塞 2 秒"的错误结论，并去改服务端代码。

## 根因

这台机器的环境变量里有：

```
http_proxy=http://127.0.0.1:7897
no_proxy=localhost,127.0.0.1,::1,10.*,...,api.deepseek.com,*.feishu.cn,...
```

`urllib` 的默认 opener 带 `ProxyHandler`，会读这些环境变量。虽然 `no_proxy` 里写了 `localhost` 和 `127.0.0.1`，但通过 `http://localhost` 访问时代理绕行实际发生了——本机代理端口 7897 在监听，请求被迫多跳一次本机代理，稳定多出约 2 秒。改用 `http://127.0.0.1` + 原始 socket 就完全正常。

所以"2 秒"是**客户端测量工具的产物**，服务端一直很快。

## 修复/步骤

测本地服务延迟时绕开代理环境：

```python
import urllib.request
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
opener.open('http://127.0.0.1:8771/api/health', timeout=30)
```

或直接原始 socket（最可信）：

```python
import socket, time
s = socket.create_connection(('127.0.0.1', 8771), timeout=30)
t0 = time.time()
s.sendall(b'GET /favicon.svg HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
data = b''
while True:
    c = s.recv(65536)
    if not c:
        break
    data += c
print(int((time.time() - t0) * 1000), 'ms')
```

## 预防

- **测本机服务用 `127.0.0.1`，不要用 `localhost`**，并用空 `ProxyHandler`，或直接上原始 socket。
- 出现"延迟与 payload 大小无关的固定值"（本例 6 MB 与 0 字节都是 ~2050 ms），第一反应应该是**测量链路有问题**，而不是服务端慢——真实的服务端瓶颈通常随体积、并发、内容类型变化。
- 多个测量工具结果矛盾时（本例 favicon 14 ms vs 图片 2046 ms），先做一次**原始 socket 对照**再下结论，不要基于单一客户端的结果改代码。
- 同类陷阱：Python 脚本里 `urllib` 抓外网也会走这个代理；HTTP 服务端自身若用 `urllib` 探测本机端口同理。
