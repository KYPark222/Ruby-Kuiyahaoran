import { describe, expect, it } from "vitest";

import {
  getOriginalMachineSpec,
  MachineSpecError,
  parseMachineSpec,
} from "../../src/core/specs/schema";

describe("machine specification schema", () => {
  it("loads the original machine specification", () => {
    const spec = getOriginalMachineSpec();

    expect(spec.id).toBe("original-machine");
    expect(spec.name).toBe("ORBIT-01");
    expect(spec.holdLimit).toBe(4);
    expect(spec.lottery.normal.jackpotNumerator / spec.lottery.normal.jackpotDenominator).toBe(
      1 / 399,
    );
    expect(spec.payout.jackpotBalls).toBeGreaterThan(0);
  });

  it("returns a frozen specification", () => {
    const spec = getOriginalMachineSpec();
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.lottery.normal)).toBe(true);
  });

  it("rejects zero or negative probabilities", () => {
    const spec = getOriginalMachineSpec();
    const invalid = {
      ...spec,
      lottery: { normal: { jackpotNumerator: 1, jackpotDenominator: 0 } },
    };

    expect(() => parseMachineSpec(invalid)).toThrow(MachineSpecError);
  });

  it("rejects a numerator greater than or equal to the denominator", () => {
    const spec = getOriginalMachineSpec();
    const invalid = {
      ...spec,
      lottery: { normal: { jackpotNumerator: 399, jackpotDenominator: 399 } },
    };

    expect(() => parseMachineSpec(invalid)).toThrow(/jackpotNumerator must be smaller/);
  });

  it("rejects an invalid hold limit", () => {
    const spec = getOriginalMachineSpec();

    expect(() => parseMachineSpec({ ...spec, holdLimit: 0 })).toThrow(MachineSpecError);
    expect(() => parseMachineSpec({ ...spec, holdLimit: 9 })).toThrow(MachineSpecError);
  });

  it("rejects missing and unknown fields", () => {
    const spec = getOriginalMachineSpec();

    expect(() => parseMachineSpec({ ...spec, name: "" })).toThrow(MachineSpecError);
    expect(() => parseMachineSpec({ ...spec, unexpected: true })).toThrow(MachineSpecError);
  });

  it("reports the invalid paths", () => {
    const spec = getOriginalMachineSpec();
    const invalid = { ...spec, holdLimit: 0 };

    try {
      parseMachineSpec(invalid);
      throw new Error("expected parseMachineSpec to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MachineSpecError);
      const issues = (error as MachineSpecError).issues;
      expect(issues.some((issue) => issue.startsWith("holdLimit:"))).toBe(true);
    }
  });
});
