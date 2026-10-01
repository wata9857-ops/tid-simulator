/* 編成(車両)の運用管理。

   ■ この仕組みが受け持つこと
     1. 起動時に EXCEL_VEHICLES を Vehicle 化し、各留置場へランダムに配置する
     2. 列車を生成するとき、その運用に入れる編成を規則どおりに選び出す (assign)
     3. 列車が消えた/折り返した/入区したとき、編成を留置場へ返す (release)

   ■ 運用規則 (実際のJR西日本の運用にあわせたもの)
     * 新快速は必ず12両 (8両 + 4両)。網干総合車両所の223系/225系のみ。
     * 新快速・快速に 221系 / 207系 / 321系 は使わない。
     * 湖西線の普通は京都支所の 221系 または 223系 のみ。
     * 逆に京都支所の車両は本線(JR京都線/JR神戸線)の運用には入れない。
     * JR東西線内を走る列車は 207系 または 321系 のみ。
     * JR宝塚線から大阪方面へ直通する列車は 223系 または 225系。
     * 米原〜敦賀間と湖西線を除き、普通以上の種別は6両以上で組む。

   ■ 枯渇対策
     指定の留置場に条件を満たす編成がない場合、近い留置場から順に借り出す
     (FLEET_MAX_BORROW 箇所まで)。それでも足りないときだけ、車両所ごとに
     FLEET_RESERVE で決めた本数だけ増備編成を用意する。無制限には増えない。
*/

// ------------------------------------------------------------------ 判定述語
const VEH = {
    isAkashi:   (v) => v.group === "AKASHI",     // 207系・321系 (明石支所)
    isKyoto:    (v) => v.group === "KYOTO",      // 221系・223系2500/6000番台 (京都支所)
    isMiyahara: (v) => v.group === "MIYAHARA",   // 223系/225系6000番台 (宮原支所)
    isAboshi:   (v) => v.group === "ABOSHI",     // 223系1000/2000番台・225系0/100番台 (網干)
    is221:      (v) => v.type.indexOf("221系") >= 0,
    is223:      (v) => v.type.indexOf("223系") >= 0,
    is225:      (v) => v.type.indexOf("225系") >= 0,
    is207:      (v) => v.type.indexOf("207系") >= 0,
    is321:      (v) => v.type.indexOf("321系") >= 0,
    // 6000番台 = 221系性能に抑えた車両。新快速・快速の運用には入れない。
    is6000:     (v) => v.type.indexOf("6000番台") >= 0 || v.notes.indexOf("221系性能") >= 0
};

// ------------------------------------------------------------------ 207系の固定の組み合わせ
/* ★207系は 4両 (Z・H・T) ＋ 3両 (S) を組んだ7両が、ふだんは切り離さない固定の組み合わせ
     (編成番号.xlsx の「Z1＋S54」「H1＋S13」「T1＋S2」…)。
     在籍表 (js/02-fleet-data.js) は4両と3両を別々に持っていたので、運用のたびに
     手近な4両と3両を組み合わせ、行路のたびに相手が変わっていた。
     ここで表どおりの組み合わせを1本の7両 (編成番号「Z01+S54」) にまとめる。
     検査・入換・試運転での組み替えは例外なので、シミュレーターでは扱わない。
   ★在籍表の Z01 (7両・「唯一の0番台7両固定編成」) は、表の F1 編成にあたるので F01 と呼ぶ。
   ★S66・S67 は在籍表に無いが、表には T29＋S66・T25＋S67 がある。表どおり7両として持つ。 */
const FORMATION_207_PAIRS = [
    // [4両, 3両, 形式]
    ...[[1, 54], [2, 38], [3, 44], [4, 35], [5, 41], [6, 42], [7, 50], [8, 19], [9, 43], [10, 37],
        [11, 40], [12, 51], [13, 34], [14, 14], [15, 23], [16, 18], [17, 31], [18, 48], [19, 3],
        [20, 52], [21, 45], [22, 55], [23, 16]].map(p => ["Z" + p[0], "S" + p[1], "207系0番台＋1000番台"]),
    ...[[1, 13], [2, 36], [3, 53], [4, 29], [5, 4], [6, 30], [7, 22], [8, 46], [9, 24], [10, 9],
        [11, 39], [12, 32], [13, 47], [14, 49], [15, 28], [16, 6]].map(p => ["H" + p[0], "S" + p[1], "207系1000番台＋1500番台"]),
    ...[[1, 2], [2, 15], [4, 1], [5, 21], [6, 17], [7, 25], [8, 5], [9, 11], [10, 61], [11, 26],
        [12, 20], [13, 27], [14, 7], [15, 12], [16, 8], [17, 10], [19, 33]].map(p => ["T" + p[0], "S" + p[1], "207系1000番台"]),
    ["T3", "T18", "207系1000番台"],
    ...[[20, 57], [21, 59], [22, 64], [23, 65], [24, 63], [25, 67], [26, 56], [27, 58], [28, 62],
        [29, 66], [30, 60]].map(p => ["T" + p[0], "S" + p[1], "207系2000番台"])
];

/** 固定の組み合わせを在籍表に反映する (読み込み時に1回) */
(function mergeFormation207Pairs() {
    if (typeof EXCEL_VEHICLES === "undefined") return;
    const pad = (id) => id.replace(/^([A-Z]+)(\d)$/, "$10$2");
    const f1 = EXCEL_VEHICLES.find(v => v.g === "AKASHI" && v.i === "Z01" && v.c === 7);
    if (f1) f1.i = "F01";
    const take = (id) => {
        const k = EXCEL_VEHICLES.findIndex(v => v.g === "AKASHI" && v.i === id);
        return k >= 0 ? EXCEL_VEHICLES.splice(k, 1)[0] : null;
    };
    const merged = [];
    FORMATION_207_PAIRS.forEach(([a, b, type]) => {
        const ia = pad(a), ib = pad(b);
        const va = take(ia), vb = take(ib);
        const tmpl = va || vb;
        if (!tmpl) return;
        const note = [va && (ia + ": " + va.n), vb && (ib + ": " + vb.n)].filter(Boolean).join(" / ");
        merged.push({ g: "AKASHI", b: tmpl.b, t: type, i: ia + "+" + ib, c: 7,
                      n: "固定の組み合わせ (" + ia + "＋" + ib + ")、" + note, pair: [ia, ib] });
    });
    // 7両の並び (Z → H → T) は、元の4両があった位置あたりに入れる
    const at = EXCEL_VEHICLES.findIndex(v => v.g === "AKASHI" && VEH.is207({ type: v.t }));
    EXCEL_VEHICLES.splice(at >= 0 ? at + 1 : EXCEL_VEHICLES.length, 0, ...merged);
})();

