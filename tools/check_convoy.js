/* 走行線路 (外側線/内側線) と、同じ種別の続行間隔を測る。
   使い方: node tools/harness.js tools/check_convoy.js

   ■ 何を見るか
     1. 走行線路の規則 (js/24-service-rules.js の serviceTrackSide) どおりに
        走っているか。複々線 (西明石〜草津) の中にいる列車を毎Tick数え、
        規則と違う線路に居た回数を出す。
          新快速 … 該当区間を通して外側線
          快速   … 平日朝の 高槻→大阪 だけ外側線、ほかは内側線
     2. 西明石・大阪・京都を通過した列車の続行間隔。
        同じ種別が続くときの間隔 (分) と、
        「3本続けて短い間隔で続く」= 団子 (convoy) の回数を出す。
     3. 間隔が開きすぎていないか (穴) もあわせて出す。
*/
'use strict';

/* 乱数の固定は tools/harness.js の --seed で行う。
   例: node tools/harness.js --seed=20260922 tools/check_convoy.js */

__boot();

const START_H = 5;
const END_H = 21;

const PROBES = ['西明石', '大阪', '京都'];
const passLog = {};      // 駅|向き|種別 -> [時刻(秒)]
PROBES.forEach(st => { ['Up', 'Down'].forEach(d => { ['新快速', '快速', '普通'].forEach(t => { passLog[st + '|' + d + '|' + t] = []; }); }); });

let sideChecked = 0, sideWrong = 0;
const wrongBy = {};

/* ------------------------------------------------------------------ 団子の直接観測

   「同じ種別・同じ向きの列車が、となり合う2本とも N駅以内で続いている」状態を
   数える。利用者が見たのはこれ (西明石の周りで新快速が2駅おきに3本並ぶ)。
   区間ごとに、3本以上の連なりが何回あったか・最長何本かを出す。 */
const CONVOY_STATIONS = 2.5;                 // これ以内で続いていたら「続行」
const convoyHits = {};                       // 種別|区間 -> 回数
const convoyMax = {};                        // 種別 -> 最長の連なりの本数
function recordConvoy(ty, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    const b = blks ? blks[t.currBlockIndex] : null;
    let name = '?';
    if (b && b.stationIdx !== undefined && STATIONS[b.stationIdx]) name = STATIONS[b.stationIdx].name;
    const k = ty + '|' + name;
    convoyHits[k] = (convoyHits[k] || 0) + 1;
}
/* 昼間 (10〜16時) の在線本数の平均。種別・線区ごと。
   団子の直接の原因は本数なので、間隔と一緒に見る。 */
const actSum = {}; let actN = 0;
function probeActive() {
    const h = (game.currentTime / 3600) % 24;
    if (h < 10 || h >= 16) return;
    actN++;
    const c = {};
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const k = ttLineOf(t) + ' ' + t.type;
        c[k] = (c[k] || 0) + 1;
    }
    for (const k in c) actSum[k] = (actSum[k] || 0) + c[k];
}

/* 詰まり具合。走っている列車のうち、1分以上動けていないものの割合。 */
let stuckObs = 0, stuckHit = 0;
function probeStuck() {
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        stuckObs++;
        if (t.stuckTime >= 60) stuckHit++;
    }
}

function probeConvoy() {
    const gap = UNITS_PER_STATION * CONVOY_STATIONS;
    ['新快速', '快速', '普通'].forEach(ty => {
        [1, -1].forEach(dir => {
            const list = game.trains.filter(t =>
                t.type === ty && t.dir === dir &&
                t.state !== 'finished' && t.state !== 'in_depot' &&
                !/Kosei|Fukuchi|Tozai|Hoppo/.test(t.trackId));
            list.sort((a, b) => a.currBlockIndex - b.currBlockIndex);
            let run = 1;
            for (let i = 1; i < list.length; i++) {
                const d = Math.abs(list[i].currBlockIndex - list[i - 1].currBlockIndex);
                if (d <= gap) { run++; }
                else { if (run >= 3) recordConvoy(ty, list[i - 1]); run = 1; }
                convoyMax[ty] = Math.max(convoyMax[ty] || 0, run);
            }
            if (run >= 3) recordConvoy(ty, list[list.length - 1]);
        });
    });
}

function probeOnce() {
    // --- 走行線路の規則
    const h = (game.currentTime / 3600) % 24;
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        if (/Kosei|Fukuchi|Tozai|Hoppo/.test(t.trackId)) continue;
        const blks = game.trackMgr.blocks[t.trackId];
        const b = blks ? blks[t.currBlockIndex] : null;
        if (!b || b.x === -1000 || b.stationIdx === undefined) continue;
        if (!innerTrackExists(b.stationIdx)) continue;      // 複線区間は選べない
        if (['新快速', '快速', '普通'].indexOf(t.type) < 0) continue;
        const want = serviceTrackSide(t, b.stationIdx, h);
        const got = t.trackId.indexOf('Out') >= 0 ? 'out' : 'in';
        sideChecked++;
        if (want !== got) {
            sideWrong++;
            const k = t.type + ' ' + (t.dir === 1 ? '上り' : '下り') + ' 規則=' + want + ' 実際=' + got;
            wrongBy[k] = (wrongBy[k] || 0) + 1;
        }
    }
}

