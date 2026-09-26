/* このファイルは index.html から分割されたものです。
   Train: 消滅・入区・出区処理 */
Train.prototype.remove = function () {
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (blks && blks[this.currBlockIndex] && this.lane >= 0) {
            freeOwnLane(blks[this.currBlockIndex].lanes, this);
        }
        // ★修正: state が in_depot のときだけ外していたため、留置場リストに
        //        残ったまま消滅する列車があった。状態に関わらず必ず外す。
        depotRemove(this);
        
        let stName = this.dest;
        let currBlk = blks ? blks[this.currBlockIndex] : null;
        if (currBlk && (currBlk.isStation || currBlk.hoppoStationName)) {
            stName = currBlk.hoppoStationName || STATIONS[currBlk.stationIdx].name;
        }

        // ★修正: 以前は「駅インデックスが近い留置場」へ機械的に返していたため、
        //        東西線の207系が高槻へ、宝塚線の車両が西明石へ流れ込むなど、
        //        その車両を使う運用が無い留置場に溜まって在庫切れを起こしていた。
        //        車両所グループごとに滞泊できる留置場へ返すようFleetManagerに任せる。
        this.game.fleet.release(stName, this.vehicles);
        this.vehicles = [];

        this.state = "finished";
        this.game.spawner.activeTrainNos.delete(this.trainNo);
};

Train.prototype.enterDepot = function (stName) {
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (blks && blks[this.currBlockIndex] && this.lane >= 0) {
            freeOwnLane(blks[this.currBlockIndex].lanes, this);
        }
        
        this.game.fleet.release(stName, this.vehicles);
        this.vehicles = [];

        this.state = "in_depot";
        this.startName = stName;
        this.timer = -1; 
        this.depotOutConfig = null;
        let oldNo = this.trainNo;
        this.type = "回送";
        this.trainNo = "";
        this.dutyName = "";     // 前の運用の名前を持ち越さない
        depotAdd(stName, this);   // ★二重登録を防ぐためヘルパー経由にする
        this.game.spawner.activeTrainNos.delete(oldNo);
        this.game.ui.updateBanner(`【入区】${oldNo} は ${stName}留置場に入区し、待機状態に入りました。`, "banner-orange");
};

/**
 * 貨物ターミナルに着いた貨物列車の、荷役・機回し・次の列車への付け替え。
 *
 * 着発線 (js/03-stations.js の FREIGHT_TERMINALS) に止まったまま、
 * ターミナルごとの時間 (dwell) を過ごし、次の貨物列車として発車する。
 *   機関車開放 → 機回し → 荷役 (E&S 着発線荷役) → 機関車連結 → ブレーキ試験 → 出発待ち
 * 半分は機回しをして来た方向へ戻り (反対方向の着発線へ移る)、半分はそのまま先へ進む。
 * 反対方向の着発線が空いていないときは、そのまま先へ進む。
 * 夜中 (0〜4時台) に着いた列車は、4割が朝まで着発線に留置される。
 */
