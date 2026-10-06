"""Pipeline fixture (a): a Frontier crate beside a Pellam panel wall: the proof that "no primitive look" is reachable
with blender/lib alone: parts not primitives, seeded jitter, bevel + weighted normals, trim-sheet mapping
(uv.map_to_trim), AO + gradients in vertex colour, the knot, the mark, the maker's plate, a geometry numeral.
Read it as the worked example for an m_frontier / m_pellam asset. Not a game asset."""
import sys, os
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import math
from mathutils import Matrix, Vector
from lib import scene, mesh, uv, material, vcol, export, knot, brand

ASSET = "fixture_crate_panel"
FT, PT = "tx_frontier_trim", "tx_pellam_trim"
BAND_Z, BAND_H = 1.2 + 0.05 + 0.06, 0.10        # the livery band: centre height and height (it covers the foot of the upper-left panel)


def plank(name, size, centre, rng, tint, rot_z=0.0, row=None, lean=0.012):
    """One board: jittered, bevelled 8 mm, mapped to a plank row with a random U shift (never two equal neighbours)."""
    ob = mesh.box(name, size, (0, 0, 0))
    ob.rotation_euler = (rng.uniform(-lean, lean), rng.uniform(-lean, lean), rot_z + rng.uniform(-lean, lean))
    ob.location = centre
    mesh.apply_transform(ob)
    mesh.finish(ob, bevel=0.008)
    material.assign(ob, "m_frontier")
    uv.map_to_trim(ob, None, FT, row or rng.choice(("plank_a", "plank_a", "plank_b")), rng=rng)
    ends = [p.index for p in ob.data.polygons if p.area < 0.012 and len(p.vertices) == 4 and abs(p.normal.z) < 0.5 and max(size[:2]) > 0.3
            and abs(p.normal.dot(Vector((math.cos(rot_z), math.sin(rot_z), 0)))) > 0.9]
    if ends: uv.map_to_trim(ob, ends, FT, "plank_end", along='horizontal')
    vcol.tint(ob, tint)
    # a board's only vertices are at its ends, and the ends sit under the corner battens: without an edge loop the whole
    # board bakes dark (vcol.bake_ao_vertex prints a WARNING). Split AFTER mapping: UVs and tint are interpolated
    if max(size) > 0.5: mesh.tessellate_max_edge(ob, 0.3)
    return ob


