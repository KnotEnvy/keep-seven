#!/usr/bin/env bash
# Kills runaway headless test browsers before they exhaust the machine's memory.
# Software-rendered Chromium grows by gigabytes over a long screenshot run; several at
# once have taken the whole machine down. Run this beside any multi-agent test session:
#   setsid nohup tools/mem-watchdog.sh >/dev/null 2>&1 &
# Stop it with:  pkill -f mem-watchdog.sh   (from a shell whose own command line does not contain that name)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIMIT_KB="${LIMIT_KB:-3670016}"   # 3.5 GiB resident per browser process
FLOOR_KB="${FLOOR_KB:-5242880}"   # keep at least 5 GiB available machine-wide
LOG="${LOG:-$ROOT/scratch/mem-watchdog.log}"
mkdir -p "$(dirname "$LOG")"
echo "$(date '+%F %T') watchdog started (limit ${LIMIT_KB} kB per browser, floor ${FLOOR_KB} kB available)" >> "$LOG"
while true; do
  ps -eo pid=,rss=,comm= | awk -v lim="$LIMIT_KB" '$3 ~ /^chrome-headless/ && $2 > lim {print $1, $2}' |
    while read -r pid rss; do
      kill -9 "$pid" 2>/dev/null && echo "$(date '+%F %T') killed browser $pid at $((rss / 1024)) MiB (over the per-process limit)" >> "$LOG"
    done
  avail="$(awk '/MemAvailable/ {print $2}' /proc/meminfo)"
  if [ "$avail" -lt "$FLOOR_KB" ]; then
    biggest="$(ps -eo pid=,rss=,comm= | awk '$3 ~ /^chrome-headless/ {print $1, $2}' | sort -k2 -n | tail -1)"
    if [ -n "$biggest" ]; then
      kill -9 "${biggest%% *}" 2>/dev/null && echo "$(date '+%F %T') killed browser ${biggest%% *} at $(( ${biggest##* } / 1024 )) MiB (only $((avail / 1024)) MiB available)" >> "$LOG"
    fi
  fi
  sleep 5
done
