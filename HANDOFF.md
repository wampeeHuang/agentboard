# HANDOFF 2026-07-02

## 已做
- evopearl.com 全部 6 子域名 SSL 正常（EdgeOne 免费证书），HTTP 200
- DNS 从 Cloudflare 迁移到 DNSPod（NS: porpoise.dnspod.net / june.dnspod.net）
- 6 个域名 CNAME 指向 EdgeOne 专用地址（非泛域名）
- Google Fonts 全部清零（6/6 站点）
- 腾讯云 API 注册到工具架 `tencent-cloud-api`（含双账号区分、API 凭证、EdgeOne CNAME 表）
- manifest-schema.js 增加 CATEGORY_VALUES 枚举校验 + 分类语义交叉验证
- 新 tips: edgeone-cname-per-domain-not-wildcard.md, vercel-dual-project-domain-conflict.md
- codex 502 排查 — 根因 codex-relay(:4446) 未启动
- tool-registry.js 四修（端口+进程双重验证、轮询、netstat 日志、tasklist 批量缓存）
- tip: port-listening-not-means-running.md

## 当前状态
全部 6 站点正常运行：data / gallery / vivihuang / forma / minds / shuiwuyou.evopearl.com

## 已知遗留
- 43 个版式画廊模板仍含 Google Fonts（用户决定不处理模板）
- vivihuang portfolio `_archive/` 下有 27 个归档文件含 Google Fonts（未部署）

## 下步
- 后续 DNS 操作在 DNSPod 国内站控制台手动改（API key 无 DNSPod 权限）
