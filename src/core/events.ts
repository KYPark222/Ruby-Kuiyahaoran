import type { GamePhase, HoldEntry, LotteryDraw } from "./types";

/**
 * Domain event map. Events are plain data and can be consumed by the LCD,
 * audio or persistence layers without those layers being known to the core.
 */
export interface GameEventMap {
  "hold:added": { readonly hold: HoldEntry; readonly holdCount: number };
  "hold:consumed": { readonly hold: HoldEntry; readonly holdCount: number };
  "hold:rejected": {
    readonly ballId: string;
    readonly reason: "duplicate" | "full";
    readonly holdCount: number;
  };
  "lottery:drawn": { readonly draw: LotteryDraw; readonly ballId: string; readonly holdId: string };
  "game:phase": { readonly from: GamePhase; readonly to: GamePhase };
}

export type GameEventName = keyof GameEventMap;

export type GameEventListener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

/** Minimal synchronous event bus (no DOM EventTarget dependency). */
export class GameEventBus {
  private readonly listeners = new Map<GameEventName, Set<(payload: unknown) => void>>();

  on<K extends GameEventName>(name: K, listener: GameEventListener<K>): () => void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    this.listeners.set(name, set);
    return () => this.off(name, listener);
  }

  off<K extends GameEventName>(name: K, listener: GameEventListener<K>): void {
    const set = this.listeners.get(name);
    if (!set) return;
    set.delete(listener as (payload: unknown) => void);
    if (set.size === 0) this.listeners.delete(name);
  }

  emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
