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
    TICK_SEC: 15
};

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
