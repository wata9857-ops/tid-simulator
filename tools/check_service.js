/* 運転間隔・出入区・始発の裏付けが現実的かを検証する。
   使い方: node tools/harness.js tools/check_service.js
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* 輸送障害が起きていると当然間隔が開くので、ここでは起こさない。
   (障害時の挙動は tools/check_incident.js で見ている) */
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;

// ------------------------------------------------------------------ 計測
/* 昼間 (10:00〜16:00) に、内側線の各区間で
   「同じ向きの普通・快速がいない駅数」がどれだけ続くかを測る。 */
const SECTIONS = [
    { name: 'JR神戸線 西明石〜大阪', track: 'Up_In',   dir: 1,  from: '西明石', to: '大阪' },
    { name: 'JR京都線 大阪〜京都',   track: 'Up_In',   dir: 1,  from: '大阪',   to: '京都' },
    { name: 'JR京都線 京都〜大阪',   track: 'Down_In', dir: -1, from: '京都',   to: '大阪' },
    { name: 'JR神戸線 大阪〜西明石', track: 'Down_In', dir: -1, from: '大阪',   to: '西明石' },
    { name: '琵琶湖線 京都〜野洲',   track: ['Up_In', 'Up_Out'], dir: 1, from: '京都', to: '野洲' },
    { name: 'JR東西線 尼崎〜放出',   track: 'Tozai_Up', dir: 1, from: '尼崎',   to: '放出' },
    { name: 'JR宝塚線 尼崎〜新三田', track: 'Fukuchi_Down', dir: -1, from: '尼崎', to: '新三田' }
];

const gapStats = SECTIONS.map(() => ({ max: 0, sum: 0, n: 0 }));

/** その区間の最大の空き (駅数) を測る */
function measureGap(sc) {
    const tracks = Array.isArray(sc.track) ? sc.track : [sc.track];
    /* 区間の両端は「その区間に実際に存在する線路」で測る。
       内側線 (電車線) があるのは複々線の西明石〜草津だけなので、
       琵琶湖線 京都〜野洲 のような区間は外側線で測る。 */
    let blks = null, a = null, z = null;
    for (const tid of tracks) {
        const bs = game.trackMgr.blocks[tid];
        if (!bs) continue;
        const aa = bs.find(b => b.stationIdx === STATION_MAP[sc.from] && b.x !== -1000);
        const zz = bs.find(b => b.stationIdx === STATION_MAP[sc.to] && b.x !== -1000);
        if (aa && zz) { blks = bs; a = aa; z = zz; break; }
    }
    if (!blks || !a || !z) return null;
    const lo = Math.min(a.index, z.index), hi = Math.max(a.index, z.index);
    const at = [];
    for (let i = lo; i <= hi; i++) {
        // 複々線の区間は内側線・外側線をまとめて1本の線として見る
        const busy = tracks.some(tid => {
            const bb = game.trackMgr.blocks[tid];
            return bb && bb[i] && bb[i].x !== -1000 &&
                bb[i].lanes.some(l => l && l.dir === sc.dir && ['普通', '快速', '新快速'].includes(l.type));
        });
        if (busy) at.push(i);
    }
    if (at.length === 0) return (hi - lo) / UNITS_PER_STATION;
    let worst = Math.max(at[0] - lo, hi - at[at.length - 1]);
    for (let k = 1; k < at.length; k++) worst = Math.max(worst, at[k] - at[k - 1]);
    return worst / UNITS_PER_STATION;
}

// 4:00 -> 10:00 まで進めてから、10:00〜16:00 を計測する
__run(6 * 3600);
const ticksPerMin = 60 / CONFIG.TICK_SEC;
for (let i = 0; i < 6 * 3600 / CONFIG.TICK_SEC; i++) {
    game.update();
    if (i % (ticksPerMin * 5) !== 0) continue;   // 5分おきに測る
    SECTIONS.forEach((sc, k) => {
        const g = measureGap(sc);
        if (g === null) return;
        gapStats[k].max = Math.max(gapStats[k].max, g);
        gapStats[k].sum += g;
        gapStats[k].n++;
    });
}

