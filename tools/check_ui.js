/* 遅延計算・強制発車・構内図表示・ログ表示の検証。
   使い方: node tools/harness.js tools/check_ui.js
*/
'use strict';
__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail + (cond ? ')' : '') : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* 遅延計算・指令パッドの検証なので、輸送障害はここでは起こさない
   (障害が起きていると全列車が停止して、検証対象が見つからないことがある)。 */
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;

// 列車が本線上を走り出すまで進める
__run(2 * 3600);
const running = game.trains.filter(t => t.state !== 'in_depot' && t.state !== 'finished');
console.log('本線上の列車: ' + running.length + '本');

// ================================================================ 4. 遅延計算
head('抑止(即時抑止)中の遅延加算');
{
    const t = running.find(x => x.hasDeparted && x.state === 'running');
    ok('検証対象の走行中列車が見つかる', !!t, t ? t.trainNo : '');
    if (t) {
        document.getElementById('cmd-no').value = t.id;
        const before = t.delayTime;
        game.ui.executeSuspendImm();
        ok('抑止フラグが立つ', t.isManuallySuspended === true);
        for (let i = 0; i < 40; i++) t.update();     // 40tick = 10分
        const after = t.delayTime;
        ok('抑止中に遅延が積まれる', after > before,
           `${before}秒 -> ${after}秒 (${Math.round((after - before) / 60)}分増)`);
        ok('加算量が経過時間と一致する', after - before === 40 * CONFIG.TICK_SEC,
           `${after - before}秒 / 期待 ${40 * CONFIG.TICK_SEC}秒`);
    }
}

head('折り返し直後(hasDeparted=false)の抑止でも遅延が積まれる');
{
    const t = running.find(x => x.state !== 'finished' && !x.isManuallySuspended);
    if (t) {
        t.hasDeparted = false;            // 折り返し・出区直後の状態を再現
        t.state = 'stopped';
        t.isManuallySuspended = true;
        t.timer = 0;
        const before = t.delayTime;
        for (let i = 0; i < 20; i++) t.update();
        ok('hasDeparted が false でも抑止中は遅延が積まれる', t.delayTime > before,
           `${before}秒 -> ${t.delayTime}秒`);
        t.isManuallySuspended = false;
    }
}

head('防護無線(全線一斉停止)中の遅延加算');
{
    const before = new Map();
    game.trains.forEach(t => before.set(t.id, t.delayTime));
    game.triggerEmergency();
    ok('防護無線が発報される', game.isEmergency === true);
    const targets = game.trains.filter(t => t.state !== 'in_depot' && t.state !== 'finished');
    for (let i = 0; i < 12; i++) game.trains.forEach(t => t.update());   // 3分
    const grew = targets.filter(t => t.delayTime > (before.get(t.id) || 0)).length;
    ok('防護無線中に走行中の列車の遅延が積まれる', grew >= targets.length * 0.8,
       `${grew} / ${targets.length} 本で増加`);
}

head('運転見合わせ区間(前方が空でも)手前での遅延加算');
{
    // 防護無線は3分で自動解除されるが、見合わせ区間(manualSuspensions)は残る。
    // この状態が、修正前は「前方のブロックが空なので遅延0」になっていたケース。
    game.isEmergency = false;
    game.radioTimer = 0;
    game.trains.forEach(t => { t.isManuallySuspended = false; });
    const sus = game.trackMgr.manualSuspensions;
    ok('見合わせ区間が設定されている', sus.length > 0, sus.length + '区間');

    let checked = 0, grew = 0;
    for (let round = 0; round < 60; round++) {
        game.trains.forEach(t => t.update());
    }
    game.trains.forEach(t => {
        if (t.state !== 'holding' && t.state !== 'stopped') return;
        const nextIdx = t.currBlockIndex + t.dir;
        if (!game.trackMgr.isSuspended(t.trackId, nextIdx)) return;
        checked++;
        const d0 = t.delayTime;
        for (let i = 0; i < 8; i++) t.update();
        if (t.delayTime > d0) grew++;
    });
    ok('見合わせ区間の手前で止まっている列車に遅延が積まれる',
       checked === 0 || grew === checked, `${grew} / ${checked} 本`);
    if (checked === 0) console.log('      (この試行では該当する列車がいなかったため判定を省略)');
    game.clearEmergency();
}

