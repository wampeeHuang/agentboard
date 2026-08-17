# YouTube频道元数据≠存活：截图验证是入库前最后一道防线
type: diagnosis
date: 2026-07-18
source: O4美食跨境搬运 V5 23频道入库，3个元数据正常的频道实际已404/空号

## 现象

yt-dlp/search API返回的频道元数据（订阅数、视频数、频道名称）一切正常，但浏览器打开频道页面后发现：
- HTTP 404（频道已删除/终止）
- "This channel doesn't have any content"（频道清空）
- 页面重定向到YouTube首页（账号不存在）

基于元数据生成的中文标题、简介、评分全部作废。

## 根因

YouTube的搜索API和yt-dlp的频道信息提取有数据缓存延迟。频道被删除/清空/封禁后，元数据可能在数小时到数天内仍显示为有效频道。仅靠API返回的subscriber_count > 0或video_count > 0判断频道存活 = 不可靠。

具体到这次：M135(SAVEURS DU CONGO ET D'AILLEURS)、M138(MARVISSIMA)、M143(Racquel's Caribbean Cuisine)三条的enrich数据完整，但页面实际已死。

## 修复/步骤

管道正确顺序：

```
1. 搜索/筛选 → 生成候选列表
2. yt-dlp enrich → 获取元数据
3. 导入飞书（仅元数据字段）
4. 【阻塞步骤】Playwright截图验证每一个频道页面
5. 检测死频道：
   - HTTP status ≠ 200
   - page.title() 为空或"YouTube"
   - 页面文本含 "This channel doesn't have any content" / "404" / "unavailable"
6. 死频道 → 标记排除，不生成内容
7. 存活频道 → 生成中文内容 + 评分
```

检测脚本模板：

```python
from playwright.sync_api import sync_playwright

def check_channel(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        resp = page.goto(url, wait_until="load", timeout=30000)
        status = resp.status if resp else "?"
        page.wait_for_timeout(3000)
        
        dead_indicators = [
            "This channel doesn't have any content",
            "404", "unavailable", "does not exist"
        ]
        body = page.inner_text("body")[:500] if page.locator("body").count() > 0 else ""
        is_dead = any(ind.lower() in body.lower() for ind in dead_indicators)
        is_dead = is_dead or status == 404 or page.title() == ""
        
        browser.close()
        return not is_dead, status, page.title()[:80]
```

## 预防

- **截图验证必须在内容生成之前，不可颠倒顺序。** 这是管道中的阻塞步骤——不过不改下一张。
- 元数据驱动的管线天然有"假阳性"——看起来正常但实际死了。截图是唯一能抓出来的手段。
- 批量导入飞书时先只填元数据字段，截图通过后再回填中文内容字段。
- HANDOFF中明确标注评分来源（元数据估算 vs 视觉评分），诚实边界不模糊。
