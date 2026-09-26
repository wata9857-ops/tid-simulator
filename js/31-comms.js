/* 指令と現場 (乗務員・駅・保線・信号通信区・車両所) とのやりとり。

   ■ 考え方: 重要度で扱いを分ける
     何でもかんでも指令に上げると、細かい連絡に埋もれて
     本当に判断が要る場面を見落とす。実際の指令所でも、
     日常的な照会は当務の指令員が裁いて、重い判断だけが上がってくる。
     そこで場面を3段階に分けた。

       minor     … 日常の照会・軽微な調整
                   → ほかの指令員が処理する。画面には上げない。
                     記録 (業務連絡) には残るので、あとから追える。
       important … 指令の判断が要る場面
                   → 画面に上げる。当該列車はその場に抑止して、
                     指令が答えるまで動かさない。
       critical  … 緊急。ほかの列車・番線にも影響が及ぶ
                   → 画面に上げる。当該列車は抑止。
                     選んだ答えで後続や番線の使い方まで変わる。

   ■ 大事な約束: 答えるまで動かさない
     important / critical の連絡が入ったら、当該列車をその場で抑止する
     (commIncidentHold)。指令が答えるまで動かない。
     答えが返る前に走り出してしまうと、指令の判断に意味がなくなる。
     時間切れでほかの指令員が引き取ったときも、その答えを実行してから
     抑止を解く。「抑止したまま忘れる」ことが無いよう、
     抑止は必ず resolve() で解く作りにしてある。

   ■ 流れ
       1. 現場から連絡が届く           (CommSystem.update → raise)
       2. important 以上なら当該列車を抑止 (commIncidentHold)
       3. 時間が経つと続報が入る        (scene.followUp)
       4. さらに経つと催促が入る        (scene.escalate)
       5. 指令が答える                  (CommSystem.respond)
          … 答えないまま時間切れなら、ほかの指令員が引き取る (autoChoice)
       6. 答えの処置を実行し、抑止を解く (resolve)

   ■ 既存の自動処理は置き換えない
     抑止・続行間隔・運転整理・出入区といった自動の仕組みはそのまま動く。
     選べる答えはどれも既存の指令 (js/28-dispatch.js) や
     列車の設定を呼ぶだけにしてある。

   ■ 画面
     Super-TID の「指令連絡」パネル (js/45-tid-comms.js) に出る。
     旅客向けの画面 (index.html) は答える相手がいないので、
     すべて時間切れでほかの指令員が処理する (= これまでどおりの自動運転)。
*/

/* 連絡が届く間隔 [秒] (シミュレーション時間)。

   ★指令に上げる連絡は減らし、そのぶん1件ずつを重くする。
     細かい照会 (minor) はこれまでどおりの頻度で起きるが、
     ほかの指令員が処理するので画面には出ない。 */
const COMM_MIN_INTERVAL = 150;          // 何かしらの連絡が起きる間隔
const COMM_MAX_INTERVAL = 400;
/* 指令に上げる (important / critical) 連絡の最短間隔。
   これを空けないと、前の判断の結果を見る前に次が来てしまう。 */
const COMM_MAJOR_GAP    = 540;
const COMM_MAX_PENDING  = 2;            // 同時に抱える件数 (3 → 2)

/* 重要度ごとの決まりごと。
     hold   … 答えが出るまで当該列車を抑止するか
     limit  … 答えを待つ時間 [秒]
     label  … 画面に出す表示 */
const COMM_LEVELS = {
    minor:     { hold: false, limit: 90,  label: "連絡",   rank: 0 },
    important: { hold: true,  limit: 210, label: "要判断", rank: 1 },
    critical:  { hold: true,  limit: 150, label: "緊急",   rank: 2 }
};

/** 重みつきの抽選 */
function commPick(list) {
    if (!list || !list.length) return null;
    let total = 0;
    list.forEach(o => { total += (o.w === undefined ? 1 : o.w); });
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const o of list) {
        r -= (o.w === undefined ? 1 : o.w);
        if (r < 0) return o;
    }
    return list[list.length - 1];
}

/** 候補から1つ選ぶ */
function commOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** その列車がいま居る場所の呼び方 */
function commWhere(game, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    const b = blks ? blks[t.currBlockIndex] : null;
    if (!b || b.x === -1000) return "駅間";
    const st = blockStationName(b);
    if (st && (b.isStation || b.hoppoStationName)) return st + "駅";
    // 駅間なら手前の駅の名前を添える
    for (let k = 1; k <= UNITS_PER_STATION * 2; k++) {
        const p = blks[b.index - t.dir * k];
        if (p && p.x !== -1000 && isRealStationBlock(p)) return blockStationName(p) + "〜次駅間";
    }
    return "駅間";
}

/** その列車がいま居る駅のインデックス (駅間なら手前の駅) */
function commStationIdx(game, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return undefined;
    for (let k = 0; k <= UNITS_PER_STATION * 2; k++) {
        const b = blks[t.currBlockIndex - t.dir * k];
        if (b && b.x !== -1000 && isRealStationBlock(b)) return STATION_MAP[blockStationName(b)];
    }
    return undefined;
}

/**
 * 行先までの駅数を、列車の走っている線路の上で数える。
 * 行先がその線路の上に無い (線区をまたぐ・線路図の外) ときは null。
 * ★駅のインデックスの差で数えると、分岐線の駅 (学研都市線など) と
 *   本線の駅を取り違える。
 */
function commStationsAway(game, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return null;
    const db = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === t.dest);
    if (!db) return null;
    return Math.round((db.index - t.currBlockIndex) * t.dir / UNITS_PER_STATION);
}

/** 進行方向の前方でいちばん近い、指定の一覧に入っている駅 */
function commAheadStation(game, t, list) {
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return null;
    for (let k = 1; k <= UNITS_PER_STATION * 8; k++) {
        const i = t.currBlockIndex + t.dir * k;
        if (i < 0 || i >= blks.length) break;
        const b = blks[i];
        if (!b || b.x === -1000) continue;
        if (!isRealStationBlock(b)) continue;
        const n = blockStationName(b);
        if (!n) continue;
        if (!list || list.indexOf(n) >= 0) return n;
    }
    return null;
}

/** 運転士の呼び方 (実際の無線と同じく列車番号で呼ぶ) */
function commCrew(t) { return (t.trainNo || "当該列車") + " 運転士"; }

/** その列車がいま居る駅の名前 (駅間なら null) */
function commStationName(game, t) {
    const blks = game.trackMgr.blocks[t.trackId];
    const b = blks ? blks[t.currBlockIndex] : null;
    if (!b || b.x === -1000) return null;
    if (!b.isStation && !b.hoppoStationName) return null;
    return blockStationName(b) || null;
}

/** その列車の後ろに続いている同じ向きの列車 (近い順) */
function commTrainsBehind(game, t, stations) {
    const blks = game.trackMgr.blocks[t.trackId];
    const out = [];
    if (!blks) return out;
    for (let k = 1; k <= UNITS_PER_STATION * (stations || 3); k++) {
        const i = t.currBlockIndex - t.dir * k;
        if (i < 0 || i >= blks.length) break;
        const b = blks[i];
        if (!b || b.x === -1000) continue;
        b.lanes.forEach(l => { if (l && l.dir === t.dir && l !== t) out.push(l); });
    }
    return out;
}

/* ------------------------------------------------------------------ 抑止の掛け方

   ★ここは必ずこの関数を通すこと。
     指令の「駅で抑止」(js/28-dispatch.js の hold) は、
     指令が解除するまで永久に止める作りになっている。
     指令連絡の答えとしてそのまま呼ぶと、画面に人がいないとき
     (旅客向け画面や、応答しないままの時間) に抑止が溜まり続け、
     主要駅のホームが埋まって線区全体が動かなくなる。
     実際に、1日ぶん走らせると1駅あたりの所要が3倍 (8分/駅) まで落ち、
     大阪の下り列車が0本になった。

     この関数で掛けた抑止は、抑止駅に着いてから holdSec 秒で自動的に解ける。
     抑止駅にたどり着かないまま時間が経った場合も、指定を取り消す。
     「指令が抑止して、用が済んだら解除する」という当たり前の流れを
     仕組みとして保証する。 */
const COMM_HOLD_GIVEUP = 1500;      // 抑止駅に着かないまま諦めるまでの時間 [秒]

function commHold(game, t, at, holdSec) {
    if (!t) return;
    game.applyCommand({ name: "hold", trainId: t.id, at: at });
    t.commHoldLimit = holdSec || 180;
    t.commHoldTimer = 0;
    t.commHoldExpire = game.currentTime + COMM_HOLD_GIVEUP;
}

