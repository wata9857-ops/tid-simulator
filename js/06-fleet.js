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

// ------------------------------------------------------------------ 留置場定義
// name   : 留置場(夜間滞泊地)の名前。STATION_MAP で座標が引けるもの。
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
    { name: "姫路",     groups: ["ABOSHI", "AKASHI"],               weight: 34,
      weightBy: { AKASHI: 12 } },
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
    { name: "草津",     groups: ["ABOSHI", "AKASHI"],               weight: 5 },
    { name: "野洲",     groups: ["ABOSHI", "AKASHI"],               weight: 12 },
    { name: "米原",     groups: ["ABOSHI", "AKASHI"],               weight: 12 },
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
    "松井山手", "四条畷", "同志社前", "木津", "京田辺", "長尾", "奈良"];

/* 片町線(学研都市線)の、放出より東でシミュレーターの描画範囲外にある駅。
   ここを行先にする列車は放出まで走らせ、放出で運転を打ち切る。 */
const KATAMACHI_BEYOND = ["松井山手", "四条畷", "同志社前", "木津", "京田辺", "長尾", "奈良"];
// 湖西線の駅・行先
const KOSEI_PLACES = ["大津京", "唐崎", "比叡山坂本", "おごと温泉", "堅田", "小野", "和邇",
    "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津",
    "近江中庄", "マキノ", "永原"];
// JR宝塚線(福知山線)の駅・行先
const FUKUCHI_PLACES = ["塚口", "猪名寺", "伊丹", "北伊丹", "川西池田", "中山寺", "宝塚",
    "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田", "篠山口", "福知山"];

/** 始発駅名から、車両を出す留置場の名前を求める */
function fleetHomeOf(startName) {
    if (startName === "網干" || startName === "播州赤穂" || startName === "上郡") return "姫路";
    // 学研都市線の放出以東から来る列車は放出の電留線が受け持つ
    if (KATAMACHI_BEYOND.indexOf(startName) >= 0 || startName === "鴫野") return "放出";
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
    if (name === "宮原操") return 39;
    if (name === "向日町操") return 51;
    if (name === "吹田貨") return 41;
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
    if (FUKUCHI_PLACES.indexOf(name) >= 0 || ["豊岡", "城崎温泉"].indexOf(name) >= 0) return "fukuchi";
    if (KOSEI_PLACES.indexOf(name) >= 0) return "kosei";
    return "main";
}

/** 線区の中での位置。線路図の外の駅は、線区の端のさらに外に置く */
function routePosOf(name) {
    if (KATAMACHI_BEYOND.indexOf(name) >= 0) return TOZAI_EAST_IDX + 1;    // 放出より四条畷方
    if (["篠山口", "福知山", "豊岡", "城崎温泉"].indexOf(name) >= 0) return 22;   // 新三田より先
    if (["網干", "播州赤穂", "上郡"].indexOf(name) >= 0) return -1;            // 姫路より西
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
    const sgn = (d) => (d > 0 ? 1 : d < 0 ? -1 : 0);
    if (la === lb) return sgn(ib - ia);
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
                    list[cursor].at = b.name;
                    this.pools[b.name].push(list[cursor]);
                }
            });
        }
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
            const want = VEH.is207(vehicles[0]) ? (vehicles[0].cars === 4 ? 3 : 4) : vehicles[0].cars;
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
        const prof = this.profileFor(stName, type, trackId, dest, trainNo);
        if (this.satisfies(current, prof)) return current;
        this.release(stName, current);
        /* ★差し替えも、その駅にある編成だけから選ぶ。
           離れた留置場から取ると編成が瞬間移動する。 */
        return this.assign(stName, type, trackId, dest, trainNo, { noBorrow: true });
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
        if (nIdx !== null) {
            for (const b of FLEET_BASES) {
                if (this.baseIndex[b.name] === nIdx && this.pools[b.name]) return b.name;
            }
        }

        let best = null;
        let bestDist = Infinity;
        FLEET_BASES.forEach(b => {
            if (b.groups.indexOf(veh.group) < 0) return;
            if (this.baseIndex[b.name] === undefined) return;
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
            if (ServiceRules.giveBack(v)) return;
            if (v.isFreight || v.isExpress) return;
            const loc = this.homeForVehicle(v, nearName);
            if (loc && this.pools[loc]) { v.at = loc; this.pools[loc].push(v); }
        });
        vehicles.length = 0;
    }
}
