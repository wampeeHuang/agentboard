---
type: diagnosis
date: 2026-10-03
domain: general
author: dsh-agent
source: 为架构图写只读静态服务 serve.py，加只读边界后实测 POST/PUT/DELETE 全部 RemoteDisconnected 而非 405
---

# http.server 的 send_error 传中文会让连接被关，客户端看到 RemoteDisconnected 而不是 405
## 现象

给 `SimpleHTTPRequestHandler` 加只读边界，把写方法一律拒掉：

```python
def do_POST(self):
    self.send_error(405, "此服务只读")
```

实测结果**不是 405**：

```text
POST   异常: RemoteDisconnected     ← 连接被关，拿不到任何响应
PUT    异常: RemoteDisconnected
DELETE 异常: RemoteDisconnected
GET    -> 200 2016 B                ← 读一切正常
```

服务端日志里 reason 是乱码：`code 405, message 姝ゆ湇鍔″彧璇`。

**误判方向**：容易以为是只读边界没生效、或线程/连接池的问题，于是去改 `ThreadingHTTPServer`。

## 根因

`http.server.BaseHTTPRequestHandler.send_error()` 内部用 **latin-1** 拼响应：
`send_error_message(explain)` 在 `send_response` 之后抛 `UnicodeEncodeError`。
状态行已经发出去了，异常发生在写 body 时 → 服务端**关闭连接**，
客户端只看到 `RemoteDisconnected`，405 根本没被读全。

所以「405 发出去了但客户端看不到」这个组合本身就是这个故障的指纹。

## 修复/步骤

**给 `send_error` 的第二个参数只传 ASCII**，中文提示换别的方式承载：

```python
def _reject_write(self):
    # send_error 用 latin-1 编码；传中文会在编码时抛异常 →
    # 405 发出后连接被关，客户端读不到响应。
    self.send_error(405, "Read-only service")

do_POST = do_PUT = do_DELETE = do_PATCH = _reject_write
```

需要中文提示就自己 `send_response` + `Content-Type: text/html; charset=utf-8` + UTF-8 body，
不要走 `send_error`。

同类还要注意 `list_directory()`：默认实现也按 latin-1 写文件名，中文目录名会乱码，需自行覆写。

## 预防

- Python stdlib 里凡「把字符串当 HTTP 头/状态行」的路径都是 **latin-1**（WSGI 遗留），中文一律不放那里。
- 只读服务写完边界后**必须实测写方法**，不能只看 GET 200；测试要在客户端断言拿到 **405**，
  而不是"请求失败了就算拒掉"。
- 看到 `RemoteDisconnected` 先查服务端 stderr 有没有 traceback——乱码 reason 是强线索。
