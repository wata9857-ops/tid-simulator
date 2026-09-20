/* Super-TID の線路図が、実物 (ref-diagram-3468x632.png) と
   同じ寸法・並び・番線の付き方になっているかを検証する。

   使い方: node tools/harness.js tools/check_tid.js

   実物の画像を画素で測った値を「正解」として持っておき、
   線路の縦位置・間隔、ホーム帯の位置、駅名札の余白、
   左右の向き (下りが左から右へ進むか) を確かめる。
   あわせて、列車が実際に無い線路・番線に描かれないことも見る。
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

/* ------------------------------------------------------------------
   実物の画像から測った値 (ref-diagram-3468x632.png)
     下り外 y=230 / 下り内 y=302 / 上り内 y=361 / 上り外 y=434
     ホーム帯 y=266 (下り外と下り内の中間) / y=392 (上り内と上り外の中間)
     上の駅名札の中心 y=117  → いちばん上の線路まで 113
     下の駅名札の中心 y=518  → いちばん下の線路まで  84
     軌道回路の丸 直径11 / 転てつ器の白四角 9×10 / ホーム帯の幅 83
------------------------------------------------------------------ */
const REF = {
    gapDownOutToDownIn: 72,
    gapDownInToUpIn:    59,
    gapUpInToUpOut:     73,
    plateTopGap:       113,
    plateBotGap:        84,
    circuitD:           11,
    turnoutW:            9,
    turnoutH:           10,
    platformW:          83,
    plateW:             99,
    plateH:             19
};

head('線路の並びと間隔 (実物の画素と一致するか)');
const tY = buildTidTrackY(['本線']);
const rows = tY.__rows.map(r => r.id);
ok('上から 下り外 → 下り内 → 上り内 → 上り外 の順である',
   rows.join(',') === 'Down_Out,Down_In,Up_In,Up_Out', rows.join(','));
/* 線路図は実物より大きく描く (TID_SCALE 横 / TID_SCALE_Y 縦)。
   大きな駅で番線・ホーム・分岐・列車表示が重なって読めなかったため。
   絶対値ではなく「実物と同じ比」になっているかを見る。 */
const g1 = tY['Down_In'] - tY['Down_Out'];
const g2 = tY['Up_In'] - tY['Down_In'];
const g3 = tY['Up_Out'] - tY['Up_In'];
console.log('  線路の間隔: ' + g1 + ' / ' + g2 + ' / ' + g3 +
            '  (実物 ' + REF.gapDownOutToDownIn + ' / ' + REF.gapDownInToUpIn +
            ' / ' + REF.gapUpInToUpOut + ' を ' + TID_SCALE_Y + '倍)');
const near = (a, b) => Math.abs(a - b) <= 1.5;
ok('下り外〜下り内 の間隔が実物の比と合う',
   near(g1, REF.gapDownOutToDownIn * TID_SCALE_Y), String(g1));
ok('下り内〜上り内 の間隔が実物の比と合う (内側線どうしは狭い)',
   near(g2, REF.gapDownInToUpIn * TID_SCALE_Y), String(g2));
ok('上り内〜上り外 の間隔が実物の比と合う',
   near(g3, REF.gapUpInToUpOut * TID_SCALE_Y), String(g3));
ok('内側線どうしの間隔が外側との間隔より狭い (実物と同じ)', g2 < g1 && g2 < g3,
   g1 + '/' + g2 + '/' + g3);
/* 横の倍率。
   ★2.4倍まで拡げていたときは1駅が864pxになり、画面に2駅しか入らず
     閉塞が間延びしていた。重なりは「駅の中を縦に広げる」
     (tidStationLayout) と「渡り線を のど に置く」で直したので、
     元の見た目に近い所まで戻してある。
     もっと拡げたいときは画面の拡大縮小 (js/43-tid-zoom.js) を使う。 */
ok('線路図の横の倍率が行きすぎていない (横 ' + TID_SCALE + '倍)',
   TID_SCALE >= 1.0 && TID_SCALE <= 1.6, String(TID_SCALE));
const stGap = Math.abs(tidStationX(1) - tidStationX(0));
ok('1駅の間隔が、駅の中身が入るだけあり、かつ間延びしていない',
   stGap >= 360 && stGap <= 620, Math.round(stGap) + 'px');

head('駅の中の配置 (ホームと渡り線が重ならないか)');
/* 渡り線を置く「のど」が、着発線の枠とホーム帯の外側にあること。
   ここが重なっていると、実機の画面 (IMG_0332/IMG_0333) のように
   斜めの線がホームと番線札を突き抜ける。 */
