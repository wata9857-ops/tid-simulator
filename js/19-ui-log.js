/* ヘッダーの「業務連絡」と「運転指令ログ履歴」の表示。

   ■ 変更点
     * 以前の renderLogList() は currentLogView で絞り込んだ配列を作っておきながら、
       描画では絞り込み前の logHistory を回していたため、運転指令ログと業務連絡が
       混ざって表示されていた。これを修正。
     * ログを「時刻 / 発信元 / 本文」に構造化し、発信元をラベル(チップ)で表示。
       重要度で左の帯と背景を変え、流し読みできるようにした。
     * タブ(運転指令/業務連絡)と発信元での絞り込みを付けた。
     * ヘッダーの業務連絡も、発信元ラベル + 本文の2段組にして読みやすくした。
*/

// ------------------------------------------------------------------ 発信元定義
// key : ログに付ける分類キー
// tag : 画面に出す短い名前
// hue : 帯・チップの色
const LOG_SOURCES = {
    // --- 業務連絡系
    hosen:    { tag: "保線",     hue: "#2e8b57" },
    denryoku: { tag: "電力",     hue: "#c8890a" },
    shingo:   { tag: "信号",     hue: "#8b008b" },
    sharyo:   { tag: "車両",     hue: "#3d6fa5" },
    jomuin:   { tag: "乗務員",   hue: "#1c9b94" },
    eki:      { tag: "駅",       hue: "#a0522d" },
    gaibu:    { tag: "外部",     hue: "#c04a4a" },
    // --- 運転指令系
    shirei:   { tag: "指令",     hue: "#5b35a8" },
    seiri:    { tag: "運転整理", hue: "#d1580d" },
    shubetsu: { tag: "種別変更", hue: "#00727d" },
    depot:    { tag: "出入区",   hue: "#2e7d32" },
    jiko:     { tag: "事故・異常", hue: "#c62828" },
    kaijo:    { tag: "解除・再開", hue: "#2e7d32" },
    unten:    { tag: "運行情報", hue: "#555f6b" }
};

const LOG_LEVEL_ORDER = { critical: 0, warn: 1, info: 2, normal: 3 };

/** 運転指令ログの本文から、発信元と重要度を推定する */
UIManager.prototype.classifyCmdLog = function (msg, cls) {
    const has = (s) => msg.indexOf(s) >= 0;

    if (has("🚨") || has("【人身事故】") || has("【事故】") || has("【緊急】") || cls === "banner-red") {
        return { cat: "jiko", level: "critical" };
    }
    if (has("【防護無線解除】") || has("【運転再開】") || has("【自動再開】") || has("🟢")) {
        return { cat: "kaijo", level: "info" };
    }
    if (has("【運休】")) return { cat: "seiri", level: "warn" };
    if (has("【運転整理】")) return { cat: "seiri", level: "warn" };
    if (has("【種別変更】")) return { cat: "shubetsu", level: "info" };
    if (has("【出区】") || has("【入区】") || has("【出区予約】") || has("【留置】")) {
        return { cat: "depot", level: "normal" };
    }
    if (has("【乗務員連絡】")) return { cat: "jomuin", level: "warn" };
    if (has("【指令】") || has("【指令介入】") || has("【指令待ち】")) {
        return { cat: "shirei", level: "info" };
    }
    if (has("🚧")) return { cat: "hosen", level: "warn" };
    return { cat: "unten", level: "normal" };
};

/** ログ本文の先頭にある 【…】 を見出しとして切り出す */
function splitLogHeading(msg) {
    const m = /^\s*([^\s【]*)?【([^】]+)】\s*([\s\S]*)$/.exec(msg);
    if (!m) return { heading: "", body: msg };
    return { heading: m[2], body: (m[1] ? m[1] + " " : "") + m[3] };
}

