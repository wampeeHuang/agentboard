# 解耦默认集成后必须补文档指针，否则创造静默失败模式

type: pattern
date: 2026-07-30
source: evopearl-data — Vercel Git Integration 被解耦，但没在任何地方写"改代码后要手动部署"

## 现象

改了 config.json、index.html、prompt 文件，git push 到 GitHub。过了半天发现网站没变。排查发现 Vercel Git Integration 早被解耦了，部署只走 cron 链路的 `deploy.ps1`（等数据文件就绪才触发）。改代码不会触发部署。

## 根因

解耦一个默认集成（Vercel auto-deploy on push）时，做了减法（断开自动触发）没做加法（补文档告诉人什么时候手动触发）。默认行为被移除后，依赖默认行为的人不知道新路径在哪。

## 修复

**具体修复**：在项目 CLAUDE.md 加"部署触发"节，写清楚两条路径：

| 场景 | 触发方式 |
|------|---------|
| 数据更新 | 自动（cron 链路末端） |
| 代码/配置变更 | 手动 `powershell -File deploy.ps1` |

**通用原则**：每解耦一个默认集成，必须回答三个问题并落盘：
1. 原来自动发生的事现在怎么触发？
2. 哪类变更走哪条触发路径？
3. 指针写在哪（哪个文件的哪一节）？

不回答这三问 = 创造静默失败模式 = 下次一定有人踩。

## 适用场景

- 断开 Vercel/Netlify/Cloudflare Pages 的 Git auto-deploy
- CI/CD 从 push-trigger 改为 manual trigger
- 任何"默认自动化→手动控制"的架构决策
- webhook 被移除后的替代通知机制

## 预防

- 架构决策记录里，每个"移除自动X"配一条"替代触发方式Y + 文档位置Z"
- CLAUDE.md 的"部署"节永远写清楚触发条件，不假设读者知道默认行为
