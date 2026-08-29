---
domain: dsh
author: dsh-agent
type: method
date: 2026-08-28
source: asr-whisper 插件从零到验证通过（封装本机 faster-whisper）
---
domain: dsh
author: dsh-agent

# DSH 工具插件开发验证链：脚手架 → 临时 DSH_HOME 隔离验证 → 注册日志为证

## 场景
要把本机 CLI（如 faster-whisper）封装成 DSH 工具插件，且验证全程不污染正在运行的生产实例。

## 步骤
1. 脚手架：`npx create-dsh-plugin <name> -t tool -y`。关键价值：自动把 `@deepseek-ai/dsh-tools` 锁到 **next 版本线**（npm latest 是坏的 0.0.1-rc.1）
2. 实现工具：`ctx.tools.register(defineTool({...}))`；进程调用走官方 `ctx.subprocess.spawn({argv 数组, stdio:{maxBytes}, graceMs, signal})`，禁用 shell 字符串（防注入）
3. 构建：`pnpm run build`（tsc → dist/）
4. 隔离验证：`$env:DSH_HOME=<临时目录>` → `dsh plugin --profile headless add ./<插件>`（自动初始化临时 profile）→ `dsh --profile headless --dump-config | grep <插件>` 验证配置组合
5. 注册证据：插件加 `console.log("[x] registered ... listed=" + ctx.tools.get(...))`，`dsh --profile headless` boot 后 stdout 出现 `listed=true`
6. 底层冒烟：直接跑桥接脚本验证能力（如 `python scripts/transcribe.py in.wav --output out.json`）

## 注意
- 插件 bare import 依赖（如 @deepseek-ai/dsh-tools）boot 时从 profile 侧解析；**全新临时 headless profile 没有 DSH 栈**会 ERR_MODULE_NOT_FOUND——生产 web profile 天然含全套 @deepseek-ai 包，无此问题
- 插件源码目录用无空格路径（见 dsh plugin add 空格截断那条）

## 预防
新插件一律「脚手架 → 临时 DSH_HOME 隔离验证 → 通过后才 add 进生产 profile」，生产实例只在用户选定的重启时机生效。
