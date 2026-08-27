---
type: method
date: 2026-08-27
source: 新增 lib/principle-schema.js 未同步三棵树 → #audit 三树一致性 3 错误
---

# 新增 lib/*.js 模块 → 三棵树目录清单同步

## 现象

新建 `lib/principle-schema.js` 后，`http://localhost:3099/#audit` 三树一致性报 3 个错误：`lib/principle-schema.js` 文件在磁盘但树没列，AGENT.md / README.md / 使用说明书.html 三处各报一次。

## 根因

agentboard 有**三棵目录树**存的是同一份 lib 文件清单：
- `AGENT.md` §架构 树
- `README.md` §Dual-plane Architecture 树
- `docs/使用说明书.html` 目录树

新增 lib 模块只创建文件、没更新三棵树 → 树列少了新文件。`lib/tree-drift.js` 巡检（`auditTree`）抓出「文件在磁盘但树没列」。

## 修复/步骤

1. 新建 `lib/*.js` 时，同时在三棵树对应位置补一行（放在同类文件后，保持字母序）
2. 手动验证：`node -e "var td=require('./lib/tree-drift.js'); var r=td.auditTree(); console.log(r.total, r.errors)"` → `errors: 0`
3. 或直接开 `http://localhost:3099/#audit` 点「开始巡检」，确认三树一致性 0 错误

三棵树各自 scope 不同：AGENT.md/README 只列 `lib`+`web`，使用说明书.html 列 `lib`+`web`+`docs`+`mechanisms`+`examples`。

## 预防

- 改 `lib/` 下任何文件清单（新增/删除）后，先跑一遍 tree-drift 验证，再继续
- 新增 schema 文件（schema 驱动改造常产生）最容易漏——模块文件和树文档不同步是同一类静默漂移
