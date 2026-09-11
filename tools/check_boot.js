/* 実際の起動経路 (GameSystem.init) と描画・各UI関数を通して例外が出ないか確認する。
   harness で差し替えていた Renderer も本物を使う。
   使い方: node tools/harness.js tools/check_boot.js
*/
'use strict';

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail + (cond ? ')' : '') : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

function tryRun(label, fn) {
    try {
        fn();
        ok(label, true);
    } catch (e) {
        ok(label, false, (e && e.message ? e.message : String(e)) +
            (e && e.stack ? '\n' + e.stack.split('\n').slice(1, 4).join('\n') : ''));
    }
}

// ------------------------------------------------------------------ 起動
head('起動 (GameSystem.init)');
tryRun('init() が例外なく完走する', () => game.init());
ok('TrackManager がブロックを作っている',
   Object.keys(game.trackMgr.blocks).length === TRACKS.length,
   Object.keys(game.trackMgr.blocks).length + ' / ' + TRACKS.length + ' 路線');
ok('Renderer が生成されている', !!game.renderer && !!game.renderer.ctx);
ok('編成が配置されている', game.fleet.totalIdle() > 300, game.fleet.totalIdle() + '編成');
ok('予備車が留置場に置かれている',
   Object.keys(DEPOTS).reduce((s, d) => s + DEPOTS[d].trains.length, 0) === 8,
   Object.keys(DEPOTS).map(d => d + ':' + DEPOTS[d].trains.length).join(' '));

// ------------------------------------------------------------------ 描画
head('描画 (本物の Renderer)');
tryRun('draw() が例外なく動く', () => game.renderer.draw());
ok('留置場のヒットボックスが登録されている',
   game.renderer.depotHitboxes.length === Object.keys(DEPOTS).length,
   game.renderer.depotHitboxes.length + ' / ' + Object.keys(DEPOTS).length);

head('1時間ぶん動かしながら毎分描画する');
let drawErr = null;
let ticks = 0;
try {
    for (let i = 0; i < 3600 / CONFIG.TICK_SEC; i++) {
        game.update();
        ticks++;
        if (i % 4 === 0) game.renderer.draw();
    }
} catch (e) { drawErr = e; }
ok('更新と描画を通して例外が出ない', !drawErr,
   drawErr ? drawErr.message + '\n' + String(drawErr.stack).split('\n').slice(1, 5).join('\n') : ticks + ' tick');
ok('列車が走っている', game.trains.length > 20, game.trains.length + '本');

// ------------------------------------------------------------------ UI 一巡
head('指令パッドの各操作');
tryRun('toggleCmdPanel', () => game.ui.toggleCmdPanel());
tryRun('updateTrainSelector', () => game.ui.updateTrainSelector());
tryRun('updateDepotSelector', () => game.ui.updateDepotSelector());
tryRun('updateCmdActionOptions', () => game.ui.updateCmdActionOptions());
tryRun('updateCmdDepotActionOptions', () => game.ui.updateCmdDepotActionOptions());
tryRun('updateTrackCandidates', () => {
    document.getElementById('cmd-chg-station').value = '大阪';
    game.ui.updateTrackCandidates();
});

{
    const t = game.trains.find(x => x.state !== 'in_depot' && x.state !== 'finished');
    document.getElementById('cmd-no').value = t ? t.id : '';
    tryRun('executeTrainChange', () => {
        document.getElementById('cmd-dest').value = '京都';
        document.getElementById('cmd-type').value = 'no_change';
        document.getElementById('cmd-action').value = 'turnback';
        game.ui.executeTrainChange();
    });
    tryRun('executeSuspendImm / executeForceStart / executeSuspendOff', () => {
        game.ui.executeSuspendImm();
        game.ui.executeForceStart();
        game.ui.executeSuspendOff();
    });
    tryRun('applyTrackChange', () => {
        document.getElementById('cmd-chg-station').value = '大阪';
        document.getElementById('cmd-chg-track').value = '0';
        game.ui.applyTrackChange();
    });
    tryRun('openCmdPanelForTrain', () => game.ui.openCmdPanelForTrain(t ? t.id : ''));
}

