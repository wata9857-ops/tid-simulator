/* このファイルは index.html から分割されたものです。
   駅一覧・番線ルール・STATION_MAP・線路(TRACKS)・臨時列車の定義 */
/* 姫路より西 (山陽本線 上郡方・赤穂線) の駅のぶんだけ、本線・分岐線の
   インデックスをずらす値。インデックスを数字で書く所は
   すべて W(姫路を0としたときの番号) で書く (js/05-track-manager.js なども同じ)。

   姫路より西の並び (配線略図 スクリーンショット(723)〜(725).png)
     0 播州赤穂 (赤穂線だけの位置。本線の線路はここに無い)
     1 上郡 (本線) / 坂越 (赤穂線)
     2 有年 (本線) / 西相生 (赤穂線)
     3 相生 … 赤穂線が分かれる
     4 竜野  5 網干  6 はりま勝原  7 英賀保  8 手柄山平和公園  9 姫路
   赤穂線は相生の先で本線 (上郡方) と同じ横位置を別の線路で走るので、
   JR宝塚線・湖西線と同じく「分岐線」として持つ。 */
const WEST_SHIFT = 9;
/** 姫路を 0 としたときのインデックスを、実際のインデックスに直す */
function W(n) { return n + WEST_SHIFT; }
/** 数字のキーを持つ表のキーを WEST_SHIFT だけずらす */
function _shiftKeys(obj) { const o = {}; for (const k in obj) o[Number(k) + WEST_SHIFT] = obj[k]; return o; }

const STATIONS = [
    /* 姫路より西。播州赤穂は赤穂線の終点で、本線の線路はここに無い
       (branchOnly)。本線の西の端は上郡。 */
    {name:"播州赤穂", type:2, cap:3, stopTime: STOP_TIME.MEDIUM, branchOnly: "ako"},
    {name:"上郡", type:2, cap:3, stopTime: STOP_TIME.MEDIUM}, {name:"有年", type:2, cap:2, stopTime: STOP_TIME.SHORT},
    {name:"相生", type:2, cap:3, stopTime: STOP_TIME.SHORT}, {name:"竜野", type:2, cap:3, stopTime: STOP_TIME.SHORT},
    {name:"網干", type:2, cap:3, stopTime: STOP_TIME.SHORT}, {name:"はりま勝原", type:2, cap:2, stopTime: STOP_TIME.SHORT},
    {name:"英賀保", type:2, cap:3, stopTime: STOP_TIME.SHORT}, {name:"手柄山平和公園", type:2, cap:2, stopTime: STOP_TIME.SHORT},
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
    /* ---- 姫路より西 (配線略図 スクリーンショット(724)/(725).png)
       上郡 … 下り本線(島式)・中線(島式)・上り本線(単式)。線区の西の端で、
              どの番線からも折り返せる (上下で番線を共有する)。
       相生 … 下り本線(単式 1番)・中線(島式 2番)・上り本線(島式 3番)。
              赤穂線は下り本線と中線から出入りする。
       竜野 … 下り本線と上り本線の島式＋下り側の待避線(単式)。上下をつなぐ渡り線は無い。
       網干 … 上り本線(単式 1番)・下り本線(島式 2番)・折返し線(島式 3番)。
              網干総合車両所は下り側から出入りする。
       英賀保 … 下り本線(単式)・中線(島式)・上り本線(島式)。中線は両端で上下本線につながる。 */
    "播州赤穂": { labels:["1","2","3"], lanes:[true,true,true] },
    "坂越": { labels:["1"], lanes:[true] }, "西相生": { labels:["1"], lanes:[true] },
    "上郡": { labels:["1","2","3"], lanes:[true,true,true] }, "有年": { labels:["2","1"], lanes:[true,true] },
    "相生": { labels:["3","2","1"], lanes:[true,true,true] }, "竜野": { labels:["3","2","1"], lanes:[true,true,true] },
    "網干": { labels:["1","2","3"], lanes:[true,true,true] }, "はりま勝原": { labels:["2","1"], lanes:[true,true] },
    "英賀保": { labels:["3","2","1"], lanes:[true,true,true] }, "手柄山平和公園": { labels:["2","1"], lanes:[true,true] },
    "姫路": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "東姫路": { labels:["2","1"], lanes:[true,true] }, "御着": { labels:["3","2","1"], lanes:[true,true,true] }, "ひめじ別所": { labels:["2","1","貨","貨"], lanes:[true,true,true,true] }, "曽根": { labels:["2","1"], lanes:[true,true] },
    "宝殿": { labels:["上通","3","2","1"], lanes:[false,true,true,true] }, "加古川": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "東加古川": { labels:["3","2","1"], lanes:[true,true,true] }, "土山": { labels:["3","2","1"], lanes:[true,true,true] }, "魚住": { labels:["2","1"], lanes:[true,true] },
    "大久保": { labels:["4","3","2","1","下通"], lanes:[true,true,true,true,false] }, "西明石": { labels:["6","5","4","3","2","1"], lanes:[true,true,true,true,true,true] }, "明石": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "朝霧": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] },
    "舞子": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "垂水": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "塩屋": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "須磨": { labels:["上外","4","3","2","1","下外"], lanes:[false,true,true,true,true,false] },
    "須磨海浜公園": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "鷹取": { labels:["上外","2","1","下外","上待","下待"], lanes:[false,true,true,false,false,false] }, "新長田": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "兵庫": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    "神戸": { labels:["5","4","3","2","1"], lanes:[true,true,true,true,true] }, "元町": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "三ノ宮": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "摩耶": { labels:["上待","上外","2","1","下外","下待"], lanes:[false,false,true,true,false,false] },
    "灘": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "六甲道": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "住吉": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "摂津本山": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "甲南山手": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] },
    "芦屋": { labels:["上通","4","3","2","1","下通"], lanes:[false,true,true,true,true,false] }, "さくら夙川": { labels:["上外","2","1","下外"], lanes:[false,true,true,false] }, "西宮": { labels:["上待","上外","2","1","下外","下待"], lanes:[false,false,true,true,false,false] }, "甲子園口": { labels:["4","3","2","1","下外"], lanes:[true,true,true,true,false] },
    "立花": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "尼崎": { labels:["9","8","7","6","5","4","3","2","1"], lanes:[false,true,true,true,true,true,true,true,true] }, "塚本": { labels:["1","2","3","4"], lanes:[true,true,true,true] }, "大阪": { labels:["8","9","10","11","7","6","5","4","3"], lanes:[true,true,true,true,true,true,true,true,true] },
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
    /* JR東西線・学研都市線の京橋。1・2番のりばは大阪環状線 (この線路図の範囲外)。
       学研都市線・JR東西線は 3番 (木津方面) / 4番 (北新地・尼崎方面) の2面2線
       (配線略図 スクリーンショット(712).png)。大阪城北詰方に引上線がある。
       ★以前は4本の番線を持たせていて、実在しない番線が2本あった。 */
    "京橋": { labels:["3","4"], lanes:[true,true] },
    "鴫野": { labels:["4","1"], lanes:[true,true] },
    "放出": { labels:["4","3","2","1"], lanes:[true,true,true,true] },
    /* 学研都市線 放出〜木津 (配線略図 スクリーンショット(726)〜(728).png)
       松井山手〜京田辺・京田辺〜木津は単線。交換できるのは
       大住・京田辺・JR三山木・祝園だけで、同志社前・下狛・西木津・木津 (学研都市線ホーム) は
       1線しかない。単線の駅は上下で番線を共有する (STATION_SHARED_LANES)。 */
    "徳庵": { labels:["1","2","3"], lanes:[true,true,true] }, "鴻池新田": { labels:["2","1"], lanes:[true,true] },
    "住道": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "野崎": { labels:["2","1"], lanes:[true,true] },
    "四条畷": { labels:["4","3","2","1"], lanes:[true,true,true,true] }, "忍ケ丘": { labels:["2","1"], lanes:[true,true] },
    "寝屋川公園": { labels:["2","1"], lanes:[true,true] }, "星田": { labels:["2","1"], lanes:[true,true] },
    "河内磐船": { labels:["2","1"], lanes:[true,true] }, "津田": { labels:["2","1"], lanes:[true,true] },
    "藤阪": { labels:["2","1"], lanes:[true,true] }, "長尾": { labels:["2","1"], lanes:[true,true] },
    "松井山手": { labels:["2","1"], lanes:[true,true] }, "大住": { labels:["2","1"], lanes:[true,true] },
    "京田辺": { labels:["3","4","2","1"], lanes:[true,true,true,true] }, "同志社前": { labels:["1"], lanes:[true] },
    "JR三山木": { labels:["2","1"], lanes:[true,true] }, "下狛": { labels:["1"], lanes:[true] },
    "祝園": { labels:["2","1"], lanes:[true,true] }, "西木津": { labels:["1"], lanes:[true] },
    "木津": { labels:["1"], lanes:[true] }
});

