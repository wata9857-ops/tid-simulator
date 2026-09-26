/* このファイルは index.html から分割されたものです。
   Train: 抑止(信号待ち)判定と着発番線の選択 */
Train.prototype.checkHold = function (isStarting) {
        const blks = this.game.trackMgr.blocks[this.trackId];
        const nextIdx = this.currBlockIndex + this.dir;
        let targetTrackId = this.trackId; // ★変数のスコープを関数全体に広げてエラーを防止

        /* ★折り返した直後は、到着した番線 (反対方向の線路) に留まっている。
           前方は「発車で入る線路」で見る。自分の線路で見ると、
           複々線・分岐線の端では線路の無い区間を指してしまい、
           発車できないままホームを占め続けてしまう。 */
        const aheadTrackId = this.turnbackTrack || this.trackId;
        const aheadBlks = this.game.trackMgr.blocks[aheadTrackId] || blks;
        /* ★貨物ターミナルの着発線にいる列車は、後ろから来る優等列車・前を走る列車を
           「出ていく本線」で見る (js/34-freight-terminals.js)。着発線そのものの前後は
           線路の無いプレースホルダなので、そこを見ると本線の様子が分からず、
           優等列車の直前へ飛び出したり、前の列車に詰めて発車したりしていた。
           以前の旅客駅 (鷹取など) の待避線に停まっていたときと同じく、本線の列車を見て判断する。 */
        const ownTrack = isFreightTerminalTrack(this.trackId) ? aheadTrackId : this.trackId;

        /* ★信号現示による停止判定 (js/25-signals.js)。
           転てつ器故障・信号故障など、進路が構成できない障害が
           前方にある場合はここで止まる。
           在線・見合わせによる停止は下の従来の判定と同じ結果になるので、
           ここでは障害の分だけを見る (既存の動きを変えないため)。 */
        if (this.game.signals && this.game.signals.hasFault(aheadTrackId, nextIdx)) {
            this.signalAspect = "R";
            return true;
        }
        
        if (nextIdx >= 0 && nextIdx < aheadBlks.length) {
            let nextBlk = aheadBlks[nextIdx];
            // 線路の無い区間へは進めない (線区の端)
            if (nextBlk.x === -1000) return true;
            /* ★指令の着発番線変更。指定の番線が空くまでは手前で待つ
               (待ちの上限を過ぎると reservedEntry が予約を取りやめる)。 */
            const resv = this.reservedEntry(nextIdx);
            if (resv && !resv.free) return true;
            const currentBlk = blks[this.currBlockIndex]; // ★追加
            
            if (nextBlk && nextBlk.stationIdx !== undefined) {
                // 尼崎駅への直接進入判定
                if (nextBlk.stationIdx === STATION_MAP["尼崎"]) {
                    if (this.dir === 1 && this.trackId === "Fukuchi_Up") {
                        // 特急 (こうのとり) は列車線 (外側線) へ
                        targetTrackId = TOZAI_THROUGH_DESTS.includes(this.dest) ?
                            "Tozai_Up" : (this.type === "特急" ? "Up_Out" : "Up_In");
                    } else if (this.dir === 1 && !this.trackId.includes("Tozai") && TOZAI_THROUGH_DESTS.includes(this.dest)) {
                        targetTrackId = "Tozai_Up";
                    } else if (this.dir === -1 && !this.trackId.includes("Fukuchi") && FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                        targetTrackId = "Fukuchi_Down";
                    } else if (this.dir === -1 && this.trackId === "Tozai_Down") {
                        targetTrackId = FUKUCHI_THROUGH_DESTS.includes(this.dest) ?
                            "Fukuchi_Down" : "Down_In";
                    }
                }
                
                /* 複々線の端 (西明石・草津) での内外の振り分け。
                   move() とまったく同じ判定を通す
                   (走行線路の規則は js/24-service-rules.js に1か所) */
                if ((nextBlk.stationIdx === STATION_MAP["西明石"] || nextBlk.stationIdx === STATION_MAP["草津"]) &&
                    innerTrackExists(nextBlk.stationIdx) && this.trackId.includes("Out")) {
                    const entering = (nextBlk.stationIdx === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
                    if (entering && this.wantTrackAt(nextBlk.stationIdx).includes("In")) {
                        const inTrackId = this.trackId.replace("Out", "In");
                        const tBlks = this.game.trackMgr.blocks[inTrackId];
                        if (tBlks) {
                            const targetNextBlk = tBlks.find(b => b.stationIdx === nextBlk.stationIdx);
                            // move() と同じく「この列車が入れる番線」があるかで決める (停まる列車はホームのある番線)
                            if (targetNextBlk && this.findFreeLane(targetNextBlk) !== -1) {
                                targetTrackId = inTrackId;
                            }
                        }
                    }
                }
            }

            /* ★尼崎を発車するときの分岐 (move() と同じ判定) */
            if (currentBlk && currentBlk.stationIdx === STATION_MAP["尼崎"]) {
                if (this.dir === 1 && this.trackId.indexOf("Tozai") !== 0 &&
                    TOZAI_THROUGH_DESTS.includes(this.dest)) {
                    targetTrackId = "Tozai_Up";
                } else if (this.dir === -1 && this.trackId.indexOf("Fukuchi") !== 0 &&
                    FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                    targetTrackId = "Fukuchi_Down";
                }
            }

            // 西明石・草津からの発車時の転線予測も move() と揃える
            if (currentBlk && (currentBlk.stationIdx === STATION_MAP["西明石"] ||
                               currentBlk.stationIdx === STATION_MAP["草津"])) {
                const here = currentBlk.stationIdx;
                const entering = (here === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
                if (entering && this.trackId.includes("Out") && this.wantTrackAt(here).includes("In")) {
                    targetTrackId = this.trackId.replace("Out", "In");
                } else if (!entering && this.trackId.includes("In") &&
                           blockStationName(currentBlk) !== this.dest) {
                    targetTrackId = this.trackId.replace("In", "Out");
                }
            }

            /* 折り返し後の発車は、渡り線で反対方向の線路へ入る。
               満線の判定もそちらで行う (move() と同じ判定を通す) */
            if (this.turnbackTrack && this.turnbackTrack !== this.trackId) {
                targetTrackId = this.turnbackTrack;
            }

            if (resv) {
                // 指定の番線は空いている。以降の間隔の判定は指定の線路で行う
                targetTrackId = resv.trackId;
            } else if (targetTrackId !== this.trackId) {
                let tBlks = this.game.trackMgr.blocks[targetTrackId];
                // ★修正: 転線先のブロック配列を定義・取得する
                if (tBlks) {
                    // ★尼崎のハードコーディングを廃止し、実際の進入先駅ブロックまたは同一座標で満線判定を動的に行う
                    let targetNextBlk = tBlks.find(b => (nextBlk.stationIdx !== undefined && b.stationIdx === nextBlk.stationIdx) || Math.abs(b.x - nextBlk.x) < 20);
                    // 使える番線が空いていなければ進入できない (move() と同じ判定)
                    if (targetNextBlk && this.findFreeLane(targetNextBlk, targetTrackId) === -1) return true;
                }
            } else {
                // 満線でも、終着列車は反対側の着発線へ入れることがある (move() と同じ判定)
                if (nextBlk.lanes.every(l => l !== null) && !this.terminalCrossArrival(nextBlk)) return true;
            }
        }
        
        // 段階開通の区間: 確認列車の許可があれば受け取る (無ければ止まる)
        if (this.game.recovery) this.game.recovery.tryGrant(this, aheadTrackId, nextIdx);
        if (this.game.trackMgr.isSuspended(aheadTrackId, nextIdx, this)) return true;

        // 単線区間 (一閉塞一列車)
        if (this.singleTrackBlocked(nextIdx, aheadTrackId)) return true;

        if (isStarting) {
                 if (this.startName === "向日町操") return false;

                 /* ★同じ種別が短い間隔で3本続く「団子」を作らない。

                    抑えるのは「まだ始発駅を出ていない列車」だけにする。
                    途中駅でも止めてみたところ、止めた列車の後ろにまた
                    同じ種別が溜まり、駅にとまったままの列ができて
                    1分以上動けない列車が 10% → 28% に増えた。
                    走り出した列車の間隔は、下の続行間隔の判定と
                    calcTravelTime() の減速 (js/14-train-turnback.js) で
                    ゆるやかに開ける。
                    js/16-train-adjust.js の「団子を作らない」を参照。 */
                 if (!this.hasDeparted && this.shouldHoldForConvoy()) return true;

                 // 7分(420秒)以上スタックしている場合は間隔調整を無視して強制発車(デッドロック回避)
                 if (this.stuckTime > 420) return false;

                 const currentBlock = blks[this.currBlockIndex];
                 const currentStIdx = currentBlock.stationIdx;
                 const currentStName = currentBlock.hoppoStationName || (currentStIdx >= 0 ? STATIONS[currentStIdx].name : "");

                 // 【追加】運転見合わせ・異常列車に伴う主要駅での広域抑止ロジック
                 let suspendAheadDist = -1;
                 for (let m of this.game.trackMgr.manualSuspensions) {
                     if (m.trackId === this.trackId || m.trackId === targetTrackId) {
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

                 // ★追加: 個別トラブル列車の検知
                 let targetBlks = this.game.trackMgr.blocks[targetTrackId] || blks;
                 let troubleAheadDist = -1;
                 let maxScanTrouble = UNITS_PER_STATION * 15;
                 for (let k = 1; k <= maxScanTrouble; k++) {
                     let idx = this.currBlockIndex + (this.dir * k);
                     if (idx >= 0 && idx < targetBlks.length) {
                         let hasTrouble = targetBlks[idx].lanes.some(l => l !== null && l.dir === this.dir && (l.minorTrouble || l.isManuallySuspended || l.stuckTime > 300));
                         if (hasTrouble) {
                             troubleAheadDist = k;
                             break;
                         }
                     }
                 }

                 let effectiveAheadDist = -1;
                 if (suspendAheadDist !== -1 && troubleAheadDist !== -1) effectiveAheadDist = Math.min(suspendAheadDist, troubleAheadDist);
                 else if (suspendAheadDist !== -1) effectiveAheadDist = suspendAheadDist;
                 else if (troubleAheadDist !== -1) effectiveAheadDist = troubleAheadDist;

                 if (effectiveAheadDist !== -1) {
                     // 貨物ターミナルの着発線でも、前方が止まっているうちは本線へ出ずに待つ
                     const isMajorOrOvertake = OVERTAKE_STATIONS.includes(currentStName) || SWITCHABLE_STATIONS.includes(currentStName) ||
                                               !!FREIGHT_TERMINALS[currentStName];
                     if (isMajorOrOvertake) {
                         // 長引きそうな場合はより遠くの駅でも抑止 (timer > 600 で約10分、または個別トラブル検知)
                         let isProlonged = (this.game.emergencyState && this.game.emergencyState.timer > 600) || (troubleAheadDist !== -1);
                         let holdThreshold = isProlonged ? Math.ceil(UNITS_PER_STATION * 15) : Math.ceil(UNITS_PER_STATION * 8);
                         
                         if (effectiveAheadDist < holdThreshold) {
                             // 駅間に詰まるのを防ぐため、ここで発車を見合わせる
                             // ただし、長時間の抑止によるデッドロックを防ぐため、スタック時間が非常に長い場合は除く
                             if (this.stuckTime < 1800) { 
                                 return true;
                             }
                         }
                     }
                 }
                 // 【追加終了】

                 // ★修正: 三ノ宮など独立した並走駅での謎の抑止を防ぐため、別線路(In/Out)のチェックは合流・待避駅に限定
                 const isMergeOrOvertake = OVERTAKE_STATIONS.includes(currentStName) || !!FREIGHT_TERMINALS[currentStName] || ["草津", "京都", "高槻", "新大阪", "大阪", "尼崎", "芦屋", "西明石", "兵庫"].includes(currentStName);

                 // ====================================================================
                 // ★新規追加: 駅構内での発車優先順位の厳格な調停ロジック（デッドロック完全排除）
                 // 同じ駅（同一ブロック）で発車タイミングを迎えた列車の優先順位を評価し、
                 // 最優先の1本だけが発車権を得るようにする。
                 // ====================================================================
                 // ====================================================================
                 // ★超強化: デッドロック完全排除と不要な遅延防止ロジック
                 // ====================================================================
                 if (currentBlock && (currentBlock.isStation || currentBlock.hoppoStationName)) {
                     let checkTracks = [ownTrack];
                     if (isMergeOrOvertake) {
                         if (ownTrack.includes("In")) checkTracks.push(ownTrack.replace("In", "Out"));
                         else if (ownTrack.includes("Out")) checkTracks.push(ownTrack.replace("Out", "In"));
                     }
                     
                     let shouldYieldToSameStation = false;
                     for (let tId of checkTracks) {
                         let cBlks = this.game.trackMgr.blocks[tId];
                         if (cBlks && cBlks[this.currBlockIndex]) {
                             for (let l of cBlks[this.currBlockIndex].lanes) {
                                 // ★改善: 同一駅に優等列車が客扱い中(timer>15)で存在する場合も確実に待避を維持させる
                                 if (l && l !== this && l.dir === this.dir && ["holding", "waiting_start", "stopped"].includes(l.state)) {
                                     let myPri = this.getPriority();
                                     let otherPri = l.getPriority();
                                     
                                     // 同格以下の場合は発車間近(timer<=15)のみ競合とみなす
                                     if (otherPri <= myPri && l.timer > 15) continue;
                                     
                                     // 向かう先の路線(targetTrackId)が異なる場合は干渉させず並走発車を許可する
                                     let myTarget = targetTrackId;
                                     let otherTarget = l.trackId; 
                                     // 相手が合流・分岐駅で転線する予定があるか予測する
                                     if (currentStName === "西明石") {
                                       if (l.dir === 1 && l.trackId.includes("Out") && ["普通", "快速"].includes(l.type)) {
                                        let timeH = (this.game.currentTime / 3600) % 24;
                                        let isMorningRushUpRapid = (l.type === "快速" && timeH >= 7.4 && timeH < 8.6);
                                        if (!isMorningRushUpRapid) otherTarget = l.trackId.replace("Out", "In");
                                              } else if (l.dir === -1 && l.trackId.includes("In") && l.dest !== "西明石") {
                                               otherTarget = l.trackId.replace("In", "Out");
                                              }
                                    } else if (currentStName === "草津") {
                                        if (l.dir === -1 && l.trackId.includes("Out") && ["普通", "快速"].includes(l.type)) {
                                              otherTarget = l.trackId.replace("Out", "In");
                                              } else if (l.dir === 1 && l.trackId.includes("In") && l.dest !== "草津") {
                                              otherTarget = l.trackId.replace("In", "Out");
                                              }
                                    } else if (currentStName === "尼崎") {
                                     if (l.dir === 1 && l.trackId === "Fukuchi_Up") {
                                              otherTarget = TOZAI_THROUGH_DESTS.includes(l.dest) ? "Tozai_Up" : "Up_In";
                                              } else if (l.dir === 1 && !l.trackId.includes("Tozai") && TOZAI_THROUGH_DESTS.includes(l.dest)) {
                                              otherTarget = "Tozai_Up";
                                              } else if (l.dir === -1 && !l.trackId.includes("Fukuchi") && FUKUCHI_THROUGH_DESTS.includes(l.dest)) {
                                              otherTarget = "Fukuchi_Down";
                                              } else if (l.dir === -1 && l.trackId === "Tozai_Down") {
                                              otherTarget = FUKUCHI_THROUGH_DESTS.includes(l.dest) ? "Fukuchi_Down" : "Down_In";
                                            }
                                    }
                                     // 互いに「同じ線路に進入しようとしている場合」のみ干渉と判定する
                                    let isSameDestination = (myTarget === otherTarget);
                                     
                                     if (isSameDestination) {
                                         // 1. 種別優先度が高い列車がいれば無条件で譲る
                                         if (otherPri > myPri) {
                                             // ★前段階予測: 優等列車が前方詰まり等で15秒以上発車できずにいる場合は譲らずに逃げ切る
                                             if (l.stuckTime > 15) {
                                                 // 譲らない (デッドロック回避のため自分が先に出る)
                                             } else {
                                                 shouldYieldToSameStation = true;
                                                 break;
                                             }
                                         } 
                                         // 2. 同種別の場合の高度な調停
                                         else if (otherPri === myPri) {
                                             // 相手が既に発車プロセスに入っている(timer<=0)なら確実に譲る
                                             if (l.timer <= 0 && this.timer > 0) {
                                                 shouldYieldToSameStation = true;
                                                 break;
                                             }
                                             // 待機時間に20秒以上の差があれば、長く待っている方を確実優先
                                             if (l.stuckTime > this.stuckTime + 20) {
                                                 shouldYieldToSameStation = true;
                                                 break;
                                             } else if (Math.abs(l.stuckTime - this.stuckTime) <= 20) {
                                                 // 両者膠着状態の場合、列車番号比較で確実に決着をつける
                                                 if (l.trainNo > this.trainNo) {
                                                     shouldYieldToSameStation = true;
                                                     break;
                                                 }
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                         if (shouldYieldToSameStation) break;
                     }
                     if (shouldYieldToSameStation) return true;
                 }
                 // ====================================================================

                 // 【追加①】同駅・後方近傍の優等列車発車優先ロジック
                 let yieldCheckTracks = [ownTrack];
                 if (isMergeOrOvertake) {
                     if (ownTrack.includes("In")) yieldCheckTracks.push(ownTrack.replace("In", "Out"));
                     else if (ownTrack.includes("Out")) yieldCheckTracks.push(ownTrack.replace("Out", "In"));
                 }

             // ★改善②: 優等列車からの逃げ切り最優先ロジック（待避不能駅での意味不明な抑止を完全排除）
             // 貨物ターミナルの着発線は待避できる場所 (優等列車を先に通してから出る)
             if (!OVERTAKE_STATIONS.includes(currentStName) && !FREIGHT_TERMINALS[currentStName]) {
                 let approachingHigherPriority = false;
                 const escapeCheckDist = Math.ceil(UNITS_PER_STATION * 3.0);
                 for (let tId of yieldCheckTracks) {
                     let cBlks = this.game.trackMgr.blocks[tId];
                     if (cBlks) {
                         for (let k = 1; k <= escapeCheckDist; k++) {
                             let idx = this.currBlockIndex - (this.dir * k);
                             if (idx >= 0 && idx < cBlks.length) {
                                 for (let l of cBlks[idx].lanes) {
                                     if (l && l !== this && l.dir === this.dir && l.getPriority() > this.getPriority()) {
                                         approachingHigherPriority = true;
                                         break;
                                     }
                                 }
                             }
                             if (approachingHigherPriority) break;
                         }
                     }
                     if (approachingHigherPriority) break;
                 }
                 // 待避不能駅で優等列車が接近中なら、前方との間隔調整システムを全無視して進む(次ブロックが空いている前提)
                 if (approachingHigherPriority) return false;
             } else {
                     // 待避可能な駅でのみ譲る
                     let yieldToHigher = false;
                     // ★修正: スコープエラー(ReferenceError)を防ぐため isStrictPriorityStation の定義を if ブロックの外に移動
                     let isStrictPriorityStation = ["米原", "草津", "京都", "尼崎", "西明石", "姫路"].includes(currentStName);

                     // ★事象①改善: 芦屋駅・大阪駅などでの満線デッドロック回避
                     // 駅のレーンに空きがない（満線）場合は優等列車の到着を待たずに逃げ切る
                     let currentFreeLanes = 0;
                     let myTrackBlks = this.game.trackMgr.blocks[this.trackId];
                     if (myTrackBlks && myTrackBlks[this.currBlockIndex]) {
                         currentFreeLanes = myTrackBlks[this.currBlockIndex].lanes.filter(l => l === null).length;
                     }

                     if (currentFreeLanes > 0) {
                         let scanDist = isStrictPriorityStation ? 5 : 3;
                         for (let tId of yieldCheckTracks) {
                             let cBlks = this.game.trackMgr.blocks[tId];
                             if (cBlks) {
                                 for (let k = 0; k <= scanDist; k++) {
                                     let idx = this.currBlockIndex - (this.dir * k);
                                     // 修正後
                                     if (idx >= 0 && idx < cBlks.length) {
                                       for (let l of cBlks[idx].lanes) {
                                        if (l && l !== this && l.dir === this.dir && l.state !== "finished") {
                                         if (l.getPriority() > this.getPriority()) {
                    // 接近してくる優等列車の進路を予測する
                                        let otherTarget = l.trackId;
                                            if (currentStName === "西明石") {
                                               if (l.dir === 1 && l.trackId.includes("Out") && ["普通", "快速"].includes(l.type)) {
                                               let timeH = (this.game.currentTime / 3600) % 24;
                                               let isMorningRushUpRapid = (l.type === "快速" && timeH >= 7.4 && timeH < 8.6);
                                            if (!isMorningRushUpRapid) otherTarget = l.trackId.replace("Out", "In");
                                              } else if (l.dir === -1 && l.trackId.includes("In") && l.dest !== "西明石") {
                                                 otherTarget = l.trackId.replace("In", "Out");
                                              }
                                            } else if (currentStName === "草津") {
                                            if (l.dir === -1 && l.trackId.includes("Out") && ["普通", "快速"].includes(l.type)) {
                                                  otherTarget = l.trackId.replace("Out", "In");
                                              } else if (l.dir === 1 && l.trackId.includes("In") && l.dest !== "草津") {
                                               otherTarget = l.trackId.replace("In", "Out");
                                               }
                                             } else if (currentStName === "尼崎") {
                                                if (l.dir === 1 && l.trackId === "Fukuchi_Up") {
                                                otherTarget = TOZAI_THROUGH_DESTS.includes(l.dest) ? "Tozai_Up" : "Up_In";
                                               } else if (l.dir === 1 && !l.trackId.includes("Tozai") && TOZAI_THROUGH_DESTS.includes(l.dest)) {
                                                        otherTarget = "Tozai_Up";
                                                } else if (l.dir === -1 && !l.trackId.includes("Fukuchi") && FUKUCHI_THROUGH_DESTS.includes(l.dest)) {
                                                        otherTarget = "Fukuchi_Down";
                                                } else if (l.dir === -1 && l.trackId === "Tozai_Down") {
                                                  otherTarget = FUKUCHI_THROUGH_DESTS.includes(l.dest) ? "Fukuchi_Down" : "Down_In";
                                                  }
                                             }

                                                  // 目標の線路（targetTrackId）が一致する場合のみ待避する
                                              if (targetTrackId === otherTarget) {
                                                    // 異常な長期抑止(8分以上)をされている優等列車は無視する(デッドロック回避)
                                             /* ★優等列車がこの駅へ入れないなら待たない。優等列車の入れる番線を
                                                自分がふさいでいると、互いに待ち合って動けなくなる
                                                (草津の下り内側線で、普通が快速を待ち、快速は普通の居る番線にしか
                                                入れず、どちらも待ちの上限まで止まっていた)。 */
                                             const hereBlk = (this.game.trackMgr.blocks[otherTarget] || [])[this.currBlockIndex];
                                             let canEnter = true;
                                             if (hereBlk && l.currBlockIndex !== this.currBlockIndex) {
                                                 const hr = (this.game.currentTime / 3600) % 24;
                                                 const pl = stationPreferredLanes(currentStName, otherTarget, l.type, hr, "arrive");
                                                 const needPf = l.passengerStopsAt(currentStName);   // 停まる列車はホームのある番線に限る
                                                 canEnter = hereBlk.lanes.some((x, li) => x === null && (!pl || !pl.length || pl.indexOf(li) >= 0) &&
                                                                                    (!needPf || laneHasPlatform(currentStName, otherTarget, li)));
                                             }
                                             if (canEnter && l.stuckTime < 480) {
                                                  yieldToHigher = true;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                 }
                             }
                         }
                     } // ← ★このカッコが抜けていました

                     // ★確実な抑止: 厳格な駅では最大10分(600秒)まで優等列車を待ち続ける。
                     // これにより、西明石で300秒待機する新規生成の快速を、普通列車が確実に待つようになる。
                     let maxWaitTime = isStrictPriorityStation ? 600 : 360;
                     if (yieldToHigher && this.stuckTime < maxWaitTime) return true;
                 }

             // ----- 琵琶湖線内での新快速 待避優先ロジック -----
             if (["普通", "快速"].includes(this.type)) {
                 if (currentStIdx !== undefined && currentStIdx >= STATION_MAP["京都"] && OVERTAKE_STATIONS.includes(currentStName)) {
                     let approachingSpecialRapid = false;
                     const checkDist = UNITS_PER_STATION * 2;
                     for (let k = 0; k <= checkDist; k++) {
                         let idx = this.currBlockIndex - (this.dir * k);
                         if (idx >= 0 && idx < blks.length) {
                             for(let l of blks[idx].lanes) {
                                 if (l && l !== this && l.type === "新快速" && l.dir === this.dir) {
                                     /* 新快速がこの駅へ入れないなら待たない (自分が新快速の入る番線を
                                        ふさいでいると、互いに待ち合う)。停まる新快速はホームのある番線に限る。 */
                                     const hb = blks[this.currBlockIndex];
                                     const needPf = l.passengerStopsAt(currentStName);
                                     if (k > 0 && hb && !hb.lanes.some((x, li) => x === null &&
                                             (!needPf || laneHasPlatform(currentStName, this.trackId, li)))) continue;
                                     approachingSpecialRapid = true;
                                     break;
                                 }
                             }
                         }
                         if (approachingSpecialRapid) break;
                     }
                     if (approachingSpecialRapid && this.stuckTime < 420) return true;
                 }
             }
             // ---------------------------------------------------

             // ★修正: 前方スキャン（車間距離チェック）は「自線路のみ」に限定。
             // 並走線路を含めると、別線路を走る優等列車に反応してしまい三ノ宮等で謎の抑止が多発するため完全排除。
             // ★修正: 前方スキャン（車間距離チェック）は「自線路のみ」に限定。
             // 並走線路を含めると、別線路を走る優等列車に反応してしまい三ノ宮等で謎の抑止が多発するため完全排除。
             let scanTracks = [ownTrack];
 // 1. 普通・快速・新快速のダンゴ運転防止 ＆ 2. 優先度に基づく接近チェック（高度な動的間隔調整）
             if (["普通", "快速", "新快速"].includes(this.type)) {
                 // 過剰な遠方検知を防ぐため車間距離を適正化
                 /* ★新快速の要求間隔を 3.0駅 → 2.0駅 にした。
                    新快速は該当区間を通して外側線 (列車線) を走るので、
                    京都〜草津の外側線には 新快速8本/時 ＋ 特急4本/時 が乗る。
                    3.0駅 (1駅約1.7分 → 約5.1分) を空けると理論上 11.8本/時 で
                    飽和し、外側線が詰まって36%の列車が1分以上動けなくなった。
                    実際の新快速の続行間隔は3〜4分なので、2.0駅 (約3.4分) が実物に近い。 */
                 const BASE_SPACING = { "普通": 1.5, "快速": 2.0, "新快速": 2.0 };
                 const MIN_SPACING =  { "普通": 1,   "快速": 1,   "新快速": 2 };
                 let requiredSpacing = BASE_SPACING[this.type] * UNITS_PER_STATION;
                 // ★改善: 東西線に向かう・東西線内を走行する列車は規定間隔を短縮して詰まりを防止
                 if (targetTrackId.includes("Tozai") || this.trackId.includes("Tozai")) {
                     requiredSpacing = Math.ceil(UNITS_PER_STATION * 1.0); // 東西線関連は1駅間隔まで詰める
                 }
                 let finalSpacing = Math.max(MIN_SPACING[this.type], Math.ceil(requiredSpacing));
                 
                 // ★改善: 後方の混雑状況を詳細にスキャン（後方の後方も確認）
                 let congestedCountBehind = 0;
                 let checkDistBehind = Math.ceil(UNITS_PER_STATION * 5.0); // 後方約5駅分を広くスキャン
                 if (blks) {
                     for (let k = 1; k <= checkDistBehind; k++) {
                         let idx = this.currBlockIndex - (this.dir * k);
                         if (idx >= 0 && idx < blks.length) {
                             // 同一方向の列車をカウント
                             if (blks[idx].lanes.some(l => l !== null && l.dir === this.dir)) {
                                 congestedCountBehind++;
                             }
                         }
                     }
                 }

                 // 後方に2本以上（後方と、その後方）接近している場合のみ、真の混雑（団子状態）とみなす
                 let isTrulyCongested = (congestedCountBehind >= 2);

                 // ★事象②改善: 列車運行間隔の調整を一部主要駅だけでなく「全駅」で発動するように条件撤廃
                 // 後方に複数列車が詰まっている真の混雑時、または遅延発生時は極力車間を詰める
                 if (isTrulyCongested || this.delayTime > 60 || this.stuckTime > 30) {
                     finalSpacing = MIN_SPACING[this.type];
                 }
                 // さらに東西線内は地下鉄並みの高頻度運転のため、少しでも詰まれば限界(1ブロック)まで間隔を詰める
                 if (this.trackId.includes("Tozai") || targetTrackId.includes("Tozai")) {
                     if (congestedCountBehind >= 1 || this.delayTime > 30 || this.stuckTime > 15) {
                         finalSpacing = 1;
                     }
                 }

                 // --- 実際の干渉チェック ---
                 let conflictAhead = false;
                 for(let k = 1; k <= finalSpacing; k++) {
                      let idx = this.currBlockIndex + (this.dir * k);
                      for (let tId of scanTracks) {
                          let cBlks = this.game.trackMgr.blocks[tId];
                          if (cBlks && idx >= 0 && idx < cBlks.length) {
                              let targetBlock = cBlks[idx];
                              // ★修正: lanes[0] 決め打ちをやめ、全レーンを正確にチェック
                              for (let l of targetBlock.lanes) {
                                  // ★変更：同一線路内の前方列車は、優先度に関わらずすべて干渉対象とする
                                  if (l && l.dir === this.dir && l !== this) { 
                                      if ((targetBlock.isStation || targetBlock.hoppoStationName) && this.findFreeLane(targetBlock) !== -1) continue;

                                      if (l.type === this.type && tId !== this.trackId) {
                                          if (l.stuckTime > this.stuckTime) continue;
                                          if (l.stuckTime === this.stuckTime && this.trackId.includes("Out")) continue;
                                      }

                                      conflictAhead = true;
                                      break; 
                                  }
                              }
                          }
                      }
                      if (conflictAhead) break;
                 }
                 
                 // ★修正: 前方列車との間隔が不十分な場合に、正しく発車抑止(hold)を適用する
                 if (conflictAhead) return true;
                 
             } else {
                 // 普通・快速・新快速「以外」（特急、貨物、回送など）の基本接近チェック
                 // 貨物・回送の要求車間距離を短くし、外側線の無駄な長距離抑止を防ぐ
                 /* ★外側線の要求間隔を 3駅 → 2駅 にした。
                    新快速が外側線を通しで走るようになり、特急が3駅ぶんの
                    間隔を要求すると外側線が捌けなくなる。 */
                 let reqDist = (this.type === "貨物" || this.type === "回送") ? UNITS_PER_STATION * 1.5 : UNITS_PER_STATION * 2;
                 let checkDist = Math.ceil(reqDist);
                 for(let k = 1; k <= checkDist; k++) {
                      let idx = this.currBlockIndex + (this.dir * k);
                      for (let tId of scanTracks) {
                          let cBlks = this.game.trackMgr.blocks[tId];
                          if (cBlks && idx >= 0 && idx < cBlks.length) {
                              let targetBlock = cBlks[idx];
                              // ★修正: 全レーンを正確にチェックし、同一方向の列車のみ検知する
                              for (let blockingTrain of targetBlock.lanes) {
                                  if (blockingTrain && blockingTrain.dir === this.dir && blockingTrain !== this) {
                                      if ((targetBlock.isStation || targetBlock.hoppoStationName) && this.findFreeLane(targetBlock) !== -1) {
                                          if (blockingTrain.getPriority() < this.getPriority()) continue;
                                      }
                                      if (k <= 2 || blockingTrain.getPriority() > this.getPriority()) {
                                          if (blockingTrain.type === this.type && tId !== this.trackId) {
                                              if (blockingTrain.stuckTime > this.stuckTime) continue;
                                              if (blockingTrain.stuckTime === this.stuckTime && this.trackId.includes("Out")) continue;
                                          }
                                          return true;
                                      }
                                  }
                              }
                          }
                      }
                 }
             }

             // 3. 特殊駅・待避駅でのコントロール
              if (["普通", "快速"].includes(this.type)) {
                const currentBlock = blks[this.currBlockIndex];
                const stIdx = currentBlock.stationIdx;
                const stName = currentBlock.hoppoStationName || (stIdx >= 0 ? STATIONS[stIdx].name : "");
                if (OVERTAKE_STATIONS.includes(stName)) {
                   
                   // ★事象①改善: 現在の線路に待避線(レーン数が2未満)が存在しない場合は、物理的に追い越し不可のため待避待ちをキャンセル
                   if (currentBlock.lanes.length > 1) {
                       let targetTypes = ["快速", "新快速", "特急", "貨物", "回送", "臨時"];
                       if (stIdx > STATION_MAP["西明石"] && stIdx < STATION_MAP["草津"]) {
                           if (this.trackId.includes("In")) {
                               targetTypes = ["快速"];
                           } else if (this.type === "快速" && this.trackId.includes("Out")) {
                               // ★事象改善1: 外線を走行する快速は、新快速から待避せず逃げ切るように対象を除外
                               targetTypes = ["特急", "貨物", "回送", "臨時"];
                           }
                       }

                       let isStrictPriorityStation = ["米原", "草津", "京都", "姫路"].includes(stName);
                       let checkDist = Math.ceil(UNITS_PER_STATION * (isStrictPriorityStation ? 5 : 3));
                       
                       let approaching = false;
                       let isSpecialOvertake = false;
                       let followers = 0;
                       let freeLanesCount = 0;
                       let myTrackFreeLanes = 0; // ★追加: 自線路の空きレーン数
                       let veryCloseHigherPriority = false; // ★追加: 至近距離に優等列車がいるか

                       let checkTracks = [this.trackId];
                       // 満線予測用
                       let approachTracks = [this.trackId];
                       // 接近列車の検知用

                       // ★事象2対応: 複々線区間（西明石〜草津）の場合のみ、In/Out両方の空きレーンを確認する
                       if (stIdx >= STATION_MAP["西明石"] && stIdx <= STATION_MAP["草津"]) {
                           let otherTrack = this.trackId.includes("In") ? this.trackId.replace("In", "Out") : this.trackId.replace("Out", "In");
                           checkTracks.push(otherTrack);
                           
                           // ★事象改善2: 別線路の優等列車を並走待避の対象にするのは、合流・主要駅に限定する
                           if (["草津", "京都", "新大阪", "大阪", "尼崎", "西明石"].includes(stName)) {
                               approachTracks.push(otherTrack);
                           }
                       }

                       // 駅の全トラックの空きレーンを正確にカウント
                       for (let tId of checkTracks) {
                           let cBlks = this.game.trackMgr.blocks[tId];
                           if (cBlks && cBlks[this.currBlockIndex]) {
                               let freeCount = cBlks[this.currBlockIndex].lanes.filter(l => l === null).length;
                               freeLanesCount += freeCount;
                               if (tId === this.trackId) {
                                   myTrackFreeLanes = freeCount; // ★追加: 自線路の空き数を取得
                               }
                           }
                       }

                       // k=0からスキャンし、同線路（および必要な合流駅の別線路）の接近列車を確認する
                       for (let k = 0; k <= checkDist; k++) {
                            let idx = this.currBlockIndex - (this.dir * k);
                            if (idx < 0) continue;
                            
                            for (let tId of approachTracks) { 
                                let cBlks = this.game.trackMgr.blocks[tId];
                                if (cBlks && idx >= 0 && idx < cBlks.length) {
                                    for (let l of cBlks[idx].lanes) {
                                        if (l && l.dir === this.dir && l !== this) {
                                            // 優等列車の接近・並走検知
                                            if (targetTypes.includes(l.type) && (l.getPriority() > this.getPriority())) {
                                                // ★超強化(予測発車): 優等列車が詰まっている場合は待避を打ち切り先行・逃げ切る
                                                if (l.stuckTime > 30) continue; 
                                                if (k >= UNITS_PER_STATION * 1.5 && (l.state === "holding" || l.stuckTime > 15)) continue;
                                                if (k >= UNITS_PER_STATION * 2.5 && l.stuckTime > 0) continue;
                                                
                                                approaching = true;
                                                if (k <= 2) veryCloseHigherPriority = true; // ★追加: 同一駅〜手前2ブロック以内なら超接近と判定

                                                if (["特急", "新快速", "貨物"].includes(l.type)) isSpecialOvertake = true;
                                            }
                                            // 同格以下の後続列車の接近検知
                                            else if (l.getPriority() <= this.getPriority()) {
                                                // 満線デッドロック判定用の後続は「1.5駅以内」にいる場合のみカウント
                                                if (k > 0 && k <= UNITS_PER_STATION * 1.5) {
                                                    followers++;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                       }
                       
                       // ★満線デッドロック回避の強化 (芦屋駅・大阪駅などでの内側線詰まりを解消)
                       // 自線路が満線で、優等列車が接近している場合は待避を打ち切り先行発車する
                       if (approaching && myTrackFreeLanes === 0) {
                           if (Math.random() < 0.15 && this.stuckTime > 15) {
                               this.game.ui.updateBanner(`【運転整理】${stName}駅 満線デッドロック回避のため、${this.trainNo}は待避を中止し先行発車します。`, "banner-orange");
                           }
                           return false; // 抑止せず発車（逃げ切り）
                       }

                       // 全体満線時の条件も残す(念のため)
                       if (approaching && freeLanesCount === 0 && followers >= 2) {
                           if (Math.random() < 0.15 && this.stuckTime > 30) {
                               this.game.ui.updateBanner(`【運転整理】${stName}駅 満線デッドロック予測のため、${this.trainNo}は待避を中止し先行発車します。`, "banner-orange");
                           }
                           return false; // 抑止せず発車（逃げ切り）
                       }

                       // ★事象改善: 前方列車が3駅分以上先にいて、後方の優等列車が2駅以上後ろにいる場合は早期に先行発車(逃げ切り)させる
                       let forwardClearDist = 0;
                       let checkForwardMax = Math.ceil(UNITS_PER_STATION * 4.0); // 前方4駅分をスキャン
                       let myTrackBlksForScan = this.game.trackMgr.blocks[this.trackId];
                       if (myTrackBlksForScan) {
                           for (let k = 1; k <= checkForwardMax; k++) {
                               let idx = this.currBlockIndex + (this.dir * k);
                               let trainFound = false;
                               if (idx >= 0 && idx < myTrackBlksForScan.length) {
                                   for (let tId of checkTracks) {
                                       let cBlks = this.game.trackMgr.blocks[tId];
                                       if (cBlks && cBlks[idx] && cBlks[idx].lanes.some(l => l && l.dir === this.dir && l !== this)) {
                                           trainFound = true;
                                           break;
                                       }
                                   }
                               } else {
                                   break;
                               }
                               if (trainFound) break;
                               forwardClearDist++;
                           }
                       }

                       // 前方が 3駅分以上 空いており、優等列車が後方2駅以内にいない(!veryCloseHigherPriority)場合は待避をキャンセルして先行
                       if (approaching && !veryCloseHigherPriority && forwardClearDist >= Math.ceil(UNITS_PER_STATION * 3.0)) {
                           if (Math.random() < 0.15 && this.stuckTime > 15) {
                               this.game.ui.updateBanner(`【運転整理】${stName}駅 ${this.trainNo} 前方区間が十分に空いているため、優等列車の待避を早期にキャンセルし先行発車します。`, "banner-orange");
                           }
                           return false; // 抑止せず先行発車
                       }
        
                       // ★待避時間の厳格化: 優等列車を待つ上限を短縮し、無駄な待機を減らす
                       let maxWait = isStrictPriorityStation ? 360 : (isSpecialOvertake ? 240 : 180);
                       if (approaching) {
                           // ★変更: 上限時間を超えても、優等列車が至近距離(veryCloseHigherPriority)にいれば確実に待つ強力なロジック
                           if (this.stuckTime < maxWait || veryCloseHigherPriority) {
                               // ★追加: 退避予定の優等列車が遅延している場合の先行打診
                               if (!this.notifiedEvents.passSkip && this.stuckTime > 180 && !veryCloseHigherPriority) {
                                   this.notifiedEvents.passSkip = true;
                                   this.game.ui.updateBanner(`【乗務員連絡】${stName}駅で通過待ち予定ですが、特急(優等)が大幅に遅れています。このまま先行してよろしいでしょうか？（${this.trainNo}）`, "banner-blue");
                               }
                               return true;
                           } else {
                               // 待機上限を超えた場合、強制的に先行する
                               if (Math.random() < 0.2) {
                                   this.game.ui.updateBanner(`【指令】${stName}駅 ${this.trainNo} 待避時間が上限を超過したため先行発車させます。`, "banner-orange");
                               }
                               return false;
                           }
                       } else {
                           // ★追加: 後続の遅れ優等列車に対する接続待ちの確認
                           if (followers > 0 && !this.notifiedEvents.connection && this.timer <= 0 && ["普通", "快速"].includes(this.type)) {
                               if (Math.random() < 0.05) {
                                   this.notifiedEvents.connection = true;
                                   this.game.ui.updateBanner(`【乗務員連絡】${stName}駅発車定刻ですが、後続の遅れ優等列車が接近しています。当駅で接続待ちを行いますか？（${this.trainNo}）`, "banner-blue");
                               }
                           }
                       }
                   } // ★事象①改善の if文 (lanes.length > 1) の閉じカッコ
                }
            }
        }
        return false;
};

/**
 * 単線区間 (js/03-stations.js の SINGLE_TRACK_UNITS) へ入れないか。
 *
 * 区間の外から区間へ入ろうとするときだけ見る (区間の中を進むのは閉塞どおり)。
 *   1. 区間に自分以外の列車がいれば入らない (一閉塞一列車)
 *   2. 区間の先の交換駅に、自分の向きで入れる番線の空きが無ければ入らない
 *      (区間の中で待たされると、交換駅で向かい合う列車と
 *       互いの空きを待つ形の詰まりになるため)
 */
Train.prototype.singleTrackBlocked = function (nextIdx, trackIdAhead) {
    const tid = trackIdAhead || this.trackId;
    const u = singleUnitAt(tid, nextIdx);
    if (!u) return false;
    if (singleUnitAt(tid, this.currBlockIndex) === u) return false;   // もう区間の中
    const tm = this.game.trackMgr;
    const blks = tm.blocks[u.up];
    const r = singleUnitBlockRange(u);
    for (let i = r[0]; i <= r[1]; i++) {
        const b = blks[i];
        if (b && b.x !== -1000 && b.lanes.some(l => l && l !== this)) return true;
    }
    // 区間の先の交換駅 (終点が区間の中にあるときは折り返して戻るので見ない)
    const farName = (this.dir === 1) ? (STATION_MAP[u.hi] > STATION_MAP[u.lo] ? u.hi : u.lo)
                                     : (STATION_MAP[u.hi] > STATION_MAP[u.lo] ? u.lo : u.hi);
    if (u.hiInside && farName === u.hi) return false;
    // 行先が区間の中の駅 (同志社前など) なら、そこで折り返して戻るので先は見ない
    const dIdx = STATION_MAP[this.dest];
    const lo = Math.min(STATION_MAP[u.lo], STATION_MAP[u.hi]), hi = Math.max(STATION_MAP[u.lo], STATION_MAP[u.hi]);
    if (dIdx !== undefined && dIdx > lo && dIdx < hi) return false;
    const fb = stationBlockOn(this.game, tid, farName);
    if (fb && this.findFreeLane(fb) === -1) return true;
    return false;
};

/**
 * 進路のつながっている番線から空きを1つ選ぶ (到着・発車の別を指定)。
 *
 * ★番線を直に 0..n や n..0 と走査している所が何か所もあり、
 *   そこでは進路の制限 (js/03-stations.js の STATION_ROUTES) が
 *   効いていなかった。実測では、尼崎の上り内側線に居るはずのない
 *   9番・8番の列車が現れていた。ここを通すようにする。
 *
 *   block  … 駅のブロック
 *   trackId… その列車が乗っている (乗ろうとしている) 線路
 *   mode   … "arrive" 到着 / "depart" 発車
 *   type   … 種別 (番線の使い分けに使う)
 *   hour   … 時刻 (同上)
 *   outer  … true なら外側 (番号の大きいレーン) から探す
 */
function pickRouteLane(block, stName, trackId, mode, type, hour, outer) {
    const pref = stationPreferredLanes(stName, trackId, type, hour, mode);
    if (pref && pref.length) {
        const list = outer ? pref.slice().reverse() : pref;
        for (const l of list) {
            if (l < block.lanes.length && block.lanes[l] === null) return l;
        }
        return -1;                     // つながっている番線が全部埋まっている
    }
    // 制限の書かれていない駅は、これまでどおりの探し方
    if (outer) {
        for (let l = block.lanes.length - 1; l >= 0; l--) if (block.lanes[l] === null) return l;
    } else {
        for (let l = 0; l < block.lanes.length; l++) if (block.lanes[l] === null) return l;
    }
    return -1;
}

/**
 * 空いている着発線を選ぶ。
 *
 *   block   … 入る駅のブロック
 *   toTrack … そこから出ていく線路 (合流駅で線路が変わる場合)。
 *             ★尼崎のように線路ごとに使える番線が決まっている駅では、
 *               「入ってくる線路から入れる番線」と
 *               「出ていく線路へ出られる番線」の両方を満たす必要がある。
 *               例: JR宝塚線から来て上り内側線へ抜ける列車は
 *                   到着 9/8/7/6 ∩ 発車 6/5 = 6番 しか使えない。
 *               ここを見ていなかったため、上り内側線に 9番・8番の列車が
 *               現れていた (tools/check_routes.js で検出)。
 */
Train.prototype.findFreeLane = function (block, toTrack) {
        if (!block.isStation && !block.hoppoStationName) return (block.lanes[0]===null) ? 0 : -1;
        // 貨物ターミナルの着発線は、線の種類 (着発・E&S・荷役・留置) で選ぶ (js/34-freight-terminals.js)
        if (block.freightTerminal) return freightTerminalLaneFor(block, this.freightTerminalIntent(block.freightTerminal));
        let stName = block.hoppoStationName || STATIONS[block.stationIdx].name;
        
        /* ★指令の着発番線変更はここでは扱わない。
           以前はここで予約のレーン番号を「どの線路のブロックか」を見ずに返し、
           しかも発車判定の見込み (checkHold) から呼ばれた時点で予約を「済み」に
           していた。指定の線路・レーンへの進入は move() / checkHold() が
           reservedEntry() を通して行う。 */

        /* ------------------------------------------------ 進路の制限にしたがう

           ★駅ごとに「どの線路からどの番線へ入れるか」が決まっている
             (js/03-stations.js の STATION_ROUTES)。
             以前は尼崎だけレーン番号を決め打ちした表を持ち、ほかの駅では
             「その線路のレーンならどれでも」という扱いだった。
             そのためつながっていない番線に入る列車が出ていた。
             進路がつながっている番線に限り、そのうえで種別・時間帯ごとの
             使い分け (STATION_PLATFORM_USE) の順に空きを探す。 */
        {
            const hour = (this.game.currentTime / 3600) % 24;
            let pref = stationPreferredLanes(stName, this.trackId, this.type, hour, "arrive");
            if (toTrack && toTrack !== this.trackId) {
                const out = stationRouteLanes(stName, toTrack, "depart");
                if (out) {
                    const both = (pref || out).filter(l => out.indexOf(l) >= 0);
                    /* 両方を満たす番線が無い駅では、出ていく側を優先する
                       (そこから出られない番線に入れても発車できない) */
                    pref = both.length ? both : out;
                }
            }
            if (pref && pref.length) {
                for (const l of pref) {
                    if (l < block.lanes.length && block.lanes[l] === null) return l;
                }
                /* 進路がつながっている番線が全部埋まっている。
                   つながっていない番線へ勝手に入れてはいけないので、待つ。 */
                return -1;
            }
        }

        const isFreight = ["貨物", "回送", "臨時"].includes(this.type);
        if (stName === "向日町操") {
            /* 車両所 (京都支所) に出入りする列車だけが着発線 (外側の線) を使い、
               ほかの列車は本線 (0番目のレーン) を通る */
            if (this.startName==="向日町操"||this.dest==="向日町操") {
                for(let l=block.lanes.length-1; l>=0; l--) if(block.lanes[l]===null) return l;
                return -1;
            } else return (block.lanes[0]===null) ? 0 : -1;
        }

        if (isFreight) {
            if (["ひめじ別所", "鷹取", "西大路", "向日町", "吹田貨", "京都", "姫路", "西明石", "大阪", "尼崎", "加古川"].includes(stName)) {
                for(let l=block.lanes.length-1; l>=0; l--) if(block.lanes[l]===null) return l;
                return -1;
            } else {
                // デフォルト: 0番レーン(本線)を優先するが、塞がっていれば他の空きレーンを使って通過(追い越し)する
                for (let l = 0; l < block.lanes.length; l++) {
                    if (block.lanes[l] === null) return l;
                }
                return -1;
            }
        }

        // ★改善: 待避線を優先するのは「普通」だけに変更（快速は本線を優先させる）
        if (this.type === "普通") {
            if (OVERTAKE_STATIONS.includes(stName)) {
                for(let l=block.lanes.length-1; l>=0; l--) {
                   if(block.lanes[l]===null) return l;
                }
                return -1;
            }
        }

        // デフォルト処理: 上記以外の列車（快速・新快速・特急など）は、
        // 0番レーン（本線）から順に空いているレーンを探す
        for (let l = 0; l < block.lanes.length; l++) {
            if (block.lanes[l] === null) return l;
        }
        return -1;
};

/* ================================================================== 着発番線の変更 (指令)

   ■ 何が壊れていたか
     指令パッドの「着発番線変更」は予約を記録するだけで、ほとんど効いていなかった。
       1. 予約の番線番号を「どの線路のブロックか」を見ずに当てていた。
          上り内側線を走る列車に「上り外側線の 0番目」を予約すると、
          上り内側線の 0番目のレーンに入ってしまう。そのレーンが無い線路では
          番線が永久に「空いていない」扱いになり、列車が駅の手前で止まり続けた。
       2. 予約の「済み」の印を、発車判定の見込み (checkHold) の中で付けていた。
          実際に入る前に予約が消えるので、指定の番線に入らないことがあった。
       3. 駅に着いてから線路を移すだけで、指定したレーンを見ていなかった。
          そのうえ移ったあとも予約が残り、毎回転線を試し続けていた。
       4. 向きの違う線路・その列車が通らない駅・通過済みの駅も予約できてしまった。

   ■ どう直したか
     予約は「その駅のその線路のそのレーン」として持ち、
       ・入れるかを予約のときに確かめる (向き・通過済み・配線の進路・レーンの有無)
       ・駅へ進入するときに、指定の線路・レーンへ入れる (move / checkHold)
       ・すでにその駅に居るなら、その場で構内の転線をする
       ・指定の番線がふさがっているあいだは手前で待つ。5分空かないときは
         予約を取りやめて通常の番線に入れる (待ち続けて線区を止めない)
       ・結果 (完了 / 取りやめ) は運転指令の記録に残す
     という形にした。 */

const TRACK_RES_WAIT = 300;     // 指定の番線が空くのを待つ上限 [秒]

/** 駅の、その線路のブロック (無ければ null) */
function stationBlockOn(game, trackId, stName) {
    const blks = game.trackMgr.blocks[trackId];
    if (!blks) return null;
    return blks.find(b => b.x !== -1000 && (b.isStation || b.hoppoStationName) &&
                          blockStationName(b) === stName) || null;
}

/** 線路の呼び名 (画面に出す) */
function trackLabelOf(trackId) {
    const t = (typeof TRACKS !== "undefined") ? TRACKS.find(x => x.id === trackId) : null;
    return t ? t.label : trackId;
}

/**
 * 着発番線の変更を予約できるかを確かめる。
 *   { ok: true, block, label } / { ok: false, msg }
 */
function trackChangeCheck(game, t, stName, trackId, lane) {
    if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };
    if (t.state === "in_depot" || t.state === "finished") {
        return { ok: false, msg: "留置中・運用を終えた列車の番線は変更できません。" };
    }
    if (!stName || !trackId) return { ok: false, msg: "駅と番線を選んでください。" };
    const sb = stationBlockOn(game, trackId, stName);
    if (!sb) return { ok: false, msg: `${trackLabelOf(trackId)}には${stName}駅の番線がありません。` };
    if (!(lane >= 0 && lane < sb.lanes.length)) return { ok: false, msg: "その番線はありません。" };
    const label = displayPlatformLabel(stName, trackId, lane);
    const text = label ? platformText(label) : ("第" + (lane + 1) + "線");
    // 客扱いをする駅では、ホームの無い線 (通過線・側線) は選べない
    if (!laneHasPlatform(stName, trackId, lane) && typeof t.passengerStopsAt === "function" && t.passengerStopsAt(stName)) {
        return { ok: false, msg: `${stName}駅の${text}はホームの無い線です。${t.trainNo} はこの駅で客扱いをするので入れられません。` };
    }

    // 向き (上り列車は上りの線路、下り列車は下りの線路)
    // ★終着列車は、到着する側に渡り線がある駅なら反対側の着発線にも入れる
    const td = trackDirOf(trackId);
    if (td && td !== t.dir && !crossArrivalAllowed(t, stName, trackId)) {
        return { ok: false, msg: `${t.trainNo} は${t.dir === 1 ? "上り" : "下り"}列車です。` +
                                 `${td === 1 ? "上り" : "下り"}線の${text}には入れません。` };
    }
    // その駅がこれから通る (または今いる) 駅か
    const d = (sb.index - t.currBlockIndex) * t.dir;
    if (d < 0) return { ok: false, msg: `${t.trainNo} はすでに${stName}駅を通り過ぎています。` };
    const blks = game.trackMgr.blocks[t.trackId];
    if (blks) {
        const endName = lineEndForBeyond(t.dest) || t.dest;
        const destB = blks.find(b => b.x !== -1000 && (b.isStation || b.hoppoStationName) &&
                                     blockStationName(b) === endName);
        if (destB && (destB.index - t.currBlockIndex) * t.dir >= 0 &&
            (destB.index - sb.index) * t.dir < 0) {
            return { ok: false, msg: `${t.trainNo} は${t.dest}止まりのため、${stName}駅へは行きません。` };
        }
        // いまの線路からその駅へたどれるか (線区が違えばその駅は通らない)
        const own = blks[sb.index];
        const shared = STATION_SHARED_LANES[stName];
        if (!shared && (!own || own.x === -1000 || blockStationName(own) !== stName)) {
            return { ok: false, msg: `${t.trainNo} の走る線路は${stName}駅を通りません。` };
        }
    }
    /* 配線の進路。その線路から入れない番線 (尼崎の宝塚線から1番 など) は断る。
       入ってくる線路に決まりがあればそれを、無ければ指定の線路の決まりを見る。 */
    const inTrack = (stationRouteLanes(stName, t.trackId, "arrive")) ? t.trackId : trackId;
    if (!canArriveAt(stName, inTrack, lane)) {
        const ok = (stationRouteLanes(stName, inTrack, "arrive") || [])
            .map(l => platformText(platformLabelOf(stName, inTrack, l))).join("・");
        return { ok: false, msg: `${stName}駅の配線では、${trackLabelOf(inTrack)}から${text}へは進入できません。` +
                                 (ok ? `（入れるのは ${ok}）` : "") };
    }
    return { ok: true, block: sb, label: text };
}

/**
 * その列車が、その駅の反対方向の着発線へ入ってよいか。
 * その駅止まりで、到着する側ののどに上下をつなぐ渡り線があるときだけ。
 */
function crossArrivalAllowed(t, stName, trackId) {
    if (!t || t.dest !== stName) return false;
    if (["普通", "快速", "新快速", "回送"].indexOf(t.type) < 0) return false;
    return canCrossArriveAt(stName, t.dir);
}

/**
 * 指令パッドに出す番線の候補。
 *   [{ value: "trackId,lane", text, disabled, note }]
 * 列車を選んでいれば、その列車が入れない番線は理由つきで選べなくする。
 */
function trackChangeCandidates(game, t, stName) {
    const out = [];
    if (!stName) return out;
    const seen = {};
    const tracks = (typeof TRACKS !== "undefined") ? TRACKS.map(x => x.id) : [];
    tracks.forEach(tid => {
        if (tid.indexOf("Hoppo") >= 0) return;
        const sb = stationBlockOn(game, tid, stName);
        if (!sb) return;
        sb.lanes.forEach((occ, li) => {
            const lbl = displayPlatformLabel(stName, tid, li);
            const text = lbl ? platformText(lbl) : ("第" + (li + 1) + "線");
            // 尼崎のように番線を共有する駅は、同じ番線を1つにまとめる
            const key = (STATION_SHARED_LANES[stName] === "all") ? ("all|" + lbl)
                      : STATION_SHARED_LANES[stName] ? (trackDirOf(tid) + "|" + lbl) : (tid + "|" + li);
            if (seen[key]) return;
            const ck = t ? trackChangeCheck(game, t, stName, tid, li) : { ok: true };
            // 共有の駅は、その列車が入れる線路の組み合わせを探す
            if (t && !ck.ok && STATION_SHARED_LANES[stName]) return;
            seen[key] = true;
            const plat = isPlatformLane(stName, tid, li);
            const occText = occ ? ` [在線 ${occ.trainNo || "回送"}]` : "";
            out.push({
                value: tid + "," + li,
                text: `${trackLabelOf(tid)} ${text}${plat ? "" : "(側線)"}${occText}`,
                disabled: !ck.ok, note: ck.ok ? "" : ck.msg
            });
        });
    });
    return out;
}

/** その列車がこれから通る駅 (今いる駅を含む)。番線変更の駅の候補に使う */
function trainStationsAhead(game, t, maxN) {
    const out = [];
    const blks = t ? game.trackMgr.blocks[t.trackId] : null;
    if (!blks) return out;
    for (let i = t.currBlockIndex; i >= 0 && i < blks.length && out.length < (maxN || 20); i += t.dir) {
        const b = blks[i];
        if (!b || b.x === -1000) break;
        if (!isRealStationBlock(b)) continue;
        const n = blockStationName(b);
        if (n && out.indexOf(n) < 0) out.push(n);
        if (n === t.dest) break;
    }
    return out;
}

/** 予約を取りやめる (理由を記録に残す) */
Train.prototype.failReservation = function (reason) {
    const r = this.trackChangeReservation;
    if (!r || r.status !== "pending") return;
    r.status = "failed";
    r.note = reason;
    this.game.ui.updateBanner(
        `【運転整理】${this.trainNo} の${r.stationName}駅 ${r.label || ""}への着発番線変更は、` +
        `${reason}ため取りやめ、通常の番線へ入れます。`, "banner-orange");
};

/** 予約どおりに入れたときの後始末 */
Train.prototype.completeReservation = function (how) {
    const r = this.trackChangeReservation;
    if (!r || r.status !== "pending") return;
    r.status = "done";
    r.doneAt = this.game.currentTime;
    this.game.ui.updateBanner(
        `【指令】${this.trainNo} は${r.stationName}駅 ${r.label || ""}に${how || "進入しました"}（着発番線変更）。`,
        "banner-orange");
};

/**
 * 次のブロックが予約の駅なら、指定の線路・レーンを返す。
 *   { trackId, block, lane, free } / null (予約が当てはまらない)
 * 指定の番線がふさがったまま待ちの上限を過ぎたら、予約を取りやめて null を返す。
 */
Train.prototype.reservedEntry = function (nextIdx) {
    const r = this.trackChangeReservation;
    if (!r || r.status !== "pending") return null;
    const own = this.game.trackMgr.blocks[this.turnbackTrack || this.trackId] ||
                this.game.trackMgr.blocks[this.trackId];
    const nb = own ? own[nextIdx] : null;
    if (!nb || nb.x === -1000 || !isRealStationBlock(nb) || blockStationName(nb) !== r.stationName) return null;
    if (trackDirOf(r.targetTrackId) && trackDirOf(r.targetTrackId) !== this.dir &&
        !crossArrivalAllowed(this, r.stationName, r.targetTrackId)) {
        this.failReservation("列車の向きが変わった");
        return null;
    }
    const rb = this.game.trackMgr.blocks[r.targetTrackId];
    const blk = rb ? rb[nextIdx] : null;
    if (!blk || blk.x === -1000 || blockStationName(blk) !== r.stationName) {
        this.failReservation("指定の線路へ進路が構成できない");
        return null;
    }
    const free = blk.lanes[r.targetLane] === null;
    if (!free) {
        if (r.waitSince === undefined || r.waitSince === null) r.waitSince = this.game.currentTime;
        if (this.game.currentTime - r.waitSince >= TRACK_RES_WAIT) {
            const occ = blk.lanes[r.targetLane];
            this.failReservation(`指定の番線が${occ && occ.trainNo ? " " + occ.trainNo + " の在線で" : ""}5分以上空かない`);
            return null;
        }
    } else {
        r.waitSince = null;
    }
    return { trackId: r.targetTrackId, block: blk, lane: r.targetLane, free: free };
};

/**
 * すでに予約の駅に居る列車は、その場で構内の転線をする。
 * 毎Tick呼ぶ (js/11-train-core.js の update)。
 * 通過済み・向きが変わったなどで当てはまらなくなった予約はここで片付ける。
 */
Train.prototype.applyTrackReservation = function () {
    const r = this.trackChangeReservation;
    if (!r || r.status !== "pending") return;
    const blks = this.game.trackMgr.blocks[this.trackId];
    const cb = blks ? blks[this.currBlockIndex] : null;
    if (!cb) return;
    const rb = this.game.trackMgr.blocks[r.targetTrackId];
    const target = rb ? rb[this.currBlockIndex] : null;
    const hereName = isRealStationBlock(cb) ? blockStationName(cb) : "";

    // 予約の駅を通り過ぎた
    const sb = stationBlockOn(this.game, r.targetTrackId, r.stationName);
    if (sb && (sb.index - this.currBlockIndex) * this.dir < 0 && hereName !== r.stationName) {
        this.failReservation(`${r.stationName}駅を通過した`);
        return;
    }
    if (hereName !== r.stationName) return;

    // いまの位置がすでに指定の番線
    if (this.trackId === r.targetTrackId && this.lane === r.targetLane) {
        this.completeReservation("入っています");
        return;
    }
    if (trackDirOf(r.targetTrackId) && trackDirOf(r.targetTrackId) !== this.dir &&
        !crossArrivalAllowed(this, r.stationName, r.targetTrackId)) {
        this.failReservation("列車の向きが変わった");
        return;
    }
    if (!target || target.x === -1000 || blockStationName(target) !== r.stationName) {
        this.failReservation("指定の線路へ進路が構成できない");
        return;
    }
    if (target.lanes[r.targetLane] !== null) {
        if (r.waitSince === undefined || r.waitSince === null) r.waitSince = this.game.currentTime;
        if (this.game.currentTime - r.waitSince >= TRACK_RES_WAIT) {
            this.failReservation("指定の番線が5分以上空かない");
        }
        return;
    }
    // 構内の転線 (入換)。自分が入っている枠だけを空ける
    const at = cb.lanes.indexOf(this);
    if (at >= 0) cb.lanes[at] = null;
    this.trackId = r.targetTrackId;
    this.lane = r.targetLane;
    target.lanes[r.targetLane] = this;
    // 折り返しで「発車のときに入る線路」を覚えていた場合、同じ線路に移ったら消す
    if (this.turnbackTrack === this.trackId) this.turnbackTrack = null;
    this.completeReservation("転線しました");
};

/* ================================================================== ホームの無い線に旅客列車を停めない

   ■ 何が起きていたか
     芦屋の「下通」のような、ホームの無い通過線・待避線 (STATION_PLATFORM_RULES の lanes が false)
     に、新快速などの旅客列車が入ってそのまま客扱いの停車をしていた。
     着発線の選び方 (findFreeLane) が「空いているレーン」を探すだけで、
     ホームがあるかを見ていなかったため。

   ■ 決まり (全駅に同じく当てる)
     ・旅客列車 (普通・快速・新快速・特急) がその駅に停まる (客扱いをする) ときは、
       少なくとも片側にホームのある線にしか入れない。
     ・ホームのある線が空いていなければ、手前で待つ (ホームの無い線で客扱いをしない)。
     ・通過する列車・回送・貨物は、これまでどおりホームの無い線も通れる。
     ・ホームの無い線は、番線の定義のまま「ホームの無い線」として残す。
     ・指令の着発番線変更でも、停まる駅でホームの無い線は選べない。 */

const PASSENGER_TYPES = ["普通", "快速", "新快速", "特急"];

/** その列車がその駅で客扱いの停車をするか */
Train.prototype.passengerStopsAt = function (stName) {
    if (PASSENGER_TYPES.indexOf(this.type) < 0 || !stName) return false;
    if (this.serviceChange && this.serviceChange.at === stName) return true;
    if (this.dest === stName) return true;
    if (lineEndForBeyond(this.dest) === stName) return true;
    const st = (STATION_MAP[stName] !== undefined && STATIONS[STATION_MAP[stName]] &&
                STATIONS[STATION_MAP[stName]].name === stName) ? STATIONS[STATION_MAP[stName]] : { name: stName, stopTime: 60 };
    try { return !!this.shouldStop(st); } catch (e) { return false; }
};

/** その駅のそのレーンにホームがあるか (番線の定義の無い駅は、あるものとして扱う) */
function laneHasPlatform(stName, trackId, lane) {
    if (!STATION_PLATFORM_RULES[stName]) return true;
    if ((PLATFORM_OUTSIDE_LANE_DATA[stName] || []).indexOf(trackId) >= 0) return true;
    const e = stationLaneEntry(stName, trackId, lane);
    return e ? !!e.platform : true;
}

/* 番線の定義 (レーン) には入っていないが、実物ではホームのある線。
   山科 … 外側線 (列車線) と湖西線の列車は 1番・4番のりば (湖西線側のホーム) に停まる。
          番線の定義では外側線のレーンを「上通」「下通」として持っているだけなので、ここで補う。 */
const PLATFORM_OUTSIDE_LANE_DATA = { "山科": ["Up_Out", "Down_Out", "Kosei_Up", "Kosei_Down"] };

(function () {
    const base = Train.prototype.findFreeLane;
    Train.prototype.findFreeLane = function (block, toTrack) {
        const lane = base.call(this, block, toTrack);
        if (!block || block.freightTerminal || !(block.isStation || block.hoppoStationName)) return lane;
        const stName = block.hoppoStationName || (STATIONS[block.stationIdx] ? STATIONS[block.stationIdx].name : "");
        const tid = block.trackId || this.trackId;
        if (this.skipStopAt && this.skipStopAt !== stName) this.skipStopAt = null;
        if (this.crossingOutAt && this.crossingOutAt !== stName) this.crossingOutAt = null;
        /* 行き止まりの折返線 (甲子園口の2番) は、その駅で折り返す列車だけが入る。
           折り返す列車は空いていれば折返線を使い、通る列車は折返線以外の線へ。 */
        if (STATION_STUB_LANES[stName]) {
            const ends = this.dest === stName || (this.serviceChange && this.serviceChange.at === stName);
            const stubFree = [];
            for (let l = 0; l < block.lanes.length; l++) if (block.lanes[l] === null && isStubLane(stName, tid, l)) stubFree.push(l);
            if (ends && stubFree.length && (lane < 0 || !isStubLane(stName, tid, lane))) return stubFree[0];
            if (!ends && lane >= 0 && isStubLane(stName, tid, lane)) {
                for (let l = 0; l < block.lanes.length; l++) {
                    if (block.lanes[l] === null && !isStubLane(stName, tid, l) && laneHasPlatform(stName, tid, l)) return l;
                }
                return -1;
            }
        }
        if (lane < 0 || laneHasPlatform(stName, tid, lane)) return lane;
        if (!this.passengerStopsAt(stName)) return lane;              // 通過なら通過線でよい
        /* その駅での客扱いを済ませて、同じ駅の中で隣の線路へ移って発車するとき
           (西明石で下り内側線から下り外側線へ出る など) は、もう停車ではないので
           ホームの無い線でよい。ここで止めると、この列車を待って譲った列車と
           互いに待ち合って動けなくなる。 */
        {
            const cur = (this.game.trackMgr.blocks[this.trackId] || [])[this.currBlockIndex];
            if (cur && cur !== block && isRealStationBlock(cur) && blockStationName(cur) === stName && this.hasStoppedAtCurrent) {
                this.crossingOutAt = stName;                           // 客扱いを済ませて渡り線を通って出ていく途中
                return lane;
            }
        }
        /* 停まる列車がホームの無い線を選ばれた → 進路のつながっている、ホームのある線を探す */
        const hour = (this.game.currentTime / 3600) % 24;
        // 進路は入る線路 (tid) で見る。複々線の端で外側線から内側線へ移るときは this.trackId と違う
        const pref = stationPreferredLanes(stName, tid, this.type, hour, "arrive");
        const out = (toTrack && toTrack !== tid) ? stationRouteLanes(stName, toTrack, "depart") : null;
        let reachable = 0;
        for (let l = 0; l < block.lanes.length; l++) {
            if (!laneHasPlatform(stName, tid, l)) continue;
            if (pref && pref.indexOf(l) < 0) continue;
            if (out && out.indexOf(l) < 0) continue;
            reachable++;
            if (block.lanes[l] === null) return l;
        }
        if (reachable > 0) return -1;                                  // ホームのある線が空くまで手前で待つ
        /* この線路からはホームのある線へ入れない (例: 電車線にしかホームの無い駅で、
           列車線に回った普通)。ホームの無い線で客扱いはしないので、この駅は停まらずに通る。
           終着駅だけは例外 (そこで運転を終える)。 */
        if (this.dest === stName) {
            /* 終着駅なのに、この線路ではホームに入れない (運転整理で短縮された列車など)。
               ホームの無い線で運転を終えることはできないので、この線路にホームがあって
               折り返せる、前方の駅まで行先を延ばす。 */
            let nx = stName;
            for (let k = 0; k < 10; k++) {
                nx = nextReversibleAhead(nx, this.dir);
                if (!nx) break;
                const nb = (this.game.trackMgr.blocks[tid] || []).find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === nx);
                if (nb && nb.lanes.some((_, l) => laneHasPlatform(nx, tid, l))) {
                    this.game.ui.updateBanner(`【運転整理】${this.trainNo} は${stName}駅の${trackLabelOf(tid)}にホームが無いため、行先を ${nx} に延長します。`, "banner-orange");
                    this.dest = nx;
                    break;
                }
            }
            if (this.dest === stName) return lane;                    // 延ばせる駅が無い (念のため)
        }
        this.skipStopAt = stName;
        return lane;
    };
    // ホームへ入れない駅は通過する (上の skipStopAt)
    const baseStop = Train.prototype.shouldStop;
    Train.prototype.shouldStop = function (st) {
        if (st && this.skipStopAt && st.name === this.skipStopAt && this.dest !== st.name) return false;
        return baseStop.call(this, st);
    };
})();