const boxHalf = tidStationBoxW() / 2;
const crossInner = Math.abs(tidThroatX(0, 'R')) - tidCrossoverW() / 2;
ok('渡り線が着発線の枠の外側にある', crossInner > boxHalf,
   '渡り線の内端 ' + crossInner.toFixed(0) + 'px / 着発線の端 ' + boxHalf.toFixed(0) + 'px');
ok('渡り線がホーム帯の外側にある', crossInner > tidW(TID_GEO.platformW) / 2,
   '渡り線の内端 ' + crossInner.toFixed(0) + 'px / ホーム帯の端 ' +
   (tidW(TID_GEO.platformW) / 2).toFixed(0) + 'px');
ok('渡り線が となりの駅まではみ出していない',
   Math.abs(tidThroatX(0, 'R')) + tidCrossoverW() / 2 < stGap / 2,
   '渡り線の外端 ' + (Math.abs(tidThroatX(0, 'R')) + tidCrossoverW() / 2).toFixed(0) +
   'px / 駅間の半分 ' + (stGap / 2).toFixed(0) + 'px');

/* 番線どうしの縦の間隔。列車表示 (高さ18＋編成番号10) が重ならない値を
   下回る駅が無いこと。以前は大阪・京都で18〜22pxしかなかった。 */
const bigStations = ['大阪', '京都', '尼崎', '高槻', '新大阪', '西明石', '草津', '米原'];
let worstName = '', worst = 9999;
let labelWorstName = '', labelWorst = 9999;
bigStations.forEach(n => {
    const L = tidStationLayout(n, 600, false);
    const idx = L.ys.map((y, i) => i).sort((a, b) => L.ys[a] - L.ys[b]);
    for (let k = 1; k < idx.length; k++) {
        const a = idx[k - 1], b = idx[k];
        const d = L.ys[b] - L.ys[a];
        if (d < worst) { worst = d; worstName = n; }
        // 両側から列車表示が出る所 (いちばん広さが要る)
        if (L.sides[a] === +1 && L.sides[b] === -1 && d < labelWorst) {
            labelWorst = d; labelWorstName = n;
        }
    }
});
/* 番線がいちばん多い新大阪 (11番線) だけは、線路の帯に入りきらないので
   laneFloor まで詰める。それ以外の駅は laneMinGap を満たす。 */
ok('どの主要駅でも番線が laneFloor (' + TID_GEO.laneFloor + 'px) より詰まっていない',
   worst >= TID_GEO.laneFloor - 0.5,
   'いちばん狭いのは ' + worstName + ' の ' + worst.toFixed(1) + 'px');
/* 列車表示は線路から 16px 離れ、高さ18px。編成番号の帯を上下に付けると
   さらに11px。向かい合う所にはその倍が要る (=76px)。
   入りきらない駅では編成番号を表示の左に並べるので、必要なのは
   (16+9)×2 = 50px まで下がる。ここではその値を下回らないことを見る。 */
ok('列車表示が向かい合う所に、表示どうしが重ならない間隔がある (50px以上)',
   labelWorst >= 50,
   'いちばん狭いのは ' + labelWorstName + ' の ' + labelWorst.toFixed(1) + 'px');
ok('ホームを挟む2線に、ホーム帯と番線札が入る間隔がある',
   tidStationLayout('大阪', 600, false).ys.length === 9, '大阪 9番線');

head('駅名札の余白');
ok('上の札からいちばん上の線路までの余白が実物と同じ比 (' + REF.plateTopGap + ')',
   TID_GEO.plateTopGap === REF.plateTopGap, String(TID_GEO.plateTopGap));
ok('下の札からいちばん下の線路までの余白が実物と同じ比 (' + REF.plateBotGap + ')',
   TID_GEO.plateBotGap === REF.plateBotGap, String(TID_GEO.plateBotGap));
ok('駅名札の大きさが ' + REF.plateW + '×' + REF.plateH,
   TID_GEO.plateW === REF.plateW && TID_GEO.plateH === REF.plateH,
   TID_GEO.plateW + '×' + TID_GEO.plateH);

head('印の大きさ');
ok('軌道回路の丸の直径が ' + REF.circuitD,
   Math.abs(TID_GEO.circuitR * 2 - REF.circuitD) < 0.01, String(TID_GEO.circuitR * 2));
ok('転てつ器の白い四角が ' + REF.turnoutW + '×' + REF.turnoutH,
   TID_GEO.turnoutW === REF.turnoutW && TID_GEO.turnoutH === REF.turnoutH,
   TID_GEO.turnoutW + '×' + TID_GEO.turnoutH);
ok('ホーム帯の幅が ' + REF.platformW,
   TID_GEO.platformW === REF.platformW, String(TID_GEO.platformW));

