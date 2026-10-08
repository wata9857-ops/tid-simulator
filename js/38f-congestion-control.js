/* 線路の詰まりの見張りと段階的な運転整理、指令パッドの「その場で」の処置 (利用者の指摘 2026-10 ②③)

   ■ なぜ要るか
     これまで手前での折り返し (js/27-operations.js の checkShortTurns) が動くのは、運転見合わせ・抑止・故障
     のような「はっきりした支障」があるときだけだった。支障が無くても列車が数珠つなぎに止まって動けなくなる
     (満線・番線の取り合い・後続の押し込み) と、誰も手前で止めず、上流から列車が流れ込み続けて詰まりが
     何駅も伸びていた。

   ■ 動的モデル (1分ごと)
     1. 線路・向きごとに、動けない列車 (2分以上止まっている) の連なりを「詰まり」として見つける
        (隣り合う動けない列車の間隔が2駅以内)。
     2. 詰まりごとに「圧力」を出す。
          いまの圧力 P = Σ 止まっている分 (1本あたり15分まで) + 本数×2 + 駅間で止まっている本数×3
          見込み Pe = P + 上流 (8駅以内) から流れ込む列車の数×1.5 + 前の分からの伸び×2
        前の分から伸びている詰まりは、早めに手を打つ (伸びの見込み)。
     3. 線区全体で動けない列車の割合が高いとき (20%以上) は「広域運転整理」に入り、段階の境目を下げる
        (上位の運転整理。ふつうより上流で・早く手を打つ)。
     4. 段階
          段階1 (Pe ≥ 12) … 上流 1〜6駅を運転整理の徐行にして流入をならす (ふだんの運転でもこの範囲まで広げる)
          段階2 (Pe ≥ 28) … 上流の駅に停まっている列車を、時間で解ける抑止 (最大 3分) で駅に留める。
                             駅間に列車を並べない (駅間で止まると客扱いも折り返しもできない)
          段階3 (Pe ≥ 50) … 詰まりを支障として手前の折り返しに渡す (checkShortTurns の支障に足す)。
                             上流で折り返せる駅で折り返させ、詰まりへ入る列車を減らす
          段階4 (Pe ≥ 85) … さらに上流 (10駅以内) の始発駅で、発車前の列車を抑止して詰まりへ送り込まない
     5. 詰まりが解けたら (3分続けて見つからない) 徐行・抑止を外し、折り返しの手配も元に戻す
        (shortTurnRestore が「支障が解けた」として元の行先に戻す)。
*/
const JAM_STUCK_SEC = 120;             // これ以上止まっている列車を「動けない」と数える
const JAM_GAP_STATIONS = 2;            // 詰まりの中の列車どうしの間隔の上限 (駅数)
const JAM_MIN_TRAINS = 3;              // 詰まりとみなす最少の本数
const JAM_LEVELS = [12, 28, 50, 85];   // 段階1〜4 の圧力の境目
const JAM_WIDE_RATIO = 0.20;           // 広域運転整理に入る「動けない列車の割合」
const JAM_WIDE_SCALE = 0.75;           // 広域運転整理のときの境目の倍率
const JAM_HOLD_SEC = 180;              // 段階2・4 の抑止の長さ [秒]
const JAM_CLEAR_MIN = 3;               // この分数だけ見つからなければ解けたとみなす
const JAM_HOLD_COOLDOWN = 600;         // 抑止を解いた列車を次に留めるまでの間 [秒]

function jamTrainCounts(t) {
    if (!t || t.state === "finished" || t.state === "in_depot" || t.overnightStable) return false;
    if (t.type === "留置" || t.workPermit || t.workRun || t.workTrain) return false;
    return true;
}

class CongestionControl {
    constructor(game) {
        this.game = game;
        this.zones = new Map();      // key → zone
        this.next = 0;
        this.seq = 1;
        this.wide = false;
        this.stats = { zones: 0, holds: 0, slows: 0, maxLevel: 0, wideMin: 0 };
    }

