/* 走っている本数が、実際の駅時刻表と合っているかを検証する。
   使い方: node tools/harness.js tools/check_timetable.js

   同梱の駅時刻表 (osaka1.pdf / osaka3.pdf / nishiakashi1.pdf /
   kyoubashi1.pdf / kyoto1.pdf / 駅時刻表_JRおでかけネット.html) から
   平日昼間 (10〜16時) の1時間あたり本数を読み取り、それを「正解」として、
   シミュレーターの発車本数・所要時間・詰まり具合を測る。

   本数だけでなく所要時間も見るのは、遅い列車は線路に長く居座るため、
   本数が合っていても線路が埋まって団子運転になるから。
*/
'use strict';

__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* ------------------------------------------------------------------
   実際の駅時刻表 (2026/09/13) の平日昼間 10〜16時の1時間あたり本数
------------------------------------------------------------------ */
const SPOTS = [
    { n: '大阪 上り(京都方面)', tracks: ['Up_In', 'Up_Out'],   st: '大阪',   dir: 1,
      real: { '普通': 8, '快速': 4, '新快速': 4 }, realTotal: 22 },
    { n: '大阪 下り(神戸方面)', tracks: ['Down_In', 'Down_Out'], st: '大阪', dir: -1,
      real: { '普通': 4, '快速': 4, '新快速': 4 }, realTotal: 13 },
    { n: '西明石 上り',        tracks: ['Up_In', 'Up_Out'],   st: '西明石', dir: 1,
      real: { '普通': 5, '快速': 4, '新快速': 4 }, realTotal: 13 },
    { n: 'JR宝塚線 下り',      tracks: ['Fukuchi_Down'],      st: '尼崎',   dir: -1,
      real: { '普通': 4, '快速': 4 }, realTotal: 9 },
    { n: 'JR東西線 下り',      tracks: ['Tozai_Down'],        st: '京橋',   dir: -1,
      real: { '普通': 4, '快速': 4 }, realTotal: 8 },
    { n: '湖西線 下り',        tracks: ['Kosei_Down'],        st: '大津京', dir: -1,
      real: { '普通': 3 }, realTotal: 6 }
];

/* 実際の1駅あたり所要時間 (大阪〜京都 42.8km / 駅間16 から) */
const REAL_MIN_PER_STATION = { '新快速': 1.75, '快速': 2.06, '普通': 2.80 };

const H0 = 10, H1 = 16, HRS = H1 - H0;
const seen = SPOTS.map(() => ({}));
const byType = SPOTS.map(() => ({}));
const prev = new Map();
const runMark = new Map();
const runs = {};
let blockedSamples = 0, totalSamples = 0;

for (let i = 0; i < 24 * 3600 / CONFIG.TICK_SEC; i++) {
    game.update();
    const h = (game.currentTime / 3600) % 24;

    for (const t of game.trains) {
        const pos = t.trackId + '#' + t.currBlockIndex;
        const p = prev.get(t.id);
        prev.set(t.id, pos);

        if (h < H0 || h >= H1) continue;
        if (t.state === 'finished' || t.state === 'in_depot') continue;

        // --- 発車本数 (その駅のブロックを出た瞬間を1本と数える)
        if (p && p !== pos) {
            SPOTS.forEach((s, k) => {
                if (s.tracks.indexOf(t.trackId) < 0 || t.dir !== s.dir) return;
                const blks = game.trackMgr.blocks[t.trackId];
                const pb = blks && blks[t.currBlockIndex - t.dir];
                if (!pb || blockStationName(pb) !== s.st) return;
                const id = t.id + '|' + t.trainNo;
                if (seen[k][id]) return;
                seen[k][id] = 1;
                byType[k][t.type] = (byType[k][t.type] || 0) + 1;
            });
        }

        // --- 1駅あたり所要時間
        const blks2 = game.trackMgr.blocks[t.trackId];
        const b2 = blks2 && blks2[t.currBlockIndex];
        if (b2 && b2.stationIdx !== undefined) {
            const m = runMark.get(t.id);
            if (!m || m.track !== t.trackId) {
                runMark.set(t.id, { t: game.currentTime, idx: b2.stationIdx, track: t.trackId });
            } else {
                const d = Math.abs(b2.stationIdx - m.idx);
                if (d >= 8) {
                    const mins = (game.currentTime - m.t) / 60;
                    runs[t.type] = runs[t.type] || { n: 0, sum: 0 };
                    runs[t.type].n++; runs[t.type].sum += mins / d;
                    runMark.set(t.id, { t: game.currentTime, idx: b2.stationIdx, track: t.trackId });
                }
            }
        }

        // --- 詰まり具合
        if (i % 40 === 0) {
            totalSamples++;
            if ((t.stuckTime || 0) >= 60) blockedSamples++;
        }
    }
}

