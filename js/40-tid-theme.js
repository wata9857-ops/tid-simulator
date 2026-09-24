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

    /* ------------------------------------------------ 駅の中の寸法 (倍率を掛ける前)
       実物の Super-TID は、駅を
         本線 ─ 転てつ器 ─ 斜めの取付線 ─ 着発線(枠付き) ─ 斜めの取付線 ─ 転てつ器 ─ 本線
       という形で描き、渡り線 (内外の転線) はその外側の「のど」に置いている。
       ホームの帯を斜めの線が横切ることは無い。
       (以前は渡り線を駅の中心に描いていたので、ホームと番線札の上を
        斜めの線が突き抜けていた) */
    stationBoxW: 114,   // 着発線 (構内) の長さ
    leadW:       36,    // 本線から着発線へ取り付く斜めの線の長さ
    throatGap:   6,     // 取付線と渡り線のあいだの余白

    /* となり合う番線の縦の最小間隔 [px] (倍率を掛けたあとの値)。
       列車表示は高さ18px＋編成番号の帯10pxで、線路の上下16pxの所に出る。
       これより詰まると、大阪・京都・尼崎のような番線の多い駅で
       列車表示どうしや、番線札との重なりが避けられない。
       この値を下回る所だけ、駅の中で上下に振り分けて広げる。 */
    laneMinGap:  38,
    /* ホームを挟まない線どうし (どちらも外側へ列車表示を出す所) の間隔。
       列車表示は線路から 36px ぶん (表示18px＋編成番号の帯) 離れる。 */
    laneLabelGap: 76,
    /* どうしても入りきらない駅 (新大阪は番線11本) で、ここまでは詰めてよい値。 */
    laneFloor:   32,
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

/* ------------------------------------------------------------------ 線区の帯と駅名札

   ■ 何が問題だったか (山科〜近江塩津で目立った)
     線区と線区のあいだは groupGap (58px) の決め打ちだった。
     本線の下の駅名札は「上り外の 84px 下」、湖西線の上の駅名札は
     「湖西下りの 113px 上」に置くので、あいだが 58px しか無いと
       本線の札 … 上り外 ＋ 109px
       湖西線の札 … 上り外 ＋ 22px (本線の上り外のすぐ下)
     となり、湖西線の駅名 (大津京・唐崎 …) が本線の上り外の線路・ホーム・
     列車表示に重なり、しかも本線の札より上 (= 本線の側) に出ていた。
     山科〜近江塩津は本線と湖西線が同じ位置に駅を持つので、全駅で起きていた。
     JR宝塚線 (尼崎〜新三田)・JR東西線 (尼崎〜放出) も同じ形だった。

   ■ どう直したか
     線区ごとに「駅の中で番線がどこまで上下に広がるか」を全駅ぶん測り、
     線区と線区のあいだを
       上の線区の下の札 ＋ 札の高さ ＋ 余白 ＋ 下の線区の上の札
     が入るだけ空ける。駅ごとに直すのではなく、番線の配置から計算するので、
     駅や番線を足しても重ならない。上端・下端も同じ考え方で札が画面に収まる
     だけ空ける。 */

const TID_PLATE_MARGIN = 8;      // 札と、となりの線区の札・線路とのすき間 [px]
const TID_LABEL_RESERVE = 52;    // 駅名札の無い線区 (北方貨物線) の外側に要る幅 (列車表示ぶん)

/** その線区の、駅インデックス → 駅名。駅名札を出さない線区は空 */
function tidGroupStationMap(group) {
    if (group === "本線") {
        const m = {};
        STATIONS.forEach((s, i) => { m[i] = s.name; });
        return m;
    }
    if (group === "湖西線") return KOSEI_STATIONS_MAP;
    if (group === "JR宝塚線") return FUKUCHI_STATIONS_MAP;
    if (group === "JR東西線") return TOZAI_STATIONS_MAP;
    return {};
}

/** その線区の線路が通っているインデックスの範囲 */
function tidGroupRange(group) {
    if (group === "湖西線") return tidTrackRange("Kosei_Up");
    if (group === "JR宝塚線") return tidTrackRange("Fukuchi_Up");
    if (group === "JR東西線") return tidTrackRange("Tozai_Up");
    if (group === "北方貨物線") return tidTrackRange("Up_Hoppo");
    return [0, STATIONS.length - 1];
}

/**
 * その線区の、インデックス i での上下の「要る幅」。
 *   top … いちばん上の線路から上に要る幅 / bot … いちばん下の線路から下に要る幅
 * 駅があれば、番線のはみ出し ＋ 駅名札 ＋ 余白。
 * 駅が無くても線路が通っていれば、列車表示ぶん。線路も無ければ null。
 */
const _tidReserveCache = {};
function tidGroupReserveAt(group, i) {
    const key = group + "|" + i;
    if (key in _tidReserveCache) return _tidReserveCache[key];
    const range = tidGroupRange(group);
    let out = null;
    if (i >= range[0] && i <= range[1]) {
        const name = tidGroupStationMap(group)[i];
        if (!name || group === "北方貨物線") {
            out = { top: TID_LABEL_RESERVE, bot: TID_LABEL_RESERVE };
        } else {
            const branch = (group !== "本線");
            const K = TID_GEO.virtualGap;
            const top = branch ? tidVirtualToY(K, 0, true) : tidVirtualToY(3 * K, 0, false);
            let above = 0, below = 0;
            if (STATION_PLATFORM_RULES[name]) {
                tidStationLaneYs(name, 0, branch).forEach(y => {
                    if (top - y > above) above = top - y;
                    if (y > below) below = y;
                });
            }
            out = {
                top: above + TID_GEO.plateTopGap * TID_SCALE_Y + TID_GEO.plateH / 2 + TID_PLATE_MARGIN,
                bot: below + TID_GEO.plateBotGap * TID_SCALE_Y + TID_GEO.plateH / 2 + TID_PLATE_MARGIN
            };
        }
    }
    _tidReserveCache[key] = out;
    return out;
}

/** その線区の上側 (または下側) に要る幅の最大 */
function tidGroupEdgeReserve(group, side) {
    let m = 0;
    for (let i = 0; i < STATIONS.length; i++) {
        const r = tidGroupReserveAt(group, i);
        if (r && r[side] > m) m = r[side];
    }
    return m;
}

/**
 * 上の線区 upper の下端から、下の線区 lower の上端までに要る距離。
 * 同じ横位置 (インデックス) に両方の線路があるところだけを見る。
 * ★駅の横位置が同じ所 (山科〜近江塩津の本線と湖西線など) で、
 *   上の線区の下の札と、下の線区の上の札が縦に並んでも重ならないようにする。
 */
