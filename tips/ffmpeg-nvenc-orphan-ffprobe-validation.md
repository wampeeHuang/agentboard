# ffmpeg NVENC 孤儿进程 + moov atom 缺失 → ffprobe 验证 + 杀进程重试

type: diagnosis
date: 2026-07-02
source: 猫波信号站 stage_08_render.py 渲染后 mp4 存在但 ffprobe 报 moov atom not found，3 次重试才成功

## 现象
ffmpeg NVENC 长视频渲染（1h+），subprocess.run 退出后 mp4 文件存在、大小正常（~1GB），但播放器和 ffprobe 都报错：moov atom not found。文件实质是损坏的。

tasklist 发现有一个 ffmpeg.exe 进程仍在运行（PID 50552，400MB RAM），独自吃 GPU 但不写任何文件。

## 根因
ffmpeg NVENC 编码时，子进程 wrapper（Python subprocess）因某种原因退出（可能是 GPU 超时、驱动中断），但 ffmpeg.exe 本体作为独立进程继续存活。moov atom 在编码完成时才写入文件末尾，孤儿进程永远不会写到那一步 → moov 缺失 → 文件损坏。

## 修复三步

### 1. 渲染前杀孤儿 ffmpeg
```python
def _kill_orphaned_ffmpeg():
    result = subprocess.run(
        ["tasklist", "/fi", "IMAGENAME eq ffmpeg.exe", "/fo", "csv", "/nh"],
        capture_output=True, text=True, timeout=10)
    for line in result.stdout.strip().split("\n"):
        if "ffmpeg.exe" in line:
            pid = line.split(",")[1].strip('"')
            subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
```

### 2. 渲染后 ffprobe 验证
```python
def _ffprobe_validate(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=codec_type",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=30)
    return result.returncode == 0 and "video" in result.stdout
```

### 3. 失败重试（最多 2 次）
验证不通过 → 删除损坏文件 → 杀孤儿进程 → sleep 3s → 重新渲染。

## 预防
- 长视频渲染总是加 ffprobe 后验证，不信任 subprocess 退出码
- NVENC 比 x264 更容易出孤儿进程（驱动层面），CPU 编码没有这个问题但速度慢 4x
- 渲染前后查 GPU 温度，>70C 时注意，>80C 等待降温
