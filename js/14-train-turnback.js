/* このファイルは index.html から分割されたものです。
   Train: 折り返し・車両故障などの小トラブル・所要時間計算 */
Train.prototype.executeTurnBack = function () {
        const blks = this.game.trackMgr.blocks[this.trackId];
        const blk = blks[this.currBlockIndex];
        const stName = (blk.stationIdx >= 0) ? STATIONS[blk.stationIdx].name : (blk.hoppoStationName || "");

        // ★事象2対応: 運用変更(特急化など)がある場合は、他の折り返し/入庫ロジックより最優先で処理する
        if (this.serviceChange && this.serviceChange.at === stName) {
            this.game.spawner.activeTrainNos.delete(this.trainNo); // ★追加
            this.type = this.serviceChange.type;
            this.dest = this.serviceChange.dest;
            this.trainNo = this.serviceChange.name;
            // ★運用名も引き継ぐ。特急を終えて回送に変わる場合は、直前の特急名を
            //   運用名として残し、特急編成がそのまま車両所へ戻れるようにする。
            this.dutyName = this.serviceChange.dutyName ||
                (this.type === "特急" ? this.trainNo : this.dutyName);
            this.game.spawner.activeTrainNos.add(this.trainNo); // ★追加
            const toDepot = (this.dest === "向日町操");
            this.serviceChange = null;

            // ★運用が変わったので、いまの編成でその運用に入れるか確かめる。
            //   (通勤形のまま特急「はまかぜ」になってしまう不具合の対策)
            const swapped = this.game.fleet.reassign(stName, this.type, this.trackId,
                this.dest, this.dutyName, this.vehicles);
            if (!swapped || swapped.length === 0) {
                this.game.ui.updateBanner(
                    `【運休】${stName}駅 車両手配がつかないため、${this.trainNo} は運休となります。`, "banner-orange");
                this.remove();
                return;
            }
            this.vehicles = swapped;
            this.state = "waiting_start";
            this.timer = 15; this.hasStoppedAtCurrent = false;
            this.nextAction = toDepot ? "depot" : "turnback";
            this.hasDeparted = false;
            this.delayTime = 0;
            this.isFinalStop = false; // ★修正: 運用変更時のフラグリセット
            return;
        }

        if(this.nextAction === "depot") { 
            let h = (this.game.currentTime / 3600) % 24;
            let isDaytime = (h >= 9.5 && h < 17.0);
            let allowedCap = (DEPOTS[stName]) ? (isDaytime ? Math.floor(DEPOTS[stName].capacity / 2) : DEPOTS[stName].capacity) : 0;
            if (this.type !== "貨物" && DEPOTS[stName] && DEPOTS[stName].trains.length < allowedCap) {
                this.enterDepot(stName);
            } else {
                if (!this.tryConvertDeadhead(stName)) {
                    this.remove(); 
                }
            }
            return; 
        }
        
        let hOfDay = (this.game.currentTime / 3600) % 24;

        // ★追加: 米原駅 上り快速の近江塩津・敦賀への延長運転（4時～9時台、16時～20時台）
        if (stName === "米原" && this.dir === 1 && this.dest === "米原" && this.type === "快速") {
            if ((hOfDay >= 4.0 && hOfDay < 10.0) || (hOfDay >= 16.0 && hOfDay < 21.0)) {
                if (this.game.currentTime >= this.game.spawner.nextMaibaraExtendTime) {
                    this.game.spawner.nextMaibaraExtendTime = this.game.currentTime + (45 * 60) + (Math.random() * 600 - 300); // 約45分後
                    this.game.spawner.activeTrainNos.delete(this.trainNo);
                    this.type = "普通";
                    this.dest = (Math.random() < 0.5) ? "近江塩津" : "敦賀";
                    this.trainNo = this.game.spawner.generateTrainNumber("普通", 1, "米原", this.trackId);
                    this.nextAction = "turnback"; 
                    this.state = "running";
                    this.hasDeparted = true;
                    this.hasStoppedAtCurrent = false;
                    this.timer = 15;
                    this.delayTime = 0;
                    this.isFinalStop = false;
                    this.game.ui.updateBanner(`【運転整理】米原駅止まりの快速を普通 ${this.dest}行き に変更し延長運転します。`, "banner-orange");
                    return;
                }
            }
        }

        // ★追加: 近江塩津・敦賀から戻ってきた米原行き普通列車の処理
        if (stName === "米原" && this.dir === -1 && this.dest === "米原" && this.type === "普通") {
            // 朝〜昼の到着：今まで通り快速姫路方面の列車に充当
            if (hOfDay < 16.0) {
                this.game.spawner.activeTrainNos.delete(this.trainNo);
                let dests = ["網干", "姫路", "加古川"];
                this.dest = dests[Math.floor(Math.random() * dests.length)];
                // ★追加: 快速へ格上げできるのは、いまの編成が快速の運用条件を満たす場合だけ。
                //        207系・321系や6000番台は快速に使えないので、その場合は普通のまま延長する。
                this.type = this.game.fleet.canServe(this.vehicles, "米原", "快速", this.trackId, this.dest)
                    ? "快速" : "普通";
                this.trainNo = this.game.spawner.generateTrainNumber(this.type, -1, "米原", this.trackId);
                this.nextAction = "turnback"; 
                this.state = "running";
                this.hasDeparted = true;
                this.hasStoppedAtCurrent = false;
                this.timer = 15;
                this.delayTime = 0;
                this.isFinalStop = false;
                this.game.ui.updateBanner(`【運転整理】米原駅止まりの普通を ${this.type} ${this.dest}行き に変更し延長運転します。`, "banner-orange");
                return;
            } else {
                // 夕ラッシュ時間帯：米原到着後はそのまま米原留置場で入区させて終了
                let allowedCap = DEPOTS[stName] ? DEPOTS[stName].capacity : 0;
                if (DEPOTS[stName] && DEPOTS[stName].trains.length < allowedCap) {
                    this.game.ui.updateBanner(`【運転整理】${stName}駅 当駅止まりの普通 ${this.trainNo} は運用を終了し入区します。`, "banner-orange");
                    this.enterDepot(stName);
                } else {
                    if (!this.tryConvertDeadhead(stName)) {
                        this.game.ui.updateBanner(`【運転整理】${stName}駅 当駅止まりの普通 ${this.trainNo} は運用を終了し消滅します。`, "banner-orange");
                        this.remove();
                    }
                }
                return;
            }
        }

        // ★修正: 22:45以降および深夜帯は、折り返し運転を行わずに入庫(消滅)させるように早める
        if (hOfDay >= 22.75 || hOfDay < 4.0) {
            this.nextAction = "depot";
            this.remove();
            return;
        }

        // ★追加: 22:15以降の折り返しは優等種別を普通に降格し、遠距離走行を防ぐ
        if (hOfDay >= 22.25 && ["新快速", "快速"].includes(this.type)) {
            this.type = "普通";
        }

        // ★修正: 留置場がある駅での折り返しは、一旦留置場へ入庫させる
        //   (貨物は除く。特急も専用編成なので、通勤形用の電留線には入れない)
            if (this.type !== "貨物" && this.type !== "特急" &&
                DEPOTS[stName] && DEPOTS[stName].trains.length < DEPOTS[stName].capacity) {
                let depot = DEPOTS[stName];
                const newDir = this.dir * -1;
                let nextDest = this.game.spawner.getDestination(this.type, newDir, stName);
                // ★行先が始発駅と同じになった場合の代替。
                //   以前は上り=京都/下り=姫路と決め打ちしていたため、
                //   草津で上りに折り返した列車に「京都行き」(= 後方) が
                //   割り当てられ、終点に着けないまま走り続けていた。
                if (nextDest === this.startName) {
                    nextDest = this.game.spawner.fallbackTerminal(newDir, stName);
                }
                if (stName === "向日町操" && nextDest === "向日町操") nextDest = (newDir===1) ? "京都" : "大阪";
                
                // ★追加: 次の情報で上書きされる前に旧情報を保存（黒背景・白文字用）
                this.oldInfo = { type: this.type, dest: this.dest, trainNo: this.trainNo };

                this.game.spawner.activeTrainNos.delete(this.trainNo);
                let nextNo = this.game.spawner.generateTrainNumber(this.type, newDir, stName, this.trackId);
                
                this.depotOutConfig = { type: this.type, dest: nextDest, trainNo: nextNo, dir: newDir };
            
                // ★車両を留置場へ返却 (返却先は車両所グループに応じてFleetManagerが決める)
                this.game.fleet.release(stName, this.vehicles);
                this.vehicles = [];

                // 本線から消去して留置場へ
                blk.lanes[this.lane] = null;
                this.state = "in_depot";
            this.startName = stName;

            // ★修正: 既に出区待ちの列車がいれば、その次の始発列車として充当（待機時間を調整）
            let maxTimer = 0;
            depot.trains.forEach(t => {
                if (t.timer > maxTimer) maxTimer = t.timer;
            });
            // ★修正: 出区前の表示時間を長く確保するため、最低5分(300秒)留置。先客がいればその後ろ(+180秒)。
            this.timer = Math.max(300, maxTimer + 180); 
            
            depotAdd(stName, this);   // ★二重登録を防ぐためヘルパー経由にする
            return;
        }

        // ★改善④: 主要駅での折り返し時に、逆方向が詰まっている場合は積極的に入庫(消滅)させて密度を整える
        if (["姫路", "大久保", "西明石", "高槻", "京都"].includes(stName) && this.dest === stName) {
            let nextTrack = this.trackId.includes("Down") ? this.trackId.replace("Down", "Up") : this.trackId.replace("Up", "Down");
            let nextTrackOut = nextTrack.includes("In") ? nextTrack.replace("In", "Out") : nextTrack.replace("Out", "In");
            let freeLanesCount = 0;
            let congestedTrains = 0;
            
            [nextTrack, nextTrackOut].forEach(tid => {
                let tb = this.game.trackMgr.blocks[tid];
                if (tb) {
                    let b = tb.find(x => x.stationIdx === STATION_MAP[stName]);
                    if (b) {
                        freeLanesCount += b.lanes.filter(l => l === null).length;
                        // 折り返し先の路線の混雑状況を確認 (3駅分)
                        for(let k = 1; k <= UNITS_PER_STATION * 3; k++) {
                            let idx = b.index + (this.dir * -1 * k);
                            if (idx >= 0 && idx < tb.length) {
                                congestedTrains += tb[idx].lanes.filter(l => l !== null && l.dir === (this.dir * -1)).length;
                            }
                        }
                    }
                }
            });

            // 満線、逆方向が詰まっている、または待機時間が長すぎる場合は入庫(消滅)
            if (freeLanesCount === 0 || congestedTrains >= 3 || this.delayTime > 120 || this.stuckTime > 120) {
                let h = (this.game.currentTime / 3600) % 24;
                let isDaytime = (h >= 9.5 && h < 17.0);
                let allowedCap = (DEPOTS[stName]) ? (isDaytime ? Math.floor(DEPOTS[stName].capacity / 2) : DEPOTS[stName].capacity) : 0;
                if (this.type !== "貨物" && DEPOTS[stName] && DEPOTS[stName].trains.length < allowedCap) {
                    this.game.ui.updateBanner(`【運転整理】${stName}駅 列車密度調整(渋滞緩和)のため、折り返し予定の ${this.trainNo} は留置場に入区します。`, "banner-orange");
                    this.enterDepot(stName);
                } else {
                    if (!this.tryConvertDeadhead(stName)) {
                        this.game.ui.updateBanner(`【運転整理】${stName}駅 列車密度調整(渋滞緩和)のため、折り返し予定の ${this.trainNo} は消滅します。`, "banner-orange");
                        this.remove();
                    }
                }
                return;
            }
        }

        // ★改善①: 京都駅 上り列車の野洲・米原方面への延長運転（6:00〜8:30）

        // ★改善①: 京都駅 上り列車の野洲・米原方面への延長運転（6:00〜8:30）
        let timeH = (this.game.currentTime / 3600) % 24;
        if (stName === "京都" && this.dir === 1 && this.dest === "京都" && ["普通", "快速"].includes(this.type)) {
            // 深夜帯(22時以降)は延長運転を行わないように上限を22.0に変更
            if (timeH >= 6.0 && timeH < 22.0) {
                let upTrains = this.game.trains.filter(t => t.dir === 1 && t.trackId.startsWith("Up") && t.state !== "finished");
                let trailingToEast = false;
                let kyotoAroundCount = 1; 
                
                for (let t of upTrains) {
                    if (t === this) continue;
                    let dist = this.currBlockIndex - t.currBlockIndex;
                    
                    if (dist > 0 && dist <= Math.ceil(UNITS_PER_STATION * 3)) {
                        if (["普通", "快速"].includes(t.type) && ["野洲", "米原", "長浜", "近江塩津", "敦賀"].includes(t.dest)) {
                            trailingToEast = true;
                        }
                    }
                    if (dist >= 0 && dist <= Math.ceil(UNITS_PER_STATION * 2.5)) {
                        kyotoAroundCount++;
                    }
                }
                
                if (!trailingToEast && kyotoAroundCount >= 2) {
                    this.game.spawner.activeTrainNos.delete(this.trainNo); // ★追加
                    this.dest = (Math.random() < 0.5) ? "米原" : "野洲";
                    // ★追加: 快速へ格上げできるのは、いまの編成が快速の運用条件を満たす場合だけ。
                    //        207系・321系や6000番台は快速に使えないので、その場合は普通のまま延長する。
                    this.type = this.game.fleet.canServe(this.vehicles, "京都", "快速", this.trackId, this.dest)
                        ? "快速" : "普通";
                    this.trainNo = this.game.spawner.generateTrainNumber(this.type, 1, "京都", this.trackId);
                    this.nextAction = "turnback"; 
                    this.state = "running";
                    this.hasDeparted = true;
                    this.hasStoppedAtCurrent = false; // ★追加: 全停車駅通過バグ修正
                    this.timer = 15;
                    this.delayTime = 0;
                    this.isFinalStop = false; // ★修正: 延長運転時のフラグリセット
                    this.game.ui.updateBanner(`【運転整理】京都以東の列車確保のため、当駅止まりを ${this.trainNo}(${this.type}) ${this.dest}行き に変更し延長運転します。`, "banner-orange");
                    return;
                }
            }
        }

        

        // ★改善4: 西明石駅 下り折り返し列車の満線・飽和予測時の高度な運転整理
        if (stName === "西明石" && this.dir === -1) {
            let upTrackIn = this.trackId.replace("Down", "Up").replace("Out", "In");
            let upTrackOut = upTrackIn.replace("In", "Out");
            let freeLanesCount = 0;
            let approachingUpTrains = 0;

            [upTrackIn, upTrackOut].forEach(tid => {
                let tb = this.game.trackMgr.blocks[tid];
                if (tb) {
                    let b = tb.find(x => x.stationIdx === STATION_MAP["西明石"]);
                    if (b) {
                        freeLanesCount += b.lanes.filter(l => l === null).length;
                        let baseIndex = b.index;
                        for (let k = 1; k <= UNITS_PER_STATION * 4; k++) {
                            let idx = baseIndex - k;
                            if (idx >= 0 && idx < tb.length) {
                                approachingUpTrains += tb[idx].lanes.filter(l => l !== null && l.dir === 1).length;
                            }
                        }
                    }
                }
            });

            let isHeavyJam = (freeLanesCount === 0 && approachingUpTrains >= 2); 
            let isModerateJam = (freeLanesCount === 0 || approachingUpTrains >= freeLanesCount + 1); 

            if (isHeavyJam || isModerateJam) {
                let rand = Math.random();
                let action = "";

                if (isHeavyJam) {
                    action = (rand < 0.7) ? "depot" : "extend";
                } else {
                    if (rand < 0.4) action = "wait";
                    else if (rand < 0.8) action = "extend";
                    else action = "depot";
                }

                if (action === "depot") {
                    this.game.ui.updateBanner(`【運転整理】西明石駅 上り線飽和予測のため、${this.trainNo}は当駅で運転を打ち切り入庫します。`, "banner-orange");
                    this.remove();
                    return;
                } else if (action === "extend") {
                    let extendDest = ["大久保", "加古川", "姫路"];
                    this.dest = extendDest[Math.floor(Math.random() * extendDest.length)];
                    this.nextAction = "turnback"; 
                    this.state = "running";
                    this.hasDeparted = true;
                    this.hasStoppedAtCurrent = false; // ★追加: 全停車駅通過バグ修正
                    this.timer = 15;
                    this.delayTime = 0;
                    this.isFinalStop = false; // ★修正: 延長運転時のフラグリセット
                    this.game.ui.updateBanner(`【運転整理】西明石駅 混雑予測のため、${this.trainNo}を${this.dest}行きとして延長運転します。`, "banner-orange");
                    return;
                }else if (action === "wait") {
                    this.game.ui.updateBanner(`【運転整理】西明石駅 上り線混雑予測のため、${this.trainNo}は当駅で折り返し長期待機を行います。`, "banner-orange");
                    this.timer = 240; 
                    this.delayTime += 240;
                    return; 
                }
            }
        }

        const newDir = this.dir * -1;
        let newTrackId;
        if (this.trackId.includes("Kosei")) {
            newTrackId = newDir === 1 ? "Kosei_Up" : "Kosei_Down";
        } else if (this.trackId.includes("Fukuchi")) {
            newTrackId = newDir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
        } else if (this.trackId.includes("Tozai")) {
            newTrackId = newDir === 1 ? "Tozai_Up" : "Tozai_Down";
        } else {
            newTrackId = this.trackId.includes("Hoppo") ?
                (newDir===1?"Up_Out":"Down_Out") : (newDir===1 ? "Up_"+(this.trackId.includes("In")?"In":"Out") : "Down_"+(this.trackId.includes("In")?"In":"Out"));
        }
        
        if (blk.stationIdx !== undefined) {
            if ((blk.stationIdx < STATION_MAP["西明石"] || blk.stationIdx > STATION_MAP["草津"]) && newTrackId.includes("In")) {
                newTrackId = newTrackId.replace("In", "Out");
            }
        }

        const targetBlks = this.game.trackMgr.blocks[newTrackId];
        const newB = targetBlks.find(b => Math.abs(b.x - blk.x) < 5);
        if (newB) {
            let freeLanes = newB.lanes.filter(l => l === null).length;
            if (freeLanes <= 1) { 
                let approachingHigher = false;
                let checkDistBehind = UNITS_PER_STATION * 2 + 2; 
                for (let k = 1; k <= checkDistBehind; k++) {
                    let idx = newB.index - (newDir * k);
                    if (idx >= 0 && idx < targetBlks.length) {
                        let trainsBehind = targetBlks[idx].lanes.filter(l => l !== null && l.dir === newDir);
                        if (trainsBehind.some(tb => PRIORITY[tb.type] > PRIORITY[this.type])) {
                            approachingHigher = true;
                            break;
                        }
                    }
                }
                if (approachingHigher) {
                    this.timer = 30; 
                    return;
                }
            }

            let tl = -1;
            if (this.startName === "向日町操" || blk.hoppoStationName === "向日町操" || stName === "向日町操") {
                for(let l=newB.lanes.length-1; l>=0; l--) { if(newB.lanes[l]===null) { tl=l; break; } }
            } else {
                for(let l=newB.lanes.length-1; l>0; l--) { if(newB.lanes[l]===null) { tl=l; break; } }
                if (tl === -1 && newB.lanes[0] === null) { tl = 0; }
            }
            
            if (tl !== -1) {
                blk.lanes[this.lane] = null;
                this.trackId = newTrackId; this.dir = newDir; this.currBlockIndex = newB.index; this.lane = tl;
                newB.lanes[tl] = this;
                if (!["回送","貨物","臨時","特急"].includes(this.type)) {
                    this.dest = this.game.spawner.getDestination(this.type, this.dir, stName);
                    if (this.dest === this.startName) {
                        this.dest = this.game.spawner.fallbackTerminal(this.dir, stName);
                    }
                    
                    // ★追加: 近江塩津・敦賀からの下り普通は米原行きとする（琵琶湖線経由）
                    if (this.dir === -1 && this.type === "普通" && ["敦賀", "近江塩津"].includes(stName) && !this.trackId.includes("Kosei")) {
                        this.dest = "米原";
                    }

                    this.game.spawner.activeTrainNos.delete(this.trainNo); // ★追加
                    this.trainNo =this.game.spawner.generateTrainNumber(this.type, this.dir, stName, this.trackId);
                    this.dutyName = this.trainNo;   // 一般の営業列車は運用名=列車番号
                    // ★折り返して別の列車になったので、始発駅もこの駅に更新する。
                    //   以前は最初に出区した駅のままだったため、
                    //   「草津発の列車が宝塚線を走っている」ように見え、
                    //   車両の適合判定も間違った線区で行われていた。
                    this.startName = stName;
                }
                if (stName === "向日町操" && this.dest === "向日町操") this.dest = (this.dir===1) ? "京都" : "大阪";
                
                // ★修正: 折り返しのたびに編成を留置場へ戻して引き直していたため、
                //        使える留置場に戻らない編成がどんどん滞留し、やがて車両が
                //        足りなくなって列車が生成されなくなっていた。
                //        実際の運用と同じく、折り返し後の運用条件を満たす編成なら
                //        そのまま続投させ、満たさないときだけ差し替える。
                let newVehicles = this.game.fleet.reassign(stName, this.type, newTrackId, this.dest, this.dutyName || this.trainNo, this.vehicles);
                if (!newVehicles || newVehicles.length === 0) {
                    this.game.ui.updateBanner(`【運休】${stName}駅 車両枯渇のため、折り返し予定の ${this.trainNo} は運休(消滅)となります。`, "banner-orange");
                    this.remove();
                    return;
                }
                this.vehicles = newVehicles;

                this.state = "waiting_start"; this.timer = 15; this.stuckTime = 0; this.hasStoppedAtCurrent = false; 
                this.hasDeparted = false;
                this.delayTime = 0; 
                this.isFinalStop = false; // ★修正: 折り返し発車時のフラグリセット
                
                if (this.nextAction === "stop_opposite_home") {
                    this.isManuallySuspended = true;
                    this.manualSuspendTimer = 0;
                    this.hasNotifiedSuspendLong = false;
                    this.nextAction = "turnback"; // 次回リセット
                    this.game.ui.updateBanner(`【指令】${this.trainNo} は ${stName}駅にて折り返し、反対方面ホームで抑止手配されました。`, "banner-orange");
                }
                return;
            }
        }
        this.timer = 15;
};

