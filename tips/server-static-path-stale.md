# Server 搬家后静态资源 404

type: debug
date: 2026-08-06
source: source-rack 文件夹架构重构

## 现象

移动/重命名 Express 静态目录后(如 `public/` → `assets/`)，页面 CSS/JS 全部 404。

## 根因

旧 server 进程在内存中持有 `express.static('public')` 路径引用。
文件系统变更不影响已运行的 Node 进程——它仍指向旧目录。

## 修复

```powershell
# 1. 找端口进程
netstat -ano | findstr ":3098"
# 2. 杀进程
Stop-Process -Id <PID> -Force
# 3. 重启
node server.js
```

## 预防

改静态目录后第一件事：重启 server。不假设热重载。
