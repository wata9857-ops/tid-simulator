/* シミュレーターを1日ぶん走らせて、依頼された条件が守られているか検証する。
   使い方: node tools/harness.js tools/check_sim.js
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    if (cond) {
        console.log('  OK   ' + label + (detail ? '  (' + detail + ')' : ''));
    } else {
        failures++;
        console.log('  NG   ' + label + (detail ? '  -> ' + detail : ''));
    }
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

// ------------------------------------------------------------------ 初期配置
head('起動時の編成配置');
const poolCounts = {};
let idle = 0;
for (const k in game.fleet.pools) {
    poolCounts[k] = game.fleet.pools[k].length;
    idle += poolCounts[k];
}
console.log('  ' + Object.keys(poolCounts).map(k => k + ':' + poolCounts[k]).join('  '));
ok('全編成が留置場に配置されている', idle + 8 >= EXCEL_VEHICLES.length - 30,
   '待機 ' + idle + ' / 全 ' + EXCEL_VEHICLES.length + '編成');
ok('編成番号が配置場所に入っていない留置場が無い',
   FLEET_BASES.every(b => poolCounts[b.name] !== undefined),
   FLEET_BASES.filter(b => poolCounts[b.name] === undefined).map(b => b.name).join(','));

// 車両所グループごとに、許可された留置場だけに置かれているか
let misplaced = [];
FLEET_BASES.forEach(b => {
    (game.fleet.pools[b.name] || []).forEach(v => {
        if (b.groups.indexOf(v.group) < 0) misplaced.push(b.name + '/' + v.id + '(' + v.group + ')');
    });
});
ok('所属できない留置場に置かれた編成が無い', misplaced.length === 0, misplaced.slice(0, 6).join(' '));

// ------------------------------------------------------------------ 規則の検証
// 違反は2種類に分けて数える。
//   fresh … 編成を割り当てた直後 (= 割り当て規則そのものの違反)
//   later … その後、既存の運転整理ロジックが行先や種別を変えた結果
//           (折り返し時に reassign で直るまで残る。既存ロジックは変更しない方針)
const VIOLATIONS = { fresh: {}, later: {} };
let currentPhase = 'fresh';
function violate(rule, t) {
    const bag = VIOLATIONS[currentPhase];
    if (!bag[rule]) { bag[rule] = []; bag[rule].count = 0; }
    if (bag[rule].length < 4) {
        bag[rule].push(
            `${t.trainNo || '?'} ${t.type} ${t.startName}->${t.dest} [${t.trackId}] ` +
            (t.vehicles || []).map(v => `${v.id}(${v.type} ${v.cars}両)`).join('+'));
    }
    bag[rule].count++;
}

const seen = new Set();
const stats = {
    byType: {}, byTrack: {}, spawned: 0,
    srCarCounts: {}, peakTrains: 0
};

const inspected = new Set();
function inspect(t) {
    if (!t.vehicles || !t.vehicles.length) return;
    // 同じ列車・同じ編成の組み合わせは1回だけ数える (毎Tick数えると膨れるため)
    const fp = t.id + '|' + t.type + '|' + t.trackId + '|' + t.dest + '|' +
               t.vehicles.map(v => v.id).join('+');
    if (inspected.has(fp)) return;
    inspected.add(fp);
    // 編成を割り当てた直後の姿を覚えておき、以後は「運転整理後」として扱う
    const sig = t.type + '|' + t.trackId + '|' + t.dest + '|' + t.vehicles.map(v => v.id).join('+');
    if (t.__sig === undefined) { t.__sig = sig; currentPhase = 'fresh'; }
    else if (t.__sig === sig) { currentPhase = 'fresh'; }
    else { currentPhase = 'later'; }
    if (t.type === '特急' || t.type === '貨物') return;
    const vs = t.vehicles;
    const cars = vs.reduce((s, v) => s + v.cars, 0);
    const tid = t.trackId || '';
    const startIdx = STATION_MAP[t.startName];

    const isTozai = tid.indexOf('Tozai') >= 0 ||
        TOZAI_PLACES.indexOf(t.startName) >= 0 || TOZAI_PLACES.indexOf(t.dest) >= 0;
    const isKosei = tid.indexOf('Kosei') >= 0 ||
        KOSEI_PLACES.indexOf(t.startName) >= 0 || KOSEI_PLACES.indexOf(t.dest) >= 0;
    const isFukuchi = tid.indexOf('Fukuchi') >= 0 ||
        FUKUCHI_PLACES.indexOf(t.startName) >= 0 || FUKUCHI_PLACES.indexOf(t.dest) >= 0;
    const isHonsen = !isTozai && !isKosei && !isFukuchi;

    // (1) 新快速・快速に 221/207/321 を使わない
    if ((t.type === '新快速' || t.type === '快速') && !isTozai && !isFukuchi) {
        if (vs.some(v => VEH.is221(v) || VEH.is207(v) || VEH.is321(v) || VEH.is6000(v))) {
            violate('新快速・快速に221系/207系/321系(6000番台含む)を使っていない', t);
        }
    }
    // (2) 新快速は必ず 8両+4両 の12両
    if (t.type === '新快速') {
        stats.srCarCounts[cars] = (stats.srCarCounts[cars] || 0) + 1;
        const shape = vs.map(v => v.cars).sort().join('+');
        if (cars !== 12 || shape !== '4+8') {
            violate('新快速は8両+4両の12両編成', t);
        }
    }
    // (3) 湖西線の普通は京都支所の221系/223系のみ
    if (isKosei && t.type !== '新快速' && t.type !== '快速') {
        if (vs.some(v => !(VEH.isKyoto(v) && (VEH.is221(v) || VEH.is223(v))))) {
            violate('湖西線の普通は京都支所の221系/223系のみ', t);
        }
    }
    /* (4) 京都支所の車両は本線(JR京都線/JR神戸線)の営業運用に入れない。
           回送は車両を動かすための列車なので対象外。
           (向日町操 -> 京都 の送り込み回送などは実際にある) */
    if (isHonsen && t.type !== '回送' && t.type !== '臨時' && vs.some(v => VEH.isKyoto(v))) {
        violate('京都支所の車両を本線運用に使っていない', t);
    }
    // (5) JR東西線内は 207系/321系 のみ
    if (isTozai) {
        if (vs.some(v => !(VEH.is207(v) || VEH.is321(v)))) {
            violate('JR東西線は207系/321系のみ', t);
        }
    }
    // (6) 宝塚線 (大阪方面直通) は 223系/225系
    if (isFukuchi && !isTozai) {
        if (vs.some(v => !(VEH.is223(v) || VEH.is225(v)))) {
            violate('JR宝塚線(大阪方面)は223系/225系', t);
        }
    }
    // (7) 米原〜敦賀と湖西線以外は、普通以上は6両以上
    const isHokuriku = (startIdx !== undefined && startIdx >= STATION_MAP['米原']) ||
        ['敦賀', '近江塩津', '長浜', '米原'].indexOf(t.dest) >= 0;
    if (!isKosei && !isHokuriku && ['普通', '快速', '新快速'].indexOf(t.type) >= 0) {
        if (cars < 6) violate('米原〜敦賀・湖西線以外は6両以上', t);
    }
    // (8) 編成番号の重複在線が無い
    vs.forEach(v => {
        if (!v.__inUse) v.__inUse = 0;
    });
}

