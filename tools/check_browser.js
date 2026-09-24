/* 実際のブラウザ (Chrome) で画面を開き、描画とタッチ操作を確かめる。

   使い方:
     npm install --no-save playwright-core
     node tools/check_browser.js                 # 既定 (1440x900) と iPad で確認
     node tools/check_browser.js --shot          # スクリーンショットも保存する

   ローカルに簡易HTTPサーバを立てて index.html / tid.html を開き、
     ・JavaScript のエラーが出ていないか
     ・キャンバスが画面の大きさに収まっているか (iPadの上限対策)
     ・線路図に実際に色が塗られているか (真っ白でないか)
     ・スクロールできるか
     ・指令パッド・留置場の構内図・発車標が開くか
   を確認する。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const SHOT = process.argv.indexOf('--shot') >= 0;
const SHOT_DIR = path.join(ROOT, 'tools', '.tmp', 'shots');

const CHROME_CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.xlsx': 'application/octet-stream' };

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

/** そのページを開いて共通の確認を行う */
async function checkPage(browser, url, label, viewport, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({
        viewport: viewport,
        deviceScaleFactor: opts.dpr || 2,
        hasTouch: !!opts.touch,
        isMobile: !!opts.touch
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    const ignore = (u) => /favicon|apple-touch-icon/i.test(String(u || ''));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        // アイコン未配置による404は無視する
        if (ignore(t) || (t.indexOf('404') >= 0 && t.indexOf('.js') < 0 && t.indexOf('.css') < 0)) return;
        errors.push('console: ' + t);
    });
    page.on('requestfailed', r => {
        if (!ignore(r.url())) errors.push('読み込み失敗: ' + r.url());
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2500);   // 起動と最初の描画を待つ

    head(label + '  ' + viewport.width + 'x' + viewport.height);
    ok('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 3).join(' / '));

    const info = await page.evaluate(() => {
        const c = document.getElementById('tid-canvas') || document.querySelector('canvas');
        const sc = document.getElementById('tid-scroll') || document.getElementById('scroll-container');
        const sp = document.getElementById('tid-spacer') || document.getElementById('canvas-spacer');
        return {
            canvasW: c ? c.width : 0,
            canvasH: c ? c.height : 0,
            cssW: c ? c.clientWidth : 0,
            cssH: c ? c.clientHeight : 0,
            scrollW: sc ? sc.scrollWidth : 0,
            scrollH: sc ? sc.scrollHeight : 0,
            spacerW: sp ? sp.style.width : '',
            trains: (typeof game !== 'undefined' && game.trains) ? game.trains.length : -1,
            clock: (document.getElementById('clock') || {}).innerText || ''
        };
    });
    console.log('    キャンバス ' + info.canvasW + 'x' + info.canvasH +
                ' (CSS ' + info.cssW + 'x' + info.cssH + ')' +
                ' / スクロール範囲 ' + info.scrollW + 'x' + info.scrollH +
                ' / 在線 ' + info.trains + '本 / 時刻 ' + info.clock);

    const area = info.canvasW * info.canvasH;
    // iOS Safari のキャンバス面積の上限は機種により 16.7M 画素程度。
    // 画面ぶんしか作らない作りになっていれば、これを大きく下回るはず。
    ok('キャンバスの面積が iPad の上限より十分小さい', area > 0 && area < 16000000,
       (area / 1000000).toFixed(2) + ' 百万画素');
    ok('キャンバスの横幅が画面に収まっている', info.cssW <= viewport.width + 2,
       info.cssW + 'px / 画面 ' + viewport.width + 'px');
    ok('線路図全体ぶんのスクロール範囲がある', info.scrollW > viewport.width * 3,
       info.scrollW + 'px');
    ok('シミュレーターが動いている (時計が進んでいる)', /^\d\d:\d\d:\d\d$/.test(info.clock), info.clock);
    ok('列車が在線している', info.trains > 5, info.trains + '本');

    // 実際に色が塗られているか (真っ白・真っ黒でないか)
    const painted = await page.evaluate(() => {
        const c = document.getElementById('tid-canvas') || document.querySelector('canvas');
        if (!c) return null;
        const g = c.getContext('2d');
        const w = c.width, h = c.height;
        const d = g.getImageData(0, 0, w, h).data;
        const seen = new Set();
        let opaque = 0;
        for (let i = 0; i < d.length; i += 4 * 97) {
            if (d[i + 3] > 0) opaque++;
            seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
        }
        return { colors: seen.size, opaqueRatio: opaque / (d.length / (4 * 97)) };
    });
    if (painted) {
        ok('線路図が描かれている (色数が十分ある)', painted.colors >= 4, painted.colors + '色');
        ok('画面が塗りつぶされている', painted.opaqueRatio > 0.9,
           (painted.opaqueRatio * 100).toFixed(0) + '%');
    }

    // スクロールしてみる
    const scrolled = await page.evaluate(() => {
        const sc = document.getElementById('tid-scroll') || document.getElementById('scroll-container');
        if (!sc) return null;
        const before = sc.scrollLeft;
        sc.scrollLeft = before + 1500;
        return { before: before, after: sc.scrollLeft };
    });
    await page.waitForTimeout(600);
    if (scrolled) {
        ok('横スクロールできる', scrolled.after > scrolled.before,
           scrolled.before + ' -> ' + scrolled.after);
    }

    if (opts.checks) await opts.checks(page, ok);

    if (SHOT && opts.shots) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        for (const spot of opts.shots) {
            await page.evaluate((s) => {
                if (typeof game !== 'undefined' && game.tidRenderer) {
                    if (s.area) {
                        const a = document.getElementById('tid-area');
                        if (a) { a.value = s.area; a.dispatchEvent(new Event('change')); }
                    }
                    game.tidRenderer.scrollToStation(s.st);
                    game.tidRenderer.draw();
                }
            }, spot);
            await page.waitForTimeout(800);
            await page.screenshot({ path: path.join(SHOT_DIR, 'tid_' + spot.st + (spot.area || '') + '.png') });
            console.log('    スクリーンショット: tools/.tmp/shots/tid_' + spot.st + (spot.area || '') + '.png');
        }
    }
    if (SHOT) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const name = label.replace(/[^\w一-龥ぁ-んァ-ヶ]+/g, '_') + '_' + viewport.width + 'x' + viewport.height + '.png';
        await page.screenshot({ path: path.join(SHOT_DIR, name) });
        console.log('    スクリーンショット: tools/.tmp/shots/' + name);
    }

    const errs2 = errors.slice();
    await ctx.close();
    return errs2;
}

