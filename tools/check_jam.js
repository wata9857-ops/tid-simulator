/* 詰まりの見張り (js/38f-congestion-control.js)・指令パッドの「その場で」の処置・渡り線の救済の確認。
   使い方: node tools/harness.js --seed=20260922 tools/check_jam.js */
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
const fails = [];
function ok(c, msg, extra) { console.log((c ? '  OK   ' : '  NG   ') + msg + (extra !== undefined ? '  (' + extra + ')' : '')); if (!c) fails.push(msg); }

let stuckTicks = 0, activeTicks = 0;
__run(10 * 3600, () => {});
const g = game;
const pickAt = (pred) => g.trains.find(t => t.state !== 'finished' && t.state !== 'in_depot' && !t.overnightStable && pred(t));
const atStation = (t) => { const b = g.trackMgr.blocks[t.trackId][t.currBlockIndex]; return b && isRealStationBlock(b); };

// 1. 当駅で打ち切り
const a = pickAt(t => t.type === '普通' && /^(Up|Down)_In$/.test(t.trackId) && atStation(t) && t.dest !== blockStationName(g.trackMgr.blocks[t.trackId][t.currBlockIndex]));
const ra = a ? g.applyCommand({ name: 'terminateHere', trainId: a.id }) : { ok: false, msg: 'no train' };
console.log('  打ち切り: ' + ra.msg);
ok(ra.ok, '当駅で打ち切りが効く');
// 2. 回送に変更
const b = pickAt(t => t.type === '快速' && t !== a);
const rb = b ? g.applyCommand({ name: 'deadheadHere', trainId: b.id }) : { ok: false, msg: 'no train' };
console.log('  回送: ' + rb.msg);
ok(rb.ok && b.type === '回送' && /^回/.test(b.trainNo), '回送に変更が効く', b && b.trainNo);
// 3. その場で折り返し
const c = pickAt(t => t.type === '普通' && t !== a && /^(Up|Down)_(In|Out)$/.test(t.trackId) && t.startName && STATION_MAP[t.startName] !== undefined);
const dir0 = c ? c.dir : 0, no0 = c ? c.trainNo : '';
const rc = c ? g.applyCommand({ name: 'turnbackHere', trainId: c.id }) : { ok: false, msg: 'no train' };
console.log('  折り返し: ' + rc.msg);
ok(rc.ok, 'その場で折り返しが効く');

const trackA = { id: a && a.id }, trackC = { id: c && c.id };
__run(4 * 3600, (gg) => {
    for (const t of gg.trains) {
        if (t.state === 'finished' || t.state === 'in_depot' || t.overnightStable) continue;
        activeTicks++;
        if ((t.stuckTime || 0) > 60) stuckTicks++;
    }
});
ok(c && (c.state === 'finished' || c.state === 'in_depot' || c.dir !== dir0 || c.trainNo !== no0), '折り返しを指示した列車が折り返した (または入区した)', c && (c.trainNo + ' dir ' + dir0 + '→' + c.dir + ' ' + c.state));
ok(a && (a.state === 'finished' || a.state === 'in_depot' || a.stuckTime < 600), '打ち切った列車が止まったままにならない', a && (a.trainNo + ' ' + a.state + ' stuck ' + a.stuckTime));

const jc = g.jamControl;
console.log('  詰まりの見張り: ' + JSON.stringify(jc ? jc.stats : null));
console.log('  渡り線の救済: ' + JSON.stringify(g.reliefStats || {}));
ok(!!jc, '詰まりの見張りが動いている');
ok(stuckTicks / Math.max(1, activeTicks) < 0.15, '1分以上動けない列車の割合が15%未満', (100 * stuckTicks / Math.max(1, activeTicks)).toFixed(1) + '%');
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
