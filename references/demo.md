# 首次 0→1 演示（约 10 分钟）

目的：让用户在第一次使用时就能看到"ingest 之后 wiki 真的变厚了"，而不是先读一堆规则。**用户在前两周放弃的头号原因，就是迟迟看不到效果。**

## 材料

把下面这段存成 `<wiki-root>/raw/demo-attention.md`（约 300 字），或直接让用户丢一个自己的小文件进来：

```markdown
# 注意力机制速记

自注意力（self-attention）把序列中每个位置与所有位置两两比较，计算量随序列长度 n 呈平方增长（O(n²·d)，d 为维度）。
因此长序列下注意力的开销会迅速压过循环网络（RNN 是 O(n·d²)）——稠密注意力的优势在中短序列，长序列上则是效率劣势。

多头注意力（multi-head attention）把表示切成 h 份并行做注意力，再拼接；不同头可以学到不同类型的关系。
实践中 h 常取 8，每个头的维度取 d/h。

位置编码（positional encoding）用于注入顺序信息——注意力本身对位置是无感的。
原始论文用正弦函数做绝对位置编码。
```

## 走一遍（agent 照此执行）

```bash
node <SKILL_DIR>/scripts/source_status.js --file=raw/demo-attention.md    # → new
node <SKILL_DIR>/scripts/new_source_id.js --slug=attention-notes          # → src-001-attention-notes.md
```

1. **登记**：`wiki/log.md` 追加 `## [今天] ingest | 注意力机制速记 [IN PROGRESS]`。
2. **读源**：不带图，直接读正文。
3. **变更计划**：
   - 新建 `wiki/sources/src-001-attention-notes.md`（type `source`，area `ai`）
   - 新建 `wiki/concepts/self-attention.md`（type `concept`）——计算量 O(n²·d) 是一个独立可复用的概念
   - 新建 `wiki/concepts/multi-head-attention.md`（type `concept`）
   - 更新 `wiki/index.md`，`wiki/log.md` 收尾
4. **写入**：按 3 的清单逐页写；`src-001` 页的 `## References` 里链到 `../../raw/demo-attention.md`（页面在两层深，**退两层**），concept 页的 `sources: [src-001]`。
5. 向用户展示结果：
   - `node <SKILL_DIR>/scripts/wiki_stats.js` → 页面 3，档位 S
   - `wiki/index.md` 里 `## Sources` / `## Concepts` 各多了行
   - `self-attention` 页里那两句结论各自链回了 `src-001`

## 接着演示"复利"

让用户再丢第二个源（比如一篇讲 FlashAttention 的文章），这次 ingest 会**更新** `wiki/concepts/self-attention.md` 而不是新建——"同一概念在不同源里出现，最后落进同一页"就是这个 skill 的核心价值。

第二个源若对复杂度说法不同，`Tensions` 段就会出现 `[!conflict]` callout，并停下来问用户裁决——顺势演示"冲突不被静默覆盖"。

## 演示结束时告诉用户

- 库在哪、`area:` 怎么改、`AGENTS.md` 的**领域区**（area 词表、骨架扩展段…）可以自己改；
- 日常只要说"把这篇 ingest 进去"；
- `node <SKILL_DIR>/scripts/wiki_lint.js` 是体检，有 Blocking 时退出码非 0；
- 有 git 会自动提交，没有也不影响使用；
- 以后想给**另一个领域**建库就说一声——多库是支持的（`wiki_init.js` 再跑一次，库之间可以互链），但**通常一个库就够**，只有词表装不下彼此时才值得拆。
