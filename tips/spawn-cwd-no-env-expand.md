# Node.js spawn cwd 不展开 Windows 环境变量
type: diagnosis
date: 2026-06-23
source: inspector :3101 无法通过 agentboard API 拉起

## 现象
- agentboard 面板点"启动"返回 `{"ok":true}`，但工具端口不监听
- 手动 `node server.js` 正常，走 `cmd /c` 也正常
- 只有走 agentboard `tool-registry.js` 的 `startTool()` 时静默失败

## 根因
`tool-registry.js:199` 用 `child_process.spawn('cmd', ['/c', startCommand], { cwd: winPath(projectPath) })` 启动工具。
`cwd` 参数被 Node.js 直接传给 OS，不经 shell。`winPath()` 只做 `/x/` → `X:\` 转换，不展开 `%VAR%`。
结果：`cwd: "%USERPROFILE%\\.inspector"` 是字面字符串，OS 不识别，进程工作目录错误 → `node server.js` 找不到文件 → 静默失败。

**为什么 `startCommand` 里的 `%USERPROFILE%` 没事**：因为 `startCommand` 走 `cmd /c`，cmd 会展开环境变量。cwd 不走 shell，所以不展开。

## 修复/步骤
1. **治根因**：改 `winPath()` 加 `%VAR%` 展开逻辑（`tool-registry.js` line 25-30）
   ```js
   function winPath(p) {
     if (!p) return p;
     p = p.replace(/%([^%]+)%/g, function (_, name) { return process.env[name] || '%' + name + '%'; });
     var m = p.match(/^\/([a-zA-Z])\//);
     return m ? m[1].toUpperCase() + ':\\' + p.slice(3) : p;
   }
   ```
2. **兜底**：manifest 的 `projectPath` 和 `startCommand` 能用绝对路径就别用 `%VAR%`

## 预防
- 新工具 manifest 审核：`projectPath` 含有 `%` 时警告
- `startCommand` 里 `cd /d %VAR%` 换成直接设 `projectPath` 为绝对路径，`startCommand` 简化为 `node foo.js`
- 任何 `spawn()` / `exec()` 设 `cwd` 前，先想：这个路径 OS 认识吗？不通过 shell 的话需要手动展开
