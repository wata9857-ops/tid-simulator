/* 多客の催し (花火大会・コンサート・試合など) の臨時輸送。

   ■ 何をするか (利用者の指摘 6.)
     大きな催しがあると、その駅のまわりに決まった時間だけ旅客が集中する。
     実際の JR西日本は、全線の本数を増やすのではなく、その駅を通る線区に
       ・臨時列車 (増発) を走らせる
       ・車両を増結する (4両 → 8両、8両 → 12両)
       ・駅の案内・誘導を強化し、停車時分を延ばして乗り降りに備える
     という手当てをする。ここでは催しごとに「場所・時間帯・臨時列車の出し方」を持ち、
     その時間帯・その駅のまわりだけに効かせる。

   ■ 時間帯
     inbound  … 開演前。催しの駅へ向かう旅客が集中する (到着の混雑)
     show     … 開催中。駅は比較的落ち着く
     outbound … 終演後。催しの駅から一斉に帰る (乗車の混雑がいちばん大きい)

   ■ 効き目
     1. 停車時分 … 催しの駅 (at) で最大 +100秒、周りの駅 (also) で最大 +45秒。
                  終演直後がいちばん大きく、時間とともに減る (dwellExtra)
     2. 臨時列車 … extras に書いた「発駅 → 行先」を、その時間帯に every 秒おきに出す。
                  発駅は折り返せる駅か車両所のある駅 (配線と車両の手配が付く所)。
                  編成はその駅にあるもの。無ければ車両所から送り込む (ふだんの仕組みのまま)
     3. 増結     … 催しの駅を通る普通・快速のうち、始発駅を出る前の列車に、
                  始発駅の留置線にいる同じ車両所の4両編成を連結する (4→8両、8→12両まで)。
                  7両固定の JR東西線・学研都市線、明石の 207系・321系 (7両) は増結しない
     4. 現場の連絡 … 催しの駅の駅長からの「ホーム混雑」の連絡が出るようになる (js/31-comms.js)

   ■ 起こし方
     ・毎日 4時に、SPECIAL_EVENT_DAILY の確率で1つを選んでその日に開く (時刻は催しごとの既定)
     ・Super-TID の運転指令の欄「臨時輸送 (催し)」から、いつでも開ける (開演まで1時間の形で始まる)
*/

const SPECIAL_EVENT_DAILY = 0.3;

/* 催しの一覧。
     at      … 催しの最寄り駅 (もっとも混む駅)
     also    … まわりの駅 (乗り換え・分散で混む駅)
     showAt  … 開演の時刻 (時) / showH … 開催の長さ (時)
     inH / outH … 開演前・終演後の混雑の長さ (時)
     extras  … 臨時列車。when は "in" (開演前) / "out" (終演後)。
                from は折り返せる駅か車両所の駅。to は行先 (その先で運用に戻る)。 */
