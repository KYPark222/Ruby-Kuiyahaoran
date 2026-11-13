import type { GamePhase } from "../types";

/**
 * Session analytics for the dashboard.
 *
 * This module is deliberately DOM-free. It only models the player-facing
 * accounting rules (balls, investment, payouts and jackpot history) so the
 * browser adapter and tests can use the same implementation.
 */

export type JackpotKind = "first" | "st" | "lush";

export interface JackpotRecord {
  readonly id: string;
  readonly at: number;
  readonly roundCount: number;
  readonly payoutBalls: number;
  readonly kind: JackpotKind;
}

export interface BalancePoint {
  readonly at: number;
  readonly balanceYen: number;
  readonly differenceBalls: number;
}

export interface SessionStatsSnapshot {
  readonly version: 1;
  readonly startedAt: number;
  readonly investedYen: number;
  readonly payoutBalls: number;
  readonly launchedBalls: number;
  readonly normalSpins: number;
  readonly stSpins: number;
  readonly firstHits: number;
  readonly lushEntries: number;
  readonly currentStreak: number;
  readonly maxStreak: number;
  readonly jackpotCount: number;
  readonly lastJackpotKind: JackpotKind | null;
  readonly jackpots: readonly JackpotRecord[];
  readonly balanceHistory: readonly BalancePoint[];
  readonly lastChartPointAt: number;
}

export interface SessionStatsMetrics {
  readonly investedYen: number;
  readonly purchasedBalls: number;
  readonly payoutBalls: number;
  readonly launchedBalls: number;
  readonly currentBalls: number;
  readonly differenceBalls: number;
  readonly balanceYen: number;
  readonly normalSpins: number;
  readonly stSpins: number;
  readonly firstHits: number;
  readonly lushEntries: number;
  readonly currentStreak: number;
  readonly maxStreak: number;
  readonly jackpotCount: number;
}

export interface SessionJackpotInput {
  readonly roundCount: number;
  readonly payoutBalls: number;
  readonly phase?: GamePhase;
  readonly at?: number;
}

export interface SessionStatsOptions {
  /** Money loaded when the session starts. Defaults to ¥3,000. */
  readonly initialInvestmentYen?: number;
  /** Amount added by the 追加投資 button. Defaults to ¥1,000. */
  readonly investmentUnitYen?: number;
  /** Exchange value of one ball. Defaults to ¥4. */
  readonly yenPerBall?: number;
  /** Minimum time between chart samples. Defaults to 5 seconds. */
  readonly chartSampleMs?: number;
  /** Maximum chart points retained. Defaults to 360. */
  readonly chartPointLimit?: number;
  /** Maximum jackpot history rows retained. Defaults to 20. */
  readonly historyLimit?: number;
  readonly now?: () => number;
  readonly snapshot?: SessionStatsSnapshot;
}

export const DEFAULT_INITIAL_INVESTMENT_YEN = 3000;
export const DEFAULT_INVESTMENT_UNIT_YEN = 1000;
export const DEFAULT_YEN_PER_BALL = 4;
export const DEFAULT_CHART_SAMPLE_MS = 5000;
export const DEFAULT_CHART_POINT_LIMIT = 360;
export const DEFAULT_HISTORY_LIMIT = 20;

const JACKPOT_KINDS: readonly JackpotKind[] = ["first", "st", "lush"];

export class SessionStats {
  private readonly initialInvestmentYen: number;
  private readonly investmentUnitYen: number;
  private readonly yenPerBall: number;
  private readonly chartSampleMs: number;
  private readonly chartPointLimit: number;
  private readonly historyLimit: number;
  private readonly now: () => number;

  private startedAt = 0;
  private investedYen = 0;
  private payoutBalls = 0;
  private launchedBalls = 0;
  private normalSpins = 0;
  private stSpins = 0;
  private firstHits = 0;
  private lushEntries = 0;
  private currentStreak = 0;
  private maxStreak = 0;
  private jackpotCount = 0;
  private lastJackpotKind: JackpotKind | null = null;
  private jackpots: JackpotRecord[] = [];
  private balanceHistory: BalancePoint[] = [];
  private lastChartPointAt = 0;

  constructor(options: SessionStatsOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.yenPerBall = positiveInteger(options.yenPerBall ?? DEFAULT_YEN_PER_BALL, "yenPerBall");
    this.investmentUnitYen = positiveInteger(
      options.investmentUnitYen ?? DEFAULT_INVESTMENT_UNIT_YEN,
      "investmentUnitYen",
    );
    this.initialInvestmentYen = nonNegativeInteger(
      options.initialInvestmentYen ?? DEFAULT_INITIAL_INVESTMENT_YEN,
      "initialInvestmentYen",
    );
    this.chartSampleMs = nonNegativeInteger(
      options.chartSampleMs ?? DEFAULT_CHART_SAMPLE_MS,
      "chartSampleMs",
    );
    this.chartPointLimit = positiveInteger(
      options.chartPointLimit ?? DEFAULT_CHART_POINT_LIMIT,
      "chartPointLimit",
    );
    this.historyLimit = positiveInteger(
      options.historyLimit ?? DEFAULT_HISTORY_LIMIT,
      "historyLimit",
    );

    if (options.snapshot) {
      this.restore(options.snapshot);
    } else {
      this.reset();
    }
  }

