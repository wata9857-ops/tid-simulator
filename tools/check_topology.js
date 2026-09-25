/* 配線 (線路・番線・待避線) が配線略図と合っているかを検証する。
   使い方: node tools/harness.js --tid tools/check_topology.js

   ■ 何を照合するか
     同梱の配線略図 (スクリーンショット(690)〜(712).png, haisenryakuzu.net) を
     tools/extract_haisen.py で画素から読み取った値を「正解」として持ち、
       ・その駅の線路の本数 (本線＋待避線)
       ・ホームの面数・番線の数
       ・番線がどの線路に付いているか
     をシミュレーションのデータ (TrackManager のレーン数 /
     STATION_PLATFORM_RULES / stationLaneYPositions) と突き合わせる。

   ■ 転記できている駅だけを見る
     配線略図は33枚あり、全駅の転記はまだ途中。
     REF に書いた駅だけを照合し、最後に「何駅ぶん照合できたか」を出す。
     REF に駅を足せば、そのまま検証対象が増える。

   ■ あわせて、配線データそのものの整合も見る
     ・シミュレーションのレーンすべてに番線名が付いているか
     ・番線名がどれも実在の番線か
     ・列車が存在しない番線に居ないか
     ・駅間にいる列車に番線が付いていないか
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* ------------------------------------------------------------------
   配線略図から読み取った「正解」

     through … 駅を通り抜ける本線の数
     loop    … 待避線 (駅の前後で本線から分かれて戻る線) の数
     faces   … ホームに面した番線の数
     src     … 元にした画像と、画素で読み取った値
------------------------------------------------------------------ */
const REF = {
    // --- スクリーンショット(692).png 帯1 (草津〜石山)
    '南草津': { through: 4, loop: 0, faces: 4, src: '692 x1185 本線4/待避0/ホーム2面' },
    '瀬田':   { through: 4, loop: 0, faces: 4, src: '692 x1438 本線4/待避0/ホーム2面' },
    '石山':   { through: 4, loop: 2, faces: 4, src: '692 x1720 本線4/待避2(y528,736)/ホーム2面' },
    // --- スクリーンショット(692).png 帯2 (膳所〜山科)
    '膳所':   { through: 4, loop: 2, faces: 4, src: '692 x296 本線4/待避2(y1103,1323)＋側線/ホーム2面' },
    '大津':   { through: 4, loop: 0, faces: 4, src: '692 x637 本線4/待避0/ホーム2面' }
};

/* 実物の Super-TID (ref-diagram-3468x632.png / 4000x935.png) で
   ホームの黄色い帯の上下に書かれていた番線番号。
   画面の上 (下り外側) から順。 */
const REF_PLAT_ORDER = {
    '膳所':   ['4', '3', '2', '1'],
    '大津':   ['4', '3', '2', '1'],
    '向日町': ['4', '3', '2', '1'],
    '西大路': ['1', '2', '3', '4'],
    '桂川':   ['1', '2'],
    '吹田':   ['1', '2', '3', '4'],
    '塚本':   ['4', '3', '2', '1']
};

const MAIN_TRACKS = ['Up_Out', 'Up_In', 'Down_In', 'Down_Out'];

/** シミュレーションでその駅にある線路 (レーン) の総数 */
function simLaneCount(st) {
    let n = 0;
    MAIN_TRACKS.forEach(tid => {
        const blks = game.trackMgr.blocks[tid];
        if (!blks) return;
        const b = blks.find(x => x.stationIdx === STATION_MAP[st] && x.x !== -1000);
        if (b) n += b.lanes.length;
    });
    return n;
}

head('配線略図と線路の本数が合っているか');
{
    const bad = [];
    for (const st in REF) {
        const r = REF[st];
        const want = r.through + r.loop;
        const got = simLaneCount(st);
        if (got !== want) bad.push(st + ' 図=' + want + '(本線' + r.through + '+待避' + r.loop + ') 実装=' + got);
    }
    ok('線路の本数が配線略図と一致する', bad.length === 0, bad.join(' / '));

    // 待避線を持つ駅は、外側線が2レーンになっているか
    const badLoop = [];
    for (const st in REF) {
        if (!REF[st].loop) continue;
        ['Up_Out', 'Down_Out'].forEach(tid => {
            const blks = game.trackMgr.blocks[tid];
            const b = blks && blks.find(x => x.stationIdx === STATION_MAP[st] && x.x !== -1000);
            if (!b || b.lanes.length < 2) badLoop.push(st + '/' + tid);
        });
    }
    ok('待避線のある駅は外側線が2線ある (列車が実際に入れる)', badLoop.length === 0, badLoop.join(' '));
}

