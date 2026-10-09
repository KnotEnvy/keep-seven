"""The fifteen clips of weapon_revolver (art-weapons 4.1; GDD 6.9; ART_BIBLE 7.5, 8.4). Helper of weapon_revolver.py.

How a clip is made
  A clip is a set of CONTROL tracks (key frames with an easing each), sampled at every whole frame and turned into a
  pose of the 31 bones, which is keyed on every frame (the exporter samples every frame anyway). The controls speak
  the language of the order: the gun's kick and roll about the grip, the cylinder's turn, the hammer's fall and cock,
  the gate, the trigger; the right thumb as a point it reaches for on the gun; the left hand as the frame of the round
  it pinches (in camera space, or riding the gun at the loading gate); finger curls; the rounds' visibility.
  Every clip starts fast and ends slow (ease-out by default), overshoots a few degrees and settles in two frames.

  Poses are composed as world-space DELTAS of the rest pose: W(bone) = W(parent) @ D(bone), or set absolutely (the
  right hand rides the gun; the forearms aim from the elbow at the wrist and take half the hand's twist). The basis
  written to Blender is rest^-1 @ W(parent)^-1 @ W(bone) @ rest.

Conventions code-player relies on (also in docs/requests/art-weapons.md):
  * the rest pose IS idle at t = 0: hammer at full cock, gate shut, cylinder at 0;
  * `fire` starts with the cylinder at -60 degrees and turns it to 0 between frames 4 and 9; `reload_round` turns it
    +60 between frames 5 and 7 and is back at 0 on its last frame: by 6-fold symmetry the jumps are invisible, but the
    chamber->bone mapping of round_1..6 shifts by one per shot and per seated round (round_1 under the hammer and
    round_2 at the gate at rest; numbered clockwise seen from behind);
  * round_1..6 and kept_loop are never keyed; round_hand_* are keyed (scale 0 or 1) on every frame of every clip.
"""
import math, os
import bpy
from mathutils import Vector, Matrix, Quaternion
from lib import anim, manifest
import assize, revolver_rig as R

ASSET = "weapon_revolver"
I4 = Matrix.Identity(4)
MM = 0.001
CODE = set(manifest.asset(ASSET).get("codeDriven") or [])


def T(v): return Matrix.Translation(Vector(v))


def rot_about(point, axis, deg):
    return T(point) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis)) @ T(-Vector(point))


def frame(origin, y, z):
    return R.frame_from(origin, y, z)


# ------------------------------------------------------------------ easing and tracks
def ease(u, kind):
    u = max(0.0, min(1.0, u))
    if kind == "lin": return u
    if kind == "out": return 1.0 - (1.0 - u) ** 2.4                     # fast start, slow end
    if kind == "out3": return 1.0 - (1.0 - u) ** 3.5
    if kind == "in": return u ** 2.2
    if kind == "io": return u * u * (3.0 - 2.0 * u)
    if kind == "soft": return 0.5 * u + 0.5 * u * u * (3.0 - 2.0 * u)      # eased at both ends, but a lower top speed than "io" (the 0.3 s clips)
    if kind == "step": return 1.0 if u >= 1.0 else 0.0
    if kind == "hold": return 0.0
    raise ValueError(kind)


def lerp(a, b, t):
    if a is None or b is None: return a if t < 1.0 else b
    if callable(a) or callable(b):
        A = a if callable(a) else (lambda W, c, v=a: v); B = b if callable(b) else (lambda W, c, v=b: v)
        if t <= 0.0: return A
        if t >= 1.0: return B
        return lambda W, c: lerp(A(W, c), B(W, c), t)
    if isinstance(a, Matrix):
        la, ra, _ = a.decompose(); lb, rb, _ = b.decompose()
        if ra.dot(rb) < 0: rb = -rb
        m = ra.slerp(rb, t).to_matrix().to_4x4(); m.translation = la.lerp(lb, t)
        return m
    if isinstance(a, Vector): return a.lerp(b, t)
    return a + (b - a) * t


class Clip:
    def __init__(self, name):
        self.name = name; self.n = anim.frames(ASSET, name); self.tracks = {}

    def k(self, ctl, keys):
        """keys: [(frame, value[, ease into this key])] in any order; frames may be fractions."""
        ks = sorted([(float(k[0]), k[1], k[2] if len(k) > 2 else "out") for k in keys], key=lambda x: x[0])
        self.tracks[ctl] = ks
        return self

    def at(self, ctl, f, default):
        ks = self.tracks.get(ctl)
        if not ks: return default
        if f <= ks[0][0]: return ks[0][1]
        for (f0, v0, _), (f1, v1, e) in zip(ks[:-1], ks[1:]):
            if f <= f1: return lerp(v0, v1, ease((f - f0) / max(f1 - f0, 1e-9), e))
        return ks[-1][1]


