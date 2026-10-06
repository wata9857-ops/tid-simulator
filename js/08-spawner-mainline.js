/* このファイルは index.html から分割されたものです。
   Spawner: 東海道・山陽本線(琵琶湖線/京都線/神戸線)の列車生成 */
/**
 * 本線 (琵琶湖線・JR京都線・JR神戸線) の列車生成。
 *
 * ★実際の駅時刻表から写したパターンダイヤ (js/10-timetable.js) で決める。
 *   以前は基準間隔に時間帯係数と種別係数を何段も掛けていて、
 *   普通が実際の2倍・快速と新快速が実際の4分の1という偏りになり、
 *   内側線だけが団子運転になっていた。
 *   いまは「1時間に何本」を時間帯ごとに直接指定し、
 *   毎時同じ分に発車させている。
 */
Spawner.prototype.checkIntervalSpawns = function (ct) {
        const h = (ct / 3600) % 24;

        ["Up", "Down"].forEach(dirName => {
            const dir = (dirName === "Up") ? 1 : -1;

            for (let type in INTERVALS) {
                // 新快速は大阪の発車時刻で組む (下の checkShinkaisokuSlots)
                if (type === "新快速") continue;
                /* 貨物は吹田貨物ターミナルの実際の時刻表で出す (js/38-freight-timetable.js)。
                   ★以前はここで「1時間に何本」を乱数の始発駅・行先・列車番号で出していた。 */
                if (type === "貨物") continue;
                // 下り特急のうち、はまかぜ・こうのとりは向日町からの出区で別に走らせる
                if (dirName === "Down" && type === "特急") {
                    if (ct >= this.nextMukoHamakazeTime) { this.spawnTokkyu(dirName, "hamakaze"); this.nextMukoHamakazeTime += 5400; }
                    else if (ct >= this.nextMukoKounotoriTime) { this.spawnTokkyu(dirName, "kounotori"); this.nextMukoKounotoriTime += 5400; }
                }

                const per = ttPerHour("main", dirName, type, h);
                const phase = ttPhase(type, dirName);
                if (per <= 0) {
                    // その時間帯は走らせない (深夜など)
                    this.nextSpawnTime[dirName][type] = ttNextTime(ct, 1, phase);
                    continue;
                }

                if (ct >= this.nextSpawnTime[dirName][type]) {
                    let spawned = true;
                    if (type === "特急") this.spawnTokkyu(dirName);
                    else spawned = this.trySpawn(type, dir);

                    if (spawned === false) {
                        /* 車両が無い・番線が空いていないなどで出せなかった。
                           発車の枠は捨てず、少し待ってから出す
                           (実際のダイヤでも遅れて発車する)。 */
                        this.nextSpawnTime[dirName][type] = ct + 45;
                    } else {
                        this.nextSpawnTime[dirName][type] = ttNextTime(ct, per, phase);
                    }
                }
            }
        });
        this.checkShinkaisokuSlots(ct);
};

/* ------------------------------------------------------------------ 新快速の組み方 (利用者の指摘 4.)

   ■ 何が起きていたか
     新快速は「始発駅を出る時刻」を毎時同じ分にそろえていた。ところが始発駅が
     野洲・米原・長浜・敦賀・近江今津 (下り)、姫路・網干 (上り) と毎回ちがい、大阪までの所要が
     野洲 約1時間50分 〜 敦賀 約2時間45分 と1時間近くちがうので、大阪では
     「ほとんど来ない時間」と「1駅おきに続けて来る時間」ができていた。
     しかも朝の 7〜9時に大阪へ着く列車は 5〜6時 (早朝の少ない本数) に出た列車なので、
     朝ラッシュの大阪の新快速は 1〜1.5本/時 しかなかった (実際は 4〜5本/時)。
     上りは、姫路・網干の着発線のすぐ先が朝の普通・快速で埋まり、出せたのは試みの 1割以下だった。
   ■ どうするか
     1. 新快速の時刻は「大阪を発車する時刻」で決める (TIMETABLE の新快速は大阪の本数)。
        大阪の時刻 (枠) ごとに始発駅を決め、その駅から大阪までの所要 (SK_LEAD) だけ前に出す。
     2. 終点で折り返す新快速は、大阪に着くころの空いている枠を受け持つ。
        受け持つ枠が無い (その時間の本数が足りている・深夜で枠が無い) ときは折り返さず運用を終える。
     3. 枠の時刻が来た新快速が出られないあいだ (最長5分)、その始発駅から同じ向きに出る
        ほかの列車 (普通・快速・出区) を待たせる。
     4. 出られないまま5分過ぎた枠は捨てる (遅れて出して続行にしない)。 */
/* 始発駅から大阪までの所要 (分)。実測した値 (種 20260922、ふだんのダイヤの中央値)。 */
const SK_LEAD = {
    "-1": { "野洲": 113, "米原": 150, "長浜": 160, "敦賀": 165, "近江今津": 141 },
    "1":  { "姫路": 110, "網干": 132 }
};
const SK_MIN_PER_STATION = 108 / 27;   // 線路図の駅1つあたりの所要 (姫路〜大阪 27駅)
const SK_HORIZON = 190 * 60;
/* 大阪を出る最終の新快速の時刻 (時)。以前は 0:00 ごろまで出していて遅すぎた (利用者の指摘 ⑤)。
   23:15 ごろを最終にする (それより後の大阪の枠は作らない)。 */
const SK_LAST_OSAKA = 23.25;

/** その駅から大阪までの所要 (秒)。大阪を通らない向きなら null */
Spawner.prototype.skLeadFrom = function (stName, dir, atTime) {
    if (atTime !== undefined) {
        const learned = SK_LEAD_LEARNED[dir + "|" + stName + "|" + skBand((atTime / 3600) % 24)];
        if (learned !== undefined) return learned;
    }
    const L = SK_LEAD[String(dir)];
    if (L && L[stName] !== undefined) return L[stName] * 60;
    const i = STATION_MAP[stName], o = STATION_MAP["大阪"];
    if (i === undefined || stationBranchLine(stName)) return null;
    if ((o - i) * dir < 0) return null;
    return Math.abs(o - i) * SK_MIN_PER_STATION * 60;
};

Spawner.prototype.checkShinkaisokuSlots = function (ct) {
    if (!this.sk) this.sk = { "1": { next: null, slots: [] }, "-1": { next: null, slots: [] }, hold: {},
                              stats: { spawned: 0, turnback: 0, dropped: 0 } };
    for (const dir of [1, -1]) {
        const dirName = dir === 1 ? "Up" : "Down";
        const S = this.sk[String(dir)];
        const phase = ttPhase("新快速", dirName);
        if (S.next === null) S.next = ttNextTime(ct, 4, phase);
        // 1. 大阪の時刻の枠を先まで作る
        let guard = 0;
        while (S.next <= ct + SK_HORIZON && guard++ < 50) {
            const per = ttPerHour("main", dirName, "新快速", (S.next / 3600) % 24);
            // ★最終の新快速を早める (利用者の指摘 ⑤)。大阪 SK_LAST_OSAKA 以降の枠は作らない
            const late = ttAbsHour((S.next / 3600) % 24) >= SK_LAST_OSAKA;
            if (per > 0 && !late) S.slots.push({ t: S.next, state: "free", step: 3600 / per });
            S.next = ttNextTime(S.next, per > 0 ? per : 4, phase);
        }
        // 2. 枠ごとに始発駅を決め、3. 出す
        for (const sl of S.slots) {
            if (sl.state === "free" && ct >= sl.t - SK_HORIZON + 300) {
                const origin = this.skPickOrigin(dir, sl.t, ct);
                if (!origin) { sl.state = "dropped"; this.sk.stats.dropped++; continue; }
                sl.origin = origin;
                const lead0 = this.skLeadFrom(origin, dir);
                sl.spawnAt = sl.t - this.skLeadFrom(origin, dir, sl.t - lead0);
                sl.state = "queued";
            }
            /* ★始発駅に編成がいないときは、発車の45分前に車両所から送り込む (railInStock)。
                 以前は発車の時刻になってから送り込んでいたので、着くのが枠より 20分ほど遅れ、
                 大阪の時刻も持たずに走って次の枠の新快速の前をふさいでいた (翌朝の上り 2.5本/時)。 */
            if (sl.state === "queued" && !sl.railed && ct >= sl.spawnAt - 2700 && ct < sl.spawnAt - 600 &&
                this.game.fleet.poolAt(sl.origin).length === 0 && this.game.ops) {
                sl.railed = true;
                const trackId0 = (dir === 1 ? "Up_Out" : "Down_Out");
                const cfg = { type: "新快速", dir: dir, trackId: trackId0, startName: sl.origin,
                              dest: this.getDestination("新快速", dir, sl.origin, trackId0),
                              skTarget: sl.t, skOrigin: sl.origin, skBorn: sl.spawnAt };
                if (this.game.ops.railInStock(cfg, true)) {
                    sl.state = "taken"; sl.by = "railin"; this.sk.stats.railin = (this.sk.stats.railin || 0) + 1;
                    continue;
                }
            }
            if (sl.state === "queued" && ct >= sl.spawnAt) {
                if (ct > sl.spawnAt + 600) { sl.state = "dropped"; this.sk.stats.dropped++; continue; }
                this.sk.hold[sl.origin + "|" + dir] = ct + 60;
                /* 出す列車に大阪の時刻を持たせる (途中の駅で早すぎれば時間を調整する。skHoldAt)。
                   ★以前は出したあとに列車の一覧の後ろから探していたが、留置場の予備車を使って出した列車
                     (一覧の前のほうにいる) には付かず、翌朝の新快速の多くが時間調整なしで走っていた。
                     生成の設定 (config.skTarget) で渡す。 */
                this.skPendingTarget = { t: sl.t, origin: sl.origin, spawnAt: ct };
                const okSpawn = this.trySpawn("新快速", dir, sl.origin);
                this.skPendingTarget = null;
                if (okSpawn) {
                    sl.state = "taken"; sl.by = "spawn"; this.sk.stats.spawned++;
                    delete this.sk.hold[sl.origin + "|" + dir];
                }
            }
        }
        S.slots = S.slots.filter(sl => sl.t > ct - 3600);
    }
};

