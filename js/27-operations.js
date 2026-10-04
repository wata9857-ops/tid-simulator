/* 運用計画 (出入区・送り込み・運転整理) の管理。

   ■ ここが受け持つこと
     1. 出区計画      … 時間帯ごとの所要にあわせて、車両所から列車を出す
     2. 始発の裏付け  … 留置場のない駅が始発の列車に、送り込み回送を付ける
     3. 間隔の穴埋め  … 昼間に普通列車の間隔が空きすぎたときの増発
     4. 復旧の手配    … 故障した列車を回送に打ち切り、車両所へ戻す

   ■ なぜ要るか
     * 宮原・向日町には多くの編成が留置されているのに、そのほとんどが
       一度も出区しないままだった。時間帯ごとの所要を決めて計画的に出す。
     * 須磨・三ノ宮のように留置場の無い駅から列車が湧いていた。
       実際にそこが始発になる列車は、必ず手前の車両所から回送されてくる。
       送り込み回送 → 当駅で営業列車に変わる、という形にした。
     * 昼間に普通列車の間隔が4駅以上空くことがあった。
       間隔を見張って、空きすぎたときだけ手前の車両所から増発する。
*/

/* ------------------------------------------------------------------ 出区計画
   depot   … 車両所・電留線の名前 (DEPOTS のキー)
   windows … 時間帯ごとの出区計画
     h      : [開始時, 終了時]
     every  : 出区の間隔(秒)
     dir    : 進行方向
     via    : 出区してすぐ向かう駅 (送り込み回送の行先)
     as     : そこから始まる営業列車の種別
     dest   : その営業列車の行先 (配列なら重み付きで選ぶ)
     ratio  : 実行する割合 (所要が無いときは出さない)
*/
const DEPOT_DUTIES = [
    // --- 吹田総合車両所京都支所 (向日町操) : 京都始発の列車を出す
    { depot: "向日町操", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: 1, via: "京都", as: "普通", dest: ["草津", "野洲", "米原"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2400, dir: 1, via: "京都", as: "快速", dest: ["野洲", "米原"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 3000, dir: 1, via: "京都", as: "普通", dest: ["草津", "野洲"], ratio: 0.7 },
        { h: [16.0, 21.0], every: 1800, dir: 1, via: "京都", as: "普通", dest: ["草津", "野洲", "米原"], ratio: 1.0 },
        // 湖西線の普通は京都支所の担当
        { h: [5.0, 21.0], every: 2700, dir: 1, via: "京都", as: "普通", dest: ["近江今津"], ratio: 0.8, kosei: true }
    ]},
    // --- 網干総合車両所宮原支所 (宮原操) : 大阪始発の列車を出す
    { depot: "宮原操", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: 1, via: "新大阪", as: "普通", dest: ["高槻", "京都"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2700, dir: -1, via: "大阪", as: "普通", dest: ["西明石"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 3600, dir: 1, via: "新大阪", as: "普通", dest: ["高槻", "京都"], ratio: 0.6 },
        /* ★昼間のJR神戸線の普通 (大阪始発)。学研都市線・JR東西線を7両だけにしたぶん、
             JR東西線から神戸線へ直通する普通が少し減るので、大阪始発で補う。 */
        { h: [9.0, 16.0], every: 2700, dir: -1, via: "大阪", as: "普通", dest: ["西明石", "須磨"], ratio: 0.8 },
        { h: [16.0, 21.5], every: 1800, dir: 1, via: "新大阪", as: "普通", dest: ["高槻", "京都"], ratio: 1.0 },
        { h: [16.0, 21.5], every: 2400, dir: -1, via: "大阪", as: "普通", dest: ["西明石", "須磨"], ratio: 0.9 },
        /* JR宝塚線の丹波路快速・普通 (宮原の223系/225系6000番台)。
           ★昼間の枠を足した。大阪のホームでは宝塚線方向へ方向を変えられない
             ため (js/14-train-turnback.js の「大阪での方転」)、大阪止まりの
             丹波路快速は宮原へ引き上げる。そのぶんを宮原から出し直さないと、
             昼間のJR宝塚線の本数が 9本/時 → 3.7本/時 まで落ちる。
             実際の運用も、丹波路快速の編成は宮原で方向を変えて折り返す。 */
        { h: [5.0, 9.0],  every: 2400, dir: -1, via: "尼崎", as: "快速", dest: ["新三田", "篠山口"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 1800, dir: -1, via: "尼崎", as: "快速", dest: ["新三田", "篠山口"], ratio: 1.0 },
        { h: [9.0, 16.0], every: 2400, dir: -1, via: "尼崎", as: "普通", dest: ["新三田"], ratio: 0.8 },
        { h: [16.0, 21.5], every: 2400, dir: -1, via: "尼崎", as: "快速", dest: ["新三田", "篠山口"], ratio: 0.9 }
    ]},
    /* --- 京都駅 留置線・引上線 (配線略図 スクリーンショット(693).png)
           京都始発のJR京都線 下り (大阪・西明石方面) と、
           琵琶湖線 上りの一部を受け持つ。
           ★留置線を持っていなかったため、これまで京都始発の列車は
             すべて向日町操からの送り込みだった。 */
    { depot: "京都", windows: [
        { h: [4.5, 9.0],  every: 1800, dir: -1, via: "京都", as: "普通", dest: ["西明石", "高槻"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2700, dir: 1,  via: "京都", as: "普通", dest: ["草津", "野洲"], ratio: 0.8 },
        /* ★琵琶湖線の普通は京都始発が多い (JR京都線の 207系・321系は京都で折り返し、
             琵琶湖線は網干の 223系・225系が受け持つ)。昼間も京都の留置線から出す。 */
        { h: [9.0, 21.0], every: 2400, dir: 1,  via: "京都", as: "普通", dest: ["野洲", "米原", "草津"], ratio: 0.7 },
        { h: [16.0, 22.0], every: 2400, dir: -1, via: "京都", as: "普通", dest: ["西明石", "高槻"], ratio: 0.9 }
    ]},
    /* --- 尼崎駅 電留線 (配線略図 スクリーンショット(709).png)
           本線・JR宝塚線・JR東西線が集まる駅。
           神戸線の下りと、JR東西線の始発を受け持つ。 */
    { depot: "尼崎", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: -1, via: "尼崎", as: "普通", dest: ["西明石", "須磨"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2400, dir: 1,  via: "尼崎", as: "普通", dest: ["四条畷", "松井山手", "放出"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 2400, dir: -1, via: "尼崎", as: "普通", dest: ["西明石"], ratio: 0.8 },
        /* ★放出止まりを減らした (利用者の指摘)。京橋から学研都市線へ向かう普通は、
             実際の時刻表では四条畷・松井山手行きが中心で、放出止まりは少ない。 */
        { h: [9.0, 16.0], every: 2700, dir: 1,  via: "尼崎", as: "普通", dest: ["四条畷"], ratio: 0.8 },
        { h: [16.0, 22.0], every: 1800, dir: -1, via: "尼崎", as: "普通", dest: ["西明石"], ratio: 0.9 }
    ]},
    // --- 網干総合車両所明石支所 高槻派出所
    { depot: "高槻", windows: [
        { h: [4.5, 9.0],  every: 1800, dir: -1, via: "高槻", as: "普通", dest: ["西明石", "須磨"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2400, dir: 1, via: "高槻", as: "普通", dest: ["京都", "草津"], ratio: 0.9 },
        { h: [16.5, 22.0], every: 2400, dir: -1, via: "高槻", as: "普通", dest: ["西明石"], ratio: 0.8 }
    ]},
    // --- 網干総合車両所宮原支所 野洲派出所
    { depot: "野洲", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: -1, via: "野洲", as: "普通", dest: ["京都", "高槻"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2700, dir: -1, via: "野洲", as: "快速", dest: ["大阪", "姫路"], ratio: 0.8 },
        { h: [16.0, 22.0], every: 2700, dir: -1, via: "野洲", as: "普通", dest: ["京都"], ratio: 0.7 }
    ]},
    // --- 網干総合車両所明石支所 (西明石)
    { depot: "西明石", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: 1, via: "西明石", as: "普通", dest: ["高槻", "京都"], ratio: 1.0 },
        { h: [16.0, 22.0], every: 2400, dir: 1, via: "西明石", as: "普通", dest: ["高槻"], ratio: 0.8 }
    ]},
    // --- 放出電留線 (JR東西線・学研都市線)
    /* ★学研都市線 (放出〜木津) を線路図に入れたので、朝夕は放出から
         木津方 (四条畷・松井山手・京田辺・同志社前・木津) へも出区する。 */
    /* ★朝の木津方への始発 (利用者の指摘 6.)。firsts は決まった時刻に1本ずつ必ず出す始発。
         同志社前駅の時刻表 (木津方面) の 5:57・6:21・6:42・7:02 の普通 木津行きは、放出の電留線を
         出た編成が受け持つ (放出→同志社前 約40分)。以前は窓 (every) の出区だけで、同じ時間帯の
         京橋方 (dir -1) の出区と生成が放出の在庫を先に使い切り、2日目の朝は木津方へ 1〜2本しか出なかった。
         始発の時刻までは、その本数ぶんの編成を京橋方へ出さずに残しておく (firstsHoldStock)。 */
    { depot: "放出", firsts: [
        { at: 5.28, dir: 1, via: "放出", as: "普通", dest: "木津" },
        { at: 5.68, dir: 1, via: "放出", as: "普通", dest: "木津" },
        { at: 6.03, dir: 1, via: "放出", as: "普通", dest: "木津" },
        { at: 6.37, dir: 1, via: "放出", as: "普通", dest: "木津" }
      ], windows: [
        { h: [4.8, 9.0],  every: 1800, dir: 1, via: "放出", as: "普通", dest: ["四条畷", "松井山手", "京田辺", "同志社前", "木津"], ratio: 0.9 },
        { h: [16.0, 21.0], every: 2700, dir: 1, via: "放出", as: "普通", dest: ["四条畷", "松井山手", "同志社前"], ratio: 0.7 },
        { h: [4.5, 9.0],  every: 1500, dir: -1, via: "放出", as: "普通", dest: ["西明石", "尼崎"], ratio: 1.0 },
        /* ★JR東西線の快速 (学研都市線からの直通) の枠を足した。
             京橋駅の時刻表では 快速系4本/時。放出からの出区が普通だけ
             だったため、東西線の快速が 1本/時 しか走っていなかった。 */
        // 快速は JR宝塚線へ直通する (尼崎で折り返して東西線へ戻る快速を作らない)
        { h: [4.5, 9.0],  every: 2400, dir: -1, via: "放出", as: "快速", dest: ["宝塚", "新三田"], ratio: 0.9 },
        /* ★昼間の出区は、列車生成 (js/09-spawner-branch.js) が
             放出始発の快速・普通を出しているので、ここでは出さない。
             両方から出すと放出の在庫が尽きて、かえって本数が落ちる。 */
        { h: [16.0, 22.0], every: 2400, dir: -1, via: "放出", as: "普通", dest: ["尼崎", "西明石"], ratio: 0.8 },
        { h: [16.0, 22.0], every: 2700, dir: -1, via: "放出", as: "快速", dest: ["宝塚", "新三田"], ratio: 0.8 }
    ]},
    /* --- 祝園の留置線・奈良支所 (佐保) (学研都市線の南の端)
           ★以前は学研都市線の朝の上り (京橋方面) が、すべて放出から回ってくるか、
             同志社前・木津で折り返す列車だけだった。添付の同志社前駅の時刻表では
             5:45 区間快速 西明石行き・6:02 西明石行き・6:14 新三田行き … と、
             南の端で夜を明かした編成が朝いちばんに出ていく。 */
    /* ★朝・夕のラッシュに使う (利用者の指摘 1.)。以前は 5:00〜6:36 の1枠だけで、しかも入区した列車の
         空の枠が留置線2本を埋めていたので (depotHasRoom)、祝園の編成は一日じゅう置かれたままだった。
         夕方に出た編成は、夜に祝園止まり・入区で戻す (NIGHT_RETURN)。
       ★学研都市線から JR神戸線 (西明石) へ直通するのは普通。快速 西明石行きは作らない (利用者の指摘 3.)。 */
    { depot: "祝園", windows: [
        { h: [5.0, 8.3],  every: 1800, dir: -1, via: "祝園", as: "快速", dest: ["新三田", "宝塚"], ratio: 1.0 },
        { h: [5.5, 8.3],  every: 3000, dir: -1, via: "祝園", as: "普通", dest: ["西明石", "尼崎"], ratio: 0.8 },
        { h: [16.5, 19.0], every: 2700, dir: -1, via: "祝園", as: "快速", dest: ["新三田", "宝塚"], ratio: 1.0 }
    ]},
    { depot: "木津", windows: [
        { h: [4.9, 7.6],  every: 1500, dir: -1, via: "木津", as: "快速", dest: ["新三田", "篠山口", "宝塚"], ratio: 0.9 },
        { h: [5.2, 7.0],  every: 2700, dir: -1, via: "木津", as: "普通", dest: ["京橋", "松井山手", "西明石"], ratio: 0.7 },
        { h: [16.0, 20.0], every: 3600, dir: -1, via: "木津", as: "快速", dest: ["新三田", "宝塚"], ratio: 0.5 }
    ]},
    // --- 新三田電留線 (JR宝塚線の始発)
    { depot: "新三田", windows: [
        { h: [4.5, 9.0],  every: 1200, dir: 1, via: "新三田", as: "普通", dest: ["尼崎", "大阪", "松井山手"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2400, dir: 1, via: "新三田", as: "快速", dest: ["大阪"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 1500, dir: 1, via: "新三田", as: "普通", dest: ["尼崎", "四条畷", "大阪"], ratio: 0.9 },
        { h: [16.0, 22.0], every: 2100, dir: 1, via: "新三田", as: "普通", dest: ["尼崎", "大阪"], ratio: 0.9 }
    ]},
    // --- 米原派出所
    { depot: "米原", windows: [
        { h: [4.5, 9.0],  every: 2400, dir: -1, via: "米原", as: "普通", dest: ["野洲", "京都"], ratio: 0.9 },
        { h: [16.0, 22.0], every: 3000, dir: -1, via: "米原", as: "普通", dest: ["野洲"], ratio: 0.6 }
    ]},
    // --- 網干総合車両所 (姫路より西・JR神戸線の始発)
    { depot: "網干", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: 1,  via: "網干", as: "普通", dest: ["姫路", "加古川", "西明石"], ratio: 1.0 },
        { h: [4.8, 9.0],  every: 2400, dir: -1, via: "網干", as: "普通", dest: ["上郡", "播州赤穂"], ratio: 0.9 },
        { h: [16.0, 21.5], every: 2700, dir: 1, via: "網干", as: "普通", dest: ["姫路", "西明石"], ratio: 0.7 }
    ]},
    // --- 姫路電留線
    { depot: "姫路", windows: [
        { h: [4.5, 9.0],  every: 1800, dir: 1, via: "姫路", as: "普通", dest: ["西明石", "大阪"], ratio: 1.0 },
        { h: [16.0, 22.0], every: 3000, dir: 1, via: "姫路", as: "普通", dest: ["西明石"], ratio: 0.7 }
    ]}
];

