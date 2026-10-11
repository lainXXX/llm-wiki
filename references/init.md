# Init — 建一个 wiki

## 先确认根放哪

**默认：项目之外**（`~/knowledge/personal` 这类，**含 `AGENTS.md`/`raw/`/`wiki/` 的那一层**；`~/knowledge/` 本身只是 container），理由：

- 项目目录会被搜索、被打包、被 git 带上；wiki 进去就成了一部分，还可能被 `.gitignore` 漏掉；
- wiki 是**跨项目**的长期记忆，绑在某个项目里就失去了跨项目复利；
- 硬保证是"项目目录内创建的字节数 = 0"（见 SKILL.md「边界 · 越界」）。

`init` 检测到根在某个项目/仓库内部（向上找到 `package.json` / `.git` / `pyproject.toml`）时会**提醒但不阻止**。

## 建库

```bash
node <SKILL_DIR>/scripts/wiki_init.js --root=<绝对路径> --name=<库名> [--title="我的知识库"]
```

它会：

1. 建 `raw/` `raw/assets/` `wiki/` 与四个桶 `wiki/{sources,concepts,entities,syntheses}/`；
2. 写入 `wiki/index.md`、`wiki/log.md`、`AGENTS.md`（全套契约，模板来自 `agents-template.md`）、`CLAUDE.md`（一行指针）；
3. 把库登记进 `~/.llm-wiki/config.json`：

```json
{
  "default": "personal",
  "wikis": {
    "personal": "D:/knowledge/personal",
    "literature": "D:/knowledge/literature"
  }
}
```

> **注册表里存的是 instance root**——即含 `AGENTS.md` / `raw/` / `wiki/` 的那一层，**不是**知识层目录 `wiki/`，也**不是** container。

**建第二个库**：再跑一次 `wiki_init.js`，`--root` 指向**另一个目录**（想并排放就放在同一个 container 下）。`init` **不会**动已有的库——它只补缺、不覆盖（`looksLikeWiki` 判到已存在的 instance 时会提示"本次只做补缺"）。

**只在 stdout 打印一行提示，不写任何项目内文件**（旧版曾往项目 `CLAUDE.md` 追加指针，已删除——往别人的配置文件里塞东西是发布版 skill 最容易被嫌脏的行为，而且没有存在的必要）：

> 你的 wiki 在 `<path>`。以后在任何项目里直接说"把这篇 ingest 进去"就行。

## 根发现（agent 每次操作都要走）

```
① 对话里点名了具名库（"查一下 work 库"）→ wikis.<名字>
        ↓ 没点名
② ~/.llm-wiki/config.json 的 default      ← 绝大多数会话走这里
        ↓ 没有配置 / 名字查不到
③ 停下来问用户                             ← 绝不静默新建
```

- **不做平台分支**：`os.homedir()` 三平台都能解析 `~/.llm-wiki/config.json`。
- **没有 CWD 指针**：项目里放 `.llm-wiki.json` 的隐蔽行为是——把 project-a 连同指针复制成 project-b，b 就静默继承了本该属于 a 的库。对状态型知识库来说这种 implicit routing 不可接受。
- **脚本层用 `--name=<库名>` 点名第 ① 步**；`--wiki=<库名>` 是它的别名，两者等价（在 `parseArgs` 里归一化）。`--root=<路径>` 只留给测试与排查。
- **`area:` 管的是 instance 内部**（单值、词表 per-instance），**跨知识空间的边界才由"建多个库"承担**。两者职责不重叠：同一领域内的细分用 `area`，词表装不下彼此的领域才拆库。
- **拆库不是把知识切成孤岛**：库之间允许**显式跨库链接**（普通相对路径，见 `agents-template.md` §7），canonical 页只留一份、另一边引用。lint 把跨库链接记为 **INFO**，可达与否都不判错。
- 名字查不到就**报错并列出可用名字**，不猜、不模糊匹配。
- **别在 container 上跑 lint**：`~/knowledge/` 这种"装了库的普通目录"会被 lint 拒绝并列出候选库名——用 `--name=<库名>` 指到具体某个库。半建成的 instance 不受此限制。

## git：推荐，但不是前提

探测：`git -C <root> rev-parse --is-inside-work-tree`

| 能力 | 有 git | 无 git |
|------|--------|--------|
| 单次操作原子性 | 天然（in-tree 提交） | 写前备份 `*.bak-<ts>` |
| 回滚半成品 | `git checkout -- .` | 按 log 的 `[IN PROGRESS]` 清单逐个从 `.bak` 还原 |
| 审计"谁何时改了什么" | `git log` / `git diff` | 无历史；只有 `wiki/log.md` 叙述 + 失败现场 `.bak` |
| 幂等 / 崩溃恢复锚点 | sha256 + `wiki/log.md`（**不依赖 git**） | 同左 + `.bak` |

- git 已安装但 root 不在仓库内 → 询问用户是否 `git init`；拒绝就按无 git 路径跑（**不因为缺 git 而中止**）。
- 备份时机 = 改动**既有页**之前（新建页不用备份），文件名 `<原名>.bak-<YYYYMMDD-HHMMSS>`。
- **成功后立即删除本次的 `.bak`**；失败/中断才保留 → 于是"存在 `.bak`"本身就是"上次没跑完"的信号。
- ⚠️ wiki root 落在**某个更大仓库内部**时，`wiki_commit.js` 会拒绝自动提交（`git add -A` 会把无关文件带上）。此时让用户手动在 root 范围内提交，或把 wiki 挪出那个仓库。

## 首次 0→1

跑 `demo.md` 里的演示材料，让用户 10 分钟内看到 ingest 的完整效果。
