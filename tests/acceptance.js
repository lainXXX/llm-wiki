#!/usr/bin/env node
'use strict';
/**
 * acceptance.js — spec §10 的验收断言（可脚本化的部分）。
 *
 * 断言分两类：
 *  - 脚本级（本文件）：隔离性、frontmatter/sha256、lint 检查项、档位判定——可复现、可 CI。
 *  - agent 行为级（文件末尾 MANUAL）：暂停点、归档确认、上下文规模等需要真实会话才能验证，
 *    硬写成断言只会得到假绿。
 *
 * v3：知识页在 `wiki/<桶>/` 下，页面路径一律经 layout.type_to_bucket 推导——
 * 不再有 `pages/` 字面量，也就不会让"页面放错桶"这类错误在测试里静默通过。
 *
 * 用法: node tests/acceptance.js [--keep]
 * 退出码: 有 FAIL → 1。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const layout = require('../scripts/lib/layout');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-wiki-acc-'));
const KEEP = process.argv.includes('--keep');

let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function script(name, args, { env = {}, cwd = ROOT } = {}) {
    try {
        const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', name), ...args], {
            cwd,
            env: { ...process.env, ...env },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, stdout, stderr: '' };
    } catch (e) {
        return { code: e.status === undefined ? -1 : e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
    }
}

const cfgFor = (tag) => path.join(TMP, `config-${tag}.json`);
const envFor = (tag) => ({ LLM_WIKI_CONFIG: cfgFor(tag) });

let wikiSeq = 0;
function freshWiki(tag) {
    const root = path.join(TMP, `wiki-${tag}-${++wikiSeq}`);
    const r = script('wiki_init.js', [`--root=${root}`, `--name=${tag}`], { env: envFor(tag) });
    if (r.code !== 0) throw new Error(`init 失败: ${r.stderr}`);
    return root;
}

function write(rel, text, root) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf8');
    return abs;
}

/**
 * v4：在一个 container（普通目录）下建几个互为兄弟的 instance，共用同一份 config。
 * freshWiki 是平铺的单库，做不了跨实例用例。
 */
function siblingWikis(tag, names) {
    const container = path.join(TMP, `container-${tag}-${++wikiSeq}`);
    const roots = {};
    for (const n of names) {
        const root = path.join(container, n);
        const r = script('wiki_init.js', [`--root=${root}`, `--name=${n}`], { env: envFor(tag) });
        if (r.code !== 0) throw new Error(`init ${n} 失败: ${r.stderr}`);
        roots[n] = root;
    }
    return { container, roots };
}

/** 写一页；落在哪个桶由 fm.type 经 layout 推导（和 skill 的规则同源）。 */
function page(root, name, fm, body = '') {
    const bucket = layout.bucketOf(fm.type);
    if (!bucket) throw new Error(`page(): 未知 type ${fm.type}`);
    const lines = Object.entries(fm).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
    return write(`wiki/${bucket}/${name}`, `---\n${lines.join('\n')}\n---\n\n# ${fm.title}\n\n${body}`, root);
}

const SECTION_OF = { sources: 'Sources', concepts: 'Concepts', entities: 'Entities', syntheses: 'Syntheses' };

/** 往 wiki/index.md 的对应分区插一行；rel 形如 `concepts/a.md`（相对 wiki/）。 */
function indexAdd(root, rel, desc, area) {
    const f = layout.indexFile(root);
    const bucket = rel.split('/')[0];
    const heading = `## ${SECTION_OF[bucket]}`;
    const text = fs.readFileSync(f, 'utf8');
    const idx = text.indexOf(heading);
    if (idx === -1) throw new Error(`index 缺少分区 ${heading}`);
    const insertAt = text.indexOf('\n', idx + heading.length) + 1;
    const line = `- [${path.basename(rel, '.md')}](${rel}) — ${desc} · area:${area}\n`;
    fs.writeFileSync(f, text.slice(0, insertAt) + line + text.slice(insertAt), 'utf8');
}

