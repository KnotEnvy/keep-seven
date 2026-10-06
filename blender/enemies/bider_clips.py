"""The Bider's 18 clips as animator's numbers (art-enemies-bider). `pose(clip, frame, frames)` -> the pose dictionary
that bider_build.solve() turns into bone transforms. Durations are the manifest's; this file only shapes the motion.

Channels (every value is a tuple of floats; angles in degrees, lengths in metres, Blender space: the figure faces -Y):
  hip (x, y, z)            the pelvis joint          hip_r (pitch, yaw, roll)   + pitch = lean forward
  hip_q (w, x, y, z) + hip_qw   the pelvis as a quaternion instead (the tumble of die_back)
  spine, chest, neck, head (pitch, yaw, roll) relative to the parent
  headg + headg_w          a WORLD orientation for the head and how much of it to take (the level, still hood)
  hpin + hpin_w            a WORLD position for the head joint: spine and chest bend to keep it there (the still head)
  sh_l/r (pitch, yaw, roll)  shoulders: yaw - = hunched forward, roll + = drooped
  ua_l/r (forward, out, twist)  upper arm from hanging, in the world (arm_ch 0) or relative to the chest (arm_ch 1)
  el_l/r (flex)   ha_l/r (toward the thumb, twist, back-bend)
  pin_l/r + pin_*_w + pin_*_r (forward, out, twist) + ep_l/r   a hand pinned in the world (IK), its rotation, the elbow's way
  ft_l/r (ankle x, y, z) + ft_*_r (pitch, yaw, roll) + kn_l/r (the way the knee points)      planted feet (IK)
  legfk_l/r + th_l/r (forward, out, twist) + knf_l/r + ftl_l/r     a leg driven from the hip instead (lying poses)
  tail_l/r (back, out, twist) + tail_h (0 = hang in the world, 1 = follow the hips)
  root_yaw                 turn_about only: the clip is authored in the world and the solver takes this much yaw out
                           again, because CODE turns the root (linearly, to the figure's left) while the clip plays
Keys are placed in normalised time 0..1 per channel and interpolated with a monotone cubic (no overshoot, eased at
extremes); loops wrap. The root never moves: travel, and the 180 degrees of `turn_about`'s root, are code's.
"""
import math
from mathutils import Vector
from bider_build import foot, V, solve, J, eul, Rz, Ry, Rx, foot_points

_fl, _flr = foot(0.105, 0.015, yaw=9)
_fr, _frr = foot(-0.100, 0.120, yaw=-12)

STOOP = dict(
    hip=(0.0, 0.235, 0.862), hip_r=(36.0, 0.0, 0.0), hip_q=(1.0, 0.0, 0.0, 0.0), hip_qw=(0.0,), root_yaw=(0.0,),
    spine=(17.0, 0.0, 0.0), chest=(20.0, 0.0, 0.0), neck=(-22.0, 0.0, 0.0), head=(-32.0, 0.0, 0.0),
    headg=(19.0, 0.0, 0.0), headg_w=(0.0,), hpin=(0.0, -0.30, 1.20), hpin_w=(0.0,),
    sh_l=(0.0, -12.0, 6.0), sh_r=(0.0, -12.0, 6.0), arm_ch=(0.0,),
    ua_l=(9.0, 0.0, 14.0), ua_r=(4.0, 1.0, 14.0), el_l=(17.0,), el_r=(11.0,), ha_l=(0.0, 0.0, 0.0), ha_r=(0.0, 0.0, 0.0),
    pin_l=(0.3, -0.3, 0.0), pin_l_w=(0.0,), pin_l_r=(90.0, 0.0, -90.0), ep_l=(0.5, 0.8, -0.3),
    pin_r=(-0.3, -0.3, 0.0), pin_r_w=(0.0,), pin_r_r=(90.0, 0.0, -90.0), ep_r=(-0.5, 0.8, -0.3),
    ft_l=_fl, ft_l_r=_flr, kn_l=(0.20, -1.0, 0.0), ft_r=_fr, ft_r_r=_frr, kn_r=(-0.22, -1.0, 0.0),
    legfk_l=(0.0,), th_l=(0.0, 0.0, 0.0), knf_l=(0.0,), ftl_l=(0.0, 0.0, 0.0),
    legfk_r=(0.0,), th_r=(0.0, 0.0, 0.0), knf_r=(0.0,), ftl_r=(0.0, 0.0, 0.0),
    tail_l=(5.0, 3.0, 0.0), tail_r=(7.0, 3.0, 0.0), tail_h=(0.0,),
)
GROUPS = {
    "body": ("hip", "hip_r", "hip_q", "hip_qw", "spine", "chest", "neck", "root_yaw"),
    "head": ("head", "headg", "headg_w", "hpin", "hpin_w"),
    "arm_l": ("sh_l", "ua_l", "el_l", "ha_l", "pin_l", "pin_l_w", "pin_l_r", "ep_l"),
    "arm_r": ("sh_r", "ua_r", "el_r", "ha_r", "pin_r", "pin_r_w", "pin_r_r", "ep_r"),
    "leg_l": ("ft_l", "ft_l_r", "kn_l", "legfk_l", "th_l", "knf_l", "ftl_l"),
    "leg_r": ("ft_r", "ft_r_r", "kn_r", "legfk_r", "th_r", "knf_r", "ftl_r"),
    "tails": ("tail_l", "tail_r", "tail_h"), "space": ("arm_ch",),
}


def _tup(v): return tuple(float(x) for x in v) if isinstance(v, (tuple, list, Vector)) else (float(v),)


def mk(base, **kw):
    d = dict(base)
    for k, v in kw.items():
        if k not in STOOP: raise KeyError(f"unknown channel {k}")
        d[k] = _tup(v)
    return d


def head_of(P):
    """World position of the head joint of pose P (with its pin switched off)."""
    return tuple(solve(mk(P, hpin_w=0))["neck"] @ J["head"])


def quat(e):
    q = eul(e).to_quaternion(); return (q.w, q.x, q.y, q.z)


def qm(m):
    q = m.to_quaternion(); return (q.w, q.x, q.y, q.z)


class Clip:
    def __init__(self, base=None, loop=False, post=None, ground=True):
        self.base = dict(base or STOOP); self.loop = loop; self.keys = {}; self.post = post
        self.ground = ground                                            # keep the boots out of the floor (grounded())

    def key(self, t, **ch):
        for k, v in ch.items():
            if k not in self.base: raise KeyError(f"unknown channel {k}")
            ks = self.keys.setdefault(k, [])
            ks[:] = [x for x in ks if abs(x[0] - float(t)) > 1e-9]      # a later key at the same time replaces the earlier one
            ks.append((float(t), _tup(v)))
        return self

    def pose(self, t, P, *groups, skip=()):
        """Key a whole pose (or only some channel groups of it) at t."""
        names = [k for g in (groups or GROUPS) for k in GROUPS[g]]
        return self.key(t, **{k: P[k] for k in names if k not in skip})

    def _sorted(self, k):
        ks = sorted(self.keys[k], key=lambda x: x[0])
        if k == "hip_q":                                                # the short way round, in time order
            out = [ks[0]]
            for t, v in ks[1:]:
                if sum(a * b for a, b in zip(out[-1][1], v)) < 0: v = tuple(-x for x in v)
                out.append((t, v))
            ks = out
        return ks

    def _chan(self, k, u):
        ks = self._sorted(k)
        if len(ks) == 1: return ks[0][1]
        if self.loop:
            if ks[0][0] > 1e-9 or ks[-1][0] < 1 - 1e-9:
                ks = [(ks[-1][0] - 1.0, ks[-1][1])] + ks + [(ks[0][0] + 1.0, ks[0][1])]
            span = ks[-1][0] - ks[0][0]
            ext = [(ks[-2][0] - span, ks[-2][1])] + ks + [(ks[1][0] + span, ks[1][1])]
        else:
            ext = [None] + ks + [None]
        u = min(max(u, ks[0][0]), ks[-1][0])
        for i in range(1, len(ext) - 2):
            (t0, v0), (t1, v1) = ext[i], ext[i + 1]
            if t0 <= u <= t1 and t1 > t0: break
        h = t1 - t0; s = (u - t0) / h
        p, nx = ext[i - 1], ext[i + 2]
        out = []
        for c in range(len(v0)):
            d = (v1[c] - v0[c]) / h

            def tang(a, b, cc, d_in, d_out):
                if a is None or cc is None or d_in * d_out <= 0: return 0.0
                h0 = b[0] - a[0]; h1 = cc[0] - b[0]
                w1 = 2 * h1 + h0; w2 = h1 + 2 * h0
                return (w1 + w2) / (w1 / d_in + w2 / d_out)
            m0 = tang(p, ext[i], ext[i + 1], ((v0[c] - p[1][c]) / (t0 - p[0])) if p else 0.0, d)
            m1 = tang(ext[i], ext[i + 1], nx, d, ((nx[1][c] - v1[c]) / (nx[0] - t1)) if nx else 0.0)
            s2, s3 = s * s, s * s * s
            out.append((2 * s3 - 3 * s2 + 1) * v0[c] + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1[c] + (s3 - s2) * h * m1)
        return tuple(out)

    def at(self, u):
        P = dict(self.base)
        for k in self.keys: P[k] = self._chan(k, u)
        if self.post: P = self.post(P, u)
        return P


