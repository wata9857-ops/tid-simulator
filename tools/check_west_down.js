/* 西明石〜大久保〜加古川 の下り (外側線) の待避と詰まりを測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_west_down.js

   ■ 利用者の指摘 (2026-10)
     下りの西明石〜大久保で、普通・快速が要らない待ちをして番線をふさぎ、
     うしろの新快速・特急が追い抜けずに詰まる。

   ■ 見ること (6〜23時)
     1. 西明石・大久保で普通・快速が抑止された合計時間と、その内訳 (待った相手)
     2. 停車駅が同じ列車 (西明石より西の快速) を待った時間 … 0 であること
     3. 回送を待った時間 … 0 であること (西明石より西の複線では回送を先に通さない)
     4. 明石〜加古川の新快速・特急が動けなかった合計時間
*/
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

const base = Train.prototype.checkHold;
Train.prototype.checkHold = function (s) {
    const r = base.call(this, s);
    this.__heldAt = r ? game.currentTime : -1;
    return r;
};
const U = UNITS_PER_STATION;
const LO = STATION_MAP['加古川'] * U, HI = STATION_MAP['明石'] * U;
const sameStops = (L, H) => {
    for (let s = STATION_MAP[blockStationName(game.trackMgr.blocks[L.trackId][L.currBlockIndex])] - 1; s >= STATION_MAP['加古川']; s--) {
        if (L.passengerStopsAt(STATIONS[s].name) !== H.passengerStopsAt(STATIONS[s].name)) return false;
    }
    return true;
};
let lHold = 0, lSame = 0, lDead = 0, hStuck = 0;
const byWho = {};
__run(18 * 3600, () => {
    const h = (game.currentTime / 3600) % 24;
    if (h < 6 || h >= 23) return;
    for (const t of game.trains) {
        if (t.dir !== -1 || t.state === 'finished' || t.state === 'in_depot') continue;
        if (t.trackId !== 'Down_Out' || t.currBlockIndex < LO || t.currBlockIndex > HI) continue;
        if (['新快速', '特急'].indexOf(t.type) >= 0 && t.stuckTime > 20 && !(t.state === 'stopped' && t.timer > 0)) hStuck += CONFIG.TICK_SEC;
        if (['普通', '快速'].indexOf(t.type) < 0 || t.__heldAt !== game.currentTime || !(t.stuckTime > 0)) continue;
        const st = blockStationName(game.trackMgr.blocks[t.trackId][t.currBlockIndex]);
        if (st !== '西明石' && st !== '大久保') continue;
        lHold += CONFIG.TICK_SEC;
        let H = null;
        for (const x of game.trains) {
            if (x === t || x.dir !== -1 || x.state === 'finished' || x.getPriority() <= t.getPriority()) continue;
            if (!/^Down_(Out|In)$/.test(x.trackId)) continue;
            const d = x.currBlockIndex - t.currBlockIndex;
            if (d >= 0 && d <= 9 && (!H || d < H.d)) H = { t: x, d: d };
        }
        /* 待った相手: 待避の先読みの「待避」(by)、優先の決まり (_holdWhy)、どちらでもなければ
           すぐ後ろの格上の列車 (ふだんの待避の判定か、前の列車との間隔) */
        const plan = game.ops.ovPlans && game.ops.ovPlans.get(t.id);
        let W = null, how = '間隔・待避';
        if (plan && plan.st === st && plan.act === 'yield' && game.ops.overtakePlanFor(t, st) === 'yield') {
            W = game.trains.find(x => x.trainNo === plan.by && x.state !== 'finished'); how = '先読みの待避';
        } else if (t._holdWhy && /を先に通す/.test(t._holdWhy)) {
            const no = t._holdWhy.split(' ')[0];
            W = game.trains.find(x => x.trainNo === no && x.state !== 'finished'); how = '優先の決まり';
        }
        const who = W ? W.type + ' (' + how + ')' : (H ? H.t.type + ' (' + how + ')' : '(前方の列車・間隔)');
        byWho[st + ' ' + t.type + ' → ' + who] = (byWho[st + ' ' + t.type + ' → ' + who] || 0) + CONFIG.TICK_SEC;
        if (W && W.type === '回送') lDead += CONFIG.TICK_SEC;
        if (W && ['快速', '新快速'].indexOf(W.type) >= 0 && t.type === '普通' && sameStops(t, W)) lSame += CONFIG.TICK_SEC;
    }
});
const m = (s) => Math.round(s / 60);
console.log('=== 西明石〜加古川 下り (6〜23時) ===');
console.log('  西明石・大久保で普通・快速が抑止された合計 ' + m(lHold) + '分');
Object.keys(byWho).sort((a, b) => byWho[b] - byWho[a]).slice(0, 14).forEach(k => console.log('    ' + k.padEnd(26) + m(byWho[k]) + '分'));
console.log('  明石〜加古川で新快速・特急が動けなかった合計 ' + m(hStuck) + '分');
ok('停車駅が同じ快速・新快速を待避で待たない', lSame === 0, m(lSame) + '分');
ok('西明石より西の複線で回送を待たない (先読み・優先の決まり)', lDead === 0, m(lDead) + '分');
ok('新快速・特急が動けなかった合計が 300分以下 (直す前は種により 370〜450分)', m(hStuck) <= 300, m(hStuck) + '分');
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
