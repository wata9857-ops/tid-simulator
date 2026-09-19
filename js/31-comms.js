/* 指令と現場 (乗務員・駅・保線・信号通信区・車両所) とのやりとり。

   ■ 何をするものか
     これまでの運転整理は、条件がそろうと勝手に実行されるだけだった。
     実際の指令所では、まず現場から無線や電話で「こうしたいのですが」と
     連絡が入り、指令が判断して指示を返す。その形にする。

       1. 現場から連絡が届く           (CommSystem.update が作る)
       2. 指令 (画面の人) が答えを選ぶ (CommSystem.respond)
       3. 選んだ答えで運転が変わる      (options[].apply)
       4. 決められた時間内に答えがないときは、
          別の指令員が引き取って処理する (autoChoice → 同じ apply を通す)
       5. どの道を通っても運転は止まらない

   ■ 既存の自動処理は置き換えない
     抑止・続行間隔・運転整理・出入区といった自動の仕組みはそのまま動く。
     この仕組みはその上に乗っていて、選べる答えはどれも
     既存の指令 (js/28-dispatch.js) や列車の設定を呼ぶだけにしてある。
     答えが返らなくても既定の処置が走るので、自動運転の性質は変わらない。

   ■ 「同じ場面でいつも同じ結果」にしない
     ・連絡の文面は候補からその場で選ぶ
     ・時間切れのときに別の指令員が選ぶ答えも、重みつきの抽選にする
     こうすると、同じ種類の場面でも毎回まったく同じにはならない。

   ■ 画面
     Super-TID の「指令連絡」パネル (js/45-tid-comms.js) に出る。
     旅客向けの画面 (index.html) では答えずに時間切れとして処理される
     (= これまでどおりの自動運転)。記録はどちらの画面にも残る。
*/

/* 連絡が届く間隔 [秒] (シミュレーション時間)。
   実際の指令所でも無線は数分に1回は入る。多すぎると捌けないので、
   同時に抱える件数も抑える。 */
const COMM_MIN_INTERVAL = 150;
const COMM_MAX_INTERVAL = 420;
const COMM_MAX_PENDING  = 3;

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
   cat     … 記録に付ける発信元の分類 (js/19-ui-log.js の LOG_SOURCES)
   title   … パネルに出す見出し
   from    … 連絡してきた人の呼び方 (運転士・車掌・駅長・保線区 …)
   limit   … 答えを待つ時間 [秒]
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
        id: "block_ahead", cat: "jomuin", title: "続行間隔の照会", limit: 100,
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
        id: "overtake", cat: "jomuin", title: "待避の可否", limit: 110,
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
        id: "platform", cat: "eki", title: "着発番線の変更", limit: 120,
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
        id: "turnback", cat: "jomuin", title: "折り返しの判断", limit: 120,
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
        id: "crowd", cat: "eki", title: "ホーム混雑の報告", limit: 90,
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
        id: "crew", cat: "jomuin", title: "乗務員交代の照会", limit: 110,
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
        id: "signal", cat: "shingo", title: "信号設備の確認", limit: 100,
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
        id: "depot_out", cat: "depot", title: "出区の可否", limit: 110,
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
        id: "onboard", cat: "jomuin", title: "車内取り扱いの報告", limit: 90,
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
        id: "track_check", cat: "hosen", title: "線路点検の申し入れ", limit: 120,
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
    }
];

// ------------------------------------------------------------------ 本体
class CommSystem {
    constructor(game) {
        this.game = game;
        this.pending = [];          // 応答待ちの連絡
        this.seq = 1;
        this.nextAt = game.currentTime + 120;
        this.recent = {};           // 種類 -> 直近に出した時刻
        this.stats = { asked: 0, answered: 0, auto: 0 };
    }

    /** game.update() から毎Tick呼ばれる */
    update() {
        const now = this.game.currentTime;

        // --- 時間切れの処理 (別の指令員が引き取る)
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const p = this.pending[i];
            if (now < p.deadline) continue;
            this.pending.splice(i, 1);
            this.resolve(p, this.autoChoice(p), true);
        }