def _add(P, k, d):
    P[k] = tuple(a + b for a, b in zip(P[k], d))


def _sin(u, cycles=1.0, phase=0.0): return math.sin(2 * math.pi * (u * cycles + phase))
def _cos(u, cycles=1.0, phase=0.0): return math.cos(2 * math.pi * (u * cycles + phase))
def _lag(u, cycles, lag): return _sin(u, cycles, -lag) - _sin(0, cycles, -lag)       # a late sine that is still 0 at u = 0


def _breath(P, u, cycles=1.0, amp=1.0):
    """A slow breath: the chest opens, the shoulders rise a touch, the head answers late. Zero at u = 0."""
    b = 0.5 - 0.5 * _cos(u, cycles)
    _add(P, "chest", (-1.7 * amp * b, 0, 0)); _add(P, "spine", (-0.8 * amp * b, 0, 0))
    _add(P, "sh_l", (0, 0, -2.4 * amp * b)); _add(P, "sh_r", (0, 0, -2.4 * amp * b))
    b2 = (0.5 - 0.5 * _cos(u, cycles, -0.09)) - (0.5 - 0.5 * _cos(0, cycles, -0.09))
    _add(P, "head", (1.8 * amp * b2, 0, 0))
    return P


S = STOOP
HEAD0 = head_of(S)
CLIPS = {}

# ---------------------------------------------------------------------------------------------------- idle_stoop
def _idle_post(P, u):
    _breath(P, u, 1.0)
    w = _sin(u); w2 = _lag(u, 1.0, 0.12)                                # weight from foot to foot, once a loop
    _add(P, "hip", (0.016 * w, 0.004 * _sin(u, 2.0), -0.004 * abs(w)))
    _add(P, "hip_r", (0, 0, 1.2 * w)); _add(P, "spine", (0, 0, -0.9 * w2)); _add(P, "chest", (0, 0.8 * w2, -0.6 * w2))
    _add(P, "ua_l", (1.5 * w2, 0.6 * w2, 0)); _add(P, "ua_r", (-1.5 * w2, -0.6 * w2, 0))
    _add(P, "el_l", (1.5 * w2,)); _add(P, "el_r", (-1.5 * w2,))
    _add(P, "tail_l", (1.0 * w2, 0, 0)); _add(P, "tail_r", (-1.0 * w2, 0, 0))
    return P


CLIPS["idle_stoop"] = Clip(loop=True, post=_idle_post)

# ---------------------------------------------------------------------------------------------------- run
# a heavy forward fall caught by each step; arms trail; the head is pinned: level and still, a steady target
_RUNB = mk(S, hip=(0.0, 0.165, 0.795), hip_r=(43.0, 0.0, 0.0), spine=(14.0, 0, 0), chest=(16.0, 0, 0), neck=(-24.0, 0, 0),
           headg=(17.0, 0, 0), headg_w=1, sh_l=(0, -16, 4), sh_r=(0, -16, 4), kn_l=(0.10, -1, 0), kn_r=(-0.10, -1, 0))
_RUNB = mk(_RUNB, hpin=head_of(_RUNB), hpin_w=1)


def _run_post(P, u):
    b = _cos(u, 2.0, -0.17)                                             # +1 just after each foot strikes: the body at its lowest
    _add(P, "hip", (0.014 * _sin(u, 1.0, 0.13), 0.012 * _sin(u, 2.0, -0.05), -0.034 * b))
    _add(P, "hip_r", (2.5 * b, -7.0 * _cos(u), 3.0 * _sin(u, 1.0, 0.13)))
    _add(P, "spine", (0, 3.0 * _cos(u), -2.0 * _sin(u, 1.0, 0.13))); _add(P, "chest", (0, 9.0 * _cos(u, 1.0, -0.04), 0))
    sw = _cos(u, 1.0, -0.07)                                            # arms trail: slack, late, never pumping
    P["ua_l"] = (-30.0 - 11.0 * sw, 5.0, 16.0); P["ua_r"] = (-30.0 + 11.0 * sw, 5.0, 16.0)
    P["el_l"] = (24.0 - 9.0 * _cos(u, 1.0, -0.16),); P["el_r"] = (24.0 + 9.0 * _cos(u, 1.0, -0.16),)
    P["ha_l"] = (0, 0, 14.0 * _sin(u, 1.0, -0.30)); P["ha_r"] = (0, 0, -14.0 * _sin(u, 1.0, -0.30))
    P["tail_l"] = (34.0 + 10.0 * _sin(u, 2.0, -0.30), 7.0, 0); P["tail_r"] = (34.0 + 10.0 * _sin(u, 2.0, -0.42), 7.0, 0)
    _add(P, "hpin", (0, 0, 0.012 * _cos(u, 2.0, -0.30)))
    return P


def _run():
    c = Clip(_RUNB, loop=True, post=_run_post)
    for sd, s, ph in (("l", 1, 0.0), ("r", -1, 0.5)):
        for t, y, lift, pitch in ((0.00, -0.34, 0.0, -14), (0.09, -0.04, 0.0, 0), (0.25, 0.46, 0.0, 38), (0.37, 0.60, 0.26, 70),
                                  (0.55, 0.22, 0.30, 46), (0.76, -0.26, 0.18, 6), (0.92, -0.40, 0.08, -18)):
            a, r = foot(s * 0.095, y, lift, pitch, 4 * s)
            c.key((t + ph) % 1.0, **{f"ft_{sd}": a, f"ft_{sd}_r": r})
    return c


CLIPS["run"] = _run()

# ---------------------------------------------------------------------------------------------------- circle_strafe (P2)
# a cross-over side-step toward the figure's left (+X): the left foot leads and is planted BEHIND the line, the right
# foot is carried across IN FRONT of it; the hips ride over whichever foot is down and turn with the crossing leg; the
# hood (pinned, level) never leaves the player. Hands in, slack.
_STRB = mk(S, hip=(0.0, 0.215, 0.825), hip_r=(38.0, 0, 0), headg=(19.0, 0, 0), headg_w=1, ua_l=(10, 3, 14), ua_r=(6, 3, 14), el_l=(24,), el_r=(20,),
           kn_l=(0.30, -1, 0), kn_r=(-0.06, -1, 0))
_STRB = mk(_STRB, hpin=head_of(_STRB), hpin_w=1)


def _strafe_post(P, u):
    b = _cos(u, 2.0, -0.12)
    sway = _sin(u, 1.0, 0.07)                                           # + = over the left foot (planted 0 .. 0.42)
    _add(P, "hip", (0.050 * sway, 0.0, -0.028 * b)); _add(P, "hip_r", (1.5 * b, -9.0 * _sin(u, 1.0, -0.20), 3.5 * sway))
    _add(P, "spine", (0, 3.0 * _sin(u, 1.0, -0.20), -2.5 * sway)); _add(P, "chest", (0, 4.0 * _sin(u, 1.0, -0.24), 0))
    sw = _sin(u, 1.0, -0.28)                                            # the arms hang and are left behind by the hips
    _add(P, "ua_l", (5.0 * sw, 1.5 * sw, 0)); _add(P, "ua_r", (-5.0 * sw, -1.5 * sw, 0)); _add(P, "el_l", (4 * sw,)); _add(P, "el_r", (-4 * sw,))
    P["tail_l"] = (8.0, 5.0 + 6.0 * _sin(u, 1.0, -0.15), 0); P["tail_r"] = (8.0, 5.0 - 6.0 * _sin(u, 1.0, -0.15), 0)
    return P


