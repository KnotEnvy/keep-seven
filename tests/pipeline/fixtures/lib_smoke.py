"""Pipeline fixture: one direct call of every blender/lib function that the worked examples (the four fixtures, the
template, the placeholder generator, the texture scripts) do not reach, each with a check of what it returned.
tests/pipeline/lib.test.mjs runs it under lib_trace.py and requires that, together with those scripts, EVERY public
function of the library has been called. A line `SMOKE FAIL <name>` (and exit code 1) names a function that broke.

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P tests/pipeline/fixtures/lib_smoke.py -- --out <tmp dir>
"""
import sys, os, math, traceback
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))
import bpy
import numpy as np
from lib import scene, mesh, uv, material, vcol, bake, rig, anim, export, budget, manifest, layout, zone, knot, brand, texdraw as td

OUT = sys.argv[sys.argv.index("--out") + 1]
os.makedirs(OUT, exist_ok=True)
failed = []


def t(name, fn):
    try:
        r = fn(); print("SMOKE OK  ", name, "" if r is None else str(r)[:120])
    except Exception as e:
        failed.append(name); print("SMOKE FAIL", name, type(e).__name__, str(e)[:400]); traceback.print_exc()


def expect(cond, what):
    if not cond: raise AssertionError(what)


def painted(name, size, centre, mat="m_prop", colour="steel"):
    o = mesh.box(name, size, centre); material.assign(o, mat)
    if mat in ("m_prop", "m_flat"): uv.map_to_palette(o, colour)
    elif mat in ("m_frontier", "m_pellam"): uv.map_flat(o, manifest.structure_sheet(mat))
    else: uv.ensure_layers(o)
    vcol.tint(o, colour)
    return o


def _mesh():
    scene.reset_scene()
    c = mesh.cylinder("cyl", 0.2, 1.0, (0, 0, 0.5), segments=12)
    expect(mesh.tri_count(c) == 12 * 2 + 2 * 10, f"cylinder triangles {mesh.tri_count(c)}")
    mn, mx = mesh.bounds(c); expect(abs(mx.z - 1.0) < 1e-5 and abs(mn.z) < 1e-5, "bounds")
    d = mesh.duplicate(c, "cyl_copy"); expect(d.data is not c.data, "duplicate owns its mesh")
    l = mesh.linked_duplicate(c, "cyl_link", (2, 0, 0)); expect(l.data is c.data, "linked duplicate shares the mesh")
    mesh.set_origin(d, (0, 0, 1.0)); bpy.context.view_layer.update()
    mn2, mx2 = mesh.bounds(d); expect(abs(d.location.z - 1.0) < 1e-5 and abs(mx2.z - 1.0) < 1e-4, "set_origin moves the pivot, not the geometry")
    d.scale = (2, 2, 2); mesh.apply_scale(d); expect(abs(d.scale.x - 1.0) < 1e-6, "apply_scale")
    b = mesh.box("inside_out", (1, 1, 1), (5, 0, 0.5)); b.data.flip_normals(); mesh.recalc_normals(b)
    mid = sum((v.co for v in b.data.vertices), b.data.vertices[0].co * 0) / len(b.data.vertices)
    expect(all(q.normal.dot(q.center - mid) > 0 for q in b.data.polygons), "recalc_normals: every normal points outward")
    scene.remove(l); expect("cyl_link" not in bpy.data.objects, "scene.remove")
    return "ok"


