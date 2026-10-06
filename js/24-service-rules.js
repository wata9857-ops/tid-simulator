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

/* ------------------------------------------------------------------ 工臨・単機回送の機関車

   ■ 何を直したか (利用者の指摘)
     工事用臨時列車 (工臨) と機関車だけの回送 (単機回送) を、ふつうの電車の
     「臨時」として走らせていた (通勤形の編成が充てられていた)。
     実物は機関車が工事用の貨車 (ロングレール輸送のチキ・バラストのホキ) を引くか、機関車だけで走る。
   ■ 機関車と拠点
     EF65形 … 下関総合車両所 (JR西日本)。山陽本線から入り、網干・宮原を足場に工臨を引く。
               下関との行き来は線路図の西の端 (上郡) を通る単機回送になる。
     DD51形 … 網干総合車両所宮原支所。宮原操を拠点に工臨・単機回送。
   JR貨物の単機 (吹田機関区の EF210 など) は貨物の機関車の在庫 (FREIGHT_FLEET) を使う。
   機関車は「いまどこに居るか (at)」を持ち、その場所から出る工臨・単機だけを引く
   (機関車が線路を走らずに別の場所へ現れることはない)。機番は代表的な番号を振ったもの。 */
const WORK_LOCO_FLEET = {
    ef65: { type: "EF65形", base: "下関総合車両所", ids: ["1124", "1128", "1130", "1131"],
            at: ["網干", "網干", "宮原操", "上郡"],
            notes: "直流電気機関車 (JR西日本)。工事用臨時列車・単機回送。下関から山陽本線経由で入る。" },
    dd51: { type: "DD51形", base: "網干総合車両所宮原支所", ids: ["1183", "1191", "1192"],
            at: ["宮原操", "宮原操", "宮原操"],
            notes: "ディーゼル機関車。宮原を拠点に工事用臨時列車・単機回送。" },
    /* ★向日町操を足場にする DE10 (上郡の乗務員訓練・京都貨物との単機。js/38b-night-work.js の WORK_PATTERNS) */
    de10: { type: "DE10形", base: "網干総合車両所宮原支所", ids: ["1118"],
            at: ["向日町操"],
            notes: "ディーゼル機関車。向日町操を足場に乗務員訓練の配給列車・単機回送。" }
};
/* 工臨の貨車 (機関車に連結する工事用車両)。1本を1組として持つ。 */
const WORK_CAR_FLEET = {
    chiki: { type: "チキ5500形", cars: 6, label: "ロングレール輸送", n: 3 },
    hoki:  { type: "ホキ800形",  cars: 5, label: "バラスト散布", n: 3 },
    chiki2: { type: "チキ5500形", cars: 2, label: "乗務員訓練 (配給)", n: 1 },
    kei12: { type: "12系客車",   cars: 3, label: "訓練・試運転の客車", n: 1 }
};

