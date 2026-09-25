/* このファイルは index.html から分割されたものです。
   Train: 運転整理(種別変更・間隔調整・深夜の行先変更) */
/* ------------------------------------------------------------------ 団子を作らない

   ■ 何が起きていたか
     西明石のまわりで、新快速が「2駅おきに3本」続くことがあった。
     実際のダイヤでは新快速は毎時8本 (約7分半おき)、1駅あたり約1.7分なので
     4駅ちかく離れている。3本が2駅以内に並ぶことは無い。

   ■ 原因は3つあった
     1. 生成側 (js/08-spawner-mainline.js の trySpawn) が、始発駅の
        続行間隔をまったく見ていない場合があった。
        始発駅の候補には「網干」「播州赤穂」「上郡」のように
        線路図の外にある駅が入っている。これらは STATION_MAP に無いので
        着発線の空き・前方の閉塞の判定が丸ごと飛ばされ、
        無条件に生成されていた。実際にはどれも姫路の電留線から出るので、
        姫路で続けて何本も湧いていた。
     2. 走行中の続行間隔の下限が短すぎた。
        checkHold() は混雑を検知すると要求間隔を MIN_SPACING
        (新快速は2ブロック = 約0.7駅) まで詰める。詰まりを解くための
        仕組みだが、これが効くと新快速どうしが1駅未満で続いてしまう。
     3. 「3本目」を止める仕組みが無かった。
        2本の間隔を詰めるだけなら1本ずつの遅れだが、
        後ろが次々に詰まると団子になる。

   ■ どう直したか
     ・生成側で、物理的な始発駅 (網干→姫路 のように読み替えた駅) から
       前方を見て、同じ種別が近くにいれば生成を見送る。
     ・走行中は「自分が団子の3本目になる」ときだけ、駅で抑止して
       間隔が開くのを待つ。実際の指令も、続行がつながったときは
       手前の駅で間隔を開ける (運転整理)。
     ・待ちすぎるとかえって詰まるので、上限の秒数で必ず解ける。
*/
const CONVOY_RULES = {
    /* scan     … 前方を見る駅数
       near     … 直前の同種別がこの駅数より近ければ「続行がつながっている」
       maxAhead … この本数より多く前方にいたら、自分は発車しない
       maxWait  … 待つ上限 [秒] (これを超えたら詰まり防止のため発車する)

       ★待つ上限は短くとる。長く待たせると、待っている列車の後ろに
         同じ種別がまた溜まり、駅にとまったままの列車の列ができる。
         (480秒で試したところ、1分以上動けない列車が 11.9% → 17.8% に
          増え、かえって団子が増えた) */
    "新快速": { scan: 3.0, near: 1.5, maxAhead: 1, maxWait: 180 },
    "快速":   { scan: 2.5, near: 1.2, maxAhead: 1, maxWait: 150 },
    "普通":   { scan: 1.5, near: 0.8, maxAhead: 2, maxWait: 120 }
};

/* 生成するときに空けておく駅数 (同じ種別・同じ向き)。
   実際の時刻表の続行間隔 (新快速 約7.5分 = 約4駅) より少し内側にとる。 */
const CONVOY_SPAWN_GAP = { "新快速": 3.0, "快速": 2.5, "普通": 1.5 };

/**
 * ある位置から前方にいる、いちばん近い同じ種別・同じ向きの列車。
 * 戻り値 { dist: ブロック数, train } / いなければ null。
 */
function nearestSameTypeAhead(game, trackId, index, dir, type, stations, exclude) {
    const tracks = [trackId];
    if (/^(Up|Down)_(In|Out)$/.test(trackId)) {
        tracks.push(trackId.indexOf("In") >= 0 ? trackId.replace("In", "Out")
                                               : trackId.replace("Out", "In"));
    }
    const span = Math.ceil(UNITS_PER_STATION * stations);
    let best = null;
    for (const tid of tracks) {
        const blks = game.trackMgr.blocks[tid];
        if (!blks) continue;
        for (let k = 1; k <= span; k++) {
            const i = index + dir * k;
            if (i < 0 || i >= blks.length) break;
            const b = blks[i];
            if (!b || b.x === -1000) continue;
            for (const l of b.lanes) {
                if (l && l !== exclude && l.dir === dir && l.type === type) {
                    if (!best || k < best.dist) best = { dist: k, train: l };
                }
            }
            if (best) break;
        }
    }
    return best;
}

