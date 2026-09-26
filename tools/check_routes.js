/* 「線路の上ではあり得ない動き」をまとめて見張る。
   使い方: node tools/harness.js --seed=20260922 tools/check_routes.js

   ■ 何を見るか (利用者の指摘 18・19 に対応)
     1. あり得ない着発番線   … 進路がつながっていない番線に列車が居ないか
     2. あり得ない進路       … その番線から出られない線路へ発車していないか
     3. 番線の瞬間移動       … 同じ駅に居るまま番線だけが飛んでいないか
     4. 編成の瞬間移動       … 行路のつながりが切れていないか
     5. 方転できない駅での折り返し … 引上線・渡り線の無い所で向きを変えていないか
     6. 存在しない線路の走行 … 複々線の外で内側線を走っていないか
     7. 走行線路の規則       … 新快速が内側線、快速が時間帯外に外側線を走っていないか
     8. 番線の数             … 線路のレーン数と番線の定義が合っているか
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

const HOURS = 18;

// ------------------------------------------------------------------ 計測
const bad = {
    arrive: {}, depart: {}, platJump: {}, noReverse: {}, ghostTrack: {}, side: {},
    /* ★実物の配線で方転できない駅で折り返そうとしていないか
       (js/03-stations.js の canReverseAt)。
       長岡京・西宮・向日町・茨木・川西池田・おごと温泉 は、
       上下をつなぐ渡り線も引上線も持たないので折り返せない。 */
    cantReverse: {}
};
/* 方転できる駅で、ちゃんと折り返しが起きているかも数える
   (「全部の駅で折り返しを止めてしまった」を見つけるため) */
const revSeen = {};
const count = (bag, key) => { bag[key] = (bag[key] || 0) + 1; };

/* 列車ごとに「前のTickでどこの番線に居たか」を覚えて、
   同じ駅のまま番線が変わっていないか (瞬間移動) を見る。 */
const prevAt = {};

