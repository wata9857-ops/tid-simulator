/* このファイルは index.html から分割されたものです。
   Train: 進行(ブロック移動)と停車判定 */

/**
 * 線区の端 (前方が線路の無いプレースホルダ) に着いたときの終点扱い。
 *
 * ★以前は move() の中に書いてあり、しかも
 *     if (this.state !== "stopped") { … }
 *   という条件が付いていた。状態が "holding" のあいだ move() は
 *   呼ばれないので、いちど抑止に入った列車は二度と終点扱いにならず、
 *   放出・新三田のような線区の端に溜まり続けていた。
 *   そこが詰まると線区いっぱいに列車が連なり、尼崎で着発線を共有している
 *   本線の下りまで止まっていた (乱数の種による詰まりの崩壊の主因)。
 *
 * 戻り値: 終点扱いにしたら true
 */
Train.prototype.endOfLineStop = function () {
    if (this.isFinalStop) return false;      // すでに終点扱い
    const blks = this.game.trackMgr.blocks[this.trackId];
    const here = blks ? blks[this.currBlockIndex] : null;
    const endName = blockStationName(here);
    this.turnbackTrack = null;
    this.state = "stopped";
    this.hasStoppedAtCurrent = true;
    this.isFinalStop = true;
    this.timer = 30;
    this.stuckTime = 0;
    this.dest = endName || this.dest;
    if (!this.nextAction || this.nextAction === "turnback") this.nextAction = "depot";
    return true;
};
Train.prototype.move = function () {
        const blks = this.game.trackMgr.blocks[this.trackId];
        const nextIdx = this.currBlockIndex + this.dir;
        if (nextIdx < 0 || nextIdx >= blks.length) { this.remove(); return; }

        /* ★折り返した直後は、到着した番線 (反対方向の線路) に留まっている。
           前方は「発車で入る線路」で見る。自分の線路で見ると、
           複々線・分岐線の端では線路の無い区間を指してしまう。 */
        const aheadBlks = (this.turnbackTrack && this.game.trackMgr.blocks[this.turnbackTrack])
            ? this.game.trackMgr.blocks[this.turnbackTrack] : blks;

        let nextBlock = aheadBlks[nextIdx];
        if (!nextBlock) { this.remove(); return; }

        /* ★線路の無い区間 (x === -1000 のプレースホルダ) へは進ませない。
           湖西線・JR宝塚線・JR東西線・北方貨物線は本線とインデックスを
           共有していて、線区の外はプレースホルダになっている。
           以前はここを素通りできてしまい、線路の無い場所を走り続ける
           列車が生まれていた。線区の端に着いたら、そこで運転を打ち切る。 */
        if (nextBlock.x === -1000) {
            this.endOfLineStop();
            return;
        }
        let targetTrackId = this.trackId;
        const currentBlock = blks[this.currBlockIndex]; // ★追加

// 尼崎駅への直接進入判定（目標路線の決定）
        if (nextBlock && nextBlock.stationIdx === STATION_MAP["尼崎"]) {
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

        /* ★尼崎を「発車するとき」の分岐。
           上の判定は尼崎へ「進入するとき」だけを見ていたため、
           尼崎で折り返したり、尼崎始発になったりした列車が
           分岐線へ入れず、本線を走り続けてしまっていた。 */
        if (currentBlock && currentBlock.stationIdx === STATION_MAP["尼崎"]) {
            if (this.dir === 1 && this.trackId.indexOf("Tozai") !== 0 &&
                TOZAI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Tozai_Up";
            } else if (this.dir === -1 && this.trackId.indexOf("Fukuchi") !== 0 &&
                FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Fukuchi_Down";
            }
        }

        /* ------------------------------------------------ 複々線の端での内外の振り分け

           西明石・草津は複々線 (内側線＋外側線) と複線の境目なので、
           ここで内側線・外側線のどちらに入るかが決まる。
           どちら側を走るかは js/24-service-rules.js の
           serviceTrackSide() が1か所で決める。

           ★以前はここに「快速は 7:24〜8:36 の上りだけ外側線」
             「新快速は朝ラッシュ以外は内側線」という独自の条件が
             書かれていて、いまのJR西日本の規則と食い違っていた。
               新快速 … 該当区間を通して外側線
               快速   … 平日朝の 高槻→大阪 だけ外側線、ほかは内側線 */
        const fourTrackEdge = (idx) => idx === STATION_MAP["西明石"] || idx === STATION_MAP["草津"];

        if (nextBlock && fourTrackEdge(nextBlock.stationIdx) &&
            innerTrackExists(nextBlock.stationIdx) && this.trackId.includes("Out")) {
            // 複々線へ入る向き (西明石は上り / 草津は下り) のときだけ内側線を選ぶ
            const entering = (nextBlock.stationIdx === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
            if (entering && this.wantTrackAt(nextBlock.stationIdx).includes("In")) {
                const inTrackId = this.trackId.replace("Out", "In");
                const tBlks = this.game.trackMgr.blocks[inTrackId];
                if (tBlks) {
                    const targetNextBlk = tBlks.find(b => b.stationIdx === nextBlock.stationIdx);
                    if (targetNextBlk && this.findFreeLane(targetNextBlk) !== -1) {
                        targetTrackId = inTrackId;
                    }
                }
            }
        }

        if (currentBlock && fourTrackEdge(currentBlock.stationIdx)) {
            const here = currentBlock.stationIdx;
            const entering = (here === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
            if (entering && this.trackId.includes("Out") && this.wantTrackAt(here).includes("In")) {
                targetTrackId = this.trackId.replace("Out", "In");
            } else if (!entering && this.trackId.includes("In") &&
                       blockStationName(currentBlock) !== this.dest) {
                // 複々線から複線へ出るので、必ず外側線 (内側線はそこで終わる)
                targetTrackId = this.trackId.replace("In", "Out");
            }
        }

        /* ★折り返す列車は、到着のときから折り返し用の着発線に入れる。
           こうしないと、折り返すたびに番線が変わってしまう。
           詳しくは js/11-train-core.js の「折り返しと番線」を参照。 */
        /* ★折り返した列車は、発車のときに反対方向の線路へ移る。
           到着した番線のまま向きだけ変えてあるので (executeTurnBack)、
           最初の1ブロックを進むときに駅の渡り線を通って本来の線路に入る。
           これで「到着番線 → 折り返し → 同じ番線から発車」になる。 */
        if (this.turnbackTrack && this.turnbackTrack !== this.trackId) {
            targetTrackId = this.turnbackTrack;
        }

        let targetLane = -1;
        let actualNextBlock = nextBlock;
        // 転線が発生する場合のブロックと空きレーンの取得
        if (targetTrackId !== this.trackId) {
            let tBlks = this.game.trackMgr.blocks[targetTrackId];
            if (tBlks) {
                // ★修正: 尼崎固定のハードコーディングを廃止し、実際の進入先駅ブロックまたは同一座標で転線先を動的に決定
                let targetNextBlk = tBlks.find(b => (nextBlock.stationIdx !== undefined && b.stationIdx === nextBlock.stationIdx) || Math.abs(b.x - nextBlock.x) < 20);
                if (targetNextBlk) {
                    // 入ってくる線路と出ていく線路の両方につながる番線を選ぶ
                    targetLane = this.findFreeLane(targetNextBlk, targetTrackId);
                    actualNextBlock = targetNextBlk;
                }
            }
        } else {
            // 通常移動の場合
            targetLane = this.findFreeLane(nextBlock);
            actualNextBlock = nextBlock;
        }

        // 移動の確定（ブロックとレーンが確実に確保できた場合のみ実行）
        if (targetLane !== -1) {
            blks[this.currBlockIndex].lanes[this.lane] = null;
            // 折り返し後の転線が済んだので、印を消す
            if (this.turnbackTrack && targetTrackId === this.turnbackTrack) this.turnbackTrack = null;
            this.trackId = targetTrackId;
            this.currBlockIndex = actualNextBlock.index;
            this.lane = targetLane;
            actualNextBlock.lanes[this.lane] = this;
            nextBlock = actualNextBlock; // 以降の処理（停車判定など）を新しいブロックで行うために上書き
        } else {
            // 満線の場合や転線先が見つからない場合は移動せずに手前で待機
            this.state = "holding";
            this.timer = 15;
            return; 
        }

        if (nextBlock.isStation || nextBlock.hoppoStationName) {
            let st = (nextBlock.hoppoStationName) ? {name: nextBlock.hoppoStationName, stopTime:60} : STATIONS[nextBlock.stationIdx];
            if (!st) st = {name: "Unknown", stopTime: 60, type: 0};

            /* ★宮原操は北方貨物線の上にしか駅ブロックが無いが、
               旅客車の出入区は本線 (新大阪の位置) からつながっている。
               本線を走る宮原操行きは、新大阪の位置で到着扱いにする。
               これをしないと、宮原操行きの回送が新大阪を通り越して
               いつまでも終点に着けなかった。 */
            if (this.dest === "宮原操" && st.name === "新大阪" &&
                this.trackId.indexOf("Hoppo") < 0) {
                st = { name: "宮原操", stopTime: 60, type: 0 };
            }
            // 吹田貨物ターミナルも同じく、本線側では吹田の位置で到着扱いにする
            if (this.dest === "吹田貨" && st.name === "吹田" &&
                this.trackId.indexOf("Hoppo") < 0) {
                st = { name: "吹田貨", stopTime: 60, type: 0 };
            }
            
            // ★混雑状況に応じた行先変更(間引き・延長)判定
            this.checkCongestionAndAdjust(st.name);

            if (this.plannedStop && st.name === this.plannedStop) {
                this.isManuallySuspended = true;
                this.manualSuspendTimer = 0;
                this.hasNotifiedSuspendLong = false;
                this.plannedStop = null;
                this.state = "stopped"; this.timer = 15; return;
            }
            
            if (this.serviceChange && this.serviceChange.at === st.name) {
                this.state = "stopped";
                this.timer = st.stopTime || 60;
                this.nextAction = "turnback"; this.hasStoppedAtCurrent = true; return;
            }

            if (this.trainNo.includes("はまかぜ") && this.dir === -1 && st.name === "姫路") { 
                this.state="stopped";
                this.timer=60; this.nextAction="depot"; 
                this.isFinalStop = true; 
                return;
            }
            if (this.trainNo.includes("こうのとり") && this.dir === -1 && st.name === "尼崎") { 
                this.state="stopped";
                this.timer=60; this.nextAction="depot"; 
                this.isFinalStop = true; 
                return;
            }
            if (st.name === "姫路" && ["網干", "播州赤穂", "上郡"].includes(this.dest)) {
                this.state = "stopped";
                this.timer = 60; // 客扱いのため60秒停車
                this.nextAction = "depot";
                this.isFinalStop = true; 
                this.hasStoppedAtCurrent = true;
                return;
            }
            
            // マップ外の駅へ向かう列車の終点処理（新三田以北・京橋以東・塚口止まり）
            if (st.name === "新三田" && ["篠山口", "福知山", "豊岡", "城崎温泉"].includes(this.dest) && this.dir === -1) {
                this.state = "stopped";
                this.timer = 60; this.nextAction = "depot"; this.isFinalStop = true; this.hasStoppedAtCurrent = true; return;
            }
            // 学研都市線の放出以東 (松井山手・四条畷など) へ向かう列車は、
            // 描画範囲の東端である放出まで走らせてから運転を打ち切る。
            // ★以前は京橋で打ち切っていたが、実際には京橋から放出まで走るため
            //   放出まで延ばした (JR東西線の放出延伸)。
            if (st.name === "放出" && (KATAMACHI_BEYOND.includes(this.dest) || this.dest === "放出") && this.dir === 1) {
                this.state = "stopped";
                this.timer = 60; this.nextAction = "depot"; this.isFinalStop = true; this.hasStoppedAtCurrent = true; return;
            }
            if (st.name === "塚口" && this.dest === "塚口") {
                this.state = "stopped";
                this.timer = 60; this.nextAction = "depot"; this.isFinalStop = true; this.hasStoppedAtCurrent = true; return;
            }

            // 貨物列車の特定行き先における吹田貨での途中消滅
            if (this.type === "貨物" && (st.name === "吹田貨" || st.name === "吹田") && ["大阪タ", "吹田タ", "百済タ", "安治川タ"].includes(this.dest)) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 15;
                this.nextAction = "remove";
                return;
            }
            // 湖西線上り貨物の敦賀での消滅
            if (this.type === "貨物" && st.name === "敦賀" && this.dest === "富山タ") {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 15;
                this.nextAction = "remove";
                return;
            }
            // 貨物上り列車の米原での消滅
            if (this.type === "貨物" && st.name === "米原" && ["東京タ", "名古屋タ"].includes(this.dest) && this.dir === 1) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 15;
                this.nextAction = "remove";
                return;
            }

            if (st.name === this.dest) {
                if (this.type === "貨物" || this.type === "回送") {
                    if (!this.nextAction || this.nextAction === "turnback") this.nextAction = "remove";
                }
                
                // ★修正: 駅進入直後に消滅・ワープせず、一旦ホームに停車させる
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = (this.type === "貨物" || this.type === "回送") ? 15 : 60; // 営業列車は客扱いの時間として60秒停車
            } else if (!this.hasStoppedAtCurrent && this.shouldStop(st)) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                if (["貨物","臨時"].includes(this.type)) {
                    this.timer = (st.name==="吹田貨")?780:(["姫路","神戸","京都","ひめじ別所","鷹取","西大路"].includes(st.name)?420:300);
                } else this.timer = st.stopTime;

                // 快速列車の場合、降格チェックを実行
                if (this.type === "快速") {
                    this.checkRapidDowngrade(st.name);
                }
                
                // 普通列車の場合、間引き(行先変更)チェックを実行
                if (this.type === "普通") {
                    this.checkLocalThinning(st.name);
                }
            } else {
                this.state = "running";
                this.timer = this.calcTravelTime();
            }
        } else {
            this.state = "running";
            this.timer = this.calcTravelTime();
        }
};

