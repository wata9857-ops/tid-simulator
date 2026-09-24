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
        // 着発番線変更の駅は、その列車がこれから通る駅に絞る
        this.fillTrackChangeStations(t);
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

/**
 * 出区の行先の候補。選んだ留置場から向きを変えずに行けない行先は選べなくする
 * (js/28-dispatch.js の depotOutRoute)。
 * ★以前はどの行先でも選べ、放出の電留線から京都・大阪を選ぶと
 *   放出から四条畷方の行き止まりへ走り出していた。
 */
UIManager.prototype.updateDepotDests = function () {
        const sel = document.getElementById("cmd-depot-dest");
        if (!sel) return;
        if (!this._depotDests) this._depotDests = Array.from(sel.options || []).map(o => o.value).filter(Boolean);
        const depotName = (document.getElementById("cmd-depot-sel") || {}).value || "";
        const type = (document.getElementById("cmd-depot-type") || {}).value || "回送";
        const keep = sel.value;
        sel.innerHTML = "";
        let firstOk = "";
        this._depotDests.forEach(d => {
            const ck = depotName ? depotOutRoute(this.game, depotName, d, type) : { ok: true };
            const o = document.createElement("option");
            o.value = d;
            o.text = d + (ck.ok ? "" : "（不可）");
            o.disabled = !ck.ok;
            o.title = ck.ok ? "" : ck.msg;
            sel.add(o);
            if (ck.ok && !firstOk) firstOk = d;
        });
        const keepOk = keep && (!depotName || depotOutRoute(this.game, depotName, keep, type).ok);
        sel.value = keepOk ? keep : (firstOk || keep);
        this.updateCmdDepotActionOptions();
};

UIManager.prototype.updateDepotTrains = function () {
        this.updateDepotDests();
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

/**
 * 着発番線変更の「駅」の候補。列車を選んでいれば、その列車がこれから通る駅だけ。
 * ★以前は本線の駅を全部並べていたので、通過済みの駅や、その列車が通らない
 *   線区の駅 (湖西線の列車に大阪 など) を選べてしまい、予約しても効かなかった。
 *   湖西線・JR宝塚線・JR東西線の駅は候補にすら無かった。
 */
UIManager.prototype.fillTrackChangeStations = function (t) {
        const sel = document.getElementById("cmd-chg-station");
        if (!sel) return;
        const keep = sel.value;
        let names;
        if (t && t.state !== "in_depot" && t.state !== "finished") names = trainStationsAhead(this.game, t, 25);
        else names = STATIONS.map(s => s.name)
            .concat(Object.values(KOSEI_STATIONS_MAP))
            .concat(Object.values(FUKUCHI_STATIONS_MAP))
            .concat(Object.values(TOZAI_STATIONS_MAP));
        sel.innerHTML = '<option value="">駅を選択してください</option>';
        names.forEach(n => {
            const o = document.createElement("option");
            o.value = n; o.text = n;
            sel.add(o);
        });
        sel.value = (names.indexOf(keep) >= 0) ? keep : "";
        this.updateTrackCandidates();
};

/**
 * 着発番線変更の「番線」の候補 (js/13-train-hold.js の trackChangeCandidates)。
 * ★以前は本線の4線だけを「上り内 N番線」の形で並べていて、分岐線の番線が無く、
 *   向きの違う線路の番線も選べた (選んでも入れないので、列車が手前で止まり続けた)。
 */
UIManager.prototype.updateTrackCandidates = function () {
        const stName = document.getElementById("cmd-chg-station").value;
        const trSel = document.getElementById("cmd-chg-track");
        trSel.innerHTML = '<option value="">番線を選択</option>';
        const t = this.game.getTrain(document.getElementById("cmd-no").value);
        const live = (t && t.state !== "in_depot" && t.state !== "finished") ? t : null;
        const r = live ? live.trackChangeReservation : null;
        if (r && r.status === "pending") {
            const op = document.createElement("option");
            op.value = "cancel";
            op.text = `― 予約中の変更 (${r.stationName} ${r.label || ""}) を取り消す ―`;
            trSel.add(op);
        }
        if (!stName) return;
        trackChangeCandidates(this.game, live, stName).forEach(o => {
            const op = document.createElement("option");
            op.value = o.value;
            op.text = o.text + (o.disabled ? "（不可）" : "");
            op.disabled = !!o.disabled;
            op.title = o.note || "";
            trSel.add(op);
        });
};

UIManager.prototype.applyTrackChange = function () {
        const val = document.getElementById("cmd-chg-track").value || "";
        const parts = val.split(",");
        if (!document.getElementById('cmd-no').value || !parts[0]) {
            alert("列車・駅・番線を選んでください。");
            return;
        }
        const r = this.game.dispatch({
            name: "trackChange",
            trainId: document.getElementById('cmd-no').value,
            station: document.getElementById("cmd-chg-station").value,
            trackId: parts[0], lane: parseInt(parts[1], 10) || 0
        });
        alert(r.msg || (r.ok ? "予約しました" : "選択不備"));
        this.updateTrackCandidates();
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
            dest: document.getElementById('cmd-depot-dest').value,
            action: document.getElementById('cmd-depot-action').value || ""
        });
        alert(r.msg || (r.ok ? "出区指令を設定しました" : "設定できませんでした"));
        this.updateDepotSelector();
        this.updateTrainSelector();
};
