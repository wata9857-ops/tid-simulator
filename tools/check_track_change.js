/* 指令の「着発番線変更」が効くかを見る。

   使い方: node tools/harness.js --seed=7 tools/check_track_change.js

   ■ 以前の不具合
     予約の番線番号を、どの線路のブロックかを見ずに当てていたため、
     指定と違う線路・違う番線に入る、そのレーンが無い線路では永久に待つ、
     発車判定の見込みの時点で予約が「済み」になって効かない、などがあった。

   ■ 見ること
     1. 走っている列車に、これから通る駅の別の番線を予約すると、その番線に入る
     2. ふさがったままのときは、待ちの上限 (5分) で取りやめ、通常の番線に入る (止まり続けない)
     3. 通過済みの駅・反対方向の番線・無い番線は、理由つきで断られる
     4. すでにその駅に居る列車は、その場で転線する
*/
'use strict';

__boot();
__run(3 * 3600);

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}

const res = [];
const trains = game.trains.filter(t => t.state === 'running' && t.currBlockIndex >= 0);
for (const t of trains) {
    if (res.length >= 80) break;
    const names = trainStationsAhead(game, t, 6).slice(2, 5);
    if (!names.length) continue;
    const st = names[Math.floor(Math.random() * names.length)];
    const c = trackChangeCandidates(game, t, st).filter(o => !o.disabled);
    if (c.length < 2) continue;
    const pick = c[Math.floor(Math.random() * c.length)];
    const [tid, ln] = pick.value.split(',');
    const r = game.applyCommand({ name: 'trackChange', trainId: t.id, station: st, trackId: tid, lane: +ln });
    res.push({ t, st, tid, ln: +ln, ok: r.ok, seen: null, maxStuck: 0 });
}
for (let i = 0; i < 180; i++) {
    game.update();
    res.forEach(x => {
        const t = x.t;
        if (t.state === 'finished') return;
        const b = game.trackMgr.blocks[t.trackId][t.currBlockIndex];
        if (b && blockStationName(b) === x.st && x.seen === null) x.seen = { tid: t.trackId, ln: t.lane };
        x.maxStuck = Math.max(x.maxStuck, t.stuckTime);
    });
}
const done = res.filter(x => x.t.trackChangeReservation && x.t.trackChangeReservation.status === 'done');
const hit = done.filter(x => x.seen && x.seen.tid === x.tid && x.seen.ln === x.ln);
const failed = res.filter(x => x.t.trackChangeReservation && x.t.trackChangeReservation.status === 'failed');
const pending = res.filter(x => x.t.state !== 'finished' && x.t.trackChangeReservation &&
                               x.t.trackChangeReservation.status === 'pending');
console.log(`  予約 ${res.length}件 / 変更済み ${done.length} / 取りやめ ${failed.length} / 予約のまま ${pending.length}`);
ok('候補から選んだ予約はすべて受け付けられる', res.every(x => x.ok));
ok('変更済みの列車は、指定の線路・番線に入っている', hit.length === done.length,
   (done.length - hit.length) + '件が違う番線');
ok('大半の予約が指定どおりに効く', done.length >= res.length * 0.8, done.length + ' / ' + res.length);
ok('取りやめは待ちの上限 (5分) でだけ起き、理由が残る',
   failed.every(x => /5分|通過|向き|進路/.test(x.t.trackChangeReservation.note || '')),
   failed.map(x => x.t.trackChangeReservation.note).join(' / '));
ok('予約で止まり続ける列車が無い (待ちの上限 + 余裕)', res.every(x => x.maxStuck <= 600),
   Math.max(0, ...res.map(x => x.maxStuck)) + '秒');

// 断るべき予約
{
    const t = game.trains.find(x => x.state === 'running' && x.trackId === 'Up_In');
    const blks = game.trackMgr.blocks[t.trackId];
    let behind = null;
    for (let i = t.currBlockIndex - t.dir; i >= 0 && i < blks.length; i -= t.dir) {
        const b = blks[i];
        if (b.x !== -1000 && isRealStationBlock(b)) { behind = blockStationName(b); break; }
    }
    const ahead = trainStationsAhead(game, t, 4)[2];
    const r1 = behind ? game.applyCommand({ name: 'trackChange', trainId: t.id, station: behind, trackId: t.trackId, lane: 0 }) : { ok: false, msg: '-' };
    const r2 = game.applyCommand({ name: 'trackChange', trainId: t.id, station: ahead, trackId: t.trackId.replace('Up', 'Down'), lane: 0 });
    const r3 = game.applyCommand({ name: 'trackChange', trainId: t.id, station: ahead, trackId: t.trackId, lane: 99 });
    ok('通過済みの駅は断る', !r1.ok && /通り過ぎ/.test(r1.msg), r1.msg);
    ok('反対方向の番線は断る', !r2.ok && /上り列車|下り列車/.test(r2.msg), r2.msg);
    ok('無い番線は断る', !r3.ok, r3.msg);
}

// その駅に居る列車のその場での転線
{
    const t = game.trains.find(x => x.state === 'stopped' && x.isFinalStop === false &&
        isRealStationBlock(game.trackMgr.blocks[x.trackId][x.currBlockIndex]) &&
        trackChangeCandidates(game, x, blockStationName(game.trackMgr.blocks[x.trackId][x.currBlockIndex]))
            .filter(o => !o.disabled && !/在線/.test(o.text) && o.value !== x.trackId + ',' + x.lane).length > 0);
    if (t) {
        const st = blockStationName(game.trackMgr.blocks[t.trackId][t.currBlockIndex]);
        const o = trackChangeCandidates(game, t, st).filter(o => !o.disabled && !/在線/.test(o.text) &&
                                                                 o.value !== t.trackId + ',' + t.lane)[0];
        const [tid, ln] = o.value.split(',');
        const r = game.applyCommand({ name: 'trackChange', trainId: t.id, station: st, trackId: tid, lane: +ln });
        ok('停車中の列車はその場で転線する', r.ok && t.trackId === tid && t.lane === +ln &&
           game.trackMgr.blocks[tid][t.currBlockIndex].lanes[+ln] === t, `${t.trainNo} ${st} → ${o.text}: ${r.msg}`);
    } else {
        console.log('  (停車中で空き番線のある列車が見つからなかったので、その場の転線は見ない)');
    }
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
