#!/usr/bin/env node
'use strict';
/**
 * new_source_id.js — 递归扫描 wiki/ 四个桶下已有的 src-NNN，返回 max+1（spec §3.4）。
 * 撞号会让两个源共用一个 id，后面所有 sources:/supersedes: 引用就全错。
 *
 * 用法: node <SKILL_DIR>/scripts/new_source_id.js [--root=P | --name=personal | --wiki=personal] [--slug=attention] [--json]
 * 输出: src-004  或  src-004-attention.md
 */
const { resolveRoot, parseArgs, explain } = require('./lib/wiki-root');
const layout = require('./lib/layout');

const ID_RE = /^src-(\d+)/;

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    const { root } = resolveRoot({ root: typeof flags.root === 'string' ? flags.root : null, name: typeof flags.name === 'string' ? flags.name : null });
    let max = 0;
    for (const page of layout.listPages(root)) {
        const m = page.name.match(ID_RE);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const id = 'src-' + String(max + 1).padStart(3, '0');
    const slug = typeof flags.slug === 'string' ? flags.slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') : null;
    const file = slug ? `${id}-${slug}.md` : null;
    if (flags.json) console.log(JSON.stringify({ id, file, existing_max: max, pages_root: layout.wikiDir(root) }, null, 2));
    else console.log(file || id);
}

try { main(); } catch (e) {
    process.stderr.write(`✗ ${explain(e)}\n`);
    process.exit(1);
}
