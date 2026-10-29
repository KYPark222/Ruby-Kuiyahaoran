(function (root) {
  "use strict";

  const CONFIG = root.PachinkoPhysicsConfig.values;
  const ENTRY = root.PachinkoEntryDetector;
  const VIEW_WIDTH = CONFIG.viewBox.width;
  const VIEW_HEIGHT = CONFIG.viewBox.height;
  const STEP_MS = CONFIG.timing.stepMs;
  const SUB_STEPS = CONFIG.timing.subSteps;
  const MAX_FRAME_MS = CONFIG.timing.maxFrameMs;
  const MAX_SPEED = CONFIG.capacity.maxSpeed;
  const MAX_BALLS = CONFIG.capacity.maxBalls;
  const DEFAULT_LAUNCH = { ...CONFIG.launcher.position, velocity: root.PachinkoPhysicsConfig.velocityForStrength() };
  const instances = new WeakMap();

  function createSimulation({ Matter, svg, canvas, options = {} }) {
    const { Engine, Bodies, Body, Composite } = Matter;
    const engine = Engine.create({
      gravity: {
        x: options.gravityX ?? CONFIG.engine.gravity.x,
        y: options.gravityY ?? CONFIG.engine.gravity.y,
        scale: options.gravityScale ?? CONFIG.engine.gravity.scale
      },
      positionIterations: options.positionIterations ?? CONFIG.engine.positionIterations,
      velocityIterations: options.velocityIterations ?? CONFIG.engine.velocityIterations,
      constraintIterations: options.constraintIterations ?? CONFIG.engine.constraintIterations,
      enableSleeping: options.enableSleeping ?? CONFIG.engine.enableSleeping
    });
    const registry = root.PachinkoTrialStats.createRegistry({ targetRatePercent: CONFIG.targetHitRatePercent });
    const ballBodies = new Map();
    const entryElement = svg.querySelector(CONFIG.entry.selector);
    const aperture = ENTRY.readEllipse(entryElement);
    const context = canvas.getContext("2d");
    const pixelRatio = Math.min(root.devicePixelRatio || 1, 2);
    let running = false;
    let destroyed = false;
    let animationFrame = null;
    let previousTime = null;
    let accumulator = 0;
    let resumeAfterVisibility = false;
    let debug = options.debug === true;
    let statsListener = options.onStatsChange || null;

    function notifyStats() {
      if (typeof statsListener === "function") statsListener(registry.snapshot());
    }

    canvas.width = VIEW_WIDTH * pixelRatio;
    canvas.height = VIEW_HEIGHT * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    function addStaticSegment(start, end, thickness, label, collisionOptions = {}) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) return;

      const segment = Bodies.rectangle(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        length + thickness,
        thickness,
        {
          isStatic: true,
          angle: Math.atan2(dy, dx),
          label,
          restitution: collisionOptions.restitution ?? options.railRestitution ?? CONFIG.rail.restitution,
          friction: collisionOptions.friction ?? options.railFriction ?? CONFIG.rail.friction
        }
      );
      Composite.add(engine.world, segment);
    }

    function addPathSegments(path, thickness, label, collisionOptions = {}) {
      const pathLength = path.getTotalLength();
      const sampleGap = Math.max(options.railSampleGap ?? CONFIG.rail.sampleGap, thickness * CONFIG.rail.segmentSizeFactor);
      let previous = path.getPointAtLength(0);

      for (let distance = sampleGap; distance <= pathLength; distance += sampleGap) {
        const point = path.getPointAtLength(distance);
        addStaticSegment(previous, point, thickness, label, collisionOptions);
        previous = point;
      }

      const last = path.getPointAtLength(pathLength);
      addStaticSegment(previous, last, thickness, label, collisionOptions);
    }

    svg.querySelectorAll(".physics-pin").forEach((pin) => {
      const visualRadius = Number(pin.getAttribute("r")) || CONFIG.pin.radius + CONFIG.pin.visualClearance;
      const radius = Math.max(1, Math.min(options.pinRadius ?? CONFIG.pin.radius, visualRadius - CONFIG.pin.visualClearance));
      const body = Bodies.circle(
        Number(pin.getAttribute("cx")),
        Number(pin.getAttribute("cy")),
        radius,
        {
          isStatic: true,
          label: `pin:${pin.id}`,
          restitution: options.pinRestitution ?? CONFIG.pin.restitution,
          friction: options.pinFriction ?? CONFIG.pin.friction
        }
      );
      Composite.add(engine.world, body);
    });

    svg.querySelectorAll(".physics-rail, [data-physics-role='right-strike-lane-edge'], .lcd-guard").forEach((path) => {
      const isRail = path.classList.contains("physics-rail");
      const isLcdGuard = path.classList.contains("lcd-guard");
      const thickness = isRail
        ? (options.railThickness ?? CONFIG.rail.thickness)
        : (isLcdGuard ? (options.lcdGuardThickness ?? CONFIG.lcdGuard.thickness) : (options.laneThickness ?? CONFIG.rail.laneThickness));
      addPathSegments(path, thickness, path.dataset.physicsRole || "lane-edge", {
        restitution: isLcdGuard
          ? (options.lcdGuardRestitution ?? CONFIG.lcdGuard.restitution)
          : (options.railRestitution ?? CONFIG.rail.restitution),
        friction: isLcdGuard
          ? (options.lcdGuardFriction ?? CONFIG.lcdGuard.friction)
          : (options.railFriction ?? CONFIG.rail.friction)
      });
    });

    function draw() {
      context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      canvas.dataset.physicsBallCount = String(ballBodies.size);
      canvas.dataset.physicsDebug = String(debug);
      const testBall = [...ballBodies.values()].find(({ kind }) => kind === "test");
      if (testBall) {
        canvas.dataset.testBallX = testBall.body.position.x.toFixed(1);
        canvas.dataset.testBallY = testBall.body.position.y.toFixed(1);
      } else {
        delete canvas.dataset.testBallX;
        delete canvas.dataset.testBallY;
      }
      ballBodies.forEach(({ body, radius, kind }) => {
        const { x, y } = body.position;
        const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.4, 1, x, y, radius);
        gradient.addColorStop(0, kind === "test" ? "#ffffff" : "#fff5cf");
        gradient.addColorStop(0.42, kind === "test" ? "#79faff" : "#f6d16b");
        gradient.addColorStop(1, kind === "test" ? "#007d9a" : "#a65b08");
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
        context.lineWidth = 1.5;
        context.strokeStyle = kind === "test" ? "#d5ffff" : "#fff0a6";
        context.stroke();
        context.beginPath();
        context.arc(x - radius * 0.33, y - radius * 0.38, Math.max(1.2, radius * 0.16), 0, Math.PI * 2);
        context.fillStyle = "#ffffffcc";
        context.fill();
      });
      if (debug) drawDebug();
    }

    function drawDebug() {
      context.save();
      context.lineWidth = 2;
      context.setLineDash([5, 4]);
      engine.world.bodies.forEach((body) => {
        if (!body.isStatic) return;
        context.beginPath();
        if (body.label.startsWith("pin:")) {
          context.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
          context.strokeStyle = "#ff4f76";
        } else {
          body.vertices.forEach((vertex, index) => {
            if (index === 0) context.moveTo(vertex.x, vertex.y);
            else context.lineTo(vertex.x, vertex.y);
          });
          context.closePath();
          context.strokeStyle = body.label === "lcd-guard" ? "#ff5ef1" : "#51f6ff";
        }
        context.stroke();
      });

      if (aperture) {
        context.beginPath();
        context.ellipse(aperture.cx, aperture.cy, aperture.rx, aperture.ry, 0, 0, Math.PI * 2);
        context.strokeStyle = "#7dff77";
        context.stroke();
      }

      const launchPosition = options.launchPosition || CONFIG.launcher.position;
      const launchVelocity = options.launchVelocity || root.PachinkoPhysicsConfig.velocityForStrength();
      context.beginPath();
      context.arc(launchPosition.x, launchPosition.y, CONFIG.ball.radius, 0, Math.PI * 2);
      context.moveTo(launchPosition.x, launchPosition.y);
      context.lineTo(launchPosition.x + launchVelocity.x * 5, launchPosition.y + launchVelocity.y * 5);
      context.strokeStyle = "#ffe45e";
      context.stroke();

      ballBodies.forEach(({ body, state }) => {
        context.beginPath();
        context.moveTo(body.position.x, body.position.y);
        context.lineTo(body.position.x + body.velocity.x * 5, body.position.y + body.velocity.y * 5);
        context.strokeStyle = "#ffffff";
        context.stroke();
        context.fillStyle = "#ffffff";
        context.fillText(`${state} / vx ${body.velocity.x.toFixed(1)} vy ${body.velocity.y.toFixed(1)}`, body.position.x + 12, body.position.y - 12);
      });
      context.restore();
    }

    function removeBall(body, outcome = "cancelled") {
      const ball = ballBodies.get(body.id);
      if (!ball) return false;
      ball.state = outcome === "hit" ? "entered" : (outcome === "escaped" ? "discharged" : "cancelled");
      registry.resolve(body.id, outcome);
      if (typeof options.onOutcome === "function") options.onOutcome(body, ball.state);
      notifyStats();
      Composite.remove(engine.world, body);
      ballBodies.delete(body.id);
      return true;
    }

    function cullEscapedBalls() {
      ballBodies.forEach(({ body, radius }) => {
        const { x, y } = body.position;
        if (x < -radius || x > VIEW_WIDTH + radius || y < -radius || y > VIEW_HEIGHT + radius) {
          removeBall(body, "escaped");
        }
      });
    }

    function addBall({ x = DEFAULT_LAUNCH.x, y = DEFAULT_LAUNCH.y, radius = CONFIG.ball.radius, kind = "test", strength = null, velocity } = {}) {
      if (destroyed || ballBodies.size >= MAX_BALLS) return null;
      const body = Bodies.circle(x, y, radius, {
        label: `ball:${kind}`,
        restitution: options.ballRestitution ?? CONFIG.ball.restitution,
        friction: options.ballFriction ?? CONFIG.ball.friction,
        frictionStatic: options.ballStaticFriction ?? CONFIG.ball.frictionStatic,
        frictionAir: options.ballAirFriction ?? CONFIG.ball.frictionAir,
        density: CONFIG.ball.density
      });
      if (velocity) Body.setVelocity(body, velocity);
      ballBodies.set(body.id, { body, radius, kind, strength, state: "falling" });
      Composite.add(engine.world, body);
      return body;
    }

    function launchBall({ kind = "ball", strength = CONFIG.launcher.defaultStrength, trackTrial = true, ...overrides } = {}) {
      const position = options.launchPosition || CONFIG.launcher.position;
      const velocity = options.launchVelocity || root.PachinkoPhysicsConfig.velocityForStrength(strength);
      const ball = addBall({ x: position.x, y: position.y, radius: CONFIG.ball.radius, velocity, kind, strength, ...overrides });
      if (ball && trackTrial) registry.recordLaunch({
        ballId: ball.id,
        strength,
        parameters: {
          launcher: { position: { x: ball.position.x, y: ball.position.y }, angleDegrees: Math.atan2(velocity.y, velocity.x) * 180 / Math.PI, velocity: { ...velocity } },
          timing: { stepMs: STEP_MS, subSteps: SUB_STEPS },
          engine: { gravity: { ...engine.gravity }, positionIterations: engine.positionIterations, velocityIterations: engine.velocityIterations, constraintIterations: engine.constraintIterations },
          ball: { radius: ball.circleRadius, restitution: ball.restitution, friction: ball.friction, frictionStatic: ball.frictionStatic, frictionAir: ball.frictionAir },
          board: {
            pin: { radius: options.pinRadius ?? CONFIG.pin.radius, restitution: options.pinRestitution ?? CONFIG.pin.restitution, friction: options.pinFriction ?? CONFIG.pin.friction },
            rail: { thickness: options.railThickness ?? CONFIG.rail.thickness, sampleGap: options.railSampleGap ?? CONFIG.rail.sampleGap, restitution: options.railRestitution ?? CONFIG.rail.restitution, friction: options.railFriction ?? CONFIG.rail.friction },
            lcdGuard: { thickness: options.lcdGuardThickness ?? CONFIG.lcdGuard.thickness, restitution: options.lcdGuardRestitution ?? CONFIG.lcdGuard.restitution, friction: options.lcdGuardFriction ?? CONFIG.lcdGuard.friction },
            entryAperture: aperture ? { ...aperture } : null
          }
        }
      });
      if (ball && trackTrial) notifyStats();
      return ball;
    }

    function step() {
      if (destroyed) return;
      for (let substep = 0; substep < SUB_STEPS; substep += 1) {
        const previous = new Map([...ballBodies].map(([id, { body }]) => [id, { x: body.position.x, y: body.position.y }]));
        Engine.update(engine, STEP_MS / SUB_STEPS);
        ballBodies.forEach(({ body }) => {
          const speed = Math.hypot(body.velocity.x, body.velocity.y);
          if (speed > MAX_SPEED) {
            Body.setVelocity(body, { x: body.velocity.x * MAX_SPEED / speed, y: body.velocity.y * MAX_SPEED / speed });
          }
          if (aperture && ENTRY.passedThrough(previous.get(body.id), body.position, aperture, ballBodies.get(body.id).radius, CONFIG.entry.ballClearance)) {
            ballBodies.get(body.id).state = "entered";
            removeBall(body, "hit");
            if (typeof options.onEntry === "function") options.onEntry(body);
          }
        });
      }
      cullEscapedBalls();
      draw();
    }

    function frame(timestamp) {
      if (!running || destroyed) return;
      if (previousTime === null) previousTime = timestamp;
      const elapsed = Math.min(timestamp - previousTime, MAX_FRAME_MS);
      previousTime = timestamp;
      accumulator += elapsed;

      while (accumulator >= STEP_MS) {
        step();
        accumulator -= STEP_MS;
      }

      animationFrame = root.requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || running) return false;
      running = true;
      previousTime = null;
      accumulator = 0;
      animationFrame = root.requestAnimationFrame(frame);
      return true;
    }

    function stop() {
      if (!running) return false;
      running = false;
      if (animationFrame !== null) root.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      previousTime = null;
      accumulator = 0;
      return true;
    }

    function onVisibilityChange() {
      if (root.document.hidden) {
        resumeAfterVisibility = running;
        stop();
      } else if (resumeAfterVisibility) {
        resumeAfterVisibility = false;
        start();
      }
    }

    root.document?.addEventListener("visibilitychange", onVisibilityChange);

    function destroy() {
      if (destroyed) return false;
      stop();
      destroyed = true;
      root.document?.removeEventListener("visibilitychange", onVisibilityChange);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      ballBodies.clear();
      context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      return true;
    }

    function setDebug(enabled) {
      debug = Boolean(enabled);
      draw();
      return debug;
    }

    function setStatsListener(listener) {
      statsListener = listener;
      notifyStats();
      return typeof statsListener === "function";
    }

    return {
      engine,
      addBall,
      launchBall,
      removeBall,
      render: draw,
      step,
      start,
      stop,
      destroy,
      setDebug,
      setStatsListener,
      stats: registry,
      get ballCount() { return ballBodies.size; },
      get isRunning() { return running; },
      get isDestroyed() { return destroyed; }
    };
  }

  function init(board, options = {}) {
    if (!board || instances.has(board)) return instances.get(board) || null;
    const svg = board.querySelector(".board-component-map");
    const canvas = board.querySelector("[data-physics-canvas]");
    if (!svg || !canvas) return null;

    const debugFromQuery = root.location && new URLSearchParams(root.location.search).get("physicsDebug") === "1";
    const simulation = createSimulation({ Matter: options.Matter || root.Matter, svg, canvas, options: { ...options, debug: options.debug ?? (debugFromQuery || board.dataset.physicsDebug === "true") } });
    instances.set(board, simulation);
    const destroySimulation = simulation.destroy;
    simulation.destroy = () => {
      const destroyed = destroySimulation();
      if (destroyed) instances.delete(board);
      return destroyed;
    };
    simulation.launchBall({ radius: CONFIG.ball.radius, kind: "test", trackTrial: false });
    simulation.render();
    simulation.start();
    return simulation;
  }

  const api = {
    init,
    get: (board) => instances.get(board) || null,
    createSimulation,
    maxBalls: MAX_BALLS,
    viewBox: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
    config: root.PachinkoPhysicsConfig,
    defaultLaunch: DEFAULT_LAUNCH
  };
  root.PachinkoPhysics = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (root.document) {
    root.document.addEventListener("DOMContentLoaded", () => {
      root.document.querySelectorAll("[data-board-scene]").forEach((board) => init(board));
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
