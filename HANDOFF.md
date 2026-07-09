# HANDOFF — agentboard 审计修复 (2026-07-08)

## P0 密钥泄露
- tencent-cloud-api: SecretId/SecretKey → 环境变量 TENCENT_SECRET_ID/KEY
- bigmodel-coding-plan: API key → ZHIPU_CODING_PLAN_KEY
- gpt-image-2: config.api_key 删除 → config.api_key_env

## P0 GFW 阻断
- index.html: Google Fonts CDN → 系统字体栈
- server.js pageShell: Google Fonts + 30处 JetBrains Mono → Cascadia Code

## P1 完整性
- page-agent 目录删除
- feishu-bot +startCommand +stopCommand
- catwave-pipeline/openmontage type project→cli
- paseo projectPath npm→%APPDATA%
- sole-prop-cockpit 目录+id 中→英
- yt-dlp/tesseract-ocr/workbuddy-wx +startCommand
- confucius4-tts type service→cli
- hermes/claude-code 删假 url

## 架构改进
- manifest-schema: 模型→本地模型(5)+远程模型(7)
- start.js: pm2 启动前 kill-port 3099
- server.js: 非 pm2 启动直接 exit(1)

## Tips
- node_e_orphan_process.md: node -e require() 占端口→pm2 静默失败

## 未做
- 5 disabled 工具保持现状
- gpt-image-2 不加假 startCommand

## 下一步
无。审计修复完成。
