/* 編成ごとの「行路」(その日の運用のつながり) の記録。

   ■ なぜ要るか
     これまで画面に出せるのは「いまこの列車にどの編成が入っているか」だけで、
     「この編成が今日どう回っているか」は分からなかった。
     実際の指令では、車両の手配や運用変更を判断するのに
     行路表 (仕業表) — 編成ごとの、列車番号・始発駅・終着駅・時刻の並び —
     を見る。それと同じものを作る。

   ■ どうやって作るか
     時刻表を新しく書き起こすのではなく、シミュレーションで実際に起きたこと
     をそのまま記録する。編成ごとに「いま入っている列車番号」を見張り、
     変わったところで1行を締めて次の行を始める。
     こうすると、折り返し・種別変更・出入区がそのまま行路の切れ目になり、
     作り話の列車番号や経路が混ざらない。

   ■ 1行に入るもの
       no     … 列車番号
       type   … 種別
       from   … その列車の始発駅 (この編成が入ったところ)
       to     … 終着駅 (走り終えたところ。走行中は予定の行先)
       dep    … 始まった時刻 [秒]
       arr    … 終わった時刻 [秒] (走行中は null)
       kind   … "run" 営業・回送 / "depot" 留置
       link   … 前の行からのつながり ("折返" / "同一駅で交代" / "出区" / "入区")

   ■ 画面
     Super-TID の「編成検索・行路表」(js/44-tid-duty.js) から引く。
     旅客向けの画面 (index.html) では記録だけ行う。
*/

const DUTY_MAX_ROWS = 60;          // 1編成あたりの記録の上限 (1日ぶんで十分)
const DUTY_SCAN_SEC = 30;          // 見張る間隔 (シミュレーション時間)

class DutyLog {
    constructor(game) {
        this.game = game;
        this.byFleet = {};         // 編成番号(fullId) -> 行の配列
        this.open = {};            // 編成番号 -> いま開いている行
        this.last = {};            // 編成番号 -> 直前に締めた行 (つながりの判定用)
        this.nextScan = 0;
    }

    /** game.update() から毎Tick呼ばれる (中で間引く) */
    update() {
        const now = this.game.currentTime;
        if (now < this.nextScan) return;
        this.nextScan = now + DUTY_SCAN_SEC;

        const seen = {};
        for (const t of this.game.trains) {
            if (t.state === "finished") continue;
            if (!t.vehicles || !t.vehicles.length) continue;
            const inDepot = (t.state === "in_depot");
            const no = inDepot ? "" : (t.trainNo || "");
            for (const v of t.vehicles) {
                const id = v.fullId || v.id;
                if (!id) continue;
                seen[id] = true;
                this.touch(id, t, no, inDepot, now);
            }
        }
        // いなくなった編成 (列車が消えた・車両所へ返された) の行を締める
        for (const id in this.open) {
            if (seen[id]) continue;
            this.close(id, now, null);
        }
    }

    /** その編成の、いまの状態を記録に反映する */
    touch(id, t, no, inDepot, now) {
        const cur = this.open[id];
        const kind = inDepot ? "depot" : "run";
        const keySame = cur && cur.kind === kind &&
                        (kind === "depot" ? cur.from === (t.startName || "") : cur.no === no);
        if (keySame) {
            // 同じ運用の続き。走っている間に行先が変わることがあるので追う。
            if (kind === "run") {
                cur.to = t.dest || cur.to;
                const at = this.stationOf(t);
                if (at) cur.last = at;
            }
            return;
        }
        const prev = cur ? this.close(id, now, this.stationOf(t)) : this.last[id];
        const row = {
            no: no, type: inDepot ? "留置" : (t.type || ""),
            from: inDepot ? (t.startName || "") : (t.startName || this.stationOf(t) || ""),
            to: inDepot ? (t.startName || "") : (t.dest || ""),
            dep: now, arr: null, kind: kind,
            last: this.stationOf(t) || "",
            link: this.linkOf(prev, inDepot, t)
        };
        const list = this.byFleet[id] || (this.byFleet[id] = []);
        list.push(row);
        if (list.length > DUTY_MAX_ROWS) list.shift();
        this.open[id] = row;
    }