// ------------------------------------------------------------------ 留置場定義
// name   :留置場(夜間滞泊地)の名前。STATION_MAP で座標が引けるもの。
// groups : そこに所属・滞泊できる車両所グループ
// weight : 初期配置時の割り当て比率。
//          配線図(DEPOT_LAYOUTS)のある留置場は、図の収容両数を大きく
//          超えないようにしてある。
/* groups は「そこに滞泊できる車両所グループ」。
   ★実際にその駅まで来る車両を入れておく必要がある。
     入っていないと、そこで運用を終えた編成の返却先が
     「離れた留置場」になり、編成が線路を走らずに移動してしまう
     (行路の記録で終着駅と次の始発駅が食い違う)。
     たとえば明石の207系・321系は、都市圏の普通として
     野洲・米原・京都・姫路まで来る (js/24-service-rules.js の
     urban-local の規則) ので、それらの留置場も受け入れる。 */
const FLEET_BASES = [
    /* ★網干総合車両所は新快速 (8両＋4両) の本拠。この線路図では
       姫路の電留線にまとめて置いている (js/04-depots.js の "姫路")。
       比率を上げた。以前は 15 で、8両編成が宮原操・高槻・向日町操へ
       散らばり、昼には姫路の8両在庫が0本になって
       新快速が 4本/時 → 1.2本/時 まで落ちていた。
       (足りないときは送り込み回送で運ぶが、間に合わない) */
    /* ★網干総合車両所 (網干) を線路図に入れたので、網干の編成は網干に置く。
       姫路の電留線には一部だけ滞泊させる。 */
    { name: "網干",     groups: ["ABOSHI"],                         weight: 30 },
    /* ★明石の207系・321系は西明石より西の運用を持たないので、姫路には置かない */
    { name: "姫路",     groups: ["ABOSHI"],                         weight: 6 },
    { name: "西明石",   groups: ["ABOSHI", "AKASHI"],               weight: 14 },
    /* ★尼崎・大阪は明石の207系・321系の滞泊地。
       網干の223系・225系をここに置くと、新快速に必要な8両編成が
       新快速の始発駅 (姫路) に残らなくなる
       (実測: 姫路の8両在庫が0本になり、新快速が 4本/時 → 1.2本/時)。
       ここで運用を終えた網干の編成は、返却先が「いまいる場所の留置線」
       なので groups に入れなくてもここに置ける
       (homeForVehicle は同じ位置の留置線を優先する)。 */
    { name: "尼崎",     groups: ["AKASHI"],                         weight: 16 },
    { name: "宝塚",     groups: ["AKASHI", "MIYAHARA"],             weight: 8 },
    { name: "新三田",   groups: ["AKASHI", "MIYAHARA"],             weight: 9 },
    /* 宮原支所は JR宝塚線用の223系/225系6000番台 (MIYAHARA) の本拠。
       ★MIYAHARA の比率を上書きで上げてみたが、留置場のあいだの
         在庫の釣り合いが崩れ、大阪〜京都の列車間隔が
         3.4駅 → 11.7駅 まで開いた。比率は据え置きにする。 */
    { name: "宮原操",   groups: ["ABOSHI", "AKASHI", "MIYAHARA"],   weight: 14 },
    { name: "大阪",     groups: ["AKASHI"],                         weight: 12 },
    /* ★JR東西線・学研都市線の車両は放出の電留線を本拠にする。
       これらの列車は尼崎・西明石・宝塚まで直通するので、そこで運用を
       終えた編成はその駅の留置線に返る。放出の在庫は片道で減っていき、
       実測では昼過ぎに0本になって東西線の快速が 1本/時 まで落ちた。
       (離れた留置場から借り出さない = 瞬間移動をしない、としたため)
       起点の在庫を増やして、線区の所要をまわせるようにする。 */
    { name: "京橋",     groups: ["AKASHI"],                         weight: 6 },
    { name: "放出",     groups: ["AKASHI"],                         weight: 34 },
    /* ★学研都市線の南の端の滞泊地。祝園の留置線は2本 (7両×2 = 14両まで。maxCars)、
         奈良支所 (佐保) は木津から出入りする。朝の京橋方面の始発を受け持つ。 */
    { name: "祝園",     groups: ["AKASHI"],                         weight: 2, maxCars: 14 },
    { name: "木津",     groups: ["AKASHI"],                         weight: 6 },
    { name: "高槻",     groups: ["ABOSHI", "AKASHI"],               weight: 6 },
    { name: "向日町操", groups: ["ABOSHI", "KYOTO", "AKASHI"],      weight: 10 },
    /* 京都駅の留置線 (配線略図 スクリーンショット(693).png)。
       ★ここを持っていなかったため、京都で運用を終えた編成の返却先が
         向日町操になり、次に京都から出る列車がその編成を「借り出す」
         形になっていた。編成が向日町操から京都へ瞬間移動したことになる。 */
    /* 京都には湖西線の車両 (京都支所) も滞泊する。湖西線の列車は
       京都で折り返すので、ここに在庫が無いと折り返せず回送になってしまう。
       ★「京都支所の車両は本線運用に入れない」という規則は
         js/24-service-rules.js の pred が守る。加えて、行先が変わって
         規則を外れた場合は js/27-operations.js の fixIllegalStock() が
         当駅止まりに短縮する (実測: 京都→敦賀の普通にキトの編成が
         入っていたのを止めた)。 */
    { name: "京都",     groups: ["ABOSHI", "AKASHI", "KYOTO"],      weight: 5 },
    /* ★琵琶湖線の普通は網干の223系・225系 (と宮原の6000番台)。明石の207系・321系は
         京都より東の運用を持たないので、草津・野洲・米原には滞泊させない
         (以前は米原に 207系・321系が20本前後溜まっていた)。 */
    { name: "草津",     groups: ["ABOSHI"],                         weight: 5 },
    { name: "野洲",     groups: ["ABOSHI", "MIYAHARA"],             weight: 12 },
    { name: "米原",     groups: ["ABOSHI"],                         weight: 12 },
    { name: "敦賀",     groups: ["ABOSHI"],                         weight: 6 },
    { name: "近江今津", groups: ["KYOTO"],                          weight: 8 }
];

