/* Super-TID の線路図を描く。

   ■ 旅客向けの線路図 (js/17-renderer.js) との違い
     * 上下の並びが実物と同じ (下りが上、上りが下)
     * 軌道回路 (閉塞) の境目、在線、信号機、進路を描く
     * ホーム・番線番号・分岐 (渡り線) を描く
     * 表示する内容を切り替えられる (信号 / 在線 / 編成番号 / 進路)

   ■ 描き方
     旅客向けと同じく「画面ぶんのキャンバス」に、スクロール量ぶん
     平行移動して描く。iPad のキャンバス面積の上限に掛からない。

   ■ シミュレーションとのつながり
     表示している在線・信号・進路は、すべて
     TrackManager のブロック と SignalSystem から取っている。
     見た目だけの飾りは無い。
*/

class TidRenderer {
    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById("tid-canvas");
        this.ctx = this.canvas.getContext("2d");
        this.scroll = document.getElementById("tid-scroll");

        this.viewW = 0; this.viewH = 0; this.dpr = 1;

        /* 線路図全体の拡大率。1.0 が既定。
           操作は js/43-tid-zoom.js (ボタン・Ctrl+ホイール・2本指つまみ) が受け持つ。
           ここでは「線路図の座標 × zoom ＝ スクロールする中身の座標」という
           約束だけを持つ。 */
        this.zoom = 1;

        // 表示の切り替え (画面の「表示」メニューから変える)
        this.show = { signal: true, occupy: true, fleet: true, route: true,
                      platform: true, predict: true };

        /* 表示する線区。全線を縦に並べると長くなりすぎるので、
           実物の Super-TID と同じように線区ごとに切り替える。 */
        this.areaId = "main";
        this.trackY = buildTidTrackY(TID_AREAS[0].groups);
        this.height = this.trackY.__height;

        // クリックできるもの
        this.hitStations = [];
        this.hitTrains = [];
        this.hitDepots = [];

        this.applyArea("main");
        this.resize();

        if (typeof window !== "undefined" && window.addEventListener) {
            window.addEventListener("resize", () => { this.resize(); this.draw(); });
        }
        /* 縦にスクロールしたときも描き直す。
           メインループは横のスクロール量しか見ていないので、
           拡大したときに縦へ動かすと画面が付いてこなかった。 */
        this.scroll.addEventListener("scroll", () => this.draw(), { passive: true });