# ------------------------------------------------------------------ the rig as data
class Rig:
    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
        self.order = [b.name for b in sorted(bones, key=lambda b: (depth(b), b.name))]
        self.head = {n: m.translation.copy() for n, m in self.rest.items()}
        self.ydir = {n: (m.to_3x3() @ Vector((0, 1, 0))).normalized() for n, m in self.rest.items()}
        # landmarks (rest space)
        self.pivot = R.GRIP_CENTRE.copy()
        self.bore = R.gdir((0, 1, 0)); self.gup = R.gdir((0, 0, 1)); self.gright = R.gdir((1, 0, 0))
        down = Vector((assize.HAMMER[7][0], assize.HAMMER[7][1] + 1.5))
        cock = assize.rot_x(down, assize.HAMMER_PIVOT, assize.HAMMER_COCK)
        self.spur = R.g((0.0, cock[0], cock[1]))                                     # the top of the spur at full cock
        self.r_thumb_tip = R.g(R.RIGHT_THUMB_GUN[3]); self.r_thumb_cmc = R.g(R.RIGHT_THUMB_GUN[0])
        fr = R.round_frames()
        self.pinch = fr["pinch"]; self.loop = fr["loop"]
        self.half_rest = fr["pinch"] @ T((0.0, -0.75, 0.0))
        lh = R.left_hand_matrix()
        self.l_palm = (lh.to_3x3() @ Vector((0, 0, -1))).normalized()                 # palm normal of the left hand at rest
        self.r_palm = (R.GUN_M.to_3x3() @ (R.right_hand_matrix().to_3x3() @ Vector((0, 0, -1)))).normalized()

    def hinge(self, bone, palm):
        t = self.ydir[bone]; h = t.cross(palm)
        return h.normalized() if h.length > 1e-6 else Vector((1, 0, 0))

    def solve(self, Wabs, D, S):
        W = {}
        for n in self.order:
            p = self.parent[n]
            W[n] = Wabs[n] if n in Wabs else (W[p] if p else I4) @ D.get(n, I4)
        out = {}
        for n in self.order:
            p = self.parent[n]; Wp = W[p] if p else I4
            B = self.rest[n].inverted() @ Wp.inverted() @ W[n] @ self.rest[n]
            loc, rot, _ = B.decompose()
            out[n] = (loc, rot, S.get(n, 1.0))
        return W, out


def aim(head, a, b):
    """Rotation about `head` that turns direction a into direction b."""
    q = Vector(a).normalized().rotation_difference(Vector(b).normalized())
    return T(head) @ q.to_matrix().to_4x4() @ T(-Vector(head))


THUMB_UNFOLD = -26.0        # degrees the right thumb's end joint may open from its bent rest pose to reach a far target
TWIST_CUT = -180.0          # the signed twist of a hand about its forearm is read in (TWIST_CUT, TWIST_CUT + 360]


def twist_angle(q, axis, cut=None):
    """Signed angle (degrees) of the twist of rotation q about `axis` (swing-twist decomposition), in (cut, cut + 360]."""
    v = Vector((q.x, q.y, q.z))
    a = math.degrees(2.0 * math.atan2(v.dot(axis), q.w))
    cut = TWIST_CUT if cut is None else cut
    while a <= cut: a += 360.0
    while a > cut + 360.0: a -= 360.0
    return a


def twist_part(q, axis, k, cut=None):
    """k times the twist of rotation q about `axis`. The angle is taken in (cut, cut + 360]: a forearm that takes half
    the hand's twist must not flip when that twist passes 180 degrees between two frames."""
    return Quaternion(axis, math.radians(twist_angle(q, axis, cut) * k))


LEFT_CUT = -100.0          # see twist_part: where the left hand's twist range is cut (polish round 3: the working poses run from -35, feeding the gate, to about 190, the round held up thumb-side to the eye)
TWISTS = []


# ------------------------------------------------------------------ controls -> pose
DEFAULTS = {"g_pos": Vector((0, 0, 0)), "g_pitch": 0.0, "g_yaw": 0.0, "g_roll": 0.0,
            "cyl": 0.0, "hammer": 0.0, "trigger": 0.0, "gate": 0.0, "ej": 0.0,
            "thumb": None, "thumb2": 0.0, "idx1": 0.0, "idx2": 0.0, "grip": 0.0, "wrist": Vector((0, 0, 0)),
            "lhc": None, "lhg": None, "lhw": 0.0, "lcurl": 0.0, "lthumb": 0.0, "lthumb_up": 0.0, "lidx": 0.0,
            "push": 0.0, "lead": 0.0, "line": 0.0, "kept": 0.0, "keptF": None, "halfA": None, "halfB": None,      # keptF before the halves: they may read it
            "elbow_r": Vector((0, 0, 0)), "elbow_l": Vector((0, 0, 0)), "thumbw": None, "thumbw_k": 0.0}


