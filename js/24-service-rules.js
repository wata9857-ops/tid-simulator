/* 運用規則と車両の適合判定を1か所に集める層 (Service Rules)。

   ■ ここに集約したもの
     1. 特急・貨物の専用車両データ (EXPRESS_FLEET / FREIGHT_FLEET)
        — 「はるか」は必ず日根野支所の281系 HA601〜HA609 を使う、のような
          列車と車両の結び付きをデータで持つ。
     2. 種別・線区ごとの車両運用規則 (SERVICE_RULES)
        — これまで FleetManager.profileFor() に手続きで書かれていたものを
          データ表にした。上から順に最初に当てはまった規則を使う。
     3. 割り当て結果の検証 (ServiceRules.validate)
        — 「特急に通勤形が入る」「東西線に223系が入る」といった
          あり得ない組み合わせを1か所で弾く。

   ■ 増やし方
     * 新しい特急・新形式を足す → EXPRESS_FLEET に1項目足すだけ。
     * 新しい線区・種別の規則を足す → SERVICE_RULES に1項目足すだけ。
     いずれも他のファイルを触る必要はない。
*/

// ------------------------------------------------------------------ 車両所
// 通勤形の4グループ (VEHICLE_CODE) に、特急・貨物の所属を足す。
Object.assign(VEHICLE_CODE, {
    HINENO:       "ヒネ",   // 吹田総合車両所日根野支所      281系(はるか)
    KYOTO_EXP:    "キト",   // 吹田総合車両所京都支所        683系/289系/キハ189系
    FUKUCHIYAMA:  "フチ",   // 吹田総合車両所福知山支所      287系
    CHIZU:        "智頭",   // 智頭急行                      HOT7000系
    FREIGHT:      ""        // 機関車 (JR貨物)
});

/* 特急の専用編成。
   key    … 列車名の判定キー
   match  … 列車名(trainNo)にこの文字列が含まれていればこの編成群を使う
   ids    … 実在の編成番号。ここに無い番号は割り当てない。
   cars   … 1編成の両数
   pair   … 併結運用がある場合の増結編成 (無ければ null)
*/
const EXPRESS_FLEET = {
    haruka: {
        match: "はるか",
        label: "関空特急はるか",
        group: "HINENO", base: "吹田総合車両所日根野支所",
        type: "281系", cars: 6,
        ids: ["HA601", "HA602", "HA603", "HA604", "HA605", "HA606", "HA607", "HA608", "HA609"],
        notes: "関西空港連絡特急「はるか」専用編成。281系6両固定。"
    },
    thunderbird: {
        match: "サンダーバード",
        label: "特急サンダーバード",
        group: "KYOTO_EXP", base: "吹田総合車両所京都支所",
        // 683系4000番台 T編成 (9両固定)。0番台の W編成6両＋V編成3両 も実在するが、
        // 現在のサンダーバードの主力は4000番台なのでこちらを使う。
        type: "683系4000番台", cars: 9,
        ids: ["T41", "T42", "T43", "T44", "T45", "T46", "T47",
              "T48", "T49", "T50", "T51", "T52", "T53", "T54", "T55"],
        notes: "北陸特急「サンダーバード」。683系4000番台9両固定編成。"
    },
    kounotori: {
        match: "こうのとり",
        label: "特急こうのとり",
        group: "FUKUCHIYAMA", base: "吹田総合車両所福知山支所",
        type: "287系", cars: 4,
        ids: ["FA01", "FA02", "FA03", "FA04", "FA05", "FA06", "FA07"],
        notes: "福知山線特急「こうのとり」。287系4両基本、3両を増結することがある。",
        addon: {
            type: "287系", cars: 3,
            ids: ["FC01", "FC02", "FC03", "FC04", "FC05", "FC06"],
            notes: "こうのとり増結用の287系3両編成。"
        }
    },
    hamakaze: {
        match: "はまかぜ",
        label: "特急はまかぜ",
        group: "KYOTO_EXP", base: "吹田総合車両所京都支所",
        type: "キハ189系", cars: 3,
        ids: ["H1", "H2", "H3", "H4", "H5", "H6", "H7"],
        notes: "播但線経由の気動車特急「はまかぜ」。キハ189系3両、多客期は6両。"
    },
    hakuto: {
        match: "はくと",
        label: "特急スーパーはくと",
        group: "CHIZU", base: "智頭急行",
        type: "HOT7000系", cars: 5,
        ids: ["HOT7001", "HOT7002", "HOT7003", "HOT7004", "HOT7005"],
        notes: "智頭急行の車両による特急「スーパーはくと」。5両編成。"
    }
};

