# 巡检面板文字不要硬编码数字/列表

type: capability
date: 2026-07-10
source: supervisor 集成到 Inspector 巡检面板

## 现象
加第 5 个骨项目（supervisor）后，面板多处文字过期：
- 导航仍写"三块拼图"
- 骨副标题"四个服务"→ 应该五个
- 架构图"聚合三源"→ 应该四源
- supervisor 卡片底部无路径（路径渲染是 4 个硬编码 if，第 5 个没写）

每加一个项目就得多处改文字——而且很容易漏。

## 原则
**面板文字不硬编码任何会变化的数据。** 项目数量、名字列表、数据源数量——这些都是活数据，硬编码 = 必然过期。

## 做法

### 数量 → 动态生成或去数字
❌ `五个服务任一挂了影响全局`  
✅ 从 `D.bones` 动态生成 `inspector · scheduler · ... — 骨服务任一挂了影响全局`

❌ `四块拼图 → 巡检面板`  
✅ `多源汇聚 → 巡检面板`

❌ `三源数据统一展示`  
✅ `多源数据统一展示`

### 路径列表 → 共用数据对象
❌ 每个项目一个 `if (p.id === 'xxx')`  
✅ 统一 `projectPaths` 字典，骨肉共用一个查找

```javascript
var projectPaths = { 'supervisor': 'C:\\...', 'scheduler': 'C:\\...', ... };
// 骨和肉都用这个
if (projectPaths[p.id]) h += '<div class="ch-path">' + projectPaths[p.id] + '</div>';
```

### 两个维护点必然漂移
supervisor 路径不渲染的根因：骨路径用硬编码 if，肉路径用 projectPaths。加 supervisor 时只加了肉区的 projectPaths 条目，忘了给骨区写 if。两套代码做同一件事 → 必然有一个忘记更新。
