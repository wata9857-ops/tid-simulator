/* 留置場の構内図表示。

   本線上の【留置】の枠をクリックすると開く。以前は編成の一覧表だったが、
   同梱の配線略図をもとにした構内配線図 (DEPOT_LAYOUTS) の上に、
   どの線にどの編成が止まっているかを描くようにした。

   在線の割り付け
     出区待ちの列車(Train) と 出区前の待機編成(Vehicle) の両方を線に並べる。
     席は編成番号から求めたハッシュで決めるので、同じ編成は留置している間
     同じ線に居続ける (表示が毎秒飛び回らない)。
     線の収容両数を超える場合は次の空き線に送る。
*/

const DEPOT_VIEW = {
    carWidth: 15,        // 1両あたりの幅(px)
    rowHeight: 26,       // 留置線1本の高さ(px)
    groupGap: 14,        // 線群のあいだの余白
    labelWidth: 74,      // 線名を書く幅
    throat: 34,          // 分岐(のど)部の幅
    padTop: 16,
    padBottom: 16
};

/** 文字列から安定した整数を作る (席決め用) */
function depotHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/**
 * 留置場に居るものを集める。
 * 戻り値の各要素: { key, cars, kind, type, label, sub, train }
 *   kind  : "train" = 運用の付いた出区待ち列車 / "idle" = 待機編成
 */
function collectDepotItems(depotName) {
    const items = [];
    const depot = DEPOTS[depotName];

    if (depot) {
        depot.trains.forEach(t => {
            const ids = (t.vehicles && t.vehicles.length)
                ? t.vehicles.map(v => v.fullId).join("+") : "";
            const cars = (t.vehicles && t.vehicles.length)
                ? t.vehicles.reduce((s, v) => s + v.cars, 0) : 4;
            const out = t.depotOutConfig;
            items.push({
                key: ids || t.id,
                cars: cars,
                kind: "train",
                type: out ? out.type : "回送",
                label: ids || "(編成未定)",
                sub: out
                    ? `${out.trainNo || "番号未定"} ${out.dest || ""}行き` +
                      (t.timer > 0 ? ` / 出区まで ${Math.max(0, Math.ceil(t.timer / 60))}分` : " / 出区準備")
                    : "予備車 (出区予定なし)",
                train: t
            });
        });
    }

    (game.fleet ? game.fleet.poolAt(depotName) : []).forEach(v => {
        items.push({
            key: v.fullId,
            cars: v.cars,
            kind: "idle",
            type: "留置",
            label: v.fullId,
            sub: `${v.type} ${v.cars}両`,
            veh: v
        });
    });

    return items;
}

/** 各留置線へ在線を割り付ける */
function assignDepotSlots(layout, items) {
    const tracks = [];
    layout.groups.forEach((g, gi) => {
        g.tracks.forEach(t => {
            tracks.push({ group: gi, groupName: g.name, label: t.label,
                          cars: t.cars, kind: t.kind, used: 0, items: [] });
        });
    });
    if (!tracks.length) return { tracks: tracks, overflow: items.slice() };

    // 長い編成から順に置く (短い編成で長い線を埋めてしまわないように)
    const sorted = items.slice().sort((a, b) => b.cars - a.cars || depotHash(a.key) - depotHash(b.key));
    const overflow = [];

    sorted.forEach(it => {
        const start = depotHash(it.key) % tracks.length;
        let placed = false;
        for (let n = 0; n < tracks.length; n++) {
            const t = tracks[(start + n) % tracks.length];
            // 検修庫・洗浄線には運用の付いた出区待ち列車を優先して入れない
            if (it.kind === "train" && (t.kind === "shed" || t.kind === "wash") && n < tracks.length - 1) continue;
            if (t.used + it.cars <= t.cars) {
                t.items.push(it);
                t.used += it.cars;
                placed = true;
                break;
            }
        }
        if (!placed) overflow.push(it);
    });

    return { tracks: tracks, overflow: overflow };
}

