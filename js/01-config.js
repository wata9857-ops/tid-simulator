/* このファイルは index.html から分割されたものです。
   描画色・ブロック寸法などの基本定数と Vehicle(物理編成) クラス */
// データ定義
const CONFIG = {
    bg: "#8faadd", lineMain: "#ffffff", lineSub: "#888888", stationGrid: "rgba(255,255,255,0.4)",
    route: "#00ff00", occupy: "#ff4444", stopped: "#ffff00", waiting: "#00ffff", jammed: "#ff69b4", node: "#ffffff",
    colors: {
        "快速": {bg:"#FF883B", text:"#000"}, "新快速": {bg:"#0044FF", text:"#fff"}, "普通": {bg:"#20F80D", text:"#000"},
        "特急": {bg:"#AB83B2", text:"#fff"}, "貨物": {bg:"#A12E00", text:"#fff"}, "回送": {bg:"#000000", text:"#fff"},
        "臨時": {bg:"#000000", text:"#fff"} 
    },
    TICK_SEC: 15,

    /* シミュレーション時間の進み方の倍率。
       1.0 = これまでどおり (実時間1秒ごとに 1Tick = 15秒 進む)。
       小さくすると「1Tick進めるのに待つ実時間」が長くなるだけで、
       1Tickの中身 (TICK_SEC) は変えない。
       ★ここを変えずに TICK_SEC を小さくすると、1閉塞の所要時間・
         停車時分・抑止の秒数など、秒で書かれた全ての判定が狂う。
         倍率は「描画ループが update() を呼ぶ間隔」だけに掛ける。 */
    timeScale: 1.0
};

/* 画面から選べる時間の倍率。1.0 が既定 (これまでの速さ)。 */
const TIME_SCALES = [
    { v: 1.0,  label: "1.0倍 (標準)" },
    { v: 0.9,  label: "0.9倍" },
    { v: 0.8,  label: "0.8倍" },
    { v: 0.7,  label: "0.7倍" },
    { v: 0.6,  label: "0.6倍" },
    { v: 0.5,  label: "0.5倍 (半分)" },
    { v: 0.4,  label: "0.4倍" },
    { v: 0.3,  label: "0.3倍" },
    { v: 0.25, label: "0.25倍" },
    { v: 0.2,  label: "0.2倍" },
    { v: 0.1,  label: "0.1倍 (最も遅い)" }
];

/** 倍率を設定する。範囲外の値は無視する。 */
function setTimeScale(v) {
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return CONFIG.timeScale;
    CONFIG.timeScale = Math.min(1.0, Math.max(0.05, n));
    return CONFIG.timeScale;
}

/* 曜日の種別。快速の走行線路 (外側/内側) は平日と土休日で違うため、
   規則を実装するには「いまが平日か土休日か」を持つ必要がある。
     weekday … 平日
     holiday … 土曜・日曜・祝日
   既定は平日。 */
const DAY_TYPES = [
    { v: "weekday", label: "平日" },
    { v: "holiday", label: "土曜・日曜・祝日" }
];
CONFIG.dayType = "weekday";

/** いまが平日か */
function isWeekday() { return CONFIG.dayType !== "holiday"; }

/** 曜日の種別を設定する */
function setDayType(v) {
    CONFIG.dayType = (v === "holiday") ? "holiday" : "weekday";
    return CONFIG.dayType;
}

/* 湖西線・JR宝塚線・JR東西線の3線区あわせての在線上限。
   本線の上限とは別枠にして、本線が混んでいても分岐線の列車が
   生成され続けるようにしている。 */
const BRANCH_MAX_TRAINS = 110;

const BLOCK_WIDTH = 120;
const BLOCKS_PER_STATION_GAP = 2; 
const UNITS_PER_STATION = 1 + BLOCKS_PER_STATION_GAP;
const STOP_TIME = { LONG: 90, MEDIUM: 75, SHORT: 60, FREIGHT: 300 };

// 車両所グループごとの電報略号
const VEHICLE_CODE = {
    ABOSHI: "ホシ",     // 網干総合車両所
    AKASHI: "アカ",     // 網干総合車両所明石支所
    MIYAHARA: "ミハ",   // 網干総合車両所宮原支所
    KYOTO: "キト"       // 吹田総合車両所京都支所
};

// 物理的な編成(車両)クラス。全編成データは js/02-fleet-data.js にある。
class Vehicle {
    constructor(type, id, cars, notes, base, group) {
        this.type = type;
        this.id = id;
        this.cars = cars;
        this.notes = notes;
        this.base = base;
        // group = 車両所グループ (ABOSHI / AKASHI / MIYAHARA / KYOTO)。
        // 運用の割り当て条件はこの値で判定する。詳細は js/06-fleet.js を参照。
        this.group = group || "ABOSHI";
        // 電報略号。網干のL編成と宮原のL編成のように、車両所をまたぐと
        // 同じ編成番号が存在するため、区別が必要な場所では略号を付けて表示する。
        this.code = VEHICLE_CODE[this.group] || "";
        this.isFreight = (type === "貨物");
        this.isExpress = (type === "特急");
    }

    /** 車両所の略号を付けた編成番号 (例: ホシW1 / ミハMA01 / キトK03) */
    get fullId() {
        return this.code ? this.code + this.id : this.id;
    }
}


/** 画面に文字を出すときのHTMLエスケープ (駅名・編成番号などを埋め込む用) */
function escapeLogHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* 1閉塞 (ブロック) を走るのにかかる基本時間 [秒]。
   1駅は UNITS_PER_STATION (=3) 閉塞ぶんなので、
   1駅すすむのに「この値 × 3 ＋ 停車時分」かかる。

   ■ 実際の所要時間 (大阪〜京都 42.8km, 駅間16)
       新快速 28分 → 1駅 1.75分
       快速   33分 → 1駅 2.06分
       普通   45分 → 1駅 2.8分
     これに合わせて
       普通   48秒 × 3 ＋ 停車 ≒ 2.8分/駅
       快速   40秒 × 3        ≒ 2.0分/駅
       新快速 34秒 × 3        ≒ 1.7分/駅
     とした。

   ★以前は普通75秒・その他60秒で、1駅あたり
       普通 3.75分 / 新快速 3.0分
     という実際の1.3〜1.7倍の遅さだった。
     そのうえ続行の減速が重なって、実測では
       普通 7.0分/駅 / 新快速 5.6分/駅
     という、実際の3〜5倍の遅さになっていた。
     遅いぶん列車が線路上に長く居座るので、時刻表どおりの本数を
     出そうとすると線路が列車で埋まり、団子運転になっていた。
     (本数ではなく「速度」が混雑の主因だった) */
const BLOCK_RUN_SEC = {
    "普通":   48,
    "快速":   40,
    "新快速": 34,
    "特急":   32,
    "臨時":   44,
    "回送":   42,
    "貨物":   52
};