        /* --- 指令連絡で掛けた抑止を自動で解く (commHold)。
               抑止駅に着いてから holdSec 秒で解除する。
               抑止駅にたどり着かないまま時間が経った場合も取り消す。
               ここが無いと、画面に人がいないときに抑止が溜まり、
               主要駅のホームが埋まって線区が動かなくなる。 */
        this.game.trains.forEach(t => {
            if (!t.commHoldLimit) return;
            if (t.isManuallySuspended) {
                t.commHoldTimer = (t.commHoldTimer || 0) + CONFIG.TICK_SEC;
                if (t.commHoldTimer >= t.commHoldLimit) {
                    t.commHoldLimit = 0; t.commHoldTimer = 0; t.commHoldExpire = 0;
                    this.game.applyCommand({ name: "release", trainId: t.id });
                }
            } else if (t.commHoldExpire && now >= t.commHoldExpire) {
                // 抑止駅に着かないまま時間切れ。指定を取り消して走らせる。
                t.commHoldLimit = 0; t.commHoldTimer = 0; t.commHoldExpire = 0;
                if (t.plannedStop) this.game.applyCommand({ name: "release", trainId: t.id });
            }
        });

        // --- 新しい連絡
        if (now < this.nextAt) return;
        this.nextAt = now + COMM_MIN_INTERVAL +
                      Math.random() * (COMM_MAX_INTERVAL - COMM_MIN_INTERVAL);
        const h = (now / 3600) % 24;
        if (h < 4.5 || h >= 23.0) return;            // 列車の少ない時間は鳴らさない
        if (this.pending.length >= COMM_MAX_PENDING) return;
        this.raise();
    }

    /** 場面を1つ選んで連絡を作る */
    raise() {
        const now = this.game.currentTime;
        /* 直近に出した種類は選ばれにくくする (同じ話が続かないように)。
           当てはまる列車がいない場面は、重みを 0 にして次の候補を引く。 */
        const pool = COMM_SCENES
            .filter(s => !this.pending.some(p => p.sceneId === s.id))
            .map(s => ({ s: s, w: (now - (this.recent[s.id] || -9999) > 900) ? 3 : 1 }));
        for (let tries = 0; tries < 5; tries++) {
            const picked = commPick(pool);
            if (!picked) return;
            const scene = picked.s;
            let ctx = null;
            try { ctx = scene.find(this.game); } catch (e) { ctx = null; }
            if (!ctx) { picked.w = 0; continue; }
            this.recent[scene.id] = now;
            const p = {
                id: "C" + (this.seq++),
                sceneId: scene.id,
                cat: scene.cat,
                title: scene.title,
                /* 発信元は場面ごとに決める (運転士・車掌・駅長・保線区…)。
                   ここをまとめて「運転士」にしていたころは、
                   保線区や車両所からの連絡まで運転士の名前で出ていた。 */
                from: scene.from ? scene.from(ctx)
                    : (ctx.train ? commCrew(ctx.train) : "現業"),
                text: scene.text(this.game, ctx),
                at: now,
                deadline: now + (scene.limit || 100),
                limit: scene.limit || 100,
                trainId: ctx.train ? ctx.train.id : null,
                trainNo: ctx.train ? ctx.train.trainNo : "",
                options: scene.options.map(o => ({ key: o.key, label: o.label, hint: o.hint })),
                _ctx: ctx
            };
            this.pending.push(p);
            this.stats.asked++;
            this.game.ui.addStaffLogToHistory("【" + scene.title + "】" + p.text, scene.cat, p.from);
            return;
        }
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
    resolve(p, key, byOther) {
        const scene = COMM_SCENES.find(s => s.id === p.sceneId);
        if (!scene) return;
        const opt = scene.options.find(o => o.key === key) || scene.options[0];
        const ctx = p._ctx || {};
        /* 当該列車がもう居ない (終着・入区した) ことがある。
           その場合は処置を飛ばし、記録だけ残す。 */
        if (ctx.train && !this.game.getTrain(ctx.train.id)) {
            this.game.ui.updateBanner(
                "【指令】" + (p.trainNo ? p.trainNo + " — " : "") +
                "当該列車はすでに運転を終えていました。処置は不要です。", "banner-blue");
            return;
        }
        try { opt.apply(this.game, ctx); }
        catch (e) { console.error("指令連絡の処置に失敗しました", p.sceneId, e); }

        if (byOther) this.stats.auto++;
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
            trainNo: p.trainNo, trainId: p.trainId,
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
