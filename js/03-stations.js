/* このファイルは index.html から分割されたものです。
   駅一覧・番線ルール・STATION_MAP・線路(TRACKS)・臨時列車の定義 */
const STATIONS = [
    {name:"姫路", type:2, cap:4, stopTime: STOP_TIME.MEDIUM}, {name:"東姫路", type:0, cap:2, stopTime: STOP_TIME.SHORT}, {name:"御着", type:0, cap:3, stopTime: STOP_TIME.SHORT}, {name:"ひめじ別所", type:0, cap:2, stopTime: STOP_TIME.SHORT, isFreightTerm: true}, {name:"曽根", type:0, cap:2, stopTime: STOP_TIME.SHORT},
    {name:"宝殿", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"加古川", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"東加古川", type:0, cap:3, stopTime: STOP_TIME.SHORT}, {name:"土山", type:0, cap:3, stopTime: STOP_TIME.SHORT}, {name:"魚住", type:0, cap:2, stopTime: STOP_TIME.SHORT}, {name:"大久保", type:0, cap:5, stopTime: STOP_TIME.SHORT}, 
    {name:"西明石", type:2, cap:6, stopTime: STOP_TIME.LONG}, {name:"明石", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"朝霧", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"舞子", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"垂水", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"塩屋", type:0, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"須磨", type:1, cap:6, stopTime: STOP_TIME.SHORT}, {name:"須磨海浜公園", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"鷹取", type:0, cap:4, stopTime: STOP_TIME.SHORT, isFreightTerm: true}, {name:"新長田", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"兵庫", type:1, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"神戸", type:2, cap:5, stopTime: STOP_TIME.SHORT}, {name:"元町", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"三ノ宮", type:2, cap:4, stopTime: STOP_TIME.MEDIUM},
    {name:"摩耶", type:0, cap:6, stopTime: STOP_TIME.SHORT, hasDownSiding: true}, {name:"灘", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"六甲道", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"住吉", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"摂津本山", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"甲南山手", type:0, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"芦屋", type:2, cap:6, stopTime: STOP_TIME.MEDIUM}, {name:"さくら夙川", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"西宮", type:1, cap:6, stopTime: STOP_TIME.SHORT}, {name:"甲子園口", type:0, cap:5, stopTime: STOP_TIME.SHORT}, {name:"立花", type:0, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"尼崎", type:2, cap:8, stopTime: STOP_TIME.MEDIUM}, {name:"塚本", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"大阪", type:2, cap:9, stopTime: STOP_TIME.LONG}, {name:"新大阪", type:2, cap:10, stopTime: STOP_TIME.MEDIUM}, {name:"東淀川", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"吹田", type:0, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"岸辺", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"千里丘", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"茨木", type:1, cap:6, stopTime: STOP_TIME.SHORT}, {name:"JR総持寺", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"摂津富田", type:0, cap:4, stopTime: STOP_TIME.SHORT}, 
    {name:"高槻", type:2, cap:6, stopTime: STOP_TIME.MEDIUM}, {name:"島本", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"山崎", type:0, cap:5, stopTime: STOP_TIME.SHORT}, {name:"長岡京", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"向日町操", type:2, cap:4, stopTime: STOP_TIME.SHORT, isSeparateLine: true},
    {name:"向日町", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"桂川", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"西大路", type:0, cap:4, stopTime: STOP_TIME.SHORT}, {name:"京都", type:2, cap:8, stopTime: STOP_TIME.LONG},
    {name:"山科", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"大津", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"膳所", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"石山", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"瀬田", type:1, cap:4, stopTime: STOP_TIME.SHORT},
    {name:"南草津", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"草津", type:2, cap:6, stopTime: STOP_TIME.MEDIUM}, {name:"栗東", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"守山", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"野洲", type:2, cap:6, stopTime: STOP_TIME.MEDIUM},
    {name:"篠原", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"近江八幡", type:2, cap:5, stopTime: STOP_TIME.SHORT}, {name:"安土", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"能登川", type:2, cap:5, stopTime: STOP_TIME.SHORT}, {name:"稲枝", type:1, cap:4, stopTime: STOP_TIME.SHORT},
    {name:"河瀬", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"南彦根", type:1, cap:4, stopTime: STOP_TIME.SHORT}, {name:"彦根", type:2, cap:5, stopTime: STOP_TIME.SHORT}, {name:"米原", type:2, cap:8, stopTime: STOP_TIME.LONG}, {name:"坂田", type:2, cap:4, stopTime: STOP_TIME.SHORT},
    {name:"田村", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"長浜", type:2, cap:6, stopTime: STOP_TIME.MEDIUM}, {name:"虎姫", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"河毛", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"高月", type:2, cap:4, stopTime: STOP_TIME.SHORT},
    {name:"木ノ本", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"余呉", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"近江塩津", type:2, cap:6, stopTime: STOP_TIME.MEDIUM}, {name:"新疋田", type:2, cap:4, stopTime: STOP_TIME.SHORT}, {name:"敦賀", type:2, cap:8, stopTime: STOP_TIME.LONG}
];

