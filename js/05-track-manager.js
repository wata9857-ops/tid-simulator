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
    }

    // 【修正】TrackManagerクラスの initBlocks() 内
    initBlocks() {
        const KOSEI_STATIONS = {
            57: {name: "大津京", lanes: 2}, 58: {name: "唐崎", lanes: 1}, 
            60: {name: "比叡山坂本", lanes: 1}, 61: {name: "おごと温泉", lanes: 2}, 
            63: {name: "堅田", lanes: 2}, 64: {name: "小野", lanes: 1}, 65: {name: "和邇", lanes: 1}, 
            67: {name: "蓬莱", lanes: 1}, 68: {name: "志賀", lanes: 1}, 
            70: {name: "比良", lanes: 1}, 71: {name: "近江舞子", lanes: 2}, 72: {name: "北小松", lanes: 1},
            74: {name: "近江高島", lanes: 1}, 75: {name: "安曇川", lanes: 2}, 
            77: {name: "新旭", lanes: 1}, 78: {name: "近江今津", lanes: 2}, 79: {name: "近江中庄", lanes: 1}, 
            81: {name: "マキノ", lanes: 1}, 82: {name: "永原", lanes: 2}
        };

        // ★追加: 福知山線・東西線の駅定義
        const FUKUCHI_STATIONS = {
            23: {name: "新三田", lanes: 2}, 24: {name: "三田", lanes: 1}, 
            25: {name: "道場", lanes: 2}, 26: {name: "武田尾", lanes: 1},
            27: {name: "西宮名塩", lanes: 1}, 28: {name: "生瀬", lanes: 1},
            29: {name: "宝塚", lanes: 2}, 30: {name: "中山寺", lanes: 1}, 
            31: {name: "川西池田", lanes: 2}, 32: {name: "北伊丹", lanes: 1}, 
            33: {name: "伊丹", lanes: 1}, 34: {name: "猪名寺", lanes: 1}, 
            35: {name: "塚口", lanes: 2}
        };
        /* JR東西線 (尼崎[36] 〜 京橋[44]) と、そこから直通する
           片町線(学研都市線) の 鴫野[45]・放出[46] まで。
           放出は2面4線で待避・折り返しができる。 */
        const TOZAI_STATIONS = {
            37: {name: "加島", lanes: 1}, 38: {name: "御幣島", lanes: 1},
            39: {name: "海老江", lanes: 1}, 40: {name: "新福島", lanes: 1},
            41: {name: "北新地", lanes: 1}, 42: {name: "大阪天満宮", lanes: 1},
            43: {name: "大阪城北詰", lanes: 1}, 44: {name: "京橋", lanes: 2},
            45: {name: "鴫野", lanes: 1}, 46: {name: "放出", lanes: 2}
        };

        TRACKS.forEach(trk => {
            let trackBlocks = [];
            for (let i = 0; i < STATIONS.length; i++) {
                let stationX = 100 + (i * UNITS_PER_STATION) * BLOCK_WIDTH;
                let isHoppo = trk.id.includes("Hoppo");
                let validHoppo = (i >= 36 && i <= 44);
                let isKosei = trk.id.includes("Kosei");
                let validKosei = (i >= 56 && i <= 83);
                // ★追加: 有効範囲の判定
                let isFukuchi = trk.id.includes("Fukuchi");
                let validFukuchi = (i >= 23 && i <= 36);
                let isTozai = trk.id.includes("Tozai");
                let validTozai = (i >= 36 && i <= TOZAI_EAST_IDX);
                /* ★内側線 (電車線) があるのは複々線の西明石〜草津だけ。
                   それより西・東は複線で、内側線という線路は存在しない。
                   以前は全線にわたって内側線のブロックを作っていたため、
                     ・配線略図に無い線路が線路図上に生まれる
                     ・何かの経路でそこに入った列車が、線路の無い場所を走る
                     ・駅の番線と線路の数が合わない (栗東・彦根など46駅)
                   という食い違いが出ていた。
                   湖西線などと同じく、範囲外はプレースホルダにする。 */
                let isInner = trk.id.includes("In") && !isHoppo;
                let validInner = (i >= STATION_MAP["西明石"] && i <= STATION_MAP["草津"]);

                // ★修正: 範囲外はプレースホルダ(-1000)にする判定を拡張
                if ((isHoppo && !validHoppo) || (isKosei && !validKosei) ||
                    (isFukuchi && !validFukuchi) || (isTozai && !validTozai) ||
                    (isInner && !validInner)) {
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
                    if (i === 39) { stName = "宮原操"; laneCount = 2; specialStation = true; } 
                    else if (i === 41) { stName = "吹田貨"; laneCount = 4; specialStation = true; } 
                    else { stName = ""; laneCount = 1; }
                } else if (isKosei) {
                    if (i === 56) { stName = "山科"; laneCount = 1; specialStation = true; }
                    else if (i === 83) { stName = "近江塩津"; laneCount = 1; specialStation = true; }
                    else if (KOSEI_STATIONS[i]) {
                        stName = KOSEI_STATIONS[i].name; laneCount = KOSEI_STATIONS[i].lanes; specialStation = true;
                    } else {
                        stName = "湖西線通過"; laneCount = 1; specialStation = true;
                    }
                // ★追加: 福知山線・東西線の駅名とレーン割り当て
                } else if (isFukuchi) {
                    if (i === 36) { stName = "尼崎"; laneCount = 1; specialStation = true; }
                    else if (FUKUCHI_STATIONS[i]) { stName = FUKUCHI_STATIONS[i].name; laneCount = FUKUCHI_STATIONS[i].lanes; specialStation = true; }
                    else { stName = "福知山線通過"; laneCount = 1; specialStation = true; }
                } else if (isTozai) {
                    if (i === 36) { stName = "尼崎"; laneCount = 1; specialStation = true; }
                    else if (TOZAI_STATIONS[i]) { stName = TOZAI_STATIONS[i].name; laneCount = TOZAI_STATIONS[i].lanes; specialStation = true; }
                    else { stName = "東西線通過"; laneCount = 1; specialStation = true; }
                } else {
                    // 本線レーン設定
                    if (stName === "大阪") {
                        if (trk.id==="Up_Out" || trk.id==="Up_In" || trk.id==="Down_Out") laneCount = 2;
                        if (trk.id==="Down_In") laneCount = 3;
                    } else if (stName === "新大阪") {
                        if (trk.id==="Up_Out" || trk.id==="Up_In" || trk.id==="Down_In") laneCount = 3;
                        if (trk.id==="Down_Out") laneCount = 1;
                    // ★追加: 加古川の隣に「宝殿」を追加し、内部的な待避容量を確保
                    } else if (["京都", "尼崎", "西明石", "姫路", "高槻", "加古川", "宝殿", "草津", "野洲", "河瀬", "安土", "米原", "長浜", "近江塩津", "敦賀"].includes(stName)) {
                        laneCount = 2;
                    } else if (stName === "能登川" && trk.id.includes("Up")) { laneCount = 2; }
                    else if (stName === "近江八幡" && trk.id.includes("Down")) { laneCount = 2; }
                    else if (["芦屋", "須磨", "神戸"].includes(stName) && trk.id.includes("In")) { laneCount = 2;
                    }
                    else if (stName === "大久保") { laneCount = 2;
                    }
                    else if (["ひめじ別所", "鷹取", "西大路"].includes(stName) && trk.id.includes("Out")) { laneCount = 2;
                    }
                    /* ★配線略図 (スクリーンショット(692).png など) にある待避線。
                       外側線の外側に、駅の前後で本線から分かれて戻る線があり、
                       優等列車の待避に使われる。シミュレーターでは
                       「外側線の2本目のレーン」として持たせる。
                       線路図に描くだけでなく、実際に列車が入れる線になる。 */
                    else if (["膳所", "石山"].includes(stName) && trk.id.includes("Out")) { laneCount = 2;
                    }
                    else if (["摩耶", "西宮", "茨木"].includes(stName)) { laneCount = 2; }
                }

                // ★修正: 追加した路線の除外条件を反映しつつ blockY を適用
                if (stName === "向日町操" && !isHoppo && !isKosei && !isFukuchi && !isTozai) {
                    trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, stationIdx: i, isStation: true, x: stationX, y: blockY, lanes: [null, null], hoppoStationName: "向日町操" });
                } else {
                    trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, stationIdx: i, isStation: true, x: stationX, y: blockY, lanes: new Array(laneCount).fill(null), hoppoStationName: specialStation ? stName : null });
                }

                if (i < STATIONS.length - 1) {
                    // ★修正: 斜め補間を行わず、純粋に一定のY座標（尼崎だけ本線）でブロックを生成する
                    for (let k = 1; k <= BLOCKS_PER_STATION_GAP; k++) {
                        trackBlocks.push({ index: trackBlocks.length, trackId: trk.id, isStation: false, x: stationX + (k * BLOCK_WIDTH), y: blockY, lanes: [null] });
                    }
                }
            }
            this.blocks[trk.id] = trackBlocks;
        });

        // ★尼崎駅のレーン(番線)共有化処理を追加
        let amaUpLanes = new Array(4).fill(null);
        let amaDownLanes = new Array(4).fill(null);

        ["Up_Out", "Up_In", "Fukuchi_Up", "Tozai_Up"].forEach(tid => {
            if (this.blocks[tid]) {
                let amaB = this.blocks[tid].find(b => b.stationIdx === 36);
                if (amaB) amaB.lanes = amaUpLanes;
            }
        });

        ["Down_Out", "Down_In", "Fukuchi_Down", "Tozai_Down"].forEach(tid => {
            if (this.blocks[tid]) {
                let amaB = this.blocks[tid].find(b => b.stationIdx === 36);
                if (amaB) amaB.lanes = amaDownLanes;
            }
        });
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

    isSuspended(trackId, idx) {
        for(let m of this.manualSuspensions) if(m.trackId===trackId && idx>=m.start && idx<=m.end) return true;
        const secs = this.suspendedSections[trackId];
        if (secs) for (let s of secs) if (idx >= s.start && idx <= s.end) return true;
        return false;
    }
}
