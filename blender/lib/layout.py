"""Access to design/layout.json (the level blockout) and the space conversion.

Game space is three.js space: +Y up, -Z north. Blender is +Z up. A game point (x, y, z) is Blender (x, -z, y), and a
rotation of `rotY` degrees about game +Y is the same angle about Blender +Z. Zone scripts author in Blender space at
world coordinates; `to_blender` converts every layout position.

`solid_mesh` builds a layout solid exactly as tools/layout_geom.mjs and src/core/greybox.ts define it (box, ramp with
`rise` and `skirt`, cylinder with `innerRadius`), so the greybox GLBs and the runtime colliders agree.
"""
import json, os, math
from . import manifest

_cache = {}
WALKABLE = ("floor", "platform", "stairs", "terrain")


def load():
    """design/layout.json as a dict (cached)."""
    if "l" not in _cache:
        with open(os.path.join(manifest.ROOT, "design", "layout.json"), "r", encoding="utf-8") as f:
            _cache["l"] = json.load(f)
    return _cache["l"]


def to_blender(p):
    """Game (x, y, z) -> Blender (x, -z, y)."""
    return (p[0], -p[2], p[1])


def to_game(p):
    """Blender (x, y, z) -> game (x, z, -y)."""
    return (p[0], p[2], -p[1])


def size_to_blender(s):
    """Game extents [x, y, z] -> Blender extents (x, z, y)."""
    return (s[0], s[2], s[1])


def zone(zone_id):
    """A zone entry (id, kind, set, bounds, mood ...)."""
    for z in load()["zones"]:
        if z["id"] == zone_id: return z
    raise KeyError(f"layout: no zone '{zone_id}'")


def solids(zone_id=None):
    """The layout solids of a zone (all when None), in file order."""
    return [s for s in load()["solids"] if zone_id is None or s["zone"] == zone_id]


def solid(solid_id):
    for s in load()["solids"]:
        if s["id"] == solid_id: return s
    raise KeyError(f"layout: no solid '{solid_id}'")


def marker(marker_id):
    """A marker by id (pos, rotY, size, params ...). Raises KeyError when it does not exist."""
    if "markers" not in _cache: _cache["markers"] = {m["id"]: m for m in load()["markers"]}
    m = _cache["markers"].get(marker_id)
    if m is None: raise KeyError(f"layout: no marker '{marker_id}'")
    return m


def markers(zone_id=None, type=None):
    """Markers of a zone and / or of a type ('vista', 'checkpoint', 'door', 'prop', 'light' ...), in file order."""
    return [m for m in load()["markers"] if (zone_id is None or m["zone"] == zone_id) and (type is None or m["type"] == type)]


def sun():
    """Unit vector TOWARD the sun in Blender space (layout meta.sun.toSun converted)."""
    v = to_blender(load()["meta"]["sun"]["toSun"])
    l = math.sqrt(sum(c * c for c in v))
    return (v[0] / l, v[1] / l, v[2] / l)


def surface_material(surface):
    """Material name of a layout surface (meta.conventions.surfaces): 'adobe' -> 'm_frontier', 'ceramic' -> 'm_pellam'."""
    return load()["meta"]["conventions"]["surfaces"][surface].split(" ")[0]


def placement(marker_or_id, offset=(0.0, 0.0, 0.0), scale=1.0):
    """Where an asset bound to a marker stands (ARCHITECTURE 9.2, `data.placement`): returns (Blender location,
    rot_z radians). pos = marker.pos + R * (offset * scale) with `offset` in ASSET-LOCAL game axes; an asset's front
    (+Z local) faces the way the marker faces (rotY + 180 degrees about +Y)."""
    m = marker(marker_or_id) if isinstance(marker_or_id, str) else marker_or_id
    yaw = math.radians(m.get("rotY", 0.0)) + math.pi
    c, s = math.cos(yaw), math.sin(yaw)
    ox, oy, oz = (offset[0] * scale, offset[1] * scale, offset[2] * scale)
    gx = m["pos"][0] + ox * c + oz * s
    gz = m["pos"][2] - ox * s + oz * c
    return to_blender((gx, m["pos"][1] + oy, gz)), yaw


def cylinder_segments(radius):
    """Segments of a cylinder solid: chord error under 3 cm, 12 to 64, a multiple of 4 (same rule as greybox.ts)."""
    n = math.ceil(math.pi / math.acos(max(-1.0, min(1.0, 1.0 - 0.03 / max(radius, 0.05)))))
    return min(64, max(12, math.ceil(n / 4) * 4))


