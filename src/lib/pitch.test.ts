import { describe, expect, it } from "vitest";
import { areaToFrequency } from "./pitch";

describe("areaToFrequency", () => {
  it("larger panes play lower notes than smaller panes", () => {
    expect(areaToFrequency(200000, 1000, 400000)).toBeLessThan(areaToFrequency(3000, 1000, 400000));
  });
  it("stays within 110 Hz – 1046.5 Hz", () => {
    expect(areaToFrequency(1e9, 1000, 400000)).toBeCloseTo(110, 0);
    expect(areaToFrequency(1, 1000, 400000)).toBeLessThanOrEqual(1046.5);
    expect(areaToFrequency(1, 1000, 400000)).toBeGreaterThan(800);
  });
});