/* ------------------------------------------------------------------ 場面の定義

   id      … 種類の名前
   level   … 重要度 minor / important / critical
             minor はほかの指令員が処理し、画面には上げない。
             important 以上は画面に上げ、当該列車を抑止して答えを待つ。
   cat     … 記録に付ける発信元の分類 (js/19-ui-log.js の LOG_SOURCES)
   title   … パネルに出す見出し
   from    … 連絡してきた人の呼び方 (運転士・車掌・駅長・保線区 …)
   limit   … 答えを待つ時間 [秒] (省略すると重要度ごとの既定)
   followUp… しばらく答えが無いときに入る続報
   escalate… さらに答えが無いときの催促
   find    … その場面に当てはまる列車などを探す。無ければ null。
   text    … 現場からの連絡の文面 (候補から選ぶ)
   options … 指令が選べる答え。
               key    ボタンの識別
               label  ボタンの文字
               hint   その答えの意味 (小さい字で出す)
               reply  現場へ返す言葉 (記録に残る)
               apply  実際の処置 (既存の指令・列車の設定を呼ぶ)
               w      時間切れのとき、別の指令員がこれを選ぶ重み
*/
const COMM_SCENES = [

    // ---------------------------------------------------------- 先行列車に詰まった
    {
        id: "block_ahead", level: "minor", cat: "jomuin", title: "続行間隔の照会", limit: 100,
        from: (c) => commCrew(c.train),
        find(game) {
            const c = game.trains.filter(t =>
                t.state !== "finished" && t.state !== "in_depot" &&
                (t.stuckTime || 0) >= 90 && !t.isManuallySuspended &&
                ["普通", "快速", "新快速"].indexOf(t.type) >= 0);
            if (!c.length) return null;
            const t = commOne(c);
            return { train: t, where: commWhere(game, t) };
        },
        text(game, c) {
            return commOne([
                c.where + "で停止信号により停車中です。先行の状況をお願いします。（" + c.train.trainNo + "）",
                c.where + "、閉塞信号 停止現示で機外停車しています。運転再開の見込みをお願いします。（" + c.train.trainNo + "）",
                c.where + "で場内が開通しません。このまま待機でよろしいでしょうか。（" + c.train.trainNo + "）"
            ]);
        },
        options: [
            { key: "wait", label: "そのまま待機", w: 5,
              hint: "先行が進むまで待つ。いまの自動制御のまま。",
              reply: "先行列車が在線中です。信号の現示にしたがって進行してください。",
              apply() { /* 何もしない = 既存の自動制御に任せる */ } },
            { key: "slow", label: "注意運転で進行", w: 3,
              hint: "当該区間に徐行を掛け、詰まりをならす。",
              reply: "当該区間は注意運転でお願いします。速度を落として進行してください。",
              apply(game, c) {
                  const t = c.train;
                  game.trackMgr.addSpeedRestriction(t.trackId,
                      t.currBlockIndex - UNITS_PER_STATION, t.currBlockIndex + UNITS_PER_STATION,
                      1.2, "指令 注意運転", game.currentTime + 300);
              } },
            { key: "force", label: "指令扱いで発車", w: 2,
              hint: "続行間隔の判定を1回だけ飛ばす。進路が無ければ発車しない。",
              reply: "指令扱いで発車を指示します。進路を確認のうえ出発してください。",
              apply(game, c) { game.applyCommand({ name: "force", trainId: c.train.id }); } }
        ]
    },

    // ---------------------------------------------------------- 優等列車の待避
    {
        id: "overtake", level: "important", cat: "jomuin", title: "待避の可否", limit: 110,
        from: (c) => commCrew(c.train),
        find(game) {
            const c = [];
            game.trains.forEach(t => {
                if (t.state === "finished" || t.state === "in_depot") return;
                if (t.type !== "普通" && t.type !== "快速") return;
                const blks = game.trackMgr.blocks[t.trackId];
                if (!blks) return;
                for (let k = 1; k <= UNITS_PER_STATION * 3; k++) {
                    const i = t.currBlockIndex - t.dir * k;
                    if (i < 0 || i >= blks.length) break;
                    const b = blks[i];
                    if (!b || b.x === -1000) continue;
                    const hit = b.lanes.find(l => l && l.dir === t.dir &&
                        PRIORITY[l.type] > PRIORITY[t.type]);
                    if (hit) { c.push({ train: t, chaser: hit }); break; }
                }
            });
            if (!c.length) return null;
            const x = commOne(c);
            const at = commAheadStation(game, x.train, OVERTAKE_STATIONS);
            if (!at) return null;
            return { train: x.train, chaser: x.chaser, at: at };
        },
        text(game, c) {
            return commOne([
                c.at + "で " + c.chaser.trainNo + "(" + c.chaser.type + ") の通過待ちの予定ですが、" +
                    c.chaser.trainNo + " が遅れています。このまま先行してよろしいでしょうか。（" + c.train.trainNo + "）",
                "後続 " + c.chaser.trainNo + "(" + c.chaser.type + ") が接近しています。" +
                    c.at + "での待避をお願いできますか。（" + c.train.trainNo + "）",
                c.at + "の待避について確認します。" + c.chaser.trainNo + " を先に通しますか。（" + c.train.trainNo + "）"
            ]);
        },
        options: [
            { key: "wait", label: "待避して後続を先に", w: 4,
              hint: "当該を待避駅で抑止し、優等列車を先に通す。",
              reply: "予定どおり待避してください。後続の通過後に発車です。",
              // 後続が抜けるくらいの時間で自動的に解ける (commHold)
              apply(game, c) { commHold(game, c.train, c.at, 180); } },
            { key: "go", label: "先行させる", w: 3,
              hint: "当該をそのまま走らせ、優等列車は後ろで調整する。",
              reply: "そのまま先行してください。後続は次駅で調整します。",
              apply(game, c) {
                  c.train.plannedStop = null;
                  game.applyCommand({ name: "force", trainId: c.train.id });
              } },
            { key: "swap", label: "待避駅を変更", w: 2,
              hint: "別の待避駅で退避させ、詰まりを前に持ち込まない。",
              reply: "待避駅を変更します。次の待避可能駅で退避してください。",
              apply(game, c) {
                  const alt = commAheadStation(game, c.train, OVERTAKE_STATIONS) || c.at;
                  commHold(game, c.train, alt, 180);
              } }
        ]
    },

    // ---------------------------------------------------------- 着発番線の変更
    {
        id: "platform", level: "minor", cat: "eki", title: "着発番線の変更", limit: 120,
        from: (c) => c.at + "駅 駅長",
        find(game) {
            const big = ["大阪", "京都", "尼崎", "高槻", "新大阪", "西明石", "草津", "米原"];
            const c = game.trains.filter(t =>
                t.state !== "finished" && t.state !== "in_depot" &&
                (t.delayTime || 0) >= 180 && big.indexOf(t.dest) >= 0);
            if (!c.length) return null;
            const t = commOne(c);
            const st = t.dest;
            const cand = [];
            TID_ROWS.forEach(row => {
                const blks = game.trackMgr.blocks[row.id];
                if (!blks) return;
                const blk = blks.find(b => blockStationName(b) === st && b.x !== -1000);
                if (!blk) return;
                if ((row.dir === 1) !== (t.dir === 1)) return;
                blk.lanes.forEach((occ, li) => {
                    if (occ) return;
                    const lbl = platformLabelOf(st, row.id, li);
                    if (!lbl || !isPlatformLane(st, row.id, li)) return;
                    cand.push({ trackId: row.id, lane: li, label: platformText(lbl) });
                });
            });
            if (!cand.length) return null;
            return { train: t, at: st, cand: cand.slice(0, 2) };
        },
        text(game, c) {
            const min = Math.floor((c.train.delayTime || 0) / 60);
            return commOne([
                c.at + "駅です。" + c.train.trainNo + " が " + min +
                    "分ほど遅れており、予定の番線が塞がる見込みです。着発番線の変更をお願いできますか。",
                c.at + "駅、次発列車との接続の都合で " + c.train.trainNo +
                    " の着発番線を変更したいのですが、よろしいでしょうか。",
                c.at + "駅からです。" + c.train.trainNo + " の到着番線について指示をお願いします。"
            ]);
        },
        options: [
            { key: "keep", label: "変更せず そのまま", w: 3,
              hint: "予定の番線のまま。空くまで待つ。",
              reply: "番線は変更しません。予定どおりでお願いします。",
              apply() {} },
            { key: "move", label: "空き番線へ変更", w: 4,
              hint: "空いている番線へ着発番線変更を手配する。",
              reply: "着発番線を変更します。進路を構成しますのでお待ちください。",
              apply(game, c) {
                  const p = c.cand[0];
                  game.applyCommand({ name: "trackChange", trainId: c.train.id,
                                      station: c.at, trackId: p.trackId, lane: p.lane });
              } },
            { key: "move2", label: "別の空き番線へ", w: 2,
              hint: "もう一方の空き番線を使う。",
              reply: "別の番線を手配します。到着後の折り返しに備えてください。",
              apply(game, c) {
                  const p = c.cand[1] || c.cand[0];
                  game.applyCommand({ name: "trackChange", trainId: c.train.id,
                                      station: c.at, trackId: p.trackId, lane: p.lane });
              } }
        ]
    },

    // ---------------------------------------------------------- 折り返しの判断
    {
        id: "turnback", level: "important", cat: "jomuin", title: "折り返しの判断", limit: 120,
        from: (c) => commCrew(c.train),
        find(game) {
            const c = game.trains.filter(t =>
                t.state !== "finished" && t.state !== "in_depot" &&
                (t.delayTime || 0) >= 600 &&
                ["普通", "快速", "新快速"].indexOf(t.type) >= 0 &&
                t.nextAction === "turnback");
            if (!c.length) return null;
            const t = commOne(c);
            const cut = commAheadStation(game, t, SWITCHABLE_STATIONS);
            if (!cut || cut === t.dest) return null;
            return { train: t, cut: cut };
        },
        text(game, c) {
            const min = Math.floor((c.train.delayTime || 0) / 60);
            return commOne([
                c.train.trainNo + " は現在 " + min + "分の遅れです。" + c.train.dest +
                    "まで行くと折り返しが間に合いません。" + c.cut + "で運転を打ち切りますか。",
                c.train.trainNo + "、遅れ " + min + "分。乗務員の交代時刻が迫っています。" +
                    c.cut + "での折り返しをお願いできますか。",
                c.train.trainNo + " の遅れが " + min + "分に拡大しました。行先の変更について指示をお願いします。"
            ]);
        },
        options: [
            { key: "keep", label: "そのまま終点まで", w: 3,
              hint: "行先を変えない。遅れは後続で調整する。",
              reply: "行先は変更しません。そのまま運転してください。",
              apply() {} },
            { key: "cut", label: "手前で折り返し", w: 4,
              hint: "手前の駅で運転を打ち切り、折り返して遅れを断つ。",
              reply: "行先を変更します。当該駅で折り返してください。",
              apply(game, c) {
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: c.cut, action: "turnback" });
              } },
            { key: "depot", label: "打ち切って入区", w: 2,
              hint: "運用を切り、車両所へ戻す。車両の手配は別に行う。",
              reply: "当該列車は打ち切りとします。入区の手配をします。",
              apply(game, c) {
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: c.cut, action: "depot" });
              } }
        ]
    },

    // ---------------------------------------------------------- ホームの混雑
    {
        id: "crowd", level: "minor", cat: "eki", title: "ホーム混雑の報告", limit: 90,
        from: (c) => c.at + "駅 駅長",
        find(game) {
            const big = ["大阪", "京都", "三ノ宮", "尼崎", "高槻", "新大阪", "西明石", "草津"];
            const busy = [];
            big.forEach(st => {
                let n = 0;
                ["Up_In", "Up_Out", "Down_In", "Down_Out"].forEach(tid => {
                    const blks = game.trackMgr.blocks[tid];
                    if (!blks) return;
                    const b = blks.find(x => blockStationName(x) === st && x.x !== -1000);
                    if (b) n += b.lanes.filter(l => l).length;
                });
                if (n >= 3) busy.push({ st: st, n: n });
            });
            if (!busy.length) return null;
            const x = commOne(busy);
            return { at: x.st, n: x.n, train: null };
        },
        text(game, c) {
            return commOne([
                c.at + "駅です。列車の遅れによりホーム上が大変混雑しています。入場規制を検討したいのですが、運転の見込みをお願いします。",
                c.at + "駅、在線 " + c.n + "本で番線が埋まっています。到着列車の抑止をお願いできますか。",
                c.at + "駅からです。客扱いに時間がかかっており、発車が遅れています。停車時分の延長をお願いします。"
            ]);
        },
        options: [
            { key: "hold", label: "手前で抑止して間隔を空ける", w: 4,
              hint: "接近中の列車を1本、当該駅の手前で抑止する。",
              reply: "後続を手前の駅で抑止します。客扱いを優先してください。",
              apply(game, c) {
                  const idx = STATION_MAP[c.at];
                  if (idx === undefined) return;
                  const near = game.trains.find(t => {
                      if (t.state === "finished" || t.state === "in_depot") return false;
                      if (t.dest === c.at) return false;
                      const i = commStationIdx(game, t);
                      return i !== undefined && Math.abs(i - idx) <= 3;
                  });
                  if (near) commHold(game, near, c.at, 120);
              } },
            { key: "dwell", label: "停車時分を延ばす", w: 3,
              hint: "当該駅の前後を徐行にして、到着間隔をならす。",
              reply: "停車時分の延長を認めます。安全確認のうえ発車してください。",
              apply(game, c) {
                  const idx = STATION_MAP[c.at];
                  if (idx === undefined) return;
                  ["Up_In", "Down_In"].forEach(tid => {
                      const blks = game.trackMgr.blocks[tid];
                      if (!blks) return;
                      const b = blks.find(x => x.stationIdx === idx && x.x !== -1000);
                      if (!b) return;
                      game.trackMgr.addSpeedRestriction(tid, b.index - 2, b.index + 2, 1.2,
                          "指令 混雑調整", game.currentTime + 300);
                  });
              } },
            { key: "none", label: "現行どおり運転", w: 2,
              hint: "運転は変えない。駅で案内を行う。",
              reply: "運転は現行どおりです。ホーム上の案内をお願いします。",
              apply() {} }
        ]
    },

    // ---------------------------------------------------------- 乗務員の交代
    {
        id: "crew", level: "minor", cat: "jomuin", title: "乗務員交代の照会", limit: 110,
        from: (c) => c.train.trainNo + " 車掌",
        find(game) {
            const c = game.trains.filter(t =>
                t.state !== "finished" && t.state !== "in_depot" &&
                (t.delayTime || 0) >= 420 && (t.delayTime || 0) < 1500);
            if (!c.length) return null;
            const t = commOne(c);
            const at = commAheadStation(game, t,
                ["大阪", "京都", "尼崎", "高槻", "西明石", "姫路", "草津", "米原", "三ノ宮"]);
            if (!at) return null;
            return { train: t, at: at };
        },
        text(game, c) {
            const min = Math.floor((c.train.delayTime || 0) / 60);
            return commOne([
                c.train.trainNo + " の乗務員です。遅れ " + min + "分で、" + c.at +
                    "での交代時刻に間に合いません。交代の手配をお願いします。",
                c.at + "での乗務員交代について照会します。" + c.train.trainNo + " は " + min + "分遅れです。",
                c.train.trainNo + "、" + c.at + "で交代予定ですが次仕業の列車が出ています。指示をお願いします。"
            ]);
        },
        options: [
            { key: "keep", label: "そのまま継続乗務", w: 4,
              hint: "交代せずに乗り継ぐ。運転への影響なし。",
              reply: "交代は見送ります。そのまま継続乗務でお願いします。",
              apply() {} },
            { key: "swap", label: "交代駅で時間を確保", w: 3,
              hint: "交代駅で数分だけ止め、確実に交代させる (自動で解除)。",
              reply: "交代駅で時間を確保します。到着後、後続の運転士と交代してください。",
              apply(game, c) { commHold(game, c.train, c.at, 180); } },
            { key: "cut", label: "当該駅で運転打ち切り", w: 1,
              hint: "交代がつかないため運用を切る。車両は入区。",
              reply: "交代がつきません。当該列車は打ち切りとします。",
              apply(game, c) {
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: c.at, action: "depot" });
              } }
        ]
    },

    // ---------------------------------------------------------- 信号設備の確認
    {
        id: "signal", level: "minor", cat: "shingo", title: "信号設備の確認", limit: 100,
        from: () => "信号通信区",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && (t.stuckTime || 0) >= 150);
            if (!c.length) return null;
            const t = commOne(c);
            return { train: t, where: commWhere(game, t) };
        },
        text(game, c) {
            return commOne([
                "信号通信区です。" + c.where + "付近の信号設備に動作不良の疑いがあります。現地確認に入ってよろしいでしょうか。",
                c.where + "の閉塞信号について、現示が変わらないとの申告があります。取り扱いの指示をお願いします。",
                c.where + "付近、軌道回路の短絡が疑われます。列車の進入をどうしますか。"
            ]);
        },
        options: [
            { key: "check", label: "現地確認 (当該区間を徐行)", w: 4,
              hint: "確認のあいだ当該区間を徐行にする。運転は続ける。",
              reply: "現地確認をお願いします。当該区間は徐行で列車を通します。",
              apply(game, c) {
                  const t = c.train;
                  game.trackMgr.addSpeedRestriction(t.trackId,
                      t.currBlockIndex - 2, t.currBlockIndex + UNITS_PER_STATION, 1.3,
                      "指令 信号設備確認", game.currentTime + 420);
              } },
            { key: "call", label: "指令の承認で進行", w: 3,
              hint: "信号によらず指令の指示で1本通す。",
              reply: "指令の承認で進行してください。次の信号機まで注意運転です。",
              apply(game, c) { game.applyCommand({ name: "force", trainId: c.train.id }); } },
            { key: "later", label: "列車の合間に確認", w: 2,
              hint: "いまは運転を優先し、確認は後回しにする。",
              reply: "いまは運転を優先します。列車の合間に確認をお願いします。",
              apply() {} }
        ]
    },

    // ---------------------------------------------------------- 出区の可否
    {
        id: "depot_out", level: "minor", cat: "depot", title: "出区の可否", limit: 110,
        from: (c) => c.depot + " 出区担当",
        find(game) {
            const names = Object.keys(DEPOTS).filter(n =>
                DEPOTS[n].trains.some(t => t.depotOutConfig && t.timer > 0));
            if (!names.length) return null;
            const n = commOne(names);
            const t = DEPOTS[n].trains.find(x => x.depotOutConfig && x.timer > 0);
            if (!t) return null;
            return { depot: n, train: t };
        },
        text(game, c) {
            return commOne([
                c.depot + "です。" + c.train.trainNo + " の出区準備が整いました。本線の状況を見て出区してよろしいでしょうか。",
                c.depot + "からの出区について照会します。" + c.train.trainNo + "(" + c.train.type + ") " +
                    c.train.dest + "行き です。",
                c.depot + "、" + c.train.trainNo + " の出区時刻が近づいています。本線に入れてよろしいですか。"
            ]);
        },
        options: [
            { key: "go", label: "予定どおり出区", w: 4,
              hint: "計画どおり。本線が塞がっていれば自動で待つ。",
              reply: "予定どおり出区してください。本線の進路は手配します。",
              apply() {} },
            { key: "now", label: "ただちに出区", w: 2,
              hint: "待ち時間を切り上げて、すぐ本線へ出す。",
              reply: "出区時刻を繰り上げます。ただちに出区してください。",
              apply(game, c) { game.applyCommand({ name: "force", trainId: c.train.id }); } },
            { key: "hold", label: "出区を見合わせ", w: 3,
              hint: "本線が混んでいるので、しばらく留置場で待たせる。",
              reply: "本線混雑のため出区を見合わせます。しばらく留置でお願いします。",
              apply(game, c) { c.train.timer = Math.max(c.train.timer || 0, 300); } }
        ]
    },

    // ---------------------------------------------------------- 車内取り扱い
    {
        id: "onboard", level: "important", cat: "jomuin", title: "車内取り扱いの報告", limit: 90,
        from: (c) => c.train.trainNo + " 車掌",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && t.minorTrouble);
            if (!c.length) return null;
            const t = commOne(c);
            return { train: t, where: commWhere(game, t),
                     cause: (t.troubleInfo && t.troubleInfo.cause) || "車内取り扱い" };
        },
        text(game, c) {
            return commOne([
                c.where + "、" + c.train.trainNo + " です。" + c.cause + " により停車しています。処置の指示をお願いします。",
                c.train.trainNo + " の車掌です。" + c.cause + " の対応中です。運転再開の判断をお願いします。",
                c.where + "にて " + c.cause + "。当該列車の取り扱いについて指示をお願いします。"
            ]);
        },
        options: [
            { key: "resume", label: "処置完了しだい運転再開", w: 4,
              hint: "現場の判断で再開する。いまの自動処理どおり。",
              reply: "処置が済みしだい運転を再開してください。",
              apply() {} },
            { key: "next", label: "次駅で駅係員に引き継ぐ", w: 3,
              hint: "次の主要駅まで運転し、そこで対応する。",
              reply: "次の停車駅で駅係員に引き継いでください。運転は継続です。",
              apply(game, c) {
                  const at = commAheadStation(game, c.train, SWITCHABLE_STATIONS);
                  if (at) c.train.plannedStop = at;
                  c.train.minorTrouble = false;
                  c.train.troubleInfo = { active: false, cause: "", status: "" };
                  if (c.train.state === "holding") { c.train.state = "running"; c.train.timer = 15; }
              } },
            { key: "cut", label: "当該列車を運休", w: 1,
              hint: "旅客を降ろし、車両所へ戻す。",
              reply: "当該列車は打ち切りとします。旅客の案内をお願いします。",
              apply(game, c) {
                  const at = commAheadStation(game, c.train, SWITCHABLE_STATIONS);
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: at || c.train.dest, action: "depot" });
              } }
        ]
    },

    // ---------------------------------------------------------- 保線の線路点検
    {
        id: "track_check", level: "minor", cat: "hosen", title: "線路点検の申し入れ", limit: 120,
        from: () => "管轄保線区",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" && t.state !== "in_depot");
            if (c.length < 5) return null;
            const t = commOne(c);
            const st = commAheadStation(game, t, null);
            if (!st) return null;
            return { train: t, at: st, trackId: t.trackId,
                     idx: t.currBlockIndex + t.dir * UNITS_PER_STATION };
        },
        text(game, c) {
            return commOne([
                "保線区です。" + c.at + "付近で軌道の異常を検知しました。列車の間合いで点検に入りたいのですが、よろしいでしょうか。",
                c.at + "付近、レール温度が上昇しています。徐行の手配をお願いできますか。",
                c.at + "付近で異音の申告がありました。点検の可否について指示をお願いします。"
            ]);
        },
        options: [
            { key: "slow", label: "徐行を設定して点検", w: 4,
              hint: "当該区間に徐行を設定する。運転は止めない。",
              reply: "当該区間に徐行を設定します。点検をお願いします。",
              apply(game, c) {
                  game.trackMgr.addSpeedRestriction(c.trackId, c.idx - 2, c.idx + 2, 1.25,
                      "保線 線路点検", game.currentTime + 600);
              } },
            { key: "later", label: "列車の合間に点検", w: 3,
              hint: "いまは運転を優先し、点検は後にする。",
              reply: "いまは運転を優先します。間合いを見てご連絡します。",
              apply() {} },
            { key: "night", label: "夜間の作業に回す", w: 2,
              hint: "当面は監視のみ。ダイヤへの影響なし。",
              reply: "夜間の作業に回します。当面は監視でお願いします。",
              apply() {} }
        ]
    },

    /* ================================================================ 緊急・重要

       ここから下は、実際に指令が判断しなければ動かない場面。
       連絡が入った時点で当該列車はその場に抑止され、
       指令が答えるまで動かない (commIncidentHold)。 */

    // ---------------------------------------------------------- 到着番線がふさがっている
    {
        id: "route_blocked", level: "critical", cat: "jomuin",
        title: "到着番線支障",
        from: (c) => commCrew(c.train),
        find(game) {
            /* 終着駅に近づいているのに、その駅の同じ向きの番線が
               すべてふさがっている列車を探す。 */
            const cand = [];
            game.trains.forEach(t => {
                if (t.state === "finished" || t.state === "in_depot") return;
                if (["普通", "快速", "新快速", "特急"].indexOf(t.type) < 0) return;
                // 行先までの駅数は、列車の走っている線路の上で数える (線区をまたがない)
                const away = commStationsAway(game, t);
                if (away === null || away < 1 || away > 3) return;          // 1〜3駅手前
                let free = 0; const busy = [];
                STATION_TRACK_ORDER.forEach(tid => {
                    if ((tid.indexOf("Up") === 0) !== (t.dir === 1)) return;
                    const blks = game.trackMgr.blocks[tid];
                    const b = blks && blks.find(x => x.stationIdx === idx && x.x !== -1000);
                    if (!b) return;
                    b.lanes.forEach(l => { if (l) busy.push(l); else free++; });
                });
                if (free === 0 && busy.length) cand.push({ train: t, at: t.dest, busy: busy });
            });
            if (!cand.length) return null;
            const c = commOne(cand);
            return { train: c.train, at: c.at, busy: c.busy,
                     hold: commOne(c.busy),
                     alt: commAheadStation(game, c.train, SWITCHABLE_STATIONS) };
        },
        text(game, c) {
            return commOne([
                c.at + "の場内が開通しません。番線が全部ふさがっているようです。" +
                    "このままでは場内手前で停まります。指示をお願いします。（" + c.train.trainNo + "）",
                c.train.trainNo + " です。" + c.at + "まであと数分ですが、" +
                    "到着番線が支障しています。どうしますか。",
                c.at + "到着の " + c.train.trainNo + " です。着発線に空きがありません。" +
                    "手前で待つか、番線を変えるか指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）" + c.at + "は " + c.busy.length + "本が在線したままです。" +
                   (c.hold ? c.hold.trainNo + " がまだ発車していません。" : "");
        },
        escalate(game, c) {
            return "【催促】" + c.train.trainNo + " は間もなく場内に接近します。至急指示をお願いします。";
        },
        options: [
            { key: "push", label: "先に居る列車を発車させて空ける", w: 4,
              hint: "ふさいでいる列車に指令扱いの発車を指示し、番線を空ける。",
              reply: "先に在線している列車を発車させます。進路が開きしだい進入してください。",
              apply(game, c) {
                  if (c.hold && game.getTrain(c.hold.id)) {
                      game.applyCommand({ name: "force", trainId: c.hold.id });
                  }
              } },
            { key: "wait", label: "手前の駅で待たせる", w: 3,
              hint: "当該を手前の駅で抑止し、番線が空くのを待つ。後続にも遅れが出る。",
              reply: "手前の駅で待機してください。番線が空きしだい連絡します。",
              apply(game, c) { commHold(game, c.train, c.alt || c.at, 240); } },
            { key: "cut", label: "手前で運転を打ち切る", w: 2,
              hint: "当該を手前の駅止まりにして折り返す。遅れの波及を断つ。",
              reply: "行先を変更します。手前の駅で折り返してください。",
              apply(game, c) {
                  if (c.alt) game.applyCommand({ name: "change", trainId: c.train.id,
                                                 dest: c.alt, action: "turnback" });
              } }
        ]
    },

    // ---------------------------------------------------------- 自力運転不能
    {
        id: "train_disabled", level: "critical", cat: "sharyo",
        title: "車両故障 自力運転不能",
        from: (c) => commCrew(c.train),
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && t.minorTrouble &&
                ((t.stuckTime || 0) >= 30 || t.state === "holding" || t.state === "stopped"));
            if (!c.length) return null;
            const t = commOne(c);
            return { train: t, where: commWhere(game, t),
                     next: commAheadStation(game, t, SWITCHABLE_STATIONS),
                     behind: commTrainsBehind(game, t, 4) };
        },
        text(game, c) {
            return commOne([
                c.where + "、" + c.train.trainNo + " です。主回路の故障で力行できません。" +
                    "自力運転は難しい状況です。指示をお願いします。",
                c.train.trainNo + " 運転士です。" + c.where + "で停車中、" +
                    "ブレーキの緩解不良があり運転できません。",
                c.where + "にて " + c.train.trainNo + "、車両故障で立ち往生しています。" +
                    "後続が詰まります。至急指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）応急処置を試みましたが復帰しません。後続は " +
                   c.behind.length + "本 が接近しています。";
        },
        escalate() { return "【催促】後続が停止信号で詰まっています。処置の指示をお願いします。"; },
        options: [
            { key: "retry", label: "応急処置のうえ次駅まで運転", w: 3,
              hint: "低速で次の駅まで動かし、そこで打ち切る。遅れは大きいが線路は空く。",
              reply: "応急処置のうえ、次駅まで注意運転で進行してください。次駅で打ち切ります。",
              apply(game, c) {
                  const t = c.train;
                  t.minorTrouble = false;
                  t.troubleInfo = { active: false, cause: "", status: "" };
                  if (t.state === "holding") { t.state = "running"; t.timer = 15; }
                  game.trackMgr.addSpeedRestriction(t.trackId, t.currBlockIndex - 1,
                      t.currBlockIndex + UNITS_PER_STATION, 1.5,
                      "故障車 注意運転", game.currentTime + 480);
                  if (c.next) game.applyCommand({ name: "change", trainId: t.id,
                                                  dest: c.next, action: "depot" });
              } },
            { key: "hold_behind", label: "後続を抑止して復旧を待つ", w: 2,
              hint: "後続を手前で抑止し、現場の復旧を待つ。線路は当分ふさがる。",
              reply: "後続を抑止します。復旧まで現場で処置を続けてください。",
              apply(game, c) {
                  c.behind.slice(0, 2).forEach(b => {
                      const at = commStationName(game, b);
                      if (at) commHold(game, b, at, 300);
                  });
              } },
            { key: "rescue", label: "救援を手配し当該を運休", w: 3,
              hint: "当該を運休にして車両所へ戻す。旅客には振替を案内する。",
              reply: "当該列車は運休とします。救援を手配しますので、旅客の案内をお願いします。",
              apply(game, c) {
                  const t = c.train;
                  t.minorTrouble = false;
                  t.troubleInfo = { active: false, cause: "", status: "" };
                  if (t.state === "holding") { t.state = "running"; t.timer = 15; }
                  game.applyCommand({ name: "change", trainId: t.id,
                                      dest: c.next || t.dest, action: "depot" });
              } }
        ]
    },

    // ---------------------------------------------------------- 線路支障
    {
        id: "obstruction", level: "critical", cat: "hosen",
        title: "線路支障の申告",
        from: () => "管轄保線区",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" && t.state !== "in_depot" &&
                ["普通", "快速", "新快速", "特急"].indexOf(t.type) >= 0);
            if (c.length < 8) return null;
            const t = commOne(c);
            const at = commAheadStation(game, t, null);
            if (!at) return null;
            return { train: t, at: at, trackId: t.trackId,
                     idx: t.currBlockIndex + t.dir * UNITS_PER_STATION,
                     kind: commOne(["沿線からの飛来物", "踏切支障", "落石のおそれ", "倒木"]) };
        },
        text(game, c) {
            return commOne([
                c.at + "付近で " + c.kind + " の申告がありました。" +
                    "列車の進入をどうするか、指示をお願いします。",
                "保線区です。" + c.at + "手前で " + c.kind + "。" +
                    "安全確認が済むまで通せません。指示をお願いします。",
                c.at + "付近、" + c.kind + " により支障のおそれがあります。至急の判断をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）係員が現場に向かっています。到着まであと数分かかります。";
        },
        escalate(game, c) { return "【催促】" + c.train.trainNo + " が現場に接近しています。"; },
        options: [
            { key: "stop", label: "区間を止めて安全確認", w: 3,
              hint: "当該区間の運転を見合わせる。安全だが遅れは大きい。",
              reply: "当該区間の運転を見合わせます。安全確認をお願いします。",
              apply(game, c) {
                  const lo = Math.max(1, c.idx - 1);
                  game.trackMgr.manualSuspensions.push({
                      trackId: c.trackId, start: lo, end: lo + 1, owner: "comm" });
                  /* 見合わせは置きっぱなしにしない。5分後に自動で解く。
                     (指令連絡が線路を止めたまま忘れると、線区が動かなくなる) */
                  game.comms.after(300, (g) => {
                      g.trackMgr.manualSuspensions = g.trackMgr.manualSuspensions
                          .filter(m => m.owner !== "comm");
                      g.ui.updateBanner("【運転再開】安全確認が終わり、当該区間の運転を再開します。",
                                        "banner-orange");
                  });
              } },
            { key: "slow", label: "徐行で通しながら確認", w: 4,
              hint: "当該区間を大きく徐行させ、運転を止めずに確認する。",
              reply: "当該区間は徐行で通します。運転士は前方に注意してください。",
              apply(game, c) {
                  game.trackMgr.addSpeedRestriction(c.trackId, c.idx - 2, c.idx + 2, 1.6,
                      "線路支障 徐行", game.currentTime + 600);
              } },
            { key: "onetrain", label: "当該列車で現認させる", w: 2,
              hint: "当該1本だけ最徐行で通し、運転士に現認させる。以降は通常。",
              reply: "当該列車に現認をお願いします。異常があれば直ちに報告してください。",
              apply(game, c) {
                  game.trackMgr.addSpeedRestriction(c.trackId, c.idx - 1, c.idx + 1, 2.0,
                      "現認のため最徐行", game.currentTime + 240);
              } }
        ]
    },

    // ---------------------------------------------------------- 信号故障
    {
        id: "signal_failure", level: "critical", cat: "shingo",
        title: "信号故障 場内不開通",
        from: () => "信号通信区",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && (t.stuckTime || 0) >= 180);
            if (!c.length) return null;
            const t = commOne(c);
            return { train: t, where: commWhere(game, t),
                     behind: commTrainsBehind(game, t, 4) };
        },
        text(game, c) {
            return commOne([
                c.where + "の場内信号機が停止現示のまま変わりません。" +
                    "連動装置の故障の疑いがあります。取り扱いの指示をお願いします。",
                "信号通信区です。" + c.where + "付近で信号設備の故障を検知しました。" +
                    "進路が構成できません。",
                c.where + "、軌道回路の不良で進路が開通しません。" + c.train.trainNo +
                    " が停車中です。指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）係員が向かっていますが、復旧の見込みはまだ立ちません。後続 " +
                   c.behind.length + "本 が接近中です。";
        },
        escalate() { return "【催促】後続が次々に停止信号で止まり始めています。"; },
        options: [
            { key: "call", label: "指令の承認で1本ずつ通す", w: 4,
              hint: "信号によらず指令の指示で進行させる。運転は続くが速度は落ちる。",
              reply: "指令の承認で進行してください。次の信号機まで注意運転、速度を落として。",
              apply(game, c) {
                  game.applyCommand({ name: "force", trainId: c.train.id });
                  game.trackMgr.addSpeedRestriction(c.train.trackId,
                      c.train.currBlockIndex, c.train.currBlockIndex + UNITS_PER_STATION, 1.8,
                      "指令の承認により進行", game.currentTime + 600);
              } },
            { key: "reroute", label: "隣の線路へ転線させる", w: 3,
              hint: "使える番線へ回して、故障箇所を避ける。",
              reply: "隣の線路へ転線します。進路を構成しますのでお待ちください。",
              apply(game, c) {
                  const t = c.train;
                  const alt = (t.trackId.indexOf("In") >= 0)
                      ? t.trackId.replace("In", "Out") : t.trackId.replace("Out", "In");
                  if (game.trackMgr.blocks[alt] && t.attemptTrackSwitch) t.attemptTrackSwitch(alt);
                  game.applyCommand({ name: "force", trainId: t.id });
              } },
            { key: "hold", label: "復旧まで抑止", w: 2,
              hint: "安全を優先して復旧まで止める。後続の遅れは大きくなる。",
              reply: "復旧まで抑止します。旅客への案内をお願いします。",
              apply(game, c) {
                  const at = commStationName(game, c.train) ||
                             commAheadStation(game, c.train, SWITCHABLE_STATIONS);
                  if (at) commHold(game, c.train, at, 300);
              } }
        ]
    },

    // ---------------------------------------------------------- 番線の取り合い
    {
        id: "platform_contention", level: "critical", cat: "eki",
        title: "番線の割り当て",
        from: (c) => c.at + "駅 駅長",
        find(game) {
            /* 同じ駅へ、同じ向きで、遅れた列車が3本以上向かっている所を探す。 */
            const byStation = {};
            game.trains.forEach(t => {
                if (t.state === "finished" || t.state === "in_depot") return;
                if ((t.delayTime || 0) < 240) return;
                const away = commStationsAway(game, t);
                if (away === null || away < 1 || away > 5) return;
                (byStation[t.dest] = byStation[t.dest] || []).push(t);
            });
            const hot = Object.keys(byStation).filter(k => byStation[k].length >= 3);
            if (!hot.length) return null;
            const at = commOne(hot);
            const list = byStation[at].slice()
                .sort((a, b) => (b.delayTime || 0) - (a.delayTime || 0));
            return { at: at, list: list, train: list[0], second: list[1] };
        },
        text(game, c) {
            const mins = c.list.map(t => t.trainNo + "(" + Math.floor(t.delayTime / 60) + "分延)");
            return commOne([
                c.at + "駅です。遅れた列車が " + c.list.length +
                    "本まとまって到着します。" + mins.slice(0, 3).join("・") +
                    "。番線の割り当てについて指示をお願いします。",
                c.at + "駅、着発線がさばききれません。" + mins.slice(0, 3).join("・") +
                    " のうち、どれを先に入れますか。",
                c.at + "駅からです。" + c.list.length + "本が続けて到着見込みです。" +
                    "優先の指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）" + c.train.trainNo + " が先頭で接近しています。" +
                   "このままだと場内手前で停まります。";
        },
        escalate(game, c) { return "【催促】" + c.at + "の番線が埋まりつつあります。"; },
        options: [
            { key: "delayed_first", label: "いちばん遅れている列車を先に", w: 3,
              hint: "遅れの大きい列車を先に入れて回復させる。ほかは少し待たせる。",
              reply: "遅れの大きい列車から先に入れます。ほかは手前で待機してください。",
              apply(game, c) {
                  c.list.slice(1, 3).forEach(t => {
                      const at = commAheadStation(game, t, SWITCHABLE_STATIONS);
                      if (at && at !== c.at) commHold(game, t, at, 180);
                  });
              } },
            { key: "express_first", label: "優等列車を先に通す", w: 3,
              hint: "特急・新快速を優先し、普通を待たせる。優等の遅れを抑える。",
              reply: "優等列車を先に通します。普通列車は手前で待避してください。",
              apply(game, c) {
                  c.list.filter(t => PRIORITY[t.type] < PRIORITY["新快速"]).slice(0, 2)
                      .forEach(t => {
                          const at = commAheadStation(game, t, OVERTAKE_STATIONS);
                          if (at && at !== c.at) commHold(game, t, at, 180);
                      });
              } },
            { key: "shorten", label: "1本を手前で打ち切る", w: 2,
              hint: "いちばん遅れた1本を手前で折り返し、番線を1つ空ける。",
              reply: "1本を手前で打ち切ります。旅客の案内をお願いします。",
              apply(game, c) {
                  const t = c.train;
                  const alt = commAheadStation(game, t, SWITCHABLE_STATIONS);
                  if (alt && alt !== c.at) {
                      game.applyCommand({ name: "change", trainId: t.id,
                                          dest: alt, action: "turnback" });
                  }
              } }
        ]
    },

    // ---------------------------------------------------------- 急病人
    {
        id: "passenger_emergency", level: "important", cat: "jomuin",
        title: "車内急病人",
        from: (c) => c.train.trainNo + " 車掌",
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && t.state !== "waiting_start");
            if (c.length < 5) return null;
            const t = commOne(c);
            const at = commAheadStation(game, t,
                ["大阪", "京都", "三ノ宮", "尼崎", "高槻", "新大阪", "西明石", "姫路", "草津", "米原"]);
            if (!at) return null;
            return { train: t, at: at, where: commWhere(game, t),
                     behind: commTrainsBehind(game, t, 3) };
        },
        text(game, c) {
            return commOne([
                c.train.trainNo + " 車掌です。車内で急病のお客様が発生しました。" +
                    "意識はありますが、動けない状態です。指示をお願いします。",
                c.where + "、" + c.train.trainNo + " です。車内で急病人の申告。" +
                    "救急の手配が要るかもしれません。",
                c.train.trainNo + " です。お客様が体調不良を訴えています。" +
                    "次駅での対応について指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）お客様の状態は落ち着いていますが、" + c.at + "での降車を希望されています。";
        },
        escalate() { return "【催促】判断をお願いします。現場で待機しています。"; },
        options: [
            { key: "next", label: "次の主要駅で降車・駅係員へ", w: 4,
              hint: "次の主要駅まで運転し、駅係員に引き継ぐ。遅れは小さい。",
              reply: "次の主要駅で降車していただき、駅係員に引き継いでください。",
              apply(game, c) {
                  c.train.plannedStop = null;
                  if (c.train.state === "holding") { c.train.state = "running"; c.train.timer = 15; }
              } },
            { key: "here", label: "その場で救急要請", w: 2,
              hint: "現在地で救急を要請する。線路をふさぐので後続に影響が出る。",
              reply: "現在地で救急隊を要請します。到着まで現場で待機してください。",
              apply(game, c) {
                  const at = commStationName(game, c.train) || c.at;
                  commHold(game, c.train, at, 240);
              } },
            { key: "express", label: "先行を抑えて次駅まで急ぐ", w: 2,
              hint: "当該を優先で走らせる。ほかの列車に遅れが出る。",
              reply: "当該列車を優先します。先行を抑えますので、次駅まで急いでください。",
              apply(game, c) {
                  game.applyCommand({ name: "force", trainId: c.train.id });
                  c.behind.slice(0, 1).forEach(b => {
                      const at = commStationName(game, b);
                      if (at) commHold(game, b, at, 120);
                  });
              } }
        ]
    },

    // ---------------------------------------------------------- どちらを先に通すか
    {
        id: "priority_call", level: "important", cat: "jomuin",
        title: "続行順序の判断",
        from: (c) => commCrew(c.slow),
        find(game) {
            /* 遅れた優等と、その前を走る普通。どちらを先に通すか。 */
            const cand = [];
            game.trains.forEach(t => {
                if (t.state === "finished" || t.state === "in_depot") return;
                if (PRIORITY[t.type] < PRIORITY["新快速"]) return;
                if ((t.delayTime || 0) < 300) return;
                const blks = game.trackMgr.blocks[t.trackId];
                if (!blks) return;
                for (let k = 1; k <= UNITS_PER_STATION * 4; k++) {
                    const i = t.currBlockIndex + t.dir * k;
                    if (i < 0 || i >= blks.length) break;
                    const b = blks[i];
                    if (!b || b.x === -1000) continue;
                    const slow = b.lanes.find(l => l && l.dir === t.dir &&
                        PRIORITY[l.type] < PRIORITY[t.type]);
                    if (slow) { cand.push({ fast: t, slow: slow }); break; }
                }
            });
            if (!cand.length) return null;
            const x = commOne(cand);
            const at = commAheadStation(game, x.slow, OVERTAKE_STATIONS);
            if (!at) return null;
            return { train: x.slow, slow: x.slow, fast: x.fast, at: at };
        },
        text(game, c) {
            const d = Math.floor((c.fast.delayTime || 0) / 60);
            return commOne([
                c.slow.trainNo + " です。後続の " + c.fast.trainNo + "(" + c.fast.type +
                    ") が " + d + "分遅れで接近しています。" + c.at +
                    "で待避すると当方も遅れます。どちらを先に通しますか。",
                c.at + "の待避について。" + c.fast.trainNo + " は " + d +
                    "分遅れです。予定どおり待避しますか、先行しますか。（" + c.slow.trainNo + "）",
                c.slow.trainNo + " 運転士です。後続 " + c.fast.trainNo +
                    " の遅れが大きく、待避しても接続しません。指示をお願いします。"
            ]);
        },
        followUp(game, c) {
            return "（続報）" + c.fast.trainNo + " は " + c.at + "の手前まで来ています。";
        },
        escalate(game, c) { return "【催促】" + c.at + "が近づきます。至急の指示をお願いします。"; },
        options: [
            { key: "fast_first", label: "優等を先に通す (予定どおり待避)", w: 4,
              hint: "当方は待避。優等の遅れは回復するが、普通の遅れは増える。",
              reply: "予定どおり待避してください。後続の通過後に発車です。",
              apply(game, c) { commHold(game, c.slow, c.at, 180); } },
            { key: "slow_first", label: "普通を先行させる", w: 3,
              hint: "待避をやめて先行。普通は定時だが、優等の遅れがさらに増える。",
              reply: "待避は取りやめます。そのまま先行してください。",
              apply(game, c) {
                  c.slow.plannedStop = null;
                  game.applyCommand({ name: "force", trainId: c.slow.id });
              } },
            { key: "swap_here", label: "手前の駅で待避させる", w: 2,
              hint: "待避駅を手前に変え、優等を早めに前に出す。",
              reply: "待避駅を手前に変更します。そこで退避してください。",
              apply(game, c) {
                  const alt = commAheadStation(game, c.slow, OVERTAKE_STATIONS) || c.at;
                  commHold(game, c.slow, alt, 180);
              } }
        ]
    },

    // ---------------------------------------------------------- 遅れの波及
    {
        id: "cascade", level: "important", cat: "seiri",
        title: "遅れの波及",
        from: () => "運転整理担当",
        find(game) {
            const late = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && (t.delayTime || 0) >= 420);
            if (late.length < 4) return null;
            const head = late.slice().sort((a, b) => (b.delayTime || 0) - (a.delayTime || 0))[0];
            return { train: head, late: late, n: late.length,
                     cut: commAheadStation(game, head, SWITCHABLE_STATIONS) };
        },
        text(game, c) {
            return commOne([
                "運転整理です。5分以上の遅れが " + c.n + "本に広がっています。" +
                    "先頭は " + c.train.trainNo + " で " +
                    Math.floor(c.train.delayTime / 60) + "分延。整理の方針を決めてください。",
                "遅れが後続へ波及しています (" + c.n + "本)。" +
                    "このままだと夕方の運用に影響します。方針をお願いします。",
                c.n + "本が遅延しています。間引くか、そのまま流すか、指示をお願いします。"
            ]);
        },
        followUp(game, c) { return "（続報）遅れはまだ拡大しています。折り返しの時間が取れません。"; },
        escalate() { return "【催促】運用の組み替えが必要になります。方針の指示をお願いします。"; },
        options: [
            { key: "keep", label: "そのまま流す", w: 2,
              hint: "運休は出さない。遅れは残るが本数は保たれる。",
              reply: "運休は出しません。そのまま流してください。",
              apply() {} },
            { key: "thin", label: "先頭の1本を打ち切って間隔を戻す", w: 4,
              hint: "いちばん遅れた列車を手前で折り返し、以降の間隔を整える。",
              reply: "先頭の列車を手前で打ち切ります。以降の間隔を整えてください。",
              apply(game, c) {
                  if (c.cut) game.applyCommand({ name: "change", trainId: c.train.id,
                                                 dest: c.cut, action: "turnback" });
              } },
            { key: "depot", label: "遅れた運用を切って車両所へ", w: 2,
              hint: "遅れた運用を終わらせて入区させる。本数は減るが定時に戻りやすい。",
              reply: "当該の運用を切ります。車両は入区させてください。",
              apply(game, c) {
                  if (c.cut) game.applyCommand({ name: "change", trainId: c.train.id,
                                                 dest: c.cut, action: "depot" });
              } }
        ]
    },

    // ---------------------------------------------------------- 緊急の折り返し
    {
        id: "emergency_turnback", level: "important", cat: "jomuin",
        title: "折り返し時間不足",
        from: (c) => commCrew(c.train),
        find(game) {
            const c = game.trains.filter(t => t.state !== "finished" &&
                t.state !== "in_depot" && (t.delayTime || 0) >= 540 &&
                t.nextAction === "turnback" &&
                ["普通", "快速", "新快速"].indexOf(t.type) >= 0);
            if (!c.length) return null;
            const t = commOne(c);
            const cut = commAheadStation(game, t, SWITCHABLE_STATIONS);
            if (!cut || cut === t.dest) return null;
            return { train: t, cut: cut };
        },
        text(game, c) {
            const d = Math.floor(c.train.delayTime / 60);
            return commOne([
                c.train.trainNo + " です。遅れ " + d + "分。" + c.train.dest +
                    "に着いても折り返しの時間が取れません。次の運用に間に合いません。",
                c.train.trainNo + "、" + d + "分延。折り返し先の列車を落とすことになります。" +
                    "指示をお願いします。",
                "折り返しについて。" + c.train.trainNo + " は " + d +
                    "分遅れで、次の運用に入れません。どうしますか。"
            ]);
        },
        followUp(game, c) { return "（続報）折り返し後の列車の旅客が待っています。"; },
        escalate() { return "【催促】終着が近づきます。折り返しの可否を決めてください。"; },
        options: [
            { key: "short", label: "手前で折り返して定時に戻す", w: 4,
              hint: "手前の駅で折り返し、次の運用を定時で出す。",
              reply: "手前で折り返してください。次の運用を定時で出します。",
              apply(game, c) {
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: c.cut, action: "turnback" });
              } },
            { key: "swap", label: "車両を差し替える", w: 3,
              hint: "当該は入区させ、次の運用には別の車両を充てる。",
              reply: "当該は入区させます。次の運用は別の車両を手配します。",
              apply(game, c) {
                  game.applyCommand({ name: "change", trainId: c.train.id,
                                      dest: c.cut, action: "depot" });
              } },
            { key: "late", label: "遅れたまま折り返す", w: 2,
              hint: "次の運用も遅れて出る。遅れが一日残ることがある。",
              reply: "そのまま折り返してください。次の運用も遅れて出します。",
              apply() {} }
        ]
    },
];

