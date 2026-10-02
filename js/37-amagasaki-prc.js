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
    // 停車駅がほとんど同じなら待たない (js/38c-dispatch-rules.js。利用者の指摘 ③)
    if (typeof stopPatternSimilar === "function" && stopPatternSimilar(t, l)) { AMA_PRC.stats.yieldSkip++; return false; }
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
    // ★朝夕だけでなく終日 (利用者の指摘 ②)。朝夕以外は詰め方を小さくする
    if ((t.delayTime || 0) < 60) return sec;
    if (["普通", "快速", "新快速"].indexOf(t.type) < 0) return sec;
    const cut = amaRushBand(t.game) ? Math.min(20, Math.round(sec * 0.25)) : Math.min(12, Math.round(sec * 0.15));
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

/* ================================================================ 尼崎 PRC の作戦 (見積もりで選ぶ運転整理)

   ■ なぜ要るか
     上の A〜E は「番線の選び方」と「待つ上限」を賢くしただけで、待避する駅・発車の順番は
     これまでの決まり (後ろに優等列車がいれば尼崎で待つ) のままだった。尼崎は宝塚線・神戸線・東西線の
     列車が同じ番線を取り合うので、普通が尼崎で快速を待つと、そのあいだ宝塚線の列車が番線を失って
     塚口〜尼崎で止まる、ということが朝夕に起きていた。
   ■ どうするか (毎Tick、尼崎の上下それぞれの状況を見て、作戦ごとに「遅れ × 重み」の合計を見積もり、
     いちばん小さいものを選ぶ。js/27-operations.js の待避の先読みの決定 (ovPlans) を上書きする)
     F. 待避駅の繰り延べ … 尼崎で優等列車 H を待つ普通 L について
          (a) 尼崎で待つ: L の待ち × L の重み ＋ そのあいだ番線を失うほかの列車の待ち × 重み
          (b) 先に出して、次の待避駅 (上り 大阪・新大阪 / 下り 芦屋) で待つ:
              L の待ち ＋ H が L の後ろを走ることになる遅れ × H の重み
        を比べ、(b) が安ければ L を先に出し、その駅で H を待たせる (待つ駅は覚えておき、着いたら抑止する)。
        宝塚線が詰まっている (尼崎の番線の需要が多い) ほど (a) が高くなり、繰り延べが選ばれる。
     G. 手前の駅での順序の調整 … 尼崎の1つ手前の駅 (塚口・立花・加島・塚本) で発車する列車 T について、
          ・尼崎で T の入れる番線が全部ふさがっていて、すぐには空かない → ホームで待つ (駅間で止めない)
          ・ほかの線区から尼崎へ同じ線路へ出る、重みの大きい列車 H がほぼ同時に着く
            → T が先に行くと H が T の後ろを走ることになるので、遅れ × 重みが小さくなるなら T をホームで待たせる
            (例: 宝塚線の普通を塚口で待たせ、神戸線の快速を先に尼崎から大阪へ通す)
     H. 交互の発車 … 尼崎で違う線区から来た2本が同じ線路へ同時に出ようとするとき、
        重み・遅れ・待ち時間に「前に出たのと別の線区」の加点を足して順番を決める (同じ線区ばかり続けない)。
     重み … 特急 3.0・新快速 2.4・快速 1.6・普通 1.0。行先が近い (残り 4駅以下) 列車は軽くする
            (短い区間の列車は少し遅らせても影響が小さい)。遅れている列車は少し重くする。
     どの作戦も待たせるのは最長 2〜5分 で、待たせる相手が止まっている (トラブル・長い抑止) ときは待たせない。
   globalThis.__NO_AMA_STRAT = true でこの節だけ切れる。
*/
const AMA_STRAT = {
    look: UNITS_PER_STATION * 6,                       // 尼崎の 6駅手前まで見る (13回目に 3駅 → 6駅)
    refuges: { "1": ["大阪", "新大阪"], "-1": ["芦屋"] },
    defers: new Map(),                                 // L.id → { st, hId, hNo, until }
    srcOf: new Map(),                                  // 尼崎にいる列車 → 来た線路
    lastSrc: {},                                       // 出ていく線路 → 最後に出た列車の来た線路
    banner: 0,
    stats: { deferGo: 0, deferYield: 0, preHoldFull: 0, preHoldPri: 0, alternate: 0 }
};

