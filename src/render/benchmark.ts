// Release pass p0 (performance critic: "the tier benchmark is uncalibrated"). The quality manager sends a machine to the
// hidden `min` tier at boot when a full-screen pass of the fill-rate benchmark takes over 4 ms (core/quality.ts
// `tierFromBenchmark`). No real integrated GPU has ever run that benchmark, and a 2017 one could plausibly land a little
// over the line: the player the Low tier is built for would then open on the emergency tier (no post chain, context
// MSAA) without Low ever having been tried. Low has its own safety net (the resolution scale down to 0.5, then the
// manager's demotion in play), so the boot only needs to catch a machine that is hopeless on Low.
//
// Until the number is measured on real hardware the verdict "min" therefore needs TWICE the threshold: a result between
// 4 and 8 ms is reported AS the threshold (4 ms: "not over"), everything else as measured. This lives here because
// src/core is frozen for this pass; the request to move the threshold itself is in docs/requests/render-tech.md, and
// this function is the one line to delete when it has moved.

/** core/quality.ts: over this many ms a pass the boot goes to `min` */
export const MIN_THRESHOLD_MS = 4;
/** an uncalibrated benchmark has to be this many times over the threshold before the boot leaves Low */
export const MIN_MARGIN = 2;

/** What the benchmark tells the quality manager, from the median it measured (ms per full-screen pass). */
export function benchmarkVerdict(measuredMs: number): number {
  if (!(measuredMs >= 0)) return 0;                                    // NaN, a negative clock step: no verdict
  if (measuredMs > MIN_THRESHOLD_MS && measuredMs <= MIN_THRESHOLD_MS * MIN_MARGIN) return MIN_THRESHOLD_MS;
  return measuredMs;
}
