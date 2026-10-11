---
areas: [ai, systems, programming, research]
stale_after_days: 90
language: zh
contract_version: 4
---

# 知识库契约（AGENTS.md）

> 这是**你（用户）侧**的契约文件，随 wiki 一起版本管理。
> 上面 frontmatter 的 `areas` / `stale_after_days` / `language` / `contract_version` 会被脚本读取。
>
> **两个区，两种改法：**
> - **契约区**（本文件上半部分）：结构、约定、三个工作流、恢复规则。agent 与用户**协同演化**——agent 可以提议改动，但要**先给 diff 让你确认**，不得自行覆盖。
> - **领域区**（从 `## 领域区` 开始）：area 词表、骨架扩展段、命名与标签偏好、ingest 深度、图片默认。**这是你的财产**，agent 改动前必须先问你。
>
> 若 agent 报告"契约版本落后"，做法是读 skill 的 `references/agents-template.md`，把差异**整理成 diff 提议**交你确认，而不是整文件覆盖。

---

# 契约区

## 1. 结构

```
<wiki-root>/                  ← instance root（库注册表里存的就是这一层）
├── AGENTS.md                 # 本文件
├── CLAUDE.md                 # 一行指针 → AGENTS.md（内容不得与本文件重复）
├── raw/                      # 层 1 · 证据（不可变）
│   └── assets/
├── wiki/                     # 层 2 · 知识
│   ├── index.md
│   ├── log.md
│   ├── sources/              # type: source | paper
│   ├── concepts/             # type: concept | method
│   ├── entities/             # type: entity
│   └── syntheses/            # type: synthesis
├── lint-report-YYYY-MM-DD.md # 一次性产物
└── .git/
```

三层各司其职：`raw/` 是**证据**（谁都不许改），`wiki/` 是**知识**（agent 在这里写），本文件是**维护规则**。

**instance root 之外还可以有兄弟 instance**：多个库可以并排放在一个**普通目录**（container，如 `~/knowledge/`）里，每个子目录各是一个完整 instance。container 只是人为约定——它有**目录名**但**没有** `AGENTS.md`，也不是 lint 的目标；`~/.llm-wiki/config.json` 是"有哪些库"的唯一真相源，注册表里存的是 **instance root**（不是 `wiki/` 子目录，也不是 container）。连接两个库的办法只有一种：跨实例链接（见 §7）。

**root 白名单**：instance root 只允许出现 `AGENTS.md`、`CLAUDE.md`、`raw/`、`wiki/`、`.git/`、`lint-report-*.md`、`*.bak-*`。多出任何别的东西，lint 报 Backlog `root 杂项`。（白名单只针对 instance root；container 层不放说明文件，见 §7。）

## 2. 页面类型（type）

| type | 是什么 | 命名 |
|------|--------|------|
| `source` | 非论文的原始资料（文章 / 博客 / 网页 / 书）的一方记录 | `src-NNN-<slug>.md` |
| `paper` | 学术论文 / 预印本，带 `authors` / `venue` / `year` | `src-NNN-<slug>.md` |
| `concept` | 概念、机制、原理 | `<slug>.md` |
| `method` | 可复用的方法、算法、流程 | `<slug>.md` |
| `entity` | 人、组织、产品、数据集 | `<slug>.md` |
| `synthesis` | 跨页综合、对比、结论 | `<slug>.md` |

新增 type 前先问用户——type 是分类主干，改它会牵动已在库里的所有页。**新增 type 只改本文件的领域区 + `type_to_bucket`，不动 skill。**

## 3. type → bucket（机器契约）

```yaml
type_to_bucket:
  source:    sources
  paper:     sources
  concept:   concepts
  method:    concepts
  entity:    entities
  synthesis: syntheses
```

**`type` 是 schema，bucket 是 filesystem projection——不要反过来。** lint 强制断言 `dirname(page) === type_to_bucket[type]`，违反是 **Blocking**（结构已损坏：放错桶的页会被 `new_source_id` 漏扫 → 撞号，也会被 index 完整性判成多余行）。

**桶只决定位置，不决定骨架。** `source` 与 `paper` 同桶但扩展段不同（见 §5）。

## 4. frontmatter

每一页（`wiki/<桶>/*.md`）必备：

```yaml
---
type: source | paper | concept | method | entity | synthesis
title: 中文标题
area: ai                     # 单一归属（不是列表），值应在本文件领域区的 area 词表内
created: 2026-04-02
updated: 2026-04-02
status: stub | draft | stable | contested | superseded
sources: [src-001, src-002]  # 多值
sha256: 3f9a…                # 仅 source / paper：源变更检测
source_path: raw/x.pdf       # 仅 source / paper：raw/ 下的相对路径
supersedes: src-003          # 仅源变更时出现
tags: [transformer, attention]
aliases: [可选的别名]
---
```

