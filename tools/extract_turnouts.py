# -*- coding: utf-8 -*-
"""配線略図から「渡り線 (本線どうしをつなぐ転てつ器)」を駅ごとに読み取る。

同梱の「スクリーンショット (NNN).png」(haisenryakuzu.net) は
    長い水平線     = 本線
    短い水平線の対 = ホーム
    斜めの線       = 転てつ器・渡り線・分岐
という描き方をしている。

このツールが数えるのは「本線どうしをつなぐ斜めの線」= 渡り線。
    ・線路として数えるのは長い水平線 (本線) だけ。
      ホームの枠・駅名の文字・短い側線を線路に数えると、
      文字の斜めの画に転てつ器の番号が付いてしまう。
    ・側線・支線 (TID_JUNCTIONS の stubs) と他線区との分岐 (junctions) は
      本数が少なく形も様々なので、図を見て書き起こす。

出力の読み方
    x468   : L 0-1 x2(up1 dn1)   R 1-2 x1(up0 dn1)
      駅の中心 x=468 の駅で
        左側 (画面左＝米原・草津方) に、上から0番目と1番目の本線をつなぐ
        斜め線が2本 (右上がり1・右下がり1) → 両渡り (x) 1組
        右側 (画面右＝大阪・姫路方) に、1番目と2番目をつなぐ斜め線が1本
        (右下がり) → 片渡り 1つ

使い方:
    python tools/extract_turnouts.py 711
    python tools/extract_turnouts.py --all -o tools/.tmp/turnouts.txt
"""
import sys
import glob
import re
import io
import numpy as np
from PIL import Image

DARK = 100
H_MIN = 40          # これ以上つながる水平な走りは線路の本体 (斜め線を抜くのに使う)
LONG = 400          # これ以上の長さの水平線を「本線」とみなす
SHORT_MIN = 70
DIAG_MIN = 24       # 斜めの線と認める最小の画素数
BAND_PAD = 80       # 本線の上下これだけを「帯」として見る
XMAX = 2150         # これより右は広告・目次なので見ない


def load(num):
    im = Image.open("スクリーンショット (%s).png" % num).convert("L")
    return np.asarray(im).astype(int) < DARK


def h_runs(mask, min_len=SHORT_MIN):
    """水平に伸びる線を探す。戻り値: [(y, x0, x1, 太さ)]"""
    H, W = mask.shape
    segs = []
    for y in range(H):
        row = mask[y]
        x = 0
        while x < W:
            if row[x]:
                x0 = x
                while x < W and row[x]:
                    x += 1
                if x - x0 >= min_len:
                    segs.append((y, x0, x - 1))
            else:
                x += 1
    segs.sort()
    out = []
    used = [False] * len(segs)
    for i in range(len(segs)):
        if used[i]:
            continue
        y, x0, x1 = segs[i]
        ys = [y]
        a, b = x0, x1
        used[i] = True
        for j in range(i + 1, len(segs)):
            if used[j]:
                continue
            y2, a2, b2 = segs[j]
            if y2 - ys[-1] > 2:
                continue
            if abs(a2 - a) < 40 and abs(b2 - b) < 40:
                ys.append(y2)
                used[j] = True
                a = min(a, a2)
                b = max(b, b2)
        out.append((int(np.mean(ys)), a, b, len(ys)))
    return out


def horizontal_mask(mask):
    """水平に長く伸びている画素だけを立てたマスク (線路の本体)"""
    H, W = mask.shape
    out = np.zeros_like(mask)
    for y in range(H):
        row = mask[y]
        x = 0
        while x < W:
            if row[x]:
                x0 = x
                while x < W and row[x]:
                    x += 1
                if x - x0 >= H_MIN:
                    out[y, x0:x] = True
            else:
                x += 1
    return out