function amaStratOn() { return amaPrcOn() && !globalThis.__NO_AMA_STRAT; }

const AMA_TYPE_W = { "特急": 3.0, "新快速": 2.4, "快速": 1.6, "普通": 1.0, "臨時": 1.2, "回送": 0.4, "貨物": 0.8 };

/** 行先までの残りの駅の数 (自分の線路と、尼崎から出ていく線路を辿る。見つからなければ 15) */
function amaRemainStations(t) {
    const c = t.__amaRem;
    if (c && c.at === t.currBlockIndex && c.tr === t.trackId) return c.n;
    const g = t.game;
    let n = 15, cnt = 0;
    const walk = (tid, from) => {
        const bs = g.trackMgr.blocks[tid];
        if (!bs) return false;
        for (let j = 1; j <= UNITS_PER_STATION * 15; j++) {
            const b = bs[from + t.dir * j];
            if (!b || b.x === -1000) return false;
            if (!isRealStationBlock(b)) continue;
            cnt++;
            if (blockStationName(b) === t.dest) { n = cnt; return true; }
            if (blockStationName(b) === AMA_PRC.station && tid !== amaOutTrack(t)) return false;
        }
        return false;
    };
    if (!walk(t.trackId, t.currBlockIndex)) {
        const out = amaOutTrack(t);
        const i0 = amaIndexOn(g, out);
        if (out !== t.trackId && i0 >= 0) walk(out, i0);
    }
    t.__amaRem = { at: t.currBlockIndex, tr: t.trackId, n: n };
    return n;
}

/** 列車の重み (遅らせたときの損の大きさ) */
function amaWeight(t) {
    let w = AMA_TYPE_W[t.type] || 1.0;
    const rem = amaRemainStations(t);
    if (rem <= 4) w *= 0.55 + 0.1 * rem;               // 短い区間の列車は融通が利く
    if ((t.delayTime || 0) > 120) w *= 1 + Math.min(0.4, (t.delayTime - 120) / 900);
    /* ★線区全体の遅れで見る (13回目)。後ろ3駅の内に続く列車がいれば、この列車を遅らせると
       その列車たちも遅れるので重くする */
    w *= 1 + 0.25 * Math.min(3, amaFollowers(t));
    return w;
}
/** 同じ線路を後ろ3駅の内で続いている列車の数 (Tick ごとに覚える) */
function amaFollowers(t) {
    const g = t.game;
    const c = t.__amaFol;
    if (c && c.at === g.currentTime) return c.n;
    const bs = g.trackMgr.blocks[t.trackId];
    let n = 0;
    if (bs) {
        for (let k = 1; k <= UNITS_PER_STATION * 3; k++) {
            const b = bs[t.currBlockIndex - t.dir * k];
            if (!b || b.x === -1000) break;
            n += b.lanes.filter(l => l && l !== t && l.dir === t.dir && l.state !== "finished").length;
        }
    }
    t.__amaFol = { at: g.currentTime, n: n };
    return n;
}

function amaWaitNow(t) {
    return Math.max(0, t.timer || 0) + (t.state === "holding" ? 5 : 0);
}
function amaDwell(t, b) {
    if (!isRealStationBlock(b)) return 0;
    let stops = false;
    try { stops = t.passengerStopsAt(blockStationName(b)); } catch (e) { stops = false; }
    return stops ? ((STATIONS[b.stationIdx] && STATIONS[b.stationIdx].stopTime) || 45) : 0;
}
/** 線路 tid の from の次のブロックから to までの所要 (秒。to での停車は含めない) */
function amaRunTime(g, t, tid, from, to) {
    const bs = g.trackMgr.blocks[tid];
    if (!bs) return Infinity;
    const run = BLOCK_RUN_SEC[t.type] || 48;
    let s = 0;
    for (let i = from + t.dir; (to - i) * t.dir >= 0; i += t.dir) {
        const b = bs[i];
        if (!b || b.x === -1000) return Infinity;
        s += run;
        if (i !== to) s += amaDwell(t, b);
    }
    return s;
}
/** 尼崎に着くまでの見込み (秒)。もう尼崎にいれば 0 */
function amaEtaToAma(t) {
    const i0 = amaIndexOn(t.game, t.trackId);
    if (i0 < 0) return Infinity;
    const d = (i0 - t.currBlockIndex) * t.dir;
    if (d < 0) return Infinity;
    if (d === 0) return 0;
    let s = amaWaitNow(t) + amaRunTime(t.game, t, t.trackId, t.currBlockIndex, i0);
    if (t.stuckTime > 30) s += Math.min(120, t.stuckTime);   // 止まっている列車は遅れて着く
    return s;
}