head('ホームに面した番線の数');
{
    const bad = [];
    for (const st in REF) {
        const rule = STATION_PLATFORM_RULES[st];
        if (!rule) { bad.push(st + ' 定義なし'); continue; }
        const faces = rule.lanes.filter(Boolean).length;
        if (faces !== REF[st].faces) bad.push(st + ' 図=' + REF[st].faces + ' 実装=' + faces);
    }
    ok('ホームの番線数が配線略図と一致する', bad.length === 0, bad.join(' / '));

    // 待避線にホームは無い
    const badPf = [];
    for (const st in REF) {
        if (!REF[st].loop) continue;
        const m = stationLaneMap(st);
        ['Up_Out', 'Down_Out'].forEach(tid => {
            (m[tid] || []).forEach((e, li) => {
                if (li > 0 && e.platform) badPf.push(st + '/' + tid + ' レーン' + li + '=' + e.label);
            });
        });
    }
    ok('待避線にホームが付いていない', badPf.length === 0, badPf.join(' '));
}

head('番線が正しい線路に付いているか (実物の Super-TID と照合)');
{
    const bad = [];
    for (const st in REF_PLAT_ORDER) {
        const rule = STATION_PLATFORM_RULES[st];
        if (!rule) { bad.push(st + ' 定義なし'); continue; }
        const ys = stationLaneYPositions(st, 0, 1000, 2000, 3000);
        const list = [];
        for (let i = 0; i < ys.length && i < rule.labels.length; i++) {
            if (rule.lanes[i]) list.push({ v: ys[i], label: rule.labels[i] });
        }
        // 画面の上 = 下り外側 = 仮想座標が大きい側
        list.sort((a, b) => b.v - a.v);
        const seq = list.map(x => x.label).join(',');
        if (seq !== REF_PLAT_ORDER[st].join(',')) {
            bad.push(st + ' 実物=' + REF_PLAT_ORDER[st].join(',') + ' 実装=' + seq);
        }
    }
    ok('番線の並びが実物の Super-TID と一致する', bad.length === 0, bad.join(' / '));
}

head('番線の対応表そのものの整合');
{
    let noLabel = 0, over = 0, mismatch = [];
    STATIONS.forEach((st) => {
        const rule = STATION_PLATFORM_RULES[st.name];
        if (!rule) return;
        const m = stationLaneMap(st.name);
        MAIN_TRACKS.forEach(tid => {
            const blks = game.trackMgr.blocks[tid];
            const b = blks && blks.find(x => x.stationIdx === STATION_MAP[st.name] && x.x !== -1000);
            if (!b) return;
            const cnt = laneCountsOf(st.name, tid, m, b);
            if (cnt.def !== cnt.sim) {
                mismatch.push(st.name + '/' + tid + ' 配線=' + cnt.def + ' 番線=' + cnt.sim);
            }
            const arr = m[tid] || [];
            for (let li = 0; li < b.lanes.length; li++) {
                const lbl = platformLabelOf(st.name, tid, li);
                if (lbl === null) { noLabel++; continue; }
                /* 番線名は配線の定義か、レーンが余ったぶんの待避線のどちらか。
                   待避線はホーム無しとして自動で足している。 */
                const known = rule.labels.indexOf(lbl) >= 0 ||
                              (/^[上下]待\d*$/.test(lbl) && !isPlatformLane(st.name, tid, li));
                if (!known) over++;
            }
        });
    });
    ok('シミュレーションのレーンと番線の数が合っている', mismatch.length === 0,
       mismatch.length + '件 例: ' + mismatch.slice(0, 6).join(' / '));
    ok('番線名の付いていないレーンが無い', noLabel === 0, noLabel + '件');
    ok('存在しない番線名を返していない', over === 0, over + '件');
}

