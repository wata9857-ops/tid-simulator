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

UIManager.prototype.executeTrainChange = function () {
        const t = this.game.getTrain(document.getElementById('cmd-no').value);
        if (!t) return;
        const dest = document.getElementById('cmd-dest').value;
        const type = document.getElementById('cmd-type').value;
        if(dest) t.dest = dest;
        if(type!=="no_change") { 
            t.type=type; 
            if(type==="回送"||type==="臨時") {
                this.game.spawner.activeTrainNos.delete(t.trainNo); // ★追加: 古い列番を削除
                t.trainNo=type.charAt(0)+t.trainNo.replace(/\D/g,''); 
                this.game.spawner.activeTrainNos.add(t.trainNo); // ★追加: 新しい列番を登録
            }
        }
        t.nextAction = document.getElementById('cmd-action').value;

        // ★追加: 運行継続ジャッジ待ち状態での介入を検知し、運転を再開させる
        if (t.isJudging) {
            t.isJudging = false;
            t.minorTrouble = false;
            t.troubleInfo.active = false;
            t.state = "running";
            t.timer = 15;
            this.updateBanner(`【指令介入】${t.trainNo} に対する運行継続/打ち切りの指示を受信。直ちに運転を再開します。`, "banner-orange");
        }

        alert("変更完了");
        this.updateTrainSelector(); // ★追加: セレクトボックスを再構築
};

UIManager.prototype.executeSuspendOn = function () {
        const t = this.game.getTrain(document.getElementById('cmd-no').value);
        if(!t) return;
        const at = document.getElementById('cmd-stop-at').value;
        if(at) { t.plannedStop = at; alert("予約完了"); } else { t.isManuallySuspended=true; alert("即時抑止"); }
};

UIManager.prototype.executeSuspendImm = function () {
        const t = this.game.getTrain(document.getElementById('cmd-no').value);
        if(!t) return; 
        t.isManuallySuspended=true; 
        t.manualSuspendTimer=0; 
        t.hasNotifiedSuspendLong=false; 
        t.plannedStop=null; 
        alert("即時抑止実行"); 
        this.updateTrainSelector();
};

UIManager.prototype.executeSuspendOff = function () {
        const t = this.game.getTrain(document.getElementById('cmd-no').value);
        if(!t) return; 
        t.isManuallySuspended=false; 
        t.manualSuspendTimer=0; 
        t.hasNotifiedSuspendLong=false; 
        t.plannedStop=null; 
        if(t.state==="holding"){t.state="running"; t.timer=15;}
        alert("解除完了");
};

/**
 * ★追加: 強制発車指令。
 * 抑止(即時抑止・予約抑止・同ホーム抑止)を解除し、続行間隔や順序待ちの
 * 自動判定を1回だけ飛ばして発車させる、指令による割り込み操作。
 *
 * 自動の運転整理ロジックそのものは変更しない。forceStart は発車できた時点で
 * 自動的に解除されるので、以降は通常の判定に戻る。
 * 進路(番線)が空いていない場合は move() 側で止まるため、追突は起きない。
 */
UIManager.prototype.executeForceStart = function () {
    const t = this.game.getTrain(document.getElementById('cmd-no').value);
    if (!t) { alert("対象列車を選択してください。"); return; }

    // 留置場で待機中の場合は強制出区として扱う
    if (t.state === "in_depot") {
        if (!t.depotOutConfig) {
            alert("この編成には出区する運用が設定されていません。\n「4. 留置場 出区・強制発車指令」で運用を設定してください。");
            return;
        }
        t.forceDepotOut = true;
        t.timer = 0;
        t.tryDepotOut(t.startName, true);
        this.game.ui.updateBanner(`【指令介入】${t.trainNo || "予備車"} に ${t.startName}留置場からの強制出区を指示しました。`, "banner-orange");
        this.updateDepotSelector();
        this.updateTrainSelector();
        return;
    }

    const blks = this.game.trackMgr.blocks[t.trackId];
    const blk = blks ? blks[t.currBlockIndex] : null;
    const stName = blk ? (blk.hoppoStationName || (blk.stationIdx >= 0 ? STATIONS[blk.stationIdx].name : "駅間")) : "駅間";

    // 見合わせ区間へ突っ込ませないための確認
    if (this.game.trackMgr.isSuspended(t.trackId, t.currBlockIndex + t.dir)) {
        if (!confirm(`${stName} の先は運転見合わせ区間です。\n${t.trainNo} を強制発車させますか？`)) return;
    }

    const wasSuspended = t.isManuallySuspended || t.plannedStop;

    t.isManuallySuspended = false;
    t.manualSuspendTimer = 0;
    t.hasNotifiedSuspendLong = false;
    t.plannedStop = null;
    t.forceStart = true;
    t.timer = 0;                 // 次のTickで即座に発車判定へ入る
    if (t.state === "holding") t.state = "running";
    // 終着待ち・同ホーム抑止で止めていた場合は、指令で運転再開させる
    if (t.nextAction === "wait_instruction") t.nextAction = "turnback";

    this.game.ui.updateBanner(
        `【指令介入】${stName}${wasSuspended ? "で抑止中" : "停車中"}の ${t.trainNo} に強制発車を指示しました。`,
        "banner-orange");
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
                blk.lanes.forEach((_, laneIdx) => {
                    let op = document.createElement("option"); op.value = `${tid},${laneIdx}`; op.text = `${tid} Lane:${laneIdx+1}`; trSel.add(op);
                });
            }
        });
};

