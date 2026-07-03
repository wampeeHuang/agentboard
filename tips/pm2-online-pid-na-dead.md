# PM2 online + PID N/A = 进程未启动

type: diagnostic
date: 2026-07-02
source: agentboard 和个体户台账同时挂掉，访问时才发现

## 现象
- `pm2 list` 显示 status: online
- PID 列显示 N/A，CPU 0%，MEM 0b
- 端口无 LISTEN，服务不可达
- `pm2 logs` 反复打印 `MODULE_NOT_FOUND`

## 根因
PM2 dump 记录的 cwd/script 是绝对路径，项目搬家或旧目录删除后路径失效。PM2 反复重启但入口文件找不到，每次都立即退出。PM2 把"正在重试"的状态标为 online，但不暴露"没起来"的事实。

## 修复
1. 找到实际 server.js 位置
2. 在项目根目录建 `ecosystem.config.js`：
   ```js
   module.exports = {
     apps: [{ name: 'xxx', script: './server.js', cwd: __dirname }]
   };
   ```
3. `pm2 delete 旧名` → `pm2 start ecosystem.config.js` → `pm2 save`

## 预防
所有 PM2 管理的项目都放 ecosystem.config.js，用相对路径 `./server.js`。搬家后删旧进程从 ecosystem 重新起，不会漂移。
