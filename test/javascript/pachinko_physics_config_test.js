const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../../app/assets/javascripts/pachinko_physics_config.js");
const boardLayout = require("../../app/assets/data/pachinko-board-layout.json");

test("keeps individually identified pins and the entry aperture in the board coordinate system", () => {
  assert.deepEqual(boardLayout.viewBox, config.values.viewBox);
  assert.equal(boardLayout.pins.length, 80);
  assert.equal(boardLayout.pins.filter(({ id }) => id.startsWith("upper-3")).length, 0);
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
  assert.equal(boardLayout.lcdProtection.collider.id, "lcd-collider");
  assert.deepEqual(boardLayout.lcdProtection.collider.points.at(0), boardLayout.lcdProtection.collider.points.at(-1));
  assert.deepEqual(
    boardLayout.lcdProtection.sideGuides.map(({ id }) => id),
    ["lcd-side-guide-left", "lcd-side-guide-right"]
  );
  const xs = boardLayout.lcdProtection.collider.points.map(([x]) => x);
  const ys = boardLayout.lcdProtection.collider.points.map(([, y]) => y);
  assert.ok(Math.min(...xs) >= 180 && Math.max(...xs) <= 840);
  assert.ok(Math.min(...ys) >= 340 && Math.max(...ys) <= 1000);
  assert.ok(config.values.capacity.stallSteps > 0);
  assert.equal(config.values.entry.fallbackSteps, undefined);
});

test("centralizes board units and provides left and right launch modes without setting a target rate", () => {
  assert.deepEqual(config.values.viewBox, { width: 1015, height: 1550 });
  assert.equal(config.values.launcher.defaultMode, "left");
  assert.deepEqual(config.values.targetHitRatePercent, null);
  const leftMode = config.launchMode("left");
  const rightMode = config.launchMode("right");
  assert.deepEqual(leftMode.position, { x: 145, y: 1280 });
  assert.deepEqual(rightMode.position, leftMode.position);
  assert.equal(rightMode.angleDegrees, leftMode.angleDegrees);
  assert.ok(rightMode.speed > leftMode.speed);
  assert.ok(config.values.capacity.maxSpeed >= rightMode.speed);

  const left = config.velocityForMode("left");
  const right = config.velocityForMode("right");
  assert.ok(left.y < 0 && left.x < 0);
  assert.ok(right.y < 0 && right.x < 0);
  assert.ok(Math.hypot(right.x, right.y) > Math.hypot(left.x, left.y));
  assert.throws(() => config.velocityForMode("turbo"), RangeError);

  // 玉径11mm・表示半径8pxを基準にした実スケールを、視認性のため1/3スローで表示している
  const pxPerMm = config.values.ball.radius / 5.5;
  const slowMotion = 3;
  const realGravityScale = 9.80665 * pxPerMm * 1000 / 1e6;
  const expectedGravityScale = realGravityScale / (slowMotion * slowMotion);
  assert.ok(Math.abs(config.values.engine.gravity.scale - expectedGravityScale) / expectedGravityScale < 0.01);
  const launchSpeedMetersPerSecond = Math.hypot(right.x, right.y) * 60 / pxPerMm / 1000;
  assert.ok(launchSpeedMetersPerSecond > 1 && launchSpeedMetersPerSecond < 2);
  assert.ok(config.values.timing.subSteps >= 6);
  assert.ok(config.values.capacity.maxSpeed >= 46);
  assert.ok(config.values.autoLaunch.intervalMs > 0);
  assert.ok(config.values.autoLaunch.maxConcurrent > 0);
  assert.ok(config.values.autoLaunch.angleJitterDegrees >= 0 && config.values.autoLaunch.angleJitterDegrees <= 0.5);
});