/* 特急名が判定できなかったときの受け皿。
   本来ここへ落ちてはいけないので、落ちた場合は警告を出して
   いちばん無難な編成 (287系) を充てる。 */
const EXPRESS_FALLBACK = "kounotori";

/* 貨物列車の機関車。牽引区間で使い分ける。 */
const FREIGHT_FLEET = {
    ef210: { type: "EF210形", base: "吹田機関区",   range: [1, 360], cars: 20,
             notes: "直流電気機関車。東海道・山陽本線の主力。" },
    ef510: { type: "EF510形", base: "富山機関区",   range: [1, 24],  cars: 20,
             notes: "交直流電気機関車。日本海縦貫線(北陸)運用。" },
    ef66:  { type: "EF66形",  base: "吹田機関区",   range: [27, 33], cars: 20,
             notes: "直流電気機関車。定期運用は僅少。" },
    ef65:  { type: "EF65形",  base: "新鶴見機関区", range: [2057, 2097], cars: 20,
             notes: "直流電気機関車。臨時・工臨運用。" }
};

/* ------------------------------------------------------------------ 走行線路の規則

   複々線 (西明石〜草津) には、外側線 (列車線) と内側線 (電車線) がある。
   どちらを走るかは種別と時間帯で決まっていて、これまで
     js/11-train-core.js の checkLogicUpdates()
     js/12-train-move.js の move()
     js/13-train-hold.js の checkHold()
   の3か所に別々の条件が書かれ、食い違っていた。ここ1か所にまとめる。

   ■ いまのJR西日本の規則

     新快速
       * 該当区間を通して 外側線。
       * (参考) 新大阪駅の配線改良より前は、新大阪〜大阪だけ内側線を
         走っていた。これは過去の話なので、いまのシミュレーションでは
         使わない。

     快速
       * 平日朝   高槻 → 大阪   外側線
       * 平日の昼以降          内側線
       * 土曜・日曜・祝日      終日 内側線
       * (参考) 2006年3月17日まで、大阪発17時台の野洲行き快速が
         外側線を走っていた。これも過去の話なので使わない。

     普通
       * 内側線 (電車線)。

     特急・貨物・回送・臨時
       * 外側線 (列車線)。

   ■ 京都・山科より東 / 西明石より西
     複線なので内側線という線路が存在しない。そこでは「外側線」しか
     選べないので、この関数は "out" を返す (内側線へ入れない)。
*/

/** その駅に内側線 (電車線) があるか。複々線は西明石〜草津だけ。 */
function innerTrackExists(stIdx) {
    if (stIdx === undefined || stIdx === null) return false;
    return stIdx >= STATION_MAP["西明石"] && stIdx <= STATION_MAP["草津"];
}

/* 平日朝に快速が外側線を走る区間と時間帯。
   高槻 → 大阪 (下り) のみ。 */
const RAPID_OUTER_MORNING = { from: "高槻", to: "大阪", fromH: 6.0, toH: 9.0 };

/**
 * その列車が、その駅でどちら側の線路を走るべきか。
 *   戻り値 "out" … 外側線 (列車線)
 *          "in"  … 内側線 (電車線)
 * 内側線が無い駅では必ず "out"。
 *
 *   train  … 列車 (type / dir を見る)
 *   stIdx  … いまの駅のインデックス
 *   hour   … 0〜24 の時刻
 */