def _strafe():
    c = Clip(_STRB, loop=True, post=_strafe_post)
    for sd, x0, ph, yy, yw in (("l", -0.02, 0.0, 0.140, 12), ("r", -0.22, 0.5, -0.140, -4)):
        # each foot is planted at its far side (+X) and rides back under the body (the root does not move: code does),
        # then is picked up and carried across: the right one passes in front of the left shin
        for t, dx, lift, pitch in ((0.00, 0.32, 0.0, 0), (0.42, 0.0, 0.0, 8), (0.55, 0.03, 0.075, 22), (0.75, 0.19, 0.115, 6), (0.93, 0.32, 0.025, -8)):
            a, r = foot(x0 + dx, yy, lift, pitch, yw)
            c.key((t + ph) % 1.0, **{f"ft_{sd}": a, f"ft_{sd}_r": r})
    return c


CLIPS["circle_strafe"] = _strafe()

# ---------------------------------------------------------------------------------------------------- lunge
# windup: the whole body sinks under a head that does not move; lunge: both arms thrown ahead; recover: stumbles to a stop
_wl, _wlr = foot(0.115, 0.035, 0.0, 22, 12); _wr, _wrr = foot(-0.115, 0.150, 0.0, 30, -14)
_WIND = mk(S, hip=(0.0, 0.080, 0.675), hip_r=(17.0, 0, 0), spine=(8.0, 0, 0), chest=(10.0, 0, 0), neck=(-8.0, 0, 0),
           headg=(17.0, 0, 0), headg_w=1, hpin=(HEAD0[0], HEAD0[1], HEAD0[2] - 0.030), hpin_w=1,
           sh_l=(0, 6, -3), sh_r=(0, 6, -3), ua_l=(-56, 14, 22), ua_r=(-60, 14, 22), el_l=(52,), el_r=(46,), ha_l=(0, 0, -18), ha_r=(0, 0, -18),
           ft_l=_wl, ft_l_r=_wlr, ft_r=_wr, ft_r_r=_wrr, kn_l=(0.34, -1, 0), kn_r=(-0.36, -1, 0), tail_l=(24, 10, 0), tail_r=(26, 10, 0))


def _windup():
    c = Clip(S)
    s0 = mk(S, headg=(19.0, 0, 0), headg_w=1, hpin=HEAD0, hpin_w=1)
    c.pose(0.0, s0); c.pose(1.0, _WIND)
    mid = {k: tuple(a + (b - a) * 0.80 for a, b in zip(s0[k], _WIND[k])) for k in s0}
    c.pose(0.50, mid, "body", "leg_l", "leg_r", "head")                 # the drop is quick, the settle slow
    # the arms go forward a hand before they are drawn back (anticipation), and arrive late
    c.key(0.16, ua_l=(16, 2, 14), ua_r=(12, 2, 14), el_l=(22,), el_r=(18,))
    c.key(0.72, ua_l=(-44, 12, 20), ua_r=(-46, 12, 20), el_l=(46,), el_r=(40,))
    c.key(0.62, tail_l=(30, 8, 0), tail_r=(32, 8, 0))
    return c


CLIPS["lunge_windup"] = _windup()

_la, _lar = foot(0.105, -0.300, 0.0, 0, 6); _lb, _lbr = foot(-0.105, 0.420, 0.06, 52, -8)
_LUNGE = mk(S, hip=(0.0, -0.060, 0.715), hip_r=(56.0, 0, 0), spine=(9.0, 0, 0), chest=(7.0, 0, 0), neck=(-26.0, 0, 0), head=(-34.0, 0, 0),
            sh_l=(0, -24, -8), sh_r=(0, -24, -8), ua_l=(97, 7, 30), ua_r=(101, 7, 30), el_l=(16,), el_r=(12,), ha_l=(0, 0, 22), ha_r=(0, 0, 22),
            ft_l=_la, ft_l_r=_lar, ft_r=_lb, ft_r_r=_lbr, kn_l=(0.12, -1, 0), kn_r=(-0.12, -1, 0), tail_l=(46, 10, 0), tail_r=(50, 10, 0))


def _lunge():
    c = Clip(S)
    c.pose(0.0, _WIND)
    c.key(0.0, headg_w=1, hpin_w=1); c.key(0.25, headg_w=0, hpin_w=0)
    # push: the legs straighten behind, the arms swing through low
    a1, r1 = foot(0.110, 0.130, 0.0, 46, 10); a2, r2 = foot(-0.110, 0.260, 0.0, 56, -12)
    c.key(0.30, hip=(0, -0.020, 0.770), hip_r=(46, 0, 0), spine=(12, 0, 0), chest=(12, 0, 0), neck=(-22, 0, 0), head=(-30, 0, 0),
          ft_l=a1, ft_l_r=r1, ft_r=a2, ft_r_r=r2, ua_l=(14, 10, 24), ua_r=(18, 10, 24), el_l=(44,), el_r=(40,), sh_l=(0, -8, -6), sh_r=(0, -8, -6),
          tail_l=(40, 10, 0), tail_r=(44, 10, 0))
    # flight: stretched out, arms ahead of everything
    a1, r1 = foot(0.105, -0.200, 0.13, -8, 6); a2, r2 = foot(-0.105, 0.500, 0.16, 62, -8)
    c.key(0.62, hip=(0, -0.085, 0.790), hip_r=(60, 0, 0), spine=(8, 0, 0), chest=(4, 0, 0), neck=(-28, 0, 0), head=(-36, 0, 0),
          ft_l=a1, ft_l_r=r1, ft_r=a2, ft_r_r=r2, ua_l=(104, 6, 30), ua_r=(108, 6, 30), el_l=(6,), el_r=(4,), ha_l=(0, 0, 10), ha_r=(0, 0, 10),
          sh_l=(0, -26, -10), sh_r=(0, -26, -10), tail_l=(62, 12, 0), tail_r=(58, 12, 0))
    c.pose(1.0, _LUNGE, skip=("headg_w", "hpin_w", "hpin", "headg"))
    return c


CLIPS["lunge"] = _lunge()


def _recover():
    c = Clip(S)
    c.pose(0.0, _LUNGE); c.pose(1.0, S)
    # the trailing foot swings through and catches; the front foot is dragged back under; a last small step
    a, r = foot(-0.100, 0.200, 0.10, 30, -10); c.key(0.14, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, -0.090, 0.0, -6, -10); c.key(0.30, ft_r=a, ft_r_r=r)
    a, r = foot(0.105, -0.300, 0.0, 10, 8); c.key(0.32, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, -0.110, 0.05, 8, 9); c.key(0.48, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, 0.015, 0.0, 0, 9); c.key(0.62, ft_l=a, ft_l_r=r)
    a, r = foot(-0.100, -0.090, 0.0, 8, -10); c.key(0.62, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, 0.030, 0.045, 10, -11); c.key(0.76, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, 0.120, 0.0, 0, -12); c.key(0.90, ft_r=a, ft_r_r=r)
    c.key(0.30, hip=(0.0, -0.020, 0.690), hip_r=(52, 0, 0), spine=(14, 0, 0), chest=(14, 0, 0))            # overbalanced, low
    c.key(0.62, hip=(0.0, 0.150, 0.800), hip_r=(40, 0, 0), spine=(18, 0, 0), chest=(22, 0, 0))
    c.key(0.84, hip=(0.0, 0.250, 0.852), hip_r=(34, 0, 0))                                               # rocks back past the stoop
    c.key(0.26, ua_l=(40, 6, 20), ua_r=(46, 6, 20), el_l=(30,), el_r=(26,))                                # the arms fall, swing past, settle
    c.key(0.56, ua_l=(-14, 3, 14), ua_r=(-18, 3, 14), el_l=(10,), el_r=(8,)); c.key(0.82, ua_l=(14, 0, 14), ua_r=(9, 1, 14))
    c.key(0.45, tail_l=(-6, 6, 0), tail_r=(-4, 6, 0)); c.key(0.75, tail_l=(12, 3, 0), tail_r=(14, 3, 0))
    c.key(0.35, neck=(-24, 0, 0), head=(-30, 0, 0)); c.key(0.72, neck=(-22, 9, 0), head=(-30, 20, 3))      # the slow turn of the hood
    return c


