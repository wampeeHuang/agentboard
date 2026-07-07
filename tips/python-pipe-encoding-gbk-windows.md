# Python管道stdin编码：Windows上echo|python中文乱码

type: capability
date: 2026-07-07
source: 深圳职位巡检飞书乱码事故

## 现象
飞书卡片消息中文全部乱码。`今日职位巡检 · 7月7日` → `浠婃棩鑱屼綅宸℃�� 路 7鏈�7鏃�`

## 根因
Windows上 `echo "$中文" | python3` 管道中，Python以系统codepage（GBK/cp936）读stdin，UTF-8字节被错误解码为GBK。

```
echo "今日职位巡检" | python3 -c "import sys; print(sys.stdin.read())"
→ '今日职位巡\xa3\x80'  (乱码)
```

## 修复
三种方式：

1. **env var**（全局，推荐）：`[System.Environment]::SetEnvironmentVariable("PYTHONIOENCODING", "utf-8", "User")`

2. **行内**（单次）：`echo "$VAR" | PYTHONIOENCODING=utf-8 python3 -c "..."`

3. **文件中转**（最安全）：写临时文件→python open(file, encoding='utf-8')→读取
```

## 识别
Python stdin.read() 结果含有 `\udc` 代理对 = 编码被破坏。看到 surrogatescape 错误标记时不要再发送。

## 误判陷阱
agent在终端看到乱码后错误判断为"本地终端显示问题，飞书服务端UTF-8处理正常"。这是致命误判——curl -d发送的已经是乱码body，铁证在Feishu API返回的 `body.content` 字段里。
