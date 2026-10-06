// The kept round's aim test (GDD 6.6 rule 4; GDD 21 test 8, player half): the ray against the bore cylinder of the
// layout, from the centre of each of the six proving marks.
import { describe, expect, it } from 'vitest';
import layoutJson from '../../design/layout.json';
import { PLAYER_EYE } from '../../src/core/contracts.ts';
import type { KeptContext, LayoutData } from '../../src/core/contracts.ts';
import { rayEntersBore } from '../../src/player/kept.ts';

const layout = layoutJson as unknown as LayoutData;
const DEG = Math.PI / 180;
const bore = layout.markers.find((m) => m.id === 'bore_opening');
const volume = (bore?.params.volume ?? {}) as { radius: number; top: number; bottom: number; axis: [number, number, number] };
const marks = layout.markers.filter((m) => /^ia_proving_mark_\d$/.test(m.id));
const contextOf = (m: { id: string; pos: [number, number, number] }): KeptContext => ({
  mark: m.id, markX: m.pos[0], markY: m.pos[1], markZ: m.pos[2], leaveRadius: 2.5,
  boreX: volume.axis[0], boreZ: volume.axis[2], boreTopY: volume.top, boreBottomY: volume.bottom, boreRadius: volume.radius,
});
/** unit direction for a yaw (0 faces -Z, positive turns left) and a pitch (positive up), degrees */
const dir = (yawDeg: number, pitchDeg: number): [number, number, number] => {
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
};

describe('the bore target volume', () => {
  it('the layout has the cylinder and six marks', () => {
    expect(volume).toMatchObject({ radius: 3, top: -42.8, bottom: -50 });
    expect(marks).toHaveLength(6);
  });
  it('from each mark every aim from 5 to 60 degrees below the horizon within 25 degrees of the bearing to the axis is legal', () => {
    for (const m of marks) {
      const c = contextOf(m);
      const ex = m.pos[0], ey = m.pos[1] + PLAYER_EYE, ez = m.pos[2];
      const bearing = Math.atan2(-(c.boreX - ex), -(c.boreZ - ez)) / DEG;
      for (let off = -25; off <= 25; off += 2.5) {
        for (let down = 5; down <= 60; down += 2.5) {
          const [dx, dy, dz] = dir(bearing + off, -down);
          expect(rayEntersBore(ex, ey, ez, dx, dy, dz, c), `${m.id} ${off} ${down}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it('a level aim, an aim at the far wall, an aim up, away or wide of the bore are not legal', () => {
    for (const m of marks) {
      const c = contextOf(m);
      const ex = m.pos[0], ey = m.pos[1] + PLAYER_EYE, ez = m.pos[2];
      const bearing = Math.atan2(-(c.boreX - ex), -(c.boreZ - ez)) / DEG;
      for (const [yaw, pitch] of [[bearing, 0], [bearing, -1], [bearing, 20], [bearing + 180, -30], [bearing + 60, -20], [bearing - 60, -20], [bearing, -89]] as const) {
        const [dx, dy, dz] = dir(yaw, pitch);
        expect(rayEntersBore(ex, ey, ez, dx, dy, dz, c), `${m.id} ${yaw - bearing} ${pitch}`).toBe(-1);
      }
    }
  });
  it('the distance returned is where the ray enters: the top disc, the side, or 0 from inside', () => {
    const c: KeptContext = { mark: 'm', markX: 0, markY: 0, markZ: 0, leaveRadius: 2.5, boreX: 0, boreZ: 0, boreTopY: 0, boreBottomY: -6, boreRadius: 3 };
    expect(rayEntersBore(0, 5, 0, 0, -1, 0, c)).toBeCloseTo(5, 9);             // straight down onto the disc
    expect(rayEntersBore(10, -3, 0, -1, 0, 0, c)).toBeCloseTo(7, 9);           // level, through the side
    expect(rayEntersBore(0, -3, 0, 1, 0, 0, c)).toBe(0);                       // from inside
    expect(rayEntersBore(10, 5, 0, 0, -1, 0, c)).toBe(-1);                     // straight down beside it
    expect(rayEntersBore(0, -10, 0, 0, -1, 0, c)).toBe(-1);                    // below it, going down
    expect(rayEntersBore(10, 1, 0, -1, 0, 0, c)).toBe(-1);                     // level above the top
    const s = Math.SQRT1_2;
    expect(rayEntersBore(5, 1, 0, -s, -s, 0, c)).toBeCloseTo(2 / s, 9);        // 45 degrees: enters through the side at y = -1
  });
});
