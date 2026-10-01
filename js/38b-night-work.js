/* 車両の修繕の手配・決まった筋で走る事業用の列車・終電後の線路閉鎖 (2026-10 の10回目)

   ■ 1. 修繕の手配 (利用者の指摘 ④)
     故障で営業を打ち切った編成が、車両所に入ったとたん次の運用に入っていた。
     ・営業を打ち切るとき (js/26-incidents.js の後始末) に編成へ修繕の印 (v.repair) を付ける。
         重修繕 … 自力走行不能・台車・パンタグラフ・主回路・ブレーキなど走りに関わる故障
         軽修繕 … それ以外 (点検・機器の交換で直るもの)
     ・印の付いた編成は在庫に戻さず、修繕の置き場 (fleet.repairYard) に置く。どの運用にも入れない
       (js/06-fleet.js の satisfies)。
     ・軽修繕は 野洲・放出・木津・高槻・宮原操 で直す。重修繕は 吹田 (吹田総合車両所。明石・京都の車両) か
       網干 (網干総合車両所。網干・宮原の車両) でしか直せない。
     ・修繕できる所にいなければ、修繕のための回送を出す。自力で走れない編成 (重修繕のうち走りに関わるもの) は
       夜 (23:20〜0:40 に出発) の回送にする。ふつうに走れる編成は昼でも送る。
     ・直ったら、その場所の留置線へ待機編成として戻す。

   ■ 2. 決まった筋で走る事業用の列車 (利用者の指摘 ⑦。WORK_PATTERNS)
     利用者がまとめた筋 (文書: 上郡駅構内乗務員訓練・京都電車区ハンドル訓練・吹田出場試運転・
     近畿車輛出場公式試運転・網干出場試運転・東西線夜間訓練・宮原操余力確保の回送・後藤入場回送・EF65+12系) を
     そのまま時刻で持つ。毎日、組ごとの確率で走らせるかを抽選する (同じ機関車を使う組は同じ日に重ねない)。
     途中の長い停車 (訓練・待ち合わせ) は線路図の上では止めず、始発の時刻だけを守る。
     始発の時刻にその場所に機関車・編成がいなければ運転を取りやめる (瞬間移動しない)。

   ■ 3. 終電後の線路閉鎖 (利用者の指摘 ⑦)
     終電のあと、保線・電力・信号の作業のために指令が区間を閉鎖し、作業を承認する。
     ・毎晩、作業の候補から 4〜6件を選ぶ (軌道巡回・レール交換・分岐器更新・道床つき固め・架線点検・信号点検 …)。
     ・閉鎖してよいのは、その区間に列車がいなくて、手前から近づく列車 (事業用の列車を除く) も無いとき。
       近づく列車があれば「最終列車の通過待ち」として5分ごとに見直す。
     ・閉鎖した区間には、事業用の列車 (workPermit) しか入れない (js/05-track-manager.js の isSuspended)。
     ・作業は 3:50〜4:15 に終わり、閉鎖を解く (始発の前に必ず解く)。
     ・承認・解除は運転指令の記録 (業務連絡) に「線路閉鎖 第N号」として残す。 */

/* ================================================================== 1. 修繕 */

const REPAIR_MINOR_SHOPS = ["野洲", "放出", "木津", "高槻", "宮原操"];
/* 重修繕の工場。吹田総合車両所 (明石の207系・321系、京都支所の221系など)、網干総合車両所 (223系・225系) */
const REPAIR_MAJOR_SHOP = { AKASHI: "吹田", KYOTO: "吹田", ABOSHI: "網干", MIYAHARA: "網干" };
const REPAIR_HOURS = { minor: [2.5, 6], major: [20, 40] };

/** その故障で要る修繕 */
function repairLevelOf(type) {
    const n = (type && (type.name + " " + (type.cause || ""))) || "";
    const major = /自力走行不能|救援|台車|パンタグラフ|主回路|ブレーキ|床下/.test(n);
    const runnable = !/自力走行不能|救援|台車/.test(n);
    return { level: major ? "major" : "minor", runnable: runnable };
}

