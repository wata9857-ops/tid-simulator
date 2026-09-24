/* Super-TID の駅名札が、線路・ホーム・列車表示・ほかの札に重ならないか、
   その線区の外側 (正しい側) に出ているかを、すべての表示区間・すべての駅で確かめる。

   使い方: node tools/harness.js --tid tools/check_plates.js

   ■ なぜ要るか
     山科〜近江塩津では本線と湖西線が同じ横位置に駅を持つ。線区のあいだが
     足りないと、湖西線の駅名札 (大津京・唐崎 …) が本線の上り外の線路の上に出て、
     本線の札より上 (= 本線の側) に並んでいた。JR宝塚線・JR東西線も同じ形。
     画面を見て「大丈夫そう」で済ませず、札の四角を計算して総当たりで見る。

   ■ 見ること (駅ごと・線区ごと)
     1. 上の札は線区のいちばん上の線路より上、下の札はいちばん下の線路より下にある
     2. 札が、どの線区の「線路＋番線＋列車表示」の範囲にも掛からない
     3. 同じ横位置の札どうしが重ならない
     4. 札がキャンバスの中に収まる
*/
'use strict';

__boot();

let failures = 0;
const bad = [];
function ng(msg) { failures++; if (bad.length < 40) bad.push(msg); }

const LABEL = 44;          // 列車表示 (線路から16px ＋ 表示18px ＋ 編成番号の帯10px)
const PH = TID_GEO.plateH;

// 線区の線路が通っている範囲 (js/40-tid-theme.js の tidGroupRange。古い版にも対応する)
const groupRange = (typeof tidGroupRange === 'function') ? tidGroupRange : (g =>
    g === '湖西線' ? tidTrackRange('Kosei_Up') : g === 'JR宝塚線' ? tidTrackRange('Fukuchi_Up') :
    g === 'JR東西線' ? tidTrackRange('Tozai_Up') : g === '北方貨物線' ? tidTrackRange('Up_Hoppo') :
    [0, STATIONS.length - 1]);

const rnd = new TidRenderer(game);
let checked = 0;

TID_AREAS.forEach(area => {
    rnd.applyArea(area.id);
    const bands = rnd.groupBands();
    const H = rnd.height;
    for (let i = 0; i < STATIONS.length; i++) {
        // その横位置で、各線区が占める縦の範囲
        const occ = [];
        bands.forEach(band => {
            const range = groupRange(band.group);
            if (i < range[0] || i > range[1]) return;
            let lo = band.top, hi = band.bot;
            const name = rnd.stationNameOn(band.group, i);
            if (name && STATION_PLATFORM_RULES[name] && band.group !== "北方貨物線") {
                const branch = (band.group !== "本線");
                tidStationLaneYs(name, band.bot, branch).forEach(y => {
                    if (y < lo) lo = y;
                    if (y > hi) hi = y;
                });
            }
            occ.push({ group: band.group, lo: lo - LABEL, hi: hi + LABEL, top: band.top, bot: band.bot });
        });
        // その横位置の札
        const plates = [];
        bands.forEach(band => {
            if (band.group === "北方貨物線") return;
            const name = rnd.stationNameOn(band.group, i);
            if (!name) return;
            const ys = rnd.plateYsFor(band, name);
            plates.push({ group: band.group, name: name, side: "上", y: ys.top, band: band });
            plates.push({ group: band.group, name: name, side: "下", y: ys.bot, band: band });
        });
        plates.forEach(p => {
            checked++;
            const y0 = p.y - PH / 2, y1 = p.y + PH / 2 + 2;
            const where = `[${area.id}] ${p.name}(${p.group}) ${p.side}の札 y=${Math.round(p.y)}`;
            // 1. 正しい側
            if (p.side === "上" && !(y1 < p.band.top)) ng(where + ' が線区の上端 ' + Math.round(p.band.top) + ' より上にない');
            if (p.side === "下" && !(y0 > p.band.bot)) ng(where + ' が線区の下端 ' + Math.round(p.band.bot) + ' より下にない');
            // 2. 線路・番線・列車表示に掛からない
            occ.forEach(o => {
                if (y1 > o.lo && y0 < o.hi) {
                    ng(where + ` が ${o.group} の線路・列車表示 (${Math.round(o.lo)}〜${Math.round(o.hi)}) に重なる`);
                }
            });
            // 4. キャンバスの中
            if (y0 < 0 || y1 > H) ng(where + ` がキャンバス (高さ ${Math.round(H)}) からはみ出す`);
        });
        // 3. 札どうし
        for (let a = 0; a < plates.length; a++) {
            for (let b = a + 1; b < plates.length; b++) {
                if (Math.abs(plates[a].y - plates[b].y) < PH + 2) {
                    ng(`[${area.id}] ${plates[a].name}(${plates[a].group}${plates[a].side}) と ` +
                       `${plates[b].name}(${plates[b].group}${plates[b].side}) の札が重なる`);
                }
            }
        }
        // 上下の順序: 上の線区の札は、下の線区の札より上にある
        for (let a = 0; a < plates.length; a++) {
            for (let b = 0; b < plates.length; b++) {
                const A = plates[a], B = plates[b];
                if (A.band.bot < B.band.top && A.y > B.y) {
                    ng(`[${area.id}] ${A.name}(${A.group}${A.side}) が下の線区の ${B.name}(${B.group}${B.side}) より下に出ている`);
                }
            }
        }
    }
});

console.log(`駅名札 ${checked} 枚を確認`);
bad.forEach(m => console.log('  NG   ' + m));
console.log(failures === 0 ? '  OK   すべての駅名札が線路・列車表示・ほかの札に重ならず、正しい側にある'
                           : `  NG   ${failures} 件`);
console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
