/* 輸送障害の種類を増やしても、起きやすさの割合が変わっていないかを見る。

   使い方: node tools/harness.js --seed=1 tools/check_incident_mix.js

   ■ 守ること (利用者の指定)
     種類は増やすが、全体の発生頻度と、もとの確率の釣り合いは変えない。
       ・発生の間隔 (50分〜3時間) と、同時に起きる上限 (2件) はそのまま
       ・もとの10種類 (系統) の重みはそのまま。系統の中で種類に分けるだけ
     もとの10種類の名前・id も残す (指令の防護無線は "jinshin" を起こす)。
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}

// 種類を増やす前の重み (2026-09 時点の js/26-incidents.js)
const BEFORE = { jinshin: 7, kasen: 4, shingo: 5, tentetsu: 4, shishobutsu: 5,
                 syaryo: 8, door: 7, fumikiri: 7, kyubyonin: 8, kikikosho: 5 };
const BEFORE_NAMES = { jinshin: '人身事故', kasen: '架線障害', shingo: '信号設備故障',
                       tentetsu: '転てつ器故障', shishobutsu: '線路支障', syaryo: '車両故障',
                       door: 'ドア故障', fumikiri: '踏切障害', kyubyonin: '急病人救護',
                       kikikosho: '車内設備故障' };

console.log('種類: ' + INCIDENT_TYPES.length + ' (以前は 10)');
const fam = {};
INCIDENT_TYPES.forEach(t => { const f = t.family || t.id; fam[f] = (fam[f] || 0) + t.weight; });
Object.keys(BEFORE).forEach(f => {
    ok(`系統「${BEFORE_NAMES[f]}」の重みが以前と同じ`, fam[f] === BEFORE[f], `${fam[f]} / 以前 ${BEFORE[f]}`);
});
ok('以前に無かった系統が増えていない', Object.keys(fam).every(f => BEFORE[f] !== undefined),
   Object.keys(fam).filter(f => BEFORE[f] === undefined).join(','));
const total = INCIDENT_TYPES.reduce((s, t) => s + t.weight, 0);
ok('重みの合計が以前と同じ (60)', total === 60, String(total));
Object.keys(BEFORE_NAMES).forEach(id => {
    const t = INCIDENT_TYPES.find(x => x.id === id);
    ok(`もとの種類 ${id} が同じ名前で残っている`, !!t && t.name === BEFORE_NAMES[id], t ? t.name : '無い');
});
ok('種類の id が重複していない', new Set(INCIDENT_TYPES.map(t => t.id)).size === INCIDENT_TYPES.length);
ok('どの種類にも復旧の段階と交信の定型がある',
   INCIDENT_TYPES.every(t => t.phases && t.phases.length && t.crew && t.crew.length && t.causeText),
   INCIDENT_TYPES.filter(t => !(t.phases && t.phases.length && t.crew && t.crew.length && t.causeText)).map(t => t.id).join(','));

// 発生の間隔と同時件数 (ソースに書かれた値が変わっていないこと)
const src = IncidentSystem.toString();
ok('発生の間隔 (50分〜3時間) が以前と同じ', src.indexOf('now + 3000 + Math.random() * 7800') >= 0);
ok('同時に起きる上限 (2件) が以前と同じ', src.indexOf('this.active.length < 2') >= 0);
ok('最初の1件までの時間が以前と同じ', src.indexOf('game.currentTime + 2400 + Math.random() * 5400') >= 0);

// 抽選の結果が系統の割合どおりになるか
const N = 200000;
const got = {};
for (let i = 0; i < N; i++) {
    const t = pickIncidentType();
    const f = t.family || t.id;
    got[f] = (got[f] || 0) + 1;
}
let worst = 0;
Object.keys(BEFORE).forEach(f => {
    const want = BEFORE[f] / 60, have = (got[f] || 0) / N;
    worst = Math.max(worst, Math.abs(want - have));
});
ok('抽選した系統の割合が以前の割合と一致する (差 0.5% 以内)', worst < 0.005,
   '最大の差 ' + (worst * 100).toFixed(2) + '%');


// ---- 場面 (js/33-incident-scenarios.js)
const noScen = INCIDENT_TYPES.filter(t => !(INCIDENT_SCENARIOS[t.id] && INCIDENT_SCENARIOS[t.id].length >= 2));
ok('どの種類にも場面が2つ以上ある', noScen.length === 0, noScen.map(t => t.id).join(','));
const nScen = Object.keys(INCIDENT_SCENARIOS).reduce((a, k) => a + INCIDENT_SCENARIOS[k].length, 0);
console.log('  種類 ' + INCIDENT_TYPES.length + ' / 場面 合計 ' + nScen + ' 通り');
ok('場面の定義が実在の種類だけを指している',
   Object.keys(INCIDENT_SCENARIOS).every(k => INCIDENT_TYPES.some(t => t.id === k)));
const keepBad = [];
INCIDENT_TYPES.forEach(t => (INCIDENT_SCENARIOS[t.id] || []).forEach(sc => {
    const e = applyIncidentScenario(t, sc);
    if (e.id !== t.id || e.family !== t.family || e.name !== t.name || e.weight !== t.weight) keepBad.push(t.id + ':' + sc.label);
    if (!e.phases || !e.crew || !e.causeText) keepBad.push(t.id + ':' + sc.label + '(欠け)');
}));
ok('場面を重ねても id・系統・名前・重みは種類のまま', keepBad.length === 0, keepBad.join(','));
// 場面ごとの時間の倍率を、種類の中で平均すると 1 (種類としての重さは以前と同じ)
const meanBad = INCIDENT_TYPES.filter(t => {
    const list = INCIDENT_SCENARIOS[t.id] || [];
    const w = list.reduce((a, s) => a + (s.w || 1), 0);
    const m = list.reduce((a, s) => a + (s.w || 1) * ((s.dur || 1) / incidentScenarioMeanDur(t)), 0) / w;
    return Math.abs(m - 1) > 1e-9;
});
ok('場面の時間の倍率は、種類の中で平均すると以前と同じ長さ', meanBad.length === 0, meanBad.map(t => t.id).join(','));
ok('場面を重ねても種類の定義そのものは書き換わらない',
   INCIDENT_TYPES.reduce((s, t) => s + t.weight, 0) === 60 && INCIDENT_TYPES.every(t => !t.scenario));

// 場面の抽選をはさんでも系統の割合は同じ
const got2 = {};
const ctxs = [{ line: 'main', urban: true, rural: false, station: true, rush: true, night: false },
              { line: 'kosei', urban: false, rural: true, station: false, rush: false, night: true }];
for (let i = 0; i < N; i++) {
    const t = pickIncidentType();
    pickIncidentScenario(t, ctxs[i % 2]);
    const f = t.family || t.id;
    got2[f] = (got2[f] || 0) + 1;
}
let worst2 = 0;
Object.keys(BEFORE).forEach(f => { worst2 = Math.max(worst2, Math.abs(BEFORE[f] / 60 - (got2[f] || 0) / N)); });
ok('場面の抽選をはさんでも系統の割合は以前と同じ (差 0.5% 以内)', worst2 < 0.005, '最大の差 ' + (worst2 * 100).toFixed(2) + '%');

// どの種類も実際に起こせて、復旧まで進められる
for (let k = 0; k < 2400; k++) game.update();
const trigBad = [];
const seenScen = new Set();
INCIDENT_TYPES.forEach(t => {
    try {
        const inc = game.incidents.trigger(t.id);
        if (!inc) { trigBad.push(t.id + '(場所なし)'); return; }
        if (inc.type.id !== t.id) trigBad.push(t.id + '→' + inc.type.id);
        if (inc.scenario) seenScen.add(t.id);
        game.incidents.active = game.incidents.active.filter(x => x !== inc);
        game.incidents.finish(inc, '検証', true);
    } catch (e) { trigBad.push(t.id + ' ' + e.message); }
});
ok('どの種類も起こして復旧まで進められる', trigBad.length === 0, trigBad.join(', '));
ok('起こした障害に場面が付いている', seenScen.size >= INCIDENT_TYPES.length * 0.8, seenScen.size + ' / ' + INCIDENT_TYPES.length);

console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
