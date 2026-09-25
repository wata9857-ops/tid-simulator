/* Super-TID の駅情報 (駅名札をタップしたときのパネル)。

   ■ 以前の表示
     「番線ごとの在線 (空き / 列車)」と「接近中の列車 (近い順に10本)」の2つを
     並べていた。接近中の一覧は番線と結びついていないので、
       ・どの列車が何番線に入るのか
       ・その列車が停まるのか通過するのか
     が分からず、列車が動くたびに並びが入れ替わって読みにくかった。

   ■ いまの表示 (番線ごとに固定)
     その駅の番線を配線どおりに固定して並べ (js/03-stations.js の番線の対応表)、
     番線ごとに
       在線      … いまその番線に居る列車
       到着予定  … これからその番線に着く列車 (停車・当駅止まり)
       通過予定  … その番線 (線路) を停まらずに通る列車
     を時刻の早い順に出す。番線の並びは列車が動いても変わらない。

   ■ どの番線に入るかの見込み
     実際の着発番線の選び方 (Train.findFreeLane) をそのまま使う。
     指令の着発番線変更 (予約) があればそれを優先する。
     在線の状況で番線は変わるので、あくまで「いまの状況で入る見込みの番線」であり、
     画面にもそう書く。
*/

/** その駅へ進入するときに乗る線路 (尼崎の分岐・合流を move() と同じ規則で見る) */
function tidPredictEntryTrack(t, stName) {
    if (stName === "尼崎") {
        if (t.dir === 1 && t.trackId === "Fukuchi_Up") {
            return TOZAI_THROUGH_DESTS.indexOf(t.dest) >= 0 ? "Tozai_Up" : "Up_In";
        }
        if (t.dir === 1 && t.trackId.indexOf("Tozai") !== 0 && TOZAI_THROUGH_DESTS.indexOf(t.dest) >= 0) return "Tozai_Up";
        if (t.dir === -1 && t.trackId.indexOf("Fukuchi") !== 0 && FUKUCHI_THROUGH_DESTS.indexOf(t.dest) >= 0) return "Fukuchi_Down";
        if (t.dir === -1 && t.trackId === "Tozai_Down") {
            return FUKUCHI_THROUGH_DESTS.indexOf(t.dest) >= 0 ? "Fukuchi_Down" : "Down_In";
        }
    }
    return t.trackId;
}

/** 方面の呼び方 (その線路を進んだ先) */
function tidDirectionLabel(trackId) {
    const up = trackDirOf(trackId) === 1;
    if (trackId.indexOf("Kosei") === 0) return up ? "近江今津・敦賀方面" : "山科・京都方面";
    if (trackId.indexOf("Fukuchi") === 0) return up ? "尼崎・大阪方面" : "宝塚・新三田方面";
    if (trackId.indexOf("Tozai") === 0) return up ? "放出・四条畷・木津方面" : "京橋・北新地・尼崎方面";
    if (trackId.indexOf("Ako") === 0) return up ? "相生・姫路方面" : "播州赤穂方面";
    return up ? "京都・米原方面" : "大阪・神戸・姫路・上郡方面";
}

/**
 * 駅の番線ごとの発着予定を作る。表示だけでなく検証 (tools/check_station_plan.js) にも使う。
 *   { name, platforms: [{ key, trackId, lane, label, text, platform, occupant,
 *                         arrivals:[...], passes:[...] }], depotOut:[...] }
 */
