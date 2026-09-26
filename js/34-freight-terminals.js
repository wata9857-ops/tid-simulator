/* 貨物ターミナル (js/03-stations.js の FREIGHT_TERMINALS) での列車の動き。

   ■ ターミナルの線路とのつながり
     着発線 (Frt_<id>_Up / Frt_<id>_Down) は、本線の「駅と駅のあいだ」の
     1つのブロックと同じ位置にある。
       入るとき … 本線からそのブロックへ進むときに、着発線へ横に入る (move)
       出るとき … 着発線から、進行方向の本線の次のブロックへ出る
     本線の閉塞・信号・続行間隔の判定は「次に入る線路」(turnbackTrack) を見ているので、
     着発線にいる列車の turnbackTrack を常に「出ていく本線」にしておけば、
     発車の判定・信号・進路はそのまま働く (syncFreightTerminalExit)。

   ■ ターミナルに入る列車
     ・行先がそのターミナルの貨物列車 … 着発線に着いて荷役・機回しをし、次の列車になる
     ・通過する貨物列車 … 着発線に入って乗務員交代・待避をしてから先へ進む
       (以前は旅客駅の ひめじ別所・鷹取・西大路・吹田貨 に停まっていた。停まる割合と時間は同じ)
       着発線が全部ふさがっていれば、止まらずに本線を通る (本線をふさがない)
     ・大阪タ・百済タ・安治川タ行き … 吹田タで機関車を付け替えて、線路図の外 (梅田貨物線・城東貨物線) へ出る

   ■ 着発線での作業 (freightTerminalWork / freightTerminalStage)
     到着・機関車開放 → 機回し → 荷役 (E&S 着発線荷役) → 機関車連結 → ブレーキ試験 → 出発待ち
     夜中に着いた列車は、朝の発車まで着発線に留置することがある。
     出発の時刻になっても本線が空かなければ、着発線で待つ (本線で待たない)。
*/

/* 吹田タで機関車を付け替え、線路図の外へ出ていく行先 */
const FREIGHT_EXIT_VIA_SUITA = ["大阪タ", "百済タ", "安治川タ"];

/**
 * 着発線にいる列車の「出ていく本線」を決める。
 * 着発線の先 (進行方向) は線路の無いプレースホルダなので、これを決めておかないと
 * 線区の端とみなされて運転を打ち切られてしまう。
 */
Train.prototype.syncFreightTerminalExit = function () {
    if (!isFreightTerminalTrack(this.trackId)) {
        if (this.terminalWork) this.terminalWork = null;   // ターミナルを出た
        return;
    }
    const key = freightTerminalOfTrack(this.trackId);
    const ft = FREIGHT_TERMINALS[key];
    if (!ft) return;
    const cands = (this.dir === 1) ? ft.exits.up : ft.exits.down;
    for (const tid of cands) {
        const blks = this.game.trackMgr.blocks[tid];
        const b = blks ? blks[ft.pos + this.dir] : null;
        if (b && b.x !== -1000) { this.turnbackTrack = tid; return; }
    }
};

/** その貨物ターミナルに入るか (行先・乗務員交代・待避) */
Train.prototype.wantsFreightTerminal = function (key) {
    if (this.type !== "貨物") return false;
    if (this.dest === key) return true;
    /* 吹田タ: 乗務員交代・機関車の付け替えで停まるのは、北方貨物線を通る列車と
       線路図の外 (梅田貨物線・城東貨物線) へ出る列車だけ。
       ★以前も停まっていたのは北方貨物線の上の吹田貨だけで、東海道本線 (列車線) を
         通る貨物列車は吹田に停まらなかった。全部を停めると、13分停まったあと
         列車線へ合流する貨物列車が増え、JR京都線・JR神戸線の間隔が乱れた (実測)。 */
    if (key === "吹田タ") return this.trackId.indexOf("Hoppo") >= 0 || FREIGHT_EXIT_VIA_SUITA.indexOf(this.dest) >= 0;
    if (key === "姫路タ") return !this.skipHimejiFreight;
    if (key === "京都タ") return !this.skipKyotoFreight;
    return true;                                          // 神戸タ
};

/**
 * 本線から着発線へ入るなら、その着発線の線路IDを返す (入らないなら null)。
 *   nextIdx       … これから進むブロック
 *   targetTrackId … 着発線に入らなければ進む本線
 */
