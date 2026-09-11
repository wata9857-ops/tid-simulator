# -*- coding: utf-8 -*-
"""分割前の index.html を git から取り出し、比較用の tools/baseline/original.js を作る。

    python tools/extract_baseline.py
    node tools/harness.js --orig tools/check_sim.js

分割前と分割後で生成本数などを比べたいときだけ使う。
"""
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 分割作業を入れる前の最後のコミット
COMMIT = os.environ.get('BASELINE_COMMIT', '8c20f7d')

src = subprocess.run(['git', 'show', '%s:index.html' % COMMIT],
                     capture_output=True, check=True).stdout.decode('utf-8')
js = src.split('<script>', 1)[1].rsplit('</script>', 1)[0]

os.makedirs('tools/baseline', exist_ok=True)
path = 'tools/baseline/original.js'
open(path, 'w', encoding='utf-8', newline='\n').write(js)
print('%s を作成しました (%d bytes, コミット %s)' % (path, len(js.encode('utf-8')), COMMIT))
