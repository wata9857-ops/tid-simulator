/* このファイルは index.html から分割されたものです。
   GameSystem (メインループ・異常事象) と起動処理 */
/**
 * ==================================================
 * 7. GameSystem (メインシステム - 時間停止修正)
 * ==================================================
 */
class GameSystem {
    constructor() {
        this.currentTime = 4.0 * 3600;
        this.isEmergency = false;
        this.radioTimer = 0;
        this.emergencyState = { type: "none", timer: 0 };
        // 人身事故・沿線異常の発生間隔を延長 (約5〜9時間に1回)
        this.nextEmergencyTime = this.currentTime + (Math.random() * 14400 + 18000);
        // 車両点検・踏切異常などの発生間隔を延長 (約1〜2.5時間に1回)
        this.nextMinorTroubleTime = this.currentTime + (Math.random() * 5400 + 3600);

        this.trackMgr = new TrackManager();
        this.trains = [];
        this.fleet = new FleetManager(this);   // 編成(車両)の在庫と運用規則
        this.spawner = new Spawner(this);
        this.ui = new UIManager(this);
        this.renderer = null;

        this.lastTime = 0;
        this.scrollContainer = null;
        this._lastScroll = -1;
        this._lastBlink = -1;
    }

    /**
     * 起動時の編成配置。
     * 実際の選定規則・配置先は FleetManager (js/06-fleet.js) が持つ。
     * 留置される編成の編成番号は毎回シャッフルされるため、起動ごとに変わる。
     */
    initVehicles() {
        this.fleet.init();
    }

    init() {
        this.renderer = new Renderer(this);
        this.scrollContainer = document.getElementById("scroll-container");
        this.initUI();
        this.initVehicles();
        
        // ★修正: 指定した留置場にのみ回送表示の予備車を配置
        for (let stName in DEPOTS) {
            let reserveCount = 0;
            if (stName === "野洲") {
                reserveCount = 2;
            } else if (stName === "宮原操" || stName === "向日町操") {
                reserveCount = 3;
            }

            if (reserveCount > 0) {
                for (let i = 0; i < reserveCount; i++) {
                    let assigned = this.spawner.assignVehicles(stName, "回送", "Up_In", "京都");
                    if (!assigned) continue;
                    let t = new Train({ type: "回送", dir: 1, trackId: "Up_In", startName: stName, name: "予備", vehicles: assigned }, this);
                    t.state = "in_depot";
                    t.timer = -1; // -1は待機状態(出区予定なし)
                    t.startName = stName;
                    t.depotOutConfig = null;
                    t.trainNo = "";
                    
                    // 初期化で本線に置かれた場合を想定して消去
                    let blks = this.trackMgr.blocks[t.trackId];
                    if (blks && blks[t.currBlockIndex] && blks[t.currBlockIndex].lanes[t.lane] === t) {
                        blks[t.currBlockIndex].lanes[t.lane] = null;
                    }
                    
                    depotAdd(stName, t);
                    this.trains.push(t); // ★追加: 予備車もメインの列車管理配列に登録し、指令パッドから認識可能にする
                }
            }
        }

        // 初回タイムスタンプを0と見なしてループ開始
        requestAnimationFrame((ts) => { this.lastTime = ts; this.loop(ts); });
        document.getElementById("loading-msg").style.display = "none";
        document.getElementById("scroll-container").scrollLeft = 100 + (38 * UNITS_PER_STATION) * BLOCK_WIDTH - window.innerWidth/2;
    }

    initUI() {
        const mkOpt = (s) => `<option value="${s}">${s}</option>`;
        const stOpts = STATIONS.map(s => mkOpt(s.name)).join("");
        document.getElementById("cmd-stop-at").innerHTML += stOpts;
        document.getElementById("sus-start").innerHTML += stOpts;
        document.getElementById("sus-end").innerHTML += stOpts;
        document.getElementById("cmd-chg-station").innerHTML += stOpts;
    }

