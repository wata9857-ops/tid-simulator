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
