#!/bin/bash
# group.sh <preset> [extra preview.py args]  ->  shots/art-props-mech/<name>.png  (seam -> seam_objects, daylight -> daylight_set, ...)
set -e
ROOT=/home/knotz2/code/3dshooter
preset=$1; shift
case $preset in seam) name=seam_objects;; daylight) name=daylight_set;; proving) name=proving_set;; asking) name=asking_set;; esac
blend=$ROOT/scratch/art-props-mech/$name.blend
out=$($ROOT/tools/blender.sh -b --factory-startup --python-exit-code 1 -P $ROOT/tests/art_props/mech/tools/group.py -- $preset $blend 2>&1)
shots=$(echo "$out" | grep '^SHOTS' | sed 's/^SHOTS //')
echo "$out" | grep -E "EYE|Error|Traceback" || true
$ROOT/tools/blender.sh -b --factory-startup --python-exit-code 1 -P $ROOT/blender/tools/preview.py -- $blend $ROOT/shots/art-props-mech/$name.png --engine CYCLES --device CUDA --samples 48 --size 720 $shots "$@" 2>&1 | grep -E "PREVIEW|Error|Traceback"
