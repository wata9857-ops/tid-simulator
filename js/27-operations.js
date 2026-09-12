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
        { h: [4.5, 9.0],  every: 1500, dir: 1, via: "大阪", as: "普通", dest: ["高槻", "京都"], ratio: 1.0 },
        { h: [4.5, 9.0],  every: 2700, dir: -1, via: "大阪", as: "普通", dest: ["西明石"], ratio: 0.9 },
        { h: [9.0, 16.0], every: 3600, dir: 1, via: "大阪", as: "普通", dest: ["高槻", "京都"], ratio: 0.6 },
        { h: [16.0, 21.5], every: 1800, dir: 1, via: "大阪", as: "普通", dest: ["高槻", "京都"], ratio: 1.0 },
        { h: [16.0, 21.5], every: 2400, dir: -1, via: "大阪", as: "普通", dest: ["西明石", "須磨"], ratio: 0.9 },
        // JR宝塚線の丹波路快速・普通 (宮原の223系/225系6000番台)
        { h: [5.0, 9.0],  every: 2400, dir: -1, via: "尼崎", as: "快速", dest: ["新三田", "篠山口"], ratio: 0.9 },
        { h: [16.0, 21.5], every: 2400, dir: -1, via: "尼崎", as: "快速", dest: ["新三田", "篠山口"], ratio: 0.9 }
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
        { h: [16.0, 22.0], every: 2400, dir: -1, via: "放出", as: "普通", dest: ["尼崎", "西明石"], ratio: 0.8 }
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
        const vs = this.game.fleet.assign(depotName, w.as, serviceTrack, dest, serviceNo);
        if (!vs || !vs.length) return false;

        // 車両所と始発駅が同じなら、送り込み回送は要らない
        const sameSpot = (via === depotName);
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
        const back = ORIGIN_BACKING[config.startName];
        if (!back) return false;
        if (config.type === "貨物" || config.type === "特急" || config.type === "回送") return false;
        if (config.serviceChange) return false;           // 二重に付けない
        if (Math.random() > back.ratio) return false;
        if (DEPOTS[config.startName]) return false;       // その駅に留置場があるなら不要

        const depot = DEPOTS[back.from];
        if (!depot || depot.trains.length >= depot.capacity) return false;
        if (this.game.fleet.poolAt(back.from).length < 2) return false;

        const dir = this.dirFromTo(back.from, config.startName);
        const serviceNo = config.name ||
            this.game.spawner.generateTrainNumber(config.type, config.dir, config.startName, config.trackId);

        const ok = this.game.addTrain({
            type: "回送", dir: dir,
            trackId: depotTrackId(back.from, dir, "回送"),
            dest: config.startName, startName: back.from,
            name: this.deadheadNo(), dutyName: serviceNo,
            serviceChange: { at: config.startName, type: config.type,
                             dest: config.dest, name: serviceNo }
        });
        if (ok) this.stats.backing++;
        return ok;
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

        const MAX_GAP_STATIONS = 3.0;             // これ以上空いたら増発
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
            // JR東西線 (尼崎〜放出)
            { trackId: "Tozai_Down",   dir: -1, from: "放出",  to: "尼崎",
              depots: ["放出"], dest: "尼崎" }
        ];

        for (const sc of scan) {
            const blks = this.game.trackMgr.blocks[sc.trackId];
            if (!blks) continue;
            const a = blks.find(b => b.stationIdx === STATION_MAP[sc.from]);
            const z = blks.find(b => b.stationIdx === STATION_MAP[sc.to]);
            if (!a || !z) continue;
            const lo = Math.min(a.index, z.index), hi = Math.max(a.index, z.index);

            // 同じ向きの普通・快速がいるブロックを集める
            const occupied = [];
            for (let i = lo; i <= hi; i++) {
                if (blks[i].lanes.some(l => l && l.dir === sc.dir && ["普通", "快速"].includes(l.type))) {
                    occupied.push(i);
                }
            }
            // 進行方向の後ろ側から見て、最初に空きすぎている所を探す
            const gapBlocks = Math.ceil(UNITS_PER_STATION * MAX_GAP_STATIONS);
            let worst = 0;
            for (let k = 1; k < occupied.length; k++) {
                worst = Math.max(worst, occupied[k] - occupied[k - 1]);
            }
            if (occupied.length === 0) worst = hi - lo;
            if (worst <= gapBlocks) continue;

            // 手前の車両所から1本出す
            for (const dname of sc.depots) {
                const depot = DEPOTS[dname];
                if (!depot || depot.trains.length >= depot.capacity) continue;
                if (this.game.fleet.poolAt(dname).length < 2) continue;
                const dest = sc.dest;
                if (this.dirFromTo(dname, dest) !== sc.dir) continue;
                const no = this.game.spawner.generateTrainNumber("普通", sc.dir, dname, sc.trackId);
                // 車両は行先の運用の条件で選ぶ (東西線なら207系/321系 など)
                const vs = this.game.fleet.assign(dname, "普通", sc.trackId, dest, no);
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
                        `【運転整理】${sc.dir === 1 ? "上り" : "下り"}内側線の列車間隔が開いたため、` +
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

        this.game.spawner.activeTrainNos.delete(train.trainNo);
        const oldNo = train.trainNo;
        train.type = "回送";
        train.trainNo = this.deadheadNo();
        train.dutyName = train.trainNo;
        this.game.spawner.activeTrainNos.add(train.trainNo);
        train.dest = target.name;
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
            // 東西線・宝塚線の列車は本線の車両所へは回送できない
            const onBranch = train.trackId.indexOf("Tozai") === 0 || train.trackId.indexOf("Fukuchi") === 0;
            if (onBranch && name !== "放出" && name !== "宮原操") continue;
            if (!onBranch && name === "放出") continue;
            cands.push({ name: name, idx: idx, ahead: (idx - hereIdx) * train.dir > 0 });
        }
        if (!cands.length) return null;
        const ahead = cands.filter(c => c.ahead)
            .sort((a, b) => Math.abs(a.idx - hereIdx) - Math.abs(b.idx - hereIdx));
        if (ahead.length) return ahead[0];
        cands.sort((a, b) => Math.abs(a.idx - hereIdx) - Math.abs(b.idx - hereIdx));
        return cands[0];
    }
}

