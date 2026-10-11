---
name: llm-wiki
description: 个人知识库（LLM wiki）：把源增量编译进互链的 markdown 页面、对库提问并归档、健康检查。用户要往自己那个库里加材料（"把这篇 ingest 进去"）、问库里的东西、要"lint 一下 wiki"，或表现出累积意图（长期追踪某主题、反复加源、要把结论沉淀下来）时使用；泛指笔记软件（Obsidian/Notion）的日常使用、只要一次性摘要的请求不属于此。
---

# llm-wiki — 把资料增量编译成个人知识 wiki

## 这是什么

一个**长期外部知识记忆**，不是一个项目的文档库。原始资料被增量编译成互链的 markdown 页面，知识随时间复利：每次 ingest 让旧页更准，每次 query 的结论可以沉淀成新页。

- **不是**聊天式文档问答（丢一个 PDF 问"讲了啥"→ 直接读文件，别用这个 skill）
- **不是** RAG（无 embedding、无检索 API；检索只有 index + grep + 按需下钻）
- **不是**一次性摘要工具（一次探索的结论若不能沉淀成页面，就是没用对）

**一个知识空间一个库**：同一领域内所有项目向同一个库贡献、也从它受益，跨项目沉淀才是核心价值。但知识空间可以多于一个——计算机 / 文学 / 情感不是同一套 `area` 词表能装下的东西，硬塞进一个库会让 `entities/` 混进完全不同的语义空间。所以**多库是一级概念**（`~/.llm-wiki/config.json` 装 N 个），而**绝大多数人只用一个库**。多库**不是**互相隔绝的知识岛：库与库之间允许**显式**互链（见下「目录契约」后的跨库说明），**拆的是上下文边界，不是知识之间的连接**。

## 三个操作

| 操作 | 何时进入 | 详细步骤 |
|------|---------|---------|
| **Ingest** | 用户给了一个源（论文/文章/书/网页）要"加进 wiki" | Read `references/ingest.md` |
| **Query** | 用户对 wiki 提问，或要基于已有知识综合/对比 | Read `references/query.md` |
| **Lint** | 用户说"lint 一下"、怀疑库乱了、或 ingest 前自查 | Read `references/lint.md` |
| **Init** | 还没有库，或要再建一个库（另一知识空间） | Read `references/init.md` |

首次使用先跑 `references/demo.md` 里那段 ~300 字材料，10 分钟看到 0→1。
异常/幻觉/膨胀/契约漂移对照 `references/pitfalls.md`。

## 目录契约（速查）

```
<container>/                  ← 普通目录，人为约定；不是 instance，没有 AGENTS.md
└── <name>/                   ← instance root；项目之外，自带（可选）.git
    ├── AGENTS.md             契约本体：结构 / 约定 / 三个工作流 / 恢复规则
    ├── CLAUDE.md             一行指针 → AGENTS.md（内容不得重复）
    ├── raw/                  层 1 · 证据（不可变）；raw/assets/ 放图片
    ├── wiki/                 层 2 · 知识
    │   ├── index.md          内容目录（每页一行，分区对应四个桶）
    │   ├── log.md            追加式时间线（append-only）
    │   ├── sources/          type: source | paper
    │   ├── concepts/         type: concept | method
    │   ├── entities/         type: entity
    │   └── syntheses/        type: synthesis
    └── lint-report-*.md      lint 输出（一次性）
```

**知识页按 `type` 分桶**（`AGENTS.md` 里有 `type_to_bucket` 映射表，lint 强制 `dirname === bucket(type)`）。桶只决定位置，骨架仍由 `type` 决定。

**跨库链接**：库之间可以互链，写法就是普通相对路径（`[foo](../../../<兄弟库名>/wiki/concepts/foo.md)`）。判定只有一条——**链接解析后有没有逃出 instance root**：root 内缺失 = Blocking `断链`；逃出 root = INFO `跨库链接`（可达与否都不判错）。canonical 页不复制，另一边引用它。`[[wikilinks]]` 仍然禁用。

**根怎么找**（绝不猜）：

