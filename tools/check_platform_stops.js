/* 旅客列車がホームの無い線で客扱いの停車をしないかを見る。

   使い方: node tools/harness.js --seed=20260922 tools/check_platform_stops.js

   ■ 利用者の指定
     芦屋の通過線 (ホームの無い線) に新快速が停車していた。
     旅客列車は、少なくとも片側にホームのある線でしかドアを開け閉めしない。全駅に当てる。
   ■ 見ること
     ・1日走らせて、旅客列車 (普通・快速・新快速・特急) が駅の「ホームの無い線」で
       客扱いの停車 (stopped / 発車待ち) をした回数が 0
     ・ホームの無い線を通過する列車はいてよい (通過線として使われている)
     ・ホームのある線へ入れない線路に回った列車は、その駅を通過する (客扱いをしない)
     ・山科の外側線・湖西線は 1番・4番のりばに停まる (番線の定義に無いホーム。PLATFORM_OUTSIDE_LANE_DATA)
     ・指令の着発番線変更で、停まる駅のホームの無い線は選べない
*/
'use strict';
__boot();
let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
const TYPES = ['普通', '快速', '新快速', '特急'];
const bad = {}, passes = {};
let observed = 0;
/* ホームの決まりで列車が駅の手前に詰まらないか (この決まりを最初に入れたとき、山科などで
   番線の定義の足りない線に入れず、琵琶湖線の上りが1日14本まで落ちた) */
const flow = {}; const flowSeen = new Set();
const FLOW_AT = ['野洲', '山科', '茨木', '芦屋', '須磨', 'JR総持寺'];
__run(20 * 3600, (g) => {
    g.trains.forEach(t => {
        if (t.state !== 'finished' && !/Kosei|Hoppo|Frt|Fukuchi|Tozai/.test(t.trackId)) {
            const bb = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
            const nm = bb && bb.isStation ? blockStationName(bb) : '';
            if (FLOW_AT.indexOf(nm) >= 0) {
                const key = t.id + '|' + t.trainNo + '|' + nm;
                if (!flowSeen.has(key)) { flowSeen.add(key); flow[nm + (t.dir === 1 ? ' 上り' : ' 下り')] = (flow[nm + (t.dir === 1 ? ' 上り' : ' 下り')] || 0) + 1; }
            }
        }
        if (TYPES.indexOf(t.type) < 0 || t.state === 'finished' || t.state === 'in_depot') return;
        const b = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
        if (!b || !(b.isStation || b.hoppoStationName)) return;
        const st = blockStationName(b);
        if (!STATION_PLATFORM_RULES[st]) return;
        observed++;
        if (laneHasPlatform(st, t.trackId, t.lane)) return;
        const lbl = platformLabelOf(st, t.trackId, t.lane) || '?';
        // 客扱いの停車 = 停車中・発車待ち・折り返し (信号待ちの holding は通過待ちなので除く)
        if (['stopped', 'waiting_start', 'turning_back'].indexOf(t.state) >= 0 && t.hasStoppedAtCurrent !== false &&
            !t.isManuallySuspended && !t.minorTrouble && t.passengerStopsAt(st) &&
            t.crossingOutAt !== st) {          // 客扱いを済ませ、渡り線で隣の線路へ出ていく途中 (西明石の内側線→外側線) は停車ではない
            const k = st + ' ' + lbl + ' ' + t.type;
            bad[k] = (bad[k] || 0) + 1;
        } else {
            const k = st + ' ' + lbl;
            passes[k] = (passes[k] || 0) + 1;
        }
    });
});
const badKeys = Object.keys(bad);
ok('旅客列車がホームの無い線で客扱いの停車をしていない', badKeys.length === 0,
   badKeys.slice(0, 8).map(k => k + '×' + bad[k]).join(' / '));
console.log('  観測 ' + observed + ' 回 / ホームの無い線を通過・通過待ち: ' +
            Object.keys(passes).slice(0, 8).map(k => k + '×' + passes[k]).join(' '));
const thin = Object.keys(flow).filter(k => flow[k] < 60);
console.log('  20時間の本数: ' + Object.keys(flow).sort().map(k => k + ' ' + flow[k]).join(' / '));
ok('ホームの決まりで駅の手前に列車が詰まらない (各駅 上下とも20時間で60本以上)', thin.length === 0 && Object.keys(flow).length === FLOW_AT.length * 2,
   thin.map(k => k + ' ' + flow[k]).join(', '));
ok('芦屋の通過線は、ホームの無い線として定義されたまま', !laneHasPlatform('芦屋', 'Down_Out', 1) || !laneHasPlatform('芦屋', 'Up_Out', 1) ||
   STATION_PLATFORM_RULES['芦屋'].lanes.filter(x => !x).length === 2);
// 指令の番線変更
const t = game.trains.find(x => x.type === '新快速' && x.state === 'running' && trainStationsAhead(game, x, 6).indexOf('芦屋') > 0);
if (t) {
    const c = trackChangeCandidates(game, t, '芦屋').filter(o => /下通|上通/.test(o.text));
    ok('停まる駅のホームの無い線は、番線変更の候補で選べない', c.length > 0 && c.every(o => o.disabled), c.map(o => o.text + (o.disabled ? '×' : '○')).join(' '));
} else console.log('  (芦屋へ向かう新快速がいないので番線変更の確認は飛ばす)');
console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