def crate(rng, origin):
    """0.9 m crate: a dark core, four planks a side with gaps, corner battens, a lid of five boards, one sprung."""
    ox, oy = origin; S = 0.9; H = 0.8; parts = []
    core = mesh.box("core", (S - 0.07, S - 0.07, H - 0.05), (ox, oy, H / 2))
    material.assign(core, "m_frontier"); uv.map_flat(core, FT); vcol.tint(core, "board_dark"); parts.append(core)
    for side in range(4):                                                        # planks run horizontally round the box
        a = side * math.pi / 2; nx, ny = math.cos(a), math.sin(a)
        z = 0.03
        for k in range(4):
            w = rng.uniform(0.16, 0.21)
            if z + w > H - 0.02: w = H - 0.02 - z
            c = (ox + nx * (S / 2 - 0.012 + rng.uniform(-0.004, 0.004)), oy + ny * (S / 2 - 0.012), z + w / 2)
            tint = rng.choice(("board", "board", "board_bleached"))
            parts.append(plank(f"p{side}{k}", (S - 0.04 - rng.uniform(0, 0.02), 0.024, w - 0.006), c, rng, tint, rot_z=a + math.pi / 2))
            z += w
        tx, ty = -ny, nx                                                          # corner batten, standing
        parts.append(plank(f"b{side}", (0.075, 0.03, H + 0.01), (ox + nx * (S / 2 + 0.012) + tx * (S / 2 - 0.05), oy + ny * (S / 2 + 0.012) + ty * (S / 2 - 0.05), H / 2),
                           rng, "board_bleached", rot_z=a + math.pi / 2, row="plank_a", lean=0.02))
    x = -S / 2 + 0.01
    for k in range(5):                                                           # lid boards, widths never equal
        w = (S - 0.02) / 5 + rng.uniform(-0.025, 0.025) if k < 4 else S / 2 - 0.01 - x
        sprung = k == 3
        c = (ox + x + w / 2, oy + rng.uniform(-0.01, 0.01), H + 0.012 + (0.018 if sprung else rng.uniform(0, 0.004)))
        b = plank(f"lid{k}", (w - 0.008, S + 0.03 - rng.uniform(0, 0.02), 0.024), c, rng, "board_bleached", row=None, lean=0.05 if sprung else 0.012)
        parts.append(b); x += w
    for k, zc in enumerate((0.16, 0.62)):                                        # two iron straps round the box
        for side in range(4):
            a = side * math.pi / 2; nx, ny = math.cos(a), math.sin(a)
            s = mesh.box(f"strap{k}{side}", (S + 0.07, 0.006, 0.05), (0, 0, 0))
            s.rotation_euler = (0, 0, a + math.pi / 2); s.location = (ox + nx * (S / 2 + 0.03), oy + ny * (S / 2 + 0.03), zc)
            mesh.apply_transform(s); mesh.finish(s, bevel=0.0)
            material.assign(s, "m_frontier"); uv.map_to_trim(s, None, FT, "strap", rng=rng); vcol.tint(s, "rust"); parts.append(s)
    ob = mesh.join(parts, "crate_part")
    ob.rotation_euler = (0, 0, 0.3); mesh.apply_transform(ob)                    # it does not stand square to anything
    mesh.delete_faces(ob, lambda f, c, n: n.z < -0.9 and c.z < 0.05)             # nobody sees the bottom
    return ob


def panel_wall(origin):
    """A 2.4 x 2.4 m Pellam wall on the 1.2 m module: three ceramic panels (20 mm bevel, exact), the fourth missing so
    the steel frame shows; a kick plate; a livery band; a knot on a hex collar; the mark in relief; a maker's plate."""
    ox, oy = origin; M = 1.2; pellam = []; prop = []
    frame = mesh.box("frame", (2 * M + 0.1, 0.08, 2 * M + 0.1), (ox, oy + 0.06, M + 0.05))
    mesh.finish(frame, bevel=0.01); material.assign(frame, "m_pellam"); uv.map_to_trim(frame, None, PT, "steel"); vcol.tint(frame, "steel"); pellam.append(frame)
    for ix in range(2):
        for iz in range(2):
            if (ix, iz) == (1, 0): continue                                      # break the module: one panel is gone
            p = mesh.box(f"panel{ix}{iz}", (M - 0.012, 0.05, M - 0.012), (ox - M / 2 + ix * M, oy, 0.05 + M / 2 + iz * M))
            mesh.finish(p, bevel=0.02)
            material.assign(p, "m_pellam"); uv.map_to_trim(p, None, PT, "panel", metres_per_repeat=3.6, u_offset=ix / 3.0)
            vcol.tint(p, "enamel" if iz else "enamel_stain"); pellam.append(p)
            # A panel's only vertices are at its corners, and the bottom corners of the upper-left one lie UNDER the livery
            # band: baked as it is, their darkness grades up the whole 1.2 m panel. Vertex AO needs vertices where the light
            # changes: an edge loop exactly where the band's cover ends, then no edge longer than 0.3 m. After mapping and
            # tinting (both are interpolated)
            mesh.delete_faces(p, lambda f, c, n: n.y > 0.9)                    # the back lies inside the frame: nobody sees it
            if (ix, iz) == (0, 1): mesh.bisect(p, (0, 0, BAND_Z + BAND_H / 2 + 0.004), (0, 0, 1))
            mesh.tessellate_max_edge(p, 0.3)
    for k in range(3):                                                           # ribs behind the missing panel
        r = mesh.box(f"rib{k}", (0.06, 0.05, M - 0.1), (ox + 0.25 + k * 0.35, oy + 0.01, 0.05 + M / 2))
        mesh.finish(r, bevel=0.006); material.assign(r, "m_pellam"); uv.map_to_trim(r, None, PT, "panel_rib"); vcol.tint(r, "steel_dark"); pellam.append(r)
    kick = mesh.box("kick", (2 * M + 0.1, 0.1, 0.3), (ox, oy + 0.03, 0.15))
    mesh.finish(kick, bevel=0.01); material.assign(kick, "m_pellam"); uv.map_to_trim(kick, None, PT, "steel"); vcol.tint(kick, "steel"); pellam.append(kick)
    band = brand.livery_band([(ox - M, oy - 0.027), (ox + 0.0, oy - 0.027)], z=BAND_Z, height=BAND_H, mat="m_pellam")
    uv.map_flat(band, PT); pellam.append(band)
    # the knot on its hex collar, the mark in 10 mm relief, a 0.4 m "4", the cast plate: all m_prop (palette colours)
    k = knot.build_knot(0.16, 'hex', seed=3)
    for o in k.values(): o.location = (ox - 0.1 + 1.0, oy - 0.025 - 0.0, 1.8); mesh.apply_transform(o)
    mark = brand.pellam_mark(0.11, relief=0.01, segments=12); mark.location = (ox - M / 2, oy - 0.026, 1.95); mesh.apply_transform(mark)
    four = brand.numeral_mesh("4", 0.4, depth=0.006); four.location = (ox - M / 2 - 0.3, oy - 0.026, 0.55); mesh.apply_transform(four)
    plate = brand.maker_plate("4-205", bevel=0.0015)
    for o in plate.values(): o.location = (ox - M / 2 + 0.25, oy - 0.026, 0.72); mesh.apply_transform(o)
    return pellam, [k["collar"], mark, four, plate["plate"]], k["lobes"], plate["decals"]