// ------------------------------------------------------------------ 業務連絡
UIManager.prototype.updateStaffLog = function (game) {
    const feed = document.getElementById("staff-log-marquee");
    if (!feed) return;

    let logs = [];

    if (game.isEmergency) {
        if (game.emergencyState.type === "human") {
            logs.push(
                { cat: "gaibu", name: "警察・消防", msg: `【事故】${game.emergencyState.location}での人身事故に関する現場検証・救護活動を実施中。` },
                { cat: "eki", name: "駅係員", msg: `【旅客対応】${game.emergencyState.location}、ホーム上の安全確認およびお客様の避難誘導を実施中。` },
                { cat: "sharyo", name: "網干総合車両所", msg: `【車両点検】当該列車の床下機器点検および損傷確認を実施中。` },
                { cat: "hosen", name: "管轄保線区", msg: `【軌道点検】事故現場付近の線路設備および軌道狂いの点検を実施中。` }
            );
        } else {
            logs.push(
                { cat: "hosen", name: "管轄保線区", msg: `【異常検知】${game.emergencyState.location}付近にて沿線異常を検知。係員による落石・倒木等の災害点検を実施中。` },
                { cat: "shingo", name: "管轄信号通信区", msg: `【設備異常】${game.emergencyState.location}付近の信号設備および通信ケーブルの異常有無を確認中。` },
                { cat: "denryoku", name: "管轄電力区", msg: `【送電異常】${game.emergencyState.location}付近にて送電異常の疑い。架線状態の確認を実施中。` }
            );
        }
    }

    let troubleTrains = game.trains.filter(t => t.minorTrouble);
    if (troubleTrains.length > 0) {
        let t = troubleTrains[Math.floor(Math.random() * troubleTrains.length)];
        let loc = t.troubleInfo.location || "駅間";
        let cause = t.troubleInfo.cause || "";
        if (cause.includes("踏切")) {
            logs.push({ cat: "eki", name: "駅係員", msg: `【踏切異常】${loc}の踏切にて非常ボタン動作。安全確認中。（当該:${t.trainNo}）` });
            logs.push({ cat: "gaibu", name: "警察署", msg: `【踏切障害】${loc}の踏切にて自動車立ち往生の報告。現場へ急行中。` });
        } else if (cause.includes("点検")) {
            logs.push({ cat: "sharyo", name: "管轄車両所", msg: `【車両故障】${loc}にて${t.trainNo}の応急処置および車両点検を実施中。運用変更を検討。` });
            logs.push({ cat: "jomuin", name: "管轄車掌区", msg: `【車両点検】${loc}停車中の${t.trainNo}にて異音感知のため床下機器を確認中。` });
        } else if (cause.includes("急病") || cause.includes("救護")) {
            logs.push({ cat: "jomuin", name: "管轄車掌区", msg: `【旅客対応】${loc}にて${t.trainNo}車内で急病人発生の申告。現在手配中。` });
            logs.push({ cat: "gaibu", name: "消防", msg: `【救護要請】${loc}にて救急搬送の要請あり。救急隊が向かっています。` });
        } else if (cause.includes("安全確認") || cause.includes("トラブル")) {
            logs.push({ cat: "jomuin", name: "管轄車掌区", msg: `【車内トラブル】${loc}停車中の${t.trainNo}にて車内迷惑行為の申告。警察官の手配を要請中。` });
            logs.push({ cat: "eki", name: "駅係員", msg: `【旅客対応】${loc}にてお客様同士のトラブル対応中。（当該:${t.trainNo}）` });
        } else {
            logs.push({ cat: "eki", name: "駅係員", msg: `【安全確認】${loc}にて安全確認を行っています。（当該:${t.trainNo}）` });
        }
    }

    let stuckTrains = game.trains.filter(t => t.stuckTime > 300);
    if (stuckTrains.length > 0) {
        let t = stuckTrains[Math.floor(Math.random() * stuckTrains.length)];
        let currentBlock = game.trackMgr.blocks[t.trackId] ? game.trackMgr.blocks[t.trackId][t.currBlockIndex] : null;
        let currentStName = currentBlock ? (currentBlock.hoppoStationName || (currentBlock.stationIdx >= 0 ? STATIONS[currentBlock.stationIdx].name : "")) : "駅間";
        let locPrefix = currentStName ? `${currentStName}付近 ` : "";

        logs.push({ cat: "jomuin", name: "管轄車掌区", msg: `【列車情報】${locPrefix}${t.trainNo}は機外停車が継続中。車内案内を実施しているが一部旅客から苦情あり。` });
        if (currentStName) logs.push({ cat: "eki", name: `${currentStName}駅`, msg: `【旅客情報】列車の詰まりによりホーム上の混雑が激化。入場規制を検討中。` });
    }

    let slowTrains = game.trains.filter(t => t.delayTime > 600);
    if (slowTrains.length > 0) {
        logs.push({ cat: "shingo", name: "大阪指令所", msg: `【運行管理】各線で大幅な遅れが発生中。運行管理システムの動作は正常。` });
    }

    // 有事の際のみ更新（トラブルが何もない場合は何も記録・表示しない）
    if (logs.length === 0) {
        if (!this.staffFeedIdle) {
            this.staffFeedIdle = true;
            feed.innerHTML = '<span class="staff-feed-idle">異常報告なし ― 全線平常運転</span>';
        }
        return;
    }
    this.staffFeedIdle = false;

    let selected = logs[Math.floor(Math.random() * logs.length)];
    this.addStaffLogToHistory(`[${selected.name}] ${selected.msg}`, selected.cat, selected.name);
    this.renderStaffFeed();
};