const STATION_PLATFORM_RULES = {
    "姫路": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "東姫路": { labels:["2","1"], lanes:[true,true] }, "御着": { labels:["3","2","1"], lanes:[true,true,true] }, "ひめじ別所": { labels:["2","1","貨","貨"], lanes:[true,true,true,true] }, "曽根": { labels:["2","1"], lanes:[true,true] },
    "宝殿": { labels:["上通","3","2","1"], lanes:[false,true,true,true] }, "加古川": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "東加古川": { labels:["3","2","1"], lanes:[true,true,true] }, "土山": { labels:["3","2","1"], lanes:[true,true,true] }, "魚住": { labels:["2","1"], lanes:[true,true] },
    "大久保": { labels:["4","3","2","1","下通"], lanes:[true,true,true,true,false] }, "西明石": { labels:["6","5","4","3","2","1"], lanes:[true,true,true,true,true,true] }, "明石": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "朝霧": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] },
    "舞子": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "垂水": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "塩屋": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "須磨": { labels:["上外","4","3","2","1","下外"], lanes:[false,true,true,true,true,false] },
    "須磨海浜公園": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "鷹取": { labels:["上外","2","1","下外","上待","下待"], lanes:[false,true,true,false,false,false] }, "新長田": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "兵庫": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "神戸": { labels:["5","4","3","2","1"], lanes:[true,true,true,true,true] }, "元町": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "三ノ宮": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "摩耶": { labels:["上待","上外","2","1","下外","下待"], lanes:[false,false,true,true,false,false] },
    "灘": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "六甲道": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "住吉": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "摂津本山": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "甲南山手": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] },
    "芦屋": { labels:["上通","4","3","2","1","下通"], lanes:[false,true,true,true,true,false] }, "さくら夙川": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "西宮": { labels:["上待","上外","2","1","下外","下待"], lanes:[false,false,true,true,false,false] }, "甲子園口": { labels:["4","3","2","1","下外"], lanes:[true,true,true,true,false] },
    "立花": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "尼崎": { labels:["8","7","6","5","4","3","2","1"], lanes:[true,true,true,true,true,true,true,true] }, "塚本": { labels:["1","2","3","4"], lanes:[true,true,true,true] }, "大阪": { labels:["11","10","9","8","7","6","5","4","3"], lanes:[true,true,true,true,true,true,true,true,true] },
    "新大阪": { labels:["上通","10","9","8","7","6","5","4","3","2","1"], lanes:[false,true,true,true,true,true,true,true,true,true,true] }, "東淀川": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "吹田": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "岸辺": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "千里丘": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "茨木": { labels:["上待","4","3","2","1","下待"], lanes:[false,true,true,true,true,false] }, "JR総持寺": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "摂津富田": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "高槻": { labels:["6","5","4","3","2","1"], lanes:[true,true,true,true,true,true] }, "島本": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "山崎": { labels:["4","3","2","1","下待"], lanes:[true,true,true,true,false] }, "長岡京": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "向日町": { labels:["1","2","3","4","下待"], lanes:[true,true,true,true,false] }, "向日町操": { labels:["発1","発2"], lanes:[true,true], type:"freight_term" }, "桂川": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "西大路": { labels:["4","3","2","1","京","タ"], lanes:[true,true,true,true,false,false] },
    "京都": { labels:["下通","0","2","3","4","5","6","7"], lanes:[false,true,true,true,true,true,true,true] },
    "山科": { labels:["上通","3","2","下通"], lanes:[false,true,true,false] }, "大津": { labels:["1","2","3","4"], lanes:[true,true,true,true] }, "膳所": { labels:["1","2","3","4","上待","下待"], lanes:[true,true,true,true,false,false] }, "石山": { labels:["4","3","2","1","上待","下待"], lanes:[true,true,true,true,false,false] }, "瀬田": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "南草津": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "草津": { labels:["6","5","4","3","2","1"], lanes:[true,true,true,true,true,true] }, "栗東": { labels:["2","1"], lanes:[true,true] }, "守山": { labels:["2","1"], lanes:[true,true] }, "野洲": { labels:["3","2","1"], lanes:[true,true,true] },
    "篠原": { labels:["2","1"], lanes:[true,true] }, "近江八幡": { labels:["3","2","1"], lanes:[true,true,true] }, "安土": { labels:["3","2","1"], lanes:[true,true,true] }, "能登川": { labels:["3","2","1"], lanes:[true,true,true] }, "稲枝": { labels:["2","1"], lanes:[true,true] },
    "河瀬": { labels:["3","2","1"], lanes:[true,true,true] }, "南彦根": { labels:["2","1"], lanes:[true,true] }, "彦根": { labels:["2","1"], lanes:[true,true] }, "米原": { labels:["8","7","6","5","4","3","2","1"], lanes:[true,true,true,true,true,true,true,true] }, "坂田": { labels:["2","1"], lanes:[true,true] },
    "田村": { labels:["2","1"], lanes:[true,true] }, "長浜": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "虎姫": { labels:["2","1"], lanes:[true,true] }, "河毛": { labels:["2","1"], lanes:[true,true] }, "高月": { labels:["2","1"], lanes:[true,true] },
    "木ノ本": { labels:["3","2","1"], lanes:[true,true,true] }, "余呉": { labels:["2","1"], lanes:[true,true] }, "近江塩津": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "新疋田": { labels:["3","2","1"], lanes:[true,true,true] }, "敦賀": { labels:["7","6","5","4","3"], lanes:[true,true,true,true,true] }
};

