# OpenMontage：AI 视频生产模板库，不是 SaaS——二次开发是预期路径
type: capability
tool: OpenMontage (D:\tools\OpenMontage\)
scenario: 任何 AI 驱动的视频生产任务（纪录片、讲解视频、动画短片等）
date: 2026-08-03
recipe: D:\tools\OpenMontage\skills\meta\capability-extension.md

## 能力

OpenMontage（39K+ star, AGPL-3.0）是"可 fork 的模板库"，不是 SaaS 产品。52 个工具 + 13 条流水线 + 500+ Agent 技能——但实际使用时，**按项目写自定义 compose 脚本是预期路径，不是违规**。

## 关键认知（避免误用）

### 三条合成路线，项目启动时锁定

| 路线 | 适用场景 | 学习成本 |
|------|---------|---------|
| **Remotion** (React) | 动画讲解视频、信息图表、文字动效 | 需 React 基础 |
| **HyperFrames** (HTML/CSS/GSAP) | 动态图形、品牌视频 | 需前端基础 |
| **FFmpeg 直写** | 简单拼接、Ken Burns、字幕烧录 | 最低，但功能最受限 |

### README 和实际用法差距大

- README 说"禁止 ad-hoc 脚本"（Rule Zero）
- 实际：`skills/meta/capability-extension.md` 定义了四类项目级扩展：自定义脚本、自定义 playbook、项目级 skill、BaseTool 包装器
- 社区唯一完整产出（本机 Leopold 项目）用的就是 bespoke `compose_v4.py`

### 免费素材检索天花板

Pexels/Pixabay 对**特定人物、历史事件、罕见场景**直接失败。只有通用氛围主题（森林、海洋、城市、科技抽象）效果好。纪录片人物专题 → 素材不能全靠免费库。

## 为什么只能用这个

| 方案 | 为什么不行 |
|------|-----------|
| Runway/Kling/Sora | 素材生成器，不是制作系统（无拼接/字幕/音频管线） |
| Premiere/达芬奇 | 无 Agent 可编程接口，手动操作 |
| 纯 FFmpeg 脚本 | 无素材检索/场景规划/质量门禁，每次从零写 |
| OpenMontage 完整流水线 | 理想路径，但特定项目（中文纪录片/定制化需求）需要绕开走自定义脚本 |

## 实战数据

- 60s 视频端到端 10-30 分钟（Veo/Runway 是最慢阶段）
- 10min+ 视频 FFmpeg 合成阶段 OOM（12GB+），需分段
- Agent token 开销：60s 视频 200-500K token
- 社区实测成本：$0.02（历史纪录片）~ $1.33（Pixar 风格短片）
- 输出天花板：花 1% 成本做到 80% 效果，最后 20% 需人工

## 速查

```powershell
# 项目级扩展协议（必读）
Read D:\tools\OpenMontage\skills\meta\capability-extension.md

# 13 条流水线定义
ls D:\tools\OpenMontage\pipeline_defs\

# 项目案例（本机唯一完整产出）
ls D:\tools\OpenMontage\projects\leopold-aschenbrenner\_runtime\
```
