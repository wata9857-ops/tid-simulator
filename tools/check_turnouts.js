/* 転てつ器 (渡り線・分岐・側線) の定義を全駅ぶん見張る。
   使い方: node tools/harness.js --tid tools/check_turnouts.js

   ■ 何を見るか (利用者の指摘「転てつ器を全部見直してほしい」に対応)
     1. つないでいる線路が、その駅に実際にあるか
        (複線区間の駅に「内側線との渡り線」を書いていないか)
     2. 飛び越しになっていないか
        複々線の中で 上り外 ↔ 下り外 を直接つなぐ渡り線は、
        あいだの内側線2本を飛び越すので実際には存在しない。
     3. 向き (形) の書き方が正しいか
        x = 両渡り / l = 片渡り(左上がり) / r = 片渡り(右上がり)
        side = L 画面左(米原方) / R 画面右(姫路方) / B 両側
     4. 分岐 (他線区との合流) が、その駅に来ている線区か
     5. 側線 (stub) のつなぎ先が、その駅にある線路か
     6. 折り返しに使う駅に、方転できる設備 (渡り線か引上線) があるか
     7. 配線略図から書き起こした「正解」との照合 (REF)

   ■ 配線略図を画素から読み取る道具
     python tools/extract_turnouts.py 698 --y 480 780
     斜めの線の x位置・つないでいる線路・傾きの向きを出す。
     REF に書き足すときの下調べに使う。
*/
'use strict';

__boot();