class Poser:
    def __init__(self, rig):
        self.r = rig

    def gun_W(self, c):
        r = self.r
        return (T(r.pivot + c["g_pos"]) @ Matrix.Rotation(math.radians(c["g_yaw"]), 4, 'Z') @ Matrix.Rotation(math.radians(c["g_pitch"]), 4, 'X')
                @ Matrix.Rotation(math.radians(c["g_roll"]), 4, r.bore) @ T(-r.pivot))

    def pose(self, c):
        r = self.r
        Wabs = {}; D = {}; S = {}
        Wg = self.gun_W(c)
        Wabs["gun"] = Wg
        D["cylinder"] = rot_about(r.head["cylinder"], r.ydir["cylinder"], c["cyl"])
        D["hammer"] = rot_about(r.head["hammer"], r.ydir["hammer"], c["hammer"])
        D["trigger"] = rot_about(r.head["trigger"], r.ydir["trigger"], c["trigger"])
        D["gate"] = rot_about(r.head["gate"], r.ydir["gate"], c["gate"])
        D["ejector"] = T(-r.ydir["ejector"] * c["ej"])
        # ---- right hand rides the gun; the wrist may give a little
        Wh = Wg @ T(c["wrist"]); fold = 0.0
        Wabs["hand_r"] = Wh
        if c["thumb"] is not None:                                                   # reach for a point on the gun (gun mm)
            tgt = R.g(c["thumb"])
            if c["thumbw"] is not None and c["thumbw_k"] > 0:                       # or for a point in the world (the cuff)
                tgt = tgt.lerp(Wh.inverted() @ Vector(c["thumbw"]), c["thumbw_k"])
            # two-bone reach: a target nearer than the straight thumb FOLDS the end joint (up to 56 degrees) so that the
            # pad lands on it and the tip does not overshoot (a straight thumb aimed at the hammer spur lay over the whole
            # mechanism as a plank); a target beyond its length slides the base after it
            h0 = r.head["thumb_r_1"]; ip = r.head["thumb_r_2"]; want = tgt - h0
            hinge = r.hinge("thumb_r_2", r.r_palm)
            def tip_at(deg): return rot_about(ip, hinge, -deg) @ r.r_thumb_tip
            # (polish round 4: the thumb RESTS bent, so a far target first straightens it: a negative fold down to THUMB_UNFOLD)
            lo, hi = THUMB_UNFOLD * (1.0 - (c["thumbw_k"] if c["thumbw"] is not None else 0.0)), 56.0     # (not toward the cuff: those reaches were staged with a thumb that only folds)
            if (tip_at(hi) - h0).length < (tip_at(lo) - h0).length:
                for _ in range(18):
                    mid = 0.5 * (lo + hi)
                    if (tip_at(mid) - h0).length > want.length: lo = mid
                    else: hi = mid
                fold = lo
            else: fold = 0.0
            rest = tip_at(fold) - h0
            reach = want.length - rest.length                                       # beyond the thumb's length: the base slides after it
            slide = want.normalized() * max(0.0, min(reach, 0.024)) if reach > 0 else Vector((0, 0, 0))
            D["thumb_r_1"] = T(slide) @ aim(h0, rest, want)
        D["thumb_r_2"] = rot_about(r.head["thumb_r_2"], r.hinge("thumb_r_2", r.r_palm), c["thumb2"] - fold)
        D["index_r_1"] = rot_about(r.head["index_r_1"], r.hinge("index_r_1", r.r_palm), c["idx1"])
        D["index_r_2"] = rot_about(r.head["index_r_2"], r.hinge("index_r_2", r.r_palm), c["idx2"])
        D["grip_r"] = rot_about(r.head["grip_r"], r.hinge("grip_r", r.r_palm), c["grip"])
        Wabs["arm_r"] = self.arm_W("arm_r", "hand_r", Wh, c["elbow_r"])
        # ---- left hand: the frame of the round it pinches
        Fc = c["lhc"] if c["lhc"] is not None else r.pinch
        F = Fc
        if c["lhg"] is not None and c["lhw"] > 0: F = lerp(Fc, Wg @ c["lhg"], c["lhw"])
        Wl = F @ r.pinch.inverted()
        Wabs["hand_l"] = Wl
        D["fingers_l"] = rot_about(r.head["fingers_l"], r.hinge("fingers_l", r.l_palm), c["lcurl"])
        D["index_l_1"] = rot_about(r.head["index_l_1"], r.hinge("index_l_1", r.l_palm), c["lidx"])
        D["index_l_2"] = rot_about(r.head["index_l_2"], r.hinge("index_l_2", r.l_palm), c["lidx"] * 0.8)
        th = r.hinge("thumb_l_1", r.l_palm)
        D["thumb_l_1"] = rot_about(r.head["thumb_l_1"], th, c["lthumb"]) @ rot_about(r.head["thumb_l_1"], r.ydir["thumb_l_1"].cross(th), c["lthumb_up"])
        D["thumb_l_2"] = rot_about(r.head["thumb_l_2"], r.hinge("thumb_l_2", r.l_palm), c["lthumb"] * 0.7)
        Wabs["arm_l"] = self.arm_W("arm_l", "hand_l", Wl, c["elbow_l"])
        # ---- the rounds in the left hand; the band halves ride round_hand_lead / _line when asked
        D["round_hand_lead"] = T(r.ydir["round_hand_lead"] * c["push"]); D["round_hand_line"] = T(r.ydir["round_hand_line"] * c["push"])
        D["round_hand_kept"] = T(r.ydir["round_hand_kept"] * c["push"])
        S["round_hand_lead"] = c["lead"]; S["round_hand_line"] = c["line"]; S["round_hand_kept"] = c["kept"]
        if c["keptF"] is not None: Wabs["round_hand_kept"] = c["keptF"] @ r.pinch.inverted()      # the kept round on its way from the cuff loop to the fingers
        if c["halfA"] is not None: Wabs["round_hand_lead"] = c["halfA"] @ r.half_rest.inverted(); S["round_hand_lead"] = 1.0
        if c["halfB"] is not None: Wabs["round_hand_line"] = c["halfB"] @ r.half_rest.inverted(); S["round_hand_line"] = 1.0
        return r.solve(Wabs, D, S)

    def arm_W(self, arm, hand, Wh, shift):
        r = self.r
        w0 = r.head[hand]; e0 = r.head[arm]
        w1 = Wh @ w0
        e1 = e0 + (w1 - w0) * (0.45 if arm == "arm_r" else 0.72) + shift
        q = (w0 - e0).normalized().rotation_difference((w1 - e1).normalized())
        qh = Wh.to_quaternion()
        res = q.inverted() @ qh
        tw = twist_part(res, (w0 - e0).normalized(), 0.5, LEFT_CUT if arm == "arm_l" else -180.0)
        if arm == "arm_l": TWISTS.append(round(twist_angle(res, (w0 - e0).normalized(), LEFT_CUT)))
        return T(w1) @ (q @ tw).to_matrix().to_4x4() @ T(-w0)


# ------------------------------------------------------------------ where things are (rest space)
_ROLL = {}


