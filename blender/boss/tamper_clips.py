"""The Tamper's twelve clips as channel curves over the pose solver of tamper_parts.py. Owner: art-boss-tamper.

Personality (ART_BIBLE 6.3): dutiful, heavy, tireless; it never looks at the player. Every clip is evaluated on every
frame (legs are solved to planted feet, the ram can be aimed at a floor or wall point) and keyed with LINEAR keys, so
what the game samples is exactly what was posed.

A clip is {channel: [(frame, value, ease)]}; `ease` shapes the segment that ENDS at the key:
    's' smooth (ease in and out)   'l' linear   'i' ease in (accelerates: falling weight)   'o' ease out (arrives soft)
    'I' / 'O' the same, cubic      'b' overshoots the key by 12 % and comes back (a hard stop that rings)
Channels are tamper_parts.CHANNELS plus the aim: `ty`, `tz` = a world point (Blender y, z) for the tamping face and
`aw` = how much the arm obeys it (0 = the `as` / `ae` channels, 1 = aimed).
Vent channels `vc` / `vb` exist only in stagger, charge_stun and die (the manifest's rule): everywhere else the lids
stay unkeyed at rest and code opens them.
"""
import math
from mathutils import Vector, Quaternion
from lib import anim
import tamper_parts as tp

EASE = {
    's': lambda t: t * t * (3 - 2 * t), 'l': lambda t: t, 'i': lambda t: t * t, 'o': lambda t: 1 - (1 - t) ** 2,
    'I': lambda t: t ** 3, 'O': lambda t: 1 - (1 - t) ** 3,
    'b': lambda t: 1 + 0.12 * math.sin(math.pi * t) * (t ** 2) * 3.2 if t < 1 else 1.0,
}
EASE['b'] = lambda t: (1 - (1 - t) ** 2) + 0.5 * math.sin(math.pi * t) * t * (1 - t) * 1.0


def ev(keys, f):
    if not keys: return 0.0
    if f <= keys[0][0]: return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if f <= b[0]:
            t = (f - a[0]) / float(b[0] - a[0])
            return a[1] + (b[1] - a[1]) * EASE[b[2] if len(b) > 2 else 's'](t)
    return keys[-1][1]


class Clip:
    def __init__(self, name, frames, loop=False, start=None):
        self.name, self.n, self.loop = name, frames, loop
        self.floor = -0.012                                          # no corner of the tamping head goes below this (the ram gives)
        self.dense = 0                                               # long clips: key every frame up to this one (the rest on every second)
        self.ch = {}
        if start:
            for k, v in start.items(): self.ch[k] = [(0, v, 's')]

    def k(self, frame, ease='s', **vals):
        for c, v in vals.items():
            lst = self.ch.setdefault(c, [])
            if not lst and frame > 0: lst.append((0, 0.0, 's'))
            lst.append((frame, float(v), ease))
        return self

    def track(self, c, pts, ease='s'):
        """pts: [(frame, value)] or [(frame, value, ease)]"""
        for p in pts: self.k(p[0], p[2] if len(p) > 2 else ease, **{c: p[1]})
        return self

    def pose(self, f):
        if self.loop and f >= self.n: f = 0
        out = {}
        for c, k in self.ch.items():
            d = {}
            for q in k: d[q[0]] = q                                  # a later key on the same frame replaces the earlier one
            out[c] = ev([d[fr] for fr in sorted(d)], f)
        return out

    def end(self):
        return self.pose(self.n if not self.loop else 0)


def resolve(p, info):
    """Channel values -> the solver's pose (the aim folded into `as` / `ae`)."""
    q = dict(p)
    w = q.pop("aw", 0.0); ty = q.pop("ty", None); tz = q.pop("tz", None)
    if w > 1e-6 and ty is not None:
        a = tp.aim_ram(q, (tp.ARM_X, ty, tz), info)
        q["as"] = q.get("as", 0.0) * (1 - w) + a["as"] * w
        q["ae"] = q.get("ae", 0.0) * (1 - w) + a["ae"] * w
    return q


# ------------------------------------------------------------------------------------------------ shared poses
def charge_pose():
    return dict(bp=24.0, pp=5.0, pz=-0.06, py=-0.05, ao=8.0, lp=-12.0, ty=0.45, tz=0.13, aw=1.0)


def shoulder_at(p):
    return tp.solve(p)["arm_r_upper"] @ tp.SHOULDER


def unwrap(a, ref):
    """The turn equal to `a` (mod 360) nearest to `ref`: aim_ram's angles come from atan2, a swing over the top
    must keep counting."""
    while a - ref > 180.0: a -= 360.0
    while a - ref < -180.0: a += 360.0
    return a


def arm_to(p, theta, L, info, ref=0.0):
    """as / ae that put the tamping face's centre at distance L from the shoulder, `theta` degrees from straight up
    toward the front (in the arm's plane), with the body in pose p."""
    s = shoulder_at(p)
    t = math.radians(theta)
    a = tp.aim_ram(p, (tp.ARM_X, s.y - L * math.sin(t), s.z + L * math.cos(t)), info)
    return unwrap(a["as"], ref), a["ae"]


def arm_polar(p, info):
    """(theta, L) of the tamping face in pose p (theta from straight up toward the front)."""
    D = tp.solve(p); s = D["arm_r_upper"] @ tp.SHOULDER; h = tp.ram_point(D, info)
    return math.degrees(math.atan2(-(h.y - s.y), h.z - s.z)), (h - s).length


def windup_top(info):
    """The top of the slam wind-up: the ram raised FORWARD over the top until it stands plumb overhead (a hair past),
    the piston run out so the silhouette doubles, the barrel reared back. `as` is counted forward (about +145)."""
    p = dict(bp=-19.0, pp=-3.0, pz=0.03, py=0.03, lp=38.0, fly=-0.10)
    s = shoulder_at(p)
    a = tp.aim_ram(p, (tp.ARM_X, s.y + 0.08, s.z + tp.HEAD_END + 0.82), info)
    p["as"], p["ae"] = unwrap(a["as"], 150.0), a["ae"]
    return p


