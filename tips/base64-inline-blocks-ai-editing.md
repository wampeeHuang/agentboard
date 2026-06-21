# 不要把二进制资源内嵌到源文件里——base64 会让 AI 无法编辑

type: method
date: 2026-06-16
source: 个人作品集 V27（6.9MB HTML，base64 内嵌截图）重构为 V28（22KB HTML，外部 PNG 引用）

## 现象

6.9MB 的单文件 HTML，6 张截图用 base64 data URI 内嵌在 `<img src="data:image/png;base64,...">` 中。Read 工具即使只读 50 行也超 token 限制报错，Edit 工具完全不可用。整个文件的 CSS 和 HTML 结构都无法直接查看或修改。

## 根因

base64 编码让二进制体积膨胀约 33%，6 张 PNG 截图合计约 5MB，编码后近 7MB 全塞在一行里。AI 工具按行读取时，一行 data URI 就长达数 MB，直接击穿上下文窗口。人类也无法用普通编辑器打开这种文件。

## 修复/步骤

1. 把截图从 base64 解码回独立 PNG 文件，放到 `assets/` 目录
2. HTML 里改用 `<img src="assets/screenshot_xxx.png">` 外部引用
3. 结果：HTML 从 6.9MB 降到 22KB，可读可编辑

```powershell
# 从 HTML 提取 base64 → PNG（PowerShell）
$html = Get-Content index.html -Raw
$matches = [regex]::Matches($html, 'data:image/png;base64,([^"]+)')
$matches | ForEach-Object -Begin { $i = 0 } -Process {
  $bytes = [Convert]::FromBase64String($_.Groups[1].Value)
  [IO.File]::WriteAllBytes("assets/screenshot_$i.png", $bytes)
  $i++
}
```

## 预防

- **永远不用 base64 内嵌二进制资源到源文件**。图片、字体、音频一律放外部文件引用
- 项目 CLAUDE.md 写明这条规则：`HTML 文件不要内嵌 base64 截图——用外部 PNG 引用，保持 HTML 可编辑`
- 一个自检：源文件能用普通文本编辑器（VS Code / Notepad）正常打开并定位到任意行吗？打不开 = 架构问题
- 如果需要"单文件分发"，用构建工具打包，源码和产物分离
