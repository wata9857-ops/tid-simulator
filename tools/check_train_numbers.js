/* 列車番号の決まりを見る (利用者の指摘 ④ 2026-10)。
   使い方: node tools/harness.js --seed=20260922 tools/check_train_numbers.js

   1. 下りは奇数・上りは偶数 (特急は号の数字。サンダーバードは 大阪→敦賀 が下り)
   2. 走っている列車どうしで同じ番号が無い
   3. 5418M を使わない
   4. 特急の番号は 2桁以下か、百の位が 0 の4桁
   5. 末尾: JR京都線・JR神戸線の普通は C、高槻〜西明石を通る快速は T、学研都市線・東西線は 4桁
   6. 区間快速・丹波路快速・「快速 (高槻〜西明石間 快速)」の呼び方が出る
   文書の筋の事業用列車・催しの臨時は、その文書の番号のままなので数えない。 */
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }
const seen = new Map();
const pend = [];
let dupTicks = 0; const dupEx = [];
const prob = {}; const probEx = {};
const labels = {};
let gakkenTotal = 0, gakkenBad = 0, cLocal = 0, cLocalBad = 0, tRapid = 0, tRapidBad = 0;
__run(20 * 3600, () => {
    const live = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot' && t.trainNo);
    const cnt = {};
    for (const t of live) cnt[t.trainNo] = (cnt[t.trainNo] || 0) + 1;
    const d = Object.keys(cnt).filter(k => cnt[k] > 1);
    if (d.length) { dupTicks++; if (dupEx.length < 3) dupEx.push(d.map(no => live.filter(t => t.trainNo === no).map(t => no + ' ' + t.type + ' ' + t.startName + '→' + t.dest + ' ' + t.state).join(' & ')).join(',')); }
    for (const q of pend.splice(0)) {
        if (q.t.trainNo !== q.no || q.t.dir !== q.dir || q.t.state === 'finished') continue;
        seen.set(q.k, true);
        for (const p of q.ps) { prob[p] = (prob[p] || 0) + 1; (probEx[p] = probEx[p] || []).length < 4 && probEx[p].push(q.t.trainNo + ' ' + q.t.type + ' ' + q.t.startName + '→' + q.t.dest); }
    }
    for (const t of live) {
        const k = t.trainNo + '|' + t.type + '|' + t.dir;
        if (seen.has(k)) continue;
        seen.set(k, true);
        /* 奇偶は次の Tick にも残っていたら数える (向きを変えた回送はその Tick のうちに番号を付け直すが、
           向きが変わるのが番号を見直したあとになることがある) */
        const ps = trainNoProblems(t);
        if (ps.length) pend.push({ t: t, no: t.trainNo, dir: t.dir, ps: ps, k: k });
        else seen.set(k, true);
        if (ps.length) seen.delete(k);
        const lab = trainServiceName(t);
        labels[lab] = (labels[lab] || 0) + 1;
        if (t.workPermit || t.eventTrainNo) continue;
        const line = trainNoLineOf(t.type, t.trackId, t.startName, t.dest);
        if ((t.type === '普通' || t.type === '快速') && line === 'tozai') {
            gakkenTotal++;
            if (!/^[45][45]\d\d[MC]$/.test(t.trainNo)) gakkenBad++;
        }
        const inKK = [t.startName, t.dest].every(n => STATION_MAP[n] !== undefined && STATION_MAP[n] <= STATION_MAP['京都'] && STATION_MAP[n] >= STATION_MAP['加古川']);
        if (t.type === '普通' && line === 'main' && inKK) { cLocal++; if (!/C$/.test(t.trainNo)) { cLocalBad++; dupEx.push('C?: ' + t.trainNo + ' ' + t.startName + '→' + t.dest + ' ' + t.trackId); } }
        if (t.type === '快速' && line === 'main') { tRapid++; if (!/^[78]\d\dT$/.test(t.trainNo)) tRapidBad++; }
    }
});
console.log('=== 列車番号 (20時間) ===  列車 ' + seen.size + '本');
Object.keys(prob).forEach(p => console.log('  ' + p + ' ' + prob[p] + '本  例: ' + probEx[p].join(' / ')));
console.log('  種別の呼び方: ' + Object.keys(labels).sort((a, b) => labels[b] - labels[a]).map(k => k + ' ' + labels[k]).join(' / '));
ok('下り奇数・上り偶数', !prob['下りなのに偶数'] && !prob['上りなのに奇数'], ((prob['下りなのに偶数'] || 0) + (prob['上りなのに奇数'] || 0)) + '本');
ok('走っている列車どうしで番号が重ならない', dupTicks === 0, dupTicks + ' Tick ' + dupEx.join(' | '));
ok('5418M を使わない', !prob['永久欠番']);
ok('特急の番号の桁', !prob['特急の桁']);
ok('京都〜加古川の中を走る普通は C', cLocalBad === 0, cLocalBad + '/' + cLocal + (cLocalBad ? ' ' + dupEx.filter(x => /^C\?/.test(x)).join(' | ') : ''));
ok('高槻〜西明石を通る快速は 7xx/8xxT', tRapidBad === 0, tRapidBad + '/' + tRapid);
ok('学研都市線・JR東西線は 4桁 (千の位 4/5・百の位 4/5)', gakkenBad === 0, gakkenBad + '/' + gakkenTotal);
ok('区間快速が出る', (labels['区間快速'] || 0) > 0, (labels['区間快速'] || 0) + '本');
ok('快速で走る区間を添えて出す', Object.keys(labels).some(k => /間 快速/.test(k)));
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