Train.prototype.freightTerminalWork = function (stName) {
    const g = this.game;
    const key = freightTerminalAt(stName) || freightTerminalOfTrack(this.trackId) || this.dest;
    const ft = FREIGHT_TERMINALS[key] || { name: stName, dwell: [1800, 3600] };
    let dwell = ft.dwell[0] + Math.random() * (ft.dwell[1] - ft.dwell[0]);
    const h = (g.currentTime / 3600) % 24;
    let stabled = false;
    if (h < 4.5 && Math.random() < 0.4) {
        // 朝 5〜6時台の発車まで留置
        dwell = Math.max(dwell, (5 - h) * 3600 + Math.random() * 3600);
        stabled = true;
    }
    let newDir = (Math.random() < 0.5) ? -this.dir : this.dir;
    if (newDir !== this.dir) {
        // 機回しをして反対方向の着発線から出る
        const opp = isFreightTerminalTrack(this.trackId) ? freightTerminalTrack(key, newDir)
            : (this.trackId.indexOf("Hoppo") >= 0
                ? (newDir === 1 ? "Up_Hoppo" : "Down_Hoppo")
                : (newDir === 1 ? "Up_Out" : "Down_Out"));
        const ob = g.trackMgr.blocks[opp];
        const nb = ob ? ob[this.currBlockIndex] : null;
        const blks = g.trackMgr.blocks[this.trackId];
        const cb = blks ? blks[this.currBlockIndex] : null;
        let lane = -1;
        if (nb && nb.x !== -1000) {
            for (let l = nb.lanes.length - 1; l >= 0; l--) if (nb.lanes[l] === null) { lane = l; break; }
        }
        if (lane >= 0 && cb) {
            freeOwnLane(cb.lanes, this);
            this.trackId = opp; this.dir = newDir; this.lane = lane;
            nb.lanes[lane] = this;
            this.turnbackTrack = null;
        } else {
            newDir = this.dir;
        }
    }
    const oldNo = this.trainNo;
    g.spawner.activeTrainNos.delete(this.trainNo);
    this.dest = g.spawner.freightDestFrom(key, newDir);
    this.trainNo = g.spawner.generateTrainNumber("貨物", newDir, key, this.trackId);
    this.dutyName = this.trainNo;
    this.startName = key;
    this.nextAction = "depot";
    this.isFinalStop = false;
    this.hasStoppedAtCurrent = false;
    this.hasDeparted = false;
    this.delayTime = 0;
    this.state = "waiting_start";
    this.timer = Math.round(dwell);
    this.terminalWork = { key: key, kind: "turn", start: g.currentTime, until: g.currentTime + this.timer, stabled: stabled };
    this.syncFreightTerminalExit();
    g.freightStats = g.freightStats || { arrivals: {}, departures: {} };
    g.freightStats.arrivals[key] = (g.freightStats.arrivals[key] || 0) + 1;
    g.ui.updateBanner(
        `【貨物】${oldNo} は${ft.name}の${platformOrLane(this)}に到着。` +
        (stabled ? `朝まで着発線に留置し、` : `荷役・機回しのあと、約${Math.round(dwell / 60)}分後に `) +
        `${this.trainNo} (${this.dest}行き) として発車します。`, "banner-blue");
};

/** 着発線の番線名 (無ければ「着発線」) */
function platformOrLane(t) {
    return (isFreightTerminalTrack(t.trackId) && freightTerminalLaneLabel(t.trackId, t.lane)) || "着発線";
}

    // ★追加: 留置場からの出区を試行するメソッド
