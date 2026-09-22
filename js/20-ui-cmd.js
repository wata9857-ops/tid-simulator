/* このファイルは index.html から分割されたものです。
   UIManager: 指令パッド (列車設定変更・抑止・転線・出区) */
    // ★追加: ログの列車番号クリック時に指令パネルを即座に開く
UIManager.prototype.openCmdPanelForTrain = function (trainId) {
        const p = document.getElementById("cmd-panel");
        if (p.style.display !== "block") {
            p.style.display = "block";
        }
        this.updateTrainSelector();
        this.updateDepotSelector();
        this.fillSimSettings();
        
        const sel = document.getElementById("cmd-no");
        if (sel) {
            sel.value = trainId;
            this.updateCmdActionOptions();
        }
};

    // 指令パネル関連
UIManager.prototype.toggleCmdPanel = function () {
        const p = document.getElementById("cmd-panel");
        p.style.display = (p.style.display==="block") ? "none" : "block";
        if(p.style.display==="block") {
            this.updateTrainSelector();
            this.updateDepotSelector();
            this.fillSimSettings();
            this.updateCmdActionOptions();
            this.updateCmdDepotActionOptions();
        }
};

UIManager.prototype.updateCmdActionOptions = function () {
        let dest = document.getElementById("cmd-dest").value;
        const trainId = document.getElementById("cmd-no").value;
        const t = this.game.getTrain(trainId);
        if (t) {
            if (!dest) dest = t.dest;
            let notes = "情報なし";
            if (t.vehicles && t.vehicles.length > 0) {
                notes = t.vehicles.map(v => `[${v.fullId}] ${v.type} ${v.cars}両: ${v.notes || "特になし"}`).join("<br>");
            }
            let vPanel = document.getElementById("vehicle-notes");
            if (vPanel) vPanel.innerHTML = notes;
        }
        this.updateActionOptions("cmd-action", dest);
};

UIManager.prototype.updateCmdDepotActionOptions = function () {
        const dest = document.getElementById("cmd-depot-dest").value;
        this.updateActionOptions("cmd-depot-action", dest);
};

UIManager.prototype.updateActionOptions = function (selectId, destName) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = "";
        
        const hasDepot = !!DEPOTS[destName];
        
        const options = [
            { value: "turnback", text: "到着後通常折り返し", needsDepot: false }, // ★追加
            { value: "in_depot_leave", text: "入区後留置", needsDepot: true },
            { value: "in_depot_remove", text: "入区後消滅", needsDepot: true },
            { value: "remove", text: "入区せず消滅", needsDepot: false },
            { value: "stop_same_home", text: "到着後同ホームで抑止", needsDepot: false },
            { value: "stop_opposite_home", text: "到着後反対方面ホームで抑止", needsDepot: false }
        ];
        
        options.forEach(opt => {
            if (opt.needsDepot && !hasDepot) return;
            let el = document.createElement("option");
            el.value = opt.value;
            el.text = opt.text;
            sel.appendChild(el);
        });
        
        let exists = Array.from(sel.options).some(opt => opt.value === currentVal);
        if (exists && currentVal) {
            sel.value = currentVal;
        } else if (sel.options.length > 0) {
            sel.value = sel.options[0].value;
        }
};

UIManager.prototype.updateDepotSelector = function () {
        const sel = document.getElementById("cmd-depot-sel");
        if(!sel) return;
        const val = sel.value;
        sel.innerHTML = '<option value="">留置場を選択</option>';
        for(let stName in DEPOTS) {
            const dep = DEPOTS[stName];
            const count = dep.trains.length;
            let op = document.createElement("option");
            op.value = stName;
            op.text = `${dep.display} (留置: ${count}/${dep.capacity})`;
            sel.add(op);
        }
        sel.value = val;
        this.updateDepotTrains();
};

UIManager.prototype.updateDepotTrains = function () {
        const depotName = document.getElementById("cmd-depot-sel").value;
        const sel = document.getElementById("cmd-depot-train");
        if(!sel) return;
        sel.innerHTML = '<option value="">車両を選択</option>';
        if(!depotName || !DEPOTS[depotName]) return;
        
        DEPOTS[depotName].trains.forEach((t, i) => {
            let op = document.createElement("option");
            op.value = t.id;
            let name = t.trainNo || `予備車${i+1}`;
            // ★追加: 強制発車・出区指令の対象を選びやすくするため、編成番号と
            //        出区までの残り時間も出す。
            let veh = (t.vehicles && t.vehicles.length)
                ? ` ${t.vehicles.map(v => v.fullId).join("+")}(${t.vehicles.reduce((s, v) => s + v.cars, 0)}両)`
                : " (編成未定)";
            let wait = (t.timer > 0) ? ` 出区まで${Math.ceil(t.timer / 60)}分`
                     : (t.timer === -1 ? " 待機中" : " 出区準備");
            op.text = `[${i+1}] ${name}${veh}${wait}`;
            sel.add(op);
        });
};

