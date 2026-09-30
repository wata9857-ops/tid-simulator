/* 網干〜西明石 の上り (外側線) の詰まりを測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_west_up.js

   ■ 利用者の指摘
     上りの 土山・東加古川〜御着・英賀保 あたりで、列車がひどく団子になって詰まる。
     普通・快速が、新快速や回送などを待ちすぎて、後ろの列車が動けなくなっているのでは。

   ■ 見ること (5〜24時)
     1. 抑止 (checkHold が発車・進行を止めた) の合計時間と、場所ごとの内訳
     2. 同時に1分以上動けない列車の本数 (最大・平均)
     3. 2駅の中に上りの旅客列車が3本以上いた回数 (団子)
*/
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

const U = UNITS_PER_STATION;
const LO = STATION_MAP['網干'] * U, HI = STATION_MAP['西明石'] * U;
const base = Train.prototype.checkHold;
Train.prototype.checkHold = function (s) {
    const r = base.call(this, s);
    this.__heldAt = r ? game.currentTime : -1;
    return r;
};
const byLoc = {};
let held = 0, maxStuck = 0, sumStuck = 0, ticks = 0, clump = 0;
const PAX = ['普通', '快速', '新快速'];
__run(20 * 3600, () => {
    const h = (game.currentTime / 3600) % 24;
    if (h < 5) return;
    ticks++;
    const blks = game.trackMgr.blocks['Up_Out'];
    let stuck = 0;
    const pos = [];
    for (const t of game.trains) {
        if (t.dir !== 1 || t.trackId !== 'Up_Out') continue;
        if (t.currBlockIndex < LO || t.currBlockIndex > HI) continue;
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        if (PAX.indexOf(t.type) >= 0) pos.push(t.currBlockIndex);
        if (t.stuckTime > 60) stuck++;
        if (t.__heldAt !== game.currentTime) continue;
        held += CONFIG.TICK_SEC;
        const b = blks[t.currBlockIndex];
        const nm = b && isRealStationBlock(b) ? blockStationName(b)
            : STATIONS[Math.floor(t.currBlockIndex / U)].name + '〜';
        byLoc[nm] = (byLoc[nm] || 0) + CONFIG.TICK_SEC;
    }
    pos.sort((a, b) => a - b);
    for (let j = 0; j + 2 < pos.length; j++) if (pos[j + 2] - pos[j] <= U * 2) { clump++; break; }
    sumStuck += stuck;
    if (stuck > maxStuck) maxStuck = stuck;
});
const heldMin = Math.round(held / 60);
console.log('=== 網干〜西明石 上り (5〜24時) ===');
console.log('  抑止の合計        ' + heldMin + '分');
console.log('  1分以上動けない列車  最大 ' + maxStuck + '本 / 平均 ' + (sumStuck / ticks).toFixed(2) + '本');
console.log('  2駅に旅客列車3本以上 ' + clump + ' Tick');
console.log('  場所ごとの抑止 (上位):');
Object.keys(byLoc).sort((a, b) => byLoc[b] - byLoc[a]).slice(0, 12)
    .forEach(k => console.log('    ' + k.padEnd(10) + Math.round(byLoc[k] / 60) + '分'));
ok('抑止の合計が 1500分以下 (直す前は 2356分)', heldMin <= 1500, heldMin + '分');
ok('同時に1分以上動けない列車が 8本以下 (直す前は 13本)', maxStuck <= 8, maxStuck + '本');
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