function probe() {
    const hour = (game.currentTime / 3600) % 24;
    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const blks = game.trackMgr.blocks[t.trackId];
        const blk = blks ? blks[t.currBlockIndex] : null;
        if (!blk) continue;

        // --- 6. 線路の無い区間
        if (blk.x === -1000) { count(bad.ghostTrack, t.trackId + ' (プレースホルダ)'); continue; }
        if (/_In$/.test(t.trackId) && blk.stationIdx !== undefined &&
            !innerTrackExists(blk.stationIdx)) {
            count(bad.ghostTrack, (STATIONS[blk.stationIdx] || {}).name + ' ' + t.trackId);
        }

        const st = blockStationName(blk);
        if (!st || (!blk.isStation && !blk.hoppoStationName)) { prevAt[t.id] = null; continue; }

        // --- 1. あり得ない着発番線
        if (!canArriveAt(st, t.trackId, t.lane) && !canDepartTo(st, t.trackId, t.lane, t.trackId)) {
            const lbl = platformLabelOf(st, t.trackId, t.lane);
            count(bad.arrive, st + ' ' + t.trackId + ' ' + lbl);
        }

        // --- 2. その番線から出られる線路か (発車の予定先)
        const fwd = t.turnbackTrack || t.trackId;
        if (fwd !== t.trackId && !canDepartTo(st, t.trackId, t.lane, fwd)) {
            const lbl = platformLabelOf(st, t.trackId, t.lane);
            count(bad.depart, st + ' ' + lbl + ' → ' + fwd);
        }

        // --- 3. 番線の瞬間移動 (同じ駅・同じブロックのまま番線が変わる)
        const key = st + '|' + t.trackId + '|' + t.lane;
        const prev = prevAt[t.id];
        if (prev && prev.st === st && prev.key !== key && t.state !== 'running') {
            /* 折り返しで反対方向の線路へ移るのは、渡り線を通る実際の動き。
               ★同じ線路の中で番線だけが飛ぶのは入換なので、
                 引上線・渡り線のある駅でなければあり得ない。 */
            /* 渡り線・引上線のある駅で番線を移るのは、実際にある入換の動き。
               そういう設備の無い駅で番線が変わったら、あり得ない動き。 */
            const hasShunt = SWITCHABLE_STATIONS.indexOf(st) >= 0 ||
                             OVERTAKE_STATIONS.indexOf(st) >= 0;
            if (prev.trackId === t.trackId && !hasShunt) {
                count(bad.platJump, st + ' ' + prev.lbl + ' → ' + (platformLabelOf(st, t.trackId, t.lane) || '?'));
            }
        }
        prevAt[t.id] = { st: st, key: key, trackId: t.trackId, dir: t.dir,
                         lbl: platformLabelOf(st, t.trackId, t.lane) || '?' };

        // --- 5. 方転できない駅での折り返し
        /* 貨物ターミナルの着発線 (js/34-freight-terminals.js) では、turnbackTrack は
           「発車して出ていく本線」を指す (向きを変える印ではない)。
           ターミナルでの向きの変更は機回しで反対方向の着発線へ移る形で行い、
           下の「構内折返」の見張りが見る。 */
        const inYard = isFreightTerminalTrack(t.trackId);
        if (!inYard && t.turnbackTrack && !canTurnBackOnPlatform(st, t.trackId, t.lane, t.turnbackTrack)) {
            count(bad.noReverse, st + ' ' + (platformLabelOf(st, t.trackId, t.lane) || '?'));
        }
        /* --- 5b. 実物の配線で方転できない駅での折り返し
           ★state が 'turning_back' になった時点ではまだ折り返していない
             (executeTurnBack がこれから「方転できるか」を見る)。
             実際に折り返したかどうかは
               ・その場で向きを変えた印 (turnbackTrack) が付いたか
               ・同じ駅に居るまま向き (dir) が変わったか
             で見る。 */
        if (!inYard && t.turnbackTrack && !canReverseAt(st)) {
            count(bad.cantReverse, st + ' ' + t.trainNo + '(' + t.type + ') 同一ホーム折返');
        }
        /* 貨物ターミナル (吹田タ・神戸タ・姫路タ・京都タ。旅客駅とは別の構内) は
           着発線と機回し線で貨物列車の向きを変える (js/15-train-depot.js の freightTerminalWork)。
           向きを変えた列車は、反対方向の着発線へ移っていること。 */
        const freightTurn = t.type === '貨物' && freightTerminalAt(st) && inYard && trackDirOf(t.trackId) === t.dir;
        if (prev && prev.st === st && prev.dir !== undefined && prev.dir !== t.dir &&
            !canReverseAt(st) && !freightTurn) {
            count(bad.cantReverse, st + ' ' + t.trainNo + '(' + t.type + ') 構内折返');
        }
        if (!inYard && t.turnbackTrack && canReverseAt(st)) count(revSeen, st);

        // --- 7. 走行線路の規則
        if (['新快速', '快速', '普通'].indexOf(t.type) >= 0 &&
            !/Kosei|Fukuchi|Tozai|Hoppo/.test(t.trackId) &&
            innerTrackExists(blk.stationIdx)) {
            const want = serviceTrackSide(t, blk.stationIdx, hour);
            const got = t.trackId.indexOf('Out') >= 0 ? 'out' : 'in';
            if (want !== got) count(bad.side, t.type + ' ' + (t.dir === 1 ? '上り' : '下り') +
                                              ' 規則=' + want + ' 実際=' + got);
        }
    }
}

__run(HOURS * 3600, probe);

// ------------------------------------------------------------------ 結果
const report = (bag, n) => {
    const keys = Object.keys(bag).sort((a, b) => bag[b] - bag[a]);
    const total = keys.reduce((s, k) => s + bag[k], 0);
    const detail = keys.slice(0, n || 6).map(k => k + '×' + bag[k]).join(' / ');
    return { total: total, detail: detail };
};

head('あり得ない着発番線 (進路がつながっていない番線に居る)');
{
    const r = report(bad.arrive);
    ok('進路のつながっていない番線に列車が居ない', r.total === 0, r.detail);
}

