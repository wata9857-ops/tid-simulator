/* ブラウザなしでシミュレーターを走らせるための足場 (node 用)。

   DOM とキャンバスを最小限のスタブで置き換え、js/*.js を読み込み順に評価する。
   検証用のツールなのでゲーム本体からは参照されない。

   使い方:  node tools/harness.js <検証スクリプト.js>
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 既定はこのリポジトリ。TID_ROOT を指定すると、別の場所に置いたコピー
// (GitHub Pages から落としてきたものなど) を読み込んで検証できる。
const ROOT = process.env.TID_ROOT
    ? path.resolve(process.env.TID_ROOT)
    : path.resolve(__dirname, '..');

// --orig を付けると、分割前の index.html から抜き出した原本を読み込む(比較用)。
const USE_ORIG = process.argv.indexOf('--orig') >= 0;
/** そのHTMLが読み込んでいる js/*.js を、書かれている順に取り出す */
function scriptsOf(htmlName) {
    return fs.readFileSync(path.join(ROOT, htmlName), 'utf8')
        .split('\n')
        // ?v=... の版の印 (tools/stamp_version.js) が付いていても読めるようにする
        .map(l => /<script src="js\/([^"?]+)(?:\?[^"]*)?"><\/script>/.exec(l))
        .filter(Boolean)
        .map(m => m[1]);
}

/* --tid を付けると、Super-TID 画面 (tid.html) だけが読み込んでいる
   js/40-tid-theme.js などの表示用ファイルも足す。
   起動処理 (49-tid-boot.js) は game を作ってしまうので外す。 */
const USE_TID = process.argv.indexOf('--tid') >= 0;
const SRC_NAMES = USE_ORIG ? [] : scriptsOf('index.html');
if (USE_TID && !USE_ORIG) {
    scriptsOf('tid.html').forEach(n => {
        if (SRC_NAMES.indexOf(n) >= 0) return;
        if (n === '49-tid-boot.js') return;
        SRC_NAMES.push(n);
    });
}
const SOURCES = USE_ORIG
    ? [path.join(ROOT, 'tools', 'baseline', 'original.js')]
    : SRC_NAMES.map(n => path.join(ROOT, 'js', n));

// ------------------------------------------------------------------ DOM スタブ
function makeCtx() {
    const noop = () => {};
    const ctx = {
        canvas: null,
        fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, textAlign: '',
        textBaseline: '', globalAlpha: 1, lineCap: '', lineJoin: '',
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: noop }),
        getImageData: () => ({ data: [0, 0, 0, 0] }),
        setLineDash: noop
    };
    ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill',
     'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'arc', 'rect',
     'translate', 'rotate', 'scale', 'drawImage', 'quadraticCurveTo', 'bezierCurveTo',
     'ellipse', 'clip', 'setTransform', 'resetTransform', 'transform',
     'roundRect', 'arcTo', 'createPattern'].forEach(k => { ctx[k] = noop; });
    return ctx;
}

function makeEl(id) {
    const el = {
        id: id,
        innerText: '', textContent: '', value: '', className: '', title: '',
        width: 0, height: 0, scrollLeft: 0, scrollTop: 0,
        clientWidth: 1200, clientHeight: 800, offsetWidth: 1200, offsetHeight: 800,
        style: { setProperty: () => {} },
        children: [],
        options: [],
        dataset: {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { return c; },
        add(o) { this.options.push(o); },
        setAttribute() {}, getAttribute() { return null; },
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 800 }; },
        getContext() { return makeCtx(); },
        // innerHTML で組み立てた中身を querySelector で引く箇所があるため、
        // セレクタごとにスタブ要素を作って返す (null で落ちるのを避ける)
        querySelector(sel) {
            if (!this._q) this._q = {};
            if (!this._q[sel]) this._q[sel] = makeEl(sel);
            return this._q[sel];
        },
        querySelectorAll(sel) { return [this.querySelector(sel)]; },
        focus() {}, scrollIntoView() {}
    };
    el.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    // innerHTML に代入したら子要素も消える (ブラウザと同じ挙動にしないと
    // 絞り込みの検証で行数が積み上がってしまう)
    let _html = '';
    Object.defineProperty(el, 'innerHTML', {
        get() { return _html; },
        set(v) { _html = String(v); el.children.length = 0; }
    });
    return el;
}

