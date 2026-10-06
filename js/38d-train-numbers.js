/* ==================================================================
   列車番号の決まり (利用者の指摘 ④ 2026-10)
   ==================================================================

   ■ 基本
     ・下りは奇数、上りは偶数 (このシミュレーターの dir: -1 = 下り / 1 = 上り)。
       特急は「号」の数字も同じ (サンダーバードは 大阪→敦賀 が下り。東海道線の上りを走るが列車としては下り)。
     ・同じ線区の中で同じ番号を2本に使わない。走っている列車の番号と、その日 (4時で区切る) に
       一度使った番号は避ける (使い切ったときだけ、走っていない番号を使い直す)。
     ・5418M は福知山線列車事故の列車番号なので永久欠番 (使わない)。
   ■ 末尾の記号
     M … 電車 / D … 気動車 (はまかぜ・スーパーはくと) /
     C … 京都〜西明石・加古川の普通 (JR京都線・JR神戸線の電車線。103系の速度種別 C2 から) /
     T … 高槻〜明石を快速で走る快速 (高槻の T)。京都〜明石を快速で走る快速は M。
     (このシミュレーターの快速は京都〜高槻を各駅に停まるので、JR京都線・JR神戸線を通る快速は T になる)
   ■ 桁と値
     特急     … 2桁以下 (はまかぜ 11〜50D・スーパーはくと 51〜90D) か、百の位が 0 の4桁
                 (はるか 20xxM・こうのとり 30xxM・サンダーバード 40xxM)。画面の名前 (はるか5号) はそのまま。
     新快速   … 33xx〜37xxM。百の位で運転の系統 (3 湖西線経由 / 4 米原・長浜方面 / 6 野洲・草津・京都 /
                 7 姫路より西) を分ける。
     快速     … JR京都線・JR神戸線・琵琶湖線は 3桁で百の位 7・8 (7 京都より東へ直通 / 8 それ以外)。
                 JR宝塚線は 27xx・28xxM (28 は篠山口・福知山 = 丹波路快速)。
     学研都市線・JR東西線 … 4桁。千の位 5 = 快速 (区間快速を含む)・4 = 普通、百の位 4・5 で運転区間
                 (4 = 松井山手より手前まで / 5 = 同志社前・木津方面)。末尾は JR宝塚線への直通と尼崎止まりが M、
                 JR神戸線 (須磨・西明石など) への直通の普通が C。
     普通     … JR京都線・JR神戸線 1xx〜6xxC (百の位で区間)、琵琶湖線 15xx〜19xxM、湖西線 11xx〜14xxM、
                 JR宝塚線 21xx〜24xxM、西明石より西・赤穂線 9xxM。
     回送     … 回 + 4桁。向きの奇偶を守る。
   ■ 種別の呼び方 (trainServiceName)
     区間快速 (学研都市線の昼間の快速。鴫野・徳庵だけを通過) / 丹波路快速 (大阪〜篠山口・福知山) /
     快速 (高槻〜西明石間 快速) のように、快速で走る区間を添える。 */

const TRAIN_NO_RETIRED = ["5418M"];

const _TN_SETS = (function () {
    const vals = (m) => Object.keys(m).map(k => m[k]);
    return {
        tozai: new Set(vals(TOZAI_STATIONS_MAP)),
        fukuchi: new Set(vals(FUKUCHI_STATIONS_MAP).concat(["篠山口", "福知山", "豊岡", "城崎温泉"])),
        kosei: new Set(vals(KOSEI_STATIONS_MAP).concat(["近江塩津"])),
        ako: new Set(vals(AKO_STATIONS_MAP).concat(["長船", "岡山"]))
    };
})();
/** 学研都市線・JR東西線の駅の並び (加島 → 木津 の順の位置) */
function _tnTozaiPos(name) {
    for (const k in TOZAI_STATIONS_MAP) if (TOZAI_STATIONS_MAP[k] === name) return Number(k);
    return null;
}
/** JR宝塚線の駅の並び (塚口から離れるほど大きい) */
function _tnFukuchiPos(name) {
    for (const k in FUKUCHI_STATIONS_MAP) if (FUKUCHI_STATIONS_MAP[k] === name) return -Number(k);
    if (["篠山口", "福知山", "豊岡", "城崎温泉"].indexOf(name) >= 0) return 9999;
    return null;
}
function _tnMainIdx(name) {
    const i = STATION_MAP[name];
    return (i !== undefined && STATIONS[i] && STATIONS[i].name === name) ? i : undefined;
}