/* 旅客向け画面と Super-TID 画面を同じブラウザで同時に開き、
   同じシミュレーションを見ているかを確かめる。 */
async function checkSharedState(browser, base) {
    head('2画面の状態共有 (index.html と tid.html を同時に開く)');
    // 同じ localStorage / BroadcastChannel を使うため、1つのコンテキストに2ページ開く
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
    const errors = [];
    const p1 = await ctx.newPage();
    p1.on('pageerror', e => errors.push('index: ' + e.message));
    await p1.goto(base + '/index.html', { waitUntil: 'load' });
    await p1.waitForTimeout(3000);

    const p2 = await ctx.newPage();
    p2.on('pageerror', e => errors.push('tid: ' + e.message));
    await p2.goto(base + '/tid.html', { waitUntil: 'load' });
    await p2.waitForTimeout(4000);

    ok('2画面ともエラーなく動く', errors.length === 0, errors.slice(0, 3).join(' / '));

    const roles = await Promise.all([
        p1.evaluate(() => ({ host: !!(game.bus && game.bus.isHost), n: game.trains.length, t: game.currentTime })),
        p2.evaluate(() => ({ host: !!(game.bus && game.bus.isHost), n: game.trains.length, t: game.currentTime }))
    ]);
    console.log('    旅客向け: 本体=' + roles[0].host + ' 在線' + roles[0].n + '本 / ' +
                'Super-TID: 本体=' + roles[1].host + ' 在線' + roles[1].n + '本');
    ok('本体はどちらか一方だけ', roles[0].host !== roles[1].host,
       '旅客=' + roles[0].host + ' TID=' + roles[1].host);
    ok('2画面の時刻が揃っている', Math.abs(roles[0].t - roles[1].t) <= CONFIG_TICK * 2,
       roles[0].t + ' / ' + roles[1].t);
    ok('2画面の在線本数が揃っている', Math.abs(roles[0].n - roles[1].n) <= 3,
       roles[0].n + ' / ' + roles[1].n);

    // Super-TID 側で抑止 -> 旅客向け側にも反映されるか
    const target = await p2.evaluate(() => {
        const t = game.trains.find(x => x.state !== 'finished' && x.state !== 'in_depot');
        if (!t) return null;
        game.tidUI.selectTrain(t.id);
        game.tidUI.cmdHold(false);
        return t.id;
    });
    await p1.waitForTimeout(2500);
    const held = target ? await p1.evaluate((id) => {
        const t = game.trains.find(x => x.id === id);
        return t ? !!t.isManuallySuspended : null;
    }, target) : null;
    ok('Super-TID で抑止すると旅客向け画面にも反映される', held === true, String(held));

    // 旅客向け側で解除 -> Super-TID 側にも反映されるか
    if (target) {
        await p1.evaluate((id) => game.dispatch({ name: 'release', trainId: id }), target);
        await p2.waitForTimeout(2500);
        const rel = await p2.evaluate((id) => {
            const t = game.trains.find(x => x.id === id);
            return t ? !t.isManuallySuspended : null;
        }, target);
        ok('旅客向け画面で解除すると Super-TID にも反映される', rel === true, String(rel));
    }

    await ctx.close();
}

const CONFIG_TICK = 30;

