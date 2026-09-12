/* 車両と運用の適合 (js/24-service-rules.js) を検証する。
   使い方: node tools/harness.js tools/check_stock.js
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

// ------------------------------------------------------------------ 在庫の定義
head('特急の専用編成');
for (const key in EXPRESS_FLEET) {
    const spec = EXPRESS_FLEET[key];
    const n = ServiceRules.expressPool.pools[key].length;
    console.log(`  ${spec.label}: ${spec.type} ${spec.cars}両 x ${n}本  [${spec.ids.join(' ')}]`);
}
const haruka = EXPRESS_FLEET.haruka;
ok('はるかが281系である', haruka.type === '281系', haruka.type);
ok('はるかが日根野支所所属である', haruka.group === 'HINENO' && haruka.base.indexOf('日根野') >= 0, haruka.base);
ok('はるかの編成番号が HA601〜HA609 である',
   haruka.ids.join(',') === 'HA601,HA602,HA603,HA604,HA605,HA606,HA607,HA608,HA609',
   haruka.ids.join(','));
ok('はるかが6両編成である', haruka.cars === 6, haruka.cars + '両');

// 通勤形の編成番号と衝突していないか (略号なしの番号だけで見る)
const commuterIds = new Set(EXCEL_VEHICLES.map(v => v.i));
const clash = ServiceRules.expressPool.all.filter(v => commuterIds.has(v.id)).map(v => v.id);
ok('特急編成の番号が通勤形と重複していない', clash.length === 0, clash.join(','));

// ------------------------------------------------------------------ 割り当て
head('運用と車両の組み合わせ (割り当て時)');
function tryAssign(startName, type, trackId, dest, trainNo) {
    const v = game.fleet.assign(startName, type, trackId, dest, trainNo);
    if (v) game.fleet.release(startName, v.slice());
    return v;
}
const h = tryAssign('新大阪', '特急', 'Up_Out', '京都', 'はるか15号');
ok('はるかに281系が充当される', !!h && h.every(x => x.type === '281系'),
   h ? h.map(x => x.fullId + ':' + x.type).join('+') : '割当なし');
ok('はるかの編成番号が HA6xx である', !!h && h.every(x => /^HA60[1-9]$/.test(x.id)),
   h ? h.map(x => x.id).join('+') : '-');

const tb = tryAssign('大阪', '特急', 'Up_Out', '敦賀', 'サンダーバード20号');
ok('サンダーバードに683系が充当される', !!tb && tb.every(x => x.type.indexOf('683系') === 0),
   tb ? tb.map(x => x.fullId + ':' + x.type).join('+') : '割当なし');

const hk = tryAssign('姫路', '特急', 'Up_Out', '京都', 'Sはくと6号');
ok('スーパーはくとにHOT7000系が充当される', !!hk && hk.every(x => x.type === 'HOT7000系'),
   hk ? hk.map(x => x.fullId).join('+') : '割当なし');

const hm = tryAssign('姫路', '特急', 'Up_Out', '大阪', 'はまかぜ2号');
ok('はまかぜにキハ189系が充当される', !!hm && hm.every(x => x.type === 'キハ189系'),
   hm ? hm.map(x => x.fullId).join('+') : '割当なし');

const dh = tryAssign('向日町操', '回送', 'Down_Out', '大阪', 'はまかぜ5号');
ok('特急の送り込み回送にも特急形が充当される', !!dh && dh.every(x => !!x.expressKey),
   dh ? dh.map(x => x.fullId + ':' + x.type).join('+') : '割当なし');

const fr = tryAssign('吹田貨', '貨物', 'Up_Hoppo', '東京タ', '1050レ');
ok('貨物に機関車が充当される', !!fr && fr.every(x => !!x.freightKey),
   fr ? fr.map(x => x.id).join('+') : '割当なし');
const fr2 = tryAssign('敦賀', '貨物', 'Down_Out', '吹田タ', '4060レ');
ok('北陸筋の貨物にEF510が充当される', !!fr2 && fr2[0].id.indexOf('EF510') === 0,
   fr2 ? fr2[0].id : '割当なし');

// ------------------------------------------------------------------ 検証層
head('あり得ない組み合わせが弾かれるか');
const commuter = [game.fleet.all.find(v => v.group === 'AKASHI')];
const expressSet = [ServiceRules.expressPool.pools.haruka[0]];
const loco = [ServiceRules.freightPool.pools.ef210[0]];

function bad(label, startName, type, trackId, dest, vs, trainNo) {
    const r = ServiceRules.validate(startName, type, trackId, dest, vs, trainNo);
    ok(label, !r.ok, r.ok ? '通ってしまった' : r.reason);
}
function good(label, startName, type, trackId, dest, vs, trainNo) {
    const r = ServiceRules.validate(startName, type, trackId, dest, vs, trainNo);
    ok(label, r.ok, r.reason);
}
bad('特急に通勤形は入れない', '新大阪', '特急', 'Up_Out', '京都', commuter, 'はるか15号');
bad('普通に特急形は入れない', '大阪', '普通', 'Up_In', '京都', expressSet, '123C');
bad('新快速に特急形は入れない', '姫路', '新快速', 'Up_Out', '野洲', expressSet, '3400M');
bad('普通に機関車は入れない', '大阪', '普通', 'Up_In', '京都', loco, '123C');
bad('貨物に通勤形は入れない', '吹田貨', '貨物', 'Up_Hoppo', '東京タ', commuter, '1050レ');
bad('東西線に223系は入れない', '京橋', '普通', 'Tozai_Down', '西明石',
    [game.fleet.all.find(v => v.group === 'ABOSHI' && v.type.indexOf('223系') === 0)], '500C');
bad('新快速に221系は入れない', '姫路', '新快速', 'Up_Out', '野洲',
    [game.fleet.all.find(v => VEH.is221(v))], '3400M');
good('特急形の返却回送は成立する', '大阪', '回送', 'Up_Out', '向日町操', expressSet, '回4001M');
good('単機回送は成立する', '吹田貨', '回送', 'Up_Hoppo', '米原', loco, '単9160');

// ------------------------------------------------------------------ 走らせて確認
head('20時間走らせて不正な充当が出ないか');
const bads = [];
const expressUse = {};
let expressTrains = 0, freightTrains = 0;
const dupSeen = [];

for (let i = 0; i < 20 * 3600 / CONFIG.TICK_SEC; i++) {
    game.update();
    const holder = new Map();
    for (const t of game.trains) {
        if (t.state === 'finished' || !t.vehicles || !t.vehicles.length) continue;

        if (t.type === '特急') {
            expressTrains++;
            const key = expressKeyFromName(t.trainNo) || expressKeyFor(t.trainNo, t.dest, t.startName);
            expressUse[key] = (expressUse[key] || 0) + 1;
        }
        if (t.type === '貨物') freightTrains++;

        const r = ServiceRules.validate(t.startName, t.type, t.trackId, t.dest, t.vehicles,
                                        t.dutyName || t.trainNo);
        if (!r.ok && bads.length < 8) {
            bads.push(`${t.trainNo}(${t.type}) ${t.startName}->${t.dest} ${t.vehicles.map(v => v.fullId).join('+')} : ${r.reason}`);
        }
        for (const v of t.vehicles) {
            if (!v.expressKey && !v.freightKey) continue;
            if (holder.has(v) && dupSeen.length < 5) {
                dupSeen.push(v.fullId + ' が ' + holder.get(v) + ' と ' + t.trainNo + ' に同時充当');
            }
            holder.set(v, t.trainNo);
        }
    }
}
console.log('  特急の在線のべ ' + expressTrains + ' / 貨物の在線のべ ' + freightTrains);
console.log('  特急の内訳(のべ): ' + Object.keys(expressUse).map(k => (EXPRESS_FLEET[k] ? EXPRESS_FLEET[k].label : k) + '=' + expressUse[k]).join(' '));
ok('走行中の列車に不正な充当が無い', bads.length === 0, bads.join(' / '));
ok('特急編成が同時に2本の列車へ入っていない', dupSeen.length === 0, dupSeen.join(' / '));
ok('列車生成時に検証で弾かれた回数が少ない', game.fleet.rejected < 50,
   game.fleet.rejected + '回' + (game.fleet.lastReject ? ' 直近: ' + game.fleet.lastReject : ''));

head('特急編成の在庫');
for (const key in EXPRESS_FLEET) {
    const total = EXPRESS_FLEET[key].ids.length;
    const idle = ServiceRules.expressPool.idleCount(key);
    const short = ServiceRules.expressPool.shortage[key];
    console.log(`  ${EXPRESS_FLEET[key].label}: 待機 ${idle}/${total}本  在庫切れ ${short}回`);
}
const lost = [];
for (const key in EXPRESS_FLEET) {
    const inUse = new Set();
    game.trains.forEach(t => (t.vehicles || []).forEach(v => { if (v.expressKey === key) inUse.add(v); }));
    // 増結用の編成 (addon) も同じ expressKey を持つので、両方を数える
    const total = EXPRESS_FLEET[key].ids.length +
        (EXPRESS_FLEET[key].addon ? EXPRESS_FLEET[key].addon.ids.length : 0);
    const have = ServiceRules.expressPool.idleCount(key) +
        ServiceRules.expressPool.addons[key].length + inUse.size;
    if (have !== total) lost.push(`${key}: ${have}/${total}`);
}
ok('特急編成が失われていない', lost.length === 0, lost.join(' '));

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