/**
 * ある位置から前方 stations 駅ぶんにいる、同じ種別・同じ向きの列車の数。
 * 内側線・外側線の両方を見る (種別によってどちらを走るかが違うため)。
 *
 *   game      … GameSystem
 *   trackId   … 基準の線路
 *   index     … 基準のブロック番号
 *   dir       … 進行方向
 *   type      … 種別
 *   stations  … 見る駅数
 *   exclude   … 数えない列車 (自分)
 */
function countSameTypeAhead(game, trackId, index, dir, type, stations, exclude) {
    const tracks = [trackId];
    if (/^(Up|Down)_(In|Out)$/.test(trackId)) {
        tracks.push(trackId.indexOf("In") >= 0 ? trackId.replace("In", "Out")
                                               : trackId.replace("Out", "In"));
    }
    const span = Math.ceil(UNITS_PER_STATION * stations);
    let n = 0;
    for (const tid of tracks) {
        const blks = game.trackMgr.blocks[tid];
        if (!blks) continue;
        for (let k = 1; k <= span; k++) {
            const i = index + dir * k;
            if (i < 0 || i >= blks.length) break;
            const b = blks[i];
            if (!b || b.x === -1000) continue;
            for (const l of b.lanes) {
                if (l && l !== exclude && l.dir === dir && l.type === type) n++;
            }
        }
    }
    return n;
}

/**
 * いま発車すると「団子の3本目」になってしまうか。
 * true なら駅で抑止して間隔が開くのを待つ。
 *
 * 駅にいるときだけ効かせる。駅間で止めると、かえってそこで
 * 後続が詰まってしまうため (実際の運転整理も駅で間隔を開ける)。
 */
Train.prototype.shouldHoldForConvoy = function () {
    const rule = CONVOY_RULES[this.type];
    if (!rule) return false;
    if (this.forceStart || this.isManuallySuspended) return false;
    // 待ちすぎたら詰まり防止のため発車する
    if (this.stuckTime >= rule.maxWait) return false;
    const blks = this.game.trackMgr.blocks[this.trackId];
    const here = blks ? blks[this.currBlockIndex] : null;
    if (!here || !(here.isStation || here.hoppoStationName)) return false;
    // 終着駅で折り返す列車は、間隔の調整対象ではない
    if (this.isFinalStop) return false;

    const ahead = countSameTypeAhead(this.game, this.trackId, this.currBlockIndex,
                                     this.dir, this.type, rule.scan, this);
    if (ahead <= rule.maxAhead) return false;

    /* ★直前の同種別が十分に離れていれば、3本目でも団子ではない。
       「3駅の中に2本いる」だけで止めると、健全な間隔の列車まで
       止めてしまい、駅にとまったままの列が伸びる。 */
    const near = nearestSameTypeAhead(this.game, this.trackId, this.currBlockIndex,
                                      this.dir, this.type, rule.scan, this);
    if (!near || near.dist > Math.ceil(UNITS_PER_STATION * rule.near)) return false;

    /* ★直前の列車がすでに止まっている (抑止・信号待ち) ときは、
       ここで追加の抑止を掛けない。前方が空くまで動けないことは
       通常の閉塞・続行間隔の判定が見ており、二重に止めると
       解けるまでの時間が積み上がって線区全体が詰まる。 */
    if (near.train.stuckTime >= 60 || near.train.isManuallySuspended) return false;

    // たまにだけ知らせる (毎回出すとログが埋まる)
    if (this.stuckTime === 0 && Math.random() < 0.05) {
        const st = blockStationName(here);
        this.game.ui.updateBanner(
            `【運転整理】${st}駅 前方${rule.scan}駅に${this.type}が${ahead}本続いているため、` +
            `${this.trainNo} は続行間隔を開けるため抑止します。`, "banner-orange");
    }
    return true;
};