let failures = 0;
function ok(label, cond, detail) {
    console.log((cond ? '  OK   ' : '  NG   ') + label + (detail ? (cond ? '  (' : '  -> ') + detail : ''));
    if (!cond) failures++;
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

const MAIN_ORDER = ['Up_Out', 'Up_In', 'Down_In', 'Down_Out'];

/** その駅にその線路が実際にあるか (ブロックが実体を持つか)
    ★駅名ではなく位置 (stationIdx) で見る。北方貨物線は同じ位置の
      ブロックに「吹田貨」「宮原操」という別の名前が付いているので、
      名前で照合すると「吹田に北方貨物線が来ていない」ことになってしまう。 */
function trackExistsAt(st, tid) {
    const blks = game.trackMgr.blocks[tid];
    if (!blks) return false;
    const idx = STATION_MAP[st];
    if (idx === undefined) return false;
    return !!blks.find(b => b.stationIdx === idx && b.x !== -1000);
}

/* ------------------------------------------------------------------
   配線略図から書き起こした「正解」。

     cross  … 渡り線の数 (両渡りは1つと数える)
     pairs  … つないでいる線路の組
     stubs  … 駅から分かれる側線・支線の数
     src    … 元にした画像

   ★まだ全駅ぶんは書き起こせていない。ここに駅を足せば、そのまま
     照合の対象が増える (tools/check_topology.js と同じ考え方)。
------------------------------------------------------------------ */
/* 配線略図から書き起こした「正解」。
   同梱の スクリーンショット(690)〜(712).png を駅ごとに拡大して読み取った。

     cross     … 渡り線 (crossovers) の本数
     pairs     … [上側の線路, 下側の線路, 形, 置く場所] — 形と場所まで照合する
                  (形と場所を省くと「そのつながりがあるか」だけを見る)
     junctions … 他線区との合流・分岐の本数
     stubs     … 画面の外へ出ていく線の本数
     none:true … 図に渡り線が無い駅 (定義されていたら誤り)

   図の読み方は tools/.tmp/audit.md と README.md を参照。
     ・図の左＝上り方向 (米原・大阪方) ＝ Super-TID の画面左。
     ・図は上が南・下が北なので、複々線は上から 下り外・下り内・上り内・上り外。
     ・ホームを置くために線が斜めに折れているだけの所は転てつ器ではない。 */
const REF = {
    // ================================ 山陽本線 (姫路口)  画像(706)(707)
    '姫路':       { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], stubs: 3,
                    src: '706/707 播但線は東側の上、姫新線と網干は西側の下' },
    'ひめじ別所': { cross: 0, stubs: 1, src: '706 曽根側の上に貨物駅' },
    '曽根':       { none: true, src: '706 相対式2面2線。線の折れだけ' },
    '東姫路':     { none: true, src: '706 相対式2面2線' },
    '宝殿':       { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], src: '706 2面2線＋中線' },
    '御着':       { cross: 1, pairs: [['Up_Out', 'Down_Out', 'r', 'R']],
                    src: '706 2面3線。上下がつながるのは東姫路側のどだけ' },
    '加古川':     { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], stubs: 1,
                    src: '705 加古川線は宝殿側の下' },
    '東加古川':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'l', 'R']], src: '705 2面3線' },
    '土山':       { cross: 1, pairs: [['Up_Out', 'Down_Out', 'l']], src: '705 2面3線' },
    '魚住':       { none: true, src: '705 相対式2面2線' },
    '大久保':     { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']],
                    src: '705 中線が両端で上下本線につながる＋上下の待避線' },

    // ================================ 山陽本線 (神戸口)  画像(704)(705)
    '西明石': { cross: 3, stubs: 1, src: '705 複々線の西端。明石支所は明石側の下' },
    '明石':   { cross: 2, src: '705 島式2面4線' },
    '舞子':   { none: true, src: '705 島式1面2線 (電車線)' },
    '朝霧':   { none: true, src: '705 島式1面2線 (電車線)' },
    '須磨':   { cross: 1, pairs: [['Down_In', 'Up_In', 'x', 'L']],
                src: '704 電車線どうしの両渡り1組 (神戸側)。内外の渡り線は無い' },
    '須磨海浜公園': { none: true, src: '704 島式1面2線' },
    '鷹取':   { cross: 0, stubs: 1, src: '704 神戸貨物ターミナルは須磨側の下' },
    '新長田': { none: true, src: '704 相対式2面2線' },
    '兵庫':   { cross: 2, pairs: [['Down_Out', 'Down_In', 'l', 'R'], ['Up_In', 'Up_Out', 'r', 'R']],
                stubs: 1, src: '704 新長田側に片渡り2つ。上下はつながらない。和田岬線は上へ' },
    '垂水':   { none: true, src: '705 相対式2面2線 (電車線)' },
    '塩屋':   { none: true, src: '705 相対式2面2線 (電車線)' },
    '神戸':   { cross: 2, pairs: [['Down_In', 'Up_In', 'l', 'L'], ['Up_In', 'Up_Out', 'r', 'L']],
                src: '704 元町側に片渡り2つ。下り内↔下り外 は無い' },
    '三ノ宮': { none: true, src: '698 島式2面4線。渡り線なし' },
    '元町':   { none: true, src: '698 相対式2面2線' },
    '摩耶':   { cross: 2, pairs: [['Down_In', 'Up_In', 'r', 'R'], ['Up_In', 'Up_Out', 'r', 'R']],
                src: '698 島式1面2線 (内側線のあいだ)。灘側に片渡り2つ' },
    '灘':     { cross: 2, pairs: [['Down_In', 'Up_In', 'l', 'L'], ['Down_In', 'Up_In', 'x', 'R']],
                src: '698 電車線どうしの渡り線が両側に' },

    // ================================ 東海道本線 (JR神戸線)  画像(698)
    '芦屋':       { cross: 3, pairs: [['Down_In', 'Up_In', 'r', 'L']],
                    src: '698 島式2面4線＋待避線。大阪側のどに 下り内↔上り内 の片渡り' },
    'さくら夙川': { none: true, src: '698 島式1面2線。神戸方の渡り線は芦屋ののど' },
    '甲南山手':   { none: true, src: '698 相対式2面2線' },
    '摂津本山':   { none: true, src: '698 相対式2面2線' },
    '住吉':       { none: true, src: '698 相対式2面2線' },
    '六甲道':     { none: true, src: '698 相対式2面2線' },
    '立花':       { none: true, src: '698 相対式2面2線' },
    '西宮':       { none: true, src: '698 外側線の待避線への転てつ器だけ。上下をつなぐ渡り線は無い' },
    '甲子園口':   { none: true, src: '698 待避線への転てつ器だけ' },
    '尼崎':   { cross: 3, pairs: [['Up_Out', 'Up_In'], ['Down_In', 'Down_Out'], ['Down_In', 'Up_In']],
                junctions: 4, stubs: 0,
                src: '698/711 島式4面8線。東西線は塚本側・宝塚線は立花側' },
    '塚本':   { cross: 0, junctions: 2, src: '698 北方貨物線は尼崎側' },

    // ================================ 東海道本線 (JR京都線)  画像(695)(696)(697)
    '大阪':   { cross: 2, pairs: [['Up_Out', 'Up_In'], ['Down_In', 'Down_Out']], stubs: 2,
                src: '697 環状線は天満方=左・福島方=右、どちらも上' },
    '新大阪': { cross: 2, stubs: 2, src: '697 おおさか東線は東淀川側の上' },
    '吹田':   { cross: 1, pairs: [['Down_In', 'Up_In', 'x', 'R']], junctions: 2, stubs: 1,
                src: '696 東淀川側に 下り内↔上り内 の両渡り。貨物ターミナルは岸辺側の下' },
    '岸辺':   { cross: 0, stubs: 1, src: '696 吹田総合車両所は吹田側の下' },
    '千里丘': { none: true, src: '696 相対式2面2線' },
    '東淀川': { none: true, src: '697 相対式2面2線' },
    '茨木':   { cross: 2, pairs: [['Up_Out', 'Up_In', 'x', 'R'], ['Down_In', 'Down_Out', 'r', 'R']],
                stubs: 1, src: '695 渡り線は千里丘側。貨物線は上へ' },
    'JR総持寺': { none: true, src: '695 島式1面2線' },
    '摂津富田': { none: true, src: '695 相対式2面2線＋保守側線' },
    '高槻':   { cross: 2, stubs: 1, src: '695 4面6線。電留線は島本側の下' },
    '島本':   { none: true, src: '694 島式1面2線 (内側線のあいだ)' },
    '山崎':   { none: true, src: '694 下り外側線の上に待避線。渡り線は無い' },
    '長岡京': { cross: 2, pairs: [['Down_In', 'Down_Out', 'l', 'R'], ['Up_In', 'Up_Out', 'r', 'R']],
                src: '694 渡り線は2組とも山崎側' },
    '向日町操': { cross: 0, stubs: 1, src: '694 京都支所は本線の上' },
    '向日町': { cross: 2, src: '694 島式2面4線' },
    '桂川':   { none: true, src: '694 島式1面2線 (内側線のあいだ)' },
    '西大路': { cross: 0, stubs: 1, src: '693 京都貨物は京都側の下' },
    '京都':   { cross: 2, stubs: 3, src: '693 奈良線=左の上、山陰本線=右の上' },

    // ================================ 東海道本線 (琵琶湖線)  画像(690)(691)(692)
    '山科':   { cross: 0, junctions: 2, src: '692/703 湖西線は草津側。内側線とはつながらない' },
    '大津':   { none: true, src: '692 島式2面4線。渡り線なし' },
    '膳所':   { cross: 2, pairs: [['Down_Out', 'Down_In', 'r'], ['Up_In', 'Up_Out', 'l']],
                src: '692 草津側に片渡り2つ' },
    '石山':   { none: true, src: '692 転てつ器は外側線の待避線への出入口だけ' },
    '瀬田':   { none: true, src: '692 相対式2面2線' },
    '南草津': { none: true, src: '692 相対式2面2線' },
    '草津':   { cross: 3, pairs: [['Up_Out', 'Up_In'], ['Down_In', 'Down_Out', 'x', 'R'],
                                  ['Down_In', 'Up_In', 'x', 'L']],
                stubs: 1, src: '692 米原側に下り内↔上り内の両渡り。草津線は左の上' },
    '栗東':   { none: true, src: '691 相対式2面2線' },
    '守山':   { none: true, src: '691 相対式2面2線＋安全側線' },
    '野洲':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], stubs: 1,
                src: '691 2面3線。電留線は篠原側の上' },
    '篠原':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x', 'R']], src: '691 野洲側にY字の渡り線' },
    '近江八幡': { cross: 1, pairs: [['Up_Out', 'Down_Out', 'r']], stubs: 1, src: '691 安土側に片渡り1つ' },
    '安土':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'l', 'B']], src: '691 2面2線＋中線' },
    '能登川': { cross: 1, pairs: [['Up_Out', 'Down_Out', 'l']], src: '690 彦根側だけ' },
    '稲枝':   { none: true, src: '690 相対式2面2線' },
    '河瀬':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], src: '690 2面3線' },
    '南彦根': { none: true, src: '690 相対式2面2線' },
    '彦根':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], stubs: 1,
                src: '690 2面2線＋中線。近江鉄道は米原側の上' },
    '米原':   { cross: 1, stubs: 3, src: '690 醒ケ井も坂田と同じ画面左の外' },

    // ================================ 北陸本線  画像(700)(701)
    '坂田':   { none: true, src: '701 相対式2面2線' },
    '田村':   { none: true, src: '701 相対式2面2線＋側線' },
    '長浜':   { cross: 1, src: '701 留置線つき' },
    '虎姫':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'l']], src: '701 河毛側に片渡り1つ' },
    '河毛':   { none: true, src: '701 相対式2面2線' },
    '高月':   { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], src: '701 2面2線＋渡り線' },
    '木ノ本': { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], src: '700 2面3線' },
    '余呉':   { none: true, src: '700 相対式2面2線' },
    '近江塩津': { cross: 1, junctions: 2, src: '700/702 湖西線は木ノ本と同じ右側' },
    '新疋田': { cross: 1, pairs: [['Up_Out', 'Down_Out', 'x']], src: '700 2面2線＋渡り線' },
    '敦賀':   { cross: 1, stubs: 3, src: '700 南今庄は画面左の外、小浜線と車両区は右' },

    // ================================ 湖西線  画像(702)(703)
    '大津京':   { cross: 1, pairs: [['Kosei_Up', 'Kosei_Down', 'x', 'R']], src: '703 山科側には無い' },
    '唐崎':     { none: true, src: '703 島式1面2線' },
    '比叡山坂本': { none: true, src: '703 島式1面2線' },
    'おごと温泉': { none: true, src: '703 相対式2面2線。渡り線も待避線も無い' },
    '堅田':     { cross: 1, src: '703 2面4線。両側に渡り線' },
    '小野':     { none: true, src: '702 相対式2面2線' },
    '和邇':     { cross: 1, pairs: [['Kosei_Up', 'Kosei_Down', 'l', 'R']], src: '702 片渡り1つ' },
    '蓬莱':     { none: true, src: '702 相対式2面2線' },
    '志賀':     { none: true, src: '702 相対式2面2線' },
    '比良':     { none: true, src: '702 1面1線' },
    '近江舞子': { cross: 1, pairs: [['Kosei_Up', 'Kosei_Down', 'x', 'R']], src: '702 近江塩津側' },
    '北小松':   { none: true, src: '702 相対式2面2線' },
    '近江高島': { none: true, src: '702 相対式2面2線' },
    '安曇川':   { cross: 1, pairs: [['Kosei_Up', 'Kosei_Down', 'x', 'R']], src: '702 近江塩津側' },
    '新旭':     { none: true, src: '702 相対式2面2線' },
    '近江今津': { cross: 1, stubs: 1, src: '702 2面4線＋電留線 (駅の右の上)' },
    '近江中庄': { none: true, src: '702 相対式2面2線' },
    'マキノ':   { none: true, src: '702 相対式2面2線＋側線' },
    '永原':     { cross: 1, pairs: [['Kosei_Up', 'Kosei_Down', 'x', 'R']], src: '702 近江塩津側' },

    // ================================ JR宝塚線  画像(709)(710)
    '塚口':     { cross: 2, pairs: [['Fukuchi_Up', 'Fukuchi_Down', 'x', 'L'],
                                    ['Fukuchi_Up', 'Fukuchi_Down', 'l', 'R']],
                  src: '709 尼崎側に両渡り、猪名寺側に片渡り' },
    '猪名寺':   { none: true, src: '709 相対式2面2線' },
    '伊丹':     { none: true, src: '709 相対式2面2線' },
    '北伊丹':   { none: true, src: '709 島式1面2線＋貨物側線' },
    '川西池田': { none: true, src: '709 相対式2面2線。渡り線は無い' },
    '中山寺':   { none: true, src: '709 相対式2面2線' },
    '宝塚':     { cross: 2, pairs: [['Fukuchi_Up', 'Fukuchi_Down', 'r', 'L'],
                                    ['Fukuchi_Up', 'Fukuchi_Down', 'l', 'R']],
                  src: '709 中線つき。のどごとに片渡り1つ' },
    '生瀬':     { none: true, src: '709 相対式2面2線' },
    '西宮名塩': { none: true, src: '709 相対式2面2線' },
    '武田尾':   { none: true, src: '709 相対式2面2線' },
    '三田':     { none: true, src: '710 相対式2面2線＋側線' },
    '新三田':   { cross: 1, pairs: [['Fukuchi_Up', 'Fukuchi_Down', 'x', 'L']], stubs: 2,
                  src: '710 2面4線。両渡りは三田側、電留線は駅の右の上' },

    // ================================ JR東西線・片町線  画像(711)(712)
    '大阪天満宮': { none: true, src: '711 島式1面2線。渡り線なし' },
    '大阪城北詰': { none: true, src: '711 島式1面2線。渡り線なし' },
    '北新地':     { none: true, src: '711 島式1面2線。渡り線なし' },
    '新福島':     { none: true, src: '711 島式1面2線。渡り線なし' },
    '海老江':     { none: true, src: '711 島式1面2線。渡り線なし' },
    '御幣島':     { none: true, src: '711 島式1面2線。渡り線なし' },
    '加島':       { none: true, src: '711 島式1面2線。渡り線なし' },
    '京橋':       { cross: 1, stubs: 2, src: '711 引上線は大阪城北詰側' },
    '鴫野':       { cross: 0, stubs: 1, src: '712 おおさか東線は放出側の下' },
    '放出':       { cross: 1, stubs: 3, src: '712 おおさか東線・片町線・電留線はすべて徳庵側' }
};

