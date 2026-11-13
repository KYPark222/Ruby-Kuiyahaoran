import type { BalancePoint } from "./sessionStats";

/**
 * SVG geometry for the balance sparkline. Keeping the maths outside the DOM
 * lets the chart be unit-tested and keeps `game_ui.js` limited to rendering.
 */

export interface BalanceChartOptions {
  readonly width: number;
  readonly height: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
  /** Smallest visible vertical range in yen. Defaults to ¥1,000. */
  readonly minRangeYen?: number;
}

export interface BalanceChartGeometry {
  readonly linePath: string;
  readonly areaPath: string;
  readonly zeroY: number;
  readonly minYen: number;
  readonly maxYen: number;
  readonly lastX: number;
  readonly lastY: number;
  readonly pointCount: number;
}

export function buildBalanceChartGeometry(
  points: readonly BalancePoint[],
  options: BalanceChartOptions,
): BalanceChartGeometry {
  const width = positiveNumber(options.width, "width");
  const height = positiveNumber(options.height, "height");
  const paddingX = nonNegativeNumber(options.paddingX ?? 6, "paddingX");
  const paddingY = nonNegativeNumber(options.paddingY ?? 10, "paddingY");
  const minRangeYen = positiveNumber(options.minRangeYen ?? 1000, "minRangeYen");

  const usable = points.filter(
    (point) => Number.isFinite(point.at) && Number.isFinite(point.balanceYen),
  );

  const values = usable.map((point) => point.balanceYen);
  let minYen = Math.min(0, ...values);
  let maxYen = Math.max(0, ...values);
  if (maxYen - minYen < minRangeYen) {
    const midpoint = (minYen + maxYen) / 2;
    minYen = midpoint - minRangeYen / 2;
    maxYen = midpoint + minRangeYen / 2;
  }
  if (maxYen === minYen) {
    minYen -= 0.5;
    maxYen += 0.5;
  }

  const innerWidth = Math.max(1, width - paddingX * 2);
  const innerHeight = Math.max(1, height - paddingY * 2);
  const yFor = (value: number): number =>
    round(height - paddingY - ((value - minYen) / (maxYen - minYen)) * innerHeight);

  const coordinates: Array<{ x: number; y: number }> = [];
  if (usable.length === 1) {
    const only = usable[0];
    if (only) {
      const y = yFor(only.balanceYen);
      coordinates.push({ x: round(paddingX), y }, { x: round(width - paddingX), y });
    }
  } else if (usable.length > 1) {
    usable.forEach((point, index) => {
      coordinates.push({
        x: round(paddingX + (innerWidth * index) / (usable.length - 1)),
        y: yFor(point.balanceYen),
      });
    });
  }

  const zeroY = yFor(0);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const linePath = coordinates
    .map((coordinate, index) => `${index === 0 ? "M" : "L"} ${coordinate.x} ${coordinate.y}`)
    .join(" ");
  const areaPath = first && last ? `${linePath} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z` : "";

  return {
    linePath,
    areaPath,
    zeroY,
    minYen: round(minYen),
    maxYen: round(maxYen),
    lastX: last?.x ?? 0,
    lastY: last?.y ?? zeroY,
    pointCount: usable.length,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive number`);
  }
  return value;
}

function nonNegativeNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative number`);
  }
  return value;
}
