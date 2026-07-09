# node -e require 语法检查产生孤儿进程占端口
type: method
date: 2026-07-08
source: agentboard 审查时 server.js 改完不生效，排查发现旧 node 进程占 3099

## 现象
- pm2 显示 agentboard online，但页面内容不更新（旧代码在响应）
- `netstat -ano | findstr :3099` 发现非 pm2 的 PID 在 LISTENING
- pm2 restart 多次均失败（restart count 不断增长），端口被占

## 根因
`node -e "require('server.js')"` — server.js 里的 `app.listen()` 保持事件循环不退出。`node -e` 返回后进程继续占端口。pm2 以为旧进程死了，新进程启动时 EADDRINUSE 静默失败。

## 修复
- **语法检查**: 用 `node --check server.js`（只解析，不执行，不占端口）
- **功能验证**: 改完代码一律走 `pm2 restart agentboard`，不用临时 node 进程测
- 已在 ecosystem.config.js 加启动守护自动清端口

## 排查命令
```bash
# 找端口占用者
netstat -ano | findstr :3099
# 杀非 pm2 的孤儿进程
taskkill /PID <pid> /F
```

## 预防
`node --check` 替代 `node -e "require()"` 测试语法。`--check` 是 V8 内置 flag，只做 parse + syntax check，不执行模块代码，不会触发 `app.listen()`。