/** 営業を打ち切る列車の編成に、修繕の印を付ける (js/26-incidents.js から呼ぶ) */
OperationsManager.prototype.markForRepair = function (t, type) {
    if (!t || !t.vehicles || !t.vehicles.length) return;
    if (t.vehicles.some(v => v.isFreight || v.isExpress || v.workKey)) return;
    const r = repairLevelOf(type);
    const key = "rp" + Math.floor(this.game.currentTime) + "_" + Math.floor(Math.random() * 1e4);
    t.vehicles.forEach(v => {
        v.repair = { level: r.level, runnable: r.runnable, cause: type.name, since: this.game.currentTime,
                     state: "wait", key: key, at: null, to: null, until: 0 };
    });
    const ids = t.vehicles.map(v => v.fullId || v.id).join("+");
    this.game.ui.updateBanner(`【車両手配】${ids} は${type.name}のため${r.level === "major" ? "重修繕" : "軽修繕"}が要ります。` +
        `修繕が済むまで運用から外します。`, "banner-blue");
};

/** 在庫へ戻すかわりに修繕の置き場へ置く (js/06-fleet.js の release から呼ぶ) */
function fleetHoldForRepair(fleet, v, nearName) {
    fleet.repairYard = fleet.repairYard || [];
    const r = v.repair;
    // 修繕のための回送が工場に着いた
    const atShop = (n) => n && r.to && (n === r.to || (fleetIndexOf(n) !== null && fleetIndexOf(n) === fleetIndexOf(r.to) &&
        (stationBranchLine(n) || "main") === (stationBranchLine(r.to) || "main")));
    if (r.state === "transfer" && atShop(nearName)) {
        r.at = r.to; r.state = "arrived";
    } else {
        r.at = nearName || r.at;
        if (r.state === "transfer") r.state = "wait";     // 途中で打ち切られた。そこから手配し直す
    }
    v.at = r.at;
    if (fleet.repairYard.indexOf(v) < 0) fleet.repairYard.push(v);
}

/** 修繕できる場所か */
function repairShopFits(level, at, group) {
    if (level === "major") return at === REPAIR_MAJOR_SHOP[group];
    return REPAIR_MINOR_SHOPS.indexOf(at) >= 0 || at === REPAIR_MAJOR_SHOP[group];
}