Object.assign(STATION_PLATFORM_RULES, {
    "大津京": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "唐崎": { labels:["2","1"], lanes:[true,true] },
    "比叡山坂本": { labels:["2","1"], lanes:[true,true] },  "おごと温泉": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "堅田": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "小野": { labels:["2","1"], lanes:[true,true] }, "和邇": { labels:["2","1"], lanes:[true,true] },
    "蓬莱": { labels:["2","1"], lanes:[true,true] }, "志賀": { labels:["2","1"], lanes:[true,true] }, "比良": { labels:["2","1"], lanes:[true,true] }, "近江舞子": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "北小松": { labels:["2","1"], lanes:[true,true] }, "近江高島": { labels:["2","1"], lanes:[true,true] },
    "安曇川": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "新旭": { labels:["2","1"], lanes:[true,true] },
    "近江今津": { labels:["4","3","2","1"], lanes:[true,true,true,true] },  "近江中庄": { labels:["2","1"], lanes:[true,true] },
    "マキノ": { labels:["2","1"], lanes:[true,true] }, "永原": { labels:["4","3","2","1"], lanes:[true,true,true,true] }
});

Object.assign(STATION_PLATFORM_RULES, {
    "新三田": { labels:["4","3","2","1"], lanes:[true,true,true,true] },"三田": { labels:["2","1"], lanes:[true,true] },"道場": { labels:["3","2","1"], lanes:[true,true,true] },"武田尾": { labels:["2","1"], lanes:[true,true] },
    "西宮名塩": { labels:["2","1"], lanes:[true,true] },"生瀬": { labels:["2","1"], lanes:[true,true] },"宝塚": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "中山寺": { labels:["2","1"], lanes:[true,true] },
    "川西池田": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "北伊丹": { labels:["2","1"], lanes:[true,true] }, "伊丹": { labels:["2","1"], lanes:[true,true] },
    "猪名寺": { labels:["2","1"], lanes:[true,true] }, "塚口": { labels:["3","2","1"], lanes:[true,true,true] }, "加島": { labels:["2","1"], lanes:[true,true] },
    "御幣島": { labels:["2","1"], lanes:[true,true] }, "海老江": { labels:["2","1"], lanes:[true,true] }, "新福島": { labels:["2","1"], lanes:[true,true] }, "北新地": { labels:["2","1"], lanes:[true,true] }, "大阪天満宮": { labels:["2","1"], lanes:[true,true] }, "大阪城北詰": { labels:["2","1"], lanes:[true,true] },
    // JR東西線 京橋(地下1面2線) と、片町線 鴫野・放出
    "京橋": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "鴫野": { labels:["4","1"], lanes:[true,true] },
    "放出": { labels:["4","3","2","1"], lanes:[true,true,true,true] }
});

/* JR東西線ブロックの東端。京橋の先、片町線の鴫野・放出まで作る。
   ここを伸ばすと線路・駅・留置場もそこまで描かれる。 */
const TOZAI_EAST_IDX = 46;

/* 尼崎から JR東西線へ入る (= 本線ではなく東西線を走る) 行先。
   以前は同じ配列が5つのファイルに重複して書かれていて、
   駅を足すたびに全部直さないと経路がずれていた。ここ1か所にまとめる。 */
const TOZAI_THROUGH_DESTS = ["同志社前", "松井山手", "四条畷", "木津", "京田辺",
                             "奈良", "長尾", "放出", "鴫野", "京橋"];

/* 尼崎より東 (大阪・京都方面) の本線の主要駅。
   JR宝塚線からここへ直通する列車は丹波路快速などで、
   宮原の223系/225系が受け持つ、という判定に使う。 */
const MAINLINE_EAST_OF_AMAGASAKI = ["大阪", "新大阪", "東淀川", "吹田", "岸辺", "千里丘",
    "茨木", "JR総持寺", "摂津富田", "高槻", "島本", "山崎", "長岡京",
    "向日町", "桂川", "西大路", "京都", "山科", "草津", "野洲", "米原"];