PORT_ROLL = float(os.environ.get("PORT_ROLL", "145"))      # degrees round the bore: where the left hand lies about the round it feeds (0 = toward the top strap)
ELBOW_DIR = Vector(tuple(float(x) for x in os.environ.get("ELBOW_DIR", "-0.33,0.37,-0.87").split(",")))   # wrist -> elbow in the loading pose (camera space): down and back, out of the bottom edge


def port_frame(rig, back_mm=0.0, roll_hint=None, Wg=None):
    """The frame a round has when it sits in the chamber at the loading gate (rest gun), pulled back `back_mm` along the
    chamber axis. +Y = nose, +Z = the pinch frame's Z (with the round held along the fingertips that is, nearly, the
    direction from her wrist to her knuckles). Polish round 3: the hand no longer lies beside the gate, between the eye
    and the cylinder. The round is held along the fingertips, so the hand is BEHIND the gate (below it on the screen:
    the gun is muzzle-up), and PORT_ROLL turns it round the bore to the side where it hides least; the forearm falls
    out of the bottom edge (ELBOW_DIR), so the sleeve is a short stub."""
    cx, cz = assize.chamber_centre(1)
    o = R.g((cx, assize.CYL_Y0 - 1.6 - back_mm, cz))
    if roll_hint is not None: return frame(o, rig.bore, R.gdir(roll_hint))
    if "hint" not in _ROLL:
        Wg = Wg or I4
        ref = (rig.gup - rig.bore * rig.gup.dot(rig.bore)).normalized()
        hint = Matrix.Rotation(math.radians(PORT_ROLL), 3, rig.bore) @ ref
        _ROLL["hint"] = hint
        o0 = R.g((cx, assize.CYL_Y0 - 1.6 - 52.0, cz))
        Wl = Wg @ frame(o0, rig.bore, hint) @ rig.pinch.inverted()
        wrist = rig.head["hand_l"]; e0 = rig.head["arm_l"]; w = Wl @ wrist
        E = w + ELBOW_DIR.normalized() * 0.23
        ELBOW_L.xyz = E - (e0 + (w - wrist) * 0.72)
        sx = lambda p: 0.5 + p.x / p.y / (2 * TAN_V * 16.0 / 9.0); sy = lambda p: 0.5 + p.z / p.y / (2 * TAN_V)
        g = Wg @ o0
        own = (Wl.to_3x3() @ (e0 - wrist)).normalized()
        print("PORT the left hand's own forearm line (wrist -> elbow, camera space) (%.2f, %.2f, %.2f); the arm is laid along (%.2f, %.2f, %.2f): a wrist bent %.0f degrees" % (*own, *ELBOW_DIR.normalized(), math.degrees(own.angle(ELBOW_DIR))))
        print("PORT gate at screen (%.3f, %.3f) depth %.3f; wrist (%.3f, %.3f) depth %.3f; elbow (%.3f, %.3f)" % (sx(g), sy(g), g.y, sx(w), sy(w), w.y, sx(E), sy(E)))
    return frame(o, rig.bore, _ROLL["hint"])


def spur_target(deg):
    """Gun-space point (mm) where the right thumb's pad sits on the hammer spur, the hammer at `deg` from full cock."""
    p = (assize.HAMMER[7][0] + 1.0, assize.HAMMER[7][1] + 1.0)
    y, z = assize.rot_x(p, assize.HAMMER_PIVOT, assize.HAMMER_COCK + math.radians(deg))
    return Vector((-10.5, y - 4.0, z - 1.0))


def gun_pos_for(rig, point_gun_mm, target, pitch, yaw, roll):
    """The g_pos that puts a gun-space point (mm) at `target` (camera space) under these rotations about the grip."""
    Rm = Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ Matrix.Rotation(math.radians(roll), 4, rig.bore)
    p = R.g(point_gun_mm)
    return Vector(target) - rig.pivot - Rm.to_3x3() @ (p - rig.pivot)


def pose_for(rig, bore, right, point_gun_mm, target):
    """The gun controls (g_pitch, g_yaw, g_roll, g_pos) that turn the gun so its bore runs along `bore` and its right
    side (the loading gate) faces `right` (camera space), with the gun-space point (mm) at `target`."""
    d = Vector(bore).normalized(); x = Vector(right); x = (x - d * x.dot(d)).normalized(); z = x.cross(d)
    Mt = Matrix(((x.x, d.x, z.x), (x.y, d.y, z.y), (x.z, d.z, z.z)))
    b = rig.bore; x0 = rig.gright; z0 = x0.cross(b)
    M0 = Matrix(((x0.x, b.x, z0.x), (x0.y, b.y, z0.y), (x0.z, b.z, z0.z)))
    Q = Mt @ M0.inverted()
    pitch = math.asin(max(-1.0, min(1.0, d.z / math.hypot(b.y, b.z)))) - math.atan2(b.z, b.y)
    v = Matrix.Rotation(pitch, 3, 'X') @ b
    yaw = math.atan2(d.y, d.x) - math.atan2(v.y, v.x)
    A = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(pitch, 3, 'X')
    roll = twist_angle((A.inverted() @ Q).to_quaternion(), b)
    pitch, yaw = math.degrees(pitch), math.degrees(yaw)
    while yaw > 180.0: yaw -= 360.0
    while yaw < -180.0: yaw += 360.0
    return {"g_pos": gun_pos_for(rig, point_gun_mm, target, pitch, yaw, roll), "g_pitch": pitch, "g_roll": roll, "g_yaw": yaw}