// 借り出しを試す留置場の数(近い順)。これを超えたら増備編成の検討へ進む。
const FLEET_MAX_BORROW = 6;

// 車両所グループごとの増備上限。ラッシュ時に本当に足りないときだけ使う。
// 実在の編成番号に続く番号を割り当てるので、際限なく増えることはない。
const FLEET_RESERVE = {
    ABOSHI:   { max: 10, type: "223系2000番台",   prefix: "V",  from: 90, cars: 4, base: "網干総合車両所" },
    AKASHI:   { max: 10, type: "321系",           prefix: "D",  from: 40, cars: 7, base: "網干総合車両所明石支所" },
    MIYAHARA: { max: 4,  type: "223系6000番台",   prefix: "MA", from: 30, cars: 4, base: "網干総合車両所宮原支所" },
    KYOTO:    { max: 4,  type: "221系",           prefix: "K",  from: 30, cars: 4, base: "吹田総合車両所京都支所" }
};

// ------------------------------------------------------------------ 路線判定
// JR東西線の駅・行先 (ここを走る列車は 207系/321系 に限る)
const TOZAI_PLACES = ["京橋", "大阪城北詰", "大阪天満宮", "北新地", "新福島", "海老江",
    "御幣島", "加島", "鴫野", "放出",
    "徳庵", "鴻池新田", "住道", "野崎", "四条畷", "忍ケ丘", "寝屋川公園", "星田", "河内磐船",
    "津田", "藤阪", "長尾", "松井山手", "大住", "京田辺", "同志社前", "JR三山木", "下狛",
    "祝園", "西木津", "木津", "奈良", "加茂"];

/* 片町線(学研都市線)の、木津より先でシミュレーターの描画範囲外にある駅。
   ここを行先にする列車は木津まで走らせ、木津で運転を打ち切る
   (js/12-train-move.js の lineEndForBeyond)。
   ★以前は放出より先がすべて範囲外で、松井山手・四条畷行きも放出で打ち切っていた。 */
const KATAMACHI_BEYOND = ["奈良", "加茂"];
// 赤穂線の駅・行先 (相生で本線から分かれる)
const AKO_PLACES = ["西相生", "坂越", "播州赤穂", "日生", "長船"];
// 湖西線の駅・行先
const KOSEI_PLACES = ["大津京", "唐崎", "比叡山坂本", "おごと温泉", "堅田", "小野", "和邇",
    "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津",
    "近江中庄", "マキノ", "永原"];
// JR宝塚線(福知山線)の駅・行先
const FUKUCHI_PLACES = ["塚口", "猪名寺", "伊丹", "北伊丹", "川西池田", "中山寺", "宝塚",
    "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田", "篠山口", "福知山"];

/** 始発駅名から、車両を出す留置場の名前を求める */
function fleetHomeOf(startName) {
    // 姫路より西は網干総合車両所が受け持つ
    if (["播州赤穂", "坂越", "西相生", "上郡", "有年", "相生", "竜野", "はりま勝原", "英賀保"].indexOf(startName) >= 0) return "網干";
    // 学研都市線の駅から来る列車は放出の電留線が受け持つ
    if (startName === "祝園" || startName === "木津") return startName;
    if (["西木津", "下狛"].indexOf(startName) >= 0) return "祝園";
    if (TOZAI_STATIONS_MAP && Object.values(TOZAI_STATIONS_MAP).indexOf(startName) >= 0 &&
        STATION_MAP[startName] > STATION_MAP["放出"]) return "放出";
    if (KATAMACHI_BEYOND.indexOf(startName) >= 0) return "木津";   // 奈良支所 (佐保) は木津から出入り
    if (startName === "鴫野") return "放出";
    if (startName === "篠山口" || startName === "福知山") return "新三田";
    if (startName === "永原" || startName === "堅田" || startName === "大津京") return "近江今津";
    if (startName === "近江塩津") return "敦賀";
    if (startName === "長浜") return "米原";
    if (startName === "甲子園口" || startName === "塚本") return "宮原操";
    if (startName === "吹田貨") return "宮原操";
    if (startName === "三ノ宮" || startName === "神戸" || startName === "須磨" ||
        startName === "明石" || startName === "大久保" || startName === "加古川") return "西明石";
    /* ★京都は自前の留置線を持つ (js/04-depots.js)。
       ここで向日町操へ読み替えていたため、京都発の列車は必ず
       向日町操の編成を使うことになり、行路が
         「京都 → 西明石」のあとに「京都 → 米原」
       のようにつながって見えていた (編成の瞬間移動)。 */
    if (startName === "西大路" || startName === "向日町" ||
        startName === "長岡京") return "向日町操";
    if (startName === "守山" || startName === "近江八幡" || startName === "能登川") return "野洲";
    if (startName === "彦根" || startName === "坂田") return "米原";
    return startName;
}

/** 駅インデックス(位置の代用)。操車場や線内に描画していない駅も解決する */
function fleetIndexOf(name) {
    if (name === "宮原操") return STATION_MAP["新大阪"];
    if (name === "向日町操") return STATION_MAP["向日町操"];
    if (name === "吹田貨") return STATION_MAP["吹田"];
    const idx = STATION_MAP[name];
    if (idx !== undefined) return idx;
    // STATION_MAP に無い駅 (松井山手・網干・篠山口など) は留置場名へ読み替える
    const home = fleetHomeOf(name);
    return (home !== name) ? fleetIndexOf(home) : null;
}

/* ------------------------------------------------------------------ 線区をまたぐ向き

   ■ 何が問題だったか
     本線・湖西線・JR宝塚線・JR東西線は、同じ駅インデックスの並びを共有している。
     そのため「行先のインデックスが大きければ上り」と比べるだけでは、
     線区をまたいだときに向きを取り違える。
       ・放出の電留線から本線の京都へ出区させると、放出 46 < 京都 55 なので
         「上り (dir=1)」になり、放出から四条畷方へ走り出していた。
       ・同じ駅どうし (放出 → 放出) は比べると「差が無い」のに、
         上り (dir=1) として扱われていた。
     この2つが重なって、放出で運転を打ち切るはずの列車が四条畷方の
     行き止まりへ進み、そこで動けなくなって後続を止めていた。

   ■ どう直したか
     駅がどの線区にあるかを見て、線区どうしのつながり
     (尼崎で本線・JR東西線・JR宝塚線、山科で本線・湖西線) を通って
     向きを変えずに行けるときだけ向きを返す。
     行けないとき (同じ場所・方向転換が要る・線路図の外) は 0 を返すので、
     呼び出し側は「その出区・回送は組めない」と判断できる。

     JR東西線は 尼崎(36) → 放出(46) が上り (dir=1)。
     JR宝塚線は 尼崎(36) → 新三田(23) が下り (dir=-1)。
     湖西線は 山科(56) → 近江塩津(83) が上り (dir=1)。 */

