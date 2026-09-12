/* このファイルは index.html から分割されたものです。
   Train: 消滅・入区・出区処理 */
Train.prototype.remove = function () {
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (blks && blks[this.currBlockIndex] && this.lane >= 0) {
            blks[this.currBlockIndex].lanes[this.lane] = null;
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
            blks[this.currBlockIndex].lanes[this.lane] = null;
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

    // ★追加: 留置場からの出区を試行するメソッド
Train.prototype.tryDepotOut = function (depotName, force = false) {
        const depot = DEPOTS[depotName];
        if (!depot) return;
        
        // ★改善: 強制出区フラグの永続化
        if (force) this.forceDepotOut = true;
        let isForced = this.forceDepotOut || false;

        let actualStart = depotName;
        if (["松井山手", "四条畷"].includes(depotName)) actualStart = "尼崎";
        else if (["網干", "播州赤穂", "上郡"].includes(depotName)) actualStart = "姫路";

        // ★修正: 宮原操・向日町操等のインデックスを明示的に補完し、不正なトラック置換を防ぐ
        let tempStIdx = STATION_MAP[actualStart];
        if (actualStart === "宮原操") tempStIdx = 39;
        if (actualStart === "向日町操") tempStIdx = 51;
        const startStIdx = tempStIdx !== undefined ? tempStIdx : (this.depotOutConfig.dir===1?0:(STATIONS.length-1));
        
        /* ★出区する線路は留置場が面している線区から決める (js/04-depots.js)。
           放出のように本線以外に面した留置場があるため、
           一律に本線を使うと出区できずに列車が消えてしまう。 */
        let targetTrackId = depotTrackId(actualStart, this.depotOutConfig.dir, this.depotOutConfig.type);
        
        const blks = this.game.trackMgr.blocks[targetTrackId];
        if (!blks) {
            // ブロックが見つからない異常事態は強制消滅させて枠を空ける
            this.remove();
            return;
        }

        let startBlock = blks.find(b => b.isStation && STATIONS[b.stationIdx].name === actualStart);
        if (!startBlock) startBlock = blks.find(b => b.hoppoStationName === actualStart);
        if (!startBlock && ["向日町操","宮原操"].includes(actualStart)) {
            if (targetTrackId.includes("Hoppo")) {
                if (actualStart === "宮原操") startBlock = blks.find(b => b.stationIdx === 39);
            } else if (actualStart === "向日町操") {
                startBlock = blks.find(b => b.hoppoStationName === "向日町操");
            }
        }

        if (startBlock) {
            let freeLane = -1;
            let lanes = startBlock.lanes;
            if (actualStart === "向日町操") { for(let l=lanes.length-1; l>=0; l--) if(lanes[l]===null) { freeLane=l; break; } }
            else { for(let l=0; l<lanes.length; l++) if(lanes[l]===null) { freeLane=l; break; } }

            // ★追加: 満線(freeLane === -1)の場合のスタック時間加算
            if (this.depotStuckTime === undefined) this.depotStuckTime = 0;

            if (freeLane !== -1) {
                // 出区時に後続列車(本線上)が接近していないか確認し、謎の抑止バグを防ぐ
                let safeToOut = true;
                let checkDist = Math.ceil(UNITS_PER_STATION * 3.0); // マージンを少し広げる
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

        // --- 1. まず折り返しを試す
        if (this.game.ops.preferTurnback(this, stName)) return true;

        // --- 2. 折り返せないときだけ車両所へ回送する
        const DEADHEAD_TO = { "京都": "向日町操", "須磨": "西明石", "大久保": "西明石",
                              "高槻": "宮原操", "尼崎": "宮原操", "大阪": "宮原操" };
        let targetDest = DEADHEAD_TO[stName];
        if (!targetDest) return false;

        let targetIdx = fleetIndexOf(targetDest);
        let currentIdx = fleetIndexOf(stName);
        if (targetIdx === null || currentIdx === null) return false;
        let nextDir = (targetIdx > currentIdx) ? 1 : -1;

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
        // 回送は外側線(列車線)を走らせる。内側線にいれば次の待避駅で転線する。
        this.rerouteToOuter = true;

        if (this.dir === nextDir) {
            // 方向が同じならそのまま延長
            this.state = "running";
            this.hasDeparted = true;
            this.hasStoppedAtCurrent = false;
            this.timer = 15;
            return true;
        }
        // 方向が逆になる場合は折り返し転線を試みる
        let newTrackId = this.trackId.includes("Down") ? this.trackId.replace("Down", "Up") : this.trackId.replace("Up", "Down");
        if ((currentIdx < STATION_MAP["西明石"] || currentIdx > STATION_MAP["草津"]) && newTrackId.includes("In")) {
            newTrackId = newTrackId.replace("In", "Out");
        }
        const blks = this.game.trackMgr.blocks[this.trackId];
        const blk = blks[this.currBlockIndex];
        const targetBlks = this.game.trackMgr.blocks[newTrackId];
        const newB = targetBlks ? targetBlks.find(b => Math.abs(b.x - blk.x) < 5) : null;
        if (!newB) return false;

        let tl = this.findFreeLane(newB);
        if (tl !== -1) {
            blk.lanes[this.lane] = null;
            this.trackId = newTrackId;
            this.dir = nextDir;
            this.currBlockIndex = newB.index;
            this.lane = tl;
            newB.lanes[tl] = this;
            this.state = "waiting_start";
            this.timer = 15;
            this.stuckTime = 0;
            this.hasStoppedAtCurrent = false;
            this.hasDeparted = false;
            return true;
        }
        this.timer = 15;   // 満線なら待機して再試行
        return true;
};
