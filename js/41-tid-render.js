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

        // 表示の切り替え (画面の「表示」メニューから変える)
        this.show = { signal: true, occupy: true, fleet: true, route: true, platform: true };

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
        const spacer = document.getElementById("tid-spacer");
        if (spacer) {
            spacer.style.width = TOTAL_WIDTH + "px";
            spacer.style.height = this.height + "px";
        }
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

    viewport() {
        const left = this.scroll.scrollLeft || 0;
        const top = this.scroll.scrollTop || 0;
        return { left: left, top: top, right: left + this.viewW, bottom: top + this.viewH };
    }

    toWorld(clientX, clientY) {
        const rect = this.scroll.getBoundingClientRect();
        return {
            x: (clientX - rect.left) + (this.scroll.scrollLeft || 0),
            y: (clientY - rect.top) + (this.scroll.scrollTop || 0)
        };
    }

    /** 指定のワールド座標へスクロールする (画面の中央に来るように) */
    scrollToStation(name) {
        const idx = STATION_MAP[name];
        if (idx === undefined) return;
        this.scroll.scrollLeft = Math.max(0, tidStationX(idx) - this.viewW / 2);
    }

    // ============================================================ 当たり判定
    buildStationHits() {
        this.hitStations = [];
        const topY = TID_GEO.topPad - 40;
        const botY = this.height - TID_GEO.bottomPad + 26;
        const add = (name, x, y) => {
            const w = Math.max(TID_GEO.plateW, name.length * 15 + 22);
            this.hitStations.push({ name: name, x: x - w / 2, y: y - 11, w: w, h: 22 });
        };
        STATIONS.forEach((st, i) => {
            const x = tidStationX(i);
            add(st.name, x, topY);
            add(st.name, x, botY);
        });
        // 分岐線の駅は、その線区の帯のところに札を出す
        const branch = [
            [KOSEI_STATIONS_MAP, "Kosei_Down"],
            [FUKUCHI_STATIONS_MAP, "Fukuchi_Down"],
            [TOZAI_STATIONS_MAP, "Tozai_Down"]
        ];
        branch.forEach(([map, tid]) => {
            if (this.trackY[tid] === undefined) return;   // その線区を表示していない
            for (const k in map) {
                add(map[k], tidStationX(Number(k)), this.trackY[tid] - 30);
            }
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
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = TID_COLORS.bg;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
        ctx.translate(-vp.left, -vp.top);

        const xMin = vp.left - 300, xMax = vp.right + 300;
        this.hitTrains = [];
        this.hitDepots = [];

        this.drawTracks(ctx, xMin, xMax);
        this.drawStations(ctx, xMin, xMax);
        if (this.show.route) this.drawRoutes(ctx, xMin, xMax);
        if (this.show.signal) this.drawSignals(ctx, xMin, xMax);
        this.drawDepots(ctx, xMin, xMax);
        this.drawTrains(ctx, xMin, xMax);

        // 線名は画面の左端に貼り付けて出す (スクロールしても隠れない)
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.drawRowLabels(ctx, vp);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** 線名 (下り外・上り内 など) を画面の左端に固定して出す */
    drawRowLabels(ctx, vp) {
        ctx.font = "bold 10px 'Meiryo UI', sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        this.rows().forEach(row => {
            const y = this.trackY[row.id] - vp.top;
            if (y < 8 || y > this.viewH - 8) return;
            const w = ctx.measureText(row.label).width + 10;
            ctx.fillStyle = "rgba(43,53,80,0.88)";
            ctx.fillRect(2, y - 17, w, 13);
            ctx.fillStyle = "#EAF0FF";
            ctx.fillText(row.label, 7, y - 10.5);
        });
    }

    /** 線路と軌道回路 */
    drawTracks(ctx, xMin, xMax) {
        this.rows().forEach(row => {
            const blks = this.game.trackMgr.blocks[row.id];
            if (!blks) return;
            const y = this.trackY[row.id];
            const range = tidTrackRange(row.id);
            const sX = tidStationX(range[0]), eX = tidStationX(range[1]);
            const a = Math.max(sX, xMin), b = Math.min(eX, xMax);
            if (b <= a) return;

            // 本線 (在線していない部分)
            tidDrawRail(ctx, a, b, y);

            // 軌道回路ごとの在線
            for (let i = 0; i < blks.length; i++) {
                const blk = blks[i];
                if (blk.x === -1000) continue;
                if (blk.x < xMin - BLOCK_WIDTH || blk.x > xMax + BLOCK_WIDTH) continue;
                const x1 = blk.x - BLOCK_WIDTH / 2 + 2;
                const x2 = blk.x + BLOCK_WIDTH / 2 - 2;

                const busy = blk.lanes.some(l => l !== null);
                if (this.show.occupy && busy) {
                    tidDrawRail(ctx, x1, x2, y, TID_COLORS.occupied);
                }
                // 運転見合わせ・障害
                if (this.game.trackMgr.isSuspended(row.id, i)) {
                    ctx.strokeStyle = TID_COLORS.fault;
                    ctx.lineWidth = 4;
                    ctx.setLineDash([7, 5]);
                    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
                    ctx.setLineDash([]);
                } else if (this.game.signals.hasFault(row.id, i)) {
                    ctx.strokeStyle = TID_COLORS.caution;
                    ctx.lineWidth = 4;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
                    ctx.setLineDash([]);
                }
                // 徐行
                if (this.game.trackMgr.speedFactor(row.id, i) > 1.0) {
                    ctx.strokeStyle = "#FF9A1E";
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x1, y + 6); ctx.lineTo(x2, y + 6); ctx.stroke();
                }
                // 軌道回路の境目
                tidDrawCircuitMark(ctx, blk.x + BLOCK_WIDTH / 2, y);
            }

        });
    }

    /** 駅 (駅名札・番線・ホーム・分岐) */
    drawStations(ctx, xMin, xMax) {
        const tY = this.trackY;
        const topY = TID_GEO.topPad - 40;
        const botY = this.height - TID_GEO.bottomPad + 26;

        STATIONS.forEach((st, i) => {
            const x = tidStationX(i);
            if (x < xMin - 200 || x > xMax + 200) return;

            // 駅の位置を示す縦の薄い線
            ctx.strokeStyle = TID_COLORS.grid;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, this.height - 24); ctx.stroke();

            tidDrawPlate(ctx, st.name, x, topY);
            tidDrawPlate(ctx, st.name, x, botY);

            // 渡り線・他線区との分岐・支線 (配線略図をもとにした TID_JUNCTIONS)。
            // 番線より先に描いて、線路の下の層に来るようにする。
            this.drawJunctions(ctx, st.name, x);

            // 本線の番線 (旅客向けの線路図と同じ並びを Super-TID の間隔に当てはめる)
            if (tY["Up_Out"] !== undefined) {
                this.drawStationLanes(ctx, st.name, x, tY["Up_Out"], false);
            }

            // 分岐線の駅
            [[KOSEI_STATIONS_MAP, "Kosei_Up", "Kosei_Down"],
             [FUKUCHI_STATIONS_MAP, "Fukuchi_Up", "Fukuchi_Down"],
             [TOZAI_STATIONS_MAP, "Tozai_Up", "Tozai_Down"]].forEach(def => {
                const n = def[0][i];
                if (!n || tY[def[1]] === undefined) return;
                tidDrawPlate(ctx, n, x, tY[def[2]] - 30);
                this.drawJunctions(ctx, n, x);
                this.drawStationLanes(ctx, n, x, tY[def[1]], true);
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

        (def.crossovers || []).forEach(c => {
            const yA = tY[c[0]], yB = tY[c[1]];
            if (yA === undefined || yB === undefined) return;
            tidDrawCrossover(ctx, cx, Math.min(yA, yB), Math.max(yA, yB), c[2]);
        });

        (def.junctions || []).forEach(j => {
            const yMain = tY[j[0]], yBranch = tY[j[1]];
            if (yMain === undefined || yBranch === undefined) return;
            tidDrawJunction(ctx, cx, yMain, yBranch, j[2]);
        });

        // 同じ向きに複数の支線が出るときは、重ならないようにずらす
        const usedUp = {}, usedDown = {};
        (def.stubs || []).forEach(s => {
            const y = tY[s.from];
            if (y === undefined) return;
            const key = s.side + (s.up ? "U" : "D");
            const bag = s.up ? usedUp : usedDown;
            const order = bag[key] || 0;
            bag[key] = order + 1;
            tidDrawStub(ctx, cx, y, s.up, s.label, s.side, order);
        });
    }

    /** 駅の番線とホームを描く */
    drawStationLanes(ctx, stName, cx, refUpOutY, branch) {
        const rule = STATION_PLATFORM_RULES[stName];
        if (!rule) return;
        const ys = tidStationLaneYs(stName, refUpOutY, branch);
        const w = BLOCK_WIDTH * 0.95;
        // 本線 (そのまま真っ直ぐ通る線) の縦位置
        const mains = this.rows().map(r => this.trackY[r.id]);
        const isMain = (y) => mains.some(m => Math.abs(m - y) < 1.5);
        // 上り側か下り側か (上り側は下半分に来る)
        const mid = refUpOutY - TID_GEO.rowGap * 1.5;

        for (let i = 0; i < rule.lanes.length && i < ys.length; i++) {
            const y = ys[i];
            if (!isMain(y)) {
                // 待避線・副本線。前後に渡り線を付けて本線につなぐ。
                tidDrawRail(ctx, cx - w / 2, cx + w / 2, y);
                const base = mains.reduce((best, m) =>
                    Math.abs(m - y) < Math.abs(best - y) ? m : best, mains[0]);
                ctx.strokeStyle = TID_COLORS.railEdge; ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - w / 2 - 22, base);
                ctx.moveTo(cx + w / 2, y); ctx.lineTo(cx + w / 2 + 22, base);
                ctx.stroke();
                ctx.strokeStyle = TID_COLORS.rail; ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - w / 2 - 22, base);
                ctx.moveTo(cx + w / 2, y); ctx.lineTo(cx + w / 2 + 22, base);
                ctx.stroke();
            }
            if (this.show.platform && rule.lanes[i]) {
                tidDrawPlatform(ctx, cx, y, rule.labels[i], y >= mid);
            }
        }
    }

    /** 進路 (信号が開通している区間を緑で塗る) */
    drawRoutes(ctx, xMin, xMax) {
        this.game.trains.forEach(t => {
            if (t.state === "in_depot" || t.state === "finished") return;
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const here = blks[t.currBlockIndex];
            if (!here || here.x < xMin - 400 || here.x > xMax + 400) return;
            const y = this.trackY[t.trackId];
            if (y === undefined) return;   // その線区を表示していない
            const route = this.game.signals.routeBlocks(t, 3);
            route.forEach(idx => {
                const b = blks[idx];
                if (!b || b.x === -1000) return;
                tidDrawRail(ctx, b.x - BLOCK_WIDTH / 2 + 2, b.x + BLOCK_WIDTH / 2 - 2, y, TID_COLORS.route);
            });
        });
    }

    /** 信号機 */
    drawSignals(ctx, xMin, xMax) {
        this.rows().forEach(row => {
            const y = this.trackY[row.id];
            const sigs = this.game.signals.signalsInRange(row.id, row.dir, xMin, xMax);
            sigs.forEach(s => tidDrawSignal(ctx, s.x, y, row.dir, s.aspect, s.kind));
        });
    }

    /** 留置場 */
    drawDepots(ctx, xMin, xMax) {
        for (const name in DEPOTS) {
            const dep = DEPOTS[name];
            const idx = (name === "宮原操") ? 39 : (name === "向日町操") ? 51 : STATION_MAP[name];
            if (idx === undefined) continue;
            const x = tidStationX(idx) + (dep.drawOffset.x * BLOCK_WIDTH * UNITS_PER_STATION);
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
            if (!b || b.x === -1000 || b.x < xMin || b.x > xMax) return;
            const baseY = this.trackY[t.trackId];
            if (baseY === undefined) return;

            const y = this.laneY(t, b, baseY);
            tidDrawOccupyDot(ctx, b.x, y);

            const box = tidDrawTrainLabel(ctx, t, b.x, y - 16, { showFleet: this.show.fleet });
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

    /** その列車が居る番線の縦位置 */
    laneY(t, blk, baseY) {
        const stName = blockStationName(blk);
        if (stName && STATION_PLATFORM_RULES[stName] && (blk.isStation || blk.hoppoStationName)) {
            const tY = this.trackY;
            let ys = null;
            if (t.trackId.indexOf("Kosei") === 0 && tY["Kosei_Up"] !== undefined) {
                ys = tidStationLaneYs(stName, tY["Kosei_Up"], true);
            } else if (t.trackId.indexOf("Fukuchi") === 0 && tY["Fukuchi_Up"] !== undefined) {
                ys = tidStationLaneYs(stName, tY["Fukuchi_Up"], true);
            } else if (t.trackId.indexOf("Tozai") === 0 && tY["Tozai_Up"] !== undefined) {
                ys = tidStationLaneYs(stName, tY["Tozai_Up"], true);
            } else if (tY["Up_Out"] !== undefined) {
                ys = tidStationLaneYs(stName, tY["Up_Out"], false);
            }
            if (ys && ys.length) {
                // その線路の本線に近い番線から順に、レーン番号ぶんずらす
                const cand = ys.filter(v => Math.abs(v - baseY) <= TID_GEO.rowGap * 0.85);
                if (cand.length) {
                    cand.sort((a, b2) => Math.abs(a - baseY) - Math.abs(b2 - baseY));
                    return cand[Math.min(t.lane, cand.length - 1)];
                }
            }
        }
        return baseY + (t.lane > 0 ? t.lane * (t.dir === 1 ? 18 : -18) : 0);
    }
}