CLIPS["lunge_recover"] = _recover()

# ---------------------------------------------------------------------------------------------------- stumble
def _stumble():
    c = Clip(S)
    c.pose(0.0, S); c.pose(1.0, S)
    a, r = foot(0.105, 0.080, 0.035, 42, 9); c.key(0.22, ft_l=a, ft_l_r=r)                                # the toe catches
    a, r = foot(0.105, -0.150, 0.0, -4, 6); c.key(0.52, ft_l=a, ft_l_r=r)                                 # and slams down ahead
    a, r = foot(0.105, -0.150, 0.0, 12, 6); c.key(0.72, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, -0.060, 0.03, 6, 8); c.key(0.86, ft_l=a, ft_l_r=r)
    c.key(0.30, hip=(0.022, 0.150, 0.812), hip_r=(46, 0, 3), spine=(21, 0, 2), chest=(24, -8, 0), neck=(-14, 0, 0), head=(-24, 0, -5))
    c.key(0.55, hip=(0.026, 0.090, 0.775), hip_r=(50, 0, 4), spine=(22, 0, 3), chest=(24, -12, 0), neck=(-20, 0, 0), head=(-34, 0, -4))
    c.key(0.80, hip=(0.010, 0.190, 0.840), hip_r=(40, 0, 1), spine=(18, 0, 0), chest=(21, -3, 0))
    c.key(0.26, ua_r=(48, 22, 30), el_r=(40,), ha_r=(0, 0, 25), sh_r=(0, -22, -6))                         # a hand out
    c.key(0.52, ua_r=(74, 28, 36), el_r=(14,), ha_r=(0, 0, 38), sh_r=(0, -26, -8)); c.key(0.78, ua_r=(30, 12, 20), el_r=(22,), ha_r=(0, 0, 10))
    c.key(0.40, ua_l=(-32, 16, 14), el_l=(34,)); c.key(0.74, ua_l=(-6, 6, 14), el_l=(24,))
    c.key(0.36, tail_l=(26, 6, 0), tail_r=(30, 6, 0)); c.key(0.70, tail_l=(-4, 4, 0), tail_r=(0, 4, 0))
    return c


CLIPS["stumble"] = _stumble()

# ---------------------------------------------------------------------------------------------------- falter (P2)
_FALT = mk(S, hip=(0.0, 0.215, 0.872), hip_r=(22.0, 0, 0), spine=(11.0, 0, 0), chest=(11.0, 0, 0), neck=(-16.0, 0, 0), head=(-24.0, 0, 0),
           sh_l=(0, -4, -4), sh_r=(0, -4, -4), ua_l=(36, 16, 6), ua_r=(32, 18, 6), el_l=(78,), el_r=(84,), ha_l=(0, 0, 26), ha_r=(0, 0, 26),
           tail_l=(-6, 4, 0), tail_r=(-4, 4, 0))


def _falter_post(P, u):
    b = _cos(u, 2.0, -0.10)
    _add(P, "hip", (0.012 * _sin(u), 0.010 * _sin(u, 2.0, 0.1), -0.014 * b)); _add(P, "hip_r", (0, 3.0 * _sin(u, 1.0, 0.05), 1.5 * _sin(u)))
    t = _sin(u, 1.0, -0.02)                                             # the hood turns side to side, the shoulders a beat behind
    _add(P, "neck", (0, 9.0 * t, 0)); _add(P, "head", (2.0 * abs(t), 17.0 * t, -2.0 * t)); _add(P, "chest", (0, 5.0 * _sin(u, 1.0, -0.14), 0))
    q = _sin(u, 2.0, -0.15)
    _add(P, "ua_l", (4 * q, 2 * q, 0)); _add(P, "ua_r", (-4 * q, -2 * q, 0)); _add(P, "el_l", (5 * q,)); _add(P, "el_r", (-5 * q,))
    _add(P, "ha_l", (0, 0, 6 * _sin(u, 2.0, -0.3))); _add(P, "ha_r", (0, 0, -6 * _sin(u, 2.0, -0.3)))
    _add(P, "tail_l", (4 * b, 0, 0)); _add(P, "tail_r", (-4 * b, 0, 0))
    return P


def _falter():
    c = Clip(_FALT, loop=True, post=_falter_post)
    for sd, s, ph in (("l", 1, 0.0), ("r", -1, 0.5)):
        for t, y, lift, pitch in ((0.00, 0.230, 0.0, 10), (0.10, 0.180, 0.0, 0), (0.58, -0.110, 0.0, 0), (0.70, -0.090, 0.05, 18), (0.86, 0.130, 0.06, 16)):
            a, r = foot(s * 0.105, y, lift, pitch, 10 * s)
            c.key((t + ph) % 1.0, **{f"ft_{sd}": a, f"ft_{sd}_r": r})
    return c


CLIPS["falter"] = _falter()

# ---------------------------------------------------------------------------------------------------- sitting on the ground
# seated on its heels, hands flat on the ground, the head a little raised
_SIT = mk(S, hip=(0.0, 0.205, 0.305), hip_r=(15.0, 0, 0), spine=(12.0, 0, 0), chest=(14.0, 0, 0), neck=(-10.0, 0, 0), head=(-24.0, 0, 0),
          sh_l=(0, -6, 12), sh_r=(0, -6, 12),
          ft_l=(0.100, 0.215, 0.075), ft_l_r=(168, 5, 0), kn_l=(0.30, -1, -0.1), ft_r=(-0.100, 0.220, 0.075), ft_r_r=(168, -7, 0), kn_r=(-0.32, -1, -0.1),
          pin_l=(0.285, -0.060, 0.034), pin_l_w=1, pin_l_r=(90, 14, -90), ep_l=(0.7, 0.7, 0.3),
          pin_r=(-0.280, -0.035, 0.034), pin_r_w=1, pin_r_r=(90, 18, -90), ep_r=(-0.7, 0.7, 0.3),
          tail_l=(42, 4, 0), tail_r=(41, 5, 0))                           # the tails lie over the heels, their hems on the ground