function tidGroupPairGap(upper, lower) {
    let need = 0;
    for (let i = 0; i < STATIONS.length; i++) {
        const a = tidGroupReserveAt(upper, i), b = tidGroupReserveAt(lower, i);
        if (!a || !b) continue;
        if (a.bot + b.top > need) need = a.bot + b.top;
    }
    return need;
}

/**
 * 表示する線区にあわせて、線路IDごとの縦位置を作る。
 * 全線を並べると縦に長くなりすぎるので、ふだんは本線＋1線区だけを出す。
 * 線区と線区のあいだは、駅名札が重ならないだけ空ける (上の説明を参照)。
 */
function buildTidTrackY(groups) {
    const want = groups || ["本線"];
    const y = { __rows: [] };
    const rows = TID_ROWS.filter(row => want.indexOf(row.group) >= 0);
    let cur = 0;
    let lastGroup = null, lastRow = null;
    rows.forEach((row, k) => {
        if (k === 0) {
            cur = Math.max(TID_GEO.topPad * TID_SCALE_Y, tidGroupEdgeReserve(row.group, "top"));
        } else if (row.group !== lastGroup) {
            const fixed = ((lastRow.gap || TID_GEO.rowGap) + TID_GEO.groupGap) * TID_SCALE_Y;
            const need = tidGroupPairGap(lastGroup, row.group);
            cur = y[lastRow.id] + Math.max(fixed, need);
        } else {
            /* 実物と同じく間隔は一定ではない。内側線どうし (下り内〜上り内) は
               あいだにホームが入らないので狭く、外側線との間は
               ホーム帯と「N番のりば」の札が入るので広い。 */
            cur = y[lastRow.id] + (lastRow.gap || TID_GEO.rowGap) * TID_SCALE_Y;
        }
        y[row.id] = cur;
        y.__rows.push(row);
        lastGroup = row.group;
        lastRow = row;
    });
    const tail = lastRow
        ? Math.max(((lastRow.gap || TID_GEO.rowGap) + TID_GEO.bottomPad) * TID_SCALE_Y,
                   tidGroupEdgeReserve(lastGroup, "bot"))
        : TID_GEO.bottomPad * TID_SCALE_Y;
    y.__height = (lastRow ? y[lastRow.id] : cur) + tail;
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
    return tidStationLayout(stName, refUpOutY, branch).ys;
}

/* 駅ごとの縦位置の計算結果を覚えておく (描画のたびに作り直さない) */
const _tidLayoutCache = {};

/**
 * 駅の中の縦位置をまとめて決める。
 *
 * ■ なぜ「広げる」処理が要るか
 *   番線の縦位置は、旅客向けの線路図と同じ並び (stationLaneYPositions) を
 *   4本の線路の間隔で比例配分して決めている。そのため大阪 (9番線) や
 *   京都 (8番線) のように番線の多い駅では、となり合う番線が
 *   18〜22px しか離れず、列車表示 (高さ18px＋編成番号10px) どうしや
 *   「N番のりば」の札と重なって読めなくなっていた。
 *
 * ■ どう広げるか
 *   実物の Super-TID と同じ考え方で、駅の中だけ上下に広げる。
 *   となり合う番線が laneMinGap より近いときだけ、その組を
 *   駅全体の中心から上下へ振り分けて押し広げる。
 *   広がったぶんは、駅の入口・出口に斜めの取付線 (分岐) を描いてつなぐので、
 *   線路として筋が通った形になる (実物の京都駅もこの形をしている)。
 *   広げるのは詰まっている駅だけなので、2〜4番線の駅は今までどおり。
 *
 * ■ 戻り値
 *   ys       … STATION_PLATFORM_RULES[stName].labels と同じ並びの縦位置
 *   homeYs   … その番線が属する本線の縦位置 (取付線をどこへ引くか)
 *   spread   … 広げた駅かどうか
 */