/* 尼崎から JR宝塚線(福知山線)へ入る行先。同上。 */
const FUKUCHI_THROUGH_DESTS = ["塚口", "新三田", "三田", "道場", "宝塚",
                               "篠山口", "福知山", "豊岡", "城崎温泉"];

const SWITCHABLE_STATIONS = ["新三田", "宝塚", "川西池田", "塚口", "放出", "京橋",
    "京都", "向日町", "長岡京", "高槻", "茨木", "新大阪", "大阪", "尼崎", "芦屋", "西宮", "須磨", "大久保", "加古川", "宝殿", "御着", "姫路", "西明石", "草津", "野洲", "米原", "長浜", "近江塩津", "敦賀",
    "堅田", "近江舞子", "近江今津" // ★追加
];
const OVERTAKE_STATIONS = ["新三田", "道場", "宝塚", "川西池田", "塚口", "放出","高槻","大阪","尼崎","芦屋","須磨","大久保","西明石","加古川", "宝殿", "草津", "野洲", "河瀬", "安土", "近江八幡", "能登川", "米原", "長浜", "近江塩津", "敦賀", "大津京", "おごと温泉", "堅田", "近江舞子", "安曇川", "近江今津", "永原"]; STATION_MAP = {};
STATIONS.forEach((s,i) => {
    STATION_MAP[s.name] = i;
});

// ★追加: 湖西線・福知山線・東西線の駅をSTATION_MAPにマッピング
Object.assign(STATION_MAP, {
    "新三田": 23, "三田": 24, "道場": 25, "武田尾": 26, "西宮名塩": 27, "生瀬": 28, "宝塚": 29, "中山寺": 30, "川西池田": 31, "北伊丹": 32, "伊丹": 33, "猪名寺": 34, "塚口": 35,
    "加島": 37, "御幣島": 38, "海老江": 39, "新福島": 40, "北新地": 41, "大阪天満宮": 42, "大阪城北詰": 43, "京橋": 44,
    "鴫野": 45, "放出": 46,
    "大津京": 57, "唐崎": 58, "比叡山坂本": 60, "おごと温泉": 61, "堅田": 63, "小野": 64, "和邇": 65, "蓬莱": 67, "志賀": 68, "比良": 70, "近江舞子": 71, "北小松": 72, "近江高島": 74, "安曇川": 75, "新旭": 77, "近江今津": 78, "近江中庄": 79, "マキノ": 81, "永原": 82,
    "宮原操": 39, "吹田貨": 41
});
// 注: 松井山手・四条畷・網干・篠山口などの「線内に描画していない駅」は
//     意図的に STATION_MAP へ入れていない (進行方向の判定に使われるため)。
//     編成の配置・返却先を求めるときの読み替えは js/06-fleet.js の
//     fleetHomeOf() / fleetIndexOf() が受け持つ。

const STARTERS = {
    "姫路":0, "西明石":11, "甲子園口":34, "尼崎":36, "大阪":38, "高槻":47, 
    "向日町操": STATION_MAP["向日町操"], "京都": STATION_MAP["京都"], 
    "神戸": 22, "三ノ宮": STATION_MAP["三ノ宮"], 
    "網干": 0, "播州赤穂": 0, "上郡": 0, "近江今津": STATION_MAP["敦賀"], 
    "吹田貨": 41, "宮原操": 39, "野洲": STATION_MAP["野洲"], 
    "米原": STATION_MAP["米原"], "敦賀": STATION_MAP["敦賀"] 
};

const TRACKS = [
    { id: "Up_Hoppo", label: "北方貨物上", dir: 1, type: "freight_line" }, { id: "Up_Out", label: "上り外", dir: 1 }, { id: "Up_In", label: "上り内", dir: 1 }, 
    { id: "Down_In", label: "下り内", dir: -1 }, { id: "Down_Out", label: "下り外", dir: -1 }, { id: "Down_Hoppo", label: "北方貨物下", dir: -1, type: "freight_line" },{ id: "Kosei_Up", label: "湖西線上り", dir: 1 }, { id: "Kosei_Down", label: "湖西線下り", dir: -1 },
    { id: "Fukuchi_Up", label: "福知山線上り", dir: 1 }, { id: "Fukuchi_Down", label: "福知山線下り", dir: -1 },
    { id: "Tozai_Up", label: "東西線上り", dir: 1 }, { id: "Tozai_Down", label: "東西線下り", dir: -1 }
];
const TOTAL_WIDTH = (STATIONS.length * UNITS_PER_STATION * BLOCK_WIDTH) + 200;
const CANVAS_HEIGHT = 1300;
const INTERVALS = { "普通": 650, "快速": 1250, "新快速": 1100, "特急": 5400, "貨物": 1600, "回送": 7200 };
const PRIORITY = { "回送":7, "貨物":6, "特急":5, "臨時":4, "新快速":5, "快速":3, "普通":2 };

