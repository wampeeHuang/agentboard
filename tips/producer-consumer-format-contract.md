# 数据管线生产者和消费者的格式契约必须在边界校验
type: diagnosis
date: 2026-08-02
source: 版式画廊 `infer-scales.js` 产出 `{level, size, unit}` 但 `brand-renderer.js` 期望 `{name, value}`，brand 页 500 错误：`Cannot read properties of undefined (reading 'replace')`

## 现象
brand 页 `/brand/stencil-tablet/` 返回 500。错误栈：
```
TypeError: Cannot read properties of undefined (reading 'replace')
    at buildTypeScaleTable (brand-renderer.js:584:28)
```
`t.name.replace(...)` — `t.name` 是 `undefined`。

## 根因
两个组件对同一数据结构有不同假设：

| 组件 | 角色 | 假设的格式 |
|------|------|-----------|
| `infer-scales.js` | 生产者 | `{level: 'display', size: 160, unit: 'px'}` |
| `brand-renderer.js` | 消费者 | `{name: '--sz-display', value: '160px', usage: 'display 级字号'}` |

生产者产出格式 A，消费者期望格式 B。中间没有校验层，数据静默写入 tokens.json，到渲染时才炸。

`infer-scales.js` 是"从 CSS 推断"脚本，按自然方式写了 `{level, size, unit}`。`brand-renderer.js` 的设计假设是 `{name, value}` 的标准格式。两边各自"合理"，合在一起断裂。

## 修复/步骤
1. 紧急修复：创建 `fix-scales-format.js` 转换 22 个模板的格式
2. 防御性修复：brand-renderer.js line 584 改为 `(t.name || t.level || '?')` — 消费者容错
3. 根治：没做（见预防）

## 预防
- 数据管线中，生产者和消费者之间加**格式断言**。`infer-scales.js` 写完数据后立刻用消费者的 schema 校验
- 消费者的字段访问加防御：`t.name || t.level || '?'` 一行代码防止整页 500
- 跨组件数据契约写进 schema 文件（如 `token-contract.json` 的 typeScale 条目），生产者和消费者都引用同一份 schema 定义
- 新建 producer 脚本时，第一件事是读 consumer 代码确认它期望什么格式——不假设