    update(ct) {
        if (globalThis.__NO_JAM_CONTROL) return;
        this.releaseHolds(ct);
        if (ct < this.next) return;
        this.next = ct + 60;
        const g = this.game;
        const active = g.trains.filter(jamTrainCounts);
        const stuck = active.filter(t => (t.stuckTime || 0) >= 60).length;
        const ratio = active.length ? stuck / active.length : 0;
        const wasWide = this.wide;
        this.wide = ratio >= JAM_WIDE_RATIO && active.length >= 20;
        if (this.wide) this.stats.wideMin++;
        if (this.wide && !wasWide) {
            g.ui.updateBanner(`【広域運転整理】動けない列車が ${Math.round(ratio * 100)}% に達したため、上位の運転整理に入ります ` +
                              `(詰まりの上流で早めに抑止・折り返しを行います)。`, "banner-red");
        } else if (!this.wide && wasWide) {
            g.ui.updateBanner("【広域運転整理】詰まりが減ったため、ふだんの運転整理に戻します。", "banner-blue");
        }
        const found = this.findJams();
        const seen = new Set();
        for (const c of found) {
            const z = this.matchZone(c);
            seen.add(z.key);
            this.applyLevel(z, ct);
        }
        for (const [key, z] of this.zones) {
            if (seen.has(key)) continue;
            z.missing = (z.missing || 0) + 1;
            if (z.missing >= JAM_CLEAR_MIN) {
                this.zones.delete(key);
                if (z.level >= 2) g.ui.updateBanner(`【運転整理】${z.label} の詰まりが解けました。抑止・徐行を解除します。`, "banner-blue");
                this.dropHolds(z.key);
            }
        }
    }

    /** 線路・向きごとの、動けない列車の連なり */
    findJams() {
        const g = this.game;
        const out = [];
        const byTrack = {};
        for (const t of g.trains) {
            if (!jamTrainCounts(t) || (t.stuckTime || 0) < JAM_STUCK_SEC) continue;
            if (t.jamHold) continue;                        // 自分で掛けた抑止は詰まりに数えない
            if (/Hoppo|Siding|Freight/.test(t.trackId || "")) continue;
            const k = t.trackId + "|" + t.dir;
            (byTrack[k] = byTrack[k] || []).push(t);
        }
        const gap = UNITS_PER_STATION * JAM_GAP_STATIONS;
        for (const k in byTrack) {
            const list = byTrack[k];
            const dir = list[0].dir;
            list.sort((a, b) => (b.currBlockIndex - a.currBlockIndex) * dir);     // 先頭 (前方) から
            let cur = [list[0]];
            const flush = () => { if (cur.length >= JAM_MIN_TRAINS) out.push(this.describe(cur)); };
            for (let i = 1; i < list.length; i++) {
                const prev = cur[cur.length - 1];
                if ((prev.currBlockIndex - list[i].currBlockIndex) * dir <= gap) cur.push(list[i]);
                else { flush(); cur = [list[i]]; }
            }
            flush();
        }
        return out;
    }

    describe(trains) {
        const g = this.game;
        const head = trains[0], tail = trains[trains.length - 1], dir = head.dir;
        const blks = g.trackMgr.blocks[head.trackId];
        let p = trains.length * 2;
        trains.forEach(t => {
            p += Math.min(t.stuckTime || 0, 900) / 60;
            const b = blks[t.currBlockIndex];
            if (b && !isRealStationBlock(b)) p += 3;
        });
        // 上流から流れ込む列車 (8駅以内・同じ向き・まだ動いている)
        let inflow = 0;
        for (let k = 1; k <= UNITS_PER_STATION * 8; k++) {
            const b = blks[tail.currBlockIndex - dir * k];
            if (!b) break;
            b.lanes.forEach(x => { if (x && x.dir === dir && jamTrainCounts(x) && (x.stuckTime || 0) < JAM_STUCK_SEC) inflow++; });
        }
        return { trackId: head.trackId, dir: dir, head: head.currBlockIndex, tail: tail.currBlockIndex,
                 trains: trains, p: p, inflow: inflow };
    }

