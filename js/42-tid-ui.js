/* Super-TID 画面の操作まわり。

   ■ この画面が持つもの (実物の Super-TID にならった配置)
       上段  … 表題・時計・運行状況・表示切替・表示区間の選択
       中央  … 線路図 (js/41-tid-render.js)
       下段  … 列車情報 / 運転指令パッド / 輸送障害 / 運転指令ログ / 業務連絡

   ■ 運転指令パッドに載せている指令
       抑止 (即時・駅指定) / 抑止解除 / 強制発車
       着発番線変更 (転線) / 行先・種別変更 / 終着後の処置
       留置場からの出区 (時刻指定・強制)
       運転見合わせの設定と解除
       防護無線の発報と解除
     旅客向け画面 (index.html) の指令パッドと同じ働きをする。
     どちらの画面から操作しても、同じシミュレーションの状態が変わる。
*/

class TidUI {
    constructor(game) {
        this.game = game;
        this.selectedId = null;
        this.logTab = "cmd";
        this.stationName = null;
    }

    // ============================================================ 起動
    init() {
        this.fillSelectors();
        this.bindButtons();
        this.render();
    }

    el(id) { return document.getElementById(id); }

    fillSelectors() {
        const opt = (v, t) => `<option value="${escapeLogHtml(v)}">${escapeLogHtml(t || v)}</option>`;

        // 表示区間 (画面をその駅へ飛ばす)
        const jump = this.el("tid-jump");
        if (jump) {
            const areas = [
                ["姫路", "姫路・網干"], ["加古川", "加古川"], ["西明石", "西明石"],
                ["三ノ宮", "三ノ宮・神戸"], ["芦屋", "芦屋"], ["尼崎", "尼崎(分岐)"],
                ["大阪", "大阪"], ["新大阪", "新大阪・宮原"], ["高槻", "高槻"],
                ["向日町操", "向日町操"], ["京都", "京都"], ["山科", "山科(分岐)"],
                ["草津", "草津"], ["野洲", "野洲"], ["米原", "米原"], ["敦賀", "敦賀"],
                ["近江今津", "湖西線 近江今津"], ["宝塚", "JR宝塚線 宝塚"],
                ["新三田", "JR宝塚線 新三田"], ["北新地", "JR東西線 北新地"],
                ["放出", "JR東西線・学研都市線 放出"]
            ];
            jump.innerHTML = areas.map(a => opt(a[0], a[1])).join("");
            jump.value = "大阪";
        }

        // 表示する線区
        const area = this.el("tid-area");
        if (area) {
            area.innerHTML = TID_AREAS.map(a => opt(a.id, a.label)).join("");
            area.value = "main";
        }

        // 抑止する駅・見合わせ区間の駅
        const stNames = STATIONS.map(s => s.name);
        const branch = []
            .concat(Object.values(KOSEI_STATIONS_MAP))
            .concat(Object.values(FUKUCHI_STATIONS_MAP))
            .concat(Object.values(TOZAI_STATIONS_MAP));
        const all = stNames.concat(branch);
        const stOpts = all.map(n => opt(n)).join("");
        ["tid-hold-at", "tid-chg-station"].forEach(id => {
            const e = this.el(id);
            if (e) e.innerHTML = '<option value="">指定なし</option>' + stOpts;
        });
        ["tid-sus-start", "tid-sus-end"].forEach(id => {
            const e = this.el(id);
            if (e) e.innerHTML = '<option value="">駅を選択</option>' + STATIONS.map(s => opt(s.name)).join("");
        });

        // 行先
        const destE = this.el("tid-dest");
        if (destE) {
            const dests = ["姫路", "網干", "加古川", "西明石", "須磨", "神戸", "三ノ宮", "芦屋",
                "尼崎", "大阪", "新大阪", "高槻", "京都", "草津", "野洲", "米原", "長浜",
                "近江塩津", "敦賀", "近江今津", "永原", "堅田",
                "塚口", "宝塚", "新三田", "篠山口", "福知山",
                "放出", "京橋", "四条畷", "松井山手", "同志社前", "木津",
                "宮原操", "向日町操", "吹田貨"];
            destE.innerHTML = '<option value="">変更なし</option>' + dests.map(n => opt(n)).join("");
        }

        // 留置場
        this.refreshDepotSelect();
    }