/* 時間を調整する駅 (新快速の停車駅)。大阪の時刻より早く走っている新快速は、ここで発車を待つ。
   実際のダイヤでも、主な駅の停車時分で前後の間隔をそろえている。 */
const SK_TIMING_STATIONS = { "1": ["加古川", "明石", "三ノ宮", "尼崎"], "-1": ["草津", "京都", "高槻"] };
/** その駅で、大阪の時刻に合わせるために延ばす停車時分 (秒) */
Spawner.prototype.skHoldAt = function (train, stName) {
    if (!train.skTarget || serviceDisrupted(this.game)) return 0;
    if ((SK_TIMING_STATIONS[String(train.dir)] || []).indexOf(stName) < 0) return 0;
    const rest = this.skLeadFrom(stName, train.dir);
    if (rest === null) return 0;
    const early = (train.skTarget - rest) - this.game.currentTime;
    return early > 30 ? Math.min(240, Math.round(early)) : 0;
};

/**
 * 枠から出した新快速が大阪を発車したとき、始発駅から大阪までの所要を覚え直す。
 * ★所要は時間帯で変わる (早朝・深夜は線路が空いていて速い)。昼間に測った値のままだと、
 *   翌朝の新快速は大阪に枠より 20分近く早く着き、間隔が崩れていた。時間帯 (4区分) ごとに持つ。
 */
const SK_LEAD_LEARNED = {};
function skBand(h) { return (h < 6.5) ? "早朝" : (h < 9.5) ? "朝" : (h < 17) ? "昼" : "夕夜"; }
Spawner.prototype.skLearn = function (train) {
    if (!train.skOrigin || !train.skBorn) return;
    let obs = this.game.currentTime - train.skBorn;
    if (obs <= 0 || (train.delayTime || 0) > 180) { train.skOrigin = null; return; }
    /* 留置場の出区待ちで待った時間などが入ることがあるので、実測の基準 (SK_LEAD) の ±20% に収める */
    const base = (SK_LEAD[String(train.dir)] || {})[train.skOrigin];
    if (base !== undefined) obs = Math.max(base * 60 * 0.8, Math.min(base * 60 * 1.2, obs));
    else if (obs > 4 * 3600) { train.skOrigin = null; return; }
    const key = train.dir + "|" + train.skOrigin + "|" + skBand((train.skBorn / 3600) % 24);
    const cur = SK_LEAD_LEARNED[key];
    SK_LEAD_LEARNED[key] = (cur === undefined) ? obs : cur * 0.6 + obs * 0.4;
    train.skOrigin = null;
};

/** 枠の始発駅を選ぶ (いまから出して間に合う駅だけ) */
Spawner.prototype.skPickOrigin = function (dir, slotT, ct) {
    const base = (dir === -1)
        ? [{n:"野洲",w:25}, {n:"米原",w:25}, {n:"長浜",w:12}, {n:"敦賀",w:23}, {n:"近江今津",w:15}]
        : [{n:"姫路",w:80}, {n:"網干",w:20}];
    let ok = base.filter(o => slotT - this.skLeadFrom(o.n, dir) >= ct - 60);
    /* ★編成のいない始発駅は選ばない。編成が無いと車両所からの送り込み (railInStock) になり、
         着くのが枠より 20分ほど遅れて、次の枠の新快速の前をふさいでいた (翌朝の上り)。 */
    const stocked = ok.filter(o => this.game.fleet.poolAt(o.n).length > 0 ||
                                   (DEPOTS[o.n] && DEPOTS[o.n].trains.some(t => t.vehicles && t.vehicles.length)));
    if (stocked.length) ok = stocked;
    if (!ok.length) return null;
    ok.forEach(o => { o.w *= this.getTimeMultiplier(o.n, "新快速", dir, true, ct); });
    const tot = ok.reduce((a, o) => a + o.w, 0);
    let r = Math.random() * tot;
    for (const o of ok) { r -= o.w; if (r < 0) return o.n; }
    return ok[ok.length - 1].n;
};

/** 枠の時刻が来た新快速のために、その駅から同じ向きに出るほかの列車を待たせているか */
Spawner.prototype.skHeld = function (stName, dir) {
    if (!this.sk || !stName) return false;
    const until = this.sk.hold[stName + "|" + dir];
    return !!until && this.game.currentTime < until;
};

/**
 * 終点で折り返す新快速が、大阪に着くころの枠を受け持てるか。受け持てたら true。
 * 障害のときは枠を見ない (運転整理として折り返す)。
 */
Spawner.prototype.skClaimForTurnback = function (train, stName) {
    if (serviceDisrupted(this.game)) return true;
    const ct = this.game.currentTime;

    if (!this.sk) this.checkShinkaisokuSlots(ct);
    const newDir = -train.dir;
    const lead = this.skLeadFrom(stName, newDir);
    if (lead === null) return true;                     // 大阪を通らない (湖西線の中など): 枠と関係ない
    const eta = ct + lead + 300;
    const S = this.sk[String(newDir)];
    let best = null, bd = Infinity;
    for (const sl of S.slots) {
        if (sl.state !== "free" && !(sl.state === "queued" && ct < sl.spawnAt)) continue;
        const d = Math.abs(sl.t - eta);
        if (d <= sl.step * 0.5 && d < bd) { bd = d; best = sl; }
    }
    if (!best) return false;
    best.state = "taken"; best.by = "turnback";
    train.skTarget = best.t;
    this.sk.stats.turnback++;
    return true;
};

Spawner.prototype.getTimeMultiplier = function (st, type, dir, isStart, ct) {
        let h = (ct / 3600) % 24;
        let isMorning = (h >= 5 && h < 9);
        let isEvening = (h >= 17 && h < 21);
        let mult = 1.0;

        if (isMorning) {
            if (isStart) {
                // 神戸線側の駅を追加し、西側からの生成を活性化
                if (["野洲", "草津", "大阪", "西明石", "姫路"].includes(st)) mult *= 1.5;
                if (["高槻", "加古川", "神戸"].includes(st)) mult *= 1.3;
                if (["米原", "京都"].includes(st)) mult *= 1.2;
            } else {
                if (["大阪", "野洲", "草津", "西明石", "姫路"].includes(st)) mult *= 1.5;
                if (["高槻", "加古川"].includes(st)) mult *= 1.3;
                if (["京都", "米原"].includes(st)) mult *= 1.2;
            }
        } else if (isEvening) {
            if (!isStart) {
                // 夕方は両端の駅への到着ウェイトを強化
                if (["米原", "長浜", "姫路", "西明石"].includes(st)) mult *= 1.5;
                if (["敦賀", "野洲"].includes(st)) mult *= 1.8;
                if (st === "近江今津") mult *= 1.3;
            }
        }
        return mult;
};

