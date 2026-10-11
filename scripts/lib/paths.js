'use strict';
/**
 * 路径守卫与文件读写。
 *
 * 本 skill 最硬的一条规则是"越界写入 hard failure"（spec §3.4）——
 * 所有写入必须先过 resolveInside()，这是唯一入口。
 */
const fs = require('fs');
const path = require('path');

/** 解析 root 下的目标路径；逃出 root 则抛错（不 promise、不 warn，直接失败）。 */
function resolveInside(root, ...parts) {
    const absRoot = path.resolve(root);
    const target = path.resolve(absRoot, ...parts);
    const rel = path.relative(absRoot, target);
    // rel === '' 表示就是 root 本身；以 .. 开头或仍是绝对路径都说明逃逸了。
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        const e = new Error(`越界写入被阻断: ${target} 不在 wiki root ${absRoot} 之内`);
        e.code = 'OUT_OF_ROOT';
        throw e;
    }
    return target;
}

/** 是否在 root 内（只判断，不抛错）。 */
function isInside(root, target) {
    try { resolveInside(root, target); return true; } catch (_) { return false; }
}

function writeText(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
}

function readText(file) {
    return fs.readFileSync(file, 'utf8');
}

function exists(p) {
    try { fs.statSync(p); return true; } catch (_) { return false; }
}

function isDir(p) {
    try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

/** 递归列出目录下匹配的文件（返回相对 root 的 posix 风格路径）。 */
function listFiles(root, filter, dir = root, out = []) {
    for (const name of fs.readdirSync(dir).sort()) {
        if (name === 'node_modules' || name === '.git') continue;
        const abs = path.join(dir, name);
        if (isDir(abs)) listFiles(root, filter, abs, out);
        else if (!filter || filter(abs, name)) out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
    return out;
}

/** 从 fromFile 指向 toFile 的 markdown 相对链接（posix 分隔符，URL 里必须是 /）。 */
function relLink(fromFile, toFile) {
    const rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : './' + rel;
}

/** 解析 markdown 链接目标：相对当前文件解析成绝对路径，剥掉 #anchor。 */
function resolveLink(fromFile, target) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // http: mailto: 等外部链接
    const clean = target.split('#')[0];
    if (!clean) return null; // 纯 #anchor
    return path.resolve(path.dirname(fromFile), decodeURI(clean));
}

module.exports = { resolveInside, isInside, writeText, readText, exists, isDir, listFiles, relLink, resolveLink };