/* ------------------------------------------------------------------ 夜の入区
   翌朝その留置場から出る始発のために、夜のうちに戻しておく本数 (7両の編成の数)。
   (OperationsManager.checkNightReturn)
     need  … 21時〜終電のあいだに、在庫と入区に向かう列車の合計をこの数まで戻す
     every … 行先を変える間隔 (秒)
     dirs  … 行先を変える列車の向き (その留置場に入れる向き)
   放出 … 朝 4:30〜9:00 に放出から出る列車 (DEPOT_DUTIES の放出) と、列車生成の放出始発のぶん。
   祝園 … 留置線2本ぶん。 */
const NIGHT_RETURN = [
    { depot: "放出", need: 18, every: 150, dirs: [1, -1], types: ["普通"] },
    { depot: "祝園", need: 2,  every: 600, dirs: [1, -1], types: ["普通", "快速"] }
];

/* ------------------------------------------------------------------ 始発の裏付け
   留置場の無い駅を始発にする列車に、送り込み回送を付ける。
     from  : 送り込み元の車両所
     ratio : 送り込みにする割合 (残りは既存の折り返しに任せる)
   ここに無い駅 (大阪・京都・尼崎など) は、到着列車の折り返しで
   始発が成り立つのでそのままにする。 */
const ORIGIN_BACKING = {
    "須磨":     { from: "西明石", ratio: 1.0 },
    "神戸":     { from: "西明石", ratio: 1.0 },
    "三ノ宮":   { from: "西明石", ratio: 1.0 },
    "甲子園口": { from: "宮原操", ratio: 1.0 },
    "塚本":     { from: "宮原操", ratio: 1.0 },
    "大阪":     { from: "宮原操", ratio: 0.35 },
    "尼崎":     { from: "宮原操", ratio: 0.25 },
    "京都":     { from: "向日町操", ratio: 0.30 }
};

/**
 * その出区計画が本線のものか、分岐線 (湖西・JR宝塚・JR東西) のものかを返す。
 * 在線本数の目安 (js/10-timetable.js の TT_ACTIVE_BUDGET) は線区ごとに
 * 分かれているので、出区を抑えるときも同じ区分けで見る。
 */
function dutyLineOf(depotName, w) {
    if (w && w.kosei) return "kosei";
    if (depotName === "新三田") return "fukuchi";
    if (depotName === "放出") return "tozai";
    if (typeof DEPOTS !== "undefined" && DEPOTS[depotName] && DEPOTS[depotName].line === "Tozai") return "tozai";
    const dests = Array.isArray(w && w.dest) ? w.dest : [(w && w.dest) || ""];
    if (dests.every(d => TOZAI_THROUGH_DESTS.indexOf(d) >= 0)) return "tozai";
    if (dests.every(d => FUKUCHI_THROUGH_DESTS.indexOf(d) >= 0)) return "fukuchi";
    return "main";
}

class OperationsManager {
    constructor(game) {
        this.game = game;
        this.dutyNext = {};      // 出区計画の次回時刻
        this.gapNext = 0;        // 間隔の穴埋めの次回判定時刻
        this.deadheadSeq = 1000;
        this.stats = { depotOut: 0, backing: 0, gapFill: 0, recovery: 0 };
    }

