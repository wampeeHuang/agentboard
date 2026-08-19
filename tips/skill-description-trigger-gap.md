---
type: diagnosis
date: 2026-07-23
source: 用户说"PG 出来"，perspective-router 未触发，description 缺少"XX 出来"模式
---

# Skill description 触发词不全 → 路由静默失效，无报错

## 现象
用户说"PG 出来"想调用 perspective-router，skill 不触发。文件在、索引在、触发词大部分在，但 description 没覆盖用户的实际口语表达。静默失效——用户以为 skill 坏了，实际是路由不匹配。

## 根因
Claude Code 的 skill 路由依赖 SKILL.md description 字段做语义匹配。description 列了"用XX的视角""切换到XX""XX模式"等模式，但没有"XX 出来"这种口语化触发。用户不会按 description 里的语法说话。

## 修复/步骤
1. 回顾 skill 上线后用户实际说过的触发短语
2. 把遗漏的口语模式补进 description
3. 补完后用最短、最口语化的触发词验证路由生效

示例：perspective-router 的 description 从：
```
"用XX的视角""XX会怎么看""XX模式""切换到XX""如果你是XX""扮演XX的角色分析"时使用
```
改为：
```
"用XX的视角""XX会怎么看""XX模式""切换到XX""如果你是XX""扮演XX的角色分析""XX 出来"时使用
```

这不是一个 skill 的问题——所有 skill 的 description 都是路由合同，漏一个模式就漏一类用户。

## 预防
- 新 skill 上线后第一个动作 = 用最短、最口语的触发词验证路由是否生效
- description 写完后自问：用户可能用哪 5 种方式说出这个需求？全部列入
- 用户说"XX skill 没反应"→ 第一个检查项：description 是否覆盖了用户原话
