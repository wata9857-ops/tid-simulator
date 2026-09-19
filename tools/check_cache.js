/* 「前に開いたことのある端末」で、新しく公開した版がちゃんと反映されるかを確かめる。

   使い方:
     node tools/check_cache.js            # 1つ前のコミットを旧版として確かめる
     node tools/check_cache.js 6cbc198    # 旧版のコミットを指定する
                                          #   (利用者の端末に残っている版で確かめる)

   ■ なぜ要るか
     GitHub Pages は js/css を `Cache-Control: max-age=600` で配ります。
     revalidate の指定が無いので、一度読み込んだブラウザは 10分間
     サーバーに問い合わせずキャッシュを使います。iOS / iPadOS の Safari は
     さらに長く持ち続けることがあります。

     このとき、HTML だけが新しくなって js が古いままになると
       ・線路図の倍率が古いまま (駅の間隔が変わらない)
       ・新しいボタンは出ているのに、押しても何も起きない
         (起動処理 49-tid-boot.js が古く、TidZoom などを作らない)
     という、いちばん分かりにくい壊れ方をします。

   ■ この検証がやること
     GitHub Pages と同じヘッダを返すサーバーを立て、
       1. 旧版 (git の1つ前のコミット) を読み込ませてキャッシュさせる
       2. 配信元を新版に差し替える
       3. 同じブラウザで再読み込みする
     そのうえで、新版の中身が本当に効いているかを見ます。
     `?v=` のような版の指定が入っていれば、ここで新しい js が読まれます。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OLDROOT = path.join(require('os').tmpdir(), 'tid-oldbuild');
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

/** GitHub Pages と同じ応答ヘッダで配るサーバー (配信元を途中で差し替えられる) */
function startServer(state) {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (p === '/') p = '/index.html';
            const file = path.join(state.root, p);
            if (!file.startsWith(state.root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404); res.end('not found'); return;
            }
            const buf = fs.readFileSync(file);
            const st = fs.statSync(file);
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                // GitHub Pages と同じ: 10分間は問い合わせずにキャッシュを使ってよい
                'Cache-Control': 'max-age=600',
                'ETag': '"' + st.size.toString(16) + '-' + state.tag + '"',
                'Last-Modified': st.mtime.toUTCString()
            });
            res.end(buf);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