    /** 回送列車番号を作る */
    deadheadNo(suffix, dir) {
        /* 向き (dir) が分かるときは、下り = 奇数・上り = 偶数で、走っている列車と重ならない番号にする
           (js/38d-train-numbers.js。利用者の指摘 ④ 2026-10) */
        if (dir && this.game.spawner && this.game.spawner.allocTrainNo) {
            return this.game.spawner.allocTrainNo("回", 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], suffix || "M", dir === -1 ? 1 : 0);
        }
        this.deadheadSeq += 2;
        if (this.deadheadSeq > 9990) this.deadheadSeq = 1000;
        return "回" + this.deadheadSeq + (suffix || "M");
    }

    /**
     * 回送を、同じ区間を走る営業列車 (普通) にできるならそうする。
     *
     * ■ 利用者の指摘 3.
     *   長い回送が多すぎる (6〜翌3時で 10駅以上の回送が 120本前後)。車両の送り込み・返却は
     *   必要でも、昼間に旅客の乗れない列車を長い距離走らせることはふつうしない。
     *   実際の運用では、送り込みを兼ねた営業列車 (普通) にする。
     * ■ 営業列車にする条件
     *   ・営業の時間の中 (5時〜その線区の終電の30分前)
     *   ・発駅と行先がどちらも旅客駅 (車両所・貨物駅を発着する回送はそのまま)
     *   ・4駅以上走る (短い入換・引き上げはそのまま)
     *   ・その編成でその区間の普通に入れる (js/24-service-rules.js。入れなければ回送のまま)
     *   ・普通の在線が目安を大きく超えていない
     * cfg (addTrain に渡す設定) を書き換えたら true。
     */
    asRevenue(cfg) {
        if (!cfg || cfg.type !== "回送" || !cfg.vehicles || !cfg.vehicles.length) return false;
        if (globalThis.__NO_REVENUE_DH) return false;
        const g = this.game;
        const h = (g.currentTime / 3600) % 24;
        const from = cfg.startName, to = cfg.dest;
        const line = (stationBranchLine(from) === "tozai" || stationBranchLine(to) === "tozai") ? "tozai"
                   : (stationBranchLine(from) === "fukuchi" || stationBranchLine(to) === "fukuchi") ? "fukuchi" : "main";
        if (h < 5.0 || !ttInService(line, h + 0.5)) return false;
        const passenger = (n) => STATION_MAP[n] !== undefined && !/操|貨|タ$/.test(n) &&
                                 !(STATIONS[STATION_MAP[n]] && STATIONS[STATION_MAP[n]].name === n && STATIONS[STATION_MAP[n]].isSeparateLine);
        if (!passenger(from) || !passenger(to)) return false;
        const a = fleetIndexOf(from), b = fleetIndexOf(to);
        if (a === null || b === null || Math.abs(a - b) < 4) return false;
        if (cfg.vehicles.some(v => v.expressKey || v.freightKey || v.workKey)) return false;
        const trackId = DEPOTS[from] ? depotTrackId(from, cfg.dir, "普通") : specialEventTrackId(from, cfg.dir, "普通");
        const lineOfTrack = /^Tozai/.test(trackId) ? "tozai" : /^Fukuchi/.test(trackId) ? "fukuchi" : /^Kosei/.test(trackId) ? "kosei" : "main";
        if (ttOverBudget(g, lineOfTrack, "普通", 1.25)) return false;
        /* 前方 (これから走る区間) に普通が続いているときは回送のまま (回送は列車線を速く走り、
           普通の間に割り込まない)。普通の間隔が空いている所だけを、送り込みを兼ねた普通で埋める。
           ★すべて普通にすると、西明石〜姫路で普通が団子になった (実測)。 */
        {
            const blks = g.trackMgr.blocks[trackId];
            const b0 = blks ? blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === from) : null;
            if (b0 && countSameTypeAhead(g, trackId, b0.index, cfg.dir, "普通", 2, null) > 0) return false;
        }
        if (!g.fleet.canServe(cfg.vehicles, from, "普通", trackId, to, null)) return false;
        cfg.type = "普通";
        cfg.trackId = trackId;
        cfg.name = g.spawner.generateTrainNumber("普通", cfg.dir, from, trackId, cfg.dest);
        if (!cfg.dutyName || /^回/.test(cfg.dutyName)) cfg.dutyName = cfg.name;
        cfg.revenueDeadhead = true;
        this.stats.revenueDh = (this.stats.revenueDh || 0) + 1;
        return true;
    }

    /** 重み付けのない候補から1つ選ぶ */
    pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    update(ct) {
        if (this.game.isEmergency) return;
        this.checkDepotDuties(ct);
        this.checkLocalGapFill(ct);
        this.checkStockBalance(ct);
        this.checkNightReturn(ct);
        this.checkStationStabling(ct);   // 駅の夜間留置 (四条畷・須磨・堅田・宝塚など)
        this.checkShortTurns(ct);        // 見合わせ区間・長い抑止の手前での折り返し
        this.planOvertakes(ct);          // 待避・先行の先読み
    }

    /* ------------------------------------------------------------ 夜の入区 (翌朝の始発の手配)

       ■ 利用者の指摘 2.
         放出行きがほとんど無くなったのはよいが、終電の近くにも放出行きが無いので、
         放出の電留線の編成が起動したとき (夜明け前) の数まで戻らず、翌朝の始発が遅れていた
         (実測: 起動時 26本 → 7時に 0本 → 翌3時も 1本)。祝園の留置線も同じ。
       ■ どうするか
         21時から終電までのあいだ、翌朝その留置場から出る本数 (NIGHT_RETURN の need) に
         足りないぶんだけ、その駅を通って先へ行く営業列車の行先をその駅に変え、入区させる。
         ・行先を変えるのは、その駅まで1駅以上あり、その駅より先が行先の列車だけ
         ・4分に1本まで (先の駅へ行く列車を一度に削らない)
         ・入区のために向かっている列車も「戻ってくる数」に数える */
    nightReturnStock(name) {
        const f = this.game.fleet;
        return (name === "放出" && f.sevenCarSets) ? f.sevenCarSets(name)
             : Math.floor(f.poolAt(name).reduce((s, v) => s + (v.cars || 0), 0) / 7);
    }
    checkNightReturn(ct) {
        const g = this.game;
        const h = (ct / 3600) % 24;
        const a = ttAbsHour(h);
        if (a < 21.0 || a >= 24.4) return;
        if (ct < (this.nightReturnNext || 0)) return;
        this.nightReturnNext = ct + 60;
        for (const nr of NIGHT_RETURN) {
            if (!DEPOTS[nr.depot]) continue;
            const inbound = g.trains.filter(t => t.state !== "finished" && t.state !== "in_depot" &&
                t.dest === nr.depot && (t.nextAction === "depot" || t.nightReturn)).length;
            const have = this.nightReturnStock(nr.depot) + inbound;
            if (have >= nr.need) continue;
            const key = "nr#" + nr.depot;
            if (ct < (this[key] || 0)) continue;
            const cand = this.pickNightReturnTrain(nr);
            if (!cand) continue;
            const oldDest = cand.dest;
            cand.dest = nr.depot;
            cand.nextAction = "depot";
            cand.nightReturn = true;
            cand.isFinalStop = false;
            this[key] = ct + nr.every;
            this.stats.nightReturn = (this.stats.nightReturn || 0) + 1;
            g.ui.updateBanner(`【入区手配】翌朝の始発に備え、${cand.trainNo} の行先を ${oldDest} から ` +
                              `${nr.depot} に変更し、${nr.depot}${nr.depot === "放出" ? "電留線" : "留置線"}へ入れます。`, "banner-blue");
        }
    }
    pickNightReturnTrain(nr) {
        const g = this.game;
        let best = null, bestD = Infinity;
        for (const t of g.trains) {
            if (t.state === "finished" || t.state === "in_depot" || t.state === "turning_back") continue;
            if (nr.dirs.indexOf(t.dir) < 0 || !stablingLineTrack(nr.line || "Tozai", t.trackId)) continue;
            if (nr.types.indexOf(t.type) < 0 || t.specialEvent || t.nightReturn) continue;
            if (!t.vehicles || !t.vehicles.length || t.dest === nr.depot) continue;
            if (t.nextAction === "remove" || t.nextAction === "in_depot_remove") continue;
            const blks = g.trackMgr.blocks[t.trackId];
            if (!blks) continue;
            const db = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === nr.depot);
            if (!db) continue;
            const d = (db.index - t.currBlockIndex) * t.dir;
            if (d < UNITS_PER_STATION || d > UNITS_PER_STATION * 8) continue;
            const destB = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === t.dest);
            // 行先がこの駅より先 (線路図の外を含む) の列車だけ
            if (destB && (destB.index - db.index) * t.dir <= 0) continue;
            if (!g.fleet.canServe(t.vehicles, nr.depot, t.type, t.trackId, nr.depot, t.dutyName)) continue;
            if (d < bestD) { bestD = d; best = t; }
        }
        return best;
    }

    /* ------------------------------------------------------------ 返却回送

       ■ なぜ必要か
         線区の列車は片道で流れる。JR東西線・学研都市線の207系・321系は
         放出の電留線から出て、尼崎・西明石・宝塚まで直通し、そこで運用を
         終える。返却先はその駅の留置線なので、放出の在庫は減るだけになる。
         実測では昼過ぎに放出の在庫が0本になり、東西線の快速が
         4本/時 → 1本/時 まで落ちた。

         編成を離れた留置場から「借り出す」のをやめた (瞬間移動をしない)
         ので、在庫の偏りはそのまま列車の本数に出る。

       ■ どうするか
         実際の運用と同じく、返却回送を走らせる。
         在庫が尽きかけている留置場を見つけ、その編成を受け入れられる
         いちばん近い留置場から回送を1本出す。
         編成は線路の上を走って移るので、行路もつながったままになる。
    */
    checkStockBalance(ct) {
        if (ct < (this.stockNext || 0)) return;
        this.stockNext = ct + 600;                    // 10分おきに見る
        const h = (ct / 3600) % 24;
        if (h < 4.5 || h >= 22.0) return;

        const fleet = this.game.fleet;
        // 在庫の少ない留置場 (少ない順)
        /* ★放出 (学研都市線・JR東西線) は、編成の数ではなく「7両が何本組めるか」で見る。
           3両ばかり残っていても7両は組めず、始発が出せない。 */
        /* ★祝園・木津 (学研都市線の南の端) は返却回送の送り先にしない (利用者の指摘 ③)。
             祝園は留置線が2本しかないので在庫はいつも「2本以下」に見え、用も無いのに
             放出から祝園へ回送が出続けていた。南の端の在庫は夜の入区 (NIGHT_RETURN) で戻す。 */
        const short = FLEET_BASES
            .filter(b => fleet.pools[b.name] && DEPOTS[b.name] && b.name !== "祝園" && b.name !== "木津")
            .map(b => ({ name: b.name, groups: b.groups,
                         n: (b.name === "放出") ? fleet.sevenCarSets(b.name) : fleet.pools[b.name].length }))
            .filter(b => b.n <= 2)
            .sort((a, b) => a.n - b.n);
        /* ★車両所グループごとの不足も見る。京都の留置線は、編成の数は多くても
             明石の 207系・321系ばかりになり、琵琶湖線の普通に要る網干の 223系・225系が
             0本になっていた (223系・225系は野洲・米原へ出たまま戻らない)。
             その留置場が受け入れるグループのうち網干・宮原の編成が1本以下なら、足りないものとして扱う。 */
        /* 京都だけで見る (琵琶湖線の普通を京都で受け持つため)。ほかの滞泊地まで見ると、
           野洲・姫路へ長い回送が増えた (実測 西明石→野洲 11本/日)。 */
        FLEET_BASES.filter(b => b.name === "京都").forEach(b => {
            if (!fleet.pools[b.name] || !DEPOTS[b.name] || short.some(x => x.name === b.name)) return;
            ["ABOSHI"].forEach(g => {
                if (b.groups.indexOf(g) < 0) return;
                const n = fleet.pools[b.name].filter(v => v.group === g).length;
                if (n <= 1 && fleet.pools[b.name].length >= 3) short.push({ name: b.name, groups: [g], n: n, byGroup: g });
            });
        });
        if (!short.length) return;

        for (const to of short) {
            const dep = DEPOTS[to.name];
            if (!dep || !depotHasRoom(to.name)) continue;
            // その編成を受け入れられる、いちばん近い「余っている」留置場
            const toIdx = fleetIndexOf(to.name);
            const from = FLEET_BASES
                .filter(b => fleet.pools[b.name] && fleet.pools[b.name].length >= 5 && b.name !== "祝園")
                .filter(b => !to.byGroup || fleet.pools[b.name].filter(v => v.group === to.byGroup).length >= 4)
                .filter(b => b.groups.some(g => to.groups.indexOf(g) >= 0))
                .filter(b => fleetIndexOf(b.name) !== toIdx)
                .sort((a, b) => Math.abs(fleetIndexOf(a.name) - toIdx) -
                                Math.abs(fleetIndexOf(b.name) - toIdx))[0];
            if (!from) continue;

            /* 送る編成は、送り先の線区で使えるものを選ぶ。
               放出なら 207系/321系 (JR東西線の規則) になる。 */
            const dir = this.dirFromTo(from.name, to.name);
            if (!dir) continue;                       // 方向転換なしには行けない
            const no = this.deadheadNo("M", dir);
            let vs = fleet.assign(from.name, to.byGroup ? "普通" : "回送",
                                  depotTrackId(from.name, dir, to.byGroup ? "普通" : "回送"),
                                  to.name, no, { noBorrow: true });
            if (!vs || !vs.length) continue;
            // グループの不足を埋めるときは、そのグループの編成だけを送る
            if (to.byGroup && vs.some(v => v.group !== to.byGroup)) { fleet.release(from.name, vs); continue; }
            /* 送り先の線区の運用に入れない編成を送っても意味がないので確かめる。
               (東西線に223系を送っても使えない) */
            if (!fleet.canServe(vs, to.name, "普通",
                                depotTrackId(to.name, 1, "普通"), to.name)) {
                fleet.release(from.name, vs);
                continue;
            }
            const rcfg = {
                type: "回送", dir: dir,
                trackId: depotTrackId(from.name, dir, "回送"),
                dest: to.name, startName: from.name,
                name: no, dutyName: no, vehicles: vs, nextAction: "depot"
            };
            this.asRevenue(rcfg);          // 返却を兼ねた営業列車にできるなら、そうする
            const ok = this.game.addTrain(rcfg);
            if (!ok) { fleet.release(from.name, vs); continue; }
            this.stats.rebalance = (this.stats.rebalance || 0) + 1;
            this.game.ui.updateBanner(
                `【返却回送】${to.name}の車両が不足したため、${from.name}から ` +
                `${no}(回送) を出します。`, "banner-blue");
            return;                                   // 1回に1本だけ
        }
    }

    // ============================================================= 出区計画
    /**
     * 時間帯ごとの所要にあわせて車両所から列車を出す。
     *
     * 出し方は実際の運用と同じで、まず車両所から始発駅まで回送し、
     * 始発駅で営業列車に変わる (serviceChange)。
     * こうすることで「駅にいきなり列車が現れる」ことがなくなる。
     */
    /** 営業日の番号 (4:30 で日が変わる) */
    serviceDay(ct) { return Math.floor((ct - TT_SERVICE_START * 3600) / 86400); }

    /** その始発 (firsts の i 本目) を今日もう出したか */
    firstDone(depotName, i, ct) {
        return (this.firstsDoneDay || {})[depotName + "#f" + i] === this.serviceDay(ct);
    }

    /**
     * 決まった時刻の始発 (DEPOT_DUTIES の firsts) のために、その向き以外への出区・生成を控えるか。
     * まだ出していない始発 (発車の2時間前〜15分後) の本数ぶんは、編成を残しておく。
     */
    firstsHoldStock(depotName, dir) {
        const duty = DEPOT_DUTIES.find(d => d.depot === depotName && d.firsts);
        if (!duty) return false;
        const ct = this.game.currentTime;
        const h = (ct / 3600) % 24;
        let pend = 0;
        duty.firsts.forEach((f, i) => {
            if (f.dir !== dir && h >= f.at - 2.0 && h < f.at + 0.25 && !this.firstDone(depotName, i, ct)) pend++;
        });
        if (!pend) return false;
        const f = this.game.fleet;
        const stock = (depotName === "放出" && f.sevenCarSets) ? f.sevenCarSets(depotName) : f.poolAt(depotName).length;
        return stock <= pend;
    }

    /** 決まった時刻の始発を出す。出せなければ15分まで1分ごとにやり直す */
    checkDepotFirsts(ct, duty) {
        const h = (ct / 3600) % 24;
        this.firstsDoneDay = this.firstsDoneDay || {};
        duty.firsts.forEach((f, i) => {
            if (h < f.at || h >= f.at + 0.25 || this.firstDone(duty.depot, i, ct)) return;
            const key = duty.depot + "#f" + i;
            if (ct < ((this.firstsRetry || {})[key] || 0)) return;
            this.firstsRetry = this.firstsRetry || {};
            this.firstsRetry[key] = ct + 60;
            if (!depotHasRoom(duty.depot)) return;
            if (this.dispatchFromDepot(duty.depot, f)) this.firstsDoneDay[key] = this.serviceDay(ct);
        });
    }

    checkDepotDuties(ct) {
        const h = (ct / 3600) % 24;
        for (const duty of DEPOT_DUTIES) {
            const depot = DEPOTS[duty.depot];
            if (!depot) continue;
            if (duty.firsts) this.checkDepotFirsts(ct, duty);
            for (let wi = 0; wi < duty.windows.length; wi++) {
                const w = duty.windows[wi];
                const key = duty.depot + "#" + wi;
                if (h < w.h[0] || h >= w.h[1]) { continue; }
                if (this.dutyNext[key] === undefined) {
                    this.dutyNext[key] = ct + Math.random() * w.every;
                    continue;
                }
                if (ct < this.dutyNext[key]) continue;
                this.dutyNext[key] = ct + w.every * (0.85 + Math.random() * 0.3);
                if (Math.random() > w.ratio) continue;
                /* ★その種別が走りすぎているときは出区させない。
                   ここを見ていなかったため、出区計画だけで朝の2時間に
                   普通が約100本も本線に出ていた。生成側 (trySpawn) は
                   在線本数の目安を見て止まっているのに、こちらが素通しに
                   なっていたので、目安がまったく効いていなかった。 */
                if (ttOverBudget(this.game, dutyLineOf(duty.depot, w), w.as)) continue;
                // 留置場に空きが無い(出区待ちが詰まっている)ときは見送る
                if (!depotHasRoom(duty.depot)) continue;
                // 在庫が無いときも見送る
                if (this.game.fleet.poolAt(duty.depot).length < 2) continue;
                // 決まった時刻の始発 (firsts) のぶんの編成は残す
                if (this.firstsHoldStock(duty.depot, w.dir)) continue;
                this.dispatchFromDepot(duty.depot, w);
            }
        }
    }

    /** 1本、車両所から出す */
    dispatchFromDepot(depotName, w) {
        const dest = Array.isArray(w.dest) ? this.pick(w.dest) : w.dest;
        const via = w.via || depotName;
        const serviceNo = this.game.spawner.generateTrainNumber(
            w.as, w.dir, via, w.dir === 1 ? "Up_In" : "Down_In", dest);

        /* ★車両は「出区してすぐ入る営業運用」の条件で選ぶ。
           回送の条件で選ぶと、例えば向日町操から京都へ送り込む回送に
           京都支所の221系が付いてしまい、京都で本線の普通に変わるときに
           わざわざ差し替えることになっていた。 */
        const serviceTrack = (w.dir === 1 ? "Up_In" : "Down_In");
        /* 送り込みの向きが組めない (方向転換が要る) 計画は出さない。
           ★車両を割り当てる前に確かめる。後で気づくと編成が宙に浮く。 */
        const sameSpot0 = (via === depotName) ||
            (fleetIndexOf(via) !== null && fleetIndexOf(via) === fleetIndexOf(depotName));
        if (!sameSpot0 && !this.dirFromTo(depotName, via)) return false;

        const vs = this.game.fleet.assign(depotName, w.as, serviceTrack, dest, serviceNo,
                                          { noBorrow: true });
        if (!vs || !vs.length) return false;

        /* 車両所と始発駅が「同じ場所」なら、送り込み回送は要らない。
           ★名前ではなく位置で比べる。宮原操と新大阪のように、
           名前は違うが線路図では同じ位置にある組み合わせがある。
           ここを名前で比べていたため、「宮原操から新大阪への回送」が
           すでに新大阪にいる状態で作られ、到着できないまま
           行先を追い越して走り続けていた。 */
        const sameSpot = (via === depotName) ||
            (fleetIndexOf(via) !== null && fleetIndexOf(via) === fleetIndexOf(depotName));
        let cfg;
        if (sameSpot) {
            cfg = { type: w.as, dir: w.dir, trackId: depotTrackId(depotName, w.dir, w.as),
                    dest: dest, startName: depotName, name: serviceNo, nextAction: "turnback" };
        } else {
            const ddir = this.dirFromTo(depotName, via);
            cfg = { type: "回送", dir: ddir, trackId: depotTrackId(depotName, ddir, "回送"),
                    dest: via, startName: depotName, name: this.deadheadNo("M", ddir),
                    dutyName: serviceNo,
                    serviceChange: { at: via, type: w.as, dest: dest, name: serviceNo } };
        }

        cfg.vehicles = vs;
        this.asRevenue(cfg);               // 送り込みを兼ねた営業列車にできるなら、そうする
        if (this.game.addTrain(cfg)) {
            this.stats.depotOut++;
            return true;
        }
        // 生成できなかったら車両を留置場へ戻す
        this.game.fleet.release(depotName, vs);
        return false;
    }

    /**
     * a から b へ向かう向き。行けないときは 0。
     *
     * ★以前は駅インデックスを比べるだけで、同じ場所 (放出 → 放出) のときも
     *   「上り (1)」を返していた。本線と分岐線はインデックスを共有しているので、
     *   線区をまたぐと向きも取り違える (js/06-fleet.js の routeDirection)。
     *   その結果、JR東西線の上りの穴埋めが「放出の電留線から放出行きの上り」
     *   として組まれ、出区した列車が放出を通り越して四条畷方の
     *   行き止まりへ進み、そこで動けなくなっていた。
     */
    dirFromTo(a, b) {
        return routeDirection(a, b);
    }

    // ============================================================= 始発の裏付け
    /**
     * 留置場の無い駅から始発する列車を、車両所からの送り込み回送に置き換える。
     * 置き換えたときは true を返す (呼び出し側は元の生成を行わない)。
     */
    backOrigin(config) {
        if (config.type === "貨物" || config.type === "特急" || config.type === "回送") return false;
        if (config.serviceChange) return false;           // 二重に付けない
        if (DEPOTS[config.startName]) return false;       // その駅に留置場があるなら不要

        const back = ORIGIN_BACKING[config.startName];
        let fromName = back ? back.from : null;
        if (back && Math.random() > back.ratio) return false;

        /* ★表に無い駅も、留置場が無ければ送り込みが要る。

           以前は ORIGIN_BACKING に書いた駅だけを見ていたため、
           加古川・大久保のように留置場の無い駅が始発の列車は、
           西明石の電留線にある編成をそのまま使っていた。
           編成は線路を走らずに加古川へ現れるので、行路の記録では
             739M 京都 → 須磨      (須磨で運用を終える)
             1048M 加古川 → 野洲   (なぜか加古川から始まる)
           のように、終着駅と次の始発駅が食い違っていた。
           その駅の車両を受け持つ留置場 (fleetHomeOf) から回送を出す。 */
        if (!fromName) {
            const h = fleetHomeOf(config.startName);
            if (!h || h === config.startName) return false;
            if (!DEPOTS[h]) return false;
            if (fleetIndexOf(h) === fleetIndexOf(config.startName)) return false;
            fromName = h;
        }

        const depot = DEPOTS[fromName];
        if (!depot || !depotHasRoom(fromName)) return false;
        if (this.game.fleet.poolAt(fromName).length < 2) return false;

        const dir = this.dirFromTo(fromName, config.startName);
        if (!dir) return false;                            // 方向転換なしには送り込めない
        const serviceNo = config.name ||
            this.game.spawner.generateTrainNumber(config.type, config.dir, config.startName, config.trackId, config.dest);

        /* ★車両は「送り込んだ先で入る営業運用」の条件で選ぶ。

           以前は車両を指定せずに addTrain へ渡していたので、回送の条件
           (どの車両所でもよい・1両以上) で選ばれていた。その結果、
           たとえば 西明石 → 加古川 の送り込みに明石の207系3両が付き、
           加古川で「快速」に変わるところで条件を満たさず運休になっていた。
           運休すると編成はその駅で消え、留置場へ「戻される」ので、
           行路の記録では加古川から西明石への瞬間移動として現れる。 */
        const serviceTrack = config.trackId || (config.dir === 1 ? "Up_In" : "Down_In");
        const vs = this.game.fleet.assign(fromName, config.type, serviceTrack,
                                          config.dest, serviceNo, { noBorrow: true });
        if (!vs || !vs.length) return false;

        const bcfg = {
            type: "回送", dir: dir,
            trackId: depotTrackId(fromName, dir, "回送"),
            dest: config.startName, startName: fromName,
            name: this.deadheadNo("M", dir), dutyName: serviceNo,
            vehicles: vs,
            serviceChange: { at: config.startName, type: config.type,
                             dest: config.dest, name: serviceNo }
        };
        this.asRevenue(bcfg);
        const ok = this.game.addTrain(bcfg);
        if (!ok) { this.game.fleet.release(fromName, vs); return false; }
        this.stats.backing++;
        return ok;
    }

    /**
     * 始発駅に条件を満たす編成が無いときの送り込み回送。
     *
     * ★編成を離れた留置場から「借り出す」と、その編成が線路を走らずに
     *   始発駅へ現れる (瞬間移動)。行路の記録で見ると
     *     374M 京都→野洲 のあと 470M 京都→野洲
     *   のように、終着駅と次の始発駅が食い違う。
     *   実際の運用では、車両が足りない駅へは必ず回送で送り込む。
     *
     * ここでは、その運用の条件を満たす編成を持っている
     * いちばん近い車両所から回送を1本出し、始発駅で営業列車に変える
     * (serviceChange)。手配できたら true。
     */
    railInStock(config, early) {
        if (!config || config.vehicles) return false;
        if (config.type === "貨物" || config.type === "特急") return false;
        if (config.serviceChange) return false;          // 二重に付けない
        const startName = config.startName;
        if (!startName) return false;

        const fleet = this.game.fleet;
        const prof = fleet.profileFor(startName, config.type, config.trackId,
                                      config.dest, config.name);
        if (prof.express || prof.freight) return false;  // 専用編成は在庫制で扱う

        const home = fleetHomeOf(startName);
        const from = fleet.findSupplier(home, prof);
        if (!from) return false;

        /* ★留置場 (出区待ちの枠) が無い駅でも送り込みは出せる。
           尼崎・大阪・宝塚・京橋・敦賀・近江今津は、編成の滞泊地
           (FLEET_BASES) ではあるが DEPOTS の枠を持たない。
           ここで枠を要求していたため、そこにある編成がどこにも使えず、
           列車が生成できずに間隔が開いていた。
           枠が無い駅から出す場合は、本線の着発線へ直接出す
           (Train.initPosition が受け持つ)。 */
        const depot = DEPOTS[from];
        if (depot && !depotHasRoom(from)) return false;

        const dir = this.dirFromTo(from, startName);
        if (!dir) return false;                           // 方向転換なしには送り込めない

        const serviceNo = config.name || this.game.spawner.generateTrainNumber(
            config.type, config.dir, startName, config.trackId, config.dest);
        const vs = fleet.assign(from, config.type, config.trackId, config.dest,
                                serviceNo, { noBorrow: true });
        if (!vs || !vs.length) return false;

        const scfg = {
            type: "回送", dir: dir,
            trackId: depotTrackId(from, dir, "回送"),
            dest: startName, startName: from,
            name: this.deadheadNo("M", dir), dutyName: serviceNo,
            vehicles: vs,
            serviceChange: { at: startName, type: config.type,
                             dest: config.dest, name: serviceNo,
                             skTarget: config.skTarget, skOrigin: config.skOrigin, skBorn: config.skBorn }
        };
        this.asRevenue(scfg);
        const ok = this.game.addTrain(scfg);
        if (!ok) { fleet.release(from, vs); return false; }
        this.stats.railIn = (this.stats.railIn || 0) + 1;
        return true;
    }

    // ============================================================= 間隔の穴埋め
    /**
     * 昼間に普通列車の間隔が空きすぎていないか見張る。
     *
     * 内側線を駅単位で見て、同じ向きの普通列車が4駅以上いない区間があれば、
     * その手前にある車両所から1本増発する。
     * (北陸本線など、もともと本数の少ない区間は対象にしない)
     */
    checkLocalGapFill(ct) {
        const h = (ct / 3600) % 24;
        if (h < 9.5 || h >= 21.0) return;         // 昼間〜夕方のみ
        if (ct < this.gapNext) return;
        this.gapNext = ct + 180;                  // 3分おきに点検

        /* これ以上空いたら増発。
           ★実際の時刻表では、内側線 (電車線) は普通8本/時＋快速4本/時 で
             約5分間隔、駅間約2分なので、同じ向きの列車は2〜3駅おきになる。
             3駅を超えたら増発する、という目安は実物と合っている。
             ただし種別の在線本数が目安を超えているときは増発しない
             (増発で普通が増え続けると内側線が埋まってしまう)。 */
        const MAX_GAP_STATIONS = 3.0;
        /* 点検する区間と、増発に使う車両所。
           depots は「その方向の後ろ側にある車両所」を近い順に並べる。
           type/dest はそこから出す列車の種別と行先。 */
        const scan = [
            { trackId: "Up_In",   dir: 1,  from: "西明石", to: "京都",
              depots: ["西明石", "宮原操", "高槻"], dest: "京都" },
            { trackId: "Down_In", dir: -1, from: "京都",   to: "西明石",
              depots: ["高槻", "宮原操", "西明石"], dest: "西明石" },
            // JR宝塚線 (尼崎〜新三田)
            { trackId: "Fukuchi_Down", dir: -1, from: "尼崎", to: "新三田",
              depots: ["宮原操"], dest: "新三田" },
            { trackId: "Fukuchi_Up",   dir: 1,  from: "新三田", to: "尼崎",
              depots: ["新三田"], dest: "尼崎" },
            /* JR東西線 (尼崎〜放出)。
               ★尼崎にも電留線があるので、上り (放出方) の穴埋めもできる。
                 下り (尼崎方) だけを見ていたため、東西線の間隔が
                 5.4駅まで開いても増発できなかった。
               ★上り (放出方) の増発は、上りの「後ろ側」にある尼崎から出す。
                 以前はここも放出の電留線から出していた。放出の電留線は
                 放出駅の四条畷方 (徳庵との間) にあるので、そこから
                 「放出行きの上り」を出すと、出区した列車は放出を過ぎて
                 四条畷方の行き止まりへ進むしかなく、そこで動けなくなって
                 後続の東西線を止めていた (利用者の指摘)。 */
            { trackId: "Tozai_Down",   dir: -1, from: "放出",  to: "尼崎",
              depots: ["放出"], dest: "尼崎" },
            { trackId: "Tozai_Up",     dir: 1,  from: "尼崎",  to: "放出",
              depots: ["尼崎"], dest: "放出" },
            // 学研都市線の複線区間 (放出〜松井山手)
            { trackId: "Tozai_Up",     dir: 1,  from: "放出",  to: "松井山手", maxGap: 4.0,
              depots: ["放出"], dest: "松井山手" },
            /* 琵琶湖線 (京都〜野洲)
               京都から東は複々線ではなく、内側線・外側線が1本ずつになる。
               普通も外側線を走るので、在線を見るときは両方まとめて数える。
               本数はもともと少ない区間なので、空きの許容を少し広くとる。 */
            { trackId: "Up_Out",   tracks: ["Up_In", "Up_Out"],     dir: 1,  maxGap: 4.0,
              from: "京都", to: "野洲", depots: ["高槻", "向日町操"], dest: "野洲" },
            { trackId: "Down_Out", tracks: ["Down_In", "Down_Out"], dir: -1, maxGap: 4.0,
              from: "野洲", to: "京都", depots: ["野洲", "草津", "米原"], dest: "京都" }
        ];

        for (const sc of scan) {
            const blks = this.game.trackMgr.blocks[sc.trackId];
            if (!blks) continue;
            const a = blks.find(b => b.stationIdx === STATION_MAP[sc.from] && b.x !== -1000);
            const z = blks.find(b => b.stationIdx === STATION_MAP[sc.to] && b.x !== -1000);
            if (!a || !z) continue;
            const lo = Math.min(a.index, z.index), hi = Math.max(a.index, z.index);

            /* 同じ向きの普通・快速がいるブロックを集める。
               複々線の区間は内側線・外側線をまとめて1本の線として見る。 */
            const tracks = sc.tracks || [sc.trackId];
            const occupied = [];
            for (let i = lo; i <= hi; i++) {
                const busy = tracks.some(tid => {
                    const bb = this.game.trackMgr.blocks[tid];
                    return bb && bb[i] && bb[i].x !== -1000 &&
                        bb[i].lanes.some(l => l && l.dir === sc.dir &&
                                              ["普通", "快速"].includes(l.type));
                });
                if (busy) occupied.push(i);
            }
            // 進行方向の後ろ側から見て、最初に空きすぎている所を探す
            const gapBlocks = Math.ceil(UNITS_PER_STATION * (sc.maxGap || MAX_GAP_STATIONS));
            let worst = 0, worstLo = lo;
            for (let k = 1; k < occupied.length; k++) {
                if (occupied[k] - occupied[k - 1] > worst) { worst = occupied[k] - occupied[k - 1]; worstLo = occupied[k - 1]; }
            }
            if (occupied.length === 0) worst = hi - lo;
            if (worst <= gapBlocks) continue;

            /* 普通が走りすぎているときは増発しない。
               ★ここを 1.25倍まで許してみたところ、穴埋めが次々に走って
                 昼間の増発が 4本から 57本に膨れ、線路が詰まって
                 1駅あたり8分 (実際の3倍) まで落ちた。
                 空いた所を埋めるより、在線本数を守るほうが先。
                 目安ちょうどで止める。 */
            /* ★線区ごとの目安で見る。
               ここを "main" 決め打ちにしていたため、JR東西線・JR宝塚線・
               湖西線の穴埋めが、本線の普通が目安に達しているだけで
               いつも見送られていた (東西線の間隔が5.4駅まで開いても
               増発されなかった)。 */
            const scLine = sc.trackId.indexOf("Tozai") === 0 ? "tozai"
                         : sc.trackId.indexOf("Fukuchi") === 0 ? "fukuchi"
                         : sc.trackId.indexOf("Kosei") === 0 ? "kosei" : "main";
            if (ttOverBudget(this.game, scLine, "普通")) continue;

            // 手前の車両所から1本出す
            for (const dname of sc.depots) {
                const depot = DEPOTS[dname];
                if (!depot || !depotHasRoom(dname)) continue;
                if (this.game.fleet.poolAt(dname).length < 2) continue;
                /* ★車両を出す車両所が本線のものなら、本線の目安も見る。
                   分岐線の穴埋めのために本線の車両所から次々に出すと、
                   本線 (とくにJR神戸線) の列車が薄くなる。 */
                /* 尼崎の電留線は JR東西線の車両 (明石の207系・321系) の滞泊地でもある。
                   東西線の穴埋めに使うときは東西線の目安で見る。 */
                const dLine = (dname === "放出" || (dname === "尼崎" && scLine === "tozai")) ? "tozai"
                            : (dname === "新三田") ? "fukuchi" : "main";
                if (dLine === "main" && ttOverBudget(this.game, "main", "普通")) continue;
                let dest = sc.dest;
                /* ★JR京都線・JR神戸線の上りの穴が高槻より手前なら高槻行きで埋める。
                     高槻〜京都の普通は 4本/時 (大阪 8本/時 の半分は高槻止まり。osaka1.pdf)。
                     いつも京都行きにしていたので、高槻〜京都だけ普通が多くなっていた。 */
                if (sc.trackId === "Up_In" && sc.dest === "京都") {
                    const tk = blks.find(b => b.stationIdx === STATION_MAP["高槻"] && b.x !== -1000);
                    if (tk && worstLo < tk.index) dest = "高槻";
                }
                if (this.dirFromTo(dname, dest) !== sc.dir) continue;
                const no = this.game.spawner.generateTrainNumber("普通", sc.dir, dname, sc.trackId, dest);
                // 車両は行先の運用の条件で選ぶ (東西線なら207系/321系 など)
                const vs = this.game.fleet.assign(dname, "普通", sc.trackId, dest, no,
                                                  { noBorrow: true });
                if (!vs || !vs.length) continue;
                const ok = this.game.addTrain({
                    type: "普通", dir: sc.dir, trackId: depotTrackId(dname, sc.dir, "普通"),
                    dest: dest, startName: dname, name: no, nextAction: "turnback",
                    vehicles: vs
                });
                if (!ok) this.game.fleet.release(dname, vs);
                if (ok) {
                    this.stats.gapFill++;
                    this.game.ui.updateBanner(
                        `【運転整理】${sc.from}〜${sc.to} ${sc.dir === 1 ? "上り" : "下り"}の` +
                        `列車間隔が開いたため、` +
                        `${dname}から ${no}(普通) ${dest}行き を増発します。`, "banner-orange");
                    break;
                }
            }
        }
    }

    // ============================================================= 復旧の手配
    /**
     * 故障などで営業を続けられなくなった列車を、回送に打ち切って車両所へ戻す。
     * 瞬間移動はさせず、必ず線路の上を走って帰る。
     */
    convertToRecoveryDeadhead(train, reason) {
        if (!train || train.state === "finished") return false;
        if (train.type === "貨物") return false;

        const here = this.currentStationName(train);
        const target = this.nearestDepotAhead(train, here);
        if (!target) return false;

        /* ★向きを先に決める。
           車両所が後方 (または同じ位置) にあるなら、その場で折り返してから向かう。
           折り返せないうちは運用を変えない。先に行先だけ変えてしまうと、
           車両所と反対の方向へ走り続ける列車ができてしまう。 */
        const hereIdx = fleetIndexOf(here);
        if (hereIdx !== null && (target.idx - hereIdx) * train.dir <= 0) {
            if (target.idx === hereIdx && DEPOTS[target.name] &&
                DEPOTS[target.name].trains.length < DEPOTS[target.name].capacity) {
                // いまいる場所が車両所なら、そのまま入区する
                train.enterDepot(target.name);
                this.stats.recovery++;
                return true;
            }
            if (!this.moveToOppositeTrack(train, here, -train.dir)) {
                train.timer = 30;   // 番線が空くまで待つ
                return false;
            }
        }

        this.game.spawner.activeTrainNos.delete(train.trainNo);
        const oldNo = train.trainNo;
        train.type = "回送";
        train.trainNo = this.deadheadNo("M", train.dir);
        train.dutyName = train.trainNo;
        this.game.spawner.activeTrainNos.add(train.trainNo);
        train.dest = target.name;
        train.startName = here;
        train.nextAction = "depot";
        train.isFinalStop = false;
        train.hasStoppedAtCurrent = false;
        if (train.state === "stopped" || train.state === "holding") {
            train.state = "running";
            train.timer = 15;
        }
        this.stats.recovery++;
        this.game.ui.updateBanner(
            `【運転整理】${reason}のため、${oldNo} は${here}から先の営業を取りやめ、` +
            `${train.trainNo}(回送) として ${target.name} へ入区します。`, "banner-orange");
        return true;
    }

    /** いまいる駅名 (駅間なら手前の駅名) */
    currentStationName(train) {
        const blks = this.game.trackMgr.blocks[train.trackId];
        if (!blks || !blks[train.currBlockIndex]) return train.startName;
        const at = (b) => b.hoppoStationName ||
            (b.stationIdx >= 0 && STATIONS[b.stationIdx] ? STATIONS[b.stationIdx].name : "");
        for (let k = 0; k < 6; k++) {
            const b = blks[train.currBlockIndex - train.dir * k];
            if (b && at(b)) return at(b);
        }
        return train.startName;
    }

    /**
     * その列車の編成を受け入れられる車両所のうち、
     * 進行方向の前方にあっていちばん近いもの。
     * 前方に無ければ、折り返して戻れる後方の車両所を返す。
     */
    nearestDepotAhead(train, hereName) {
        const hereIdx = fleetIndexOf(hereName);
        if (hereIdx === null) return null;
        const veh = (train.vehicles && train.vehicles.length) ? train.vehicles[0] : null;
        const cands = [];
        for (const name in DEPOTS) {
            const base = FLEET_BASES.find(b => b.name === name);
            if (veh && base && base.groups.indexOf(veh.group) < 0) continue;
            const idx = fleetIndexOf(name);
            if (idx === null) continue;
            /* 線区をまたぐ回送はできない。
               JR東西線の列車は放出、JR宝塚線の列車は新三田、
               湖西線の列車は近江今津、というように同じ線区の車両所へ戻す。
               (宮原操は北方貨物線・本線側なので、分岐線からは戻れない) */
            const onTozai = train.trackId.indexOf("Tozai") === 0;
            const onFukuchi = train.trackId.indexOf("Fukuchi") === 0;
            const onKosei = train.trackId.indexOf("Kosei") === 0;
            /* ★車両所の面している線区で見る (DEPOTS[x].line)。学研都市線の祝園・奈良支所 (木津) を
                 足したので、名前を決め打ちにすると本線の列車が「祝園」行きの回送になっていた
                 (線区が違っても駅の番号は重なるので、番号だけでは見分けられない)。 */
            const depLine = DEPOTS[name].line || null;
            if (onTozai && depLine !== "Tozai") continue;
            if (onFukuchi && depLine !== "Fukuchi") continue;
            if (onKosei) continue;                       // 湖西線内に車両所は置いていない
            if (!onTozai && !onFukuchi && depLine) continue;
            cands.push({ name: name, idx: idx, dist: (idx - hereIdx) * train.dir,
                         ahead: (idx - hereIdx) * train.dir > 0 });
        }
        if (!cands.length) return null;
        /* ★いまいる位置と同じ場所の車両所は「前方」に数えない。
           そのまま走らせても二度と通らないため。 */
        const ahead = cands.filter(c => c.dist > 0)
            .sort((a, b) => a.dist - b.dist);
        if (ahead.length) return ahead[0];
        // 前方に無ければ、いちばん近いものへ折り返して戻る
        cands.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
        return cands[0];
    }
}

