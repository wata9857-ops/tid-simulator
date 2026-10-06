/* 運転整理の基本の決まり (2026-10 の13回目。利用者の指摘 ①③④⑤⑥)

   ■ ⑤ 優等列車を先に (どの待避・発車の判断よりも先に見る)
     発車しようとする列車 L の「同じ駅 (同じ向き・同じ線路へ出る)」か「すぐ後ろの駅間 (1つ手前の駅との間)」に
     格上の列車 H がいれば、どんな場合でも H を先に出す (priorityRuleHold)。
     待避の先読み (planOvertakes の "go")・尼崎 PRC の繰り延べ・逃げ切り・待ちの上限より先に見るので、
     それらの判断がこの決まりを破ることは無い。次のときだけは当てはめない (物理的に先に出せない・意味が無い)。
       ・H がこの駅に入れる番線が無い (待つと互いに動けなくなる)
       ・H が故障・抑止で止まっている、または2分以上動けていない / H がこの駅止まり・折り返し
       ・H がこの駅でまだ長く止まる (発車まで2分半より長い)
       ・追い抜きをしない駅 (徳庵・放出。前回の利用者の指摘で着いた順に出す駅)
       ・下の ③ で「格の差が無い」とみなした組み合わせ
       ・待つと駅の番線が埋まり、ほかに入ってこようとしている列車が駅間で止まる (詰まりの元になる)
       ・尼崎と手前の駅 (立花・塚口・加島・塚本)。ここは尼崎 PRC の見積もり (遅れ × 重みの合計が小さい方) に任せる
         (利用者の指摘 ②「ふだんの優先の決まりが当てはまらないことがあってよい」)。
         ここでも当てはめると、普通が快速を待つあいだ尼崎の番線が埋まり、宝塚線・東西線の列車が入れずに
         塚口の先まで詰まった (check_amagasaki で 尼崎発車の平均遅れ 79秒 → 159秒)。__PRIO_AT_AMA で当てはめられる
   ■ ③ 停車駅がほとんど同じ普通と快速・新快速
     次の待避駅 (または行先) までの所要の差が 75秒以内なら、格上として扱わない (stopPatternSimilar)。
     普通を待たせて快速を先に通しても、普通がすぐ後ろを続くだけで得が無いため。
     同じ駅での発車順・待避駅の待ち・待避の先読み・尼崎 PRC・⑤ のすべてでこの判定を使う。
   ■ ⑥ 長い抑止・見合わせの手前では、列車を駅間に止めない
     前方 12駅の内に、見合わせ・線路閉鎖・段階開通の区間、または故障・抑止で止まっている列車があるとき、
     駅にいる列車は「次の駅までに止まってしまう」(次の駅の前でふさがっている・次の駅に入れる番線が無い) なら
     その駅で待つ (safeStationHold)。待避駅・主要駅に限らず、どの駅でも待つ。
     その結果、見合わせの前でも広い範囲で駅に列車がとどまるが、駅間で閉じ込めるよりよい。
     遅れは積む (待っているのは見合わせのため)。
   ■ ① 貨物列車と線路閉鎖
     ・閉鎖の手前では、待避のできる駅 (2線以上)・貨物ターミナルで作業の明けを待つ。その先にもっと閉鎖に近い
       待避駅があって空いていれば、そこまで進む (freightWorkWait)。この待ちは遅れにしない (_workWait)。
     ・複々線で外側線 (内側線) を閉鎖したときは、渡り線のある駅のあいだだけ隣の線路を通す (workDetourSide)。
       旅客列車は外側線にホームの無い駅があるので、内側線 → 外側線へは回さない。
   ■ ④ 学研都市線の昼間の普通は、木津方は松井山手まで (gakkenDaytimeCut)
     9:30〜16:30 に行先を決める普通 (列車を出すとき・尼崎で JR東西線へ折り返すとき) は、
     松井山手より先 (京田辺・同志社前・木津 …) を行先にせず松井山手止まりにする。
     祝園の留置へ入る列車 (入区する列車) はそのまま。快速・区間快速は対象にしない。 */