/* JR東西線ブロックの東端。京橋の先、片町線の鴫野・放出まで作る。
   ここを伸ばすと線路・駅・留置場もそこまで描かれる。 */
const TOZAI_EAST_IDX = W(67);

/* 尼崎から JR東西線へ入る (= 本線ではなく東西線を走る) 行先。
   以前は同じ配列が5つのファイルに重複して書かれていて、
   駅を足すたびに全部直さないと経路がずれていた。ここ1か所にまとめる。 */
const TOZAI_THROUGH_DESTS = ["同志社前", "松井山手", "四条畷", "木津", "京田辺",
                             "奈良", "長尾", "放出", "鴫野", "京橋",
                             "徳庵", "鴻池新田", "住道", "野崎", "忍ケ丘", "寝屋川公園", "星田",
                             "河内磐船", "津田", "藤阪", "大住", "JR三山木", "下狛", "祝園", "西木津"];

/* 相生から赤穂線へ入る行先 (相生より西で赤穂線の上にある駅) */
const AKO_THROUGH_DESTS = ["播州赤穂", "坂越", "西相生", "長船", "岡山"];

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
    "堅田", "近江舞子", "近江今津", // ★追加
    // 姫路より西・学研都市線 (配線略図 (723)〜(728))
    "上郡", "相生", "網干", "英賀保", "播州赤穂",
    "徳庵", "四条畷", "長尾", "松井山手", "大住", "京田辺", "JR三山木", "祝園",
    "同志社前", "木津"          // 単線上の1線の駅。そのまま向きを変える
];
/* 待避 (追い抜き) ができる駅。これも方転できるかとは別。 */
const OVERTAKE_STATIONS = ["新三田", "道場", "宝塚", "川西池田", "塚口", "放出","高槻","大阪","尼崎","芦屋","須磨","大久保","西明石","加古川", "宝殿", "草津", "野洲", "河瀬", "安土", "近江八幡", "能登川", "米原", "長浜", "近江塩津", "敦賀", "大津京", "おごと温泉", "堅田", "近江舞子", "安曇川", "近江今津", "永原",
    "上郡", "相生", "竜野", "網干", "英賀保", "播州赤穂",
    "徳庵", "住道", "四条畷", "松井山手", "大住", "京田辺", "JR三山木", "祝園"]; STATION_MAP = {};