Train.prototype.tryDepotOut = function (depotName, force = false) {
        /* ★留置場の名前は別名で渡ってくることがある (網干=姫路電留線 など)。
           以前はここで DEPOTS["網干"] が見つからずそのまま返っていたため、
           姫路電留線に入った編成が出区できないまま枠を占め続けていた。 */
        const depot = DEPOTS[depotKeyOf(depotName)];
        if (!depot) return;
        
        // ★改善: 強制出区フラグの永続化
        if (force) this.forceDepotOut = true;
        let isForced = this.forceDepotOut || false;

        let actualStart = depotName;
        // (姫路より西・学研都市線は線路図の中の駅になったので読み替えない)

        // ★修正: 宮原操・向日町操等のインデックスを明示的に補完し、不正なトラック置換を防ぐ
        let tempStIdx = STATION_MAP[actualStart];
        if (actualStart === "宮原操") tempStIdx = STATION_MAP["新大阪"];
        if (actualStart === "向日町操") tempStIdx = STATION_MAP["向日町操"];
        const startStIdx = tempStIdx !== undefined ? tempStIdx : (this.depotOutConfig.dir===1?0:(STATIONS.length-1));
        
        /* ★出区する線路は留置場が面している線区から決める (js/04-depots.js)。
           放出のように本線以外に面した留置場があるため、
           一律に本線を使うと出区できずに列車が消えてしまう。 */
        let targetTrackId = depotTrackId(actualStart, this.depotOutConfig.dir, this.depotOutConfig.type);

        /* ★いつもの線路の番線が塞がっているときは、同じ駅の
           内側線・外側線のもう一方から出す。
           高槻の電留線のように、面している番線が2本しかない留置場では、
           片方だけを見ていると一日中出区できないままになっていた。
           (向日町操・宮原操のように駅名で番線を持たない留置場では
            どちらも見つからないので、この切り替えは働かない) */
        const hasFreeLaneAt = (tid) => {
            const bs = this.game.trackMgr.blocks[tid];
            if (!bs) return false;
            const b = bs.find(x => x.isStation && x.x !== -1000 &&
                                   STATIONS[x.stationIdx].name === actualStart);
            return !!(b && b.lanes.some(l => l === null));
        };
        /* ★内側線があるのは複々線 (西明石〜草津) の中だけ。
           野洲・米原のように複線の駅で内側線へ移すと、
           線路図に無い線路を走ることになるので切り替えない。 */
        const stIdx2 = STATION_MAP[actualStart];
        const hasInnerHere = stIdx2 !== undefined &&
            stIdx2 >= STATION_MAP["西明石"] && stIdx2 <= STATION_MAP["草津"];
        const siblingTrackId = !hasInnerHere ? null :
            targetTrackId.indexOf("_In") >= 0  ? targetTrackId.replace("_In", "_Out") :
            targetTrackId.indexOf("_Out") >= 0 ? targetTrackId.replace("_Out", "_In") : null;
        if (siblingTrackId && !hasFreeLaneAt(targetTrackId) && hasFreeLaneAt(siblingTrackId)) {
            targetTrackId = siblingTrackId;
        }

        const blks = this.game.trackMgr.blocks[targetTrackId];
        if (!blks) {
            // ブロックが見つからない異常事態は強制消滅させて枠を空ける
            this.remove();
            return;
        }

        let startBlock = blks.find(b => b.isStation && STATIONS[b.stationIdx].name === actualStart);
        if (!startBlock) startBlock = blks.find(b => b.hoppoStationName === actualStart);
        if (!startBlock && ["向日町操", "宮原操"].includes(actualStart)) {
            // 宮原操は新大阪の位置で本線につながる (北方貨物線に出ない旅客の出区)
            if (actualStart === "宮原操") startBlock = blks.find(b => b.stationIdx === STATION_MAP["新大阪"]);
            else startBlock = blks.find(b => b.hoppoStationName === "向日町操");
        }

        if (startBlock) {
            let freeLane = -1;
            let lanes = startBlock.lanes;
            if (actualStart === "向日町操") { for(let l=lanes.length-1; l>=0; l--) if(lanes[l]===null) { freeLane=l; break; } }
            else {
                // 進路のつながっている番線から選ぶ (js/13-train-hold.js)
                freeLane = pickRouteLane(startBlock, actualStart, targetTrackId, "depart",
                                         this.depotOutConfig.type,
                                         (this.game.currentTime / 3600) % 24, false);
            }

            // ★追加: 満線(freeLane === -1)の場合のスタック時間加算
            if (this.depotStuckTime === undefined) this.depotStuckTime = 0;

            if (freeLane !== -1) {
                // 出区時に後続列車(本線上)が接近していないか確認し、謎の抑止バグを防ぐ
                let safeToOut = true;
                /* 後続列車との間隔。待たされるほど詰めていく。
                   ★以前は常に3駅ぶんを空けて待っていたため、
                     高槻のように列車の詰まった線区に面した留置場では
                     切れ目ができず、編成が半日出区できないままになっていた。
                     実際の指令も、続行の切れ目が無いときは間隔を詰めて出す。
                     番線が空いていることは上で確かめてあり、出区後は
                     通常の閉塞・信号の判定で後続との間隔が保たれる。 */
                const outWait = this.depotOutWait || 0;
                const outMargin = (outWait >= 300) ? 1.0 : (outWait >= 150) ? 2.0 : 3.0;
                let checkDist = Math.max(1, Math.ceil(UNITS_PER_STATION * outMargin));
                for (let k = 1; k <= checkDist; k++) {
                    let idx = startBlock.index - (this.depotOutConfig.dir * k);
                    if (idx >= 0 && idx < blks.length) {
                        if (blks[idx].lanes.some(l => l !== null && l.dir === this.depotOutConfig.dir && l.state !== "stopped" && l.stuckTime < 30)) {
                            safeToOut = false;
                            break;
                        }
                    }
                }
                
                if (isForced) safeToOut = true;

                if (!safeToOut) {
                    this.depotStuckTime += 30;
                    this.depotOutWait = outWait + 30;
                    if (this.depotStuckTime >= 180 && !isForced) { 
                        // 強引に出区せず、長期待機モードに移行する
                        this.game.ui.updateBanner(`【運転整理】本線混雑予測のため、${depotName}留置場の ${this.depotOutConfig.trainNo} は出区を見合わせ、長期待機を行います。`, "banner-orange");
                        this.depotStuckTime = 0;
                        this.timer = 300; // 5分待機
                        return; // 処理を抜ける
                    } else if (isForced) {
                        safeToOut = true;
                    }
                }
                
                if (safeToOut) {
                    // ★修正: 留置場で出区を待っている列車がすでに編成を持っている場合、
                    //        以前はここで別の編成を引き直していたため、持っていた編成が
                    //        留置場に戻らないまま消えていた。運用条件を満たすなら続投させる。
                    let newVehicles = this.game.fleet.reassign(depotName, this.depotOutConfig.type,
                        targetTrackId, this.depotOutConfig.dest, this.depotOutConfig.trainNo, this.vehicles);
                    if (!newVehicles || newVehicles.length === 0) {
                        if (this.game && this.game.ui) {
                            this.game.ui.updateBanner(`【運休】${depotName}留置場からの ${this.depotOutConfig.trainNo} は車両不足のため運休(消滅)します。`, "banner-orange");
                        }
                        this.remove();
                        return;
                    }
                    this.vehicles = newVehicles;

                    this.depotStuckTime = 0;
                    this.depotOutWait = 0;
                    this.forceDepotOut = false;
                    // 出区成功: 留置場配列から自身を削除し、本線レーンへ
                    depotRemove(this);
                    
                    this.type = this.depotOutConfig.type;
                    this.dest = this.depotOutConfig.dest;
                    this.trainNo = this.depotOutConfig.trainNo;
                    // ★運用名も更新する。更新しないと、以前この編成が担当していた
                    //   特急の名前が残り、通勤形なのに「はまかぜの運用」と
                    //   判定されてしまう。
                    this.dutyName = this.depotOutConfig.dutyName || this.trainNo;
                    this.dir = this.depotOutConfig.dir;
                    this.trackId = targetTrackId;
                    
                    this.currBlockIndex = startBlock.index;
                    this.lane = freeLane;
                    startBlock.lanes[this.lane] = this;
                    
                    this.updateKoseiRoute();   // 出区時の行先で経路を決め直す
                    this.state = "waiting_start";
                    this.timer = 15;
                    this.hasDeparted = false;
                    this.delayTime = 0;
                    this.isFinalStop = false; // ★修正: 留置場出区時のフラグリセット
                    this.game.ui.updateBanner(`【出区】${depotName}留置場より ${this.trainNo}(${this.type}) ${this.dest}行き が出区しました。`, "banner-orange");
                } else {
                    this.timer = 30; // 本線に列車が接近している場合は30秒後にリトライ
                }
            } else {
                this.depotStuckTime += 30;
                // 本線満線の場合、消滅させずに長期待機させる
                if (this.depotStuckTime >= 300) { // 5分待っても満線なら
                    this.game.ui.updateBanner(`【運転整理】本線満線のため、${depotName}留置場の ${this.depotOutConfig.trainNo} は出区を延期し、長期待機を行います。`, "banner-orange");
                    this.depotStuckTime = 0;
                    this.timer = 300; // 5分待機
                } else {
                    this.timer = 30; // 本線満線の場合は30秒後にリトライ
                }
            }
        } else {
            this.remove();
        }
};