/* ------------------------------------------------------------------ 折り返し優先
   終点に着いた列車は、まず「その場で折り返して次の列車になる」ことを試す。
   実際の運用でも、京都・高槻・西明石などに着いた列車の大半は
   すぐ折り返して次の運用に入り、車両所へ戻るのは運用の最後だけ。
*/
/**
 * 列車をその駅で反対方向の線路へ移す (折り返しの「線路を移る」部分だけ)。
 * 行先や列車番号は変えない。移せたら true。
 *
 * 送り込み回送が駅に着いて、そこから反対方向の営業列車になるときに使う。
 * 以前はこの処理が無く、向きがそのままだったため
 * 「宮原操発 尼崎行きの回送」が尼崎で四条畷行きに変わっても
 * 下り方向のまま走り続け、行先にたどり着けなかった。
 */
OperationsManager.prototype.moveToOppositeTrack = function (train, stName, newDir) {
    /* ★実物の配線で方転できない駅 (上下をつなぐ渡り線も引上線も無い駅) では
       反対方向の線路へ移さない (js/03-stations.js の canReverseAt)。
       以前はここで確かめていなかったので、回送への変更 (tryConvertDeadhead) を
       通ると、坂田のような駅で向きを変えてしまうことがあった。
       移せないときは false を返すので、呼び出し側は前方の車両所へ向かわせる。 */
    if (!canReverseAtDir(stName, -newDir)) return false;
    const blks = this.game.trackMgr.blocks[train.trackId];
    if (!blks) return false;
    const blk = blks[train.currBlockIndex];
    if (!blk) return false;

    let newTrackId;
    if (train.trackId.indexOf("Kosei") === 0)        newTrackId = newDir === 1 ? "Kosei_Up" : "Kosei_Down";
    else if (train.trackId.indexOf("Fukuchi") === 0) newTrackId = newDir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
    else if (train.trackId.indexOf("Tozai") === 0)   newTrackId = newDir === 1 ? "Tozai_Up" : "Tozai_Down";
    else if (train.trackId.indexOf("Hoppo") >= 0)    newTrackId = newDir === 1 ? "Up_Hoppo" : "Down_Hoppo";
    else newTrackId = (newDir === 1 ? "Up_" : "Down_") + (train.trackId.indexOf("In") >= 0 ? "In" : "Out");

    const hereIdx = STATION_MAP[stName];
    if (hereIdx !== undefined && newTrackId.indexOf("In") >= 0 &&
        (hereIdx < STATION_MAP["西明石"] || hereIdx > STATION_MAP["草津"])) {
        newTrackId = newTrackId.replace("In", "Out");
    }

    const targetBlks = this.game.trackMgr.blocks[newTrackId];
    if (!targetBlks) return false;
    const newB = targetBlks.find(b => Math.abs(b.x - blk.x) < 5 && b.x !== -1000);
    if (!newB) return false;
    /* ★上下でレーンを共有する駅では、反対方向の線路も同じ番線。
       その場で線路の名前と向きだけ変える (木津・上郡・播州赤穂など)。 */
    if (newB.lanes === blk.lanes && blk.lanes.indexOf(train) >= 0) {
        train.trackId = newTrackId;
        train.dir = newDir;
        train.currBlockIndex = newB.index;
        train.lane = blk.lanes.indexOf(train);
        return true;
    }
    const lane = train.findFreeLane(newB, newTrackId);
    if (lane === -1) return false;

    freeOwnLane(blk.lanes, train);
    train.trackId = newTrackId;
    train.dir = newDir;
    train.currBlockIndex = newB.index;
    train.lane = lane;
    newB.lanes[lane] = train;
    return true;
};

