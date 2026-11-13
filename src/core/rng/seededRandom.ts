import type { RandomSnapshot } from "../types";

const UINT32_RANGE = 0x1_0000_0000;

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** FNV-1a over UTF-16 code units, used to turn a textual seed into uint32. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** SplitMix32 expands a single uint32 into a well-distributed state. */
function createSplitMix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
  };
}

function validateState(
  state: readonly number[],
): asserts state is readonly [number, number, number, number] {
  if (state.length !== 4) {
    throw new RangeError("RNG state must contain exactly four uint32 values");
  }
  for (const value of state) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("RNG state values must be uint32 integers");
    }
  }
}

/**
 * Deterministic xoshiro128** generator.
 *
 * The generator is seeded from a string or number, can be snapshotted and
 * restored, and never calls Math.random(). Same seed + same draw order always
 * produces the same sequence.
 */
export class SeededRandom {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private drawCount = 0;
  private readonly seedText: string;

  constructor(seed: string | number, snapshot?: RandomSnapshot) {
    this.seedText = String(seed);
    if (snapshot) {
      validateState(snapshot.state);
      [this.s0, this.s1, this.s2, this.s3] = snapshot.state;
      this.drawCount = snapshot.draws;
      return;
    }

    const mix = createSplitMix32(hashSeed(this.seedText));
    this.s0 = mix();
    this.s1 = mix();
    this.s2 = mix();
    this.s3 = mix();
    // xoshiro requires a non-zero state.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 0x9e3779b9;
    }
  }

  static fromSnapshot(snapshot: RandomSnapshot): SeededRandom {
    return new SeededRandom(snapshot.seed, snapshot);
  }

  get seed(): string {
    return this.seedText;
  }

  get draws(): number {
    return this.drawCount;
  }

  /** Next raw uint32 value in [0, 2^32). */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    this.drawCount += 1;
    return result;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /**
   * Unbiased integer in [0, bound). Uses rejection sampling instead of a
   * modulo bias so probability configuration stays exact.
   */
  intBelow(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new RangeError(`bound must be a positive integer, received ${String(bound)}`);
    }
    if (bound === 1) return 0;

    const limit = UINT32_RANGE - (UINT32_RANGE % bound);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return value % bound;
  }

  /** True with probability numerator / denominator. */
  chance(numerator: number, denominator: number): boolean {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
      throw new RangeError("chance requires integer numerator and positive integer denominator");
    }
    if (numerator < 0 || numerator > denominator) {
      throw new RangeError("numerator must be between 0 and denominator");
    }
    if (numerator === 0) return false;
    if (numerator === denominator) return true;
    return this.intBelow(denominator) < numerator;
  }

  snapshot(): RandomSnapshot {
    return {
      seed: this.seedText,
      state: [this.s0, this.s1, this.s2, this.s3],
      draws: this.drawCount,
    };
  }
}
