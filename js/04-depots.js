/* 留置場(車庫)の定義と、その構内配線。

   DEPOTS        … シミュレーター上の留置場。capacity は出区待ち列車を置ける数。
   DEPOT_LAYOUTS … 構内配線図の再現。同梱の配線略図(スクリーンショット)をもとに、
                   線群・留置線・収容両数を書き起こしたもの。
                   留置場をクリックしたときの構内図表示 (js/22-depot-view.js) で使う。

   tracks の各項目
     label … 線名 (画面に出す)
     cars  … その線に留置できる両数
     kind  … stabling(電留線) / shed(検修庫) / wash(洗浄線) / siding(待避・副本線)
*/
/* turnbackFirst … 折り返しの要になる駅の留置線。
     着いた列車をここへ入れるのは「運用の終わり」だけにする。
     いちいち入区させると出区待ちの列に並んで5〜10分止まり、
     線区の列車が薄くなって後続が詰まる
     (実測: 1分以上動けない列車が 7% → 19%)。 */
const DEPOTS = {
    "姫路": { capacity: 4, trains: [], drawOffset: { x: 0.5, y: 0 }, display: "姫路〜東姫路間" },
    "西明石": { capacity: 4, trains: [], drawOffset: { x: 0.5, y: -40 }, display: "西明石〜明石間" },
    "宮原操": { capacity: 6, trains: [], drawOffset: { x: 0, y: -120 }, display: "宮原操" },
    "高槻": { capacity: 4, trains: [], drawOffset: { x: 0.5, y: -40 }, display: "高槻〜島本間" },
    "向日町操": { capacity: 6, trains: [], drawOffset: { x: 0, y: -120 }, display: "向日町操" },
    /* ★京都駅の留置線・引上線。
       配線略図 (スクリーンショット(693).png / (680).png) のとおり、
       京都駅の南側 (下り線の外側) に、西へ向かって行き止まりの
       留置線・引上線が4本並び、その先に京都貨物・梅小路運転区がある。

       これを持っていなかったため、京都止まりの列車は折り返せないと
       必ず「向日町操行きの回送」になっていた。実際の運用では、
       京都止まりの列車の多くは駅の引上線で折り返すか、
       駅の留置線に入って次の運用に入る。 */
    "京都": { capacity: 6, trains: [], drawOffset: { x: 0.5, y: 40 },
              display: "京都駅 留置線・引上線", turnbackFirst: true },
    "草津": { capacity: 2, trains: [], drawOffset: { x: 0.5, y: 0 }, display: "草津〜栗東間" },
    "野洲": { capacity: 6, trains: [], drawOffset: { x: 0.5, y: 0 }, display: "野洲〜篠原間" },
    "米原": { capacity: 4, trains: [], drawOffset: { x: 0.5, y: 0 }, display: "米原〜坂田間" },
    /* ★尼崎駅の電留線・引上線。
       配線略図 (スクリーンショット(709).png / (711).png) のとおり、
       尼崎は本線・JR宝塚線・JR東西線が集まる駅で、
       西側 (塚本・立花方) に引上線と電留線がある。
       持っていなかったため、尼崎で運用を終えた列車は宮原操へ
       回送するしかなく、尼崎に滞泊する編成 (FLEET_BASES の16%) は
       出区する枠が無いので一日じゅう使われなかった。 */
    "尼崎": { capacity: 4, trains: [], drawOffset: { x: -0.5, y: 40 },
              display: "尼崎〜塚本間", turnbackFirst: true },
    // ★追加: JR東西線・片町線(学研都市線)の車両を受け持つ放出の電留線
    "放出": { capacity: 6, trains: [], drawOffset: { x: -0.5, y: 0 }, display: "放出〜徳庵間", line: "Tozai" },
    // ★追加: JR宝塚線の始発を受け持つ新三田の電留線
    "新三田": { capacity: 6, trains: [], drawOffset: { x: -0.5, y: 0 }, display: "新三田〜広野間", line: "Fukuchi" }
};

