"""rd_plate: a Pellam cast plate 0.6 x 0.34 m (16:9), four rivets, 6 mm proud, a raised border; the mark at the left,
the wordmark, the one line the player must be able to read on the object, and raised bars for the remaining body lines
(ART_BIBLE 5.6, 7.4; P0). Three variant nodes (each one mesh: `m_prop` cast steel + `m_mask` lettering):

    plate_line      `picto_line` + LINE CHARGE. FOR SIGHTING.
    plate_proving   LOAD-BEARING: a banded cartridge in 8 mm relief, 0.25 m tall (geometry, the shape of `picto_charge`)
                    + PROVING CHARGE. BANDED. + DO NOT KEEP.
    plate_service   TAMPING UNIT.

Pellam is exact: nothing here is jittered. Pivot: back centre; the plate faces -Y. Only the four `plate_lines` strings
and the wordmark appear as words (design/story.json); every other line is a plain raised bar.

    node tools/build-assets.mjs --only rd_plate
"""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _d)
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
import numpy as np
from mathutils import Vector, Matrix
from lib import scene, mesh, uv, material, vcol, export, manifest, layout
import dress_common as dc

ASSET = "rd_plate"


PW, PH = 0.60, 0.34
PROUD = 0.006
FIELD = -0.0035                # the sunk field, y
CAST = "steel"
RAISED = "#587880"             # relief worn a little brighter than the field
BAND = "#9FB2AE"               # the band round the charge's waist: the one pale thing on the plate
LETTER = "#93A9AA"             # lettering stands proud and is rubbed bright (m_mask tint)


CLIP = 0.03                    # the plate's corners are cut at 45 degrees: a cast plate, not a sheet


def rect_ring(bm, hx, hz, y, clip=CLIP):
    """An eight-cornered ring: the rectangle with its corners clipped (the same 45-degree cut at every inset)."""
    pts = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        a = (sx * hx, sz * (hz - clip)) if sx * sz > 0 else (sx * (hx - clip), sz * hz)
        b = (sx * (hx - clip), sz * hz) if sx * sz > 0 else (sx * hx, sz * (hz - clip))
        pts += [a, b]
    return [bm.verts.new((x, y, z)) for x, z in pts]


def plate_body(name):
    bm = mesh.new_bmesh()
    t = math.tan(math.pi / 8)                                          # keeps the cut at 45 degrees as the ring insets
    r0 = rect_ring(bm, PW / 2, PH / 2, 0.0)
    r1 = rect_ring(bm, PW / 2 - PROUD, PH / 2 - PROUD, -PROUD, CLIP - PROUD * t)
    r2 = rect_ring(bm, PW / 2 - 0.020, PH / 2 - 0.020, -PROUD, CLIP - 0.020 * t)
    r3 = rect_ring(bm, PW / 2 - 0.0225, PH / 2 - 0.0225, FIELD, CLIP - 0.0225 * t)
    for a, b in ((r0, r1), (r1, r2), (r2, r3)):
        for k in range(8):
            j = (k + 1) % 8
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(r3)
    bm.normal_update()
    ob = mesh.new_mesh_object(name, bm)
    dc.paint(ob, CAST)
    return ob


def rivet(name, x, z):
    o = dc.lathe(name, [(0.0085, 0.0), (0.0055, 0.0045)], seg=6, cap_last=True)
    dc.place(o, (x, FIELD, z), (math.radians(90), 0, 0))
    dc.smooth(o, angle=40)
    dc.paint(o, CAST, RAISED, shade=1.05)
    return o


def bar(name, x0, x1, z, h=0.009):
    o = dc.box(name, (x1 - x0, 0.002, h), ((x0 + x1) / 2, FIELD - 0.001, z), drop=("+y",))
    dc.paint(o, CAST, RAISED)
    return o


def charge(name, x, z0):
    """The banded cartridge in relief: half a lathe, pressed to 8 mm, 0.25 m tall (case 12 x 33 mm and a 41 mm round
    at 6.1 : 1; the band 9 mm wide round the waist, standing off the case as the sleeve does)."""
    prof = [(0.0400, 0.000), (0.0400, 0.009), (0.0366, 0.012), (0.0366, 0.072), (0.0410, 0.074), (0.0410, 0.129),
            (0.0366, 0.131), (0.0366, 0.201), (0.0340, 0.203), (0.0255, 0.232), (0.0, 0.250)]
    o = dc.lathe(name, prof, seg=4, sy=0.2, centre=(x, FIELD, z0), sweep=(math.pi, 2 * math.pi))
    dc.smooth(o, angle=40)
    dc.paint(o, CAST, RAISED)
    band = [p.index for p in o.data.polygons if z0 + 0.073 < p.center.z < z0 + 0.130]
    dc.paint(o, "enamel", BAND, faces=band, part=False)
    return o


