import type { LotteryDraw } from "../types";
import type { SeededRandom } from "../rng/seededRandom";
import type { MachineSpec } from "../specs/schema";

export interface LotteryEngine {
  /** Draw once for a normal (heso) entry. */
  drawNormal(): LotteryDraw;
  /** Number of draws performed; persisted so audit sequences continue. */
  readonly drawCount: number;
}

export interface LotteryEngineOptions {
  readonly spec: MachineSpec;
  readonly rng: SeededRandom;
  /** Restored draw count for snapshot/resume. */
  readonly drawSequence?: number;
}

/**
 * Lottery engine. It only draws; it never mutates holds or game state.
 * The caller must store the returned draw on the hold at entry time.
 */
export function createLotteryEngine({
  spec,
  rng,
  drawSequence = 0,
}: LotteryEngineOptions): LotteryEngine {
  if (!Number.isInteger(drawSequence) || drawSequence < 0) {
    throw new RangeError("drawSequence must be a non-negative integer");
  }

  let sequence = drawSequence;
  const odds = spec.lottery.normal;

  return {
    drawNormal(): LotteryDraw {
      const outcome = rng.chance(odds.jackpotNumerator, odds.jackpotDenominator)
        ? "jackpot"
        : "miss";
      sequence += 1;
      return {
        outcome,
        numerator: odds.jackpotNumerator,
        denominator: odds.jackpotDenominator,
        drawSequence: sequence,
      };
    },
    get drawCount(): number {
      return sequence;
    },
  };
}