/**
 * 終点に着いたが入区できない列車の後始末。
 *
 * ★方針を変えた。
 *   以前は京都・須磨・大久保に着いた列車を、すぐ「向日町操行きの回送」に
 *   打ち切っていた。そのため京都に着いた列車のほとんどが向日町操へ
 *   回送され、営業に戻らないまま消えていた。
 *   実際の運用では、京都に着いた列車はその場で折り返して次の列車になるのが
 *   基本で、向日町操への入区は運用の最後や、車両交換が必要なときだけ。
 *
 *   そこで
 *     1. まず折り返して営業を続けられないか試す
 *     2. 折り返せない (満線・深夜・遅れ過大) ときだけ車両所へ回送する
 *   という順にした。
 */
Train.prototype.tryConvertDeadhead = function (stName) {
        if (this.type === "貨物" || this.type === "回送") return false;

        /* --- 1. まず折り返しを試す
           ★ただし「その種別が走りすぎているので運用を終える」と決められた列車
             (js/14-train-turnback.js の retiredByBudget) は折り返さない。
             ここで折り返してしまうと、在線本数の目安がまったく効かなくなる。 */
        if (!this.retiredByBudget && this.game.ops.preferTurnback(this, stName)) return true;

        /* --- 2. その駅に留置線があるなら、まずそこへ入れる。
           ★以前はここが「決め打ちの回送先」の表だけだった。
             京都には留置線が無い扱いだったので、京都止まりの列車は
             折り返せないと必ず向日町操行きの回送になり、
             「京都へ着いた列車が次々と向日町操へ回送される」状態になっていた。
             配線略図 (スクリーンショット(693).png) のとおり京都駅には
             引上線・留置線があるので、それを使う。 */
        const depHere = DEPOTS[stName];
        /* ★turnbackFirst の留置線 (京都・尼崎) は「運用の終わり」だけに使う。
           折り返しの要になる駅なので、ここに入れると出区待ちの列に並び、
           線区の列車が薄くなる (js/04-depots.js の turnbackFirst を参照)。 */
        const stableOk = !!depHere && depHere.trains.length < depHere.capacity &&
                         (!depHere.turnbackFirst || this.retiredByBudget);
        if (this.type !== "貨物" && stableOk) {
            this.enterDepot(stName);
            return true;
        }

        /* --- 3. それでも置けないときだけ車両所へ回送する。
           回送先は「いちばん近い、その編成を受け入れられる車両所」。
           決め打ちの表だと、京都はすべて向日町操、大阪・尼崎・高槻は
           すべて宮原操に集まってしまい、手前の電留線が使われなかった。 */
        let targetDest = null;
        {
            const near = this.game.ops.nearestDepotAhead(this, stName);
            if (near) targetDest = near.name;
        }
        if (!targetDest) return false;

        let targetIdx = fleetIndexOf(targetDest);
        let currentIdx = fleetIndexOf(stName);
        if (targetIdx === null || currentIdx === null) return false;
        /* ★いちばん近い車両所が「いまいる場所」なら回送は組まない。
           その駅の留置場が満杯でここへ来ているので、同じ留置場への回送にすると
           行先が後ろになり (放出 → 放出 の回送が尼崎方へ走り出す)、
           行先へたどり着けない列車ができていた。
           呼び出し側が運用を終わらせ、編成はこの駅の留置線 (在庫) へ戻る。 */
        if (targetIdx === currentIdx) return false;
        let nextDir = (targetIdx > currentIdx) ? 1 : -1;

        /* ★向きが変わる場合は、先に線路を移せるか確かめてから書き換える。
           移せないまま行先だけ変えると、車両所と反対の方向へ
           走り続けることになってしまう。 */
        if (this.dir !== nextDir && !this.game.ops.moveToOppositeTrack(this, stName, nextDir)) {
            /* 反対側の番線が空くのを待つ。実際の駅でもこうして待つ。
               ただし待ち続けると終着駅の番線をふさいでしまうので、
               何度待っても空かないときは、向きを変えずに済む
               前方の車両所へ回送して抜けさせる。 */
            this.deadheadWait = (this.deadheadWait || 0) + 1;
            if (this.deadheadWait <= 8) { this.timer = 20; return true; }
            this.deadheadWait = 0;
            const fwd = this.game.ops.nearestDepotAhead(this, stName);
            if (!fwd || !fwd.ahead) return false;
            targetDest = fwd.name;
            nextDir = this.dir;
        }
        this.deadheadWait = 0;

        this.game.ui.updateBanner(
            `【運転整理】${stName}駅で折り返せないため、${this.trainNo} を ` +
            `${targetDest} 行きの回送に変更して入区させます。`, "banner-orange");

        this.game.spawner.activeTrainNos.delete(this.trainNo);
        this.type = "回送";
        this.dest = targetDest;
        this.trainNo = this.game.ops.deadheadNo();
        this.dutyName = this.trainNo;
        this.game.spawner.activeTrainNos.add(this.trainNo);
        this.nextAction = "depot";
        this.isFinalStop = false;
        this.startName = stName;
        /* 回送は外側線 (列車線) を走らせる。
           ★以前は「内側線にいれば次の待避駅で転線する」だけで、
             京都は待避駅の一覧 (OVERTAKE_STATIONS) に入っていないため、
             京都 → 向日町操 の回送が内側線 (電車線) を走っていた。
             ここで発車前に外側線へ移す。移れないときは
             rerouteToOuter が次の駅で試し直す。 */
        this.rerouteToOuter = true;
        if (!/Kosei|Fukuchi|Tozai|Hoppo/.test(this.trackId) &&
            this.trackId.indexOf("In") >= 0) {
            this.attemptTrackSwitch(this.trackId.replace("In", "Out"), 20, true);
        }

        if (this.dir === nextDir) {
            // 方向が同じならそのまま延長
            this.state = "running";
            this.hasDeparted = true;
            this.hasStoppedAtCurrent = false;
            this.timer = 15;
            return true;
        }
        // 向きは上で合わせてあるので、そのまま走らせる
        this.state = "waiting_start";
        this.timer = 15;
        this.stuckTime = 0;
        this.hasStoppedAtCurrent = false;
        this.hasDeparted = false;
        return true;
};
