/* ==================================================================
   夜間作業の詳細 (利用者の指摘 ② 2026-10)
   ==================================================================
   js/38b-night-work.js の「終電後の線路閉鎖」に足したもの。

   ■ 1. 駅・ホームの作業 (STATION_WORK_KINDS)
     ごく小さな作業 (消火器の点検・時計の電池交換・点字ブロックの張り替え …) から、番線の線路内の作業
     (停止位置目標の移設・ホーム下の待避スペースの清掃・建築限界の測定 …) まで 40種あまり。毎晩 6〜10件。
       ・ホームの上だけの作業 … 列車を止めない (列車見張員を置き、列車の合間に作業する)
       ・番線の線路内の作業 … その番線だけ使用停止にする (laneClosures)。2線以上ある線路の番線に限り、
         最終列車が通って番線が空いてから始め、4:05 までに必ず使用停止を解く
   ■ 2. 工臨 (レール交換・道床更換の材料を運ぶ機関車の列車)
     作業の始まり (1:00〜1:30) から所要を逆算し、向日町操・宮原操・網干から 23時台に出す。
     例: 1:00 から芦屋〜住吉の外側線でロングレール交換 → 22:50ごろ 宮原操発 (DD51 + チキ5500形)。
       ・手前の待避のできる駅 (2線以上) で線路閉鎖の承認を待ち、承認されたら区間に入って作業の場所で止まる
       ・作業の終わりの30分前に区間を出て、先の駅で折り返し、閉鎖の明けを待って元の車両所へ帰る
       ・機関車・貨車がその場所に居なければ、保守基地のレール運搬車 (保守用車) で運ぶ
   ■ 3. 保守用車 (マルタイ・レール削正車・探傷車・架線作業車・軌陸車 …)
     線路閉鎖が承認されたら、区間の手前の駅 (保守基地) から出場し、作業の場所で作業して、
     作業の終わりの30分前に区間の先の駅 (保守基地) へ収容する。
   ■ 4. 確認車・確認の試運転 (大きな作業のあと)
     レール交換・分岐器更新・道床のつき固め/更換・まくらぎ交換・トロリ線の張り替えのあとは、
     閉鎖を解く25分前に確認車 (軌道モータカー) が区間を走って線路の状態を確かめる (閉鎖が明けたあとは出さない)。
     軌道の作業のあとは、始発から1時間ほど 45km/h の徐行を置く (道床が落ち着くまで)。
   ■ 5. 作業の報告 (nightWorkReport)
     線路図の線閉の札・駅の「工」の印を押すと、作業ごとの報告を出す:
       レールの種類 (ロングレール / 定尺レール)・レール長・キロ程 (概算)・作業の状況・現場責任者・
       担当の保線区 (電力区・信号通信区)・作業の種類・作業員数・施工会社・使う工臨/保守用車・時刻・
       線路閉鎖の番号・き電停止の有無・列車見張員・確認車・徐行
     名前・会社名はシミュレーター用の架空のものです。 */

/* ------------------------------------------------------------------ 作業の種類を足す */
NIGHT_WORK_KINDS.push(
    { kind: "レール交換 (定尺レール)",                   who: "保線区",               w: 1.2, dur: [1.8, 2.6] },
    { kind: "ロングレールの再設定 (緊張器による応力調整)", who: "保線区",              w: 0.6, dur: [2.0, 2.8], on: "main" },
    { kind: "レール溶接 (テルミット溶接)",               who: "保線区・工事会社",     w: 0.8, dur: [1.6, 2.4] },
    { kind: "伸縮継目の点検・交換",                     who: "保線区",               w: 0.6, dur: [1.6, 2.4] },
    { kind: "踏切の軌道内舗装の補修",                   who: "保線区・工事会社",     w: 0.6, dur: [1.8, 2.6], on: "branch" },
    { kind: "架線の高さ・偏位の測定",                   who: "電力区",               w: 0.8, dur: [1.0, 1.6] },
    { kind: "き電線の張り替え",                         who: "電力区・工事会社",     w: 0.5, dur: [2.2, 3.0] },
    { kind: "軌道回路の絶縁継目の交換",                 who: "信号通信区",           w: 0.8, dur: [1.2, 2.0] },
    { kind: "信号機の LED 化工事",                      who: "信号通信区・工事会社", w: 0.6, dur: [1.6, 2.4] }
);

/* 作業ごとの細かい決まり。veh … 使う保守用車 / rail … レールの作業 (ロングレール long・定尺 short) /
   ballast … 道床の作業 (工臨はホキ) / verify … 確認車を走らせる / slow … 明けに徐行を置く / feed … き電停止 */
const NW_KIND_DETAIL = {
    "レール交換 (ロングレール)":     { veh: ["railcart"], rail: "long", verify: true, slow: true },
    "レール交換 (定尺レール)":       { veh: ["railcart"], rail: "short", verify: true, slow: true },
    "ロングレールの再設定 (緊張器による応力調整)": { veh: ["railcart"], rail: "long", verify: true },
    "レール溶接 (テルミット溶接)":   { veh: ["railcart"], rail: "long", verify: true },
    "レール削正 (削正車)":           { veh: ["grinder"] },
    "レール探傷車による検査":        { veh: ["flaw"] },
    "軌道検測 (検測車)":             { veh: ["kiya141"] },
    "分岐器の更新工事":              { veh: ["railcart", "mtt"], verify: true, slow: true },
    "道床のつき固め (マルタイ)":     { veh: ["mtt"], verify: true, slow: true },
    "道床の更換 (バラスト交換)":     { veh: ["mtt"], ballast: true, verify: true, slow: true },
    "まくらぎの交換":                { veh: ["railcart"], verify: true, slow: true },
    "伸縮継目の点検・交換":          { veh: ["railcart"], verify: true },
    "架線・き電線の点検":            { veh: ["tower"], feed: true },
    "トロリ線の張り替え":            { veh: ["tower", "tower"], feed: true, verify: true },
    "がいしの交換・清掃":            { veh: ["tower"], feed: true },
    "き電停止を伴う変電設備の切替試験": { feed: true },
    "架線の高さ・偏位の測定":        { veh: ["tower"], feed: true },
    "き電線の張り替え":              { veh: ["tower"], feed: true, verify: true },
    "橋りょうの点検 (高所作業車)":   { veh: ["kiriku"] },
    "高架橋の耐震補強工事":          { veh: ["kiriku"] },
    "のり面・防音壁の工事":          { veh: ["kiriku"] },
    "沿線の樹木の伐採":              { veh: ["kiriku"] },
    "ホーム柵の設置工事":            { veh: ["kiriku"] },
    "駅の改良工事 (跨線橋)":         { veh: ["kiriku"], feed: true }
};
const NW_VERIFY_LEAD = 1800;          // 作業の終わりの30分前に保守用車は区間を出る
const NW_CONFIRM_LEAD = 1500;         // 25分前に確認車が区間に入る

