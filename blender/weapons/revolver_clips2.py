"""The special-round clips of weapon_revolver: load_line, unload_line, load_kept, unload_kept, fire_kept, take_round
(helper of revolver_anim.py; same control language, see its docstring).

load_kept, the centrepiece (1.8 s, slow because she has never done it):
   0 - 0.4 s  the left forearm comes up into frame, the back of the cuff (the loop, band outward) toward the eye; the gun
              hand comes over and its thumb leaves the hammer for the cuff
   0.4 - 0.9  the right thumb presses on the band; it cracks (0.53 s) and the two halves fall away out of frame
   0.9        hand-off: kept_loop is hidden by code; the left fingers hold the round (round_hand_kept)
   0.9 - 1.2  the left hand turns palm-up and holds it one beat in the light
   1.2 - 1.8  gate open, the cylinder brings the chamber under the hammer to the gate, she seats it, turns it back
              under the hammer, gate shut, the gun settles to the firing pose
"""
import math
from mathutils import Vector, Matrix, Quaternion
import assize, revolver_rig as R
from revolver_anim import DEFAULTS
from revolver_anim import Clip, T, frame, port_frame, cam_frame, spur_target, ELBOW_L, ELBOW_R, SEAT_BACK, DIP_OFF

GATE_OPEN = 98.0
RL = {}
ZERO = {"g_pos": Vector((0, 0, 0)), "g_pitch": 0.0, "g_roll": 0.0, "g_yaw": 0.0}
THUMB_REST = Vector(R.RIGHT_THUMB_GUN[3])
THUMB_LOAD = Vector((-8.0, -64.0, 6.0))
G = 9.8


CUFF_WRIST = (0.092, 0.50, 0.090)        # the left wrist with the cuff turned up to the eye (camera space)
CUFF_FINGERS = (-0.22, 0.45, 0.87)
LOOP_FACES = (0.42, -0.91, 0.0)          # the loop on the cuff looks at the eye and half to the right, where the gun hand waits
MEET_BORE = (0.10, 0.50, 0.86)           # the gun beside the cuff and a little behind it: muzzle up and away, its LEFT side to the eye
MEET_RIGHT = (0.75, 0.65, 0.0)
MEET_OFF = (0.019, 0.008, 0.0)           # where the resting tip of the gun hand's thumb hangs, from the band
TURN_AT = (0.095, 0.37, 0.0)
HELD_AT = (0.056, 0.34, 0.012)           # the case head of the round held up in the light
KEPT_SHOW = (0.050, 0.29, 0.016)        # polish round 4: the case head of the kept round while it is shown (camera space): 5 cm nearer the eye than round 3 held it
KX, KY = 0.135, 0.075   # (KY: and further from the eye, so hand and cuff stay under a fifth of the frame)
# polish round 2: the cuff-up poses of load_kept / take_round moved right with the left arm (it now rises from below, right of centre)


def meet_pose(rig, poser, cuff_up):
    """The gun hand brought over to the turned-up left cuff (`cuff_up`: the left hand's pinch frame with the cuff shown).
    The muzzle dips down and inboard, so the gun passes BEHIND the sleeve instead of lying across the cuff, and the gun
    is PLACED so that the resting tip of the right thumb hangs 2 cm short of the band of the round in the loop: the
    thumb only has to lean onto it, in plain view."""
    from revolver_anim import gun_pos_for
    pitch, yaw, roll = -28.0, 4.0, -30.0
    Wa = poser.arm_W("arm_l", "hand_l", cuff_up @ rig.pinch.inverted(), Vector((0, 0, 0)))
    band = Wa @ rig.loop @ Vector((0.0, 0.017, 0.0105))
    g = gun_pos_for(rig, R.RIGHT_THUMB_GUN[3], band + Vector((0.016, -0.004, -0.016)), pitch, yaw, roll)
    return {"g_pos": g, "g_pitch": pitch, "g_roll": roll, "g_yaw": yaw}


def hand_pinch(rig, wrist, fingers, back):
    """The pinch frame of the left hand when its wrist is at `wrist`, fingers toward `fingers`, back of the hand toward
    `back` (camera space)."""
    L = R.left_hand_matrix()
    L0 = L.copy(); L0.col[0].xyz = L0.col[0].xyz.normalized(); L0.col[1].xyz = L0.col[1].xyz.normalized(); L0.col[2].xyz = L0.col[2].xyz.normalized()
    H = frame(Vector(wrist), Vector(fingers), Vector(back))
    Hx = H.copy()                                     # frame_from gives X = Y x Z: the left hand's X is its thumb side (mirrored)
    return Hx @ L0.inverted() @ rig.pinch


