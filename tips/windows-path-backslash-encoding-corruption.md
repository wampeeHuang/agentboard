# Windows 路径反斜杠经多层编码后损坏，agent 在错误位置创建目录

type: diagnosis
date: 2026-07-08
source: D 盘根目录出现 D:\workspace_lab、D:\_runtime 两个多余目录，向上溯源修复

## 现象

- 盘符根层级出现看起来像正确路径但缺分隔符的目录（`D:\workspace_lab` 不是 `D:\workspace\_lab`）
- 目录内容有实际产出文件（JSON、视频中间文件），不是空壳
- agent 不报错，静默在错误位置创建目录并写入

## 根因

两条独立的路径解析失败汇聚到同一症状——管道末端 agent 在错误位置创建目录：

**链路 A — 反斜杠编码腐败**：`D:\workspace\_lab\2026\...` 经 PowerShell → temp file → JSON → agent prompt 多跳管道后，`\2`（反斜杠+年份前缀的数字2）被 Windows-1252 编码污染为单字节 `0x82`（Unicode ``）。路径变成 `D:workspace_lab6-05-31-...`，`D:` 后的 `\` 也丢了。OS 按字面解析 → 在 D 盘根目录创建 `workspace_lab`。

**链路 B — project_dir 为盘符根**：`runner.js:41` 用 `path.join(project_dir, '_runtime')` 创建临时目录。当 job 的 `project_dir` 未设置或 fallback 到 `D:\` 时，`_runtime` 就创建在盘符根目录。

## 修复

1. 用 Python `str.replace()` 把腐败路径还原：`'D:workspace_lab6-...'` → `'D:\\workspace\\_lab\\2026-...'`
2. 产出文件合并回正确位置
3. 删除盘符根层级的多余目录
4. 修复上游数据文件（jobs.json / temp_jobs.json）中所有破损路径

## 预防

**已实施（scheduler server.js 门禁，2026-07-08）**：

`validateWindowsPath()` 三道校验，创建/更新 job 时自动拦截腐败路径：

1. **盘符格式** — `/^[A-Za-z]:\\/` 正则：必须 `D:\...` 开头，`D:workspace` 直接拒
2. **控制字符扫描** — 遍历检查 `charCode` 0x80-0x9F（Windows-1252 非 ASCII 区间），命中 = 编码腐败，拒
3. **路径段数量** — `split('\\').length < 3` → 拒（腐败后分隔符丢失，`D:\workspace\_lab\2026-...\data\data.json` 正常情况下 6+ 段）

同文件 prompt 字段也加了控制字符扫描（0x80-0x9F），prompt 内有腐败字节同样拦截。

重启 scheduler 后生效：`node start.js`（guard.ps1 会定时拉起重启）。

**设计原则**：不在源头修编码（多跳管道本质复杂），在入口拦截。腐败路径不可能通过三道校验同时蒙混——段数对不上、缺反斜杠、或有控制字符，至少触发一条。