const SPECIAL_EVENTS = [
    { id: "biwako-hanabi", name: "びわ湖大花火大会", kind: "花火大会", at: "大津", also: ["膳所", "石山", "山科", "京都"],
      showAt: 19.5, showH: 1.0, inH: 3.0, outH: 2.25, weight: 3,
      extras: [
          { when: "in",  from: "京都", to: "草津", type: "普通", dir: 1,  every: 1200 },
          { when: "out", from: "草津", to: "大阪", type: "普通", dir: -1, every: 720 },
          { when: "out", from: "京都", to: "草津", type: "普通", dir: 1,  every: 1200 }
      ] },
    { id: "yodogawa-hanabi", name: "なにわ淀川花火大会", kind: "花火大会", at: "塚本", also: ["大阪", "尼崎"],
      showAt: 19.5, showH: 1.0, inH: 2.5, outH: 2.0, weight: 3,
      extras: [
          { when: "out", from: "尼崎", to: "高槻", type: "普通", dir: 1,  every: 720 },
          { when: "out", from: "尼崎", to: "西明石", type: "普通", dir: -1, every: 1200 }
      ] },
    { id: "kobe-hanabi", name: "みなとこうべ海上花火大会", kind: "花火大会", at: "元町", also: ["三ノ宮", "神戸"],
      showAt: 19.5, showH: 1.0, inH: 2.0, outH: 1.75, weight: 2,
      extras: [
          { when: "out", from: "神戸", to: "大阪", type: "普通", dir: 1,  every: 900 },
          { when: "out", from: "神戸", to: "西明石", type: "普通", dir: -1, every: 1500 }
      ] },
    { id: "osakajo-hall", name: "大阪城ホール コンサート", kind: "コンサート", at: "大阪城北詰", also: ["京橋"],
      showAt: 18.5, showH: 2.5, inH: 1.5, outH: 1.25, weight: 3,
      extras: [
          { when: "out", from: "放出", to: "尼崎", type: "普通", dir: -1, every: 900 },
          { when: "out", from: "尼崎", to: "松井山手", type: "普通", dir: 1, every: 1500 }
      ] },
    { id: "world-hall", name: "神戸ワールド記念ホール ライブ", kind: "コンサート", at: "三ノ宮", also: ["神戸", "元町"],
      showAt: 18.0, showH: 3.0, inH: 1.5, outH: 1.25, weight: 2,
      extras: [
          { when: "out", from: "神戸", to: "大阪", type: "普通", dir: 1, every: 1200 }
      ] },
    { id: "koshien-night", name: "甲子園球場 ナイター", kind: "野球", at: "甲子園口", also: ["西宮", "尼崎"],
      showAt: 18.0, showH: 3.0, inH: 1.5, outH: 1.25, weight: 2,
      extras: [
          // 甲子園口の折返線 (2番) で折り返す臨時普通 (下り→上り)
          { when: "out", from: "甲子園口", to: "高槻", type: "普通", dir: 1, every: 1200 }
      ] },
    { id: "noevir", name: "ノエビアスタジアム神戸 試合", kind: "試合", at: "兵庫", also: ["新長田", "神戸"],
      showAt: 14.0, showH: 2.0, inH: 1.5, outH: 1.25, weight: 2,
      extras: [
          { when: "out", from: "須磨", to: "高槻", type: "普通", dir: 1, every: 1200 }
      ] },
    { id: "gion", name: "祇園祭 宵山", kind: "祭り", at: "京都", also: ["山科", "大津", "高槻"],
      showAt: 18.0, showH: 4.0, inH: 1.5, outH: 1.5, weight: 2,
      extras: [
          { when: "out", from: "京都", to: "西明石", type: "普通", dir: -1, every: 1200 },
          { when: "out", from: "京都", to: "野洲", type: "普通", dir: 1, every: 1800 }
      ] },
    { id: "takarazuka", name: "宝塚大劇場 公演", kind: "公演", at: "宝塚", also: ["川西池田"],
      showAt: 15.0, showH: 3.0, inH: 1.0, outH: 1.0, weight: 1,
      extras: [
          { when: "out", from: "宝塚", to: "大阪", type: "普通", dir: 1, every: 1800 }
      ] },

    /* ★利用者の指摘 9. … 催しの種類を増やした (2026-09 の7回目)。
         1日に催しが開く確率 (SPECIAL_EVENT_DAILY = 30%) は変えていない。重みは「どれが開くか」の割合だけ。
         場所はどれも線路図の中の駅 (京セラドーム・USJ など線路図の外の会場は入れない)。 */
    { id: "koshien-day", name: "甲子園球場 高校野球 (デーゲーム)", kind: "野球", at: "甲子園口", also: ["西宮", "尼崎", "大阪"],
      showAt: 9.0, showH: 8.0, inH: 1.5, outH: 1.5, weight: 2,
      extras: [
          { when: "in",  from: "尼崎", to: "西明石", type: "普通", dir: -1, every: 1800 },
          { when: "out", from: "甲子園口", to: "高槻", type: "普通", dir: 1, every: 1200 }
      ] },
    { id: "luminarie", name: "神戸ルミナリエ", kind: "光の催し", at: "元町", also: ["三ノ宮", "神戸"],
      showAt: 18.0, showH: 3.0, inH: 1.5, outH: 1.5, weight: 2,
      extras: [
          { when: "out", from: "神戸", to: "大阪", type: "普通", dir: 1, every: 1200 },
          { when: "out", from: "神戸", to: "西明石", type: "普通", dir: -1, every: 1800 }
      ] },
    { id: "ebisu", name: "西宮神社 十日えびす", kind: "祭り", at: "西宮", also: ["甲子園口", "芦屋"],
      showAt: 16.0, showH: 5.0, inH: 2.0, outH: 1.5, weight: 1,
      extras: [
          { when: "out", from: "須磨", to: "高槻", type: "普通", dir: 1, every: 1500 },
          { when: "out", from: "尼崎", to: "西明石", type: "普通", dir: -1, every: 1500 }
      ] },
    { id: "himeji-oshiro", name: "姫路お城まつり", kind: "祭り", at: "姫路", also: ["英賀保", "御着"],
      showAt: 13.0, showH: 5.0, inH: 2.0, outH: 1.5, weight: 1,
      extras: [
          { when: "in",  from: "西明石", to: "姫路", type: "普通", dir: -1, every: 1800 },
          { when: "out", from: "姫路", to: "西明石", type: "普通", dir: 1, every: 1500 }
      ] },
    { id: "gamba", name: "パナソニックスタジアム吹田 試合", kind: "試合", at: "茨木", also: ["吹田", "高槻", "新大阪"],
      showAt: 19.0, showH: 2.0, inH: 1.5, outH: 1.25, weight: 2,
      extras: [
          { when: "out", from: "高槻", to: "西明石", type: "普通", dir: -1, every: 1200 },
          { when: "out", from: "高槻", to: "京都", type: "普通", dir: 1, every: 1800 }
      ] },
    { id: "sagicho", name: "近江八幡 左義長まつり", kind: "祭り", at: "近江八幡", also: ["野洲", "草津"],
      showAt: 12.0, showH: 7.0, inH: 2.0, outH: 1.5, weight: 1,
      extras: [
          { when: "in",  from: "野洲", to: "米原", type: "普通", dir: 1, every: 2400 },
          { when: "out", from: "米原", to: "京都", type: "普通", dir: -1, every: 2400 }
      ] }
];

