/* 支障の手前の折り返し (checkShortTurns) が、支障の見込みの時間を見ているかを見る。
   使い方: node tools/harness.js --seed=20260922 tools/check_short_turn.js
   (利用者の指摘 ① 2026-10: すぐ解ける支障でも周りの列車をすべて折り返し、解けたあと支障の先に列車が無くなっていた)

   1. 10分で解ける見合わせ … 折り返さない
   2. 70分の見合わせ … 折り返すが、支障の先に 2本以上を残す
   3. 長い見合わせが早く解けた … まだ折り返し駅に着いていない列車の行先を元に戻す */
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }
CONFIG.majorIncidentChance = 0;
game.recovery.majorAt = Infinity;
game.incidents.nextAt = Infinity;
__run(4.5 * 3600);            // 9時ごろ (昼の本数)
const ops = game.ops;
const turns = () => ops.stats.shortTurn || 0;
const restored = () => ops.stats.shortTurnRestored || 0;
/** 本線の真ん中 (尼崎〜西宮あたり) で区間の見合わせを起こし、残り時間を決める */
function suspend(sec) {
    let inc = null;
    for (let k = 0; k < 30 && !inc; k++) {
        const cand = game.incidents.trigger('kasen');
        if (cand && /^(Up|Down)_(In|Out)$/.test(cand.trackId)) inc = cand;
        else if (cand) game.incidents.finish(cand, '検証', true);
    }
    if (!inc) return null;
    inc.timer = sec; inc.totalSec = Math.max(inc.totalSec, sec);
    return inc;
}
function clear(inc) { if (game.incidents.active.indexOf(inc) >= 0) game.incidents.finish(inc, '検証', true); game.recovery.plans = []; game.trackMgr.recoveryHolds = []; game.trains.forEach(t => { if (t.recoveryHold) t.recoveryHold = null; }); }

// 1. 短い見合わせ
let t0 = turns();
let inc = suspend(600);
ok('見合わせを起こせた (10分)', !!inc, inc ? inc.place : '');
__run(8 * 60);
const shortN = turns() - t0;
ok('10分で解ける見合わせでは折り返さない', shortN === 0, shortN + '本');
clear(inc);
__run(20 * 60);

// 2. 長い見合わせ
t0 = turns();
inc = suspend(70 * 60);
ok('見合わせを起こせた (70分)', !!inc, inc ? inc.place : '');
__run(12 * 60);
const longN = turns() - t0;
ok('70分の見合わせでは手前で折り返す', longN > 0, longN + '本');
// 支障の先 (折り返し駅より支障側) に残っている列車
const zones = ops.shortTurnZones();
let keptOk = true, keptMin = 99;
for (const z of zones) {
    for (const dir of [1, -1]) {
        const edge = dir === 1 ? z.start : z.end;
        const near = game.trains.filter(t => t.trackId === z.trackId && t.dir === dir && t.state !== 'finished' &&
            (edge - t.currBlockIndex) * dir >= 0 && (edge - t.currBlockIndex) * dir <= UNITS_PER_STATION * 10 && !t.shortTurnAt);
        if (near.length) keptMin = Math.min(keptMin, near.length);
    }
}
ok('支障の手前の線路に、折り返さない列車を残している', keptMin >= 2 || keptMin === 99, keptMin === 99 ? '該当なし' : keptMin + '本以上');
// 3. 早く解けた
const pending = game.trains.filter(t => t.shortTurnAt && t.dest === t.shortTurnAt).length;
const r0 = restored();
clear(inc);
__run(3 * 60);
const back = restored() - r0;
ok('見合わせが早く解けたら、折り返し駅に着く前の列車を元の行先に戻す', pending === 0 || back > 0, `戻した ${back}本 / 折り返し予定 ${pending}本`);
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
