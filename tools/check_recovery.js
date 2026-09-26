/* 長引く見合わせのあとの「段階的な運転再開」(js/26-incidents.js の RecoveryControl) を検証する。

   使い方: node tools/harness.js --tid --seed=20260922 tools/check_recovery.js

   ■ 利用者の指定
     ・長引く見合わせが起きたら、まず区間の中の列車をすべて抑止する
     ・運転見合わせは正式に解除する
     ・解除したあとも、列車は1本ずつ抑止されたまま
     ・指令が1本ずつ／何本かずつ解除する。しばらくすると別の指令員が引き継ぎ、残りを自動で解除する
     ・利用者に1本ずつの操作を何十回も強いない
   ■ 見ること
     ・抑止中の列車が動かない / 見合わせが解けている
     ・画面の指令員の操作 (先頭1本・3本ずつ) が効く
     ・操作が無いと応援の指令員が引き継ぎ、自動で最後まで解除する
     ・取り残し (抑止が残ったままの列車)・詰まり (区間で長く動けない列車) が出ない
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

// ふだんの輸送障害・大規模障害は止めて、ここで起こすものだけを見る
CONFIG.majorIncidentChance = 0;
game.recovery.majorAt = Infinity;
game.incidents.nextAt = Infinity;
__run(5.5 * 3600);          // 朝ラッシュが終わるころまで走らせる

/** 障害を最後まで進め、計画ができるまで回す */
function runUntilLift(inc, maxSec) {
    let t = 0;
    while (game.incidents.active.indexOf(inc) >= 0 && t < (maxSec || 7200)) { __run(15); t += 15; }
    return t;
}
const planOf = (inc) => game.recovery.plans.find(p => p.incId === inc.id);
const heldTrains = (plan) => plan.held.map(id => game.getTrain(id)).filter(Boolean);

function scenario(label, trigger, opts) {
    head(label);
    game.recovery.manual = !!opts.manual;
    const inc = trigger();
    ok('障害が起きた', !!inc, inc ? inc.place : '起こせる区間が無い');
    if (!inc) return null;
    const heldAtStart = game.trains.filter(t => t.recoveryHold === 'inc:' + inc.id);
    ok('見合わせが始まった時点で区間の列車を抑止した', heldAtStart.length > 0 &&
       heldAtStart.every(t => t.isManuallySuspended), heldAtStart.length + '本');

    // 見合わせのあいだ、抑止した列車は動かない
    const pos0 = new Map(heldAtStart.map(t => [t.id, t.trackId + ':' + t.currBlockIndex]));
    __run(600);
    const moved = heldAtStart.filter(t => t.state !== 'finished' && (t.trackId + ':' + t.currBlockIndex) !== pos0.get(t.id));
    ok('見合わせ中に抑止した列車が動いていない', moved.length === 0, moved.map(t => t.trainNo).join(','));

    runUntilLift(inc);
    const plan = planOf(inc);
    ok('見合わせを解除したあと、運転再開の計画ができた', !!plan, plan ? plan.held.length + '本を抑止継続' : 'なし');
    if (!plan) return null;
    ok('線路の見合わせ (manualSuspensions) は解けている',
       !game.trackMgr.manualSuspensions.some(s => s.owner === inc.id));
    ok('見合わせ中に抑止していた列車は抑止のまま引き継がれた',
       heldAtStart.filter(t => t.state !== 'finished' && t.state !== 'in_depot').every(t => t.recoveryHold === plan.id || !t.isManuallySuspended === false),
       heldAtStart.filter(t => t.recoveryHold !== plan.id && t.state !== 'finished').map(t => t.trainNo).join(','));
    ok('解除のあとも列車は1本ずつ抑止されたまま', heldTrains(plan).every(t => t.isManuallySuspended && t.recoveryHold === plan.id));

    // 手配 (乗務員への通告・点検) のあいだは誰も発車させない
    const n0 = plan.held.length;
    let prepMoved = 0, prepReleased = 0;
    while (plan.mode === 'prep') {
        const before = new Map(heldTrains(plan).map(t => [t.id, t.currBlockIndex]));
        const rel = plan.released;
        __run(15);
        // 手配が済んだその Tick の解除は数えない (手配が済んだあとの解除なので)
        if (plan.mode === 'prep') prepReleased += plan.released - rel;
        heldTrains(plan).forEach(t => { if (before.has(t.id) && before.get(t.id) !== t.currBlockIndex) prepMoved++; });
        if (game.currentTime - plan.startedAt > 900) break;
    }
    ok('運転再開の手配のあいだは抑止の列車が動かない', prepMoved === 0 && prepReleased === 0,
       '動いた ' + prepMoved + ' / 解除 ' + prepReleased);
    return { inc, plan, n0 };
}