SLAM_TARGET = (-1.60, 0.03)        # Blender (y, z) of the face centre at impact: 1.6 m ahead, the low corner on the floor


def slam_bottom(info):
    p = dict(bp=27.0, pp=4.0, pz=-0.15, py=-0.07, lp=20.0, fly=-0.10)
    a = tp.aim_ram(p, (tp.ARM_X,) + SLAM_TARGET, info)
    p["as"], p["ae"] = a["as"], a["ae"]
    return p


def slam_frames(info):
    """The slam, one pose per frame (0.3 s = 9 frames). From the overhead pose the arm comes FORWARD over the top
    while the barrel stays reared (the arm leads); the piston draws in as the head passes horizontal (so the head
    only ever travels forward and down, never past the impact mark); then the barrel whips forward 45 degrees and the
    piston fires (f4 - f6), the face lands flat 1.6 m ahead on f6 and the body drops 0.15 m onto it; f7 - f9 ring."""
    top = windup_top(info)
    th0, L0 = arm_polar(top, info)
    #      bp     pp    pz     py    lp    theta        L
    rows = [(None, None, None, None, None, None, None),
            (-19.5, -3.0, 0.035, 0.03, 41.0, th0 + 15.0, L0 - 0.30),
            (-18.5, -2.6, 0.040, 0.025, 44.0, 38.0, 2.02),
            (-14.5, -2.0, 0.030, 0.02, 46.0, 68.0, 1.62),
            (-6.0, -0.5, 0.000, 0.0, 49.0, 101.0, 1.47),
            (9.0, 2.0, -0.070, -0.035, 53.0, 131.0, 1.55)]
    out = [dict(top)]
    for (bp, pp, pz, py, lp, th, L) in rows[1:]:
        p = dict(top); p.update(bp=bp, pp=pp, pz=pz, py=py, lp=lp)
        p["as"], p["ae"] = arm_to(p, th, L, info, ref=out[-1]["as"])
        out.append(p)
    # impact and the ring: the face is aimed at the mark (the piston takes up the body's drop and rock)
    for (bp, pp, pz, py, lp) in ((29.5, 4.5, -0.150, -0.07, 58.0), (30.5, 4.5, -0.165, -0.07, 50.0), (28.0, 4.2, -0.158, -0.07, 40.0), (27.0, 4.0, -0.150, -0.07, 34.0)):
        p = dict(top); p.update(bp=bp, pp=pp, pz=pz, py=py, lp=lp)
        a = tp.aim_ram(p, (tp.ARM_X,) + SLAM_TARGET, info)
        p["as"], p["ae"] = unwrap(a["as"], out[-1]["as"]), a["ae"]
        out.append(p)
    return out


# walk: half stride (m) and the planted share of the cycle. Ground covered per cycle = 2 S / D = 2.0 m, so the clip's own
# ground speed is 2.0 m / 1.2 s = 1.667 m/s: code plays it at speed = (metres per second) / 1.667 (1.5 at the GDD's
# 2.5 m/s) and the planted foot does not slide. S = 0.50 is all the telescoping legs give (0.645 m hip to ankle, with
# the pelvis yawing 10 degrees into each step and sitting 45 mm low at the double support).
WALK_S, WALK_D = 0.50, 0.50
WALK_M_PER_CYCLE = 2.0 * WALK_S / WALK_D
CHARGE_S, CHARGE_D = 0.20, 0.50


WALK_AO = 0.0                     # the ram arm's outward carry while walking (degrees)


def walk_foot(x, S, D, H, toe=14.0, heel=-10.0):
    """One foot over a cycle phase x (0 = touch-down): Blender (y offset, lift z, pitch). Planted (0..D): from -S
    (ahead) to +S (behind) at constant speed. Swing (D..1): a Hermite from +S to -S that leaves and lands at the
    planted speed, the lift rising fast, hanging, and falling with acceleration onto the floor (the stamp)."""
    v = 2.0 * S / D                                                    # planted speed in metres per cycle
    if x < D:
        return -S + v * x, 0.0, 0.0                                    # flat on the floor for the whole stance: nothing to slide
    T = 1.0 - D; t = (x - D) / T; m = v * T
    h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
    y = h00 * S + h10 * m + h01 * (-S) + h11 * m
    z = ev([(0.0, 0.0), (0.38, H, 'o'), (0.70, H * 0.9, 's'), (1.0, 0.0, 'i')], t)
    p = ev([(0.0, 0.0), (0.16, toe, 'o'), (0.55, 0.0, 's'), (0.86, heel, 's'), (1.0, 0.0, 'i')], t)
    return y, z, p