def main():
    args = scene.asset_args("fixture_crate_panel.py")
    scene.reset_scene()
    rng = scene.rng(args.seed)
    cr = crate(rng, (-1.25, -0.1))
    pellam, props, lobes, decals = panel_wall((0.9, 0.2))
    wall = mesh.join(pellam, "panel_part")
    prop = mesh.join(props, "prop_part")
    lobes.name = "knot_live"
    # paint: AO, then the art bible's composition per material family. Two bakes: the big surfaces first, with the small
    # fittings hidden (a wall has no vertices to hold the contact shadow of a plate or a knot: the few that lie behind a
    # fitting would bake black and smear 0.3 m across the panel), then the fittings with everything in place
    fittings = [prop, lobes, decals]
    for o in fittings: o.hide_render = True
    vcol.bake_ao_vertex([cr, wall], distance=0.6)
    for o in fittings: o.hide_render = False
    vcol.bake_ao_vertex([prop, lobes], distance=0.6)
    vcol.compose_vertex_color(cr, mode='tint', dust=0.6, bleach="board_bleached", jitter=0.06, seed=args.seed)     # Frontier: jitter, dust skirt, bleach
    vcol.compose_vertex_color(wall, mode='tint', jitter=0.0, gradient=(0.8, 1.05))                                   # Pellam: none
    vcol.compose_vertex_color(prop, mode='ratio', jitter=0.0, gradient=(0.85, 1.05))
    vcol.darken_contact(cr, height=0.08); vcol.darken_contact(wall, height=0.08)
    vcol.streak_under(wall, [(0.9 - 1.2 + 0.05, 0.17, 2.4), (0.9 - 0.05, 0.17, 2.4), (0.9 + 0.05, 0.17, 2.4)], width=0.08, length=0.5)
    export.marker("socket_knot", (1.1, -0.14, 1.8))
    cr.name = "crate"; wall.name = "panel_wall"; prop.name = "fittings"; decals.name = "plate_decals"
    export.export_asset(ASSET, args.out, blend=args.blend)
    if args.preview: export.preview(ASSET, args.out, out_dir=os.path.join(_d, "shots", "foundation-pipeline"))


if __name__ == "__main__":
    scene.run(main)
