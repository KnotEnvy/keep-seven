"""Access to design/assets.json (the asset manifest) and to the shared-texture tables.

No bpy import: usable from any Python. All UVs returned here are BLENDER UVs (origin bottom-left); the exporter flips V
for glTF. Texture tables (written by blender/tex/*.py, append-only):
    blender/lib/palette.json            name -> cell of tx_palette / tx_palette_emis
    blender/lib/tx_frontier_trim.json   rows of the Frontier trim sheet        blender/lib/tx_pellam_trim.json  (Pellam)
    blender/lib/mask_regions.json       rectangles of tx_mask
"""
import json, os

LIB = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(LIB, "..", ".."))
FPS = 30
_cache = {}

PIECES = {"env_exterior": "art-env-exterior", "env_interior": "art-env-interior", "props_mech": "art-props",
          "props_dress": "art-props", "weapons": "art-weapons", "enemies": "art-enemies", "boss": "art-boss",
          "render": "code-render", "fixtures": "foundation-pipeline"}
SHEET_OF = {"m_frontier": "tx_frontier_trim", "m_pellam": "tx_pellam_trim", "m_sand": "tx_sand", "m_mask": "tx_mask",
            "m_flat": "tx_palette", "m_prop": "tx_palette", "m_emis": "tx_palette_emis", "m_gun": "tx_gun",
            "m_hands": "tx_hands"}
MATERIALS = ("m_frontier", "m_pellam", "m_sand", "m_flat", "m_mask", "m_emis", "m_prop", "m_gun", "m_hands")


def _json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load():
    """The manifest as a dict (cached). If the environment variable KS_MANIFEST_OVERLAY names a JSON file with
    `assets` / `textures` (the test fixtures), its entries are merged in and tagged with `_overlay`."""
    if "m" not in _cache:
        m = _json(os.path.join(ROOT, "design", "assets.json"))
        ov = os.environ.get("KS_MANIFEST_OVERLAY")
        if ov:
            o = _json(ov)
            base = {"rawExportDir": o.get("meta", {}).get("rawExportDir", m["meta"]["rawExportDir"]),
                    "publicDir": o.get("meta", {}).get("publicDir", m["meta"]["publicDir"])}
            for kind in ("assets", "textures"):
                for k, v in o.get(kind, {}).items():
                    v = dict(v); v["_overlay"] = base; m[kind][k] = v
        _cache["m"] = m
    return _cache["m"]


def asset(asset_id):
    """The manifest entry of an asset. Raises KeyError with the id when it does not exist."""
    a = load()["assets"].get(asset_id)
    if a is None: raise KeyError(f"manifest: no asset '{asset_id}' in design/assets.json")
    return a


def texture(texture_id):
    """The manifest entry of a texture or lightmap (size, format, regions, lightmapScale, neutralTexel ...)."""
    t = load()["textures"].get(texture_id)
    if t is None: raise KeyError(f"manifest: no texture '{texture_id}' in design/assets.json")
    return t


def owner_folder(owner):
    """Absolute source folder of a manifest owner (`meta.ownerFolders`): env_exterior -> <repo>/blender/env_exterior."""
    return os.path.join(ROOT, load()["meta"]["ownerFolders"][owner])


def piece_of(owner):
    """The work ORDER of a manifest owner: props_mech -> 'art-props', env_exterior -> 'art-env-exterior'. Three orders
    are built by two pieces each: `piece_of_id` gives the piece (the builder, the shots folder) of one asset or texture."""
    return PIECES[owner]


