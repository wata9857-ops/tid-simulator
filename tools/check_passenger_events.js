/* 旅客の事象 (急病人・車内トラブル・戸挟み・車内設備 …) が、貨物列車・回送・事業用列車に起きないことを見る。
   使い方: node tools/harness.js --seed=20260922 tools/check_passenger_events.js
   (利用者の指摘 2026-10: 貨物・回送はお客様が乗っていないので、旅客の事象は起こらない) */
'use strict';
globalThis.__NO_EVENTS = true;
__boot();
const fails = [];
function ok(label, cond, detail) { console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? '  (' + detail + ')' : '')); if (!cond) fails.push(label); }
const PAX_CAUSE = /急病|車内トラブル|不審物|戸挟み|荷物|ドア|ホーム柵|非常通報|空調|車内設備|異臭|転落|落とし物|触車/;
let bad = 0, total = 0, nonPaxInc = 0, crewBad = 0, minorBad = 0, minorNonPax = 0, commBad = 0;
const ex = [];
// 1. 輸送障害
const baseTrig = IncidentSystem.prototype.trigger;
IncidentSystem.prototype.trigger = function (id) {
    const inc = baseTrig.call(this, id);
    if (inc && inc.train) {
        total++;
        const pax = trainCarriesPassengers(inc.train);
        if (!pax) {
            nonPaxInc++;
            if (incidentNeedsPassengers(inc.type)) { bad++; ex.push(inc.type.name + ' → ' + inc.train.trainNo + ' ' + inc.train.type); }
            (inc.type.crew || []).forEach(c => { if (/車掌|車内|乗客/.test(c[1] + c[2])) { crewBad++; ex.push('交信: ' + c[2]); } });
        }
    }
    return inc;
};
// 2. 小さなトラブル
const baseMinor = Train.prototype.triggerMinorTrouble;
Train.prototype.triggerMinorTrouble = function () {
    baseMinor.call(this);
    if (this.minorTrouble && !trainCarriesPassengers(this)) {
        minorNonPax++;
        if (this.troubleInfo && PAX_CAUSE.test(this.troubleInfo.cause || '')) { minorBad++; ex.push('小: ' + this.troubleInfo.cause + ' ' + this.trainNo); }
    }
};
// ふつうの運転
__run(10 * 3600);
// 旅客の事象を無理に起こす (候補に貨物・回送しかいない場面も含む)
const paxIds = PASSENGER_INCIDENT_IDS.filter(id => INCIDENT_TYPES.find(t => t.id === id));
for (let i = 0; i < 300; i++) {
    const inc = game.incidents.trigger(paxIds[i % paxIds.length]);
    if (inc) game.incidents.finish(inc, '検証', true);
}
// 旅客の事象でない種類 (車両故障・人身事故・踏切 …) も起こし、貨物・回送に当たったときの交信を見る
const otherIds = ['syaryo', 'kyuen', 'jinshin', 'fumikiri', 'brake', 'ibuon', 'pantograph'].filter(id => INCIDENT_TYPES.find(t => t.id === id));
for (let i = 0; i < 200; i++) {
    const inc = game.incidents.trigger(otherIds[i % otherIds.length]);
    if (inc) game.incidents.finish(inc, '検証', true);
}
// 貨物・回送・事業用列車の小さなトラブルを起こしてみる
const nonPax = game.trains.filter(t => t.state === 'running' && !trainCarriesPassengers(t));
for (const t of nonPax.slice(0, 40)) {
    for (let k = 0; k < 5; k++) { t.state = 'running'; t.minorTrouble = false; t.triggerMinorTrouble(); }
    t.minorTrouble = false; t.state = 'running'; t.troubleInfo = { active: false, cause: '', status: '' };
}
// 指令連絡: 急病人・車内取り扱い
for (const k of ['passenger_emergency', 'onboard']) {
    const def = (typeof COMM_SCENES !== 'undefined' ? COMM_SCENES : []).find(d => d.id === k);
    if (!def) continue;
    for (let i = 0; i < 50; i++) { const c = def.find(game); if (c && c.train && !trainCarriesPassengers(c.train)) commBad++; }
}
console.log('  輸送障害 (当該列車あり) ' + total + '件 / うち貨物・回送・事業用 ' + nonPaxInc + '件');
console.log('  貨物・回送・事業用の小さなトラブル ' + minorNonPax + '件');
if (ex.length) console.log('  例: ' + ex.slice(0, 6).join(' / '));
ok('旅客の事象が貨物・回送・事業用列車に起きない (輸送障害)', bad === 0, bad + '件');
ok('貨物・回送・事業用列車の障害の交信に車掌・車内のお客様が出てこない', crewBad === 0, crewBad + '件');
ok('貨物・回送・事業用列車の小さなトラブルに旅客の事象が無い', minorBad === 0, minorBad + '件');
ok('指令連絡の急病人・車内取り扱いは旅客列車だけ', commBad === 0, commBad + '件');
ok('貨物・回送の障害そのもの (車両故障・踏切など) は起きる', nonPaxInc > 0 && minorNonPax > 0, nonPaxInc + '件 / ' + minorNonPax + '件');
console.log(fails.length ? '\n不合格 ' + fails.length + '件' : '\nすべて合格');