    addTrain(config) {
        let actualStart = config.startName;
        if (["松井山手", "四条畷"].includes(actualStart)) actualStart = "尼崎";
        else if (["網干", "播州赤穂", "上郡"].includes(actualStart)) actualStart = "姫路";

        // 車両選定に使う運用名 (送り込み回送などで列車番号と運用が食い違う場合の対策)
        const dutyName = config.dutyName ||
            (config.serviceChange && config.serviceChange.type === "特急" && config.serviceChange.name
                ? config.serviceChange.name : config.name);

        // 特急・特急の送り込み回送は留置場の予備車では代替できない (専用編成のため)
        const needsOwnStock = (config.type === "特急") ||
            (typeof expressKeyFromName === "function" && !!expressKeyFromName(dutyName));

        if (config.type !== "貨物" && !needsOwnStock && DEPOTS[actualStart]) {
            let depot = DEPOTS[actualStart];
            let reserveTrain = depot.trains.find(t => !t.depotOutConfig && t.timer === -1);
            if (reserveTrain) {
                // ★修正: 予備車は「回送」として編成を割り当てられているため、ここで
                //        種別を書き換えるとその種別の運用条件を満たさない編成が
                //        本線に出てしまっていた (新快速が4両になる等)。
                //        新しい種別・行先で条件を満たすか確認し、駄目なら差し替える。
                let assigned = this.fleet.reassign(actualStart, config.type, config.trackId,
                    config.dest, dutyName, reserveTrain.vehicles);
                if (!assigned || assigned.length === 0) return false;
                reserveTrain.vehicles = assigned;

                reserveTrain.type = config.type;
                reserveTrain.dest = config.dest || this.spawner.getDestination(config.type, config.dir, config.startName);
                reserveTrain.dir = config.dir;
                reserveTrain.trackId = config.trackId;
                reserveTrain.startName = config.startName;
                reserveTrain.trainNo = config.name || this.spawner.generateTrainNumber(config.type, config.dir, config.startName, config.trackId);
                reserveTrain.nextAction = config.nextAction || "turnback";
                
                reserveTrain.depotOutConfig = { type: reserveTrain.type, dest: reserveTrain.dest, trainNo: reserveTrain.trainNo, dir: reserveTrain.dir };
                
                let maxTimer = 0;
                depot.trains.forEach(t => {
                    if (t !== reserveTrain && t.timer > maxTimer) maxTimer = t.timer;
                });
                reserveTrain.timer = Math.max(300 + Math.random() * 180, maxTimer + 180);
                
                return true; 
            }
        }
        
        if (!config.vehicles) {
            // 第5引数は「運用名」。送り込み回送のように列車番号と運用が違う場合でも
            // 正しい車両 (はるか=281系 など) を選べるようにする。
            let assigned = this.spawner.assignVehicles(config.startName, config.type, config.trackId, config.dest, dutyName);
            if (!assigned || assigned.length === 0) return false;
            config.vehicles = assigned;
        }

        const t = new Train(config, this);
        if (t.state !== "finished") { this.trains.push(t); return true; }
        
        // 生成失敗時は車両を留置場に戻す
        this.fleet.release(config.startName, config.vehicles);
        return false;
    }
    getTrain(id) { return this.trains.find(t => t.id === id); }