Train.prototype.triggerMinorTrouble = function () {
        if (this.state === "running") {
            this.state = "stopped";
            this.minorTrouble = true;
            
            // 発生区間の取得 (hoppoStationNameを優先し、他線路の誤表示を防ぐ)
            const blks = this.game.trackMgr.blocks[this.trackId];
            let location = "駅間";
            if (blks && blks[this.currBlockIndex]) {
                const b = blks[this.currBlockIndex];
                if (b.hoppoStationName) {
                    location = b.hoppoStationName + "駅";
                } else if (b.stationIdx >= 0 && STATIONS[b.stationIdx]) {
                    location = STATIONS[b.stationIdx].name + "駅";
                } else {
                    for(let i = 1; i < 5; i++) {
                        let prev = blks[this.currBlockIndex - i];
                        let next = blks[this.currBlockIndex + i];
                        if (prev && prev.hoppoStationName) { location = prev.hoppoStationName + "駅付近"; break; }
                        if (next && next.hoppoStationName) { location = next.hoppoStationName + "駅付近"; break; }
                        if (prev && prev.stationIdx >= 0) { location = STATIONS[prev.stationIdx].name + "駅付近"; break; }
                        if (next && next.stationIdx >= 0) { location = STATIONS[next.stationIdx].name + "駅付近"; break; }
                    }
                }
            }

            let r = Math.random();
            if (r < 0.25) { // 踏切系
                this.minorTroubleTimer = 120 + Math.floor(Math.random() * 180);
                if (Math.random() < 0.5) {
                    this.troubleInfo = { active: true, cause: "踏切安全確認", status: "確認中", timer: this.minorTroubleTimer, location: location };
                    this.game.ui.updateBanner(`【乗務員連絡】${location}の踏切で非常ボタンの動作を受信したため、機外停車しました。安全確認を行います。（${this.trainNo}）`, "banner-blue");
                } else {
                    this.troubleInfo = { active: true, cause: "踏切直前横断", status: "確認中", timer: this.minorTroubleTimer, location: location };
                    this.game.ui.updateBanner(`【乗務員連絡】${location}の踏切で直前横断があったため非常停車しました。接触の有無を確認します。（${this.trainNo}）`, "banner-blue");
                }
            } else if (r < 0.5) { // 車両・設備系
                this.minorTroubleTimer = 180 + Math.floor(Math.random() * 120);
                let subR = Math.random();
                if (subR < 0.33) {
                    this.troubleInfo = { active: true, cause: "異音感知", status: "床下点検中", timer: this.minorTroubleTimer, location: location };
                    this.game.ui.updateBanner(`【乗務員連絡】${location}走行中、床下から異音を感知しました。走行に支障はありませんが、念のため床下点検を行います。（${this.trainNo}）`, "banner-blue");
                } else if (subR < 0.66) {
                    this.troubleInfo = { active: true, cause: "ドア点検", status: "動作確認中", timer: this.minorTroubleTimer, location: location };
                    this.game.ui.updateBanner(`【乗務員連絡】${location}にて、一部ドアの開閉ランプに異常表示が出ました。係員による動作確認を行います。（${this.trainNo}）`, "banner-blue");
                } else {
                    this.troubleInfo = { active: true, cause: "窓ガラス破損", status: "被害確認中", timer: this.minorTroubleTimer, location: location };
                    this.game.ui.updateBanner(`【乗務員連絡】${location}にて、飛来物により窓ガラスがヒビ割れしたとの申告あり。状況を確認します。（${this.trainNo}）`, "banner-blue");
                }
            } else { // 旅客系・沿線系
                this.minorTroubleTimer = 300 + Math.floor(Math.random() * 1500);
                const causes = [
                    { c: "急病人救護", m: "車内で急病人が発生しました。救急隊の手配と救護活動を行います。" },
                    { c: "車内トラブル", m: "車内でお客様同士のトラブルが発生しています。警察の到着を待ちます。" },
                    { c: "不審物発見", m: "車内に不審な荷物が放置されているのを発見しました。安全確認を行います。" },
                    { c: "線路内立入", m: "付近の線路内に人が立ち入ったとの情報があり、安全確認のため停車しています。" },
                    { c: "動物と接触", m: "走行中に小動物と接触したため、車両および線路の点検を行います。" },
                    { c: "架線付着物", m: "前方の架線に飛来物（ビニール等）が付着しているのを発見しました。撤去手配をお願いします。" },
                    { c: "信号トラブル", m: "前方の信号機が赤のまま切り替わらないため、指令の指示を待っています。" }
                ];
                const selected = causes[Math.floor(Math.random() * causes.length)];
                this.troubleInfo = { active: true, cause: selected.c, status: "確認中", timer: this.minorTroubleTimer, location: location };
                this.game.ui.updateBanner(`【乗務員連絡】${location}での${this.trainNo}からの報告です。${selected.m}`, "banner-blue");
            }
        }
};

