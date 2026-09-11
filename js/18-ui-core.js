/* このファイルは index.html から分割されたものです。
   UIManager 本体: 時計とヘッダーのバナー表示 */
/**
 * ==================================================
 * 6. UI Manager
 * ==================================================
 */
class UIManager {
    constructor(game) {
        this.game = game;
        this.elClock = document.getElementById("clock");
        this.currentBoardStation = null;
        this.logHistory = [];
        this.currentLogView = 'cmd';   // 'cmd' (運転指令ログ) または 'staff' (業務連絡)
        this.logFilter = null;         // 発信元での絞り込み (null = すべて)
        this.logImportantOnly = false; // 重要なログのみ表示
        this.staffFeedIdle = false;    // ヘッダー業務連絡欄が平常表示かどうか
    }
}

    // ★追加：掲示板を閉じるときに状態をリセットする
UIManager.prototype.closeDepartureBoard = function () {
        document.getElementById("dep-board-modal").style.display = "none";
        this.currentBoardStation = null;
};

UIManager.prototype.updateClock = function (sec) {
        const h = Math.floor(sec/3600) % 24, m = Math.floor((sec%3600)/60), s = Math.floor(sec%60);
        this.elClock.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
};

UIManager.prototype.updateBanner = function (msg, cls) {
        const timeStr = this.elClock.innerText;
        const baseMsg = msg.replace(/\(再開見込:約?\d+分\)|\(残り約\d+秒\)/g, "").trim();

        // ★修正: 直前が業務連絡だと同一内容の指令ログを重複判定できていなかったため、
        //        同じ種別(cmd)の最新ログと比べる。
        const lastCmd = this.logHistory.find(l => l.type === 'cmd');
        let shouldAdd = true;
        if (lastCmd) {
            const lastLogBase = lastCmd.msg.replace(/\(再開見込:約?\d+分\)|\(残り約\d+秒\)/g, "").trim();
            if (baseMsg === lastLogBase) {
                lastCmd.time = timeStr;
                lastCmd.msg = msg;
                shouldAdd = false;
            }
        }

        if (shouldAdd) {
            // 指令ログとして type: 'cmd' を設定。発信元と重要度は本文から推定する。
            const kind = this.classifyCmdLog(msg, cls);
            this.logHistory.unshift({
                time: timeStr, type: 'cmd', msg: msg, cls: cls,
                cat: kind.cat, level: kind.level, src: ""
            });
            if (this.logHistory.length > 200) this.logHistory.pop();
        }

        // パネルが開いている状態ならリアルタイムで追記更新する
        const p = document.getElementById("log-panel");
        if (p && p.style.display === "block") this.renderLogList();

        const emg = document.getElementById("emergency-banner");
        const info = document.getElementById("info-banner");
        if (cls === "banner-red") {
            emg.innerText = msg; emg.style.display = "inline"; info.style.display = "none";
        } else {
            info.innerText = msg; info.style.display = "inline"; emg.style.display = "none";
            info.className = (cls === "banner-orange") ? "banner-orange" : (cls === "banner-blue" ? "banner-blue" : "");
        }
};
