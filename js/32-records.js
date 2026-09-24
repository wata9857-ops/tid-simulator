/* 運転指令の記録簿 (指令連絡の記録 / 輸送障害の記録と報告書)。

   ■ なぜ別に持つか
     これまで、指令連絡も輸送障害も「運転指令ログ」「業務連絡」の流れの中に
     1行ずつ混ざって残るだけだった。あとから
       ・その連絡に誰がどう答えたか (指令 / 他の指令員が代行 / 当務の指令員)
       ・その輸送障害で、いつ何が起き、どの列車にどれだけ影響し、何をしたか
     を追えなかった。ログは200件で古いものから消えるので、朝の障害は昼には残らない。

   ■ ここが持つもの
     comms      … 指令連絡1件ごとの記録 (連絡 → 続報・催促 → 答え → 処置)
     incidents  … 輸送障害1件ごとの記録
                    発生・経過 (時系列)・運転規制・当該列車と編成・車両の状況・
                    巻き込まれた列車・指令の措置・乗務員との交信・復旧・輸送影響
     dispositions … 詰まりを防ぐために自動でとった措置 (js/27-operations.js の watchdog)

   ■ 報告書
     incidentReportHtml(id) が、社員向けの「輸送障害報告」を組み立てる。
     書いてあることは、すべてシミュレーションで実際に起きたこと
     (列車の位置・遅れ・抑止・運転整理・指令の操作) から作っている。
     乗務員との交信は、障害の種類ごとの定型 (js/26-incidents.js の crew) に、
     実際の列車番号と場所を当てはめたもの。

   ■ 乱数を使わない
     天候や乗車人員のような「それらしい値」も、時刻と列車番号から決める。
     ここで Math.random を使うと、シミュレーションの乱数の並びが変わり、
     同じ種 (seed) で走らせても結果が変わってしまう (検証ができなくなる)。
*/

const RECORDS_MAX_COMMS = 400;       // 指令連絡の記録を残す件数
const RECORDS_MAX_INCIDENTS = 80;    // 輸送障害の記録を残す件数
const RECORDS_SAMPLE_SEC = 60;       // 巻き込まれた列車を調べる間隔 [秒]

/** 文字列から決まる 0〜1 の値 (乱数の代わり) */
function recHash01(s) {
    let h = 2166136261 >>> 0;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return (h % 100000) / 100000;
}

/** ゲーム内の時刻 (秒) → "HH:MM" / "HH:MM:SS" */
function recClock(sec, withSec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600) % 24, m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return p(h) + ":" + p(m) + (withSec ? ":" + p(ss) : "");
}

/** 秒 → "N時間M分" / "M分" */
function recDuration(sec) {
    const m = Math.max(0, Math.round((sec || 0) / 60));
    if (m < 60) return m + "分";
    return Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "");
}

/** 線路IDの呼び名 */
function recTrackName(trackId) {
    const map = {
        Up_Out: "上り外側線 (列車線)", Up_In: "上り内側線 (電車線)",
        Down_In: "下り内側線 (電車線)", Down_Out: "下り外側線 (列車線)",
        Up_Hoppo: "北方貨物線 上り", Down_Hoppo: "北方貨物線 下り",
        Kosei_Up: "湖西線 上り", Kosei_Down: "湖西線 下り",
        Fukuchi_Up: "JR宝塚線 上り", Fukuchi_Down: "JR宝塚線 下り",
        Tozai_Up: "JR東西線 上り", Tozai_Down: "JR東西線 下り"
    };
    return map[trackId] || trackId;
}

/** 線区名 (その場所の線路と駅の位置から) */
function recLineName(trackId, stIdx) {
    if (trackId.indexOf("Kosei") === 0) return "湖西線";
    if (trackId.indexOf("Fukuchi") === 0) return "福知山線 (JR宝塚線)";
    if (trackId.indexOf("Tozai") === 0) return "JR東西線・片町線";
    if (trackId.indexOf("Hoppo") >= 0) return "東海道本線 (北方貨物線)";
    const i = (stIdx === undefined || stIdx === null) ? -1 : stIdx;
    if (i >= 0 && i <= STATION_MAP["神戸"]) return "山陽本線 (JR神戸線)";
    if (i > STATION_MAP["神戸"] && i <= STATION_MAP["大阪"]) return "東海道本線 (JR神戸線)";
    if (i > STATION_MAP["大阪"] && i <= STATION_MAP["京都"]) return "東海道本線 (JR京都線)";
    if (i > STATION_MAP["京都"] && i <= STATION_MAP["米原"]) return "東海道本線 (琵琶湖線)";
    if (i > STATION_MAP["米原"]) return "北陸本線 (琵琶湖線)";
    return "東海道・山陽本線";
}

/** 徐行の倍率 → 速度の目安 */
function recSlowSpeed(factor) {
    if (!factor) return "";
    if (factor >= 1.6) return "25km/h";
    if (factor >= 1.5) return "35km/h";
    if (factor >= 1.4) return "45km/h";
    if (factor >= 1.3) return "60km/h";
    return "75km/h";
}

