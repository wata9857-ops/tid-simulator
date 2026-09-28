/* ふだんのダイヤで「実物に無い列車」を作っていないか、朝ラッシュ・深夜の新快速の間隔、
   祝園の留置線・放出の電留線の在庫の戻りを測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_patterns.js

   ■ 見ること (利用者の指摘 1〜4)
     1. 祝園の留置線の編成が、朝・夕のラッシュに使われているか (一日じゅう置きっぱなしにしない)
     2. 放出の電留線の編成の数が、夜のうちに起動したときの数くらいまで戻るか
     3. ふだんのダイヤ (輸送障害・見合わせの無いとき) で、次の列車を作っていないか
          学研都市線の 快速 四条畷行き・快速 西明石行き (神戸線へ直通する快速)
          JR宝塚線の 快速 京都行き (大阪より東へ行く快速)
          琵琶湖線の 普通 京都行き
     4. 新快速の大阪の発車間隔 (朝ラッシュ・0時前後)。ほとんど来ない時間・続けて来る時間が無いか
*/
'use strict';
globalThis.__NO_EVENTS = true;
__boot();

const HOURS = 30;
const fails = [];
function check(ok, msg) { console.log((ok ? '  OK   ' : '  NG   ') + msg); if (!ok) fails.push(msg); }
const hourOf = () => (game.currentTime / 3600) % 24;
const absH = () => game.currentTime / 3600;

function stNameAt(t) {
    const blks = game.trackMgr.blocks[t.trackId];
    const b = blks && blks[t.currBlockIndex];
    return b ? blockStationName(b) : null;
}
function isGakken(t) {
    return /^Tozai/.test(t.trackId) && t.currBlockIndex > STATION_MAP['放出'] * UNITS_PER_STATION;
}
const FUKUCHI_STS = new Set(['塚口', '猪名寺', '伊丹', '北伊丹', '川西池田', '中山寺', '宝塚', '生瀬', '西宮名塩', '武田尾', '道場', '三田', '新三田']);
const BIWAKO_EAST = STATION_MAP['山科'];

// ------------------------------------------------------------ 3. 実物に無い列車
const odd = {};       // kind -> [{no, h, at, disrupted}]
const seenOdd = new Set();
function noteOdd(kind, t, disrupted) {
    const k = kind + '|' + t.id + '|' + t.trainNo + '|' + t.dest;
    if (seenOdd.has(k)) return;
    seenOdd.add(k);
    (odd[kind] = odd[kind] || []).push({ no: t.trainNo, h: hourOf().toFixed(2), at: stNameAt(t), from: t.startName, dest: t.dest, disrupted });
}
function classify(t) {
    if (t.state === 'finished' || t.state === 'in_depot') return;
    if (t.type === '回送' || t.type === '貨物' || t.type === '特急') return;
    const dis = __disrupted(1800);
    if (isGakken(t) && t.type === '快速') {
        if (t.dest === '四条畷' || t.dest === '住道' || t.dest === '放出' || t.dest === '京橋') noteOdd('学研都市線 快速 ' + t.dest + '行き', t, dis);
        if (['西明石', '須磨', '神戸', '三ノ宮', '甲子園口', '芦屋', '尼崎', '加古川', '姫路'].indexOf(t.dest) >= 0) noteOdd('学研都市線 快速 神戸線方面 (' + t.dest + ')', t, dis);
    }
    const at = stNameAt(t);
    if (/^Fukuchi/.test(t.trackId) && t.type === '快速' && at && FUKUCHI_STS.has(at)) {
        const di = STATION_MAP[t.dest];
        if (di !== undefined && !stationBranchLine(t.dest) && di > STATION_MAP['大阪'] && STATION_MAP[t.dest] <= STATION_MAP['米原']) noteOdd('JR宝塚線 快速 大阪より東 (' + t.dest + ')', t, dis);
        if (['西明石', '須磨', '神戸', '三ノ宮', '姫路'].indexOf(t.dest) >= 0) noteOdd('JR宝塚線 快速 神戸線方面 (' + t.dest + ')', t, dis);
    }
    if (/^(Up|Down)_(In|Out)$/.test(t.trackId) && t.type === '普通' && t.dir === -1 && t.dest === '京都') {
        const si = at ? STATION_MAP[at] : undefined;
        // 時刻表 (草津駅) にある時間帯の京都止まりは数えない
        if (si !== undefined && si > BIWAKO_EAST && !biwakoKyotoTermHour(hourOf())) noteOdd('琵琶湖線 普通 京都行き (時刻表に無い時間)', t, dis);
    }
}

