/* このファイルは index.html から分割されたものです。
   Spawner: 湖西線・福知山線(JR宝塚線)・JR東西線の列車生成と尼崎合流調整 */
    // ★追加・改善：尼崎合流地点での全方面高度ETA干渉予測（本線・東西線・福知山線の共通処理）
Spawner.prototype.willConflictAtAmagasaki = function (startName, dest, type, dir) {
        // 普通と快速のみ合流間隔を調整する
        if (type !== "普通" && type !== "快速") return false;

        let amaIdx = STATION_MAP["尼崎"];
        let stIdx = STATION_MAP[startName];
        if (stIdx === undefined) return false;

        let isFukuchiStart = ["新三田","三田","道場","宝塚","川西池田","塚口"].includes(startName);
        let isTozaiStart = TOZAI_PLACES.includes(startName);

        // 尼崎までのブロック距離を計算
        let dist = 0;
        if (dir === 1) {
            if (stIdx > amaIdx && !isFukuchiStart) return false; // 既に尼崎を過ぎている
            let startB = isFukuchiStart ? this.game.trackMgr.blocks["Fukuchi_Up"]?.find(b=>b.stationIdx===stIdx) : this.game.trackMgr.blocks["Up_In"]?.find(b=>b.stationIdx===stIdx);
            let amaB = isFukuchiStart ? this.game.trackMgr.blocks["Fukuchi_Up"]?.find(b=>b.stationIdx===amaIdx) : this.game.trackMgr.blocks["Up_In"]?.find(b=>b.stationIdx===amaIdx);
            if (startB && amaB) dist = amaB.index - startB.index;
        } else {
            if (stIdx < amaIdx && !isTozaiStart) return false; // 既に尼崎を過ぎている
            let startB = isTozaiStart ? this.game.trackMgr.blocks["Tozai_Down"]?.find(b=>b.stationIdx===stIdx) : this.game.trackMgr.blocks["Down_In"]?.find(b=>b.stationIdx===stIdx);
            let amaB = isTozaiStart ? this.game.trackMgr.blocks["Tozai_Down"]?.find(b=>b.stationIdx===amaIdx) : this.game.trackMgr.blocks["Down_In"]?.find(b=>b.stationIdx===amaIdx);
            if (startB && amaB) dist = startB.index - amaB.index;
        }

        if (dist < 0) return false;

        // 行き先から、尼崎発車後にどの路線(Track)へ退出するかを判定
        let outTrack = "";
        if (dir === 1) {
            outTrack = TOZAI_THROUGH_DESTS.includes(dest) ? "Tozai_Up" : "Up_In";
        } else {
            outTrack = FUKUCHI_THROUGH_DESTS.includes(dest) ? "Fukuchi_Down" : "Down_In";
        }

        // 新規生成しようとしている列車の到着予測時刻
        let myEta = this.game.currentTime + (dist * (type === "快速" ? 60 : 75));

        // シミュレーター上の全稼働列車と比較
        for (let t of this.game.trains) {
            if (t.dir !== dir || (t.type !== "普通" && t.type !== "快速")) continue;
            
            // 比較対象の列車の退出路線を判定
            let tOutTrack = "";
            if (dir === 1) {
                tOutTrack = TOZAI_THROUGH_DESTS.includes(t.dest) ? "Tozai_Up" : "Up_In";
            } else {
                tOutTrack = FUKUCHI_THROUGH_DESTS.includes(t.dest) ? "Fukuchi_Down" : "Down_In";
            }
            
            // 退出路線が異なる（例：西明石行きと宝塚行き）なら全く干渉しないためスキップ
            if (tOutTrack !== outTrack) continue;

            let tDist = 0;
            let tTrack = t.trackId.replace("Out", "In");
            let tAmaB = this.game.trackMgr.blocks[tTrack]?.find(b=>b.stationIdx===amaIdx);
            if (!tAmaB) continue;
            
            tDist = (tAmaB.index - t.currBlockIndex) * dir;
            if (tDist < 0) continue; // 既に尼崎を通過済み
            
            let tEta = this.game.currentTime + (tDist * (t.type === "快速" ? 60 : 75)) + t.delayTime + t.stuckTime;
            if (t.state === "waiting_start") tEta += t.timer;

            /* 同じ退出路線へ向かう列車の到着予測時刻がこれより近いと「被る」と見なす。
               ★4.5分(270秒)から3分(180秒)に詰めた。
                 遅れの積み方を実際に近づけた (js/11-train-core.js の回復運転) ことで
                 到着予測のばらつきが小さくなり、270秒では尼崎での合流待ちが
                 掛かりすぎて、JR東西線・JR宝塚線の本数が落ちていた。
                 尼崎の合流はもともと2分程度の間隔で捌いている。 */
            if (Math.abs(myEta - tEta) < 180) {
                return true; 
            }
        }
        return false;
};