STATIONS.forEach((s,i) => {
    STATION_MAP[s.name] = i;
});

// ★追加: 湖西線・福知山線・東西線の駅をSTATION_MAPにマッピング
(function () {
const BRANCH_IDX = {
    "新三田": 23, "三田": 24, "道場": 25, "武田尾": 26, "西宮名塩": 27, "生瀬": 28, "宝塚": 29, "中山寺": 30, "川西池田": 31, "北伊丹": 32, "伊丹": 33, "猪名寺": 34, "塚口": 35,
    "加島": 37, "御幣島": 38, "海老江": 39, "新福島": 40, "北新地": 41, "大阪天満宮": 42, "大阪城北詰": 43, "京橋": 44,
    "鴫野": 45, "放出": 46,
    "徳庵": 47, "鴻池新田": 48, "住道": 49, "野崎": 50, "四条畷": 51, "忍ケ丘": 52, "寝屋川公園": 53,
    "星田": 54, "河内磐船": 55, "津田": 56, "藤阪": 57, "長尾": 58, "松井山手": 59, "大住": 60,
    "京田辺": 61, "同志社前": 62, "JR三山木": 63, "下狛": 64, "祝園": 65, "西木津": 66, "木津": 67,
    "坂越": -8, "西相生": -7,
    "大津京": 57, "唐崎": 58, "比叡山坂本": 60, "おごと温泉": 61, "堅田": 63, "小野": 64, "和邇": 65, "蓬莱": 67, "志賀": 68, "比良": 70, "近江舞子": 71, "北小松": 72, "近江高島": 74, "安曇川": 75, "新旭": 77, "近江今津": 78, "近江中庄": 79, "マキノ": 81, "永原": 82,
    "宮原操": 39, "吹田貨": 41
};
for (const k in BRANCH_IDX) STATION_MAP[k] = W(BRANCH_IDX[k]);
})();
// 注: 篠山口・奈良などの「線内に描画していない駅」は
//     意図的に STATION_MAP へ入れていない (進行方向の判定に使われるため)。
//     編成の配置・返却先を求めるときの読み替えは js/06-fleet.js の
//     fleetHomeOf() / fleetIndexOf() が受け持つ。

const STARTERS = {
    "姫路": STATION_MAP["姫路"], "西明石": STATION_MAP["西明石"], "甲子園口": STATION_MAP["甲子園口"],
    "尼崎": STATION_MAP["尼崎"], "大阪": STATION_MAP["大阪"], "高槻": STATION_MAP["高槻"],
    "向日町操": STATION_MAP["向日町操"], "京都": STATION_MAP["京都"], 
    "神戸": STATION_MAP["神戸"], "三ノ宮": STATION_MAP["三ノ宮"], 
    "網干": STATION_MAP["網干"], "播州赤穂": STATION_MAP["播州赤穂"], "上郡": STATION_MAP["上郡"], "近江今津": STATION_MAP["敦賀"], 
    "吹田貨": STATION_MAP["吹田"], "宮原操": STATION_MAP["新大阪"], "野洲": STATION_MAP["野洲"], 
    "米原": STATION_MAP["米原"], "敦賀": STATION_MAP["敦賀"] 
};

const TRACKS = [
    { id: "Up_Hoppo", label: "北方貨物上", dir: 1, type: "freight_line" }, { id: "Up_Out", label: "上り外", dir: 1 }, { id: "Up_In", label: "上り内", dir: 1 }, 
    { id: "Down_In", label: "下り内", dir: -1 }, { id: "Down_Out", label: "下り外", dir: -1 }, { id: "Down_Hoppo", label: "北方貨物下", dir: -1, type: "freight_line" },{ id: "Kosei_Up", label: "湖西線上り", dir: 1 }, { id: "Kosei_Down", label: "湖西線下り", dir: -1 },
    { id: "Fukuchi_Up", label: "福知山線上り", dir: 1 }, { id: "Fukuchi_Down", label: "福知山線下り", dir: -1 },
    { id: "Tozai_Up", label: "東西線上り", dir: 1 }, { id: "Tozai_Down", label: "東西線下り", dir: -1 },
    { id: "Ako_Up", label: "赤穂線上り", dir: 1 }, { id: "Ako_Down", label: "赤穂線下り", dir: -1 }
];

/* ------------------------------------------------------------------ 単線区間

   赤穂線 (相生〜播州赤穂) と学研都市線の松井山手〜木津は単線。
   線路データは上下2本の線路 (Ako_Up/Ako_Down・Tozai_Up/Tozai_Down) のままだが、
   区間の中のブロックは上下でレーンを共有する (js/05-track-manager.js)。
   区間に入れるのは1本だけ (一閉塞一列車。js/13-train-hold.js の singleTrackBlocked)。
   区間の両端は交換のできる駅 (上下の線が分かれている駅・3線以上ある駅)。

     lo / hi   … 区間の両端の駅
     hiInside  … hi の駅も区間に含める (1線しかない終点の木津)
   交換駅 (配線略図 スクリーンショット(723)/(726)〜(728).png)
     赤穂線     … 相生・播州赤穂 (西相生・坂越は1線)
     学研都市線 … 松井山手 (ここから放出方は複線)・大住・京田辺・JR三山木・祝園
                  (同志社前・下狛・西木津・木津は1線) */
