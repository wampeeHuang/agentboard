---
type: diagnosis
date: 2026-09-12
source: ComfyUI 0.19.3 本机；想用 Seedream/Gemini 等云端出图节点时发现必须登录 comfy.org
---

# ComfyUI 官方 API 节点强制走 comfy.org 登录，节点里没有自带 key 的余地

## 现象

本机 ComfyUI 的节点列表里明明有 `GeminiNanoBanana2`、`ByteDanceSeedreamNode`、
`FluxKontextProImageNode`、`KlingAvatarNode` 等云端节点，但**找不到填 API key 的地方**。
用户不想注册/登录 comfy.org，问"我有自己的 API 账号不行吗"。

## 根因

这批官方 API 节点（`comfy_api_nodes/`）的鉴权字段是**隐藏输入**：

```python
IO.Hidden.auth_token_comfy_org,
IO.Hidden.api_key_comfy_org,
```

即：**ComfyUI 当代理转发到 comfy.org，用该账号的额度计费**。
所以它们既没有 key 控件，也不能换成"你自己的 key"。查证方式：

```python
info = json.loads(urlopen("http://127.0.0.1:8188/object_info").read())
# 看某个节点的 required/optional 里有没有 api_key / token 字段
```

另有少数第三方节点是**显式填 key** 的（例如 `ComfyUI-MiniMaxH3-API` 的 `MiniMaxH3*` 节点带
`key` / `base_url`+`token`），但它们只覆盖特定厂商、特定能力（那个包只出视频）。

## 修复/步骤

按代价从低到高，三条路：

| 路线 | 做法 | 适用 |
|---|---|---|
| **A 绕过 ComfyUI，直连 API** | 自己写脚本调厂商的 OpenAI 兼容接口（`POST {base_url}/images/generations`，`Authorization: Bearer <key>`，参考图放 `image` 字段）。产物直接落项目目录 | **推荐**。不依赖任何登录、不受工具版本限制、参数完全可控 |
| **B 装第三方插件** | 例如火山方舟/即梦系的 `ComfyUI-Jimeng-API` 等 | ⚠️ **先核对版本要求**。实测有的插件要求 ComfyUI ≥ 0.25.1，而本机是 0.19.3 |
| C 登录 comfy.org | 官方路径 | 用户不接受时排除 |

**⚠️ 别为了装插件升级 ComfyUI。** 如果本机已经有一套**跑通过**的环境
（本机是 1968 个节点 + 14 个自定义节点：ComfyTV / ComfyUI-LTXVideo / MiniMaxH3-API /
WhatDreamsCost / GGUF / KJNodes …），升级会一次性动到全部。
判断标准：**当一个功能的代价是"把已验证可用的环境升级到未验证状态"时，先找不改环境的替代路径，
把升级列为最后手段。**

## 相关

- 直连时的尺寸坑见 tip `ai-image-api-size-follows-reference.md`。
- 环境版本是求值事实，别靠记忆：`GET /system_stats` 返回 `comfyui_version`。
