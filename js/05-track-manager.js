/* このファイルは index.html から分割されたものです。
   TrackManager (線路・ブロック・見合わせ区間の管理) */
/**
 * ==================================================
 * 2. ユーティリティ & TrackManager (線路管理)
 * ==================================================
 */
class TrackManager {
    constructor() {
        this.blocks = {};
        this.trackY = {};
        this.manualSuspensions = [];
        this.suspendedSections = { "Up_Out":[], "Up_In":[], "Down_In":[], "Down_Out":[], "Up_Hoppo":[], "Down_Hoppo":[] };
        /* 運転再開後の「段階的な開通」(js/26-incidents.js)。
           見合わせを解いたあとも、指令が1区間ずつ開通させるまで
           列車を進められない区間。 { trackId, start, end, id } */
        this.recoveryHolds = [];
        /* 徐行 (速度規制)。
           輸送障害から復旧したあと、しばらく現場付近を低速で通す。
           { trackId, start, end, factor, reason, until } */
        this.speedRestrictions = [];
        this.initLayout();
        this.initBlocks();
    }

    initLayout() {
        let currentY = 60;
        this.trackY["Up_Hoppo"] = currentY; currentY += 100;
        this.trackY["Up_Out"] = currentY; currentY += 120;
        this.trackY["Up_In"] = currentY; currentY += 120;
        this.trackY["Down_In"] = currentY; currentY += 120;
        this.trackY["Down_Out"] = currentY; currentY += 100;
        this.trackY["Down_Hoppo"] = currentY; currentY += 140; // 少し広げる
        this.trackY["Kosei_Up"] = currentY; currentY += 120;   // ★湖西線追加
        this.trackY["Kosei_Down"] = currentY;                  // ★湖西線追加
        this.trackY["Fukuchi_Up"] = currentY;
        this.trackY["Tozai_Up"] = currentY; currentY += 120;
        this.trackY["Fukuchi_Down"] = currentY;
        this.trackY["Tozai_Down"] = currentY; currentY += 120;
        // 赤穂線は JR宝塚線・JR東西線と横位置が重ならないので同じ段に描く
        this.trackY["Ako_Up"] = this.trackY["Fukuchi_Up"];
        this.trackY["Ako_Down"] = this.trackY["Fukuchi_Down"];
    }