        // タップ判定 (なぞってスクロールしたときは反応させない)
        let downX = 0, downY = 0, moved = false;
        const start = (x, y) => { downX = x; downY = y; moved = false; };
        const move = (x, y) => { if (Math.abs(x - downX) > 10 || Math.abs(y - downY) > 10) moved = true; };
        this.scroll.addEventListener("pointerdown", (e) => start(e.clientX, e.clientY));
        this.scroll.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
        this.scroll.addEventListener("touchstart", (e) => {
            if (e.touches && e.touches[0]) start(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        this.scroll.addEventListener("touchmove", (e) => {
            if (e.touches && e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        this.scroll.addEventListener("click", (e) => {
            if (moved) { moved = false; return; }
            this.pick(e.clientX, e.clientY);
        });
    }

    /** 表示する線区を切り替える */
    applyArea(areaId) {
        const area = TID_AREAS.find(a => a.id === areaId) || TID_AREAS[0];
        this.areaId = area.id;
        this.trackY = buildTidTrackY(area.groups);
        this.height = this.trackY.__height;
        this.applySpacer();
        this.buildStationHits();
        this.draw();
    }

    /** いま表示している線路だけを返す */
    rows() { return this.trackY.__rows || []; }

    resize() {
        const w = Math.max(320, this.scroll.clientWidth || 1200);
        const h = Math.max(240, this.scroll.clientHeight || 700);
        this.dpr = Math.min(MAX_DEVICE_PIXEL_RATIO,
            (typeof window !== "undefined" && window.devicePixelRatio) || 1);
        this.viewW = w; this.viewH = h;
        this.canvas.width = Math.floor(w * this.dpr);
        this.canvas.height = Math.floor(h * this.dpr);
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
    }

    /** スクロールする中身の大きさ (線路図の大きさ × 拡大率) を入れ物に伝える */
    applySpacer() {
        const spacer = document.getElementById("tid-spacer");
        if (!spacer) return;
        spacer.style.width = Math.round(tidTotalWidth() * this.zoom) + "px";
        spacer.style.height = Math.round(this.height * this.zoom) + "px";
    }

    /** いま画面に映っている範囲 (線路図の座標) */
    viewport() {
        const z = this.zoom || 1;
        const left = (this.scroll.scrollLeft || 0) / z;
        const top = (this.scroll.scrollTop || 0) / z;
        return { left: left, top: top, right: left + this.viewW / z, bottom: top + this.viewH / z };
    }

    toWorld(clientX, clientY) {
        const rect = this.scroll.getBoundingClientRect();
        const z = this.zoom || 1;
        return {
            x: ((clientX - rect.left) + (this.scroll.scrollLeft || 0)) / z,
            y: ((clientY - rect.top) + (this.scroll.scrollTop || 0)) / z
        };
    }

    /**
     * 拡大率を変える。
     *   z       … 新しい拡大率
     *   anchor  … 画面上のこの点 (入れ物の左上からの px) を動かさない。
     *             省略すると画面の中央を動かさない。
     */
    setZoom(z, anchorX, anchorY) {
        const lo = 0.4, hi = 4.0;
        const nz = Math.min(hi, Math.max(lo, z));
        if (Math.abs(nz - this.zoom) < 0.0001) return;
        const ax = (anchorX === undefined) ? this.viewW / 2 : anchorX;
        const ay = (anchorY === undefined) ? this.viewH / 2 : anchorY;
        // その点が指している線路図の座標を保ったままスクロール位置を付け替える
        const wx = ((this.scroll.scrollLeft || 0) + ax) / this.zoom;
        const wy = ((this.scroll.scrollTop || 0) + ay) / this.zoom;
        this.zoom = nz;
        this.applySpacer();
        this.scroll.scrollLeft = Math.max(0, wx * nz - ax);
        this.scroll.scrollTop = Math.max(0, wy * nz - ay);
        this.draw();
    }

    /** 指定のワールド座標へスクロールする (画面の中央に来るように) */
    scrollToStation(name) {
        const idx = STATION_MAP[name];
        if (idx === undefined) return;
        this.scroll.scrollLeft = Math.max(0, tidStationX(idx) * this.zoom - this.viewW / 2);
    }

    // ============================================================ 当たり判定
    buildStationHits() {
        /* 当たり判定は、札を描く位置とまったく同じ計算を使う
           (drawStations の plateYsFor)。別に持つとずれる。 */
        this.hitStations = [];
        const add = (name, x, y) => {
            const w = Math.max(TID_GEO.plateW, name.length * 15 + 22);
            this.hitStations.push({ name: name, x: x - w / 2, y: y - 11, w: w, h: 22 });
        };
        const bands = this.groupBands();
        STATIONS.forEach((st, i) => {
            const x = tidStationX(i);
            bands.forEach(band => {
                if (band.group === "北方貨物線") return;
                const name = this.stationNameOn(band.group, i);
                if (!name) return;
                const ys = this.plateYsFor(band, name);
                add(name, x, ys.top);
                add(name, x, ys.bot);
            });
        });
    }

    pick(clientX, clientY) {
        const p = this.toWorld(clientX, clientY);
        for (const h of this.hitTrains) {
            if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
                this.game.tidUI.selectTrain(h.id);
                return;
            }
        }
        for (const h of this.hitDepots) {
            if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
                showDepotModal(h.name);
                return;
            }
        }
        for (const h of this.hitStations) {
            if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
                this.game.tidUI.showStation(h.name);
                return;
            }
        }
    }

    // ============================================================ 描画
    draw() {
        if (!this.canvas) return;
        if (this.scroll.clientWidth && (this.scroll.clientWidth !== this.viewW ||
            this.scroll.clientHeight !== this.viewH)) this.resize();

        const vp = this.viewport();
        const ctx = this.ctx;
        const z = this.zoom || 1;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = TID_COLORS.bg;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
        /* 線路図の座標のまま描き、拡大率とスクロール量は行列で吸収する。
           こうすると、拡大しても線路図の中身 (駅の配置・分岐) は変わらない。 */
        ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z,
                         -(this.scroll.scrollLeft || 0) * this.dpr,
                         -(this.scroll.scrollTop || 0) * this.dpr);

        const xMin = vp.left - 300, xMax = vp.right + 300;
        this.hitTrains = [];
        this.hitDepots = [];

        /* 駅ごとの発着予告 (次に来る列車) を、列車を1回なめて集める。
           駅ごとに全列車を調べると重いので、列車から「次に着く駅」を引く。 */
        this.predict = this.buildPredictions();

        this.drawTracks(ctx, xMin, xMax);
        this.drawStations(ctx, xMin, xMax);
        if (this.show.route) this.drawRoutes(ctx, xMin, xMax);
        if (this.show.signal) this.drawSignals(ctx, xMin, xMax);
        this.drawDepots(ctx, xMin, xMax);
        this.drawTrains(ctx, xMin, xMax);

        // 線名は画面の左端に貼り付けて出す (スクロールしても隠れない)
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.drawRowLabels(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** 線名 (下り外・上り内 など) を画面の左端に固定して出す */
    drawRowLabels(ctx) {
        const z = this.zoom || 1;
        const top = this.scroll.scrollTop || 0;
        ctx.font = "bold 10px 'Meiryo UI', sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        this.rows().forEach(row => {
            const y = this.trackY[row.id] * z - top;
            if (y < 8 || y > this.viewH - 8) return;
            const w = ctx.measureText(row.label).width + 10;
            ctx.fillStyle = "rgba(43,53,80,0.88)";
            ctx.fillRect(2, y - 17, w, 13);
            ctx.fillStyle = "#EAF0FF";
            ctx.fillText(row.label, 7, y - 10.5);
        });
    }

    /**
     * 駅ごとの発着予告を集める。
     * 走っている列車それぞれについて、進行方向の前方でいちばん近い駅を探し、
     * 「その駅・その線路に次に来る列車」として登録する。
     * 表示は実物と同じく1線1本ぶん (いちばん近い列車) だけを出す。
     */
    buildPredictions() {
        const out = {};
        this.game.trains.forEach(t => {
            if (t.state === "in_depot" || t.state === "finished") return;
            if (this.trackY[t.trackId] === undefined) return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            for (let k = 0; k <= UNITS_PER_STATION * 3; k++) {
                const i = t.currBlockIndex + t.dir * k;
                if (i < 0 || i >= blks.length) break;
                const b = blks[i];
                if (b.x === -1000) break;
                if (!isRealStationBlock(b)) continue;
                const name = blockStationName(b);
                if (!name) continue;
                const key = t.trackId + "|" + name;
                const cur = out[key];
                if (!cur || k < cur.d) out[key] = { t: t, d: k };
                break;
            }
        });
        return out;
    }

    // ============================================================ 駅の中の縦位置
    /**
     * その線路が駅の中でどこを通るかを返す (js/40-tid-theme.js の tidStationLayout)。
     * 表示していない線区なら null。
     */
    layoutFor(stName, trackId) {
        if (!STATION_PLATFORM_RULES[stName]) return null;
        /* ★北方貨物線には本線の番線を当てはめない。
           _laneKeyOf() が Up_Hoppo を Up_Out と読み替えるため、
           そのままだと本線の着発線の高さを返してしまい、
           北方貨物線に本線の駅の数だけ穴が空いて破線のように見えていた。
           北方貨物線は途中にホームの無い複線なので、まっすぐ通す。 */
        if (trackId.indexOf("Hoppo") >= 0) return null;
        const tY = this.trackY;
        /* ★番線を共有する駅 (尼崎) は、どの線区の列車でも
           本線の着発線の位置に描く。
           尼崎の JR東西線・JR宝塚線の列車を「東西線の帯」に描いていたため、
           線路もホームも無い所に在線が出ていた。
           (js/05-track-manager.js の amaUpLanes / amaDownLanes を参照) */
        if (STATION_SHARED_LANES[stName]) {
            return (tY["Up_Out"] === undefined) ? null
                 : tidStationLayout(stName, tY["Up_Out"], false);
        }
        if (trackId.indexOf("Kosei") === 0) {
            return (tY["Kosei_Up"] === undefined) ? null
                 : tidStationLayout(stName, tY["Kosei_Up"], true);
        }
        if (trackId.indexOf("Fukuchi") === 0) {
            return (tY["Fukuchi_Up"] === undefined) ? null
                 : tidStationLayout(stName, tY["Fukuchi_Up"], true);
        }
        if (trackId.indexOf("Tozai") === 0) {
            return (tY["Tozai_Up"] === undefined) ? null
                 : tidStationLayout(stName, tY["Tozai_Up"], true);
        }
        if (tY["Up_Out"] === undefined) return null;
        return tidStationLayout(stName, tY["Up_Out"], false);
    }

    /**
     * その駅で、その線路の「本線がそのまま通る着発線」の縦位置。
     * 駅の中で上下に振り分けたぶんだけ、本線も曲がって入る。
     * (実物の Super-TID も、京都のような大きな駅では本線が上下に曲がる)
     */
    stationMainY(stName, trackId) {
        const L = this.layoutFor(stName, trackId);
        if (!L) return null;
        const key = _laneKeyOf(trackId);
        const tracks = stationLaneTracks(stName);
        for (let i = 0; i < tracks.length && i < L.ys.length; i++) {
            if (tracks[i] === key) return L.ys[i];
        }
        return null;
    }

    /** そのブロックで線路が通る縦位置 (駅の外なら線路の定位置) */
    blockRailY(trackId, blk) {
        const base = this.trackY[trackId];
        if (!blk || (!blk.isStation && !blk.hoppoStationName)) return base;
        const st = blockStationName(blk);
        if (!st) return base;
        const y = this.stationMainY(st, trackId);
        return (y === null || y === undefined) ? base : y;
    }

    /**
     * その線路を通しで描くときに「空けておく」横の範囲。
     * 駅の中で本線がずれている所は、着発線と取付線のほうで描くので、
     * まっすぐな線を重ねて引かない。
     */
    trackGaps(trackId, a, b) {
        const base = this.trackY[trackId];
        const half = tidStationBoxW() / 2 + tidLeadW();
        const out = [];
        /* ★穴を開ける場所は、その線路が実際に持っているブロックから取る。
           以前は線路IDから線区を当てようとして、当てはまらない線路
           (北方貨物線) では本線の全駅を見に行っていた。 */
        const blks = this.game.trackMgr.blocks[trackId];
        if (!blks) return out;
        for (let i = 0; i < blks.length; i++) {
            const blk = blks[i];
            if (!blk || blk.x === -1000) continue;
            if (!isRealStationBlock(blk)) continue;
            const y = this.stationMainY(blockStationName(blk), trackId);
            if (y === null || y === undefined || Math.abs(y - base) < 1.2) continue;
            const cx = tidX(blk.x);
            if (cx + half < a || cx - half > b) continue;
            out.push([cx - half, cx + half]);
        }
        out.sort((p, q) => p[0] - q[0]);
        return out;
    }

    /** 線路と軌道回路 */
    drawTracks(ctx, xMin, xMax) {
        this.rows().forEach(row => {
            const blks = this.game.trackMgr.blocks[row.id];
            if (!blks) return;
            const y = this.trackY[row.id];
            const range = tidTrackRange(row.id);
            /* ★左右を入れ替えて描くので、線区の端の大小も入れ替わる。
               (tidStationX は Super-TID の向きの X を返す) */
            const x1r = tidStationX(range[0]), x2r = tidStationX(range[1]);
            const sX = Math.min(x1r, x2r), eX = Math.max(x1r, x2r);
            const a = Math.max(sX, xMin), b = Math.min(eX, xMax);
            if (b <= a) return;

            /* 本線 (在線していない部分)。
               駅の中で本線が上下にずれている所は空けておき、
               そこは着発線と取付線のほうで描く。 */
            const gaps = this.trackGaps(row.id, a, b);
            let cur = a;
            gaps.forEach(g => {
                if (g[0] > cur) tidDrawRail(ctx, cur, Math.min(g[0], b), y);
                cur = Math.max(cur, g[1]);
            });
            if (cur < b) tidDrawRail(ctx, cur, b, y);

            // 軌道回路ごとの在線
            for (let i = 0; i < blks.length; i++) {
                const blk = blks[i];
                if (blk.x === -1000) continue;
                const bx = tidX(blk.x);
                const bw = tidW(BLOCK_WIDTH);
                if (bx < xMin - bw || bx > xMax + bw) continue;
                const x1 = bx - bw / 2 + 2;
                const x2 = bx + bw / 2 - 2;
                // 駅の中で本線がずれている所は、その高さに合わせて印を付ける
                const by = this.blockRailY(row.id, blk);

                /* ★在線は線路を塗らない。
                   実物の Super-TID は、線路の色は「進路が開通しているか」
                   (黄緑) だけを表し、在線は列車の位置の丸 (走行中=青 /
                   停車中=赤) で示している。以前は在線の軌道回路を赤く
                   塗っていたので、列車の多い時間帯は線路がほぼ赤一色になり、
                   実物とまるで違う見え方になっていた。 */
                // 運転見合わせ・障害
                if (this.game.trackMgr.isSuspended(row.id, i)) {
                    ctx.strokeStyle = TID_COLORS.fault;
                    ctx.lineWidth = 4;
                    ctx.setLineDash([7, 5]);
                    ctx.beginPath(); ctx.moveTo(x1, by); ctx.lineTo(x2, by); ctx.stroke();
                    ctx.setLineDash([]);
                } else if (this.game.signals.hasFault(row.id, i)) {
                    ctx.strokeStyle = TID_COLORS.caution;
                    ctx.lineWidth = 4;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath(); ctx.moveTo(x1, by); ctx.lineTo(x2, by); ctx.stroke();
                    ctx.setLineDash([]);
                }
                // 徐行
                if (this.game.trackMgr.speedFactor(row.id, i) > 1.0) {
                    ctx.strokeStyle = "#FF9A1E";
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x1, by + 6); ctx.lineTo(x2, by + 6); ctx.stroke();
                }
                /* 軌道回路の境目。
                   実物は境目ごとに白い丸が並ぶ。閉塞の区切りは
                   TrackManager のブロックそのものなので、
                   見た目だけの丸は足していない。 */
                tidDrawCircuitMark(ctx, bx + tidW(BLOCK_WIDTH) / 2, by);
            }

        });
    }