/* 保守用車・確認車の専用車両 (js/38b-night-work.js の WORK_STOCK_DEFS に足す。仕業が終われば戻る) */
(function () {
    const mk = (type, ids, base) => ids.map(id => ({ type: type, id: id, cars: 1, base: base }));
    WORK_STOCK_DEFS.mtt      = mk("08-475形 マルタイ (保守用車)", ["MTT-11", "MTT-12", "MTT-21", "MTT-31"], "保守基地");
    WORK_STOCK_DEFS.railcart = mk("レール運搬車 (軌道モータカー + トロ)", ["MC-101", "MC-102", "MC-201", "MC-301", "MC-302"], "保守基地");
    WORK_STOCK_DEFS.grinder  = mk("レール削正車 (保守用車)", ["RG-1", "RG-2"], "保守基地");
    WORK_STOCK_DEFS.flaw     = mk("レール探傷車 (保守用車)", ["UT-1", "UT-2"], "保守基地");
    WORK_STOCK_DEFS.tower    = mk("架線作業車 (タワー車)", ["TW-11", "TW-12", "TW-21", "TW-22", "TW-31"], "電力区");
    WORK_STOCK_DEFS.kiriku   = mk("軌陸車 (高所作業車)", ["KR-1", "KR-2", "KR-3"], "施設区");
    WORK_STOCK_DEFS.confirm  = mk("確認車 (軌道モータカー)", ["CK-1", "CK-2", "CK-3", "CK-4", "CK-5", "CK-6"], "保守基地");
    WORK_STOCK_DEFS.kiya141  = [{ type: "キヤ141系 (軌道・電気総合試験車)", id: "キヤ141-1", cars: 2, base: "吹田総合車両所" }];
})();
const NW_VEH_LABEL = {
    mtt: "マルタイ", railcart: "レール運搬車", grinder: "レール削正車", flaw: "レール探傷車", tower: "架線作業車",
    kiriku: "軌陸車", confirm: "確認車", kiya141: "検測車 (キヤ141系)"
};

/* ------------------------------------------------------------------ 駅・ホームの作業 */
/* track … 番線の線路内に入る (その番線を使用停止にする)。dur … 時間 [時間]。who … 受け持ち。n … 作業員数 */
const STATION_WORK_KINDS = [
    // ホームの上 (列車を止めない)
    { kind: "消火器の点検",                         who: "駅",         dur: [0.3, 0.6], n: [1, 2] },
    { kind: "ホームの時計の時刻合わせ・電池交換",     who: "駅",         dur: [0.3, 0.5], n: [1, 2] },
    { kind: "ホームの非常停止ボタンの動作試験",       who: "信号通信区", dur: [0.5, 1.0], n: [2, 3] },
    { kind: "列車接近表示器の点検",                 who: "信号通信区", dur: [0.5, 1.0], n: [2, 3] },
    { kind: "発車標 (LED) の取り替え",               who: "工事会社",   dur: [1.2, 2.2], n: [3, 6] },
    { kind: "自動放送装置の調整",                   who: "信号通信区", dur: [0.6, 1.2], n: [2, 3] },
    { kind: "点字ブロック (内方線付き) の張り替え",   who: "工事会社",   dur: [1.5, 2.8], n: [4, 8] },
    { kind: "ホーム床面のひび割れ補修",             who: "工事会社",   dur: [1.2, 2.4], n: [3, 6] },
    { kind: "ホームの白線・乗車位置の塗り直し",       who: "工事会社",   dur: [1.0, 2.0], n: [3, 5] },
    { kind: "ホーム上屋の雨どいの清掃・補修",         who: "施設区",     dur: [1.0, 2.0], n: [3, 5] },
    { kind: "ホーム照明の LED 化工事",               who: "工事会社",   dur: [1.5, 2.6], n: [3, 6] },
    { kind: "駅名標・案内サインの取り替え",           who: "工事会社",   dur: [1.0, 2.0], n: [2, 4] },
    { kind: "防犯カメラの増設",                     who: "工事会社",   dur: [1.2, 2.2], n: [2, 4] },
    { kind: "鳩よけネットの張り替え",               who: "施設区",     dur: [0.8, 1.6], n: [2, 4] },
    { kind: "ホームのベンチ・柵の移設",             who: "工事会社",   dur: [0.8, 1.6], n: [3, 5] },
    { kind: "エレベーターの定期点検",               who: "工事会社",   dur: [1.0, 2.0], n: [2, 3] },
    { kind: "エスカレーターの部品交換",             who: "工事会社",   dur: [1.5, 2.8], n: [2, 4] },
    { kind: "待合室の空調の点検",                   who: "施設区",     dur: [0.5, 1.0], n: [1, 2] },
    { kind: "ホームの高圧洗浄",                     who: "工事会社",   dur: [1.0, 2.0], n: [2, 4] },
    { kind: "ホーム端の転落防止柵の補修",           who: "施設区",     dur: [0.8, 1.6], n: [2, 4] },
    { kind: "ホームドアの定期点検 (センサー・扉)",   who: "工事会社",   dur: [1.0, 2.0], n: [2, 4] },
    { kind: "ホームのスピーカーの交換",             who: "信号通信区", dur: [0.6, 1.2], n: [2, 3] },
    { kind: "旅客案内ディスプレイの更新",           who: "工事会社",   dur: [0.8, 1.6], n: [2, 3] },
    // 番線の線路内 (その番線を使用停止にする)
    { kind: "停止位置目標の移設",                   who: "保線区",     dur: [0.8, 1.6], n: [3, 5], track: true },
    { kind: "ホーム下の待避スペースの清掃",         who: "保線区",     dur: [0.6, 1.2], n: [3, 5], track: true },
    { kind: "番線の線路内の清掃 (ごみ・落とし物の回収)", who: "保線区", dur: [0.5, 1.0], n: [2, 4], track: true },
    { kind: "番線の軌道回路の絶縁測定",             who: "信号通信区", dur: [0.6, 1.2], n: [2, 3], track: true },
    { kind: "駅構内の ATS 地上子の点検",             who: "信号通信区", dur: [0.6, 1.2], n: [2, 3], track: true },
    { kind: "出発信号機の LED 化",                   who: "信号通信区", dur: [1.2, 2.2], n: [3, 5], track: true },
    { kind: "ホーム縁端の削り (車両との離れの調整)",   who: "工事会社",   dur: [1.5, 2.6], n: [4, 8], track: true },
    { kind: "ホームのかさ上げ工事",                 who: "工事会社",   dur: [1.8, 2.8], n: [6, 12], track: true },
    { kind: "ホームドアと停止位置の合わせ試験",       who: "工事会社",   dur: [1.0, 1.8], n: [3, 5], track: true },
    { kind: "番線のレール塗油器の点検",             who: "保線区",     dur: [0.5, 1.0], n: [2, 3], track: true },
    { kind: "番線の架線金具の点検",                 who: "電力区",     dur: [0.8, 1.4], n: [3, 5], track: true },
    { kind: "ホーム下の排水溝の清掃",               who: "保線区",     dur: [0.8, 1.4], n: [3, 5], track: true },
    { kind: "建築限界の測定",                       who: "施設区",     dur: [0.8, 1.4], n: [2, 4], track: true },
    { kind: "ホーム下の転落検知マットの点検",       who: "信号通信区", dur: [0.6, 1.2], n: [2, 3], track: true },
    { kind: "番線のレール締結装置の締め直し",       who: "保線区",     dur: [0.8, 1.6], n: [3, 6], track: true },
    { kind: "番線の分岐器の給油",                   who: "保線区",     dur: [0.5, 1.0], n: [2, 3], track: true }
];
const SW_END_CAP = 4.08;            // 4:05 までに駅の作業を終える
const SW_PER_NIGHT = [6, 10];

/* ------------------------------------------------------------------ 報告書の材料 */
const NW_SURNAMES = ["山本", "田中", "中村", "小林", "吉田", "山田", "松本", "井上", "木村", "清水", "山崎", "池田", "橋本",
    "阿部", "石川", "前田", "藤田", "岡田", "後藤", "長谷川", "村上", "近藤", "坂本", "遠藤", "青木", "藤井", "西村", "福田",
    "太田", "三浦", "藤原", "岡本", "松田", "中川", "中野", "原田", "小野", "竹内", "金子", "和田"];
