/* 画面どうしで同じシミュレーションを共有する仕組み。

   ■ やりたいこと
     旅客向け画面 (index.html) と Super-TID 画面 (tid.html) を同時に開いたとき、
     どちらも同じ列車・同じ遅れ・同じ抑止状態を見せたい。
     片方で抑止したら、もう片方でも抑止されていてほしい。

   ■ どうやっているか
     同じブラウザで開いているページどうしを BroadcastChannel でつなぎ、
       ・最初に名乗り出た1つのタブが「本体」になってシミュレーションを回す
       ・ほかのタブは「従」になり、本体が毎秒流す状態をそのまま映す
       ・従で指令を出すと、本体へ転送して本体が実行する
     という形にした。本体のタブを閉じると、残ったタブのどれかが
     自動的に本体を引き継ぐ。

   ■ できないこと (正直に書いておく)
     GitHub Pages は静的なページを配るだけで、サーバー側の処理が無い。
     そのため「PCの画面とiPadの画面」のように別々の端末どうしを
     つなぐことはできない。別の端末で開いた場合は、それぞれの端末の中で
     独立したシミュレーションが動く (従来どおりの動き)。
     同じ端末・同じブラウザで開いた画面どうしは、この仕組みで完全に揃う。
*/

const SIM_BUS_CHANNEL = "jrwest-tid-sim";
const SIM_BUS_LOCK    = "jrwest-tid-host";
const SIM_BUS_BEAT    = 700;    // 本体が生きていることを知らせる間隔(ms)
const SIM_BUS_TIMEOUT = 2600;   // これだけ音沙汰が無ければ本体を引き継ぐ(ms)

/** 従側で使う、表示だけのための軽い列車 */
class MirrorTrain {
    constructor(d) { Object.assign(this, d); }
}
/** 従側で使う、表示だけのための軽い編成 */
class MirrorVehicle {
    constructor(d) { Object.assign(this, d); }
    get fullId() { return this._fullId || this.id; }
}

class SimBus {
    constructor(game) {
        this.game = game;
        this.id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        this.isHost = true;          // 単独で開いているときは自分が本体
        this.channel = null;
        this.lastSnapshotAt = 0;
        this.onRoleChange = null;
        this.enabled = false;
    }

    start() {
        if (typeof BroadcastChannel === "undefined" || typeof localStorage === "undefined") {
            // 対応していないブラウザでは、今までどおり単独で動かす
            this.isHost = true;
            return;
        }
        this.enabled = true;
        try {
            this.channel = new BroadcastChannel(SIM_BUS_CHANNEL);
        } catch (e) {
            this.isHost = true;
            this.enabled = false;
            return;
        }
        this.channel.onmessage = (ev) => this.onMessage(ev.data);

        this.electOnce();
        this.timer = setInterval(() => this.electOnce(), SIM_BUS_BEAT);

        window.addEventListener("beforeunload", () => {
            // 本体のまま閉じるときは名乗りを消して、次のタブがすぐ引き継げるようにする
            try {
                const raw = localStorage.getItem(SIM_BUS_LOCK);
                if (raw && JSON.parse(raw).id === this.id) localStorage.removeItem(SIM_BUS_LOCK);
            } catch (e) { /* 無視 */ }
        });
    }

    /** 本体を決める (localStorage に名乗りを書く) */
    electOnce() {
        const now = Date.now();
        let holder = null;
        try {
            const raw = localStorage.getItem(SIM_BUS_LOCK);
            if (raw) holder = JSON.parse(raw);
        } catch (e) { holder = null; }

        const claim = () => {
            try { localStorage.setItem(SIM_BUS_LOCK, JSON.stringify({ id: this.id, at: now })); }
            catch (e) { /* 無視 */ }
            this.setHost(true);
        };

        if (!holder || !holder.id) { claim(); return; }
        if (holder.id === this.id) { claim(); return; }
        if (now - (holder.at || 0) > SIM_BUS_TIMEOUT) { claim(); return; }
        this.setHost(false);
    }

