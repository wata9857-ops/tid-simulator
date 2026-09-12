/* 輸送障害(事故・故障)の管理。

   ■ 考え方
     以前は「メッセージを出して列車を1本止める」だけで、
     まわりの列車や信号にはほとんど影響がなかった。
     ここでは、実際の輸送障害と同じように
       発生 → 初動(防護無線) → 区間支障 → 復旧作業 → 運転再開 → 徐行 → 平常
     という段階を踏み、それぞれの段階が
       ・運転見合わせ区間        (TrackManager.manualSuspensions)
       ・信号の停止現示          (SignalSystem.faults)
       ・徐行(速度規制)          (TrackManager.speedRestrictions)
       ・当該列車の停止・打ち切り (Train.minorTrouble / 回送化)
     として、実際のシミュレーションの状態を書き換える。
     そのため、後続列車は自然に詰まり、遅れが積み上がり、
     復旧後もその遅れを引きずったまま運転が続く。

   ■ 直接支障の上限
     遊びとして成り立たなくなるので、1件の輸送障害が
     線路を直接止め続けるのは最大1時間 (INCIDENT_MAX_BLOCK_SEC)。
     時間が来たら列車を瞬間移動させるのではなく、
     「設備の復旧が終わって運転再開、ただししばらく徐行」という形で解く。
     溜まった遅れはそのまま残り、ダイヤの乱れとして波及し続ける。
*/

// 1件の輸送障害が線路を直接止められる上限 (ゲーム内時間)
const INCIDENT_MAX_BLOCK_SEC = 3600;