const NW_CONTRACTORS = {
    track: ["淀川軌道工業", "六甲線路建設", "播磨軌道", "近江線路工業", "摂津レール工業"],
    electric: ["西日本電設工業", "琵琶湖架線工事", "大和電気工事"],
    signal: ["関西信号通信工業", "淀屋橋信通工事"],
    facility: ["大阪橋梁工業", "神戸施設工業", "比叡土木", "千里建設"]
};
const _nwPick = (a) => a[Math.floor(Math.random() * a.length)];
const _nwInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function nwCategory(who) {
    if (/電力/.test(who)) return "electric";
    if (/信号/.test(who)) return "signal";
    if (/施設|工事会社/.test(who) && !/保線/.test(who)) return "facility";
    return "track";
}

/* キロ程 (概算)。線区ごとの起点からのキロを、主な駅の値から駅の並びで割り振る。
   ★実際のキロ程とは数百メートルずれることがある (報告書には「概算」と書く) */
const NW_KM_MAIN = [
    // [駅, キロ, 線名]  … 東海道本線 (東京起点) / 山陽本線 (神戸起点)
    ["米原", 445.9, "東海道本線"], ["彦根", 451.9, "東海道本線"], ["能登川", 466.4, "東海道本線"], ["近江八幡", 474.2, "東海道本線"],
    ["野洲", 481.8, "東海道本線"], ["草津", 491.0, "東海道本線"], ["大津", 503.6, "東海道本線"], ["京都", 513.6, "東海道本線"],
    ["高槻", 535.7, "東海道本線"], ["茨木", 542.5, "東海道本線"], ["吹田", 548.2, "東海道本線"], ["新大阪", 552.6, "東海道本線"],
    ["大阪", 556.4, "東海道本線"], ["尼崎", 564.2, "東海道本線"], ["芦屋", 575.8, "東海道本線"], ["三ノ宮", 586.4, "東海道本線"],
    ["神戸", 589.5, "東海道本線"], ["兵庫", 1.8, "山陽本線"], ["須磨", 8.0, "山陽本線"], ["垂水", 14.7, "山陽本線"],
    ["明石", 22.8, "山陽本線"], ["西明石", 26.3, "山陽本線"], ["大久保", 29.3, "山陽本線"], ["加古川", 40.0, "山陽本線"],
    ["姫路", 54.8, "山陽本線"], ["網干", 64.6, "山陽本線"], ["相生", 74.6, "山陽本線"], ["上郡", 89.6, "山陽本線"]
];
const NW_KM_BRANCH = {
    hokuriku: { line: "北陸本線", pts: [["米原", 0], ["長浜", 7.7], ["近江塩津", 37.0], ["敦賀", 45.9]] },
    kosei:    { line: "湖西線",   pts: [["山科", 0], ["大津京", 5.4], ["堅田", 15.7], ["近江舞子", 29.8], ["近江今津", 53.0], ["永原", 66.6], ["近江塩津", 74.1]] },
    fukuchi:  { line: "福知山線", pts: [["尼崎", 0], ["塚口", 2.3], ["伊丹", 7.3], ["川西池田", 12.4], ["宝塚", 17.6], ["三田", 33.5], ["新三田", 37.6]] },
    tozai:    { line: "JR東西線", pts: [["京橋", 0], ["北新地", 4.6], ["海老江", 7.6], ["加島", 10.5], ["尼崎", 12.5]] },
    katamachi:{ line: "片町線",   pts: [["木津", 0], ["同志社前", 7.4], ["京田辺", 11.0], ["松井山手", 17.6], ["長尾", 19.6], ["四条畷", 29.2], ["住道", 33.0], ["放出", 40.0], ["京橋", 44.8]] },
    ako:      { line: "赤穂線",   pts: [["相生", 0], ["西相生", 2.3], ["坂越", 6.3], ["播州赤穂", 10.5]] },
    hoppo:    { line: "東海道本線 (北方貨物線)", pts: [["吹田貨", 0], ["宮原操", 9.4]] }
};
/** 駅の並びの位置 (線区の中の順番) */
function _nwPosIn(map, name) { for (const k in map) if (map[k] === name) return Number(k); return null; }
function _nwKmBranch(key, pos, name) {
    const B = NW_KM_BRANCH[key];
    const pts = B.pts.map(([n, km]) => ({ km: km, p: pos(n) })).filter(x => x.p !== null);
    const p = pos(name);
    if (p === null || pts.length < 2) { const hit = B.pts.find(x => x[0] === name); return hit ? { line: B.line, km: hit[1] } : null; }
    pts.sort((a, b) => a.p - b.p);
    let a = pts[0], b = pts[pts.length - 1];
    for (let i = 0; i + 1 < pts.length; i++) if (p >= pts[i].p && p <= pts[i + 1].p) { a = pts[i]; b = pts[i + 1]; break; }
    const f = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p);
    return { line: B.line, km: a.km + (b.km - a.km) * f };
}
/** その駅の (線名, キロ程)。分からなければ null */
function nwKmOf(name, trackId) {
    const tid = trackId || "";
    if (/Hoppo/.test(tid) || name === "宮原操" || name === "吹田貨") {
        const hit = NW_KM_BRANCH.hoppo.pts.find(x => x[0] === name);
        if (hit) return { line: NW_KM_BRANCH.hoppo.line, km: hit[1] };
    }
    if (/^Kosei/.test(tid) || (KOSEI_STATIONS_MAP && _nwPosIn(KOSEI_STATIONS_MAP, name) !== null))
        return _nwKmBranch("kosei", n => n === "山科" ? -1 : n === "近江塩津" ? 999 : _nwPosIn(KOSEI_STATIONS_MAP, n), name);
    if (/^Fukuchi/.test(tid) || _nwPosIn(FUKUCHI_STATIONS_MAP, name) !== null)
        return _nwKmBranch("fukuchi", n => n === "尼崎" ? -999 : (_nwPosIn(FUKUCHI_STATIONS_MAP, n) === null ? null : -_nwPosIn(FUKUCHI_STATIONS_MAP, n)), name);
    if (_nwPosIn(TOZAI_STATIONS_MAP, name) !== null || /^Tozai/.test(tid)) {
        const kyo = _nwPosIn(TOZAI_STATIONS_MAP, "京橋"), p = _nwPosIn(TOZAI_STATIONS_MAP, name);
        if (p !== null && p <= kyo) return _nwKmBranch("tozai", n => n === "尼崎" ? -999 : (_nwPosIn(TOZAI_STATIONS_MAP, n) === null ? null : -_nwPosIn(TOZAI_STATIONS_MAP, n)), name);
        return _nwKmBranch("katamachi", n => (_nwPosIn(TOZAI_STATIONS_MAP, n) === null ? null : -_nwPosIn(TOZAI_STATIONS_MAP, n)), name);
    }
    if (_nwPosIn(AKO_STATIONS_MAP, name) !== null || /^Ako/.test(tid))
        return _nwKmBranch("ako", n => n === "相生" ? 999 : _nwPosIn(AKO_STATIONS_MAP, n) === null ? null : -_nwPosIn(AKO_STATIONS_MAP, n), name);
    if (["長浜", "虎姫", "河毛", "高月", "木ノ本", "余呉", "近江塩津", "新疋田", "敦賀", "田村", "坂田"].indexOf(name) >= 0 && STATION_MAP[name] !== undefined)
        return _nwKmBranch("hokuriku", n => STATION_MAP[n] !== undefined ? STATION_MAP[n] : null, name);
    const idx = STATION_MAP[name];
    if (idx === undefined) return null;
    const pts = NW_KM_MAIN.map(([n, km, line]) => ({ n, km, line, i: STATION_MAP[n] })).filter(x => x.i !== undefined).sort((a, b) => a.i - b.i);
    const hit = pts.find(x => x.i === idx);
    if (hit) return { line: hit.line, km: hit.km };
    for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        if (idx > a.i && idx < b.i) {
            // 神戸をまたぐ所は線名とキロの起点が変わる
            if (a.line !== b.line) return { line: b.line, km: b.km * (idx - a.i) / (b.i - a.i) };
            return { line: a.line, km: a.km + (b.km - a.km) * (idx - a.i) / (b.i - a.i) };
        }
    }
    return null;
}
function nwKmText(km) {
    if (km === null || km === undefined || isNaN(km)) return "—";
    const k = Math.floor(km), m = Math.round((km - k) * 1000);
    return `${k}k${String(Math.min(999, m)).padStart(3, "0")}m`;
}
/** 担当する区所の地域名 */
function nwAreaOf(name, trackId) {
    const tid = trackId || "";
    if (/^Kosei/.test(tid)) { const p = _nwPosIn(KOSEI_STATIONS_MAP, name); return (p !== null && p > _nwPosIn(KOSEI_STATIONS_MAP, "近江舞子")) ? "近江今津" : "大津"; }
    if (/^Fukuchi/.test(tid) || _nwPosIn(FUKUCHI_STATIONS_MAP, name) !== null) return "宝塚";
    if (/^Tozai/.test(tid) || _nwPosIn(TOZAI_STATIONS_MAP, name) !== null) {
        const p = _nwPosIn(TOZAI_STATIONS_MAP, name);
        if (p !== null && p <= _nwPosIn(TOZAI_STATIONS_MAP, "京橋")) return "大阪";
        return (p !== null && p >= _nwPosIn(TOZAI_STATIONS_MAP, "長尾")) ? "京田辺" : "放出";
    }
    if (/^Ako/.test(tid) || _nwPosIn(AKO_STATIONS_MAP, name) !== null) return "姫路";
    if (/Hoppo/.test(tid) || name === "宮原操" || name === "吹田貨") return "吹田";
    const i = STATION_MAP[name];
    if (i === undefined) return "大阪";
    if (i >= STATION_MAP["能登川"]) return "米原";
    if (i >= STATION_MAP["草津"]) return "草津";
    if (i >= STATION_MAP["京都"]) return "京都";
    if (i >= STATION_MAP["高槻"]) return "高槻";
    if (i >= STATION_MAP["吹田"]) return "吹田";
    if (i >= STATION_MAP["尼崎"]) return "大阪";
    if (i >= STATION_MAP["須磨"]) return "神戸";
    if (i >= STATION_MAP["西明石"]) return "明石";
    if (i >= STATION_MAP["姫路"]) return "加古川";
    return "姫路";
}
function nwOfficeName(who, area) {
    const c = nwCategory(who);
    if (c === "electric") return area + "電力区";
    if (c === "signal") return area + "信号通信区";
    if (/施設区/.test(who) || c === "facility") return area + "施設区";
    if (/^駅$/.test(who)) return area + "駅 (駅管理)";
    return area + "保線区";
}

