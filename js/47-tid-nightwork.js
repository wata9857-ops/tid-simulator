/* Super-TID: 夜間作業の印と報告書 (利用者の指摘 ② 2026-10。js/38e-night-work-detail.js)

   ・線路閉鎖の区間 (橙の破線) と「線閉 第N号」の札を押すと、その作業の報告書を出す。
   ・駅・ホームの作業は、その駅のその線路に橙の「工」の印を出す (番線の使用停止は四角を塗る)。押すと報告書。
   ・輸送障害の欄の下に「今夜の夜間作業」を並べ、押すと報告書。 */

(function () {
    if (typeof TidRenderer === "undefined") return;

    /** 線路閉鎖・駅の作業の当たり判定を作り、駅の作業の印を描く (列車の下に描く) */
    function drawNightWorkMarks(r, ctx) {
        r.hitWorks = [];
        const tm = r.game.trackMgr;
        const rows = r.rows();
        const rowOf = (id) => rows.find(x => x.id === id);
        // 線路閉鎖の区間 (札と線の両方を押せるように)
        for (const c of (tm.workClosures || [])) {
            if (!rowOf(c.trackId)) continue;
            const blks = tm.blocks[c.trackId];
            if (!blks || !blks[c.start] || !blks[c.end]) continue;
            const bw = tidW(BLOCK_WIDTH);
            const xa = tidX(blks[c.start].x) - bw / 2, xb = tidX(blks[c.end].x) + bw / 2;
            const y = r.blockRailY(c.trackId, blks[c.start]);
            r.hitWorks.push({ x: Math.min(xa, xb), y: y - 22, w: Math.abs(xb - xa), h: 30, key: c.nwId || String(c.no) });
        }
        // 駅・ホームの作業
        for (const w of (tm.nwReports || [])) {
            if (!w.station || !w.active || !rowOf(w.trackId)) continue;
            const blk = (tm.blocks[w.trackId] || [])[w.index];
            if (!blk || blk.x === -1000) continue;
            const x = tidX(blk.x), y = r.blockRailY(w.trackId, blk);
            const s = 13;
            ctx.save();
            ctx.fillStyle = w.laneClosed ? "#FF8C00" : "rgba(255,140,0,0.25)";
            ctx.strokeStyle = "#FF8C00";
            ctx.lineWidth = 1.5;
            ctx.fillRect(x + 8, y - s - 6, s, s);
            ctx.strokeRect(x + 8, y - s - 6, s, s);
            ctx.fillStyle = w.laneClosed ? "#000" : "#FFB347";
            ctx.font = "bold 10px 'Meiryo UI', 'Yu Gothic', sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("工", x + 8 + s / 2, y - s / 2 - 6);
            ctx.restore();
            r.hitWorks.push({ x: x + 6, y: y - s - 8, w: s + 4, h: s + 4, key: w.id });
        }
    }

    const baseDrawTrains = TidRenderer.prototype.drawTrains;
    TidRenderer.prototype.drawTrains = function (ctx, xMin, xMax) {
        try { drawNightWorkMarks(this, ctx); } catch (e) { this.hitWorks = []; }
        return baseDrawTrains.call(this, ctx, xMin, xMax);
    };

    const basePick = TidRenderer.prototype.pick;
    TidRenderer.prototype.pick = function (clientX, clientY) {
        const p = this.toWorld(clientX, clientY);
        // 列車を先に (作業の列車・保守用車を押したときは列車の情報)
        for (const h of (this.hitTrains || [])) {
            if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return basePick.call(this, clientX, clientY);
        }
        for (const h of (this.hitWorks || [])) {
            if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
                showNightWorkReport(this.game, h.key);
                return;
            }
        }
        return basePick.call(this, clientX, clientY);
    };
})();

(function () {
    if (typeof TidUI === "undefined") return;
    const baseRender = TidUI.prototype.renderIncidents;
    TidUI.prototype.renderIncidents = function () {
        baseRender.call(this);
        const e = this.el("tid-incidents");
        if (!e) return;
        const list = (this.game.trackMgr && this.game.trackMgr.nwReports) || [];
        if (!this._nwBound) {
            this._nwBound = true;
            e.addEventListener("click", (ev) => {
                const b = ev.target.closest ? ev.target.closest("[data-nw]") : null;
                if (b) showNightWorkReport(this.game, b.getAttribute("data-nw"));
            });
        }
        if (!list.length) return;
        const esc = escapeLogHtml;
        // 作業中のものを上に。終わった・中止したものは下に
        const order = (r) => r.active ? 0 : /計画|申し込み|中断/.test(r.status) ? 1 : 2;
        const rows = list.slice().sort((a, b) => order(a) - order(b));
        // すべて終わった (昼のあいだ) は「昨夜」として出す。22時に今夜の作業に入れ替わる
        const tonight = list.some(r => r.active || /計画|申し込み|中断/.test(r.status));
        const html = `<div class="tid-nw"><div class="tid-nw-head"><b>${tonight ? "今夜" : "昨夜"}の夜間作業</b> ${list.length}件 ` +
            `<small>(押すと作業の報告)</small></div>` +
            rows.map(r => `<div class="tid-inc tid-nw-row" data-nw="${esc(r.id)}" style="cursor:pointer">` +
                `<span class="tid-inc-name">${r.no ? "線閉 第" + r.no + "号 " : (r.station ? "駅の作業 " : "")}${esc(r.kind)}</span>` +
                `<span class="tid-inc-place">${esc(r.place)}</span>` +
                `<span class="tid-inc-stage">${esc(r.status)}</span></div>`).join("") + `</div>`;
        // 「輸送障害はありません」の表示は残し、その下に足す
        if (e.insertAdjacentHTML) e.insertAdjacentHTML("beforeend", html);
        else e.innerHTML = (e.innerHTML || "") + html;
    };
})();
