#!/usr/bin/env bash
# Recreates .tools/ (Blender 4.5 LTS + unpacked system libs) and the Playwright browser.
# No root needed. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLENDER_VERSION="4.5.14"
mkdir -p "$ROOT/.tools"
if [ ! -x "$ROOT/.tools/blender/blender" ]; then
  curl -fL --retry 3 -o "$ROOT/.tools/blender.tar.xz" \
    "https://download.blender.org/release/Blender4.5/blender-${BLENDER_VERSION}-linux-x64.tar.xz"
  tar -xJf "$ROOT/.tools/blender.tar.xz" -C "$ROOT/.tools"
  rm "$ROOT/.tools/blender.tar.xz"
  mv "$ROOT/.tools/blender-${BLENDER_VERSION}-linux-x64" "$ROOT/.tools/blender"
fi
if [ ! -e "$ROOT/.tools/syslibs/usr/lib/x86_64-linux-gnu/libSM.so.6" ]; then
  TMP="$(mktemp -d)"
  (cd "$TMP" && apt-get download libsm6 libice6 libnss3 libnspr4 libasound2t64)
  mkdir -p "$ROOT/.tools/syslibs"
  for f in "$TMP"/*.deb; do dpkg-deb -x "$f" "$ROOT/.tools/syslibs"; done
  rm -rf "$TMP"
fi
(cd "$ROOT" && npm install && npx playwright install chromium)
"$ROOT/tools/blender.sh" --version | head -1