function serviceTrackSide(train, stIdx, hour) {
    if (!innerTrackExists(stIdx)) return "out";

    const type = train.type;
    // 列車線を走る種別
    if (["新快速", "特急", "貨物", "回送", "臨時"].indexOf(type) >= 0) return "out";
    if (type === "普通") return "in";

    if (type === "快速") {
        /* 快速は
             平日朝の 高槻 → 大阪 … 外側線
             それ以外・土休日      … 内側線
           ★神戸線側も外側線にしてみたが、外側線に
             新快速8本/時＋特急＋快速6本/時 が乗って飽和し、
             1分以上動けない列車が 10% → 21% に増えた。
             指示どおり「平日朝の高槻→大阪だけ外側線」に戻した。 */
        if (!isWeekday()) return "in";
        const r = RAPID_OUTER_MORNING;
        if (hour < r.fromH || hour >= r.toH) return "in";
        // 高槻 → 大阪 は下り (大阪の方がインデックスが小さい)
        if (train.dir !== -1) return "in";
        const hi = STATION_MAP[r.from], lo = STATION_MAP[r.to];
        return (stIdx <= hi && stIdx >= lo) ? "out" : "in";
    }
    return "in";
}

/** その列車が、その駅でいるべき線路ID (内側線が無ければ外側線) */
function serviceTrackIdAt(train, stIdx, hour, baseTrackId) {
    const tid = baseTrackId || train.trackId;
    // 分岐線・北方貨物線はこの規則の対象外
    if (/Kosei|Fukuchi|Tozai|Hoppo/.test(tid)) return tid;
    const side = serviceTrackSide(train, stIdx, hour);
    const head = (tid.indexOf("Up") === 0) ? "Up_" : "Down_";
    return head + (side === "out" ? "Out" : "In");
}

// ------------------------------------------------------------------ 線区の判定
/* どの線区を走る列車かを、始発駅・行先・走行線路からまとめて判定する。
   従来 FleetManager.profileFor() の冒頭に書かれていた判定をここへ出した。 */
function serviceContext(startName, type, trackId, dest, trainNo) {
    trackId = trackId || "";
    trainNo = trainNo || "";
    const startIdx = (typeof fleetIndexOf === "function") ? fleetIndexOf(startName) : null;
    return {
        startName: startName,
        dest: dest || "",
        type: type,
        trackId: trackId,
        trainNo: trainNo,
        startIdx: startIdx,
        isTozai: trackId.indexOf("Tozai") >= 0 ||
                 TOZAI_PLACES.indexOf(startName) >= 0 || TOZAI_PLACES.indexOf(dest) >= 0,
        isKosei: trackId.indexOf("Kosei") >= 0 ||
                 KOSEI_PLACES.indexOf(startName) >= 0 || KOSEI_PLACES.indexOf(dest) >= 0,
        isFukuchi: trackId.indexOf("Fukuchi") >= 0 ||
                   FUKUCHI_PLACES.indexOf(startName) >= 0 || FUKUCHI_PLACES.indexOf(dest) >= 0
    };
}

