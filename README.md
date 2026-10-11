# llm-wiki

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](package.json)

一个 Claude Code skill：把原始资料**增量编译**成互链的 markdown 个人知识 wiki，让知识随时间复利。

Claude Code skill for incrementally compiling source material into a linked, Markdown-based personal knowledge wiki.

不是聊天式文档问答，不是 RAG，不是一次性摘要工具。它是**跨项目**的长期外部知识记忆——同一领域内所有项目向同一个库贡献，也从同一个库受益。一个知识空间一个库；领域词表装不下彼此时才再建一个（**多库不是知识岛**，库之间可以显式互链）。

当前处于早期开发阶段（`0.1.0`），结构和契约可能继续演进。变化见 [更新记录](CHANGELOG.md)。

## 安装

需要 Claude Code、Node.js ≥18 和 npm；推荐使用仍受官方维护的 Node.js 22 或 24。Git 用于克隆本仓库，知识库本身可以在没有 Git 的情况下使用。

把本仓库放进 Claude Code 的 skills 目录。

macOS / Linux：

```bash
git clone https://github.com/lainXXX/llm-wiki.git ~/.claude/skills/llm-wiki
cd ~/.claude/skills/llm-wiki
npm ci
```

Windows PowerShell：

```powershell
git clone https://github.com/lainXXX/llm-wiki.git "$env:USERPROFILE\.claude\skills\llm-wiki"
Set-Location "$env:USERPROFILE\.claude\skills\llm-wiki"
npm ci
```

以下相对脚本路径均在 skill 安装目录下执行。在其他目录调用时，请使用脚本的绝对路径。

## 初始化一个库

macOS / Linux：

```bash
node scripts/wiki_init.js --root="$HOME/knowledge/personal" --name=personal
```

Windows PowerShell：

```powershell
node scripts/wiki_init.js --root="$env:USERPROFILE\knowledge\personal" --name=personal
```

库放在**项目之外**（`~/knowledge/personal` 这类），并登记进 `~/.llm-wiki/config.json`。`~/knowledge/` 本身只是一个**普通目录**（container）——它装着若干个库，自己不是库。多个库并排住在一起时，用 `--name=<库名>`（或等价的 `--wiki=<库名>`）点名要用哪一个。之后在任何项目里直接说：

> 把这篇论文 ingest 进去 / 查一下 wiki 里关于 X 的说法 / lint 一下 wiki

先用 [首次演示](references/demo.md) 中的材料体验完整流程；初始化细节见 [建库说明](references/init.md)。初始化脚本只建立结构，Ingest 和 Query 的知识编译由 Claude Code 按 skill 工作流执行。

也可以直接检查已注册的库：

```bash
node scripts/wiki_lint.js --name=personal
node scripts/wiki_stats.js --name=personal --by-area
```

## 三个操作

| 操作 | 做什么 |
|------|-------|
| **Ingest** | 新源编译进 wiki：新建/更新页面、更新 index、记 log，冲突就地留证 |
| **Query** | 双通道检索（grep + index）回答，每句带引用；回答后询问是否归档 |
| **Lint** | 断链 / 孤儿 / index 漂移 / 桶错位 / frontmatter / 未裁决矛盾 / `.bak` 残留 / root 杂项 / 跨库链接（INFO） |

## 库内分层

> 别把这里的"三层"和上面的库级归属混起来：**库级**是 registry → instance → `area`，**库内**是本节的契约 / 证据 / 知识。

```
<container>/          普通目录，人为约定；本身不是库
└── <name>/           库（instance root）
    ├── AGENTS.md     契约：结构 / 约定 / 三个工作流 / 恢复规则（协同演化）
    ├── CLAUDE.md     一行指针 → AGENTS.md
    ├── raw/          层 1 · 证据（不可变）
    └── wiki/         层 2 · 知识 —— 按 type 分四桶
        ├── index.md  ├── log.md
        ├── sources/  concepts/  entities/  syntheses/
```

**这不是纯粹的美学选择。** RAG 的产物是向量库——只能检索、不能阅读；这个 wiki 的产物是知识结构，**人和 agent 都读**。扁平目录对人不携带任何信息，所以知识页按 `type` 分桶。

## 设计要点

- **`raw/` 不可变，`wiki/` 可变**：wiki 保留派生知识的历史，不承诺保管 raw 的旧字节版本（那是 git / 备份的职责）。
- **越界写入 = 硬失败**：项目目录内创建的字节数 = 0——不写指针文件、不动项目的 `CLAUDE.md`。
- **git 是推荐能力，不是前提**：无 git 时用写前 `.bak` + 按 `log.md` 还原，能力差异有明确对照表。
- **冲突不静默覆盖**：`[!conflict]` callout + `status: contested`，裁决权在用户。
- **只在四个暂停点打断**，外加一个收口式归档确认。
- **契约与用户协同演化**：`AGENTS.md` 装在库里而非 skill 里，skill 升级靠 `contract_version` 检测落后 + 提议 diff，不自动覆盖。
- **多库拆的是上下文边界，不是连接**：`entities/` 不该把语义空间完全不同的东西混在一起，所以领域词表装不下彼此时拆库；但库之间**允许显式互链**——某个概念的 canonical 页只在一份，另一边**引用**而非复制。跨库链接记为 **INFO**，可达与否都不判错。
- 根发现：点名具名库 → `~/.llm-wiki/config.json` 的 `default` → 问用户（绝不猜、不静默新建）。

## 自检

```bash
npm test     # tests/acceptance.js：脚本级验收断言（隔离性 / 幂等 / 源变更 / lint 检查项 / 档位）
```

需要真实会话才能验证的行为项（暂停点、归档确认时机、上下文规模）在测试输出末尾列为 MANUAL。

## 依赖

Node ≥18，外加一个 `yaml`（解析 frontmatter）。有意不引入更重的东西，也不为了"零依赖"自研 YAML parser。

## 项目结构

```text
SKILL.md                skill 入口和行为边界
references/             工作流、契约模板、示例和规模策略
scripts/                确定性命令行脚本
scripts/lib/            根发现、路径、布局与 frontmatter 共享逻辑
tests/acceptance.js     脚本级验收测试
tools/                  维护与迁移工具
.github/                CI、Issue 和 Pull Request 模板
```

## 参与贡献

欢迎通过 GitHub Issues 反馈问题、提出建议，或提交 Pull Request。开发与验证流程见 [贡献指南](CONTRIBUTING.md)，漏洞报告见 [安全政策](SECURITY.md)。

维护者首次上传仓库可参考 [GitHub 上传指南](PUBLISHING.md)。

GitHub Actions 已配置 Ubuntu / Windows × Node.js 18、22、24 的验收测试；真实 agent 行为仍需按测试输出中的 `MANUAL` 清单验证。

## 许可证

本项目的代码、skill 和文档采用 [MIT 许可证](LICENSE)，允许商业使用、修改和再分发，分发时须保留版权与许可声明。第三方依赖遵循各自许可证。

此许可证不改变你导入知识库的论文、文章、图片等资料的版权归属；这些资料及其使用权限由各自权利人决定。本项目是独立社区项目，与 Anthropic 无官方隶属或背书关系。
