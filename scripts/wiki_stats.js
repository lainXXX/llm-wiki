#!/usr/bin/env node
'use strict';
/**
 * wiki_stats.js — 当前规模档位（spec §8）。
 *
 * 判据用**非空白字符数**，不是 wc -w：wc 按空白分词，一整段中文≈1 个"词"，
 * 用它做阈值等于永远判 S 档（v1 的老 bug）。
 *
 * 用法: node <SKILL_DIR>/scripts/wiki_stats.js [--root=P|--name=x|--wiki=x] [--by-area] [--json]
 */
const fs = require('fs');
const { resolveRoot, parseArgs, explain } = require('./lib/wiki-root');
const { parseFile } = require('./lib/frontmatter');
const layout = require('./lib/layout');

const S_CHARS = 8000;
const M_CHARS = 20000;
const S_PAGES = 100;
const M_PAGES = 300;

function nonWhitespaceChars(text) {
    return text.replace(/\s/g, '').length;
}

function tierOf(chars, pages) {
    if (chars > M_CHARS || pages > M_PAGES) return 'L';
    if (chars > S_CHARS || pages > S_PAGES) return 'M';
    return 'S';
}

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    const { root, name, source } = resolveRoot({ root: typeof flags.root === 'string' ? flags.root : null, name: typeof flags.name === 'string' ? flags.name : null });
    const pages = layout.listPages(root);

    const byArea = {};
    const byType = {};
    const byBucket = {};
    for (const page of pages) {
        const { data } = parseFile(page.abs);
        const a = (data && data.area) || '(未标)';
        const t = (data && data.type) || '(未标)';
        byArea[a] = (byArea[a] || 0) + 1;
        byType[t] = (byType[t] || 0) + 1;
        byBucket[page.bucket] = (byBucket[page.bucket] || 0) + 1;
    }

    const indexFile = layout.indexFile(root);
    const indexChars = fs.existsSync(indexFile) ? nonWhitespaceChars(fs.readFileSync(indexFile, 'utf8')) : 0;
    const tier = tierOf(indexChars, pages.length);

    const advices = {
        S: '直接 Read wiki/index.md 全文 + grep。',
        M: '不要全量读 index：分节按需读 + grep 优先，单次 query 读页 ≤8。',
        L: '已超出本 skill 适用范围：建议拆库或换检索工具。',
    };

    if (flags.json) {
        console.log(JSON.stringify({ root, name, source, tier, pages: pages.length, index_chars: indexChars, by_area: byArea, by_type: byType, by_bucket: byBucket, advice: advices[tier] }, null, 2));
        return;
    }
    const lines = [
        `wiki: ${root}${name ? `  (${name}${source === 'default' ? ', default' : ''})` : ''}`,
        `档位: ${tier}`,
        `页面: ${pages.length}  (S≤${S_PAGES} / M≤${M_PAGES})`,
        `index 非空白字符: ${indexChars}  (S≤${S_CHARS} / M≤${M_CHARS})`,
        `建议: ${advices[tier]}`,
    ];
    if (flags['by-area']) {
        lines.push('按桶:');
        for (const b of layout.bucketNames()) lines.push(`  ${b}: ${byBucket[b] || 0}`);
        lines.push('按 area:');
        for (const [k, v] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${v}`);
        lines.push('按 type:');
        for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${v}`);
    }
    console.log(lines.join('\n'));
}

try { main(); } catch (e) {
    process.stderr.write(`✗ ${explain(e)}\n`);
    process.exit(1);
}
