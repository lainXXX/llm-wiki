'use strict';
/**
 * v3 布局的单一真相源（spec §3.2 目录树、§3.3 文件归属）。
 *
 * 存在的理由：v2 里 `path.join(root, 'pages')` 散在 5 个文件、非递归 readdirSync 散在
 * 4 处，且四处失败都是**静默返回空数组**——最危险的是 source-registry（每次 ingest
 * 都判 new → 幂等被无声破坏）与 new_source_id（退回 src-001 → 撞号）。集中到这里后
 * 不可能再漂移。
 *
 * 注意 type 与 bucket 的关系：**type 是 schema，bucket 是 filesystem projection**，
 * 不要反过来。source 与 paper 同桶但骨架不同——桶只决定位置，不决定骨架。
 */
const path = require('path');
const fs = require('fs');
const { listFiles } = require('./paths');

const CONTRACT_FILE = 'AGENTS.md';
const CLAUDE_SHIM = 'CLAUDE.md';
const WIKI_DIR = 'wiki';
const INDEX_FILE = 'index.md';
const LOG_FILE = 'log.md';
const RAW_DIR = 'raw';

const BUCKETS = ['sources', 'concepts', 'entities', 'syntheses'];

const TYPE_TO_BUCKET = {
    source: 'sources',
    paper: 'sources',
    concept: 'concepts',
    method: 'concepts',
    entity: 'entities',
    synthesis: 'syntheses',
};

/** 契约版本。lint 拿它与实例 AGENTS.md 的 contract_version 比对，落后 → Backlog（spec §4.2）。 */
const CONTRACT_VERSION = 4;

/** instance root 下允许出现的顶层条目（spec §3.5 白名单）。 */
const ROOT_WHITELIST = [CONTRACT_FILE, CLAUDE_SHIM, RAW_DIR, WIKI_DIR, '.git'];

function wikiDir(root) {
    return path.join(root, WIKI_DIR);
}

function bucketDir(root, bucket) {
    return path.join(root, WIKI_DIR, bucket);
}

function bucketNames() {
    return BUCKETS.slice();
}

/** type → bucket；未知 type 返回 null（调用方自己决定是报错还是跳过）。 */
function bucketOf(type) {
    return TYPE_TO_BUCKET[type] || null;
}

/** 一页应该在哪个桶（相对 root 的 posix 路径目录，如 `wiki/concepts`）。 */
function bucketRelOf(type) {
    const b = bucketOf(type);
    return b ? `${WIKI_DIR}/${b}` : null;
}

function indexFile(root) {
    return path.join(wikiDir(root), INDEX_FILE);
}

function logFile(root) {
    return path.join(wikiDir(root), LOG_FILE);
}

function contractFile(root) {
    return path.join(root, CONTRACT_FILE);
}

function claudeShim(root) {
    return path.join(root, CLAUDE_SHIM);
}

function rawDir(root) {
    return path.join(root, RAW_DIR);
}

/** 四个桶的绝对路径数组，供建目录用。 */
function bucketDirs(root) {
    return BUCKETS.map((b) => bucketDir(root, b));
}

/**
 * 递归列出四桶下的 markdown 页（复用 paths.listFiles，它已跳过 node_modules/.git）。
 * 返回 [{ abs, rel, bucket, name }]，rel 形如 `wiki/concepts/self-attention.md`，name 是文件名。
 */
function listPages(root) {
    const pages = [];
    for (const bucket of BUCKETS) {
        const dir = bucketDir(root, bucket);
        if (!fs.existsSync(dir)) continue;
        for (const rel of listFiles(root, (_abs, name) => name.endsWith('.md'), dir)) {
            pages.push({ abs: path.join(root, rel), rel, bucket, name: path.basename(rel) });
        }
    }
    return pages;
}

/** 页名（去 .md）→ 页对象，供断链/孤儿检测做 O(1) 查名。 */
function pageIndex(root) {
    const map = new Map();
    for (const p of listPages(root)) map.set(path.basename(p.name, '.md'), p);
    return map;
}

module.exports = {
    CONTRACT_FILE, CLAUDE_SHIM, WIKI_DIR, INDEX_FILE, LOG_FILE, RAW_DIR,
    BUCKETS, TYPE_TO_BUCKET, CONTRACT_VERSION, ROOT_WHITELIST,
    wikiDir, bucketDir, bucketDirs, bucketNames, bucketOf, bucketRelOf,
    indexFile, logFile, contractFile, claudeShim, rawDir,
    listPages, pageIndex,
};
