/* 分割前・分割後のどちらでも動く、生成本数の集計だけを行うスクリプト。
   どちらも同じ条件(4:00から20時間)で走らせて比べるために使う。

     python tools/extract_baseline.py
     node tools/harness.js --orig tools/check_baseline.js   # 分割前
     node tools/harness.js        tools/check_baseline.js   # 分割後
*/
'use strict';
__boot();

const seen = new Set();
const byType = {};
const byTrack = {};
let spawned = 0;
const hourly = [];
let tick = 0;

__run(20 * 3600, (g) => {
    tick++;
    g.trains.forEach(t => {
        if (t.state === 'finished') return;
        if (seen.has(t.id)) return;
        seen.add(t.id);
        spawned++;
        byType[t.type] = (byType[t.type] || 0) + 1;
        byTrack[t.trackId] = (byTrack[t.trackId] || 0) + 1;
    });
    if (tick % (3600 / CONFIG.TICK_SEC) === 0) {
        // 待機編成の数え方は分割前後で持ち方が違うので両対応にする
        let idle = 0;
        if (g.fleet) idle = g.fleet.totalIdle();
        else STATIONS.forEach(s => { if (s.vehicleQueue) idle += s.vehicleQueue.length; });
        hourly.push({
            h: ((g.currentTime / 3600) % 24).toFixed(0),
            live: g.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot').length,
            idle: idle,
            spawned: spawned
        });
    }
});

const sum = (keys) => keys.reduce((s, k) => s + (byTrack[k] || 0), 0);

console.log('  時 / 在線 / 待機編成 / 累計生成');
hourly.forEach(r => console.log('  ' + String(r.h).padStart(2) + '時  ' +
    String(r.live).padStart(4) + '  ' + String(r.idle).padStart(5) + '  ' + String(r.spawned).padStart(6)));
console.log('  種別別: ' + Object.keys(byType).sort().map(k => k + '=' + byType[k]).join('  '));
console.log('  路線別: ' + Object.keys(byTrack).sort().map(k => k + '=' + byTrack[k]).join('  '));
console.log('');
console.log('  合計生成       : ' + spawned + ' 本');
console.log('  JR東西線       : ' + sum(['Tozai_Up', 'Tozai_Down']) + ' 本');
console.log('  JR宝塚線       : ' + sum(['Fukuchi_Up', 'Fukuchi_Down']) + ' 本');
console.log('  湖西線         : ' + sum(['Kosei_Up', 'Kosei_Down']) + ' 本');
console.log('  待機編成の最小 : ' + Math.min.apply(null, hourly.map(r => r.idle)) + ' 編成');