// ------------------------------------------------------------------ 本体
class CommSystem {
    constructor(game) {
        this.game = game;
        this.pending = [];          // 応答待ち (important / critical だけ)
        this.seq = 1;
        this.nextAt = game.currentTime + 120;
        this.lastMajorAt = -9999;   // 最後に指令へ上げた時刻
        this.recent = {};           // 種類 -> 直近に出した時刻
        this.timed = [];            // あとで実行する処理 (after)
        this.stats = { asked: 0, minor: 0, answered: 0, auto: 0, held: 0 };
    }

    /** sec 秒後に fn を実行する (見合わせの自動解除などに使う) */
    after(sec, fn) { this.timed.push({ at: this.game.currentTime + sec, run: fn }); }

    /** その連絡で抑止する列車 (当該と、巻き込まれる列車) */
    trainsOf(p) {
        const c = p._ctx || {};
        const out = [];
        if (c.train) out.push(c.train);
        return out.filter(t => t && this.game.getTrain(t.id));
    }

    /**
     * 当該列車をその場に抑止する。
     *
     * ★指令が答えるまで動かさないための抑止。
     *   commHold() の「時間で自動的に解ける抑止」とは別物で、
     *   こちらは resolve() が呼ばれるまで解けない。
     *   答える前に列車が走り出してしまうと、指令の判断に意味がなくなる。
     */
    holdFor(p) {
        this.trainsOf(p).forEach(t => {
            t.commIncident = p.id;
            t.isManuallySuspended = true;
            t.manualSuspendTimer = 0;
            t.hasNotifiedSuspendLong = false;
            if (t.state === "running") { t.state = "stopped"; t.timer = 15; }
            this.stats.held++;
        });
    }

