---
type: diagnosis
date: 2026-08-25
source: Claudian 装进 Obsidian — 装完才发现需宿主 1.13.0，本机 1.12.7，触发整场升级
---

# Obsidian 插件安装前先读 manifest.json 的 minAppVersion 对照宿主版本

## 现象

插件装完启用后不加载/无响应，查 manifest 才发现其 `minAppVersion` 高于当前 Obsidian 版本，只能回头升级宿主（大工程）。

## 根因

`minAppVersion` 是插件声明的**最低宿主版本**硬 gate，低于它插件不工作。装前不看 = 装完才发现硬 blocker。Obsidian 版本落后于插件生态很常见，尤其是较新插件（如 AI 面板类常要求 1.13+）。

## 修复

安装前读插件 `manifest.json` 的 `minAppVersion`，对照当前 Obsidian 版本（设置 → 关于，或 `app.json` 的版本）。不够 → 先升级宿主或放弃该插件，别先装。

## 预防

- 本地装 Obsidian 插件固定流程：下载 → 读 manifest `minAppVersion` → 核对宿主版本 → 对齐 → 再启用。
- 发现宿主版本落后 → 评估升级成本（大版本升级可能影响其他插件），先问用户再动。
