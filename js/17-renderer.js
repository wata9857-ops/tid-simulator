/* このファイルは index.html から分割されたものです。
   Renderer (キャンバス描画) */
/**
 * ==================================================
 * 5. Renderer (描画 - 完全移植版)
 * ==================================================
 */
class Renderer {


    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById("tidCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.bgCanvas = null;
        
        this.canvas.width = TOTAL_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        this.canvas.style.width = TOTAL_WIDTH + "px";
        this.canvas.style.height = CANVAS_HEIGHT + "px";

        this.stationHitboxes = []; // ★この1行を追加してください！
        this.depotHitboxes = [];   // ★追加: 留置場のヒットボックス
        
        this.createBackground();
        // ★追加: キャンバス上のクリックイベントを取得し、駅の座標と一致するか判定
        this.canvas.addEventListener("click", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            // 修正: キャンバス自体がスクロールしているので scrollL の加算は不要（二重加算による位置ズレを防止）
            let clickX = (e.clientX - rect.left) * scaleX;
            let clickY = (e.clientY - rect.top) * scaleY;

            // ★追加: 留置場の判定を先に行う
            for (let box of this.depotHitboxes) {
                if (clickX >= box.x && clickX <= box.x + box.w &&
                    clickY >= box.y && clickY <= box.y + box.h) {
                    showDepotModal(box.name);
                    return; // 留置場をクリックしたら駅の判定はスキップ
                }
            }

            for (let box of this.stationHitboxes) {
                if (clickX >= box.x && clickX <= box.x + box.w &&
                    clickY >= box.y && clickY <= box.y + box.h) {
                    // 一致したら発車標を表示
                    this.game.ui.showDepartureBoard(box.name);
                    break;
                }
            }
        });
    }

    createBackground() {
        this.bgCanvas = document.createElement('canvas');
        this.bgCanvas.width = TOTAL_WIDTH; this.bgCanvas.height = CANVAS_HEIGHT;
        const bCtx = this.bgCanvas.getContext('2d');
        const tY = this.game.trackMgr.trackY;

        bCtx.fillStyle = CONFIG.bg;
        bCtx.fillRect(0, 0, TOTAL_WIDTH, CANVAS_HEIGHT);
        
        const drawStationBox = (ctx, name, x, y) => {
            const boxW = 120, boxH = 24;
            ctx.fillStyle = "#ffffff"; ctx.fillRect(x - boxW/2, y - boxH/2, boxW, boxH);
            ctx.strokeStyle = "#999999"; ctx.lineWidth = 1;
            ctx.strokeRect(x - boxW/2, y - boxH/2, boxW, boxH);
            ctx.fillStyle = "#000000"; ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle"; ctx.fillText(name, x, y);

        // ★追加: 描画した駅の座標(ヒットボックス)を配列に記憶させる
            this.stationHitboxes.push({ name: name, x: x - boxW/2, y: y - boxH/2, w: boxW, h: boxH });
        };
        const freightMap = { "ひめじ別所": "姫路タ", "鷹取": "神戸タ", "西大路": "京都タ" };
        
        // ★修正: インデックスを均等に配置
        const KOSEI_STATIONS = {
            57: "大津京", 58: "唐崎", 60: "比叡山坂本", 61: "おごと温泉", 63: "堅田", 64: "小野",
            65: "和邇", 67: "蓬莱", 68: "志賀", 70: "比良", 71: "近江舞子", 72: "北小松",
            74: "近江高島", 75: "安曇川", 77: "新旭", 78: "近江今津", 79: "近江中庄", 81: "マキノ", 82: "永原"
        };
        const FUKUCHI_STATIONS_MAP = {
            23: "新三田", 24: "三田", 25: "道場", 26: "武田尾",
            27: "西宮名塩", 28: "生瀬", 29: "宝塚", 30: "中山寺",
            31: "川西池田", 32: "北伊丹", 33: "伊丹", 34: "猪名寺", 35: "塚口"
        };
        const TOZAI_STATIONS_MAP = {
            37: "加島", 38: "御幣島", 39: "海老江", 40: "新福島", 41: "北新地",
            42: "大阪天満宮", 43: "大阪城北詰", 44: "京橋", 45: "鴫野", 46: "放出"
        };

        STATIONS.forEach((st, i) => {
            const x = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
            bCtx.strokeStyle = CONFIG.stationGrid; bCtx.lineWidth = 1;
            bCtx.beginPath(); bCtx.moveTo(x, 0); bCtx.lineTo(x, CANVAS_HEIGHT); bCtx.stroke();
            
            if (st.name === "向日町操") {
                 bCtx.fillStyle = "#fff"; bCtx.textAlign = "center"; bCtx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                 bCtx.fillText(st.name, x, tY["Up_Out"] - 35);
                 bCtx.fillText(st.name, x, tY["Down_Out"] + 35);
                 this.drawStationTracksStatic(bCtx, x, tY["Up_Out"], tY["Up_In"], tY["Down_In"], tY["Down_Out"], st.name);
                 return;
            } 
            
            const centerY = (tY["Up_In"] + tY["Down_In"]) / 2;
            drawStationBox(bCtx, st.name, x, centerY);
             
            if (freightMap[st.name]) {
                drawStationBox(bCtx, freightMap[st.name], x, tY["Up_Out"] - 25);
                drawStationBox(bCtx, freightMap[st.name], x, tY["Down_Out"] + 35);
            }

            if (i === 39) { 
                drawStationBox(bCtx, "宮原操", x, tY["Up_Hoppo"] - 20); 
                drawStationBox(bCtx, "宮原操", x, tY["Down_Hoppo"] + 30); 
            }
            if (i === 41) { 
                drawStationBox(bCtx, "吹田タ", x, tY["Up_Hoppo"] - 20); 
                drawStationBox(bCtx, "吹田タ", x, tY["Down_Hoppo"] + 30); 
            }

            this.drawStationTracksStatic(bCtx, x, tY["Up_Out"], tY["Up_In"], tY["Down_In"], tY["Down_Out"], st.name);

            // ★湖西線の駅を描画
            if (KOSEI_STATIONS[i]) {
                const kName = KOSEI_STATIONS[i];
                const kY = (tY["Kosei_Up"] + tY["Kosei_Down"]) / 2;
                drawStationBox(bCtx, kName, x, kY);
                this.drawStationTracksStatic(bCtx, x, tY["Kosei_Up"], tY["Kosei_Up"], tY["Kosei_Down"], tY["Kosei_Down"], kName);
            }
            // ★追加: 福知山線・東西線の駅を描画
            if (FUKUCHI_STATIONS_MAP[i]) {
                const fName = FUKUCHI_STATIONS_MAP[i];
                const fY = (tY["Fukuchi_Up"] + tY["Fukuchi_Down"]) / 2;
                drawStationBox(bCtx, fName, x, fY);
                this.drawStationTracksStatic(bCtx, x, tY["Fukuchi_Up"], tY["Fukuchi_Up"], tY["Fukuchi_Down"], tY["Fukuchi_Down"], fName);
            }
            if (TOZAI_STATIONS_MAP[i]) {
                const tName = TOZAI_STATIONS_MAP[i];
                const toY = (tY["Tozai_Up"] + tY["Tozai_Down"]) / 2;
                drawStationBox(bCtx, tName, x, toY);
                this.drawStationTracksStatic(bCtx, x, tY["Tozai_Up"], tY["Tozai_Up"], tY["Tozai_Down"], tY["Tozai_Down"], tName);
            }
        });

        TRACKS.forEach(trk => {
            const y = tY[trk.id];
            bCtx.strokeStyle = CONFIG.lineMain; bCtx.lineWidth = 3;
            
            if (trk.id.includes("Hoppo")) {
                const sX = 100 + (36 * UNITS_PER_STATION) * BLOCK_WIDTH;
                const eX = 100 + (44 * UNITS_PER_STATION) * BLOCK_WIDTH;
                bCtx.beginPath(); bCtx.moveTo(sX, y); bCtx.lineTo(eX, y); bCtx.stroke();
                if(trk.id==="Up_Hoppo") {
                     this.drawStationTracksSingle(bCtx, 100+(39*UNITS_PER_STATION)*BLOCK_WIDTH, 2, y, -1);
                     this.drawStationTracksSingle(bCtx, 100+(41*UNITS_PER_STATION)*BLOCK_WIDTH, 4, y, -1);
                } else {
                     this.drawStationTracksSingle(bCtx, 100+(39*UNITS_PER_STATION)*BLOCK_WIDTH, 2, y, 1);
                     this.drawStationTracksSingle(bCtx, 100+(41*UNITS_PER_STATION)*BLOCK_WIDTH, 4, y, 1);
                }
            } else if (trk.id.includes("Kosei")) { // ★湖西線の線路を描画
                const sX = 100 + (56 * UNITS_PER_STATION) * BLOCK_WIDTH; // 山科(56)
                const eX = 100 + (83 * UNITS_PER_STATION) * BLOCK_WIDTH; // 近江塩津(83)
                bCtx.beginPath(); 
                bCtx.moveTo(sX, y); bCtx.lineTo(eX, y); bCtx.stroke();

            // ★追加: 福知山線の直線を引く (宝塚[29]〜尼崎[36])
            } else if (trk.id.includes("Fukuchi")) {
                const sX = 100 + (23 * UNITS_PER_STATION) * BLOCK_WIDTH;
                const eX = 100 + (36 * UNITS_PER_STATION) * BLOCK_WIDTH;
                bCtx.beginPath(); bCtx.moveTo(sX, y); bCtx.lineTo(eX, y); bCtx.stroke();

            // ★追加: 東西線の直線を引く (尼崎[36]〜京橋[44])
            } else if (trk.id.includes("Tozai")) {
                const sX = 100 + (36 * UNITS_PER_STATION) * BLOCK_WIDTH;
                const eX = 100 + (TOZAI_EAST_IDX * UNITS_PER_STATION) * BLOCK_WIDTH;
                bCtx.beginPath(); bCtx.moveTo(sX, y); bCtx.lineTo(eX, y); bCtx.stroke();

            } else {
                let startX = 0;
                let endX = TOTAL_WIDTH;
                if (trk.id.includes("In")) {
                    startX = 100 + (STATION_MAP["西明石"] * UNITS_PER_STATION) * BLOCK_WIDTH;
                    endX = 100 + (STATION_MAP["草津"] * UNITS_PER_STATION) * BLOCK_WIDTH;
                }
                bCtx.beginPath();
                bCtx.moveTo(startX, y); bCtx.lineTo(endX, y); bCtx.stroke();
            }
        });
    }

    drawStationTracksStatic(ctx, cx, upOutY, upInY, downInY, downOutY, stationName) {
        const w = 120;
        const x1 = cx - w/2;
        const rule = STATION_PLATFORM_RULES[stationName];
        if (!rule || rule.type === "none") return;
        ctx.font = "bold 13px 'Meiryo UI', 'Yu Gothic', sans-serif"; 
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        const drawNumber = (num, tx, ty) => {
            if(!num) return;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3; ctx.strokeText(num, tx, ty);
            ctx.fillStyle = "#000000"; ctx.fillText(num, tx, ty);
        };
        const drawLane = (yBase, label, hasPlat, isUp) => {
            const platY = isUp ?
            yBase + 6 : yBase - 21;
            const textY = isUp ? yBase - 2 : yBase - 2;
            if (hasPlat) {
                ctx.fillStyle = "#F8EC45";
                ctx.fillRect(x1, platY, w, 5);
                ctx.strokeStyle = "#000000"; ctx.lineWidth = 1; ctx.strokeRect(x1, platY, w, 5);
            } else {
                 ctx.strokeStyle = "#888";
                 ctx.lineWidth=1;
                 ctx.beginPath();
                 ctx.moveTo(x1, yBase); ctx.lineTo(x1+w, yBase); ctx.stroke();
            }
            drawNumber(label, x1 - 15, textY);
        };
        let yPositions = [];

        if (stationName === "ひめじ別所") {
            yPositions = [upInY, downInY, upOutY - 40, downOutY + 40];
        }
        else if (stationName === "鷹取") {
            yPositions = [upOutY, upInY, downInY, downOutY, upOutY - 30, downOutY + 30];
        }
        else if (stationName === "西大路") {
            yPositions = [upOutY, upInY, downInY, downOutY, upOutY - 30, downOutY + 30];
        }
        else if (stationName === "向日町") {
            yPositions = [upOutY, upInY, downInY, downOutY, downOutY + 35];
        }
        else if (stationName === "向日町操") {
            yPositions = [upOutY - 40, downOutY + 40];
        }
        else if (stationName === "山崎") {
            yPositions = [upOutY, upInY, downInY, downOutY, downOutY + 35];
        }
        else if (stationName === "大阪") {
            yPositions = [upOutY-28, upOutY, upInY-28, upInY, downInY, downInY+28, downInY+56, downOutY, downOutY+28];
        } 
        else if (stationName === "西明石") {
            yPositions.push(upOutY - 15);
            yPositions.push(upInY - 15);
            yPositions.push(upInY + 15);
            yPositions.push(downInY - 15);
            yPositions.push(downInY + 15);
            yPositions.push(downOutY + 15);
        } 
        else if (stationName === "京都") {
            yPositions = [upOutY-20, upOutY+10, upInY-10, upInY+20, downInY-20, downInY+10, downOutY-10, downOutY+20];
        }
        else if (stationName === "尼崎") {
            yPositions = [upOutY-20, upOutY+10, upInY-10, upInY+20, downInY-20, downInY+10, downOutY-10, downOutY+20];
        }
        else if (stationName === "高槻") {
            yPositions = [upOutY-15, upOutY+15, upInY-15, upInY+15, downInY, downOutY];
        }
        else if (stationName === "新大阪") {
             let startY = upOutY - 20;
            rule.lanes.forEach((_, i) => yPositions.push(startY + (i * 35)));
        }
        else if (["舞子","垂水","須磨","芦屋","甲南山手","さくら夙川","西宮","摩耶","朝霧","須磨海浜公園","新長田","JR総持寺","島本","桂川","東姫路","御着","塩屋"].includes(stationName)) {
            if (rule.lanes.length === 6) { 
                 yPositions = [upOutY, upInY-28, upInY, downInY, downInY+28, downOutY];
            } else if (rule.lanes.length === 4) {
                 yPositions = [upOutY, upInY, downInY, downOutY];
            } else if (stationName === "東姫路" || stationName === "御着") {
                 yPositions = [upInY, downInY];
                if(rule.lanes.length > 2) yPositions.push(upOutY);
            }
        } 
        else if (["大津京", "おごと温泉", "堅田", "近江舞子", "安曇川", "近江今津", "永原", "新三田", "宝塚", "川西池田", "京橋", "放出"].includes(stationName)) {
            // ★湖西線・福知山線の待避可能駅 (2面4線)
            yPositions = [upOutY - 15, upOutY + 15, downOutY - 15, downOutY + 15];
        }
        else if (["道場", "塚口"].includes(stationName)) {
            // ★福知山線の待避可能駅 (2面3線)
            yPositions = [upOutY - 15, upOutY + 15, downOutY];
        }
        else if (["唐崎", "比叡山坂本", "小野", "和邇", "蓬莱", "志賀", "比良", "北小松", "近江高島", "新旭", "近江中庄", "マキノ", "三田", "武田尾", "西宮名塩", "生瀬", "中山寺", "北伊丹", "伊丹", "猪名寺", "加島", "御幣島", "海老江", "新福島", "北新地", "大阪天満宮", "大阪城北詰", "鴫野"].includes(stationName)) {
            // ★湖西線・福知山線・東西線の待避なし駅 (2面2線)
            yPositions = [upOutY, downOutY];
        }
        else {
            let stIdx = STATION_MAP[stationName];
            if (stIdx !== undefined && stIdx > STATION_MAP["草津"]) {
                // 複線区間のホーム配置
                if (rule.lanes.length === 1) yPositions = [upOutY];
                else if (rule.lanes.length === 2) yPositions = [upOutY, downOutY];
                else if (rule.lanes.length === 3) yPositions = [upOutY, upInY, downOutY]; // 中線はInのY座標を流用
                else {
                    // 米原・長浜・敦賀などの大規模駅
                    let half = Math.ceil(rule.lanes.length / 2);
                    for(let i=0; i<half; i++) yPositions.push(upOutY + (i*28) - 28);
                    for(let i=half; i<rule.lanes.length; i++) yPositions.push(downOutY + ((i-half)*28) - 14);
                }
            } else {
                // 複々線区間のホーム配置
                if (rule.lanes.length >= 1) yPositions.push(upOutY);
                if (rule.lanes.length >= 2) yPositions.push(upInY);
                if (rule.lanes.length >= 3) yPositions.push(downInY);
                if (rule.lanes.length >= 4) yPositions.push(downOutY);
            }
        }

        for (let i = 0; i < rule.lanes.length; i++) {
            if (i < yPositions.length) {
                const isUp = (yPositions[i] < (upInY + downInY)/2);
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

    draw() {
        if(!this.canvas) return;

        // 可視領域クリッピング
        const scrollL = this.game.scrollContainer ? this.game.scrollContainer.scrollLeft : 0;
        const viewMin = scrollL - 200, viewMax = scrollL + window.innerWidth + 200;

        // 背景(全幅2万px超)を毎回全面転送せず、可視範囲のみ再転送する。
        // 初回のみ全面を描いておき、以降は可視帯だけを上書き(=その帯の旧列車も消去)する。
        // 画面外は前回描画が残るが不可視で、スクロール時はループ側が再描画を要求する。
        if (!this._bgDrawn) {
            this.ctx.drawImage(this.bgCanvas, 0, 0);
            this._bgDrawn = true;
        } else {
            const clipX = Math.max(0, Math.floor(viewMin));
            const clipW = Math.min(TOTAL_WIDTH, Math.ceil(viewMax)) - clipX;
            if (clipW <= 0) return;
            this.ctx.drawImage(this.bgCanvas, clipX, 0, clipW, CANVAS_HEIGHT, clipX, 0, clipW, CANVAS_HEIGHT);
        }

        // ★修正: 留置場(DEPOTS)の箱と列車の描画 (縦並び・背景透過・本線表示)
        const trackYUpIn = this.game.trackMgr.trackY["Up_In"];
        const trackYDownIn = this.game.trackMgr.trackY["Down_In"];
        const trackCenterY = (trackYUpIn + trackYDownIn) / 2; // 本線の上下間を基準にする
        
        if (!this._depotHitboxesRegistered) this.depotHitboxes = []; // ★追加: 初期化

        for (let stName in DEPOTS) {
            let dep = DEPOTS[stName];
            let stIdx = STATION_MAP[stName];
            if (stIdx === undefined && stName !== "宮原操" && stName !== "向日町操") continue;
            
            let baseX = 0;
            if (stName === "宮原操") baseX = 100 + (39 * UNITS_PER_STATION) * BLOCK_WIDTH;
            else if (stName === "向日町操") baseX = 100 + (51 * UNITS_PER_STATION) * BLOCK_WIDTH;
            else baseX = 100 + (stIdx * UNITS_PER_STATION) * BLOCK_WIDTH;
            
            // X座標は駅の右側にオフセット
            let cx = baseX + (dep.drawOffset.x * BLOCK_WIDTH * UNITS_PER_STATION);
            
            // ★修正: 枠の大きさを本線ブロックに合わせて広げ、列車の幅も調整
            const boxW = 120, boxH = 24;
            let totalHeight = dep.capacity * (boxH + 4);

            // ★修正: 特例の留置場は本線右側ではなく下り外側線(または貨物線)のすぐ下に配置する
            let cy = trackCenterY + dep.drawOffset.y; 
            if (["西明石", "高槻", "向日町操"].includes(stName)) {
                cy = this.game.trackMgr.trackY["Down_Out"] + totalHeight / 2 + 30;
            } else if (stName === "宮原操") {
                cy = this.game.trackMgr.trackY["Down_Hoppo"] + totalHeight / 2 + 30;
            }
            
            let startY = cy - totalHeight / 2 + boxH / 2;

            // ★追加: ヒットボックスの登録 (初回のみ)
            if (!this._depotHitboxesRegistered) {
                this.depotHitboxes.push({ name: stName, x: cx - boxW/2, y: startY - boxH/2 - 25, w: boxW, h: totalHeight + 40 });
            }

            // 留置場名称
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 11px 'Meiryo UI', sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.fillText(`【留置】${dep.display}`, cx, startY - boxH/2 - 20); // 少し上に移動
            
            // ★追加: タップ誘導テキストと現在待機数
            this.ctx.fillStyle = "#88ccff";
            this.ctx.font = "10px 'Meiryo UI', sans-serif";
            let queueLen = this.game.fleet.poolAt(stName).length;
            this.ctx.fillText(`▶ 待機車両: ${queueLen}編成 (タップで詳細)`, cx, startY - boxH/2 - 8);
            
            this.ctx.lineWidth = 1.5;
            
            for (let i = 0; i < dep.capacity; i++) {
                let x = cx;
                let y = startY + i * (boxH + 4); // 縦に並べる
                
                // 留置中の列車を描画
                if (dep.trains[i]) {
                    let t = dep.trains[i];
                    
                    // ★修正: 横幅を本線上と同じ120に変更
                    const bw = 120, bh = 24, tw = (t.type === "特急" ? 80 : 60);
                    const lx = x - bw/2, ly = y;

                    if (!t.depotOutConfig) {
                        // 予備車 (出区予定なし)
                        this.ctx.fillStyle = CONFIG.colors["回送"].bg;
                        this.ctx.fillRect(lx, ly-bh/2, bw, bh);
                        this.ctx.fillStyle = CONFIG.colors["回送"].text;
                        this.ctx.textAlign = "center";
                        this.ctx.textBaseline = "middle";
                        // ★変更: 「留置」の一言ではなく、留置中の編成番号を出す
                        if (t.vehicles && t.vehicles.length > 0) {
                            this.ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
                            this.ctx.fillText("留置 " + t.vehicles.map(v => v.id).join("+"), lx + bw/2, ly);
                        } else {
                            this.ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                            this.ctx.fillText("留置", lx + bw/2, ly);
                        }
                    } else {
                        // 折り返し待ち・出区予定あり
                        let displayType, displayNo, displayDest, bgColor, textColor;

                        // ★追加: 出発の2分(120秒)前までは「次が未定」と見なして旧情報を黒背景・白文字で表示
                        if (t.timer > 120 && t.oldInfo) {
                            displayType = t.oldInfo.type;
                            displayNo = t.oldInfo.trainNo;
                            displayDest = t.oldInfo.dest;
                            bgColor = "#000000"; // 旧情報は黒背景
                            textColor = "#ffffff"; // 白文字
                        } else {
                            // 出発2分前を切った（または旧情報がない）場合は新情報を本線カラーで表示
                            displayType = t.depotOutConfig.type;
                            displayNo = t.depotOutConfig.trainNo;
                            displayDest = t.depotOutConfig.dest;
                            
                            const cdata = CONFIG.colors[displayType] || CONFIG.colors["普通"];
                            bgColor = cdata.bg;
                            textColor = cdata.text;
                            if (displayType === "新快速" && t.isKoseiRoute) bgColor = "#00bfff";
                        }

                        // 左側の種別/列番
                        this.ctx.fillStyle = bgColor; 
                        this.ctx.fillRect(lx, ly-bh/2, tw, bh);
                        this.ctx.fillStyle = textColor; 
                        this.ctx.font = "bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif";
                        this.ctx.textAlign = "center"; 
                        this.ctx.textBaseline = "middle";
                        this.ctx.fillText(displayNo, lx+tw/2, ly);
                        
                        // 右側の行き先 (白背景、黒文字)
                        this.ctx.fillStyle = "#ffffff"; 
                        this.ctx.fillRect(lx+tw, ly-bh/2, bw-tw, bh);
                        this.ctx.fillStyle = "#000000";
                        
                        let dTxt = displayDest;
                        if (dTxt.length === 2) dTxt = dTxt[0] + "  " + dTxt[1]; 
                        else if (dTxt.length === 1) dTxt = " " + dTxt + " "; // 1文字駅の場合は全角スペース
                        this.ctx.fillText(dTxt, lx+tw+(bw-tw)/2, ly);
                    }
                    
                    // 枠線
                    this.ctx.strokeStyle = "#333"; 
                    this.ctx.lineWidth = 1; 
                    this.ctx.strokeRect(lx, ly-bh/2, bw, bh);
                } else {
                    // ★修正: 予備車の非現実的な描画を廃止し、空き枠のみを描画
                    const bw = 120, bh = 24;
                    const lx = x - bw/2, ly = y;
                    this.ctx.strokeStyle = "#555"; 
                    this.ctx.lineWidth = 1; 
                    this.ctx.strokeRect(lx, ly-bh/2, bw, bh);
                }
            }
        }
        this._depotHitboxesRegistered = true; // ★追加
        this.ctx.lineWidth = 1; // 線の太さをリセット

        // 障害・抑止線の描画

        // 障害・抑止線の描画
        const drawLine = (tid, s, e, col) => {
            const blks = this.game.trackMgr.blocks[tid];
            if(!blks || s>=blks.length || e>=blks.length) return;
            if(blks[e].x < viewMin || blks[s].x > viewMax) return;
            this.ctx.strokeStyle=col; this.ctx.lineWidth=10;
            this.ctx.beginPath(); this.ctx.moveTo(blks[s].x-35, blks[s].y); this.ctx.lineTo(blks[e].x+35, blks[s].y); this.ctx.stroke();
        };
        for(let m of this.game.trackMgr.manualSuspensions) drawLine(m.trackId, m.start, m.end, "#ff00ff");
        for(let tid in this.game.trackMgr.suspendedSections) this.game.trackMgr.suspendedSections[tid].forEach(s => drawLine(tid, s.start, s.end, CONFIG.jammed));

        // 列車パスと列車本体
        this.ctx.lineWidth = 5;
        this.game.trains.forEach(t => {
            if (t.state === "in_depot") return; // ★追加: 留置中の列車がホームの座標に残存して描画されるバグを防止
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;
            const b = blks[t.currBlockIndex];
            if (!b || b.x < viewMin || b.x > viewMax) return;

            // パス (簡易)
            this.ctx.strokeStyle = CONFIG.route;
            let nextB = blks[t.currBlockIndex + t.dir];
            if(nextB && nextB.lanes[0]===null) { this.ctx.beginPath(); this.ctx.moveTo(nextB.x-60, nextB.y); this.ctx.lineTo(nextB.x+60, nextB.y); this.ctx.stroke(); }

            // 本体
            let dy = b.y;
            if (b.stationIdx === 36) { // ★尼崎駅の特別Y座標計算
                const tY = this.game.trackMgr.trackY;
                if (t.dir === 1) dy = [tY["Up_Out"] - 20, tY["Up_Out"] + 10, tY["Up_In"] - 10, tY["Up_In"] + 20][t.lane];
                else dy = [tY["Down_In"] - 20, tY["Down_In"] + 10, tY["Down_Out"] - 10, tY["Down_Out"] + 20][t.lane];
            } else {
                let yOffset = (t.lane > 0) ? t.lane * (t.trackId.startsWith("Up")?-35:35) : 0;
                dy += yOffset;
            }
            let col = CONFIG.occupy; // 通常走行時（赤）
            
            // ★変更: 減速中・抑止中の色を黄色やオレンジに変更して視覚化
            if (t.isDecelerating) col = "#ffaa00"; // 減速中はオレンジ
            if(["stopped","turning_back"].includes(t.state)) col = CONFIG.stopped;
            else if(["waiting_start","holding"].includes(t.state)) col = "#ffff00"; // 抑止・待機中を黄色に変更（以前はcyan）
            if(t.state==="holding" && this.game.trackMgr.isSuspended(t.trackId, t.currBlockIndex)) col = CONFIG.jammed;
            
            this.ctx.strokeStyle = col; this.ctx.beginPath(); this.ctx.moveTo(b.x-60, dy); this.ctx.lineTo(b.x+60, dy); this.ctx.stroke();

            // ラベル
            const bw=100, bh=24, tw=(t.type==="特急"?75:55), lx=b.x-bw/2, ly=dy-bh/2;
            const cdata = CONFIG.colors[t.type] || CONFIG.colors["普通"];

            // ★修正: 湖西線経由フラグを持った新快速のみ、どこにいても背景色を青色にする
            let bgColor = cdata.bg;
            if (t.type === "新快速" && t.isKoseiRoute) {
                bgColor = "#00bfff";
            }
            
            // 編成番号を描画
            if (t.vehicles && t.vehicles.length > 0) {
                let vIds = t.vehicles.map(v => v.id).join("+");
                this.ctx.fillStyle = "#ffffff";
                this.ctx.font = "9px 'Meiryo UI'";
                this.ctx.fillText(vIds, lx+tw/2, ly-12);
            }

            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(lx, ly-8, tw, bh);
            this.ctx.fillStyle = cdata.bg; this.ctx.fillRect(lx, ly-8, tw, bh);
            this.ctx.fillStyle = cdata.text; this.ctx.font="bold 12px 'Meiryo UI', 'Yu Gothic', sans-serif"; this.ctx.textAlign="center"; this.ctx.textBaseline="middle";
            this.ctx.fillText(t.trainNo, lx+tw/2, ly+4);

            this.ctx.fillStyle="#fff"; this.ctx.fillRect(lx+tw, ly-8, bw-tw, bh);
            this.ctx.fillStyle="#000";
            let dTxt = t.dest; 
            if(dTxt.length===2) dTxt=dTxt[0]+"  "+dTxt[1]; // ★駅名の間に半角2マス分のスペースを入れる
            else if(dTxt.length===1) dTxt=" "+dTxt+" "; // ★1文字駅の場合は全角スペースで囲む
            this.ctx.fillText(dTxt, lx+tw+(bw-tw)/2, ly+4);

            let border="#333", w=1;
            const blink = Math.floor(Date.now()/500)%2===0;
            if(t.isManuallySuspended||this.game.isEmergency) { border=blink?"#f00":"#ff0"; w=3; }
            else if(t.minorTrouble) { border="#800080"; w=3; }
            this.ctx.strokeStyle=border; this.ctx.lineWidth=w; this.ctx.strokeRect(lx, ly-8, bw, bh);

            const delayMinutes = Math.floor(t.delayTime / 60);
            if (delayMinutes >= 1) { // 1分以上の遅延がある場合のみ表示
                const delayBoxSize = 16;
                const dlx = lx - delayBoxSize - 2; // 列車番号の左側に2pxの隙間をあけて配置
                const dly = ly - 8 + (bh - delayBoxSize) / 2; // 縦方向の中央揃え

                // 白い背景箱と赤い枠線
                this.ctx.fillStyle = "#ffffff";
                this.ctx.fillRect(dlx, dly, delayBoxSize, delayBoxSize);
                this.ctx.strokeStyle = "#ff0000";
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(dlx, dly, delayBoxSize, delayBoxSize);

                // 赤字で遅延時分を描画
                this.ctx.fillStyle = "#ff0000";
                this.ctx.font = "bold 11px 'Meiryo UI', 'Yu Gothic', sans-serif";
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";
                this.ctx.fillText(delayMinutes.toString(), dlx + delayBoxSize / 2, dly + delayBoxSize / 2 + 1); // +1は文字の中央位置の微調整
            }
        });
    }
}