# ------------------------------------------------------------------------------------------------ the clips
def make_clips(frames, info):
    """frames: {clip name: frame count}. Returns [Clip]."""
    C = []

    # ---- idle (loop 2.4 s): the ram rises 0.2 m and settles, a habit
    n = frames["idle"]; c = Clip("idle", n, loop=True)
    c.track("ae", [(0, 0), (20, 0), (36, -0.20, 's'), (46, -0.20), (52, 0.025, 'i'), (56, -0.012, 'o'), (61, 0.0), (n, 0)])
    c.track("as", [(0, 0), (20, 0), (36, 2.5), (46, 2.5), (53, -0.8, 'i'), (60, 0.0), (n, 0)])
    c.track("pz", [(0, 0), (50, 0), (54, -0.014, 'o'), (62, 0.0), (n, 0)])
    c.track("bp", [(0, 0), (18, 0.5), (36, -0.6), (50, -0.3), (55, 1.1, 'o'), (64, 0.0), (n, 0)])
    c.track("br", [(0, 0), (24, 0.5), (48, -0.4), (n, 0)])
    c.track("lp", [(0, 0), (22, 0), (30, 7), (38, 2), (54, 5, 'o'), (62, 0), (n, 0)])
    C.append(c)

    # ---- walk (loop 1.2 s): a two-beat stamp, the barrel rocking 4 degrees side to side; the ram is carried
    # Each foot: planted for D of the cycle, carried back at a constant ground speed (no skating at the clip's own
    # ground speed, 2 S / (D x 1.2 s)); then lifted fast, swung through high and STAMPED down (the drop accelerates
    # into the floor). The swing is a Hermite curve that leaves and lands at the planted speed, so the foot never
    # jerks along the ground. The loop starts at a quarter cycle (mid-stance / mid-swing): no kink sits on the seam.
    n = frames["walk"]; c = Clip("walk", n, loop=True)
    S, D, H, PH0 = WALK_S, WALK_D, 0.18, 0.25
    def foot(tag, ph):
        for fr in range(n + 1):
            x = ((fr / n) + PH0 - ph) % 1.0
            y, z, pch = walk_foot(x, S, D, H)
            c.k(fr, 'l', **{f"f{tag}y": y, f"f{tag}z": z, f"f{tag}p": pch})
    foot("l", 0.0); foot("r", 0.5)
    def per(chn, lst):          # a curve over one cycle in phase units (the same quarter-cycle start)
        for fr in range(n + 1): c.k(fr, 'l', **{chn: ev(lst, ((fr / n) + PH0) % 1.0)})
    # the body vaults over the planted leg (high at mid-stance) and drops onto each stamp (lowest just after touch-down)
    per("pz", [(0, -0.045), (0.05, -0.072, 'o'), (0.27, 0.02, 's'), (0.5, -0.045, 'i'), (0.55, -0.072, 'o'), (0.77, 0.02, 's'), (1.0, -0.045, 'i')])
    per("br", [(0, 0.0), (0.25, 4.0, 'o'), (0.5, 0.0, 'i'), (0.75, -4.0, 'o'), (1.0, 0.0, 'i')])
    per("pr", [(0, 0.0), (0.25, 1.4, 'o'), (0.5, 0.0, 'i'), (0.75, -1.4, 'o'), (1.0, 0.0, 'i')])
    per("px", [(0, 0.0), (0.25, 0.035), (0.5, 0.0), (0.75, -0.035), (1.0, 0.0)])
    per("bp", [(0, 1.0), (0.09, 2.6, 'o'), (0.32, -0.6), (0.5, 1.0), (0.59, 2.6, 'o'), (0.82, -0.6), (1.0, 1.0)])
    # the pelvis swings each hip forward with its foot (10 degrees: the reach), the barrel turns back against it so the
    # cowl keeps looking where it is going
    per("bw", [(0, 8.0), (0.5, -8.0), (1.0, 8.0)])
    per("pw", [(0, -10.0), (0.5, 10.0), (1.0, -10.0)])
    per("ao", [(0, WALK_AO), (1.0, WALK_AO)])
    per("as", [(0, 10.0), (0.12, 5.5, 'o'), (0.5, 8.0), (0.62, 4.0, 'o'), (1.0, 10.0)])
    per("ae", [(0, -0.14), (0.10, -0.085, 'o'), (0.30, -0.14), (0.5, -0.14), (0.60, -0.085, 'o'), (0.80, -0.14), (1.0, -0.14)])
    per("lp", [(0, 4.0), (0.12, 12.0, 'o'), (0.4, 2.0), (0.5, 4.0), (0.62, 12.0, 'o'), (0.9, 2.0), (1.0, 4.0)])
    C.append(c)

    # ---- slam_windup (1.0 s): the ram goes fully overhead: the silhouette doubles (the tell)
    # anticipation (to f6): a shallow crouch, the ram drawn in and back a hair, the barrel's pitch kept under 20
    # degrees so the open chest vent stays in view; then the ram swings FORWARD and up over the top (the tell), the
    # barrel rears back, overshoots, settles cocked and trembling. The vent is code's (open for the whole wind-up).
    n = frames["slam_windup"]; top = windup_top(info); c = Clip("slam_windup", n)
    c.track("pz", [(0, 0), (6, -0.045, 'o'), (18, top["pz"] + 0.02, 's'), (24, top["pz"]), (n, top["pz"])])
    c.track("py", [(0, 0), (6, -0.02), (18, top["py"]), (n, top["py"])])
    c.track("pp", [(0, 0), (6, 1.0), (18, top["pp"]), (n, top["pp"])])
    c.track("bp", [(0, 0), (6, 3.0, 'o'), (18, top["bp"] - 4.0, 's'), (24, top["bp"]), (n, top["bp"])])
    c.track("as", [(0, 0), (6, -3.0, 'o'), (19, top["as"] + 7.0, 's'), (23, top["as"] - 2.0, 's'), (26, top["as"] + 0.8, 's'), (n, top["as"], 's')])
    c.track("ae", [(0, 0), (6, -0.12, 'o'), (12, -0.10, 's'), (20, top["ae"] + 0.05, 's'), (25, top["ae"] - 0.015, 's'), (n, top["ae"], 's')])
    c.track("lp", [(0, 0), (6, -8.0), (18, top["lp"] + 8.0), (25, top["lp"]), (n, top["lp"])])
    c.track("fly", [(0, 0), (7, 0), (13, top["fly"], 's'), (n, top["fly"])])
    c.track("flz", [(0, 0), (7, 0), (10, 0.05, 'o'), (13, 0.0, 'i'), (n, 0)])
    C.append(c)

    # ---- slam (0.3 s): forward over the top and straight down onto the mark 1.6 m ahead; the body drops 0.15 m
    n = frames["slam"]; rows = slam_frames(info); c = Clip("slam", n)
    assert len(rows) == n + 1, (len(rows), n)
    for f, p in enumerate(rows):
        c.k(f, 'l', **{k: v for k, v in p.items() if k in tp.CHANNELS})
    C.append(c)
    slam_end = c.end()

    # ---- slam_recover (1.5 s). The chest vent is open for the first 0.5 s (code): the body rebounds off the planted
    # piston at once (the barrel back to about 20 degrees of pitch by 0.1 s, the piston running out to keep the face
    # on the mark) so the open cavity faces the player; it holds there, then hauls the ram out and comes back to idle.
    n = frames["slam_recover"]; c = Clip("slam_recover", n, start=slam_end)
    c.track("bp", [(0, slam_end["bp"]), (3, 5.0, 'O'), (6, 7.5, 's'), (10, 4.5, 's'), (15, 5.5, 's'), (24, -3.0, 's'), (32, 1.5, 's'), (40, -0.5, 's'), (n, 0.0, 's')])
    c.track("pp", [(0, slam_end["pp"]), (3, 0.5, 'O'), (15, 0.0), (24, -1.0), (34, 0.0), (n, 0.0)])
    c.track("pz", [(0, slam_end["pz"]), (3, -0.07, 'O'), (6, -0.09, 's'), (12, -0.08, 's'), (20, 0.02, 's'), (27, -0.01), (38, -0.012), (41, -0.02, 'i'), (n, 0.0)])
    c.track("py", [(0, slam_end["py"]), (4, -0.03, 'o'), (26, 0.0), (n, 0.0)])
    c.track("lp", [(0, slam_end["lp"]), (6, 30.0, 'o'), (18, -6.0), (30, 5.0), (n, 0.0)])
    c.track("fly", [(0, slam_end["fly"]), (22, slam_end["fly"]), (29, 0.0, 's'), (n, 0.0)])
    c.track("flz", [(0, 0), (22, 0), (25, 0.06, 'o'), (29, 0.0, 'i'), (n, 0)])
    c.track("aw", [(0, 1.0), (13, 1.0), (22, 0.0, 's'), (n, 0.0)])
    c.track("ty", [(0, SLAM_TARGET[0]), (n, SLAM_TARGET[0])])
    c.track("tz", [(0, SLAM_TARGET[1]), (n, SLAM_TARGET[1])])
    p13 = resolve(c.pose(13), info)                                  # where the aim holds the arm when the haul starts
    a13, e13 = unwrap(p13["as"], slam_end["as"]), p13["ae"]
    c.track("as", [(0, slam_end["as"]), (13, a13), (22, a13 * 0.45, 's'), (32, -4.0, 's'), (38, 1.0, 's'), (n, 0.0, 's')])
    c.track("ae", [(0, slam_end["ae"]), (13, e13), (17, e13 + 0.05, 'o'), (22, -0.20, 'I'), (30, 0.04, 's'), (36, -0.01, 's'), (n, 0.0, 's')])
    C.append(c)

    # ---- charge (loop 0.5 s): a low fast stamp, the ram dragging
    n = frames["charge"]; cp = charge_pose(); c = Clip("charge", n, loop=True)
    S, PH0 = CHARGE_S, 0.25                                          # the same foot law as the walk, short and low
    for tag, ph in (("l", 0.0), ("r", 0.5)):
        for fr in range(n + 1):
            x = ((fr / n) + PH0 - ph) % 1.0
            y, z, pch = walk_foot(x, S, CHARGE_D, 0.09, toe=14.0, heel=-4.0)
            c.k(fr, 'l', **{f"f{tag}y": y, f"f{tag}z": z, f"f{tag}p": pch})
    def per(chn, lst):
        for fr in range(n + 1): c.k(fr, 'l', **{chn: ev(lst, ((fr / n) + PH0) % 1.0)})
    per("pz", [(0, cp["pz"] - 0.012), (0.07, cp["pz"] - 0.035, 'o'), (0.3, cp["pz"] + 0.008), (0.5, cp["pz"] - 0.012, 'i'), (0.57, cp["pz"] - 0.035, 'o'), (0.8, cp["pz"] + 0.008), (1.0, cp["pz"] - 0.012, 'i')])
    per("py", [(0, cp["py"]), (1.0, cp["py"])])
    per("pp", [(0, cp["pp"]), (1.0, cp["pp"])])
    per("bp", [(0, cp["bp"]), (0.1, cp["bp"] + 2.0, 'o'), (0.35, cp["bp"] - 0.8), (0.5, cp["bp"]), (0.6, cp["bp"] + 2.0, 'o'), (0.85, cp["bp"] - 0.8), (1.0, cp["bp"])])
    per("br", [(0, 0.0), (0.25, 2.2), (0.5, 0.0), (0.75, -2.2), (1.0, 0.0)])
    per("bw", [(0, 2.0), (0.5, -2.0), (1.0, 2.0)])
    per("ao", [(0, cp["ao"]), (1.0, cp["ao"])])
    per("lp", [(0, cp["lp"]), (0.15, cp["lp"] + 9.0, 's'), (0.5, cp["lp"], 's'), (0.65, cp["lp"] + 9.0, 's'), (1.0, cp["lp"], 's')])
    per("ty", [(0, cp["ty"]), (0.25, cp["ty"] + 0.03), (0.5, cp["ty"]), (0.75, cp["ty"] + 0.03), (1.0, cp["ty"])])
    per("tz", [(0, cp["tz"]), (0.12, cp["tz"] + 0.03, 'o'), (0.3, cp["tz"], 'i'), (0.5, cp["tz"]), (0.62, cp["tz"] + 0.03, 'o'), (0.8, cp["tz"], 'i'), (1.0, cp["tz"])])
    per("aw", [(0, 1.0), (1.0, 1.0)])
    C.append(c)
    charge0 = c.pose(0)

    # ---- charge_windup (0.8 s): cowl down, one foot scrapes back twice, the ram head dragged to the floor
    n = frames["charge_windup"]; c = Clip("charge_windup", n)
    c.track("bp", [(0, 0), (5, cp["bp"] + 4.0, 'o'), (9, cp["bp"] - 1.0), (n, charge0["bp"])])
    c.track("pp", [(0, 0), (6, cp["pp"]), (n, charge0["pp"])])
    c.track("pz", [(0, 0), (6, cp["pz"] - 0.02, 'o'), (11, cp["pz"]), (n, charge0["pz"])])
    c.track("py", [(0, 0), (8, cp["py"]), (n, charge0["py"])])
    c.track("br", [(0, 0), (6, 2.5), (12, 1.0), (18, 2.5), (n, charge0["br"])])
    c.track("bw", [(0, 0), (n, charge0["bw"])])
    # the arm swings OUTBOARD first (f0 - f3, past the charge's own 8 degrees), and only then is the head let down and
    # dragged back: its inboard edge passes the right foot with a hand's width to spare
    c.track("ao", [(0, 0), (3, cp["ao"] + 4.0, 'o'), (12, cp["ao"] + 4.0), (18, cp["ao"], 's'), (n, cp["ao"])])
    c.track("as", [(0, 0), (3, 7.0, 'o'), (n, 7.0)])
    c.track("ae", [(0, 0), (3, -0.10, 'o'), (n, -0.10)])
    c.track("aw", [(0, 0.0), (3, 0.0), (11, 1.0, 's'), (n, 1.0)])
    c.track("ty", [(0, -0.45), (3, -0.45), (11, 0.40, 's'), (17, 0.52), (n, charge0["ty"])])
    c.track("tz", [(0, 0.33), (3, 0.33), (9, 0.22, 's'), (11, 0.13, 'i'), (13, 0.165, 'o'), (15, 0.13, 'i'), (n, charge0["tz"])])
    c.track("lp", [(0, 0), (6, 10.0), (12, cp["lp"]), (n, charge0["lp"])])
    # the right foot scrapes back twice (toe down, on the floor), each return lifted; the last return goes to the loop's start
    c.track("fry", [(0, 0), (2, -0.05), (7, 0.27, 'i'), (10, -0.04, 's'), (12, -0.05), (17, 0.27, 'i'), (n, charge0["fry"], 's')])
    c.track("frz", [(0, 0), (2, 0.02), (3, 0.0), (7, 0.0), (9, 0.07, 'o'), (11, 0.0, 'i'), (17, 0.0), (20, 0.06, 'o'), (n, charge0["frz"], 'i')])
    c.track("frp", [(0, 0), (3, 9.0), (7, 14.0), (9, -3.0), (12, 9.0), (17, 14.0), (20, -3.0), (n, charge0["frp"])])
    c.track("fly", [(0, 0), (18, 0.0), (n, charge0["fly"])])
    c.track("flz", [(0, 0), (18, 0), (21, 0.035), (n, charge0["flz"], 'i')])
    C.append(c)

    # ---- charge_stun (2.0 s): impact, rocks back onto its heels, vent_back flaps open and stays open, ram buried
    n = frames["charge_stun"]; c = Clip("charge_stun", n, start=charge0)
    c.dense = 12
    c.floor = lambda f: -0.012 if f < 6 else -0.06                   # it comes in skidding like the charge, then digs in (the dent)
    c.track("py", [(0, charge0["py"]), (3, -0.13, 'O'), (13, 0.075, 's'), (22, 0.035), (34, 0.06), (48, 0.04), (n, 0.05)])
    c.track("pz", [(0, charge0["pz"]), (3, -0.05, 'o'), (13, -0.11, 's'), (22, -0.09), (n, -0.095)])
    c.track("pp", [(0, charge0["pp"]), (3, 9.0, 'O'), (13, -10.0, 's'), (22, -6.0), (34, -8.0), (48, -6.5), (n, -7.0)])
    c.track("bp", [(0, charge0["bp"]), (3, 34.0, 'O'), (14, 0.0, 's'), (23, 8.0), (35, 4.0), (48, 6.5), (n, 5.5)])
    c.track("br", [(0, charge0["br"]), (4, -3.0), (16, 2.0), (30, -1.0), (44, 0.6), (n, 0.0)])
    c.track("bw", [(0, charge0["bw"]), (4, 6.0, 'O'), (18, -2.0), (n, 0.0)])
    c.track("ao", [(0, cp["ao"]), (2, cp["ao"] + 5.0, 'o'), (7, cp["ao"] + 5.0), (14, cp["ao"], 's'), (n, cp["ao"])])   # thrown wide of the foot
    c.track("aw", [(0, 1.0), (n, 1.0)])
    c.track("ty", [(0, charge0["ty"]), (2, 0.35, 'i'), (6, -1.02, 'l'), (n, -1.02)])
    c.track("tz", [(0, charge0["tz"]), (3, 0.26, 'o'), (6, -0.045, 'i'), (9, -0.03, 'o'), (n, -0.03)])
    c.track("lp", [(0, charge0["lp"]), (3, 40.0, 'O'), (12, -26.0, 's'), (20, -10.0), (30, -24.0), (42, -16.0), (n, -20.0)])
    for tag in ("l", "r"):
        y0 = charge0[f"f{tag}y"]
        c.track(f"f{tag}y", [(0, y0), (n, y0)])
        c.track(f"f{tag}z", [(0, charge0[f"f{tag}z"]), (2, 0.0, 'i'), (9, 0.0), (14, 0.035, 's'), (24, 0.022), (n, 0.025)])
        c.track(f"f{tag}p", [(0, charge0[f"f{tag}p"]), (2, 0.0), (8, 0.0), (14, -15.0, 's'), (23, -9.0), (34, -12.0), (48, -10.0), (n, -10.5)])
    c.track("vb", [(0, 0.0), (3, 0.0), (8, 97.0, 'o'), (12, 66.0, 's'), (16, 87.0), (20, 76.0), (25, 81.5), (30, 80.0), (n, 80.0)])
    c.track("vc", [(0, 0.0), (3, 0.0), (5, 9.0, 'o'), (8, 0.0, 'i'), (10, 3.0, 'o'), (12, 0.0, 'i'), (n, 0.0)])
    C.append(c)

    # ---- stagger (1.5 s; 3.0 s as line_stagger): a step back, the ram drops, the barrel twists away
    n = frames["stagger"]; c = Clip("stagger", n)
    c.track("bw", [(0, 0), (5, -27.0, 'O'), (12, -20.0), (24, -23.0), (38, 2.0, 's'), (n, 0.0)])
    c.track("bp", [(0, 0), (4, -12.0, 'O'), (11, -5.0), (20, -8.0), (36, 1.5, 's'), (n, 0.0)])
    c.track("br", [(0, 0), (5, -6.0, 'O'), (14, -2.5), (24, -4.0), (37, 0.5), (n, 0.0)])
    c.track("py", [(0, 0), (4, 0.06, 'o'), (11, 0.16, 's'), (26, 0.14), (38, 0.0, 's'), (n, 0.0)])
    c.track("pz", [(0, 0), (4, 0.012), (11, -0.05, 'i'), (16, -0.02, 'o'), (28, -0.03), (39, -0.012), (n, 0.0)])
    c.track("pp", [(0, 0), (5, -5.0, 'O'), (14, -2.0), (36, 0.0), (n, 0.0)])
    c.track("pw", [(0, 0), (8, -6.0), (26, -5.0), (38, 0.0), (n, 0.0)])
    # the right foot steps back and takes the weight; later it comes forward again
    c.track("fry", [(0, 0), (3, 0), (10, 0.30, 's'), (29, 0.30), (37, 0.0, 's'), (n, 0.0)])
    c.track("frz", [(0, 0), (3, 0), (6, 0.085, 'o'), (10, 0.0, 'I'), (29, 0.0), (33, 0.07, 'o'), (37, 0.0, 'I'), (n, 0.0)])
    c.track("frp", [(0, 0), (6, -8.0), (10, 0.0, 'i'), (29, 0.0), (32, 8.0), (37, 0.0), (n, 0.0)])
    c.track("frw", [(0, 0), (10, -9.0), (29, -9.0), (37, 0.0), (n, 0.0)])
    c.track("fly", [(0, 0), (13, 0), (19, 0.10, 's'), (30, 0.10), (36, 0.0), (n, 0.0)])
    c.track("flz", [(0, 0), (13, 0), (16, 0.04, 'o'), (19, 0.0, 'i'), (30, 0.0), (33, 0.035), (36, 0.0, 'i'), (n, 0.0)])
    # the ram drops to the floor under its own weight, then is hauled up again
    c.track("as", [(0, 0), (5, 9.0, 'O'), (12, -5.0, 's'), (24, -3.0), (36, 3.0), (41, -0.8), (n, 0.0)])
    c.track("ae", [(0, 0), (3, -0.04), (11, 0.32, 'I'), (13, 0.29, 'o'), (15, 0.315, 'i'), (25, 0.315), (37, -0.05, 's'), (41, 0.012, 'i'), (n, 0.0)])
    c.track("ao", [(0, 0), (8, 5.0), (26, 4.0), (38, 0.0), (n, 0.0)])
    c.track("lp", [(0, 0), (4, 48.0, 'O'), (12, -14.0, 's'), (22, 10.0), (32, -4.0), (n, 0.0)])
    c.track("lr", [(0, 0), (5, -14.0, 'O'), (16, 4.0), (30, 0.0), (n, 0.0)])
    # the lids rattle on the jolt (small: code may be holding them open over this clip)
    c.track("vc", [(0, 0.0), (3, 13.0, 'o'), (6, 0.0, 'i'), (9, 6.5, 'o'), (12, 0.0, 'i'), (14, 2.5, 'o'), (16, 0.0, 'i'), (n, 0.0)])
    c.track("vb", [(0, 0.0), (4, 10.0, 'o'), (8, 0.0, 'i'), (11, 5.0, 'o'), (14, 0.0, 'i'), (16, 2.0, 'o'), (18, 0.0, 'i'), (n, 0.0)])
    C.append(c)

    # ---- flinch_plate (0.2 s): a 3 degree rock, no step
    n = frames["flinch_plate"]; c = Clip("flinch_plate", n)
    c.track("bp", [(0, 0), (2, -3.0, 'O'), (4, 0.8, 's'), (n, 0.0)])
    c.track("br", [(0, 0), (2, 1.2, 'O'), (n, 0.0)])
    c.track("pz", [(0, 0), (2, -0.012, 'o'), (n, 0.0)])
    c.track("ae", [(0, 0), (3, 0.035, 'o'), (n, 0.0, 'i')])
    c.track("as", [(0, 0), (3, 2.0, 'o'), (n, 0.0)])
    c.track("lp", [(0, 0), (3, 9.0, 'o'), (n, 0.0)])
    C.append(c)

    # ---- die (2.2 s): stops mid-stroke; the ram sinks slowly under its own weight; lids fall shut; it does not fall
    n = frames["die"]; c = Clip("die", n)
    c.track("bp", [(0, -6.0), (2, -9.5, 'o'), (4, -5.5), (6, -7.0), (30, -2.0, 'i'), (48, 9.0, 's'), (51, 11.5, 'o'), (56, 10.0), (n, 10.0)])
    c.track("br", [(0, 0.0), (3, 1.5), (6, 0.0), (48, -3.5, 's'), (n, -3.5)])
    c.track("pz", [(0, 0.0), (3, 0.01), (30, -0.025, 's'), (48, -0.065, 's'), (51, -0.08, 'o'), (56, -0.07), (n, -0.07)])
    c.track("pp", [(0, 0.0), (48, 3.0), (n, 3.0)])
    c.track("pr", [(0, 0.0), (48, -1.5), (n, -1.5)])
    c.track("aw", [(0, 1.0), (n, 1.0)])
    c.track("ty", [(0, -1.85), (2, -1.87), (4, -1.84), (6, -1.85), (22, -1.90, 'i'), (47, -1.32, 'i'), (n, -1.32)])
    c.track("tz", [(0, 1.75), (2, 1.80, 'o'), (4, 1.73), (6, 1.74), (22, 1.45, 'I'), (47, 0.10, 'i'), (49, 0.135, 'o'), (51, 0.10, 'i'), (n, 0.10)])
    c.track("lp", [(0, 14.0), (3, 24.0), (8, 10.0), (34, -22.0, 's'), (44, -17.0), (54, -21.0), (n, -20.0)])
    c.track("vc", [(0, 0.0), (3, 52.0, 'O'), (6, 44.0), (11, 0.0, 'I'), (14, 9.0, 'o'), (17, 0.0, 'i'), (19, 2.5, 'o'), (21, 0.0, 'i'), (n, 0.0)])
    c.track("vb", [(0, 0.0), (4, 46.0, 'O'), (9, 38.0), (16, 0.0, 'I'), (19, 7.0, 'o'), (22, 0.0, 'i'), (24, 2.0, 'o'), (26, 0.0, 'i'), (n, 0.0)])
    C.append(c)

    # ---- pound_bulkhead (loop 2.6 s): wind-up, slam on a VERTICAL target 2.7 m ahead at 1.5 m, recover
    n = frames["pound_bulkhead"]; c = Clip("pound_bulkhead", n, loop=True)
    # drawn back and up by the shoulder (cocked), then the face is AIMED flat into the wall and hauled back
    # (the impact sits on an even frame: long clips are keyed on every second frame)
    c.track("aw", [(0, 0.0), (30, 0.0), (36, 1.0, 'I'), (44, 1.0), (58, 0.0, 's'), (n, 0.0)])
    c.track("ty", [(0, -2.70), (36, -2.70), (38, -2.665, 'o'), (40, -2.70, 'i'), (n, -2.70)])
    c.track("tz", [(0, 1.50), (n, 1.50)])
    c.track("bp", [(0, 2.0), (8, 4.0), (26, -13.0, 's'), (30, -14.5), (36, 13.0, 'I'), (38, 16.5, 'o'), (44, 13.0), (62, 4.0, 's'), (n, 2.0)])
    c.track("pz", [(0, 0.0), (8, -0.03), (26, 0.025, 's'), (30, 0.03), (36, -0.05, 'I'), (38, -0.075, 'o'), (44, -0.05), (62, -0.01), (n, 0.0)])
    c.track("py", [(0, 0.0), (26, 0.05), (36, -0.10, 'I'), (44, -0.09), (62, -0.02), (n, 0.0)])
    c.track("pp", [(0, 0.0), (26, -2.5), (36, 3.5, 'I'), (62, 0.5), (n, 0.0)])
    c.track("lp", [(0, 0.0), (26, 26.0), (36, 34.0), (38, 55.0, 'o'), (50, 12.0), (64, -4.0), (n, 0.0)])
    c.track("fly", [(0, -0.12), (n, -0.12)])
    c.track("fry", [(0, 0.10), (n, 0.10)])
    # the free-swing channels arrive exactly where the aim holds the arm (impact f36, release f44): the blend into
    # the aim can then never carry the face past the wall, and the piston fires late (cubic) so it lands as a punch
    def aimed(f):
        q = dict(c.pose(f)); q["aw"] = 1.0
        r = resolve(q, info)
        return unwrap(r["as"], 84.0), r["ae"]
    a36, e36 = aimed(36); a44, e44 = aimed(44)
    c.track("as", [(0, 40.0), (8, 34.0), (26, 122.0, 's'), (30, 127.0), (36, a36), (44, a44), (62, 46.0, 's'), (n, 40.0)])
    c.track("ae", [(0, -0.06), (8, -0.02), (26, -0.18, 's'), (30, -0.19), (36, e36, 'I'), (44, e44), (62, 0.0, 's'), (n, -0.06)])
    C.append(c)
    return C