/** 線路閉鎖の作業に報告の材料を付ける (計画のとき1回) */
function nwAttachDetail(g, w) {
    const k = w.kind, s = w.site;
    const d = NW_KIND_DETAIL[k.kind] || {};
    const tid = s.tracks[0];
    const area = nwAreaOf(s.from, tid);
    const kmA = nwKmOf(s.from, tid), kmB = nwKmOf(s.to, tid);
    const cat = nwCategory(k.who);
    let len = _nwInt(4, 20) * 25;                        // 作業の延長 [m]
    const det = {
        id: "nw" + (++g.ops._nwDetailSeq || (g.ops._nwDetailSeq = 1)),
        kind: k.kind, who: k.who, cat: cat, office: nwOfficeName(k.who, area),
        line: s.line, from: s.from, to: s.to, tracks: s.tracks.map(trackLabelOf).join("・"),
        supervisor: "工事管理者 " + _nwPick(NW_SURNAMES), closureChief: "線路閉鎖責任者 " + _nwPick(NW_SURNAMES),
        lookouts: _nwInt(1, 3), workers: cat === "track" ? _nwInt(12, 36) : cat === "electric" ? _nwInt(8, 20) : cat === "signal" ? _nwInt(4, 12) : _nwInt(6, 18),
        contractor: /工事会社/.test(k.who) || Math.random() < 0.6 ? _nwPick(NW_CONTRACTORS[cat] || NW_CONTRACTORS.track) : "(直営)",
        feed: !!d.feed, verify: !!d.verify, slow: !!d.slow, frac: 0.2 + Math.random() * 0.6
    };
    if (d.rail === "long") {
        len = _nwInt(8, 24) * 25;
        det.rail = { type: "ロングレール", weight: "60kgレール", len: len, note: `交換延長 ${len}m (溶接 ${_nwInt(2, 4)}か所・テルミット溶接)` };
    } else if (d.rail === "short") {
        const n = _nwInt(2, 8);
        len = n * 25;
        det.rail = { type: "定尺レール", weight: "50kgNレール", len: len, note: `25m × ${n}本 (継目板・ボルトとも交換)` };
    }
    if (kmA && kmB && kmA.line === kmB.line) {
        const lo = Math.min(kmA.km, kmB.km), hi = Math.max(kmA.km, kmB.km);
        const c = lo + (hi - lo) * det.frac;
        det.kmLine = kmA.line;
        det.kmFrom = Math.max(lo, c - len / 2000); det.kmTo = Math.min(hi, c + len / 2000);
    } else if (kmA) { det.kmLine = kmA.line; det.kmFrom = kmA.km; det.kmTo = kmA.km + len / 1000; }
    det.vehicles = (d.veh || []).map(v => NW_VEH_LABEL[v] || v);
    if (d.verify) det.vehicles.push("確認車");
    w.detail = det;
    w.vehKinds = (d.veh || []).slice();
    return det;
}

/* ------------------------------------------------------------------ 工臨 (レール・バラストの輸送) */
/* 機関車の居る場所と、そこから出る線路。dir … その向きに出る (1 上り = 東 / -1 下り = 西) */
const NW_RAIL_BASES = [
    { at: "向日町操", loco: "de10", dir: -1, track: "Down_Out" },
    { at: "向日町操", loco: "de10", dir: 1,  track: "Up_Out" },
    { at: "宮原操",   loco: "dd51", dir: -1, track: "Down_Out" },
    { at: "宮原操",   loco: "ef65", dir: -1, track: "Down_Out" },
    { at: "網干",     loco: "ef65", dir: 1,  track: "Up_Out" }
];
/** 工臨の段取りを決める (計画のとき)。外側線・複線の本線の作業だけ (内側線・分岐線は保守用車で運ぶ) */
function nwPlanRailTrain(g, w) {
    const d = NW_KIND_DETAIL[w.kind.kind] || {};
    if (!d.rail && !d.ballast) return null;
    if (globalThis.__NO_NW_RAIL_TRAIN) return null;
    const tid = w.site.tracks[0];
    if (!/^(Up|Down)_Out$/.test(tid)) return null;
    const dir = trackDirOf(tid);
    const a = stationBlockOn(g, tid, w.site.from), b = stationBlockOn(g, tid, w.site.to);
    if (!a || !b) return null;
    const entry = (a.index - b.index) * dir < 0 ? a : b, exit = entry === a ? b : a;
    const entryName = blockStationName(entry), exitName = blockStationName(exit);
    // 待機駅: 区間の手前で、2線以上ある駅 (最終列車の邪魔にならない)
    const blks = g.trackMgr.blocks[tid];
    let wait = null;
    for (let k = 0; k <= UNITS_PER_STATION * 6; k++) {
        const x = blks[entry.index - dir * k];
        if (!x || x.x === -1000) break;
        if (isRealStationBlock(x) && x.lanes.length >= 2) { wait = x; break; }
    }
    if (!wait) return null;
    // 機関車の居る場所: 待機駅より手前 (進む向きの後ろ) にあって、同じ線路でつながる所
    const cands = NW_RAIL_BASES.filter(B => B.dir === dir && (B.track === tid)).map(B => {
        const bi = fleetIndexOf(B.at);
        const dist = bi === null ? null : (wait.index / UNITS_PER_STATION - bi) * dir;
        return { B: B, dist: dist };
    }).filter(x => x.dist !== null && x.dist > 0).sort((p, q) => p.dist - q.dist);
    if (!cands.length) return null;
    const B = cands[0].B;
    const runSec = (cands[0].dist * UNITS_PER_STATION) * (BLOCK_RUN_SEC["臨時"] || BLOCK_RUN_SEC["回送"] || 45) * 1.3 + 900;
    return { base: B.at, loco: B.loco, cars: d.ballast ? "hoki" : "chiki", dir: dir, track: tid,
             waitAt: blockStationName(wait), entry: entryName, exit: exitName, runSec: runSec };
}