/** 1分ごと: 修繕の始め・終わりと、修繕のための回送の手配 */
OperationsManager.prototype.checkRepairs = function (ct) {
    if (ct < (this.repairNext || 0)) return;
    this.repairNext = ct + 60;
    const g = this.game, fleet = g.fleet;
    const yard = fleet.repairYard;
    if (!yard || !yard.length) return;
    const a = ttAbsHour((ct / 3600) % 24);
    const groups = {};
    yard.forEach(v => { (groups[v.repair.key] = groups[v.repair.key] || []).push(v); });
    for (const key in groups) {
        const vs = groups[key];
        const r = vs[0].repair;
        const group = vs[0].group;
        // 修繕が済んだ → 待機編成へ
        if (r.state === "repair") {
            if (ct < r.until) continue;
            const at = r.at;
            vs.forEach(v => { yard.splice(yard.indexOf(v), 1); v.repair = null; });
            fleet.release(at, vs.slice());
            g.ui.updateBanner(`【車両手配】${vs.map(v => v.fullId || v.id).join("+")} は${at}で${r.level === "major" ? "重修繕" : "軽修繕"}を終え、` +
                              `待機に入りました。`, "banner-blue");
            continue;
        }
        // 修繕できる場所にいる → 修繕を始める
        if (r.state === "arrived" || (r.state === "wait" && repairShopFits(r.level, r.at, group))) {
            const hr = REPAIR_HOURS[r.level];
            const until = ct + (hr[0] + Math.random() * (hr[1] - hr[0])) * 3600;
            vs.forEach(v => { v.repair.state = "repair"; v.repair.until = until; });
            this.stats.repairStart = (this.stats.repairStart || 0) + 1;
            g.ui.updateBanner(`【車両手配】${vs.map(v => v.fullId || v.id).join("+")} は${r.at}で${r.level === "major" ? "重修繕" : "軽修繕"}に入りました ` +
                              `(${r.cause})。`, "banner-blue");
            continue;
        }
        if (r.state !== "wait") continue;
        // 修繕のための回送。走れない編成は夜だけ
        const night = a >= 23.33 && a < 24.67;
        const day = a >= 9.5 && a < 16.0;
        if (!(night || (r.runnable && day))) continue;
        if (ct < (r.retryAt || 0)) continue;
        const cands = r.level === "major" ? [REPAIR_MAJOR_SHOP[group], "吹田", "網干"]
            : REPAIR_MINOR_SHOPS.slice().sort((x, y) => Math.abs(fleetIndexOf(x) - fleetIndexOf(r.at)) - Math.abs(fleetIndexOf(y) - fleetIndexOf(r.at)));
        let sent = false;
        for (const to of cands) {
            if (!to || to === r.at) continue;
            const dir = this.dirFromTo(r.at, to);
            if (!dir) continue;
            if (DEPOTS[r.at] && !depotHasRoom(r.at)) continue;
            const no = this.deadheadNo();
            const cfg = { type: "回送", dir: dir, trackId: depotTrackId(r.at, dir, "回送"), dest: to, startName: r.at,
                          name: no, dutyName: no, vehicles: vs.slice(), nextAction: "remove" };
            vs.forEach(v => { v.repair.state = "transfer"; v.repair.to = to; });
            if (!g.addTrain(cfg)) { vs.forEach(v => { v.repair.state = "wait"; v.repair.to = null; }); continue; }
            vs.forEach(v => yard.splice(yard.indexOf(v), 1));
            sent = true;
            this.stats.repairMove = (this.stats.repairMove || 0) + 1;
            g.ui.updateBanner(`【車両手配】${vs.map(v => v.fullId || v.id).join("+")} を${r.level === "major" ? "重修繕" : "軽修繕"}のため ` +
                              `${r.at}から${to}へ ${no}(回送) で送ります${night && !r.runnable ? " (夜間の低速回送)" : ""}。`, "banner-blue");
            break;
        }
        if (!sent) {
            r.retryAt = ct + 900;
            // 送れる先が無いまま丸一日たったら、その場で修繕する (出張修繕)
            if (ct - r.since > 24 * 3600) vs.forEach(v => { v.repair.state = "arrived"; });
        }
    }
};

/* ================================================================== 2. 決まった筋の事業用列車 */

const _wt = (h, m) => h * 3600 + m * 60;
/* 組 (1日に走るかを1回抽選する単位)
     p     … その日に走る確率
     uses  … 使う機関車 (同じ機関車の組は同じ日に1つだけ)
     legs  … 区間 { no, from, dest, at (始発の時刻), dir, hoppo, track, loco, cars, stock, next }
              loco … 機関車 (js/24-service-rules.js の WORK_LOCO_FLEET) / stock … 電車をその場所の在庫から ("tozai7" など)
              next … "remove" (着いた所で次の区間が受け持つ・または線路図の外へ) / "depot" (入区) */