def piece_of_id(item_id):
    """The PIECE (builder) that answers for an asset or texture id, whose shots/<piece>/ folder its evidence belongs in
    (docs/workorders/README.md 1.1; the same rule as tools/pipeline-lib.mjs pieceOf): props_mech -> 'art-props-mech';
    props_dress -> 'art-props-dress', except the three shared textures the manifest lists under props_dress (tx_mask,
    tx_palette, tx_palette_emis: art-props-mech's scripts); enemies -> 'art-enemies-bider' for enemy_bider and the
    bider_* statics, else 'art-enemies-transit'; boss -> 'art-boss-tamper' for enemy_tamper and tamper_cold_static,
    else 'art-boss-windlass'; every other owner -> its order."""
    import re
    m = load()
    is_asset = item_id in m["assets"]
    owner = (m["assets"][item_id] if is_asset else m["textures"][item_id])["owner"]
    if owner == "props_mech": return "art-props-mech"
    if owner == "props_dress": return "art-props-dress" if is_asset else "art-props-mech"
    if owner == "enemies": return "art-enemies-bider" if re.search(r"(^|_)bider(_|$)", item_id) else "art-enemies-transit"
    if owner == "boss": return "art-boss-tamper" if re.search(r"(^|_)tamper(_|$)", item_id) else "art-boss-windlass"
    return PIECES.get(owner, "foundation-pipeline")


def shots_dir(asset_id):
    """Absolute evidence folder for an asset: <repo>/shots/<piece>/ (`piece_of_id`)."""
    return os.path.join(ROOT, "shots", piece_of_id(asset_id))


def raw_dir(entry=None):
    """Absolute raw export root (blender/export, or the overlay's)."""
    d = (entry or {}).get("_overlay", {}).get("rawExportDir") or load()["meta"]["rawExportDir"]
    return os.path.join(ROOT, d)


def raw_path(asset_id):
    """Absolute path of the asset's RAW export: <repo>/blender/export/<category>/<id>.glb."""
    a = asset(asset_id)
    return os.path.join(raw_dir(a), a["category"], asset_id + ".glb")


def raw_texture_path(texture_id):
    """Absolute path of a texture's raw PNG: blender/export/tex/<id>.png, lightmaps and layers blender/export/lm/<id>.png."""
    t = texture(texture_id)
    sub = "lm" if t["kind"] in ("lightmap", "lightlayer") else "tex"
    return os.path.join(raw_dir(t), sub, texture_id + ".png")


def clip(asset_id, name):
    """The manifest clip entry {name, loop, seconds, priority[, fallback]} of an asset."""
    for c in asset(asset_id).get("animations", []):
        if c["name"] == name: return c
    raise KeyError(f"manifest: asset '{asset_id}' has no clip '{name}'")


def clip_frames(asset_id, name):
    """Authored length of a clip in frames at 30 fps: the whole frame nearest the manifest's seconds (at least 1).
    Key the clip on frames 0 .. clip_frames."""
    return max(1, round(clip(asset_id, name)["seconds"] * FPS))


# ------------------------------------------------------------------ texture tables
_used = {}        # table name -> set of entry names read ('*' = the whole table)


def _use(table, entry):
    _used.setdefault(table, set()).add(entry)


def tables_used():
    """{table: sorted entry names | ['*']} read through this module since the last `reset_tables_used()`: which
    palette cells, trim rows and mask regions an asset depends on. `export_asset` writes it into <out>.deps.json, and
    the build driver hashes only those entries, so an APPENDED cell or region rebuilds nothing."""
    return {t: (["*"] if "*" in e else sorted(e)) for t, e in sorted(_used.items())}


def reset_tables_used():
    """Forget what was read (blender/placeholders.py builds many assets in one process)."""
    _used.clear()


def _table(name):
    key = "t_" + name
    if key not in _cache:
        p = os.path.join(LIB, name + ".json")
        if not os.path.isfile(p):
            raise FileNotFoundError(f"{p} is missing: run `node tools/build-assets.mjs --only <its texture>` (blender/tex/ writes it)")
        _cache[key] = _json(p)
    return _cache[key]


def hex_to_linear(h):
    """'#CDA070' (sRGB) -> linear (r, g, b) floats, the space of COLOR_0."""
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def palette():
    """The palette table: {'size', 'cell', 'cells': {name: {'col','row','hex'[, 'emis']}}}."""
    _use("palette", "*")
    return _table("palette")


def _cell(name):
    _use("palette", name)
    c = _table("palette")["cells"].get(name)
    if c is None: raise KeyError(f"palette: no colour named '{name}' (see blender/lib/palette.json)")
    return c


