/* index.html から呼んでいる関数・参照している要素IDが、js/*.js と噛み合っているか確認する。
   使い方: node tools/check_refs.js   (harness は不要)
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* 旅客向け画面と Super-TID 画面の両方を見る。
   要素IDや読み込み順の確認は、どちらのページも対象にする。 */
const PAGES = ['index.html', 'tid.html'].filter(f => fs.existsSync(path.join(ROOT, f)));
const htmlByPage = {};
PAGES.forEach(f => { htmlByPage[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
const html = PAGES.map(f => htmlByPage[f]).join(String.fromCharCode(10));
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort();
const js = jsFiles.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
const css = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')).join('\n');

const SCRIPT_RE = /<script src="js\/([^"]+)"><\/script>/g;

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail + (cond ? ')' : '') : ''));
    if (!cond) failures++;
}

// ---------------------------------------------- HTML から呼ぶ関数が定義されているか
const handlers = new Set();
for (const m of html.matchAll(/on(?:click|change)="([^"]*)"/g)) {
    for (const c of m[1].matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)) handlers.add(c[1]);
}
const missingFn = [];
for (const name of handlers) {
    if (name === 'event.stopPropagation') continue;
    const leaf = name.split('.').pop();
    const found =
        js.includes('function ' + leaf + '(') ||
        js.includes('prototype.' + leaf + ' =') ||
        js.includes(leaf + '(') ||
        new RegExp('^\\s{4}' + leaf + '\\s*\\(', 'm').test(js);
    if (!found) missingFn.push(name);
}
ok('HTMLのイベントから呼ぶ関数がすべて定義されている', missingFn.length === 0,
   missingFn.length ? missingFn.join(', ') : handlers.size + '個');

// ---------------------------------------------- JS が触る要素IDが HTML にあるか
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
// 動的に生成する要素のID (innerHTML で作られるので HTML には無い)
const dynamicIds = new Set([
    'dep-board-rows-up', 'dep-board-rows-down', 'log-list', 'vehicle-notes'
]);
const usedIds = new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]));
for (const m of js.matchAll(/getElementById\('([^']+)'\)/g)) usedIds.add(m[1]);

const missingId = [...usedIds].filter(id => !htmlIds.has(id) && !dynamicIds.has(id));
ok('JSが参照する要素IDがHTMLに存在する', missingId.length === 0,
   missingId.length ? missingId.join(', ') : usedIds.size + '個');

// ---------------------------------------------- HTML/JS が使うクラスに CSS があるか
const usedClasses = new Set();
for (const m of html.matchAll(/\bclass="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));
for (const m of js.matchAll(/class="([a-z][a-z0-9 _-]*)"/g)) m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));
for (const m of js.matchAll(/className = "([a-z][a-z0-9 _-]*)"/g)) m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));

// 状態クラス・SVG用の組み立てクラスは除く。
// 発車標の board-row-* / marquee-* は querySelector で要素を探すための目印で、
// 見た目はインラインstyleで付けているのでCSSには存在しない。
const skipClasses = new Set(['is-active', 'is-dim', 'is-train', 'is-idle', 'is-over',
    'dv-track-stabling', 'dv-track-shed', 'dv-track-wash', 'dv-track-siding',
    'log-lv-critical', 'log-lv-warn', 'log-lv-info', 'log-lv-normal',
    'board-row-0', 'board-row-1', 'board-row-2', 'board-row-3',
    'board-marquee-area', 'marquee-stops', 'marquee-info']);
const missingCss = [...usedClasses].filter(c => !skipClasses.has(c) && !css.includes('.' + c));
ok('使っているCSSクラスが定義されている', missingCss.length === 0,
   missingCss.length ? missingCss.join(', ') : usedClasses.size + '個');

// ---------------------------------------------- 読み込み順
/* ページごとに読み込むファイルは違う (Super-TID 画面だけが 40番台を読む)。
   js/ の中の全ファイルが、どこかのページで読み込まれているかを見る。 */
const orderByPage = {};
PAGES.forEach(f => {
    orderByPage[f] = [...htmlByPage[f].matchAll(SCRIPT_RE)].map(m => m[1]);
});
const loadedAnywhere = new Set([].concat(...PAGES.map(f => orderByPage[f])));
const neverLoaded = jsFiles.filter(f => !loadedAnywhere.has(f));
ok('js/ のファイルがどこかのページで読み込まれている', neverLoaded.length === 0,
   neverLoaded.length ? neverLoaded.join(', ') : loadedAnywhere.size + ' / ' + jsFiles.length);
PAGES.forEach(f => {
    const o = orderByPage[f];
    ok(f + ' の読み込み順に重複が無い', new Set(o).size === o.length, o.length + '件');
});
const order = orderByPage[PAGES[0]];

const protoBad = [];
const classDefs = {};   // クラス名 -> 定義ファイルの読み込み順 (ページごと)
PAGES.forEach(page => {
    const o = orderByPage[page];
    const defs = {};
    o.forEach((f, i) => {
        const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        for (const m of src.matchAll(/^class (\w+) \{/gm)) { defs[m[1]] = i; classDefs[m[1]] = i; }
    });
    o.forEach((f, i) => {
        const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        for (const m of src.matchAll(/^(\w+)\.prototype\.\w+ = function/gm)) {
            if (defs[m[1]] === undefined) protoBad.push(page + ' / ' + f + ': ' + m[1] + ' が未定義');
            else if (defs[m[1]] > i) protoBad.push(page + ' / ' + f + ': ' + m[1] + ' の定義より前に読み込まれる');
        }
    });
});
ok('prototype への追加がクラス定義より後に読み込まれる', protoBad.length === 0,
   protoBad.length ? protoBad.join(' / ') : Object.keys(classDefs).join(', '));

// ---------------------------------------------- 分割前のコードが残っていないか
const leftovers = [
    ['vehicleQueue', '駅ごとの車両キュー (FleetManager へ移行済み)'],
    ['京都支所→6000番台化', '改造前の履歴データ'],
    ['以下網干総合車両所', 'エクセルの見出し行が所属名に混ざったもの']
];
leftovers.forEach(([needle, what]) => {
    ok('分割前の名残が無い: ' + what, !js.includes(needle), needle);
});

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
process.exitCode = failures ? 1 : 0;
