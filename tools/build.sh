#!/usr/bin/env bash
# Package src/ into dist/zen-tree-tabs-with-folders-<version>.xpi
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$ROOT/src/manifest.json")"
SINE_VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$ROOT/theme.json")"
if [[ "$VERSION" != "$SINE_VERSION" ]]; then
  echo "version mismatch: src/manifest.json=$VERSION theme.json=$SINE_VERSION" >&2
  exit 1
fi
OUT="$ROOT/dist/zen-tree-tabs-with-folders-$VERSION.xpi"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
(cd "$ROOT/src" && zip -qr -X "$OUT" .)
echo "$OUT"