    refreshDepotSelect() {
        const sel = this.el("tid-depot");
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">留置場を選択</option>' +
            Object.keys(DEPOTS).map(n =>
                `<option value="${n}">${n} (出区待ち ${DEPOTS[n].trains.length}/${DEPOTS[n].capacity} ・ 留置 ${this.game.fleet.poolAt(n).length})</option>`
            ).join("");
        sel.value = cur;
        this.refreshDepotTrains();
    }

    refreshDepotTrains() {
        const dName = this.el("tid-depot") ? this.el("tid-depot").value : "";
        const sel = this.el("tid-depot-train");
        if (!sel) return;
        sel.innerHTML = '<option value="">車両を選択</option>';
        if (!dName || !DEPOTS[dName]) return;
        DEPOTS[dName].trains.forEach((t, i) => {
            const veh = (t.vehicles && t.vehicles.length)
                ? t.vehicles.map(v => v.fullId).join("+") + "(" + t.vehicles.reduce((s, v) => s + v.cars, 0) + "両)"
                : "編成未定";
            const wait = (t.timer > 0) ? "出区まで" + Math.ceil(t.timer / 60) + "分"
                : (t.timer === -1 ? "待機中" : "出区準備");
            sel.innerHTML += `<option value="${t.id}">[${i + 1}] ${escapeLogHtml(t.trainNo || "予備車")} ${escapeLogHtml(veh)} / ${wait}</option>`;
        });
    }

    bindButtons() {
        const on = (id, fn) => { const e = this.el(id); if (e) e.addEventListener("click", fn); };
        const onCh = (id, fn) => { const e = this.el(id); if (e) e.addEventListener("change", fn); };

        onCh("tid-jump", () => this.game.tidRenderer.scrollToStation(this.el("tid-jump").value));
        onCh("tid-area", () => {
            this.game.tidRenderer.applyArea(this.el("tid-area").value);
            // 表示区間の駅へスクロールし直す
            this.game.tidRenderer.scrollToStation(this.el("tid-jump").value);
        });
        onCh("tid-depot", () => this.refreshDepotTrains());
        onCh("tid-train", () => this.selectTrain(this.el("tid-train").value));
        onCh("tid-chg-station", () => this.refreshTrackCandidates());

        ["signal", "occupy", "fleet", "route", "platform"].forEach(k => {
            const e = this.el("tid-show-" + k);
            if (e) e.addEventListener("change", () => {
                this.game.tidRenderer.show[k] = e.checked;
                this.game.tidRenderer.draw();
            });
        });

        on("tid-btn-hold",      () => this.cmdHold(false));
        on("tid-btn-hold-at",   () => this.cmdHold(true));
        on("tid-btn-release",   () => this.cmdRelease());
        on("tid-btn-force",     () => this.cmdForceStart());
        on("tid-btn-apply",     () => this.cmdApplyChange());
        on("tid-btn-track",     () => this.cmdTrackChange());
        on("tid-btn-depot-out", () => this.cmdDepotOut());
        on("tid-btn-sus-set",   () => this.cmdSuspend());
        on("tid-btn-sus-clear", () => this.cmdClearSuspend());
        on("tid-btn-radio",     () => this.cmdRadio());
        on("tid-btn-radio-off", () => this.cmdClearRadio());
        on("tid-log-cmd",       () => { this.logTab = "cmd"; this.renderLogs(); });
        on("tid-log-staff",     () => { this.logTab = "staff"; this.renderLogs(); });
        on("tid-station-close", () => { this.stationName = null; this.renderStation(); });
    }

