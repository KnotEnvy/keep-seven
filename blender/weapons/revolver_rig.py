"""Where everything of weapon_revolver sits in its REST pose (= the idle pose), and its skeleton (helper module).

REST SPACE is the asset's space: camera space in Blender axes (camera at the origin looking down +Y, +Z up, +X right;
a game point (x, y, z) is Blender (x, -z, y)). The gun is authored in gun space (assize.py) and placed by GUN_M:
the muzzle at game (0.052, -0.034, -0.52), the bore 12 degrees inboard and 4 degrees up of the view axis, the gun canted
12 degrees (top toward the centre of the frame). See the note at MUZZLE (polish round 2; the first release followed
ART_BIBLE 8.3: muzzle (0.075, -0.070, -0.56), bore on the crosshair at 12 m, cant 30).
"""
import math
from mathutils import Vector, Matrix, Quaternion
import assize, hands, ammo

MM = 0.001
# Polish round 2 (the visual critic: "a thin wedge at 45 degrees, the glove larger than the gun"): the ART_BIBLE 8.3
# placement (muzzle (0.075, -0.070, -0.56), bore converging on the crosshair) shows the gun from straight behind, so
# nothing of it but the top strap is seen. The gun is now held nearer the eye and TURNED: the bore runs BORE_YAW degrees
# inboard and BORE_PITCH degrees up of the view axis, so the eye sees the left side of the barrel, the cylinder and the
# cocked hammer over the hand. Hits are resolved from the eye (code-player); the muzzle socket is only where the flash
# and the tracer start.
MUZZLE = Vector((0.052, 0.52, -0.034))        # Blender camera space
CAM_LOOK = Vector((0.0, 12.0, 0.0))
BORE_YAW, BORE_PITCH = 12.0, 4.0
CANT = math.radians(12.0)
GRIP_G = (3.78, -70.96, -110.04)              # gun mm: the grip centre (the pivot of every kick and roll)
EJECT_G = (39.46, -65.44, -38.3)


def bore_dir():
    y, p = math.radians(BORE_YAW), math.radians(BORE_PITCH)
    return Vector((-math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p))).normalized()


def gun_matrix():
    """Gun space (metres) -> rest space."""
    d = bore_dir()
    z0 = (Vector((0, 0, 1)) - d * d.z).normalized(); x0 = d.cross(z0)
    zg = z0 * math.cos(CANT) - x0 * math.sin(CANT); xg = d.cross(zg)
    M = Matrix(((xg.x, d.x, zg.x, 0.0), (xg.y, d.y, zg.y, 0.0), (xg.z, d.z, zg.z, 0.0), (0.0, 0.0, 0.0, 1.0)))
    o = MUZZLE - d * (assize.MUZZLE_Y * MM)
    M.translation = o
    return M


GUN_M = gun_matrix()
GRIP_CENTRE = GUN_M @ (Vector(GRIP_G) * MM)
EJECT = GUN_M @ (Vector(EJECT_G) * MM)


def g(p_mm):
    """A gun-space point in millimetres -> rest space (metres)."""
    return GUN_M @ (Vector(p_mm) * MM)


def gdir(v):
    return (GUN_M.to_3x3() @ Vector(v)).normalized()


# ------------------------------------------------------------------ the right hand, wrapped round the grip
RIGHT_CURLS = {"index": (-5.0, 30.0, 42.0, 58.0), "middle": (0.0, 42.0, 76.0, 56.0), "ring": (3.0, 44.0, 76.0, 56.0), "pinky": (8.0, 46.0, 74.0, 54.0)}
# Polish round 4 (both critics: "a tan tube", "a thumb stub"): the thumb lay straight along the frame. It now breaks at
# its knuckle and its end joint wraps down round the top of the grip toward the trigger, as a held gun is held.
RIGHT_THUMB_GUN = [(-6.0, -150.0, -38.0), (-17.5, -120.0, -26.0), (-21.5, -99.0, -30.0), (-18.5, -84.5, -44.0)]   # cmc, mcp, ip, tip (gun mm)
RIGHT_MID_MCP_GUN = (27.0, -104.0, -62.0)          # where the middle finger's knuckle sits: half-way along the right panel
RIGHT_PITCH, RIGHT_YAW = -24.0, 20.0
RIGHT_FOREARM_GUN = (0.10, -0.96, -0.26)           # wrist -> elbow, gun space