def solid_faces(s):
    """The polygons of a solid in GAME space with outward winding: a list of faces, each a list of (x, y, z).
    Quads for box and ramp sides, n-gons / quads for cylinder caps. Degenerate faces (the low edge of a ramp without a
    skirt) are dropped."""
    px, py, pz = s["pos"]; faces = []
    if s["shape"] == "cylinder":
        R = s["size"][0] / 2.0; ri = s.get("innerRadius", 0) or 0
        y0 = py - s["size"][1] / 2.0; y1 = py + s["size"][1] / 2.0
        n = cylinder_segments(R)
        ring = [(math.cos(k / n * 2 * math.pi), math.sin(k / n * 2 * math.pi)) for k in range(n)]
        for k in range(n):
            c0, s0 = ring[k]; c1, s1 = ring[(k + 1) % n]
            o0 = (px + R * c0, pz + R * s0); o1 = (px + R * c1, pz + R * s1)
            faces.append([(o0[0], y0, o0[1]), (o0[0], y1, o0[1]), (o1[0], y1, o1[1]), (o1[0], y0, o1[1])])
            if ri > 0:
                i0 = (px + ri * c0, pz + ri * s0); i1 = (px + ri * c1, pz + ri * s1)
                faces.append([(i1[0], y0, i1[1]), (i1[0], y1, i1[1]), (i0[0], y1, i0[1]), (i0[0], y0, i0[1])])
                faces.append([(o0[0], y1, o0[1]), (i0[0], y1, i0[1]), (i1[0], y1, i1[1]), (o1[0], y1, o1[1])])
                faces.append([(o0[0], y0, o0[1]), (o1[0], y0, o1[1]), (i1[0], y0, i1[1]), (i0[0], y0, i0[1])])
            else:
                faces.append([(px, y1, pz), (o1[0], y1, o1[1]), (o0[0], y1, o0[1])])
                faces.append([(px, y0, pz), (o0[0], y0, o0[1]), (o1[0], y0, o1[1])])
        return faces
    hx = s["size"][0] / 2.0; hz = s["size"][2] / 2.0
    r = math.radians(s.get("rotY", 0) or 0); c = math.cos(r); sn = math.sin(r)
    y_low = py - s["size"][1] / 2.0; y_high = py + s["size"][1] / 2.0
    ramp = s["shape"] == "ramp"
    y_bottom = y_low - (s.get("skirt", 0) or 0) if ramp else y_low
    lx = (-hx, hx, hx, -hx); lz = (-hz, -hz, hz, hz)
    W = []; T = []
    for i in range(4):
        x, z = lx[i], lz[i]
        W.append((px + x * c + z * sn, pz - x * sn + z * c))
        high = True
        if ramp:
            rise = s.get("rise")
            high = {"+x": x > 0, "-x": x < 0, "+z": z > 0, "-z": z < 0}.get(rise, True)
        T.append(y_high if high else y_low)
    top = [(W[i][0], T[i], W[i][1]) for i in (0, 3, 2, 1)]
    bottom = [(W[i][0], y_bottom, W[i][1]) for i in (0, 1, 2, 3)]
    faces.append(top); faces.append(bottom)
    for i in range(4):
        j = (i + 1) % 4
        quad = [(W[i][0], y_bottom, W[i][1]), (W[i][0], T[i], W[i][1]), (W[j][0], T[j], W[j][1]), (W[j][0], y_bottom, W[j][1])]
        # drop coincident corners (a ramp side is a triangle when there is no skirt at its low end)
        clean = []
        for p in quad:
            if not clean or max(abs(p[k] - clean[-1][k]) for k in range(3)) > 1e-9: clean.append(p)
        if len(clean) > 1 and max(abs(clean[0][k] - clean[-1][k]) for k in range(3)) <= 1e-9: clean.pop()
        if len(clean) >= 3: faces.append(clean)
    return faces


def solid_mesh(s, name=None):
    """A Blender mesh object of one layout solid, in Blender WORLD coordinates (object at the origin), with a UV0
    layer. `s` is a solid dict or its id. Faces are quads / n-gons with outward normals."""
    import bpy, bmesh
    from .mesh import new_mesh_object
    if isinstance(s, str): s = solid(s)
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    cache = {}
    def vert(p):
        b = to_blender(p); key = (round(b[0], 6), round(b[1], 6), round(b[2], 6))
        if key not in cache: cache[key] = bm.verts.new(b)
        return cache[key]
    for f in solid_faces(s):
        vs = [vert(p) for p in f]
        if len(set(vs)) < 3: continue
        try: bm.faces.new(vs)
        except ValueError: pass                                   # duplicate face
    bm.normal_update()
    return new_mesh_object(name or s["id"], bm)


# ------------------------------------------------------------------ the path's ground (chunk `part` rule, checks)
def nav_segments(zone_id):
    """[(a, b)] game-space end points of the nav links whose two nodes are in the zone (plus isolated nodes as a == b)."""
    key = "nav_" + zone_id
    if key not in _cache:
        nav = load()["nav"]; nodes = {n["id"]: n for n in nav["nodes"]}
        segs = []; used = set()
        for a, b in nav["links"]:
            na, nb = nodes[a], nodes[b]
            if na["zone"] == zone_id and nb["zone"] == zone_id:
                segs.append((tuple(na["pos"]), tuple(nb["pos"]))); used.add(a); used.add(b)
        for n in nav["nodes"]:
            if n["zone"] == zone_id and n["id"] not in used: segs.append((tuple(n["pos"]), tuple(n["pos"])))
        _cache[key] = segs
    return _cache[key]


def path_ground(zone_id, x, z):
    """Height (game y) of the walked path nearest to game (x, z): the y of the closest point of the zone's nav links,
    measured horizontally. This is "the path's ground" of the chunk rule: a `part: "high"` chunk holds only what is
    3 m or more above it. Returns None when the zone has no nav."""
    best = None; bd = 1e30
    for a, b in nav_segments(zone_id):
        dx = b[0] - a[0]; dz = b[2] - a[2]; l2 = dx * dx + dz * dz
        t = 0.0 if l2 < 1e-12 else max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[2]) * dz) / l2))
        qx = a[0] + dx * t; qz = a[2] + dz * t
        d = (x - qx) ** 2 + (z - qz) ** 2
        if d < bd: bd = d; best = a[1] + (b[1] - a[1]) * t
    return best