const WORK_PATTERNS = [
    { id: "kamigori", name: "上郡駅構内乗務員訓練 (配給)", p: 0.35, uses: "de10", legs: [
        { no: "配9951", from: "向日町操", dest: "上郡",     at: _wt(8, 57),  dir: -1, loco: "de10", cars: "chiki2" },
        { no: "配9952", from: "上郡",     dest: "向日町操", at: _wt(17, 28), dir: 1,  loco: "de10", cars: "chiki2" }
    ]},
    { id: "kyokamotsu", name: "京都貨物への単機回送", p: 0.35, uses: "de10", legs: [
        { no: "単9384", from: "向日町操", dest: "西大路",   at: _wt(6, 59),  dir: 1,  loco: "de10" },
        { no: "単9383", from: "西大路",   dest: "向日町操", at: _wt(14, 26), dir: -1, loco: "de10" }
    ]},
    { id: "handle", name: "京都電車区ハンドル訓練 (681系・683系 3両)", p: 0.5, legs: [
        { no: "試9161M", from: "向日町操", dest: "宮原操",   at: _wt(10, 59), dir: -1 },
        { no: "試9160M", from: "宮原操",   dest: "向日町操", at: _wt(11, 42), dir: 1, hoppo: true },
        { no: "試9163M", from: "向日町操", dest: "宮原操",   at: _wt(13, 29), dir: -1 },
        { no: "試9162M", from: "宮原操",   dest: "向日町操", at: _wt(14, 4),  dir: 1, hoppo: true },
        { no: "試9165M", from: "向日町操", dest: "宮原操",   at: _wt(16, 9),  dir: -1 },
        { no: "試9164M", from: "宮原操",   dest: "向日町操", at: _wt(16, 56), dir: 1, hoppo: true }
    ]},
    { id: "suita_out", name: "吹田出場試運転", p: 0.45, legs: [
        { no: "試6780M", from: "吹田貨",   dest: "向日町操", at: _wt(9, 59),  dir: 1, hoppo: true },
        { no: "試6781M", from: "向日町操", dest: "吹田貨",   at: _wt(11, 55), dir: -1 }
    ]},
    { id: "kinsha", name: "近畿車輛出場公式試運転 (227系・273系など)", p: 0.15, legs: [
        { no: "試9745M", from: "吹田貨", dest: "網干", at: _wt(12, 35), dir: -1, hoppo: true },
        { no: "試9765M", from: "網干",   dest: "上郡", at: _wt(20, 30), dir: -1 }       // 上郡から先 (岡山) は線路図の外
    ]},
    { id: "aboshi_out", name: "網干出場試運転 (223系・225系)", p: 0.45, legs: [
        { no: "試6778M", from: "網干",     dest: "東加古川", at: _wt(14, 9),  dir: 1 },
        { no: "試6779M", from: "東加古川", dest: "網干",     at: _wt(14, 58), dir: -1, next: "depot" }
    ]},
    { id: "tozai_night", name: "東西線夜間訓練 (321系 7両)", p: 0.3, legs: [
        { no: "試9501M", from: "放出", dest: "尼崎", at: _wt(0, 32), dir: -1, track: "Tozai_Down", stock: "tozai7" },
        { no: "試9502M", from: "尼崎", dest: "放出", at: _wt(2, 54), dir: 1,  track: "Tozai_Up", stock: "tozai7", next: "depot" }
    ]},
    { id: "miyahara_dh", name: "宮原操車場の余力確保に伴う回送 (681系 6両)", p: 0.3, legs: [
        { no: "回9861M", from: "向日町操", dest: "宮原操", at: _wt(13, 51), dir: -1, next: "depot" }
    ]},
    { id: "goto", name: "後藤入場回送 (瑞風・はまかぜ)", p: 0.2, legs: [
        { no: "回9547D", from: "宮原操",   dest: "向日町操", at: _wt(22, 13), dir: 1 },
        { no: "回9528D", from: "向日町操", dest: "京都",     at: _wt(4, 44),  dir: 1 }
    ]},
    { id: "ef65_12", name: "EF65 (下関) + 12系客車 3両", p: 0.25, uses: "ef65", legs: [
        { no: "回9404レ", from: "上郡", dest: "宮原操", at: _wt(1, 58), dir: 1, loco: "ef65", cars: "kei12" }
    ]}
];