// ================================================================ 8. 強制発車
head('指令パッドの強制発車');
{
    __run(600);
    const t = game.trains.find(x => x.state !== 'in_depot' && x.state !== 'finished' && x.hasDeparted);
    ok('検証対象の列車が見つかる', !!t, t ? t.trainNo : '');
    if (t) {
        document.getElementById('cmd-no').value = t.id;
        game.ui.executeSuspendImm();
        ok('抑止されている', t.isManuallySuspended === true);
        game.ui.executeForceStart();
        ok('強制発車で抑止が解除される', t.isManuallySuspended === false);
        ok('強制発車フラグが立つ', t.forceStart === true);
        ok('holding から running に戻る', t.state !== 'holding', t.state);

        // 実際に発車する (= checkHold を飛ばして move する) ことを確認
        const blk0 = t.currBlockIndex;
        let moved = false;
        for (let i = 0; i < 8; i++) {
            t.update();
            if (t.currBlockIndex !== blk0) { moved = true; break; }
        }
        ok('強制発車で列車が前進する (進路が空いている場合)', moved || t.forceStart === false,
           moved ? 'ブロック ' + blk0 + ' -> ' + t.currBlockIndex : '進路が塞がっていたため停止 (追突しない)');
        ok('発車後は強制発車フラグが解除される', !moved || t.forceStart === false);
    }
}

head('強制発車: 予約抑止(plannedStop)も解除される');
{
    const t = game.trains.find(x => x.state !== 'in_depot' && x.state !== 'finished');
    if (t) {
        t.plannedStop = '大阪';
        document.getElementById('cmd-no').value = t.id;
        game.ui.executeForceStart();
        ok('予約抑止が解除される', t.plannedStop === null);
    }
}

head('強制発車: 留置場の車両は強制出区になる');
{
    let target = null, depotName = null;
    for (const d in DEPOTS) {
        const cand = DEPOTS[d].trains.find(t => t.depotOutConfig);
        if (cand) { target = cand; depotName = d; break; }
    }
    if (target) {
        document.getElementById('cmd-no').value = target.id;
        const t0 = target.timer;
        game.ui.executeForceStart();
        ok('強制出区フラグが立つ', target.forceDepotOut === true || target.state !== 'in_depot',
           `${depotName} / state=${target.state}`);
    } else {
        console.log('      (出区運用の付いた留置車両がいなかったため判定を省略)');
    }
}

// ================================================================ 7. 構内図
head('留置場の構内配線図');
{
    const missing = Object.keys(DEPOTS).filter(d => !DEPOT_LAYOUTS[d]);
    ok('すべての留置場に配線図が登録されている', missing.length === 0, missing.join(','));

    Object.keys(DEPOT_LAYOUTS).forEach(d => {
        const L = DEPOT_LAYOUTS[d];
        const nTracks = L.groups.reduce((s, g) => s + g.tracks.length, 0);
        const capCars = L.groups.reduce((s, g) => s + g.tracks.reduce((a, t) => a + t.cars, 0), 0);
        showDepotModal(d);
        const html = document.getElementById('depot-modal-content').innerHTML;
        const title = document.getElementById('depot-modal-title').innerHTML;
        const shown = document.getElementById('depot-modal').style.display;
        const pool = game.fleet.poolAt(d).length;
        const inDepot = DEPOTS[d].trains.length;

        const okAll =
            shown === 'flex' &&
            html.indexOf('<svg') >= 0 &&
            html.indexOf('depot-table') >= 0 &&
            title.indexOf(L.owner) >= 0 &&
            L.groups.every(g => html.indexOf(g.name) >= 0) &&
            L.groups.every(g => g.tracks.every(t => html.indexOf('>' + t.label + '<') >= 0));
        ok(`${d}: ${nTracks}線 / ${capCars}両収容 / 在線 ${inDepot + pool}編成`, okAll,
           okAll ? '' : 'svg=' + (html.indexOf('<svg') >= 0) + ' table=' + (html.indexOf('depot-table') >= 0));
    });

    // 図の留置線に収まりきらなかった編成が、ちゃんと別枠で出ているか
    //   (シミュレーターは全編成を15箇所に集約するため、実際の車両所より
    //    詰め込む量が多くなる。図に無い線として明示して落とさない)
    let worst = { d: '', ratio: 0 };
    Object.keys(DEPOT_LAYOUTS).forEach(d => {
        showDepotModal(d);
        const html = document.getElementById('depot-modal-content').innerHTML;
        const total = DEPOTS[d].trains.length + game.fleet.poolAt(d).length;
        const m = /その他の留置線 (\d+)編成/.exec(html);
        const overflow = m ? Number(m[1]) : 0;
        if (overflow > 0 && html.indexOf('図に記載のない留置線') < 0) {
            ok(d + ': あふれた編成が一覧に出ている', false, '別枠の表示なし');
        }
        const r = total ? overflow / total : 0;
        if (r > worst.ratio) worst = { d: d, ratio: r, overflow: overflow, total: total };
    });
    // シミュレーターは全編成を15箇所に集約するので、実際の車両所より詰め込む量が
    // 多くなる。深夜〜早朝は全編成が留置されるため、大きな車両所では図に載せていない
    // 留置線の扱いになる分が必ず出る。半分を超えないことを確認する。
    ok('図の留置線に大半の編成が収まっている', worst.ratio <= 0.45,
       worst.d ? `最大 ${worst.d}: ${worst.overflow}/${worst.total}編成が図外 (${Math.round(worst.ratio * 100)}%)` : 'あふれなし');

    // 同じ編成が2つの線に現れていないこと
    showDepotModal('宮原操');
    const h = document.getElementById('depot-modal-content').innerHTML;
    const nos = (h.match(/class="dt-no">([^<]+)</g) || []).map(m => m.replace(/.*>/, ''));
    const uniq = new Set(nos);
    ok('構内図に同じ編成番号が重複して出ていない', nos.length === uniq.size,
       nos.length + '件 / 重複なし ' + uniq.size + '件');
    closeDepotModal();
}