/** 列車番号の線区 ("tozai" / "fukuchi" / "kosei" / "biwako" / "main" / "west") */
function trainNoLineOf(type, trackId, startName, dest) {
    const tid = trackId || "";
    const ends = [startName, dest].filter(Boolean);
    const on = (set) => ends.some(n => set.has(n));
    if (tid.indexOf("Tozai") === 0 || on(_TN_SETS.tozai) || ends.some(n => n === "奈良")) return "tozai";
    if (tid.indexOf("Fukuchi") === 0 || on(_TN_SETS.fukuchi)) return "fukuchi";
    if (tid.indexOf("Kosei") === 0 || on(_TN_SETS.kosei) && !ends.some(n => n === "米原" || n === "長浜")) return "kosei";
    if (tid.indexOf("Ako") === 0 || on(_TN_SETS.ako)) return "west";
    const K = STATION_MAP["京都"], N = STATION_MAP["西明石"];
    const idx = ends.map(_tnMainIdx).filter(i => i !== undefined);
    if (idx.length && idx.every(i => i >= K)) return "biwako";
    if (idx.length && idx.every(i => i <= N)) return "west";
    return "main";
}

/** 学研都市線・JR東西線の列車の末尾 (M / C) と百の位 (4 / 5) */
function _tnTozaiParts(startName, dest) {
    const ends = [startName, dest].filter(Boolean);
    const K = STATION_MAP["尼崎"];
    // JR神戸線 (尼崎より西の本線の駅) へ直通するなら C
    const kobe = ends.some(n => { const i = _tnMainIdx(n); return i !== undefined && i < K; });
    const matsui = _tnTozaiPos("松井山手");
    const far = ends.some(n => { const p = _tnTozaiPos(n); return (p !== null && p > matsui) || n === "奈良"; });
    return { suffix: kobe ? "C" : "M", h: far ? 5 : 4 };
}

/** その日 (4時で区切る) の番号 */
function _tnDayKey(game) {
    const t = (game && game.currentTime) || 0;
    return Math.floor((t - 4 * 3600) / 86400);
}

/**
 * 番号の空きを探す。prefix … 千の位以上 (3桁なら 0)、hs … 百の位の候補 (先頭から)、
 * parity … 1 奇数 / 0 偶数。走っている列車・欠番・その日に使った番号を避ける。
 */
Spawner.prototype.allocTrainNo = function (lead, prefix, hs, suffix, parity) {
    const day = _tnDayKey(this.game);
    if (this._tnDay !== day) { this._tnDay = day; this._tnUsed = new Set(); this._tnPtr = {}; }
    const active = this.activeTrainNos;
    /* 走っている列車の番号と、これから使うと決まっている番号 (出区・折り返しのあとの番号・種別変更の番号) */
    const live = new Set();
    for (const t of ((this.game && this.game.trains) || [])) {
        if (t.state === "finished") continue;
        live.add(t.trainNo);
        if (t.depotOutConfig && t.depotOutConfig.trainNo) live.add(t.depotOutConfig.trainNo);
        if (t.serviceChange && t.serviceChange.name) live.add(t.serviceChange.name);
    }
    const fmt = (n) => (lead || "") + n + (suffix || "");
    for (const pass of [0, 1]) {
        for (const h of hs) {
            const key = (lead || "") + prefix + ":" + h + ":" + parity + (suffix || "");
            let p = this._tnPtr[key] || 0;
            for (let step = 0; step < 50; step++) {
                p = (p % 49) + 1;                                   // 1..49 → 下2桁 (02..98 / 01..99)
                const nn = p * 2 - (parity ? 1 : 0);
                const n = prefix * 1000 + h * 100 + nn;
                const no = fmt(n);
                if (TRAIN_NO_RETIRED.indexOf((n + (suffix || ""))) >= 0) continue;
                if (live.has(no)) continue;
                /* activeTrainNos には走り終えた列車の番号が残っていることがあるので、2回目は走っている列車だけを見る */
                if (pass === 0 && (active.has(no) || this._tnUsed.has(no))) continue;
                this._tnPtr[key] = p;
                this._tnUsed.add(no);
                active.add(no);
                return no;
            }
        }
    }
    // 候補の百の位を使い切った (ふつうは起きない)。同じ千の位のほかの百の位から、走っていない番号を探す
    for (let h = 0; h <= 9; h++) {
        for (let p = 1; p <= 49; p++) {
            const n = prefix * 1000 + h * 100 + p * 2 - (parity ? 1 : 0);
            const no = fmt(n);
            if (live.has(no) || TRAIN_NO_RETIRED.indexOf(n + (suffix || "")) >= 0) continue;
            active.add(no);
            return no;
        }
    }
    const no = fmt(prefix * 1000 + hs[0] * 100 + (parity ? 99 : 98));
    active.add(no);
    return no;
};