class SpecialEventSystem {
    constructor(game) {
        this.game = game;
        this.active = [];              // { def, day, inFrom, showFrom, showTo, outTo, next:{}, stats }
        this.history = [];
        this.lastPlannedDay = -1;
        this.seq = 0;
        this.stats = { extras: 0, boosted: 0, dwell: 0 };
    }

    /** 催しの定義を id で引く */
    def(id) { return SPECIAL_EVENTS.find(e => e.id === id) || null; }

    /** 催しを開く。showFrom … 開演の時刻 [秒]。省略すると「いまから開演前の混雑が始まる」形 */
    open(id, showFrom, why) {
        const d = this.def(id);
        if (!d) return null;
        const now = this.game.currentTime;
        if (this.active.some(e => e.def.id === id && e.outTo > now)) return null;   // もう開いている
        const show = (showFrom !== undefined) ? showFrom : now + Math.min(d.inH, 1.0) * 3600;
        const ev = { def: d, inFrom: show - d.inH * 3600, showFrom: show, showTo: show + d.showH * 3600,
                     next: {}, stats: { extras: 0, boosted: 0 }, why: why || "" };
        ev.outTo = ev.showTo + d.outH * 3600;
        this.active.push(ev);
        const hm = (s) => tidLikeClock(s);
        this.game.ui.updateBanner(
            `【臨時輸送】${d.name} (${d.at}) … 開演 ${hm(ev.showFrom)}・終演 ${hm(ev.showTo)}。` +
            `${d.at}駅とその周辺で混雑が予想されるため、臨時列車の運転・増結・駅の誘導強化を行います。`, "banner-blue");
        return ev;
    }

