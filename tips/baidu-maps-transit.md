# 百度地图公交路线实测
type: tool-recipe
date: 2026-07-01
source: 深圳13号线租房调研 · 通勤时间实测

## 用途

用 Chrome DevTools MCP 在百度地图网页上查询两地公共交通路线，获取实时耗时/距离/票价。适用于任何需要通勤/交通可达性评估的调研。

## 交互流程

### Step 1：进入地图 + 定位搜索框
navigate_page → map.baidu.com → take_snapshot → 找到搜索框 uid

### Step 2：填搜索词 → Enter
fill(searchBox, "从{站}到{目的地}") → press_key("Enter")

### Step 3：等结果
wait_for(text=["分钟","小时","最快"], timeout=10000)

### Step 4：读数据
take_snapshot → 路线面板第一条 = 最快路线（标"最快"/"最佳"）

## 关键词排歧法

这是最关键的技巧——不同站点名用不同搜索策略：

| 站点类型 | 搜索格式 | 交互步数 |
|----------|---------|---------|
| 无歧义站点（将围、光明城） | 方向面板直接改 textbox → Enter | 1步 |
| 有歧义站点（凤凰城） | fill 搜索词 → 出现城市选择器 → 选"深圳市" → 选"XX-地铁站" | 3步 |

**已知歧义**：凤凰城站 = 桃园市/菲尼克斯/深圳市三城同名
**已知无歧义**：光明城站、将围站（都是深圳唯一）

## 效率技巧

- 连续查多目的地上一个站：用方向面板的终点 textbox 改（uid 不变），比主搜索框快
- 连续查多起点：用方向面板的起点 textbox 改
- 别用 direct URL（/dir/A/B）——只定位不计算路线

## 不可行的方案（已验证）

| 方案 | 为什么不行 |
|------|-----------|
| Google Maps | 深圳13号线北段2026-06-28开通，Google 无数据 |
| 高德地图网页版 | 验证码墙 + 默认城市北京 |
| Baidu Maps JS API (evaluate_script) | 主地图页未加载 TransitRoute 模块，API endpoint 需认证 |
| 直接导航 /dir/{A}/{B} URL | 只定位地图中心，不触发公交路线计算 |
| WebFetch | 地图页是 JS 渲染，静态抓取无效 |

## 关联

- 调研方法库：`D:\workspace\research-methods\CLAUDE.md`
- Chrome DevTools MCP：通过 `mcp__ChromeDevTools__*` 工具族调用
