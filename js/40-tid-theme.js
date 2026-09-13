/* Super-TID の見た目 (配色・寸法・並び順) と、描画の部品。

   ■ 何を再現しているか
     同梱の実物の Super-TID 画面 (ref-diagram-*.png) を実際に色で調べて、
     背景・線路・進路・ホーム・列車表示・駅名札の色をそのまま使っている。

       背景          #B4C7FB   薄い青紫
       線路          #FFFFFF   白 (濃い縁取りと淡い影が付く)
       進路(開通)    #89F939   黄緑
       ホーム        #FEFB39   黄
       在線表示      #2036FB   青い丸
       抑止・停車    #DE2A02   赤い四角
       新快速        #2036FB   青地に白文字
       快速          #E57B1A   橙地に黒文字
       普通          #A5F445   黄緑地に黒文字
       特急          #7E1800   濃い赤地に白文字
       駅名札        白地・黒文字・灰の枠・青紫の影

   ■ 並び順
     実物と同じく、上から
       北方貨物(下り) / 下り外 / 下り内 / 上り内 / 上り外 / 北方貨物(上り)
       湖西線(下り/上り) / JR宝塚線・JR東西線(下り/上り)
     の順に並べる。
     (旅客向けの線路図 js/17-renderer.js は上りが上なので、並びが逆になる)
*/

const TID_COLORS = {
    bg:          "#B4C7FB",
    bgDark:      "#9FB4F0",
    rail:        "#FFFFFF",
    railEdge:    "#3C3C3F",
    railShadow:  "#96A6D1",
    railIdle:    "#DCE4FA",   // 線路の無い(範囲外)区間
    route:       "#89F939",   // 進路が開通している区間
    occupied:    "#E8453C",   // 在線している軌道回路
    platform:    "#FEFB39",
    platformEdge:"#6B6B20",
    platformShadow:"#5B6580",  // ホーム帯の落ち影 (実物 rgb(91,101,127))
    slotEdge:    "#A3ADCA",    // 駅の着発線の枠・列車表示の空き枠 (実物 rgb(163,173,202))
    dot:         "#2036FB",   // 列車の位置を示す丸
    stopMark:    "#DE2A02",   // 抑止・停車中の四角
    plate:       "#FFFFFF",
    plateEdge:   "#C5C5C5",
    plateShadow: "#707C9C",
    text:        "#101014",
    textSub:     "#3F4658",
    panel:       "#ECEEF5",
    panelEdge:   "#707C9C",
    grid:        "rgba(255,255,255,0.35)",
    caution:     "#FFD21E",
    fault:       "#C000C0"
};

/** 種別ごとの列車表示の色。実物の画面から拾った値。 */
const TID_TYPE_COLORS = {
    "新快速": { bg: "#2036FB", text: "#FFFFFF" },
    "快速":   { bg: "#E57B1A", text: "#101014" },
    "普通":   { bg: "#A5F445", text: "#101014" },
    "特急":   { bg: "#7E1800", text: "#FFFFFF" },
    "回送":   { bg: "#3F4658", text: "#FFFFFF" },
    "臨時":   { bg: "#5B4A8A", text: "#FFFFFF" },
    "貨物":   { bg: "#6B4A18", text: "#FFFFFF" }
};

/** 編成番号の帯の色。車両所ごとに変える (実物も所属で色分けしている) */
const TID_FLEET_COLORS = {
    ABOSHI:      { bg: "#1F5FA9", text: "#FFFFFF" },   // ホシ 網干
    AKASHI:      { bg: "#2E7D4F", text: "#FFFFFF" },   // アカ 明石
    MIYAHARA:    { bg: "#A05A12", text: "#FFFFFF" },   // ミハ 宮原
    KYOTO:       { bg: "#7A3B8F", text: "#FFFFFF" },   // キト 京都
    HINENO:      { bg: "#B3002A", text: "#FFFFFF" },   // ヒネ 日根野 (281系 はるか)
    KYOTO_EXP:   { bg: "#8A1C5A", text: "#FFFFFF" },   // キト 特急形
    FUKUCHIYAMA: { bg: "#1C6E8A", text: "#FFFFFF" },   // フチ 福知山
    CHIZU:       { bg: "#555F6B", text: "#FFFFFF" },   // 智頭急行
    FREIGHT:     { bg: "#4A3A2A", text: "#FFFFFF" }    // 機関車
};

/* 線路の並び。上から順に描く。
     id     … TrackManager の線路ID
     label  … 画面に出す線名 (実物と同じ「下り外」などの短い表記)
     dir    … 進行方向
     group  … 線区のまとまり (見出しを出すのに使う)
*/
const TID_ROWS = [
    { id: "Down_Hoppo", label: "北方貨物下", dir: -1, group: "北方貨物線", gap: 72 },
    { id: "Up_Hoppo",   label: "北方貨物上", dir: 1,  group: "北方貨物線", gap: 72 },
    { id: "Down_Out",   label: "下り外",     dir: -1, group: "本線", gap: 72 },
    { id: "Down_In",    label: "下り内",     dir: -1, group: "本線", gap: 59 },
    { id: "Up_In",      label: "上り内",     dir: 1,  group: "本線", gap: 73 },
    { id: "Up_Out",     label: "上り外",     dir: 1,  group: "本線", gap: 72 },
    { id: "Kosei_Down", label: "湖西下り",   dir: -1, group: "湖西線", gap: 72 },
    { id: "Kosei_Up",   label: "湖西上り",   dir: 1,  group: "湖西線", gap: 72 },
    { id: "Fukuchi_Down", label: "宝塚下り", dir: -1, group: "JR宝塚線", gap: 72 },
    { id: "Fukuchi_Up",   label: "宝塚上り", dir: 1,  group: "JR宝塚線", gap: 72 },
    { id: "Tozai_Down", label: "東西下り",   dir: -1, group: "JR東西線", gap: 72 },
    { id: "Tozai_Up",   label: "東西上り",   dir: 1,  group: "JR東西線", gap: 72 }
];