/* ------------------------------------------------------------------ 計画 (planNightWorks に重ねる) */
(function () {
    const basePlan = OperationsManager.prototype.planNightWorks;
    OperationsManager.prototype.planNightWorks = function (ct) {
        const out = basePlan.call(this, ct);
        const g = this.game;
        for (const w of out) {
            nwAttachDetail(g, w);
            /* レールの作業は 1:00〜1:30 に始める (工臨を 23時台に出して間に合わせる)。
               貨物列車の走る区間は 38b の決めた時刻 (貨物列車の合間) のまま */
            const d = NW_KIND_DETAIL[w.kind.kind] || {};
            if ((d.rail || d.ballast) && !w.freight) w.from = w.base + (1.0 + Math.random() * 0.5) * 3600;
            const rt = nwPlanRailTrain(g, w);
            if (rt) {
                w.railTrain = rt;
                rt.depart = Math.max(w.base - 70 * 60, w.from - rt.runSec);          // 早くても 22:50
                w.detail.railTrainText = `工臨 (${rt.loco === "de10" ? "DE10形" : rt.loco === "dd51" ? "DD51形" : "EF65形"} + ` +
                    `${rt.cars === "hoki" ? "ホキ800形 バラスト散布" : "チキ5500形 ロングレール輸送"}) ${rt.base}発 ` +
                    `${stabledClock((rt.depart / 3600) % 24)} → ${rt.waitAt}で承認待ち → 作業後 ${rt.exit}で折り返し ${rt.base}へ`;
                w.detail.vehicles = w.detail.vehicles.filter(v => v !== "レール運搬車");
                w.vehKinds = w.vehKinds.filter(v => v !== "railcart");
            }
        }
        return out;
    };
})();

/* ------------------------------------------------------------------ 作業の列車・保守用車を出す */
let NW_VEH_SEQ = 0;
/** 仕業 (js/38b-night-work.js の workRuns) として1区間の列車を足す */
function nwPushRun(g, w, role, pt, legs, times) {
    const run = { pt: Object.assign({ legs: legs }, pt), times: times, idx: 0, state: "wait", vehicles: null,
                  at: legs[0].from, train: null, nw: w, nwRole: role };
    g.spawner.workRuns = g.spawner.workRuns || [];
    g.spawner.workRuns.push(run);
    (w.runs = w.runs || []).push(run);
    return run;
}
/** 区間の入口・出口と、作業の場所 (ブロック) */
function nwGeometry(g, w) {
    if (w.geo) return w.geo;
    const tid = w.site.tracks[0];
    const a = stationBlockOn(g, tid, w.site.from), b = stationBlockOn(g, tid, w.site.to);
    if (!a || !b) return null;
    const dir = trackDirOf(tid);
    const entry = (a.index - b.index) * dir < 0 ? a : b, exit = entry === a ? b : a;
    const lo = Math.min(a.index, b.index) + 1, hi = Math.max(a.index, b.index) - 1;
    const f = (w.detail && w.detail.frac) || 0.5;
    const site = dir === 1 ? lo + Math.round((hi - lo) * f) : hi - Math.round((hi - lo) * f);
    w.geo = { tid: tid, dir: dir, entry: blockStationName(entry), exit: blockStationName(exit), lo: lo, hi: hi, site: site };
    return w.geo;
}
/** 線路閉鎖が承認されたとき: 保守用車を出す */
function nwSpawnMaintenance(g, w) {
    const geo = nwGeometry(g, w);
    if (!geo || geo.hi < geo.lo) return;
    const ct = g.currentTime;
    (w.vehKinds || []).forEach((vk, i) => {
        const no = "保" + (101 + (NW_VEH_SEQ++ % 800));
        nwPushRun(g, w, "mv", { id: "nwmv", name: `${NW_VEH_LABEL[vk] || vk} (${w.kind.kind})`, stock: vk },
            [{ no: no, from: geo.entry, dest: geo.exit, dir: geo.dir, track: geo.tid }], [ct + i * 60]);
    });
}
/** 作業の終わりの前: 確認車を出す */
function nwSpawnConfirm(g, w) {
    const geo = nwGeometry(g, w);
    if (!geo) return;
    const no = "保" + (101 + (NW_VEH_SEQ++ % 800));
    nwPushRun(g, w, "confirm", { id: "nwck", name: `確認車 (${w.kind.kind}のあとの線路の確認)`, stock: "confirm" },
        [{ no: no, from: geo.entry, dest: geo.exit, dir: geo.dir, track: geo.tid }], [g.currentTime]);
}
/** 工臨の仕業 (行き: 車両所 → 区間 → 出口の駅 / 帰り: 出口の駅 → 車両所) */
function nwSpawnRailTrain(g, w) {
    const rt = w.railTrain;
    const sp = g.spawner;
    const no1 = sp.allocTrainNo("工", 9, [4, 5, 6], "", rt.dir === -1 ? 1 : 0);
    const no2 = sp.allocTrainNo("工", 9, [4, 5, 6], "", rt.dir === -1 ? 0 : 1);
    const back = w.base + NW_END_CAP * 3600 + 600;                           // 閉鎖の明けを待って帰る
    nwPushRun(g, w, "rail", { id: "nwrail", name: `工臨 (${w.kind.kind}・${w.site.line} ${w.site.from}〜${w.site.to})`,
                              loco: rt.loco, cars: rt.cars },
        [{ no: no1, from: rt.base, dest: rt.exit, dir: rt.dir, track: rt.track },
         { no: no2, from: rt.exit, dest: rt.base, dir: -rt.dir }],
        [rt.depart, back]);
    w.railSpawned = true;
}

/* 保守用車・確認車は、線路閉鎖が明けたら (明ける間際も) 出さない。閉鎖の外を走らせない */
(function () {
    const baseLeg = Spawner.prototype.spawnWorkLeg;
    Spawner.prototype.spawnWorkLeg = function (run) {
        if (run.nw && (run.nwRole === "mv" || run.nwRole === "confirm")) {
            const w = run.nw, ct = this.game.currentTime;
            const open = w.state === "closed" && ct < (w.closeUntil || 0) - (run.nwRole === "confirm" ? 420 : NW_VERIFY_LEAD);
            run.firstTry = run.firstTry || ct;
            /* 確認車が区間の入口の駅から出られない (閉鎖の明けを待つ貨物列車が番線にいる など) まま5分たったら、
               最後に区間を出た保守用車・工臨の走行で確認に代える */
            const stuck = run.nwRole === "confirm" && ct - run.firstTry > 300;
            if (!open || stuck) {
                run.state = "done";
                if (run.vehicles) { this.giveBackWorkSet(run.vehicles, run.at); run.vehicles = null; }
                if (run.nwRole === "confirm" && w.state === "closed") {
                    w.confirmFallback = true;
                    this.game.ui.updateBanner(`【線路閉鎖】第${w.no}号 ${w.site.from}〜${w.site.to}間は、確認車が${run.at}から出られないため、` +
                        `最後に区間を出た作業の車両の走行で線路の状態を確かめました。`, "banner-blue");
                }
                return false;
            }
        }
        const ok = baseLeg.call(this, run);
        if (ok && run.nw && run.nwRole === "confirm") run.nw.confirmRan = true;
        return ok;
    };
})();