    /** その連絡のための抑止を解く (処置を当てる直前に呼ぶ) */
    releaseFor(p) {
        this.game.trains.forEach(t => {
            if (t.commIncident !== p.id) return;
            t.commIncident = null;
            // 段階的な運転再開の抑止 (js/26-incidents.js) が掛かっている列車は、そちらが解くまで止めておく
            if (t.recoveryHold) return;
            t.isManuallySuspended = false;
            t.manualSuspendTimer = 0;
            t.hasNotifiedSuspendLong = false;
            if (t.state === "holding") { t.state = "running"; t.timer = 15; }
        });
    }

    /** game.update() から毎Tick呼ばれる */
    update() {
        const now = this.game.currentTime;

        // --- あとで実行する処理 (見合わせの自動解除など)
        for (let i = this.timed.length - 1; i >= 0; i--) {
            if (now < this.timed[i].at) continue;
            const job = this.timed.splice(i, 1)[0];
            try { job.run(this.game); } catch (e) { console.error(e); }
        }

        // --- 続報・催促と、時間切れ
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const p = this.pending[i];
            const scene = COMM_SCENES.find(s => s.id === p.sceneId);
            const past = now - p.at;
            if (scene && scene.followUp && !p.saidFollow && past > p.limit * 0.45) {
                p.saidFollow = true;
                try { p.follow = scene.followUp(this.game, p._ctx); } catch (e) { p.follow = ""; }
                if (p.follow) this.game.ui.addStaffLogToHistory(p.follow, p.cat, p.from);
                if (p.follow && this.game.records) this.game.records.commFollow(p, "続報", p.follow);
            }
            if (scene && scene.escalate && !p.saidUrge && past > p.limit * 0.78) {
                p.saidUrge = true;
                try { p.urge = scene.escalate(this.game, p._ctx); } catch (e) { p.urge = ""; }
                if (p.urge) this.game.ui.addStaffLogToHistory(p.urge, p.cat, p.from);
                if (p.urge && this.game.records) this.game.records.commFollow(p, "催促", p.urge);
            }
            if (now < p.deadline) continue;
            this.pending.splice(i, 1);
            this.resolve(p, this.autoChoice(p), true);
        }