/* 輸送障害の種類。
     id        … 識別子
     name      … 画面に出す名前
     weight    … 発生しやすさ
     needTrain … 当該列車が要るか
     radio     … 防護無線を発報するか
     block     … 線路を止める範囲 (null なら止めない)
                   { tracks:"same"|"parallel"|"all", radius: ブロック数 }
     hold      … 当該列車を止める秒数 [最小,最大]
     suspend   … 区間支障の秒数 [最小,最大]
     slow      … 復旧後の徐行 { sec, factor }
     fault     … 信号・転てつ器の故障として扱うか
     after     … 当該列車の後始末 "resume"(運転再開) / "deadhead"(回送打ち切り) / "rescue"(救援)
     phases    … 復旧作業の進み具合 (経過割合, 状況)
*/
const INCIDENT_TYPES = [
    {
        id: "jinshin", name: "人身事故", weight: 7, needTrain: true, radio: true,
        block: { tracks: "parallel", radius: 5 },
        hold: [1500, 2700], suspend: [1500, 2700],
        slow: { sec: 900, factor: 1.5 },
        after: "deadhead",
        cause: "人身事故",
        first: (loc) => `${loc}にて人身事故が発生しました。防護無線を発報、付近の列車は直ちに停車してください。`,
        phases: [
            [0.00, "警察・消防手配中", "現場へ警察・消防が向かっています。乗務員が現場確認中です。"],
            [0.20, "救護活動中", "救護活動を開始しました。ホーム上のお客様の避難誘導を実施中です。"],
            [0.50, "現場検証中", "救護活動は完了。警察による実況見分および車両の床下点検を行っています。"],
            [0.80, "最終安全確認", "現場検証が終了し、線路設備の安全確認を行っています。"]
        ]
    },
    {
        id: "kasen", name: "架線障害", weight: 4, needTrain: false, radio: false,
        block: { tracks: "parallel", radius: 4 },
        hold: null, suspend: [1200, 2700],
        slow: { sec: 900, factor: 1.4 },
        after: null,
        cause: "架線障害",
        first: (loc) => `${loc}付近で架線に飛来物が接触し、送電を停止しました。当該区間は運転を見合わせます。`,
        phases: [
            [0.00, "電力区手配中", "電力区の作業員が現場へ向かっています。"],
            [0.30, "き電停止・確認中", "き電を停止し、架線および付属設備の状態を確認しています。"],
            [0.65, "復旧作業中", "架線の補修作業を行っています。"],
            [0.85, "き電再開・試験中", "き電を再開し、試験電車による確認を行います。"]
        ]
    },
    {
        id: "shingo", name: "信号設備故障", weight: 5, needTrain: false, radio: false,
        block: { tracks: "same", radius: 3 }, fault: true,
        hold: null, suspend: [900, 2100],
        slow: { sec: 1200, factor: 1.6 },
        after: null,
        cause: "信号故障",
        first: (loc) => `${loc}の閉塞信号機が停止現示のまま復帰しません。当該区間は進路が構成できません。`,
        phases: [
            [0.00, "信号通信区手配中", "信号通信区の係員が現場へ向かっています。"],
            [0.35, "機器点検中", "信号機器室にて連動装置の点検を行っています。"],
            [0.70, "代用手信号準備", "復旧の見込みが立たないため、代用手信号による運転の準備をしています。"],
            [0.88, "動作試験中", "機器を復旧し、動作試験を行っています。"]
        ]
    },
    {
        id: "tentetsu", name: "転てつ器故障", weight: 4, needTrain: false, radio: false,
        block: { tracks: "same", radius: 1 }, fault: true, atStation: true,
        hold: null, suspend: [600, 1800],
        slow: { sec: 600, factor: 1.3 },
        after: null,
        cause: "転てつ器故障",
        first: (loc) => `${loc}構内の転てつ器が転換不能となりました。当該番線への進路が構成できません。`,
        phases: [
            [0.00, "係員手配中", "施設区の係員が現場へ向かっています。"],
            [0.40, "転てつ器点検中", "転換不能の原因を調査しています。"],
            [0.75, "手動転換・鎖錠", "転てつ器を手動で転換し、鎖錠して使用できるようにします。"]
        ]
    },
    {
        id: "shishobutsu", name: "線路支障", weight: 5, needTrain: false, radio: true,
        block: { tracks: "parallel", radius: 3 },
        hold: null, suspend: [600, 1500],
        slow: { sec: 600, factor: 1.4 },
        after: null,
        cause: "線路内支障物",
        first: (loc) => `${loc}付近の線路内に支障物を確認しました。安全確認のため運転を見合わせます。`,
        phases: [
            [0.00, "安全確認中", "乗務員および係員が線路内の状況を確認しています。"],
            [0.45, "支障物撤去中", "支障物の撤去作業を行っています。"],
            [0.80, "線路点検中", "撤去後の軌道および架線の点検を行っています。"]
        ]
    },
    {
        id: "syaryo", name: "車両故障", weight: 8, needTrain: true, radio: false,
        block: null,
        hold: [600, 1500], suspend: null,
        slow: { sec: 600, factor: 1.3 },
        after: "deadhead",
        cause: "車両故障",
        first: (loc, no) => `${loc}を走行中の ${no} で主回路に異常が発生し、非常停車しました。乗務員が復帰操作を行っています。`,
        phases: [
            [0.00, "乗務員による復帰操作", "乗務員が保護装置の復帰操作を行っています。"],
            [0.40, "車両所と連絡中", "車両所へ連絡し、機器の状態を確認しています。"],
            [0.75, "応急処置中", "応急処置を行い、自力走行の可否を判断しています。"]
        ]
    },
    {
        id: "door", name: "ドア故障", weight: 7, needTrain: true, radio: false,
        block: null, atStation: true,
        hold: [300, 780], suspend: null,
        slow: null,
        after: "resume",
        cause: "ドア故障",
        first: (loc, no) => `${loc}停車中の ${no} で一部の側引戸が閉扉しません。乗務員が扱い直しを行っています。`,
        phases: [
            [0.00, "扱い直し中", "戸閉め扱いを繰り返しています。"],
            [0.45, "戸閉め装置点検中", "駅係員とともに戸閉め装置を点検しています。"],
            [0.80, "戸締切扱い準備", "当該ドアを締切扱いとし、運転を再開する準備をしています。"]
        ]
    },
    {
        id: "fumikiri", name: "踏切障害", weight: 7, needTrain: true, radio: true,
        block: { tracks: "same", radius: 1 },
        hold: [300, 900], suspend: [300, 900],
        slow: { sec: 300, factor: 1.3 },
        after: "resume",
        cause: "踏切障害",
        first: (loc, no) => `${loc}の踏切で非常ボタンが動作しました。${no} は非常停車、安全確認を行います。`,
        phases: [
            [0.00, "安全確認中", "乗務員が踏切の状況を確認しています。"],
            [0.50, "支障物確認中", "踏切内の支障物の有無および接触の有無を確認しています。"],
            [0.85, "確認完了・再開準備", "安全が確認できたため、運転再開の準備をしています。"]
        ]
    },
    {
        id: "kyubyonin", name: "急病人救護", weight: 8, needTrain: true, radio: false,
        block: null, atStation: true,
        hold: [240, 720], suspend: null,
        slow: null,
        after: "resume",
        cause: "急病人救護",
        first: (loc, no) => `${loc}停車中の ${no} の車内で急病人が発生しました。駅係員および救急隊を手配しています。`,
        phases: [
            [0.00, "駅係員手配中", "駅係員が当該車両へ向かっています。"],
            [0.45, "救護中", "救急隊が到着し、救護活動を行っています。"],
            [0.85, "搬送完了・再開準備", "搬送が完了し、運転再開の準備をしています。"]
        ]
    },
    {
        id: "kikikosho", name: "車内設備故障", weight: 5, needTrain: true, radio: false,
        block: null,
        hold: [240, 600], suspend: null,
        slow: null,
        after: "resume",
        cause: "車内設備故障",
        first: (loc, no) => `${loc}にて ${no} の車内放送装置および行先表示器が動作しなくなりました。`,
        phases: [
            [0.00, "乗務員確認中", "乗務員が車内の機器を確認しています。"],
            [0.55, "復帰操作中", "電源の復帰操作を行っています。"]
        ]
    }
];