/** その日に走らせる組を選ぶ (同じ機関車を使う組は重ねない) */
Spawner.prototype.pickWorkPatterns = function () {
    const used = {};
    const out = [];
    WORK_PATTERNS.slice().sort(() => Math.random() - 0.5).forEach(pt => {
        if (Math.random() >= pt.p) return;
        if (pt.uses && used[pt.uses]) return;
        if (pt.uses) used[pt.uses] = true;
        out.push(pt);
    });
    return out;
};

Spawner.prototype.checkWorkPatterns = function (ct) {
    if (globalThis.__NO_WORK_PATTERNS) return;
    const day = Math.floor(ct / 86400);
    if (!this.wp || this.wp.day !== day) {
        const first = !this.wp;
        this.wp = { day: day, legs: [] };
        this.pickWorkPatterns().forEach(pt => pt.legs.forEach(L => {
            const at = day * 86400 + L.at;
            // 立ち上げのときに過ぎている区間は出さない
            this.wp.legs.push({ L: L, pt: pt, at: at, done: first && at < ct - 60 });
        }));
        if (this.wp.legs.length) {
            this.game.ui.updateBanner(`【事業用列車】本日の事業用列車: ` +
                [...new Set(this.wp.legs.map(x => x.pt.name))].join("・"), "banner-blue");
        }
    }
    for (const e of this.wp.legs) {
        if (e.done || ct < e.at) continue;
        e.done = true;
        this.spawnWorkLeg(e.L, e.pt);
    }
};

Spawner.prototype.spawnWorkLeg = function (L, pt) {
    const g = this.game;
    const trackId = L.track || (L.hoppo ? (L.dir === 1 ? "Up_Hoppo" : "Down_Hoppo") : (L.dir === 1 ? "Up_Out" : "Down_Out"));
    let vs = null, work = null;
    if (L.loco) {
        vs = ServiceRules.takeWork(L.loco, L.cars || null, L.from, L.dest);
        if (!vs) {
            g.ui.updateBanner(`【事業用列車】${L.no} (${pt.name}) は ${L.from}に機関車が居ないため運転を取りやめます。`, "banner-blue");
            return false;
        }
        work = L.cars ? "工臨" : "単機";
    } else if (L.stock === "tozai7") {
        vs = g.fleet.assign(L.from, "普通", trackId, L.dest, L.no, { noBorrow: true });
        if (!vs || !vs.length) {
            g.ui.updateBanner(`【事業用列車】${L.no} (${pt.name}) は ${L.from}に充てる編成が無いため運転を取りやめます。`, "banner-blue");
            return false;
        }
    }
    const cfg = { type: "臨時", dir: L.dir, trackId: trackId, dest: L.dest, startName: L.from,
                  name: L.no, dutyName: L.no, nextAction: L.next || (L.loco ? "remove" : "depot") };
    if (vs) cfg.vehicles = vs;
    if (work) cfg.workTrain = work;
    const ok = g.addTrain(cfg);
    if (!ok) {
        if (vs && L.loco) vs.forEach(v => ServiceRules.giveBack(v, L.from));
        else if (vs) g.fleet.release(L.from, vs);
        return false;
    }
    const t = g.trains.find(x => x.trainNo === L.no && x.state !== "finished");
    if (t) t.workPermit = true;                     // 線路閉鎖の区間にも入れる (事業用列車)
    this.wpStats = this.wpStats || { run: 0 };
    this.wpStats.run++;
    g.ui.updateBanner(`【事業用列車】${L.no} ${L.from}→${L.dest} (${pt.name}) が発車します。`, "banner-blue");
    return true;
};

/* ================================================================== 3. 終電後の線路閉鎖 */