function depotSvg(layout, placed) {
    const D = DEPOT_VIEW;
    const maxCars = Math.max.apply(null, placed.tracks.map(t => t.cars).concat([12]));
    const trackLen = maxCars * D.carWidth;
    const x0 = D.labelWidth + D.throat;
    const width = x0 + trackLen + 26;

    // 線群ごとの縦位置
    let y = D.padTop + 22;
    const rows = [];
    let lastGroup = -1;
    const groupHeads = [];
    placed.tracks.forEach(t => {
        if (t.group !== lastGroup) {
            if (lastGroup !== -1) y += D.groupGap;
            groupHeads.push({ name: t.groupName, y: y - 6 });
            y += 16;
            lastGroup = t.group;
        }
        rows.push({ t: t, y: y + D.rowHeight / 2 });
        y += D.rowHeight;
    });
    const height = y + D.padBottom + 26;
    const mainY = height - D.padBottom - 12;

    // 幅と高さを実寸で入れておき、縮小は CSS (max-width:100%; height:auto) に任せる。
    // width="100%" だけだと環境によって高さが潰れることがある。
    let svg = `<svg class="depot-svg" viewBox="0 0 ${width} ${height}"` +
              ` width="${width}" height="${height}" preserveAspectRatio="xMinYMin meet">`;

    // --- 本線 (下端) と方向表示
    svg += `<line x1="0" y1="${mainY}" x2="${width}" y2="${mainY}" class="dv-main"/>`;
    svg += `<line x1="0" y1="${mainY + 7}" x2="${width}" y2="${mainY + 7}" class="dv-main"/>`;
    svg += `<text x="2" y="${mainY - 6}" class="dv-dir">◀ ${escapeLogHtml(layout.leftLabel)}</text>`;
    svg += `<text x="${width - 2}" y="${mainY - 6}" class="dv-dir" text-anchor="end">${escapeLogHtml(layout.rightLabel)} ▶</text>`;

    // --- 線群の見出し
    groupHeads.forEach(g => {
        svg += `<text x="2" y="${g.y + 12}" class="dv-group">${escapeLogHtml(g.name)}</text>`;
    });

    // --- 各留置線
    rows.forEach(r => {
        const t = r.t;
        const len = t.cars * D.carWidth;
        const xEnd = x0 + len;

        // のど(分岐)部: 本線から留置線へ向かう渡り線
        svg += `<path d="M ${x0 - D.throat} ${mainY} L ${x0} ${r.y}" class="dv-ladder"/>`;
        // 留置線本体
        svg += `<line x1="${x0}" y1="${r.y}" x2="${xEnd}" y2="${r.y}" class="dv-track dv-track-${t.kind}"/>`;
        // 車止め
        svg += `<line x1="${xEnd}" y1="${r.y - 7}" x2="${xEnd}" y2="${r.y + 7}" class="dv-stop"/>`;
        // 線名と収容両数
        svg += `<text x="${D.labelWidth - 6}" y="${r.y + 4}" class="dv-label" text-anchor="end">${escapeLogHtml(t.label)}</text>`;
        svg += `<text x="${xEnd + 5}" y="${r.y + 4}" class="dv-cap">${t.cars}両</text>`;

        // 検修庫は建屋の枠を描く
        if (t.kind === "shed") {
            svg += `<rect x="${x0 + 4}" y="${r.y - 11}" width="${len - 8}" height="22" class="dv-shed"/>`;
        }

        // 在線している編成
        let cx = x0 + 2;
        t.items.forEach(it => {
            const w = it.cars * D.carWidth - 4;
            const col = (CONFIG.colors[it.type] || CONFIG.colors["回送"]);
            const bg = (it.kind === "idle") ? "#37474f" : col.bg;
            const fg = (it.kind === "idle") ? "#ffffff" : col.text;
            svg += `<g class="dv-unit" data-key="${escapeLogHtml(it.key)}">`;
            svg += `<title>${escapeLogHtml(it.label)} ／ ${escapeLogHtml(it.sub)} ／ ${it.cars}両</title>`;
            svg += `<rect x="${cx}" y="${r.y - 9}" width="${w}" height="18" rx="3" fill="${bg}" stroke="${it.kind === "train" ? "#ffeb3b" : "#90a4ae"}" stroke-width="${it.kind === "train" ? 2 : 1}"/>`;
            svg += `<text x="${cx + w / 2}" y="${r.y + 4}" class="dv-unit-text" fill="${fg}">${escapeLogHtml(it.label)}</text>`;
            svg += `</g>`;
            cx += it.cars * D.carWidth;
        });
    });

    svg += `</svg>`;
    return svg;
}