/**
 * ブロックが表している駅の名前を返す。
 *
 * ★重要: 湖西線・JR宝塚線・JR東西線・北方貨物線のブロックは、
 *   本線と同じインデックス空間を共有している。そのため
 *   stationIdx から STATIONS[] を引くと本線の駅名になってしまう。
 *   分岐線の駅名は hoppoStationName に入っているので、必ずそちらを先に見る。
 *   (以前は逆の順で見ていたため、湖西線の列車が「能登川にいる」ことになり、
 *    そこから本線の行先が割り当てられて経路が破綻していた)
 */
function blockStationName(blk) {
    if (!blk) return "";
    if (blk.hoppoStationName) return blk.hoppoStationName;
    if (blk.stationIdx >= 0 && STATIONS[blk.stationIdx]) return STATIONS[blk.stationIdx].name;
    return "";
}

/** そのブロックが実在の停車できる駅か (湖西線通過などのダミーを除く) */
function isRealStationBlock(blk) {
    if (!blk || blk.x === -1000) return false;
    if (!blk.isStation && !blk.hoppoStationName) return false;
    const n = blockStationName(blk);
    return !!n && n.indexOf("通過") < 0;
}

/* 分岐線の駅を「本線のインデックス → 駅名」で持つ表。
   線路図の描画と当たり判定の両方で使う。
   (以前は js/17-renderer.js の中に同じ表が2つあった) */
const KOSEI_STATIONS_MAP = {
    57: "大津京", 58: "唐崎", 60: "比叡山坂本", 61: "おごと温泉", 63: "堅田", 64: "小野",
    65: "和邇", 67: "蓬莱", 68: "志賀", 70: "比良", 71: "近江舞子", 72: "北小松",
    74: "近江高島", 75: "安曇川", 77: "新旭", 78: "近江今津", 79: "近江中庄", 81: "マキノ", 82: "永原"
};
const FUKUCHI_STATIONS_MAP = {
    23: "新三田", 24: "三田", 25: "道場", 26: "武田尾",
    27: "西宮名塩", 28: "生瀬", 29: "宝塚", 30: "中山寺",
    31: "川西池田", 32: "北伊丹", 33: "伊丹", 34: "猪名寺", 35: "塚口"
};
const TOZAI_STATIONS_MAP = {
    37: "加島", 38: "御幣島", 39: "海老江", 40: "新福島", 41: "北新地",
    42: "大阪天満宮", 43: "大阪城北詰", 44: "京橋", 45: "鴫野", 46: "放出"
};

/* 貨物駅としての別名 (線路図の上下に出す) */
const FREIGHT_STATION_LABEL = { "ひめじ別所": "姫路タ", "鷹取": "神戸タ", "西大路": "京都タ" };

const timeToSec = (h, m, s) => h*3600 + m*60 + s;
const EXTRA_TRAINS = [
    { name: "試6780M", start: "吹田貨", dest: "向日町操", time: timeToSec(9,59,0), type: "臨時", dir: 1, hoppo: true },
    { name: "試6781M", start: "向日町操", dest: "吹田貨", time: timeToSec(11,55,0), type: "臨時", dir: -1, hoppo: false },
    { name: "8862レ", start: "吹田貨", dest: "京都", time: timeToSec(5,8,0), type: "臨時", dir: 1, hoppo: true },
    { name: "工9384レ", start: "大久保", dest: "向日町操", time: timeToSec(4,23,0), type: "臨時", dir: 1, hoppo: false },
    { name: "単9160", start: "吹田貨", dest: "西大路", time: timeToSec(6,8,30), type: "臨時", dir: 1, hoppo: true }, 
    { name: "工9752レ", start: "吹田", dest: "向日町操", time: timeToSec(4,32,0), type: "臨時", dir: 1, hoppo: false },
    { name: "回7781M", start: "西明石", dest: "姫路", time: timeToSec(4,57,0), type: "臨時", dir: -1, hoppo: false },
    { name: "工9896", start: "新大阪", dest: "向日町操", time: timeToSec(4,52,0), type: "臨時", dir: 1, hoppo: false },
    { name: "試9230D", start: "宮原操", dest: "京都", time: timeToSec(11,18,0), type: "臨時", dir: 1, hoppo: true },
    { name: "単9974レ", start: "吹田貨", dest: "西大路", time: timeToSec(6,15,0), type: "臨時", dir: 1, hoppo: true },
    { name: "回9331D", start: "向日町操", dest: "姫路", time: timeToSec(5,15,0), type: "臨時", dir: -1, hoppo: false }, 
    { name: "回9751M", start: "向日町操", dest: "吹田貨", time: timeToSec(6,45,0), type: "臨時", dir: -1, hoppo: false },
    { name: "単9401", start: "宮原操", dest: "姫路", time: timeToSec(5,39,0), type: "臨時", dir: -1, hoppo: true }, 
    { name: "試9161M", start: "向日町操", dest: "宮原操", time: timeToSec(10,59,0), type: "臨時", dir: -1, hoppo: false },
    { name: "試9160M", start: "宮原操", dest: "向日町操", time: timeToSec(11,42,0), type: "臨時", dir: 1, hoppo: true }
];

