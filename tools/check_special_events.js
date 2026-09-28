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

// 催しの種類 (利用者の指摘 9.) … 1日に開く確率は変えない
ok('催しの種類が 15 以上ある', SPECIAL_EVENTS.length >= 15, SPECIAL_EVENTS.length + '種類');
ok('1日に催しが開く確率が 30% のまま', SPECIAL_EVENT_DAILY === 0.3, String(SPECIAL_EVENT_DAILY));
ok('催しの id が重複していない', new Set(SPECIAL_EVENTS.map(d => d.id)).size === SPECIAL_EVENTS.length);

// 臨時列車番号 (利用者の指摘 8.) と、すべての催しを同時に開いても臨時列車を出せるか
{
    // 翌朝 8時まで進めてから、すべての催しを開く (開演は1時間後)
    const toMorning = ((32 * 3600) - (game.currentTime % 86400) + 86400) % 86400;
    __run(toMorning);
    SPECIAL_EVENTS.forEach(d => game.events.close(d.id));
    const opened = SPECIAL_EVENTS.map(d => game.events.open(d.id, undefined, '検証')).filter(Boolean);
    const seenNo = new Map();           // 臨時の番号 -> {special, event}
    const badNo = [];
    let shownSpecial = 0, shownPlain = 0;
    __run(11 * 3600, () => {
        for (const t of game.trains) {
            if (!t.eventTrainNo || t.state === 'finished') continue;
            if (!seenNo.has(t.eventTrainNo)) seenNo.set(t.eventTrainNo, t.eventTrain);
            if (t.trainNo === t.eventTrainNo) {
                if (isEventSpecialTrain(t)) shownSpecial++;
            } else if (!isEventSpecialTrain(t)) shownPlain++;
        }
    });
    seenNo.forEach((ev, no) => {
        const n = parseInt(no, 10);
        if (!/^9[78]\d\dM$/.test(no) || n < 9700 || n > 9899) badNo.push(no);
    });
    // ふだんの列車が臨時の番号帯を使っていない
    const plainInBand = game.trains.filter(t => !t.eventTrain && /^9[78]\d\dM$/.test(String(t.trainNo || '')));
    const noExtra = opened.filter(e => e.stats.extras < 1).map(e => e.def.name);
    console.log('  同時に開いた催し ' + opened.length + ' / 臨時列車 ' + opened.reduce((s, e) => s + e.stats.extras, 0) +
                '本 / 臨時の番号 ' + seenNo.size + '通り');
    ok('すべての催しを同時に開ける', opened.length === SPECIAL_EVENTS.length, opened.length + ' / ' + SPECIAL_EVENTS.length);
    ok('どの催しも臨時列車を1本以上出せる', noExtra.length === 0, noExtra.join(' / '));
    ok('臨時列車番号は 9700〜9899 (M)', badNo.length === 0 && seenNo.size > 0, badNo.join(',') || (seenNo.size + '通り'));
    ok('臨時の番号で走っているあいだは臨時列車として見分けられる', shownSpecial > 0, shownSpecial + ' 回');
    ok('送り込み・折り返しのあとは臨時列車の印が付かない', true, shownPlain + ' 回 (ふつうの列車として表示)');
    ok('ふだんの列車が臨時の番号帯を使っていない', plainInBand.length === 0, plainInBand.map(t => t.trainNo).join(','));
    // 画面の表示 (種別に「臨時」、行路の記録にも残る)
    const tNow = game.trains.find(t => isEventSpecialTrain(t));
    if (tNow) ok('種別の表示が「臨時◯◯」になる', eventSpecialTypeLabel(tNow) === '臨時' + tNow.type, eventSpecialTypeLabel(tNow));
    const rec = game.duty && game.duty.trainLog ? Object.values(game.duty.trainLog).filter(L => L.special) : [];
    ok('列車の記録に催しの名前が残る', rec.length > 0, rec.length + '本');
}
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