    loop(timestamp) {
        // エラーが発生してもループを止めない
        try {
            const deltaTime = timestamp - this.lastTime;
            let needDraw = false;
            // 1秒以上経過していたらロジック更新
            if (deltaTime >= 1000) {
                this.lastTime = timestamp; // ★エラー時の時間暴走を防ぐため、update前に更新
                this.update();
                needDraw = true;                       // 状態が進んだので再描画
            }
            // スクロール位置が変わった時のみ再描画(可視領域クリッピングの対象が変わるため)
            const scrollL = this.scrollContainer ? this.scrollContainer.scrollLeft : 0;
            if (scrollL !== this._lastScroll) { this._lastScroll = scrollL; needDraw = true; }
            // 抑止/防護無線の点滅は500ms周期。位相が変わった時だけ再描画すれば十分。
            const blink = Math.floor(timestamp / 500) % 2;
            if (blink !== this._lastBlink) { this._lastBlink = blink; needDraw = true; }

            // 毎フレーム(約60fps)の全面再描画をやめ、変化があった時だけ描画する
            if (needDraw) this.renderer.draw();
        } catch (e) {
            console.error("Game Loop Error:", e);
        }
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update() {
        this.currentTime += CONFIG.TICK_SEC;
        // ★追加: 消滅済み・出区済みの列車を留置場の在線リストから掃除する
        depotPrune();
        this.checkEmergency();
        this.checkMinorTrouble();
        this.spawner.update(this.currentTime);
        this.trains = this.trains.filter(t => t.state !== "finished");
        this.trains.sort((a,b)=>PRIORITY[b.type]-PRIORITY[a.type]);
        this.trains.forEach(t => t.update());
        
        this.ui.updateClock(this.currentTime);
        
        // ★毎分業務連絡を更新
        if (this.currentTime % 60 === 0) {
            this.ui.updateStaffLog(this);
        }
        
        // ★追加: 電光掲示板が開いている場合、シミュレーター時刻の1分(60秒)ごとに表示を自動更新する
        if (this.ui.currentBoardStation && this.currentTime % 60 === 0) {
            this.ui.showDepartureBoard(this.ui.currentBoardStation);
        }
    }

    checkEmergency() {
        // 防護無線の自動解除処理
        if(this.isEmergency) {
            this.radioTimer -= CONFIG.TICK_SEC;
            if (this.radioTimer <= 0) {
                this.isEmergency = false;
                document.getElementById("emg-control").style.display = "none";
                document.getElementById("emergency-banner").style.display = "none";
                this.ui.updateBanner(`【防護無線解除】周辺の安全が確認されたため、当該区間以外は運転を再開します。`, "banner-orange");
            }
        }
        
        // トラブル区間の復旧タイマー処理
        if (this.emergencyState.timer > 0) {
            this.emergencyState.timer -= CONFIG.TICK_SEC;
            const rem = Math.ceil(this.emergencyState.timer / 60);
            if (this.emergencyState.type === "human") {
                // 1200秒(20分)をベースにタイムライン進行
                let elapsed = 1200 - this.emergencyState.timer;
                let msg = "";
                let source = "🚨[警察・消防]";
                if (elapsed < 300) {
                    msg = "警察・消防手配中。現場への到着を待っています。";
                    source = "🚉[駅係員]";
                } else if (elapsed < 600) {
                    msg = "警察・消防が到着し、救護活動および現場検証を開始しました。";
                } else if (elapsed < 900) {
                    msg = "救護活動完了。引き続き警察による実況見分および車両の床下点検中です。";
                    source = "🚧[保線区]";
                } else {
                    msg = "現場検証終了。現在、運転再開に向けた最終安全確認を行っています。";
                    source = "🚉[駅係員]";
                }
                
                if (this.emergencyState.timer <= 0) {
                    this.ui.updateBanner(`🟢[指令] ${this.emergencyState.location}での人身事故の安全確認が全て完了しました。当該区間の運転を順次再開してください。`, "banner-red");
                    this.trackMgr.manualSuspensions = [];
                } else {
                    this.ui.updateBanner(`${source} ${this.emergencyState.location} 人身事故 - ${msg} (再開見込:${rem}分)`, "banner-red");
                }
            } else {
                if (this.emergencyState.timer <= 0) {
                    this.ui.updateBanner(`🟢[指令] ${this.emergencyState.location}付近の安全確認が完了しました。運転を再開してください。`, "banner-red");
                    this.trackMgr.manualSuspensions = [];
                } else {
                    this.ui.updateBanner(`🚧[保線区] ${this.emergencyState.location}付近 - 沿線異常検知、安全確認中 (再開見込:約${rem}分)`, "banner-red");
                }
            }
        } else if (!this.isEmergency && this.currentTime > this.nextEmergencyTime) {
            this.triggerEmergency();
        }
    }
    triggerEmergency() {
        this.isEmergency = true;
        this.radioTimer = 180; // 3分で防護無線(一斉停止)は自動解除
        document.getElementById("emg-control").style.display = "block";
        const st = STATIONS[Math.floor(Math.random() * STATIONS.length)].name;
        const stIdx = STATION_MAP[st];

        // 1. 運転見合わせ区間の算出（最低5駅程度確保、主要駅・待避駅間）
        const MAJOR_STATIONS = [...new Set([...SWITCHABLE_STATIONS, ...OVERTAKE_STATIONS])];
        let sIdx = stIdx;
        let eIdx = stIdx;

        // 上り方面（インデックス減少方向）へ主要駅を探索（最低3駅分以上）
        for (let i = stIdx - 3; i >= 0; i--) {
            if (MAJOR_STATIONS.includes(STATIONS[i].name)) {
                sIdx = i;
                break;
            }
        }
        if (sIdx === stIdx) sIdx = 0; // 見つからなかった場合は端点まで

        // 下り方面（インデックス増加方向）へ主要駅を探索（最低3駅分以上）
        for (let i = stIdx + 3; i < STATIONS.length; i++) {
            if (MAJOR_STATIONS.includes(STATIONS[i].name)) {
                eIdx = i;
                break;
            }
        }
        if (eIdx === stIdx) eIdx = STATIONS.length - 1; // 見つからなかった場合は端点まで

        // 1文字駅の場合は左右に全角スペースを挿入するフォーマット
        const sNameText = STATIONS[sIdx].name.length === 1 ? ` ${STATIONS[sIdx].name} ` : STATIONS[sIdx].name;
        const eNameText = STATIONS[eIdx].name.length === 1 ? ` ${STATIONS[eIdx].name} ` : STATIONS[eIdx].name;
        
        // バナーに「⇄」を用いて見合わせ区間を表示
        if (Math.random() < 0.3) {
            this.emergencyState = { type: "human", timer: 1200, location: st };
            this.ui.updateBanner(`🚨[緊急] ${st}にて人身事故発生。直ちに停車してください。（見合わせ：${sNameText}⇄${eNameText}）`, "banner-red");
        } else {
            this.emergencyState = { type: "vehicle", timer: 300+Math.random()*1500, location: st };
            this.ui.updateBanner(`🚧[保線区] ${st}付近でインフラ異常検知。停車してください。（見合わせ：${sNameText}⇄${eNameText}）`, "banner-red");
        }

        // 2. ズレの解消：駅インデックスではなく、各路線の「実際のブロックインデックス」を取得して抑止設定
        const targetTracks = ["Up_In", "Up_Out", "Down_In", "Down_Out", "Kosei_Up", "Kosei_Down", "Fukuchi_Up", "Fukuchi_Down", "Tozai_Up", "Tozai_Down"];
        targetTracks.forEach(tid => {
            let blks = this.trackMgr.blocks[tid];
            if (!blks) return;
            
            // 対象路線のブロック配列内から指定駅のブロックを検索
            let sBlock = blks.find(b => b.stationIdx === sIdx);
            let eBlock = blks.find(b => b.stationIdx === eIdx);
            
            if (sBlock && eBlock) {
                // ★修正: 両端の駅ブロックを見合わせ区間から除外し、駅への進入および折り返しを可能にする
                let minIdx = Math.min(sBlock.index, eBlock.index) + 1;
                let maxIdx = Math.max(sBlock.index, eBlock.index) - 1;
                if (minIdx <= maxIdx) {
                    this.trackMgr.manualSuspensions.push({
                        trackId: tid,
                        start: minIdx,
                        end: maxIdx
                    });
                }
            }
        });

        // 固定時間からランダムな長めのインターバルへ変更
        this.nextEmergencyTime = this.currentTime + (Math.random() * 14400 + 18000);
    }
    checkMinorTrouble() {
        if (this.currentTime > this.nextMinorTroubleTime) {
            const run = this.trains.filter(t => t.state === "running");
            if (run.length) run[Math.floor(Math.random()*run.length)].triggerMinorTrouble();
            // 固定時間からランダムな長めのインターバルへ変更
            this.nextMinorTroubleTime = this.currentTime + (Math.random() * 5400 + 3600);
        }
    }
    clearEmergency() {
        if (this.emergencyState.timer > 0 && !confirm("安全確認未了です。防護無線及び見合わせ区間を強制解除しますか？")) return;
        this.isEmergency = false;
        this.radioTimer = 0;
        this.emergencyState = { type: "none", timer: 0 };
        document.getElementById("emg-control").style.display = "none";
        document.getElementById("emergency-banner").style.display = "none";
        document.getElementById("info-banner").style.display = "none";
        this.trackMgr.manualSuspensions = [];
        this.trains.forEach(t => { t.isManuallySuspended = false; if(t.state==="holding"){t.state="running"; t.timer=15;} });
        alert("防護無線・見合わせ解除。全線運転再開。");
    }
}

// 起動処理
const game = new GameSystem();
window.onload = () => game.init();

window.onerror = function(msg) { console.error(msg); };
