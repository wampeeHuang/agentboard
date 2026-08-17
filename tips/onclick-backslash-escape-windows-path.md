# HTML onclick 属性中 Windows 路径反斜杠被 JS 吃掉

type: diagnosis
date: 2026-07-27
source: catalog 项目总览点击项目名无法打开文件夹，报"Windows找不到文件'D:workspace音乐作坊'"

## 现象

- 浏览器点击项目名 → 调用 `openDir('D:\workspace\音乐作坊')` → 服务端收到的路径缺反斜杠
- Windows 报错：`Windows找不到文件'D:workspace音乐作坊'`
- 不报 JS 语法错误，静默传递错误路径

## 根因

Windows 路径的反斜杠在 JavaScript 字符串中会被解释为转义序列：

```
HTML:  onclick="openDir('D:\workspace\音乐作坊')"
JS解析: D:workspace音乐作坊          ← \w 非标准转义，\被丢弃
                                     ← \音 非标准转义，\被丢弃
```

三层管道：`服务器模板字符串` → `HTML onclick 属性` → `JS 引擎解析字符串字面量`。每一层都可能改变反斜杠含义，但 JS 引擎层最危险——非标准转义序列（`\w`、`\音`）静默丢弃反斜杠，不报错。

标准 JS 转义序列会变成其他字符：
- `\n` → 换行
- `\t` → Tab
- `\0` → null 字符
- `\x41` → 'A'

非标准序列（`\w`, `\音`, `\_`）→ 丢 `\`，留后面字符。

## 修复

服务器端模板渲染时对路径做 JS 字符串转义——反斜杠翻倍，单引号转义：

```js
function jsesc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
```

模板中 HTML title 属性用 `esc()`（HTML 转义），onclick 参数用 `jsesc()`（JS 转义）：

```js
// Before（反斜杠被吃）
'<a onclick="openDir(\'' + esc(dir) + '\')">'

// After（正确传递）
'<a onclick="openDir(\'' + jsesc(dir) + '\')">'
```

渲染结果：`openDir('D:\\workspace\\音乐作坊')` → JS 解析为 `D:\workspace\音乐作坊`。

## 预防

- Windows 路径进入 JS 字符串字面量（onclick、内联 script、模板字面量）必须 `\\` 转义
- `esc()` / `encodeURIComponent()` 不够——它们不处理反斜杠（反斜杠在 HTML 属性中是合法字符）
- 验证方法：curl 页面，grep `openDir`，确认路径中有 `\\\\`
