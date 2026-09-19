/* Super-TID の「編成検索・行路表」。

   ■ 何をする画面か
     編成番号 (W1 / ホシW1 / S60 など) を入れると、その編成の
       ・形式・両数・所属・備考         (js/02-fleet-data.js の元データ)
       ・いまどこに居るか               (運用中の列車 / 留置場)
       ・その日の行路 (仕業のつながり)   (js/30-duty-log.js の記録)
     を出す。実際の行路表 (仕業表) と同じ読み方ができる。

   ■ 作り話をしない
     列車番号・始発駅・終着駅・時刻は、すべてシミュレーションで
     実際に起きたことの記録から出している。
     元データに無い編成番号は「該当なし」と出す。
     まだ動いていない編成は、行路の欄に「記録なし」と出す。

   ■ 記録が始まる前のこと
     このシミュレーターは 04:00 から始まるので、行路もそこからになる。
     始発より前の運用は存在しない。
*/

class TidDuty {
    constructor(game) {
        this.game = game;
        this.query = "";
        this.selected = null;     // いま開いている編成 (fullId)
        this.open = false;
        this.bind();
    }

    el(id) { return document.getElementById(id); }

    bind() {
        const on = (id, ev, fn) => {
            const e = this.el(id);
            if (e) e.addEventListener(ev, fn);
        };
        on("tid-duty-open", "click", () => this.toggle(true));
        on("tid-duty-close", "click", () => this.toggle(false));
        on("tid-duty-go", "click", () => this.search());
        on("tid-duty-q", "keydown", (e) => { if (e.key === "Enter") this.search(); });
        on("tid-duty-q", "input", () => this.renderHints());
        // 選択中の列車の編成をそのまま引く
        on("tid-duty-cur", "click", () => this.fromSelectedTrain());
    }

    toggle(v) {
        this.open = (v === undefined) ? !this.open : v;
        const p = this.el("tid-duty");
        if (p) p.classList.toggle("is-on", this.open);
        if (this.open) {
            const q = this.el("tid-duty-q");
            if (q) q.focus();
            this.render();
        }
    }

    /** 線路図で選んでいる列車の編成を引く */
    fromSelectedTrain() {
        const t = this.game.tidUI ? this.game.tidUI.selected() : null;
        if (!t || !t.vehicles || !t.vehicles.length) {
            this.setMessage("列車を選んでから押してください。");
            return;
        }
        const q = this.el("tid-duty-q");
        if (q) q.value = t.vehicles[0].fullId || t.vehicles[0].id;
        this.search();
    }

    setMessage(m) {
        const e = this.el("tid-duty-body");
        if (e) e.innerHTML = '<p class="tid-empty">' + escapeLogHtml(m) + "</p>";
    }

    /** 入力の途中で候補を出す */
    renderHints() {
        const q = this.el("tid-duty-q");
        const e = this.el("tid-duty-hints");
        if (!q || !e) return;
        const v = q.value.trim();
        if (v.length < 1) { e.innerHTML = ""; return; }
        const list = dutyFindFleets(v, 8);
        e.innerHTML = list.map(f =>
            '<button class="tid-duty-hint" data-id="' + escapeLogHtml(f.fullId) + '">' +
            escapeLogHtml(f.fullId) + "</button>").join("");
        Array.prototype.forEach.call(e.querySelectorAll(".tid-duty-hint"), b => {
            b.addEventListener("click", () => {
                q.value = b.getAttribute("data-id");
                this.search();
            });
        });
    }

    search() {
        const q = this.el("tid-duty-q");
        this.query = q ? q.value.trim() : "";
        const list = dutyFindFleets(this.query, 12);
        const hints = this.el("tid-duty-hints");
        if (hints) hints.innerHTML = "";
        if (!list.length) {
            this.selected = null;
            this.setMessage("「" + this.query + "」に当てはまる編成は在籍表にありません。" +
                "編成番号 (例: W1 / ホシW1 / S60 / MA05) を入れてください。");
            return;
        }
        this.selected = list[0].fullId;
        this.render();
    }

    /** 1秒ごとに呼ばれる (開いているときだけ描き直す) */
    tick() { if (this.open && this.selected) this.render(); }