/** 尼崎へ近づいている列車 (3駅手前まで。近い順)。{ t, k, eta, lanes, out, w } */
function amaDemand(g, dir) {
    const list = [];
    for (const tid of AMA_PRC.tracks) {
        if (trackDirOf(tid) !== dir) continue;
        const i0 = amaIndexOn(g, tid);
        if (i0 < 0) continue;
        const bs = g.trackMgr.blocks[tid];
        for (let k = 1; k <= AMA_STRAT.look; k++) {
            const b = bs[i0 - dir * k];
            if (!b || b.x === -1000) break;
            for (const l of b.lanes) {
                if (!l || l.dir !== dir || l.trackId !== tid || l.state === "finished" || l.state === "in_depot") continue;
                const out = amaOutTrack(l);
                list.push({ t: l, k: k, eta: amaEtaToAma(l), out: out, w: amaWeight(l),
                            lanes: amaCandidateLanes(l, out !== l.trackId ? out : null) });
            }
        }
    }
    return list.sort((a, b) => a.eta - b.eta);
}

function amaReady(t) {
    return ["stopped", "holding", "waiting_start"].indexOf(t.state) >= 0 && !t.isManuallySuspended &&
           !t.minorTrouble && !t.commIncident;
}
function amaHealthy(t) {
    return !!t && t.state !== "finished" && t.state !== "in_depot" && !t.minorTrouble &&
           !t.isManuallySuspended && t.stuckTime < 120;
}

/** 尼崎の番線 lane を w 秒ふさいだとき、ほかの列車が番線を失って待つ損 (遅れ × 重み) */
function amaLaneBlockCost(amaBlk, lane, w, demand, except) {
    let cost = 0;
    const taken = new Set();
    for (const a of demand) {
        if (a.t === except || a.eta >= w || !a.lanes.length) continue;
        const free = a.lanes.filter(l => l !== lane && amaBlk.lanes[l] === null && !taken.has(l));
        if (free.length) { taken.add(free[0]); continue; }
        if (a.lanes.indexOf(lane) < 0) continue;
        cost += (w - a.eta) * a.w;
    }
    return cost;
}

/**
 * F. 待避駅の繰り延べの見積もり。L は尼崎で発車を待つ普通・快速、H は後ろから来る優等列車。
 *    繰り延べが得なら { refuge } を返す。
 */
