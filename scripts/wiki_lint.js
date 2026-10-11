#!/usr/bin/env node
'use strict';
/**
 * wiki_lint.js — 确定性健康检查（spec §5.3）。
 *
 * 全部靠 frontmatter + 链接解析，不做全文语义判断：让模型"目测"几十个文件会烧上下文，
 * 而且结果不可复现。脚本只回传摘要，报告落盘。
 *
 * 用法: node <SKILL_DIR>/scripts/wiki_lint.js [--root=P|--name=x|--wiki=x] [--json] [--no-write]
 * 退出码: 有 Blocking 项 → 1；否则 0（用法错误 64）。
 *
 * Blocking = 断链 / 悬空 source / index 漂移 / 桶错位
 * Backlog  = 幽灵概念 / 孤儿页 / 未裁决矛盾 / 过期 stub / staleness / frontmatter / 未解析图片
 *            / .bak 残留 / raw 未登记 / root 杂项 / 契约版本落后
 * INFO     = 跨库链接（逃出 instance root 的链接；可达与否都不判错，不进退出码）
 */
const fs = require('fs');
const path = require('path');
const { resolveRoot, readContract, readConfig, looksLikeWiki, parseArgs, explain } = require('./lib/wiki-root');
const { parseFile, check } = require('./lib/frontmatter');
const { listFiles, resolveLink, isInside, isDir, writeText } = require('./lib/paths');
const { sha256File } = require('./lib/hash');
const layout = require('./lib/layout');

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMAGE_MARK = /\[image:\s*([^\]]*)\]/g;
const CONFLICT_RE = /\[!conflict\]/g;
const UNRESOLVED_RE = /未裁决/;

function linksIn(text) {
    const out = [];
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) out.push({ label: m[1], target: m[2] });
    return out;
}

function countMatches(text, re) {
    re.lastIndex = 0;
    let n = 0;
    while (re.exec(text)) n++;
    return n;
}

function daysSince(dateStr) {
    // 裸日期不带时间部分会被按 UTC 解析；补 T00:00:00 才是本地零点
    const t = Date.parse(`${dateStr}T00:00:00`);
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
}

/**
 * v4：container 是"恰好放了一堆 instance 的目录"，本身不是 instance。
 * 用户很容易在 container 上直接跑 lint（比如 `--root=~/knowledge`），那时该给一条能指路的
 * 错误，而不是报一堆看不懂的漂移。只在目录里**确实装着 instance** 时才拒绝——半建成的
 * instance 仍照常体检。
 */
function assertNotContainer(root) {
    if (!isDir(root) || looksLikeWiki(root)) return;
    const candidates = fs.readdirSync(root)
        .filter((name) => isDir(path.join(root, name)) && looksLikeWiki(path.join(root, name)));
    if (!candidates.length) return;
    const e = new Error(
        `${root} 是个 container，不是 wiki instance（它自己没有 AGENTS.md）。`
        + `里面的实例: ${candidates.join(', ')}。用 --wiki=<名字> 或 --root=${path.join(root, '<名字>').replace(/\\/g, '/')}。`
    );
    e.code = 'IS_CONTAINER';
    throw e;
}

/**
 * 逃出 instance root 的链接 = 跨库引用（spec v4 §7）。
 * 可达与否都不判错——单独拷走一个 instance 时兄弟库本来就不在（可移植性）。
 * 注册表只用来把消息写清楚，不参与判定。
 */