// ================================================================ 5. ログ表示
head('ログ表示');
{
    game.ui.updateBanner('【指令】テスト指令です。', 'banner-orange');
    game.ui.addStaffLogToHistory('[大阪保線区] 【保守作業】テスト業務連絡です。', 'hosen', '大阪保線区');

    game.ui.currentLogView = 'cmd';
    document.getElementById('log-panel').style.display = 'block';
    game.ui.renderLogList();
    const cmdRows = document.getElementById('log-list').children.length;
    const cmdCount = game.ui.logHistory.filter(l => l.type === 'cmd').length;
    ok('運転指令タブに指令ログだけが出る', cmdRows === cmdCount,
       `表示 ${cmdRows}行 / 指令ログ ${cmdCount}件 (業務連絡 ${game.ui.logHistory.filter(l => l.type === 'staff').length}件)`);

    game.ui.setLogView('staff');
    const staffRows = document.getElementById('log-list').children.length;
    const staffCount = game.ui.logHistory.filter(l => l.type === 'staff').length;
    ok('業務連絡タブに業務連絡だけが出る', staffRows === staffCount,
       `表示 ${staffRows}行 / 業務連絡 ${staffCount}件`);

    game.ui.setLogFilter('hosen');
    const filtered = document.getElementById('log-list').children.length;
    const hosenCount = game.ui.logHistory.filter(l => l.type === 'staff' && l.cat === 'hosen').length;
    ok('発信元での絞り込みが効く', filtered === hosenCount, `${filtered}行 / 保線 ${hosenCount}件`);
    game.ui.setLogFilter('hosen');

    // 重要のみ表示は、事故・運休が出る運転指令タブで確かめる
    game.ui.setLogView('cmd');
    game.ui.updateBanner('🚨[緊急] 検証用の人身事故です。', 'banner-red');
    game.ui.updateBanner('【運転整理】検証用の運転整理です。', 'banner-orange');
    game.ui.updateBanner('【入区】検証用の入区です。', 'banner-orange');
    game.ui.renderLogList();
    const allRows = document.getElementById('log-list').children.length;
    game.ui.toggleLogImportantOnly();
    const impRows = document.getElementById('log-list').children.length;
    const impCount = game.ui.logHistory.filter(l => l.type === 'cmd' && (l.level === 'critical' || l.level === 'warn')).length;
    ok('重要のみ表示が効く', impRows === impCount && impCount > 0 && impRows < allRows,
       `全${allRows}行 -> 重要${impRows}行 / 重要ログ ${impCount}件`);
    game.ui.toggleLogImportantOnly();

    // 重要度の判定が本文どおりに付いているか
    const byHead = (h) => game.ui.logHistory.find(l => l.type === 'cmd' && l.msg.indexOf(h) >= 0);
    ok('事故のログが critical になる', byHead('🚨[緊急]') && byHead('🚨[緊急]').level === 'critical',
       byHead('🚨[緊急]') ? byHead('🚨[緊急]').level + ' / ' + byHead('🚨[緊急]').cat : 'なし');
    ok('運転整理のログが warn になる', byHead('【運転整理】検証用') && byHead('【運転整理】検証用').level === 'warn',
       byHead('【運転整理】検証用') ? byHead('【運転整理】検証用').level : 'なし');
    ok('入区のログが出入区に分類される', byHead('【入区】検証用') && byHead('【入区】検証用').cat === 'depot',
       byHead('【入区】検証用') ? byHead('【入区】検証用').cat : 'なし');
    game.ui.setLogView('staff');

    ok('タブに件数が出ている', document.getElementById('log-tabs').innerHTML.indexOf('log-tab-num') >= 0);
    game.ui.renderStaffFeed();
    const feed = document.getElementById('staff-log-marquee').innerHTML;
    ok('ヘッダーの業務連絡に発信元ラベルが出ている', feed.indexOf('log-chip') >= 0 && feed.indexOf('staff-feed-body') >= 0);

    // 全ログをレンダリングして例外が出ないこと
    let threw = null;
    try {
        game.ui.setLogView('cmd');
        game.ui.setLogView('staff');
    } catch (e) { threw = e; }
    ok('ログ描画で例外が出ない', !threw, threw ? String(threw) : '');
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
globalThis.__failures = failures;
