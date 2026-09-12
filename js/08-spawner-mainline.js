/* このファイルは index.html から分割されたものです。
   Spawner: 東海道・山陽本線(琵琶湖線/京都線/神戸線)の列車生成 */
Spawner.prototype.checkIntervalSpawns = function (ct) {
        let h = (ct / 3600) % 24;
        let timeFactor = 0.58; 
        if (h >= 6.0 && h < 6.5) { timeFactor = 0.35; } 
        else if (h >= 6.5 && h < 7.5) { timeFactor = 0.20; } 
        else if (h >= 7.5 && h < 8.5) { timeFactor = 0.40; } 
        else if (h >= 8.5 && h < 9.5) { timeFactor = 0.70; } 
        else if (h >= 9.5 && h < 10) { timeFactor = 0.90; } 
        else if (h >= 10 && h < 17) { timeFactor = 1.8; } 
        else if (h >= 17 && h < 19.5) { timeFactor = 0.35; } 
        else if (h >= 19.5) { timeFactor = 0.8; }
        
        const isPeak = (h >= 6.5 && h < 7.5) || (h >= 17 && h < 19.5);
        const isDaytime = (h >= 10 && h < 17);
        const isMorningRush = (h >= 6.0 && h < 8.5);
        ["Up", "Down"].forEach(dirName => {
            const dir = (dirName === "Up") ? 1 : -1;

            for (let type in INTERVALS) {
                if (dirName === "Down" && type === "特急") {
                    if (ct >= this.nextMukoHamakazeTime) { this.spawnTokkyu(dirName, "hamakaze"); this.nextMukoHamakazeTime += 5400; }
                    else if (ct >= this.nextMukoKounotoriTime) { this.spawnTokkyu(dirName, "kounotori"); this.nextMukoKounotoriTime += 5400; }
                }
                if (type === "快速" && h < 4.5) continue;

                if (ct >= this.nextSpawnTime[dirName][type]) {
                    let spawned = true;
                    if (type === "特急") this.spawnTokkyu(dirName);
                    else spawned = this.trySpawn(type, dir);

                    if (spawned === false) {
                        this.nextSpawnTime[dirName][type] += 90;
                    } else {
                        let interval = INTERVALS[type] * timeFactor;
                        if(type==="貨物") interval = (10+Math.random()*7)*60;
                        
                        // ★改善: 新快速の生成速度を全体的に落とす
                        if (type === "新快速") interval = INTERVALS["新快速"] * (isPeak ? 0.9 : 1.5);
                        if (dirName === "Down" && type === "快速" && Math.random() < 0.1) interval *= 0.6;

                        if (type === "快速") {
                            interval *= (1 / 0.75);
                            if (!isPeak) interval *= 1.25; 
                        }

                        // ★改善: 普通列車の本数を全体的に少し増やす（昼間でも2.5駅ごとの本数をしっかり生成するため係数を引き上げ）
                        if (type === "普通") {
                            const boost = isPeak ? 3.5 : (isDaytime ? 3.0 : 2.8); 
                            interval = interval / boost;
                        }
                        this.nextSpawnTime[dirName][type] += interval;
                    }
                }
            }
        });
};

Spawner.prototype.getTimeMultiplier = function (st, type, dir, isStart, ct) {
        let h = (ct / 3600) % 24;
        let isMorning = (h >= 5 && h < 9);
        let isEvening = (h >= 17 && h < 21);
        let mult = 1.0;

        if (isMorning) {
            if (isStart) {
                // 神戸線側の駅を追加し、西側からの生成を活性化
                if (["野洲", "草津", "大阪", "西明石", "姫路"].includes(st)) mult *= 1.5;
                if (["高槻", "加古川", "神戸"].includes(st)) mult *= 1.3;
                if (["米原", "京都"].includes(st)) mult *= 1.2;
            } else {
                if (["大阪", "野洲", "草津", "西明石", "姫路"].includes(st)) mult *= 1.5;
                if (["高槻", "加古川"].includes(st)) mult *= 1.3;
                if (["京都", "米原"].includes(st)) mult *= 1.2;
            }
        } else if (isEvening) {
            if (!isStart) {
                // 夕方は両端の駅への到着ウェイトを強化
                if (["米原", "長浜", "姫路", "西明石"].includes(st)) mult *= 1.5;
                if (["敦賀", "野洲"].includes(st)) mult *= 1.8;
                if (st === "近江今津") mult *= 1.3;
            }
        }
        return mult;
};

