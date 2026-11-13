import { describe, expect, it } from "vitest";

import {
  DEFAULT_INITIAL_INVESTMENT_YEN,
  DEFAULT_INVESTMENT_UNIT_YEN,
  DEFAULT_YEN_PER_BALL,
  SessionStats,
} from "../../src/core/stats/sessionStats";

function clock(start = 1_700_000_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (milliseconds: number) => {
      current += milliseconds;
      return current;
    },
  };
}

describe("SessionStats", () => {
  it("starts with the configured investment converted into balls", () => {
    const stats = new SessionStats({ now: () => 1_000 });

    expect(stats.metrics()).toMatchObject({
      investedYen: DEFAULT_INITIAL_INVESTMENT_YEN,
      purchasedBalls: DEFAULT_INITIAL_INVESTMENT_YEN / DEFAULT_YEN_PER_BALL,
      currentBalls: DEFAULT_INITIAL_INVESTMENT_YEN / DEFAULT_YEN_PER_BALL,
      payoutBalls: 0,
      launchedBalls: 0,
      differenceBalls: 0,
      balanceYen: 0,
      jackpotCount: 0,
    });
    expect(stats.snapshot().balanceHistory).toHaveLength(1);
  });

  it("deducts launched balls and records the balance drop", () => {
    const testClock = clock();
    const stats = new SessionStats({ now: testClock.now });

    stats.recordLaunch();
    testClock.advance(6000);
    stats.recordLaunch(9);

    expect(stats.metrics()).toMatchObject({
      launchedBalls: 10,
      currentBalls: 740,
      differenceBalls: -10,
      balanceYen: -10 * DEFAULT_YEN_PER_BALL,
    });
    expect(stats.snapshot().balanceHistory).toHaveLength(2);
  });

  it("adds investment in the configured unit without changing profit", () => {
    const stats = new SessionStats({ now: () => 1_000 });
    const before = stats.metrics();

    stats.addInvestment();

    expect(stats.metrics()).toMatchObject({
      investedYen: before.investedYen + DEFAULT_INVESTMENT_UNIT_YEN,
      currentBalls: before.currentBalls + DEFAULT_INVESTMENT_UNIT_YEN / DEFAULT_YEN_PER_BALL,
      balanceYen: before.balanceYen,
    });
  });

  it("separates normal and ST spins", () => {
    const stats = new SessionStats({ now: () => 1_000 });

    stats.recordSpin("normal");
    stats.recordSpin("normal");
    stats.recordSpin("st");
    stats.recordSpin("lush");

    expect(stats.metrics()).toMatchObject({
      normalSpins: 3,
      stSpins: 1,
    });
  });

  it("records a first jackpot, its payout and history row", () => {
    const testClock = clock();
    const stats = new SessionStats({ now: testClock.now });

    const record = stats.recordJackpot({
      roundCount: 10,
      payoutBalls: 1500,
      phase: "normal",
      at: testClock.now(),
    });

    expect(record).toMatchObject({
      roundCount: 10,
      payoutBalls: 1500,
      kind: "first",
    });
    expect(stats.metrics()).toMatchObject({
      payoutBalls: 1500,
      firstHits: 1,
      currentStreak: 1,
      maxStreak: 1,
      jackpotCount: 1,
      balanceYen: 1500 * DEFAULT_YEN_PER_BALL,
    });
    expect(stats.snapshot().jackpots[0]).toEqual(record);
  });

  it("counts ST and LUSH continuations and resets the streak on a first hit", () => {
    const stats = new SessionStats({ now: () => 1_000 });

    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "normal" });
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "st" });
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "lush" });
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "lush" });

    expect(stats.metrics()).toMatchObject({
      firstHits: 1,
      lushEntries: 1,
      currentStreak: 4,
      maxStreak: 4,
      jackpotCount: 4,
    });

    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "normal" });

    expect(stats.metrics()).toMatchObject({
      firstHits: 2,
      currentStreak: 1,
      maxStreak: 4,
      jackpotCount: 5,
    });
  });

  it("keeps history newest-first and limits its length", () => {
    const stats = new SessionStats({ now: () => 1_000, historyLimit: 2 });

    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, at: 1 });
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, at: 2 });
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, at: 3 });

    const snapshot = stats.snapshot();
    expect(snapshot.jackpotCount).toBe(3);
    expect(snapshot.jackpots).toHaveLength(2);
    expect(snapshot.jackpots.map((record) => record.at)).toEqual([3, 2]);
  });

  it("samples the chart and forces a point on a jackpot", () => {
    const testClock = clock();
    const stats = new SessionStats({ now: testClock.now, chartSampleMs: 5000 });

    stats.recordLaunch();
    expect(stats.snapshot().balanceHistory).toHaveLength(1);

    testClock.advance(4999);
    stats.recordLaunch();
    expect(stats.snapshot().balanceHistory).toHaveLength(1);

    testClock.advance(1);
    stats.recordLaunch();
    expect(stats.snapshot().balanceHistory).toHaveLength(2);

    stats.recordJackpot({
      roundCount: 10,
      payoutBalls: 1500,
      phase: "normal",
      at: testClock.now(),
    });
    const points = stats.snapshot().balanceHistory;
    expect(points).toHaveLength(3);
    expect(points[points.length - 1]?.balanceYen).toBeGreaterThan(0);
  });

  it("restores an exact snapshot and keeps counting", () => {
    const testClock = clock();
    const stats = new SessionStats({ now: testClock.now });
    stats.recordLaunch(12);
    stats.recordSpin("normal");
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500, phase: "normal" });

    const restored = SessionStats.fromSnapshot(stats.snapshot(), { now: testClock.now });
    expect(restored.metrics()).toEqual(stats.metrics());
    expect(restored.snapshot().jackpots).toEqual(stats.snapshot().jackpots);

    restored.recordLaunch();
    expect(restored.metrics().launchedBalls).toBe(13);
    expect(stats.metrics().launchedBalls).toBe(12);
  });

  it("resets to a fresh session", () => {
    const stats = new SessionStats({ now: () => 1_000 });
    stats.recordLaunch(10);
    stats.recordSpin("st");
    stats.recordJackpot({ roundCount: 10, payoutBalls: 1500 });

    stats.reset();

    expect(stats.metrics()).toMatchObject({
      investedYen: DEFAULT_INITIAL_INVESTMENT_YEN,
      payoutBalls: 0,
      launchedBalls: 0,
      normalSpins: 0,
      stSpins: 0,
      firstHits: 0,
      jackpotCount: 0,
    });
    expect(stats.snapshot().balanceHistory).toHaveLength(1);
  });

  it("rejects invalid input and snapshots", () => {
    const stats = new SessionStats({ now: () => 1_000 });
    expect(() => stats.recordLaunch(0)).toThrow(/positive integer/);
    expect(() => stats.addInvestment(0)).toThrow(/positive integer/);
    expect(() => stats.recordJackpot({ roundCount: -1, payoutBalls: 0 })).toThrow(
      /non-negative integer/,
    );
    expect(() =>
      SessionStats.fromSnapshot({
        ...stats.snapshot(),
        version: 2 as unknown as 1,
      }),
    ).toThrow(/snapshot version/);
  });
});