function depotDetailTable(placed, overflow) {
    let html = '<table class="depot-table"><thead><tr>' +
        '<th>留置線</th><th>編成番号</th><th>形式</th><th>両数</th><th>状態 / 運用</th>' +
        '</tr></thead><tbody>';
    let any = false;
    placed.tracks.forEach(t => {
        t.items.forEach(it => {
            any = true;
            const veh = it.veh;
            const form = veh ? veh.type
                : (it.train && it.train.vehicles && it.train.vehicles.length
                    ? it.train.vehicles.map(v => v.type).join(" + ") : "―");
            html += '<tr class="' + (it.kind === "train" ? "is-train" : "is-idle") + '">' +
                `<td class="dt-track">${escapeLogHtml(t.label)}</td>` +
                `<td class="dt-no">${escapeLogHtml(it.label)}</td>` +
                `<td>${escapeLogHtml(form)}</td>` +
                `<td class="dt-cars">${it.cars}両</td>` +
                `<td class="dt-state">${it.kind === "train" ? '<span class="dt-badge dt-badge-out">出区待ち</span> ' : '<span class="dt-badge">留置</span> '}${escapeLogHtml(it.sub)}</td>` +
                '</tr>';
        });
    });
    overflow.forEach(it => {
        any = true;
        // 図に描いた留置線に収まりきらなかった編成。実際の車両所には図に
        // 載せていない留置線もあるので、その他の留置線として扱う。
        html += '<tr class="is-over">' +
            '<td class="dt-track">その他</td>' +
            `<td class="dt-no">${escapeLogHtml(it.label)}</td>` +
            `<td>${escapeLogHtml(it.veh ? it.veh.type : "―")}</td>` +
            `<td class="dt-cars">${it.cars}両</td>` +
            '<td class="dt-state"><span class="dt-badge">構内留置</span> 図に記載のない留置線</td></tr>';
    });
    if (!any) {
        html += '<tr><td colspan="5" class="dt-none">在線している編成はありません。（全て運用中）</td></tr>';
    }
    return html + '</tbody></table>';
}

function closeDepotModal() {
    document.getElementById('depot-modal').style.display = 'none';
}

function showDepotModal(stationName) {
    const layout = DEPOT_LAYOUTS[stationName];
    const title = document.getElementById('depot-modal-title');
    const content = document.getElementById('depot-modal-content');
    if (!title || !content) return;

    const items = collectDepotItems(stationName);
    const trainCount = items.filter(i => i.kind === "train").length;
    const idleCount = items.filter(i => i.kind === "idle").length;
    const totalCars = items.reduce((s, i) => s + i.cars, 0);

    if (!layout) {
        const disp = DEPOTS[stationName] ? DEPOTS[stationName].display : stationName;
        title.innerHTML = `${escapeLogHtml(disp)} <span class="depot-sub">留置車両</span>`;
        content.innerHTML = '<p class="dt-none">この留置場の構内配線図は未登録です。</p>' +
            depotDetailTable({ tracks: [] }, items);
        document.getElementById('depot-modal').style.display = 'flex';
        return;
    }

    const placed = assignDepotSlots(layout, items);
    const capCars = placed.tracks.reduce((s, t) => s + t.cars, 0);

    title.innerHTML =
        `${escapeLogHtml(layout.title)}` +
        `<span class="depot-sub">${escapeLogHtml(layout.owner)}</span>`;

    const onTrack = placed.tracks.reduce((s, t) => s + t.used, 0);

    content.innerHTML =
        '<div class="depot-stats">' +
            `<span class="ds-item"><b>${placed.tracks.length}</b> 線 <small>(${capCars}両収容)</small></span>` +
            `<span class="ds-item">在線 <b>${trainCount + idleCount}</b> 編成 <small>(出区待ち ${trainCount} / 留置 ${idleCount})</small></span>` +
            `<span class="ds-item">図上 <b>${onTrack}</b> 両` +
                (placed.overflow.length
                    ? ` <small>＋その他の留置線 ${placed.overflow.length}編成</small>`
                    : '') +
            '</span>' +
        '</div>' +
        `<p class="depot-note">${escapeLogHtml(layout.note)}</p>` +
        '<div class="depot-legend">' +
            '<span><i class="dl-box" style="background:#20F80D"></i>普通</span>' +
            '<span><i class="dl-box" style="background:#FF883B"></i>快速</span>' +
            '<span><i class="dl-box" style="background:#0044FF"></i>新快速</span>' +
            '<span><i class="dl-box" style="background:#000"></i>回送</span>' +
            '<span><i class="dl-box" style="background:#37474f"></i>留置(待機編成)</span>' +
            '<span><i class="dl-line dl-shed"></i>検修庫</span>' +
            '<span><i class="dl-line dl-wash"></i>洗浄線</span>' +
            '<span><i class="dl-line dl-siding"></i>入出区・待避線</span>' +
        '</div>' +
        '<div class="depot-diagram">' + depotSvg(layout, placed) + '</div>' +
        depotDetailTable(placed, placed.overflow);

    document.getElementById('depot-modal').style.display = 'flex';
}
