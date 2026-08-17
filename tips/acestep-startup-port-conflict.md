# ACE Step 启动失败三件套：端口 8001 残留、显存虚报、前端端口 5173 非 3000
type: diagnosis
date: 2026-07-17
source: 用户反馈 ACE Step :5173 打不开，启动后批处理静默失败

## 现象
`start-all.bat` 跑完后浏览器打开 `:3000` 无页面。逐个检查发现 API `:8001`、Backend `:3001`、Frontend `:5173` 全都没监听。只偶见前端 `:3000` 上线但 API 和后端挂了。nvidia-smi 报告 12.3GB/16GB 已用，剩余 3.7GB，认为显存不足。

## 根因
**三层问题叠加，非单一根因：**

1. **端口 8001 被残留进程占用**（主因）。上次 ACE Step 异常退出后 Python 进程未清理（PID 15888），`npx kill-port` 有时杀不干净。uvicorn 启动时报 `[Errno 10048] 通常每个套接字地址只允许使用一次`，API 进程启动失败退出。

2. **WDDM 显存报告误导**。Windows WDDM 模式下 nvidia-smi 报告的 "Used" 包含 DWM 合成缓存 + driver standby 池，不是真正的 CUDA 占用。ComfyUI/MiniCPM-V 杀掉后数字不变，但 CUDA 可分配内存实际已释放。ACE Step 的 GPU 检测（`torch.cuda.get_device_properties`）能正确读到 15.93 GB 可用，与 nvidia-smi 数字矛盾。**不必等 nvidia-smi 数字好看才启动。**

3. **`start-all.bat` 第 108 行端口写错**。`start http://localhost:3000`，但 Vite 配置监听 `:5173`。浏览器打开永远是空白页。

## 修复
```powershell
# 1. 查谁在占端口
netstat -ano | findstr ":8001 :3001 :5173"

# 2. 用 PID 精确杀（不要只靠 npx kill-port）
Stop-Process -Id <PID> -Force

# 3. 验证端口全空
netstat -ano | findstr "LISTENING" | findstr ":8001 :3001 :5173"
# 无输出 = 干净

# 4. 手动启动（比 start-all.bat 可靠）
cd D:\tools\ace-step\ACE-Step-1.5
nohup uv run acestep-api --port 8001 > /tmp/ace-api.log 2>&1 &

cd D:\tools\ace-step\server
nohup npm run dev > /tmp/ace-backend.log 2>&1 &

cd D:\tools\ace-step
nohup npm run dev > /tmp/ace-frontend.log 2>&1 &
```

## 预防
- 启动前执行步骤 1-3，确认端口干净
- 不要信 nvidia-smi 的 "Used" 数字来判断能否启动 ACE Step，信 ACE Step 自己的 GPU 检测日志
- `start-all.bat` 的 `:3000` bug 已在 2026-07-17 修复为 `:5173`
- 每次用完 ACE Step 后手动关三个窗口，不要依赖进程自动清理
