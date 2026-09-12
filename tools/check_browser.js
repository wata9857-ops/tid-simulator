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
    page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (t.indexOf('favicon') >= 0) return;   // アイコン未配置による404は無視
        errors.push('console: ' + t);
    });
    page.on('requestfailed', r => {
        if (r.url().indexOf('favicon') < 0) errors.push('読み込み失敗: ' + r.url());
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2500);   // 起動と最初の描画を待つ

    head(label + '  ' + viewport.width + 'x' + viewport.height);
    ok('JavaScript のエラーが出ていない', errors.length === 0, errors.slice(0, 3).join(' / '));

    const info = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const sc = document.getElementById('scroll-container') || document.getElementById('tid-scroll');
        const sp = document.getElementById('canvas-spacer') || document.getElementById('tid-spacer');
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
        const c = document.querySelector('canvas');
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
        const sc = document.getElementById('scroll-container') || document.getElementById('tid-scroll');
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
                { width: 1440, height: 900 }, { dpr: 1 });
            await checkPage(browser, base + '/tid.html', 'Super-TID 画面 tid.html (iPad 横)',
                { width: 1180, height: 820 }, { dpr: 2, touch: true });
        }
    } finally {
        await browser.close();
        server.close();
    }

    console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
    process.exitCode = failures ? 1 : 0;
})();
