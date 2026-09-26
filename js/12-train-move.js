/* このファイルは index.html から分割されたものです。
   Train: 進行(ブロック移動)と停車判定 */

/**
 * 線区の端 (前方が線路の無いプレースホルダ) に着いたときの終点扱い。
 *
 * ★以前は move() の中に書いてあり、しかも
 *     if (this.state !== "stopped") { … }
 *   という条件が付いていた。状態が "holding" のあいだ move() は
 *   呼ばれないので、いちど抑止に入った列車は二度と終点扱いにならず、
 *   放出・新三田のような線区の端に溜まり続けていた。
 *   そこが詰まると線区いっぱいに列車が連なり、尼崎で着発線を共有している
 *   本線の下りまで止まっていた (乱数の種による詰まりの崩壊の主因)。
 *
 * 戻り値: 終点扱いにしたら true
 */
Train.prototype.endOfLineStop = function () {
    if (this.isFinalStop) return false;      // すでに終点扱い
    const blks = this.game.trackMgr.blocks[this.trackId];
    const here = blks ? blks[this.currBlockIndex] : null;
    let endName = blockStationName(here);
    /* ★駅でない所 (駅と駅のあいだ) で線区の端に当たったときは、
       直前に通った駅を終点として扱う。行先が空のままだと、
       その後の入区・回収の処理が留置場を決められない。 */
    if (!endName || !isRealStationBlock(here)) {
        endName = "";
        for (let k = 1; blks && k <= UNITS_PER_STATION * 2; k++) {
            const b = blks[this.currBlockIndex - this.dir * k];
            if (b && b.x !== -1000 && isRealStationBlock(b)) { endName = blockStationName(b); break; }
        }
    }
    this.turnbackTrack = null;
    this.state = "stopped";
    this.hasStoppedAtCurrent = true;
    this.isFinalStop = true;
    this.timer = 30;
    this.stuckTime = 0;
    this.dest = endName || this.dest;
    if (!this.nextAction || this.nextAction === "turnback") this.nextAction = "depot";
    return true;
};
/**
 * 線路図の外にある行先について、その手前で運転を打ち切る線区の端の駅。
 * 線路図の中の駅なら null。
 */
const BEYOND_LINE_END = {
    // 山陽本線 上郡より西 (岡山方面)・智頭急行 (特急スーパーはくと)
    "三石": "上郡", "岡山": "上郡", "岡山タ": "上郡", "広島タ": "上郡", "福岡タ": "上郡",
    "高松タ": "上郡", "鳥取": "上郡", "倉吉": "上郡",
    // 赤穂線 播州赤穂より先
    "日生": "播州赤穂", "長船": "播州赤穂",
    // 学研都市線 木津より先
    "奈良": "木津", "加茂": "木津",
    // JR宝塚線 新三田より先
    "篠山口": "新三田", "福知山": "新三田", "豊岡": "新三田", "城崎温泉": "新三田"
};
function lineEndForBeyond(dest) {
    return BEYOND_LINE_END[dest] || null;
}

/**
 * 終着列車の「反対側の着発線への到着」。
 *
 * 到着する側ののどに上下をつなぐ渡り線がある駅 (js/03-stations.js の
 * STATION_ARRIVAL_CROSSOVER) では、その駅で折り返す列車は反対方向の
 * 着発線にも入れる。そうすれば折り返したあと渡り線を通らずに発車できる。
 *
 * 反対側に2本以上空きがあるとき (反対方向の列車のぶんを1本残せるとき)、
 * または自分の側が満線のときに使う。使えないときは null。
 *   戻り値 { trackId, block, lane }
 */