const SINGLE_TRACK_UNITS = [
    { id: "赤穂線 相生〜播州赤穂",       up: "Ako_Up",   down: "Ako_Down",   lo: "播州赤穂", hi: "相生" },
    { id: "学研都市線 松井山手〜大住",   up: "Tozai_Up", down: "Tozai_Down", lo: "松井山手", hi: "大住" },
    { id: "学研都市線 大住〜京田辺",     up: "Tozai_Up", down: "Tozai_Down", lo: "大住",     hi: "京田辺" },
    { id: "学研都市線 京田辺〜JR三山木", up: "Tozai_Up", down: "Tozai_Down", lo: "京田辺",   hi: "JR三山木" },
    { id: "学研都市線 JR三山木〜祝園",   up: "Tozai_Up", down: "Tozai_Down", lo: "JR三山木", hi: "祝園" },
    { id: "学研都市線 祝園〜木津",       up: "Tozai_Up", down: "Tozai_Down", lo: "祝園",     hi: "木津", hiInside: true }
];

/** 単線区間のブロック番号の範囲 [from, to] (両端を含む) */
function singleUnitBlockRange(u) {
    const lo = STATION_MAP[u.lo], hi = STATION_MAP[u.hi];
    const a = Math.min(lo, hi) * UNITS_PER_STATION, b = Math.max(lo, hi) * UNITS_PER_STATION;
    return [a + 1, u.hiInside ? b : b - 1];
}

/** そのブロックが属する単線区間 (無ければ null) */
function singleUnitAt(trackId, blockIndex) {
    for (const u of SINGLE_TRACK_UNITS) {
        if (trackId !== u.up && trackId !== u.down) continue;
        const r = singleUnitBlockRange(u);
        if (blockIndex >= r[0] && blockIndex <= r[1]) return u;
    }
    return null;
}
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
const KOSEI_STATIONS_MAP = _shiftKeys({
    57: "大津京", 58: "唐崎", 60: "比叡山坂本", 61: "おごと温泉", 63: "堅田", 64: "小野",
    65: "和邇", 67: "蓬莱", 68: "志賀", 70: "比良", 71: "近江舞子", 72: "北小松",
    74: "近江高島", 75: "安曇川", 77: "新旭", 78: "近江今津", 79: "近江中庄", 81: "マキノ", 82: "永原"
});
const FUKUCHI_STATIONS_MAP = _shiftKeys({
    23: "新三田", 24: "三田", 25: "道場", 26: "武田尾",
    27: "西宮名塩", 28: "生瀬", 29: "宝塚", 30: "中山寺",
    31: "川西池田", 32: "北伊丹", 33: "伊丹", 34: "猪名寺", 35: "塚口"
});
const TOZAI_STATIONS_MAP = _shiftKeys({
    37: "加島", 38: "御幣島", 39: "海老江", 40: "新福島", 41: "北新地",
    42: "大阪天満宮", 43: "大阪城北詰", 44: "京橋", 45: "鴫野", 46: "放出",
    // 学研都市線 (片町線) 放出〜木津
    47: "徳庵", 48: "鴻池新田", 49: "住道", 50: "野崎", 51: "四条畷", 52: "忍ケ丘", 53: "寝屋川公園",
    54: "星田", 55: "河内磐船", 56: "津田", 57: "藤阪", 58: "長尾", 59: "松井山手", 60: "大住",
    61: "京田辺", 62: "同志社前", 63: "JR三山木", 64: "下狛", 65: "祝園", 66: "西木津", 67: "木津"
});
/* 赤穂線 (相生〜播州赤穂)。相生[3] は本線と共用の駅。 */
const AKO_STATIONS_MAP = _shiftKeys({ "-9": "播州赤穂", "-8": "坂越", "-7": "西相生" });
/* 赤穂線ブロックの範囲 (播州赤穂 〜 相生) */
const AKO_WEST_IDX = W(-9), AKO_JUNCTION_IDX = W(-6);

/* 貨物駅としての別名 (線路図の上下に出す) */
const FREIGHT_STATION_LABEL = { "ひめじ別所": "姫路タ", "鷹取": "神戸タ", "西大路": "京都タ" };

/* ------------------------------------------------------------------ 貨物ターミナル (利用者の指摘 6)

   貨物列車の行先になる、線路図の中の貨物駅。
     station … 線路図の上で着発線を持つ駅 (貨物列車は外側の着発線に入る)
     dwell   … 着いてから次に出るまで [秒] (荷役・機関車の付け替え (機回し)・入換)
   ★吹田貨物ターミナルは北方貨物線の上 (岸辺〜吹田の北側) にあり、
     本線から来る貨物列車は塚本・茨木方で北方貨物線に入って着発線へ着く。
     以前は吹田タ行きの貨物列車が吹田に着いたとたんに消え、
     吹田貨物ターミナル発の列車はどこからともなく現れていた。
   ★神戸タ (鷹取)・姫路タ (ひめじ別所)・京都タ (西大路・梅小路) も同じ扱いにする。
     着いた列車は着発線で荷役と機回しをして、次の貨物列車として発車する
     (向きを変えることもある)。 */
