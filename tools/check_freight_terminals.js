/* 貨物ターミナル (js/03-stations.js の FREIGHT_TERMINALS / js/34-freight-terminals.js) を検証する。

   使い方: node tools/harness.js --tid --seed=20260922 tools/check_freight_terminals.js

   ■ 利用者の指定
     ・貨物ターミナルは旅客駅の一部ではなく、独立した場所として持つ
       (神戸タ = 鷹取の一部、京都タ = 西大路の一部 のような持ち方をやめる)
     ・着発線はおおむね上下3本ずつ、吹田タのような大きなターミナルは上下5本ずつ
     ・線路図に描くだけでなく、線路のつながりとして本線につながり、
       貨物列車が着く・止まる・待つ・発車する・構内作業をするのに実際に使われる
   ■ 見ること
     1. 構造 … 専用の線路・着発線の本数・旅客駅と別の位置・旅客駅から貨物の番線が消えた
     2. つながり … 入る本線・出る本線のブロックが実在する
     3. 1日走らせて … 着く・待避する・発車する・ターミナル発の列車が出る
     4. 行き詰まり … 着発線で動けなくなる列車・行先のターミナルを通り過ぎる列車・逆向きの列車が無い
     5. 線路図 (Super-TID) … 構内が描け、となりの駅名札に重ならない
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

const KEYS = Object.keys(FREIGHT_TERMINALS);

// ---------------------------------------------------------------- 1. 構造
head('構造');
ok('貨物ターミナルが4つある (姫路タ・神戸タ・吹田タ・京都タ)', ['姫路タ', '神戸タ', '吹田タ', '京都タ'].every(k => FREIGHT_TERMINALS[k]));
KEYS.forEach(k => {
    const ft = FREIGHT_TERMINALS[k];
    const up = game.trackMgr.blocks[freightTerminalTrack(k, 1)];
    const dn = game.trackMgr.blocks[freightTerminalTrack(k, -1)];
    ok(`${k}: 専用の線路 (上り・下りの着発線) がある`, !!up && !!dn && TRACKS.some(t => t.id === freightTerminalTrack(k, 1)));
    ok(`${k}: 着発線は駅と駅のあいだにあり、旅客駅のブロックとは別`, ft.pos % UNITS_PER_STATION !== 0 &&
       !game.trackMgr.blocks['Up_Out'][ft.pos].isStation, 'ブロック ' + ft.pos);
    const want = (k === '吹田タ') ? 5 : 3;
    ok(`${k}: 着発線は上下${want}本ずつ`, up[ft.pos].lanes.length === want && dn[ft.pos].lanes.length === want,
       `上り ${up[ft.pos].lanes.length} / 下り ${dn[ft.pos].lanes.length}`);
    ok(`${k}: 着発線のほかのブロックは線路の無いプレースホルダ (行き止まりの切れ端を作らない)`,
       up.every((b, i) => i === ft.pos || b.x === -1000) && dn.every((b, i) => i === ft.pos || b.x === -1000));
    ok(`${k}: 着発線のブロックの名前はターミナル名 (旅客駅の名前ではない)`,
       blockStationName(up[ft.pos]) === k && blockStationName(dn[ft.pos]) === k);
});
['ひめじ別所', '鷹取', '西大路'].forEach(st => {
    const i = STATION_MAP[st];
    const ob = game.trackMgr.blocks['Up_Out'][i * UNITS_PER_STATION];
    const labels = (STATION_PLATFORM_RULES[st] || {}).labels || [];
    ok(`旅客駅 ${st} に貨物の番線 (貨・京・タ・待) が残っていない`,
       !labels.some(l => /貨|京|タ|待/.test(l)) && !STATIONS[i].isFreightTerm && ob.lanes.length === 1,
       labels.join(',') + ' / 上り外 ' + ob.lanes.length + 'レーン');
});

// ---------------------------------------------------------------- 2. つながり
head('本線とのつながり');
KEYS.forEach(k => {
    const ft = FREIGHT_TERMINALS[k];
    [1, -1].forEach(d => {
        const links = d === 1 ? ft.links.up : ft.links.down;
        const exits = d === 1 ? ft.exits.up : ft.exits.down;
        const inOk = links.filter(tid => {
            const b = (game.trackMgr.blocks[tid] || [])[ft.pos];
            const prev = (game.trackMgr.blocks[tid] || [])[ft.pos - d];
            return b && b.x !== -1000 && prev && prev.x !== -1000;
        });
        ok(`${k} ${d === 1 ? '上り' : '下り'}: 本線から入れる (${inOk.join('・')})`, inOk.length >= 1);
        const outOk = exits.filter(tid => {
            const b = (game.trackMgr.blocks[tid] || [])[ft.pos + d];
            return b && b.x !== -1000;
        });
        ok(`${k} ${d === 1 ? '上り' : '下り'}: 着発線から本線へ出られる (${outOk.join('・')})`, outOk.length >= 1);
    });
});
ok('吹田タは北方貨物線ともつながる', FREIGHT_TERMINALS['吹田タ'].links.up.indexOf('Up_Hoppo') >= 0 &&
   FREIGHT_TERMINALS['吹田タ'].links.down.indexOf('Down_Hoppo') >= 0 &&
   game.trackMgr.blocks['Up_Hoppo'][FREIGHT_TERMINALS['吹田タ'].pos].x !== -1000);

// ---------------------------------------------------------------- 3・4. 1日走らせる
head('1日走らせる (着く・待つ・発車する・行き詰まらない)');
const stat = {};
KEYS.forEach(k => { stat[k] = { enter: 0, turn: 0, stop: 0, exit: 0, leave: 0, origin: 0, maxStay: 0, stabled: 0 }; });
const where = new Map();           // train.id -> { key, since }
let passedBy = [], wrongDir = [], paxStops = 0, endInYard = [], leaveBad = [];
const seenOrigins = new Set();
__run(22 * 3600, (g) => {
    const now = g.currentTime;
    g.trains.forEach(t => {
        if (t.state === 'finished' || t.state === 'in_depot') { where.delete(t.id); return; }
        const inYard = isFreightTerminalTrack(t.trackId);
        const w = where.get(t.id);
        if (inYard) {
            const k = freightTerminalOfTrack(t.trackId);
            if (trackDirOf(t.trackId) !== t.dir) wrongDir.push(t.trainNo + '@' + k);
            if (!w) {
                where.set(t.id, { key: k, since: now, no: t.trainNo });
                if (t.hasDeparted || t.terminalWork) stat[k].enter++;
                else if (!seenOrigins.has(t.id)) { stat[k].origin++; seenOrigins.add(t.id); }
            } else {
                stat[k].maxStay = Math.max(stat[k].maxStay, now - w.since);
            }
            const tw = t.terminalWork;
            if (tw && !tw._counted) {
                tw._counted = true;
                if (tw.kind === 'stop') stat[k].stop++;
                if (tw.kind === 'exit') stat[k].exit++;
                if (tw.kind === 'turn') { stat[k].turn++; if (tw.stabled) stat[k].stabled++; }
            }
        } else if (w) {
            // 着発線から本線へ出た
            stat[w.key].leave++;
            const ft = FREIGHT_TERMINALS[w.key];
            if (Math.abs(t.currBlockIndex - ft.pos) !== 1) leaveBad.push(t.trainNo + ' ' + w.key + '→' + t.trackId + ':' + t.currBlockIndex);
            where.delete(t.id);
        }
        // 行先のターミナルを通り過ぎた (入らずに本線を先へ進んだ)
        if (!inYard && t.type === '貨物' && FREIGHT_TERMINALS[t.dest]) {
            const ft = FREIGHT_TERMINALS[t.dest];
            if ((t.currBlockIndex - ft.pos) * t.dir >= 2 && t.hasDeparted && !t.__passReported) {
                t.__passReported = true;
                passedBy.push(t.trainNo + ' (' + t.dest + '行き) ' + t.trackId + ':' + t.currBlockIndex);
            }
        }
        // 貨物列車は旅客駅 (ひめじ別所・鷹取・西大路) に停まらない
        if (t.type === '貨物' && t.state === 'stopped' && !inYard) {
            const b = (g.trackMgr.blocks[t.trackId] || [])[t.currBlockIndex];
            const n = b ? blockStationName(b) : '';
            if (['ひめじ別所', '鷹取', '西大路'].indexOf(n) >= 0 && t.hasStoppedAtCurrent && !t.minorTrouble && !t.isManuallySuspended) paxStops++;
        }
        // 着発線の中で運転を打ち切られた (線区の端扱い) 列車
        if (inYard && t.isFinalStop && t.nextAction === 'depot' && t.dest !== freightTerminalOfTrack(t.trackId)) {
            if (!t.__endRep) { t.__endRep = true; endInYard.push(t.trainNo + ' dest ' + t.dest); }
        }
    });
});
KEYS.forEach(k => {
    const s = stat[k];
    console.log(`  ${k}: 入った ${s.enter}本 (行先 ${s.turn} [夜間留置 ${s.stabled}] / 乗務員交代・待避 ${s.stop} / 線路図の外へ ${s.exit}) ` +
                `/ ターミナル発 ${s.origin}本 / 本線へ出た ${s.leave}本 / 最長の在線 ${Math.round(s.maxStay / 60)}分`);
});
KEYS.forEach(k => ok(`${k}: 貨物列車が実際に着発線に入り、本線へ出ていった`, stat[k].enter > 0 && stat[k].leave > 0,
                     `入 ${stat[k].enter} / 出 ${stat[k].leave}`));
ok('行先のターミナルに着いて荷役・機回しをした列車がある', KEYS.some(k => stat[k].turn > 0), KEYS.map(k => k + stat[k].turn).join(' '));
ok('通過列車が着発線で乗務員交代・待避をした', KEYS.reduce((a, k) => a + stat[k].stop, 0) > 0);
ok('ターミナル発の貨物列車が着発線から出た', stat['吹田タ'].origin + stat['姫路タ'].origin > 0,
   '吹田タ ' + stat['吹田タ'].origin + ' / 姫路タ ' + stat['姫路タ'].origin);
ok('大阪タ・百済タ・安治川タ行きは吹田タで機関車を付け替えて線路図の外へ出た', stat['吹田タ'].exit > 0, String(stat['吹田タ'].exit));
ok('着発線から出た列車は、となりのブロックの本線へ出ている (瞬間移動しない)', leaveBad.length === 0, leaveBad.slice(0, 5).join(', '));
ok('行先のターミナルを通り過ぎた貨物列車が無い (入れない経路が無い)', passedBy.length === 0, passedBy.slice(0, 5).join(', '));
ok('着発線にいる列車の向きと線路の向きが一致する', wrongDir.length === 0, wrongDir.slice(0, 5).join(', '));
ok('貨物列車が旅客駅 (ひめじ別所・鷹取・西大路) に停まっていない', paxStops === 0, String(paxStops));
ok('着発線で運転を打ち切られた列車 (行き止まり扱い) が無い', endInYard.length === 0, endInYard.join(', '));
const maxStay = Math.max.apply(null, KEYS.map(k => stat[k].maxStay));
ok('着発線に7時間以上いる列車が無い (夜間留置を含めても永久に止まらない)', maxStay < 7 * 3600, Math.round(maxStay / 60) + '分');

// いま着発線にいる列車が、発車の時刻を過ぎても長く動けていない (行き詰まり)
const stuckYard = game.trains.filter(t => isFreightTerminalTrack(t.trackId) && t.state !== 'finished' &&
    t.state !== 'waiting_start' && (t.stuckTime || 0) >= 2400);
ok('着発線で40分以上発車できない列車が居ない', stuckYard.length === 0,
   stuckYard.map(t => t.trainNo + ' ' + t.state + ' ' + Math.round(t.stuckTime / 60) + '分').join(', '));
// 本線でターミナルに入れず待ち続けている列車
const waitOutside = game.trains.filter(t => !isFreightTerminalTrack(t.trackId) && t.type === '貨物' &&
    FREIGHT_TERMINALS[t.dest] && Math.abs(t.currBlockIndex - FREIGHT_TERMINALS[t.dest].pos) <= 2 &&
    (t.stuckTime || 0) >= 2400);
ok('ターミナルの手前で40分以上入れずに待っている列車が居ない', waitOutside.length === 0,
   waitOutside.map(t => t.trainNo).join(', '));

// ---------------------------------------------------------------- 満線のとき
head('着発線が満線のとき');
{
    const k = '神戸タ', ft = FREIGHT_TERMINALS[k];
    const blk = game.trackMgr.blocks[freightTerminalTrack(k, 1)][ft.pos];
    const saved = blk.lanes.slice();
    const dummy = { dummy: true, dir: 1, type: '貨物' };
    for (let l = 0; l < blk.lanes.length; l++) blk.lanes[l] = blk.lanes[l] || dummy;
    const fake = Object.create(Train.prototype);
    Object.assign(fake, { game: game, type: '貨物', dir: 1, trackId: 'Up_Out', dest: '東京タ',
                          skipHimejiFreight: false, skipKyotoFreight: false });
    ok('通過の貨物列車は、着発線が満線なら本線を通る (本線をふさがない)',
       fake.freightTerminalEntryTrack(ft.pos, 'Up_Out') === null);
    fake.dest = k;
    ok('行先の貨物列車は、満線なら手前で待つ (入る線路は着発線のまま)',
       fake.freightTerminalEntryTrack(ft.pos, 'Up_Out') === freightTerminalTrack(k, 1));
    for (let l = 0; l < blk.lanes.length; l++) blk.lanes[l] = saved[l];
    fake.type = '普通'; fake.dest = '京都';
    ok('旅客列車は貨物ターミナルに入らない', fake.freightTerminalEntryTrack(ft.pos, 'Up_Out') === null);
}

// ---------------------------------------------------------------- 5. 線路図
head('Super-TID の線路図');
if (typeof tidFreightYardLayout === 'function') {
    const trackY = buildTidTrackY(TID_AREAS[0].groups);
    KEYS.forEach(k => {
        const ft = FREIGHT_TERMINALS[k];
        const mainY = trackY[ft.side === 'top' ? 'Down_Out' : 'Up_Out'];
        const Y = tidFreightYardLayout(k, mainY);
        ok(`${k}: 構内に着発線をすべて描く (${Y.lanes.length}本)`, Y.lanes.length === ft.lanes.up + ft.lanes.down);
        ok(`${k}: 構内は${ft.side === 'top' ? '本線の上' : '本線の下'}に張り出す (配線略図 ${ft.ref})`,
           ft.side === 'top' ? Y.farY < mainY : Y.farY > mainY);
        ok(`${k}: 構内が線路図の範囲に収まる`, Math.min(Y.farY, Y.plateY) > 0 && Math.max(Y.farY, Y.plateY) < trackY.__height,
           `${Math.round(Y.plateY)} / 高さ ${Math.round(trackY.__height)}`);
        // となりの駅の駅名札 (本線の上下) と重ならない
        const near = [Math.floor(ft.pos / UNITS_PER_STATION), Math.ceil(ft.pos / UNITS_PER_STATION)];
        const hits = near.filter(i => {
            const px = tidStationX(i);
            const plateHalf = TID_GEO.plateW / 2 + 4;
            return (Y.x1 - 8 < px + plateHalf) && (Y.x2 + 8 > px - plateHalf);
        });
        ok(`${k}: 構内の着発線が、となりの駅の駅名札の横位置にかからない`, hits.length === 0,
           hits.map(i => STATIONS[i].name).join(','));
    });
} else {
    console.log('  (Super-TID の表示ファイルが読み込まれていないので飛ばす。--tid を付けて走らせる)');
}

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