    // ============================================================ 選択
    selectTrain(id) {
        this.selectedId = id || null;
        const sel = this.el("tid-train");
        if (sel && sel.value !== (id || "")) sel.value = id || "";
        this.renderTrainInfo();
        if (this.game.tidRenderer) this.game.tidRenderer.draw();
    }

    selected() {
        return this.selectedId ? this.game.getTrain(this.selectedId) : null;
    }

    showStation(name) {
        this.stationName = name;
        this.renderStation();
    }

    notify(msg) {
        const e = this.el("tid-toast");
        if (!e) return;
        e.textContent = msg;
        e.classList.add("is-on");
        clearTimeout(this._toast);
        this._toast = setTimeout(() => e.classList.remove("is-on"), 2600);
    }

    // ============================================================ 指令
    /* 指令の実体は js/28-dispatch.js にある。
       旅客向け画面や別タブからの指令と同じ処理を通すため、
       ここでは入力を集めて game.dispatch() に渡すだけにしている。 */
    run(cmd) {
        const r = this.game.dispatch(cmd);
        if (r && r.msg && !r.forwarded) this.notify(r.msg);
        else if (r && r.forwarded) this.notify("指令を本体の画面へ送りました。");
        this.render();
        return r;
    }

    cmdHold(atStation) {
        if (!this.selectedId) { this.notify("対象列車を選んでください。"); return; }
        const at = atStation ? this.el("tid-hold-at").value : "";
        if (atStation && !at) { this.notify("抑止する駅を選んでください。"); return; }
        this.run({ name: "hold", trainId: this.selectedId, at: at });
    }

    cmdRelease() {
        if (!this.selectedId) { this.notify("対象列車を選んでください。"); return; }
        this.run({ name: "release", trainId: this.selectedId });
    }

    cmdForceStart() {
        if (!this.selectedId) { this.notify("対象列車を選んでください。"); return; }
        this.run({ name: "force", trainId: this.selectedId });
    }

    cmdApplyChange() {
        if (!this.selectedId) { this.notify("対象列車を選んでください。"); return; }
        this.run({
            name: "change", trainId: this.selectedId,
            dest: this.el("tid-dest").value,
            type: this.el("tid-type").value,
            action: this.el("tid-action").value
        });
    }

    cmdTrackChange() {
        const val = this.el("tid-chg-track").value || "";
        const parts = val.split(",");
        if (!this.selectedId || !parts[0]) { this.notify("列車・駅・番線を選んでください。"); return; }
        this.run({
            name: "trackChange", trainId: this.selectedId,
            station: this.el("tid-chg-station").value,
            trackId: parts[0], lane: parseInt(parts[1], 10) || 0
        });
    }

    cmdDepotOut() {
        this.run({
            name: "depotOut",
            depot: this.el("tid-depot").value,
            trainId: this.el("tid-depot-train").value,
            delayMin: parseInt(this.el("tid-depot-time").value, 10) || 0,
            type: this.el("tid-depot-type").value,
            dest: this.el("tid-depot-dest").value
        });
    }

    cmdSuspend() {
        this.run({
            name: "suspend",
            trackId: this.el("tid-sus-track").value,
            from: this.el("tid-sus-start").value,
            to: this.el("tid-sus-end").value
        });
    }

    cmdClearSuspend() { this.run({ name: "clearSuspend" }); }
    cmdRadio()        { this.run({ name: "radio" }); }
    cmdClearRadio()   { this.run({ name: "clearRadio" }); }

    refreshTrackCandidates() {
        const stName = this.el("tid-chg-station").value;
        const sel = this.el("tid-chg-track");
        if (!sel) return;
        sel.innerHTML = '<option value="">番線を選択</option>';
        if (!stName) return;
        const rule = STATION_PLATFORM_RULES[stName];
        TID_ROWS.forEach(row => {
            const blks = this.game.trackMgr.blocks[row.id];
            if (!blks) return;
            const blk = blks.find(b => blockStationName(b) === stName && b.x !== -1000);
            if (!blk) return;
            blk.lanes.forEach((_, li) => {
                const label = (rule && rule.labels[li]) ? rule.labels[li] + "番線" : ("第" + (li + 1) + "線");
                sel.innerHTML += `<option value="${row.id},${li}">${row.label} ${label}</option>`;
            });
        });
    }

