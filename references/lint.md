# Lint — 健康检查

**不做全文通读**（大 wiki 会爆上下文）。lint = 脚本 + grep + frontmatter：确定性检查必须脚本化，**禁止让模型"目测"几十个文件**——既烧上下文又不可复现。

```bash
node <SKILL_DIR>/scripts/wiki_lint.js            # 摘要到 stdout + 报告落盘；有 Blocking 时退出码 1
node <SKILL_DIR>/scripts/wiki_lint.js --json     # 给程序读
node <SKILL_DIR>/scripts/wiki_stats.js --by-area # 页数 / 字符数 / 各 area 分布
```

报告写到 `<root>/lint-report-YYYY-MM-DD.md`（**instance root 下**，白名单允许），分 `## Blocking`、`## Backlog`、`## INFO` 三段。

**在 container 上跑会被拒绝**：如果目标目录自己不构成库、但**直接子目录**里有库（如直接 lint `~/knowledge/`），脚本报错退出并列出候选库名，提示用 `--name=<库名>` 或 `--root=<container>/<库名>`。半建成的 instance（有 `wiki/` 但还没 `AGENTS.md`）不受此限制，照常体检。

## 检查项

| 检查项 | 归类 | 判据 |
|--------|------|------|
| **断链** | Blocking | 页内的 markdown 链接目标不存在（改页名就会命中）。**只对解析后仍落在 instance root 内**的链接生效 |
| **跨库链接** | **INFO** | 链接解析后**逃出 instance root** = 跨库引用。可达与否都只报 INFO，**永不进退出码**、永不判成断链。注册表只用来把消息写清楚（`跨库链接 → β/wiki/concepts/foo.md（可达）`） |
| **悬空 source** | Blocking | frontmatter 的 `sources:` / `supersedes:` 指向不存在的 `src-NNN` |
| **index 漂移** | Blocking | `wiki/<桶>/*.md` 没出现在 `wiki/index.md` 里 |
| **桶错位** | Blocking | `dirname(page) !== type_to_bucket[type]`（结构损坏：会被 `new_source_id` 漏扫 → 撞号） |
| **幽灵概念** | Backlog | `wiki/index.md` / `wiki/log.md` 里链接了不存在的页（目录宣称存在、实际没有）→ 候选新页 |
| **孤儿页** | Backlog | 没有任何**页**链接过来的页（index 的链接不算，否则永远为 0） |
| **未裁决矛盾** | Backlog | 页内 `[!conflict]` callout 里仍含"未裁决" |
| **过期 stub** | Backlog | `status: stub/draft` 且 `updated` 早于 30 天前 |
| **staleness** | Backlog | `source/paper` 页 `updated` 超过 `stale_after_days`（默认 90） |
| **源已变更** | Backlog | 页记录的 `sha256` ≠ `source_path` 文件的实际哈希（该走源变更流程）。已被新页 `supersedes` 且新页哈希对得上则不再报 |
| **源不存在** | Backlog | `source_path` 指向的文件找不到 |
| **raw 未登记** | Backlog | `raw/` 下有文件没被任何页面引用 |
| **frontmatter** | Backlog | 必需字段缺失、枚举值非法、`area` 不在词表、`source/paper` 缺 `sha256` / `source_path` |
| **image** | Backlog | `[image: ... — 未解析]` 占位符（比例 >20% 时值得处理） |
| **bak 残留** | Backlog | 存在 `*.bak-<YYYYMMDD-HHMMSS>` = 上次写入没收尾的现场 |
| **index 格式** | Backlog | index 条目行尾缺 `area:`（Tensions 行也算普通行） |
| **root 杂项** | Backlog | instance root 出现白名单外的条目（`AGENTS.md`/`CLAUDE.md`/`raw`/`wiki`/`.git`/`lint-report-*.md`/`*.bak-*` 之外） |
| **契约版本落后** | Backlog | 本库 `AGENTS.md` 的 `contract_version` < skill 当前版本 → **读 `references/agents-template.md` 整理成 diff 交用户确认**，不要整文件覆盖 |

## 输出与修复

- **Lint 只报告**。修复需用户确认，或用户预授权"自动修断链/孤儿"。
- 修完重跑一次→退出码应为 0。
- `.bak` 残留：先确认那次写入是否真的失败（对照 `wiki/log.md` 的 `[IN PROGRESS]`），确认无用再删——**不要**看到 `.bak` 就删。
- **Backlog 与 INFO 都不阻断完成判据**（退出码只由 Blocking 决定），但 `契约版本落后` 与 `root 杂项` 都该在收尾摘要里提一句。
- **INFO 是纯提示档**，目前只有 `跨库链接` 一类。它的用途是让跨库引用**可见**——不是让人去"修"它。看到"未落在已注册实例内"时顺带确认一下路径拼写对不对（那是唯一可能的真错误）。
- **误写层数会降级**：正常链接只需 0/1/2 层 `..`（同桶 / 跨桶 / 指 raw），连写 3 层才逃出 root——所以手误连写 3 个 `..` 会被算成跨库引用、报 INFO 而不是 `断链`。这是 v4 明确接受的代价。