/* 縦の寸法。実物の ref-diagram-3468x632.png を画素で測って合わせた値。

     駅名札   上 y=107〜125 / 下 y=507〜525   → 線路の帯から約120px 離れている
     下り外   y=230
     下り内   y=302        (下り外から 72)
     上り内   y=361        (下り内から 59 … 内側線どうしは間隔が狭い)
     上り外   y=434        (上り内から 73)
     ホーム帯 y=266 / 392  (その2線のちょうど中間)
     軌道回路の丸 直径 11px / 間隔 31〜32px
     転てつ器の白四角 9×10px
     在線の丸 直径 11px (走行中=青 / 停車中=赤)
*/
const TID_GEO = {
    /* 駅名札と線路の帯の距離。実物は上の札の中心 y=117 に対して
       いちばん上の線路が y=230、下の札の中心が y=518 に対して
       いちばん下の線路が y=434 で、上が 113px・下が 84px 空いている。
       発着予告の札がここに入るので、実物どおりの余白をとる。 */
    topPad:      131,   // 上の駅名札から、いちばん上の線路まで
    plateTopGap: 113,   // 札の中心と、いちばん上の線路の距離
    plateBotGap: 84,    // 札の中心と、いちばん下の線路の距離
    rowGap:      72,    // 既定の線路間隔 (TID_ROWS の gap が無いとき)
    groupGap:    58,    // 線区と線区のあいだ
    bottomPad:   40,
    plateW:      99,    // 駅名札の幅 (実物は 99px)
    plateH:      19,    // 駅名札の高さ (実物は 19px)
    trainH:      18,
    trainNoW:    46,    // 列車番号の桝の幅
    signalR:     4.5,
    circuitR:    5.5,   // 軌道回路の境目の丸 (実物は直径11px)
    dotR:        5.5,   // 在線の丸
    turnoutW:    9,     // 転てつ器の白い四角
    turnoutH:    10,
    platformW:   83,    // ホーム帯の幅 (実物は 83px)
    /* 番線の縦位置を計算するときの「仮想の線路間隔」。
       旅客向けの線路図 (js/17-renderer.js) は線路が 120px 間隔で並んでいて、
       stationLaneYPositions() の数値もそれを前提に書かれている。
       Super-TID は間隔が違うので、仮想座標で計算してから縮めて当てはめる。 */
    virtualGap:  120
};

/* 表示する線区の組み合わせ。実物の Super-TID も線区ごとに画面が分かれている。 */
const TID_AREAS = [
    { id: "main",    label: "本線 (琵琶湖線・JR京都線・JR神戸線)", groups: ["本線"] },
    { id: "kosei",   label: "本線 ＋ 湖西線",       groups: ["本線", "湖西線"] },
    { id: "fukuchi", label: "本線 ＋ JR宝塚線",     groups: ["本線", "JR宝塚線"] },
    { id: "tozai",   label: "本線 ＋ JR東西線",     groups: ["本線", "JR東西線"] },
    { id: "hoppo",   label: "本線 ＋ 北方貨物線",   groups: ["北方貨物線", "本線"] },
    { id: "all",     label: "全線",
      groups: ["北方貨物線", "本線", "湖西線", "JR宝塚線", "JR東西線"] }
];

/**
 * 表示する線区にあわせて、線路IDごとの縦位置を作る。
 * 全線を並べると縦に長くなりすぎるので、ふだんは本線＋1線区だけを出す。
 */
function buildTidTrackY(groups) {
    const want = groups || ["本線"];
    const y = { __rows: [] };
    let cur = TID_GEO.topPad * TID_SCALE_Y;
    let lastGroup = null;
    TID_ROWS.forEach(row => {
        if (want.indexOf(row.group) < 0) return;
        if (lastGroup !== null && row.group !== lastGroup) cur += TID_GEO.groupGap * TID_SCALE_Y;
        y[row.id] = cur;
        y.__rows.push(row);
        /* 実物と同じく間隔は一定ではない。内側線どうし (下り内〜上り内) は
           あいだにホームが入らないので狭く、外側線との間は
           ホーム帯と「N番のりば」の札が入るので広い。 */
        cur += (row.gap || TID_GEO.rowGap) * TID_SCALE_Y;
        lastGroup = row.group;
    });
    y.__height = cur + TID_GEO.bottomPad * TID_SCALE_Y;
    return y;
}

/**
 * その駅の番線の縦位置を Super-TID の座標で返す。
 *
 * 旅客向けの線路図と同じ並び (stationLaneYPositions) を仮想座標で計算し、
 * 上下を反転して Super-TID の間隔に縮めて当てはめる。
 * こうすることで、どちらの画面でも「何番線がどこにあるか」が揃う。
 *
 *   refUpOutY … Super-TID での「上り外側線」(分岐線なら上り線) の縦位置
 *   branch    … 分岐線 (上下2本だけ) なら true
 */
