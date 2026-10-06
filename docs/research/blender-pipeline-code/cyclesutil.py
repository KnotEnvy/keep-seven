import bpy
def use_cycles(device='CPU', samples=64, denoise=True, threads=0):
    """device: 'CPU' | 'CUDA' | 'OPTIX'. Returns the device actually selected."""
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    c = s.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.use_denoising = denoise
    if threads:
        s.render.threads_mode = 'FIXED'; s.render.threads = threads
    if device == 'CPU':
        c.device = 'CPU'
        return 'CPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = device
    prefs.get_devices()
    found = False
    for d in prefs.devices:
        d.use = (d.type == device)
        found = found or d.use
    if not found:
        c.device = 'CPU'
        return 'CPU'
    c.device = 'GPU'
    return device