UIManager.prototype.updateTrainSelector = function () {
        const sel = document.getElementById("cmd-no");
        const val = sel.value; sel.innerHTML = '<option value="">列車を選択してください</option>';
        this.game.trains.filter(t=>t.state!=="finished").sort((a,b)=> (a.trainNo || "ZZZ").localeCompare(b.trainNo || "ZZZ")).forEach(t=>{
            let vehStr = (t.vehicles && t.vehicles.length > 0) ? `(${t.vehicles.map(v=>v.fullId).join("+")}編成) ` : "";
            let name = `${t.trainNo || `(待機) ${t.startName}`} ${vehStr}`;
            let st = t.isManuallySuspended?"(抑止)":t.state==="holding"?"(黄)":t.isDecelerating?"(減速)":t.state==="in_depot"?"(留置)":"";
            let op = document.createElement("option"); op.value=t.id; op.text=`${name} [${t.type}] ${t.dest||""} ${st}`; sel.add(op);
        });
        sel.value = val;
};

/* ------------------------------------------------------------------ 時間の倍率

   シミュレーション時間の進み方を選ぶ。既定は 1.0倍 (これまでの速さ)。
   変わるのは「1Tick進めるのに待つ実時間」だけで、1Tickの中身
   (CONFIG.TICK_SEC = 15秒) には触らないので、列車の走行・時刻表・
   信号・運転整理の判定はまったく変わらない。 */
UIManager.prototype.fillSimSettings = function () {
    const sp = document.getElementById("cmd-speed");
    if (sp && !sp.options.length) {
        TIME_SCALES.forEach(t => {
            const o = document.createElement("option");
            o.value = String(t.v); o.text = t.label;
            sp.add(o);
        });
    }
    if (sp) sp.value = String(CONFIG.timeScale);

    const dt = document.getElementById("cmd-daytype");
    if (dt && !dt.options.length) {
        DAY_TYPES.forEach(t => {
            const o = document.createElement("option");
            o.value = t.v; o.text = t.label;
            dt.add(o);
        });
    }
    if (dt) dt.value = CONFIG.dayType;
};

UIManager.prototype.applyTimeScale = function () {
    const sp = document.getElementById("cmd-speed");
    if (!sp) return;
    // 従側のタブでも表示がすぐ変わるように、手元にも反映してから指令を通す
    setTimeScale(sp.value);
    this.game.dispatch({ name: "timeScale", value: Number(sp.value) });
};

UIManager.prototype.applyDayType = function () {
    const dt = document.getElementById("cmd-daytype");
    if (!dt) return;
    setDayType(dt.value);
    this.game.dispatch({ name: "dayType", value: dt.value });
};

/* ここから下の指令は、実体を js/28-dispatch.js に置いている。
   Super-TID 画面 (tid.html) や別タブからの指令と同じ処理を通すため。 */
UIManager.prototype.executeTrainChange = function () {
        const r = this.game.dispatch({
            name: "change",
            trainId: document.getElementById('cmd-no').value,
            dest: document.getElementById('cmd-dest').value,
            type: document.getElementById('cmd-type').value,
            action: document.getElementById('cmd-action').value
        });
        alert(r.msg || (r.ok ? "変更完了" : "変更できませんでした"));
        this.updateTrainSelector();
};

UIManager.prototype.executeSuspendOn = function () {
        const r = this.game.dispatch({
            name: "hold",
            trainId: document.getElementById('cmd-no').value,
            at: document.getElementById('cmd-stop-at').value
        });
        alert(r.msg || (r.ok ? "予約完了" : "実行できませんでした"));
};

UIManager.prototype.executeSuspendImm = function () {
        const r = this.game.dispatch({
            name: "hold", trainId: document.getElementById('cmd-no').value
        });
        alert(r.msg || (r.ok ? "即時抑止実行" : "実行できませんでした"));
        this.updateTrainSelector();
};