    cmdTrackChange() {
        const t = this.selected();
        const stName = this.el("tid-chg-station").value;
        const val = this.el("tid-chg-track").value;
        if (!t || !stName || !val) { this.notify("列車・駅・番線を選んでください。"); return; }
        const parts = val.split(",");
        t.trackChangeReservation = {
            stationName: stName, targetTrackId: parts[0],
            targetLane: parseInt(parts[1], 10), status: "pending"
        };
        this.game.ui.updateBanner(
            `【指令】${t.trainNo} に ${stName}駅での着発番線変更を手配しました。`, "banner-orange");
        this.notify("転線を予約しました。");
    }

    cmdDepotOut() {
        const dName = this.el("tid-depot").value;
        const tid = this.el("tid-depot-train").value;
        if (!dName || !tid) { this.notify("留置場と車両を選んでください。"); return; }
        const t = this.game.getTrain(tid);
        if (!t || t.state !== "in_depot") { this.notify("該当の車両が見つかりません。"); return; }

        const delayMin = parseInt(this.el("tid-depot-time").value, 10) || 0;
        const newType = this.el("tid-depot-type").value;
        const newDest = this.el("tid-depot-dest").value;

        const sIdx = fleetIndexOf(dName);
        const dIdx = fleetIndexOf(newDest);
        const dir = (sIdx !== null && dIdx !== null && dIdx < sIdx) ? -1 : 1;

        t.type = newType;
        t.dest = newDest;
        t.dir = dir;
        if (t.trainNo) this.game.spawner.activeTrainNos.delete(t.trainNo);
        t.trainNo = this.game.spawner.generateTrainNumber(newType, dir, dName, depotTrackId(dName, dir, newType));
        t.dutyName = t.trainNo;
        t.depotOutConfig = { type: newType, dest: newDest, trainNo: t.trainNo, dir: dir, dutyName: t.trainNo };
        t.timer = delayMin * 60;
        t.forceDepotOut = true;
        if (t.timer === 0) t.tryDepotOut(dName, true);
        else this.game.ui.updateBanner(
            `【出区予約】${t.trainNo} は ${delayMin}分後に ${dName}留置場から出区します。`, "banner-orange");
        this.notify(t.trainNo + " の出区を手配しました。");
        this.render();
    }

    cmdSuspend() {
        const tid = this.el("tid-sus-track").value;
        const s = this.el("tid-sus-start").value;
        const e = this.el("tid-sus-end").value;
        const sIdx = STATION_MAP[s], eIdx = STATION_MAP[e];
        if (sIdx === undefined || eIdx === undefined) { this.notify("区間の両端の駅を選んでください。"); return; }
        const blks = this.game.trackMgr.blocks[tid];
        if (!blks) return;
        const sB = blks.find(b => b.stationIdx === sIdx && b.x !== -1000);
        const eB = blks.find(b => b.stationIdx === eIdx && b.x !== -1000);
        if (!sB || !eB) { this.notify("その線路にはこの区間がありません。"); return; }
        const lo = Math.min(sB.index, eB.index) + 1, hi = Math.max(sB.index, eB.index) - 1;
        if (lo > hi) { this.notify("区間が短すぎます。"); return; }
        this.game.trackMgr.manualSuspensions.push({ trackId: tid, start: lo, end: hi });
        this.game.ui.updateBanner(`【指令】${s}〜${e} 間の運転を見合わせます。`, "banner-red");
        this.notify(s + "〜" + e + " を見合わせに設定しました。");
    }

    cmdClearSuspend() {
        this.game.trackMgr.manualSuspensions = [];
        this.game.signals.clearFaults();
        this.game.trains.forEach(t => { if (t.state === "holding") { t.state = "running"; t.timer = 15; } });
        this.game.ui.updateBanner("【指令】運転見合わせを全て解除しました。", "banner-orange");
        this.notify("見合わせを全解除しました。");
    }

