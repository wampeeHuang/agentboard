# 插件按域隔离——大型 marketplace 插件不进全局 context
type: method
date: 2026-07-08
source: Vercel d0 案例启发 + PM 技能插件清量减负审计

## 现象

Marketplace 插件（如 phuryn-pm-skills）一次性注入 80+ 个技能到全局 Claude Code 会话。每次启动都加载，技能列表爆炸，AI 在 190 个技能中"迷路"——和 Vercel d0 砍掉 80% 工具同一个根因。

## 根因

Claude Code 的 `enabledPlugins` 是全局开关，默认安装即全局启用。插件开发者不会替使用者判断"这些技能在你的日常工作流中要用吗"——他们只会把全部技能打包发布。

## 修复/步骤

将领域专属插件从全局剥离到独立项目目录，按需加载：

```
1. 全局 settings.json → 关掉该插件的 enabledPlugins
   "pm-execution@pm-skills": false  (及同系列全部子插件)

2. 创建项目目录 D:\tools\{domain}-toolkit\.claude\settings.json
   只写两段：
   - enabledPlugins: { 该插件全系列: true }
   - extraKnownMarketplaces: { 插件 marketplace 定义 }

3. 项目目录加 CLAUDE.md 说明技能清单和使用方式

4. 需要这些技能时，从该目录启动 Claude Code
   项目 settings 覆盖全局，技能自动加载
```

## 预防

- 新装大型 marketplace 插件 → 先判断是"日常高频"还是"特定场景"
- 特定场景 → 按此模式隔离，不加入全局
- 日常高频 → 全局启用
- 判断标准：一周用不到 3 次的插件不值得进全局 context
