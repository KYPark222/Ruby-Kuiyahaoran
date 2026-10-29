const test = require("node:test");
const assert = require("node:assert/strict");
const { createRegistry } = require("../../app/assets/javascripts/pachinko_trial_stats.js");

test("aggregates resolved trials and keeps the target rate explicitly optional", () => {
  const registry = createRegistry({ now: () => new Date("2026-10-24T00:00:00.000Z") });
  assert.equal(registry.snapshot().targetRatePercent, null);
  registry.setTargetRate(2.5);
  registry.recordLaunch({ ballId: 1, strength: "weak", parameters: { speed: 13.2 } });
  registry.recordLaunch({ ballId: 2, strength: "strong", parameters: { speed: 17 } });
  assert.equal(registry.resolve(1, "hit"), true);
  assert.equal(registry.resolve(1, "hit"), false);
  assert.equal(registry.resolve(2, "escaped"), true);

  const stats = registry.snapshot();
  assert.equal(stats.overall.completed, 2);
  assert.equal(stats.overall.hits, 1);
  assert.equal(stats.overall.measuredRatePercent, 50);
  assert.equal(stats.overall.differencePercentagePoints, 47.5);
  assert.equal(stats.byStrength.weak.hits, 1);
  assert.equal(stats.byStrength.strong.escaped, 1);
  assert.equal(stats.trials[0].parameters.speed, 13.2);
  assert.throws(() => registry.setTargetRate(101), RangeError);
});