def palette_uv(name):
    """Blender UV of the centre of palette cell `name` in tx_palette (and tx_palette_emis: same layout)."""
    p = _table("palette"); c = _cell(name); n = p["size"] / p["cell"]
    return ((c["col"] + 0.5) / n, 1.0 - (c["row"] + 0.5) / n)


def emis_uv(name):
    """Blender UV of emissive cell `name` (flame, flame_core, aqua, aqua_core, violet, violet_core, violet_band,
    violet_band_core). The same UV in tx_palette holds the cell's unlit albedo (husk grey under the violets)."""
    c = _cell(name)
    if "emis" not in c: raise KeyError(f"palette: '{name}' is not an emissive cell")
    return palette_uv(name)


def palette_hex(name):
    """sRGB hex of a palette colour (albedo)."""
    return _cell(name)["hex"]


def palette_rgb(name):
    """Linear (r, g, b) of a palette colour: what goes into COLOR_0 for m_frontier / m_pellam / m_sand."""
    return hex_to_linear(_cell(name)["hex"])


def palette_name_at(u, v):
    """Name of the palette cell containing Blender UV (u, v), or None."""
    p = _table("palette"); n = p["size"] // p["cell"]
    col = min(n - 1, max(0, int(u * n))); row = min(n - 1, max(0, int((1.0 - v) * n)))
    for k, c in p["cells"].items():
        if c["col"] == col and c["row"] == row: _use("palette", k); return k
    return None


def trim(sheet):
    """The row table of a trim sheet ('tx_frontier_trim' | 'tx_pellam_trim')."""
    _use(sheet, "*")
    return _table(sheet)


def trim_region(sheet, region):
    """{'px': [x, y, w, h] (top-left origin), 'metres_u', 'metres_v'} of a trim row or of the 'flat' cell."""
    _use(sheet, region)
    r = _table(sheet)["regions"].get(region)
    if r is None: raise KeyError(f"{sheet}: no region '{region}' (have {sorted(_table(sheet)['regions'])})")
    return r


def trim_v(sheet, region, inset_px=0.5):
    """(v0, v1): the Blender-UV V range of a trim row (bottom, top), inset by `inset_px` so bilinear never bleeds
    from the neighbouring row at mip 0. U tiles freely. The rows have no gutter: each mip level halves the safe
    distance, so 0.5 px is exact at full size only and 2 px holds to mip 2 (see uv.map_to_trim `inset_px`)."""
    t = _table(sheet); r = trim_region(sheet, region); H = t["size"][1]
    x, y, w, h = r["px"]
    return (1.0 - (y + h - inset_px) / H, 1.0 - (y + inset_px) / H)


def trim_flat_uv(sheet):
    """Blender UV of the centre of the uniform 0.5 'flat' cell of a trim sheet."""
    t = _table(sheet); x, y, w, h = trim_region(sheet, "flat")["px"]
    return ((x + w / 2) / t["size"][0], 1.0 - (y + h / 2) / t["size"][1])


def mask_regions():
    """The tx_mask table: {'size', 'regions': {name: {'px': [x, y, w, h], 'cells': [[x, y, w, h], ...]}}}."""
    _use("mask_regions", "*")
    return _table("mask_regions")


def mask_uv(region, index=None, inset_px=1.0):
    """(u0, v0, u1, v1): Blender-UV rectangle of a tx_mask region (v0 bottom). `index` picks a cell of a multi-cell
    region (numerals 0-9, plate_lines 0-3, picto_misc 0-5, tally 0-3, family_marks 0-11)."""
    _use("mask_regions", region)
    t = _table("mask_regions"); r = t["regions"].get(region)
    if r is None: raise KeyError(f"tx_mask: no region '{region}'")
    W, H = t["size"]
    x, y, w, h = r["px"] if index is None else r["cells"][index]
    return ((x + inset_px) / W, 1.0 - (y + h - inset_px) / H, (x + w - inset_px) / W, 1.0 - (y + inset_px) / H)


def structure_sheet(material):
    """The shared texture a material samples with UV0."""
    return SHEET_OF[material]