Spawner.prototype.spawnTokkyu = function (dirName, forcedType = null) {
        if (Math.random() < 0.3 && !forcedType) return;
        let t = null; let num = 0;
        if (dirName === "Up") { 
            let r = Math.random();
            if (r < 0.1) { 
                num = this.tokkyuNext("はまかぜ", "up");
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"大阪", startName:"姫路", name:`はまかぜ${num}号`, serviceChange:{ at:"大阪", type:"回送", dest:"向日町操", name:`回${num+8000}D` }};
            } else if (r < 0.2) { 
                /* ★こうのとりは福知山線から来る (福知山・城崎温泉 → 新三田で線路図に入る)。
                     以前は尼崎から湧いていた。停車は 三田・宝塚・尼崎・大阪・新大阪 */
                num = this.tokkyuNext("こうのとり", "up");
                t = {type:"特急", dir:1, trackId:"Fukuchi_Up", dest:"新大阪", startName:"新三田", name:`こうのとり${num}号`, serviceChange:{ at:"新大阪", type:"回送", dest:"向日町操", name:`回${num+3000}M` }};
            } else if (r < 0.45) { 
                num = this.tokkyuNext("Sはくと", "up");
                // ★デッドロック対策: 京都駅到着後に消滅させる
                /* スーパーはくとは智頭急行から上郡で山陽本線に入る
                   (姫路より西を線路図に入れたので、上郡から走らせる)。 */
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"京都", startName:"上郡", name:`Sはくと${num}号`, nextAction: "depot"};
            } else if (r < 0.7) { 
                // ★サンダーバード追加
                num = this.tokkyuNext("サンダーバード", "up");
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"敦賀", startName:"大阪", name:`サンダーバード${num}号`, nextAction: "depot"};
            } else { 
                // ★はるか追加
                num = this.tokkyuNext("はるか", "up");
                t = {type:"特急", dir:1, trackId:"Up_Out", dest:"京都", startName:"新大阪", name:`はるか${num}号`, nextAction: "depot"};
            }
        } else { 
            let r = Math.random();
            if (forcedType === "hamakaze" || (forcedType === null && r < 0.1)) {
                let deadheadNo = this.allocTrainNo("回", 4, [0], "D", 1);   // 下りの回送は奇数
                num = this.tokkyuNext("はまかぜ", "down");
                t = {type:"回送", dir:-1, trackId:"Down_Out", dest:"大阪", startName:"向日町操", name:deadheadNo, serviceChange:{ at:"大阪", type:"特急", dest:"鳥取", name:`はまかぜ${num}号` }};
            } else if (forcedType === "kounotori" || (forcedType === null && r < 0.2)) {
                let deadheadNo = this.allocTrainNo("回", 3, [0, 1], "M", 1);
                num = this.tokkyuNext("こうのとり", "down");
                /* ★こうのとりの行先は尼崎ではない。尼崎から福知山線に入り、福知山・城崎温泉へ行く。
                     線路図の中では 新大阪・大阪・尼崎・宝塚・三田 に停まり、新三田で線路図の外へ出る。 */
                const kDest = Math.random() < 0.7 ? "福知山" : "城崎温泉";
                t = {type:"回送", dir:-1, trackId:"Down_Out", dest:"新大阪", startName:"向日町操", name:deadheadNo, serviceChange:{ at:"新大阪", type:"特急", dest:kDest, name:`こうのとり${num}号` }};
            } else if (forcedType === null) { 
                if (r < 0.45) {
                    num = this.tokkyuNext("Sはくと", "down");
                    // ★デッドロック対策: 到着後に消滅させる
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"鳥取", startName:"京都", name:`Sはくと${num}号`, nextAction: "depot"};
                } else if (r < 0.7) {
                    // ★サンダーバード追加
                    num = this.tokkyuNext("サンダーバード", "down");
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"大阪", startName:"敦賀", name:`サンダーバード${num}号`, nextAction: "depot"};
                } else {
                    // ★はるか追加
                    num = this.tokkyuNext("はるか", "down");
                    t = {type:"特急", dir:-1, trackId:"Down_Out", dest:"新大阪", startName:"京都", name:`はるか${num}号`, nextAction: "depot"};
                }
            }
        }
        if(t) this.game.addTrain(t);
};

/** 生成できなかった理由を数える (検証用。tools/check_patterns.js) */
Spawner.prototype.noteSpawnFail = function (type, dir, st, why) {
    const k = type + (dir === 1 ? "上" : "下") + ":" + (st || "") + ":" + why;
    this.spawnFail = this.spawnFail || {};
    this.spawnFail[k] = (this.spawnFail[k] || 0) + 1;
};

/* plan … 時刻表の貨物列車 (js/38-freight-timetable.js の checkFreightSchedule)。
          始発駅・行先・列車番号はその列車のものにする。 */
