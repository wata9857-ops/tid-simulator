/* このファイルは index.html から分割されたものです。
   Spawner 本体 (コンストラクタ) と編成割当の入口 */
/**
 * ==================================================
 * 3. Spawner (生成管理)
 * ==================================================
 */
class Spawner {
    constructor(game) {
        this.game = game;
        this.lastDay = 0;
        this.nextSpawnTime = { "Up":{}, "Down":{} };
        this.trainCounters = { "普通":1, "快速":1, "新快速":1, "特急":1, "貨物":1, "回送":1, "臨時":1 };
        this.tokkyuCounters = { "Sはくと": {up:1, down:2}, "はまかぜ": {up:1, down:2}, "こうのとり": {up:1, down:2}, "サンダーバード": {up:1, down:2}, "はるか": {up:1, down:2} };
        this.activeTrainNos = new Set();
        this.spawnedExtras = new Set();
        this.lastRapidStart = { "Up": "", "Down": "" };

        // ★追加: 敦賀・近江塩津発着新快速の湖西線/琵琶湖線 交互生成フラグ
        this.nextKoseiRouteUp = true;
        this.nextKoseiRouteDown = true;

        // 固有タイマー
        this.kobeStartersSpawned = 0; this.nextKobeSpawn = 4.5 * 3600 + 300;
        this.amagasakiStartersSpawned = 0; this.nextAmagasakiDownSpawn = 4.5 * 3600 + 300;
        this.amagasakiUpStartersSpawned = 0; this.nextAmagasakiUpSpawn = 4.5 * 3600 + 300;
        this.sannomiyaUpStartersSpawned = 0; this.nextSannomiyaUpSpawn = 4.5 * 3600 + 900;
        this.nextNishiAkashiSpawn = 4.5 * 3600 + 100;
        this.nextMukoHamakazeTime = 4.5 * 3600 + 1800;
        this.nextMukoKounotoriTime = 4.5 * 3600 + 3600;

        this.earlyKyotoUpSpawned = 0; this.nextEarlyKyotoUpSpawn = 4.0 * 3600 + 600;    // 4:10開始
        this.earlyTakatsukiUpSpawned = 0;
        this.nextEarlyTakatsukiUpSpawn = 4.0 * 3600 + 1200; // 4:20開始

        this.nextMaibaraExtendTime = 4.0 * 3600; // ★追加: 米原発の近江塩津・敦賀延長タイマー

        // ★追加: 湖西線普通列車の独立生成用タイマー
        this.nextKoseiLocalUp = 4.0 * 3600 + Math.random() * 300;
        this.nextKoseiLocalDown = 4.0 * 3600 + Math.random() * 300;

        // ★修正: assignVehicles内に紛れ込んでいたコードをここへ移動
        this.nextFukuchiUp = 4.0 * 3600 + Math.random() * 300;
        this.nextFukuchiDown = 4.0 * 3600 + Math.random() * 300; // 追加: 福知山線下り(宝塚方面)
        this.nextTozaiDown = 4.0 * 3600 + Math.random() * 300;
        this.nextTozaiUp = 4.0 * 3600 + Math.random() * 300;     // 追加: 東西線上り(京橋方面)

        this.nextFukuchiLocalDest = "新三田"; // 宝塚方面普通列車の交互行き先用
        this.nextTozaiRapidDest = "新三田";   // 東西線発快速(日中)の交互行き先用

        ["Up", "Down"].forEach(d => { for(let t in INTERVALS) this.nextSpawnTime[d][t] = 4.0 * 3600 + Math.random()*300; });
    }
}

/**
 * 編成(Vehicle)の割り当て。実際の選定規則は FleetManager (js/06-fleet.js) が持つ。
 * 呼び出し側の互換のため、引数と戻り値は従来どおり。
 */
Spawner.prototype.assignVehicles = function (startName, type, trackId, dest, trainNo = "") {
    return this.game.fleet.assign(startName, type, trackId, dest, trainNo);
};

/** 編成を留置場へ返す。列車の消滅・入区・折り返しのときに呼ぶ。 */
Spawner.prototype.releaseVehicles = function (nearName, vehicles) {
    this.game.fleet.release(nearName, vehicles);
};

