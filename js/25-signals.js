/* 信号機と閉塞(ブロック)の管理。

   ■ 何をしているか
     シミュレーターはもともと、線路を「ブロック」に区切り、
     ブロックの lanes[] に列車が入っているかどうかで在線を持っている。
     これは実際の軌道回路とほぼ同じ作りなので、
     ここではその在線から信号機の現示を組み立てる。

     ブロックとブロックの境目には、進行方向を向いた信号機が立っている。
     そのブロックへ入ろうとする列車は、この信号機の現示にしたがう。

   ■ 現示の決め方 (前方の空きブロック数で決まる、実際の多灯式と同じ考え方)
       0閉塞先まで塞がっている            → R  停止
       1閉塞先まで空き                    → Y  注意
       2閉塞先まで空き                    → YG 減速
       3閉塞先以上空き                    → G  進行
     さらに次のときは無条件で R にする。
       ・運転見合わせ区間
       ・防護無線の発報中
       ・転てつ器故障などで進路が構成できない区間 (障害の登録)
       ・進入先の駅の番線がすべて塞がっている (進路なし)

   ■ シミュレーションとのつながり
     飾りではなく、実際に列車の動きを決めている。
       ・Train.checkHold()     … 停止現示なら発車・進入しない
       ・Train.calcTravelTime() … 注意・減速現示では所要時間が延びる
       ・障害 (js/26-incidents.js) は信号に障害を登録して波及させる
*/

const SIGNAL_ASPECTS = {
    R:  { code: "R",  name: "停止", lamps: ["#ff2020"],                       speed: 0    },
    YY: { code: "YY", name: "警戒", lamps: ["#ffd21e", "#ffd21e"],            speed: 0.35 },
    Y:  { code: "Y",  name: "注意", lamps: ["#ffd21e"],                       speed: 0.55 },
    YG: { code: "YG", name: "減速", lamps: ["#ffd21e", "#25e63c"],            speed: 0.80 },
    G:  { code: "G",  name: "進行", lamps: ["#25e63c"],                       speed: 1.0  }
};

/* 現示ごとの所要時間の倍率。1.0 が定速。
   もともとの協調追従ロジック (calcTravelTime) が出す減速率と比べ、
   大きい方(遅い方)を採用する。既存の動きを壊さないための保険。 */
const SIGNAL_TIME_FACTOR = { R: 1.0, YY: 1.7, Y: 1.4, YG: 1.15, G: 1.0 };

class SignalSystem {
    constructor(game) {
        this.game = game;
        // trackId -> Int8Array 相当の現示コード配列 (ブロック単位)
        this.aspects = {};
        // 障害による進路支障。{ trackId, start, end, reason, until } の配列
        this.faults = [];
        this._dirty = true;
    }

    /** 障害を登録する (転てつ器故障・信号故障・支障物など) */
    addFault(trackId, start, end, reason) {
        this.faults.push({
            trackId: trackId,
            start: Math.min(start, end),
            end: Math.max(start, end),
            reason: reason || "信号支障"
        });
        this._dirty = true;
    }

    /** 登録した障害をすべて外す */
    clearFaults(filter) {
        if (!filter) { this.faults = []; }
        else { this.faults = this.faults.filter(f => !filter(f)); }
        this._dirty = true;
    }

    /** その区間に障害があるか */
    hasFault(trackId, idx) {
        for (const f of this.faults) {
            if (f.trackId === trackId && idx >= f.start && idx <= f.end) return true;
        }
        return false;
    }

    /** 障害の理由 (画面表示用) */
    faultReason(trackId, idx) {
        for (const f of this.faults) {
            if (f.trackId === trackId && idx >= f.start && idx <= f.end) return f.reason;
        }
        return "";
    }

    /** そのブロックが進入できない状態か (在線・見合わせ・障害・防護無線) */
    isBlocked(trackId, idx) {
        const blks = this.game.trackMgr.blocks[trackId];
        if (!blks || idx < 0 || idx >= blks.length) return true;
        const b = blks[idx];
        if (b.x === -1000) return true;                       // 線路の無い区間
        if (this.game.trackMgr.isSuspended(trackId, idx)) return true;
        if (this.hasFault(trackId, idx)) return true;
        return b.lanes.every(l => l !== null);                // 満線 = 進路なし
    }

