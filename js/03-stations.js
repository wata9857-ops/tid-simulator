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
    "立花": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "尼崎": { labels:["9","8","7","6","5","4","3","2","1"], lanes:[false,true,true,true,true,true,true,true,true] }, "塚本": { labels:["1","2","3","4"], lanes:[true,true,true,true] }, "大阪": { labels:["8","10","11","7","9","6","4","5","3"], lanes:[true,true,true,true,true,true,true,true,true] },
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

/* 内側線と外側線を行き来できる駅 (転線できる駅)。
   ★「方向を変えられる駅」ではない。方転できるかは canReverseAt() で見る。
     この表には 長岡京・西宮・向日町・茨木・川西池田 のように
     同じ向きどうしの渡り線しか無い駅も入っている。 */
const SWITCHABLE_STATIONS = ["新三田", "宝塚", "川西池田", "塚口", "放出", "京橋",
    "京都", "向日町", "長岡京", "高槻", "茨木", "新大阪", "大阪", "尼崎", "芦屋", "西宮", "須磨", "大久保", "加古川", "宝殿", "御着", "姫路", "西明石", "草津", "野洲", "米原", "長浜", "近江塩津", "敦賀",
    "堅田", "近江舞子", "近江今津" // ★追加
];
/* 待避 (追い抜き) ができる駅。これも方転できるかとは別。 */
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
 * 駅ごとに書き起こした「番線の縦位置」(素の配置)。
 *
 * 旅客向けの線路図 (js/17-renderer.js) と Super-TID の線路図
 * (js/41-tid-render.js) は、上下の並び順も間隔も違うが、
 * 「どの番線がどの線路の何番目にあるか」は同じ。
 * そこで、4本の基準線の縦位置を渡すと番線の縦位置の配列を返す形にした。
 *
 * ★ここが返すのは「書き起こしたぶんだけ」で、駅によっては
 *   線路が実際に持っているレーンの数と食い違う。
 *   その穴埋めは stationLaneSlots() が行う。
 *   画面から呼ぶときは stationLaneSlots() / stationLaneYPositions() を使うこと。
 */