/* 仕業の列車に、作業の印を付ける (armWorkTrain に重ねる) */
(function () {
    const baseArm = Spawner.prototype.armWorkTrain;
    Spawner.prototype.armWorkTrain = function (t, run) {
        baseArm.call(this, t, run);
        if (run.nw) {
            t.nwWork = run.nw;
            t.nwRole = run.nwRole;
            t.nwLeg = run.idx;
            if (run.nwRole === "rail" && run.nw.railTrain) t.nwWaitAt = run.nw.railTrain.waitAt;
        } else { t.nwWork = null; t.nwRole = null; }
    };
})();

/** 作業の列車・保守用車をその場で止めるか (止めるなら理由) */
function nwVehicleHold(t) {
    const w = t.nwWork, role = t.nwRole;
    if (!w || !role) return null;
    const g = t.game, ct = g.currentTime;
    if (role === "rail" && t.nwLeg !== 0) return null;                       // 帰りの工臨
    const blks = g.trackMgr.blocks[t.trackId];
    const b = blks && blks[t.currBlockIndex];
    const here = b && isRealStationBlock(b) ? blockStationName(b) : "";
    if (role === "rail" && w.state === "plan") {
        return (here && here === t.nwWaitAt) ? `線路閉鎖の承認待ち (${w.kind.kind}の工臨)` : null;
    }
    if (w.state !== "closed" || role === "confirm") return null;
    const geo = nwGeometry(g, w);
    if (!geo || t.trackId !== geo.tid) return null;
    if (t.currBlockIndex < geo.lo || t.currBlockIndex > geo.hi) {
        // 区間の手前の駅: 承認された閉鎖に入るまでは進ませる。区間を出たあとは止めない
        return null;
    }
    if (ct >= (w.closeUntil || 0) - NW_VERIFY_LEAD) return null;           // 作業を終えて区間を出る
    // 作業の場所までは進む。前の保守用車がいて進めないときも、作業の待ちとして止まる
    const nb = blks[t.currBlockIndex + t.dir];
    const blocked = nb && nb.lanes.some(x => x && x !== t);
    if ((geo.site - t.currBlockIndex) * t.dir > 0 && !blocked) return null;
    return `作業中 (${w.kind.kind})`;
}

(function () {
    const baseHold = Train.prototype.checkHold;
    Train.prototype.checkHold = function (isStarting) {
        if (this.nwWork) {
            const why = nwVehicleHold(this);
            if (why) {
                this._routineHold = true;
                this.workStopHold = true;              // 長く止まっていてよい (詰まりの見張りの対象外)
                this._holdWhy = why;
                return true;
            }
        }
        return baseHold.call(this, isStarting);
    };
})();

/* ------------------------------------------------------------------ 駅・ホームの作業 */
/** 駅の作業を決める (線路閉鎖の作業と同じとき) */
OperationsManager.prototype.planStationWorks = function (ct) {
    const g = this.game, tm = g.trackMgr;
    const base = ct - ((ct / 3600) % 24) * 3600;
    const n = _nwInt(SW_PER_NIGHT[0], SW_PER_NIGHT[1]);
    // 候補: ホームのある番線を持つ旅客駅
    const tracks = ["Up_In", "Down_In", "Up_Out", "Down_Out", "Kosei_Up", "Kosei_Down", "Fukuchi_Up", "Fukuchi_Down", "Tozai_Up", "Tozai_Down"];
    const cands = [];
    for (const tid of tracks) {
        const blks = tm.blocks[tid];
        if (!blks) continue;
        for (const b of blks) {
            if (!b || b.x === -1000 || !isRealStationBlock(b) || b.freightTerminal) continue;
            const st = blockStationName(b);
            if (!st || /操|貨/.test(st)) continue;
            for (let l = 0; l < b.lanes.length; l++) {
                if (!isPlatformLane(st, tid, l) && STATION_PLATFORM_RULES[st]) continue;
                cands.push({ tid: tid, index: b.index, lane: l, st: st, lanes: b.lanes.length });
            }
        }
    }
    const out = [];
    const usedSt = new Set(), usedKind = new Set();
    for (let tries = 0; out.length < n && tries < 400; tries++) {
        const c = _nwPick(cands);
        if (!c || usedSt.has(c.st)) continue;
        const kinds = STATION_WORK_KINDS.filter(k => !usedKind.has(k.kind) && (!k.track || c.lanes >= 2));
        if (!kinds.length) break;
        const k = _nwPick(kinds);
        usedSt.add(c.st); usedKind.add(k.kind);
        const dur = (k.dur[0] + Math.random() * (k.dur[1] - k.dur[0])) * 3600;
        const from = base + (0.7 + Math.random() * 1.8) * 3600;
        const lbl = platformLabelOf(c.st, c.tid, c.lane);
        const area = nwAreaOf(c.st, c.tid);
        const km = nwKmOf(c.st, c.tid);
        const cat = nwCategory(k.who);
        const sw = {
            id: "sw" + (++this._nwDetailSeq || (this._nwDetailSeq = 1)), station: c.st, trackId: c.tid, index: c.index, lane: c.lane,
            platform: lbl !== null && lbl !== undefined ? platformText(lbl) : trackLabelOf(c.tid) + "のホーム",
            kind: k.kind, who: k.who, track: !!k.track, from: from, dur: dur, base: base, state: "plan", until: 0,
            detail: {
                kind: k.kind, who: k.who, office: nwOfficeName(k.who, area), cat: cat,
                supervisor: (k.who === "駅" ? "駅助役 " : "作業責任者 ") + _nwPick(NW_SURNAMES),
                lookouts: k.track ? _nwInt(1, 2) : 0, workers: _nwInt(k.n[0], k.n[1]),
                contractor: k.who === "工事会社" ? _nwPick(NW_CONTRACTORS.facility.concat(NW_CONTRACTORS.signal)) : "(直営)",
                kmLine: km ? km.line : "", kmFrom: km ? km.km : null, kmTo: km ? km.km : null
            }
        };
        out.push(sw);
    }
    return out;
};

/** 番線の使用停止 (findFreeLane で、その番線をふさがっているものとして扱う) */
const NW_LANE_SENTINEL = { id: "nw-lane", dir: 0, type: "作業", trainNo: "", state: "in_depot", timer: 0, stuckTime: 0,
                           getPriority() { return 0; }, passengerStopsAt() { return false; } };
(function () {
    const baseFind = Train.prototype.findFreeLane;
    Train.prototype.findFreeLane = function (block, toTrack) {
        const tm = this.game && this.game.trackMgr;
        const lc = tm && tm.laneClosures;
        if (!lc || !lc.length || this.workPermit || !block || !block.lanes) return baseFind.call(this, block, toTrack);
        const mine = [];
        for (const c of lc) {
            const b = (tm.blocks[c.trackId] || [])[c.index];
            if (b && b.lanes === block.lanes && block.lanes[c.lane] === null) mine.push(c.lane);
        }
        if (!mine.length) return baseFind.call(this, block, toTrack);
        mine.forEach(l => { block.lanes[l] = NW_LANE_SENTINEL; });
        try { return baseFind.call(this, block, toTrack); }
        finally { mine.forEach(l => { if (block.lanes[l] === NW_LANE_SENTINEL) block.lanes[l] = null; }); }
    };
})();