Spawner.prototype.update = function (currentTime) {
        if (this.game.isEmergency) return;
        const H = 3600;
        
        // 24時間経過判定とタイマーの翌日基準リセット
        let currentDay = Math.floor(currentTime / (24 * H));
        if (currentDay > this.lastDay) {
            this.lastDay = currentDay;
            let base = currentDay * 24 * H;
            
            this.kobeStartersSpawned = 0; this.nextKobeSpawn = base + 4.5 * H + 300;
            this.amagasakiStartersSpawned = 0; this.nextAmagasakiDownSpawn = base + 4.5 * H + 300;
            this.amagasakiUpStartersSpawned = 0; this.nextAmagasakiUpSpawn = base + 4.5 * H + 300;
            this.sannomiyaUpStartersSpawned = 0; this.nextSannomiyaUpSpawn = base + 4.5 * H + 900;
            this.nextNishiAkashiSpawn = base + 4.5 * H + 100;
            this.nextMukoHamakazeTime = base + 4.5 * H + 1800;
            this.nextMukoKounotoriTime = base + 4.5 * H + 3600;
            this.earlyKyotoUpSpawned = 0; this.nextEarlyKyotoUpSpawn = base + 4.0 * H + 600;
            this.earlyTakatsukiUpSpawned = 0; this.nextEarlyTakatsukiUpSpawn = base + 4.0 * H + 1200;
            this.nextMaibaraExtendTime = base + 4.0 * H; // ★追加: 米原発の近江塩津・敦賀延長タイマー
            this.nextKoseiLocalUp = base + 4.0 * H + Math.random() * 300;
            this.nextKoseiLocalDown = base + 4.0 * H + Math.random() * 300;
            this.nextFukuchiUp = base + 4.0 * H + Math.random() * 300;
            this.nextFukuchiDown = base + 4.0 * H + Math.random() * 300;
            this.nextTozaiDown = base + 4.0 * H + Math.random() * 300;
            this.nextTozaiUp = base + 4.0 * H + Math.random() * 300;

            ["Up", "Down"].forEach(d => { for(let t in INTERVALS) this.nextSpawnTime[d][t] = base + 4.0 * H + Math.random()*300; });
            this.spawnedExtras.clear();
        }

        let hOfDay = (currentTime / H) % 24;
        
        // ★22:45 (22.75H) から 4:00 までは新規列車の生成を停止
        if (hOfDay >= 22.75 || hOfDay < 4.0) return;
        
        let maxTrains = 220; 
        if (hOfDay >= 6.0 && hOfDay < 6.5) { maxTrains = 300; } 
        else if (hOfDay >= 6.5 && hOfDay < 7.5) { maxTrains = 360; } 
        else if (hOfDay >= 7.5 && hOfDay < 8.5) { maxTrains = 320; } 
        else if (hOfDay >= 8.5 && hOfDay < 9.5) { maxTrains = 260; } 
        else if (hOfDay >= 17 && hOfDay < 19.5) { maxTrains = 350; } 
        else if (hOfDay >= 9.5 && hOfDay < 10) { maxTrains = 230; }

        if (this.game.trains.length > maxTrains) return;
        this.checkFixedSpawns(currentTime);
        this.checkIntervalSpawns(currentTime);
        this.checkExtraSpawns(currentTime);
        this.checkKoseiSpawns(currentTime);
        this.checkFukuchiTozaiSpawns(currentTime);
};