function stationPlatformPlan(game, stName, opts) {
    const o = opts || {};
    const horizon = o.horizonBlocks || UNITS_PER_STATION * 10;
    const shared = !!STATION_SHARED_LANES[stName];
    const platforms = [];
    const byKey = {};
    const keyOf = (tid, lane) => {
        if (!shared) return tid + "|" + lane;
        // 上下すべてで共有する駅 (単線の駅) は番線名だけで1つにまとめる
        if (STATION_SHARED_LANES[stName] === "all") return "all|" + platformLabelOf(stName, tid, lane);
        return trackDirOf(tid) + "|" + platformLabelOf(stName, tid, lane);
    };

    // ---- 番線を配線どおりに固定で並べる
    const tracks = (typeof TRACKS !== "undefined") ? TRACKS.map(x => x.id) : [];
    tracks.forEach(tid => {
        if (tid.indexOf("Hoppo") >= 0) return;
        const sb = stationBlockOn(game, tid, stName);
        if (!sb) return;
        sb.lanes.forEach((occ, li) => {
            const key = keyOf(tid, li);
            if (byKey[key]) {
                if (occ && !byKey[key].occupant) byKey[key].occupant = occ;
                return;
            }
            const e = stationLaneEntry(stName, tid, li);
            // 番線を共有する駅は、その番線が属する本線の線路名で出す
            const homeTrack = shared && e ? (stationLaneTracks(stName)[e.index] || tid) : tid;
            const label = displayPlatformLabel(stName, tid, li);
            const p = {
                key: key, trackId: tid, homeTrack: homeTrack, lane: li,
                dir: trackDirOf(tid), label: label,
                text: label ? platformText(label) : ("第" + (li + 1) + "線"),
                platform: isPlatformLane(stName, tid, li),
                occupant: occ || null, arrivals: [], passes: []
            };
            byKey[key] = p;
            platforms.push(p);
        });
    });

    // ---- 列車ごとに、どの番線に着く (通る) 見込みかを決める
    const now = game.currentTime;
    const hour = (now / 3600) % 24;
    const call = (t, fn, args) => {
        // 従側の画面の列車 (MirrorTrain) にはメソッドが無いので、本物の処理を借りる
        const self = (typeof t[fn] === "function") ? t : Object.assign(Object.create(t), { game: game });
        try { return Train.prototype[fn].apply(self, args); } catch (e) { return null; }
    };
    game.trains.forEach(t => {
        if (t.state === "finished" || t.state === "in_depot") return;
        const blks = game.trackMgr.blocks[t.trackId];
        if (!blks) return;
        const sbT = blks.find(b => b.x !== -1000 && (b.isStation || b.hoppoStationName) &&
                                   blockStationName(b) === stName);
        if (!sbT) return;
        const d = (sbT.index - t.currBlockIndex) * t.dir;
        if (d < 0 || d > horizon) return;

        // 行先がその駅より手前なら、その駅には来ない
        const endName = lineEndForBeyond(t.dest) || t.dest;
        const destB = blks.find(b => b.x !== -1000 && (b.isStation || b.hoppoStationName) &&
                                     blockStationName(b) === endName);
        if (destB && (destB.index - t.currBlockIndex) * t.dir >= 0 &&
            (destB.index - sbT.index) * t.dir < 0) return;
        // 走っている線路の先が途中で切れていれば (線区の端)、来ない
        for (let k = 1; k <= d; k++) {
            const b = blks[t.currBlockIndex + t.dir * k];
            if (!b || b.x === -1000) return;
        }

        let trackId, lane, how;
        const res = t.trackChangeReservation;
        if (d === 0) {
            trackId = t.trackId; lane = t.lane; how = "here";
        } else if (res && res.status === "pending" && res.stationName === stName) {
            trackId = res.targetTrackId; lane = res.targetLane; how = "reserved";
        } else {
            trackId = tidPredictEntryTrack(t, stName);
            const tb = game.trackMgr.blocks[trackId];
            const blk = tb ? tb[sbT.index] : null;
            if (!blk || blk.x === -1000) { trackId = t.trackId; }
            const b2 = game.trackMgr.blocks[trackId][sbT.index];
            lane = call(t, "findFreeLane", [b2, trackId]);
            if (lane === null || lane < 0) {
                // 満線なら、ふだん使う番線 (空くのを待って入る)
                const pref = stationPreferredLanes(stName, trackId, t.type, hour, "arrive");
                lane = (pref && pref.length) ? pref[0] : 0;
            }
            how = "predicted";
        }
        const p = byKey[keyOf(trackId, lane)];
        if (!p) return;

        const terminates = (t.dest === stName) || (endName === stName && d >= 0) ||
                           (t.isFinalStop && d === 0);
        const stops = terminates || !!call(t, "shouldStop", [{ name: stName }]) ||
                      (d === 0 && t.state !== "running");

        // 着く (通る) 時刻の見込み
        let eta = 0;
        if (d > 0) {
            const run = BLOCK_RUN_SEC[t.type] || BLOCK_RUN_SEC["普通"];
            eta = Math.max(0, t.timer || 0) + Math.max(0, d - 1) * run;
            for (let k = 1; k < d; k++) {
                const b = blks[t.currBlockIndex + t.dir * k];
                if (b && isRealStationBlock(b) && call(t, "shouldStop", [{ name: blockStationName(b) }])) eta += 30;
            }
            if (t.isManuallySuspended) eta += 300;
            if (t.minorTrouble && t.troubleInfo) eta += Math.max(0, t.troubleInfo.timer || 0);
        }
        const item = {
            train: t, id: t.id, trainNo: t.trainNo, type: t.type, dest: t.dest,
            etaSec: eta, at: now + eta, blocks: d, how: how,
            here: d === 0, terminates: terminates, stops: stops,
            delayMin: Math.floor((t.delayTime || 0) / 60),
            held: !!t.isManuallySuspended, trouble: !!t.minorTrouble,
            vehicles: (t.vehicles || []).map(v => v.fullId || v.id)
        };
        (stops ? p.arrivals : p.passes).push(item);
    });
    platforms.forEach(p => {
        p.arrivals.sort((a, b) => a.etaSec - b.etaSec);
        p.passes.sort((a, b) => a.etaSec - b.etaSec);
    });

    // 並び: 下り → 上り、同じ向きの中は番線の番号順 (番号の無い側線は後ろ)
    const num = (p) => /^[0-9]+$/.test(String(p.label)) ? parseInt(p.label, 10) : 100 + p.lane;
    platforms.sort((a, b) => (a.dir - b.dir) || (num(a) - num(b)) ||
                             String(a.trackId).localeCompare(String(b.trackId)));

    // ---- その駅の留置場からの出区予定
    const depotOut = [];
    const dep = DEPOTS[depotKeyOf(stName)];
    if (dep && depotKeyOf(stName) === stName) {
        dep.trains.forEach(t => {
            if (!t.depotOutConfig) return;
            depotOut.push({ trainNo: t.depotOutConfig.trainNo, type: t.depotOutConfig.type,
                            dest: t.depotOutConfig.dest, inSec: Math.max(0, t.timer || 0),
                            vehicles: (t.vehicles || []).map(v => v.fullId || v.id) });
        });
        depotOut.sort((a, b) => a.inSec - b.inSec);
    }
    return { name: stName, platforms: platforms, depotOut: depotOut, at: now };
}

