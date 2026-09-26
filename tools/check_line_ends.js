/* 線区の端・出区の向き・行き止まりでの詰まりを見る。

   使い方: node tools/harness.js --seed=20260922 tools/check_line_ends.js

   ■ なぜ要るか (2026-09 の不具合)
     放出行きの列車が放出を過ぎて四条畷方へ進み、行き止まりで動けなくなって
     JR東西線を詰まらせていた。原因は2つ。
       1. JR東西線の上りの穴埋めが「放出の電留線から放出行きの上り」を出していた
          (放出の電留線は放出駅の四条畷方にあるので、上りで出すと放出を通り過ぎる)
       2. 線区の端の駅 (放出・近江塩津・草津の内側線 …) の先にも本物の線路の
          ブロックがあり、そこへ入った列車は行き止まりで永久に止まった
     同じ形の詰まりがほかの線区で起きないことも、ここでまとめて見る。

   ■ 見ること
     1. 線区の端の駅の先に、本物の線路 (行き止まりの切れ端) が無い
     2. すべての留置場 × 行先で、出区の向きが線区のつながりどおり
        (行けない組み合わせは断られ、行ける組み合わせは行先か車両所に着く)
     3. 1日走らせて、線路の無い位置・行き止まりに列車が居ない
     4. 同じ場所どうしの向き (放出 → 放出) が「向き無し」になる
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

// ------------------------------------------------------------------ 1. 行き止まりの切れ端
head('線区の端の先に線路の切れ端が無い');
{
    const stubs = [];
    for (const tid in game.trackMgr.blocks) {
        if (typeof isSidingTrack === 'function' && isSidingTrack(tid)) continue;   // 駅の引上線は行き止まりの線路そのもの
        const blks = game.trackMgr.blocks[tid];
        // 最後の本物の駅ブロックより先 (上り方向) に、本物のブロックが続いていないか
        let lastSt = -1;
        blks.forEach(b => { if (b.x !== -1000 && (b.isStation || b.hoppoStationName)) lastSt = b.index; });
        let extra = 0;
        for (let i = lastSt + 1; i < blks.length; i++) if (blks[i].x !== -1000) extra++;
        if (extra > 0 && lastSt < blks.length - 1) stubs.push(tid + ' ' + extra + 'ブロック');
    }
    ok('どの線路にも、端の駅の先の行き止まりが無い', stubs.length === 0, stubs.join(' / '));
}

// ------------------------------------------------------------------ 4. 向きの計算
head('線区をまたぐ向き (routeDirection)');
{
    const cases = [
        ['放出', '放出', 0], ['放出', '尼崎', -1], ['放出', '西明石', -1], ['放出', '京都', 0],
        ['放出', '宝塚', -1], ['放出', '京橋', -1], ['放出', '四条畷', 1],
        ['尼崎', '放出', 1], ['西明石', '放出', 1], ['宮原操', '放出', 0],
        ['新三田', '大阪', 1], ['新三田', '西明石', 0], ['宮原操', '新三田', -1],
        ['京都', '近江今津', 1], ['米原', '近江今津', 0], ['近江今津', '京都', -1],
        ['高槻', '京都', 1], ['京都', '高槻', -1], ['宮原操', '新大阪', 0]
    ];
    const badC = cases.filter(c => routeDirection(c[0], c[1]) !== c[2])
        .map(c => `${c[0]}→${c[1]}=${routeDirection(c[0], c[1])} (期待 ${c[2]})`);
    ok('線区のつながりどおりの向きになる', badC.length === 0, badC.join(' / '));
}

// ------------------------------------------------------------------ 2. 出区
head('すべての留置場からの出区');
__run(6 * 3600);
/* ここでは出区の向きだけを見たいので、輸送障害は起こさない
   (見合わせで止まった列車を「行き止まりで動けない」と数えないため) */
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
{
    const dests = ['京都', '大阪', '高槻', '尼崎', '西明石', '姫路', '草津', '野洲', '米原', '新三田',
                   '宝塚', '放出', '京橋', '宮原操', '向日町操', '網干', '神戸', '敦賀', '須磨', '近江今津', '四条畷'];
    const probs = [];
    let accepted = 0, rejected = 0, arrived = 0;
    const slow = [];
    for (const dname of Object.keys(DEPOTS)) {
        for (const dest of dests) {
            // 留置場に車両を1本用意する (無ければ在庫から作る)
            const vs = game.fleet.assign(dname, '回送', depotTrackId(dname, 1, '回送'), dest, 'x', { noBorrow: true }) ||
                       game.fleet.assign(dname, '回送', depotTrackId(dname, -1, '回送'), dest, 'x', {});
            if (!vs || !vs.length) continue;
            const t = new Train({ type: '回送', dir: 1, trackId: 'Up_Out', startName: dname, name: '予備', vehicles: vs }, game);
            const bb = game.trackMgr.blocks[t.trackId];
            if (bb && bb[t.currBlockIndex] && bb[t.currBlockIndex].lanes[t.lane] === t) bb[t.currBlockIndex].lanes[t.lane] = null;
            t.state = 'in_depot'; t.timer = -1; t.depotOutConfig = null; t.trainNo = ''; t.startName = dname;
            depotAdd(dname, t); game.trains.push(t);
            const r = game.applyCommand({ name: 'depotOut', depot: dname, trainId: t.id, delayMin: 0, type: '回送', dest: dest });
            if (!r.ok) { rejected++; continue; }
            accepted++;
            let worstStuck = 0, lastWhere = '', endedAtLineEnd = false;
            for (let i = 0; i < 2 * 3600 / CONFIG.TICK_SEC; i++) {
                game.update();
                if (t.state === 'finished' || (t.state === 'in_depot' && i > 2)) break;
                if (t.state === 'in_depot') continue;      // まだ出区待ち (番線が空くのを待っている)
                const b = game.trackMgr.blocks[t.trackId] ? game.trackMgr.blocks[t.trackId][t.currBlockIndex] : null;
                if (!b || b.x === -1000) { endedAtLineEnd = true; break; }
                if (isRealStationBlock(b)) lastWhere = blockStationName(b);
                worstStuck = Math.max(worstStuck, t.stuckTime);
            }
            if (t.state === 'finished' || t.state === 'in_depot') arrived++;
            // 2時間で着かないのは遠い行先 (姫路→京都 など)。行先へ向かって走り続けていればよい
            else if (!game.ops.canReach(t) || t.dest !== dest) {
                slow.push(`${dname}→${dest}: ${lastWhere}で行先が ${t.dest} に変わった/行けない`);
            }
            if (endedAtLineEnd) probs.push(`${dname}→${dest}: 線路の無い位置に出た`);
            else if (t.state !== 'finished' && t.state !== 'in_depot' && worstStuck >= 1800) {
                probs.push(`${dname}→${dest}: ${lastWhere}付近で${Math.round(worstStuck / 60)}分動けない`);
            }
            // 後片付け
            if (t.state !== 'finished') t.remove();
        }
    }
    console.log(`  受け付けた出区 ${accepted} / 断った出区 ${rejected} / 2時間以内に着いた ${arrived}`);
    ok('受け付けた出区で、行き止まり・長時間の停止が起きない', probs.length === 0, probs.slice(0, 8).join(' / '));
    ok('行けない組み合わせを断っている', rejected > 0, rejected + '件');
    ok('まだ着いていない出区も、指定の行先へ向かって走っている', slow.length === 0,
       slow.slice(0, 8).join(' / '));
}