/** その駅 (行先) がどの線区にあるか。"main" / "tozai" / "fukuchi" / "kosei" */
function routeLineOf(name) {
    if (!name) return "main";
    if (TOZAI_PLACES.indexOf(name) >= 0) return "tozai";
    if (AKO_PLACES.indexOf(name) >= 0) return "ako";
    if (FUKUCHI_PLACES.indexOf(name) >= 0 || ["豊岡", "城崎温泉"].indexOf(name) >= 0) return "fukuchi";
    if (KOSEI_PLACES.indexOf(name) >= 0) return "kosei";
    return "main";
}

/** 線区の中での位置。線路図の外の駅は、線区の端のさらに外に置く */
function routePosOf(name) {
    if (KATAMACHI_BEYOND.indexOf(name) >= 0) return TOZAI_EAST_IDX + 1;    // 木津より先
    if (["篠山口", "福知山", "豊岡", "城崎温泉"].indexOf(name) >= 0) return W(22);   // 新三田より先
    if (["日生", "長船"].indexOf(name) >= 0) return AKO_WEST_IDX - 1;           // 播州赤穂より先
    if (["三石", "岡山", "鳥取"].indexOf(name) >= 0) return STATION_MAP["上郡"] - 1; // 上郡より先
    const i = fleetIndexOf(name);
    return (i === null || i === undefined) ? null : i;
}

/**
 * a から b へ、向きを変えずに線路の上をたどって行くときの向き。
 * 1 = 上り / -1 = 下り / 0 = 行けない (同じ場所・方向転換が要る・不明)。
 */
function routeDirection(a, b) {
    if (!a || !b || a === b) return 0;
    const ia = routePosOf(a), ib = routePosOf(b);
    if (ia === null || ib === null) return 0;
    const la = routeLineOf(a), lb = routeLineOf(b);
    const AMA = STATION_MAP["尼崎"], YAMA = STATION_MAP["山科"], SHIO = STATION_MAP["近江塩津"];
    const AIOI = STATION_MAP["相生"];
    const sgn = (d) => (d > 0 ? 1 : d < 0 ? -1 : 0);
    if (la === lb) return sgn(ib - ia);
    /* --- 赤穂線 (相生で本線とつながる。赤穂線は相生より西 = 下り方向)
           本線から赤穂線へは下り、赤穂線から本線 (相生以東) へは上り。
           ほかの分岐線へは本線を上ってそのまま入れる (尼崎・山科で方向を変えない) か、
           JR宝塚線のように方向転換が要るかで決まる。 */
    if (la === "main" && lb === "ako")  return (ia >= AIOI) ? -1 : 0;
    if (la === "ako" && lb === "main")  return (ib >= AIOI) ? 1 : 0;
    if (la === "ako" && (lb === "tozai" || lb === "kosei")) return 1;
    if ((la === "tozai" || la === "kosei") && lb === "ako") return -1;
    if (la === "ako" || lb === "ako") return 0;          // JR宝塚線とは尼崎で方向転換が要る
    // --- 本線 → 分岐線
    if (la === "main" && lb === "tozai")   return (ia <= AMA) ? 1 : 0;
    if (la === "main" && lb === "fukuchi") return (ia >= AMA) ? -1 : 0;
    if (la === "main" && lb === "kosei")   return (ia <= YAMA) ? 1 : 0;
    // --- 分岐線 → 本線
    if (la === "tozai" && lb === "main")   return (ib <= AMA) ? -1 : 0;
    if (la === "fukuchi" && lb === "main") return (ib >= AMA) ? 1 : 0;
    if (la === "kosei" && lb === "main")   return (ib <= YAMA) ? -1 : (ib >= SHIO ? 1 : 0);
    // --- 分岐線どうし (尼崎・山科で本線を通り抜ける)
    if (la === "tozai" && lb === "fukuchi") return -1;
    if (la === "fukuchi" && lb === "tozai") return 1;
    if (la === "fukuchi" && lb === "kosei") return 1;
    if (la === "kosei" && lb === "fukuchi") return -1;
    return 0;                       // 湖西線 ⇄ JR東西線 は尼崎か山科で方向転換が要る
}

/** routeDirection が 0 になった理由 (指令の画面に出す) */
function routeDirectionReason(a, b) {
    if (!a || !b) return "発駅・行先が決まっていません。";
    if (a === b || (routePosOf(a) !== null && routePosOf(a) === routePosOf(b) &&
                    routeLineOf(a) === routeLineOf(b))) {
        return `${a}から${b}へは移動がありません (同じ場所です)。`;
    }
    if (routePosOf(a) === null || routePosOf(b) === null) return `${b}はこの線路図の範囲外です。`;
    return `${a}から${b}へは、途中で方向を変えないと行けません。` +
           `方向転換できる駅までの行先にしてください。`;
}

// ------------------------------------------------------------------ 本体
class FleetManager {
    constructor(game) {
        this.game = game;
        this.pools = {};        // 留置場名 -> Vehicle[]
        this.all = [];          // 全編成 (統計・検証用)
        this.reserveUsed = { ABOSHI: 0, AKASHI: 0, MIYAHARA: 0, KYOTO: 0 };
        this.baseIndex = {};    // 留置場名 -> 駅インデックス
        this.borrowCount = 0;   // 借り出し回数 (デバッグ用)
        this.reserveCount = 0;  // 増備した本数 (デバッグ用)
        this.rejected = 0;      // 検証で弾いた回数 (デバッグ用)
        this.lastReject = "";   // 直近に弾いた理由
    }

