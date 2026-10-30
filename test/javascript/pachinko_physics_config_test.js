const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../../app/assets/javascripts/pachinko_physics_config.js");
const boardLayout = require("../../app/assets/data/pachinko-board-layout.json");

test("keeps individually identified pins and the entry aperture in the board coordinate system", () => {
  assert.deepEqual(boardLayout.viewBox, config.values.viewBox);
  assert.equal(boardLayout.pins.length, 89);
  assert.equal(new Set(boardLayout.pins.map(({ id }) => id)).size, boardLayout.pins.length);
  assert.ok(boardLayout.pins.every(({ x, y, radius }) => x > 0 && y > 0 && radius > 0));
  assert.deepEqual(
    { cx: boardLayout.entry.cx, cy: boardLayout.entry.cy, rx: boardLayout.entry.rx, ry: boardLayout.entry.ry },
    { cx: 508, cy: 1194, rx: 23, ry: 13 }
  );
  assert.equal(config.values.entry.guideWalls.offsetX, boardLayout.entry.rx + 3);
  assert.deepEqual(boardLayout.entry.funnelWalls.map(({ id }) => id), ["heso-funnel-left", "heso-funnel-right"]);
  assert.deepEqual(boardLayout.entry.funnelWalls[0].points.at(-1), [
    boardLayout.entry.cx - config.values.entry.guideWalls.offsetX,
    boardLayout.entry.cy + config.values.entry.guideWalls.startY
  ]);
  assert.deepEqual(boardLayout.entry.funnelWalls[1].points.at(-1), [
    boardLayout.entry.cx + config.values.entry.guideWalls.offsetX,
    boardLayout.entry.cy + config.values.entry.guideWalls.startY
  ]);
  assert.deepEqual(boardLayout.returnPins.map(({ id }) => id), ["N101", "N102", "N103", "N104"]);
  assert.deepEqual(boardLayout.returnPins[0], {
    id: "N101", referenceX: 120, referenceY: 310, x: 126.9, y: 250.3,
    radius: 7, physicalRadius: 5.5, restitution: 0.95, friction: 0,
    frictionStatic: 0, kind: "left-upper-return"
  });
  assert.deepEqual(boardLayout.returnRails.map(({ id }) => id), ["R002", "R003"]);
  assert.ok(config.values.capacity.stallSteps > 0);
  assert.equal(config.values.entry.fallbackSteps, undefined);
});

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

  // 玉径11mm・表示半径8pxを基準にした実スケールを、視認性のため1/3スローで表示している
  const pxPerMm = config.values.ball.radius / 5.5;
  const slowMotion = 3;
  const realGravityScale = 9.80665 * pxPerMm * 1000 / 1e6;
  const expectedGravityScale = realGravityScale / (slowMotion * slowMotion);
  assert.ok(Math.abs(config.values.engine.gravity.scale - expectedGravityScale) / expectedGravityScale < 0.01);
  const mediumSpeedMetersPerSecond = Math.hypot(medium.x, medium.y) * 60 / pxPerMm / 1000;
  assert.ok(mediumSpeedMetersPerSecond > 1 && mediumSpeedMetersPerSecond < 2);
  assert.ok(config.values.timing.subSteps >= 6);
  assert.ok(config.values.capacity.maxSpeed >= 46);
});
