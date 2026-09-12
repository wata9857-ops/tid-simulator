/* このファイルは index.html から分割されたものです。
   Train 本体: 生成・初期配置・毎Tickの状態遷移 */
/**
* ==================================================
 * 4. Train (列車クラス)
 * ==================================================
 */
class Train {
    constructor(config, game) {
        this.game = game;
        this.vehicles = config.vehicles || []; // ★追加
        this.id = "t_" + Math.random().toString(36).substr(2, 9); // ★追加: 一意のID
        this.type = config.type;
        this.dir = config.dir; 
        this.trackId = config.trackId;
        this.startName = config.startName;
        this.dest = config.dest || game.spawner.getDestination(this.type, this.dir, config.startName);
        this.trainNo = config.name ? config.name : game.spawner.generateTrainNumber(this.type, this.dir, config.startName, this.trackId);

        /* 運用名 (dutyName)。
           車両の選定に使う「この列車が担当している運用の名前」。
           送り込み回送のように列車番号と運用が食い違う場合、
           列車番号ではなく運用名で車両を選ばないと
           「はまかぜの送り込み回送に通勤形が入る」ことになってしまう。 */
        this.dutyName = config.dutyName ||
            (config.serviceChange && config.serviceChange.type === "特急" && config.serviceChange.name
                ? config.serviceChange.name : this.trainNo);

        this.state = "initializing"; 
        this.currBlockIndex = -1;
        this.lane = 0;
        this.timer = 0;
        this.stuckTime = 0;
        this.delayTime = 0; // ★追加: 累積遅延時間（秒）
        this.hasDeparted = false; // ★追加: 始発駅を一度でも出発したかのフラグ
        this.depotOutConfig = null; // ★追加: 留置場からの出区設定
        this.isFinalStop = false; // ★修正: 終着駅フラグの明示的初期化
        
        
        
        // ... (これ以降の constructor 内のコードは変更なし) ...
        this.nextAction = config.nextAction || "turnback";
        this.isManuallySuspended = false;
        this.rerouteToOuter = false;
        this.plannedStop = null;
        this.minorTrouble = false;
        this.minorTroubleTimer = 0;
        this.troubleInfo = { active: false, cause: "", status: "" };
        this.serviceChange = config.serviceChange || null;
        this.hasStoppedAtCurrent = false;
        this.trackChangeReservation = null;

        // ★追加: 抑止放置検知タイマー
        this.manualSuspendTimer = 0;
        this.hasNotifiedSuspendLong = false;
        
        // ★追加: 運行継続ジャッジ機能（インタラクティブ・トラブル対応）
        this.isJudging = false;
        this.judgeTimer = 0;
        
        // ★追加: 乗務員からの各種連絡イベント用フラグ
        this.notifiedEvents = { 
            stuck: false, passenger: false, connection: false, passSkip: false, 
            turnbackShort: false, stationEvent: false 
        };

        // ★追加: 姫路貨物・京都貨物のランダム通過フラグ (各50%の確率で通過)
        this.skipHimejiFreight = Math.random() < 0.5;
        this.skipKyotoFreight = Math.random() < 0.5;

        this.isKoseiRoute = false;
        this.updateKoseiRoute();

        this.initPosition();
    }

