# 项目搬家后路径残留导致定时任务静默失败

type: anti-pattern
date: 2026-06-25
source: 保障房导航 + 个体户台账从 D:\Claude code_workspace\ 迁移到 D:\workspace\lab\

## 现象

定时任务显示成功（绿色），Agent 在 stdout 里报告"巡检完成已更新 data.json"，但 scheduler 报 output_missing。文件在，但在不同路径——Agent 写了一个地方，scheduler 检查另一个地方，dashboard 的 server.js 读了第三个地方。

## 根因

项目从 `D:\Claude code_workspace\2026-05-29-深圳保障房导航` 搬到 `D:\workspace\lab\2026-05-29-深圳保障房导航`，但搬家后没有全局 grep 旧路径。三种引用各自漂移：

| 文件 | 旧引用 | 后果 |
|------|--------|------|
| 启动巡检.bat | `cd /d D:\Claude code_workspace\...` | 目录不存在，bat 失效 |
| server.js | `D:\HHH\个人杂项\个体户台账\data.json` | 硬编码读旧路径，dashboard 看的是另一份数据 |
| jobs.json output.path | `data\data.json`（子目录） | scheduler 核查这里，但 Agent 写到根目录 `data.json` |

三个引用指向三个不同的地方，没有单一真相源。Agent 自信地在 stdout 报告"已更新"，scheduler 同样自信地报告"文件缺失"——双方都对，只是不在同一个宇宙。

## 识别信号

- 项目目录最近搬过家
- grep 旧路径（如 `D:\Claude code_workspace`）在项目文件中仍有残留
- .bat / .sh / server.js / jobs.json / prompt 模板中有绝对路径
- scheduler 显示 output_missing 但 Agent stdout 报告成功

## 修复

搬家后检查清单：
1. 全局 grep 旧路径，逐条替换
2. 检查 jobs.json output.path 是否指向正确文件
3. 检查 server.js 是否有硬编码路径（windows 项目高发）
4. 重启 scheduler 让它读新 jobs.json
5. 跑一次手动触发，验证全链路：Agent 写 → scheduler 验 → git push → deploy → curl 200

## 预防

- 搬家前读 `D:\workspace\CLAUDE.md` §搬家 SOP
- 项目内用相对路径，不用绝对路径
- 跨项目用 projectName（workspace 宪法的唯一标识），不用路径
- `scheduler` 的 `output.path` 是真相源——Agent prompt、server.js、dashboard 都以它为锚