Spawner.prototype.checkFukuchiTozaiSpawns = function (ct) {
        let h = (ct / 3600) % 24;
        /* 分岐線の普通だけは、折り返しで走り続けて実際の2倍以上になるので
           在線本数の目安 (js/10-timetable.js) を見て抑える。
           快速・区間快速は本数が足りていないので抑えない。 */
        /* ★線区ごとの目安で見る。以前は3線区の合計で見ていたので、
             湖西線だけが実際の2倍以上走っていても抑えられなかった。
             JR宝塚線と JR東西線は行先で分かれるので、両方に空きがあるかで見る。 */
        /* ★本数の目安は線区ごと・種別ごとに見る (TT_ACTIVE_BUDGET)。
           以前は
               ty !== "普通" || !ttOverBudget(…,"fukuchi",…) || !ttOverBudget(…,"tozai",…)
           と || でつないでいたため、
             ・快速をまったく数えていない
             ・宝塚線が目安を超えていても東西線に余裕があれば作り続ける
           という状態だった。乱数の種によって宝塚線の在線が2倍以上になり、
           線内が飽和して尼崎から本線の下りまで詰まる原因になっていた。 */
        /* 本数の目安 (TT_ACTIVE_BUDGET) を線区ごと・種別ごとに見る。
           以前は
               ty !== "普通" || !ttOverBudget(…,"fukuchi",…) || !ttOverBudget(…,"tozai",…)
           と || でつないでいたため、
             ・快速をまったく数えていない
             ・宝塚線が目安を超えていても東西線に余裕があれば作り続ける
           という状態だった。乱数の種によって宝塚線の在線が2倍以上になり、
           線内が飽和して尼崎から本線の下りまで詰まる原因になっていた。 */
        const budget = (ty, line) => !ttOverBudget(this.game, line, ty);

        /* ★その向きに列車がほとんどいないときは、目安を超えていても出す。
           目安は上下あわせた在線本数なので、片方向が詰まって在線が
           目安を超えると、反対向きの始発まで止まってしまう。
           実測では乱数の種によって「JR東西線 下り 0本/時」になっていた。
           実際の指令も、片方向が止まっていても反対向きの列車は出す。 */
        const starved = (line, dir) =>
            ttActiveCount(this.game, line, "普通", dir) +
            ttActiveCount(this.game, line, "快速", dir) <= 1;

        /* ★その線区の入口付近が詰まっているときは始発を出さない。
           尼崎は本線・宝塚線・東西線が着発線を共有しているので、
           分岐線に送り込みすぎると本線の下りまで止まってしまう。
           前方3駅ぶんに1分以上動けない列車が2本以上いたら見送る。 */
        const jammedAhead = (trackId, fromSt, dir) => {
            const blks = this.game.trackMgr.blocks[trackId];
            if (!blks) return false;
            const b0 = blks.find(b => b.stationIdx === STATION_MAP[fromSt]);
            if (!b0) return false;
            let stuck = 0;
            for (let k = 0; k <= UNITS_PER_STATION * 2; k++) {
                const b = blks[b0.index + dir * k];
                if (!b || b.x === -1000) break;
                b.lanes.forEach(l => { if (l && l.stuckTime > 60) stuck++; });
            }
            return stuck >= 4;
        };
        let timeFactor = 0.83; 
        if ((h >= 6.0 && h < 8.5) || (h >= 17 && h < 19.5)) {
            timeFactor = 0.42;  
        } else if (h >= 8.5 && h < 9.5) {
            timeFactor = 0.60; 
        } else if (h >= 9.5 && h < 10) {
            timeFactor = 0.75;  
        }

        // 1. 新三田発 上り (大阪・東西線方面)
        if (ct >= this.nextFukuchiUp) {
            let isRapid = Math.random() < (65 / 142); 
            let type = isRapid ? "快速" : "普通";
            let destOptions = isRapid ? 
                [{d:"大阪",w:43}, {d:"新大阪",w:1}, {d:"同志社前",w:21*0.75}, {d:"木津",w:21*0.20}, {d:"奈良",w:21*0.05}] :
                [{d:"高槻",w:32}, {d:"大阪",w:15}, {d:"四条畷",w:12}, {d:"松井山手",w:8}, {d:"長尾",w:4}, {d:"京田辺",w:3}, {d:"木津",w:2}, {d:"放出",w:1}];
            
            // ★追加: 尼崎到着時の3連続被り防止ロジック
            let recentDests = this.getAmagasakiRecentDestinations("新三田", 1, type);
            if (recentDests.length === 2) {
                if (recentDests[0] === "Tozai" && recentDests[1] === "Tozai") {
                    destOptions = isRapid ? [{d:"大阪",w:95}, {d:"新大阪",w:5}] : [{d:"高槻",w:68}, {d:"大阪",w:32}];
                } else if (recentDests[0] === "Honsen" && recentDests[1] === "Honsen") {
                    destOptions = isRapid ? [{d:"同志社前",w:75}, {d:"木津",w:20}, {d:"奈良",w:5}] : [{d:"四条畷",w:40}, {d:"松井山手",w:30}, {d:"長尾",w:15}, {d:"京田辺",w:10}, {d:"木津",w:3}, {d:"放出",w:2}];
                }
            }
            
            let dest = this.weightedRandom(destOptions);
            
            let canSpawn = true;
            let blks = this.game.trackMgr.blocks["Fukuchi_Up"];
            if (blks) {
                let startB = blks.find(b => b.stationIdx === STATION_MAP["新三田"]);
                if (startB && startB.lanes.every(l => l !== null)) canSpawn = false;
            }
            
            // ★本線との高度ETA干渉チェック
            if (canSpawn && this.willConflictAtAmagasaki("新三田", dest, type, 1)) {
                canSpawn = false;
            }

            if (canSpawn && (budget(type, "fukuchi") || starved("fukuchi", 1)) && !jammedAhead("Fukuchi_Up", "新三田", 1)) {
                this.game.addTrain({type:type, dir:1, trackId:"Fukuchi_Up", dest:dest, startName:"新三田", nextAction:"depot"});
                this.nextFukuchiUp += (isRapid ? 700 : 500) * timeFactor;
            } else {
                this.nextFukuchiUp += 180;
            }
        }

        /* 2. 放出発 下り (学研都市線 → JR東西線 → 尼崎・宝塚・神戸線方面)
              ★以前は京橋始発にしていたが、実際の東西線の列車はほぼ全て
                学研都市線から直通してくる。放出の電留線を起点にすることで
                「どこからともなく京橋に現れる」状態を解消した。 */
        if (ct >= this.nextTozaiDown) {
            let type = (Math.random() < (74 / 160)) ? "快速" : "普通";
            let destOptions = [];
            if (type === "快速") {
                let hOfDay = (ct / 3600) % 24;
                if (hOfDay < 10.0 || hOfDay >= 15.0) {
                    destOptions = [{d:"新三田",w:60}, {d:"宝塚",w:30}, {d:"塚口",w:10}];
                } else {
                    destOptions = [{d:"東西快速交互",w:100}];
                }
            } else {
                destOptions = [{d:"西明石",w:45}, {d:"宝塚方面",w:27}, {d:"尼崎",w:12}, {d:"甲子園口",w:2}];
            }
            let dest = this.weightedRandom(destOptions);

            if (dest === "東西快速交互") {
                dest = this.nextTozaiRapidDest;
                this.nextTozaiRapidDest = (this.nextTozaiRapidDest === "新三田") ? "塚口" : "新三田";
            } else if (dest === "宝塚方面") {
                dest = this.nextFukuchiLocalDest;
                this.nextFukuchiLocalDest = (this.nextFukuchiLocalDest === "新三田") ? "宝塚" : "新三田";
            }

            let canSpawn = true;
            let blks = this.game.trackMgr.blocks["Tozai_Down"];
            if (blks) {
                let startB = blks.find(b => b.stationIdx === STATION_MAP["放出"]);
                if (startB && startB.lanes.every(l => l !== null)) canSpawn = false;
            }

            // ★本線との高度ETA干渉チェック
            if (canSpawn && this.willConflictAtAmagasaki("放出", dest, type, -1)) {
                // 本線（西明石・甲子園口方面）への直通列車が合流干渉する場合、
                // 生成を見送るのではなく、行先を尼崎または福知山線方面に変更して生成を続行する
                if (type === "普通" && ["西明石", "甲子園口"].includes(dest)) {
                    if (Math.random() < 0.5) {
                        dest = "尼崎";
                    } else {
                        dest = this.nextFukuchiLocalDest;
                        this.nextFukuchiLocalDest = (this.nextFukuchiLocalDest === "新三田") ? "宝塚" : "新三田";
                    }
                } else {
                    canSpawn = false;
                }
            }

            if (canSpawn && (budget(type, "tozai") || starved("tozai", -1)) && !jammedAhead("Tozai_Down", "放出", -1)) {
                this.game.addTrain({type:type, dir:-1, trackId:"Tozai_Down", dest:dest, startName:"放出", nextAction:"depot"});
                this.nextTozaiDown += (type === "快速" ? 750 : 600) * timeFactor;
            } else {
                this.nextTozaiDown += 180;
            }
        }

        /* 3. 尼崎発 下り (福知山線 宝塚・新三田方面)
              ★実際のJR宝塚線は、尼崎折り返しの宝塚・新三田行き普通が主体で、
                篠山口・福知山まで行くのは丹波路快速など一部。
                以前は篠山口・福知山行きしか作っていなかったので、
                線内の本数が足りず間隔が大きく空いていた。 */
        if (ct >= this.nextFukuchiDown) {
            let type = Math.random() < 0.35 ? "快速" : "普通";
            let destOptions = (type === "快速")
                ? [{d:"篠山口",w:60}, {d:"福知山",w:20}, {d:"新三田",w:20}]
                : [{d:"新三田",w:45}, {d:"宝塚",w:35}, {d:"篠山口",w:15}, {d:"塚口",w:5}];
            let dest = this.weightedRandom(destOptions);
            
            let canSpawn = true;
            let blks = this.game.trackMgr.blocks["Fukuchi_Down"];
            if (blks) {
                let startB = blks.find(b => b.stationIdx === STATION_MAP["尼崎"]);
                if (startB) {
                    let freeLanes = startB.lanes.filter(l => l === null).length;
                    let existingSameRoute = startB.lanes.filter(l => l !== null && l.trackId === "Fukuchi_Down").length;
                    if (freeLanes < 2 || existingSameRoute >= 2) canSpawn = false;
                }
            }

            // ★本線からの乗り入れ列車(宝塚行きなど)との高度ETA干渉チェック
            if (canSpawn && this.willConflictAtAmagasaki("尼崎", dest, type, -1)) {
                canSpawn = false;
            }

            if (canSpawn && (budget(type, "fukuchi") || starved("fukuchi", -1)) && !jammedAhead("Fukuchi_Down", "尼崎", -1)) {
                this.game.addTrain({type:type, dir:-1, trackId:"Fukuchi_Down", dest:dest, startName:"尼崎", nextAction:"depot"});
                this.nextFukuchiDown += (type === "快速" ? 620 : 430) * timeFactor;
            } else {
                this.nextFukuchiDown += 180;
            }
        }

        // 4. 尼崎発 上り (東西線 京橋・四条畷方面)
        if (ct >= this.nextTozaiUp) {
            /* ★尼崎で始発する (尼崎方で折り返す) JR東西線の列車は、ほとんどが普通。
                 JR東西線の快速は JR宝塚線・学研都市線から直通してくるもので
                 (JR宝塚線からの直通は「3. 尼崎発」ではなく福知山線の生成が出す)、
                 尼崎始発の快速は同志社前・木津方面への区間快速に限られる。
                 以前はここを 快速 55% にし、さらに同志社前・木津行きを必ず快速にしていたので、
                 尼崎始発の3分の2が快速になり、尼崎方で折り返す列車の大半が快速になっていた
                 (折り返しは種別を変えないので、その偏りが一日続いた)。
               学研都市線の行先。松井山手までは複線で本数が多く、
               その先 (京田辺・同志社前・木津) は単線なので少ない。
               ★添付の同志社前駅の時刻表: 同志社前から京橋方面は 4本/時、
                 そのうち木津まで行くのは昼間 1本/時・夕方以降 2本/時。
                 同志社前・木津へ行くのはすべて快速か区間快速。 */
            const hTz = (ct / 3600) % 24;
            const kizuW = (hTz >= 9.5 && hTz < 15.5) ? 1 : 2;
            let type = Math.random() < 0.2 ? "快速" : "普通";
            let destOptions = (type === "快速")
                ? [{d:"同志社前",w:4 - kizuW}, {d:"木津",w:kizuW}, {d:"松井山手",w:1}]
                : [{d:"四条畷",w:30}, {d:"松井山手",w:45}, {d:"京田辺",w:5}, {d:"放出",w:20}];
            let dest = this.weightedRandom(destOptions);

            let canSpawn = true;
            let blks = this.game.trackMgr.blocks["Tozai_Up"];
            if (blks) {
                let startB = blks.find(b => b.stationIdx === STATION_MAP["尼崎"]);
                if (startB) {
                    let freeLanes = startB.lanes.filter(l => l === null).length;
                    let existingSameRoute = startB.lanes.filter(l => l !== null && l.trackId === "Tozai_Up").length;
                    if (freeLanes < 2 || existingSameRoute >= 2) canSpawn = false;
                }
            }

            // ★本線からの乗り入れ列車との高度ETA干渉チェック
            if (canSpawn && this.willConflictAtAmagasaki("尼崎", dest, type, 1)) {
                canSpawn = false;
            }

            if (canSpawn && (budget(type, "tozai") || starved("tozai", 1)) && !jammedAhead("Tozai_Up", "尼崎", 1)) {
                // 学研都市線の終点では折り返して尼崎方へ戻る (留置場があるのは放出だけ)
                this.game.addTrain({type:type, dir:1, trackId:"Tozai_Up", dest:dest, startName:"尼崎",
                                    nextAction: (dest === "放出") ? "depot" : "turnback"});
                this.nextTozaiUp += (type === "快速" ? 750 : 600) * timeFactor;
            } else {
                this.nextTozaiUp += 180;
            }
        }
};