def _uv():
    scene.reset_scene()
    one = painted("cp1", (1, 1, 1), (0, 0, 0.5), "m_frontier", "board")
    uv.cube_project(one)                                                   # ONE object (used to raise TypeError)
    two = [painted("cp2", (1, 1, 1), (2, 0, 0.5), "m_frontier", "board"), painted("cp3", (1, 2, 1), (4, 0, 0.5), "m_frontier", "board")]
    uv.cube_project(two, cube_size=1.0)
    a = uv.get(one); expect(float(a.max() - a.min()) > 0.2, "cube_project wrote UVs")
    g = painted("ground", (8, 8, 0.2), (0, 0, -0.1), "m_sand", "sand"); uv.map_planar_world(g, 4.0)
    a = uv.get(g); expect(abs(float(a[:, 0].max() - a[:, 0].min()) - 2.0) < 1e-4, "planar world: 8 m = 2 repeats")
    panel = painted("thin_panel", (1.0, 0.01, 1.0), (8, 0, 0.5), "m_mask", "steel_dark")
    try:
        uv.map_to_mask(panel, None, "grille"); raise AssertionError("a closed box must be refused")
    except ValueError as e:
        expect("ONE flat side" in str(e) and "thin_panel" in str(e), f"the message names the object and the cure: {e}")
    uv.map_to_mask(panel, lambda p: p.normal.y < -0.9, "grille")
    u0, v0, u1, v1 = manifest.mask_uv("grille")
    front = [p.index for p in panel.data.polygons if p.normal.y < -0.9]; m = uv._loops_of(panel, front); a = uv.get(panel)[m]
    expect(abs(float(a[:, 0].min()) - u0) < 1e-5 and abs(float(a[:, 1].max()) - v1) < 1e-5, "the front face fills the region")
    w = painted("wall", (2.0, 0.1, 1.0), (12, 0, 0.5), "m_frontier", "adobe")
    uv.map_to_trim(w, None, "tx_frontier_trim", "adobe", inset_px=2.0)
    lo, hi = manifest.trim_v("tx_frontier_trim", "adobe", 2.0); a = uv.get(w)
    expect(float(a[:, 1].min()) >= lo - 1e-6 and float(a[:, 1].max()) <= hi + 1e-6, "inset_px keeps V inside the row")
    return "ok"


def _rig_anim():
    scene.reset_scene()
    body = mesh.cylinder("body", 0.18, 1.4, (0, 0, 0.7), segments=10); mesh.tessellate_max_edge(body, 0.2)
    arm = rig.make_armature("smoke_rig", [("root", (0, 0, 0), (0, 0, 0.3), None), ("spine", (0, 0, 0.5), (0, 0, 0.9), "root"), ("head", (0, 0, 1.0), (0, 0, 1.3), "spine")])
    rig.auto_weights(body, arm); expect(rig.unweighted(body) == [], "auto_weights leaves no vertex unweighted")
    expect(abs(rig.bone_head_world(arm, "head").z - 1.0) < 1e-6, "bone_head_world")
    cap = mesh.box("cap", (0.3, 0.3, 0.1), (0, 0, 1.45))
    rig.skin_rigid(cap, arm, lambda v: "head"); expect(rig.unweighted(cap) == [] and cap.vertex_groups[0].name == "head", "skin_rigid")
    leaf = export.marker("leaf", (0, 0, 0))
    act = anim.new_action(leaf, "swing")
    anim.key_object(leaf, 0, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)); anim.key_object(leaf, 12, rot=(0, 0, 1.0))
    anim.set_interpolation(act, 'LINEAR'); expect(all(k.interpolation == 'LINEAR' for fc in anim.action_fcurves(act) for k in fc.keyframe_points), "set_interpolation")
    anim.push_to_nla(leaf, [act])
    tr = anim.tracks(leaf); expect(len(tr) == 1 and tr[0][0] == "swing" and tr[0][2] == 12, f"tracks {tr}")
    return "ok"


def _zone():
    scene.reset_scene()
    s = painted("sector", (1, 1, 1), (5, 0, 0.5), "m_pellam", "concrete"); s["chunk"] = "chunk_fx_room"
    all6 = zone.copy_about_axis([s], (0, 0), 6); expect(len(all6) == 6 and all6[3]["chunk"] == "chunk_fx_room", "copy_about_axis: 6 sectors, properties copied")
    mn, mx = mesh.bounds(all6[3]); expect(abs((mn.x + mx.x) / 2 + 5.0) < 1e-4, "the fourth copy is opposite the first")
    f = painted("ffb", (1, 1, 1), (9, 0, 0.5), "m_prop", "rust"); zone.fold_flat(f, "m_frontier", colour="rust")
    expect(material.names(f) == ["m_frontier"], f"fold_flat -> {material.names(f)}")
    expect(np.allclose(uv.get(f), manifest.trim_flat_uv("tx_frontier_trim"), atol=1e-6), "fold_flat points UV0 at the flat cell")
    expect(len(zone.chunk_plan("fixture_room")) == 1, "chunk_plan")
    long = painted("long", (12.0, 0.2, 1.0), (0, 0, 0.5), "m_pellam", "concrete")
    expect(zone.cut_at_chunk_boxes(long, "fixture_room") is True and len(long.data.polygons) > 6, "cut_at_chunk_boxes splits a wall that leaves the box")
    terr = mesh.box("terr", (4, 4, 0.2), (0, 10, 0)); zone.collider_terrain(terr)
    expect(terr.name == "collider_terrain" and len(terr.data.materials) == 0 and all(len(p.vertices) == 3 for p in terr.data.polygons), "collider_terrain")
    return "ok"