/**
 * 列車番号を作る (js/07-spawner-core.js の同名の関数を置き換える)。
 * dest は分かるときだけ渡す (分からなければ始発駅と線路から決める)。
 */
Spawner.prototype.generateTrainNumber = function (type, dir, startName, trackId, dest) {
    const parity = dir === -1 ? 1 : 0;                      // 下り = 奇数
    if (type === "回送") return this.allocTrainNo("回", 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "M", parity);
    if (type === "臨時") return this.allocTrainNo("臨", 9, [5, 6, 7, 8], "M", parity);
    if (type === "貨物") return this.allocTrainNo("", 6, [0, 1, 2, 3], "", parity);    // 時刻表に無い貨物 (ふつうは出ない)
    if (type === "特急") return this.allocTrainNo("", 6, [5, 6, 7], "M", parity);     // 名前の無い特急 (ふつうは出ない)
    const line = trainNoLineOf(type, trackId, startName, dest);
    const ends = [startName, dest].filter(Boolean);
    const mi = ends.map(_tnMainIdx).filter(i => i !== undefined);
    const K = STATION_MAP["京都"];
    if (type === "新快速") {
        let h = 6;
        if (line === "kosei" || (trackId || "").indexOf("Kosei") === 0 ||
            ends.some(n => _TN_SETS.kosei.has(n)) && !ends.some(n => n === "米原" || n === "長浜")) h = 3;
        else if (ends.some(n => ["米原", "長浜", "敦賀", "近江塩津", "彦根", "能登川"].indexOf(n) >= 0)) h = 4;
        else if (ends.some(n => ["網干", "上郡", "相生", "播州赤穂", "竜野", "英賀保"].indexOf(n) >= 0) ||
                 ends.some(n => _TN_SETS.ako.has(n))) h = 7;
        const hs = [h].concat([3, 4, 6, 7, 5].filter(x => x !== h));
        return this.allocTrainNo("", 3, hs, "M", parity);
    }
    if (type === "快速") {
        if (line === "tozai") {
            const p = _tnTozaiParts(startName, dest);
            // 宝塚線・尼崎止まりは M、JR神戸線への直通の快速も M (C は普通だけ)
            return this.allocTrainNo("", 5, [p.h, p.h === 4 ? 5 : 4], "M", parity);
        }
        if (line === "fukuchi") {
            const far = ends.some(n => ["篠山口", "福知山", "豊岡", "城崎温泉"].indexOf(n) >= 0);
            return this.allocTrainNo("", 2, far ? [8, 7] : [7, 8], "M", parity);
        }
        // 高槻〜明石 (西明石) の区間を通る快速は T
        const lo = mi.length ? Math.min.apply(null, mi) : 0, hi = mi.length ? Math.max.apply(null, mi) : 0;
        const crossesT = mi.length >= 1 && lo < STATION_MAP["高槻"] && hi > STATION_MAP["西明石"];
        const suffix = (line === "main" || crossesT) && line !== "kosei" ? "T" : "M";
        const east = mi.some(i => i > K);
        return this.allocTrainNo("", 0, east ? [7, 8] : [8, 7], suffix, parity);
    }
    // 普通
    if (line === "tozai") {
        const p = _tnTozaiParts(startName, dest);
        return this.allocTrainNo("", 4, [p.h, p.h === 4 ? 5 : 4], p.suffix, parity);
    }
    if (line === "fukuchi") {
        const far = ends.some(n => { const q = _tnFukuchiPos(n); return q !== null && q > _tnFukuchiPos("宝塚"); });
        return this.allocTrainNo("", 2, far ? [2, 3, 4, 1] : [1, 4, 3, 2], "M", parity);
    }
    if (line === "kosei") {
        let h = 1;
        if (ends.some(n => ["近江今津", "近江高島", "安曇川", "新旭", "近江中庄"].indexOf(n) >= 0)) h = 2;
        if (ends.some(n => ["マキノ", "永原", "近江塩津", "敦賀"].indexOf(n) >= 0)) h = 3;
        return this.allocTrainNo("", 1, [h].concat([1, 2, 3, 4].filter(x => x !== h)), "M", parity);
    }
    if (line === "biwako") {
        let h = 5;
        if (ends.some(n => ["米原", "彦根", "能登川", "近江八幡"].indexOf(n) >= 0)) h = 6;
        if (ends.some(n => n === "長浜")) h = 7;
        if (ends.some(n => ["敦賀", "近江塩津"].indexOf(n) >= 0)) h = 8;
        return this.allocTrainNo("", 1, [h].concat([5, 6, 7, 8, 9].filter(x => x !== h)), "M", parity);
    }
    if (line === "west") return this.allocTrainNo("", 0, [9], "M", parity);
    // JR京都線・JR神戸線の普通 (C)。百の位で区間
    let h = 5;
    if (mi.some(i => i > K)) h = 1;                                     // 琵琶湖線から直通
    else if (ends.indexOf("京都") >= 0) h = 2;
    else if (ends.indexOf("高槻") >= 0) h = 3;
    else if (ends.some(n => ["大阪", "新大阪", "尼崎", "吹田", "茨木"].indexOf(n) >= 0)) h = 4;
    else if (mi.some(i => i < STATION_MAP["西明石"])) h = 6;            // 加古川方面
    return this.allocTrainNo("", 0, [h].concat([1, 2, 3, 4, 5, 6].filter(x => x !== h)), "C", parity);
};