(async () => {
    /* --- 1つ前のコミットを旧版として取り出す。
           git worktree を使う (tar は Windows のパスをうまく扱えない)。 */
    /* 旧版はコマンドラインで指定できる (既定は1つ前のコミット)。
       「利用者の端末に残っている版」を指定して確かめられるようにしてある。 */
    const arg = process.argv.slice(2).filter(a => a.indexOf('--') !== 0)[0] || 'HEAD~1';
    const prev = execSync('git rev-parse ' + arg, { cwd: ROOT }).toString().trim();
    try { execSync('git worktree remove --force "' + OLDROOT + '"', { cwd: ROOT, stdio: 'ignore' }); }
    catch (e) { /* 無ければそれでよい */ }
    // 前回の後始末が残っていると worktree を作れないので掃除する
    try { execSync('git worktree prune', { cwd: ROOT, stdio: 'ignore' }); } catch (e) { /* 無視 */ }
    fs.rmSync(OLDROOT, { recursive: true, force: true });
    execSync('git worktree add --detach "' + OLDROOT + '" ' + prev, { cwd: ROOT, stdio: 'ignore' });
    console.log('旧版 = ' + prev.slice(0, 7) + ' / 新版 = 作業ツリー');

    const exe = CHROME_CANDIDATES.find(p => fs.existsSync(p));
    if (!exe) { console.error('Chrome が見つかりません'); process.exit(1); }

    const state = { root: OLDROOT, tag: 'old' };
    const server = await startServer(state);
    const base = 'http://127.0.0.1:' + server.address().port;

    // キャッシュを持ち越すため、使い捨てではない profile を使う
    const profile = path.join(require('os').tmpdir(), 'tid-cache-profile-' + Date.now());
    const ctx = await chromium.launchPersistentContext(profile, {
        executablePath: exe, viewport: { width: 1400, height: 900 }
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));

    head('1. 旧版を読み込んでキャッシュさせる (前に開いたことのある端末を再現)');
    await page.goto(base + '/tid.html', { waitUntil: 'load' });
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer', { timeout: 20000 });
    const before = await page.evaluate(() => ({
        scale: TID_SCALE,
        gap: Math.abs(tidStationX(1) - tidStationX(0)),
        zoomObj: typeof game.tidZoom !== 'undefined' && !!game.tidZoom,
        dutyObj: typeof game.tidDuty !== 'undefined' && !!game.tidDuty
    }));
    /* 旧版が本当にその版として読み込まれているか。
       旧版のソースから読み取った値と突き合わせる (数字の決め打ちにしない)。 */
    const oldScale = scaleOf(OLDROOT);
    ok('旧版が読み込まれている', Math.abs(before.scale - oldScale) < 0.01,
       '倍率 ' + before.scale + ' / 1駅 ' + Math.round(before.gap) + 'px' +
       ' / 仕組み zoom=' + before.zoomObj + ' duty=' + before.dutyObj);

    head('2. 配信元を新版に差し替えて、同じブラウザで再読み込み');
    state.root = ROOT; state.tag = 'new';
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('typeof game !== "undefined" && game.tidRenderer', { timeout: 20000 });
    const after = await page.evaluate(() => ({
        scale: TID_SCALE,
        gap: Math.abs(tidStationX(1) - tidStationX(0)),
        hasZoomBtn: !!document.getElementById('tid-zoom-in'),
        hasDutyBtn: !!document.getElementById('tid-duty-open'),
        zoomObj: typeof game.tidZoom !== 'undefined' && !!game.tidZoom,
        dutyObj: typeof game.tidDuty !== 'undefined' && !!game.tidDuty,
        commObj: typeof game.tidComms !== 'undefined' && !!game.tidComms
    }));
    console.log('    倍率 ' + after.scale + ' / 1駅 ' + Math.round(after.gap) + 'px' +
                ' / ボタン 拡大=' + after.hasZoomBtn + ' 行路表=' + after.hasDutyBtn +
                ' / 仕組み zoom=' + after.zoomObj + ' duty=' + after.dutyObj + ' comms=' + after.commObj);

    ok('新しい横倍率が効いている (駅の間隔が短くなる)',
       Math.abs(after.scale - TIDSCALE_EXPECTED()) < 0.01,
       '倍率 ' + after.scale + ' / 1駅 ' + Math.round(after.gap) + 'px');
    ok('拡大縮小の仕組みが作られている', after.zoomObj);
    ok('編成検索・行路表の仕組みが作られている', after.dutyObj);
    ok('指令連絡の仕組みが作られている', after.commObj);

    // --- 実際に押してみる
    head('3. 実際にボタンを押して、見た目が変わるか');
    if (after.hasZoomBtn) {
        const z0 = await page.evaluate(() => game.tidRenderer.zoom);
        await page.click('#tid-zoom-in');
        const z1 = await page.evaluate(() => game.tidRenderer.zoom);
        ok('＋ を押すと拡大する', z1 > z0, z0 + ' → ' + z1);
        await page.click('#tid-zoom-out');
        const z2 = await page.evaluate(() => game.tidRenderer.zoom);
        ok('− を押すと縮小する', z2 < z1, z1 + ' → ' + z2);
    }
    if (after.hasDutyBtn) {
        await page.click('#tid-duty-open');
        const open = await page.evaluate(() =>
            document.getElementById('tid-duty').classList.contains('is-on'));
        ok('編成検索・行路表 を押すと開く', open);
    }
    ok('JavaScript のエラーが出ていない', errs.length === 0, errs.slice(0, 2).join(' / '));

    await ctx.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
    try { execSync('git worktree remove --force "' + OLDROOT + '"', { cwd: ROOT, stdio: 'ignore' }); }
    catch (e) { /* 後片付けなので失敗しても構わない */ }
    console.log('\n' + (failures === 0
        ? '>>> 前に開いたことのある端末でも、新しい版が反映される'
        : '>>> ' + failures + ' 件 不合格 (キャッシュされた古い js が使われている)'));
    process.exit(failures === 0 ? 0 : 1);
})();

/** そのディレクトリの js/40-tid-theme.js に書いてある横倍率 */
function scaleOf(dir) {
    const src = fs.readFileSync(path.join(dir, 'js', '40-tid-theme.js'), 'utf8');
    const m = /const\s+TID_SCALE\s*=\s*([\d.]+)/.exec(src);
    return m ? parseFloat(m[1]) : 1.3;
}

/** 作業ツリー (新版) の横倍率 */
function TIDSCALE_EXPECTED() { return scaleOf(ROOT); }
