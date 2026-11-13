import { describe, expect, it } from "vitest";

import { buildBalanceChartGeometry } from "../../src/core/stats/balanceChart";

describe("buildBalanceChartGeometry", () => {
  it("returns an empty geometry for no points", () => {
    const geometry = buildBalanceChartGeometry([], { width: 220, height: 92 });

    expect(geometry.pointCount).toBe(0);
    expect(geometry.linePath).toBe("");
    expect(geometry.areaPath).toBe("");
    expect(geometry.zeroY).toBeGreaterThan(0);
    expect(geometry.zeroY).toBeLessThan(92);
  });

  it("draws a flat line across the panel for one point", () => {
    const geometry = buildBalanceChartGeometry([{ at: 1, balanceYen: 0, differenceBalls: 0 }], {
      width: 220,
      height: 92,
      paddingX: 6,
      paddingY: 10,
    });

    expect(geometry.pointCount).toBe(1);
    expect(geometry.linePath).toBe("M 6 46 L 214 46");
    expect(geometry.areaPath).toBe("M 6 46 L 214 46 L 214 46 L 6 46 Z");
    expect(geometry.lastX).toBe(214);
  });

  it("keeps zero in range and includes losses and wins", () => {
    const geometry = buildBalanceChartGeometry(
      [
        { at: 0, balanceYen: 0, differenceBalls: 0 },
        { at: 1000, balanceYen: -3000, differenceBalls: -750 },
        { at: 2000, balanceYen: 6000, differenceBalls: 1500 },
      ],
      { width: 220, height: 92, paddingX: 6, paddingY: 10 },
    );

    expect(geometry.pointCount).toBe(3);
    expect(geometry.minYen).toBeLessThanOrEqual(-3000);
    expect(geometry.maxYen).toBeGreaterThanOrEqual(6000);
    expect(geometry.linePath.startsWith("M 6 ")).toBe(true);
    expect(geometry.linePath).toContain(" L ");
    expect(geometry.areaPath.endsWith(" Z")).toBe(true);
    expect(geometry.zeroY).toBeGreaterThan(10);
    expect(geometry.zeroY).toBeLessThan(82);
    expect(geometry.lastX).toBe(214);
  });

  it("pads a tiny range so a flat near-zero line stays readable", () => {
    const geometry = buildBalanceChartGeometry([{ at: 1, balanceYen: 4, differenceBalls: 1 }], {
      width: 220,
      height: 92,
      minRangeYen: 1000,
    });

    expect(geometry.maxYen - geometry.minYen).toBeGreaterThanOrEqual(1000);
    expect(geometry.zeroY).toBeGreaterThan(10);
    expect(geometry.zeroY).toBeLessThan(82);
  });

  it("rejects invalid viewport dimensions", () => {
    expect(() => buildBalanceChartGeometry([], { width: 0, height: 92 })).toThrow(
      /width must be a positive number/,
    );
    expect(() => buildBalanceChartGeometry([], { width: 220, height: -1 })).toThrow(
      /height must be a positive number/,
    );
  });
});