    cmdRadio() {
        const t = this.selected();
        const inc = this.game.incidents.trigger("jinshin");
        if (!inc) {
            // 当該列車が見つからないときは、防護無線だけを発報する
            this.game.isEmergency = true;
            this.game.radioTimer = 180;
            this.game.ui.updateBanner("🚨【防護無線】指令により防護無線を発報しました。付近の列車は直ちに停車してください。", "banner-red");
        }
        this.notify("防護無線を発報しました。");
        this.render();
    }

    // ============================================================ 表示
    render() {
        this.renderHeader();
        this.renderTrainSelect();
        this.renderTrainInfo();
        this.renderIncidents();
        this.renderLogs();
        this.renderStation();
        this.refreshDepotSelect();
    }

    renderHeader() {
        const set = (id, v) => { const e = this.el(id); if (e) e.textContent = v; };
        const running = this.game.trains.filter(t => t.state !== "finished" && t.state !== "in_depot");
        const delayed = running.filter(t => t.delayTime >= 300).length;
        const held = running.filter(t => t.isManuallySuspended).length;
        set("tid-clock", this.game.ui.elClock ? this.game.ui.elClock.innerText : "");
        set("tid-count", running.length + "本");
        set("tid-delay", delayed + "本");
        set("tid-held", held + "本");

        const st = this.el("tid-status");
        if (st) {
            const inc = this.game.incidents.active.length;
            if (this.game.isEmergency) {
                st.textContent = "防護無線 発報中";
                st.className = "tid-status is-emg";
            } else if (inc > 0) {
                st.textContent = "輸送障害 " + inc + "件 対応中";
                st.className = "tid-status is-warn";
            } else if (delayed > 0) {
                st.textContent = "一部列車に遅れ";
                st.className = "tid-status is-caution";
            } else {
                st.textContent = "平常運転";
                st.className = "tid-status is-ok";
            }
        }
        const radioOff = this.el("tid-btn-radio-off");
        if (radioOff) radioOff.disabled = !this.game.isEmergency && this.game.incidents.active.length === 0;
    }

    renderTrainSelect() {
        const sel = this.el("tid-train");
        if (!sel) return;
        const cur = sel.value;
        const list = this.game.trains
            .filter(t => t.state !== "finished")
            .sort((a, b) => String(a.trainNo || "ZZZ").localeCompare(String(b.trainNo || "ZZZ")));
        sel.innerHTML = '<option value="">列車を選択</option>' + list.map(t => {
            const mark = t.isManuallySuspended ? "【抑止】" :
                t.minorTrouble ? "【障害】" :
                t.state === "in_depot" ? "【留置】" : "";
            const veh = (t.vehicles && t.vehicles.length) ? " " + t.vehicles.map(v => v.id).join("+") : "";
            return `<option value="${t.id}">${mark}${escapeLogHtml(t.trainNo || "(待機)")} ${escapeLogHtml(t.type)} ${escapeLogHtml(t.dest || "")}${escapeLogHtml(veh)}</option>`;
        }).join("");
        sel.value = cur;
    }

