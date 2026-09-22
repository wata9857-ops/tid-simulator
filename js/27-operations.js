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
        { h: [16.0, 22.0], every: 2400, dir: -1, via: "京都", as: "普通", dest: ["西明石", "高槻"], ratio: 0.9 }
    ]},
    /* --- 尼崎駅 電留線 (配線略図 スクリーンショット(709).png)
           本線・JR宝塚線・JR東西線が集まる駅。
           神戸線の下りと、JR東西線の始発を受け持つ。 */
    { depot: "尼崎", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: -1, via: "尼崎", as: "普通", dest: ["西明石", "須磨"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2400, dir: 1,  via: "尼崎", as: "普通", dest: ["放出", "京橋"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 2400, dir: -1, via: "尼崎", as: "普通", dest: ["西明石"], ratio: 0.8 },
        { h: [9.0, 16.0], every: 2700, dir: 1,  via: "尼崎", as: "普通", dest: ["放出"], ratio: 0.8 },
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
    { depot: "放出", windows: [
        { h: [4.5, 9.0],  every: 1500, dir: -1, via: "放出", as: "普通", dest: ["西明石", "尼崎"], ratio: 1.0 },
        /* ★JR東西線の快速 (学研都市線からの直通) の枠を足した。
             京橋駅の時刻表では 快速系4本/時。放出からの出区が普通だけ
             だったため、東西線の快速が 1本/時 しか走っていなかった。 */
        { h: [4.5, 9.0],  every: 2400, dir: -1, via: "放出", as: "快速", dest: ["尼崎", "宝塚"], ratio: 0.9 },
        /* ★昼間の出区は、列車生成 (js/09-spawner-branch.js) が
             放出始発の快速・普通を出しているので、ここでは出さない。
             両方から出すと放出の在庫が尽きて、かえって本数が落ちる。 */
        { h: [16.0, 22.0], every: 2400, dir: -1, via: "放出", as: "普通", dest: ["尼崎", "西明石"], ratio: 0.8 },
        { h: [16.0, 22.0], every: 2700, dir: -1, via: "放出", as: "快速", dest: ["尼崎"], ratio: 0.8 }
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
    // --- 姫路電留線
    { depot: "姫路", windows: [
        { h: [4.5, 9.0],  every: 1800, dir: 1, via: "姫路", as: "普通", dest: ["西明石", "大阪"], ratio: 1.0 },
        { h: [16.0, 22.0], every: 3000, dir: 1, via: "姫路", as: "普通", dest: ["西明石"], ratio: 0.7 }
    ]}
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
    deadheadNo(suffix) {
        this.deadheadSeq += 2;
        if (this.deadheadSeq > 9990) this.deadheadSeq = 1000;
        return "回" + this.deadheadSeq + (suffix || "M");
    }

    /** 重み付けのない候補から1つ選ぶ */
    pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    update(ct) {
        if (this.game.isEmergency) return;
        this.checkDepotDuties(ct);
        this.checkLocalGapFill(ct);
        this.checkStockBalance(ct);
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
        const short = FLEET_BASES
            .filter(b => fleet.pools[b.name] && DEPOTS[b.name])
            .map(b => ({ name: b.name, n: fleet.pools[b.name].length, groups: b.groups }))
            .filter(b => b.n <= 2)
            .sort((a, b) => a.n - b.n);
        if (!short.length) return;

        for (const to of short) {
            const dep = DEPOTS[to.name];
            if (!dep || dep.trains.length >= dep.capacity) continue;
            // その編成を受け入れられる、いちばん近い「余っている」留置場
            const toIdx = fleetIndexOf(to.name);
            const from = FLEET_BASES
                .filter(b => fleet.pools[b.name] && fleet.pools[b.name].length >= 5)
                .filter(b => b.groups.some(g => to.groups.indexOf(g) >= 0))
                .filter(b => fleetIndexOf(b.name) !== toIdx)
                .sort((a, b) => Math.abs(fleetIndexOf(a.name) - toIdx) -
                                Math.abs(fleetIndexOf(b.name) - toIdx))[0];
            if (!from) continue;

            /* 送る編成は、送り先の線区で使えるものを選ぶ。
               放出なら 207系/321系 (JR東西線の規則) になる。 */
            const dir = this.dirFromTo(from.name, to.name);
            const no = this.deadheadNo();
            const vs = fleet.assign(from.name, "回送",
                                    depotTrackId(from.name, dir, "回送"),
                                    to.name, no, { noBorrow: true });
            if (!vs || !vs.length) continue;
            /* 送り先の線区の運用に入れない編成を送っても意味がないので確かめる。
               (東西線に223系を送っても使えない) */
            if (!fleet.canServe(vs, to.name, "普通",
                                depotTrackId(to.name, 1, "普通"), to.name)) {
                fleet.release(from.name, vs);
                continue;
            }
            const ok = this.game.addTrain({
                type: "回送", dir: dir,
                trackId: depotTrackId(from.name, dir, "回送"),
                dest: to.name, startName: from.name,
                name: no, dutyName: no, vehicles: vs, nextAction: "depot"
            });
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
    checkDepotDuties(ct) {
        const h = (ct / 3600) % 24;
        for (const duty of DEPOT_DUTIES) {
            const depot = DEPOTS[duty.depot];
            if (!depot) continue;
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
                if (depot.trains.length >= depot.capacity) continue;
                // 在庫が無いときも見送る
                if (this.game.fleet.poolAt(duty.depot).length < 2) continue;
                this.dispatchFromDepot(duty.depot, w);
            }
        }
    }

    /** 1本、車両所から出す */
    dispatchFromDepot(depotName, w) {
        const dest = Array.isArray(w.dest) ? this.pick(w.dest) : w.dest;
        const via = w.via || depotName;
        const serviceNo = this.game.spawner.generateTrainNumber(
            w.as, w.dir, via, w.dir === 1 ? "Up_In" : "Down_In");

        /* ★車両は「出区してすぐ入る営業運用」の条件で選ぶ。
           回送の条件で選ぶと、例えば向日町操から京都へ送り込む回送に
           京都支所の221系が付いてしまい、京都で本線の普通に変わるときに
           わざわざ差し替えることになっていた。 */
        const serviceTrack = (w.dir === 1 ? "Up_In" : "Down_In");
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
                    dest: via, startName: depotName, name: this.deadheadNo(),
                    dutyName: serviceNo,
                    serviceChange: { at: via, type: w.as, dest: dest, name: serviceNo } };
        }

        cfg.vehicles = vs;
        if (this.game.addTrain(cfg)) {
            this.stats.depotOut++;
            return true;
        }
        // 生成できなかったら車両を留置場へ戻す
        this.game.fleet.release(depotName, vs);
        return false;
    }

    /** a から b へ向かう向き */
    dirFromTo(a, b) {
        const ia = fleetIndexOf(a), ib = fleetIndexOf(b);
        if (ia === null || ib === null || ia === ib) return 1;
        return (ib > ia) ? 1 : -1;
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
        if (!depot || depot.trains.length >= depot.capacity) return false;
        if (this.game.fleet.poolAt(fromName).length < 2) return false;

        const dir = this.dirFromTo(fromName, config.startName);
        const serviceNo = config.name ||
            this.game.spawner.generateTrainNumber(config.type, config.dir, config.startName, config.trackId);

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

        const ok = this.game.addTrain({
            type: "回送", dir: dir,
            trackId: depotTrackId(fromName, dir, "回送"),
            dest: config.startName, startName: fromName,
            name: this.deadheadNo(), dutyName: serviceNo,
            vehicles: vs,
            serviceChange: { at: config.startName, type: config.type,
                             dest: config.dest, name: serviceNo }
        });
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
    railInStock(config) {
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
        if (depot && depot.trains.length >= depot.capacity) return false;

        const serviceNo = config.name || this.game.spawner.generateTrainNumber(
            config.type, config.dir, startName, config.trackId);
        const vs = fleet.assign(from, config.type, config.trackId, config.dest,
                                serviceNo, { noBorrow: true });
        if (!vs || !vs.length) return false;

        const dir = this.dirFromTo(from, startName);
        const ok = this.game.addTrain({
            type: "回送", dir: dir,
            trackId: depotTrackId(from, dir, "回送"),
            dest: startName, startName: from,
            name: this.deadheadNo(), dutyName: serviceNo,
            vehicles: vs,
            serviceChange: { at: startName, type: config.type,
                             dest: config.dest, name: serviceNo }
        });
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
                 5.4駅まで開いても増発できなかった。 */
            { trackId: "Tozai_Down",   dir: -1, from: "放出",  to: "尼崎",
              depots: ["放出"], dest: "尼崎" },
            { trackId: "Tozai_Up",     dir: 1,  from: "尼崎",  to: "放出",
              depots: ["放出"], dest: "放出" },
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
            let worst = 0;
            for (let k = 1; k < occupied.length; k++) {
                worst = Math.max(worst, occupied[k] - occupied[k - 1]);
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
                if (!depot || depot.trains.length >= depot.capacity) continue;
                if (this.game.fleet.poolAt(dname).length < 2) continue;
                /* ★車両を出す車両所が本線のものなら、本線の目安も見る。
                   分岐線の穴埋めのために本線の車両所から次々に出すと、
                   本線 (とくにJR神戸線) の列車が薄くなる。 */
                const dLine = (dname === "放出") ? "tozai"
                            : (dname === "新三田") ? "fukuchi" : "main";
                if (dLine === "main" && ttOverBudget(this.game, "main", "普通")) continue;
                const dest = sc.dest;
                if (this.dirFromTo(dname, dest) !== sc.dir) continue;
                const no = this.game.spawner.generateTrainNumber("普通", sc.dir, dname, sc.trackId);
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
        train.trainNo = this.deadheadNo();
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
            if (onTozai && name !== "放出") continue;
            if (onFukuchi && name !== "新三田") continue;
            if (onKosei) continue;                       // 湖西線内に車両所は置いていない
            if (!onTozai && !onFukuchi && (name === "放出" || name === "新三田")) continue;
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
    const lane = train.findFreeLane(newB, newTrackId);
    if (lane === -1) return false;

    blk.lanes[train.lane] = null;
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

    // 深夜は入区させる (折り返しても走る先が無い)
    if (h >= 22.0 || h < 4.5) return false;
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
    if (!canReverseAt(stName)) return false;

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
    if (!inPlace) {
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
    let nextDest = this.game.spawner.getDestination(train.type, newDir, stName, newTrackId);
    if (nextDest === stName) nextDest = this.game.spawner.fallbackTerminal(newDir, stName, newTrackId);

    // いまの編成でその運用に入れるかを確かめ、駄目なら差し替える
    const nextNo = this.game.spawner.generateTrainNumber(train.type, newDir, stName, newTrackId);
    const vs = this.game.fleet.reassign(stName, train.type, newTrackId, nextDest, nextNo, train.vehicles);
    if (!vs || !vs.length) return false;
    train.vehicles = vs;

    if (inPlace) {
        // 到着した番線のまま。反対方向の線路へ入るのは発車のとき。
        train.dir = newDir;
        train.turnbackTrack = newTrackId;
    } else {
        // 本線から外して折り返し先へ (渡り線の無い駅。実際の入換にあたる)
        const at = blk.lanes.indexOf(train);
        if (at >= 0) blk.lanes[at] = null; else blk.lanes[train.lane] = null;
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
    train.timer = 15;
    train.stuckTime = 0;
    train.hasStoppedAtCurrent = false;
    train.hasDeparted = false;
    train.isFinalStop = false;
    train.carryOverDelay(180);   // 折り返しの余裕分だけ回復し、残りは持ち越す
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