/* ------------------------------------------------------------------ ③ 停車駅の近い組み合わせ */
const SIMILAR_STOP_SEC = 75;
const _simCache = new Map();
let _simCacheAt = -1;
/** 普通 L と快速・新快速 H が、次の待避駅まで停車駅がほとんど同じか (H を格上として扱わなくてよいか) */
function stopPatternSimilar(L, H) {
    if (!L || !H || L.type !== "普通" || ["快速", "新快速"].indexOf(H.type) < 0 || L.dir !== H.dir) return false;
    const g = L.game;
    if (!g || globalThis.__NO_SIMILAR_STOPS) return false;
    if (_simCacheAt !== g.currentTime) { _simCache.clear(); _simCacheAt = g.currentTime; }
    const key = L.id + ":" + H.id + ":" + L.currBlockIndex + ":" + L.trackId;
    if (_simCache.has(key)) return _simCache.get(key);
    const bs = g.trackMgr.blocks[L.turnbackTrack || L.trackId];
    let res = false;
    if (bs) {
        const runL = BLOCK_RUN_SEC[L.type] || 48, runH = BLOCK_RUN_SEC[H.type] || 40;
        let tL = 0, tH = 0, n = 0, same = true;
        for (let j = 1; j <= UNITS_PER_STATION * 10; j++) {
            const b = bs[L.currBlockIndex + L.dir * j];
            if (!b || b.x === -1000) break;
            tL += runL; tH += runH;
            if (!isRealStationBlock(b)) continue;
            const nm = blockStationName(b);
            n++;
            if (nm === L.dest || nm === H.dest || (b.lanes.length >= 2 && PASSING_STATIONS.indexOf(nm) >= 0)) break;
            const dw = (STATIONS[b.stationIdx] && STATIONS[b.stationIdx].stopTime) || 45;
            const sL = L.passengerStopsAt(nm), sH = H.passengerStopsAt(nm);
            if (sL) tL += dw;
            if (sH) tH += dw;
            if (sL && !sH) same = false;
        }
        /* ★停まる駅がまったく同じなら、走る速さの差 (BLOCK_RUN_SEC の種別ごとの値) だけで格上とはしない。
           西明石より西の快速は各駅に停まるので、大久保で普通が快速を待っても追い抜かれず、
           待つあいだ大久保の番線をふさいで、うしろの新快速が入れなくなっていた (利用者の指摘 ③ 2026-10) */
        res = n >= 1 && ((tL - tH) <= SIMILAR_STOP_SEC || same);
    }
    _simCache.set(key, res);
    return res;
}
/** H が L より格上か (③ の「格の差が無い」組み合わせを除く) */
function trainOutranks(H, L) {
    if (!H || !L || H.getPriority() <= L.getPriority()) return false;
    return !stopPatternSimilar(L, H);
}

