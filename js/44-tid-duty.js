/* Super-TID の「編成検索・行路表」。

   ■ 何をする画面か
     編成を選ぶと、その編成の
       ・形式・両数・所属・備考         (js/02-fleet-data.js の在籍表)
       ・いまどこに居るか               (運用中の列車 / 留置場)
       ・その日の行路 (仕業のつながり)   (js/30-duty-log.js の記録)
     を出す。実際の行路表 (仕業表) と同じ読み方ができる。

   ■ 編成の選び方
     一覧 (プルダウン) から選びます。在籍は400本を超えるので、
       ・「所属 形式」ごとの見出し (optgroup) でまとめる
       ・編成番号は W1 → W2 → … → W10 の順に並べる (文字の順ではない)
       ・絞り込み欄に文字を入れると一覧がその場で短くなる
         (編成番号でも「223系」「網干」のような形式・所属でも引ける)
     一覧の中身は在籍表から作ります。画面側に編成番号を書き写すと、
     車両の増減に付いていけなくなるためです。

   ■ 作り話をしない
     列車番号・始発駅・終着駅・時刻は、すべてシミュレーションで
     実際に起きたことの記録から出しています。
     在籍表に無い編成番号は「該当なし」と出します。
     まだ動いていない編成は、行路の欄に「記録なし」と出します。

   ■ 記録が始まる前のこと
     このシミュレーターは 04:00 から始まるので、行路もそこからになります。
*/

class TidDuty {
    constructor(game) {
        this.game = game;
        this.filter = "";
        this.selected = null;     // いま開いている編成 (fullId)
        this.open = false;
        this.bind();
        this.fillSelect();
    }

    el(id) { return document.getElementById(id); }

    bind() {
        const on = (id, ev, fn) => {
            const e = this.el(id);
            if (e) e.addEventListener(ev, fn);
        };
        on("tid-duty-open", "click", () => this.toggle(true));
        on("tid-duty-close", "click", () => this.toggle(false));
        // 一覧から選ぶ
        on("tid-duty-sel", "change", () => {
            const v = this.el("tid-duty-sel").value;
            if (!v) { this.selected = null; this.render(); return; }
            this.selected = v;
            this.render();
        });
        // 絞り込み (入れたそばから一覧を短くする)
        on("tid-duty-q", "input", () => this.applyFilter());
        on("tid-duty-q", "keydown", (e) => { if (e.key === "Enter") this.pickFirst(); });
        on("tid-duty-go", "click", () => this.pickFirst());
        on("tid-duty-clear", "click", () => {
            const q = this.el("tid-duty-q");
            if (q) q.value = "";
            this.applyFilter();
        });
        // 線路図で選んでいる列車の編成をそのまま引く
        on("tid-duty-cur", "click", () => this.fromSelectedTrain());
    }

    toggle(v) {
        this.open = (v === undefined) ? !this.open : v;
        const p = this.el("tid-duty");
        if (p) p.classList.toggle("is-on", this.open);
        if (this.open) this.render();
    }

    // ============================================================ 編成の一覧
    /** 在籍表から一覧 (プルダウン) を作る */
    fillSelect() {
        const sel = this.el("tid-duty-sel");
        if (!sel) return;
        const groups = dutyFleetGroups(this.filter);
        const keep = this.selected;
        let n = 0;
        let html = '<option value="">' +
            (groups.length ? "編成を選んでください" : "該当する編成がありません") + "</option>";
        groups.forEach(g => {
            html += '<optgroup label="' + escapeLogHtml(g.label) + '">';
            g.items.forEach(v => {
                n++;
                html += '<option value="' + escapeLogHtml(v.fullId) + '">' +
                    escapeLogHtml(v.fullId) + "　" + v.cars + "両</option>";
            });
            html += "</optgroup>";
        });
        sel.innerHTML = html;
        // 絞り込みで消えていなければ、選んでいた編成をそのまま残す
        if (keep) sel.value = keep;

        const info = this.el("tid-duty-count");
        if (info) {
            info.textContent = this.filter
                ? n + " / " + dutyFleetCount() + " 本"
                : "在籍 " + dutyFleetCount() + " 本";
        }
    }

    applyFilter() {
        const q = this.el("tid-duty-q");
        this.filter = q ? q.value.trim() : "";
        this.fillSelect();
    }

    /** 絞り込んだ一覧のいちばん上を選ぶ (検索ボタン / Enter) */
    pickFirst() {
        this.applyFilter();
        const groups = dutyFleetGroups(this.filter);
        if (!groups.length || !groups[0].items.length) {
            this.selected = null;
            this.setMessage("「" + this.filter + "」に当てはまる編成は在籍表にありません。" +
                "編成番号 (例: W1 / ホシW1 / S60) か、形式・所属 (例: 223系 / 網干) を入れてください。");
            return;
        }
        /* 絞り込みの文字とちょうど同じ編成があれば、それを優先する。
           (「W1」と入れたときに W1 ではなく W10 が選ばれないように) */
        const exact = dutyFindFleets(this.filter, 1)[0];
        this.selected = exact ? exact.fullId : groups[0].items[0].fullId;
        const sel = this.el("tid-duty-sel");
        if (sel) sel.value = this.selected;
        this.render();
    }

    /** 線路図で選んでいる列車の編成を引く */
    fromSelectedTrain() {
        const t = this.game.tidUI ? this.game.tidUI.selected() : null;
        if (!t || !t.vehicles || !t.vehicles.length) {
            this.setMessage("線路図で列車を選んでから押してください。");
            return;
        }
        const id = t.vehicles[0].fullId || t.vehicles[0].id;
        // 一覧から消えていると選べないので、絞り込みを解除してから合わせる
        const q = this.el("tid-duty-q");
        if (q) q.value = "";
        this.filter = "";
        this.fillSelect();
        this.selected = id;
        const sel = this.el("tid-duty-sel");
        if (sel) sel.value = id;
        this.render();
    }

    setMessage(m) {
        const e = this.el("tid-duty-body");
        if (e) e.innerHTML = '<p class="tid-empty">' + escapeLogHtml(m) + "</p>";
    }

    /** 1秒ごとに呼ばれる (開いているときだけ描き直す) */
    tick() { if (this.open && this.selected) this.render(); }

    // ============================================================ 行路表
    render() {
        const e = this.el("tid-duty-body");
        if (!e) return;
        if (!this.selected) {
            e.innerHTML = '<p class="tid-empty">上の一覧から編成を選んでください。' +
                "（絞り込み欄に W / 223系 / 網干 などを入れると一覧が短くなります）</p>";
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

        e.innerHTML =
            '<div class="tid-duty-head">' +
                '<b class="tid-duty-id">' + escapeLogHtml(info.fullId) + "</b>" +
                "<span>" + escapeLogHtml(info.type) + " " + info.cars + "両</span>" +
                "<span>" + escapeLogHtml(info.base) + "</span>" +
            "</div>" +
            '<div class="tid-kv"><span>現在</span><b>' + now + "</b></div>" +
            (info.notes ? '<div class="tid-note">' + escapeLogHtml(info.notes) + "</div>" : "") +
            '<div class="tid-station-sub">行路 (本日の運用)</div>' +
            table +
            (flow ? '<div class="tid-station-sub">運用のつながり</div>' +
                    '<ol class="tid-duty-flow">' + flow + "</ol>" : "");
    }
}