/** 列車の編成の書き出し (記録用に、参照を持たない形にする) */
function recFormation(t) {
    return (t && t.vehicles ? t.vehicles : []).map(v => ({
        id: v.fullId || v.id, type: v.type || "", cars: v.cars || 0,
        group: v.group || "", base: (typeof FLEET_RESERVE !== "undefined" && FLEET_RESERVE[v.group])
            ? FLEET_RESERVE[v.group].base : ""
    }));
}

/** 記録からHTMLを作るときのエスケープ */
function recEsc(s) {
    return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class OpsRecords {
    constructor(game) {
        this.game = game;
        this.comms = [];           // 新しいものが先頭
        this.incidents = [];       // 新しいものが先頭
        this.dispositions = [];    // 詰まりを防ぐ措置
        this.seqByDay = 0;
    }

    now() { return this.game.currentTime; }

    // ============================================================ 指令連絡
    /** 連絡が届いたとき (js/31-comms.js の emit) */
    commRaised(p, scene, lvInfo) {
        const t = p._ctx && p._ctx.train;
        const rec = {
            id: p.id, at: p.at, level: p.level, levelLabel: (lvInfo && lvInfo.label) || p.level,
            cat: p.cat, from: p.from, title: p.title, text: p.text,
            trainNo: p.trainNo || "", trainType: t ? t.type : "", trainDest: t ? t.dest : "",
            where: t ? commWhere(this.game, t) : "",
            held: !!(lvInfo && lvInfo.hold),
            options: (p.options || []).map(o => o.label),
            timeline: [{ at: p.at, kind: "連絡", who: p.from, text: p.text }],
            answer: null, answeredBy: null, reply: null, resolvedAt: null, responseSec: null,
            status: (p.level === "minor") ? "当務の指令員が処理" : "応答待ち"
        };
        this.comms.unshift(rec);
        if (this.comms.length > RECORDS_MAX_COMMS) this.comms.pop();
        // 起きている輸送障害に関係する連絡は、その障害の記録にも残す
        this.incidents.forEach(inc => {
            if (inc.status !== "対応中") return;
            if (rec.trainNo && inc.trainNos && inc.trainNos.indexOf(rec.trainNo) >= 0) {
                inc.crewLog.push({ at: rec.at, who: rec.from, text: `【${rec.title}】${rec.text}` });
            }
        });
        return rec;
    }

    /** 続報・催促 */
    commFollow(p, kind, text) {
        const rec = this.comms.find(r => r.id === p.id);
        if (!rec || !text) return;
        rec.timeline.push({ at: this.now(), kind: kind, who: p.from, text: text });
    }

    /** 答えが決まったとき (js/31-comms.js の resolve) */
    commResolved(p, opt, byOther, quiet) {
        const rec = this.comms.find(r => r.id === p.id);
        if (!rec) return;
        rec.answer = opt ? opt.label : "";
        rec.reply = opt ? opt.reply : "";
        rec.answeredBy = quiet ? "当務の指令員" : (byOther ? "他の指令員 (代行)" : "指令 (本卓)");
        rec.resolvedAt = this.now();
        rec.responseSec = rec.resolvedAt - rec.at;
        rec.status = quiet ? "当務の指令員が処理" : (byOther ? "時間切れのため代行処理" : "指令が応答");
        rec.timeline.push({ at: rec.resolvedAt, kind: "指令の答え", who: rec.answeredBy,
                            text: (rec.answer ? "「" + rec.answer + "」 " : "") + (rec.reply || "") });
    }

    // ============================================================ 輸送障害
    /** 発生 (js/26-incidents.js の trigger) */
    incidentStarted(inc) {
        const g = this.game;
        const type = inc.type;
        const blks = g.trackMgr.blocks[inc.trackId] || [];
        const b = blks[inc.index];
        // 駅間ではブロックに駅の番号が無いので、位置から手前の駅を求める
        const stIdx = (b && b.stationIdx !== undefined) ? b.stationIdx : Math.floor(inc.index / UNITS_PER_STATION);
        this.seqByDay++;
        const no = "輸障第" + String(this.seqByDay).padStart(3, "0") + "号";
        const t = inc.train;

        // 当該列車が無い障害は、いちばん近くを走っている列車を「発見した列車」とする
        let finder = null;
        if (!t) {
            let best = 1e9;
            g.trains.forEach(x => {
                if (x.state === "finished" || x.state === "in_depot") return;
                if (parallelTracks(inc.trackId).indexOf(x.trackId) < 0) return;
                const d = (inc.index - x.currBlockIndex) * x.dir;
                if (d >= 0 && d < best && d <= UNITS_PER_STATION * 3) { best = d; finder = x; }
            });
        }
        const weatherList = ["晴れ", "晴れ", "曇り", "曇り", "小雨", "雨"];
        const weather = weatherList[Math.floor(recHash01(no + inc.place) * weatherList.length)];

        const section = this.sectionOf(inc);
        const rec = {
            id: inc.id, no: no, typeId: type.id, family: type.family || type.id,
            name: type.name, cat: type.cat || "", cause: type.cause || type.name,
            causeText: type.causeText || "調査中",
            place: inc.place, trackId: inc.trackId, index: inc.index,
            line: recLineName(inc.trackId, stIdx), section: section,
            weather: weather,
            startedAt: inc.startedAt, endedAt: null, endReason: "", forced: false,
            planSec: inc.totalSec, radio: !!type.radio,
            depts: (type.depts || []).slice(),
            status: "対応中", stage: inc.stage,
            train: t ? this.trainSnap(t) : null,
            finder: finder ? this.trainSnap(finder) : null,
            stock: (t && type.stock) ? type.stock : "",
            restrictions: [], timeline: [], actions: [], crewLog: [], recovery: [],
            affected: {}, trainNos: [], cancelled: [], shortTurned: [], deadheaded: [],
            slowUntil: null, maxDelaySec: 0
        };
        const tl = (text, kind) => rec.timeline.push({ at: this.now(), kind: kind || "経過", text: text });
        tl(`${rec.place}にて${rec.name}が発生。` + (t ? `当該列車 ${t.trainNo} (${t.type} ${t.dest}行き)。` : "") +
           (finder ? `${finder.trainNo} の運転士が発見・通報。` : ""), "発生");
        if (type.radio) {
            tl("防護無線を発報。付近を走行中の列車は直ちに停車。", "規制");
            rec.actions.push({ at: this.now(), by: "自動", text: "防護無線の発報 (併発事故の防止)" });
        }
        inc.suspensions.forEach(s => {
            rec.restrictions.push({ at: this.now(), kind: "運転見合わせ",
                text: `${recTrackName(s.trackId)} ${this.blockRangeText(s.trackId, s.start, s.end)}` });
        });
        inc.faults.forEach(f => {
            rec.restrictions.push({ at: this.now(), kind: "進路構成不能",
                text: `${recTrackName(f.trackId)} ${this.blockRangeText(f.trackId, f.start, f.end)} (停止現示)` });
        });
        if (inc.suspensions.length) tl(`${section} の運転を見合わせ。`, "規制");
        if (inc.faults.length) tl(`${section} の信号が停止現示となり、進路が構成できない。`, "規制");
        if (t) {
            rec.trainNos.push(t.trainNo);
            rec.actions.push({ at: this.now(), by: "自動", text: `当該列車 ${t.trainNo} をその場に停止` });
        }
        if (rec.depts.length) {
            rec.actions.push({ at: this.now(), by: "指令", text: "関係箇所へ手配: " + rec.depts.join("・") });
        }
        // 乗務員・現場との交信 (経過割合 0 のもの)
        rec._crewDone = {};
        this.emitCrew(inc, rec, 0);
        this.sampleAffected(inc, rec);
        this.incidents.unshift(rec);
        if (this.incidents.length > RECORDS_MAX_INCIDENTS) this.incidents.pop();
        return rec;
    }

    /** 障害の経過 (毎Tick、js/26-incidents.js の update から) */
    incidentTick(inc) {
        const rec = this.incidents.find(r => r.id === inc.id);
        if (!rec) return;
        const ratio = inc.totalSec > 0 ? 1 - (inc.timer / inc.totalSec) : 1;
        this.emitCrew(inc, rec, ratio);
        if ((this.now() - (rec._lastSample || 0)) >= RECORDS_SAMPLE_SEC) this.sampleAffected(inc, rec);
    }

    /** 復旧作業の段階が進んだ */
    incidentPhase(inc, ph) {
        const rec = this.incidents.find(r => r.id === inc.id);
        if (!rec) return;
        const p = inc.type.phases[ph];
        if (!p) return;
        rec.stage = p[1];
        rec.recovery.push({ at: this.now(), stage: p[1], text: p[2] });
        rec.timeline.push({ at: this.now(), kind: "復旧", text: `【${p[1]}】${p[2]}` });
    }

    /** 障害に関係する措置を足す (復旧回送・折り返しなど) */
    incidentAction(incId, text, by) {
        const rec = this.incidents.find(r => r.id === incId);
        if (!rec) return;
        rec.actions.push({ at: this.now(), by: by || "自動", text: text });
    }

    /** 復旧 (js/26-incidents.js の finish) */
    incidentFinished(inc, reason, silent) {
        const rec = this.incidents.find(r => r.id === inc.id);
        if (!rec) return;
        this.emitCrew(inc, rec, 1.01);
        this.sampleAffected(inc, rec);
        rec.endedAt = this.now();
        rec.endReason = reason || "";
        rec.forced = !!inc.forced;
        if (inc.type.slow) {
            rec.slowUntil = this.now() + inc.type.slow.sec;
            rec.restrictions.push({ at: this.now(), kind: "徐行",
                text: `${rec.section} 付近 ${recSlowSpeed(inc.type.slow.factor)} 徐行 ` +
                      `(${recClock(rec.slowUntil)} まで・約${recDuration(inc.type.slow.sec)})` });
        }
        rec.status = inc.type.slow ? "運転再開 (徐行中)" : "運転再開";
        rec.timeline.push({ at: this.now(), kind: "再開",
            text: `${reason || "復旧"}。${rec.section} の運転を再開。` +
                  (inc.type.slow ? `当面 ${recSlowSpeed(inc.type.slow.factor)} で徐行。` : "") });
        if (inc.forced) {
            rec.actions.push({ at: this.now(), by: "指令",
                text: "線路の直接支障が上限 (1時間) に達したため、設備を仮復旧して運転再開" });
        }
        if (/指令/.test(reason || "")) {
            rec.actions.push({ at: this.now(), by: "指令", text: "指令の判断により防護無線・見合わせを解除" });
        }
    }

    /** 巻き込まれた列車を調べる */
    sampleAffected(inc, rec) {
        rec._lastSample = this.now();
        const g = this.game;
        const tracks = parallelTracks(inc.trackId);
        const span = UNITS_PER_STATION * 8;
        g.trains.forEach(t => {
            if (t.state === "finished" || t.state === "in_depot") return;
            if (tracks.indexOf(t.trackId) < 0) return;
            const isOwn = inc.train === t;
            // 現場へ向かっている (現場の手前 8駅以内に居る) 列車だけを見る。
            // 現場を通り過ぎて離れていく列車は、この障害の影響ではない。
            const toward = (inc.index - t.currBlockIndex) * t.dir;
            if (!isOwn && !rec.affected[t.id] && (toward < -UNITS_PER_STATION || toward > span)) return;
            const stopped = t.stuckTime >= 60 || t.state === "holding" || t.isManuallySuspended || t.minorTrouble;
            if (!isOwn && !stopped && (t.delayTime || 0) < 180) return;
            const key = t.id;
            let a = rec.affected[key];
            if (!a) {
                a = rec.affected[key] = {
                    trainNo: t.trainNo, type: t.type, dest: t.dest, own: isOwn,
                    formation: recFormation(t).map(v => v.id).join("+"),
                    cars: recFormation(t).reduce((s, v) => s + v.cars, 0),
                    firstAt: this.now(), firstWhere: commWhere(g, t), maxDelaySec: 0, lastWhere: "",
                    status: ""
                };
                if (rec.trainNos.indexOf(t.trainNo) < 0) rec.trainNos.push(t.trainNo);
            }
            a.trainNo = t.trainNo || a.trainNo;
            a.type = t.type; a.dest = t.dest;
            a.maxDelaySec = Math.max(a.maxDelaySec, t.delayTime || 0);
            a.lastWhere = commWhere(g, t);
            a.status = t.minorTrouble ? "当該・停止中" : t.isManuallySuspended ? "抑止中"
                     : (t.stuckTime >= 60 || t.state === "holding") ? "停止・信号待ち" : "遅れて運転中";
            if (a.maxDelaySec > rec.maxDelaySec) rec.maxDelaySec = a.maxDelaySec;
        });
    }

    /** 障害の区間 ("A〜B間") */
    sectionOf(inc) {
        const blks = this.game.trackMgr.blocks[inc.trackId] || [];
        let lo = inc.index, hi = inc.index;
        (inc.suspensions.concat(inc.faults)).forEach(s => {
            lo = Math.min(lo, s.start); hi = Math.max(hi, s.end);
        });
        return this.blockRangeText(inc.trackId, lo, hi, blks) || inc.place;
    }

    /** ブロックの範囲を「A〜B間」と呼ぶ */
    blockRangeText(trackId, lo, hi, blks0) {
        const blks = blks0 || this.game.trackMgr.blocks[trackId] || [];
        const nameAt = (i, step) => {
            for (let k = 0; k < UNITS_PER_STATION * 3; k++) {
                const b = blks[i + step * k];
                if (b && b.x !== -1000 && isRealStationBlock(b)) return blockStationName(b);
            }
            return "";
        };
        const a = nameAt(lo, -1), b = nameAt(hi, +1);
        if (a && b && a !== b) return a + "〜" + b + "間";
        return a || b || "";
    }

    /** 乗務員・現場との交信 (定型に実際の列車番号・場所を当てはめる) */
    emitCrew(inc, rec, ratio) {
        const list = inc.type.crew || [];
        const no = rec.train ? rec.train.trainNo : (rec.finder ? rec.finder.trainNo : "付近の列車");
        const loc = inc.place.replace(/駅$/, "");
        list.forEach((c, i) => {
            if (rec._crewDone[i] || ratio < c[0]) return;
            rec._crewDone[i] = true;
            const fill = (s) => String(s).replace(/\{no\}/g, no).replace(/\{loc\}/g, loc);
            rec.crewLog.push({ at: this.now(), who: fill(c[1]), text: fill(c[2]) });
        });
    }

    /** 列車の書き出し (参照を持たない) */
    trainSnap(t) {
        const f = recFormation(t);
        return {
            trainNo: t.trainNo, type: t.type, dest: t.dest, start: t.startName || "",
            dir: t.dir, track: recTrackName(t.trackId),
            where: commWhere(this.game, t), delayMin: Math.floor((t.delayTime || 0) / 60),
            formation: f, cars: f.reduce((s, v) => s + v.cars, 0),
            // 乗車人員の目安 (時間帯と両数から。実数ではないので「推定」と書く)
            riders: this.estimateRiders(t, f)
        };
    }

    estimateRiders(t, f) {
        const cars = f.reduce((s, v) => s + v.cars, 0) || 4;
        if (["回送", "貨物"].indexOf(t.type) >= 0) return 0;
        const h = (this.game.currentTime / 3600) % 24;
        const rush = (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5);
        const per = rush ? 140 : (h >= 22 || h < 6) ? 30 : 70;
        const k = 0.8 + recHash01(t.trainNo + ":" + Math.floor(this.game.currentTime / 600)) * 0.4;
        return Math.round(cars * per * k / 10) * 10;
    }

    // ============================================================ 指令の措置
    /** 指令の操作 (js/28-dispatch.js の applyCommand を通るもの) */
    dispatcherCommand(cmd, r) {
        if (!cmd || !r || !r.ok) return;
        const ignore = ["timeScale", "dayType"];
        if (ignore.indexOf(cmd.name) >= 0) return;
        const active = this.incidents.filter(x => x.status === "対応中");
        if (!active.length) return;
        const names = {
            hold: "抑止", release: "抑止解除", force: "強制発車", change: "行先・種別の変更",
            trackChange: "着発番線の変更", depotOut: "出区", suspend: "運転見合わせの設定",
            clearSuspend: "見合わせの全解除", radio: "防護無線の発報", clearRadio: "防護無線の解除",
            comm: "指令連絡への応答"
        };
        const t = cmd.trainId ? this.game.getTrain(cmd.trainId) : null;
        const text = (names[cmd.name] || cmd.name) + (t && t.trainNo ? ` (${t.trainNo})` : "") +
                     (r.msg ? " — " + r.msg : "");
        /* 画面の指令員が出したものは「指令」、指令連絡を別の指令員が処理したものは「指令(代行)」。
           障害に関係する列車・駅への指令と、線区全体への指令 (見合わせ・防護無線) だけを載せる。 */
        const by = cmd.by || "指令 (代行)";
        const global = ["suspend", "clearSuspend", "radio", "clearRadio"].indexOf(cmd.name) >= 0;
        active.forEach(rec => {
            const names2 = this.sectionStations(rec);
            const related = global ||
                (t && rec.trainNos.indexOf(t.trainNo) >= 0) ||
                (t && names2.indexOf(commWhere(this.game, t).replace(/駅$|〜次駅間$/, "")) >= 0) ||
                (cmd.at && names2.indexOf(cmd.at) >= 0) || (cmd.station && names2.indexOf(cmd.station) >= 0);
            if (related) rec.actions.push({ at: this.now(), by: by, text: text });
        });
    }

    /** 運転指令ログに出た運転整理のうち、障害の区間に関わるものを措置として拾う */
    onBanner(msg, cls) {
        const active = this.incidents.filter(x => x.status === "対応中");
        if (!active.length || !msg) return;
        /* 指令の操作 (【指令】【指令介入】) は dispatcherCommand が同じものを記録するので、
           ここでは自動の運転整理だけを拾う (二重に載せない)。 */
        if (!/【(運転整理|運休|返却回送)】/.test(msg)) return;
        active.forEach(rec => {
            const names = this.sectionStations(rec);
            const hit = rec.trainNos.some(no => no && msg.indexOf(no) >= 0) ||
                        names.some(n => msg.indexOf(n) >= 0);
            if (!hit) return;
            // 留置場の出区の見合わせは、障害の区間の外の話であることが多い
            if (/留置場/.test(msg) && !names.some(n => msg.indexOf(n + "留置場") >= 0)) return;
            if (rec.actions.length > 120) return;
            const body = msg.replace(/^.*?【[^】]+】\s*/, "");
            const kind = (msg.match(/【([^】]+)】/) || [])[1] || "";
            rec.actions.push({ at: this.now(), by: kind.indexOf("指令") === 0 ? "指令" : "運転整理", text: body });
            if (kind === "運休") rec.cancelled.push(body);
            if (/折り返/.test(msg)) rec.shortTurned.push(body);
            if (/回送/.test(msg)) rec.deadheaded.push(body);
        });
    }

    /** 障害の区間の前後の駅名 (措置を拾うときの手がかり) */
    sectionStations(rec) {
        if (rec._stations) return rec._stations;
        const blks = this.game.trackMgr.blocks[rec.trackId] || [];
        const out = [];
        for (let k = -UNITS_PER_STATION * 6; k <= UNITS_PER_STATION * 6; k++) {
            const b = blks[rec.index + k];
            if (b && b.x !== -1000 && isRealStationBlock(b)) {
                const n = blockStationName(b);
                if (n && out.indexOf(n) < 0) out.push(n);
            }
        }
        rec._stations = out;
        return out;
    }

    /** 詰まりを防ぐために自動でとった措置 (js/27-operations.js の watchdog など) */
    noteDisposition(t, where, reason, how) {
        const d = { at: this.now(), trainNo: t ? t.trainNo : "", where: where || "", reason: reason, how: how };
        this.dispositions.unshift(d);
        if (this.dispositions.length > 200) this.dispositions.pop();
        this.incidents.filter(x => x.status === "対応中").forEach(rec => {
            if (t && rec.trainNos.indexOf(t.trainNo) >= 0) {
                rec.actions.push({ at: this.now(), by: "運転整理", text: `${d.trainNo} ${reason}ため${how}` });
            }
        });
    }

    /** いまの状況 (対応中 / 徐行中 / 平常)。一覧と報告書で同じものを出す */
    statusText(r) {
        if (!r.endedAt) return "対応中";
        if (r.slowUntil && this.now() < r.slowUntil) return "運転再開 (徐行中)";
        return "平常運転に復帰";
    }

    // ============================================================ 画面・共有
    /** 一覧 (画面・従側の画面へ流す形) */
    commList(n) { return this.comms.slice(0, n || 150).map(r => this.plain(r)); }
    incidentList(n) { return this.incidents.slice(0, n || 40).map(r => this.plain(r)); }

    /** 参照・内部の印を持たない写し */
    plain(r) {
        const o = {};
        for (const k in r) if (k.charAt(0) !== "_") o[k] = r[k];
        return JSON.parse(JSON.stringify(o));
    }

    /** 従側の画面で、本体から届いた記録を受け取る */
    load(snap) {
        if (!snap) return;
        if (snap.comms) this.comms = snap.comms;
        if (snap.incidents) this.incidents = snap.incidents;
        if (snap.dispositions) this.dispositions = snap.dispositions;
    }

    snapshot() {
        return { comms: this.commList(150), incidents: this.incidentList(30),
                 dispositions: this.dispositions.slice(0, 50) };
    }

    // ============================================================ 報告書
    /** 輸送障害の報告書 (社員限り) を HTML で */
    incidentReportHtml(id) {
        const r = this.incidents.find(x => x.id === id);
        if (!r) return '<p class="rec-empty">該当する記録がありません。</p>';
        const D = this.reportData(r);
        const kv = (k, v) => `<tr><th>${recEsc(k)}</th><td>${v}</td></tr>`;
        const sec = (n, title, body) =>
            `<section class="rec-sec"><h3><span>${n}</span>${recEsc(title)}</h3>${body}</section>`;
        const list = (arr, empty) => arr.length
            ? "<ul>" + arr.map(x => "<li>" + x + "</li>").join("") + "</ul>"
            : `<p class="rec-none">${recEsc(empty || "記録なし")}</p>`;
        const tl = (arr) => arr.length
            ? '<table class="rec-tl"><tbody>' + arr.map(x =>
                `<tr><td class="rec-t">${recEsc(recClock(x.at, true))}</td>` +
                (x.kind ? `<td class="rec-k">${recEsc(x.kind)}</td>` : "") +
                `<td>${x.html || recEsc(x.text)}</td></tr>`).join("") + "</tbody></table>"
            : '<p class="rec-none">記録なし</p>';

        const head =
            '<div class="rec-stamp">部外秘・社員限り</div>' +
            `<h2 class="rec-title">輸送障害報告 <small>${recEsc(D.final ? "(確定)" : "(速報・対応中)")}</small></h2>` +
            '<div class="rec-from">大阪総合指令所 輸送指令 作成</div>' +
            '<table class="rec-kv"><tbody>' +
            kv("報告番号", recEsc(r.no)) +
            kv("区分", recEsc(r.cat || "—") + " / " + recEsc(r.name)) +
            kv("発生日時", "本日 " + recEsc(recClock(r.startedAt, true))) +
            kv("発生場所", recEsc(r.line) + " " + recEsc(r.place) + " (" + recEsc(recTrackName(r.trackId)) + ")") +
            kv("支障区間", recEsc(r.section || r.place)) +
            kv("天候", recEsc(r.weather)) +
            kv("当該列車", r.train ? recEsc(`${r.train.trainNo} (${r.train.type} ${r.train.start}発 ${r.train.dest}行き)`) : "なし (設備・外部要因)") +
            kv("運転再開", r.endedAt ? recEsc(recClock(r.endedAt, true)) + " (支障時間 " + recEsc(recDuration(r.endedAt - r.startedAt)) + ")" : "未 (対応中・経過 " + recEsc(recDuration(this.now() - r.startedAt)) + ")") +
            kv("現況", `<b>${recEsc(D.statusNow)}</b>`) +
            "</tbody></table>";

        let n = 0;
        const body = [
            sec(++n, "概況", `<p>${recEsc(D.summary)}</p>`),
            sec(++n, "発生状況・原因", `<p>${recEsc(r.causeText)}</p>` +
                (r.finder ? `<p>発見: ${recEsc(r.finder.trainNo)} (${recEsc(r.finder.type)} ${recEsc(r.finder.dest)}行き) の運転士が ${recEsc(r.finder.where)} で認め、指令へ通報。</p>` : "") +
                `<p class="rec-note">原因は判明している範囲で記載。詳細は関係箇所で調査中。</p>`),
            sec(++n, "当該列車・編成", r.train ? (
                '<table class="rec-kv"><tbody>' +
                kv("列車番号", recEsc(r.train.trainNo)) +
                kv("種別・行先", recEsc(`${r.train.type} ${r.train.start}発 ${r.train.dest}行き`)) +
                kv("発生時の位置", recEsc(r.train.where + " / " + r.train.track)) +
                kv("編成", r.train.formation.length ? r.train.formation.map(v =>
                    recEsc(`${v.id} ${v.type} ${v.cars}両${v.base ? " (" + v.base + ")" : ""}`)).join("<br>") : "—") +
                kv("両数", recEsc(r.train.cars + "両")) +
                kv("乗車人員", r.train.riders ? recEsc("約" + r.train.riders + "名 (推定)") : "なし (回送)") +
                kv("乗務員", "運転士 1名・車掌 1名 (当該乗務区所)") +
                "</tbody></table>") : '<p class="rec-none">当該列車なし (設備故障・外部要因)。</p>'),
            sec(++n, "車両の状況", `<p>${recEsc(r.stock || (r.train ? "異常なし" : "該当なし"))}</p>` +
                (D.ownAfter ? `<p>${recEsc(D.ownAfter)}</p>` : "")),
            sec(++n, "運転規制", list(r.restrictions.map(x =>
                `<b>${recEsc(recClock(x.at))} ${recEsc(x.kind)}</b> ${recEsc(x.text)}`), "運転規制なし")),
            sec(++n, "経過", tl(r.timeline)),
            sec(++n, "指令の措置・運転整理", tl(r.actions.map(x => ({ at: x.at, kind: x.by, text: x.text })))),
            sec(++n, "乗務員・現場との交信", tl(r.crewLog.map(x => ({ at: x.at, kind: x.who, text: x.text })))),
            sec(++n, "復旧措置", tl(r.recovery.map(x => ({ at: x.at, kind: x.stage, text: x.text })))),
            sec(++n, "輸送影響", '<table class="rec-kv"><tbody>' +
                kv("影響列車", recEsc(D.affectedCount + "本")) +
                kv("最大遅延", recEsc(D.maxDelayMin + "分")) +
                kv("遅延の合計", recEsc(D.totalDelayMin + "分 (影響列車の遅れの計)")) +
                kv("運休", recEsc(D.cancelled + "本")) +
                kv("区間運休・折り返し", recEsc(D.shortTurned + "本")) +
                kv("回送打ち切り", recEsc(D.deadheaded + "本")) +
                kv("影響人員", recEsc("約" + D.riders.toLocaleString("ja-JP") + "名 (推定)")) +
                "</tbody></table>" + D.affectedTable),
            sec(++n, "現況・今後の見込み", `<p>${recEsc(D.outlook)}</p>`)
        ].join("");

        return `<div class="rec-report">${head}${body}` +
            '<p class="rec-foot">本報告は指令所の記録に基づく。調査の進捗により内容を訂正することがある。' +
            '社外への提供・転載を禁ずる。</p></div>';
    }

    /** 報告書の数値・文章をまとめる */
    reportData(r) {
        const aff = Object.keys(r.affected).map(k => r.affected[k]);
        aff.sort((a, b) => b.maxDelaySec - a.maxDelaySec);
        const final = !!r.endedAt;
        const totalDelay = aff.reduce((s, a) => s + a.maxDelaySec, 0);
        const riders = aff.reduce((s, a) => {
            if (["回送", "貨物"].indexOf(a.type) >= 0) return s;
            return s + Math.round((a.cars || 4) * 70 * (0.8 + recHash01(a.trainNo) * 0.4));
        }, 0);
        const now = this.now();
        const slowing = r.slowUntil && now < r.slowUntil;
        const statusNow = !final ? `対応中 (${r.stage || "支障中"})`
                        : slowing ? `運転再開・徐行中 (${recClock(r.slowUntil)} まで)`
                        : "平常運転に復帰";
        const summary =
            `${recClock(r.startedAt)}ごろ、${r.line} ${r.place}において${r.name}が発生した。` +
            (r.train ? `当該列車は ${r.train.trainNo} (${r.train.type} ${r.train.dest}行き・${r.train.cars}両)。` : "") +
            (r.radio ? "防護無線を発報して付近の列車を停止させ、" : "") +
            (r.restrictions.some(x => x.kind !== "徐行") ? `${r.section} の運転を見合わせた。` : "当該列車の停止で対応した。") +
            (final ? `${recClock(r.endedAt)}に運転を再開 (支障時間 ${recDuration(r.endedAt - r.startedAt)})。` : "現在も対応中。") +
            `この影響で ${aff.length}本の列車に最大${Math.round(r.maxDelaySec / 60)}分の遅れが生じた。`;
        const ownAfter = !r.train ? "" :
            (r.deadheaded.some(x => x.indexOf(r.train.trainNo) >= 0)
                ? `当該列車 ${r.train.trainNo} は営業を取りやめ、回送として車両所へ入区。`
                : (final ? `当該列車 ${r.train.trainNo} は処置完了後、運転を継続。` : ""));
        const outlook = !final
            ? `復旧作業は「${r.stage || "支障中"}」の段階。再開は関係箇所の報告を受けて判断する。` +
              "並行して、支障区間の手前での折り返し・抑止により後続列車の駅間停車を防いでいる。"
            : (slowing
                ? `${recClock(r.slowUntil)}まで現場付近は徐行運転。ダイヤの乱れは折り返し駅での整理により順次回復させる。`
                : "徐行も解除し、ダイヤは平常に戻りつつある。遅れの残る列車は折り返しで回復を図る。");
        const rows = aff.slice(0, 40).map(a =>
            `<tr${a.own ? ' class="rec-own"' : ""}><td>${recEsc(a.trainNo)}</td><td>${recEsc(a.type)}</td>` +
            `<td>${recEsc(a.dest)}</td><td>${recEsc(a.formation || "")}</td>` +
            `<td>${recEsc(a.firstWhere)}</td><td class="rec-num">${Math.round(a.maxDelaySec / 60)}分</td>` +
            `<td>${recEsc(a.own ? "当該" : a.status)}</td></tr>`).join("");
        const affectedTable = aff.length
            ? '<table class="rec-aff"><thead><tr><th>列車</th><th>種別</th><th>行先</th><th>編成</th>' +
              '<th>影響を受けた位置</th><th>最大遅延</th><th>状態</th></tr></thead><tbody>' + rows + "</tbody></table>" +
              (aff.length > 40 ? `<p class="rec-note">ほか ${aff.length - 40}本</p>` : "")
            : '<p class="rec-none">影響を受けた列車の記録なし</p>';
        return {
            final: final, statusNow: statusNow, summary: summary, outlook: outlook, ownAfter: ownAfter,
            affectedCount: aff.length, maxDelayMin: Math.round(r.maxDelaySec / 60),
            totalDelayMin: Math.round(totalDelay / 60), riders: Math.round(riders / 100) * 100,
            cancelled: r.cancelled.length, shortTurned: r.shortTurned.length, deadheaded: r.deadheaded.length,
            affectedTable: affectedTable
        };
    }

    /** 報告書を文字だけで (保存・貼り付け用) */
    incidentReportText(id) {
        const r = this.incidents.find(x => x.id === id);
        if (!r) return "";
        const D = this.reportData(r);
        const L = [];
        const line = "―".repeat(30);
        L.push("【部外秘・社員限り】");
        L.push("輸送障害報告 " + (D.final ? "(確定)" : "(速報・対応中)"));
        L.push("大阪総合指令所 輸送指令 作成");
        L.push(line);
        L.push("報告番号　" + r.no);
        L.push("区分　　　" + (r.cat || "—") + " / " + r.name);
        L.push("発生日時　本日 " + recClock(r.startedAt, true));
        L.push("発生場所　" + r.line + " " + r.place + " (" + recTrackName(r.trackId) + ")");
        L.push("支障区間　" + (r.section || r.place));
        L.push("天候　　　" + r.weather);
        L.push("当該列車　" + (r.train ? `${r.train.trainNo} (${r.train.type} ${r.train.start}発 ${r.train.dest}行き)` : "なし"));
        L.push("運転再開　" + (r.endedAt ? recClock(r.endedAt, true) + " (支障時間 " + recDuration(r.endedAt - r.startedAt) + ")" : "未 (対応中)"));
        L.push("現況　　　" + D.statusNow);
        L.push(line);
        L.push("1. 概況"); L.push("　" + D.summary);
        L.push("2. 発生状況・原因"); L.push("　" + r.causeText);
        if (r.train) {
            L.push("3. 当該列車・編成");
            L.push("　" + `${r.train.trainNo} ${r.train.type} ${r.train.start}発 ${r.train.dest}行き ${r.train.cars}両`);
            r.train.formation.forEach(v => L.push("　　" + `${v.id} ${v.type} ${v.cars}両 ${v.base}`));
            if (r.train.riders) L.push("　乗車人員 約" + r.train.riders + "名 (推定)");
        } else {
            L.push("3. 当該列車・編成"); L.push("　なし (設備故障・外部要因)");
        }
        L.push("4. 車両の状況"); L.push("　" + (r.stock || "該当なし")); if (D.ownAfter) L.push("　" + D.ownAfter);
        L.push("5. 運転規制"); r.restrictions.forEach(x => L.push("　" + recClock(x.at) + " " + x.kind + " " + x.text));
        L.push("6. 経過"); r.timeline.forEach(x => L.push("　" + recClock(x.at, true) + " [" + x.kind + "] " + x.text));
        L.push("7. 指令の措置・運転整理"); r.actions.forEach(x => L.push("　" + recClock(x.at, true) + " (" + x.by + ") " + x.text));
        L.push("8. 乗務員・現場との交信"); r.crewLog.forEach(x => L.push("　" + recClock(x.at, true) + " " + x.who + "「" + x.text + "」"));
        L.push("9. 復旧措置"); r.recovery.forEach(x => L.push("　" + recClock(x.at, true) + " " + x.stage + " " + x.text));
        L.push("10. 輸送影響");
        L.push(`　影響列車 ${D.affectedCount}本 / 最大遅延 ${D.maxDelayMin}分 / 遅延の合計 ${D.totalDelayMin}分`);
        L.push(`　運休 ${D.cancelled}本 / 区間運休・折り返し ${D.shortTurned}本 / 回送打ち切り ${D.deadheaded}本 / 影響人員 約${D.riders.toLocaleString("ja-JP")}名 (推定)`);
        Object.keys(r.affected).map(k => r.affected[k]).sort((a, b) => b.maxDelaySec - a.maxDelaySec).slice(0, 40)
            .forEach(a => L.push(`　　${a.trainNo} ${a.type} ${a.dest}行き ${a.formation} 最大${Math.round(a.maxDelaySec / 60)}分 ${a.own ? "当該" : a.status}`));
        L.push("11. 現況・今後の見込み"); L.push("　" + D.outlook);
        L.push(line);
        L.push("本報告は指令所の記録に基づく。調査の進捗により内容を訂正することがある。社外への提供・転載を禁ずる。");
        return L.join("\n");
    }
}
