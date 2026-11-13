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

function installFakeWindow(href: string, storage: Storage): void {
  vi.stubGlobal("window", {
    location: { href },
    sessionStorage: storage,
  });
}

describe("browser adapter with a session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("initializes from a URL seed, stores the drawn hold and restores it", async () => {
    const storage = new MemoryStorage();
    installFakeWindow("http://localhost/?core=1&seed=integration-seed", storage);

    const { PachinkoGameCore } = await import("../../src/integration/browserAdapter");

    expect(PachinkoGameCore.enabled).toBe(true);
    expect(PachinkoGameCore.seed()).toBe("integration-seed");

    const entry = PachinkoGameCore.handleEntry({ ballId: "ball-1" });
    expect(entry.accepted).toBe(true);
    if (!entry.accepted) throw new Error("expected entry");
    expect(PachinkoGameCore.holdCount()).toBe(1);
    expect(storage.getItem("pachinko:game-core:v1")).toContain("integration-seed");

    // Simulate a reload: the module is re-evaluated and must restore the
    // stored draw instead of drawing again.
    vi.resetModules();
    const reloaded = await import("../../src/integration/browserAdapter");
    expect(reloaded.PachinkoGameCore.holdCount()).toBe(1);

    const consumed = reloaded.PachinkoGameCore.consumeHold();
    expect(consumed.consumed).toBe(true);
    expect(consumed.hold?.draw).toEqual(entry.entry.draw);
    expect(reloaded.PachinkoGameCore.snapshot().lotteryDrawSequence).toBe(1);
  });

  it("can be disabled with ?core=0", async () => {
    const storage = new MemoryStorage();
    installFakeWindow("http://localhost/?core=0", storage);

    const { PachinkoGameCore } = await import("../../src/integration/browserAdapter");

    expect(PachinkoGameCore.enabled).toBe(false);
    expect(() => PachinkoGameCore.handleEntry({ ballId: "ball-1" })).toThrow(/disabled/);
  });
});