def _layout():
    z = layout.zone("plenty_street"); expect(z["id"] == "plenty_street", "zone")
    ss = layout.solids("plenty_street"); expect(len(ss) > 5, "solids")
    s0 = layout.solid(ss[0]["id"]); expect(s0["id"] == ss[0]["id"], "solid")
    expect(layout.size_to_blender((1, 2, 3)) == (1, 3, 2), f"size_to_blender {layout.size_to_blender((1, 2, 3))}")
    expect(layout.cylinder_segments(15.0) % 4 == 0 and 12 <= layout.cylinder_segments(0.1) <= 64, "cylinder_segments")
    faces = layout.solid_faces(s0); expect(len(faces) >= 5, "solid_faces")
    scene.reset_scene()
    ob = layout.solid_mesh(s0); expect(len(ob.data.polygons) == len(faces), "solid_mesh")
    cps = layout.markers("plenty_street", "checkpoint"); expect(len(cps) >= 1, "markers")
    m = layout.marker(cps[0]["id"]); expect(m["id"] == cps[0]["id"], "marker")
    loc, rz = layout.placement(m, (0.0, 0.0, 0.0)); expect(np.allclose(loc, layout.to_blender(m["pos"]), atol=1e-6), "placement without offset is the marker")
    segs = layout.nav_segments("plenty_street"); expect(len(segs) >= 1, "nav_segments")
    a = segs[0][0]; g = layout.path_ground("plenty_street", a[0], a[2]); expect(g is not None and abs(g - a[1]) < 1e-6, "path_ground at a nav node")
    expect(layout.surface_material("adobe") == "m_frontier" and layout.surface_material("ceramic") == "m_pellam", "surface_material")
    return "ok"


def _manifest():
    manifest.reset_tables_used(); expect(manifest.tables_used() == {}, "reset_tables_used")
    expect(manifest.palette_hex("sand").upper() == "#CDA070", "palette_hex")
    expect(manifest.tables_used() == {"palette": ["sand"]}, f"tables_used records the cell read: {manifest.tables_used()}")
    expect("cells" in manifest.palette() and "regions" in manifest.trim("tx_pellam_trim") and "regions" in manifest.mask_regions(), "whole tables")
    expect(manifest.tables_used()["palette"] == ["*"], "reading a whole table is recorded as '*'")
    expect(manifest.owner_folder("props_mech").replace(os.sep, "/").endswith("blender/props/mech"), "owner_folder")
    expect(manifest.piece_of("props_dress") == "art-props" and manifest.piece_of("env_exterior") == "art-env-exterior", "piece_of")
    want = {"ia_ammo_box": "art-props-mech", "enemy_bider": "art-enemies-bider", "bider_table_static": "art-enemies-bider", "enemy_transit": "art-enemies-transit",
            "proj_stake": "art-enemies-transit", "enemy_tamper": "art-boss-tamper", "tamper_cold_static": "art-boss-tamper", "boss_windlass": "art-boss-windlass",
            "proj_canister": "art-boss-windlass", "weapon_revolver": "art-weapons", "tx_palette": "art-props-mech", "tx_mask": "art-props-mech", "tx_gun": "art-weapons",
            "tx_frontier_trim": "art-env-exterior", "lm_tally": "art-env-interior", "tx_fx": "code-render", "fixture_room": "foundation-pipeline"}
    got = {k: manifest.piece_of_id(k) for k in want}
    expect(got == want, f"piece_of_id: {[(k, got[k]) for k in want if got[k] != want[k]]}")
    dress = next(i for i, a in manifest.load()["assets"].items() if a["owner"] == "props_dress")
    expect(manifest.piece_of_id(dress) == "art-props-dress", "a props_dress asset is art-props-dress's")
    expect(manifest.shots_dir("ia_ammo_box").replace(os.sep, "/").endswith("shots/art-props-mech"), "shots_dir")
    expect(manifest.structure_sheet("m_pellam") == "tx_pellam_trim", "structure_sheet")
    x, y, w, h = manifest.trim_region("tx_frontier_trim", "flat")["px"]
    expect(w == 16 and h == 16 and x % 16 == 0 and y % 16 == 0, "the Frontier flat cell is one 16 px grid cell")
    return "ok"