/* 配線略図では図の端で切れていて読み切れなかった駅。
   正直に「未確認」として残す (REF に入れない)。 */
const NOT_READ = {
    '道場': 'スクリーンショット(709).png の右端で切れており、(710) は三田から始まる'
};

/* 実物の配線では方転できないのに SWITCHABLE_STATIONS / OVERTAKE_STATIONS に
   入っている駅。この2つは「転線できる駅」「待避できる駅」の表なので、
   入っていること自体は誤りではない。
   折り返しを作るかどうかは canReverseAt() が決める
   (js/03-stations.js / js/14-train-turnback.js)。 */
const KNOWN_NO_REVERSE = {
    '長岡京':     '下り外↔下り内 と 上り内↔上り外 の片渡りだけ (画像694)',
    '西宮':       '外側線の待避線への転てつ器だけ。上下をつなぐ渡り線が無い (画像698)',
    'おごと温泉': '相対式2面2線。渡り線も待避線も無い (画像703)',
    '川西池田':   '相対式2面2線。渡り線が無い (画像709)',
    '向日町':     '同じ向きどうしの渡り線だけ。折り返しは向日町操へ入る (画像694)',
    '茨木':       '島式2面4線＋上下の待避線。上下をつなぐ渡り線が無い (画像695)'
};


