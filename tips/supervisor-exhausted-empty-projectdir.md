---
type: diagnosis
date: 2026-08-07
source: feishu-bot 在 supervisor 面板显示 exhausted(restart_count=5)，manifest 配置完全正确但服务无法启动
---

# supervisor 服务 exhausted — 运行时目录为空

## 现象

- supervisor 面板显示服务 `exhausted`（重启 5 次后放弃）
- manifest 的 port、startCommand、projectPath 全部正确
- 手动 `cd projectPath && node server.js` 报 `MODULE_NOT_FOUND`
- `ls projectPath` 发现目录为空

## 根因

manifest 是正确的部署声明，但源码从未 clone 到运行时目录。这是一个**部署缺环**：服务注册了（manifest 存在），源码仓库存在（GitHub），但二者之间的 clone 步骤被跳过了。

gitignored 凭证文件（如 `bots.json`、`.env`）也不存在——即使补了源码也还需要补凭证。

## 诊断步骤

1. supervisor 面板看到 exhausted → 记下 PID（如果还有）和 restart_count
2. `ls <projectPath>` — 确认目录内容
3. 目录为空/缺关键文件 → 查 GitHub 找源码仓库
4. `gh repo clone` → `npm install` → 补 gitignored 文件（从飞书 Base 凭证表或其他真相源）
5. supervisor 检测端口恢复 → 自动转 running

## 预防

新工具注册流程（工具架宪法已有）应增加第 0 步：确认 projectPath 目录非空，且包含 startCommand 指向的入口文件。不满足 → 不走注册流程，先完成部署。
