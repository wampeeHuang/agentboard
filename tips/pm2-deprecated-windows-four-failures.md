---
type: fact
date: 2026-08-01
source: 骨架打包调研——Agent 反复建议 PM2，用户要求固化弃用原因
---

# PM2 已弃用：Windows 四连坑 + 禁止 Agent 再次建议

## 事实

**PM2 已全面从本机移除。** 进程守护由 Supervisor (:3097) 接管。任何情况下不安装、不启动、不建议 PM2。

## 弃用原因：Windows 四连坑

这四次故障不是偶发——是 PM2 在 Windows 上的**设计假设不成立**。每次修完过几天又炸。

| # | 故障 | PM2 行为 | 根因 | 证据 |
|---|------|---------|------|------|
| 1 | 进程没启动但显示 online | `pm2 list` 显示 online / PID N/A / CPU 0% / MEM 0b | dump.pm2 存绝对路径，目录搬家后入口文件不存在；PM2 反复重启每次都立即退出，但把"正在重试"标为 online | `~/.agentboard/tips/pm2-online-pid-na-dead.md` |
| 2 | 孤儿进程占端口，PM2 静默失败 | restart count 狂涨，EADDRINUSE 不报警 | `node -e "require('server.js')"` 触发 `app.listen()`→进程不退→占端口→PM2 以为旧进程死了 | `~/.agentboard/tips/node_e_orphan_process.md` |
| 3 | npm/cmd 脚本直接崩溃 | `SyntaxError: Unexpected token ':'`，重启循环 | Windows 上 PM2 把 `npm.cmd` 当 JS 文件 `require()`，读到批处理语法炸 | `~/.agentboard/tips/pm2-script-npm-syntaxerror-windows.md` |
| 4 | Agent 读旧文档复活 PM2 | PM2 daemon 与 Supervisor 撞端口 3099，工具架挂掉 | CLAUDE.md 写死"PM2 管理"→Agent 信文档不查运行时→`npx pm2 start` 复活已删除的工具链 | `~/.agentboard/tips/stale-claude-md-resurrects-dead-tooling.md` |

## PM2 在 Windows 上的根本问题

PM2 的三个核心假设在 Windows 上全不成立：

- **进程生命周期用 Unix 信号管理** → Windows 无 signal，用 `taskkill` 替代，状态机不一致
- **npm 可执行文件可直接 spawn** → Windows 上 `.cmd` 壳不是 JS，PM2 当 JS 加载崩溃
- **绝对路径稳定不漂移** → dump.pm2 存绝对路径，Windows 上项目迁移频率远高于 Linux

## 替代方案

进程守护 → **Supervisor (:3097)**。从 agentboard manifest 读服务定义，冲突管理 + GPU 守卫 + 三层守护链。

## Agent 操作规则

```
听到/读到 "PM2" 在本机场景 →
  1. 读本文件
  2. 确认 PM2 已弃用
  3. 建议用 Supervisor 或 agentboard 管理进程
  4. 不安装、不启动、不建议 PM2
```

## 预防

- 本文件是 PM2 弃用的唯一真相源
- 任何文档出现"PM2 管理"→视为过时，立刻改正
- 新增服务一律走 agentboard manifest + Supervisor 守护
