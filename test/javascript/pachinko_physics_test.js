const test = require("node:test");
const assert = require("node:assert/strict");
require("../../app/assets/javascripts/pachinko_physics_config.js");
require("../../app/assets/javascripts/pachinko_entry_detector.js");
require("../../app/assets/javascripts/pachinko_trial_stats.js");
const boardLayout = require("../../app/assets/data/pachinko-board-layout.json");
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

function makeCurveElement({ id, role, points, thickness, friction, frictionStatic, classes = ["physics-rail"], disabled = false }) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  return {
    id,
    dataset: { physicsRole: role },
    classList: { contains: (name) => classes.includes(name) },
    getAttribute(name) {
      if (name === "data-physics-disabled") return disabled ? "true" : null;
      if (name === "data-physics-thickness") return thickness == null ? null : String(thickness);
      if (name === "data-physics-friction") return friction == null ? null : String(friction);
      if (name === "data-physics-static-friction") return frictionStatic == null ? null : String(frictionStatic);
      return null;
    },
    getTotalLength: () => totalLength,
    getPointAtLength(distance) {
      let remaining = Math.min(distance, totalLength);
      for (let index = 0; index < lengths.length; index += 1) {
        if (remaining <= lengths[index]) {
          const ratio = lengths[index] === 0 ? 0 : remaining / lengths[index];
          return { x: points[index][0] + (points[index + 1][0] - points[index][0]) * ratio, y: points[index][1] + (points[index + 1][1] - points[index][1]) * ratio };
        }
        remaining -= lengths[index];
      }
      return { x: points.at(-1)[0], y: points.at(-1)[1] };
    }
  };
}

function createSvg() {
  const pins = [...boardLayout.pins, ...boardLayout.returnPins].map((pin) => ({
    id: pin.id,
    getAttribute(name) { return ({
      r: String(pin.radius), cx: String(pin.x), cy: String(pin.y),
      "data-physical-radius": String(pin.physicalRadius || 6),
      "data-physical-restitution": pin.restitution == null ? null : String(pin.restitution),
      "data-physical-friction": pin.friction == null ? null : String(pin.friction),
      "data-physical-static-friction": pin.frictionStatic == null ? null : String(pin.frictionStatic)
    })[name]; }
  }));
  const paths = [
    makeCurveElement({
      id: "left-board-boundary", role: "board-boundary",
      points: [[78, 1300], [20, 1160], [5, 1000], [5, 840], [5, 650], [25, 500], [80, 400], [155, 350], [235, 300], [285, 260]]
    }),
    makeCurveElement({
      id: "left-outer-rail", role: "outer-rail", disabled: true,
      points: [[146, 404], [81, 512], [67, 699], [90, 867], [106, 988], [175, 1090], [292, 1187]]
    }),
    makeCurveElement({
      id: "left-flow-lane-inner", role: "ball-lane-inner-edge", classes: [], disabled: true,
      points: [[143, 558], [132, 733], [151, 881], [209, 1002], [253, 1090], [318, 1142], [402, 1194]]
    }),
    makeCurveElement({
      id: "lcd-top-guard", role: "lcd-guard", classes: ["lcd-guard"], disabled: true,
      points: [[230, 365], [338, 350], [677, 350], [832, 365]]
    }),
    makeCurveElement({
      id: "lcd-left-guard", role: "lcd-guard", classes: ["lcd-guard"], disabled: true,
      points: [[230, 365], [215, 410], [192, 450], [166, 574], [168, 793], [184, 917], [199, 960]]
    }),
    makeCurveElement({
      id: "lcd-right-guard", role: "lcd-guard", classes: ["lcd-guard"], disabled: true,
      points: [[832, 365], [854, 515], [852, 790], [814, 960]]
    }),
    makeCurveElement({
      id: "lcd-bottom-guard", role: "lcd-guard", classes: ["lcd-guard"], disabled: true,
      points: [[199, 960], [350, 1004], [663, 1004], [814, 960]]
    })
  ];

  boardLayout.returnRails.forEach((rail) => {
    paths.push(makeCurveElement({
      id: rail.id, role: rail.role, points: rail.points,
      thickness: rail.thickness, friction: rail.friction, frictionStatic: rail.frictionStatic
    }));
  });

  boardLayout.entry.funnelWalls.forEach((rail) => {
    paths.push(makeCurveElement({
      id: rail.id, role: rail.role, points: rail.points,
      thickness: rail.thickness, friction: rail.friction, frictionStatic: rail.frictionStatic
    }));
  });

  return {
    querySelector(selector) {
      if (selector.includes("entry-sensor")) {
        return { getAttribute(name) { return ({ cx: "508", cy: "1194", rx: "23", ry: "13" })[name]; } };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".physics-pin") return pins;
      if (selector.includes("physics-lane") || selector.includes("physics-rail")) return paths;
      return [];
    }
  };
}

