---
type: diagnosis
domain: general
author: claude
date: 2026-09-01
source: obs-shaderpicker release v1.0.0 上传中文 asset 名被 gh 静默损坏
---

# gh release 上传中文 asset 文件名会被静默损坏

## 现象

`gh release upload v1.0.0 OBS着色器选型器-汉化包-v1.zip` 上传成功，但 release 页面里文件叫 `OBS.-.-v1.zip`——中文和连字符被吃掉，下载链接失效。

## 根因

gh（GitHub CLI）上传 release asset 时对文件名做清洗，非 ASCII（中文）和部分字符被替换成 `.`。命令不报错，用户事后才发现名字坏了。

## 修复/步骤

- release asset 一律用 **ASCII 文件名**上传（如 `obs-shaderpicker-v1.zip`），中文名只用在 README / release 正文文字里展示
- 已上传损坏的先删再传：`gh release delete-asset <tag> <asset名> --yes`，再传 ASCII 名

## 预防

- 任何经 gh 上传的文件名先自检：全 ASCII、无空格、无中文，才上传
- 上传后 `gh release view <tag>` 列 asset 核对名字没被改