    /* ------------------------------------------------------------ 駅名札の位置

       ■ 何が問題だったか
         駅名札は「キャンバスのいちばん上」と「いちばん下」に置いていた。
         本線だけを出しているときは実物と同じ形になるが、
         「全線」を選んで湖西線・JR宝塚線・JR東西線も並べると、
           ・本線の駅名が画面の最上部と最下部に離れて出る
             (上下に目を往復させないと、どの駅か分からない)
           ・分岐線の札は線路のすぐ上に出るので、本線の駅名と合わせて
             同じ x に3つの名前が並ぶ
           ・分岐線の札が、広がった番線やホームの帯に重なる
         という状態になっていた。

       ■ どう直したか
         線区 (TID_ROWS の group) ごとに帯を求め、その帯の上と下に
         その線区の駅名を置く。位置は「その駅が実際に使っている番線の
         いちばん上・いちばん下」から決めるので、番線を上下に広げた
         大きな駅でもホームや列車表示に重ならない。
         分岐線に駅が無いインデックスでは札を出さないので、
         同じ名前が3つ並ぶことも無くなる。
    */

    /** 表示している線区ごとの帯 (上端・下端の線路の縦位置) */
    groupBands() {
        if (this._bandCache && this._bandKey === this.areaId) return this._bandCache;
        const rows = this.trackY.__rows || [];
        const bands = [];
        rows.forEach(row => {
            const y = this.trackY[row.id];
            if (y === undefined) return;
            let b = bands.find(x => x.group === row.group);
            if (!b) {
                b = { group: row.group, top: y, bot: y, refId: row.id };
                bands.push(b);
            }
            if (y < b.top) b.top = y;
            /* 帯の下端 = その線区の「上り線」の位置。
               番線の縦位置 (tidStationLaneYs) はこれを基準に計算する。 */
            if (y > b.bot) { b.bot = y; b.refId = row.id; }
        });
        this._bandCache = bands;
        this._bandKey = this.areaId;
        return bands;
    }