UIManager.prototype.applyTrackChange = function () {
        const t = this.game.getTrain(document.getElementById('cmd-no').value);
        const stName = document.getElementById("cmd-chg-station").value;
        const val = document.getElementById("cmd-chg-track").value;
        if(!t || !stName || !val) { alert("選択不備"); return; }
        const [targetTrackId, targetLaneIdx] = val.split(",");
        t.trackChangeReservation = { stationName: stName, targetTrackId: targetTrackId, targetLane: parseInt(targetLaneIdx), status: "pending" };
        alert("予約しました");
};

UIManager.prototype.setSuspension = function () {
        const trk = document.getElementById('sus-track').value;
        const sName = document.getElementById('sus-start').value;
        const eName = document.getElementById('sus-end').value;
        const sIdx = STATION_MAP[sName], eIdx = STATION_MAP[eName];
        if(sIdx===undefined || eIdx===undefined) return;
        const blks = this.game.trackMgr.blocks[trk];
        let sB = blks.find(b=>b.stationIdx===sIdx), eB = blks.find(b=>b.stationIdx===eIdx);
        if(!sB || !eB) return;
        // ★修正: 両端の駅ブロックを見合わせ区間から除外し、駅への進入および折り返しを可能にする
        let minIdx = Math.min(sB.index, eB.index) + 1;
        let maxIdx = Math.max(sB.index, eB.index) - 1;
        if (minIdx <= maxIdx) {
            this.game.trackMgr.manualSuspensions.push({ trackId: trk, start: minIdx, end: maxIdx });
        }
        alert("見合わせ設定完了");
};

UIManager.prototype.clearSuspension = function () {
        this.game.trackMgr.manualSuspensions = [];
        this.game.trains.forEach(t=>{if(t.state==="holding"){t.state="running"; t.timer=15;}});
        alert("全解除");
};

UIManager.prototype.executeDepotOutForce = function () {
        const depotName = document.getElementById("cmd-depot-sel").value;
        const trainId = document.getElementById("cmd-depot-train").value;
        if (!depotName || !trainId) {
            alert("留置場と対象車両を選択してください。"); return;
        }
        const t = this.game.trains.find(tr => tr.id === trainId);
        if (!t || t.state !== "in_depot") {
            alert("該当車両が見つかりません。"); return;
        }

        const delayMin = parseInt(document.getElementById('cmd-depot-time').value);
        const newType = document.getElementById('cmd-depot-type').value;
        const newDest = document.getElementById('cmd-depot-dest').value;
        const nextAction = document.getElementById('cmd-depot-action').value;

        // 行先から進行方向（dir）を自動判定して逆走を防止
        let startIdx = STATION_MAP[depotName];
        if (depotName === "宮原操") startIdx = 39;
        if (depotName === "向日町操") startIdx = 51;
        
        let destIdx = STATION_MAP[newDest];
        if (destIdx === undefined) {
            if (newDest === "宮原操") destIdx = 39;
            if (newDest === "向日町操") destIdx = 51;
            if (newDest === "吹田貨") destIdx = 41;
        }

        let newDir = 1;
        if (startIdx !== undefined && destIdx !== undefined) {
            newDir = (destIdx > startIdx) ? 1 : -1;
        }

        t.dest = newDest;
        t.type = newType;
        t.nextAction = nextAction;
        t.dir = newDir;

        let tempTrack = t.dir === 1 ? "Up_In" : "Down_In";
        if (t.type === "回送" || t.type === "臨時") tempTrack = t.dir === 1 ? "Up_Out" : "Down_Out";
        
        if (t.trainNo) this.game.spawner.activeTrainNos.delete(t.trainNo);
        t.trainNo = this.game.spawner.generateTrainNumber(t.type, t.dir, depotName, tempTrack);

        t.depotOutConfig = { type: t.type, dest: t.dest, trainNo: t.trainNo, dir: t.dir };
        
        t.timer = delayMin * 60;
        t.forceDepotOut = true; // ★改善: タイマー実行時にも強制出区フラグを持たせる
        if (t.timer === 0) {
            t.tryDepotOut(depotName, true);
        } else {
            this.game.ui.updateBanner(`【出区予約】${t.trainNo} は ${delayMin}分後に ${depotName}留置場から強制出区します。`, "banner-orange");
        }
        
        alert(`${t.trainNo} (${depotName}留置場) に出区指令を設定しました。`);
        this.updateDepotSelector();
        this.updateTrainSelector();
};
