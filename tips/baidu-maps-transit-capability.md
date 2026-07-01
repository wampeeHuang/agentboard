# Chrome DevTools 操控百度地图测中国城市通勤
type: capability
tool: Chrome DevTools MCP
scenario: 任何需要评估中国城市公共交通可达性/通勤时间的调研
date: 2026-07-01
recipe: D:\workspace\research-methods\_tools\baidu-maps-transit.md

## 能力

用 Chrome DevTools MCP 打开百度地图网页版，查询 A→B 公共交通路线，获取实时耗时、距离、票价。适用于任何中国城市通勤评估。

已知有效的操作序列：navigate_page → fill(搜索框) → press_key(Enter) → wait_for(分钟) → take_snapshot 读结果面板。

## 为什么只能用这个

| 方案 | 为什么不行 |
|------|-----------|
| Google Maps | 中国新开通地铁线路（如深圳13号线2026-06-28开通）无数据 |
| 高德地图网页版 | 验证码墙 + 默认城市北京 |
| Baidu Maps JS API (evaluate_script) | 主地图页未加载 TransitRoute 模块，需认证 |
| 直接 URL /dir/A/B | 只定位地图中心，不触发公交路线计算 |
| WebFetch | 地图页是 JS 渲染，静态抓取无效 |

**痛点**：凤凰城站有桃园/菲尼克斯/深圳三城同名歧义。搜索格式`{站名}站`可减少歧义，但仍需处理城市选择器弹窗。

## 速查

```powershell
# 进入百度地图
navigate_page → map.baidu.com
# 填搜索词
fill(searchBox, "从光明城站到中兴通讯总部")
# 等结果
wait_for(text=["分钟", "最快"], timeout=10000)
# 读面板
take_snapshot → 第一条=最快路线
```