/* 作業の候補。tracks は閉鎖する線路 (上り・下り)。 */
const NIGHT_WORK_SITES = [
    { line: "JR京都線",   from: "高槻",     to: "茨木",     tracks: ["Up_In", "Down_In"] },
    { line: "JR京都線",   from: "山崎",     to: "高槻",     tracks: ["Up_Out"] },
    { line: "JR京都線",   from: "向日町",   to: "長岡京",   tracks: ["Down_Out"] },
    { line: "JR神戸線",   from: "芦屋",     to: "西宮",     tracks: ["Up_In", "Down_In"] },
    { line: "JR神戸線",   from: "須磨",     to: "垂水",     tracks: ["Down_Out"] },
    { line: "JR神戸線",   from: "大久保",   to: "西明石",   tracks: ["Up_Out", "Down_Out"] },
    { line: "JR神戸線",   from: "加古川",   to: "宝殿",     tracks: ["Up_Out"] },
    { line: "琵琶湖線",   from: "草津",     to: "南草津",   tracks: ["Down_In"] },
    { line: "琵琶湖線",   from: "野洲",     to: "守山",     tracks: ["Up_Out", "Down_Out"] },
    { line: "琵琶湖線",   from: "近江八幡", to: "能登川",   tracks: ["Up_Out"] },
    { line: "湖西線",     from: "堅田",     to: "和邇",     tracks: ["Kosei_Up", "Kosei_Down"] },
    { line: "湖西線",     from: "近江舞子", to: "近江今津", tracks: ["Kosei_Down"] },
    { line: "JR宝塚線",   from: "川西池田", to: "宝塚",     tracks: ["Fukuchi_Up", "Fukuchi_Down"] },
    { line: "JR宝塚線",   from: "三田",     to: "新三田",   tracks: ["Fukuchi_Up"] },
    { line: "学研都市線", from: "四条畷",   to: "松井山手", tracks: ["Tozai_Up", "Tozai_Down"] },
    { line: "学研都市線", from: "京田辺",   to: "同志社前", tracks: ["Tozai_Up", "Tozai_Down"] }
];
const NIGHT_WORK_KINDS = [
    { kind: "軌道の徒歩巡回",           who: "保線区",       w: 3 },
    { kind: "レール交換 (ロングレール)", who: "保線区",       w: 1.5 },
    { kind: "分岐器の更新工事",         who: "保線区・工事会社", w: 1 },
    { kind: "道床のつき固め (マルタイ)", who: "保線区",       w: 1.5 },
    { kind: "架線・き電線の点検",       who: "電力区",       w: 2 },
    { kind: "信号設備・軌道回路の点検", who: "信号通信区",   w: 2 },
    { kind: "ホーム・橋りょうの補修工事", who: "工事会社",     w: 1 },
    { kind: "レール探傷車による検査",   who: "保線区",       w: 1 }
];

/** 毎晩の作業を決める (0時台に1回) */
OperationsManager.prototype.planNightWorks = function (ct) {
    const n = 4 + Math.floor(Math.random() * 3);
    const sites = NIGHT_WORK_SITES.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const base = ct - ((ct / 3600) % 24) * 3600;        // その日の0時
    const total = NIGHT_WORK_KINDS.reduce((s, k) => s + k.w, 0);
    return sites.map(s => {
        let r = Math.random() * total, kind = NIGHT_WORK_KINDS[0];
        for (const k of NIGHT_WORK_KINDS) { r -= k.w; if (r < 0) { kind = k; break; } }
        return { site: s, kind: kind, state: "plan",
                 from: base + (0.75 + Math.random() * 0.6) * 3600,        // 0:45〜1:21 に閉鎖を申し込む
                 until: base + (3.83 + Math.random() * 0.4) * 3600,       // 3:50〜4:14 に作業終了
                 giveUp: base + 2.5 * 3600 };
    });
};

/** その線路のその区間 (と、手前の近づく範囲) に、事業用でない列車がいるか */
OperationsManager.prototype.workSectionBusy = function (tid, lo, hi) {
    const blks = this.game.trackMgr.blocks[tid];
    if (!blks) return true;
    const near = UNITS_PER_STATION * 3;
    for (const t of this.game.trains) {
        if (t.state === "finished" || t.state === "in_depot" || t.workPermit) continue;
        if (t.trackId !== tid) continue;
        const i = t.currBlockIndex;
        if (i >= lo && i <= hi) return true;                                   // 区間の中
        if (t.overnightStable) continue;
        if (t.dir === 1 && i < lo && lo - i <= near) return true;              // 手前から近づく
        if (t.dir === -1 && i > hi && i - hi <= near) return true;
    }
    return false;
};

