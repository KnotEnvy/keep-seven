// D Dorian from D3 (GDD 17 "One tonal family"). Everything that answers a bullet is pitched from here.
// The machines sing 20 cents flat, the line round 8 cents sharp, and only the kept round is exactly in tune.

/** root of the scale: D3 */
export const D3 = 146.83;
/** semitones of D Dorian above the root: D E F G A B C */
export const DORIAN: readonly number[] = [0, 2, 3, 5, 7, 9, 10];

/** frequency ratio of a number of cents */
export function centsRatio(cents: number): number { return Math.pow(2, cents / 1200); }
/** how many cents `f` is above `ref` */
export function centsOff(f: number, ref: number): number { return 1200 * Math.log2(f / ref); }

/**
 * Frequency of scale degree `n` (1 = D, 2 = E ... 7 = C; 8 = the D above, and so on) in an octave.
 * Octave 3 is the octave whose root is D3 (146.83 Hz); degree(1, 4) is D4, degree(5, 2) is A2.
 */
export function degree(n: number, octave = 3): number {
  const i = Math.max(1, Math.round(n)) - 1;
  const semis = (DORIAN[i % 7] as number) + 12 * Math.floor(i / 7) + 12 * (octave - 3);
  return D3 * Math.pow(2, semis / 12);
}

/** the station's tuning: everything a machine sings is 20 cents flat */
export const FLAT = centsRatio(-20);
/** the line round's tone: 8 cents sharp ("slightly too pure" and not quite right) */
export const LINE_SHARP = centsRatio(8);
/** the wire, the drone and the bells are never exact either: only the kept round is */
export const WIRE_OFF = centsRatio(-4);

export const D2 = degree(1, 2);
export const A2 = degree(5, 2);
export const D4 = degree(1, 4);
export const D5 = degree(1, 5);
/** minus a perfect fourth (the knot's falling pitch) */
export const FOURTH_DOWN = Math.pow(2, -5 / 12);