// ------------------------------------------------------------------ 1. 線路の実在
head('渡り線がつなぐ線路が、その駅に実際にあるか');
{
    const bad = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].crossovers || []).forEach(c => {
            [c[0], c[1]].forEach(tid => {
                if (!trackExistsAt(st, tid)) bad.push(st + ' ' + tid);
            });
        });
    }
    ok('存在しない線路との渡り線が無い', bad.length === 0, bad.join(' / '));
}

// ------------------------------------------------------------------ 2. 飛び越し
head('あいだの線路を飛び越す渡り線が無いか');
{
    const bad = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].crossovers || []).forEach(c => {
            const a = MAIN_ORDER.indexOf(c[0]), b = MAIN_ORDER.indexOf(c[1]);
            if (a < 0 || b < 0) return;                 // 分岐線どうしは対象外
            // 複々線の中で、間に線路があるのに直接つないでいる組
            const hasInner = trackExistsAt(st, 'Up_In') || trackExistsAt(st, 'Down_In');
            if (hasInner && Math.abs(a - b) > 1) {
                bad.push(st + ' ' + c[0] + '↔' + c[1]);
            }
        });
    }
    ok('複々線の中に「内側線を飛び越す渡り線」が無い', bad.length === 0, bad.join(' / '));
}

// ------------------------------------------------------------------ 3. 形と向き
head('渡り線の形と向きの書き方');
{
    const badShape = [], badSide = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].crossovers || []).forEach(c => {
            if (['x', 'l', 'r'].indexOf(c[2]) < 0) badShape.push(st + ' "' + c[2] + '"');
            if (c[3] !== undefined && ['L', 'R', 'B'].indexOf(c[3]) < 0) badSide.push(st + ' "' + c[3] + '"');
        });
    }
    ok('形は x (両渡り) / l / r のいずれか', badShape.length === 0, badShape.join(' '));
    ok('置く側は L / R / B のいずれか', badSide.length === 0, badSide.join(' '));
}