/* ------------------------------------------------------------------ 姫路より西の普通

   姫路〜網干・相生・上郡・赤穂線 播州赤穂 の普通。網干総合車両所の223系が受け持つ。
   下りは姫路 (電留線)・網干 (網干総合車両所) から出し、終点で折り返して上りになる。
   本数は 1時間に3〜4本 (時刻表の添付が無かったため、実際の標準的な運転本数に合わせた)。 */
/* 添付の姫路駅 (下り) の時刻表: 昼間の普通は網干行き 2本/時・播州赤穂行き 1本/時、
   上郡行きは朝夕だけ (昼間の上郡へは相生での折り返しが受け持つ)。 */
const WEST_LOCAL_DESTS = [{d:"網干",w:5}, {d:"相生",w:1}, {d:"上郡",w:1}, {d:"播州赤穂",w:3}];
Spawner.prototype.checkWestSpawns = function (ct) {
    const h = (ct / 3600) % 24;
    if (h < 4.8 || h >= 22.5) return;
    if (this.nextWestLocal === undefined) this.nextWestLocal = ct + Math.random() * 600;
    if (ct < this.nextWestLocal) return;
    const perHour = ttPerHour("west", "Down", "普通", h) || 0;
    if (perHour <= 0) { this.nextWestLocal = ct + 600; return; }
    this.nextWestLocal = ct + 3600 / perHour;
    if (ttOverBudget(this.game, "main", "普通", 1.1)) return;
    const from = (Math.random() < 0.85) ? "姫路" : "網干";
    let dest = this.weightedRandom(WEST_LOCAL_DESTS);
    if (from === "網干" && dest === "網干") dest = "上郡";
    this.game.addTrain({ type: "普通", dir: -1, trackId: "Down_Out", dest: dest, startName: from,
                         nextAction: "turnback" });
};

    // ★追加: 湖西線普通列車の独立生成ロジック（本線とは隔離）