    /** 起動時: 全編成を生成し、留置場へランダムに配置する */
    init() {
        // 特急編成・機関車の在庫を作る (js/24-service-rules.js)
        ServiceRules.init();
        this.pools = {};
        this.all = [];
        this.baseIndex = {};
        this.reserveUsed = { ABOSHI: 0, AKASHI: 0, MIYAHARA: 0, KYOTO: 0 };

        FLEET_BASES.forEach(b => {
            this.pools[b.name] = [];
            const idx = fleetIndexOf(b.name);
            if (idx !== null) this.baseIndex[b.name] = idx;
        });

        // グループごとに編成を集めてシャッフル (= 起動ごとに留置位置が変わる)
        const byGroup = { ABOSHI: [], AKASHI: [], MIYAHARA: [], KYOTO: [] };
        EXCEL_VEHICLES.forEach(v => {
            const veh = new Vehicle(v.t, v.i, v.c, v.n, v.b, v.g);
            if (v.pair) veh.pair = v.pair.slice();     // 207系の固定の組み合わせ (4両＋3両)
            this.all.push(veh);
            if (byGroup[v.g]) byGroup[v.g].push(veh);
        });

        for (const g in byGroup) {
            const list = byGroup[g];
            for (let i = list.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
            }
            // そのグループを受け入れる留置場へ、weight の比率で配る
            const targets = FLEET_BASES.filter(b => b.groups.indexOf(g) >= 0 &&
                                                    this.baseIndex[b.name] !== undefined);
            if (targets.length === 0) continue;
            /* 比率は車両所グループごとに上書きできる (weightBy)。
               ★1つの重みを全グループで使っていたため、
                 「網干の8両を姫路に集める」ために宮原操の重みを下げると、
                 宮原支所の223系/225系6000番台 (JR宝塚線用) まで減って
                 宝塚線の本数が落ちていた。 */
            /* 比率は車両所グループごとに上書きできる (weightBy)。
               ★1つの重みを全グループで使っていたため、
                 「網干の8両編成を姫路に集める」と、同じ姫路に
                 明石の207系・321系まで集まってしまい、
                 JR東西線の起点 (放出) の在庫が足りなくなっていた。 */
            const wOf = (b) => (b.weightBy && b.weightBy[g] !== undefined)
                ? b.weightBy[g] : b.weight;
            const total = targets.reduce((s, b) => s + wOf(b), 0);
            let cursor = 0;
            targets.forEach((b, k) => {
                const share = (k === targets.length - 1)
                    ? list.length - cursor
                    : Math.round(list.length * wOf(b) / total);
                for (let n = 0; n < share && cursor < list.length; n++, cursor++) {
                    /* 留置線の長さに限りがある所 (祝園) は、入るぶんだけ置く。残りは次の留置場へ */
                    if (b.maxCars && this.carsAt(b.name) + list[cursor].cars > b.maxCars) break;
                    list[cursor].at = b.name;
                    this.pools[b.name].push(list[cursor]);
                }
            });
        }
        this.balanceSevenCarBases();
    }

    /**
     * 学研都市線・JR東西線の車両を受け持つ留置場で、7両が組めるように
     * 207系の4両と3両の数をそろえる (起動時に1回)。
     *
     * ★学研都市線は7両 (321系の7両固定か207系の4両＋3両) しか入れない。
     *   起動時の配置はランダムなので、放出に3両ばかりが集まると
     *   7両が1本も組めず、JR東西線の下りの始発がまったく出せなかった。
     *   ほかの明石支所の留置場と4両・3両を入れ替えて、組める形にしておく。
     */
    balanceSevenCarBases() {
        const bases = ["放出", "尼崎", "京橋", "祝園", "木津"];
        const others = FLEET_BASES.filter(b => bases.indexOf(b.name) < 0 &&
                                               b.groups.indexOf("AKASHI") >= 0).map(b => b.name);
        const is207 = (v, cars) => v.group === "AKASHI" && VEH.is207(v) && v.cars === cars;
        for (const name of bases) {
            const pool = this.pools[name];
            if (!pool) continue;
            let guard = 0;
            while (guard++ < 60) {
                const n3 = pool.filter(v => is207(v, 3)).length;
                const n4 = pool.filter(v => is207(v, 4)).length;
                if (n3 <= n4) break;
                // 3両を1本出して、ほかの留置場の4両を1本持ってくる
                let swapped = false;
                for (const o of others) {
                    const op = this.pools[o];
                    if (!op) continue;
                    const j = op.findIndex(v => is207(v, 4));
                    if (j < 0) continue;
                    const i = pool.findIndex(v => is207(v, 3));
                    const v3 = pool.splice(i, 1)[0], v4 = op.splice(j, 1)[0];
                    v3.at = o; v4.at = name;
                    op.push(v3); pool.push(v4);
                    swapped = true;
                    break;
                }
                if (!swapped) break;
            }
        }
    }

    /** その留置場で、学研都市線・JR東西線の7両が何本組めるか */
    sevenCarSets(name) {
        const pool = this.pools[name] || [];
        const ok = (v) => v.group === "AKASHI" && (VEH.is207(v) || VEH.is321(v));
        const n7 = pool.filter(v => ok(v) && v.cars === 7).length;
        const n4 = pool.filter(v => ok(v) && v.cars === 4).length;
        const n3 = pool.filter(v => ok(v) && v.cars === 3).length;
        return n7 + Math.min(n4, n3);
    }

    /** その留置場に置いてある両数 */
    carsAt(name) {
        return (this.pools[name] || []).reduce((s, v) => s + (v.cars || 0), 0);
    }

    /** 指定留置場の待機編成 (表示用) */
    poolAt(name) {
        return this.pools[fleetHomeOf(name)] || this.pools[name] || [];
    }

    /** 全留置場の待機編成数 */
    totalIdle() {
        let n = 0;
        for (const k in this.pools) n += this.pools[k].length;
        return n;
    }

    // -------------------------------------------------------------- 運用条件
    /**
     * その列車に入れる編成の条件を決める。
     * 戻り値: { groups, pred, minCars, exactCars, label }
     *   groups    : 使える車両所グループ (優先順)
     *   pred      : 追加の可否判定
     *   minCars   : 最低両数 (連結してでも満たす)
     *   exactCars : 指定があればその両数ぴったりに組む
     */
    /**
     * 運用の条件は js/24-service-rules.js のデータ表 (SERVICE_RULES) に集約した。
     * ここは呼び出しの入口だけを残す。規則を足したいときは
     * SERVICE_RULES に1項目足せばよく、このファイルを触る必要はない。
     */
    profileFor(startName, type, trackId, dest, trainNo) {
        return ServiceRules.profileFor(startName, type, trackId, dest, trainNo);
    }