Spawner.prototype.trySpawn = function (type, dir, forcedStart, plan) {
        // ★追加: 22時以降の段階的な優等列車の削減
        let hOfDay = (this.game.currentTime / 3600) % 24;
        if (!forcedStart && (hOfDay >= 22.0 || hOfDay < 4.0)) {
            if (hOfDay >= 22.5 && type === "新快速") return false; // 22:30以降 新快速生成停止
            if (hOfDay >= 23.0 && type === "快速") return false;   // 23:00以降 快速生成停止
            if (hOfDay >= 23.0 && type === "特急") return false;   // 23:00以降 特急生成停止
        }

        /* 在線本数の目安を超えていたら作らない (js/10-timetable.js)。
           ★以前は新快速だけ「18本まで」という決め打ちの上限があり、
             実際の時刻表 (片道8本/時) に足りなかった。
             いまは時刻表から出した本数を種別ごとに見ている。 */
        /* 新快速の枠 (checkShinkaisokuSlots) から出すときは、本数は枠で決まっているので目安を見ない */
        if (!forcedStart && !plan && ttOverBudget(this.game, "main", type)) { this.noteSpawnFail(type, dir, "", "在線目安"); return false; }
        let trackId = "";
        if (type === "貨物" || type === "回送") trackId = (dir===1) ? "Up_Out" : "Down_Out";
        else trackId = (type==="普通"||type==="快速") ? (dir===1?"Up_In":"Down_In") : (dir===1?"Up_Out":"Down_Out");
        
        let candidates = [];
        if (type === "貨物" || type === "回送") {
            if (type === "貨物" && plan) {
                candidates = [plan.leg.from];      // 時刻表の列車 (js/38-freight-timetable.js)
            } else if (type === "貨物") {
                if (dir === 1) {
                    /* 山陽本線の上り貨物は岡山方面から上郡で線路図に入ってくる。
                       姫路貨物駅 (姫路タ) 発のものもある。
                       ★姫路タ・吹田タは旅客駅とは別の貨物ターミナルになった
                         (以前は ひめじ別所・北方貨物線の吹田貨 から出していた。割合は同じ)。 */
                    const rf = Math.random();
                    candidates = rf < 0.35 ? ["上郡"] : (rf < 0.5 ? ["姫路タ"] : ["吹田タ"]);
                } else {
                    let r = Math.random();
                    candidates = r < 0.15 ? ["敦賀"] : (r < 0.57 ? ["米原"] : ["吹田タ"]);
                }
            } else {
                candidates = (dir === 1) ? [] : ["京都"];
            }
        } else {
            const getStartOptions = () => {
                if (dir === -1) { 
                    // ★修正: 琵琶湖線上り方面データ（京都・高槻）に基づく始発駅比率
                    if (type === "新快速") return [{n:"野洲",w:25}, {n:"米原",w:25}, {n:"長浜",w:12}, {n:"敦賀",w:23}, {n:"近江今津",w:15}];
                    if (type === "快速") return [{n:"京都",w:59}, {n:"米原",w:12}, {n:"野洲",w:12}, {n:"草津",w:17}];
                    // ★事象②改善: 京都方面からの普通を増やし、高槻始発も増やす
                    if (type === "普通") return [{n:"京都",w:50}, {n:"草津",w:25}, {n:"高槻",w:25}];
                    if (type === "特急") return [{n:"敦賀",w:34}, {n:"米原",w:33}, {n:"京都",w:33}];
                } else { 
                    // ★修正: 姫路駅での快速・新快速の生成比率を少し下げる
                    /* ★播州赤穂・上郡には留置場が無いので、そこを始発にすると
                       網干の編成がそこへ瞬間移動することになる。
                       播州赤穂・上郡発の上りは、下りの折り返しで成り立たせる。 */
                    if (type === "新快速") return [{n:"姫路",w:50}, {n:"網干",w:50}];
                    /* ★網干が線路図の中の駅になったので、網干始発を減らした
                       (網干〜姫路は複線で、網干の上り本線は1線しかない)。 */
                    if (type === "快速") return [{n:"網干",w:30}, {n:"加古川",w:40}, {n:"姫路",w:30}];
                    // ★事象②改善: 大阪・尼崎発の普通を増やし、大阪以東(京都方面)へ向かう列車の総数を増やす
                    /* ★京都始発の琵琶湖線の普通 (野洲・米原・草津行き) を足した。JR京都線の 207系・321系は
                         京都で折り返す (京都より東の運用を持たない) ので、琵琶湖線は京都の 223系・225系が受け持つ。 */
                    if (type === "普通") return [{n:"西明石",w:25}, {n:"新三田",w:23}, {n:"大阪",w:15}, {n:"尼崎",w:10}, {n:"須磨",w:17}, {n:"宝塚",w:9}, {n:"神戸",w:1}, {n:"京都",w:22}];
                    if (type === "特急") return [{n:"姫路",w:100}];
                }
                return [{n:"姫路",w:100}];
            };
            let options = forcedStart ? [{n: forcedStart, w: 1}] : getStartOptions();
            let totalW = 0;
            options.forEach(o => {
                o.w *= this.getTimeMultiplier(o.n, type, dir, true, this.game.currentTime);
                totalW += o.w;
            });
            for(let i=0; i<5; i++) {
                let r = Math.random() * totalW, s = 0;
                for(let o of options) {
                    s += o.w;
                    if(r < s) { candidates.push(o.n); break; }
                }
            }
        }
        if (candidates.length === 0) return false;

        /* 始発駅でその列車を出せるかの判定。

           ★以前は「同じ種別の列車が前後2駅以内に2本以上いたら出さない」
             という大まかな見方だった。線路が少し混むとこの条件に引っかかり、
             種別に関係なく生成がほとんど止まってしまう。
             そのため昼間は時刻表どおりの本数が出せず、
             残った列車の折り返しだけで走る状態になっていた。
             (快速・新快速はほぼ0本、普通ばかりという偏りの原因)

           いまは実際の駅と同じ物理的な条件で見る。
             ① その駅の着発線 (ホーム) が空いているか
             ② 進行方向のすぐ先の閉塞が空いているか (続行間隔)
           どちらも「実際に線路がふさがっているか」なので、
           混雑しているときは自然に発車が抑えられ、
           空いていれば時刻表どおりに出る。 */
        const headwayBlocks = (type === "新快速" || type === "特急") ? 3 : 2;
        let availableCandidates = [];
        for (let stName of candidates) {
            /* 貨物ターミナルの着発線から出る列車 (js/34-freight-terminals.js)。
               その向きの着発線に空きがあり、出ていく本線のすぐ先が空いていること。 */
            if (FREIGHT_TERMINALS[stName]) {
                const ft = FREIGHT_TERMINALS[stName];
                const fb = (this.game.trackMgr.blocks[freightTerminalTrack(stName, dir)] || [])[ft.pos];
                if (!fb || freightTerminalLaneFor(fb, "depart") < 0) continue;
                const exitTid = (dir === 1 ? ft.exits.up : ft.exits.down)[0];
                const eb = this.game.trackMgr.blocks[exitTid] || [];
                let clear = true;
                for (let k = 1; k <= headwayBlocks; k++) {
                    const b = eb[ft.pos + dir * k];
                    if (!b || b.x === -1000) break;
                    if (b.lanes.some(l => l !== null)) { clear = false; break; }
                }
                if (clear) availableCandidates.push(stName);
                continue;
            }
            let checkTrackId = trackId;
            /* ★物理的に列車が現れる駅で判定する。
               始発駅の候補には「網干」「播州赤穂」「上郡」のように
               線路図の外にある駅が入っていて、これらは STATION_MAP に無い。
               以前はそこで判定をまるごと飛ばし、無条件に生成していたため、
               実際には全部が姫路の電留線から出るのに、姫路の着発線の空きも
               続行間隔もまったく見ずに何本も湧いていた。
               これが西明石のまわりで新快速が続けて3本並ぶ主な原因だった。
               Train.initPosition() と同じ読み替えを使う。 */
            let physName = stName;   // 姫路より西・学研都市線も線路図に入ったので読み替えは要らない
            // 新快速の枠の時刻が来ているあいだは、その駅から同じ向きにほかの列車を出さない
            if (type !== "新快速" && this.skHeld(stName, dir)) { this.noteSpawnFail(type, dir, stName, "新快速待ち"); continue; }

            if (["姫路","加古川"].includes(physName)) checkTrackId = checkTrackId.replace("In", "Out");
            const blks = this.game.trackMgr.blocks[checkTrackId];
            const stIdx = STATION_MAP[physName];
            if (!blks || stIdx === undefined) { availableCandidates.push(stName); continue; }

            const startBlk = blks.find(b => b.stationIdx === stIdx && b.x !== -1000);
            if (!startBlk) { availableCandidates.push(stName); continue; }

            // ① 着発線の空き
            if (!startBlk.lanes.some(l => l === null)) { this.noteSpawnFail(type, dir, stName, "着発線"); continue; }

            // ② 進行方向のすぐ先が空いているか
            let clear = true;
            for (let k = 1; k <= headwayBlocks; k++) {
                const idx = startBlk.index + dir * k;
                if (idx < 0 || idx >= blks.length) break;
                const b = blks[idx];
                if (b.x === -1000) break;
                if (b.lanes.some(l => l !== null)) { clear = false; break; }
            }
            /* 新快速の枠 (forcedStart) は、着発線が空いていれば出して、そこで信号を待つ
               (実際の始発列車と同じ)。先の閉塞で止めると、通過列車の多い野洲・姫路では
               枠の半分以上が出せずに捨てられていた。 */
            if (!clear && !forcedStart) { this.noteSpawnFail(type, dir, stName, "続行"); continue; }

            /* ③ 同じ種別が近くを走っていないか (団子を作らない)。
               実際の続行間隔 (新快速 約7.5分 = 約4駅) より内側にとる。
               詳しくは js/16-train-adjust.js の「団子を作らない」を参照。 */
            const gap = forcedStart ? 1.5 : CONVOY_SPAWN_GAP[type];
            if (gap !== undefined) {
                const n = countSameTypeAhead(this.game, checkTrackId, startBlk.index,
                                             dir, type, gap, null);
                if (n > 0) { this.noteSpawnFail(type, dir, stName, "同種別"); continue; }
            }
            availableCandidates.push(stName);
        }

        if (availableCandidates.length === 0) return false;
        let startName = availableCandidates[Math.floor(Math.random() * availableCandidates.length)];

        if (type === "貨物") {
            if (FREIGHT_TERMINALS[startName]) {
                trackId = freightTerminalTrack(startName, dir);
            } else if (startName === "吹田貨") {
                trackId = (dir === 1) ? "Up_Hoppo" : "Down_Hoppo";
            } else if (startName === "敦賀" && dir === -1) {
                trackId = "Kosei_Down";
            }
        }

        /* ★ここには以前、生成を抑えるための「決め打ちの間引き」が3つ入っていた。
             ・姫路以西発の上り快速を4割の確率で捨てる
             ・姫路〜西明石に上り列車が10本以上いたら生成しない
             ・西明石の上り線の空き番線が2本未満なら生成しない
           どれも実際の線路の都合ではなく本数を減らすための細工で、
           時刻表どおりの本数 (姫路〜西明石は上り13本/時) を出すと
           必ず引っかかるため、快速・新快速がほとんど生成されなかった。

           混雑しているときに発車を抑えるのは、上で見ている
             ・着発線 (ホーム) が空いているか
             ・進行方向のすぐ先の閉塞が空いているか
           という実際の線路の条件で足りる。混んでいれば自然に出られない。

           西明石始発は普通と快速だけ、という点は実際のとおりなので残す。 */
        if (startName === "西明石" && type !== "普通" && type !== "快速") return false;

        if (startName === "京都" && dir === -1 && Math.random() < 0.05 && (type==="回送")) startName = "向日町操";
        if (["姫路","加古川"].includes(startName)) trackId = trackId.replace("In", "Out");

        // ★修正: STARTERSではなく全駅のインデックスを取得して正しく草津以北判定を行う
        let startStIdx = STATION_MAP[startName];
        if (startStIdx !== undefined && startStIdx > STATION_MAP["草津"]) {
            trackId = trackId.replace("In", "Out");
        }

        let startBlk = null;
        let blks = this.game.trackMgr.blocks[trackId];
        const startFt = FREIGHT_TERMINALS[startName];
        if (blks && startFt) {
            // 着発線のブロック。前方の貨物列車は、出ていく本線で見る
            startBlk = blks[startFt.pos];
            blks = this.game.trackMgr.blocks[(dir === 1 ? startFt.exits.up : startFt.exits.down)[0]] || blks;
        } else if (blks) {
            if (startStIdx !== undefined) {
                startBlk = blks.find(b => b.stationIdx === startStIdx);
            } else {
                startBlk = blks.find(b => b.hoppoStationName === startName);
            }
        }

        if (startBlk) {
            if (type === "貨物") {
                let freightAheadDist = -1;
                for (let k = 1; k <= 16 * UNITS_PER_STATION; k++) {
                    let idx = startBlk.index + (dir * k);
                    if (idx >= 0 && idx < blks.length) {
                        if (blks[idx].lanes.some(l => l !== null && l.type === "貨物" && l.dir === dir)) {
                            freightAheadDist = k;
                            break;
                        }
                    }
                }
                if (freightAheadDist !== -1 && freightAheadDist < 3 * UNITS_PER_STATION) {
                    return false;
                }
            }

            if (startStIdx !== undefined) {
                // ① 昼間の閑散時間帯でも本数を確保するため、普通列車の干渉チェック距離を「2.5駅(約8ブロック)」に短縮
                let scanDist = (type === "普通") ? Math.ceil(UNITS_PER_STATION * 2.5) : 6;
                if (type === "特急") scanDist = 12;
                if (forcedStart) scanDist = 0;       // 新快速の枠: 上の「着発線が空いているか」だけで出す
                
                // ① 前方列車のチェック（既存の被り防止）
                for(let k=1; k<=scanDist; k++) {
                    let idx = startBlk.index + (dir * k);
                    if(idx >= 0 && idx < blks.length && blks[idx].lanes.some(l => l !== null)) { this.noteSpawnFail(type, dir, startName, "前方"); return false; }
                }
                
                // ② 追加：満線回避ロジック（後方から優等列車が接近している場合は生成キャンセル）
                let freeLanes = startBlk.lanes.filter(l => l === null).length;
                if (freeLanes <= 1) { // 自分が生成されると空きがなくなる場合
                    let approachingHigher = false;
                    let checkDistBehind = UNITS_PER_STATION * 2 + 2; // 後方約2駅分
                    for (let k = 1; k <= checkDistBehind; k++) {
                        let idx = startBlk.index - (dir * k);
                        if (idx >= 0 && idx < blks.length) {
                            let trainsBehind = blks[idx].lanes.filter(l => l !== null && l.dir === dir);
                            if (trainsBehind.some(tb => PRIORITY[tb.type] > PRIORITY[type])) {
                                approachingHigher = true;
                                break;
                            }
                        }
                    }
                    if (approachingHigher) { this.noteSpawnFail(type, dir, startName, "後続優等"); return false; }
                }
            }
        }

        // ★変更: 目的地を事前に決定し、折り返し先の状況を確認できるようにする
        const dest = plan ? plan.leg.dest : this.getDestination(type, dir, startName);
        
        // ★追加：目的地決定後、尼崎合流地点での高度なETA干渉チェック（東西・福知山線との予測譲り合い）
        if (this.willConflictAtAmagasaki(startName, dest, type, dir)) {
            this.noteSpawnFail(type, dir, startName, "尼崎");
            return false; // 被る場合は生成をスキップして次回のインターバルへ回す
        }

        const t = { type, dir, trackId, dest: dest, startName };
        if (plan) t.name = plan.leg.no;
        if (forcedStart && this.skPendingTarget) {
            t.skTarget = this.skPendingTarget.t;
            t.skOrigin = this.skPendingTarget.origin;
            t.skBorn = this.skPendingTarget.spawnAt;
        }
        
        if (type === "貨物" || type === "回送") {
            t.nextAction = "depot"; // 貨物と回送は折り返さず必ず消滅させる
        } else {
            let h = (this.game.currentTime / 3600) % 24;
            if (h >= 10 && h < 17) {
                // ★改善②: ランダム確率ではなく、折り返し先の局所的な列車密度や詰まり状況に基づいて入庫(消滅)を動的判定
                t.nextAction = "turnback"; // デフォルトは折り返し
                
                let destIdx = STATION_MAP[dest];
                if (destIdx !== undefined) {
                    let newDir = dir * -1;
                    // 折り返し後の予想トラックID（単純にUpとDownを反転）
                    let newTrackId = trackId.includes("Up") ? trackId.replace("Up", "Down") : trackId.replace("Down", "Up");
                    
                    let targetBlks = this.game.trackMgr.blocks[newTrackId];
                    if (targetBlks) {
                        let destBlk = targetBlks.find(b => b.stationIdx === destIdx);
                        if (destBlk) {
                            // 基準間隔（ブロック数）の定義
                            // 普通: 2.5駅分, 快速・新快速: 5.5駅分
                            let checkStations = (type === "普通") ? 2.5 : 5.5;
                            let checkDist = Math.ceil(UNITS_PER_STATION * checkStations);
                            
                            let trainCount = 0;
                            let hasStuckTrain = false;

                            // 目的地から折り返し方向へスキャン
                            for (let k = 0; k <= checkDist; k++) {
                                let idx = destBlk.index + (newDir * k);
                                if (idx >= 0 && idx < targetBlks.length) {
                                    for (let l of targetBlks[idx].lanes) {
                                        if (l !== null && l.dir === newDir && l.type === type) { 
                                            trainCount++;
                                            // 60秒以上スタックしている列車がいれば「これから詰まる可能性」として検知
                                            if (l.stuckTime > 60) hasStuckTrain = true;
                                        }
                                    }
                                }
                            }

                            // 判定: 指定範囲内に同種別の列車が2本以上いる（密度が高い）、
                            // または、スタックしている列車が1本でもいる（局所的な詰まり）場合は消滅させる
                            if (trainCount >= 2 || hasStuckTrain) {
                                t.nextAction = "depot";
                            }
                        }
                    }
                }
            }
        }
        const ok = this.game.addTrain(t);
        if(ok && type === "快速") this.lastRapidStart[dir === 1 ? "Up" : "Down"] = startName;
        return ok;
};

