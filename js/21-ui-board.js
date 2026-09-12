/* このファイルは index.html から分割されたものです。
   UIManager: 発車標(電光掲示板)の描画 */
    // ★追加・修正: 発車標（電光掲示板）のデータ計算と描画処理
    // ★追加・修正: 発車標（電光掲示板）のデータ計算と描画処理
UIManager.prototype.showDepartureBoard = function (stName) {
        let boardTrainsUp = [];
        let boardTrainsDown = [];
        
        // ★貨物駅のエイリアス解決
        const freightAlias = { "姫路タ": "ひめじ別所", "神戸タ": "鷹取", "京都タ": "西大路", "吹田タ": "吹田貨" };
        let actualStName = freightAlias[stName] || stName;
        let isFreightBoard = !!freightAlias[stName] || stName === "吹田タ";

        this.game.trains.forEach(t => {
            if (t.state === "finished") return;

            // ★貨物ターミナル発車標の場合は貨物・臨時列車のみ表示
            if (isFreightBoard && !["貨物", "臨時"].includes(t.type)) return;

            // 分岐する列車が、経路外となる本線の駅に誤って表示されるのを防ぐ
            const stIdx = STATION_MAP[actualStName];
            if (stIdx !== undefined) {
                if (t.dir === 1 && TOZAI_THROUGH_DESTS.includes(t.dest) && stIdx > 36) return;
                if (t.dir === -1 && FUKUCHI_THROUGH_DESTS.includes(t.dest) && stIdx < 36) return;
                if (t.isKoseiRoute && stIdx > 56 && stIdx < 83) return;
            }

            let blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) return;

            let targetBlock = null;
            for (let b of blks) {
                if (b.x === -1000) continue;
                let bName = b.hoppoStationName;
                if (!bName && b.stationIdx >= 0 && STATIONS[b.stationIdx]) {
                    bName = STATIONS[b.stationIdx].name;
                }
                if (bName === actualStName) {
                    targetBlock = b;
                    break;
                }
            }

            if (!targetBlock) return;
            
            // ★改善②：終着駅または終着駅を超えている駅の掲示板には表示しない
            let destBlock = blks.find(b => {
                let bName = b.hoppoStationName;
                if (!bName && b.stationIdx >= 0 && STATIONS[b.stationIdx]) bName = STATIONS[b.stationIdx].name;
                return bName === t.dest;
            });
            if (destBlock) {
                let distToDest = (destBlock.index - t.currBlockIndex) * t.dir;
                let distToBoard = (targetBlock.index - t.currBlockIndex) * t.dir;
                // 表示対象の駅が目的地よりも遠い（または目的地と同じ）場合は表示しない
                if (distToBoard >= distToDest) return;
            } else if (t.dest === actualStName) {
                return;
            }

            let dummySt = { name: actualStName };
            let willStop = t.shouldStop(dummySt);
            if (!willStop) return;
            let dist = (targetBlock.index - t.currBlockIndex) * t.dir;
            if (dist < 0 && t.state !== "stopped") return;
            if (dist === 0 && t.hasDeparted) return;
            if (dist < 0 && t.state === "stopped" && t.currBlockIndex !== targetBlock.index) return;
            
            // ★改善①：抑止やトラブル、詰まり(stuckTime)による遅延をETAに加算して精度を向上
            let etaSec = t.timer > 0 ? t.timer : 0;
            if (t.isManuallySuspended) etaSec += 300; // 手動抑止中は仮に5分追加
            if (t.minorTrouble) etaSec += t.troubleInfo.timer;
            if (this.game.isEmergency) etaSec += this.game.emergencyState.timer;
            etaSec += t.stuckTime; // 詰まっている時間も加味

            if (dist > 0) {
                let tempIdx = t.currBlockIndex;
                while (tempIdx !== targetBlock.index) {
                    tempIdx += t.dir;
                    if (tempIdx < 0 || tempIdx >= blks.length) break; 
                    
                    etaSec += t.calcTravelTime();
                    if (tempIdx !== targetBlock.index) {
                        let interBlock = blks[tempIdx];
                        if (interBlock && (interBlock.isStation || interBlock.hoppoStationName)) {
                            let interStName = interBlock.hoppoStationName;
                            if (!interStName && interBlock.stationIdx >= 0 && STATIONS[interBlock.stationIdx]) {
                                interStName = STATIONS[interBlock.stationIdx].name;
                            }
                            if (interStName) {
                                let stIndex = STATION_MAP[interStName];
                                let interStInfo = (stIndex !== undefined) ? STATIONS[stIndex] : { name: interStName, stopTime: 60 };
                                if (t.shouldStop(interStInfo)) {
                                    let sTime = interStInfo.stopTime || 60;
                                    if (t.type === "普通" && OVERTAKE_STATIONS.includes(interStName)) {
                                        sTime = Math.max(sTime, 120);
                                    }
                                    etaSec += sTime;
                                }
                            }
                        }
                    }
                }
                
                let targetStIndex = STATION_MAP[stName];
                let targetStInfo = (targetStIndex !== undefined) ? STATIONS[targetStIndex] : { name: stName, stopTime: 60 };
                let targetStopTime = targetStInfo.stopTime || 60;
                if (t.type === "普通" && OVERTAKE_STATIONS.includes(stName)) {
                    targetStopTime = Math.max(targetStopTime, 120);
                }
                etaSec += targetStopTime;
            }

            let depTimeSec = this.game.currentTime + etaSec;
            let trainData = { train: t, eta: depTimeSec, delay: t.delayTime, distance: dist };

            if (t.dir === 1) boardTrainsUp.push(trainData);
            else boardTrainsDown.push(trainData);
        });

        const updateBoardUI = (containerId, trains) => {
            const container = document.getElementById(containerId);
            
            // ★改善①：発車順序(実際の距離と優先度)に基づいてETAの逆転を防ぎ、最低発車間隔を確保する
            trains.sort((a, b) => {
                if (a.distance !== b.distance) return a.distance - b.distance;
                return PRIORITY[b.train.type] - PRIORITY[a.train.type];
            });

            let lastEta = -1;
            trains.forEach(data => {
                if (lastEta !== -1 && data.eta < lastEta + 120) {
                    data.eta = lastEta + 120; // 前の列車から最低2分(120秒)の間隔を空ける
                }
                lastEta = data.eta;
            });

            // 補正後のETAで再度ソート
            trains.sort((a, b) => a.eta - b.eta);
            // 画像に合わせて最大4列車まで表示するように変更
            trains = trains.slice(0, 4);

            const generalMsg = `線路内にモノを落としてしまい、拾得作業を行うときに、安全のため、電車を止めてから落とし物の拾得作業を行います。安全に作業するため、お時間をいただく場合がございます。皆様のご理解・ご協力をお願いいたします。    在来線特急列車には車内販売の営業はございません。お弁当・お飲み物は、あらかじめお買い求めください。    ◆キャリーバッグご利用のお客様へのお願い◆キャリーバッグをご利用の際には、周りのお客様の安全に十分ご注意下さい。  While in station or train, with rolling luggage, please be mindful of other passengers.  `;

            let operationInfoMsg = "";
            if (this.game.isEmergency) {
                let emgTimer = Math.ceil(this.game.emergencyState.timer / 60);
                if (this.game.emergencyState.type === "human") {
                    operationInfoMsg = `【運転見合わせ】現在、${this.game.emergencyState.location}駅での人身事故のため、運転を見合わせています。（再開見込：約${emgTimer}分）  `;
                } else {
                    operationInfoMsg = `【遅延情報】現在、${this.game.emergencyState.location}付近での異常検知のため、一部列車に遅れや運転見合わせが発生しています。  `;
                }
            }

            // 最先発列車のすぐ下に「停車駅」「ご案内」を固定配置するためのDOM構造を定義
            // スクロールをスムーズにするため scrollamount="5" scrolldelay="20" truespeed を指定
            if (container.children.length === 0 || !container.querySelector('.board-row-0')) {
                container.innerHTML = `
                    <div class="board-row-0"></div>
                    <div class="board-marquee-area" style="display:flex; flex-direction:column; gap:6px; border-bottom: 2px solid #555; padding: 6px 0;">
                        <div style="display:flex; align-items:center;">
                            <div style="width:240px; text-align:center; flex-shrink:0;">
                                <div style="background:white; color:black; font-size:28px; font-weight:bold; display:flex; align-items:center; justify-content:center; width:90%; height:42px; margin:0 auto; letter-spacing:4px; box-sizing:border-box; border-radius:2px; white-space:nowrap;">停車駅</div>
                            </div>
                            <div style="flex-grow:1; overflow:hidden;">
                                <marquee class="marquee-stops" scrollamount="2" scrolldelay="10" truespeed style="color:#ffffff; font-size:36px; font-family:'Meiryo UI', sans-serif; font-weight:normal; line-height:1.2;"></marquee>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center;">
                            <div style="width:240px; text-align:center; flex-shrink:0;">
                                <div style="background:white; color:black; font-size:28px; font-weight:bold; display:flex; align-items:center; justify-content:center; width:90%; height:42px; margin:0 auto; letter-spacing:4px; box-sizing:border-box; border-radius:2px; white-space:nowrap;">ご案内</div>
                            </div>
                            <div style="flex-grow:1; overflow:hidden;">
                                <marquee class="marquee-info" scrollamount="2" scrolldelay="10" truespeed style="color:#ffffff; font-size:36px; font-family:'Meiryo UI', sans-serif; font-weight:normal; line-height:1.2;"></marquee>
                            </div>
                        </div>
                    </div>
                    <div class="board-row-1"></div>
                    <div class="board-row-2"></div>
                    <div class="board-row-3"></div>
                `;
            }

            const marqueeStops = container.querySelector('.marquee-stops');
            const marqueeInfo = container.querySelector('.marquee-info');

            // 列車が存在しない場合の処理
            if (trains.length === 0) {
                const row0 = container.querySelector('.board-row-0');
                const emptyHtml = `<div style="color:white; text-align:center; padding: 40px; font-size:24px;">現在、この方向での発車予定はありません。</div>`;
                if (row0.innerHTML !== emptyHtml) row0.innerHTML = emptyHtml;
                for (let i = 1; i < 4; i++) {
                    const rowElem = container.querySelector(`.board-row-${i}`);
                    if (rowElem && rowElem.innerHTML !== "") rowElem.innerHTML = "";
                }
                
                let emptyStopsMsg = "当駅発の列車は現在ありません。";
                if (marqueeStops.innerText !== emptyStopsMsg) marqueeStops.innerText = emptyStopsMsg;
                
                let emptyInfoMsg = operationInfoMsg + generalMsg;
                if (marqueeInfo.innerText !== emptyInfoMsg) marqueeInfo.innerText = emptyInfoMsg;
                return;
            }

            // 列車の情報を各行（board-row-X）に流し込む
            for (let i = 0; i < 4; i++) {
                const rowElem = container.querySelector(`.board-row-${i}`);
                if (!rowElem) continue;

                if (i < trains.length) {
                    const data = trains[i];
                    const t = data.train;
                    
                    let delayMin = Math.floor(data.delay / 60);
                    let delayStr = delayMin > 0 ? 
                        `<div style="color:#ff3333; font-weight:bold; white-space:nowrap; display:flex; align-items:baseline; justify-content:center;"><span style="font-size:22px;">遅れ約</span><span style="font-size:38px; margin:0 4px;">${delayMin}</span><span style="font-size:22px;">分</span></div>` : "";
                    
                    let h = Math.floor(data.eta / 3600) % 24;
                    let m = Math.floor((data.eta % 3600) / 60);
                    let timeStr = `${h}:${m.toString().padStart(2, '0')}`;

                    let typeStyle = "";
                    let typeName = t.type;
                    
                    // 全種別に白枠（border: 2px solid #fff;）を追加
                    if (t.type === "快速" || t.trainNo.includes("丹波路快速")) {
                        typeStyle = "background:#F37021; color:#000; border:2px solid #fff;";
                        if (t.trainNo.includes("丹波路快速")) typeName = "丹波路快速";
                    } else if (t.type === "新快速") {
                        typeStyle = "background:#0044ff; color:#fff; border:2px solid #fff;";
                    } else if (t.type === "特急") {
                        typeStyle = "background:#e60000; color:#fff; border:2px solid #fff;";
                        typeName = t.trainNo; 
                    } else if (t.type === "普通") {
                        typeStyle = "background:#000; color:#fff; border:2px solid #fff;";
                    } else {
                        typeStyle = "background:#3cb371; color:#fff; border:2px solid #fff;"; 
                    }

                    let typeHtml = "";
                    if (typeName.length === 2) {
                        typeHtml = `<span style="letter-spacing: 0.5em; margin-right: -0.5em;">${typeName}</span>`;
                    } else {
                        typeHtml = typeName;
                    }
                    let fontSize = typeName.length >= 6 ? "28px" : "42px";

                    let destStr = t.dest;
                    if (t.dest.length === 2) {
                        destStr = `<span style="letter-spacing: 0.5em; margin-right: -0.5em;">${t.dest}</span>`;
                    } else if (t.dest.length === 1) {
                        destStr = ` ${t.dest} `;
                    }

                    let trackStr = (t.lane + 1).toString();

                    let borderBottomStyle = (i === 0) ? 'none' : '2px solid #444';
                    
                    // 行パディングを減らし、種別ボックスの height を 64px に拡張して行幅に合わせる
                    const rowHtml = `
                        <div style="display:flex; align-items:center; border-bottom: ${borderBottomStyle}; padding: 6px 0; min-height: 70px;">
                            <div style="width:240px; text-align:center;">
                                <div style="${typeStyle} font-size:${fontSize}; font-weight:bold; display:flex; align-items:center; justify-content:center; width:90%; height:64px; margin:0 auto; box-sizing:border-box;">${typeHtml}</div>
                            </div>
                            <div style="width:190px; text-align:center; font-weight:bold; font-family:'Meiryo UI', sans-serif;">${delayStr}</div>
                            <div style="width:150px; text-align:center; color:#ffff00; font-size:65px; font-family: 'Arial', sans-serif; font-weight:bold; letter-spacing:2px;">${timeStr}</div>
                            <div style="width:220px; text-align:center; color:#ffffff; font-size:50px; font-weight:bold;">${destStr}</div>
                            <div style="width:100px; text-align:center; color:#ffff00; font-size:65px; font-family: 'Arial', sans-serif; font-weight:bold;">${trackStr}</div>
                        </div>
                    `;
                    if (rowElem.innerHTML !== rowHtml) rowElem.innerHTML = rowHtml;
                } else {
                    if (rowElem.innerHTML !== "") rowElem.innerHTML = "";
                }
            }

            // メッセージ生成
            let firstData = trains[0];
            let t = firstData.train;
            
            let h = Math.floor(firstData.eta / 3600) % 24;
            let m = Math.floor((firstData.eta % 3600) / 60);
            let timeStr = `${h}時${m.toString().padStart(2, '0')}分`;
            let trackStr = (t.lane + 1).toString();

            let specialTrainMsg = "";
            if (t.type === "新快速" && t.dest === "野洲") {
                specialTrainMsg = `新快速野洲行の足元△印４番は有料座席、「Ａ－ＳＥＡＴ」です。「Ａ－ＳＥＡＴ」と書かれた乗車口でお待ち下さい。ご利用には乗車券の他に指定席券が必要です。  `;
            } else if (t.type === "新快速" && t.dest === "敦賀") {
                specialTrainMsg = `${timeStr}発 新快速敦賀・米原行き（${trackStr}番のりば）は、前４両（△１～４）が、湖西線経由敦賀行き、後８両（△５～１２）が、琵琶湖線経由米原行きです。  `;
            }

            let delayInfoMsg = "";
            let delayMin = Math.floor(firstData.delay / 60);
            if (delayMin >= 1 && !this.game.isEmergency) {
                delayInfoMsg = `【遅延情報】この列車は現在、約${delayMin}分の遅れで運転しております。ご迷惑をおかけいたしますことをお詫び申し上げます。  `;
            }

            let locationMsg = firstData.distance > 0 ?
                `列車は現在、約${Math.ceil((firstData.distance * t.calcTravelTime()) / 60)}分前の位置を走行中です。  ` : "列車は現在、当駅に停車中です。  ";
            
            let infoMsg = operationInfoMsg + delayInfoMsg + specialTrainMsg + locationMsg + generalMsg;
            
            let stopsMsg = `この列車は、${t.dest}までの各駅に止まります。`;
            if (t.type === "新快速") stopsMsg = `この列車の停車駅は、明石までの各駅と、神戸、三ノ宮、芦屋、尼崎、大阪、新大阪、高槻、京都からの各駅です。（※一部異なる場合があります）`;
            else if (t.type === "快速") stopsMsg = `この列車の停車駅は、明石までの各駅と、神戸、元町、三ノ宮、六甲道、住吉、芦屋、西宮、尼崎、大阪、新大阪、高槻からの各駅です。`;
            else if (t.type === "特急") stopsMsg = `この列車は、${t.dest}までの特急停車駅に止まります。`;

            if (marqueeStops.innerText !== stopsMsg) marqueeStops.innerText = stopsMsg;
            if (marqueeInfo.innerText !== infoMsg) marqueeInfo.innerText = infoMsg;
        };

        const modal = document.getElementById("dep-board-modal");
        this.currentBoardStation = stName; 

        let displayName = stName.endsWith("タ") ? stName : `${stName}駅`;
        if (stName === "吹田タ") displayName = "吹田貨物ターミナル";
        else if (stName === "姫路タ") displayName = "姫路貨物駅";
        else if (stName === "神戸タ") displayName = "神戸貨物ターミナル";
        else if (stName === "京都タ") displayName = "京都貨物駅";

        document.getElementById("dep-board-header-up").innerHTML = `${displayName} 発車標<br><span style="font-size:18px; font-weight:normal;">Departures</span>`;
        document.getElementById("dep-board-header-down").innerHTML = `${displayName} 発車標<br><span style="font-size:18px; font-weight:normal;">Departures</span>`;
        
        updateBoardUI("dep-board-rows-up", boardTrainsUp);
        updateBoardUI("dep-board-rows-down", boardTrainsDown);

        modal.style.display = "flex";
};
