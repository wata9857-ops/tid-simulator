/* 回送 (送り込み・返却) の本数と、編成の行路が物理的につながっているかを測る。
   使い方: node tools/harness.js --seed=20260922 tools/check_stockflow.js

   ■ 何を見るか
     1. 回送の本数を「始発 → 終着」ごとに数える。
        「京都に着いた列車をとにかく向日町操へ回送する」ような
        偏りが無いかを見る。
     2. 回送が走った線路 (外側線/内側線) の割合。
        回送は列車線 (外側線) を走るのが原則。
     3. 編成の行路 (js/30-duty-log.js) が物理的につながっているか。
        ある編成の1つ前の仕業が終わった駅と、次の仕業の始発駅が
        違っていれば「瞬間移動」。実際の車両はそんな動きをしない。
     4. 留置場ごとの入区・出区の回数。
*/
'use strict';

__boot();

const START_H = 5, END_H = 22;

const deadhead = {};      // "始発→終着" -> 本数
const seenTrain = {};     // 列車id -> true
const trackUse = { out: 0, in: 0, other: 0 };
const enterDepotAt = {};  // 留置場 -> 入区回数

// 入区の回数を数える (enterDepot を包む)
const origEnter = Train.prototype.enterDepot;
Train.prototype.enterDepot = function (stName) {
    enterDepotAt[stName] = (enterDepotAt[stName] || 0) + 1;
    return origEnter.call(this, stName);
};

function probe() {
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        if (t.type !== '回送') continue;
        const key = t.id + '|' + t.trainNo;
        if (!seenTrain[key]) {
            seenTrain[key] = true;
            const k = (t.startName || '?') + ' → ' + (t.dest || '?');
            deadhead[k] = (deadhead[k] || 0) + 1;
        }
        if (/Kosei|Fukuchi|Tozai|Hoppo/.test(t.trackId)) trackUse.other++;
        else if (t.trackId.indexOf('Out') >= 0) trackUse.out++;
        else trackUse.in++;
    }
}

__run((START_H - 4) * 3600);
__run((END_H - START_H) * 3600, probe);

console.log('=== 回送の本数 (' + START_H + '時〜' + END_H + '時, 始発→終着) ===');
const keys = Object.keys(deadhead).sort((a, b) => deadhead[b] - deadhead[a]);
const total = keys.reduce((s, k) => s + deadhead[k], 0);
keys.slice(0, 15).forEach(k => console.log('  ' + k.padEnd(24) + deadhead[k] + '本'));
console.log('  --- 合計 ' + total + '本 / 行き先の種類 ' + keys.length);
const toMuko = keys.filter(k => k.indexOf('→ 向日町操') > 0).reduce((s, k) => s + deadhead[k], 0);
const kyotoToMuko = deadhead['京都 → 向日町操'] || 0;
console.log('  向日町操行きの回送: ' + toMuko + '本 (うち京都発 ' + kyotoToMuko + '本)');

console.log('');
console.log('=== 回送が走った線路 ===');
const tu = trackUse.out + trackUse.in;
console.log('  外側線 ' + trackUse.out + ' / 内側線 ' + trackUse.in +
            '  (外側線の割合 ' + (tu ? (trackUse.out * 100 / tu).toFixed(1) : '0') + '%)');

console.log('');
console.log('=== 留置場への入区 ===');
Object.keys(enterDepotAt).sort((a, b) => enterDepotAt[b] - enterDepotAt[a])
    .forEach(k => console.log('  ' + k.padEnd(10) + enterDepotAt[k] + '回'));

/* ------------------------------------------------------------------ 行路のつながり

   行路の記録 (js/30-duty-log.js) は、1つの仕業を1行として
     from … 始発駅
     to   … 終着駅 (走り終えたところ)
     last … 最後に居た駅
   で持っている。前の行の last と次の行の from が違えば、
   その編成は線路を走らずに移動したことになる。 */
console.log('');
console.log('=== 編成の行路が物理的につながっているか ===');
let rows = 0, jumps = 0, nearJumps = 0;
const examples = [];
game.duty.fleetIds().forEach(id => {
    const list = game.duty.rowsOf(id);
    for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i];
        rows++;
        const from = cur.from || '';
        const at = prev.last || prev.to || '';
        if (!from || !at) continue;
        if (from === at) continue;
        /* 名前が違っても同じ場所を指すことがある
             宮原操 = 新大阪の位置 / 吹田貨 = 吹田の位置
             網干・播州赤穂・上郡 = 姫路の電留線
           fleetIndexOf() で位置に直して比べる。 */
        const a = fleetIndexOf(at), b = fleetIndexOf(from);
        if (a !== null && b !== null && a === b) continue;
        /* ★1駅ぶんのずれは記録の切れ目によるもので、実際には走っている。
           行路の記録は30秒おきに見張るので、駅を出た直後に列車番号が
           変わると「最後に居た駅」が1つ手前のままになる。
           (例: 宮原操→尼崎の回送が、塚本を出たところで営業列車に変わる) */
        if (a !== null && b !== null && Math.abs(a - b) <= 1) { nearJumps++; continue; }
        jumps++;
        if (examples.length < 12) {
            examples.push(id + ': ' + (prev.no || '(留置)') + ' ' + prev.from + '→' + at +
                          '  のあと  ' + (cur.no || '(留置)') + ' ' + from + '→' + (cur.to || '?'));
        }
    }
});
console.log('  つながりの数 ' + rows + ' / 瞬間移動 ' + jumps +
            ' (' + (rows ? (jumps * 100 / rows).toFixed(1) : '0') + '%)');
console.log('  うち1駅ぶんのずれ (記録の切れ目。実際には走っている): ' + nearJumps);
examples.forEach(e => console.log('    ' + e));
