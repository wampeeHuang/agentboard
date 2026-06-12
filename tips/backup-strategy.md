# .claude 备份策略
type: feedback

`~/.claude/` 目录是 Claude Code 的全部状态，丢失后无法自动恢复。

## 关键文件
- `.claude.json` — 主配置（MCP、skills 使用记录、项目注册、会话指标）
- `.claude/tools/` — 所有工具注册 manifest
- `.claude/skills/` — 所有已安装 skill
- `.claude/tips/` — 踩坑笔记
- `.claude/memory/` — 持久记忆

## 备份方法
1. 定期复制整个 `.claude/` 到 D: 或其他盘
2. 使用 git 追踪 dashboard 目录
3. `.claude.json` 单独备份（最核心的配置文件）

## 恢复优先级
1. `.claude.json` → 恢复 MCP 连接和 skill 注册
2. `tools/` → 恢复工具注册
3. `skills/` → 重新 `gh clone` 安装
4. `tips/` → 重新记录
5. `memory/` → 重新积累