/** 重み付き抽選 */
function pickIncidentType() {
    const total = INCIDENT_TYPES.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of INCIDENT_TYPES) { r -= t.weight; if (r < 0) return t; }
    return INCIDENT_TYPES[0];
}

/** 並走する線路 (同じ向きの内・外、および反対方向) */
function parallelTracks(trackId) {
    if (trackId.indexOf("Kosei") === 0) return ["Kosei_Up", "Kosei_Down"];
    if (trackId.indexOf("Fukuchi") === 0) return ["Fukuchi_Up", "Fukuchi_Down"];
    if (trackId.indexOf("Tozai") === 0) return ["Tozai_Up", "Tozai_Down"];
    if (trackId.indexOf("Hoppo") >= 0) return ["Up_Hoppo", "Down_Hoppo"];
    return ["Up_Out", "Up_In", "Down_In", "Down_Out"];
}

let INCIDENT_SEQ = 0;

class IncidentSystem {
    constructor(game) {
        this.game = game;
        this.active = [];
        this.history = [];
        // 次に輸送障害が起きる時刻。最初の1件は早めに起きないようにする。
        this.nextAt = game.currentTime + 2400 + Math.random() * 5400;
    }

    /** 指令が全解除したときに呼ぶ */
    clearAll(reason) {
        this.active.forEach(inc => this.finish(inc, reason || "指令による解除", true));
        this.active = [];
        this.syncEmergencyState();
    }

