/* 尼崎の自動進路制御 (PRC) と運転整理。

   ■ なぜ要るか
     尼崎は JR神戸線 (内側線・外側線)・JR宝塚線・JR東西線が、上り側 5線 (9〜5番)・
     下り側 4線 (4〜1番) の着発線を共有する駅。どの線路からどの番線へ入れるかは
     配線で決まっている (js/03-stations.js の STATION_ROUTES["尼崎"])。
     例: JR宝塚線から来て上り内側線へ抜ける列車は 6番 しか使えない
         (到着 9/8/7/6 ∩ 発車 6/5)。JR神戸線から来て宝塚線へ入る外側線の列車は 2番 だけ。
     これまでの進路の選び方は「入れる番線のうち、種別の使い分けの順で最初に空いている番線」
     だったので、
       1. 神戸線の普通が 5番の埋まっているときに 6番へ入り、そのあと来た宝塚線の列車が
          入れる番線が無くなって、塚口〜尼崎の駅間で 10分止まる
       2. JR東西線から来て宝塚線へ入る快速が 2番をふさぎ、こうのとり (2番だけ) が 29分止まる
       3. 宝塚線の先が詰まっている列車が尼崎の番線に入って動けなくなり、ほかの線区の列車まで
          番線を失う
       4. 普通が快速・新快速を待つ時間の上限が 6〜10分で、遠くにいる (あるいは遅れている) 優等列車を
          待ち続け、その遅れが後続へ広がる
     ということが起きていた (tools/check_amagasaki.js で測った)。

   ■ どうするか (配線の決まり・番線の使い分けはそのまま。その中で選び方を賢くする)
     A. 番線の予測割り当て … 入れる番線が2つ以上空いているときは、尼崎へ近づいている
        ほかの列車 (2駅手前まで・3線区すべて) が「その番線しか使えない」度合いを見て、
        ほかの列車の邪魔にならない番線を選ぶ。同じなら今までどおりの使い分けの順。
     B. 手前の駅での抑止 (流入の調整) … 尼崎を出た先 (宝塚線・東西線・本線) が詰まっていて、
        尼崎に入っても出られない列車は、手前の駅 (立花・塚口・加島・塚本) のホームで待たせる。
        尼崎の番線をふさいでほかの線区の列車を止めないため。待つのは最長 4分 (朝夕 3分)。
     C. 優等列車の待ち合わせの上限 … 尼崎で普通が快速・新快速を待つのは、その列車が
        決まった時間 (朝夕 2分半・日中 3分半) の内に着くと見込めるときだけにする。
        遅れて止まっている優等列車は待たない。1本あたりの待ち合わせは最長 4分 (朝夕 3分)。
     D. 停車時分の短縮 … 朝夕の混雑時に 1分以上遅れている列車は、尼崎・塚口・立花・塚本・加島の
        停車時分を少し詰める (乗り降りの整理)。
     E. 番線の待ちが長いときの逃がし … 尼崎の手前の駅間で 3分以上番線を待っている列車は、
        A の割り当てでいちばん優先する (ほかの列車が先にその番線を取らないようにする)。

   globalThis.__NO_AMA_PRC = true で切れる (前後の比較のため)。
*/

const AMA_PRC = {
    station: "尼崎",
    tracks: ["Up_In", "Up_Out", "Down_In", "Down_Out", "Fukuchi_Up", "Fukuchi_Down", "Tozai_Up", "Tozai_Down"],
    // 手前の駅 (流入の調整をする駅)
    approachStations: ["立花", "塚口", "加島", "塚本"],
    // 普通が優等列車を待つときに、見込みの時間で待つかを決める駅
    yieldStations: ["尼崎", "大阪"],
    dwellStations: ["尼崎", "塚口", "立花", "塚本", "加島"],
    lookBlocks: UNITS_PER_STATION * 2,         // 2駅手前まで見る
    stats: { lanePick: 0, laneChanged: 0, meterHold: 0, yieldSkip: 0, dwellCut: 0 }
};

function amaPrcOn() { return !globalThis.__NO_AMA_PRC; }

function amaRushBand(game) {
    const h = (game.currentTime / 3600) % 24;
    return (h >= 7.0 && h < 9.5) || (h >= 17.0 && h < 19.5);
}