Train.prototype.shouldStop = function (st) {
        if (!st || !st.name) return false;

        // ★追加: 湖西線の駅間調整用ダミーブロック（駅が存在しない区間）は無条件で通過とする
        if (st.name === "湖西線通過") return false;

        let realSt = (STATION_MAP[st.name] !== undefined) ? STATIONS[STATION_MAP[st.name]] : st;
        let isFreight = realSt.isFreightTerm === true;
        if (this.serviceChange && this.serviceChange.at === st.name) return true;
        
        if (st.name === "吹田貨" && !["貨物", "臨時"].includes(this.type)) return false;
        if (st.name === "宮原操") return false;

        // ★湖西線の特例（サンダーバード等は通過、新快速・快速は一部停車）
        const koseiRapidsStop = ["大津京", "比叡山坂本", "おごと温泉", "堅田", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        const koseiSpecialRapidsStop = ["大津京", "比叡山坂本", "堅田", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        if (this.trackId.includes("Kosei")) {
            if (["貨物", "回送", "臨時"].includes(this.type)) return false;
            
            // ★追加: 特急サンダーバードの停車ロジック
            if (this.type === "特急") {
                if (this.trainNo && this.trainNo.includes("サンダーバード")) return false; // サンダーバードは湖西線内全通過
                let timeH = (this.game.currentTime / 3600) % 24;
                let isRush = (timeH >= 6.0 && timeH < 9.5) || (timeH >= 17.0 && timeH < 21.0);
                if (isRush && ["堅田", "近江今津"].includes(st.name)) return true;
                return false;
            }

            if (this.type === "普通") return true;
            if (this.type === "快速" && koseiRapidsStop.includes(st.name)) return true;
            if (this.type === "新快速" && koseiSpecialRapidsStop.includes(st.name)) return true;
            return false;
        }

        if (this.trackId.includes("Fukuchi") || this.trackId.includes("Tozai")) {
            if (["貨物", "回送", "臨時"].includes(this.type)) return false;
            if (this.type === "特急") return ["宝塚", "三田"].includes(st.name);
            if (this.type === "快速" && this.trackId.includes("Fukuchi")) {
                const fukuchiRapidStops = ["尼崎", "塚口", "伊丹", "川西池田", "中山寺", "宝塚", "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田"];
                return fukuchiRapidStops.includes(st.name);
            }
            if (this.type === "快速" && this.trackId.includes("Tozai")) return true;
            if (this.type === "普通") return true;
            return false;
        }

        if (st.name === "向日町操" && !["回送", "貨物", "臨時"].includes(this.type) && this.dest !== "向日町操") return false;

        if (this.type === "普通") {
            if (["宮原操", "向日町操", "吹田貨"].includes(st.name)) return false;
            if (isFreight && st.name !== "ひめじ別所") return false;
            return true;
        }
        
        if (["貨物", "臨時"].includes(this.type)) {
            if (st.name === "ひめじ別所" && this.skipHimejiFreight) return false;
            if (st.name === "西大路" && this.skipKyotoFreight) return false;
            return (["ひめじ別所", "鷹取", "吹田貨", "西大路"].includes(st.name) || isFreight) ? true : false;
        }

        const stType = (realSt.type !== undefined) ? realSt.type : 0;
        
        if (this.type === "快速") {
            const stIdx = STATION_MAP[st.name];
            if (stIdx >= 0 && stIdx <= 11) return true;
            if (stIdx >= 47) return true;
            if (isFreight) return false;
            return (stType >= 1);
        }

        if (isFreight) return false;
        if (this.type === "新快速") {
            if (["姫路", "加古川", "西明石", "明石", "神戸", "三ノ宮", "芦屋", "尼崎", "大阪", "新大阪", "高槻", "京都"].includes(st.name)) return true;
            return (stType >= 2);
        }
        
        if (this.type === "特急") {
            return ["姫路", "明石", "三ノ宮", "大阪", "新大阪", "京都", "敦賀"].includes(st.name);
        }
        return false;
};
