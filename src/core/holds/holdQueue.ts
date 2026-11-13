import type {
  EntrySource,
  HoldAddResult,
  HoldConsumeResult,
  HoldEntry,
  LotteryDraw,
} from "../types";

export interface HoldQueueSnapshot {
  readonly entries: readonly HoldEntry[];
  readonly seenBallIds: readonly string[];
  readonly sequence: number;
}

export interface HoldQueueOptions {
  readonly limit: number;
  /** Number of processed ball IDs kept for duplicate detection. */
  readonly processedLimit?: number;
  readonly idFactory?: (sequence: number) => string;
  readonly now?: () => number;
  readonly snapshot?: HoldQueueSnapshot;
}

export interface HoldQueueInput {
  readonly ballId: string;
  readonly source?: EntrySource;
  readonly draw: LotteryDraw;
  readonly createdAt?: number;
}

const DEFAULT_PROCESSED_LIMIT = 200;

/**
 * FIFO hold queue.
 *
 * - A hold owns the lottery draw made at entry; consuming never redraws.
 * - Ball IDs remain "seen" after consumption so a repeated entry event cannot
 *   create a second hold.
 * - When full, the incoming ball is rejected and no draw is performed by the
 *   caller (GameEngine checks capacity before drawing).
 */
export class HoldQueue {
  readonly limit: number;
  private readonly processedLimit: number;
  private readonly idFactory: (sequence: number) => string;
  private readonly now: () => number;
  private entries: HoldEntry[];
  private readonly seenBallIds = new Set<string>();
  private readonly holdIds = new Set<string>();
  private sequence: number;

  constructor(options: HoldQueueOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError("hold limit must be a positive integer");
    }
    this.limit = options.limit;
    this.processedLimit = options.processedLimit ?? DEFAULT_PROCESSED_LIMIT;
    if (!Number.isInteger(this.processedLimit) || this.processedLimit < 1) {
      throw new RangeError("processedLimit must be a positive integer");
    }
    this.idFactory = options.idFactory ?? ((value) => `hold-${String(value).padStart(4, "0")}`);
    this.now = options.now ?? (() => Date.now());

    const snapshot = options.snapshot;
    this.entries = snapshot ? snapshot.entries.map((entry) => ({ ...entry })) : [];
    this.sequence = snapshot?.sequence ?? 0;
    if (!Number.isInteger(this.sequence) || this.sequence < 0) {
      throw new RangeError("hold sequence must be a non-negative integer");
    }
    if (this.entries.length > this.limit) {
      throw new RangeError("snapshot contains more holds than the limit");
    }

    for (const entry of this.entries) {
      this.holdIds.add(entry.id);
      this.seenBallIds.add(entry.ballId);
      this.sequence = Math.max(this.sequence, Number(entry.id.replace(/\D/g, "")) || 0);
    }
    for (const ballId of snapshot?.seenBallIds ?? []) {
      this.seenBallIds.add(ballId);
    }
    this.trimProcessedBallIds();
  }

  get size(): number {
    return this.entries.length;
  }

  get isFull(): boolean {
    return this.entries.length >= this.limit;
  }

  hasBall(ballId: string): boolean {
    return this.seenBallIds.has(ballId);
  }

  peek(): HoldEntry | undefined {
    return this.entries[0];
  }

  toArray(): readonly HoldEntry[] {
    return [...this.entries];
  }

  add(input: HoldQueueInput): HoldAddResult {
    const ballId = input.ballId.trim();
    if (ballId.length === 0 || ballId.length > 80) {
      throw new RangeError("ballId must be between 1 and 80 characters");
    }

    if (this.seenBallIds.has(ballId)) {
      return { accepted: false, reason: "duplicate", holdCount: this.size };
    }

    // Match the legacy Rails behaviour: a ball that reached a full hold is
    // still recorded as processed, so a repeated event cannot fill a later slot.
    this.seenBallIds.add(ballId);
    this.trimProcessedBallIds();

    if (this.isFull) {
      return { accepted: false, reason: "full", holdCount: this.size };
    }

    this.sequence += 1;
    const id = this.idFactory(this.sequence);
    if (this.holdIds.has(id)) {
      throw new Error(`duplicate hold id generated: ${id}`);
    }
    this.holdIds.add(id);

    const entry: HoldEntry = {
      id,
      ballId,
      source: input.source ?? "normal",
      draw: { ...input.draw },
      createdAt: input.createdAt ?? this.now(),
    };
    this.entries.push(entry);
    return { accepted: true, entry, holdCount: this.size };
  }

  /** Remove and return the oldest hold. Never performs a lottery draw. */
  consume(): HoldConsumeResult {
    const hold = this.entries.shift();
    if (!hold) {
      return { consumed: false, holdCount: this.size };
    }
    this.holdIds.delete(hold.id);
    return { consumed: true, hold, holdCount: this.size };
  }

  clear(): void {
    this.entries = [];
    this.holdIds.clear();
    this.seenBallIds.clear();
    this.sequence = 0;
  }

  snapshot(): HoldQueueSnapshot {
    return {
      entries: this.entries.map((entry) => ({ ...entry, draw: { ...entry.draw } })),
      seenBallIds: [...this.seenBallIds],
      sequence: this.sequence,
    };
  }

  private trimProcessedBallIds(): void {
    while (this.seenBallIds.size > this.processedLimit) {
      const oldest = this.seenBallIds.values().next().value;
      if (oldest === undefined) return;
      this.seenBallIds.delete(oldest);
    }
  }
}