// ------------------------------------------------------------------ 運用規則表
/* 上から順に見て、最初に when() が true になった規則を使う。
   profile の意味は FleetManager.assign() が解釈する。
     groups    : 使える車両所グループ (優先順)
     pred      : 追加の可否判定
     minCars   : 最低両数 (足りなければ増結する)
     pair      : 両数の組み合わせが決まっている運用 (新快速の 8+4 など)
     express   : EXPRESS_FLEET のキー (特急専用編成を使う)
     freight   : true なら機関車を充てる
*/
const SERVICE_RULES = [
    {
        id: "freight",
        label: "貨物列車",
        when: (c) => c.type === "貨物",
        profile: () => ({ groups: ["FREIGHT"], pred: () => true, minCars: 1,
                          freight: true, label: "貨物" })
    },
    {
        id: "express",
        label: "特急列車",
        when: (c) => c.type === "特急",
        profile: (c) => ({ groups: [], pred: () => true, minCars: 1,
                           express: expressKeyFor(c.trainNo, c.dest, c.startName),
                           label: "特急" })
    },
    {
        id: "express-deadhead",
        label: "特急の送り込み・返却回送",
        // 運用名 (dutyName) が特急名なら、回送でも特急編成を使う。
        // 例: 向日町操 -> 大阪 の回送が、大阪から「はまかぜ」になる運用。
        when: (c) => (c.type === "回送" || c.type === "臨時") && !!expressKeyFromName(c.trainNo),
        profile: (c) => ({ groups: [], pred: () => true, minCars: 1,
                           express: expressKeyFromName(c.trainNo),
                           label: "特急回送" })
    },
    {
        id: "tozai",
        label: "JR東西線・学研都市線 (207系/321系の7両のみ)",
        /* ★学研都市線・JR東西線を走る列車は必ず7両。
           321系の7両固定か、207系の 4両＋3両 (7両固定の編成もある)。
           以前は「6両以上」だったので、207系の 3両＋3両 (6両) や
           4両＋4両 (8両) が学研都市線に入っていた。 */
        when: (c) => c.isTozai,
        profile: () => ({ groups: ["AKASHI"],
                          pred: (v) => VEH.is207(v) || VEH.is321(v),
                          minCars: 7, formations: [[7], [4, 3]], label: "東西線・学研都市線" })
    },
    {
        id: "kosei-local",
        label: "湖西線の普通 (京都支所の221系/223系のみ)",
        when: (c) => c.isKosei && c.type === "普通",
        profile: () => ({ groups: ["KYOTO"],
                          pred: (v) => VEH.isKyoto(v) && (VEH.is221(v) || VEH.is223(v)),
                          minCars: 1, label: "湖西線普通" })
    },
    {
        id: "deadhead",
        label: "回送・臨時 (車両の送り込み・返却)",
        /* 回送は「車両を動かすこと」そのものが目的なので、
           営業列車のような車両所の縛りは掛けない。
           ただし、東西線 (207系/321系のみ) と湖西線の普通の規則は
           この上にあるので、そちらが先に効く。
           以前はこの規則が無く、向日町操へ戻る京都支所の221系が
           「本線の回送」と見なされて弾かれていた。 */
        when: (c) => c.type === "回送" || c.type === "臨時",
        profile: () => ({ groups: ["AKASHI", "ABOSHI", "MIYAHARA", "KYOTO"],
                          pred: () => true, minCars: 1, label: "回送" })
    },
    {
        id: "special-rapid",
        label: "新快速 (網干の223系/225系で必ず8両+4両)",
        when: (c) => c.type === "新快速",
        profile: () => ({ groups: ["ABOSHI"],
                          pred: (v) => VEH.isAboshi(v) && !VEH.is6000(v) && (VEH.is223(v) || VEH.is225(v)),
                          pair: [8, 4], minCars: 12, label: "新快速" })
    },
    {
        id: "fukuchiyama",
        label: "JR宝塚線 (223系/225系)",
        /* JR宝塚線を走る列車は宮原・網干の223系/225系。
           大阪方面へ直通する丹波路快速もここに含まれる。
           (東西線から直通してくる207系/321系は、上の東西線の規則で
            先に判定されるのでここへは来ない) */
        when: (c) => c.isFukuchi,
        profile: () => ({ groups: ["MIYAHARA", "ABOSHI"],
                          pred: (v) => VEH.is223(v) || VEH.is225(v),
                          minCars: 6, label: "宝塚線" })
    },
    {
        id: "rapid",
        label: "本線の快速 (網干の223系/225系)",
        when: (c) => c.type === "快速",
        profile: () => ({ groups: ["ABOSHI"],
                          pred: (v) => VEH.isAboshi(v) && !VEH.is6000(v) && (VEH.is223(v) || VEH.is225(v)),
                          minCars: 6, label: "快速" })
    },
    {
        id: "hokuriku",
        label: "米原〜敦賀 (北陸本線。4両でも可)",
        when: (c) => c.startIdx !== null && c.startIdx >= STATION_MAP["米原"],
        profile: () => ({ groups: ["ABOSHI"], pred: (v) => VEH.isAboshi(v),
                          minCars: 1, label: "北陸線" })
    },
    {
        id: "urban-local",
        label: "西明石〜米原の普通 (都市圏。明石の207系/321系と網干の223系/225系)",
        // 宮原の223系/225系6000番台は本来JR宝塚線の運用だが、
        //   ・宝塚線から尼崎で本線へ直通した列車がそのまま京都方へ延長される
        //   ・明石・網干の車両が足りないときの代走
        // という形で本線の普通に入ることがあるため、第3候補として許可する。
        // (京都支所の車両は本線運用に入れない、という規則は pred で担保している)
        when: (c) => c.startIdx !== null &&
                     c.startIdx >= STATION_MAP["西明石"] && c.startIdx <= STATION_MAP["米原"],
        // 京都より東 (琵琶湖線) は網干の223系/225系が主力、
        // 京都より西 (JR京都線・JR神戸線) は明石の207系/321系が主力。
        // 車両所の優先順だけを区間で入れ替える。
        profile: (c) => ({
            groups: (c.startIdx > STATION_MAP["京都"])
                ? ["ABOSHI", "AKASHI", "MIYAHARA"]
                : ["AKASHI", "ABOSHI", "MIYAHARA"],
            pred: (v) => !VEH.isKyoto(v),
            minCars: 6, label: "都市圏普通" })
    },
    {
        id: "local",
        label: "その他の普通 (網干の223系/225系)",
        when: () => true,
        profile: () => ({ groups: ["ABOSHI"], pred: (v) => VEH.isAboshi(v),
                          minCars: 6, label: "普通" })
    }
];