function amaDeferDecision(g, L, H, out, demand) {
    const dir = L.dir;
    const iL = amaIndexOn(g, out);
    const bs = g.trackMgr.blocks[out];
    if (iL < 0 || !bs) return null;
    const nb = bs[iL + dir];
    if (!nb || nb.x === -1000 || nb.lanes.some(x => x && x.dir === dir)) return null;   // すぐには出られない
    // 次の待避駅
    let R = null;
    for (let j = 1; j <= UNITS_PER_STATION * 8; j++) {
        const b = bs[iL + dir * j];
        if (!b || b.x === -1000) return null;
        if (!isRealStationBlock(b)) continue;
        const nm = blockStationName(b);
        if (nm === L.dest) return null;                               // 先で降りる。ふつうの先読みに任せる
        if (AMA_STRAT.refuges[String(dir)].indexOf(nm) >= 0) { R = b; break; }
    }
    if (!R || R.lanes.length < 2) return null;
    const rn = blockStationName(R);
    const freeR = R.lanes.map((x, i) => x === null ? i : -1).filter(i => i >= 0);
    if (freeR.length < 2 || !freeR.some(i => laneHasPlatform(rn, out, i))) return null;
    const runH = BLOCK_RUN_SEC[H.t.type] || 34;
    const amaBlk = g.trackMgr.blocks[L.trackId][L.currBlockIndex];
    const dwellHAma = amaDwell(H.t, amaBlk);
    const tHatR = H.eta + dwellHAma + amaRunTime(g, H.t, out, iL, R.index);       // 邪魔が無いとき
    // (a) 尼崎で待つ
    const waitY = Math.max(0, H.eta + dwellHAma + 30 - amaWaitNow(L));
    const costA = waitY * amaWeight(L) + amaLaneBlockCost(amaBlk, L.lane, waitY, demand, H.t);
    // (b) 先に出て R で待つ
    const tL = amaWaitNow(L) + amaRunTime(g, L, out, iL, R.index);
    const hDelay = Math.max(0, tL + runH - tHatR);                                 // H が L の後ろを走る遅れ
    const waitR = Math.max(0, tHatR + hDelay + amaDwell(H.t, R) + 30 - tL);
    const costB = waitR * amaWeight(L) + hDelay * H.w * 1.3 + 0.15 * waitR;
    const cap = amaRushBand(g) ? 60 : 90;
    if (hDelay > cap || costB + 20 >= costA) return null;
    return { refuge: rn, costA: costA, costB: costB, hDelay: hDelay };
}

function amaStratNote(g, msg) {
    const ct = g.currentTime;
    if (ct < AMA_STRAT.banner || !g.ui || !g.ui.updateBanner) return;
    AMA_STRAT.banner = ct + 600;
    try { g.ui.updateBanner("【尼崎PRC】" + msg, "banner-orange"); } catch (e) { /* 表示が無いとき */ }
}

const amaSrc = (t) => AMA_STRAT.srcOf.get(t.id) || t.trackId;