    // -------------------------------------------------------------- 取り出し
    /* ------------------------------------------------------------ 瞬間移動をしない

       ■ 何が起きていたか
         列車を作るとき、始発駅の留置場に条件を満たす編成が無ければ
         「近い留置場から借り出す」ようになっていた (FLEET_MAX_BORROW)。
         借り出しは在庫の付け替えだけなので、編成は線路を走らずに
         その駅に現れる。行路の記録 (js/30-duty-log.js) で見ると

             374M 京都 → 野洲     (野洲に到着)
             470M 京都 → 野洲     (なぜか京都から始まる)

         のように、編成が野洲から京都へ瞬間移動したことになる。
         実測では、行路のつながり 2921件のうち 802件 (27.5%) が
         この瞬間移動だった。

       ■ 直し方
         列車を作るときの割り当ては「その駅にある編成」だけに限る
         (noBorrow)。足りないときは、編成を持っている車両所から
         送り込み回送を出す (js/27-operations.js の railInStock)。
         回送は実際に線路を走るので、行路がつながる。
    */

    /** home と同じ場所にある留置場だけを並べる (別名・同一位置を含む) */
    samePlaceBases(home) {
        const hIdx = this.baseIndex[home];
        const out = [];
        FLEET_BASES.forEach(b => {
            if (!this.pools[b.name]) return;
            if (b.name === home) { out.push(b.name); return; }
            if (hIdx !== undefined && this.baseIndex[b.name] === hIdx) out.push(b.name);
        });
        if (out.indexOf(home) < 0 && this.pools[home]) out.unshift(home);
        return out;
    }

    /**
     * その運用の条件を満たす編成を持っている留置場を、近い順に1つ返す。
     * 送り込み回送の出発地を決めるのに使う。無ければ null。
     */
    findSupplier(home, prof) {
        const order = this.searchOrder(home, prof);
        for (const loc of order) {
            const pool = this.pools[loc];
            if (!pool || !pool.length) continue;
            if (fleetIndexOf(loc) === fleetIndexOf(home)) continue;   // 同じ場所なら送り込み不要
            const fits = (cars) => pool.some(v =>
                prof.groups.indexOf(v.group) >= 0 && prof.pred(v) &&
                (cars === undefined || v.cars === cars));
            if (prof.pair) {
                if (prof.pair.every(c => fits(c))) return loc;
            } else if (fits(undefined)) {
                return loc;
            }
        }
        return null;
    }

    /** 借り出し候補の留置場を、条件に合うものだけ近い順に並べる */
    searchOrder(home, prof) {
        const hIdx = this.baseIndex[home];
        const list = FLEET_BASES
            .filter(b => this.pools[b.name] &&
                         b.groups.some(g => prof.groups.indexOf(g) >= 0))
            .map(b => ({
                name: b.name,
                dist: (hIdx === undefined || this.baseIndex[b.name] === undefined)
                    ? 999 : Math.abs(this.baseIndex[b.name] - hIdx)
            }));
        list.sort((a, b) => a.dist - b.dist);
        const names = list.map(b => b.name);
        // 指定の留置場は条件外でも必ず最初に見る
        if (this.pools[home] && names.indexOf(home) !== 0) {
            const at = names.indexOf(home);
            if (at > 0) names.splice(at, 1);
            names.unshift(home);
        }
        return names;
    }

    /** pool から条件に合う編成を1本抜き取る。なければ null */
    takeFrom(pool, pred, cars, exclude) {
        const hits = [];
        for (let i = 0; i < pool.length; i++) {
            const v = pool[i];
            if (exclude && exclude.indexOf(v) >= 0) continue;
            if (cars !== undefined && v.cars !== cars) continue;
            if (!pred(v)) continue;
            hits.push(i);
        }
        if (hits.length === 0) return null;
        const at = hits[Math.floor(Math.random() * hits.length)];
        return pool.splice(at, 1)[0];
    }

    /** グループ優先順にあわせた述語 (第1希望の車両所を先に試すため) */
    groupPred(prof, groupName) {
        return (v) => v.group === groupName && prof.pred(v);
    }

    /**
     * 条件に合う編成を1本探す。指定の留置場 -> 近い留置場 の順に見る。
     * 見つかったら [vehicle, 借りた留置場名] を返す。
     */
    findOne(home, prof, cars, taken, searchAll, noBorrow) {
        /* ★noBorrow のときは、その駅にある編成だけを見る。
           離れた留置場から取ると、編成が線路を走らずにそこへ現れてしまう。 */
        const order = noBorrow ? this.samePlaceBases(home) : this.searchOrder(home, prof);
        const limit = (noBorrow || searchAll) ? order.length
                                              : Math.min(order.length, FLEET_MAX_BORROW + 1);
        // 車両所の優先順を守るため、グループごとに全留置場を走査する
        for (let gi = 0; gi < prof.groups.length; gi++) {
            const pred = this.groupPred(prof, prof.groups[gi]);
            for (let oi = 0; oi < limit; oi++) {
                const loc = order[oi];
                const v = this.takeFrom(this.pools[loc], pred, cars, taken);
                if (v) {
                    if (oi > 0) this.borrowCount++;
                    return [v, loc];
                }
            }
        }
        return null;
    }

    /**
     * 増備編成を1本だけ作る。グループごとの上限に達していたら null。
     * 「ラッシュ時に手持ちで足りない場合のみ増備する」ための最後の手段。
     */
    makeReserve(groupName, cars) {
        const spec = FLEET_RESERVE[groupName];
        if (!spec) return null;
        if (this.reserveUsed[groupName] >= spec.max) return null;
        if (cars !== undefined && cars !== spec.cars) return null;
        this.reserveUsed[groupName]++;
        this.reserveCount++;
        const id = spec.prefix + (spec.from + this.reserveUsed[groupName]);
        const veh = new Vehicle(spec.type, id, spec.cars,
            "増備編成（ラッシュ時の所要増に伴う追加投入）", spec.base, groupName);
        this.all.push(veh);
        return veh;
    }

