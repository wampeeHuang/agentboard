# Codex marketplace add 走 git clone，需单独配代理

type: troubleshooting
date: 2026-07-03
source: 安装 cc-plugin-codex 时踩坑

## 现象

`codex plugin marketplace add sendbird/codex-marketplace` 报错：
```
fatal: unable to access 'https://github.com/sendbird/codex-marketplace.git/': Failed to connect to github.com port 443
```

Codex 自身的 config.toml 已配好代理，能正常对话和调 API。

## 根因

`codex plugin marketplace add` 内部执行 `git clone`，git 不走 Codex 配置的代理。Codex 的 HTTP 代理只覆盖 API 调用，不覆盖子进程的 git 操作。

## 修复

```bash
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
```

安装完成后可以取消：
```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

## 预防

任何 CLI 工具的 "plugin marketplace add" 类命令如果内部调用 git clone，都需要单独检查 git 代理配置。不要假设工具级代理配置会透传到 git 子进程。
