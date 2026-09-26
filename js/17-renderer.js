/* Renderer — 線路図のキャンバス描画。

   ■ 描き方を「巨大キャンバス」から「画面ぶんのキャンバス」に変えた

     以前は 横 30,000px を超えるキャンバスを1枚作り、その上に全線を描いて
     ブラウザのスクロールで見せていた。
     iOS / iPadOS の Safari にはキャンバスの面積に上限があり
     (機種によっては1,600万〜4,200万画素程度)、この大きさは確保できない。
     確保できないと描画が丸ごと失敗し、線路図が真っ白になっていた。

     いまは
       ・キャンバスは「いま見えている画面の大きさ」だけ作る
       ・スクロール量ぶん平行移動して、見えている範囲だけを描き直す
       ・スクロールバーは、線路図全体の大きさを持つ空の div
         (#canvas-spacer) が出す
     という作りにした。キャンバスの面積は画面と同じなので、
     どの端末でも上限に掛からない。横にも縦にもスクロールできる。

   ■ 座標の呼び方
     ワールド座標 … 線路図全体の座標 (0 〜 TOTAL_WIDTH)
     画面座標     … キャンバス上の座標
     画面座標 = ワールド座標 - スクロール量
*/

/* 端末の解像度にあわせた倍率。高すぎるとキャンバスの面積が増えるので
   2倍で頭打ちにする (iPad の Retina は2倍)。 */
const MAX_DEVICE_PIXEL_RATIO = 2;

class Renderer {

    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById("tidCanvas");
        this.ctx = this.canvas.getContext("2d");

        this.stationHitboxes = [];   // 駅名の枠 (クリックで発車標)
        this.depotHitboxes = [];     // 留置場の枠 (クリックで構内図)

        this.viewW = 0;
        this.viewH = 0;
        this.dpr = 1;

        // スクロールバーを出すための空の div に、線路図全体の大きさを持たせる
        const spacer = document.getElementById("canvas-spacer");
        if (spacer) {
            spacer.style.width = TOTAL_WIDTH + "px";
            spacer.style.height = CANVAS_HEIGHT + "px";
        }

        this.buildHitboxes();
        this.resize();

        if (typeof window !== "undefined" && window.addEventListener) {
            window.addEventListener("resize", () => { this.resize(); this.draw(); });
        }