head('列車の番線表示');
{
    let ghost = 0, atStation = 0, betweenWithPf = 0;
    for (let i = 0; i < 6 * 3600 / CONFIG.TICK_SEC; i++) {
        game.update();
        if (i % 20) continue;
        for (const t of game.trains) {
            if (t.state === 'finished' || t.state === 'in_depot') continue;
            const blks = game.trackMgr.blocks[t.trackId];
            const b = blks && blks[t.currBlockIndex];
            if (!b || b.x === -1000) continue;
            const lbl = trainPlatformLabel(game, t);
            const isSt = !!(b.isStation || b.hoppoStationName);
            if (isSt) {
                if (lbl === null) continue;
                atStation++;
                const st = blockStationName(b);
                const rule = STATION_PLATFORM_RULES[st];
                const known = !rule || rule.labels.indexOf(lbl) >= 0 ||
                              /^[上下]待\d*$/.test(lbl);
                if (!known) ghost++;
            } else if (lbl !== null) {
                betweenWithPf++;
            }
        }
    }
    ok('駅に居る列車の番線を出せている', atStation > 0, atStation + '件');
    ok('存在しない番線に列車が居ない', ghost === 0, ghost + '件');
    ok('駅間の列車に番線を出していない', betweenWithPf === 0, betweenWithPf + '件');
}

/* 尼崎は本線・JR宝塚線・JR東西線が同じ番線を使うので、
   レーン配列を4つの線路で共有している (js/05-track-manager.js)。
   線路IDごとに数を比べても意味がないため、上り側・下り側の合計で見る。 */
function laneCountsOf(stName, tid, m, b) {
    // 上下すべてで共有する駅 (単線の駅・線区の端の上郡・中線のある相生など) は全部の合計
    if (STATION_SHARED_LANES[stName] === 'all') {
        return { def: m.Up_Out.length + m.Up_In.length + m.Down_In.length + m.Down_Out.length,
                 sim: b.lanes.length };
    }
    if (STATION_SHARED_LANES[stName]) {
        const up = (tid === 'Up_Out' || tid === 'Up_In');
        return { def: up ? (m.Up_Out.length + m.Up_In.length)
                         : (m.Down_In.length + m.Down_Out.length),
                 sim: b.lanes.length };
    }
    return { def: (m[tid] || []).length, sim: b.lanes.length };
}

head('全駅の配線データの整合 (レーン数と番線定義)');
{
    const bad = [];
    STATIONS.forEach(st => {
        if (!STATION_PLATFORM_RULES[st.name]) return;
        const m = stationLaneMap(st.name);
        MAIN_TRACKS.forEach(tid => {
            const blks = game.trackMgr.blocks[tid];
            const b = blks && blks.find(x => x.stationIdx === STATION_MAP[st.name] && x.x !== -1000);
            if (!b) return;
            const cnt = laneCountsOf(st.name, tid, m, b);
            if (cnt.sim !== cnt.def) bad.push(st.name + '/' + tid + ' ' + cnt.def + '≠' + cnt.sim);
        });
    });
    ok('全駅で「線路の数」と「番線の定義」が一致している', bad.length === 0,
       bad.length + '件 例: ' + bad.slice(0, 6).join(' / '));

    // 複々線の外に内側線が無いこと (配線略図どおり)
    let innerOut = 0;
    ['Up_In', 'Down_In'].forEach(tid => {
        const blks = game.trackMgr.blocks[tid];
        blks.forEach(b => {
            if (b.x === -1000 || b.stationIdx === undefined) return;
            if (b.stationIdx < STATION_MAP['西明石'] || b.stationIdx > STATION_MAP['草津']) innerOut++;
        });
    });
    ok('複々線 (西明石〜草津) の外に内側線が無い', innerOut === 0, innerOut + 'ブロック');
}

head('転記の進み具合');
{
    const total = STATIONS.length;
    const done = Object.keys(REF).length;
    console.log('  配線略図から転記できた駅: ' + done + ' / 本線 ' + total + ' 駅');
    console.log('  (残りは tools/extract_haisen.py で読み取って REF に足していく)');
    ok('転記した駅の照合がすべて通っている', failures === 0);
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
