# -*- coding: utf-8 -*-
"""配線略図のスクリーンショットから、駅ごとの線路と番線の数を読み取る。

同梱の「スクリーンショット (NNN).png」は haisenryakuzu.net の配線略図で
    長い水平線       = 本線 (駅を通り抜ける線路)
    短い水平線の対   = ホーム (上下2本の枠線が 20〜34px 離れて対になる)
    対にならない短い水平線 = 待避線・側線 (駅の前後で本線から分かれる線)
という描き方をしている。これを画素から数えることで、
目で数えるより確実に駅の配線を読み取る。

使い方:
    python tools/extract_haisen.py 692 --y 480 780     # その帯の駅を一覧
    python tools/extract_haisen.py 692 --at 1740       # x位置の縦断面
    python tools/extract_haisen.py 692 --lines --y 480 780   # 水平線の一覧

出力は tools/reference-topology.js を書くための下調べに使う。
"""
import sys
import numpy as np
from PIL import Image

DARK = 100
LONG = 400          # これ以上の長さは本線とみなす
SHORT_MIN = 70      # これ未満は拾わない


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
    out, used = [], [False] * len(segs)
    for i, (y, x0, x1) in enumerate(segs):
        if used[i]:
            continue
        ys, a, b = [y], x0, x1
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
                a, b = min(a, a2), max(b, b2)
        out.append((int(np.mean(ys)), a, b, len(ys)))
    return out


def section(mask, x, tol=2):
    H = mask.shape[0]
    col = mask[:, max(0, x - tol):x + tol + 1].any(axis=1)
    out, y = [], 0
    while y < H:
        if col[y]:
            y0 = y
            while y < H and col[y]:
                y += 1
            out.append(((y0 + y - 1) // 2, y - y0))
        else:
            y += 1
    return out


def analyse(mask, ymin, ymax, xmax=2150):
    segs = [s for s in h_runs(mask) if ymin <= s[0] <= ymax and s[1] < xmax]
    longs = [s for s in segs if (s[2] - s[1]) >= LONG]
    shorts = [s for s in segs if (s[2] - s[1]) < LONG]

    # ホーム = 短い線の対 (20〜34px 離れ、x範囲がほぼ同じ)
    plats, used = [], [False] * len(shorts)
    for i, (y, x0, x1, th) in enumerate(shorts):
        if used[i]:
            continue
        for j, (y2, a2, b2, th2) in enumerate(shorts):
            if used[j] or j == i:
                continue
            if not (20 <= y2 - y <= 34):
                continue
            if abs(a2 - x0) < 30 and abs(b2 - x1) < 30:
                plats.append(((y + y2) // 2, max(x0, a2), min(x1, b2)))
                used[i] = used[j] = True
                break
    loops = [s for k, s in enumerate(shorts) if not used[k]]

    # ホームの x 範囲で駅にまとめる
    groups = []
    for cy, x0, x1 in sorted(plats, key=lambda p: p[1]):
        for g in groups:
            if abs(cy - g["pf"][0]) > 220:
                continue          # 図の段 (帯) が違うものは別の駅
            if not (x1 < g["x0"] - 25 or x0 > g["x1"] + 25):
                g["x0"] = min(g["x0"], x0); g["x1"] = max(g["x1"], x1)
                g["pf"].append(cy)
                break
        else:
            groups.append({"x0": x0, "x1": x1, "pf": [cy]})

    for g in groups:
        cx = (g["x0"] + g["x1"]) // 2
        g["cx"] = cx
        g["pf"].sort()
        # その駅の帯だけを見る (長い線は図の全段を横切るので、ホームの近くに限る)
        lo, hi = g["pf"][0] - 130, g["pf"][-1] + 130
        g["main"] = sorted(y for (y, a, b, th) in longs if a <= cx <= b and lo <= y <= hi)
        g["loop"] = sorted(y for (y, a, b, th) in loops
                           if a - 30 <= cx <= b + 30 and (b - a) >= 90 and lo <= y <= hi)
    return groups, longs, loops


def main():
    num = sys.argv[1]
    mask = load(num)
    H, W = mask.shape
    ymin = int(sys.argv[sys.argv.index("--y") + 1]) if "--y" in sys.argv else 150
    ymax = int(sys.argv[sys.argv.index("--y") + 2]) if "--y" in sys.argv else 1500

    if "--at" in sys.argv:
        x = int(sys.argv[sys.argv.index("--at") + 1])
        print("x=%d の断面 (y中心, 太さ):" % x)
        for cy, th in section(mask, x):
            print("   y=%-5d 太さ%d" % (cy, th))
        return

    groups, longs, loops = analyse(mask, ymin, ymax)
    if "--lines" in sys.argv:
        print("本線 (長い水平線):")
        for y, a, b, th in sorted(longs):
            print("   y=%-5d x=%-5d-%-5d len=%d" % (y, a, b, b - a))
        print("待避線・側線 (対にならない短い線):")
        for y, a, b, th in sorted(loops):
            if b - a >= 90:
                print("   y=%-5d x=%-5d-%-5d len=%d" % (y, a, b, b - a))
        return

    # 帯 (図の段) ごとにまとめる。同じ段の駅は本線の y がほぼ同じになる。 
    print("画像 %s (%dx%d)  駅 %d箇所" % (num, W, H, len(groups)))
    bands = []
    for g in groups:
        if not g["main"]:
            continue
        key = int(np.median(g["main"]))
        for b in bands:
            if abs(b["key"] - key) < 120:
                b["st"].append(g); break
        else:
            bands.append({"key": key, "st": [g]})
    bands.sort(key=lambda b: b["key"])
    for bi, b in enumerate(bands):
        b["st"].sort(key=lambda g: g["x0"])
        print(" -- 帯%d (本線y中央 %d) 駅%d --" % (bi + 1, b["key"], len(b["st"])))
        for g in b["st"]:
            print("    x%-5d 本線%d y=%-28s 待避%d y=%-14s ホーム%d y=%s" %
                  (g["cx"], len(g["main"]), ",".join(map(str, g["main"])),
                   len(g["loop"]), ",".join(map(str, g["loop"])),
                   len(g["pf"]), ",".join(map(str, g["pf"]))))


if __name__ == "__main__":
    main()
