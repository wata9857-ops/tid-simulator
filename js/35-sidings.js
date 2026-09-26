/* 駅の引上線 (js/03-stations.js の SIDINGS) を使う折り返し。

   ■ 動き
     1. 折り返す列車は、ホームで降車を済ませて折り返しの待ち (waiting_start) に入る
        (js/14-train-turnback.js が turnbackAt に駅名を入れる)。
     2. 待ちが長く (SIDING_MIN_LAYOVER 以上)、引上線が空いていれば、引上線へ入る。
        ホームが空くので、続いて着く列車がホームを使える。
     3. 発車の SIDING_RETURN_SEC 秒前になったら、ホームのある着発線へ戻って客扱いをする。
        ホームが空いていなければ、引上線で待つ (ホームの無い引上線からは発車しない)。
   引上線は本物の線路 (Sid_<id>) のブロックなので、在線の表示・駅の番線別の表示に
   そのまま出る。引上線にいるあいだに列車が動かされても (強制発車など)、すぐホームへ戻す。 */
const SIDING_MIN_LAYOVER = 240;    // これより短い待ちでは引上線に入らない [秒]
const SIDING_RETURN_SEC = 120;     // 発車のこれだけ前にホームへ戻る [秒]

Train.prototype.sidingStep = function () {
    const g = this.game;
    if (isSidingTrack(this.trackId)) { this.sidingReturn(false); return; }
    const st = this.turnbackAt;
    this.turnbackAt = null;                                     // 1回だけ見る
    const sd = st && SIDINGS[st];
    if (!sd) return;
    if (this.state !== "waiting_start" || (this.timer || 0) < SIDING_MIN_LAYOVER) return;
    if (["普通", "快速", "新快速", "回送"].indexOf(this.type) < 0) return;
    if (sd.from.indexOf(this.trackId) < 0) return;
    const blks = g.trackMgr.blocks[this.trackId];
    const blk = blks ? blks[this.currBlockIndex] : null;
    if (!blk || blockStationName(blk) !== st) return;
    const sb = (g.trackMgr.blocks[sidingTrackId(st)] || [])[sd.pos];
    if (!sb) return;
    const lane = sb.lanes.indexOf(null);
    if (lane < 0) return;                                       // 引上線がふさがっていればホームで待つ
    this.sidingBack = { trackId: this.trackId, index: this.currBlockIndex, turnbackTrack: this.turnbackTrack || null,
                        lane: this.lane, at: g.currentTime };
    freeOwnLane(blk.lanes, this);
    this.trackId = sidingTrackId(st);
    this.currBlockIndex = sd.pos;
    this.lane = lane;
    sb.lanes[lane] = this;
    this.turnbackTrack = null;
    g.sidingStats = g.sidingStats || { enter: 0, back: 0 };
    g.sidingStats.enter++;
};

/**
 * 引上線からホームへ戻る。
 *   force … 時刻に関係なく戻す (強制発車などで動かされたとき)
 */
Train.prototype.sidingReturn = function (force) {
    const g = this.game;
    const back = this.sidingBack;
    const st = sidingOfTrack(this.trackId);
    if (!back || !st) return false;
    const moved = this.state !== "waiting_start";
    if (!force && !moved && (this.timer || 0) > SIDING_RETURN_SEC) return false;
    // 戻る先: 折り返して発車する線路 (向きの合う線路) のホームのある線
    const toTrack = back.turnbackTrack || back.trackId;
    const cands = [toTrack, back.trackId].filter((x, i, a) => a.indexOf(x) === i);
    for (const tid of cands) {
        const blk = (g.trackMgr.blocks[tid] || [])[back.index];
        if (!blk) continue;
        const hour = (g.currentTime / 3600) % 24;
        let lane = pickRouteLane(blk, st, tid, "depart", this.type, hour, false);
        if (lane >= 0 && !laneHasPlatform(st, tid, lane)) {
            lane = -1;
            for (let l = 0; l < blk.lanes.length; l++) {
                if (blk.lanes[l] === null && laneHasPlatform(st, tid, l) && canDepartTo(st, tid, l, toTrack)) { lane = l; break; }
            }
        }
        if (lane < 0) continue;
        const sb = (g.trackMgr.blocks[this.trackId] || [])[this.currBlockIndex];
        if (sb) freeOwnLane(sb.lanes, this);
        this.trackId = tid;
        this.currBlockIndex = back.index;
        this.lane = lane;
        blk.lanes[lane] = this;
        this.turnbackTrack = (tid === toTrack) ? null : toTrack;
        this.sidingBack = null;
        this.state = "waiting_start";
        this.timer = Math.max(this.timer || 0, 90);             // ホームでの乗車の時間
        g.sidingStats = g.sidingStats || { enter: 0, back: 0 };
        g.sidingStats.back++;
        return true;
    }
    // ホームが空かない: 引上線で待つ (ホームの無い所から発車しない)
    this.state = "waiting_start";
    this.timer = Math.max(this.timer || 0, SIDING_RETURN_SEC + 15);
    return false;
};

/** 引上線の在線 (画面表示用) */
function sidingOccupancy(game, stName) {
    const sd = SIDINGS[stName];
    if (!sd) return [];
    const b = (game.trackMgr.blocks[sidingTrackId(stName)] || [])[sd.pos];
    return b ? b.lanes.slice() : [];
}