/** 尼崎を出ていく線路 (checkHold の「尼崎駅への直接進入判定」と同じ決まり) */
function amaOutTrack(t) {
    const tr = t.trackId;
    if (t.dir === 1 && tr === "Fukuchi_Up") {
        return TOZAI_THROUGH_DESTS.includes(t.dest) ? "Tozai_Up" : (t.type === "特急" ? "Up_Out" : "Up_In");
    }
    if (t.dir === 1 && tr.indexOf("Tozai") < 0 && TOZAI_THROUGH_DESTS.includes(t.dest)) return "Tozai_Up";
    if (t.dir === -1 && tr.indexOf("Fukuchi") < 0 && FUKUCHI_THROUGH_DESTS.includes(t.dest)) return "Fukuchi_Down";
    if (t.dir === -1 && tr === "Tozai_Down") return FUKUCHI_THROUGH_DESTS.includes(t.dest) ? "Fukuchi_Down" : "Down_In";
    return tr;
}

/** 尼崎の駅のブロックの番号 (線路ごと。無ければ -1) */
function amaIndexOn(game, trackId) {
    const c = game.__amaIdx || (game.__amaIdx = {});
    if (c[trackId] !== undefined) return c[trackId];
    const bs = game.trackMgr.blocks[trackId];
    const b = bs ? bs.find(x => x.x !== -1000 && x.stationIdx === STATION_MAP[AMA_PRC.station] && !x.hoppoStationName) : null;
    c[trackId] = b ? b.index : -1;
    return c[trackId];
}

/**
 * その列車が尼崎で使える番線 (findFreeLane の「進路の制限にしたがう」と同じ求め方。空きは見ない)。
 * 配線の決まり (到着 ∩ 発車) と種別の使い分けの順をそのまま使う。
 */
function amaCandidateLanes(t, toTrack) {
    const hour = (t.game.currentTime / 3600) % 24;
    const st = AMA_PRC.station;
    let pref = stationPreferredLanes(st, t.trackId, t.type, hour, "arrive");
    if (toTrack && toTrack !== t.trackId) {
        const out = stationRouteLanes(st, toTrack, "depart");
        if (out) {
            const both = (pref || out).filter(l => out.indexOf(l) >= 0);
            pref = both.length ? both : out;
        }
    }
    let lanes = (pref || []).slice();
    /* 通り抜ける列車は、出ていく線路へ出られる番線だけ (到着だけ見ると、上り内側線の列車が
       7番 (上り内側線へは出られない) を選べてしまう)。尼崎止まりは到着の決まりだけ。 */
    if ((!toTrack || toTrack === t.trackId) && t.dest !== st) {
        const dep = stationRouteLanes(st, t.trackId, "depart");
        if (dep) {
            const both = lanes.filter(l => dep.indexOf(l) >= 0);
            if (both.length) lanes = both;
        }
    }
    // 客扱いをする列車はホームのある番線だけ (js/13-train-hold.js の「ホームの無い線に旅客列車を停めない」)
    const bs = t.game.trackMgr.blocks[t.trackId];
    const blk = bs ? bs[amaIndexOn(t.game, t.trackId)] : null;
    const tid = (blk && blk.trackId) || t.trackId;
    let stops = false;
    try { stops = t.passengerStopsAt(st); } catch (e) { stops = false; }
    if (stops) lanes = lanes.filter(l => laneHasPlatform(st, tid, l));
    return lanes;
}

/** 尼崎へ近づいている列車 (自分以外・同じ向き・2駅手前まで)。{ t, k (ブロック数), lanes } */
function amaApproaching(game, dir, self) {
    const list = [];
    for (const tid of AMA_PRC.tracks) {
        if (trackDirOf(tid) !== dir) continue;
        const i0 = amaIndexOn(game, tid);
        if (i0 < 0) continue;
        const bs = game.trackMgr.blocks[tid];
        for (let k = 1; k <= AMA_PRC.lookBlocks; k++) {
            const b = bs[i0 - dir * k];
            if (!b || b.x === -1000) break;
            b.lanes.forEach(l => {
                if (!l || l === self || l.dir !== dir || l.trackId !== tid) return;
                if (l.state === "finished" || l.state === "in_depot") return;
                const outTrack = amaOutTrack(l);
                const lanes = amaCandidateLanes(l, outTrack !== l.trackId ? outTrack : null);
                if (lanes.length) list.push({ t: l, k: k, lanes: lanes, outTrack: outTrack });
            });
        }
    }
    return list;
}

/**
 * A. 番線の予測割り当て。findFreeLane が選んだ番線 (first) のほかにも入れる番線が空いていれば、
 *    近づいている列車の必要に合わせて選び直す。
 */
