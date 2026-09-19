/* Super-TID の「指令連絡」パネル。

   現場 (乗務員・駅・保線・信号通信区・車両所) から届いた連絡を並べ、
   指令 (画面の人) が答えを選べるようにする。
   仕組みそのものは js/31-comms.js にあり、ここはその窓口。

   ■ 見え方
     連絡ごとに
       [発信元] 見出し
       本文
       [答えのボタン]×2〜4      … それぞれの下に、その処置の意味を小さく書く
       残り時間のバー
     を出す。残り時間が 0 になると、別の指令員が引き取って処理し、
     連絡は一覧から消える (記録には残る)。

   ■ 2画面で開いているとき
     シミュレーション本体でない画面 (従) でも一覧は見える。
     答えは js/28-dispatch.js を通して本体へ転送される。
*/

class TidComms {
    constructor(game) {
        this.game = game;
        this.bind();
    }

    el(id) { return document.getElementById(id); }

    bind() {
        const box = this.el("tid-comm-list");
        if (!box) return;
        // ボタンは描き直すたびに作り直すので、まとめて受ける
        box.addEventListener("click", (e) => {
            const b = e.target.closest ? e.target.closest(".tid-comm-btn") : null;
            if (!b) return;
            this.respond(b.getAttribute("data-id"), b.getAttribute("data-key"));
        });
    }

    /** いま届いている連絡 (本体でも従でも同じ形で取れる) */
    list() {
        if (this.game.bus && !this.game.bus.isHost) return this.game.bus.commList();
        return this.game.comms ? this.game.comms.list() : [];
    }

    respond(id, key) {
        if (!id || !key) return;
        const r = this.game.dispatch({ name: "comm", commId: id, option: key });
        if (this.game.tidUI) {
            this.game.tidUI.notify((r && r.msg) || "指令を通達しました。");
        }
        this.render();
    }

    /** 1秒ごとに呼ばれる */
    render() {
        const box = this.el("tid-comm-list");
        if (!box) return;
        const rows = this.list();

        const badge = this.el("tid-comm-count");
        if (badge) {
            badge.textContent = rows.length ? String(rows.length) : "";
            badge.classList.toggle("is-on", rows.length > 0);
        }

        if (!rows.length) {
            box.innerHTML = '<p class="tid-empty">現場からの連絡はありません。' +
                "（連絡が入ると、ここで指令の判断を選べます）</p>";
            return;
        }

        box.innerHTML = rows.map(p => {
            const src = LOG_SOURCES[p.cat] || LOG_SOURCES.unten;
            const pct = Math.max(0, Math.min(100, Math.round(p.remain * 100 / (p.limit || 1))));
            const urgent = p.remain <= 20;
            return '<div class="tid-comm' + (urgent ? " is-urgent" : "") + '">' +
                '<div class="tid-comm-head">' +
                    '<span class="tid-log-chip" style="background:' + src.hue + '">' +
                        src.tag + "</span>" +
                    '<span class="tid-comm-from">' + escapeLogHtml(p.from) + "</span>" +
                    '<span class="tid-comm-title">' + escapeLogHtml(p.title) + "</span>" +
                    '<span class="tid-comm-remain">残り ' + p.remain + "秒</span>" +
                "</div>" +
                '<div class="tid-comm-text">' + escapeLogHtml(p.text) + "</div>" +
                '<div class="tid-comm-opts">' +
                    p.options.map(o =>
                        '<button class="tid-comm-btn" data-id="' + escapeLogHtml(p.id) +
                        '" data-key="' + escapeLogHtml(o.key) + '">' +
                        '<b>' + escapeLogHtml(o.label) + "</b>" +
                        (o.hint ? "<i>" + escapeLogHtml(o.hint) + "</i>" : "") +
                        "</button>").join("") +
                "</div>" +
                '<div class="tid-comm-bar"><i style="width:' + pct + '%"></i></div>' +
                '<div class="tid-comm-note">応答がないときは、他の指令員が引き取って処理します。</div>' +
                "</div>";
        }).join("");
    }
}