// ------------------------------------------------------------ 4. 新快速の大阪の発車
const prevPos = new Map();
const deps = { up: [], down: [] };   // {t: abs sec, no}
const depSeen = new Set();
function probeDepartures() {
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const pos = t.trackId + '#' + t.currBlockIndex;
        const p = prevPos.get(t.id);
        prevPos.set(t.id, pos);
        if (t.type !== '新快速' || !p || p === pos) continue;
        const [ptid, pidx] = p.split('#');
        const pb = (game.trackMgr.blocks[ptid] || [])[+pidx];
        if (!pb || blockStationName(pb) !== '大阪' || !(pb.isStation)) continue;
        const k = t.id + '|' + t.trainNo;
        if (depSeen.has(k)) continue;
        depSeen.add(k);
        (t.dir === 1 ? deps.up : deps.down).push({ t: game.currentTime, no: t.trainNo, from: t.startName });
    }
}

// ------------------------------------------------------------ 1・2. 留置の在庫
const pool = (n) => game.fleet.poolAt(n).length;
const sets7 = (n) => game.fleet.sevenCarSets ? game.fleet.sevenCarSets(n) : pool(n);
const boot = { 祝園: pool('祝園'), 放出: sets7('放出'), 放出u: pool('放出') };
const hosonoByHour = [];
const hanaByHour = [];
let hosonoOutRush = { am: 0, pm: 0 };
{
    const orig = OperationsManager.prototype.dispatchFromDepot;
    OperationsManager.prototype.dispatchFromDepot = function (depotName, w) {
        if (depotName === '祝園') {
            const h = hourOf();
            if (h < 10) hosonoOutRush.am++; else hosonoOutRush.pm++;
        }
        return orig.apply(this, arguments);
    };
}

const TICK = CONFIG.TICK_SEC;
const disruptedHours = [];
/* 見合わせ・抑止 (線路が止まっている) のときだけを「障害」とみる。小さな遅れの輸送障害は含めない */
function majorDisruption() {
    const tm = game.trackMgr;
    return game.isEmergency || tm.manualSuspensions.length > 0 || tm.recoveryHolds.length > 0 ||
           Object.values(tm.suspendedSections).some(a => a && a.length);
}
const steps = Math.floor(HOURS * 3600 / TICK);
for (let i = 0; i < steps; i++) {
    game.update();
    probeDepartures();
    if (i % Math.round(30 / TICK) === 0) { for (const t of game.trains) classify(t); if (majorDisruption()) disruptedHours.push(absH()); }
    if (Math.round(game.currentTime) % 3600 === 0) {
        hosonoByHour.push(Math.floor(absH()) + ':' + pool('祝園'));
        hanaByHour.push(Math.floor(absH()) + ':' + sets7('放出'));
    }
}

console.log('\n=== 1. 祝園の留置線 ===');
console.log('  起動時 ' + boot.祝園 + '両組 / 時刻ごと ' + hosonoByHour.join(' '));
console.log('  祝園からの出区: 朝 ' + hosonoOutRush.am + '本 / 夕 ' + hosonoOutRush.pm + '本');
check(hosonoOutRush.am >= 2, '祝園の編成が朝ラッシュに出ている');
check(hosonoOutRush.pm >= 1, '祝園の編成が夕ラッシュに出ている');

