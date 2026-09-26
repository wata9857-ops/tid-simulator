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
        id: "jinshin", family: "jinshin", name: "人身事故", weight: 4, needTrain: true, radio: true,
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
        id: "kasen", family: "kasen", name: "架線障害", weight: 1.5, needTrain: false, radio: false,
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
        id: "kidokairo", family: "shingo", name: "軌道回路故障", weight: 1.5, needTrain: false, radio: false,
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
        id: "tentetsu", family: "tentetsu", name: "転てつ器故障", weight: 2.5, needTrain: false, radio: false,
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
        id: "shishobutsu", family: "shishobutsu", name: "線路支障", weight: 1.5, needTrain: false, radio: true,
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
        id: "syaryo", family: "syaryo", name: "車両故障", weight: 2.5, needTrain: true, radio: false,
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
        id: "brake", family: "syaryo", name: "ブレーキ装置故障", weight: 1.5, needTrain: true, radio: false,
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
        id: "door", family: "door", name: "ドア故障", weight: 3.5, needTrain: true, radio: false,
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
        id: "fumikiri", family: "fumikiri", name: "踏切障害", weight: 2.5, needTrain: true, radio: true,
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
        id: "kyubyonin", family: "kyubyonin", name: "急病人救護", weight: 4.5, needTrain: true, radio: false,
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
        id: "kikikosho", family: "kikikosho", name: "車内設備故障", weight: 1.5, needTrain: true, radio: false,
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
            t.state !== "finished" && t.state !== "in_depot" && t.currBlockIndex >= 0 &&
            !isFreightTerminalTrack(t.trackId));          // 貨物ターミナルの構内は本線の輸送障害の対象外
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
        // 大雨・大雪 (区間で起きる大規模な障害) は別の起こし方をする
        const major = forcedTypeId && MAJOR_INCIDENT_TYPES.find(t => t.id === forcedTypeId);
        if (major && this.game.recovery) return this.game.recovery.triggerMajor(major.area);
        const baseType = forcedTypeId
            ? (INCIDENT_TYPES.find(t => t.id === forcedTypeId) || pickIncidentType())
            : pickIncidentType();
        const loc = this.pickLocation(baseType);
        if (!loc) return null;
        /* 場面 (js/33-incident-scenarios.js)。種類が決まったあと、起きた場所と時刻に
           合う場面を選んで、原因・交信・時間・止める範囲を書き分ける。
           種類の抽選とは別なので、起きやすさの割合は変わらない。 */
        const scen = (typeof pickIncidentScenario === "function")
            ? pickIncidentScenario(baseType, incidentScenarioCtx(this.game, loc.trackId, loc.index)) : null;
        const type = (typeof applyIncidentScenario === "function") ? applyIncidentScenario(baseType, scen) : baseType;

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
            trainNo: loc.train ? loc.train.trainNo : "",
            scenario: type.scenario || "",
            /* 人身事故のうち重いものは、見合わせを解いたあと段階的に開通させる
               (現場付近の点検・車両の移動に時間がかかる)。 */
            staged: (type.family === "jinshin") && Math.random() < JINSHIN_STAGED_RATIO
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
        /* 長引く見合わせ (重い人身事故) は、まず区間の列車をすべて抑止する。
           見合わせを解いても、この抑止は指令が順次解除するまで残る (RecoveryControl)。 */
        if (inc.staged && this.game.recovery) this.game.recovery.onSuspend(inc);
        // 輸送障害の記録 (js/32-records.js)。報告書の元になる
        if (this.game.records) this.game.records.incidentStarted(inc);
        this.syncEmergencyState();

        const msg = type.first(inc.place, inc.trainNo || "当該列車");
        this.game.ui.updateBanner(`🚨【${type.name}${inc.scenario ? "・" + inc.scenario : ""}】${msg}`, "banner-red");
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

            // 直接支障の上限 (1時間。大雨・大雪は種類ごとの上限)
            const elapsed = now - inc.startedAt;
            if (elapsed >= (inc.type.maxBlockSec || INCIDENT_MAX_BLOCK_SEC) && inc.timer > 0) {
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

        /* ★段階的な運転再開。大雨・大雪・重い人身事故は、見合わせを解いても
           区間ごとの点検が終わるまで抑止を残し、1区間ずつ開通させる。 */
        if (!silent && this.game.recovery && (inc.type.recovery || inc.staged)) {
            const plan = this.game.recovery.startPlan(inc, inc.type.recovery || JINSHIN_RECOVERY);
            if (plan) return;
        }
        // 計画にしなかった (指令の全解除など) ときは、見合わせ中に掛けた抑止を残さない
        this.game.trains.forEach(t => {
            if (t.recoveryHold !== "inc:" + inc.id) return;
            t.recoveryHold = null;
            t.isManuallySuspended = false;
            if (t.state === "holding") { t.state = "running"; t.timer = 15; }
        });

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
            id: inc.id, name: inc.type.name, scenario: inc.scenario || "", place: inc.place, stage: inc.stage,
            remain: Math.max(0, Math.ceil(inc.timer / 60)), trainNo: inc.trainNo
        }));
    }
}