Train.prototype.checkRapidDowngrade = function (stationName) {
        let stIdx = STATION_MAP[stationName];
        if (stIdx !== undefined && stIdx >= STATION_MAP["京都"]) {
            return;
        }

        // ★修正: in_depot状態の列車を除外
        let rapidTrains = this.game.trains.filter(t => 
            t.type === "快速" && 
            t.dir === this.dir && 
            t.state !== "finished" && t.state !== "in_depot" &&
            t.trackId.startsWith(this.dir === 1 ? "Up" : "Down")
        );
// ... 後略 ...
        
        rapidTrains.sort((a, b) => {
            return (this.dir === 1) ? (b.currBlockIndex - a.currBlockIndex) : (a.currBlockIndex - b.currBlockIndex);
        });

        const myIndex = rapidTrains.indexOf(this);
        if (myIndex > 0 && myIndex < rapidTrains.length - 1) {
            const ahead = rapidTrains[myIndex - 1];
            const behind = rapidTrains[myIndex + 1];

            const distAhead = Math.abs(ahead.currBlockIndex - this.currBlockIndex);
            const distBehind = Math.abs(behind.currBlockIndex - this.currBlockIndex);
            
            // 下り高槻駅での特別処理（行先変更なしで普通に降格）
            if (this.dir === -1 && stationName === "高槻") {
                if (distAhead <= 15 && distBehind <= 15 && this.canChangeTypeTo("普通", stationName)) {
                    this.game.spawner.activeTrainNos.delete(this.trainNo);
                    this.type = "普通";
                    this.trainNo = this.game.spawner.generateTrainNumber("普通", this.dir, stationName, this.trackId);
                    this.dutyName = this.trainNo;
                    this.startName = stationName;   // ★ここから始まる列車になる
                    this.game.ui.updateBanner(`【種別変更】高槻駅にて快速列車の近接(3連続)を検知。${this.trainNo}(普通)に変更しました(行先変更なし)。`, "banner-orange");
                    return;
                }
            }

            if (distAhead <= 15 && distBehind <= 15 && ahead.stuckTime > 10 &&
                this.canChangeTypeTo("普通", stationName)) {
                this.game.spawner.activeTrainNos.delete(this.trainNo);
                this.type = "普通";
                this.trainNo = this.game.spawner.generateTrainNumber("普通", this.dir, stationName, this.trackId);
                this.dutyName = this.trainNo;
                this.startName = stationName;   // ★ここから始まる列車になる
                let extraMsg = "";
                // 上りの場合のみ行先を草津に短縮する制限
                /* ★本線の行先だけ。分岐線 (学研都市線など) の駅も本線と同じ
                   インデックスの並びを使っているので、数の大小だけで比べると
                   木津行きが「草津より先」に見えてしまう。 */
                if (this.dir === 1 && isMainlineTrip(this) && STATION_MAP[this.dest] > STATION_MAP["草津"]) {
                    let oldDest = this.dest;
                    this.dest = "草津";
                    extraMsg = ` 行先を${oldDest}から${this.dest}に変更しました。`;
                }

                this.game.ui.updateBanner(`【種別変更】快速列車の近接(3連続)を検知。${stationName}駅にて ${this.trainNo}(普通) に変更しました。${extraMsg}`, "banner-orange");
            }
        }
};

/**
 * 本線 (琵琶湖線・JR京都線・JR神戸線・北陸線) の中だけを走る行程か。
 * 行先を「高槻まで」「京都まで」のように短縮する運転整理は、本線の駅の並びで
 * 考えているので、分岐線へ向かう列車や分岐線の中の列車には使えない。
 */
function isMainlineTrip(t) {
    if (/Kosei|Fukuchi|Tozai|Ako|Hoppo/.test(t.trackId || "")) return false;
    return routeLineOf(t.dest) === "main" && STATION_MAP[t.dest] !== undefined;
}

