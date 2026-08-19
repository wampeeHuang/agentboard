---
type: diagnosis
date: 2026-08-02
source: 版式画廊 `ensureStandardTokens()` 用 `brandKit.colorRoles.textSecondary || find('--text-soft')` 导致 12 个模板 :root 输出错误值，cobalt-grid 的 --text-soft 被 brandKit 的 `#888` 覆盖而非正确的 `#5560E5`
---

# 元数据/配置文件的值不能覆盖实际数据

## 现象
迁移脚本生成的 :root 块颜色值不对——`--text-soft` 本应是品牌色派生值（如 `#5560E5`），却输出了 `#888`（brandKit 默认值）。Validator 报 :root 与 tokens.json 不一致（12 个模板）。

## 根因
优先级反转。`ensureStandardTokens()` 的逻辑是：
```js
// 错误：元数据优先
const textSecondary = cr.textSecondary || find(['--text-soft', '--c-fg-2']) || '#888';
```
`cr.textSecondary` 来自 brandKit.colorRoles，是一次性手写后从未更新的快照。tokens.json 中的实际值才是真相。但因为 brandKit 先被读取，短路逻辑让它永远胜出。

正确顺序：
```js
// 正确：实际数据优先
const textSecondary = find(['--text-soft', '--c-fg-2']) || cr.textSecondary || '#888';
```

brandKit.colorRoles 是**迁移提示**（"这个模板大概是什么色调"），不是**数据权威**。实际 token 值才是真相。

## 修复/步骤
1. 反转所有 `ensureStandardTokens()` 和 `buildStandardRoot()` 中的优先级：先读 tokens.json 中的标准名变量，brandKit 作为 fallback
2. 创建 `sync-colorRoles.js` 将 brandKit.colorRoles 同步到实际 token 值，消除后续 validator 误报
3. Validator 的比较基准从 brandKit.colorRoles 改为直接读 tokens.json 颜色 token

## 预防
- 任何"配置/元数据 + 实际数据"双源场景，明确标注：谁是权威，谁是提示
- 权威源放 `||` 左侧，提示放右侧
- 设计文档中标注数据优先级链：`tokens.json > brandKit.colorRoles > 硬编码默认值`
- 生成器和校验器必须从同一权威源读取期望值——本案中 validator 读 brandKit 但 generator 读 tokens.json，两个真相源必然漂移