/**
 * 貨物ターミナルから出る (または折り返す) 貨物列車の行先。
 * 進む向きの先にある貨物駅と、線路図の外の貨物駅から選ぶ。
 */
Spawner.prototype.freightDestFrom = function (stName, dir) {
    // 貨物ターミナルは着発線の位置 (駅と駅のあいだ) で前後を比べる
    const posOf = (n) => FREIGHT_TERMINALS[n] ? FREIGHT_TERMINALS[n].pos / UNITS_PER_STATION
                       : (n === "吹田貨" ? STATION_MAP["吹田"] : STATION_MAP[n]);
    const here = posOf(stName);
    const ahead = [];
    for (const k in FREIGHT_TERMINALS) {
        if (k === stName) continue;
        const i = posOf(k);
        if (here !== undefined && i !== undefined && (i - here) * dir > 0) ahead.push({ d: k, w: 12 });
    }
    const beyond = (dir === 1)
        ? [{ d: "東京タ", w: 30 }, { d: "名古屋タ", w: 20 }, { d: "富山タ", w: 12 }]
        : [{ d: "福岡タ", w: 30 }, { d: "広島タ", w: 20 }, { d: "岡山タ", w: 14 }, { d: "高松タ", w: 8 }];
    return this.weightedRandom(ahead.concat(beyond));
};