def right_hand_matrix():
    """Right-hand space (mm) -> gun space (mm). Thumb side up, fingers forward, the back of the hand to the right,
    pitched down along the grip and turned 20 degrees about the grip axis: the palm lies against the right-rear of
    the grip, the backstrap in the web, the forearm behind the gun."""
    B = Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 0, 1)))        # X_h -> -Z_g, Y_h -> +Y_g, Z_h -> +X_g
    Rm = Matrix.Rotation(math.radians(RIGHT_YAW), 4, assize.GRIP_AXIS) @ Matrix.Rotation(math.radians(RIGHT_PITCH), 4, 'X') @ B
    t = Vector(RIGHT_MID_MCP_GUN) - Rm @ Vector(hands.KNUCKLE["middle"])
    return Matrix.Translation(t) @ Rm


def right_hand():
    H = right_hand_matrix(); Hi = H.inverted()
    thumb = [tuple(Hi @ Vector(p)) for p in RIGHT_THUMB_GUN]
    M = GUN_M @ Matrix.Scale(MM, 4) @ H                                           # hand mm -> rest m
    # the forearm lies behind the gun, a little right and down of the bore: the wrist is cocked as a pistol grip cocks it
    fa = (H.inverted().to_3x3() @ Vector(RIGHT_FOREARM_GUN)).normalized()
    h = hands.Hand("r", RIGHT_CURLS, thumb, forearm=fa, forearm_up=(0, 0, 1))
    return h, M


# ------------------------------------------------------------------ the left hand, resting below the frame
# Polish round 3 (both critics: "the glove hides the cylinder"): the round was pinched ACROSS the fingers, so the hand
# had to lie beside the loading gate, between the eye and the gun. It is now a three-finger "beak" grip: the forefinger
# and middle finger straight-ish over the case, the thumb under it, the round lying ALONG the fingertips with its nose
# and half its case beyond them. The hand then comes up from below, behind the gate, and the cylinder stays in view.
LEFT_CURLS = {"index": (-4.0, 55.0, 20.0, 10.0), "middle": (0.0, 57.0, 22.0, 10.0), "ring": (5.0, 68.0, 52.0, 30.0), "pinky": (11.0, 74.0, 60.0, 34.0)}
LEFT_THUMB = [(-30.0, 38.0, -20.0), (-35.0, 60.0, -40.0), (-29.0, 80.0, -62.0), (-19.0, 96.0, -84.0)]      # right-hand layout (mirrored by Hand)
LEFT_WRIST = Vector((0.075, 0.20, -0.335))      # under the frame, RIGHT of the centre line: it rises into the right half for a reload (polish round 2)
LEFT_FINGERS = Vector((0.28, 0.90, 0.33)).normalized()
LEFT_BACK = Vector((0.72, 0.0, -0.62))         # palm up under the frame (polish round 2): every working pose is then within 140 degrees of twist of it, so the forearm's half-twist never passes 180 and flips
ROUND_HEAD_H = Vector((18.0, 108.0, -71.5))         # the pinched round's case head in LEFT hand space (mm; x already mirrored)
ROUND_AXIS_H = Vector((0.0, 0.21, -0.98)).normalized()   # along the two straight fingertips
LOOP_ANGLE = 235.0                                  # round the cuff from its back toward the thumb side: the side the eye sees while she loads
LOOP_D = 112.0                                      # the kept round's case head, mm up the forearm from the wrist; nose toward the hand


def left_hand_matrix():
    y = LEFT_FINGERS; z = (LEFT_BACK - y * LEFT_BACK.dot(y)).normalized(); x = y.cross(z)
    M = Matrix(((x.x, y.x, z.x, 0), (x.y, y.y, z.y, 0), (x.z, y.z, z.z, 0), (0, 0, 0, 1)))
    M.translation = LEFT_WRIST
    return M @ Matrix.Scale(MM, 4)


def left_hand():
    return hands.Hand("l", LEFT_CURLS, LEFT_THUMB, thumb_r=(16.5, 13.6, 11.6, 9.2), forearm=(0.0, -1.0, 0.0), forearm_up=(0, 0, 1), loop=True), left_hand_matrix()