def _tex_bake():
    a = np.zeros((8, 8), dtype=np.float32); td.paste(a, np.ones((2, 2), dtype=np.float32), 3, 3); expect(a.sum() == 4.0 and a[3, 3] == 1.0, "paste")
    expect(td.tile(a, 2, 3).shape == (24, 16), "tile")
    expect(abs(float(td.srgb_to_linear(np.float32(0.5))) - 0.2140) < 1e-3, "srgb_to_linear")
    wx, ix, wy, iy = td.seam_error(td.fbm(64, 64, 4, 4, seed=3)); expect(wx <= ix * 2.0 and wy <= iy * 2.0, "tiling noise has no seam")
    p = td.write_png(os.path.join(OUT, "smoke.png"), a, {"k": "v"}); px, text = td.read_png(p)
    expect(px.shape == (8, 8) and int(px[3, 3]) == 255 and text == {"k": "v"}, "write_png / read_png round trip")
    scene.reset_scene()
    plane = bake.unit_plane(); mat = bpy.data.materials.new("tile"); mat.use_nodes = True; plane.data.materials.append(mat)
    nt = mat.node_tree; vec, w = bake.torus_coords(nt, 3.0)
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.noise_dimensions = '4D'
    nt.links.new(vec, noise.inputs["Vector"]); nt.links.new(w, noise.inputs["W"]); nt.links.new(noise.outputs["Fac"], nt.nodes["Principled BSDF"].inputs["Roughness"])
    bake.use_cycles('CPU', samples=1, denoise=False)
    img = bake.bake_socket_as_emit(plane, mat, "Roughness", "tile_rough", 32, 'Non-Color', samples=1)
    wx, ix, wy, iy = bake.seam_error(img); expect(wx <= ix * 2.5 + 1e-3 and wy <= iy * 2.5 + 1e-3, f"the torus mapping tiles ({wx:.4f} / {ix:.4f})")
    expect(os.path.getsize(bake.save_png(img, os.path.join(OUT, "tile.png"))) > 0 and os.path.getsize(bake.tile_preview(img, os.path.join(OUT, "tile2.png"))) > 0, "save_png / tile_preview")
    target, node = bake.bake_target(mat, "probe", (16, 8), 'Non-Color'); expect(tuple(target.size) == (16, 8), "bake_target"); nt.nodes.remove(node)
    nimg = bake.bake_normal(plane, mat, "tile_nrm", 16, samples=1)
    c = bake.pixels(nimg)[8, 8]; expect(abs(c[0] - 0.5) < 0.05 and abs(c[1] - 0.5) < 0.05 and c[2] > 0.9, f"a flat plane bakes the flat normal {c[:3]}")
    return "ok"


def _export():
    scene.reset_scene()
    o = painted("fixture_stool_mesh", (0.4, 0.4, 0.45), (0, 0, 0.225)); vcol.compose_vertex_color(o, mode='ratio', jitter=0.0)
    expect(vcol.corner_normals(o).shape == (len(o.data.loops), 3), "corner_normals")
    second = painted("second", (0.1, 0.1, 0.1), (0, 0, 0.5))
    export.ensure_root("fixture_stool")
    n, fixed, worst = export.draw_calls("fixture_stool", [o, second]); expect(n == 2 and worst is None, f"two meshes with one material are two draw calls ({n})")
    errs = export.check_scene("fixture_stool"); expect(any("2 draw calls > drawCalls 1" in e and "second" in e for e in errs), f"check_scene names the meshes: {errs}")
    scene.remove(second)
    glb = os.path.join(OUT, "fixture_stool.glb"); export.export_asset("fixture_stool", glb, blend=os.path.join(OUT, "fixture_stool.blend"))
    expect(o["bake"] == "AO", "export_asset stamps the bake extra of a standalone asset")
    expect(os.path.isfile(glb) and os.path.isfile(os.path.join(OUT, "fixture_stool.blend")), "glb and blend written")
    export.preview("fixture_stool", glb, out_dir=OUT); expect(os.path.isfile(os.path.join(OUT, "fixture_stool_sheet.png")), "export.preview wrote the sheet")
    return "ok"


