# Claude Code 插件安装绕过 GFW
type: method
date: 2026-06-30
source: 安装 PM Skills Marketplace (phuryn/pm-skills) 时 GitHub 直连被墙

## 现象
`claude plugin marketplace add phuryn/pm-skills` 失败：SSH timeout 或 SSL/TLS connection failed。
git clone + curl 走 HTTPS 也失败，即使 Vortex 代理已运行且端口通。

## 根因
GitHub 被 GFW 阻断。curl/git 的 schannel SSL 后端与 Vortex 代理的 TLS 协商不兼容——CONNECT 隧道能建（HTTP/1.1 200），但后续 SSL 握手在代理处断开（"server closed abruptly"）。

## 步骤

```bash
# 1. 下载 zip（curl --tlsv1.2 --tls-max 1.2 是关键）
export HTTP_PROXY=http://127.0.0.1:7897
export HTTPS_PROXY=http://127.0.0.1:7897
curl -k --tlsv1.2 --tls-max 1.2 -L \
  "https://codeload.github.com/{owner}/{repo}/zip/refs/heads/main" \
  -o "$HOME/.claude/plugins/marketplaces/{repo}.zip"

# 2. 解压到 marketplace 目录
unzip -q "$HOME/.claude/plugins/marketplaces/{repo}.zip" \
  -d "$HOME/.claude/plugins/marketplaces/tmp-extract"
mv tmp-extract/{repo}-main "$HOME/.claude/plugins/marketplaces/{owner}-{repo}"
rm -rf tmp-extract

# 3. 本地路径注册（Windows 绝对路径，反斜杠）
claude plugin marketplace add "C:/Users/Administrator/.claude/plugins/marketplaces/{owner}-{repo}"

# 4. 正常安装插件
claude plugin install {plugin-name}@{marketplace-name}
```

## 预防
- 插件 marketplaces 都缓存在 `~/.claude/plugins/marketplaces/`，一次下载后可多次安装
- 更新时重新下载 zip 覆盖即可
- Vortex 运行时端口 7897，不要设成 7890（那是别的代理）