function amaPickLane(t, block, toTrack, first) {
    const cands = amaCandidateLanes(t, toTrack).filter(l => l < block.lanes.length && block.lanes[l] === null);
    if (!cands.length) return first;                  // 決まりどおりの番線が空いていなければ今までどおり
    if (cands.indexOf(first) < 0) first = cands[0];   // 出ていく線路へ出られない番線は選ばない
    if (cands.length === 1) return first;
    // 自分より先に番線を必要とする列車だけを見る (自分より遠い列車は後から来る)
    const g = t.game;
    const appr = amaApproaching(g, t.dir, t);
    if (!appr.length) return first;
    const free = new Set(block.lanes.map((x, i) => x === null ? i : -1).filter(i => i >= 0));
    const penalty = {};
    cands.forEach(l => { penalty[l] = 0; });
    for (const a of appr) {
        const opt = a.lanes.filter(l => free.has(l));
        if (!opt.length) continue;
        // 近い列車・その番線しか使えない列車・優等列車・長く待っている列車ほど重く見る
        let w = 1 / opt.length;
        w *= 1 / (1 + (a.k - 1) / UNITS_PER_STATION);
        if (["特急", "新快速"].indexOf(a.t.type) >= 0) w *= 1.6;
        if (a.t.stuckTime > 180) w *= 2.0;            // E. 長く番線を待っている列車を先に
        opt.forEach(l => { if (penalty[l] !== undefined) penalty[l] += w; });
    }
    let best = first, bestP = penalty[first];
    for (const l of cands) {                          // cands は使い分けの順。同点なら先のもの
        if (penalty[l] < bestP - 1e-9) { best = l; bestP = penalty[l]; }
    }
    AMA_PRC.stats.lanePick++;
    if (best !== first) AMA_PRC.stats.laneChanged++;
    return best;
}

/** 尼崎を出た先 (出ていく線路の前方 1駅) が詰まっていて、入っても出られないか */
function amaOutBlocked(t, outTrack) {
    const g = t.game;
    const i0 = amaIndexOn(g, outTrack);
    if (i0 < 0) return false;
    const bs = g.trackMgr.blocks[outTrack];
    for (let k = 1; k <= UNITS_PER_STATION; k++) {
        const b = bs[i0 + t.dir * k];
        if (!b || b.x === -1000) return false;
        const occ = b.lanes.filter(l => l && l.dir === t.dir);
        if (!occ.length) continue;
        // 駅のブロックで空きがあれば入れる
        if ((b.isStation || b.hoppoStationName) && b.lanes.some(l => l === null)) continue;
        if (occ.some(l => l.stuckTime >= 45 || l.state === "holding")) return true;
    }
    return false;
}

/**
 * B. 手前の駅での抑止。尼崎の1つ手前の駅のホームに居て、尼崎の先が詰まっていて出られず、
 *    しかも尼崎で自分の使う番線をほかの近づいている列車も必要としているときは、ここで待つ。
 *    true なら抑止する。
 */
function amaMeterHold(t) {
    if (!amaPrcOn()) return false;
    if (AMA_PRC.tracks.indexOf(t.trackId) < 0 || t.turnbackTrack) return false;
    if (["貨物", "回送"].indexOf(t.type) >= 0 && t.dest === AMA_PRC.station) return false;
    const g = t.game;
    const i0 = amaIndexOn(g, t.trackId);
    if (i0 < 0) return false;
    if ((i0 - t.currBlockIndex) * t.dir !== UNITS_PER_STATION) return false;   // ちょうど1駅手前
    const bs = g.trackMgr.blocks[t.trackId];
    const here = bs[t.currBlockIndex];
    if (!here || !isRealStationBlock(here)) return false;
    if (AMA_PRC.approachStations.indexOf(blockStationName(here)) < 0) return false;
    if (t.dest === AMA_PRC.station) return false;                 // 尼崎止まりは出る先を見ない
    const cap = amaRushBand(g) ? 180 : 240;
    if (t.stuckTime >= cap) return false;                         // 待ちすぎない (詰まりを作らない)
    const outTrack = amaOutTrack(t);
    if (!amaOutBlocked(t, outTrack)) return false;
    // 自分が尼崎で使う番線を、ほかに近づいている列車 (反対側の線区から来る列車を含む) が必要としているか
    const mine = amaCandidateLanes(t, outTrack !== t.trackId ? outTrack : null);
    const others = amaApproaching(g, t.dir, t).filter(a => a.t.trackId !== t.trackId || a.k < UNITS_PER_STATION);
    const amaBlk = bs[i0];
    const freeMine = mine.filter(l => amaBlk.lanes[l] === null);
    // 自分より先に番線を必要とする列車 (尼崎に近い・自分より長く待っている) と取り合うか
    const contested = others.some(a => (a.k < UNITS_PER_STATION || a.t.stuckTime > t.stuckTime) &&
                                       a.lanes.some(l => freeMine.indexOf(l) >= 0));
    if (!contested && freeMine.length > 1) return false;
    AMA_PRC.stats.meterHold++;
    return true;
}