def _sit_down():
    c = Clip(S)
    c.pose(0.0, S); c.pose(1.0, _SIT, skip=("pin_l_w", "pin_r_w"))
    c.key(0.0, pin_l_w=0, pin_r_w=0)
    # two failing steps: each shorter, each lower
    a, r = foot(-0.100, 0.075, 0.045, 14, -12); c.key(0.09, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, -0.010, 0.0, 0, -12); c.key(0.20, ft_r=a, ft_r_r=r)
    c.key(0.22, ft_l=S["ft_l"], ft_l_r=S["ft_l_r"])
    a, r = foot(0.105, -0.030, 0.03, 12, 9); c.key(0.31, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, -0.075, 0.0, 0, 9); c.key(0.40, ft_l=a, ft_l_r=r)
    c.key(0.40, ft_r=(-0.100, -0.005, 0.105), ft_r_r=(24, -12, 0))
    # the knees give: heels rise, the shins go down, the feet turn over onto their insteps
    c.key(0.52, ft_l=(0.103, 0.010, 0.150), ft_l_r=(44, 8, 0), ft_r=(-0.100, 0.080, 0.165), ft_r_r=(50, -10, 0))
    c.key(0.64, ft_l=(0.101, 0.130, 0.118), ft_l_r=(78, 6, 0), ft_r=(-0.100, 0.170, 0.115), ft_r_r=(82, -8, 0))
    c.key(0.77, ft_l=(0.100, 0.200, 0.078), ft_l_r=(132, 5, 0), ft_r=(-0.100, 0.212, 0.076), ft_r_r=(136, -7, 0))
    c.key(0.90, ft_l=_SIT["ft_l"], ft_l_r=_SIT["ft_l_r"], ft_r=_SIT["ft_r"], ft_r_r=_SIT["ft_r_r"])
    c.key(0.40, kn_l=(0.22, -1, 0), kn_r=(-0.24, -1, 0)); c.key(0.66, kn_l=_SIT["kn_l"], kn_r=_SIT["kn_r"])
    # the body: sags with each step, drops onto the knees (0.62), tips forward with the fall, then sits BACK on the heels
    c.key(0.10, hip=(-0.012, 0.215, 0.840), hip_r=(38, 0, -2)); c.key(0.20, hip=(-0.010, 0.170, 0.815), hip_r=(40, 0, -1))
    c.key(0.31, hip=(0.010, 0.135, 0.800), hip_r=(41, 0, 2)); c.key(0.40, hip=(0.006, 0.105, 0.760), hip_r=(42, 0, 1))
    c.key(0.52, hip=(0.0, 0.070, 0.560), hip_r=(40, 0, 0)); c.key(0.63, hip=(0.0, 0.085, 0.395), hip_r=(34, 0, 0))
    c.key(0.76, hip=(0.0, 0.185, 0.322), hip_r=(22, 0, 0)); c.key(0.88, hip=(0.0, 0.212, 0.298), hip_r=(13, 0, 0))
    c.key(0.22, spine=(19, 0, 0), chest=(23, 0, 0)); c.key(0.52, spine=(22, 0, 0), chest=(26, 0, 0)); c.key(0.66, spine=(24, 0, 0), chest=(27, 0, 0))
    c.key(0.84, spine=(15, 0, 0), chest=(17, 0, 0)); c.key(0.93, spine=(11, 0, 0), chest=(12.5, 0, 0))
    # the hood: hangs through the fall, is thrown down as the knees land, and lifts last: relief
    c.key(0.40, neck=(-20, 0, 0), head=(-26, 0, 0)); c.key(0.66, neck=(-8, 0, 0), head=(-6, 0, 2)); c.key(0.82, neck=(-9, 0, 0), head=(-14, 0, 1))
    c.key(0.94, neck=(-10, 0, 0), head=(-26, 0, 0))
    # the arms: slack, left behind by the drop, then down: the hands land flat a beat after the seat does
    c.key(0.22, ua_l=(14, 1, 14), ua_r=(10, 2, 14), el_l=(20,), el_r=(15,)); c.key(0.42, ua_l=(18, 4, 14), ua_r=(16, 4, 14), el_l=(24,), el_r=(22,))
    c.key(0.58, ua_l=(30, 14, 10), ua_r=(28, 15, 10), el_l=(52,), el_r=(50,), ha_l=(0, 0, 30), ha_r=(0, 0, 30), sh_l=(0, -10, -6), sh_r=(0, -10, -6))
    c.key(0.70, ua_l=(26, 16, 0), ua_r=(26, 17, 0), el_l=(36,), el_r=(36,), ha_l=(0, -30, 40), ha_r=(0, -30, 40))
    c.key(0.66, pin_l_w=0, pin_r_w=0); c.key(0.82, pin_l_w=1); c.key(0.86, pin_r_w=1)
    c.key(0.66, pin_l=(0.285, -0.070, 0.20), pin_r=(-0.280, -0.045, 0.22)); c.key(0.82, pin_l=_SIT["pin_l"]); c.key(0.86, pin_r=_SIT["pin_r"])
    c.key(0.88, sh_l=(0, -6, 14), sh_r=(0, -6, 14))
    # the coat tails: fly up as it drops, settle over the heels
    c.key(0.30, tail_l=(8, 4, 0), tail_r=(10, 4, 0)); c.key(0.56, tail_l=(30, 8, 0), tail_r=(34, 8, 0)); c.key(0.72, tail_l=(74, 9, 0), tail_r=(70, 10, 0))
    c.key(0.88, tail_l=(50, 5, 0), tail_r=(48, 6, 0))
    return c


CLIPS["sit_down"] = _sit_down()


def _sit_breathe_post(P, u):
    _breath(P, u, 1.0, 1.5)
    _add(P, "hip_r", (-0.8 * (0.5 - 0.5 * _cos(u)), 0, 0)); _add(P, "neck", (0, 1.2 * _sin(u, 1.0), 0)); _add(P, "head", (0, 2.0 * _lag(u, 1.0, 0.1), 0))
    return P


CLIPS["sit_breathe"] = Clip(_SIT, loop=True, post=_sit_breathe_post)

# ---------------------------------------------------------------------------------------------------- at the table
# on a chair (seat 0.45 m, the root on the floor under it), hands flat on a table top (0.76 to 0.80 m): wrists at 0.795
_tl, _tlr = foot(0.105, -0.330, yaw=7); _tr, _trr = foot(-0.105, -0.300, yaw=-9)
_TABLE = mk(S, hip=(0.0, 0.050, 0.566), hip_r=(9.0, 0, 0), spine=(9.0, 0, 0), chest=(10.0, 0, 0), neck=(-4.0, 0, 0), head=(-12.0, 0, 0),
            sh_l=(0, -10, 8), sh_r=(0, -10, 8), ft_l=_tl, ft_l_r=_tlr, kn_l=(0.14, -1, 0.5), ft_r=_tr, ft_r_r=_trr, kn_r=(-0.16, -1, 0.5),
            pin_l=(0.170, -0.530, 0.795), pin_l_w=1, pin_l_r=(90, -16, -90), ep_l=(0.9, 0.4, -0.45),
            pin_r=(-0.165, -0.515, 0.795), pin_r_w=1, pin_r_r=(90, -12, -90), ep_r=(-0.9, 0.4, -0.45),
            tail_l=(-100, 1, 0), tail_r=(-100, 1, 0))                     # it sits ON its coat: the tails lie forward along the seat, under the thighs


def _table_post(P, u):
    _breath(P, u, 1.0, 1.4)
    _add(P, "neck", (0, 1.0 * _sin(u), 0)); _add(P, "head", (0, 1.6 * _lag(u, 1.0, 0.1), 0))
    return P


CLIPS["sit_table"] = Clip(_TABLE, loop=True, post=_table_post)


def _rise():
    c = Clip(S)
    c.pose(0.0, _TABLE); c.pose(1.0, S, skip=("pin_l_w", "pin_r_w", "pin_l", "pin_r"))
    # leans in over its hands, presses, and the seat comes off the chair; then the hands let go and it steps back into the stoop
    c.key(0.16, hip=(0.0, 0.030, 0.568), hip_r=(18, 0, 0), spine=(12, 0, 0), chest=(13, 0, 0), neck=(-8, 0, 0), head=(-18, 0, 0))
    c.key(0.36, hip=(0.0, -0.020, 0.670), hip_r=(33, 0, 0), spine=(15, 0, 0), chest=(17, 0, 0), neck=(-18, 0, 0), head=(-30, 0, 0))
    c.key(0.56, hip=(0.0, 0.020, 0.800), hip_r=(46, 0, 0), spine=(18, 0, 0), chest=(20, 0, 0))
    c.key(0.78, hip=(0.0, 0.180, 0.868), hip_r=(38, 0, 0))
    c.key(0.0, pin_l_w=1, pin_r_w=1); c.key(0.46, pin_l_w=1, pin_r_w=1); c.key(0.60, pin_l_w=0); c.key(0.66, pin_r_w=0)
    c.key(0.0, pin_l=_TABLE["pin_l"], pin_r=_TABLE["pin_r"]); c.key(1.0, pin_l=_TABLE["pin_l"], pin_r=_TABLE["pin_r"])
    c.key(0.30, sh_l=(0, -14, -8), sh_r=(0, -14, -8)); c.key(0.62, ua_l=(40, 8, 14), ua_r=(38, 8, 14), el_l=(40,), el_r=(40,))
    c.key(0.82, ua_l=(2, 2, 14), ua_r=(-2, 2, 14), el_l=(12,), el_r=(8,))
    c.key(0.46, ft_l=_TABLE["ft_l"], ft_l_r=_TABLE["ft_l_r"], ft_r=_TABLE["ft_r"], ft_r_r=_TABLE["ft_r_r"])
    a, r = foot(-0.102, -0.120, 0.06, 14, -11); c.key(0.60, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, 0.120, 0.0, 0, -12); c.key(0.74, ft_r=a, ft_r_r=r)
    c.key(0.70, ft_l=_TABLE["ft_l"], ft_l_r=_TABLE["ft_l_r"])
    a, r = foot(0.105, -0.180, 0.055, 12, 8); c.key(0.82, ft_l=a, ft_l_r=r)
    c.key(0.40, kn_l=(0.16, -1, 0.2), kn_r=(-0.18, -1, 0.2)); c.key(0.70, kn_l=S["kn_l"], kn_r=S["kn_r"])
    c.key(0.16, tail_l=(-96, 1, 0), tail_r=(-96, 1, 0)); c.key(0.40, tail_l=(-62, 3, 0), tail_r=(-60, 3, 0)); c.key(0.56, tail_l=(-28, 5, 0), tail_r=(-24, 5, 0)); c.key(0.70, tail_l=(-8, 6, 0), tail_r=(-6, 6, 0)); c.key(0.88, tail_l=(10, 3, 0), tail_r=(12, 3, 0))
    return c