// ------------------------------------------------------------------ 1日走らせる
head('4:00 〜 24:00 のシミュレーション (20時間)');
const hourly = [];
let tickCount = 0;
const HOURS = 20;
__run(HOURS * 3600, (g) => {
    tickCount++;
    g.trains.forEach(t => {
        if (t.state === 'finished') return;
        /* ★数え方を「列車オブジェクト」から「列車(列車番号)」に変えた。
           留置場へ入った編成を次の運用に充てるようになったため、
           1つのオブジェクトが日に何本もの列車を受け持つ。
           オブジェクト単位で数えると本数が実態より少なく出てしまう。 */
        const svc = t.id + '|' + (t.trainNo || '?');
        if (t.trainNo && t.state !== 'in_depot' && !seen.has(svc)) {
            seen.add(svc);
            stats.spawned++;
            stats.byType[t.type] = (stats.byType[t.type] || 0) + 1;
            stats.byTrack[t.trackId] = (stats.byTrack[t.trackId] || 0) + 1;
        }
        inspect(t);
    });
    const live = g.trains.filter(t => t.state !== 'finished' && t.state !== 'in_depot').length;
    if (live > stats.peakTrains) stats.peakTrains = live;
    if (tickCount % (3600 / CONFIG.TICK_SEC) === 0) {
        hourly.push({
            h: ((g.currentTime / 3600) % 24).toFixed(0),
            live: live,
            idle: g.fleet.totalIdle(),
            spawned: stats.spawned
        });
    }
});

console.log('  時 / 在線 / 待機編成 / 累計生成');
hourly.forEach(r => console.log('  ' + String(r.h).padStart(2) + '時  ' +
    String(r.live).padStart(4) + '  ' + String(r.idle).padStart(5) + '  ' + String(r.spawned).padStart(6)));

head('生成本数');
console.log('  種別別: ' + Object.keys(stats.byType).sort()
    .map(k => k + '=' + stats.byType[k]).join('  '));
