# SKILL.md 不在目录根 → 斜杠命令不出现，静默失效
type: diagnosis
date: 2026-07-03
source: 安装 caveman (JuliusBrussee/caveman)，`/caveman` 命令不出现

## 现象
Claude Code 的 `/command` 列表中找不到某个 skill，但 `~/.claude/skills/<name>/` 目录存在，文件也完整。无任何报错。

## 根因
Claude Code 扫描 `~/.claude/skills/<name>/SKILL.md` 来注册 skill。如果克隆的是一个完整 repo，`SKILL.md` 通常在子目录里（如 `skills/<name>/SKILL.md`、`src/skill.md` 等），不在目录根。Claude Code 找不到根级 `SKILL.md` → skill 静默不注册 → `/command` 不出现。

## 修复
```bash
# 找到实际 SKILL.md 位置
find ~/.claude/skills/<name>/ -name "SKILL.md"

# 复制到目录根
cp ~/.claude/skills/<name>/skills/<name>/SKILL.md ~/.claude/skills/<name>/SKILL.md
```

重启 Claude Code，`/command` 即出现。

## 预防
- `git clone` 任何 skill repo 后，先确认 `SKILL.md` 在目录根
- 不在根 → 复制或软链到根。用 cp 不用 ln -s（Windows 兼容性）
- 用户报「安装了但找不到 /command」→ 第一个检查项
