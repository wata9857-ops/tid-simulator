/* 実際のブラウザで2つの画面を操作し、目に見える動きまで確かめる。

   使い方:
     node tools/check_screens.js                 # 手元のファイルを確かめる
     node tools/check_screens.js --live          # 公開先 (GitHub Pages) を確かめる
     node tools/check_screens.js --live --warm   # 公開先を「前に開いたことのある
                                                 #  ブラウザ」で確かめる

   ■ 以前の検証が見逃したこと
     前の版は「ボタンがある」「関数がある」「HTTP 200 が返る」までしか見て
     おらず、押した結果どうなるかを見ていなかった。さらに毎回まっさらな
     ブラウザで開いていたので、いちばん問題になる
     「前に開いたことのある端末で、古い js がキャッシュから使われる」
     という壊れ方をまったく再現できていなかった。

     そこでこの版では
       ・駅と駅の間隔を画面の座標で測る
       ・拡大縮小はキャンバスの中身が変わったことまで見る
       ・一覧から編成を選んで、行路表が出るところまで見る
       ・--warm を付けると、同じブラウザで2回開いてから確かめる
     という形にした。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', '.tmp', 'screens');
const LIVE = process.argv.indexOf('--live') >= 0;
const WARM = process.argv.indexOf('--warm') >= 0;
const LIVE_BASE = 'https://wata9857-ops.github.io/tid-simulator';
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
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                'Cache-Control': 'max-age=600'     // GitHub Pages と同じ
            });
            res.end(fs.readFileSync(file));
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

/** キャンバスの中身を写し取って、変わったかどうかを比べられるようにする */
async function canvasFingerprint(page) {
    return page.evaluate(() => {
        const c = document.getElementById('tid-canvas');
        return c.toDataURL('image/png').length + ':' +
               c.toDataURL('image/png').slice(3000, 3200);
    });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) { console.error('Chrome が見つかりません'); process.exit(1); }

    let server = null, base;
    if (LIVE) { base = LIVE_BASE; }
    else { server = await startServer(); base = 'http://127.0.0.1:' + server.address().port; }
    console.log('確認先: ' + base + (WARM ? '  (前に開いたことのあるブラウザとして)' : ''));

    /* --warm のときは、キャッシュが残る profile を使い、
       いちど開いてから開き直す (実際の利用者と同じ状態にする)。 */
    let ctx, browser = null;
    const profile = path.join(os.tmpdir(), 'tid-screens-profile');
    if (WARM) {
        ctx = await chromium.launchPersistentContext(profile, {
            executablePath: exe, viewport: { width: 1600, height: 1000 } });
    } else {
        browser = await chromium.launch({ executablePath: exe });
        ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    }

    // ============================================================ Super-TID
    head('Super-TID 画面 (tid.html)');
    const page = ctx.pages()[0] || await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('404') < 0) errs.push(m.text()); });

    if (WARM) {
        // 1回目 (ここでキャッシュに入る)
        await page.goto(base + '/tid.html', { waitUntil: 'load' });
        await page.waitForTimeout(800);
        await page.reload({ waitUntil: 'load' });   // 2回目 = 利用者の「開き直し」
    } else {
        await page.goto(base + '/tid.html', { waitUntil: 'load' });
    }
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer && game.trains.length > 0',
        { timeout: 30000 });
    ok('起動できた', true);
    await page.evaluate(() => { game.incidents.clearAll('検証'); game.incidents.nextAt = Infinity; });
    await page.evaluate(() => { for (let i = 0; i < 3 * 3600 / CONFIG.TICK_SEC; i++) game.update(); });
    await page.evaluate(() => { game.tidUI.render(); game.tidRenderer.draw(); });

    // ---------------- 2. 駅と駅の間隔 (目に見える距離)
    head('駅と駅の間隔');
    const geo = await page.evaluate(() => {
        const r = game.tidRenderer;
        const px = (n) => tidStationX(STATION_MAP[n]) * r.zoom;
        return {
            scale: TID_SCALE, zoom: r.zoom,
            osakaToTsukamoto: Math.abs(px('大阪') - px('塚本')),
            osakaToShin: Math.abs(px('大阪') - px('新大阪')),
            onScreen: Math.round(r.viewW / (Math.abs(px('大阪') - px('塚本')) || 1) * 10) / 10
        };
    });
    console.log('    横倍率 ' + geo.scale + ' / 大阪〜塚本 ' + Math.round(geo.osakaToTsukamoto) +
                'px / 大阪〜新大阪 ' + Math.round(geo.osakaToShin) + 'px' +
                ' / 画面に約 ' + geo.onScreen + ' 駅間');
    ok('1駅の間隔が短くなっている (以前の 864px より短い)',
       geo.osakaToTsukamoto < 700, Math.round(geo.osakaToTsukamoto) + 'px');
    ok('1駅の間隔が詰まりすぎていない', geo.osakaToTsukamoto > 350,
       Math.round(geo.osakaToTsukamoto) + 'px');
    ok('画面に2駅間より多く入る', geo.onScreen >= 2.0, '約 ' + geo.onScreen + ' 駅間');

    // ---------------- 3〜6. 拡大縮小 (キャンバスの中身まで見る)
    head('拡大縮小 (押した結果まで確かめる)');
    const f0 = await canvasFingerprint(page);
    const z0 = await page.evaluate(() => game.tidRenderer.zoom);
    await page.click('#tid-zoom-in');
    await page.waitForTimeout(150);
    const z1 = await page.evaluate(() => game.tidRenderer.zoom);
    const f1 = await canvasFingerprint(page);
    const g1 = await page.evaluate(() =>
        Math.abs(tidStationX(STATION_MAP['大阪']) - tidStationX(STATION_MAP['塚本'])) * game.tidRenderer.zoom);
    ok('＋ を押すと倍率が上がる', z1 > z0, z0 + ' → ' + z1);
    ok('＋ を押すと駅の間隔が実際に広がる', g1 > geo.osakaToTsukamoto + 10,
       Math.round(geo.osakaToTsukamoto) + 'px → ' + Math.round(g1) + 'px');
    ok('＋ を押すと線路図の見た目が変わる', f1 !== f0);
    ok('表示倍率の数字が変わる', (await page.textContent('#tid-zoom-val')).trim() !== '100%',
       await page.textContent('#tid-zoom-val'));

    await page.click('#tid-zoom-out');
    await page.click('#tid-zoom-out');
    await page.waitForTimeout(150);
    const z2 = await page.evaluate(() => game.tidRenderer.zoom);
    const g2 = await page.evaluate(() =>
        Math.abs(tidStationX(STATION_MAP['大阪']) - tidStationX(STATION_MAP['塚本'])) * game.tidRenderer.zoom);
    ok('− を押すと倍率が下がる', z2 < z1, z1 + ' → ' + z2);
    ok('− を押すと駅の間隔が実際に狭まる', g2 < g1 - 10,
       Math.round(g1) + 'px → ' + Math.round(g2) + 'px');

    await page.click('#tid-zoom-reset');
    await page.waitForTimeout(150);
    const z3 = await page.evaluate(() => game.tidRenderer.zoom);
    ok('「等倍」で 100% に戻る', Math.abs(z3 - 1) < 0.001 &&
       (await page.textContent('#tid-zoom-val')).trim() === '100%', String(z3));

    await page.click('#tid-zoom-fit');
    await page.waitForTimeout(150);
    const fit = await page.evaluate(() => ({
        zoom: game.tidRenderer.zoom,
        fits: game.tidRenderer.height * game.tidRenderer.zoom <= game.tidRenderer.viewH + 1
    }));
    ok('「全線」で線路図の高さが画面に収まる', fit.fits, '倍率 ' + fit.zoom.toFixed(2));
    await page.click('#tid-zoom-reset');

    // キーボードとホイールも効くか
    await page.click('#tid-viewport', { position: { x: 400, y: 200 } });
    await page.keyboard.press('+');
    await page.waitForTimeout(100);
    const zk = await page.evaluate(() => game.tidRenderer.zoom);
    ok('キーの + でも拡大する', zk > 1, String(zk));
    await page.keyboard.press('0');
    await page.waitForTimeout(100);
    ok('キーの 0 で等倍に戻る',
       Math.abs(await page.evaluate(() => game.tidRenderer.zoom) - 1) < 0.001);
    await page.mouse.move(700, 300);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);
    const zw = await page.evaluate(() => game.tidRenderer.zoom);
    ok('Ctrl + ホイールで拡大する', zw > 1, zw.toFixed(2));
    await page.click('#tid-zoom-reset');
    await page.screenshot({ path: path.join(OUT, 'tid-main.png') });

    // ---------------- 7〜8. 編成検索・行路表 (一覧から選ぶ)
    head('編成検索・行路表');
    await page.click('#tid-duty-open');
    await page.waitForTimeout(150);
    ok('「編成検索・行路表」を押すと開く', await page.evaluate(() =>
        document.getElementById('tid-duty').classList.contains('is-on')));

    const sel = await page.$('#tid-duty-sel');
    ok('編成を選ぶ一覧 (プルダウン) がある', !!sel);
    const list = await page.evaluate(() => {
        const s = document.getElementById('tid-duty-sel');
        return {
            options: s.querySelectorAll('option').length,
            groups: s.querySelectorAll('optgroup').length,
            first: (s.querySelectorAll('optgroup option')[0] || {}).value || '',
            groupLabels: Array.prototype.slice.call(s.querySelectorAll('optgroup'), 0, 3)
                .map(g => g.label),
            total: EXCEL_VEHICLES.length
        };
    });
    console.log('    一覧 ' + (list.options - 1) + ' 本 / 見出し ' + list.groups + ' 組' +
                ' / 在籍 ' + list.total + ' 本');
    console.log('    見出しの例: ' + list.groupLabels.join(' | '));
    ok('一覧に在籍中の編成がすべて並んでいる', list.options - 1 === list.total,
       (list.options - 1) + ' / ' + list.total);
    ok('「所属 形式」ごとの見出しでまとまっている', list.groups >= 5, list.groups + ' 組');

    // 編成番号の並びが W1 → W2 → … → W10 になっているか
    const order = await page.evaluate(() => {
        const s = document.getElementById('tid-duty-sel');
        const ids = Array.prototype.map.call(s.querySelectorAll('optgroup option'),
            o => o.value.replace(/^[ホシアカミハキト]+/, ''));
        const w = ids.filter(x => /^W\d+$/.test(x));
        return w.slice(0, 12);
    });
    const nums = order.map(x => parseInt(x.slice(1), 10));
    ok('編成番号が数の順に並んでいる (W1 → W2 → … → W10)',
       nums.every((n, i) => i === 0 || n > nums[i - 1]), order.join(' '));

    // 実際に走っている編成を選んで、行路表が出るか
    const running = await page.evaluate(() => {
        const ids = game.duty.fleetIds().filter(id => game.duty.rowsOf(id).length >= 2);
        return ids.length ? ids[0] : null;
    });
    ok('行路の記録がある編成がいる', !!running, String(running));
    if (running) {
        await page.selectOption('#tid-duty-sel', running);
        await page.waitForTimeout(200);
        const body = await page.textContent('#tid-duty-body');
        ok('一覧から選ぶと、その編成の行路表が出る', body.indexOf(running) >= 0, running);
        const rows = await page.$$('#tid-duty-body .tid-duty-table tbody tr');
        ok('行路表に列車番号・始発・終着の行がある', rows.length > 0, rows.length + ' 行');
        ok('運用のつながり (A → B → C) が出る',
           (await page.$$('#tid-duty-body .tid-duty-flow li')).length > 0,
           (await page.$$('#tid-duty-body .tid-duty-flow li')).length + ' 件');
        ok('選んだ編成が一覧にも残っている',
           (await page.inputValue('#tid-duty-sel')) === running);
    }

    // 絞り込み
    await page.fill('#tid-duty-q', 'W');
    await page.waitForTimeout(200);
    const filtered = await page.evaluate(() =>
        document.getElementById('tid-duty-sel').querySelectorAll('optgroup option').length);
    ok('絞り込みで一覧が短くなる', filtered > 0 && filtered < list.total,
       filtered + ' / ' + list.total + ' 本');
    await page.fill('#tid-duty-q', '223系');
    await page.waitForTimeout(200);
    const byType = await page.evaluate(() =>
        document.getElementById('tid-duty-sel').querySelectorAll('optgroup option').length);
    ok('形式 (223系) でも絞り込める', byType > 0 && byType < list.total, byType + ' 本');
    await page.fill('#tid-duty-q', 'ZZ999');
    await page.click('#tid-duty-go');
    await page.waitForTimeout(150);
    ok('在籍表に無い編成番号は「該当なし」と出す (作り話をしない)',
       (await page.textContent('#tid-duty-body')).indexOf('在籍表にありません') >= 0);
    await page.click('#tid-duty-clear');
    await page.waitForTimeout(150);
    ok('「解除」で一覧が元に戻る', (await page.evaluate(() =>
        document.getElementById('tid-duty-sel').querySelectorAll('optgroup option').length)) === list.total);
    if (running) { await page.selectOption('#tid-duty-sel', running); await page.waitForTimeout(200); }
    await page.screenshot({ path: path.join(OUT, 'tid-duty.png') });
    await page.click('#tid-duty-close');

    // ---------------- 9. 指令連絡
    head('指令連絡 (現場とのやりとり)');
    const raised = await page.evaluate(() => {
        for (let i = 0; i < 400; i++) {
            game.comms.nextAt = game.currentTime;
            game.update();
            if (game.comms.pending.length > 0) return true;
        }
        return false;
    });
    ok('現場から連絡が届く', raised);
    await page.evaluate(() => { game.tidComms.render(); });
    ok('連絡がパネルに出る', (await page.$$('#tid-comm-list .tid-comm')).length > 0);
    const optCount = await page.$$eval('#tid-comm-list .tid-comm:first-child .tid-comm-btn',
        els => els.length);
    ok('答えが複数用意されている', optCount >= 2, optCount + ' 択');
    await page.screenshot({ path: path.join(OUT, 'tid-comm.png') });
    const before = await page.evaluate(() => game.comms.pending.length);
    await page.click('#tid-comm-list .tid-comm:first-child .tid-comm-btn');
    await page.waitForTimeout(150);
    ok('答えを押すと、その連絡が処理されて一覧から消える',
       (await page.evaluate(() => game.comms.pending.length)) === before - 1);
    ok('応答が運転指令の記録に残る', await page.evaluate(() =>
        game.ui.logHistory.some(l => l.type === 'cmd' && l.msg.indexOf('【指令】') === 0)));

    head('応答が無いときの自動処理');
    const auto = await page.evaluate(() => {
        const b = game.comms.stats.auto;
        for (let i = 0; i < 300; i++) {
            game.comms.nextAt = Math.min(game.comms.nextAt, game.currentTime);
            game.update();
            if (game.comms.stats.auto > b) return game.comms.stats.auto - b;
        }
        return 0;
    });
    ok('答えないと、別の指令員が引き取って処理する', auto > 0, auto + ' 件');
    ok('代行した旨が記録に残る', await page.evaluate(() =>
        game.ui.logHistory.some(l => l.msg.indexOf('【指令(代行)】') >= 0)));
    ok('同じ場面でも答えが1通りに決まっていない', await page.evaluate(() => {
        const seen = {};
        for (let k = 0; k < 200; k++) seen[game.comms.autoChoice({ sceneId: COMM_SCENES[0].id })] = 1;
        return Object.keys(seen).length;
    }) >= 2);

    head('既存の自動処理');
    const still = await page.evaluate(() => {
        for (let i = 0; i < 2 * 3600 / CONFIG.TICK_SEC; i++) game.update();
        return { moving: game.trains.filter(t => t.state === 'running').length,
                 total: game.trains.length };
    });
    ok('列車が走り続けている (連絡待ちで止まらない)', still.moving > 10,
       '走行中 ' + still.moving + ' / 在線 ' + still.total);
    ok('画面のエラーが出ていない', errs.length === 0, errs.slice(0, 3).join(' / '));

    // ============================================================ 旅客向け画面
    head('旅客向け画面 (index.html) がこれまでどおり動くか');
    const p2 = await ctx.newPage();
    const errs2 = [];
    p2.on('pageerror', e => errs2.push(String(e)));
    p2.on('console', m => { if (m.type() === 'error' && m.text().indexOf('404') < 0) errs2.push(m.text()); });
    await p2.setViewportSize({ width: 1400, height: 900 });
    await p2.goto(base + '/index.html', { waitUntil: 'load' });
    await p2.waitForFunction('typeof game !== "undefined" && game.renderer && game.trains.length > 0',
        { timeout: 30000 });
    const shape = await p2.evaluate(() => {
        for (let i = 0; i < 600; i++) game.update();
        game.renderer.draw();
        return { trains: game.trains.length, canvas: document.getElementById('tidCanvas').width,
                 duty: !!game.duty, comms: !!game.comms, logs: game.ui.logHistory.length };
    });
    ok('列車が走っている', shape.trains > 0, shape.trains + '本');
    ok('線路図が描かれている', shape.canvas > 0, shape.canvas + 'px');
    ok('行路の記録も動いている', shape.duty);
    ok('指令連絡の仕組みも動いている', shape.comms);
    ok('画面のエラーが出ていない', errs2.length === 0, errs2.slice(0, 3).join(' / '));
    await p2.screenshot({ path: path.join(OUT, 'index.png') });

    if (browser) await browser.close(); else await ctx.close();
    if (server) server.close();
    console.log('\n写真: ' + OUT);
    console.log(failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格');
    process.exit(failures === 0 ? 0 : 1);
})();