RELOAD_BORE = tuple(float(x) for x in os.environ.get("RELOAD_BORE", "-0.36,0.50,0.79").split(","))
RELOAD_RIGHT = tuple(float(x) for x in os.environ.get("RELOAD_RIGHT", "0.30,-1.0,0.10").split(","))
RELOAD_AT = tuple(float(x) for x in os.environ.get("RELOAD_AT", "0.138,0.44,0.050").split(","))


def reload_pose(rig):
    """The loading pose (polish round 3). The gun is turned so the eye looks at its RIGHT side and a little at its
    back: the open loading gate and the chamber behind it face the camera, the muzzle points up, away and a little
    left, the grip (and the gun hand) fall to the lower right. The gate chamber's mouth sits right of centre, above the
    middle of the frame; the left hand feeds it from below."""
    cx, cz = assize.chamber_centre(1)
    out = pose_for(rig, RELOAD_BORE, RELOAD_RIGHT, (cx, assize.CYL_Y0, cz), RELOAD_AT)
    print("RELOAD POSE pitch %.1f yaw %.1f roll %.1f pos %s" % (out["g_pitch"], out["g_yaw"], out["g_roll"], tuple(round(c, 3) for c in out["g_pos"])))
    return out


SEAT_BACK = 28.0                          # mm short of home where the fingertips meet the frame
DIP_OFF = (0.0, 0.0, -0.02)                # the dip between two rounds, in the port frame (-Z: toward her wrist)
THUMB_LOAD = Vector((-8.0, -64.0, 6.0))   # the right thumb while the gate is open (gun mm)
ELBOW_R_DIR = Vector(tuple(float(x) for x in os.environ.get("ELBOW_R_DIR", "0.30,-0.45,-0.84").split(",")))   # gun wrist -> elbow in the loading pose: steeply down to the lower right corner


def elbow_r_shift(rig, Wg, direction):
    """The elbow_r control that lays the right forearm along `direction` (camera space) when the gun is at Wg."""
    w0 = rig.head["hand_r"]; e0 = rig.head["arm_r"]; w1 = Wg @ w0
    return (w1 + Vector(direction).normalized() * (w0 - e0).length) - (e0 + (w1 - w0) * 0.45)


def elbow_for(rig, side, wrist, direction):
    """The elbow_l / elbow_r control that lays a forearm along `direction` (wrist -> elbow, camera space) when its
    wrist is at `wrist`."""
    arm, hand, k = ("arm_l", "hand_l", 0.72) if side == "l" else ("arm_r", "hand_r", 0.45)
    w0 = rig.head[hand]; e0 = rig.head[arm]; w1 = Vector(wrist)
    return (w1 + Vector(direction).normalized() * (w0 - e0).length) - (e0 + (w1 - w0) * k)


ELBOW_R = Vector((0.0, 0.0, 0.0))
ELBOW_L = Vector((0.0, 0.0, 0.0))         # the left elbow's shift in the loading clips: set (in place) by port_frame() when it chooses the arm


def cam_frame(pos, nose, back):
    return frame(Vector(pos), Vector(nose), Vector(back))