Spawner.prototype.spawnTokkyu = function (dirName, forcedType = null) {
        if (Math.random() < 0.3 && !forcedType) return;
        let t = null; let num = 0;
        if (dirName === "Up") { 
            let r = Math.random();
            if (r < 0.1) { 
                num = this.tokkyuCounters["はまかぜ"].up; this.tokkyuCounters["はまかぜ"].up += 2;
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"大阪", startName:"姫路", name:`はまかぜ${num}号`, serviceChange:{ at:"大阪", type:"回送", dest:"向日町操", name:`回${num+8000}D` }};
            } else if (r < 0.2) { 
                num = this.tokkyuCounters["こうのとり"].up; this.tokkyuCounters["こうのとり"].up += 2;
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"新大阪", startName:"尼崎", name:`こうのとり${num}号`, serviceChange:{ at:"新大阪", type:"回送", dest:"向日町操", name:`回${num+3000}M` }};
            } else if (r < 0.45) { 
                num = this.tokkyuCounters["Sはくと"].up; this.tokkyuCounters["Sはくと"].up += 2;
                // ★デッドロック対策: 京都駅到着後に消滅させる
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"京都", startName:"姫路", name:`Sはくと${num}号`, nextAction: "depot"};
            } else if (r < 0.7) { 
                // ★サンダーバード追加
                num = this.tokkyuCounters["サンダーバード"].up; this.tokkyuCounters["サンダーバード"].up += 2;
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"敦賀", startName:"大阪", name:`サンダーバード${num}号`, nextAction: "depot"};
            } else { 
                // ★はるか追加
                num = this.tokkyuCounters["はるか"].up; this.tokkyuCounters["はるか"].up += 2;
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"京都", startName:"新大阪", name:`はるか${num}号`, nextAction: "depot"};
            }
        } else { 
            let r = Math.random();
            if (forcedType === "hamakaze" || (forcedType === null && r < 0.1)) {
                let deadheadNo = "回" + (4000 + Math.floor(Math.random()*100)) + "D";
                num = this.tokkyuCounters["はまかぜ"].down; this.tokkyuCounters["はまかぜ"].down += 2;
                t = {type:"回送", dir:-1, trackId:"Down_Out", dest:"大阪", startName:"向日町操", name:deadheadNo, serviceChange:{ at:"大阪", type:"特急", dest:"鳥取", name:`はまかぜ${num}号` }};
            } else if (forcedType === "kounotori" || (forcedType === null && r < 0.2)) {
                let deadheadNo = "回" + (3000 + Math.floor(Math.random()*100)) + "M";
                num = this.tokkyuCounters["こうのとり"].down; this.tokkyuCounters["こうのとり"].down += 2;
                t = {type:"回送", dir:-1, trackId:"Down_Out", dest:"新大阪", startName:"向日町操", name:deadheadNo, serviceChange:{ at:"新大阪", type:"特急", dest:"尼崎", name:`こうのとり${num}号` }};
            } else if (forcedType === null) { 
                if (r < 0.45) {
                    num = this.tokkyuCounters["Sはくと"].down; this.tokkyuCounters["Sはくと"].down += 2;
                    // ★デッドロック対策: 到着後に消滅させる
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"鳥取", startName:"京都", name:`Sはくと${num}号`, nextAction: "depot"};
                } else if (r < 0.7) {
                    // ★サンダーバード追加
                    num = this.tokkyuCounters["サンダーバード"].down; this.tokkyuCounters["サンダーバード"].down += 2;
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"大阪", startName:"敦賀", name:`サンダーバード${num}号`, nextAction: "depot"};
                } else {
                    // ★はるか追加
                    num = this.tokkyuCounters["はるか"].down; this.tokkyuCounters["はるか"].down += 2;
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"新大阪", startName:"京都", name:`はるか${num}号`, nextAction: "depot"};
                }
            }
        }
        if(t) this.game.addTrain(t);
};