def hand_showing_loop(rig, wrist, fingers, elbow=Vector((0, 0, 0)), want=1.0, prefer=None):
    """hand_pinch() with the roll about the fingers chosen so the kept round's loop on the cuff faces the eye (want=1)
    as squarely as it can, or (prefer: a camera-space direction) so that the loop's outward normal lies along it."""
    from revolver_anim import Poser
    P = Poser(rig); f = Vector(fingers).normalized()
    ref = Vector((0, -1, 0)); ref = (ref - f * ref.dot(f)).normalized()
    best = None
    for k in range(144):
        back = Matrix.Rotation(math.radians(2.5 * k), 3, f) @ ref
        pin = hand_pinch(rig, wrist, f, back)
        Wl = pin @ rig.pinch.inverted()
        Wa = P.arm_W("arm_l", "hand_l", Wl, elbow)
        L = Wa @ rig.loop; p = L.translation
        nrm = (L.to_3x3() @ Vector((0, 0, 1))).normalized()
        sc = nrm.dot(Vector(prefer).normalized()) if prefer is not None else -abs(nrm.dot(-p.normalized()) - want)
        if best is None or sc > best[0]: best = (sc, pin)
    return best[1]


def to_reload(c, f0, f1, over=True):
    for k, v in RL.items():
        z = ZERO[k]
        if over and not isinstance(v, Vector): c.k(k, [(0, z), (f0, z, "hold"), (f1 - 2, v * 1.06, "out"), (f1, v, "io")] + ([(c.n, v)] if f1 < c.n else []))
        else: c.k(k, [(0, z), (f0, z, "hold"), (f1, v, "out")] + ([(c.n, v)] if f1 < c.n else []))


def gun_there_and_back(c, pose, f_in, f_hold, f_out, f_end):
    """The gun goes to `pose` and comes back, each way with an ease IN and an ease OUT (one frame of anticipation, the
    travel spread over the middle frames, a small overshoot and a one-frame settle on idle): the short utility clips
    whipped the gun 90 mm and 46 degrees in their first frame."""
    for k, v in pose.items():
        z = ZERO[k]; ov = (Vector((0, 0.0012, -0.0018)) if isinstance(v, Vector) else -v * 0.025)
        c.k(k, [(0, z), (f_in, z, "hold"), (f_hold, v, "io"), (f_out, v, "hold"), (f_end - 1, ov, "io"), (f_end, z, "io")])


def part_pose(k):
    """The loading pose taken only part of the way (the quick gate clips do not need the full roll)."""
    return {n: v * k for n, v in RL.items()}


def keys_reload_to_idle(c, extra_before, f0, f1):
    """Append to the gun tracks: hold the reload pose until f0, roll back to idle by f1 (overshoot, settle)."""
    for k, v in RL.items():
        z = ZERO[k]; ov = (Vector((0, 0.002, -0.003)) if isinstance(v, Vector) else -v * 0.04)
        fo = f1 - 2 if f1 - f0 >= 5 else f1 - 1                    # the roll back takes three frames at least: never the whole way in one
        c.tracks[k] = [kk for kk in c.tracks.get(k, []) if kk[0] < f0] + [(float(f0), v, "hold"), (float(fo), ov, "out"), (float(f1), z, "io")]


def half_frame(rig, W, side, crack, fall_t, tumble):
    """World frame of a band half on the kept round in the cuff loop: X = the round's axis, Y = out of the cuff (toward
    the eye), the half bulging to `side`. crack: 0..1 opening; fall_t: seconds since it let go."""
    L = W["arm_l"] @ rig.loop
    ax = (L.to_3x3() @ Vector((0, 1, 0))).normalized(); out = (L.to_3x3() @ Vector((0, 0, 1))).normalized()
    c = L @ Vector((0.0, 0.0165, 0.0))
    s = ax.cross(out).normalized() * side
    F = Matrix.Identity(4)
    F.col[0].xyz = ax; F.col[1].xyz = out; F.col[2].xyz = ax.cross(out)
    F.translation = c
    open_ = Matrix.Rotation(math.radians(14.0 * crack * side), 4, ax)
    move = s * (0.0015 * crack + 0.25 * fall_t) + out * (0.001 * crack + 0.15 * fall_t) + Vector((0, 0, 0.30 * fall_t - 0.5 * G * fall_t * fall_t))
    spin = Matrix.Rotation(math.radians(tumble), 4, (ax + s * 0.6).normalized())
    M = T(move) @ T(c) @ spin @ open_ @ T(-c) @ F
    return M