Spawner.prototype.checkFixedSpawns = function (ct) {
        if (this.kobeStartersSpawned < 4 && ct >= this.nextKobeSpawn) {
            this.game.addTrain({type:"普通", dir:-1, trackId:"Down_In", dest:"西明石", startName:"神戸"});
            this.kobeStartersSpawned++; this.nextKobeSpawn += 1200;
        }
        if (this.amagasakiStartersSpawned < 4 && ct >= this.nextAmagasakiDownSpawn) {
            this.game.addTrain({type:"普通", dir:-1, trackId:"Down_In", dest:"西明石", startName:"尼崎"});
            this.amagasakiStartersSpawned++; this.nextAmagasakiDownSpawn += 1200;
        }
        if (this.amagasakiUpStartersSpawned < 4 && ct >= this.nextAmagasakiUpSpawn) {
            this.game.addTrain({type:"普通", dir:1, trackId:"Up_In", dest:"京都", startName:"尼崎"});
            this.amagasakiUpStartersSpawned++; this.nextAmagasakiUpSpawn += 900;
        }
        if (this.sannomiyaUpStartersSpawned < 2 && ct >= this.nextSannomiyaUpSpawn) {
            this.game.addTrain({type:"普通", dir:1, trackId:"Up_In", dest:"高槻", startName:"三ノ宮"});
            this.sannomiyaUpStartersSpawned++; this.nextSannomiyaUpSpawn += 1200;
        }
        if (ct >= this.nextNishiAkashiSpawn) {
            if (Math.random() < 0.7) this.game.addTrain({type:"普通", dir:1, trackId:"Up_In", dest:"高槻", startName:"西明石"});
            this.nextNishiAkashiSpawn += 1500;
        }
        if (this.earlyKyotoUpSpawned < 4 && ct >= this.nextEarlyKyotoUpSpawn) {
            this.game.addTrain({type:"快速", dir:1, trackId:"Up_In", dest:"米原", startName:"京都"});
            this.earlyKyotoUpSpawned++; 
            this.nextEarlyKyotoUpSpawn += 1800; 
        }
        if (this.earlyTakatsukiUpSpawned < 3 && ct >= this.nextEarlyTakatsukiUpSpawn) {
            this.game.addTrain({type:"快速", dir:1, trackId:"Up_In", dest:"野洲", startName:"高槻"});
            this.earlyTakatsukiUpSpawned++; 
            this.nextEarlyTakatsukiUpSpawn += 2400; 
        }
};

Spawner.prototype.checkExtraSpawns = function (ct) {
        let base = this.lastDay * 24 * 3600;
        EXTRA_TRAINS.forEach((data, index) => {
            if (this.spawnedExtras.has(index) || ct < base + data.time) return;
            this.spawnedExtras.add(index);
            if (Math.random() > 0.4) return; 
            let trackId = data.hoppo ? ((data.dir === 1) ? "Up_Hoppo" : "Down_Hoppo") : ((data.dir === 1) ? "Up_Out" : "Down_Out");
            this.game.addTrain({ type: data.type, dir: data.dir, trackId: trackId, dest: data.dest, startName: data.start, name: data.name, nextAction: "depot" });
        });
};

    // ★追加: checkKoseiSpawns用の重み付け抽選ヘルパー
Spawner.prototype.weightedRandom = function (options) {
        let total = options.reduce((sum, o) => sum + o.w, 0);
        let r = Math.random() * total;
        let s = 0;
        for (let o of options) {
            s += o.w;
            if (r < s) return o.d || o.n;
        }
        return options[0].d || options[0].n;
};

Spawner.prototype.generateTrainNumber = function (type, dir, startName, trackId) {
        let base = 100;
        let candidate = "";
        let safe = 0;
        
        // ★修正: 回送・臨時も重複チェックと使用中リスト(activeTrainNos)への追加を正しく行う
        if (type === "回送" || type === "臨時") {
            let prefix = type === "回送" ? "回" : "臨";
            do {
                candidate = prefix + (Math.floor(Math.random() * 8000) + 1000) + (type==="回送"?"M":"");
                safe++;
            } while (this.activeTrainNos.has(candidate) && safe < 500);
            this.activeTrainNos.add(candidate);
            return candidate;
        }

        if (type === "普通") base = (["大阪","高槻","尼崎"].includes(startName)) ? 500 : 100;
        else if (type === "快速") base = 700; else if (type === "新快速") base = 3400; else if (type === "特急") base = 4000; else if (type === "貨物") base = 1000;
        
        let suffix = "M";
        if (type === "貨物") suffix = ""; else if (type === "快速" && trackId.includes("In")) suffix = "T";
        
        let num = 0;
        safe = 0;
        do {
            this.trainCounters[type]++; 
            if(this.trainCounters[type] > 999) this.trainCounters[type] = 1; // ★99から999に拡張(枯渇防止)
            num = base + this.trainCounters[type];
            if (dir === -1 && num % 2 === 0) num++; else if (dir === 1 && num % 2 !== 0) num++;
            candidate = num + suffix; 
            safe++;
        } while(this.activeTrainNos.has(candidate) && safe < 500); // ★50から500に拡張
        
        this.activeTrainNos.add(candidate);
        return candidate;
};