// ------------------------------------------------------------------ 4. 分岐
head('他線区との分岐が、その駅に来ている線区か');
{
    const bad = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].junctions || []).forEach(j => {
            [j[0], j[1]].forEach(tid => {
                if (!trackExistsAt(st, tid)) bad.push(st + ' ' + tid);
            });
            if (['in', 'out'].indexOf(j[2]) < 0) bad.push(st + ' 向き"' + j[2] + '"');
        });
    }
    ok('来ていない線区との分岐が無い', bad.length === 0, bad.join(' / '));
}

// ------------------------------------------------------------------ 5. 側線
head('側線・支線のつなぎ先');
{
    const bad = [];
    for (const st in TID_JUNCTIONS) {
        (TID_JUNCTIONS[st].stubs || []).forEach(sb => {
            if (!trackExistsAt(st, sb.from)) bad.push(st + ' ' + sb.from + ' (' + sb.label + ')');
            if (['L', 'R'].indexOf(sb.side) < 0) bad.push(st + ' 側"' + sb.side + '"');
        });
    }
    ok('存在しない線路から分かれる側線が無い', bad.length === 0, bad.join(' / '));
}

// ------------------------------------------------------------------ 6. 方転の設備
head('折り返す駅に方転できる設備があるか');
{
    /* 折り返しに使う駅 (SWITCHABLE_STATIONS / OVERTAKE_STATIONS) は、
       渡り線か引上線のどちらかを持っていないと向きを変えられない。 */
    const need = {};
    SWITCHABLE_STATIONS.forEach(n => { need[n] = true; });
    OVERTAKE_STATIONS.forEach(n => { need[n] = true; });
    const bad = [];
    Object.keys(need).forEach(st => {
        if (!STATION_PLATFORM_RULES[st]) return;          // 線路図の外の駅
        const def = TID_JUNCTIONS[st];
        const hasCross = !!(def && (def.crossovers || []).length);
        const hasDrawUp = stationDrawUpTracks(st).length > 0;
        if (!hasCross && !hasDrawUp && !KNOWN_NO_REVERSE[st]) bad.push(st);
    });
    ok('折り返す駅はすべて渡り線か引上線を持つ', bad.length === 0,
       bad.length + '駅: ' + bad.join(' '));
    const known = Object.keys(KNOWN_NO_REVERSE);
    console.log('  ※転線・待避はできるが方転はできない駅 ' + known.length + '駅' +
                ' (canReverseAt() が折り返しを止める):');
    known.forEach(k => console.log('      ' + k + ' — ' + KNOWN_NO_REVERSE[k]));
}

