#!/usr/bin/env node
'use strict';
/**
 * wiki_init.js — 初始化一个 wiki 实例，并把它登记进 ~/.llm-wiki/config.json。
 *
 * 用法:
 *   node <SKILL_DIR>/scripts/wiki_init.js --root=/path/to/wiki --name=personal [--title="我的知识库"] [--no-register]
 *   （--wiki=x 是 --name=x 的别名；此处 --name 指"新库叫什么"）
 *
 * 不写任何项目内文件（spec §3.5 零污染）：结束时只在 stdout 打印一行提示。
 */
const fs = require('fs');
const path = require('path');
const { writeText, exists, isDir } = require('./lib/paths');
const { resolveRoot, readConfig, writeConfig, configPath, looksLikeWiki, parseArgs, explain } = require('./lib/wiki-root');
const layout = require('./lib/layout');

const TEMPLATE = path.join(__dirname, '..', 'references', 'agents-template.md');
const CLAUDE_TEMPLATE = path.join(__dirname, '..', 'references', 'claude-shim.md');

const CONTRACT_FALLBACK = `---
areas: []
stale_after_days: 90
language: zh
contract_version: ${layout.CONTRACT_VERSION}
---

# 知识库契约

> 本文件是**用户侧**的领域约定，agent 改动前必须征得你同意。
> 说明见 skill 的 \`references/agents-template.md\`。
`;

const CLAUDE_FALLBACK = `See AGENTS.md
`;

function indexSeed(today) {
    return `# Wiki Index

> 最后更新: ${today} | 页面: 0 | 源: 0 | contract: ${layout.CONTRACT_FILE}

## Sources

## Concepts

## Entities

## Syntheses

## Tensions
`;
}

function logSeed(today, title) {
    return `# Wiki Log

格式: \`## [YYYY-MM-DD] <op> | <title> [<state>]\`
op    ∈ {init, ingest, query, lint, schema, gap, user-edit}
state ∈ {DONE, IN PROGRESS, ABORTED}

## [${today}] init | ${title} [DONE]
- root: .
`;
}

/** root 落在某个已有项目/仓库内部时提醒（spec §3.5：提醒但不阻止）。 */
function ancestorsLookLikeProject(root) {
    let dir = root;
    for (let i = 0; i < 12; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        for (const marker of ['package.json', '.git', 'pyproject.toml']) {
            if (exists(path.join(parent, marker))) return parent;
        }
        dir = parent;
    }
    return null;
}

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    if (!flags.root || typeof flags.root !== 'string') {
        process.stderr.write(`用法: node "${process.argv[1]}" --root=<wiki 目录> [--name=库名|--wiki=库名] [--title=标题] [--no-register]\n`);
        process.exit(64);
    }
    const root = path.resolve(flags.root);
    const name = typeof flags.name === 'string' && flags.name ? flags.name : path.basename(root);
    const title = typeof flags.title === 'string' && flags.title ? flags.title : name;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const out = [];

    if (looksLikeWiki(root)) {
        process.stderr.write(`⚠ ${root} 看起来已经是一个 wiki（AGENTS.md + wiki/index.md + wiki/log.md 齐全）——本次只做补缺，不覆盖已有文件。\n`);
    }

    fs.mkdirSync(root, { recursive: true });
    for (const d of [layout.RAW_DIR, `${layout.RAW_DIR}/assets`, layout.WIKI_DIR, ...layout.bucketNames().map((b) => `${layout.WIKI_DIR}/${b}`)]) {
        fs.mkdirSync(path.join(root, d), { recursive: true });
        out.push(`${d}/`);
    }

    const seeds = [
        [path.posix.join(layout.WIKI_DIR, layout.INDEX_FILE), indexSeed(today)],
        [path.posix.join(layout.WIKI_DIR, layout.LOG_FILE), logSeed(today, title)],
        [layout.CONTRACT_FILE, exists(TEMPLATE) ? fs.readFileSync(TEMPLATE, 'utf8') : CONTRACT_FALLBACK],
        [layout.CLAUDE_SHIM, exists(CLAUDE_TEMPLATE) ? fs.readFileSync(CLAUDE_TEMPLATE, 'utf8') : CLAUDE_FALLBACK],
    ];
    for (const [rel, content] of seeds) {
        const abs = path.join(root, rel);
        if (exists(abs)) {
            process.stderr.write(`· 已存在，跳过: ${rel}\n`);
            continue;
        }
        writeText(abs, content);
        out.push(rel);
    }

    let registered = null;
    if (!flags['no-register']) {
        const cfg = readConfig() || {};
        cfg.wikis = cfg.wikis || {};
        cfg.wikis[name] = root;
        if (!cfg.default) cfg.default = name;
        writeConfig(cfg);
        registered = cfg.default === name ? `${name} (default)` : name;
    }

    const project = ancestorsLookLikeProject(root);
    if (project) {
        process.stderr.write(`⚠ 注意：${root} 在 ${project} 内部（检测到项目标记文件）。wiki 根通常应放在项目之外，否则会进入那个仓库的版本控制范围。\n`);
    }
    for (const b of layout.bucketDirs(root)) {
        if (!isDir(b)) throw new Error(`桶建立失败: ${b}`);
    }

    console.log(JSON.stringify({
        root,
        name,
        registered,
        config: flags['no-register'] ? null : configPath(),
        created: out,
        hint: `你的 wiki 在 ${root}。以后在任何项目里直接说"把这篇 ingest 进去"就行。`,
    }, null, 2));
}

try { main(); } catch (e) {
    process.stderr.write(`✗ init 失败: ${explain(e)}\n`);
    process.exit(1);
}