def decals(name, items):
    """items = [(region, index, x0, z0, x1, z1)]: one quad each, 1 mm off the field."""
    y = FIELD - 0.001
    d = dc.poly(name, [[(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)] for (_, _, x0, z0, x1, z1) in items])
    material.assign(d, "m_mask")
    for i, (reg, idx, *_r) in enumerate(items): uv.map_to_mask(d, [i], reg, idx)
    vcol.fill_color(d, LETTER)
    return d


def text_quad(index, x0, zc, width):
    h = width * 32.0 / 384.0
    return ("plate_lines", index, x0, zc - h / 2, x0 + width, zc + h / 2)


def variant(name, kind):
    parts = [plate_body(name + "_body")]
    for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        parts.append(rivet(f"{name}_rivet{i}", sx * (PW / 2 - 0.038), sz * (PH / 2 - 0.038)))
    mark_h = 0.168; mark_w = mark_h * 128.0 / 192.0
    mx = -PW / 2 + 0.062
    items = [("mark_cast", None, mx, -mark_h / 2, mx + mark_w, mark_h / 2)]
    if kind == "line":
        cx = -0.105; cw = 0.365
        items.append(("wordmark", None, cx, 0.086, cx + cw * 0.86, 0.086 + cw * 0.86 * 48 / 512))
        items.append(("picto_line", None, cx, 0.012, cx + 0.232, 0.012 + 0.232 * 64 / 256))
        items.append(text_quad(0, cx, -0.036, cw))
        parts += [bar(name + "_bar0", cx, cx + 0.30, -0.079), bar(name + "_bar1", cx, cx + 0.21, -0.103)]
    elif kind == "proving":
        parts.append(charge(name + "_charge", -0.092, -0.125))
        cx = -0.030; cw = 0.290
        items.append(("wordmark", None, cx, 0.090, cx + cw, 0.090 + cw * 48 / 512))
        items.append(text_quad(1, cx, 0.045, cw))
        items.append(text_quad(2, cx, 0.004, cw))
        parts += [bar(name + "_bar0", cx, cx + 0.27, -0.044), bar(name + "_bar1", cx, cx + 0.22, -0.068), bar(name + "_bar2", cx, cx + 0.25, -0.092)]
    else:
        cx = -0.105; cw = 0.365
        items.append(("wordmark", None, cx, 0.086, cx + cw * 0.86, 0.086 + cw * 0.86 * 48 / 512))
        items.append(text_quad(3, cx, 0.036, cw))
        parts += [bar(name + "_bar0", cx, cx + 0.33, -0.012), bar(name + "_bar1", cx, cx + 0.26, -0.036),
                  bar(name + "_bar2", cx, cx + 0.31, -0.060), bar(name + "_bar3", cx, cx + 0.15, -0.084)]
    dc.bake_ao(parts, distance=0.05, ground=None)
    body = dc.join(parts, name)

    def cast(p):
        border = (p.y < -PROUD + 0.0005) & (p.fnrm[:, 1] < -0.9) & ((np.abs(p.x) > PW / 2 - 0.021) | (np.abs(p.z) > PH / 2 - 0.021))
        p.mix(border * 0.6, RAISED)                                     # the raised border, rubbed
        field = (np.abs(p.y - FIELD) < 0.0004) & (p.fnrm[:, 1] < -0.9)
        p.mul(field, 0.82)                                              # the sunk field holds the dark
        p.mul(field * np.clip(1.0 - (p.z + PH / 2 - 0.022) / 0.05, 0, 1), 0.8)   # dust settles along the lower edge
    dc.compose(body, ao=0.9, gradient=(0.94, 1.04), part_jitter=0.0, face_jitter=0.0, painters=[cast,
               dc.stain_below([(-(PW / 2 - 0.038), FIELD, -(PH / 2 - 0.038) + 0.11), ((PW / 2 - 0.038), FIELD, (PH / 2 - 0.038))], width=0.02, length=0.12, factor=0.85)], quiet=True)
    dec = decals(name + "_letters", items)
    ob = dc.join([body, dec], name)
    vcol.color_layer(ob, vcol.COLOR)
    return ob


def build(args):
    variant("plate_line", "line")
    variant("plate_proving", "proving")
    variant("plate_service", "service")


def main():
    args = scene.asset_args(os.path.basename(__file__))
    scene.reset_scene()
    build(args)
    dc.export_asset(ASSET, args)


if __name__ == "__main__":
    scene.run(main)
