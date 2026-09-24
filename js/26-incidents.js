/* 輸送障害(事故・故障)の管理。

   ■ 考え方
     以前は「メッセージを出して列車を1本止める」だけで、
     まわりの列車や信号にはほとんど影響がなかった。
     ここでは、実際の輸送障害と同じように
       発生 → 初動(防護無線) → 区間支障 → 復旧作業 → 運転再開 → 徐行 → 平常
     という段階を踏み、それぞれの段階が
       ・運転見合わせ区間        (TrackManager.manualSuspensions)
       ・信号の停止現示          (SignalSystem.faults)
       ・徐行(速度規制)          (TrackManager.speedRestrictions)
       ・当該列車の停止・打ち切り (Train.minorTrouble / 回送化)
     として、実際のシミュレーションの状態を書き換える。
     そのため、後続列車は自然に詰まり、遅れが積み上がり、
     復旧後もその遅れを引きずったまま運転が続く。

   ■ 直接支障の上限
     遊びとして成り立たなくなるので、1件の輸送障害が
     線路を直接止め続けるのは最大1時間 (INCIDENT_MAX_BLOCK_SEC)。
     時間が来たら列車を瞬間移動させるのではなく、
     「設備の復旧が終わって運転再開、ただししばらく徐行」という形で解く。
     溜まった遅れはそのまま残り、ダイヤの乱れとして波及し続ける。
*/

// 1件の輸送障害が線路を直接止められる上限 (ゲーム内時間)
const INCIDENT_MAX_BLOCK_SEC = 3600;

/* 輸送障害の種類。
     id        … 識別子
     name      … 画面に出す名前
     weight    … 発生しやすさ
     needTrain … 当該列車が要るか
     radio     … 防護無線を発報するか
     block     … 線路を止める範囲 (null なら止めない)
                   { tracks:"same"|"parallel"|"all", radius: ブロック数 }
     hold      … 当該列車を止める秒数 [最小,最大]
     suspend   … 区間支障の秒数 [最小,最大]
     slow      … 復旧後の徐行 { sec, factor }
     fault     … 信号・転てつ器の故障として扱うか
     after     … 当該列車の後始末 "resume"(運転再開) / "deadhead"(回送打ち切り) / "rescue"(救援)
     phases    … 復旧作業の進み具合 (経過割合, 状況)
     (報告書のための項目は下の INCIDENT_TYPES の説明を参照)
*/
/* ★種類を増やした (2026-09)。
     起きる頻度 (発生の間隔・同時に起きる件数) と、系統ごとの起きやすさは変えていない。
     もとの10種類をそれぞれ「系統 (family)」とし、系統の重みを
     その中の種類に分けただけなので、どの系統がどれくらい起きるかの割合は
     以前とまったく同じ (合計の重みも 60 のまま)。
       人身事故 7 / 架線 4 / 信号 5 / 転てつ器 4 / 線路支障 5 /
       車両故障 8 / ドア 7 / 踏切 7 / 旅客対応 8 / 車内設備 5
     tools/check_incident_mix.js がこの割合を見張っている。

   報告書 (js/32-records.js) のための項目
     family  … 系統 (起きやすさの割合を保つ単位)
     cat     … 区分 (事故 / 設備故障 / 車両故障 / 旅客対応 / 外部要因)
     depts   … 手配する部署
     causeText … 原因・状況 (分かっている範囲)
     stock   … 当該編成の状況 (列車の付く障害だけ)
     crew    … 乗務員・現場との交信 [経過割合, 発信, 文面]  {no}=列車番号 {loc}=場所 */