def _vertex_light():
    """What a mesh must have been through to be stamped bake VL, who is stamped what, and the buried-vertex warning."""
    A = manifest.asset
    zone_lit = next(i for i, a in manifest.load()["assets"].items() if a.get("bake") == "VL" and a.get("placedBy") == "zone" and not a.get("chunks"))
    code_lit = next(i for i, a in manifest.load()["assets"].items() if a.get("bake") == "VL" and a.get("placedBy") != "zone" and not a.get("chunks"))
    expect(export.bake_extras(A(zone_lit)) == ("AO",), f"{zone_lit} (bake VL, placedBy zone) is lit by its zone: its own file is AO")
    expect(export.bake_extras(A(code_lit)) == ("VL",), f"{code_lit} (bake VL, placed by code) is VL")
    expect(export.bake_extras(A("fixture_room")) == ("LM", "VL") and export.bake_extras(A("fixture_stool")) == ("AO",), "LM+VL / AO")
    never = lambda errs: [e for e in errs if "never vertex-lit" in e]
    # --- a zone-lit prop: stamped AO, nothing asks for vertex light
    scene.reset_scene()
    o = painted(zone_lit + "_mesh", (1, 1, 1), (0, 0, 0.5)); vcol.compose_vertex_color(o, mode='ratio', jitter=0.0)
    export.ensure_root(zone_lit); export.stamp_bake(zone_lit, [o])
    expect(o["bake"] == "AO" and never(export.check_scene(zone_lit)) == [], f"zone-lit prop is stamped {o['bake']}")
    # --- a prop that is shown x 2: stamped VL, and check_scene fails it until it has been vertex-lit
    scene.reset_scene()
    o = painted(code_lit + "_mesh", (1, 1, 1), (0, 0, 0.5)); vcol.compose_vertex_color(o, mode='ratio', jitter=0.0)
    export.ensure_root(code_lit); export.stamp_bake(code_lit, [o])
    expect(o["bake"] == "VL", "stamped VL")
    errs = never(export.check_scene(code_lit)); expect(len(errs) == 1 and o.name in errs[0] and "bake_vertex_light" in errs[0], f"a VL mesh that was never lit fails: {errs}")
    bake.use_cycles('CPU', samples=16); bake.set_world((1, 1, 1), 1.0)
    vcol.bake_vertex_light([o], samples=16)
    expect(o["vl_baked"] and never(export.check_scene(code_lit)) == [], "after bake_vertex_light it passes")
    c = vcol.get_colors(o)[:, :3]; expect(0.2 < float(c.max()) <= 1.0, f"Color holds light / 2 ({float(c.max()):.2f})")
    p = painted("hand_lit", (1, 1, 1), (3, 0, 0.5)); vcol.mark_vertex_lit(p); expect(p["vl_baked"] and vcol.vertex_lit_faces(p).all(), "mark_vertex_lit")
    # --- the mark is PER FACE: a restricted mark covers only those faces, and survives a join and a tessellation
    q = painted("part_lit", (1, 1, 1), (5, 0, 0.5)); vcol.mark_vertex_lit(q, [0, 1])
    expect(not q.get("vl_baked") and vcol.vertex_lit_faces(q).tolist() == [True, True, False, False, False, False], "mark_vertex_lit(ob, faces) marks those faces only")
    r = painted("never_lit", (1, 1, 1), (7, 0, 0.5)); expect(not vcol.vertex_lit_faces(r).any(), "an untouched object has no marked face")
    j = mesh.join([r, q, p], "joined"); expect(int(vcol.vertex_lit_faces(j).sum()) == 8 and len(j.data.polygons) == 18, "a join keeps the marks (a part without the attribute joins as unmarked)")
    mesh.tessellate_max_edge(j, 0.6); expect(int(vcol.vertex_lit_faces(j).sum()) * 18 == len(j.data.polygons) * 8, "tessellation keeps them")
    c2 = painted("recomposed", (1, 1, 1), (9, 0, 0.5)); vcol.compose_vertex_color(c2, mode='ratio', jitter=0.0); vcol.mark_vertex_lit(c2)
    vcol.compose_vertex_color(c2, mode='ratio', jitter=0.0)
    expect(not vcol.vertex_lit_faces(c2).any() and not c2.get("vl_baked"), "composing again after the light bake removes the mark (the light is gone)")
    # --- the guard on a mixed LM + VL mesh: faces on the neutral texel must be marked, a face with no lightmap UV fails,
    #     a lightmapped face that is also marked is a WARNING
    scene.reset_scene()
    m = painted("mixed", (1, 1, 1), (0, 0, 0.5), "m_pellam", "concrete"); vcol.compose_vertex_color(m, mode='tint', jitter=0.0)
    top = lambda p: p.normal.z > 0.9
    uv.unwrap_lightmap([m], "lm_fixture_room", faces=top)                     # the top is lightmapped, five faces are vertex-lit
    m["bake"] = "LM"; m["lightmap"] = "lm_fixture_room"
    neutral, bare = export.uv1_faces(m, "lm_fixture_room")
    expect(int(neutral.sum()) == 5 and not bare.any() and export.face_materials(m) == ["m_pellam"] * 6, "uv1_faces: five faces on the neutral texel, one in the atlas")
    errs = export.vertex_light_errors([m]); expect(len(errs) == 1 and "5 of the 5 faces" in errs[0] and "never vertex-lit" in errs[0], f"an LM mesh whose vertex-lit faces were never lit fails: {errs}")
    bake.use_cycles('CPU', samples=16); bake.set_world((1, 1, 1), 1.0)
    side = lambda p: abs(p.normal.x) > 0.9
    dt = vcol.bake_vertex_light([m], samples=16, faces={"mixed": side})
    errs = export.vertex_light_errors([m]); expect(dt > 0 and len(errs) == 1 and "3 of the 5 faces" in errs[0], f"a faces= restricted bake leaves the other vertex-lit faces failing: {errs}")
    sc = bpy.context.scene.cycles; expect(sc.use_light_tree and sc.use_adaptive_sampling, "bake_vertex_light restores the light tree and adaptive sampling")
    vcol.bake_vertex_light([m], samples=16, faces={"mixed": lambda p: not top(p) and not side(p)})
    expect(export.vertex_light_errors([m]) == [], "once every neutral-texel face is lit the mesh passes")
    vcol.mark_vertex_lit(m, top); expect(export.vertex_light_errors([m]) == [], "a lightmapped face that is also marked is a WARNING, not an error")
    uv.fill(m, (0.0, 0.0), top, layer=uv.UV1)
    errs = export.vertex_light_errors([m], warn=False); expect(len(errs) == 1 and "1 faces have no lightmap UV" in errs[0], f"a face whose UV1 is one point off the neutral texel fails: {errs}")
    u1 = uv.get(m, uv.UV1); u1[uv._loops_of(m, uv.face_indices(m, top))] = uv.get(m)[uv._loops_of(m, uv.face_indices(m, top))]; uv.put(m, u1, uv.UV1)
    errs = export.vertex_light_errors([m], warn=False); expect(len(errs) == 1 and "1 faces have no lightmap UV" in errs[0], f"a face whose UV1 is still the copy of UV0 fails: {errs}")
    # --- zones: merge_chunks RAISES, naming the object, when a vertex-lit face of any part was never lit
    for lit_all in (False, True):
        scene.reset_scene()
        a = painted("part_a", (1, 1, 1), (0, 0, 0.5), "m_pellam", "concrete"); b = painted("part_b", (1, 1, 1), (1.5, 0, 0.5), "m_pellam", "concrete")
        f = painted("floor_part", (1, 1, 0.1), (0, 1.5, 0.05), "m_pellam", "concrete")
        for q in (a, b, f):
            vcol.compose_vertex_color(q, mode='tint', jitter=0.0); q["chunk"] = "chunk_fx_room"
        uv.unwrap_lightmap([a, b, f], "lm_fixture_room", faces={"part_a": [], "part_b": [], "floor_part": top})   # a mixed LM + VL chunk
        bake.use_cycles('CPU', samples=16); bake.set_world((1, 1, 1), 1.0)
        vcol.bake_vertex_light([a, b, f] if lit_all else [a, f], samples=16, faces={"floor_part": lambda p: not top(p)})
        zone.assign_chunks([a, b, f], "fixture_room")
        if lit_all:
            out = zone.merge_chunks("fixture_room")
            m = out["chunk_fx_room__m_pellam"]; export.ensure_root("fixture_room")
            expect(m["bake"] == "LM" and not m.get("vl_baked") and int(vcol.vertex_lit_faces(m).sum()) == 17, "the mixed chunk mesh is LM and carries the per-face marks")
            expect(never(export.check_scene("fixture_room")) == [], "check_scene passes the lit chunk")
        else:
            try:
                zone.merge_chunks("fixture_room"); raise AssertionError("merge_chunks must refuse a part that was never vertex-lit")
            except RuntimeError as e:
                expect("part_b: 6 of 6 faces" in str(e) and "part_a" not in str(e) and "never vertex-lit" in str(e), f"merge_chunks names the unlit object: {e}")
    # a pure vertex-lit chunk (no lightmapped face) is stamped VL and marked whole
    scene.reset_scene()
    a = painted("part_a", (1, 1, 1), (0, 0, 0.5), "m_pellam", "concrete"); vcol.compose_vertex_color(a, mode='tint', jitter=0.0); a["chunk"] = "chunk_fx_room"
    uv.ensure_layers(a, lightmap=True); bake.set_vertex_lit_uv1(a, None, "lm_fixture_room")
    zone.assign_chunks([a], "fixture_room")
    try:
        zone.merge_chunks("fixture_room"); raise AssertionError("an unlit VL chunk must be refused")
    except RuntimeError as e: expect("part_a: 6 of 6 faces" in str(e), f"{e}")
    vcol.mark_vertex_lit(a); m = zone.merge_chunks("fixture_room")["chunk_fx_room__m_pellam"]
    expect(m["bake"] == "VL" and m.get("vl_baked"), "a wholly vertex-lit chunk mesh is VL and marked")
    # an object that was never given a UV1 at all is refused too
    scene.reset_scene()
    a = painted("no_uv1", (1, 1, 1), (0, 0, 0.5), "m_pellam", "concrete"); vcol.compose_vertex_color(a, mode='tint', jitter=0.0); a["chunk"] = "chunk_fx_room"
    zone.assign_chunks([a], "fixture_room")
    try:
        zone.merge_chunks("fixture_room"); raise AssertionError("an object without lightmap UVs must be refused")
    except RuntimeError as e: expect("without a lightmap UV" in str(e) and "no_uv1" in str(e), f"{e}")
    # --- buried vertices: a column whose end rings touch a plinth and sit inside a head bakes dark from end to end
    def stand(loop):
        scene.reset_scene()
        parts = [mesh.box("plinth", (0.5, 0.5, 0.2), (0, 0, 0.1)), mesh.box("head", (0.4, 0.4, 0.3), (0, 0, 1.25)), mesh.cylinder("column", 0.06, 1.0, (0, 0, 0.7), segments=12)]
        if loop: mesh.tessellate_max_edge(parts[2], 0.4)
        for q in parts: material.assign(q, "m_prop"); uv.map_to_palette(q, "enamel"); vcol.tint(q, "enamel")
        j = mesh.join(parts, "stand"); vcol.bake_ao_vertex([j], distance=0.5)
        return j, vcol.buried_faces(j, vcol.get_colors(j, "AO")[:, :3], distance=0.5)
    j, (idx, area, centre) = stand(False)
    expect(len(idx) >= 10 and 0.3 < area < 0.45 and abs(centre[2] - 0.7) < 0.05, f"the column's sides are reported ({len(idx)} faces, {area:.3f} m2, at {centre})")
    expect(vcol.warn_buried(j, vcol.get_colors(j, "AO")[:, :3], "AO") == len(idx), "warn_buried counts the same faces")
    j, (idx, area, centre) = stand(True)
    expect(idx == [] and area == 0.0, f"with an edge loop half-way up nothing is reported ({len(idx)} faces)")
    # --- a `faces` callable takes the polygon alone; the delete_faces form is refused with a message that says so
    try:
        uv.face_indices(j, lambda f, c, n: n.z > 0.9); raise AssertionError("a three-argument faces callable must be refused")
    except TypeError as e:
        expect("ONE argument" in str(e) and "delete_faces" in str(e), f"the message explains the signature: {e}")
    expect(len(uv.face_indices(j, lambda p: p.normal.z > 0.9)) >= 2, "callable(polygon)")
    return "ok"


for name, fn in (("mesh", _mesh), ("uv", _uv), ("rig + anim", _rig_anim), ("zone", _zone), ("layout", _layout), ("manifest", _manifest),
                 ("texdraw + bake helpers", _tex_bake), ("export", _export), ("vertex light + buried vertices", _vertex_light)):
    t(name, fn)
print(f"SMOKE {'FAILED: ' + ', '.join(failed) if failed else 'ALL OK'}")
sys.stdout.flush()
sys.exit(1 if failed else 0)