function tidStationLayout(stName, refUpOutY, branch) {
    const key = stName + "|" + Math.round(refUpOutY) + "|" + (branch ? 1 : 0);
    const hit = _tidLayoutCache[key];
    if (hit) return hit;

    const K = TID_GEO.virtualGap;
    /* 実際にあるレーンぜんぶを受け取る (番線の定義ぶんだけではない)。
       js/03-stations.js の stationLaneSlots を参照。 */
    const slots = branch
        ? stationLaneSlots(stName, 0, 0, K, K)
        : stationLaneSlots(stName, 0, K, 2 * K, 3 * K);
    const rule = { labels: slots.map(s => s.label), lanes: slots.map(s => s.platform) };
    const ys = slots.map(s => tidVirtualToY(s.y, refUpOutY, branch));

    // その番線がつながっている本線の縦位置 (取付線の付け根)
    const tracks = slots.map(s => s.track);
    const homeOf = (tid) => {
        if (!branch) return tidVirtualToY(
            { Up_Out: 0, Up_In: K, Down_In: 2 * K, Down_Out: 3 * K }[tid] || 0, refUpOutY, false);
        // 分岐線は上下2本だけ。上り側/下り側のどちらに属するかで振り分ける。
        const up = (tid === "Up_Out" || tid === "Up_In");
        return tidVirtualToY(up ? 0 : K, refUpOutY, true);
    };
    const homeYs = ys.map((_, i) => homeOf(tracks[i] || "Up_Out"));

    /* ------------------------------------------------ 列車表示をどちら側に出すか
       ホームの帯と「N番のりば」の札は、島式ホームを挟む2線のあいだに入る。
       そこへ列車表示まで出すと必ず重なるので、列車表示はホームと反対側
       (線路の外側) に出す。ホームに面していない線 (待避線) は、
       これまでどおり進行方向で決める。
         -1 … 線路の上に出す / +1 … 線路の下に出す / 0 … 進行方向で決める */
    const sides = ys.map(() => 0);
    const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
    const at = {};                       // 番線 -> 上から何番目か
    order.forEach((i, k) => { at[i] = k; });

    /* 島式ホームの組を作る。
       ★「ホームのある線を上から2本ずつ」ではなく、
         「となり合っている2本」だけを組にする。
         あいだに別の線路 (待避線など) が入っている2本を組にすると、
         ホームの帯がその線路をまたいで描かれ、「N番のりば」の札が
         あいだの線路の列車表示と重なる (実測 392px² の重なり)。
         実物でも、島式ホームに面するのはとなり合う2本だけ。 */
    const partner = ys.map(() => -1);
    const platOrder = order.filter(i => !!rule.lanes[i]);
    for (let k = 0; k < platOrder.length; k++) {
        const i = platOrder[k], j = platOrder[k + 1];
        if (partner[i] >= 0) continue;
        if (j !== undefined && partner[j] < 0 && at[j] === at[i] + 1) {
            partner[i] = j; partner[j] = i;
            sides[i] = -1;               // 上側の線 … 表示は線路の上
            sides[j] = +1;               // 下側の線 … 表示は線路の下
        }
    }

    /* 片面ホーム (相手のいないホーム) と、ホームに面していない線。
       ★これまでは進行方向まかせだったので、となりのホームの帯と
         番線の札が入っている隙間へ表示を出してしまうことがあった。
         空いているほう (上下の隙間の広いほう) へ出す。
       片面ホームの帯は、表示と反対側に置く。 */
    const barSide = ys.map(() => 0);
    for (let k = 0; k < order.length; k++) {
        const i = order[k];
        if (sides[i] !== 0) continue;
        const above = (k === 0) ? Infinity : (ys[i] - ys[order[k - 1]]);
        const below = (k === order.length - 1) ? Infinity : (ys[order[k + 1]] - ys[i]);
        sides[i] = (above >= below) ? -1 : +1;
        if (rule.lanes[i]) barSide[i] = -sides[i];
    }

    /* ★ホームに面していない線 (待避線・通過線) も、ここで向きを決める。
       これまでは進行方向まかせだったので、となりのホームの帯と
       「N番のりば」の札が入っている隙間へ表示を出してしまい、
       番線の札の上に列車表示が乗ることがあった (実測 392px² の重なり)。
       空いているほう (上下の隙間の広いほう) へ出す。 */
    for (let k = 0; k < order.length; k++) {
        const i = order[k];
        if (sides[i] !== 0) continue;
        const above = (k === 0) ? Infinity : (ys[i] - ys[order[k - 1]]);
        const below = (k === order.length - 1) ? Infinity : (ys[order[k + 1]] - ys[i]);
        sides[i] = (above >= below) ? -1 : +1;
    }

    const out = { ys: ys, homeYs: homeYs, sides: sides, slots: slots,
                  partner: partner, barSide: barSide,
                  tight: ys.map(() => false), spread: false };
    if (ys.length < 2) { _tidLayoutCache[key] = out; return out; }

    /* ------------------------------------------------ 近すぎる所だけ押し広げる
       必要な間隔は、そのあいだに何が入るかで変わる。
         ホームを挟む2線   … ホーム帯＋番線札ぶん (laneMinGap)
         別のホームどうし  … 両側から列車表示が出るぶん (laneLabelGap)
       実物の Super-TID も、駅の中では線路の間隔が場所ごとに違う。 */
    const gapPair = TID_GEO.laneMinGap;                 // ホームを挟む2線
    const gapLabel = TID_GEO.laneLabelGap;              // 表示が向かい合う所
    /* そのあいだに何が入るかで、必要な間隔を決める。
         列車表示 … 線路から16px 離れ、編成番号の帯まで入れて 36px
         ホーム帯＋番線の札 … 24px
       島式ホームの2線のあいだには表示を出さないので、帯と札だけでよい。 */
    const needSide = (i, dir) => (sides[i] === dir ? 36 : 0) + (barSide[i] === dir ? 24 : 0);
    const need = [];
    for (let k = 0; k + 1 < order.length; k++) {
        const a = order[k], b = order[k + 1];
        if (partner[a] === b) { need.push(gapPair); continue; }   // 島式ホームの2線
        need.push(Math.min(gapLabel, Math.max(gapPair, 8 + needSide(a, +1) + needSide(b, -1))));
    }

    const sorted = order.map(i => ys[i]);
    let touched = false;
    for (let k = 0; k < need.length; k++) {
        if (sorted[k + 1] - sorted[k] < need[k] - 0.5) { touched = true; break; }
    }
    if (!touched) { _tidLayoutCache[key] = out; return out; }

    const fixed = sorted.slice();
    for (let k = 1; k < fixed.length; k++) {
        if (fixed[k] - fixed[k - 1] < need[k - 1]) fixed[k] = fixed[k - 1] + need[k - 1];
    }

    /* 広げすぎて線路の帯からはみ出す駅 (新大阪のように番線が11本ある所) は、
       入るところまで縮める。縮めても laneFloor は下回らない。
       足りないぶんは画面の拡大 (js/43-tid-zoom.js) で見てもらう。 */
    const room = tidStationRoom(refUpOutY, branch);
    let span = fixed[fixed.length - 1] - fixed[0];
    if (span > room && span > 0) {
        const floor = TID_GEO.laneFloor;
        const gaps = [];
        for (let k = 1; k < fixed.length; k++) gaps.push(fixed[k] - fixed[k - 1]);
        const fixedPart = gaps.reduce((t, g) => t + Math.min(g, floor), 0);
        const flexPart = span - fixedPart;
        const scale = (flexPart > 0) ? Math.max(0, (room - fixedPart) / flexPart) : 0;
        let acc = fixed[0];
        for (let k = 0; k < gaps.length; k++) {
            const base = Math.min(gaps[k], floor);
            acc += base + (gaps[k] - base) * scale;
            fixed[k + 1] = acc;
        }
        span = fixed[fixed.length - 1] - fixed[0];
    }

    // 中心を動かさずに置き直す
    const before = (sorted[0] + sorted[sorted.length - 1]) / 2;
    const after = (fixed[0] + fixed[fixed.length - 1]) / 2;
    const shift = before - after;
    order.forEach((idx, k) => { ys[idx] = fixed[k] + shift; });

    /* 縮めた結果、列車表示を出す側の隙間が足りなくなった番線に印を付ける。
       そこだけ編成番号の帯を表示の左側に並べて、高さを詰める。 */
    out.tight = ys.map(() => false);
    for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const sd = sides[i];
        if (sd === 0) continue;
        const nb = (sd === +1) ? order[k + 1] : order[k - 1];
        if (nb === undefined) continue;
        if (Math.abs(fixed[k] - fixed[(sd === +1) ? k + 1 : k - 1]) < gapLabel - 0.5) {
            out.tight[i] = true;
        }
    }

    out.spread = true;
    _tidLayoutCache[key] = out;
    return out;
}

