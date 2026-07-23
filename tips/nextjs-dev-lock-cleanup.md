# Forma Next.js .next/dev/lock 残留 → 启动失败

type: diagnosis
date: 2026-07-10
source: 20260710_AI定价困局 Forma 推送

## 现象

`npx next dev` 报错 "Unable to acquire lock at .next/dev/lock, is another instance of next dev running?" 即使没有 next 进程在跑。

## 根因

Next.js dev server 崩溃/被强杀时不会清理锁文件。`.next/dev/lock` 残留导致后续启动全部失败。`next-swc.win32-x64-msvc.node` 被进程持锁时 `Remove-Item node_modules -Recurse` 失败，导致 node_modules 半删状态。

## 修复

```powershell
# 杀所有 node 进程（释放文件锁）
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# 删锁
Remove-Item ".next\dev\lock" -Force

# 如果 node_modules 半残，全部清掉重装
Remove-Item "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "package-lock.json" -Force
npm install
```

## 预防

### Agentboard 自动化（preStart）
manifest 加 `preStart` 字段，agentboard 每次 spawn 前自动执行清理：
```json
"preStart": "npx kill-port 3103 && if exist D:\\workspace\\forma-typesetting\\forma\\.next\\dev rmdir /s /q D:\\workspace\\forma-typesetting\\forma\\.next\\dev"
```
`tool-registry.js` 的 `startTool()` 在 spawn 前执行 `mf.preStart`，失败不阻塞启动。

### 手动
- 每次 npx next dev 启动失败后检查并清理 lock
- push-forma.py 的 `check_forma_alive()` 对 404 返回 True（`404 < 500`），导致误判——Forma 实际未运行时代码以为 alive
