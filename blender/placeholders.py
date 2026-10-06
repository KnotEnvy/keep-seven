"""Placeholder generator (ARCHITECTURE 7.3). Driven by `node tools/build-assets.mjs [--placeholders]`:

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P blender/placeholders.py -- --assets id,id,... --textures id,...

Writes a RAW placeholder (blender/export/...) for each listed manifest asset and texture, through the same export path
as final art, so code is always written against final names, pivots, node positions, clips and durations:

  assets    `placeholder.shape` at `placeholder.size`, placed by `placeholder.anchor`; category colour in COLOR_0; the
            asset's first material; every `nodes` name (empty at its `nodePos`, else where the art order puts it (RIGS,
            riding its bone), else on the placeholder's front face; lamp-set mesh with `lampCount` quads and
            lamp indices in UV1.x, variant meshes, `*_mesh` skinned meshes); skinned assets get an armature with every
            `bones` name (a name in both `nodes` and `bones` is made once, as the bone) and the shape rigid-skinned to the
            first; every clip with the right name, loop flag and length, moving the first un-driven bone (or the
            animated empty) visibly; root extra `placeholder: true`.
  zones     (`placeholder.source = "layout-solids"`) the greybox: the zone's layout solids split into the manifest's
            chunk meshes, coloured by surface, vertex-lit by a fixed key, floors lightmapped (flat placeholder map);
            up to three `inst_<nnn>` and one `brk_<nnn>` dressing empties from the zone's dressing allowance.
  textures  right size and format; lightmaps flat (displaying as light 1.0) with the neutral texel painted; tx_fx as
            labelled cells; tx_noise as tiling value noise. PNG text chunk `placeholder=1`.

It never overwrites a raw file that is not itself a placeholder. One line per item: `PLACEHOLDER <id> ...` / `KEPT <id>`.
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import bpy, bmesh, math, json, struct, argparse, time
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, bake, rig, anim, export, manifest, layout, zone, brand, texdraw as td

CATEGORY_COLOUR = {"env": (0.34, 0.30, 0.24), "props": (0.55, 0.33, 0.12), "weapons": (0.22, 0.24, 0.27),
                   "enemies": (0.33, 0.20, 0.42), "boss": (0.42, 0.14, 0.12), "fixtures": (0.4, 0.4, 0.4)}
SURFACE_COLOUR = {"sand": "sand", "adobe": "adobe", "wood": "board", "stone": "rock", "ceramic": "enamel", "metal": "steel", "cloth": "linen"}
TRIM_OF = {("m_frontier", "adobe"): "adobe", ("m_frontier", "wood"): "plank_a", ("m_frontier", "stone"): "strata", ("m_frontier", "cloth"): "plank_a",
           ("m_pellam", "ceramic"): "panel", ("m_pellam", "metal"): "steel", ("m_pellam", "stone"): "concrete"}
EMPTY_HINT = ("socket_", "muzzle", "thread_anchor_", "hand_socket")
EMPTY_NAMES = {"glint", "eject", "cam_look", "crown", "bore_axis", "round_slot", "control", "lens", "stake_muzzle", "ram_head", "foot_spark",
               "vent_chest_knot", "vent_back_knot", "canister_muzzle"}
LAMP_ANCHORS = {"strip_hatch": ["light_tally_hatch"], "strip_flicker": ["light_gallery_strip_6"], "violet_hairline": ["ia_baffle"],
                "bore_glow": ["light_bore_violet"], "mark_glows": [f"ia_proving_mark_{i}" for i in range(1, 7)], "drum_lamp": ["prop_wind_pump"]}
KEY, AMBIENT = 1.3, 0.9


# ------------------------------------------------------------------ where sockets and bones sit until the manifest says
def _ring(hub, radius, n, z, start=0):
    """n points on a circle round `hub` (x, y) in the plane z: number 1 at the top, clockwise seen from the front (+Z)."""
    return [(hub[0] - radius * math.sin(math.radians(60.0 * k + start)), hub[1] + radius * math.cos(math.radians(60.0 * k + start)), z) for k in range(n)]


def _rigs():
    """Placeholder skeleton layouts and socket positions of the weapon and the creatures, asset-local GAME space
    (assets face +Z; the revolver is in camera space, barrel toward -Z), from the numbers in the art orders
    (art-weapons 4.1, art-enemies 4.1 / 4.3, art-boss 4.1 / 4.2). The manifest's `nodePos` / `nodeParent` win where
    they exist; this table is what code is written against until the manifest carries them
    (docs/requests/foundation-pipeline.md 8).
        bones    name -> (head, parent bone)         sockets  name -> (position, the bone it rides)
        meshes   mesh node -> (box min, box max, bone it is skinned to)"""
    R = {}
    cyl = (0.105, -0.085, -0.33)
    R["weapon_revolver"] = {
        "meshes": {"gun_mesh": ((0.05, -0.215, -0.56), (0.16, -0.045, -0.215), "gun"),              # muzzle at its -Z end
                   "arms_mesh": ((0.09, -0.42, -0.31), (0.21, -0.19, 0.06), "arm_r")},
        "bones": {"root": ((0, 0, 0), None), "gun": ((0.135, -0.165, -0.30), "root"), "cylinder": (cyl, "gun"),
                  "hammer": ((0.12, -0.06, -0.25), "gun"), "trigger": ((0.125, -0.125, -0.30), "gun"), "gate": ((0.13, -0.085, -0.305), "gun"),
                  "ejector": ((0.09, -0.095, -0.45), "gun"),
                  **{f"round_{i + 1}": ((cyl[0] - 0.013 * math.sin(math.radians(60 * i)), cyl[1] + 0.013 * math.cos(math.radians(60 * i)), -0.31), "cylinder") for i in range(6)},
                  "arm_r": ((0.21, -0.40, 0.05), "root"), "hand_r": ((0.145, -0.19, -0.27), "arm_r"),
                  "thumb_r_1": ((0.125, -0.135, -0.27), "hand_r"), "thumb_r_2": ((0.118, -0.115, -0.29), "thumb_r_1"),
                  "index_r_1": ((0.128, -0.14, -0.31), "hand_r"), "index_r_2": ((0.124, -0.13, -0.33), "index_r_1"), "grip_r": ((0.14, -0.20, -0.30), "hand_r"),
                  "arm_l": ((-0.24, -0.40, 0.05), "root"), "hand_l": ((-0.17, -0.25, -0.25), "arm_l"),
                  "thumb_l_1": ((-0.15, -0.21, -0.27), "hand_l"), "thumb_l_2": ((-0.14, -0.19, -0.29), "thumb_l_1"),
                  "index_l_1": ((-0.155, -0.22, -0.30), "hand_l"), "index_l_2": ((-0.15, -0.21, -0.32), "index_l_1"), "fingers_l": ((-0.17, -0.24, -0.30), "hand_l"),
                  "round_hand_lead": ((-0.15, -0.20, -0.30), "hand_l"), "round_hand_line": ((-0.16, -0.20, -0.30), "hand_l"),
                  "round_hand_kept": ((-0.17, -0.20, -0.30), "hand_l"), "kept_loop": ((-0.20, -0.28, -0.16), "arm_l")},
        "sockets": {"muzzle": ((0.075, -0.070, -0.56), "gun"), "eject": ((0.13, -0.085, -0.305), "gun"), "cam_look": ((0.0, 0.0, -12.0), "root")}}
    b = {"root": ((0, 0, 0), None), "hips": ((0, 0.80, -0.05), "root"), "spine": ((0, 0.95, 0.0), "hips"), "chest": ((0, 1.08, 0.06), "spine"),
         "neck": ((0, 1.18, 0.12), "chest"), "head": ((0, 1.24, 0.15), "neck"), "coat_tail_l": ((0.10, 0.75, -0.15), "hips"), "coat_tail_r": ((-0.10, 0.75, -0.15), "hips")}
    for side, sx in (("l", 1.0), ("r", -1.0)):                                       # a creature facing +Z has its left at +X
        b[f"shoulder_{side}"] = ((0.12 * sx, 1.14, 0.08), "chest"); b[f"upperarm_{side}"] = ((0.24 * sx, 1.11, 0.08), f"shoulder_{side}")
        b[f"forearm_{side}"] = ((0.26 * sx, 0.82, 0.12), f"upperarm_{side}"); b[f"hand_{side}"] = ((0.27 * sx, 0.52, 0.18), f"forearm_{side}")
        b[f"thigh_{side}"] = ((0.09 * sx, 0.78, -0.05), "hips"); b[f"shin_{side}"] = ((0.10 * sx, 0.42, 0.02), f"thigh_{side}"); b[f"foot_{side}"] = ((0.10 * sx, 0.07, -0.02), f"shin_{side}")
    R["enemy_bider"] = {"bones": b, "sockets": {"crown": ((0.0, 1.34, 0.21), "head"), "hand_socket_r": ((-0.27, 0.50, 0.20), "hand_r")}}
    t = {"root": ((0, 0, 0), None), "head": ((0, 1.62, 0.0), "root")}
    for leg, ang in (("a", 0.0), ("b", 120.0), ("c", 240.0)):
        dx, dz = math.sin(math.radians(ang)), math.cos(math.radians(ang))
        t[f"leg_{leg}_upper"] = ((0.06 * dx, 1.42, 0.06 * dz), "root"); t[f"leg_{leg}_lower"] = ((0.30 * dx, 0.80, 0.30 * dz), f"leg_{leg}_upper")
    R["enemy_transit"] = {"bones": t, "sockets": {"lens": ((0.0, 1.62, 0.17), "head"), "stake_muzzle": ((0.0, 1.46, 0.18), "head")}}
    R["enemy_tamper"] = {
        "bones": {"root": ((0, 0, 0), None), "pelvis": ((0, 0.85, 0.0), "root"), "barrel": ((0, 1.0, 0.0), "pelvis"),
                  "arm_r_upper": ((-0.75, 1.75, 0.05), "barrel"), "arm_r_ram": ((-0.80, 1.10, 0.25), "arm_r_upper"), "arm_l": ((0.72, 1.60, 0.05), "barrel"),
                  "leg_l_upper": ((0.35, 0.85, 0.0), "pelvis"), "leg_l_foot": ((0.38, 0.15, 0.05), "leg_l_upper"),
                  "leg_r_upper": ((-0.35, 0.85, 0.0), "pelvis"), "leg_r_foot": ((-0.38, 0.15, 0.05), "leg_r_upper"),
                  "vent_chest": ((0, 1.95, 0.64), "barrel"), "vent_back": ((0, 1.85, -0.64), "barrel")},         # hinged at the top of each hatch
        "sockets": {"vent_chest_knot": ((0.0, 1.70, 0.45), "barrel"), "vent_back_knot": ((0.0, 1.60, -0.45), "barrel"),
                    "ram_head": ((-0.80, 0.45, 0.35), "arm_r_ram"), "foot_spark": ((-0.38, 0.02, 0.22), "leg_r_foot")}}
    hub = (0.0, 4.0); face_z = 3.1; knot_z = 2.8                                     # drum hub (0, 4.0, 2.0), face plane z = 3.1
    w = {"root": ((0, 0, 0), None), "arm_yaw": ((0, 12.5, 0.0), "root"), "drum_spin": ((0, 4.0, 2.0), "arm_yaw"),
         "guard": ((0, 7.4, 3.2), "arm_yaw"), "pawl_l": ((-1.6, 6.0, 2.6), "arm_yaw"), "pawl_r": ((1.6, 6.0, 2.6), "arm_yaw"),
         "cable_a": ((-1.2, 6.5, 1.2), "root"), "cable_b": ((0.0, 6.5, 0.9), "root"), "cable_c": ((1.2, 6.5, 1.2), "root")}
    ws = {"pawl_l_hit": ((-1.6, 6.0, 2.6), "arm_yaw"), "pawl_r_hit": ((1.6, 6.0, 2.6), "arm_yaw"),
          "muzzle_top": ((0.0, 5.7, face_z), "arm_yaw"), "canister_muzzle": ((0.0, 4.0, face_z), "arm_yaw")}
    for i, (rim, kn, an) in enumerate(zip(_ring(hub, 2.15, 6, face_z), _ring(hub, 1.7, 6, knot_z), _ring(hub, 1.7, 6, face_z))):
        w[f"mouth_{i + 1}"] = (rim, "drum_spin"); w[f"knot_{i + 1}"] = (kn, "drum_spin")
        ws[f"knot_{i + 1}_hit"] = (kn, "drum_spin"); ws[f"thread_anchor_{i + 1}"] = (an, "drum_spin")
    for i in range(5):
        a = math.radians(72.0 * i)
        w[f"guard_piece_{i + 1}"] = ((1.2 * math.sin(a), 7.4 + 1.2 * math.cos(a), 3.2), "guard")
    # the body is the DRUM where it hangs (5 m across, 1.5 .. 6.5 m up, 0.9 m out to just behind the knots), riding
    # `drum_spin`: code that turns the drum or the arm sees it move, and the knot hits stand proud of its face
    R["boss_windlass"] = {"bones": w, "sockets": ws, "meshes": {"body_mesh": ((-2.5, 1.5, 0.9), (2.5, 6.5, 2.7), "drum_spin")}}
    return R


RIGS = _rigs()


# ------------------------------------------------------------------ helpers
def glb_is_placeholder(path, asset_id):
    """True when the GLB at `path` has a root node with the extra placeholder: true (or cannot be read)."""
    try:
        with open(path, "rb") as f:
            head = f.read(20)
            if head[:4] != b"glTF": return True
            n = struct.unpack("<I", head[12:16])[0]
            js = json.loads(f.read(n).decode("utf-8"))
        for node in js.get("nodes", []):
            if node.get("name") == asset_id: return bool(node.get("extras", {}).get("placeholder"))
        return False
    except Exception:
        return True


def png_is_placeholder(path):
    try: return td.read_png(path)[1].get("placeholder") == "1"
    except Exception: return True


def local_box(a):
    """Placeholder box (min, max) in asset-local GAME space, from its anchor (same table as tools/validate_assets.mjs)."""
    sx, sy, sz = a["placeholder"]["size"]; an = a["placeholder"]["anchor"]
    if an == "centre": return (-sx / 2, -sy / 2, -sz / 2), (sx / 2, sy / 2, sz / 2)
    if an == "top": return (-sx / 2, -sy, -sz / 2), (sx / 2, 0, sz / 2)
    if an == "back": return (-sx / 2, -sy / 2, 0), (sx / 2, sy / 2, sz)
    if an == "back_base": return (-sx / 2, 0, 0), (sx / 2, sy, sz)
    if an == "hinge": return (0, 0, -sz / 2), (sx, sy, sz / 2)
    return (-sx / 2, 0, -sz / 2), (sx / 2, sy, sz / 2)


def world_offset(asset_id, a):
    """Where a non-zone asset authored in world coordinates stands (game space offset of its box)."""
    if asset_id == "rim_town_card":
        try: t = layout.marker("vista_plenty")["params"]["target"]; return (t[0], t[1] - a["placeholder"]["size"][1] / 2, t[2])
        except KeyError: return (0, 0, 0)
    if asset_id == "prop_well_sweep":
        try:
            t = layout.marker("prop_pylon")["params"]["sweepTo"]; s = a["placeholder"]["size"]
            return (t[0] + s[0] / 2, t[1] - s[1], t[2])
        except KeyError: return (0, 0, 0)
    return (0, 0, 0)


def shape_bmesh(shape, lo, hi, tri_cap):
    """The placeholder shape filling the game-space box lo..hi, as a bmesh in Blender space."""
    bm = mesh.new_bmesh()
    c = [(lo[i] + hi[i]) / 2 for i in range(3)]; s = [max(hi[i] - lo[i], 1e-4) for i in range(3)]
    bc = layout.to_blender(c); bs = layout.size_to_blender(s)
    if tri_cap < 12:                                               # a card: one quad facing the front (+Z game = -Y Blender)
        x0, x1 = lo[0], hi[0]; y0, y1 = lo[1], hi[1]; z = c[2]
        bm.faces.new([bm.verts.new(layout.to_blender(p)) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))])
    elif shape == "cylinder" and tri_cap >= 28:
        seg = 12 if tri_cap >= 44 else 8
        vs = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=0.5, radius2=0.5, depth=1.0)['verts']
        bmesh.ops.scale(bm, vec=bs, verts=vs); bmesh.ops.translate(bm, vec=bc, verts=vs)
    elif shape == "capsule" and tri_cap >= 96:
        r = min(s[0], s[2]) / 2
        vs = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0)['verts']
        half = max(0.0, s[1] / 2 - r)
        for v in vs:
            up = 1.0 if v.co.z > 1e-6 else (-1.0 if v.co.z < -1e-6 else 0.0)
            v.co = Vector((v.co.x * s[0] / 2, v.co.y * s[2] / 2, v.co.z * r + up * half))
        bmesh.ops.translate(bm, vec=bc, verts=vs)
    else:
        mesh.bm_box(bm, bs, bc)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def shade(ob, colour, vertex_lit=False):
    """Flat colour x a fixed key from the upper front-left so the shape reads (COLOR_0)."""
    n = vcol.corner_normals(ob)
    k = 0.55 + 0.45 * np.clip(n[:, 0] * -0.4 + n[:, 2] * 0.75 + n[:, 1] * -0.53, 0, 1)
    a = np.ones((len(n), 4), dtype=np.float32)
    a[:, :3] = np.asarray(colour, dtype=np.float32)[None, :] * k[:, None] * (0.5 if vertex_lit else 1.0)
    vcol.set_colors(ob, a, "Color")
    if vertex_lit: vcol.mark_vertex_lit(ob)                          # Color holds light / 2: the mesh may be stamped bake VL


def dress(ob, mat, colour, vertex_lit=False):
    """Material, UV0 and COLOR_0 of a placeholder mesh."""
    for p in ob.data.polygons: p.use_smooth = False
    material.assign(ob, mat)
    uv.ensure_layers(ob)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(ob, "chalk")            # palette x COLOR_0 = the category colour
    elif mat in ("m_frontier", "m_pellam"): uv.map_flat(ob, manifest.SHEET_OF[mat])
    elif mat == "m_mask": uv.fill(ob, ((manifest.mask_uv("grille")[0] + manifest.mask_uv("grille")[2]) / 2 + 0.01, (manifest.mask_uv("louvre")[1] + manifest.mask_uv("louvre")[3]) / 2))
    elif mat == "m_gun": uv.fill(ob, (0.5, 0.5))
    elif mat == "m_emis": uv.map_to_emis(ob, "aqua")
    if mat == "m_emis": vcol.emis_attr(ob, 1.0, 0.0, 0.0)
    else: shade(ob, colour, vertex_lit)


def lamp_quads(count, at, facing="front", size=0.06, gap=0.09):
    """`count` small quads in a row centred on Blender point `at`."""
    out = []
    for i in range(count):
        x0 = at[0] + (i - (count - 1) / 2) * gap - size / 2; x1 = x0 + size
        if facing == "up":
            out.append([(x0, at[1] - size / 2, at[2]), (x1, at[1] - size / 2, at[2]), (x1, at[1] + size / 2, at[2]), (x0, at[1] + size / 2, at[2])])
        else:
            out.append([(x0, at[1], at[2] - size / 2), (x1, at[1], at[2] - size / 2), (x1, at[1], at[2] + size / 2), (x0, at[1], at[2] + size / 2)])
    return out


def classify(a, name):
    """How a manifest `nodes` name is realised in a placeholder."""
    if name in (a.get("bones") or []): return "bone"
    if name in (a.get("lampSets") or {}): return "lamp"
    if name.endswith("_mesh"): return "mesh"
    if name in (a.get("nodePos") or {}): return "empty"
    if name in (a.get("drawnNodes") or []) or (name in (a.get("codeDriven") or [])): return "drawn"
    if name in EMPTY_NAMES or name.startswith(EMPTY_HINT) or name.endswith("_hit"): return "empty"
    if a.get("skinned"): return "empty"
    if a.get("animations") and name == a["nodes"][0]: return "animated"
    return "variant"


# ------------------------------------------------------------------ props, creatures, weapons
def build_asset(asset_id, a):
    lo, hi = local_box(a)
    if a["placeholder"]["anchor"] == "world":
        off = world_offset(asset_id, a)
        lo = tuple(lo[i] + off[i] for i in range(3)); hi = tuple(hi[i] + off[i] for i in range(3))
    colour = CATEGORY_COLOUR.get(a["category"], (0.4, 0.4, 0.4))
    mats = a["materials"]; first = next((m for m in mats if m != "m_emis"), mats[0])
    # light / 2 only where the file itself is shown x 2 (bake VL placed by code). A prop its zone lights (VL placedBy
    # zone, LM without a lightmap of its own) carries unlit colours and is stamped AO (export.bake_extras)
    vl = export.bake_extras(a) == ("VL",)
    nodes = a.get("nodes", []); kinds = {n: classify(a, n) for n in nodes}
    lamp_sets = a.get("lampSets") or {}; node_pos = a.get("nodePos") or {}
    rig_tab = RIGS.get(asset_id, {})
    node_parent = {n: par for n, (_, par) in rig_tab.get("sockets", {}).items()}; node_parent.update(a.get("nodeParent") or {})
    socket_pos = {n: pos for n, (pos, _) in rig_tab.get("sockets", {}).items()}; socket_pos.update(node_pos)
    mesh_boxes = rig_tab.get("meshes", {})
    budget = a["triBudget"] - 2 * sum(lamp_sets.values())
    variants = [n for n in nodes if kinds[n] == "variant"]
    mesh_nodes = [n for n in nodes if kinds[n] == "mesh"]
    drawn = [n for n in nodes if kinds[n] == "drawn"]
    root = export.ensure_root(asset_id)
    centre = [(lo[i] + hi[i]) / 2 for i in range(3)]; size = [hi[i] - lo[i] for i in range(3)]
    bodies = []
    shape = a["placeholder"]["shape"]
    if variants:
        cap = budget // len(variants)
        for i, n in enumerate(variants):                              # each variant: the shape, a little smaller each time
            k = 1.0 - 0.22 * i / max(1, len(variants) - 1) if len(variants) > 1 else 1.0
            vlo = tuple(centre[j] - size[j] / 2 * (k if j != 1 else 1.0) for j in range(3))
            vhi = tuple(centre[j] + size[j] / 2 * (k if j != 1 else 1.0) for j in range(3))
            vhi = (vhi[0], lo[1] + size[1] * k, vhi[2]) if a["placeholder"]["anchor"] != "top" else vhi
            ob = mesh.new_mesh_object(n, shape_bmesh(shape, vlo, vhi, cap))
            dress(ob, first, tuple(c * (1.0 - 0.25 * i / max(1, len(variants))) for c in colour), vl)
            ob.parent = root; bodies.append(ob)
    else:
        names = mesh_nodes or [asset_id + "_mesh"]
        cap = (budget - 12 * len(drawn)) // len(names)
        for i, n in enumerate(names):
            if n in mesh_boxes: blo, bhi = mesh_boxes[n][0], mesh_boxes[n][1]
            elif i == 0: blo, bhi = lo, hi
            else:                                                     # further skinned meshes: a slab under the first
                blo = (lo[0], lo[1], lo[2]); bhi = (hi[0], lo[1] + size[1] * 0.25, hi[2])
                blo = (centre[0] - size[0] * 0.3, lo[1] - size[1] * 0.3, centre[2] - size[2] * 0.3); bhi = (centre[0] + size[0] * 0.3, lo[1], centre[2] + size[2] * 0.3)
            ob = mesh.new_mesh_object(n, shape_bmesh("box" if n in mesh_boxes else shape, blo, bhi, cap))
            dress(ob, mats[i] if (mesh_nodes and i < len(mats) and mats[i] != "m_emis") else first, colour, vl)
            ob.parent = root; bodies.append(ob)
    # drawn / code-driven mesh nodes that are not lamp sets (the lift shaft's lamp bars)
    for i, n in enumerate(drawn):
        y = lo[1] + size[1] * (i + 0.5) / len(drawn)
        at = layout.to_blender((centre[0], y, hi[2]))
        em = "m_emis" in mats
        ob = zone.lamp_set(n, lamp_quads(1, (at[0], at[1] - 0.002, at[2]), size=max(0.1, size[0] * 0.3)), origin=at) if em else \
            mesh.new_mesh_object(n, shape_bmesh("box", (centre[0] - 0.1, y - 0.05, hi[2]), (centre[0] + 0.1, y + 0.05, hi[2] + 0.05), 12))
        if em: del ob["lampCount"]
        else: dress(ob, first, colour, vl)
        ob.parent = root
    # lamp sets: on the front face near the top, or at their nodePos
    li = 0
    for n in nodes:
        if kinds[n] != "lamp": continue
        if n in node_pos: at = layout.to_blender(node_pos[n])
        else:
            flo, fhi = next(((b[0], b[1]) for b in mesh_boxes.values()), (lo, hi))          # the front face of the body
            at = layout.to_blender(((flo[0] + fhi[0]) / 2, fhi[1] - 0.08 - 0.1 * li, fhi[2] + 0.004)); li += 1
        ob = zone.lamp_set(n, lamp_quads(lamp_sets[n], (at[0], at[1] - 0.001, at[2])), origin=at)
        ob.parent = root
    # empties: at their nodePos, else where the art order puts them (RIGS), else on the placeholder's front face (never
    # all on the origin: code attaches muzzles, hit volumes and threads to them)
    empties = {}
    loose = [n for n in nodes if kinds[n] == "empty" and n not in socket_pos]
    for n in nodes:
        if kinds[n] != "empty": continue
        if n in socket_pos: pos = socket_pos[n]
        else:
            i = loose.index(n); step = min(0.2, size[0] / (len(loose) + 1))
            pos = (centre[0] + (i - (len(loose) - 1) / 2) * step, centre[1], hi[2])
        e = export.marker(n, layout.to_blender(pos)); e.parent = root; empties[n] = e
    clips = a.get("animations") or []
    driven = set(a.get("codeDriven") or [])
    if a.get("skinned"):
        bones = a["bones"]; specs = []
        tail = max(0.03, min(0.25, size[1] * 0.12))
        rig_bones = rig_tab.get("bones", {})
        free = [b for b in bones if b not in node_pos and b not in rig_bones]
        parent_of = {}
        for b in bones:
            if b in node_pos: h = layout.to_blender(node_pos[b])
            elif b in rig_bones: h = layout.to_blender(rig_bones[b][0])
            else:
                i = free.index(b)
                # the first bone sits on the pivot (the asset's origin); the others climb the placeholder
                h = (0.0, 0.0, 0.0) if b == bones[0] else layout.to_blender((centre[0], lo[1] + size[1] * (0.05 + 0.9 * i / max(1, len(free))), centre[2]))
            par = rig_bones[b][1] if b in rig_bones else (bones[0] if b != bones[0] else None)
            if par is not None and par not in bones: raise RuntimeError(f"{asset_id}: placeholder rig parents '{b}' to '{par}', which is not a manifest bone")
            parent_of[b] = par
            specs.append((b, h, (h[0], h[1], h[2] + tail), par))
        done = set(); ordered = []                                 # parents before children (make_armature looks them up)
        while len(ordered) < len(specs):
            for sp in specs:
                if sp[0] not in done and (sp[3] is None or sp[3] in done): ordered.append(sp); done.add(sp[0])
        arm = rig.make_armature(asset_id + "_rig", ordered)
        arm.parent = root
        for ob in bodies:
            ob.parent = None
            skin_bone = mesh_boxes[ob.name][2] if ob.name in mesh_boxes else bones[0]
            vg = ob.vertex_groups.new(name=skin_bone); vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
            rig.bind(ob, arm)
        for n, e in empties.items():                               # sockets ride their bone, so they follow every clip
            par = node_parent.get(n)
            if par is None: continue
            if par not in bones: raise RuntimeError(f"{asset_id}: socket '{n}' is to ride '{par}', which is not a manifest bone")
            rig.parent_to_bone(e, arm, par)
        target = next((b for b in bones if b not in driven), None)
        if clips and target is None: raise RuntimeError(f"{asset_id}: every bone is code-driven but the asset has clips")
        acts = []
        for c in clips:
            act = anim.new_action(arm, c["name"]); n = manifest.clip_frames(asset_id, c["name"])
            anim.reset_pose(arm)
            sway = math.radians(14)
            if c["loop"]:
                keys = [(0, 0.0), (n // 4 or 1, sway), (n // 2 or 1, 0.0), (max(n - max(1, n // 4), 1), -sway), (n, 0.0)] if n >= 4 else [(0, 0.0), (n, 0.0)]
            else:
                keys = [(0, 0.0), (max(1, n // 2), sway * 1.6), (n, sway)]
            seen = set()
            for f, ang in keys:
                if f in seen: continue
                seen.add(f)
                # lean about the bone's local X (a turn about its own axis would not show) and lift a little
                anim.key_pose(arm, f, {target: {"rot": (ang, 0.0, 0.0), "loc": (0.0, 0.0, 0.0) if ang == 0 else (0.0, abs(ang) * 0.1 * size[1], 0.0)}})
            anim.fix_quaternion_flips(act); acts.append(act)
        if acts: anim.push_to_nla(arm, acts)
    elif clips:
        target = next((n for n in nodes if kinds[n] == "animated"), None)
        e = export.marker(target, (0, 0, 0)); e.parent = root
        for ob in bodies: ob.parent = e
        acts = []
        for c in clips:
            act = anim.new_action(e, c["name"]); n = manifest.clip_frames(asset_id, c["name"])
            swing = math.radians(95)
            if c["loop"]:
                anim.key_object(e, 0, rot=(0, 0, 0)); anim.key_object(e, max(1, n // 2), rot=(0, 0, swing * 0.3)); anim.key_object(e, n, rot=(0, 0, 0))
            else:
                anim.key_object(e, 0, rot=(0, 0, 0)); anim.key_object(e, n, rot=(0, 0, swing))
            e.rotation_euler = (0, 0, 0); acts.append(act)
        anim.push_to_nla(e, acts)


# ------------------------------------------------------------------ zones: the greybox
def greybox_light(n_game):
    sx, sy, sz = layout.load()["meta"]["sun"]["toSun"]
    l = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0; sx, sy, sz = sx / l, sy / l, sz / l
    nx, ny, nz = n_game
    light = AMBIENT * (0.55 + 0.25 * ny) + KEY * max(0.0, nx * sx + ny * sy + nz * sz) + 0.18 * max(0.0, -(nx * sx + nz * sz))
    return min(1.0, light / vcol.VERTEX_LIGHT_SCALE)


def build_zone(asset_id, a):
    zid = a["zone"]; plan = a["chunks"]
    z = layout.zone(zid)
    lm = (a.get("lightmaps") or [None])[0]
    solids_chunk = {sid: c["id"] for c in plan for sid in (c.get("solids") or [])}
    has_height_rule = any(c.get("part") == "high" and not c.get("solids") for c in plan)
    b0 = z["bounds"]["min"]; b1 = z["bounds"]["max"]
    parts = []; terrain = []
    for s in layout.solids(zid):
        if s.get("role") == "terrain" and "collider_terrain" in a.get("nodes", []): terrain.append(layout.solid_mesh(s, "ct_" + s["id"]))
        if s.get("invisible") or s.get("playerOnly") or s.get("dynamic"): continue
        ob = layout.solid_mesh(s)
        if s["id"] in solids_chunk: ob["chunk"] = solids_chunk[s["id"]]
        else:
            zone.cut_at_chunk_boxes(ob, asset_id)
            if has_height_rule:                                       # cut at "3 m above the path's ground" so the top goes to the skyline chunk
                mn, mx = mesh.bounds(ob)
                g = -1e9; nx = max(1, int((mx.x - mn.x))); ny = max(1, int((mx.y - mn.y)))
                for i in range(nx + 1):
                    for j in range(ny + 1):
                        p = layout.to_game((mn.x + (mx.x - mn.x) * i / nx, mn.y + (mx.y - mn.y) * j / ny, 0))
                        pg = layout.path_ground(zid, p[0], p[2])
                        if pg is not None: g = max(g, pg)
                cutz = g + zone.HIGH_CLEARANCE + 0.25
                if mn.z + 1e-3 < cutz < mx.z - 1e-3:
                    bm = bmesh.new(); bm.from_mesh(ob.data)
                    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cutz), plane_no=(0, 0, 1))
                    bm.to_mesh(ob.data); bm.free()
        me = ob.data
        want = layout.surface_material(s["surface"])
        tint = np.asarray(manifest.palette_rgb(SURFACE_COLOUR.get(s["surface"], "concrete")), dtype=np.float32)
        col = np.ones((len(me.loops), 4), dtype=np.float32)
        uv.ensure_layers(ob, lightmap=True)
        u1 = uv.get(ob, uv.UV1)
        if lm: u1[:] = bake.neutral_uv(lm)
        walk = s["role"] in ("floor", "terrain", "platform") and s["shape"] != "ramp"
        by_region = {}; vertex_lit = []
        for p in me.polygons:
            cg = layout.to_game(p.center)
            c = next(cc for cc in plan if cc["id"] == ob["chunk"]) if "chunk" in ob.keys() else zone.chunk_for(asset_id, cg, min(me.vertices[v].co.z for v in p.vertices))
            if c is None: raise RuntimeError(f"{asset_id}: solid {s['id']} has a face at {tuple(round(x, 2) for x in cg)} in no chunk")
            mat = want if want in c["materials"] else next(m for m in c["materials"] if m in zone.STRUCTURE)
            material.assign(ob, mat, [p.index])
            ng = layout.to_game(p.normal)
            lit_by_map = bool(lm) and walk and ng[1] > 0.99 and mat in zone.STRUCTURE
            k = 1.0 if lit_by_map else greybox_light(ng)
            if not lit_by_map: vertex_lit.append(p.index)
            for li in range(p.loop_start, p.loop_start + p.loop_total):
                col[li, :3] = tint * k
                if lit_by_map:
                    g = layout.to_game(me.vertices[me.loops[li].vertex_index].co)
                    u1[li] = (0.05 + 0.9 * (g[0] - b0[0]) / (b1[0] - b0[0]), 1.0 - (0.05 + 0.9 * (g[2] - b0[2]) / (b1[2] - b0[2])))
            region = "sand" if mat == "m_sand" else TRIM_OF.get((mat, s["surface"]), "flat")
            if mat == "m_pellam" and region in ("panel", "steel") and abs(ng[1]) > 0.9: region = "floor"
            by_region.setdefault((mat, region), []).append(p.index)
        uv.put(ob, u1, uv.UV1)
        vcol.set_colors(ob, col, "Color")
        vcol.mark_vertex_lit(ob, vertex_lit)                          # greybox_light wrote light / 2 on every vertex-lit face
        for (mat, region), faces in by_region.items():
            if region == "sand": uv.map_planar_world(ob, 4.0, faces)
            elif region == "flat": uv.map_flat(ob, manifest.SHEET_OF[mat], faces)
            else: uv.map_to_trim(ob, faces, manifest.SHEET_OF[mat], region, along='horizontal', angle=1.0)
        parts.append(ob)
    counts = zone.assign_chunks(parts, asset_id)
    # every planned mesh exists: a chunk material nothing maps to gets a token panel on the chunk's biggest wall
    tokens = []
    for c in plan:
        for mat in c["materials"]:
            if f"{c['id']}__{mat}" in counts: continue
            best = None
            for ob in parts:
                me = ob.data; vals = np.zeros(len(me.polygons), dtype=np.int32); me.attributes[zone.GROUP].data.foreach_get("value", vals)
                names = list(bpy.context.scene["_ks_groups"])
                for p in me.polygons:
                    if not names[vals[p.index] - 1].startswith(c["id"] + "__") or abs(p.normal.z) > 0.3: continue
                    if best is None or p.area > best[0]: best = (p.area, Vector(p.center), Vector(p.normal))
            if best is None:
                cc = layout.to_blender([(c["box"]["min"][i] + c["box"]["max"][i]) / 2 for i in range(3)]); best = (0, Vector(cc), Vector((0, -1, 0)))
            _, pc, pn = best
            w, h = (0.6, 0.9) if mat == "m_mask" else ((1.2, 0.1) if mat == "m_emis" else (0.6, 0.6))
            side = Vector((0, 0, 1)).cross(pn).normalized(); up = Vector((0, 0, 1))
            o = pc + pn * 0.004 + side * (0.8 * len(tokens) % 3)
            bm = mesh.new_bmesh()
            bm.faces.new([bm.verts.new(o + side * sx * w / 2 + up * sz * h / 2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            t = mesh.new_mesh_object(f"token_{c['id']}_{mat}", bm)
            if t.data.polygons[0].normal.dot(pn) < 0: t.data.flip_normals()
            material.assign(t, mat); uv.ensure_layers(t, lightmap=True)
            if lm: bake.set_vertex_lit_uv1(t, None, lm)
            if mat == "m_mask": uv.map_to_mask(t, None, "mark_brush_a" if z["kind"] == "exterior" else "mark_cast"); vcol.fill_color(t, tuple(c2 * 0.5 for c2 in manifest.palette_rgb("town_paint" if z["kind"] == "exterior" else "steel_dark")))
            elif mat == "m_emis": uv.map_to_emis(t, "aqua"); vcol.emis_attr(t, 1.0, 0.0, 0.0)
            else: uv.map_flat(t, manifest.SHEET_OF[mat]) if mat != "m_sand" else uv.map_planar_world(t); vcol.fill_color(t, tuple(c2 * 0.5 for c2 in manifest.palette_rgb("enamel" if mat == "m_pellam" else "sand")))
            if mat != "m_emis": vcol.mark_vertex_lit(t)               # colour x 0.5 = light 1.0 / 2
            t["chunk"] = c["id"]; tokens.append(t)
    if tokens: zone.assign_chunks(tokens, asset_id)
    merged = zone.merge_chunks(asset_id, parts + tokens)
    root = export.ensure_root(asset_id)
    # named nodes
    lamp_sets = a.get("lampSets") or {}
    nav0 = next((n["pos"] for n in layout.load()["nav"]["nodes"] if n["zone"] == zid), [(b0[i] + b1[i]) / 2 for i in range(3)])
    k = 0
    for n in a.get("nodes", []):
        if n in lamp_sets:
            count = lamp_sets[n]; anchors = []
            for mid in LAMP_ANCHORS.get(n, []):
                try: anchors.append(layout.marker(mid)["pos"])
                except KeyError: pass
            if len(anchors) == count and count > 1:
                quads = [lamp_quads(1, layout.to_blender((p[0], p[1] + 0.02, p[2])), facing="up", size=0.4)[0] for p in anchors]
                at = layout.to_blender(anchors[0])
            else:
                p = anchors[0] if anchors else (nav0[0], nav0[1] + 2.2 + 0.25 * k, nav0[2]); k += 1
                at = layout.to_blender(p)
                quads = lamp_quads(count, at, facing="up", size=0.25, gap=0.4)
            ob = zone.lamp_set(n, quads, colour="violet" if "violet" in n or n == "bore_glow" else "aqua", origin=at,
                               flicker_group=0.5 if "flicker" in n else 0.0, wrong_fade=1.0 if n == "bore_glow" else 0.0)
        elif n == "collider_terrain":
            ob = zone.collider_terrain(mesh.join(terrain)) if terrain else None
            terrain = []
        elif n == "plug_door_tally":
            m = layout.marker("door_tally"); w, h = m["size"][0], m["size"][1]
            tz = layout.zone("tally_house")["bounds"]; inward = -1.0 if (tz["min"][2] + tz["max"][2]) / 2 < m["pos"][2] else 1.0
            zc = m["pos"][2] + inward * 0.3
            pts = [(m["pos"][0] - w / 2, m["pos"][1], zc), (m["pos"][0] + w / 2, m["pos"][1], zc), (m["pos"][0] + w / 2, m["pos"][1] + h, zc), (m["pos"][0] - w / 2, m["pos"][1] + h, zc)]
            bm = mesh.new_bmesh()
            vs = [bm.verts.new(layout.to_blender(p)) for p in pts]
            bm.faces.new(vs); bm.faces.new(list(reversed([bm.verts.new(v.co) for v in vs])))
            ob = mesh.new_mesh_object(n, bm)
            material.assign(ob, "m_frontier"); uv.ensure_layers(ob, lightmap=True); uv.map_flat(ob, "tx_frontier_trim")
            if lm: bake.set_vertex_lit_uv1(ob, None, lm)
            vcol.fill_color(ob, (0.0, 0.0, 0.0)); ob["bake"] = "VL"; vcol.mark_vertex_lit(ob)
        elif n in (a.get("drawnNodes") or []):                        # pump_rotor, pump_tail: boxes on top of the pump tower
            try:
                t = layout.solid("yd_pump_tower"); top = (t["pos"][0], t["pos"][1] + t["size"][1] / 2, t["pos"][2])
            except KeyError: top = (nav0[0], nav0[1] + 4, nav0[2])
            sz = (4.0, 4.0, 0.2) if "rotor" in n else (0.2, 0.8, 2.0)
            at = layout.to_blender((top[0], top[1] + 0.5 + (0 if "rotor" in n else 0.2), top[2] + (0 if "rotor" in n else 1.4)))
            ob = mesh.box(n, layout.size_to_blender(sz), (0, 0, 0)); ob.location = at
            mat = "m_frontier" if "m_frontier" in a["materials"] else a["materials"][0]
            material.assign(ob, mat); uv.ensure_layers(ob, lightmap=True); uv.map_flat(ob, manifest.SHEET_OF[mat])
            if lm: bake.set_vertex_lit_uv1(ob, None, lm)
            shade(ob, manifest.palette_rgb("board"), True); ob["bake"] = "VL"
        else:
            p = layout.solid("bo_floor")["pos"] if n == "bore_axis" else nav0
            ob = export.marker(n, layout.to_blender(p))
        if ob is not None: ob.parent = root
    for e in zone_dressing(zid): e.parent = root


def dressing_spots(zid, want, clear=1.5, reach=6.0, wall=0.6, step=0.5):
    """Up to `want` game-space points for placeholder dressing in zone `zid`: on top of an unrotated box floor of the
    zone, `clear` .. 6 m from the nearest nav link (so nothing blocks a path and check-glb's "nothing taller than 0.35 m
    on a nav link" holds), `clear` m from every marker, `wall` m clear of every other solid, 1.2 m apart.
    Deterministic: candidates on a `step` m grid, nearest to the path first."""
    L = layout.load()
    nodes = {n["id"]: n for n in L["nav"]["nodes"]}
    segs = [(nodes[a]["pos"], nodes[b]["pos"]) for a, b in L["nav"]["links"] if nodes[a]["zone"] == zid or nodes[b]["zone"] == zid]
    marks = [m["pos"] for m in L["markers"]]
    def box_of(s):                                                    # conservative game-space AABB of a solid
        hx, hy, hz = (s["size"][0] / 2, s["size"][1] / 2, s["size"][2] / 2)
        if s["shape"] == "cylinder": hz = hx
        elif s.get("rotY"): hx = hz = math.hypot(hx, hz)
        lo_y = s["pos"][1] - hy - (s.get("skirt", 0) or 0)
        return (s["pos"][0] - hx, lo_y, s["pos"][2] - hz), (s["pos"][0] + hx, s["pos"][1] + hy, s["pos"][2] + hz)
    boxes = [(s["id"], box_of(s)) for s in L["solids"]]
    def nav_dist(p):
        best = 1e9
        for a, b in segs:
            dx, dz = b[0] - a[0], b[2] - a[2]; l2 = dx * dx + dz * dz
            t = 0.0 if l2 < 1e-9 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / l2))
            if abs(a[1] + (b[1] - a[1]) * t - p[1]) > 2.5: continue
            best = min(best, math.hypot(p[0] - (a[0] + dx * t), p[2] - (a[2] + dz * t)))
        return best
    cands = []
    for s in layout.solids(zid):
        if s["role"] not in ("floor", "terrain", "platform") or s["shape"] != "box" or s.get("rotY") or s.get("invisible") or s.get("dynamic"): continue
        top = s["pos"][1] + s["size"][1] / 2
        nx = int((s["size"][0] - 2 * wall) / step); nz = int((s["size"][2] - 2 * wall) / step)
        for i in range(max(0, nx) + 1):
            for j in range(max(0, nz) + 1):
                if nx < 0 or nz < 0: continue
                p = (s["pos"][0] - nx * step / 2 + i * step, top, s["pos"][2] - nz * step / 2 + j * step)
                d = nav_dist(p)
                if not (clear <= d <= reach): continue
                if any(math.hypot(m[0] - p[0], m[2] - p[2]) < clear and abs(m[1] - p[1]) < 3.0 for m in marks): continue
                if any(sid != s["id"] and lo[0] - wall < p[0] < hi[0] + wall and lo[2] - wall < p[2] < hi[2] + wall and lo[1] < top + 2.0 and hi[1] > top + 0.02
                       for sid, (lo, hi) in boxes): continue
                cands.append((round(d, 3), round(p[0], 3), round(p[2], 3), p))
    out = []
    for _, _, _, p in sorted(cands):
        if all(math.hypot(p[0] - q[0], p[2] - q[2]) >= 1.2 for q in out): out.append(p)
        if len(out) == want: break
    return out


def zone_dressing(zid):
    """Placeholder dressing empties (ARCHITECTURE 7.5), so world's generic dressing path and render's instanced draw
    calls have real anchors to run against before the zone artists place theirs: up to three `inst_<nnn>` (one per
    asset of the zone's allowance, floor-standing ones first) and one `brk_<nnn>` (a bottle where the zone allows one,
    else its first asset; the same (asset, node) as an inst, so it adds no draw call), each with the extras
    {asset, node?}. A zone whose allowance lists no asset (far_rim) gets none. Returns the empties."""
    allow = (manifest.load()["zones"].get(zid) or {}).get("dressing") or {}
    ids = list(allow.get("assets") or [])
    if not ids: return []
    on_floor = lambda i: manifest.asset(i)["placeholder"]["anchor"] != "top"
    ids = [i for i in ids if on_floor(i)] + [i for i in ids if not on_floor(i)]
    inst = ids[:max(1, min(3, int(allow.get("drawCalls", 1))))]
    brk = "prop_bottle" if "prop_bottle" in inst else inst[0]
    spots = []
    for clear, wall, step in ((1.5, 0.6, 1.0), (1.2, 0.5, 0.5), (0.95, 0.45, 0.25)):   # narrow interiors: closer to the path and
        spots = dressing_spots(zid, len(inst) + 1, clear=clear, wall=wall, step=step)   # walls; never under check-glb's 0.45 m + radius
        if len(spots) == len(inst) + 1: break
    if len(spots) < len(inst) + 1: raise RuntimeError(f"zone {zid}: only {len(spots)} free floor spots for {len(inst) + 1} placeholder dressing empties")
    out = []
    for k, (kind, aid) in enumerate([("inst", i) for i in inst] + [("brk", brk)]):
        d = manifest.asset(aid); p = spots[k]
        node = (export.variant_names(d) or [None])[0]
        y = p[1] + (0.0 if on_floor(aid) else 1.7)                    # a hung thing (anchor top) hangs at 1.7 m
        n = 1 if kind == "brk" else k + 1
        out.append(zone.dressing_empty(kind, n, aid, node=node, loc=layout.to_blender((p[0], y, p[2])), rot_z=math.radians(35.0 * k)))
    return out


# ------------------------------------------------------------------ textures
def placeholder_texture(tid, t):
    w, h = t["size"]
    kind = t["kind"]
    if kind in ("lightmap", "lightlayer"):
        lin = np.full((h, w, 3), 0.0 if kind == "lightlayer" else 1.0, dtype=np.float32)     # light 1.0 -> stored 0.5 -> sRGB 188
        return bake.encode_lightmap(lin, tid)
    if kind == "noise":
        return td.finish_detail(td.fbm(w, h, 4, 4, octaves=4, seed=5), lo=0.0, hi=1.0, target_mean=0.5)
    if kind == "fx":
        img = np.zeros((h, w, 4), dtype=np.float32)
        regions = t.get("regions", [])
        cells = [(i * 256, 0, 256, 256) for i in range(4)] + [((i % 8) * 128, 256 + (i // 8) * 128, 128, 128) for i in range(16)]
        for name, (x, y, cw, ch) in zip(regions, cells):
            X, Y = td.grid(cw, ch)
            r = np.hypot(X - cw / 2, Y - ch / 2) / (cw / 2)
            blob = np.clip(1.0 - r, 0, 1) ** 2 * 0.8
            tris, tw, th = brand.text_triangles(name.upper().replace("_", " "), 1.0, bridges=False)
            s = min((cw - 12) / tw, 14.0 / th)
            px = np.empty_like(tris); px[:, :, 0] = tris[:, :, 0] * s + (cw - tw * s) / 2; px[:, :, 1] = (th - tris[:, :, 1]) * s + ch - 22
            label = td.raster_triangles(px, cw, ch, ss=2)
            alpha = np.maximum(blob, label)
            cell = np.zeros((ch, cw, 4), dtype=np.float32)
            cell[:, :, 0] = cell[:, :, 1] = cell[:, :, 2] = alpha                                # premultiplied white
            cell[:, :, 3] = alpha
            img[y:y + ch, x:x + cw] = cell
        return img
    if t["format"] == "r8": return np.full((h, w), 0.5, dtype=np.float32)
    img = np.ones((h, w, 4), dtype=np.float32); img[:, :, :3] = 0.5
    return img


def main():
    p = argparse.ArgumentParser(prog="placeholders.py")
    p.add_argument("--assets", default=""); p.add_argument("--textures", default="")
    p.add_argument("--force", action="store_true", help="rebuild placeholders that exist (never a final file)")
    args = p.parse_args(scene.argv_after_dashes())
    failed = 0
    for tid in [x for x in args.textures.split(",") if x]:
        t0 = time.perf_counter()
        try:
            t = manifest.texture(tid); out = manifest.raw_texture_path(tid)
            if os.path.isfile(out) and not png_is_placeholder(out):
                print(f"KEPT {tid} (a final texture is there)"); continue
            scene.reset_scene()
            td.write_png(out, placeholder_texture(tid, t), {"placeholder": "1"})
            print(f"PLACEHOLDER {tid} {t['size'][0]}x{t['size'][1]} {t['format']} {time.perf_counter() - t0:.2f}s")
        except Exception:
            import traceback; traceback.print_exc(); print(f"FAILED {tid}"); failed += 1
    for aid in [x for x in args.assets.split(",") if x]:
        t0 = time.perf_counter()
        try:
            a = manifest.asset(aid); out = manifest.raw_path(aid)
            if os.path.isfile(out) and not glb_is_placeholder(out, aid):
                print(f"KEPT {aid} (a final asset is there)"); continue
            scene.reset_scene()
            export._embedded.clear(); manifest.reset_tables_used()
            if a["placeholder"].get("source") == "layout-solids": build_zone(aid, a)
            else: build_asset(aid, a)
            tmp = os.path.join(os.path.dirname(out), f".{aid}.{os.getpid()}.ph.tmp.glb")
            rep = export.export_asset(aid, tmp, placeholder=True)
            os.replace(tmp + ".deps.json", out + ".deps.json"); os.replace(tmp, out)      # readers never see half a file
            print(f"PLACEHOLDER {aid} tris {rep['tris']} {time.perf_counter() - t0:.2f}s")
        except Exception:
            import traceback; traceback.print_exc(); print(f"FAILED {aid}"); failed += 1
        sys.stdout.flush()
    if failed: sys.exit(1)


if __name__ == "__main__":
    scene.run(main)