/** その駅から行先へ向かうときの進行方向 (分からなければ 0) */
OperationsManager.prototype.directionFor = function (fromName, destName) {
    if (TOZAI_THROUGH_DESTS.indexOf(destName) >= 0) return 1;
    if (FUKUCHI_THROUGH_DESTS.indexOf(destName) >= 0) return -1;
    const a = fleetIndexOf(fromName), b = fleetIndexOf(destName);
    if (a === null || b === null || a === b) return 0;
    return (b > a) ? 1 : -1;
};

OperationsManager.prototype.preferTurnback = function (train, stName) {
    const h = (this.game.currentTime / 3600) % 24;

    // 終電のあとは入区させる (折り返しても走る先が無い)。線区ごとの終電で見る
    if (!ttInService(ttLineOf(train), h, train)) return false;
    // 大きく遅れている列車は運用を切って車両所へ戻す
    if (train.delayTime > 1800) return false;
    /* ★その線区のその種別が目安を大きく（3割）超えているときは折り返さない。

     終端に着いた列車は nextAction="depot" でもここを通るので
     （js/15-train-depot.js の tryConvertDeadhead がまず折り返しを試す）、
     本数の目安（TT_ACTIVE_BUDGET）がまったく効かない経路に
     なっていた。実測では JR東西線の普通が目安10本に対して
     24.7本まで増え、京橋〜放出の1線しかない区間が飽和して
     尼崎経由で本線の下りまで止まっていた。
     ただし「折り返した先に続く列車がいない」ときは
     区間が空っぽになるので、これまでどおり折り返す。 */
    if (ttOverBudget(this.game, ttLineOf(train), train.type, 1.3) &&
        !ttStillNeeded(this.game, train, stName)) return false;
    // 回送・貨物・特急はここでは扱わない
    if (["回送", "貨物", "特急"].includes(train.type)) return false;

    /* 種別の偏りは生成側 (js/08-spawner-mainline.js の trySpawn) が
       在線本数の目安を見て抑えている。ここで折り返しを止めると、
       京都に着いた列車がほとんど向日町操へ回送されてしまい、
       琵琶湖線 (京都〜野洲) の普通が走らなくなる。
       折り返しは実際の運用どおり優先する。 */

    const newDir = train.dir * -1;
    // 折り返し先の線路を決める
    let newTrackId;
    if (train.trackId.indexOf("Kosei") === 0)        newTrackId = newDir === 1 ? "Kosei_Up" : "Kosei_Down";
    else if (train.trackId.indexOf("Fukuchi") === 0) newTrackId = newDir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
    else if (train.trackId.indexOf("Tozai") === 0)   newTrackId = newDir === 1 ? "Tozai_Up" : "Tozai_Down";
    else if (train.trackId.indexOf("Hoppo") >= 0)    newTrackId = newDir === 1 ? "Up_Out" : "Down_Out";
    else newTrackId = (newDir === 1 ? "Up_" : "Down_") + (train.trackId.indexOf("In") >= 0 ? "In" : "Out");

    const hereIdx = STATION_MAP[stName];
    if (hereIdx !== undefined && newTrackId.indexOf("In") >= 0 &&
        (hereIdx < STATION_MAP["西明石"] || hereIdx > STATION_MAP["草津"])) {
        newTrackId = newTrackId.replace("In", "Out");
    }

    const blks = this.game.trackMgr.blocks[train.trackId];
    const blk = blks[train.currBlockIndex];
    let targetBlks = this.game.trackMgr.blocks[newTrackId];
    if (!targetBlks) return false;
    let newB = targetBlks.find(b => Math.abs(b.x - blk.x) < 5 && b.x !== -1000);
    if (!newB) return false;

    /* ★折り返し先の番線が埋まっているときは、同じ向きのもう一方の線路
       (内側線 ⇄ 外側線) も試す。駅には内外をつなぐ渡り線があるので、
       空いているホームへ入れるのが実際の扱い。
       ここを見ていなかったため、京都に着いた上り列車が
       下り内側線 (4番・5番) の空きを待ちきれず、
       次々と回送で打ち切られていた (実測 折り返し21本 / 回送29本)。 */
    if (train.findFreeLane(newB, newTrackId) === -1 &&
        /^(Up|Down)_(In|Out)$/.test(newTrackId) &&
        /* 尼崎のように内側線・外側線で着発線を共有している駅では、
           線路を入れ替えても使える番線は増えない。入れ替えると
           「下り外側線に4番のりば」のような食い違いになる。 */
        !STATION_SHARED_LANES[stName]) {
        const alt = newTrackId.indexOf("In") >= 0
            ? newTrackId.replace("In", "Out") : newTrackId.replace("Out", "In");
        const altBlks = this.game.trackMgr.blocks[alt];
        const altB = altBlks ? altBlks.find(b => Math.abs(b.x - blk.x) < 5 && b.x !== -1000) : null;
        if (altB && train.findFreeLane(altB, alt) !== -1) {
            newTrackId = alt; targetBlks = altBlks; newB = altB;
        }
    }

    /* ★同一ホーム折り返し。
       渡り線のある駅では、線路を移さずに向きだけ変え、
       発車のときに反対方向の線路へ入る (js/14-train-turnback.js と同じ)。
       これで到着番線と発車番線が同じになる。
       渡り線の無い駅では、これまでどおり反対方向の番線が空くのを待つ。 */
    /* ★大阪・新大阪のホームでは向きを変えられない。尼崎の引上線は
       4番・5番だけにつながっている (js/03-stations.js の
       canTurnBackOnPlatform)。折り返せない駅では車両所へ回送する。 */
    if (STATION_NO_PLATFORM_TURNBACK.indexOf(stName) >= 0) return false;
    /* ★実物の配線で方転できない駅では折り返さない (js/03-stations.js の canReverseAt)。
       車両所へ回送するか、運用を終える。 */
    if (!canReverseAtDir(stName, train.dir)) return false;

    const inPlace = !globalThis.__TB_OFF &&
                    canTurnBackOnPlatform(stName, train.trackId, train.lane, newTrackId) &&
                    /* ★その番線から折り返した先の線路へ出られること。
                       尼崎のように上り側と下り側で着発線が別になっている駅では、
                       ホームのまま向きを変えることはできない (引上線を使って
                       上り側の番線へ移る)。 */
                    canDepartTo(stName, train.trackId, train.lane, newTrackId) &&
                    (SWITCHABLE_STATIONS.indexOf(stName) >= 0 ||
                     OVERTAKE_STATIONS.indexOf(stName) >= 0);
    let lane = train.lane;
    // 上下でレーンを共有する駅 (単線の駅など) は、その場で向きを変えるのと同じ
    const sharedHere = (newB.lanes === blk.lanes);
    if (!inPlace && sharedHere) lane = blk.lanes.indexOf(train);
    if (!inPlace && !sharedHere) {
        lane = train.findFreeLane(newB, newTrackId);
        if (lane === -1) {
            train.turnbackWait = (train.turnbackWait || 0) + 1;
            /* ★終着駅のホームが空くのを待つ回数。
               主要駅で10回 (10分) まで待たせてみたが、京都の折り返し率は
               変わらず (19/26)、そのぶん終着駅のホームが埋まって
               本数が落ちた。実際の折り返し時間に近い5分で諦め、
               車両所へ回送する。 */
            if (train.turnbackWait <= 5) { train.timer = 60; return true; }
            train.turnbackWait = 0;
            return false;
        }
    }
    train.turnbackWait = 0;

    // 折り返した先の行先を決める
    /* 行先は、いまの編成で走れるものを引き直して選ぶ (js/14-train-turnback.js の pickServableDest と同じ考え方)。
       ★京都に着いた 207系・321系に琵琶湖線の行先が当たると、編成を差し替えられずに回送になっていた。 */
    let nextDest = null;
    for (let k = 0; k < 10; k++) {
        let d = this.game.spawner.getDestination(train.type, newDir, stName, newTrackId);
        if (d === stName) d = this.game.spawner.fallbackTerminal(newDir, stName, newTrackId);
        if (nextDest === null) nextDest = d;
        if (!train.vehicles || !train.vehicles.length ||
            this.game.fleet.canServe(train.vehicles, stName, train.type, newTrackId, d, null)) { nextDest = d; break; }
        if (k === 9 && typeof STOCK_HOME_TERMINALS !== "undefined") {
            // 割合の表に走れる行先が無い: 編成の受け持つ線区の終点から選ぶ (京都支所の車両は湖西線・琵琶湖線へ)
            const alt = STOCK_HOME_TERMINALS.filter(x => x !== stName && this.directionFor(stName, x) === newDir &&
                this.game.fleet.canServe(train.vehicles, stName, train.type, newTrackId, x, null));
            if (alt.length) nextDest = alt[Math.floor(Math.random() * alt.length)];
        }
    }

    // いまの編成でその運用に入れるかを確かめ、駄目なら差し替える
    const nextNo = this.game.spawner.generateTrainNumber(train.type, newDir, stName, newTrackId, nextDest);
    /* ★差し替えられないときに元の編成を失わない (tryReassign)。以前の reassign は失敗すると
         元の編成を留置線へ返してしまい、そのあと回送になった列車が編成の無いまま走っていた
         (塚口 → 新三田 の回送が「営業列車にできない」と判定されていた原因)。 */
    const keep = train.vehicles.slice();
    const vs = this.game.fleet.tryReassign(stName, train.type, newTrackId, nextDest, nextNo, train.vehicles);
    if (!this.game.fleet.canServe(vs, stName, train.type, newTrackId, nextDest, nextNo)) { train.vehicles = keep; return false; }
    train.vehicles = vs;

    if (inPlace) {
        // 到着した番線のまま。反対方向の線路へ入るのは発車のとき。
        train.dir = newDir;
        train.turnbackTrack = newTrackId;
    } else if (sharedHere) {
        // 共有の番線のまま、線路の名前と向きを変える
        train.trackId = newTrackId;
        train.dir = newDir;
        train.currBlockIndex = newB.index;
        train.lane = lane;
    } else {
        // 本線から外して折り返し先へ (渡り線の無い駅。実際の入換にあたる)
        const at = blk.lanes.indexOf(train);
        if (at >= 0) blk.lanes[at] = null;
        train.trackId = newTrackId;
        train.dir = newDir;
        train.currBlockIndex = newB.index;
        train.lane = lane;
        newB.lanes[lane] = train;
    }

    this.game.spawner.activeTrainNos.delete(train.trainNo);
    train.trainNo = nextNo;
    train.dutyName = nextNo;
    this.game.spawner.activeTrainNos.add(nextNo);
    train.startName = stName || train.startName;
    train.dest = nextDest;
    train.nextAction = "turnback";
    train.updateKoseiRoute();
    train.state = "waiting_start";
    train.stuckTime = 0;
    train.hasStoppedAtCurrent = false;
    train.hasDeparted = false;
    train.isFinalStop = false;
    // 折り返しの時間 (乗車・乗務員の移動)。遅れていれば詰めて、そのぶん回復する
    train.applyTurnbackDwell(stName);
    this.stats.turnback = (this.stats.turnback || 0) + 1;
    return true;
};

/* ------------------------------------------------------------------ 行先の見張り
   走っている列車の行先が、いまの線路・向きでたどり着けるかを毎Tick確かめる。
   たどり着けない行先が付いていたら、前方の妥当な終着駅へ直す。

   運転整理は行先を何か所からも書き換えるので、そのどれかが
   線区や向きを取り違えると、列車が終点に着けないまま走り続けてしまう。
   個々の書き換えは正しくしたうえで、最後の関門としてここで必ず直す。
   実際の指令でも「この列車はここまで」と行先を整理するので、
   動きとしても不自然ではない。 */