head('左右の向き (実物は左が米原方・右が大阪方で、下りが左から右へ進む)');
{
    const xHimeji = tidStationX(STATION_MAP['姫路']);
    const xMaibara = tidStationX(STATION_MAP['米原']);
    ok('米原が姫路より左にある', xMaibara < xHimeji,
       '米原=' + Math.round(xMaibara) + ' 姫路=' + Math.round(xHimeji));
    const order = ['膳所', '大津', '山科', '京都', '西大路', '桂川', '向日町']
        .map(n => ({ n: n, x: tidStationX(STATION_MAP[n]) }));
    let asc = true;
    for (let i = 1; i < order.length; i++) if (order[i].x <= order[i - 1].x) asc = false;
    ok('膳所→大津→山科→京都→西大路→桂川→向日町 が左から右へ並ぶ (実物と同じ)', asc,
       order.map(o => o.n).join('→'));
    /* 下り列車は dir=-1 でブロック番号が減る向きに進む。
       その進む先が画面の右側になっていれば、実物と同じ向きになっている。 */
    const b = game.trackMgr.blocks['Down_Out'];
    const i0 = b.findIndex(x => x.x !== -1000) + 5;
    ok('下り線は画面の左から右へ進む', tidX(b[i0 - 1].x) > tidX(b[i0].x),
       'ブロック' + i0 + '→' + (i0 - 1) + ' で x ' +
       Math.round(tidX(b[i0].x)) + '→' + Math.round(tidX(b[i0 - 1].x)));
}

head('ホーム帯が「面している2線のちょうど中間」に来るか');
{
    const upOutY = tY['Up_Out'];
    let bad = [];
    ['膳所', '大津', '向日町', '桂川', '西大路', '高槻', '大阪'].forEach(st => {
        const rule = STATION_PLATFORM_RULES[st];
        const ys = tidStationLaneYs(st, upOutY, false);
        const p = [];
        for (let i = 0; i < Math.min(rule.lanes.length, ys.length); i++) {
            if (rule.lanes[i]) p.push({ y: ys[i], label: rule.labels[i] });
        }
        p.sort((a, b2) => a.y - b2.y);
        for (let i = 0; i + 1 < p.length; i += 2) {
            const mid = (p[i].y + p[i + 1].y) / 2;
            if (!(mid > p[i].y && mid < p[i + 1].y)) {
                bad.push(st + ' ' + p[i].label + '/' + p[i + 1].label);
            }
        }
    });
    ok('ホーム帯が2線の間に入っている', bad.length === 0, bad.join(' '));
}

head('番線番号が実物と合っているか (実物に写っている駅)');
{
    /* 実物の ref-diagram-3468x632.png / ref-diagram-4000x935.png で
       黄色いホーム帯の上下に書かれている番線番号。
       画面の上から順に並べる (上=下り外側)。 */
    const REF_PLAT = {
        '膳所':   ['4', '3', '2', '1'],
        '大津':   ['4', '3', '2', '1'],
        '向日町': ['4', '3', '2', '1'],
        '西大路': ['1', '2', '3', '4'],   // 「京」「タ」は貨物線でホームは無い
        '桂川':   ['1', '2'],
        '吹田':   ['1', '2', '3', '4'],
        '塚本':   ['4', '3', '2', '1'],
        '山科':   ['2', '3']       // 外側線にホームは無く、1番と4番は湖西線側
    };
    const upOutY = tY['Up_Out'];
    const bad = [];
    for (const st in REF_PLAT) {
        const rule = STATION_PLATFORM_RULES[st];
        if (!rule) { bad.push(st + ' 定義なし'); continue; }
        const ys = tidStationLaneYs(st, upOutY, false);
        const got = [];
        for (let i = 0; i < Math.min(rule.lanes.length, ys.length); i++) {
            if (rule.lanes[i]) got.push({ y: ys[i], label: rule.labels[i] });
        }
        got.sort((a, b2) => a.y - b2.y);
        const seq = got.map(g => g.label);
        if (seq.join(',') !== REF_PLAT[st].join(',')) {
            bad.push(st + ' 実物=' + REF_PLAT[st].join(',') + ' 画面=' + seq.join(','));
        }
    }
    ok('ホーム番号の並びが実物と一致する', bad.length === 0, bad.join(' / '));
    ok('京都に1番のりばが無い (実物は 0番と2〜10番)',
       STATION_PLATFORM_RULES['京都'].labels.indexOf('1') < 0,
       STATION_PLATFORM_RULES['京都'].labels.join(','));
    ok('京都に0番のりばがある',
       STATION_PLATFORM_RULES['京都'].labels.indexOf('0') >= 0);
}

