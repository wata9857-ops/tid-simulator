/* 深夜の本数・夜間の編成の置き場所・長い回送・学研都市線の運転を測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_overnight.js [--quiet]

   ■ 何を見るか
     1. 線区ごと・1時間ごとの在線本数 (22時〜翌2時が急に落ちないか)
     2. 大阪・京都・西明石・京橋・同志社前などの基準点を通る本数 (23時台・0時台)
     3. 夜 3時の編成の置き場所 (車両所・電留線ごと、形式ごと)。
        米原に 207系・321系が溜まるような、実物に無い滞泊が無いか
     4. 回送の距離 (駅の数)。長い回送が多すぎないか
     5. 学研都市線: 放出止まり・四条畷止まり・松井山手・同志社前・木津の本数、
        祝園の留置線・木津 (奈良方) の出入り
     6. 消えた列車 (remove) の時刻と場所
*/
'use strict';
globalThis.__NO_EVENTS = true;   // 乱数で開かれる催し (js/36-special-events.js) は止めて比べる
__boot();

const QUIET = true;
const fails = [];
function check(ok, msg) { console.log((ok ? '  OK   ' : '  NG   ') + msg); if (!ok) fails.push(msg); }

function lineOfTrain(t) {
    const tid = t.trackId || '';
    if (tid.indexOf('Kosei') === 0) return '湖西';
    if (tid.indexOf('Fukuchi') === 0) return '宝塚';
    if (tid.indexOf('Ako') === 0) return '赤穂';
    if (tid.indexOf('Tozai') === 0 || tid === 'Sid_Matsuiyamate' || /^Sid_Hosono/.test(tid)) {
        return (t.currBlockIndex > STATION_MAP['放出'] * UNITS_PER_STATION) ? '学研' : '東西';
    }
    return '本線';
}
const LINES = ['本線', '湖西', '宝塚', '東西', '学研', '赤穂'];

// ------------------------------------------------------------ 基準点の通過
const POINTS = [
    { k: '大阪 上り', st: '大阪', dir: 1, tracks: /^Up_(In|Out)$/ },
    { k: '大阪 下り', st: '大阪', dir: -1, tracks: /^Down_(In|Out)$/ },
    { k: '京都 上り', st: '京都', dir: 1, tracks: /^Up_(In|Out)$/ },
    { k: '西明石 下り', st: '西明石', dir: -1, tracks: /^Down_(In|Out)$/ },
    { k: '京橋 下り(東西)', st: '京橋', dir: -1, tracks: /^Tozai_Down$/ },
    { k: '京橋 上り(学研)', st: '京橋', dir: 1, tracks: /^Tozai_Up$/ },
    { k: '四条畷 上り', st: '四条畷', dir: 1, tracks: /^Tozai_Up$/ },
    { k: '同志社前 下り', st: '同志社前', dir: -1, tracks: /^Tozai_Down$/ },
    { k: '同志社前 上り', st: '同志社前', dir: 1, tracks: /^Tozai_Up$/ },
    { k: '松井山手 下り', st: '松井山手', dir: -1, tracks: /^Tozai_Down$/ },
    { k: '松井山手 上り', st: '松井山手', dir: 1, tracks: /^Tozai_Up$/ },
    { k: '宝塚 下り', st: '宝塚', dir: 1, tracks: /^Fukuchi_Up$/ },
    { k: '京都 湖西', st: '京都', dir: 1, tracks: /^Kosei_Up$/ }
];
const passCount = {};    // k -> hour -> n
const prevPos = new Map();

// ------------------------------------------------------------ 列車の記録
const trips = new Map();  // train id + no -> {type, from, to, dep, line, maxLen}
const removed = [];
const origRemove = Train.prototype.remove;
Train.prototype.remove = function () {
    const blks = game.trackMgr.blocks[this.trackId];
    const b = blks && blks[this.currBlockIndex];
    removed.push({ h: (game.currentTime / 3600) % 24, at: b ? blockStationName(b) : '?', type: this.type,
                   no: this.trainNo, groups: (this.vehicles || []).map(v => v.group + ':' + v.type).join('+') });
    return origRemove.call(this);
};

const hourly = [];   // {h, line -> n}
const turnHana = { 放出: 0, 四条畷: 0, 松井山手: 0, 同志社前: 0, 木津: 0, 京田辺: 0, 長尾: 0, 住道: 0, 奈良: 0, 祝園: 0 };
const gakkenDestSeen = new Set();
const deadheads = new Map();