Spawner.prototype.getDestination = function (type, dir, startName, trackId) {
        if (type === "貨物") {
            if (dir === 1) {
                if (startName === "吹田タ" || startName === "吹田貨") {
                    const dests = [
                        {d: "東京タ", w: 50},
                        {d: "名古屋タ", w: 30},
                        {d: "富山タ", w: 20}
                    ];
                    return this.weightedRandom(dests);
                } else {
                    const dests = [
                        {d: "東京タ", w: 30},
                        {d: "大阪タ", w: 10},
                        {d: "吹田タ", w: 14},
                        {d: "百済タ", w: 10},
                        {d: "名古屋タ", w: 20},
                        {d: "富山タ", w: 15},
                        {d: "神戸タ", w: 8},
                        {d: "京都タ", w: 6}
                    ];
                    // 姫路タより西から出る列車だけ、姫路タ・神戸タを行先にできる
                    if (startName === "姫路タ") dests.push({d: "京都タ", w: 6});
                    return this.weightedRandom(dests.filter(o => {
                        const s = freightTerminalStation(o.d);
                        if (!s) return true;
                        if (s === startName) return false;
                        const i = STATION_MAP[s];
                        const h = STATION_MAP[startName];
                        return h === undefined || i === undefined || i > h;
                    }));
                }
            } else {
                if (startName === "敦賀") {
                    return Math.random() < 0.5 ? "吹田タ" : "百済タ";
                } else if (startName === "吹田タ" || startName === "吹田貨") {
                    const dests = [
                        {d: "福岡タ", w: 40},
                        {d: "広島タ", w: 30},
                        {d: "岡山タ", w: 20},
                        {d: "高松タ", w: 10}
                    ];
                    return this.weightedRandom(dests);
                } else {
                    const dests = [
                        {d: "福岡タ", w: 20},
                        {d: "広島タ", w: 15},
                        {d: "岡山タ", w: 15},
                        {d: "高松タ", w: 10},
                        {d: "百済タ", w: 10},
                        {d: "安治川タ", w: 10},
                        {d: "吹田タ", w: 14},
                        {d: "京都タ", w: 6},
                        {d: "神戸タ", w: 8},
                        {d: "姫路タ", w: 6}
                    ];
                    return this.weightedRandom(dests);
                }
            }
        }
        if (type === "特急") return (dir === 1) ? "敦賀" : "鳥取";
        if (type === "回送") return (dir === 1) ? "向日町操" : "網干";
        
        const koseiStations = ["大津京", "比叡山坂本", "おごと温泉", "堅田", "小野", "和邇", "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        
        // ★修正: 湖西線内の普通列車は京都行きに固定
        if (type === "普通" && dir === -1 && koseiStations.includes(startName)) return "京都";

        /* ★学研都市線・JR東西線の中から出る下り列車 (木津・同志社前・松井山手などで
           折り返した列車)。尼崎から JR宝塚線・JR神戸線へ直通する。
           放出始発の列車と同じ行先の割合にする
           (js/09-spawner-branch.js の「放出発 下り」)。
           以前は学研都市線が線路図の外で、下り列車は放出から出していたので、
           折り返した列車がこの行先の割合を使うことは無かった。 */
        if (dir === -1 && (TOZAI_PLACES.indexOf(startName) >= 0 || (trackId || "").indexOf("Tozai") === 0)) {
            let d;
            if (type === "快速") {
                const hh = (this.game.currentTime / 3600) % 24;
                const outer = ["京田辺", "同志社前", "木津"].indexOf(startName) >= 0;
                if (outer && hh >= 9.0 && hh < 15.0) {
                    // ★添付の同志社前駅の時刻表: 昼間の同志社前・木津発は区間快速の塚口行き
                    d = "塚口";
                } else {
                    d = (hh < 10.0 || hh >= 15.0)
                        ? this.weightedRandom([{d:"新三田",w:55}, {d:"宝塚",w:30}, {d:"篠山口",w:10}, {d:"塚口",w:5}])
                        : this.nextTozaiRapidDest;
                    if (d === this.nextTozaiRapidDest) this.nextTozaiRapidDest = (d === "新三田") ? "塚口" : "新三田";
                }
            } else {
                d = this.weightedRandom([{d:"西明石",w:40}, {d:"宝塚方面",w:30}, {d:"尼崎",w:14}, {d:"須磨",w:12}, {d:"甲子園口",w:2}]);
                if (d === "宝塚方面") {
                    d = this.nextFukuchiLocalDest;
                    this.nextFukuchiLocalDest = (d === "新三田") ? "宝塚" : "新三田";
                }
            }
            return this.sanitizeDestination(d, dir, startName, type, trackId);
        }

        /* ★姫路より西の普通 (添付の時刻表 網干・上郡・播州赤穂・姫路下り 2026-03-14 改正)。
             上り … 上郡発は昼間ほぼ相生止まり (相生〜上郡の折り返し)、夕方以降は姫路行き。
                    播州赤穂発・網干発は姫路行きが中心で、朝夕に西明石から快速になる直通がある。
             下り … 姫路で折り返す普通は網干行きが中心で、播州赤穂行きが毎時1本ほど、
                    上郡行きは少ない。相生で折り返す列車は上郡行き。
           以前は上郡・播州赤穂で折り返した普通が、そのまま京都・学研都市線まで
           直通する行先を選んでいた (実際にはそのような普通は無い)。 */
        if (type === "普通" && routeLineOf(startName) !== "tozai") {
            const hh = (this.game.currentTime / 3600) % 24;
            const sIdx = STATION_MAP[startName];
            const westMain = sIdx !== undefined && sIdx < STATION_MAP["姫路"] && !/Kosei|Fukuchi|Tozai/.test(trackId || "");
            const onAko = AKO_PLACES.indexOf(startName) >= 0 || (trackId || "").indexOf("Ako") === 0;
            let opts = null;
            if (dir === 1 && startName === "上郡") {
                opts = (hh >= 8.5 && hh < 17.5) ? [{d:"相生",w:85}, {d:"姫路",w:15}]
                                                : [{d:"姫路",w:75}, {d:"相生",w:25}];
            } else if (dir === 1 && (onAko || westMain)) {
                opts = (hh < 8.0 || (hh >= 16.0 && hh < 20.0))
                    ? [{d:"姫路",w:75}, {d:"西明石",w:25}] : [{d:"姫路",w:100}];
            } else if (dir === -1 && startName === "相生") {
                opts = [{d:"上郡",w:100}];
            } else if (dir === -1 && (westMain || startName === "姫路") && !onAko) {
                opts = [{d:"網干",w:55}, {d:"播州赤穂",w:30}, {d:"上郡",w:10}, {d:"相生",w:5}];
                if (sIdx !== undefined && sIdx <= STATION_MAP["網干"]) opts = [{d:"上郡",w:50}, {d:"播州赤穂",w:50}];
            }
            if (opts) return this.sanitizeDestination(this.weightedRandom(opts), dir, startName, type, trackId);
        }

        const getDestOptions = () => {
            if (dir === -1) { 
                if (type === "新快速") {
                    /* ★姫路より西へ行く新快速は、時刻表では夕方以降 (17時〜) だけ。
                         昼間はすべて姫路止まり。 */
                    const hh = (this.game.currentTime / 3600) % 24;
                    if (hh >= 16.5 || hh < 4) return [{d:"姫路",w:45}, {d:"網干",w:25}, {d:"播州赤穂",w:25}, {d:"上郡",w:5}];
                    return [{d:"姫路",w:92}, {d:"網干",w:8}];
                }
                if (type === "快速") {
                    if (startName === "大阪") {     // ★丹波路快速は大阪始発だけ (高槻からは出さない。2026-10)
                        return [{d:"篠山口",w:90}, {d:"福知山",w:10}];
                    }
                    return [{d:"網干",w:50}, {d:"加古川",w:31}, {d:"姫路",w:19}];
                }
                if (type === "普通") {
                    let stIdx = STATION_MAP[startName];
                    /* ★高槻で折り返す下りの普通は、ほとんどが JR宝塚線の宝塚行き。
                         大阪駅の時刻表 (osaka4.pdf) では宝塚線の普通は :00 :15 :30 :45 の 4本/時で、
                         どれも「当駅始発」ではない (= 京都線から直通)。宝塚駅の時刻表
                         (takaraduka-tozai.pdf) でも昼間の上りの普通はすべて高槻行き。
                         京都始発の普通 4本/時 は JR神戸線の須磨方面へ行く (osaka3.pdf)。
                         以前は宝塚方面が3割しかなく、宝塚線の普通は尼崎始発で出していたので、
                         高槻〜尼崎の下りの普通が 実際 8本/時 に対して 4〜5本/時 しかなかった。 */
                    if (startName === "高槻") {
                        return [{d:"宝塚方面",w:75}, {d:"須磨",w:15}, {d:"西明石",w:10}];
                    } else if (stIdx !== undefined && stIdx <= STATION_MAP["尼崎"]) {
                        // ★修正: 尼崎以西で生成される下り列車(西へ向かう)が、東の駅(大阪・神戸等)を目指すと逆走バグで詰まるため削除
                        return [{d:"西明石",w:70}, {d:"須磨",w:30}];
                    } else {
                        // 尼崎より東から出発する下り列車。
                        // ★宝塚方面への直通は高槻以西の始発に限る。
                        //   琵琶湖線(草津・米原)から宝塚線へ直通する普通は実在しない。
                        /* ★実際の時刻表では、JR京都線の普通は毎時8本あるが、
                             そのまま神戸線へ直通して西明石まで行くのは毎時4本ほどで、
                             残りは大阪・尼崎止まりで折り返す。
                             以前は8割が西明石・須磨まで直通していたため、
                             大阪の下り普通が実際の3倍になっていた。 */
                        /* ★大阪・尼崎止まりの比率を下げ、神戸線へ直通する形に近づけた。
                             短い区間で折り返す列車が多いと、その列車が大阪付近を
                             何度も往復することになり、大阪の普通だけが
                             実際の1.5〜2倍の本数になっていた。
                             実際の JR京都線の普通は、多くが西明石・須磨まで
                             直通する長い運用になっている。 */
                        /* ★京都より東 (琵琶湖線) から来る下りの普通は、半分を京都止まりにする。
                             京都で折り返して琵琶湖線へ戻る編成が無いと、網干の 223系・225系が
                             JR神戸線へ流れ出たままになり、京都〜野洲の普通が薄くなった
                             (明石の 207系・321系は京都より東の運用を持たないので、代わりにならない)。 */
                        /* ★京都止まりは、添付の草津駅の時刻表 (京都・大阪方面) にある時間帯だけにする
                             (5時台・8時台・17〜18時台・20時台後半・23時台。1日9本ほど)。
                             ほかの時間の琵琶湖線の普通は高槻・西明石方面へ直通する
                             (時刻表の ▼京都から快速・●高槻から快速 の列車)。
                             以前は一日じゅう半分を京都止まりにしていた (利用者の指摘 3.)。 */
                        if (stIdx !== undefined && stIdx > STATION_MAP["京都"]) {
                            const hk = (this.game.currentTime / 3600) % 24;
                            const kyotoTerm = (hk < 6.0) || (hk >= 7.9 && hk < 8.6) || (hk >= 17.5 && hk < 18.2) ||
                                              (hk >= 20.6 && hk < 21.0) || (hk >= 23.3 || hk < 4.0);
                            if (kyotoTerm) return [{d:"京都",w:60}, {d:"高槻",w:15}, {d:"西明石",w:25}];
                            /* ★高槻止まり・大阪止まりを減らした。高槻〜京都の普通は 上下とも 4本/時 (osaka1.pdf の
                                 京都行き)。高槻で折り返して京都へ戻る列車が多いと、高槻〜京都だけが 6本/時 になっていた。 */
                            return [{d:"高槻",w:10}, {d:"西明石",w:50}, {d:"須磨",w:35}, {d:"大阪",w:5}];
                        }
                        /* ★大阪・尼崎止まりを減らした。大阪駅の時刻表 (osaka3.pdf) では、昼間に京都線から来る
                             下りの普通はすべて須磨行き・宝塚行きで、大阪止まりは無い。
                             大阪止まりは宮原へ回送して方転するぶん、高槻〜大阪の下りの普通が抜けていた。 */
                        if (stIdx !== undefined && stIdx > STATION_MAP["高槻"]) {
                            return [{d:"西明石",w:42}, {d:"須磨",w:35}, {d:"大阪",w:6},
                                    {d:"神戸",w:12}, {d:"尼崎",w:5}];
                        }
                        return [{d:"西明石",w:30}, {d:"須磨",w:20}, {d:"大阪",w:6},
                                {d:"宝塚方面",w:30}, {d:"神戸",w:8}, {d:"尼崎",w:5},
                                {d:"甲子園口",w:1}];
                    }
                }
            } else {
                if (type === "新快速") {
                    if (koseiStations.includes(startName)) return [{d:"敦賀",w:91}, {d:"近江今津",w:9}];
                    return [{d:"野洲",w:25}, {d:"米原",w:25}, {d:"長浜",w:12}, {d:"敦賀",w:23}, {d:"近江今津",w:15}];
                }
                /* ★JR宝塚線から上る快速 (新三田・宝塚・塚口で折り返した列車)。
                     丹波路快速は大阪止まり、JR東西線へ入る快速は学研都市線の同志社前・木津 (と松井山手) へ行く。
                     以前はこの場合分けが無く、下の本線の上り快速の表 (米原・野洲・京都・高槻) から選んでいたので、
                     「JR宝塚線の快速 京都行き」が走っていた (利用者の指摘 3.)。
                     塚口で折り返すのは学研都市線から来た区間快速なので、学研都市線へ戻る。 */
                if (type === "快速" && (stationBranchLine(startName) === "fukuchi" || /^Fukuchi/.test(trackId || ""))) {
                    if (startName === "塚口") return [{d:"同志社前",w:3}, {d:"木津",w:1}];
                    return [{d:"大阪",w:34}, {d:"同志社前",w:24}, {d:"木津",w:8}, {d:"松井山手",w:2}];
                }
                if (type === "快速") {
                    if (startName === "高槻") return [{d:"米原",w:20}, {d:"野洲",w:20}, {d:"京都",w:40}, {d:"草津",w:20}];
                    /* ★草津止まりを減らした (大阪駅の時刻表: 上りの快速は野洲・米原行きが中心)。
                         以前は、草津止まりの列車の多くが草津で終わらずに外側線へ移されて野洲方へ走っていた
                         (直した)。そのぶん草津〜野洲が空かないよう、行先の割合を時刻表に寄せる。 */
                    return [{d:"米原",w:24}, {d:"野洲",w:25}, {d:"京都",w:37}, {d:"高槻",w:10}, {d:"草津",w:4}];
                }
                if (type === "普通") {
                    if (koseiStations.includes(startName)) return [{d:"近江今津",w:91}, {d:"永原",w:9}];
                    let stIdx = STATION_MAP[startName];
                    if (startName === "京都") return [{d:"野洲",w:55}, {d:"米原",w:32}, {d:"草津",w:13}];
                    /* ★大阪を通る上りの普通の行先は 高槻・京都 だけ (大阪駅の時刻表 osaka1.pdf の
                         普通は「無印=高槻」と「京」のみ)。草津行きは少なくした。
                         高槻行きは宝塚線から来る普通 (宝塚 :08 → 大阪 :32 → 高槻)、
                         JR神戸線から来る普通は京都行き (須磨方面 ⇔ 京都) が基本。
                         ただし宝塚線へ直通できるのは 223系・225系だけ (編成の運用規則) なので、
                         明石の 207系・321系の普通も高槻で折り返して、高槻〜大阪の 8本/時 を埋める。 */
                    if ((stIdx !== undefined && stIdx >= STATION_MAP["尼崎"]) || ["新三田", "宝塚"].includes(startName)) {
                        if (startName === "高槻") return [{d:"京都",w:70}, {d:"草津",w:30}];
                        return [{d:"高槻",w:45}, {d:"京都",w:50}, {d:"草津",w:5}];
                    }

                    let options = [{d:"松井山手",w:20}, {d:"四条畷",w:15}, {d:"同志社前",w:5}, {d:"高槻",w:27}, {d:"京都",w:30}, {d:"草津",w:3}];
                    
                    // ★追加: 尼崎到着時の3連続被り防止ロジック
                    let recentDests = this.getAmagasakiRecentDestinations(startName, dir, type);
                    if (recentDests.length === 2) {
                        if (recentDests[0] === "Tozai" && recentDests[1] === "Tozai") {
                            options = [{d:"高槻",w:45}, {d:"京都",w:50}, {d:"草津",w:5}]; // 東西線2連続なら本線へ
                        } else if (recentDests[0] === "Honsen" && recentDests[1] === "Honsen") {
                            options = [{d:"松井山手",w:50}, {d:"四条畷",w:40}, {d:"同志社前",w:10}]; // 本線2連続なら東西線へ
                        }
                    } else if (startName === "須磨") {
                        // 尼崎ロジックで確定しなかった場合、須磨独自の交互調整ロジックを適用
                        let tozaiCount = 0;
                        let honsenCount = 0;
                        const tozaiDests = TOZAI_THROUGH_DESTS;
                        
                        let myBlks = this.game.trackMgr.blocks["Up_In"];
                        if (myBlks) {
                            let sumaBlk = myBlks.find(b => b.stationIdx === STATION_MAP["須磨"]);
                            if (sumaBlk) {
                                let checkRange = 18; // 前後約6駅分を探索
                                for (let k = -checkRange; k <= checkRange; k++) {
                                    if (k === 0) continue;
                                    let idx = sumaBlk.index + k;
                                    if (idx >= 0 && idx < myBlks.length) {
                                        for (let l of myBlks[idx].lanes) {
                                            if (l && l.dir === 1 && l.type === "普通") {
                                                if (tozaiDests.includes(l.dest)) tozaiCount++;
                                                else honsenCount++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 周辺列車の割合を比較し、少ない方の行き先グループを確定的に選ぶ
                        if (tozaiCount > honsenCount) {
                            options = [{d:"高槻",w:45}, {d:"京都",w:50}, {d:"草津",w:5}]; // 本線方面
                        } else if (honsenCount > tozaiCount) {
                            options = [{d:"松井山手",w:50}, {d:"四条畷",w:40}, {d:"同志社前",w:10}]; // 東西線方面
                        }
                    }

                    return options;
                }
            }
            return [{d:"西明石",w:100}];
        };

        let ops = getDestOptions();
        let totalW = 0;
        let ct = this.game.currentTime;
        
        // 時間帯補正の適用
        ops.forEach(o => {
            o.w *= this.getTimeMultiplier(o.d, type, dir, false, ct);
            totalW += o.w;
        });

        let dest = ops[0].d;
        let r = Math.random() * totalW, s = 0;
        for(let o of ops) { 
            s += o.w; 
            if(r < s) { dest = o.d; break; } 
        }

        // 行き先が「宝塚方面」に決まった場合はフラグを参照して新三田と宝塚を交互に割り当てる
        if (dest === "宝塚方面") {
            dest = this.nextFukuchiLocalDest;
            this.nextFukuchiLocalDest = (this.nextFukuchiLocalDest === "新三田") ? "宝塚" : "新三田";
        }

        // ★進行方向の後ろにある駅が行先に選ばれていないか確かめる。
        //   例: 草津で上りに折り返した列車に「京都行き」が割り当てられると、
        //       京都は後方にあるため永久にたどり着けず、米原方向へ走り続けていた。
        dest = this.sanitizeDestination(dest, dir, startName, type, trackId);

        let h = (ct / 3600) % 24;
        // ★改善: 22:00以降の終電間際における段階的な行き先短縮ロジック
        /* ★本線の中の行程だけ。分岐線の駅も本線と同じインデックスの並びを
           使っているので、本線の終着駅の表で選ぶと別の線区の駅になる。 */
        const mainTrip = routeLineOf(startName) === "main" && routeLineOf(dest) === "main" &&
                         !/Kosei|Fukuchi|Tozai|Ako|Hoppo/.test(trackId || "");
        if ((h >= 22.0 || h < 4.0) && mainTrip) {
            let startIdx = STATION_MAP[startName];
            if (startIdx !== undefined) {
                if (dir === -1) {
                    if (h >= 23.0 || h < 4.0) {
                        // 23時以降: 近くの主要駅を終点にする
                        const downTerminals = ["京都", "高槻", "大阪", "尼崎", "西明石", "姫路"];
                        let nextTerm = downTerminals.find(t => STATION_MAP[t] < startIdx);
                        if (nextTerm) dest = nextTerm;
                    } else {
                        // 22時台
                        if (startIdx > STATION_MAP["大阪"] && STATION_MAP[dest] < STATION_MAP["大阪"]) {
                            dest = "大阪";
                        } else if (STATION_MAP[dest] < STATION_MAP["西明石"]) {
                            dest = "西明石"; // 遠くても西明石まで
                        }
                    }
                } else {
                    if (h >= 23.0 || h < 4.0) {
                        // 23時以降: 近くの主要駅を終点にする
                        const upTerminals = ["神戸", "尼崎", "大阪", "高槻", "京都", "野洲", "米原"];
                        let nextTerm = upTerminals.find(t => STATION_MAP[t] > startIdx);
                        if (nextTerm) dest = nextTerm;
                    } else {
                        // 22時台
                        if (startIdx < STATION_MAP["京都"] && STATION_MAP[dest] > STATION_MAP["京都"]) {
                            dest = "京都";
                        } else if (STATION_MAP[dest] > STATION_MAP["野洲"]) {
                            dest = "野洲"; // 遠くても野洲まで
                        }
                    }
                }
            }
        }
        return dest;
};

/**
 * 行先が進行方向の前方にあるかを確かめ、後方だったら手前の妥当な終着駅に直す。
 *
 * この判定が要る理由:
 *   折り返しのたびに getDestination() を呼び直しているが、
 *   もとの重み表は「その駅より先に行く列車」を前提に書かれている。
 *   そのため、例えば草津で上り(米原方面)へ折り返した列車に
 *   「京都行き」(= 後方) が割り当てられることがあった。
 *   その列車はいつまでも終点に着かず、敦賀まで走り抜けて消えていた。
 *
 * 分岐線(JR東西線・JR宝塚線)は本線と同じインデックス空間を共有しているので、
 * 行先の属する線区から進行方向を決める。
 */
Spawner.prototype.sanitizeDestination = function (dest, dir, startName, type, trackId) {
    if (!dest) return dest;

    /* --- 分岐線の行先は、走る向きも、分岐駅(尼崎)との位置関係も決まっている。
           JR東西線へは、尼崎より西から上り(dir=1)で来た列車か、
           すでに東西線内にいる列車しか入れない。
           JR宝塚線へは、尼崎より東から下り(dir=-1)で来た列車か、
           すでに宝塚線内にいる列車しか入れない。
           これを見ないと「草津発 放出行き」のように、
           物理的にたどり着けない行先が割り当てられていた。 */
    const amaIdx = STATION_MAP["尼崎"];
    const tid = trackId || "";
    const sIdx0 = STATION_MAP[startName];
    /* ★分岐線がこんでいるときは、本線からの直通を入れない。

       JR東西線の普通は目安 10本 (TT_ACTIVE_BUDGET) なのに、乱数の種に
       よっては実測で 24.7本 まで増えていた。分岐線の生成側には目安が
       あるが、本線の列車に「松井山手行き」などの行先を与える経路には
       無かったためである。京橋〜放出は鴫野が片方向1線しかないので
       すぐ飽和し、尼崎で本線と着発線を共有しているため、そこから
       尼崎 → 大阪 → 新大阪 → 高槻 と本線の下りまで止まっていた。
       すでに分岐線の中にいる列車は行先を変えない
       (その線区から抜けられなくなる)。 */
    const branchFull = (line) =>
        (typeof ttOverBudget === "function") &&
        ttOverBudget(this.game, line, type || "普通", 1.15);

    if (TOZAI_THROUGH_DESTS.includes(dest)) {
        // JR東西線へ直通するのは、西明石〜尼崎 の神戸線内から上ってきた列車。
        // 姫路など西明石より西からの直通は無い (207系/321系の走る範囲外)。
        const inTozai = TOZAI_PLACES.indexOf(startName) >= 0 || tid.indexOf("Tozai") === 0;
        /* ★学研都市線を線路図に入れたので、線区の中の列車は行先が
           どちら向きにもあり得る (木津発 京橋行き など)。線区の中の位置で前方かを見る。 */
        if (inTozai) {
            const dI = STATION_MAP[dest];
            if (dI !== undefined && sIdx0 !== undefined && (dI - sIdx0) * dir > 0) return dest;
            if (dI === undefined && dir === 1) return dest;          // 木津より先 (奈良など)
            return this.fallbackTerminal(dir, startName, trackId);
        }
        const okSide = (sIdx0 !== undefined && sIdx0 >= STATION_MAP["西明石"] && sIdx0 <= amaIdx);
        /* ★東西線へ入れない JR神戸線の上りの普通は、大阪を通って 高槻・京都 へ半分ずつ行く
             (大阪駅の時刻表 osaka1.pdf: 上りの普通は高槻行き 4本・京都行き 4本)。
             以前は fallbackTerminal の「前方の2番目」= 京都 に決まっていたので、東西線の目安が
             埋まっているあいだは JR神戸線の普通の7〜8割が京都行きになり、高槻〜京都の普通が
             実際の 4本/時 に対して 6本/時、高槻で折り返して下る普通が足りなかった。 */
        const kobeUp = () => (dir === 1 && okSide && Math.random() < 0.5)
            ? "高槻" : this.fallbackTerminal(dir, startName, trackId);
        if (branchFull("tozai")) return kobeUp();
        return (dir === 1 && okSide) ? dest : this.fallbackTerminal(dir, startName, trackId);
    }
    /* 赤穂線へ入るのは、相生より東から下ってきた列車。
       赤穂線の中の列車は、線区の中の位置で前方かを見る。 */
    if (AKO_THROUGH_DESTS.includes(dest)) {
        const inAko = AKO_PLACES.indexOf(startName) >= 0 || tid.indexOf("Ako") === 0;
        const dI = STATION_MAP[dest];
        if (inAko) {
            if (dI !== undefined && sIdx0 !== undefined && (dI - sIdx0) * dir > 0) return dest;
            return this.fallbackTerminal(dir, startName, trackId);
        }
        return (dir === -1 && sIdx0 !== undefined && sIdx0 > STATION_MAP["相生"])
            ? dest : this.fallbackTerminal(dir, startName, trackId);
    }
    if (FUKUCHI_THROUGH_DESTS.includes(dest)) {
        // JR宝塚線へ直通するのは、高槻〜尼崎 の京都線内から下ってきた列車。
        // 琵琶湖線(草津・米原)からの直通は無い。
        const inFuku = FUKUCHI_PLACES.indexOf(startName) >= 0 || tid.indexOf("Fukuchi") === 0;
        // JR東西線・学研都市線の中から下ってくる列車も尼崎で宝塚線へ直通できる
        const fromTozai = TOZAI_PLACES.indexOf(startName) >= 0 || tid.indexOf("Tozai") === 0;
        const okSide = inFuku || fromTozai ||
                       (sIdx0 !== undefined && sIdx0 >= amaIdx && sIdx0 <= STATION_MAP["高槻"]);
        if (!inFuku && branchFull("fukuchi")) return this.fallbackTerminal(dir, startName, trackId);
        return (dir === -1 && okSide) ? dest : this.fallbackTerminal(dir, startName, trackId);
    }

    // --- 貨物駅・操車場は本線のインデックスで測れないものがあるので触らない
    const destIdx = STATION_MAP[dest];
    const startIdx = STATION_MAP[startName];
    if (destIdx === undefined || startIdx === undefined) return dest;

    /* ★分岐線の中にいる列車が、本線の駅を行先にする場合。
       分岐線と本線は尼崎・山科でしかつながっていないので、
       その合流点より先の駅しか行先にできない。
       (例: 放出発の下り列車は尼崎で本線に入るので、
        行先は尼崎から西の駅に限られる。大阪は上り方向なので行けない) */
    const onTozai = (tid.indexOf("Tozai") === 0) || TOZAI_PLACES.indexOf(startName) >= 0;
    const onFukuchi = (tid.indexOf("Fukuchi") === 0) || FUKUCHI_PLACES.indexOf(startName) >= 0;
    const onKosei = (tid.indexOf("Kosei") === 0) || KOSEI_PLACES.indexOf(startName) >= 0;
    const onAko = (tid.indexOf("Ako") === 0) || AKO_PLACES.indexOf(startName) >= 0;
    if (onAko) {
        // 赤穂線から本線へは相生で上りに入る。行先は相生以東の本線の駅
        if (dir !== 1 || destIdx < STATION_MAP["相生"]) return this.fallbackTerminal(dir, startName, trackId);
        return dest;
    }
    if (onTozai) {
        if (dir !== -1 || destIdx > amaIdx) return this.fallbackTerminal(dir, startName, trackId);
        return dest;
    }
    if (onFukuchi) {
        if (dir !== 1 || destIdx < amaIdx) return this.fallbackTerminal(dir, startName, trackId);
        return dest;
    }
    if (onKosei) {
        const yamaIdx = STATION_MAP["山科"];
        if (dir === -1 && destIdx <= yamaIdx) return dest;
        if (dir === 1 && destIdx >= STATION_MAP["近江塩津"]) return dest;
        return this.fallbackTerminal(dir, startName, trackId);
    }

    // 前方(進行方向側)にあればそのまま
    if ((destIdx - startIdx) * dir > 0) return dest;
    /* 始発駅と同じ行先は、走り出した瞬間に到達できなくなるので使わない。
       (「西明石発 西明石行き」が上り線を走り続ける、という状態を防ぐ) */
    return this.fallbackTerminal(dir, startName, trackId);
};

/**
 * 進行方向の前方にある、いちばん近い主要な終着駅を返す。
 *
 * ★線区ごとに候補を変える。
 *   分岐線 (湖西線・JR宝塚線・JR東西線) は本線とインデックスを共有しているので、
 *   本線の駅名から選ぶと「道場発 須磨行き」のような、その線路では
 *   たどり着けない行先になってしまう。
 */
Spawner.prototype.fallbackTerminal = function (dir, startName, trackId) {
    const startIdx = STATION_MAP[startName];
    let list;
    const tid = trackId || "";
    if (tid.indexOf("Fukuchi") === 0 || FUKUCHI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["尼崎"] : ["宝塚", "新三田"];
    } else if (tid.indexOf("Tozai") === 0 || TOZAI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["京橋", "放出", "四条畷", "松井山手", "京田辺", "木津"] : ["京橋", "尼崎"];
    } else if (tid.indexOf("Ako") === 0 || AKO_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["相生", "網干", "姫路"] : ["播州赤穂"];
    } else if (tid.indexOf("Kosei") === 0 || KOSEI_PLACES.indexOf(startName) >= 0) {
        list = (dir === 1) ? ["近江今津", "永原"] : ["京都"];
    } else {
        // 本線。上り(米原方面) / 下り(姫路方面) の主要終着駅を近い順に。
        list = (dir === 1)
            ? ["高槻", "京都", "草津", "野洲", "米原", "長浜", "近江塩津", "敦賀"]
            : ["尼崎", "大阪", "神戸", "須磨", "西明石", "加古川", "姫路", "網干", "上郡"];
    }
    if (startIdx === undefined) return list[list.length - 1];
    const ahead = list
        .map(n => ({ n: n, i: STATION_MAP[n] }))
        .filter(o => o.i !== undefined && (o.i - startIdx) * dir > 0)
        .sort((a, b) => Math.abs(a.i - startIdx) - Math.abs(b.i - startIdx));
    if (ahead.length === 0) return list[list.length - 1];
    // 近すぎる駅ばかりにならないよう、前方の候補のうち2番目までから選ぶ
    return ahead[Math.min(1, ahead.length - 1)].n;
};