/* 留置場の在線リスト (DEPOTS[x].trains) の管理。

   ★修正: これまで各所から直接 push していたため
            ・同じ列車が二重に登録される
            ・消滅した列車や、すでに出区した列車が残り続ける
          という状態になり、DEPOTS[x].trains.length が実際より多く見えていた。
          この数は入区の可否判定 (capacity) や指令パッドの表示に使われるため、
          入区できずに消滅する列車が増える原因にもなっていた。
          登録・削除・掃除をここに集約する。
*/

/**
 * その留置場から出区するときに乗る線路を決める。
 *
 * ★留置場は本線だけでなく、JR東西線(放出)や北方貨物線(宮原操)にも面している。
 *   以前は一律に本線(Up_In/Down_In)を返していたため、
 *   放出の電留線から出た列車が本線の摂津富田付近に置かれようとして失敗し、
 *   出区のたびに消滅していた。
 */
function depotTrackId(depotName, dir, type) {
    const dep = DEPOTS[depotName];
    const line = dep && dep.line;
    if (line === "Tozai")   return (dir === 1) ? "Tozai_Up" : "Tozai_Down";
    if (line === "Fukuchi") return (dir === 1) ? "Fukuchi_Up" : "Fukuchi_Down";
    if (line === "Kosei")   return (dir === 1) ? "Kosei_Up" : "Kosei_Down";
    /* 宮原操は北方貨物線に面しているが、旅客車の出入区は本線 (新大阪・大阪方) を通る。
       北方貨物線は大阪駅を通らない貨物のバイパスなので、
       旅客の回送をそこへ乗せると大阪・高槻へ出られなくなる。 */
    if (depotName === "宮原操") {
        if (type === "貨物") return (dir === 1) ? "Up_Hoppo" : "Down_Hoppo";
        return (dir === 1) ? "Up_Out" : "Down_Out";
    }

    // --- 本線。優等・回送・貨物は外側線、普通・快速は内側線から出る。
    let tid = (dir === 1) ? "Up_In" : "Down_In";
    if (["貨物", "回送", "臨時", "特急", "新快速"].includes(type)) {
        tid = tid.replace("In", "Out");
    }
    // 複々線 (西明石〜草津) の外はすべて外側線扱い
    const idx = STATION_MAP[depotName];
    if (idx === undefined || idx < STATION_MAP["西明石"] || idx > STATION_MAP["草津"]) {
        tid = tid.replace("In", "Out");
    }
    if (depotName === "向日町操" && dir === -1) tid = "Down_Out";
    return tid;
}

/** 留置場へ列車を登録する。すでに入っている場合は何もしない。 */
function depotAdd(depotName, train) {
    const dep = DEPOTS[depotName];
    if (!dep) return false;
    depotRemove(train);                       // 別の留置場に残っていたら外す
    if (dep.trains.indexOf(train) < 0) dep.trains.push(train);
    return true;
}

/* 留置場の別名。
   網干総合車両所や松井山手の電留線は線路図の範囲の外にあるので、
   線路図の上では、いちばん近い駅の留置線から出入りするものとして扱う。
   出入区の処理がどちらの名前で呼ばれても同じ留置場を指すようにする。
   (尼崎には留置場を置いていないので、松井山手・四条畷は
    留置場を経由せず駅に直接生成される) */
const DEPOT_ALIAS = {
    "網干": "姫路", "播州赤穂": "姫路", "上郡": "姫路",
    "松井山手": "尼崎", "四条畷": "尼崎"
};

/** 留置場の名前を、DEPOTS の見出しに直す。 */
function depotKeyOf(name) { return DEPOT_ALIAS[name] || name; }

/** すべての留置場の在線リストから、その列車を外す。 */
function depotRemove(train) {
    for (const name in DEPOTS) {
        const list = DEPOTS[name].trains;
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] === train) list.splice(i, 1);
        }
    }
}

/** 消滅済み・すでに本線へ出た列車を在線リストから取り除く。毎Tick呼ぶ。 */
function depotPrune() {
    for (const name in DEPOTS) {
        const list = DEPOTS[name].trains;
        for (let i = list.length - 1; i >= 0; i--) {
            const t = list[i];
            if (!t || t.state !== "in_depot") list.splice(i, 1);
        }
    }
}