    /** いま開いている催しを閉じる */
    close(id) {
        const i = this.active.findIndex(e => e.def.id === id);
        if (i < 0) return false;
        const ev = this.active.splice(i, 1)[0];
        this.history.push(ev);
        this.game.ui.updateBanner(`【臨時輸送】${ev.def.name} の臨時輸送を終了しました (臨時列車 ${ev.stats.extras}本・増結 ${ev.stats.boosted}本)。`, "banner-blue");
        return true;
    }

    /** その時刻の時間帯 ("in" / "show" / "out" / null) */
    phaseOf(ev, now) {
        if (now < ev.inFrom || now >= ev.outTo) return null;
        if (now < ev.showFrom) return "in";
        if (now < ev.showTo) return "show";
        return "out";
    }

    update(ct) {
        const day = Math.floor(ct / 86400);
        const h = (ct / 3600) % 24;
        // 毎日1回、その日の催しを決める
        if (day !== this.lastPlannedDay && h >= 4.0 && h < 5.0) {
            this.lastPlannedDay = day;
            if (!globalThis.__NO_EVENTS && Math.random() < SPECIAL_EVENT_DAILY) {
                const d = pickWeighted(SPECIAL_EVENTS);
                if (d) this.open(d.id, day * 86400 + d.showAt * 3600, "定例");
            }
        }
        for (const ev of this.active.slice()) {
            if (ct >= ev.outTo) { this.close(ev.def.id); continue; }
            const ph = this.phaseOf(ev, ct);
            if (!ph) continue;
            ev.def.extras.forEach((x, i) => {
                if (x.when !== ph) return;
                if (ev.next[i] === undefined) ev.next[i] = ct;
                if (ct < ev.next[i]) return;
                ev.next[i] = ct + x.every;
                if (this.spawnExtra(ev, x)) { ev.stats.extras++; this.stats.extras++; }
                else ev.next[i] = ct + 180;          // 出せなかったら少し待ってもう一度
            });
        }
        if (this.active.length) this.boostAtOrigins(ct);
    }

    /**
     * 催しの臨時列車の列車番号。
     * ★利用者の指摘 8. … 以前は 97xxM で上下とも同じ規則だったうえ、画面では
     *   ふだんの列車と見分けが付かなかった。実際の臨時列車と同じく 9000番台を使い
     *   (ふだんの列車は 4999 まで)、上りは偶数・下りは奇数にする。
     *   9700〜9899 を催しの臨時列車だけに使う (工臨・単機の 93xx とも重ならない)。
     */
    specialNo(dir) {
        const used = (this.game.spawner && this.game.spawner.activeTrainNos) || new Set();
        let no = "";
        for (let safe = 0; safe < 100; safe++) {
            this.seq = (this.seq % 99) + 1;
            let n = 9700 + this.seq * 2;
            if (dir === -1) n++;
            no = n + "M";
            if (!used.has(no) && !this.game.trains.some(t => t.trainNo === no && t.state !== "finished")) break;
        }
        if (used.add) used.add(no);
        return no;
    }

    /** 臨時列車を1本出す */
    spawnExtra(ev, x) {
        const g = this.game;
        if (!ttInService(stationBranchLine(x.from) === "tozai" ? "tozai" : "main", (g.currentTime / 3600) % 24)) return false;
        const trackId = specialEventTrackId(x.from, x.dir, x.type);
        const name = this.specialNo(x.dir);
        const cfg = { type: x.type, dir: x.dir, trackId: trackId, dest: x.to, startName: x.from,
                      name: name, dutyName: name, nextAction: "turnback" };
        const before = g.trains.length;
        if (!g.addTrain(cfg)) {
            if (g.spawner && g.spawner.activeTrainNos) g.spawner.activeTrainNos.delete(name);
            return false;
        }
        /* いま作った列車 (送り込みの回送になった場合は、その回送) に印を付ける。
           臨時列車として扱うのは、列車番号がこの臨時の番号のあいだだけ
           (送り込みの回送のあいだ・行先で折り返してふだんの運用に戻ったあとは、ふつうの列車) */
        for (let k = g.trains.length - 1; k >= before; k--) {
            const t = g.trains[k];
            t.eventTrain = ev.def.id;
            t.eventTrainNo = name;
        }
        g.ui.updateBanner(`【臨時輸送】${ev.def.name}: 臨時列車 ${name} (臨時${x.type}) ${x.from}→${x.to} を運転します。`, "banner-blue");
        return true;
    }