(async () => {
    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) { console.error('Chrome / Edge が見つかりません'); process.exit(2); }

    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: exe, headless: true });

    try {
        // --- 旅客向け画面 (index.html)
        await checkPage(browser, base + '/index.html', '旅客向け画面 index.html',
            { width: 1440, height: 900 }, { dpr: 1, checks: async (page, ok) => {
                // 指令パッド
                await page.click('#cmd-btn');
                await page.waitForTimeout(300);
                const cmdOpen = await page.evaluate(() =>
                    document.getElementById('cmd-panel').style.display === 'block');
                ok('指令パッドが開く', cmdOpen);
                const nTrains = await page.evaluate(() =>
                    document.getElementById('cmd-no').options.length);
                ok('指令パッドに列車が並ぶ', nTrains > 5, nTrains + '件');
                // 留置場の構内図
                await page.evaluate(() => showDepotModal('宮原操'));
                await page.waitForTimeout(200);
                const depotOpen = await page.evaluate(() => {
                    const m = document.getElementById('depot-modal');
                    return m.style.display === 'flex' &&
                        document.querySelectorAll('#depot-modal-content svg').length > 0;
                });
                ok('留置場の構内配線図が開く', depotOpen);
                await page.evaluate(() => closeDepotModal());
                // 発車標
                await page.evaluate(() => game.ui.showDepartureBoard('大阪'));
                await page.waitForTimeout(200);
                const boardOpen = await page.evaluate(() =>
                    document.getElementById('dep-board-modal').style.display === 'flex');
                ok('発車標が開く', boardOpen);
                await page.evaluate(() => game.ui.closeDepartureBoard());
            }});

        // --- iPad (横向き)
        await checkPage(browser, base + '/index.html', '旅客向け画面 index.html (iPad 横)',
            { width: 1180, height: 820 }, { dpr: 2, touch: true });
        // --- iPad (縦向き)
        await checkPage(browser, base + '/index.html', '旅客向け画面 index.html (iPad 縦)',
            { width: 820, height: 1180 }, { dpr: 2, touch: true });

        // --- Super-TID 画面 (あれば)
        if (fs.existsSync(path.join(ROOT, 'tid.html'))) {
            await checkPage(browser, base + '/tid.html', 'Super-TID 画面 tid.html',
                { width: 1440, height: 900 }, { dpr: 1, shots: [
                    { st: '大阪' }, { st: '尼崎', area: 'tozai' },
                    { st: '京都', area: 'kosei' }, { st: '放出', area: 'tozai' },
                    { st: '西明石' }
                ], checks: async (page, ok) => {
                    // 線区の切り替え
                    const areas = await page.evaluate(() => TID_AREAS.map(a => a.id));
                    ok('線区を切り替えられる', areas.length >= 5, areas.join(','));
                    // 列車を選んで抑止 -> 解除
                    const r = await page.evaluate(() => {
                        // 本線上にいる列車。いなければ留置中の車両でも良い。
                        const t = game.trains.find(x => x.state !== 'finished' && x.state !== 'in_depot')
                               || game.trains.find(x => x.state !== 'finished');
                        if (!t) return null;
                        game.tidUI.selectTrain(t.id);
                        game.tidUI.cmdHold(false);
                        const held = t.isManuallySuspended;
                        game.tidUI.cmdRelease();
                        return { no: t.trainNo, held: held, released: !t.isManuallySuspended };
                    });
                    ok('指令パッドから抑止できる', !!r && r.held, r ? r.no : '列車なし');
                    ok('指令パッドから抑止解除できる', !!r && r.released);
                    // 駅情報
                    await page.evaluate(() => game.tidUI.showStation('大阪'));
                    await page.waitForTimeout(200);
                    /* 駅情報は番線ごとの固定表示 (js/46-tid-station.js)。
                       大阪は3〜11番の9番線が、列車の動きに関係なく並ぶ。 */
                    const stOpen = await page.evaluate(() =>
                        document.getElementById('tid-station').classList.contains('is-on') &&
                        document.querySelectorAll('#tid-station .tid-plat').length);
                    ok('駅の番線別の発着予定が開く (大阪は9番線)', stOpen === 9, String(stOpen));
                    await page.evaluate(() => { game.tidUI.stationName = null; game.tidUI.renderStation(); });
                    // 留置場の構内図
                    await page.evaluate(() => showDepotModal('放出'));
                    await page.waitForTimeout(200);
                    const dOpen = await page.evaluate(() =>
                        document.getElementById('depot-modal').style.display === 'flex' &&
                        document.querySelectorAll('#depot-modal-content svg').length > 0);
                    ok('留置場の構内配線図が開く', dOpen);
                    await page.evaluate(() => closeDepotModal());
                }});
            await checkPage(browser, base + '/tid.html', 'Super-TID 画面 tid.html (iPad 横)',
                { width: 1180, height: 820 }, { dpr: 2, touch: true });
        }
        // --- 2画面を同時に開いたときの状態共有
        if (fs.existsSync(path.join(ROOT, 'tid.html'))) {
            await checkSharedState(browser, base);
        }
    } finally {
        await browser.close();
        server.close();
    }

    console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
    process.exitCode = failures ? 1 : 0;
})();