    /** 前の行とのつながりを言葉にする */
    linkOf(prev, inDepot, t) {
        if (!prev) return inDepot ? "留置" : "運用開始";
        if (inDepot) return "入区";
        if (prev.kind === "depot") return "出区";
        /* 前の運用を終えてから間が空いているときは、
           そのあいだ車両所・電留線で待っていたということ。
           そこを「継続」と書くと、つながっていない仕業がつながって見える。 */
        if (prev.arr !== null && this.game.currentTime - prev.arr > 600) return "待機後";
        const here = prev.last || prev.to;
        const start = t.startName || this.stationOf(t);
        if (here && start && here === start) {
            // 同じ駅で次の列車になる。向きが変わっていれば折り返し。
            const a = STATION_MAP[prev.from], b = STATION_MAP[here], c = STATION_MAP[t.dest];
            if (a !== undefined && b !== undefined && c !== undefined &&
                (b - a) * (c - b) < 0) return "折返";
            return "継続";
        }
        return "継続";
    }

    /** 開いている行を締める */
    close(id, now, at) {
        const row = this.open[id];
        if (!row) return null;
        row.arr = now;
        if (at) row.last = at;
        if (row.kind === "run" && row.last) row.to = row.last;
        delete this.open[id];
        this.last[id] = row;
        return row;
    }

    /** その列車がいま居る駅 (駅間なら null) */
    stationOf(t) {
        const blks = this.game.trackMgr.blocks[t.trackId];
        const b = blks ? blks[t.currBlockIndex] : null;
        if (!b || b.x === -1000) return null;
        if (!b.isStation && !b.hoppoStationName) return null;
        return blockStationName(b) || null;
    }

    /** その編成の行路 (古い順) */
    rowsOf(fleetId) {
        return (this.byFleet[fleetId] || []).slice();
    }

    /** 記録のある編成番号の一覧 */
    fleetIds() { return Object.keys(this.byFleet); }
}

/* ------------------------------------------------------------------ 編成の検索

   入力は「W1」「ホシW1」「w1」「V4+U5」のどれでも引けるようにする。
   実際の指令でも、略号を付けたり付けなかったりするため。 */