Train.prototype.freightTerminalEntryTrack = function (nextIdx, targetTrackId) {
    if (isFreightTerminalTrack(this.trackId)) return null;
    const key = FREIGHT_TERMINAL_AT[nextIdx];
    if (!key) return null;
    const ft = FREIGHT_TERMINALS[key];
    const links = (this.dir === 1) ? ft.links.up : ft.links.down;
    if (links.indexOf(targetTrackId) < 0) return null;
    if (!this.wantsFreightTerminal(key)) return null;
    const fTid = freightTerminalTrack(key, this.dir);
    const fb = (this.game.trackMgr.blocks[fTid] || [])[nextIdx];
    if (!fb || fb.x === -1000) return null;
    // 行先がここの列車は、着発線が空くまで本線の手前で待つ (場内信号の手前)
    const must = this.dest === key || (key === "吹田タ" && FREIGHT_EXIT_VIA_SUITA.indexOf(this.dest) >= 0);
    if (!must && !fb.lanes.some(l => l === null)) return null;   // 通過列車は、満線なら本線を通る
    return fTid;
};

/** 着発線に着いたときの処理 (move から)。処理したら true */
Train.prototype.arriveFreightTerminal = function (key) {
    const ft = FREIGHT_TERMINALS[key];
    const now = this.game.currentTime;
    this.state = "stopped";
    this.hasStoppedAtCurrent = true;
    if (this.dest === key) {
        this.isFinalStop = true;
        this.timer = 60;
        this.nextAction = "freight_turn";
        this.terminalWork = { key: key, kind: "arrive", start: now, until: now + 60 };
        return true;
    }
    if (key === "吹田タ" && FREIGHT_EXIT_VIA_SUITA.indexOf(this.dest) >= 0) {
        // 機関車を付け替えて、梅田貨物線・城東貨物線へ (線路図の外)
        this.isFinalStop = true;
        this.timer = 900;
        this.nextAction = "remove";
        this.terminalWork = { key: key, kind: "exit", start: now, until: now + 900 };
        return true;
    }
    // 通過する列車の乗務員交代・待避
    this.timer = ft.stopSec || 420;
    this.terminalWork = { key: key, kind: "stop", start: now, until: now + this.timer };
    return true;
};

/**
 * 着発線での作業の段階 (画面表示用)。着発線にいなければ null。
 */
function freightTerminalStage(t, now) {
    if (!t || !isFreightTerminalTrack(t.trackId)) return null;
    // 着発線から出る列車 (ターミナル発) は、作業の記録が無ければ出発準備
    const w = t.terminalWork || { kind: "depart" };
    if (w.kind === "stop") return (t.state === "stopped") ? "乗務員交代・待避" : "出発待ち (本線の開通待ち)";
    if (w.kind === "exit") return "機関車付け替え (線路図の外へ)";
    if (w.kind === "arrive") return "到着・機関車開放";
    if (w.kind === "depart") return (t.state === "waiting_start" && t.timer > 0) ? "出発準備 (ブレーキ試験)" : "出発待ち (本線の開通待ち)";
    const r = (now - w.start) / Math.max(1, w.until - w.start);
    if (r >= 1) return "出発待ち (本線の開通待ち)";
    if (w.stabled && r < 0.75) return "夜間留置";
    const steps = [[0, "機関車開放"], [0.08, "機回し"], [0.18, "荷役 (E&S 着発線荷役)"],
                   [0.80, "機関車連結"], [0.88, "ブレーキ試験"], [0.95, "出発待ち"]];
    let s = steps[0][1];
    steps.forEach(x => { if (r >= x[0]) s = x[1]; });
    return s;
}

/** ターミナルの在線 (画面表示・検証用) */
function freightTerminalOccupancy(game, key) {
    const ft = FREIGHT_TERMINALS[key];
    if (!ft) return null;
    const out = { key: key, up: [], down: [] };
    [1, -1].forEach(d => {
        const b = (game.trackMgr.blocks[freightTerminalTrack(key, d)] || [])[ft.pos];
        const arr = d === 1 ? out.up : out.down;
        if (b) b.lanes.forEach(l => arr.push(l));
    });
    return out;
}