function finishAndCheck(r, maxSec) {
    const { plan } = r;
    let t = 0;
    let movedWhileHeld = 0;
    while (game.recovery.plans.indexOf(plan) >= 0 && t < (maxSec || 6000)) {
        const before = new Map(heldTrains(plan).map(x => [x.id, x.trackId + ':' + x.currBlockIndex]));
        __run(15); t += 15;
        heldTrains(plan).forEach(x => {
            if (before.has(x.id) && before.get(x.id) !== x.trackId + ':' + x.currBlockIndex) movedWhileHeld++;
        });
    }
    ok('抑止のあいだに動いた列車が無い', movedWhileHeld === 0, String(movedWhileHeld));
    ok('最後まで解除された (計画が終わった)', game.recovery.plans.indexOf(plan) < 0,
       `残り ${plan.held.length}本 / ${Math.round(t / 60)}分`);
    ok('抑止が残ったままの列車が無い', !game.trains.some(x => x.recoveryHold === plan.id));
    console.log(`  解除 ${plan.released}本 (指令卓 ${plan.manualReleased} / 代行 ${plan.autoReleased}) ` +
                `/ 解除から終わりまで ${Math.round((plan.doneAt - plan.startedAt) / 60)}分`);
    // 終わったあと、区間で長く動けない列車が居ない (詰まり・行き詰まりが無い)
    __run(1800);
    const range = plan.range;
    const stuck = game.trains.filter(x => x.state !== 'finished' && x.state !== 'in_depot' &&
        plan.area.tracks.indexOf(x.trackId) >= 0 && x.currBlockIndex >= range[0] - 3 && x.currBlockIndex <= range[1] + 3 &&
        (x.stuckTime || 0) >= 1200 && !x.minorTrouble);
    ok('終わってから30分後、区間で20分以上動けない列車が居ない', stuck.length === 0,
       stuck.map(x => x.trainNo + '(' + Math.round(x.stuckTime / 60) + '分)').join(','));
    return plan;
}

