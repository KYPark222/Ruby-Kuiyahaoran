import {
  buildBalanceChartGeometry,
  type BalanceChartGeometry,
  type BalanceChartOptions,
} from "../core/stats/balanceChart";
import {
  SessionStats,
  type JackpotRecord,
  type SessionJackpotInput,
  type SessionStatsMetrics,
  type SessionStatsSnapshot,
} from "../core/stats/sessionStats";
import type { GamePhase } from "../core/types";

const STORAGE_KEY = "pachinko:session-stats:v1";
const VERSION = "0.1.0-phase1";

export interface PachinkoSessionStatsApi {
  readonly version: string;
  snapshot(): SessionStatsSnapshot;
  metrics(): SessionStatsMetrics;
  recordLaunch(count?: number): SessionStatsSnapshot;
  recordSpin(phase?: GamePhase): SessionStatsSnapshot;
  recordJackpot(input: SessionJackpotInput): JackpotRecord;
  addInvestment(yen?: number): SessionStatsSnapshot;
  reset(): SessionStatsSnapshot;
  clear(): void;
  subscribe(listener: (snapshot: SessionStatsSnapshot) => void): () => void;
  chartGeometry(options: BalanceChartOptions): BalanceChartGeometry;
}

declare global {
  interface Window {
    PachinkoSessionStats?: PachinkoSessionStatsApi;
  }
}

let stats: SessionStats | null = null;
const listeners = new Set<(snapshot: SessionStatsSnapshot) => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readSnapshot(): SessionStatsSnapshot | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const snapshot = parsed as Partial<SessionStatsSnapshot>;
    if (snapshot.version !== 1) return null;
    return snapshot as SessionStatsSnapshot;
  } catch {
    return null;
  }
}

function persist(snapshot: SessionStatsSnapshot): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage may be full or disabled; the in-memory ledger remains usable.
  }
}

function ensure(): SessionStats {
  if (stats) return stats;

  const stored = readSnapshot();
  if (stored) {
    try {
      stats = SessionStats.fromSnapshot(stored);
      return stats;
    } catch (error) {
      console.warn("[PachinkoSessionStats] discarding incompatible snapshot", error);
    }
  }

  stats = new SessionStats();
  return stats;
}

function commit(): SessionStatsSnapshot {
  const snapshot = ensure().snapshot();
  persist(snapshot);
  for (const listener of [...listeners]) {
    listener(snapshot);
  }
  return snapshot;
}

export const PachinkoSessionStats: PachinkoSessionStatsApi = {
  version: VERSION,
  snapshot(): SessionStatsSnapshot {
    return ensure().snapshot();
  },
  metrics(): SessionStatsMetrics {
    return ensure().metrics();
  },
  recordLaunch(count = 1): SessionStatsSnapshot {
    ensure().recordLaunch(count);
    return commit();
  },
  recordSpin(phase: GamePhase = "normal"): SessionStatsSnapshot {
    ensure().recordSpin(phase);
    return commit();
  },
  recordJackpot(input: SessionJackpotInput): JackpotRecord {
    const record = ensure().recordJackpot(input);
    commit();
    return record;
  },
  addInvestment(yen?: number): SessionStatsSnapshot {
    ensure().addInvestment(yen);
    return commit();
  },
  reset(): SessionStatsSnapshot {
    stats = new SessionStats();
    return commit();
  },
  clear(): void {
    if (isBrowser()) {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    stats = null;
  },
  subscribe(listener: (snapshot: SessionStatsSnapshot) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  chartGeometry(options: BalanceChartOptions): BalanceChartGeometry {
    return buildBalanceChartGeometry(ensure().snapshot().balanceHistory, options);
  },
};

export function installSessionStats(): void {
  if (!isBrowser()) return;
  try {
    ensure();
  } catch (error) {
    console.error("[PachinkoSessionStats] initialization failed", error);
  }
  window.PachinkoSessionStats = PachinkoSessionStats;
}