/** 1分ごと: 駅の作業の始め・終わり */
OperationsManager.prototype.checkStationWorks = function (ct) {
    const g = this.game, tm = g.trackMgr;
    tm.laneClosures = tm.laneClosures || [];
    const list = this.stationWorks || [];
    for (const sw of list) {
        const cap = sw.base + SW_END_CAP * 3600;
        if (sw.state === "work" && (ct >= sw.until || ct >= cap)) {
            sw.state = "done";
            tm.laneClosures = tm.laneClosures.filter(c => c.id !== sw.id);
            g.ui.updateBanner(`【駅の作業 終了】${sw.station}駅 ${sw.platform}の${sw.kind}が終わりました` +
                              (sw.track ? ` (番線の使用停止を解除)。` : "。"), "banner-blue");
            continue;
        }
        if (sw.state !== "plan" || ct < sw.from) continue;
        if (ct + 900 > cap) { sw.state = "cancel"; continue; }
        if (sw.track) {
            // 番線が空いていて、これからこの線路を通る列車 (最終列車) が無いこと
            const b = (tm.blocks[sw.trackId] || [])[sw.index];
            if (!b || b.lanes[sw.lane] !== null || this.workSectionBusy(sw.trackId, sw.index, sw.index, null)) {
                sw.from = ct + 300;
                continue;
            }
            tm.laneClosures.push({ id: sw.id, trackId: sw.trackId, index: sw.index, lane: sw.lane, until: Math.min(ct + sw.dur, cap) });
        }
        sw.state = "work";
        sw.started = ct;
        sw.until = Math.min(ct + sw.dur, cap);
        this.stats.stationWork = (this.stats.stationWork || 0) + 1;
        g.ui.updateBanner(`【駅の作業】${sw.station}駅 ${sw.platform}で${sw.kind} (${sw.detail.office}・${sw.detail.workers}名) を始めます` +
                          (sw.track ? `。作業の間 ${sw.platform}は使用停止 (${stabledClock((sw.until / 3600) % 24)}まで)。` : " (列車の運転に支障なし)。"), "banner-blue");
    }
};

/* ------------------------------------------------------------------ 状況と報告書 */
function nwStatusText(w, ct) {
    if (w.state === "cancel") return "中止";
    if (w.state === "done") return "打ち切り";
    if (w.state === "plan") {
        if (w.paused) return "一時中断 (列車を通したあと再び閉鎖)";
        if (w.waitNoted) return w.freight ? "線路閉鎖の申し込み中 (貨物列車の合間待ち)" : "線路閉鎖の申し込み中 (最終列車の通過待ち)";
        return "計画 (" + stabledClock((w.from / 3600) % 24) + "ごろ 線路閉鎖の申し込み)";
    }
    if (w.state === "closed") {
        if (ct >= (w.closeUntil || 0)) return "作業終了 (線路閉鎖 解除)";
        if (ct >= (w.closeUntil || 0) - NW_CONFIRM_LEAD && w.detail && w.detail.verify) return "後片付け・確認車による線路の確認";
        if (ct >= (w.closeUntil || 0) - NW_VERIFY_LEAD) return "作業の終わり・保守用車の収容";
        const geo = w.geo;
        const inPlace = (w.runs || []).some(r => r.train && r.train.state !== "finished" && geo &&
            r.train.trackId === geo.tid && r.train.currBlockIndex >= geo.lo && r.train.currBlockIndex <= geo.hi);
        return inPlace ? "作業中 (保守用車・工臨が現場に到着)" : "作業中 (線路閉鎖 承認済み)";
    }
    return w.state;
}
function swStatusText(sw) {
    return { plan: "計画 (" + stabledClock((sw.from / 3600) % 24) + "ごろ 開始)", work: "作業中", done: "作業終了", cancel: "中止" }[sw.state] || sw.state;
}
/** 報告書の行 (画面と2つ目の窓へ渡す。そのまま JSON にできる) */
function nwReportRows(g, w) {
    const d = w.detail || {};
    const ct = g.currentTime;
    const clock = (t) => t ? stabledClock((t / 3600) % 24) : "—";
    const rows = [
        ["作業の種類", d.kind],
        ["場所", `${d.line} ${d.from}〜${d.to}間 ${d.tracks}`],
        ["キロ程 (概算)", d.kmFrom !== undefined && d.kmFrom !== null ? `${d.kmLine} ${nwKmText(d.kmFrom)}〜${nwKmText(d.kmTo)}` : "—"],
        ["作業の状況", nwStatusText(w, ct)],
        ["線路閉鎖", w.no ? `第${w.no}号 (${clock(w.closedAt)}承認・${clock(w.closeUntil)}解除予定)` : `申し込み ${clock(w.from)}ごろ`],
        ["担当", d.office + (d.who && /工事会社/.test(d.who) ? " (施工 " + d.contractor + ")" : "")],
        ["施工会社", d.contractor],
        ["現場責任者", d.supervisor],
        ["線路閉鎖責任者", d.closureChief],
        ["作業員", `${d.workers}名 (列車見張員 ${d.lookouts}名を含まない)`],
        ["き電停止", d.feed ? "あり (作業区間の架線を停電させる)" : "なし"]
    ];
    if (d.rail) rows.splice(2, 0, ["レール", `${d.rail.type} (${d.rail.weight})`], ["レール長", `${d.rail.len}m … ${d.rail.note}`]);
    rows.push(["工臨", d.railTrainText || "なし"]);
    rows.push(["保守用車", d.vehicles && d.vehicles.length ? d.vehicles.join("・") : "なし (徒歩・人力)"]);
    const live = (w.runs || []).filter(r => r.train && r.train.state !== "finished").map(r => r.train.trainNo + " " +
        ((r.train.vehicles || []).map(v => v.fullId || v.id).join("+")));
    if (live.length) rows.push(["いま走っている作業の列車", live.join(" / ")]);
    rows.push(["確認車", !d.verify ? "—" : w.confirmRan ? "作業のあと、閉鎖を解く前に区間を走らせて確認 (済み)"
        : w.confirmFallback ? "入口の駅がふさがっていたため、最後に区間を出た作業の車両の走行で確認 (済み)"
        : "作業のあと、閉鎖を解く前に区間を走らせて確認 (予定)"]);
    rows.push(["明けの徐行", d.slow ? "始発から約1時間 45km/h (道床が落ち着くまで)" : "なし"]);
    return rows;
}
function swReportRows(g, sw) {
    const d = sw.detail || {};
    const clock = (t) => t ? stabledClock((t / 3600) % 24) : "—";
    return [
        ["作業の種類", sw.kind],
        ["場所", `${sw.station}駅 ${sw.platform}`],
        ["キロ程 (概算)", d.kmFrom !== null && d.kmFrom !== undefined ? `${d.kmLine} ${nwKmText(d.kmFrom)} 付近` : "—"],
        ["作業の状況", swStatusText(sw)],
        ["時刻", sw.state === "plan" ? `${clock(sw.from)}ごろから約${Math.round(sw.dur / 60)}分` : `${clock(sw.started)}〜${clock(sw.until)}`],
        ["列車への影響", sw.track ? `作業の間 ${sw.platform}を使用停止 (ほかの番線を使う)` : "なし (ホームの上だけの作業)"],
        ["担当", d.office],
        ["施工会社", d.contractor],
        ["現場責任者", d.supervisor],
        ["作業員", `${d.workers}名` + (d.lookouts ? ` (列車見張員 ${d.lookouts}名)` : "")],
        ["保守用車", "なし"]
    ];
}