OperationsManager.prototype.canReach = function (train) {
    const blks = this.game.trackMgr.blocks[train.trackId];
    if (!blks) return true;
    const here = blks[train.currBlockIndex];
    if (!here || here.stationIdx === undefined) return true;
    const hereIdx = here.stationIdx;
    const amaIdx = STATION_MAP["尼崎"];
    const yamaIdx = STATION_MAP["山科"];
    const tid = train.trackId;
    const onTozai = tid.indexOf("Tozai") === 0;
    const onFukuchi = tid.indexOf("Fukuchi") === 0;
    const onKosei = tid.indexOf("Kosei") === 0;
    const onHoppo = tid.indexOf("Hoppo") >= 0;

    /* ★行先の駅がいまの線路の上にあるなら、それが前方 (か当駅) にあるかを見る。
       線区ごとの大まかな判定だけでは、「JR東西線の上りで放出行き」のように
       線区も向きも合っているのに、すでに放出を通り過ぎている列車を
       見逃していた (そのまま四条畷方の行き止まりへ進んで動けなくなった)。
       線路図の外の行先は、線区の端の駅に読み替えて見る。 */
    if (!onHoppo) {
        const endName = lineEndForBeyond(train.dest) || train.dest;
        const destBlk = blks.find(b => b.x !== -1000 && (b.isStation || b.hoppoStationName) &&
                                       blockStationName(b) === endName);
        if (destBlk) return (destBlk.index - train.currBlockIndex) * train.dir >= 0;
    }

    // 分岐線へ入る行先
    if (TOZAI_THROUGH_DESTS.indexOf(train.dest) >= 0) {
        if (onKosei || onHoppo) return false;
        if (onTozai || onFukuchi) return train.dir === 1;
        return train.dir === 1 && hereIdx <= amaIdx;
    }
    if (FUKUCHI_THROUGH_DESTS.indexOf(train.dest) >= 0) {
        if (onKosei || onHoppo) return false;
        if (onFukuchi || onTozai) return train.dir === -1;
        return train.dir === -1 && hereIdx >= amaIdx;
    }
    if (KOSEI_PLACES.indexOf(train.dest) >= 0) {
        if (onTozai || onFukuchi || onHoppo) return false;
        if (onKosei) return train.dir === 1;
        return train.dir === 1 && hereIdx <= yamaIdx;
    }

    // 本線・北陸線の駅
    const dIdx = STATION_MAP[train.dest];
    if (dIdx === undefined) return true;          // 貨物駅・線外の駅は見ない
    if (onTozai)   return train.dir === -1 && dIdx <= amaIdx;
    if (onFukuchi) return train.dir === 1 && dIdx >= amaIdx;
    if (onKosei) {
        return (train.dir === -1) ? (dIdx <= yamaIdx) : (dIdx >= STATION_MAP["近江塩津"]);
    }
    if (dIdx === hereIdx) return true;            // 当駅止まり
    return (dIdx - hereIdx) * train.dir > 0;
};

/**
 * その編成で走れない運用になっていたら、当駅止まりに短縮する。
 *
 * ★運転整理は行先を何か所からも書き換える。書き換えた結果、
 *   いまの編成では走れない運用になることがある
 *   (湖西線の京都支所の221系に「敦賀行き」が付くなど)。
 *   個々の書き換えでも確かめているが、最後の関門としてここで必ず直す。
 *   実際の指令でも「この列車はここまで」と行先を整理する。
 */
OperationsManager.prototype.fixIllegalStock = function (train) {
    if (["回送", "貨物", "臨時", "特急"].indexOf(train.type) >= 0) return false;
    if (!train.vehicles || !train.vehicles.length) return false;
    if (this.game.fleet.canServe(train.vehicles, train.startName, train.type,
                                 train.trackId, train.dest, train.dutyName)) return false;
    const here = this.currentStationName(train);
    if (!here || here === train.dest) return false;
    const oldDest = train.dest;
    train.dest = here;
    train.isFinalStop = false;
    train.updateKoseiRoute();
    this.stats.stockFix = (this.stats.stockFix || 0) + 1;
    if (Math.random() < 0.1) {
        this.game.ui.updateBanner(
            `【運転整理】${train.trainNo} は編成の運用範囲から外れるため、` +
            `行先を ${oldDest} から ${here} に短縮します。`, "banner-orange");
    }
    return true;
};

/** たどり着けない行先を直す。直したら true。 */
OperationsManager.prototype.fixUnreachableDest = function (train) {
    if (this.canReach(train)) return false;
    const blks = this.game.trackMgr.blocks[train.trackId];
    const here = blks ? blks[train.currBlockIndex] : null;
    const hereName = here ? (blockStationName(here) || train.startName) : train.startName;
    const newDest = this.game.spawner.fallbackTerminal(train.dir, hereName, train.trackId);
    if (!newDest || newDest === train.dest) return false;
    const oldDest = train.dest;
    train.dest = newDest;
    train.isFinalStop = false;
    train.updateKoseiRoute();
    this.stats.destFix = (this.stats.destFix || 0) + 1;
    // 毎回ログに出すと埋まるので、たまにだけ知らせる
    if (Math.random() < 0.15) {
        this.game.ui.updateBanner(
            `【運転整理】${train.trainNo} は現在の経路では ${oldDest} へ行けないため、` +
            `行先を ${newDest} に変更します。`, "banner-orange");
    }
    return true;
};

/* ------------------------------------------------------------------ 詰まりの見張り

   ■ なぜ要るか
     個々の運転整理 (折り返し・回送化・行先の見張り) は正しくしてあっても、
     組み合わせによっては「どこにも行けない列車」が生まれることがある。
     放出を過ぎて四条畷方の行き止まりへ入った列車がその例で、
     1本が動けなくなると後続が次々に止まり、尼崎で着発線を共有する本線まで
     詰まりが広がっていた。

   ■ どうするか (実際の指令の運転整理と同じ順)
     1分ごとに全列車を見て、
       1. 線路の無い位置に居る列車 … 運用を打ち切って回収する
       2. 線区の端で5分以上進めない列車 … 駅なら終点扱いにして入区・折り返しへ、
          駅間なら直前の駅で打ち切ったものとして回収する
       3. 輸送障害も抑止も無いのに40分以上動けない列車 …
          指令扱いの強制発車を出す。3回出しても1時間以上動けないときは
          番線を空ける処置 (入区・回送・打ち切り) をとる
     輸送障害・指令の抑止・防護無線で止められている列車には手を出さない。
     どの措置も運転指令の記録に残す。 */
OperationsManager.prototype.watchdog = function (ct) {
    if (ct < (this.watchNext || 0)) return;
    this.watchNext = ct + 60;
    const g = this.game;
    const calm = !g.isEmergency && g.incidents.active.length === 0 &&
                 !(g.recovery && g.recovery.plans.length) &&
                 g.trackMgr.manualSuspensions.length === 0;
    const list = g.trains.slice();
    for (const t of list) {
        if (t.state === "finished" || t.state === "in_depot" || t.overnightStable) continue;
        if (t.workStopHold) continue;               // 事業用列車の訓練・待ち合わせの停車 (止まっていてよい)
        const blks = g.trackMgr.blocks[t.trackId];
        const b = blks ? blks[t.currBlockIndex] : null;

        // 1. 線路の無い位置に居る
        if (!b || b.x === -1000) {
            this.stats.watch = (this.stats.watch || 0) + 1;
            t.resolveStall("", "線路の無い位置に在線していた");
            continue;
        }
        // 輸送障害・抑止・指令連絡の応答待ちで止められている列車はそのまま
        if (t.minorTrouble || t.isManuallySuspended || t.commIncident || g.isEmergency) continue;

        // 2. 線区の端で進めない
        if (t.lineEndAhead() && !t.isFinalStop && t.state !== "turning_back" && t.stuckTime >= 300) {
            this.stats.watch = (this.stats.watch || 0) + 1;
            if (isRealStationBlock(b)) {
                const here = blockStationName(b);
                g.ui.updateBanner(
                    `【運転整理】${t.trainNo} は${here}から先に進路が無いため、${here}止まりに変更します。`,
                    "banner-orange");
                if (g.records) g.records.noteDisposition(t, here, "線区の端で進路が無い", `${here}止まりに変更`);
                t.endOfLineStop();
            } else {
                t.resolveStall(this.currentStationName(t), "線区の端で進路が無い");
            }
            continue;
        }

        // 3. 何も起きていないのに長時間動けない (詰まりの崩壊の芽)
        if (!calm) continue;
        if (t.stuckTime >= 2400) {
            t.watchForced = (t.watchForced || 0) + 1;
            if (t.watchForced >= 3 && t.stuckTime >= 3600 && isRealStationBlock(b)) {
                t.watchForced = 0;
                this.stats.watch = (this.stats.watch || 0) + 1;
                t.resolveStall(blockStationName(b), "1時間以上発車できない");
                continue;
            }
            if (!t.forceStart) {
                t.forceStart = true;
                if (t.watchForced === 1) {
                    g.ui.updateBanner(
                        `【指令介入】${t.trainNo} が長時間発車できないため、指令扱いで発車させます。`,
                        "banner-orange");
                    if (g.records) g.records.noteDisposition(t, this.currentStationName(t),
                        "40分以上発車できない", "指令扱いで発車");
                }
            }
        } else if (t.stuckTime === 0) {
            t.watchForced = 0;
        }
    }
};

/* ------------------------------------------------------------------ 駅の夜間留置 (駅泊)

   ■ 利用者の指摘 3.
     四条畷のように翌朝の始発駅になる駅では、前の日の最終の運用を終えた編成が
     2本ほど駅のホーム (着発線) で夜を明かし、そのまま翌朝の始発になる。
     以前は終電のあとに着いた列車は、近くの車両所 (放出) へ回送するか、線路図から消していた。
   ■ どうするか
     ・終電の近く (23:24〜) にその駅止まりで着いた列車は、max 本まで折り返さずに朝まで留置する
       (翌朝の始発の向きの番線へ先に移しておく)。
     ・留置しているあいだは列車番号も行先も持たない。表示は編成番号だけ
       (js/40-tid-theme.js の tidDrawTrainLabel・js/17-renderer.js)。
     ・朝 leave の時刻の15分前に、翌朝の始発 (列車番号・行先) を付けて発車を待つ。
       編成は夜に留置した編成をそのまま使う (在庫には戻さない = 瞬間移動しない)。
     ・終電の近くにその駅止まりが足りないときは、先へ行く普通・快速を1本その駅止まりにする
       (夜の入区 NIGHT_RETURN と同じ考え方)。
   ■ 駅ごとの設定
     max   … 留置する本数。四条畷は上下2線ずつ (4番線まで) あるので2本、
             松井山手は上下1線ずつなので1本 (もう1本は朝の京橋方からの列車に空けておく)
     dir   … 翌朝の始発の向き (-1 = 京橋・尼崎方)
     leave … 翌朝の始発の発車時刻 (時。1本目・2本目 …)
     as / dest … 翌朝の始発の種別・行先 (いまの編成で入れる行先を順に探す)
     line  … 線区 (main / Tozai / Kosei / Fukuchi)
   ■ 利用者の指摘 ①② (2026-10)
     ・本線 (須磨・神戸・加古川・長浜)・湖西線 (堅田・近江舞子)・JR宝塚線 (宝塚) にも駅泊を入れた。
       翌朝の始発をその駅で夜を明かした編成で出すので、朝の送り込み回送が要らなくなる。
     ・四条畷で、最後の折り返し列車がまだ来ていないのに2本が先に留置され、
       その2本が番線をふさいで最後の列車が駅の手前で止まったままになっていた。
       留置してよいのは、
         (1) その駅を通る (折り返して戻ってくるものを含む) 列車がもう無いとき、または
         (2) 留置しても、翌朝の向きの番線にまだ1本以上の空きが残るとき (その日はもう使わない番線)
       に限る (stablingSafe)。 */
const STATION_STABLING = {
    "四条畷":   { max: 2, dir: -1, leave: [4.85, 5.2], as: "普通", dest: ["西明石", "尼崎", "京橋"], line: "Tozai" },
    "松井山手": { max: 1, dir: -1, leave: [5.05],      as: "普通", dest: ["尼崎", "西明石", "京橋"], line: "Tozai" },
    "須磨":     { max: 2, dir: 1,  leave: [4.95, 5.3], as: "普通", dest: ["高槻", "京都", "大阪"],   line: "main" },
    "神戸":     { max: 1, dir: 1,  leave: [5.1],       as: "普通", dest: ["高槻", "京都"],           line: "main" },
    "加古川":   { max: 2, dir: 1,  leave: [4.9, 5.25], as: "普通", dest: ["京都", "高槻", "大阪"],   line: "main" },
    "長浜":     { max: 2, dir: -1, leave: [5.05, 5.4], as: "普通", dest: ["京都", "西明石", "姫路"], line: "main" },
    "堅田":     { max: 2, dir: -1, leave: [5.0, 5.35], as: "普通", dest: ["京都"],                   line: "Kosei" },
    "近江舞子": { max: 1, dir: -1, leave: [5.2],       as: "普通", dest: ["京都"],                   line: "Kosei" },
    "宝塚":     { max: 2, dir: 1,  leave: [4.95, 5.3], as: "普通", dest: ["大阪", "尼崎", "京橋"],   line: "Fukuchi" }
};

/** 線区の線路か (駅泊の設定の line) */
function stablingLineTrack(line, trackId) {
    if (line === "main") return /^(Up|Down)_(In|Out)$/.test(trackId);
    return trackId.indexOf(line + "_") === 0;
}
/** 駅泊の線区の終電 (js/10-timetable.js の TT_SERVICE_END) */
function stablingLineEnd(line) {
    const k = { main: "main", Tozai: "tozai", Kosei: "kosei", Fukuchi: "fukuchi" }[line] || "main";
    return TT_SERVICE_END[k] !== undefined ? TT_SERVICE_END[k] : 24.0;
}
/** 上り線・下り線をひとまとめにした線路の組 (Up_In と Down_In、Tozai_Up と Tozai_Down) */
function stablingTrackPair(trackId) {
    return /^(Up|Down)_/.test(trackId) ? trackId.replace(/^(Up|Down)_/, "") : trackId.split("_")[0];
}

/** 列車をその駅で反対向きにしたときに入る線路の名前 (moveToOppositeTrack と同じ決め方) */
function oppositeTrackAt(trackId, newDir, stName) {
    let id;
    if (trackId.indexOf("Kosei") === 0)        id = newDir === 1 ? "Kosei_Up" : "Kosei_Down";
    else if (trackId.indexOf("Fukuchi") === 0) id = newDir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
    else if (trackId.indexOf("Tozai") === 0)   id = newDir === 1 ? "Tozai_Up" : "Tozai_Down";
    else if (trackId.indexOf("Hoppo") >= 0)    id = newDir === 1 ? "Up_Hoppo" : "Down_Hoppo";
    else id = (newDir === 1 ? "Up_" : "Down_") + (trackId.indexOf("In") >= 0 ? "In" : "Out");
    const hereIdx = STATION_MAP[stName];
    if (hereIdx !== undefined && id.indexOf("In") >= 0 &&
        (hereIdx < STATION_MAP["西明石"] || hereIdx > STATION_MAP["草津"])) id = id.replace("In", "Out");
    return id;
}