Train.prototype.terminalCrossArrival = function (nextBlock) {
    if (globalThis.__NO_CROSS) return null;
    if (!nextBlock || !isRealStationBlock(nextBlock)) return null;
    if (["普通", "快速", "新快速"].indexOf(this.type) < 0) return null;
    if (this.serviceChange || this.trackChangeReservation) return null;
    const st = blockStationName(nextBlock);
    if (!st || st !== this.dest) return null;
    if (this.nextAction && ["turnback", "depot"].indexOf(this.nextAction) < 0) return null;
    if (!canCrossArriveAt(st, this.dir)) return null;
    // 留置場に入る列車は反対側へ入れる意味が無い
    const dep = DEPOTS[st];
    if (dep && !dep.turnbackFirst && dep.trains.length < dep.capacity) return null;
    const oppId = this.oppositeTrackId(st);
    if (!oppId || oppId === this.trackId) return null;
    const ob = this.game.trackMgr.blocks[oppId];
    const oppB = ob ? ob[nextBlock.index] : null;
    if (!oppB || oppB.x === -1000 || blockStationName(oppB) !== st) return null;
    const oppFree = oppB.lanes.filter(l => l === null).length;
    if (oppFree === 0) return null;
    const ownFree = nextBlock.lanes.filter(l => l === null).length;
    if (oppFree < 2 && ownFree > 0) return null;
    // 反対側の着発線のうち、折り返して出ていける番線 (外側から) を選ぶ
    let lane = -1;
    for (let l = oppB.lanes.length - 1; l >= 0; l--) {
        // ホームのある線だけ (終着駅で客扱いをするので)
        if (oppB.lanes[l] === null && canDepartTo(st, oppId, l, oppId) && laneHasPlatform(st, oppId, l)) { lane = l; break; }
    }
    if (lane < 0) return null;
    return { trackId: oppId, block: oppB, lane: lane };
};

/**
 * 進行方向と同じ向きの、同じ側の線路ID (上り外 ⇔ 下り外 など)。
 * 内側線の無い所では外側線にする。
 */
function sameSideTrackFor(trackId, dir, stIdx) {
    let tid;
    if (/^(Kosei|Fukuchi|Tozai|Ako)_/.test(trackId)) {
        tid = trackId.replace(/_(Up|Down)$/, dir === 1 ? "_Up" : "_Down");
    } else if (trackId.indexOf("Hoppo") >= 0) {
        tid = (dir === 1) ? "Up_Hoppo" : "Down_Hoppo";
    } else {
        tid = (dir === 1 ? "Up_" : "Down_") + (trackId.indexOf("In") >= 0 ? "In" : "Out");
        if (tid.indexOf("In") >= 0 && !innerTrackExists(stIdx)) tid = tid.replace("In", "Out");
    }
    return tid;
}

/**
 * ★線路の向きと列車の向きの食い違いを直す (逆走させないための見張り)。
 *
 * 終着列車は反対側の着発線へ入ることがあり (terminalCrossArrival)、
 * 折り返しは「その場で向きだけ変え、発車のときに渡る」形にしている。
 * そのあとで運転整理 (回送への変更・内側線から外側線への転線など) が
 * 線路を付け替えると、たとえば「上り外側線にいる下り列車」ができ、
 * そのまま走り出すと上り線を逆走して上り列車と向かい合ってしまう
 * (実測: 西明石で反対側に着いた普通が回送に変わり、大久保まで上り線を逆走した)。
 *
 * 駅にいるあいだに食い違いを見つけたら、発車のときに入る線路
 * (turnbackTrack) を正しい側にしておく。駅の渡り線を通って正しい線路へ出る。
 */
Train.prototype.fixDirectionTrack = function () {
    // 向きの合わない「発車のときに入る線路」は古い印なので捨てる
    if (this.turnbackTrack && trackDirOf(this.turnbackTrack) &&
        trackDirOf(this.turnbackTrack) !== this.dir) this.turnbackTrack = null;
    const td = trackDirOf(this.trackId);
    if (!td || td === this.dir) return;
    if (this.turnbackTrack && trackDirOf(this.turnbackTrack) === this.dir) return;
    /* 終着駅で折り返しを待っているあいだは直さない
       (反対側の着発線に着いた列車は、折り返すと向きが線路と合う) */
    if (this.isFinalStop || this.state === "turning_back") return;
    const blks = this.game.trackMgr.blocks[this.trackId];
    const b = blks ? blks[this.currBlockIndex] : null;
    if (!b || !isRealStationBlock(b)) return;
    const want = sameSideTrackFor(this.trackId, this.dir, b.stationIdx);
    const wb = this.game.trackMgr.blocks[want];
    if (!wb || !wb[this.currBlockIndex] || wb[this.currBlockIndex].x === -1000) return;
    this.turnbackTrack = want;
};

/**
 * 番線を共有する分岐駅 (相生) で、これから進む線路の名前に付け替える。
 * レーンの配列そのものを共有している (js/05-track-manager.js) ので、
 * 付け替えても在線の位置は変わらない。
 *   相生 … 赤穂線から来た上り列車は本線 (上り外) へ、
 *           赤穂線へ向かう下り列車は赤穂線 (赤穂線下り) へ。
 */