// ------------------------------------------------------------------ 6b. 方転できる駅
head('方転できる駅の判定が配線と合っているか');
{
    /* canReverseAt() は「上り側と下り側をつなぐ渡り線」「引上線」「車両基地」の
       どれかを持つ駅だけを true にする。ここでは
         ・同じ向きどうしの渡り線しか無い駅を true にしていないか
         ・配線略図で確かめた「できる駅」を false にしていないか
       の両方を見る。 */
    const dirOf = (t) => /^Up_|_Up$/.test(t) ? 1 : (/^Down_|_Down$/.test(t) ? -1 : 0);
    const bad = [];

    /* (1) 線路の定義 (js/03-stations.js の STATION_REVERSE_BY_CROSSOVER) と
           線路図の描画データ (js/40-tid-theme.js の TID_JUNCTIONS) が
           同じ内容か。
           ★方転できるかの判定は旅客向け画面 (index.html) でも要るので、
             描画データではなく線路の定義ファイル側を見るようにした。
             2つが食い違うと、画面と判定がずれるのでここで見張る。 */
    for (const st in TID_JUNCTIONS) {
        const cs = TID_JUNCTIONS[st].crossovers || [];
        const linked = cs.some(c => dirOf(c[0]) * dirOf(c[1]) < 0);
        if (linked && !STATION_REVERSE_BY_CROSSOVER[st]) {
            bad.push(st + ' 線路図には上下をつなぐ渡り線があるが、線路の定義に無い');
        }
    }
    for (const st in STATION_REVERSE_BY_CROSSOVER) {
        const cs = (TID_JUNCTIONS[st] || {}).crossovers || [];
        const linked = cs.some(c => dirOf(c[0]) * dirOf(c[1]) < 0);
        if (!linked) bad.push(st + ' 線路の定義にあるが、線路図に上下をつなぐ渡り線が無い');
        const n1 = STATION_REVERSE_BY_CROSSOVER[st].length;
        const n2 = cs.filter(c => dirOf(c[0]) * dirOf(c[1]) < 0).length;
        if (n1 !== n2) bad.push(st + ' 上下をつなぐ渡り線の数 定義=' + n1 + ' 線路図=' + n2);
    }
    ok('線路の定義と線路図で、上下をつなぐ渡り線が一致する', bad.length === 0, bad.join(' / '));

    // (2) 実物で方転できないと確かめた駅が false になっているか
    const wrong = Object.keys(STATION_NO_REVERSE_NOTE).filter(st => canReverseAt(st));
    ok('方転できないと確かめた駅が false になっている', wrong.length === 0,
       wrong.length ? (wrong.join(' ') + ' が true') : (Object.keys(STATION_NO_REVERSE_NOTE).length + '駅'));
    Object.keys(STATION_NO_REVERSE_NOTE).forEach(k =>
        console.log('      ' + k + ' — ' + STATION_NO_REVERSE_NOTE[k]));

    // (3) 引上線・車両基地で方転できる駅が true になっているか
    const musts = Object.keys(STATION_REVERSE_BY_DRAWUP).concat(['吹田', '芦屋', '須磨', '神戸',
        '西明石', '草津', '尼崎', '高槻', '放出', '京橋', '塚口', '宝塚', '新三田', '姫路', '米原']);
    const miss = musts.filter(st => !canReverseAt(st));
    ok('引上線・渡り線を確かめた駅はすべて方転できる', miss.length === 0, miss.join(' '));
    console.log('      吹田 … 下り内↔上り内の両渡り (画像696)');
    console.log('      高槻 … 京都方の内側線のあいだの引上線2本 (画像695)');

    // (4) 方転できる駅の数
    const all = STATIONS.map(x => x.name)
        .concat(Object.values(KOSEI_STATIONS_MAP))
        .concat(Object.values(FUKUCHI_STATIONS_MAP))
        .concat(Object.values(TOZAI_STATIONS_MAP));
    const rev = all.filter(canReverseAt);
    console.log('  方転できる駅: ' + rev.length + ' / 全 ' + all.length + ' 駅');
}