    /** その線区・そのインデックスにある駅名 (無ければ null) */
    stationNameOn(group, i) {
        if (group === "本線" || group === "北方貨物線") {
            return STATIONS[i] ? STATIONS[i].name : null;
        }
        if (group === "湖西線") return KOSEI_STATIONS_MAP[i] || null;
        if (group === "JR宝塚線") return FUKUCHI_STATIONS_MAP[i] || null;
        if (group === "JR東西線") return TOZAI_STATIONS_MAP[i] || null;
        return null;
    }

    /**
     * その駅・その線区で、駅名札を置く高さ。
     * 番線を上下に広げた駅でも重ならないように、
     * 実際に使っている番線の上端・下端から決める。
     */
    plateYsFor(band, name) {
        const branch = (band.group !== "本線" && band.group !== "北方貨物線");
        let minY = band.top, maxY = band.bot;
        if (STATION_PLATFORM_RULES[name]) {
            const ys = tidStationLaneYs(name, band.bot, branch);
            ys.forEach(y => {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            });
        }
        /* 札と線路のあいだの余白は実物の値 (113px / 84px)。
           発着予告の札がこのあいだに入る。 */
        return {
            top: minY - TID_GEO.plateTopGap * TID_SCALE_Y,
            bot: maxY + TID_GEO.plateBotGap * TID_SCALE_Y
        };
    }