# ------------------------------------------------------------------ the clips
def clips(rig):
    out = []
    RL = reload_pose(rig)
    Wrl = Poser(rig).gun_W(dict(DEFAULTS, **RL))
    ELBOW_R.xyz = elbow_r_shift(rig, Wrl, ELBOW_R_DIR)
    PORT0 = port_frame(rig, 0.0, Wg=Wrl)
    PORT_IN = port_frame(rig, 28.0, Wg=Wrl)            # nose just in the port, lined up
    PORT_OUT = port_frame(rig, 52.0, Wg=Wrl)           # lined up behind the gate
    BELOW = rig.pinch.copy()                           # the left hand's REST place, under the frame: every clip leaves from it and returns to it (no pop against idle)      # left hand low, out of frame
    rest = rig.pinch

    # idle: breathing. 3 mm up and down, 0.4 degrees of roll, the thumb beside the hammer
    c = Clip("idle"); n = c.n
    # A slow sine keyed on every frame does not survive the optimiser's resample() pass (it drops the frames one after
    # another: the roll came out constant, the breath 2.6 mm with its peak on frame 30). weapon_revolver.slim_clips
    # therefore thins THIS clip to every ninth frame in the raw export (ten linear pieces a breath), which resample keeps.
    c.k("g_pos", [(f, Vector((0.0, 0.0, 0.00158 * math.sin(2 * math.pi * f / n))), "lin") for f in range(n + 1)])
    # 0.4 degrees of roll from one end of the breath to the other, a little behind the rise; nothing else turns
    c.k("g_roll", [(f, 0.205 * (math.cos(0.2 * math.pi) - math.cos(2 * math.pi * f / n - 0.2 * math.pi)), "lin") for f in range(n + 1)])
    out.append(c)

    # sprint: muzzle up and inboard 35 degrees, the gun pumps 4 cm with each stride, the left hand swings into the lower left
    c = Clip("sprint"); n = c.n
    base = Vector((0.045, -0.02, -0.035))
    def sp_pos(f):
        u = 2 * math.pi * f / n
        return base + Vector((0.006 * math.sin(u), 0.0, 0.04 * abs(math.sin(u)) - 0.02))
    c.k("g_pos", [(f, sp_pos(f), "lin") for f in range(n + 1)])
    c.k("g_pitch", [(f, 24.0 + 3.0 * math.sin(4 * math.pi * f / n + 0.8), "lin") for f in range(n + 1)])
    c.k("g_yaw", [(f, 13.0 + 2.0 * math.sin(2 * math.pi * f / n), "lin") for f in range(n + 1)])
    c.k("g_roll", [(f, -18.0 + 2.5 * math.sin(2 * math.pi * f / n + 1.0), "lin") for f in range(n + 1)])
    def sp_left(f):
        u = 2 * math.pi * f / n
        k = 0.5 - 0.5 * math.cos(u)                                       # 0 low .. 1 in the corner
        p = Vector((-0.21, 0.28, -0.26)).lerp(Vector((-0.15, 0.30, -0.125)), k)
        import revolver_clips2                                           # the hand by its wrist, fingers and back (the pinch frame is the round's)
        return revolver_clips2.hand_pinch(rig, p + Vector((-0.03, -0.08, -0.02)), Vector((0.35, 0.8, 0.5)).lerp(Vector((0.55, 0.75, 0.35)), k), (-0.5, -0.3, 0.8))
    c.k("lhc", [(f, sp_left(f), "lin") for f in range(n + 1)])
    c.k("lcurl", [(0, 16.0), (n, 16.0)]); c.k("lidx", [(0, 22.0), (n, 22.0)]); c.k("lthumb", [(0, 6.0), (n, 6.0)])
    c.k("elbow_l", [(f, Vector((0.0, -0.05, 0.0)), "lin") for f in (0, n)])
    out.append(c)

    # draw: up from below the frame, butt first, the muzzle arrives last; a small settle on the idle pose
    c = Clip("draw"); n = c.n
    c.k("g_pos", [(0, Vector((0.035, -0.07, -0.15))), (7, Vector((0.004, -0.012, -0.022)), "out"), (11, Vector((0.0, 0.002, 0.003)), "io"), (n, Vector((0, 0, 0)), "io")])
    c.k("g_pitch", [(0, -55.0), (4, -42.0, "in"), (10, 3.0, "out"), (12, -1.0, "io"), (n, 0.0, "io")])
    c.k("g_roll", [(0, 35.0), (8, -4.0, "out"), (11, 1.0, "io"), (n, 0.0, "io")])
    c.k("g_yaw", [(0, -12.0), (9, 1.5, "out"), (n, 0.0, "io")])
    out.append(c)

    # fire: kick 0..0.12 s (0.08 m back, 20 degrees up), the hammer falls on frame 0; frames 4-9 the thumb sweeps it back
    # with two clicks (half cock on 6, full cock on 9) and the cylinder turns exactly 60; settles on idle by 0.48 s
    c = Clip("fire"); n = c.n
    c.k("g_pos", [(0, Vector((0, 0, 0))), (3, Vector((0.004, -0.08, 0.012)), "out3"), (7, Vector((0.002, -0.022, 0.004)), "io"),
                  (10, Vector((0.0, 0.003, -0.001)), "io"), (12, Vector((0, -0.0006, 0)), "io"), (n, Vector((0, 0, 0)), "io")])
    c.k("g_pitch", [(0, 0.0), (3, 20.0, "out3"), (7, 5.0, "io"), (10, -1.6, "io"), (12, 0.4, "io"), (n, 0.0, "io")])
    c.k("g_roll", [(0, 0.0), (3, 2.2, "out"), (8, -0.8, "io"), (11, 0.3, "io"), (n, 0.0, "io")])
    c.k("g_yaw", [(0, 0.0), (3, -1.2, "out"), (9, 0.3, "io"), (n, 0.0, "io")])
    c.k("hammer", [(0, -48.0), (4, -48.0, "hold"), (6, -28.0, "out"), (7, -27.0, "io"), (9, 2.0, "out"), (10, 0.0, "io"), (n, 0.0)])
    c.k("cyl", [(0, -60.0), (4, -60.0, "hold"), (6, -38.0, "out"), (7, -36.0, "io"), (9, 0.0, "out"), (n, 0.0)])
    c.k("trigger", [(0, -13.0), (4, -13.0, "hold"), (8, -2.0, "io"), (10, 0.0, "io"), (n, 0.0)])
    c.k("idx1", [(0, 9.0), (4, 9.0, "hold"), (9, 1.0, "io"), (n, 0.0, "io")]); c.k("idx2", [(0, 10.0), (4, 10.0, "hold"), (9, 0.0, "io"), (n, 0.0)])
    spur = spur_target
    rt = tuple(R.RIGHT_THUMB_GUN[3])
    # the thumb stays down beside the frame through the kick (it lay along the gun as a plank), comes up in two frames and
    # hooks the LEFT edge of the spur with its pad, the end joint folded: the hammer and the cylinder stay in view while
    # they move (frames 4-9). The hand shifts a few millimetres up the grip to reach the fallen hammer, as a hand does
    c.k("thumb", [(0, Vector(rt)), (2, Vector(rt), "hold"), (4, spur(-48.0), "io"), (6, spur(-28.0), "out"), (7, spur(-27.0), "io"),
                  (9, spur(2.0), "out"), (11, Vector((-17.0, -80.0, -4.0)), "io"), (n, Vector(rt), "io")])
    c.k("wrist", [(0, Vector((0, 0, 0))), (2, Vector((0, 0, 0)), "hold"), (4, Vector((0.0, 0.007, 0.008)), "io"), (7, Vector((0.0, 0.004, 0.005)), "io"), (10, Vector((0, 0, 0)), "io"),
                  (n, Vector((0, 0, 0)))])
    c.k("grip", [(0, 0.0), (1, 4.0, "out"), (6, 0.0, "io"), (n, 0.0)])
    out.append(c)

    # dry fire: the hammer falls, a 2 mm nod, nothing else (the hammer stays down)
    c = Clip("dry_fire"); n = c.n
    c.k("hammer", [(0, 0.0), (1, -48.0, "out3"), (n, -48.0)])
    c.k("trigger", [(0, 0.0), (1, -13.0, "out3"), (n, -11.0, "io")]); c.k("idx1", [(0, 0.0), (1, 9.0, "out"), (n, 7.0, "io")])
    c.k("g_pos", [(0, Vector((0, 0, 0))), (2, Vector((0, -0.001, -0.002)), "out"), (n, Vector((0, 0, -0.0004)), "io")])
    c.k("g_pitch", [(0, 0.0), (2, -0.4, "out"), (n, 0.0, "io")])
    out.append(c)

    GATE_OPEN = 98.0

    PORT_SEAT = port_frame(rig, SEAT_BACK, Wg=Wrl)     # as far as the fingertips go: the thumb pushes the round the rest of the way
    PUSH = SEAT_BACK * MM
    OPENF = -10.0                                      # the fingers let go

    # reload_open: the gun turns its gate to the eye, the right thumb flicks the gate open, the left hand comes up from
    # below with a round held along its fingertips
    c = Clip("reload_open"); n = c.n
    for k, v in RL.items():
        z = Vector((0, 0, 0)) if isinstance(v, Vector) else 0.0
        over = v * 1.04 if not isinstance(v, Vector) else v
        c.k(k, [(0, z), (7, over, "soft"), (9, v, "io"), (n, v, "io")])          # eased at both ends: the loading pose is far from idle
    c.k("hammer", [(0, 0.0), (3, -20.0, "out"), (n, -20.0)])
    gate_thumb = (13.5, -52.0, 4.0)
    c.k("thumb", [(0, Vector(R.RIGHT_THUMB_GUN[3])), (3, Vector(gate_thumb), "out"), (5, Vector((19.0, -50.0, -6.0)), "out"), (n, THUMB_LOAD, "io")])
    c.k("gate", [(0, 0.0), (3, 0.0, "hold"), (5, GATE_OPEN + 8.0, "out3"), (7, GATE_OPEN - 3.0, "io"), (n, GATE_OPEN, "io")])
    c.k("lhc", [(0, BELOW), (n, BELOW)]); c.k("lhg", [(0, PORT_OUT), (n, PORT_OUT)])
    c.k("lhw", [(0, 0.0), (3, 0.12, "in"), (n, 1.0, "out")])
    c.k("lead", [(0, 1.0), (n, 1.0)])
    c.k("elbow_l", [(0, Vector((0, 0, 0))), (n, ELBOW_L, "out")]); c.k("elbow_r", [(0, Vector((0, 0, 0))), (9, ELBOW_R, "soft"), (n, ELBOW_R)])
    out.append(c)

    # reload_round: one round goes in at the gate, in plain view: the nose enters (frame 2), the fingertips stop at the
    # frame and the thumb pushes it home (frame 5), the cylinder clicks round 60 and carries the case head out of the
    # gate, the hand drops away below and comes back with the next
    c = Clip("reload_round"); n = c.n
    for k, v in RL.items(): c.k(k, [(0, v), (n, v)])
    c.k("hammer", [(0, -20.0), (n, -20.0)]); c.k("gate", [(0, GATE_OPEN), (n, GATE_OPEN)])
    c.k("thumb", [(0, THUMB_LOAD), (n, THUMB_LOAD)])
    DIP = port_frame(rig, 95.0, Wg=Wrl) @ T(DIP_OFF)
    c.k("lhg", [(0, PORT_OUT), (2, PORT_IN, "out"), (4, PORT_SEAT, "out"), (5, PORT_SEAT, "hold"), (7, DIP, "io"), (n, PORT_OUT, "out")])
    c.k("lhw", [(0, 1.0), (n, 1.0)]); c.k("lhc", [(0, BELOW), (n, BELOW)])
    c.k("push", [(0, 0.0), (3, 0.0, "hold"), (5, PUSH, "out3"), (6, 0.0, "step"), (n, 0.0)])
    c.k("lthumb", [(0, 0.0), (3, 0.0, "hold"), (5, 14.0, "out"), (7, 0.0, "io"), (n, 0.0)])
    c.k("lidx", [(0, 0.0), (4, 0.0, "hold"), (5, OPENF, "out"), (7, 0.0, "io"), (n, 0.0)]); c.k("lcurl", [(0, 0.0), (4, 0.0, "hold"), (5, OPENF, "out"), (7, 0.0, "io"), (n, 0.0)])
    c.k("lead", [(0, 1.0), (5, 1.0, "hold"), (6, 0.0, "step"), (7, 0.0, "hold"), (8, 1.0, "step"), (n, 1.0)])
    c.k("cyl", [(0, 0.0), (5, 0.0, "hold"), (7, 60.0, "out"), (8, 60.0, "hold"), (n, 0.0, "step")])
    c.k("elbow_l", [(0, ELBOW_L), (n, ELBOW_L)]); c.k("elbow_r", [(0, ELBOW_R), (n, ELBOW_R)])
    out.append(c)

    # reload_close (0.3 s) and reload_fast_close (0.2 s): the gate snapped shut with the thumb, the gun rolls back to idle
    for name, sc in (("reload_close", 1.0), ("reload_fast_close", 0.66)):
        c = Clip(name); n = c.n
        f = lambda x: x * sc
        for k, v in RL.items():
            z = Vector((0, 0, 0)) if isinstance(v, Vector) else 0.0
            ov = (Vector((0, 0.002, -0.003)) if isinstance(v, Vector) else -v * 0.03)
            c.k(k, [(0, v), (f(1) if sc == 1.0 else 0.2, v, "hold"), (n - 1, ov, "soft" if sc < 1.0 else "io"), (n, z, "io")])          # eased at both ends over the whole clip
        c.k("gate", [(0, GATE_OPEN), (f(1), GATE_OPEN + 4.0, "io"), (f(3), -2.0, "out3"), (f(4), 0.0, "io"), (n, 0.0)])
        c.k("thumb", [(0, THUMB_LOAD), (f(1), Vector((22.0, -50.0, -2.0)), "out"), (f(3), Vector((12.0, -54.0, 9.0)), "out3"),
                      (f(5), Vector((-6.0, -84.0, 24.0)), "io"), (f(7), Vector(R.RIGHT_THUMB_GUN[3]), "io"), (n, Vector(R.RIGHT_THUMB_GUN[3]))])
        c.k("hammer", [(0, -20.0), (f(4), -20.0, "hold"), (f(6.5), 2.0, "out"), (n, 0.0, "io")])
        c.k("lhg", [(0, PORT_OUT), (n, PORT_OUT)]); c.k("lhc", [(0, BELOW), (n, BELOW)])
        c.k("lhw", [(0, 1.0), (n, 0.0, "io")])
        c.k("lead", [(0, 0.0), (n, 0.0)])
        c.k("elbow_l", [(0, ELBOW_L), (f(2), ELBOW_L, "hold"), (n, Vector((0, 0, 0)), "io")])
        c.k("elbow_r", [(0, ELBOW_R), (f(1), ELBOW_R, "hold"), (n, Vector((0, 0, 0)), "io")])
        out.append(c)
    return out