    /** 前の分からの詰まりとつなぐ (同じ線路・向きで範囲が重なる) */
    matchZone(c) {
        const span = UNITS_PER_STATION * 2;
        const lo = Math.min(c.head, c.tail), hi = Math.max(c.head, c.tail);
        let z = null;
        for (const x of this.zones.values()) {
            if (x.trackId !== c.trackId || x.dir !== c.dir) continue;
            if (hi + span < x.lo || lo - span > x.hi) continue;
            z = x; break;
        }
        if (!z) {
            z = { key: "j#" + (this.seq++), trackId: c.trackId, dir: c.dir, prevP: c.p, level: 0, since: this.game.currentTime };
            this.zones.set(z.key, z);
            this.stats.zones++;
        }
        const trend = c.p - (z.p !== undefined ? z.p : c.p);
        z.prevP = z.p !== undefined ? z.p : c.p;
        z.p = c.p;
        z.pe = c.p + c.inflow * 1.5 + Math.max(0, trend) * 2;
        z.lo = lo; z.hi = hi; z.head = c.head; z.tail = c.tail; z.trains = c.trains; z.n = c.trains.length;
        z.missing = 0;
        const blks = this.game.trackMgr.blocks[c.trackId];
        const nm = (i) => { for (let k = 0; k <= UNITS_PER_STATION; k++) { const b = blks[i - c.dir * k]; if (b && isRealStationBlock(b)) return blockStationName(b); } return "駅間"; };
        z.label = `${nm(c.tail)}〜${nm(c.head)} (${c.dir === 1 ? "上り" : "下り"})`;
        return z;
    }

    levelOf(z) {
        const s = this.wide ? JAM_WIDE_SCALE : 1;
        let lv = 0;
        JAM_LEVELS.forEach((th, i) => { if (z.pe >= th * s) lv = i + 1; });
        return lv;
    }

    applyLevel(z, ct) {
        const g = this.game;
        const lv = this.levelOf(z);
        const old = z.level || 0;
        z.level = lv;
        if (lv > this.stats.maxLevel) this.stats.maxLevel = lv;
        if (lv > old && lv >= 2) {
            const what = ["", "徐行で流入をならします", "上流の駅で抑止します", "上流の駅で折り返し運転を行います", "上流の始発駅で発車を見合わせます"][lv];
            g.ui.updateBanner(`【運転整理】${z.label} で列車が ${z.n}本 つながって動けません (圧力 ${Math.round(z.pe)})。` +
                              `段階${lv}: ${what}。`, lv >= 3 ? "banner-red" : "banner-orange");
            if (g.records && g.records.noteDisposition && z.trains[0]) {
                try { g.records.noteDisposition(z.trains[0], z.label, "線路の詰まり", `段階${lv}の運転整理`); } catch (e) { /* 記録は無くてもよい */ }
            }
        }
        if (lv >= 1) this.slowUpstream(z, ct, lv);
        if (lv >= 2) this.holdUpstream(z, ct, lv);
        if (lv >= 4) this.holdOrigins(z, ct);
    }

    /** 段階1: 上流 1〜6駅 (段階が上がるほど遠くまで) を運転整理の徐行にする */
    slowUpstream(z, ct, lv) {
        const U = UNITS_PER_STATION;
        const far = U * Math.min(10, 4 + lv * 2), near = U;
        const a = z.tail - z.dir * near, b = z.tail - z.dir * far;
        this.game.trackMgr.addSpeedRestriction(z.trackId, Math.min(a, b), Math.max(a, b),
            1.15 + 0.1 * lv, "運転整理 (詰まりの上流)", ct + 75);
        this.stats.slows++;
    }

    /** 段階2: 上流の駅に停まっている列車を駅に留める (1分に2本まで・1つの詰まりで4本まで) */
    holdUpstream(z, ct, lv) {
        const g = this.game;
        const blks = g.trackMgr.blocks[z.trackId];
        if (!blks) return;
        const held = g.trains.filter(t => t.jamHold && t.jamHold.key === z.key).length;
        let room = Math.min(2, 4 + (lv >= 3 ? 2 : 0) - held);
        const far = UNITS_PER_STATION * (lv >= 3 ? 8 : 5);
        for (let k = 1; k <= far && room > 0; k++) {
            const b = blks[z.tail - z.dir * k];
            if (!b) break;
            if (!isRealStationBlock(b)) continue;
            for (const t of b.lanes) {
                if (!t || t.dir !== z.dir || !this.holdable(t, z)) continue;
                this.hold(t, z, ct + JAM_HOLD_SEC);
                room--;
                if (room <= 0) break;
            }
        }
    }

    /** 段階4: さらに上流 (10駅以内) の始発駅で、発車前の列車を留める */
    holdOrigins(z, ct) {
        const g = this.game;
        const blks = g.trackMgr.blocks[z.trackId];
        if (!blks) return;
        for (let k = UNITS_PER_STATION; k <= UNITS_PER_STATION * 10; k++) {
            const b = blks[z.tail - z.dir * k];
            if (!b) break;
            for (const t of b.lanes) {
                if (!t || t.dir !== z.dir || t.state !== "waiting_start" || t.hasDeparted) continue;
                if (!this.holdable(t, z)) continue;
                this.hold(t, z, ct + JAM_HOLD_SEC);
            }
        }
    }

