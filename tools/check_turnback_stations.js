/* 配線で折り返せる駅が、指令の行先変更と運転整理で本当に使えるかを見る。
   使い方: node tools/harness.js --seed=20260922 tools/check_turnback_stations.js

   ■ 見ること
     1. 行先変更の候補は線路の定義から作られ、甲子園口・吹田が入っている
     2. 甲子園口へ向かう下り列車を「大阪行き」にすると、甲子園口の折返線 (2番) に入り、
        上り内側線へ出ていく
     3. 吹田へ向かう上り列車を「大阪行き」にすると、吹田で折り返して下り内側線へ出ていく
     4. 京都方から吹田へ向かう下り列車を「吹田止まり」にはできない (渡り線は大阪方ののどにある)
     5. どの駅でも、その向きに着いた列車が折り返せない駅では折り返していない
*/
'use strict';
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
__run(4 * 3600);    // 8:00

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : ''));
    if (!cond) failures++;
}

const cand = dispatchDestinationCandidates();
ok('行先変更の候補に 甲子園口・吹田 がある', cand.indexOf('甲子園口') >= 0 && cand.indexOf('吹田') >= 0,
   cand.length + '駅');
ok('候補の駅はすべてどちらかの向きで折り返せる',
   cand.every(n => DISPATCH_OFF_DIAGRAM_DESTS.indexOf(n) >= 0 || canReverseAt(n)));

/** 駅 st へ、線路 trackId の上を dir の向きで近づいている列車 (駅の 1〜6 閉塞手前) */
function approaching(st, trackId, types) {
    const idx = STATION_MAP[st] * UNITS_PER_STATION;
    const dir = trackDirOf(trackId);
    return game.trains.filter(t => t.trackId === trackId && t.state !== 'finished' &&
        t.state !== 'in_depot' && types.indexOf(t.type) >= 0 &&
        (idx - t.currBlockIndex) * dir >= 1 && (idx - t.currBlockIndex) * dir <= 6 &&
        t.dest !== st);
}

function follow(t, st, ticks) {
    const seen = { lanes: new Set(), leftOn: null, reversed: false };
    const dir0 = t.dir;
    for (let i = 0; i < ticks; i++) {
        game.update();
        const b = game.trackMgr.blocks[t.trackId] && game.trackMgr.blocks[t.trackId][t.currBlockIndex];
        if (b && blockStationName(b) === st) seen.lanes.add(platformLabelOf(st, t.trackId, t.lane));
        if (t.dir !== dir0) seen.reversed = true;
        if (seen.reversed && !seen.leftOn && b && blockStationName(b) !== st) { seen.leftOn = seen.lastInSt; break; }
        if (seen.reversed && b && blockStationName(b) === st) seen.lastInSt = t.trackId;
        if (t.state === 'finished') break;
    }
    return seen;
}

function tryCase(label, st, trackId, newDest, wantLane, wantOut) {
    let done = false;
    for (let round = 0; round < 40 && !done; round++) {
        const list = approaching(st, trackId, ['普通', '快速']);
        for (const t of list) {
            const r = game.applyCommand({ name: 'change', trainId: t.id, dest: newDest, type: 'no_change' });
            if (!r.ok) continue;
            if (!t.serviceChange || t.serviceChange.at !== st) { continue; }
            const s = follow(t, st, 240);
            ok(label + ' … ' + t.trainNo + ' が ' + st + ' で折り返した', s.reversed, [...s.lanes].join('・'));
            if (wantLane) ok(label + ' … ' + st + ' の ' + wantLane + '番に入った', s.lanes.has(wantLane), [...s.lanes].join('・'));
            ok(label + ' … ' + wantOut + ' から出ていった', s.leftOn === wantOut, String(s.leftOn));
            done = true;
            break;
        }
        if (!done) __run(300);
    }
    if (!done) ok(label + ' … 試せる列車が見つかった', false);
}

tryCase('甲子園口 (折返線)', '甲子園口', 'Down_In', '大阪', '2', 'Up_In');
tryCase('吹田 (大阪方の両渡り)', '吹田', 'Up_In', '大阪', null, 'Down_In');

// 京都方から来る下り列車は吹田止まりにできない
{
    let tested = false;
    for (let round = 0; round < 20 && !tested; round++) {
        const t = approaching('吹田', 'Down_In', ['普通'])[0];
        if (!t) { __run(300); continue; }
        const r = game.applyCommand({ name: 'change', trainId: t.id, dest: '吹田', type: 'no_change' });
        ok('京都方からの下り列車は吹田止まりにできない', !r.ok, r.msg);
        tested = true;
    }
    if (!tested) ok('吹田へ向かう下り列車が見つかった', false);
}

// 1日のうち、着いた向きで折り返せない駅で折り返していないか
{
    const bad = {};
    const prev = new Map();
    __run(8 * 3600, () => {
        for (const t of game.trains) {
            if (t.state === 'finished' || t.state === 'in_depot') continue;
            const b = game.trackMgr.blocks[t.trackId] && game.trackMgr.blocks[t.trackId][t.currBlockIndex];
            const st = b && isRealStationBlock(b) ? blockStationName(b) : null;
            const p = prev.get(t.id);
            prev.set(t.id, { st, dir: t.dir });
            if (!p || !st || p.st !== st || p.dir === t.dir) continue;
            if (t.type === '貨物' || isFreightTerminalTrack(t.trackId)) continue;
            if (!canReverseAtDir(st, p.dir)) bad[st + (p.dir === 1 ? ' 上り' : ' 下り')] = (bad[st + (p.dir === 1 ? ' 上り' : ' 下り')] || 0) + 1;
        }
    });
    const keys = Object.keys(bad);
    ok('着いた向きで折り返せない駅で折り返していない', keys.length === 0, keys.map(k => k + '×' + bad[k]).join(' '));
}

console.log(failures ? ('\n不合格 ' + failures + '件') : '\nすべて合格');