function tidStationLaneYs(stName, refUpOutY, branch) {
    const K = TID_GEO.virtualGap;
    const virt = branch
        ? stationLaneYPositions(stName, 0, 0, K, K)
        : stationLaneYPositions(stName, 0, K, 2 * K, 3 * K);
    return virt.map(v => tidVirtualToY(v, refUpOutY, branch));
}

/**
 * 仮想座標 (上り外=0, 上り内=K, 下り内=2K, 下り外=3K) を
 * Super-TID の実際の縦位置に折り返す。
 *
 * 線路の間隔が一定でないので、4本の線路の位置を「折れ点」として
 * 区間ごとに比例配分する。待避線のように線路の間や外にある番線も、
 * その区間の比率のまま置かれる。
 */
function tidVirtualToY(v, refUpOutY, branch) {
    const K = TID_GEO.virtualGap;
    const rows = TID_ROWS;
    const gapOf = (id) => {
        const r = rows.find(x => x.id === id);
        return ((r && r.gap) || TID_GEO.rowGap) * TID_SCALE_Y;
    };
    // 上り外を基準に、上へ向かって積む (画面では上が下り側)
    let anchors;
    if (branch) {
        // 分岐線は上下2本だけ。上り線=0, 下り線=K
        anchors = [[0, refUpOutY], [K, refUpOutY - gapOf("Kosei_Down")]];
    } else {
        const gUpIn   = gapOf("Up_In");     // 上り内 → 上り外
        const gDownIn = gapOf("Down_In");   // 下り内 → 上り内
        const gDownOut= gapOf("Down_Out");  // 下り外 → 下り内
        anchors = [
            [0,     refUpOutY],
            [K,     refUpOutY - gUpIn],
            [2 * K, refUpOutY - gUpIn - gDownIn],
            [3 * K, refUpOutY - gUpIn - gDownIn - gDownOut]
        ];
    }
    // v がどの区間にあるかを見て比例配分する (区間の外は両端の傾きで伸ばす)
    for (let i = 0; i < anchors.length - 1; i++) {
        const [v0, y0] = anchors[i], [v1, y1] = anchors[i + 1];
        const last = (i === anchors.length - 2);
        if (v <= v1 || last) {
            const t = (v - v0) / (v1 - v0);
            return y0 + (y1 - y0) * t;
        }
    }
    return refUpOutY;
}

/** その線路が実体を持つ駅インデックスの範囲 */
function tidTrackRange(trackId) {
    if (trackId.indexOf("Hoppo") >= 0)   return [36, 44];
    if (trackId.indexOf("Kosei") === 0)  return [56, 83];
    if (trackId.indexOf("Fukuchi") === 0) return [23, 36];
    if (trackId.indexOf("Tozai") === 0)  return [36, TOZAI_EAST_IDX];
    if (trackId.indexOf("In") >= 0)      return [STATION_MAP["西明石"], STATION_MAP["草津"]];
    return [0, STATIONS.length - 1];
}

/* 実物の Super-TID は、画面の左が米原・草津方 (上り方)、
   右が大阪・姫路方 (下り方) で、下り列車が左から右へ進む。
   (ref-diagram-3468x632.png は左端が膳所・右端が向日町、
    ref-diagram-4000x935.png は左端が吹田・右端が塚本)

   シミュレーションの内部座標は逆向き (姫路=0 で西が小さい) で、
   旅客向けの線路図 (js/17-renderer.js) もそれに合わせてある。
   内部座標を変えると運行の処理まで影響するので、
   Super-TID を描くときだけ左右を入れ替える。 */
const TID_WORLD_W = 100 + ((STATIONS.length - 1) * UNITS_PER_STATION) * BLOCK_WIDTH + 100;

/* 線路図を描く倍率。
   ■ なぜ入れたか
     シミュレーションの座標 (blk.x) は運行の処理と旅客向け画面が共有していて、
     1駅 360px という間隔は変えられない。その間隔のままでは
     大きな駅 (京都・大阪・尼崎) で番線・ホーム・分岐・列車表示が
     重なって読めなかった。
     そこで「シミュレーションの座標は変えず、線路図だけ拡大して描く」形にした。
     縦も同じ倍率で広げるので、実物の Super-TID の縦横比
     (線路の間隔 72:59:73、駅名札までの余白 113/84) はそのまま保たれる。

   ■ 大きさ
     1駅 360px × 2.2 = 792px、全線で約 68,500px。
     キャンバスは画面ぶんだけ描いて余白は spacer の div が持つので、
     iPad のキャンバス面積の上限には掛からない。 */
const TID_SCALE   = 2.4;    // 横 (駅の間隔・閉塞の長さ)
/* 縦の倍率は横より小さくする。
   重なって読めなかったのは主に横方向 (駅の中に番線・ホーム・分岐・
   列車表示が詰まる) で、縦は 72px でも足りていた。
   縦を横と同じ 2.4倍にすると本線4本が画面に収まらず、
   運転指令の画面としてかえって使いにくい。
   線路の間隔の比 (72 : 59 : 73) はそのまま保たれる。 */
const TID_SCALE_Y = 1.3;

/** シミュレーションの X を、Super-TID の画面の X に直す (左右反転＋拡大) */
function tidX(x) { return (TID_WORLD_W - x) * TID_SCALE; }

/** 線路図の中の横幅 (閉塞の長さなど) を倍率に合わせる */
function tidW(w) { return w * TID_SCALE; }

