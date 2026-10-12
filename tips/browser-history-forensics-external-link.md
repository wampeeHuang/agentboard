---
type: capability
domain: general
author: 其他
date: 2026-10-03
source: 需要证明"程序到底有没有打开过浏览器"，顺带定位到授权链路的断点
---

# 用浏览器历史库取证，证明某个链接到底有没有被打开过

## 能力

直接读 Chromium 系 / Edge / 国产壳浏览器（夸克等）的本地历史库，判定"某个 URL 是否真的被访问过"，
把"程序没调起浏览器"和"用户没操作"这类互相甩锅的问题一次钉死。本例据此断定插件从未打开过浏览器。

## 为什么只能用这个

- 屏幕上看不到、应用日志里没有、进程也不监听端口（Obsidian 不开放 CDP；
  本机 `127.0.0.1:9222` 那个调试端口属于 Docker Desktop，**会误导**）
- 抓包只能证明"有没有出网"，证明不了"浏览器有没有被唤起"
- 历史库是操作系统里唯一留痕的地方

## 速查

```bash
# 库位置（Chromium 系，必须扫**所有 profile**）
%LOCALAPPDATA%/<Chrome|Microsoft/Edge|Quark|BraveSoftware/...>/User Data/*/History
%APPDATA%/Mozilla/Firefox/Profiles/*/places.sqlite
```

```python
shutil.copy2(hist, tmp)              # 浏览器在运行时库被锁，必须先复制
for s in ('-wal', '-shm'): 也要复制    # 否则漏掉最新记录
con = sqlite3.connect(tmp)
con.execute("SELECT last_visit_time, url FROM urls ORDER BY last_visit_time DESC LIMIT 400")
# Chromium 时间戳 = 1601 起微秒：datetime.fromtimestamp(t/1e6 - 11644473600)
# Firefox 走 moz_places 表
```

**坑**：临时文件名里不能出现路径分隔符——`shutil.copy2` 目标目录不存在时报 WinError 3，
而脚本循环里会被当成"跳过"，多 profile 静默丢失（实测踩过一次）。

## 配套判据

历史里"最新一条访问时间"本身就有用：若它停在用户最后一次手动操作的时刻、
之后没有任何相关域名记录，就能排除"程序打开过但失败"。
