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
        // 行路表の列車番号を押すと、その列車の運転の記録 (着発・経路・遅れ・抑止) を出す
        on("tid-duty-body", "click", (e) => {
            const b = e.target.closest ? e.target.closest("[data-duty-train]") : null;
            if (b) { this.showTrain(b.getAttribute("data-duty-train")); return; }
            const back = e.target.closest ? e.target.closest("[data-duty-back]") : null;
            if (back) { this.trainNo = null; this.render(); }
        });
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
        const groups = dutyFleetGroups(this.filter, this.game);
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
                ? n + " / " + dutyKnownFleets(this.game).length + " 本"
                : "在籍 " + dutyFleetCount() + " 本 ＋ 所属なし・専用編成など " + (dutyKnownFleets(this.game).length - dutyFleetCount()) + " 本";
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
        const groups = dutyFleetGroups(this.filter, this.game);
        if (!groups.length || !groups[0].items.length) {
            this.selected = null;
            this.setMessage("「" + this.filter + "」に当てはまる編成は在籍表にありません。" +
                "編成番号 (例: W1 / ホシW1 / S60) か、形式・所属 (例: 223系 / 網干) を入れてください。");
            return;
        }
        /* 絞り込みの文字とちょうど同じ編成があれば、それを優先する。
           (「W1」と入れたときに W1 ではなく W10 が選ばれないように) */
        const exact = dutyFindFleets(this.filter, 1, this.game)[0];
        this.selected = exact ? exact.fullId : groups[0].items[0].fullId;
        const sel = this.el("tid-duty-sel");
        if (sel) sel.value = this.selected;
        this.render();
    }

    /** 線路図で選んでいる列車の編成を引く */
    fromSelectedTrain() {
        const t = this.game.tidUI ? this.game.tidUI.selected() : null;
        if (!t) { this.setMessage("線路図で列車を選んでから押してください。"); return; }
        // 編成の付いていない列車も、列車の記録として出す
        if (!t.vehicles || !t.vehicles.length) { this.showTrain(t.trainNo); return; }
        this.trainNo = null;
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
    tick() { if (this.open && (this.selected || this.trainNo)) this.render(); }

    /** 列車の運転の記録を出す */
    showTrain(no) {
        this.trainNo = no;
        this.render();
    }

    /* ------------------------------------------------------------ 列車の詳細
       js/30-duty-log.js の trackTrains が書き留めた記録から作る (作り話はしない)。 */
    renderTrain(e) {
        const game = this.game, esc = escapeLogHtml;
        const no = this.trainNo;
        const L = game.duty && game.duty.trainRecord ? game.duty.trainRecord(no) : null;
        const t = game.trains.find(x => x.trainNo === no && x.state !== "finished");
        const back = '<button class="tid-btn" data-duty-back="1" type="button">← 編成の行路へ戻る</button>';
        if (!L && !t) { e.innerHTML = back + '<p class="tid-empty">列車 ' + esc(no) + ' の記録はありません。</p>'; return; }
        const col = TID_TYPE_COLORS[(t || L).type] || {};
        const now = game.currentTime;
        let status = "運転を終えています";
        if (t) {
            const blk = (game.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
            const where = blk ? (blockStationName(blk) || commWhere(game, t)) : "—";
            const names = { running: "走行中", stopped: "停車中", holding: "停止 (" + dutyHoldReason(game, t) + ")",
                            waiting_start: "発車待ち", turning_back: "折り返し中", in_depot: "留置中" };
            const pl = trainPlatformLabel(game, t);
            status = esc(where) + " / " + esc(names[t.state] || t.state) + (pl ? " / " + esc(pl) : "");
        }
        const delayMin = Math.floor(((t ? t.delayTime : L.delay) || 0) / 60);
        const evs = L ? L.events : [];
        const rows = evs.map(ev => "<tr" + (ev.stop ? "" : ' class="is-pass"') + ">" +
            "<td>" + esc(ev.st) + "</td>" +
            "<td>" + (ev.stop ? esc(dutyTime(ev.arr)) : "") + "</td>" +
            "<td>" + (ev.stop ? (ev.dep === null ? "停車中" : esc(dutyTime(ev.dep))) : esc(dutyTime(ev.arr)) + " 通過") + "</td>" +
            "<td>" + esc(ev.plat || "") + "</td>" +
            "<td>" + (ev.delayMin ? ev.delayMin + "分延" : "") + "</td></tr>").join("");
        let ahead = "";
        if (t && t.state !== "in_depot") {
            const last = evs.length ? evs[evs.length - 1].st : null;
            const list = trainStationsAhead(game, t, 30).filter(n => n !== last);
            const per = (typeof BLOCK_RUN_SEC !== "undefined" && BLOCK_RUN_SEC[t.type]) || 48;
            let sec = Math.max(0, t.timer || 0), prevIdx = t.currBlockIndex;
            const blks = game.trackMgr.blocks[t.trackId] || [];
            ahead = list.map(n => {
                const b = blks.find(x => x.x !== -1000 && isRealStationBlock(x) && blockStationName(x) === n);
                if (b) { sec += Math.abs(b.index - prevIdx) * per; prevIdx = b.index; }
                let stops = false;
                try {
                    const stObj = (STATION_MAP[n] !== undefined && STATIONS[STATION_MAP[n]] && STATIONS[STATION_MAP[n]].name === n)
                        ? STATIONS[STATION_MAP[n]] : { name: n };
                    stops = n === t.dest || t.shouldStop(stObj);
                } catch (x) { stops = false; }
                const at = now + sec;
                if (stops) sec += 40;
                return "<tr" + (stops ? "" : ' class="is-pass"') + "><td>" + esc(n) + "</td><td>" +
                       (stops ? esc(dutyTime(at)) + "頃" : "通過") + "</td><td>" + (n === t.dest ? "終着" : "") + "</td></tr>";
            }).join("");
        }
        const holds = (L ? L.holds : []).slice().reverse().slice(0, 15).map(h =>
            "<tr><td>" + esc(dutyTime(h.at)) + "</td><td>" + esc(h.where || "") + "</td><td>" + esc(h.reason) + "</td><td>" +
            (h.until === null ? "継続中 " + Math.round((now - h.at) / 60) + "分" : Math.max(1, Math.round((h.until - h.at) / 60)) + "分") +
            "</td></tr>").join("");
        const route = L ? esc(L.start || "—") + " → " + esc((t ? t.dest : L.dest) || "—") : "—";
        const kv = (k, v) => '<div class="tid-kv"><span>' + k + "</span><b>" + v + "</b></div>";
        e.innerHTML = back +
            '<div class="tid-duty-head"><span class="tid-mini" style="background:' + (col.bg || "#666") + ";color:" + (col.text || "#fff") + '">' +
            esc(no) + "</span><span>" + esc((t || L).type) + "</span><span>" + route + "</span></div>" +
            kv("現在", status) +
            kv("遅れ", delayMin ? delayMin + "分" : "定時") +
            (L && L.vehicles.length ? kv("編成", esc(L.vehicles.join("+"))) : "") +
            (t && t.serviceChange ? kv("運用の変更", esc(t.serviceChange.at + "で " + t.serviceChange.name + " " + t.serviceChange.dest + "行きに")) : "") +
            '<div class="tid-station-sub">着発の記録</div>' +
            (rows ? '<table class="tid-table tid-duty-table"><thead><tr><th>駅</th><th>着</th><th>発</th><th>番線</th><th>遅れ</th></tr></thead><tbody>' + rows + "</tbody></table>"
                  : '<p class="tid-empty">まだ駅に着いていません。</p>') +
            (ahead ? '<div class="tid-station-sub">これから (経路と着く見込み)</div><table class="tid-table tid-duty-table"><thead><tr><th>駅</th><th>着く見込み</th><th></th></tr></thead><tbody>' + ahead + "</tbody></table>" : "") +
            '<div class="tid-station-sub">止められた場所と理由 (抑止・信号・見合わせ)</div>' +
            (holds ? '<table class="tid-table tid-duty-table"><thead><tr><th>時刻</th><th>場所</th><th>理由</th><th>長さ</th></tr></thead><tbody>' + holds + "</tbody></table>"
                   : '<p class="tid-empty">止められたことはありません。</p>');
    }

    // ============================================================ 行路表
    render() {
        const e = this.el("tid-duty-body");
        if (!e) return;
        if (this.trainNo) { this.renderTrain(e); return; }
        if (!this.selected) {
            e.innerHTML = '<p class="tid-empty">上の一覧から編成を選んでください。' +
                "（絞り込み欄に W / 223系 / 網干 などを入れると一覧が短くなります）</p>";
            return;
        }
        const info = dutyFindFleets(this.selected, 1, this.game)[0];
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
                // 列車番号は押せる (その列車の着発・経路・遅れ・抑止を出す)
                const chip = r.kind === "depot"
                    ? '<span class="tid-mini tid-duty-rest">留置</span>'
                    : '<button type="button" class="tid-mini tid-duty-train" data-duty-train="' + escapeLogHtml(r.no || "") +
                      '" title="この列車の着発・経路・遅れ・抑止を見る" style="background:' + col.bg + ";color:" + col.text +
                      '">' + escapeLogHtml(no) + "</button>";
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
                "<span>" + escapeLogHtml(info.base || "所属なし") + "</span>" +
            "</div>" +
            '<div class="tid-kv"><span>現在</span><b>' + now + "</b></div>" +
            (info.notes ? '<div class="tid-note">' + escapeLogHtml(info.notes) + "</div>" : "") +
            '<div class="tid-station-sub">行路 (本日の運用)</div>' +
            table +
            (flow ? '<div class="tid-station-sub">運用のつながり</div>' +
                    '<ol class="tid-duty-flow">' + flow + "</ol>" : "");
    }
}