/** 毎Tick。待避の先読みの決定 (ops.ovPlans) を、尼崎の作戦で上書きする */
function amaCoordinate(ops, ct) {
    const g = ops.game;
    if (!ops.ovPlans) ops.ovPlans = new Map();
    const plans = ops.ovPlans;
    const setP = (t, act, st, by, life) => plans.set(t.id, { act: act, st: st, by: by, force: true, until: ct + (life || 45), prc: true });
    const byId = new Map();
    g.trains.forEach(t => byId.set(t.id, t));
    const amaIdxSt = STATION_MAP[AMA_PRC.station];

    // 尼崎にいる列車と、出ていった列車 (H の交互の発車のため、来た線路を覚える)
    const atAma = [];
    const seen = new Set();
    for (const t of g.trains) {
        if (t.state === "finished" || t.state === "in_depot" || AMA_PRC.tracks.indexOf(t.trackId) < 0) continue;
        const b = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
        if (b && b.stationIdx === amaIdxSt && b.isStation && !b.hoppoStationName) {
            atAma.push(t); seen.add(t.id);
            if (!AMA_STRAT.srcOf.has(t.id)) AMA_STRAT.srcOf.set(t.id, t.trackId);
        }
    }
    for (const [id, src] of AMA_STRAT.srcOf) {
        if (seen.has(id)) continue;
        const t = byId.get(id);
        if (t && t.state !== "finished") AMA_STRAT.lastSrc[t.trackId] = src;
        AMA_STRAT.srcOf.delete(id);
    }

    for (const dir of [1, -1]) {
        const demand = amaDemand(g, dir);
        const here = atAma.filter(t => t.dir === dir);
        // F. 待避駅の繰り延べ
        for (const L of here) {
            if (["普通", "快速"].indexOf(L.type) < 0 || L.dest === AMA_PRC.station || L.turnbackTrack) continue;
            if (!amaReady(L) || AMA_STRAT.defers.has(L.id)) continue;
            const out = amaOutTrack(L);
            const pL = L.getPriority();
            const H = demand.find(a => a.out === out && a.t.getPriority() > pL && amaHealthy(a.t) && a.eta < 420 &&
                                       !(typeof stopPatternSimilar === "function" && stopPatternSimilar(L, a.t)));
            if (!H) continue;
            const d = amaDeferDecision(g, L, H, out, demand);
            if (!d) continue;
            setP(L, "go", AMA_PRC.station, H.t.trainNo);
            AMA_STRAT.defers.set(L.id, { st: d.refuge, hId: H.t.id, hNo: H.t.trainNo, until: ct + 900 });
            AMA_STRAT.stats.deferGo++;
            amaStratNote(g, `${L.trainNo}は尼崎で${H.t.trainNo}を待たずに先に出し、${d.refuge}で待ち合わせます (尼崎の番線を空ける)。`);
        }
        // H. 交互の発車 (違う線区から来て、同じ線路へ同時に出る2本)
        const ready = here.filter(t => amaReady(t) && (t.timer || 0) <= 10 && t.hasDeparted !== false);
        const groups = {};
        ready.forEach(t => { const o = amaOutTrack(t); (groups[o] = groups[o] || []).push(t); });
        for (const o in groups) {
            const gs = groups[o];
            if (gs.length < 2 || new Set(gs.map(amaSrc)).size < 2) continue;
            const score = (t) => amaWeight(t) * (1 + (t.delayTime || 0) / 600) + t.stuckTime / 120 +
                                 (amaSrc(t) !== AMA_STRAT.lastSrc[o] ? 0.35 : 0);
            gs.sort((a, b) => score(b) - score(a));
            const win = gs[0];
            if (win.stuckTime >= 45) continue;                        // 勝った方が動けないなら譲らせない
            for (const t of gs.slice(1)) {
                const p = plans.get(t.id);
                if (amaSrc(t) === amaSrc(win) || t.stuckTime >= 90 || (p && p.prc && p.act === "go")) continue;
                setP(t, "yield", AMA_PRC.station, win.trainNo, 20);
                AMA_STRAT.stats.alternate++;
            }
        }
    }

    // F の続き: 繰り延べた待避を、その駅で実行する
    for (const [id, d] of AMA_STRAT.defers) {
        const L = byId.get(id), H = byId.get(d.hId);
        if (!L || ct > d.until || L.state === "finished" || !amaHealthy(H)) { AMA_STRAT.defers.delete(id); continue; }
        // H が L を抜いた (同じ線路で L より前) → おしまい
        if (H.trackId === L.trackId && (H.currBlockIndex - L.currBlockIndex) * L.dir > 0) { AMA_STRAT.defers.delete(id); continue; }
        const bs = g.trackMgr.blocks[L.trackId] || [];
        const b = bs[L.currBlockIndex];
        const stHere = b && isRealStationBlock(b) ? blockStationName(b) : null;
        if (stHere !== d.st) {
            // 待避の駅を通り過ぎた → おしまい
            const R = bs.find(x => x.x !== -1000 && isRealStationBlock(x) && blockStationName(x) === d.st);
            if (!R || (L.currBlockIndex - R.index) * L.dir > 0) AMA_STRAT.defers.delete(id);
            continue;
        }
        if (!amaReady(L) || L.stuckTime >= 300) continue;
        // H が入る番線が残っているときだけ待つ (互いに待ち合わない)
        const hereSame = H.trackId === L.trackId && H.currBlockIndex === L.currBlockIndex;
        if (!hereSame && !b.lanes.some(x => x === null)) continue;
        setP(L, "yield", d.st, d.hNo);
        AMA_STRAT.stats.deferYield++;
    }
}

/**
 * G. 手前の駅での順序の調整 (checkHold の発車のとき)。true ならホームで待つ。
 */