        /* --- 指令連絡で掛けた「時間で解ける抑止」(commHold) の後始末。
               抑止駅に着いてから holdSec 秒で解除する。
               抑止駅にたどり着かないまま時間が経った場合も取り消す。
               ここが無いと、画面に人がいないときに抑止が溜まり、
               主要駅のホームが埋まって線区が動かなくなる。 */
        this.game.trains.forEach(t => {
            if (t.commIncident) return;          // 応答待ちの抑止は触らない
            if (!t.commHoldLimit) return;
            /* 段階的な運転再開の抑止 (js/26-incidents.js) の列車は、指令連絡の抑止だけを取り消し、
               列車そのものの抑止は運転再開の側が解くまで残す */
            if (t.recoveryHold) { t.commHoldLimit = 0; t.commHoldTimer = 0; t.commHoldExpire = 0; t.plannedStop = null; return; }
            if (t.isManuallySuspended) {
                t.commHoldTimer = (t.commHoldTimer || 0) + CONFIG.TICK_SEC;
                if (t.commHoldTimer >= t.commHoldLimit) {
                    t.commHoldLimit = 0; t.commHoldTimer = 0; t.commHoldExpire = 0;
                    this.game.applyCommand({ name: "release", trainId: t.id });
                }
            } else if (t.commHoldExpire && now >= t.commHoldExpire) {
                t.commHoldLimit = 0; t.commHoldTimer = 0; t.commHoldExpire = 0;
                if (t.plannedStop) this.game.applyCommand({ name: "release", trainId: t.id });
            }
        });

