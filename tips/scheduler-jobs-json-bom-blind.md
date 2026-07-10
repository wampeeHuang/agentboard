# BOM 污染 jobs.json → 调度器全盲，18 个 cron 任务集体静默

type: diagnosis
date: 2026-07-10
source: data.evopearl.com 今日数据未生成，排查发现 jobs.json 带 BOM

## 现象

- `/cron` 仪表盘显示 0 个任务（正常 18 个）
- 健康检查 `jobs.json 有效` 报 FAIL：文件缺失或无效
- 所有定时任务静默跳过——不报错、不执行、不告警
- `curl localhost:3100/api/cron/state?format=json` 返回 `"jobs":[]`，但 `tasks` 仍有 22 条运行时状态

## 根因

`jobs.json` 文件头被写入 UTF-8 BOM（`U+FEFF`）。Node.js `fs.readFileSync` + `JSON.parse` 拒绝解析带 BOM 的 JSON。

**BOM 来源**：PowerShell `Set-Content -Encoding UTF8` / `Out-File -Encoding UTF8` 会在文件头写入 BOM。Windows 上 PS 5.1 不支持 `utf8NoBOM`。

**为什么之前没炸**：jobs.json 由 Node.js 的 `fs.writeFileSync(path, data, 'utf-8')` 写入，不产生 BOM。本次 BOM 来自某次 PowerShell 脚本或手动编辑。

## 修复

**即修（已执行）**：
```bash
node -e "const fs=require('fs');let raw=fs.readFileSync('jobs.json','utf8');if(raw.charCodeAt(0)===0xFEFF)raw=raw.slice(1);fs.writeFileSync('jobs.json',raw,'utf8')"
```
调度器下一个 tick 自动重载，18 个任务立即恢复。

**架构加固（已执行）**：`scheduler.js` 和 `server.js` 各加 `readJsonFile()` helper，所有 JSON 读取点统一剥离 BOM。

```js
function readJsonFile(filePath) {
  var raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}
```

**关键点**：jobs.json 被两个进程读取（scheduler.js 执行 + server.js API），两边的 JSON 读取都必须加固。只修一边 = 另一边仍然会炸。

## 预防

三层防御：
1. **Agent 行为层**：全球 CLAUDE.md 强制所有 cron 操作走 `node ~/.scheduler/cli.js`——Agent 只跑命令，不碰文件格式/API 格式/编码判断
2. **读端加固**：`scheduler.js` + `server.js` 所有 JSON 读取点加 BOM 剥离——就算 BOM 再次注入，调度器不会盲
3. **机械操作脚本化**：`cli.js` 封装 REST API，Node.js 写入无 BOM，Agent 零裁量

健康检查抓到 `jobs.json 无效` 时应有告警——当前无通知机制，依赖人肉发现。