const FREIGHT_TERMINALS = {
    "吹田タ": { station: "吹田貨",     name: "吹田貨物ターミナル", dwell: [2400, 4800] },
    "神戸タ": { station: "鷹取",       name: "神戸貨物ターミナル", dwell: [1800, 3600] },
    "姫路タ": { station: "ひめじ別所", name: "姫路貨物駅",         dwell: [1800, 3600] },
    "京都タ": { station: "西大路",     name: "京都貨物駅",         dwell: [1800, 3600] }
};
/** 貨物列車の行先が線路図の中の貨物駅なら、その駅名 (着発線のある駅) */
function freightTerminalStation(dest) {
    const t = FREIGHT_TERMINALS[dest];
    return t ? t.station : null;
}
/** その駅が貨物ターミナルなら、その行先名 (吹田貨 → 吹田タ) */
function freightTerminalAt(stName) {
    for (const k in FREIGHT_TERMINALS) if (FREIGHT_TERMINALS[k].station === stName) return k;
    return null;
}

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

    /* ---- 姫路より西 (スクリーンショット(725).png)
       竜野・網干は3本目の線が下り側 (南) にある。既定の並べ方 (中線を上り側) では
       線路と番線が食い違うので、ここで書く。 */
    if (stationName === "竜野" || stationName === "網干") {
        yPositions = [upOutY, downOutY, downOutY + 30];
    }
    /* ---- 単線区間の駅・線区の端の駅 (上下で番線を共有する駅)
       1線しかない駅は、上り線の位置に1本だけ置く。 */
    else if (["同志社前", "下狛", "西木津", "木津", "坂越", "西相生"].includes(stationName)) {
        yPositions = [upOutY];
    }
    else if (stationName === "播州赤穂") {
        /* 上 (下り側) から 1番 (単式)・2番・3番 (島式)。
           分岐線の駅は上り線・下り線の2本の目印しか持たないので、
           2番 (真ん中の線) は上り線の側に寄せて置く (線路図で上下に広げて描く)。 */
        yPositions = [downOutY, upOutY + (downOutY - upOutY) * 0.15, upOutY];
    }
    else if (stationName === "京田辺") {
        /* 画面の上 (下り側) から 1番 (待避線)・2番 (本線)・3番・4番 (木津方が行き止まり)。
           ラベルの並びは ["3","4","2","1"]。 */
        yPositions = [upOutY + 15, upOutY - 15, downOutY - 15, downOutY + 15];
    }
    else if (stationName === "徳庵") {
        // 上り (木津方面) 1番 / 下り本線 2番 / 下りの待避線 3番 (島式)
        yPositions = [upOutY, downOutY, downOutY + 30];
    }
    else if (stationName === "ひめじ別所") {
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
        /* 3〜11番のりば (配線略図 スクリーンショット(697).png)。
           南 (画面の上) から 3・4 | 5・6 | 7・8 | 9・10 | 11 の順に並ぶ。
             5番 … 下り外側線 (列車線)。新快速・快速
             6番 … 下り内側線 (電車線)。普通
             7番 … 上り内側線 (電車線)。普通
             8番 … 上り外側線 (列車線)。新快速・快速
             3・4番 … 5番のさらに南。JR宝塚線(下り)・特急・朝夕の優等。
                       4番は電車線 (6番の線) からも渡り線で入れる
             9・10・11番 … 8番のさらに北。JR宝塚線(上り)・特急・朝夕の優等。
                       9番は電車線 (7番の線) からも渡り線で入れる
           ★以前は 9番を7番と8番のあいだ、4番を5番と6番のあいだに描いていた
             (電車線の2本目のレーンとして持っていたため)。実物の並びと違い、
             番線の表示が食い違っていた。いまは実物どおりの位置に置き、
             どの線路からどの番線へ入れるかは進路の表 (STATION_ROUTES) で決める
             (上り側・下り側でレーンを共有する。尼崎と同じ形)。 */
        yPositions = [upOutY, upOutY - 18, upOutY - 36, upOutY - 54,
                      upInY,
                      downInY,
                      downOutY, downOutY + 18, downOutY + 36];
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
    else if (["大津京", "おごと温泉", "堅田", "近江舞子", "安曇川", "近江今津", "永原", "新三田", "宝塚", "川西池田", "放出", "住道", "四条畷"].includes(stationName)) {
        // ★湖西線・福知山線の待避可能駅 (2面4線)
        yPositions = [upOutY - 15, upOutY + 15, downOutY - 15, downOutY + 15];
    }
    else if (["道場", "塚口"].includes(stationName)) {
        // ★福知山線の待避可能駅 (2面3線)
        yPositions = [upOutY - 15, upOutY + 15, downOutY];
    }
    else if (["唐崎", "比叡山坂本", "小野", "和邇", "蓬莱", "志賀", "比良", "北小松", "近江高島", "新旭", "近江中庄", "マキノ", "三田", "武田尾", "西宮名塩", "生瀬", "中山寺", "北伊丹", "伊丹", "猪名寺", "加島", "御幣島", "海老江", "新福島", "北新地", "大阪天満宮", "大阪城北詰", "鴫野", "京橋",
              "鴻池新田", "野崎", "忍ケ丘", "寝屋川公園", "星田", "河内磐船", "津田", "藤阪", "長尾",
              "松井山手", "大住", "JR三山木", "祝園"].includes(stationName)) {
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
    add(AKO_STATIONS_MAP, "ako");
})();

