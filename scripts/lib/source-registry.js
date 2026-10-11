'use strict';
/**
 * 源登记表：把源头所在的桶里的 source/paper 页读成 {id, sha256, source_path} 索引。
 *
 * 存在的理由（spec §5.1 前置检查、§10 B1/B4）：agent 每次 ingest 前必须判断
 * "这个源登记过没有、内容变没变"。靠肉眼 grep frontmatter 既慢又容易漏，
 * 判错就会重复建页（幂等失效）或覆盖已改的源（丢历史）。
 */
const fs = require('fs');
const path = require('path');
const { parseFile } = require('./frontmatter');
const { sha256File, short } = require('./hash');
const layout = require('./layout');

/** @returns {Array<{id,file,rel,sha256,source_path,status,supersedes,title}>} */
function scan(root) {
    const out = [];
    // layout.listPages 是递归的：v2 的非递归 readdirSync 在 v3 的四个桶下会静默返回空，
    // 于是每次 ingest 都判成 new —— 幂等被无声破坏。
    for (const page of layout.listPages(root)) {
        const { data } = parseFile(page.abs);
        if (!data || layout.bucketOf(data.type) !== 'sources') continue;
        const m = page.name.match(/^(src-\d+)/);
        out.push({
            id: m ? m[1] : null,
            file: page.abs,
            rel: page.rel,
            sha256: data.sha256 || null,
            source_path: data.source_path || null,
            status: data.status || null,
            supersedes: data.supersedes || null,
            title: data.title || null,
        });
    }
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * 判断一个源文件当前处于什么状态。
 * @returns {{status:'new'|'unchanged'|'changed'|'unknown', entry?:object, hash:string}}
 *  - unchanged: 同 sha256 已登记 → 幂等，什么都不该写
 *  - changed:   同 path 但 sha256 不同 → 走"源变更"流程（新开 src-NNN + supersedes）
 */
function statusOf(root, sourcePath) {
    const abs = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(root, sourcePath);
    if (!fs.existsSync(abs)) return { status: 'unknown', hash: null, detail: `文件不存在: ${abs}` };
    const hash = sha256File(abs);
    const entries = scan(root);
    const byHash = entries.find((e) => e.sha256 && (e.sha256.startsWith(hash.slice(0, 12)) || hash.startsWith(e.sha256)));
    if (byHash) return { status: 'unchanged', entry: byHash, hash };
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const byPath = entries.find((e) => e.source_path && (e.source_path === rel || e.source_path === sourcePath));
    if (byPath) return { status: 'changed', entry: byPath, hash };
    return { status: 'new', hash };
}

module.exports = { scan, statusOf, short };
