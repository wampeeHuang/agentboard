---
type: diagnosis
domain: general
author: claude
date: 2026-09-01
source: obs-shaderpicker 面板源下拉顺序与 OBS 底部源列表相反
---

# GetSceneItemList 返回 sceneItemIndex 升序，OBS 底部面板是前层在上

## 现象

用 obs-websocket 的 `GetSceneItemList` 填源下拉框，顺序和 OBS 底部源列表**相反**；
`GetInputList` 又会带回桌面音频和残留源（如已删除的"效果测试卡"）。

## 根因

- `GetSceneItemList` 返回的 `sceneItems` 按 `sceneItemIndex` **升序**（后层/先渲染在前），
  而 OBS Sources 面板视觉显示**前层在上**（倒序）——API 顺序 ≠ 面板顺序。
- `GetInputList` 返回**全部**输入源（含桌面音频、残留），不是"当前场景的源"。

## 修复/步骤

```js
const sc = await request('GetCurrentProgramScene');           // 取当前场景名
const si = await request('GetSceneItemList', { sceneName: sc.responseData.currentProgramSceneName });
const items = (si.responseData && si.responseData.sceneItems) || [];
// 与 OBS 底部列表一致：前层在上 → sceneItemIndex 倒序；同源去重
const sorted = items.slice().sort((a, b) => b.sceneItemIndex - a.sceneItemIndex);
const names = [...new Set(sorted.map(i => i.sourceName))];
```

## 预防

- 面板源下拉 = **当前场景**的场景项（GetCurrentProgramScene + GetSceneItemList），
  不要用 GetInputList
- 排序类问题先探针实测（`_runtime/probe_scene_order.js` 连真实 OBS 打印顺序），不猜
- 已落地为 `panel/app.js` syncSources + `_runtime/test-panel-sync.js`（10 断言含排序/去重）
