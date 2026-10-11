# 模板 — index / log / frontmatter / callout

## frontmatter（所有 `wiki/<桶>/*.md`）

```yaml
---
type: source | paper | concept | method | entity | synthesis
title: 中文标题
area: ai                     # 单一归属，值必须在 AGENTS.md 领域区的 area 词表内
created: 2026-04-02
updated: 2026-04-02
status: stub | draft | stable | contested | superseded
sources: [src-001, src-002]
sha256: 3f9a1b2c4d5e            # 仅 source / paper：源变更检测
source_path: raw/x.pdf          # 仅 source / paper：raw/ 下的相对路径
supersedes: src-001             # 仅源变更时出现
tags: [transformer, attention]
aliases: [可选别名]
---
```

- `source_path` 与 `sha256` 是一对：脚本靠它们判断"这个源登记过没有、变了没有"。缺任一，lint 会报 frontmatter 问题。
- 没有的字段就**不要写**，不要留空值。
- **放在哪个桶由 `type` 决定**（`source`/`paper` → `sources/`，`concept`/`method` → `concepts/`，`entity` → `entities/`，`synthesis` → `syntheses/`）。放错桶 lint 报 Blocking。

## 页面骨架

```markdown
# <Title>

## Overview
≤150 字核心摘要。

## Details
正文论述 + 链接。事实性断言必须可溯源。

## Tensions
只在有矛盾时出现。

## References
- [src-001-attention-is-all-you-need](src-001-attention-is-all-you-need.md)
- [raw/attention.pdf](../../raw/attention.pdf)
```

`paper` 在 `Details` 与 `Tensions` 之间插 `## Method` / `## Results` / `## Limitations`；
`source` 在末尾追加 `## Historical Notes`（源变更时记"哪次 ingest 说过什么"）。

**链接深度**：页面在 `wiki/<桶>/` 下，距 root 两层——所以同桶互链写 `foo.md`，跨桶写 `../concepts/foo.md`，指 raw 写 `../../raw/x.pdf`。

**跨库链接**（到兄弟库的页）要**退三层**才到 container，再进兄弟库：`[foo](../../../<兄弟库名>/wiki/concepts/foo.md)`。它和普通链接没有语法差别——lint 只看解析后有没有逃出 root：root 内缺失 = Blocking `断链`，逃出 root = INFO `跨库链接`。**一个概念只在别的库有 canonical 页时，在这里引用它，不要复制一份**。

## 矛盾 callout

```markdown
## Tensions

> [!conflict] 2026-04-03
> [src-001](src-001-attention-is-all-you-need.md) 称自注意力复杂度 O(n²·d)；
> [src-003](src-003-xxx.md) 称 O(n·d²)。
> 差异源于 n 与 d 的定义不同（sequence length vs embedding dim）。
> **未裁决。**
```

裁决后：改写结论 + 移除 callout + 把 `status: contested` 改回 `stable`（这几步只在用户明确裁决后做）。
lint 靠"callout 里还有没有'未裁决'"来判断是否已闭合——所以**裁决后必须把这两个字去掉**。

## `wiki/index.md`

```markdown
# Wiki Index

> 最后更新: 2026-04-02 | 页面: 42 | 源: 15 | contract: AGENTS.md

## Sources
- [src-001-attention-is-all-you-need](sources/src-001-attention-is-all-you-need.md) — Transformer 原始论文摘要 · 2026-04-01 · area:ai

## Concepts
- [self-attention](concepts/self-attention.md) — 自注意力机制 · src-001, src-004 · area:ai

## Entities
- [openai](entities/openai.md) — 组织 · 2026-04-02 · area:ai

## Syntheses
- [transformer-vs-rnn-complexity](syntheses/transformer-vs-rnn-complexity.md) — 对比分析 · 2026-04-02 · area:ai

## Tensions
- [self-attention](concepts/self-attention.md#tensions) — src-003 与 src-001 对复杂度说法不一致 · area:ai
```

规则：

- 分区**对应四个桶**（加 `## Tensions`）——分区名与目录名一致，人从 index 点到文件夹不会遇到第二套命名。
- 链接**相对 `wiki/`**，所以写 `concepts/…` 而不是 `wiki/concepts/…`。
- 每行**必须含一条 markdown 链接**；**行尾必带 `area:<值>`**（`rg 'area:ai' index.md` 就是 area 视图）。Tensions 行也算普通行，同样带 `area:`。
- 一页**只出现一次**（不要为了分组让同一页出现在两处）。
- **空分区省略**（仅约束维护期；init 出的初始骨架保留）。
- 新增页在 ingest 步骤 7c 插入对应分区；删页同步删行。
- 更新时机：只在 ingest / query 归档 / lint 修复之后，且与相关页面同一 commit（有 git 时）。

## `wiki/log.md`

```markdown
# Wiki Log

格式: `## [YYYY-MM-DD] <op> | <title> [<state>]`
op    ∈ {init, ingest, query, lint, schema, gap, user-edit}
state ∈ {DONE, IN PROGRESS, ABORTED}

## [2026-04-02] ingest | Attention Is All You Need [DONE]
- source: raw/attention.pdf
- sha256: 3f9a1b2c4d5e
- pages_touched: wiki/sources/src-001-attention-is-all-you-need, wiki/concepts/self-attention
- images_unresolved: 0
- commit: a1b2c3d

## [2026-04-03] gap | 缺少 RNN 复杂度原始出处 [OPEN]
```

- **append-only**：不修改历史行，只追加。
- `pages_touched:` 写**相对 root 的完整路径**（含 `wiki/`），一眼看出改动落在哪个桶。
- `sha256` 是源变更检测的依据；`commit:` 无 git 时**省略**，不写空字段。
- 源变更**不新增 op**，复用 `ingest` 并加 `supersedes: src-001` 字段。
- **`schema` 这个 op 名保留不改**（虽然契约文件已改名 `AGENTS.md`）——改枚举会让既有 log 的历史行失效。
- **格式契约（可被脚本验证）**：`grep "^## \[" wiki/log.md | tail -5` 永远返回最近 5 条。
- `## TODO Updates` 段：被单次 ingest 触及上限截下来的弱关联更新需求写在这里，等用户显式指令或下次 lint 分批消化。

## 链接语法：标准 markdown

| 从哪到哪 | 写法 |
|---------|------|
| 同桶页互链 | `[foo](foo.md)` |
| 跨桶页互链 | `[foo](../concepts/foo.md)` |
| `wiki/index.md` / `wiki/log.md` / 回答里 | `[foo](concepts/foo.md)` |
| 指向源文件（页面内） | `[paper](../../raw/x.pdf)` |
| 跨库（到兄弟库的页） | `[foo](../../../<兄弟库名>/wiki/concepts/foo.md)`（页面在两层深，退三层到 container，再进兄弟库） |

- **禁用 `[[wikilinks]]`**：会让 skill 带上 Obsidian 专属假设，且 GitHub / VS Code 渲染器点不动。
- 显示别名天然支持：`[显示文字](真实路径.md)`。
- **跨库链接必须显式**：写成上面那种普通相对路径，判定只看"解析后有没有逃出 instance root"。root 内缺失 → Blocking `断链`；逃出 root → INFO `跨库链接`（可达与否都不判错）。canonical 页只留一份，另一边引用而非复制。
- 代价（已接受）：失去 backlink / 图谱面板；lint 的孤儿页检测自己扫链接目标，仍可行。
