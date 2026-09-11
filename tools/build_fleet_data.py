# -*- coding: utf-8 -*-
"""js/02-fleet-data.js (全編成データ) を生成する。

元データは index.html に埋め込まれていた EXCEL_VEHICLES。
そこに以下の修正を加える:

  * 所属欄が「以下網干総合車両所」(エクセルの見出し行がそのまま入ってしまったもの)
    になっている 207系・321系を、実所属の「網干総合車両所明石支所」に直す。
  * 編成番号.xlsx に載っているのに取り込まれていなかった
    221系 京都支所 (F編成6両・K編成4両) と 223系6000番台 京都支所 を追加する。
  * 「京都支所→6000番台化」という改造前の履歴行は、改造後の 223系6000番台と
    同じ編成なので二重計上になる。履歴行の方を落とす。
  * 運用判定で文字列を毎回 includes() するのをやめ、車両所グループ(g)を持たせる。
"""
import os
import re
import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.getcwd()
SRC = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
RAW = json.loads(re.search(r'const EXCEL_VEHICLES = (\[.*?\]);\n', SRC, re.S).group(1))

# ---------------------------------------------------------------- 車両所グループ
# ABOSHI  : 網干総合車両所 (223系1000/2000番台・225系0/100番台)
#           新快速・快速・姫路以西/米原以東の普通を担当
# AKASHI  : 網干総合車両所明石支所 (207系・321系)
#           JR東西線・京都〜西明石の普通・JR宝塚線(東西線直通)を担当
# MIYAHARA: 網干総合車両所宮原支所 (223系6000番台・225系6000番台)
#           JR宝塚線(大阪方面)の快速・普通を担当
# KYOTO   : 吹田総合車両所京都支所 (221系・223系2500/6000番台)
#           湖西線・草津線・嵯峨野線を担当。本線(京都線/神戸線)には入らない
GROUP_BASE = {
    'ABOSHI': '網干総合車両所',
    'AKASHI': '網干総合車両所明石支所',
    'MIYAHARA': '網干総合車両所宮原支所',
    'KYOTO': '吹田総合車両所京都支所',
}


def classify(v):
    if '京都支所' in v['b']:
        return 'KYOTO'
    if '207系' in v['t'] or '321系' in v['t']:
        return 'AKASHI'
    if '宮原' in v['b']:
        return 'MIYAHARA'
    return 'ABOSHI'


out = []
skipped = []
for v in RAW:
    # 京都支所の 223系2000番台は、エクセル上「現在0両・全編成6000番台へ改造済み」と
    # 明記された改造前の履歴。改造後の 223系6000番台として下で登録し直すので落とす。
    if '京都支所' in v['b'] and v['t'] == '223系2000番台':
        skipped.append(v)
        continue
    g = classify(v)
    ident = v['i']
    # 223系2500番台はエクセルでは RS51〜RS58。取り込み時に RS が落ちていたので戻す。
    if v['t'] == '223系2500番台' and re.fullmatch(r'R5\d', ident):
        ident = 'RS' + ident[1:]
    out.append({'g': g, 'b': GROUP_BASE[g], 't': v['t'], 'i': ident, 'c': v['c'], 'n': v['n']})

print('改造前の履歴行として除外: %s'
      % ', '.join('%s %s(%s)' % (s['b'], s['i'], s['t']) for s in skipped))

# ---------------------------------------------------------------- 追加: 221系 京都支所
# 編成番号.xlsx の「221系 編成表まとめ」より。
# F編成 = 6両 × 5本 (F01〜F05)
# K編成 = 4両。K01・K02・K11・K19・K20・K22〜K24 は奈良へ転属済みなので京都車から除く。
K221_NOTE = '体質改善工事施工済み・転落防止幌設置済み・側面行先表示器更新済み、SIVをWSC43へ更新'
F221 = {
    'F01': '旧ナラNB802・転落防止幌・防犯カメラ、体質改善 2013.6.7（吹）',
    'F02': '旧ホシB10・防犯カメラ、体質改善 2015.6.22（下）',
    'F03': '旧ホシB12・防犯カメラ、体質改善 2014.6.28（吹）',
    'F04': '旧ホシB13・防犯カメラ、体質改善 2016.2.9（吹）',
    'F05': '旧キトK10、体質改善 2014.7.30（下）',
}
K221 = {
    'K03': '防犯カメラ設置、体質改善 2015.9.17（下）',
    'K04': '防犯カメラ設置、体質改善 2015.11.18（下）',
    'K05': '防犯カメラ設置、体質改善 2013.9.21（下）',
    'K06': '防犯カメラ設置、客室灯LED化、体質改善 2014.3.26（下）',
    'K07': '体質改善 2016.1.27（下）',
    'K08': '防犯カメラ設置、体質改善 2016.8.5（下）',
    'K09': '防犯カメラ設置、体質改善 2016.5.19（下）',
    'K10': 'F01編成のT1・M1を組み込み6両化、体質改善 2014.7.30（下）',
    'K12': '2パンタ化(2009年度・吹田)、防犯カメラ設置、体質改善 2012.12.27（吹）',
    'K13': '2パンタ化(2009年度・吹田)、防犯カメラ設置、体質改善 2013.7.26（下）',
    'K14': '2パンタ化(2009年度・吹田)、防犯カメラ設置、体質改善 2015.5.20（下）',
    'K15': '2パンタ化(2009年度・吹田)、防犯カメラ設置、体質改善 2015.2.6（下）',
    'K16': '2パンタ化(2009年度・吹田)、防犯カメラ設置、体質改善 2016.9.23（下）',
    'K17': '防犯カメラ設置、体質改善 2014.12.5（下）',
    'K18': '体質改善 2016.3.30（下）',
    'K21': '防犯カメラ設置、体質改善 2013.3.26（吹）',
}
added = []
for i, note in sorted(F221.items()):
    added.append({'g': 'KYOTO', 'b': GROUP_BASE['KYOTO'], 't': '221系',
                  'i': i, 'c': 6, 'n': '嵯峨野線・湖西線・草津線で使用、' + note})
