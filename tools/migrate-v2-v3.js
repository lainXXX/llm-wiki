#!/usr/bin/env node
'use strict';
/**
 * migrate-v2-v3.js — v2 扁平布局 → v3 三层 + type 分桶的**一次性**迁移工具。
 *
 * 不放进 `scripts/`：那是 skill 的运行时面，一次性工具进去只会污染它。
 *
 * v2 形态（<v2>/ = 旧 root）：
 *   _schema.md  raw/  index.md  log.md  pages/*.md  lint-report-*.md
 * v3 形态（<v3>/ = instance root）：
 *   AGENTS.md  CLAUDE.md  raw/  wiki/{index.md,log.md,sources,concepts,entities,syntheses}/
 *
 * 默认 **dry-run**：只打印计划，不动任何文件。加 `--apply` 才落盘。
 *
 * 用法:
 *   node tools/migrate-v2-v3.js --v2=<旧 root> [--v3=<新 root，默认取旧 root 的父目录>] [--apply]
 *
 * 落盘后自检（任一失败即中止并尽量回滚）：
 *   ① 每页 dirname === type_to_bucket[type]
 *   ② 每一条 markdown 链接可解析
 *   ③ index 链接集合 === 磁盘页集合
 *   ④ wiki_lint.js 退出码 0
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');
const layout = require(path.join(SKILL_DIR, 'scripts', 'lib', 'layout'));
const { parse, stringify } = require(path.join(SKILL_DIR, 'scripts', 'lib', 'frontmatter'));

const TEMPLATE = path.join(SKILL_DIR, 'references', 'agents-template.md');

const args = {};
for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const APPLY = !!args.apply;

function die(msg) {
    console.error(`✗ ${msg}`);
    process.exit(1);
}

if (!args.v2 || typeof args.v2 !== 'string') {
    die('用法: node tools/migrate-v2-v3.js --v2=<旧 root> [--v3=<新 root>] [--apply]');
}
const V2 = path.resolve(args.v2);
const V3 = path.resolve(typeof args.v3 === 'string' ? args.v3 : path.dirname(V2));

if (!fs.existsSync(path.join(V2, 'pages'))) die(`${V2} 里没有 pages/ —— 这看起来不是 v2 布局的库`);
if (fs.existsSync(path.join(V3, 'AGENTS.md'))) die(`${V3}/AGENTS.md 已存在 —— 这个库看起来已经迁移过`);

// ── 读取 v2 ──────────────────────────────────────────────────────────────────
const oldPagesDir = path.join(V2, 'pages');
const oldSchema = path.join(V2, '_schema.md');
const oldRaw = path.join(V2, 'raw');
const oldIndex = path.join(V2, 'index.md');
const oldLog = path.join(V2, 'log.md');

const oldPageNames = fs.readdirSync(oldPagesDir).filter((f) => f.endsWith('.md')).sort();
if (!oldPageNames.length) die(`${oldPagesDir} 里没有 .md 页面`);

/** 文件名 → { type, bucket, from, to } */
const byName = new Map();
const problems = [];
for (const name of oldPageNames) {
    const { data, error } = parse(fs.readFileSync(path.join(oldPagesDir, name), 'utf8'));
    if (error || !data) { problems.push(`${name}: ${error || 'frontmatter 不可解析'}`); continue; }
    const bucket = layout.bucketOf(data.type);
    if (!bucket) { problems.push(`${name}: type=${data.type} 没有对应桶`); continue; }
    byName.set(name, {
        type: data.type,
        bucket,
        from: path.join(oldPagesDir, name),
        to: path.join(V3, layout.WIKI_DIR, bucket, name),
    });
}
if (problems.length) die(`迁移前就无法归位：\n  ${problems.join('\n  ')}`);

// ── 链接重写 ────────────────────────────────────────────────────────────────
// 页面从 pages/x.md（距 root 一层）移到 wiki/<桶>/x.md（两层）：
//   同桶页互链   foo.md            不变
//   跨桶页互链   foo.md        →   ../<桶>/foo.md
//   指向 raw     ../raw/x      →   ../../raw/x
function rewritePageLinks(text, selfName) {
    const self = byName.get(selfName);
    return text.replace(/\]\(([^)\s]+)\)/g, (whole, full) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(full)) return whole; // 外部链接
        const hashAt = full.indexOf('#');
        const target = hashAt === -1 ? full : full.slice(0, hashAt);
        const anchor = hashAt === -1 ? '' : full.slice(hashAt);
        if (target.startsWith('../raw/')) return `](../../${target.slice(3)}${anchor})`;
        const info = byName.get(target);
        if (!info) return whole; // 未知目标：留给自检报错，不猜
        const rel = info.bucket === self.bucket ? target : `../${info.bucket}/${target}`;
        return `](${rel}${anchor})`;
    });
}

