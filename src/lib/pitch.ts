export const MIN_FREQ = 110; // A2 – largest panes
export const MAX_FREQ = 1046.5; // C6 – smallest panes

// A-minor pentatonic so heavy rain always sounds consonant.
const PENTA = [0, 3, 5, 7, 10];

/** Larger area → lower pitch; smooth log-inverse mapping, snapped to pentatonic. */
export function areaToFrequency(area: number, minArea: number, maxArea: number): number {
  const a = Math.min(Math.max(area, minArea), maxArea);
  const t = (Math.log(a) - Math.log(minArea)) / (Math.log(maxArea) - Math.log(minArea));
  const raw = MAX_FREQ * Math.pow(MIN_FREQ / MAX_FREQ, t);
  const semis = 12 * Math.log2(raw / MIN_FREQ);
  const octave = Math.floor(semis / 12);
  const within = semis - octave * 12;
  let best: number = PENTA[0]!;
  for (const p of [...PENTA, 12]) if (Math.abs(p - within) < Math.abs(best - within)) best = p;
  const f = MIN_FREQ * Math.pow(2, (octave * 12 + best) / 12);
  return Math.min(Math.max(f, MIN_FREQ), MAX_FREQ);
}