        /* --- 取り残された抑止の掃除。
               連絡が消えたのに抑止だけ残っている列車を解く。
               (列車が入れ替わるなどして resolve を通らなかった場合の保険) */
        this.game.trains.forEach(t => {
            if (!t.commIncident) return;
            if (this.pending.some(p => p.id === t.commIncident)) return;
            t.commIncident = null;
            if (t.recoveryHold) return;          // 段階的な運転再開の抑止はそちらが解く
            this.game.applyCommand({ name: "release", trainId: t.id });
        });

        // --- 新しい連絡
        if (now < this.nextAt) return;
        this.nextAt = now + COMM_MIN_INTERVAL +
                      Math.random() * (COMM_MAX_INTERVAL - COMM_MIN_INTERVAL);
        const h = (now / 3600) % 24;
        if (h < 4.5 || h >= 23.0) return;            // 列車の少ない時間は鳴らさない
        this.raise();
    }

    /** いま指令に上げてよいか (件数と間隔で決める) */
    canRaiseMajor() {
        if (this.pending.length >= COMM_MAX_PENDING) return false;
        return (this.game.currentTime - this.lastMajorAt) >= COMM_MAJOR_GAP;
    }

    /** 場面を1つ選んで連絡を作る */
    raise() {
        const now = this.game.currentTime;
        const allowMajor = this.canRaiseMajor();
        /* 直近に出した種類は選ばれにくくする (同じ話が続かないように)。
           指令に上げる余裕が無いときは、細かい連絡だけを選ぶ。 */
        const pool = COMM_SCENES
            .filter(s => !this.pending.some(p => p.sceneId === s.id))
            .filter(s => allowMajor || (s.level || "minor") === "minor")
            .map(s => {
                const lv = s.level || "minor";
                /* 重い場面ほど選ばれやすくする。細かい連絡は画面に出ないので、
                   起きても指令の手は止まらない。 */
                let w = (lv === "critical") ? 5 : (lv === "important") ? 4 : 2;
                if (now - (this.recent[s.id] || -9999) < 900) w = Math.max(1, w - 2);
                return { s: s, w: w };
            });
        for (let tries = 0; tries < 6; tries++) {
            const picked = commPick(pool);
            if (!picked) return;
            const scene = picked.s;
            let ctx = null;
            try { ctx = scene.find(this.game); } catch (e) { ctx = null; }
            if (!ctx) { picked.w = 0; continue; }
            this.recent[scene.id] = now;
            this.emit(scene, ctx);
            return;
        }
    }

    /** 連絡を1件立てる。minor はその場でほかの指令員が処理する。 */
    emit(scene, ctx) {
        const now = this.game.currentTime;
        const lv = COMM_LEVELS[scene.level || "minor"] || COMM_LEVELS.minor;
        const limit = scene.limit || lv.limit;
        const p = {
            id: "C" + (this.seq++),
            sceneId: scene.id,
            level: scene.level || "minor",
            cat: scene.cat,
            title: scene.title,
            from: scene.from ? scene.from(ctx)
                : (ctx.train ? commCrew(ctx.train) : "現業"),
            text: scene.text(this.game, ctx),
            at: now, deadline: now + limit, limit: limit,
            trainId: ctx.train ? ctx.train.id : null,
            trainNo: ctx.train ? ctx.train.trainNo : "",
            options: scene.options.map(o => ({ key: o.key, label: o.label, hint: o.hint })),
            _ctx: ctx
        };

        /* 細かい連絡は指令に上げない。
           実際の指令所でも、日常的な照会は当務の指令員が裁いている。
           記録には残るので、あとから追える。 */
        // 指令連絡の記録 (js/32-records.js)
        if (this.game.records) this.game.records.commRaised(p, scene, lv);

        if (!lv.hold && p.level === "minor") {
            this.stats.minor++;
            this.game.ui.addStaffLogToHistory(
                "【" + scene.title + "】" + p.text, scene.cat, p.from);
            this.resolve(p, this.autoChoice(p), true, true);
            return;
        }

        this.pending.push(p);
        this.stats.asked++;
        this.lastMajorAt = now;
        // ★答えが返るまで当該列車を動かさない
        this.holdFor(p);
        this.game.ui.addStaffLogToHistory(
            "【" + lv.label + "】" + scene.title + " — " + p.text, scene.cat, p.from);
    }

    /** 時間切れのときに、別の指令員が選ぶ答え */
    autoChoice(p) {
        const scene = COMM_SCENES.find(s => s.id === p.sceneId);
        if (!scene) return null;
        const o = commPick(scene.options.map(x => ({ o: x, w: x.w === undefined ? 1 : x.w })));
        return o ? o.o.key : scene.options[0].key;
    }

    /** 指令 (画面の人) が答える */
    respond(id, key) {
        const i = this.pending.findIndex(p => p.id === id);
        if (i < 0) return { ok: false, msg: "その連絡はすでに処理されています。" };
        const p = this.pending[i];
        this.pending.splice(i, 1);
        this.resolve(p, key, false);
        this.stats.answered++;
        return { ok: true, msg: "指令を現場へ通達しました。" };
    }

    /** 選ばれた答えを実行して記録に残す */
    resolve(p, key, byOther, quiet) {
        const scene = COMM_SCENES.find(s => s.id === p.sceneId);
        if (!scene) return;
        const opt = scene.options.find(o => o.key === key) || scene.options[0];
        const ctx = p._ctx || {};

        /* ★処置を当てる前に、応答待ちの抑止を解く。
           解かないまま行先変更などを当てると、抑止されたまま動かなくなる。
           抑止を続けたい答えは、それぞれの apply が commHold で掛け直す。 */
        this.releaseFor(p);
        // 指令連絡の記録: 誰がどう答えたか
        if (this.game.records) this.game.records.commResolved(p, opt, byOther, quiet);

        if (ctx.train && !this.game.getTrain(ctx.train.id)) {
            if (!quiet) {
                this.game.ui.updateBanner(
                    "【指令】" + (p.trainNo ? p.trainNo + " — " : "") +
                    "当該列車はすでに運転を終えていました。処置は不要です。", "banner-blue");
            }
            return;
        }
        try { opt.apply(this.game, ctx); }
        catch (e) { console.error("指令連絡の処置に失敗しました", p.sceneId, e); }

        if (byOther) this.stats.auto++;
        if (quiet) {
            // 細かい連絡。業務連絡にだけ残し、運転指令の記録は汚さない。
            this.game.ui.addStaffLogToHistory(
                "【処理済】" + opt.reply + "（当務の指令員が処理）", p.cat, "指令");
            return;
        }
        const who = byOther ? "【指令(代行)】" : "【指令】";
        this.game.ui.updateBanner(
            who + (p.trainNo ? p.trainNo + " — " : "") + opt.reply +
            (byOther ? "（応答が無かったため、他の指令員が処理しました）" : ""),
            byOther ? "banner-blue" : "banner-orange");
    }

    /** 画面に出すための一覧 (本体・従の画面で同じ形) */
    list() {
        const now = this.game.currentTime;
        return this.pending.map(p => ({
            id: p.id, title: p.title, cat: p.cat, from: p.from, text: p.text,
            level: p.level,
            levelLabel: (COMM_LEVELS[p.level] || COMM_LEVELS.minor).label,
            follow: p.follow || "", urge: p.urge || "",
            trainNo: p.trainNo, trainId: p.trainId,
            held: this.trainsOf(p).length,
            remain: Math.max(0, Math.round(p.deadline - now)),
            limit: p.limit,
            options: p.options
        }));
    }
}

/* 指令連絡への応答も、ほかの指令と同じ道 (js/28-dispatch.js) を通す。
   こうすると、もう一方の画面 (従) からでも答えられる。 */
if (typeof DISPATCH !== "undefined") {
    DISPATCH.comm = function (game, cmd) {
        if (!game.comms) return { ok: false, msg: "指令連絡の仕組みがありません。" };
        return game.comms.respond(cmd.commId, cmd.option);
    };
}