Spawner.prototype.trySpawn = function (type, dir) {
        // ★追加: 22時以降の段階的な優等列車の削減
        let hOfDay = (this.game.currentTime / 3600) % 24;
        if (hOfDay >= 22.0 || hOfDay < 4.0) {
            if (hOfDay >= 22.5 && type === "新快速") return false; // 22:30以降 新快速生成停止
            if (hOfDay >= 23.0 && type === "快速") return false;   // 23:00以降 快速生成停止
            if (hOfDay >= 23.0 && type === "特急") return false;   // 23:00以降 特急生成停止
        }

        // ★追加: 新快速の生成本数を制限し、既存列車の折り返しに任せる
        if (type === "新快速") {
            let activeSR = this.game.trains.filter(t => t.type === "新快速" && t.state !== "finished").length;
            if (activeSR >= 18) {
                return false; // 上限に達していれば新規生成を見送る
            }
        }
        let trackId = "";
        if (type === "貨物" || type === "回送") trackId = (dir===1) ? "Up_Out" : "Down_Out";
        else trackId = (type==="普通"||type==="快速") ? (dir===1?"Up_In":"Down_In") : (dir===1?"Up_Out":"Down_Out");
        
        let candidates = [];
        if (type === "貨物" || type === "回送") {
            if (type === "貨物") {
                if (dir === 1) {
                    candidates = Math.random() < 0.5 ? ["姫路"] : ["吹田貨"];
                } else {
                    let r = Math.random();
                    candidates = r < 0.15 ? ["敦賀"] : (r < 0.57 ? ["米原"] : ["吹田貨"]);
                }
            } else {
                candidates = (dir === 1) ? [] : ["京都"];
            }
        } else {
            const getStartOptions = () => {
                if (dir === -1) { 
                    // ★修正: 琵琶湖線上り方面データ（京都・高槻）に基づく始発駅比率
                    if (type === "新快速") return [{n:"野洲",w:25}, {n:"米原",w:25}, {n:"長浜",w:12}, {n:"敦賀",w:23}, {n:"近江今津",w:15}];
                    if (type === "快速") return [{n:"京都",w:59}, {n:"米原",w:12}, {n:"野洲",w:12}, {n:"草津",w:17}];
                    // ★事象②改善: 京都方面からの普通を増やし、高槻始発も増やす
                    if (type === "普通") return [{n:"京都",w:50}, {n:"草津",w:25}, {n:"高槻",w:25}];
                    if (type === "特急") return [{n:"敦賀",w:34}, {n:"米原",w:33}, {n:"京都",w:33}];
                } else { 
                    // ★修正: 姫路駅での快速・新快速の生成比率を少し下げる
                    if (type === "新快速") return [{n:"姫路",w:40}, {n:"網干",w:38}, {n:"播州赤穂",w:15}, {n:"上郡",w:7}];
                    if (type === "快速") return [{n:"網干",w:60}, {n:"加古川",w:30}, {n:"姫路",w:10}];
                    // ★事象②改善: 大阪・尼崎発の普通を増やし、大阪以東(京都方面)へ向かう列車の総数を増やす
                    if (type === "普通") return [{n:"西明石",w:25}, {n:"新三田",w:23}, {n:"大阪",w:15}, {n:"尼崎",w:10}, {n:"須磨",w:17}, {n:"宝塚",w:9}, {n:"神戸",w:1}];
                    if (type === "特急") return [{n:"姫路",w:100}];
                }
                return [{n:"姫路",w:100}];
            };
            let options = getStartOptions();
            let totalW = 0;
            options.forEach(o => {
                o.w *= this.getTimeMultiplier(o.n, type, dir, true, this.game.currentTime);
                totalW += o.w;
            });
            for(let i=0; i<5; i++) {
                let r = Math.random() * totalW, s = 0;
                for(let o of options) {
                    s += o.w;
                    if(r < s) { candidates.push(o.n); break; }
                }
            }
        }
        if (candidates.length === 0) return false;

        let availableCandidates = [];
        for (let stName of candidates) {
            let checkTrackId = trackId;
            if (["姫路","加古川"].includes(stName)) checkTrackId = checkTrackId.replace("In", "Out");
            let blks = this.game.trackMgr.blocks[checkTrackId];
            let stIdx = STATION_MAP[stName]; // ★修正: STARTERSではなくSTATION_MAPを使用
            
            if (blks && stIdx !== undefined) {
                let startBlk = blks.find(b => b.stationIdx === stIdx);
                if (startBlk) {
                    let count = 0;
                  // ★改善点③: 新快速の生成時は探索範囲を広げ、近くにいる場合は生成を見送る
                    let radius = (type === "新快速") ? Math.ceil(UNITS_PER_STATION * 5) : UNITS_PER_STATION * 2;
                    let maxAllowed = (type === "新快速") ? 1 : 2; // 新快速は範囲内に1本でもいれば除外

                for (let k = -radius; k <= radius; k++) {
                   let idx = startBlk.index + k;
                   if (idx >= 0 && idx < blks.length) {
                if (blks[idx].lanes.some(l => l !== null && l.type === type)) count++;
                 }
                }
                if (count < maxAllowed) availableCandidates.push(stName); 
                } else {
                    availableCandidates.push(stName);
                }
            } else {
                availableCandidates.push(stName);
            }
        }

        if (availableCandidates.length === 0) return false;
        let startName = availableCandidates[Math.floor(Math.random() * availableCandidates.length)];

        if (type === "貨物") {
            if (startName === "吹田貨") {
                trackId = (dir === 1) ? "Up_Hoppo" : "Down_Hoppo";
            } else if (startName === "敦賀" && dir === -1) {
                trackId = "Kosei_Down";
            }
        }

        // ★事象1対応: 西明石以西（加古川・姫路・網干等）発の上り快速の生成スピードを現在の6割にする
        if (dir === 1 && type === "快速" && ["姫路", "加古川", "網干", "播州赤穂", "上郡"].includes(startName)) {
            // 4割の確率で生成をスキップしつつ、生成完了扱いにしてインターバルを進める
            if (Math.random() < 0.4) {
                return true; 
            }
        }

        // ★追加: 姫路～西明石間が詰まりすぎた場合、姫路・加古川などからの上り列車生成を一時中断
        if (dir === 1 && ["姫路", "加古川", "網干", "播入赤穂", "上郡"].includes(startName)) {
            let tCount = 0;
            ["Up_Out", "Up_In"].forEach(tid => {
                let checkBlks = this.game.trackMgr.blocks[tid];
                if (checkBlks) {
                    let sB = checkBlks.find(b => b.stationIdx === STATION_MAP["姫路"]);
                    let eB = checkBlks.find(b => b.stationIdx === STATION_MAP["西明石"]);
                    if (sB && eB) {
                        for (let i = sB.index; i <= eB.index; i++) {
                            if (checkBlks[i].lanes.some(l => l !== null && l.dir === 1)) tCount++;
                        }
                    }
                }
            });
            // 区間内に一定数(例: 10本)以上の列車がいる場合は生成をキャンセルして次回に回す
            if (tCount >= 10) return false;
        }

        // ★改善: 西明石駅始発の生成条件を厳格化 (上り線満線予測時は生成キャンセルの措置)
        if (startName === "西明石") {
            if (type !== "普通" && type !== "快速") return false;
            let freeCount = 0;
            ["Up_In", "Up_Out"].forEach(tid => {
                let blks = this.game.trackMgr.blocks[tid];
                if (blks) {
                    let b = blks.find(blk => blk.stationIdx === STATION_MAP["西明石"]);
                    if (b) freeCount += b.lanes.filter(l => l === null).length;
                }
            });
            // 西明石の上り線空きレーンが2未満の場合は、既存列車の折り返しを優先するため生成をスキップ
            if (freeCount < 2) return false;
        }

        if (startName === "京都" && dir === -1 && Math.random() < 0.05 && (type==="回送")) startName = "向日町操";
        if (["姫路","加古川"].includes(startName)) trackId = trackId.replace("In", "Out");

        // ★修正: STARTERSではなく全駅のインデックスを取得して正しく草津以北判定を行う
        let startStIdx = STATION_MAP[startName];
        if (startStIdx !== undefined && startStIdx > STATION_MAP["草津"]) {
            trackId = trackId.replace("In", "Out");
        }

        let startBlk = null;
        let blks = this.game.trackMgr.blocks[trackId];
        if (blks) {
            if (startStIdx !== undefined) {
                startBlk = blks.find(b => b.stationIdx === startStIdx);
            } else {
                startBlk = blks.find(b => b.hoppoStationName === startName);
            }
        }

        if (startBlk) {
            if (type === "貨物") {
                let freightAheadDist = -1;
                for (let k = 1; k <= 16 * UNITS_PER_STATION; k++) {
                    let idx = startBlk.index + (dir * k);
                    if (idx >= 0 && idx < blks.length) {
                        if (blks[idx].lanes.some(l => l !== null && l.type === "貨物" && l.dir === dir)) {
                            freightAheadDist = k;
                            break;
                        }
                    }
                }
                if (freightAheadDist !== -1 && freightAheadDist < 3 * UNITS_PER_STATION) {
                    return false;
                }
            }

            if (startStIdx !== undefined) {
                // ① 昼間の閑散時間帯でも本数を確保するため、普通列車の干渉チェック距離を「2.5駅(約8ブロック)」に短縮
                let scanDist = (type === "普通") ? Math.ceil(UNITS_PER_STATION * 2.5) : 6;
                if (type === "特急") scanDist = 12;
                
                // ① 前方列車のチェック（既存の被り防止）
                for(let k=1; k<=scanDist; k++) {
                    let idx = startBlk.index + (dir * k);
                    if(idx >= 0 && idx < blks.length && blks[idx].lanes.some(l => l !== null)) return false;
                }
                
                // ② 追加：満線回避ロジック（後方から優等列車が接近している場合は生成キャンセル）
                let freeLanes = startBlk.lanes.filter(l => l === null).length;
                if (freeLanes <= 1) { // 自分が生成されると空きがなくなる場合
                    let approachingHigher = false;
                    let checkDistBehind = UNITS_PER_STATION * 2 + 2; // 後方約2駅分
                    for (let k = 1; k <= checkDistBehind; k++) {
                        let idx = startBlk.index - (dir * k);
                        if (idx >= 0 && idx < blks.length) {
                            let trainsBehind = blks[idx].lanes.filter(l => l !== null && l.dir === dir);
                            if (trainsBehind.some(tb => PRIORITY[tb.type] > PRIORITY[type])) {
                                approachingHigher = true;
                                break;
                            }
                        }
                    }
                    if (approachingHigher) return false;
                }
            }
        }

        // ★変更: 目的地を事前に決定し、折り返し先の状況を確認できるようにする
        const dest = this.getDestination(type, dir, startName);
        
        // ★追加：目的地決定後、尼崎合流地点での高度なETA干渉チェック（東西・福知山線との予測譲り合い）
        if (this.willConflictAtAmagasaki(startName, dest, type, dir)) {
            return false; // 被る場合は生成をスキップして次回のインターバルへ回す
        }

        const t = { type, dir, trackId, dest: dest, startName };
        
        if (type === "貨物" || type === "回送") {
            t.nextAction = "depot"; // 貨物と回送は折り返さず必ず消滅させる
        } else {
            let h = (this.game.currentTime / 3600) % 24;
            if (h >= 10 && h < 17) {
                // ★改善②: ランダム確率ではなく、折り返し先の局所的な列車密度や詰まり状況に基づいて入庫(消滅)を動的判定
                t.nextAction = "turnback"; // デフォルトは折り返し
                
                let destIdx = STATION_MAP[dest];
                if (destIdx !== undefined) {
                    let newDir = dir * -1;
                    // 折り返し後の予想トラックID（単純にUpとDownを反転）
                    let newTrackId = trackId.includes("Up") ? trackId.replace("Up", "Down") : trackId.replace("Down", "Up");
                    
                    let targetBlks = this.game.trackMgr.blocks[newTrackId];
                    if (targetBlks) {
                        let destBlk = targetBlks.find(b => b.stationIdx === destIdx);
                        if (destBlk) {
                            // 基準間隔（ブロック数）の定義
                            // 普通: 2.5駅分, 快速・新快速: 5.5駅分
                            let checkStations = (type === "普通") ? 2.5 : 5.5;
                            let checkDist = Math.ceil(UNITS_PER_STATION * checkStations);
                            
                            let trainCount = 0;
                            let hasStuckTrain = false;

                            // 目的地から折り返し方向へスキャン
                            for (let k = 0; k <= checkDist; k++) {
                                let idx = destBlk.index + (newDir * k);
                                if (idx >= 0 && idx < targetBlks.length) {
                                    for (let l of targetBlks[idx].lanes) {
                                        if (l !== null && l.dir === newDir && l.type === type) { 
                                            trainCount++;
                                            // 60秒以上スタックしている列車がいれば「これから詰まる可能性」として検知
                                            if (l.stuckTime > 60) hasStuckTrain = true;
                                        }
                                    }
                                }
                            }

                            // 判定: 指定範囲内に同種別の列車が2本以上いる（密度が高い）、
                            // または、スタックしている列車が1本でもいる（局所的な詰まり）場合は消滅させる
                            if (trainCount >= 2 || hasStuckTrain) {
                                t.nextAction = "depot";
                            }
                        }
                    }
                }
            }
        }
        const ok = this.game.addTrain(t);
        if(ok && type === "快速") this.lastRapidStart[dir === 1 ? "Up" : "Down"] = startName;
        return ok;
};