// ------------------------------------------------------------------ 7. 配線略図との照合
head('配線略図から書き起こした値との照合');
{
    const bad = [];
    let checked = 0;
    for (const st in REF) {
        const r = REF[st];
        const def = TID_JUNCTIONS[st] || {};
        checked++;
        const cross = (def.crossovers || []).length;
        if (r.cross !== undefined && cross !== r.cross) {
            bad.push(st + ' 渡り線 図=' + r.cross + ' 実装=' + cross);
        }
        const stubs = (def.stubs || []).length;
        if (r.stubs !== undefined && stubs !== r.stubs) {
            bad.push(st + ' 側線 図=' + r.stubs + ' 実装=' + stubs);
        }
        const junc = (def.junctions || []).length;
        if (r.junctions !== undefined && junc !== r.junctions) {
            bad.push(st + ' 分岐 図=' + r.junctions + ' 実装=' + junc);
        }
        if (r.none) {
            if (cross) bad.push(st + ' 図に渡り線が無いのに ' + cross + '組ある');
        }
        if (r.pairs) {
            r.pairs.forEach(pr => {
                /* pr = [上側, 下側, 形, 置く場所]。形と場所は省略できる。
                   ★「転てつ器はあるが向きが逆」を見つけるための照合なので、
                     形 (両渡り x / 片渡り l・r) と置く場所 (L/R/B) まで見る。 */
                const sideOf = (c) => c[3] ? c[3] : (c[2] === 'x' ? 'B' : 'L');
                const hit = (def.crossovers || []).filter(c =>
                    (c[0] === pr[0] && c[1] === pr[1]) || (c[0] === pr[1] && c[1] === pr[0]));
                if (!hit.length) {
                    bad.push(st + ' ' + pr[0] + '↔' + pr[1] + ' が無い');
                    return;
                }
                if (pr[2] && !hit.some(c => c[2] === pr[2])) {
                    bad.push(st + ' ' + pr[0] + '↔' + pr[1] + ' の形 図=' + pr[2] +
                             ' 実装=' + hit.map(c => c[2]).join(','));
                    return;
                }
                if (pr[3]) {
                    const m = hit.filter(c => !pr[2] || c[2] === pr[2]);
                    if (!m.some(c => sideOf(c) === pr[3])) {
                        bad.push(st + ' ' + pr[0] + '↔' + pr[1] + ' の場所 図=' + pr[3] +
                                 ' 実装=' + m.map(sideOf).join(','));
                    }
                }
            });
        }
    }
    console.log('  照合できた駅: ' + checked + ' / 転てつ器を定義した駅 ' +
                Object.keys(TID_JUNCTIONS).length);
    ok('書き起こした駅の照合がすべて通っている', bad.length === 0, bad.join(' / '));
}

// ------------------------------------------------------------------ 進み具合
head('書き起こしの進み具合');
{
    const all = STATIONS.map(s => s.name)
        .concat(Object.values(KOSEI_STATIONS_MAP))
        .concat(Object.values(FUKUCHI_STATIONS_MAP))
        .concat(Object.values(TOZAI_STATIONS_MAP));
    const withDef = all.filter(n => TID_JUNCTIONS[n]).length;
    console.log('  転てつ器を定義した駅: ' + withDef + ' / 全 ' + all.length + ' 駅');
    console.log('  配線略図と照合できた駅: ' + Object.keys(REF).length + ' 駅');
    const notRead = Object.keys(NOT_READ);
    console.log('  読み切れなかった駅: ' + notRead.length + ' 駅');
    notRead.forEach(k => console.log('      ' + k + ' — ' + NOT_READ[k]));
    const left = all.filter(n => !REF[n] && !NOT_READ[n]);
    if (left.length) console.log('  照合していない駅: ' + left.join(' '));
}

console.log('');
console.log(failures === 0 ? '>>> すべて合格' : '>>> ' + failures + ' 件 不合格');