    render() {
        const e = this.el("tid-duty-body");
        if (!e) return;
        if (!this.selected) {
            e.innerHTML = '<p class="tid-empty">編成番号を入れて「検索」を押してください。' +
                "（例: W1 / ホシW1 / S60 / MA05 / V4）</p>";
            return;
        }
        const info = dutyFindFleets(this.selected, 1)[0];
        if (!info) { this.setMessage("編成が見つかりません。"); return; }

        const game = this.game;
        const t = dutyTrainOf(game, info.fullId);
        const depot = t ? null : dutyDepotOf(game, info.fullId);
        const rows = game.duty ? game.duty.rowsOf(info.fullId) : [];

        // --- いまの状態
        let now;
        if (t && t.state === "in_depot") {
            now = "留置中（" + escapeLogHtml(t.startName || "") + "）" +
                  (t.trainNo ? " 次運用 " + escapeLogHtml(t.trainNo) : "");
        } else if (t) {
            const blks = game.trackMgr.blocks[t.trackId];
            const blk = blks ? blks[t.currBlockIndex] : null;
            const where = blk ? (blockStationName(blk) || "駅間") : "—";
            now = '<span class="tid-mini" style="background:' +
                  ((TID_TYPE_COLORS[t.type] || {}).bg) + ";color:" +
                  ((TID_TYPE_COLORS[t.type] || {}).text) + '">' +
                  escapeLogHtml(t.trainNo) + "</span> " +
                  escapeLogHtml(t.type + " " + (t.dest || "")) +
                  " / " + escapeLogHtml(where);
        } else if (depot) {
            now = "留置中（" + escapeLogHtml(depot) + "）運用に入っていません";
        } else {
            now = "在線していません";
        }

        // --- 行路表
        let table;
        if (!rows.length) {
            table = '<p class="tid-empty">この編成の行路はまだ記録されていません。' +
                    "（記録はシミュレーション開始の 04:00 からです）</p>";
        } else {
            const body = rows.map(r => {
                const no = r.kind === "depot" ? "（留置）" : (r.no || "—");
                const col = TID_TYPE_COLORS[r.type] || { bg: "#8A93A8", text: "#fff" };
                const chip = r.kind === "depot"
                    ? '<span class="tid-mini tid-duty-rest">留置</span>'
                    : '<span class="tid-mini" style="background:' + col.bg + ";color:" + col.text +
                      '">' + escapeLogHtml(no) + "</span>";
                const time = dutyTime(r.dep) + " – " + (r.arr === null ? "運転中" : dutyTime(r.arr));
                return "<tr>" +
                    "<td>" + escapeLogHtml(time) + "</td>" +
                    "<td>" + chip + "</td>" +
                    "<td>" + escapeLogHtml(r.type || "") + "</td>" +
                    "<td>" + escapeLogHtml(r.from || "—") + "</td>" +
                    "<td>" + escapeLogHtml(r.to || "—") + "</td>" +
                    '<td class="tid-duty-link">' + escapeLogHtml(r.link || "") + "</td>" +
                    "</tr>";
            }).join("");
            table =
                '<table class="tid-table tid-duty-table">' +
                "<thead><tr><th>時刻</th><th>列車番号</th><th>種別</th>" +
                "<th>始発</th><th>終着</th><th>つながり</th></tr></thead>" +
                "<tbody>" + body + "</tbody></table>";
        }

        // --- 流れ (行路のつながりをひと目で)
        const flow = rows.filter(r => r.kind === "run").map(r =>
            "<li>" + escapeLogHtml(r.no || "—") + "： " +
            escapeLogHtml(r.from || "—") + " → " + escapeLogHtml(r.to || "—") +
            '<span class="tid-duty-t">' + dutyTime(r.dep) +
            (r.arr === null ? "〜運転中" : "〜" + dutyTime(r.arr)) + "</span></li>").join("");

        const other = dutyFindFleets(this.query, 12)
            .filter(f => f.fullId !== info.fullId).slice(0, 8);

        e.innerHTML =
            '<div class="tid-duty-head">' +
                '<b class="tid-duty-id">' + escapeLogHtml(info.fullId) + "</b>" +
                "<span>" + escapeLogHtml(info.type) + " " + info.cars + "両</span>" +
                "<span>" + escapeLogHtml(info.base) + "</span>" +
            "</div>" +
            '<div class="tid-kv"><span>現在</span><b>' + now + "</b></div>" +
            (info.notes ? '<div class="tid-note">' + escapeLogHtml(info.notes) + "</div>" : "") +
            (other.length
                ? '<div class="tid-duty-other">ほかの候補: ' + other.map(f =>
                    '<button class="tid-duty-hint" data-id="' + escapeLogHtml(f.fullId) + '">' +
                    escapeLogHtml(f.fullId) + "</button>").join("") + "</div>"
                : "") +
            '<div class="tid-station-sub">行路 (本日の運用)</div>' +
            table +
            (flow ? '<div class="tid-station-sub">運用のつながり</div>' +
                    '<ol class="tid-duty-flow">' + flow + "</ol>" : "");

        Array.prototype.forEach.call(e.querySelectorAll(".tid-duty-hint"), b => {
            b.addEventListener("click", () => {
                const q = this.el("tid-duty-q");
                if (q) q.value = b.getAttribute("data-id");
                this.search();
            });
        });
    }
}
