import { describe, expect, it } from "vitest";

import { GameEngine } from "../../src/core/game/gameEngine";
import { SeededRandom } from "../../src/core/rng/seededRandom";
import {
  getOriginalMachineSpec,
  parseMachineSpec,
  type MachineSpec,
} from "../../src/core/specs/schema";

function enabledSpec(): MachineSpec {
  const base = getOriginalMachineSpec();
  return parseMachineSpec({
    ...base,
    states: {
      st: { enabled: true, spins: 100, continuationRate: 0.81 },
      lush: { enabled: true, spins: 0 },
    },
  });
}

function jackpotSeed(): string {
  for (let index = 0; index < 1000; index += 1) {
    const seed = `jackpot-seed-${index}`;
    if (new SeededRandom(seed).chance(1, 2)) return seed;
  }
  throw new Error("could not find a deterministic jackpot seed");
}

const halfSpec = parseMachineSpec({
  ...getOriginalMachineSpec(),
  lottery: { normal: { jackpotNumerator: 1, jackpotDenominator: 2 } },
});

describe("GameEngine", () => {
  it("draws once at entry and stores the result on the hold", () => {
    const engine = new GameEngine({
      spec: getOriginalMachineSpec(),
      seed: "entry",
      now: () => 1_700_000_000_000,
    });

    const result = engine.handleEntry({ ballId: "ball-1" });

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("expected entry");
    expect(engine.drawCount).toBe(1);
    expect(result.draw.drawSequence).toBe(1);
    expect(result.entry.draw).toEqual(result.draw);
    expect(engine.holdCount).toBe(1);
  });

  it("does not draw for duplicate entry events", () => {
    const engine = new GameEngine({ spec: getOriginalMachineSpec(), seed: "duplicate" });

    engine.handleEntry({ ballId: "ball-1" });
    const duplicate = engine.handleEntry({ ballId: "ball-1" });

    expect(duplicate).toEqual({
      accepted: false,
      duplicate: true,
      full: false,
      holdCount: 1,
    });
    expect(engine.drawCount).toBe(1);
  });

  it("does not draw when the hold queue is full", () => {
    const engine = new GameEngine({ spec: getOriginalMachineSpec(), seed: "full" });
    for (let index = 0; index < 4; index += 1) {
      engine.handleEntry({ ballId: `ball-${index}` });
    }

    const rejected = engine.handleEntry({ ballId: "ball-5" });

    expect(rejected).toEqual({
      accepted: false,
      duplicate: false,
      full: true,
      holdCount: 4,
    });
    expect(engine.drawCount).toBe(4);
  });

  it("returns the stored draw on consume without redrawing", () => {
    const engine = new GameEngine({ spec: getOriginalMachineSpec(), seed: "consume" });
    const entry = engine.handleEntry({ ballId: "ball-1" });
    if (!entry.accepted) throw new Error("expected entry");

    const consumed = engine.consumeHold();

    expect(consumed.consumed).toBe(true);
    expect(consumed.hold?.id).toBe(entry.entry.id);
    expect(consumed.hold?.draw).toEqual(entry.entry.draw);
    expect(engine.drawCount).toBe(1);
    expect(engine.holdCount).toBe(0);
  });

  it("consumes multiple holds in FIFO order", () => {
    const engine = new GameEngine({ spec: getOriginalMachineSpec(), seed: "fifo" });
    for (const ballId of ["a", "b", "c"]) {
      engine.handleEntry({ ballId });
    }

    expect(engine.consumeHold().hold?.ballId).toBe("a");
    expect(engine.consumeHold().hold?.ballId).toBe("b");
    expect(engine.consumeHold().hold?.ballId).toBe("c");
    expect(engine.consumeHold().consumed).toBe(false);
  });

  it("produces the same results for the same seed", () => {
    const play = (seed: string) => {
      const engine = new GameEngine({
        spec: getOriginalMachineSpec(),
        seed,
        now: () => 1_700_000_000_000,
      });
      const entries = [0, 1, 2, 3].map((index) => engine.handleEntry({ ballId: `ball-${index}` }));
      const consumed = engine.consumeHold();
      return { entries, consumed, drawCount: engine.drawCount };
    };

    expect(play("replay-seed")).toEqual(play("replay-seed"));
  });

  it("restores holds, draw results and duplicate history from a snapshot", () => {
    const spec = getOriginalMachineSpec();
    const engine = new GameEngine({ spec, seed: "resume" });
    const first = engine.handleEntry({ ballId: "ball-1" });
    const second = engine.handleEntry({ ballId: "ball-2" });
    if (!first.accepted || !second.accepted) throw new Error("expected entries");

    const restored = GameEngine.fromSnapshot(engine.snapshot(), { spec });

    expect(restored.seed).toBe("resume");
    expect(restored.holdCount).toBe(2);
    expect(restored.drawCount).toBe(2);
    expect(restored.consumeHold().hold?.draw).toEqual(first.entry.draw);
    expect(restored.handleEntry({ ballId: "ball-1" }).accepted).toBe(false);
  });

  it("moves to the jackpot phase when a jackpot hold is consumed", () => {
    const engine = new GameEngine({ spec: halfSpec, seed: jackpotSeed() });

    const entry = engine.handleEntry({ ballId: "jackpot-ball" });
    if (!entry.accepted) throw new Error("expected entry");
    expect(entry.draw.outcome).toBe("jackpot");

    engine.consumeHold();

    expect(engine.phase).toBe("jackpot");
    expect(engine.jackpotCount).toBe(1);
  });

  it("rejects snapshots from another machine", () => {
    const engine = new GameEngine({ spec: getOriginalMachineSpec(), seed: "spec" });
    const snapshot = engine.snapshot();

    expect(() => GameEngine.fromSnapshot(snapshot, { spec: enabledSpec() })).not.toThrow();
    expect(() =>
      GameEngine.fromSnapshot(snapshot, {
        spec: parseMachineSpec({ ...getOriginalMachineSpec(), id: "another-machine" }),
      }),
    ).toThrow(/different machine/);
  });
});