Train.prototype.checkLocalThinning = function (stationName) {
        // 分岐線へ向かう列車・分岐線の中の列車は、本線の駅の並びで短縮できない
        if (!isMainlineTrip(this)) return;
        // ★修正: in_depot状態の列車を除外
        let sameLineTrains = this.game.trains.filter(t => t.trackId === this.trackId && t.dir === this.dir && t.state !== "finished" && t.state !== "in_depot");
        sameLineTrains.sort((a, b) => (this.dir === 1) ? (b.currBlockIndex - a.currBlockIndex) : (a.currBlockIndex - b.currBlockIndex));
// ... 後略 ...
        
        const myIndex = sameLineTrains.indexOf(this);
        if (myIndex > 0 && myIndex < sameLineTrains.length - 1) {
            const ahead = sameLineTrains[myIndex - 1];
            const behind = sameLineTrains[myIndex + 1];

            if (ahead.type === "普通" && behind.type === "普通") {
                const distAhead = Math.abs(ahead.currBlockIndex - this.currBlockIndex);
                const distBehind = Math.abs(behind.currBlockIndex - this.currBlockIndex);
                
                // 距離を6ブロック(約2駅分)に縮小し、先行列車のスタック60秒以上、自身のスタック30秒以上とする
                // さらに、全列車が変更されないよう30%の確率でのみ間引きを実行する
                if (distAhead <= 6 && distBehind <= 6 && ahead.stuckTime > 60 && this.stuckTime > 30 && Math.random() < 0.3) {
                    let newDest = null;
                    let stIdx = STATION_MAP[stationName];
                    let currentDestIdx = STATION_MAP[this.dest];

                    if (this.dir === -1) {
                        // ★改善③: 行先候補を拡張し、到着予想時刻と上り列車の到達予測から最も安全に折り返せる駅を選択する
                        // ★候補はすべて方転できる駅 (念のためここでも確かめる)
                        let candidates = ["大阪", "尼崎", "芦屋", "神戸", "須磨"].filter(st => {
                            if (!canReverseAt(st)) return false;
                            let idx = STATION_MAP[st];
                            // 現在地より先(西)にあり、現在の目的地より手前(東)にある駅を候補とする
                            return idx !== undefined && idx < stIdx && (currentDestIdx === undefined || currentDestIdx < idx);
                        });

                        if (candidates.length > 0) {
                            let bestCand = null;
                            let minConflicts = 9999;
                            let upTrains = this.game.trains.filter(t => t.dir === 1 && t.state !== "finished");

                            for (let cand of candidates) {
                                let candIdx = STATION_MAP[cand];
                                let blks = this.game.trackMgr.blocks[this.trackId];
                                let candBlk = blks.find(b => b.stationIdx === candIdx);
                                if (!candBlk) continue;

                                let dist = Math.abs(this.currBlockIndex - candBlk.index);
                                // 自列車の到着予想時刻 (1ブロック約60秒)
                                let myEta = this.game.currentTime + dist * 60;
                                // 折り返し後の上り出発時刻 (折り返し待機時間を300秒とする)
                                let depTime = myEta + 300;

                                let conflicts = 0;
                                for (let upT of upTrains) {
                                    let upBlks = this.game.trackMgr.blocks[upT.trackId];
                                    if (!upBlks) continue;
                                    let upCandBlk = upBlks.find(b => b.stationIdx === candIdx);
                                    if (!upCandBlk) continue;

                                    let upDist = upCandBlk.index - upT.currBlockIndex;
                                    if (upDist > 0) {
                                        let upEta = this.game.currentTime + upDist * 60;
                                        // 上り列車の到着予想時刻と折り返し出発時刻が近い場合(±3分)は干渉すると判定
                                        if (Math.abs(depTime - upEta) < 180) conflicts++;
                                    }
                                }
                                
                                // その駅の上り線の空き状況を予測ペナルティとして加算
                                let upTrackIn = this.trackId.replace("Down", "Up").replace("Out", "In");
                                let freeLanes = 0;
                                let upBlksIn = this.game.trackMgr.blocks[upTrackIn];
                                if (upBlksIn) {
                                    let b = upBlksIn.find(x => x.stationIdx === candIdx);
                                    if (b) freeLanes += b.lanes.filter(l => l === null).length;
                                }
                                if (freeLanes === 0) conflicts += 5; // 満線の場合はペナルティ

                                if (conflicts < minConflicts) {
                                    minConflicts = conflicts;
                                    bestCand = cand;
                                }
                            }
                            if (bestCand) newDest = bestCand;
                        }
                    } else {
                        if (currentDestIdx !== undefined && currentDestIdx > STATION_MAP["高槻"] && stIdx < STATION_MAP["高槻"]) newDest = "高槻";
                        else if (currentDestIdx !== undefined && currentDestIdx > STATION_MAP["京都"] && stIdx < STATION_MAP["京都"]) newDest = "京都";
                    }

                    if (newDest && newDest !== this.dest) {
                        const oldDest = this.dest;
                        this.dest = newDest;
                        this.game.ui.updateBanner(`【運転整理】普通列車の団子状態検知。上り線の空き状況を予測し、${this.trainNo}の行先を${oldDest}から${newDest}に変更しました。`, "banner-orange");
                    }
                }
            }
        }
};

    // ★追加: 特定区間の混雑状況に応じた間引き・延長判定