    holdable(t, z) {
        if (!jamTrainCounts(t) || t.jamHold || t.isManuallySuspended || t.recoveryHold || t.commIncident) return false;
        // 同じ列車を続けて留めない (解いてから10分は留めない。抑止をつないで長く止めない)
        if (t.jamHoldFreedAt && this.game.currentTime - t.jamHoldFreedAt < JAM_HOLD_COOLDOWN) return false;
        if (t.minorTrouble || t.type === "特急" || t.type === "貨物") return false;
        if (["stopped", "holding", "waiting_start"].indexOf(t.state) < 0) return false;
        // ホームの無い線 (通過線・待避の側線) に居る旅客列車は留めない (そこで客扱いの停車になってしまう)
        const b = (this.game.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
        if (!b || !isRealStationBlock(b)) return false;
        const st = blockStationName(b);
        if (t.type !== "回送" && (!t.passengerStopsAt(st) || !laneHasPlatform(st, t.trackId, t.lane))) return false;
        /* 進路の表・番線の共有を持つ大きな駅 (尼崎・大阪・京都) と、折り返し・終着の列車は留めない
           (そこでの発車順は PRC・折り返しの手順が決めている。留めると番線の取り合いになる) */
        if (STATION_ROUTES[st] || STATION_SHARED_LANES[st]) return false;
        if (t.dest === st || t.isFinalStop || t.turnbackTrack || t.serviceChange || t.state === "turning_back") return false;
        // 詰まりより手前が行先 (または手前で線区を離れる) 列車は留めない
        const db = stationBlockOn(this.game, t.trackId, lineEndForBeyond(t.dest) || t.dest);
        if (db && (z.tail - db.index) * z.dir > 0) return false;
        return true;
    }

    hold(t, z, until) {
        t.jamHold = { key: z.key, until: until };
        t.isManuallySuspended = true;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = true;     // 指令の「長時間抑止」の通知は出さない (時間で解ける)
        this.stats.holds++;
    }

    releaseHolds(ct) {
        for (const t of this.game.trains) {
            if (!t.jamHold) continue;
            const z = this.zones.get(t.jamHold.key);
            if (ct >= t.jamHold.until || !z || z.level < 2 || t.state === "finished") this.releaseOne(t);
        }
    }

    dropHolds(key) {
        for (const t of this.game.trains) if (t.jamHold && t.jamHold.key === key) this.releaseOne(t);
    }

    releaseOne(t) {
        t.jamHold = null;
        t.jamHoldFreedAt = this.game.currentTime;
        if (t.recoveryHold || t.commIncident || t.commHoldLimit) return;
        t.isManuallySuspended = false;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = false;
        if (t.state === "holding") { t.state = "running"; t.timer = 15; }
    }

    /** 段階3 以上の詰まりを、手前の折り返し (checkShortTurns) の支障として渡す */
    shortTurnZones(baseZones) {
        const out = [];
        const near = UNITS_PER_STATION * 3;
        for (const z of this.zones.values()) {
            if (z.level < 3 || z.missing) continue;
            /* 見合わせ・抑止などのはっきりした支障の手前に並んでいるだけの列は、その支障の見込みの時間で
               折り返しを決める (すぐ解ける支障なら折り返さない。checkShortTurns の決まり) ので、ここでは足さない */
            if ((baseZones || []).some(b => b.trackId === z.trackId &&
                    z.lo <= Math.max(b.start, b.end) + near && z.hi >= Math.min(b.start, b.end) - near)) continue;
            out.push({ trackId: z.trackId, start: z.lo, end: z.hi, why: `${z.label} の線路の詰まり`,
                       key: z.key, remain: Math.round(900 + z.pe * 30) });
        }
        return out;
    }
}

(function () {
    // 毎Tick の見張り (運転整理の一部として、OperationsManager の update のあとに回す)
    const baseUpd = OperationsManager.prototype.update;
    OperationsManager.prototype.update = function (ct) {
        baseUpd.call(this, ct);
        const g = this.game;
        if (!g.jamControl) g.jamControl = new CongestionControl(g);
        g.jamControl.update(ct);
    };
    // 段階3 の詰まりを、手前での折り返しの支障に足す
    const baseZones = OperationsManager.prototype.shortTurnZones;
    OperationsManager.prototype.shortTurnZones = function () {
        const zones = baseZones.call(this);
        const jc = this.game.jamControl;
        return jc ? zones.concat(jc.shortTurnZones(zones)) : zones;
    };
    // 指令の抑止解除・強制発車は、詰まりの抑止も解く
    ["release", "force"].forEach(n => {
        const base = DISPATCH[n];
        DISPATCH[n] = function (game, cmd) {
            const t = game.getTrain(cmd.trainId);
            if (t && t.jamHold) t.jamHold = null;
            return base(game, cmd);
        };
    });
})();

/* ================================================================== 指令パッドの「その場で」の処置 (利用者の指摘 2026-10 ②)

   terminateHere … 当駅で運転を打ち切る (駅間なら次の駅)。
                   その駅で折り返せるなら折り返しを待つ (終着後の処置: 折り返し / 入区)。
                   折り返せない駅なら、お客様を降ろしたあと回送にして、前方の折り返せる駅 (または車両所) まで走らせる。
   deadheadHere  … 当駅 (駅間なら次の駅) でお客様を降ろし、回送にする。行先はいまのまま (入区できる駅なら入区)。
   turnbackHere  … いまの位置から折り返す。当駅の配線で折り返せるなら当駅で、無理なら前方で最初に折り返せる駅で。
                   折り返したあとは、来た方向 (始発駅の方) へ同じ種別で走る。 */

/** その列車がいま居る駅、駅間なら次に着く駅 */
function dispatchHereOrNext(game, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    const b = blks ? blks[t.currBlockIndex] : null;
    if (b && isRealStationBlock(b)) return { name: blockStationName(b), at: true };
    const nx = trainStationsAhead(game, t, 1)[0];
    return nx ? { name: nx, at: false } : null;
}

/** その駅に停まっていれば、そこで終着の扱いに入れる */
function dispatchStopHere(t, at) {
    if (at && ["stopped", "waiting_start", "holding", "running"].indexOf(t.state) >= 0) {
        t.state = "stopped";
        t.isFinalStop = true;
        t.hasStoppedAtCurrent = true;
        t.timer = Math.max(30, t.timer || 0);
    }
}

/** 回送にする (列車番号を回送の番号に付け直す) */
function dispatchMakeDeadhead(game, t) {
    if (t.type === "回送") return true;
    if (typeof t.canChangeTypeTo === "function" && !t.canChangeTypeTo("回送")) return false;
    game.spawner.activeTrainNos.delete(t.trainNo);
    t.type = "回送";
    t.trainNo = game.ops.deadheadNo("M", t.dir);
    t.dutyName = t.trainNo;
    game.spawner.activeTrainNos.add(t.trainNo);
    t.specialEvent = null;
    return true;
}

/** 打ち切りの前に、ほかの運転整理の手配を消す */
function dispatchClearPlans(t) {
    t.shortTurnPrev = null; t.shortTurnKey = null; t.shortTurnAt = null;
    t.serviceChange = null; t.stableTarget = null; t.nightReturn = false;
    if (t.jamHold) t.jamHold = null;
    t.isManuallySuspended = false; t.plannedStop = null;
    if (t.nextAction === "wait_instruction") t.nextAction = "turnback";
}

Object.assign(DISPATCH, {
    terminateHere(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t || t.state === "in_depot" || t.state === "finished") return { ok: false, msg: "対象の列車が見つかりません。" };
        if (recoveryHoldBlocks(t, cmd)) return { ok: false, msg: `${t.trainNo} は運転再開の順番待ちで抑止中です。` };
        if (t.type === "貨物" || t.type === "特急") return { ok: false, msg: `${t.type}はその場で打ち切れません。` };
        const h = dispatchHereOrNext(game, t);
        if (!h) return { ok: false, msg: `${t.trainNo} の前方に駅がありません。` };
        const oldNo = t.trainNo, oldDest = t.dest;
        dispatchClearPlans(t);
        const why = dispatchTerminateProblem(game, t, h.name);
        if (!why) {
            t.dest = h.name;
            t.isFinalStop = false;
            t.nextAction = (DEPOTS[h.name] && cmd.after === "depot") ? "depot" : "turnback";
            if (t.updateKoseiRoute) t.updateKoseiRoute();
            dispatchStopHere(t, h.at);
            const msg = `${oldNo} (${oldDest}行き) は ${h.name}駅で運転を打ち切り、${h.name}で折り返します。`;
            game.ui.updateBanner(`【指令】${msg}`, "banner-orange");
            if (game.records) game.records.noteDisposition(t, h.name, "指令の打ち切り", `${h.name}止まり`);
            return { ok: true, msg: msg };
        }
        // 折り返せない駅: お客様を降ろしたあと回送で前方の折り返せる駅へ
        const fwd = commAheadTurnback(game, t);
        if (!fwd) return { ok: false, msg: `${h.name}駅では折り返せず、前方にも折り返せる駅がありません。${why}` };
        if (!dispatchMakeDeadhead(game, t)) return { ok: false, msg: "いまの編成では回送にできません。" };
        t.dest = fwd;
        t.isFinalStop = false;
        t.nextAction = DEPOTS[fwd] ? "depot" : "turnback";
        if (t.updateKoseiRoute) t.updateKoseiRoute();
        const msg = `${oldNo} (${oldDest}行き) は ${h.name}駅で営業を打ち切り、回送 ${t.trainNo} として ${fwd}まで走ります` +
                    ` (${h.name}駅では折り返せません)。`;
        game.ui.updateBanner(`【指令】${msg}`, "banner-orange");
        if (game.records) game.records.noteDisposition(t, h.name, "指令の打ち切り", `${h.name}で営業打ち切り・${fwd}まで回送`);
        return { ok: true, msg: msg };
    },

    deadheadHere(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t || t.state === "in_depot" || t.state === "finished") return { ok: false, msg: "対象の列車が見つかりません。" };
        if (t.type === "回送") return { ok: false, msg: `${t.trainNo} はすでに回送です。` };
        if (t.type === "貨物") return { ok: false, msg: "貨物列車は回送にできません。" };
        const h = dispatchHereOrNext(game, t);
        const oldNo = t.trainNo;
        if (!dispatchMakeDeadhead(game, t)) return { ok: false, msg: "いまの編成では回送にできません。" };
        if (t.nextAction === "wait_instruction") t.nextAction = "turnback";
        if (DEPOTS[t.dest]) t.nextAction = "depot";
        const where = h ? `${h.name}駅${h.at ? "" : "（次の駅）"}` : "その場";
        const msg = `${oldNo} は ${where}でお客様を降ろし、回送 ${t.trainNo} (${t.dest}まで) とします。`;
        game.ui.updateBanner(`【指令】${msg}`, "banner-orange");
        if (game.records && h) game.records.noteDisposition(t, h.name, "指令の回送変更", "回送に変更");
        return { ok: true, msg: msg };
    },