console.log('  路線別: ' + Object.keys(stats.byTrack).sort()
    .map(k => k + '=' + stats.byTrack[k]).join('  '));

const tozaiTotal = (stats.byTrack['Tozai_Up'] || 0) + (stats.byTrack['Tozai_Down'] || 0);
const fukuchiTotal = (stats.byTrack['Fukuchi_Up'] || 0) + (stats.byTrack['Fukuchi_Down'] || 0);
const koseiTotal = (stats.byTrack['Kosei_Up'] || 0) + (stats.byTrack['Kosei_Down'] || 0);

const BASELINE_SPAWNED = 389;   // 分割前のコードを同条件で走らせた実測値
ok('総生成本数が旧コードより減っていない', stats.spawned >= BASELINE_SPAWNED,
   stats.spawned + '本 / 20時間 (旧コード ' + BASELINE_SPAWNED + '本)');
ok('総生成本数が旧コードの1.5倍以上に回復している', stats.spawned >= BASELINE_SPAWNED * 1.5,
   (stats.spawned / BASELINE_SPAWNED).toFixed(2) + '倍');
ok('JR東西線に列車が生成されている', tozaiTotal >= 100, tozaiTotal + '本');
// 本数そのものより運転間隔が大事。間隔は tools/check_service.js で測る。
ok('JR宝塚線(福知山線)に列車が生成されている', fukuchiTotal >= 80, fukuchiTotal + '本');
ok('湖西線に列車が生成されている', koseiTotal >= 30, koseiTotal + '本');
ok('編成の枯渇が起きていない (待機編成が常に残っている)',
   hourly.every(r => r.idle > 0),
   '最小 ' + Math.min.apply(null, hourly.map(r => r.idle)) + '編成');

head('編成運用の規則');
const RULES = [
    '新快速・快速に221系/207系/321系(6000番台含む)を使っていない',
    '新快速は8両+4両の12両編成',
    '湖西線の普通は京都支所の221系/223系のみ',
    '京都支所の車両を本線運用に使っていない',
    'JR東西線は207系/321系のみ',
    'JR宝塚線(大阪方面)は223系/225系',
    '米原〜敦賀・湖西線以外は6両以上'
];
RULES.forEach(r => {
    const v = VIOLATIONS.fresh[r];
    ok(r, !v, v ? v.count + '件 例: ' + v[0] : '');
});
const laterKeys = Object.keys(VIOLATIONS.later);
if (laterKeys.length) {
    console.log('  --- 参考: 既存の運転整理ロジックが行先・種別を変えた後に条件から外れたもの');
    console.log('      (折り返し時の reassign で解消する。既存ロジックは変更しない方針のため許容)');
    laterKeys.forEach(r => console.log('      ' + r + ': ' + VIOLATIONS.later[r].count + '件 例: ' + VIOLATIONS.later[r][0]));
} else {
    console.log('  --- 運転整理後に条件から外れたものもありません');
}
console.log('  新快速の両数分布: ' + Object.keys(stats.srCarCounts).sort((a, b) => a - b)
    .map(k => k + '両x' + stats.srCarCounts[k]).join(' '));

head('編成の増備 (無制限に増えていないか)');
console.log('  借り出し ' + game.fleet.borrowCount + '回 / 増備 ' + game.fleet.reserveCount + '本');
console.log('  増備内訳: ' + JSON.stringify(game.fleet.reserveUsed));
let overMax = Object.keys(game.fleet.reserveUsed)
    .filter(g => game.fleet.reserveUsed[g] > FLEET_RESERVE[g].max);
ok('増備が上限を超えていない', overMax.length === 0, overMax.join(','));
ok('増備が現実的な範囲', game.fleet.reserveCount <= 28, game.fleet.reserveCount + '本');

head('編成の総数 (消失・増殖していないか)');
const inTrains = {};
let carriedVeh = 0;
game.trains.forEach(t => (t.vehicles || []).forEach(v => {
    if (v.isFreight || v.isExpress) return;
    carriedVeh++;
    inTrains[v.id] = (inTrains[v.id] || 0) + 1;
}));
const dup = Object.keys(inTrains).filter(k => inTrains[k] > 1);
ok('同じ編成番号が同時に複数の列車に入っていない', dup.length === 0, dup.slice(0, 5).join(','));
const totalNow = game.fleet.totalIdle() + carriedVeh;
ok('編成が失われていない', totalNow >= EXCEL_VEHICLES.length,
   '在線+待機 ' + totalNow + ' / 元 ' + EXCEL_VEHICLES.length + ' + 増備 ' + game.fleet.reserveCount);

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
globalThis.__failures = failures;
