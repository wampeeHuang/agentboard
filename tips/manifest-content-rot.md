# manifest 字段内容随项目变化而静默过时
type: diagnosis
date: 2026-07-02
source: catwave-pipeline 删除 stage_15_publish.py 后，manifest 的 capability 仍标"B站发布"，startCommand 指向已不存在的 _tools/pipeline-run.ps1

## 现象
工具卡片正常显示、API 正常返回，但卡片上的能力描述、启动命令、agent_notes 描述的能力实际上已经不存在。用户点"启动"按钮会失败（文件不存在），agent 读到错误的 capability 会误判工具能做什么。

和 manifest 编码损坏（卡片消失）不同——这次 JSON 完全有效，服务器开心地扫描通过。过时是**语义层**的，不是语法层的。

## 根因
agentboard 没做 manifest ↔ 项目实际状态的一致性校验。manifest 是一次性手写、然后被遗忘的快照。项目在演进（删脚本、改流程、换依赖），manifest 不会自动感知。

具体触发场景：
- 删除脚本文件（如 stage_15_publish.py）→ manifest 的 capability/agent_notes 还引用它
- 目录改名/移动（如 _tools/ → tools/）→ startCommand 路径断裂
- 功能标记为实验性/废弃 → description 仍称其可用

## 修复/步骤
1. 项目有任何功能性改动（增/删/废弃脚本、改能力边界）后
2. 打开 `~/.agentboard/tools/{id}/manifest.json`
3. 逐字段核对：description 功能列表、startCommand 路径、capability 一句话、agent_notes 流程描述
4. `curl localhost:3099/api/tools` 确认卡片仍可见
5. 如果有能力废弃但目录保留，在字段中标注 ⚠️

## 预防
- 项目 commit 涉及增删脚本/改能力时，顺手检查 manifest。养成习惯：改完项目 → git commit → 打开 manifest → 扫一眼 4 个关键字段
- 长期看：agentboard 可考虑给 manifest 加 `lastVerified` 字段，过 N 天未更新亮黄灯。但不急，手动纪律先到位