Spawner.prototype.checkKoseiSpawns = function (ct) {
        let h = (ct / 3600) % 24;
        let timeFactor = 0.83; 
        if ((h >= 6.0 && h < 8.5) || (h >= 17 && h < 19.5)) {
            timeFactor = 0.5;  
        } else if (h >= 8.5 && h < 9.5) {
            timeFactor = 0.65; 
        } else if (h >= 9.5 && h < 10) {
            timeFactor = 0.75;  
        }

        const koseiOk = !ttOverBudget(this.game, "kosei", "普通");
        if (ct >= this.nextKoseiLocalUp && koseiOk) {
            let destOptions = [{d:"近江今津", w:91}, {d:"永原", w:9}];
            let dest = this.weightedRandom(destOptions);
            // 京都発とし、山科で自動的に湖西線上りへ転線。終点で入庫(消滅)して独立スケジュールを保つ
            this.game.addTrain({type:"普通", dir:1, trackId:"Up_In", dest:dest, startName:"京都", nextAction: "depot"});
            this.nextKoseiLocalUp += 1200 * timeFactor;
        }
        if (ct >= this.nextKoseiLocalDown && koseiOk) {
            let startOptions = [{n:"近江今津", w:91}, {n:"永原", w:9}];
            let start = this.weightedRandom(startOptions);
            // 湖西線を下り、京都で入庫(消滅)
            this.game.addTrain({type:"普通", dir:-1, trackId:"Kosei_Down", dest:"京都", startName:start, nextAction: "depot"});
            this.nextKoseiLocalDown += 1200 * timeFactor;
        }
};

    // ★追加: 尼崎到着時の3連続被り防止ロジック用 ETA計算・履歴取得メソッド