    /**
     * ブロック idx の入口に立つ、dir 方向を向いた信号機の現示。
     * (idx はこれから入ろうとするブロック)
     */
    aspectFor(trackId, idx, dir) {
        // 防護無線の発報中は全線停止現示
        if (this.game.isEmergency) return "R";
        const blks = this.game.trackMgr.blocks[trackId];
        if (!blks) return "R";
        if (this.isBlocked(trackId, idx)) return "R";

        // 前方の空き閉塞数を数える
        let clear = 0;
        for (let k = 1; k <= 3; k++) {
            const j = idx + dir * k;
            if (j < 0 || j >= blks.length) break;
            if (blks[j].x === -1000) break;                   // 線路の終わり = 進行で良い
            if (this.isBlocked(trackId, j)) break;
            clear++;
        }
        if (clear === 0) return "Y";                          // 次が塞がっている = 注意
        if (clear === 1) return "YG";                         // 減速
        return "G";
    }

    /** 列車 t から見た、直前方の信号機の現示 */
    aspectAhead(train) {
        return this.aspectFor(train.trackId, train.currBlockIndex + train.dir, train.dir);
    }

    /** 現示が停止か */
    isStopAhead(train) {
        return this.aspectAhead(train) === "R";
    }

    /** 現示に応じた所要時間の倍率 */
    timeFactorAhead(train) {
        return SIGNAL_TIME_FACTOR[this.aspectAhead(train)] || 1.0;
    }

    /**
     * 列車に対して構成されている進路 (Super-TID で緑に塗る区間)。
     * 停止現示より手前まで、最大 maxLen ブロックぶん返す。
     */
    routeBlocks(train, maxLen) {
        maxLen = maxLen || 4;
        const out = [];
        const blks = this.game.trackMgr.blocks[train.trackId];
        if (!blks) return out;
        // 停車中・抑止中で発車できない列車には進路が開通していない
        if (train.isManuallySuspended || this.game.isEmergency) return out;
        for (let k = 1; k <= maxLen; k++) {
            const j = train.currBlockIndex + train.dir * k;
            if (j < 0 || j >= blks.length) break;
            if (blks[j].x === -1000) break;
            if (this.isBlocked(train.trackId, j)) break;
            out.push(j);
        }
        return out;
    }

    /**
     * 画面に出すための信号機の一覧を、指定した範囲ぶんだけ作る。
     * ブロック境界すべてに信号機を立てると多すぎるので、
     * 「駅の出発信号機」と「駅間の閉塞信号機」に絞る。
     */
    signalsInRange(trackId, dir, xMin, xMax) {
        const blks = this.game.trackMgr.blocks[trackId];
        const out = [];
        if (!blks) return out;
        for (let i = 0; i < blks.length; i++) {
            const b = blks[i];
            if (b.x === -1000) continue;
            if (b.x < xMin || b.x > xMax) continue;
            // 進行方向の手前側の端に信号機を置く
            const isStation = b.isStation || !!b.hoppoStationName;
            // 駅は出発信号機、駅間は閉塞信号機。駅間は1ブロックおきに間引く。
            if (!isStation && (i % 2 !== 0)) continue;
            out.push({
                trackId: trackId,
                index: i,
                dir: dir,
                x: b.x - dir * (BLOCK_WIDTH * 0.5),
                y: b.y,
                kind: isStation ? "出発" : "閉塞",
                aspect: this.aspectFor(trackId, i + dir, dir)
            });
        }
        return out;
    }

    /** 在線しているブロックの一覧 (Super-TID の在線表示用) */
    occupiedBlocks(trackId) {
        const blks = this.game.trackMgr.blocks[trackId];
        const out = [];
        if (!blks) return out;
        for (let i = 0; i < blks.length; i++) {
            if (blks[i].x === -1000) continue;
            if (blks[i].lanes.some(l => l !== null)) out.push(i);
        }
        return out;
    }
}