    setHost(v) {
        if (this.isHost === v) return;
        this.isHost = v;
        if (this.onRoleChange) this.onRoleChange(v);
        if (this.game.ui) {
            this.game.ui.updateBanner(
                v ? "【表示】この画面がシミュレーション本体になりました。"
                  : "【表示】ほかの画面のシミュレーションに接続しました。指令は共有されます。",
                "banner-orange");
        }
    }

    // ============================================================ 送受信
    onMessage(msg) {
        if (!msg || msg.from === this.id) return;
        if (msg.kind === "state" && !this.isHost) {
            this.applySnapshot(msg.data);
        } else if (msg.kind === "cmd" && this.isHost) {
            const r = this.game.applyCommand(msg.data);
            this.channel.postMessage({ kind: "ack", from: this.id, to: msg.from, data: r });
        } else if (msg.kind === "ack" && msg.to === this.id) {
            if (this.game.tidUI && msg.data && msg.data.msg) this.game.tidUI.notify(msg.data.msg);
        }
    }

    /** 従側から本体へ指令を送る */
    send(cmd) {
        if (!this.channel) return;
        this.channel.postMessage({ kind: "cmd", from: this.id, data: cmd });
    }

    /** 本体が毎Tick呼ぶ */
    publish() {
        if (!this.channel || !this.isHost) return;
        this.channel.postMessage({ kind: "state", from: this.id, data: this.snapshot() });
    }

    // ============================================================ 状態のやりとり
    /** いまの状態を、表示に必要なぶんだけ書き出す */
    snapshot() {
        const g = this.game;
        const trains = [];
        g.trains.forEach(t => {
            if (t.state === "finished") return;
            trains.push({
                id: t.id, trainNo: t.trainNo, type: t.type, dest: t.dest, dir: t.dir,
                trackId: t.trackId, currBlockIndex: t.currBlockIndex, lane: t.lane,
                state: t.state, timer: t.timer, delayTime: t.delayTime,
                startName: t.startName, dutyName: t.dutyName,
                isManuallySuspended: !!t.isManuallySuspended,
                recoveryHold: t.recoveryHold || null,
                terminalWork: t.terminalWork ? Object.assign({}, t.terminalWork) : null,
                minorTrouble: !!t.minorTrouble,
                isDecelerating: !!t.isDecelerating,
                isKoseiRoute: !!t.isKoseiRoute,
                isFinalStop: !!t.isFinalStop,
                nextAction: t.nextAction,
                trackChangeReservation: t.trackChangeReservation ? {
                    stationName: t.trackChangeReservation.stationName,
                    targetTrackId: t.trackChangeReservation.targetTrackId,
                    targetLane: t.trackChangeReservation.targetLane,
                    label: t.trackChangeReservation.label,
                    status: t.trackChangeReservation.status,
                    note: t.trackChangeReservation.note || ""
                } : null,
                hasStoppedAtCurrent: !!t.hasStoppedAtCurrent,
                hasDeparted: !!t.hasDeparted,
                serviceChange: t.serviceChange ? { at: t.serviceChange.at } : null,
                stuckTime: t.stuckTime,
                troubleInfo: t.troubleInfo && t.troubleInfo.active ? {
                    active: true, cause: t.troubleInfo.cause,
                    status: t.troubleInfo.status, location: t.troubleInfo.location
                } : { active: false, cause: "", status: "" },
                depotOutConfig: t.depotOutConfig ? {
                    type: t.depotOutConfig.type, dest: t.depotOutConfig.dest,
                    trainNo: t.depotOutConfig.trainNo, dir: t.depotOutConfig.dir
                } : null,
                oldInfo: t.oldInfo || null,
                vehicles: (t.vehicles || []).map(v => ({
                    id: v.id, _fullId: v.fullId, type: v.type, cars: v.cars,
                    group: v.group, notes: v.notes
                }))
            });
        });

        const depots = {};
        for (const n in DEPOTS) {
            depots[n] = {
                trains: DEPOTS[n].trains.map(t => t.id),
                pool: this.game.fleet.poolAt(n).map(v => ({
                    id: v.id, _fullId: v.fullId, type: v.type, cars: v.cars, group: v.group, notes: v.notes
                }))
            };
        }

        return {
            time: g.currentTime,
            isEmergency: g.isEmergency,
            radioTimer: g.radioTimer,
            emergencyState: g.emergencyState,
            trains: trains,
            depots: depots,
            suspensions: g.trackMgr.manualSuspensions.map(m => ({
                trackId: m.trackId, start: m.start, end: m.end, owner: m.owner })),
            restrictions: g.trackMgr.speedRestrictions.map(r => ({
                trackId: r.trackId, start: r.start, end: r.end,
                factor: r.factor, reason: r.reason, until: r.until })),
            faults: g.signals.faults.map(f => ({
                trackId: f.trackId, start: f.start, end: f.end, reason: f.reason })),
            incidents: g.incidents.list(),
            // 段階的な運転再開 (区間ごとの開通) と、その抑止区間
            recovery: g.recovery ? g.recovery.list() : [],
            recoveryHolds: g.trackMgr.recoveryHolds.map(h => ({
                trackId: h.trackId, start: h.start, end: h.end, grant: h.grant })),
            /* 指令連絡 (js/31-comms.js)。応答はどちらの画面からでもできるよう、
               本体が抱えている一覧をそのまま流す。 */
            comms: g.comms ? g.comms.list() : [],
            logs: g.ui.logHistory.slice(0, 80),
            // 指令連絡・輸送障害の記録 (js/32-records.js)
            records: g.records ? g.records.snapshot() : null
        };
    }

