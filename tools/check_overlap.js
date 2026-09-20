/* 線路図の札どうしが重なっていないかを、実際に描いた位置で測る。

   使い方: node tools/check_overlap.js [駅名...]

   ■ なぜ画素で測るか
     「画面を見て大丈夫そう」で済ませると、実際には重なっているものを
     見落とす。そこで描画のときに札の四角を記録しておき (TID_BOXES)、
     総当たりで重なりを調べる。

   ■ 見るもの
       platform … 「N番のりば」の札
       train    … 列車表示 (列車番号＋行先)
       fleet    … 編成番号の帯
       predict  … 発着予告の札
     このうち
       ・のりば札どうし
       ・のりば札と列車表示
       ・列車表示どうし
     が重なっていないことを見る。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tools', '.tmp', 'overlap');
const CHROME_CANDIDATES = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

/* 調べる駅。番線の多い駅と、ふつうの駅の両方を入れる。 */
const STATIONS_TO_CHECK = ['大阪', '新大阪', '京都', '尼崎', '高槻', '西明石', '草津',
                           '三ノ宮', '芦屋', '膳所', '石山', '米原', '姫路', '塚本', '向日町'];

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}

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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));

    await page.goto(base + '/tid.html', { waitUntil: 'load' });
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer && game.trains.length > 0',
        { timeout: 30000 });
    await page.evaluate(() => { game.incidents.clearAll('検証'); game.incidents.nextAt = Infinity; });

    const args = process.argv.slice(2).filter(a => a.indexOf('--') !== 0);
    const list = args.length ? args : STATIONS_TO_CHECK;

    /* 時間帯を変えながら何度も測る。列車の並びは時々刻々変わるので、
       1回きりの絵で「重なっていない」と言っても意味がない。 */
    const worst = {};
    let samples = 0;
    for (let round = 0; round < 6; round++) {
        await page.evaluate(() => { for (let i = 0; i < 1800 / CONFIG.TICK_SEC; i++) game.update(); });
        for (const st of list) {
            const r = await page.evaluate((s) => {
                const rnd = game.tidRenderer;
                rnd.scrollToStation(s);
                TID_BOXES = [];
                rnd.draw();
                const boxes = TID_BOXES;
                TID_BOXES = null;
                // その駅のまわりだけを見る
                const cx = tidStationX(STATION_MAP[s]) * rnd.zoom;
                const half = 260 * rnd.zoom;
                const near = boxes.filter(b => {
                    const bx = (b.x + b.w / 2) * rnd.zoom;
                    return Math.abs(bx - cx) < half;
                });
                const hit = (a, b) => !(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 ||
                                        a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5);
                const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                                       Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
                const pairs = [];
                for (let i = 0; i < near.length; i++) {
                    for (let j = i + 1; j < near.length; j++) {
                        const a = near[i], b = near[j];
                        // 同じ列車の「表示」と「編成番号の帯」はくっついていてよい
                        if ((a.kind === 'train' && b.kind === 'fleet') ||
                            (a.kind === 'fleet' && b.kind === 'train')) continue;
                        // ホーム帯そのものは線路の上に乗るので対象外
                        if (a.kind === 'platformBar' || b.kind === 'platformBar') continue;
                        if (!hit(a, b)) continue;
                        const box = (o) => '[' + Math.round(o.x) + ',' + Math.round(o.y) +
                                           ' ' + Math.round(o.w) + 'x' + Math.round(o.h) + ']';
                        pairs.push({ a: a.kind + ':' + a.note + box(a),
                                     b: b.kind + ':' + b.note + box(b),
                                     kinds: [a.kind, b.kind].sort().join('+'),
                                     area: Math.round(area(a, b)) });
                    }
                }
                return { n: near.length, pairs: pairs };
            }, st);
            samples++;
            r.pairs.forEach(p => {
                const key = st + ' / ' + p.kinds;
                if (!worst[key] || worst[key].area < p.area) worst[key] = { st: st, p: p };
            });
        }
    }

    console.log('=== 札の重なり (' + list.length + '駅 × 6回 = ' + samples + ' 回 測定) ===');
    const keys = Object.keys(worst);
    if (!keys.length) console.log('  重なりは見つかりませんでした。');
    keys.sort((a, b) => worst[b].p.area - worst[a].p.area).slice(0, 25).forEach(k => {
        const w = worst[k];
        console.log('  ' + k.padEnd(28) + ' ' + String(w.p.area).padStart(5) + 'px²  ' +
                    w.p.a + '  ×  ' + w.p.b);
    });

    const byKind = {};
    keys.forEach(k => {
        const kinds = worst[k].p.kinds;
        byKind[kinds] = (byKind[kinds] || 0) + 1;
    });
    console.log('');
    ok('「N番のりば」の札どうしが重なっていない', !byKind['platform+platform'],
       (byKind['platform+platform'] || 0) + ' 件');
    ok('「N番のりば」の札と列車表示が重なっていない',
       !byKind['platform+train'] && !byKind['fleet+platform'],
       ((byKind['platform+train'] || 0) + (byKind['fleet+platform'] || 0)) + ' 件');
    ok('列車表示どうしが重なっていない',
       !byKind['train+train'] && !byKind['fleet+fleet'] && !byKind['fleet+train'],
       ((byKind['train+train'] || 0) + (byKind['fleet+fleet'] || 0) +
        (byKind['fleet+train'] || 0)) + ' 件');
    ok('発着予告の札が列車表示と重なっていない',
       !byKind['predict+train'] && !byKind['fleet+predict'],
       ((byKind['predict+train'] || 0) + (byKind['fleet+predict'] || 0)) + ' 件');
    ok('発着予告の札どうしが重なっていない', !byKind['predict+predict'],
       (byKind['predict+predict'] || 0) + ' 件');
    ok('発着予告の札とのりば札が重なっていない', !byKind['platform+predict'],
       (byKind['platform+predict'] || 0) + ' 件');
    ok('描画でエラーが出ていない', errs.length === 0, errs.slice(0, 2).join(' / '));

    await browser.close();
    server.close();
    console.log('\n' + (failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格'));
    process.exit(failures === 0 ? 0 : 1);
})();
