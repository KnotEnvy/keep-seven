"""Budget checks inside Blender (the shipped file is checked again by tools/check-glb.mjs, which is the source of truth)."""
import bpy


def budget_report(objects=None):
    """Triangles of the evaluated meshes (after modifiers), materials in use and a draw-call estimate.
    objects: default every mesh object of the scene except `collider_terrain`. Returns a dict:
    {objects: {name: {tris, verts, materials, uv_layers, colors}}, tris, materials, draw_calls_est}."""
    dg = bpy.context.evaluated_depsgraph_get()
    objects = objects or [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name != 'collider_terrain']
    rep = {"objects": {}, "tris": 0, "materials": set()}
    for o in sorted(objects, key=lambda o: o.name):
        e = o.evaluated_get(dg); me = e.to_mesh()
        me.calc_loop_triangles()
        t = len(me.loop_triangles)
        used = sorted({p.material_index for p in me.polygons})
        mats = [o.material_slots[i].material.name for i in used if i < len(o.material_slots) and o.material_slots[i].material]
        rep["objects"][o.name] = {"tris": t, "verts": len(me.vertices), "materials": mats,
                                  "uv_layers": [l.name for l in o.data.uv_layers], "colors": [c.name for c in o.data.color_attributes]}
        rep["tris"] += t
        e.to_mesh_clear()
        rep["materials"].update(mats)
    rep["materials"] = sorted(rep["materials"])
    rep["draw_calls_est"] = sum(max(1, len(v["materials"])) for v in rep["objects"].values())
    return rep


def assert_budget(rep, max_tris=None, max_materials=None, what="asset"):
    """Raise RuntimeError("BUDGET EXCEEDED: ...") when the report is over a limit. There is no slack in the frame
    budget: an asset over its manifest `triBudget` fails the build."""
    errs = []
    if max_tris is not None and rep["tris"] > max_tris: errs.append(f"triangles {rep['tris']} > {max_tris}")
    if max_materials is not None and len(rep["materials"]) > max_materials: errs.append(f"materials {len(rep['materials'])} > {max_materials}")
    if errs: raise RuntimeError(f"BUDGET EXCEEDED ({what}): " + "; ".join(errs))


def summary(rep):
    """One line for the build log."""
    return f"tris {rep['tris']} in {len(rep['objects'])} meshes, materials {rep['materials']}, draw calls ~{rep['draw_calls_est']}"