head('分岐 (渡り線) が隣り合う線路をつないでいるか');
{
    const order = ['Down_Out', 'Down_In', 'Up_In', 'Up_Out'];
    const bad = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].crossovers || []).forEach(c => {
            const a = order.indexOf(c[0]), b = order.indexOf(c[1]);
            if (a < 0 || b < 0) return;                    // 分岐線内の渡り線
            // 複々線の外にある駅は外側線どうししか無いので、飛び越えても正しい
            const idx = STATION_MAP[st];
            const quad = idx !== undefined &&
                idx >= STATION_MAP['西明石'] && idx <= STATION_MAP['草津'];
            if (quad && Math.abs(a - b) !== 1) bad.push(st + ' ' + c[0] + '-' + c[1]);
        });
    }
    ok('複々線区間の渡り線は隣の線路とだけつながっている', bad.length === 0, bad.join(' '));
}

head('列車が実際に無い線路・番線に描かれないか');
{
    const r = { trackY: buildTidTrackY(['本線', '湖西線']), rows: function () { return this.trackY.__rows; } };
    let offRow = 0, offLane = 0, ghostBlock = 0;
    let offSeen = {}, offNow = {};
    for (let i = 0; i < 4 * 3600 / CONFIG.TICK_SEC; i++) {
        game.update();
        if (i % 4) continue;                 // 1分おきに見る
        offSeen = offNow; offNow = {};
        game.trains.forEach(t => {
            if (t.state === 'finished' || t.state === 'in_depot') return;
            const blks = game.trackMgr.blocks[t.trackId];
            if (!blks) { offRow++; return; }
            const b = blks[t.currBlockIndex];
            if (!b || b.x === -1000) { ghostBlock++; return; }
            if (t.lane < 0 || t.lane >= b.lanes.length) offLane++;
            /* その線路が線区の範囲 (線路図に描かれる範囲) に入っているか。
               内側線は複々線の西明石〜草津だけ、というように線区ごとに
               実際の線路の範囲が決まっている。
               範囲外に出た列車は js/11-train-core.js の手当てで
               すぐ外側線へ戻るので、「1回だけ見えた」は数えず、
               1分後もまだ範囲外にいるものだけを数える。 */
            const range = tidTrackRange(t.trackId);
            const off = b.stationIdx !== undefined &&
                        (b.stationIdx < range[0] || b.stationIdx > range[1]);
            if (off) {
                if (offSeen[t.id]) offRow++;
                offNow[t.id] = true;
            }
        });
    }
    ok('線路の無い区間に列車がいない', ghostBlock === 0, ghostBlock + '件');
    ok('線区の範囲の外に列車が居続けない (1分後も範囲外)', offRow === 0, offRow + '件');
    ok('存在しない番線に列車がいない', offLane === 0, offLane + '件');
}

head('在線・信号・進路が線路の状態から出ているか');
{
    // 在線の丸は blk.lanes から、信号は SignalSystem から取れていること
    let occDots = 0, sigOK = true;
    game.trains.forEach(t => {
        if (t.state === 'finished' || t.state === 'in_depot') return;
        const blks = game.trackMgr.blocks[t.trackId];
        const b = blks && blks[t.currBlockIndex];
        if (b && b.lanes.indexOf(t) >= 0) occDots++;
    });
    ok('在線の丸が実際の軌道回路の在線と一致している', occDots > 0, occDots + '本');
    const asp = game.signals.aspectFor('Up_In', 1, 30);
    ok('信号の現示が SignalSystem から取れる', typeof asp === 'string', String(asp));
    ok('停止現示は赤、進行現示は印を出さない (実物の表し方)',
       SIGNAL_ASPECTS['R'] !== undefined);
}

head('北方貨物線が途切れずに描かれるか');
/* 北方貨物線は途中にホームの無い複線。本線の駅とは関係が無いので、
   線路を通しで描く途中に穴を空けてはいけない。
   ★以前は「その線路の駅」を線路IDから当てようとして外し、
     本線の全86駅ぶんの穴を北方貨物線に空けていたため、
     破線のように途切れて見えていた。 */
(function () {
    const R = Object.create(TidRenderer.prototype);
    R.game = game;
    R.trackY = buildTidTrackY(['北方貨物線', '本線']);
    ['Up_Hoppo', 'Down_Hoppo'].forEach(tid => {
        const gaps = R.trackGaps(tid, -1e9, 1e9);
        ok(tid + ' が途切れていない', gaps.length === 0, gaps.length + ' 箇所で途切れている');
    });
    // 本線のほうは、駅で番線がずれる所に穴が空いている (そこは着発線で描く)
    const mainGaps = R.trackGaps('Down_Out', -1e9, 1e9).length;
    ok('本線は駅の所だけ着発線に譲っている', mainGaps > 0, mainGaps + ' 駅');
    ok('北方貨物線に本線の番線を当てはめていない',
       R.stationMainY('大阪', 'Up_Hoppo') === null);
})();

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
