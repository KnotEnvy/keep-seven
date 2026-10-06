// The hands and the gun (code-player order 4.7). The instance lives under ctx.scene.viewModel, whose children are in
// CAMERA SPACE (camera at the origin, looking down -Z, +Y up): render poses the group, this file transforms only its
// own instance (kick, bob, sway, dip). Clips follow the weapon machine's `clip` / `clipSerial`; gameplay timers never
// read a clip. The mixer is advanced on the sim tick with the scaled dt.
import * as THREE from 'three';
import type { AssetInstance, ChamberState, GameContext, Vec3 } from '../core/contracts.ts';
import type { CameraRig } from './camera.ts';
import {
  CLIP_FADE, CYLINDER_BONE_STEP, KEPT_LOOP_HIDE_AT, KEPT_LOOP_SHOW_AT_TAKE, SWAY_MAX_DEG, SWAY_RATE, VIEW_BOB_SCALE,
  VIEW_DIP_SCALE, VIEW_KICK_IN_FINAL_CLIPS, VIEW_PLACE, VIEW_PLACE_BLEND, VIEW_PLACE_HANDLING, WEAPON,
} from './defs.ts';
import type { ClipName, Weapon } from './weapon.ts';

const DEG = Math.PI / 180;
const ROUND_BONES = ['round_1', 'round_2', 'round_3', 'round_4', 'round_5', 'round_6'] as const;
const CLIPS: readonly ClipName[] = ['idle', 'sprint', 'draw', 'fire', 'dry_fire', 'reload_open', 'reload_round', 'reload_close', 'reload_fast_close', 'load_line', 'unload_line', 'load_kept', 'unload_kept', 'fire_kept', 'take_round'];
/** clips that start on their first frame with no blend (the hammer falls on frame 0) and are left with none (the cylinder has turned a notch) */
/**
 * Clips in which the hands work on the gun: they are staged by the artist for the pose the asset is authored in, so
 * they are shown there, not at VIEW_PLACE. The two close clips bring the gun back down and are placed again.
 */
function isHandling(clip: ClipName | ''): boolean {
  return clip === 'reload_open' || clip === 'reload_round' || clip === 'load_line' || clip === 'unload_line' || clip === 'load_kept' || clip === 'unload_kept' || clip === 'take_round';
}
function isCut(clip: ClipName): boolean { return clip === 'fire' || clip === 'fire_kept' || clip === 'dry_fire' || clip === 'reload_round'; }