Train.prototype.relabelAtSharedJunction = function () {
    const blks = this.game.trackMgr.blocks[this.trackId];
    const cb = blks ? blks[this.currBlockIndex] : null;
    if (!cb || cb.stationIdx !== AKO_JUNCTION_IDX || !isRealStationBlock(cb)) return;
    let want = null;
    const toAko = AKO_THROUGH_DESTS.indexOf(this.dest) >= 0;
    if (this.dir === 1 && this.trackId === "Ako_Up") want = "Up_Out";
    else if (this.dir === -1 && this.trackId === "Down_Out" && toAko) want = "Ako_Down";
    else if (this.dir === -1 && this.trackId === "Ako_Down" && !toAko) want = "Down_Out";
    if (!want) return;
    const tb = this.game.trackMgr.blocks[want];
    const nb = tb ? tb[this.currBlockIndex] : null;
    if (!nb || nb.lanes !== cb.lanes) return;          // 共有していない (念のため)
    if (this.turnbackTrack === this.trackId) this.turnbackTrack = null;
    this.trackId = want;
    if (this.turnbackTrack === want) this.turnbackTrack = null;
};

Train.prototype.move = function () {
        const blks = this.game.trackMgr.blocks[this.trackId];
        const nextIdx = this.currBlockIndex + this.dir;
        if (nextIdx < 0 || nextIdx >= blks.length) { this.remove(); return; }

        /* ★折り返した直後は、到着した番線 (反対方向の線路) に留まっている。
           前方は「発車で入る線路」で見る。自分の線路で見ると、
           複々線・分岐線の端では線路の無い区間を指してしまう。 */
        const aheadBlks = (this.turnbackTrack && this.game.trackMgr.blocks[this.turnbackTrack])
            ? this.game.trackMgr.blocks[this.turnbackTrack] : blks;
        /* 行き止まりの折返線 (甲子園口の2番) から、行き止まりの方へは進めない。
           (折り返して反対の線路へ出る列車は turnbackTrack を持っている) */
        {
            const cb0 = blks[this.currBlockIndex];
            const stn0 = cb0 && isRealStationBlock(cb0) ? blockStationName(cb0) : null;
            const stub0 = stn0 && STATION_STUB_LANES[stn0];
            if (stub0 && this.dir === stub0.deadEnd && !this.turnbackTrack && isStubLane(stn0, this.trackId, this.lane)) {
                this.state = "holding"; this.timer = 15;
                this.stubBlocked = (this.stubBlocked || 0) + 1;
                // 長く止まるなら、その場で折り返して反対の線路へ出す (取り残さない)
                if (this.stubBlocked >= 8 && this.game.ops.moveToOppositeTrack(this, stn0, -this.dir)) {
                    this.stubBlocked = 0;
                    if (["回送", "貨物"].indexOf(this.type) < 0) this.dest = this.game.spawner.fallbackTerminal(this.dir, stn0, this.trackId);
                }
                return;
            }
        }

        let nextBlock = aheadBlks[nextIdx];
        if (!nextBlock) { this.remove(); return; }

        /* ★線路の無い区間 (x === -1000 のプレースホルダ) へは進ませない。
           湖西線・JR宝塚線・JR東西線・北方貨物線は本線とインデックスを
           共有していて、線区の外はプレースホルダになっている。
           以前はここを素通りできてしまい、線路の無い場所を走り続ける
           列車が生まれていた。線区の端に着いたら、そこで運転を打ち切る。 */
        if (nextBlock.x === -1000) {
            this.endOfLineStop();
            return;
        }
        let targetTrackId = this.trackId;
        const currentBlock = blks[this.currBlockIndex]; // ★追加

// 尼崎駅への直接進入判定（目標路線の決定）
        if (nextBlock && nextBlock.stationIdx === STATION_MAP["尼崎"]) {
            if (this.dir === 1 && this.trackId === "Fukuchi_Up") {
                // 特急 (こうのとり) は列車線 (外側線) へ
                targetTrackId = TOZAI_THROUGH_DESTS.includes(this.dest) ?
"Tozai_Up" : (this.type === "特急" ? "Up_Out" : "Up_In");
            } else if (this.dir === 1 && !this.trackId.includes("Tozai") && TOZAI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Tozai_Up";
            } else if (this.dir === -1 && !this.trackId.includes("Fukuchi") && FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Fukuchi_Down";
            } else if (this.dir === -1 && this.trackId === "Tozai_Down") {
                targetTrackId = FUKUCHI_THROUGH_DESTS.includes(this.dest) ?
"Fukuchi_Down" : "Down_In";
            }
        }

        /* ★尼崎を「発車するとき」の分岐。
           上の判定は尼崎へ「進入するとき」だけを見ていたため、
           尼崎で折り返したり、尼崎始発になったりした列車が
           分岐線へ入れず、本線を走り続けてしまっていた。 */
        if (currentBlock && currentBlock.stationIdx === STATION_MAP["尼崎"]) {
            if (this.dir === 1 && this.trackId.indexOf("Tozai") !== 0 &&
                TOZAI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Tozai_Up";
            } else if (this.dir === -1 && this.trackId.indexOf("Fukuchi") !== 0 &&
                FUKUCHI_THROUGH_DESTS.includes(this.dest)) {
                targetTrackId = "Fukuchi_Down";
            }
        }

        /* ------------------------------------------------ 複々線の端での内外の振り分け

           西明石・草津は複々線 (内側線＋外側線) と複線の境目なので、
           ここで内側線・外側線のどちらに入るかが決まる。
           どちら側を走るかは js/24-service-rules.js の
           serviceTrackSide() が1か所で決める。

           ★以前はここに「快速は 7:24〜8:36 の上りだけ外側線」
             「新快速は朝ラッシュ以外は内側線」という独自の条件が
             書かれていて、いまのJR西日本の規則と食い違っていた。
               新快速 … 該当区間を通して外側線
               快速   … 平日朝の 高槻→大阪 だけ外側線、ほかは内側線 */
        const fourTrackEdge = (idx) => idx === STATION_MAP["西明石"] || idx === STATION_MAP["草津"];

        if (nextBlock && fourTrackEdge(nextBlock.stationIdx) &&
            innerTrackExists(nextBlock.stationIdx) && this.trackId.includes("Out")) {
            // 複々線へ入る向き (西明石は上り / 草津は下り) のときだけ内側線を選ぶ
            const entering = (nextBlock.stationIdx === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
            if (entering && this.wantTrackAt(nextBlock.stationIdx).includes("In")) {
                const inTrackId = this.trackId.replace("Out", "In");
                const tBlks = this.game.trackMgr.blocks[inTrackId];
                if (tBlks) {
                    const targetNextBlk = tBlks.find(b => b.stationIdx === nextBlock.stationIdx);
                    if (targetNextBlk && this.findFreeLane(targetNextBlk) !== -1) {
                        targetTrackId = inTrackId;
                    }
                }
            }
        }

        if (currentBlock && fourTrackEdge(currentBlock.stationIdx)) {
            const here = currentBlock.stationIdx;
            const entering = (here === STATION_MAP["西明石"]) ? (this.dir === 1) : (this.dir === -1);
            if (entering && this.trackId.includes("Out") && this.wantTrackAt(here).includes("In")) {
                targetTrackId = this.trackId.replace("Out", "In");
            } else if (!entering && this.trackId.includes("In") &&
                       blockStationName(currentBlock) !== this.dest) {
                // 複々線から複線へ出るので、必ず外側線 (内側線はそこで終わる)
                targetTrackId = this.trackId.replace("In", "Out");
            }
        }

        /* ★折り返す列車は、到着のときから折り返し用の着発線に入れる。
           こうしないと、折り返すたびに番線が変わってしまう。
           詳しくは js/11-train-core.js の「折り返しと番線」を参照。 */
        /* ★折り返した列車は、発車のときに反対方向の線路へ移る。
           到着した番線のまま向きだけ変えてあるので (executeTurnBack)、
           最初の1ブロックを進むときに駅の渡り線を通って本来の線路に入る。
           これで「到着番線 → 折り返し → 同じ番線から発車」になる。 */
        if (this.turnbackTrack && this.turnbackTrack !== this.trackId) {
            targetTrackId = this.turnbackTrack;
        }

        /* ★貨物ターミナル (js/34-freight-terminals.js)。行先がそのターミナルの貨物列車と、
           乗務員交代・待避で停まる貨物列車は、本線から着発線へ横に入る。 */
        {
            // 吹田タへ入る列車は、手前で貨物線 (北方貨物線) に入れておく
            const hTid = this.suitaCorridorTrack(nextIdx, targetTrackId);
            if (hTid) targetTrackId = hTid;
            const fTid = this.freightTerminalEntryTrack(nextIdx, targetTrackId);
            if (fTid) targetTrackId = fTid;
        }

        /* ★最後の関門: 進む線路の向きが列車の向きと食い違っていたら、
           同じ側の正しい向きの線路へ直す (逆走させない)。 */
        if (trackDirOf(targetTrackId) && trackDirOf(targetTrackId) !== this.dir) {
            if (this.turnbackTrack === targetTrackId) this.turnbackTrack = null;
            const fixed = sameSideTrackFor(targetTrackId, this.dir, nextBlock.stationIdx);
            const fb = this.game.trackMgr.blocks[fixed];
            if (fb && fb[nextIdx] && fb[nextIdx].x !== -1000) targetTrackId = fixed;
            else { this.state = "holding"; this.timer = 15; return; }
        }

        /* ★運転見合わせ・段階開通の区間へは、強制発車でも入らない
           (確認列車の許可を持つ列車だけ通す)。 */
        if (this.game.trackMgr.isSuspended(targetTrackId, nextIdx, this)) {
            this.state = "holding";
            this.timer = 15;
            return;
        }

        /* ★単線区間 (一閉塞一列車)。対向列車がいる区間へは入らない。
           強制発車 (指令扱い) でもここは破らない。破ると単線の上で
           向かい合った2本がどちらも動けなくなる。 */
        if (this.singleTrackBlocked(nextIdx, targetTrackId)) {
            this.state = "holding";
            this.timer = 15;
            return;
        }

        let targetLane = -1;
        let actualNextBlock = nextBlock;
        /* ★指令の着発番線変更 (js/13-train-hold.js の reservedEntry)。
           予約の駅へ進入するときは、指定の線路・レーンに入れる。
           ふさがっていれば手前で待つ。待ちの上限を過ぎたら予約は取りやめになり、
           ふだんの番線の選び方に戻る。 */
        const resv = this.reservedEntry(nextIdx);
        if (resv && !resv.free) {
            this.state = "holding";
            this.timer = 15;
            return;
        }
        if (resv) {
            targetTrackId = resv.trackId;
            targetLane = resv.lane;
            actualNextBlock = resv.block;
        } else
        // 転線が発生する場合のブロックと空きレーンの取得
        if (targetTrackId !== this.trackId) {
            let tBlks = this.game.trackMgr.blocks[targetTrackId];
            if (tBlks) {
                // ★修正: 尼崎固定のハードコーディングを廃止し、実際の進入先駅ブロックまたは同一座標で転線先を動的に決定
                let targetNextBlk = tBlks.find(b => (nextBlock.stationIdx !== undefined && b.stationIdx === nextBlock.stationIdx) || Math.abs(b.x - nextBlock.x) < 20);
                if (targetNextBlk) {
                    // 入ってくる線路と出ていく線路の両方につながる番線を選ぶ
                    targetLane = this.findFreeLane(targetNextBlk, targetTrackId);
                    actualNextBlock = targetNextBlk;
                }
            }
        } else {
            /* ★終着列車は、到着する側ののどに上下をつなぐ渡り線がある駅なら
               反対側 (折り返して発車する側) の着発線にも入れる (近江今津など)。 */
            const cross = this.terminalCrossArrival(nextBlock);
            if (cross) {
                if (globalThis.__CROSS_LOG) globalThis.__CROSS_LOG.push({ t: this, at: this.game.currentTime, st: blockStationName(nextBlock), from: this.trackId, to: cross.trackId });
                targetTrackId = cross.trackId;
                targetLane = cross.lane;
                actualNextBlock = cross.block;
            } else {
                // 通常移動の場合
                targetLane = this.findFreeLane(nextBlock);
                actualNextBlock = nextBlock;
            }
        }

        // 移動の確定（ブロックとレーンが確実に確保できた場合のみ実行）
        if (targetLane !== -1) {
            freeOwnLane(blks[this.currBlockIndex].lanes, this);
            // 折り返し後の転線が済んだので、印を消す
            if (this.turnbackTrack && targetTrackId === this.turnbackTrack) this.turnbackTrack = null;
            this.trackId = targetTrackId;
            this.currBlockIndex = actualNextBlock.index;
            this.lane = targetLane;
            actualNextBlock.lanes[this.lane] = this;
            nextBlock = actualNextBlock; // 以降の処理（停車判定など）を新しいブロックで行うために上書き
            if (resv) this.completeReservation("進入しました");
        } else {
            // 満線の場合や転線先が見つからない場合は移動せずに手前で待機
            this.state = "holding";
            this.timer = 15;
            return; 
        }

        if (nextBlock.isStation || nextBlock.hoppoStationName) {
            let st = (nextBlock.hoppoStationName) ? {name: nextBlock.hoppoStationName, stopTime:60} : STATIONS[nextBlock.stationIdx];
            if (!st) st = {name: "Unknown", stopTime: 60, type: 0};

            /* ★宮原操は北方貨物線の上にしか駅ブロックが無いが、
               旅客車の出入区は本線 (新大阪の位置) からつながっている。
               本線を走る宮原操行きは、新大阪の位置で到着扱いにする。
               これをしないと、宮原操行きの回送が新大阪を通り越して
               いつまでも終点に着けなかった。 */
            if (this.dest === "宮原操" && st.name === "新大阪" &&
                this.trackId.indexOf("Hoppo") < 0) {
                st = { name: "宮原操", stopTime: 60, type: 0 };
            }
            // 吹田貨物ターミナルも同じく、本線側では吹田の位置で到着扱いにする
            if (this.dest === "吹田貨" && st.name === "吹田" &&
                this.trackId.indexOf("Hoppo") < 0) {
                st = { name: "吹田貨", stopTime: 60, type: 0 };
            }
            
            // ★混雑状況に応じた行先変更(間引き・延長)判定
            this.checkCongestionAndAdjust(st.name);

            if (this.plannedStop && st.name === this.plannedStop) {
                this.isManuallySuspended = true;
                this.manualSuspendTimer = 0;
                this.hasNotifiedSuspendLong = false;
                this.plannedStop = null;
                this.state = "stopped"; this.timer = 15; return;
            }
            
            if (this.serviceChange && this.serviceChange.at === st.name) {
                this.state = "stopped";
                this.timer = st.stopTime || 60;
                this.nextAction = "turnback"; this.hasStoppedAtCurrent = true; return;
            }

            if (this.trainNo.includes("はまかぜ") && this.dir === -1 && st.name === "姫路") { 
                this.state="stopped";
                this.timer=60; this.nextAction="depot"; 
                this.isFinalStop = true; 
                return;
            }
            // ★こうのとりは尼崎止まりではない (福知山線へ入り、新三田で線路図の外へ出る。下の lineEndForBeyond)
            /* 線路図の外へ向かう列車の終点処理。
               姫路より西・学研都市線を線路図に入れたので、線区の端は
                 山陽本線 … 上郡 (その先 三石・岡山方面、智頭急行)
                 赤穂線   … 播州赤穂 (その先 日生・長船・岡山方面)
                 学研都市線 … 木津 (その先 関西本線・奈良線)
               になった。そこから先へ行く列車は端の駅で運転を打ち切る。 */
            const beyondEnd = lineEndForBeyond(this.dest);
            if (beyondEnd && st.name === beyondEnd && this.dest !== st.name) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                // 貨物・特急は線区の外へ抜けていく (編成・機関車は在庫へ戻す)
                if (["貨物", "特急"].indexOf(this.type) >= 0) { this.timer = 30; this.nextAction = "remove"; }
                else { this.timer = 60; this.nextAction = "depot"; }
                return;
            }
            
            // マップ外の駅へ向かう列車の終点処理（新三田以北・京橋以東・塚口止まり）
            if (st.name === "新三田" && ["篠山口", "福知山", "豊岡", "城崎温泉"].includes(this.dest) && this.dir === -1) {
                this.state = "stopped";
                this.timer = 60; this.nextAction = "depot"; this.isFinalStop = true; this.hasStoppedAtCurrent = true; return;
            }
            // 学研都市線の放出以東 (松井山手・四条畷など) へ向かう列車は、
            // 描画範囲の東端である放出まで走らせてから運転を打ち切る。
            // ★以前は京橋で打ち切っていたが、実際には京橋から放出まで走るため
            //   放出まで延ばした (JR東西線の放出延伸)。
            // (学研都市線の線路図の外への列車は、上の lineEndForBeyond で木津止まりにする)
            if (st.name === "塚口" && this.dest === "塚口") {
                this.state = "stopped";
                this.timer = 60; this.nextAction = "depot"; this.isFinalStop = true; this.hasStoppedAtCurrent = true; return;
            }

            /* ★貨物ターミナルの着発線に着いた (js/34-freight-terminals.js)。
               行先の列車は荷役・機回しをして次の貨物列車になり (freightTerminalWork)、
               通過する列車は乗務員交代・待避のあと先へ進む。 */
            if (nextBlock.freightTerminal && isFreightTerminalTrack(this.trackId)) {
                this.arriveFreightTerminal(nextBlock.freightTerminal);
                return;
            }
            if (this.type === "貨物" && freightTerminalStation(this.dest) === st.name) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 60;
                this.nextAction = "freight_turn";
                return;
            }
            /* 大阪タ (城東貨物線)・百済タ・安治川口 (梅田貨物線) 行きは
               吹田貨物ターミナル (吹田タ) の着発線で機関車の付け替えと乗務員の交代をしてから
               線路図の外へ出ていく (上の arriveFreightTerminal)。
               ★以前は旅客駅の吹田・北方貨物線の吹田貨で消していた。
                 着発線にたどり着けなかった列車 (線路図の端など) のための保険だけ残す。 */
            if (this.type === "貨物" && st.name === "吹田貨" && ["大阪タ", "百済タ", "安治川タ"].includes(this.dest) &&
                this.dir === -1) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = (st.name === "吹田貨") ? 900 : 60;
                this.nextAction = "remove";
                return;
            }
            // 湖西線上り貨物の敦賀での消滅
            if (this.type === "貨物" && st.name === "敦賀" && this.dest === "富山タ") {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 15;
                this.nextAction = "remove";
                return;
            }
            // 貨物上り列車の米原での消滅
            if (this.type === "貨物" && st.name === "米原" && ["東京タ", "名古屋タ"].includes(this.dest) && this.dir === 1) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = 15;
                this.nextAction = "remove";
                return;
            }

            if (st.name === this.dest) {
                if (this.type === "貨物" || this.type === "回送") {
                    if (!this.nextAction || this.nextAction === "turnback") this.nextAction = "remove";
                }
                
                // ★修正: 駅進入直後に消滅・ワープせず、一旦ホームに停車させる
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                this.isFinalStop = true;
                this.timer = (this.type === "貨物" || this.type === "回送") ? 15 : 60; // 営業列車は客扱いの時間として60秒停車
            } else if (!this.hasStoppedAtCurrent && this.shouldStop(st)) {
                this.state = "stopped";
                this.hasStoppedAtCurrent = true;
                if (["貨物","臨時"].includes(this.type)) {
                    this.timer = (st.name==="吹田貨")?780:(["姫路","神戸","京都","ひめじ別所","鷹取","西大路"].includes(st.name)?420:300);
                } else this.timer = st.stopTime;

                // 快速列車の場合、降格チェックを実行
                if (this.type === "快速") {
                    this.checkRapidDowngrade(st.name);
                }
                
                // 普通列車の場合、間引き(行先変更)チェックを実行
                if (this.type === "普通") {
                    this.checkLocalThinning(st.name);
                }
            } else {
                this.state = "running";
                this.timer = this.calcTravelTime();
            }
        } else {
            this.state = "running";
            this.timer = this.calcTravelTime();
        }
};