# ------------------------------------------------------------------------------------------------ the floor
def _sole_corners(sx):
    return [Vector((sx * tp.HIP_X + dx, tp.HIP_C.y - 0.06 + dy, 0.0)) for dx in (-0.265, 0.265) for dy in (-0.315, 0.315)]


def _head_corners():
    M = tp.M_ARM() @ tp.M_HEAD()
    return [M @ Vector((dx, dy, z)) for dx in (-0.285, 0.285) for dy in (-0.285, 0.285) for z in (-tp.HEAD_END, -(tp.HEAD_END - 0.25))]


_HEAD = None


def on_floor(p, info, head_floor=-0.012):
    """The floor is solid. A pitched foot is lifted until its lowest sole corner stands on z = 0 (it rolls over its toe
    or heel instead of sinking), and the piston gives until no corner of the tamping head is below `head_floor`.
    Returns (pose, D, lowest sole z, lowest head corner z)."""
    global _HEAD
    if _HEAD is None: _HEAD = _head_corners()
    p = dict(p)
    D = tp.solve(p, info)
    lowf = 9.0
    for sx, tag in ((1, "l"), (-1, "r")):
        z = min((D[f"leg_{tag}_foot"] @ c).z for c in _sole_corners(sx))
        if z < -1e-5:
            p[f"f{tag}z"] = p.get(f"f{tag}z", 0.0) - z; z = 0.0
        lowf = min(lowf, z)
    D = tp.solve(p, info)
    lowh = min((D["arm_r_ram"] @ c).z for c in _HEAD)
    for _ in range(3):
        if lowh >= head_floor - 1e-4: break
        uz = (D["arm_r_upper"].to_3x3() @ (tp.M_ARM().to_3x3() @ Vector((0, 0, -1)))).z
        if uz > -0.2: break                                          # the arm lies too flat for the piston to lift the head
        p["ae"] = p.get("ae", 0.0) - (head_floor - lowh) / (-uz)
        D = tp.solve(p, info)
        lowh = min((D["arm_r_ram"] @ c).z for c in _HEAD)
    return p, D, lowf, lowh