const els = {};
const document = {
    getElementById(id) {
        if (!els[id]) els[id] = makeEl(id);
        return els[id];
    },
    createElement(tag) { return makeEl('<' + tag + '>'); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    body: makeEl('body')
};

const alerts = [];
const sandbox = {
    document: document,
    console: console,
    Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp,
    Set: Set, Map: Map, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    devicePixelRatio: 1,
    requestAnimationFrame: () => 0,          // ループは回さない (検証側から手で進める)
    alert: (m) => { alerts.push(String(m)); },
    confirm: () => true,
    prompt: () => null,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    __alerts: alerts,
    __elements: els
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctxObj = vm.createContext(sandbox);

for (const full of SOURCES) {
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    try {
        vm.runInContext(fs.readFileSync(full, 'utf8'), ctxObj, { filename: rel });
    } catch (e) {
        console.error('読み込み失敗: ' + rel);
        console.error(e && e.stack ? e.stack : e);
        process.exit(1);
    }
}

// js/*.js のトップレベル const / class はグローバルオブジェクトのプロパティに
// ならないため、検証用のヘルパーも同じコンテキスト内で定義しておく。
vm.runInContext(`
/** 本来 GameSystem.init() がやる準備のうち、描画以外を行う */
globalThis.__boot = function () {
    game.renderer = { draw: () => {} };
    game.scrollContainer = { scrollLeft: 0 };
    game.initVehicles();

    // init() 内の予備車配置と同じ処理
    for (const stName in DEPOTS) {
        let reserveCount = 0;
        if (stName === '野洲') reserveCount = 2;
        else if (stName === '宮原操' || stName === '向日町操') reserveCount = 3;
        for (let i = 0; i < reserveCount; i++) {
            const assigned = game.spawner.assignVehicles(stName, '回送', 'Up_In', '京都');
            if (!assigned) continue;
            const t = new Train({ type: '回送', dir: 1, trackId: 'Up_In', startName: stName, name: '予備', vehicles: assigned }, game);
            t.state = 'in_depot';
            t.timer = -1;
            t.startName = stName;
            t.depotOutConfig = null;
            t.trainNo = '';
            const blks = game.trackMgr.blocks[t.trackId];
            if (blks && blks[t.currBlockIndex] && blks[t.currBlockIndex].lanes[t.lane] === t) {
                blks[t.currBlockIndex].lanes[t.lane] = null;
            }
            // depotAdd は分割後のコードにしか無いので、原本を読み込んだ場合は
            // 元の処理 (直接 push) に合わせる
            if (typeof depotAdd === 'function') depotAdd(stName, t);
            else if (DEPOTS[stName].trains.indexOf(t) < 0) DEPOTS[stName].trains.push(t);
            game.trains.push(t);
        }
    }
    return game;
};

/** シミュレーター内時間で seconds 秒ぶん進める */
globalThis.__run = function (seconds, onTick) {
    const ticks = Math.floor(seconds / CONFIG.TICK_SEC);
    for (let i = 0; i < ticks; i++) {
        game.update();
        if (onTick) onTick(game, i);
    }
};

// 検証スクリプトからクラス・定数を参照できるように公開する
globalThis.__api = { game, Train, Vehicle, CONFIG, DEPOTS, STATIONS, STATION_MAP, EXCEL_VEHICLES };
`, ctxObj, { filename: 'harness-bootstrap.js' });

const script = process.argv.slice(2).filter(a => a !== '--orig' && a !== '--tid')[0];
if (!script) {
    console.log('読み込み成功: ' + SOURCES.length + ' ファイル' + (USE_ORIG ? ' (原本)' : ''));
    process.exit(0);
}
vm.runInContext(fs.readFileSync(path.resolve(script), 'utf8'), ctxObj,
    { filename: path.basename(script) });
