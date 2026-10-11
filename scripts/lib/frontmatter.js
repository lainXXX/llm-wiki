'use strict';
/**
 * frontmatter 读写与合规校验（spec §7）。
 *
 * 用 yaml 库解析，不自研子集解析器：area/derived_from 这类数组字段一旦出现多行写法，
 * 手写 parser 就会在引号、转义、块标量上慢慢失守（spec §9 依赖政策）。
 */
const path = require('path');
const YAML = require('yaml');
const { readText } = require('./paths');

const TYPES = ['source', 'paper', 'concept', 'method', 'entity', 'synthesis'];
const STATUSES = ['stub', 'draft', 'stable', 'contested', 'superseded'];
const REQUIRED = ['type', 'title', 'area', 'created', 'updated', 'status'];

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parse(text) {
    const m = text.match(FM_RE);
    if (!m) return { data: null, body: text, error: '缺少 frontmatter 块' };
    try {
        return { data: YAML.parse(m[1]) || {}, body: text.slice(m[0].length) };
    } catch (e) {
        return { data: null, body: text.slice(m[0].length), error: `frontmatter YAML 解析失败: ${e.message}` };
    }
}

function stringify(data, body) {
    return `---\n${YAML.stringify(data).trimEnd()}\n---\n\n${body.replace(/^\n+/, '')}`;
}

function parseFile(file) {
    return parse(readText(file));
}

/** 校验一页；返回问题字符串数组（空 = 合规）。areas 传 null 表示跳过词表检查。 */
function check(data, areas) {
    const problems = [];
    if (!data) return ['frontmatter 缺失或不可解析'];
    for (const k of REQUIRED) {
        if (data[k] === undefined || data[k] === null || data[k] === '') problems.push(`缺少必需字段 ${k}`);
    }
    if (data.type && !TYPES.includes(data.type)) problems.push(`type 非法: ${data.type}（合法: ${TYPES.join('/')}）`);
    if (data.status && !STATUSES.includes(data.status)) problems.push(`status 非法: ${data.status}（合法: ${STATUSES.join('/')}）`);
    if (areas && areas.length && data.area && !areas.includes(data.area)) {
        problems.push(`area 不在词表内: ${data.area}（词表: ${areas.join('/')}）`);
    }
    for (const k of ['created', 'updated']) {
        if (data[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))) problems.push(`${k} 不是 YYYY-MM-DD: ${data[k]}`);
    }
    if (data.sources !== undefined && !Array.isArray(data.sources)) problems.push('sources 必须是数组');
    if (['source', 'paper'].includes(data.type)) {
        if (!data.sha256) problems.push(`${data.type} 页必须有 sha256`);
        if (!data.source_path) problems.push(`${data.type} 页必须有 source_path（raw/ 下的相对路径），否则无法做源变更检测`);
    }
    return problems;
}

/** 页面 slug：文件名去 .md。 */
function slugOf(file) {
    return path.basename(file, '.md');
}

module.exports = { TYPES, STATUSES, REQUIRED, parse, parseFile, stringify, check, slugOf };