Train.prototype.handleMinorTrouble = function () {
        if (this.isJudging) {
            this.judgeTimer -= CONFIG.TICK_SEC;
            if (this.judgeTimer <= 0) {
                // 自動再開（介入なし）
                this.isJudging = false;
                this.minorTrouble = false;
                this.troubleInfo.active = false;
                this.state = "running";
                this.timer = 15;
                this.game.ui.updateBanner(`【自動再開】${this.troubleInfo.location}での ${this.trainNo} は指令からの指示がないため、自動的に運転を再開しました。`, "banner-orange");
            } else {
                let remStr = Math.ceil(this.judgeTimer);
                this.game.ui.updateBanner(`【指令待ち】${this.troubleInfo.location} ${this.trainNo} - 現場対応完了。指令からの運行継続ジャッジ待ちです。(残り約${remStr}秒)`, "banner-orange");
            }
            return;
        }

        this.minorTroubleTimer -= CONFIG.TICK_SEC;
        this.troubleInfo.timer = this.minorTroubleTimer;
        const rem = Math.ceil(this.minorTroubleTimer / 60);
        if (rem > 15) this.troubleInfo.status = "係員手配中";
        else if (rem > 5) this.troubleInfo.status = "現場確認中"; else this.troubleInfo.status = "点検終了・再開準備";
        
        if (this.minorTroubleTimer <= 0) {
            // ジャッジ状態へ移行
            this.isJudging = true;
            this.judgeTimer = 60;
            this.game.ui.updateBanner(`【乗務員連絡】${this.troubleInfo.location}での ${this.trainNo} ${this.troubleInfo.cause}の現場対応が完了しました。営業を継続するか、回送に打ち切るか指示をお願いします。(1分後に自動再開)`, "banner-blue");
        } else {
            this.game.ui.updateBanner(`【${this.troubleInfo.cause}】${this.troubleInfo.location} ${this.trainNo} - ${this.troubleInfo.status} (再開見込:約${rem}分)`, "banner-orange");
        }
};