Spawner.prototype.getAmagasakiRecentDestinations = function (startName, dir, type) {
        if (dir !== 1 || (type !== "普通" && type !== "快速")) return [];
        let amaIdx = STATION_MAP["尼崎"];
        let stIdx = STATION_MAP[startName];
        if (stIdx === undefined || stIdx >= amaIdx) return [];

        let isFukuchiStart = ["新三田","三田","道場","宝塚","川西池田","塚口"].includes(startName);
        let myDist = 0;
        let startB = isFukuchiStart ? this.game.trackMgr.blocks["Fukuchi_Up"]?.find(b=>b.stationIdx===stIdx) : this.game.trackMgr.blocks["Up_In"]?.find(b=>b.stationIdx===stIdx);
        let amaB = isFukuchiStart ? this.game.trackMgr.blocks["Fukuchi_Up"]?.find(b=>b.stationIdx===amaIdx) : this.game.trackMgr.blocks["Up_In"]?.find(b=>b.stationIdx===amaIdx);
        if (startB && amaB) myDist = amaB.index - startB.index;
        if (myDist <= 0) return [];
        
        let myEta = this.game.currentTime + (myDist * (type === "快速" ? 60 : 75));
        
        let upcomingTrains = [];
        const tozaiDests = TOZAI_THROUGH_DESTS;

        for (let t of this.game.trains) {
            if (t.dir !== 1 || (t.type !== "普通" && t.type !== "快速")) continue;
            let tDist = 0;
            let tTrack = t.trackId;
            if (tTrack.includes("Tozai_Up") || tTrack.includes("Up_In") || tTrack.includes("Up_Out")) {
                tTrack = "Up_In";
            } else if (tTrack.includes("Fukuchi_Up")) {
                tTrack = "Fukuchi_Up";
            } else {
                continue;
            }

            let tAmaB = this.game.trackMgr.blocks[tTrack]?.find(b=>b.stationIdx===amaIdx);
            if (!tAmaB) continue;
            
            tDist = tAmaB.index - t.currBlockIndex;
            if (tDist <= 0) continue;

            let tEta = this.game.currentTime + (tDist * (t.type === "快速" ? 60 : 75)) + t.delayTime + t.stuckTime;
            if (t.state === "waiting_start") tEta += t.timer;

            if (tEta <= myEta) {
                let destType = tozaiDests.includes(t.dest) ? "Tozai" : "Honsen";
                upcomingTrains.push({ eta: tEta, destType: destType });
            }
        }
        upcomingTrains.sort((a, b) => b.eta - a.eta);
        return upcomingTrains.slice(0, 2).map(t => t.destType);
};
