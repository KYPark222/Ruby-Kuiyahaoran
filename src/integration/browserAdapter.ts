import type { GameEventListener, GameEventName } from "../core/events";
import { GameEngine, type GameEngineSnapshot } from "../core/game/gameEngine";
import { getOriginalMachineSpec, type MachineSpec } from "../core/specs/schema";
import type {
  EntryEvent,
  EntryOutcome,
  GamePhase,
  HoldConsumeResult,
  JackpotInfo,
} from "../core/types";
import { installSessionStats } from "./sessionStatsStore";

const STORAGE_KEY = "pachinko:game-core:v1";
const VERSION = "0.1.0-phase1";

export interface PachinkoGameCoreApi {
  readonly version: string;
  readonly enabled: boolean;
  readonly error: string | null;
  isEnabled(): boolean;
  holdCount(): number;
  phase(): GamePhase;
  seed(): string;
  jackpotInfo(): JackpotInfo;
  handleEntry(event: EntryEvent): EntryOutcome;
  consumeHold(): HoldConsumeResult;
  snapshot(): GameEngineSnapshot;
  reset(seed?: string): void;
  clear(): void;
  subscribe<K extends GameEventName>(name: K, listener: GameEventListener<K>): () => void;
}

declare global {
  interface Window {
    PachinkoGameCore?: PachinkoGameCoreApi;
  }
}

let engine: GameEngine | null = null;
let enabled = false;
let initError: string | null = null;
let cachedSpec: MachineSpec | null = null;

function getSpec(): MachineSpec {
  cachedSpec ??= getOriginalMachineSpec();
  return cachedSpec;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getQueryParam(name: string): string | null {
  if (!isBrowser()) return null;
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function getUrlSeed(): string | null {
  const value = getQueryParam("seed")?.trim();
  return value ? value : null;
}

function createSeed(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const values = new Uint32Array(2);
    cryptoApi.getRandomValues(values);
    return `${values[0]?.toString(36) ?? "0"}${values[1]?.toString(36) ?? "0"}`;
  }
  return `seed-${Date.now()}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function storageAvailable(): boolean {
  if (!isBrowser()) return false;
  try {
    const probe = `${STORAGE_KEY}:probe`;
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readSnapshot(): GameEngineSnapshot | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const snapshot = parsed as Partial<GameEngineSnapshot>;
    if (snapshot.version !== 1) return null;
    return snapshot as GameEngineSnapshot;
  } catch {
    return null;
  }
}

function persist(): void {
  if (!engine || !isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(engine.snapshot()));
  } catch {
    // Storage may be full or disabled; the in-memory engine remains usable.
  }
}

function createEngine(): GameEngine {
  const spec = getSpec();
  const urlSeed = getUrlSeed();
  const stored = readSnapshot();

  if (stored) {
    try {
      if (!urlSeed || stored.rng.seed === urlSeed) {
        return GameEngine.fromSnapshot(stored, { spec });
      }
    } catch (error) {
      console.warn("[PachinkoGameCore] discarding incompatible snapshot", error);
    }
  }

  return GameEngine.create({ spec, seed: urlSeed ?? createSeed() });
}

function ensureEngine(): GameEngine {
  engine ??= createEngine();
  return engine;
}

function shouldEnable(): boolean {
  const flag = getQueryParam("core");
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return isBrowser() && storageAvailable();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const PachinkoGameCore: PachinkoGameCoreApi = {
  version: VERSION,
  get enabled(): boolean {
    return enabled;
  },
  get error(): string | null {
    return initError;
  },
  isEnabled(): boolean {
    return enabled;
  },
  holdCount(): number {
    return enabled ? ensureEngine().holdCount : 0;
  },
  phase(): GamePhase {
    return enabled ? ensureEngine().phase : "normal";
  },
  seed(): string {
    return enabled ? ensureEngine().seed : "";
  },
  jackpotInfo(): JackpotInfo {
    const spec = getSpec();
    return {
      roundCount: spec.payout.roundCount,
      payoutBalls: spec.payout.jackpotBalls,
      isST: spec.states.st.enabled,
      isLUSH: spec.states.lush.enabled,
    };
  },
  handleEntry(event: EntryEvent): EntryOutcome {
    if (!enabled) throw new Error("Pachinko game core is disabled");
    const result = ensureEngine().handleEntry(event);
    persist();
    return result;
  },
  consumeHold(): HoldConsumeResult {
    if (!enabled) throw new Error("Pachinko game core is disabled");
    const result = ensureEngine().consumeHold();
    persist();
    return result;
  },
  snapshot(): GameEngineSnapshot {
    if (!enabled) throw new Error("Pachinko game core is disabled");
    return ensureEngine().snapshot();
  },
  reset(seed?: string): void {
    if (!enabled) return;
    const nextSeed = seed?.trim() || getUrlSeed() || createSeed();
    engine = GameEngine.create({ spec: getSpec(), seed: nextSeed });
    persist();
  },
  clear(): void {
    if (isBrowser()) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    engine = null;
  },
  subscribe<K extends GameEventName>(name: K, listener: GameEventListener<K>): () => void {
    if (!enabled) return () => undefined;
    return ensureEngine().on(name, listener);
  },
};

export function installGameCore(): void {
  if (!isBrowser()) return;
  try {
    enabled = shouldEnable();
    if (enabled) ensureEngine();
  } catch (error) {
    enabled = false;
    initError = toErrorMessage(error);
    console.error("[PachinkoGameCore] initialization failed", error);
  }
  window.PachinkoGameCore = PachinkoGameCore;
}

installGameCore();
installSessionStats();
