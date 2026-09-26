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
        /* ------------------------------------------------ 一覧の作り直しの見張り

           列車情報の一覧 (<select>) は毎秒作り直していた。
           プルダウンを開いてスクロールしている最中に中身が入れ替わると、
             ・スクロール位置が先頭に戻る
             ・選びかけていた項目が別のものに変わる
           ため、目当ての列車を選べなかった。

           直し方は2つ。
             1. 中身が変わっていないときは作り直さない (署名で比較)
             2. 利用者がその一覧を触っているあいだは作り直さず、
                閉じたときにまとめて反映する
           在線データそのものは今までどおり毎秒更新するので、
           表示や指令の即時性は落ちない。 */
        this._selSig = {};        // select の id -> 直前の中身の署名
        this._selBusy = {};       // select の id -> 利用者が操作中か
        this._selDirty = {};      // select の id -> 操作中に届いた新しい中身
    }

    /**
     * その <select> が「いま利用者が操作しているか」を見張る。
     * 開いている (focus / pointerdown 中) あいだは作り直さない。
     */
    guardSelect(id) {
        const e = this.el(id);
        if (!e || e.__tidGuarded) return;
        e.__tidGuarded = true;
        const busy = (v) => {
            this._selBusy[id] = v;
            // 操作が終わったら、待たせていた中身を反映する
            if (!v && this._selDirty[id]) {
                const html = this._selDirty[id];
                this._selDirty[id] = null;
                this.writeSelect(id, html, e.value);
            }
        };
        ["focus", "pointerdown", "mousedown", "touchstart", "keydown"]
            .forEach(ev => e.addEventListener(ev, () => busy(true)));
        // change / blur で操作の終わりとみなす
        ["blur", "change"].forEach(ev => e.addEventListener(ev, () => busy(false)));
    }

    /**
     * <select> の中身を、必要なときだけ書き換える。
     *   html … 組み立てた option の並び
     *   keep … 選択を保つ値
     * 戻り値: 実際に書き換えたか
     */
    writeSelect(id, html, keep) {
        const e = this.el(id);
        if (!e) return false;
        this.guardSelect(id);
        if (this._selSig[id] === html) return false;      // 中身が同じなら触らない
        if (this._selBusy[id]) {                          // 操作中なので後回し
            this._selDirty[id] = html;
            return false;
        }
        const cur = (keep === undefined) ? e.value : keep;
        e.innerHTML = html;
        this._selSig[id] = html;
        /* 選んでいた値がもう無いときは空にする。
           勝手に別の列車へ飛ばさないよう、値の代入は1回だけ行う。 */
        e.value = cur || "";
        if (cur && e.value !== cur) e.value = "";
        return true;
    }

    // ============================================================ 起動
    init() {
        this.fillSelectors();
        this.bindButtons();
        /* Super-TID を開いているあいだは、段階的な運転再開の抑止の解除を
           この画面の指令員が受け持つ (操作が無いときは応援の指令員が引き継ぐ)。 */
        this.game.dispatch({ name: "recoveryManual", value: true });
        this.render();
    }

    el(id) { return document.getElementById(id); }

    fillSelectors() {
        const opt = (v, t) => `<option value="${escapeLogHtml(v)}">${escapeLogHtml(t || v)}</option>`;

        // 表示区間 (画面をその駅へ飛ばす)
        const jump = this.el("tid-jump");
        if (jump) {
            const areas = [
                ["上郡", "上郡 (山陽本線の西端)"], ["相生", "相生・赤穂線"], ["網干", "網干"],
                ["姫路", "姫路"], ["加古川", "加古川"], ["西明石", "西明石"],
                ["三ノ宮", "三ノ宮・神戸"], ["芦屋", "芦屋"], ["尼崎", "尼崎(分岐)"],
                ["大阪", "大阪"], ["新大阪", "新大阪・宮原"], ["高槻", "高槻"],
                ["向日町操", "京都支所 出入口 (向日町操)"], ["京都", "京都"], ["山科", "山科(分岐)"],
                ["草津", "草津"], ["野洲", "野洲"], ["米原", "米原"], ["敦賀", "敦賀"],
                ["近江今津", "湖西線 近江今津"], ["宝塚", "JR宝塚線 宝塚"],
                ["新三田", "JR宝塚線 新三田"], ["北新地", "JR東西線 北新地"],
                ["放出", "JR東西線・学研都市線 放出"], ["四条畷", "学研都市線 四条畷"],
                ["松井山手", "学研都市線 松井山手"], ["京田辺", "学研都市線 京田辺"],
                ["木津", "学研都市線 木津"]
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
            .concat(Object.values(TOZAI_STATIONS_MAP))
            .concat(Object.values(AKO_STATIONS_MAP));
        const all = stNames.concat(branch.filter(n => stNames.indexOf(n) < 0));
        const stOpts = all.map(n => opt(n)).join("");
        ["tid-hold-at"].forEach(id => {
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
            const dests = ["播州赤穂", "上郡", "相生", "網干", "姫路", "加古川", "西明石", "須磨", "神戸", "三ノ宮", "芦屋",
                "尼崎", "大阪", "新大阪", "高槻", "京都", "草津", "野洲", "米原", "長浜",
                "近江塩津", "敦賀", "近江今津", "永原", "堅田",
                "塚口", "宝塚", "新三田", "篠山口", "福知山",
                "放出", "京橋", "四条畷", "長尾", "松井山手", "京田辺", "同志社前", "木津",
                "宮原操", "向日町操", "吹田貨"];
            destE.innerHTML = '<option value="">変更なし</option>' + dests.map(n => opt(n)).join("");
        }

        // シミュレーション時間の倍率と、ダイヤの曜日
        const sp = this.el("tid-speed");
        if (sp) {
            sp.innerHTML = TIME_SCALES.map(t => opt(String(t.v), t.label)).join("");
            sp.value = String(CONFIG.timeScale);
        }
        const dt = this.el("tid-daytype");
        if (dt) {
            dt.innerHTML = DAY_TYPES.map(t => opt(t.v, t.label)).join("");
            dt.value = CONFIG.dayType;
        }

        // 着発番線変更の駅 (列車を選ぶと、その列車がこれから通る駅に絞られる)
        this.refreshTrackStations();

        // 留置場
        this.refreshDepotSelect();
    }

    refreshDepotSelect() {
        const sel = this.el("tid-depot");
        if (!sel) return;
        const html = '<option value="">留置場を選択</option>' +
            Object.keys(DEPOTS).map(n =>
                `<option value="${n}">${n} (出区待ち ${DEPOTS[n].trains.length}/${DEPOTS[n].capacity} ・ 留置 ${this.game.fleet.poolAt(n).length})</option>`
            ).join("");
        this.writeSelect("tid-depot", html, sel.value);
        this.refreshDepotTrains();
    }

    /**
     * 出区の行先の候補。選んだ留置場から向きを変えずに行けない行先は、
     * 理由つきで選べなくする (js/28-dispatch.js の depotOutRoute)。
     * ★以前は全部の行先を選べたので、放出の電留線から「京都」「宮原操」を選ぶと
     *   放出から四条畷方の行き止まりへ走り出していた。
     */
    refreshDepotDests() {
        const sel = this.el("tid-depot-dest");
        if (!sel) return;
        if (!this._depotDests) {
            this._depotDests = Array.from(sel.options || []).map(o => o.value).filter(Boolean);
        }
        const dName = this.el("tid-depot") ? this.el("tid-depot").value : "";
        const type = this.el("tid-depot-type") ? this.el("tid-depot-type").value : "回送";
        const keep = sel.value;
        let firstOk = "";
        const html = this._depotDests.map(d => {
            const ck = dName ? depotOutRoute(this.game, dName, d, type) : { ok: true };
            if (ck.ok && !firstOk) firstOk = d;
            return `<option value="${escapeLogHtml(d)}"${ck.ok ? "" : " disabled"} title="${escapeLogHtml(ck.ok ? "" : ck.msg)}">` +
                   escapeLogHtml(d + (ck.ok ? "" : "（不可）")) + "</option>";
        }).join("");
        sel.innerHTML = html;
        const keepOk = keep && dName && depotOutRoute(this.game, dName, keep, type).ok;
        sel.value = keepOk ? keep : (firstOk || keep || "");
    }

    refreshDepotTrains() {
        const dName = this.el("tid-depot") ? this.el("tid-depot").value : "";
        const sel = this.el("tid-depot-train");
        if (!sel) return;
        let html = '<option value="">車両を選択</option>';
        if (dName && DEPOTS[dName]) {
            DEPOTS[dName].trains.forEach((t, i) => {
                const veh = (t.vehicles && t.vehicles.length)
                    ? t.vehicles.map(v => v.fullId).join("+") + "(" + t.vehicles.reduce((s, v) => s + v.cars, 0) + "両)"
                    : "編成未定";
                const wait = (t.timer > 0) ? "出区まで" + Math.ceil(t.timer / 60) + "分"
                    : (t.timer === -1 ? "待機中" : "出区準備");
                html += `<option value="${t.id}">[${i + 1}] ${escapeLogHtml(t.trainNo || "予備車")} ${escapeLogHtml(veh)} / ${wait}</option>`;
            });
        }
        this.writeSelect("tid-depot-train", html, sel.value);
    }

    /**
     * 画面の配置の切り替え。
     *   ・表示・時間・表示倍率の欄をたたむ (線路図＝在線モニタを縦に広げる)
     *   ・指令卓 (輸送障害・記録) を縦に広げる
     * どちらも前回の状態を覚えておく。線路図は大きさが変わると次の描画で
     * キャンバスを作り直す (js/41-tid-render.js の resize)。
     */
    /**
     * 指令卓 (指令連絡・列車情報・運転指令・輸送障害/記録の4つの欄) を下へ寄せる。
     *   段階 … 0 隠す / 1 見出しだけ / 2 ふつう / 3 広げる
     *   「▼ 下げる」「▲ 上げる」で1段ずつ。取っ手の帯をドラッグすると好きな高さにできる。
     * 欄の中身・操作はそのまま (隠しても処理は続く。指令連絡の自動処理なども止まらない)。
     */
    bindDockHeight(on) {
        const names = ["隠す", "見出しだけ", "ふつう", "広げる"];
        const store = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* 続ける */ } };
        const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
        const body = document.body;
        const apply = (level, customPx) => {
            this.dockLevel = Math.max(0, Math.min(3, level));
            body.classList.toggle("tid-dock-hidden", this.dockLevel === 0);
            body.classList.toggle("tid-dock-low", this.dockLevel === 1);
            body.classList.toggle("tid-dock-tall", this.dockLevel === 3);
            body.classList.toggle("tid-dock-custom", !!customPx);
            if (customPx) body.style.setProperty("--tid-dock-h", customPx + "px");
            const g = this.el("tid-dock-grow");
            if (g) g.textContent = this.dockLevel === 3 ? "⤡ 戻す" : "⤢ 広げる";
            const st = this.el("tid-dock-state");
            if (st) st.textContent = "指令卓: " + (customPx ? Math.round(customPx) + "px" : names[this.dockLevel]);
            store("tid-dock-level", this.dockLevel);
            store("tid-dock-px", customPx || "");
            if (this.layoutState) this.layoutState.tall = this.dockLevel === 3;
            this.relayout();
        };
        const px0 = parseFloat(load("tid-dock-px", ""));
        apply(parseInt(load("tid-dock-level", this.layoutState && this.layoutState.tall ? 3 : 2), 10), px0 > 0 ? px0 : null);
        on("tid-dock-down", (e) => { e.stopPropagation(); apply(this.dockLevel - 1, null); });
        on("tid-dock-up", (e) => { e.stopPropagation(); apply(this.dockLevel + 1, null); });
        // 「⤢ 広げる」は ふつう ⇔ 広げる の切り替え (以前と同じ)
        const grow = this.el("tid-dock-grow");
        if (grow) grow.addEventListener("click", () => apply(this.dockLevel === 3 ? 2 : 3, null));
        // 取っ手の帯をドラッグ (上へ = 高く / 下へ = 低く。一番下まで下げると隠す)
        const bar = this.el("tid-dock-bar");
        const dock = this.el("tid-dock");
        if (bar && dock && bar.addEventListener) {
            let startY = 0, startH = 0, dragging = false;
            bar.addEventListener("pointerdown", (e) => {
                if (e.target && e.target.tagName === "BUTTON") return;
                dragging = true; startY = e.clientY;
                startH = this.dockLevel === 0 ? 0 : dock.getBoundingClientRect().height;
                if (bar.setPointerCapture) bar.setPointerCapture(e.pointerId);
            });
            bar.addEventListener("pointermove", (e) => {
                if (!dragging) return;
                const h = Math.max(0, Math.min(window.innerHeight * 0.8, startH + (startY - e.clientY)));
                if (h < 24) apply(0, null); else apply(2, h);
            });
            const end = () => { dragging = false; };
            bar.addEventListener("pointerup", end);
            bar.addEventListener("pointercancel", end);
        }
    }

    bindLayout(on) {
        const store = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) { /* 使えなくても続ける */ } };
        const load = (k) => { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } };
        const bar = this.el("tid-toolbar");
        const btn = this.el("tid-toolbar-toggle");
        const setBar = (collapsed) => {
            if (!bar) return;
            bar.classList.toggle("is-collapsed", collapsed);
            if (btn) {
                btn.textContent = collapsed ? "▼ 表示・時間・表示倍率" : "▲ たたむ";
                btn.title = collapsed ? "表示・時間・表示倍率の欄を開きます"
                                      : "表示・時間・表示倍率の欄をたたんで、線路図を広くします";
            }
            store("tid-toolbar-collapsed", collapsed);
            this.relayout();
        };
        const setTall = (tall) => {
            document.body.classList.toggle("tid-dock-tall", tall);
            const g = this.el("tid-dock-grow");
            if (g) g.textContent = tall ? "⤡ 戻す" : "⤢ 広げる";
            store("tid-dock-tall", tall);
            this.relayout();
        };
        this.layoutState = { collapsed: load("tid-toolbar-collapsed"), tall: load("tid-dock-tall") };
        setBar(this.layoutState.collapsed);
        setTall(this.layoutState.tall);
        this.bindDockHeight(on);
        on("tid-toolbar-toggle", () => {
            this.layoutState.collapsed = !this.layoutState.collapsed;
            setBar(this.layoutState.collapsed);
        });
        // 「⤢ 広げる」は bindDockHeight が受け持つ (指令卓の高さの段階と一緒に扱う)
    }

    /** 配置が変わったあと、線路図の大きさを合わせて描き直す */
    relayout() {
        const r = this.game && this.game.renderer;
        if (r && typeof r.resize === "function") {
            try { r.resize(); if (typeof r.draw === "function") r.draw(); } catch (e) { /* 起動前は描かない */ }
        }
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
        onCh("tid-depot", () => { this.refreshDepotTrains(); this.refreshDepotDests(); });
        const incBox = this.el("tid-incidents");
        if (incBox) incBox.addEventListener("click", (e) => {
            const b = e.target.closest ? e.target.closest("[data-rec='report']") : null;
            if (b) { this.openReport(b.getAttribute("data-id")); return; }
            // 段階的な運転再開の操作 (抑止中の列車の解除 / 応援の指令員に任せる)
            const r = e.target.closest ? e.target.closest("[data-rcv]") : null;
            if (!r) return;
            const plan = r.getAttribute("data-plan");
            const act = r.getAttribute("data-rcv");
            const stream = r.getAttribute("data-stream") || null;
            if (act === "one") this.run({ name: "recoveryRelease", plan: plan, count: 1, stream: stream });
            if (act === "three") this.run({ name: "recoveryRelease", plan: plan, count: 3, stream: stream });
            if (act === "all") {
                if (confirm("抑止中の列車をすべて解除します。区間に列車が続けて入ります。よろしいですか？")) {
                    this.run({ name: "recoveryRelease", plan: plan, count: "all", stream: stream });
                }
            }
            if (act === "hand") this.run({ name: "recoveryHandover", plan: plan });
        });
        on("tid-btn-major-rain", () => this.run({ name: "majorIncident", kind: "rain" }));
        on("tid-btn-major-snow", () => this.run({ name: "majorIncident", kind: "snow" }));
        onCh("tid-speed", () => {
            const v = Number(this.el("tid-speed").value);
            setTimeScale(v);                       // 手元にもすぐ反映する
            this.run({ name: "timeScale", value: v });
        });
        onCh("tid-daytype", () => {
            const v = this.el("tid-daytype").value;
            setDayType(v);
            this.run({ name: "dayType", value: v });
        });
        onCh("tid-train", () => this.selectTrain(this.el("tid-train").value));
        onCh("tid-depot-type", () => this.refreshDepotDests());
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
        this.bindLayout(on);
        on("tid-log-cmd",       () => { this.logTab = "cmd"; this.renderLogs(); });
        on("tid-log-staff",     () => { this.logTab = "staff"; this.renderLogs(); });
        on("tid-log-comm",      () => { this.logTab = "comm"; this.renderLogs(); });
        on("tid-log-inc",       () => { this.logTab = "inc"; this.renderLogs(); });
        on("tid-report-close",  () => this.closeReport());
        on("tid-report-save",   () => this.saveReport());
        /* 記録の一覧の中のボタン (報告書を開く・連絡の詳細を開く) はまとめて受ける。
           一覧は描き直すので、個々のボタンに付けると消えてしまう。 */
        const logs = this.el("tid-logs");
        if (logs) logs.addEventListener("click", (e) => {
            const b = e.target.closest ? e.target.closest("[data-rec]") : null;
            if (!b) return;
            const id = b.getAttribute("data-id");
            if (b.getAttribute("data-rec") === "report") this.openReport(id);
            if (b.getAttribute("data-rec") === "comm") {
                this._openComm = this._openComm || {};
                this._openComm[id] = !this._openComm[id];
                this._logSig = null;
                this.renderLogs();
            }
        });
        on("tid-station-close", () => { this.stationName = null; this.renderStation(); });
    }

    // ============================================================ 選択
    selectTrain(id) {
        this.selectedId = id || null;
        const sel = this.el("tid-train");
        if (sel && sel.value !== (id || "")) sel.value = id || "";
        // 番線変更の候補は列車ごとに違う (向き・これから通る駅)
        this.refreshTrackStations();
        this.refreshTrackCandidates();
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
        const r = this.run({
            name: "trackChange", trainId: this.selectedId,
            station: this.el("tid-chg-station").value,
            trackId: parts[0], lane: parseInt(parts[1], 10) || 0
        });
        // 結果 (予約中の表示・取り消しの項目) を候補に反映する
        this._selSig["tid-chg-track"] = null;
        this.refreshTrackCandidates();
        return r;
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

    /**
     * 着発番線変更の「駅」の候補。
     * 列車を選んでいれば、その列車がこれから通る駅だけを出す
     * (通過済みの駅・通らない線区の駅を選べてしまうと、予約しても効かない)。
     */
    refreshTrackStations() {
        const sel = this.el("tid-chg-station");
        if (!sel) return;
        const t = this.selected();
        const opt = (v, txt) => `<option value="${escapeLogHtml(v)}">${escapeLogHtml(txt || v)}</option>`;
        let names;
        if (t && t.state !== "in_depot" && t.state !== "finished") {
            names = trainStationsAhead(this.game, t, 25);
        } else {
            names = STATIONS.map(s => s.name)
                .concat(Object.values(KOSEI_STATIONS_MAP))
                .concat(Object.values(FUKUCHI_STATIONS_MAP))
                .concat(Object.values(TOZAI_STATIONS_MAP))
            .concat(Object.values(AKO_STATIONS_MAP).filter(n => n !== "播州赤穂"));
        }
        const html = '<option value="">駅を選択</option>' + names.map(n => opt(n)).join("");
        if (this.writeSelect("tid-chg-station", html, sel.value)) this.refreshTrackCandidates();
    }

    /**
     * 着発番線変更の「番線」の候補 (js/13-train-hold.js の trackChangeCandidates)。
     * その列車が入れない番線は、理由つきで選べなくしてある。
     */
    refreshTrackCandidates() {
        const stSel = this.el("tid-chg-station");
        const stName = stSel ? stSel.value : "";
        const sel = this.el("tid-chg-track");
        if (!sel) return;
        const t = this.selected();
        const live = (t && t.state !== "in_depot" && t.state !== "finished") ? t : null;
        let html = '<option value="">番線を選択</option>';
        const r = live ? live.trackChangeReservation : null;
        if (r && r.status === "pending") {
            html += `<option value="cancel">― 予約中の変更 (${escapeLogHtml(r.stationName)} ${escapeLogHtml(r.label || "")}) を取り消す ―</option>`;
        }
        if (stName) {
            trackChangeCandidates(this.game, live, stName).forEach(o => {
                html += `<option value="${o.value}"${o.disabled ? " disabled" : ""} title="${escapeLogHtml(o.note)}">` +
                        escapeLogHtml(o.text + (o.disabled ? "（不可）" : "")) + "</option>";
            });
        }
        this.writeSelect("tid-chg-track", html, sel.value);
        const hint = this.el("tid-chg-hint");
        if (hint) {
            const bad = stName ? trackChangeCandidates(this.game, live, stName).filter(o => o.disabled) : [];
            hint.textContent = !live ? "列車を選ぶと、その列車が入れる番線だけが選べます。"
                : (bad.length ? "選べない番線: " + bad[0].note : "");
        }
    }

    // ============================================================ 表示
    render() {
        this.renderHeader();
        this.renderTrainSelect();
        // 番線の在線は刻々と変わるので、候補も毎秒作り直す (操作中は待つ)
        this.refreshTrackStations();
        this.refreshTrackCandidates();
        this.renderTrainInfo();
        this.renderIncidents();
        this.renderLogs();
        this.renderStation();
        this.refreshDepotSelect();
        this.refreshReport();
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
        const cur = sel.value || this.selectedId || "";
        const list = this.game.trains
            .filter(t => t.state !== "finished")
            .sort((a, b) => String(a.trainNo || "ZZZ").localeCompare(String(b.trainNo || "ZZZ")));
        let html = '<option value="">列車を選択</option>' + list.map(t => {
            const mark = t.isManuallySuspended ? "【抑止】" :
                t.minorTrouble ? "【障害】" :
                t.state === "in_depot" ? "【留置】" : "";
            const veh = (t.vehicles && t.vehicles.length) ? " " + t.vehicles.map(v => v.id).join("+") : "";
            return `<option value="${t.id}">${mark}${escapeLogHtml(t.trainNo || "(待機)")} ${escapeLogHtml(t.type)} ${escapeLogHtml(t.dest || "")}${escapeLogHtml(veh)}</option>`;
        }).join("");

        /* ★選んでいた列車が一覧から消えた (運用を終えた) 場合。
           黙って別の列車に飛ばすと、指令の操作先が入れ替わって危ないので、
           「運用終了」と書いた項目として残し、選択をそのまま保つ。 */
        if (cur && !list.some(t => t.id === cur)) {
            html += '<option value="' + escapeLogHtml(cur) + '">' +
                    '（運用終了・一覧から外れました）</option>';
        }
        this.writeSelect("tid-train", html, cur);
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
            row("在線", escapeLogHtml(where) + " / " +
                        escapeLogHtml((TID_ROWS.find(r => r.id === t.trackId) || {}).label || t.trackId)) +
            /* ★番線は配線データから引く (js/03-stations.js の trainPlatformLabel)。
               駅間にいる列車には番線を出さない。 */
            row("番線", (function () {
                const lbl = trainPlatformLabel(this.game, t);
                if (lbl === null) return "駅間 (ホームには居ません)";
                const plat = isPlatformLane(where, t.trackId, t.lane);
                return escapeLogHtml(platformText(lbl)) + (plat ? "" : " <em>(側線・待避線)</em>");
            }).call(this)) +
            row("状態", escapeLogHtml(stateText) + (t.isManuallySuspended ? " <em>抑止中</em>" : "")) +
            (t.trackChangeReservation ? row("番線変更", (function (r) {
                const st = { pending: "予約中", done: "変更済み", failed: "取りやめ", cancelled: "取消" }[r.status] || r.status;
                return escapeLogHtml(r.stationName + " " + (r.label || "") + " … " + st) +
                       (r.note ? " <em>" + escapeLogHtml(r.note) + "</em>" : "");
            })(t.trackChangeReservation)) : "") +
            row("信号現示", asp ? `<span class="tid-asp tid-asp-${aspect}">${asp.name} (${aspect})</span>` : "—") +
            row("遅れ", Math.floor((t.delayTime || 0) / 60) + "分") +
            ((typeof freightTerminalStage === "function" && freightTerminalStage(t, this.game.currentTime))
                ? row("構内作業", escapeLogHtml(FREIGHT_TERMINALS[freightTerminalOfTrack(t.trackId)].name + " " +
                      (trainPlatformLabel(this.game, t) || "") + " … " + freightTerminalStage(t, this.game.currentTime))) : "") +
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
        const follower = !!(this.game.bus && !this.game.bus.isHost);
        const list = follower ? this.game.bus.incidentList() : this.game.incidents.list();
        const plans = follower ? this.game.bus.recoveryList()
                               : (this.game.recovery ? this.game.recovery.list() : []);
        if (!list.length && !plans.length) {
            e.innerHTML = '<p class="tid-empty">輸送障害はありません。</p>';
            return;
        }
        /* 段階的な運転再開 (見合わせは解除したが、区間の列車は1本ずつ抑止が残っている)。
           指令は線路ごとに先頭から解除する。操作が無いときは応援の指令員が引き継ぐ。 */
        const esc = escapeLogHtml;
        const modeText = (p) => p.mode === "prep" ? `運転再開の手配中 (乗務員への通告・点検 あと約${p.prepIn}分)`
            : p.mode === "manual" ? `指令が順次解除 (操作が無ければ約${p.handoverIn}分で応援の指令員が引き継ぎ)`
            : `${esc(p.by)}が間隔をあけて順次解除中`;
        const btn = (p, act, label, stream, cls) =>
            `<button class="tid-btn tid-rcv-btn${cls ? " " + cls : ""}" data-rcv="${act}" data-plan="${esc(p.id)}"` +
            (stream ? ` data-stream="${esc(stream)}"` : "") + `>${label}</button>`;
        const planHtml = plans.map(p =>
            `<div class="tid-rcv">` +
            `<div class="tid-rcv-head"><b>運転再開・抑止継続</b> ${esc(p.line)} ${esc(p.from)}〜${esc(p.to)} ` +
            // 区間と同じ場所の名前は繰り返さない (人身事故のように駅で起きたときだけ場所を出す)
            `<span class="tid-inc-place">${p.place.indexOf(p.from) >= 0 ? "" : esc(p.place) + " "}${esc(p.name)}</span>` +
            `<span class="tid-inc-rem">解除から${p.minutes}分 / 抑止 ${p.held}本・解除済 ${p.released}本</span></div>` +
            `<div class="tid-rcv-seg is-${p.mode === "auto" ? "open" : (p.mode === "manual" ? "ready" : "hold")}">` +
            `<span class="tid-rcv-state">${modeText(p)}</span>` +
            btn(p, "one", "各線 先頭1本", null, "tid-btn-go") + btn(p, "three", "各線 3本ずつ") +
            btn(p, "all", "全列車") + (p.mode === "auto" ? "" : btn(p, "hand", "応援に任せる")) +
            `</div>` +
            p.streams.map(s =>
                `<div class="tid-rcv-seg is-hold">` +
                `<span class="tid-rcv-label">${esc(s.label)} ${s.count}本</span>` +
                `<span class="tid-rcv-state">先頭 ${esc(s.head)} (${esc(s.headAt)})` +
                (s.trains.length > 1 ? ` → ${esc(s.trains.slice(1).join("・"))}${s.count > s.trains.length ? " …" : ""}` : "") + `</span>` +
                btn(p, "one", "1本", s.key) + btn(p, "three", "3本", s.key) +
                `</div>`).join("") +
            `</div>`).join("");
        e.innerHTML = planHtml + list.map(i =>
            `<div class="tid-inc">` +
            `<span class="tid-inc-name">${escapeLogHtml(i.name)}${i.scenario ? "<small>・" + escapeLogHtml(i.scenario) + "</small>" : ""}</span>` +
            `<span class="tid-inc-place">${escapeLogHtml(i.place)}</span>` +
            `<span class="tid-inc-stage">${escapeLogHtml(i.stage)}</span>` +
            `<span class="tid-inc-rem">再開見込 約${i.remain}分</span>` +
            (i.trainNo ? `<span class="tid-inc-train">当該 ${escapeLogHtml(i.trainNo)}</span>` : "") +
            `<button class="tid-btn tid-rec-btn" data-rec="report" data-id="${escapeLogHtml(i.id)}">報告書</button>` +
            `</div>`).join("");
    }

    renderLogs() {
        const e = this.el("tid-logs");
        if (!e) return;
        const tabs = { cmd: "tid-log-cmd", staff: "tid-log-staff", comm: "tid-log-comm", inc: "tid-log-inc" };
        Object.keys(tabs).forEach(k => {
            const tb = this.el(tabs[k]);
            if (tb) tb.classList.toggle("is-active", this.logTab === k);
        });
        if (this.logTab === "comm" || this.logTab === "inc") { this.renderRecords(e); return; }
        this._logSig = null;

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

    /**
     * 指令連絡・輸送障害の記録 (js/32-records.js)。
     * 中身が変わったときだけ描き直す (開いている詳細やスクロールを保つため)。
     */
    renderRecords(e) {
        const R = this.game.records;
        if (!R) { e.innerHTML = '<p class="tid-empty">記録の仕組みがありません。</p>'; return; }
        const esc = escapeLogHtml;
        let html;
        if (this.logTab === "comm") {
            const rows = R.comms.slice(0, 120);
            const sig = "comm|" + rows.length + "|" + rows.map(r => r.id + r.status + (r.timeline || []).length).join(",") +
                        JSON.stringify(this._openComm || {});
            if (sig === this._logSig) return;
            this._logSig = sig;
            if (!rows.length) { e.innerHTML = '<p class="tid-empty">指令連絡の記録はありません。</p>'; return; }
            html = rows.map(r => {
                const open = !!(this._openComm && this._openComm[r.id]);
                const src = LOG_SOURCES[r.cat] || LOG_SOURCES.unten;
                const resp = r.responseSec !== null && r.responseSec !== undefined
                    ? `応答 ${Math.round(r.responseSec)}秒` : "応答待ち";
                return `<div class="tid-rec tid-rec-${esc(r.level)}">` +
                    `<button class="tid-rec-row" data-rec="comm" data-id="${esc(r.id)}">` +
                    `<span class="tid-log-time">${esc(recClock(r.at))}</span>` +
                    `<span class="tid-comm-lv tid-comm-lv-${esc(r.level)}">${esc(r.levelLabel)}</span>` +
                    `<span class="tid-log-chip" style="background:${src.hue}">${src.tag}</span>` +
                    `<span class="tid-rec-title">${esc(r.title)}${r.trainNo ? " <b>" + esc(r.trainNo) + "</b>" : ""}</span>` +
                    `<span class="tid-rec-ans">${r.answer ? "→ " + esc(r.answer) : ""}</span>` +
                    `<span class="tid-rec-by">${esc(r.answeredBy || r.status)}</span>` +
                    `</button>` +
                    (open ? `<div class="tid-rec-detail">` +
                        `<div class="tid-rec-meta">発信: ${esc(r.from)}${r.where ? " / 位置: " + esc(r.where) : ""}` +
                        `${r.trainNo ? " / 列車: " + esc(r.trainNo + " " + (r.trainType || "") + " " + (r.trainDest || "")) : ""}` +
                        ` / ${esc(resp)}${r.held ? " / 応答まで当該列車を抑止" : ""}</div>` +
                        (r.options && r.options.length ? `<div class="tid-rec-meta">選択肢: ${esc(r.options.join(" / "))}</div>` : "") +
                        `<table class="rec-tl"><tbody>` + (r.timeline || []).map(x =>
                            `<tr><td class="rec-t">${esc(recClock(x.at, true))}</td><td class="rec-k">${esc(x.kind)}</td>` +
                            `<td><b>${esc(x.who || "")}</b> ${esc(x.text)}</td></tr>`).join("") +
                        `</tbody></table></div>` : "") +
                    `</div>`;
            }).join("");
        } else {
            const rows = R.incidents.slice(0, 40);
            const sig = "inc|" + rows.map(r => r.id + R.statusText(r) + r.stage + (r.timeline || []).length +
                        Object.keys(r.affected || {}).length).join(",");
            if (sig === this._logSig) return;
            this._logSig = sig;
            if (!rows.length) { e.innerHTML = '<p class="tid-empty">輸送障害の記録はありません。</p>'; return; }
            html = rows.map(r => {
                const live = r.status === "対応中";
                const dur = (r.endedAt || this.game.currentTime) - r.startedAt;
                const aff = Object.keys(r.affected || {}).length;
                const stText = R.statusText(r);
                return `<div class="tid-rec tid-rec-inc${live ? " is-live" : ""}">` +
                    `<div class="tid-rec-row">` +
                    `<span class="tid-log-time">${esc(recClock(r.startedAt))}</span>` +
                    `<span class="tid-rec-st ${live ? "is-live" : ""}">${esc(stText)}</span>` +
                    `<span class="tid-rec-title"><b>${esc(r.name)}</b> ${esc(r.place)}</span>` +
                    `<span class="tid-rec-by">${esc(r.no)} / ${live ? "経過" : "支障"} ${esc(recDuration(dur))} / 影響 ${aff}本 / 最大 ${Math.round((r.maxDelaySec || 0) / 60)}分</span>` +
                    `<button class="tid-btn tid-rec-btn" data-rec="report" data-id="${esc(r.id)}">報告書</button>` +
                    `</div></div>`;
            }).join("");
        }
        e.innerHTML = html;
    }

    /** 輸送障害の報告書を開く */
    openReport(id) {
        const box = this.el("tid-report");
        const body = this.el("tid-report-body");
        if (!box || !body || !this.game.records) return;
        this.reportId = id;
        body.innerHTML = this.game.records.incidentReportHtml(id);
        this._reportHtml = body.innerHTML;
        box.classList.add("is-on");
    }

    closeReport() {
        const box = this.el("tid-report");
        if (box) box.classList.remove("is-on");
        this.reportId = null;
    }

    /** 開いている報告書を、対応中なら描き直す (スクロール位置を保つ) */
    refreshReport() {
        if (!this.reportId || !this.game.records) return;
        const body = this.el("tid-report-body");
        if (!body) return;
        const html = this.game.records.incidentReportHtml(this.reportId);
        if (html === this._reportHtml) return;
        const top = body.scrollTop;
        body.innerHTML = html;
        this._reportHtml = html;
        body.scrollTop = top;
    }

    /** 報告書を文字だけのファイルで保存する */
    saveReport() {
        if (!this.reportId || !this.game.records) return;
        const text = this.game.records.incidentReportText(this.reportId);
        const rec = this.game.records.incidents.find(r => r.id === this.reportId);
        const name = "輸送障害報告_" + (rec ? rec.no : this.reportId) + ".txt";
        try {
            const blob = new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            this.notify(name + " を保存しました。");
        } catch (e) {
            this.notify("保存できませんでした。");
        }
    }

    /* 駅情報 (駅名札をタップしたときのパネル) は js/46-tid-station.js にある。
       番線ごとに固定して、到着・通過の予定を並べる。 */
}