/** index / log 里的链接与页面引用（两者都相对 wiki/ 解析）。 */
function rewriteWikiLevel(text) {
    return text
        .replace(/\]\(pages\/([^)\s#]+)(#[^)\s]*)?\)/g, (m, name, anchor = '') => {
            const info = byName.get(name);
            return info ? `](${info.bucket}/${name}${anchor})` : m;
        })
        .replace(/\bpages\/([A-Za-z0-9._-]+)/g, (m, name) => {
            const info = byName.get(`${name}.md`);
            return info ? `${layout.WIKI_DIR}/${info.bucket}/${name}` : m;
        });
}

const origPageText = new Map();
const newPageText = new Map();
for (const name of byName.keys()) {
    const text = fs.readFileSync(byName.get(name).from, 'utf8');
    origPageText.set(name, text);
    newPageText.set(name, rewritePageLinks(text, name));
}

const indexBody = fs.existsSync(oldIndex)
    ? rewriteWikiLevel(fs.readFileSync(oldIndex, 'utf8'))
        .replace(/\|\s*schema:\s*_schema\.md/, `| contract: ${layout.CONTRACT_FILE}`)
    : null;

const logBody = fs.existsSync(oldLog) ? rewriteWikiLevel(fs.readFileSync(oldLog, 'utf8')) : null;

// ── AGENTS.md（保留用户的领域区取值） ───────────────────────────────────────
const schemaFm = fs.existsSync(oldSchema) ? (parse(fs.readFileSync(oldSchema, 'utf8')).data || {}) : {};
const areas = Array.isArray(schemaFm.areas) ? schemaFm.areas : [];
const stale = Number(schemaFm.stale_after_days) || 90;
const language = schemaFm.language || 'zh';

function buildContract() {
    if (!fs.existsSync(TEMPLATE)) die(`缺少模板 ${TEMPLATE}`);
    const tpl = fs.readFileSync(TEMPLATE, 'utf8');
    const fmMatch = tpl.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    const fm = `---\nareas: [${areas.join(', ')}]\nstale_after_days: ${stale}\nlanguage: ${language}\ncontract_version: ${layout.CONTRACT_VERSION}\n---\n`;
    return fm + tpl.slice(fmMatch[0].length).replace(/^areas: \[.*\]$/m, `areas: [${areas.join(', ')}]`);
}

// ── 计划 ────────────────────────────────────────────────────────────────────
console.log(`v2 root : ${V2}`);
console.log(`v3 root : ${V3}${V3 === path.dirname(V2) ? '  （wiki/ 原地升级，_schema.md 与 raw/ 上移一层）' : ''}`);
console.log(`\n页面归位（${byName.size} 页）:`);
for (const [name, info] of byName) {
    console.log(`  pages/${name}  →  wiki/${info.bucket}/${name}   (type=${info.type})`);
}
const moved = [];
if (fs.existsSync(oldRaw)) moved.push(`raw/  →  ${path.relative(V2, path.join(V3, 'raw')).replace(/\\/g, '/')}/`);
if (fs.existsSync(oldSchema)) moved.push(`_schema.md  →  ${layout.CONTRACT_FILE}（按模板重新生成，保留 areas/stale_after_days/language）`);
moved.push(`${layout.CLAUDE_SHIM}（一行指针）`);
for (const f of fs.readdirSync(V2).filter((f) => /^lint-report-.*\.md$/.test(f))) moved.push(`${f}  →  上一级`);
if (moved.length) console.log('\n同时移动/新建:');
for (const m of moved) console.log(`  ${m}`);

if (!APPLY) {
    console.log('\n(dry-run —— 没有改动任何文件。加 --apply 落盘。)');
    process.exit(0);
}

// ── 落盘 ────────────────────────────────────────────────────────────────────
const undo = [];
function mkdirp(d) { fs.mkdirSync(d, { recursive: true }); }
function moveFile(from, to) {
    if (path.resolve(from) === path.resolve(to)) return;
    mkdirp(path.dirname(to));
    fs.renameSync(from, to);
    undo.push(() => { mkdirp(path.dirname(from)); fs.renameSync(to, from); });
}
function writeNew(file, text) {
    const existed = fs.existsSync(file);
    const prev = existed ? fs.readFileSync(file) : null;
    mkdirp(path.dirname(file));
    fs.writeFileSync(file, text, 'utf8');
    undo.push(() => { if (existed) fs.writeFileSync(file, prev); else fs.unlinkSync(file); });
}

