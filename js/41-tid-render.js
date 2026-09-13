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
        const topY = TID_GEO.topPad - TID_GEO.plateTopGap;
        const botY = this.height - TID_GEO.bottomPad -
                     (TID_ROWS[TID_ROWS.length - 1].gap || TID_GEO.rowGap) + TID_GEO.plateBotGap;
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

            // 本線 (在線していない部分)
            tidDrawRail(ctx, a, b, y);

            // 軌道回路ごとの在線
            for (let i = 0; i < blks.length; i++) {
                const blk = blks[i];
                if (blk.x === -1000) continue;
                const bx = tidX(blk.x);
                if (bx < xMin - BLOCK_WIDTH || bx > xMax + BLOCK_WIDTH) continue;
                const x1 = bx - BLOCK_WIDTH / 2 + 2;
                const x2 = bx + BLOCK_WIDTH / 2 - 2;

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
                /* 軌道回路の境目。
                   実物は境目ごとに白い丸が並ぶ。閉塞の区切りは
                   TrackManager のブロックそのものなので、
                   見た目だけの丸は足していない。 */
                tidDrawCircuitMark(ctx, bx + BLOCK_WIDTH / 2, y);
            }

        });
    }

    /** 駅 (駅名札・番線・ホーム・分岐) */
    drawStations(ctx, xMin, xMax) {
        const tY = this.trackY;
        const topY = TID_GEO.topPad - TID_GEO.plateTopGap;
        const botY = this.height - TID_GEO.bottomPad -
                     (TID_ROWS[TID_ROWS.length - 1].gap || TID_GEO.rowGap) + TID_GEO.plateBotGap;

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

            // 発着予告 (その駅の線路ごとに、次に来る列車を出す)
            this.drawPredictions(ctx, st.name, x);

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
            tidDrawCrossover(ctx, cx, Math.min(yA, yB), Math.max(yA, yB), tidShape(c[2]));
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
            const key = tidSide(s.side) + (s.up ? "U" : "D");
            const bag = s.up ? usedUp : usedDown;
            const order = bag[key] || 0;
            bag[key] = order + 1;
            tidDrawStub(ctx, cx, y, s.up, s.label, tidSide(s.side), order);
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
            const px = (row.dir === -1) ? (cx + 88) : (cx - 88);
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
        const ys = tidStationLaneYs(stName, refUpOutY, branch);
        const w = BLOCK_WIDTH * 0.95;
        // 本線 (そのまま真っ直ぐ通る線) の縦位置
        const mains = this.rows().map(r => this.trackY[r.id]);
        const isMain = (y) => mains.some(m => Math.abs(m - y) < 1.5);

        // 着発線を画面の上から下の順に並べ直す (ホームの組を作るため)
        const n = Math.min(rule.lanes.length, ys.length);
        const lanes = [];
        for (let i = 0; i < n; i++) {
            lanes.push({ y: ys[i], label: rule.labels[i], plat: !!rule.lanes[i] });
        }
        lanes.sort((a, b) => a.y - b.y);

        // 転てつ器があるのは、渡り線・分岐のある駅か、副本線を持つ駅
        const hasPoints = !!TID_JUNCTIONS[stName] || lanes.some(l => !isMain(l.y));

        lanes.forEach(ln => {
            if (!isMain(ln.y)) {
                // 待避線・副本線。前後に渡り線を付けて本線につなぐ。
                tidDrawRail(ctx, cx - w / 2, cx + w / 2, ln.y);
                const base = mains.reduce((best, m) =>
                    Math.abs(m - ln.y) < Math.abs(best - ln.y) ? m : best, mains[0]);
                ctx.strokeStyle = TID_COLORS.railEdge; ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, ln.y); ctx.lineTo(cx - w / 2 - 22, base);
                ctx.moveTo(cx + w / 2, ln.y); ctx.lineTo(cx + w / 2 + 22, base);
                ctx.stroke();
                ctx.strokeStyle = TID_COLORS.rail; ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(cx - w / 2, ln.y); ctx.lineTo(cx - w / 2 - 22, base);
                ctx.moveTo(cx + w / 2, ln.y); ctx.lineTo(cx + w / 2 + 22, base);
                ctx.stroke();
            }
            // 構内 (着発線) の枠
            tidDrawStationTrackBox(ctx, cx, ln.y, w);
            // 構内の入口の転てつ器 (実物は構内の枠のすぐ外側に白い四角)
            if (hasPoints) tidDrawTurnoutBox(ctx, cx - w / 2 - 9, ln.y);
        });

        // ホーム帯。上から順に、ホームのある着発線を2本ずつ組にする。
        if (this.show.platform) {
            const p = lanes.filter(l => l.plat);
            for (let i = 0; i < p.length; i += 2) {
                const upper = p[i], lower = p[i + 1];
                if (lower) {
                    tidDrawPlatform(ctx, cx, upper.y, lower.y, upper.label, lower.label);
                } else {
                    // 相手のいない片面ホームは、その線路のすぐ下に置く
                    tidDrawPlatform(ctx, cx, upper.y, upper.y + 24, upper.label, null);
                }
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
                tidDrawRail(ctx, bx - BLOCK_WIDTH / 2 + 2, bx + BLOCK_WIDTH / 2 - 2, y, TID_COLORS.route);
            });
        });
    }

    /** 信号機 */
    drawSignals(ctx, xMin, xMax) {
        this.rows().forEach(row => {
            const y = this.trackY[row.id];
            /* signalsInRange はシミュレーションの座標で範囲を受け取るので、
               画面の範囲を内部座標に戻してから渡す。 */
            const wMin = Math.min(tidX(xMin), tidX(xMax));
            const wMax = Math.max(tidX(xMin), tidX(xMax));
            const sigs = this.game.signals.signalsInRange(row.id, row.dir, wMin, wMax);
            sigs.forEach(s => tidDrawSignal(ctx, tidX(s.x), y, row.dir, s.aspect, s.kind));
        });
    }

    /** 留置場 */
    drawDepots(ctx, xMin, xMax) {
        for (const name in DEPOTS) {
            const dep = DEPOTS[name];
            const idx = (name === "宮原操") ? 39 : (name === "向日町操") ? 51 : STATION_MAP[name];
            if (idx === undefined) continue;
            const x = tidStationX(idx) - (dep.drawOffset.x * BLOCK_WIDTH * UNITS_PER_STATION);
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
               発着予告と上下で分かれるので、どちらも読めるようになる。 */
            const labelY = (t.dir === -1) ? (y - 16) : (y + 16);
            const box = tidDrawTrainLabel(ctx, t, bx, labelY,
                { showFleet: this.show.fleet, below: (t.dir === 1) });
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
