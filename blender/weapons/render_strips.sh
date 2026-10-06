#!/bin/bash
# The evidence strips of art-weapons (not part of the build): one first-person Cycles strip per clip ->
# shots/art-weapons/weapon_revolver__<clip>.png, with the code-driven kept_loop shown / hidden as the game does it.
R=/home/knotz2/code/3dshooter; OUT=$R/shots/art-weapons; L=/tmp/claude-1000
GLB=${GLB:-$R/blender/export/weapons/weapon_revolver.glb}
declare -A F=([idle]="0,22,45,67,90" [sprint]="0,5,10,15,20" [draw]="0,3,6,10,15" [fire]="0,2,4,6,9,14" [dry_fire]="0,1,2,3,4" [reload_open]="0,3,5,7,10" [reload_round]="0,2,5,7,9" [reload_close]="0,2,4,6,9" [reload_fast_close]="0,1,3,4,6" [load_line]="0,4,7,9,11,13,16" [unload_line]="0,3,5,8,10" [load_kept]="0,12,19.5,27,36,45,54" [unload_kept]="0,2,4,6,9" [fire_kept]="0,4,10,20,36" [take_round]="0,9,13,19,23,27")
declare -A SC=([load_kept]="kept_loop:0@>=27" [take_round]="kept_loop:0@<25" [unload_kept]="kept_loop:0@<8" [fire_kept]="kept_loop:0")   # what code does to the loop
one() { c=$1; fr=${F[$c]}; n=$(echo $fr | tr ',' '\n' | wc -l); x=""; [ -n "${SC[$c]}" ] && x="--scale ${SC[$c]}"
  $R/tools/blender.sh -b --factory-startup --python-exit-code 1 -P $R/blender/weapons/fp_preview.py -- $OUT/weapon_revolver__$c.png --glb $GLB --clip $c --frames $fr --size ${SIZE:-480x270} --cols $n --samples ${SAMPLES:-24} --mood ${MOOD:-studio} $x > $L/strip_$c.log 2>&1 || $R/tools/blender.sh -b --factory-startup --python-exit-code 1 -P $R/blender/weapons/fp_preview.py -- $OUT/weapon_revolver__$c.png --glb $GLB --clip $c --frames $fr --size ${SIZE:-480x270} --cols $n --samples ${SAMPLES:-24} --mood ${MOOD:-studio} $x --device CPU > $L/strip_$c.log 2>&1; [ $? -eq 0 ] && echo "ok $c ($fr)" || { echo "FAIL $c"; tail -3 $L/strip_$c.log; }; }
for c in ${CLIPS:-idle sprint draw fire dry_fire reload_open reload_round reload_close reload_fast_close load_line unload_line load_kept unload_kept fire_kept take_round}; do
  one $c &
  while [ $(jobs -r | wc -l) -ge ${JOBS:-4} ]; do sleep 0.5; done
done; wait
