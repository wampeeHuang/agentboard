# EdgeOne Makers ≠ EdgeOne EO

type: product-trap
date: 2026-07-01
source: vivihuang 托管方案调研 · 2026-06-30

## 现象
EdgeOne 国际版有两个产品名字很像，选错=中国用户被 401 挡死。

## 根因
腾讯把 Pages 产品（类似 Vercel）改名叫 EdgeOne Makers，跟 CDN 产品（EdgeOne EO / 边缘安全加速平台）名字重叠。两个产品在国际版都有"全球可用区（不含中国大陆）"选项，但行为相反：

| | EdgeOne Makers（Pages） | EdgeOne EO（CDN） |
|---|---|---|
| 定位 | 静态托管（替代 Vercel） | CDN + 安全加速 |
| 国际版封中国 IP？ | **封（401）** | **不封** |
| 用途 | 替换源站 | 叠加在任何源站前面 |

## 修复
- 做 CDN 加速 → 选 **EdgeOne EO**（console.tencentcloud.com/edgeone），不是 Makers/Pages
- 验证方式：EdgeOne EO 站点列表页的「加速区域」显示"全球可用区（不含中国大陆）"，不等于封中国 IP

## 预防
- 看到 "EdgeOne" 先确认是哪个产品线：EO = CDN，Makers = Pages
- Makers 国际版封中国 IP 是产品策略（写在官方文档），不是 bug
- 唯一验证方法：手机关 WiFi 用移动数据打开域名，看是正常还是 401