/** その駅が属する分岐線 ("kosei"/"fukuchi"/"tozai"/"ako")。本線の駅なら null。 */
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
        /* 上下で番線を共有する駅 (単線区間の駅) は、実際の本数だけ持つ。
           共有しない駅は上下1本ずつが最低。 */
        if (STATION_SHARED_LANES[name] === "all" && u + d > 0) { up = u; down = d; }
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
           ★上り側・下り側でレーンを共有する (STATION_SHARED_LANES)。
             電車線の列車も 9番・4番へ渡り線で入れる (STATION_ROUTES)。 */
        if (trackId === "Up_Out") return 4;     // 8・9・10・11番
        if (trackId === "Up_In") return 1;      // 7番
        if (trackId === "Down_In") return 1;    // 6番
        return 3;                               // Down_Out 5・4・3番
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

    /* 相生 (配線略図 スクリーンショット(723)/(725).png)
         1番 … 下り本線 (単式)。赤穂線 播州赤穂方面・山陽本線 上郡方面
         2番 … 中線 (島式)。赤穂線からの上り (姫路方面) はここに入る
         3番 … 上り本線 (島式)。上郡方面からの上り
       赤穂線は1番の線 (下り本線) から竜野方の外で分かれ、上りは中線へ入る。
       赤穂線の上りが3番へ入る進路は無い。 */
    /* 相生の渡り線 (竜野方・有年方の両方)
         竜野方 … 1番↔2番、2番↔3番 がつながる (1番→3番は2番の線を経由)
         有年方 … 2番→1番の線、3番→2番、3番↔1番の線 (赤穂線の分岐より有年寄り)
       赤穂線は1番の線から分かれ、2番からも入れる。3番から赤穂線へは出られない。 */
    "相生": {
        arrive: { Up_Out: ["3", "2"], Ako_Up: ["2", "1"], Down_Out: ["1", "2", "3"], Ako_Down: ["1", "2"] },
        depart: { Up_Out: ["3", "2", "1"], Down_Out: ["1", "2", "3"], Ako_Down: ["1", "2"] }
    },
    /* 網干 (配線略図 スクリーンショット(725).png)
         1番 … 上り本線 (単式)
         2番 … 下り本線 (島式)
         3番 … 折返し線 (島式)。竜野方・姫路方の両方で上下本線につながり、
                網干総合車両所への出入区線もここから分かれる。
       網干止まりの列車・網干始発の列車は主に3番を使う。 */
    "網干": {
        arrive: { Up_Out: ["1", "3", "2"], Down_Out: ["2", "3", "1"] },
        depart: { Up_Out: ["1", "3", "2"], Down_Out: ["2", "3", "1"] }
    },
    /* 英賀保 … 中線 (2番) は両端で上下本線につながる。待避に使う。 */
    "英賀保": {
        arrive: { Up_Out: ["3", "2", "1"], Down_Out: ["1", "2", "3"] },
        depart: { Up_Out: ["3", "2", "1"], Down_Out: ["1", "2", "3"] }
    },
    /* 上郡 … 中線 (2番) が両端で上下本線につながる。山陽本線の西の端 (線路図の範囲)。 */
    "上郡": {
        arrive: { Up_Out: ["1", "2"], Down_Out: ["3", "2", "1"] },
        depart: { Up_Out: ["1", "2", "3"], Down_Out: ["3", "2"] }
    },
    /* 京田辺 (配線略図 スクリーンショット(728).png)
         1番 … 待避線 / 2番 … 本線 / 3番 / 4番 … 4番は木津方が行き止まり
       京田辺〜同志社前・京田辺〜大住はどちらも単線で、上下で番線を共有する。
       木津方 (同志社前) からは 1〜3番にしか入れず、4番から木津方へは出られない。 */
    "京田辺": {
        arrive: { Tozai_Down: ["2", "1", "3"] },
        depart: { Tozai_Up: ["2", "1", "3"] }
    },
    /* 京橋。大阪城北詰方の引上線は 3番・4番のどちらからも入れる。 */
    "京橋": {
        drawUp: [{ label: "京橋 引上線", from: ["3", "4"], side: "W" }]
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
    /* 網干 … 網干止まり・網干始発は3番 (折返し線)、通過する列車は本線 */
    "網干": {
        "新快速": { normal: ["3", "2", "1"] },
        "快速":   { normal: ["3", "2", "1"] }
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
    const arr = _laneArrOf(stName, map, key) || [];
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
    // ---- 山陽本線 姫路より西・赤穂線 (スクリーンショット(723)〜(725).png)
    "上郡":     [["Up_Out", "Down_Out"], ["Up_Out", "Down_Out"]],   // 中線が両端で上下本線につながる
    "相生":     [["Up_Out", "Down_Out"], ["Up_Out", "Down_Out"]],   // 竜野方・有年方の両方に渡り線
    "網干":     [["Up_Out", "Down_Out"], ["Up_Out", "Down_Out"]],   // 両端に渡り線。折返し線(3番)がある
    "英賀保":   [["Up_Out", "Down_Out"], ["Up_Out", "Down_Out"]],   // 中線が両端で上下本線につながる
    "播州赤穂": [["Ako_Up", "Ako_Down"]],        // 赤穂線の終点 (単線)。3線とも相生方につながる
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
    "放出":     [["Tozai_Up", "Tozai_Down"]],
    // ---- 学研都市線 放出〜木津 (スクリーンショット(726)〜(728).png)
    "徳庵":     [["Tozai_Up", "Tozai_Down"]],    // 放出方に片渡り
    "四条畷":   [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 木津方に片渡り・放出方に両渡り
    "長尾":     [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 木津方に片渡り・放出方に両渡り
    "松井山手": [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 放出方に両渡り。木津方は単線への分岐
    "大住":     [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 単線の交換駅 (両端で1線にまとまる)
    "京田辺":   [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 単線の交換駅 (4線)
    "JR三山木": [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]],   // 単線の交換駅
    "祝園":     [["Tozai_Up", "Tozai_Down"], ["Tozai_Up", "Tozai_Down"]]    // 単線の交換駅。放出方に両渡り
};

/* 単線上の1線しかない駅で、そのまま向きを変えて折り返す駅。
   線路が1本なので渡り線は要らない (上下で同じ番線を使う)。 */
const STATION_REVERSE_SINGLE_LINE = {
    "同志社前": "単線上の1線の駅。着いた線路のまま向きを変えて京田辺方へ折り返す (画像728)",
    "木津":     "学研都市線の終点。学研都市線のホームは1線で、そのまま折り返す (画像728)"
};

/* ------------------------------------------------------------------ 終着列車の着発番線

   ■ 何を直すためのものか (利用者の指摘)
     近江今津止まりの列車は上り列車なので、上りの着発線 (3・4番) にしか
     入れなかった。実物は駅の手前 (山科方のど) に両渡りがあるので、
     下りの着発線 (1・2番) にも入れて、そこからそのまま折り返せる。

   ■ どう決めるか
     上り線と下り線をつなぐ渡り線が「到着する側ののど」にある駅では、
     その駅止まりの列車は反対側の着発線にも入れる。
       up   … 上り列車 (インデックスの大きい方へ進む列車) が入ってくる側
              (画面の右 = 姫路・尼崎・山科方) に渡り線がある
       down … 下り列車が入ってくる側 (画面の左) に渡り線がある
     渡り線の場所は配線略図の書き起こし (js/40-tid-theme.js の TID_JUNCTIONS) と同じで、
     tools/check_turnouts.js が食い違いを見張る。
     番線の共有 (STATION_SHARED_LANES) や進路の表 (STATION_ROUTES) を持つ駅は
     そちらで決めるので、ここには書かない。 */
const STATION_ARRIVAL_CROSSOVER = {
    "姫路": { up: true, down: true },   "御着": { up: true, down: false },
    "宝殿": { up: true, down: true },   "加古川": { up: true, down: true },
    "東加古川": { up: true, down: false }, "土山": { up: false, down: true },
    "大久保": { up: true, down: true }, "西明石": { up: false, down: true },
    "須磨": { up: false, down: true },  "摩耶": { up: true, down: false },
    "灘": { up: true, down: true },     "神戸": { up: false, down: true },
    "芦屋": { up: false, down: true },  "吹田": { up: true, down: false },
    "草津": { up: false, down: true },  "野洲": { up: true, down: true },
    "篠原": { up: true, down: false },  "近江八幡": { up: false, down: true },
    "安土": { up: true, down: true },   "能登川": { up: false, down: true },
    "河瀬": { up: true, down: true },   "彦根": { up: true, down: true },
    "米原": { up: true, down: true },   "長浜": { up: true, down: true },
    "虎姫": { up: false, down: true },  "高月": { up: true, down: true },
    "木ノ本": { up: true, down: true }, "新疋田": { up: true, down: true },
    "近江塩津": { up: true, down: true }, "敦賀": { up: true, down: true },
    "大津京": { up: true, down: false }, "堅田": { up: true, down: true },
    "和邇": { up: true, down: false },  "近江舞子": { up: true, down: false },
    "安曇川": { up: true, down: false }, "近江今津": { up: true, down: true },
    "永原": { up: true, down: false },
    "塚口": { up: true, down: true },   "宝塚": { up: true, down: true },
    "道場": { up: false, down: true },  "新三田": { up: false, down: true },
    "放出": { up: true, down: true },
    // 姫路より西・学研都市線 (配線略図 (723)〜(728))
    "網干": { up: true, down: true },   "英賀保": { up: true, down: true },
    "徳庵": { up: true, down: false },  "四条畷": { up: true, down: true },
    "長尾": { up: true, down: true },   "松井山手": { up: true, down: false },
    "祝園": { up: true, down: false }
};

/**
 * その駅止まりの列車が、反対方向の着発線にも入れるか。
 *   dir … 到着する列車の向き (1 = 上り / -1 = 下り)
 */
function canCrossArriveAt(stName, dir) {
    const c = STATION_ARRIVAL_CROSSOVER[stName];
    if (!c) return false;
    /* 複々線 (西明石〜草津) の駅は対象外。
       電車線 (内側線) で折り返す普通は、到着した側のホームで折り返し、
       発車のときに電車線どうしの渡り線を通る (実物もそう)。
       ここで反対側へ入れると、上り線のホームを長くふさいで
       JR神戸線・JR京都線の本数が落ちた (実測)。 */
    if (!stationBranchLine(stName) && innerTrackExists(STATION_MAP[stName])) return false;
    if (STATION_SHARED_LANES[stName] || STATION_ROUTES[stName]) return false;
    if (STATION_NO_PLATFORM_TURNBACK.indexOf(stName) >= 0) return false;
    return dir === 1 ? !!c.up : !!c.down;
}

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
    "茨木":       "島式2面4線＋上下の待避線。上下をつなぐ渡り線が無い (画像695)",
    "竜野":       "島式1面2線＋下りの待避線。上下をつなぐ渡り線が無い (画像725)",
    "住道":       "島式2面4線。待避線だけで上下をつなぐ渡り線が無い (画像727)"
};

/**
 * その駅で列車の向きを物理的に変えられるか。
 * 遅れの回復・詰まりの緩和が目的でも、false の駅で折り返してはいけない。
 */
function canReverseAt(stName) {
    if (!stName) return false;
    // 上り側と下り側をつなぐ渡り線があるか
    if (STATION_REVERSE_BY_CROSSOVER[stName]) return true;
    // 単線上の1線の駅 (線路が1本なので、そのまま向きを変えられる)
    if (typeof STATION_REVERSE_SINGLE_LINE !== "undefined" && STATION_REVERSE_SINGLE_LINE[stName]) return true;
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
        if (STATIONS[i].branchOnly) continue;       // 播州赤穂は赤穂線だけの位置
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
/* 番線を共有する駅。
     "side" … 上り側どうし・下り側どうしで共有する (尼崎・相生)。
              尼崎は本線・JR宝塚線・JR東西線、相生は本線 (上郡方) と赤穂線。
     "all"  … 上下すべての番線を共有する。単線区間の駅と線区の端の駅。
              どちら向きの列車も、配線でつながっている番線ならどれにでも入れる。
                上郡 … 山陽本線の西の端。中線をはさんで上下本線が両端でつながる
                播州赤穂 … 赤穂線 (相生〜播州赤穂は単線)
                坂越・西相生 … 赤穂線の単線の駅
                京田辺・同志社前・下狛・西木津・木津 … 学研都市線の単線区間の駅
   ★大住・JR三山木・祝園 (交換駅) は上下の線が分かれているので共有しない。 */
const STATION_SHARED_LANES = {
    "尼崎": "side", "大阪": "side",
    /* 相生・網干・英賀保 … 中線 (網干は折返し線) が両端で上下本線につながり、
       上下どちらの列車も使う。どの線路からどの番線へ入れるかは STATION_ROUTES で決める。 */
    "相生": "all", "網干": "all", "英賀保": "all",
    "上郡": "all", "播州赤穂": "all", "坂越": "all", "西相生": "all",
    "京田辺": "all", "同志社前": "all", "下狛": "all", "西木津": "all", "木津": "all"
};

/** 番線の対応表から、その線路の列車が使うレーンの並びを返す (共有の駅は共有のぶん) */
function _laneArrOf(stName, map, key) {
    const mode = STATION_SHARED_LANES[stName];
    if (mode === "all") return map.Up_Out.concat(map.Up_In, map.Down_In, map.Down_Out);
    if (mode) {
        const up = (key === "Up_Out" || key === "Up_In");
        return up ? map.Up_Out.concat(map.Up_In) : map.Down_In.concat(map.Down_Out);
    }
    return map[key];
}

/**
 * (駅, 線路ID, レーン番号) が指す番線のレーン情報を返す。無ければ null。
 * 番線を共有する駅では、上り側・下り側の通し番号で引く。
 */
function stationLaneEntry(stationName, trackId, lane) {
    const map = stationLaneMap(stationName);
    const key = _laneKeyOf(trackId);
    const arr = _laneArrOf(stationName, map, key);
    if (!arr || !arr.length) return null;
    return arr[Math.min(Math.max(lane, 0), arr.length - 1)] || null;
}

/**
 * レーンの配列から、その列車が入っている枠だけを空ける。
 * ★lanes[train.lane] を決め打ちで空けてはいけない。入区した列車や
 *   番線を移った列車は train.lane が古いままのことがあり、
 *   そこに入っている別の列車の在線を消してしまう (番線を共有する駅で目立った)。
 */
function freeOwnLane(lanes, train) {
    if (!lanes) return false;
    const at = lanes.indexOf(train);
    if (at < 0) return false;
    lanes[at] = null;
    return true;
}

/** 分岐線・北方貨物線の線路IDを、駅の配線での線路IDに読み替える */
function _laneKeyOf(trackId) {
    if (/^(Kosei|Fukuchi|Tozai|Ako)_Up$/.test(trackId)) return "Up_Out";
    if (/^(Kosei|Fukuchi|Tozai|Ako)_Down$/.test(trackId)) return "Down_Out";
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

/* 分岐の駅で、分岐線の列車だけが使う着発線の番線名。
   山科・近江塩津の湖西線の線路は、本線と同じ駅名のブロックを別に持っている。
   番線の対応表 (stationLaneMap) は本線の4線ぶんしか持たないので、そのまま引くと
   湖西線の着発線が「上通」「下通」(本線の通過線) と同じ名前になってしまう。
   画面に出すときだけ、ここで正しい呼び方に直す。
     山科 … 湖西線の近江今津方面が1番、京都方面が4番 (README の山科の項) */
const JUNCTION_BRANCH_PLATFORMS = {
    "山科": { Kosei_Up: "1", Kosei_Down: "4" }
};

/** 画面に出す番線名 (分岐の駅の分岐線の着発線も正しく呼ぶ) */
function displayPlatformLabel(stName, trackId, lane) {
    const j = JUNCTION_BRANCH_PLATFORMS[stName];
    if (j && j[trackId]) return j[trackId];
    if (/^(Kosei|Fukuchi|Tozai|Ako)_/.test(trackId) && !stationBranchLine(stName) &&
        !STATION_SHARED_LANES[stName]) {
        const line = trackId.indexOf("Kosei") === 0 ? "湖西線"
                   : trackId.indexOf("Fukuchi") === 0 ? "宝塚線"
                   : trackId.indexOf("Ako") === 0 ? "赤穂線" : "東西線";
        return line + (trackDirOf(trackId) === 1 ? "上り" : "下り") + "着発線";
    }
    return platformLabelOf(stName, trackId, lane);
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