    /**
     * 列車に編成を割り当てる。取り出した編成の配列を返す。
     * 1本も用意できないときだけ null を返す (= その列車は生成されない)。
     */
    assign(startName, type, trackId, dest, trainNo, opts) {
        trainNo = trainNo || "";
        /* noBorrow: その駅にある編成だけを使う (瞬間移動をしない)。
           足りないときは呼び出し側が送り込み回送を手配する。 */
        const noBorrow = !!(opts && opts.noBorrow);

        const prof = this.profileFor(startName, type, trackId, dest, trainNo);

        // --- 特急: 列車名ごとに決まった専用編成を在庫から借りる。
        //     (「はるか」は日根野の281系 HA601〜、のようにデータで縛られている)
        if (prof.express) {
            const set = ServiceRules.takeExpress(prof.express, trainNo);
            if (!set) return null;             // 在庫切れ = その特急は運休
            return set;
        }
        // --- 貨物: 機関車を在庫から借りる
        if (prof.freight) {
            return ServiceRules.takeFreight(startName, dest);
        }

        const home = fleetHomeOf(startName);
        const vehicles = [];

        // --- 新快速など、両数の組み合わせが決まっている運用
        if (prof.pair) {
            for (let i = 0; i < prof.pair.length; i++) {
                const hit = this.findOne(home, prof, prof.pair[i], vehicles, false, noBorrow);
                if (hit) { vehicles.push(hit[0]); continue; }
                const extra = this.makeReserve(prof.groups[0], prof.pair[i]);
                if (extra) { vehicles.push(extra); continue; }
                // 規定の組成が作れない -> この運用は成立しないので在庫を戻す
                this.release(home, vehicles);
                return null;
            }
            return vehicles;
        }

        /* --- 組成が決まっている運用 (学研都市線・JR東西線の7両 など)
               決められた組み合わせを順に試す。7両固定が無ければ 4両＋3両。 */
        if (prof.formations) {
            for (const form of prof.formations) {
                const got = [];
                let ok = true;
                for (const cars of form) {
                    const hit = this.findOne(home, prof, cars, got, true, noBorrow);
                    if (!hit) { ok = false; break; }
                    got.push(hit[0]);
                }
                if (ok) {
                    const check = ServiceRules.validate(startName, type, trackId, dest, got, trainNo);
                    if (check.ok) return got;
                    this.rejected++;
                    this.lastReject = check.reason;
                }
                this.release(home, got);
            }
            // 手持ちで組めないときは増備 (321系7両) を1本だけ試す
            const extra = this.makeReserve(prof.groups[0], 7);
            if (extra && formationMatches(prof.formations, [extra])) return [extra];
            if (extra) this.release(home, [extra]);
            this.shortCars = (this.shortCars || 0) + 1;
            this.lastShort = type + " 7両が組めない at " + startName;
            return null;
        }

        // --- 通常運用: まず1本取り、両数が足りなければ増結する
        const first = this.findOne(home, prof, undefined, vehicles, false, noBorrow);
        if (first) {
            vehicles.push(first[0]);
        } else {
            const extra = this.makeReserve(prof.groups[0]);
            if (extra) vehicles.push(extra);
            else return null;
        }

        let cars = vehicles[0].cars;
        let guard = 0;
        while (cars < prof.minCars && guard++ < 3) {
            // 実際の組成にあわせた増結相手を探す
            //   207系: 4両 + 3両 = 7両
            //   223系/225系/221系: 4両 + 4両 = 8両
            // 最低両数は必須条件なので、増結相手は全留置場から探す
            /* ★207系の3両は、3両＋3両でも最低両数 (6両) を満たすなら3両どうしで組む。
               4両は学研都市線・JR東西線の7両 (4両＋3両) に要るので残しておく
               (学研都市線は7両しか入れない。js/24-service-rules.js)。 */
            let want = VEH.is207(vehicles[0]) ? (vehicles[0].cars === 4 ? 3 : 4) : vehicles[0].cars;
            if (VEH.is207(vehicles[0]) && vehicles[0].cars === 3 && prof.minCars <= 6) want = 3;
            const pair = this.findOne(home, prof, want, vehicles, true, noBorrow) ||
                         this.findOne(home, prof, undefined, vehicles, true, noBorrow);
            if (!pair) break;
            if (cars + pair[0].cars > 12) { this.release(home, [pair[0]]); break; }
            vehicles.push(pair[0]);
            cars += pair[0].cars;
        }

        if (!vehicles.length) return null;

        /* ★両数が足りないまま組成できなかった場合は、ここで諦める。
           これは「あり得ない組み合わせを作ろうとした」のではなく
           「増結相手の在庫が無かった」だけなので、
           下の検証の回数 (rejected) には数えない。
           (数えると、快速を時刻表どおりの本数に増やしたときに
            在庫待ちの回数まで「不正な充当」として見えてしまう) */
        if (cars < prof.minCars) {
            this.shortCars = (this.shortCars || 0) + 1;
            this.lastShort = type + " " + cars + "両 (必要 " + prof.minCars + "両) at " + startName;
            this.release(home, vehicles);
            return null;
        }

        // ★最後の関門: あり得ない組み合わせをここで弾く。
        //   (規則表を通っていても、増結の結果として条件を外れることがある)
        const check = ServiceRules.validate(startName, type, trackId, dest, vehicles, trainNo);
        if (!check.ok) {
            this.rejected++;
            this.lastReject = check.reason;
            this.release(home, vehicles);
            return null;
        }
        return vehicles;
    }

    /**
     * いまの編成でその運用に入れるか。
     * 運転整理で種別を格上げする前の確認に使う (207系で快速は組めない等)。
     * ★修正: 以前は特急・貨物を無条件で true にしていたため、
     *        通勤形のまま特急に格上げできてしまっていた。
     *        いまは特急・貨物も専用編成かどうかを見る。
     */
    canServe(vehicles, startName, type, trackId, dest, trainNo) {
        return this.satisfies(vehicles, this.profileFor(startName, type, trackId, dest, trainNo));
    }

