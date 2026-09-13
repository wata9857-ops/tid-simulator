/* シミュレーション全体のつじつまを検証する。
   使い方: node tools/harness.js tools/check_consistency.js

   走っている列車について
     ・行先が進行方向の前方にあるか (たどり着けるか)
     ・走っている線路がその行先へつながっているか
     ・両数が線区の決まりを満たしているか
     ・同じ番線に2本入っていないか
     ・線路の無い区間 (プレースホルダ) にいないか
     ・留置場の在線数が実際と合っているか
   を、長時間走らせながら見張る。
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

const bad = {};
function flag(kind, t, extra) {
    if (!bad[kind]) bad[kind] = { n: 0, ex: [] };
    bad[kind].n++;
    if (bad[kind].ex.length < 3) {
        bad[kind].ex.push(
            `${t.trainNo || '?'}(${t.type}) ${t.startName}->${t.dest} [${t.trackId}] ` +
            (t.vehicles || []).map(v => v.fullId + ':' + v.cars + '両').join('+') +
            (extra ? ' / ' + extra : ''));
    }
}

/** その列車の行先が、いまの線路・向きでたどり着けるか */
function destReachable(t) {
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return true;
    const onTozai = t.trackId.indexOf('Tozai') === 0;
    const onFukuchi = t.trackId.indexOf('Fukuchi') === 0;
    const onKosei = t.trackId.indexOf('Kosei') === 0;

    // 分岐線へ入る行先は、まだ分岐駅 (尼崎・山科) の手前にいれば良い
    const amaIdx = STATION_MAP['尼崎'];
    const yamaIdx = STATION_MAP['山科'];
    const here = blks[t.currBlockIndex];
    if (!here) return true;
    const hereIdx = here.stationIdx;
    if (hereIdx === undefined) return true;

    /* JR東西線と JR宝塚線は尼崎でつながっているので、
       宝塚線を上ってきた列車が東西線へ、東西線を下ってきた列車が宝塚線へ
       そのまま入る運用がある。どちらも有効。 */
    if (TOZAI_THROUGH_DESTS.indexOf(t.dest) >= 0) {
        if (onKosei) return false;
        if (onTozai || onFukuchi) return t.dir === 1;
        return t.dir === 1 && hereIdx <= amaIdx;
    }
    if (FUKUCHI_THROUGH_DESTS.indexOf(t.dest) >= 0) {
        if (onKosei) return false;
        if (onFukuchi || onTozai) return t.dir === -1;
        return t.dir === -1 && hereIdx >= amaIdx;
    }
    // 湖西線の駅
    if (KOSEI_PLACES.indexOf(t.dest) >= 0) {
        if (onTozai || onFukuchi) return false;
        if (onKosei) return t.dir === 1;
        return t.dir === 1 && hereIdx <= yamaIdx;
    }
    // 本線の駅
    const dIdx = STATION_MAP[t.dest];
    if (dIdx === undefined) return true;                 // 貨物駅・線外の駅は対象外
    if (onTozai) return t.dir === -1 && dIdx <= amaIdx;  // 東西線から本線へ抜ける
    if (onFukuchi) return t.dir === 1 && dIdx >= amaIdx;
    if (onKosei) {
        // 湖西線から本線へ抜ける (下りは山科、上りは近江塩津)
        return (t.dir === -1) ? (dIdx <= yamaIdx) : (dIdx >= STATION_MAP['近江塩津']);
    }
    if (dIdx === hereIdx) return true;                   // 当駅止まり
    return (dIdx - hereIdx) * t.dir > 0;
}

