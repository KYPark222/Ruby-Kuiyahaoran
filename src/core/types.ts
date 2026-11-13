/**
 * Domain types for the pachinko game core.
 *
 * This module is intentionally free of DOM, Vue, Rails and physics-engine
 * dependencies so that the rules can be tested and simulated in isolation.
 */

/** High-level game phase. ST/LUSH transitions are scaffolded for a later phase. */
export type GamePhase = "normal" | "jackpot" | "st" | "lush";

/** Result of a single lottery draw. */
export type LotteryOutcome = "jackpot" | "miss";

/** Where a ball entered the game. Only the heso entrance is used in Phase 1. */
export type EntrySource = "normal" | "electric" | "attacker" | "general";

/** A lottery result that is created exactly once, at entry time. */
export interface LotteryDraw {
  readonly outcome: LotteryOutcome;
  readonly numerator: number;
  readonly denominator: number;
  /** Monotonic draw counter, useful for replay/audit logs. */
  readonly drawSequence: number;
}

/** A retained ball (hold) and the lottery result that belongs to it. */
export interface HoldEntry {
  readonly id: string;
  readonly ballId: string;
  readonly source: EntrySource;
  readonly draw: LotteryDraw;
  readonly createdAt: number;
}

/** Raw entry notification from the physics layer. */
export interface EntryEvent {
  readonly ballId: string;
  readonly source?: EntrySource;
  readonly enteredAt?: number;
}

/** Jackpot metadata. Round/ST/LUSH behaviour will be filled in later. */
export interface JackpotInfo {
  readonly roundCount: number;
  readonly payoutBalls: number;
  readonly isST: boolean;
  readonly isLUSH: boolean;
}

/** Derived payout/investment information. */
export interface PayoutInfo {
  readonly totalBalls: number;
  readonly investedYen: number;
  readonly payoutBalls: number;
  readonly differenceBalls: number;
}

/** Serializable RNG state so a game can be resumed exactly. */
export interface RandomSnapshot {
  readonly seed: string;
  readonly state: readonly [number, number, number, number];
  readonly draws: number;
}

/** Result of trying to put a ball into the hold queue. */
export type HoldAddResult =
  | { readonly accepted: true; readonly entry: HoldEntry; readonly holdCount: number }
  | {
      readonly accepted: false;
      readonly reason: "duplicate" | "full";
      readonly holdCount: number;
    };

/** Result of consuming the oldest hold. */
export interface HoldConsumeResult {
  readonly consumed: boolean;
  readonly hold?: HoldEntry;
  readonly holdCount: number;
}

/** Result returned by GameEngine.handleEntry. */
export type EntryOutcome =
  | {
      readonly accepted: true;
      readonly duplicate: false;
      readonly full: false;
      readonly entry: HoldEntry;
      readonly draw: LotteryDraw;
      readonly holdCount: number;
    }
  | {
      readonly accepted: false;
      readonly duplicate: true;
      readonly full: false;
      readonly holdCount: number;
    }
  | {
      readonly accepted: false;
      readonly duplicate: false;
      readonly full: true;
      readonly holdCount: number;
    };