/**
 * その駅の「番線が並ぶ縦位置」を返す。
 *
 * 旅客向けの線路図 (js/17-renderer.js) と Super-TID の線路図
 * (js/41-tid-render.js) は、上下の並び順も間隔も違うが、
 * 「どの番線がどの線路の何番目にあるか」は同じ。
 * そこで、4本の基準線の縦位置を渡すと番線の縦位置の配列を返す形にして、
 * 両方の画面で同じ配置を使えるようにした。
 *
 * 戻り値は STATION_PLATFORM_RULES[stationName].labels と同じ並び。
 */
function stationLaneYPositions(stationName, upOutY, upInY, downInY, downOutY) {
    const rule = STATION_PLATFORM_RULES[stationName];
    if (!rule) return [];
    let yPositions = [];

    if (stationName === "ひめじ別所") {
        /* 姫路口は複線。ホーム2面と貨物待避線2本を上下線に割り当てる。
           (以前は内側線の座標を使っていて、存在しない線路に番線が付いていた) */
        yPositions = [upOutY, downOutY, upOutY - 30, downOutY + 30];
    }
    else if (stationName === "鷹取") {
        yPositions = [upOutY, upInY, downInY, downOutY, upOutY - 30, downOutY + 30];
    }
    else if (stationName === "西大路") {
        yPositions = [upOutY, upInY, downInY, downOutY, upOutY - 30, downOutY + 30];
    }
    /* 膳所・石山 — 配線略図どおり、外側線のさらに外側に待避線がある。
       (スクリーンショット(692).png の 石山: 本線4本＋待避線2本＋島式ホーム2面) */
    else if (["膳所", "石山"].includes(stationName)) {
        yPositions = [upOutY, upInY, downInY, downOutY, upOutY - 30, downOutY + 30];
    }
    else if (stationName === "向日町") {
        yPositions = [upOutY, upInY, downInY, downOutY, downOutY + 35];
    }
    else if (stationName === "向日町操") {
        yPositions = [upOutY - 40, downOutY + 40];
    }
    else if (stationName === "山崎") {
        yPositions = [upOutY, upInY, downInY, downOutY, downOutY + 35];
    }
    else if (stationName === "大阪") {
        yPositions = [upOutY-28, upOutY, upInY-28, upInY, downInY, downInY+28, downInY+56, downOutY, downOutY+28];
    } 
    else if (stationName === "西明石") {
        yPositions.push(upOutY - 15);
        yPositions.push(upInY - 15);
        yPositions.push(upInY + 15);
        yPositions.push(downInY - 15);
        yPositions.push(downInY + 15);
        yPositions.push(downOutY + 15);
    } 
    else if (stationName === "京都") {
        yPositions = [upOutY-20, upOutY+10, upInY-10, upInY+20, downInY-20, downInY+10, downOutY-10, downOutY+20];
    }
    else if (stationName === "尼崎") {
        yPositions = [upOutY-20, upOutY+10, upInY-10, upInY+20, downInY-20, downInY+10, downOutY-10, downOutY+20];
    }
    else if (stationName === "高槻") {
        yPositions = [upOutY-15, upOutY+15, upInY-15, upInY+15, downInY, downOutY];
    }
    else if (stationName === "新大阪") {
         let startY = upOutY - 20;
        rule.lanes.forEach((_, i) => yPositions.push(startY + (i * 35)));
    }
    else if (["舞子","垂水","須磨","芦屋","甲南山手","さくら夙川","西宮","摩耶","朝霧","須磨海浜公園","新長田","JR総持寺","島本","桂川","東姫路","御着","塩屋"].includes(stationName)) {
        if (rule.lanes.length === 6) { 
         yPositions = [upOutY, upInY-28, upInY, downInY, downInY+28, downOutY];
        } else if (rule.lanes.length === 4) {
         yPositions = [upOutY, upInY, downInY, downOutY];
        } else if (stationName === "東姫路" || stationName === "御着") {
         /* 姫路口は複線なので内側線が無い。上り線・下り線に割り当てる。
            (以前は内側線の座標を使っていて、存在しない線路に
             番線が付いていた) */
         yPositions = [upOutY, downOutY];
         if (rule.lanes.length > 2) yPositions.push(upOutY - 28);
        }
    } 
    else if (["大津京", "おごと温泉", "堅田", "近江舞子", "安曇川", "近江今津", "永原", "新三田", "宝塚", "川西池田", "京橋", "放出"].includes(stationName)) {
        // ★湖西線・福知山線の待避可能駅 (2面4線)
        yPositions = [upOutY - 15, upOutY + 15, downOutY - 15, downOutY + 15];
    }
    else if (["道場", "塚口"].includes(stationName)) {
        // ★福知山線の待避可能駅 (2面3線)
        yPositions = [upOutY - 15, upOutY + 15, downOutY];
    }
    else if (["唐崎", "比叡山坂本", "小野", "和邇", "蓬莱", "志賀", "比良", "北小松", "近江高島", "新旭", "近江中庄", "マキノ", "三田", "武田尾", "西宮名塩", "生瀬", "中山寺", "北伊丹", "伊丹", "猪名寺", "加島", "御幣島", "海老江", "新福島", "北新地", "大阪天満宮", "大阪城北詰", "鴫野"].includes(stationName)) {
        // ★湖西線・福知山線・東西線の待避なし駅 (2面2線)
        yPositions = [upOutY, downOutY];
    }
    else {
        let stIdx = STATION_MAP[stationName];
        /* 複線区間 (草津から東 / 西明石から西) は内側線が無いので、
           番線はすべて上り線・下り線の2本に割り当てる。
           ★以前は西明石から西も複々線として扱っていたため、
             加古川・大久保などの番線が「存在しない内側線」に
             割り当てられていた。 */
        if (stIdx !== undefined &&
            (stIdx > STATION_MAP["草津"] || stIdx < STATION_MAP["西明石"])) {
        // 複線区間のホーム配置
        if (rule.lanes.length === 1) yPositions = [upOutY];
        else if (rule.lanes.length === 2) yPositions = [upOutY, downOutY];
        /* 中線 (上下どちらからも使える真ん中の線) は、上り線の2本目として持つ。
           ★以前は内側線の座標 (upInY) を借りていたが、複線区間に内側線は
             存在しないため、番線が「線路の無い所」に割り当てられていた。 */
        else if (rule.lanes.length === 3) yPositions = [upOutY, upOutY + 40, downOutY];
        else {
            // 米原・長浜・敦賀などの大規模駅
            let half = Math.ceil(rule.lanes.length / 2);
            for(let i=0; i<half; i++) yPositions.push(upOutY + (i*28) - 28);
            for(let i=half; i<rule.lanes.length; i++) yPositions.push(downOutY + ((i-half)*28) - 14);
        }
        } else {
        // 複々線区間のホーム配置
        if (rule.lanes.length >= 1) yPositions.push(upOutY);
        if (rule.lanes.length >= 2) yPositions.push(upInY);
        if (rule.lanes.length >= 3) yPositions.push(downInY);
        if (rule.lanes.length >= 4) yPositions.push(downOutY);
        }
    }


    return yPositions;
}

