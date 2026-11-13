import { describe, expect, it, vi } from "vitest";

import { createLotteryEngine } from "../../src/core/lottery/lottery";
import { SeededRandom } from "../../src/core/rng/seededRandom";
import { getOriginalMachineSpec } from "../../src/core/specs/schema";

describe("SeededRandom", () => {
  it("reproduces the same sequence for the same seed", () => {
    const first = new SeededRandom("orbit-01");
    const second = new SeededRandom("orbit-01");

    const values = Array.from({ length: 20 }, () => first.nextUint32());
    const repeated = Array.from({ length: 20 }, () => second.nextUint32());

    expect(repeated).toEqual(values);
  });

  it("produces a different sequence for a different seed", () => {
    const first = new SeededRandom("seed-a");
    const second = new SeededRandom("seed-b");

    expect(Array.from({ length: 5 }, () => first.nextUint32())).not.toEqual(
      Array.from({ length: 5 }, () => second.nextUint32()),
    );
  });

  it("resumes exactly from a snapshot", () => {
    const random = new SeededRandom("snapshot-seed");
    random.nextUint32();
    random.nextUint32();
    const snapshot = random.snapshot();
    const resumed = SeededRandom.fromSnapshot(snapshot);

    expect(resumed.nextUint32()).toBe(random.nextUint32());
    expect(resumed.nextUint32()).toBe(random.nextUint32());
    expect(resumed.draws).toBe(random.draws);
  });

  it("keeps intBelow results inside the requested range", () => {
    const random = new SeededRandom("range");
    for (let index = 0; index < 200; index += 1) {
      const value = random.intBelow(4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
    }
  });

  it("rejects invalid bounds", () => {
    const random = new SeededRandom("invalid");
    expect(() => random.intBelow(0)).toThrow(RangeError);
    expect(() => random.intBelow(1.5)).toThrow(RangeError);
  });
});

describe("normal lottery configuration", () => {
  it("uses the required 1/399 odds", () => {
    const spec = getOriginalMachineSpec();
    expect(spec.lottery.normal.jackpotNumerator).toBe(1);
    expect(spec.lottery.normal.jackpotDenominator).toBe(399);
    expect(spec.holdLimit).toBe(4);
  });

  it("draws with the configured numerator and denominator", () => {
    const spec = getOriginalMachineSpec();
    const random = new SeededRandom("lottery-spy");
    const chance = vi.spyOn(random, "chance").mockReturnValueOnce(true);
    const lottery = createLotteryEngine({ spec, rng: random });

    const draw = lottery.drawNormal();

    expect(chance).toHaveBeenCalledWith(1, 399);
    expect(draw).toEqual({
      outcome: "jackpot",
      numerator: 1,
      denominator: 399,
      drawSequence: 1,
    });
    expect(lottery.drawCount).toBe(1);
  });

  it("is deterministic for a fixed seed", () => {
    const spec = getOriginalMachineSpec();
    const run = () => {
      const lottery = createLotteryEngine({ spec, rng: new SeededRandom("replay") });
      return Array.from({ length: 30 }, () => lottery.drawNormal().outcome);
    };
    expect(run()).toEqual(run());
  });
});