console.log('\n=== 2. 放出の電留線 (7両が組める本数) ===');
console.log('  起動時 ' + boot.放出 + '本 / 時刻ごと ' + hanaByHour.join(' '));
{
    const at3 = hanaByHour.filter(s => /^(27|51):/.test(s)).map(s => +s.split(':')[1]);
    const v = at3.length ? at3[0] : sets7('放出');
    check(v >= Math.max(1, Math.round(boot.放出 * 0.6)), '翌3時の放出の在庫が起動時の6割以上 (' + v + ' / ' + boot.放出 + ')');
}

console.log('\n=== 3. ふだんのダイヤで作らない列車 ===');
let normalOdd = 0;
for (const k of Object.keys(odd)) {
    const list = odd[k];
    const n = list.filter(x => !x.disrupted).length;
    normalOdd += n;
    console.log('  ' + k + ': ふだん ' + n + '本 / 障害時 ' + (list.length - n) + '本');
    list.filter(x => !x.disrupted).slice(0, 4).forEach(x => console.log('      ' + x.no + ' ' + x.h + '時 ' + x.from + '→' + x.dest + ' (' + x.at + ')'));
}
check(normalOdd <= 2, 'ふだんのダイヤで実物に無い列車が2本以下 (' + normalOdd + '本)');

console.log('\n=== 4. 新快速 大阪の発車間隔 (分) ===');
function gapsIn(list, h0, h1) {
    const xs = list.filter(d => { const a = d.t / 3600; return a >= h0 && a < h1; }).map(d => d.t);
    const g = [];
    for (let i = 1; i < xs.length; i++) g.push((xs[i] - xs[i - 1]) / 60);
    return { n: xs.length, g };
}
const WINDOWS = [
    /* 時刻表は 15分おき (4本/時)。遅れた1本・捨てた枠1つぶん (30分) までは許す */
    { k: '朝ラッシュ 7〜9時', h0: 7, h1: 9, maxGap: 31, minGap: 3, perH: [3, 7] },
    { k: '昼間 11〜14時', h0: 11, h1: 14, maxGap: 35, minGap: 3, perH: [2.5, 6] },
    { k: '23時〜0時半', h0: 23, h1: 24.5, maxGap: 45, minGap: 3, perH: [0.6, 5] },
    { k: '翌朝ラッシュ 7〜9時', h0: 31, h1: 33, maxGap: 31, minGap: 3, perH: [3, 7] }
];
for (const w of WINDOWS) {
    if (w.h1 > HOURS + 4) continue;
    for (const dk of ['up', 'down']) {
        const r = gapsIn(deps[dk], w.h0, w.h1);
        const perH = r.n / (w.h1 - w.h0);
        const mx = r.g.length ? Math.max(...r.g) : 999;
        const close = r.g.filter(x => x < w.minGap).length;
        console.log(`  ${w.k} ${dk === 'up' ? '上り(京都方)' : '下り(神戸方)'}: ${r.n}本 (${perH.toFixed(1)}本/時) 間隔 ` +
                    r.g.map(x => x.toFixed(0)).join(' '));
        /* 見合わせ・障害のあった時間帯は本数・間隔を判定しない (利用者の指摘) */
        // その時間帯 (と1時間前) に見合わせ・障害が15分以上あったか (30秒おきに見て30回)
        const dis = disruptedHours.filter(hh => hh >= w.h0 - 0.5 && hh < w.h1).length >= 30;
        if (dis) { console.log('    (障害のあった時間帯なので本数・間隔は判定しない)'); }
        else {
        check(perH >= w.perH[0] && perH <= w.perH[1], `${w.k} ${dk} 新快速の本数 ${perH.toFixed(1)}本/時`);
        if (w.h0 !== 23) check(mx <= w.maxGap, `${w.k} ${dk} 新快速の最大間隔 ${mx.toFixed(0)}分 <= ${w.maxGap}`);
        }
        check(close <= 1, `${w.k} ${dk} ${w.minGap}分未満の続行 ${close}回`);
    }
}

console.log('\n' + (fails.length ? '>>> ' + fails.length + ' 件 不合格' : '>>> すべて合格'));