    renderTrainInfo() {
        const e = this.el("tid-train-info");
        if (!e) return;
        const t = this.selected();
        if (!t) {
            e.innerHTML = '<p class="tid-empty">線路図の列車をタップするか、上の一覧から列車を選んでください。</p>';
            return;
        }
        const blks = this.game.trackMgr.blocks[t.trackId];
        const blk = blks ? blks[t.currBlockIndex] : null;
        const where = blk ? (blockStationName(blk) || "駅間") : "—";
        const aspect = (blk && this.game.signals) ? this.game.signals.aspectAhead(t) : "";
        const asp = SIGNAL_ASPECTS[aspect];
        const row = (k, v) => `<div class="tid-kv"><span>${k}</span><b>${v}</b></div>`;
        const cars = (t.vehicles || []).reduce((s, v) => s + v.cars, 0);
        const stateText = {
            running: "走行中", stopped: "停車中", holding: "抑止(信号待ち)",
            waiting_start: "発車待ち", turning_back: "折り返し中", in_depot: "留置中"
        }[t.state] || t.state;

        e.innerHTML =
            `<div class="tid-tno" style="background:${(TID_TYPE_COLORS[t.type] || {}).bg};color:${(TID_TYPE_COLORS[t.type] || {}).text}">` +
                `${escapeLogHtml(t.trainNo || "—")}</div>` +
            `<div class="tid-tdest">${escapeLogHtml(t.type)} ${escapeLogHtml(t.dest || "")} ${cars ? cars + "両" : ""}</div>` +
            row("在線", escapeLogHtml(where) + " / " + escapeLogHtml(t.trackId)) +
            row("状態", escapeLogHtml(stateText) + (t.isManuallySuspended ? " <em>抑止中</em>" : "")) +
            row("信号現示", asp ? `<span class="tid-asp tid-asp-${aspect}">${asp.name} (${aspect})</span>` : "—") +
            row("遅れ", Math.floor((t.delayTime || 0) / 60) + "分") +
            row("始発", escapeLogHtml(t.startName || "—")) +
            row("編成", (t.vehicles || []).map(v =>
                `<span class="tid-fleet" style="background:${(TID_FLEET_COLORS[v.group] || {}).bg}">${escapeLogHtml(v.fullId)}</span>`).join(" ") || "—") +
            (t.vehicles && t.vehicles.length
                ? `<div class="tid-note">${escapeLogHtml(t.vehicles[0].type)} — ${escapeLogHtml(t.vehicles[0].notes || "")}</div>` : "") +
            (t.troubleInfo && t.troubleInfo.active
                ? `<div class="tid-trouble">【${escapeLogHtml(t.troubleInfo.cause)}】${escapeLogHtml(t.troubleInfo.status)}（${escapeLogHtml(t.troubleInfo.location || "")}）</div>` : "");
    }

    renderIncidents() {
        const e = this.el("tid-incidents");
        if (!e) return;
        const list = (this.game.bus && !this.game.bus.isHost)
            ? this.game.bus.incidentList() : this.game.incidents.list();
        if (!list.length) {
            e.innerHTML = '<p class="tid-empty">輸送障害はありません。</p>';
            return;
        }
        e.innerHTML = list.map(i =>
            `<div class="tid-inc">` +
            `<span class="tid-inc-name">${escapeLogHtml(i.name)}</span>` +
            `<span class="tid-inc-place">${escapeLogHtml(i.place)}</span>` +
            `<span class="tid-inc-stage">${escapeLogHtml(i.stage)}</span>` +
            `<span class="tid-inc-rem">再開見込 約${i.remain}分</span>` +
            (i.trainNo ? `<span class="tid-inc-train">当該 ${escapeLogHtml(i.trainNo)}</span>` : "") +
            `</div>`).join("");
    }

    renderLogs() {
        const e = this.el("tid-logs");
        if (!e) return;
        const tabC = this.el("tid-log-cmd"), tabS = this.el("tid-log-staff");
        if (tabC) tabC.classList.toggle("is-active", this.logTab === "cmd");
        if (tabS) tabS.classList.toggle("is-active", this.logTab === "staff");

        const rows = this.game.ui.logHistory.filter(l => l.type === this.logTab).slice(0, 60);
        if (!rows.length) { e.innerHTML = '<p class="tid-empty">記録はありません。</p>'; return; }
        e.innerHTML = rows.map(l => {
            const src = LOG_SOURCES[l.cat] || LOG_SOURCES.unten;
            return `<div class="tid-log tid-log-${l.level || "normal"}">` +
                `<span class="tid-log-time">${escapeLogHtml(l.time)}</span>` +
                `<span class="tid-log-chip" style="background:${src.hue}">${src.tag}</span>` +
                `<span class="tid-log-body">${escapeLogHtml(l.msg)}</span></div>`;
        }).join("");
    }

