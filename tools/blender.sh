#!/usr/bin/env bash
# Runs the project-local Blender 4.5 LTS with the locally unpacked system libs
# (libSM/libICE are not installed system-wide and there is no sudo here).
# Usage: tools/blender.sh -b --factory-startup -P blender/some_script.py -- args...
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$ROOT/.tools/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
exec "$ROOT/.tools/blender/blender" "$@"