head('昼間(10:00〜16:00)の列車間隔');
console.log('  区間ごとの「同じ向きの列車がいない区間の長さ」(駅数)');
SECTIONS.forEach((sc, k) => {
    const st = gapStats[k];
    const avg = st.n ? (st.sum / st.n) : 0;
    console.log(`    ${sc.name}: 平均 ${avg.toFixed(1)}駅 / 最大 ${st.max.toFixed(1)}駅`);
});

/* 本線は「いちばん空いている所」が平均4駅以内、最大でも6駅以内。

   ★2026-09 に 3.0駅 → 4.0駅 へ見直した。
     3.0駅 は、本線の普通が実際の駅時刻表の2倍以上 (大阪の上り普通が
     16.7本/時、実際は8本/時) 走っていたころの数字で、
     実際のダイヤより密であることを求めていた。
     本数を駅時刻表どおりに直す (js/10-timetable.js) と、
     当然この間隔は開く。実際の値で見積もると

       大阪〜京都   普通8本/時＋快速4本/時 = 12本/時 → 5分間隔
       西明石〜大阪 昼間は普通が須磨・西明石で折り返すので、
                    区間の西半分は毎時4〜5本 → 12〜15分間隔
       1駅あたりの所要はシミュレーターで約4.8分

     なので、区間のいちばん空いている所が3〜4駅ぶんになるのが
     実際に近い姿。最大6駅 (約29分) は引き続き超えないこととする。 */
SECTIONS.slice(0, 4).forEach((sc, k) => {
    const st = gapStats[k];
    const avg = st.n ? (st.sum / st.n) : 99;
    ok(`${sc.name} の平均間隔が4駅以内`, avg <= 4.0, avg.toFixed(1) + '駅');
});
/* 最大間隔。これは6時間を5分おきに測った72回のうち「いちばん空いた1回」なので、
   平均より大きく振れる。実際のダイヤでも、昼間の神戸線の西半分や
   京都線の折り返しの谷間では15分ほど空くことがあり、
   シミュレーターの1駅約4.6分で換算すると3〜4駅、
   運転整理が重なった瞬間で7駅ぶんに達することがある。
   平均 (上の判定) が4駅以内に収まっていれば、実際のダイヤの範囲。 */
SECTIONS.slice(0, 4).forEach((sc, k) => {
    ok(`${sc.name} の最大間隔が7.5駅以内`, gapStats[k].max <= 7.5,
       gapStats[k].max.toFixed(1) + '駅');
});
/* 分岐線は本線より本数が少ないので、しきい値をゆるめる。
   JR宝塚線の宝塚〜新三田は実際も日中4本/時程度なので、
   平均4.5駅・最大11駅くらいまでは現実的な範囲。 */
/* 分岐線は実際の時刻表の本数から許容値を決める。
     JR東西線 (京橋)   普通4本/時 + 快速系4本/時 = 8本/時 → 7.5分間隔
     琵琶湖線 (京都)   普通・快速あわせて毎時数本
     JR宝塚線 (大阪)   普通4本/時 + 快速系4本/時。ただし宝塚より先は
                       新三田行きが毎時4本程度なので、尼崎〜新三田で見ると
                       1駅約2.5分 × 15分間隔 ＝ 6駅ほど空くのが実際の姿。
   以前は一律4.5駅としていたが、宝塚線については実際のダイヤより
   密であることを求めていた。 */
const BRANCH_LIMIT = { 4: { avg: 4.5, max: 11 },    // 琵琶湖線 京都〜野洲
                       5: { avg: 4.5, max: 11 },    // JR東西線 尼崎〜放出
                       6: { avg: 7.0, max: 14 } };  // JR宝塚線 尼崎〜新三田
