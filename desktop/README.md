# 工具架托盘宿主（AgentboardTray）— 已废弃

> **⚠️ 2026-11-26 起不再使用，也不要再拿它给 `:3099` 保活。**
>
> 这个托盘宿主的使命已经结束：它当初是为了绕开"桌面快捷方式指向不存在的 `launch.bat`、且 3099 没有任何自启"。
> 后来查明真正的根因是 **supervisor 的清单路径 bug**（11-18 数据迁移后 `~/.agentboard/tools` 不存在，supervisor 每次启动即崩）。
> 该 bug 已在 `supervisor.js` 修复，`dashboard` 由 supervisor 按 manifest 的 `autoStart=true` 负责。**再加一层托盘只会造成两个守护争抢同一端口。**
>
> 当前状态：`AgentboardTray.exe` / `.ico` 已删除（仅保留源码作写法参考）；无进程、无开机自启；桌面入口是 `工具架.url`，双击开浏览器面板，图标取自 `web/logo.ico`。
>
> 保留本目录的价值：它是"根因未修就先用外部守护绕过"的**反面样本**，以及 WinForms 托盘 + SVG→ICO 生成的可复用写法。**不要据此认为 3099 需要托盘。**

## 后续（待办，暂缓）

工具架需要**桌面端入口**，长期目标是做成真正的桌面应用（壳内嵌面板 + 单实例 + 登录自启 + 服务状态），而不是浏览器快捷方式。当前没时间，先用 `工具架.url` 顶着。真要做时的前置条件：明确服务归属（3099 由 supervisor 管，不要再自带守护）、选定壳技术栈（WinForms 壳最轻，Electron/Tauri 视跨平台需求）。

---

双击 `AgentboardTray.exe` 的效果：**托盘出现图标 → 确保 `http://localhost:3099` 有人监听 → 打开面板**。
核心目的不是"加个壳"，而是让 :3099 在没人点它的时侯也在。

## 它做什么

| 能力 | 说明 |
|---|---|
| 服务保活 | 每 5 秒探测 `127.0.0.1:3099`，发现没监听就以**独立进程**启动 `node server.js` |
| 独立进程 | node 由 `UseShellExecute` 启动，**退出托盘不会带走服务**，Agent 侧（MCP / `/api/tools`）不受影响 |
| 单实例 | 命名互斥体；重复双击只打开面板，不会堆出第二个托盘图标 |
| 开机自启 | 启动文件夹快捷方式 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\工具架.lnk`，托盘菜单可勾选/取消 |
| 托盘菜单 | 打开工具架 / 状态 / 重启服务 / 打开日志目录 / 开机自启 / 退出托盘 |
| 可观测 | 自身动作写 `data\_runtime\tray.log`；node 输出写 `data\_runtime\agentboard-3099.out.log` |

打开面板时如果服务没在跑，会**先拉起再打开**，所以不存在"点了打不开"。

## 构建

```powershell
cd C:\Users\Administrator\.agentboard\desktop
pwsh -File .\build.ps1
```

- `make-icon.ps1` 按 `web/logo.svg` 的几何规格（绿底 `#74A63F` + 4 个圆角方块）生成 16–256 多尺寸 `AgentboardTray.ico`（BMP 格式 ICO，不依赖任何图像库）。
- `build.ps1` 用系统自带 `csc.exe`（.NET Framework 4.8）把 `AgentboardTray.cs` 编译成 `AgentboardTray.exe`（约 386 KB，图标占大头）。
- 零外部依赖、零 npm 包、无需管理员权限。

## 卸载 / 回退

1. 托盘菜单取消"开机自动启动"，或删掉 `Startup\工具架.lnk`；
2. 托盘菜单"退出托盘（服务继续运行）"；
3. 删掉本目录即可，服务本身是 `~/.agentboard` 里独立的 node 进程。

## 已知边界

- 只守护 **3099 一个端口**。若要覆盖"这一批常驻服务"，需要把 `Port` / `BaseDir` / 启动命令改成配置数组并循环探测；当前版本刻意保持单服务，避免误启 GPU 类重工具（ComfyUI、SD WebUI 等 44 个带端口工具里绝大多数不该常驻）。
- 托盘进程自身挂掉后没有第二层守护；需要的话可再挂一条计划任务（参考 `.supervisor\guard.ps1` 的模式）。
