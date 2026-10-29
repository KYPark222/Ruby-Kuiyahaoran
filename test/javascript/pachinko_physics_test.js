const test = require("node:test");
const assert = require("node:assert/strict");
require("../../app/assets/javascripts/pachinko_physics_config.js");
require("../../app/assets/javascripts/pachinko_entry_detector.js");
require("../../app/assets/javascripts/pachinko_trial_stats.js");
const Matter = require("../../app/assets/javascripts/vendor/matter.min.js");
const { createSimulation, maxBalls, defaultLaunch } = require("../../app/assets/javascripts/pachinko_physics.js");

function createCanvas() {
  const context = {
    setTransform() {},
    clearRect() {},
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {}
  };
  return { dataset: {}, getContext: () => context };
}

function createSvg() {
  const pin = {
    id: "test-pin",
    getAttribute(name) { return ({ r: "7", cx: "314", cy: "280" })[name]; }
  };
  const paths = [
    [[78, 1300], [20, 1160], [5, 1000], [5, 840], [5, 650], [25, 500], [80, 400], [155, 350], [235, 300], [285, 260]],
    [[146, 404], [81, 512], [67, 699], [90, 867], [106, 988], [175, 1090], [292, 1187]],
    [[143, 558], [132, 733], [151, 881], [209, 1002], [253, 1090], [318, 1142], [402, 1194]],
    [[230, 365], [338, 350], [677, 350], [832, 365]],
    [[230, 365], [215, 410], [192, 450], [166, 574], [168, 793], [184, 917], [199, 960]],
    [[832, 365], [854, 515], [852, 790], [814, 960]],
    [[199, 960], [814, 960]]
  ].map((points, index) => {
    const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
    const totalLength = lengths.reduce((sum, length) => sum + length, 0);
    return {
      id: `test-path-${index}`,
      dataset: { physicsRole: index > 2 ? "lcd-guard" : (index === 2 ? "ball-lane-edge" : "outer-rail") },
      classList: { contains: (name) => name === (index > 2 ? "lcd-guard" : (index === 2 ? "lane-trace-inner" : "physics-rail")) },
      getTotalLength: () => totalLength,
      getPointAtLength(distance) {
        let remaining = Math.min(distance, totalLength);
        for (let i = 0; i < lengths.length; i += 1) {
          if (remaining <= lengths[i]) {
            const ratio = lengths[i] === 0 ? 0 : remaining / lengths[i];
            return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * ratio, y: points[i][1] + (points[i + 1][1] - points[i][1]) * ratio };
          }
          remaining -= lengths[i];
        }
        return { x: points.at(-1)[0], y: points.at(-1)[1] };
      }
    };
  });

  return {
    querySelector(selector) {
      if (selector.includes("entry-sensor")) {
        return { getAttribute(name) { return ({ cx: "508", cy: "1392", rx: "23", ry: "13" })[name]; } };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".physics-pin") return [pin];
      if (selector.includes("lcd-guard")) return paths.filter((_, index) => index !== 2);
      return [];
    }
  };
}

test("creates a capped physics world and removes balls on request or after leaving the board", () => {
  const simulation = createSimulation({ Matter, svg: createSvg(), canvas: createCanvas() });
  const ball = simulation.launchBall({ kind: "test" });
  let railContacts = 0;
  Matter.Events.on(simulation.engine, "collisionStart", ({ pairs }) => {
    if (pairs.some(({ bodyA, bodyB }) => ["outer-rail", "board-boundary"].includes(bodyA.label) || ["outer-rail", "board-boundary"].includes(bodyB.label))) railContacts += 1;
  });

  assert.ok(ball);
  assert.equal(ball.position.x, defaultLaunch.x);
  assert.equal(ball.position.y, defaultLaunch.y);
  assert.ok(ball.velocity.x < 0 && ball.velocity.y < 0, "the launch impulse should point up and left");
  assert.equal(simulation.ballCount, 1);
  for (let index = 0; index < 60; index += 1) simulation.step();
  assert.ok(ball.position.y < 1355, "the launched ball should rise into the board");
  assert.ok(ball.position.y < 1000, "the launch path should climb to the left-side rail area");
  assert.ok(ball.position.x < defaultLaunch.x, "the launched ball should travel toward the left rail");
  assert.ok(ball.position.x > 0, "the launched ball should remain inside the board");
  assert.ok(railContacts > 0, "the launched ball should collide with the outer rail");
  for (let index = 0; index < 180 && ball.position.y > 404 && simulation.ballCount > 0; index += 1) simulation.step();
  assert.ok(ball.position.y <= 404, "the launch should reach the upper board area");
  assert.equal(simulation.engine.world.bodies.filter((body) => body.label === "lcd-guard").length > 0, true);

  assert.equal(simulation.removeBall(ball), true);
  assert.equal(simulation.removeBall(ball), false);
  assert.equal(simulation.ballCount, 0);

  const pinProbe = simulation.addBall({ x: 314, y: 250, velocity: { x: 0, y: 5 } });
  for (let index = 0; index < 10; index += 1) simulation.step();
  assert.ok(pinProbe.position.y < 266, "the pin should deflect the test ball before it passes through");
  simulation.removeBall(pinProbe);

  let lcdGuardContacts = 0;
  Matter.Events.on(simulation.engine, "collisionStart", ({ pairs }) => {
    if (pairs.some(({ bodyA, bodyB }) => bodyA.label === "lcd-guard" || bodyB.label === "lcd-guard")) lcdGuardContacts += 1;
  });
  const lcdProbe = simulation.addBall({ x: 500, y: 320, velocity: { x: 0, y: 14 } });
  for (let index = 0; index < 12; index += 1) simulation.step();
  assert.ok(lcdGuardContacts > 0, "the ball should collide with the physical LCD perimeter");
  assert.ok(lcdProbe.position.y < 350, "the ball should not enter the LCD protected region");
  simulation.removeBall(lcdProbe);

  const entryBall = simulation.launchBall({ kind: "trial", x: 508, y: 1370, velocity: { x: 0, y: 3 } });
  for (let index = 0; index < 12 && simulation.ballCount > 0; index += 1) simulation.step();
  assert.equal(simulation.ballCount, 0, "a ball passing through the opening should be removed once");
  assert.equal(simulation.stats.snapshot().overall.hits, 1);
  assert.equal(simulation.stats.resolve(entryBall.id, "hit"), false, "a resolved entry must not be counted twice");

  const escapedBall = simulation.addBall({ x: 500, y: 1552 });
  Matter.Body.setVelocity(escapedBall, { x: 0, y: 30 });
  simulation.step();
  assert.equal(simulation.ballCount, 0);

  for (let index = 0; index < maxBalls; index += 1) simulation.addBall({ x: 100, y: 100 });
  assert.equal(simulation.ballCount, maxBalls);
  assert.equal(simulation.addBall({ x: 100, y: 100 }), null);
  simulation.destroy();
  assert.equal(simulation.isDestroyed, true);
});