/** ヘッダーの業務連絡欄に、最新の1件を発信元ラベル付きで表示する */
UIManager.prototype.renderStaffFeed = function () {
    const feed = document.getElementById("staff-log-marquee");
    if (!feed) return;
    const latest = this.logHistory.find(l => l.type === "staff");
    if (!latest) {
        feed.innerHTML = '<span class="staff-feed-idle">最新の業務連絡がここに表示されます</span>';
        return;
    }
    const src = LOG_SOURCES[latest.cat] || LOG_SOURCES.unten;
    const cut = splitLogHeading(latest.msg);
    feed.innerHTML =
        `<span class="log-chip" style="background:${src.hue}">${src.tag}</span>` +
        `<span class="staff-feed-src">${escapeLogHtml(latest.src || src.tag)}</span>` +
        (cut.heading ? `<span class="staff-feed-head">${escapeLogHtml(cut.heading)}</span>` : "") +
        `<span class="staff-feed-body">${escapeLogHtml(cut.body)}</span>`;

    const count = document.getElementById("staff-log-count");
    if (count) count.innerText = this.logHistory.filter(l => l.type === "staff").length;
};

UIManager.prototype.addStaffLogToHistory = function (msg, category, src) {
    const timeStr = this.elClock.innerText;
    // 発信元の [○○] 部分は src に持たせるので本文からは外す
    const body = msg.replace(/^\[[^\]]*\]\s*/, "");
    this.logHistory.unshift({
        time: timeStr, type: "staff", cat: category || "unten",
        src: src || "", msg: body, level: (category === "gaibu") ? "warn" : "normal"
    });
    if (this.logHistory.length > 200) this.logHistory.pop();

    const p = document.getElementById("log-panel");
    if (p && p.style.display === "block" && this.currentLogView === "staff") this.renderLogList();
};

// ------------------------------------------------------------------ ログパネル
UIManager.prototype.toggleLogPanel = function (viewType) {
    const p = document.getElementById("log-panel");
    if (!p) return;

    if (p.style.display === "block" && (!viewType || this.currentLogView === viewType)) {
        p.style.display = "none";
        return;
    }
    if (viewType) this.currentLogView = viewType;
    p.style.display = "block";
    this.renderLogList();
};

/** タブ(運転指令 / 業務連絡)の切り替え */
UIManager.prototype.setLogView = function (viewType) {
    this.currentLogView = viewType;
    this.logFilter = null;      // タブを変えたら発信元の絞り込みは解除
    this.renderLogList();
};

/** 発信元での絞り込み。同じものを押すと解除。 */
UIManager.prototype.setLogFilter = function (cat) {
    this.logFilter = (this.logFilter === cat) ? null : cat;
    this.renderLogList();
};

/** 重要なものだけ表示のON/OFF */
UIManager.prototype.toggleLogImportantOnly = function () {
    this.logImportantOnly = !this.logImportantOnly;
    this.renderLogList();
};