    /** いま組んでいる編成が、その運用の条件を満たしているか */
    satisfies(vehicles, prof) {
        if (!vehicles || !vehicles.length) return false;
        // 修繕待ち・修繕中の編成は、どの運用にも入れない (js/38b-night-work.js の修繕の手配)
        //   (修繕のための回送で工場へ向かっているあいだは、その回送に乗っているのでよい)
        if (vehicles.some(v => v && v.repair && v.repair.state !== "transfer")) return false;

        // --- 特急運用: その列車名の専用編成でなければ不可
        if (prof.express) {
            return vehicles.every(v => v.expressKey === prof.express);
        }
        // --- 貨物運用: 機関車でなければ不可
        if (prof.freight) {
            return vehicles.every(v => !!v.freightKey);
        }
        // --- 特急形・機関車がそのまま回送で走る運用は成立する
        if (ServiceRules.isStockDeadhead(prof, vehicles)) return true;
        // --- 旅客運用: 特急形・機関車は不可
        let cars = 0;
        for (let i = 0; i < vehicles.length; i++) {
            const v = vehicles[i];
            if (v.expressKey || v.freightKey) return false;
            if (v.isFreight || v.isExpress) return false;
            if (prof.groups.indexOf(v.group) < 0) return false;
            if (!prof.pred(v)) return false;
            cars += v.cars;
        }
        if (prof.formations && !formationMatches(prof.formations, vehicles)) return false;
        if (prof.pair) {
            if (vehicles.length !== prof.pair.length) return false;
            const want = prof.pair.slice().sort();
            const have = vehicles.map(v => v.cars).sort();
            for (let i = 0; i < want.length; i++) if (want[i] !== have[i]) return false;
            return true;
        }
        return cars >= prof.minCars;
    }

    /**
     * 折り返し時の編成の引き継ぎ。
     * 折り返し後の運用条件を満たしていればそのまま続投させ、
     * 満たさないときだけ留置場へ返して別の編成を割り当てる。
     */
    reassign(stName, type, trackId, dest, trainNo, current) {
        // 事業用の仕業の編成は差し替えない (仕業の最初から最後まで同じ編成。js/38b-night-work.js)
        if (current && current.some(v => v && v._workSrc)) return current;
        const prof = this.profileFor(stName, type, trackId, dest, trainNo);
        if (this.satisfies(current, prof)) return current;
        this.release(stName, current);
        /* ★差し替えも、その駅にある編成だけから選ぶ。
           離れた留置場から取ると編成が瞬間移動する。 */
        return this.assign(stName, type, trackId, dest, trainNo, { noBorrow: true });
    }

    /**
     * 同じ駅の留置線にいる編成への差し替えを試す。差し替えられなければ元の編成のまま
     * (元の編成を留置線から引き戻して返す)。reassign は失敗すると元の編成を失うので、
     * 「差し替えられるなら差し替える」ときはこちらを使う。
     */
    tryReassign(stName, type, trackId, dest, trainNo, current) {
        const keep = (current || []).slice();
        const got = this.reassign(stName, type, trackId, dest, trainNo, current);
        if (got && got.length) return got;
        keep.forEach(v => {
            for (const k in this.pools) {
                const i = this.pools[k].indexOf(v);
                if (i >= 0) { this.pools[k].splice(i, 1); break; }
            }
        });
        return keep;
    }

    // -------------------------------------------------------------- 返却
    /** その編成を受け入れられる留置場のうち、指定地点から最も近いものを返す */
    homeForVehicle(veh, nearName) {
        const nIdx = fleetIndexOf(nearName);

        /* ★まず「いまいる場所そのものの留置線」を探す。
           そこに置けるなら、編成は動かないので瞬間移動にならない。
           車両所グループの縛りは掛けない。実際にも、その駅の
           電留線・引上線には所属に関わらず置ける
           (どの車両所の運用に入れるかは別の判定 profileFor が見る)。 */
        /* ★本線・分岐線は駅インデックスを共有しているので、番号が同じでも別の線区の駅のことがある
             (本線のある駅と学研都市線の祝園が同じ番号)。線区が違えば「同じ場所」ではない。
             以前はここで網干の223系 (V編成) が祝園・木津の留置線に置かれていた (利用者の指摘 ③)。
           ★学研都市線の留置場 (祝園・木津など) には、そこに滞泊できる車両所グループしか置かない。 */
        const lineOf = (n) => (typeof stationBranchLine === "function") ? (stationBranchLine(n) || "main") : "main";
        const nearLine = lineOf(nearName);
        if (nIdx !== null) {
            for (const b of FLEET_BASES) {
                if (this.baseIndex[b.name] !== nIdx || !this.pools[b.name]) continue;
                if (b.name !== nearName && lineOf(b.name) !== nearLine) continue;
                if (DEPOTS[b.name] && DEPOTS[b.name].line === "Tozai" && b.groups.indexOf(veh.group) < 0) continue;
                // 留置線の長さに限りがある所 (祝園) は、満線ならほかへ
                if (b.maxCars && this.carsAt(b.name) + (veh.cars || 0) > b.maxCars) continue;
                return b.name;
            }
        }

        let best = null;
        let bestDist = Infinity;
        FLEET_BASES.forEach(b => {
            if (b.groups.indexOf(veh.group) < 0) return;
            if (this.baseIndex[b.name] === undefined) return;
            if (b.maxCars && this.carsAt(b.name) + (veh.cars || 0) > b.maxCars) return;
            const d = (nIdx === null) ? 0 : Math.abs(this.baseIndex[b.name] - nIdx);
            if (d < bestDist) { bestDist = d; best = b.name; }
        });
        return best;
    }

    /**
     * 編成を留置場へ返す。返却先は「その車両所の車両を受け入れられる、
     * いま列車がいる場所に最も近い留置場」。
     * 使えない留置場に溜まって在庫切れになるのを防ぐための要。
     */
    release(nearName, vehicles) {
        if (!vehicles || !vehicles.length) return;
        vehicles.forEach(v => {
            if (!v) return;
            // ★特急編成・機関車は専用の在庫へ返す。
            //   以前は返却していなかったため、同じ編成番号が使い捨てになり、
            //   運用中の本数を数えられなくなっていた。
            if (ServiceRules.giveBack(v, nearName)) return;
            if (v.isFreight || v.isExpress) return;
            if (v.workStock) return;      // 事業用の専用車両は在庫に入れない (仕業が戻す。js/38b-night-work.js)
            // 修繕の要る編成は在庫に戻さず、修繕の置き場へ (次の運用に入れない)
            if (v.repair && typeof fleetHoldForRepair === "function") { fleetHoldForRepair(this, v, nearName); return; }
            const loc = this.homeForVehicle(v, nearName);
            if (loc && this.pools[loc]) { v.at = loc; this.pools[loc].push(v); }
        });
        vehicles.length = 0;
    }
}