/** 線路図の X を、シミュレーションの X に戻す (tidX の逆) */
function tidInvX(X) { return TID_WORLD_W - X / TID_SCALE; }

/** 線路図全体の横幅 (スクロールする幅) */
function tidTotalWidth() { return TID_WORLD_W * TID_SCALE + 200; }

/** 左右が入れ替わるので、「駅のどちら側か」の指定も入れ替える */
function tidSide(side) { return side === "L" ? "R" : side === "R" ? "L" : side; }

/** 渡り線の形の指定 (l=片開き左 / r=片開き右 / x=両渡り) も入れ替える */
function tidShape(sh) { return sh === "l" ? "r" : sh === "r" ? "l" : sh; }

/** 駅インデックスから X 座標 (Super-TID の向き) */
function tidStationX(i) {
    return tidX(100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH);
}

// ------------------------------------------------------------------ 描画の部品

/** 線路を1本描く (白い線に濃い縁取りと淡い影) */
function tidDrawRail(ctx, x1, x2, y, color) {
    if (x2 <= x1) return;
    ctx.strokeStyle = TID_COLORS.railShadow;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x1, y + 2); ctx.lineTo(x2, y + 2); ctx.stroke();
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.strokeStyle = color || TID_COLORS.rail;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}

/** 軌道回路の境目を示す白い丸 (実物は直径11px の白丸に細い黒縁) */
function tidDrawCircuitMark(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, TID_GEO.circuitR, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
}

/** 転てつ器 (分岐器) を示す白い四角。実物は線路の上に 9×10px で置かれる。 */
function tidDrawTurnoutBox(ctx, x, y) {
    const w = TID_GEO.turnoutW, h = TID_GEO.turnoutH;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
}

/** 駅の構内 (着発線) を示す細い枠。実物は線路を囲む薄い灰色の角丸。 */
function tidDrawStationTrackBox(ctx, cx, y, w) {
    const h = 12;
    ctx.strokeStyle = TID_COLORS.slotEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
}

/**
 * 列車の在線を示す丸。
 * 実物と同じく、走行中は青、停車・抑止中は赤で塗る。
 * 大きさは軌道回路の境目の丸と同じ (直径11px)。
 */
function tidDrawOccupyDot(ctx, x, y, stopped) {
    ctx.beginPath();
    ctx.arc(x, y, TID_GEO.dotR, 0, Math.PI * 2);
    ctx.fillStyle = stopped ? TID_COLORS.stopMark : TID_COLORS.dot;
    ctx.fill();
}

/**
 * 駅名札。
 * 実物は「白地・黒文字」の札の右辺と下辺に黒い帯が付き、
 * 右上の角だけ斜めに切り落とされた形をしている。
 * (以前は青灰色の影を右下にずらして描いていたので、実物と違っていた)
 */