/* 駅の通過を拾う。ある駅ブロックに列車が入った瞬間を記録する。 */
const seenAt = {};   // 駅|列車id -> true
function probePass() {
    for (const st of PROBES) {
        const idx = STATION_MAP[st];
        ['Up_Out', 'Up_In', 'Down_Out', 'Down_In'].forEach(tid => {
            const blks = game.trackMgr.blocks[tid];
            if (!blks) return;
            const b = blks.find(x => x.stationIdx === idx && x.x !== -1000);
            if (!b) return;
            b.lanes.forEach(l => {
                if (!l) return;
                if (['新快速', '快速', '普通'].indexOf(l.type) < 0) return;
                const key = st + '|' + l.id + '|' + l.trainNo;
                if (seenAt[key]) return;
                seenAt[key] = true;
                const arr = passLog[st + '|' + (l.dir === 1 ? 'Up' : 'Down') + '|' + l.type];
                if (arr) arr.push(game.currentTime);
            });
        });
    }
}

/* 旧版 (規則をまとめる前のソース) と比べられるようにする受け皿。
   新しい版では js/24-service-rules.js が本物を持っているので使われない。 */
if (typeof innerTrackExists !== 'function') {
    globalThis.innerTrackExists = (i) =>
        i !== undefined && i >= STATION_MAP['西明石'] && i <= STATION_MAP['草津'];
}
if (typeof serviceTrackSide !== 'function') {
    globalThis.serviceTrackSide = (t) =>
        (['新快速', '特急', '貨物', '回送', '臨時'].indexOf(t.type) >= 0) ? 'out' : 'in';
}

// 4:00 から START_H まで空回し
__run((START_H - 4) * 3600);
__run((END_H - START_H) * 3600, () => { probeOnce(); probePass(); probeConvoy(); probeStuck(); probeActive(); });

console.log('=== 走行線路の規則どおりか (複々線の中, ' + START_H + '時〜' + END_H + '時) ===');
console.log('  観測 ' + sideChecked + ' 回 / 規則と違う線路 ' + sideWrong + ' 回 (' +
            (sideChecked ? (sideWrong * 100 / sideChecked).toFixed(2) : '0') + '%)');
Object.keys(wrongBy).sort((a, b) => wrongBy[b] - wrongBy[a]).slice(0, 10)
    .forEach(k => console.log('    ' + k + ' : ' + wrongBy[k] + '回'));

console.log('' + String.fromCharCode(10) + '=== 3本以上の連なり (となり合う列車が ' + CONVOY_STATIONS + '駅以内) ===');
['新快速', '快速', '普通'].forEach(ty => {
    const keys = Object.keys(convoyHits).filter(k => k.indexOf(ty + '|') === 0);
    const total = keys.reduce((a, k) => a + convoyHits[k], 0);
    console.log('  ' + ty.padEnd(6) + ' 観測 ' + String(total).padStart(6) + ' 回 / 最長 ' +
                (convoyMax[ty] || 0) + '本');
    keys.sort((a, b) => convoyHits[b] - convoyHits[a]).slice(0, 6).forEach(k =>
        console.log('      ' + k.split('|')[1] + ' 付近 ' + convoyHits[k] + '回'));
});

console.log('\n=== 同じ種別の続行間隔 (分) と団子 ===');
console.log('  駅      向き 種別    本数  中央値  最短  2分未満  3本続く団子  最大の穴');
const rows = [];
for (const st of PROBES) {
    for (const d of ['Up', 'Down']) {
        for (const ty of ['新快速', '快速', '普通']) {
            const arr = passLog[st + '|' + d + '|' + ty].slice().sort((a, b) => a - b);
            if (arr.length < 2) continue;
            const gaps = [];
            for (let i = 1; i < arr.length; i++) gaps.push((arr[i] - arr[i - 1]) / 60);
            const sorted = gaps.slice().sort((a, b) => a - b);
            const med = sorted[Math.floor(sorted.length / 2)];
            const min = sorted[0];
            const short = gaps.filter(g => g < 2).length;
            // 3本続けて「その種別の設計間隔の半分未満」で続いたら団子
            const design = { '新快速': 7.5, '快速': 10, '普通': 7.5 }[ty];
            let convoy = 0;
            for (let i = 1; i < gaps.length; i++) {
                if (gaps[i - 1] < design / 2 && gaps[i] < design / 2) convoy++;
            }
            const hole = sorted[sorted.length - 1];
            rows.push({ st, d, ty, n: arr.length, med, min, short, convoy, hole });
            console.log('  ' + st.padEnd(7) + (d === 'Up' ? '上り' : '下り') + ' ' +
                ty.padEnd(6) + String(arr.length).padStart(4) + '  ' +
                med.toFixed(2).padStart(6) + '  ' + min.toFixed(2).padStart(4) + '  ' +
                String(short).padStart(6) + '  ' + String(convoy).padStart(10) + '  ' +
                hole.toFixed(1).padStart(8));
        }
    }
}

const totalConvoy = rows.reduce((s, r) => s + r.convoy, 0);
const totalShort = rows.reduce((s, r) => s + r.short, 0);
console.log('\n  団子 (3本続けて設計間隔の半分未満) 合計: ' + totalConvoy);
console.log('  2分未満の続行 合計: ' + totalShort);
const worstHole = rows.reduce((m, r) => Math.max(m, r.hole), 0);
console.log('  いちばん大きい穴: ' + worstHole.toFixed(1) + '分');
console.log('  詰まり具合 (1分以上動けない列車): ' +
            (stuckObs ? (stuckHit * 100 / stuckObs).toFixed(1) : '0') + '%  (観測 ' + stuckObs + ')');
console.log('');
console.log('=== 昼間 (10〜16時) の在線本数の平均 ===');
Object.keys(actSum).sort().forEach(k => {
    console.log('  ' + k.padEnd(14) + (actSum[k] / Math.max(1, actN)).toFixed(1) + '本');
});
