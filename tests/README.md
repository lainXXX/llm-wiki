# 验证说明

## 脚本级验收

在仓库根目录执行：

```bash
npm ci
npm test
```

`acceptance.js` 在系统临时目录中创建隔离的 wiki 和注册表，验证初始化、项目零污染、源状态与哈希、lint 检查项、分桶、规模判定、多库和契约稳定性。出现失败时退出码为 1；正常结束后会清理测试现场。

保留现场以便排查：

```bash
node tests/acceptance.js --keep
```

GitHub Actions 的配置见 [ci.yml](../.github/workflows/ci.yml)。

## 真实会话检查

以下行为由 agent 执行，验收脚本无法证明其正确性。修改对应工作流时，在单独的测试库中验证，并在 PR 中记录模型 / Claude Code 版本、场景和结果。

| 输出标记 | 场景与预期 |
|----------|------------|
| B2/B3/B5 | 按 [Ingest](../references/ingest.md) 导入材料，确认 log 状态流转、index 更新及失败后的恢复提示。 |
| C/D | 提供相互矛盾的资料，确认保留两方来源并交由用户裁决；按 [Query](../references/query.md) 验证缺口说明、读页上限及回答之后的归档确认。 |
| G1 | 记录单次 ingest 的上下文用量，检查是否满足当前约定的 token 增量上限。 |
| §5.1 | 构造涉及多页或大 diff 的导入，确认单次 ≤5 页、拟触及既有页 ≥3 时确认范围、diff >200 行时暂停 review。 |

完整边界以 [SKILL.md](../SKILL.md) 和对应工作流为准；首次流程可使用 [演示材料](../references/demo.md)。
