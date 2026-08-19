---
type: diagnosis
date: 2026-07-16
source: 海外历史汉化管线 Secrets_dHistoire 视频丢失
---

# yt-dlp archive.txt 不能作为文件存在证明

## 现象
`archive.txt` 记录 10 个视频 ID 已下载，但 raw 目录空无一物。脚本根据 archive 跳过这些视频，实际素材缺失。

## 根因
yt-dlp 的 `--download-archive` 只在下载完成后写入记录（这个保证是可靠的）。但 archive.txt 只是文本文件，不跟视频文件绑定——视频可以被手动删除、移动、磁盘清理，archive 完全不知情。archive 和磁盘是两个独立真相源，会静默漂移。

## 修复
管线中任何依赖 archive 做去重的场景，加一致性校验：

```python
# 读取 archive 中的 ID 列表
archived = set(archive_file.read_text().splitlines())
# 检查对应视频文件是否存在
missing = [vid for vid in archived if not any(raw_dir.glob(f"*{vid}*"))]
if missing:
    # 从 archive 中移除不存在的记录，或标记需重下
```

## 预防
- archive.txt 是"已请求过"的记录，不是"文件存在"的证明
- 定期或关键节点前做 archive vs disk 一致性检查
- 不要仅凭 archive 跳过下载——至少检查目录非空