- `area` 是**单值**（`area: ai`）。它是纯语义标签，不参与物理结构——物理归属由 `type` 负责。多领域分类若真要，那是一次显式的 schema migration，不是顺手兼容两种形态。
- `sources` / `tags` / `aliases` 是多值 YAML 数组。
- `sha256` 与 `source_path` 是**成对**的：只有哈希不知道哈希的是哪个文件，源变更检测就做不了。

## 5. 页面骨架

**通用层**（全部 type 共用，不可省）：

```markdown
# <Title>     <!-- 与 frontmatter 的 title 一致 -->
## Overview   <!-- ≤150 字核心摘要 -->
## Details    <!-- 正文论述 + 链接 -->
## Tensions   <!-- 只在有矛盾时出现，不要预建空段 -->
## References <!-- 关联的 source 列表 -->
```

**type 扩展段**由本文件领域区声明；中间插或末尾追加均可。`Overview` / `Tensions` / `References` 在所有 type 都保留——`Tensions` 尤其要留，`concept` 与 `synthesis` 最常在这里体现"不同 Source 不一致"。

**骨架是写作约定，不是 lint 断言。** H2 集合有合理变体（用户可加段、type 可扩展），机械比对会误报。

## 6. 命名

- **文件即 slug**：小写、连字符、ASCII（`transformer-attention.md`）。中文标题进 `title:`，不进文件名。
- **桶内扁平**：不再有子目录。要细分用 `tags`。
- **source 编号** `src-NNN` 由 `new_source_id.js` **递归**扫四个桶取 max+1——不要手写编号。

## 7. 链接约定

内部链接一律用**标准相对链接**，路径相对**当前文件**：

| 从哪到哪 | 写法 |
|---------|------|
| 同桶页互链 | `[foo](foo.md)` |
| 跨桶页互链 | `[foo](../concepts/foo.md)` |
| `wiki/index.md` / `wiki/log.md` 里的链接 | `[foo](concepts/foo.md)`（相对 `wiki/`） |
| 页 → 源文件 | `[paper](../../raw/x.pdf)`（页面在两层深，**退两层**） |
| 跨实例（到兄弟库） | `[foo](../../../<兄弟库名>/wiki/concepts/foo.md)`（页面在两层深，**退三层到 container，再进兄弟库**） |

**跨实例链接**：库与库之间**允许**引用，但必须**显式**——写成上面那种普通相对路径（保持可点击），不引入 `wiki:` scheme，也不用 `[[wikilinks]]`。判定标准是"**链接解析后有没有逃出 instance root**"：落在 root 内 = 库内链接（缺失 → lint 报 Blocking `断链`）；逃出 root = 跨实例链接（**可达与否都只报 INFO `跨库链接`**，永不判错）。设计初衷：**拆的是上下文边界，不是知识之间的连接**——某个概念只在 A 库有 canonical 页时，B 库**引用**它，而不是复制一份。跨库引用不是污染，**无明确 namespace 的跨库引用**才是。

**禁用 `[[wikilinks]]`**——那会带上 Obsidian 专属假设，且标准渲染器（GitHub / VS Code）点不动。需要显示别名时用 `[显示文字](真实路径.md)`。

**代价（已接受）**：没有 backlink / 图谱面板。lint 的孤儿页检测自己扫链接目标即可。

## 8. 三个工作流

### 8.1 ingest（把源编译进库）

1. **前置检查**：`source_status.js --file=<源>` → `new / unchanged / changed / unknown`。`unchanged` 直接停手（幂等）。
2. 读本文件 + `wiki/index.md`。
3. 读源（图片默认只记 caption/alt 占位，见领域区）。
4. **写 log 条目** `[IN PROGRESS]`（崩溃锚点）。
5. 建/改页：**先 Read 再 Edit**，改既有页前写 `.bak`。
6. 触及既有页 ≥3 或发现矛盾 → **停下问用户**。
7. 收尾：新建 source 页入 `wiki/sources/`；其余按 §3 的映射入桶；更新 `wiki/index.md`（对应分区 + 行尾 `area:`）；把 log 的 `[IN PROGRESS]` 改成 `[DONE]`。
8. **硬上限 ≤5 个页面的变更**；装不下的弱关联记入 log 的 `TODO Updates` 段。
9. 收尾摘要展示 1 处 diff。

**源被改**：当作新源处理——新 `src-NNN` + `supersedes:`，旧页保留并置 `status: superseded`，新页追加 `## Historical Notes` 记"哪次 ingest 说过什么"。**raw 不保留字节级旧版本**（raw 不可变），知识历史由页面承担。

### 8.2 query（对库提问）

1. grep 优先：`rg -i "<关键词>" <wiki-root>/wiki <wiki-root>/raw`，配合 `wiki/index.md`。
2. 回答**必须引用具体文件路径**。库里没有的就明说"wiki 中无此信息"，**不许把模型自身知识混进 wiki 引用**。
3. 单次 query 读页 ≤8。
4. 回答**之后**才问是否归档（永不中断检索/推理）。
5. 归档 → 新建 `wiki/syntheses/<slug>.md`（`status: draft`），同步 index 与 log。