        // クリック / タップの判定は、ワールド座標に直してから行う
        const onPick = (clientX, clientY) => {
            const p = this.toWorld(clientX, clientY);
            for (const box of this.depotHitboxes) {
                if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) {
                    showDepotModal(box.name);
                    return;
                }
            }
            for (const box of this.stationHitboxes) {
                if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) {
                    this.game.ui.showDepartureBoard(box.name);
                    return;
                }
            }
        };
        /* キャンバスは下の層にあり、上にスクロール領域が重なっているので、
           タップはスクロール領域で受ける。
           指でなぞってスクロールしただけのときに反応しないよう、
           押した位置からほとんど動いていない場合だけタップとみなす。 */
        this.hitTarget = document.getElementById("scroll-container") || this.canvas;
        let downX = 0, downY = 0, moved = false;
        const start = (x, y) => { downX = x; downY = y; moved = false; };
        const move = (x, y) => {
            if (Math.abs(x - downX) > 10 || Math.abs(y - downY) > 10) moved = true;
        };
        this.hitTarget.addEventListener("pointerdown", (e) => start(e.clientX, e.clientY));
        this.hitTarget.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
        this.hitTarget.addEventListener("touchstart", (e) => {
            if (e.touches && e.touches[0]) start(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        this.hitTarget.addEventListener("touchmove", (e) => {
            if (e.touches && e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        this.hitTarget.addEventListener("click", (e) => {
            if (moved) { moved = false; return; }
            onPick(e.clientX, e.clientY);
        });
    }

    /** 画面座標 → ワールド座標 */
    toWorld(clientX, clientY) {
        const rect = (this.hitTarget || this.canvas).getBoundingClientRect();
        const sc = this.game.scrollContainer;
        return {
            x: (clientX - rect.left) + (sc ? sc.scrollLeft : 0),
            y: (clientY - rect.top) + (sc ? sc.scrollTop : 0)
        };
    }

    /** キャンバスを画面の大きさに合わせる */
    resize() {
        const sc = this.game.scrollContainer || this.canvas.parentElement;
        const w = Math.max(320, (sc && sc.clientWidth) ? sc.clientWidth : 1200);
        const h = Math.max(240, (sc && sc.clientHeight) ? sc.clientHeight : 800);
        this.dpr = Math.min(MAX_DEVICE_PIXEL_RATIO,
            (typeof window !== "undefined" && window.devicePixelRatio) || 1);
        this.viewW = w;
        this.viewH = h;
        this.canvas.width = Math.floor(w * this.dpr);
        this.canvas.height = Math.floor(h * this.dpr);
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
    }

    /** いま見えているワールド座標の範囲 */
    viewport() {
        const sc = this.game.scrollContainer;
        const left = sc ? (sc.scrollLeft || 0) : 0;
        const top = sc ? (sc.scrollTop || 0) : 0;
        return { left: left, top: top, right: left + this.viewW, bottom: top + this.viewH };
    }

    // ================================================================ 当たり判定
    /**
     * 駅名の枠と留置場の枠の位置を、あらかじめ1回だけ計算しておく。
     * 描画のたびに集めると、画面外の駅の枠が消えてしまうため。
     */
    buildHitboxes() {
        this.stationHitboxes = [];
        this.depotHitboxes = [];
        const tY = this.game.trackMgr.trackY;
        const boxW = 120, boxH = 24;
        const addSt = (name, x, y) => {
            this.stationHitboxes.push({ name: name, x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH });
        };
        const centerY = (tY["Up_In"] + tY["Down_In"]) / 2;

        STATIONS.forEach((st, i) => {
            const x = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
            // 播州赤穂の位置は赤穂線だけ (本線の駅ではない)
            if (st.branchOnly) {
                if (AKO_STATIONS_MAP[i]) addSt(AKO_STATIONS_MAP[i], x, (tY["Ako_Up"] + tY["Ako_Down"]) / 2);
                return;
            }
            if (st.name === "向日町操") {
                addSt(st.name, x, tY["Up_Out"] - 35);
                addSt(st.name, x, tY["Down_Out"] + 35);
                return;
            }
            addSt(st.name, x, centerY);
            if (FREIGHT_STATION_LABEL[st.name]) {
                addSt(FREIGHT_STATION_LABEL[st.name], x, tY["Up_Out"] - 25);
                addSt(FREIGHT_STATION_LABEL[st.name], x, tY["Down_Out"] + 35);
            }
            if (i === W(39)) { addSt("宮原操", x, tY["Up_Hoppo"] - 20); addSt("宮原操", x, tY["Down_Hoppo"] + 30); }

            if (KOSEI_STATIONS_MAP[i])   addSt(KOSEI_STATIONS_MAP[i],   x, (tY["Kosei_Up"] + tY["Kosei_Down"]) / 2);
            if (FUKUCHI_STATIONS_MAP[i]) addSt(FUKUCHI_STATIONS_MAP[i], x, (tY["Fukuchi_Up"] + tY["Fukuchi_Down"]) / 2);
            if (TOZAI_STATIONS_MAP[i])   addSt(TOZAI_STATIONS_MAP[i],   x, (tY["Tozai_Up"] + tY["Tozai_Down"]) / 2);
            if (AKO_STATIONS_MAP[i])     addSt(AKO_STATIONS_MAP[i],     x, (tY["Ako_Up"] + tY["Ako_Down"]) / 2);
        });

        // 貨物ターミナルの名札 (押すと発車標)
        for (const key in FREIGHT_TERMINALS) {
            const g = this.freightYardGeometry(key);
            addSt(key, g.cx, g.plateY);
        }

        for (const stName in DEPOTS) {
            const g = this.depotGeometry(stName);
            if (!g) continue;
            this.depotHitboxes.push({ name: stName, x: g.cx - 60, y: g.startY - 12 - 25,
                                      w: 120, h: g.totalHeight + 40 });
        }
    }

    /**
     * 貨物ターミナルの構内の位置 (旅客向けの線路図)。
     * 北方貨物線 (下) と湖西線のあいだに、下り着発線を左、上り着発線を右の2列で並べる。
     */
    freightYardGeometry(key) {
        const ft = FREIGHT_TERMINALS[key];
        const tY = this.game.trackMgr.trackY;
        const cx = 100 + ft.pos * BLOCK_WIDTH;
        const top = tY[freightTerminalTrack(key, 1)];
        const gap = 30;
        const rows = Math.max(ft.lanes.up, ft.lanes.down);
        const pos = (trackId, lane) => ({
            x: cx + (/_Up$/.test(trackId) ? 56 : -56),
            y: top + lane * gap
        });
        return { cx: cx, top: top, gap: gap, rows: rows, pos: pos, plateY: top - 36 };
    }

    drawFreightTerminals(ctx, xMin, xMax) {
        const tY = this.game.trackMgr.trackY;
        for (const key in FREIGHT_TERMINALS) {
            const ft = FREIGHT_TERMINALS[key];
            const g = this.freightYardGeometry(key);
            if (g.cx < xMin - 200 || g.cx > xMax + 200) continue;
            // 本線 (外側線) から構内への取付線
            ctx.strokeStyle = CONFIG.lineMain; ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(g.cx - 56, tY["Down_Out"]); ctx.lineTo(g.cx - 56, g.top - 8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(g.cx + 56, tY["Up_Out"]); ctx.lineTo(g.cx + 56, tY["Up_Out"] + 20); ctx.stroke();
            ctx.setLineDash([]);
            // 着発線 (下り = 左の列、上り = 右の列)
            ctx.lineWidth = 3;
            [[-1, ft.lanes.down], [1, ft.lanes.up]].forEach(([d, n]) => {
                for (let l = 0; l < n; l++) {
                    const p = g.pos(freightTerminalTrack(key, d), l);
                    ctx.strokeStyle = CONFIG.lineMain;
                    ctx.beginPath(); ctx.moveTo(p.x - 52, p.y); ctx.lineTo(p.x + 52, p.y); ctx.stroke();
                }
            });
            this.drawStationBox(ctx, key, g.cx, g.plateY);
        }
    }

    /** 留置場の枠を描く位置 */
    depotGeometry(stName) {
        const dep = DEPOTS[stName];
        if (!dep) return null;
        const tY = this.game.trackMgr.trackY;
        const idx = (stName === "宮原操") ? STATION_MAP["新大阪"] : (stName === "向日町操") ? STATION_MAP["向日町操"] : STATION_MAP[stName];
        if (idx === undefined) return null;
        const baseX = 100 + (idx * UNITS_PER_STATION) * BLOCK_WIDTH;
        const cx = baseX + (dep.drawOffset.x * BLOCK_WIDTH * UNITS_PER_STATION);
        const boxH = 24;
        const totalHeight = dep.capacity * (boxH + 4);
        let cy = ((tY["Up_In"] + tY["Down_In"]) / 2) + dep.drawOffset.y;
        if (["西明石", "高槻", "向日町操"].includes(stName)) {
            cy = tY["Down_Out"] + totalHeight / 2 + 30;
        } else if (stName === "宮原操") {
            cy = tY["Down_Hoppo"] + totalHeight / 2 + 30;
        } else if (dep.line === "Tozai") {
            cy = tY["Tozai_Down"] + totalHeight / 2 + 30;
        } else if (dep.line === "Fukuchi") {
            cy = tY["Fukuchi_Down"] + totalHeight / 2 + 30;
        }
        return { cx: cx, cy: cy, totalHeight: totalHeight, startY: cy - totalHeight / 2 + boxH / 2 };
    }

    // ================================================================ 背景
    /**
     * 線路・駅・ホームを、見えている範囲だけ描く。
     * 以前は巨大な裏キャンバスに1回だけ描いていたが、
     * その裏キャンバスこそが iPad で確保できない大きさだったので、
     * 毎回その場で描くようにした。見えている範囲は十数駅ぶんしかないので軽い。
     */
    drawBackgroundRange(ctx, xMin, xMax) {
        const tY = this.game.trackMgr.trackY;

        ctx.fillStyle = CONFIG.bg;
        ctx.fillRect(xMin - 10, 0, (xMax - xMin) + 20, CANVAS_HEIGHT);

        // --- 線路の横線
        TRACKS.forEach(trk => {
            if (trk.type === "freight_terminal") return;      // 貨物ターミナルの構内は下で描く
            if (trk.type === "siding") {                      // 駅の引上線: 駅の外側の短い線
                const sd = SIDINGS[trk.siding];
                const sx = 100 + sd.pos * BLOCK_WIDTH, y = tY[trk.id];
                if (sx < xMin - 100 || sx > xMax + 100) return;
                ctx.strokeStyle = CONFIG.lineMain; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(sx - 55, y); ctx.lineTo(sx + 55, y); ctx.stroke();
                ctx.fillStyle = "#fff"; ctx.font = "10px 'Meiryo UI', sans-serif"; ctx.textAlign = "center";
                ctx.fillText(trk.siding + " 引上線", sx, y - 16);
                return;
            }
            const y = tY[trk.id];
            ctx.strokeStyle = CONFIG.lineMain;
            ctx.lineWidth = 3;
            let sX = 0, eX = TOTAL_WIDTH;
            if (trk.id.includes("Hoppo")) {
                sX = 100 + (W(36) * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (W(44) * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else if (trk.id.includes("Kosei")) {
                sX = 100 + (W(56) * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (W(83) * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else if (trk.id.includes("Fukuchi")) {
                sX = 100 + (W(23) * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (W(36) * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else if (trk.id.includes("Tozai")) {
                sX = 100 + (W(36) * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (TOZAI_EAST_IDX * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else if (trk.id.includes("Ako")) {
                sX = 100 + (AKO_WEST_IDX * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (AKO_JUNCTION_IDX * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else if (trk.id.includes("In")) {
                sX = 100 + (STATION_MAP["西明石"] * UNITS_PER_STATION) * BLOCK_WIDTH;
                eX = 100 + (STATION_MAP["草津"] * UNITS_PER_STATION) * BLOCK_WIDTH;
            } else {
                // 本線の西の端は上郡 (その西の播州赤穂の位置は赤穂線だけ)
                sX = 100 + (STATION_MAP["上郡"] * UNITS_PER_STATION) * BLOCK_WIDTH;
            }
            const a = Math.max(sX, xMin), b = Math.min(eX, xMax);
            if (b <= a) return;
            ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
        });

        // --- 貨物ターミナルの構内 (旅客駅とは別の場所。js/03-stations.js の FREIGHT_TERMINALS)
        this.drawFreightTerminals(ctx, xMin, xMax);

        // --- 北方貨物線の側線 (宮原操・吹田信号場)
        [[39, 2], [41, 4]].forEach((pair) => {
            const i = pair[0], n = pair[1];
            const x = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
            if (x < xMin - 100 || x > xMax + 100) return;
            this.drawStationTracksSingle(ctx, x, n, tY["Up_Hoppo"], -1);
            this.drawStationTracksSingle(ctx, x, n, tY["Down_Hoppo"], 1);
        });

        // --- 駅
        const centerY = (tY["Up_In"] + tY["Down_In"]) / 2;
        STATIONS.forEach((st, i) => {
            const x = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
            if (x < xMin - 200 || x > xMax + 200) return;

            ctx.strokeStyle = CONFIG.stationGrid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();

            // 播州赤穂の位置は赤穂線だけ (本線の線路・駅は描かない)
            if (st.branchOnly) {
                const aName = AKO_STATIONS_MAP[i];
                if (aName) {
                    this.drawStationBox(ctx, aName, x, (tY["Ako_Up"] + tY["Ako_Down"]) / 2);
                    this.drawStationTracksStatic(ctx, x, tY["Ako_Up"], tY["Ako_Up"], tY["Ako_Down"], tY["Ako_Down"], aName);
                }
                return;
            }

            if (st.name === "向日町操") {
                ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
                ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                // 旅客駅ではない (吹田総合車両所京都支所の出入口)。着発線 (上り2・下り2) だけを描く
                ctx.fillText("京都支所 出入口 (向日町操)", x, tY["Up_Out"] - 35);
                ctx.fillText("京都支所 出入口 (向日町操)", x, tY["Down_Out"] + 35);
                this.drawStationTracksStatic(ctx, x, tY["Up_Out"], tY["Up_In"], tY["Down_In"], tY["Down_Out"], st.name);
                return;
            }

            this.drawStationBox(ctx, st.name, x, centerY);
            if (FREIGHT_STATION_LABEL[st.name]) {
                this.drawStationBox(ctx, FREIGHT_STATION_LABEL[st.name], x, tY["Up_Out"] - 25);
                this.drawStationBox(ctx, FREIGHT_STATION_LABEL[st.name], x, tY["Down_Out"] + 35);
            }
            if (i === W(39)) {
                this.drawStationBox(ctx, "宮原操", x, tY["Up_Hoppo"] - 20);
                this.drawStationBox(ctx, "宮原操", x, tY["Down_Hoppo"] + 30);
            }

            this.drawStationTracksStatic(ctx, x, tY["Up_Out"], tY["Up_In"], tY["Down_In"], tY["Down_Out"], st.name);

            if (KOSEI_STATIONS_MAP[i]) {
                const kName = KOSEI_STATIONS_MAP[i];
                this.drawStationBox(ctx, kName, x, (tY["Kosei_Up"] + tY["Kosei_Down"]) / 2);
                this.drawStationTracksStatic(ctx, x, tY["Kosei_Up"], tY["Kosei_Up"], tY["Kosei_Down"], tY["Kosei_Down"], kName);
            }
            if (FUKUCHI_STATIONS_MAP[i]) {
                const fName = FUKUCHI_STATIONS_MAP[i];
                this.drawStationBox(ctx, fName, x, (tY["Fukuchi_Up"] + tY["Fukuchi_Down"]) / 2);
                this.drawStationTracksStatic(ctx, x, tY["Fukuchi_Up"], tY["Fukuchi_Up"], tY["Fukuchi_Down"], tY["Fukuchi_Down"], fName);
            }
            if (TOZAI_STATIONS_MAP[i]) {
                const tName = TOZAI_STATIONS_MAP[i];
                this.drawStationBox(ctx, tName, x, (tY["Tozai_Up"] + tY["Tozai_Down"]) / 2);
                this.drawStationTracksStatic(ctx, x, tY["Tozai_Up"], tY["Tozai_Up"], tY["Tozai_Down"], tY["Tozai_Down"], tName);
            }
            if (AKO_STATIONS_MAP[i]) {
                const aName = AKO_STATIONS_MAP[i];
                this.drawStationBox(ctx, aName, x, (tY["Ako_Up"] + tY["Ako_Down"]) / 2);
                this.drawStationTracksStatic(ctx, x, tY["Ako_Up"], tY["Ako_Up"], tY["Ako_Down"], tY["Ako_Down"], aName);
            }
        });
    }

    drawStationBox(ctx, name, x, y) {
        const boxW = 120, boxH = 24;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.strokeStyle = "#999999"; ctx.lineWidth = 1;
        ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.fillStyle = "#000000";
        ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(name, x, y);
    }

    drawStationTracksStatic(ctx, cx, upOutY, upInY, downInY, downOutY, stationName) {
        const w = 120;
        const x1 = cx - w / 2;
        const rule = STATION_PLATFORM_RULES[stationName];
        if (!rule || rule.type === "none") return;
        // 番線の縦位置は Super-TID の線路図と共通の関数で求める (js/03-stations.js)
        const yPositions = stationLaneYPositions(stationName, upOutY, upInY, downInY, downOutY);

        ctx.font = "bold 13px 'Meiryo UI', 'Yu Gothic', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        const drawNumber = (num, tx, ty) => {
            if (!num) return;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3; ctx.strokeText(num, tx, ty);
            ctx.fillStyle = "#000000"; ctx.fillText(num, tx, ty);
        };
        const drawLane = (yBase, label, hasPlat, isUp) => {
            const platY = isUp ? yBase + 6 : yBase - 21;
            const textY = yBase - 2;
            if (hasPlat) {
                ctx.fillStyle = "#F8EC45";
                ctx.fillRect(x1, platY, w, 5);
                ctx.strokeStyle = "#000000"; ctx.lineWidth = 1; ctx.strokeRect(x1, platY, w, 5);
            } else {
                ctx.strokeStyle = "#888";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x1, yBase); ctx.lineTo(x1 + w, yBase); ctx.stroke();
            }
            drawNumber(label, x1 - 15, textY);
        };

        for (let i = 0; i < rule.lanes.length; i++) {
            if (i < yPositions.length) {
                const isUp = (yPositions[i] < (upInY + downInY) / 2);
                drawLane(yPositions[i], rule.labels[i], rule.lanes[i], isUp);
            }
        }
    }

    drawStationTracksSingle(ctx, cx, count, mainY, dirY) {
        const w = 50;
        const x1 = cx-w/2; const x2 = cx+w/2;
        ctx.strokeStyle = CONFIG.lineSub; ctx.lineWidth=1;
        for(let i=1; i<count; i++) {
            let y = mainY + (i*28*dirY);
            ctx.beginPath();
            ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        }
    }

    // ================================================================ 描画
    draw() {
        if (!this.canvas) return;
        const sc = this.game.scrollContainer;
        // 画面の大きさが変わっていたら合わせ直す
        if (sc && sc.clientWidth && (sc.clientWidth !== this.viewW || sc.clientHeight !== this.viewH)) {
            this.resize();
        }

        const vp = this.viewport();
        const ctx = this.ctx;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.viewW, this.viewH);
        // スクロール量ぶん平行移動する。以降はワールド座標のまま描ける。
        ctx.translate(-vp.left, -vp.top);

        const viewMin = vp.left - 200, viewMax = vp.right + 200;
        this.drawBackgroundRange(ctx, viewMin, viewMax);
        this.drawDepots(ctx, viewMin, viewMax);
        this.drawSuspensions(ctx, viewMin, viewMax);
        this.drawTrains(ctx, viewMin, viewMax);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** 留置場の枠と、そこに居る列車 */
    drawDepots(ctx, viewMin, viewMax) {
        for (const stName in DEPOTS) {
            const dep = DEPOTS[stName];
            const g = this.depotGeometry(stName);
            if (!g) continue;
            if (g.cx < viewMin - 200 || g.cx > viewMax + 200) continue;

            const boxH = 24;
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px 'Meiryo UI', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText("【留置】" + dep.display, g.cx, g.startY - boxH / 2 - 20);

            ctx.fillStyle = "#88ccff";
            ctx.font = "10px 'Meiryo UI', sans-serif";
            const queueLen = this.game.fleet.poolAt(stName).length;
            ctx.fillText("▶ 待機車両: " + queueLen + "編成 (タップで詳細)", g.cx, g.startY - boxH / 2 - 8);

            for (let i = 0; i < dep.capacity; i++) {
                const y = g.startY + i * (boxH + 4);
                const t = dep.trains[i];
                const bw = 120, bh = 24;
                const lx = g.cx - bw / 2, ly = y;

                if (!t) {
                    ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
                    ctx.strokeRect(lx, ly - bh / 2, bw, bh);
                    continue;
                }
                const tw = (t.type === "特急" ? 80 : 60);
                if (!t.depotOutConfig) {
                    ctx.fillStyle = CONFIG.colors["回送"].bg;
                    ctx.fillRect(lx, ly - bh / 2, bw, bh);
                    ctx.fillStyle = CONFIG.colors["回送"].text;
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    if (t.vehicles && t.vehicles.length > 0) {
                        ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
                        ctx.fillText("留置 " + t.vehicles.map(v => v.id).join("+"), lx + bw / 2, ly);
                    } else {
                        ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                        ctx.fillText("留置", lx + bw / 2, ly);
                    }
                } else {
                    let displayType, displayNo, displayDest, bgColor, textColor;
                    if (t.timer > 120 && t.oldInfo) {
                        displayType = t.oldInfo.type;
                        displayNo = t.oldInfo.trainNo;
                        displayDest = t.oldInfo.dest;
                        bgColor = "#000000"; textColor = "#ffffff";
                    } else {
                        displayType = t.depotOutConfig.type;
                        displayNo = t.depotOutConfig.trainNo;
                        displayDest = t.depotOutConfig.dest;
                        const cdata = CONFIG.colors[displayType] || CONFIG.colors["普通"];
                        bgColor = cdata.bg; textColor = cdata.text;
                        if (displayType === "新快速" && t.isKoseiRoute) bgColor = "#00bfff";
                    }
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(lx, ly - bh / 2, tw, bh);
                    ctx.fillStyle = textColor;
                    ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText(displayNo, lx + tw / 2, ly);

                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(lx + tw, ly - bh / 2, bw - tw, bh);
                    ctx.fillStyle = "#000000";
                    let dTxt = displayDest || "";
                    if (dTxt.length === 2) dTxt = dTxt[0] + "  " + dTxt[1];
                    else if (dTxt.length === 1) dTxt = " " + dTxt + " ";
                    ctx.fillText(dTxt, lx + tw + (bw - tw) / 2, ly);
                }
                ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
                ctx.strokeRect(lx, ly - bh / 2, bw, bh);
            }
        }
        ctx.lineWidth = 1;
    }

    /** 運転見合わせ区間・徐行区間 */
    drawSuspensions(ctx, viewMin, viewMax) {
        const drawLine = (tid, s, e, col) => {
            const blks = this.game.trackMgr.blocks[tid];
            if (!blks || s >= blks.length || e >= blks.length) return;
            if (blks[e].x < viewMin || blks[s].x > viewMax) return;
            ctx.strokeStyle = col; ctx.lineWidth = 10;
            ctx.beginPath(); ctx.moveTo(blks[s].x - 35, blks[s].y); ctx.lineTo(blks[e].x + 35, blks[s].y); ctx.stroke();
        };
        for (const m of this.game.trackMgr.manualSuspensions) drawLine(m.trackId, m.start, m.end, "#ff00ff");
        for (const tid in this.game.trackMgr.suspendedSections) {
            this.game.trackMgr.suspendedSections[tid].forEach(s => drawLine(tid, s.start, s.end, CONFIG.jammed));
        }
        // 輸送障害からの復旧後の徐行 (速度規制)
        this.game.trackMgr.speedRestrictions.forEach(r => drawLine(r.trackId, r.start, r.end, "#ffaa00"));
    }

    /** 列車 */
    drawTrains(ctx, viewMin, viewMax) {
        ctx.lineWidth = 5;
        this.game.trains.forEach(t => {
            if (t.state === "in_depot") return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const b = blks[t.currBlockIndex];
            if (!b || b.x < viewMin || b.x > viewMax) return;

            // 貨物ターミナルの着発線に居る列車は、構内の中に描く
            if (isFreightTerminalTrack(t.trackId)) {
                const key = freightTerminalOfTrack(t.trackId);
                const p = this.freightYardGeometry(key).pos(t.trackId, t.lane);
                this.drawTrainLabelAt(ctx, t, p.x, p.y);
                return;
            }

            // 進路 (前方の閉塞が空いている方向)
            ctx.strokeStyle = CONFIG.route;
            const nextB = blks[t.currBlockIndex + t.dir];
            if (nextB && nextB.lanes[0] === null) {
                ctx.beginPath(); ctx.moveTo(nextB.x - 60, nextB.y); ctx.lineTo(nextB.x + 60, nextB.y); ctx.stroke();
            }

            let dy = b.y;
            {
                /* ★番線の縦位置は、番線名と同じ対応表から引く
                   (js/03-stations.js の stationLaneY)。

                   以前は 尼崎 (stationIdx 36) だけ4要素の決め打ち表を持っていた。
                   尼崎は島式4面8線＋通過線で 上り5・下り4 の着発線があるので、
                   レーン4の列車は undefined になり、その列車が乗っている線路
                   (JR東西線・JR宝塚線) の帯の高さに落ちていた。
                   そこには線路もホームも描かれていない。
                   番線を共有する駅では、どの線区の列車も本線の着発線に描く。 */
                const stName = blockStationName(b);
                const tY = this.game.trackMgr.trackY;
                const onBranch = (typeof stationBranchLine === "function")
                    ? !!stationBranchLine(stName) : false;
                let laneY = null;
                if (stName && STATION_PLATFORM_RULES[stName] &&
                    (b.isStation || b.hoppoStationName) && !onBranch) {
                    laneY = stationLaneY(stName, t.trackId, t.lane,
                                         tY["Up_Out"], tY["Up_In"], tY["Down_In"], tY["Down_Out"]);
                }
                if (laneY !== null && laneY !== undefined) dy = laneY;
                else dy += (t.lane > 0) ? t.lane * (t.trackId.startsWith("Up") ? -35 : 35) : 0;
            }
            if (dy === undefined) dy = b.y;

            let col = CONFIG.occupy;
            if (t.isDecelerating) col = "#ffaa00";
            if (["stopped", "turning_back"].includes(t.state)) col = CONFIG.stopped;
            else if (["waiting_start", "holding"].includes(t.state)) col = "#ffff00";
            if (t.state === "holding" && this.game.trackMgr.isSuspended(t.trackId, t.currBlockIndex)) col = CONFIG.jammed;

            ctx.strokeStyle = col; ctx.beginPath();
            ctx.moveTo(b.x - 60, dy); ctx.lineTo(b.x + 60, dy); ctx.stroke();

            this.drawTrainLabelAt(ctx, t, b.x, dy);
        });
    }

    /** 列車の札 (列車番号・行先・遅れ) を (x, dy) に描く */
    drawTrainLabelAt(ctx, t, x, dy) {
        {
            const bw = 100, bh = 24, tw = (t.type === "特急" ? 75 : 55), lx = x - bw / 2, ly = dy - bh / 2;
            const cdata = CONFIG.colors[t.type] || CONFIG.colors["普通"];
            let bgColor = cdata.bg;
            if (t.type === "新快速" && t.isKoseiRoute) bgColor = "#00bfff";

            if (t.vehicles && t.vehicles.length > 0) {
                ctx.fillStyle = "#ffffff";
                ctx.font = "9px 'Meiryo UI'";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(t.vehicles.map(v => v.id).join("+"), lx + tw / 2, ly - 12);
            }

            ctx.fillStyle = bgColor;
            ctx.fillRect(lx, ly - 8, tw, bh);
            ctx.fillStyle = cdata.text;
            ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(t.trainNo, lx + tw / 2, ly + 4);

            ctx.fillStyle = "#fff"; ctx.fillRect(lx + tw, ly - 8, bw - tw, bh);
            ctx.fillStyle = "#000";
            let dTxt = t.dest || "";
            if (dTxt.length === 2) dTxt = dTxt[0] + "  " + dTxt[1];
            else if (dTxt.length === 1) dTxt = " " + dTxt + " ";
            ctx.fillText(dTxt, lx + tw + (bw - tw) / 2, ly + 4);

            let border = "#333", w = 1;
            const blink = Math.floor(Date.now() / 500) % 2 === 0;
            if (t.isManuallySuspended || this.game.isEmergency) { border = blink ? "#f00" : "#ff0"; w = 3; }
            else if (t.minorTrouble) { border = "#800080"; w = 3; }
            ctx.strokeStyle = border; ctx.lineWidth = w;
            ctx.strokeRect(lx, ly - 8, bw, bh);

            const delayMinutes = Math.floor(t.delayTime / 60);
            if (delayMinutes >= 1) {
                const sz = 16;
                const dlx = lx - sz - 2, dly = ly - 8 + (bh - sz) / 2;
                ctx.fillStyle = "#ffffff"; ctx.fillRect(dlx, dly, sz, sz);
                ctx.strokeStyle = "#ff0000"; ctx.lineWidth = 1; ctx.strokeRect(dlx, dly, sz, sz);
                ctx.fillStyle = "#ff0000";
                ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(String(delayMinutes), dlx + sz / 2, dly + sz / 2 + 1);
            }
        }
    }
}
