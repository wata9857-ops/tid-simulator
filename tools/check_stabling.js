/* 夜間の駅留置・編成未定の表示・放出電留線からの木津方の始発を測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_stabling.js

   ■ 何を見るか
     1. 夜 (0〜4時) に駅で朝まで留置している編成 (四条畷・松井山手など) と、
        その編成が翌朝の始発になったか
     2. 留置場の在線のうち「編成が分からない」もの (構内図・指令卓で「編成未定」と出ていたもの)
     3. 放出の電留線から木津方 (四条畷・松井山手・同志社前・木津) へ出る朝の始発
*/
'use strict';
globalThis.__NO_EVENTS = true;
__boot();

const fails = [];
function check(ok, msg) { console.log((ok ? '  OK   ' : '  NG   ') + msg); if (!ok) fails.push(msg); }
const hhmm = (s) => { const h = Math.floor(s / 3600) % 24, m = Math.floor((s % 3600) / 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

let unknownMax = 0, unknownSamples = 0, unknownWhere = {};
const hoshuDown = [];        // 放出から木津方へ出た旅客列車 (朝)
const seenDep = new Set();
const stabledSeen = new Map();   // train id -> {st, veh, since}
const stabledUsed = [];          // 翌朝その編成が営業列車になった
const prevState = new Map();

function probe(g) {
    const now = g.currentTime;
    const h = (now / 3600) % 24;
    // 2. 編成の分からない在線
    if (Math.round(now) % 300 === 0) {
        let n = 0;
        for (const name in DEPOTS) {
            DEPOTS[name].trains.forEach(t => {
                if (!(t.vehicles && t.vehicles.length)) { n++; unknownWhere[name] = (unknownWhere[name] || 0) + 1; }
            });
        }
        unknownSamples++;
        if (n > unknownMax) unknownMax = n;
    }
    for (const t of g.trains) {
        if (t.state === 'finished') continue;
        // 1. 駅での夜間留置
        if (t.overnightStable) {
            if (!stabledSeen.has(t.id)) stabledSeen.set(t.id, { st: t.overnightStable.st, veh: (t.vehicles || []).map(v => v.fullId).join('+'), since: now });
        } else if (stabledSeen.has(t.id) && prevState.get(t.id) === 'stable' && t.type !== '回送') {
            const s = stabledSeen.get(t.id);
            stabledUsed.push({ st: s.st, veh: s.veh, at: hhmm(now), no: t.trainNo, type: t.type, dest: t.dest,
                               ok: (t.vehicles || []).map(v => v.fullId).join('+') === s.veh });
        }
        prevState.set(t.id, t.overnightStable ? 'stable' : t.state);
        // 3. 放出から木津方への始発
        if (h >= 4.5 && h < 9.0 && t.state !== 'in_depot' && t.dir === 1 && /^Tozai_Up$/.test(t.trackId) &&
            t.type !== '回送' && t.type !== '貨物' && t.startName === '放出' && !seenDep.has(t.id + t.trainNo)) {
            seenDep.add(t.id + t.trainNo);
            hoshuDown.push({ day: now >= 28 * 3600 ? 2 : 1, at: hhmm(now), no: t.trainNo, type: t.type, dest: t.dest,
                             veh: (t.vehicles || []).map(v => v.fullId).join('+') });
        }
    }
}

// 4:00 → 翌 9:00 (夜の留置から朝の始発まで)
__run(29 * 3600, probe);

console.log('=== 夜間の駅留置 (0時以降に留置していた編成) ===');
const byStation = {};
stabledSeen.forEach(s => { byStation[s.st] = (byStation[s.st] || 0) + 1; });
console.log(' ' + Object.keys(byStation).map(k => k + ' ' + byStation[k] + '本').join(' / '));
console.log('=== 翌朝、留置していた編成が始発になった ===');
stabledUsed.forEach(u => console.log('   ' + u.at + ' ' + u.st + ' ' + u.veh + ' → ' + u.no + ' ' + u.type + ' ' + u.dest + '行き' + (u.ok ? '' : ' (編成が違う)')));
console.log('=== 放出の電留線から木津方へ出た朝の列車 (4:30〜9:00) ===');
hoshuDown.forEach(d => console.log('   ' + d.day + '日目 ' + d.at + ' ' + d.no + ' ' + d.type + ' ' + d.dest + '行き ' + d.veh));
console.log('=== 編成の分からない留置場の在線 (5分ごとの見本) ===');
console.log('  最大 ' + unknownMax + '本  ' + Object.keys(unknownWhere).map(k => k + ' ' + unknownWhere[k]).join(' / '));

console.log('\n=== 判定 ===');
check(stabledSeen.size >= 2, '主要駅で朝まで留置する編成がある (' + stabledSeen.size + '本)');
check(stabledUsed.length >= 2 && stabledUsed.every(u => u.ok), '留置していた編成がそのまま翌朝の始発になる (' + stabledUsed.length + '本)');
check(unknownMax === 0, '留置場に編成の分からない在線が無い (最大 ' + unknownMax + '本)');
const toKizu = hoshuDown.filter(d => d.day === 2 && ['木津', '同志社前', '京田辺', '松井山手', '四条畷', '長尾'].indexOf(d.dest) >= 0);
check(toKizu.length >= 4, '2日目: 放出から木津方への朝の始発が 4本以上 (' + toKizu.length + '本)');
check(toKizu.some(d => d.dest === '木津'), '放出発 木津行きの始発がある');
check(toKizu.length > 0 && toKizu[0].at <= '05:45', '放出から木津方の最初の列車が 5:45 まで (' + (toKizu[0] ? toKizu[0].at : '-') + ')');
console.log(fails.length ? ('\n不合格 ' + fails.length + '件') : '\nすべて合格');