/* ==================================================================
   大規模な輸送障害と、段階的な運転再開 (利用者の指摘 5)

   ■ 何を足したか
     大雨・大雪・人身事故のような大きな障害のあとは、運転見合わせを
     「解除」しても、区間の列車がいっせいに走り出すわけではない。実際には
       ・見合わせが長引くと分かった時点で、区間の中の列車をすべて抑止し、
       ・点検が済んだら運転見合わせを正式に解除 (運転再開) するが、
       ・区間の列車は1本ずつの抑止として残り、指令が乗務員に通告しながら
         1本ずつ・何本かずつ順に発車させ、
       ・しばらくすると応援の指令員が引き継いで、残りを間隔をあけて出していく
     という形で平常に戻していく。

   ■ ここでの扱い (★2026-09 に作り直し)
     以前は区間を駅間ごとに「開通待ち」として残し、確認列車を1本ずつ
     「1本進める」で通す形だった。列車が多いと同じ操作を何十回も繰り返すことになり、
     実際の指令の仕事とも違っていたのでやめた。
     1. 見合わせが始まったとき (trigger / triggerArea → onSuspend)、
        区間の中の列車をすべて抑止する (Train.recoveryHold)。
     2. 見合わせを解くとき (IncidentSystem.finish → startPlan)、区間と、その手前に
        詰まっている列車を「抑止中の列車」として計画にまとめる。線路の見合わせは解く。
     3. 運転再開の手配 (乗務員への通告・車両の点検, prepSec) のあいだは誰も発車させない。
     4. そのあと Super-TID の指令員が「先頭を1本ずつ」「3本ずつ」「全列車」「線路ごと」で解除する。
        指令卓の「抑止解除」「強制発車」で1本ずつ解いてもよい。
     5. 画面の指令員が一定時間 (RECOVERY_RULES.idleSec) 操作しないか、
        解除から一定時間 (handoverSec) 経ったら、応援の指令員が引き継ぐ。
        旅客向け画面だけのときは、手配が済みしだい当務の指令員が受け持つ。
        引き継いだ指令員は、線路ごとに先頭の列車を間隔 (gapSec) をあけて発車させる
        (列が長いときは2本ずつの続行)。先に出した列車が駅間で止まっていれば待つ。
     6. 抑止中の列車がいなくなったら平常に戻る (徐行は残る)。
        どんな場合でも limitSec で残りをまとめて解除するので、取り残しは出ない。

   ★起きやすさ: 大雨・大雪はまれにしか起きない (1日あたり CONFIG.majorIncidentChance)。
     ふだんの輸送障害の種類と割合 (INCIDENT_TYPES) には手を触れていないので、
     tools/check_incident_mix.js の割合はそのまま。
     Super-TID の「大規模障害 (訓練)」から、いつでも起こせる。
   ================================================================== */

CONFIG.majorIncidentChance = 0.10;     // 1日あたり、大雨・大雪が起きる割合

/* 大規模な障害の起きる区間。雨・雪の起きやすい線区から選ぶ。 */
const MAJOR_AREAS = {
    rain: [
        { line: "JR宝塚線", tracks: ["Fukuchi_Up", "Fukuchi_Down"], from: "宝塚", to: "新三田" },
        { line: "湖西線", tracks: ["Kosei_Up", "Kosei_Down"], from: "堅田", to: "近江今津" },
        { line: "学研都市線", tracks: ["Tozai_Up", "Tozai_Down"], from: "長尾", to: "木津" },
        { line: "山陽本線", tracks: ["Up_Out", "Down_Out"], from: "網干", to: "上郡" }
    ],
    snow: [
        { line: "北陸本線", tracks: ["Up_Out", "Down_Out"], from: "米原", to: "近江塩津" },
        { line: "琵琶湖線", tracks: ["Up_Out", "Down_Out"], from: "能登川", to: "米原" },
        { line: "湖西線", tracks: ["Kosei_Up", "Kosei_Down"], from: "近江舞子", to: "永原" }
    ]
};