/**
 * C. 尼崎で、後ろから来る優等列車 l を待ってよいか (false なら待たずに発車する)。
 *    k … l が何ブロック後ろにいるか
 */
function amaYieldOk(t, l, k) {
    if (!amaPrcOn()) return true;
    const g = t.game;
    const here = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
    if (!here || AMA_PRC.yieldStations.indexOf(blockStationName(here)) < 0) return true;
    const rush = amaRushBand(g);
    const cap = rush ? 180 : 240;
    if (t.stuckTime >= cap) { AMA_PRC.stats.yieldSkip++; return false; }
    if (l.stuckTime > 45 || l.minorTrouble || l.isManuallySuspended) { AMA_PRC.stats.yieldSkip++; return false; }
    // 見込みの到着 (残りのブロック × 1閉塞の時間 ＋ いま止まっていればその残り)
    const run = BLOCK_RUN_SEC[l.type] || 40;
    let eta = Math.max(0, k - 1) * run + Math.max(0, l.timer || 0);
    if (l.state === "stopped" || l.state === "holding") eta += 15;
    const budget = rush ? 150 : 210;
    if (eta > budget) { AMA_PRC.stats.yieldSkip++; return false; }
    return true;
}

/** D. 朝夕の混雑時、遅れている列車の停車時分を詰める */
function amaDwellAdjust(t, stName, sec) {
    if (!amaPrcOn()) return sec;
    if (AMA_PRC.dwellStations.indexOf(stName) < 0) return sec;
    if (!amaRushBand(t.game) || (t.delayTime || 0) < 60) return sec;
    if (["普通", "快速", "新快速"].indexOf(t.type) < 0) return sec;
    const cut = Math.min(20, Math.round(sec * 0.25));
    AMA_PRC.stats.dwellCut++;
    return Math.max(45, sec - cut);
}

/* ---------------------------------------------------------------- 組み込み */
(function () {
    const baseFind = Train.prototype.findFreeLane;
    Train.prototype.findFreeLane = function (block, toTrack) {
        const r = baseFind.call(this, block, toTrack);
        if (r < 0 || !amaPrcOn() || !block || block.hoppoStationName || block.freightTerminal) return r;
        if (block.stationIdx !== STATION_MAP[AMA_PRC.station] || !block.isStation) return r;
        if (AMA_PRC.tracks.indexOf(this.trackId) < 0) return r;
        return amaPickLane(this, block, toTrack, r);
    };
    /* 尼崎を始発にする列車 (折り返し・出区・始発) の番線も、近づいている列車の邪魔に
       ならない番線を選ぶ (始発の番線は pickRouteLane で選ぶので、そちらにも入れる)。 */
    if (typeof pickRouteLane === "function") {
        const basePick = pickRouteLane;
        pickRouteLane = function (block, stName, trackId, mode, type, hour, outer) {
            const r = basePick(block, stName, trackId, mode, type, hour, outer);
            if (r < 0 || !amaPrcOn() || stName !== AMA_PRC.station || mode !== "depart" || outer) return r;
            if (typeof game === "undefined" || !game || !game.trackMgr) return r;
            const dir = trackDirOf(trackId);
            if (!dir) return r;
            const pref = stationPreferredLanes(stName, trackId, type, hour, mode) || [];
            const cands = pref.filter(l => l < block.lanes.length && block.lanes[l] === null &&
                                           (PASSENGER_TYPES.indexOf(type) < 0 || laneHasPlatform(stName, trackId, l)));
            if (cands.length <= 1 || cands.indexOf(r) < 0) return r;
            const appr = amaApproaching(game, dir, null);
            const pen = {};
            cands.forEach(l => { pen[l] = 0; });
            appr.forEach(a => {
                const opt = a.lanes.filter(l => block.lanes[l] === null);
                if (!opt.length) return;
                const w = (1 / opt.length) / (1 + (a.k - 1) / UNITS_PER_STATION) * (a.t.stuckTime > 180 ? 2 : 1);
                opt.forEach(l => { if (pen[l] !== undefined) pen[l] += w; });
            });
            let best = r;
            cands.forEach(l => { if (pen[l] < pen[best] - 1e-9) best = l; });
            if (best !== r) AMA_PRC.stats.laneChanged++;
            return best;
        };
    }
    const baseHold = Train.prototype.checkHold;
    Train.prototype.checkHold = function (isStarting) {
        if (baseHold.call(this, isStarting)) return true;
        if (isStarting && this.hasDeparted && !this.forceStart && amaMeterHold(this)) return true;
        return false;
    };
})();
