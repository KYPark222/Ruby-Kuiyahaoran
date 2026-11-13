import { afterEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function installFakeWindow(storage: Storage): void {
  vi.stubGlobal("window", {
    location: { href: "http://localhost/" },
    sessionStorage: storage,
  });
}

describe("session stats browser store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("persists the ledger and restores it after a reload", async () => {
    const storage = new MemoryStorage();
    installFakeWindow(storage);

    const { PachinkoSessionStats } = await import("../../src/integration/sessionStatsStore");
    expect(PachinkoSessionStats.metrics().currentBalls).toBe(750);

    PachinkoSessionStats.recordLaunch(10);
    PachinkoSessionStats.recordSpin("normal");
    PachinkoSessionStats.recordJackpot({
      roundCount: 10,
      payoutBalls: 1500,
      phase: "normal",
    });

    expect(storage.getItem("pachinko:session-stats:v1")).toContain("balanceHistory");

    vi.resetModules();
    const reloaded = await import("../../src/integration/sessionStatsStore");
    expect(reloaded.PachinkoSessionStats.metrics()).toMatchObject({
      launchedBalls: 10,
      normalSpins: 1,
      payoutBalls: 1500,
      jackpotCount: 1,
    });
  });

  it("clears persisted stats on reset", async () => {
    const storage = new MemoryStorage();
    installFakeWindow(storage);

    const { PachinkoSessionStats } = await import("../../src/integration/sessionStatsStore");
    PachinkoSessionStats.recordLaunch(3);
    expect(storage.getItem("pachinko:session-stats:v1")).not.toBeNull();

    PachinkoSessionStats.clear();

    expect(storage.getItem("pachinko:session-stats:v1")).toBeNull();
    expect(PachinkoSessionStats.metrics().launchedBalls).toBe(0);
  });
});
