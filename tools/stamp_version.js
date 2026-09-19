/* HTML が読み込む js / css に「版の印」を付ける。

   使い方:
     node tools/stamp_version.js          # 版の印を今の中身に合わせて付け直す
     node tools/stamp_version.js --check  # 付け直しが要るかどうかだけ見る (書き換えない)

   ■ なぜ要るか
     GitHub Pages は js / css を `Cache-Control: max-age=600` で配ります。
     「読み直して確かめてね」の指定が無いので、一度開いたブラウザは
     しばらくサーバーに問い合わせずキャッシュを使います。
     iOS / iPadOS の Safari はさらに長く持ち続けることがあります。

     すると、新しく公開したときに
       HTML は新しい / js は古いまま
     という組み合わせが起こります。これがいちばん分かりにくい壊れ方で、
       ・線路図の倍率が古いまま → 駅の間隔が変わらない
       ・新しいボタンは出ているのに、押しても何も起きない
         (起動処理が古く、TidZoom などを作らないため)
       ・JavaScript のエラーも出ない (ただ何もしないだけ)
     という状態になります。実際にこれが起きました。

   ■ どう直すか
     読み込む URL に中身から作った印を付けます。

       <script src="js/40-tid-theme.js?v=1a2b3c4d"></script>

     中身が変われば印が変わり、URL が変わるので、
     キャッシュを持っているブラウザでも必ず新しいものを読み直します。
     中身が変わらなければ印も変わらないので、キャッシュはそのまま効きます。

     ビルドの仕組みは入れません。公開前にこのコマンドを1回走らせるだけです。
     走らせ忘れは tools/check_refs.js が見つけます。
*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'tid.html'];

/* 読み込む URL から版の印を外したもの。改行コードの違い (CRLF / LF) で
   印が変わらないよう、中身は LF に揃えてから数える。 */
function readNormalized(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** そのページが読み込んでいる js / css を、書かれている順に取り出す */
function assetsOf(html) {
    const out = [];
    const re = /(?:src|href)="((?:js|css)\/[^"?]+)(\?v=[0-9a-f]+)?"/g;
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return out;
}

/** 全ページが読み込む js / css の中身から、8桁の印を作る */
function computeStamp() {
    const seen = [];
    PAGES.forEach(p => {
        assetsOf(fs.readFileSync(path.join(ROOT, p), 'utf8')).forEach(a => {
            if (seen.indexOf(a) < 0) seen.push(a);
        });
    });
    seen.sort();
    const h = crypto.createHash('sha256');
    seen.forEach(a => {
        h.update(a);
        h.update('\0');
        h.update(readNormalized(a));
        h.update('\0');
    });
    return { stamp: h.digest('hex').slice(0, 8), files: seen };
}

/** ページの読み込み URL に印を付け直した中身を返す */
function stampHtml(html, stamp) {
    return html.replace(/((?:src|href)="(?:js|css)\/[^"?]+)(?:\?v=[0-9a-f]+)?"/g,
                        '$1?v=' + stamp + '"');
}

/** いまページに書かれている印 (無ければ null) */
function currentStampOf(html) {
    const m = /(?:src|href)="(?:js|css)\/[^"?]+\?v=([0-9a-f]+)"/.exec(html);
    return m ? m[1] : null;
}

/**
 * すべてのページの印が、いまの中身と合っているか。
 * 合っていなければ { ok:false, want, pages:[...] } を返す。
 */
function checkStamp() {
    const { stamp, files } = computeStamp();
    const bad = [];
    PAGES.forEach(p => {
        const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
        const cur = currentStampOf(html);
        const assets = assetsOf(html);
        // 印の付いていない読み込みが1つでもあれば駄目
        const missing = assets.filter(a =>
            html.indexOf(a + '?v=' + stamp + '"') < 0);
        if (cur !== stamp || missing.length) bad.push({ page: p, cur: cur, missing: missing });
    });
    return { ok: bad.length === 0, want: stamp, files: files.length, bad: bad };
}

function main() {
    const check = process.argv.indexOf('--check') >= 0;
    const r = checkStamp();
    if (check) {
        if (r.ok) {
            console.log('版の印は最新です (v=' + r.want + ' / ' + r.files + ' ファイル)');
            process.exit(0);
        }
        console.log('版の印が古いままです。想定 v=' + r.want);
        r.bad.forEach(b => console.log('  ' + b.page + ': いまの印 ' + (b.cur || 'なし') +
            (b.missing.length ? ' / 印の無い読み込み ' + b.missing.length + '件' : '')));
        console.log('node tools/stamp_version.js を実行してください。');
        process.exit(1);
    }

    const { stamp } = computeStamp();
    let changed = 0;
    PAGES.forEach(p => {
        const full = path.join(ROOT, p);
        const html = fs.readFileSync(full, 'utf8');
        const next = stampHtml(html, stamp);
        if (next !== html) { fs.writeFileSync(full, next); changed++; }
        console.log('  ' + p + (next !== html ? ' … 付け直した' : ' … 変更なし'));
    });
    console.log('版の印: v=' + stamp + ' (書き換えたページ ' + changed + ' 件)');
}

if (require.main === module) main();
module.exports = { computeStamp: computeStamp, checkStamp: checkStamp };