function tidDrawPlate(ctx, name, cx, cy) {
    const w = Math.max(TID_GEO.plateW, name.length * 15 + 22), h = TID_GEO.plateH;
    const x = cx - w / 2, y = cy - h / 2;
    const t = 2;                     // 黒帯の太さ
    // 右辺と下辺の黒帯 (右上は斜めに切る)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(x + w, y + t + 1);
    ctx.lineTo(x + w + t, y + t + 3);
    ctx.lineTo(x + w + t, y + h + t);
    ctx.lineTo(x + t, y + h + t);
    ctx.lineTo(x + t, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    // ごく薄い落ち影 (実物にも1pxだけある)
    ctx.fillStyle = TID_COLORS.plateShadow;
    ctx.fillRect(x + t, y + h + t, w, 1);
    // 札そのもの
    ctx.fillStyle = TID_COLORS.plate;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = TID_COLORS.plateEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = TID_COLORS.text;
    ctx.font = "bold 14px 'Meiryo UI', 'Yu Gothic', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(name, cx, cy + 1);
    return { x: x, y: y, w: w, h: h };
}

/**
 * ホーム (黄色の帯) と「N番のりば」の札。
 *
 * 実物の Super-TID は、島式ホームを「そのホームに面した2本の線路の
 * ちょうど中間」に1本の黄色い帯で描き、上の線路の番線番号を帯の上、
 * 下の線路の番線番号を帯の下に、背景のままの細い文字で書く。
 *   例) 膳所      4番のりば / ▬▬▬ / 3番のりば   (下り外と下り内のあいだ)
 *       桂川      1番のりば / ▬▬▬ / 2番のりば   (下り内と上り内のあいだ)
 * 以前は線路ごとに帯を1本ずつ描き、番線札を黄色の枠で囲っていたので
 * 実物と形が違っていた。
 *
 *   yUpper / yLower … その帯に面した2本の線路の縦位置
 *   labelUpper / labelLower … それぞれの番線番号 (片面ホームなら片方を null)
 */
function tidDrawPlatform(ctx, cx, yUpper, yLower, labelUpper, labelLower) {
    const w = tidW(TID_GEO.platformW);
    const x = cx - w / 2;
    const py = (yUpper + yLower) / 2 - 2;      // 2線のちょうど中間
    // 帯の落ち影 (実物は右下に2pxずれた濃い青灰色)
    ctx.fillStyle = TID_COLORS.platformShadow;
    ctx.fillRect(x + 2, py + 4, w, 2);
    ctx.fillStyle = TID_COLORS.platform;
    ctx.fillRect(x, py, w, 4);

    ctx.font = "10px 'Meiryo UI', 'Yu Gothic', sans-serif";
    ctx.fillStyle = TID_COLORS.textSub;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    /* 番線の呼び方。数字の番線は「4番のりば」、
       「上通」「下外」「京」のように数字でないものはそのまま出す。
       (以前は何でも「番のりば」を付けていたので
        「京番のりば」のような文字になっていた) */
    const nameOf = (v) => (/^[0-9]+$/.test(String(v)) ? v + "番のりば" : String(v));
    if (labelUpper) ctx.fillText(nameOf(labelUpper), cx, py - 7);
    if (labelLower) ctx.fillText(nameOf(labelLower), cx, py + 13);
}

/**
 * 文字を枡の幅に収める。
 * 「サンダーバード1号」のように長い列車名が枡からはみ出していたので、
 * 入るところまで字を小さくしてから描く。
 */
function tidFitText(ctx, text, maxW, weight, basePx) {
    let px = basePx || 11;
    for (; px >= 7; px -= 0.5) {
        ctx.font = weight + " " + px + "px 'Meiryo UI', 'Yu Gothic', sans-serif";
        if (ctx.measureText(text).width <= maxW) return;
    }
}

/** 行先を実物のように詰める (2文字の駅名は「姫　路」のように空けて幅を揃える) */
function tidPadDest(name) {
    if (!name) return "";
    if (name.length === 2) return name.charAt(0) + "　" + name.charAt(1);
    if (name.length === 3) return name.charAt(0) + name.charAt(1) + name.charAt(2);
    return name;
}

/**
 * 信号機。
 *
 * ■ 実物に合わせて描き方を変えた
 *   実物の Super-TID には、灯を縦に並べた信号機の絵は出てこない。
 *   信号の状態は
 *     ・進路が開通している区間を黄緑に塗る (進行を現示している)
 *     ・停止を現示している所に赤い四角を置く
 *   の2つで表している。軌道回路の境目の白丸が、そのまま信号機の位置になる。
 *   以前は3灯式の信号機を線路の脇に立てていたが、実物には無い形だった。
 *
 *   停止以外 (G/YG/Y/YY) のときは、白丸と緑の進路だけで分かるので
 *   余計な印は置かない。注意現示 (Y/YY) は、丸を細く黄色で囲って示す。
 */
function tidDrawSignal(ctx, x, y, dir, aspect, kind) {
    if (aspect === "R") {
        // 停止現示。実物と同じく線路の上に赤い四角を置く。
        const w = 9, h = 10;
        ctx.fillStyle = TID_COLORS.stopMark;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeStyle = "#3A1000";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
        return;
    }
    if (aspect === "Y" || aspect === "YY") {
        // 注意・警戒現示。白丸を黄色で囲う。
        ctx.beginPath();
        ctx.arc(x, y, TID_GEO.circuitR + 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = TID_COLORS.caution;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/** 丸囲みの数字 (両数) */
const TID_CIRCLED = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫",
                     "⑬", "⑭", "⑮", "⑯"];
function tidCircledNumber(n) {
    return TID_CIRCLED[n] || ("(" + n + ")");
}

/**
 * 列車表示。実物と同じく
 *   [列車番号] [行先 両数]
 * の2枡で、左の枡が種別の色、右の枡が白。
 * 抑止・停車中は左端に赤い四角を付ける。
 */
function tidDrawTrainLabel(ctx, t, cx, cy, opt) {
    opt = opt || {};
    const col = TID_TYPE_COLORS[t.type] || TID_TYPE_COLORS["普通"];
    const h = TID_GEO.trainH;
    /* 列車番号の枡。特急は「サンダーバード1号」のように長い名前が入るので、
       必要なぶんだけ広げてから、それでも入らなければ字を小さくする。 */
    ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
    const noText = t.trainNo || "";
    const noW = Math.max(TID_GEO.trainNoW,
                         Math.min(92, ctx.measureText(noText).width + 10));
    const cars = (t.vehicles || []).reduce((s, v) => s + v.cars, 0);
    const destText = (t.dest || "") + (cars ? tidCircledNumber(cars) : "");
    ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
    const destW = Math.max(58, ctx.measureText(destText).width + 12);
    const w = noW + destW;
    const x = cx - w / 2, y = cy - h / 2;

    // 抑止・停車中の赤い四角
    const held = t.isManuallySuspended || t.minorTrouble ||
                 (t.state === "stopped") || (t.state === "holding");
    if (held) {
        ctx.fillStyle = t.isManuallySuspended || t.minorTrouble
            ? TID_COLORS.stopMark : "#E8843C";
        ctx.fillRect(x - 11, y + 2, 9, h - 4);
        ctx.strokeStyle = "#3A1000"; ctx.lineWidth = 0.8;
        ctx.strokeRect(x - 10.5, y + 2.5, 8, h - 5);
    }

    // 列車番号の枡
    ctx.fillStyle = col.bg;
    ctx.fillRect(x, y, noW, h);
    ctx.fillStyle = col.text;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    tidFitText(ctx, noText, noW - 4, "bold", 11);
    ctx.fillText(noText, x + noW / 2, y + h / 2 + 0.5);

    // 行先の枡
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + noW, y, destW, h);
    ctx.fillStyle = TID_COLORS.text;
    ctx.font = "11px 'Meiryo UI', 'Yu Gothic', sans-serif";
    ctx.fillText(destText, x + noW + destW / 2, y + h / 2 + 0.5);

    // 枠
    ctx.strokeStyle = "#5A5A66";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(x + noW, y); ctx.lineTo(x + noW, y + h); ctx.stroke();

    // 遅れ (分)
    const delay = Math.floor((t.delayTime || 0) / 60);
    if (delay >= 1) {
        const dw = 16;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x + w, y, dw, h);
        ctx.strokeStyle = "#D00000"; ctx.lineWidth = 1;
        ctx.strokeRect(x + w + 0.5, y + 0.5, dw - 1, h - 1);
        ctx.fillStyle = "#D00000";
        ctx.font = "bold 10px 'Meiryo UI', sans-serif";
        ctx.fillText(String(delay), x + w + dw / 2, y + h / 2 + 0.5);
    }

    // 編成番号 (車両所ごとの色帯)
    if (opt.showFleet && t.vehicles && t.vehicles.length) {
        const fc = TID_FLEET_COLORS[t.vehicles[0].group] || { bg: "#444", text: "#fff" };
        const label = t.vehicles.map(v => v.id).join("+");
        ctx.font = "9px 'Meiryo UI', sans-serif";
        const fw = ctx.measureText(label).width + 8;
        const fx = x, fy = opt.below ? (y + h + 1) : (y - 11);
        ctx.fillStyle = fc.bg;
        ctx.fillRect(fx, fy, fw, 10);
        ctx.fillStyle = fc.text;
        ctx.fillText(label, fx + fw / 2, fy + 5.5);
    }

    return { x: x - 12, y: y - 12, w: w + 30, h: h + 24 };
}

/* ------------------------------------------------------------------ 分岐・渡り線

   同梱の配線略図をもとにした、駅ごとの分岐の書き起こし。
   旅客向けの線路図には分岐が無いが、Super-TID では実物と同じように
   渡り線 (内外の転線)、他線区との合流・分岐、線内で終わる支線を描く。

     crossovers … 駅構内の渡り線。[上側の線路ID, 下側の線路ID, 形] の配列。
                  形は "x"(両渡り) / "l"(片渡り) / "r"(片渡り 逆向き)
     junctions  … シミュレーターに線路として入っている他線区との合流・分岐。
                  [本線側の線路ID, 分岐側の線路ID, "in"(合流) / "out"(分岐)]
     stubs      … 画面の外へ出ていく線。{ side:"L"|"R", from:線路ID, up:上へ出すか, label:線名 }
*/
const TID_JUNCTIONS = {
    // ---------------- 山陽本線 (姫路口)
    "姫路":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: false, label: "播但線 京口方" },
                        { side: "L", from: "Down_Out", up: false, label: "姫新線 播磨高岡方" },
                        { side: "L", from: "Down_Out", up: false, label: "網干総合車両所方" }] },
    "御着":   { crossovers: [["Up_Out", "Down_Out", "l"]] },
    "宝殿":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    "加古川": { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "加古川線 日岡方" }] },
    "土山":   { crossovers: [["Up_Out", "Down_Out", "l"]] },
    "大久保": { crossovers: [["Up_Out", "Down_Out", "x"]] },
    // 複々線の西端。ここから東は内側線・外側線に分かれる。
    "西明石": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"],
                             ["Up_In", "Down_In", "l"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "網干総合車両所明石支所" }] },
    "明石":   { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]] },
    "須磨":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]] },
    "鷹取":   { stubs: [{ side: "R", from: "Down_Out", up: false, label: "神戸貨物ターミナル" }] },
    "兵庫":   { stubs: [{ side: "R", from: "Down_Out", up: false, label: "和田岬線" }] },
    "神戸":   { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]] },

    // ---------------- 東海道本線 (JR神戸線)
    "芦屋":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]] },
    "西宮":   { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]] },
    // 尼崎 — JR東西線・JR宝塚線との分岐。実物の配線略図どおり、
    //        上りは宝塚線から本線・東西線へ、下りは本線・東西線から宝塚線へ分かれる。
    "尼崎":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                junctions: [["Up_In", "Fukuchi_Up", "in"], ["Up_In", "Tozai_Up", "out"],
                            ["Down_In", "Tozai_Down", "in"], ["Down_In", "Fukuchi_Down", "out"]] },
    "塚本":   { junctions: [["Up_Out", "Up_Hoppo", "out"], ["Down_Out", "Down_Hoppo", "in"]] },
    "大阪":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Up_Out", up: true, label: "大阪環状線 福島方" },
                        { side: "R", from: "Up_Out", up: true, label: "大阪環状線 天満方" }] },
    "新大阪": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: false, label: "おおさか東線 南吹田方" },
                        { side: "R", from: "Up_Out", up: true, label: "東海道新幹線 新大阪駅" }] },
    "吹田":   { junctions: [["Up_Out", "Up_Hoppo", "in"], ["Down_Out", "Down_Hoppo", "out"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "吹田貨物ターミナル" }] },
    "岸辺":   { stubs: [{ side: "L", from: "Down_Out", up: false, label: "吹田総合車両所・吹田機関区" }] },
    "茨木":   { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "大阪貨物ターミナル方" }] },
    "高槻":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "明石支所高槻派出所" }] },
    "山崎":   { crossovers: [["Down_In", "Down_Out", "r"]] },
    "長岡京": { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]] },
    "向日町操": { stubs: [{ side: "R", from: "Down_Out", up: false, label: "吹田総合車両所京都支所" }] },
    "向日町": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]] },
    "西大路": { stubs: [{ side: "L", from: "Down_Out", up: false, label: "京都貨物・梅小路運転区" }] },
    "京都":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: false, label: "山陰本線 梅小路京都西方" },
                        { side: "R", from: "Down_Out", up: false, label: "奈良線 東福寺方" },
                        { side: "R", from: "Up_Out", up: true, label: "東海道新幹線 京都駅" }] },
    // 山科 — 湖西線との分岐
    "山科":   { junctions: [["Up_Out", "Kosei_Up", "out"], ["Down_Out", "Kosei_Down", "in"],
                            ["Up_In", "Kosei_Up", "out"], ["Down_In", "Kosei_Down", "in"]] },
    /* 膳所 — 実物の Super-TID には、下り外〜下り内と上り内〜上り外に
       それぞれ片渡り線が描かれている (草津方=画面の左側)。
       大津には渡り線が無いので入れていない。 */
    "膳所":   { crossovers: [["Down_Out", "Down_In", "l"], ["Up_In", "Up_Out", "l"]] },
    /* 石山 — 複々線の中の駅なので、外側線と内側線をつなぐ渡り線になる。
       (以前は上り外と下り外を直接つないでいたが、
        あいだの内側線2本を飛び越す線路は実際には無い) */
    "石山":   { crossovers: [["Down_Out", "Down_In", "l"], ["Up_In", "Up_Out", "l"]] },
    // 草津 — 複々線の東端 かつ 草津線の分岐
    "草津":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Up_Out", up: true, label: "草津線 手原方" }] },
    "野洲":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Down_Out", up: false, label: "宮原支所野洲派出所" }] },
    "近江八幡": { crossovers: [["Up_Out", "Down_Out", "l"]],
                stubs: [{ side: "R", from: "Up_Out", up: true, label: "近江鉄道八日市線" }] },
    "能登川": { crossovers: [["Up_Out", "Down_Out", "r"]] },
    "彦根":   { stubs: [{ side: "L", from: "Down_Out", up: false, label: "近江鉄道本線 彦根駅" }] },
    // 米原 — 北陸本線・東海道本線(名古屋方)・東海道新幹線
    "米原":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Up_Out", up: true, label: "東海道本線 醒ケ井方" },
                        { side: "R", from: "Down_Out", up: false, label: "東海道新幹線 米原駅" },
                        { side: "L", from: "Down_Out", up: false, label: "宮原支所米原派出所" }] },
    "長浜":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    // 近江塩津 — 湖西線と北陸本線の合流
    "近江塩津": { crossovers: [["Up_Out", "Down_Out", "x"]],
                junctions: [["Up_Out", "Kosei_Up", "in"], ["Down_Out", "Kosei_Down", "out"]] },
    "敦賀":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "R", from: "Up_Out", up: true, label: "ハピラインふくい 南今庄方" },
                        { side: "R", from: "Down_Out", up: false, label: "小浜線 西敦賀方" },
                        { side: "L", from: "Down_Out", up: false, label: "金沢車両区敦賀支所" }] },

    // ---------------- 湖西線
    "大津京":   { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "おごと温泉": { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "堅田":     { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "近江舞子": { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "安曇川":   { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "近江今津": { crossovers: [["Kosei_Up", "Kosei_Down", "x"]],
                  stubs: [{ side: "R", from: "Kosei_Down", up: false, label: "湖西線 近江中庄方" }] },
    "永原":     { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },

    // ---------------- JR宝塚線 (福知山線)
    "塚口":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "l"]] },
    "川西池田": { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "x"]] },
    "宝塚":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "x"]] },
    "道場":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "l"]] },
    "新三田":   { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "x"]],
                  stubs: [{ side: "R", from: "Fukuchi_Down", up: false, label: "福知山線 広野・篠山口方" },
                          { side: "R", from: "Fukuchi_Up", up: true, label: "新三田 電留線" }] },

    // ---------------- JR東西線・片町線(学研都市線)
    "京橋":   { crossovers: [["Tozai_Up", "Tozai_Down", "x"]],
                stubs: [{ side: "L", from: "Tozai_Up", up: true, label: "大阪環状線 京橋駅" }] },
    "鴫野":   { stubs: [{ side: "R", from: "Tozai_Down", up: false, label: "おおさか東線 JR野江方" }] },
    "放出":   { crossovers: [["Tozai_Up", "Tozai_Down", "x"]],
                stubs: [{ side: "R", from: "Tozai_Up", up: true, label: "おおさか東線 高井田中央方" },
                        { side: "R", from: "Tozai_Down", up: false, label: "片町線 徳庵・四条畷方" },
                        { side: "L", from: "Tozai_Down", up: false, label: "放出電留線" }] }
};

