# ACE Step 歌词音乐生成 · 踩坑手册

> RTX 5060 Ti 16GB + ACE Step 1.5 turbo + 5Hz LM 1.7B，迭代 10+ 轮
> 2026-06-29，国宝主题曲实战

---

## 歌词铁律

### 字数上限：150 字
5Hz LM 上下文窗口 ~200 token，超出截断。

### 诱饵行（不跳过会丢前 4-6 行）
LM 1.7B 固定吃掉前 4-6 行当暖场/intro。**在歌词最前面加 4 行无意义内容供牺牲：**
```
啊～
啊～
啊～
啊～
```
诱饵不计入 150 字统计。真正歌词从第 5 行开始安全。

### 禁止 AI Format
**不要点「AI Format 优化歌词」。** LM 会自动加 `[Intro]` `[Verse]` `[Chorus]` 等结构标记 → 前奏变长、歌词被跳。纯文本直接粘贴。

---

## 参数推荐

| 参数 | 推荐值 | 为什么 |
|------|--------|--------|
| Duration | 80-100s | 超过 100s LM 覆盖不全 |
| LM CFG Scale | 3.0 | 默认 2.0，最高 3.0。15 会严重失真 |
| LM Backend | PT | VLLM 在 Blackwell(sm_120) 数值偏差 + 多占 7.6GB |
| Inference Steps | 20 | turbo 上限 |
| BPM | 110 | 中速国风 |
| Keyscale | C minor | 国风常用 |

---

## 引擎启动

### 正确命令
```powershell
.\.venv\Scripts\acestep-api.exe --port 8001 --host 0.0.0.0 --init-llm --lm-model-path acestep-5Hz-lm-1.7B
```
**不是** `acestep.exe`（那是 Gradio UI，没有 /format_input 端点）。

### .env 关键项
```
ACESTEP_LM_BACKEND=pt       # 不是 vllm
ACESTEP_INIT_LLM=true       # 不是 auto（env_bool 不认 auto）
```

### 启动顺序
Python 引擎(:8001) → Node API(:3001) → 前端(:5173)

---

## 已知硬限制

| 限制 | 原因 |
|------|------|
| 前 4-6 行被吃 | LM 结构性 intro 预留帧，模型行为非 bug |
| 4B LM 不可用 | gpu_config.py tier6b+ (≥20GB)，16GB 锁死 1.7B |
| turbo guidance_scale=1.0 | 架构设计，用 LM CFG Scale 补偿 |
| AI Format 加回标记 | LM 训练偏好 |