CLIPS["rise_from_seat"] = _rise()

# ---------------------------------------------------------------------------------------------------- climb_out
# the edge is a line 0.15 m BEHIND the root; the pit (1.2 m deep) is behind it; the figure ends standing at the root
_EDGE_Y = 0.15


def _climb():
    c = Clip(S, ground=False)                                           # it starts in a pit
    hl = (0.200, _EDGE_Y - 0.150, 0.034); hr = (-0.195, _EDGE_Y - 0.130, 0.034)
    low = mk(S, hip=(0.0, _EDGE_Y + 0.330, -0.800), hip_r=(8, 0, 0), spine=(6, 0, 0), chest=(4, 0, 0), neck=(-16, 0, 0), head=(-22, 0, 0),
             ft_l=(0.110, _EDGE_Y + 0.300, -1.112), ft_l_r=(0, 8, 0), ft_r=(-0.110, _EDGE_Y + 0.360, -1.112), ft_r_r=(0, -8, 0), kn_l=(0.5, -1, 0), kn_r=(-0.5, -1, 0),
             sh_l=(0, -10, -14), sh_r=(0, -10, -14), ua_l=(150, 10, 20), ua_r=(150, 10, 20), el_l=(30,), el_r=(30,),
             pin_l=(0.20, _EDGE_Y + 0.060, -0.200), pin_r=(-0.195, _EDGE_Y + 0.050, -0.260), pin_l_w=1, pin_r_w=1,
             pin_l_r=(150, 6, -90), pin_r_r=(150, 6, -90), ep_l=(0.6, 0.6, -0.6), ep_r=(-0.6, 0.6, -0.6), tail_l=(4, 6, 0), tail_r=(4, 6, 0))
    c.pose(0.0, low); c.pose(1.0, S, skip=("pin_l", "pin_r", "pin_l_w", "pin_r_w", "pin_l_r", "pin_r_r"))
    # two hands over the edge, one after the other
    c.key(0.10, pin_l=(0.20, _EDGE_Y - 0.060, 0.150), pin_l_r=(120, 6, -90)); c.key(0.17, pin_l=hl, pin_l_r=(90, 8, -90))
    c.key(0.15, pin_r=(-0.195, _EDGE_Y - 0.040, 0.160), pin_r_r=(120, 6, -90)); c.key(0.23, pin_r=hr, pin_r_r=(90, 10, -90))
    c.key(0.58, pin_l=hl, pin_l_w=1, pin_l_r=(90, 8, -90)); c.key(0.66, pin_r=hr, pin_r_w=1, pin_r_r=(90, 10, -90))
    c.key(0.72, pin_l_w=0); c.key(0.80, pin_r_w=0); c.key(1.0, pin_l=hl, pin_r=hr, pin_l_r=(90, 8, -90), pin_r_r=(90, 10, -90))
    # the body comes up between the arms, folds over the edge, a knee, then the other foot
    c.key(0.17, hip=(0.0, _EDGE_Y + 0.330, -0.640), hip_r=(10, 0, 0))
    c.key(0.36, hip=(0.0, _EDGE_Y + 0.250, -0.300), hip_r=(26, 0, 0), spine=(14, 0, 0), chest=(14, 0, 0), neck=(-22, 0, 0), head=(-32, 0, 0))
    c.key(0.52, hip=(0.0, _EDGE_Y + 0.120, 0.160), hip_r=(52, 0, 4), spine=(18, 0, 0), chest=(18, 0, 0), neck=(-26, 0, 0), head=(-36, 0, 0))
    c.key(0.68, hip=(0.01, _EDGE_Y + 0.060, 0.470), hip_r=(56, 0, 3), spine=(18, 0, 0), chest=(20, 0, 0))
    c.key(0.84, hip=(0.0, 0.200, 0.760), hip_r=(44, 0, 0))
    c.key(0.17, ft_l=(0.110, _EDGE_Y + 0.250, -1.020), ft_l_r=(30, 8, 0), ft_r=(-0.110, _EDGE_Y + 0.300, -1.060), ft_r_r=(40, -8, 0))
    c.key(0.36, ft_l=(0.115, _EDGE_Y + 0.180, -0.740), ft_l_r=(50, 8, 0), ft_r=(-0.110, _EDGE_Y + 0.330, -0.900), ft_r_r=(60, -8, 0))
    c.key(0.52, ft_l=(0.130, _EDGE_Y + 0.060, 0.070), ft_l_r=(70, 12, 0), ft_r=(-0.110, _EDGE_Y + 0.330, -0.560), ft_r_r=(66, -8, 0))      # the left knee is on the edge
    c.key(0.52, kn_l=(0.5, -1, 0.3), kn_r=(-0.3, -1, 0))
    c.key(0.68, ft_l=(0.125, _EDGE_Y + 0.080, 0.066), ft_l_r=(72, 12, 0), ft_r=(-0.115, _EDGE_Y - 0.100, 0.130), ft_r_r=(10, -12, 0))
    a, r = foot(-0.100, 0.120, 0.0, 0, -12); c.key(0.78, ft_r=a, ft_r_r=r, kn_r=S["kn_r"])
    c.key(0.80, ft_l=(0.115, _EDGE_Y + 0.040, 0.120), ft_l_r=(46, 10, 0), kn_l=(0.3, -1, 0.1))
    a, r = foot(0.105, 0.015, 0.03, 10, 9); c.key(0.92, ft_l=a, ft_l_r=r, kn_l=S["kn_l"])
    c.key(0.50, sh_l=(0, -12, -10), sh_r=(0, -12, -10)); c.key(0.76, ua_l=(30, 8, 14), ua_r=(34, 8, 14), el_l=(34,), el_r=(30,))
    c.key(0.90, ua_l=(4, 1, 14), ua_r=(0, 2, 14), el_l=(12,), el_r=(8,))
    c.key(0.40, tail_l=(-10, 6, 0), tail_r=(-8, 6, 0)); c.key(0.66, tail_l=(-40, 8, 0), tail_r=(-36, 8, 0)); c.key(0.86, tail_l=(-6, 4, 0), tail_r=(-4, 4, 0))
    return c


CLIPS["climb_out"] = _climb()

# ---------------------------------------------------------------------------------------------------- the kneeler
# kneeling at a trough whose rim (0.5 m) starts 0.36 m in front of the root; the cup rides hand_socket_r
_RIM_Y = -0.400
_KNEEL = mk(S, hip=(0.0, 0.110, 0.405), hip_r=(17.0, 0, 0), spine=(11.0, 0, 0), chest=(13.0, 0, 0), neck=(-8.0, 0, 0), head=(-14.0, 0, 0),
            sh_l=(0, -10, 8), sh_r=(0, -14, 4),
            ft_l=(0.105, 0.215, 0.052), ft_l_r=(168, 5, 0), kn_l=(0.22, -1, -0.2), ft_r=(-0.105, 0.220, 0.052), ft_r_r=(168, -6, 0), kn_r=(-0.24, -1, -0.2),
            pin_l=(0.215, _RIM_Y, 0.528), pin_l_w=1, pin_l_r=(90, -22, -90), ep_l=(0.8, 0.6, -0.3),
            pin_r=(-0.150, -0.560, 0.640), pin_r_w=1, pin_r_r=(90, 0, 0), ep_r=(-0.8, 0.5, -0.5),
            tail_l=(40, 6, 0), tail_r=(38, 7, 0))


def _scoop_post(P, u):
    _breath(P, u, 1.0, 0.8)
    return P


