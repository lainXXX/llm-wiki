#!/usr/bin/env node
'use strict';
/**
 * source_status.js — ingest 前的确定性前置检查（spec §5.1）。
 *
 * 用法: node <SKILL_DIR>/scripts/source_status.js --file=raw/papers/attention.pdf [--root=P|--name=x|--wiki=x] [--json]
 * 输出: new | unchanged | changed | unknown
 *   unchanged → 报告"未检测到新内容"，不写任何页（幂等）
 *   changed   → 走"源变更"：新开 src-NNN + supersedes（不是原地覆盖）
 */
const { resolveRoot, parseArgs, explain } = require('./lib/wiki-root');
const { statusOf } = require('./lib/source-registry');

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    if (!flags.file || typeof flags.file !== 'string') {
        process.stderr.write(`用法: node "${process.argv[1]}" --file=<源文件> [--root=P|--name=x]\n`);
        process.exit(64);
    }
    const { root } = resolveRoot({ root: typeof flags.root === 'string' ? flags.root : null, name: typeof flags.name === 'string' ? flags.name : null });
    const r = statusOf(root, flags.file);
    const hint = {
        new: '未登记 → 正常 ingest。',
        unchanged: '同内容已登记 → 幂等：只报告"未检测到新内容"，不写任何文件。',
        changed: '内容已变 → 走源变更：新开 src-NNN、新页记 supersedes、旧页保 status: superseded。',
        unknown: '找不到文件 → 先把它放进 raw/，不要凭空写页。',
    }[r.status];
    if (flags.json) console.log(JSON.stringify({ ...r, hint }, null, 2));
    else console.log(`${r.status}  sha256=${r.hash ? r.hash.slice(0, 12) : '-'}${r.entry ? `  → ${r.entry.rel}` : ''}\n${hint}`);
}

try { main(); } catch (e) {
    process.stderr.write(`✗ ${explain(e)}\n`);
    process.exit(1);
}