/* ------------------------------------------------------------------ ⑤ 優等列車を先に */
/** その駅を出ていく線路 (尼崎の分岐・複々線の端の振り分けを含む) */
function departTrackAt(t, stName) {
    if (stName === "尼崎" && typeof amaOutTrack === "function") return amaOutTrack(t);
    let tr = t.turnbackTrack || t.trackId;
    // 複々線から複線へ出る駅では、内側線・外側線のどちらも外側線へ出る
    if ((stName === "西明石" && t.dir === -1) || (stName === "草津" && t.dir === 1)) tr = tr.replace("_In", "_Out");
    return tr;
}
function rulePriorityHealthy(H) {
    return H.state !== "finished" && H.state !== "in_depot" && H.state !== "turning_back" && !H.overnightStable &&
           !H.minorTrouble && !H.isManuallySuspended && !H.commIncident && !(H.stuckTime >= 120) && H.type !== "留置";
}
/** 格上の列車が同じ駅か、すぐ後ろの駅間にいれば、その列車を返す (L はこの駅で待つ) */
function priorityRuleHold(t) {
    if (globalThis.__NO_PRIORITY_RULE) return null;
    if (["stopped", "holding", "waiting_start"].indexOf(t.state) < 0) return null;
    if (t.isManuallySuspended || t.minorTrouble || t.workPermit) return null;
    const g = t.game, tm = g.trackMgr;
    const own = tm.blocks[t.trackId];
    const here = own && own[t.currBlockIndex];
    if (!here || !isRealStationBlock(here) || here.freightTerminal) return null;
    const st = blockStationName(here);
    if (st === t.dest && !t.turnbackTrack) return null;
    if (NO_PASSING_STATIONS.indexOf(st) >= 0) return null;
    // 尼崎と手前の駅は尼崎 PRC の見積もりに任せる (利用者の指摘 ②。ここで ⑤ を当てると尼崎の番線が埋まって詰まる)
    if (!globalThis.__PRIO_AT_AMA && typeof AMA_PRC !== "undefined" &&
        (st === AMA_PRC.station || AMA_PRC.approachStations.indexOf(st) >= 0)) return null;
    const myOut = departTrackAt(t, st);
    const idx = t.currBlockIndex;
    /* 単線区間の入口・中の駅では当てはめない。ここで待つと、向かいから単線へ入った列車と
       互いの番線を待ち合って動けなくなる (松井山手で実際に起きた) */
    if (singleUnitAt(myOut, idx + t.dir) || singleUnitAt(t.trackId, idx)) return null;
    /* 待つと駅の番線が埋まり、ほかに入ってこようとしている列車が駅間で止まるなら待たない
       (尼崎で普通が快速を待つと、宝塚線・東西線の列車が入れなくなり、塚口の先まで動けなくなった) */
    const queued = (H) => {
        let need = 0;
        for (const x of g.trains) {
            if (x === t || x === H || x.state === "finished" || x.state === "in_depot" || !x.dir) continue;
            const xb = (tm.blocks[x.trackId] || [])[idx];
            if (!xb || xb.lanes !== here.lanes) continue;
            const d = (idx - x.currBlockIndex) * x.dir;
            if (d >= 1 && d <= Math.ceil(UNITS_PER_STATION * 1.5)) need++;
        }
        return need;
    };
    const jams = (H, hInside) => {
        const free = here.lanes.filter(x => x === null).length - (hInside ? 0 : 1);
        return free <= 0 && queued(H) > 0;
    };
    // この駅にブロックを持つ、同じ向きの線路 (尼崎なら本線・宝塚線・東西線)
    const tracks = [];
    for (const id in tm.blocks) {
        if (trackDirOf(id) !== t.dir || isFreightTerminalTrack(id)) continue;
        const b = tm.blocks[id][idx];
        if (b && b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === st) tracks.push(id);
    }
    // 1. 同じ駅に格上の列車がいて、同じ線路へ出る
    for (const id of tracks) {
        for (const H of tm.blocks[id][idx].lanes) {
            if (!H || H === t || H.dir !== t.dir || !rulePriorityHealthy(H)) continue;
            if (H.type === "回送" && westDoubleTrack(t, st)) continue;     // 西明石より西の複線では回送を先に通さない
            if (H.dest === st || (H.timer || 0) > 150) continue;
            if (H.state === "waiting_start" && !H.hasDeparted && (H.timer || 0) > 60) continue;
            if (departTrackAt(H, st) !== myOut || !trainOutranks(H, t)) continue;
            if (jams(H, true)) continue;
            return H;
        }
    }
    // 2. すぐ後ろの駅間 (1つ手前の駅を出た格上の列車。通過中も含む)
    for (const id of tracks) {
        const bs = tm.blocks[id];
        const hb = bs[idx];
        for (let k = 1; k <= UNITS_PER_STATION; k++) {
            const b = bs[idx - t.dir * k];
            if (!b || b.x === -1000) break;
            const isSt = isRealStationBlock(b);
            for (const H of b.lanes) {
                if (!H || H.dir !== t.dir || H.trackId !== id || !rulePriorityHealthy(H)) continue;
                if (H.type === "回送" && westDoubleTrack(t, st)) continue;
                if (isSt && H.state !== "running") continue;      // 手前の駅に停まっている列車は、まだ駅間にいない
                if (H.dest === st || !trainOutranks(H, t)) continue;
                if (departTrackAt(H, st) !== myOut) continue;
                const ho = departTrackAt(H, st);
                if (H.findFreeLane(hb, ho !== id ? ho : undefined) === -1) continue;   // この駅に入れないなら待たない
                if (jams(H, false)) continue;
                return H;
            }
            if (isSt) break;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ ⑥ 駅間に止めない */
const SAFE_SCAN_STATIONS = 12;
/** 前方の長い支障 (見合わせ・線路閉鎖・段階開通・故障や抑止で止まっている列車)。{ j, idx, closure, stall } */
function longBlockageAhead(t, tid, from) {
    const g = t.game, tm = g.trackMgr, bs = tm.blocks[tid];
    if (!bs) return null;
    for (let j = 1; j <= UNITS_PER_STATION * SAFE_SCAN_STATIONS; j++) {
        const idx = from + t.dir * j;
        const b = bs[idx];
        if (!b || b.x === -1000) return null;
        if (tm.isSuspended(tid, idx, t)) return { j: j, idx: idx, closure: tm.workClosureAt(tid, idx) };
        const real = isRealStationBlock(b);
        if (real && blockStationName(b) === t.dest) return null;      // 支障の手前で降りる
        for (const l of b.lanes) {
            /* 長く止まる列車だけ (故障・抑止・指令とのやりとり中)。ふだんの詰まりで止まっている列車まで数えると、
               混んでいるだけで後ろの駅に次々と列車を止めてしまう (尼崎の手前で実際に起きた) */
            if (!l || l === t || l.dir !== t.dir || !(l.minorTrouble || l.isManuallySuspended || l.commIncident)) continue;
            if (real && b.lanes.some(x => x === null)) continue;       // 駅の別の番線は使える
            return { j: j, idx: idx, stall: l };
        }
    }
    return null;
}
/** 前を見る線路 (折り返し・貨物ターミナルの着発線・閉鎖による隣の線路への振り替えを含む) */
function forwardTrackOf(t, here) {
    let tid = t.turnbackTrack || t.trackId;
    if (isFreightTerminalTrack(tid)) {
        const ft = FREIGHT_TERMINALS[freightTerminalOfTrack(tid)];
        if (ft) tid = (t.dir === 1 ? ft.exits.up : ft.exits.down)[0];
    }
    if (/^(Up|Down)_(In|Out)$/.test(tid) && here && here.stationIdx !== undefined && innerTrackExists(here.stationIdx)) {
        const w = serviceTrackIdAt(t, here.stationIdx, (t.game.currentTime / 3600) % 24, tid);
        const wb = t.game.trackMgr.blocks[w];
        const nb = wb && wb[t.currBlockIndex + t.dir];
        if (w !== tid && nb && nb.x !== -1000) tid = w;
    }
    return tid;
}
/** 駅にいる列車を、前方の長い支障のためにここで待たせるか。待たせるなら支障を返す */
function safeStationHold(t) {
    if (globalThis.__NO_SAFE_HOLD || t.workPermit) return null;
    if (["stopped", "holding", "waiting_start", "running"].indexOf(t.state) < 0) return null;
    const g = t.game, tm = g.trackMgr;
    const own = tm.blocks[t.trackId];
    const here = own && own[t.currBlockIndex];
    if (!here || !isRealStationBlock(here)) return null;
    if (blockStationName(here) === t.dest && !t.turnbackTrack) return null;
    const tid = forwardTrackOf(t, here);
    const bl = longBlockageAhead(t, tid, t.currBlockIndex);
    if (!bl) return null;
    if (bl.stall && t.stuckTime > 3600) return null;             // 見誤りの保険
    const bs = tm.blocks[tid];
    let S = null, between = 0;
    for (let j = 1; j < bl.j; j++) {
        const b = bs[t.currBlockIndex + t.dir * j];
        if (!b) break;
        if (isRealStationBlock(b)) { S = b; break; }
        between += b.lanes.filter(l => l && l !== t && l.dir === t.dir).length;
    }
    if (!S) return bl;                                            // 次の駅の手前でふさがっている
    const free = S.lanes.filter(x => x === null).length;
    if (free <= between || t.findFreeLane(S) === -1) return bl;   // 次の駅に入れない
    return null;
}

/* ------------------------------------------------------------------ ① 貨物列車は待避して閉鎖の明けを待つ */
function nwRefugeBlock(b) {
    return !!b && (!!b.freightTerminal || (isRealStationBlock(b) && b.lanes.length >= 2));
}
/** 貨物列車をここで (閉鎖の明けまで) 待たせるか */
function freightWorkWait(t) {
    if (t.type !== "貨物" || t.workPermit) return false;
    const g = t.game, tm = g.trackMgr;
    if (!tm.workClosures || !tm.workClosures.length) return false;
    const own = tm.blocks[t.trackId];
    const here = own && own[t.currBlockIndex];
    if (!nwRefugeBlock(here)) return false;
    if (["stopped", "holding", "waiting_start", "running"].indexOf(t.state) < 0) return false;
    const tid = forwardTrackOf(t, here);
    const bs = tm.blocks[tid];
    if (!bs) return false;
    // 前方 8駅の内の閉鎖
    let cj = -1;
    for (let j = 1; j <= UNITS_PER_STATION * 8; j++) {
        const b = bs[t.currBlockIndex + t.dir * j];
        if (!b || b.x === -1000) return false;
        if (tm.workClosureAt(tid, b.index)) { cj = j; break; }
        if (isRealStationBlock(b) && blockStationName(b) === t.dest) return false;
    }
    if (cj < 0) return false;
    // その先 (閉鎖の手前) に、空いている待避駅があればそこまで進む
    let between = 0;
    for (let j = 1; j < cj; j++) {
        const b = bs[t.currBlockIndex + t.dir * j];
        if (nwRefugeBlock(b) && b.lanes.filter(x => x === null).length > between + 1) return false;
        between += b.lanes.filter(l => l && l !== t && l.dir === t.dir).length;
    }
    return true;
}
/** 貨物列車の行く手 (次のブロック) が線路閉鎖か */
function freightBlockedByWork(t) {
    if (t.type !== "貨物") return false;
    const tm = t.game.trackMgr;
    const c = tm.workClosureAt(t.turnbackTrack || t.trackId, t.currBlockIndex + t.dir);
    return !!(c && c.freightOk);
}

/* ------------------------------------------------------------------ ① 複々線の閉鎖: 隣の線路を通す */
const DETOUR_XOVERS = ["西明石", "明石", "芦屋", "尼崎", "大阪", "新大阪", "茨木", "高槻", "長岡京", "向日町", "京都", "膳所", "草津"];
function closureOnSpan(tm, tid, a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (const c of tm.workClosures || []) if (c.trackId === tid && c.end >= lo && c.start <= hi) return c;
    return null;
}
/** from から dir の向きに、次の渡り線のある駅のブロック番号 (無ければ線路の端) */
function nextXoverIdx(tm, tid, from, dir) {
    const bs = tm.blocks[tid];
    if (!bs) return from;
    let last = from;
    for (let j = 1; j <= UNITS_PER_STATION * 40; j++) {
        const b = bs[from + dir * j];
        if (!b || b.x === -1000) return last;
        last = b.index;
        if (isRealStationBlock(b) && DETOUR_XOVERS.indexOf(blockStationName(b)) >= 0) return b.index;
    }
    return last;
}
/** 閉鎖のために隣の線路を走らせるときの側 ("in" / "out")。振り替えないなら null */
function workDetourSide(t, stIdx, side) {
    const g = t && t.game;
    if (!g || !g.trackMgr || t.workPermit || globalThis.__NO_WORK_DETOUR) return null;
    const tm = g.trackMgr;
    if (!tm.workClosures || !tm.workClosures.length) return null;
    if (!/^(Up|Down)_(In|Out)$/.test(t.trackId || "") || !innerTrackExists(stIdx)) return null;
    const head = t.trackId.indexOf("Up") === 0 ? "Up_" : "Down_";
    const normal = head + (side === "out" ? "Out" : "In");
    const other = head + (side === "out" ? "In" : "Out");
    const idx = stIdx * UNITS_PER_STATION;
    const b = (tm.blocks[normal] || [])[idx];
    if (!b) return null;
    const nextX = nextXoverIdx(tm, normal, idx, t.dir);
    const curSide = /_Out$/.test(t.trackId) ? "out" : "in";
    if (DETOUR_XOVERS.indexOf(blockStationName(b)) >= 0) {
        if (side === "in" && PASSENGER_TYPES.indexOf(t.type) >= 0) return null;   // 外側線にホームの無い駅がある
        const c = closureOnSpan(tm, normal, idx + t.dir, nextX);
        if (c && c.detour && !closureOnSpan(tm, other, idx + t.dir, nextX)) return side === "out" ? "in" : "out";
        return null;
    }
    // 渡り線の無い駅: 振り替えて走っている列車は、次の渡り線の駅まで隣の線路のまま
    if (curSide === side) return null;
    const prevX = nextXoverIdx(tm, normal, idx, -t.dir);
    if (closureOnSpan(tm, normal, prevX, nextX)) return curSide;
    return null;
}
(function () {
    if (typeof serviceTrackSide !== "function") return;
    const baseSide = serviceTrackSide;
    serviceTrackSide = function (train, stIdx, hour) {
        const s = baseSide(train, stIdx, hour);
        let d = null;
        try { d = workDetourSide(train, stIdx, s); } catch (e) { d = null; }
        return d || s;
    };
})();

/* ------------------------------------------------------------------ 組み込み (checkHold・遅れ) */
const DISPATCH_RULE_STATS = { priority: 0, safeHold: 0, freightWait: 0, similar: 0, gakken: 0 };
(function () {
    const baseHold = Train.prototype.checkHold;
    Train.prototype.checkHold = function (isStarting) {
        this._workWait = false;
        this._safeHold = false;
        this._safeHoldNo = null;
        this._holdWhy = null;
        if (isStarting && !this.forceStart) {
            // ① 貨物列車は待避駅・貨物ターミナルで閉鎖の明けを待つ (遅れにしない)
            if (freightWorkWait(this)) {
                this._workWait = true; this._routineHold = true;
                this._holdWhy = "線路閉鎖の明けを待つ (待避)";
                DISPATCH_RULE_STATS.freightWait++;
                return true;
            }
            // ⑥ 長い支障の手前では駅で待つ
            const bl = safeStationHold(this);
            if (bl) {
                this._routineHold = true;
                this._safeHold = true;
                if (bl.closure) {
                    this._safeHoldNo = bl.closure.no;
                    if (this.type === "貨物" && bl.closure.freightOk) this._workWait = true;
                }
                this._holdWhy = bl.closure ? `線路閉鎖 第${bl.closure.no}号の手前 (駅で待つ)` : "前方の支障 (駅間に止めないよう駅で待つ)";
                DISPATCH_RULE_STATS.safeHold++;
                return true;
            }
            // ⑤ 格上の列車が同じ駅・すぐ後ろの駅間にいれば先に出す
            const H = priorityRuleHold(this);
            if (H) {
                this._routineHold = true;
                this._holdWhy = `${H.trainNo} (${H.type}) を先に通す`;
                DISPATCH_RULE_STATS.priority++;
                return true;
            }
        }
        const r = baseHold.call(this, isStarting);
        if (r && !this._workWait && freightBlockedByWork(this)) this._workWait = true;
        return r;
    };
    const baseBlocked = Train.prototype.addBlockedDelay;
    Train.prototype.addBlockedDelay = function (blks) {
        if (this._workWait || freightBlockedByWork(this)) return;
        if (this._safeHold) { this.delayTime += CONFIG.TICK_SEC; return; }
        return baseBlocked.call(this, blks);
    };
    const baseHoldDelay = Train.prototype.addHoldDelay;
    Train.prototype.addHoldDelay = function () {
        if (this._workWait || freightBlockedByWork(this)) return;
        return baseHoldDelay.call(this);
    };
})();

/* ------------------------------------------------------------------ ④ 学研都市線の昼間の普通

   ★走っている列車の行先を途中で松井山手に変えると、松井山手で折り返したあとの行路が食い違い、
     松井山手の前後で上下の列車が向かい合って何時間も動けなくなった。そこで、行先を決める所
     (列車を出すとき・尼崎で JR東西線へ折り返すとき) でだけ松井山手までにする。 */
const GAKKEN_DAY_FROM = 9.5, GAKKEN_DAY_TO = 16.5;
/** 昼間の普通で、木津方の行先が松井山手より先なら "松井山手" を返す (変えなくてよければ null) */
function gakkenDaytimeCut(game, type, dir, trackId, dest, nextAction) {
    if (globalThis.__NO_GAKKEN_DAY || type !== "普通" || dir !== 1 || !dest || dest === "松井山手") return null;
    const h = (game.currentTime / 3600) % 24;
    if (h < GAKKEN_DAY_FROM || h >= GAKKEN_DAY_TO) return null;
    if (dest === "祝園" && /depot/.test(nextAction || "")) return null;      // 祝園の留置へ入る列車
    const mb = stationBlockOn(game, "Tozai_Up", "松井山手");
    const db = stationBlockOn(game, "Tozai_Up", dest);
    const beyond = (mb && db) ? db.index > mb.index
        : (typeof KATAMACHI_BEYOND !== "undefined" && KATAMACHI_BEYOND.indexOf(dest) >= 0);
    return beyond ? "松井山手" : null;
}
(function () {
    const baseAdd = GameSystem.prototype.addTrain;
    GameSystem.prototype.addTrain = function (config) {
        if (config && !config.specialEvent && !config.workTrain) {
            const sb = config.startName && stationBlockOn(this, "Tozai_Up", config.startName);
            const mb = stationBlockOn(this, "Tozai_Up", "松井山手");
            const before = !sb || !mb || sb.index < mb.index;
            const d = before ? gakkenDaytimeCut(this, config.type, config.dir, config.trackId, config.dest, config.nextAction) : null;
            if (d) { config.dest = d; DISPATCH_RULE_STATS.gakken++; }
        }
        return baseAdd.call(this, config);
    };
    // 尼崎などで折り返して JR東西線・学研都市線へ入る普通
    const baseSw = Train.prototype.maybeSwitchTozaiType;
    Train.prototype.maybeSwitchTozaiType = function (stName, newTrackId) {
        baseSw.call(this, stName, newTrackId);
        if ((newTrackId || "").indexOf("Tozai") !== 0) return;
        const d = gakkenDaytimeCut(this.game, this.type, this.dir, newTrackId, this.dest, this.nextAction);
        if (d && this.game.fleet.canServe(this.vehicles, d, this.type, newTrackId, d, this.dutyName)) {
            this.dest = d;
            DISPATCH_RULE_STATS.gakken++;
        }
    };
})();

/* ------------------------------------------------------------------ ⑦ 単線の入口駅の詰まり (2026-10 利用者の指摘 1. 松井山手)

   ■ 起きたこと
     遅れのある中、松井山手の ① に同志社前行きの快速、② (下りの線) に松井山手止まりの普通がいて、
     木津方の単線 (松井山手〜大住) には西明石方へ向かう列車が入っていた。普通は遅れが大きいため折り返さず
     (preferTurnback)、「前方でいちばん近い車両所」= 祝園へ入区を兼ねた普通に変わった。
     ② は単線から来る列車の入る唯一の番線なので、3本とも動けなくなった。
   ■ どうするか
     a. 入区先を選ぶとき、前方の車両所が単線区間の先にあり、その場で折り返して後方の車両所へ行けるなら後方を選ぶ
     b. 終着列車が反対側の番線へ入る (terminalCrossArrival) のは、単線区間からその番線へ向かってくる列車が
        いないときだけ。いれば手前 (複線) で自分の側の番線が空くのを待つ
     c. それでも詰まったら (単線の中の列車が入る番線を、単線へ入ろうとする列車がふさいでいる)、
        ふさいでいる列車をその場で折り返させ、後方の車両所へ向かわせる (指令の運転整理) */
DISPATCH_RULE_STATS.singleJam = 0;

/** 駅 here から行先 dest へ線路 trackId を進むと単線区間を通るか */
function pathCrossesSingleTrack(trackId, hereName, destName) {
    const a = STATION_MAP[hereName], b = STATION_MAP[destName];
    if (a === undefined || b === undefined || a === b) return false;
    const lo = Math.min(a, b) * UNITS_PER_STATION, hi = Math.max(a, b) * UNITS_PER_STATION;
    for (let i = lo + 1; i < hi; i++) if (singleUnitAt(trackId, i)) return true;
    return false;
}

/** 単線区間から駅 (ブロック stIdx) の線路 oppId へ、向き oppDir で向かってくる列車 (区間の中に入っている列車だけ)。
    区間の先の交換駅で待っている列車は、この駅の番線が空いていなければ区間へ入らない (singleTrackBlocked) ので数えない。
    数えると、終着の普通が自分の側の番線で折り返すことになり、後ろの快速を長く待たせた */
function singleTrackOpposerComing(g, stIdx, oppId, oppDir, self) {
    if (!singleUnitAt(oppId, stIdx - oppDir)) return null;
    const bs = g.trackMgr.blocks[oppId];
    if (!bs) return null;
    for (let k = 1; k <= UNITS_PER_STATION; k++) {
        const b = bs[stIdx - oppDir * k];
        if (!b || b.x === -1000 || !singleUnitAt(oppId, b.index)) break;
        for (const x of b.lanes) {
            if (!x || x === self || x.dir !== oppDir || x.state === "finished" || x.state === "in_depot") continue;
            const di = STATION_MAP[x.dest];
            if (di !== undefined && (di * UNITS_PER_STATION - stIdx) * oppDir < 0) continue;   // 手前で止まる
            return x;
        }
    }
    return null;
}

(function () {
    // a. 入区先: 単線の先の車両所より、折り返して後方の車両所へ
    const baseNear = OperationsManager.prototype.nearestDepotAhead;
    OperationsManager.prototype.nearestDepotAhead = function (train, hereName) {
        const r = baseNear.call(this, train, hereName);
        if (!r || !r.ahead || globalThis.__NO_SINGLE_GUARD || !train || !train.trackId) return r;
        if (!pathCrossesSingleTrack(train.trackId, hereName, r.name)) return r;
        if (!canReverseAtDir(hereName, train.dir)) return r;
        const back = baseNear.call(this, Object.assign(Object.create(train), { dir: -train.dir }), hereName);
        if (!back || !back.ahead || pathCrossesSingleTrack(train.trackId, hereName, back.name)) return r;
        return Object.assign({}, back, { dist: -back.dist, ahead: false });
    };

    // b. 反対側の番線への到着は、単線から向かってくる列車の番線を取らないときだけ
    const baseCross = Train.prototype.terminalCrossArrival;
    Train.prototype.terminalCrossArrival = function (nextBlock) {
        const r = baseCross.call(this, nextBlock);
        if (!r || globalThis.__NO_SINGLE_GUARD) return r;
        if (singleTrackOpposerComing(this.game, nextBlock.index, r.trackId, -this.dir, this)) return null;
        return r;
    };

    // c. 詰まりをほどく
    const baseUpd = OperationsManager.prototype.update;
    OperationsManager.prototype.update = function (ct) {
        baseUpd.call(this, ct);
        if (globalThis.__NO_SINGLE_GUARD || ct < (this.singleJamNext || 0)) return;
        this.singleJamNext = ct + 15;
        const g = this.game, tm = g.trackMgr;
        for (const o of g.trains) {
            if (o.state === "finished" || o.state === "in_depot" || o.state === "running" || !o.dir) continue;
            if (!(o.stuckTime >= 90) || !singleUnitAt(o.trackId, o.currBlockIndex)) continue;
            // o が次に入る駅 (単線の先の交換駅)
            const bs = tm.blocks[o.trackId];
            let sb = null;
            for (let k = 1; k <= UNITS_PER_STATION; k++) {
                const b = bs && bs[o.currBlockIndex + o.dir * k];
                if (!b || b.x === -1000) break;
                if (isRealStationBlock(b)) { sb = b; break; }
            }
            if (!sb || singleUnitAt(o.trackId, sb.index) || o.findFreeLane(sb) !== -1) continue;
            const stName = blockStationName(sb);
            // o の番線をふさいでいて、単線へ入ろうとしている (o と向かい合う) 列車
            const xs = sb.lanes.filter(x => x && x !== o && x.dir === -o.dir && x.state !== "running" &&
                x.state !== "turning_back" && !x.overnightStable && !x.workPermit && x.type !== "貨物" &&
                x.vehicles && x.vehicles.length);
            if (!xs.length) continue;
            xs.sort((a, b) => a.getPriority() - b.getPriority());
            for (const x of xs) {
                if (!canReverseAtDir(stName, x.dir)) continue;
                const oldNo = x.trainNo, oldDest = x.dest;
                if (!this.moveToOppositeTrack(x, stName, -x.dir)) continue;
                x.turnbackTrack = null;
                const back = this.nearestDepotAhead(x, stName);
                const target = back && back.ahead ? back.name : null;
                const rev = { type: "回送", dir: x.dir, startName: stName, dest: target, vehicles: x.vehicles };
                const asRev = !!target && this.asRevenue(rev);
                g.spawner.activeTrainNos.delete(x.trainNo);
                if (target) {
                    x.type = asRev ? "普通" : "回送";
                    x.trainNo = asRev ? rev.name : this.deadheadNo("M", x.dir);
                    x.dest = target;
                    x.nextAction = "depot";
                } else {
                    x.trainNo = this.deadheadNo("M", x.dir);
                    x.type = "回送";
                    x.dest = stName;
                    x.nextAction = "turnback";
                }
                x.dutyName = x.trainNo;
                g.spawner.activeTrainNos.add(x.trainNo);
                x.isFinalStop = false;
                x.startName = stName;
                x.state = "waiting_start";
                x.timer = 30;
                x.stuckTime = 0;
                x.hasStoppedAtCurrent = false;
                x.hasDeparted = false;
                DISPATCH_RULE_STATS.singleJam++;
                g.ui.updateBanner(`【運転整理】${stName}駅で単線区間から来る ${o.trainNo} の入る番線を ${oldNo} (${oldDest}行き) がふさいでいるため、` +
                    `${oldNo} は${stName}止まりとし、折り返して ${x.trainNo}(${x.type}) ${x.dest}行きとします。`, "banner-orange");
                if (g.records && g.records.noteDisposition) g.records.noteDisposition(x, stName, "単線区間の行き違い", `${stName}で折り返し`);
                break;
            }
        }
    };
})();