OperationsManager.prototype.checkNightWorks = function (ct) {
    if (globalThis.__NO_NIGHT_WORK) return;
    if (ct < (this.nwNext || 0)) return;
    this.nwNext = ct + 60;
    const g = this.game, tm = g.trackMgr;
    tm.workClosures = tm.workClosures || [];
    const h = (ct / 3600) % 24;
    const day = Math.floor(ct / 86400);
    if (h >= 0.5 && h < 1.0 && this.nwDay !== day) {
        this.nwDay = day;
        this.nightWorks = this.planNightWorks(ct);
    }
    // 閉鎖を解く (作業の終わり。始発の前に必ず)
    for (let i = tm.workClosures.length - 1; i >= 0; i--) {
        const c = tm.workClosures[i];
        if (ct < c.until && !(h >= 4.3 && h < 12)) continue;
        tm.workClosures.splice(i, 1);
        if (c.first) g.ui.updateBanner(`【線路閉鎖 解除】第${c.no}号 ${c.label} の${c.kind}が終わり、線路閉鎖を解除しました (${c.who} 作業終了の報告)。`, "banner-blue");
    }
    if (!this.nightWorks) return;
    for (const w of this.nightWorks) {
        if (w.state !== "plan" || ct < w.from) continue;
        if (ct > w.giveUp) {
            w.state = "cancel";
            g.ui.updateBanner(`【線路閉鎖】${w.site.line} ${w.site.from}〜${w.site.to}間の${w.kind.kind}は、最終列車が通り切らないため本日は中止します。`, "banner-blue");
            continue;
        }
        // 区間のブロック
        const ranges = [];
        let ok = true;
        for (const tid of w.site.tracks) {
            const a = stationBlockOn(g, tid, w.site.from), b = stationBlockOn(g, tid, w.site.to);
            if (!a || !b) { ok = false; break; }
            const lo = Math.min(a.index, b.index) + 1, hi = Math.max(a.index, b.index) - 1;   // 駅と駅のあいだ (駅の番線は残す)
            if (hi < lo) { ok = false; break; }
            ranges.push({ tid: tid, lo: lo, hi: hi });
        }
        if (!ok) { w.state = "cancel"; continue; }
        if (ranges.some(r => this.workSectionBusy(r.tid, r.lo, r.hi))) {
            if (!w.waitNoted) {
                w.waitNoted = true;
                g.ui.updateBanner(`【線路閉鎖】${w.site.line} ${w.site.from}〜${w.site.to}間 (${w.kind.who}) の線路閉鎖の申し込み。最終列車の通過を待って承認します。`, "banner-blue");
            }
            w.from = ct + 300;
            continue;
        }
        this.nwSeq = (this.nwSeq || 0) + 1;
        const label = `${w.site.line} ${w.site.from}〜${w.site.to}間 ${w.site.tracks.map(trackLabelOf).join("・")}`;
        ranges.forEach((r, k) => tm.workClosures.push({ trackId: r.tid, start: r.lo, end: r.hi, until: w.until,
            no: this.nwSeq, label: label, kind: w.kind.kind, who: w.kind.who, first: k === 0 }));
        w.state = "closed";
        this.stats.nightWork = (this.stats.nightWork || 0) + 1;
        g.ui.updateBanner(`【線路閉鎖 承認】第${this.nwSeq}号 ${label}。${w.kind.who}の${w.kind.kind}を承認します ` +
                          `(区間内に列車なし・最終列車通過済みを確認。作業終了予定 ${stabledClock((w.until / 3600) % 24)})。`, "banner-blue");
    }
};
