/* 団子 (同じ向きの列車が短い間隔で固まる) と、始発駅から続けて出る列車を測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_bunching.js

   ■ 見ること
     1. 線区ごとに「2駅の中に同じ向きの普通が3本以上」いた回数 (毎Tick数える)
        とくに 西明石〜大久保〜加古川 (利用者の指摘)
     2. 始発駅から、同じ向きの列車が 2分未満の間隔で続けて発車した回数
     3. 西明石で、外側線の列車が内側線の番線 (3・4番など) を使えた回数
*/
'use strict';
globalThis.__NO_EVENTS = true;   // 乱数で開かれる催し (js/36-special-events.js) は止めて比べる
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

const ZONES = [
    { k: '加古川〜西明石', a: '加古川', b: '西明石', tracks: ['Up_Out', 'Down_Out'] },
    { k: '西明石〜神戸 (内側線)', a: '西明石', b: '神戸', tracks: ['Up_In', 'Down_In'] },
    { k: '大阪〜高槻 (内側線)', a: '大阪', b: '高槻', tracks: ['Up_In', 'Down_In'] },
    { k: '京都〜野洲', a: '京都', b: '野洲', tracks: ['Up_Out', 'Down_Out'] },
    { k: '尼崎〜宝塚', a: '尼崎', b: '宝塚', tracks: ['Fukuchi_Up', 'Fukuchi_Down'] },
    { k: '京橋〜松井山手', a: '京橋', b: '松井山手', tracks: ['Tozai_Up', 'Tozai_Down'] }
];
const clumps = {};
const originBack = {};      // 駅 -> 2分未満の続けての始発
const lastOrigin = {};
const prev = new Map();
let nakCross = 0;
const span = UNITS_PER_STATION * 2;

__run(18 * 3600, () => {
    const h = (game.currentTime / 3600) % 24;
    if (h < 6 || h >= 22) return;
    for (const z of ZONES) {
        for (const tid of z.tracks) {
            const blks = game.trackMgr.blocks[tid];
            if (!blks) continue;
            const ia = STATION_MAP[z.a] * UNITS_PER_STATION, ib = STATION_MAP[z.b] * UNITS_PER_STATION;
            const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
            const pos = [];
            for (let i = lo; i <= hi; i++) {
                const b = blks[i];
                if (!b || b.x === -1000) continue;
                b.lanes.forEach(l => { if (l && l.type === '普通' && l.dir === trackDirOf(tid)) pos.push(i); });
            }
            pos.sort((x, y) => x - y);
            for (let j = 0; j + 2 < pos.length; j++) if (pos[j + 2] - pos[j] <= span) { clumps[z.k] = (clumps[z.k] || 0) + 1; break; }
        }
    }
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const p = prev.get(t.id);
        const cur = t.trackId + '#' + t.currBlockIndex + '#' + t.hasDeparted;
        prev.set(t.id, cur);
        if (!p) continue;
        const wasDeparted = p.split('#')[2] === 'true';
        if (!wasDeparted && t.hasDeparted && ['普通', '快速', '新快速'].indexOf(t.type) >= 0) {
            const st = t.startName;
            const key = st + '|' + t.dir;
            if (lastOrigin[key] !== undefined && game.currentTime - lastOrigin[key] < 120) originBack[st] = (originBack[st] || 0) + 1;
            lastOrigin[key] = game.currentTime;
        }
        if (t.trackId === 'Down_In' && ['新快速', '快速', '特急'].indexOf(t.type) >= 0) {
            const b = game.trackMgr.blocks[t.trackId][t.currBlockIndex];
            if (b && blockStationName(b) === '西明石' && p.split('#')[0] === 'Down_Out') nakCross++;
        }
    }
});

console.log('=== 2駅の中に普通が3本以上 (6〜22時、Tick数) ===');
ZONES.forEach(z => console.log('  ' + z.k.padEnd(22) + (clumps[z.k] || 0)));
console.log('=== 始発駅から2分未満で続けて発車 ===');
const ob = Object.keys(originBack).sort((a, b) => originBack[b] - originBack[a]);
console.log('  合計 ' + ob.reduce((s, k) => s + originBack[k], 0) + '回  ' + ob.slice(0, 10).map(k => k + '×' + originBack[k]).join(' '));
console.log('=== 西明石で外側線から内側線の番線へ入った優等列車: ' + nakCross + '回');
ok('加古川〜西明石 の普通の団子が 300 Tick 以下 (直す前は種によって 22〜272)', (clumps['加古川〜西明石'] || 0) <= 300, String(clumps['加古川〜西明石'] || 0));
ok('始発駅から2分未満の続行発車が 25回以下 (直す前は 36〜45回)', ob.reduce((s, k) => s + originBack[k], 0) <= 25);
ok('西明石で外側線の優等列車が内側線の番線 (3・4番) を使える', nakCross > 0, nakCross + '回');
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
