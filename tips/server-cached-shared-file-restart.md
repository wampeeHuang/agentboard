---
type: diagnosis
date: 2026-08-21
source: layout-gallery 英雄区轮播——改 nav.html 不重启，验证读到旧样式，把正常渲染误判成 hero 爆炸（18590px）；2026-08-25 同坑复发（假绿）
---

# 服务器启动时读入内存的共享文件，改后必须重启再验证

## 现象

改完 `server/nav.html`（共享英雄区 CSS），没重启 server 直接刷新页面验证——读到的是旧样式，把正常渲染误判成布局爆炸（hero 高度 18590px）。实际文件没问题，是缓存。

**反向变体（2026-08-25 复发）：假绿。** 同样改 nav.html 没重启，跑完整个验证套件"全绿"——但全绿验证的是旧代码，改动根本没生效。误报有人查，假绿没人知道错了。假绿比误报危险。

## 根因

服务启动时把共享文件 `readFileSync` 进模块作用域常量，请求时复用这份内存副本：

```javascript
const navHTML = fs.readFileSync(path.join(PROJECT_DIR, 'server', 'nav.html'), 'utf-8');
```

文件系统改动不影响已运行进程。**缓存文件（nav/header/配置/footer）≠ 静态资源**——静态资源每次请求现读，改完立刻生效；启动时缓存的共享文件改完必须重启。

## 修复

1. 改被进程缓存的共享文件 → 重启 server → 再验证
2. **验证前先确认被测版本**：curl 响应 grep 新代码的特征标记（新颜色/新文案），命中再跑验证
3. 验证结果可疑（无论"异常"还是"全绿"）时，第一反应不是改逻辑，先查进程是不是旧版本

```bash
netstat -ano | findstr ":<port>"   # 找 PID
Stop-Process -Id <PID> -Force       # 重启
node server.js
```

## 预防

- 动手前先看该文件是不是启动时 `readFileSync` 加载（grep server 代码）
- 改共享文件后的验证顺序固定：**重启 → 确认新版本 → 再验证**，不跳过
- 同类：改静态目录路径后不重启见 `server-static-path-stale.md`——同根因（进程内存持有旧状态），不同触发（内容缓存 vs 路径解析）