    /**
     * 催しの駅を通る始発前の普通・快速に、始発駅の留置線の4両編成を増結する。
     * 増結できる両数は 8両 (普通) / 12両 (快速) まで。7両固定の車両・線区は対象外。
     */
    boostAtOrigins(ct) {
        const g = this.game;
        for (const t of g.trains) {
            if (t.hasDeparted || t.eventBoosted || t.state !== "waiting_start") continue;
            if (["普通", "快速"].indexOf(t.type) < 0 || !t.vehicles || !t.vehicles.length) continue;
            if (/^Tozai/.test(t.trackId) || t.vehicles.some(v => v.group === "AKASHI" || v.cars === 7)) continue;
            const ev = this.active.find(e => this.phaseOf(e, ct) && this.phaseOf(e, ct) !== "show" &&
                                             trainPassesStation(g, t, e.def.at));
            if (!ev) continue;
            t.eventBoosted = true;                       // 1本につき1回だけ試す
            const cars = t.vehicles.reduce((s, v) => s + v.cars, 0);
            const cap = (t.type === "快速") ? 12 : 8;
            if (cars + 4 > cap) continue;
            const blks = g.trackMgr.blocks[t.trackId];
            const here = blks ? blks[t.currBlockIndex] : null;
            const st = here ? blockStationName(here) : null;
            if (!st) continue;
            const pool = g.fleet.pools[fleetHomeOf(st)] || g.fleet.pools[st];
            if (!pool || fleetIndexOf(fleetHomeOf(st)) !== fleetIndexOf(st)) continue;   // その駅の留置線に居る編成だけ
            const grp = t.vehicles[0].group;
            const i = pool.findIndex(v => v.group === grp && v.cars === 4 && !v.expressKey && !v.freightKey &&
                                          (VEH.is223(v) || VEH.is225(v) || VEH.is221(v)));
            if (i < 0) continue;
            const add = pool.splice(i, 1)[0];
            const test = t.vehicles.concat([add]);
            if (!g.fleet.canServe(test, t.startName, t.type, t.trackId, t.dest, t.dutyName)) { pool.push(add); continue; }
            t.vehicles.push(add);
            t.eventBoostAdded = cars + add.cars;
            t.eventBoostType = t.type;
            ev.stats.boosted++; this.stats.boosted++;
            g.ui.updateBanner(`【臨時輸送】${ev.def.name}: ${t.trainNo} (${st}発) に ${add.fullId} を増結し ${cars + add.cars}両で運転します。`, "banner-blue");
        }
    }

    /**
     * その駅・その時刻に催しの旅客で延びる停車時分 [秒]。
     * 終演直後がいちばん大きく、時間とともに減る。開演前は到着の旅客で少し延びる。
     */
    dwellExtra(stName, t) {
        if (!this.active.length || !stName) return 0;
        if (t && ["貨物", "回送", "臨時"].indexOf(t.type) >= 0) return 0;
        const now = this.game.currentTime;
        let add = 0;
        for (const ev of this.active) {
            const ph = this.phaseOf(ev, now);
            if (!ph || ph === "show") continue;
            const main = ev.def.at === stName;
            const near = ev.def.also.indexOf(stName) >= 0;
            if (!main && !near) continue;
            let f;
            if (ph === "out") f = 1.0 - 0.6 * (now - ev.showTo) / Math.max(1, ev.outTo - ev.showTo);
            else f = 0.35 + 0.35 * (now - ev.inFrom) / Math.max(1, ev.showFrom - ev.inFrom);
            add = Math.max(add, Math.round((main ? 100 : 45) * f));
        }
        if (add) this.stats.dwell++;
        return add;
    }