function amaPreHold(t) {
    if (!amaStratOn()) return false;
    if (AMA_PRC.tracks.indexOf(t.trackId) < 0 || t.turnbackTrack || t.type === "貨物") return false;
    const g = t.game;
    const i0 = amaIndexOn(g, t.trackId);
    if (i0 < 0 || (i0 - t.currBlockIndex) * t.dir !== UNITS_PER_STATION) return false;
    const bs = g.trackMgr.blocks[t.trackId];
    const here = bs[t.currBlockIndex];
    if (!here || !isRealStationBlock(here) || AMA_PRC.approachStations.indexOf(blockStationName(here)) < 0) return false;
    if (t.stuckTime >= (amaRushBand(g) ? 120 : 150)) return false;   // 待たせすぎない
    const amaBlk = bs[i0];
    const out = amaOutTrack(t);
    const mine = amaCandidateLanes(t, out !== t.trackId ? out : null);
    if (!mine.length) return false;
    const runT = amaRunTime(g, t, t.trackId, t.currBlockIndex, i0);
    // 1. 入れる番線が全部ふさがっていて、着くまでに空きそうにない → ホームで待つ
    const free = mine.filter(l => amaBlk.lanes[l] === null);
    if (!free.length) {
        const soon = mine.some(l => {
            const o = amaBlk.lanes[l];
            return !o || o.state === "running" || (amaReady(o) && (o.timer || 0) + 20 < runT && o.stuckTime < 30);
        });
        if (soon) return false;
        AMA_STRAT.stats.preHoldFull++;
        t._holdWhy = "尼崎PRC: 番線待ち (手前の駅で待つ)";
        return true;
    }
    // 2. 重みの大きい列車 H が別の線区からほぼ同時に着き、同じ線路へ出る (または最後の番線を取り合う)
    const etaT = amaWaitNow(t) + runT;
    const wT = amaWeight(t);
    const freeAll = (a) => a.lanes.filter(l => amaBlk.lanes[l] === null);
    for (const a of amaDemand(g, t.dir)) {
        if (a.eta > etaT + 75) break;
        if (a.t === t || a.t.trackId === t.trackId || !amaHealthy(a.t) || a.t.stuckTime > 20) continue;
        const merge = a.out === out && t.dest !== AMA_PRC.station;
        const laneFight = free.length === 1 && freeAll(a).length === 1 && freeAll(a)[0] === free[0];
        if (!merge && !laneFight) continue;
        if (a.w < wT * 1.25) continue;
        // T が先に行くときの H の遅れ と、T が待つときの T の遅れ
        const dwT = amaDwell(t, amaBlk), dwH = amaDwell(a.t, amaBlk);
        const hDelay = Math.max(0, etaT + dwT + 40 - (a.eta + dwH)) + (merge ? 30 : 0);
        const tWait = Math.max(0, a.eta + dwH + 40 - etaT);
        if (a.w * hDelay > wT * tWait + 15) {
            AMA_STRAT.stats.preHoldPri++;
            t._holdWhy = `尼崎PRC: ${a.t.trainNo}を先に通す`;
            return true;
        }
    }
    return false;
}

(function () {
    if (typeof OperationsManager === "function" && OperationsManager.prototype.planOvertakes) {
        const basePlan = OperationsManager.prototype.planOvertakes;
        OperationsManager.prototype.planOvertakes = function (ct) {
            basePlan.call(this, ct);
            if (!amaStratOn() || ct < (this.__amaNext || 0)) return;
            this.__amaNext = ct + CONFIG.TICK_SEC;
            amaCoordinate(this, ct);
        };
    }
    const baseHold = Train.prototype.checkHold;
    Train.prototype.checkHold = function (isStarting) {
        if (baseHold.call(this, isStarting)) return true;
        if (isStarting && this.hasDeparted && !this.forceStart && amaPreHold(this)) return true;
        return false;
    };
})();

