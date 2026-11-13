import type { GameEventBus } from "../events";
import type { MachineSpec } from "../specs/schema";
import type { GamePhase, JackpotInfo } from "../types";

export interface GameStateMachineSnapshot {
  readonly phase: GamePhase;
  readonly jackpotCount: number;
  readonly round: number;
  readonly stSpinsRemaining: number;
  readonly totalPayoutBalls: number;
}

export interface GameStateMachineOptions {
  readonly events?: GameEventBus;
  readonly snapshot?: GameStateMachineSnapshot;
}

const PHASES: readonly GamePhase[] = ["normal", "jackpot", "st", "lush"];

const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  normal: ["jackpot", "st", "lush"],
  jackpot: ["jackpot", "st", "lush", "normal"],
  st: ["jackpot", "lush", "normal"],
  lush: ["jackpot", "st", "normal"],
};

/**
 * Explicit phase machine for 通常 / 大当たり / ST / LUSH.
 *
 * Full round, continuation and payout rules are intentionally left for the
 * next phase; this class provides the guarded transitions and persisted state.
 */
export class GameStateMachine {
  private readonly spec: MachineSpec;
  private readonly events?: GameEventBus;
  private phase: GamePhase = "normal";
  private jackpotCount = 0;
  private round = 0;
  private stSpinsRemaining = 0;
  private totalPayoutBalls = 0;

  constructor(spec: MachineSpec, options: GameStateMachineOptions = {}) {
    this.spec = spec;
    this.events = options.events;
    if (options.snapshot) {
      this.restore(options.snapshot);
    }
  }

  get state(): GameStateMachineSnapshot {
    return {
      phase: this.phase,
      jackpotCount: this.jackpotCount,
      round: this.round,
      stSpinsRemaining: this.stSpinsRemaining,
      totalPayoutBalls: this.totalPayoutBalls,
    };
  }

  get currentPhase(): GamePhase {
    return this.phase;
  }

  get totalPayout(): number {
    return this.totalPayoutBalls;
  }

  canTransitionTo(next: GamePhase): boolean {
    return ALLOWED_TRANSITIONS[this.phase].includes(next);
  }

  /** Register a jackpot and move to the jackpot phase. */
  recordJackpot(): JackpotInfo {
    this.transitionTo("jackpot");
    this.jackpotCount += 1;
    this.round = 1;
    return {
      roundCount: this.spec.payout.roundCount,
      payoutBalls: this.spec.payout.jackpotBalls,
      isST: this.spec.states.st.enabled,
      isLUSH: this.spec.states.lush.enabled,
    };
  }

  /** End the jackpot phase, entering ST when the machine enables it. */
  finishJackpot(): void {
    if (this.phase !== "jackpot") {
      throw new Error(`cannot finish jackpot from phase ${this.phase}`);
    }
    this.round = 0;
    if (this.spec.states.st.enabled && this.spec.states.st.spins > 0) {
      this.enterST(this.spec.states.st.spins);
    } else {
      this.transitionTo("normal");
    }
  }

  enterST(spins = this.spec.states.st.spins): void {
    if (!this.spec.states.st.enabled) {
      throw new Error("ST is not enabled for this machine");
    }
    if (!Number.isInteger(spins) || spins <= 0) {
      throw new RangeError("ST spin count must be a positive integer");
    }
    this.transitionTo("st");
    this.stSpinsRemaining = spins;
  }

  enterLUSH(): void {
    if (!this.spec.states.lush.enabled) {
      throw new Error("LUSH is not enabled for this machine");
    }
    this.transitionTo("lush");
  }

  returnToNormal(): void {
    this.transitionTo("normal");
    this.stSpinsRemaining = 0;
    this.round = 0;
  }

  recordPayout(balls: number): void {
    if (!Number.isInteger(balls) || balls < 0) {
      throw new RangeError("payout must be a non-negative integer");
    }
    this.totalPayoutBalls += balls;
  }

  /** Consume one ST spin; returns the remaining count. */
  consumeStSpin(): number {
    if (this.phase !== "st") {
      throw new Error(`cannot consume an ST spin from phase ${this.phase}`);
    }
    this.stSpinsRemaining = Math.max(0, this.stSpinsRemaining - 1);
    if (this.stSpinsRemaining === 0) {
      this.returnToNormal();
    }
    return this.stSpinsRemaining;
  }

  reset(): void {
    this.phase = "normal";
    this.jackpotCount = 0;
    this.round = 0;
    this.stSpinsRemaining = 0;
    this.totalPayoutBalls = 0;
  }

  snapshot(): GameStateMachineSnapshot {
    return this.state;
  }

  private transitionTo(next: GamePhase): void {
    if (!PHASES.includes(next)) {
      throw new RangeError(`unknown game phase: ${String(next)}`);
    }
    if (!this.canTransitionTo(next)) {
      throw new Error(`illegal phase transition: ${this.phase} -> ${next}`);
    }
    const from = this.phase;
    this.phase = next;
    this.events?.emit("game:phase", { from, to: next });
  }

  private restore(snapshot: GameStateMachineSnapshot): void {
    if (!PHASES.includes(snapshot.phase)) {
      throw new RangeError(`unknown game phase in snapshot: ${String(snapshot.phase)}`);
    }
    if (
      !Number.isInteger(snapshot.jackpotCount) ||
      !Number.isInteger(snapshot.round) ||
      !Number.isInteger(snapshot.stSpinsRemaining) ||
      !Number.isInteger(snapshot.totalPayoutBalls) ||
      snapshot.jackpotCount < 0 ||
      snapshot.round < 0 ||
      snapshot.stSpinsRemaining < 0 ||
      snapshot.totalPayoutBalls < 0
    ) {
      throw new RangeError("game state snapshot contains invalid counters");
    }
    this.phase = snapshot.phase;
    this.jackpotCount = snapshot.jackpotCount;
    this.round = snapshot.round;
    this.stSpinsRemaining = snapshot.stSpinsRemaining;
    this.totalPayoutBalls = snapshot.totalPayoutBalls;
  }
}