try {
    mkdirp(V3);
    for (const b of layout.bucketNames()) {
        const dir = layout.bucketDir(V3, b);
        const fresh = !fs.existsSync(dir);
        mkdirp(dir);
        if (fresh) undo.push(() => { try { fs.rmdirSync(dir); } catch (_) {} });
    }

    for (const [name, info] of byName) {
        writeNew(info.to, newPageText.get(name));
    }
    fs.rmSync(oldPagesDir, { recursive: true, force: true });
    undo.push(() => {
        mkdirp(oldPagesDir);
        for (const [name, text] of origPageText) fs.writeFileSync(path.join(oldPagesDir, name), text, 'utf8');
    });

    if (fs.existsSync(oldRaw)) moveFile(oldRaw, path.join(V3, layout.RAW_DIR));

    if (indexBody !== null) writeNew(layout.indexFile(V3), indexBody);
    if (logBody !== null) writeNew(layout.logFile(V3), logBody);

    writeNew(layout.contractFile(V3), buildContract());
    const shimTpl = path.join(SKILL_DIR, 'references', 'claude-shim.md');
    writeNew(layout.claudeShim(V3), fs.existsSync(shimTpl) ? fs.readFileSync(shimTpl, 'utf8') : 'See AGENTS.md\n');

    for (const f of fs.readdirSync(V2).filter((f) => /^lint-report-.*\.md$/.test(f))) {
        moveFile(path.join(V2, f), path.join(V3, f));
    }

    if (fs.existsSync(oldSchema)) {
        const prev = fs.readFileSync(oldSchema);
        fs.unlinkSync(oldSchema);
        undo.push(() => fs.writeFileSync(oldSchema, prev));
    }
    // 旧 root 若只剩空壳（wiki/ 之外的顶层已搬空），不留垃圾。
    // 原地升级时 V2 就是 V3/wiki，它本来就该有内容，跳过此项。
    if (path.resolve(V2) !== path.resolve(path.join(V3, layout.WIKI_DIR))) {
        for (const f of fs.readdirSync(V2)) {
            if (f !== layout.WIKI_DIR) die(`落盘后 ${V2} 仍残留 ${f} —— 请人工确认`);
        }
    }
} catch (e) {
    console.error(`\n✗ 落盘失败，回滚：${e.message}`);
    for (const u of undo.reverse()) { try { u(); } catch (_) {} }
    process.exit(1);
}

// ── 自检 ────────────────────────────────────────────────────────────────────
console.log('\n自检:');
const fails = [];

// ① dirname === bucket(type)
for (const p of layout.listPages(V3)) {
    const { data } = parse(fs.readFileSync(p.abs, 'utf8'));
    const expected = layout.bucketRelOf(data && data.type);
    if (path.posix.dirname(p.rel) !== expected) fails.push(`① 桶错位: ${p.rel}（type=${data && data.type} 应在 ${expected}/）`);
}
console.log(`  ① 每页 dirname === bucket(type)  ${fails.length ? '✗' : '✓'}`);

// ② 每条 markdown 链接可解析
const linkFails = [];
const allDocs = [...layout.listPages(V3).map((p) => p.abs), layout.indexFile(V3), layout.logFile(V3)].filter((f) => fs.existsSync(f));
for (const file of allDocs) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const clean = target.split('#')[0];
        if (!clean) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), decodeURI(clean)))) {
            linkFails.push(`${path.relative(V3, file)} → ${target}`);
        }
    }
}
console.log(`  ② 链接全部可解析  ${linkFails.length ? `✗ (${linkFails.length})` : '✓'}`);
for (const f of linkFails) fails.push(`② 断链: ${f}`);

// ③ index 链接集合 === 磁盘页集合
const indexed = new Set();
const indexText = fs.readFileSync(layout.indexFile(V3), 'utf8');
for (const m of indexText.matchAll(/\]\(([^)\s]+)\)/g)) {
    const clean = m[1].split('#')[0];
    if (clean) indexed.add(path.resolve(path.dirname(layout.indexFile(V3)), decodeURI(clean)));
}
const onDisk = new Set(layout.listPages(V3).map((p) => p.abs));
const missing = [...onDisk].filter((f) => !indexed.has(f));
const extra = [...indexed].filter((f) => !onDisk.has(f));
console.log(`  ③ index 集合 === 磁盘页集合  ${missing.length || extra.length ? '✗' : '✓'}`);
if (missing.length) fails.push(`③ index 缺: ${missing.map((f) => path.relative(V3, f)).join(', ')}`);
if (extra.length) fails.push(`③ index 多: ${extra.map((f) => path.relative(V3, f)).join(', ')}`);

// ④ lint 退出码 0
try {
    execFileSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'wiki_lint.js'), `--root=${V3}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('  ④ wiki_lint.js 退出码 0  ✓');
} catch (e) {
    console.log(`  ④ wiki_lint.js 退出码 0  ✗ (exit=${e.status})`);
    console.log(String(e.stdout || '').trim());
    fails.push('④ lint 退出码非 0');
}

if (fails.length) {
    console.error(`\n✗ 自检失败 ${fails.length} 项（文件已落盘，请人工核对）：`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`\n✓ 迁移完成。别忘了更新库注册表：把 ~/.llm-wiki/config.json 里该项从 "${V2}" 改成 "${V3}"。`);