UIManager.prototype.renderLogList = function () {
    const ul = document.getElementById("log-list");
    if (!ul) return;

    const view = this.currentLogView;
    if (view === "comm" || view === "inc") { this.renderRecordList(ul); return; }
    const ofView = this.logHistory.filter(log => log.type === view);

    // --- タブ
    const tabs = document.getElementById("log-tabs");
    if (tabs) {
        const nCmd = this.logHistory.filter(l => l.type === "cmd").length;
        const nStaff = this.logHistory.filter(l => l.type === "staff").length;
        tabs.innerHTML =
            `<button class="log-tab ${view === "cmd" ? "is-active" : ""}" onclick="game.ui.setLogView('cmd')">運転指令ログ<span class="log-tab-num">${nCmd}</span></button>` +
            `<button class="log-tab ${view === "staff" ? "is-active" : ""}" onclick="game.ui.setLogView('staff')">業務連絡<span class="log-tab-num">${nStaff}</span></button>` +
            this.recordTabsHtml(view) +
            `<button class="log-imp ${this.logImportantOnly ? "is-active" : ""}" onclick="game.ui.toggleLogImportantOnly()" title="事故・運休・運転整理・乗務員連絡だけを表示">重要のみ</button>`;
    }

    // --- 発信元の絞り込みチップ (そのタブに実際に出てきた発信元だけ並べる)
    const bar = document.getElementById("log-filter-bar");
    if (bar) {
        const counts = {};
        ofView.forEach(l => { counts[l.cat] = (counts[l.cat] || 0) + 1; });
        const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        bar.innerHTML = keys.length === 0 ? "" :
            `<button class="log-filter ${!this.logFilter ? "is-active" : ""}" onclick="game.ui.setLogFilter(null)">すべて</button>` +
            keys.map(k => {
                const s = LOG_SOURCES[k] || LOG_SOURCES.unten;
                const on = this.logFilter === k;
                return `<button class="log-filter ${on ? "is-active" : ""}" style="--hue:${s.hue}" onclick="game.ui.setLogFilter('${k}')">${s.tag}<span class="log-filter-num">${counts[k]}</span></button>`;
            }).join("");
    }

    let rows = ofView;
    if (this.logFilter) rows = rows.filter(l => l.cat === this.logFilter);
    if (this.logImportantOnly) rows = rows.filter(l => l.level === "critical" || l.level === "warn");

    ul.innerHTML = "";
    if (rows.length === 0) {
        ul.innerHTML = '<li class="log-empty">該当するログはありません。</li>';
        return;
    }

    // ログ内の列車番号をクリックできるようにするための対応表
    // (長い番号から順に置換して二重置換を防ぐ)
    const trainMap = [];
    this.game.trains.forEach(t => {
        if (t.trainNo && t.state !== "finished") trainMap.push({ no: t.trainNo, id: t.id });
    });
    trainMap.sort((a, b) => b.no.length - a.no.length);

    let lastTime = null;
    rows.forEach(log => {
        const src = LOG_SOURCES[log.cat] || LOG_SOURCES.unten;
        const cut = splitLogHeading(log.msg);

        const li = document.createElement("li");
        li.className = `log-row log-lv-${log.level || "normal"}`;
        li.style.setProperty("--hue", src.hue);

        // 本文中の列車番号をクリック可能にする
        let body = escapeLogHtml(cut.body);
        const holes = [];
        trainMap.forEach((tm, i) => {
            if (body.indexOf(tm.no) >= 0) {
                body = body.split(tm.no).join(`%%TRAIN_${i}%%`);
                holes.push({ key: `%%TRAIN_${i}%%`, tm: tm });
            }
        });
        holes.forEach(h => {
            body = body.split(h.key).join(
                `<span class="log-trainno" onclick="game.ui.openCmdPanelForTrain('${h.tm.id}')" title="クリックで指令パネルを開く">${escapeLogHtml(h.tm.no)}</span>`);
        });

        const sameTime = (log.time === lastTime);
        lastTime = log.time;

        li.innerHTML =
            `<span class="log-time${sameTime ? " is-dim" : ""}">${escapeLogHtml(log.time)}</span>` +
            `<span class="log-chip" style="background:${src.hue}">${src.tag}</span>` +
            `<span class="log-text">` +
                (log.src ? `<span class="log-src">${escapeLogHtml(log.src)}</span>` : "") +
                (cut.heading ? `<span class="log-head">${escapeLogHtml(cut.heading)}</span>` : "") +
                `<span class="log-body">${body}</span>` +
            `</span>`;
        ul.appendChild(li);
    });
};

/* ------------------------------------------------------------------ 指令連絡・輸送障害の記録
   (js/32-records.js)。運転指令ログ・業務連絡とは別に、1件ずつの記録を残す。
   ログは200件で古いものから消えるが、こちらは件ごとにまとめて残るので、
   あとから「その連絡に誰がどう答えたか」「その障害で何があったか」を追える。 */
UIManager.prototype.recordTabsHtml = function (view) {
    const R = this.game.records;
    const nComm = R ? R.comms.length : 0, nInc = R ? R.incidents.length : 0;
    return `<button class="log-tab ${view === "comm" ? "is-active" : ""}" onclick="game.ui.setLogView('comm')">指令連絡<span class="log-tab-num">${nComm}</span></button>` +
           `<button class="log-tab ${view === "inc" ? "is-active" : ""}" onclick="game.ui.setLogView('inc')">輸送障害<span class="log-tab-num">${nInc}</span></button>`;
};

