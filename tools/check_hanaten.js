/* 学研都市線の徳庵・放出での追い抜きと、放出 2番・3番の使い方を見る。

   使い方: node tools/harness.js --seed=20260922 tools/check_hanaten.js

   ■ 利用者の指定
     ・学研都市線の快速は、ふだんの運転では徳庵・放出で普通を追い抜かない。
     ・放出の 2番・3番 に入れるのは、放出で始発・終着・折り返しをする列車だけ。
       通る列車は 1番・4番 に入る。
   ■ 見ること (4:00 から 20時間)
     ・徳庵・放出で、あとから着いた快速が、先に着いていた (そこを通る) 普通より先に発車した回数 … 0
       (輸送障害で学研都市線・JR東西線が見合わせているあいだの分は別に数え、合否には入れない)
     ・放出の 2番・3番 に入った「放出を通る」列車 … 0
     ・この決まりで放出・徳庵の手前に列車が詰まらない (放出を通った列車の本数が極端に減らない)
*/
'use strict';
__boot();
// 直す前の版と比べるとき用 (js/13-train-hold.js の usesStationLocally と同じ)
if (!Train.prototype.usesStationLocally) Train.prototype.usesStationLocally = function (st) {
    return this.dest === st || this.startName === st || !!(this.serviceChange && this.serviceChange.at === st) ||
           lineEndForBeyond(this.dest) === st;
};
let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
const STS = ['放出', '徳庵'];
const TRACKS_ = ['Tozai_Up', 'Tozai_Down'];

/** 学研都市線・JR東西線のどこかが見合わせ中か */
function tozaiDisrupted(g) {
    const s = g.trackMgr.suspendedSections || {};
    return TRACKS_.some(t => (s[t] || []).length > 0) || !!g.isEmergency;
}

const present = {};     // 駅|線路 -> Map(train -> {arr, through})
const seq = { n: 0 };
let overtakes = 0, overtakesDisrupted = 0;
const overtakeLog = [];
const throughOn23 = [];
let localOn23 = 0;
const passed = new Set();
const seenLane = new Set();

__run(20 * 3600, (g) => {
    const disrupted = tozaiDisrupted(g);
    for (const st of STS) for (const tid of TRACKS_) {
        const b = stationBlockOn(g, tid, st);
        if (!b) continue;
        const key = st + '|' + tid;
        const m = present[key] || (present[key] = new Map());
        const now = new Set();
        b.lanes.forEach((t, lane) => {
            if (!t) return;
            now.add(t);
            if (!m.has(t)) m.set(t, { arr: ++seq.n, through: !t.usesStationLocally(st), type: t.type, no: t.trainNo });
            // 放出 2番・3番
            if (st === '放出') {
                const label = String(displayPlatformLabel(st, tid, lane));
                const k = t.id + '|' + tid + '|' + label;
                if ((label === '2' || label === '3') && !seenLane.has(k)) {
                    seenLane.add(k);
                    if (t.usesStationLocally(st) || t.state === 'in_depot' || t.type === '回送') localOn23++;
                    else throughOn23.push(`${t.trainNo}(${t.type} ${t.startName}→${t.dest}) ${label}番 ${fmt(g.currentTime)}`);
                }
                if (m.get(t).through) passed.add(t.id + '|' + t.trainNo);
            }
        });
        // 発車した (駅のブロックから居なくなった) 列車
        for (const [t, info] of Array.from(m.entries())) {
            if (now.has(t)) continue;
            m.delete(t);
            if (info.type !== '快速' || !info.through) continue;
            // まだ駅に居る、先に着いていた「通る普通」
            for (const [u, ui] of m.entries()) {
                if (ui.arr < info.arr && ui.type === '普通' && ui.through && u.dir === t.dir) {
                    if (disrupted) overtakesDisrupted++;
                    else { overtakes++; overtakeLog.push(`${st} ${info.no}(快速) が ${ui.no}(普通) を追い抜き ${fmt(g.currentTime)}`); }
                    break;
                }
            }
        }
    }
});

function fmt(sec) {
    const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
    return h + ':' + String(m).padStart(2, '0');
}

console.log('\n=== 徳庵・放出での追い抜き ===');
console.log('  ふだんの運転: ' + overtakes + '回 / 見合わせ中: ' + overtakesDisrupted + '回');
overtakeLog.slice(0, 10).forEach(s => console.log('    ' + s));
ok('ふだんの運転で、快速が徳庵・放出で普通を追い抜かない', overtakes === 0, overtakes + '回');

console.log('\n=== 放出 2番・3番 ===');
console.log('  放出で始発・終着・折り返しの列車: ' + localOn23 + '本 / 通る列車: ' + throughOn23.length + '本');
throughOn23.slice(0, 10).forEach(s => console.log('    ' + s));
ok('放出を通る列車が 2番・3番 に入らない', throughOn23.length === 0, throughOn23.length + '本');
ok('放出の 2番・3番 は始発・終着・折り返しの列車が使っている', localOn23 >= 10, localOn23 + '本');
ok('放出を通る列車が走っている (この決まりで詰まっていない)', passed.size >= 100, passed.size + '本');

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