    // 【修正】TrackManagerクラスの initBlocks() 内
    initBlocks() {
        const KOSEI_STATIONS = _shiftKeys({
            57: {name: "大津京", lanes: 2}, 58: {name: "唐崎", lanes: 1}, 
            60: {name: "比叡山坂本", lanes: 1}, 61: {name: "おごと温泉", lanes: 2}, 
            63: {name: "堅田", lanes: 2}, 64: {name: "小野", lanes: 1}, 65: {name: "和邇", lanes: 1}, 
            67: {name: "蓬莱", lanes: 1}, 68: {name: "志賀", lanes: 1}, 
            70: {name: "比良", lanes: 1}, 71: {name: "近江舞子", lanes: 2}, 72: {name: "北小松", lanes: 1},
            74: {name: "近江高島", lanes: 1}, 75: {name: "安曇川", lanes: 2}, 
            77: {name: "新旭", lanes: 1}, 78: {name: "近江今津", lanes: 2}, 79: {name: "近江中庄", lanes: 1}, 
            81: {name: "マキノ", lanes: 1}, 82: {name: "永原", lanes: 2}
        });

        // ★追加: 福知山線・東西線の駅定義
        const FUKUCHI_STATIONS = _shiftKeys({
            23: {name: "新三田", lanes: 2}, 24: {name: "三田", lanes: 1}, 
            25: {name: "道場", lanes: 2}, 26: {name: "武田尾", lanes: 1},
            27: {name: "西宮名塩", lanes: 1}, 28: {name: "生瀬", lanes: 1},
            29: {name: "宝塚", lanes: 2}, 30: {name: "中山寺", lanes: 1}, 
            31: {name: "川西池田", lanes: 2}, 32: {name: "北伊丹", lanes: 1}, 
            33: {name: "伊丹", lanes: 1}, 34: {name: "猪名寺", lanes: 1}, 
            35: {name: "塚口", lanes: 2}
        });
        /* JR東西線 (尼崎[36] 〜 京橋[44]) と、そこから直通する
           片町線(学研都市線) の 鴫野[45]・放出[46] まで。
           放出は2面4線で待避・折り返しができる。 */
        /* JR東西線 (尼崎 〜 京橋) と、そこから直通する学研都市線 (片町線) の
           鴫野 〜 木津。駅は js/03-stations.js の TOZAI_STATIONS_MAP から取る
           (レーン数は番線の定義から決まるので、ここでは既定値だけ)。 */
        const TOZAI_STATIONS = {};
        for (const k in TOZAI_STATIONS_MAP) TOZAI_STATIONS[k] = { name: TOZAI_STATIONS_MAP[k], lanes: 1 };

        /* 分岐線の駅のレーン数。
           ★番線の定義 (js/03-stations.js の stationBranchLanes) から取る。
             ここに別の表を持つと、番線の数と線路の数が食い違い、
             「線路の無い番線」と「番線の無い線路」が同時に生まれる。
             その食い違いのために、実際は島式1面2線の 大阪天満宮・大阪城北詰 に
             「上待」「下待」という実在しない番線が生えていた。
             fallback は書き起こしが無い駅のための保険。 */
        const branchLanes = (stName, trackId, fallback) => {
            if (typeof stationBranchLanes !== "function") return fallback;
            if (!STATION_PLATFORM_RULES[stName]) return fallback;
            const n = stationBranchLanes(stName);
            return (trackId.indexOf("Up") === 0 || trackId.indexOf("_Up") > 0) ? n.up : n.down;
        };

        TRACKS.forEach(trk => {
            let trackBlocks = [];
            for (let i = 0; i < STATIONS.length; i++) {
                let stationX = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
                let isHoppo = trk.id.includes("Hoppo");
                let validHoppo = (i >= W(36) && i <= W(44));
                let isKosei = trk.id.includes("Kosei");
                let validKosei = (i >= W(56) && i <= W(83));
                // ★追加: 有効範囲の判定
                let isFukuchi = trk.id.includes("Fukuchi");
                let validFukuchi = (i >= W(23) && i <= W(36));
                let isTozai = trk.id.includes("Tozai");
                let validTozai = (i >= W(36) && i <= TOZAI_EAST_IDX);
                /* ★内側線 (電車線) があるのは複々線の西明石〜草津だけ。
                   それより西・東は複線で、内側線という線路は存在しない。
                   以前は全線にわたって内側線のブロックを作っていたため、
                     ・配線略図に無い線路が線路図上に生まれる
                     ・何かの経路でそこに入った列車が、線路の無い場所を走る
                     ・駅の番線と線路の数が合わない (栗東・彦根など46駅)
                   という食い違いが出ていた。
                   湖西線などと同じく、範囲外はプレースホルダにする。 */
                let isAko = trk.id.indexOf("Ako") === 0;
                let validAko = (i >= AKO_WEST_IDX && i <= AKO_JUNCTION_IDX);
                /* 播州赤穂の位置 (インデックス0) は赤穂線だけ。本線の線路は上郡で終わる。 */
                let isMainRow = !isKosei && !isFukuchi && !isTozai && !isAko;
                let mainGap = isMainRow && !!STATIONS[i].branchOnly;
                let isInner = trk.id.includes("In") && !isHoppo;
                let validInner = (i >= STATION_MAP["西明石"] && i <= STATION_MAP["草津"]);

                // ★修正: 範囲外はプレースホルダ(-1000)にする判定を拡張
                if ((isHoppo && !validHoppo) || (isKosei && !validKosei) ||
                    (isFukuchi && !validFukuchi) || (isTozai && !validTozai) ||
                    (isInner && !validInner) || (isAko && !validAko) || mainGap) {
                    trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, isStation: false, x: -1000, y: this.trackY[trk.id], lanes: [null] });
                    if (i < STATIONS.length - 1) {
                        for (let k = 1; k <= BLOCKS_PER_STATION_GAP; k++) {
                            trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, isStation: false, x: -1000, y: this.trackY[trk.id], lanes: [null] });
                        }
                    }
                    continue;
                }