Train.prototype.getPriority = function () {
        let p = PRIORITY[this.type];
        if (this.type === "普通" && (this.trackId === "Up_In" || this.trackId === "Down_In")) {
            const blks = this.game.trackMgr.blocks[this.trackId];
            if (blks && blks[this.currBlockIndex]) {
                const stIdx = blks[this.currBlockIndex].stationIdx;
                // 高槻～京都間内側線は普通と快速の優先度を同じにする
                if (stIdx >= STATION_MAP["高槻"] && stIdx <= STATION_MAP["京都"]) {
                    p = PRIORITY["快速"]; 
                }
            }
        }
        return p;
};

Train.prototype.calcTravelTime = function () {
        let baseTime = (this.type === "普通") ? 75 : 60; // 既存の基本時間を取得

        // 高槻～京都間内側線の既存特例処理は維持
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (blks && blks[this.currBlockIndex]) {
            const stIdx = blks[this.currBlockIndex].stationIdx;
            if (this.type === "普通" && (this.trackId === "Up_In" || this.trackId === "Down_In")) {
                if (stIdx >= STATION_MAP["高槻"] && stIdx <= STATION_MAP["京都"]) {
                    baseTime = 60;
                }
            }
        }

        // --- ここから追加：協調型追従ロジック ---
        if (!blks) return baseTime;

        // 【追加】運転見合わせ区間および異常列車への接近に伴う減速ロジック
        let suspendAheadDist = -1;
        for (let m of this.game.trackMgr.manualSuspensions) {
            if (m.trackId === this.trackId) {
                if (this.dir === 1 && m.start > this.currBlockIndex) {
                    if (suspendAheadDist === -1 || (m.start - this.currBlockIndex) < suspendAheadDist) {
                        suspendAheadDist = m.start - this.currBlockIndex;
                    }
                } else if (this.dir === -1 && m.end < this.currBlockIndex) {
                    if (suspendAheadDist === -1 || (this.currBlockIndex - m.end) < suspendAheadDist) {
                        suspendAheadDist = this.currBlockIndex - m.end;
                    }
                }
            }
        }
        
        let suspendSlowdown = 1.0;
        if (suspendAheadDist !== -1) {
            let slowThreshold = UNITS_PER_STATION * 20; // かなり手前(約20駅分)から波及させる
            if (suspendAheadDist < slowThreshold) {
                suspendSlowdown = 1.0 + (1.0 - (suspendAheadDist / slowThreshold)) * 1.0; // 最大2.0倍の時間がかかる(減速)
                if (this.game.emergencyState && this.game.emergencyState.timer > 600) {
                    suspendSlowdown *= 1.2; // 長引きそうならさらに減速
                }
            }
        }

        // ★追加: 個別トラブル列車への接近減速ロジック
        let troubleAheadDist = -1;
        let troubleSlowdown = 1.0;
        const maxScanTrouble = UNITS_PER_STATION * 15; // 約15駅分スキャン
        for (let k = 1; k <= maxScanTrouble; k++) {
            let idx = this.currBlockIndex + (this.dir * k);
            if (idx < 0 || idx >= blks.length) break;
            
            // 同一方向で異常のある列車を探す（トラブル、個別抑止、異常スタック）
            let hasTrouble = blks[idx].lanes.some(l => l !== null && l.dir === this.dir && (l.minorTrouble || l.isManuallySuspended || l.stuckTime > 180));
            if (hasTrouble) {
                troubleAheadDist = k;
                break;
            }
        }
        if (troubleAheadDist !== -1) {
            let slowThreshold = UNITS_PER_STATION * 15;
            if (troubleAheadDist < slowThreshold) {
                troubleSlowdown = 1.0 + (1.0 - (troubleAheadDist / slowThreshold)) * 1.5; // 最大2.5倍の時間がかかる(減速)
            }
        }

        // 両方の減速係数のうち、大きい方（より遅くなる方）を適用する
        suspendSlowdown = Math.max(suspendSlowdown, troubleSlowdown);
        // 【追加終了】

        const maxScan = UNITS_PER_STATION * 10;
        let Df = maxScan; // 前方距離
        let Db = maxScan; // 後方距離

        // 1. 前方スキャン
        for (let k = 1; k <= maxScan; k++) {
            let idx = this.currBlockIndex + (this.dir * k);
            if (idx < 0 || idx >= blks.length) break;
            if (blks[idx].lanes.some(l => l !== null && l.dir === this.dir)) {
                Df = k;
                break;
            }
        }

        // 2. 後方スキャン
        for (let k = 1; k <= maxScan; k++) {
            let idx = this.currBlockIndex - (this.dir * k);
            if (idx < 0 || idx >= blks.length) break;
            if (blks[idx].lanes.some(l => l !== null && l.dir === this.dir)) {
                Db = k;
                break;
            }
        }

        // 3. 補正計算
        const k_factor = 0.03; // 感度係数（適宜調整）
        let adjTime = baseTime * (1 + k_factor * (Db - Df));

        // 【変更】suspendSlowdown を乗算
        adjTime *= suspendSlowdown;

        // 4. リミッター適用（減速上限を2.0倍から3.0倍に緩和）
        adjTime = Math.max(baseTime * 0.6, Math.min(baseTime * 3.0, adjTime));

        // ★追加: 減速判定フラグ（基本時間の1.1倍以上時間がかかっている場合を減速とする）
        this.isDecelerating = (adjTime > baseTime * 1.1);

        return Math.ceil(adjTime);
};