head('昼間 10〜16時の1時間あたり発車本数 (実際の駅時刻表と比べる)');
SPOTS.forEach((s, k) => {
    const per = (ty) => (byType[k][ty] || 0) / HRS;
    const tot = Object.keys(byType[k]).reduce((a, ty) => a + byType[k][ty], 0) / HRS;
    const det = Object.keys(s.real).map(ty =>
        ty + ' ' + per(ty).toFixed(1) + '/' + s.real[ty]).join('  ');
    console.log('  ' + s.n.padEnd(20) + ' 計 ' + tot.toFixed(1) + '本 (実際 ' + s.realTotal + ')   ' + det);

    /* ここで見たいのは「普通ばかりで快速・新快速が走っていない」という
       偏りが無いことと、「1種別が実際の何倍も走っていない」こと。
       始発駅の取り方や折り返しの回り方で本数は前後するので、
       0.35〜3.5倍までを許し、実際との差は上の行に出す。

       ★残っているずれ (2026-09時点)
         ・大阪の下り普通が実際の約3倍。京都線の普通が神戸線へ
           直通しすぎている (実際は大阪・尼崎止まりが多い)。
         ・湖西線の普通が実際の約2.5倍。折り返しで走り続けるため。
         ・下りの快速が実際の半分ほど。 */
    Object.keys(s.real).forEach(ty => {
        const got = per(ty), want = s.real[ty];
        ok(s.n + ' の' + ty + 'が走っていて、実際と桁違いでない (' + want + '本/時)',
           got >= want * 0.35 && got <= want * 3.5,
           got.toFixed(1) + '本/時 (実際 ' + want + ')');
    });
    // 全体の本数
    ok(s.n + ' の総本数が実際と桁違いでない (' + s.realTotal + '本/時)',
       tot >= s.realTotal * 0.5 && tot <= s.realTotal * 2.2, tot.toFixed(1) + '本/時');
});

head('1駅あたりの所要時間 (実際のダイヤと比べる)');
Object.keys(REAL_MIN_PER_STATION).forEach(ty => {
    const r = runs[ty];
    if (!r || !r.n) { ok(ty + ' の所要時間を測れた', false, '計測なし'); return; }
    const got = r.sum / r.n, want = REAL_MIN_PER_STATION[ty];
    console.log('  ' + ty.padEnd(6) + got.toFixed(2) + ' 分/駅 (実際 ' + want.toFixed(2) + ')');
    /* 続行の減速や停車時分が乗るので実際より遅くなる。
       2.5倍を超えると線路に居座りすぎで団子運転になる。
       (直す前は 普通7.0分/駅 = 実際の2.5倍、新快速5.6分/駅 = 3.2倍だった) */
    ok(ty + ' が実際の2.5倍より遅くない', got <= want * 2.5, got.toFixed(2) + ' 分/駅');
});

head('詰まり具合');
const rate = totalSamples ? (blockedSamples * 100 / totalSamples) : 0;
console.log('  60秒以上進めない列車の割合: ' + rate.toFixed(1) + '%');
ok('線路が詰まりすぎていない (60秒以上の抑止が15%未満)', rate < 15, rate.toFixed(1) + '%');

head('種別ごとの在線本数 (時刻表から出した目安と比べる)');
['普通', '快速', '新快速'].forEach(ty => {
    const n = ttActiveCount(game, 'main', ty);
    const b = TT_ACTIVE_BUDGET.main[ty];
    console.log('  本線 ' + ty.padEnd(4) + n + '本 (目安 ' + b + '本)');
});

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
