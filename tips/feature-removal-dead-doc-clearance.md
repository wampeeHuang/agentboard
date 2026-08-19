---
type: method
date: 2026-08-18
source: 猫波信号站 EPUB+百度云下架，grep 抓出 manifest 孤儿字段 epub_chunk_sec
---

# 功能下架靠 grep 反查残留清零，不靠记忆判断「改完了」

## 现象

下架 EPUB + 百度云上传功能，删了 `gen_epub.py`、`validate_epub.py`、`stages/09-baidu-upload/`，同步改了 AGENTS.md、references/、docs/ 多处 HTML 文档。自认为改完了，grep 一查还有 `epub_chunk_sec` 孤儿字段残留在 `_shared/pipeline_manifest.py`，还有「成片/」「电子书/」目录描述散在各处。

## 步骤

下架或改名一个功能，按三层清理，每层 grep 反查旧关键词确认清零：

1. **代码层**：`git rm` 相关脚本，grep 确认无 import / 调用残留
2. **死文档层**：AGENTS.md、references/、docs/（含 `.html` 生产文档）、HANDOFF.md —— grep 旧关键词（如 `epub`、`baidu`、`成片`、`电子书`）
3. **manifest/配置层**：`pipeline_manifest.py` 的 STAGES / VALIDATORS / duration_profile —— 这里的孤儿字段最隐蔽，只能 grep 抓出来

验证命令：`grep -rn "旧关键词" 项目目录` 结果应为空（交接文件里的历史记录除外）。

## 预防

- 「改完了」的唯一判据是 grep 结果为零，不是「我记得都改了」
- 功能下架的连带范围永远比直觉多一层：代码之外还有死文档和 manifest 孤儿字段
