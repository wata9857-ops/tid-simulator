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
    { id: "Down_Hoppo", label: "北方貨物下", dir: -1, group: "北方貨物線" },
    { id: "Up_Hoppo",   label: "北方貨物上", dir: 1,  group: "北方貨物線" },
    { id: "Down_Out",   label: "下り外",     dir: -1, group: "本線" },
    { id: "Down_In",    label: "下り内",     dir: -1, group: "本線" },
    { id: "Up_In",      label: "上り内",     dir: 1,  group: "本線" },
    { id: "Up_Out",     label: "上り外",     dir: 1,  group: "本線" },
    { id: "Kosei_Down", label: "湖西下り",   dir: -1, group: "湖西線" },
    { id: "Kosei_Up",   label: "湖西上り",   dir: 1,  group: "湖西線" },
    { id: "Fukuchi_Down", label: "宝塚下り", dir: -1, group: "JR宝塚線" },
    { id: "Fukuchi_Up",   label: "宝塚上り", dir: 1,  group: "JR宝塚線" },
    { id: "Tozai_Down", label: "東西下り",   dir: -1, group: "JR東西線" },
    { id: "Tozai_Up",   label: "東西上り",   dir: 1,  group: "JR東西線" }
];

/* 縦の寸法 */
const TID_GEO = {
    topPad:      58,    // 上の駅名札のぶん
    rowGap:      84,    // 線路と線路のあいだ
    groupGap:    58,    // 線区と線区のあいだ
    bottomPad:   58,
    plateW:      104,
    plateH:      22,
    trainH:      18,
    trainNoW:    46,    // 列車番号の桝の幅
    signalR:     4.5,
    circuitR:    3.2,
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
    let cur = TID_GEO.topPad;
    let lastGroup = null;
    TID_ROWS.forEach(row => {
        if (want.indexOf(row.group) < 0) return;
        if (lastGroup !== null && row.group !== lastGroup) cur += TID_GEO.groupGap;
        y[row.id] = cur;
        y.__rows.push(row);
        cur += TID_GEO.rowGap;
        lastGroup = row.group;
    });
    y.__height = cur + TID_GEO.bottomPad;
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
    const scale = TID_GEO.rowGap / K;
    return virt.map(v => refUpOutY - v * scale);
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

/** 駅インデックスから X 座標 */
function tidStationX(i) {
    return 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
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

/** 軌道回路の境目を示す小さな丸 */
function tidDrawCircuitMark(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, TID_GEO.circuitR, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
}

/** 列車の在線を示す青い丸 */
function tidDrawOccupyDot(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = TID_COLORS.dot;
    ctx.fill();
}

/** 駅名札 (白地・黒文字・影付き) */
function tidDrawPlate(ctx, name, cx, cy) {
    const w = Math.max(TID_GEO.plateW, name.length * 15 + 22), h = TID_GEO.plateH;
    const x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = TID_COLORS.plateShadow;
    ctx.fillRect(x + 3, y + 3, w, h);
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

/** ホーム (黄色の帯) と「N番のりば」の札 */
function tidDrawPlatform(ctx, cx, y, label, isUpSide) {
    const w = BLOCK_WIDTH * 0.95;
    const x = cx - w / 2;
    const py = isUpSide ? (y + 6) : (y - 10);
    ctx.fillStyle = TID_COLORS.platform;
    ctx.fillRect(x, py, w, 4);
    ctx.strokeStyle = TID_COLORS.platformEdge;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 0.5, py + 0.5, w - 1, 3);
    if (label) {
        const t = label + "番のりば";
        ctx.font = "9px 'Meiryo UI', 'Yu Gothic', sans-serif";
        const tw = ctx.measureText(t).width + 6;
        const tx = x + w - tw, ty = isUpSide ? (py + 6) : (py - 12);
        ctx.fillStyle = TID_COLORS.platform;
        ctx.fillRect(tx, ty, tw, 11);
        ctx.strokeStyle = TID_COLORS.platformEdge;
        ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 10);
        ctx.fillStyle = TID_COLORS.text;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(t, tx + tw / 2, ty + 6);
    }
}

/** 信号機 (柱と灯) */
function tidDrawSignal(ctx, x, y, dir, aspect, kind) {
    const asp = SIGNAL_ASPECTS[aspect] || SIGNAL_ASPECTS.R;
    const up = (dir === 1);           // 上り = 線路の下側に立てる
    const mastY = up ? y + 9 : y - 9;
    const headY = up ? y + 20 : y - 20;
    ctx.strokeStyle = "#2A2A30";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, mastY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, mastY); ctx.lineTo(x, headY); ctx.stroke();

    const n = asp.lamps.length;
    const r = TID_GEO.signalR;
    const boxH = n * (r * 2 + 1.5) + 3;
    const boxW = r * 2 + 4;
    const bx = x - boxW / 2, by = headY - (up ? 0 : boxH);
    ctx.fillStyle = "#1C1C22";
    ctx.fillRect(bx, by, boxW, boxH);
    asp.lamps.forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(x, by + 3 + i * (r * 2 + 1.5) + r - 1.5, r, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
    });
    if (kind === "出発") {
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "7px 'Meiryo UI', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("出", x + boxW, by + boxH / 2);
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
    const noW = TID_GEO.trainNoW, h = TID_GEO.trainH;
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
    ctx.fillText(t.trainNo || "", x + noW / 2, y + h / 2 + 0.5);

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
        const fx = x, fy = y - 11;
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
    "石山":   { crossovers: [["Up_Out", "Down_Out", "l"]] },
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
    const w = BLOCK_WIDTH * 0.62;
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
    // 転てつ器の印
    ctx.fillStyle = "#2A2A30";
    [[cx - w / 2, yTop], [cx + w / 2, yTop], [cx - w / 2, yBot], [cx + w / 2, yBot]].forEach(p => {
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fill();
    });
}

/** 他線区との合流・分岐 (シミュレーター内に線路がある側) */
function tidDrawJunction(ctx, cx, yMain, yBranch, mode) {
    const w = BLOCK_WIDTH * 1.15;
    // 合流は分岐側が本線へ寄ってくる形、分岐はその逆
    const x1 = (mode === "in") ? cx - w : cx + w;
    ctx.strokeStyle = TID_COLORS.railEdge;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, yMain); ctx.lineTo(x1, yBranch); ctx.stroke();
    ctx.strokeStyle = TID_COLORS.rail;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, yMain); ctx.lineTo(x1, yBranch); ctx.stroke();
    ctx.fillStyle = "#2A2A30";
    ctx.beginPath();
    ctx.arc(cx + (mode === "in" ? -16 : 16), yMain + (yBranch - yMain) * 0.13, 3, 0, Math.PI * 2);
    ctx.fill();
}

/** 画面の外へ出ていく線 (支線・車両所への引上線など) */
function tidDrawStub(ctx, cx, y, goUp, label, side, order) {
    const dx = (side === "L" ? -1 : 1) * (BLOCK_WIDTH * 0.8);
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