function crossWikiDetail(root, abs, target, wikis) {
    const hit = Object.entries(wikis).find(([, r]) => isInside(path.resolve(r), abs));
    const reach = fs.existsSync(abs) ? '可达' : '不可达';
    if (hit) return `${path.basename(root)}/… → ${hit[0]}/${path.relative(path.resolve(hit[1]), abs).split(path.sep).join('/')}（${reach}） ← ${target}`;
    return `${path.basename(root)}/… → ${path.relative(path.dirname(root), abs).split(path.sep).join('/')}（${reach}，未落在已注册实例内）`;
}

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    const { root, name } = resolveRoot({ root: typeof flags.root === 'string' ? flags.root : null, name: typeof flags.name === 'string' ? flags.name : null });
    assertNotContainer(root);
    const schema = readContract(root);
    const pageFiles = layout.listPages(root).map((p) => p.abs);

    // 注册表只在能读到且没坏时用于把跨库消息写清；--root 模式下今天根本不读配置，
    // 不能让 lint 因配置损坏而挂掉（readConfig 会抛 BAD_CONFIG）。
    let wikis = {};
    try { wikis = (readConfig() || {}).wikis || {}; } catch (_) {}

    const blocking = [];
    const backlog = [];
    const info = [];
    const add = (bucket, kind, detail) => bucket.push({ kind, detail });

    // ── 读页 + frontmatter 合规 + 桶错位 ──────────────────────────────────
    const pageData = new Map();
    const pageText = new Map();
    for (const file of pageFiles) {
        const text = fs.readFileSync(file, 'utf8');
        const { data, error } = parseFile(file);
        pageText.set(file, text);
        pageData.set(file, data);
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (error) add(backlog, 'frontmatter', `${rel}: ${error}`);
        else {
            for (const p of check(data, schema.areas)) add(backlog, 'frontmatter', `${rel}: ${p}`);
            // 桶错位 = 结构性损坏，与断链同级：放错桶的页会被 new_source_id 漏扫（撞号）、
            // 被 index 完整性判成"多余行"，错误会级联（spec §5.3）。
            const expected = layout.bucketRelOf(data.type);
            const actual = path.posix.dirname(rel);
            if (expected && actual !== expected) add(blocking, '桶错位', `${rel}: type=${data.type} 应在 ${expected}/`);
            else if (!expected && data.type) add(backlog, 'frontmatter', `${rel}: type=${data.type} 没有对应桶`);
        }

        // 未解析图片占比（spec §5.1）
        for (const m of text.matchAll(IMAGE_MARK)) {
            if (UNRESOLVED_RE.test(m[1])) add(backlog, 'image', `${rel}: 未解析图片 ${m[1].trim()}`);
        }
    }

    // ── 链接完整性 ────────────────────────────────────────────────────────
    const otherDocs = [layout.indexFile(root), layout.logFile(root)].filter((f) => fs.existsSync(f));
    const inbound = new Map(pageFiles.map((f) => [f, 0]));
    const rawRefs = new Set();

    for (const [file, text] of [...pageText, ...otherDocs.map((f) => [f, fs.readFileSync(f, 'utf8')])]) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const inPage = pageFiles.includes(file);
        for (const { target } of linksIn(text)) {
            const abs = resolveLink(file, target);
            if (!abs) continue; // 外部链接 / 纯锚点
            // 逃出 instance root = 跨库引用（v4 §7）：可达与否都只报 INFO，
            // 不能落到下面的 断链 / 幽灵概念——否则等于禁止跨库连接。
            if (!isInside(root, abs)) { add(info, '跨库链接', crossWikiDetail(root, abs, target, wikis)); continue; }
            if (fs.existsSync(abs)) {
                // 入链只算"页 → 页"：index.md 会链接每一页，把它算进来等于永远没有孤儿页。
                if (!inPage) continue;
                if (inbound.has(abs) && abs !== file) inbound.set(abs, inbound.get(abs) + 1);
                rawRefs.add(path.resolve(abs));
                continue;
            }
            // 目录类文件（index/log）里的悬空条目 = 幽灵概念；页内悬空链接 = 断链
            if (inPage) add(blocking, '断链', `${rel} → ${target}`);
            else add(backlog, '幽灵概念', `${rel} → ${target}`);
        }
    }

    // ── 未裁决矛盾（callout 块内找"未裁决"标记） ──────────────────────────
    for (const [file, text] of pageText) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        for (const block of text.matchAll(/\[!conflict\]([\s\S]*?)(?:\n\s*\n|$)/g)) {
            if (UNRESOLVED_RE.test(block[0])) { add(backlog, '未裁决矛盾', `${rel}: 存在未裁决矛盾`); break; }
        }
    }

    // ── index 漂移（双向） ────────────────────────────────────────────────
    const indexFile = layout.indexFile(root);
    const indexText = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : '';
    if (!indexText) {
        add(blocking, 'index 漂移', 'wiki/index.md 不存在');
    } else {
        const indexed = new Set();
        for (const { target } of linksIn(indexText)) {
            const abs = resolveLink(indexFile, target);
            if (abs) indexed.add(path.resolve(abs));
        }
        for (const file of pageFiles) {
            if (!indexed.has(path.resolve(file))) add(blocking, 'index 漂移', `${path.relative(root, file).split(path.sep).join('/')} 未出现在 wiki/index.md`);
        }
        for (const line of indexText.split('\n')) {
            if (/^\s*-\s/.test(line) && !/area:/.test(line)) add(backlog, 'index 格式', `行尾缺 area: ${line.trim().slice(0, 60)}`);
        }
    }

    // ── 悬空 source id ────────────────────────────────────────────────────
    const srcIds = new Set();
    for (const file of pageFiles) {
        const m = path.basename(file).match(/^(src-\d+)/);
        if (m) srcIds.add(m[1]);
    }
    for (const [file, data] of pageData) {
        if (!data) continue;
        const rel = path.relative(root, file).split(path.sep).join('/');
        const refs = [].concat(data.sources || [], data.supersedes ? [data.supersedes] : [], data.derived_from || []);
        for (const r of refs) {
            const id = String(r).match(/^(src-\d+)/);
            if (id && !srcIds.has(id[1])) add(blocking, '悬空 source', `${rel}: 引用了不存在的 ${id[1]}`);
            else if (!id && !/\.md$/.test(String(r))) add(backlog, 'frontmatter', `${rel}: sources 项格式可疑 ${r}`);
        }
    }

    // ── sha256 一致性（raw 被改过但页面没走源变更流程） ──────────────────
    // 已被新的源页 supersede 且新页哈希对得上 = 源变更流程走完了，旧页的旧哈希是历史记录，不再告警。
    const entries = [...pageData].map(([file, data]) => ({ file, data }));
    for (const { file, data } of entries) {
        if (!data || !data.sha256 || !data.source_path) continue;
        const rel = path.relative(root, file).split(path.sep).join('/');
        const abs = path.resolve(root, String(data.source_path));
        if (!fs.existsSync(abs)) {
            add(backlog, '源不存在', `${rel}: source_path=${data.source_path} 找不到对应文件`);
            continue;
        }
        const actual = sha256File(abs).slice(0, 12);
        if (String(data.sha256).startsWith(actual)) continue;
        const myId = path.basename(file).match(/^(src-\d+)/);
        const superseded = myId && entries.some(({ file: f2, data: d2 }) => d2 && d2.supersedes === myId[1]
            && d2.source_path === data.source_path && String(d2.sha256 || '').startsWith(actual));
        if (superseded) continue;
        add(backlog, '源已变更', `${rel}: 记录 ${String(data.sha256).slice(0, 12)} ≠ 实际 ${actual}（应走源变更流程，不是原地覆盖）`);
    }

    // ── 孤儿页 / stub / staleness ─────────────────────────────────────────
    for (const file of pageFiles) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        if (inbound.get(file) === 0) add(backlog, '孤儿页', `${rel}: 0 入链`);
        const data = pageData.get(file);
        if (!data) continue;
        const age = daysSince(data.updated);
        if (age === null) continue;
        if (['stub', 'draft'].includes(data.status) && age > 30) add(backlog, '过期 stub', `${rel}: status=${data.status}，${age} 天未动`);
        if (['source', 'paper'].includes(data.type) && age > schema.stale_after_days) {
            add(backlog, 'staleness', `${rel}: 超过 ${schema.stale_after_days} 天未更新（${age} 天）`);
        }
    }

    // ── raw 登记项（有文件但没被任何页引用） ───────────────────────────────
    const rawDir = layout.rawDir(root);
    const rawFiles = fs.existsSync(rawDir) ? listFiles(rawDir, (abs) => !/assets[\\/]/.test(abs)).sort() : [];
    for (const rel of rawFiles) {
        // 允许用文件名提及（source: raw/foo.pdf 这类纯文本引用也算登记）
        const abs = path.resolve(root, rel);
        const base = path.basename(rel);
        let mentioned = rawRefs.has(abs);
        if (!mentioned) for (const text of pageText.values()) if (text.includes(rel) || text.includes(base)) { mentioned = true; break; }
        if (!mentioned) add(backlog, 'raw 未登记', `${rel} 没有被任何页面引用`);
    }

    // ── .bak 残留（= 上次没跑完的现场） ───────────────────────────────────
    const baks = listFiles(root, (abs, n) => /\.bak-\d{8}-\d{6}$/.test(n));
    for (const rel of baks) add(backlog, 'bak 残留', `${rel}（上次写入未收尾，确认后可删）`);

    // ── root 杂项（白名单外的一律不该出现在 instance root） ────────────────
    for (const name of fs.readdirSync(root).sort()) {
        if (layout.ROOT_WHITELIST.includes(name)) continue;
        if (/^lint-report-.*\.md$/.test(name)) continue;
        if (/\.bak-/.test(name)) continue;
        add(backlog, 'root 杂项', `${name} 不在 root 白名单内（{${layout.ROOT_WHITELIST.join(', ')}} ∪ lint-report-*.md ∪ *.bak-*）`);
    }

    // ── 契约版本落后（skill 升级了，但本库的 AGENTS.md 没跟上） ────────────
    if (schema.contract_version === null) {
        add(backlog, '契约版本落后', `${layout.CONTRACT_FILE} 缺少 contract_version（当前 skill 为 ${layout.CONTRACT_VERSION}）`);
    } else if (schema.contract_version < layout.CONTRACT_VERSION) {
        add(backlog, '契约版本落后', `本库 contract_version=${schema.contract_version} < skill 的 ${layout.CONTRACT_VERSION}；读 references/agents-template.md 后**提议 diff 交用户确认**，不要自行覆盖（spec §4.2）`);
    }

    // ── 输出 ──────────────────────────────────────────────────────────────
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const result = { root, name, blocking: blocking.length, backlog: backlog.length, info: info.length, items: { blocking, backlog, info }, schema_areas: schema.areas };

    if (!flags['no-write'] && !flags.json) {
        const lines = [`# Lint Report ${today}`, '', `> wiki: ${root} ｜ 页面 ${pageFiles.length} ｜ Blocking ${blocking.length} ｜ Backlog ${backlog.length} ｜ INFO ${info.length}`, ''];
        const dump = (title, arr) => {
            lines.push(`## ${title}`, '');
            if (!arr.length) lines.push('- （空）');
            for (const i of arr) lines.push(`- **${i.kind}** — ${i.detail}`);
            lines.push('');
        };
        dump('Blocking', blocking);
        dump('Backlog', backlog);
        dump('INFO', info);
        writeText(path.join(root, `lint-report-${today}.md`), lines.join('\n'));
    }

    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else {
        const brief = (arr, label) => {
            if (!arr.length) { console.log(`${label}: 0`); return; }
            console.log(`${label}: ${arr.length}`);
            for (const i of arr.slice(0, 8)) console.log(`  - ${i.kind}: ${i.detail}`);
            if (arr.length > 8) console.log(`  … 其余 ${arr.length - 8} 条见 lint-report-${today}.md`);
        };
        brief(blocking, 'Blocking');
        brief(backlog, 'Backlog');
        brief(info, 'INFO');
        if (!flags['no-write'] && !flags.json) console.log(`报告: ${path.join(root, `lint-report-${today}.md`)}`);
        console.log(blocking.length ? '结论: 有 Blocking 项，先修断链/悬空 source。' : '结论: 无 Blocking 项。');
    }

    process.exit(blocking.length ? 1 : 0);
}

try { main(); } catch (e) {
    process.stderr.write(`✗ lint 失败: ${explain(e)}\n`);
    process.exit(1);
}