/** 検索用に文字をそろえる (大文字・記号なし) */
function dutyNormalizeId(s) {
    return String(s || "").toUpperCase()
        .replace(/[Ａ-Ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[\s\-＋+・]/g, "");
}

/**
 * 編成番号で編成を探す。
 * 戻り値は { vehicle, base, group, code } の配列 (前方一致も拾う)。
 * 元データ (js/02-fleet-data.js) に無い番号は返さない。
 */
function dutyFindFleets(query, limit) {
    const q = dutyNormalizeId(query);
    if (!q) return [];
    const out = [];
    const exact = [], partial = [];
    EXCEL_VEHICLES.forEach(v => {
        const code = VEHICLE_CODE[v.g] || "";
        const id = dutyNormalizeId(v.i);
        const full = dutyNormalizeId(code + v.i);
        if (id === q || full === q) exact.push(v);
        else if (id.indexOf(q) === 0 || full.indexOf(q) >= 0) partial.push(v);
    });
    exact.concat(partial).slice(0, limit || 12).forEach(v => {
        out.push({ id: v.i, fullId: (VEHICLE_CODE[v.g] || "") + v.i,
                   type: v.t, cars: v.c, base: v.b, group: v.g, notes: v.n });
    });
    return out;
}

/* ------------------------------------------------------------------ 編成の一覧

   画面の「編成を選ぶ」一覧を作るための並べ替えとまとめ。
   一覧は在籍表 (js/02-fleet-data.js の EXCEL_VEHICLES) からそのまま作る。
   編成番号を画面側に書き写すと、車両の増減に付いていけなくなる。 */

/** 編成番号の並べ替え用の鍵 ("W10" は "W9" の次、"W2" の前にしない) */
function dutySortKey(id) {
    const m = /^([^0-9]*)(\d*)([\s\S]*)$/.exec(String(id || ""));
    return { head: m[1] || "", num: m[2] ? parseInt(m[2], 10) : -1, tail: m[3] || "" };
}

/** 編成番号どうしの並び順 */
function dutyCompareId(a, b) {
    const x = dutySortKey(a), y = dutySortKey(b);
    if (x.head !== y.head) return x.head < y.head ? -1 : 1;
    if (x.num !== y.num) return x.num - y.num;
    return x.tail < y.tail ? -1 : (x.tail > y.tail ? 1 : 0);
}

/* 車両所の並び順 (画面の一覧もこの順に出す) */
const DUTY_GROUP_ORDER = ["ABOSHI", "AKASHI", "MIYAHARA", "KYOTO"];

/**
 * 「所属・形式」ごとにまとめた編成の一覧を返す。
 *   filter … 文字が入っていれば、編成番号・形式・所属で絞り込む
 *
 * 戻り値: [{ label: "網干総合車両所 223系1000番台",
 *            items: [{ id, fullId, type, cars, base, group, notes }, ...] }, ...]
 */
function dutyFleetGroups(filter) {
    const q = dutyNormalizeId(filter);
    const raw = String(filter || "").trim();
    const bag = {};
    EXCEL_VEHICLES.forEach(v => {
        const code = VEHICLE_CODE[v.g] || "";
        const fullId = code + v.i;
        if (q || raw) {
            const hitId = dutyNormalizeId(fullId).indexOf(q) >= 0 ||
                          dutyNormalizeId(v.i).indexOf(q) >= 0;
            // 形式・所属は日本語なので、そのままの文字でも探せるようにする
            const hitText = !!raw && ((v.t || "").indexOf(raw) >= 0 ||
                                      (v.b || "").indexOf(raw) >= 0 ||
                                      code.indexOf(raw) >= 0);
            if (!hitId && !hitText) return;
        }
        const key = (v.b || "") + " " + (v.t || "");
        if (!bag[key]) bag[key] = { label: key, group: v.g, type: v.t, items: [] };
        bag[key].items.push({ id: v.i, fullId: fullId, type: v.t, cars: v.c,
                              base: v.b, group: v.g, notes: v.n });
    });
    const out = Object.keys(bag).map(k => bag[k]);
    out.forEach(g => g.items.sort((a, b) => dutyCompareId(a.id, b.id)));
    out.sort((a, b) => {
        const ga = DUTY_GROUP_ORDER.indexOf(a.group), gb = DUTY_GROUP_ORDER.indexOf(b.group);
        const ia = ga < 0 ? 99 : ga, ib = gb < 0 ? 99 : gb;
        if (ia !== ib) return ia - ib;
        return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    });
    return out;
}

/** 在籍している編成の総数 (一覧の件数表示用) */
function dutyFleetCount() { return EXCEL_VEHICLES.length; }

/** その編成がいま入っている列車 (無ければ null) */
function dutyTrainOf(game, fullId) {
    for (const t of game.trains) {
        if (t.state === "finished") continue;
        if ((t.vehicles || []).some(v => (v.fullId || v.id) === fullId)) return t;
    }
    return null;
}

/** その編成がいま入っている留置場 (運用に入っていなければ) */
function dutyDepotOf(game, fullId) {
    for (const n in game.fleet.pools) {
        if (game.fleet.pools[n].some(v => (v.fullId || v.id) === fullId)) return n;
    }
    return null;
}

/** 秒を hh:mm に直す (行路表の時刻) */
function dutyTime(sec) {
    if (sec === null || sec === undefined) return "";
    const h = Math.floor(sec / 3600) % 24, m = Math.floor((sec % 3600) / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/* ================================================================== 所属の無い編成も引けるようにする

   ■ 何が起きていたか
     編成検索は在籍表 (js/02-fleet-data.js の EXCEL_VEHICLES) だけを見ていた。
     在籍表に無い車両 (足りないときの増備・特急の専用編成・貨物の機関車など、
     所属の欄が無いもの) は、線路図で押しても編成検索に出なかった。
   ■ いまの形
     在籍表に加えて、シミュレーションが持っている車両ぜんぶ
     (編成の在庫・特急編成の在庫・機関車の在庫・いま列車に入っている車両) を引く。
     所属が無いものは「所属なし」のまとまりに入れる。 */
function dutyKnownFleets(game) {
    const g = game || (typeof globalThis !== "undefined" ? globalThis.game : null);
    const out = [], seen = {};
    const push = (info) => { if (!info.fullId || seen[info.fullId]) return; seen[info.fullId] = true; out.push(info); };
    EXCEL_VEHICLES.forEach(v => push({ id: v.i, fullId: (VEHICLE_CODE[v.g] || "") + v.i, type: v.t, cars: v.c,
                                       base: v.b, group: v.g, notes: v.n, roster: true }));
    const addV = (v) => {
        if (!v) return;
        const fid = v.fullId || v.id;
        if (!fid || seen[fid]) return;
        push({ id: v.id, fullId: fid, type: v.type || "", cars: v.cars || 0,
               base: v.base || "所属なし", group: v.group || "", notes: v.notes || "", roster: false,
               noBase: !v.base || v.base === "所属なし" });
    };
    if (g) {
        (g.fleet && g.fleet.all || []).forEach(addV);
        if (typeof ServiceRules !== "undefined") {
            if (ServiceRules.expressPool) (ServiceRules.expressPool.all || []).forEach(addV);
            if (ServiceRules.freightPool) (ServiceRules.freightPool.all || []).forEach(addV);
        }
        (g.trains || []).forEach(t => (t.vehicles || []).forEach(addV));
    }
    return out;
}

(function () {
    // 在籍表だけを見ていた検索を、シミュレーションの車両ぜんぶへ広げる
    const baseFind = dutyFindFleets;
    dutyFindFleets = function (query, limit, game) {
        const hit = baseFind(query, limit);
        const q = dutyNormalizeId(query);
        if (!q) return hit;
        const extra = dutyKnownFleets(game).filter(v => !v.roster &&
            (dutyNormalizeId(v.fullId) === q || dutyNormalizeId(v.id) === q ||
             dutyNormalizeId(v.fullId).indexOf(q) >= 0));
        const exact = extra.filter(v => dutyNormalizeId(v.fullId) === q || dutyNormalizeId(v.id) === q);
        // ちょうど同じ番号の編成は、在籍表の部分一致より前に出す
        return exact.concat(hit, extra.filter(v => exact.indexOf(v) < 0)).slice(0, limit || 12);
    };
    const baseGroups = dutyFleetGroups;
    dutyFleetGroups = function (filter, game) {
        const groups = baseGroups(filter);
        const q = dutyNormalizeId(filter), raw = String(filter || "").trim();
        const extra = dutyKnownFleets(game).filter(v => !v.roster).filter(v => !q && !raw ||
            dutyNormalizeId(v.fullId).indexOf(q) >= 0 || (v.type || "").indexOf(raw) >= 0 || (v.base || "").indexOf(raw) >= 0);
        const bag = {};
        extra.forEach(v => {
            const key = (v.noBase ? "所属なし" : v.base) + " " + (v.type || "");
            (bag[key] = bag[key] || { label: key, group: v.group, type: v.type, items: [] }).items.push(v);
        });
        Object.keys(bag).sort().forEach(k => groups.push(bag[k]));
        return groups;
    };
})();

/* ================================================================== 列車ごとの運転の記録

   編成検索の行路表で列車番号を押すと、その列車の
     ・駅ごとの着発時刻 (停車 / 通過、番線、そのときの遅れ)
     ・経路 (始発 → 終着、これから通る駅と着く見込み)
     ・止められた場所と理由 (抑止・信号の停止現示・運転見合わせ・続行・運転再開待ちなど)
   を出す。すべてシミュレーションで実際に起きたことの記録から作る。 */
const TRAIN_LOG_MAX = 1500;       // 覚えておく列車の数 (古いものから捨てる)

DutyLog.prototype.trackTrains = function () {
    const g = this.game, now = g.currentTime;
    this.trainLog = this.trainLog || {};
    this.trainOrder = this.trainOrder || [];
    for (const t of g.trains) {
        if (t.state === "finished" || t.state === "in_depot" || !t.trainNo) continue;
        const key = t.trainNo;
        let L = this.trainLog[key];
        if (!L || L.trainId !== t.id) {
            L = this.trainLog[key] = { no: key, trainId: t.id, type: t.type, start: t.startName || "", dest: t.dest,
                                       firstAt: now, events: [], holds: [], cur: null, hold: null,
                                       vehicles: (t.vehicles || []).map(v => v.fullId || v.id) };
            this.trainOrder.push(key);
            if (this.trainOrder.length > TRAIN_LOG_MAX) delete this.trainLog[this.trainOrder.shift()];
        }
        L.type = t.type; L.dest = t.dest; L.lastAt = now; L.delay = t.delayTime || 0;
        const b = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
        const st = (b && isRealStationBlock(b)) ? blockStationName(b) : null;
        // 駅に着いた・駅を出た
        if (st && (!L.cur || L.cur.st !== st)) {
            if (L.cur && L.cur.dep === null) L.cur.dep = now;
            L.cur = { st: st, arr: now, dep: null, stop: false,
                      plat: (typeof trainPlatformLabel === "function" ? trainPlatformLabel(g, t) : null) || "",
                      delayMin: Math.floor((t.delayTime || 0) / 60) };
            L.events.push(L.cur);
        } else if (!st && L.cur && L.cur.dep === null) {
            L.cur.dep = now;
        }
        if (L.cur && st === L.cur.st && ["stopped", "waiting_start", "turning_back"].indexOf(t.state) >= 0) L.cur.stop = true;
        // 止められている (抑止・信号・見合わせ・続行)
        const stuck = (t.state === "holding" || t.isManuallySuspended || t.minorTrouble) && t.state !== "turning_back";
        if (stuck) {
            const reason = dutyHoldReason(g, t);
            if (!L.hold || L.hold.reason !== reason) {
                if (L.hold) L.hold.until = now;
                L.hold = { at: now, until: null, where: st || commWhere(g, t), reason: reason };
                L.holds.push(L.hold);
                if (L.holds.length > 40) L.holds.shift();
            }
        } else if (L.hold) {
            L.hold.until = now;
            L.hold = null;
        }
    }
};

/** 止められている理由 (画面表示用) */
function dutyHoldReason(game, t) {
    if (t.minorTrouble) return "輸送障害・車両の点検" + (t.troubleInfo && t.troubleInfo.cause ? " (" + t.troubleInfo.cause + ")" : "");
    if (t.recoveryHold) return "運転再開の順番待ち (抑止)";
    if (t.commIncident) return "指令連絡の応答待ち (抑止)";
    if (t.isManuallySuspended) return "指令の抑止";
    if (game.isEmergency) return "防護無線による一斉停止";
    const ahead = t.turnbackTrack || t.trackId;
    const nextIdx = t.currBlockIndex + t.dir;
    if (game.trackMgr.isSuspended(ahead, nextIdx, t)) return "運転見合わせ区間の手前";
    if (game.signals && game.signals.hasFault(ahead, nextIdx)) return "信号の故障 (停止現示)";
    const nb = (game.trackMgr.blocks[ahead] || [])[nextIdx];
    if (nb && nb.lanes && nb.lanes.every(l => l !== null)) return (isRealStationBlock(nb) ? "着発線の満線待ち (" + blockStationName(nb) + ")" : "信号の停止現示 (前の列車)");
    return "続行間隔の調整・発車待ち";
}

/** 列車の記録 (無ければ null) */
DutyLog.prototype.trainRecord = function (no) {
    return (this.trainLog || {})[no] || null;
};

(function () {
    const baseUpdate = DutyLog.prototype.update;
    DutyLog.prototype.update = function () {
        this.trackTrains();            // 列車ごとの着発・抑止は毎Tick見る (編成の行路は間引いて見る)
        return baseUpdate.call(this);
    };
})();