function probe() {
    const now = game.currentTime;
    const h = Math.floor((now / 3600) % 24);
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const blks = game.trackMgr.blocks[t.trackId];
        const b = blks && blks[t.currBlockIndex];
        const pos = t.trackId + '#' + t.currBlockIndex;
        const p = prevPos.get(t.id);
        prevPos.set(t.id, pos);
        /* 駅を「発車した」ときに数える (その駅で折り返す列車・その駅が始発の列車も数える) */
        if (p && p !== pos && b) {
            const [ptid, pidx] = p.split('#');
            const pb = (game.trackMgr.blocks[ptid] || [])[+pidx];
            const nm = pb ? blockStationName(pb) : null;
            for (const pt of POINTS) {
                if (!pb || nm !== pt.st || t.dir !== pt.dir || !pt.tracks.test(t.trackId)) continue;
                if (!(pb.isStation || pb.hoppoStationName)) continue;
                if (blockStationName(b) === pt.st) continue;
                const k = pt.k + '|' + t.id + '|' + t.trainNo;
                if (passCount[k]) continue;
                passCount[k] = 1;
                passCount[pt.k] = passCount[pt.k] || {};
                passCount[pt.k][h] = (passCount[pt.k][h] || 0) + 1;
            }
        }
        // 学研都市線の行先
        if (/^Tozai/.test(t.trackId) && t.dir === -1 && t.type !== '回送') { /* 東西線方面 */ }
        if (/^Tozai/.test(t.trackId) && t.dir === 1 && t.type !== '回送' && t.type !== '貨物') {
            const key = t.id + '|' + t.trainNo;
            if (!gakkenDestSeen.has(key) && turnHana[t.dest] !== undefined) {
                gakkenDestSeen.add(key);
                if ((now / 3600) % 24 >= 5) turnHana[t.dest]++;
            }
        }
        if (t.type === '回送') {
            const key = t.id + '|' + t.trainNo + '|' + (t.startName || '');
            if (!deadheads.has(key)) deadheads.set(key, { from: t.startName, to: t.dest, h: (now / 3600) % 24 });
            else deadheads.get(key).to = t.dest;
        }
    }
    if (Math.round(now) % 1800 === 0) {
        const o = { h: ((now / 3600) % 24) };
        LINES.forEach(l => o[l] = 0);
        for (const t of game.trains) {
            if (t.state === 'finished' || t.state === 'in_depot') continue;
            if (t.type === '貨物' || t.type === '回送') continue;
            o[lineOfTrain(t)] = (o[lineOfTrain(t)] || 0) + 1;
        }
        o.回送 = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot' && t.type === '回送').length;
        o.貨物 = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot' && t.type === '貨物').length;
        hourly.push(o);
    }
}

__run(23.5 * 3600, probe);   // 4:00 → 翌 3:30

// ------------------------------------------------------------ 出力
console.log('=== 在線本数 (旅客列車。30分ごと) ===');
console.log(' 時刻   ' + LINES.map(l => l.padStart(4)).join(' ') + '  回送 貨物');
hourly.forEach(o => {
    if (!QUIET || o.h >= 20 || o.h < 3) {
        const hh = Math.floor(o.h), mm = Math.round((o.h - hh) * 60);
        console.log(' ' + String(hh).padStart(2) + ':' + String(mm).padStart(2, '0') + '  ' +
            LINES.map(l => String(o[l] || 0).padStart(5)).join('') + '  ' +
            String(o.回送).padStart(4) + ' ' + String(o.貨物).padStart(4));
    }
});

console.log('\n=== 基準点を発車した本数 (時台ごと) ===');
const HRS = [5, 6, 7, 8, 10, 13, 15, 17, 19, 20, 21, 22, 23, 0, 1];
console.log('               ' + HRS.map(h => String(h).padStart(4)).join(''));
POINTS.forEach(pt => {
    const o = passCount[pt.k] || {};
    console.log(' ' + pt.k.padEnd(14) + HRS.map(h => String(o[h] || 0).padStart(4)).join(''));
});

console.log('\n=== 夜 3:30 の編成の置き場所 (留置場ごと) ===');
const pools = game.fleet.pools;
const where = {};
for (const loc in pools) {
    const o = {};
    pools[loc].forEach(v => { const k = v.type; o[k] = (o[k] || 0) + 1; });
    where[loc] = o;
}
// 在線中の編成 (夜中に本線に残っているもの)
const onLine = {};
game.trains.forEach(t => {
    if (t.state === 'finished') return;
    (t.vehicles || []).forEach(v => {
        const k = (t.state === 'in_depot' ? '[出区待ち]' + (t.startName || '') : '[本線]' + (t.type || ''));
        onLine[k] = (onLine[k] || 0) + 1;
    });
});
Object.keys(where).forEach(loc => {
    const o = where[loc];
    const s = Object.keys(o).map(k => k + ' ' + o[k]).join(' / ');
    console.log(' ' + loc.padEnd(8) + s);
});
console.log(' 本線・出区待ち: ' + Object.keys(onLine).map(k => k + ' ' + onLine[k]).join(' / '));