/* ------------------------------------------------------------------ 番線の対応表

   ■ 何を解決するか
     STATION_PLATFORM_RULES.labels は「駅全体で上から下へ並べた番線」で、
     並びは stationLaneYPositions() が返す位置と同じ順になっている。
     いっぽうシミュレーションの在線は「線路ID ごとのレーン」で持っている。

     画面側はこの2つを突き合わせずに rule.labels[レーン番号] と引いていたため、
     どの線路でも labels[0] になり、4本の線路すべてが「1番線」と表示されていた。
     発車標は (lane + 1) という、配線とまったく関係のない数字を出していた。

     ここで (駅, 線路ID, レーン番号) → 番線 の対応表を1か所で作り、
     Super-TID の線路図・駅の在線表・列車情報・発車標が
     すべて同じ配線データを見るようにする。

   ■ どうやって対応づけるか
     stationLaneYPositions() に、4本の線路の目印として
     離れた数値 (0 / 1000 / 2000 / 3000) を渡す。
     戻ってきた値を 1000 で割れば、その番線がどの線路に属するかが分かる。
     同じ線路に複数あるときは、labels の並び順がそのままレーン番号になる。
     (例: 石山の上り外は [0]="4"番線, [4]="上待"=待避線 の2レーン)
*/
const STATION_TRACK_ORDER = ["Up_Out", "Up_In", "Down_In", "Down_Out"];
const _stationLaneMapCache = {};

/** 仮想座標 (0/1000/2000/3000 を目印に渡したときの戻り値) から線路IDを引く */
function _trackOfVirtual(v) {
    let k = Math.round(v / 1000);
    if (k < 0) k = 0;
    if (k > 3) k = 3;
    return k;
}

/**
 * その駅の 線路ID → [{label, platform, virt}] (レーン番号順)。
 *
 *   label    … 番線名 ("4" / "上待" など)
 *   platform … ホームがあるか
 *   virt     … 縦位置の仮想座標 (上り外=0, 上り内=K, 下り内=2K, 下り外=3K)
 *
 * シミュレーションのレーン数のほうが多い駅では、余ったレーンを
 * 待避線 (副本線) として自動で足す。配線略図でも、これらの駅の
 * 外側線には駅の前後で分かれて戻る待避線が描かれている。
 * こうすることで「番線名の付いていないレーン」が無くなり、
 * 線路図・駅の在線表・列車情報・発車標がすべて同じ配線を見る。
 */