Spawner.prototype.getDestination = function (type, dir, startName) {
        if (type === "貨物") {
            if (dir === 1) {
                if (startName === "吹田貨") {
                    const dests = [
                        {d: "東京タ", w: 50},
                        {d: "名古屋タ", w: 30},
                        {d: "富山タ", w: 20}
                    ];
                    return this.weightedRandom(dests);
                } else {
                    const dests = [
                        {d: "東京タ", w: 30},
                        {d: "大阪タ", w: 10},
                        {d: "吹田タ", w: 10},
                        {d: "百済タ", w: 10},
                        {d: "名古屋タ", w: 20},
                        {d: "富山タ", w: 15}
                    ];
                    return this.weightedRandom(dests);
                }
            } else {
                if (startName === "敦賀") {
                    return Math.random() < 0.5 ? "吹田タ" : "百済タ";
                } else if (startName === "吹田貨") {
                    const dests = [
                        {d: "福岡タ", w: 40},
                        {d: "広島タ", w: 30},
                        {d: "岡山タ", w: 20},
                        {d: "高松タ", w: 10}
                    ];
                    return this.weightedRandom(dests);
                } else {
                    const dests = [
                        {d: "福岡タ", w: 20},
                        {d: "広島タ", w: 15},
                        {d: "岡山タ", w: 15},
                        {d: "高松タ", w: 10},
                        {d: "百済タ", w: 10},
                        {d: "安治川タ", w: 10},
                        {d: "吹田タ", w: 10}
                    ];
                    return this.weightedRandom(dests);
                }
            }
        }
        if (type === "特急") return (dir === 1) ? "敦賀" : "鳥取";
        if (type === "回送") return (dir === 1) ? "向日町操" : "網干";
        
        const koseiStations = ["大津京", "比叡山坂本", "おごと温泉", "堅田", "小野", "和邇", "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        
        // ★修正: 湖西線内の普通列車は京都行きに固定
        if (type === "普通" && dir === -1 && koseiStations.includes(startName)) return "京都";

        const getDestOptions = () => {
            if (dir === -1) { 
                if (type === "新快速") return [{d:"姫路",w:58}, {d:"網干",w:28}, {d:"播州赤穂",w:11}, {d:"上郡",w:3}];
                if (type === "快速") {
                    if (["大阪", "高槻"].includes(startName)) {
                        return [{d:"篠山口",w:90}, {d:"福知山",w:10}];
                    }
                    return [{d:"網干",w:50}, {d:"加古川",w:31}, {d:"姫路",w:19}];
                }
                if (type === "普通") {
                    let stIdx = STATION_MAP[startName];
                    if (startName === "高槻") {
                        return [{d:"宝塚方面",w:30}, {d:"西明石",w:50}, {d:"須磨",w:20}];
                    } else if (stIdx !== undefined && stIdx <= STATION_MAP["尼崎"]) {
                        // ★修正: 尼崎以西で生成される下り列車(西へ向かう)が、東の駅(大阪・神戸等)を目指すと逆走バグで詰まるため削除
                        return [{d:"西明石",w:70}, {d:"須磨",w:30}];
                    } else {
                        // 尼崎より東から出発する下り列車
                        return [{d:"西明石",w:50}, {d:"須磨",w:25}, {d:"宝塚方面",w:14}, {d:"大阪",w:5}, {d:"神戸",w:3}, {d:"尼崎",w:2}, {d:"甲子園口",w:1}];
                    }
                }
            } else {
                if (type === "新快速") {
                    if (koseiStations.includes(startName)) return [{d:"敦賀",w:91}, {d:"近江今津",w:9}];
                    return [{d:"野洲",w:25}, {d:"米原",w:25}, {d:"長浜",w:12}, {d:"敦賀",w:23}, {d:"近江今津",w:15}];
                }
                if (type === "快速") {
                    if (startName === "高槻") return [{d:"米原",w:20}, {d:"野洲",w:20}, {d:"京都",w:40}, {d:"草津",w:20}];
                    return [{d:"米原",w:19}, {d:"野洲",w:15}, {d:"京都",w:37}, {d:"高槻",w:10}, {d:"草津",w:19}];
                }
                if (type === "普通") {
                    if (koseiStations.includes(startName)) return [{d:"近江今津",w:91}, {d:"永原",w:9}];
                    let stIdx = STATION_MAP[startName];
                    if ((stIdx !== undefined && stIdx >= STATION_MAP["尼崎"]) || ["新三田", "宝塚"].includes(startName)) {
                        if (startName === "高槻") return [{d:"京都",w:70}, {d:"草津",w:30}];
                        return [{d:"高槻",w:40}, {d:"京都",w:45}, {d:"草津",w:15}];
                    }
                    
                    let options = [{d:"松井山手",w:20}, {d:"四条畷",w:15}, {d:"同志社前",w:5}, {d:"高槻",w:30}, {d:"京都",w:20}, {d:"草津",w:10}];
                    
                    // ★追加: 尼崎到着時の3連続被り防止ロジック
                    let recentDests = this.getAmagasakiRecentDestinations(startName, dir, type);
                    if (recentDests.length === 2) {
                        if (recentDests[0] === "Tozai" && recentDests[1] === "Tozai") {
                            options = [{d:"高槻",w:50}, {d:"京都",w:35}, {d:"草津",w:15}]; // 東西線2連続なら本線へ
                        } else if (recentDests[0] === "Honsen" && recentDests[1] === "Honsen") {
                            options = [{d:"松井山手",w:50}, {d:"四条畷",w:40}, {d:"同志社前",w:10}]; // 本線2連続なら東西線へ
                        }
                    } else if (startName === "須磨") {
                        // 尼崎ロジックで確定しなかった場合、須磨独自の交互調整ロジックを適用
                        let tozaiCount = 0;
                        let honsenCount = 0;
                        const tozaiDests = TOZAI_THROUGH_DESTS;
                        
                        let myBlks = this.game.trackMgr.blocks["Up_In"];
                        if (myBlks) {
                            let sumaBlk = myBlks.find(b => b.stationIdx === STATION_MAP["須磨"]);
                            if (sumaBlk) {
                                let checkRange = 18; // 前後約6駅分を探索
                                for (let k = -checkRange; k <= checkRange; k++) {
                                    if (k === 0) continue;
                                    let idx = sumaBlk.index + k;
                                    if (idx >= 0 && idx < myBlks.length) {
                                        for (let l of myBlks[idx].lanes) {
                                            if (l && l.dir === 1 && l.type === "普通") {
                                                if (tozaiDests.includes(l.dest)) tozaiCount++;
                                                else honsenCount++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 周辺列車の割合を比較し、少ない方の行き先グループを確定的に選ぶ
                        if (tozaiCount > honsenCount) {
                            options = [{d:"高槻",w:50}, {d:"京都",w:35}, {d:"草津",w:15}]; // 本線方面
                        } else if (honsenCount > tozaiCount) {
                            options = [{d:"松井山手",w:50}, {d:"四条畷",w:40}, {d:"同志社前",w:10}]; // 東西線方面
                        }
                    }

                    return options;
                }
            }
            return [{d:"西明石",w:100}];
        };

        let ops = getDestOptions();
        let totalW = 0;
        let ct = this.game.currentTime;
        
        // 時間帯補正の適用
        ops.forEach(o => {
            o.w *= this.getTimeMultiplier(o.d, type, dir, false, ct);
            totalW += o.w;
        });

        let dest = ops[0].d;
        let r = Math.random() * totalW, s = 0;
        for(let o of ops) { 
            s += o.w; 
            if(r < s) { dest = o.d; break; } 
        }

        // 行き先が「宝塚方面」に決まった場合はフラグを参照して新三田と宝塚を交互に割り当てる
        if (dest === "宝塚方面") {
            dest = this.nextFukuchiLocalDest;
            this.nextFukuchiLocalDest = (this.nextFukuchiLocalDest === "新三田") ? "宝塚" : "新三田";
        }

        // ★進行方向の後ろにある駅が行先に選ばれていないか確かめる。
        //   例: 草津で上りに折り返した列車に「京都行き」が割り当てられると、
        //       京都は後方にあるため永久にたどり着けず、米原方向へ走り続けていた。
        dest = this.sanitizeDestination(dest, dir, startName, type);

        let h = (ct / 3600) % 24;
        // ★改善: 22:00以降の終電間際における段階的な行き先短縮ロジック
        if (h >= 22.0 || h < 4.0) {
            let startIdx = STATION_MAP[startName];
            if (startIdx !== undefined) {
                if (dir === -1) {
                    if (h >= 23.0 || h < 4.0) {
                        // 23時以降: 近くの主要駅を終点にする
                        const downTerminals = ["京都", "高槻", "大阪", "尼崎", "西明石", "姫路"];
                        let nextTerm = downTerminals.find(t => STATION_MAP[t] < startIdx);
                        if (nextTerm) dest = nextTerm;
                    } else {
                        // 22時台
                        if (startIdx > STATION_MAP["大阪"] && STATION_MAP[dest] < STATION_MAP["大阪"]) {
                            dest = "大阪";
                        } else if (STATION_MAP[dest] < STATION_MAP["西明石"]) {
                            dest = "西明石"; // 遠くても西明石まで
                        }
                    }
                } else {
                    if (h >= 23.0 || h < 4.0) {
                        // 23時以降: 近くの主要駅を終点にする
                        const upTerminals = ["神戸", "尼崎", "大阪", "高槻", "京都", "野洲", "米原"];
                        let nextTerm = upTerminals.find(t => STATION_MAP[t] > startIdx);
                        if (nextTerm) dest = nextTerm;
                    } else {
                        // 22時台
                        if (startIdx < STATION_MAP["京都"] && STATION_MAP[dest] > STATION_MAP["京都"]) {
                            dest = "京都";
                        } else if (STATION_MAP[dest] > STATION_MAP["野洲"]) {
                            dest = "野洲"; // 遠くても野洲まで
                        }
                    }
                }
            }
        }
        return dest;
};

/**
 * 行先が進行方向の前方にあるかを確かめ、後方だったら手前の妥当な終着駅に直す。
 *
 * この判定が要る理由:
 *   折り返しのたびに getDestination() を呼び直しているが、
 *   もとの重み表は「その駅より先に行く列車」を前提に書かれている。
 *   そのため、例えば草津で上り(米原方面)へ折り返した列車に
 *   「京都行き」(= 後方) が割り当てられることがあった。
 *   その列車はいつまでも終点に着かず、敦賀まで走り抜けて消えていた。
 *
 * 分岐線(JR東西線・JR宝塚線)は本線と同じインデックス空間を共有しているので、
 * 行先の属する線区から進行方向を決める。
 */
Spawner.prototype.sanitizeDestination = function (dest, dir, startName, type) {
    if (!dest) return dest;

    // --- 分岐線の行先は、走る向きが決まっている
    if (FUKUCHI_THROUGH_DESTS.includes(dest)) return (dir === -1) ? dest : this.fallbackTerminal(dir, startName);
    if (TOZAI_THROUGH_DESTS.includes(dest))   return (dir === 1)  ? dest : this.fallbackTerminal(dir, startName);

    // --- 貨物駅・操車場は本線のインデックスで測れないものがあるので触らない
    const destIdx = STATION_MAP[dest];
    const startIdx = STATION_MAP[startName];
    if (destIdx === undefined || startIdx === undefined) return dest;

    // 前方(進行方向側)にあればそのまま
    if ((destIdx - startIdx) * dir > 0) return dest;
    // 当駅止まり(折り返し)は、終着として成立するのでそのまま
    if (destIdx === startIdx) return dest;

    return this.fallbackTerminal(dir, startName);
};

/** 進行方向の前方にある、いちばん近い主要な終着駅を返す */
Spawner.prototype.fallbackTerminal = function (dir, startName) {
    const startIdx = STATION_MAP[startName];
    // 上り(米原方面) / 下り(姫路方面) それぞれの主要終着駅を、近い順に並べたもの
    const UP   = ["高槻", "京都", "草津", "野洲", "米原", "長浜", "近江塩津", "敦賀"];
    const DOWN = ["尼崎", "大阪", "神戸", "須磨", "西明石", "加古川", "姫路"];
    const list = (dir === 1) ? UP : DOWN;
    if (startIdx === undefined) return list[list.length - 1];
    const ahead = list
        .map(n => ({ n: n, i: STATION_MAP[n] }))
        .filter(o => o.i !== undefined && (o.i - startIdx) * dir > 0)
        .sort((a, b) => Math.abs(a.i - startIdx) - Math.abs(b.i - startIdx));
    // 近すぎる駅ばかりにならないよう、前方の候補のうち2番目までから選ぶ
    if (ahead.length === 0) return (dir === 1) ? "敦賀" : "姫路";
    return ahead[Math.min(1, ahead.length - 1)].n;
};
