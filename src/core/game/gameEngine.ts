import { GameEventBus, type GameEventListener, type GameEventName } from "../events";
import { HoldQueue, type HoldQueueSnapshot } from "../holds/holdQueue";
import { createLotteryEngine, type LotteryEngine } from "../lottery/lottery";
import { SeededRandom } from "../rng/seededRandom";
import type { MachineSpec } from "../specs/schema";
import type {
  EntryEvent,
  EntryOutcome,
  GamePhase,
  HoldConsumeResult,
  RandomSnapshot,
} from "../types";
import { GameStateMachine, type GameStateMachineSnapshot } from "./stateMachine";

export interface GameEngineSnapshot {
  readonly version: 1;
  readonly specId: string;
  readonly specSchemaVersion: number;
  readonly rng: RandomSnapshot;
  readonly holds: HoldQueueSnapshot;
  readonly lotteryDrawSequence: number;
  readonly machine: GameStateMachineSnapshot;
}

export interface GameEngineOptions {
  readonly spec: MachineSpec;
  readonly seed: string | number;
  readonly events?: GameEventBus;
  readonly now?: () => number;
  readonly idFactory?: (sequence: number) => string;
  readonly processedLimit?: number;
  readonly snapshot?: GameEngineSnapshot;
}

/**
 * Composition root for the DOM-free game core.
 *
 * The engine draws exactly once per accepted entry and stores that draw on the
 * hold. Consuming a hold simply returns the stored draw.
 */
export class GameEngine {
  readonly spec: MachineSpec;
  private readonly bus: GameEventBus;
  private rng: SeededRandom;
  private lottery: LotteryEngine;
  private readonly holds: HoldQueue;
  private readonly machine: GameStateMachine;
  private readonly now: () => number;
  private readonly processedLimit?: number;
  private readonly idFactory?: (sequence: number) => string;
  private readonly seedText: string;

  constructor(options: GameEngineOptions) {
    this.spec = options.spec;
    this.bus = options.events ?? new GameEventBus();
    this.now = options.now ?? (() => Date.now());
    this.processedLimit = options.processedLimit;
    this.idFactory = options.idFactory;

    const snapshot = options.snapshot;
    if (snapshot) {
      if (snapshot.version !== 1) {
        throw new RangeError(`unsupported game snapshot version: ${String(snapshot.version)}`);
      }
      if (
        snapshot.specId !== options.spec.id ||
        snapshot.specSchemaVersion !== options.spec.schemaVersion
      ) {
        throw new Error("game snapshot belongs to a different machine specification");
      }
    }

    this.seedText = snapshot?.rng.seed ?? String(options.seed);
    this.rng = snapshot ? SeededRandom.fromSnapshot(snapshot.rng) : new SeededRandom(this.seedText);
    this.holds = new HoldQueue({
      limit: options.spec.holdLimit,
      processedLimit: options.processedLimit,
      idFactory: options.idFactory,
      now: this.now,
      snapshot: snapshot?.holds,
    });
    this.lottery = createLotteryEngine({
      spec: options.spec,
      rng: this.rng,
      drawSequence: snapshot?.lotteryDrawSequence ?? 0,
    });
    this.machine = new GameStateMachine(options.spec, {
      events: this.bus,
      snapshot: snapshot?.machine,
    });
  }

  static create(options: GameEngineOptions): GameEngine {
    return new GameEngine(options);
  }

  static fromSnapshot(
    snapshot: GameEngineSnapshot,
    options: Omit<GameEngineOptions, "seed" | "snapshot">,
  ): GameEngine {
    return new GameEngine({ ...options, seed: snapshot.rng.seed, snapshot });
  }

  get seed(): string {
    return this.seedText;
  }

  get holdCount(): number {
    return this.holds.size;
  }

  get phase(): GamePhase {
    return this.machine.currentPhase;
  }

  get jackpotCount(): number {
    return this.machine.state.jackpotCount;
  }

  get totalPayoutBalls(): number {
    return this.machine.totalPayout;
  }