for i, note in sorted(K221.items()):
    added.append({'g': 'KYOTO', 'b': GROUP_BASE['KYOTO'], 't': '221系',
                  'i': i, 'c': 4, 'n': '嵯峨野線・湖西線・草津線で使用、' + K221_NOTE + '、' + note})

# ---------------------------------------------------------------- 追加: 223系6000番台 京都支所
R6000 = [
    ('P01', 6, '全車221系性能、23年1月Wパンタ化、旧ホシJ13'),
    ('P02', 6, '全車221系性能、23年3月Wパンタ化、旧ホシJ14'),
    ('R01', 4, '全車221系性能、旧ホシV56'),
    ('R02', 4, '全車221系性能、森の京都QRトレイン、Mc貫通扉表示R002'),
    ('R03', 4, '全車221系性能、旧ホシV64'),
    ('R04', 4, '全車221系性能、旧ホシV55'),
    ('R05', 4, '全車221系性能、旧ホシV58'),
    ('R201', 4, '全車221系性能、旧ミハMA01'),
    ('R202', 4, '全車221系性能、旧ミハMA02'),
    ('R203', 4, '全車221系性能、旧ミハMA03'),
    ('R204', 4, '全車221系性能、旧ミハMA04'),
    ('R205', 4, '全車221系性能、旧ミハMA05'),
    ('R206', 4, '全車221系性能、旧ミハMA06'),
    ('R207', 4, '全車221系性能、旧ミハMA07'),
    ('R208', 4, '全車221系性能、旧ミハMA08'),
    ('R209', 4, '全車221系性能、旧ミハMA09'),
]
for i, c, note in R6000:
    added.append({'g': 'KYOTO', 'b': GROUP_BASE['KYOTO'], 't': '223系6000番台',
                  'i': i, 'c': c, 'n': note})

# 既存データと編成番号が衝突しないか確認 (グループ単位で一意であればよい)
seen = set()
for v in out + added:
    key = (v['g'], v['i'])
    if key in seen:
        print('!! 編成番号の重複: %s %s' % key)
    seen.add(key)

out.extend(added)
print('追加した編成: %d本 (221系 %d本 / 223系6000番台 %d本)'
      % (len(added), len(F221) + len(K221), len(R6000)))

# ---------------------------------------------------------------- 書き出し
lines = []
lines.append('/* 全編成(車両)データ。編成番号.xlsx から取り込んだもの。')
lines.append('')
lines.append('   g = 車両所グループ。運用の割り当て条件はこの値で判定する。')
for g, b in GROUP_BASE.items():
    lines.append('       %-8s %s' % (g, b))
lines.append('   t = 形式 / i = 編成番号 / c = 両数 / n = 備考')
lines.append('*/')
lines.append('const EXCEL_VEHICLES = [')
for v in out:
    lines.append('{g:"%s", b:"%s", t:"%s", i:"%s", c:%d, n:"%s"},'
                 % (v['g'], v['b'], v['t'], v['i'], v['c'], v['n']))
lines.append('];')
lines.append('')

# グループ別の集計をコメントで残す
lines.append('/* 集計')
for g in GROUP_BASE:
    sub = [v for v in out if v['g'] == g]
    if not sub:
        continue
    per_cars = {}
    for v in sub:
        per_cars.setdefault(v['c'], 0)
        per_cars[v['c']] += 1
    detail = ' '.join('%d両x%d本' % (c, per_cars[c]) for c in sorted(per_cars))
    lines.append('   %-8s %3d本 %5d両  (%s)' % (g, len(sub), sum(v['c'] for v in sub), detail))
lines.append('   合計     %3d本 %5d両' % (len(out), sum(v['c'] for v in out)))
lines.append('*/')

path = os.path.join(ROOT, 'js', '02-fleet-data.js')
open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('\n'.join(lines[-len(GROUP_BASE) - 3:]))
print('-> %s (%d bytes)' % (path, os.path.getsize(path)))