head('24時間走らせてつじつまを見張る');
const TICKS = 24 * 3600 / CONFIG.TICK_SEC;
const laneDupSet = new Set();
let ghost = 0;
for (let i = 0; i < TICKS; i++) {
    game.update();
    if (i % 8 !== 0) continue;               // 2分おきに点検

    for (const t of game.trains) {
        if (t.state === 'finished' || t.state === 'in_depot') continue;
        const blks = game.trackMgr.blocks[t.trackId];
        if (!blks) { flag('線路が存在しない', t); continue; }
        const b = blks[t.currBlockIndex];
        if (!b) { flag('ブロックが存在しない', t); continue; }
        if (b.x === -1000) flag('線路の無い区間にいる', t);
        if (b.lanes[t.lane] !== t && b.stationIdx !== STATION_MAP['尼崎']) {
            flag('在線の登録がずれている', t,
                 '在線=' + blockStationName(b) + ' lane=' + t.lane + '/' + b.lanes.length +
                 ' state=' + t.state);
        }
        if (!destReachable(t)) flag('行先にたどり着けない', t, '在線=' + blockStationName(b));

        // 両数 (北陸線・湖西線は短い編成もある)
        const cars = (t.vehicles || []).reduce((s, v) => s + v.cars, 0);
        const sIdx = STATION_MAP[t.startName];
        const hokuriku = (sIdx !== undefined && sIdx >= STATION_MAP['米原']) ||
            ['敦賀', '近江塩津', '長浜', '米原'].indexOf(t.dest) >= 0;
        const kosei = t.trackId.indexOf('Kosei') === 0 ||
            KOSEI_PLACES.indexOf(t.dest) >= 0 || KOSEI_PLACES.indexOf(t.startName) >= 0;
        if (['普通', '快速', '新快速'].indexOf(t.type) >= 0 && !hokuriku && !kosei && cars < 6) {
            flag('普通以上が6両未満', t, cars + '両');
        }
        if (t.type === '新快速' && cars !== 12) flag('新快速が12両でない', t, cars + '両');
    }

    /* 在線の登録と列車の位置が合っているか。
       尼崎は本線・JR東西線・JR宝塚線で番線(配列)を共有しているので、
       同じ列車が複数の線路の下に見える。ここでは対象外にする。 */
    for (const tid in game.trackMgr.blocks) {
        const blks = game.trackMgr.blocks[tid];
        for (let k = 0; k < blks.length; k++) {
            if (blks[k].stationIdx === STATION_MAP['尼崎']) continue;
            const lanes = blks[k].lanes;
            for (let l = 0; l < lanes.length; l++) {
                const t = lanes[l];
                if (!t) continue;
                if (t.state === 'finished') { ghost++; lanes[l] = null; continue; }
                if (t.trackId !== tid || t.currBlockIndex !== k || t.lane !== l) laneDupSet.add(t.id);
            }
        }
    }
}

Object.keys(bad).forEach(k => {
    ok(k + ' が無い', false, bad[k].n + '件 例: ' + bad[k].ex.join(' / '));
});
if (Object.keys(bad).length === 0) {
    ok('行先・線路・両数のつじつまが合っている', true);
}
ok('在線の登録と列車の位置がずれていない', laneDupSet.size === 0, laneDupSet.size + '本');
ok('消滅した列車が線路に残っていない', ghost === 0, ghost + '件');

head('留置場');
let depotBad = [];
for (const n in DEPOTS) {
    DEPOTS[n].trains.forEach(t => {
        if (t.state !== 'in_depot') depotBad.push(n + '/' + (t.trainNo || '予備車') + ' state=' + t.state);
    });
    if (DEPOTS[n].trains.length > DEPOTS[n].capacity) {
        depotBad.push(n + ' 収容超過 ' + DEPOTS[n].trains.length + '/' + DEPOTS[n].capacity);
    }
}
ok('留置場の在線リストが正しい', depotBad.length === 0, depotBad.slice(0, 4).join(' / '));

head('編成');
const inUse = new Map();
let dup = [];
game.trains.forEach(t => (t.vehicles || []).forEach(v => {
    if (inUse.has(v)) dup.push(v.fullId + ' が ' + inUse.get(v) + ' と ' + t.trainNo);
    inUse.set(v, t.trainNo);
}));
ok('同じ編成が2本の列車に入っていない', dup.length === 0, dup.slice(0, 4).join(' / '));

const totalCommuter = game.fleet.totalIdle() +
    game.trains.reduce((s, t) => s + (t.vehicles || []).filter(v => !v.expressKey && !v.freightKey).length, 0);
ok('通勤形の編成が失われていない', totalCommuter >= EXCEL_VEHICLES.length,
   totalCommuter + ' / ' + EXCEL_VEHICLES.length);

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
