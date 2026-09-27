/* 多客の催しの臨時輸送が、その場所・その時間帯だけに効くかを見る。
   使い方: node tools/harness.js --seed=20260922 tools/check_special_events.js

   ■ 見ること
     1. 催しを開くと、終演後の時間帯に臨時列車が出て、催しの駅を通る
     2. 催しの駅で停車時分が延びる (終演直後)。催しの無い駅・時間帯では延びない
     3. 増結 (4→8両 など) が行われ、両数の上限 (普通8両・快速12両) を超えない
     4. 臨時輸送の時間帯が終わると臨時列車は出なくなる
     5. 催しのあいだも線区が詰まらない (1分以上動けない列車の割合)
     6. 花火大会・コンサートなど、どの催しも臨時列車を出せる (場所ごとの発駅・行先が線路の上で成り立つ)
*/
'use strict';
globalThis.__NO_EVENTS = true;          // 乱数で開かれる催しは止める (ここで開く)
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

__run(12 * 3600);            // 16:00
const day = Math.floor(game.currentTime / 86400);
const ev = game.events.open('biwako-hanabi', day * 86400 + 19.5 * 3600, '検証');
ok('びわ湖大花火大会を開ける', !!ev);

const passedOtsu = new Set();
let dwellAtOtsu = [], dwellElse = [], stuck = 0, all = 0, overCap = 0, boosted = new Set();
const prev = new Map();
__run(7.5 * 3600, () => {
    const now = game.currentTime;
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        all++; if (t.stuckTime >= 60) stuck++;
        const b = (game.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
        const st = b && isRealStationBlock(b) ? blockStationName(b) : null;
        if (t.eventTrain && st === '大津') passedOtsu.add(t.trainNo);
        const cars = (t.vehicles || []).reduce((s, v) => s + v.cars, 0);
        if (t.eventBoostAdded && !t.__capChecked) { t.__capChecked = true; if (t.eventBoostAdded > (t.eventBoostType === '快速' ? 12 : 8)) overCap++; }
        const p = prev.get(t.id);
        prev.set(t.id, t.state + '|' + st);
        if (t.state === 'stopped' && p && p.split('|')[0] !== 'stopped' && st && t.type === '普通' && !t.isFinalStop) {
            const ph = game.events.phaseOf(ev, now);
            if (st === '大津' && ph === 'out') dwellAtOtsu.push(t.timer);
            if (st === '明石' || st === '茨木') dwellElse.push(t.timer);
        }
    }
});
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
console.log('  臨時列車 ' + ev.stats.extras + '本 / うち大津を通った ' + passedOtsu.size + '本 / 増結 ' + ev.stats.boosted + '本');
console.log('  普通の停車時分 大津(終演後) ' + avg(dwellAtOtsu).toFixed(0) + '秒 (n=' + dwellAtOtsu.length + ') / 明石・茨木 ' + avg(dwellElse).toFixed(0) + '秒');
ok('終演後に臨時列車が 4本以上出る', ev.stats.extras >= 4, ev.stats.extras + '本');
ok('臨時列車が催しの駅 (大津) を通る', passedOtsu.size >= 2, passedOtsu.size + '本');
ok('大津の停車時分が、ほかの駅より延びる', avg(dwellAtOtsu) > avg(dwellElse) + 30, avg(dwellAtOtsu).toFixed(0) + '秒 / ' + avg(dwellElse).toFixed(0) + '秒');
ok('増結が行われる', ev.stats.boosted >= 1, ev.stats.boosted + '本');
ok('増結で両数の上限 (普通8両・快速12両) を超えない', overCap === 0, overCap + '本');
ok('終演後の時間帯が終わると臨時輸送が閉じる', !game.events.active.some(e => e.def.id === 'biwako-hanabi'));
ok('催しのあいだ 1分以上動けない列車が 20% 未満', stuck / all < 0.2, (stuck * 100 / all).toFixed(1) + '%');

// どの催しも臨時列車を出せる (発駅・行先・向きが線路の上で成り立つ)
const bad = [];
SPECIAL_EVENTS.forEach(d => d.extras.forEach(x => {
    const dir = game.ops.directionFor(x.from, x.to);
    if (dir !== x.dir) bad.push(d.name + ': ' + x.from + '→' + x.to + ' の向き');
    if (!canReverseAt(x.from) && !DEPOTS[x.from]) bad.push(d.name + ': ' + x.from + ' は折り返し・車両所の無い駅');
    if (STATION_MAP[d.at] === undefined) bad.push(d.name + ': ' + d.at + ' が線路図に無い');
}));
ok('どの催しも、臨時列車の発駅・行先・向きが線路の上で成り立つ', bad.length === 0, bad.join(' / '));
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