# ------------------------------------------------------------------ bake into actions
def evaluate(clip, f, poser):
    """Controls of frame f -> (W, basis). A control whose value is callable(W, c) is resolved against a first pass
    (the band halves follow the cuff loop; the right thumb follows the loop)."""
    c = {k: clip.at(k, f, v) for k, v in DEFAULTS.items()}
    lazy = [k for k, v in c.items() if callable(v)]
    if not lazy: return poser.pose(c)
    c0 = dict(c)
    for k in lazy: c0[k] = DEFAULTS[k]
    W0, _ = poser.pose(c0)
    for k in lazy: c[k] = c[k](W0, c)
    return poser.pose(c)


TAN_V = math.tan(math.radians(26.0)); TAN_H = TAN_V * 21.0 / 9.0           # the widest frame the game draws (21:9)


def in_frustum(p, margin=0.03):
    """Blender camera space: in front of the 0.02 m near plane and inside the 52-degree view (21:9 wide)."""
    d = p.y
    if d < 0.02: return False
    return abs(p.x) < d * TAN_H + margin and abs(p.z) < d * TAN_V + margin


HIDDEN_REPORT = []
LOOP_SEEN = {}


def check_hidden(clip, f, W, c, rig):
    """A band half shown on round_hand_lead / _line puts that bone's cartridge 0.75 m away (and the reverse): report any
    hidden piece that lands inside the view."""
    pin = rig.pinch.translation; half = rig.half_rest.translation
    for bone, ctl, half_ctl in (("round_hand_lead", "lead", "halfA"), ("round_hand_line", "line", "halfB")):
        Wb = W[bone]
        if c[half_ctl] is not None:
            p = Wb @ pin
            if in_frustum(p): HIDDEN_REPORT.append(f"{clip}:{f} the {ctl} cartridge (hidden behind its band half) is in view at {tuple(round(x, 3) for x in p)}")
        elif c[ctl] > 0.5:
            p = Wb @ half
            if in_frustum(p): HIDDEN_REPORT.append(f"{clip}:{f} a band half (riding {bone}) is in view at {tuple(round(x, 3) for x in p)}")