/* 大規模な障害の種類。IncidentSystem の種類と同じ形 (報告書もそのまま作れる)。
     area        … MAJOR_AREAS のどれで起きるか
     maxBlockSec … 見合わせの上限 (ふつうの障害の1時間より長い)
     recovery    … 段階的な運転再開 { prepSec:[運転再開の手配の秒数], gapSec:[自動で解除する間隔], slow:{sec,factor} } */
const MAJOR_INCIDENT_TYPES = [
    {
        id: "heavy_rain", family: "major", name: "大雨 (雨量計の規制値超過)", weight: 0,
        area: "rain", needTrain: false, radio: false,
        cat: "外部要因", depts: ["保線区", "施設指令", "駅"],
        suspend: [3000, 4800], maxBlockSec: 5400,
        slow: { sec: 1800, factor: 1.6 },
        after: null, cause: "大雨",
        causeText: "沿線の雨量計が運転規制値 (時雨量・連続雨量) を超過。規制値を下回ったあと、" +
                   "保線区が区間ごとに徒歩・軌道モーターカーで巡回し、のり面・線路の異常の有無を確認する。",
        first: (loc) => `${loc}で雨量計が運転規制値を超えました。当該区間は上下線とも運転を見合わせます。`,
        crew: [
            [0.00, "施設指令", "{loc}の雨量計が規制値を超過しました。運転規制を発令します。"],
            [0.00, "指令", "了解。規制区間に列車を進入させない。区間内の列車は最寄り駅で抑止。"],
            [0.60, "施設指令", "雨量が規制値を下回りつつあります。解除後は区間ごとに巡回点検を行います。"],
            [0.95, "保線区", "巡回の班を各駅に配置しました。点検の終わった区間から順に報告します。"]
        ],
        phases: [
            [0.00, "運転規制中", "雨量計が規制値を超えています。上下線とも運転を見合わせています。"],
            [0.50, "雨量の推移を監視", "雨は弱まりつつありますが、規制値を下回るまで見合わせを続けます。"],
            [0.85, "規制解除の準備", "規制解除後に巡回点検を行うため、保線区が出動しています。"]
        ],
        recovery: { prepSec: [240, 420], gapSec: [120, 210], slow: { sec: 1800, factor: 1.6 } }
    },
    {
        id: "heavy_snow", family: "major", name: "大雪 (着雪・分岐器の不転換)", weight: 0,
        area: "snow", needTrain: false, radio: false,
        cat: "外部要因", depts: ["保線区", "信号通信区", "電力区", "駅"],
        suspend: [3000, 5400], maxBlockSec: 5400,
        slow: { sec: 2400, factor: 1.8 },
        after: null, cause: "大雪",
        causeText: "降雪により分岐器に着雪し不転換が多発、架線への着雪も発生。" +
                   "除雪・融雪器の点検と、区間ごとの確認列車による線路状態の確認が必要。",
        first: (loc) => `${loc}で大雪のため分岐器の不転換が相次いでいます。当該区間は運転を見合わせます。`,
        crew: [
            [0.00, "信号通信区", "{loc}構内の分岐器が着雪で不転換です。融雪器は作動中ですが追いつきません。"],
            [0.00, "指令", "了解。当該区間は運転見合わせ。除雪の要員を手配してください。"],
            [0.55, "保線区", "駅構内の分岐器から除雪を進めています。駅間は確認列車で線路状態を見る必要があります。"],
            [0.95, "保線区", "除雪の終わった区間から順に報告します。確認列車は注意運転でお願いします。"]
        ],
        phases: [
            [0.00, "除雪作業中", "分岐器の除雪と融雪器の点検を行っています。"],
            [0.45, "除雪作業中 (継続)", "降雪が続いており、除雪を繰り返しています。"],
            [0.85, "運転再開の準備", "主な分岐器の除雪が終わりました。区間ごとの確認に移ります。"]
        ],
        recovery: { prepSec: [300, 540], gapSec: [150, 240], slow: { sec: 2400, factor: 1.8 } }
    }
];

/* 人身事故の重いもの (現場付近の点検・車両の移動に時間がかかる)。
   人身事故のうちこの割合が、見合わせ解除後に段階的な運転再開になる。 */
const JINSHIN_STAGED_RATIO = 0.35;
const JINSHIN_RECOVERY = { prepSec: [120, 300], gapSec: [90, 150], slow: { sec: 900, factor: 1.5 } };

