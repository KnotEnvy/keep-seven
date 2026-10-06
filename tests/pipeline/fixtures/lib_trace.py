"""Call recorder for tests/pipeline/lib.test.mjs: runs another script with every PUBLIC function of blender/lib wrapped
and writes which ones were called.

    tools/blender.sh -b --factory-startup --python-exit-code 1 -P tests/pipeline/fixtures/lib_trace.py -- <trace.json> <script.py> [script args...]

The trace file gets {"public": ["module.function", ...], "called": [...]}. A function counts when a script (or another
module, through `module.function`) calls it; calls a module makes to names it imported with `from .x import y` are not
seen, so the test's list of "exercised" functions errs on the side of asking for a direct call. The script's exit code
is passed on."""
import sys, os, json, inspect, functools, runpy, importlib
sys.dont_write_bytecode = True
_d = os.path.dirname(os.path.abspath(__file__))
while not (os.path.isfile(os.path.join(_d, "lib", "__init__.py")) or os.path.isfile(os.path.join(_d, "blender", "lib", "__init__.py"))):
    if os.path.dirname(_d) == _d: raise SystemExit(f"blender/lib not found above {os.path.abspath(__file__)}")   # never loop at the filesystem root
    _d = os.path.dirname(_d)
sys.path.insert(0, _d if os.path.isfile(os.path.join(_d, "lib", "__init__.py")) else os.path.join(_d, "blender"))

MODULES = ("scene", "mesh", "uv", "material", "vcol", "bake", "rig", "anim", "export", "budget", "manifest", "layout", "zone", "knot", "brand", "texdraw")
argv = sys.argv[sys.argv.index("--") + 1:]
trace_path, script, rest = argv[0], argv[1], argv[2:]
public, called = [], set()


def _wrap(key, fn):
    @functools.wraps(fn)
    def w(*a, **k):
        called.add(key)
        return fn(*a, **k)
    return w


for name in MODULES:
    mod = importlib.import_module("lib." + name)
    for attr, fn in sorted(vars(mod).items()):
        if attr.startswith("_") or not inspect.isfunction(fn) or fn.__module__ != mod.__name__: continue
        key = f"{name}.{attr}"; public.append(key)
        setattr(mod, attr, _wrap(key, fn))

code = 0
sys.argv = sys.argv[:sys.argv.index("--") + 1] + rest
try:
    runpy.run_path(script, run_name="__main__")
except SystemExit as e:
    code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException:
    import traceback; traceback.print_exc(); code = 1
finally:
    os.makedirs(os.path.dirname(os.path.abspath(trace_path)), exist_ok=True)
    with open(trace_path, "w", encoding="utf-8") as f: json.dump({"public": public, "called": sorted(called)}, f)
sys.stdout.flush(); sys.stderr.flush()
sys.exit(code)