const INCIDENT_TYPES = [
    // ================================================================ 人身事故 (7)
    {
        id: "jinshin", family: "jinshin", name: "人身事故", weight: 5, needTrain: true, radio: true,
        cat: "事故", depts: ["警察", "消防", "保線区", "車両所"],
        block: { tracks: "parallel", radius: 5 },
        hold: [1500, 2700], suspend: [1500, 2700],
        slow: { sec: 900, factor: 1.5 },
        after: "deadhead",
        cause: "人身事故",
        causeText: "走行中の当該列車と線路内の人とが接触。立ち入りの経緯は警察が調査中。",
        stock: "前頭部 (排障器・スカート) に接触痕。床下機器の点検の結果、自力走行は可能。営業運転は取りやめ、車両所で詳細点検。",
        first: (loc) => `${loc}にて人身事故が発生しました。防護無線を発報、付近の列車は直ちに停車してください。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}で人と接触しました。非常停止しています。防護無線を発報しました。"],
            [0.00, "指令", "了解。併発事故防止のため付近の列車を停止させます。車掌とともに現場を確認し、負傷者の状況を知らせてください。"],
            [0.18, "当該列車車掌", "{no} 車掌です。車内のお客様に負傷はありません。車内放送で状況をご案内しています。"],
            [0.45, "指令", "警察の実況見分が終わりしだい、床下点検の結果を報告してください。自力走行できる場合は最寄りの車両所へ回送とします。"],
            [0.80, "当該列車運転士", "床下点検終了。走行に支障する損傷はありません。回送運転可能です。"]
        ],
        phases: [
            [0.00, "警察・消防手配中", "現場へ警察・消防が向かっています。乗務員が現場確認中です。"],
            [0.20, "救護活動中", "救護活動を開始しました。ホーム上のお客様の避難誘導を実施中です。"],
            [0.50, "現場検証中", "救護活動は完了。警察による実況見分および車両の床下点検を行っています。"],
            [0.80, "最終安全確認", "現場検証が終了し、線路設備の安全確認を行っています。"]
        ]
    },
    {
        id: "jinshin_home", family: "jinshin", name: "人身事故 (駅構内)", weight: 2, needTrain: true, radio: true,
        atStation: true,
        cat: "事故", depts: ["警察", "消防", "駅", "車両所"],
        block: { tracks: "parallel", radius: 3 },
        hold: [1200, 2400], suspend: [1200, 2400],
        slow: { sec: 600, factor: 1.4 },
        after: "deadhead",
        cause: "人身事故",
        causeText: "駅ホームから線路内に転落した人と、進入してきた当該列車とが接触。ホーム上の状況は駅係員が確認中。",
        stock: "前頭部下部に接触痕。床下点検の結果、自力走行は可能。営業運転は取りやめ、車両所で点検。",
        first: (loc) => `${loc}構内で人身事故が発生しました。防護無線を発報、付近の列車は直ちに停車してください。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}進入時、ホームから転落した方と接触しました。非常停止、防護無線発報済みです。"],
            [0.00, "駅長", "{loc}駅長です。ホーム上の旅客を安全な位置へ誘導しています。救急隊の要請を行いました。"],
            [0.00, "指令", "了解。隣接線も含めて付近の列車を止めます。救護を最優先に、車掌は車内の案内をお願いします。"],
            [0.55, "駅長", "救護・搬送が完了しました。警察の現場確認が続いています。"],
            [0.85, "当該列車運転士", "床下の点検が終わりました。回送での移動は可能です。"]
        ],
        phases: [
            [0.00, "救護手配中", "救急隊・警察を手配し、ホーム上の旅客を誘導しています。"],
            [0.25, "救護活動中", "救急隊による救護活動を行っています。"],
            [0.55, "現場検証中", "警察による現場確認と、車両の床下点検を行っています。"],
            [0.85, "安全確認", "ホーム・線路の安全確認を行っています。"]
        ]
    },

    // ================================================================ 架線・電力 (4)
    {
        id: "kasen", family: "kasen", name: "架線障害", weight: 2, needTrain: false, radio: false,
        cat: "設備故障", depts: ["電力区"],
        block: { tracks: "parallel", radius: 4 },
        hold: null, suspend: [1200, 2700],
        slow: { sec: 900, factor: 1.4 },
        after: null,
        cause: "架線障害",
        causeText: "沿線からの飛来物 (ビニールシート) が架線に絡まり、き電を停止。",
        first: (loc) => `${loc}付近で架線に飛来物が接触し、送電を停止しました。当該区間は運転を見合わせます。`,
        crew: [
            [0.00, "電力指令", "{loc}付近の変電所で遮断器が動作しました。架線に飛来物の付着を確認、き電を停止します。"],
            [0.00, "指令", "了解。当該区間に在線の列車は抑止。電力区の出動をお願いします。"],
            [0.40, "電力区", "現地到着。ビニールシートが吊架線とトロリ線に絡んでいます。撤去にかかります。"],
            [0.85, "電力区", "撤去完了。架線の損傷はありません。き電再開可能です。"]
        ],
        phases: [
            [0.00, "電力区手配中", "電力区の作業員が現場へ向かっています。"],
            [0.30, "き電停止・確認中", "き電を停止し、架線および付属設備の状態を確認しています。"],
            [0.65, "復旧作業中", "架線の補修作業を行っています。"],
            [0.85, "き電再開・試験中", "き電を再開し、試験電車による確認を行います。"]
        ]
    },
    {
        id: "pantograph", family: "kasen", name: "パンタグラフ破損", weight: 1, needTrain: true, radio: false,
        cat: "車両故障", depts: ["電力区", "車両所"],
        block: { tracks: "same", radius: 3 },
        hold: [1200, 2400], suspend: [1200, 2400],
        slow: { sec: 900, factor: 1.4 },
        after: "deadhead",
        cause: "パンタグラフ破損",
        causeText: "当該列車のパンタグラフのすり板が破損し、架線 (トロリ線) の一部を損傷。原因は調査中。",
        stock: "パンタグラフ1基のすり板・舟体が破損。当該パンタグラフを降下・鎖錠し、残りのパンタグラフで自力走行可能。車両所へ回送して交換。",
        first: (loc, no) => `${loc}を走行中の ${no} のパンタグラフが破損し、架線を損傷しました。当該線は運転を見合わせます。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}で大きな音とともに架線電圧が無くなりました。非常停止しています。"],
            [0.00, "指令", "了解。当該線をき電停止します。パンタグラフの状態を目視で確認してください。"],
            [0.30, "当該列車運転士", "3両目のパンタグラフの舟体が破損しています。降下させました。"],
            [0.60, "電力区", "トロリ線に損傷を確認。部分的に張り替えます。"],
            [0.88, "電力区", "張り替え完了、き電再開。当該列車は残りのパンタグラフで回送可能です。"]
        ],
        phases: [
            [0.00, "状況確認中", "乗務員が車両と架線の状態を確認しています。"],
            [0.30, "パンタグラフ降下・鎖錠", "破損したパンタグラフを降下・鎖錠しています。"],
            [0.55, "架線補修中", "電力区が損傷した架線を補修しています。"],
            [0.85, "き電再開・確認中", "き電を再開し、当該列車の走行試験を行います。"]
        ]
    },
    {
        id: "teiden", family: "kasen", name: "停電 (き電停止)", weight: 1, needTrain: false, radio: false,
        cat: "設備故障", depts: ["電力区", "電力指令"],
        block: { tracks: "all", radius: 6 },
        hold: null, suspend: [900, 2100],
        slow: { sec: 600, factor: 1.3 },
        after: null,
        cause: "停電",
        causeText: "変電所の保護装置が動作し、当該き電区間が停電。送電線の瞬時停電とみられるが詳細は調査中。",
        first: (loc) => `${loc}付近のき電区間で停電が発生しました。当該区間の上下線で運転を見合わせます。`,
        crew: [
            [0.00, "電力指令", "{loc}付近の変電所で饋電用遮断器が動作、当該区間が停電しています。"],
            [0.00, "指令", "了解。区間内の列車は駅間で停車中のため、車内の空調・照明の状況を確認させます。"],
            [0.20, "駅間停車中の列車 運転士", "停電により非常灯のみ点灯しています。車内は落ち着いています。"],
            [0.60, "電力指令", "設備の異常はありません。順次送電を再開します。"],
            [0.85, "電力区", "送電再開を確認。各列車の力行試験をお願いします。"]
        ],
        phases: [
            [0.00, "原因調査中", "電力指令が停電の原因を調べています。"],
            [0.35, "設備点検中", "変電所と架線の設備を点検しています。"],
            [0.65, "送電再開準備", "安全を確認し、送電の再開を準備しています。"],
            [0.85, "送電再開・確認中", "送電を再開し、列車の走行を確認しています。"]
        ]
    },

    // ================================================================ 信号 (5)
    {
        id: "shingo", family: "shingo", name: "信号設備故障", weight: 2, needTrain: false, radio: false,
        cat: "設備故障", depts: ["信号通信区"],
        block: { tracks: "same", radius: 3 }, fault: true,
        hold: null, suspend: [900, 2100],
        slow: { sec: 1200, factor: 1.6 },
        after: null,
        cause: "信号故障",
        causeText: "閉塞信号機が停止現示のまま復帰しない。信号機器室の継電器の不良とみられる。",
        first: (loc) => `${loc}の閉塞信号機が停止現示のまま復帰しません。当該区間は進路が構成できません。`,
        crew: [
            [0.00, "{no}運転士", "{loc}の閉塞信号機が停止現示のままです。前方に列車は見えません。"],
            [0.00, "指令", "了解。信号通信区を手配します。指示があるまでその場で待機してください。"],
            [0.40, "信号通信区", "機器室で継電器の不良を確認しました。交換します。"],
            [0.72, "指令", "復旧に時間を要するため、代用手信号の準備を指示しました。"],
            [0.90, "信号通信区", "交換完了。現示が正常に切り替わることを確認しました。"]
        ],
        phases: [
            [0.00, "信号通信区手配中", "信号通信区の係員が現場へ向かっています。"],
            [0.35, "機器点検中", "信号機器室にて連動装置の点検を行っています。"],
            [0.70, "代用手信号準備", "復旧の見込みが立たないため、代用手信号による運転の準備をしています。"],
            [0.88, "動作試験中", "機器を復旧し、動作試験を行っています。"]
        ]
    },
    {
        id: "kidokairo", family: "shingo", name: "軌道回路故障", weight: 2, needTrain: false, radio: false,
        cat: "設備故障", depts: ["信号通信区", "保線区"],
        block: { tracks: "same", radius: 2 }, fault: true,
        hold: null, suspend: [900, 1800],
        slow: { sec: 900, factor: 1.5 },
        after: null,
        cause: "軌道回路故障",
        causeText: "列車のいない区間で軌道回路が「在線」を示したまま戻らない (不正落下)。レール継目のボンド線の不良とみられる。",
        first: (loc) => `${loc}付近で軌道回路が在線を示したまま復帰しません。当該区間の信号が停止現示となっています。`,
        crew: [
            [0.00, "指令", "{loc}付近の軌道回路が不正落下しています。当該区間に在線はありません。"],
            [0.00, "信号通信区", "了解。現場へ向かいます。保線区にも立ち会いを依頼します。"],
            [0.50, "信号通信区", "レール継目のボンド線の断線を確認。仮復旧します。"],
            [0.85, "信号通信区", "仮復旧完了。軌道回路の動作は正常です。"]
        ],
        phases: [
            [0.00, "係員手配中", "信号通信区・保線区の係員が現場へ向かっています。"],
            [0.40, "原因調査中", "軌道回路のレール・ボンド線を点検しています。"],
            [0.70, "仮復旧作業中", "不良箇所の仮復旧を行っています。"],
            [0.88, "動作確認中", "軌道回路の動作を確認しています。"]
        ]
    },
    {
        id: "ats", family: "shingo", name: "ATS地上装置の異常", weight: 1, needTrain: false, radio: false,
        cat: "設備故障", depts: ["信号通信区"],
        block: { tracks: "same", radius: 2 }, fault: true,
        hold: null, suspend: [600, 1500],
        slow: { sec: 900, factor: 1.5 },
        after: null,
        cause: "ATS地上装置の異常",
        causeText: "ATS-P の地上子 (トランスポンダ) が誤った情報を送り、通過した列車に非常ブレーキが動作。",
        first: (loc) => `${loc}付近のATS地上装置に異常が発生しました。当該区間の列車の運転を見合わせます。`,
        crew: [
            [0.00, "{no}運転士", "{loc}付近でATSのパターンに当たり、非常ブレーキが動作しました。信号は進行現示でした。"],
            [0.00, "指令", "了解。後続列車も抑止します。信号通信区を手配します。"],
            [0.45, "信号通信区", "地上子の情報に誤りがありました。電子装置を交換します。"],
            [0.85, "信号通信区", "交換完了。試験列車で動作を確認しました。"]
        ],
        phases: [
            [0.00, "係員手配中", "信号通信区の係員が現場へ向かっています。"],
            [0.45, "装置交換中", "ATS地上子の電子装置を交換しています。"],
            [0.80, "動作試験中", "試験列車でATSの動作を確認しています。"]
        ]
    },

    // ================================================================ 転てつ器 (4)
    {
        id: "tentetsu", family: "tentetsu", name: "転てつ器故障", weight: 3, needTrain: false, radio: false,
        cat: "設備故障", depts: ["施設区", "信号通信区"],
        block: { tracks: "same", radius: 1 }, fault: true, atStation: true,
        hold: null, suspend: [600, 1800],
        slow: { sec: 600, factor: 1.3 },
        after: null,
        cause: "転てつ器故障",
        causeText: "電気転てつ機が転換途中で止まり、定位・反位のどちらにも鎖錠できない。",
        first: (loc) => `${loc}構内の転てつ器が転換不能となりました。当該番線への進路が構成できません。`,
        crew: [
            [0.00, "駅 (信号扱い)", "{loc}構内の転てつ器が転換不能です。表示が出ません。"],
            [0.00, "指令", "了解。当該番線を使わない進路で運転します。施設区を手配してください。"],
            [0.45, "施設区", "転てつ機のモーターが過負荷で停止しています。手回しで転換し、鎖錠します。"],
            [0.80, "施設区", "手回し転換・鎖錠完了。当面は定位に固定して使用します。"]
        ],
        phases: [
            [0.00, "係員手配中", "施設区の係員が現場へ向かっています。"],
            [0.40, "転てつ器点検中", "転換不能の原因を調査しています。"],
            [0.75, "手動転換・鎖錠", "転てつ器を手動で転換し、鎖錠して使用できるようにします。"]
        ]
    },
    {
        id: "tentetsu_ibutsu", family: "tentetsu", name: "転てつ器への異物挟まり", weight: 1, needTrain: false, radio: false,
        cat: "外部要因", depts: ["施設区"],
        block: { tracks: "same", radius: 1 }, fault: true, atStation: true,
        hold: null, suspend: [600, 1500],
        slow: { sec: 600, factor: 1.3 },
        after: null,
        cause: "転てつ器異物挟まり",
        causeText: "トングレールと基本レールの間に石 (バラスト) が挟まり、密着しない。",
        first: (loc) => `${loc}構内の転てつ器に異物が挟まり、密着しません。当該番線への進路が構成できません。`,
        crew: [
            [0.00, "駅 (信号扱い)", "{loc}構内の転てつ器が「不密着」の表示です。"],
            [0.00, "指令", "了解。施設区に異物の除去を依頼します。"],
            [0.55, "施設区", "トングレールの間にバラストが挟まっていました。除去しました。"],
            [0.85, "施設区", "転換試験を行い、密着・鎖錠を確認しました。"]
        ],
        phases: [
            [0.00, "係員手配中", "施設区の係員が現場へ向かっています。"],
            [0.45, "異物除去中", "転てつ器に挟まった異物を取り除いています。"],
            [0.80, "転換試験中", "転換試験で密着・鎖錠を確認しています。"]
        ]
    },

    // ================================================================ 線路支障 (5)
    {
        id: "shishobutsu", family: "shishobutsu", name: "線路支障", weight: 2, needTrain: false, radio: true,
        cat: "外部要因", depts: ["保線区"],
        block: { tracks: "parallel", radius: 3 },
        hold: null, suspend: [600, 1500],
        slow: { sec: 600, factor: 1.4 },
        after: null,
        cause: "線路内支障物",
        causeText: "線路内に自転車が置かれているのを列車の運転士が発見。何者かが置いたものとみられ、警察へ届け出。",
        first: (loc) => `${loc}付近の線路内に支障物を確認しました。安全確認のため運転を見合わせます。`,
        crew: [
            [0.00, "{no}運転士", "{loc}付近で線路内に自転車を認め、非常停止しました。衝突はしていません。"],
            [0.00, "指令", "了解。防護無線の発報を確認。係員を向かわせます。支障物に近づかず待機してください。"],
            [0.45, "保線区", "支障物を撤去しました。線路に損傷はありません。"],
            [0.80, "指令", "警察へ届け出を行いました。運転再開の準備をしてください。"]
        ],
        phases: [
            [0.00, "安全確認中", "乗務員および係員が線路内の状況を確認しています。"],
            [0.45, "支障物撤去中", "支障物の撤去作業を行っています。"],
            [0.80, "線路点検中", "撤去後の軌道および架線の点検を行っています。"]
        ]
    },
    {
        id: "toboku", family: "shishobutsu", name: "倒木", weight: 1, needTrain: false, radio: true,
        cat: "外部要因", depts: ["保線区", "電力区"],
        block: { tracks: "parallel", radius: 3 },
        hold: null, suspend: [1200, 2700],
        slow: { sec: 900, factor: 1.5 },
        after: null,
        cause: "倒木",
        causeText: "沿線の樹木が線路内に倒れ込み、線路および架線の一部を支障。",
        first: (loc) => `${loc}付近で沿線の木が線路内に倒れ込みました。安全確認のため運転を見合わせます。`,
        crew: [
            [0.00, "{no}運転士", "{loc}付近で前方の線路に倒木を発見、非常停止しました。架線にも掛かっているようです。"],
            [0.00, "指令", "了解。当該区間をき電停止します。保線区・電力区を手配します。"],
            [0.50, "保線区", "倒木の伐採・撤去を進めています。レールに損傷はありません。"],
            [0.85, "電力区", "架線の点検終了。損傷はありません。き電再開します。"]
        ],
        phases: [
            [0.00, "状況確認中", "乗務員が倒木の状況を確認しています。"],
            [0.30, "撤去作業中", "保線区が倒木を伐採・撤去しています。"],
            [0.70, "設備点検中", "線路と架線の点検を行っています。"]
        ]
    },
    {
        id: "tachiiri", family: "shishobutsu", name: "線路内立ち入り", weight: 1, needTrain: false, radio: true,
        cat: "外部要因", depts: ["警察", "駅"],
        block: { tracks: "parallel", radius: 2 },
        hold: null, suspend: [600, 1200],
        slow: { sec: 300, factor: 1.3 },
        after: null,
        cause: "線路内立ち入り",
        causeText: "線路内を歩く人がいるとの通報。係員と警察で捜索し、線路外へ退去させた。",
        first: (loc) => `${loc}付近の線路内に人が立ち入っているとの情報があり、安全確認のため運転を見合わせます。`,
        crew: [
            [0.00, "{no}運転士", "{loc}付近で線路内を歩いている人を見ました。警笛を鳴らし、非常停止しました。"],
            [0.00, "指令", "了解。防護無線を確認。駅係員と警察に捜索を依頼します。"],
            [0.50, "駅長", "線路内の人を係員が発見し、線路外へ誘導しました。警察に引き渡します。"],
            [0.85, "指令", "線路内に人がいないことを確認しました。運転を再開します。"]
        ],
        phases: [
            [0.00, "捜索中", "係員と警察が線路内を捜索しています。"],
            [0.50, "安全確認中", "線路内に人がいないことを確認しています。"]
        ]
    },
    {
        id: "doubutsu", family: "shishobutsu", name: "動物との衝突", weight: 1, needTrain: true, radio: false,
        cat: "外部要因", depts: ["保線区", "車両所"],
        block: { tracks: "same", radius: 1 },
        hold: [600, 1200], suspend: [300, 900],
        slow: { sec: 300, factor: 1.3 },
        after: "resume",
        cause: "動物と衝突",
        causeText: "走行中の当該列車が線路内に入ったシカと衝突。",
        stock: "前頭部に衝突痕。床下の機器・ブレーキ管に異常なし。点検のうえ運転継続。",
        first: (loc, no) => `${loc}を走行中の ${no} が動物と衝突しました。車両と線路の点検を行います。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}でシカと衝突し、非常停止しました。"],
            [0.00, "指令", "了解。床下と前頭部を点検し、走行に支障がないか確認してください。"],
            [0.55, "当該列車運転士", "点検終了。ブレーキ管・床下機器に異常ありません。運転継続可能です。"]
        ],
        phases: [
            [0.00, "車両点検中", "乗務員が車両の床下を点検しています。"],
            [0.55, "線路確認中", "衝突した動物を線路外へ移し、線路を確認しています。"]
        ]
    },

    // ================================================================ 車両故障 (8)
    {
        id: "syaryo", family: "syaryo", name: "車両故障", weight: 3, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [600, 1500], suspend: null,
        slow: { sec: 600, factor: 1.3 },
        after: "deadhead",
        cause: "車両故障",
        causeText: "主回路 (主変換装置) の保護装置が動作し、力行できなくなった。",
        stock: "主変換装置1台が故障のため開放。残りのユニットで自力走行可能。営業運転は取りやめ、車両所へ回送して点検。",
        first: (loc, no) => `${loc}を走行中の ${no} で主回路に異常が発生し、非常停車しました。乗務員が復帰操作を行っています。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}で主回路の故障表示が出て、力行できません。停車しています。"],
            [0.00, "指令", "了解。故障の処置手順で復帰を試みてください。車両所の技術担当につなぎます。"],
            [0.40, "車両所", "モニタの記録を見ました。当該ユニットを開放して、残りで走行してください。"],
            [0.75, "当該列車運転士", "開放扱い完了。力行できます。ただし加速が鈍いです。"],
            [0.80, "指令", "了解。次の駅でお客様に降りていただき、回送として車両所へ入れます。"]
        ],
        phases: [
            [0.00, "乗務員による復帰操作", "乗務員が保護装置の復帰操作を行っています。"],
            [0.40, "車両所と連絡中", "車両所へ連絡し、機器の状態を確認しています。"],
            [0.75, "応急処置中", "応急処置を行い、自力走行の可否を判断しています。"]
        ]
    },
    {
        id: "brake", family: "syaryo", name: "ブレーキ装置故障", weight: 2, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [600, 1500], suspend: null,
        slow: { sec: 600, factor: 1.3 },
        after: "deadhead",
        cause: "ブレーキ故障",
        causeText: "ブレーキが緩まない車両がある (ブレーキ不緩解)。制御装置の不良とみられる。",
        stock: "当該車両のブレーキ制御装置が不良。当該車のブレーキを締め切り、編成のブレーキ力を確認のうえ速度を制限して自力走行可能。車両所へ回送。",
        first: (loc, no) => `${loc}で ${no} のブレーキ装置に異常が発生しました。乗務員が点検を行っています。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。ブレーキ不緩解の表示が出ています。{loc}で停車しました。"],
            [0.00, "指令", "了解。該当する車両を確認し、締め切り扱いの可否を判断してください。"],
            [0.45, "当該列車車掌", "5両目の車輪付近から焦げたにおいがします。ブレーキが当たったままのようです。"],
            [0.70, "車両所", "当該車のブレーキを締め切ってください。ブレーキ率を確認して、速度を落として回送願います。"]
        ],
        phases: [
            [0.00, "乗務員点検中", "乗務員が各車両のブレーキ表示を確認しています。"],
            [0.45, "締切扱い中", "故障した車両のブレーキを締め切っています。"],
            [0.75, "ブレーキ試験中", "ブレーキ試験を行い、走行できるか確認しています。"]
        ]
    },
    {
        id: "ibuon", family: "syaryo", name: "床下異音", weight: 2, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [420, 1080], suspend: null,
        slow: { sec: 300, factor: 1.2 },
        after: "resume",
        cause: "床下異音",
        causeText: "走行中に床下から異音がしたと車掌から申告。点検の結果、走行に支障のあるものは見つからなかった。",
        stock: "床下機器・台車を点検したが異常なし。運転継続。終着後に車両所で詳細点検を予定。",
        first: (loc, no) => `${loc}で ${no} の床下から異音がしたため、停車して点検を行っています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。4両目付近の床下から、何かが当たるような音がしました。"],
            [0.00, "指令", "了解。次の駅に停車後、運転士と2人で床下を点検してください。"],
            [0.60, "当該列車運転士", "床下・台車を点検しましたが、異常は見当たりません。"],
            [0.65, "指令", "了解。運転を継続してください。終着後に車両所で点検します。"]
        ],
        phases: [
            [0.00, "床下点検中", "乗務員が床下と台車を点検しています。"],
            [0.60, "運転再開準備", "点検の結果に異常が無く、運転再開の準備をしています。"]
        ]
    },
    {
        id: "daisha", family: "syaryo", name: "空気ばね・台車の異常", weight: 1, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [900, 1800], suspend: null,
        slow: { sec: 600, factor: 1.3 },
        after: "deadhead",
        cause: "台車異常",
        causeText: "空気ばねのパンク検知が動作し、当該車両の車体が傾いている。",
        stock: "当該車の空気ばね1個がパンク。高さ調整弁を締め切り、速度を制限して回送。車両所で空気ばねを交換。",
        first: (loc, no) => `${loc}で ${no} の空気ばねに異常を検知しました。車両の点検を行っています。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。空気ばねの異常表示が出ました。{loc}で停車しています。"],
            [0.00, "指令", "了解。車体の傾きと、台車周りを確認してください。"],
            [0.40, "当該列車運転士", "6両目がわずかに傾いています。空気ばねから空気が抜けています。"],
            [0.70, "車両所", "高さ調整弁を締め切ってください。速度を制限すれば回送できます。"]
        ],
        phases: [
            [0.00, "状況確認中", "乗務員が台車の状態を確認しています。"],
            [0.40, "応急処置中", "空気ばねの応急処置を行っています。"],
            [0.75, "回送準備", "お客様に降りていただき、回送の準備をしています。"]
        ]
    },

    // ================================================================ ドア (7)
    {
        id: "door", family: "door", name: "ドア故障", weight: 4, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所", "駅"],
        block: null, atStation: true,
        hold: [300, 780], suspend: null,
        slow: null,
        after: "resume",
        cause: "ドア故障",
        causeText: "一部の側引戸が閉まりきらず、戸閉め表示灯が点かない。",
        stock: "当該の側引戸を締切扱い (閉めたまま鎖錠) とし、運転継続。終着後に車両所で戸閉め装置を点検。",
        first: (loc, no) => `${loc}停車中の ${no} で一部の側引戸が閉扉しません。乗務員が扱い直しを行っています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。{loc}で3両目の1か所のドアが閉まりません。扱い直します。"],
            [0.45, "当該列車車掌", "何度か扱いましたが閉まりません。駅係員と戸閉め装置を確認します。"],
            [0.80, "指令", "当該ドアを締切扱いとし、運転を再開してください。車内放送で案内をお願いします。"]
        ],
        phases: [
            [0.00, "扱い直し中", "戸閉め扱いを繰り返しています。"],
            [0.45, "戸閉め装置点検中", "駅係員とともに戸閉め装置を点検しています。"],
            [0.80, "戸締切扱い準備", "当該ドアを締切扱いとし、運転を再開する準備をしています。"]
        ]
    },
    {
        id: "tobasami", family: "door", name: "戸挟み・荷物挟まり", weight: 2, needTrain: true, radio: false,
        cat: "旅客対応", depts: ["駅"],
        block: null, atStation: true,
        hold: [180, 480], suspend: null,
        slow: null,
        after: "resume",
        cause: "戸挟み",
        causeText: "駆け込み乗車によりドアに荷物が挟まり、戸閉め表示灯が点かない。",
        first: (loc, no) => `${loc}で ${no} のドアにお客様の荷物が挟まりました。安全を確認しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。{loc}で2両目のドアに荷物が挟まりました。再開閉します。"],
            [0.50, "駅係員", "荷物を取り除きました。お客様にけがはありません。"],
            [0.60, "当該列車車掌", "戸閉め確認、出発します。"]
        ],
        phases: [
            [0.00, "再開閉・安全確認中", "ドアの再開閉と、お客様の安全確認を行っています。"],
            [0.60, "発車準備", "安全を確認し、発車の準備をしています。"]
        ]
    },
    {
        id: "homesaku", family: "door", name: "ホーム柵の故障", weight: 1, needTrain: true, radio: false,
        cat: "設備故障", depts: ["駅", "電気区"],
        block: null, atStation: true,
        hold: [300, 900], suspend: null,
        slow: null,
        after: "resume",
        cause: "ホーム柵故障",
        causeText: "ホーム柵 (可動柵) の扉が閉まらず、列車の出発条件が整わない。",
        first: (loc, no) => `${loc}でホーム柵の扉が閉まらず、${no} が発車できません。係員が確認しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。{loc}でホーム柵の1か所が閉まりません。発車できません。"],
            [0.00, "駅長", "係員を向かわせます。当該の扉を手動で閉め、使用停止にします。"],
            [0.70, "駅長", "当該扉を使用停止にしました。発車して差し支えありません。"]
        ],
        phases: [
            [0.00, "係員確認中", "駅係員がホーム柵の状態を確認しています。"],
            [0.65, "使用停止扱い", "故障した扉を手動で閉め、使用停止にしています。"]
        ]
    },

    // ================================================================ 踏切 (7)
    {
        id: "fumikiri", family: "fumikiri", name: "踏切障害", weight: 3, needTrain: true, radio: true,
        cat: "外部要因", depts: ["保線区", "警察"],
        block: { tracks: "same", radius: 1 },
        hold: [300, 900], suspend: [300, 900],
        slow: { sec: 300, factor: 1.3 },
        after: "resume",
        cause: "踏切障害",
        causeText: "踏切の非常ボタンが押された。押した理由は通行者に確認中。",
        first: (loc, no) => `${loc}の踏切で非常ボタンが動作しました。${no} は非常停車、安全確認を行います。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}の踏切の特殊信号発光機が点滅、非常停止しました。"],
            [0.00, "指令", "了解。踏切の状況を確認してください。防護無線の発報を確認しました。"],
            [0.50, "当該列車運転士", "踏切内に支障物はありません。自転車の方がボタンを押したとのことです。"],
            [0.85, "指令", "了解。運転を再開してください。"]
        ],
        phases: [
            [0.00, "安全確認中", "乗務員が踏切の状況を確認しています。"],
            [0.50, "支障物確認中", "踏切内の支障物の有無および接触の有無を確認しています。"],
            [0.85, "確認完了・再開準備", "安全が確認できたため、運転再開の準備をしています。"]
        ]
    },
    {
        id: "fumikiri_car", family: "fumikiri", name: "踏切内の自動車立ち往生", weight: 2, needTrain: true, radio: true,
        cat: "外部要因", depts: ["警察", "保線区"],
        block: { tracks: "parallel", radius: 1 },
        hold: [600, 1500], suspend: [600, 1500],
        slow: { sec: 300, factor: 1.3 },
        after: "resume",
        cause: "踏切支障",
        causeText: "踏切内で乗用車が脱輪し、動けなくなった。障害物検知装置が動作。",
        first: (loc, no) => `${loc}の踏切内で自動車が立ち往生しています。${no} は非常停車しました。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}の踏切で車が線路に脱輪しています。手前で停止しました。接触はありません。"],
            [0.00, "指令", "了解。隣接線も止めます。警察とレッカーの手配をします。"],
            [0.55, "保線区", "車両を踏切外へ移動しました。レール・踏切設備に損傷はありません。"],
            [0.85, "指令", "踏切の動作確認が取れました。運転を再開します。"]
        ],
        phases: [
            [0.00, "安全確認中", "乗務員が踏切の状況を確認しています。"],
            [0.35, "車両撤去中", "警察の立ち会いのもと、立ち往生した車を移動しています。"],
            [0.80, "踏切点検中", "踏切設備とレールを点検しています。"]
        ]
    },
    {
        id: "shadankan", family: "fumikiri", name: "踏切しゃ断かんの折損", weight: 1, needTrain: true, radio: false,
        cat: "外部要因", depts: ["信号通信区", "警察"],
        block: { tracks: "same", radius: 1 },
        hold: [300, 900], suspend: [300, 900],
        slow: { sec: 300, factor: 1.3 },
        after: "resume",
        cause: "しゃ断かん折損",
        causeText: "踏切に進入した自動車がしゃ断かんを折損。自動車は走り去った。",
        first: (loc, no) => `${loc}の踏切でしゃ断かんが折られました。${no} は徐行して安全を確認します。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}の踏切のしゃ断かんが1本折れています。"],
            [0.00, "指令", "了解。係員を配置して踏切の見張りを行います。それまで踏切手前で一旦停止してください。"],
            [0.60, "信号通信区", "仮のしゃ断かんを取り付けました。動作は正常です。"]
        ],
        phases: [
            [0.00, "踏切監視手配中", "係員が踏切へ向かっています。"],
            [0.50, "仮復旧中", "しゃ断かんの仮復旧を行っています。"]
        ]
    },
    {
        id: "chokuzen", family: "fumikiri", name: "踏切直前横断", weight: 1, needTrain: true, radio: false,
        cat: "外部要因", depts: ["警察"],
        block: null,
        hold: [240, 600], suspend: null,
        slow: null,
        after: "resume",
        cause: "直前横断",
        causeText: "しゃ断かんをくぐって踏切内に入った歩行者がいたため、非常ブレーキを使用。接触はなし。",
        first: (loc, no) => `${loc}の踏切で直前横断があり、${no} が非常停車しました。接触の有無を確認します。`,
        crew: [
            [0.00, "当該列車運転士", "{no} 運転士です。{loc}の踏切で直前横断があり、非常停止しました。"],
            [0.00, "指令", "了解。接触の有無を確認してください。"],
            [0.60, "当該列車運転士", "接触はありません。横断した方はそのまま立ち去りました。運転を再開します。"]
        ],
        phases: [
            [0.00, "接触確認中", "乗務員が接触の有無を確認しています。"],
            [0.60, "運転再開準備", "接触がないことを確認し、運転再開の準備をしています。"]
        ]
    },

    // ================================================================ 旅客対応 (8)
    {
        id: "kyubyonin", family: "kyubyonin", name: "急病人救護", weight: 5, needTrain: true, radio: false,
        cat: "旅客対応", depts: ["駅", "消防"],
        block: null, atStation: true,
        hold: [240, 720], suspend: null,
        slow: null,
        after: "resume",
        cause: "急病人救護",
        causeText: "車内で体調を崩されたお客様があり、非常通報装置で乗務員に通報があった。",
        first: (loc, no) => `${loc}停車中の ${no} の車内で急病人が発生しました。駅係員および救急隊を手配しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。5両目で急病のお客様があり、非常通報がありました。{loc}で救護します。"],
            [0.00, "指令", "了解。{loc}駅に救急隊の要請と、駅係員の手配をします。"],
            [0.45, "駅長", "救急隊が到着し、お客様を搬送しました。"],
            [0.85, "当該列車車掌", "救護完了、発車します。"]
        ],
        phases: [
            [0.00, "駅係員手配中", "駅係員が当該車両へ向かっています。"],
            [0.45, "救護中", "救急隊が到着し、救護活動を行っています。"],
            [0.85, "搬送完了・再開準備", "搬送が完了し、運転再開の準備をしています。"]
        ]
    },
    {
        id: "shanai_trouble", family: "kyubyonin", name: "車内トラブル", weight: 2, needTrain: true, radio: false,
        cat: "旅客対応", depts: ["警察", "駅"],
        block: null, atStation: true,
        hold: [420, 1200], suspend: null,
        slow: null,
        after: "resume",
        cause: "車内トラブル",
        causeText: "車内でお客様どうしのトラブルがあり、警察官の臨場を要請。",
        first: (loc, no) => `${loc}で ${no} の車内でお客様どうしのトラブルが発生し、警察官の到着を待っています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。車内でお客様どうしの口論があり、つかみ合いになっています。{loc}で停車します。"],
            [0.00, "指令", "了解。{loc}駅に警察官の要請をします。乗務員は安全を確保してください。"],
            [0.60, "駅長", "警察官が到着し、当事者を降車させました。"],
            [0.80, "当該列車車掌", "車内は落ち着きました。発車します。"]
        ],
        phases: [
            [0.00, "警察手配中", "警察官の到着を待っています。"],
            [0.60, "事情聴取中", "警察官が当事者から事情を聴いています。"]
        ]
    },
    {
        id: "fushinbutsu", family: "kyubyonin", name: "不審物の確認", weight: 1, needTrain: true, radio: false,
        cat: "旅客対応", depts: ["警察", "駅"],
        block: null, atStation: true,
        hold: [600, 1500], suspend: null,
        slow: null,
        after: "resume",
        cause: "不審物確認",
        causeText: "車内の網棚に持ち主不明の荷物があるとお客様から申告。警察が確認した結果、忘れ物と判明。",
        first: (loc, no) => `${loc}で ${no} の車内に不審な荷物があるとの申告があり、警察が確認しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。網棚に持ち主の分からない荷物があると申告がありました。"],
            [0.00, "指令", "了解。{loc}で当該車両のお客様を別の車両へ移し、警察の確認を待ってください。"],
            [0.70, "駅長", "警察が中身を確認しました。忘れ物です。遺失物として駅で預かります。"]
        ],
        phases: [
            [0.00, "旅客避難・警察手配中", "当該車両のお客様を別の車両へ移し、警察を待っています。"],
            [0.60, "警察確認中", "警察が荷物を確認しています。"]
        ]
    },

    // ================================================================ 車内設備 (5)
    {
        id: "kikikosho", family: "kikikosho", name: "車内設備故障", weight: 2, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [240, 600], suspend: null,
        slow: null,
        after: "resume",
        cause: "車内設備故障",
        causeText: "車内放送装置および行先表示器の電源装置が停止。",
        stock: "放送装置・行先表示器の電源を再投入し復帰。運転継続。終着後に車両所で点検。",
        first: (loc, no) => `${loc}にて ${no} の車内放送装置および行先表示器が動作しなくなりました。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。車内放送と行先表示器が使えません。"],
            [0.00, "指令", "了解。電源の再投入を試してください。復帰しない場合は肉声で案内をお願いします。"],
            [0.60, "当該列車車掌", "再投入で復帰しました。"]
        ],
        phases: [
            [0.00, "乗務員確認中", "乗務員が車内の機器を確認しています。"],
            [0.55, "復帰操作中", "電源の復帰操作を行っています。"]
        ]
    },
    {
        id: "kucho", family: "kikikosho", name: "空調装置の故障", weight: 2, needTrain: true, radio: false,
        cat: "車両故障", depts: ["車両所"],
        block: null,
        hold: [240, 600], suspend: null,
        slow: null,
        after: "resume",
        cause: "空調故障",
        causeText: "1両の空調装置が停止し、車内温度が上がっている。",
        stock: "当該車の空調装置が停止。復帰操作で回復せず、お客様を他の車両へご案内して運転継続。終着後に車両所で修理。",
        first: (loc, no) => `${loc}で ${no} の1両の空調装置が停止しました。乗務員が対応しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。7両目の冷房が止まっています。車内が暑いとの申告があります。"],
            [0.00, "指令", "了解。復帰操作を試してください。駄目なら他の車両へ移っていただくよう案内してください。"],
            [0.60, "当該列車車掌", "復帰しません。お客様には隣の車両へご案内しました。運転は継続します。"]
        ],
        phases: [
            [0.00, "復帰操作中", "乗務員が空調装置の復帰操作を行っています。"],
            [0.55, "旅客案内中", "お客様を他の車両へご案内しています。"]
        ]
    },
    {
        id: "tsuho", family: "kikikosho", name: "非常通報装置の扱い", weight: 1, needTrain: true, radio: false,
        cat: "旅客対応", depts: ["駅"],
        block: null,
        hold: [240, 540], suspend: null,
        slow: null,
        after: "resume",
        cause: "非常通報",
        causeText: "車内の非常通報装置が扱われた。乗務員が確認したところ、誤って押されたものだった。",
        first: (loc, no) => `${loc}で ${no} の車内の非常通報装置が扱われました。乗務員が確認しています。`,
        crew: [
            [0.00, "当該列車車掌", "{no} 車掌です。4両目で非常通報装置が扱われました。確認に向かいます。"],
            [0.55, "当該列車車掌", "お客様が誤って押されたとのことです。異常ありません。復位して発車します。"]
        ],
        phases: [
            [0.00, "車内確認中", "乗務員が通報のあった車両を確認しています。"],
            [0.55, "復位・発車準備", "通報装置を復位し、発車の準備をしています。"]
        ]
    }
];

/* 系統ごとの重み (種類を増やす前の値)。起きやすさの割合を保つための基準。 */
const INCIDENT_FAMILY_WEIGHTS = {
    jinshin: 7, kasen: 4, shingo: 5, tentetsu: 4, shishobutsu: 5,
    syaryo: 8, door: 7, fumikiri: 7, kyubyonin: 8, kikikosho: 5
};

/** 重み付き抽選 */
function pickIncidentType() {
    const total = INCIDENT_TYPES.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of INCIDENT_TYPES) { r -= t.weight; if (r < 0) return t; }
    return INCIDENT_TYPES[0];
}

/** 並走する線路 (同じ向きの内・外、および反対方向) */
function parallelTracks(trackId) {
    if (trackId.indexOf("Kosei") === 0) return ["Kosei_Up", "Kosei_Down"];
    if (trackId.indexOf("Fukuchi") === 0) return ["Fukuchi_Up", "Fukuchi_Down"];
    if (trackId.indexOf("Tozai") === 0) return ["Tozai_Up", "Tozai_Down"];
    if (trackId.indexOf("Hoppo") >= 0) return ["Up_Hoppo", "Down_Hoppo"];
    return ["Up_Out", "Up_In", "Down_In", "Down_Out"];
}

let INCIDENT_SEQ = 0;

class IncidentSystem {
    constructor(game) {
        this.game = game;
        this.active = [];
        this.history = [];
        // 次に輸送障害が起きる時刻。最初の1件は早めに起きないようにする。
        this.nextAt = game.currentTime + 2400 + Math.random() * 5400;
    }

    /** 指令が全解除したときに呼ぶ */
    clearAll(reason) {
        this.active.forEach(inc => this.finish(inc, reason || "指令による解除", true));
        this.active = [];
        this.syncEmergencyState();
    }

    // ------------------------------------------------------------ 発生
    /** 条件に合う場所と当該列車を選ぶ */
    pickLocation(type) {
        const running = this.game.trains.filter(t =>
            t.state !== "finished" && t.state !== "in_depot" && t.currBlockIndex >= 0);
        if (type.needTrain) {
            let pool = running;
            if (type.atStation) {
                pool = running.filter(t => {
                    const b = this.game.trackMgr.blocks[t.trackId][t.currBlockIndex];
                    return b && (b.isStation || b.hoppoStationName) && t.state === "stopped";
                });
                // 停車中の列車が見つからなければ、駅にいる列車まで広げる
                if (!pool.length) pool = running.filter(t => {
                    const b = this.game.trackMgr.blocks[t.trackId][t.currBlockIndex];
                    return b && (b.isStation || b.hoppoStationName);
                });
            } else {
                pool = running.filter(t => t.state === "running");
                if (!pool.length) pool = running;
            }
            if (!pool.length) return null;
            const t = pool[Math.floor(Math.random() * pool.length)];
            return { train: t, trackId: t.trackId, index: t.currBlockIndex };
        }
        /* 当該列車が要らない障害は、列車が走っている線区のどこかで起こす。
           1回で決まらないことがある (線路の無いブロックに当たる等) ので、
           走っている列車を何本か試す。 */
        if (!running.length) return null;
        for (let tryN = 0; tryN < 12; tryN++) {
            const t = running[Math.floor(Math.random() * running.length)];
            const blks = this.game.trackMgr.blocks[t.trackId];
            if (!blks) continue;
            let idx = t.currBlockIndex + t.dir * (3 + Math.floor(Math.random() * 12));
            idx = Math.max(0, Math.min(blks.length - 1, idx));
            if (type.atStation) {
                // 近くの駅ブロックへ寄せる
                let found = -1;
                for (let k = 0; k < 8 && found < 0; k++) {
                    if (blks[idx + k] && blks[idx + k].isStation && blks[idx + k].x !== -1000) found = idx + k;
                    else if (blks[idx - k] && blks[idx - k].isStation && blks[idx - k].x !== -1000) found = idx - k;
                }
                if (found < 0) continue;
                idx = found;
            }
            if (blks[idx].x === -1000) continue;
            return { train: null, trackId: t.trackId, index: idx };
        }
        return null;
    }

    /** その場所の呼び名 */
    placeName(trackId, index) {
        const blks = this.game.trackMgr.blocks[trackId];
        if (!blks || !blks[index]) return "線区内";
        const at = (b) => b.hoppoStationName ||
            (b.stationIdx >= 0 && STATIONS[b.stationIdx] ? STATIONS[b.stationIdx].name : "");
        const here = at(blks[index]);
        if (here) return here + "駅";
        // 駅間なら、前後それぞれで最初に見つかった駅名をつなぐ
        let prev = "", next = "";
        for (let k = 1; k < 12 && !prev; k++) {
            const b0 = blks[index - k];
            if (b0 && b0.x !== -1000 && at(b0)) prev = at(b0);
        }
        for (let k = 1; k < 12 && !next; k++) {
            const b1 = blks[index + k];
            if (b1 && b1.x !== -1000 && at(b1)) next = at(b1);
        }
        if (prev && next) return prev + "〜" + next + "間";
        if (prev) return prev + "駅付近";
        if (next) return next + "駅付近";
        return "線区内";
    }

    /** 輸送障害を1件起こす */
    trigger(forcedTypeId) {
        const type = forcedTypeId
            ? (INCIDENT_TYPES.find(t => t.id === forcedTypeId) || pickIncidentType())
            : pickIncidentType();
        const loc = this.pickLocation(type);
        if (!loc) return null;

        const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
        const suspendSec = type.suspend ? Math.min(INCIDENT_MAX_BLOCK_SEC, rnd(type.suspend)) : 0;
        const holdSec = type.hold ? Math.min(INCIDENT_MAX_BLOCK_SEC, rnd(type.hold)) : 0;

        const inc = {
            id: "inc_" + (++INCIDENT_SEQ),
            type: type,
            trackId: loc.trackId,
            index: loc.index,
            train: loc.train,
            place: this.placeName(loc.trackId, loc.index),
            startedAt: this.game.currentTime,
            totalSec: Math.max(suspendSec, holdSec, 300),
            timer: Math.max(suspendSec, holdSec, 300),
            phase: -1,
            suspensions: [],
            faults: [],
            stage: "支障中",
            trainNo: loc.train ? loc.train.trainNo : ""
        };

        // --- 防護無線の発報 (全線一時停止。既存の仕組みをそのまま使う)
        if (type.radio) {
            this.game.isEmergency = true;
            this.game.radioTimer = 180;
            const el = (typeof document !== "undefined") ? document.getElementById("emg-control") : null;
            if (el) el.style.display = "block";
        }

        // --- 区間の運転見合わせ / 信号の障害
        if (type.block) {
            const tracks = (type.block.tracks === "same")
                ? [loc.trackId] : parallelTracks(loc.trackId);
            const r = type.block.radius;
            tracks.forEach(tid => {
                const blks = this.game.trackMgr.blocks[tid];
                if (!blks) return;
                const s = Math.max(0, loc.index - r);
                const e = Math.min(blks.length - 1, loc.index + r);
                if (s > e) return;
                if (type.fault) {
                    this.game.signals.addFault(tid, s, e, type.name);
                    inc.faults.push({ trackId: tid, start: s, end: e });
                } else {
                    const rec = { trackId: tid, start: s, end: e, owner: inc.id };
                    this.game.trackMgr.manualSuspensions.push(rec);
                    inc.suspensions.push(rec);
                }
            });
        }

        // --- 当該列車を止める
        if (loc.train) {
            const t = loc.train;
            t.minorTrouble = true;
            t.minorTroubleTimer = holdSec;
            t.isJudging = false;
            t.troubleInfo = {
                active: true, cause: type.cause, status: type.phases[0][1],
                timer: holdSec, location: inc.place, incidentId: inc.id
            };
            if (t.state === "running") t.state = "stopped";
        }

        this.active.push(inc);
        this.history.push({ at: this.game.currentTime, id: inc.id, name: type.name, place: inc.place,
                            family: type.family || type.id });
        // 輸送障害の記録 (js/32-records.js)。報告書の元になる
        if (this.game.records) this.game.records.incidentStarted(inc);
        this.syncEmergencyState();

        const msg = type.first(inc.place, inc.trainNo || "当該列車");
        this.game.ui.updateBanner(`🚨【${type.name}】${msg}`, "banner-red");
        return inc;
    }

    // ------------------------------------------------------------ 進行
    update() {
        const now = this.game.currentTime;

        // 新しい輸送障害の発生
        if (now >= this.nextAt && this.active.length < 2) {
            if (this.trigger()) {
                // 次は 50分〜3時間後
                this.nextAt = now + 3000 + Math.random() * 7800;
            } else {
                this.nextAt = now + 600;
            }
        }

        for (let i = this.active.length - 1; i >= 0; i--) {
            const inc = this.active[i];
            inc.timer -= CONFIG.TICK_SEC;

            // 直接支障の上限 (1時間)
            const elapsed = now - inc.startedAt;
            if (elapsed >= INCIDENT_MAX_BLOCK_SEC && inc.timer > 0) {
                inc.timer = 0;
                inc.forced = true;
            }

            if (inc.timer <= 0) {
                this.finish(inc, inc.forced ? "支障時間の上限により設備を復旧" : "復旧完了");
                this.active.splice(i, 1);
                this.syncEmergencyState();
                continue;
            }

            // 記録 (巻き込まれた列車・乗務員との交信)
            if (this.game.records) this.game.records.incidentTick(inc);

            // 段階の進行
            const ratio = 1 - (inc.timer / inc.totalSec);
            let ph = 0;
            for (let k = 0; k < inc.type.phases.length; k++) {
                if (ratio >= inc.type.phases[k][0]) ph = k;
            }
            if (ph !== inc.phase) {
                inc.phase = ph;
                inc.stage = inc.type.phases[ph][1];
                if (this.game.records) this.game.records.incidentPhase(inc, ph);
                const rem = Math.max(1, Math.ceil(inc.timer / 60));
                this.game.ui.updateBanner(
                    `🚧【${inc.type.name}】${inc.place} - ${inc.type.phases[ph][2]} (再開見込:約${rem}分)`,
                    "banner-red");
                if (inc.train && inc.train.troubleInfo && inc.train.troubleInfo.active) {
                    inc.train.troubleInfo.status = inc.stage;
                }
            }

            this.syncEmergencyState();

            // 当該列車の状態を保つ (指令が個別に解除するまで止め続ける)
            if (inc.train && inc.train.state !== "finished") {
                if (inc.train.minorTrouble) {
                    inc.train.minorTroubleTimer = Math.max(inc.train.minorTroubleTimer, inc.timer);
                    inc.train.troubleInfo.timer = inc.timer;
                }
            }
        }
    }

    /**
     * いちばん重い輸送障害を game.emergencyState に反映する。
     * 業務連絡 (js/19-ui-log.js) と抑止判定 (js/13-train-hold.js) が
     * この値を見ているので、互換のために保っている。
     */
    syncEmergencyState() {
        if (!this.active.length) {
            this.game.emergencyState = { type: "none", timer: 0 };
            return;
        }
        const main = this.active.slice().sort((a, b) => b.timer - a.timer)[0];
        this.game.emergencyState = {
            type: (main.type.id === "jinshin") ? "human" : "vehicle",
            timer: main.timer,
            location: main.place,
            incident: main.type.name
        };
    }

    // ------------------------------------------------------------ 復旧
    /**
     * 輸送障害を終える。
     * 見合わせを解いて徐行に置き換えるだけで、列車の位置や遅れには手を触れない。
     * そのため、積み上がった遅れはそのまま残り、しばらく波及し続ける。
     */
    finish(inc, reason, silent) {
        // 見合わせを解く
        inc.suspensions.forEach(rec => {
            const arr = this.game.trackMgr.manualSuspensions;
            const at = arr.indexOf(rec);
            if (at >= 0) arr.splice(at, 1);
        });
        // 信号の障害を解く
        if (inc.faults.length) {
            this.game.signals.clearFaults(f =>
                inc.faults.some(x => x.trackId === f.trackId && x.start === f.start && x.end === f.end));
        }
        // 復旧後の徐行を置く (瞬間移動させずに、ゆっくり流して回復させる)
        if (inc.type.slow) {
            const tracks = inc.type.block && inc.type.block.tracks === "same"
                ? [inc.trackId] : parallelTracks(inc.trackId);
            const r = (inc.type.block ? inc.type.block.radius : 2) + 1;
            tracks.forEach(tid => {
                const blks = this.game.trackMgr.blocks[tid];
                if (!blks) return;
                this.game.trackMgr.addSpeedRestriction(tid,
                    Math.max(0, inc.index - r), Math.min(blks.length - 1, inc.index + r),
                    inc.type.slow.factor, inc.type.name + "後の徐行",
                    this.game.currentTime + inc.type.slow.sec);
            });
        }

        // 当該列車の後始末
        if (inc.train && inc.train.state !== "finished" && inc.train.troubleInfo &&
            inc.train.troubleInfo.incidentId === inc.id) {
            const t = inc.train;
            t.minorTrouble = false;
            t.minorTroubleTimer = 0;
            t.isJudging = false;
            t.troubleInfo = { active: false, cause: "", status: "" };
            if (t.state === "stopped" || t.state === "holding") { t.state = "running"; t.timer = 15; }

            if (inc.type.after === "deadhead" && !["回送", "貨物"].includes(t.type)) {
                // 自力走行はできるが営業は打ち切り。最寄りの車両所へ回送する。
                const oldNo = t.trainNo;
                if (this.game.ops.convertToRecoveryDeadhead(t, inc.type.name) && this.game.records) {
                    this.game.records.incidentAction(inc.id,
                        `当該列車 ${oldNo} の営業を取りやめ、${t.trainNo}(回送) として ${t.dest} へ入区させる`, "指令");
                    const rec = this.game.records.incidents.find(r => r.id === inc.id);
                    if (rec) rec.deadheaded.push(oldNo + " → " + t.trainNo);
                }
            } else if (this.game.records) {
                this.game.records.incidentAction(inc.id, `当該列車 ${t.trainNo} の運転を再開`, "指令");
            }
        }
        if (this.game.records) this.game.records.incidentFinished(inc, reason, silent);

        if (!silent) {
            this.game.ui.updateBanner(
                `🟢【運転再開】${inc.place}の${inc.type.name}は${reason}。当該区間の運転を再開します。` +
                (inc.type.slow ? "（当分の間、現場付近は徐行運転となります）" : ""),
                "banner-orange");
        }
    }

    /** 画面表示用: いま起きている輸送障害の一覧 */
    list() {
        return this.active.map(inc => ({
            id: inc.id, name: inc.type.name, place: inc.place, stage: inc.stage,
            remain: Math.max(0, Math.ceil(inc.timer / 60)), trainNo: inc.trainNo
        }));
    }
}