export class ViewModel {
  private instance: AssetInstance | null = null;
  private current: THREE.AnimationAction | null = null;
  private fading: THREE.AnimationAction | null = null;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private readonly clips: THREE.AnimationClip[] = [];
  /** tracks the view-model's clips play, and tracks the file's clips have (debug snapshot) */
  tracksKept = 0;
  tracksInFile = 0;
  private currentName: ClipName | '' = '';
  private serial = -1;
  private readonly rounds: THREE.Object3D[] = [];
  private keptLoop: THREE.Object3D | null = null;
  private cylinder: THREE.Object3D | null = null;
  private muzzle: THREE.Object3D | null = null;
  private readonly cylinderRest = new THREE.Quaternion();
  /** rest slot of each round bone, counted in notches from the chamber under the hammer in the order they arrive there */
  private readonly slot: number[] = [0, 1, 2, 3, 4, 5];
  /** notches the logical cylinder is ahead of the bones (see syncBones) */
  private offset = 0;
  private ringTurns = 0;
  private turned = false;
  /** the clip that was playing when the cylinder bone left its rest angle */
  private turnedIn: ClipName | '' = '';
  private turnModel: 'settle' | 'leave' | 'none' = 'none';
  /** the procedural kick is added only when the clips do not carry it */
  private proceduralKick = true;
  private readonly pivot = new THREE.Vector3(0.135, -0.165, -0.3);
  private swayYaw = 0;
  private swayPitch = 0;
  private readonly m = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly q = new THREE.Quaternion();
  /** where the held gun stands (lead ruling R6): metres added to the authored pose, and a turn about the grip */
  private readonly placeOffset = new THREE.Vector3(VIEW_PLACE.x, VIEW_PLACE.y, VIEW_PLACE.z);
  private readonly placeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(VIEW_PLACE.pitchDeg * DEG, VIEW_PLACE.yawDeg * DEG, VIEW_PLACE.rollDeg * DEG, 'YXZ'));
  /** where the whole view-model stands while the hands work on the gun (look-dev, round 3): the authored staging, framed */
  private readonly handOffset = new THREE.Vector3(VIEW_PLACE_HANDLING.x, VIEW_PLACE_HANDLING.y, VIEW_PLACE_HANDLING.z);
  private readonly handQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(VIEW_PLACE_HANDLING.pitchDeg * DEG, VIEW_PLACE_HANDLING.yawDeg * DEG, VIEW_PLACE_HANDLING.rollDeg * DEG, 'YXZ'));
  /** how much of the rest placement is applied, 0 (a handling clip: VIEW_PLACE_HANDLING) to 1 (at rest), this tick and the one before */
  private placeW = 1;
  private placeWPrev = 1;
  private readonly qPlace = new THREE.Quaternion();
  /** last scales written, for the debug snapshot */
  readonly shown: number[] = [1, 1, 1, 1, 1, 1];
  keptLoopShown = 1;

  constructor(private readonly ctx: GameContext) {}

  get clipName(): string { return this.currentName; }
  get attached(): boolean { return this.instance !== null; }
  get usesProceduralKick(): boolean { return this.proceduralKick; }
  get boneStep(): number { return this.slot[1] === 1 ? 1 : -1; }
  get turn(): string { return this.turnModel; }
  /** the placement in force: [x, y, z] metres and the quaternion of the turn about the grip (debug snapshot) */
  get place(): number[] { const o = this.placeOffset, q = this.placeQuat; return [o.x, o.y, o.z, q.x, q.y, q.z, q.w, this.placeW]; }
  /** Debug (the sandbox's sliders, the coverage test): another placement than VIEW_PLACE. */
  setPlace(x: number, y: number, z: number, pitchDeg: number, yawDeg: number, rollDeg: number): void {
    this.placeOffset.set(x, y, z);
    this.placeQuat.setFromEuler(new THREE.Euler(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG, 'YXZ'));
  }

  /** start(): instantiate the revolver and hang it in the view-model group. */
  attach(): void {
    const { ctx } = this;
    const inst = ctx.assets.instantiate(WEAPON.asset);
    this.instance = inst;
    inst.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
    ctx.scene.viewModel.add(inst.root);
    for (const name of ROUND_BONES) this.rounds.push(inst.node(name));
    this.keptLoop = inst.node('kept_loop');
    this.cylinder = inst.node('cylinder');
    this.muzzle = inst.node('muzzle');
    this.cylinderRest.copy(this.cylinder.quaternion);
    const gun = inst.node('gun');
    inst.root.updateMatrixWorld(true);
    this.pivot.setFromMatrixPosition(gun.matrixWorld);       // the group has no pose yet: this is camera space
    const loaded = ctx.assets.get(WEAPON.asset);
    // the kick is drawn once: by the clip when it carries one (the art bible's `fire`; the placeholder's `fire` also
    // swings its root 21 degrees), by code otherwise
    this.proceduralKick = !VIEW_KICK_IN_FINAL_CLIPS || !this.clipKicks(loaded.clips.get('fire'), inst);
    this.detectTurn(loaded.clips.get('fire'));
    this.buildActions(inst);
    this.serial = -1; this.current = null; this.fading = null; this.currentName = '';
  }
  detach(): void {
    const mixer = this.instance ? this.instance.mixer : null;
    if (mixer) for (const clip of this.clips) mixer.uncacheClip(clip);
    this.clips.length = 0; this.actions.clear(); this.tracksKept = 0; this.tracksInFile = 0;
    if (this.instance) this.instance.release();
    this.instance = null; this.current = null; this.fading = null; this.currentName = '';
    this.rounds.length = 0; this.keptLoop = null; this.cylinder = null; this.muzzle = null;
  }

  /** Does this clip move the `root` or `gun` bone by 8 degrees or more (or 3 cm)? Then it carries the kick. */
  private clipKicks(clip: THREE.AnimationClip | undefined, inst: AssetInstance): boolean {
    if (!clip) return false;
    const names = new Set([inst.node('root').name, inst.node('gun').name]);
    const q = new THREE.Quaternion(), first = new THREE.Quaternion(), p = new THREE.Vector3(), p0 = new THREE.Vector3();
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      if (!names.has(parsed.nodeName)) continue;
      const v = track.values;
      if (parsed.propertyName === 'quaternion') {
        first.fromArray(v, 0);
        for (let i = 4; i + 3 < v.length; i += 4) if (q.fromArray(v, i).angleTo(first) >= 8 * DEG) return true;
      } else if (parsed.propertyName === 'position') {
        p0.fromArray(v, 0);
        for (let i = 3; i + 2 < v.length; i += 3) if (p.fromArray(v, i).distanceTo(p0) >= 0.03) return true;
      }
    }
    return false;
  }

  /**
   * How the `fire` clip turns the cylinder, read from the file:
   *  - 'settle' (the final gun): the clip STARTS one notch back and turns onto the rest pose on frames 4 to 9, so it
   *    ends exactly on idle and shots chain without a pop. A bone then always shows the logical chamber of its slot.
   *  - 'leave': the clip starts at rest and ends a notch on; the bones snap back when the clip is left.
   *  - 'none' (the placeholder): the cylinder bone never turns; the case heads stay where they are.
   * The ring order comes from the direction of that turn: slot 1 is the bone that takes round_1's place after one
   * notch (CYLINDER_BONE_STEP when the clip turns nothing).
   */
  private detectTurn(fire: THREE.AnimationClip | undefined): void {
    let step = CYLINDER_BONE_STEP;
    this.turnModel = 'none';
    const cyl = this.cylinder, r1 = this.rounds[0], r2 = this.rounds[1], r6 = this.rounds[5];
    if (fire && cyl && r1 && r2 && r6) {
      const track = fire.tracks.find((t) => t.name === cyl.name + '.quaternion');
      const n = track ? track.values.length : 0;
      if (track && n >= 8) {
        const first = new THREE.Quaternion().fromArray(track.values, 0), last = new THREE.Quaternion().fromArray(track.values, n - 4);
        if (first.angleTo(last) > 30 * DEG) {
          this.turnModel = last.angleTo(this.cylinderRest) < 5 * DEG ? 'settle' : 'leave';
          const start = r1.position.clone().applyQuaternion(first);
          const d2 = r2.position.clone().applyQuaternion(last).distanceTo(start);
          const d6 = r6.position.clone().applyQuaternion(last).distanceTo(start);
          step = d2 <= d6 ? 1 : -1;
        }
      }
    }
    for (let k = 0; k < 6; k++) this.slot[k] = (((step * k) % 6) + 6) % 6;
  }

  /**
   * The actions the view-model plays: one per clip, built here from the asset's clips WITHOUT the tracks that only
   * hold a bone at its rest pose (and without any track on a code-driven bone), with the same time scale and loop
   * mode AssetInstance.action() gives (the clip lasts exactly the manifest's seconds). Two measured reasons:
   *  - three's Interpolant.evaluate allocates per track it evaluates on a one-shot clip (910 B per tick with the
   *    placeholder's 93 tracks, 91 of them constant at rest); a bone no clip moves needs no track;
   *  - AnimationMixer activates and deactivates an action by walking its property bindings (about 14 KB per clip
   *    change, two changes per shot), so every action is made active once, here, and stays so: switching clips only
   *    flips `enabled` and weights.
   * A bone left without a track keeps the pose it has now (the mixer saved it as the original state): the rest pose.
   */
  private buildActions(inst: AssetInstance): void {
    const mixer = inst.mixer;
    if (!mixer) throw new Error(`view-model: asset '${WEAPON.asset}' has no clips`);
    const loaded = this.ctx.assets.get(WEAPON.asset);
    const coded = new Set<THREE.Object3D>(this.rounds);
    if (this.keptLoop) coded.add(this.keptLoop);
    const rest = new THREE.Quaternion();
    const atRest = (track: THREE.KeyframeTrack): boolean => {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(inst.root, parsed.nodeName) as THREE.Object3D | null;
      if (!node) return false;
      if (coded.has(node)) return true;                       // code drives these: no clip may key them
      const v = track.values, size = track.getValueSize();
      if (parsed.propertyName === 'quaternion' && size === 4) {
        for (let i = 0; i + 3 < v.length; i += 4) if (rest.fromArray(v, i).angleTo(node.quaternion) > 1e-4) return false;
        return true;
      }
      const target = parsed.propertyName === 'position' ? node.position : parsed.propertyName === 'scale' ? node.scale : null;
      if (!target || size !== 3) return false;
      for (let i = 0; i + 2 < v.length; i += 3) if (Math.abs((v[i] as number) - target.x) > 1e-5 || Math.abs((v[i + 1] as number) - target.y) > 1e-5 || Math.abs((v[i + 2] as number) - target.z) > 1e-5) return false;
      return true;
    };
    for (const name of CLIPS) {
      const source = loaded.clips.get(name);
      if (!source) throw new Error(`view-model: asset '${WEAPON.asset}' has no clip '${name}'`);
      const seconds = this.ctx.assets.clipSeconds(WEAPON.asset, name);
      const def = loaded.def.animations.find((d) => d.name === name);
      const clip = new THREE.AnimationClip(name, source.duration, source.tracks.filter((t) => !atRest(t)), source.blendMode);
      const a = mixer.clipAction(clip);
      a.timeScale = source.duration > 1e-6 && seconds > 1e-6 ? source.duration / seconds : 1;
      const loop = def ? def.loop : name === 'idle' || name === 'sprint';
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.play();
      a.setEffectiveWeight(0);
      a.enabled = false;
      this.actions.set(name, a);
      this.clips.push(clip);
      this.tracksKept += clip.tracks.length; this.tracksInFile += source.tracks.length;
    }
  }
  private play(name: ClipName, from: ClipName | ''): void {
    const inst = this.instance;
    if (!inst) return;
    const next = this.actions.get(name), prev = this.current;
    if (!next) return;
    next.reset();                                             // enabled, unpaused, time 0, no fade in flight
    next.setEffectiveWeight(1);
    if (prev && prev !== next) {
      if (isCut(name) || (from !== '' && isCut(from))) prev.enabled = false;
      else prev.crossFadeTo(next, CLIP_FADE, false);          // the old action disables itself when its weight reaches 0
      // an action still fading out from an earlier change must not blend into a cut
      const fading = this.fading;
      if (fading && fading !== next && fading !== prev) fading.enabled = false;
      this.fading = prev;
    }
    this.current = next; this.currentName = name;
  }

  /** One sim tick: follow the weapon's clip, advance the mixer, then write the bones code drives. */
  tick(dt: number, weapon: Weapon, sprinting: boolean): void {
    const inst = this.instance;
    if (!inst) return;
    const want: ClipName = weapon.clip === 'idle' && sprinting ? 'sprint' : weapon.clip;
    if (weapon.clipSerial !== this.serial || want !== this.currentName) {
      this.serial = weapon.clipSerial;
      this.play(want, this.currentName);
    }
    if (inst.mixer && dt > 0) inst.mixer.update(dt);
    // the placement leaves for a handling clip and is back when the clip hands over to idle (a lone clip: by its last moments)
    const ph = weapon.phase;
    const away = isHandling(this.currentName) && ph !== 'ready' && (ph === 'reload_open' || ph === 'reload_round' || weapon.remaining > VIEW_PLACE_BLEND);
    this.placeWPrev = this.placeW;
    if (dt > 0) this.placeW = away ? Math.max(0, this.placeW - dt / VIEW_PLACE_BLEND) : Math.min(1, this.placeW + dt / VIEW_PLACE_BLEND);
    this.syncBones(weapon);
  }

  /**
   * round_1 .. round_6 are scaled 1 for a loaded chamber and 0 for an empty one. The bone at rest slot s shows chamber
   * (s - offset). The rule that keeps a case head from ever jumping between chambers: `offset` changes only when the
   * picture would otherwise jump, that is when the logical ring turns without the bones following, or when the bones
   * are put back a notch without the logic turning:
   *  - a shot turns the logical ring a notch (chamber i takes what chamber i + 1 held). A 'settle' fire clip puts the
   *    bones a notch back on the same tick and turns them home: nothing to correct. Otherwise offset + 1 (the heads
   *    stay on their bones), and - 1 when a 'leave' clip is left and the bones snap back.
   *  - `reload_round` of the final gun turns the cylinder a notch after the seat and snaps back to its first pose so
   *    it chains: offset - 1 at each snap, so the rounds are seen to go in at one place and index round. The logic
   *    fills its empties in order without turning, so after an interrupted reload the picture is a few notches off
   *    the logic: it is put right (offset 0) when the reload ends, under the gun rolling back in the close clip. A
   *    reload to a full cylinder ends with no correction at all.
   *  - load_line, unload_line, load_kept, unload_kept turn the cylinder to the gate and back: real motion, no correction.
   * The count shown is always the count loaded.
   */
  private syncBones(weapon: Weapon): void {
    const cyl = this.cylinder, model = this.turnModel;
    if (weapon.ringTurns !== this.ringTurns) {
      if (model !== 'settle') this.offset += weapon.ringTurns - this.ringTurns;
      this.ringTurns = weapon.ringTurns;
    }
    if (cyl) {
      const angle = cyl.quaternion.angleTo(this.cylinderRest);
      // hysteresis: the one-frame snap of reload_round passes through 30 degrees on a sim tick
      const turned = this.turned ? angle >= 15 * DEG : angle >= 45 * DEG;
      if (turned && !this.turned) this.turnedIn = this.currentName;
      if (this.turned && !turned && (this.turnedIn === 'reload_round' || (this.turnedIn === 'fire' && model === 'leave'))) this.offset -= 1;
      this.turned = turned;
    }
    if (model === 'settle' && weapon.phase !== 'reload_open' && weapon.phase !== 'reload_round') this.offset = 0;
    this.offset = ((this.offset % 6) + 6) % 6;
    const c = weapon.cylinder;
    for (let k = 0; k < 6; k++) {
      const chamber = ((((this.slot[k] as number) - this.offset) % 6) + 6) % 6;
      const s = (c[chamber] as ChamberState) === 'empty' ? 0 : 1;
      const bone = this.rounds[k];
      if (bone) bone.scale.setScalar(s);
      this.shown[k] = s;
    }
    // the kept round sits in the cuff loop while it is sealed, pulsing, band-broken or (after the stone) violet
    let loop = weapon.seventh === 'chambered' || weapon.seventh === 'spent' ? 0 : 1;
    if (weapon.phase === 'loading_kept' && weapon.t >= KEPT_LOOP_HIDE_AT) loop = 0;       // the thumb has drawn it
    if (weapon.phase === 'taking_round' && weapon.t < KEPT_LOOP_SHOW_AT_TAKE) loop = 0;   // not seated in the loop yet
    if (this.keptLoop) this.keptLoop.scale.setScalar(loop);
    this.keptLoopShown = loop;
  }

  /** A restore: the bones are in step with a full cylinder again. */
  resetRing(weapon: Weapon): void { this.placeW = 1; this.placeWPrev = 1; this.offset = 0; this.ringTurns = weapon.ringTurns; this.turned = false; this.turnedIn = ''; }

  /** Per frame, after the camera is final: kick (if the clips have none), bob, sway lag and the landing dip on the instance root. */
  late(frameDt: number, alpha: number, rig: CameraRig, lookYawDeg: number, lookPitchDeg: number, reduceMotion: boolean): void {
    const inst = this.instance;
    if (!inst) return;
    const root = inst.root;
    // rotate about the gun's grip, not about the eye; the placement (R6) is the pose everything else is added to
    const e = this.e, q = this.q, v = this.v, p = this.pivot, o = this.placeOffset;
    let w = this.placeWPrev + (this.placeW - this.placeWPrev) * alpha;
    w = w * w * (3 - 2 * w);
    const h = this.handOffset;
    const qp = this.qPlace.copy(this.handQuat).slerp(this.placeQuat, w);
    const ox = h.x + (o.x - h.x) * w, oy = h.y + (o.y - h.y) * w, oz = h.z + (o.z - h.z) * w;
    if (reduceMotion) {
      this.swayYaw = 0; this.swayPitch = 0;
      v.copy(p).applyQuaternion(qp);
      root.quaternion.copy(qp);
      root.position.set(p.x - v.x + ox, p.y - v.y + oy, p.z - v.z + oz);
      return;
    }
    // sway: the gun lags the view by up to SWAY_MAX_DEG and catches up
    const decay = Math.exp(-SWAY_RATE * frameDt);
    this.swayYaw = clampDeg((this.swayYaw - lookYawDeg * 0.6) * decay);
    this.swayPitch = clampDeg((this.swayPitch - lookPitchDeg * 0.6) * decay);
    const kick = this.proceduralKick ? rig.viewKick.get(alpha) : 0;
    const rise = kick * rig.viewRiseDeg * DEG + this.swayPitch * DEG;
    const yaw = this.swayYaw * DEG;
    e.set(rise, yaw, 0, 'YXZ');
    q.setFromEuler(e).multiply(qp);
    v.copy(p).applyQuaternion(q);
    root.quaternion.copy(q);
    root.position.set(
      p.x - v.x + ox + rig.offsetSide.get(alpha) * (VIEW_BOB_SCALE - 1),
      p.y - v.y + oy + rig.bobY.get(alpha) * (VIEW_BOB_SCALE - 1) + rig.dip.get(alpha) * (VIEW_DIP_SCALE - 1),
      p.z - v.z + oz + kick * rig.viewBack,
    );
  }

  /**
   * The muzzle in CAMERA SPACE, from the pose of this tick. (The group's own matrix is the camera pose of the last
   * drawn frame, so the world position is rebuilt by the caller from the sim aim.) False before attach().
   */
  muzzleCameraSpace(out: Vec3): boolean {
    const inst = this.instance, muzzle = this.muzzle;
    if (!inst || !muzzle) return false;
    const group = this.ctx.scene.viewModel;
    group.updateMatrixWorld(true);
    this.v.setFromMatrixPosition(muzzle.matrixWorld);
    this.v.applyMatrix4(this.m.copy(group.matrixWorld).invert());
    out.x = this.v.x; out.y = this.v.y; out.z = this.v.z;
    return true;
  }
}

function clampDeg(v: number): number { return v > SWAY_MAX_DEG ? SWAY_MAX_DEG : v < -SWAY_MAX_DEG ? -SWAY_MAX_DEG : v; }