/* ------------------------------------------------------------------ checkNightWorks に重ねる */
(function () {
    const baseCheck = OperationsManager.prototype.checkNightWorks;
    OperationsManager.prototype.checkNightWorks = function (ct) {
        if (globalThis.__NO_NIGHT_WORK) return baseCheck.call(this, ct);
        const g = this.game, tm = g.trackMgr;
        const h = (ct / 3600) % 24;
        /* ★工臨を 23時台に出すため、その夜の作業は 22時台に決める (38b は 0時台に決めていた)。
           作業の日付 (base) は翌日の 0時 */
        if (h >= 22.0 && h < 22.5 && (ct >= (this.nwNext || 0))) {
            const nextDay = Math.floor(ct / 86400) + 1;
            if (this.nwDay !== nextDay) {
                this.nwDay = nextDay;
                const at = nextDay * 86400 + 0.55 * 3600;
                this.nightWorks = this.planNightWorks(at);
                this.stationWorks = this.planStationWorks(at);
                (this.nightWorks || []).forEach(w => { if (w.railTrain && !w.railSpawned) nwSpawnRailTrain(g, w); });
                const rails = (this.nightWorks || []).filter(w => w.railTrain).length;
                g.ui.updateBanner(`【夜間作業】今夜の線路閉鎖の作業 ${this.nightWorks.length}件` +
                    (rails ? ` (工臨 ${rails}本)` : "") + `・駅の作業 ${this.stationWorks.length}件を計画しました。`, "banner-blue");
            }
        }
        const before = new Map((this.nightWorks || []).map(w => [w, w.state]));
        const pre = this.nightWorks;
        baseCheck.call(this, ct);
        // 38b が 0時台に決め直した夜 (起動した直後など) も、報告の材料を持たせる
        if (this.nightWorks && this.nightWorks !== pre) {
            this.nightWorks.forEach(w => { if (!w.detail) nwAttachDetail(g, w); });
            if (!this.stationWorks || !this.stationWorks.length || this.stationWorks[0].base !== this.nightWorks[0].base)
                this.stationWorks = this.planStationWorks(ct);
        }
        if (ct < (this._nwExtraNext || 0)) return;
        this._nwExtraNext = ct + 60;
        for (const w of this.nightWorks || []) {
            const c = (tm.workClosures || []).find(x => x.work === w && x.first);
            if (w.state === "closed" && before.get(w) !== "closed") {
                // 承認された: 閉鎖の番号と時刻を覚え、保守用車を出す
                w.no = c ? c.no : w.no;
                w.closedAt = ct;
                w.closeUntil = c ? c.until : ct + w.dur;
                w.confirmSent = false;
                if (!globalThis.__NO_NW_VEHICLES) nwSpawnMaintenance(g, w);
            }
            if (c) w.closeUntil = c.until;
            // 確認車 (大きな作業のあと)
            if (w.state === "closed" && w.detail && w.detail.verify && !w.confirmSent && c &&
                ct >= w.closeUntil - NW_CONFIRM_LEAD && ct < w.closeUntil - 300) {
                w.confirmSent = true;
                if (!globalThis.__NO_NW_VEHICLES) nwSpawnConfirm(g, w);
                g.ui.updateBanner(`【線路閉鎖】第${w.no}号 ${w.site.line} ${w.site.from}〜${w.site.to}間の${w.kind.kind}を終え、` +
                                  `確認車で線路の状態を確かめます。`, "banner-blue");
            }
            // 閉鎖が明けた: 明けの徐行
            if (w.state === "closed" && !w.slowSet && w.closeUntil && ct >= w.closeUntil && !c) {
                w.slowSet = true;
                if (w.detail && w.detail.slow) {
                    const geo = nwGeometry(g, w);
                    for (const tid of w.site.tracks) {
                        const a = stationBlockOn(g, tid, w.site.from), b = stationBlockOn(g, tid, w.site.to);
                        if (a && b) tm.addSpeedRestriction(tid, Math.min(a.index, b.index) + 1, Math.max(a.index, b.index) - 1, 1.3,
                            `${w.kind.kind}のあとの徐行 (45km/h)`, ct + 3600);
                    }
                    void geo;
                    g.ui.updateBanner(`【徐行】${w.site.line} ${w.site.from}〜${w.site.to}間は${w.kind.kind}のあとのため、` +
                                      `約1時間 45km/h の徐行とします。`, "banner-blue");
                }
            }
        }
        this.checkStationWorks(ct);
        // 画面・2つ目の窓のための一覧 (そのまま JSON にできる形)
        tm.nwReports = (this.nightWorks || []).filter(w => w.detail).map(w => ({
            id: w.detail.id, kind: w.kind.kind, place: `${w.site.line} ${w.site.from}〜${w.site.to}`, no: w.no || null,
            status: nwStatusText(w, ct), active: w.state === "closed" && ct < (w.closeUntil || 0), rows: nwReportRows(g, w)
        })).concat((this.stationWorks || []).map(sw => ({
            id: sw.id, kind: sw.kind, place: `${sw.station}駅 ${sw.platform}`, station: sw.station, trackId: sw.trackId,
            index: sw.index, lane: sw.lane, laneClosed: sw.track && sw.state === "work",
            status: swStatusText(sw), active: sw.state === "work", rows: swReportRows(g, sw)
        })));
        // 線閉の札から報告書を引けるように
        (tm.workClosures || []).forEach(c => { if (c.work && c.work.detail) c.nwId = c.work.detail.id; });
    };
})();

/** 夜の作業の報告書を探す (線閉の番号・報告書の id のどちらでも) */
function findNightWorkReport(game, key) {
    const list = (game.trackMgr && game.trackMgr.nwReports) || [];
    return list.find(r => r.id === key) || list.find(r => r.no !== null && String(r.no) === String(key)) || null;
}

/** 報告書を開く (留置場の配線図と同じ窓を使う) */
function showNightWorkReport(game, key) {
    const r = findNightWorkReport(game, key);
    if (typeof document === "undefined") return r;
    const title = document.getElementById("depot-modal-title");
    const content = document.getElementById("depot-modal-content");
    const modal = document.getElementById("depot-modal");
    if (!title || !content || !modal) return r;
    const esc = (typeof escapeLogHtml === "function") ? escapeLogHtml : (s) => String(s);
    if (!r) {
        title.textContent = "作業の報告";
        content.innerHTML = "<p>この作業の報告は見つかりません (作業が終わって一覧から外れた可能性があります)。</p>";
    } else {
        title.innerHTML = `${esc(r.kind)} <span class="depot-sub">${esc(r.place)}${r.no ? " ・ 線路閉鎖 第" + r.no + "号" : ""}</span>`;
        content.innerHTML = `<table class="nw-report" style="border-collapse:collapse;width:100%;font-size:14px">` +
            r.rows.map(([k, v]) => `<tr><th style="text-align:left;white-space:nowrap;padding:4px 10px;border-bottom:1px solid #444;color:#ffb347">${esc(k)}</th>` +
                `<td style="padding:4px 10px;border-bottom:1px solid #444">${esc(v === undefined || v === null ? "—" : v)}</td></tr>`).join("") +
            `</table><p style="font-size:12px;color:#aaa;margin-top:8px">※ 人名・会社名はシミュレーター用の架空のものです。キロ程は駅の位置からの概算です。</p>`;
    }
    modal.style.display = "flex";
    return r;
}
