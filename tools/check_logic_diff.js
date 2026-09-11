/* 分割前のコードと比べて、どのメソッドの中身を変更したかを一覧にする。
   「必要な修正以外は運転ロジックを変えない」ことの確認用。

     python tools/extract_baseline.py
     node tools/check_logic_diff.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'tools', 'baseline', 'original.js');
if (!fs.existsSync(BASE)) {
    console.error('先に  python tools/extract_baseline.py  を実行してください。');
    process.exit(1);
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return',
    'function', 'else', 'do', 'try', 'typeof', 'new', 'delete', 'void', 'constructor']);

function braceDelta(line) {
    let d = 0, q = null;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
            if (c === '\\') { i++; continue; }
            if (c === q) q = null;
        } else if (c === '"' || c === "'" || c === '`') q = c;
        else if (c === '/' && line[i + 1] === '/') break;
        else if (c === '{') d++;
        else if (c === '}') d--;
    }
    return d;
}

/** 開き括弧から対応する閉じ括弧までを取り出す */
function takeBlock(lines, from) {
    let depth = 0, started = false, body = [];
    for (let j = from; j < lines.length; j++) {
        body.push(lines[j]);
        depth += braceDelta(lines[j]);
        if (!started && depth > 0) started = true;
        if (started && depth === 0) break;
    }
    return body.join('\n');
}

/**
 * ソースから「クラス名.メソッド名」単位で本体を抜き出す。
 * クラス本体の  `    name(args) {`  と
 * prototype への追加  `Cls.prototype.name = function (args) {`  の両方に対応する。
 */
function extractMethods(src) {
    const lines = src.split('\n');
    const out = {};
    let cls = null;          // いま読んでいるクラス
    let clsDepth = 0;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const openCls = /^class (\w+)/.exec(line);
        if (openCls) { cls = openCls[1]; clsDepth = depth; }

        const proto = /^(\w+)\.prototype\.([A-Za-z_$][\w$]*) = function\s*(\(.*)$/.exec(line);
        if (proto && !KEYWORDS.has(proto[2])) {
            out[proto[1] + '.' + proto[2]] = takeBlock(lines, i);
        } else {
            const inner = /^    ([A-Za-z_$][\w$]*)\s*\(/.exec(line);
            if (inner && cls && depth === clsDepth + 1 && !KEYWORDS.has(inner[1])) {
                const key = cls + '.' + inner[1];
                if (!out[key]) out[key] = takeBlock(lines, i);
            }
        }

        depth += braceDelta(line);
        if (cls !== null && depth <= clsDepth) cls = null;
    }
    return out;
}

/** 宣言部と末尾の ; を落とし、空白を潰してから比べる */
const bodyOf = (s) => s.replace(/^[^{]*\{/, '').replace(/;\s*$/, '').replace(/\s+/g, ' ').trim();

const oldMethods = extractMethods(fs.readFileSync(BASE, 'utf8'));
const newSrc = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
const newMethods = extractMethods(newSrc);

const all = new Set([...Object.keys(oldMethods), ...Object.keys(newMethods)]);
const same = [], changed = [], added = [], removed = [];
for (const key of [...all].sort()) {
    const a = oldMethods[key], b = newMethods[key];
    if (a === undefined) { added.push(key); continue; }
    if (b === undefined) { removed.push(key); continue; }
    (bodyOf(a) === bodyOf(b) ? same : changed).push(key);
}

const byClass = (list) => {
    const g = {};
    list.forEach(k => {
        const [c, m] = k.split('.');
        (g[c] = g[c] || []).push(m);
    });
    return Object.keys(g).sort().map(c => '    ' + c + ': ' + g[c].join(', ')).join('\n');
};

console.log('=== 分割前と中身が完全に同じメソッド: ' + same.length + '件 ===');
console.log(byClass(same));
console.log('\n=== 中身を変更したメソッド: ' + changed.length + '件 ===');
console.log(byClass(changed));
console.log('\n=== 新しく追加したメソッド: ' + added.length + '件 ===');
console.log(byClass(added));
console.log('\n=== 無くしたメソッド: ' + removed.length + '件 ===');
console.log(removed.length ? byClass(removed) : '    なし');