### 8.3 maintain（lint / 健康检查）

跑 `wiki_lint.js`，**只回传摘要（≤20 行）+ 退出码**，不要把几十个文件的全文灌进上下文。**完成判据 = 退出码 0**（即无 Blocking 项）。

## 9. 溯源规则（三条硬规则，防幻觉）

1. **每个主张都要能指回一个 source**。指不回去的，写进 `Tensions` 或明确标为推断。
2. **Edit 之前必须有一次 Read**。
3. **不许静默覆盖既有结论**——矛盾要并存（见 §10）。

## 10. 矛盾保全

不同源说法不一致时：**两种主张 + 各自来源 + 日期同时保留**，页面 `status: contested`，并在 `## Tensions` 写 `[!conflict]` callout，注明**是否已裁决**。**沉默 ≠ 否定**：源 B 没提 X，推不出"X 是错的"。

## 11. index 规则（`wiki/index.md`）

- 分区对应四个桶，加一个 `## Tensions`——分区名与目录名一致。
- 每行**必须含一条 markdown 链接**；**行尾必带 `area:<值>`**（`rg 'area:ai' index.md` 就是 area 视图）。
- **一页只出现一次**（防漂移硬规则）。
- **空分区省略**（仅约束维护期；init 出的初始骨架保留）。
- 仅在 ingest / query 归档 / lint 修复后更新，与相关页面同一 commit（有 git 时）。

## 12. log 规则（`wiki/log.md`，append-only）

格式：`## [YYYY-MM-DD] <op> | <标题> [<状态>]`，`op ∈ {init, ingest, query, lint, schema, gap, user-edit}`，`state ∈ {DONE, IN PROGRESS, ABORTED}`。

- ✅ `grep "^## \[" wiki/log.md | tail -5` 永远返回最近 5 条。
- `pages_touched:` 写**相对 root 的完整路径**（含 `wiki/`），一眼看出改动落在哪个桶。
- **源变更**不新增 op，复用 `ingest` 加 `supersedes:` 字段。
- `commit:` 字段可选——无 git 时省略，不写空字段。
- `TODO Updates` 段：被 ≤5 页上限截下来的弱关联更新需求记在这里，等用户显式指令或下次 lint 消化。

## 13. lint 规则

| 检查 | 级别 |
|------|------|
| 断链 / 悬空 source / index 漂移 / **桶错位** | **Blocking**（退出码 1） |
| 幽灵概念 / 孤儿页 / 未裁决矛盾 / 过期 stub / staleness / frontmatter / 图片未解析 / `.bak` 残留 / raw 未登记 / **root 杂项** / **契约版本落后** | Backlog |
| **跨库链接**（逃出 instance root 的链接，见 §7） | INFO（永不进退出码） |

## 14. 恢复规则

- **崩溃锚点**：log 里的 `[IN PROGRESS]`。会话启动若发现它，**提示用户恢复选项**，不自作主张。
- **半成品默认丢弃**。有 git → `checkout` 还原；无 git → 用 `.bak-<时间戳>` 还原，还原后删掉 `.bak`。
- **`.bak` 的存在本身就是"上次没跑完"的信号**——改既有页前写，成功后立刻删；失败才留下。
- **越界写入硬阻断**：任何写入前断言目标路径在 `<wiki-root>/` 之内，否则中止。这是安全边界，写进代码而非提示词。
- **用户手改优先**：发现未提交改动时先问用户，不覆盖。

---

# 领域区

> **下面这段是用户财产。agent 改动前必须先征得用户同意。** 你可以直接手改，改完 agent 会遵守。

## area 词表

```yaml
areas: [ai, systems, programming, research]
```

- 按你的实际领域改这一行。设成 `areas: []` 表示不检查（lint 跳过 area 校验）。
- 词表外的 area 会被 lint 列进 Backlog。

## 各 type 的骨架扩展段

| type | 扩展段 |
|------|--------|
| `paper` | `## Method`（方法与实验设置）、`## Results`（结果与结论）、`## Limitations`（作者自陈局限 + 你的补充质疑） |
| `source` | `## Historical Notes`（源变更时记"哪次 ingest 说过什么"） |
| 其余 | 暂无 |

## 标签与命名偏好

- `tags`: 自由词表，用到再加，别提前造词。
- 语言：`zh`（正文中文；专有名词保留原文）。
- 风格：H1 与 `title` 一致；段落长度默认 ≤5 行。

## 其他偏好

- **stale_after_days**: `90`（source / paper 页超期未更新 → lint Backlog `staleness`）。
- **ingest 深度**：摘要 + 关键论点 + 与既有页的连接，**不逐段复述原文**。
- **图片**：默认只记 caption/alt 与 `[image: …]` 占位符，不批量读图（用户显式要求时才逐张读）。
- **新页门槛**：被 **≥2 个源**引用，或用户显式要求；entity 需 **≥3 个具体属性** 或 **≥2 个关联**。