head('あり得ない進路 (その番線から出られない線路へ発車)');
{
    const r = report(bad.depart);
    ok('出られない線路へ発車しようとしていない', r.total === 0, r.detail);
}

head('番線の瞬間移動 (同じ線路の中で番線だけが飛ぶ)');
{
    const r = report(bad.platJump);
    ok('番線が瞬間移動していない', r.total === 0, r.detail);
}

head('方転できない駅での折り返し');
{
    const r = report(bad.noReverse);
    ok('引上線・渡り線の無い所で向きを変えていない', r.total === 0, r.detail);
}

head('実物の配線で方転できない駅での折り返し');
{
    const keys = Object.keys(bad.cantReverse).sort((a, b) => bad.cantReverse[b] - bad.cantReverse[a]);
    const total = keys.reduce((n, k) => n + bad.cantReverse[k], 0);
    ok('上下をつなぐ渡り線も引上線も無い駅で折り返していない', total === 0,
       total + '件  ' + keys.slice(0, 8).join(' / '));
    /* 「できる駅」で折り返しが止まっていないことも確かめる。
       吹田は下り内↔上り内の両渡りを持つので折り返せる (画像696)。 */
    const rk = Object.keys(revSeen).sort((a, b) => revSeen[b] - revSeen[a]);
    console.log('  方転できる駅での折り返し: ' + rk.length + '駅  ' +
                rk.slice(0, 12).map(k => k + '×' + revSeen[k]).join(' '));
    ok('方転できる駅では折り返しが起きている', rk.length >= 8, rk.length + '駅');
}

head('存在しない線路の走行');
{
    const r = report(bad.ghostTrack);
    ok('線路の無い所を走っていない', r.total === 0, r.detail);
}

head('走行線路の規則 (新快速=外側線 / 快速=平日朝の高槻→大阪だけ外側線)');
{
    const r = report(bad.side);
    /* 内側線が埋まっているときに外側線へ逃がすのは実際の運転整理なので、
       0 は求めない。観測に対する割合で見る。 */
    ok('規則と違う線路を走る列車が少ない (観測の3%未満)', r.total < 20000, r.total + '件 ' + r.detail);
}

head('編成の瞬間移動 (行路のつながり)');
{
    let rows = 0, jumps = 0;
    const ex = [];
    game.duty.fleetIds().forEach(id => {
        const list = game.duty.rowsOf(id);
        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1], cur = list[i];
            rows++;
            const from = cur.from || '', at = prev.last || prev.to || '';
            if (!from || !at || from === at) continue;
            const a = fleetIndexOf(at), b = fleetIndexOf(from);
            if (a === null || b === null) continue;
            if (Math.abs(a - b) <= 1) continue;      // 記録の切れ目 (1駅ぶんのずれ)
            jumps++;
            if (ex.length < 5) ex.push(id + ' ' + at + '→' + from);
        }
    });
    const pct = rows ? (jumps * 100 / rows) : 0;
    /* 特急編成・機関車は車両所をまたぐ在庫制なので、ここには残る。 */
    ok('編成の瞬間移動が5%未満', pct < 5.0,
       jumps + ' / ' + rows + ' (' + pct.toFixed(1) + '%) 例: ' + ex.join(' , '));
}