def bake(arm, rig, clip, poser):
    act = anim.new_action(arm, clip.name)
    tw_log = []
    for f in range(clip.n + 1):
        del TWISTS[:]
        W, basis = evaluate(clip, f, poser)
        tw_log.append(TWISTS[-1] if TWISTS else 0)
        c = {k: clip.at(k, f, v) for k, v in DEFAULTS.items()}
        check_hidden(clip.name, f, W, c, rig)
        lp = W["arm_l"] @ rig.loop @ Vector((0.0, 0.017, 0.0))
        if lp.y > 0.02 and abs(lp.x) < lp.y * TAN_V * 16.0 / 9.0 and abs(lp.z) < lp.y * TAN_V: LOOP_SEEN.setdefault(clip.name, []).append(f)
        for name, (loc, rot, s) in basis.items():
            if name in CODE: continue
            pb = arm.pose.bones[name]
            pb.location = loc; pb.rotation_quaternion = rot; pb.scale = (s, s, s)
            pb.keyframe_insert("location", frame=f); pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("scale", frame=f)
    print(f"LEFT TWIST {clip.name}: {tw_log}")
    anim.set_interpolation(act, 'LINEAR')
    anim.fix_quaternion_flips(act)
    return act


def animate(arm):
    rig = Rig(arm); poser = Poser(rig)
    acts = []
    made = {c.name: c for c in clips(rig)}
    import revolver_clips2
    for c in revolver_clips2.clips(rig, poser): made[c.name] = c
    for a in manifest.asset(ASSET)["animations"]:
        if a["name"] not in made: raise RuntimeError(f"clip {a['name']} is not authored")
        acts.append(bake(arm, rig, made[a["name"]], poser))
    anim.push_to_nla(arm, acts)
    for line in HIDDEN_REPORT: print("WARNING hidden piece:", line)
    print(f"HIDDEN CHECK {len(HIDDEN_REPORT)} problems")
    for k in made: print(f"LOOP IN VIEW {k}: {LOOP_SEEN.get(k, [])}")
    return rig, poser, made