  /** Number of lottery draws performed since the engine was created. */
  get drawCount(): number {
    return this.lottery.drawCount;
  }

  /** Ball IDs already processed, including consumed holds. */
  hasProcessedBall(ballId: string): boolean {
    return this.holds.hasBall(ballId);
  }

  on<K extends GameEventName>(name: K, listener: GameEventListener<K>): () => void {
    return this.bus.on(name, listener);
  }

  off<K extends GameEventName>(name: K, listener: GameEventListener<K>): void {
    this.bus.off(name, listener);
  }

  /**
   * Handle a heso entry. Duplicate and full cases are rejected before any
   * random draw, so they cannot silently advance the lottery sequence.
   */
  handleEntry(event: EntryEvent): EntryOutcome {
    const ballId = event.ballId.trim();
    if (ballId.length === 0 || ballId.length > 80) {
      throw new RangeError("ballId must be between 1 and 80 characters");
    }

    if (this.holds.hasBall(ballId)) {
      this.bus.emit("hold:rejected", {
        ballId,
        reason: "duplicate",
        holdCount: this.holds.size,
      });
      return {
        accepted: false,
        duplicate: true,
        full: false,
        holdCount: this.holds.size,
      };
    }

    if (this.holds.isFull) {
      this.bus.emit("hold:rejected", {
        ballId,
        reason: "full",
        holdCount: this.holds.size,
      });
      return {
        accepted: false,
        duplicate: false,
        full: true,
        holdCount: this.holds.size,
      };
    }

    const draw = this.lottery.drawNormal();
    const added = this.holds.add({
      ballId,
      source: event.source ?? "normal",
      draw,
      createdAt: event.enteredAt ?? this.now(),
    });

    if (!added.accepted) {
      this.bus.emit("hold:rejected", {
        ballId,
        reason: added.reason,
        holdCount: added.holdCount,
      });
      if (added.reason === "duplicate") {
        return {
          accepted: false,
          duplicate: true,
          full: false,
          holdCount: added.holdCount,
        };
      }
      return {
        accepted: false,
        duplicate: false,
        full: true,
        holdCount: added.holdCount,
      };
    }

    this.bus.emit("lottery:drawn", {
      draw,
      ballId,
      holdId: added.entry.id,
    });
    this.bus.emit("hold:added", { hold: added.entry, holdCount: added.holdCount });

    return {
      accepted: true,
      duplicate: false,
      full: false,
      entry: added.entry,
      draw,
      holdCount: added.holdCount,
    };
  }

  /** Consume the oldest hold. The stored draw is returned; no redraw occurs. */
  consumeHold(): HoldConsumeResult {
    const result = this.holds.consume();
    if (result.consumed && result.hold) {
      if (result.hold.draw.outcome === "jackpot") {
        this.machine.recordJackpot();
      }
      this.bus.emit("hold:consumed", {
        hold: result.hold,
        holdCount: result.holdCount,
      });
    }
    return result;
  }

  /** Rebuild from a snapshot, or start a fresh deterministic game. */
  reset(seed: string | number = this.seedText): void {
    this.rng = new SeededRandom(seed);
    this.lottery = createLotteryEngine({ spec: this.spec, rng: this.rng });
    this.holds.clear();
    this.machine.reset();
  }

  snapshot(): GameEngineSnapshot {
    return {
      version: 1,
      specId: this.spec.id,
      specSchemaVersion: this.spec.schemaVersion,
      rng: this.rng.snapshot(),
      holds: this.holds.snapshot(),
      lotteryDrawSequence: this.lottery.drawCount,
      machine: this.machine.snapshot(),
    };
  }

  /** Options needed to rebuild this engine (used by the browser adapter). */
  createOptions(): GameEngineOptions {
    return {
      spec: this.spec,
      seed: this.seedText,
      events: this.bus,
      now: this.now,
      idFactory: this.idFactory,
      processedLimit: this.processedLimit,
    };
  }
}