/**
 * その駅でいま留置してよいか (利用者の指摘 ②)。
 *   ・翌朝の向きの線路でその駅をこれから通る列車、反対向きで駅を過ぎていて折り返して戻ってくる列車が
 *     1本も無ければ (その日の最後の列車が済んでいれば) よい。
 *   ・まだあるときは、留置したあとも翌朝の向きの番線に空きが1本以上残るときだけよい
 *     (残る列車の邪魔にならない番線にだけ置く)。
 */
OperationsManager.prototype.stablingSafe = function (t, stName, cfg, morningTrack) {
    const g = this.game;
    const mb = stationBlockOn(g, morningTrack, stName);
    if (!mb) return false;
    const pair = stablingTrackPair(morningTrack);
    let pending = 0;
    for (const o of g.trains) {
        if (o === t || o.state === "finished" || o.state === "in_depot" || o.overnightStable) continue;
        if (stablingTrackPair(o.trackId) !== pair) continue;
        const ob = stationBlockOn(g, o.trackId, stName);
        if (!ob) continue;
        const ahead = (ob.index - o.currBlockIndex) * o.dir;
        if (o.dir === cfg.dir) {
            if (ahead >= 0) pending++;                       // これからその駅を通る
        } else if (ahead < 0 && o.nextAction === "turnback" && !o.nightReturn && !o.stableTarget) {
            pending++;                                       // 駅を過ぎて、先で折り返して戻ってくる
        }
    }
    if (!pending) return true;
    const mine = mb.lanes.indexOf(t) >= 0 ? 1 : 0;
    const free = mb.lanes.filter(x => !x).length;
    return free - (1 - mine) >= 1;
};

/** その駅で朝まで留置している列車 */
OperationsManager.prototype.stabledAt = function (stName) {
    return this.game.trains.filter(t => t.state !== "finished" && t.overnightStable && t.overnightStable.st === stName);
};

/**
 * 終着駅に着いた列車を、その駅で朝まで留置する。留置したら true
 * (js/14-train-turnback.js の executeTurnBack から呼ぶ)。
 */
OperationsManager.prototype.tryStableOvernight = function (t, stName) {
    const cfg = STATION_STABLING[stName];
    if (!cfg || globalThis.__NO_STATION_STABLING) return false;
    const g = this.game;
    const now = g.currentTime;
    const h = (now / 3600) % 24;
    const a = ttAbsHour(h);
    if (a < stablingLineEnd(cfg.line) - 0.85 || a >= 27.5) return false;
    if (["普通", "快速", "回送"].indexOf(t.type) < 0 || t.specialEvent || t.eventTrain) return false;
    if (!stablingLineTrack(cfg.line, t.trackId) || !t.vehicles || !t.vehicles.length) return false;
    const here = this.stabledAt(stName);
    if (here.length >= cfg.max) return false;
    const morningTrack = (t.dir === cfg.dir) ? t.trackId : oppositeTrackAt(t.trackId, cfg.dir, stName);
    if (!cfg.dest.some(d => g.fleet.canServe(t.vehicles, stName, cfg.as, morningTrack, d, null))) return false;
    // その日の最後の列車がまだ来るなら、邪魔にならない番線が残るときだけ留置する
    if (!this.stablingSafe(t, stName, cfg, morningTrack)) return false;
    // 翌朝の始発の向きの番線へ先に移す (夜のうちに方向を変えておく)
    if (t.dir !== cfg.dir && !this.moveToOppositeTrack(t, stName, cfg.dir)) return false;

    const used = here.map(x => x.overnightStable.slot);
    let slot = 0;
    while (used.indexOf(slot) >= 0) slot++;
    const leaveH = slot < cfg.leave.length ? cfg.leave[slot] : cfg.leave[cfg.leave.length - 1] + 0.25 * slot;
    let leaveAt = now - h * 3600 + leaveH * 3600;
    if (leaveAt <= now) leaveAt += 24 * 3600;

    const oldNo = t.trainNo;
    g.spawner.activeTrainNos.delete(t.trainNo);
    t.overnightStable = { st: stName, slot: slot, since: now, leaveAt: leaveAt, assignAt: leaveAt - 900 };
    /* ★回送ではなく「留置」(利用者の指摘 ③)。回送 (新快速と同格) にしていたので、留置中の編成が
         ホームの発車順の調停で最優先になり、並んだ普通・快速がその「発車」を待ち続けていた。
         次の運用 (翌朝の始発) が付くまでは留置のまま。優先度はいちばん低い (PRIORITY["留置"] = 0)。 */
    t.type = "留置";
    t.trainNo = "";
    t.dutyName = "";
    t.dest = stName;
    t.startName = stName;
    t.serviceChange = null;
    t.skTarget = undefined;
    t.nightReturn = false;
    t.stableTarget = null;
    t.retiredByBudget = false;
    t.oldInfo = null;
    t.nextAction = "turnback";
    t.isFinalStop = false;
    t.hasStoppedAtCurrent = false;
    t.hasDeparted = false;
    t.delayTime = 0;
    t.stuckTime = 0;
    t.state = "waiting_start";
    t.timer = leaveAt - now;
    this.stats.stabled = (this.stats.stabled || 0) + 1;
    g.ui.updateBanner(`【夜間留置】${oldNo} は ${stName}駅で運用を終え、編成 ${t.vehicles.map(v => v.fullId).join("+")} は` +
                      `${stabledPlatformLabel(t)}で朝まで留置します (翌朝 ${stabledClock(leaveH)} 発の始発に充当)。`, "banner-blue");
    return true;
};

/** 番線名 (分からなければ「着発線」) */
function stabledPlatformLabel(t) {
    const blks = t.game.trackMgr.blocks[t.trackId];
    const b = blks ? blks[t.currBlockIndex] : null;
    const st = b ? blockStationName(b) : "";
    const e = (st && typeof stationLaneEntry === "function") ? stationLaneEntry(st, t.trackId, t.lane) : null;
    return (e && e.label) ? e.label + "番線" : "着発線";
}
/** 時 (小数) を「H:MM」に */
function stabledClock(h) {
    const m = Math.round(h * 60);
    return Math.floor(m / 60) % 24 + ":" + String(m % 60).padStart(2, "0");
}

/**
 * 留置している列車の見張り (js/11-train-core.js の update から毎Tick呼ぶ)。
 * 朝の始発の15分前に、列車番号・行先を付けて発車を待たせる。
 */
OperationsManager.prototype.stabledStep = function (t) {
    const g = this.game;
    const s = t.overnightStable;
    const now = g.currentTime;
    t.timer = Math.max(15, s.leaveAt - now);
    if (now < s.assignAt) return;
    const cfg = STATION_STABLING[s.st];
    if (!cfg) { t.overnightStable = null; t.remove(); return; }
    if (t.dir !== cfg.dir && !this.moveToOppositeTrack(t, s.st, cfg.dir)) {
        if (now < s.leaveAt + 1800) return;       // 番線が空くまで待つ。30分空かなければあきらめる
        t.overnightStable = null; t.remove(); return;
    }
    const dests = cfg.dest.slice();
    const first = dests.splice(Math.floor(Math.random() * Math.min(2, dests.length)), 1)[0];
    dests.unshift(first);
    const dest = dests.find(d => g.fleet.canServe(t.vehicles, s.st, cfg.as, t.trackId, d, null));
    if (!dest) { t.overnightStable = null; t.remove(); return; }
    const no = g.spawner.generateTrainNumber(cfg.as, cfg.dir, s.st, t.trackId, dest);
    t.overnightStable = null;
    t.type = cfg.as;
    t.dest = dest;
    t.trainNo = no;
    t.dutyName = no;
    g.spawner.activeTrainNos.add(no);
    t.startName = s.st;
    t.nextAction = "turnback";
    t.state = "waiting_start";
    t.timer = Math.max(60, Math.round((s.leaveAt - now) / 15) * 15);
    t.hasDeparted = false;
    t.hasStoppedAtCurrent = false;
    t.isFinalStop = false;
    t.delayTime = 0;
    t.stuckTime = 0;
    if (t.updateKoseiRoute) t.updateKoseiRoute();
    this.stats.stabledOut = (this.stats.stabledOut || 0) + 1;
    g.ui.updateBanner(`【始発】${s.st}駅で夜間留置していた編成 ${t.vehicles.map(v => v.fullId).join("+")} は、` +
                      `${no} ${cfg.as} ${dest}行き (${stabledClock((s.leaveAt / 3600) % 24)}発) として出発を待ちます。`, "banner-blue");
};

/**
 * 終電の近くに、留置する駅の駅止まりが足りなければ、先へ行く普通・快速を1本その駅止まりにする。
 * (OperationsManager.update から呼ぶ)
 */
OperationsManager.prototype.checkStationStabling = function (ct) {
    if (globalThis.__NO_STATION_STABLING) return;
    const a = ttAbsHour((ct / 3600) % 24);
    if (a < 23.0 || a >= 24.6) return;
    if (ct < (this.stableNext || 0)) return;
    this.stableNext = ct + 60;
    const g = this.game;
    for (const st in STATION_STABLING) {
        const cfg = STATION_STABLING[st];
        const end = stablingLineEnd(cfg.line);
        if (a < end - 0.95 || a >= end) continue;
        const inbound = g.trains.filter(t => t.state !== "finished" && t.state !== "in_depot" && !t.overnightStable &&
            stablingLineTrack(cfg.line, t.trackId) && t.dest === st && t.type !== "貨物").length;
        if (this.stabledAt(st).length + inbound >= cfg.max) continue;
        const key = "st#" + st;
        if (ct < (this[key] || 0)) continue;
        const cand = this.pickNightReturnTrain({ depot: st, dirs: [-cfg.dir], types: ["普通", "快速"], line: cfg.line });
        if (!cand) continue;
        const oldDest = cand.dest;
        cand.dest = st;
        cand.nextAction = "turnback";
        cand.stableTarget = st;
        cand.isFinalStop = false;
        this[key] = ct + 900;
        g.ui.updateBanner(`【夜間留置の手配】翌朝の始発に備え、${cand.trainNo} の行先を ${oldDest} から ${st} に変更し、` +
                          `${st}駅で朝まで留置します。`, "banner-blue");
    }
};

/* ------------------------------------------------------------------ 支障の手前での折り返し (利用者の指摘 ④ / 2026-10 の見込みの時間)

   ■ なぜ要るか
     以前は、見合わせ区間のすぐ手前の駅で7分以上止まった普通だけを、10%の確率で折り返していた。
     後ろから来る列車はそのまま支障の手前まで進み、駅間に並んで動けなくなっていた。
   ■ 見込みの時間を見る (2026-10 の利用者の指摘 ①)
     支障がすぐ解けるときまで、見えている列車をすべて折り返していた。解けたときには
     折り返し駅より先 (支障の向こう) を走る列車がほとんど無く、逆の向きに列車が偏って混雑していた。
     いまは支障ごとに「解けるまであと何分か」を見積もり (shortTurnRemain)、
       ・15分 (SHORT_TURN_MIN_SEC) より短い … 折り返さない (手前の駅で待たせるだけ)
       ・30分まで … 先に4本、60分まで … 3本、それより長い・分からない … 2本 を残す (shortTurnKeep)
       ・折り返し駅に着いて折り返すまでの時間が、解けるまでの時間より短い列車だけを折り返す。
         着くころには解けている列車は、そのまま支障の先へ行かせる
       ・支障が解けた、または見込みが短くなって折り返す意味が無くなったら、まだ折り返し駅に
         着いていない列車の行先を元に戻す (shortTurnRestore)
   ■ どうするか (1分ごと)
     ・支障 = 運転見合わせの区間 (指令・輸送障害) と、故障・抑止で20分以上動けない列車。
     ・支障の手前でいちばん近い「その向きで折り返せる駅」を折り返し駅にする。
     ・折り返し駅より先 (支障まで) に残す列車を keep 本まで数え、それを超えて後ろから来る列車を
       折り返し駅止まりにする。
     ・折り返せるのは、その駅に停まる普通・快速・新快速で、いまの編成でその区間の運用に入れるものだけ。 */
const SHORT_TURN_KEEP = 2;           // 長い (または見込みの分からない) 支障で、折り返し駅より先に残す本数
const SHORT_TURN_SCAN = 10;          // 折り返し駅を探す範囲 (駅数)
const SHORT_TURN_MIN_SEC = 900;      // これより早く解ける見込みなら折り返さない
const SHORT_TURN_TURN_SEC = 300;     // 折り返し駅での折り返しにかかる時間 (降車・方転)
const SHORT_TURN_UNKNOWN = 3 * 3600; // 見込みの分からない支障 (指令の手動の見合わせなど)

/** 解けるまでの見込みの秒数に応じて、折り返し駅より先に残す本数 */
function shortTurnKeep(remain) {
    if (remain <= 1800) return 4;
    if (remain <= 3600) return 3;
    return SHORT_TURN_KEEP;
}

/** 支障が解けるまでの見込み (秒)。輸送障害なら残りの時間、列車の故障なら処置の残り、分からなければ長いものとして扱う */
OperationsManager.prototype.shortTurnRemain = function (owner, train) {
    const g = this.game;
    const incs = (g.incidents && g.incidents.active) || [];
    if (owner === "comm") return 300;
    if (owner) {
        const inc = incs.find(i => i.id === owner);
        if (inc) return Math.max(0, inc.timer || 0) + (inc.staged ? 900 : 300);   // 解いたあとの順次解除・段階開通のぶん
    }
    if (train) {
        const ti = train.troubleInfo;
        if (ti && ti.incidentId) {
            const inc = incs.find(i => i.id === ti.incidentId);
            if (inc) return Math.max(0, inc.timer || 0) + 300;
        }
        if (train.minorTrouble) return Math.max(0, train.minorTroubleTimer || 0, (ti && ti.timer) || 0) + 120;
    }
    return SHORT_TURN_UNKNOWN;
};

OperationsManager.prototype.shortTurnZones = function () {
    const tm = this.game.trackMgr;
    const zones = [];
    for (const m of tm.manualSuspensions) zones.push({ trackId: m.trackId, start: m.start, end: m.end, why: "運転見合わせ",
        key: `m#${m.trackId}#${m.start}#${m.end}`, remain: this.shortTurnRemain(m.owner, null) });
    for (const tid in tm.suspendedSections) {
        for (const s of tm.suspendedSections[tid] || []) zones.push({ trackId: tid, start: s.start, end: s.end, why: "運転見合わせ",
            key: `s#${tid}#${s.start}#${s.end}`, remain: SHORT_TURN_UNKNOWN });
    }
    for (const t of this.game.trains) {
        if (t.state === "finished" || t.state === "in_depot" || t.overnightStable) continue;
        if (!(t.minorTrouble || t.isManuallySuspended || t.commIncident) || t.stuckTime < 1200) continue;
        zones.push({ trackId: t.trackId, start: t.currBlockIndex, end: t.currBlockIndex, why: `${t.trainNo} の長時間抑止`, by: t,
                     key: `t#${t.id}`, remain: this.shortTurnRemain(null, t) });
    }
    return zones;
};