    // ------------------------------------------------------------ 発生
    /** 条件に合う場所と当該列車を選ぶ */
    pickLocation(type) {
        const running = this.game.trains.filter(t =>
            t.state !== "finished" && t.state !== "in_depot" && t.currBlockIndex >= 0);
        if (type.needTrain) {
            let pool = running;
            if (type.atStation) {
                pool = running.filter(t => {
                    const b = this.game.trackMgr.blocks[t.trackId][t.currBlockIndex];
                    return b && (b.isStation || b.hoppoStationName) && t.state === "stopped";
                });
                // 停車中の列車が見つからなければ、駅にいる列車まで広げる
                if (!pool.length) pool = running.filter(t => {
                    const b = this.game.trackMgr.blocks[t.trackId][t.currBlockIndex];
                    return b && (b.isStation || b.hoppoStationName);
                });
            } else {
                pool = running.filter(t => t.state === "running");
                if (!pool.length) pool = running;
            }
            if (!pool.length) return null;
            const t = pool[Math.floor(Math.random() * pool.length)];
            return { train: t, trackId: t.trackId, index: t.currBlockIndex };
        }
        /* 当該列車が要らない障害は、列車が走っている線区のどこかで起こす。
           1回で決まらないことがある (線路の無いブロックに当たる等) ので、
           走っている列車を何本か試す。 */
        if (!running.length) return null;
        for (let tryN = 0; tryN < 12; tryN++) {
            const t = running[Math.floor(Math.random() * running.length)];
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) continue;
            let idx = t.currBlockIndex + t.dir * (3 + Math.floor(Math.random() * 12));
            idx = Math.max(0, Math.min(blks.length - 1, idx));
            if (type.atStation) {
                // 近くの駅ブロックへ寄せる
                let found = -1;
                for (let k = 0; k < 8 && found < 0; k++) {
                    if (blks[idx + k] && blks[idx + k].isStation && blks[idx + k].x !== -1000) found = idx + k;
                    else if (blks[idx - k] && blks[idx - k].isStation && blks[idx - k].x !== -1000) found = idx - k;
                }
                if (found < 0) continue;
                idx = found;
            }
            if (blks[idx].x === -1000) continue;
            return { train: null, trackId: t.trackId, index: idx };
        }
        return null;
    }

    /** その場所の呼び名 */
    placeName(trackId, index) {
        const blks = this.game.trackMgr.blocks[trackId];
        if (!blks || !blks[index]) return "線区内";
        const at = (b) => b.hoppoStationName ||
            (b.stationIdx >= 0 && STATIONS[b.stationIdx] ? STATIONS[b.stationIdx].name : "");
        const here = at(blks[index]);
        if (here) return here + "駅";
        // 駅間なら、前後それぞれで最初に見つかった駅名をつなぐ
        let prev = "", next = "";
        for (let k = 1; k < 12 && !prev; k++) {
            const b0 = blks[index - k];
            if (b0 && b0.x !== -1000 && at(b0)) prev = at(b0);
        }
        for (let k = 1; k < 12 && !next; k++) {
            const b1 = blks[index + k];
            if (b1 && b1.x !== -1000 && at(b1)) next = at(b1);
        }
        if (prev && next) return prev + "〜" + next + "間";
        if (prev) return prev + "駅付近";
        if (next) return next + "駅付近";
        return "線区内";
    }

    /** 輸送障害を1件起こす */
    trigger(forcedTypeId) {
        const type = forcedTypeId
            ? (INCIDENT_TYPES.find(t => t.id === forcedTypeId) || pickIncidentType())
            : pickIncidentType();
        const loc = this.pickLocation(type);
        if (!loc) return null;

        const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
        const suspendSec = type.suspend ? Math.min(INCIDENT_MAX_BLOCK_SEC, rnd(type.suspend)) : 0;
        const holdSec = type.hold ? Math.min(INCIDENT_MAX_BLOCK_SEC, rnd(type.hold)) : 0;

        const inc = {
            id: "inc_" + (++INCIDENT_SEQ),
            type: type,
            trackId: loc.trackId,
            index: loc.index,
            train: loc.train,
            place: this.placeName(loc.trackId, loc.index),
            startedAt: this.game.currentTime,
            totalSec: Math.max(suspendSec, holdSec, 300),
            timer: Math.max(suspendSec, holdSec, 300),
            phase: -1,
            suspensions: [],
            faults: [],
            stage: "支障中",
            trainNo: loc.train ? loc.train.trainNo : ""
        };

        // --- 防護無線の発報 (全線一時停止。既存の仕組みをそのまま使う)
        if (type.radio) {
            this.game.isEmergency = true;
            this.game.radioTimer = 180;
            const el = (typeof document !== "undefined") ? document.getElementById("emg-control") : null;
            if (el) el.style.display = "block";
        }

        // --- 区間の運転見合わせ / 信号の障害
        if (type.block) {
            const tracks = (type.block.tracks === "same")
                ? [loc.trackId] : parallelTracks(loc.trackId);
            const r = type.block.radius;
            tracks.forEach(tid => {
                const blks = this.game.trackMgr.blocks[tid];
                if (!blks) return;
                const s = Math.max(0, loc.index - r);
                const e = Math.min(blks.length - 1, loc.index + r);
                if (s > e) return;
                if (type.fault) {
                    this.game.signals.addFault(tid, s, e, type.name);
                    inc.faults.push({ trackId: tid, start: s, end: e });
                } else {
                    const rec = { trackId: tid, start: s, end: e, owner: inc.id };
                    this.game.trackMgr.manualSuspensions.push(rec);
                    inc.suspensions.push(rec);
                }
            });
        }

        // --- 当該列車を止める
        if (loc.train) {
            const t = loc.train;
            t.minorTrouble = true;
            t.minorTroubleTimer = holdSec;
            t.isJudging = false;
            t.troubleInfo = {
                active: true, cause: type.cause, status: type.phases[0][1],
                timer: holdSec, location: inc.place, incidentId: inc.id
            };
            if (t.state === "running") t.state = "stopped";
        }

        this.active.push(inc);
        this.history.push({ at: this.game.currentTime, id: inc.id, name: type.name, place: inc.place });
        this.syncEmergencyState();

        const msg = type.first(inc.place, inc.trainNo || "当該列車");
        this.game.ui.updateBanner(`🚨【${type.name}】${msg}`, "banner-red");
        return inc;
    }

    // ------------------------------------------------------------ 進行
    update() {
        const now = this.game.currentTime;

        // 新しい輸送障害の発生
        if (now >= this.nextAt && this.active.length < 2) {
            if (this.trigger()) {
                // 次は 50分〜3時間後
                this.nextAt = now + 3000 + Math.random() * 7800;
            } else {
                this.nextAt = now + 600;
            }
        }

        for (let i = this.active.length - 1; i >= 0; i--) {
            const inc = this.active[i];
            inc.timer -= CONFIG.TICK_SEC;

            // 直接支障の上限 (1時間)
            const elapsed = now - inc.startedAt;
            if (elapsed >= INCIDENT_MAX_BLOCK_SEC && inc.timer > 0) {
                inc.timer = 0;
                inc.forced = true;
            }

            if (inc.timer <= 0) {
                this.finish(inc, inc.forced ? "支障時間の上限により設備を復旧" : "復旧完了");
                this.active.splice(i, 1);
                this.syncEmergencyState();
                continue;
            }

            // 段階の進行
            const ratio = 1 - (inc.timer / inc.totalSec);
            let ph = 0;
            for (let k = 0; k < inc.type.phases.length; k++) {
                if (ratio >= inc.type.phases[k][0]) ph = k;
            }
            if (ph !== inc.phase) {
                inc.phase = ph;
                inc.stage = inc.type.phases[ph][1];
                const rem = Math.max(1, Math.ceil(inc.timer / 60));
                this.game.ui.updateBanner(
                    `🚧【${inc.type.name}】${inc.place} - ${inc.type.phases[ph][2]} (再開見込:約${rem}分)`,
                    "banner-red");
                if (inc.train && inc.train.troubleInfo && inc.train.troubleInfo.active) {
                    inc.train.troubleInfo.status = inc.stage;
                }
            }

            this.syncEmergencyState();

            // 当該列車の状態を保つ (指令が個別に解除するまで止め続ける)
            if (inc.train && inc.train.state !== "finished") {
                if (inc.train.minorTrouble) {
                    inc.train.minorTroubleTimer = Math.max(inc.train.minorTroubleTimer, inc.timer);
                    inc.train.troubleInfo.timer = inc.timer;
                }
            }
        }
    }

    /**
     * いちばん重い輸送障害を game.emergencyState に反映する。
     * 業務連絡 (js/19-ui-log.js) と抑止判定 (js/13-train-hold.js) が
     * この値を見ているので、互換のために保っている。
     */
    syncEmergencyState() {
        if (!this.active.length) {
            this.game.emergencyState = { type: "none", timer: 0 };
            return;
        }
        const main = this.active.slice().sort((a, b) => b.timer - a.timer)[0];
        this.game.emergencyState = {
            type: (main.type.id === "jinshin") ? "human" : "vehicle",
            timer: main.timer,
            location: main.place,
            incident: main.type.name
        };
    }

    // ------------------------------------------------------------ 復旧
    /**
     * 輸送障害を終える。
     * 見合わせを解いて徐行に置き換えるだけで、列車の位置や遅れには手を触れない。
     * そのため、積み上がった遅れはそのまま残り、しばらく波及し続ける。
     */
    finish(inc, reason, silent) {
        // 見合わせを解く
        inc.suspensions.forEach(rec => {
            const arr = this.game.trackMgr.manualSuspensions;
            const at = arr.indexOf(rec);
            if (at >= 0) arr.splice(at, 1);
        });
        // 信号の障害を解く
        if (inc.faults.length) {
            this.game.signals.clearFaults(f =>
                inc.faults.some(x => x.trackId === f.trackId && x.start === f.start && x.end === f.end));
        }
        // 復旧後の徐行を置く (瞬間移動させずに、ゆっくり流して回復させる)
        if (inc.type.slow) {
            const tracks = inc.type.block && inc.type.block.tracks === "same"
                ? [inc.trackId] : parallelTracks(inc.trackId);
            const r = (inc.type.block ? inc.type.block.radius : 2) + 1;
            tracks.forEach(tid => {
                const blks = this.game.trackMgr.blocks[tid];
                if (!blks) return;
                this.game.trackMgr.addSpeedRestriction(tid,
                    Math.max(0, inc.index - r), Math.min(blks.length - 1, inc.index + r),
                    inc.type.slow.factor, inc.type.name + "後の徐行",
                    this.game.currentTime + inc.type.slow.sec);
            });
        }

        // 当該列車の後始末
        if (inc.train && inc.train.state !== "finished" && inc.train.troubleInfo &&
            inc.train.troubleInfo.incidentId === inc.id) {
            const t = inc.train;
            t.minorTrouble = false;
            t.minorTroubleTimer = 0;
            t.isJudging = false;
            t.troubleInfo = { active: false, cause: "", status: "" };
            if (t.state === "stopped" || t.state === "holding") { t.state = "running"; t.timer = 15; }

            if (inc.type.after === "deadhead" && !["回送", "貨物"].includes(t.type)) {
                // 自力走行はできるが営業は打ち切り。最寄りの車両所へ回送する。
                this.game.ops.convertToRecoveryDeadhead(t, inc.type.name);
            }
        }

        if (!silent) {
            this.game.ui.updateBanner(
                `🟢【運転再開】${inc.place}の${inc.type.name}は${reason}。当該区間の運転を再開します。` +
                (inc.type.slow ? "（当分の間、現場付近は徐行運転となります）" : ""),
                "banner-orange");
        }
    }

    /** 画面表示用: いま起きている輸送障害の一覧 */
    list() {
        return this.active.map(inc => ({
            id: inc.id, name: inc.type.name, place: inc.place, stage: inc.stage,
            remain: Math.max(0, Math.ceil(inc.timer / 60)), trainNo: inc.trainNo
        }));
    }
}
