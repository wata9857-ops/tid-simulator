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
        // 信号機と閉塞の管理 (js/25-signals.js)。
        // ブロックの在線から現示を組み立て、列車の発車・進入・速度を決める。
        this.signals = new SignalSystem(this);
        // 輸送障害 (js/26-incidents.js)。事故・故障を線路と信号の状態として起こす。
        this.incidents = new IncidentSystem(this);
        // 運用計画 (js/27-operations.js)。出区・送り込み・増発・復旧回送。
        this.ops = new OperationsManager(this);
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

        /* ★始発の裏付け (js/27-operations.js)。
           留置場の無い駅 (須磨・三ノ宮など) が始発の列車は、
           手前の車両所からの送り込み回送に置き換える。
           置き換えたときは、その回送が当駅で営業列車に変わるので
           ここでの生成は行わない。 */
        if (this.ops && this.ops.backOrigin(config)) return true;

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
                reserveTrain.dutyName = dutyName || reserveTrain.trainNo;
                reserveTrain.nextAction = config.nextAction || "turnback";
                
                reserveTrain.depotOutConfig = { type: reserveTrain.type, dest: reserveTrain.dest,
                    trainNo: reserveTrain.trainNo, dir: reserveTrain.dir, dutyName: reserveTrain.dutyName };
                
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
        this.trackMgr.pruneSpeedRestrictions(this.currentTime);
        this.checkEmergency();
        this.incidents.update();          // 輸送障害の発生・進行・復旧
        this.spawner.update(this.currentTime);
        this.ops.update(this.currentTime); // 出区計画・間隔の穴埋め
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

    /**
     * 防護無線の自動解除だけをここで見る。
     * 事故・故障そのものの進行と復旧は IncidentSystem (js/26-incidents.js) が持つ。
     * 以前はこのメソッドが「区間の見合わせ・復旧・メッセージ」まで全部抱えていたため、
     * 事故の種類を増やすたびにここが膨らみ、実際の線路の状態とも噛み合わなくなっていた。
     */
    checkEmergency() {
        if (!this.isEmergency) return;
        this.radioTimer -= CONFIG.TICK_SEC;
        if (this.radioTimer <= 0) {
            this.isEmergency = false;
            const el = document.getElementById("emg-control");
            if (el) el.style.display = "none";
            const eb = document.getElementById("emergency-banner");
            if (eb) eb.style.display = "none";
            this.ui.updateBanner(
                "【防護無線解除】周辺の安全が確認されたため、当該区間以外は運転を再開します。" +
                "（当該区間は引き続き運転を見合わせます）", "banner-orange");
        }
    }

    /** 指令パッドなどから任意の輸送障害を起こす (検証・訓練用) */
    triggerEmergency(typeId) {
        return this.incidents.trigger(typeId || "jinshin");
    }

    /** 車両故障など、列車に付く輸送障害を1件起こす (検証・訓練用) */
    checkMinorTrouble() {
        if (this.currentTime > this.nextMinorTroubleTime) {
            this.incidents.trigger();
            this.nextMinorTroubleTime = this.currentTime + (Math.random() * 5400 + 3600);
        }
    }

    /**
     * 指令による防護無線・見合わせの全解除。
     * 起きている輸送障害もまとめて打ち切る (指令の判断による強制再開)。
     * 列車の位置や遅れには手を触れないので、溜まった遅れはそのまま残る。
     */
    clearEmergency() {
        const live = this.incidents.active.length;
        if (live > 0 && typeof confirm === "function" &&
            !confirm("安全確認未了です。防護無線及び見合わせ区間を強制解除しますか？")) return;
        this.isEmergency = false;
        this.radioTimer = 0;
        this.emergencyState = { type: "none", timer: 0 };
        this.incidents.clearAll("指令による強制解除");
        const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = "none"; };
        hide("emg-control"); hide("emergency-banner"); hide("info-banner");
        this.trackMgr.manualSuspensions = [];
        this.signals.clearFaults();
        this.trains.forEach(t => {
            t.isManuallySuspended = false;
            t.minorTrouble = false;
            t.troubleInfo = { active: false, cause: "", status: "" };
            if (t.state === "holding") { t.state = "running"; t.timer = 15; }
        });
        this.ui.updateBanner("【指令】防護無線・運転見合わせを全て解除しました。全線運転を再開します。", "banner-orange");
        if (typeof alert === "function") alert("防護無線・見合わせ解除。全線運転再開。");
    }
}

/* 起動処理は js/39-boot.js に移した。
   GameSystem がこのファイルより後に読み込む仕組み (信号・障害・出入区計画) を
   使うため、インスタンスの生成を最後のファイルまで遅らせている。 */
