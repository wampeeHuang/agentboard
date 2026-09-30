---
type: diagnosis
date: 2026-09-18
domain: general
author: dsh-agent
source: 2026-09-18 找回 grid-ruler 浏览器扩展的复盘
---

# 我做过的工具找不到：索引只登记「可运行」工具，且路由没指向项目总览

## 现象

用户要找自己做过的浏览器扩展（网格标尺），只记得"应该在 D:\workspace\_lab 或 D:\tools"。实际在 `D:\workspace\grid-ruler`（工作区一级目录）。按全局宪法 §6 本机路由走"本地工具 → 工具架 :3099"，89 条里没有它；最后逐目录 glob `manifest.json` 才找到。记忆路径两处都错。

## 根因

三层索引各自漏一格，且没有互补关系：

1. **工具架（:3099，89 条）没有可归的卡型。** schema `TYPE_VALUES = service | cli | api | folder | group`，全是"可运行或可浏览"的形态。浏览器扩展没有端口、没有启动命令、没有触发词、不是待浏览目录 → 无处登记 → 从注册表消失。按 `扩展|插件|书签|extension|bookmarklet` 搜全库 **0 命中**（3 条疑似命中都是 `chrome` 子串巧合：xhs-scraper / bitbrowser-panel / wechat-chrome-session-bridge）。

2. **项目总览（:3104）确实扫到了它，但显示为空白行。** 该项目没有 `.project` / `.project.json` 声明 → 描述/技术栈/部署三列全 `—`；搜索字段只有英文 slug `grid-ruler`（`data-search="grid-ruler  "`），整个页面里"网格"出现 **0 次** → 用户按中文记忆搜不到。对照：`D:\workspace` 27 个一级项目目录中 9 个无声明，全是这种空壳行。

3. **inspector/projects-registry.json 只有 8 条人工登记项**（5 骨件 + 3 项目）——它是"我关心哪个项目"，不是"我有哪些项目"。grid-ruler 不在内。仓库无 remote，GitHub 也无从找回。

4. **路由缺一格（最关键）。** 全局宪法 §6「本机路由」列了「本地工具 → 工具架」「巡检 → projects-registry」，**没有列项目总览 :3104**——而 :3104 自己的 `agent_notes` 写着【何时用】"查看所有项目全局、**找特定项目**、了解部署状态"。答案存在，只是没有任何一条规则把 agent 指向它。

## 检索阶梯（怎么找回来）

1. `GET http://localhost:3104/` — 项目总览（扫 `D:\workspace` + `D:\workspace\_lab` 下的 `.project` / `.project.json`）
2. `GET http://localhost:3099/api/tools` — 工具架
3. 都没有 → 扫目录树的 `manifest.json`（扩展 / CLI 的天然指纹）：
   `Get-ChildItem D:\ -Recurse -Depth 4 -Filter manifest.json`
4. 还没有 → 按宿主应用反查（Chrome 的未打包扩展不在 profile 里，就是磁盘上一个普通目录，profile 里查不到任何痕迹）

## 预防

- 找东西先查索引再扫盘，别按用户记忆的路径直接 glob——记忆路径和真实位置经常不一致。
- 新项目落盘时补 `.project`（`name` 写中文名 + `description`），否则总览里是空壳行、中文搜不到。
- 浏览器扩展 / 书签 / 油猴脚本 / Obsidian 插件这类"寄宿在别的应用里"的工具目前无处登记，需要工具架 schema 增加不可执行的卡型（含宿主应用 + 加载路径），否则永远查无此物。