/* 段階的な運転再開の時間の決まり (ゲーム内の秒)。
     idleSec     … 画面の指令員が解除の操作をしないまま、この時間が経つと
                   別の指令員 (応援) が引き継いで自動で解除していく
     handoverSec … 見合わせの解除からこの時間が経ったら、操作の有無にかかわらず
                   別の指令員に引き継ぐ (当務の指令員は次の障害・連絡の対応に戻る)
     limitSec    … 見合わせの解除からこの時間が経っても抑止が残っていたら、
                   残りをまとめて解除する (取り残しを作らない最後の保険)
     margin      … 区間の外側で、区間の手前に詰まっている列車もこの閉塞の数だけ抑止に含める */
const RECOVERY_RULES = { idleSec: 480, handoverSec: 1500, limitSec: 5400, margin: UNITS_PER_STATION };

class RecoveryControl {
    constructor(game) {
        this.game = game;
        this.plans = [];
        this.seq = 0;
        /* 指令員が画面から操作しているか。Super-TID を開くと true になる
           (js/42-tid-ui.js)。false のときは当務の指令員が自動で解除していく。 */
        this.manual = false;
        this.scheduleMajor(game.currentTime);
    }

    /** 次の大規模障害の時刻を決める (その日に起きないこともある) */
    scheduleMajor(now) {
        const day = Math.floor(now / 86400);
        this.majorDay = day;
        if (Math.random() < (CONFIG.majorIncidentChance || 0)) {
            this.majorAt = day * 86400 + (7.0 + Math.random() * 10.0) * 3600;
        } else {
            this.majorAt = Infinity;
        }
    }

    /** 大規模な障害を起こす (kind = "rain" / "snow")。起こせたら障害を返す */
    triggerMajor(kind) {
        const type = MAJOR_INCIDENT_TYPES.find(t => t.area === kind) || MAJOR_INCIDENT_TYPES[0];
        const areas = MAJOR_AREAS[type.area] || [];
        if (!areas.length) return null;
        const area = areas[Math.floor(Math.random() * areas.length)];
        return this.game.incidents.triggerArea(type, area);
    }

    // ------------------------------------------------------------ 区間
    /** 人身事故のように場所で起きた障害の、前後の区間 (駅2つずつ) */
    areaAround(inc) {
        const blks = this.game.trackMgr.blocks[inc.trackId];
        if (!blks) return null;
        const stationsNear = (dir) => {
            const out = [];
            for (let i = inc.index; i >= 0 && i < blks.length && out.length < 2; i += dir) {
                const b = blks[i];
                if (!b || b.x === -1000) break;
                if (isRealStationBlock(b)) out.push(blockStationName(b));
            }
            return out;
        };
        const back = stationsNear(-1), fwd = stationsNear(1);
        const from = back[back.length - 1] || back[0], to = fwd[fwd.length - 1] || fwd[0];
        if (!from || !to || from === to) return null;
        return { line: recLineName(inc.trackId, blks[inc.index].stationIdx),
                 tracks: parallelTracks(inc.trackId), from: from, to: to };
    }

