'use strict';
/**
 * 根发现（spec §3.1）+ 脚本共用参数。
 *
 * 优先级：--root（脚本专用/测试） > --name=具名库 > config.json 的 default > 报错让 agent 去问用户。
 * 绝不猜：没有配置时抛 NO_CONFIG，由调用方（agent）向用户提问，而不是静默新建一个库。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exists, isDir } = require('./paths');
const layout = require('./layout');

const CONFIG_DIR = path.join(os.homedir(), '.llm-wiki');
// LLM_WIKI_CONFIG 只给测试用（让验收脚本改配置而不碰用户真实的 ~/.llm-wiki/config.json）。
const CONFIG_FILE = process.env.LLM_WIKI_CONFIG || path.join(CONFIG_DIR, 'config.json');

function configPath() {
    return CONFIG_FILE;
}

function readConfig() {
    if (!exists(CONFIG_FILE)) return null;
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return cfg && typeof cfg === 'object' ? cfg : null;
    } catch (e) {
        const err = new Error(`配置损坏，无法解析 ${CONFIG_FILE}: ${e.message}`);
        err.code = 'BAD_CONFIG';
        throw err;
    }
}

function writeConfig(cfg) {
    // 建 CONFIG_FILE 的父目录而不是 CONFIG_DIR：后者是硬编码的 ~/.llm-wiki，
    // 测试用 LLM_WIKI_CONFIG 覆盖时会在用户 home 里留下一个空目录。
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function fail(code, message, extra = {}) {
    const e = new Error(message);
    e.code = code;
    Object.assign(e, extra);
    throw e;
}

/**
 * @returns {{root:string, name:string|null, source:'flag'|'named'|'default'}}
 */
function resolveRoot({ root: rootFlag = null, name = null } = {}) {
    if (rootFlag) {
        const root = path.resolve(rootFlag);
        if (!isDir(root)) fail('ROOT_NOT_FOUND', `--root 指向的目录不存在: ${root}`);
        return { root, name: null, source: 'flag' };
    }
    const cfg = readConfig();
    const wikis = (cfg && cfg.wikis) || {};
    if (name) {
        if (!wikis[name]) {
            fail('UNKNOWN_NAME', `没有名为 "${name}" 的 wiki。可用: ${Object.keys(wikis).join(', ') || '(无)'}`, { available: Object.keys(wikis) });
        }
        return { root: path.resolve(wikis[name]), name, source: 'named' };
    }
    if (!cfg) {
        fail('NO_CONFIG', `未找到 ${CONFIG_FILE}。需要先 init 一个 wiki，或问用户库在哪。`);
    }
    const def = cfg.default;
    if (!def || !wikis[def]) {
        fail('NO_DEFAULT', `配置里没有可用的 default（当前 default=${JSON.stringify(def)}）。可用: ${Object.keys(wikis).join(', ') || '(无)'}`, { available: Object.keys(wikis) });
    }
    return { root: path.resolve(wikis[def]), name: def, source: 'default' };
}

/** 目录是否像一个 wiki 实例（用于 init 前检查、也给 agent 判断用）。 */
function looksLikeWiki(dir) {
    return [layout.CONTRACT_FILE, path.join(layout.WIKI_DIR, layout.INDEX_FILE), path.join(layout.WIKI_DIR, layout.LOG_FILE)]
        .every((f) => exists(path.join(dir, f)))
        && isDir(path.join(dir, layout.WIKI_DIR));
}

/** 读 AGENTS.md 的机器可读部分（frontmatter）。缺文件时返回默认值（不算错，lint 会提示）。 */
function readContract(root) {
    const file = layout.contractFile(root);
    const fallback = { areas: [], stale_after_days: 90, language: 'zh', contract_version: null, file: null };
    if (!exists(file)) return fallback;
    const { parse } = require('./frontmatter');
    const { data } = parse(fs.readFileSync(file, 'utf8'));
    return {
        areas: Array.isArray(data && data.areas) ? data.areas : [],
        stale_after_days: (data && Number(data.stale_after_days)) || 90,
        language: (data && data.language) || 'zh',
        contract_version: (data && Number(data.contract_version)) || null,
        file,
    };
}

/** 脚本共用：解析 --flag=value 参数。 */
function parseArgs(argv, { valueFlags = ['root', 'name', 'wiki', 'json', 'by-area', 'date', 'message'] } = {}) {
    const positionals = [];
    const flags = {};
    for (const a of argv) {
        const m = a.match(/^--([^=]+)(?:=(.*))?$/);
        if (m && valueFlags.includes(m[1])) flags[m[1]] = m[2] === undefined ? true : m[2];
        else if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
        else positionals.push(a);
    }
    // v4：`--wiki=x` 是 `--name=x` 的别名。在这里归一化，调用点就不用各自处理——
    // 包括 wiki_init.js（那儿 --name 是"新库叫什么"，归一化后语义正好也成立）。
    if (flags.wiki !== undefined && flags.name === undefined) flags.name = flags.wiki;
    return { flags, positionals };
}

/** 把 discovery 错误翻译成给人看的、可行动的提示。 */
function explain(e) {
    switch (e.code) {
        case 'NO_CONFIG':
        case 'NO_DEFAULT':
        case 'UNKNOWN_NAME':
            return `${e.message}\n→ 不要新建：先向用户确认库的位置或名字。`;
        default:
            return e.message;
    }
}

module.exports = { resolveRoot, readConfig, writeConfig, configPath, looksLikeWiki, readContract, parseArgs, explain, fail };