/**
 * 駅の中で番線を広げてよい縦の幅。
 * 線路の帯そのものに、上下の駅名札との余白を足したぶんまで。
 * ここを超えると駅名札や隣の線区に掛かってしまう。
 */
function tidStationRoom(refUpOutY, branch) {
    const K = TID_GEO.virtualGap;
    const band = branch
        ? Math.abs(tidVirtualToY(K, refUpOutY, true) - refUpOutY)
        : Math.abs(tidVirtualToY(3 * K, refUpOutY, false) - refUpOutY);
    const margin = (TID_GEO.plateTopGap - 30 + TID_GEO.plateBotGap - 30) * TID_SCALE_Y;
    return band + Math.max(0, margin);
}

/* ------------------------------------------------------------------ 駅の中の横位置

   実物の Super-TID の駅は、左から
     [渡り線のある のど] [取付線] [着発線 (枠付き)] [取付線] [渡り線のある のど]
   の順に並ぶ。ホームの帯は着発線のまんなかに置く。
   渡り線を駅の中心に描くとホームと番線札を突き抜けるので、
   ここで求めた「のど」の位置に置く。 */

/** 着発線 (構内) の長さ */
function tidStationBoxW() { return tidW(TID_GEO.stationBoxW); }
/** 本線から着発線へ取り付く斜めの線の長さ */
function tidLeadW() { return tidW(TID_GEO.leadW); }
/** 渡り線の横幅 */
function tidCrossoverW() { return tidW(BLOCK_WIDTH) * 0.52; }
/**
 * 駅の「のど」(渡り線を置く場所) の中心。
 *   side … "L" 画面の左 (草津・米原方) / "R" 画面の右 (姫路方)
 */
function tidThroatX(cx, side) {
    const d = tidStationBoxW() / 2 + tidLeadW() + tidW(TID_GEO.throatGap) + tidCrossoverW() / 2;
    return (side === "R") ? (cx + d) : (cx - d);
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
     1駅 360px × 1.3 = 468px、全線で約 40,000px。
     キャンバスは画面ぶんだけ描いて余白は spacer の div が持つので、
     iPad のキャンバス面積の上限には掛からない。 */
/* ★2026-09 の見直し
     2.4倍は、駅の中の要素 (番線・ホーム・分岐・列車表示) が重ならないように
     するための値だったが、1駅が 864px になって駅間 (閉塞) が間延びし、
     画面に2駅ぶんしか入らなくなっていた。
     重なりは「駅の中を縦に広げる」(tidStationLayout) と
     「渡り線を駅の外の のど に置く」(TID_JUNCTIONS の side) で直したので、
     横の倍率は元の見た目に近い所まで戻す。
     足りないときは画面の拡大縮小 (js/43-tid-zoom.js) で拡げられる。 */
const TID_SCALE   = 1.3;    // 横 (駅の間隔・閉塞の長さ)
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

/* ★左右の入れ替えはしない。
   TID_JUNCTIONS の "L"/"R" と "l"/"r" は、説明どおり
   「Super-TID の画面で見たときの向き」で書く。
   以前はここで入れ替えていたため、側を明示した渡り線・支線が
   画面の反対側に、片渡りが逆向きに描かれていた
   (tools/.tmp/tidshot/米原.png で確認)。 */

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
/* 描いた札の位置を記録するための入れ物。
   null のときは何もしない (ふだんの描画では使わない)。
   重なりを測る検証 (tools/check_overlap.js) がここに配列を入れて集める。
   「画面で見て大丈夫そう」で済ませると、今回のように
   実際には重なっているものを見落とすため。 */
let TID_BOXES = null;
function tidRecordBox(kind, x, y, w, h, note) {
    if (!TID_BOXES) return;
    TID_BOXES.push({ kind: kind, x: x, y: y, w: w, h: h, note: note || "" });
}

/**
 * 片面ホーム (相手のいないホーム) の帯。
 * 列車表示と反対側 (barDir: -1 上 / +1 下) に置く。
 * 線路の上に帯を重ねると、在線の丸と列車表示に掛かってしまう。
 */
function tidDrawPlatformSingle(ctx, cx, y, label, barDir) {
    const d = (barDir === -1) ? -1 : 1;
    // 帯の中心が線路から 13px 離れるように、仮の相手を置いて同じ描き方をする
    if (d === 1) tidDrawPlatform(ctx, cx, y, y + 26, null, label);
    else         tidDrawPlatform(ctx, cx, y - 26, y, label, null);
}

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
    const put = (v, ty) => {
        const t = nameOf(v);
        const tw = ctx.measureText(t).width;
        ctx.fillText(t, cx, ty);
        tidRecordBox("platform", cx - tw / 2, ty - 5, tw, 10, t);
    };
    if (labelUpper) put(labelUpper, py - 7);
    if (labelLower) put(labelLower, py + 13);
    tidRecordBox("platformBar", x, py, w, 4, "");
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

    tidRecordBox("train", x, y, w, h, t.trainNo || "");
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

    /* 編成番号 (車両所ごとの色帯)。
       ふだんは列車番号の上か下に付けるが、番線の間隔が足りない駅
       (新大阪のように11番線ある所) では、表示の高さを詰めるため
       左どなりに並べる (opt.inlineFleet)。 */
    let padL = 12, padT = 12, padB = 12;
    if (opt.showFleet && t.vehicles && t.vehicles.length) {
        const fc = TID_FLEET_COLORS[t.vehicles[0].group] || { bg: "#444", text: "#fff" };
        const label = t.vehicles.map(v => v.id).join("+");
        ctx.font = "9px 'Meiryo UI', sans-serif";
        const fw = ctx.measureText(label).width + 8;
        let fx, fy, fh = 10;
        if (opt.inlineFleet) {
            fx = x - fw - 2; fy = y + (h - fh) / 2;
            padL = fw + 14;
        } else {
            fx = x; fy = opt.below ? (y + h + 1) : (y - 11);
            if (opt.below) padB = 24; else padT = 24;
        }
        ctx.fillStyle = fc.bg;
        ctx.fillRect(fx, fy, fw, fh);
        ctx.fillStyle = fc.text;
        ctx.fillText(label, fx + fw / 2, fy + fh / 2 + 0.5);
        tidRecordBox("fleet", fx, fy, fw, fh, label);
    }

    return { x: x - padL, y: y - padT, w: w + padL + 18, h: h + padT + padB };
}

