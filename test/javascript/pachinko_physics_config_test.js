const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../../app/assets/javascripts/pachinko_physics_config.js");

test("centralizes board units and provides distinct launch strengths without setting a target rate", () => {
  assert.deepEqual(config.values.viewBox, { width: 1015, height: 1550 });
  assert.deepEqual(config.values.launcher.position, { x: 145, y: 1280 });
  assert.equal(config.values.targetHitRatePercent, null);
  const weak = config.velocityForStrength("weak");
  const medium = config.velocityForStrength("medium");
  const strong = config.velocityForStrength("strong");
  assert.ok(weak.y < 0 && weak.x < 0);
  assert.ok(Math.hypot(weak.x, weak.y) < Math.hypot(medium.x, medium.y));
  assert.ok(Math.hypot(medium.x, medium.y) < Math.hypot(strong.x, strong.y));
  assert.throws(() => config.velocityForStrength("turbo"), RangeError);
});
