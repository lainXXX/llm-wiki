# Ingest — 把新源编译进 wiki

**前置检查**（有 git 时）：`git -C <root> status --porcelain -- <root>` 必须为空——**限定路径范围**，因为 wiki root 可能落在某个更大仓库内部，不加范围会把无关文件算进来。不空则中止，让用户先提交或回滚。无 git 时跳过。

**先查源是否已登记**：

```bash
node <SKILL_DIR>/scripts/source_status.js --file=raw/xxx.pdf
```

| 结果 | 动作 |
|------|------|
| `new` | 走下面的正常流程 |
| `unchanged` | 报告"未检测到新内容"，**不产生任何写入**（幂等） |
| `changed` | 走下面的**源变更**流程，不是原地覆盖 |
| `unknown` | 文件不在 `raw/` 下 → 先复制进去，再重跑 |

## 正常流程

```
登记 → 读约定 → 读源 → 生成变更计划 → (暂停点命中才确认) → 分步写入 → 更新 index → 收尾 log → (有 git 时) commit
```

1. **登记开始**：`wiki/log.md` 追加 `## [YYYY-MM-DD] ingest | <title> [IN PROGRESS]`，附预计触及的页面清单。**先记开始——这是崩溃恢复的唯一锚点。**
2. **读约定**：Read `AGENTS.md`（契约 + 领域区）；Read `wiki/index.md`（若已命中 M 档，改分节按需读 + grep）。
3. **确认源在 `raw/` 下**。用户给的是外部路径时，先复制进 `raw/`（这是唯一允许 agent 写 raw 的场合），并在 log 记 `source:`。
4. **读源正文**。含图片时见"图片处理"。
5. **生成变更计划（RFC）**：列出拟**新建**哪些页（type/area + 理由）、拟**更新**哪些既有页（改哪个小节、依据原文哪一句）、发现的**矛盾**。
6. **暂停点判断**：以 SKILL.md 的「必须问用户的事」表为准；命中才把计划交用户确认。
7. **分步写入（一次只改一页，顺序固定）**：
   - a. 写/更新 `wiki/sources/src-NNN-<slug>.md`（第一笔原子写入）
   - b. 写/更新涉及的 entity / concept / method 页——**每页先 Read 再 Edit**；新建页才用 Write。**放哪个桶由 `type` 决定**（映射见 `AGENTS.md` §3），放错桶 lint 报 Blocking
   - c. 更新 `wiki/index.md`
   - d. 追加 `wiki/log.md` 收尾条目
8. **矛盾处理**：见下。
9. **收尾**：把 log 的 `[IN PROGRESS]` 改成 `[DONE]`，补 `pages_touched:`、`sha256:`、（有 git 时）commit hash。
10. **收尾摘要**（不打断）：本次新建/更新了哪些页 + 自抽 1 处对既有页的改动，展示 diff 与原文依据。
11. 有 git 时 `node <SKILL_DIR>/scripts/wiki_commit.js --message="ingest: <slug>"`；无 git 时删除本次的 `*.bak-<ts>`。

**触及上限时**（见 SKILL.md「边界 · 上限」）：中止并提示"这个源影响面过大，建议拆分或先 lint"。弱关联概念写成 source 页里的"待链候选词（ghost mention）"，交给后续 lint 平摊。

## 源变更（论文出了 v2 之类的场合）

1. `source_status.js` 命中 `changed`（同路径、不同 sha256）。
2. **新开一个 `src-NNN`**（`node <SKILL_DIR>/scripts/new_source_id.js --slug=xxx`），正常走 ingest，新页 frontmatter 记 `supersedes: src-001`。
3. 受影响的既有页**不改写旧结论**：旧结论标 `status: superseded`（或对具体断言加注），新结论**追加**写入，`wiki/log.md` 记 `supersedes: src-001`。
4. 旧 source 页保留（`status: superseded`），**不删**。
5. **在新 source 页追加 `## Historical Notes`**，把"哪次 ingest 说过什么"记成叙述历史——旧认知因此可读、可追溯，而不是被新版本静默替换：

```markdown
## Historical Notes
- 2026-09-01（src-001）：最初 ingest 时结论为 X。
- 2026-09-17（src-002，supersedes: src-001）：源修订后结论改为 Y，原因是 Z。
```

**边界（不要越界承诺）**：

> **Wiki preserves derived knowledge history; it does not guarantee byte-level archival of prior raw-source versions.**

`raw/` 不可变 + agent 不写 `raw/`，意味着 agent **无法自动保住旧版本的字节**。"两个版本都留在 `raw/`"只能由用户自己做（复制成 `<名>.v1` 再改原文件），或交给 git 之类的外部版本层。补偿在 **`wiki/` 层**：旧结论、旧引用、日期、`## Historical Notes` 全保留；`wiki/log.md` 记下 sha256 变化供追溯。

## 图片处理

- **默认**：只提取 caption / alt / 上下文提及，在 source 页写占位符 `[image: raw/assets/xxx.png — 未解析]`，log 记 `images_unresolved: N`。
- **禁止**在 ingest 阶段批量多模态读图——高清图表逐张读取会急剧吃 token，引发截断或限流。
- **读图是 opt-in**：用户显式要求时才逐张读，一次一张，结果写进 source 页的图片要点段。
- **读不了就不编**：无法读图就保留占位符，绝不臆造图片内容。
- **委派给有视觉能力的 agent / 工具 / web skill**，把返回的文字描述写回页面。不要试图本地"猜测"图像内容。**不要写死某个具体 skill 的名字**（发布版不能依赖本机安装）。
- 未解析比例 >20% 时 lint 告警。

## 矛盾记录（Dialectical Record）

**绝不静默覆盖旧结论，绝不因为"新源看起来更新"就删旧观点。**

就地记在**受影响页面**内，**不建独立矛盾页**（独立页会形成"元讨论"，破坏可读性）：见 `templates.md` 的 `[!conflict]` 模板。

同时在页 frontmatter 打 `status: contested`，在 `wiki/index.md` 的 `## Tensions` 段加一行（**行尾照样带 `area:`**），`wiki/log.md` 记 `conflict: <页名>`。**裁决权在用户**——用户裁决后 agent 才改写结论并移除 callout。

## 防幻觉改写

对既有页的编辑**仅限三种**：补新事实（引原文）、加 conflict callout、按用户裁决改写。**禁止顺手润色**——定位到小节，不 touch 其他部分。可溯源与链接依据见 SKILL.md「边界」。

## 失败路径

步骤 7–11 任一步失败（报错/中断/上下文耗尽）：**不要手工回滚**。保留现场，把 log 的 `[IN PROGRESS]` 改成 `[ABORTED: <原因>]`。

下次会话启动时先 `grep "IN PROGRESS" wiki/log.md`；命中则提示用户按 `git checkout`（有 git）或 `.bak-<ts>` 还原（无 git）二选一。