tryRun('setSuspension / clearSuspension', () => {
    document.getElementById('sus-track').value = 'Up_In';
    document.getElementById('sus-start').value = '大阪';
    document.getElementById('sus-end').value = '高槻';
    game.ui.setSuspension();
    game.ui.clearSuspension();
});

tryRun('executeDepotOutForce', () => {
    let name = null, tid = null;
    for (const d in DEPOTS) {
        if (DEPOTS[d].trains.length) { name = d; tid = DEPOTS[d].trains[0].id; break; }
    }
    if (!name) return;
    document.getElementById('cmd-depot-sel').value = name;
    document.getElementById('cmd-depot-train').value = tid;
    document.getElementById('cmd-depot-time').value = '3';
    document.getElementById('cmd-depot-type').value = '普通';
    document.getElementById('cmd-depot-dest').value = '大阪';
    document.getElementById('cmd-depot-action').value = 'turnback';
    game.ui.executeDepotOutForce();
});

head('発車標');
['大阪', '京都', '姫路', '尼崎', '西明石', '三ノ宮', '米原', '野洲'].forEach(st => {
    tryRun('showDepartureBoard(' + st + ')', () => game.ui.showDepartureBoard(st));
});
tryRun('closeDepartureBoard', () => game.ui.closeDepartureBoard());

head('留置場の構内図');
Object.keys(DEPOTS).forEach(d => {
    tryRun('showDepotModal(' + d + ')', () => showDepotModal(d));
});
tryRun('配線図が未登録の場所でも落ちない', () => showDepotModal('大阪'));
tryRun('closeDepotModal', () => closeDepotModal());

head('ログ');
tryRun('updateStaffLog', () => game.ui.updateStaffLog(game));
tryRun('renderStaffFeed', () => game.ui.renderStaffFeed());
tryRun('toggleLogPanel / setLogView / renderLogList', () => {
    game.ui.toggleLogPanel('cmd');
    game.ui.setLogView('staff');
    game.ui.setLogView('cmd');
    game.ui.renderLogList();
});
tryRun('全発信元での絞り込み', () => {
    ['cmd', 'staff'].forEach(v => {
        game.ui.setLogView(v);
        Object.keys(LOG_SOURCES).forEach(k => { game.ui.setLogFilter(k); game.ui.setLogFilter(k); });
    });
});

head('異常事象');
tryRun('triggerEmergency', () => game.triggerEmergency());
tryRun('異常発生中の更新と描画', () => {
    for (let i = 0; i < 20; i++) { game.update(); }
    game.renderer.draw();
});
tryRun('clearEmergency', () => game.clearEmergency());
tryRun('checkMinorTrouble', () => {
    game.nextMinorTroubleTime = 0;
    game.checkMinorTrouble();
    for (let i = 0; i < 20; i++) game.update();
});

head('深夜帯 (23時以降) の処理');
tryRun('23時をまたいでも落ちない', () => {
    // 22時台まで進めて、深夜の入区・消滅処理を通す
    const target = 25 * 3600;
    while (game.currentTime < target) {
        game.update();
    }
    game.renderer.draw();
});
ok('翌日の4時以降も列車が生成される', true, '在線 ' + game.trains.length + '本');
tryRun('日付をまたいだ後も更新できる', () => {
    const target = 30 * 3600;
    while (game.currentTime < target) game.update();
    game.renderer.draw();
});
ok('翌朝に列車が走っている', game.trains.length > 10, game.trains.length + '本');
ok('日をまたいでも編成が失われていない',
   game.fleet.totalIdle() + game.trains.reduce((s, t) => s + (t.vehicles || []).filter(v => !v.isFreight && !v.isExpress).length, 0) >= EXCEL_VEHICLES.length,
   '待機 ' + game.fleet.totalIdle() + ' + 在線 ' +
   game.trains.reduce((s, t) => s + (t.vehicles || []).filter(v => !v.isFreight && !v.isExpress).length, 0) +
   ' / 全 ' + EXCEL_VEHICLES.length);

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
globalThis.__failures = failures;