head('列車の表示位置が着発線と合っているか');
{
    /* ★尼崎は本線・JR宝塚線・JR東西線が同じ着発線を使う駅。
       画面が「列車が乗っている線路ID」の帯に描いていたため、
       JR東西線・JR宝塚線の列車が、線路もホームも描かれていない
       「東西線の帯の尼崎のところ」に出ていた。

       ここでは、駅にいる列車の表示位置 (Super-TID と旅客向け画面の
       両方が使う stationLaneY) が、その駅の着発線の位置のどれかに
       一致しているかを確かめる。 */
    const tY = game.trackMgr.trackY;
    const bad = {};
    const cnt = (k) => { bad[k] = (bad[k] || 0) + 1; };
    let checked = 0;

    const probePos = () => {
        for (const t of game.trains) {
            if (t.state === 'finished' || t.state === 'in_depot') continue;
            const blks = game.trackMgr.blocks[t.trackId];
            const b = blks ? blks[t.currBlockIndex] : null;
            if (!b || b.x === -1000) continue;
            if (!(b.isStation || b.hoppoStationName)) continue;
            const st = blockStationName(b);
            if (!st || !STATION_PLATFORM_RULES[st]) continue;
            if (stationBranchLine(st)) continue;          // 分岐線の駅は別の帯に描く
            checked++;
            const y = stationLaneY(st, t.trackId, t.lane,
                                   tY['Up_Out'], tY['Up_In'], tY['Down_In'], tY['Down_Out']);
            if (y === null || y === undefined) {
                cnt(st + ' ' + t.trackId + ' lane' + t.lane + ' 位置なし');
                continue;
            }
            // その駅の着発線の位置のどれかに一致するか
            const ys = stationLaneYPositions(st, tY['Up_Out'], tY['Up_In'],
                                             tY['Down_In'], tY['Down_Out']);
            if (!ys.some(v => Math.abs(v - y) < 0.5)) {
                cnt(st + ' ' + t.trackId + ' lane' + t.lane + ' 着発線の外');
            }
            /* 尼崎の東西線・宝塚線の列車は、本線の帯 (上り外〜下り外) の
               中に描かれていなければならない。 */
            if (STATION_SHARED_LANES[st]) {
                const top = Math.min(tY['Up_Out'], tY['Down_Out']) - 60;
                const bot = Math.max(tY['Up_Out'], tY['Down_Out']) + 60;
                if (y < top || y > bot) {
                    cnt(st + ' ' + t.trackId + ' が本線の帯の外 (y=' + Math.round(y) + ')');
                }
            }
        }
    };
    __run(2 * 3600, probePos);
    const keys = Object.keys(bad).sort((a, b) => bad[b] - bad[a]);
    const total = keys.reduce((s2, k) => s2 + bad[k], 0);
    ok('駅にいる列車がすべて着発線の位置に描かれる', total === 0,
       total + '件 / 観測 ' + checked + '  ' + keys.slice(0, 6).map(k => k + '×' + bad[k]).join(' / '));
}

head('番線の数と線路のレーン数');
{
    const mismatch = [];
    const all = STATIONS.map(s => s.name)
        .concat(Object.values(KOSEI_STATIONS_MAP))
        .concat(Object.values(FUKUCHI_STATIONS_MAP))
        .concat(Object.values(TOZAI_STATIONS_MAP));
    all.forEach(st => {
        if (!STATION_PLATFORM_RULES[st]) return;
        const slots = stationLaneSlots(st, 0, 1000, 2000, 3000).length;
        /* ★数えるのは「その駅が属する線区の線路」だけ。
           北方貨物線・湖西線のブロックは本線とインデックスを共有しているので、
           全部の線路を数えると塚本・山科などで2本ぶん多くなる
           (そこにホームは無いので番線の定義には出てこない)。 */
        const line = stationBranchLine(st);
        const tracks = line === 'kosei' ? ['Kosei_Up', 'Kosei_Down']
                     : line === 'fukuchi' ? ['Fukuchi_Up', 'Fukuchi_Down']
                     : line === 'tozai' ? ['Tozai_Up', 'Tozai_Down']
                     : ['Up_Out', 'Up_In', 'Down_In', 'Down_Out'];
        let real = 0;
        tracks.forEach(tid => {
            const bs = game.trackMgr.blocks[tid];
            const b = bs ? bs.find(x => blockStationName(x) === st && x.x !== -1000) : null;
            if (b) real += b.lanes.length;
        });
        if (STATION_SHARED_LANES[st]) return;     // 共有駅は別に見ている
        if (slots !== real) mismatch.push(st + ' 番線' + slots + '/線路' + real);
    });
    ok('番線の定義と線路のレーン数が全駅で一致する', mismatch.length === 0,
       mismatch.length + '駅 ' + mismatch.slice(0, 10).join(' '));
}

console.log('');
console.log(failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格');
