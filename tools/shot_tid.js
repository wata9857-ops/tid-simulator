/* Super-TID の線路図を実際のブラウザで描かせ、画像に保存する。
   実物の Super-TID (ref-diagram-*.png) と見比べるための道具。

   使い方:
     node tools/shot_tid.js                     # 既定 (山科・京都あたり)
     node tools/shot_tid.js 大津 山科 京都      # 駅を指定する
     node tools/shot_tid.js --area kosei 山科   # 表示する線区を変える

   出力先: tools/.tmp/tidshot/<駅名>.png
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', '.tmp', 'tidshot');

const CHROME_CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

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
    const args = process.argv.slice(2);
    let area = 'main';
    const ai = args.indexOf('--area');
    if (ai >= 0) { area = args[ai + 1]; args.splice(ai, 2); }
    const stations = args.length ? args : ['大津', '山科', '京都', '向日町操'];

    fs.mkdirSync(OUT, { recursive: true });
    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) { console.error('Chrome が見つかりません'); process.exit(1); }

    const server = await startServer();
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: exe });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.goto(base + '/tid.html', { waitUntil: 'load' });
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer && game.trains.length > 0', { timeout: 20000 });
    // 輸送障害で画面が乱れないように止め、列車を十分に走らせる
    await page.evaluate(() => { game.incidents.clearAll('検証'); game.incidents.nextAt = Infinity; });
    await page.evaluate(() => { for (let i = 0; i < 3 * 3600 / CONFIG.TICK_SEC; i++) game.update(); });

    if (area !== 'main') {
        await page.evaluate(a => { game.tidRenderer.applyArea(a); }, area);
    }

    for (const st of stations) {
        const info = await page.evaluate(s => {
            game.tidRenderer.scrollToStation(s);
            game.tidRenderer.draw();
            const r = game.tidRenderer;
            return { w: r.canvas.width, h: r.canvas.height, rows: r.rows.length,
                     scroll: game.scrollContainer ? game.scrollContainer.scrollLeft : -1 };
        }, st);
        await page.waitForTimeout(120);
        const el = await page.$('#tid-canvas');
        const file = path.join(OUT, st + '.png');
        await el.screenshot({ path: file });
        console.log('  ' + st + ' -> ' + file + '  canvas=' + info.w + 'x' + info.h +
                    ' rows=' + info.rows + ' scrollLeft=' + info.scroll);
    }

    // 行ごとの縦位置を書き出す (実物との寸法比較用)
    const geom = await page.evaluate(() => {
        const r = game.tidRenderer;
        return {
            rows: r.rows.map(x => ({ id: x.id, label: x.label, y: x.y })),
            stations: (typeof STATIONS !== 'undefined')
                ? ['膳所', '大津', '山科', '京都', '西大路', '桂川', '向日町']
                    .map(n => ({ n: n, x: r.stationX ? r.stationX(n) : null })) : []
        };
    });
    console.log('\n--- 行の縦位置 ---');
    geom.rows.forEach(r => console.log('   ' + r.label + ' (' + r.id + ') y=' + r.y));
    if (errs.length) { console.log('\n--- エラー ---'); errs.slice(0, 10).forEach(e => console.log('   ' + e)); }

    await browser.close();
    server.close();
})();