1. 用户在对话里点名了某个库（"查一下 work 库"）→ 用 `~/.llm-wiki/config.json` 的 `wikis.<名字>`
2. 没点名 → 用配置里的 `default`
3. 没有配置 / 名字查不到 → **停下来问用户**，不要静默新建一个库

**别在 container 上跑 lint**——那是"装了库的普通目录"，lint 会拒绝并列出候选库名。要指定某一个就用 `--name=<库名>`（或 `--wiki=<库名>`，两者等价）。

## 边界（不可协商）

- **越界** —— 写入前断言目标在 `<WIKI_ROOT>/` 内，否则中止；项目目录内创建字节数 = **0**（不写指针文件、不动项目的 `CLAUDE.md`）。
- **只读** —— `raw/` 不可变；唯一允许写它的场合是用户给了外部源要 ingest（`references/ingest.md` 步骤 3 是权威口径）。源被改 → 新开 `src-NNN` + `supersedes`，旧结论留在 `wiki/sources/` 新页的 `## Historical Notes`。wiki 保管知识历史，不保管 raw 的字节历史。
- **可溯源** —— 每句事实性断言对应 `sources:` 里的源或显式标 `（推测）`；每条**库内**链接的目标页真实存在（跨库链接不在此列：目标在别的库里，可达与否都不判错，见上「跨库链接」）。无法归属的句子不写。
- **上限** —— 单次 ingest 触及页面 ≤5（超出就拆，弱关联写进 log 的 `## TODO Updates`），diff >200 行时暂停让用户 review；既有页只做区块级追加／注记，禁整页重写；Edit 之前必须先 `Read`（用户会手改）。

## 必须问用户的事

| 时机 | 问什么 |
|------|--------|
| 拟触及既有页 ≥3 | 确认改动范围 |
| 发现矛盾 | 谁来裁决（就地记 `[!conflict]`，不替用户选） |
| 上一步失败／中断 | 如何继续 |
| 想改 `AGENTS.md` 的**领域区** | 明确同意（契约区的改动一律先给 diff） |
| Query 回答完、结论可复用 | 是否归档成页面（**在回答之后**，绝不中途插问） |

前四行**打断**流程（停下来等）；末行是**收口**（答案已给出，只问要不要沉淀）。其余情况直接做完，在收尾摘要里说明做了什么。

## 规模

档位（S/M/L）由 index 的**非空白字符数**与页数决定——不是 `wc -w`，按空白分词会让中文永远判 S 档。当前档位用 `wiki_stats.js` 查；档位判据与对应检索策略见 `references/scale.md`。

## 确定性脚本（必须跑，不用目测）

```bash
# <SKILL_DIR> = 本 skill 的安装目录（见 SKILL.md 顶部的 Base directory）
node <SKILL_DIR>/scripts/wiki_init.js --root=<目录> --name=<库名>   # 建库 + 注册
node <SKILL_DIR>/scripts/source_status.js --file=raw/x.pdf          # ingest 前查：new/unchanged/changed
node <SKILL_DIR>/scripts/new_source_id.js --slug=<slug>             # 取下一个 src-NNN
node <SKILL_DIR>/scripts/wiki_lint.js                               # 健康检查（有 Blocking 时退出码 1）
node <SKILL_DIR>/scripts/wiki_stats.js [--by-area]                  # 页数 / 字符数 / 档位
node <SKILL_DIR>/scripts/wiki_commit.js --message="ingest: <slug>"  # 规范化提交（无 git 是 no-op）
```

**路径纪律**：脚本路径以 skill 目录为基准，**不是 agent 的 CWD**（通常是用户项目目录）。照抄成 `node scripts/x.js` 会 `MODULE_NOT_FOUND` 退出 1。

根由脚本自己发现（`--name=<库名>` 可指定，`--wiki=<库名>` 是它的别名；`--root=` 仅测试用）。`wiki_init.js` 是唯一的 wiki root 之外写入——它把库注册进 `~/.llm-wiki/config.json`，加 `--no-register` 可跳过。

**完成判据**：`wiki_lint.js` 退出码 0——Blocking 归零才算这一步做完（Backlog 与 INFO 都不进退出码）。
