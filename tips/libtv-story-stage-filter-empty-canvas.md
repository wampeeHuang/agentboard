---
type: diagnosis
date: 2026-09-12
source: 《token之歌》MV 分镜板；LibTV Studio 社区版 0.19.3-era 前端（film-gate-machine.js + app.js）
---

# LibTV 故事模式：卡片必须落进阶段，否则画布全空

## 现象

用 API 往 LibTV 画布写了一批卡片（每张都有内容、`cardTitle` 也对），打开界面**画布一片空白**；
或者打开后每张卡的抬头都显示「文本」。用户看到的是"我点进去，每一个卡片它都叫文本 / 画布是空的"。

## 根因

LibTV 的前端有一套**四阶段过滤**，不是"摆了卡就显示"：

```js
function storyStageEnabled(){ return S.workflow.nodes.some(n => n.data?.sixColumnShots); }
function storyStageVisible(n){
  if (!storyStageEnabled()) return true;                 // 老画布：全部显示
  const stage = S.storyStageProject === S.projectId ? S.storyStage : 'synopsis';
  const owner = n.data?.storyParent ? nodeById(n.data.storyParent) : n;
  if (stage === 'visual') return Boolean(n.data?.visualDesign);
  if (stage === 'shots')  return Boolean(owner?.data?.sixColumnShots);
  if (stage === 'scenes') return Boolean(owner?.data?.storyStructure && !owner.data.sixColumnShots);
  return Boolean(n.data?.synopsisCard || n.data?.cardTitle?.startsWith('梗概'));
}
```

顺序上最容易中招的是这条：**只要任何一个节点带 `sixColumnShots`，故事模式就开启**。
开启后画布**只显示当前阶段该显示的卡**，而新打开的画布默认停在 `synopsis`（第 1 阶段）——
要求卡片有 `synopsisCard: true` 或 `cardTitle` 以「梗概」开头。**一张都不匹配就是空画布。**

另一条同时发生的：卡片抬头取 `generationHeader(n, 'file-text', n.data.cardTitle || '文本')`，
所以**没有 `cardTitle` 的卡全部显示成「文本」**。

## 修复/步骤

**要么补齐五件套，要么别开故事模式。** 开故事模式需要这套字段（缺一不可）：

| 阶段 | 卡需要的字段 | 子卡怎么挂 |
|---|---|---|
| 1 梗概 | `synopsisCard: true`（或 `cardTitle` 以「梗概」开头） | — |
| 2 分场 | 主卡 `storyStructure: true`（且**无** `sixColumnShots`） | 子卡 `storyParent: <主卡 node id>` + `sceneKey` |
| 3 分镜 | 主卡 `storyStructure: true` + `sixColumnShots: true` | 同上 |
| 4 视觉设计 | `visualDesign: true`（可另带 `visualDesignState`） | — |

其他必需/易错项：

1. **参考图放槽位，不要做成画布上的独立素材卡。** 素材卡没有阶段归属、也没有连线，就是孤儿节点。
   视觉设计的槽位（`visualDesignState.sections[<key>].slots[i].assetId`）才是产品设计好的位置，
   那儿有图片预览、素材库下拉、「为什么选它」输入框。
2. **`editorialReview.gateMachine` 不能省**：阶段文档页（`renderEditorialDocument`）会无条件调用
   `filmMachine()` 和 `editorialBundle().gateMachine.requests`，缺了直接崩。至少要给
   `{version:'film-gates-v1', records:{}, events:[], requests:[]}`。
3. **门禁是硬约束，改表结构前先读 `film-gate-machine.js`**：分场表**正好九列**、分镜表**正好六列**，
   表头字符串与 `HEADERS` 逐字一致；行号 `SC\d+(_SH\d+)?`；时长(秒)是**纯数字**；
   每行必须有**且仅有**一张 `storyParent` + `sceneKey` 同步的子卡。自己加一列就会全行判失败。
4. **审查数据的 `sourceHash` 是正文的 FNV-1a 指纹**，必须与 JS `FilmGateMachine.fingerprint()` 逐位一致
   （注意它按**码点**迭代、`charCodeAt(0)` 取高位，emoji 要按代理对处理）。**改正文后必须重算**，
   否则门禁全部显示「待复审」。
5. **⚠️ 边在 `workflow.edges`，不在项目顶层。** 用 API 改画布时读错字段并回写空数组，
   **会一次清空所有连线**（实测清掉过 37 条）。回写前先断言边数与读入一致；出事了从
   `_libtv/画布快照.json` 恢复（节点 id 不变，边可直接复用）。

## 相关

- 同一套门禁的"正文与审查分离、版本绑定"另见 tip `version-bound-inline-review-gates.md`。
- LibTV 是全库单文件存储（所有画布塞在一个 `db.json`），必须配一个双向同步脚本把画布导出到项目目录，
  否则它不跟着项目走。