/** ゲーム内の時刻 (秒) を「HH:MM」に */
function tidClock(sec) {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600) % 24, m = Math.floor((s % 3600) / 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/** 駅情報 (番線ごとの固定表示) */
TidUI.prototype.renderStation = function () {
    const e = this.el("tid-station");
    if (!e) return;
    const name = this.stationName;
    if (!name) { e.classList.remove("is-on"); return; }
    e.classList.add("is-on");

    const plan = stationPlatformPlan(this.game, name);
    const esc = escapeLogHtml;
    const chip = (x) => {
        const c = TID_TYPE_COLORS[x.type] || {};
        return `<span class="tid-mini" style="background:${c.bg};color:${c.text}">${esc(x.trainNo || "—")}</span>`;
    };
    const MAX_ROWS = 4;
    const row = (x, kind) => {
        const when = x.here ? (x.stops ? "在線" : "通過中") : tidClock(x.at) + "頃";
        const badge = kind === "pass" ? '<span class="tid-pl-b tid-pl-pass">通過</span>'
                    : x.terminates ? '<span class="tid-pl-b tid-pl-term">当駅止</span>'
                    : '<span class="tid-pl-b tid-pl-stop">停車</span>';
        const notes = [];
        if (x.how === "reserved") notes.push("番線変更");
        if (x.held) notes.push("抑止");
        if (x.trouble) notes.push("障害");
        if (x.delayMin >= 1) notes.push(x.delayMin + "分延");
        return `<tr class="${kind === "pass" ? "is-pass" : ""}${x.here ? " is-here" : ""}">` +
            `<td class="tid-pl-time">${esc(when)}</td>` +
            `<td>${chip(x)}</td>` +
            `<td>${esc(x.type)}</td>` +
            `<td>${esc(x.dest || "")}</td>` +
            `<td>${badge}</td>` +
            `<td class="tid-pl-note">${esc(notes.join(" "))}` +
            (x.here || x.etaSec <= 0 ? "" : ` <small>あと${Math.max(1, Math.round(x.etaSec / 60))}分</small>`) +
            `</td></tr>`;
    };

    let html = `<div class="tid-station-head"><b>${esc(name)}</b> 駅 番線別 発着予定` +
               `<small class="tid-pl-now">${esc(tidClock(plan.at))} 現在</small>` +
               `<button id="tid-station-close" class="tid-x">閉じる</button></div>` +
               `<div class="tid-pl-legend"><span class="tid-pl-b tid-pl-stop">停車</span>` +
               `<span class="tid-pl-b tid-pl-term">当駅止</span><span class="tid-pl-b tid-pl-pass">通過</span>` +
               `<span class="tid-pl-hint">番線はいまの在線状況で入る見込み。時刻は目安です。</span></div>`;

    if (!plan.platforms.length) {
        html += '<p class="tid-empty">この駅の番線情報はありません。</p>';
    }
    let lastDir = null;
    plan.platforms.forEach(p => {
        if (p.dir !== lastDir) {
            lastDir = p.dir;
            html += `<div class="tid-station-sub">${p.dir === 1 ? "上り" : "下り"} ` +
                    `<small>(${esc(tidDirectionLabel(p.homeTrack || p.trackId))})</small></div>`;
        }
        const occ = p.occupant;
        const occText = occ
            ? `${chip(occ)} ${esc(occ.type)} ${esc(occ.dest || "")}` +
              ` <small>(${esc({ stopped: "停車中", holding: "抑止・信号待ち", waiting_start: "発車待ち",
                                 turning_back: "折り返し", running: "発車" }[occ.state] || occ.state)})</small>`
            : '<span class="tid-free">空き</span>';
        const arr = p.arrivals.filter(x => !x.here).slice(0, MAX_ROWS);
        const pas = p.passes.filter(x => !x.here).slice(0, MAX_ROWS);
        // 到着と通過を時刻順に混ぜて並べる
        const merged = arr.map(x => ({ x: x, k: "stop" })).concat(pas.map(x => ({ x: x, k: "pass" })))
            .sort((a, b) => a.x.etaSec - b.x.etaSec).map(r => row(r.x, r.k));
        html += `<div class="tid-plat${occ ? " is-busy" : ""}">` +
            `<div class="tid-plat-h"><b class="tid-plat-no">${esc(p.text)}</b>` +
            `<span class="tid-plat-line">${esc(trackLabelOf(p.homeTrack || p.trackId))}${p.platform ? "" : " (側線・通過線)"}</span>` +
            `<span class="tid-plat-occ">${occText}</span></div>` +
            (merged.length
                ? `<table class="tid-pl-t"><tbody>${merged.join("")}</tbody></table>`
                : '<p class="tid-pl-none">到着・通過の予定はありません</p>') +
            `</div>`;
    });

    if (plan.depotOut.length) {
        html += `<div class="tid-station-sub">留置場からの出区予定</div><table class="tid-pl-t"><tbody>` +
            plan.depotOut.slice(0, 6).map(x =>
                `<tr><td class="tid-pl-time">${esc(tidClock(plan.at + x.inSec))}頃</td>` +
                `<td>${chip(x)}</td><td>${esc(x.type)}</td><td>${esc(x.dest || "")}</td>` +
                `<td colspan="2"><small>${esc(x.vehicles.join("+"))}</small></td></tr>`).join("") +
            `</tbody></table>`;
    }

    e.innerHTML = html;
    const btn = this.el("tid-station-close");
    if (btn) btn.addEventListener("click", () => { this.stationName = null; this.renderStation(); });
};