Train.prototype.checkCongestionAndAdjust = function (stationName) {
        let stIdx = STATION_MAP[stationName];
        if (stIdx === undefined) return;

        // ① 西明石～姫路の下り線混雑対応
        if (this.dir === -1 && ["西明石", "大久保", "東加古川"].includes(stationName) && ["普通", "快速"].includes(this.type)) {
            if (STATION_MAP[this.dest] !== undefined && STATION_MAP[this.dest] < stIdx) {
                let trackIn = this.trackId;
                let trackOut = this.trackId.replace("In", "Out");
                let trainCount = 0;
                
                [trackIn, trackOut].forEach(tid => {
                    let blks = this.game.trackMgr.blocks[tid];
                    if (blks) {
                        let curBlk = blks.find(b => b.stationIdx === stIdx);
                        let himBlk = blks.find(b => b.stationIdx === STATION_MAP["姫路"]); // 姫路
                        if (curBlk && himBlk) {
                            let startIdx = Math.min(curBlk.index, himBlk.index);
                            let endIdx = Math.max(curBlk.index, himBlk.index);
                            for (let i = startIdx; i <= endIdx; i++) {
                                if (blks[i] && blks[i].lanes) {
                                    trainCount += blks[i].lanes.filter(l => l !== null && l.dir === -1).length;
                                }
                            }
                        }
                    }
                });
                
                // trainCountの条件を厳格化(10以上)、かつ30%の確率で発動
                // ★方転できる駅でしか間引き (折り返し) はできない
                if (trainCount >= 10 && Math.random() < 0.3 && canReverseAt(stationName)) {
                    let oldDest = this.dest;
                    this.dest = stationName;
                    this.nextAction = "turnback"; 
                    this.game.ui.updateBanner(`【運転整理】下り線の混雑蔓延を防ぐため、${this.trainNo}の行先を${oldDest}から${this.dest}に変更し、間引き(折り返し)を行います。`, "banner-orange");
                }
            }
        }

       // ② 高槻駅での下り混雑対応
        if (this.dir === -1 && stationName === "高槻" && ["普通", "快速"].includes(this.type)) {
            if (STATION_MAP[this.dest] !== undefined && STATION_MAP[this.dest] < stIdx) {
                let trackIn = this.trackId;
                let trackOut = this.trackId.replace("In", "Out");
                let trainCount = 0;
                
                [trackIn, trackOut].forEach(tid => {
                    let blks = this.game.trackMgr.blocks[tid];
                    if (blks) {
                        let curBlk = blks.find(b => b.stationIdx === STATION_MAP["高槻"]); // 高槻
                        let shinBlk = blks.find(b => b.stationIdx === STATION_MAP["新大阪"]); // 新大阪
                        if (curBlk && shinBlk) {
                            let startIdx = Math.min(curBlk.index, shinBlk.index);
                        let endIdx = Math.max(curBlk.index, shinBlk.index);
                        let totalDist = endIdx - startIdx;
                        for (let i = startIdx; i <= endIdx; i++) {
                            if (blks[i] && blks[i].lanes) {
                                let count = blks[i].lanes.filter(l => l !== null && l.dir === -1).length;
                                if (count > 0 && totalDist > 0) {
                                    // 高槻からの距離を取得
                                    let distFromTakatsuki = Math.abs(curBlk.index - i);
                                    // 高槻に近いほど重み1.0、新大阪に近いほど重み0.2として加重計算
                                    let weight = 1.0 - 0.8 * (distFromTakatsuki / totalDist);
                                    trainCount += count * weight;
                                }
                            }
                        }
                        }
                    }
                });
                
                // ★追加: 高槻駅のホーム空き状況と折り返し列車の数をチェックし、デッドロックを防止する
                let upTrackIn = "Up_In";
                let upTrackOut = "Up_Out";
                let freeUpLanesCount = 0;
                let turningBackTrains = 0;
                
                [upTrackIn, upTrackOut].forEach(tid => {
                    let blks = this.game.trackMgr.blocks[tid];
                    if (blks) {
                        let curBlk = blks.find(b => b.stationIdx === STATION_MAP["高槻"]);
                        if (curBlk) {
                            freeUpLanesCount += curBlk.lanes.filter(l => l === null).length;
                        }
                    }
                });

                // 高槻に存在する「高槻行き」または「折り返し待ち」の列車をカウント
                ["Up_In", "Up_Out", "Down_In", "Down_Out"].forEach(tid => {
                    let blks = this.game.trackMgr.blocks[tid];
                    if (blks) {
                        let curBlk = blks.find(b => b.stationIdx === STATION_MAP["高槻"]);
                        if (curBlk) {
                            turningBackTrains += curBlk.lanes.filter(l => l !== null && (l.dest === "高槻" || l.state === "turning_back")).length;
                        }
                    }
                });

                // ★改善: 高槻打ち切りの発動条件を厳格化(7本→9本)し、安易な高槻行きを減らす
                if (trainCount >= 9) {
                    if (freeUpLanesCount <= 1 || turningBackTrains >= 1) { // 1編成でも折り返し待ちがいれば見送る
                        // 上り線に空きがない、または既に高槻止まりが複数いる場合は、
                        // 芋づる式のデッドロックを防ぐため間引き(折り返し)をキャンセルする。
                        // ただし、下り線が致命的に詰まっている場合は一部を入庫(消滅)させる。
                        if (trainCount >= 12 && Math.random() < 0.4) { // 10本から12本へ緩和
                            let oldDest = this.dest;
                            this.dest = "高槻";
                            this.nextAction = "depot"; 
                            this.game.ui.updateBanner(`【運転整理】高槻駅の満線及び下り線混雑のため、${this.trainNo}は高槻で運転を打ち切り入庫します。`, "banner-orange");
                        }
                    } else {
                        let oldDest = this.dest;
                        this.dest = "高槻";
                        this.nextAction = "turnback"; 
                        this.game.ui.updateBanner(`【運転整理】高槻〜新大阪間の下り線混雑のため、${this.trainNo}の行先を${oldDest}から高槻に変更し、間引き(折り返し)を行います。`, "banner-orange");
                    }
                }
            }
        }

        // ③ 高槻行きの延長対応（上り列車）
        if (this.dir === 1 && stationName === "高槻" && this.dest === "高槻" && ["普通", "快速"].includes(this.type)) {
            // 深夜帯の京都への延長運転は行わない
            let timeH = (this.game.currentTime / 3600) % 24;
            if (timeH >= 22.0 || timeH < 4.0) return;
            
            let trainCountEast = 0; // 高槻～京都間
            let trainCountWest = 0; // 大阪～高槻間
            
            // 自分の走行路線のみチェック
            let blks = this.game.trackMgr.blocks[this.trackId];
            if (blks) {
                let osaBlk = blks.find(b => b.stationIdx === STATION_MAP["大阪"]);
                let curBlk = blks.find(b => b.stationIdx === STATION_MAP["高槻"]);
                let kyoBlk = blks.find(b => b.stationIdx === STATION_MAP["京都"]);
                
                if (osaBlk && curBlk && kyoBlk) {
                    // 高槻～京都間の同方向列車をカウント
                    let startIdxEast = Math.min(curBlk.index, kyoBlk.index);
                    let endIdxEast = Math.max(curBlk.index, kyoBlk.index);
                    let distEast = endIdxEast - startIdxEast;
                    for (let i = startIdxEast; i <= endIdxEast; i++) {
                        if (blks[i] && blks[i].lanes) {
                            let count = blks[i].lanes.filter(l => l !== null && l.dir === 1 && l !== this).length;
                            if (count > 0 && distEast > 0) {
                                let distFromTakatsuki = Math.abs(curBlk.index - i);
                                // 高槻に近いほど重み1.0、京都に近いほど重み0.2
                                let weight = 1.0 - 0.8 * (distFromTakatsuki / distEast);
                                trainCountEast += count * weight;
                            }
                        }
                    }
                    
                    // 大阪～高槻間の向かってきている同方向列車をカウント
                    let startIdxWest = Math.min(osaBlk.index, curBlk.index);
                    let endIdxWest = Math.max(osaBlk.index, curBlk.index);
                    let distWest = endIdxWest - startIdxWest;
                    for (let i = startIdxWest; i < endIdxWest; i++) {
                        if (blks[i] && blks[i].lanes) {
                            let count = blks[i].lanes.filter(l => l !== null && l.dir === 1 && l !== this).length;
                            if (count > 0 && distWest > 0) {
                                let distFromTakatsuki = Math.abs(curBlk.index - i);
                                // 高槻に近いほど重み1.0、大阪に近いほど重み0.2
                                let weight = 1.0 - 0.8 * (distFromTakatsuki / distWest);
                                trainCountWest += count * weight;
                            }
                        }
                    }
                }
            }
            
            // 京都方面が少なく、かつ大阪方面からの後続列車が十分いる場合のみ延長させる
            if (trainCountEast <= 2 && trainCountWest > trainCountEast) {
                this.dest = "京都";
                this.nextAction = "turnback"; 
                this.game.ui.updateBanner(`【運転整理】高槻〜京都間の上り列車不足、及び後続列車の状況を考慮し、${this.trainNo}の行先を高槻から京都に延長運転します。`, "banner-orange");
            }
        }
};

    // ★追加: 終着駅への到着時刻を事前に予測し、深夜帯に間に合わない場合は行先を予め手前の留置場に変更する