def _scoop():
    c = Clip(_KNEEL, loop=True, post=_scoop_post)
    hold = _KNEEL["pin_r"]
    # dip the cup forward into the sand, draw it back level, lift it (heavy), tip it out inward, come back
    for t, p, r in ((0.00, hold, (90, 0, 0)), (0.13, (-0.150, -0.640, 0.540), (128, 0, 0)), (0.24, (-0.150, -0.660, 0.470), (150, 0, 0)),
                    (0.34, (-0.150, -0.580, 0.468), (104, 0, 0)), (0.44, (-0.150, -0.545, 0.520), (88, 0, 0)), (0.60, (-0.145, -0.535, 0.720), (88, 0, 0)),
                    (0.68, (-0.140, -0.535, 0.728), (90, 0, 20)), (0.78, (-0.125, -0.545, 0.715), (92, 0, 112)), (0.88, (-0.125, -0.550, 0.705), (92, 0, 118)),
                    (0.96, (-0.145, -0.558, 0.655), (90, 0, 14))):
        c.key(t, pin_r=p, pin_r_r=r)
    for t, hp, sp, ch, nk, hd in ((0.0, 17, 11, 13, (-8, 0, 0), (-14, 0, 0)), (0.24, 22, 14, 16, (-6, -5, 0), (-8, -9, 0)), (0.44, 19, 12, 14, (-6, -5, 0), (-8, -8, 0)),
                                  (0.62, 15, 9, 11, (-9, -4, 0), (-20, -7, 0)), (0.84, 15, 10, 12, (-8, -3, 0), (-16, -6, 0))):
        c.key(t, hip_r=(hp, 0, 0), spine=(sp, 0, 0), chest=(ch, 0, 0), neck=nk, head=hd)
    c.key(0.0, hip=_KNEEL["hip"]); c.key(0.24, hip=(0.0, 0.095, 0.400)); c.key(0.62, hip=(0.0, 0.118, 0.408))
    return c


CLIPS["scoop_kneel"] = _scoop()


def _kneel_to_stand():
    c = Clip(S)
    c.pose(0.0, _KNEEL); c.pose(1.0, S, skip=("pin_l", "pin_r", "pin_l_w", "pin_r_w", "pin_l_r", "pin_r_r"))
    # sets the cup on the rim: on frame 12 (0.4) the socket is over the rim at 0.50 m, the cup upright; then lets go
    rim = (-0.170, _RIM_Y - 0.010, 0.540)
    c.key(0.0, pin_r=_KNEEL["pin_r"], pin_r_r=(90, 0, 0), pin_r_w=1); c.key(0.22, pin_r=(-0.165, _RIM_Y - 0.040, 0.600), pin_r_r=(90, 0, 0))
    c.key(0.36, pin_r=rim, pin_r_r=(90, 0, 0)); c.key(0.43, pin_r=rim, pin_r_r=(90, 0, 0), pin_r_w=1)
    c.key(0.52, pin_r=(-0.215, _RIM_Y + 0.030, 0.560), pin_r_r=(90, 14, 0), pin_r_w=1); c.key(0.66, pin_r_w=0); c.key(1.0, pin_r=(-0.215, _RIM_Y + 0.030, 0.560), pin_r_r=(90, 14, 0))
    # the left hand pushes off the rim as the body rocks back onto its toes and stands
    c.key(0.0, pin_l=_KNEEL["pin_l"], pin_l_w=1, pin_l_r=_KNEEL["pin_l_r"]); c.key(0.58, pin_l=_KNEEL["pin_l"], pin_l_w=1); c.key(0.72, pin_l_w=0)
    c.key(1.0, pin_l=_KNEEL["pin_l"], pin_l_r=_KNEEL["pin_l_r"])
    c.key(0.36, hip=(0.0, 0.100, 0.400), hip_r=(22, 0, 0), spine=(13, 0, 0), chest=(15, 0, 0), neck=(-8, -4, 0), head=(-12, -8, 0))
    c.key(0.52, hip=(0.0, 0.200, 0.440), hip_r=(30, 0, 0), spine=(16, 0, 0), chest=(18, 0, 0), neck=(-14, 6, 0), head=(-20, 14, 0))
    c.key(0.70, hip=(0.0, 0.240, 0.640), hip_r=(46, 0, 0), spine=(18, 0, 0), chest=(20, 4, 0), neck=(-22, 14, 0), head=(-30, 30, 3))    # the hood turns first
    c.key(0.86, hip=(0.0, 0.245, 0.830), hip_r=(40, 0, 0), chest=(20, 3, 0), neck=(-22, 8, 0), head=(-32, 14, 1))
    c.key(0.40, ft_l=_KNEEL["ft_l"], ft_l_r=_KNEEL["ft_l_r"], ft_r=_KNEEL["ft_r"], ft_r_r=_KNEEL["ft_r_r"])
    c.key(0.54, ft_l=(0.105, 0.230, 0.135), ft_l_r=(66, 6, 0), ft_r=(-0.105, 0.235, 0.135), ft_r_r=(70, -8, 0))        # toes tucked under
    a, r = foot(-0.100, 0.150, 0.0, 14, -12); c.key(0.68, ft_r=a, ft_r_r=r)
    a, r = foot(-0.100, 0.120, 0.0, 0, -12); c.key(0.80, ft_r=a, ft_r_r=r)
    a, r = foot(0.105, 0.170, 0.0, 22, 8); c.key(0.66, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, 0.110, 0.05, 10, 9); c.key(0.80, ft_l=a, ft_l_r=r)
    a, r = foot(0.105, 0.015, 0.0, 0, 9); c.key(0.92, ft_l=a, ft_l_r=r)
    c.key(0.56, kn_l=(0.26, -1, 0), kn_r=(-0.28, -1, 0))
    c.key(0.78, ua_l=(26, 6, 14), ua_r=(20, 8, 14), el_l=(30,), el_r=(26,)); c.key(0.90, ua_l=(4, 0, 14), ua_r=(0, 1, 14))
    c.key(0.60, tail_l=(30, 8, 0), tail_r=(30, 8, 0)); c.key(0.80, tail_l=(-6, 4, 0), tail_r=(-4, 4, 0))
    return c


CLIPS["kneel_to_stand"] = _kneel_to_stand()

# ---------------------------------------------------------------------------------------------------- the file
_ql, _qlr = foot(0.118, -0.030, yaw=15); _qr, _qrr = foot(-0.082, 0.085, yaw=-9)
_QUEUE = mk(S, hip=(-0.040, 0.105, 0.893), hip_r=(13.0, 0, 4.0), spine=(9.0, 0, -3.0), chest=(11.0, 0, -2.0), neck=(5.0, 0, 0), head=(9.0, 0, 0),
            sh_l=(0, -8, 9), sh_r=(0, -8, 8), ua_l=(4, 0, 12), ua_r=(1, 1, 12), el_l=(9,), el_r=(6,),
            ft_l=_ql, ft_l_r=_qlr, ft_r=_qr, ft_r_r=_qrr, kn_l=(0.26, -1, 0), kn_r=(-0.12, -1, 0), tail_l=(2, 3, 0), tail_r=(3, 3, 0))


def _queue_post(P, u):
    _breath(P, u, 1.0, 1.3)
    w = _sin(u, 1.0); w2 = _lag(u, 1.0, 0.15)                           # a slow sway over the standing leg
    _add(P, "hip", (0.007 * w, 0.004 * w, 0)); _add(P, "hip_r", (0, 0, 0.7 * w)); _add(P, "spine", (0, 0, -0.6 * w2))
    _add(P, "head", (0.8 * w2, 1.4 * w2, 0)); _add(P, "ua_l", (0.9 * w2, 0, 0)); _add(P, "ua_r", (-0.9 * w2, 0, 0))
    return P


CLIPS["queue_stand"] = Clip(_QUEUE, loop=True, post=_queue_post)