    /** 区間の両端のブロック番号 [lo, hi] (区間の両端の駅を含む) */
    areaRange(area) {
        for (const tid of area.tracks) {
            const blks = this.game.trackMgr.blocks[tid];
            if (!blks) continue;
            const a = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === area.from);
            const z = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === area.to);
            if (a && z) return [Math.min(a.index, z.index), Math.max(a.index, z.index)];
        }
        return null;
    }

    /** 区間の中 (と、区間の手前に詰まっている所) にいる列車 */
    trainsInArea(area, range, margin) {
        const m = margin || 0;
        return this.game.trains.filter(t => {
            if (t.state === "finished" || t.state === "in_depot" || t.currBlockIndex < 0) return false;
            if (area.tracks.indexOf(t.trackId) < 0) return false;
            const i = t.currBlockIndex;
            if (i >= range[0] && i <= range[1]) return true;
            // 区間の外は、区間へ向かって走ってくる側の手前だけ
            if (t.dir === 1) return i < range[0] && i >= range[0] - m;
            return i > range[1] && i <= range[1] + m;
        });
    }

    /** 列車を段階的な運転再開の抑止に入れる */
    holdTrain(t, planId) {
        if (t.recoveryHold === planId) return false;
        t.recoveryHold = planId;
        t.isManuallySuspended = true;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = true;     // 20分経過の乗務員連絡は、この抑止では出さない (指令が把握している)
        if (t.state === "running") { t.state = "stopped"; t.timer = 15; }
        return true;
    }

    /**
     * 長引く見合わせが始まったとき (大雨・大雪・重い人身事故)。
     * まず区間の中の列車をすべて抑止する。見合わせを解いても、この抑止は残る。
     */
    onSuspend(inc) {
        const area = inc.area || this.areaAround(inc);
        if (!area) return;
        inc.area = area;
        const range = this.areaRange(area);
        if (!range) return;
        const tag = "inc:" + inc.id;
        let n = 0;
        this.trainsInArea(area, range, 0).forEach(t => {
            if (t.recoveryHold) return;
            if (this.holdTrain(t, tag)) n++;
        });
        inc.recoveryHeld = n;
        if (this.game.records && n) {
            this.game.records.incidentAction(inc.id,
                `区間内の列車 ${n}本 を抑止 (見合わせの解除後も、指令が順次解除するまで抑止を続ける)`, "指令");
        }
    }

    // ------------------------------------------------------------ 計画
    /**
     * 見合わせを解くときに、段階的な運転再開の計画を作る。
     * 見合わせは正式に解除する。区間の列車は1本ずつの抑止として残り、
     * 指令が1本ずつ・何本かずつ解除していく。
     */
    startPlan(inc, spec) {
        const g = this.game;
        const area = inc.area || this.areaAround(inc);
        const tag = "inc:" + inc.id;
        const range = area ? this.areaRange(area) : null;
        if (!area || !range) {
            // 区間が決められない (念のため): 見合わせ中に掛けた抑止を残さない
            g.trains.forEach(t => { if (t.recoveryHold === tag) { t.recoveryHold = null; t.isManuallySuspended = false; } });
            return null;
        }
        const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
        const plan = {
            id: "rcv_" + (++this.seq), incId: inc.id, name: inc.type.name,
            line: area.line || "", place: inc.place, area: area, range: range,
            from: area.from, to: area.to,
            startedAt: g.currentTime, spec: spec,
            prepUntil: g.currentTime + rnd(spec.prepSec || [180, 360]),
            lastManualAt: null,
            mode: "prep",             // prep (運転再開の手配) → manual (画面の指令員) / auto (別の指令員が自動で)
            by: "",
            held: [],                 // 抑止中の列車ID
            released: 0, manualReleased: 0, autoReleased: 0,
            streams: {}               // 線路ごとの次の自動解除の時刻
        };
        // 見合わせ中から抑止していた列車と、いま区間 (と手前) にいる列車
        g.trains.forEach(t => { if (t.recoveryHold === tag) { t.recoveryHold = plan.id; plan.held.push(t.id); } });
        this.trainsInArea(area, range, RECOVERY_RULES.margin).forEach(t => {
            if (t.recoveryHold) return;                   // この計画 (済み) か、ほかの計画の抑止
            if (this.holdTrain(t, plan.id)) plan.held.push(t.id);
        });
        if (!plan.held.length) return null;

        // 区間の徐行 (解除した列車が順に通る)
        area.tracks.forEach(tid => {
            const blks = g.trackMgr.blocks[tid];
            if (!blks || !blks[range[0]]) return;
            g.trackMgr.addSpeedRestriction(tid, range[0], range[1], spec.slow.factor,
                plan.name + "後の徐行", g.currentTime + spec.slow.sec + 1800);
        });
        this.plans.push(plan);
        const mins = Math.max(1, Math.round((plan.prepUntil - g.currentTime) / 60));
        g.ui.updateBanner(
            `🟠【運転再開・抑止継続】${inc.place}の${inc.type.name}は運転見合わせを解除しました。` +
            `${area.line} ${area.from}〜${area.to} の列車 ${plan.held.length}本 は抑止を続け、` +
            `約${mins}分後から指令が順次発車させます。`, "banner-red");
        this.note(plan, "運転再開",
            `運転見合わせを解除。${area.line} ${area.from}〜${area.to} の列車 ${plan.held.length}本 は個別の抑止を継続し、` +
            `乗務員への通告・車両の点検が済みしだい、指令が順次解除する。`);
        return plan;
    }

    /** 計画の中の列車を、線路ごとに「前にいる順」に並べる */
    streamsOf(plan) {
        const g = this.game;
        const out = {};
        plan.held.forEach(id => {
            const t = g.getTrain(id);
            if (!t) return;
            const key = t.trackId + "|" + t.dir;
            (out[key] = out[key] || []).push(t);
        });
        Object.keys(out).forEach(k => out[k].sort((a, b) => (b.currBlockIndex - a.currBlockIndex) * a.dir));
        return out;
    }

    /** 抑止を解く */
    releaseTrain(plan, t, by) {
        const at = plan.held.indexOf(t.id);
        if (at >= 0) plan.held.splice(at, 1);
        if (t.recoveryHold !== plan.id) return false;
        t.recoveryHold = null;
        t.recoveryReleased = plan.id;        // この計画で解除した列車は、発車前でも抑止に戻さない
        t.isManuallySuspended = false;
        t.manualSuspendTimer = 0;
        t.hasNotifiedSuspendLong = false;
        if (t.state === "holding") { t.state = "running"; t.timer = 15; }
        plan.released++;
        if (by === "auto") plan.autoReleased++; else plan.manualReleased++;
        return true;
    }

    /**
     * 画面の指令員の操作。
     *   count  … 線路ごとに先頭から何本解除するか (Infinity で全部)
     *   stream … 特定の線路だけ (省略で全線路)
     */
    releaseNext(plan, count, stream, by) {
        const g = this.game;
        const streams = this.streamsOf(plan);
        let n = 0;
        const names = [];
        Object.keys(streams).forEach(k => {
            if (stream && k !== stream) return;
            streams[k].slice(0, count).forEach(t => {
                if (this.releaseTrain(plan, t, "manual")) { n++; if (names.length < 4) names.push(t.trainNo); }
            });
        });
        if (!n) return 0;
        plan.lastManualAt = g.currentTime;
        if (plan.mode === "prep") plan.mode = "manual";
        const who = by || "指令";
        g.ui.updateBanner(`【指令】${plan.from}〜${plan.to} の抑止を解除: ${names.join("・")}` +
            (n > names.length ? ` ほか計${n}本` : "") + ` (${who})`, "banner-orange");
        this.note(plan, "抑止解除", `${names.join("・")}${n > names.length ? " ほか" : ""} 計${n}本 の抑止を解除 (${who})`, who);
        return n;
    }

    /** 「全列車」: 残りをすべて解除して、段階的な運転再開を終える */
    releaseAll(plan, by) {
        const n = this.releaseNext(plan, Infinity, null, by);
        const at = this.plans.indexOf(plan);
        if (at >= 0) {
            this.finishPlan(plan, `指令が残り${n}本の抑止をまとめて解除`);
            this.plans.splice(at, 1);
        }
        return n;
    }

    /** 別の指令員に引き継ぐ (以後は自動で順次解除) */
    handover(plan, reason) {
        if (plan.mode === "auto" || plan.mode === "done") return;
        plan.mode = "auto";
        plan.by = this.manual ? "応援の指令員" : "当務の指令員";
        plan.handedAt = this.game.currentTime;
        const rest = plan.held.length;
        this.game.ui.updateBanner(
            `【指令】${plan.from}〜${plan.to} の抑止の解除は ${plan.by} が引き継ぎました (${reason})。` +
            `残り ${rest}本 を間隔をあけて順次発車させます。`, "banner-blue");
        this.note(plan, "引き継ぎ", `${plan.by} が引き継ぎ (${reason})。残り ${rest}本 を順次解除`, plan.by + " (代行)");
    }

    /** 自動の解除 (別の指令員)。線路ごとに先頭の列車を、間隔をあけて発車させる */
    autoRelease(plan) {
        const g = this.game;
        const now = g.currentTime;
        const gap = plan.spec.gapSec || [120, 200];
        const streams = this.streamsOf(plan);
        Object.keys(streams).forEach(k => {
            const list = streams[k];
            if (!list.length) return;
            const next = plan.streams[k] || 0;
            if (now < next) return;
            /* 先に出した列車がすぐ先の駅間で止まっているうちは出さない
               (解除した列車を追いかけさせて、またすぐ止めることになる) */
            const lead = list[0];
            if (this.blockedAhead(lead)) { plan.streams[k] = now + 30; return; }
            // 長い列は2本ずつ (続行運転)。出したら次は間隔をあける
            const group = list.length >= 6 ? 2 : 1;
            const out = list.slice(0, group).filter(t => this.releaseTrain(plan, t, "auto"));
            plan.streams[k] = now + gap[0] + Math.random() * (gap[1] - gap[0]);
            if (out.length) this.note(plan, "抑止解除",
                out.map(t => t.trainNo).join("・") + ` の抑止を解除 (${plan.by || "当務の指令員"})`);
        });
    }

    /** その列車のすぐ先の駅間が、先に解除した列車でふさがっているか */
    blockedAhead(t) {
        const blks = this.game.trackMgr.blocks[t.trackId];
        if (!blks) return false;
        for (let k = 1; k <= 2; k++) {
            const b = blks[t.currBlockIndex + t.dir * k];
            if (!b || b.x === -1000) return false;
            if (isRealStationBlock(b)) return false;
            if (b.lanes.some(l => l && l !== t && l.dir === t.dir && !l.recoveryHold &&
                                  (l.state === "holding" || l.state === "stopped"))) return true;
        }
        return false;
    }

    /** 毎Tick */
    update() {
        const g = this.game;
        const now = g.currentTime;
        // 日が替わったら、その日の大規模障害を決め直す
        if (Math.floor(now / 86400) !== this.majorDay) this.scheduleMajor(now);
        if (now >= this.majorAt && g.incidents.active.length < 2) {
            this.majorAt = Infinity;
            this.triggerMajor(Math.random() < 0.55 ? "rain" : "snow");
        }

        for (let pi = this.plans.length - 1; pi >= 0; pi--) {
            const plan = this.plans[pi];
            // 抑止の外れた列車 (消えた・指令が個別に解除した) を外す
            plan.held = plan.held.filter(id => {
                const t = g.getTrain(id);
                if (!t || t.state === "finished" || t.state === "in_depot") {
                    if (t && t.recoveryHold === plan.id) t.recoveryHold = null;
                    return false;
                }
                if (t.recoveryHold !== plan.id) return false;
                if (!t.isManuallySuspended) {
                    // 指令卓の「抑止解除」「強制発車」で個別に解いた
                    t.recoveryHold = null;
                    t.recoveryReleased = plan.id;
                    plan.released++; plan.manualReleased++;
                    plan.lastManualAt = now;
                    if (plan.mode === "prep") plan.mode = "manual";
                    return false;
                }
                return true;
            });

            /* 区間の中の駅から新たに発車しようとする列車も、順番が来るまで待たせる。
               ただし解除から30分まで (終着駅で折り返してくる列車を足し続けて、
               いつまでも平常に戻らない、ということにしない)。 */
            if (now - plan.startedAt < 1800) this.trainsInArea(plan.area, plan.range, 0).forEach(t => {
                if (t.recoveryHold || t.hasDeparted || t.state !== "waiting_start") return;
                if (t.recoveryReleased === plan.id) return;   // 指令が解除した列車 (発車前) は抑止に戻さない
                if (this.holdTrain(t, plan.id)) plan.held.push(t.id);
            });

            if (!plan.held.length) { this.finishPlan(plan, "全列車の抑止を解除"); this.plans.splice(pi, 1); continue; }

            // 取り残しを作らない最後の保険
            if (now - plan.startedAt >= RECOVERY_RULES.limitSec) {
                const n = plan.held.length;
                plan.held.slice().forEach(id => { const t = g.getTrain(id); if (t) this.releaseTrain(plan, t, "auto"); });
                plan.held = [];
                this.note(plan, "抑止解除", `解除から${Math.round(RECOVERY_RULES.limitSec / 60)}分を経過したため、残り${n}本の抑止をまとめて解除`);
                this.finishPlan(plan, "残りの抑止をまとめて解除");
                this.plans.splice(pi, 1);
                continue;
            }

            // 運転再開の手配 (乗務員への通告・車両の点検) が終わった
            if (plan.mode === "prep" && now >= plan.prepUntil) {
                if (this.manual) {
                    plan.mode = "manual";
                    g.ui.updateBanner(
                        `【指令】${plan.from}〜${plan.to} の運転再開の手配が済みました。抑止中の ${plan.held.length}本 を` +
                        `順次発車させてください (操作が無いときは応援の指令員が引き継ぎます)。`, "banner-blue");
                    this.note(plan, "手配完了", "乗務員への通告・車両の点検が完了。指令が順次解除できる状態");
                } else {
                    this.handover(plan, "当務の指令員が担当");
                }
            }
            // 画面の指令員が操作しない・時間が経った → 別の指令員が引き継ぐ
            if (plan.mode === "manual") {
                const idleFrom = Math.max(plan.prepUntil, plan.lastManualAt || 0);
                if (!this.manual) this.handover(plan, "画面の指令員が不在");
                else if (now - idleFrom >= RECOVERY_RULES.idleSec) this.handover(plan, `${Math.round(RECOVERY_RULES.idleSec / 60)}分間 解除の操作が無かったため`);
                else if (now - plan.startedAt >= RECOVERY_RULES.handoverSec) this.handover(plan, "当務の指令員がほかの対応へ移るため");
            }
            if (plan.mode === "auto") this.autoRelease(plan);
        }
    }

    /** 計画を終える */
    finishPlan(plan, reason) {
        const g = this.game;
        plan.doneAt = g.currentTime;
        plan.mode = "done";
        const min = Math.round((g.currentTime - plan.startedAt) / 60);
        g.ui.updateBanner(
            `🟢【平常運転へ】${plan.place}の${plan.name}に伴う抑止をすべて解除しました ` +
            `(${plan.released}本・${min}分)。当分の間は徐行運転です。`, "banner-orange");
        this.note(plan, "全列車解除", `${reason} (計${plan.released}本 / 指令卓の操作 ${plan.manualReleased}本 / 代行 ${plan.autoReleased}本 / ${min}分)`);
    }

    /** 指令の全解除 (防護無線・見合わせをすべて解いたとき) */
    clearAll() {
        this.plans.forEach(p => p.held.slice().forEach(id => { const t = this.game.getTrain(id); if (t) this.releaseTrain(p, t, "manual"); }));
        this.plans = [];
        this.game.trains.forEach(t => { if (t.recoveryHold) t.recoveryHold = null; });
    }

    /** 以前の「区間ごとの開通・確認列車」は使わない。呼ばれても何もしない */
    tryGrant() { return false; }

    /** 記録簿に残す */
    note(plan, kind, text, by) {
        const rec = this.game.records && this.game.records.incidents.find(r => r.id === plan.incId);
        if (!rec) return;
        rec.timeline.push({ at: this.game.currentTime, kind: kind, text: text });
        if (by) rec.actions.push({ at: this.game.currentTime, by: by.indexOf("代行") >= 0 ? "代行" : "指令", text: text });
        rec.status = (kind === "全列車解除") ? "運転再開 (徐行中)" : "運転再開・抑止を順次解除中";
    }

    /** 画面表示用 */
    list() {
        const g = this.game;
        const now = g.currentTime;
        return this.plans.map(p => {
            const streams = this.streamsOf(p);
            const idleFrom = Math.max(p.prepUntil, p.lastManualAt || 0);
            return {
                id: p.id, name: p.name, place: p.place, line: p.line, from: p.from, to: p.to,
                minutes: Math.round((now - p.startedAt) / 60),
                mode: p.mode, by: p.by || "",
                prepIn: p.mode === "prep" ? Math.max(0, Math.ceil((p.prepUntil - now) / 60)) : null,
                // 別の指令員に引き継ぐまでの残り (画面の指令員が受け持っているとき)
                handoverIn: p.mode === "manual" ? Math.max(0, Math.ceil(Math.min(
                    RECOVERY_RULES.idleSec - (now - idleFrom),
                    RECOVERY_RULES.handoverSec - (now - p.startedAt)) / 60)) : null,
                held: p.held.length, released: p.released,
                streams: Object.keys(streams).map(k => ({
                    key: k, label: recTrackName(k.split("|")[0]),
                    count: streams[k].length,
                    head: streams[k][0] ? streams[k][0].trainNo : "",
                    headAt: streams[k][0] ? commWhere(g, streams[k][0]) : "",
                    trains: streams[k].slice(0, 8).map(t => t.trainNo)
                }))
            };
        });
    }
}