    /** 本体から届いた状態を、この画面へ映す */
    applySnapshot(s) {
        if (!s) return;
        const g = this.game;
        this.lastSnapshotAt = Date.now();

        g.currentTime = s.time;
        g.isEmergency = s.isEmergency;
        g.radioTimer = s.radioTimer;
        g.emergencyState = s.emergencyState || { type: "none", timer: 0 };

        // --- 線路の状態
        g.trackMgr.manualSuspensions = s.suspensions || [];
        g.trackMgr.recoveryHolds = s.recoveryHolds || [];
        this._recovery = s.recovery || [];
        g.trackMgr.speedRestrictions = s.restrictions || [];
        g.signals.faults = s.faults || [];

        // --- 在線をいったん空にする
        for (const tid in g.trackMgr.blocks) {
            const blks = g.trackMgr.blocks[tid];
            for (let i = 0; i < blks.length; i++) {
                const lanes = blks[i].lanes;
                for (let l = 0; l < lanes.length; l++) lanes[l] = null;
            }
        }

        // --- 列車を作り直して在線に戻す
        const byId = {};
        g.trains = (s.trains || []).map(d => {
            const t = new MirrorTrain(d);
            t.vehicles = (d.vehicles || []).map(v => new MirrorVehicle(v));
            byId[t.id] = t;
            if (t.state !== "in_depot") {
                const blks = g.trackMgr.blocks[t.trackId];
                if (blks && blks[t.currBlockIndex] && t.lane >= 0 &&
                    t.lane < blks[t.currBlockIndex].lanes.length) {
                    blks[t.currBlockIndex].lanes[t.lane] = t;
                }
            }
            return t;
        });

        // --- 留置場
        for (const n in DEPOTS) {
            const d = (s.depots || {})[n];
            DEPOTS[n].trains = d ? d.trains.map(id => byId[id]).filter(Boolean) : [];
            if (d) g.fleet.pools[n] = d.pool.map(v => new MirrorVehicle(v));
        }

        // --- 記録
        if (s.logs) g.ui.logHistory = s.logs;
        if (s.records && g.records) g.records.load(s.records);
        // --- 輸送障害 (一覧の表示だけ)
        this._incidents = s.incidents || [];
        // --- 指令連絡 (一覧の表示だけ。応答は本体へ転送される)
        this._comms = s.comms || [];

        // 従側でも時計を進める (本体の時刻に合わせる)
        if (g.ui && g.ui.updateClock) g.ui.updateClock(g.currentTime);
        if (g.ui && g.ui.renderStaffFeed) g.ui.renderStaffFeed();
        if (g.renderer) g.renderer.draw();
        if (g.tidUI) g.tidUI.render();
    }

    /** 従側で輸送障害の一覧を出すための橋渡し */
    incidentList() { return this._incidents || []; }
    recoveryList() { return this._recovery || []; }

    /** 従側で指令連絡の一覧を出すための橋渡し */
    commList() { return this._comms || []; }
}