def _turn():
    """Authored in the WORLD: the hood turns first, then the shoulders, then the feet, to the figure's left, 180 degrees.
    `root_yaw` (180 x time, linear) is taken out again by the solver: code turns the root while this plays."""
    c = Clip(S)
    c.key(0.0, root_yaw=0); c.key(1.0, root_yaw=180)

    def turned(P, yaw):
        """pose P standing at the root, turned by yaw about the root"""
        R = Rz(yaw); d = dict(P)
        for k in ("hip", "ft_l", "ft_r", "hpin", "pin_l", "pin_r"): d[k] = tuple(R @ V(*P[k]))
        d["hip_r"] = (P["hip_r"][0], P["hip_r"][1] + yaw, P["hip_r"][2])
        for k in ("ft_l_r", "ft_r_r", "headg"): d[k] = (P[k][0], P[k][1] + yaw, P[k][2])
        return d
    end = turned(S, 180.0)
    c.pose(0.0, _QUEUE, skip=("root_yaw",)); c.pose(1.0, end, skip=("root_yaw",))
    # the hood, then the shoulders
    c.key(0.14, neck=(2, 22, 0), head=(-2, 46, -4)); c.key(0.34, neck=(-8, 26, 0), head=(-14, 52, -3), chest=(13, 24, 0), spine=(11, 14, 0))
    c.key(0.56, neck=(-16, 18, 0), head=(-24, 30, 0), chest=(17, 22, 0), spine=(14, 14, 0)); c.key(0.80, neck=(-20, 6, 0), head=(-30, 10, 0), chest=(19, 8, 0), spine=(16, 5, 0))
    # the hips follow, carried over the pivoting right foot; the left foot swings round first, the right foot last
    for t, yaw, hip in ((0.22, 8, (-0.035, 0.095, 0.885)), (0.44, 62, (-0.030, 0.060, 0.870)), (0.62, 122, (-0.045, 0.000, 0.862)), (0.80, 165, (-0.020, -0.150, 0.860))):
        c.key(t, hip=hip, hip_r=(13 + 23 * t, yaw, 2))
    a, r = foot(0.118, -0.030, yaw=15); c.key(0.22, ft_l=a, ft_l_r=r)
    c.key(0.36, ft_l=(-0.060, -0.200, 0.150), ft_l_r=(16, 80, 0))
    lf = tuple(Rz(180.0) @ V(*S["ft_l"])); c.key(0.52, ft_l=lf, ft_l_r=(0, 180 + 9, 0))
    a, r = foot(-0.082, 0.085, yaw=-9); c.key(0.52, ft_r=a, ft_r_r=(0, 20, 0))
    c.key(0.66, ft_r=(0.020, 0.030, 0.150), ft_r_r=(20, 100, 0))
    rf = tuple(Rz(180.0) @ V(*S["ft_r"])); c.key(0.82, ft_r=rf, ft_r_r=(0, 180 - 12, 0))
    c.key(0.50, ua_l=(2, 8, 12), ua_r=(6, 8, 12), el_l=(16,), el_r=(16,)); c.key(0.78, ua_l=(12, 3, 14), ua_r=(8, 3, 14))
    c.key(0.50, tail_l=(6, 14, 0), tail_r=(8, 2, 0)); c.key(0.78, tail_l=(8, 8, 0), tail_r=(10, 0, 0))
    return c


CLIPS["turn_about"] = _turn()

# ---------------------------------------------------------------------------------------------------- die_back
# folds at the waist, is carried back, lands on its left hip and rolls onto its side: head away, the hood turned to the ground
_FELLED = mk(S, hip=(0.0, 0.500, 0.220), hip_q=quat((0, 90, 90)), hip_qw=1, arm_ch=1, tail_h=1,
             spine=(14.0, 0, -6.0), chest=(18.0, 0, -8.0), neck=(-6.0, 22, 6), head=(-14.0, 38, 0),
             legfk_l=1, th_l=(40, -6, 0), knf_l=(70,), ftl_l=(34, 0, 0), legfk_r=1, th_r=(58, -5, 0), knf_r=(88,), ftl_r=(40, 0, 0),
             sh_l=(0, -14, 0), sh_r=(0, -24, 10), ua_l=(40, -10, 0), el_l=(72,), ha_l=(0, 0, 10), ua_r=(30, -9, 0), el_r=(82,), ha_r=(0, 0, 25),
             tail_l=(-18, 0, 0), tail_r=(-30, -4, 0))                      # curled: arms and knees drawn in, the skirt lying with the thighs


def _die_back():
    c = Clip(S)
    s0 = mk(S, hip_q=quat((36, 0, 0)), hip_qw=1, arm_ch=1, tail_h=1, ua_l=(82, 0, 14), ua_r=(78, 1, 14), tail_l=(-30, 3, 0), tail_r=(-28, 3, 0))
    c.pose(0.0, s0); c.pose(1.0, _FELLED)
    # the hit: the middle goes back first, the hood and the hands are left behind; then it is carried, butt first
    for t, hip, e, sp, ch, nk, hd in (
            (0.10, (0.0, 0.300, 0.878), (46, 0, 0), 24, 24, (-10, 0, 0), (-14, 0, 0)),
            (0.24, (0.0, 0.500, 0.870), (40, 6, 4), 32, 30, (6, 2, 0), (10, 4, 0)),
            (0.40, (0.0, 0.680, 0.600), (0, 20, 18), 30, 26, (12, 8, 0), (14, 12, 0)),
            (0.55, (0.0, 0.690, 0.235), (-38, 50, 52), 22, 18, (14, 18, 0), (16, 32, 0)),
            (0.70, (0.0, 0.580, 0.256), (-8, 82, 84), 8, 10, (0, 20, 2), (-6, 38, 0)),
            (0.84, (0.0, 0.515, 0.236), (0, 90, 91), 15, 19, (-6, 22, 4), (-10, 34, 0))):
        c.key(t, hip=hip, hip_q=quat(e), spine=(sp, 0, -6 * t), chest=(ch, 0, -8 * t), neck=nk, head=hd)
    c.key(0.93, neck=(-6, 24, 6), head=(-16, 41, 0))                                                      # the hood rolls last
    # legs: planted for a moment, then swept off the ground: they trail low, and draw up as it rolls onto its side
    c.key(0.0, legfk_l=0, legfk_r=0); c.key(0.07, legfk_l=0, legfk_r=0); c.key(0.20, legfk_l=1, legfk_r=1)
    c.key(0.0, th_l=(34, 0, 0), knf_l=(40,), th_r=(24, 0, 0), knf_r=(40,))
    for t, tl, kl, tr, kr in ((0.24, (84, 2, 0), 30, (76, 4, 0), 40), (0.40, (88, 0, 0), 44, (78, 6, 0), 50), (0.55, (64, 0, 0), 58, (84, -4, 0), 70),
                              (0.70, (46, 0, 0), 70, (76, -6, 0), 90), (0.84, (43, -4, 0), 74, (60, -5, 0), 92)):
        c.key(t, th_l=tl, knf_l=(kl,), th_r=tr, knf_r=(kr,))
    c.key(0.30, ftl_l=(10, 0, 0), ftl_r=(16, 0, 0))
    # arms: thrown forward by the fold, trail through the fall, drop last
    for t, al, el, ar, er in ((0.10, (96, 6, 14), 12, (92, 8, 14), 12), (0.24, (108, 12, 0), 16, (104, 14, 0), 18), (0.40, (100, 12, 0), 24, (96, 16, 0), 26),
                              (0.55, (92, 6, 0), 34, (88, 18, 0), 46), (0.70, (76, -8, 0), 48, (70, 4, 0), 66), (0.80, (56, -12, 0), 62, (50, -6, 0), 76),
                              (0.92, (42, -10, 0), 74, (32, -9, 0), 84)):
        c.key(t, ua_l=al, el_l=(el,), ua_r=ar, el_r=(er,))
    c.key(0.20, tail_l=(-60, 6, 0), tail_r=(-56, 6, 0)); c.key(0.50, tail_l=(-70, 10, 0), tail_r=(-50, 0, 0)); c.key(0.76, tail_l=(-8, 0, 0), tail_r=(4, -8, 0))
    return c


CLIPS["die_back"] = _die_back()


_FP = {sd: foot_points(sd) for sd in "lr"}


def grounded(P):
    """The ground clamp: no boot goes through the floor. A planted (IK) foot is raised by what it is under (the knee
    takes it up); a leg driven from the hip (lying and falling poses) folds its knee instead. A pure function of the
    pose, so loops stay closed and the statics, which are built from the same call, match the clips."""
    P = dict(P)
    for _ in range(12):
        G = solve(P); ok = True
        for sd in "lr":
            low = min((G[f"foot_{sd}"] @ p).z for p in _FP[sd])
            if low >= -0.0015: continue
            ok = False; w = P[f"legfk_{sd}"][0]
            if w < 0.6:
                a = P[f"ft_{sd}"]; P[f"ft_{sd}"] = (a[0], a[1], a[2] - low / (1.0 - w))
            else:
                d = min(12.0, 4.0 - low * 160.0); t = P[f"th_{sd}"]
                P[f"knf_{sd}"] = (P[f"knf_{sd}"][0] + d,); P[f"th_{sd}"] = (t[0] + 0.5 * d, t[1], t[2])
        if ok: break
    return P


def pose(name, f, n):
    c = CLIPS[name]
    u = f / float(n)
    if c.loop and f == n: u = 0.0
    P = c.at(u)
    return grounded(P) if c.ground else P
