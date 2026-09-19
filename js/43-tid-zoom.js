/* 線路図全体の拡大縮小と移動。

   ■ なぜ要るか
     1駅の間隔を実物に近い長さに戻したので、広く見渡せるかわりに
     大きな駅の中 (番線・ホーム・渡り線・列車表示) は小さくなる。
     指令の画面としては「全体を見る」と「一駅を細かく見る」の
     両方が要るので、線路図そのものを拡大縮小できるようにした。

   ■ できること
       ・拡大 / 縮小 / 等倍に戻す (画面のボタン、キーの + - 0)
       ・Ctrl (Mac は ⌘) を押しながらのホイールで、指した場所を中心に拡大縮小
       ・タブレットの2本指つまみ (ピンチ) で拡大縮小
       ・ドラッグ (マウス) と1本指のなぞり (タッチ) で移動
     拡大縮小は線路図ぜんぶに掛かる。画面の部品 (指令パッド・一覧) は
     そのままなので、iPad でも操作しづらくならない。

   ■ 作り
     拡大率は TidRenderer が持ち (renderer.zoom)、描画の行列とスクロール量に
     反映される。このファイルは操作を受け取って renderer.setZoom() を呼ぶだけ。
     こうしておくと、描画の都合と操作の都合が混ざらない。
*/

const TID_ZOOM_STEPS = [0.4, 0.5, 0.65, 0.8, 1.0, 1.25, 1.6, 2.0, 2.5, 3.2, 4.0];

class TidZoom {
    constructor(renderer) {
        this.renderer = renderer;
        this.scroll = document.getElementById("tid-scroll");
        this.label = document.getElementById("tid-zoom-val");
        this.pinch = null;       // 2本指つまみの途中の状態
        this.drag = null;        // ドラッグ移動の途中の状態
        this.bind();
        this.render();
    }

    /** いまの拡大率 */
    get value() { return this.renderer.zoom; }

    /** 画面のボタンなどから呼ぶ */
    set(z, ax, ay) {
        this.renderer.setZoom(z, ax, ay);
        this.render();
    }

    /** 1段階ずつ拡大縮小する */
    step(dir) {
        const cur = this.value;
        const list = TID_ZOOM_STEPS;
        let next = cur;
        if (dir > 0) next = list.find(v => v > cur + 0.001) || list[list.length - 1];
        else { for (const v of list) if (v < cur - 0.001) next = v; }
        this.set(next);
    }

    reset() { this.set(1.0); }

    /** 画面いっぱいに線路図の高さを収める */
    fitHeight() {
        const h = this.renderer.height;
        const v = this.renderer.viewH;
        if (!h || !v) return;
        this.set(Math.max(0.4, Math.min(4.0, (v - 8) / h)));
    }

    render() {
        if (this.label) this.label.textContent = Math.round(this.value * 100) + "%";
    }

    /** 入れ物の左上を基準にした座標へ直す */
    local(clientX, clientY) {
        const r = this.scroll.getBoundingClientRect();
        return { x: clientX - r.left, y: clientY - r.top };
    }

    bind() {
        const on = (id, fn) => {
            const e = document.getElementById(id);
            if (e) e.addEventListener("click", fn);
        };
        on("tid-zoom-in", () => this.step(+1));
        on("tid-zoom-out", () => this.step(-1));
        on("tid-zoom-reset", () => this.reset());
        on("tid-zoom-fit", () => this.fitHeight());

        // --- Ctrl (⌘) + ホイールで、指した場所を中心に拡大縮小
        this.scroll.addEventListener("wheel", (e) => {
            if (!e.ctrlKey && !e.metaKey) return;      // ふつうのホイールはスクロール
            e.preventDefault();
            const p = this.local(e.clientX, e.clientY);
            const f = Math.exp(-e.deltaY * 0.0015);
            this.set(this.value * f, p.x, p.y);
        }, { passive: false });

        // --- キーボード ( + - 0 )
        document.addEventListener("keydown", (e) => {
            const tag = (e.target && e.target.tagName) || "";
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
            if (e.key === "+" || e.key === ";" || e.key === "=") { this.step(+1); e.preventDefault(); }
            else if (e.key === "-") { this.step(-1); e.preventDefault(); }
            else if (e.key === "0") { this.reset(); e.preventDefault(); }
        });

        // --- 2本指つまみ (タブレット)
        this.scroll.addEventListener("touchstart", (e) => {
            if (e.touches.length !== 2) { this.pinch = null; return; }
            this.pinch = this.readPinch(e);
        }, { passive: true });

        this.scroll.addEventListener("touchmove", (e) => {
            if (e.touches.length !== 2 || !this.pinch) return;
            const now = this.readPinch(e);
            if (this.pinch.dist < 12) return;
            e.preventDefault();
            this.set(this.pinch.zoom * (now.dist / this.pinch.dist), now.x, now.y);
        }, { passive: false });

        const endPinch = () => { this.pinch = null; };
        this.scroll.addEventListener("touchend", endPinch);
        this.scroll.addEventListener("touchcancel", endPinch);

        /* --- マウスのドラッグで移動 (指令卓らしく掴んで動かせるようにする)。
               タップで列車を選ぶ処理 (js/41-tid-render.js) は
               「10px以上動いたら選択しない」で守られているので、
               ここで動かしても列車選択とぶつからない。 */
        this.scroll.addEventListener("pointerdown", (e) => {
            if (e.pointerType !== "mouse" || e.button !== 0) return;
            this.drag = { x: e.clientX, y: e.clientY,
                          sl: this.scroll.scrollLeft, st: this.scroll.scrollTop };
        });
        this.scroll.addEventListener("pointermove", (e) => {
            if (!this.drag) return;
            this.scroll.scrollLeft = this.drag.sl - (e.clientX - this.drag.x);
            this.scroll.scrollTop = this.drag.st - (e.clientY - this.drag.y);
        });
        const endDrag = () => { this.drag = null; };
        this.scroll.addEventListener("pointerup", endDrag);
        this.scroll.addEventListener("pointercancel", endDrag);
        this.scroll.addEventListener("pointerleave", endDrag);
    }

    readPinch(e) {
        const a = e.touches[0], b = e.touches[1];
        const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
        const mid = this.local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        return { dist: Math.hypot(dx, dy), x: mid.x, y: mid.y, zoom: this.value };
    }
}
