import { describe, expect, it } from "vitest";

import { GameStateMachine } from "../../src/core/game/stateMachine";
import { getOriginalMachineSpec, parseMachineSpec } from "../../src/core/specs/schema";

const originalSpec = getOriginalMachineSpec();

const stSpec = parseMachineSpec({
  ...originalSpec,
  states: {
    st: { enabled: true, spins: 3, continuationRate: 0.81 },
    lush: { enabled: true, spins: 0 },
  },
});

describe("GameStateMachine", () => {
  it("starts in the normal phase", () => {
    const machine = new GameStateMachine(originalSpec);
    expect(machine.currentPhase).toBe("normal");
    expect(machine.state.jackpotCount).toBe(0);
  });

  it("records a jackpot and returns its metadata", () => {
    const machine = new GameStateMachine(originalSpec);

    const info = machine.recordJackpot();

    expect(machine.currentPhase).toBe("jackpot");
    expect(machine.state.jackpotCount).toBe(1);
    expect(info).toEqual({
      roundCount: originalSpec.payout.roundCount,
      payoutBalls: originalSpec.payout.jackpotBalls,
      isST: false,
      isLUSH: false,
    });
  });

  it("returns to normal after a jackpot when ST is disabled", () => {
    const machine = new GameStateMachine(originalSpec);
    machine.recordJackpot();

    machine.finishJackpot();

    expect(machine.currentPhase).toBe("normal");
    expect(machine.state.round).toBe(0);
  });

  it("enters ST and returns to normal when spins run out", () => {
    const machine = new GameStateMachine(stSpec);
    machine.recordJackpot();
    machine.finishJackpot();

    expect(machine.currentPhase).toBe("st");
    expect(machine.state.stSpinsRemaining).toBe(3);
    machine.consumeStSpin();
    machine.consumeStSpin();
    expect(machine.currentPhase).toBe("st");
    machine.consumeStSpin();
    expect(machine.currentPhase).toBe("normal");
  });

  it("supports LUSH when the machine enables it", () => {
    const machine = new GameStateMachine(stSpec);

    machine.enterLUSH();

    expect(machine.currentPhase).toBe("lush");
    machine.returnToNormal();
    expect(machine.currentPhase).toBe("normal");
  });

  it("refuses disabled ST/LUSH transitions", () => {
    const machine = new GameStateMachine(originalSpec);

    expect(() => machine.enterST()).toThrow(/ST is not enabled/);
    expect(() => machine.enterLUSH()).toThrow(/LUSH is not enabled/);
  });

  it("refuses an ST spin outside the ST phase", () => {
    const machine = new GameStateMachine(stSpec);
    expect(() => machine.consumeStSpin()).toThrow(/phase normal/);
  });

  it("tracks payouts as integers", () => {
    const machine = new GameStateMachine(originalSpec);

    machine.recordPayout(1500);
    machine.recordPayout(250);

    expect(machine.totalPayout).toBe(1750);
    expect(() => machine.recordPayout(-1)).toThrow(RangeError);
  });

  it("restores from a snapshot", () => {
    const machine = new GameStateMachine(stSpec);
    machine.recordJackpot();
    machine.recordPayout(100);
    const snapshot = machine.snapshot();

    const restored = new GameStateMachine(stSpec, { snapshot });

    expect(restored.currentPhase).toBe("jackpot");
    expect(restored.state).toEqual(snapshot);
  });

  it("rejects invalid snapshots", () => {
    const machine = new GameStateMachine(originalSpec);
    const snapshot = { ...machine.snapshot(), phase: "unknown" as never };

    expect(() => new GameStateMachine(originalSpec, { snapshot })).toThrow(RangeError);
  });
});