/**
 * 編成の組み合わせが、決められた組成のどれかに当てはまるか。
 *   formations … [[7], [4, 3]] のような両数の組み合わせの一覧
 */
function formationMatches(formations, vehicles) {
    if (!vehicles || !vehicles.length) return false;
    const have = vehicles.map(v => v.cars).sort((a, b) => a - b).join(",");
    return formations.some(f => f.slice().sort((a, b) => a - b).join(",") === have);
}

/** 列車名(運用名)に特急名が含まれていればそのキーを返す。無ければ null。 */
function expressKeyFromName(trainNo) {
    const name = String(trainNo || "");
    for (const key in EXPRESS_FLEET) {
        if (name.indexOf(EXPRESS_FLEET[key].match) >= 0) return key;
    }
    return null;
}

/** 列車名から特急の専用編成キーを決める */
function expressKeyFor(trainNo, dest, startName) {
    const byName = expressKeyFromName(trainNo);
    if (byName) return byName;
    // 列車名が付いていない特急は行先から推定する
    if (dest === "敦賀" || startName === "敦賀") return "thunderbird";
    if (dest === "鳥取" || startName === "鳥取") return "hakuto";
    if (dest === "城崎温泉" || dest === "豊岡" || dest === "福知山") return "kounotori";
    return EXPRESS_FALLBACK;
}

// ------------------------------------------------------------------ 専用編成の在庫
/* 特急編成は数に限りがある。列車ごとに作り捨てにすると同じ編成番号が
   同時に何本も走ってしまうので、車両所ごとの在庫として貸し借りする。 */
class ExpressFleetPool {
    constructor() {
        this.pools = {};   // key -> Vehicle[] (待機中)
        this.addons = {};  // key -> Vehicle[] (増結用の待機中)
        this.all = [];
        this.shortage = {}; // key -> 在庫切れの回数 (検証用)
        this.build();
    }

    build() {
        for (const key in EXPRESS_FLEET) {
            const spec = EXPRESS_FLEET[key];
            this.pools[key] = spec.ids.map(id => {
                const v = new Vehicle(spec.type, id, spec.cars, spec.notes, spec.base, spec.group);
                v.expressKey = key;
                v.isExpress = true;   // 通勤形の在庫集計から外すための目印
                this.all.push(v);
                return v;
            });
            this.addons[key] = [];
            if (spec.addon) {
                this.addons[key] = spec.addon.ids.map(id => {
                    const v = new Vehicle(spec.addon.type, id, spec.addon.cars,
                                          spec.addon.notes, spec.base, spec.group);
                    v.expressKey = key;
                    v.isExpress = true;
                    v.isAddon = true;
                    this.all.push(v);
                    return v;
                });
            }
            this.shortage[key] = 0;
        }
    }