/* ------------------------------------------------------------------ 特急の列車番号 */
const TOKKYU_NUMBERING = {
    "はまかぜ": (n) => (10 + n) + "D",
    "Sはくと": (n) => (50 + n) + "D",
    "はるか": (n) => String(2000 + n) + "M",
    "こうのとり": (n) => String(3000 + n) + "M",
    "サンダーバード": (n) => String(4000 + n) + "M"
};
/** 特急の名前 (はるか5号) から列車番号 (2005M) を返す。名前の無い列車は trainNo のまま */
function tokkyuOfficialNo(name) {
    const m = /^(.+?)(\d+)号$/.exec(name || "");
    if (!m || !TOKKYU_NUMBERING[m[1]]) return null;
    return TOKKYU_NUMBERING[m[1]](Number(m[2]));
}
/** 号の数字を繰り返して2桁に収める (はまかぜ・スーパーはくとは2桁の番号にする) */
function tokkyuWrapNo(name, num) {
    const max = (name === "はまかぜ" || name === "Sはくと") ? 39 : 98;
    return num > max ? num - Math.floor((num - 1) / max) * max : num;
}

/** 列車番号 (公式の番号)。特急は名前から作った番号、ほかは trainNo から「回」などを除いたもの */
function trainOfficialNo(t) {
    if (!t) return "";
    if (t.type === "特急" || /号$/.test(t.trainNo || "")) return tokkyuOfficialNo(t.trainNo) || t.trainNo || "";
    return t.trainNo || "";
}

/* 無線での呼び方。数字は 1 ひと・2 ふた・3 さん・4 よん・5 ご・6 ろく・7 なな・8 はち・9 きゅう・0 まる、
   末尾は M メーター・D デコ・C シー・T ティー (例: 4442M … よんよんよんふた メーター) */
const TRAIN_NO_DIGIT_READ = { "0": "まる", "1": "ひと", "2": "ふた", "3": "さん", "4": "よん", "5": "ご",
                              "6": "ろく", "7": "なな", "8": "はち", "9": "きゅう" };
const TRAIN_NO_SUFFIX_READ = { "M": "メーター", "D": "デコ", "C": "シー", "T": "ティー", "レ": "列車" };
function trainNoReading(no) {
    const m = /^([^0-9]*)(\d+)([A-Zレ]?)$/.exec(no || "");
    if (!m) return "";
    const pre = m[1] === "回" ? "回送 " : m[1] === "臨" ? "臨時 " : m[1] === "試" ? "試運転 " : m[1] === "工" ? "工事臨 " :
                m[1] === "単" ? "単機 " : "";
    return pre + m[2].split("").map(d => TRAIN_NO_DIGIT_READ[d]).join("") + (m[3] ? " " + (TRAIN_NO_SUFFIX_READ[m[3]] || m[3]) : "");
}

/* ------------------------------------------------------------------ 種別の呼び方 */
/** 学研都市線の区間快速にするか (行先を決めたときに1回だけ決める) */
function gakkenSectionRapid(game, type, trackId, startName, dest) {
    if (type !== "快速" || globalThis.__NO_SECTION_RAPID) return false;
    if (trainNoLineOf(type, trackId, startName, dest) !== "tozai") return false;
    const h = ((game && game.currentTime) || 0) / 3600 % 24;
    // 同志社前駅の時刻表: 昼間の同志社前・木津発着は区間快速。夜の奈良行きも区間快速
    return (h >= 9.5 && h < 16.5) || dest === "奈良" || startName === "奈良";
}

