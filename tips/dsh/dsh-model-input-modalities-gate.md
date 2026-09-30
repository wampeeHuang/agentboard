---
type: diagnosis
date: 2026-09-24
domain: dsh
author: dsh-agent
source: 灵感图库表单改造会话（2026-09-24）：read_image 报 does not declare image input，据此误判模型无视觉；用户指出 deepseek-flash 有视觉能力，实测 API 证实是本地声明写错
---

# DSH 的 read_image 按 settings.yaml 的能力声明拒绝——声明写错会把整条多模态通道关掉

## 现象

`read_image` 读 PNG 直接失败：`model "deepseek-flash" does not declare image input`。
我据此判断「本会话模型没有视觉能力」，改用 CDP computed-style 数值验证，并告诉用户「视觉复核没有独立证据」。
用户指出：这个模型明明有视觉理解能力。

## 根因

`~/.dsh/settings.yaml` 的 `llm-deepseek.models[]` 里把 `deepseek-flash` 写成 `inputModalities: [text]`。
DSH 的图片通道**照这份声明**放行（`dsh-llm` 与 `dsh-tool-fs` 都读 `inputModalities`，不含 `image` 就拒绝），
所以「能不能看图」由**本地配置**决定，不是由服务端能力决定。拒绝信息长得像能力结论，其实只是配置事实。

## 修复/步骤

先打服务端最小请求确认能力（绕开一切本地声明），再改声明：

1. 取 key：`$env:DEEPSEEK_API_KEY=[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')`
   ——用户级环境变量**不会自动进新进程**。这也正是 `deepseek-vision` 工具报 `your api key: ****ined is invalid` 的原因：脚本读到 `undefined`，报错里那截就是 `undefined` 的尾巴。
2. 直接 POST `https://api.deepseek.com/chat/completions`，messages 里放一段
   `{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,…"}}`
3. **看 `usage.prompt_tokens` 判真假**：带图 ≈ 469（图真进去了）；纯文本模型 ≈ 111，且回答「我无法看到这张图片」。
4. 实测（2026-09-24）：`deepseek-flash` ✅ 读出了截图里的页面标题；`deepseek-v4-flash-vision-exp` ✅；`deepseek-v4-pro` ❌（文本模型）。
5. 改 `settings.yaml` 给该模型加一行 `- image`。该配置**热加载**：不用重启 DSH，下一次请求就生效（改完当场 `read_image` 成功）。

复用脚本：`D:\workspace\_lab\2026-09-01-灵感墙\_runtime\probe_vision_models.py`（多模型 + 图片缩放 + 只打印状态与回答，不打印 key）。

## 预防

- 工具报「不支持」时先分清是**服务端能力**还是**本地声明**；`does not declare` 这种措辞本身就是配置口吻。
- 用户的纠正（「这个模型明明能看图」）优先于工具的拒绝信息——是我们没配对，不是模型不行。
- 把「能不能看图」当**可实测事实**：一个 POST 脚本就能定案，别用一句「没有独立证据」把自己的退化方案说成客观限制。
