import { describe, expect, it } from "vitest";

import { HoldQueue } from "../../src/core/holds/holdQueue";
import type { LotteryDraw, LotteryOutcome } from "../../src/core/types";

function makeDraw(outcome: LotteryOutcome = "miss", drawSequence = 1): LotteryDraw {
  return { outcome, numerator: 1, denominator: 399, drawSequence };
}

function createQueue(limit = 4) {
  return new HoldQueue({
    limit,
    now: () => 1_700_000_000_000,
  });
}

describe("HoldQueue", () => {
  it("adds a hold with a unique ID and the entry draw", () => {
    const queue = createQueue();
    const draw = makeDraw("miss", 7);

    const result = queue.add({ ballId: "ball-1", draw });

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("expected accepted hold");
    expect(result.entry.id).toBe("hold-0001");
    expect(result.entry.ballId).toBe("ball-1");
    expect(result.entry.source).toBe("normal");
    expect(result.entry.draw).toEqual(draw);
    expect(result.holdCount).toBe(1);
    expect(queue.size).toBe(1);
  });

  it("generates unique IDs for every hold", () => {
    const queue = createQueue();
    const ids = ["a", "b", "c", "d"].map((ballId, index) => {
      const result = queue.add({ ballId, draw: makeDraw("miss", index + 1) });
      if (!result.accepted) throw new Error("expected accepted hold");
      return result.entry.id;
    });

    expect(new Set(ids).size).toBe(4);
  });

  it("rejects a fifth hold when four are stored", () => {
    const queue = createQueue();
    for (let index = 0; index < 4; index += 1) {
      const result = queue.add({ ballId: `ball-${index}`, draw: makeDraw("miss", index + 1) });
      expect(result.accepted).toBe(true);
    }

    const rejected = queue.add({ ballId: "ball-5", draw: makeDraw("miss", 5) });

    expect(rejected).toEqual({ accepted: false, reason: "full", holdCount: 4 });
    expect(queue.size).toBe(4);
    expect(queue.isFull).toBe(true);
  });

  it("consumes holds in FIFO order", () => {
    const queue = createQueue();
    for (const ballId of ["first", "second", "third"]) {
      queue.add({ ballId, draw: makeDraw("miss") });
    }

    expect(queue.consume().hold?.ballId).toBe("first");
    expect(queue.consume().hold?.ballId).toBe("second");
    expect(queue.size).toBe(1);
    expect(queue.peek()?.ballId).toBe("third");
  });

  it("returns the stored draw and does not redraw on consume", () => {
    const queue = createQueue();
    const stored = makeDraw("jackpot", 42);
    queue.add({ ballId: "jackpot-ball", draw: stored });

    const consumed = queue.consume();

    expect(consumed.consumed).toBe(true);
    expect(consumed.hold?.draw).toEqual(stored);
    expect(consumed.hold?.draw.outcome).toBe("jackpot");
    expect(consumed.hold?.draw.drawSequence).toBe(42);
    expect(consumed.holdCount).toBe(0);
  });

  it("returns an empty result when there is nothing to consume", () => {
    const queue = createQueue();

    expect(queue.consume()).toEqual({ consumed: false, holdCount: 0 });
    expect(queue.peek()).toBeUndefined();
  });

  it("ignores duplicate entry events", () => {
    const queue = createQueue();
    const first = queue.add({ ballId: "same-ball", draw: makeDraw("miss", 1) });

    const duplicate = queue.add({ ballId: "same-ball", draw: makeDraw("miss", 2) });

    expect(first.accepted).toBe(true);
    expect(duplicate).toEqual({ accepted: false, reason: "duplicate", holdCount: 1 });
    expect(queue.size).toBe(1);
    if (first.accepted) {
      expect(queue.peek()).toEqual(first.entry);
    }
  });

  it("remembers consumed balls so they cannot be re-added", () => {
    const queue = createQueue();
    queue.add({ ballId: "consumed-ball", draw: makeDraw("miss", 1) });
    queue.consume();

    const duplicate = queue.add({ ballId: "consumed-ball", draw: makeDraw("miss", 2) });

    expect(duplicate).toEqual({ accepted: false, reason: "duplicate", holdCount: 0 });
  });

  it("treats a ball rejected by a full queue as processed", () => {
    const queue = createQueue();
    for (let index = 0; index < 4; index += 1) {
      queue.add({ ballId: `ball-${index}`, draw: makeDraw("miss") });
    }
    expect(queue.add({ ballId: "full-ball", draw: makeDraw("miss") }).accepted).toBe(false);
    queue.consume();

    const retry = queue.add({ ballId: "full-ball", draw: makeDraw("miss") });

    expect(retry).toEqual({ accepted: false, reason: "duplicate", holdCount: 3 });
  });

  it("restores entries and processed IDs from a snapshot", () => {
    const queue = createQueue();
    queue.add({ ballId: "kept", draw: makeDraw("jackpot", 9) });
    queue.add({ ballId: "removed", draw: makeDraw("miss", 10) });
    queue.consume();

    const restored = new HoldQueue({ limit: 4, snapshot: queue.snapshot() });

    expect(restored.size).toBe(1);
    expect(restored.peek()?.ballId).toBe("removed");
    expect(restored.hasBall("kept")).toBe(true);
    expect(restored.consume().hold?.draw.outcome).toBe("miss");
  });

  it("rejects a snapshot with more entries than the limit", () => {
    const queue = createQueue();
    for (let index = 0; index < 4; index += 1) {
      queue.add({ ballId: `ball-${index}`, draw: makeDraw("miss") });
    }

    expect(() => new HoldQueue({ limit: 2, snapshot: queue.snapshot() })).toThrow(RangeError);
  });

  it("rejects blank ball IDs", () => {
    const queue = createQueue();
    expect(() => queue.add({ ballId: "   ", draw: makeDraw() })).toThrow(RangeError);
  });
});