/** 快速で走る区間 (「高槻〜西明石」など。各駅に停まるだけの列車は空) */
function rapidSectionText(t) {
    if (!t || t.type !== "快速") return "";
    const line = trainNoLineOf(t.type, t.trackId, t.startName, t.dest);
    const ends = [t.startName, t.dest].filter(Boolean);
    const parts = [];
    // JR京都線・JR神戸線: 高槻〜西明石。分岐線から来る列車は尼崎で本線に入る
    const toMain = (n) => {
        const i = _tnMainIdx(n);
        if (i !== undefined) return i;
        if (_TN_SETS.tozai.has(n) || _TN_SETS.fukuchi.has(n)) return STATION_MAP["尼崎"];
        if (_TN_SETS.kosei.has(n)) return STATION_MAP["山科"];
        if (_TN_SETS.ako.has(n)) return STATION_MAP["相生"];
        return undefined;
    };
    if (line !== "tozai" || ends.some(n => _tnMainIdx(n) !== undefined && _tnMainIdx(n) !== STATION_MAP["尼崎"])) {
        const mi = ends.map(toMain).filter(i => i !== undefined);
        if (mi.length === 2) {
            const lo = Math.max(Math.min(mi[0], mi[1]), STATION_MAP["西明石"]);
            const hi = Math.min(Math.max(mi[0], mi[1]), STATION_MAP["高槻"]);
            if (hi - lo >= 2) parts.push(STATIONS[hi].name + "〜" + STATIONS[lo].name);
        }
    }
    // JR宝塚線: 塚口〜川西池田 (猪名寺・北伊丹を通過)
    const fp = ends.map(n => _tnFukuchiPos(n) !== null ? _tnFukuchiPos(n) : (_tnMainIdx(n) !== undefined || _TN_SETS.tozai.has(n) ? -100 : null))
                   .filter(x => x !== null);
    if (ends.some(n => _TN_SETS.fukuchi.has(n)) && fp.length === 2 &&
        Math.min.apply(null, fp) <= _tnFukuchiPos("塚口") && Math.max.apply(null, fp) >= _tnFukuchiPos("川西池田")) parts.push("塚口〜川西池田");
    // 学研都市線: 京橋〜四条畷 (区間快速は鴫野・徳庵だけを通過)
    const tp = ends.map(n => _tnTozaiPos(n) !== null ? _tnTozaiPos(n) : (n === "奈良" ? 999 : -100));
    if (ends.some(n => _TN_SETS.tozai.has(n) || n === "奈良") &&
        Math.min.apply(null, tp) <= _tnTozaiPos("京橋") && Math.max.apply(null, tp) >= _tnTozaiPos("四条畷")) parts.push("京橋〜四条畷");
    return parts.join("・");
}

/** 画面に出す種別 (区間快速・丹波路快速・快速 (高槻〜西明石間 快速) …) */
function trainServiceName(t) {
    if (!t) return "";
    if (t.type !== "快速") return t.type || "";
    if (trainIsSectionRapid(t)) return "区間快速";
    const ends = [t.startName, t.dest];
    if (ends.some(n => ["篠山口", "福知山"].indexOf(n) >= 0) && ends.some(n => n === "大阪" || _tnMainIdx(n) > STATION_MAP["尼崎"])) return "丹波路快速";
    const sec = rapidSectionText(t);
    // 朝の京都発の快速は京都〜高槻で長岡京だけに停まる (js/24-service-rules.js の kyotoEarlyRapid)
    if (t.kyotoEarlyNo && t.kyotoEarlyNo === t.trainNo) return "快速 (京都〜高槻間 長岡京のみ停車" + (sec ? "・" + sec + "間 快速" : "") + ")";
    return sec ? "快速 (" + sec + "間 快速)" : "快速";
}
/** 短い種別 (表・札) */
function trainServiceShort(t) {
    if (!t) return "";
    if (t.type === "快速" && trainIsSectionRapid(t)) return "区間快速";
    const n = trainServiceName(t);
    return n === "丹波路快速" ? n : (t.type || "");
}