function runUntilSettled(simulation, limit = 3000) {
  for (let index = 0; index < limit && simulation.ballCount > 0; index += 1) simulation.step();
  return simulation.ballCount;
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
  for (let index = 0; index < 8; index += 1) simulation.step();
  assert.ok(ball.position.y < 1355, "the launched ball should rise into the board");
  assert.ok(ball.position.y < 1000, "the launch path should climb to the left-side rail area");
  assert.ok(ball.position.x < defaultLaunch.x, "the launched ball should travel toward the left rail");
  assert.ok(ball.position.x > 0, "the launched ball should remain inside the board");
  assert.ok(railContacts > 0, "the launched ball should collide with the outer rail");

  assert.equal(simulation.engine.world.bodies.filter((body) => body.label === "lcd-guard").length, 0);
  assert.equal(simulation.engine.world.bodies.filter((body) => body.label === "outer-rail").length, 0);
  assert.deepEqual(
    simulation.engine.world.bodies.filter((body) => body.label.startsWith("entry-guide:")).map((body) => body.label).sort(),
    ["entry-guide:left", "entry-guide:right"]
  );
  assert.ok(simulation.engine.world.bodies.some((body) => body.label === "upper-feed-rail"));
  assert.ok(simulation.engine.world.bodies.some((body) => body.label === "upper-feed-return-edge"));
  assert.ok(simulation.engine.world.bodies.some((body) => body.label === "heso-funnel-left"));
  assert.ok(simulation.engine.world.bodies.some((body) => body.label === "heso-funnel-right"));
  assert.equal(simulation.engine.world.bodies.filter((body) => body.label.startsWith("pin:N10")).length, 4);
  assert.equal(simulation.engine.world.bodies.filter((body) => body.label === "pin:lower-1-7").length, 0);
  assert.equal(simulation.engine.world.bodies.filter((body) => body.label === "pin:lower-1-8").length, 0);

  assert.equal(simulation.removeBall(ball), true);
  assert.equal(simulation.removeBall(ball), false);
  assert.equal(simulation.ballCount, 0);

  const pinProbe = simulation.addBall({ x: 513, y: 290, velocity: { x: 0, y: 5 } });
  let pinHits = 0;
  Matter.Events.on(simulation.engine, "collisionStart", ({ pairs }) => {
    pinHits += pairs.filter(({ bodyA, bodyB }) => {
      if (bodyA !== pinProbe && bodyB !== pinProbe) return false;
      const other = bodyA === pinProbe ? bodyB : bodyA;
      return other.label.startsWith("pin:");
    }).length;
  });
  for (let index = 0; index < 3; index += 1) simulation.step();
  assert.ok(pinHits > 0, "the test ball should collide with the pin");
  assert.ok(Math.abs(pinProbe.velocity.x) > 1, "the pin collision should deflect the ball sideways");
  simulation.removeBall(pinProbe);

  const entryBall = simulation.launchBall({ kind: "trial", x: 508, y: 1172, velocity: { x: 0, y: 3 } });
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

test("a return-pin strike redirects a leftward ball into the left passage", () => {
  const simulation = createSimulation({ Matter, svg: createSvg(), canvas: createCanvas(), options: { enableSleeping: false } });
  const ball = simulation.addBall({ x: 200, y: 315, velocity: { x: -8, y: 0 } });
  let returnPinContacts = 0;
  Matter.Events.on(simulation.engine, "collisionStart", ({ pairs }) => {
    returnPinContacts += pairs.filter(({ bodyA, bodyB }) => bodyA.label.startsWith("pin:N10") || bodyB.label.startsWith("pin:N10")).length;
  });

  for (let index = 0; index < 20 && simulation.ballCount > 0 && returnPinContacts === 0; index += 1) simulation.step();

  assert.ok(returnPinContacts > 0, `the incoming ball should contact a return pin (x=${ball.position.x.toFixed(1)}, y=${ball.position.y.toFixed(1)})`);
  simulation.removeBall(ball);
  simulation.destroy();
});

test("a ball dropped toward the heso follows the funnel and is accepted without teleporting", () => {
  const entries = [];
  const simulation = createSimulation({ Matter, svg: createSvg(), canvas: createCanvas(), options: { onEntry: (entry) => entries.push(entry) } });
  const ball = simulation.launchBall({ kind: "trial", x: 508, y: 1080, velocity: { x: 0, y: 4 } });
  assert.ok(ball);

  for (let index = 0; index < 90 && simulation.ballCount > 0; index += 1) simulation.step();

  assert.equal(simulation.ballCount, 0, "the ball should fall into the heso and leave the board");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ballId, String(ball.id));
  assert.equal(entries[0].fallback, undefined);
  assert.equal(simulation.stats.snapshot().overall.hits, 1);
  simulation.destroy();
});

test("a launched game ball is not teleported to the heso and stays in play until it resolves", () => {
  const entries = [];
  const simulation = createSimulation({ Matter, svg: createSvg(), canvas: createCanvas(), options: { onEntry: (entry) => entries.push(entry) } });
  const ball = simulation.launchBall({ kind: "game", strength: "weak" });
  assert.ok(ball.velocity.x < 0 && ball.velocity.y < 0);

  for (let index = 0; index < 10; index += 1) simulation.step();
  assert.equal(simulation.ballCount, 1, "the ball must still be falling shortly after launch");
  assert.equal(entries.length, 0, "the ball must not be teleported into the heso");

  const remaining = runUntilSettled(simulation, 3000);
  assert.equal(remaining, 0, "the ball should eventually enter the heso or drain");
  const overall = simulation.stats.snapshot().overall;
  assert.equal(overall.completed, 1);
  assert.equal(overall.hits + overall.escaped, 1);
  simulation.destroy();
});