/** 渡り線 (片渡り・両渡り) を描く */
function tidDrawCrossover(ctx, cx, yTop, yBot, shape) {
    const w = tidW(BLOCK_WIDTH) * 0.62;
    const draw = (x1, x2) => {
        ctx.strokeStyle = TID_COLORS.railEdge;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x1, yTop); ctx.lineTo(x2, yBot); ctx.stroke();
        ctx.strokeStyle = TID_COLORS.rail;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, yTop); ctx.lineTo(x2, yBot); ctx.stroke();
    };
    if (shape === "x" || shape === "l") draw(cx - w / 2, cx + w / 2);
    if (shape === "x" || shape === "r") draw(cx + w / 2, cx - w / 2);
    /* 転てつ器の印。実物は線路の上に置いた白い四角なので、
       以前の黒い小さな丸から描き替えた。 */
    [[cx - w / 2, yTop], [cx + w / 2, yTop], [cx - w / 2, yBot], [cx + w / 2, yBot]].forEach(p => {
        tidDrawTurnoutBox(ctx, p[0], p[1]);
    });
}

/** 他線区との合流・分岐 (シミュレーター内に線路がある側) */
function tidDrawJunction(ctx, cx, yMain, yBranch, mode) {
    const w = tidW(BLOCK_WIDTH) * 1.15;
    // 合流は分岐側が本線へ寄ってくる形、分岐はその逆
    const x1 = (mode === "in") ? cx - w : cx + w;
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, yMain); ctx.lineTo(x1, yBranch); ctx.stroke();
    ctx.strokeStyle = TID_COLORS.rail;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, yMain); ctx.lineTo(x1, yBranch); ctx.stroke();
    // 合流・分岐点の転てつ器 (実物と同じ白い四角)
    tidDrawTurnoutBox(ctx, cx, yMain);
}