// ------------------------------------------------------------------ 3. 1日走らせる
head('1日走らせて行き止まりに列車が残らない');
game.incidents.nextAt = game.currentTime + 1800;     // ここからは輸送障害も起こす
{
    let ghost = 0, deadEndLong = 0, maxEndStuck = 0;
    const where = {};
    __run(18 * 3600, g => {
        for (const t of g.trains) {
            if (t.state === 'finished' || t.state === 'in_depot') continue;
            const blks = g.trackMgr.blocks[t.trackId];
            const b = blks ? blks[t.currBlockIndex] : null;
            if (!b || b.x === -1000) { ghost++; continue; }
            if (t.lineEndAhead() && !t.isFinalStop && t.state !== 'turning_back') {
                maxEndStuck = Math.max(maxEndStuck, t.stuckTime);
                if (t.stuckTime >= 1200) {
                    deadEndLong++;
                    const k = (blockStationName(b) || '駅間') + ' ' + t.trackId;
                    where[k] = (where[k] || 0) + 1;
                }
            }
        }
    });
    ok('線路の無い位置に列車が居ない', ghost === 0, ghost + '回');
    ok('線区の端で20分以上動けない列車が居ない', deadEndLong === 0,
       deadEndLong + '回 ' + Object.keys(where).slice(0, 5).join(' / ') + ' (最長 ' + Math.round(maxEndStuck / 60) + '分)');
    console.log('  詰まりの見張りがとった措置: ' + (game.ops.stats.watch || 0) + '件');
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