/* ================================================================ 尼崎 PRC の強化 (2026-10 の13回目。利用者の指摘 ②)

   ■ 何を足したか
     ・終日動かす … 朝夕だけに絞っていた停車時分の短縮 (D) も終日にした (朝夕以外は詰め方を小さく)。
       作戦 (F・G・H) と下の I・J はもともと時間帯を問わない。
     ・広く見る … 尼崎へ近づく列車を 3駅 → 6駅手前まで見る。列車の重みに「後ろに続く列車の数」を掛け、
       1本を遅らせたときに後ろの列車まで遅れる損 (線区全体の遅れ) を数える (amaWeight)。
     ・I. 番線の予約 (予測の割り当て) … 尼崎の上り側・下り側の着発線ごとに「いつ空くか」を見積もり
       (いまの列車の残りの停車・出られない列車・尼崎止まりの折り返し)、近づく列車に着く見込みの順で番線を割り当てる。
       重い列車は 1分ほど先に着く軽い列車より先に割り当てる (ふだんの優先の順と違うことがある)。
       割り当ての結果、尼崎の手前 (塚口〜尼崎・立花〜尼崎 などの駅間) で 25秒より長く待つと見込まれる列車は、
       いまいる駅 (尼崎の 5駅手前まで。宝塚線なら川西池田・北伊丹・伊丹・猪名寺・塚口) のホームで待たせる。
       待たせるのは最長 2分半 (朝夕) / 3分半。後ろの列車がその駅に入れなくなるときは待たせない。
     ・J. 先の駅がふさがっているときの発車の見合わせ … 尼崎と、その前後の駅 (塚口・立花・加島・塚本 など) で、
       次の駅に入れる番線が無く、そこの列車もすぐには出ないなら、ホームで待つ (駅間で止めない)。
       尼崎では、自分の番線を近づく列車がすぐ使うときは待たずに出る (番線を空ける)。
   globalThis.__NO_AMA_SLOT = true で I・J を切れる。 */
const AMA_SLOT = { maxUp: 5, waitMin: 25,
                   exitStations: ["尼崎", "塚口", "猪名寺", "伊丹", "立花", "甲子園口", "加島", "御幣島", "塚本"],
                   stats: { slotHold: 0, exitHold: 0 } };

/** 尼崎の番線に今いる列車が、その番線を空けるまでの見込み (秒) */
function amaLaneRelease(o, amaBlk) {
    if (!o) return 0;
    if (o.minorTrouble || o.isManuallySuspended || o.commIncident) return 1e6;
    if (o.state === "running") return 20;
    let r = Math.max(0, o.timer || 0) + (o.state === "holding" ? 20 : 0);
    if (o.dest === AMA_PRC.station) r += 180;                        // 尼崎止まり (折り返し・入区)
    else if (amaOutBlocked(o, amaOutTrack(o))) r += 90;                // 先が詰まっていて出られない
    return r;
}

/** I. 番線の割り当ての見込み。列車 → { wait (尼崎の手前で待つ見込み [秒]), lane, eta } */
function amaSlotPlan(g, dir) {
    g.__amaSlot = g.__amaSlot || {};
    const c = g.__amaSlot[dir];
    if (c && c.at === g.currentTime) return c.plan;
    const plan = new Map();
    const tid0 = dir === 1 ? "Up_In" : "Down_In";
    const i0 = amaIndexOn(g, tid0);
    const amaBlk = i0 >= 0 ? g.trackMgr.blocks[tid0][i0] : null;
    if (amaBlk) {
        const rel = amaBlk.lanes.map(o => amaLaneRelease(o, amaBlk));
        const dem = amaDemand(g, dir).filter(a => a.lanes.length && amaHealthy(a.t));
        // 着く見込みの順。重い列車は少し前に繰り上げる (最大 1分)
        const key = (a) => a.eta - Math.min(60, 25 * Math.max(0, a.w - 1));
        dem.sort((a, b) => key(a) - key(b));
        for (const a of dem) {
            let best = -1, bt = Infinity;
            for (const l of a.lanes) {
                if (l >= rel.length) continue;
                const t0 = Math.max(a.eta, rel[l]);
                if (t0 < bt) { bt = t0; best = l; }
            }
            if (best < 0) continue;
            plan.set(a.t.id, { wait: bt - a.eta, lane: best, eta: a.eta });
            rel[best] = bt + amaDwell(a.t, amaBlk) + 25 + (a.t.dest === AMA_PRC.station ? 180 : 0);
        }
    }
    g.__amaSlot[dir] = { at: g.currentTime, plan: plan };
    return plan;
}

