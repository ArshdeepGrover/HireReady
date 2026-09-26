#!/usr/bin/env bash
#
# End-to-end verification in a real browser.
#
# The engine has unit coverage via `npm test`, but the parts that can only break
# in a browser -- module loading, the pdf.js worker, DOM rendering -- need an
# actual browser. This drives headless Chrome against the dev server and asserts
# on the rendered DOM.
#
# Usage: npm run verify
set -uo pipefail

cd "$(dirname "$0")/.."

PORT=5199
TMP=.tmp/verify
FIXTURES=public/__fixtures
FAILURES=0

CHROME="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  for candidate in \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then CHROME="$candidate"; break; fi
  done
fi
if [ ! -x "$CHROME" ]; then
  echo "Could not find Chrome. Set CHROME_PATH to its binary." >&2
  exit 1
fi

mkdir -p "$TMP"

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$FIXTURES"
}
trap cleanup EXIT

echo "Generating PDF fixtures"
node scripts/make-test-pdfs.mjs "$FIXTURES" || exit 1

echo "Starting dev server"
# Bound explicitly to 127.0.0.1: left to itself Vite may listen on IPv6 only,
# and every curl and Chrome call below uses the IPv4 loopback.
npx vite --port "$PORT" --strictPort --host 127.0.0.1 > "$TMP/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null -m 2 "http://127.0.0.1:$PORT/index.html"; then break; fi
  sleep 0.5
done
if ! curl -fsS -o /dev/null -m 2 "http://127.0.0.1:$PORT/index.html"; then
  echo "Dev server never came up. Log:" >&2
  cat "$TMP/server.log" >&2
  exit 1
fi

render() {
  # $1 = path, $2 = output file
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --virtual-time-budget="${3:-12000}" \
    --dump-dom "http://127.0.0.1:$PORT$1" 2>/dev/null > "$2"
}

expect() {
  # $1 = description, $2 = file, $3 = grep pattern
  if grep -qE -- "$3" "$2"; then
    printf '  ok    %s\n' "$1"
  else
    printf '  FAIL  %s\n' "$1"
    FAILURES=$((FAILURES + 1))
  fi
}

reject() {
  if grep -qE -- "$3" "$2"; then
    printf '  FAIL  %s\n' "$1"
    FAILURES=$((FAILURES + 1))
  else
    printf '  ok    %s\n' "$1"
  fi
}

echo
echo "Landing page"
render /index.html "$TMP/landing.html"
expect "headline rendered"        "$TMP/landing.html" 'parsed before it is read|hero__title'
expect "theme toggle present"     "$TMP/landing.html" 'data-theme-toggle'
expect "footer year filled in"    "$TMP/landing.html" 'data-year="">20[0-9]{2}'
expect "structured data present"  "$TMP/landing.html" 'application/ld\+json'
reject "no unresolved template"   "$TMP/landing.html" '\{\{|__VITE'

echo
echo "Analyser page"
render /resume-score.html "$TMP/app.html"
expect "report is visible"        "$TMP/app.html" '<div data-report=""'
expect "score rendered"           "$TMP/app.html" 'data-score="">[0-9]+'
expect "band rendered"            "$TMP/app.html" 'data-band="">[A-Za-z]'
expect "six category bars"        "$TMP/app.html" 'category__name'
expect "checks rendered"          "$TMP/app.html" 'class="check" data-state='
expect "actions rendered"         "$TMP/app.html" 'class="action" data-state='
expect "check groups rendered"    "$TMP/app.html" 'class="check-group"'
expect "check groups collapsible" "$TMP/app.html" '<details class="check-group"'
expect "filter chips rendered"    "$TMP/app.html" 'class="chip" type="button" data-filter='
expect "actions link to checks"   "$TMP/app.html" 'data-jump='
reject "no boot error shown"      "$TMP/app.html" 'Something went wrong starting'

echo
echo "Privacy page"
render /privacy.html "$TMP/privacy.html"
expect "privacy copy rendered"    "$TMP/privacy.html" 'Nothing leaves your browser'
expect "session storage note"     "$TMP/privacy.html" 'sessionStorage'

echo
echo "PDF parser (real pdf.js in a real browser)"
render /tests/pdf-harness.html "$TMP/pdf.html" 30000
python3 - "$TMP/pdf.html" <<'PY'
import html, re, sys

doc = open(sys.argv[1], encoding='utf-8').read()
match = re.search(r'<pre id="out">(.*?)</pre>', doc, re.S)
if not match:
    print('  FAIL  harness produced no output')
    sys.exit(1)

out = html.unescape(match.group(1))
print('\n'.join('        ' + line for line in out.splitlines() if line.strip()))

failures = 0
def check(label, ok, detail=''):
    global failures
    if ok:
        print(f'  ok    {label}')
    else:
        failures += 1
        print(f'  FAIL  {label} {detail}')

blocks = {}
current = None
for line in out.splitlines():
    if line.startswith('### '):
        current = line[4:].strip()
        blocks[current] = []
    elif current:
        blocks[current].append(line)
blocks = {k: '\n'.join(v) for k, v in blocks.items()}

check('harness completed', 'DONE' in out)
check('no parser exceptions', 'ERROR:' not in out, out[:200])

single = blocks.get('single-column.pdf', '')
check('single column: text extracted', 'density=' in single and int(re.search(r'density=(\d+)', single).group(1)) > 900)
check('single column: reading order passes', 'parse.order=pass' in single)
check('single column: not flagged multi-column', 'multiColumn=false' in single)
check('single column: name is first line', 'FIRST_LINES>>> Priya Nair' in single)
check('single column: scores well', int(re.search(r'score=(\d+)', single).group(1)) >= 70,
      f"got {re.search(r'score=(\\d+)', single).group(1)}")
check('single column: bullets detected', int(re.search(r'bullets=(\d+)', single).group(1)) >= 6)

two = blocks.get('two-column.pdf', '')
check('two column: detected as multi-column', 'multiColumn=true' in two)
check('two column: reading order fails', 'parse.order=fail' in two)

none = blocks.get('no-text.pdf', '')
check('empty pdf: flagged as unreadable', 'parse.text=fail' in none)
check('empty pdf: reported image-only page', 'imageOnlyPages=[1]' in none)

sys.exit(1 if failures else 0)
PY
if [ $? -ne 0 ]; then FAILURES=$((FAILURES + 1)); fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All browser checks passed."
else
  echo "$FAILURES browser check group(s) failed."
fi
exit "$FAILURES"