const maibara = where['米原'] || {};
const commuterAtMaibara = Object.keys(maibara).filter(k => /207|321/.test(k)).reduce((s, k) => s + maibara[k], 0);

console.log('\n=== 回送 (5時以降に走り始めたもの) ===');
function distOf(a, b) {
    const ia = fleetIndexOf(a), ib = fleetIndexOf(b);
    if (ia === null || ib === null) return null;
    return Math.abs(ia - ib);
}
const dh = [...deadheads.values()].filter(d => d.h >= 5 || d.h < 3);
const byLen = { '0-3駅': 0, '4-9駅': 0, '10-19駅': 0, '20駅以上': 0, '不明': 0 };
const longPairs = {};
dh.forEach(d => {
    const n = distOf(d.from, d.to);
    if (n === null) { byLen['不明']++; return; }
    if (n <= 3) byLen['0-3駅']++;
    else if (n <= 9) byLen['4-9駅']++;
    else if (n <= 19) byLen['10-19駅']++;
    else byLen['20駅以上']++;
    if (n >= 10) { const k = d.from + '→' + d.to; longPairs[k] = (longPairs[k] || 0) + 1; }
});
console.log(' 合計 ' + dh.length + '本  ' + Object.keys(byLen).map(k => k + ' ' + byLen[k]).join(' / '));
Object.keys(longPairs).sort((a, b) => longPairs[b] - longPairs[a]).slice(0, 12)
    .forEach(k => console.log('   ' + k.padEnd(20) + longPairs[k] + '本'));
const longDh = byLen['10-19駅'] + byLen['20駅以上'];

console.log('\n=== 学研都市線 上り (放出より東へ向かう列車の行先, 5時以降) ===');
console.log(' ' + Object.keys(turnHana).map(k => k + ' ' + turnHana[k]).join(' / '));

console.log('\n=== 消えた列車 (remove) ===');
const remBy = {};
removed.forEach(r => { const k = Math.floor(r.h) + '時 ' + r.at + ' ' + r.type; remBy[k] = (remBy[k] || 0) + 1; });
console.log(' 合計 ' + removed.length + '本');
Object.keys(remBy).sort((a, b) => remBy[b] - remBy[a]).slice(0, 15).forEach(k => console.log('   ' + k.padEnd(24) + remBy[k]));

console.log('\n=== 判定 ===');
const at = hh => hourly.find(o => Math.abs(o.h - hh) < 0.01) || {};
const sum = o => LINES.reduce((s, l) => s + (o[l] || 0), 0);
const h22 = sum(at(22)), h2330 = sum(at(23.5)), h0 = sum(at(0)), h030 = sum(at(0.5));
console.log('  旅客列車の在線 22:00 ' + h22 + ' / 23:30 ' + h2330 + ' / 0:00 ' + h0 + ' / 0:30 ' + h030);
check(h0 >= h22 * 0.55, '0:00 の在線が 22:00 の 55% 以上 (' + h0 + ' / ' + h22 + ')');
check(((passCount['大阪 上り'] || {})[23] || 0) >= 8, '大阪 上り 23時台 8本以上 (実際 11本)');
check(((passCount['大阪 下り'] || {})[23] || 0) >= 8, '大阪 下り 23時台 8本以上');
check(((passCount['大阪 上り'] || {})[0] || 0) >= 1, '大阪 上り 0時台に列車がある (実際 0:00 新快速・0:10 普通)');
const g23 = (passCount['京橋 上り(学研)'] || {})[23] || 0;
check(g23 >= 4, '京橋 上り(学研都市線方面) 23時台 4本以上 (' + g23 + ')');
check(commuterAtMaibara <= 2, '米原に滞泊する 207系・321系 2本以下 (' + commuterAtMaibara + ')');
check(turnHana['放出'] <= turnHana['四条畷'] + turnHana['松井山手'], '放出止まりが四条畷・松井山手止まりの合計以下');
check(longDh <= 115, '長い回送 (10駅以上) が 115本以下 (' + longDh + '本。直す前は種によって 123〜165本)');
const hosono = (game.fleet.pools['祝園'] || []).reduce((s, v) => s + v.cars, 0);
check(hosono <= 14, '祝園の留置線 (2本) に入るぶんだけ置いている (' + hosono + '両 / 14両)');
console.log(fails.length ? ('\n不合格 ' + fails.length + '件') : '\nすべて合格');
