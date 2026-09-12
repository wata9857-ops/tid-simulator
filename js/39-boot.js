/* 起動処理。読み込み順のいちばん最後に置く。

   GameSystem のコンストラクタは、このファイルより前に読み込まれた
   仕組み (信号 SignalSystem / 障害 IncidentSystem / 出入区計画 DepotDispatcher) を
   組み立てる。そのため、インスタンスの生成だけをここまで遅らせている。
   js/23-game.js の中で new していたときは、後ろのファイルがまだ読み込まれておらず
   「SignalSystem is not defined」で落ちていた。 */

const game = new GameSystem();

window.onload = () => game.init();

window.onerror = function (msg) { console.error(msg); };