Train.prototype.checkLateNightDestination = function () {
        // 現在時刻の絶対時間換算 (日のベース時間を取得)
        let dayBase = Math.floor(this.game.currentTime / (24 * 3600)) * (24 * 3600);
        let currentAbsH = (this.game.currentTime - dayBase) / 3600;
        if (currentAbsH < 4.0) currentAbsH += 24.0; // 0〜4時を24〜28時として扱う

        // 22:30～翌4:00 以外はチェックしない
        if (currentAbsH < 22.5) return;
        
        // 既に入庫予定、または行先が既に車庫駅の場合はスキップ
        if (this.nextAction === "depot" || this.dest.includes("操") || this.dest.includes("貨")) return; 
        
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (!blks) return;

        let destBlock = blks.find(b => {
            let bName = b.hoppoStationName || (b.stationIdx >= 0 && STATIONS[b.stationIdx] ? STATIONS[b.stationIdx].name : "");
            return bName === this.dest;
        });

        if (!destBlock) return;

        let distToDest = (destBlock.index - this.currBlockIndex) * this.dir;
        if (distToDest <= 0) return;

        let etaSec = this.game.currentTime + (distToDest * 60) + this.delayTime;
        let etaAbsH = (etaSec - dayBase) / 3600;
        if (etaAbsH < 4.0) etaAbsH += 24.0;
        if (etaAbsH < currentAbsH) etaAbsH += 24.0; // 日またぎ補正

        // 到着予想時刻が1時45分(25.75)を超える場合
        if (etaAbsH > 25.75) {
            let bestStation = null;
            let minEtaDiff = 9999; 
            
            // 留置場有無を問わず主要駅を候補とする
            const MAJOR_STATIONS = [...new Set([...SWITCHABLE_STATIONS, ...OVERTAKE_STATIONS])];
            
            // 各列車種別における「普段の終着駅」リスト
            const ALLOWED_TERMINALS = {
                "新快速": ["敦賀", "近江塩津", "長浜", "米原", "野洲", "姫路", "播州赤穂", "上郡", "網干", "近江今津"],
                "快速": ["敦賀", "近江塩津", "長浜", "米原", "野洲", "草津", "京都", "高槻", "塚口", "宝塚", "新三田", "篠山口", "福知山", "西明石", "加古川", "姫路", "網干"],
                "普通": ["永原", "近江今津", "草津", "京都", "高槻", "尼崎", "甲子園口", "神戸", "須磨", "西明石", "塚口", "宝塚", "新三田", "松井山手", "四条畷", "同志社前", "木津", "京田辺", "長尾", "放出", "網干", "上郡", "播州赤穂", "相生"],
                "特急": ["敦賀", "京都", "新大阪", "姫路", "鳥取"]
            };

            for (let stName of MAJOR_STATIONS) {
                // 車庫行きにはしない
                if (stName.includes("操") || stName.includes("貨") || stName === "宮原操") continue;
                
                let stIdx = STATION_MAP[stName];
                if (stIdx === undefined) continue;

                /* ★重要: 分岐線(湖西線・JR宝塚線・JR東西線)の駅は、本線の駅と
                   同じインデックスを共有している。インデックスだけで探すと、
                   本線を走っている列車に「塚口行き」「放出行き」のような
                   たどり着けない行先を付けてしまう。
                   いま走っている線路のブロックの駅名が一致するものだけを候補にする。 */
                let cand = blks.find(x => x.stationIdx === stIdx && x.x !== -1000);
                if (!cand || blockStationName(cand) !== stName) continue;

                // いまの編成でその区間の運用に入れるものだけを候補にする
                if (!this.game.fleet.canServe(this.vehicles, stName, this.type,
                        this.trackId, stName, this.dutyName)) continue;
                
                // 普段終着駅かつ停車駅（大阪駅は例外で可能）となっているものに限定
                let isAllowedTerminal = (stName === "大阪");
                if (!isAllowedTerminal) {
                    const terminals = ALLOWED_TERMINALS[this.type];
                    if (terminals && terminals.includes(stName)) {
                        isAllowedTerminal = true;
                    } else if (!terminals) {
                        // 貨物、回送、臨時などは制限しない
                        isAllowedTerminal = true;
                    }
                }
                if (!isAllowedTerminal) continue;
                
                let stInfo = STATIONS[stIdx];
                if (!this.shouldStop(stInfo)) continue;
                /* ★打ち切る駅は、方転できるか留置場があるかのどちらか。
                   どちらも無い駅を終点にすると、実物では不可能な折り返しになる。 */
                if (!canReverseAt(stName) && !DEPOTS[stName]) continue;

                let b = cand;
                let distToCand = (b.index - this.currBlockIndex) * this.dir;
                // 現在地より先で、かつ目的地より手前にある駅を探す
                if (distToCand > 0 && distToCand < distToDest) {
                    let candEtaSec = this.game.currentTime + (distToCand * 60) + this.delayTime;
                    let candEtaAbsH = (candEtaSec - dayBase) / 3600;
                    if (candEtaAbsH < 4.0) candEtaAbsH += 24.0;
                    if (candEtaAbsH < currentAbsH) candEtaAbsH += 24.0;
                    
                    // 1時00分(25.0)までに到着できる主要駅
                    if (candEtaAbsH <= 25.0) { 
                        // なるべく終点に近い（距離の差が小さい）駅を選ぶ
                        let diff = Math.abs(distToDest - distToCand);
                        if (diff < minEtaDiff) {
                            minEtaDiff = diff;
                            bestStation = stName;
                        }
                    }
                }
            }

            if (bestStation) {
                let oldDest = this.dest;
                this.dest = bestStation;
                // 到着後は留置場があれば入庫、なければ消滅とする
                this.nextAction = DEPOTS[bestStation] ? "depot" : "remove";
                this.game.ui.updateBanner(`【運転整理】終着駅への到着が1時45分を超えるため、${this.trainNo}の行先を${oldDest}から${this.dest}に変更しました。`, "banner-orange");
            }
        }
};
