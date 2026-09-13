/* このファイルは index.html から分割されたものです。
   Spawner: 東海道・山陽本線(琵琶湖線/京都線/神戸線)の列車生成 */
/**
 * 本線 (琵琶湖線・JR京都線・JR神戸線) の列車生成。
 *
 * ★実際の駅時刻表から写したパターンダイヤ (js/10-timetable.js) で決める。
 *   以前は基準間隔に時間帯係数と種別係数を何段も掛けていて、
 *   普通が実際の2倍・快速と新快速が実際の4分の1という偏りになり、
 *   内側線だけが団子運転になっていた。
 *   いまは「1時間に何本」を時間帯ごとに直接指定し、
 *   毎時同じ分に発車させている。
 */
Spawner.prototype.checkIntervalSpawns = function (ct) {
        const h = (ct / 3600) % 24;

        ["Up", "Down"].forEach(dirName => {
            const dir = (dirName === "Up") ? 1 : -1;

            for (let type in INTERVALS) {
                // 下り特急のうち、はまかぜ・こうのとりは向日町からの出区で別に走らせる
                if (dirName === "Down" && type === "特急") {
                    if (ct >= this.nextMukoHamakazeTime) { this.spawnTokkyu(dirName, "hamakaze"); this.nextMukoHamakazeTime += 5400; }
                    else if (ct >= this.nextMukoKounotoriTime) { this.spawnTokkyu(dirName, "kounotori"); this.nextMukoKounotoriTime += 5400; }
                }

                const per = ttPerHour("main", dirName, type, h);
                const phase = ttPhase(type, dirName);
                if (per <= 0) {
                    // その時間帯は走らせない (深夜など)
                    this.nextSpawnTime[dirName][type] = ttNextTime(ct, 1, phase);
                    continue;
                }

                if (ct >= this.nextSpawnTime[dirName][type]) {
                    let spawned = true;
                    if (type === "特急") this.spawnTokkyu(dirName);
                    else spawned = this.trySpawn(type, dir);

                    if (spawned === false) {
                        /* 車両が無い・番線が空いていないなどで出せなかった。
                           発車の枠は捨てず、少し待ってから出す
                           (実際のダイヤでも遅れて発車する)。 */
                        this.nextSpawnTime[dirName][type] = ct + 45;
                    } else {
                        this.nextSpawnTime[dirName][type] = ttNextTime(ct, per, phase);
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

        /* 在線本数の目安を超えていたら作らない (js/10-timetable.js)。
           ★以前は新快速だけ「18本まで」という決め打ちの上限があり、
             実際の時刻表 (片道8本/時) に足りなかった。
             いまは時刻表から出した本数を種別ごとに見ている。 */
        if (ttOverBudget(this.game, "main", type)) return false;
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

        /* 始発駅でその列車を出せるかの判定。

           ★以前は「同じ種別の列車が前後2駅以内に2本以上いたら出さない」
             という大まかな見方だった。線路が少し混むとこの条件に引っかかり、
             種別に関係なく生成がほとんど止まってしまう。
             そのため昼間は時刻表どおりの本数が出せず、
             残った列車の折り返しだけで走る状態になっていた。
             (快速・新快速はほぼ0本、普通ばかりという偏りの原因)

           いまは実際の駅と同じ物理的な条件で見る。
             ① その駅の着発線 (ホーム) が空いているか
             ② 進行方向のすぐ先の閉塞が空いているか (続行間隔)
           どちらも「実際に線路がふさがっているか」なので、
           混雑しているときは自然に発車が抑えられ、
           空いていれば時刻表どおりに出る。 */
        const headwayBlocks = (type === "新快速" || type === "特急") ? 3 : 2;
        let availableCandidates = [];
        for (let stName of candidates) {
            let checkTrackId = trackId;
            if (["姫路","加古川"].includes(stName)) checkTrackId = checkTrackId.replace("In", "Out");
            const blks = this.game.trackMgr.blocks[checkTrackId];
            const stIdx = STATION_MAP[stName];
            if (!blks || stIdx === undefined) { availableCandidates.push(stName); continue; }

            const startBlk = blks.find(b => b.stationIdx === stIdx && b.x !== -1000);
            if (!startBlk) { availableCandidates.push(stName); continue; }

            // ① 着発線の空き
            if (!startBlk.lanes.some(l => l === null)) continue;

            // ② 進行方向のすぐ先が空いているか
            let clear = true;
            for (let k = 1; k <= headwayBlocks; k++) {
                const idx = startBlk.index + dir * k;
                if (idx < 0 || idx >= blks.length) break;
                const b = blks[idx];
                if (b.x === -1000) break;
                if (b.lanes.some(l => l !== null)) { clear = false; break; }
            }
            if (clear) availableCandidates.push(stName);
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

        /* ★ここには以前、生成を抑えるための「決め打ちの間引き」が3つ入っていた。
             ・姫路以西発の上り快速を4割の確率で捨てる
             ・姫路〜西明石に上り列車が10本以上いたら生成しない
             ・西明石の上り線の空き番線が2本未満なら生成しない
           どれも実際の線路の都合ではなく本数を減らすための細工で、
           時刻表どおりの本数 (姫路〜西明石は上り13本/時) を出すと
           必ず引っかかるため、快速・新快速がほとんど生成されなかった。

           混雑しているときに発車を抑えるのは、上で見ている
             ・着発線 (ホーム) が空いているか
             ・進行方向のすぐ先の閉塞が空いているか
           という実際の線路の条件で足りる。混んでいれば自然に出られない。

           西明石始発は普通と快速だけ、という点は実際のとおりなので残す。 */
        if (startName === "西明石" && type !== "普通" && type !== "快速") return false;

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

Spawner.prototype.getDestination = function (type, dir, startName, trackId) {
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
                        // 尼崎より東から出発する下り列車。
                        // ★宝塚方面への直通は高槻以西の始発に限る。
                        //   琵琶湖線(草津・米原)から宝塚線へ直通する普通は実在しない。
                        /* ★実際の時刻表では、JR京都線の普通は毎時8本あるが、
                             そのまま神戸線へ直通して西明石まで行くのは毎時4本ほどで、
                             残りは大阪・尼崎止まりで折り返す。
                             以前は8割が西明石・須磨まで直通していたため、
                             大阪の下り普通が実際の3倍になっていた。 */
                        if (stIdx !== undefined && stIdx > STATION_MAP["高槻"]) {
                            return [{d:"大阪",w:34}, {d:"西明石",w:31}, {d:"須磨",w:16},
                                    {d:"尼崎",w:11}, {d:"神戸",w:8}];
                        }
                        return [{d:"大阪",w:26}, {d:"西明石",w:30}, {d:"須磨",w:16},
                                {d:"宝塚方面",w:14}, {d:"尼崎",w:8}, {d:"神戸",w:5},
                                {d:"甲子園口",w:1}];
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
        dest = this.sanitizeDestination(dest, dir, startName, type, trackId);

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
Spawner.prototype.sanitizeDestination = function (dest, dir, startName, type, trackId) {
    if (!dest) return dest;

    /* --- 分岐線の行先は、走る向きも、分岐駅(尼崎)との位置関係も決まっている。
           JR東西線へは、尼崎より西から上り(dir=1)で来た列車か、
           すでに東西線内にいる列車しか入れない。
           JR宝塚線へは、尼崎より東から下り(dir=-1)で来た列車か、
           すでに宝塚線内にいる列車しか入れない。
           これを見ないと「草津発 放出行き」のように、
           物理的にたどり着けない行先が割り当てられていた。 */
    const amaIdx = STATION_MAP["尼崎"];
    const tid = trackId || "";
    const sIdx0 = STATION_MAP[startName];
    if (TOZAI_THROUGH_DESTS.includes(dest)) {
        // JR東西線へ直通するのは、西明石〜尼崎 の神戸線内から上ってきた列車。
        // 姫路など西明石より西からの直通は無い (207系/321系の走る範囲外)。
        const okSide = TOZAI_PLACES.indexOf(startName) >= 0 ||
                       (sIdx0 !== undefined && sIdx0 >= STATION_MAP["西明石"] && sIdx0 <= amaIdx);
        return (dir === 1 && okSide) ? dest : this.fallbackTerminal(dir, startName, trackId);
    }
    if (FUKUCHI_THROUGH_DESTS.includes(dest)) {
        // JR宝塚線へ直通するのは、高槻〜尼崎 の京都線内から下ってきた列車。
        // 琵琶湖線(草津・米原)からの直通は無い。
        const okSide = FUKUCHI_PLACES.indexOf(startName) >= 0 ||
                       (sIdx0 !== undefined && sIdx0 >= amaIdx && sIdx0 <= STATION_MAP["高槻"]);
        return (dir === -1 && okSide) ? dest : this.fallbackTerminal(dir, startName, trackId);
    }

    // --- 貨物駅・操車場は本線のインデックスで測れないものがあるので触らない
    const destIdx = STATION_MAP[dest];
    const startIdx = STATION_MAP[startName];
    if (destIdx === undefined || startIdx === undefined) return dest;

    /* ★分岐線の中にいる列車が、本線の駅を行先にする場合。
       分岐線と本線は尼崎・山科でしかつながっていないので、
       その合流点より先の駅しか行先にできない。
       (例: 放出発の下り列車は尼崎で本線に入るので、
        行先は尼崎から西の駅に限られる。大阪は上り方向なので行けない) */
    const onTozai = (tid.indexOf("Tozai") === 0) || TOZAI_PLACES.indexOf(startName) >= 0;
    const onFukuchi = (tid.indexOf("Fukuchi") === 0) || FUKUCHI_PLACES.indexOf(startName) >= 0;
    const onKosei = (tid.indexOf("Kosei") === 0) || KOSEI_PLACES.indexOf(startName) >= 0;
    if (onTozai) {
        if (dir !== -1 || destIdx > amaIdx) return this.fallbackTerminal(dir, startName, trackId);
        return dest;
    }
    if (onFukuchi) {
        if (dir !== 1 || destIdx < amaIdx) return this.fallbackTerminal(dir, startName, trackId);
        return dest;
    }
    if (onKosei) {
        const yamaIdx = STATION_MAP["山科"];
        if (dir === -1 && destIdx <= yamaIdx) return dest;
        if (dir === 1 && destIdx >= STATION_MAP["近江塩津"]) return dest;
        return this.fallbackTerminal(dir, startName, trackId);
    }

    // 前方(進行方向側)にあればそのまま
    if ((destIdx - startIdx) * dir > 0) return dest;
    /* 始発駅と同じ行先は、走り出した瞬間に到達できなくなるので使わない。
       (「西明石発 西明石行き」が上り線を走り続ける、という状態を防ぐ) */
    return this.fallbackTerminal(dir, startName, trackId);
};

/**
 * 進行方向の前方にある、いちばん近い主要な終着駅を返す。
 *
 * ★線区ごとに候補を変える。
 *   分岐線 (湖西線・JR宝塚線・JR東西線) は本線とインデックスを共有しているので、
 *   本線の駅名から選ぶと「道場発 須磨行き」のような、その線路では
 *   たどり着けない行先になってしまう。
 */
Spawner.prototype.fallbackTerminal = function (dir, startName, trackId) {
    const startIdx = STATION_MAP[startName];
    let list;
    const tid = trackId || "";
    if (tid.indexOf("Fukuchi") === 0 || FUKUCHI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["尼崎"] : ["宝塚", "新三田"];
    } else if (tid.indexOf("Tozai") === 0 || TOZAI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["京橋", "放出"] : ["尼崎"];
    } else if (tid.indexOf("Kosei") === 0 || KOSEI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["近江今津", "永原"] : ["京都"];
    } else {
        // 本線。上り(米原方面) / 下り(姫路方面) の主要終着駅を近い順に。
        list = (dir === 1)
            ? ["高槻", "京都", "草津", "野洲", "米原", "長浜", "近江塩津", "敦賀"]
            : ["尼崎", "大阪", "神戸", "須磨", "西明石", "加古川", "姫路"];
    }
    if (startIdx === undefined) return list[list.length - 1];
    const ahead = list
        .map(n => ({ n: n, i: STATION_MAP[n] }))
        .filter(o => o.i !== undefined && (o.i - startIdx) * dir > 0)
        .sort((a, b) => Math.abs(a.i - startIdx) - Math.abs(b.i - startIdx));
    if (ahead.length === 0) return list[list.length - 1];
    // 近すぎる駅ばかりにならないよう、前方の候補のうち2番目までから選ぶ
    return ahead[Math.min(1, ahead.length - 1)].n;
};