    /** 駅情報 (番線ごとの在線と、次に発着する列車) */
    renderStation() {
        const e = this.el("tid-station");
        if (!e) return;
        const name = this.stationName;
        if (!name) { e.classList.remove("is-on"); return; }
        e.classList.add("is-on");

        const rule = STATION_PLATFORM_RULES[name];
        const rows = [];
        TID_ROWS.forEach(row => {
            const blks = this.game.trackMgr.blocks[row.id];
            if (!blks) return;
            const blk = blks.find(b => blockStationName(b) === name && b.x !== -1000);
            if (!blk) return;
            blk.lanes.forEach((occ, li) => {
                const label = (rule && rule.labels[li]) ? rule.labels[li] + "番線" : ("第" + (li + 1) + "線");
                const isPlat = rule && rule.lanes[li];
                rows.push({
                    line: row.label, label: label, platform: !!isPlat,
                    train: occ
                });
            });
        });

        const body = rows.length ? rows.map(r =>
            `<tr class="${r.train ? "is-busy" : ""}">` +
            `<td>${escapeLogHtml(r.line)}</td>` +
            `<td>${escapeLogHtml(r.label)}${r.platform ? "" : '<small>(側線)</small>'}</td>` +
            `<td>${r.train
                ? `<span class="tid-mini" style="background:${(TID_TYPE_COLORS[r.train.type] || {}).bg};color:${(TID_TYPE_COLORS[r.train.type] || {}).text}">${escapeLogHtml(r.train.trainNo)}</span> ` +
                  escapeLogHtml(r.train.type) + " " + escapeLogHtml(r.train.dest || "")
                : '<span class="tid-free">空き</span>'}</td>` +
            `</tr>`).join("") : '<tr><td colspan="3">この駅の番線情報はありません。</td></tr>';

        // 発着予定 (この駅を通る列車を近い順に)
        const approaching = [];
        this.game.trains.forEach(t => {
            if (t.state === "finished" || t.state === "in_depot") return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const target = blks.find(b => blockStationName(b) === name && b.x !== -1000);
            if (!target) return;
            const d = (target.index - t.currBlockIndex) * t.dir;
            if (d < 0 || d > UNITS_PER_STATION * 8) return;
            approaching.push({ t: t, blocks: d });
        });
        approaching.sort((a, b) => a.blocks - b.blocks);
        const soon = approaching.slice(0, 10).map(a =>
            `<div class="tid-soon">` +
            `<span class="tid-mini" style="background:${(TID_TYPE_COLORS[a.t.type] || {}).bg};color:${(TID_TYPE_COLORS[a.t.type] || {}).text}">${escapeLogHtml(a.t.trainNo)}</span>` +
            `<span>${escapeLogHtml(a.t.type)} ${escapeLogHtml(a.t.dest || "")}</span>` +
            `<span class="tid-soon-eta">あと約${Math.max(0, Math.round(a.blocks * 1.2))}分</span>` +
            (a.t.delayTime >= 60 ? `<span class="tid-soon-delay">${Math.floor(a.t.delayTime / 60)}分延</span>` : "") +
            `</div>`).join("") || '<p class="tid-empty">接近中の列車はありません。</p>';

        e.innerHTML =
            `<div class="tid-station-head"><b>${escapeLogHtml(name)}</b> 駅 在線状況` +
            `<button id="tid-station-close" class="tid-x">閉じる</button></div>` +
            `<table class="tid-table"><thead><tr><th>線路</th><th>番線</th><th>在線</th></tr></thead>` +
            `<tbody>${body}</tbody></table>` +
            `<div class="tid-station-sub">接近中の列車</div>${soon}`;
        const btn = this.el("tid-station-close");
        if (btn) btn.addEventListener("click", () => { this.stationName = null; this.renderStation(); });
    }
}
