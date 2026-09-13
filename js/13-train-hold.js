/* このファイルは index.html から分割されたものです。
   Train: 抑止(信号待ち)判定と着発番線の選択 */
Train.prototype.checkHold = function (isStarting) {
        const blks = this.game.trackMgr.blocks[this.trackId];
        const nextIdx = this.currBlockIndex + this.dir;
        let targetTrackId = this.trackId; // ★変数のスコープを関数全体に広げてエラーを防止

        /* ★信号現示による停止判定 (js/25-signals.js)。
           転てつ器故障・信号故障など、進路が構成できない障害が
           前方にある場合はここで止まる。
           在線・見合わせによる停止は下の従来の判定と同じ結果になるので、
           ここでは障害の分だけを見る (既存の動きを変えないため)。 */
        if (this.game.signals && this.game.signals.hasFault(this.trackId, nextIdx)) {
            this.signalAspect = "R";
            return true;
        }
        
        if (nextIdx >= 0 && nextIdx < blks.length) {
            let nextBlk = blks[nextIdx];
            // 線路の無い区間へは進めない (線区の端)
            if (nextBlk.x === -1000) return true;
            const currentBlk = blks[this.currBlockIndex]; // ★追加
            
            if (nextBlk && nextBlk.stationIdx !== undefined) {
                // 尼崎駅への直接進入判定
                if (nextBlk.stationIdx === STATION_MAP["尼崎"]) {
                    if (this.dir === 1 && this.trackId === "Fukuchi_Up") {
                        targetTrackId = TOZAI_THROUGH_DESTS.includes(this.dest) ?
                            "Tozai_Up" : "Up_In";
                    } else if (this.dir === 1 && !this.trackId.includes("Tozai") && TOZAI_THROUGH_DESTS.includes(this.dest)) {
                        targetTrackId = "Tozai_Up";
                    } else if (this.dir === -1 && !this.trackId.includes("Fukuchi") && FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                        targetTrackId = "Fukuchi_Down";
                    } else if (this.dir === -1 && this.trackId === "Tozai_Down") {
                        targetTrackId = FUKUCHI_THROUGH_DESTS.includes(this.dest) ?
                            "Fukuchi_Down" : "Down_In";
                    }
                }
                
                // ★事象対応: 西明石・草津での内側線ホーム直接進入を予測ロジック(checkHold)にも完全同期
                let timeH = (this.game.currentTime / 3600) % 24;
                if (nextBlk.stationIdx === STATION_MAP["西明石"] && this.dir === 1 && this.trackId.includes("Out") && ["普通", "快速"].includes(this.type)) {
                    let isMorningRushUpRapid = (this.type === "快速" && timeH >= 7.4 && timeH < 8.6);
                    if (!isMorningRushUpRapid) {
                        let inTrackId = this.trackId.replace("Out", "In");
                        let tBlks = this.game.trackMgr.blocks[inTrackId];
                        if (tBlks) {
                            let targetNextBlk = tBlks.find(b => b.stationIdx === nextBlk.stationIdx);
                            if (targetNextBlk && targetNextBlk.lanes.some(l => l === null)) {
                                targetTrackId = inTrackId;
                            }
                        }
                    }
                } else if (nextBlk.stationIdx === STATION_MAP["草津"] && this.dir === -1 && this.trackId.includes("Out")) {
                    let timeH = (this.game.currentTime / 3600) % 24;
                    let isMorningRush = (timeH >= 7.0 && timeH < 9.0);
                    if (["普通", "快速"].includes(this.type) || (this.type === "新快速" && !isMorningRush)) {
                        let inTrackId = this.trackId.replace("Out", "In");
                        let tBlks = this.game.trackMgr.blocks[inTrackId];
                        if (tBlks) {
                            let targetNextBlk = tBlks.find(b => b.stationIdx === nextBlk.stationIdx);
                            if (targetNextBlk && targetNextBlk.lanes.some(l => l === null)) {
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

            // ★修正: 西明石・草津からの発車時の転線予測もcheckHoldに同期
            if (currentBlk && currentBlk.stationIdx === STATION_MAP["西明石"] && this.dir === 1 && this.trackId.includes("Out") && ["普通", "快速"].includes(this.type)) {
                let timeH = (this.game.currentTime / 3600) % 24;
                let isMorningRushUpRapid = (this.type === "快速" && timeH >= 7.4 && timeH < 8.6);
                if (!isMorningRushUpRapid) {
                    targetTrackId = this.trackId.replace("Out", "In");
                }
            } else if (currentBlk && currentBlk.stationIdx === STATION_MAP["西明石"] && this.dir === -1 && this.trackId.includes("In") && this.dest !== "西明石") {
                targetTrackId = this.trackId.replace("In", "Out");
            } else if (currentBlk && currentBlk.stationIdx === STATION_MAP["草津"] && this.dir === -1 && this.trackId.includes("Out")) {
                let timeH = (this.game.currentTime / 3600) % 24;
                let isMorningRush = (timeH >= 7.0 && timeH < 9.0);
                if (["普通", "快速"].includes(this.type) || (this.type === "新快速" && !isMorningRush)) {
                    targetTrackId = this.trackId.replace("Out", "In");
                }
            } else if (currentBlk && currentBlk.stationIdx === STATION_MAP["草津"] && this.dir === 1 && this.trackId.includes("In") && this.dest !== "草津") {
                targetTrackId = this.trackId.replace("In", "Out");
            }

            if (targetTrackId !== this.trackId) {
                let tBlks = this.game.trackMgr.blocks[targetTrackId];
                // ★修正: 転線先のブロック配列を定義・取得する
                if (tBlks) {
                    // ★尼崎のハードコーディングを廃止し、実際の進入先駅ブロックまたは同一座標で満線判定を動的に行う
                    let targetNextBlk = tBlks.find(b => (nextBlk.stationIdx !== undefined && b.stationIdx === nextBlk.stationIdx) || Math.abs(b.x - nextBlk.x) < 20);
                    if (targetNextBlk && targetNextBlk.lanes.every(l => l !== null)) return true;
                }
            } else {
                if (nextBlk.lanes.every(l => l !== null)) return true;
            }
        }
        
        if (this.game.trackMgr.isSuspended(this.trackId, nextIdx)) return true;

        if (isStarting) {
                 if (this.startName === "向日町操") return false;
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
                     const isMajorOrOvertake = OVERTAKE_STATIONS.includes(currentStName) || SWITCHABLE_STATIONS.includes(currentStName);
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
                 const isMergeOrOvertake = OVERTAKE_STATIONS.includes(currentStName) || ["草津", "京都", "高槻", "新大阪", "大阪", "尼崎", "芦屋", "西明石", "兵庫"].includes(currentStName);

                 // ====================================================================
                 // ★新規追加: 駅構内での発車優先順位の厳格な調停ロジック（デッドロック完全排除）
                 // 同じ駅（同一ブロック）で発車タイミングを迎えた列車の優先順位を評価し、
                 // 最優先の1本だけが発車権を得るようにする。
                 // ====================================================================
                 // ====================================================================
                 // ★超強化: デッドロック完全排除と不要な遅延防止ロジック
                 // ====================================================================
                 if (currentBlock && (currentBlock.isStation || currentBlock.hoppoStationName)) {
                     let checkTracks = [this.trackId];
                     if (isMergeOrOvertake) {
                         if (this.trackId.includes("In")) checkTracks.push(this.trackId.replace("In", "Out"));
                         else if (this.trackId.includes("Out")) checkTracks.push(this.trackId.replace("Out", "In"));
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
                 let yieldCheckTracks = [this.trackId];
                 if (isMergeOrOvertake) {
                     if (this.trackId.includes("In")) yieldCheckTracks.push(this.trackId.replace("In", "Out"));
                     else if (this.trackId.includes("Out")) yieldCheckTracks.push(this.trackId.replace("Out", "In"));
                 }

             // ★改善②: 優等列車からの逃げ切り最優先ロジック（待避不能駅での意味不明な抑止を完全排除）
             if (!OVERTAKE_STATIONS.includes(currentStName)) {
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
                                             if (l.stuckTime < 480) {
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
             let scanTracks = [this.trackId];
 // 1. 普通・快速・新快速のダンゴ運転防止 ＆ 2. 優先度に基づく接近チェック（高度な動的間隔調整）
             if (["普通", "快速", "新快速"].includes(this.type)) {
                 // 過剰な遠方検知を防ぐため車間距離を適正化
                 const BASE_SPACING = { "普通": 1.5, "快速": 2.0, "新快速": 3.0 };
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
                 let reqDist = (this.type === "貨物" || this.type === "回送") ? UNITS_PER_STATION * 1.5 : (this.trackId.includes("Out") ? UNITS_PER_STATION * 3 : UNITS_PER_STATION * 2);
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

Train.prototype.findFreeLane = function (block) {
        if (!block.isStation && !block.hoppoStationName) return (block.lanes[0]===null) ? 0 : -1;
        let stName = block.hoppoStationName || STATIONS[block.stationIdx].name;
        
        if (this.trackChangeReservation && this.trackChangeReservation.status === "pending" && stName === this.trackChangeReservation.stationName) {
            const tLane = this.trackChangeReservation.targetLane;
            if (block.lanes[tLane] === null) { this.trackChangeReservation.status = "done"; return tLane; } else return -1;
        }

        // ★尼崎駅の柔軟なホーム共有・レーン選択ロジック
        if (stName === "尼崎") {
            let prefLanes = [];
            // 新快速、または外側線を走行する通過列車(特急・貨物等)のみ1・8番線の使用を許可
            let isOutermostAllowed = (this.type === "新快速" || ["特急", "貨物", "回送", "臨時"].includes(this.type));

            if (this.dir === 1) { // 上り (0:8番, 1:7番, 2:6番, 3:5番)
                if (this.trackId.includes("Out")) prefLanes = isOutermostAllowed ? [0, 1, 2, 3] : [1, 2, 3];
                else if (this.trackId.includes("Fukuchi") || this.trackId.includes("Tozai")) prefLanes = [1, 2, 3];
                else prefLanes = [3, 2, 1]; // Up_In
            } else { // 下り (0:4番, 1:3番, 2:2番, 3:1番)
                if (this.trackId.includes("Out")) prefLanes = isOutermostAllowed ? [3, 2, 1, 0] : [2, 1, 0];
                else if (this.trackId.includes("Fukuchi") || this.trackId.includes("Tozai")) prefLanes = [2, 1, 0];
                else prefLanes = [0, 1, 2]; // Down_In
            }
            for (let l of prefLanes) {
                if (block.lanes[l] === null) return l;
            }
            return -1;
        }

        const isFreight = ["貨物", "回送", "臨時"].includes(this.type);
        if (stName === "向日町操") {
            if (this.startName==="向日町操"||this.dest==="向日町操"||isFreight||this.type==="特急") {
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