def stations_of(segs, ymin, ymax, xmax):
    """ホーム (短い水平線の対) をまとめて駅にする"""
    shorts = [s for s in segs
              if (s[2] - s[1]) < LONG and ymin <= s[0] <= ymax and s[1] < xmax]
    plats = []
    used = [False] * len(shorts)
    for i in range(len(shorts)):
        if used[i]:
            continue
        y, x0, x1, th = shorts[i]
        for j in range(len(shorts)):
            if used[j] or j == i:
                continue
            y2, a2, b2, th2 = shorts[j]
            if not (20 <= y2 - y <= 34):
                continue
            if abs(a2 - x0) < 30 and abs(b2 - x1) < 30:
                plats.append(((y + y2) // 2, max(x0, a2), min(x1, b2)))
                used[i] = True
                used[j] = True
                break
    groups = []
    for cy, x0, x1 in sorted(plats, key=lambda p: p[1]):
        hit = None
        for g in groups:
            if abs(cy - g["pf"][0]) > 220:
                continue
            if not (x1 < g["x0"] - 25 or x0 > g["x1"] + 25):
                hit = g
                break
        if hit is None:
            groups.append({"x0": x0, "x1": x1, "pf": [cy]})
        else:
            hit["x0"] = min(hit["x0"], x0)
            hit["x1"] = max(hit["x1"], x1)
            hit["pf"].append(cy)
    for g in groups:
        g["cx"] = (g["x0"] + g["x1"]) // 2
        g["pf"].sort()
    groups.sort(key=lambda g: g["cx"])
    return groups


def diagonals(mask, hmask, ymin, ymax, xmax):
    """水平線を除いた残りを連結成分にまとめ、斜めのものだけ返す"""
    band = np.zeros_like(mask)
    band[ymin:ymax, :xmax] = mask[ymin:ymax, :xmax] & ~hmask[ymin:ymax, :xmax]
    H, W = band.shape
    seen = np.zeros_like(band)
    out = []
    ys, xs = np.nonzero(band)
    for k in range(len(ys)):
        y0 = ys[k]
        x0 = xs[k]
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny = y + dy
                    nx = x + dx
                    if ny < 0 or nx < 0 or ny >= H or nx >= W:
                        continue
                    if band[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if len(pts) < DIAG_MIN:
            continue
        py = [p[0] for p in pts]
        px = [p[1] for p in pts]
        if max(py) - min(py) < 8 or max(px) - min(px) < 8:
            continue
        left_y = np.mean([p[0] for p in pts if p[1] <= min(px) + 2])
        right_y = np.mean([p[0] for p in pts if p[1] >= max(px) - 2])
        out.append({"x0": int(min(px)), "x1": int(max(px)),
                    "y0": int(min(py)), "y1": int(max(py)),
                    "cx": int((min(px) + max(px)) / 2),
                    "cy": int((min(py) + max(py)) / 2),
                    "down": bool(right_y > left_y),
                    "px": int(len(pts))})
    out.sort(key=lambda d: (d["cx"], d["cy"]))
    return out


def nearest_idx(ys, v, tol=7):
    best = tol + 1
    bi = None
    for i in range(len(ys)):
        d = abs(ys[i] - v)
        if d < best:
            best = d
            bi = i
    return bi


def bands_of(segs, xmax):
    """本線 (長い水平線) の y をまとめて「帯 (図の段)」にする"""
    longs = sorted(s[0] for s in segs if (s[2] - s[1]) >= LONG and s[1] < xmax)
    if not longs:
        return []
    bands = []
    cur = [longs[0]]
    for y in longs[1:]:
        if y - cur[-1] <= 70:
            cur.append(y)
        else:
            bands.append(cur)
            cur = [y]
    bands.append(cur)
    return [b for b in bands if len(b) >= 2]


def report_all(num, out):
    """1枚の画像を1回だけ解析し、帯ごとに渡り線を書き出す"""
    mask = load(num)
    hmask = horizontal_mask(mask)
    segs = h_runs(mask)
    H = mask.shape[0]
    bands = bands_of(segs, XMAX)

    out.write("################ image %s  bands %d ################\n" % (num, len(bands)))
    for bi in range(len(bands)):
        b = bands[bi]
        ymin = max(0, b[0] - BAND_PAD)
        ymax = min(H - 1, b[-1] + BAND_PAD)

        # 線路として数えるのは本線 (長い水平線) だけ
        lines = []
        for (y, x0, x1, th) in sorted(segs):
            if not (ymin <= y <= ymax) or x0 >= XMAX:
                continue
            if (x1 - x0) < LONG:
                continue
            if lines and y - lines[-1] <= 4:
                continue
            lines.append(y)

        diags = diagonals(mask, hmask, ymin, ymax, XMAX)
        keep = []
        for d in diags:
            a = nearest_idx(lines, d["y0"])
            c = nearest_idx(lines, d["y1"])
            if a is None or c is None or a == c:
                continue
            if abs(lines[a] - lines[c]) < 10:
                continue
            if (d["x1"] - d["x0"]) < 12 or (d["y1"] - d["y0"]) < 10:
                continue
            if d["px"] > 1500:
                continue
            d["from"] = a
            d["to"] = c
            keep.append(d)
        sts = stations_of(segs, ymin, ymax, XMAX)

        out.write("\n-- band%d y=%d..%d main=%s\n"
                  % (bi + 1, ymin, ymax, ",".join(str(y) for y in b)))
        out.write("   mainlines(top->bottom): %s\n"
                  % ", ".join("%d:y%d" % (i, lines[i]) for i in range(len(lines))))
        out.write("   stations: %s\n"
                  % ", ".join("x%d(pf%d)" % (g["cx"], len(g["pf"])) for g in sts))
        covered = set()
        for gi in range(len(sts)):
            g = sts[gi]
            lo = (sts[gi - 1]["x1"] + g["x0"]) // 2 if gi > 0 else 0
            hi = (g["x1"] + sts[gi + 1]["x0"]) // 2 if gi + 1 < len(sts) else XMAX
            agg = {}
            for di in range(len(keep)):
                d = keep[di]
                if not (lo <= d["cx"] <= hi):
                    continue
                covered.add(di)
                side = "L" if d["cx"] < g["cx"] else "R"
                key = (min(d["from"], d["to"]), max(d["from"], d["to"]), side)
                if key not in agg:
                    agg[key] = []
                agg[key].append(d)
            parts = []
            for key in sorted(agg.keys()):
                a, c, side = key
                lst = agg[key]
                ups = sum(1 for d in lst if not d["down"])
                parts.append("%s %d-%d x%d(up%d dn%d)"
                             % (side, a, c, len(lst), ups, len(lst) - ups))
            out.write("     x%-5d : %s\n" % (g["cx"], "  ".join(parts) if parts else "(none)"))
        rest = []
        for di in range(len(keep)):
            if di not in covered:
                d = keep[di]
                rest.append("x%d %d-%d %s" % (d["cx"], d["from"], d["to"],
                                              "dn" if d["down"] else "up"))
        if rest:
            out.write("     outside: %s\n" % ", ".join(rest))
    out.write("\n")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = sys.argv[1:]
    nums = [a for a in args if a.isdigit()]
    if "--all" in args:
        nums = sorted(re.search(r"\((\d+)\)", f).group(1)
                      for f in glob.glob("スクリーンショット (*).png"))
        nums = [n for n in nums if 690 <= int(n) <= 712]
    if not nums:
        print(__doc__)
        return
    dest = args[args.index("-o") + 1] if "-o" in args else None
    fh = io.open(dest, "w", encoding="utf-8", newline="\n") if dest else sys.stdout
    for n in nums:
        report_all(n, fh)
        if dest:
            print("done " + n)
    if dest:
        fh.close()


if __name__ == "__main__":
    main()