    /** 1本貸し出す。在庫が無ければ null。 */
    take(key, wantAddon) {
        const pool = wantAddon ? this.addons[key] : this.pools[key];
        if (!pool || pool.length === 0) {
            if (!wantAddon) this.shortage[key] = (this.shortage[key] || 0) + 1;
            return null;
        }
        const at = Math.floor(Math.random() * pool.length);
        return pool.splice(at, 1)[0];
    }

    /** 返却する */
    give(veh) {
        if (!veh || !veh.expressKey) return false;
        const pool = veh.isAddon ? this.addons[veh.expressKey] : this.pools[veh.expressKey];
        if (!pool) return false;
        if (pool.indexOf(veh) < 0) pool.push(veh);
        return true;
    }

    /** 待機中の本数 (検証・表示用) */
    idleCount(key) {
        return (this.pools[key] || []).length;
    }
}

// ------------------------------------------------------------------ 機関車の在庫
/* 機関車も同じ番号が同時に何両も現れないように在庫制にする。 */
class FreightFleetPool {
    constructor() {
        this.pools = {};
        this.all = [];
        for (const key in FREIGHT_FLEET) {
            const spec = FREIGHT_FLEET[key];
            this.pools[key] = [];
            for (let n = spec.range[0]; n <= spec.range[1]; n++) {
                const v = new Vehicle("貨物", spec.type.replace("形", "") + "-" + n, spec.cars,
                                      spec.notes, spec.base, "FREIGHT");
                v.freightKey = key;
                v.isFreight = true;
                this.pools[key].push(v);
                this.all.push(v);
            }
        }
    }

    /** 区間にあう機関車を1両貸し出す */
    take(startName, dest) {
        const hokuriku = (dest === "富山タ" || startName === "富山タ" ||
                          dest === "敦賀" || startName === "敦賀");
        const order = hokuriku ? ["ef510", "ef210"] : ["ef210", "ef66", "ef65"];
        for (const key of order) {
            const pool = this.pools[key];
            if (pool && pool.length) {
                const at = Math.floor(Math.random() * pool.length);
                return pool.splice(at, 1)[0];
            }
        }
        return null;
    }

    give(veh) {
        if (!veh || !veh.freightKey) return false;
        const pool = this.pools[veh.freightKey];
        if (!pool) return false;
        if (pool.indexOf(veh) < 0) pool.push(veh);
        return true;
    }
}

