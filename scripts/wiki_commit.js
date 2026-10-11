#!/usr/bin/env node
'use strict';
/**
 * wiki_commit.js — 规范化提交（spec §6.2 的 op 前缀）。
 *
 * 安全约束：只有当 wiki root **就是** git 仓库根时才自动提交。若 wiki 落在某个更大仓库内部，
 * `git add -A` 会把无关文件一起提交（spec §5.1 同源风险），此时脚本拒绝提交并说明原因——
 * 越界提交比不提交危险得多。
 *
 * 用法: node <SKILL_DIR>/scripts/wiki_commit.js --message="ingest: transformer" [--root=P|--name=x|--wiki=x]
 * 无 git 时是 no-op（exit 0）。
 */
const { execFileSync } = require('child_process');
const { resolveRoot, parseArgs, explain } = require('./lib/wiki-root');

const OPS = ['init', 'ingest', 'query', 'lint', 'schema', 'gap', 'user-edit'];

function git(root, args) {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function normalize(message) {
    const m = String(message || '').trim();
    if (!m) return null;
    const head = m.split(':')[0].trim();
    return OPS.includes(head) ? m : `wiki: ${m}`;
}

function main() {
    const { flags } = parseArgs(process.argv.slice(2));
    const { root } = resolveRoot({ root: typeof flags.root === 'string' ? flags.root : null, name: typeof flags.name === 'string' ? flags.name : null });
    const message = normalize(flags.message);
    if (!message) {
        process.stderr.write(`用法: node "${process.argv[1]}" --message="ingest: <slug>" [--root=P]\n`);
        process.exit(64);
    }

    let toplevel = null;
    try {
        if (git(root, ['rev-parse', '--is-inside-work-tree']) !== 'true') throw new Error('not a work tree');
        toplevel = git(root, ['rev-parse', '--show-toplevel']);
    } catch (_) {
        console.log(JSON.stringify({ committed: false, reason: 'no-git', message }));
        return;
    }

    if (require('path').resolve(toplevel) !== require('path').resolve(root)) {
        process.stderr.write(`⚠ wiki root 不是仓库根（仓库根是 ${toplevel}）——拒绝自动提交，避免把无关文件一起提交。请手动在 ${root} 范围内提交。\n`);
        console.log(JSON.stringify({ committed: false, reason: 'root-inside-larger-repo', toplevel, message }));
        return;
    }

    git(root, ['add', '-A', '--', '.']);
    const dirty = git(root, ['status', '--porcelain']);
    if (!dirty) {
        console.log(JSON.stringify({ committed: false, reason: 'nothing-to-commit', message }));
        return;
    }
    git(root, ['commit', '-m', message]);
    const hash = git(root, ['rev-parse', '--short', 'HEAD']);
    console.log(JSON.stringify({ committed: true, hash, message }));
}

try { main(); } catch (e) {
    process.stderr.write(`✗ commit 失败: ${explain(e)}\n`);
    process.exit(1);
}