    /**
     * 湖西線経由かどうかを決める。
     * 折り返して行先が変わったときにも呼び直す必要があるので、
     * コンストラクタから切り出してメソッドにした。
     * (以前はコンストラクタでしか決めていなかったため、
     *  「敦賀発 京都行き(湖西線経由)」が折り返し後に「米原行き」へ
     *  変わっても湖西線に入り続け、終点にたどり着けなくなっていた)
     */
    updateKoseiRoute() {
            /* ★湖西線経由かどうかの決定と保持。
               敦賀・近江塩津を発着する列車は、湖西線経由と琵琶湖線経由の2通りがある。
               ただし、行先(または始発)が米原・野洲など琵琶湖線内の駅なら
               湖西線を通ってもそこへは行けないので、必ず琵琶湖線経由にする。
               (以前はこの判定が無く、「敦賀発 米原行き」が湖西線に入って
                終点にたどり着けなくなっていた) */
            const viaKoseiPossible = (other) => {
                const i = STATION_MAP[other];
                return (i === undefined) || (i <= STATION_MAP["山科"]);
            };
            // 折り返しのたびに呼ぶので、いったん初期値に戻してから決め直す
            this.isKoseiRoute = false;
            if (this.type === "新快速") {
                const koseiStsOnly = ["近江今津", "永原", "マキノ", "近江中庄", "新旭", "安曇川", "近江高島", "北小松", "近江舞子", "堅田", "おごと温泉", "比叡山坂本", "大津京"];
                if (this.dir === 1) {
                    if (koseiStsOnly.includes(this.dest)) {
                        this.isKoseiRoute = true;
                    } else if (["敦賀", "近江塩津"].includes(this.dest) && viaKoseiPossible(this.startName)) {
                        // 敦賀・近江塩津行きは琵琶湖線経由と湖西線経由を交互にする
                        this.isKoseiRoute = this.game.spawner.nextKoseiRouteUp;
                        this.game.spawner.nextKoseiRouteUp = !this.game.spawner.nextKoseiRouteUp;
                    }
                } else if (this.dir === -1) {
                    if (koseiStsOnly.includes(this.startName)) {
                        this.isKoseiRoute = true;
                    } else if (["敦賀", "近江塩津"].includes(this.startName) && viaKoseiPossible(this.dest)) {
                        // 敦賀・近江塩津発は琵琶湖線経由と湖西線経由を交互にする
                        this.isKoseiRoute = this.game.spawner.nextKoseiRouteDown;
                        this.game.spawner.nextKoseiRouteDown = !this.game.spawner.nextKoseiRouteDown;
                    }
                }
            } else if (this.trackId.includes("Kosei")) {
                this.isKoseiRoute = true;
            } else if (this.type === "特急") {
                if (this.dir === 1 && ["敦賀", "近江塩津"].includes(this.dest) && viaKoseiPossible(this.startName)) this.isKoseiRoute = true;
                if (this.dir === -1 && ["敦賀", "近江塩津"].includes(this.startName) && viaKoseiPossible(this.dest)) this.isKoseiRoute = true;
            } else {
                const koseiStsAll = ["敦賀", "近江塩津", "近江今津", "永原", "マキノ", "近江中庄", "新旭", "安曇川", "近江高島", "北小松", "近江舞子", "堅田", "おごと温泉", "比叡山坂本", "大津京", "富山タ"];
                if (this.dir === 1 && koseiStsAll.includes(this.dest) && viaKoseiPossible(this.startName)) this.isKoseiRoute = true;
                if (this.dir === -1 && koseiStsAll.includes(this.startName) && viaKoseiPossible(this.dest)) this.isKoseiRoute = true;
            }
    }

    initPosition() {
        let actualStart = this.startName;
        if (["松井山手", "四条畷"].includes(this.startName)) { // 新三田と宝塚を削除
            actualStart = "尼崎";
        } else if (["網干", "播州赤穂", "上郡"].includes(this.startName)) {
            actualStart = "姫路";
        }

        const startStIdx = STATION_MAP[actualStart] !== undefined ?
            STATION_MAP[actualStart] : (this.dir===1?0:(STATIONS.length-1));
            
        if ((startStIdx < STATION_MAP["西明石"] || startStIdx > STATION_MAP["草津"]) && this.trackId.includes("In") && !this.trackId.includes("Hoppo")) {
            this.trackId = this.trackId.replace("In", "Out");
        }
        
        if (actualStart === "向日町操" && !this.trackId.includes("Hoppo") && this.dir === -1) this.trackId = "Down_Out";
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (!blks) { this.state = "finished"; return; }

        let startBlock = blks.find(b => b.isStation && STATIONS[b.stationIdx].name === actualStart);
        
        // 追加: 湖西線など hoppoStationName に登録されている特殊駅からの生成を許可
        if (!startBlock) {
            startBlock = blks.find(b => b.hoppoStationName === actualStart);
        }

        if (!startBlock && ["向日町操","宮原操","吹田貨"].includes(actualStart)) {
            if (this.trackId.includes("Hoppo")) {
                if (actualStart === "宮原操") startBlock = blks.find(b => b.stationIdx === 39);
                if (actualStart === "吹田貨") startBlock = blks.find(b => b.stationIdx === 41);
            } else if (actualStart === "向日町操") {
                startBlock = blks.find(b => b.hoppoStationName === "向日町操");
            }
        }

        let freeLane = -1;
        
        // ★修正: 留置場がある駅の始発は、まず留置場内に生成する (貨物は除く)
        if (this.type !== "貨物" && DEPOTS[actualStart] && DEPOTS[actualStart].trains.length < DEPOTS[actualStart].capacity) {
            let hOfDay = (this.game.currentTime / 3600) % 24;
            // 朝など生成可能な時間帯 (深夜帯はスキップ)
            if (hOfDay >= 4.0 && hOfDay < 23.0) {
                this.startName = actualStart; // ★出区処理時の不一致(網干等のままになるバグ)を防ぐため更新
                this.state = "in_depot";
                
                // ★修正: 既に出区待ちの列車がいれば、その次の始発列車として充当（待機時間を調整）
                let maxTimer = 0;
                DEPOTS[actualStart].trains.forEach(t => {
                    if (t.timer > maxTimer) maxTimer = t.timer;
                });
                // ★修正: 出区前のもう少し早い段階から表示するため、基本の待機時間を 5〜8分(300〜480秒) に延ばす
                this.timer = Math.max(300 + Math.random() * 180, maxTimer + 180); 
                
                this.depotOutConfig = { type: this.type, dest: this.dest, trainNo: this.trainNo,
                                        dir: this.dir, dutyName: this.dutyName };
                depotAdd(actualStart, this);   // ★二重登録を防ぐためヘルパー経由にする
                return;
            }
        }

        if (startBlock) {
             let lanes = startBlock.lanes;
             if (actualStart === "向日町操") { for(let l=lanes.length-1; l>=0; l--) if(lanes[l]===null) { freeLane=l; break; } }
             else { for(let l=0; l<lanes.length; l++) if(lanes[l]===null) { freeLane=l; break; } }
        }

        if (startBlock && freeLane !== -1) {
            // ★修正: ここで無条件に編成を引き直していたため、GameSystem.addTrain() が
            //        先に割り当てた編成が行き場を失い、1本生成するごとに1編成が
            //        留置場に戻らないまま消えていた。これが在庫切れの主因で、
            //        結果として宝塚線・東西線などの列車が生成されなくなっていた。
            //        すでに編成が付いている場合はそれをそのまま使う。
            if (!this.vehicles || this.vehicles.length === 0) {
                this.vehicles = this.game.spawner.assignVehicles(actualStart, this.type, this.trackId, this.dest, this.dutyName);
            }
            if (!this.vehicles || this.vehicles.length === 0) {
                this.state = "finished";
                this.game.spawner.activeTrainNos.delete(this.trainNo);
                return;
            }
            this.currBlockIndex = startBlock.index;
            this.lane = freeLane;
            startBlock.lanes[this.lane] = this;
            this.state = "waiting_start";
            this.timer = 300;
        } else {
            // ★修正: 配置に失敗した場合も編成を留置場へ返す (取りっぱなしを防ぐ)
            this.game.fleet.release(actualStart, this.vehicles);
            this.vehicles = [];
            this.state = "finished";
            this.game.spawner.activeTrainNos.delete(this.trainNo);
        }
    }