/** I. 尼崎の手前の駅間で待つと見込まれる列車を、いまの駅で待たせるか */
function amaSlotHold(t) {
    if (!amaStratOn() || globalThis.__NO_AMA_SLOT) return false;
    if (AMA_PRC.tracks.indexOf(t.trackId) < 0 || t.turnbackTrack || t.type === "貨物") return false;
    if (["stopped", "holding"].indexOf(t.state) < 0 || !t.hasDeparted) return false;
    const g = t.game;
    const i0 = amaIndexOn(g, t.trackId);
    if (i0 < 0) return false;
    const d = (i0 - t.currBlockIndex) * t.dir;
    if (d <= 0 || d > UNITS_PER_STATION * AMA_SLOT.maxUp) return false;
    const bs = g.trackMgr.blocks[t.trackId];
    const here = bs[t.currBlockIndex];
    if (!here || !isRealStationBlock(here)) return false;
    if (t.stuckTime >= (amaRushBand(g) ? 150 : 210)) return false;
    const p = amaSlotPlan(g, t.dir).get(t.id);
    if (!p || p.wait <= AMA_SLOT.waitMin) return false;
    // 後ろの列車がこの駅に入れなくなる (駅間で止まる) なら待たせない
    if (!here.lanes.some(x => x === null)) {
        for (let k = 1; k <= Math.ceil(UNITS_PER_STATION * 1.5); k++) {
            const b = bs[t.currBlockIndex - t.dir * k];
            if (!b || b.x === -1000) break;
            if (b.lanes.some(l => l && l !== t && l.dir === t.dir)) return false;
        }
    }
    AMA_SLOT.stats.slotHold++;
    t._holdWhy = `尼崎PRC: 尼崎の番線の空きに合わせて${blockStationName(here)}で待つ (見込み ${Math.round(p.wait)}秒)`;
    return true;
}

/** J. 次の駅がふさがっていて入れないなら、ホームで待つ (駅間で止めない) */
function amaExitHold(t) {
    if (!amaStratOn() || globalThis.__NO_AMA_SLOT) return false;
    if (["stopped", "holding"].indexOf(t.state) < 0 || !t.hasDeparted || t.turnbackTrack || t.type === "貨物") return false;
    const g = t.game;
    const bs = g.trackMgr.blocks[t.trackId];
    const here = bs && bs[t.currBlockIndex];
    if (!here || !isRealStationBlock(here)) return false;
    const st = blockStationName(here);
    if (AMA_SLOT.exitStations.indexOf(st) < 0 || st === t.dest || t.stuckTime >= 150) return false;
    const out = st === AMA_PRC.station ? amaOutTrack(t) : t.trackId;
    const ob = g.trackMgr.blocks[out];
    if (!ob) return false;
    let S = null;
    for (let j = 1; j <= UNITS_PER_STATION; j++) {
        const b = ob[t.currBlockIndex + t.dir * j];
        if (!b || b.x === -1000) return false;
        if (isRealStationBlock(b)) { S = b; break; }
        if (b.lanes.some(l => l && l !== t && l.dir === t.dir)) return false;   // 駅間に列車がいる (続行の間隔に任せる)
    }
    if (!S || t.findFreeLane(S, out !== t.trackId ? out : undefined) !== -1) return false;
    if (S.lanes.some(o => o && amaReady(o) && (o.timer || 0) <= 20 && o.stuckTime < 30)) return false;   // すぐ空く
    if (st === AMA_PRC.station) {
        // 自分の番線を、近づく列車がすぐ使う (ほかに空きが無い) なら出て空ける
        const myLane = here.lanes.indexOf(t);
        const need = amaDemand(g, t.dir).some(a => a.eta < 60 && a.lanes.indexOf(myLane) >= 0 &&
                                                   !a.lanes.some(l => here.lanes[l] === null));
        if (need) return false;
    }
    AMA_SLOT.stats.exitHold++;
    t._holdWhy = `尼崎PRC: ${blockStationName(S)}に入れないため${st}で待つ`;
    return true;
}

(function () {
    const baseHold = Train.prototype.checkHold;
    Train.prototype.checkHold = function (isStarting) {
        if (baseHold.call(this, isStarting)) return true;
        if (isStarting && !this.forceStart && (amaSlotHold(this) || amaExitHold(this))) { this._routineHold = true; return true; }
        return false;
    };
})();