  static fromSnapshot(
    snapshot: SessionStatsSnapshot,
    options: Omit<SessionStatsOptions, "snapshot"> = {},
  ): SessionStats {
    return new SessionStats({ ...options, snapshot });
  }

  get investedYenTotal(): number {
    return this.investedYen;
  }

  get unitYen(): number {
    return this.investmentUnitYen;
  }

  /** Derived, display-ready numbers. */
  metrics(): SessionStatsMetrics {
    const purchasedBalls = Math.floor(this.investedYen / this.yenPerBall);
    const differenceBalls = this.payoutBalls - this.launchedBalls;
    return {
      investedYen: this.investedYen,
      purchasedBalls,
      payoutBalls: this.payoutBalls,
      launchedBalls: this.launchedBalls,
      currentBalls: Math.max(0, purchasedBalls + this.payoutBalls - this.launchedBalls),
      differenceBalls,
      balanceYen: differenceBalls * this.yenPerBall,
      normalSpins: this.normalSpins,
      stSpins: this.stSpins,
      firstHits: this.firstHits,
      lushEntries: this.lushEntries,
      currentStreak: this.currentStreak,
      maxStreak: this.maxStreak,
      jackpotCount: this.jackpotCount,
    };
  }

  /** Record one or more launched balls. */
  recordLaunch(count = 1): void {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError("launch count must be a positive integer");
    }
    this.launchedBalls += count;
    this.maybeRecordBalancePoint(this.now());
  }

  /** Record a processed spin. ST spins are separated from normal spins. */
  recordSpin(phase: GamePhase = "normal"): void {
    if (phase === "st") {
      this.stSpins += 1;
    } else {
      this.normalSpins += 1;
    }
  }

  /** Record a jackpot and add its payout to the session ledger. */
  recordJackpot(input: SessionJackpotInput): JackpotRecord {
    const roundCount = nonNegativeInteger(input.roundCount, "roundCount");
    const payoutBalls = nonNegativeInteger(input.payoutBalls, "payoutBalls");
    const at = finiteNumber(input.at ?? this.now(), "jackpot timestamp");
    const kind = jackpotKindForPhase(input.phase);

    if (kind === "first") {
      this.firstHits += 1;
      this.currentStreak = 1;
    } else {
      this.currentStreak += 1;
      if (kind === "lush" && this.lastJackpotKind !== "lush") {
        this.lushEntries += 1;
      }
    }
    this.maxStreak = Math.max(this.maxStreak, this.currentStreak);

    this.payoutBalls += payoutBalls;
    this.jackpotCount += 1;
    const record: JackpotRecord = {
      id: `jackpot-${String(this.jackpotCount).padStart(4, "0")}`,
      at,
      roundCount,
      payoutBalls,
      kind,
    };
    this.jackpots = [record, ...this.jackpots].slice(0, this.historyLimit);
    this.lastJackpotKind = kind;
    this.maybeRecordBalancePoint(at, true);
    return record;
  }

  /** Add money to the session. The unit is configurable, default ¥1,000. */
  addInvestment(yen = this.investmentUnitYen): void {
    const amount = positiveInteger(yen, "investment amount");
    this.investedYen += amount;
    this.maybeRecordBalancePoint(this.now());
  }

  reset(): void {
    this.startedAt = this.now();
    this.investedYen = this.initialInvestmentYen;
    this.payoutBalls = 0;
    this.launchedBalls = 0;
    this.normalSpins = 0;
    this.stSpins = 0;
    this.firstHits = 0;
    this.lushEntries = 0;
    this.currentStreak = 0;
    this.maxStreak = 0;
    this.jackpotCount = 0;
    this.lastJackpotKind = null;
    this.jackpots = [];
    this.balanceHistory = [this.makeBalancePoint(this.startedAt)];
    this.lastChartPointAt = this.startedAt;
  }

  snapshot(): SessionStatsSnapshot {
    return {
      version: 1,
      startedAt: this.startedAt,
      investedYen: this.investedYen,
      payoutBalls: this.payoutBalls,
      launchedBalls: this.launchedBalls,
      normalSpins: this.normalSpins,
      stSpins: this.stSpins,
      firstHits: this.firstHits,
      lushEntries: this.lushEntries,
      currentStreak: this.currentStreak,
      maxStreak: this.maxStreak,
      jackpotCount: this.jackpotCount,
      lastJackpotKind: this.lastJackpotKind,
      jackpots: this.jackpots.map((record) => ({ ...record })),
      balanceHistory: this.balanceHistory.map((point) => ({ ...point })),
      lastChartPointAt: this.lastChartPointAt,
    };
  }

  private maybeRecordBalancePoint(at: number, force = false): void {
    const metrics = this.metrics();
    const last = this.balanceHistory[this.balanceHistory.length - 1];
    const changed = !last || last.balanceYen !== metrics.balanceYen;

    if (!force) {
      if (!changed) return;
      if (last && at - this.lastChartPointAt < this.chartSampleMs) return;
    }

    this.balanceHistory.push(this.makeBalancePoint(at));
    this.lastChartPointAt = at;

    if (this.balanceHistory.length > this.chartPointLimit) {
      // Preserve the session start and discard the oldest intermediate sample.
      const first = this.balanceHistory[0];
      this.balanceHistory = first
        ? [first, ...this.balanceHistory.slice(2)]
        : this.balanceHistory.slice(-this.chartPointLimit);
    }
  }

  private makeBalancePoint(at: number): BalancePoint {
    const metrics = this.metrics();
    return {
      at,
      balanceYen: metrics.balanceYen,
      differenceBalls: metrics.differenceBalls,
    };
  }

  private restore(snapshot: SessionStatsSnapshot): void {
    if (snapshot.version !== 1) {
      throw new RangeError(
        `unsupported session stats snapshot version: ${String(snapshot.version)}`,
      );
    }

    this.startedAt = finiteNumber(snapshot.startedAt, "startedAt");
    this.investedYen = nonNegativeInteger(snapshot.investedYen, "investedYen");
    this.payoutBalls = nonNegativeInteger(snapshot.payoutBalls, "payoutBalls");
    this.launchedBalls = nonNegativeInteger(snapshot.launchedBalls, "launchedBalls");
    this.normalSpins = nonNegativeInteger(snapshot.normalSpins, "normalSpins");
    this.stSpins = nonNegativeInteger(snapshot.stSpins, "stSpins");
    this.firstHits = nonNegativeInteger(snapshot.firstHits, "firstHits");
    this.lushEntries = nonNegativeInteger(snapshot.lushEntries, "lushEntries");
    this.currentStreak = nonNegativeInteger(snapshot.currentStreak, "currentStreak");
    this.maxStreak = nonNegativeInteger(snapshot.maxStreak, "maxStreak");
    this.jackpotCount = nonNegativeInteger(snapshot.jackpotCount, "jackpotCount");
    this.lastChartPointAt = finiteNumber(snapshot.lastChartPointAt, "lastChartPointAt");

    if (snapshot.lastJackpotKind !== null && !JACKPOT_KINDS.includes(snapshot.lastJackpotKind)) {
      throw new RangeError("session stats snapshot contains an unknown jackpot kind");
    }
    this.lastJackpotKind = snapshot.lastJackpotKind;

    this.jackpots = snapshot.jackpots.map((record) => this.restoreJackpot(record));
    this.balanceHistory = snapshot.balanceHistory.map((point) => this.restoreBalancePoint(point));
    if (this.balanceHistory.length === 0) {
      this.balanceHistory = [this.makeBalancePoint(this.startedAt)];
      this.lastChartPointAt = this.startedAt;
    }
  }

  private restoreJackpot(record: JackpotRecord): JackpotRecord {
    if (!JACKPOT_KINDS.includes(record.kind)) {
      throw new RangeError("session stats snapshot contains an unknown jackpot kind");
    }
    if (typeof record.id !== "string" || record.id.length === 0) {
      throw new RangeError("session stats snapshot contains an invalid jackpot id");
    }
    return {
      id: record.id,
      at: finiteNumber(record.at, "jackpot at"),
      roundCount: nonNegativeInteger(record.roundCount, "jackpot roundCount"),
      payoutBalls: nonNegativeInteger(record.payoutBalls, "jackpot payoutBalls"),
      kind: record.kind,
    };
  }

  private restoreBalancePoint(point: BalancePoint): BalancePoint {
    return {
      at: finiteNumber(point.at, "balance point at"),
      balanceYen: finiteNumber(point.balanceYen, "balance point balanceYen"),
      differenceBalls: finiteNumber(point.differenceBalls, "balance point differenceBalls"),
    };
  }
}

export function jackpotKindForPhase(phase?: GamePhase): JackpotKind {
  if (phase === "st") return "st";
  if (phase === "lush") return "lush";
  return "first";
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
  return value;
}
