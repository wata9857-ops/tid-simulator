/* 本線 (高槻〜尼崎) の普通の本数を、実際の駅時刻表と比べる検証ツール。
   使い方: node tools/harness.js [--seed=N] tools/check_locals.js

   実際の本数 (大阪駅の時刻表 osaka1/3/4.pdf, 2026/09/13, 昼間 10〜16時):
     大阪 上り(京都方面)   普通 8本/時 (:02 :10 :17 :25 :32 :40 :47 :55)
     大阪 下り             神戸線の普通 4本/時 (:08 :23 :38 :53 須磨行き)
                           宝塚線の普通 4本/時 (:00 :15 :30 :45 宝塚行き)
       どちらも「当駅始発」の印が無い = 京都線 (高槻方) から来る列車。
       よって 高槻〜大阪 の普通は 上下とも 8本/時、
       大阪〜尼崎 (内側線) も 上下とも 8本/時 (神戸線4 + 宝塚線4)。
     大阪から上る普通は「無印=高槻行き」4本と「京都行き」4本 (osaka1.pdf) なので、
       高槻〜京都 (長岡京) は 上下とも 4本/時。高槻で 4本/時 が折り返す。
     JR神戸線 (尼崎〜須磨) は、大阪から来る須磨行き 4本/時 と JR東西線から来る普通 4本/時。
       西明石駅の時刻表 (nishiakashi1.pdf) では西明石から上る普通は 5本/時。 */
'use strict';
__boot();
game.incidents.clearAll('検証');
game.incidents.nextAt = Infinity;

const PTS = [
    { st: '長岡京', dir: -1, real: 4 },
    { st: '高槻',  dir: -1, real: 8 }, { st: '茨木', dir: -1, real: 8 },
    { st: '新大阪', dir: -1, real: 8 }, { st: '大阪', dir: -1, real: 8 }, { st: '塚本', dir: -1, real: 8 },
    { st: '塚本',  dir: 1, real: 8 },  { st: '大阪', dir: 1, real: 8 },
    { st: '新大阪', dir: 1, real: 8 }, { st: '茨木', dir: 1, real: 8 }, { st: '高槻', dir: 1, real: 4 },
    { st: '長岡京', dir: 1, real: 4 },
    { st: '芦屋', dir: -1, real: 8 }, { st: '芦屋', dir: 1, real: 8 }, { st: '西明石', dir: 1, real: 5 }
];
const K_IBA_DN = 2, K_SHIN_DN = 3, K_IBA_UP = 9, K_NAG_UP = 11;
const MAIN = ['Up_In', 'Up_Out', 'Down_In', 'Down_Out'];
const cnt = PTS.map(() => ({}));      // hour -> n
const seen = PTS.map(() => ({}));
const prev = new Map();
const destAt = {};                     // 新大阪 下りの普通の行先
const H0 = 10, H1 = 16;
const diag = { dnFrom: {}, upDest: {}, nagUp: {} };
let failures = 0;

for (let i = 0; i < 24 * 3600 / CONFIG.TICK_SEC; i++) {
    game.update();
    const h = Math.floor((game.currentTime / 3600) % 24);
    for (const t of game.trains) {
        const pos = t.trackId + '#' + t.currBlockIndex;
        const p = prev.get(t.id);
        prev.set(t.id, pos);
        if (t.type !== '普通') continue;
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        if (!p || p === pos) continue;
        if (MAIN.indexOf(t.trackId) < 0) continue;
        const blks = game.trackMgr.blocks[t.trackId];
        const pb = blks && blks[t.currBlockIndex - t.dir];
        const sn = pb && blockStationName(pb);
        if (!sn) continue;
        PTS.forEach((s, k) => {
            if (s.dir !== t.dir || s.st !== sn) return;
            const id = t.id + '|' + t.trainNo;
            if (seen[k][id]) return;
            seen[k][id] = 1;
            cnt[k][h] = (cnt[k][h] || 0) + 1;
            if (h >= H0 && h < H1) {
                if (k === K_SHIN_DN) destAt[t.dest] = (destAt[t.dest] || 0) + 1;
                if (k === K_IBA_DN) diag.dnFrom[t.startName] = (diag.dnFrom[t.startName] || 0) + 1;
                if (k === K_NAG_UP) { const dk = t.dest + '<' + t.startName; diag.nagUp[dk] = (diag.nagUp[dk] || 0) + 1; }
                if (k === K_IBA_UP) { const dk = t.dest + '<' + t.startName; diag.upDest[dk] = (diag.upDest[dk] || 0) + 1; }
            }
        });
    }
}

console.log('\n=== 普通の1時間あたり本数 (本線 内側線+外側線) ===');
let hdr = '  地点        実際 昼間平均 |';
for (let h = 6; h < 23; h++) hdr += String(h).padStart(3);
console.log(hdr);
PTS.forEach((s, k) => {
    let sum = 0; for (let h = H0; h < H1; h++) sum += (cnt[k][h] || 0);
    const avg = sum / (H1 - H0);
    let line = '  ' + (s.st + (s.dir < 0 ? ' 下り' : ' 上り')).padEnd(10) + String(s.real).padStart(4) +
        avg.toFixed(1).padStart(8) + '  |';
    for (let h = 6; h < 23; h++) line += String(cnt[k][h] || 0).padStart(3);
    console.log(line);
    s.avg = avg;
});
console.log('\n  新大阪 下り 普通の行先 (昼間): ' + JSON.stringify(destAt));
console.log('  茨木 下り 普通の始発 (昼間): ' + JSON.stringify(diag.dnFrom));
console.log('  茨木 上り 普通の行先 (昼間): ' + JSON.stringify(diag.upDest));
console.log('  長岡京 上り 普通の行先 (昼間): ' + JSON.stringify(diag.nagUp));
const sf = game.spawner.spawnFail || {};
console.log('  普通 生成できなかった理由: ' + JSON.stringify(Object.keys(sf).filter(k => k.indexOf('普通') === 0)
    .reduce((o, k) => (o[k] = sf[k], o), {})));

/* 昼間平均が実際の 0.75〜1.4倍に入っていること */
console.log('');
PTS.forEach(s => {
    const good = s.avg >= s.real * 0.75 && s.avg <= s.real * 1.4;
    if (!good) failures++;
    console.log((good ? '  OK   ' : '  NG   ') + s.st + (s.dir < 0 ? ' 下り' : ' 上り') +
        ' 普通 ' + s.avg.toFixed(1) + '本/時 (実際 ' + s.real + ')');
});
console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
