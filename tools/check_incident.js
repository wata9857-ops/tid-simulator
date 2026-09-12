/* 輸送障害 (js/26-incidents.js) と信号 (js/25-signals.js) を検証する。
   使い方: node tools/harness.js tools/check_incident.js
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

// 列車をある程度走らせてから試す
__run(3600);

// ------------------------------------------------------------------ 信号
head('信号現示');
ok('信号の仕組みがある', !!game.signals);
const tid = 'Up_In';
const blks = game.trackMgr.blocks[tid];
const free = blks.find(b => b.x !== -1000 && b.lanes.every(l => l === null) &&
    blks[b.index + 1] && blks[b.index + 1].x !== -1000 && blks[b.index + 1].lanes.every(l => l === null) &&
    blks[b.index + 2] && blks[b.index + 2].x !== -1000 && blks[b.index + 2].lanes.every(l => l === null) &&
    blks[b.index + 3] && blks[b.index + 3].x !== -1000 && blks[b.index + 3].lanes.every(l => l === null));
ok('空いている閉塞の前方は進行(G)', !!free && game.signals.aspectFor(tid, free.index, 1) === 'G',
   free ? game.signals.aspectFor(tid, free.index, 1) : '空き閉塞が見つからない');

// 在線させて現示が落ちるか
if (free) {
    const dummy = { fake: true };
    // 4閉塞先を埋める -> 進行のまま
    blks[free.index + 3].lanes[0] = dummy;
    ok('3閉塞先に在線なら進行(G)', game.signals.aspectFor(tid, free.index, 1) === 'G',
       game.signals.aspectFor(tid, free.index, 1));
    blks[free.index + 2].lanes[0] = dummy;
    ok('2閉塞先に在線なら減速(YG)', game.signals.aspectFor(tid, free.index, 1) === 'YG',
       game.signals.aspectFor(tid, free.index, 1));
    blks[free.index + 1].lanes[0] = dummy;
    ok('1閉塞先に在線なら注意(Y)', game.signals.aspectFor(tid, free.index, 1) === 'Y',
       game.signals.aspectFor(tid, free.index, 1));
    // 進入先の全ての番線が塞がってはじめて停止現示になる (空き番線があれば進入できる)
    for (let l = 0; l < blks[free.index].lanes.length; l++) blks[free.index].lanes[l] = dummy;
    ok('直前の閉塞が満線なら停止(R)', game.signals.aspectFor(tid, free.index, 1) === 'R',
       game.signals.aspectFor(tid, free.index, 1));
    // 片付け
    for (let k = 0; k <= 3; k++) {
        blks[free.index + k].lanes = blks[free.index + k].lanes.map(l => l === dummy ? null : l);
    }
}

// 信号故障で停止現示になるか
const target = blks.find(b => b.x !== -1000 && b.isStation);
game.signals.addFault(tid, target.index, target.index + 2, '検証用');
ok('障害を登録すると停止現示になる', game.signals.aspectFor(tid, target.index, 1) === 'R',
   game.signals.aspectFor(tid, target.index, 1));
ok('障害の理由が引ける', game.signals.faultReason(tid, target.index) === '検証用');
game.signals.clearFaults();
ok('障害を解除できる', !game.signals.hasFault(tid, target.index));

// ------------------------------------------------------------------ 輸送障害
head('輸送障害の種類');
console.log('  ' + INCIDENT_TYPES.map(t => t.name).join(' / '));
const need = ['人身事故', '車両故障', '信号設備故障', '転てつ器故障', '架線障害',
              '線路支障', 'ドア故障', '急病人救護', '踏切障害'];
const missing = need.filter(n => !INCIDENT_TYPES.some(t => t.name === n));
ok('必要な種類がそろっている', missing.length === 0, missing.join(','));

head('人身事故の波及');
const beforeSus = game.trackMgr.manualSuspensions.length;
const inc = game.incidents.trigger('jinshin');
ok('人身事故を起こせる', !!inc, inc ? inc.place : '当該列車が見つからない');
if (inc) {
    ok('防護無線が発報される', game.isEmergency === true);
    ok('運転見合わせ区間が設定される', game.trackMgr.manualSuspensions.length > beforeSus,
       (game.trackMgr.manualSuspensions.length - beforeSus) + '区間');
    ok('並走する線路にも波及する',
       new Set(game.trackMgr.manualSuspensions.map(m => m.trackId)).size >= 2,
       [...new Set(game.trackMgr.manualSuspensions.map(m => m.trackId))].join(','));
    ok('見合わせ区間の信号が停止現示になる', (() => {
        const m = game.trackMgr.manualSuspensions.find(x => x.owner === inc.id);
        return m && game.signals.aspectFor(m.trackId, m.start, 1) === 'R';
    })());
    ok('当該列車が停止する', !!inc.train && inc.train.minorTrouble === true,
       inc.train ? inc.train.trainNo + ' ' + inc.train.troubleInfo.cause : '-');
    ok('game.emergencyState に反映される', game.emergencyState.type === 'human',
       game.emergencyState.type + ' / ' + game.emergencyState.location);
}

head('抑止中でも遅れが増えるか');
if (inc && inc.train) {
    const t = inc.train;
    const d0 = t.delayTime;
    __run(600);
    ok('当該列車の遅れが増える', t.delayTime > d0, d0 + '秒 -> ' + t.delayTime + '秒');
}
// 後続列車にも遅れが出ているか
{
    const delayed = game.trains.filter(t => t.delayTime > 120).length;
    ok('後続列車にも遅れが波及する', delayed >= 1, delayed + '本が2分以上の遅れ');
}

head('1時間の上限で必ず復旧するか');
{
    const startCount = game.incidents.active.length;
    // 上限(1時間)を超えるまで走らせる
    __run(INCIDENT_MAX_BLOCK_SEC + 600);
    const stillOld = game.incidents.active.filter(x => (game.currentTime - x.startedAt) > INCIDENT_MAX_BLOCK_SEC);
    ok('1時間を超えて線路を止め続ける輸送障害が無い', stillOld.length === 0,
       stillOld.map(x => x.type.name + ' ' + Math.round((game.currentTime - x.startedAt) / 60) + '分').join(','));
    const leftovers = game.trackMgr.manualSuspensions.filter(m => m.owner &&
        !game.incidents.active.some(a => a.id === m.owner));
    ok('復旧済みの見合わせ区間が残っていない', leftovers.length === 0, leftovers.length + '区間');
}

head('復旧後の徐行と遅れの残り方');
{
    game.incidents.clearAll('検証');
    const i2 = game.incidents.trigger('kasen');
    if (i2) {
        // 復旧まで進める
        let guard = 0;
        while (game.incidents.active.indexOf(i2) >= 0 && guard++ < 600) __run(CONFIG.TICK_SEC * 10);
        ok('架線障害が復旧する', game.incidents.active.indexOf(i2) < 0);
        ok('復旧後に徐行が残る', game.trackMgr.speedRestrictions.length > 0,
           game.trackMgr.speedRestrictions.length + '区間 ' +
           (game.trackMgr.speedRestrictions[0] ? game.trackMgr.speedRestrictions[0].reason : ''));
        const stillDelayed = game.trains.filter(t => t.delayTime > 60).length;
        ok('復旧後も遅れが残っている', stillDelayed > 0, stillDelayed + '本');
    } else {
        ok('架線障害を起こせる', false, '対象が見つからない');
    }
}

head('個別の障害が線路の状態を変えるか');
[['shingo', '信号設備故障'], ['tentetsu', '転てつ器故障'], ['syaryo', '車両故障'], ['door', 'ドア故障']]
    .forEach(([id, name]) => {
        game.incidents.clearAll('検証');
        game.signals.clearFaults();
        const i3 = game.incidents.trigger(id);
        if (!i3) { ok(name + ' を起こせる', false, '対象が見つからない'); return; }
        const def = INCIDENT_TYPES.find(t => t.id === id);
        if (def.fault) {
            ok(name + ' が信号に障害を起こす', game.signals.faults.length > 0,
               game.signals.faults.length + '件 ' + i3.place);
        } else if (def.needTrain) {
            ok(name + ' が当該列車を止める', !!i3.train && i3.train.minorTrouble,
               i3.train ? i3.train.trainNo + '@' + i3.place : '-');
        }
        game.incidents.clearAll('検証');
    });

head('24時間走らせて破綻しないか');
{
    game.incidents.clearAll('検証');
    game.trackMgr.manualSuspensions = [];
    game.signals.clearFaults();
    let maxActive = 0, thrown = '';
    try {
        for (let i = 0; i < 24 * 3600 / CONFIG.TICK_SEC; i++) {
            game.update();
            maxActive = Math.max(maxActive, game.incidents.active.length);
        }
    } catch (e) { thrown = e && e.message ? e.message : String(e); }
    ok('例外が出ない', thrown === '', thrown);
    console.log('  発生した輸送障害: ' + game.incidents.history.length + '件 / 同時最大 ' + maxActive + '件');
    const names = {};
    game.incidents.history.forEach(h => { names[h.name] = (names[h.name] || 0) + 1; });
    console.log('  内訳: ' + Object.keys(names).map(k => k + '=' + names[k]).join(' '));
    ok('輸送障害が起きている', game.incidents.history.length > 0);
    ok('同時に起きすぎない', maxActive <= 2, maxActive + '件');
    ok('見合わせ区間が積み残っていない',
       game.trackMgr.manualSuspensions.filter(m => m.owner &&
           !game.incidents.active.some(a => a.id === m.owner)).length === 0);
    ok('列車が走り続けている', game.trains.length > 20, game.trains.length + '本');
}

head('運用計画 (出区・送り込み・増発・復旧回送)');
console.log('  出区 ' + game.ops.stats.depotOut + '本 / 送り込み ' + game.ops.stats.backing +
            '本 / 増発 ' + game.ops.stats.gapFill + '本 / 復旧回送 ' + game.ops.stats.recovery + '本');
ok('車両所からの計画出区が行われている', game.ops.stats.depotOut > 20, game.ops.stats.depotOut + '本');
ok('送り込み回送が行われている', game.ops.stats.backing > 0, game.ops.stats.backing + '本');

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