    /** 混雑の連絡を出す駅 (js/31-comms.js) */
    crowdStations() {
        const now = this.game.currentTime;
        const out = [];
        this.active.forEach(ev => {
            const ph = this.phaseOf(ev, now);
            if (ph === "in" || ph === "out") out.push(ev.def.at);
        });
        return out;
    }

    /** 画面に出す一覧 */
    summary() {
        const now = this.game.currentTime;
        const lab = { in: "開演前の混雑", show: "開催中", out: "終演後の混雑" };
        return this.active.map(ev => ({
            id: ev.def.id, name: ev.def.name, at: ev.def.at, phase: lab[this.phaseOf(ev, now)] || "開始前",
            show: tidLikeClock(ev.showFrom) + "〜" + tidLikeClock(ev.showTo),
            extras: ev.stats.extras, boosted: ev.stats.boosted
        }));
    }
}

/**
 * その列車がいま催しの臨時列車として走っているか。
 * 列車番号が臨時の番号のあいだだけ (送り込みの回送・折り返してふつうの運用に戻ったあとは違う)。
 */
function isEventSpecialTrain(t) {
    return !!(t && t.eventTrain && t.eventTrainNo && t.trainNo === t.eventTrainNo);
}

/** 臨時列車の催しの名前 (無ければ "") */
function eventSpecialName(t) {
    if (!t || !t.eventTrain || typeof SPECIAL_EVENTS === "undefined") return "";
    const d = SPECIAL_EVENTS.find(e => e.id === t.eventTrain);
    return d ? d.name : "";
}

/** 画面に出す種別 (臨時列車は「臨時普通」のように頭に付ける) */
function eventSpecialTypeLabel(t) {
    const ty = trainTypeLabel(t);
    return isEventSpecialTrain(t) ? "臨時" + ty : ty;
}

/** 画面に出す種別 (区間快速・丹波路快速を見分ける。js/38d-train-numbers.js の trainServiceShort) */
function trainTypeLabel(t) {
    if (!t) return "";
    return (typeof trainServiceShort === "function" && t.game) ? trainServiceShort(t) : (t.type || "");
}

/** 重み付きで1つ選ぶ */
function pickWeighted(list) {
    const total = list.reduce((s, x) => s + (x.weight || 1), 0);
    let r = Math.random() * total;
    for (const x of list) { r -= (x.weight || 1); if (r < 0) return x; }
    return list[list.length - 1];
}

/** 時:分 (日をまたいでも 0〜23時) */
function tidLikeClock(sec) {
    const h = Math.floor(sec / 3600) % 24, m = Math.floor((sec % 3600) / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/** 臨時列車が出る線路 (分岐線の駅はその線区、本線は種別で内側線・外側線) */
function specialEventTrackId(from, dir, type) {
    const line = stationBranchLine(from);
    if (line === "tozai") return dir === 1 ? "Tozai_Up" : "Tozai_Down";
    if (line === "fukuchi") return dir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
    if (line === "kosei") return dir === 1 ? "Kosei_Up" : "Kosei_Down";
    if (["宝塚", "川西池田", "新三田", "塚口"].indexOf(from) >= 0) return dir === 1 ? "Fukuchi_Up" : "Fukuchi_Down";
    const idx = STATION_MAP[from];
    const inner = idx !== undefined && innerTrackExists(idx) && type === "普通";
    return (dir === 1 ? "Up_" : "Down_") + (inner ? "In" : "Out");
}

/** その列車がこれから (いまの駅を含めて) その駅を通るか */
function trainPassesStation(game, t, stName) {
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return false;
    const here = blks[t.currBlockIndex];
    if (here && blockStationName(here) === stName) return true;
    return trainStationsAhead(game, t, 25).indexOf(stName) >= 0;
}