/* ------------------------------------------------------------------ 列車に付ける */
/** 学研都市線の区間快速か。列車番号が付いたとき (行先が決まったとき) に1回だけ決めて覚える */
function trainIsSectionRapid(t) {
    if (!t || t.type !== "快速") return false;
    if (t._srNo !== t.trainNo) {
        t._srNo = t.trainNo;
        t.sectionRapid = gakkenSectionRapid(t.game, t.type, t.trackId, t.startName, t.dest);
    }
    return !!t.sectionRapid;
}

/** 特急の号の数字を進める (下り = 奇数。はまかぜ・スーパーはくとは2桁の番号に収める) */
Spawner.prototype.tokkyuNext = function (name, key) {
    const c = this.tokkyuCounters[name];
    let num = c[key];
    c[key] += 2;
    const max = (name === "はまかぜ" || name === "Sはくと") ? 38 : 98;      // 偶数で割って奇偶を保つ
    while (num > max) num -= max;
    return num;
};

/* 列車としての下りの向き。サンダーバードは 大阪→敦賀 (この線路図の上り) が下り */
const TOKKYU_DOWN_DIR = { "サンダーバード": 1 };

/* 向きを変えた回送は番号を付け直す (下り = 奇数)。大阪で宮原へ引き上げるはずの回送が神戸方へ回されたときなど、
   番号を付けたあとで向きが変わることがある。実物でも向きが変われば別の列車番号になる */
(function () {
    const baseUpd = OperationsManager.prototype.update;
    OperationsManager.prototype.update = function (ct) {
        baseUpd.call(this, ct);
        for (const t of this.game.trains) {
            if (t.state === "finished" || t.type !== "回送" || t.workRun || t.workPermit) continue;
            const m = /^回(\d+)([MD])$/.exec(t.trainNo || "");
            if (!m || !t.dir) continue;
            const odd = Number(m[1]) % 2 === 1;
            if (odd === (t.dir === -1)) continue;
            const old = t.trainNo;
            this.game.spawner.activeTrainNos.delete(old);
            t.trainNo = this.deadheadNo(m[2], t.dir);
            if (t.dutyName === old) t.dutyName = t.trainNo;
        }
    };
})();

/** 列車番号の決まりに合っているかを見る (tools/check_train_numbers.js と、記録のため) */
function trainNoProblems(t) {
    const out = [];
    if (!t || !t.trainNo) return out;
    /* 文書の筋の事業用列車 (工臨・単機・試運転)・催しの臨時・貨物の時刻表の列車は、その文書・時刻表の番号のまま
       (貨物は列車の全体の向きで奇偶が決まり、この線路図の上り下りと合わないことがある) */
    if (t.workPermit || t.workRun || t.workTrain || t.eventTrainNo || t.type === "留置" || t.type === "貨物") return out;
    const no = trainOfficialNo(t);
    const m = /(\d+)([A-Zレ]?)$/.exec(no);
    if (!m) return out;
    const n = Number(m[1]);
    const tk = /^(.+?)\d+号$/.exec(t.trainNo || "");
    const downDir = (tk && TOKKYU_DOWN_DIR[tk[1]]) || -1;
    if (t.dir === downDir && n % 2 === 0) out.push("下りなのに偶数");
    if (t.dir === -downDir && n % 2 === 1) out.push("上りなのに奇数");
    if (TRAIN_NO_RETIRED.indexOf(m[1] + m[2]) >= 0) out.push("永久欠番");
    if (t.type === "特急" && !(n < 100 || (n >= 1000 && n <= 9999 && Math.floor(n / 100) % 10 === 0))) out.push("特急の桁");
    return out;
}

/* ★丹波路快速 (大阪〜篠山口・福知山の快速) は、すべて大阪始発 (利用者の指摘 2026-10)。
     尼崎・高槻など大阪以外の本線の駅から篠山口・福知山へ行く快速を作ろうとしたときは、新三田行きの快速にする。
     JR東西線・学研都市線からの直通 (丹波路快速ではない快速) はそのまま。 */
(function () {
    const baseAdd = GameSystem.prototype.addTrain;
    GameSystem.prototype.addTrain = function (c) {
        if (c && c.type === "快速" && !globalThis.__NO_TANBAJI_OSAKA && ["篠山口", "福知山"].indexOf(c.dest) >= 0 &&
            c.startName && c.startName !== "大阪" && _tnMainIdx(c.startName) !== undefined) {
            c.dest = "新三田";
            if (c.name && c.dutyName === c.name) c.dutyName = null;
        }
        return baseAdd.call(this, c);
    };
})();
