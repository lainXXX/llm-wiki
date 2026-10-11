# Query — 基于 wiki 回答，并可选归档

```
判类型 → 双通道检索 → 合并候选（≤8 页）→ 回答（每句带引用）→ 缺口记录 → 归档确认
```

1. **判类型**：lookup（找某页）/ synthesis（跨页综合）/ comparison（对比）/ brainstorm（扩展问题）。类型决定读多少页，不决定要不要查。

2. **双通道检索（并行跑，别只走一条）**：
   - `rg -i "<关键词>" <root>/wiki <root>/raw`（无 rg 用 grep）
   - Read `wiki/index.md` 取语义匹配（命中 M 档则分节按需读）

   为什么要两条：index 是 LLM 写的语义摘要，人名 / 术语 / 数字类关键词常常匹配不到它的措辞；小规模下一次 grep 比读整个 index 更便宜、召回更全。

3. **合并候选，最多读 8 页正文**。超过则先向用户澄清问题范围，不要硬读。

4. **回答**：每处事实性陈述附链接引用（指向 `concepts/foo.md` 这类**相对 `wiki/`** 的路径，或 source 页）；**无引用支持的句子显式标 `（推测）`**。

5. **缺口不装**：wiki 里没有相关信息时，明说"wiki 里没有 X，是否现在 ingest 相关源？"，并把缺口追加到 `wiki/log.md` 的 `[GAP]` 行供 lint 汇总。
   **禁止**把模型自身知识混进 wiki 引用当答案输出。确实要用时另起"模型知识"段落并明确标注。

6. **归档确认（Back-filing）——第五个暂停点，收口式，不打断**

   位置固定在 **Query → Answer → 归档确认 → yes/no**，**绝不**插在检索或推理中途：

   > **Agent MUST ask whether a query result should be promoted into the Wiki when the result is potentially reusable. The prompt occurs after answering and never interrupts retrieval or reasoning.**

   "potentially reusable"的判据：结论跨页综合而成、含对比/权衡、或给出可复用方法——而不是只是查了某个已有页的原文。
   **判据宽，但确认必问**：静默归档会让 wiki 变垃圾场，静默丢弃会让知识不复利，两个方向都要防。

   - yes → Write `wiki/syntheses/<slug>.md`（`type: synthesis`、`status: draft`）→ 更新 `wiki/index.md` → `wiki/log.md` 追加 `query | <title>` →（有 git 时）commit
   - no → 只把缺口/线索写进 log（若是 GAP），**不写任何页面**
   - 未获确认时不得写入

## 上下文纪律

- 单次 query 读的 `.md` 文件 **≤8** —— 和 ingest 的「上限」同源：宁可回头问用户收窄问题，不要硬读。读前先看 `wiki/index.md` 的行摘要或 grep 命中行，别整目录 cat。
- 命中 M 档时不要全量读 index（见 `scale.md`）。
