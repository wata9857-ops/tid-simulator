/* 貨物列車が吹田貨物ターミナルの時刻表 (js/38-freight-timetable.js) どおりに走るかを測る。

   使い方: node tools/harness.js --seed=20260922 tools/check_freight_timetable.js [--hours=24] [--list]

   ■ 見ること
     1. 時刻表の列車が線路図の列車 (区間) に直っている (本数・列車番号)
     2. 1日走らせて、時刻表の列車が出ている。乱数の列車番号の貨物列車が無い
     3. 吹田タ (北方貨物線の着発線の位置) を通る時刻が、時刻表の時刻に近い
        (着く列車は着いた時刻、吹田タ発の列車は発車した時刻で比べる)
*/
'use strict';
__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
const argv = __argv;
const hoursArg = argv.find(a => a.indexOf('--hours=') === 0);
const HOURS = hoursArg ? parseFloat(hoursArg.split('=')[1]) : 24;
const LIST = argv.indexOf('--list') >= 0;

console.log('\n=== 時刻表 ===');
const rows = FREIGHT_TT_DOWN.length + FREIGHT_TT_UP.length;
const legs = freightTimetableLegs();
const nos = new Set(legs.map(l => l.no));
console.log(`  PDF から写した列車 ${rows}本 (下り ${FREIGHT_TT_DOWN.length} / 上り ${FREIGHT_TT_UP.length})、` +
            `線路図を走る列車 ${nos.size}本、区間 ${legs.length} (吹田タで着・発に分けたもの ${legs.filter(l => l.link).length})`);
ok('時刻表の列車が100本以上ある', rows >= 100, String(rows));
ok('線路図を走る列車に直せた', nos.size >= 100, String(nos.size));
const byFrom = {};
legs.forEach(l => { byFrom[l.from] = (byFrom[l.from] || 0) + 1; });
console.log('  線路図に入る所: ' + Object.keys(byFrom).map(k => k + ' ' + byFrom[k]).join(' / '));

console.log('\n=== 1日走らせる ===');
const SP = FREIGHT_TERMINALS['吹田タ'].pos;
const seen = new Map();      // frtKey -> { planned, arrAt, depAt }
const randomNos = new Set();
__run(HOURS * 3600, (g) => {
    const now = g.currentTime;
    g.trains.forEach(t => {
        if (t.type !== '貨物' || t.state === 'finished') return;
        if (!t.frtKey) { if (!t.workTrain) randomNos.add(t.trainNo); return; }
        let r = seen.get(t.frtKey);
        if (!r) { r = { no: t.trainNo, key: t.frtKey, planned: t.frtPlanned, from: t.startName, dest: t.dest, arrAt: null, depAt: null, passAt: null }; seen.set(t.frtKey, r); }
        const inYard = /^Frt_Suita/.test(t.trackId);
        if (inYard && r.arrAt === null && t.hasDeparted) r.arrAt = now;
        if (!inYard && r.from === '吹田タ' && t.hasDeparted && r.depAt === null && /Hoppo|Out|In/.test(t.trackId)) r.depAt = now;
        if (!inYard && r.passAt === null && t.hasDeparted && /^(Up|Down)_/.test(t.trackId) &&
            (t.currBlockIndex - SP) * t.dir >= 0 && Math.abs(t.currBlockIndex - SP) <= 1) r.passAt = now;
    });
});
const F = game.spawner.frt;
console.log('  ' + JSON.stringify(F.stats));
ok('時刻表の列車が出た', F.stats.spawned > 60, String(F.stats.spawned));
ok('乱数の列車番号の貨物列車が無い (時刻表の列車だけ)', randomNos.size === 0, [...randomNos].slice(0, 8).join(','));
ok('出た列車の番号はすべて時刻表の列車番号', [...seen.values()].every(r => nos.has(r.no)));

// 時刻表との差 (吹田タ)
const diffs = [];
const lines = [];
for (const e of F.queue) {
    if (e.state !== 'spawned' && e.state !== 'claimed') continue;
    const r = seen.get(e.key);
    const L = e.leg;
    const plannedSec = e.day * 86400 + L.anchor;          // ばらつき・遅れを入れる前の時刻表の時刻
    let actual = null, what = '';
    if (!r) continue;
    if (L.from === '吹田タ') { actual = r.depAt; what = '吹田タ発'; }
    else if (L.dest === '吹田タ' || FREIGHT_EXIT_VIA_SUITA.indexOf(L.dest) >= 0) { actual = r.arrAt; what = '吹田タ着'; }
    else if (L.anchorAt !== 'suita') continue;              // 吹田に時刻の無い列車は比べない
    else { actual = r.arrAt || r.passAt; what = '吹田タ着/通過'; }
    if (actual === null) continue;
    const d = (actual - plannedSec) / 60;
    diffs.push(d);
    const hm = (s) => { const m = Math.floor(((s % 86400) + 86400) % 86400 / 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    lines.push(`  ${L.no.padEnd(5)} ${L.id.padEnd(6)} ${L.from}→${L.dest} (${L.realFrom}→${L.realTo})  ${what} 時刻表 ${hm(plannedSec)} 実際 ${hm(actual)}  ${d >= 0 ? '+' : ''}${d.toFixed(0)}分`);
}
if (LIST) lines.forEach(l => console.log(l));
diffs.sort((a, b) => a - b);
const abs = diffs.map(Math.abs).sort((a, b) => a - b);
const med = abs.length ? abs[Math.floor(abs.length / 2)] : 0;
const within15 = abs.filter(x => x <= 15).length, within30 = abs.filter(x => x <= 30).length;
console.log(`  吹田タの時刻と比べた列車 ${abs.length}本: 差の中央値 ${med.toFixed(1)}分 / 15分以内 ${within15}本 / 30分以内 ${within30}本 ` +
            `/ 最早 ${diffs.length ? diffs[0].toFixed(0) : '-'}分 最遅 ${diffs.length ? diffs[diffs.length - 1].toFixed(0) : '-'}分`);
ok('吹田タの時刻と比べられた列車が40本以上ある', abs.length >= 40, String(abs.length));
ok('吹田タでの時刻の差の中央値が15分以内', med <= 15, med.toFixed(1) + '分');
ok('7割以上が時刻表の30分以内', within30 >= abs.length * 0.7, within30 + '/' + abs.length);

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
