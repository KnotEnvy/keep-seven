// src/enemies/hintring.ts: outline rings over things a round should go into (pass i4: an open Tamper vent for a player
// who keeps dying to it, the Windlass's pawls and the bore's line locker for one who has not answered the guard).
//
// The renderer's outline (RenderApi.setOutline, the hint pulse of the puzzles) draws the back faces of every mesh under
// one object, two pixels fat, pulsing. A vent knot and a pawl are bones of a skinned body and have no mesh of their
// own, so the rings are this module's: up to `MAX_RINGS` thin tori in one group. Their material is invisible, so the
// frame's own pass never draws them (no draw call, no triangle in the budget); only the outline pass does, with its
// own material, while a ring is shown. Nothing is allocated after construction.
import * as THREE from 'three';
import type { GameContext } from '../core/contracts.ts';

const MAX_RINGS = 3;
/** tube radius as a fraction of the ring's radius (the outline adds two pixels each side) */
const TUBE = 0.07;

export class HintRing {
  private readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly geometry: THREE.TorusGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  /** rings asked for since the last commit, one bit each */
  private asked = 0;
  private shown = 0;
  /** the outline is ours (another system's target is never cleared from here) */
  private outlined = false;

  constructor(private readonly ctx: GameContext, name: string) {
    this.group.name = name;
    this.geometry = new THREE.TorusGeometry(1, TUBE, 5, 20);
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.material.visible = false;
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.name = `${name}_${i}`;
      m.visible = false;
      m.matrixAutoUpdate = true;
      this.group.add(m);
      this.rings.push(m);
    }
  }

  /** Ring `i` at a point, facing along (nx, nz) on the floor plane, `radius` across its middle. Call every tick it should show. */
  place(i: number, x: number, y: number, z: number, nx: number, nz: number, radius: number): void {
    const m = this.rings[i];
    if (!m) return;
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(nx, nz);
    m.scale.setScalar(radius);
    this.asked |= 1 << i;
  }

  /** Once a tick, after every place(): rings not asked for this tick go, and the outline follows. */
  commit(): void {
    const asked = this.asked;
    this.asked = 0;
    if (asked === this.shown) { if (asked !== 0 && !this.outlined) this.claim(); return; }
    for (let i = 0; i < MAX_RINGS; i++) (this.rings[i] as THREE.Mesh).visible = (asked & (1 << i)) !== 0;
    this.shown = asked;
    if (asked !== 0) this.claim(); else this.release();
  }

  /** rings on screen, one bit each (tests and the debug snapshot) */
  get mask(): number { return this.shown; }

  private claim(): void {
    if (this.group.parent === null) this.ctx.scene.dynamic.add(this.group);
    this.ctx.render.setOutline(this.group);
    this.outlined = true;
  }
  private release(): void {
    if (this.outlined) { this.outlined = false; this.ctx.render.setOutline(null); }
    this.group.removeFromParent();
  }

  clear(): void { this.asked = 0; this.commit(); }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}
