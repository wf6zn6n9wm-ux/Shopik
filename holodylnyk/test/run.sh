#!/bin/sh
# Прогін інтерфейсу в headless-браузері. Ключ і мережа не потрібні.
#
#   sh test/run.sh
#
# CHROME можна перевизначити:  CHROME=/path/to/chrome sh test/run.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
DIST="$ROOT/app/app.dist.html"

[ -f "$DIST" ] || { echo "спершу зберіть: python3 app/build.py"; exit 1; }

CHROME=${CHROME:-}
if [ -z "$CHROME" ]; then
  for c in chromium chromium-browser google-chrome chrome \
           /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then CHROME=$c; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "не знайдено chrome; вкажіть CHROME=..."; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fails=0

for suite in "$HERE"/app.js "$HERE"/scanner-live.js; do
  name=$(basename "$suite" .js)
  {
    printf '<!doctype html><html><head><meta charset="utf-8"></head><body>\n'
    cat "$DIST"
    printf '<pre id="R" style="position:fixed;left:-9999px"></pre>\n<script>\n'
    cat "$suite"
    printf '\n</script>\n</body></html>\n'
  } > "$TMP/page.html"

  "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --virtual-time-budget=15000 --dump-dom "file://$TMP/page.html" \
    > "$TMP/dom.html" 2>/dev/null

  python3 - "$TMP/dom.html" "$name" <<'PY' || fails=1
import html, re, sys
dom = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'<pre id="R"[^>]*>(.*?)</pre>', dom, re.S)
if not m:
    print(f'{sys.argv[2]}: результатів немає — сторінка не виконалась')
    raise SystemExit(1)
out = html.unescape(m.group(1)).strip().split('\n')
bad = [l for l in out if l.startswith(('FAIL', 'CRASH'))]
total = len([l for l in out if l.startswith(('PASS', 'FAIL'))])
print(f'{sys.argv[2]}: {total} перевірок, падінь {len(bad)}')
for b in bad:
    print('   ', b)
raise SystemExit(1 if bad else 0)
PY
done

exit $fails