class WorkLocoPool {
    constructor() {
        this.all = [];
        this.locos = [];
        this.cars = [];
        for (const key in WORK_LOCO_FLEET) {
            const s = WORK_LOCO_FLEET[key];
            s.ids.forEach((n, i) => {
                const v = new Vehicle(s.type, s.type.replace("形", "") + "-" + n, 1, s.notes, s.base, "WORK");
                v.workKey = key; v.isLoco = true; v.at = s.at[i] || s.at[0];
                this.locos.push(v); this.all.push(v);
            });
        }
        for (const key in WORK_CAR_FLEET) {
            const s = WORK_CAR_FLEET[key];
            for (let i = 1; i <= s.n; i++) {
                const v = new Vehicle(s.type, s.type.replace("形", "") + "-" + i + "組", s.cars,
                                      s.label + "用の工事用貨車 " + s.cars + "両", "", "WORK");
                v.workKey = key; v.isWorkCar = true; v.at = null;   // 貨車は機関車と一緒に動く (at は置いた場所)
                this.cars.push(v); this.all.push(v);
            }
        }
    }
    /** その場所に居る、その形式の機関車を1両借りる (居なければ null) */
    takeLoco(key, at) {
        const i = this.locos.findIndex(v => v.workKey === key && v.at === at);
        return i >= 0 ? this.locos.splice(i, 1)[0] : null;
    }
    /** 工臨の貨車を1組借りる (その場所に置いてあるもの、無ければ保守基地の予備) */
    takeCars(key, at) {
        let i = this.cars.findIndex(v => v.workKey === key && v.at === at);
        if (i < 0) i = this.cars.findIndex(v => v.workKey === key && v.at === null);
        return i >= 0 ? this.cars.splice(i, 1)[0] : null;
    }
    give(veh, at) {
        if (!veh || !veh.workKey) return false;
        veh.at = at || veh.at;
        const list = veh.isLoco ? this.locos : this.cars;
        if (list.indexOf(veh) < 0) list.push(veh);
        return true;
    }
}

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
    /* 夜間作業の保守用車・確認車は、作業する線路 (内側線の作業なら内側線) を離れない (js/38e-night-work-detail.js) */
    if (train.nwWork && train.nwWork.geo && train.nwRole !== "rail") return /_In$/.test(train.nwWork.geo.tid) ? "in" : "out";

    const type = train.type;
    // 列車線を走る種別
    if (["新快速", "特急", "貨物", "回送", "臨時"].indexOf(type) >= 0) return "out";
    if (type === "普通") return "in";

    if (type === "快速") {
        /* ★朝 5:30〜8:00 に京都を出る下りの快速は、京都〜高槻を外側線で走り、次は高槻に停まる
             (利用者の指摘 4. 2026-10)。高槻から先はふだんの快速と同じ。 */
        if (kyotoEarlyRapid(train, stIdx, hour) && stIdx > STATION_MAP["高槻"]) return "out";
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

/* 朝の京都始発・京都発の快速 (京都〜高槻は外側線・ノンストップ)。京都を 5:30〜8:00 に出る下りの快速 */
const KYOTO_EARLY_RAPID = { fromH: 5.5, toH: 8.0 };
/** 朝の京都発の快速か。京都 (の手前) でいるべき線路を決めるときに1回だけ決め、列車番号ごとに覚える */
function kyotoEarlyRapid(train, stIdx, hour) {
    if (!train || train.type !== "快速" || train.dir !== -1 || globalThis.__NO_KYOTO_EARLY) return false;
    if (/Kosei|Fukuchi|Tozai|Hoppo/.test(train.trackId || "")) return false;
    if (train.kyotoEarlyNo === train.trainNo) return true;
    if (stIdx !== STATION_MAP["京都"] || train.kyotoEarlyChecked === train.trainNo) return false;
    train.kyotoEarlyChecked = train.trainNo;
    if (hour === undefined) hour = (train.game.currentTime / 3600) % 24;
    if (hour < KYOTO_EARLY_RAPID.fromH || hour >= KYOTO_EARLY_RAPID.toH) return false;
    train.kyotoEarlyNo = train.trainNo;
    return true;
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
        /* ★JR宝塚線の線内の普通 (尼崎〜宝塚・新三田) は、実物では明石の 207系・321系が主力。
             以前は 223系/225系 に限っていたので、JR東西線から宝塚線へ直通してきた 207系・321系が
             塚口・宝塚で折り返せず、新三田まで回送になっていた (塚口→新三田 の回送 22本/日)。
             快速・丹波路快速は宮原・網干の 223系/225系のまま。 */
        /* 207系・321系を充てるのは、宝塚線の中で折り返す普通 (塚口・宝塚 → 新三田 など) だけ。
           本線へ直通する普通まで広げると、JR東西線・学研都市線に要る7両編成を取ってしまい、
           夕方の東西線が薄くなった (実測: 京橋 学研都市線方面 19〜20時 8本 → 3〜4本/時)。 */
        /* 尼崎も含める: JR東西線から直通してきた 207系・321系を、運転整理で尼崎止まりにしたり
           塚口止まりの快速にしたりすることがある (実物も同じ編成で折り返す)。 */
        /* 快速には入れない (「新快速・快速に 207系・321系は使わない」という決まり。JR東西線の中は別の規則) */
        profile: (c) => (c.type === "普通" &&
                         (FUKUCHI_PLACES.indexOf(c.startName) >= 0 || c.startName === "尼崎") &&
                         (FUKUCHI_PLACES.indexOf(c.dest) >= 0 || c.dest === "尼崎"))
            ? { groups: ["MIYAHARA", "ABOSHI", "AKASHI"],   // 223系・225系を先に。207系・321系は来た編成をそのまま使うときだけ
                pred: (v) => VEH.is207(v) || VEH.is321(v) || VEH.is223(v) || VEH.is225(v),
                minCars: 6, label: "宝塚線普通" }
            : { groups: ["MIYAHARA", "ABOSHI"],
                pred: (v) => VEH.is223(v) || VEH.is225(v),
                minCars: 6, label: "宝塚線" }
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
        /* ★明石の207系・321系は JR京都線・JR神戸線 (西明石〜京都) の中だけ。
             琵琶湖線 (京都より東)・西明石より西へ行く普通には入れない。
             以前は「始発が西明石〜米原」なら明石の車両も選べたので、207系・321系が
             草津・野洲・米原まで走り、米原に20本前後が滞泊していた (実物に無い運用)。 */
        profile: (c) => {
            const kyo = STATION_MAP["京都"], nak = STATION_MAP["西明石"];
            const dIdx = (typeof fleetIndexOf === "function" && c.dest) ? fleetIndexOf(c.dest) : null;
            const inAkashiArea = globalThis.__AKASHI_FREE ? (c.startIdx !== null && c.startIdx >= nak && c.startIdx <= STATION_MAP["米原"]) : c.startIdx !== null && c.startIdx >= nak && c.startIdx <= kyo &&
                                 (dIdx === null || (dIdx >= nak && dIdx <= kyo));
            /* ★京都〜米原 (琵琶湖線) の中だけを走る普通には、京都支所の 221系・223系も入れる。
                 「京都支所の車両は JR京都線・JR神戸線の運用に入れない」という決まりはそのまま
                 (京都より西へ行く普通には入れない)。実物も琵琶湖線の普通は 221系が多い。 */
            const biwakoOnly = c.startIdx !== null && c.startIdx >= kyo && dIdx !== null && dIdx >= kyo;
            if (biwakoOnly) {
                return { groups: ["ABOSHI", "KYOTO", "MIYAHARA"],
                         pred: (v) => !VEH.isKyoto(v) || VEH.is221(v) || VEH.is223(v), minCars: 6, label: "琵琶湖線普通" };
            }
            const groups = !inAkashiArea ? ["ABOSHI", "MIYAHARA"]
                : (c.startIdx > kyo) ? ["ABOSHI", "AKASHI", "MIYAHARA"]
                : ["AKASHI", "ABOSHI", "MIYAHARA"];
            return { groups: groups, pred: (v) => !VEH.isKyoto(v), minCars: 6, label: "都市圏普通" };
        }
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
 * 明石の 207系・321系が受け持てる区間か (発駅も行先も JR東西線・学研都市線・JR宝塚線、
 * または JR京都線・JR神戸線の西明石〜京都)。琵琶湖線・西明石より西へは行かない。
 */
function akashiRangeOk(c) {
    const inArea = (name) => {
        if (!name) return true;
        if (TOZAI_PLACES.indexOf(name) >= 0 || FUKUCHI_PLACES.indexOf(name) >= 0) return true;
        const i = (typeof fleetIndexOf === "function") ? fleetIndexOf(name) : null;
        return i === null || (i >= STATION_MAP["西明石"] && i <= STATION_MAP["京都"]);
    };
    return inArea(c.startName) && inArea(c.dest);
}

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
        this.workPool = new WorkLocoPool();
    },

    /**
     * 工臨・単機回送の編成を組む。loco … "ef65" / "dd51" / "freight"(JR貨物の機関車)。
     * cars … 工臨の貨車 ("chiki" / "hoki")。単機なら null。組めなければ null。
     */
    takeWork(loco, cars, at, dest) {
        if (!this.workPool) this.init();
        if (loco === "freight") {
            const l = this.freightPool.take(at, dest);
            return l ? [l] : null;
        }
        const l = this.workPool.takeLoco(loco, at);
        if (!l) return null;
        const out = [l];
        if (cars) {
            const c = this.workPool.takeCars(cars, at);
            if (!c) { this.workPool.give(l, at); return null; }
            out.push(c);
        }
        return out;
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
    giveBack(veh, at) {
        if (!veh) return false;
        if (veh.workKey) return this.workPool ? this.workPool.give(veh, at) : false;
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
        const allWork = vehicles.every(v => !!v.workKey);          // 工臨・単機 (EF65・DD51 と工事用貨車)
        return allExpress || allFreight || allWork;
    },

    /** 表示用: 編成の所属略号つき番号を並べた文字列 */
    formationLabel(vehicles) {
        if (!vehicles || !vehicles.length) return "";
        return vehicles.map(v => v.id).join("+");
    }
};

/* ------------------------------------------------------------------ ふだんのダイヤに無い列車 (利用者の指摘 3.)

   ■ 何が起きていたか
     列車の生成・折り返し・出区計画のそれぞれが行先の表を持っていて、組み合わせによっては
       学研都市線の 快速 四条畷行き・快速 西明石行き (JR神戸線へ直通する快速)
       JR宝塚線の 快速 京都行き (大阪より東へ行く快速)
       琵琶湖線の 普通 京都行き (昼間)
     のような、実際の時刻表 (京橋・同志社前・大阪・草津・京都) に無い列車ができていた。
   ■ どうするか
     ふだんのダイヤ (輸送障害・見合わせ・段階開通の抑止が無いとき) だけ、ここで直す。
     障害のときは運転整理で実際にこうした列車ができるので、そのままにする。
       ・学研都市線・JR東西線の快速で、行先が 京橋〜四条畷 か本線 (JR神戸線など) … 普通にする
         (JR東西線の中は快速も各駅に停まり、JR神戸線へ直通するのは普通)
       ・JR宝塚線の快速で、行先が大阪より東の本線 … 大阪止まりにする (丹波路快速は大阪止まり)
       ・琵琶湖線 (京都より東) から来る普通の京都行き … 時刻表にある時間帯のほかは高槻行きにする */
const RAPID_NOT_TERMINAL_TOZAI = ["京橋", "鴫野", "放出", "徳庵", "鴻池新田", "住道", "野崎", "四条畷"];

/** いま輸送障害・見合わせ・段階開通の抑止・指令の抑止があるか (ふだんのダイヤでない) */
function serviceDisrupted(game) {
    if (!game) return false;
    if (game.isEmergency) return true;
    if (game.incidents && game.incidents.active && game.incidents.active.length) return true;
    const tm = game.trackMgr;
    if (!tm) return false;
    if (tm.manualSuspensions && tm.manualSuspensions.length) return true;
    if (tm.recoveryHolds && tm.recoveryHolds.length) return true;
    if (tm.suspendedSections) for (const k in tm.suspendedSections) {
        if (tm.suspendedSections[k] && tm.suspendedSections[k].length) return true;
    }
    return false;
}

/** 琵琶湖線の普通が京都止まりになる時間帯 (添付の草津駅の時刻表) */
function biwakoKyotoTermHour(h) {
    return (h < 6.0) || (h >= 7.9 && h < 8.6) || (h >= 17.5 && h < 18.2) || (h >= 20.6 && h < 21.0) || (h >= 23.3);
}

/**
 * ふだんのダイヤに無い組み合わせなら、直し方 ({type} か {dest}) を返す。無ければ null。
 *   startName … その列車 (折り返しなら折り返す駅) の始発駅、trackId … 出ていく線路
 */
function unrealisticService(type, startName, trackId, dest, dir, h) {
    if (!dest || !type) return null;
    const tid = trackId || "";
    const mainSt = (n) => STATION_MAP[n] !== undefined && stationBranchLine(n) === null;
    const onTozai = /^Tozai/.test(tid) || stationBranchLine(startName) === "tozai";
    const onFukuchi = /^Fukuchi/.test(tid) || stationBranchLine(startName) === "fukuchi";
    if (type === "快速") {
        if (RAPID_NOT_TERMINAL_TOZAI.indexOf(dest) >= 0 && (onTozai || onFukuchi)) return { type: "普通", why: "快速 " + dest + "行き" };
        if (onTozai && mainSt(dest)) return { type: "普通", why: "学研都市線・JR東西線の快速 " + dest + "行き" };
        if (onFukuchi && mainSt(dest) && STATION_MAP[dest] > STATION_MAP["大阪"]) return { dest: "大阪", why: "JR宝塚線の快速 " + dest + "行き" };
    }
    if (type === "普通" && dir === -1 && dest === "京都" && mainSt(startName) &&
        STATION_MAP[startName] > STATION_MAP["京都"] && !/Kosei/.test(tid) && stationBranchLine(startName) !== "kosei" &&
        h !== undefined && !biwakoKyotoTermHour(h)) {
        return { dest: "高槻", why: "琵琶湖線の普通 京都行き" };
    }
    return null;
}

/**
 * 列車の設定 (addTrain に渡すもの・serviceChange) をふだんのダイヤの形に直す。直したら true。
 * 行先を変えるときは、その編成で走れるか (canServe) を確かめ、走れなければ直さない。
 */
function normalizeServiceConfig(game, cfg, startName, trackId, vehicles) {
    if (!cfg || serviceDisrupted(game)) return false;
    if (cfg.specialEvent || cfg.special) return false;
    const h = (game.currentTime / 3600) % 24;
    const fix = unrealisticService(cfg.type, startName, trackId, cfg.dest, cfg.dir, h);
    if (!fix) return false;
    if (fix.type) {
        cfg.type = fix.type;
    } else if (fix.dest) {
        if (vehicles && vehicles.length && game.fleet &&
            !game.fleet.canServe(vehicles, startName, cfg.type, trackId, fix.dest, null)) return false;
        cfg.dest = fix.dest;
    }
    game.serviceFixes = (game.serviceFixes || 0) + 1;
    return true;
}
