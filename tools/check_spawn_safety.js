/* 列車を線路に出すとき (生成・出区・引上線から戻る) に、ほかの列車と向かい合わないかを見る。

   使い方: node tools/harness.js --seed=20260922 tools/check_spawn_safety.js [時間]

   ■ なぜ要るか (2026-09 の不具合)
     学研都市線で、木津へ向かって単線区間 (祝園〜木津) を走っている列車がいるのに、
     木津の1線しかない番線へ新しい回送が生成され、単線の上で向かい合った (正面衝突)。
     生成の判定が「番線が空いているか」しか見ておらず、
     近づいている列車や単線区間の中の列車を見ていなかった。
     いまは js/13-train-hold.js の spawnConflict() を生成・出区・引上線から戻るときに通す。

   ■ 見ること (既定は 1日。輸送障害も起こす)
     1. 単線区間の中で、向かい合う2本 (上りが下りより手前) が居ない
     2. 新しく線路に現れた列車が、単線区間の中のほかの列車と同じ区間に現れない
     3. 新しく線路に現れた列車が、行く手からその駅へ向かってくる列車の入る番線を取っていない
        (向かってくる列車の数 > 残りの空き番線、にならない)
     4. 同じ番線の枠に2本が重なっていない */
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}

const hours = Number(__argv.filter(a => /^\d+(\.\d+)?$/.test(a)).pop() || 24);
const tm = game.trackMgr;
const onTrack = t => t.state !== 'finished' && t.state !== 'in_depot' && t.currBlockIndex >= 0 &&
    tm.blocks[t.trackId] && tm.blocks[t.trackId][t.currBlockIndex];
const hhmm = s => { const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return h + ':' + String(m).padStart(2, '0'); };

// ------------------------------------------------------------------ 0. 木津の再現
console.log('\n=== 木津: 単線を近づく列車がいるときに、木津で列車を出さない ===');
{
    game.incidents.clearAll('検証');
    const kIdx = STATION_MAP['木津'] * UNITS_PER_STATION;
    const kb = tm.blocks['Tozai_Up'][kIdx];
    const u = singleUnitAt('Tozai_Up', kIdx);
    const r = singleUnitBlockRange(u);
    // 区間を空ける
    for (let i = r[0]; i <= r[1]; i++) tm.blocks['Tozai_Up'][i].lanes.forEach(t => { if (t) t.remove(); });
    // 西木津に木津行きの普通を置く (これから木津へ入る)
    const vs = game.fleet.assign('祝園', '普通', 'Tozai_Up', '木津', 'x', {}) || [];
    const a = new Train({ type: '普通', dir: 1, trackId: 'Tozai_Up', startName: '西木津', dest: '木津', name: '検証A', vehicles: vs }, game);
    a.state = 'running'; a.timer = 0; a.hasDeparted = true;
    game.trains.push(a);
    ok('西木津に木津行きを置けた', a.currBlockIndex > r[0] && kb.lanes.every(l => l === null), a.state + ' ' + a.currBlockIndex);
    // 木津発の回送を生成する
    const res = game.addTrain({ type: '回送', dir: -1, trackId: 'Tozai_Down', startName: '木津', dest: '京橋', name: '検証B' });
    const b = game.trains.find(t => t.trainNo === '検証B');
    ok('木津の番線に新しい列車が現れない', kb.lanes.every(l => l === null || l === a),
       'addTrain=' + res + ' / ' + (b ? b.state : '作られない'));
    // 奈良支所から出区させようとしても出ない
    if (b && b.state === 'in_depot') { b.timer = 0; b.tryDepotOut('木津', true); }
    ok('強制出区でも、近づく列車がいるあいだは出ない', !b || b.state === 'in_depot' || b.state === 'finished', b ? b.state : '');
    // 20分走らせて、向かい合いが起きず、A が木津に着き、B はそのあと出る
    let met = false;
    for (let i = 0; i < 1200 / CONFIG.TICK_SEC; i++) {
        game.update();
        const inU = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot' &&
            (t.trackId === 'Tozai_Up' || t.trackId === 'Tozai_Down') && t.currBlockIndex >= r[0] && t.currBlockIndex <= r[1]);
        if (inU.some(x => x.dir === 1 && inU.some(y => y.dir === -1 && x.currBlockIndex <= y.currBlockIndex))) met = true;
    }
    ok('20分のあいだ、祝園〜木津で向かい合わない', !met);
    ok('近づいていた列車は木津に着いた (または折り返した)', a.state === 'finished' || a.currBlockIndex === kIdx || a.dir === -1 || a.state === 'in_depot', a.state + ' ' + a.currBlockIndex);
    ok('出区を見合わせた回数が数えられている', !!game.spawnGuardStats, JSON.stringify(game.spawnGuardStats || {}));
}

