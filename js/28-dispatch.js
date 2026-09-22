/* 運転指令の実体。

   ■ なぜ1か所にまとめたか
     指令は
       ・旅客向け画面 (index.html) の指令パッド
       ・Super-TID 画面 (tid.html) の指令卓
       ・別のタブから送られてきた指令 (js/29-sim-bus.js)
     の3方向から来る。以前は画面ごとに同じ処理が書かれていたので、
     ここに集めて1つの実装にした。

   ■ 使い方
     どの画面からも game.dispatch({ name: "hold", trainId: ... }) の形で呼ぶ。
     シミュレーションを持っていないタブ (従側) の場合、
     game.dispatch() は指令を本体のタブへ転送する。
     指令の中身は列車番号ではなく列車ID (t.id) で指す。
     IDは本体のタブが配ったものを、従側もそのまま受け取っている。
*/

const DISPATCH = {

    /** 即時抑止 / 指定駅で抑止 */
    hold(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };
        if (cmd.at) {
            t.plannedStop = cmd.at;
            game.ui.updateBanner(`【指令】${t.trainNo} に ${cmd.at}駅での抑止を手配しました。`, "banner-orange");
            return { ok: true, msg: `${t.trainNo} を ${cmd.at} で抑止します。` };
        }
        t.isManuallySuspended = true;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = false;
        t.plannedStop = null;
        game.ui.updateBanner(`【指令】${t.trainNo} を即時抑止しました。`, "banner-orange");
        return { ok: true, msg: `${t.trainNo} を即時抑止しました。` };
    },

    /** 抑止解除 */
    release(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };
        t.isManuallySuspended = false;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = false;
        t.plannedStop = null;
        if (t.state === "holding") { t.state = "running"; t.timer = 15; }
        game.ui.updateBanner(`【指令】${t.trainNo} の抑止を解除しました。`, "banner-orange");
        return { ok: true, msg: `${t.trainNo} の抑止を解除しました。` };
    },

    /**
     * 強制発車。
     * 抑止を解いたうえで、続行間隔の自動判定を1回だけ飛ばす指令扱いの操作。
     * 自動の運転整理そのものは変えない。進路が開通していなければ発車しない。
     * 留置場で待機中の車両に対しては強制出区になる。
     */
    force(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };

        if (t.state === "in_depot") {
            if (!t.depotOutConfig) {
                return { ok: false, msg: "この編成には出区する運用が設定されていません。" };
            }
            t.forceDepotOut = true;
            t.timer = 0;
            t.tryDepotOut(t.startName, true);
            game.ui.updateBanner(
                `【指令介入】${t.trainNo || "予備車"} に ${t.startName}留置場からの強制出区を指示しました。`,
                "banner-orange");
            return { ok: true, msg: "強制出区を指示しました。" };
        }

        const wasHeld = t.isManuallySuspended || t.plannedStop;
        t.isManuallySuspended = false;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = false;
        t.plannedStop = null;
        t.forceStart = true;
        t.timer = 0;                       // 次のTickで発車判定に入る
        if (t.state === "holding") t.state = "running";
        if (t.nextAction === "wait_instruction") t.nextAction = "turnback";

        const blks = game.trackMgr.blocks[t.trackId];
        const blk = blks ? blks[t.currBlockIndex] : null;
        const where = blk ? (blockStationName(blk) || "駅間") : "駅間";
        game.ui.updateBanner(
            `【指令介入】${where}${wasHeld ? "で抑止中" : "停車中"}の ${t.trainNo} に強制発車を指示しました。`,
            "banner-orange");
        return { ok: true, msg: `${t.trainNo} に強制発車を指示しました。` };
    },

    /** 行先・種別・終着後の処置の変更 */
    change(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };
        const changed = [];

        if (cmd.type && cmd.type !== "no_change") {
            // その編成でその種別に変えられるかを確かめる (規則違反を作らない)
            if (!t.canChangeTypeTo(cmd.type)) {
                return { ok: false, msg: `いまの編成では ${cmd.type} に変更できません。` };
            }
            game.spawner.activeTrainNos.delete(t.trainNo);
            t.type = cmd.type;
            if (cmd.type === "回送" || cmd.type === "臨時") {
                t.trainNo = cmd.type.charAt(0) + String(t.trainNo).replace(/\D/g, "");
            }
            t.dutyName = t.trainNo;
            game.spawner.activeTrainNos.add(t.trainNo);
            changed.push("種別を" + cmd.type + "に変更");
        }
        if (cmd.dest) {
            t.dest = cmd.dest;
            t.isFinalStop = false;
            t.updateKoseiRoute();
            changed.push("行先を" + cmd.dest + "に変更");
        }
        if (cmd.action) { t.nextAction = cmd.action; changed.push("終着後の処置を変更"); }

        // 運行継続の判断待ちだった場合は、この指令で運転を再開させる
        if (t.isJudging) {
            t.isJudging = false;
            t.minorTrouble = false;
            t.troubleInfo = { active: false, cause: "", status: "" };
            t.state = "running"; t.timer = 15;
            changed.push("運転再開を指示");
        }
        if (!changed.length) return { ok: false, msg: "変更する内容がありません。" };
        game.ui.updateBanner(`【指令】${t.trainNo} — ${changed.join(" / ")}。`, "banner-orange");
        return { ok: true, msg: changed.join(" / ") };
    },

    /** 着発番線変更 (転線) の予約 */
    trackChange(game, cmd) {
        const t = game.getTrain(cmd.trainId);
        if (!t) return { ok: false, msg: "対象の列車が見つかりません。" };
        if (!cmd.station || !cmd.trackId) return { ok: false, msg: "駅と番線を選んでください。" };
        t.trackChangeReservation = {
            stationName: cmd.station, targetTrackId: cmd.trackId,
            targetLane: cmd.lane | 0, status: "pending"
        };
        game.ui.updateBanner(
            `【指令】${t.trainNo} に ${cmd.station}駅での着発番線変更を手配しました。`, "banner-orange");
        return { ok: true, msg: "転線を予約しました。" };
    },

    /** 留置場からの出区 */
    depotOut(game, cmd) {
        const dep = DEPOTS[cmd.depot];
        if (!dep) return { ok: false, msg: "留置場が見つかりません。" };
        const t = game.getTrain(cmd.trainId);
        if (!t || t.state !== "in_depot") return { ok: false, msg: "該当の車両が見つかりません。" };

        const sIdx = fleetIndexOf(cmd.depot);
        const dIdx = fleetIndexOf(cmd.dest);
        const dir = (sIdx !== null && dIdx !== null && dIdx < sIdx) ? -1 : 1;

        t.type = cmd.type;
        t.dest = cmd.dest;
        t.dir = dir;
        if (t.trainNo) game.spawner.activeTrainNos.delete(t.trainNo);
        t.trainNo = game.spawner.generateTrainNumber(cmd.type, dir, cmd.depot,
            depotTrackId(cmd.depot, dir, cmd.type));
        t.dutyName = t.trainNo;
        t.depotOutConfig = { type: cmd.type, dest: cmd.dest, trainNo: t.trainNo,
                             dir: dir, dutyName: t.trainNo };
        t.timer = (cmd.delayMin | 0) * 60;
        t.forceDepotOut = true;
        if (t.timer === 0) {
            t.tryDepotOut(cmd.depot, true);
        } else {
            game.ui.updateBanner(
                `【出区予約】${t.trainNo} は ${cmd.delayMin}分後に ${cmd.depot}留置場から出区します。`,
                "banner-orange");
        }
        return { ok: true, msg: `${t.trainNo} の出区を手配しました。` };
    },

    /** 運転見合わせの設定 */
    suspend(game, cmd) {
        const blks = game.trackMgr.blocks[cmd.trackId];
        if (!blks) return { ok: false, msg: "その線路はありません。" };
        const sIdx = STATION_MAP[cmd.from], eIdx = STATION_MAP[cmd.to];
        if (sIdx === undefined || eIdx === undefined) {
            return { ok: false, msg: "区間の両端の駅を選んでください。" };
        }
        const sB = blks.find(b => b.stationIdx === sIdx && b.x !== -1000);
        const eB = blks.find(b => b.stationIdx === eIdx && b.x !== -1000);
        if (!sB || !eB) return { ok: false, msg: "その線路にはこの区間がありません。" };
        // 両端の駅そのものは含めない (駅への進入と折り返しができるようにする)
        const lo = Math.min(sB.index, eB.index) + 1, hi = Math.max(sB.index, eB.index) - 1;
        if (lo > hi) return { ok: false, msg: "区間が短すぎます。" };
        game.trackMgr.manualSuspensions.push({ trackId: cmd.trackId, start: lo, end: hi });
        game.ui.updateBanner(`【指令】${cmd.from}〜${cmd.to} 間の運転を見合わせます。`, "banner-red");
        return { ok: true, msg: `${cmd.from}〜${cmd.to} を見合わせに設定しました。` };
    },

    /** 運転見合わせの全解除 */
    clearSuspend(game) {
        game.trackMgr.manualSuspensions = [];
        game.signals.clearFaults();
        game.trains.forEach(t => { if (t.state === "holding") { t.state = "running"; t.timer = 15; } });
        game.ui.updateBanner("【指令】運転見合わせを全て解除しました。", "banner-orange");
        return { ok: true, msg: "見合わせを全解除しました。" };
    },

    /** 防護無線の発報 */
    radio(game) {
        const inc = game.incidents.trigger("jinshin");
        if (!inc) {
            game.isEmergency = true;
            game.radioTimer = 180;
            const el = (typeof document !== "undefined") ? document.getElementById("emg-control") : null;
            if (el) el.style.display = "block";
            game.ui.updateBanner(
                "🚨【防護無線】指令により防護無線を発報しました。付近の列車は直ちに停車してください。",
                "banner-red");
        }
        return { ok: true, msg: "防護無線を発報しました。" };
    },

    /** 防護無線・見合わせの全解除 */
    clearRadio(game) {
        game.clearEmergency();
        return { ok: true, msg: "防護無線を解除しました。" };
    },

    /**
     * シミュレーション時間の進み方の倍率。
     * 変えるのは「1Tick進めるのに待つ実時間」だけで、
     * 1Tickの中身 (CONFIG.TICK_SEC) には触らない。
     * 2画面で開いているときは、本体のタブで時間が進むので
     * ここを通して共有する。
     */
    timeScale(game, cmd) {
        const v = setTimeScale(cmd.value);
        game.ui.updateBanner(
            `【設定】シミュレーション時間の進み方を ${v.toFixed(2)}倍にしました。`, "banner-blue");
        return { ok: true, msg: `時間の倍率を ${v.toFixed(2)}倍にしました。`, value: v };
    },

    /** 曜日の種別 (平日 / 土休日)。快速の走行線路の規則が変わる。 */
    dayType(game, cmd) {
        const v = setDayType(cmd.value);
        game.ui.updateBanner(
            `【設定】ダイヤを${v === "holiday" ? "土曜・日曜・祝日" : "平日"}に切り替えました。`,
            "banner-blue");
        return { ok: true, msg: "ダイヤの曜日を切り替えました。", value: v };
    }
};

/**
 * 指令を実行する。
 * シミュレーションを持っていないタブ (従側) なら、本体のタブへ転送する。
 */
GameSystem.prototype.dispatch = function (cmd) {
    if (this.bus && !this.bus.isHost) {
        this.bus.send(cmd);
        return { ok: true, msg: "指令を送信しました。", forwarded: true };
    }
    return this.applyCommand(cmd);
};

/** 指令をこのタブで実行する (本体のタブ、または転送されてきた指令) */
GameSystem.prototype.applyCommand = function (cmd) {
    const fn = DISPATCH[cmd && cmd.name];
    if (!fn) return { ok: false, msg: "不明な指令です。" };
    try {
        return fn(this, cmd) || { ok: true, msg: "" };
    } catch (e) {
        console.error("指令の実行に失敗しました", cmd, e);
        return { ok: false, msg: "指令の実行に失敗しました。" };
    }
};