UIManager.prototype.renderRecordList = function (ul) {
    const R = this.game.records;
    const view = this.currentLogView;
    const tabs = document.getElementById("log-tabs");
    if (tabs) {
        const nCmd = this.logHistory.filter(l => l.type === "cmd").length;
        const nStaff = this.logHistory.filter(l => l.type === "staff").length;
        tabs.innerHTML =
            `<button class="log-tab" onclick="game.ui.setLogView('cmd')">運転指令ログ<span class="log-tab-num">${nCmd}</span></button>` +
            `<button class="log-tab" onclick="game.ui.setLogView('staff')">業務連絡<span class="log-tab-num">${nStaff}</span></button>` +
            this.recordTabsHtml(view);
    }
    const bar = document.getElementById("log-filter-bar");
    if (bar) bar.innerHTML = "";
    ul.innerHTML = "";
    if (!R) { ul.innerHTML = '<li class="log-empty">記録の仕組みがありません。</li>'; return; }
    const esc = escapeLogHtml;
    if (view === "comm") {
        if (!R.comms.length) { ul.innerHTML = '<li class="log-empty">指令連絡の記録はありません。</li>'; return; }
        R.comms.slice(0, 150).forEach(r => {
            const src = LOG_SOURCES[r.cat] || LOG_SOURCES.unten;
            const li = document.createElement("li");
            li.className = "log-row rec-li log-lv-" + (r.level === "critical" ? "critical" : r.level === "important" ? "warn" : "normal");
            li.style.setProperty("--hue", src.hue);
            li.innerHTML =
                `<span class="log-time">${esc(recClock(r.at))}</span>` +
                `<span class="log-chip" style="background:${src.hue}">${esc(r.levelLabel)}</span>` +
                `<span class="log-text"><span class="log-src">${esc(r.from)}</span>` +
                `<span class="log-head">${esc(r.title)}</span>` +
                `<span class="log-body">${esc(r.text)}</span>` +
                `<span class="rec-li-ans">${r.answer ? "→ 「" + esc(r.answer) + "」 " + esc(r.reply || "") : "応答待ち"}` +
                ` <small>(${esc(r.answeredBy || r.status)}` +
                `${r.responseSec !== null && r.responseSec !== undefined ? "・" + Math.round(r.responseSec) + "秒" : ""})</small></span>` +
                `</span>`;
            ul.appendChild(li);
        });
        return;
    }
    if (!R.incidents.length) { ul.innerHTML = '<li class="log-empty">輸送障害の記録はありません。</li>'; return; }
    R.incidents.slice(0, 60).forEach(r => {
        const live = r.status === "対応中";
        const li = document.createElement("li");
        li.className = "log-row rec-li " + (live ? "log-lv-critical" : "log-lv-info");
        const dur = (r.endedAt || this.game.currentTime) - r.startedAt;
        li.innerHTML =
            `<span class="log-time">${esc(recClock(r.startedAt))}</span>` +
            `<span class="log-chip" style="background:${live ? "#c62828" : "#2e7d32"}">${esc(R.statusText(r))}</span>` +
            `<span class="log-text"><span class="log-src">${esc(r.no)}</span>` +
            `<span class="log-head">${esc(r.name)}</span>` +
            `<span class="log-body">${esc(r.place)} ・ ${live ? "経過" : "支障"} ${esc(recDuration(dur))} ・ ` +
            `影響 ${Object.keys(r.affected || {}).length}本 ・ 最大遅延 ${Math.round((r.maxDelaySec || 0) / 60)}分</span>` +
            `<button class="rec-open" onclick="game.ui.openIncidentReport('${esc(r.id)}')">報告書を開く</button>` +
            `</span>`;
        ul.appendChild(li);
    });
};

/** 輸送障害の報告書 (社員限り) を開く */
UIManager.prototype.openIncidentReport = function (id) {
    const R = this.game.records;
    const m = document.getElementById("report-modal");
    const body = document.getElementById("report-modal-body");
    if (!R || !m || !body) return;
    this.reportId = id;
    body.innerHTML = R.incidentReportHtml(id);
    m.style.display = "flex";
};

UIManager.prototype.closeIncidentReport = function () {
    const m = document.getElementById("report-modal");
    if (m) m.style.display = "none";
    this.reportId = null;
};

/** 報告書を文字だけのファイルで保存する */
UIManager.prototype.saveIncidentReport = function () {
    const R = this.game.records;
    if (!R || !this.reportId) return;
    const text = R.incidentReportText(this.reportId);
    const rec = R.incidents.find(r => r.id === this.reportId);
    try {
        const blob = new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "輸送障害報告_" + (rec ? rec.no : this.reportId) + ".txt";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { /* 保存できない環境では何もしない */ }
};