/** 画面の外へ出ていく線 (支線・車両所への引上線など) */
function tidDrawStub(ctx, cx, y, goUp, label, side, order) {
    const dx = (side === "L" ? -1 : 1) * (tidW(BLOCK_WIDTH) * 0.8);
    const dy = (goUp ? -1 : 1) * (24 + order * 14);
    const x2 = cx + dx, y2 = y + dy;
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = TID_COLORS.rail;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x2, y2); ctx.stroke();

    ctx.font = "9px 'Meiryo UI', sans-serif";
    const tw = ctx.measureText(label).width + 8;
    const tx = (side === "L") ? (x2 - tw) : x2;
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.fillRect(tx, y2 - 6, tw, 12);
    ctx.strokeStyle = TID_COLORS.plateEdge;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(tx + 0.5, y2 - 5.5, tw - 1, 11);
    ctx.fillStyle = TID_COLORS.textSub;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, tx + tw / 2, y2);
}

/**
 * 駅の発着予告。
 *
 * 実物の Super-TID は、駅ごとに「どの線路から次に何が来るか」を
 *   [小さな線名の札]
 *   ▮[列車番号][行先 両数]▮      ← 両端の細い黄色はホームを表す
 * の形で、線路と線路のあいだに出している。
 *   例) 膳所 …  下り外 / 3419M 姫　路⑫
 *               下り内 / 731T  姫　路⑫
 *               上り内 / 708M  米　原⑧
 *               上り外 / 3406M 近江塩津⑫
 * これが実物の画面でいちばん目立つ要素なので、同じ形で描く。
 *
 *   cx, cy … 札の中心
 *   rowLabel … 「下り外」などの線名 (null なら札を出さない)
 *   train … 来る列車 (null なら空の枠だけを描く)
 */