    turnbackHere(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t || t.state === "in_depot" || t.state === "finished") return { ok: false, msg: "対象の列車が見つかりません。" };
        if (recoveryHoldBlocks(t, cmd)) return { ok: false, msg: `${t.trainNo} は運転再開の順番待ちで抑止中です。` };
        if (t.type === "貨物") return { ok: false, msg: "貨物列車はその場で折り返せません。" };
        // 折り返したあとの行先: 来た方向の始発駅 (線区の端・車両所でもよい)。分からなければ折り返し駅で決め直す
        const back = t.startName && STATION_MAP[t.startName] !== undefined ? t.startName : null;
        dispatchClearPlans(t);
        const oldNo = t.trainNo, oldDest = t.dest;
        let plan = back ? dispatchTurnbackPlan(game, t, back) : null;
        if (!plan) {
            const h = dispatchHereOrNext(game, t);
            const at = (h && !dispatchTerminateProblem(game, t, h.name)) ? h.name : commAheadTurnback(game, t);
            if (!at) return { ok: false, msg: `${t.trainNo} は、いまの位置から折り返せる駅がありません。` };
            t.dest = at; t.isFinalStop = false; t.nextAction = "turnback";
            if (h && h.name === at) dispatchStopHere(t, h.at);
            plan = { at: at, text: `${at}で折り返す` };
        }
        const msg = `${oldNo} (${oldDest}行き) は ${plan.text}。`;
        game.ui.updateBanner(`【指令】${msg}`, "banner-orange");
        if (game.records) game.records.noteDisposition(t, plan.at, "指令の折り返し", `${plan.at}で折り返し`);
        return { ok: true, msg: msg };
    }
});