function stationLaneMap(stationName, trackMgr) {
    const cached = _stationLaneMapCache[stationName];
    if (cached) return cached;
    const rule = STATION_PLATFORM_RULES[stationName];
    const out = { Up_Out: [], Up_In: [], Down_In: [], Down_Out: [] };
    if (!rule) return out;

    const K = 1000;
    const ys = stationLaneYPositions(stationName, 0, K, 2 * K, 3 * K);
    for (let i = 0; i < ys.length && i < rule.labels.length; i++) {
        const k = _trackOfVirtual(ys[i]);
        out[STATION_TRACK_ORDER[k]].push({
            label: rule.labels[i], platform: !!rule.lanes[i], virt: ys[i]
        });
    }

    /* シミュレーションのレーン数に足りないぶんは待避線として足す。
       (外側線の外側に置く。配線略図の待避線と同じ位置) */
    const mgr = trackMgr || (typeof game !== "undefined" && game ? game.trackMgr : null);
    if (mgr && STATION_MAP[stationName] !== undefined) {
        STATION_TRACK_ORDER.forEach((tid, k) => {
            const blks = mgr.blocks[tid];
            if (!blks) return;
            const b = blks.find(x => x.stationIdx === STATION_MAP[stationName] && x.x !== -1000);
            if (!b) return;
            const arr = out[tid];
            const anchor = k * K;
            const outward = (tid === "Up_Out") ? -1 : (tid === "Down_Out") ? +1 : +1;
            let n = 1;
            while (arr.length < b.lanes.length) {
                arr.push({
                    label: (tid.indexOf("Up") === 0 ? "上待" : "下待") + (n > 1 ? n : ""),
                    platform: false,
                    virt: anchor + outward * (30 + 20 * n)
                });
                n++;
            }
            // 定義のほうが多い場合は、実際に使えるレーンぶんだけ残す
            if (arr.length > b.lanes.length) arr.length = b.lanes.length;
        });
    }
    _stationLaneMapCache[stationName] = out;
    return out;
}

/** 分岐線・北方貨物線の線路IDを、駅の配線での線路IDに読み替える */
function _laneKeyOf(trackId) {
    if (/^(Kosei|Fukuchi|Tozai)_Up$/.test(trackId)) return "Up_Out";
    if (/^(Kosei|Fukuchi|Tozai)_Down$/.test(trackId)) return "Down_Out";
    if (trackId === "Up_Hoppo") return "Up_Out";
    if (trackId === "Down_Hoppo") return "Down_Out";
    return trackId;
}

/** (駅, 線路ID, レーン番号) の番線名。無ければ null */
function platformLabelOf(stationName, trackId, lane) {
    const arr = stationLaneMap(stationName)[_laneKeyOf(trackId)];
    if (!arr || !arr.length) return null;
    const e = arr[Math.min(Math.max(lane, 0), arr.length - 1)];
    return e ? e.label : null;
}

/** その番線にホームがあるか (側線・待避線なら false) */
function isPlatformLane(stationName, trackId, lane) {
    const arr = stationLaneMap(stationName)[_laneKeyOf(trackId)];
    if (!arr || !arr.length) return false;
    const e = arr[Math.min(Math.max(lane, 0), arr.length - 1)];
    return e ? e.platform : false;
}

/** (駅, 線路ID, レーン番号) の縦位置の仮想座標。無ければ null */
function laneVirtualY(stationName, trackId, lane) {
    const arr = stationLaneMap(stationName)[_laneKeyOf(trackId)];
    if (!arr || !arr.length) return null;
    const e = arr[Math.min(Math.max(lane, 0), arr.length - 1)];
    return e ? e.virt : null;
}

/** 番線の呼び方。数字なら「4番線」、「上待」などはそのまま */
function platformText(label) {
    if (label === null || label === undefined || label === "") return "";
    return /^[0-9]+$/.test(String(label)) ? label + "番線" : String(label);
}

/**
 * その列車がいま「駅に居る」なら番線を返す。駅間なら null。
 * 画面に番線を出すときは必ずここを通す。
 */
function trainPlatformLabel(game, t) {
    if (!t || t.state === "in_depot" || t.state === "finished") return null;
    const blks = game.trackMgr.blocks[t.trackId];
    if (!blks) return null;
    const b = blks[t.currBlockIndex];
    if (!b || b.x === -1000) return null;
    if (!b.isStation && !b.hoppoStationName) return null;   // 駅間は出さない
    const st = blockStationName(b);
    if (!st) return null;
    return platformLabelOf(st, t.trackId, t.lane);
}