def frame_from(origin, axis_y, hint_z):
    """A 4x4 with +Y along axis_y and +Z toward hint_z."""
    y = Vector(axis_y).normalized(); z = Vector(hint_z); z = (z - y * z.dot(y)).normalized(); x = y.cross(z)
    M = Matrix(((x.x, y.x, z.x, 0), (x.y, y.y, z.y, 0), (x.z, y.z, z.z, 0), (0, 0, 0, 1)))
    M.translation = Vector(origin)
    return M


def round_frames():
    """Rest frames (4x4, metres; +Y = nose) of the cartridges of the left arm: the three pinched rounds, the kept round
    in its loop, and the two band halves (see weapon_revolver.py)."""
    L = left_hand_matrix()
    head = L @ ROUND_HEAD_H; ax = (L.to_3x3() @ ROUND_AXIS_H).normalized()
    back = (L.to_3x3() @ Vector((0, 0, 1))).normalized()
    pinch = frame_from(head, ax, back)
    fa = (L.to_3x3() @ Vector((0, -1, 0))).normalized(); fu = back
    phi = math.radians(LOOP_ANGLE)
    u = Vector((math.sin(phi), 0.0, math.cos(phi)))                                   # hand space: from the back of the wrist toward the thumb side
    r = 1.0 / math.sqrt((u.z / 34.0) ** 2 + (u.x / 42.0) ** 2) + 7.0
    loop_head = L @ (Vector((0, -LOOP_D, 0)) + u * r)
    loop = frame_from(loop_head, -fa, (L.to_3x3() @ u).normalized())
    return {"pinch": pinch, "loop": loop}


def bone_table(rh, RM, lh, LM):
    """[(name, head, tail, parent)] of the 31 bones, rest space."""
    d = gdir((0, 1, 0)); xg = gdir((1, 0, 0))
    B = [("root", (0, 0, 0), (0, 0, 0.1), None),
         ("gun", GRIP_CENTRE, GRIP_CENTRE + d * 0.1, "root"),
         ("cylinder", g((0, assize.CYL_Y0, assize.CYL_Z)), g((0, assize.CYL_Y1, assize.CYL_Z)), "gun"),
         ("hammer", g((-6, assize.HAMMER_PIVOT[0], assize.HAMMER_PIVOT[1])), g((6, assize.HAMMER_PIVOT[0], assize.HAMMER_PIVOT[1])), "gun"),
         ("trigger", g((-6, assize.TRIGGER_PIVOT[0], assize.TRIGGER_PIVOT[1])), g((6, assize.TRIGGER_PIVOT[0], assize.TRIGGER_PIVOT[1])), "gun"),
         ("gate", g((assize.GATE_HINGE[0], -57.0, assize.GATE_HINGE[1])), g((assize.GATE_HINGE[0], -45.0, assize.GATE_HINGE[1])), "gun"),
         ("ejector", g((assize.EJ_C[0], 149.0, assize.EJ_C[1])), g((assize.EJ_C[0], 165.0, assize.EJ_C[1])), "gun")]
    for i in range(6):
        cx, cz = assize.chamber_centre(i)
        B.append((f"round_{i + 1}", g((cx, assize.CYL_Y0 - 1.6, cz)), g((cx, assize.CYL_Y0 + 18.0, cz)), "cylinder"))
    for h, M, s in ((rh, RM, "r"), (lh, LM, "l")):
        hb = h.bones()
        def P(v): return M @ v
        fingers = "grip_r" if s == "r" else "fingers_l"
        for n, parent in (("arm_" + s, "root"), ("hand_" + s, "arm_" + s), (f"thumb_{s}_1", "hand_" + s), (f"thumb_{s}_2", f"thumb_{s}_1"),
                          (f"index_{s}_1", "hand_" + s), (f"index_{s}_2", f"index_{s}_1"), (fingers, "hand_" + s)):
            a, b = hb[n]
            B.append((n, P(a), P(b), parent))
    fr = round_frames()
    for n in ("round_hand_lead", "round_hand_line", "round_hand_kept"):
        B.append((n, fr["pinch"].translation, fr["pinch"] @ Vector((0, 0.03, 0)), "hand_l"))
    B.append(("kept_loop", fr["loop"].translation, fr["loop"] @ Vector((0, 0.03, 0)), "arm_l"))
    return B