/** 折り返し駅に着いて折り返し終わるまでの見込み (秒) */
function shortTurnEta(t, tbIndex) {
    const blocks = Math.max(0, (tbIndex - t.currBlockIndex) * t.dir);
    const run = BLOCK_RUN_SEC[t.type] || BLOCK_RUN_SEC["普通"];
    const wait = ["stopped", "holding", "waiting_start"].indexOf(t.state) >= 0 ? Math.max(0, t.timer || 0) : 0;
    return wait + blocks * run + Math.floor(blocks / UNITS_PER_STATION) * 40 + SHORT_TURN_TURN_SEC;
}

/** 折り返しをやめて元の行先に戻す (まだ折り返し駅に着いていない列車だけ) */
OperationsManager.prototype.shortTurnRestore = function (t, why) {
    const p = t.shortTurnPrev;
    if (!p || t.dest !== t.shortTurnAt || t.state === "turning_back") return false;
    const tbName = t.shortTurnAt;
    const tb = stationBlockOn(this.game, t.trackId, tbName);
    if (!tb || (tb.index - t.currBlockIndex) * t.dir <= 0) return false;          // もう着いている・過ぎた
    t.dest = p.dest;
    t.nextAction = p.nextAction;
    t.isFinalStop = p.isFinalStop;
    t.shortTurnAt = null;
    t.shortTurnPrev = null;
    t.shortTurnKey = null;
    this.stats.shortTurnRestored = (this.stats.shortTurnRestored || 0) + 1;
    this.game.ui.updateBanner(`【運転整理】${why}ため、${t.trainNo} の ${tbName}駅止まりを取り消し、もとの ${p.dest}行きに戻します。`, "banner-blue");
    if (this.game.records) this.game.records.noteDisposition(t, tbName, why, `${tbName}止まりを取り消し`);
    return true;
};

OperationsManager.prototype.checkShortTurns = function (ct) {
    if (ct < (this.shortTurnNext || 0)) return;
    this.shortTurnNext = ct + 60;
    if (globalThis.__NO_SHORT_TURN) return;
    const g = this.game;
    const zones = this.shortTurnZones();
    const zoneByKey = {};
    zones.forEach(z => { zoneByKey[z.key] = z; });
    // 解けた支障・すぐ解ける支障のために折り返す予定だった列車は、元の行先へ戻す
    for (const t of g.trains) {
        if (!t.shortTurnKey || t.state === "finished" || t.state === "in_depot") continue;
        const z = zoneByKey[t.shortTurnKey];
        if (!z) { this.shortTurnRestore(t, "支障が解けた"); continue; }
        const tb = stationBlockOn(g, t.trackId, t.shortTurnAt);
        if (z.remain < SHORT_TURN_MIN_SEC ||
            (tb && shortTurnEta(t, tb.index) > z.remain + 300)) this.shortTurnRestore(t, "折り返し駅に着くころには運転を再開できる見込みの");
    }
    if (!zones.length) return;
    const h = (ct / 3600) % 24;
    for (const z of zones) {
        if (z.remain < SHORT_TURN_MIN_SEC) continue;        // すぐ解ける。折り返さず、手前の駅で待つ
        const keep = shortTurnKeep(z.remain);
        const blks = g.trackMgr.blocks[z.trackId];
        if (!blks) continue;
        for (const dir of [1, -1]) {
            const edge = dir === 1 ? z.start : z.end;          // 支障の手前の端
            // 折り返し駅: 支障の手前で、その向きに着いて折り返せるいちばん近い駅
            let tb = null;
            for (let k = 1; k <= UNITS_PER_STATION * SHORT_TURN_SCAN; k++) {
                const b = blks[edge - dir * k];
                if (!b) break;
                if (b.x === -1000 || !isRealStationBlock(b)) continue;
                if (g.trackMgr.isSuspended(z.trackId, b.index)) continue;
                const nm = blockStationName(b);
                if (canReverseAtDir(nm, dir)) { tb = b; break; }
            }
            if (!tb) continue;
            const tbName = blockStationName(tb);
            // その線路を同じ向きに走る列車 (支障に近い順)
            const list = g.trains.filter(t => t !== z.by && t.trackId === z.trackId && t.dir === dir &&
                t.state !== "finished" && t.state !== "in_depot" && !t.overnightStable &&
                (edge - t.currBlockIndex) * dir >= 0 &&
                (edge - t.currBlockIndex) * dir <= UNITS_PER_STATION * (SHORT_TURN_SCAN + 8))
                .sort((a, b) => (edge - a.currBlockIndex) * dir - (edge - b.currBlockIndex) * dir);
            let kept = 0, changed = 0;
            for (const t of list) {
                const beyond = (t.currBlockIndex - tb.index) * dir > 0;   // もう折り返し駅を過ぎている
                if (beyond || t.currBlockIndex === tb.index) {
                    if (!t.shortTurnAt) kept++;
                    continue;
                }
                if (t.shortTurnAt === tbName || t.dest === tbName) continue;
                // 行先が折り返し駅より手前なら、もともと支障まで行かない
                const db = stationBlockOn(g, t.trackId, t.dest);
                if (db && (db.index - tb.index) * dir <= 0) continue;
                if (kept < keep) { kept++; continue; }
                // 折り返し駅に着くころには解けている見込みなら、そのまま先へ行かせる (これより後ろの列車も同じ)
                if (shortTurnEta(t, tb.index) > z.remain) break;
                if (changed >= 3) break;
                if (["普通", "快速", "新快速"].indexOf(t.type) < 0 || t.specialEvent || t.serviceChange) continue;
                if (t.isManuallySuspended || t.commIncident || t.state === "turning_back") continue;
                if (!t.passengerStopsAt(tbName)) continue;
                if (!ttInService(ttLineOf(t), h)) continue;
                if (!g.fleet.canServe(t.vehicles, tbName, t.type, t.trackId, tbName, t.dutyName)) continue;
                const oldDest = t.dest;
                t.shortTurnPrev = { dest: t.dest, nextAction: t.nextAction, isFinalStop: t.isFinalStop };
                t.dest = tbName;
                t.nextAction = "turnback";
                t.isFinalStop = false;
                t.shortTurnAt = tbName;
                t.shortTurnKey = z.key;
                changed++;
                this.stats.shortTurn = (this.stats.shortTurn || 0) + 1;
                const remTxt = z.remain >= SHORT_TURN_UNKNOWN ? "再開見込み未定" : `再開見込み 約${Math.ceil(z.remain / 60)}分後`;
                g.ui.updateBanner(`【運転整理】${z.why} (${remTxt}) のため、${t.trainNo} (${oldDest}行き) は ${tbName}駅止まりとし、` +
                                  `${tbName}で折り返します (支障の先へは ${keep}本を残して運転再開に備えます)。`, "banner-orange");
                if (g.records) g.records.noteDisposition(t, tbName, z.why, `${tbName}で折り返し`);
            }
        }
    }
};

/* ------------------------------------------------------------------ 待避・先行の先読み (利用者の指摘 ⑥)

   ■ なぜ要るか
     待避の判断 (js/13-train-hold.js の checkHold) は、発車の瞬間に「すぐ後ろに優等列車がいるか」を
     見るだけだった。駅が普通で埋まっていて後ろから優等列車が来ると、ぎりぎりまで誰も動かず、
     最後に「どれを出すか」を決めていた。
   ■ どうするか (毎Tick)
     優等列車 H ごとに前方6駅を見て、前を走る普通・快速 L との「追いつき」を所要時間で見積もる。
       ・L が待避できる駅 (2線以上ある駅) にいる
           次の待避駅まで逃げ切れる (H がその手前に来るより先に L が入れる) … 先行 (go)
           逃げ切れない、かつ ここに H の入る番線が残る                     … 待避 (yield)
       ・H が停まる・通る駅が L で満線になっていて、H があと4分以内に着く
           その駅で発車できる L を1本、先に出す (go)。H の番線を早めに空ける
       ・待避先の空き番線を予約として数え、2本の L が同じ駅の最後の1線を取り合わないようにする
     決めたことは ovPlans に置き、checkHold が見る。45秒で消えるので、状況が変われば次のTickで決め直す。 */
const OV_LOOK_STATIONS = 6;
const OV_FULL_ETA = 240;

OperationsManager.prototype.planOvertakes = function (ct) {
    if (globalThis.__NO_OV_PLAN) { this.ovPlans = null; return; }
    if (ct < (this.ovNext || 0)) return;
    this.ovNext = ct + CONFIG.TICK_SEC;
    const g = this.game;
    const plans = new Map();
    const reserved = {};                                   // 待避の予約 (線路#ブロック → 本数)
    const runOf = (t) => BLOCK_RUN_SEC[t.type] || BLOCK_RUN_SEC["普通"];
    const dwell = (t, b) => (isRealStationBlock(b) && t.passengerStopsAt(blockStationName(b)))
        ? ((STATIONS[b.stationIdx] && STATIONS[b.stationIdx].stopTime) || 45) : 0;
    const waitNow = (t) => (["stopped", "holding", "waiting_start"].indexOf(t.state) >= 0 ? Math.max(0, t.timer || 0) : 0);
    /* 待避できる駅は PASSING_STATIONS だけ。★2線あっても徳庵・放出のように追い抜きをしない駅では待避させない
       (以前は線の数だけで見ていたので、徳庵・放出で普通が快速を待ち、大きく遅れていた。利用者の指摘 ②) */
    const isRefuge = (b) => isRealStationBlock(b) && b.lanes.length >= 2 && PASSING_STATIONS.indexOf(blockStationName(b)) >= 0;
    const set = (t, act, st, by, force) => {
        const old = plans.get(t.id);
        if (old && old.force && !force) return;
        if (old && old.act === "yield" && act === "go" && !force) return;
        plans.set(t.id, { act: act, st: st, by: by, force: !!force, until: ct + 45 });
    };
    const active = (t) => t.state !== "finished" && t.state !== "in_depot" && !t.overnightStable;

    for (const H of g.trains) {
        if (!active(H) || H.type === "普通" || H.type === "貨物" || H.minorTrouble || H.isManuallySuspended) continue;
        /* 止まっている優等列車は待たない (★120秒 → 60秒。止まった優等列車を待つあいだ待避駅の番線がふさがり、
           ほかの優等列車まで入れなくなっていた。利用者の指摘 ③ 2026-10) */
        if (H.stuckTime > 60) continue;
        const pH = H.getPriority();
        const blks = g.trackMgr.blocks[H.trackId];
        if (!blks) continue;
        // H の前方の到着見込み (ブロック → 秒)
        const etaH = {};
        let tH = waitNow(H);
        const look = UNITS_PER_STATION * OV_LOOK_STATIONS;
        for (let k = 1; k <= look; k++) {
            const b = blks[H.currBlockIndex + H.dir * k];
            if (!b || b.x === -1000) break;
            tH += runOf(H);
            etaH[b.index] = tH;
            tH += dwell(H, b);
        }
        for (let k = 1; k <= look; k++) {
            const b = blks[H.currBlockIndex + H.dir * k];
            if (!b || b.x === -1000 || etaH[b.index] === undefined) break;
            const here = blockStationName(b);
            /* 1. H があと数分で着く駅が、待っている下位の列車で満線 → 1本を先に出す */
            if (isRealStationBlock(b) && b.lanes.every(x => x) && etaH[b.index] < OV_FULL_ETA) {
                const ready = b.lanes.filter(L => L && L !== H && L.dir === H.dir && L.getPriority() < pH &&
                    ["stopped", "holding", "waiting_start"].indexOf(L.state) >= 0 && L.hasStoppedAtCurrent !== false &&
                    !L.isManuallySuspended && !L.commIncident && !L.minorTrouble)
                    .sort((a, c) => (a.timer || 0) - (c.timer || 0) || (c.stuckTime || 0) - (a.stuckTime || 0));
                const nb = blks[b.index + H.dir];
                if (ready.length && nb && nb.x !== -1000 && !nb.lanes.every(x => x)) set(ready[0], "go", here, H.trainNo, true);
            }
            /* 2. 前を走る下位の列車との追いつき */
            for (const L of b.lanes) {
                if (!L || L === H || L.dir !== H.dir || !active(L)) continue;
                if (["普通", "快速"].indexOf(L.type) < 0 || L.getPriority() >= pH) continue;
                // 停車駅がほとんど同じなら格の差が無いものとして扱う (js/38c-dispatch-rules.js。利用者の指摘 ③)
                if (typeof stopPatternSimilar === "function" && stopPatternSimilar(L, H)) continue;
                // 西明石より西の複線では回送を先に通さない (overtakeWorthWaiting と同じ)
                if (H.type === "回送" && westDoubleTrack(L, here)) continue;
                if (!isRefuge(b) || ["stopped", "holding", "waiting_start"].indexOf(L.state) < 0) continue;
                // L が次の待避駅 (または行先) に入るまでの見込み
                let tL = waitNow(L), refuge = null;
                for (let j = 1; j <= UNITS_PER_STATION * 10; j++) {
                    const c = blks[b.index + L.dir * j];
                    if (!c || c.x === -1000) break;
                    tL += runOf(L);
                    if (isRealStationBlock(c) && (blockStationName(c) === L.dest || isRefuge(c))) { refuge = c; break; }
                    tL += dwell(L, c);
                }
                if (!refuge) continue;
                // H が待避駅の1つ手前の閉塞に来る見込み (前方の見込みの外なら、H の走行時間で延ばす)
                const before = refuge.index - L.dir;
                const tHb = (etaH[before] !== undefined) ? etaH[before]
                    : tH + Math.abs(before - (H.currBlockIndex + H.dir * look)) * runOf(H);
                const destReached = blockStationName(refuge) === L.dest;
                const key = L.trackId + "#" + refuge.index;
                const refugeFree = refuge.lanes.filter(x => !x).length - (reserved[key] || 0);
                /* 逃げ切れる … 次の待避駅に H より先に入れ、そこに H の番線も残る。
                   ★H がまだ十分遠い (4分以上の余裕) なら、次の待避駅の空きは1線でよい
                   (以前は2線を求めたので、加古川が1線ふさがっているだけで、遠くの新快速を大久保で長く待っていた) */
                const margin = tHb - (tL + runOf(H));
                if (margin > 0 && (destReached || refugeFree >= 2 || (refugeFree >= 1 && margin > 240))) {
                    set(L, "go", here, H.trainNo, false);        // 逃げ切れる
                    if (!destReached) reserved[key] = (reserved[key] || 0) + 1;
                } else if (b.lanes.some(x => !x) || H.currBlockIndex === b.index) {
                    set(L, "yield", here, H.trainNo, false);     // ここで待避 (H の番線は残っている)
                } else {
                    set(L, "go", here, H.trainNo, true);         // 満線で待てない。先に出して番線を空ける
                }
            }
        }
    }
    this.ovPlans = plans;
};

/** checkHold から呼ぶ。その駅でのこの列車の決定 ("go" / "yield" / null) */
OperationsManager.prototype.overtakePlanFor = function (t, stName) {
    const p = this.ovPlans && this.ovPlans.get(t.id);
    if (!p || p.st !== stName || this.game.currentTime > p.until) return null;
    if (p.act === "yield" && t.stuckTime >= 480) return null;    // 待ちすぎない (これまでの上限と同じ)
    return p.act;
};