                let stName = STATIONS[i].name;
                let laneCount = 1;
                let specialStation = false;

                // (前回のY座標の動的決定は削除し、元に戻します)
                let blockY = this.trackY[trk.id];

                if (isHoppo) {
                    if (i === W(39)) { stName = "宮原操"; laneCount = 2; specialStation = true; } 
                    else if (i === W(41)) { stName = "吹田貨"; laneCount = 4; specialStation = true; } 
                    else { stName = ""; laneCount = 1; }
                } else if (isKosei) {
                    if (i === W(56)) { stName = "山科"; laneCount = 1; specialStation = true; }
                    else if (i === W(83)) { stName = "近江塩津"; laneCount = 1; specialStation = true; }
                    else if (KOSEI_STATIONS[i]) {
                        stName = KOSEI_STATIONS[i].name;
                        laneCount = branchLanes(stName, trk.id, KOSEI_STATIONS[i].lanes);
                        specialStation = true;
                    } else {
                        stName = "湖西線通過"; laneCount = 1; specialStation = true;
                    }
                // ★追加: 福知山線・東西線の駅名とレーン割り当て
                } else if (isFukuchi) {
                    if (i === W(36)) { stName = "尼崎"; laneCount = 1; specialStation = true; }
                    else if (FUKUCHI_STATIONS[i]) {
                        stName = FUKUCHI_STATIONS[i].name;
                        laneCount = branchLanes(stName, trk.id, FUKUCHI_STATIONS[i].lanes);
                        specialStation = true;
                    }
                    else { stName = "福知山線通過"; laneCount = 1; specialStation = true; }
                } else if (isAko) {
                    if (i === AKO_JUNCTION_IDX) { stName = "相生"; laneCount = 1; specialStation = true; }
                    else if (AKO_STATIONS_MAP[i]) {
                        stName = AKO_STATIONS_MAP[i];
                        laneCount = branchLanes(stName, trk.id, 1);
                        specialStation = true;
                    }
                    else { stName = "赤穂線通過"; laneCount = 1; specialStation = true; }
                } else if (isTozai) {
                    if (i === W(36)) { stName = "尼崎"; laneCount = 1; specialStation = true; }
                    else if (TOZAI_STATIONS[i]) {
                        stName = TOZAI_STATIONS[i].name;
                        laneCount = branchLanes(stName, trk.id, TOZAI_STATIONS[i].lanes);
                        specialStation = true;
                    }
                    else { stName = "東西線通過"; laneCount = 1; specialStation = true; }
                } else {
                    /* 本線のレーン数。
                       ★数え方は js/03-stations.js の stationMainLaneCount() に
                         まとめてある。以前はここに if の連なりで書いていて、
                         番線の縦位置 (stationLaneBaseYs) と食い違っていた駅が
                         86駅中 23駅あった。食い違うと、線路の描かれていない
                         高さに列車が出て、別の番線の札や列車と重なる。 */
                    laneCount = (stationTrackLanes(stName)[trk.id]) || 1;
                }

