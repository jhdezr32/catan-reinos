#!/usr/bin/env python3
"""Regenera dist/worker.js a partir de src/. Ejecutar: python3 build.py"""
import json, os, re, subprocess, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
eng = open('src/engine.js', encoding='utf-8').read()
assert 'module.exports=' in eng, 'engine.js debe terminar con module.exports='
eng = eng.replace('module.exports=', 'const ENGINE=')
html = open('src/index.html', encoding='utf-8').read()
srv = open('src/server.js', encoding='utf-8').read()
os.makedirs('dist', exist_ok=True)
open('dist/worker.js', 'w', encoding='utf-8').write(eng + '\nconst HTML=' + json.dumps(html) + ';\n' + srv)
# comprobación de sintaxis del worker y del script del cliente
open('dist/.check.mjs', 'w').write(open('dist/worker.js', encoding='utf-8').read())
r = subprocess.run(['node', '--check', 'dist/.check.mjs'], capture_output=True, text=True)
os.remove('dist/.check.mjs')
if r.returncode: sys.exit('ERROR de sintaxis en dist/worker.js:\n' + r.stderr)
m = re.search(r'<script>(.*)</script>', html, re.S)
open('dist/.client.js', 'w').write(m.group(1))
r = subprocess.run(['node', '--check', 'dist/.client.js'], capture_output=True, text=True)
os.remove('dist/.client.js')
if r.returncode: sys.exit('ERROR de sintaxis en el script del cliente:\n' + r.stderr)
print('OK: dist/worker.js generado (%d bytes) y sintaxis verificada' % os.path.getsize('dist/worker.js'))