// ---------------------------------------------------------------- 1. 画面の指令員が操作する
const r1 = scenario('大雨 — 画面の指令員が解除する', () => game.recovery.triggerMajor('rain'), { manual: true });
if (r1) {
    const p = r1.plan;
    ok('手配が済むと画面の指令員の受け持ちになる', p.mode === 'manual', p.mode);
    const streams = game.recovery.streamsOf(p);
    const nStreams = Object.keys(streams).length;
    const heads = Object.keys(streams).map(k => streams[k][0]);
    const rel0 = p.released;
    const res1 = game.dispatch({ name: 'recoveryRelease', plan: p.id, count: 1 });
    ok('「各線 先頭1本」で線路ごとに先頭の列車だけが解除される', res1 && res1.ok &&
       heads.every(t => !t.recoveryHold && !t.isManuallySuspended) && p.released - rel0 === nStreams,
       (res1 && res1.msg) + ` / 線路 ${nStreams}`);
    ok('先頭以外は抑止のまま', Object.keys(streams).every(k => streams[k].slice(1).every(t => t.recoveryHold === p.id)));
    // 内部の自動処理 (指令連絡の代行など) の「強制発車」では順番待ちの列車は動かない
    const inner = heldTrains(p)[0];
    if (inner) {
        const r = game.applyCommand({ name: 'force', trainId: inner.id });
        ok('内部の自動処理の強制発車では抑止が解けない', !r.ok && inner.recoveryHold === p.id, r.msg);
    }
    // 指令卓の個別の「抑止解除」でも解ける (数え直される)
    const one = heldTrains(p)[0];
    if (one) {
        game.dispatch({ name: 'release', trainId: one.id });
        __run(15);
        ok('指令卓の「抑止解除」で個別に解いても計画から外れる', p.held.indexOf(one.id) < 0 && !one.recoveryHold);
    }
    // 以後は何もしない → 応援の指令員が引き継ぐ
    let waited = 0;
    while (p.mode === 'manual' && waited < 3600) { __run(15); waited += 15; }
    ok('操作が無いと応援の指令員が引き継ぐ', p.mode === 'auto' || game.recovery.plans.indexOf(p) < 0,
       `${Math.round(waited / 60)}分後 / ${p.by}`);
    ok('引き継ぎは決めた時間どおり (操作が途絶えてから約8分)', waited <= RECOVERY_RULES.idleSec + 60, Math.round(waited / 60) + '分');
    const m1 = p.manualReleased;
    const big = r1.n0 >= 6;
    finishAndCheck(r1);
    if (big) ok('画面の指令員の操作は数回で済んだ (残りは応援の指令員が解除した)', p.autoReleased > 0 && m1 < p.released,
       `指令卓 ${m1} / 全体 ${p.released}`);
    else console.log(`  (抑止が ${r1.n0}本 と少ないので、操作回数の確認は飛ばす)`);
}

// ---------------------------------------------------------------- 1b. まとめて解除
const r1b = scenario('大雨 — 「3本ずつ」「全列車」でまとめて解除', () => game.recovery.triggerMajor('rain'), { manual: true });
if (r1b) {
    const p = r1b.plan;
    const n = p.held.length;
    const before3 = p.released;
    // 線路の数は解除の前に数える (解除で空になった線路は数えられなくなるため)
    const nStreams = Object.keys(game.recovery.streamsOf(p)).length || 1;
    game.dispatch({ name: 'recoveryRelease', plan: p.id, count: 3 });
    const got3 = p.released - before3;
    ok('「各線 3本ずつ」は1回の操作で複数本を解除する', got3 >= Math.min(n, 2) && got3 <= nStreams * 3 + 2, got3 + '本 / ' + n + '本');
    __run(120);
    game.dispatch({ name: 'recoveryRelease', plan: p.id, count: 'all' });
    __run(15);
    ok('「全列車」で残りをすべて解除できる', game.recovery.plans.indexOf(p) < 0 && !game.trains.some(t => t.recoveryHold === p.id));
    __run(1800);
    const stuck = game.trains.filter(x => x.state !== 'finished' && x.state !== 'in_depot' &&
        p.area.tracks.indexOf(x.trackId) >= 0 && x.currBlockIndex >= p.range[0] - 3 && x.currBlockIndex <= p.range[1] + 3 &&
        (x.stuckTime || 0) >= 1200 && !x.minorTrouble);
    ok('いっせいに解除しても、30分後に区間で20分以上動けない列車が居ない', stuck.length === 0,
       stuck.map(x => x.trainNo).join(','));
}

// ---------------------------------------------------------------- 2. 画面に人がいない (旅客向け画面だけ)
const r2 = scenario('大雪 — 画面の指令員が不在 (当務の指令員が自動で解除)', () => game.recovery.triggerMajor('snow'), { manual: false });
if (r2) {
    const p = r2.plan;
    ok('手配が済むと当務の指令員が受け持つ', p.mode === 'auto', p.mode + ' / ' + p.by);
    // 自動の解除は間隔をあけて出す (いっせいに走り出さない)
    const rel0 = p.released;
    __run(60);
    const firstMinute = p.released - rel0;
    const nStreams = Object.keys(game.recovery.streamsOf(p)).length || 1;
    ok('自動の解除はいっせいではなく少しずつ (最初の1分で線路あたり2本まで)', firstMinute <= nStreams * 2,
       `${firstMinute}本 / 線路 ${nStreams}`);
    finishAndCheck(r2);
}