// ------------------------------------------------------------------ 公開API
const ServiceRules = {
    expressPool: null,
    freightPool: null,

    /** 起動時に1度だけ呼ぶ */
    init() {
        this.expressPool = new ExpressFleetPool();
        this.freightPool = new FreightFleetPool();
    },

    /** 線区・種別からこの運用に入れる編成の条件を返す */
    profileFor(startName, type, trackId, dest, trainNo) {
        const ctx = serviceContext(startName, type, trackId, dest, trainNo);
        for (const rule of SERVICE_RULES) {
            if (rule.when(ctx)) {
                const p = rule.profile(ctx);
                p.ruleId = rule.id;
                p.serviceType = type;   // 回送判定に使う
                return p;
            }
        }
        // SERVICE_RULES の最後は when:()=>true なのでここには来ない
        return { groups: ["ABOSHI"], pred: (v) => VEH.isAboshi(v), minCars: 6,
                 label: "普通", ruleId: "local" };
    },

    /** 特急編成を借りる。戻り値は Vehicle[]。在庫が無ければ null。 */
    takeExpress(key, trainNo) {
        if (!this.expressPool) this.init();
        const spec = EXPRESS_FLEET[key];
        if (!spec) return null;
        const base = this.expressPool.take(key, false);
        if (!base) return null;
        const out = [base];
        // 多客期(朝夕)の増結。サンダーバード・こうのとりのみ。
        if (spec.addon && Math.random() < 0.25) {
            const add = this.expressPool.take(key, true);
            if (add) out.push(add);
        }
        return out;
    },

    /** 貨物の機関車を借りる */
    takeFreight(startName, dest) {
        if (!this.freightPool) this.init();
        const loco = this.freightPool.take(startName, dest);
        return loco ? [loco] : null;
    },

    /** 特急・貨物の編成を返却する。通勤形なら false を返す。 */
    giveBack(veh) {
        if (!veh) return false;
        if (veh.expressKey) return this.expressPool ? this.expressPool.give(veh) : false;
        if (veh.freightKey) return this.freightPool ? this.freightPool.give(veh) : false;
        return false;
    },

    /**
     * 割り当て結果の検証。
     * 「ありえない車両が入っていないか」を最後にもう一度確かめる関門。
     * 戻り値 { ok:boolean, reason:string }
     */
    validate(startName, type, trackId, dest, vehicles, trainNo) {
        if (!vehicles || !vehicles.length) return { ok: false, reason: "編成が空" };
        const prof = this.profileFor(startName, type, trackId, dest, trainNo);

        // --- 特急形・機関車の回送 (送り込み・返却・単機) はそのまま成立する
        if (this.isStockDeadhead(prof, vehicles)) return { ok: true, reason: "" };

        // --- 特急: 専用編成しか入れない
        if (prof.express) {
            const key = prof.express;
            for (const v of vehicles) {
                if (v.expressKey !== key) {
                    return { ok: false, reason: `特急${EXPRESS_FLEET[key].label}に ${v.type}(${v.id}) は充当できない` };
                }
            }
            return { ok: true, reason: "" };
        }

        // --- 貨物: 機関車しか入れない
        if (prof.freight) {
            for (const v of vehicles) {
                if (!v.freightKey) return { ok: false, reason: `貨物列車に ${v.type}(${v.id}) は充当できない` };
            }
            return { ok: true, reason: "" };
        }

        // --- 旅客: 特急形・機関車は絶対に入れない
        for (const v of vehicles) {
            if (v.expressKey) return { ok: false, reason: `${type}に特急形 ${v.type}(${v.id}) は充当できない` };
            if (v.freightKey) return { ok: false, reason: `${type}に機関車 ${v.id} は充当できない` };
            if (prof.groups.indexOf(v.group) < 0) {
                return { ok: false, reason: `${prof.label}に ${VEHICLE_CODE[v.group] || v.group}の${v.id} は入れない` };
            }
            if (!prof.pred(v)) {
                return { ok: false, reason: `${prof.label}に ${v.type}(${v.id}) は入れない` };
            }
        }

        // --- 両数
        const cars = vehicles.reduce((s, v) => s + v.cars, 0);
        if (prof.formations && !formationMatches(prof.formations, vehicles)) {
            return { ok: false, reason: `${prof.label}は ${prof.formations.map(f => f.join("+")).join(" か ")}両で組む必要がある ` +
                                        `(現在 ${vehicles.map(v => v.cars).join("+")}両)` };
        }
        if (prof.pair) {
            const want = prof.pair.slice().sort();
            const have = vehicles.map(v => v.cars).sort();
            if (want.length !== have.length || want.some((w, i) => w !== have[i])) {
                return { ok: false, reason: `${prof.label}は ${prof.pair.join("+")}両で組む必要がある (現在 ${have.join("+")}両)` };
            }
        } else if (cars < prof.minCars) {
            return { ok: false, reason: `${prof.label}は${prof.minCars}両以上 (現在 ${cars}両)` };
        }
        return { ok: true, reason: "" };
    },

    /**
     * 特急形・機関車が回送/臨時として走っている状態かどうか。
     * 「はまかぜ」を終えた281系/キハ189系がそのまま回送で車両所へ戻る、
     * といった実際にある動きを、あり得ない組み合わせとして弾かないための判定。
     */
    isStockDeadhead(prof, vehicles) {
        if (prof.express || prof.freight) return false;
        if (prof.serviceType !== "回送" && prof.serviceType !== "臨時") return false;
        if (!vehicles || !vehicles.length) return false;
        const allExpress = vehicles.every(v => !!v.expressKey);
        const allFreight = vehicles.every(v => !!v.freightKey);
        return allExpress || allFreight;
    },

    /** 表示用: 編成の所属略号つき番号を並べた文字列 */
    formationLabel(vehicles) {
        if (!vehicles || !vehicles.length) return "";
        return vehicles.map(v => v.id).join("+");
    }
};
