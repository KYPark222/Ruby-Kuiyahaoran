import { z } from "zod";

import originalMachineJson from "./original-machine.json";

/**
 * Zod schema for machine specifications. Keeping the spec in JSON makes
 * probabilities and payout tables data rather than code.
 */
const oddsSchema = z
  .object({
    jackpotNumerator: z.number().int().min(1),
    jackpotDenominator: z.number().int().min(2),
  })
  .strict()
  .refine((odds) => odds.jackpotNumerator < odds.jackpotDenominator, {
    message: "jackpotNumerator must be smaller than jackpotDenominator",
    path: ["jackpotNumerator"],
  });

const stateSchema = z
  .object({
    enabled: z.boolean(),
    spins: z.number().int().min(0),
  })
  .strict();

export const machineSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    holdLimit: z.number().int().min(1).max(8),
    lottery: z
      .object({
        normal: oddsSchema,
      })
      .strict(),
    payout: z
      .object({
        jackpotBalls: z.number().int().min(0),
        roundCount: z.number().int().min(0),
      })
      .strict(),
    states: z
      .object({
        st: z
          .object({
            enabled: z.boolean(),
            spins: z.number().int().min(0),
            continuationRate: z.number().min(0).max(1),
          })
          .strict(),
        lush: stateSchema,
      })
      .strict(),
  })
  .strict();

export type MachineSpec = z.infer<typeof machineSpecSchema>;
export type JackpotOdds = MachineSpec["lottery"]["normal"];

export class MachineSpecError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid machine specification: ${issues.join("; ")}`);
    this.name = "MachineSpecError";
    this.issues = issues;
  }
}

/** Validate unknown input and return a frozen, typed spec. */
export function parseMachineSpec(input: unknown): MachineSpec {
  const result = machineSpecSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new MachineSpecError(issues);
  }
  return deepFreeze(result.data);
}

export function getOriginalMachineSpec(): MachineSpec {
  return parseMachineSpec(originalMachineJson);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