// ---------------------------------------------------------------- 3. 重い人身事故
head('重い人身事故');
game.recovery.manual = false;
let r3 = null;
for (let k = 0; k < 20 && !r3; k++) {
    const inc = game.incidents.trigger('jinshin');
    if (!inc) { __run(300); continue; }
    if (!inc.staged || !inc.area) {
        game.incidents.active = game.incidents.active.filter(x => x !== inc);
        game.incidents.finish(inc, '検証 (軽い人身事故)', true);
        game.isEmergency = false; game.radioTimer = 0;
        continue;
    }
    r3 = inc;
}
ok('重い人身事故 (段階的な運転再開になるもの) が起きた', !!r3, r3 ? r3.place : '');
if (r3) {
    const held = game.trains.filter(t => t.recoveryHold === 'inc:' + r3.id);
    ok('区間 (前後2駅) の列車を抑止した', held.length > 0, held.length + '本');
    runUntilLift(r3);
    const p = planOf(r3);
    if (p) finishAndCheck({ plan: p });
    else ok('区間に列車が無ければ計画は作らない (抑止も残さない)', !game.trains.some(t => t.recoveryHold === 'inc:' + r3.id));
}

// ---------------------------------------------------------------- 4. 指令の全解除
head('指令の全解除');
game.recovery.manual = true;
const inc4 = game.recovery.triggerMajor('rain');
if (inc4) {
    runUntilLift(inc4);
    const p = planOf(inc4);
    ok('全解除の前に計画がある', !!p);
    game.clearEmergency();       // 指令の「全解除」(防護無線・見合わせ)
    ok('全解除で抑止が残らない', !game.trains.some(t => t.recoveryHold) && game.recovery.plans.length === 0);
    ok('全解除で抑止中の印も残らない', !game.trains.some(t => t.isManuallySuspended && t.recoveryHold));
}

// ---------------------------------------------------------------- 5. 通しで1日 (大規模障害あり)
head('通しで走らせる (大規模障害 2回・ふだんの輸送障害あり)');
CONFIG.majorIncidentChance = 0;
game.incidents.nextAt = game.currentTime + 600;
game.recovery.manual = false;
let maxHeldAge = 0, orphan = 0;
const startT = game.currentTime;
game.recovery.triggerMajor('rain');
__run(4 * 3600, (g, i) => {
    if (i === 480) g.recovery.triggerMajor('snow');
    if (i % 20) return;
    g.trains.forEach(t => {
        if (!t.recoveryHold) return;
        const p = g.recovery.plans.find(x => x.id === t.recoveryHold);
        const isInc = String(t.recoveryHold).indexOf('inc:') === 0 &&
            g.incidents.active.some(x => 'inc:' + x.id === t.recoveryHold);
        if (!p && !isInc) orphan++;
        if (p) maxHeldAge = Math.max(maxHeldAge, g.currentTime - p.startedAt);
    });
});
ok('どの計画にも属さない抑止 (取り残し) が無い', orphan === 0, String(orphan));
ok('解除から最も長く抑止が残った時間が上限以内', maxHeldAge <= RECOVERY_RULES.limitSec, Math.round(maxHeldAge / 60) + '分');
__run(2 * 3600);
const longStuck = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot' &&
    (t.stuckTime || 0) >= 2400 && !t.minorTrouble && !t.isManuallySuspended);
ok('抑止も障害も無いのに40分以上動けない列車が居ない', longStuck.length === 0,
   longStuck.map(t => t.trainNo + '@' + commWhere(game, t)).join(', '));
// 終わった時点でまだ続いている見合わせ (inc:<id>) の抑止は、取り残しではない
ok('抑止が残ったままの列車が無い', !game.trains.some(t => t.recoveryHold && t.state !== 'finished' &&
    !game.incidents.active.some(x => 'inc:' + x.id === t.recoveryHold)));

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