const DEPOT_LAYOUTS = {
    "姫路": {
        title: "姫路駅 電留線",
        owner: "網干総合車両所",
        leftLabel: "播但線 京口方 / 網干・網干総合車両所方",
        rightLabel: "山陽本線 御着・東姫路方",
        note: "上り本線の北側にある電留線群。播但線・姫新線と線路を共用する。" +
              "本拠の網干総合車両所は姫路の西側（シミュレーターの表示範囲外）にあるため、" +
              "そこに滞泊する編成もこの構内図にまとめて表示する。",
        groups: [
            { name: "姫路電留線", tracks: [
                { label: "電1", cars: 12, kind: "stabling" },
                { label: "電2", cars: 12, kind: "stabling" },
                { label: "電3", cars: 8, kind: "stabling" },
                { label: "電4", cars: 8, kind: "stabling" }
            ]},
            { name: "姫新線側 留置線", tracks: [
                { label: "姫1", cars: 4, kind: "stabling" },
                { label: "姫2", cars: 4, kind: "stabling" }
            ]},
            /* ★網干総合車両所は新快速 (8両＋4両) の本拠で、
               この線路図では姫路の電留線にまとめて表示している。
               実際の網干は電留線20本以上の大規模な車両所なので、
               配線略図 (スクリーンショット(707)/(708).png の網干) に合わせて
               本数を増やした。ここが足りないと、在籍する編成の6割以上が
               「その他 / 構内留置」として図の外に出てしまう。 */
            { name: "網干総合車両所 (姫路以西)", tracks: [
                { label: "網1", cars: 12, kind: "stabling" },
                { label: "網2", cars: 12, kind: "stabling" },
                { label: "網3", cars: 12, kind: "stabling" },
                { label: "網4", cars: 12, kind: "stabling" },
                { label: "網5", cars: 12, kind: "stabling" },
                { label: "網6", cars: 12, kind: "stabling" },
                { label: "網7", cars: 12, kind: "stabling" },
                { label: "網8", cars: 12, kind: "stabling" },
                { label: "網9", cars: 12, kind: "stabling" },
                { label: "網10", cars: 12, kind: "stabling" },
                { label: "網11", cars: 8, kind: "stabling" },
                { label: "網12", cars: 8, kind: "stabling" },
                { label: "網13", cars: 8, kind: "stabling" },
                { label: "網14", cars: 8, kind: "stabling" },
                { label: "網15", cars: 8, kind: "stabling" },
                { label: "網16", cars: 8, kind: "stabling" },
                { label: "網17", cars: 7, kind: "stabling" },
                { label: "網18", cars: 7, kind: "stabling" },
                { label: "網19", cars: 7, kind: "stabling" },
                { label: "網20", cars: 7, kind: "stabling" },
                { label: "網検1", cars: 12, kind: "shed" },
                { label: "網検2", cars: 12, kind: "shed" },
                { label: "網検3", cars: 8, kind: "shed" },
                { label: "網洗浄1", cars: 12, kind: "wash" },
                { label: "網洗浄2", cars: 12, kind: "wash" }
            ]}
        ]
    },

    "西明石": {
        title: "網干総合車両所 明石支所",
        owner: "網干総合車両所明石支所",
        leftLabel: "須磨海浜公園・神戸方",
        rightLabel: "西明石・大久保方",
        note: "207系・321系の本拠。出入区線から電留線群・検修庫へ分岐する。",
        groups: [
            { name: "出入区線", tracks: [
                { label: "出1", cars: 12, kind: "siding" },
                { label: "出2", cars: 12, kind: "siding" }
            ]},
            { name: "電留線", tracks: [
                { label: "電1", cars: 12, kind: "stabling" },
                { label: "電2", cars: 12, kind: "stabling" },
                { label: "電3", cars: 12, kind: "stabling" },
                { label: "電4", cars: 12, kind: "stabling" },
                { label: "電5", cars: 8, kind: "stabling" },
                { label: "電6", cars: 8, kind: "stabling" },
                { label: "電7", cars: 8, kind: "stabling" },
                { label: "電8", cars: 8, kind: "stabling" },
                { label: "電9", cars: 7, kind: "stabling" },
                { label: "電10", cars: 7, kind: "stabling" },
                { label: "電11", cars: 7, kind: "stabling" }
            ]},
            { name: "検修庫・洗浄線", tracks: [
                { label: "検1", cars: 8, kind: "shed" },
                { label: "検2", cars: 8, kind: "shed" },
                { label: "洗浄", cars: 12, kind: "wash" }
            ]}
        ]
    },

    "宮原操": {
        title: "網干総合車両所 宮原支所",
        owner: "網干総合車両所宮原支所",
        leftLabel: "塚本・大阪方 / 北方貨物線",
        rightLabel: "新大阪方",
        note: "JR宝塚線用の223系・225系6000番台の本拠。北方貨物線に面した大規模な操車場。",
        groups: [
            { name: "電留線 (北群)", tracks: [
                { label: "北1", cars: 12, kind: "stabling" },
                { label: "北2", cars: 12, kind: "stabling" },
                { label: "北3", cars: 12, kind: "stabling" },
                { label: "北4", cars: 12, kind: "stabling" },
                { label: "北5", cars: 8, kind: "stabling" },
                { label: "北6", cars: 8, kind: "stabling" },
                { label: "北7", cars: 8, kind: "stabling" },
                { label: "北8", cars: 8, kind: "stabling" }
            ]},
            { name: "仕業検査線", tracks: [
                { label: "仕1", cars: 12, kind: "shed" },
                { label: "仕2", cars: 12, kind: "shed" },
                { label: "仕3", cars: 8, kind: "shed" },
                { label: "仕4", cars: 8, kind: "shed" }
            ]},
            { name: "電留線 (南群)", tracks: [
                { label: "南1", cars: 12, kind: "stabling" },
                { label: "南2", cars: 12, kind: "stabling" },
                { label: "南3", cars: 8, kind: "stabling" },
                { label: "南4", cars: 8, kind: "stabling" },
                { label: "南5", cars: 6, kind: "stabling" }
            ]},
            { name: "電留線 (中央群)", tracks: [
                { label: "中1", cars: 12, kind: "stabling" },
                { label: "中2", cars: 12, kind: "stabling" },
                { label: "中3", cars: 8, kind: "stabling" },
                { label: "中4", cars: 8, kind: "stabling" },
                { label: "中5", cars: 7, kind: "stabling" }
            ]},
            { name: "洗浄線", tracks: [
                { label: "洗浄", cars: 12, kind: "wash" }
            ]}
        ]
    },

    "高槻": {
        title: "網干総合車両所 明石支所 高槻派出所",
        owner: "網干総合車両所明石支所高槻派出所",
        leftLabel: "摂津富田・茨木方",
        rightLabel: "島本・山崎方",
        note: "高槻駅の西側、下り外側線の南に広がる電留線群。京都線の始発列車を受け持つ。",
        groups: [
            { name: "電留線", tracks: [
                { label: "電1", cars: 12, kind: "stabling" },
                { label: "電2", cars: 12, kind: "stabling" },
                { label: "電3", cars: 12, kind: "stabling" },
                { label: "電4", cars: 12, kind: "stabling" },
                { label: "電5", cars: 8, kind: "stabling" },
                { label: "電6", cars: 8, kind: "stabling" }
            ]},
            { name: "短編成留置線", tracks: [
                { label: "短1", cars: 7, kind: "stabling" },
                { label: "短2", cars: 7, kind: "stabling" },
                { label: "短3", cars: 7, kind: "stabling" },
                { label: "短4", cars: 7, kind: "stabling" },
                { label: "短5", cars: 4, kind: "stabling" }
            ]}
        ]
    },

    "向日町操": {
        title: "吹田総合車両所 京都支所 (向日町操車場)",
        owner: "吹田総合車両所京都支所",
        leftLabel: "長岡京・山崎方",
        rightLabel: "向日町・京都方",
        note: "221系・223系の京都車の本拠。特急用の客車留置線と検修庫を併設する。",
        groups: [
            { name: "特急・気動車留置線", tracks: [
                { label: "特1", cars: 12, kind: "stabling" },
                { label: "特2", cars: 12, kind: "stabling" },
                { label: "特3", cars: 9, kind: "stabling" },
                { label: "特4", cars: 9, kind: "stabling" }
            ]},
            { name: "電留線", tracks: [
                { label: "電1", cars: 12, kind: "stabling" },
                { label: "電2", cars: 12, kind: "stabling" },
                { label: "電3", cars: 12, kind: "stabling" },
                { label: "電4", cars: 12, kind: "stabling" },
                { label: "電5", cars: 8, kind: "stabling" },
                { label: "電6", cars: 8, kind: "stabling" },
                { label: "電7", cars: 8, kind: "stabling" },
                { label: "電8", cars: 8, kind: "stabling" },
                { label: "電9", cars: 6, kind: "stabling" },
                { label: "電10", cars: 6, kind: "stabling" },
                { label: "電11", cars: 6, kind: "stabling" }
            ]},
            { name: "検修庫・入出場線", tracks: [
                { label: "検1", cars: 8, kind: "shed" },
                { label: "検2", cars: 8, kind: "shed" },
                { label: "入出場", cars: 12, kind: "siding" }
            ]},
            { name: "洗浄線", tracks: [
                { label: "洗浄", cars: 12, kind: "wash" }
            ]}
        ]
    },

    "尼崎": {
        title: "尼崎駅 電留線・引上線",
        owner: "網干総合車両所明石支所 / 宮原支所",
        leftLabel: "立花・西宮方 / JR宝塚線 塚口方",
        rightLabel: "塚本・大阪方 / JR東西線 加島方",
        note: "配線略図 (スクリーンショット(709).png・(711).png) のとおり、" +
              "本線・JR宝塚線・JR東西線が集まる駅で、" +
              "西側に引上線と電留線が並ぶ。" +
              "東西線・宝塚線・神戸線の折り返しと日中の留置に使う。",
        groups: [
            { name: "引上線", tracks: [
                { label: "引1", cars: 8, kind: "siding" },
                { label: "引2", cars: 8, kind: "siding" }
            ]},
            { name: "電留線", tracks: [
                { label: "電1", cars: 8, kind: "stabling" },
                { label: "電2", cars: 8, kind: "stabling" },
                { label: "電3", cars: 7, kind: "stabling" },
                { label: "電4", cars: 7, kind: "stabling" }
            ]}
        ]
    },

    "京都": {
        title: "京都駅 留置線・引上線 (梅小路)",
        owner: "吹田総合車両所京都支所 (京都駅派出)",
        leftLabel: "西大路・向日町方 / 山陰本線 梅小路京都西方",
        rightLabel: "山科・大津方 / 奈良線 東福寺方",
        note: "配線略図 (スクリーンショット(693).png・(680).png) のとおり、" +
              "京都駅の南側に西向きの行き止まり線が4本並び、" +
              "駅止まりの列車の折り返しと日中の留置に使う。" +
              "その西に京都貨物 (旧梅小路駅) の側線群と梅小路運転区がある。" +
              "本拠の吹田総合車両所京都支所 (向日町操) は3駅西にあり、" +
              "運用の終わりにそこへ回送する。",
        groups: [
            { name: "京都駅 引上線 (下り方)", tracks: [
                { label: "引1", cars: 12, kind: "siding" },
                { label: "引2", cars: 12, kind: "siding" }
            ]},
            { name: "京都駅 留置線", tracks: [
                { label: "留1", cars: 12, kind: "stabling" },
                { label: "留2", cars: 8, kind: "stabling" }
            ]},
            { name: "京都貨物・梅小路 側線", tracks: [
                { label: "梅1", cars: 12, kind: "stabling" },
                { label: "梅2", cars: 8, kind: "stabling" },
                { label: "梅洗浄", cars: 8, kind: "wash" }
            ]}
        ]
    },

    "草津": {
        title: "草津駅 電留線",
        owner: "網干総合車両所宮原支所",
        leftLabel: "南草津・石山方",
        rightLabel: "栗東・守山方 / 草津線 手原方",
        note: "草津線と分岐する構内の待避線を夜間留置に使う。収容は少ない。",
        groups: [
            { name: "草津電留線", tracks: [
                { label: "電1", cars: 8, kind: "stabling" },
                { label: "電2", cars: 8, kind: "stabling" }
            ]},
            { name: "草津線 待避線", tracks: [
                { label: "待1", cars: 8, kind: "siding" },
                { label: "待2", cars: 8, kind: "siding" }
            ]},
            /* ★配線略図 (スクリーンショット(679).png / (692).png) のとおり、
               草津は草津線が分かれる2面4線の駅で、下り線の南側に
               側線が並ぶ。明石の207系・321系も琵琶湖線の普通で
               草津まで来るため (js/06-fleet.js の FLEET_BASES)、
               図の留置線に入りきらない編成が6割を超えていた。 */
            { name: "駅構内 側線", tracks: [
                { label: "構1", cars: 12, kind: "siding" },
                { label: "構2", cars: 8, kind: "siding" },
                { label: "構3", cars: 8, kind: "siding" },
                { label: "構4", cars: 7, kind: "siding" }
            ]}
        ]
    },

    "野洲": {
        title: "網干総合車両所 宮原支所 野洲派出所",
        owner: "網干総合車両所宮原支所野洲派出所",
        leftLabel: "守山・草津方",
        rightLabel: "篠原・近江八幡方",
        note: "琵琶湖線の始発・終着を受け持つ電留線群。新快速の12両を丸ごと収容できる。",
        groups: [
            { name: "電留線 (上群)", tracks: [
                { label: "上1", cars: 12, kind: "stabling" },
                { label: "上2", cars: 12, kind: "stabling" },
                { label: "上3", cars: 12, kind: "stabling" },
                { label: "上4", cars: 12, kind: "stabling" },
                { label: "上5", cars: 12, kind: "stabling" }
            ]},
            { name: "電留線 (下群)", tracks: [
                { label: "下1", cars: 12, kind: "stabling" },
                { label: "下2", cars: 12, kind: "stabling" },
                { label: "下3", cars: 8, kind: "stabling" },
                { label: "下4", cars: 8, kind: "stabling" }
            ]},
            { name: "入出区線", tracks: [
                { label: "入出区1", cars: 12, kind: "siding" },
                { label: "入出区2", cars: 12, kind: "siding" }
            ]},
            /* ★配線略図 (スクリーンショット(691).png) のとおり、野洲は
               琵琶湖線でいちばん大きな電留線群を持ち、櫛状に多くの線が並ぶ。
               明石の207系・321系も琵琶湖線の普通で野洲まで来るため
               (js/06-fleet.js の FLEET_BASES)、図の留置線に入りきらない
               編成が半分近くになっていた。図にある線を書き起こして足す。 */
            { name: "電留線 (中群)", tracks: [
                { label: "中1", cars: 12, kind: "stabling" },
                { label: "中2", cars: 12, kind: "stabling" },
                { label: "中3", cars: 12, kind: "stabling" },
                { label: "中4", cars: 8, kind: "stabling" },
                { label: "中5", cars: 8, kind: "stabling" },
                { label: "中6", cars: 7, kind: "stabling" }
            ]},
            { name: "検修庫・洗浄線", tracks: [
                { label: "検1", cars: 8, kind: "shed" },
                { label: "検2", cars: 8, kind: "shed" },
                { label: "洗浄", cars: 12, kind: "wash" }
            ]}
        ]
    },

    "放出": {
        title: "放出 電留線 (網干総合車両所明石支所 放出派出)",
        owner: "網干総合車両所明石支所",
        leftLabel: "徳庵・京橋方 / 近畿車輛専用線",
        rightLabel: "放出・おおさか東線 高井田中央方",
        note: "放出駅の西方、徳庵との間に広がる電留線群。" +
              "JR東西線・片町線(学研都市線)の207系・321系が夜間滞泊する。" +
              "配線略図のとおり、本線南側に14本の留置線が櫛状に並び、" +
              "東端で放出駅の1〜4番のりばへつながる。",
        groups: [
            { name: "出入区線", tracks: [
                { label: "出入1", cars: 8, kind: "siding" },
                { label: "出入2", cars: 8, kind: "siding" }
            ]},
            { name: "電留線 (北群)", tracks: [
                { label: "北1", cars: 8, kind: "stabling" },
                { label: "北2", cars: 8, kind: "stabling" },
                { label: "北3", cars: 8, kind: "stabling" },
                { label: "北4", cars: 7, kind: "stabling" },
                { label: "北5", cars: 7, kind: "stabling" },
                { label: "北6", cars: 7, kind: "stabling" },
                { label: "北7", cars: 7, kind: "stabling" }
            ]},
            { name: "電留線 (南群)", tracks: [
                { label: "南1", cars: 7, kind: "stabling" },
                { label: "南2", cars: 7, kind: "stabling" },
                { label: "南3", cars: 7, kind: "stabling" },
                { label: "南4", cars: 4, kind: "stabling" },
                { label: "南5", cars: 4, kind: "stabling" }
            ]},
            { name: "洗浄線", tracks: [
                { label: "洗浄", cars: 8, kind: "wash" }
            ]}
        ]
    },

    "新三田": {
        title: "新三田 電留線 (網干総合車両所宮原支所 新三田派出)",
        owner: "網干総合車両所宮原支所",
        leftLabel: "三田・宝塚・尼崎方",
        rightLabel: "広野・篠山口方",
        note: "新三田駅の北側に広がる電留線群。JR宝塚線の朝の始発列車を受け持つ。" +
              "配線略図のとおり、下り本線の東側に櫛状の留置線が並び、" +
              "新三田駅の1〜4番のりばへつながる。",
        groups: [
            { name: "出入区線", tracks: [
                { label: "出入1", cars: 8, kind: "siding" }
            ]},
            { name: "電留線", tracks: [
                { label: "電1", cars: 8, kind: "stabling" },
                { label: "電2", cars: 8, kind: "stabling" },
                { label: "電3", cars: 8, kind: "stabling" },
                { label: "電4", cars: 8, kind: "stabling" },
                { label: "電5", cars: 7, kind: "stabling" },
                { label: "電6", cars: 7, kind: "stabling" },
                { label: "電7", cars: 6, kind: "stabling" },
                { label: "電8", cars: 6, kind: "stabling" }
            ]},
            { name: "洗浄線", tracks: [
                { label: "洗浄", cars: 8, kind: "wash" }
            ]}
        ]
    },

    "米原": {
        title: "網干総合車両所 宮原支所 米原派出所",
        owner: "網干総合車両所宮原支所米原派出所",
        leftLabel: "彦根・南彦根方",
        rightLabel: "坂田方 / 北陸本線 田村方",
        note: "米原駅の北、北陸本線との分岐部に並ぶ電留線群。敦賀方面の折り返しを受け持つ。",
        groups: [
            { name: "電留線", tracks: [
                { label: "電1", cars: 12, kind: "stabling" },
                { label: "電2", cars: 12, kind: "stabling" },
                { label: "電3", cars: 8, kind: "stabling" },
                { label: "電4", cars: 8, kind: "stabling" },
                { label: "電5", cars: 8, kind: "stabling" },
                { label: "電6", cars: 4, kind: "stabling" }
            ]},
            { name: "北陸線側 留置線", tracks: [
                { label: "北1", cars: 12, kind: "stabling" },
                { label: "北2", cars: 8, kind: "stabling" },
                { label: "北3", cars: 8, kind: "stabling" },
                { label: "北4", cars: 4, kind: "stabling" }
            ]},
            /* ★配線略図 (スクリーンショット(690).png) のとおり、米原は
               東海道線・北陸線・新幹線に囲まれた広い構内で、
               駅の北側にも側線が並ぶ。
               明石の207系・321系も琵琶湖線の普通で米原まで来るため
               (js/06-fleet.js の FLEET_BASES)、図の留置線に入りきらない
               編成が6割を超えていた。図にある側線を書き起こして足す。 */
            { name: "駅構内 側線", tracks: [
                { label: "構1", cars: 12, kind: "siding" },
                { label: "構2", cars: 12, kind: "siding" },
                { label: "構3", cars: 8, kind: "siding" },
                { label: "構4", cars: 8, kind: "siding" },
                { label: "洗浄", cars: 8, kind: "wash" }
            ]}
        ]
    }
};