/* ------------------------------------------------------------------ 分岐・渡り線

   同梱の配線略図をもとにした、駅ごとの分岐の書き起こし。
   旅客向けの線路図には分岐が無いが、Super-TID では実物と同じように
   渡り線 (内外の転線)、他線区との合流・分岐、線内で終わる支線を描く。

     crossovers … 駅の渡り線。[上側の線路ID, 下側の線路ID, 形, 置く場所] の配列。
                  形は "x"(両渡り) / "l"(画面で左上→右下に下がる片渡り) /
                  "r"(画面で右上→左下に下がる片渡り)

                  ★置く場所 (4つめ) は "L"(画面の左＝米原・敦賀・新三田・放出方) /
                    "R"(画面の右＝姫路・大阪・京橋方) / "B"(両側)。省略したときは
                      両渡り("x")   … "B" (実物の主要駅は駅の前後に1組ずつある)
                      片渡り("l"/"r") … "L"
                    とする。
                    いずれにしても渡り線は「のど」(着発線の外側) に描く。
                    以前は駅の中心に描いていたため、ホームの帯と
                    「N番のりば」の札を斜めの線が突き抜けていた。
                    (IMG_0332 / IMG_0333 で指摘された所)
     junctions  … シミュレーターに線路として入っている他線区との合流・分岐。
                  [本線側の線路ID, 分岐側の線路ID, "in"(合流) / "out"(分岐), 置く場所]

                  ★置く場所 (4つめ) を書かなければ "in" は画面の左・"out" は
                    画面の右になる。実物は「上りの合流も下りの分岐も駅の同じ端」
                    という所が多いので、その場合は 4つめで側を指定する。
                    例) 尼崎の JR宝塚線は 立花 (画面右) 側、JR東西線は
                        塚本 (画面左) 側。配線略図 スクリーンショット(711).png
     stubs      … 画面の外へ出ていく線。{ side:"L"|"R", from:線路ID, up:上へ出すか, label:線名 }
*/
const TID_JUNCTIONS = {
    // ---------------- 山陽本線 (姫路口)
    /* 姫路 — 配線略図 スクリーンショット(706).png / (707).png。
       播但線は駅の東 (画面左) の上側から、姫新線は駅の西 (画面右) の下側へ出る。
       網干総合車両所は姫路より西なので、この線路図では画面の右の外。
       (以前は3本とも「画面左・下向き」で、姫新線と網干が逆側に出ていた) */
    "姫路":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: true,  label: "播但線 京口方" },
                        { side: "R", from: "Up_Out",   up: false, label: "姫新線 播磨高岡方" },
                        { side: "R", from: "Up_Out",   up: false, label: "網干総合車両所方" }] },
    /* ひめじ別所 — 図では駅の曽根 (画面左) 側の上に、両渡り2組を持つ
       大きな貨物駅がある (スクリーンショット(706).png)。定義が無かった。 */
    "ひめじ別所": { stubs: [{ side: "L", from: "Down_Out", up: true, label: "姫路貨物駅" }] },
    /* ★御着 — 2面3線。中線は左端で上り本線だけにつながり、
       右端 (東姫路方) で上り本線と下り本線の両方につながる。
       上下がつながるのは右のどだけで、下り本線から右下へ下る向き
       (スクリーンショット(706).png)。以前は画面左・逆向きだった。 */
    "御着":   { crossovers: [["Up_Out", "Down_Out", "r", "R"]] },
    "宝殿":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    "加古川": { crossovers: [["Up_Out", "Down_Out", "x"]],
                // 加古川線は宝殿 (画面右) 側の下へ出る (スクリーンショット(705).png)
                stubs: [{ side: "R", from: "Up_Out", up: false, label: "加古川線 日岡方" }] },
    /* 東加古川 — 2面3線。中線は加古川 (画面右) 側で上下本線の両方につながる。
       定義が無かった (スクリーンショット(705).png)。 */
    "東加古川": { crossovers: [["Up_Out", "Down_Out", "l", "R"]] },
    "土山":   { crossovers: [["Up_Out", "Down_Out", "l"]] },
    "大久保": { crossovers: [["Up_Out", "Down_Out", "x"]] },
    // 複々線の西端。ここから東は内側線・外側線に分かれる。
    "西明石": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"],
                             ["Up_In", "Down_In", "l"]],
                /* 明石支所は 明石〜西明石 のあいだ、本線の下にある
                   (スクリーンショット(705).png)。明石は西明石の画面左どなりなので側は L。 */
                stubs: [{ side: "L", from: "Up_Out", up: false, label: "網干総合車両所明石支所" }] },
    "明石":   { crossovers: [["Up_Out", "Up_In", "l"], ["Down_In", "Down_Out", "r"]] },
    /* ★須磨 — 図 (スクリーンショット(704).png) にある渡り線は
       「下り電車線と上り電車線をつなぐ両渡り1組」で、場所は神戸 (画面左) 側。
       内側線と外側線をつなぐ渡り線は無い。
       須磨で折り返す普通電車はこの両渡りで向きを変える。
       (以前は 上外↔上内・下内↔下外 の2組にしていた) */
    "須磨":   { crossovers: [["Down_In", "Up_In", "x", "L"]] },
    /* 摩耶 — 灘 (画面右) 側に 下り内↔上り内 と 上り内↔上り外 の片渡り。
       島式ホームは内側線2本のあいだ (スクリーンショット(698).png)。 */
    "摩耶":   { crossovers: [["Down_In", "Up_In", "r", "R"], ["Up_In", "Up_Out", "r", "R"]] },
    /* 灘 — 下り電車線と上り電車線をつなぐ渡り線が、
       摩耶 (画面左) 側に片渡り1つ、三ノ宮 (画面右) 側に両渡り1組。 */
    "灘":     { crossovers: [["Down_In", "Up_In", "l", "L"], ["Down_In", "Up_In", "x", "R"]] },
    "鷹取":   { stubs: [{ side: "R", from: "Up_Out", up: false, label: "神戸貨物ターミナル" }] },
    /* 兵庫 — 新長田 (画面右) 側に 下り外↔下り内 と 上り内↔上り外 の片渡り。
       上下をつなぐ渡り線は無いので方転はできない。
       和田岬線は図では上へ出る (和田岬は兵庫の南。図は南が上)。 */
    "兵庫":   { crossovers: [["Down_Out", "Down_In", "l", "R"], ["Up_In", "Up_Out", "r", "R"]],
                stubs: [{ side: "R", from: "Down_Out", up: true, label: "和田岬線" }] },
    /* ★神戸 — 図 (スクリーンショット(704).png) の渡り線は
       「下り内↔上り内 (右下がり)」と「上り内↔上り外 (右上がり)」の2つで、
       どちらも元町 (画面左) 側。下り内↔下り外 の渡り線は無い。
       神戸で折り返す普通電車は 下り内↔上り内 で向きを変える。 */
    "神戸":   { crossovers: [["Down_In", "Up_In", "l", "L"], ["Up_In", "Up_Out", "r", "L"]] },

    // ---------------- 東海道本線 (JR神戸線)
    /* ★芦屋 — 大阪 (画面左) 側のどに **下り内↔上り内 の片渡り** がある
       (スクリーンショット(698).png。下り外から下り内を横切って上り内へ
        下る1本の斜線として描かれている)。これが芦屋で方転できる根拠。
       ※1回目の総点検では、この渡り線を隣の さくら夙川 のものと取り違えていた。
         ホームの端からの距離を測り直すと芦屋ののどに属する。 */
    "芦屋":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"],
                             ["Down_In", "Up_In", "r", "L"]] },
    /* ★西宮 — 図 (スクリーンショット(698).png) では、下り外側線の上と
       上り外側線の下にそれぞれ待避線があり、転てつ器はその待避線への
       出入口だけ。内側線と外側線をつなぐ渡り線は無い。
       この線路図は待避線を行として持たないので、渡り線の定義は置かない。
       ★西宮は SWITCHABLE_STATIONS に入っているが、実物の配線では方転できない。
         tools/check_turnouts.js の KNOWN_NO_REVERSE に理由つきで記録した。 */
    // さくら夙川 — 島式1面2線。渡り線は無い (神戸方の渡り線は芦屋ののど)。
    // 尼崎 — JR東西線・JR宝塚線との分岐。実物の配線略図どおり、
    //        上りは宝塚線から本線・東西線へ、下りは本線・東西線から宝塚線へ分かれる。
    /* 尼崎 — 配線略図 スクリーンショット(698).png / (711).png。
       島式4面8線。のど (駅の両端) に隣りあう着発線どうしをつなぐ転てつ器が
       扇のように並び、下り内側線と上り内側線もつながっている
       (これが東西線・宝塚線の列車が本線へ出入りする経路)。
       ★JR東西線は塚本 (画面左) 側、JR宝塚線は立花 (画面右) 側に分かれる。
         以前は上りの2本だけ側が逆で、上り宝塚線が画面左・
         上り東西線が画面右に描かれていた。 */
    "尼崎":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"],
                             ["Down_In", "Up_In", "x"]],
                junctions: [["Up_In", "Fukuchi_Up", "in", "R"], ["Up_In", "Tozai_Up", "out", "L"],
                            ["Down_In", "Tozai_Down", "in", "L"], ["Down_In", "Fukuchi_Down", "out", "R"]] },
    /* 塚本 — 北方貨物線 (宮原操経由) は尼崎 (画面右) 側で分かれる。
       図では D・E の記号で 画像699 の宮原(操) につながっている。 */
    "塚本":   { junctions: [["Up_Out", "Up_Hoppo", "out", "R"], ["Down_Out", "Down_Hoppo", "in", "R"]] },
    /* 大阪 — 図 (スクリーンショット(697).png) では 環状線のホーム (1・2番) が
       いちばん上で、天満方が画面左・福島方が画面右へ出る。
       天満は京都側、福島は神戸側なので、この線路図でも
       天満＝画面左 (新大阪方)・福島＝画面右 (塚本方) になる。
       (以前は左右が逆で、しかも上り外側線から上へ出していた) */
    "大阪":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: true, label: "大阪環状線 天満方" },
                        { side: "R", from: "Down_Out", up: true, label: "大阪環状線 福島方" }] },
    "新大阪": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                // おおさか東線は東淀川 (画面左) 側の上へ出る
                stubs: [{ side: "L", from: "Down_Out", up: true,  label: "おおさか東線 南吹田方" },
                        { side: "R", from: "Up_Out",   up: false, label: "東海道新幹線 新大阪駅" }] },
    /* 吹田・岸辺 — 吹田貨物ターミナルと吹田総合車両所は 岸辺〜吹田 のあいだ、
       本線の下にある (スクリーンショット(696).png)。
       吹田から見ると画面左 (岸辺方)、岸辺から見ると画面右 (吹田方)。
       (以前は2つとも逆側に出ていた) */
    /* ★吹田 — 東淀川 (画面右) 側に **下り内↔上り内 の両渡り** がある
       (スクリーンショット(696).png を拡大して確認)。
       これが吹田で方転できる根拠。総点検の1回目で読み落としていた。 */
    "吹田":   { crossovers: [["Down_In", "Up_In", "x", "R"]],
                junctions: [["Up_Out", "Up_Hoppo", "in"], ["Down_Out", "Down_Hoppo", "out"]],
                stubs: [{ side: "L", from: "Up_Out", up: false, label: "吹田貨物ターミナル" }] },
    "岸辺":   { stubs: [{ side: "R", from: "Up_Out", up: false, label: "吹田総合車両所・吹田機関区" }] },
    // 茨木 — 内外の渡り線は2組とも千里丘 (画面右) 側。貨物線は上へ出る。
    "茨木":   { crossovers: [["Up_Out", "Up_In", "x", "R"], ["Down_In", "Down_Out", "r", "R"]],
                stubs: [{ side: "R", from: "Down_Out", up: true, label: "大阪貨物ターミナル方" }] },
    // 高槻 — 電留線 (高槻派出所) は島本 (画面左) 側、本線の下
    "高槻":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Up_Out", up: false, label: "明石支所高槻派出所" }] },
    /* ★山崎 — 図 (スクリーンショット(694).png) にあるのは
       下り外側線の**上**に付く待避線への転てつ器だけで、
       内側線と外側線をつなぐ渡り線は無い。渡り線の定義をやめた。 */
    /* ★長岡京 — 渡り線は2組とも 山崎 (画面右) 側。
       下り外↔下り内 は右下がり、上り内↔上り外 は右上がり。
       (以前は既定のまま画面左に置き、しかも向きが逆だった) */
    "長岡京": { crossovers: [["Down_In", "Down_Out", "l", "R"], ["Up_In", "Up_Out", "r", "R"]] },
    // 向日町操 — 京都支所の構内は本線の上 (スクリーンショット(694).png)
    "向日町操": { stubs: [{ side: "R", from: "Down_Out", up: true, label: "吹田総合車両所京都支所" }] },
    "向日町": { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]] },
    // 西大路 — 京都貨物 (梅小路) は京都 (画面左) 側、本線の下
    "西大路": { stubs: [{ side: "L", from: "Up_Out", up: false, label: "京都貨物・梅小路運転区" }] },
    /* 京都 — 渡り線は 上り外〜上り内 と 下り内〜下り外 の2組。
       ★上り電車線と下り電車線を直接つなぐ渡り線も入れてみたが、
         京都止まりの上り列車がホームで折り返すようになり、
         2番・3番が折り返し列車で埋まって上り電車線が通れなくなった
         (JR京都線 京都〜大阪 の列車間隔が 3.0駅 → 5.0駅)。
         この線路図は京都に8線しか持っていないため (実物は0・2〜10番)、
         折り返しは駅の南側の引上線 (4〜7番につながる) で行う形にする。
         利用者の指摘どおり、6番・7番に着いた当駅止まりの多くは
         京都駅の留置線へ入る (js/04-depots.js の "京都")。 */
    "京都":   { crossovers: [["Up_Out", "Up_In", "x"], ["Down_In", "Down_Out", "x"]],
                /* 奈良線は山科 (画面左) 側の上、山陰本線は西大路 (画面右) 側の上へ出る
                   (スクリーンショット(693).png)。以前は左右が逆だった。 */
                stubs: [{ side: "L", from: "Down_Out", up: true,  label: "奈良線 東福寺方" },
                        { side: "R", from: "Down_Out", up: true,  label: "山陰本線 梅小路京都西方" },
                        { side: "R", from: "Up_Out",   up: false, label: "東海道新幹線 京都駅" }] },
    // 山科 — 湖西線との分岐
    /* ★山科 — 湖西線は駅の草津 (画面左) 側で分かれ、上り線は東海道本線を
       乗り越して外側線につながる (スクリーンショット(692).png / (703).png)。
       内側線 (電車線) と湖西線をつなぐ転てつ器は無い。
       以前は内側線とも結び、しかも上りの分岐を画面右に描いていた。 */
    "山科":   { junctions: [["Up_Out", "Kosei_Up", "in", "L"],
                            ["Down_Out", "Kosei_Down", "in", "L"]] },
    /* 膳所 — 実物の Super-TID には、下り外〜下り内と上り内〜上り外に
       それぞれ片渡り線が描かれている (草津方=画面の左側)。
       大津には渡り線が無いので入れていない。 */
    "膳所":   { crossovers: [["Down_Out", "Down_In", "r"], ["Up_In", "Up_Out", "l"]] },
    /* ★石山 — 図 (スクリーンショット(692).png) を読み直すと、石山の転てつ器は
       「下り外側線の上に付く待避線」と「上り外側線の下に付く待避線」への
       出入口だけで、内側線と外側線をつなぐ渡り線は無い
       (島式2面4線のホームは 下外|下内 と 上内|上外 に付く)。
       待避線はこの線路図の行に無いので、渡り線の定義を外した。
       膳所は同じ図で 下り内→下り外・上り内→上り外 の片渡りが
       草津 (画面左) 側にあることを確認できたので残している。 */
    // 草津 — 複々線の東端 かつ 草津線の分岐
    /* ★草津 — 複々線の東端。スクリーンショット(692).png を拡大して読むと
         ・京都 (画面右) 側 … 下り外↔下り内、上り内↔上り外
         ・米原 (画面左) 側 … 上り内↔上り外、さらに **下り内↔上り内 の両渡り**
       で、下り外↔下り内 は米原側には無い。
       下り内↔上り内 の両渡りが草津で折り返すときの方転設備。
       草津線は栗東と同じ画面左側、図では上から入ってくる。 */
    "草津":   { crossovers: [["Up_Out", "Up_In", "x"],
                             ["Down_In", "Down_Out", "x", "R"],
                             ["Down_In", "Up_In", "x", "L"]],
                stubs: [{ side: "L", from: "Down_Out", up: true, label: "草津線 手原方" }] },
    // 野洲 — 電留線 (野洲派出所) は篠原 (画面左) 側、本線の上
    "野洲":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: true, label: "宮原支所野洲派出所" }] },
    /* 篠原 — 安全側線つきの Y 字で上下本線をつなぐ渡り線が
       野洲 (画面右) 側に1組ある (スクリーンショット(691).png)。定義が無かった。 */
    "篠原":   { crossovers: [["Up_Out", "Down_Out", "x", "R"]] },
    // ★近江八幡 — 上下をつなぐ渡り線は安土 (画面左) 側に1つ。右上→左下 なので "r"
    "近江八幡": { crossovers: [["Up_Out", "Down_Out", "r"]],
                stubs: [{ side: "R", from: "Up_Out", up: false, label: "近江鉄道八日市線" }] },
    /* ★安土 — 2面2線＋中線。中線は左端で下り本線・右端で上り本線につながる
       ので、のどごとに片渡り1つ (両渡りではない)。 */
    "安土":   { crossovers: [["Up_Out", "Down_Out", "l", "B"]] },
    /* ★能登川 — 下り本線→中線→上り本線 とつながるのは彦根 (画面左) 側だけ。
       中線は右端では下り本線へ戻る。向きは右下がり ("l")。 */
    "能登川": { crossovers: [["Up_Out", "Down_Out", "l"]] },
    /* ★河瀬・安土は2面3線 (上下本線＋中線) で、中線へ入るための
       転てつ器が駅の両端にある (配線略図 スクリーンショット(690).png /
       (691).png)。定義が無かったため、待避・折り返しに使う駅なのに
       方転できる設備を持たないことになっていた
       (tools/check_turnouts.js で検出)。 */
    "河瀬":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    /* ★彦根 — 2面2線＋中線。中線は両端で上下本線の両方につながるので
       のどごとに両渡り1組。渡り線の定義がまったく無かった。 */
    "彦根":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Down_Out", up: true, label: "近江鉄道本線 彦根駅" }] },
    // 米原 — 北陸本線・東海道本線(名古屋方)・東海道新幹線
    /* 米原 — 醒ケ井 (名古屋方) は坂田と同じく彦根とは反対側なので、
       この線路図では画面の**左**の外へ出る (以前は右になっていた)。
       電留線 (米原派出所) は坂田 (画面左) 側の上 (スクリーンショット(690).png)。 */
    "米原":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Up_Out",   up: false, label: "東海道本線 醒ケ井方" },
                        { side: "L", from: "Down_Out", up: true,  label: "宮原支所米原派出所" },
                        { side: "R", from: "Down_Out", up: true,  label: "東海道新幹線 米原駅" }] },
    "長浜":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    /* 虎姫・高月・木ノ本・新疋田 — スクリーンショット(700).png / (701).png。
       虎姫は河毛 (画面左) 側に片渡り1つ、ほかは中線を持つので
       のどの両側で上下本線がつながる。定義が無かった。 */
    "虎姫":   { crossovers: [["Up_Out", "Down_Out", "l"]] },
    "高月":   { crossovers: [["Up_Out", "Down_Out", "x"]] },
    "木ノ本": { crossovers: [["Up_Out", "Down_Out", "x"]] },
    "新疋田": { crossovers: [["Up_Out", "Down_Out", "x"]] },
    // 近江塩津 — 湖西線と北陸本線の合流
    /* 近江塩津 — 湖西線 (永原方) は木ノ本と同じ画面右側に出る
       (スクリーンショット(700).png / (702).png)。以前は上りだけ画面左だった。 */
    "近江塩津": { crossovers: [["Up_Out", "Down_Out", "x"]],
                junctions: [["Up_Out", "Kosei_Up", "in", "R"], ["Down_Out", "Kosei_Down", "out", "R"]] },
    /* 敦賀 — ハピラインふくい (南今庄方) は新疋田とは反対側 = 画面**左**の外。
       小浜線と金沢車両区敦賀支所は画面右 (スクリーンショット(700).png)。 */
    "敦賀":   { crossovers: [["Up_Out", "Down_Out", "x"]],
                stubs: [{ side: "L", from: "Up_Out",   up: false, label: "ハピラインふくい 南今庄方" },
                        { side: "R", from: "Up_Out",   up: false, label: "小浜線 西敦賀方" },
                        { side: "R", from: "Down_Out", up: true,  label: "金沢車両区敦賀支所" }] },

    // ---------------- 湖西線
    /* 湖西線 — スクリーンショット(702).png / (703).png。
       両渡りは「山科寄りの端」ではなく「近江塩津寄りの端」= 画面の右に1組だけ、
       という駅が多い。堅田だけ両側にある。
       ★おごと温泉は相対式2面2線で、線がホームの所で広がっているだけ。
         渡り線も待避線も無いので定義をやめた。
         (SWITCHABLE_STATIONS / OVERTAKE_STATIONS には入っているが、
          実物では折り返しも待避もできない。
          tools/check_turnouts.js の KNOWN_NO_REVERSE に記録) */
    "大津京":   { crossovers: [["Kosei_Up", "Kosei_Down", "x", "R"]] },
    "堅田":     { crossovers: [["Kosei_Up", "Kosei_Down", "x"]] },
    "和邇":     { crossovers: [["Kosei_Up", "Kosei_Down", "l", "R"]] },
    "近江舞子": { crossovers: [["Kosei_Up", "Kosei_Down", "x", "R"]] },
    "安曇川":   { crossovers: [["Kosei_Up", "Kosei_Down", "x", "R"]] },
    // 近江今津 — 電留線は近江中庄 (画面左) 側ではなく駅の右どなり、線路の上
    "近江今津": { crossovers: [["Kosei_Up", "Kosei_Down", "x"]],
                  stubs: [{ side: "R", from: "Kosei_Down", up: true, label: "近江今津 電留線" }] },
    "永原":     { crossovers: [["Kosei_Up", "Kosei_Down", "x", "R"]] },

    // ---------------- JR宝塚線 (福知山線)
    /* JR宝塚線 — スクリーンショット(709).png / (710).png。
       ★塚口は尼崎 (画面左) 側に両渡り1組、猪名寺 (画面右) 側に片渡り1つ。
       ★宝塚は中線を持ち、のどごとに片渡りが1つずつ (向きは左右で逆)。
       ★新三田の両渡りは三田 (画面左) 側。電留線は駅の右どなりの上。
       ★川西池田は相対式2面2線で、線がホームの所で広がっているだけ。
         渡り線は無いので定義をやめた
         (tools/check_turnouts.js の KNOWN_NO_REVERSE に記録)。 */
    "塚口":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "x", "L"],
                               ["Fukuchi_Up", "Fukuchi_Down", "l", "R"]] },
    "宝塚":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "r", "L"],
                               ["Fukuchi_Up", "Fukuchi_Down", "l", "R"]] },
    "道場":     { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "l"]] },
    "新三田":   { crossovers: [["Fukuchi_Up", "Fukuchi_Down", "x", "L"]],
                  stubs: [{ side: "R", from: "Fukuchi_Up",   up: false, label: "福知山線 広野・篠山口方" },
                          { side: "R", from: "Fukuchi_Down", up: true,  label: "新三田 電留線" }] },

    // ---------------- JR東西線・片町線(学研都市線)
    /* JR東西線・片町線 — スクリーンショット(711).png / (712).png。
       京橋の引上線は大阪城北詰 (画面右) 側。
       ★鴫野のおおさか東線 (JR野江方) と、放出のおおさか東線・片町線は
         どれも放出・徳庵の側 = 画面の**左**に出る (以前は右だった)。 */
    "京橋":   { crossovers: [["Tozai_Up", "Tozai_Down", "x"]],
                stubs: [{ side: "L", from: "Tozai_Down", up: true,  label: "大阪環状線 京橋駅" },
                        { side: "R", from: "Tozai_Up",   up: false, label: "京橋 引上線" }] },
    "鴫野":   { stubs: [{ side: "L", from: "Tozai_Up", up: false, label: "おおさか東線 JR野江方" }] },
    "放出":   { crossovers: [["Tozai_Up", "Tozai_Down", "x"]],
                stubs: [{ side: "L", from: "Tozai_Down", up: true,  label: "おおさか東線 高井田中央方" },
                        { side: "L", from: "Tozai_Up",   up: false, label: "片町線 徳庵・四条畷方" },
                        { side: "L", from: "Tozai_Down", up: true,  label: "放出電留線" }] }
};

/**
 * 渡り線 (片渡り・両渡り) を描く。
 * cx は駅の中心ではなく「のど」の中心 (tidThroatX) を渡すこと。
 * 駅の中心に描くと、ホームの帯と番線札を斜めの線が突き抜けてしまう。
 */
function tidDrawCrossover(ctx, cx, yTop, yBot, shape) {
    const w = tidCrossoverW();
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
    const w = tidW(BLOCK_WIDTH) * 0.9;
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
    const dx = (side === "L" ? -1 : 1) * (tidW(BLOCK_WIDTH) * 0.55);
    const dy = (goUp ? -1 : 1) * (22 + order * 13);
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
    tidRecordBox("predict", x, y, w, h, noText);

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
