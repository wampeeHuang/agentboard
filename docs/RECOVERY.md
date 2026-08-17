# 灾难恢复

本文件是重建 agentboard 实例的唯一操作手册。不是文档，是 runbook。

## 恢复流程

```bash
# 1. 克隆框架
git clone https://github.com/wampeeHuang/agentboard.git ~/.agentboard
cd ~/.agentboard
npm install

# 2. 拉取个人工具注册表（私有 repo，仅 wampeeHuang 有权限）
git clone git@github.com:wampeeHuang/agentboard-tools.git tools

# 3. 启动
node server.js
# → http://localhost:3099
```

## 如果 tools/ 仓库不可用

跳过步骤 2。`tools/` 为空，从 `examples/` 复制模板重建。

## 日常更新

两个独立 repo，各自 pull：

```bash
# 框架更新（公共）
cd ~/.agentboard && git pull

# 工具注册表更新（私有）
cd ~/.agentboard/tools && git pull
```

框架 `.gitignore` 排除 `tools/`，`git pull` 不会覆盖或干扰个人注册表。

## 验证恢复成功

```bash
curl -s http://localhost:3099/api/tools | node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var t=JSON.parse(d);var a=t.tools||t;console.log((Array.isArray(a)?a:[]).length+' tools')})"
```