    /**
     * 抑止・防護無線・運転見合わせで止められている間の遅延加算。
     *
     * 以前は「出発済み(hasDeparted)」かつ「直前のブロックが列車で埋まっている」
     * ときだけ遅れを積んでいた。そのため
     *   ・防護無線や運転見合わせで前方が空っぽのまま止められている列車
     *   ・折り返し直後・出区直後で hasDeparted がまだ false の列車
     * には遅れが付かず、指令が抑止しても遅延が増えないという不具合になっていた。
     * 指令による停止は理由を問わず遅延なので、ここでまとめて加算する。
     */
    addHoldDelay() {
        // 始発の発車時刻前 (まだ発車時刻になっていない) なら遅延ではない
        if (this.state === "waiting_start" && this.timer > 0) return;
        this.delayTime += CONFIG.TICK_SEC;
    }

    /**
     * 信号待ちによる遅延加算。
     * 「前方のブロックが満線」に加えて「前方が運転見合わせ区間」も遅延とみなす。
     * 見合わせ区間には列車が入れないので前方は空のままで、
     * 満線判定だけでは遅れが増えなかった。
     */
    addBlockedDelay(blks) {
        const nextIdx = this.currBlockIndex + this.dir;
        if (nextIdx < 0 || nextIdx >= blks.length) return;
        const isFull = blks[nextIdx].lanes.every(l => l !== null);
        const isSuspended = this.game.trackMgr.isSuspended(this.trackId, nextIdx);
        if (isFull || isSuspended) this.delayTime += CONFIG.TICK_SEC;
    }