UIManager.prototype.executeSuspendOff = function () {
        const r = this.game.dispatch({
            name: "release", trainId: document.getElementById('cmd-no').value
        });
        alert(r.msg || (r.ok ? "解除完了" : "実行できませんでした"));
        this.updateTrainSelector();
};

/**
 * 強制発車指令。
 * 抑止(即時・予約・同ホーム抑止)を解除し、続行間隔や順序待ちの
 * 自動判定を1回だけ飛ばして発車させる、指令による割り込み操作。
 * 実体は js/28-dispatch.js の DISPATCH.force。
 */
UIManager.prototype.executeForceStart = function () {
    const id = document.getElementById('cmd-no').value;
    if (!id) { alert("対象列車を選択してください。"); return; }
    const t = this.game.getTrain(id);
    // 見合わせ区間へ突っ込ませないための確認
    if (t && this.game.trackMgr.isSuspended(t.trackId, t.currBlockIndex + t.dir)) {
        if (typeof confirm === "function" &&
            !confirm(`${t.trainNo} の先は運転見合わせ区間です。強制発車させますか？`)) return;
    }
    const r = this.game.dispatch({ name: "force", trainId: id });
    alert(r.msg || (r.ok ? "強制発車を指示しました" : "実行できませんでした"));
    this.updateDepotSelector();
    this.updateTrainSelector();
};

UIManager.prototype.updateTrackCandidates = function () {
        const stName = document.getElementById("cmd-chg-station").value;
        const trSel = document.getElementById("cmd-chg-track");
        trSel.innerHTML = '<option value="">番線を選択</option>';
        if(!stName) return;
        ["Up_In", "Up_Out", "Down_In", "Down_Out"].forEach(tid => {
            const blks = this.game.trackMgr.blocks[tid];
            if(!blks) return;
            const blk = blks.find(b => b.stationIdx === STATION_MAP[stName]);
            if(blk) {
                /* ★番線は配線データから引く (js/03-stations.js)。
                   以前は "Lane:1" のようにレーン番号をそのまま出していて、
                   実際の番線と対応していなかった。 */
                blk.lanes.forEach((_, laneIdx) => {
                    const lbl = platformLabelOf(stName, tid, laneIdx);
                    /* 線名は旅客向け画面でも使うので、ここで持つ
                       (TID_ROWS は Super-TID 画面だけが読み込むため参照しない) */
                    const LINE_LABEL = { Up_Out: "上り外", Up_In: "上り内",
                                         Down_In: "下り内", Down_Out: "下り外" };
                    const op = document.createElement("option");
                    op.value = `${tid},${laneIdx}`;
                    op.text = (LINE_LABEL[tid] || tid) + " " +
                              (lbl ? platformText(lbl) : "第" + (laneIdx + 1) + "線");
                    trSel.add(op);
                });
            }
        });
};

UIManager.prototype.applyTrackChange = function () {
        const val = document.getElementById("cmd-chg-track").value || "";
        const parts = val.split(",");
        const r = this.game.dispatch({
            name: "trackChange",
            trainId: document.getElementById('cmd-no').value,
            station: document.getElementById("cmd-chg-station").value,
            trackId: parts[0], lane: parseInt(parts[1], 10) || 0
        });
        alert(r.msg || (r.ok ? "予約しました" : "選択不備"));
};

UIManager.prototype.setSuspension = function () {
        const r = this.game.dispatch({
            name: "suspend",
            trackId: document.getElementById('sus-track').value,
            from: document.getElementById('sus-start').value,
            to: document.getElementById('sus-end').value
        });
        alert(r.msg || (r.ok ? "見合わせ設定完了" : "設定できませんでした"));
};

UIManager.prototype.clearSuspension = function () {
        const r = this.game.dispatch({ name: "clearSuspend" });
        alert(r.msg || "全解除");
};

UIManager.prototype.executeDepotOutForce = function () {
        const r = this.game.dispatch({
            name: "depotOut",
            depot: document.getElementById("cmd-depot-sel").value,
            trainId: document.getElementById("cmd-depot-train").value,
            delayMin: parseInt(document.getElementById('cmd-depot-time').value, 10) || 0,
            type: document.getElementById('cmd-depot-type').value,
            dest: document.getElementById('cmd-depot-dest').value
        });
        alert(r.msg || (r.ok ? "出区指令を設定しました" : "設定できませんでした"));
        this.updateDepotSelector();
        this.updateTrainSelector();
};