console.log('\n=== ' + hours + '時間走らせる ===');
const headOn = [], spawnInUnit = [], spawnSteal = [], dupLane = [];
let spawned = 0;
let seen = new Set();
game.trains.forEach(t => { if (onTrack(t)) seen.add(t); });

__run(hours * 3600, g => {
    const now = new Set();
    for (const t of g.trains) if (onTrack(t)) now.add(t);

    // 1. 単線区間の向かい合い
    for (const u of SINGLE_TRACK_UNITS) {
        const r = singleUnitBlockRange(u);
        const inU = [...now].filter(t => (t.trackId === u.up || t.trackId === u.down) &&
                                         t.currBlockIndex >= r[0] && t.currBlockIndex <= r[1]);
        const ups = inU.filter(t => t.dir === 1), dns = inU.filter(t => t.dir === -1);
        for (const a of ups) for (const b of dns) {
            if (a.currBlockIndex <= b.currBlockIndex && headOn.length < 50) {
                headOn.push(`${hhmm(g.currentTime)} ${u.id}: ${a.trainNo}(${a.dest}行) と ${b.trainNo}(${b.dest}行)`);
            }
        }
    }

    // 2・3. 新しく現れた列車
    for (const t of now) {
        if (seen.has(t)) continue;
        spawned++;
        const blk = tm.blocks[t.trackId][t.currBlockIndex];
        const u = singleUnitAt(t.trackId, t.currBlockIndex);
        if (u) {
            const r = singleUnitBlockRange(u);
            const other = [...now].find(o => o !== t && (o.trackId === u.up || o.trackId === u.down) &&
                                             o.currBlockIndex >= r[0] && o.currBlockIndex <= r[1]);
            if (other && seen.has(other)) spawnInUnit.push(`${hhmm(g.currentTime)} ${t.trainNo} が ${u.id} に現れた (区間に ${other.trainNo} が居る)`);
        }
        let free = blk.lanes.filter(l => l === null).length, appr = [];
        for (const o of seen) {
            if (!now.has(o) || o === t || o.dir === t.dir) continue;   // 行く手から向かってくる列車だけ
            const d = (blk.index - o.currBlockIndex) * o.dir;
            if (d <= 0 || d > UNITS_PER_STATION) continue;
            const ob = tm.blocks[o.trackId][blk.index];
            if (!ob || ob.lanes !== blk.lanes) continue;
            const di = STATION_MAP[o.dest];
            if (di !== undefined) { const dd = (di * UNITS_PER_STATION - o.currBlockIndex) * o.dir; if (dd >= 0 && dd < d) continue; }
            appr.push(o.trainNo);
        }
        if (appr.length > free && spawnSteal.length < 50) {
            spawnSteal.push(`${hhmm(g.currentTime)} ${t.trainNo} が ${blockStationName(blk) || blk.index} の番線を取った (向かってくる ${appr.join(',')} / 空き ${free})`);
        }
    }

    // 4. 枠の重なり
    for (const t of now) {
        const b = tm.blocks[t.trackId][t.currBlockIndex];
        const at = b.lanes.indexOf(t);
        if (at >= 0 && b.lanes.lastIndexOf(t) !== at && dupLane.length < 20) dupLane.push(`${hhmm(g.currentTime)} ${t.trainNo}`);
    }
    seen = now;
});

console.log(`  ${hours}時間で新しく線路に現れた列車 ${spawned} 本 / 生成を見合わせた回数 ${JSON.stringify(game.spawnGuardStats || {})}`);
ok('単線区間で向かい合う列車が居ない', headOn.length === 0, headOn.slice(0, 8).join(' / '));
ok('単線区間の中に、ほかの列車が居るのに新しい列車が現れない', spawnInUnit.length === 0, spawnInUnit.slice(0, 8).join(' / '));
ok('向かってくる列車の入る番線を、新しく現れた列車が取らない', spawnSteal.length === 0, spawnSteal.slice(0, 8).join(' / '));
ok('1本の列車が2つの枠を取っていない', dupLane.length === 0, dupLane.slice(0, 5).join(' / '));
console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