/** 往 Tensions 分区插一行（行尾照样带 area:，lint 一视同仁）。 */
function tensionAdd(root, rel, desc, area) {
    const f = layout.indexFile(root);
    const heading = '## Tensions';
    const text = fs.readFileSync(f, 'utf8');
    const idx = text.indexOf(heading);
    const insertAt = text.indexOf('\n', idx + heading.length) + 1;
    const line = `- [${path.basename(rel, '.md')}](./${rel}#tensions) — ${desc} · area:${area}\n`;
    fs.writeFileSync(f, text.slice(0, insertAt) + line + text.slice(insertAt), 'utf8');
}

function hashTree(dir) {
    const files = [];
    (function walk(d) {
        for (const n of fs.readdirSync(d).sort()) {
            const abs = path.join(d, n);
            if (fs.statSync(abs).isDirectory()) walk(abs);
            else files.push(path.relative(dir, abs).split(path.sep).join('/') + ':' + crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'));
        }
    })(dir);
    return crypto.createHash('sha256').update(files.join('\n')).digest('hex');
}

function sha256(text) {
    return crypto.createHash('sha256').update(Buffer.from(text)).digest('hex');
}

function lint(root, tag) {
    const r = script('wiki_lint.js', [`--root=${root}`, '--json', '--no-write'], { env: envFor(tag) });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (_) {}
    // v4：INFO 是新档（跨库链接）。并进 kinds，否则新档对下面的 includes 断言不可见。
    return { r, json, kinds: json ? [...json.items.blocking, ...json.items.backlog, ...json.items.info].map((i) => i.kind) : [] };
}

console.log(`临时根: ${TMP}\n`);

// ── A1 空目录 init ──────────────────────────────────────────────────────────
console.log('A. 隔离性 / 零污染');
{
    const tag = 'a1';
    const root = freshWiki(tag);
    for (const d of ['raw', 'raw/assets', 'wiki', ...layout.bucketNames().map((b) => `wiki/${b}`)]) {
        check(`A1 目录 ${d}/ 存在`, fs.existsSync(path.join(root, d)));
    }
    for (const f of ['AGENTS.md', 'CLAUDE.md', 'wiki/index.md', 'wiki/log.md']) {
        check(`A1 文件 ${f} 存在`, fs.existsSync(path.join(root, f)));
    }
    const entries = fs.readdirSync(root).sort();
    check('A1 root 只含白名单条目', entries.every((n) => layout.ROOT_WHITELIST.includes(n)), JSON.stringify(entries));
    check('A1 index 头部标 contract: AGENTS.md', /contract: AGENTS\.md/.test(fs.readFileSync(layout.indexFile(root), 'utf8')));

    const cfg = JSON.parse(fs.readFileSync(cfgFor(tag), 'utf8'));
    check('A1 config.json 含该库条目', cfg.wikis && cfg.wikis[tag] === path.resolve(root), JSON.stringify(cfg.wikis));
    check('A1 注册表指向 instance root（不是 wiki/）', cfg.wikis[tag] === path.resolve(root) && !/wiki$/.test(cfg.wikis[tag]), cfg.wikis[tag]);
    check('A1 首个库被设为 default', cfg.default === tag);

    // A2/A3：在项目目录内触发 init，项目树零变化
    const proj = path.join(TMP, 'fake-project');
    write('package.json', '{"name":"fake"}', proj);
    write('src/app.js', 'console.log(1)', proj);
    write('CLAUDE.md', '# 项目说明\n', proj);
    for (let i = 0; i < 10; i++) write(`docs/f${i}.md`, `文件 ${i}`, proj);
    const before = hashTree(proj);
    const claudeBefore = fs.statSync(path.join(proj, 'CLAUDE.md')).mtimeMs;
    const root2 = path.join(TMP, 'wiki-a2');
    script('wiki_init.js', [`--root=${root2}`, '--name=a2'], { env: envFor('a2'), cwd: proj });
    script('wiki_lint.js', [`--root=${root2}`], { env: envFor('a2'), cwd: proj });
    check('A2 项目目录内新增/修改/删除字节数 = 0', hashTree(proj) === before);
    check('A3 项目 CLAUDE.md mtime 不变', fs.statSync(path.join(proj, 'CLAUDE.md')).mtimeMs === claudeBefore);
    check('A3 项目根无 .llm-wiki.json 指针', !fs.existsSync(path.join(proj, '.llm-wiki.json')));
}
{
    // A4 三级根发现
    const tag = 'a4';
    const emptyCfg = cfgFor(tag);
    const noCfg = script('wiki_stats.js', [], { env: envFor(tag) });
    check('A4 无 config → 报错而非静默新建', noCfg.code !== 0 && /未找到|NO_CONFIG/.test(noCfg.stderr));
    check('A4 无 config 时未创建配置文件', !fs.existsSync(emptyCfg));

    const rootDef = freshWiki(tag);
    const byDefault = script('wiki_stats.js', ['--json'], { env: envFor(tag) });
    check('A4 不点名 → 落在 default', byDefault.code === 0 && JSON.parse(byDefault.stdout).root === path.resolve(rootDef));

    const unknown = script('wiki_stats.js', ['--name=work'], { env: envFor(tag) });
    check('A4 点名不存在的库 → 报错并列出可用名', unknown.code !== 0 && /可用/.test(unknown.stderr), unknown.stderr.trim());

    const rootWork = path.join(TMP, 'wiki-work');
    script('wiki_init.js', [`--root=${rootWork}`, '--name=work'], { env: envFor(tag) });
    const byName = script('wiki_stats.js', ['--name=work', '--json'], { env: envFor(tag) });
    check('A4 点名 work → 落在 wikis.work', byName.code === 0 && JSON.parse(byName.stdout).root === path.resolve(rootWork));
}

// ── B. 事务性与幂等 ─────────────────────────────────────────────────────────
console.log('\nB. Ingest 事务性与幂等');
{
    const tag = 'b';
    const root = freshWiki(tag);
    const content = '自注意力复杂度 O(n^2 d)';
    write('raw/paper.txt', content, root);
    const hash = sha256(content);
    page(root, 'src-001-paper.md', {
        type: 'source', title: '测试源', area: 'ai', created: '2026-09-17', updated: '2026-09-17',
        status: 'stable', sources: '[]', sha256: hash.slice(0, 12), source_path: 'raw/paper.txt', tags: '[test]',
    }, '见 [原文](../../raw/paper.txt)\n');
    indexAdd(root, 'sources/src-001-paper.md', '测试源', 'ai');

    const l1 = lint(root, tag);
    check('B1 sha256 与实际一致 → 无"源已变更"告警', !l1.kinds.includes('源已变更'), JSON.stringify(l1.kinds));
    check('B1 无反引号/字段类 frontmatter 问题', !l1.kinds.includes('frontmatter'), JSON.stringify(l1.kinds));
    check('B1 页面在正确的桶里', !l1.kinds.includes('桶错位'), JSON.stringify(l1.kinds));

    const s1 = script('source_status.js', [`--root=${root}`, '--file=raw/paper.txt', '--json'], { env: envFor(tag) });
    check('B4 同源第二次 ingest → unchanged（幂等）', JSON.parse(s1.stdout).status === 'unchanged', s1.stdout.trim());
    const s2 = script('source_status.js', [`--root=${root}`, '--file=raw/never-seen.txt', '--json'], { env: envFor(tag) });
    check('B4 未登记文件 → unknown（文件不存在）', JSON.parse(s2.stdout).status === 'unknown');
    write('raw/fresh.txt', '新内容', root);
    const s3 = script('source_status.js', [`--root=${root}`, '--file=raw/fresh.txt', '--json'], { env: envFor(tag) });
    check('B4 未登记且存在 → new', JSON.parse(s3.stdout).status === 'new');

    // B6 源变更：改 raw → changed（不是 unchanged）；新开 src-002 + supersedes；旧页仍在
    write('raw/paper.txt', content + '（v2 修订）', root);
    const s4 = script('source_status.js', [`--root=${root}`, '--file=raw/paper.txt', '--json'], { env: envFor(tag) });
    check('B6 源被改 → changed（识别同路径不同哈希）', JSON.parse(s4.stdout).status === 'changed', s4.stdout.trim());
    const newContent = fs.readFileSync(path.join(root, 'raw/paper.txt'), 'utf8');
    page(root, 'src-002-paper-v2.md', {
        type: 'source', title: '测试源 v2', area: 'ai', created: '2026-09-17', updated: '2026-09-17',
        status: 'stable', sources: '[]', sha256: sha256(newContent).slice(0, 12), source_path: 'raw/paper.txt',
        supersedes: 'src-001', tags: '[test]',
    }, '见 [原文](../../raw/paper.txt)\n');
    indexAdd(root, 'sources/src-002-paper-v2.md', '测试源 v2', 'ai');
    const l2 = lint(root, tag);
    check('B6 旧 source 页仍存在', fs.existsSync(path.join(root, 'wiki', 'sources', 'src-001-paper.md')));
    check('B6 supersedes 指向存在的页 → 无悬空 source', !l2.kinds.includes('悬空 source'), JSON.stringify(l2.kinds));
    check('B1 v2 页 sha256 与实际一致 → 无"源已变更"', !l2.kinds.includes('源已变更'), JSON.stringify(l2.kinds));

    // B7 / E4：.bak 残留 = 上次没跑完的信号
    script('wiki_stats.js', [`--root=${root}`], { env: envFor(tag) });
    script('new_source_id.js', [`--root=${root}`], { env: envFor(tag) });
    check('B7 成功路径不产生 .bak 残留', !fs.readdirSync(path.join(root, 'wiki', 'sources')).some((f) => f.includes('.bak-')));
    write('wiki/sources/orphan.md.bak-20260917-101010', '半成品', root);
    const l3 = lint(root, tag);
    check('E4 .bak 残留被 lint 列出', l3.kinds.includes('bak 残留'), JSON.stringify(l3.kinds));
    fs.unlinkSync(path.join(root, 'wiki', 'sources', 'orphan.md.bak-20260917-101010'));

    const idr = script('new_source_id.js', [`--root=${root}`, '--slug=attention', '--json'], { env: envFor(tag) });
    check('B1 new_source_id 取 max+1（不撞号）', JSON.parse(idr.stdout).id === 'src-003', idr.stdout.trim());
}

// ── C. 矛盾保全（脚本可判定部分） ───────────────────────────────────────────
console.log('\nC. 矛盾保全');
{
    const tag = 'c';
    const root = freshWiki(tag);
    const fm = {
        type: 'concept', title: '线程池上限', area: 'systems', created: '2026-09-17', updated: '2026-09-17',
        status: 'contested', sources: '[src-001, src-002]',
    };
    const callout = '## Tensions\n\n> [!conflict] 2026-04-03\n> 源 A 称 16；源 B 称 64。\n> **未裁决。**\n';
    page(root, 'max-threads.md', fm, callout);
    indexAdd(root, 'concepts/max-threads.md', '线程池上限', 'systems');
    tensionAdd(root, 'concepts/max-threads.md', 'src-001 与 src-002 说法不一致', 'systems');
    page(root, 'src-001-a.md', { type: 'source', title: 'A', area: 'systems', created: '2026-09-17', updated: '2026-09-17', status: 'stable', sha256: 'aaaa1111', source_path: 'raw/a.txt' });
    page(root, 'src-002-b.md', { type: 'source', title: 'B', area: 'systems', created: '2026-09-17', updated: '2026-09-17', status: 'stable', sha256: 'bbbb2222', source_path: 'raw/b.txt' });
    indexAdd(root, 'sources/src-001-a.md', 'A', 'systems');
    indexAdd(root, 'sources/src-002-b.md', 'B', 'systems');
    write('raw/a.txt', 'A', root);
    write('raw/b.txt', 'B', root);
    const text = fs.readFileSync(path.join(root, 'wiki', 'concepts', 'max-threads.md'), 'utf8');
    check('C1 两种主张与来源同时保留', /16/.test(text) && /64/.test(text) && /15/.test(text) === false && /src-001/.test(text) && /src-002/.test(text));
    check('C1 frontmatter status=contested', /status: contested/.test(text));
    const l = lint(root, tag);
    check('C2 未裁决矛盾被 lint 列出', l.kinds.includes('未裁决矛盾'), JSON.stringify(l.kinds));
}

// ── E. Lint ─────────────────────────────────────────────────────────────────
console.log('\nE. Lint');
{
    const tag = 'e1';
    const root = freshWiki(tag);
    page(root, 'a.md', { type: 'concept', title: 'A', area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' }, '见 [B](b.md)\n');
    indexAdd(root, 'concepts/a.md', 'A', 'ai');
    const l = lint(root, tag);
    check('E1 断链被列出且退出码非 0', l.r.code === 1 && l.kinds.includes('断链'), `exit=${l.r.code} kinds=${JSON.stringify(l.kinds)}`);
}
{
    const tag = 'e3';
    const root = freshWiki(tag);
    write('AGENTS.md', `---\nareas: [ai]\nstale_after_days: 90\nlanguage: zh\ncontract_version: ${layout.CONTRACT_VERSION}\n---\n\n# 契约\n`, root);
    page(root, 'ok.md', { type: 'concept', title: 'OK', area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' });
    indexAdd(root, 'concepts/ok.md', 'OK', 'ai');
    indexAdd(root, 'concepts/ghost.md', '幽灵', 'ai');
    write('wiki/concepts/bad-area.md', '---\ntype: concept\ntitle: 坏区\narea: zzz\ncreated: 2026-09-17\nupdated: 2026-09-17\nstatus: stable\n---\n\n正文\n', root);
    indexAdd(root, 'concepts/bad-area.md', '坏区', 'zzz');
    write('wiki/concepts/no-fm.md', '# 没有 frontmatter 的页\n', root);
    indexAdd(root, 'concepts/no-fm.md', '无 fm', 'ai');
    const l = lint(root, tag);
    check('E3 孤儿页被捕获', l.kinds.includes('孤儿页'), JSON.stringify(l.kinds));
    check('E3 幽灵概念被捕获', l.kinds.includes('幽灵概念'), JSON.stringify(l.kinds));
    check('E3 frontmatter 缺失被捕获', l.kinds.includes('frontmatter'), JSON.stringify(l.kinds));
    check('E3 area 不在词表被捕获', (l.json ? l.json.items.backlog.some((i) => /area 不在词表/.test(i.detail)) : false), JSON.stringify(l.kinds));
}
{
    // E5 桶错位：type 与所在桶不符 → Blocking
    const tag = 'e5';
    const root = freshWiki(tag);
    write('wiki/syntheses/misplaced.md', '---\ntype: concept\ntitle: 放错桶\narea: ai\ncreated: 2026-09-17\nupdated: 2026-09-17\nstatus: stable\n---\n\n正文\n', root);
    write('wiki/concepts/right.md', '---\ntype: concept\ntitle: 正确\narea: ai\ncreated: 2026-09-17\nupdated: 2026-09-17\nstatus: stable\n---\n\n正文\n', root);
    indexAdd(root, 'concepts/right.md', '正确', 'ai');
    indexAdd(root, 'syntheses/misplaced.md', '放错桶', 'ai');
    const l = lint(root, tag);
    check('E5 桶错位是 Blocking 且退出码非 0', l.r.code === 1 && l.kinds.includes('桶错位'), `exit=${l.r.code} kinds=${JSON.stringify(l.kinds)}`);
}
{
    // E7 契约版本落后 → Backlog
    const tag = 'e7';
    const root = freshWiki(tag);
    const contract = fs.readFileSync(layout.contractFile(root), 'utf8');
    fs.writeFileSync(layout.contractFile(root), contract.replace(/^contract_version: \d+$/m, 'contract_version: 2'), 'utf8');
    const l = lint(root, tag);
    check('E7 契约版本落后被列出', l.kinds.includes('契约版本落后'), JSON.stringify(l.kinds));
    check('E7 契约版本落后不阻断（退出码 0）', l.r.code === 0, `exit=${l.r.code}`);
}
{
    // E6 root 杂项 → Backlog
    const tag = 'e6';
    const root = freshWiki(tag);
    write('stray.txt', '不该在这', root);
    const l = lint(root, tag);
    check('E6 root 杂项被列出', l.kinds.includes('root 杂项'), JSON.stringify(l.kinds));
    check('E6 root 杂项不阻断（退出码 0）', l.r.code === 0, `exit=${l.r.code}`);
}
{
    const tag = 'e2';
    const root = freshWiki(tag);
    // 320 页摊到四个桶（types 的取值覆盖 type→bucket 的四个像）
    write('raw/e2.txt', 'e2', root);
    const e2hash = sha256('e2').slice(0, 12);
    const types = ['concept', 'entity', 'synthesis', 'source'];
    for (let i = 0; i < 320; i++) {
        const n = String(i).padStart(3, '0');
        const type = types[i % types.length];
        const fm = { type, title: `P${n}`, area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' };
        if (type === 'source') { fm.sha256 = e2hash; fm.source_path = 'raw/e2.txt'; }
        page(root, `p${n}.md`, fm);
        indexAdd(root, `${layout.bucketOf(type)}/p${n}.md`, `P${n}`, 'ai');
    }
    const s = script('wiki_stats.js', [`--root=${root}`, '--json'], { env: envFor(tag) });
    const sj = JSON.parse(s.stdout);
    check('E2 320 页 → 判定 L 档', sj.tier === 'L', s.stdout.trim().slice(0, 120));
    check('E2 页面摊到四个桶', Object.keys(sj.by_bucket).length === 4, JSON.stringify(sj.by_bucket));
    const s2 = script('wiki_stats.js', [`--root=${root}`, '--json', '--by-area'], { env: envFor(tag) });
    check('E2 --by-area 输出 area 视图', JSON.parse(s2.stdout).by_area.ai === 320);
    const l = lint(root, tag);
    check('E2 320 页全部落在正确的桶（无桶错位）', !l.kinds.includes('桶错位'), JSON.stringify(l.kinds));
}

// ── E8-E11 · v4 跨实例 ──────────────────────────────────────────────────────
{
    // E8/E9 跨实例链接：逃出 instance root 的链接一律 INFO，可达与否都不判错
    const tag = 'e8';
    const { roots } = siblingWikis(tag, ['alpha', 'beta']);
    page(roots.beta, 'foo.md', { type: 'concept', title: 'Foo', area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' });
    page(roots.alpha, 'x.md', { type: 'concept', title: 'X', area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' },
        '见 [foo](../../../beta/wiki/concepts/foo.md) 与 [nope](../../../beta/wiki/concepts/nope.md)\n');
    indexAdd(roots.alpha, 'concepts/x.md', 'X', 'ai');

    const l = lint(roots.alpha, tag);
    const info = (l.json && l.json.items.info) || [];
    const details = info.map((i) => i.detail).join('\n');
    check('E8 可达跨库链接进 INFO', info.some((i) => /可达/.test(i.detail)) && !/可达，未落在/.test(details), details);
    check('E8 跨库链接不被判成断链', !l.kinds.includes('断链'), JSON.stringify(l.kinds));
    check('E8 注册表把兄弟库名写进消息', /beta\/wiki\/concepts\/foo\.md/.test(details), details);
    check('E9 不可达跨库链接仍是 INFO', info.some((i) => /不可达/.test(i.detail)), details);
    check('E9 跨库 INFO 不参与退出码', l.r.code === 0, `exit=${l.r.code}`);
}
{
    // E10 回归守卫：逃逸改动不得削弱 root 内的手误检测
    const tag = 'e10';
    const { roots } = siblingWikis(tag, ['alpha', 'beta']);
    page(roots.alpha, 'x.md', { type: 'concept', title: 'X', area: 'ai', created: '2026-09-17', updated: '2026-09-17', status: 'stable' },
        '见 [ghost](ghost.md)\n');
    indexAdd(roots.alpha, 'concepts/x.md', 'X', 'ai');
    const l = lint(roots.alpha, tag);
    check('E10 root 内缺失链接仍是 Blocking 断链', l.json.items.blocking.some((i) => i.kind === '断链'), JSON.stringify(l.kinds));
    check('E10 且退出码为 1', l.r.code === 1, `exit=${l.r.code}`);
}
{
    // E11 container 守卫：在装了 instance 的目录上直接 lint → 拒绝并指路
    const tag = 'e11';
    const { container, roots } = siblingWikis(tag, ['alpha', 'beta']);
    const r = script('wiki_lint.js', [`--root=${container}`], { env: envFor(tag) });
    check('E11 在 container 上 lint 被拒绝', r.code !== 0 && /container/.test(r.stderr), r.stderr.trim());
    check('E11 错误消息列出候选实例', /alpha/.test(r.stderr) && /beta/.test(r.stderr), r.stderr.trim());

    // 半建成的 instance（有 wiki/ 但还没 AGENTS.md）不是 container，守卫必须放行
    const partial = path.join(TMP, `half-${++wikiSeq}`);
    fs.mkdirSync(path.join(partial, 'wiki'), { recursive: true });
    const rp = script('wiki_lint.js', [`--root=${partial}`, '--json', '--no-write'], { env: envFor(tag) });
    let rj = null;
    try { rj = JSON.parse(rp.stdout); } catch (_) {}
    check('E11 半建成的 instance 不被当 container 拒绝', !/container/.test(rp.stderr), rp.stderr.trim());
    check('E11 且照常体检（报 index 漂移）', !!rj && rj.items.blocking.some((i) => i.kind === 'index 漂移'), rp.stdout.trim().slice(0, 120));
}
{
    // --wiki=x 是 --name=x 的别名
    const tag = 'wiki-alias';
    const root = freshWiki(tag);
    const byWiki = script('wiki_stats.js', ['--wiki=' + tag, '--json'], { env: envFor(tag) });
    const byName = script('wiki_stats.js', ['--name=' + tag, '--json'], { env: envFor(tag) });
    check('--wiki 与 --name 解析出同一 root',
        byWiki.code === 0 && byName.code === 0 && JSON.parse(byWiki.stdout).root === JSON.parse(byName.stdout).root,
        `wiki=${byWiki.stdout.trim().slice(0, 80)} name=${byName.stdout.trim().slice(0, 80)}`);
}

// ── F. 契约稳定性 ───────────────────────────────────────────────────────────
console.log('\nF. 契约稳定性');
{
    const tag = 'f';
    const root = freshWiki(tag);
    const contract = layout.contractFile(root);
    const before = fs.readFileSync(contract);
    const mtime = fs.statSync(contract).mtimeMs;
    script('wiki_lint.js', [`--root=${root}`], { env: envFor(tag) });
    script('wiki_stats.js', [`--root=${root}`], { env: envFor(tag) });
    script('new_source_id.js', [`--root=${root}`], { env: envFor(tag) });
    script('source_status.js', [`--root=${root}`, '--file=raw/x.txt'], { env: envFor(tag) });
    check('F1 脚本运行不改动 AGENTS.md 内容', fs.readFileSync(contract).equals(before));
    check('F1 AGENTS.md mtime 不变', fs.statSync(contract).mtimeMs === mtime);

    const shim = layout.claudeShim(root);
    check('F2 CLAUDE.md 存在', fs.existsSync(shim));
    const shimText = fs.readFileSync(shim, 'utf8');
    check('F2 CLAUDE.md 是指向 AGENTS.md 的指针', /AGENTS\.md/.test(shimText) && shimText.split('\n').filter((l) => l.trim()).length === 1, JSON.stringify(shimText));
    check('F2 CLAUDE.md 与 AGENTS.md 无内容重复', !fs.readFileSync(contract, 'utf8').includes(shimText.trim()));
}

// ── 汇总 ────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`脚本级断言: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
console.log(`\n未覆盖项（需要真实 agent 会话，见 tests/README 或 spec §10）:`);
console.log('  MANUAL B2/B3/B5  log.md 状态流转、index 行、中断恢复提示');
console.log('  MANUAL C/D      矛盾裁决权、D1 缺口不装、D2/D4 归档确认在回答之后、D3 读页 ≤8');
console.log('  MANUAL G1       单次 ingest 会话 token 增量 ≤30k');
console.log('  MANUAL §5.1     ingest 硬上限 ≤5 页 / diff >200 行暂停');
if (!KEEP) fs.rmSync(TMP, { recursive: true, force: true });
else console.log(`\n保留现场: ${TMP}`);
process.exit(failures.length ? 1 : 0);