    update() {
        if (this.state === "finished") return;
        
        // ★修正: 留置場内での待機・出区処理 (緊急停止等の影響を受けないように最優先で処理)
        if (this.state === "in_depot") {
            let hOfDay = (this.game.currentTime / 3600) % 24;
            if (hOfDay >= 23.0 || hOfDay < 4.0) {
                this.remove(); return;
            }
            if (this.timer > 0) {
                this.timer -= CONFIG.TICK_SEC;
            }
            // ★修正: 0ぴったりではなく0以下になったら出区（Tickの減算で0を飛び越える事象を防止）。-1は待機状態。
            if (this.timer <= 0 && this.timer !== -1) { 
                // ★改善: 強制出区フラグを引数として渡す
                this.tryDepotOut(this.startName, this.forceDepotOut);
            }
            return;
        }

        if (this.game.isEmergency || this.isManuallySuspended) { 
            // ★追加: 抑止時間計測と乗務員からの連絡
            if (this.isManuallySuspended) {
                this.manualSuspendTimer += CONFIG.TICK_SEC;
                if (this.manualSuspendTimer >= 1200 && !this.hasNotifiedSuspendLong) {
                    this.hasNotifiedSuspendLong = true;
                    const blks = this.game.trackMgr.blocks[this.trackId];
                    const currentBlock = blks ? blks[this.currBlockIndex] : null;
                    const currentStName = currentBlock ? (currentBlock.hoppoStationName || (currentBlock.stationIdx >= 0 ? STATIONS[currentBlock.stationIdx].name : "")) : "駅間";
                    
                    this.game.ui.updateBanner(`【乗務員連絡】${currentStName}停車中の ${this.trainNo} は抑止指示から20分経過しました。運転再開の指示をお願いします。`, "banner-blue");
                }
            }

            // ★修正: 停車中(stopped)や折り返し待機中(turning_back)の列車を強制的に holding に上書きしないように保護
            // (上書きされると、抑止解除時に running に戻され、そのまま前進して終着駅を飛び越えてしまうため)
            if (["waiting_start", "stopped", "turning_back"].includes(this.state)) {
                if (this.state === "waiting_start") {
                    if (this.timer > 0) this.timer -= CONFIG.TICK_SEC;
                }
                // ★修正: 以前は hasDeparted のときだけ加算していたため、折り返し直後や
                //        出区直後(hasDeparted=false)の列車が抑止・防護無線で止められても
                //        遅れが増えなかった。抑止指示・防護無線は指令による停止なので、
                //        発車時刻を過ぎて動けない限り遅延として積む。
                this.addHoldDelay();
                return;
            }
            this.state = "holding";
            this.addHoldDelay();
            return;
        }

        if (this.minorTrouble) {
            if (this.hasDeparted) this.delayTime += CONFIG.TICK_SEC;
            this.handleMinorTrouble();
            return;
        }

        // ★追加: 機外停車や発車待ちによる長時間のスタック検知
        if (this.stuckTime >= 900 && !this.notifiedEvents.passenger) {
            this.notifiedEvents.passenger = true;
            this.game.ui.updateBanner(`【乗務員連絡】${this.trainNo} ですが、車内のお客様から運転再開見込みの問い合わせが相次いでいます。アナウンスのための目安をお願いします。`, "banner-blue");
        }

        if (this.timer > 0) { this.timer -= CONFIG.TICK_SEC; }

        const blks = this.game.trackMgr.blocks[this.trackId];
        const currentBlock = blks[this.currBlockIndex];
        const currentStName = blockStationName(currentBlock);

        // ★追加: 駅停車中の旅客対応トラブル (荷物挟まり / 急病人)
        if (this.state === "stopped" && this.hasStoppedAtCurrent && this.timer > 0 && this.timer < 30) {
            // 発生確率をさらに引き下げ (0.1%に変更)
            if (!this.notifiedEvents.stationEvent && Math.random() < 0.001) { 
                this.notifiedEvents.stationEvent = true;
                if (Math.random() < 0.5) {
                    this.game.ui.updateBanner(`【乗務員連絡】${currentStName}駅にてドアにお客様の荷物が挟まり、再開閉を繰り返しています。客扱いが難航しており発車が遅れます。（${this.trainNo}）`, "banner-blue");
                    this.timer += 60;
                    this.delayTime += 60; // ★追加: システム上の遅延としても1分加算
                } else {
                    this.game.ui.updateBanner(`【乗務員連絡】${currentStName}駅到着時、${this.trainNo}車内で急病人発生の申告がありました。現在駅係員を手配し救護中です。発車が数分遅れます。`, "banner-blue");
                    this.timer += 120; // ★変更: 停車時間を2分に調整
                    this.delayTime += 120; // ★追加: システム上の遅延としても2分加算
                }
            }
        }

        // ★修正: 目的地が向日町操の場合のみ消滅させるようにし、下り貨物などが通過時に消滅するバグを防止
        if (currentStName.includes("向日町操") && this.dest === "向日町操") {
            this.nextAction = "depot";
            this.remove(); return;
        }

        if (this.timer <= 0) {
            switch(this.state) {
                case "waiting_start":
                case "stopped":
                case "holding":
                    if (this.state === "stopped") {
                        // ★修正: 終着駅や打ち切り時はホームで停車完了後に各アクションへ移行する
                        if (this.isFinalStop || currentStName === this.dest) { 
                            if (this.nextAction === "remove" || this.nextAction === "in_depot_remove") {
                                if (this.nextAction === "in_depot_remove") {
                                    this.game.ui.updateBanner(`【入区】${this.trainNo} は ${currentStName}留置場に入区し、運用を終了(消滅)しました。`, "banner-orange");
                                }
                                this.remove(); return;
                            }
                            if (this.nextAction === "depot" || this.nextAction === "in_depot_leave") {
                                let h = (this.game.currentTime / 3600) % 24;
                                let isDaytime = (h >= 9.5 && h < 17.0);
                                let allowedCap = (DEPOTS[currentStName]) ? (isDaytime ? Math.floor(DEPOTS[currentStName].capacity / 2) : DEPOTS[currentStName].capacity) : 0;

                                if (this.type !== "貨物" && DEPOTS[currentStName] && DEPOTS[currentStName].trains.length < allowedCap) {
                                    this.enterDepot(currentStName);
                                } else {
                                    // ★追加: 特定の駅では消滅させずに回送延長を行う
                                    if (!this.tryConvertDeadhead(currentStName)) {
                                        this.remove();
                                    }
                                }
                                return;
                            }
                            if (this.nextAction === "stop_same_home") {
                                this.isManuallySuspended = true;
                                this.manualSuspendTimer = 0;
                                this.hasNotifiedSuspendLong = false;
                                this.nextAction = "wait_instruction"; // ★修正: turnbackからwait_instructionへ
                                this.game.ui.updateBanner(`【指令】${this.trainNo} は ${currentStName}駅にて同ホーム抑止手配されました。`, "banner-orange");
                                return;
                            }
                            // ★追加: 同ホーム抑止後の解除時判定
                            if (this.nextAction === "wait_instruction") {
                                if (this.isManuallySuspended) return; // 抑止中は待機
                                
                                let currentIdx = STATION_MAP[currentStName];
                                let destIdx = STATION_MAP[this.dest];
                                if (currentIdx === undefined) {
                                    if (currentStName === "宮原操") currentIdx = 39;
                                    else if (currentStName === "向日町操") currentIdx = 51;
                                }
                                if (destIdx === undefined) {
                                    if (this.dest === "宮原操") destIdx = 39;
                                    else if (this.dest === "向日町操") destIdx = 51;
                                    else if (this.dest === "吹田貨") destIdx = 41;
                                }

                                let expectedDir = this.dir;
                                if (currentIdx !== undefined && destIdx !== undefined && currentIdx !== destIdx) {
                                    expectedDir = destIdx > currentIdx ? 1 : -1;
                                }

                                if (expectedDir !== this.dir || this.dest === currentStName) {
                                    // 反対方面の行き先が設定された、または行き先がそのままなら折り返し
                                    this.nextAction = "turnback";
                                    this.state = "turning_back";
                                    this.game.ui.updateBanner(`【指令】${this.trainNo} は ${currentStName}駅にて反対方面への折り返しを開始します。`, "banner-orange");
                                    return;
                                } else {
                                    // 同方向の先の駅が設定された場合は延長運転
                                    this.nextAction = "turnback"; // 次の終点用に戻す
                                    this.isFinalStop = false;
                                    this.hasStoppedAtCurrent = false; // ★追加: 全停車駅通過バグ修正
                                    this.state = "running";
                                    this.timer = 15;
                                    this.game.ui.updateBanner(`【指令】${this.trainNo} は ${currentStName}駅からの延長運転を開始します。`, "banner-orange");
                                    return;
                                }
                            }
                            // 上記以外(turnback, stop_opposite_home)は折り返しへ
                            this.state = "turning_back";
                            return; 
                        }
                    }
                    
                    // 修正: 常に true を渡し、ホールド状態でもしっかり間隔チェックを継続させる
                    // ★追加: 指令パッドの「強制発車」が出ている列車は間隔チェックを飛ばす。
                    //        (進路が空いているかどうかは move() が findFreeLane で見るので、
                    //         強制発車でも同一番線への突入は起きない)
                    if (!this.forceStart && this.checkHold(true)) {
                        this.timer = 15;
                        this.state = "holding"; 
                        this.stuckTime += CONFIG.TICK_SEC;
                        
                        // ★追加: 見合わせ区間手前の駅での普通列車の自動折り返し（深刻な詰まりの緩和）
                        if (this.stuckTime > 420 && this.type === "普通" && !this.isManuallySuspended) {
                            const nextIdx = this.currBlockIndex + this.dir;
                            if (this.game.trackMgr.isSuspended(this.trackId, nextIdx)) {
                                const cb = blks[this.currBlockIndex];
                                if (cb && (cb.isStation || cb.hoppoStationName)) {
                                    let congestedTrains = 0;
                                    for (let k = 1; k <= UNITS_PER_STATION * 3; k++) {
                                        let idx = this.currBlockIndex - (this.dir * k);
                                        if (idx >= 0 && idx < blks.length) {
                                            congestedTrains += blks[idx].lanes.filter(l => l !== null && l.dir === this.dir).length;
                                        }
                                    }
                                    // 条件: 後方に3本以上詰まっていて、10%の確率で発動
                                    /* ★折り返せる駅でしか折り返さない。
                                       以前は「湖西線通過」のようなダミーブロックや、
                                       その列車が通過する駅を行先にしてしまい、
                                       たどり着けない行先が生まれていた。 */
                                    const turnName = blockStationName(cb);
                                    /* 折り返せる駅で、かつ、いまの編成でその区間の
                                       運用に入れることが条件。
                                       (例: 東西線直通の207系が、打ち切りによって
                                        本線の姫路口の運用に化けてしまうのを防ぐ) */
                                    const canTurnHere = isRealStationBlock(cb) &&
                                        (SWITCHABLE_STATIONS.includes(turnName) ||
                                         OVERTAKE_STATIONS.includes(turnName)) &&
                                        this.game.fleet.canServe(this.vehicles, turnName, this.type,
                                            this.trackId, turnName, this.dutyName);
                                    if (congestedTrains >= 3 && canTurnHere && Math.random() < 0.1) {
                                        this.dest = turnName;
                                        this.nextAction = "turnback";
                                        this.state = "turning_back";
                                        this.timer = 60;
                                        this.stuckTime = 0;
                                        this.hasDeparted = false;
                                        this.game.ui.updateBanner(`【運転整理】見合わせ区間手前の列車詰まり緩和のため、${this.trainNo} は ${this.dest}駅 で折り返し運転を行います。`, "banner-orange");
                                    }
                                }
                            }
                        }

                        // 修正: 出発済みの場合のみ、直前が塞がっている時に遅延を加算
                        if (this.hasDeparted) {
                            this.addBlockedDelay(blks);
                        } else {
                            // ★追加: まだ発車していない列車でも、前方が運転見合わせ区間で
                            //        足止めされている場合は遅延として積む。
                            //        (通常の続行間隔待ちは下の救済ロジックに任せ、遅延にしない)
                            if (this.game.trackMgr.isSuspended(this.trackId, this.currBlockIndex + this.dir)) {
                                this.delayTime += CONFIG.TICK_SEC;
                            }
                            // 追加: 始発駅で5分(1200秒)以上発車できない場合の救済ロジック
                            if (this.stuckTime > 1200 && ["普通", "快速"].includes(this.type)) {
                                this.type = "回送";
                                this.trainNo = "回" + (Math.floor(Math.random()*8000)+1000);
                                
                                // 回送先を決定
                                // ★回送先は必ず進行方向の前方から選ぶ
                                //   (後方の駅を行先にすると終点に着けない)
                                const cb0 = blks[this.currBlockIndex];
                                const hereName = cb0.hoppoStationName ||
                                    (cb0.stationIdx >= 0 ? STATIONS[cb0.stationIdx].name : this.startName);
                                const hereIdx = STATION_MAP[hereName];
                                if (this.dir === 1) {
                                    this.dest = (hereIdx !== undefined && hereIdx < STATION_MAP["向日町操"] && Math.random() < 0.5)
                                        ? "向日町操" : this.game.spawner.fallbackTerminal(1, hereName);
                                } else {
                                    this.dest = (hereIdx !== undefined && hereIdx > STATION_MAP["宮原操"] && Math.random() < 0.5)
                                        ? "宮原操" : this.game.spawner.fallbackTerminal(-1, hereName);
                                }
                                this.nextAction = "depot";
                                
                                this.game.ui.updateBanner(`【運転整理】${this.startName}駅での発車詰まりを検知。${this.trainNo}を回送に変更し外側線へ退避させます。`, "banner-orange");
                                
                                // 外側線への転線を試行
                                let targetTrack = this.trackId.replace("In", "Out");
                                this.attemptTrackSwitch(targetTrack, 50);
                                this.stuckTime = 0; // リセット
                            }
                        }
                    } else {
                        this.state = "running";
                        this.hasDeparted = true;
                        this.hasStoppedAtCurrent = false;
                        this.stuckTime = 0;
                        this.forceStart = false; // ★発車できたので強制発車フラグを解除
                        this.notifiedEvents.stuck = false;     // ★追加
                        this.notifiedEvents.passenger = false; // ★追加
                        this.timer = this.calcTravelTime();
                        
                        // ★深夜帯の到着予測と行先の事前変更をチェック
                        this.checkLateNightDestination();
                    }
                    break;

                case "running":
                    this.checkLogicUpdates();
                    if (this.state !== "holding") {
                        if (!this.forceStart && this.checkHold(true)) { // ★強制発車フラグがある場合はcheckHoldを無視
                            this.timer = 15;
                            this.stuckTime += CONFIG.TICK_SEC;
                            
                            if (this.hasDeparted) {
                                this.addBlockedDelay(blks);
                            }
                        } else {
                            this.stuckTime = 0;
                            this.forceStart = false; // ★移動が完了したら強制発車フラグを解除
                              this.move();
                        }
                    }
                    break;
                    
                case "turning_back":
                    this.executeTurnBack();
                    break;
            }
        } else if (this.state === "running") {
            if (this.game.trackMgr.isSuspended(this.trackId, this.currBlockIndex + this.dir)) {
                this.state = "holding";
                this.timer = 15;
                this.addHoldDelay();
            }
        }
    }

