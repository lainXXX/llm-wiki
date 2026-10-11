# 贡献指南

欢迎提交问题反馈、文档改进、测试用例和代码修复。中文或英文均可。

## 反馈问题

先搜索已有 Issues，避免重复报告。新问题请提供：

- Node.js 版本、操作系统，以及 Claude Code 版本（如涉及 skill 行为）。
- 最小复现步骤、执行的命令、预期结果和实际结果。
- 脱敏后的日志或最小样例；不要上传自己的完整知识库、个人路径或密钥。

涉及安全漏洞时，请遵循 [安全政策](SECURITY.md)。

## 本地开发

Fork 仓库后克隆自己的 Fork，在仓库根目录执行：

```bash
npm ci
npm test
```

脚本最低支持 Node.js 18；开发推荐使用 Node.js 22 或 24。GitHub Actions 会在 Ubuntu 和 Windows 上验证 Node.js 18、22、24。

`npm test` 使用操作系统临时目录创建测试库，并通过 `LLM_WIKI_CONFIG` 隔离注册表，不改动真实的 `~/.llm-wiki/config.json`。失败排查时可保留测试现场：

```bash
node tests/acceptance.js --keep
```

测试输出中的 `MANUAL` 是需要真实 agent 会话验证的行为；脚本测试通过不等于这些行为已被验证。

具体覆盖范围和真实会话检查清单见 [验证说明](tests/README.md)。

## 文件分工

| 路径 | 职责 |
|------|------|
| `SKILL.md` | skill 入口、触发条件和行为边界 |
| `references/` | 工作流、库契约模板、示例和规模策略 |
| `scripts/` | 初始化、源状态、lint、统计和提交脚本 |
| `scripts/lib/` | 根发现、路径、布局和 frontmatter 等共享逻辑 |
| `tests/acceptance.js` | 脚本级验收测试 |
| `tools/` | 维护与迁移工具 |

## 改动约定

- 一次 PR 聚焦一个问题；较大的功能或契约调整建议先开 Issue 讨论。
- 保留 `raw/` 不可变、库外写入限制、事实溯源和显式冲突记录等核心约定。
- 调整 type 与桶映射时，以 `scripts/lib/layout.js` 为准，保持脚本、模板、测试和文档一致。
- 修改用户已有库的结构或契约时，说明兼容性、迁移方法和恢复方式，不静默覆盖用户文件。
- 修复脚本行为时添加能复现问题的验收断言；仅改文档时核对命令和链接即可。
- 引入依赖时说明必要性，同时更新 `package.json` 和 `package-lock.json`。
- 修改 skill 工作流时，手动验证涉及的暂停点、归档确认等行为，并在 PR 中说明验证范围。

## 提交 Pull Request

1. 从默认分支创建工作分支，例如 `fix/source-status`。
2. 完成改动及相关文档，运行适用的检查。
3. 提交简明的说明，例如 `docs: clarify Windows installation` 或 `fix: handle missing source files`。
4. 在 PR 中说明问题、改动效果、验证结果，以及兼容性或迁移影响。

交流请聚焦事实和具体改进，尊重不同背景的参与者。恶意攻击、骚扰或泄露他人私人信息的内容会被移除。

## 贡献许可

提交贡献即表示你有权提供这些内容，并同意以项目的 [MIT 许可证](LICENSE) 分发。引用第三方代码或素材时，请保留其授权和归属信息。项目许可证不改变用户知识库中原始资料的版权。