                // ★修正: 追加した路線の除外条件を反映しつつ blockY を適用
                if (stName === "向日町操" && !isHoppo && !isKosei && !isFukuchi && !isTozai) {
                    // レーン数は js/03-stations.js の1か所から取る (線路図と揃える)
                    trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, stationIdx: i, isStation: true, x: stationX, y: blockY, lanes: new Array(laneCount).fill(null), hoppoStationName: "向日町操" });
                } else {
                    trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, stationIdx: i, isStation: true, x: stationX, y: blockY, lanes: new Array(laneCount).fill(null), hoppoStationName: specialStation ? stName : null });
                }

                if (i < STATIONS.length - 1) {
                    /* ★線区の端の駅から先は線路が無い。
                       以前は端の駅 (放出・近江塩津・草津の内側線・北方貨物線の端) の
                       先にも、次の駅までのブロックを本物の線路として作っていた。
                       その先に駅は無いので、何かの拍子にそこへ入った列車は
                       行き止まりで動けなくなり、後続を止めてしまう。
                       実際に、放出行きの列車が放出を過ぎて四条畷方へ進み、
                       JR東西線を詰まらせていた (放出の電留線は四条畷方にあるが、
                       出入区は放出駅の番線から直接行うので、線路図の上では
                       ここに線路は要らない)。
                       端の駅から先はプレースホルダにして、線区の端として扱う
                       (js/12-train-move.js の endOfLineStop)。 */
                    const nextValid = !((isHoppo && !(i + 1 >= W(36) && i + 1 <= W(44))) ||
                                        (isKosei && !(i + 1 >= W(56) && i + 1 <= W(83))) ||
                                        (isFukuchi && !(i + 1 >= W(23) && i + 1 <= W(36))) ||
                                        (isTozai && !(i + 1 >= W(36) && i + 1 <= TOZAI_EAST_IDX)) ||
                                        (isInner && !(i + 1 >= STATION_MAP["西明石"] && i + 1 <= STATION_MAP["草津"])) ||
                                        (isAko && !(i + 1 >= AKO_WEST_IDX && i + 1 <= AKO_JUNCTION_IDX)) ||
                                        (isMainRow && STATIONS[i + 1] && STATIONS[i + 1].branchOnly));
                    // ★修正: 斜め補間を行わず、純粋に一定のY座標（尼崎だけ本線）でブロックを生成する
                    for (let k = 1; k <= BLOCKS_PER_STATION_GAP; k++) {
                        trackBlocks.push(nextValid
                            ? { index: trackBlocks.length, trackId: trk.id, isStation: false, x: stationX + (k * BLOCK_WIDTH), y: blockY, lanes: [null] }
                            : { index: trackBlocks.length, trackId: trk.id, isStation: false, x: -1000, y: blockY, lanes: [null], stub: true });
                    }
                }
            }
            this.blocks[trk.id] = trackBlocks;
        });

        /* ★尼崎駅のレーン(番線)共有化処理。
           本数は番線の定義から取る (js/03-stations.js)。
           実物は島式4面8線＋北側の通過線(9番)で、
             上り側 9,8,7,6,5 の5線 / 下り側 4,3,2,1 の4線
           ここを 4/4 の決め打ちにしていたため、9番の通過線が無く、
           7番 (宝塚線・東西線の上り) も持てていなかった。 */
        const amaLanes = (typeof stationTrackLanes === "function")
            ? stationTrackLanes("尼崎") : null;
        const amaUpN = amaLanes ? ((amaLanes.Up_Out || 0) + (amaLanes.Up_In || 0)) : 4;
        const amaDownN = amaLanes ? ((amaLanes.Down_In || 0) + (amaLanes.Down_Out || 0)) : 4;
        let amaUpLanes = new Array(Math.max(1, amaUpN)).fill(null);
        let amaDownLanes = new Array(Math.max(1, amaDownN)).fill(null);

        ["Up_Out", "Up_In", "Fukuchi_Up", "Tozai_Up"].forEach(tid => {
            if (this.blocks[tid]) {
                let amaB = this.blocks[tid].find(b => b.stationIdx === STATION_MAP["尼崎"]);
                if (amaB) amaB.lanes = amaUpLanes;
            }
        });

        ["Down_Out", "Down_In", "Fukuchi_Down", "Tozai_Down"].forEach(tid => {
            if (this.blocks[tid]) {
                let amaB = this.blocks[tid].find(b => b.stationIdx === STATION_MAP["尼崎"]);
                if (amaB) amaB.lanes = amaDownLanes;
            }
        });

        this.shareStationLanes();
        this.shareSingleTrackLanes();
    }

    /**
     * 尼崎以外の「番線を共有する駅」(js/03-stations.js の STATION_SHARED_LANES) の
     * レーンを共有にする。
     *   side … 上り側の線路どうし・下り側の線路どうしで共有 (相生: 本線と赤穂線)
     *   all  … その駅にブロックを持つ線路すべてで共有 (単線の駅・線区の端の駅)
     * レーンの並びは stationLaneEntry() と同じ (上り外・上り内・下り内・下り外の順)。
     */
    shareStationLanes() {
        for (const st in STATION_SHARED_LANES) {
            if (st === "尼崎") continue;             // 尼崎は上で本線の本数から作っている
            const mode = STATION_SHARED_LANES[st];
            const map = stationLaneMap(st);
            const hits = [];
            TRACKS.forEach(trk => {
                const b = (this.blocks[trk.id] || []).find(x => x.x !== -1000 &&
                    (x.isStation || x.hoppoStationName) && blockStationName(x) === st);
                if (b) hits.push({ trk: trk, b: b });
            });
            if (!hits.length) continue;
            if (mode === "all") {
                const n = map.Up_Out.length + map.Up_In.length + map.Down_In.length + map.Down_Out.length;
                const arr = new Array(Math.max(1, n)).fill(null);
                hits.forEach(h => { h.b.lanes = arr; });
            } else {
                const upN = map.Up_Out.length + map.Up_In.length;
                const dnN = map.Down_In.length + map.Down_Out.length;
                const up = new Array(Math.max(1, upN)).fill(null);
                const dn = new Array(Math.max(1, dnN)).fill(null);
                hits.forEach(h => { h.b.lanes = (h.trk.dir === 1) ? up : dn; });
            }
        }
    }

    /**
     * 単線区間 (js/03-stations.js の SINGLE_TRACK_UNITS) の中のブロックは、
     * 上下の線路でレーンを共有する。線路は1本しかないので、
     * 上り列車がいるブロックに下り列車は入れない。
     */
    shareSingleTrackLanes() {
        for (const u of SINGLE_TRACK_UNITS) {
            const up = this.blocks[u.up], dn = this.blocks[u.down];
            if (!up || !dn) continue;
            const r = singleUnitBlockRange(u);
            for (let i = r[0]; i <= r[1]; i++) {
                if (!up[i] || !dn[i] || up[i].x === -1000 || dn[i].x === -1000) continue;
                // 駅のブロックは shareStationLanes で共有済み (単線の駅は "all")
                if (up[i].lanes !== dn[i].lanes) dn[i].lanes = up[i].lanes;
            }
        }
    }

    /** 徐行を置く。until はゲーム内時刻(秒)。 */
    addSpeedRestriction(trackId, start, end, factor, reason, until) {
        this.speedRestrictions.push({
            trackId: trackId, start: Math.min(start, end), end: Math.max(start, end),
            factor: factor, reason: reason || "徐行", until: until
        });
    }

    /** 期限切れの徐行を片付ける。毎Tick呼ぶ。 */
    pruneSpeedRestrictions(now) {
        for (let i = this.speedRestrictions.length - 1; i >= 0; i--) {
            if (this.speedRestrictions[i].until <= now) this.speedRestrictions.splice(i, 1);
        }
    }

    /** そのブロックの所要時間の倍率 (徐行がなければ 1.0) */
    speedFactor(trackId, idx) {
        let f = 1.0;
        for (const r of this.speedRestrictions) {
            if (r.trackId === trackId && idx >= r.start && idx <= r.end) {
                if (r.factor > f) f = r.factor;
            }
        }
        return f;
    }

    /** そのブロックにかかっている徐行の理由 (画面表示用) */
    speedReason(trackId, idx) {
        for (const r of this.speedRestrictions) {
            if (r.trackId === trackId && idx >= r.start && idx <= r.end) return r.reason;
        }
        return "";
    }

    /**
     * そのブロックに列車を進めてはいけないか (運転見合わせ・段階開通の抑止)。
     *   train … 渡すと、段階開通の区間で「確認列車」の許可を持つ列車は通す
     */
    isSuspended(trackId, idx, train) {
        for(let m of this.manualSuspensions) if(m.trackId===trackId && idx>=m.start && idx<=m.end) return true;
        for (const r of this.recoveryHolds) {
            if (r.trackId !== trackId || idx < r.start || idx > r.end) continue;
            if (train && r.grant && r.grant === train.id) continue;
            return true;
        }
        const secs = this.suspendedSections[trackId];
        if (secs) for (let s of secs) if (idx >= s.start && idx <= s.end) return true;
        return false;
    }
}
