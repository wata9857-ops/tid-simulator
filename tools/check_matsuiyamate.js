/* 松井山手 (単線の入口) の詰まり・朝の京都発の快速・宮原からの大阪始発 を見る (利用者の指摘 2026-10 1.3.4.)
   使い方: node tools/harness.js --seed=20260922 tools/check_matsuiyamate.js */
'use strict';
__boot();
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }

const mIdx = STATION_MAP['松井山手'] * UNITS_PER_STATION;
let maxStuck = 0, maxStuckNo = '';
const early = new Set(), earlyStops = [], osakaFukuchi = new Set();
let last = 0;
__run(22 * 3600, () => {
    const now = game.currentTime;
    if (now - last < 30) return;
    last = now;
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot' || t.overnightStable || !/^Tozai/.test(t.trackId || '')) continue;
        // 松井山手と隣の駅 (長尾〜大住) だけ。京田辺より先の行き違い待ちは単線のふつうの待ち
        if (Math.abs(t.currBlockIndex - mIdx) > UNITS_PER_STATION) continue;
        if ((t.stuckTime || 0) > maxStuck) { maxStuck = t.stuckTime; maxStuckNo = t.trainNo; }
    }
    for (const t of game.trains) {
        if (t.kyotoEarlyNo && t.kyotoEarlyNo === t.trainNo) {
            early.add(t.trainNo);
            const b = (game.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
            // 抑止・故障で止まっているのは客扱いの停車ではない
            if (b && isRealStationBlock(b) && t.state === 'stopped' && !t.isManuallySuspended && !t.minorTrouble && !t.commIncident) {
                const si = b.stationIdx;
                if (si > STATION_MAP['高槻'] && si < STATION_MAP['京都']) earlyStops.push(t.trainNo + '@' + blockStationName(b));
            }
        }
        if (t.startName === '大阪' && t.dir === -1 && /^Fukuchi/.test(t.trackId || '')) osakaFukuchi.add(t.trainNo);
    }
});
const st = DISPATCH_RULE_STATS;
ok('松井山手の前後で 20分以上動けない列車が無い', maxStuck < 1200, Math.round(maxStuck) + '秒 ' + maxStuckNo + ' / 詰まりをほどいた ' + st.singleJam + '回');
ok('朝の京都発の快速がある', early.size > 0, early.size + '本');
ok('朝の京都発の快速は京都〜高槻に停まらない', earlyStops.length === 0, earlyStops.slice(0, 5).join(', '));
ok('大阪始発の JR宝塚線の列車がある', osakaFukuchi.size > 0, osakaFukuchi.size + '本');
console.log(fails.length ? '\n>>> 不合格 ' + fails.length : '\n>>> すべて合格');
