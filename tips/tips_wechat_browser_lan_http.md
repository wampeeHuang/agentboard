# 微信内置浏览器静默拦截局域网 HTTP

type: capability
date: 2026-07-23
source: 德城 landing page 手机预览

## 现象
手机和电脑同 WiFi，电脑起 Python HTTP 服务器（`python -m http.server 8080`），防火墙已放行，电脑本地 curl 200 OK，但手机微信内打开 `http://192.168.x.x:8080/` 一直加载、最终失败，无明确错误提示。

## 根因
微信内置浏览器对局域网 HTTP 地址有限制（安全策略），静默拦截不报错，用户看到的只是"加载中"然后超时。

## 修复
换手机自带浏览器（Safari / Chrome）打开同一个局域网 URL，通常能正常加载。

## 预防
- 手机预览 link 发给用户时提醒：用手机自带浏览器打开，不要用微信直接点链接
- 如果有条件，部署到公网 HTTPS（Vercel/EdgeOne Pages）再发微信链接