# ------------------------------------------------------------------------------------------------ keying
def keep_constant(keyed, name, report=print):
    """Blender's glTF exporter (with export_optimize_animation_keep_anim_armature off, which this asset needs for the
    vent rule) DROPS a bone channel whose sampled values do not change over the clip, even when that value is not the
    rest pose: `charge` holds the pelvis pitched 5 degrees for the whole loop, the track vanished, and in the game the
    pelvis stood upright with both feet tipped 5 degrees heel-down through the floor. A channel that is constant and
    NOT at rest gets an imperceptible nudge on its middle key (0.3 mm / 0.03 degrees) so the exporter keeps it."""
    if len(keyed) < 3: return
    mid = keyed[len(keyed) // 2][1]
    for b in keyed[0][1]:
        for ch in keyed[0][1][b]:
            vals = [tuple(k[1][b][ch]) for k in keyed]
            ptp = max(max(v[i] for v in vals) - min(v[i] for v in vals) for i in range(len(vals[0])))
            if ptp >= 2e-4: continue
            v0 = vals[0]
            at_rest = (max(abs(c) for c in v0) < 1e-5) if ch == "loc" else (abs(abs(v0[0]) - 1.0) < 1e-9)
            if at_rest: continue
            if ch == "loc": mid[b][ch] = (v0[0], v0[1], v0[2] + 0.0003)
            else: mid[b][ch] = Quaternion(mid[b][ch]) @ Quaternion((1, 0, 0), math.radians(0.03))
            report(f"KEEP {name}: {b}.{ch} is constant off rest: nudged on the middle key so the exporter keeps the track")


VENT_CLIPS = ("stagger", "charge_stun", "die")


def key_clips(arm, asset, info, report=print):
    """Create one action per manifest clip on `arm`, keyed on every frame, and push them to NLA."""
    from lib import manifest
    names = [a["name"] for a in manifest.asset(asset)["animations"]]
    frames = {n: anim.frames(asset, n) for n in names}
    clips = {c.name: c for c in make_clips(frames, info)}
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    acts = []
    # only what really moves is keyed (the export drops the unkeyed channels): a bone on a fixed pivot has no location track
    KEYED = {"pelvis": ("loc", "rot"), "barrel": ("rot",), "arm_r_upper": ("rot",), "arm_r_ram": ("loc",), "arm_l": ("rot",),
             "leg_l_upper": ("rot",), "leg_r_upper": ("rot",), "leg_l_foot": ("loc", "rot"), "leg_r_foot": ("loc", "rot")}
    for name in names:
        c = clips[name]
        act = anim.new_action(arm, name)
        lo, hi = 9.0, 0.0; hz = []; low_foot = low_head = 9.0; keyed = []
        # long clips are keyed on every second frame (LINEAR keys: the optimiser then drops the in-between samples and
        # the file halves); anything quick is keyed on every frame
        step = 2 if c.n >= 40 else 1                                 # (the walk is keyed on every frame: its stance must stay linear)
        for f in sorted(set(range(0, c.n + 1, step)) | set(range(0, min(c.n, c.dense) + 1)) | {c.n}):   # c.dense: every frame of a violent opening
            p = resolve(c.pose(f), info)
            p, D, lowf, lowh = on_floor(p, info, c.floor(f) if callable(c.floor) else c.floor)
            low_foot = min(low_foot, lowf); low_head = min(low_head, lowh)
            lo = min(lo, *D["leg_len"]); hi = max(hi, *D["leg_len"])
            pose = {}
            for b, par in tp.PARENT.items():
                if b.startswith("vent_"): continue
                L = (D[par].inverted() @ D[b]) if par else D[b]
                B = rest[b].inverted() @ L @ rest[b]
                loc, q, _ = B.decompose()
                full = {"loc": tuple(loc), "rot": q}
                if "loc" not in KEYED[b] and loc.length > 1e-5: raise RuntimeError(f"{name} frame {f}: {b} leaves its pivot by {loc.length:.4f} m")
                pose[b] = {k: full[k] for k in KEYED[b]}
            h = tp.ram_point(D, info); hz.append((h.z, -h.y))
            if name in VENT_CLIPS:
                pose["vent_chest"] = {"rot": Quaternion((1, 0, 0), math.radians(p.get("vc", 0.0)))}
                pose["vent_back"] = {"rot": Quaternion((1, 0, 0), math.radians(p.get("vb", 0.0)))}
            keyed.append((f, pose))
        keep_constant(keyed, name, report)
        for f, pose in keyed: anim.key_pose(arm, f, pose)
        anim.fix_quaternion_flips(act); anim.set_interpolation(act, 'LINEAR')
        flag = "" if tp.LEG_MIN <= lo and hi <= tp.LEG_MAX else "   <-- LEG OUT OF RANGE"
        report(f"CLIP {name:16s} {c.n:3d} frames  leg {lo:.3f} .. {hi:.3f}  ram face z {min(z for z, _ in hz):.3f} .. {max(z for z, _ in hz):.3f}, "
               f"ends z {hz[-1][0]:.3f} at {hz[-1][1]:.2f} m ahead; lowest sole {low_foot:.3f}, lowest head corner {low_head:.3f}{flag}")
        acts.append(act)
    report(f"WALK {WALK_M_PER_CYCLE:.3f} m per cycle (stance {WALK_D:.2f} of the cycle, linear, half stride {WALK_S:.2f} m): "
           f"own ground speed {WALK_M_PER_CYCLE / 1.2:.3f} m/s; play at speed = v / {WALK_M_PER_CYCLE / 1.2:.3f} ({2.5 * 1.2 / WALK_M_PER_CYCLE:.3f} at 2.5 m/s)")
    report(f"CHARGE {2.0 * CHARGE_S / CHARGE_D:.3f} m per cycle: own ground speed {2.0 * CHARGE_S / CHARGE_D / 0.5:.3f} m/s (slides by design at 9 m/s)")
    anim.push_to_nla(arm, acts)
    return clips
