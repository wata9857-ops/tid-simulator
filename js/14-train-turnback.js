/* このファイルは index.html から分割されたものです。
   Train: 折り返し・車両故障などの小トラブル・所要時間計算 */
Train.prototype.executeTurnBack = function () {
        // 前回の判定を持ち越さない (出区して営業に戻った編成が、次の終着で
        // 理由もなく運用を終えてしまうのを防ぐ)
        this.retiredByBudget = false;
        const blks = this.game.trackMgr.blocks[this.trackId];
        const blk = blks[this.currBlockIndex];
        const stName = blockStationName(blk);

        // ★事象2対応: 運用変更(特急化など)がある場合は、他の折り返し/入庫ロジックより最優先で処理する
        if (this.serviceChange && this.serviceChange.at === stName) {
            /* ★運用が変わって進行方向も変わる場合は、先にその場で折り返す。
               送り込み回送が着いて、そこから反対方向の営業列車になる運用。
               番線が空くまでは何も変えずに待つ (serviceChange を消してしまうと
               やり直しが効かなくなり、向きがそのままで走り出してしまう)。 */
            const wantDir = this.game.ops.directionFor(stName, this.serviceChange.dest);
            if (wantDir !== 0 && wantDir !== this.dir) {
                if (!this.game.ops.moveToOppositeTrack(this, stName, wantDir)) {
                    this.timer = 30;
                    return;
                }
            }
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
            /* ★駅名が空のときは上書きしない。
               空の始発駅が入ると、車両の適合判定 (js/24-service-rules.js) が
               線区を決められず、明石の207系が「本線の普通」として
               弾かれることがあった。 */
            this.startName = stName || this.startName;   // ここから始まる列車になる
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
            // 行先が変わったので、湖西線経由かどうかを決め直す
            this.updateKoseiRoute();
            this.state = "waiting_start";
            this.timer = 15; this.hasStoppedAtCurrent = false;
            this.nextAction = toDepot ? "depot" : "turnback";
            this.hasDeparted = false;
            this.delayTime = 0;
            this.isFinalStop = false; // ★修正: 運用変更時のフラグリセット
            return;
        }

        /* ★その種別が走りすぎているときは、超えているぶんに応じた割合だけ
           折り返さずに運用を終える (入区させる)。
           折り返しは種別を変えないので、何もしないと朝にできた
           「普通ばかり」の偏りが一日中残り、内側線が普通で埋まって
           快速・新快速が発車できなくなる。
           全部止めると京都に着いた列車がすべて向日町操へ回送され、
           琵琶湖線の普通がゼロになるので、割合で効かせる。
           (js/10-timetable.js の ttRetireChance) */
        if (this.nextAction !== "depot" && !this.serviceChange &&
            ["普通", "快速"].indexOf(this.type) >= 0) {
            const ttLine = ttLineOf(this);   // main / kosei / fukuchi / tozai
            /* ★折り返した先に続く列車がいないときは、目安を超えていても
               運用を終えない (js/10-timetable.js の ttStillNeeded)。
               ここを見ずに割合だけで切っていたため、京都から大阪方面へ
               9〜10駅ぶん列車がいない時間帯ができていた。 */
            if (!ttStillNeeded(this.game, this, stName) &&
                Math.random() < ttRetireChance(this.game, ttLine, this.type)) {
                this.nextAction = "depot";
                /* ★この印を付けておかないと、この決定がすぐ取り消されていた。
                   下の "depot" の処理は、その駅に留置場が無い (または満線の) とき
                   tryConvertDeadhead() を呼ぶが、その中の最初の手が
                   「まず折り返しを試す」(preferTurnback) なので、
                   運用を終えたはずの列車がそのまま折り返して走り続けていた。
                   本線の普通は目安42本に対して実測130本前後まで増え、
                   大阪の上り普通が実際の時刻表の2倍 (16.7本/時) になっていた。
                   印が付いているときは折り返さず、車両所へ回送するか運用を終える。 */
                this.retiredByBudget = true;
            }
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

        /* ------------------------------------------------ 大阪での方転

           ★大阪・新大阪のホームでは向きを変えられない (引上線が必要)。
             とくに丹波路快速のように JR宝塚線へ向かう列車は、
             大阪のホームから宝塚線へ出る進路が無い。
             実際の運用と同じく、宮原まで回送して方向を変え、
             戻ってから次の運用に入る。
               大阪着 → 宮原方へ回送 → 宮原で方転 → 大阪方へ戻る → 発車
             編成は線路の上を走るので、行路もつながったままになる。 */
        if (this.nextAction !== "depot" && !this.serviceChange &&
            ["大阪", "新大阪"].indexOf(stName) >= 0 &&
            ["普通", "快速", "新快速"].indexOf(this.type) >= 0) {
            const oldNo = this.trainNo;
            this.game.spawner.activeTrainNos.delete(this.trainNo);
            this.type = "回送";
            this.trainNo = this.game.ops.deadheadNo();
            this.dutyName = this.trainNo;
            this.game.spawner.activeTrainNos.add(this.trainNo);
            this.dest = "宮原操";
            this.startName = stName || this.startName;
            this.nextAction = "depot";
            this.isFinalStop = false;
            this.hasStoppedAtCurrent = false;
            /* 宮原操は新大阪の位置で本線につながる。大阪からは上り方向。
               向きを変える必要があるときは、その場で反対方向の線路へ移す。 */
            const wantDir = (fleetIndexOf("宮原操") > fleetIndexOf(stName)) ? 1 : -1;
            if (this.dir !== wantDir && !this.game.ops.moveToOppositeTrack(this, stName, wantDir)) {
                // 反対方向の番線が空くまで待つ (進路が開いてから動かす)
                this.timer = 30;
                this.type = "回送";
                return;
            }
            // 回送は列車線 (外側線) を走らせる
            this.rerouteToOuter = true;
            if (!/Kosei|Fukuchi|Tozai|Hoppo/.test(this.trackId) && this.trackId.indexOf("In") >= 0) {
                this.attemptTrackSwitch(this.trackId.replace("In", "Out"), 20, true);
            }
            this.state = "waiting_start";
            this.timer = 15;
            this.stuckTime = 0;
            this.hasDeparted = false;
            this.game.ui.updateBanner(
                `【運転整理】${stName}駅は引上線を使わないと方向を変えられないため、` +
                `${oldNo} は ${this.trainNo}(回送) として宮原へ引き上げます。`, "banner-orange");
            return;
        }

        // ★追加: 米原駅 上り快速の近江塩津・敦賀への延長運転（4時～9時台、16時～20時台）
        if (stName === "米原" && this.dir === 1 && this.dest === "米原" && this.type === "快速") {
            if ((hOfDay >= 4.0 && hOfDay < 10.0) || (hOfDay >= 16.0 && hOfDay < 21.0)) {
                if (this.game.currentTime >= this.game.spawner.nextMaibaraExtendTime) {
                    this.game.spawner.nextMaibaraExtendTime = this.game.currentTime + (45 * 60) + (Math.random() * 600 - 300); // 約45分後
                    this.game.spawner.activeTrainNos.delete(this.trainNo);
                    this.type = "普通";
                    this.dest = (Math.random() < 0.5) ? "近江塩津" : "敦賀";
                    this.trainNo = this.game.spawner.generateTrainNumber("普通", 1, "米原", this.trackId);
                    // ★ここから始まる列車になるので始発駅も更新する
                    this.startName = stName || this.startName;
                    this.dutyName = this.trainNo;
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
                // ★ここから始まる列車になるので始発駅も更新する
                this.startName = stName || this.startName;
                this.dutyName = this.trainNo;
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
        //   ただし、いまの編成でその線区の普通運用に入れない場合は降格しない。
        //   (湖西線の普通は京都支所の車両のみ、という規則を壊さないため)
        if (hOfDay >= 22.25 && ["新快速", "快速"].includes(this.type) &&
            this.canChangeTypeTo("普通", stName)) {
            this.type = "普通";
        }

        // ★修正: 留置場がある駅での折り返しは、一旦留置場へ入庫させる
        //   (貨物は除く。特急も専用編成なので、通勤形用の電留線には入れない)
            /* ★turnbackFirst の駅 (京都・尼崎) は、運用を終えると決まった
               列車だけを入区させる。ふだんはその場で折り返す。 */
            const depHere = DEPOTS[stName];
            const stableHere = !!depHere && depHere.trains.length < depHere.capacity &&
                               (!depHere.turnbackFirst || this.retiredByBudget ||
                                hOfDay >= 22.0 || hOfDay < 5.0);
            if (this.type !== "貨物" && this.type !== "特急" && stableHere) {
                let depot = DEPOTS[stName];
                const newDir = this.dir * -1;
                let nextDest = this.game.spawner.getDestination(this.type, newDir, stName, this.trackId);
                // ★行先が始発駅と同じになった場合の代替。
                //   以前は上り=京都/下り=姫路と決め打ちしていたため、
                //   草津で上りに折り返した列車に「京都行き」(= 後方) が
                //   割り当てられ、終点に着けないまま走り続けていた。
                if (nextDest === this.startName) {
                    nextDest = this.game.spawner.fallbackTerminal(newDir, stName, this.trackId);
                }
                if (stName === "向日町操" && nextDest === "向日町操") nextDest = (newDir===1) ? "京都" : "大阪";
                
                // ★追加: 次の情報で上書きされる前に旧情報を保存（黒背景・白文字用）
                this.oldInfo = { type: this.type, dest: this.dest, trainNo: this.trainNo };

                this.game.spawner.activeTrainNos.delete(this.trainNo);
                let nextNo = this.game.spawner.generateTrainNumber(this.type, newDir, stName, this.trackId);
                
                this.depotOutConfig = { type: this.type, dest: nextDest, trainNo: nextNo,
                                        dir: newDir, dutyName: nextNo };
            
                // ★車両を留置場へ返却 (返却先は車両所グループに応じてFleetManagerが決める)
                this.game.fleet.release(stName, this.vehicles);
                this.vehicles = [];

                // 本線から消去して留置場へ
                blk.lanes[this.lane] = null;
                this.state = "in_depot";
            this.startName = stName || this.startName;

            // ★修正: 既に出区待ちの列車がいれば、その次の始発列車として充当（待機時間を調整）
            let maxTimer = 0;
            depot.trains.forEach(t => {
                if (t.timer > maxTimer) maxTimer = t.timer;
            });
            // ★修正: 出区前の表示時間を長く確保するため、最低5分(300秒)留置。先客がいればその後ろ(+180秒)。
            /* ★出区待ちの列に並ばせるが、待ち時間に上限をつける。
               以前は「先客の待ち時間 + 180秒」と累み上げていたので、
               6本並ぶと最後の1本は20分待ちになっていた。
               放出の電留線が JR東西線 下りの主な供給源になっている
               時間帯には、下りが 2本/時 しか出せなくなっていた
               (実際の時刻表は 8本/時)。
               線路が空くまで待つのは checkHold が受け持つので、
               出区の間隔は実際の電留線と同じ 2分程度でよい。 */
            this.timer = Math.max(300, Math.min(maxTimer + 120, 660)); 
            
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
                    // ★ここから始まる列車になるので始発駅も更新する
                    this.startName = stName || this.startName;
                    this.dutyName = this.trainNo;
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

        /* ================================================== 方転できる駅かの確認

           ★ここが最後の砦。定時の終着でも、遅れの回復でも、詰まりの緩和でも、
             折り返しは必ずこの関数を通る。実物の配線で向きを変えられない駅
             (js/03-stations.js の canReverseAt) では折り返さない。

             以前は SWITCHABLE_STATIONS / OVERTAKE_STATIONS に入っているかで
             判断していたが、これは「転線できる駅」「待避できる駅」の表で、
             上下をつなぐ渡り線も引上線も無い 長岡京・西宮・向日町・茨木・
             川西池田・おごと温泉 も入っている。そのため遅れた列車が
             長岡京で勝手に折り返していた (利用者の指摘)。

           代わりの扱い (実際の運転整理と同じ順)
             1. その駅に留置場があれば入区して運用を終える
             2. 無ければ、前方でいちばん近い「方転できる駅」まで延長運転する
             3. それも無ければ車両所へ回送する / 運用を終える          */
        if (!canReverseAt(stName)) {
            const hh = (this.game.currentTime / 3600) % 24;
            const dep = DEPOTS[stName];
            if (this.type !== "貨物" && this.type !== "特急" &&
                dep && dep.trains.length < dep.capacity) {
                this.game.ui.updateBanner(
                    `【運転整理】${stName}駅は方向を変えられない配線のため、` +
                    `${this.trainNo} は折り返さず入区します。`, "banner-orange");
                this.enterDepot(stName);
                return;
            }
            /* ★延長する先の区間に、いまの編成で入れることも条件。
               宜原の223系を北陸線へ延長してしまうなど、
               編成の運用規則 (js/24-service-rules.js) を破らないようにする。 */
            let ahead = nextReversibleAhead(stName, this.dir);
            if (ahead && !this.game.fleet.canServe(this.vehicles, stName, this.type,
                                                   this.trackId, ahead, this.dutyName)) {
                ahead = null;
            }
            if (ahead && hh >= 4.0 && hh < 22.75) {
                const oldNo = this.trainNo;
                this.dest = ahead;
                this.nextAction = "turnback";
                this.isFinalStop = false;
                this.hasStoppedAtCurrent = false;
                this.state = "running";
                this.timer = 15;
                this.updateKoseiRoute();
                this.game.ui.updateBanner(
                    `【運転整理】${stName}駅は方向を変えられない配線のため、` +
                    `${oldNo} は折り返さず ${ahead}まで延長運転します。`, "banner-orange");
                return;
            }
            if (!this.tryConvertDeadhead(stName)) this.remove();
            return;
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

        /* ★同一ホーム折り返し。

           ■ 何が問題だったか
             折り返しのたびに番線が変わっていた。到着は下り線の着発線、
             発車は上り線の着発線という作りで、折り返しの瞬間に
             必ず反対側の線路へ移していたためである。
             実測では、折り返し332回のうち254回 (76%) で番線が変わり、
             「西明石 2番 → 4番」「姫路 2番 → 3番」のように、
             指令画面でも番線が飛んで見えていた。

           ■ 実際の運用
             折り返し列車は到着した番線にそのまま留まり、
             種別・行先・列車番号だけが変わる。反対方向の線路へ移るのは
             発車のときで、駅の渡り線 (両渡り) を通る。

           ■ どう直したか
             渡り線のある駅 (SWITCHABLE_STATIONS / OVERTAKE_STATIONS) では、
             ここで線路を移さずに向きだけ変え、「発車のときに入る線路」を
             turnbackTrack に覚えておく。実際の転線は最初の1ブロックを
             進むときに行う (js/12-train-move.js)。
             渡り線の無い駅では、これまでどおり構内を移動して折り返す
             (それが実際の入換動作にあたる)。 */
        const canTurnInPlace = !globalThis.__TB_OFF &&
                               (SWITCHABLE_STATIONS.indexOf(stName) >= 0 ||
                                OVERTAKE_STATIONS.indexOf(stName) >= 0) &&
                               newTrackId !== this.trackId &&
                               !!this.game.trackMgr.blocks[newTrackId] &&
                               /* ★その駅・その番線で、ホームのまま折り返せるか。
                                  大阪・新大阪は引上線へ引き上げてからでないと
                                  方向を変えられない。尼崎の引上線は4番・5番だけに
                                  つながっている (js/03-stations.js を参照)。 */
                               canTurnBackOnPlatform(stName, this.trackId, this.lane, newTrackId) &&
                               /* ★その番線から、折り返した先の線路へ出られること。
                                  出られない番線で向きだけ変えると、進路の無い所から
                                  発車することになる。尼崎の4番のように、引上線には
                                  入れるが上り内側線へは出られない番線がある。
                                  その場合は構内を移動して折り返す (実際の入換)。 */
                               canDepartTo(stName, this.trackId, this.lane, newTrackId);
        const sameSpot = !!(newB && newTrackId === this.trackId &&
                            newB.index === this.currBlockIndex);

        if (canTurnInPlace) {
            // 到着した番線のまま、向きと運用だけを変える
            this.dir = newDir;
            this.turnbackTrack = newTrackId;      // 発車のときに入る線路
            if (!["回送", "貨物", "臨時", "特急"].includes(this.type)) {
                this.dest = this.game.spawner.getDestination(this.type, this.dir, stName, newTrackId);
                if (this.dest === this.startName) {
                    this.dest = this.game.spawner.fallbackTerminal(this.dir, stName, newTrackId);
                }
                // 近江塩津・敦賀からの下り普通は米原行きとする (琵琶湖線経由)
                if (this.dir === -1 && this.type === "普通" &&
                    ["敦賀", "近江塩津"].includes(stName) && newTrackId.indexOf("Kosei") < 0) {
                    this.dest = "米原";
                }
                this.game.spawner.activeTrainNos.delete(this.trainNo);
                this.trainNo = this.game.spawner.generateTrainNumber(this.type, this.dir, stName, newTrackId);
                this.dutyName = this.trainNo;
                this.updateKoseiRoute();
                this.startName = stName || this.startName;
            }
            if (stName === "向日町操" && this.dest === "向日町操") this.dest = (this.dir === 1) ? "京都" : "大阪";

            const newVehicles = this.game.fleet.reassign(stName, this.type, newTrackId,
                this.dest, this.dutyName || this.trainNo, this.vehicles);
            if (!newVehicles || newVehicles.length === 0) {
                this.game.ui.updateBanner(`【運休】${stName}駅 車両枯渇のため、折り返し予定の ${this.trainNo} は運休(消滅)となります。`, "banner-orange");
                this.remove();
                return;
            }
            this.vehicles = newVehicles;

            this.state = "waiting_start"; this.timer = 15; this.stuckTime = 0;
            this.hasStoppedAtCurrent = false;
            this.hasDeparted = false;
            this.carryOverDelay(180);
            this.isFinalStop = false;

            if (this.nextAction === "stop_opposite_home") {
                this.isManuallySuspended = true;
                this.manualSuspendTimer = 0;
                this.hasNotifiedSuspendLong = false;
                this.nextAction = "turnback";
                this.game.ui.updateBanner(`【指令】${this.trainNo} は ${stName}駅にて折り返し、同じ番線で抑止手配されました。`, "banner-orange");
            }
            return;
        }
        if (newB) {
            let freeLanes = newB.lanes.filter(l => l === null).length;
            if (!sameSpot && freeLanes <= 1) { 
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
            if (sameSpot) {
                // いまの番線のまま折り返す (同一ホーム折り返し)
                tl = this.lane;
            } else if (this.startName === "向日町操" || blk.hoppoStationName === "向日町操" || stName === "向日町操") {
                for(let l=newB.lanes.length-1; l>=0; l--) { if(newB.lanes[l]===null) { tl=l; break; } }
            } else {
                /* ★折り返し先の番線も、進路のつながっている所から選ぶ。
                   以前は「外側のレーンから順に」と決め打ちしていたため、
                   尼崎のように線路ごとに使える番線が決まっている駅で
                   あり得ない番線に入っていた。 */
                tl = pickRouteLane(newB, stName, newTrackId, "depart",
                                   this.type, hOfDay, true);
            }
            
            if (tl !== -1) {
                if (!sameSpot) {
                    const at = blk.lanes.indexOf(this);
                    if (at >= 0) blk.lanes[at] = null; else blk.lanes[this.lane] = null;
                }
                this.trackId = newTrackId; this.dir = newDir; this.currBlockIndex = newB.index; this.lane = tl;
                newB.lanes[tl] = this;
                if (!["回送","貨物","臨時","特急"].includes(this.type)) {
                    this.dest = this.game.spawner.getDestination(this.type, this.dir, stName, newTrackId);
                    if (this.dest === this.startName) {
                        this.dest = this.game.spawner.fallbackTerminal(this.dir, stName, this.trackId);
                    }
                    
                    // ★追加: 近江塩津・敦賀からの下り普通は米原行きとする（琵琶湖線経由）
                    if (this.dir === -1 && this.type === "普通" && ["敦賀", "近江塩津"].includes(stName) && !this.trackId.includes("Kosei")) {
                        this.dest = "米原";
                    }

                    this.game.spawner.activeTrainNos.delete(this.trainNo); // ★追加
                    this.trainNo =this.game.spawner.generateTrainNumber(this.type, this.dir, stName, this.trackId);
                    this.dutyName = this.trainNo;   // 一般の営業列車は運用名=列車番号
                    // 行先が変わったので、湖西線経由かどうかを決め直す
                    this.updateKoseiRoute();
                    // ★折り返して別の列車になったので、始発駅もこの駅に更新する。
                    //   以前は最初に出区した駅のままだったため、
                    //   「草津発の列車が宝塚線を走っている」ように見え、
                    //   車両の適合判定も間違った線区で行われていた。
                    this.startName = stName || this.startName;
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
                /* ★遅れの引き継ぎ。
                   以前は折り返すたびに遅れを0に戻していたため、輸送障害で
                   大きく遅れた列車も、折り返した瞬間に定時に戻っていた。
                   実際には折り返し時間の余裕(3分程度)しか回復できないので、
                   その分だけ差し引いて残りを持ち越す。
                   これで障害の影響がダイヤ全体へ自然に波及する。 */
                this.carryOverDelay(180);
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
        // 輸送障害 (js/26-incidents.js) が付いている場合は、復旧作業の段階を
        // あちらが書き込んでいるので上書きしない。
        if (!this.troubleInfo.incidentId) {
            if (rem > 15) this.troubleInfo.status = "係員手配中";
            else if (rem > 5) this.troubleInfo.status = "現場確認中";
            else this.troubleInfo.status = "点検終了・再開準備";
        }
        
        if (this.minorTroubleTimer <= 0) {
            // ジャッジ状態へ移行
            this.isJudging = true;
            this.judgeTimer = 60;
            this.game.ui.updateBanner(`【乗務員連絡】${this.troubleInfo.location}での ${this.trainNo} ${this.troubleInfo.cause}の現場対応が完了しました。営業を継続するか、回送に打ち切るか指示をお願いします。(1分後に自動再開)`, "banner-blue");
        } else {
            this.game.ui.updateBanner(`【${this.troubleInfo.cause}】${this.troubleInfo.location} ${this.trainNo} - ${this.troubleInfo.status} (再開見込:約${rem}分)`, "banner-orange");
        }
};

/**
 * 折り返しなどで遅れを引き継ぐ。
 * margin は「折り返しの余裕時分」で、そのぶんだけ回復できる。
 * 0 にはせず、残りを持ち越すことで遅れがダイヤ全体に波及する。
 */
/**
 * いまの編成のまま、その種別に変えられるか。
 * 運転整理で種別を上げ下げする前に必ず確かめる。
 * (207系を快速にする、網干の223系を湖西線の普通にする、といった
 *  規則違反を運転整理から起こさないための関門)
 */
Train.prototype.canChangeTypeTo = function (newType, atName) {
    const where = atName || this.startName;
    return this.game.fleet.canServe(this.vehicles, where, newType,
        this.trackId, this.dest, this.dutyName);
};

Train.prototype.carryOverDelay = function (margin) {
    const m = (margin === undefined) ? 180 : margin;
    this.delayTime = Math.max(0, this.delayTime - m);
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
        /* 1閉塞を走る基本時間。種別ごとの実際の表定速度から決める
           (js/01-config.js の BLOCK_RUN_SEC)。
           ★以前は「普通75秒・その他60秒」で、1駅あたり
             普通3.75分・新快速3.0分という実際の1.3〜1.7倍の遅さだった。
             遅いと列車が線路に長く居座るので、時刻表どおりの本数を出すと
             線路が埋まって団子運転になる。 */
        let baseTime = BLOCK_RUN_SEC[this.type] || BLOCK_RUN_SEC["普通"];

        // 高槻～京都間の内側線は駅間が短いので少し速い (実際のダイヤも同じ)
        const blks = this.game.trackMgr.blocks[this.trackId];
        if (blks && blks[this.currBlockIndex]) {
            const stIdx = blks[this.currBlockIndex].stationIdx;
            if (this.type === "普通" && (this.trackId === "Up_In" || this.trackId === "Down_In")) {
                if (stIdx >= STATION_MAP["高槻"] && stIdx <= STATION_MAP["京都"]) {
                    baseTime = Math.round(baseTime * 0.85);
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

        /* ★同じ種別が近くに続いているときの減速。

           団子 (3本が2駅以内に並ぶ) を防ぐには、後続を止めるよりも
           少しずつ遅らせて間隔を開けるほうが線区が詰まらない。
           実際の運転でも、続行がつまったときは信号の現示が落ちて
           自然に速度が下がり、間隔が回復する。
           直前の同種別との距離が「その種別の設計間隔」より近いほど
           時間を延ばす (最大1.8倍)。 */
        let convoySlowdown = 1.0;
        {
            const design = { "新快速": 3.5, "快速": 3.0, "普通": 2.0 }[this.type];
            if (design) {
                const near = nearestSameTypeAhead(this.game, this.trackId, this.currBlockIndex,
                                                  this.dir, this.type, design, this);
                if (near) {
                    const want = UNITS_PER_STATION * design;
                    const ratio = Math.max(0, 1 - near.dist / want);
                    convoySlowdown = 1.0 + ratio * 0.8;
                }
            }
        }

        // ★信号現示による減速 (js/25-signals.js)。
        //   注意・減速現示なら所要時間が延びる。
        //   もとの協調追従ロジックが出す減速率と比べて遅い方を採用するので、
        //   既存の動きが速くなってしまうことはない。
        let signalSlowdown = 1.0;
        if (this.game.signals) {
            this.signalAspect = this.game.signals.aspectAhead(this);
            signalSlowdown = SIGNAL_TIME_FACTOR[this.signalAspect] || 1.0;
        }

        // ★徐行 (輸送障害からの復旧後の速度規制)
        const restrictFactor = this.game.trackMgr.speedFactor(this.trackId, this.currBlockIndex);

        // 各減速係数のうち、いちばん大きい方（より遅くなる方）を適用する
        suspendSlowdown = Math.max(suspendSlowdown, troubleSlowdown, signalSlowdown,
                                   restrictFactor, convoySlowdown);
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
