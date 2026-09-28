/* 尼崎とその周り (立花・塚口・加島/北新地・大阪方) の遅れと詰まりを測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_amagasaki.js [--inject]

   ■ 見ること
     1. 尼崎を発車した列車の遅れ (平均・95%点)。一日 (5〜24時) と朝の混雑 (7〜9時)
     2. 尼崎から2駅の中で 1分以上動けない列車 (列車×Tick)
     3. 尼崎を発車した本数 (流しすぎ・止めすぎの見張り)
     4. --inject … 8:00 に 塚口〜尼崎 へ向かう JR宝塚線の上りを 5分止め、その遅れが周りにどれだけ広がるか
*/
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;
const INJECT = __argv.indexOf('--inject') >= 0;
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

const AMA = STATION_MAP['尼崎'];
const NEAR = UNITS_PER_STATION * 2;
const amaIdx = {};
for (const tid in game.trackMgr.blocks) {
    const b = game.trackMgr.blocks[tid].find(x => x.stationIdx === AMA && x.x !== -1000);
    if (b) amaIdx[tid] = b.index;
}
const rec = { day: [], rush: [] };
const stuck = { day: 0, rush: 0 };
let maxStuck = 0, maxStuckWho = '';
const at = new Map();          // 列車 -> 尼崎に居たか
const hist = {};
let injected = null, injectDone = false;

function nearAma(t) {
    const i0 = amaIdx[t.trackId];
    return i0 !== undefined && Math.abs(t.currBlockIndex - i0) <= NEAR;
}
function atAma(t) {
    const bs = game.trackMgr.blocks[t.trackId];
    const b = bs && bs[t.currBlockIndex];
    return !!(b && b.stationIdx === AMA);
}

// 4:00 → 5:00
__run(3600);
__run(19 * 3600, () => {
    const h = (game.currentTime / 3600) % 24;
    const rush = h >= 7 && h < 9;
    if (INJECT && !injectDone && h >= 8.0) {
        const i0 = amaIdx['Fukuchi_Up'];
        const cand = game.trains.filter(t => t.trackId === 'Fukuchi_Up' && t.state === 'running' && t.dir === 1 &&
            i0 !== undefined && (i0 - t.currBlockIndex) > 2 && (i0 - t.currBlockIndex) <= UNITS_PER_STATION * 3);
        if (cand.length) {
            const t = cand[0];
            t.state = 'stopped'; t.minorTrouble = true; t.minorTroubleTimer = 300; t.isJudging = false;
            t.troubleInfo = { active: true, cause: '検証 (5分停止)', status: '' };
            injected = t; injectDone = true;
            console.log('  [注入] ' + t.trainNo + ' ' + t.type + ' ' + t.dest + '行き を 5分止めた');
        }
    }
    if (injected && injected.minorTrouble && injected.minorTroubleTimer <= 0 && injected.state === 'stopped') {
        injected.minorTrouble = false; injected.troubleInfo = { active: false, cause: '', status: '' };
        injected.state = 'running'; injected.timer = 15; injected = null;
    }
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const was = at.get(t.id);
        const now = atAma(t);
        at.set(t.id, now);
        if (was && !now && t.hasDeparted && t.type !== '回送' && t.type !== '貨物') {
            rec.day.push(t.delayTime || 0);
            if (rush) rec.rush.push(t.delayTime || 0);
        }
        if (nearAma(t) && t.stuckTime > 60 && !(t.minorTrouble)) {
            stuck.day++; if (rush) stuck.rush++;
            const k = t.trackId + ' ' + (t.currBlockIndex - amaIdx[t.trackId]) + ' ' + t.state + ' ' + t.type + (__argv.indexOf('--why') >= 0 ? ' ' + t._holdWhy : '');
            hist[k] = (hist[k] || 0) + 1;
            if (t.stuckTime > maxStuck) { maxStuck = t.stuckTime; maxStuckWho = t.trainNo + ' ' + t.trackId + '#' + t.currBlockIndex + ' ' + h.toFixed(2) + '時'; }
        }
    }
});

function stat(a) {
    if (!a.length) return { n: 0, avg: 0, p95: 0 };
    const s = a.slice().sort((x, y) => x - y);
    return { n: a.length, avg: s.reduce((p, x) => p + x, 0) / s.length, p95: s[Math.floor(s.length * 0.95)] };
}
const d = stat(rec.day), r = stat(rec.rush);
console.log('=== 尼崎を発車した列車の遅れ' + (INJECT ? ' (8:00 に宝塚線上りを5分止めた)' : '') + ' ===');
console.log(`  一日 (5〜24時): ${d.n}本  平均 ${d.avg.toFixed(0)}秒  95%点 ${d.p95.toFixed(0)}秒`);
console.log(`  朝 (7〜9時)   : ${r.n}本  平均 ${r.avg.toFixed(0)}秒  95%点 ${r.p95.toFixed(0)}秒`);
console.log(`=== 尼崎から2駅の中で1分以上動けない列車 (列車×Tick): 一日 ${stuck.day} / 朝 ${stuck.rush}`);
console.log(`  いちばん長く動けなかった列車: ${maxStuck.toFixed(0)}秒 ${maxStuckWho}`);
if (__argv.indexOf('--hist') >= 0) Object.keys(hist).sort((a, b) => hist[b] - hist[a]).slice(0, 40).forEach(k => console.log('    ' + k + '  ' + hist[k]));
console.log('AMA_JSON ' + JSON.stringify({ n: d.n, avg: +d.avg.toFixed(1), p95: d.p95, rn: r.n, ravg: +r.avg.toFixed(1), rp95: r.p95, stuck: stuck.day, rstuck: stuck.rush, maxStuck: Math.round(maxStuck) }));
ok('尼崎の近くで 20分以上動けない列車がいない (詰まりの見張り)', maxStuck < 1200, maxStuck.toFixed(0) + '秒');
ok('尼崎を1日 700本以上発車している (止めすぎていない)', d.n >= 700, d.n + '本');
console.log('\n' + (fails.length === 0 ? '>>> すべて合格' : '>>> ' + fails.length + ' 件 不合格'));