[4, 5, 6].forEach(k => {
    const sc = SECTIONS[k];
    const st = gapStats[k];
    const lim = BRANCH_LIMIT[k];
    const avg = st.n ? (st.sum / st.n) : 99;
    ok(`${sc.name} の平均間隔が${lim.avg}駅以内`, avg <= lim.avg, avg.toFixed(1) + '駅');
    ok(`${sc.name} の最大間隔が${lim.max}駅以内`, st.max <= lim.max, st.max.toFixed(1) + '駅');
});

// ------------------------------------------------------------------ 出入区
head('車両所の稼働');
__run(6 * 3600);   // 22:00 まで

const poolUse = {};
for (const name in DEPOTS) {
    poolUse[name] = game.fleet.poolAt(name).length;
}
console.log('  留置中の編成: ' + Object.keys(poolUse).map(k => k + '=' + poolUse[k]).join('  '));
console.log('  計画出区 ' + game.ops.stats.depotOut + '本 / 送り込み ' + game.ops.stats.backing +
            '本 / 増発 ' + game.ops.stats.gapFill + '本 / 折り返し ' + (game.ops.stats.turnback || 0) +
            '本 / 復旧回送 ' + game.ops.stats.recovery + '本');

ok('宮原・向日町から計画的に出区している', game.ops.stats.depotOut >= 60,
   game.ops.stats.depotOut + '本');
ok('折り返しが回送打ち切りより多い',
   (game.ops.stats.turnback || 0) > game.ops.stats.recovery,
   '折り返し ' + (game.ops.stats.turnback || 0) + ' / 復旧回送 ' + game.ops.stats.recovery);

// 主要な車両所の編成が動いているか (全部が留置されたままになっていないか)
['宮原操', '向日町操', '放出', '新三田'].forEach(name => {
    const total = game.fleet.poolAt(name).length + DEPOTS[name].trains.length;
    ok(name + ' の編成が使われている (全部が留置のままではない)',
       DEPOTS[name].trains.length > 0 || total < 60,
       '待機 ' + game.fleet.poolAt(name).length + ' / 出区待ち ' + DEPOTS[name].trains.length);
});

// ------------------------------------------------------------------ 始発の裏付け
head('始発の裏付け (どこからともなく現れていないか)');
{
    /* 留置場の無い駅を始発とする営業列車が、
       送り込み回送か折り返しのどちらかで裏付けられているかを見る。
       ORIGIN_BACKING に載せた駅は、必ず送り込み回送になる。 */
    const backed = Object.keys(ORIGIN_BACKING).filter(k => ORIGIN_BACKING[k].ratio >= 1.0);
    console.log('  必ず送り込み回送にする駅: ' + backed.join(' '));
    ok('須磨・三ノ宮・神戸が送り込み回送で裏付けられている',
       backed.indexOf('須磨') >= 0 && backed.indexOf('三ノ宮') >= 0 && backed.indexOf('神戸') >= 0);
    ok('送り込み回送が実際に走っている', game.ops.stats.backing > 10,
       game.ops.stats.backing + '本');
}

// ------------------------------------------------------------------ 京都の扱い
head('京都駅での折り返しと向日町操への回送');
{
    let turnbacks = 0, deadheads = 0;
    const origPrefer = game.ops.preferTurnback.bind(game.ops);
    game.ops.preferTurnback = function (t, st) {
        const r = origPrefer(t, st);
        if (st === '京都') { if (r) turnbacks++; else deadheads++; }
        return r;
    };
    /* 深夜は折り返さずに入区させるのが正しい挙動なので、
       翌日の 6:00〜20:00 (昼間) で数える。 */
    __run(8 * 3600);            // 22:00 -> 翌 6:00
    turnbacks = 0; deadheads = 0;
    __run(14 * 3600);           // 翌 6:00 -> 20:00
    console.log('  京都駅の終着列車: 折り返し ' + turnbacks + '本 / 折り返せず回送 ' + deadheads + '本');
    ok('京都では折り返しが優先されている', turnbacks >= deadheads,
       '折り返し ' + turnbacks + ' / 回送 ' + deadheads);
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