    /** 駅 (駅名札・番線・ホーム・分岐) */
    drawStations(ctx, xMin, xMax) {
        const tY = this.trackY;
        const bands = this.groupBands();

        STATIONS.forEach((st, i) => {
            const x = tidStationX(i);
            if (x < xMin - 200 || x > xMax + 200) return;

            // 駅の位置を示す縦の薄い線
            ctx.strokeStyle = TID_COLORS.grid;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, this.height - 24); ctx.stroke();

            // 渡り線・他線区との分岐・支線 (配線略図をもとにした TID_JUNCTIONS)。
            // 番線より先に描いて、線路の下の層に来るようにする。
            this.drawJunctions(ctx, st.name, x);

            // 本線の番線 (旅客向けの線路図と同じ並びを Super-TID の間隔に当てはめる)
            if (tY["Up_Out"] !== undefined) {
                this.drawStationLanes(ctx, st.name, x, tY["Up_Out"], false);
            }

            // 発着予告 (その駅の線路ごとに、次に来る列車を出す)
            this.drawPredictions(ctx, st.name, x);

            // 分岐線の駅の番線
            [[KOSEI_STATIONS_MAP, "Kosei_Up"],
             [FUKUCHI_STATIONS_MAP, "Fukuchi_Up"],
             [TOZAI_STATIONS_MAP, "Tozai_Up"]].forEach(def => {
                const n = def[0][i];
                if (!n || tY[def[1]] === undefined) return;
                this.drawJunctions(ctx, n, x);
                this.drawStationLanes(ctx, n, x, tY[def[1]], true);
            });

            /* 駅名札は最後に描く (線路・ホーム・列車表示の上に出す)。
               線区ごとに、その帯の上と下に1枚ずつ。 */
            bands.forEach(band => {
                const name = this.stationNameOn(band.group, i);
                if (!name) return;
                if (band.group === "北方貨物線") return;   // 途中にホームが無いので出さない
                const ys = this.plateYsFor(band, name);
                tidDrawPlate(ctx, name, x, ys.top);
                tidDrawPlate(ctx, name, x, ys.bot);
            });
        });
    }

    /**
     * その駅の分岐を描く。
     * 配線略図をもとにした TID_JUNCTIONS の定義にしたがって
     *   渡り線 (内外の転線)
     *   他線区との合流・分岐 (尼崎の東西線/宝塚線、山科の湖西線 など)
     *   画面の外へ出ていく支線 (草津線・播但線・おおさか東線 など)
     * を描く。旅客向けの線路図には無い、Super-TID だけの表示。
     */
    drawJunctions(ctx, stName, cx) {
        const def = TID_JUNCTIONS[stName];
        if (!def) return;
        const tY = this.trackY;   // 表示していない線区は undefined になるので描かれない

        /* ★渡り線は駅の「のど」(着発線の外側) に描く。
           以前は駅の中心 cx に描いていたので、ホームの帯と
           「N番のりば」の札を斜めの線が突き抜けていた。
           両渡り (x) は実物の主要駅と同じく駅の前後に1組ずつ置く。 */
        (def.crossovers || []).forEach(c => {
            const yA = tY[c[0]], yB = tY[c[1]];
            if (yA === undefined || yB === undefined) return;
            /* ★形と側は「画面の向きそのまま」。
               以前は tidShape()/tidSide() で左右を入れ替えていたため、
               4つめに側を書いた渡り線が画面の反対側に、
               片渡りが逆向きに描かれていた (説明とも食い違っていた)。 */
            const shape = c[2];
            // 4つめの指定が無いときの既定 (両渡りは両側、片渡りは画面の左)
            const want = c[3] ? c[3] : (c[2] === "x" ? "B" : "L");
            const sides = (want === "B") ? ["L", "R"] : [want];
            sides.forEach(sd => {
                tidDrawCrossover(ctx, tidThroatX(cx, sd),
                                 Math.min(yA, yB), Math.max(yA, yB), shape);
            });
        });

        (def.junctions || []).forEach(j => {
            const yMain = tY[j[0]], yBranch = tY[j[1]];
            if (yMain === undefined || yBranch === undefined) return;
            /* 合流は駅の手前、分岐は駅の先。どちらも のど から引く。
               ★4つめで側を指定できる。実物は「上りの合流も下りの分岐も
                 駅の同じ端」という所が多い (尼崎の宝塚線・東西線など)。 */
            const sd = j[3] ? j[3] : ((j[2] === "in") ? "L" : "R");
            tidDrawJunction(ctx, tidThroatX(cx, sd), yMain, yBranch, j[2]);
        });

        // 同じ向きに複数の支線が出るときは、重ならないようにずらす
        const usedUp = {}, usedDown = {};
        (def.stubs || []).forEach(s => {
            const y = tY[s.from];
            if (y === undefined) return;
            const side = s.side;
            const key = side + (s.up ? "U" : "D");
            const bag = s.up ? usedUp : usedDown;
            const order = bag[key] || 0;
            bag[key] = order + 1;
            tidDrawStub(ctx, tidThroatX(cx, side), y, s.up, s.label, side, order);
        });
    }

    /**
     * 駅の発着予告を描く。
     * 実物と同じく、下り線はその線路の下、上り線はその線路の上に、
     * 線名の小札を付けた札で「次に来る列車」を出す。
     */
    drawPredictions(ctx, stName, cx) {
        if (!this.show.predict || !this.predict) return;
        this.rows().forEach(row => {
            const y = this.trackY[row.id];
            if (y === undefined) return;
            const p = this.predict[row.id + "|" + stName];
            /* その線路に来る列車が無いときは、実物と同じく薄い空き枠だけを出す。
               (実物の画面も、列車が決まっていない所は枠だけが並んでいる) */
            const range = tidTrackRange(row.id);
            const sIdx = STATION_MAP[stName];
            if (sIdx !== undefined && (sIdx < range[0] || sIdx > range[1]) &&
                KOSEI_STATIONS_MAP[sIdx] === undefined &&
                FUKUCHI_STATIONS_MAP[sIdx] === undefined &&
                TOZAI_STATIONS_MAP[sIdx] === undefined) return;
            /* 実物では、下り線の予告は駅の右 (進む先) 側、
               上り線の予告は駅の左側に並ぶ。こうすると上下の札が
               横にずれるので、狭い内側線のあいだでも重ならない。 */
            const py = (row.dir === -1) ? (y + 22) : (y - 22);
            /* ★駅の着発線と列車表示から離す。以前は 88px の決め打ちで、
               線路図の倍率を下げたときに駅の中の列車表示と重なっていた。
               着発線の枠の外へ出す。 */
            const off = tidStationBoxW() / 2 + 105;
            const px = (row.dir === -1) ? (cx + off) : (cx - off);
            tidDrawPredictPlate(ctx, px, py, p ? row.label : null, p ? p.t : null);
        });
    }

    /**
     * 駅の着発線とホームを描く。
     *
     * ■ 実物に合わせた点
     *   ・着発線を薄い枠 (構内) で囲む
     *   ・転てつ器のある駅は、構内の入口に白い四角を置く
     *   ・ホームは「面している2本の線路のちょうど中間」に1本の黄色い帯で描き、
     *     上の線路の番線番号を帯の上、下の線路の番線番号を帯の下に書く
     *     (以前は線路ごとに帯を描いていたので、島式ホームが2本に見えていた)
     */
    drawStationLanes(ctx, stName, cx, refUpOutY, branch) {
        const rule = STATION_PLATFORM_RULES[stName];
        if (!rule) return;
        const L = tidStationLayout(stName, refUpOutY, branch);
        const boxW = tidStationBoxW();
        const lead = tidLeadW();
        const x1 = cx - boxW / 2, x2 = cx + boxW / 2;

        /* 着発線を画面の上から下の順に並べ直す (ホームの組を作るため)。
           ★描くのは「実際にあるレーンぜんぶ」(js/03-stations.js の
             stationLaneSlots)。以前は番線の定義のぶんだけ描いていたので、
             定義より線路のレーンが多い駅では、その番線に入った列車だけが
             線路の無い高さに描かれ、ほかの札と重なっていた。 */
        const lanes = L.slots.map((sl, i) => ({
            y: L.ys[i], home: L.homeYs[i], label: sl.label, plat: sl.platform
        }));
        lanes.sort((a, b) => a.y - b.y);

        const line = (xa, ya, xb, yb) => {
            ctx.strokeStyle = TID_COLORS.railEdge; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
            ctx.strokeStyle = TID_COLORS.rail; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
        };

        lanes.forEach(ln => {
            // 着発線そのもの
            tidDrawRail(ctx, x1, x2, ln.y);
            /* 本線の定位置とずれている着発線は、駅の入口・出口に
               斜めの取付線を引いて本線につなぐ。
               待避線だけでなく、駅の中で上下に振り分けた本線もここを通る。
               (実物の Super-TID も、京都のような大きな駅では
                本線が駅の手前で上下に曲がって着発線に入る) */
            if (Math.abs(ln.y - ln.home) > 1.2) {
                line(x1, ln.y, x1 - lead, ln.home);
                line(x2, ln.y, x2 + lead, ln.home);
                tidDrawTurnoutBox(ctx, x1 - lead, ln.home);
                tidDrawTurnoutBox(ctx, x2 + lead, ln.home);
            }
            // 構内 (着発線) の枠
            tidDrawStationTrackBox(ctx, cx, ln.y, boxW);
        });

        /* 構内の入口の転てつ器 (実物は着発線の枠のすぐ外側に白い四角)。
           分岐や待避線のある駅だけに置く。 */
        const hasPoints = !!TID_JUNCTIONS[stName] ||
                          lanes.some(l => Math.abs(l.y - l.home) > 1.2);
        if (hasPoints) lanes.forEach(ln => tidDrawTurnoutBox(ctx, x1 - 5, ln.y));

        /* ホーム帯。組にする相手は tidStationLayout が決めている
           (となり合う2本だけを島式ホームとして組にする)。
           相手のいないホームは、列車表示と反対側に帯を置く。 */
        if (this.show.platform) {
            const done = {};
            L.slots.forEach((sl, i) => {
                if (!sl.platform || done[i]) return;
                const j = L.partner[i];
                if (j >= 0 && !done[j]) {
                    done[i] = done[j] = true;
                    const up = (L.ys[i] < L.ys[j]) ? i : j;
                    const lo = (up === i) ? j : i;
                    tidDrawPlatform(ctx, cx, L.ys[up], L.ys[lo],
                                    L.slots[up].label, L.slots[lo].label);
                } else {
                    done[i] = true;
                    tidDrawPlatformSingle(ctx, cx, L.ys[i], sl.label, L.barSide[i] || 1);
                }
            });
        }
    }

    /** 進路 (信号が開通している区間を緑で塗る) */
    drawRoutes(ctx, xMin, xMax) {
        this.game.trains.forEach(t => {
            if (t.state === "in_depot" || t.state === "finished") return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const here = blks[t.currBlockIndex];
            if (!here) return;
            const hx = tidX(here.x);
            if (hx < xMin - 400 || hx > xMax + 400) return;
            const y = this.trackY[t.trackId];
            if (y === undefined) return;   // その線区を表示していない
            const route = this.game.signals.routeBlocks(t, 3);
            route.forEach(idx => {
                const b = blks[idx];
                if (!b || b.x === -1000) return;
                const bx = tidX(b.x);
                const rw = tidW(BLOCK_WIDTH);
                // 駅の中で本線がずれている所は、その高さに合わせて塗る
                const ry = this.blockRailY(t.trackId, b);
                tidDrawRail(ctx, bx - rw / 2 + 2, bx + rw / 2 - 2, ry, TID_COLORS.route);
            });
        });
    }

    /** 信号機 */
    drawSignals(ctx, xMin, xMax) {
        this.rows().forEach(row => {
            const y = this.trackY[row.id];
            /* signalsInRange はシミュレーションの座標で範囲を受け取るので、
               画面の範囲を内部座標に戻してから渡す。 */
            const wMin = Math.min(tidInvX(xMin), tidInvX(xMax));
            const wMax = Math.max(tidInvX(xMin), tidInvX(xMax));
            const sigs = this.game.signals.signalsInRange(row.id, row.dir, wMin, wMax);
            const blks = this.game.trackMgr.blocks[row.id];
            sigs.forEach(sg => {
                let sy = y;
                if (blks && sg.index !== undefined && blks[sg.index]) {
                    sy = this.blockRailY(row.id, blks[sg.index]);
                }
                tidDrawSignal(ctx, tidX(sg.x), sy, row.dir, sg.aspect, sg.kind);
            });
        });
    }

    /** 留置場 */
    drawDepots(ctx, xMin, xMax) {
        for (const name in DEPOTS) {
            const dep = DEPOTS[name];
            const idx = (name === "宮原操") ? 39 : (name === "向日町操") ? 51 : STATION_MAP[name];
            if (idx === undefined) continue;
            const x = tidStationX(idx) -
                      tidW(dep.drawOffset.x * BLOCK_WIDTH * UNITS_PER_STATION);
            if (x < xMin - 200 || x > xMax + 200) continue;

            let y;
            if (dep.line === "Tozai") y = this.trackY["Tozai_Up"] + 30;
            else if (dep.line === "Fukuchi") y = this.trackY["Fukuchi_Up"] + 30;
            else if (name === "宮原操") y = this.trackY["Up_Hoppo"] + 30;
            else y = this.trackY["Up_Out"] + 30;

            const idle = this.game.fleet.poolAt(name).length;
            const wait = dep.trains.length;
            const text = "【留置】" + name + "  在線" + (idle + wait) + "本";
            ctx.font = "bold 11px 'Meiryo UI', sans-serif";
            const w = ctx.measureText(text).width + 14;
            ctx.fillStyle = "#2B3550";
            ctx.fillRect(x - w / 2, y - 9, w, 18);
            ctx.strokeStyle = "#8FA0C8"; ctx.lineWidth = 1;
            ctx.strokeRect(x - w / 2 + 0.5, y - 8.5, w - 1, 17);
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(text, x, y + 1);
            this.hitDepots.push({ name: name, x: x - w / 2, y: y - 9, w: w, h: 18 });
        }
    }

    /** 列車 */
    drawTrains(ctx, xMin, xMax) {
        const selected = this.game.tidUI ? this.game.tidUI.selectedId : null;
        this.game.trains.forEach(t => {
            if (t.state === "in_depot" || t.state === "finished") return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const b = blks[t.currBlockIndex];
            if (!b || b.x === -1000) return;
            const bx = tidX(b.x);
            if (bx < xMin || bx > xMax) return;
            const baseY = this.trackY[t.trackId];
            if (baseY === undefined) return;

            const y = this.laneY(t, b, baseY);
            /* 実物と同じく、走行中は青丸・停車や抑止中は赤丸で在線を示す。 */
            const stopped = (t.state === "stopped" || t.state === "holding" ||
                             t.state === "waiting_start" || t.state === "turning_back" ||
                             t.isManuallySuspended || t.minorTrouble);
            tidDrawOccupyDot(ctx, bx, y, stopped);

            /* 実物では、下り線の列車表示は線路の上、上り線は線路の下に出る。
               発着予告と上下で分かれるので、どちらも読めるようになる。
               ★駅の中では、ホームの帯と「N番のりば」の札が入る側を避ける。
                 島式ホームの上側の線は上へ、下側の線は下へ表示を出す。
                 (そうしないと、どちらの駅でも列車表示がホームの札に重なる) */
            const info = this.laneInfo(t, b);
            const side = info.side || (t.dir === -1 ? -1 : 1);
            const labelY = y + side * 16;
            const box = tidDrawTrainLabel(ctx, t, bx, labelY,
                { showFleet: this.show.fleet, below: (side === 1),
                  inlineFleet: info.tight });
            this.hitTrains.push({ id: t.id, x: box.x, y: box.y, w: box.w, h: box.h });

            if (selected === t.id) {
                ctx.strokeStyle = "#FF2020";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(box.x, box.y, box.w, box.h);
                ctx.setLineDash([]);
            }
        });
    }

    /**
     * その列車の表示を線路のどちら側に出すか。
     * 駅の中でホームに面している線は、ホームと反対側に出す。
     * 分からないときは 0 を返す (呼び出し側が進行方向で決める)。
     */
    laneInfo(t, blk) {
        const none = { side: 0, tight: false };
        const stName = blockStationName(blk);
        if (!stName || !(blk.isStation || blk.hoppoStationName)) return none;
        const L = this.layoutFor(stName, t.trackId);
        if (!L || !L.sides) return none;
        const e = stationLaneEntry(stName, t.trackId, t.lane);
        if (!e || !(e.index >= 0)) return none;
        return { side: L.sides[e.index] || 0, tight: !!(L.tight && L.tight[e.index]) };
    }

    /** その列車が居る番線の縦位置 */
    laneY(t, blk, baseY) {
        const stName = blockStationName(blk);
        if (stName && STATION_PLATFORM_RULES[stName] && (blk.isStation || blk.hoppoStationName)) {
            const L = this.layoutFor(stName, t.trackId);
            if (L && L.ys.length) {
                /* ★番線の縦位置は、番線名と同じ対応表から決める
                   (js/03-stations.js の stationLaneMap)。
                   以前は「本線に近い順」に並べ替えてレーン番号で引いていたため、
                   画面に描く位置と、駅の在線表に出る番線名が食い違うことがあった。 */
                /* ★番線を共有する駅 (尼崎) も含めて、
                   js/03-stations.js の1か所で引く。 */
                const e = stationLaneEntry(stName, t.trackId, t.lane);
                if (e && e.index >= 0 && L.ys[e.index] !== undefined) return L.ys[e.index];
            }
        }
        /* ★番線を共有する駅で番線が引けなかったときは、
           その番線が属する本線の位置を使う。列車が乗っている線路 (東西線など)
           の帯に落とすと、線路の無い所に出てしまう。 */
        if (stName && STATION_SHARED_LANES[stName]) {
            const key = _laneKeyOf(t.trackId);
            const row = this.trackY[key];
            if (row !== undefined) return row;
        }
        return baseY + (t.lane > 0 ? t.lane * (t.dir === 1 ? 18 : -18) : 0);
    }
}