function tidDrawPredictPlate(ctx, cx, cy, rowLabel, train) {
    const h = 17, tick = 4;
    const noW = 42;
    let destText = "";
    if (train) {
        const cars = (train.vehicles || []).reduce((s, v) => s + v.cars, 0);
        destText = tidPadDest(train.dest) + (cars ? tidCircledNumber(cars) : "");
    }
    ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
    const noText = train ? (train.trainNo || "") : "";
    const noWfit = Math.max(noW, Math.min(92, ctx.measureText(noText).width + 10));
    const destW = Math.max(62, train ? ctx.measureText(destText).width + 12 : 62);
    const w = tick * 2 + noWfit + destW;
    const x = cx - w / 2, y = cy - h / 2;

    if (!train) {
        // 空き枠。実物も、まだ列車が決まっていない所は薄い枠だけになる。
        ctx.strokeStyle = TID_COLORS.slotEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        return;
    }

    // 両端のホームを表す黄色
    ctx.fillStyle = TID_COLORS.platform;
    ctx.fillRect(x, y, tick, h);
    ctx.fillRect(x + w - tick, y, tick, h);
    // 列車番号 (種別の色)
    const col = TID_TYPE_COLORS[train.type] || TID_TYPE_COLORS["普通"];
    ctx.fillStyle = col.bg;
    ctx.fillRect(x + tick, y, noWfit, h);
    ctx.fillStyle = col.text;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    tidFitText(ctx, noText, noWfit - 4, "bold", 11);
    ctx.fillText(noText, x + tick + noWfit / 2, y + h / 2 + 0.5);
    // 行先と両数 (白地)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + tick + noWfit, y, destW, h);
    ctx.fillStyle = TID_COLORS.text;
    ctx.font = "11px 'Meiryo UI', 'Yu Gothic', sans-serif";
    ctx.fillText(destText, x + tick + noWfit + destW / 2, y + h / 2 + 0.5);
    ctx.strokeStyle = TID_COLORS.plateEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // 線名の小札 (実物は札の左上にはみ出して付く)
    if (rowLabel) {
        ctx.font = "9px 'Meiryo UI', 'Yu Gothic', sans-serif";
        const lw = ctx.measureText(rowLabel).width + 8;
        const lx = x + tick + noWfit / 2 - lw / 2, ly = y - 11;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(lx, ly, lw, 11);
        ctx.strokeStyle = TID_COLORS.plateEdge;
        ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 10);
        ctx.fillStyle = TID_COLORS.text;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(rowLabel, lx + lw / 2, ly + 6);
    }
    return { x: x, y: y, w: w, h: h };
}