/* ------------------------------------------------------------------ 輸送障害の側の追加 */

/** 区間で起きる大規模な障害を1件起こす (大雨・大雪) */
IncidentSystem.prototype.triggerArea = function (type, area) {
    const g = this.game;
    const tid0 = area.tracks[0];
    const blks = g.trackMgr.blocks[tid0];
    if (!blks) return null;
    const a = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === area.from);
    const z = blks.find(b => b.x !== -1000 && isRealStationBlock(b) && blockStationName(b) === area.to);
    if (!a || !z) return null;
    const lo = Math.min(a.index, z.index), hi = Math.max(a.index, z.index);
    const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
    const suspendSec = Math.min(type.maxBlockSec || INCIDENT_MAX_BLOCK_SEC, rnd(type.suspend));
    const mid = Math.round((lo + hi) / 2);
    const inc = {
        id: "inc_" + (++INCIDENT_SEQ), type: type, trackId: tid0, index: mid, train: null,
        place: `${area.line} ${area.from}〜${area.to}間`, area: area,
        startedAt: g.currentTime, totalSec: suspendSec, timer: suspendSec,
        phase: -1, suspensions: [], faults: [], stage: "支障中", trainNo: "", staged: true
    };
    area.tracks.forEach(tid => {
        const rec = { trackId: tid, start: lo, end: hi, owner: inc.id };
        g.trackMgr.manualSuspensions.push(rec);
        inc.suspensions.push(rec);
    });
    this.active.push(inc);
    this.history.push({ at: g.currentTime, id: inc.id, name: type.name, place: inc.place, family: "major", major: true });
    if (g.records) g.records.incidentStarted(inc);
    // 区間の列車をすべて抑止する (見合わせを解いても、指令が順次解除するまで残る)
    if (g.recovery) g.recovery.onSuspend(inc);
    this.syncEmergencyState();
    g.ui.updateBanner(`🚨【${type.name}】${type.first(inc.place)}`, "banner-red");
    return inc;
};