/* ------------------------------------------------------------------ 折り返し優先
   終点に着いた列車は、まず「その場で折り返して次の列車になる」ことを試す。
   実際の運用でも、京都・高槻・西明石などに着いた列車の大半は
   すぐ折り返して次の運用に入り、車両所へ戻るのは運用の最後だけ。
*/
OperationsManager.prototype.preferTurnback = function (train, stName) {
    const h = (this.game.currentTime / 3600) % 24;

    // 深夜は入区させる (折り返しても走る先が無い)
    if (h >= 22.0 || h < 4.5) return false;
    // 大きく遅れている列車は運用を切って車両所へ戻す
    if (train.delayTime > 1800) return false;
    // 回送・貨物・特急はここでは扱わない
    if (["回送", "貨物", "特急"].includes(train.type)) return false;

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
    const targetBlks = this.game.trackMgr.blocks[newTrackId];
    if (!targetBlks) return false;
    const newB = targetBlks.find(b => Math.abs(b.x - blk.x) < 5 && b.x !== -1000);
    if (!newB) return false;

    /* 折り返し先の番線が空いていなければ、少し待ってから試し直す。
       実際にも、到着した列車は反対方向のホームが空くのを待って折り返す。
       何度待っても空かないときだけ車両所へ回送する。 */
    const lane = train.findFreeLane(newB);
    if (lane === -1) {
        train.turnbackWait = (train.turnbackWait || 0) + 1;
        if (train.turnbackWait <= 5) { train.timer = 60; return true; }
        train.turnbackWait = 0;
        return false;
    }
    train.turnbackWait = 0;

    // 折り返した先の行先を決める
    let nextDest = this.game.spawner.getDestination(train.type, newDir, stName);
    if (nextDest === stName) nextDest = this.game.spawner.fallbackTerminal(newDir, stName);

    // いまの編成でその運用に入れるかを確かめ、駄目なら差し替える
    const nextNo = this.game.spawner.generateTrainNumber(train.type, newDir, stName, newTrackId);
    const vs = this.game.fleet.reassign(stName, train.type, newTrackId, nextDest, nextNo, train.vehicles);
    if (!vs || !vs.length) return false;
    train.vehicles = vs;

    // 本線から外して折り返し先へ
    blk.lanes[train.lane] = null;
    train.trackId = newTrackId;
    train.dir = newDir;
    train.currBlockIndex = newB.index;
    train.lane = lane;
    newB.lanes[lane] = train;

    this.game.spawner.activeTrainNos.delete(train.trainNo);
    train.trainNo = nextNo;
    train.dutyName = nextNo;
    this.game.spawner.activeTrainNos.add(nextNo);
    train.startName = stName;
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
