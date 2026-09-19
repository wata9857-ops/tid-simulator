/* Super-TID 画面 (tid.html) の起動処理。

   旅客向け画面 (index.html) と同じ GameSystem をそのまま動かし、
   描画だけを Super-TID の線路図に差し替える。
   シミュレーションの本体・指令の効き方は共通なので、
   どちらの画面から操作しても同じ状態が変わる。
*/

const game = new GameSystem();

/**
 * 旅客向け画面の Renderer は使わないが、
 * GameSystem.init() が renderer を前提にしているので、
 * 同じ形の入れ物を用意しておく。
 */
function makeTidRendererShim() {
    return { draw: function () {}, buildHitboxes: function () {}, resize: function () {} };
}

window.onload = function () {
    // --- シミュレーション本体を起動する (描画は後から差し替える)
    game.renderer = makeTidRendererShim();
    game.scrollContainer = document.getElementById("tid-scroll");
    game.initVehicles();

    // 予備車の配置 (js/23-game.js の init() と同じ)
    for (const stName in DEPOTS) {
        let reserveCount = 0;
        if (stName === "野洲") reserveCount = 2;
        else if (stName === "宮原操" || stName === "向日町操") reserveCount = 3;
        for (let i = 0; i < reserveCount; i++) {
            const assigned = game.spawner.assignVehicles(stName, "回送", "Up_In", "京都");
            if (!assigned) continue;
            const t = new Train({ type: "回送", dir: 1, trackId: "Up_In",
                                  startName: stName, name: "予備", vehicles: assigned }, game);
            t.state = "in_depot";
            t.timer = -1;
            t.startName = stName;
            t.depotOutConfig = null;
            t.trainNo = "";
            const blks = game.trackMgr.blocks[t.trackId];
            if (blks && blks[t.currBlockIndex] && blks[t.currBlockIndex].lanes[t.lane] === t) {
                blks[t.currBlockIndex].lanes[t.lane] = null;
            }
            depotAdd(stName, t);
            game.trains.push(t);
        }
    }

    // --- Super-TID の描画と操作
    game.tidRenderer = new TidRenderer(game);
    game.tidUI = new TidUI(game);
    game.renderer = game.tidRenderer;      // メインループから描かれるようにする
    game.tidUI.init();
    // 線路図の拡大縮小・移動 (js/43-tid-zoom.js)
    game.tidZoom = new TidZoom(game.tidRenderer);
    // 編成検索・行路表 (js/44-tid-duty.js) と 指令連絡 (js/45-tid-comms.js)
    game.tidDuty = new TidDuty(game);
    game.tidComms = new TidComms(game);

    // 起動時は大阪を中央に
    game.tidRenderer.scrollToStation("大阪");

    /* 画面どうしの共有を始める (js/29-sim-bus.js)。
       旅客向け画面をすでに開いていれば、そちらが本体になり
       この画面は同じ状態を映す。指令はどちらから出しても共有される。 */
    game.bus = new SimBus(game);
    game.bus.start();

    // 1秒ごとに指令パッド・情報パネルを描き直す (線路図は毎フレーム)
    setInterval(() => {
        try { game.tidUI.render(); } catch (e) { console.error(e); }
        // 指令連絡は残り時間が動くので毎秒、行路表は開いているときだけ
        try { game.tidComms.render(); } catch (e) { console.error(e); }
        try { game.tidDuty.tick(); } catch (e) { console.error(e); }
    }, 1000);

    // メインループ開始
    requestAnimationFrame((ts) => { game.lastTime = ts; game.loop(ts); });

    const loading = document.getElementById("tid-loading");
    if (loading) loading.style.display = "none";
};

window.onerror = function (msg) { console.error(msg); };