Train.prototype.shouldStop = function (st) {
        if (!st || !st.name) return false;

        // ★追加: 湖西線の駅間調整用ダミーブロック（駅が存在しない区間）は無条件で通過とする
        if (st.name === "湖西線通過") return false;

        // 貨物ターミナルの着発線 (入るのは、そこに用のある貨物列車だけ)
        if (FREIGHT_TERMINALS[st.name]) return this.type === "貨物";
        let realSt = (STATION_MAP[st.name] !== undefined) ? STATIONS[STATION_MAP[st.name]] : st;
        let isFreight = realSt.isFreightTerm === true;
        if (this.serviceChange && this.serviceChange.at === st.name) return true;
        
        if (st.name === "吹田貨" && !["貨物", "臨時"].includes(this.type)) return false;
        if (st.name === "宮原操") return false;

        // ★湖西線の特例（サンダーバード等は通過、新快速・快速は一部停車）
        const koseiRapidsStop = ["大津京", "比叡山坂本", "おごと温泉", "堅田", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        const koseiSpecialRapidsStop = ["大津京", "比叡山坂本", "堅田", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原"];
        if (this.trackId.includes("Kosei")) {
            if (["貨物", "回送", "臨時"].includes(this.type)) return false;
            
            // ★追加: 特急サンダーバードの停車ロジック
            if (this.type === "特急") {
                if (this.trainNo && this.trainNo.includes("サンダーバード")) return false; // サンダーバードは湖西線内全通過
                let timeH = (this.game.currentTime / 3600) % 24;
                let isRush = (timeH >= 6.0 && timeH < 9.5) || (timeH >= 17.0 && timeH < 21.0);
                if (isRush && ["堅田", "近江今津"].includes(st.name)) return true;
                return false;
            }

            if (this.type === "普通") return true;
            if (this.type === "快速" && koseiRapidsStop.includes(st.name)) return true;
            if (this.type === "新快速" && koseiSpecialRapidsStop.includes(st.name)) return true;
            return false;
        }

        // 赤穂線 (相生〜播州赤穂) は新快速も含めて各駅に停まる
        if (this.trackId.indexOf("Ako") === 0) {
            if (["貨物", "回送", "臨時", "特急"].includes(this.type)) return false;
            return true;
        }

        if (this.trackId.includes("Fukuchi") || this.trackId.includes("Tozai")) {
            if (["貨物", "回送", "臨時"].includes(this.type)) return false;
            // 福知山線の特急の停車駅 (こうのとりは尼崎にも停まる。尼崎では福知山線の線路として判定されるため)
            if (this.type === "特急") return ["宝塚", "三田"].includes(st.name) ||
                (st.name === "尼崎" && !!this.trainNo && this.trainNo.indexOf("こうのとり") >= 0);
            /* 学研都市線の快速は、京橋〜四条畷で 放出・住道 だけに停まり、
               四条畷から先 (木津方) は各駅に停まる。JR東西線の中は各駅に停まる。 */
            if (this.type === "快速" && this.trackId.includes("Tozai")) {
                const si = STATION_MAP[st.name];
                if (si !== undefined && si > STATION_MAP["京橋"] && si < STATION_MAP["四条畷"]) {
                    return ["放出", "住道"].includes(st.name);
                }
                return true;
            }
            if (this.type === "快速" && this.trackId.includes("Fukuchi")) {
                const fukuchiRapidStops = ["尼崎", "塚口", "伊丹", "川西池田", "中山寺", "宝塚", "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田"];
                return fukuchiRapidStops.includes(st.name);
            }
            if (this.type === "快速" && this.trackId.includes("Tozai")) return true;
            if (this.type === "普通") return true;
            return false;
        }

        if (st.name === "向日町操" && !["回送", "貨物", "臨時"].includes(this.type) && this.dest !== "向日町操") return false;

        if (this.type === "普通") {
            if (["宮原操", "向日町操", "吹田貨"].includes(st.name)) return false;
            if (isFreight && st.name !== "ひめじ別所") return false;
            return true;
        }
        
        if (["貨物", "臨時"].includes(this.type)) {
            /* ★貨物列車は、以前は旅客駅の ひめじ別所・鷹取・西大路・吹田貨 に停まって
               乗務員交代・待避をしていた。いまは独立した貨物ターミナルの着発線に入る
               (js/34-freight-terminals.js)。旅客駅に停まるのは試運転などの臨時列車だけ。 */
            if (this.type === "貨物") return false;
            if (st.name === "ひめじ別所" && this.skipHimejiFreight) return false;
            if (st.name === "西大路" && this.skipKyotoFreight) return false;
            return (["ひめじ別所", "鷹取", "吹田貨", "西大路"].includes(st.name) || isFreight) ? true : false;
        }

        const stType = (realSt.type !== undefined) ? realSt.type : 0;
        
        if (this.type === "快速") {
            const stIdx = STATION_MAP[st.name];
            if (stIdx >= 0 && stIdx <= STATION_MAP["西明石"]) return true;
            if (stIdx >= STATION_MAP["高槻"]) return true;
            if (isFreight) return false;
            return (stType >= 1);
        }

        if (isFreight) return false;
        if (this.type === "新快速") {
            if (["姫路", "加古川", "西明石", "明石", "神戸", "三ノ宮", "芦屋", "尼崎", "大阪", "新大阪", "高槻", "京都"].includes(st.name)) return true;
            return (stType >= 2);
        }
        
        if (this.type === "特急") {
            // こうのとり (福知山線直通) は尼崎にも停まる
            if (this.trainNo && this.trainNo.indexOf("こうのとり") >= 0) return ["尼崎", "大阪", "新大阪"].includes(st.name);
            return ["姫路", "明石", "三ノ宮", "大阪", "新大阪", "京都", "敦賀"].includes(st.name);
        }
        return false;
};
