import { describe, expect, it } from "vitest";

import { PachinkoGameCore } from "../../src/integration/browserAdapter";

describe("browser adapter outside a browser", () => {
  it("is disabled without a window object", () => {
    expect(PachinkoGameCore.enabled).toBe(false);
    expect(PachinkoGameCore.isEnabled()).toBe(false);
    expect(PachinkoGameCore.holdCount()).toBe(0);
    expect(PachinkoGameCore.phase()).toBe("normal");
  });

  it("exposes the machine jackpot metadata even when the core is disabled", () => {
    expect(PachinkoGameCore.jackpotInfo()).toEqual({
      roundCount: 10,
      payoutBalls: 1500,
      isST: false,
      isLUSH: false,
    });
  });

  it("does not throw while reading snapshots or consuming", () => {
    expect(() => PachinkoGameCore.reset()).not.toThrow();
    expect(() => PachinkoGameCore.clear()).not.toThrow();
    expect(() => PachinkoGameCore.subscribe("hold:added", () => undefined)()).not.toThrow();
  });

  it("requires the core to be enabled for entry handling", () => {
    expect(() => PachinkoGameCore.handleEntry({ ballId: "ball-1" })).toThrow(/disabled/);
    expect(() => PachinkoGameCore.consumeHold()).toThrow(/disabled/);
  });
});
