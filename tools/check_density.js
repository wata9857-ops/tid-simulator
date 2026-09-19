/* 列車の密度を測る検証ツール。
   使い方: node tools/harness.js tools/check_density.js

   ・時間帯ごとの在線本数 (線区・種別)
   ・生成本数 / 折り返し回数
   ・大阪 上り内側線での続行間隔 (分)
*/
'use strict';
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;

const spawnByHour = {};   // hour -> {type: n}
const origAdd = game.addTrain.bind(game);
game.addTrain = function (d) {
    const r = origAdd(d);
    if (r) {
        const h = Math.floor((game.currentTime / 3600) % 24);
        spawnByHour[h] = spawnByHour[h] || {};
        spawnByHour[h][d.type] = (spawnByHour[h][d.type] || 0) + 1;
    }
    return r;
};

const snap = [];          // 毎時の在線
const headways = {};      // spot -> [times]
const lastAt = {};
const prev = new Map();

const SPOTS = [
  { k: '大阪上り内 普通', track: 'Up_In', st: '大阪', dir: 1, type: '普通' },
  { k: '大阪上り内 全部', track: 'Up_In', st: '大阪', dir: 1, type: null },
  { k: '大阪下り内 普通', track: 'Down_In', st: '大阪', dir: -1, type: '普通' },
  { k: '大阪上り外 全部', track: 'Up_Out', st: '大阪', dir: 1, type: null }
];

for (let i = 0; i < 24 * 3600 / CONFIG.TICK_SEC; i++) {
    game.update();
    const h = (game.currentTime / 3600) % 24;

    for (const t of game.trains) {
        const pos = t.trackId + '#' + t.currBlockIndex;
        const p = prev.get(t.id);
        prev.set(t.id, pos);
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        if (!p || p === pos) continue;
        SPOTS.forEach(s => {
            if (t.trackId !== s.track || t.dir !== s.dir) return;
            if (s.type && t.type !== s.type) return;
            const blks = game.trackMgr.blocks[t.trackId];
            const pb = blks && blks[t.currBlockIndex - t.dir];
            if (!pb || blockStationName(pb) !== s.st) return;
            if (lastAt[s.k] !== undefined) {
                (headways[s.k] = headways[s.k] || []).push(
                    { t: game.currentTime, gap: (game.currentTime - lastAt[s.k]) / 60 });
            }
            lastAt[s.k] = game.currentTime;
        });
    }

    if (Math.abs(h - Math.round(h)) < 1e-9 || (i % (3600 / CONFIG.TICK_SEC) === 0)) {
        const o = { h: h.toFixed(0) };
        ['普通','快速','新快速','特急','貨物','回送'].forEach(ty => {
            o['m' + ty] = ttActiveCount(game, 'main', ty);
            o['b' + ty] = ttActiveCount(game, 'branch', ty);
        });
        o.all = game.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot').length;
        snap.push(o);
    }
}

console.log('=== 時間帯ごとの在線本数 ===');
console.log('時  在線   本線:普通/快速/新快速/特急/貨物/回送   分岐:普通/快速');
snap.forEach(o => {
    console.log(String(o.h).padStart(2) + '  ' + String(o.all).padStart(4) + '   ' +
      [o.m普通, o.m快速, o.m新快速, o.m特急, o.m貨物, o.m回送].map(n => String(n).padStart(3)).join('/') +
      '       ' + [o.b普通, o.b快速].map(n => String(n).padStart(3)).join('/'));
});

console.log('\n=== 生成本数 (1時間ごと) ===');
Object.keys(spawnByHour).sort((a,b)=>a-b).forEach(h => {
    const o = spawnByHour[h];
    console.log(String(h).padStart(2) + '時  ' +
      Object.keys(o).map(k => k + ':' + o[k]).join('  '));
});

console.log('\n=== 続行間隔 (昼間 10〜16時) ===');
Object.keys(headways).forEach(k => {
    const g = headways[k].filter(x => (x.t/3600)%24 >= 10 && (x.t/3600)%24 < 16).map(x => x.gap);
    if (!g.length) { console.log('  ' + k + ' : 計測なし'); return; }
    g.sort((a,b)=>a-b);
    const avg = g.reduce((a,b)=>a+b,0)/g.length;
    const under2 = g.filter(x => x < 2).length;
    console.log('  ' + k.padEnd(16) + ' n=' + String(g.length).padStart(3) +
      '  平均 ' + avg.toFixed(2) + '分  最短 ' + g[0].toFixed(2) +
      '  中央 ' + g[Math.floor(g.length/2)].toFixed(2) +
      '  2分未満 ' + under2 + '本');
});
