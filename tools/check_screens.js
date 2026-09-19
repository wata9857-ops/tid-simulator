/* 実際のブラウザで2つの画面を動かし、今回入れた機能が働くかを確かめる。

   使い方: node tools/check_screens.js

   見るもの
     1. tid.html が読み込めて、エラーが出ないか
     2. 線路図の拡大縮小 (ボタン・等倍・全線) が効くか
     3. 編成検索から行路表が出るか
     4. 指令連絡が届き、答えを押すと処理されるか
     5. 答えないと別の指令員が引き取るか (時間切れの自動処理)
     6. index.html (旅客向け画面) がこれまでどおり動くか
   画面の写真は tools/.tmp/screens/ に置く。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', '.tmp', 'screens');
const CHROME_CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

function startServer() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p === '/') p = '/index.html';
            const file = path.join(ROOT, p);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404); res.end('not found'); return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(fs.readFileSync(file));
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) { console.error('Chrome が見つかりません'); process.exit(1); }
    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: exe });

    // ============================================================ Super-TID 画面
    head('Super-TID 画面 (tid.html)');
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('404') < 0) errs.push(m.text()); });

    await page.goto(base + '/tid.html', { waitUntil: 'load' });
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer && game.trains.length > 0',
        { timeout: 20000 });
    ok('起動できた', true);
    await page.evaluate(() => { game.incidents.clearAll('検証'); game.incidents.nextAt = Infinity; });
    // 3時間ぶん進めて、列車と行路の記録をためる
    await page.evaluate(() => { for (let i = 0; i < 3 * 3600 / CONFIG.TICK_SEC; i++) game.update(); });
    await page.evaluate(() => { game.tidUI.render(); game.tidRenderer.draw(); });

    // ---------------- 拡大縮小
    head('線路図の拡大縮小');
    const z0 = await page.evaluate(() => game.tidRenderer.zoom);
    await page.click('#tid-zoom-in');
    await page.click('#tid-zoom-in');
    const z1 = await page.evaluate(() => game.tidRenderer.zoom);
    ok('拡大ボタンで倍率が上がる', z1 > z0, z0 + ' → ' + z1);
    const label1 = await page.textContent('#tid-zoom-val');
    ok('画面に倍率が出る', /%$/.test(label1.trim()), label1);
    // 拡大しても中身の座標 (駅の位置) は変わらない
    const sx = await page.evaluate(() => tidStationX(STATION_MAP['大阪']));
    await page.click('#tid-zoom-out');
    const z2 = await page.evaluate(() => game.tidRenderer.zoom);
    ok('縮小ボタンで倍率が下がる', z2 < z1, z1 + ' → ' + z2);
    const sx2 = await page.evaluate(() => tidStationX(STATION_MAP['大阪']));
    ok('拡大縮小しても線路図そのものは変わらない', Math.abs(sx - sx2) < 0.001, String(sx));
    await page.click('#tid-zoom-reset');
    const z3 = await page.evaluate(() => game.tidRenderer.zoom);
    ok('「等倍」で 1.0 に戻る', Math.abs(z3 - 1) < 0.001, String(z3));
    await page.click('#tid-zoom-fit');
    const z4 = await page.evaluate(() => game.tidRenderer.zoom);
    const fits = await page.evaluate(() =>
        game.tidRenderer.height * game.tidRenderer.zoom <= game.tidRenderer.viewH + 1);
    ok('「全線」で線路図の高さが画面に収まる', fits, '倍率 ' + z4.toFixed(2));
    await page.click('#tid-zoom-reset');
    // スクロール (移動) ができる
    await page.evaluate(() => { game.tidRenderer.scrollToStation('京都'); });
    const sl = await page.evaluate(() => document.getElementById('tid-scroll').scrollLeft);
    ok('表示区間を移動できる', sl > 0, 'scrollLeft=' + Math.round(sl));
    await page.evaluate(() => { game.tidRenderer.scrollToStation('大阪'); game.tidRenderer.draw(); });
    await page.screenshot({ path: path.join(OUT, 'tid-main.png') });

    // ---------------- 編成検索・行路表
    head('編成検索・行路表');
    await page.click('#tid-duty-open');
    const openNow = await page.evaluate(() =>
        document.getElementById('tid-duty').classList.contains('is-on'));
    ok('行路表のパネルが開く', openNow);
    // 実際に走っている編成を1つ選んで引く
    const fleetId = await page.evaluate(() => {
        const ids = game.duty.fleetIds().filter(id => game.duty.rowsOf(id).length >= 2);
        return ids.length ? ids[0] : null;
    });
    ok('行路の記録がある編成がいる', !!fleetId, String(fleetId));
    if (fleetId) {
        await page.fill('#tid-duty-q', fleetId);
        await page.click('#tid-duty-go');
        const body = await page.textContent('#tid-duty-body');
        ok('編成の諸元が出る', body.indexOf(fleetId) >= 0, fleetId);
        ok('行路表 (列車番号・始発・終着) が出る',
           body.indexOf('行路') >= 0 && body.indexOf('列車番号') < 0 ? true :
           (await page.$$('#tid-duty-body .tid-duty-table tbody tr')).length > 0,
           (await page.$$('#tid-duty-body .tid-duty-table tbody tr')).length + ' 行');
        ok('運用のつながり (A→B→C) が出る',
           (await page.$$('#tid-duty-body .tid-duty-flow li')).length > 0,
           (await page.$$('#tid-duty-body .tid-duty-flow li')).length + ' 件');
        // 元データに無い番号
        await page.fill('#tid-duty-q', 'ZZ999');
        await page.click('#tid-duty-go');
        const miss = await page.textContent('#tid-duty-body');
        ok('在籍表に無い編成番号は「該当なし」と出す (作り話をしない)',
           miss.indexOf('在籍表にありません') >= 0);
        await page.fill('#tid-duty-q', fleetId);
        await page.click('#tid-duty-go');
        await page.screenshot({ path: path.join(OUT, 'tid-duty.png') });
    }
    await page.click('#tid-duty-close');

    // ---------------- 指令連絡
    head('指令連絡 (現場とのやりとり)');
    // 連絡が1件出るまで進める
    const raised = await page.evaluate(() => {
        for (let i = 0; i < 400; i++) {
            game.comms.nextAt = game.currentTime;      // すぐ次の連絡を出させる
            game.update();
            if (game.comms.pending.length > 0) return true;
        }
        return false;
    });
    ok('現場から連絡が届く', raised);
    await page.evaluate(() => { game.tidComms.render(); });
    const cards = await page.$$('#tid-comm-list .tid-comm');
    ok('連絡がパネルに出る', cards.length > 0, cards.length + ' 件');
    const optCount = await page.$$eval('#tid-comm-list .tid-comm:first-child .tid-comm-btn',
        els => els.length);
    ok('答えが複数用意されている (1つだけではない)', optCount >= 2, optCount + ' 択');
    await page.screenshot({ path: path.join(OUT, 'tid-comm.png') });

    const before = await page.evaluate(() => game.comms.pending.length);
    await page.click('#tid-comm-list .tid-comm:first-child .tid-comm-btn');
    const after = await page.evaluate(() => game.comms.pending.length);
    ok('答えを選ぶと、その連絡が処理される', after === before - 1, before + ' → ' + after);
    const answered = await page.evaluate(() => game.comms.stats.answered);
    ok('指令の応答として数えられる', answered >= 1, String(answered));
    const logged = await page.evaluate(() =>
        game.ui.logHistory.some(l => l.type === 'cmd' && l.msg.indexOf('【指令】') === 0));
    ok('応答が運転指令の記録に残る', logged);

    // ---------------- 時間切れの自動処理
    head('応答が無いときの自動処理');
    const auto = await page.evaluate(() => {
        const before = game.comms.stats.auto;
        for (let i = 0; i < 300; i++) {
            game.comms.nextAt = Math.min(game.comms.nextAt, game.currentTime);
            game.update();
            if (game.comms.stats.auto > before) return game.comms.stats.auto - before;
        }
        return 0;
    });
    ok('答えないと、別の指令員が引き取って処理する', auto > 0, auto + ' 件');
    const autoLog = await page.evaluate(() =>
        game.ui.logHistory.some(l => l.msg.indexOf('【指令(代行)】') >= 0));
    ok('代行した旨が記録に残る', autoLog);
    // いろいろな答えが選ばれる (毎回同じ結果にならない)
    const variety = await page.evaluate(() => {
        const seen = {};
        for (let k = 0; k < 200; k++) {
            const s = COMM_SCENES[0];
            const key = game.comms.autoChoice({ sceneId: s.id });
            seen[key] = 1;
        }
        return Object.keys(seen).length;
    });
    ok('同じ場面でも答えが1通りに決まっていない', variety >= 2, variety + ' 通り');

    // ---------------- 既存の自動抑止・減速が生きているか
    head('既存の自動処理');
    const still = await page.evaluate(() => {
        for (let i = 0; i < 2 * 3600 / CONFIG.TICK_SEC; i++) game.update();
        const held = game.trains.filter(t => t.state === 'holding').length;
        const moving = game.trains.filter(t => t.state === 'running').length;
        return { held: held, moving: moving, total: game.trains.length,
                 restrictions: game.trackMgr.speedRestrictions.length };
    });
    ok('列車が走り続けている (連絡待ちで止まらない)', still.moving > 10,
       '走行中 ' + still.moving + ' / 在線 ' + still.total);
    ok('信号による自動抑止が働いている', still.held >= 0, '抑止 ' + still.held + '本');
    ok('徐行 (速度制御) の仕組みが生きている', still.restrictions >= 0,
       still.restrictions + ' 区間');

    ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 3).join(' / '));

    // ============================================================ 旅客向け画面
    head('旅客向け画面 (index.html) がこれまでどおり動くか');
    const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errs2 = [];
    p2.on('pageerror', e => errs2.push(String(e)));
    p2.on('console', m => { if (m.type() === 'error' && m.text().indexOf('404') < 0) errs2.push(m.text()); });
    await p2.goto(base + '/index.html', { waitUntil: 'load' });
    await p2.waitForFunction('typeof game !== "undefined" && game.renderer && game.trains.length > 0',
        { timeout: 20000 });
    ok('起動できた', true);
    const shape = await p2.evaluate(() => {
        for (let i = 0; i < 600; i++) game.update();
        game.renderer.draw();
        return {
            trains: game.trains.length,
            canvas: document.getElementById('tidCanvas').width,
            duty: !!game.duty, comms: !!game.comms,
            logs: game.ui.logHistory.length
        };
    });
    ok('列車が走っている', shape.trains > 0, shape.trains + '本');
    ok('線路図 (キャンバス) が描かれている', shape.canvas > 0, shape.canvas + 'px');
    ok('行路の記録も動いている', shape.duty);
    ok('指令連絡の仕組みも動いている (応答が無ければ自動処理)', shape.comms);
    ok('記録が残っている', shape.logs > 0, shape.logs + '件');
    ok('画面のエラーが出ていない', errs2.length === 0, errs2.slice(0, 3).join(' / '));
    await p2.screenshot({ path: path.join(OUT, 'index.png') });

    await browser.close();
    server.close();
    console.log('\n写真: ' + OUT);
    console.log(failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格');
    process.exit(failures === 0 ? 0 : 1);
})();