function stationLaneBaseYs(stationName, upOutY, upInY, downInY, downOutY) {
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
        /* 3〜11番のりば。番線と線路の対応 (配線略図 スクリーンショット(697).png)
             8番  … 上り外側線 (列車線)。新快速・快速
             10・11番 … 8番の北側。JR宝塚線(上り)・特急・朝夕の優等
             7番  … 上り内側線 (電車線)。普通
             9番  … 7番から渡り線で入れる予備の上りホーム
             6番  … 下り内側線 (電車線)。普通
             4番  … 6番から渡り線で入れる予備の下りホーム
             5番  … 下り外側線 (列車線)。新快速・快速
             3番  … 5番の南側。JR宝塚線(下り)・特急・朝夕の優等

           ★9・10番と3・4番は、列車線からも電車線からも入れる。
             電車線に1本ずつしか番線を与えないと、大阪の下り電車線
             (6番) に普通と快速が集まって捌けなくなる
             (実測: 大阪の下り快速が 4本/時 → 0.8本/時)。
             実物にも渡り線があるので、電車線側にも予備のホームを持たせる。
           ★以前は 7番が下り内側に付いていた (実際は上り)。 */
        yPositions = [upOutY, upOutY - 26, upOutY - 52,
                      upInY, upInY - 26,
                      downInY, downInY + 26,
                      downOutY, downOutY + 26];
    }
    else if (stationName === "尼崎") {
        /* 上から 9番 (ホームの無い通過線) / 8番 … 1番。
           上り外 9,8 / 上り内 7,6,5 / 下り内 4,3 / 下り外 2,1 */
        yPositions = [upOutY - 22, upOutY + 8,
                      upInY - 22, upInY, upInY + 22,
                      downInY - 10, downInY + 20,
                      downOutY - 10, downOutY + 20];
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
    else if (stationName === "高槻") {
        yPositions = [upOutY-15, upOutY+15, upInY-15, upInY+15, downInY, downOutY];
    }
    else if (stationName === "新大阪") {
        /* ★以前は「上り外の少し上から 35 ずつ下へ」という並べ方だった。
           この関数は 4本の線路の縦位置を引数で受け取る作りなので、
           35 という決め打ちの間隔では、11本ぜんぶが上り外に属する
           ことになってしまう (番線と線路の対応表 stationLaneMap も、
           線路図の取付線も、すべて上り外に集まっていた)。
           実際の新大阪は 上り2面4線＋下り2面4線＋おおさか東線 なので、
           4本の線路にそれぞれ割り当てる。
             上り外 … 上通 / 10 / 9
             上り内 … 8 / 7 / 6
             下り内 … 5 / 4 / 3
             下り外 … 2 / 1 (おおさか東線ホーム側) */
        yPositions = [upOutY - 26, upOutY, upOutY + 26,
                      upInY - 26, upInY, upInY + 26,
                      downInY - 26, downInY, downInY + 26,
                      downOutY - 13, downOutY + 13];
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

/* ------------------------------------------------------------------ 線路ごとのレーン数

   ■ なぜ1か所に出したか
     「この駅のこの線路は何本のレーンを持つか」は、これまで
     TrackManager.initBlocks() の中に if の連なりで書かれていた。
     いっぽう番線の縦位置 (stationLaneBaseYs) は別に書かれていて、
     両者が食い違っていた駅が 86駅中 23駅あった。

     食い違うと、次のような壊れ方をする。
       ・番線の定義のほうが多い (神戸・甲子園口・茨木・草津)
         → 縦位置の無い番線が黙って捨てられ、そのレーンに入った列車は
           「線路の描かれていない高さ」に描かれる。
       ・レーンのほうが多い (高槻・西明石・尼崎・米原など)
         → 余ったレーンが「上待」「下待」として自動で足されるが、
           そこにも線路が描かれないので、やはり列車だけが宙に浮く。
     どちらも、その列車の表示が別の番線の札や列車と重なる原因になる。
     (実測: 草津で列車表示どうしが 1248px² 重なっていた)

   ■ 直し方
     レーン数をここ1か所に置き、TrackManager も線路図も同じ値を見る。
     そのうえで stationLaneSlots() が「実際にあるレーンぜんぶ」の
     縦位置を返すようにして、線路の無い所に列車が出ないようにした。 */

const STATION_LANES_2 = ["京都", "尼崎", "西明石", "姫路", "高槻", "加古川", "宝殿",
    "草津", "野洲", "河瀬", "安土", "米原", "長浜", "近江塩津", "敦賀"];

/* ------------------------------------------------------------------ 駅が属する線区

   ■ 何を直すためのものか
     湖西線・JR宝塚線・JR東西線の駅は、本線と同じインデックス空間を
     共有している (js/03-stations.js の STATION_MAP を参照)。
     そのため、内側線 (電車線) があるかどうかを
     「インデックスが西明石〜草津のあいだか」だけで判定していた
     stationMainLaneCount() が、分岐線の駅にも内側線があると答えていた。

     結果、次の27駅に「実在しない番線」が2本ずつ生えていた。
       JR東西線   加島・御幣島・海老江・新福島・北新地・
                  大阪天満宮・大阪城北詰・京橋・鴫野・放出
       JR宝塚線   新三田・三田・道場・武田尾・西宮名塩・生瀬・宝塚・
                  中山寺・川西池田・北伊丹・伊丹・猪名寺・塚口
       湖西線     大津京・唐崎・比叡山坂本・おごと温泉
     stationLaneSlots() が余ったレーンを「上待」「下待」として
     自動で足すため、実際には1面2線しかない 大阪天満宮・大阪城北詰 が
     4番線あるように表示されていた。
     (配線略図 スクリーンショット(711).png のとおり、JR東西線の
      大阪城北詰〜海老江はいずれも島式1面2線)

     さらに TrackManager が持つレーン数 (上下1本ずつ) と食い違うので、
     「線路の無い番線」と「番線の無い線路」が同時に生まれていた。

   ■ 直し方
     駅がどの線区に属するかを1か所で引けるようにして、
     分岐線の駅は上り線・下り線の2本だけを持つようにする。
     レーン数は番線の書き起こし (stationLaneBaseYs) から数えるので、
     TrackManager・線路図・番線の対応表がすべて同じ値を見る。 */
const BRANCH_LINE_OF = {};
(function () {
    const add = (map, line) => {
        for (const k in map) {
            const n = map[k];
            // 尼崎・山科・近江塩津は本線と共用の駅なので本線として扱う
            if (n === "尼崎" || n === "山科" || n === "近江塩津") continue;
            BRANCH_LINE_OF[n] = line;
        }
    };
    add(KOSEI_STATIONS_MAP, "kosei");
    add(FUKUCHI_STATIONS_MAP, "fukuchi");
    add(TOZAI_STATIONS_MAP, "tozai");
})();

/** その駅が属する分岐線 ("kosei"/"fukuchi"/"tozai")。本線の駅なら null。 */
function stationBranchLine(name) { return BRANCH_LINE_OF[name] || null; }

/**
 * 分岐線の駅の、上り線・下り線それぞれのレーン数。
 * 番線の書き起こし (stationLaneBaseYs) を数えて決めるので、
 * 「番線の数」と「線路の数」が必ず一致する。
 */
const _branchLaneCache = {};
function stationBranchLanes(name) {
    const hit = _branchLaneCache[name];
    if (hit) return hit;
    const rule = STATION_PLATFORM_RULES[name];
    let up = 1, down = 1;
    if (rule) {
        const K = 1000;
        // 分岐線の駅は stationLaneBaseYs が上り線(0)・下り線(K) に割り当てる
        const base = stationLaneBaseYs(name, 0, K, 2 * K, 3 * K);
        let u = 0, d = 0;
        for (let i = 0; i < base.length && i < rule.labels.length; i++) {
            if (_trackOfVirtual(base[i]) <= 1) u++; else d++;
        }
        if (u + d > 0) { up = Math.max(1, u); down = Math.max(1, d); }
    }
    const out = { up: up, down: down };
    _branchLaneCache[name] = out;
    return out;
}

/** その駅・その線路のレーン数 (本線のみ。0 ならその線路はその駅に無い) */
function stationMainLaneCount(stName, trackId) {
    const idx = STATION_MAP[stName];
    const isInner = (trackId === "Up_In" || trackId === "Down_In");

    /* ★分岐線 (湖西線・JR宝塚線・JR東西線) の駅は上下1線ずつの複線。
       本線とインデックスを共有しているので、インデックスだけで
       内側線の有無を決めるとここに内側線が生えてしまう。 */
    const branch = stationBranchLine(stName);
    if (branch) {
        if (isInner) return 0;
        const n = stationBranchLanes(stName);
        return (trackId === "Up_Out") ? n.up : n.down;
    }

    // 内側線 (電車線) があるのは複々線の西明石〜草津だけ
    if (isInner && (idx === undefined ||
        idx < STATION_MAP["西明石"] || idx > STATION_MAP["草津"])) return 0;

    if (stName === "大阪") {
        /* 3〜11番のりば。番線と線路の対応 (配線略図 スクリーンショット(697).png)
             上り外 (列車線) … 8・9・10・11番
             上り内 (電車線) … 7番
             下り内 (電車線) … 6番
             下り外 (列車線) … 5・4・3番
           ★以前は 上り外2 / 上り内2 / 下り内3 / 下り外2 で、
             7番が下り線に付いていた (実際は上り)。 */
        if (trackId === "Up_Out") return 3;     // 8・10・11番
        if (trackId === "Up_In") return 2;      // 7・9番
        if (trackId === "Down_In") return 2;    // 6・4番
        return 2;                               // Down_Out 5・3番
    }
    if (stName === "尼崎") {
        /* 島式4面8線 ＋ 北側の通過線 (9番)。
             上り外 … 9 (通過線) ・8
             上り内 … 7 (宝塚線・東西線) ・6・5
             下り内 … 4・3
             下り外 … 2・1 */
        if (trackId === "Up_In") return 3;
        return 2;
    }
    if (stName === "新大阪") {
        /* 上り2面4線・下り2面4線・おおさか東線ホームで 11番線。
           下り外は 1・2番のりばの2本。 */
        return (trackId === "Down_Out") ? 2 : 3;
    }
    /* 向日町操は吹田総合車両所京都支所の構内。発着線が並ぶので
       4本とも2レーンずつ持つ (js/05-track-manager.js もこの値を使う)。 */
    if (stName === "向日町操") return 2;
    if (STATION_LANES_2.indexOf(stName) >= 0) return 2;
    if (stName === "能登川" && trackId.indexOf("Up") === 0) return 2;
    if (stName === "近江八幡" && trackId.indexOf("Down") === 0) return 2;
    if (["芦屋", "須磨", "神戸"].indexOf(stName) >= 0 && isInner) return 2;
    if (stName === "大久保") return 2;
    if (["ひめじ別所", "鷹取", "西大路"].indexOf(stName) >= 0 &&
        trackId.indexOf("Out") >= 0) return 2;
    /* 配線略図 (スクリーンショット(692).png など) にある待避線。
       外側線の外側に、駅の前後で本線から分かれて戻る線がある。 */
    if (["膳所", "石山"].indexOf(stName) >= 0 && trackId.indexOf("Out") >= 0) return 2;
    if (["摩耶", "西宮", "茨木"].indexOf(stName) >= 0) return 2;
    return 1;
}

/**
 * その駅の、本線4線ぶんのレーン数。
 *
 * ★書き起こした番線 (stationLaneBaseYs) のほうが多い線路は、そちらに合わせる。
 *   例: 御着・東加古川・土山は「3番/2番/1番」の3面で、
 *       上り線に2本 (本線＋中線) が要る。レーンを1本しか作らないと、
 *       中線の番線が行き場を失い、線路の描かれていない高さに
 *       列車が出ることになる。番線の定義のほうが実物に近いので、
 *       線路の本数をそちらへ合わせる。
 */
function stationTrackLanes(stName) {
    const out = {};
    STATION_TRACK_ORDER.forEach(tid => { out[tid] = stationMainLaneCount(stName, tid); });
    const rule = STATION_PLATFORM_RULES[stName];
    if (!rule) return out;
    const K = 1000;
    const base = stationLaneBaseYs(stName, 0, K, 2 * K, 3 * K);
    const cnt = { Up_Out: 0, Up_In: 0, Down_In: 0, Down_Out: 0 };
    for (let i = 0; i < base.length && i < rule.labels.length; i++) {
        cnt[STATION_TRACK_ORDER[_trackOfVirtual(base[i])]]++;
    }
    STATION_TRACK_ORDER.forEach(tid => {
        // その駅に無い線路 (複線区間の内側線) は増やさない
        if (out[tid] === 0) return;
        if (cnt[tid] > out[tid]) out[tid] = cnt[tid];
    });
    return out;
}

/* ------------------------------------------------------------------ 番線のレーン

   実際にあるレーンぜんぶについて
     y        … 縦位置
     label    … 番線名
     platform … ホームがあるか
     track    … どの線路に属するか
   を返す。書き起こした番線 (stationLaneBaseYs) が足りないときは、
   残りの番線名を順に割り当て、それでも足りなければ待避線として足す。
   足す位置は「その線路の外側」で、線路図でもそこに線路を描く。 */

const _stationSlotShape = {};      // 駅名 -> [{track, base, order}] (縦位置以外)

/** 目印の座標 (0/1000/2000/3000) で1回だけ調べた、レーンの構成 */
function _stationSlotShapeOf(stationName) {
    const hit = _stationSlotShape[stationName];
    if (hit) return hit;
    const rule = STATION_PLATFORM_RULES[stationName];
    if (!rule) return [];
    const K = 1000;
    const base = stationLaneBaseYs(stationName, 0, K, 2 * K, 3 * K);
    const counts = stationTrackLanes(stationName);
    const used = { Up_Out: 0, Up_In: 0, Down_In: 0, Down_Out: 0 };
    const shape = [];

    // 1. 書き起こした番線を、属する線路に割り当てる
    for (let i = 0; i < base.length && i < rule.labels.length; i++) {
        const tid = STATION_TRACK_ORDER[_trackOfVirtual(base[i])];
        shape.push({ track: tid, label: rule.labels[i], platform: !!rule.lanes[i],
                     base: base[i], order: 0, defined: true });
        used[tid]++;
    }

    /* 2. 空いているレーンを埋める。
          まだ使っていない番線名があればそれを当て、無ければ待避線にする。
          ★ここで当てる番線名の割り当ては、配線略図をまだ写していない駅
            (tools/check_topology.js 参照) では並び順までは保証できない。
            それでも「番線名が消える」「線路の無い所に列車が出る」よりは
            実物に近い。写した駅から順に stationLaneBaseYs へ移していく。 */
    let next = base.length;
    STATION_TRACK_ORDER.forEach(tid => {
        let n = 0;
        while (used[tid] < (counts[tid] || 0)) {
            n++;
            let label, plat;
            if (next < rule.labels.length) {
                label = rule.labels[next]; plat = !!rule.lanes[next]; next++;
            } else {
                label = (tid.indexOf("Up") === 0 ? "上待" : "下待") + (n > 1 ? n : "");
                plat = false;
            }
            shape.push({ track: tid, label: label, platform: plat,
                         base: null, order: n, defined: false });
            used[tid]++;
        }
    });

    _stationSlotShape[stationName] = shape;
    return shape;
}

/**
 * その駅の、実際にあるレーンぜんぶの縦位置。
 * 4本の基準線の縦位置を渡すと [{y, label, platform, track, index}] を返す。
 * index は STATION_PLATFORM_RULES.labels の番号 (自動で足した待避線は -1)。
 */
function stationLaneSlots(stationName, upOutY, upInY, downInY, downOutY) {
    const rule = STATION_PLATFORM_RULES[stationName];
    if (!rule) return [];
    const shape = _stationSlotShapeOf(stationName);
    const base = stationLaneBaseYs(stationName, upOutY, upInY, downInY, downOutY);
    const anchor = { Up_Out: upOutY, Up_In: upInY, Down_In: downInY, Down_Out: downOutY };
    /* 外側へずらす幅。4本の線路の全幅に対する割合で決めるので、
       旅客向け画面 (間隔120px) でも Super-TID (間隔を縮めている) でも
       同じ見え方になる。 */
    const step = (Math.abs(downOutY - upOutY) || 120) / 12;
    const outward = (tid) => (tid === "Up_Out") ? -1 : 1;

    const out = [];
    let bi = 0;
    shape.forEach(sh => {
        let y;
        if (sh.defined) { y = base[bi]; bi++; }
        else y = anchor[sh.track] + outward(sh.track) * step * sh.order;
        const li = rule.labels.indexOf(sh.label);
        out.push({ y: y, label: sh.label, platform: sh.platform, track: sh.track,
                   index: sh.defined ? (out.length) : (li >= 0 ? li : -1) });
    });
    return out;
}

/**
 * その駅の「番線が並ぶ縦位置」。
 * 実際にあるレーンぜんぶぶんを、STATION_PLATFORM_RULES.labels と同じ並びで返す。
 * (labels より多い場合、余りは自動で足した待避線)
 */
function stationLaneYPositions(stationName, upOutY, upInY, downInY, downOutY) {
    return stationLaneSlots(stationName, upOutY, upInY, downInY, downOutY).map(s => s.y);
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
 *   index    … STATION_PLATFORM_RULES[駅].labels の何番目か
 *               (自動で足した待避線は -1)。
 *               ★線路図はこの番号で縦位置を引く。以前は入れていなかったので、
 *                 Super-TID の laneY() が必ず「線路の定位置から18pxずつ」という
 *                 代替の計算に落ちていた。そのため大きな駅では
 *                 列車が番線と違う高さに描かれ、表示どうしも重なっていた。
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
    const out = { Up_Out: [], Up_In: [], Down_In: [], Down_Out: [] };
    if (!STATION_PLATFORM_RULES[stationName]) return out;

    /* ★レーンの構成は stationLaneSlots() が1か所で決める。
       以前はここで独自に待避線を足していたので、線路図が描く位置と
       この表が食い違うことがあった。 */
    const K = 1000;
    const slots = stationLaneSlots(stationName, 0, K, 2 * K, 3 * K);
    slots.forEach((sl, i) => {
        out[sl.track].push({
            label: sl.label, platform: sl.platform, virt: sl.y,
            index: i,                    // stationLaneSlots の並びでの番号
            side: !sl.platform           // ホームの無い側線か
        });
    });
    _stationLaneMapCache[stationName] = out;
    return out;
}

/**
 * その駅の番線が「どの線路に属するか」を、labels と同じ並びで返す。
 *
 * 線路図で番線を描くとき、その番線を本線のどの線につなげばよいかを
 * 知る必要がある。stationLaneMap() は線路IDごとに分けた表を作るが、
 * 「labels の i 番目はどの線路か」を直接引ける形が無かったので用意した。
 * (Super-TID の線路図が、待避線を「いちばん近い線路」につないでいたため、
 *  上り待避線が下り線につながって見えることがあった)
 *
 * 戻り値は STATION_PLATFORM_RULES[stationName].labels と同じ長さの配列で、
 * 中身は "Up_Out" / "Up_In" / "Down_In" / "Down_Out" のいずれか。
 */
const _stationLaneTrackCache = {};
function stationLaneTracks(stationName) {
    const cached = _stationLaneTrackCache[stationName];
    if (cached) return cached;
    if (!STATION_PLATFORM_RULES[stationName]) return [];
    const K = 1000;
    const out = stationLaneSlots(stationName, 0, K, 2 * K, 3 * K).map(sl => sl.track);
    _stationLaneTrackCache[stationName] = out;
    return out;
}

/* ------------------------------------------------------------------ 駅の進路

   ■ なぜ必要か
     これまでは「その駅のその線路のレーンなら、どれでも使える」という
     扱いだった。実際の駅は、番線と線路のつながりが決まっていて、
     どの番線からどの線へ出られるか・どの線からどの番線へ入れるかは
     転てつ器の配線で限られている。
     そこを見ていなかったため
       ・下り外側線から到着した列車が、つながっていない番線に入る
       ・その番線から出られない線へ発車する
       ・引上線につながっていない番線の列車が折り返す
     という、線路の上ではあり得ない動きが起きていた。

   ■ 書き方
     arrive … その線路から「入れる」番線 (到着)
     depart … その番線から「出られる」線路 (発車)
     drawUp … 引上線。from に書いた番線からしか入れない。

     番線は STATION_PLATFORM_RULES の labels と同じ文字で書く。
     ここに無い駅は、これまでどおり制限なし (その線路のレーンならどれでも)。

   ■ 元にした資料
     尼崎 … 配線略図 スクリーンショット(709).png / (711).png
     大阪 … 配線略図 スクリーンショット(697).png
     京都 … 配線略図 スクリーンショット(693).png / (680).png
*/
const STATION_ROUTES = {
    /* 尼崎。島式4面8線 ＋ 北側の通過線 (9番)。
         外側線 … 1番 (下り) / 8番 (上り)
         内側線 … 4番 (下り) / 5番 (上り)
         JR宝塚線・JR東西線 … 2番 (下り) / 7番 (上り) */
    "尼崎": {
        arrive: {
            Down_Out:    ["1", "2"],
            Tozai_Down:  ["2", "3", "4"],
            Down_In:     ["3", "4"],
            Up_Out:      ["9", "8"],
            Fukuchi_Up:  ["9", "8", "7", "6"],
            Up_In:       ["7", "6", "5"]
        },
        depart: {
            Down_Out:      ["1", "2"],
            Fukuchi_Down:  ["2", "3"],
            Down_In:       ["2", "3", "4"],
            Up_Out:        ["9", "8", "7"],
            Tozai_Up:      ["7", "6", "5"],
            Up_In:         ["6", "5"]
        },
        /* 西側 (塚本方) の引上線。配線略図のとおり 4番・5番だけにつながる。 */
        drawUp: [{ label: "西引上線", from: ["4", "5"], side: "W" }]
    },

    /* 大阪。3〜11番のりば。
         5番 … 下り外側線 (列車線)  新快速・快速
         6番 … 下り内側線 (電車線)  普通
         7番 … 上り内側線 (電車線)  普通
         8番 … 上り外側線 (列車線)  新快速・快速
         3・4番 … 5番の南側 (JR宝塚線 下り・特急・朝夕の優等)
         9・10・11番 … 8番の北側 (JR宝塚線 上り・特急・朝夕の優等) */
    "大阪": {
        arrive: {
            Down_Out: ["5", "3"],
            Down_In:  ["6", "4"],
            Up_In:    ["7", "9"],
            Up_Out:   ["8", "10", "11"]
        },
        depart: {
            Down_Out: ["5", "3"],
            Down_In:  ["6", "4"],
            Up_In:    ["7", "9"],
            Up_Out:   ["8", "10", "11"]
        },
        /* 引上線。東海道線のホームの東 (京都方) と西 (神戸方) に1本ずつ。
           大阪環状線のホームの西にも2本あるが、環状線はこの線路図の
           範囲外なので持たない。
           西引上線は、早朝のJR京都線の始発 (宮原から回送で入り、
           ここで方向を変える) と、1時ごろの最終列車の折り返しに使う。 */
        drawUp: [
            { label: "東引上線", from: ["8", "9", "10", "11"], side: "E" },
            { label: "西引上線", from: ["3", "4", "5", "6", "7"], side: "W" }
        ],
        /* 番線の使い分け (利用者の指摘 12-2)
             ふだん      新快速・快速 = 5番/8番、普通 = 6番/7番
             平日朝ラッシュ・平日17時以降 は 3・4・9・10番も使う */
        /* ★大阪では、JR宝塚線方向へ向きを変えられない。
           宝塚線の列車 (丹波路快速など) が大阪止まりになったときは、
           宮原まで回送して方向を変え、戻ってから宝塚線へ入る。
           詳しくは js/14-train-turnback.js の「大阪での方転」を参照。 */
        noReverseTo: ["Fukuchi_Down", "Fukuchi_Up"]
    },

    /* 京都。0番と2〜7番 (8〜10番は奈良線・特急で、この線路図の範囲外)。
         2・3番 … 琵琶湖線 上り (米原・草津方面)
         4・5番 … JR京都線 下り 内側線 (普通は4番、それ以外は5番)
         6・7番 … JR京都線 下り 外側線。朝と平日夕の新快速、
                   および琵琶湖線・湖西線・草津線からの当駅止まり */
    "京都": {
        arrive: {
            Up_Out:   ["下通", "0"],
            Up_In:    ["2", "3"],
            Down_In:  ["4", "5"],
            Down_Out: ["6", "7"]
        },
        depart: {
            Up_Out:   ["下通", "0"],
            Up_In:    ["2", "3"],
            Down_In:  ["4", "5"],
            Down_Out: ["6", "7"]
        },
        /* 駅の南側 (下り線の外側) に、西向きの行き止まり線が4本並ぶ。
           配線略図 スクリーンショット(693).png / (680).png。
           当駅止まりの折り返しと日中の留置に使う
           (留置場としては js/04-depots.js の "京都")。 */
        drawUp: [{ label: "京都駅 引上線", from: ["4", "5", "6", "7"], side: "W" }]
    }
};

/* ------------------------------------------------------------------ 番線の使い分け

   実際の運用では、同じ線路の中でも種別と時間帯で使う番線が決まっている。
     大阪 … 新快速・快速は 5番/8番、普通は 6番/7番。
             平日朝ラッシュは 3・4・9・10番も使い、
             平日17時以降は新快速が 3・4・9・10番も使う。
     京都 … JR京都線の普通は4番、それ以外は5番。
             朝と平日夕の新快速は6・7番。
   ここに書いた順に空いている番線を探す。
   書いていない駅・種別は、これまでどおり空いている番線から選ぶ。 */
const STATION_PLATFORM_USE = {
    "大阪": {
        "新快速": { normal: ["8", "5"], rush: ["8", "5", "10", "11", "3"],
                    evening: ["8", "5", "10", "11", "3"] },
        /* 快速は内側線のときは 7番/6番、外側線のときは 8番/5番。
           朝ラッシュ・夕方は 9・10・3・4番も使う。 */
        "快速":   { normal: ["8", "5", "7", "6"], rush: ["8", "5", "9", "10", "4", "3"],
                    evening: ["8", "5", "9", "10", "4", "3"] },
        "普通":   { normal: ["7", "6", "9", "4"], rush: ["7", "6", "9", "4"],
                    evening: ["7", "6", "9", "4"] },
        "特急":   { normal: ["10", "11", "3"] }
    },
    "京都": {
        "普通":   { normal: ["4", "2"] },
        "快速":   { normal: ["5", "3"] },
        "新快速": { normal: ["6", "7", "0"] }
    },
    "尼崎": {
        "新快速": { normal: ["8", "1"] },
        "快速":   { normal: ["8", "1", "7", "2", "5", "4"] },
        "普通":   { normal: ["5", "4", "6", "3", "7", "2"] }
    }
};

/** いまの時間帯の区分 ("rush" 平日朝 / "evening" 平日17時以降 / "normal") */
function stationUseBand(hour) {
    if (typeof isWeekday === "function" && !isWeekday()) return "normal";
    if (hour >= 7.0 && hour < 9.0) return "rush";
    if (hour >= 17.0 && hour < 19.5) return "evening";
    return "normal";
}

/**
 * その駅・その線路で、到着 (mode="arrive") または発車 (mode="depart") に
 * 使える番線のレーン番号。制限が書かれていなければ null (= 制限なし)。
 */
function stationRouteLanes(stName, trackId, mode) {
    const def = STATION_ROUTES[stName];
    if (!def || !def[mode]) return null;
    const labels = def[mode][trackId];
    if (!labels) return null;
    const out = [];
    labels.forEach(lb => {
        const at = stationLaneIndexOf(stName, trackId, lb);
        if (at >= 0) out.push(at);
    });
    return out.length ? out : null;
}

/** (駅, 線路, 番線名) → レーン番号。無ければ -1 */
function stationLaneIndexOf(stName, trackId, label) {
    const map = stationLaneMap(stName);
    const key = _laneKeyOf(trackId);
    let arr;
    if (STATION_SHARED_LANES[stName]) {
        const up = (key === "Up_Out" || key === "Up_In");
        arr = up ? map.Up_Out.concat(map.Up_In) : map.Down_In.concat(map.Down_Out);
    } else {
        arr = map[key] || [];
    }
    for (let i = 0; i < arr.length; i++) if (arr[i].label === label) return i;
    return -1;
}

/** その番線から、その線路へ発車できるか (制限が無ければ true) */
function canDepartTo(stName, fromTrackId, lane, toTrackId) {
    const allowed = stationRouteLanes(stName, toTrackId, "depart");
    if (!allowed) return true;
    return allowed.indexOf(lane) >= 0;
}

/** その線路から、その番線へ到着できるか (制限が無ければ true) */
function canArriveAt(stName, trackId, lane) {
    const allowed = stationRouteLanes(stName, trackId, "arrive");
    if (!allowed) return true;
    return allowed.indexOf(lane) >= 0;
}

/**
 * 到着に使う番線の希望順 (レーン番号の配列)。
 * 進路の制限と、種別・時間帯ごとの使い分けを合わせたもの。
 */
function stationPreferredLanes(stName, trackId, type, hour, mode) {
    const allowed = stationRouteLanes(stName, trackId, mode || "arrive");
    const use = (STATION_PLATFORM_USE[stName] || {})[type];
    if (!use) return allowed;          // 使い分けの定義が無ければ進路の制限だけ
    const band = stationUseBand(hour);
    const labels = use[band] || use.normal || [];
    const pref = [];
    labels.forEach(lb => {
        const at = stationLaneIndexOf(stName, trackId, lb);
        if (at < 0) return;
        if (allowed && allowed.indexOf(at) < 0) return;
        if (pref.indexOf(at) < 0) pref.push(at);
    });
    // 希望に無い番線も、進路がつながっていれば後ろに足す (満線のときの受け皿)
    (allowed || []).forEach(at => { if (pref.indexOf(at) < 0) pref.push(at); });
    return pref.length ? pref : allowed;
}

/** その駅に引上線があるか。あれば [{label, from, side}] */
function stationDrawUpTracks(stName) {
    const def = STATION_ROUTES[stName];
    return (def && def.drawUp) ? def.drawUp : [];
}

/* ------------------------------------------------------------------ 方転できない駅

   ■ 大阪・新大阪
     ホームで向きを変えて折り返すことはしない。
     実物では、東海道線のホームの東西にある引上線へ引き上げてから
     方向を変える。引き上げた列車はそのまま宮原 (網干総合車両所宮原支所)
     へ回送されるか、宮原から入ってきて折り返す。
       早朝のJR京都線の始発 … 宮原から回送 → 大阪の西引上線 → 方転 → 発車
       1時ごろの最終列車     … 大阪着 → 西引上線 → 宮原へ回送
     ★とくに丹波路快速のように JR宝塚線へ向かう列車は、大阪のホームで
       向きを変えて宝塚線へ入ることができない。宮原まで回送して方向を
       変え、戻ってから宝塚線へ入る。
     この線路図は引上線そのものを閉塞として持たないので、
     「大阪に着いた折り返し列車は宮原へ回送する」という形で表す。
     ホームを長くふさがないので、実物と同じく大阪の線路容量も保てる
     (ホーム折り返しにしたところ、大阪〜西明石の列車間隔が
      3.8駅 → 9.2駅 まで開いた)。

   ■ 尼崎
     西側の引上線は、配線略図のとおり 4番・5番だけにつながっている。
     折り返せるのはこの2つの番線に居る列車だけ。 */
const STATION_NO_PLATFORM_TURNBACK = ["大阪", "新大阪"];

/**
 * その駅・その番線で、ホーム (着発線) のまま折り返せるか。
 *
 *   toTrackId … 折り返したあとに走る線路 (分かれば渡り線の有無で判定する)
 *
 * 判定の順
 *   1. 大阪・新大阪 … 引上線へ引き上げないと方向を変えられない → false
 *   2. 到着した線路と発車する線路をつなぐ渡り線があるか
 *      (js/40-tid-theme.js の TID_JUNCTIONS。配線略図から書き起こしたもの)
 *   3. その番線から引上線へ入れるか
 *   4. 渡り線の定義が無い駅は、これまでどおり折り返せるものとする
 */
function canTurnBackOnPlatform(stName, trackId, lane, toTrackId) {
    if (STATION_NO_PLATFORM_TURNBACK.indexOf(stName) >= 0) return false;
    /* ★そもそも方転できない駅では、ホーム折り返しも構内折り返しもできない
       (js/03-stations.js の canReverseAt)。 */
    if (!canReverseAt(stName)) return false;

    /* --- 渡り線で反対方向の線路につながっているか

       ★以前は線路図の描画データ (js/40-tid-theme.js の TID_JUNCTIONS) を
         見ていたが、あのファイルは Super-TID の画面 (tid.html) でしか
         読み込まれない。そのため旅客向けの画面 (index.html) と
         Super-TID で折り返しの可否が違うというおかしな状態になっていた
         (検証も --tid を付けるかで結果が変わっていた)。
         上下をつなぐ渡り線は配線の事実なので、このファイルの
         STATION_REVERSE_BY_CROSSOVER から見る。 */
    if (toTrackId) {
        const pairs = STATION_REVERSE_BY_CROSSOVER[stName] || [];
        const linked = pairs.some(c =>
            (c[0] === trackId && c[1] === toTrackId) ||
            (c[1] === trackId && c[0] === toTrackId));
        if (linked) return true;
    }

    // --- 引上線につながる番線か
    const drawUps = stationDrawUpTracks(stName);
    if (drawUps.length) return canUseDrawUp(stName, trackId, lane);

    /* 渡り線の書き起こしが無い駅は、これまでどおり折り返せるものとする。
       (tools/check_turnouts.js が「折り返す駅はすべて渡り線か引上線を持つ」
        ことを見張っているので、書き起こしの進んだ駅では上で決まる) */
    return true;
}


/* ------------------------------------------------------------------ 方転できる駅

   「その駅で列車の向きを物理的に変えられるか」の表。
   根拠は同梱の配線略図 (スクリーンショット(690)〜(712).png) の読み取りで、
   README の「転てつ器（渡り線・分岐・側線）の総点検」と同じものである。

   方転できるのは、次のどれかを持つ駅だけ。
     1. 上り側の線路と下り側の線路をつなぐ渡り線
        複線区間なら上下本線をつなぐ渡り線。
        複々線区間なら「下り内側線と上り内側線をつなぐ渡り線」。
        ★同じ向きどうしの渡り線 (下り外↔下り内 など) では向きは変えられない。
     2. 引上線 … 行き止まりの線に引き上げてから反対方向へ出る
     3. 併設の車両基地 … 構内に入って方転する

   ■ なぜ表を分けたか
     以前は SWITCHABLE_STATIONS / OVERTAKE_STATIONS に入っているかどうかで
     折り返しを作っていた。しかしこの2つは
       SWITCHABLE_STATIONS … 内側線と外側線を行き来できる駅
       OVERTAKE_STATIONS  … 待避 (追い抜き) ができる駅
     の表であって、「向きを変えられる駅」ではない。
     そのため 長岡京 (下り外↔下り内 と 上り内↔上り外 の渡り線しか無い) で、
     遅れの回復のために自動で折り返しが発生していた。実物では不可能である。

   ■ 「できる駅」を止めてしまわないこと
     吹田は下り内側線と上り内側線をつなぐ両渡りを持つ (画像696)。
     芦屋・摩耶・灘・神戸・須磨・西明石・草津・尼崎も電車線どうしの渡り線を持つ。
     高槻は京都方の内側線のあいだに引上線2本を持つ (画像695)。
     これらは方転できる駅として扱う。
*/

/** 線路IDの向き (1=上り / -1=下り / 0=不明) */
function trackDirOf(trackId) {
    if (!trackId) return 0;
    if (/^Up_|_Up$/.test(trackId)) return 1;
    if (/^Down_|_Down$/.test(trackId)) return -1;
    return 0;
}

/* 上り側の線路と下り側の線路をつなぐ渡り線を持つ駅。
   これがあると、構内で向きを変えて折り返せる。
   配線略図 (スクリーンショット(690)〜(712).png) から読み取ったもので、
   Super-TID の描画データ (js/40-tid-theme.js の TID_JUNCTIONS) と
   同じ内容であることを tools/check_turnouts.js が照合している。

   ★同じ向きどうしの渡り線 (下り外↔下り内 など) はここに入らない。
     それでは向きを変えられないので、長岡京・向日町・茨木・兵庫・膳所などは
     この表に無い。 */
const STATION_REVERSE_BY_CROSSOVER = {
    // ---- 山陽本線 (複線区間) … 上下本線をつなぐ渡り線
    "姫路":     [["Up_Out", "Down_Out"]],
    "御着":     [["Up_Out", "Down_Out"]],
    "宝殿":     [["Up_Out", "Down_Out"]],
    "加古川":   [["Up_Out", "Down_Out"]],
    "東加古川": [["Up_Out", "Down_Out"]],
    "土山":     [["Up_Out", "Down_Out"]],
    "大久保":   [["Up_Out", "Down_Out"]],
    // ---- 複々線区間 … 下り内側線 (電車線) と上り内側線をつなぐ渡り線
    "西明石":   [["Up_In", "Down_In"]],
    "須磨":     [["Down_In", "Up_In"]],
    "摩耶":     [["Down_In", "Up_In"]],
    "灘":       [["Down_In", "Up_In"], ["Down_In", "Up_In"]],
    "神戸":     [["Down_In", "Up_In"]],
    "芦屋":     [["Down_In", "Up_In"]],
    "尼崎":     [["Down_In", "Up_In"]],
    "吹田":     [["Down_In", "Up_In"]],
    "草津":     [["Down_In", "Up_In"]],
    // ---- 琵琶湖線・北陸本線 (複線区間)
    "野洲":     [["Up_Out", "Down_Out"]],
    "篠原":     [["Up_Out", "Down_Out"]],
    "近江八幡": [["Up_Out", "Down_Out"]],
    "安土":     [["Up_Out", "Down_Out"]],
    "能登川":   [["Up_Out", "Down_Out"]],
    "河瀬":     [["Up_Out", "Down_Out"]],
    "彦根":     [["Up_Out", "Down_Out"]],
    "米原":     [["Up_Out", "Down_Out"]],
    "長浜":     [["Up_Out", "Down_Out"]],
    "虎姫":     [["Up_Out", "Down_Out"]],
    "高月":     [["Up_Out", "Down_Out"]],
    "木ノ本":   [["Up_Out", "Down_Out"]],
    "新疋田":   [["Up_Out", "Down_Out"]],
    "近江塩津": [["Up_Out", "Down_Out"]],
    "敦賀":     [["Up_Out", "Down_Out"]],
    // ---- 湖西線
    "大津京":   [["Kosei_Up", "Kosei_Down"]],
    "堅田":     [["Kosei_Up", "Kosei_Down"]],
    "和邇":     [["Kosei_Up", "Kosei_Down"]],
    "近江舞子": [["Kosei_Up", "Kosei_Down"]],
    "安曇川":   [["Kosei_Up", "Kosei_Down"]],
    "近江今津": [["Kosei_Up", "Kosei_Down"]],
    "永原":     [["Kosei_Up", "Kosei_Down"]],
    // ---- JR宝塚線 (福知山線)
    "塚口":     [["Fukuchi_Up", "Fukuchi_Down"], ["Fukuchi_Up", "Fukuchi_Down"]],
    "宝塚":     [["Fukuchi_Up", "Fukuchi_Down"], ["Fukuchi_Up", "Fukuchi_Down"]],
    "道場":     [["Fukuchi_Up", "Fukuchi_Down"]],
    "新三田":   [["Fukuchi_Up", "Fukuchi_Down"]],
    // ---- JR東西線・片町線
    "京橋":     [["Tozai_Up", "Tozai_Down"]],
    "放出":     [["Tozai_Up", "Tozai_Down"]]
};

/* 引上線・車両基地で方転できる駅。
   渡り線では上下がつながっていないが、引き上げれば向きを変えられる。 */
const STATION_REVERSE_BY_DRAWUP = {
    "大阪":     "環状線ホームの西2本・東海道ホームの東西各1本の引上線 (画像697)。" +
                "ホームでは方転できないので宮原まで引き上げる (STATION_NO_PLATFORM_TURNBACK)",
    "新大阪":   "駅に引上線が無く、宮原操へ引き上げて方転する (画像697/699)",
    "京都":     "駅の南側、4〜7番につながる引上線 (画像693/680)",
    "尼崎":     "西側の引上線 (4番・5番につながる)。渡り線もある (画像698/711)",
    "高槻":     "京都方、内側線のあいだの引上線2本。両渡りでつながる (画像695)",
    "京橋":     "大阪城北詰方の引上線。渡り線もある (画像711)",
    "鴫野":     "京橋方の引上線 (画像712)",
    "向日町操": "吹田総合車両所京都支所。構内で方転する (画像694/681)",
    "宮原操":   "網干総合車両所宮原支所。構内で方転する (画像699/683)"
};

/* 方転できない駅のうち、以前は折り返しに使っていたもの。
   「なぜ使えないか」を残しておく (README とも対応)。 */
const STATION_NO_REVERSE_NOTE = {
    "長岡京":     "下り外↔下り内 と 上り内↔上り外 の片渡りだけ。上下はつながらない (画像694)",
    "西宮":       "外側線の待避線への転てつ器だけ。上下をつなぐ渡り線が無い (画像698)",
    "川西池田":   "相対式2面2線。渡り線が無い (画像709)",
    "おごと温泉": "相対式2面2線。渡り線も待避線も無い (画像703)",
    "向日町":     "島式2面4線。同じ向きどうしの渡り線だけ。折り返しは向日町操へ入る (画像694)",
    "茨木":       "島式2面4線＋上下の待避線。上下をつなぐ渡り線が無い (画像695)"
};

/**
 * その駅で列車の向きを物理的に変えられるか。
 * 遅れの回復・詰まりの緩和が目的でも、false の駅で折り返してはいけない。
 */
function canReverseAt(stName) {
    if (!stName) return false;
    // 上り側と下り側をつなぐ渡り線があるか
    if (STATION_REVERSE_BY_CROSSOVER[stName]) return true;
    // 引上線・車両基地で方転できるか
    if (STATION_REVERSE_BY_DRAWUP[stName]) return true;
    // 進路の表 (STATION_ROUTES) に引上線があるか
    if (typeof stationDrawUpTracks === "function" && stationDrawUpTracks(stName).length) return true;
    // 併設の車両基地 (構内で方転できる)
    if (typeof DEPOTS !== "undefined" && DEPOTS[stName]) return true;
    return false;
}

/**
 * いまの位置から進行方向の前方で、いちばん近い「方転できる駅」。
 * 方転できない駅で折り返しを作らないための代わりの行先に使う。
 * 見つからなければ null。
 */
function nextReversibleAhead(stName, dir) {
    const here = STATION_MAP[stName];
    if (here === undefined) return null;
    for (let i = here + dir; i >= 0 && i < STATIONS.length; i += dir) {
        const n = STATIONS[i].name;
        if (STATIONS[i].isSeparateLine) continue;   // 向日町操などは本線の駅ではない
        if (canReverseAt(n)) return n;
    }
    return null;
}

/** その番線から引上線へ入れるか */
function canUseDrawUp(stName, trackId, lane) {
    const list = stationDrawUpTracks(stName);
    if (!list.length) return false;
    const map = stationLaneMap(stName);
    const e = stationLaneEntry(stName, trackId, lane);
    if (!e) return false;
    return list.some(d => d.from.indexOf(e.label) >= 0);
}

/* ------------------------------------------------------------------ 番線を共有する駅

   尼崎は、本線・JR宝塚線・JR東西線の列車が同じ番線に入る。
   TrackManager も、上り4本・下り4本のレーン配列を4つの線路で共有している
   (js/05-track-manager.js の amaUpLanes / amaDownLanes)。

   そのため番線は「線路IDごとの何番目か」ではなく
   「上り側の通し番号 / 下り側の通し番号」で決まる。
   ★ここを線路IDごとに引いていたため、レーン2・3の列車がどちらも
     「その線路の最後のレーン」に丸められ、まったく同じ高さに
     2本の列車が描かれていた (実測 1872px² の重なり)。 */
const STATION_SHARED_LANES = { "尼崎": true };

/**
 * (駅, 線路ID, レーン番号) が指す番線のレーン情報を返す。無ければ null。
 * 番線を共有する駅では、上り側・下り側の通し番号で引く。
 */
function stationLaneEntry(stationName, trackId, lane) {
    const map = stationLaneMap(stationName);
    const key = _laneKeyOf(trackId);
    let arr;
    if (STATION_SHARED_LANES[stationName]) {
        const up = (key === "Up_Out" || key === "Up_In");
        arr = up ? map.Up_Out.concat(map.Up_In) : map.Down_In.concat(map.Down_Out);
    } else {
        arr = map[key];
    }
    if (!arr || !arr.length) return null;
    return arr[Math.min(Math.max(lane, 0), arr.length - 1)] || null;
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
    const e = stationLaneEntry(stationName, trackId, lane);
    return e ? e.label : null;
}

/** その番線にホームがあるか (側線・待避線なら false) */
function isPlatformLane(stationName, trackId, lane) {
    const e = stationLaneEntry(stationName, trackId, lane);
    return e ? e.platform : false;
}

/** (駅, 線路ID, レーン番号) の縦位置の仮想座標。無ければ null */
function laneVirtualY(stationName, trackId, lane) {
    const e = stationLaneEntry(stationName, trackId, lane);
    return e ? e.virt : null;
}

/**
 * (駅, 線路ID, レーン番号) の縦位置。
 * 4本の基準線の縦位置を渡すと、その番線の位置を返す。無ければ null。
 *
 * ★番線名と同じ対応表 (stationLaneEntry / stationLaneYPositions) から
 *   引くので、画面に描く位置と、駅の在線表・列車情報・発車標に出る
 *   番線名が必ず一致する。
 *   尼崎のように本線・JR宝塚線・JR東西線が着発線を共有する駅でも、
 *   どの線区の列車も「その番線の位置」に描かれる。
 */
function stationLaneY(stName, trackId, lane, upOutY, upInY, downInY, downOutY) {
    const e = stationLaneEntry(stName, trackId, lane);
    if (!e || !(e.index >= 0)) return null;
    const ys = stationLaneYPositions(stName, upOutY, upInY, downInY, downOutY);
    return (ys[e.index] !== undefined) ? ys[e.index] : null;
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