def half_on_round(rig, W, side, c):
    """A band half on round_hand_kept (the band whole again: take_round), wherever the clip has the round."""
    Pn = c["keptF"] if isinstance(c.get("keptF"), Matrix) else W["hand_l"] @ rig.pinch
    ax = (Pn.to_3x3() @ Vector((0, 1, 0))).normalized()
    eye = -Pn.translation.normalized()
    out = (eye - ax * eye.dot(ax)).normalized()
    F = Matrix.Identity(4)
    F.col[0].xyz = ax; F.col[1].xyz = out; F.col[2].xyz = ax.cross(out)
    F.translation = Pn @ Vector((0.0, 0.0165, 0.0))
    return F


def clips(rig, poser):
    from revolver_anim import reload_pose
    RL.update(reload_pose(rig))
    out = []
    from revolver_anim import Poser, DEFAULTS
    Wrl = Poser(rig).gun_W(dict(DEFAULTS, **RL))
    PORT0 = port_frame(rig, 0.0, Wg=Wrl); PORT_IN = port_frame(rig, 28.0, Wg=Wrl); PORT_OUT = port_frame(rig, 52.0, Wg=Wrl)
    BELOW = rig.pinch.copy()                           # the left hand's REST place, under the frame: every clip leaves from it and returns to it (no pop against idle)
    PORT_SEAT = port_frame(rig, SEAT_BACK, Wg=Wrl); PUSH = SEAT_BACK * 0.001
    PALM = port_frame(rig, 85.0, Wg=Wrl) @ T(DIP_OFF)
    Z3 = Vector((0, 0, 0))

    # load_line: gate open, the chamber under the hammer comes to the gate, its round thumbed out into the palm, the
    # line round (aqua ring) seated, the cylinder back under the hammer, gate shut
    c = Clip("load_line"); n = c.n
    gun_there_and_back(c, part_pose(0.6), 0, 5, 11.5, n)
    c.k("gate", [(0, 0.0), (2, 0.0, "hold"), (4, GATE_OPEN + 6, "out3"), (5, GATE_OPEN, "io"), (12, GATE_OPEN, "hold"), (14, -2.0, "out3"), (15, 0.0, "io"), (n, 0.0)])
    c.k("thumb", [(0, THUMB_REST), (2, Vector((13.5, -52.0, 4.0)), "out"), (4, Vector((19.0, -50.0, -6.0)), "out"), (6, THUMB_LOAD, "io"),
                  (12, THUMB_LOAD, "hold"), (13, Vector((20.0, -50.0, -2.0)), "out"), (14, Vector((12.0, -54.0, 9.0)), "out3"), (n, THUMB_REST, "io")])
    c.k("hammer", [(0, 0.0), (2, -20.0, "out"), (12, -20.0, "hold"), (15, 2.0, "out"), (n, 0.0, "io")])
    c.k("cyl", [(0, 0.0), (3, 0.0, "hold"), (5, 60.0, "out"), (12, 60.0, "hold"), (14, 0.0, "out"), (n, 0.0)])
    c.k("lhc", [(0, BELOW), (n, BELOW)])
    # the lead round under the hammer is drawn out (6-8) and dropped below the frame; the line round goes in (9-12)
    c.k("lhg", [(0, PORT_SEAT), (5, PORT_SEAT, "hold"), (6, PORT_SEAT, "hold"), (8, PALM, "io"), (9, PORT_OUT, "io"), (10, PORT_IN, "out"), (11, PORT_SEAT, "out"), (12, PORT_SEAT, "hold"), (n, PORT_OUT, "io")])
    c.k("lhw", [(0, 0.0), (5, 1.0, "io"), (12, 1.0, "hold"), (n, 0.0, "io")])
    c.k("push", [(0, PUSH), (6, PUSH, "hold"), (7, 0.0, "io"), (10, 0.0, "hold"), (12, PUSH, "out3"), (n, PUSH)])
    c.k("lead", [(0, 0.0), (5, 0.0, "hold"), (6, 1.0, "step"), (8, 1.0, "hold"), (9, 0.0, "step"), (n, 0.0)])
    c.k("line", [(0, 0.0), (8, 0.0, "hold"), (9, 1.0, "step"), (12, 1.0, "hold"), (13, 0.0, "step"), (n, 0.0)])
    c.k("lthumb", [(0, 0.0), (10, 0.0, "hold"), (12, 14.0, "out"), (14, 0.0, "io"), (n, 0.0)])
    c.k("elbow_l", [(0, Z3), (5, ELBOW_L, "soft"), (12, ELBOW_L, "hold"), (n, Z3, "soft")])
    c.k("elbow_r", [(0, Z3), (5, ELBOW_R * 0.6, "soft"), (12, ELBOW_R * 0.6, "hold"), (n, Z3, "soft")])
    out.append(c)

    # unload_line: the reverse, quicker
    c = Clip("unload_line"); n = c.n
    gun_there_and_back(c, part_pose(0.5), 0, 4, 6, n)
    c.k("gate", [(0, 0.0), (1, 0.0, "hold"), (3, GATE_OPEN, "out3"), (6, GATE_OPEN, "hold"), (8, -1.5, "out3"), (9, 0.0, "io"), (n, 0.0)])
    c.k("thumb", [(0, THUMB_REST), (1, Vector((13.5, -52.0, 4.0)), "out"), (3, Vector((19.0, -50.0, -6.0)), "out"), (6, Vector((20.0, -50.0, -2.0)), "io"),
                  (8, Vector((12.0, -54.0, 9.0)), "out3"), (n, THUMB_REST, "io")])
    c.k("hammer", [(0, 0.0), (1, -20.0, "out"), (6, -20.0, "hold"), (8, 2.0, "out"), (n, 0.0, "io")])
    c.k("cyl", [(0, 0.0), (2, 0.0, "hold"), (4, 60.0, "out"), (6, 60.0, "hold"), (8, 0.0, "out"), (n, 0.0)])
    c.k("lhc", [(0, BELOW), (n, BELOW)])
    c.k("lhg", [(0, PORT_SEAT), (4, PORT_SEAT, "hold"), (6, PORT_OUT, "io"), (8, PALM, "io"), (n, PALM)])
    c.k("lhw", [(0, 0.0), (4, 1.0, "lin"), (6, 1.0, "hold"), (n, 0.0, "soft")])
    c.k("push", [(0, PUSH), (4, PUSH, "hold"), (5, 0.0, "io"), (n, 0.0)])
    c.k("line", [(0, 0.0), (3, 0.0, "hold"), (4, 1.0, "step"), (8, 1.0, "hold"), (9, 0.0, "step"), (n, 0.0)])
    c.k("elbow_l", [(0, Z3), (4, ELBOW_L, "lin"), (6, ELBOW_L, "hold"), (n, Z3, "soft")])
    c.k("elbow_r", [(0, Z3), (4, ELBOW_R * 0.5, "soft"), (6, ELBOW_R * 0.5, "hold"), (n, Z3, "soft")])
    out.append(c)

    # load_kept: the centrepiece (polish round 3: re-staged so nothing crosses anything).
    #   0-9    the left forearm comes straight up out of the bottom edge, the back of the cuff to the eye: the kept round
    #          in its loop, band whole, in the middle of the picture. The gun hand swings out to the RIGHT of the cuff,
    #          muzzle up and away: gun and cuff stand side by side.
    #   9-14   the band is seen whole; the gun hand's thumb comes across onto it
    #   15-27  the thumb presses, the band cracks (0.53 s), the halves fall away
    #   27     hand-off (code hides kept_loop): the thumb pushes the round up out of the loop into the left fingers
    #   30-38  THE BEAT: the left hand turns palm-up and holds the bare round standing on its fingertips, nose up, alone
    #          against the room, while the gun turns its gate to the eye
    #   38-46  the round goes in at the gate, in view; 46-54 gate shut, the gun settles to the firing pose
    from revolver_anim import pose_for, elbow_for, Poser as _P
    c = Clip("load_kept"); n = c.n
    wl0 = rig.head["hand_l"]; wr0 = rig.head["hand_r"]
    FA = Vector((0.02, -0.30, -0.95))                                  # wrist -> elbow with the cuff shown
    def cuff(wrist, fingers):
        sh = elbow_for(rig, "l", wrist, FA)
        return hand_showing_loop(rig, wrist, fingers, elbow=sh, prefer=LOOP_FACES), sh
    up, sh_up = cuff(CUFF_WRIST, CUFF_FINGERS)
    up2, sh_up2 = cuff(Vector(CUFF_WRIST) + Vector((0.003, -0.012, 0.004)), Vector(CUFF_FINGERS) + Vector((0.03, 0.0, 0.0)))
    Wa = poser.arm_W("arm_l", "hand_l", up @ rig.pinch.inverted(), sh_up)
    band_at = Wa @ rig.loop @ Vector((0.0, 0.017, 0.0105))
    print("KEPT band at", tuple(round(x, 3) for x in band_at), "screen %.3f %.3f" % (0.5 + band_at.x / band_at.y / 1.734, 0.5 + band_at.z / band_at.y / 0.9754))
    MEET = pose_for(rig, MEET_BORE, MEET_RIGHT, R.RIGHT_THUMB_GUN[3], band_at + Vector(MEET_OFF))
    Wm = _P(rig).gun_W(dict(DEFAULTS, **MEET))
    ER_MEET = elbow_for(rig, "r", Wm @ wr0, (0.45, -0.40, -0.80))
    print("MEET POSE pitch %.1f yaw %.1f roll %.1f" % (MEET["g_pitch"], MEET["g_yaw"], MEET["g_roll"]), "RL", {k: (round(v, 1) if not isinstance(v, Vector) else None) for k, v in RL.items()})
    # ---- polish round 4 (both critics: "a dark forearm column held in one pose for 1.2 s; the round a few pixels at the
    # cuff; the cylinder turned away"). The clip is re-staged on the ordinary reload's framing; its length and name stand.
    #   0-10   the gun turns its loading gate to the eye (the reload pose); the left hand comes up from the bottom edge
    #          with the kept round already in its fingers, band whole (the cuff and its loop stay under the frame: code
    #          hides kept_loop at 0.9 s as before, unseen)
    #   9-16   the round is shown, large, in front of the frame and the cylinder; it turns a little in the light
    #   15-18  the left thumb bears down on the band; it cracks on frame 17 (0.57 s) and the two halves fall away
    #   18-25  the bare round turns nose-up to the gate while the gun hand's thumb has flicked the gate open (11-15) and
    #          the cylinder brings the chamber under the hammer round to it (21-26)
    #   27-38  the hand turns the round over to the gate; it goes in in plain view: lined up (30), nose in (32), fingertips at the frame (35),
    #          thumbed home (38)
    #   38-47  the hand drops away, the cylinder turns the round back under the hammer, the gate is shut
    #   47-54  the gun rolls back to the firing pose
    # Nothing holds still for more than seven frames (0.23 s; 0.47 s in the hush's half speed).
    # the round between thumb and two fingers, seen from the thumb side, in profile: nose up and to the right (toward the gun)
    HELD_A = cam_frame(KEPT_SHOW, (0.62, 0.10, 0.78), (-0.78, 0.10, 0.62))
    HELD_B = cam_frame(Vector(KEPT_SHOW) + Vector((0.004, -0.008, 0.004)), (0.74, 0.04, 0.67), (-0.67, 0.10, 0.74))
    HELD_J = cam_frame(Vector(KEPT_SHOW) + Vector((0.004, -0.008, -0.001)), (0.74, 0.04, 0.67), (-0.67, 0.10, 0.74))      # the jolt as the band gives
    HELD_C = cam_frame(Vector(KEPT_SHOW) + Vector((0.010, -0.004, 0.014)), (0.56, 0.14, 0.82), (-0.82, 0.10, 0.56))
    # on the way to the gate the hand turns the round over THROUGH palm-to-the-eye (the short way round would wind the
    # forearm through 180 degrees and flip its half-twist)
    turn = cam_frame(TURN_AT, (0.05, -0.55, 0.80), (-0.15, 0.70, 0.70))
    sh_turn = elbow_for(rig, "l", (turn @ rig.pinch.inverted()) @ wl0, (0.02, -0.10, -0.99))
    sh_held = elbow_for(rig, "l", (HELD_A @ rig.pinch.inverted()) @ wl0, (0.04, -0.30, -0.95))
    for k, v in RL.items():
        z = ZERO[k]; ov = (Vector((0, 0.0012, -0.0018)) if isinstance(v, Vector) else -v * 0.025)
        c.k(k, [(0, z), (8, v * 1.04 if not isinstance(v, Vector) else v, "soft"), (10, v, "io"), (47, v, "hold"), (n - 1, ov, "io"), (n, z, "io")])
    c.k("lhc", [(0, BELOW), (9, HELD_A, "out"), (16, HELD_B, "io"), (17, HELD_J, "out"), (23, HELD_C, "io"), (27, turn, "soft"), (31, turn, "hold"), (32, BELOW, "step"), (n, BELOW)])
    c.k("lhg", [(0, PORT_OUT), (30, PORT_OUT, "hold"), (32.5, PORT_IN, "out"), (35, PORT_SEAT, "out"), (38, PORT_SEAT, "hold"), (43, PALM, "io"), (n, PALM)])
    c.k("lhw", [(0, 0.0), (27, 0.0, "hold"), (30, 1.0, "soft"), (43, 1.0, "hold"), (51, 0.0, "io"), (n, 0.0)])
    c.k("elbow_l", [(0, Z3), (9, sh_held, "out"), (23, sh_held, "hold"), (27, sh_turn, "soft"), (30, ELBOW_L, "soft"), (43, ELBOW_L, "hold"), (51, Z3, "io"), (n, Z3)])
    c.k("elbow_r", [(0, Z3), (10, ELBOW_R, "soft"), (47, ELBOW_R, "hold"), (n, Z3, "io")])
    c.k("lthumb", [(0, 0.0), (14, 0.0, "hold"), (17, 16.0, "in"), (20, 0.0, "io"), (35, 0.0, "hold"), (38, 14.0, "out"), (40, 0.0, "io"), (n, 0.0)])
    c.k("lidx", [(0, 0.0), (37, 0.0, "hold"), (38, -10.0, "out"), (41, 0.0, "io"), (n, 0.0)]); c.k("lcurl", [(0, 0.0), (37, 0.0, "hold"), (38, -10.0, "out"), (41, 0.0, "io"), (n, 0.0)])
    c.k("push", [(0, 0.0), (35, 0.0, "hold"), (38, PUSH, "out3"), (n, PUSH)])
    c.k("kept", [(0, 0.0), (1, 1.0, "step"), (38, 1.0, "hold"), (39, 0.0, "step"), (n, 0.0)])
    c.k("thumb", [(0, THUMB_REST), (9, THUMB_REST, "hold"), (11, Vector((13.5, -52.0, 4.0)), "out"), (13, Vector((19.0, -50.0, -6.0)), "out"), (16, THUMB_LOAD, "io"),
                  (44, THUMB_LOAD, "hold"), (45, Vector((20.0, -50.0, -2.0)), "out"), (47, Vector((12.0, -54.0, 9.0)), "out3"), (n, THUMB_REST, "io")])
    c.k("gate", [(0, 0.0), (11, 0.0, "hold"), (13, GATE_OPEN + 6, "out3"), (15, GATE_OPEN, "io"), (45, GATE_OPEN, "hold"), (47, -2.0, "out3"), (48, 0.0, "io"), (n, 0.0)])
    c.k("hammer", [(0, 0.0), (9, 0.0, "hold"), (11, -20.0, "out"), (46, -20.0, "hold"), (50, 2.0, "out"), (n, 0.0, "io")])
    c.k("cyl", [(0, 0.0), (21, 0.0, "hold"), (26, 60.0, "io"), (40, 60.0, "hold"), (45, 0.0, "io"), (n, 0.0)])
    # the band: whole on the round in the fingers, cracked under the thumb on frame 17, the halves fall out of the frame
    def band_on_round(side):
        def at(tf):
            crack = min(1.0, max(0.0, (tf - 16.0) / 1.5)); ft = max(0.0, (tf - 17.5) / 30.0); tum = min(70.0, 10.0 * max(0.0, tf - 17.5))
            def fn(W, cc):
                F = half_on_round(rig, W, side, cc)
                ax = F.col[0].xyz.normalized(); out_ = F.col[1].xyz.normalized(); sd = F.col[2].xyz.normalized() * side; o = F.translation.copy()
                move = sd * (0.0015 * crack + 0.22 * ft) + out_ * (0.001 * crack + 0.05 * ft) + Vector((0, 0, 0.25 * ft - 0.5 * G * ft * ft))
                return T(move) @ T(o) @ Matrix.Rotation(math.radians(tum * side), 4, (ax + sd * 0.6).normalized()) @ Matrix.Rotation(math.radians(14.0 * crack * side), 4, ax) @ T(-o) @ F
            return fn
        return at
    for key, side in (("halfA", 1.0), ("halfB", -1.0)):
        h = band_on_round(side)
        c.k(key, [(0, None)] + [(f, h(f), "step") for f in range(1, 28)] + [(28, None, "step"), (n, None)])
    out.append(c)

    # unload_kept: gate, the round back to the loop (its band broken; kept_loop is shown again by code at the end)
    c = Clip("unload_kept"); n = c.n
    gun_there_and_back(c, part_pose(0.5), 0, 4, 4.5, n)
    c.k("gate", [(0, 0.0), (1, 0.0, "hold"), (3, GATE_OPEN, "out3"), (5, GATE_OPEN, "hold"), (7, -1.5, "out3"), (8, 0.0, "io"), (n, 0.0)])
    c.k("thumb", [(0, THUMB_REST), (1, Vector((13.5, -52.0, 4.0)), "out"), (3, Vector((19.0, -50.0, -6.0)), "out"), (5, Vector((20.0, -50.0, -2.0)), "io"),
                  (7, Vector((12.0, -54.0, 9.0)), "out3"), (n, THUMB_REST, "io")])
    c.k("hammer", [(0, 0.0), (2, -20.0, "out"), (5, -20.0, "hold"), (7, 2.0, "out"), (n, 0.0, "io")])
    c.k("cyl", [(0, 0.0), (1, 0.0, "hold"), (3, 60.0, "out"), (4, 60.0, "hold"), (6, 0.0, "out"), (n, 0.0)])
    c.k("lhc", [(0, BELOW), (n, BELOW)])
    c.k("lhg", [(0, PORT_SEAT), (4, PORT_SEAT, "hold"), (6, PORT_OUT, "io"), (n, PALM, "io")])
    c.k("lhw", [(0, 0.0), (4, 1.0, "lin"), (5, 1.0, "hold"), (n, 0.0, "soft")])
    c.k("push", [(0, PUSH), (4, PUSH, "hold"), (5, 0.0, "io"), (n, 0.0)])
    c.k("kept", [(0, 0.0), (3, 0.0, "hold"), (4, 1.0, "step"), (7, 1.0, "hold"), (8, 0.0, "step"), (n, 0.0)])
    c.k("elbow_l", [(0, Z3), (4, ELBOW_L, "lin"), (5, ELBOW_L, "hold"), (n, Z3, "soft")])
    c.k("elbow_r", [(0, Z3), (4, ELBOW_R * 0.5, "soft"), (5, ELBOW_R * 0.5, "hold"), (n, Z3, "soft")])
    out.append(c)

    # fire_kept: the muzzle is down the bore; a longer, heavier kick (0.11 m, 26 degrees), no cock: the hammer stays
    # down; a slow return over 0.6 s
    c = Clip("fire_kept"); n = c.n
    c.k("g_pos", [(0, Vector((0, 0, 0))), (4, Vector((0.006, -0.11, 0.018)), "out3"), (8, Vector((0.004, -0.085, 0.012)), "io"), (22, Vector((0.0, 0.003, -0.002)), "io"),
                  (27, Vector((0, -0.001, 0)), "io"), (n, Vector((0, 0, 0)), "io")])
    c.k("g_pitch", [(0, 0.0), (4, 26.0, "out3"), (8, 21.0, "io"), (22, -1.5, "io"), (27, 0.4, "io"), (n, 0.0, "io")])
    c.k("g_roll", [(0, 0.0), (4, 3.0, "out"), (14, -1.0, "io"), (24, 0.3, "io"), (n, 0.0, "io")])
    c.k("g_yaw", [(0, 0.0), (4, -1.5, "out"), (16, 0.4, "io"), (n, 0.0, "io")])
    c.k("hammer", [(0, -48.0), (n, -48.0)])
    c.k("trigger", [(0, -13.0), (10, -13.0, "hold"), (26, -6.0, "io"), (n, -5.0)])
    c.k("idx1", [(0, 9.0), (10, 9.0, "hold"), (26, 4.0, "io"), (n, 3.0)])
    c.k("grip", [(0, 0.0), (1, 6.0, "out"), (10, 2.0, "io"), (n, 0.0, "io")])
    c.k("wrist", [(0, Vector((0, 0, 0))), (4, Vector((0.0, -0.004, 0.0)), "out"), (n, Vector((0, 0, 0)), "io")])
    out.append(c)

    # take_round (1.0 s): the left hand reaches forward and down, closes on the stone's round (0.4 s), lifts it into the
    # light and turns the cuff up; the gun hand's thumb presses it home into the empty loop (0.83 s: code shows
    # kept_loop from frame 25, the clip hides round_hand_kept on the same frame); both hands go home
    c = Clip("take_round"); n = c.n
    reach = cam_frame((0.105, 0.44, -0.15), (0.80, 0.30, 0.25), (-0.40, 0.10, 0.90))        # thumb toward the eye, the fingers closing on it from the left (within the forearm's turn: no flip)
    lift = cam_frame((0.078, 0.38, 0.0), (0.70, 0.08, 0.70), (-0.70, 0.10, 0.70))
    sh_reach = elbow_for(rig, "l", (reach @ rig.pinch.inverted()) @ wl0, (0.02, -0.60, -0.80))
    sh_lift = elbow_for(rig, "l", (lift @ rig.pinch.inverted()) @ wl0, (0.04, -0.30, -0.95))
    c.k("lhc", [(0, BELOW), (9, reach, "io"), (12, reach, "hold"), (17, lift, "io"), (19, lift, "hold"), (23, up, "io"), (25, up2, "io"), (n, BELOW, "io")])
    c.k("elbow_l", [(0, Z3), (9, sh_reach, "io"), (12, sh_reach, "hold"), (17, sh_lift, "io"), (19, sh_lift, "hold"), (23, sh_up, "io"), (25, sh_up2, "io"), (n, Z3, "io")])
    c.k("lcurl", [(0, 0.0), (8, -12.0, "out"), (12, 0.0, "io"), (19, 0.0, "hold"), (23, 40.0, "io"), (25, 40.0), (n, 0.0, "io")])
    c.k("lidx", [(0, 0.0), (8, -12.0, "out"), (12, 0.0, "io"), (19, 0.0, "hold"), (23, 45.0, "io"), (25, 45.0), (n, 0.0, "io")])
    c.k("lthumb", [(0, 0.0), (8, -10.0, "out"), (12, 0.0, "io"), (n, 0.0)])
    c.k("kept", [(0, 0.0), (11, 0.0, "hold"), (12, 1.0, "step"), (24, 1.0, "hold"), (25, 0.0, "step"), (n, 0.0)])
    in_hand = lambda W, cc: W["hand_l"] @ rig.pinch
    over = lambda W, cc: W["arm_l"] @ rig.loop @ T((0.0, 0.034, 0.004))
    at_loop = lambda W, cc: W["arm_l"] @ rig.loop
    c.k("keptF", [(0, None), (11, None, "hold"), (12, in_hand, "step"), (20, in_hand, "hold"), (23, over, "io"), (24, at_loop, "out"), (n, at_loop)])
    for key, side in (("halfA", 1.0), ("halfB", -1.0)):
        fn = (lambda s_: (lambda W, cc: half_on_round(rig, W, s_, cc)))(side)
        c.k(key, [(0, None), (11, None, "hold"), (12, fn, "step"), (24, fn, "hold"), (25, None, "step"), (n, None)])
    DIP = {"g_pos": Vector((0.03, -0.01, -0.03)), "g_pitch": -6.0, "g_roll": 0.0, "g_yaw": -4.0}
    for k, v in MEET.items():
        c.k(k, [(0, ZERO[k]), (8, DIP[k], "io"), (13, DIP[k], "hold"), (21, v, "io"), (24, v, "hold"), (n - 1, ZERO[k] if isinstance(v, Vector) else -v * 0.025, "soft"), (n, ZERO[k], "io")])
    c.k("elbow_r", [(0, Z3), (13, Z3, "hold"), (21, ER_MEET, "io"), (24, ER_MEET, "hold"), (n, Z3, "soft")])
    press = lambda W, cc: (W["arm_l"] @ rig.loop) @ Vector((0.0, 0.0165, 0.0085))
    above = lambda W, cc: (W["arm_l"] @ rig.loop) @ Vector((0.0, 0.034, 0.014))
    c.k("thumb", [(0, THUMB_REST), (n, THUMB_REST)])
    # letting go: the thumb leaves from where the loop WAS on frame 25 (a fixed point), not after the left arm as it drops away
    Wa25 = poser.arm_W("arm_l", "hand_l", up2 @ rig.pinch.inverted(), sh_up2)
    left_at = Wa25 @ rig.loop @ Vector((0.0, 0.0165, 0.0085))
    c.k("thumbw", [(0, above), (19, above, "hold"), (24, press, "io"), (25, press, "hold"), (26, left_at, "step"), (n, left_at)])
    c.k("thumbw_k", [(0, 0.0), (18, 0.0, "hold"), (24, 1.0, "io"), (25, 1.0, "hold"), (n - 1, 0.0, "io"), (n, 0.0)])      # polish round 4: from 18 (was 21): the bent thumb's end joint has farther to fold
    c.k("thumb2", [(0, 0.0), (20, -4.0, "out"), (24, 6.0, "io"), (n, 0.0, "io")])
    out.append(c)
    return out