    checkLogicUpdates() {
        const blk = this.game.trackMgr.blocks[this.trackId][this.currBlockIndex];
        let timeH = (this.game.currentTime / 3600) % 24;

        // ★改善事象①: 普通に種別変更(降格)された列車が外側線を走行不可とする（内側線へ転線）
        if (this.type === "普通" && this.trackId.includes("Out")) {
            // 西明石(11)〜草津(66)の複々線区間内であれば、内側線へ戻す
            if (blk.stationIdx > STATION_MAP["西明石"] && blk.stationIdx < STATION_MAP["草津"]) {
                this.attemptTrackSwitch(this.trackId.replace("Out", "In"));
            }
        }

        // ※西明石駅での強制的なホーム間横移動(attemptTrackSwitch)を削除。
        // 代わりに move() と checkHold() の発車・進入ロジックで直接転線させるように変更。

        // ★改善①: 快速列車の朝ラッシュ時走行線路（内側/外側）特例
        if (this.type === "快速") {
            let stIdx = blk.stationIdx;
            if (this.dir === -1) {
                // 下り (京都 → 西明石方面)
                let outStartIdx = -1, inStartIdx = -1;
                if (timeH >= 6.2 && timeH < 6.8) { outStartIdx = STATION_MAP["大阪"]; inStartIdx = STATION_MAP["芦屋"]; }
                else if (timeH >= 6.8 && timeH < 7.8) { outStartIdx = STATION_MAP["高槻"]; inStartIdx = STATION_MAP["芦屋"]; }
                else if (timeH >= 7.8 && timeH < 8.3) { outStartIdx = STATION_MAP["高槻"]; inStartIdx = STATION_MAP["兵庫"]; }
                else if (timeH >= 8.3 && timeH < 9.2) { outStartIdx = STATION_MAP["高槻"]; inStartIdx = STATION_MAP["芦屋"]; }

                if (stIdx === outStartIdx && this.trackId === "Down_In") this.attemptTrackSwitch("Down_Out");
                if (stIdx === inStartIdx && this.trackId === "Down_Out") this.attemptTrackSwitch("Down_In");

            } else if (this.dir === 1) {
                // 上り (西明石 → 京都方面)
                let outStartIdx = -1, inStartIdx = -1;
                // 西明石駅発車時刻をシミュレーターの全体時刻から大まかに逆算して判定
                if (timeH >= 5.8 && timeH < 7.2) { outStartIdx = STATION_MAP["芦屋"]; inStartIdx = STATION_MAP["高槻"]; }
                else if (timeH >= 7.2 && timeH < 7.4) { outStartIdx = STATION_MAP["兵庫"]; inStartIdx = STATION_MAP["高槻"]; }
                else if (timeH >= 7.4 && timeH < 8.6) { outStartIdx = STATION_MAP["西明石"]; inStartIdx = STATION_MAP["高槻"]; }

                if (stIdx === outStartIdx && this.trackId === "Up_In") this.attemptTrackSwitch("Up_Out");
                if (stIdx === inStartIdx && this.trackId === "Up_Out") this.attemptTrackSwitch("Up_In");
            }
        }

        // 草津駅での複線・複々線の合流・分岐
        // ※西明石同様、強制的なホーム間横移動(attemptTrackSwitch)を削除し、デッドロックを防止。
        // 発車時にmove()およびcheckHold()の直接転線(次ブロックへの斜め移動)に任せる。

        // ★改善②: 新快速列車の朝ラッシュ特例（7時台・8時台は京都～草津間を外側線走行）
        if (this.type === "新快速") {
            let isMorningRush = (timeH >= 7.0 && timeH < 9.0);

            if (this.dir === -1) { // 下り (米原→大阪方面)
                if (this.trackId === "Down_In" && blk.stationIdx === STATION_MAP["京都"]) {
                    this.attemptTrackSwitch("Down_Out");
                }
            } else if (this.dir === 1) { // 上り (大阪→米原方面)
                if (this.trackId === "Up_Out" && blk.stationIdx === STATION_MAP["京都"]) {
                    // 朝ラッシュ時以外は通常通り内側線へ転線
                    if (!isMorningRush) this.attemptTrackSwitch("Up_In");
                }
            }
        }
        
        // 以下の貨物・特急・転線予約・回送のロジックは元のまま維持
        if (["貨物","回送","臨時"].includes(this.type) && this.type !== "特急") {
            // 本線から北方貨物線への進入は「貨物」に限定し、特急間合いの回送が大阪・新大阪をスルーするバグを防止
            if (this.type === "貨物") {
                if (this.dir===1 && this.trackId==="Up_Out" && blk.stationIdx>=36 && blk.stationIdx<=37) this.attemptTrackSwitch("Up_Hoppo", 200);
                if (this.dir===-1 && this.trackId==="Down_Out" && blk.stationIdx>=41 && blk.stationIdx<=45) this.attemptTrackSwitch("Down_Hoppo", 200);
            }
            // 北方貨物線は idx36-44 のみ実体ブロックを持ち、その先はプレースホルダ(x:-1000)。
            // 端で本線へ復帰させないと不可視区間へ進入し、列車が消滅していた。両端で本線へ戻す。（既に北方貨物線にいる列車が対象）
            if (this.dir===1 && this.trackId==="Up_Hoppo" && blk.stationIdx>=43 && blk.stationIdx<=44) this.attemptTrackSwitch("Up_Out", 200);
            if (this.dir===-1 && this.trackId==="Down_Hoppo" && blk.stationIdx>=36 && blk.stationIdx<=37) this.attemptTrackSwitch("Down_Out", 200);
        }

        // ★湖西線の分岐・合流ロジック
        if (blk.stationIdx === STATION_MAP["山科"]) {
            if (this.dir === -1 && this.trackId === "Kosei_Down") {
                // 下り(湖西線→本線)
                let target = (this.type === "新快速" || this.type === "特急") ? "Down_Out" : "Down_In";
                this.attemptTrackSwitch(target, 200);
            } else if (this.dir === 1 && !this.trackId.includes("Kosei")) {
                // 上り(本線→湖西線)
                if (this.isKoseiRoute) {
                    // _koseiChecked のフラグを廃止し、転線に成功するまで毎フレーム試行する
                    this.attemptTrackSwitch("Kosei_Up", 200);
                }
            }
        }

        if (blk.stationIdx === STATION_MAP["近江塩津"]) {
            if (this.dir === 1 && this.trackId === "Kosei_Up") {
                // 上り(湖西線→本線)
                let target = (this.type === "新快速" || this.type === "特急") ? "Up_Out" : "Up_In";
                this.attemptTrackSwitch(target, 200);
            } else if (this.dir === -1 && !this.trackId.includes("Kosei")) {
                // 下り(本線→湖西線) 
                if (this.isKoseiRoute) {
                    this.attemptTrackSwitch("Kosei_Down", 200);
                }
            }
        }

        if (this.trackChangeReservation && this.trackChangeReservation.status === "pending") {
             const stName = blockStationName(blk);
             if (stName === this.trackChangeReservation.stationName) this.attemptTrackSwitch(this.trackChangeReservation.targetTrackId);
        }

        if (this.type === "回送" && this.trackId.includes("In")) this.rerouteToOuter = true;
        if (this.rerouteToOuter && this.trackId.includes("In")) {
            const stName = blockStationName(blk);
            if (OVERTAKE_STATIONS.includes(stName)) this.attemptTrackSwitch(this.trackId.replace("In", "Out"));
        }
    }

    attemptTrackSwitch(targetId, dist = 20) {
        if (!targetId || targetId === this.trackId) return;
        const blks = this.game.trackMgr.blocks[this.trackId];
        const targetBlks = this.game.trackMgr.blocks[targetId];
        if (!targetBlks) return;
        const curB = blks[this.currBlockIndex];
        const targetB = targetBlks.find(b => Math.abs(b.x - curB.x) < dist);
        if (targetB) {
            // ★修正: 0番レーン固定をやめ、全レーンから空きを探す
            let freeLane = this.findFreeLane(targetB);
            if (freeLane !== -1) {
                curB.lanes[this.lane] = null;
                this.trackId = targetId; this.currBlockIndex = targetB.index; this.lane = freeLane;
                targetB.lanes[freeLane] = this; this.rerouteToOuter = false;
            } else {
                this.state = "holding";
                this.timer = 5;
            }
        }
    }
}
