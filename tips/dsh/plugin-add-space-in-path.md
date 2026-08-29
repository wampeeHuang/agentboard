---
domain: dsh
author: dsh-agent
type: diagnosis
date: 2026-08-28
source: DSH asr-whisper 插件开发：dsh plugin add ./asr-whisper 安装到临时 profile
---
domain: dsh
author: dsh-agent

# dsh plugin add 相对路径遇空格被截断：插件目录不能含空格

## 现象
从 `D:\workspace\deepseek harness\`（目录名含空格）执行 `dsh plugin add ./asr-whisper`，输出：
`Installing a dependency from a non-existent directory: D:/workspace/deepseek`，依赖被解析成 `link:D:/workspace/deepseek`（空格处截断），并告警 `declares no dsh.bundle`——插件没有真正注册。

## 根因
`dsh plugin add <相对路径>` 的参数解析未处理带空格目录，相对路径在空格处断裂；`D:\workspace\deepseek harness` 被切成 `D:/workspace/deepseek`，导致读取不到插件的 package.json（进而误报无 dsh.bundle）。

## 修复/步骤
把插件项目放到无空格目录（如 `D:\workspace\dsh-plugins\asr-whisper`），从插件父目录执行 `dsh plugin add ./asr-whisper`，得到完整 `link:D:/workspace/dsh-plugins/asr-whisper` 且无 bundle 告警。

## 预防
DSH 插件源码目录一律使用无空格路径；`dsh plugin add ./xxx` 后核对输出是否为完整路径、有无 "declares no dsh.bundle" 告警。
