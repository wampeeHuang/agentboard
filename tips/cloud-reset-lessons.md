# Cloud 重置事故教训
type: diagnosis
date: 2026-06-11
source: OpenClaw Cloud 实例重置，gateway 丢失

## 现象
Cloud 实例重置导致：
- Cron 调度全部停摆（进化猫选题、个体户申报提醒）
- Agent 行为边界丢失（system prompt 在 gateway 不在 git）
- 配置重建靠人回忆，无 IaC

## 根因
三个结构性漏洞：
1. **宪法不进 git** — Agent system prompt 只在 gateway 热编辑，云重置蒸发
2. **调度依赖外进程** — Cron 全靠 OpenClaw gateway，一停全停
3. **恢复靠人记** — 无重建脚本，gateway 挂了要人工回忆怎么起

## 修复
- Agent 配置文件进 `claude-config` repo
- Agentboard 承担 cron 调度（v2.0）
- `launch.bat` + 配置模板，一键恢复

## 预防
- 永不把唯一副本放在不归 git 管的位置
- 永不依赖单进程提供调度能力
- 永不假设"配好了就会一直跑"
