(function (root) {
  "use strict";

  // 見た目合わせ用の仮初期値。実機で測定した寸法・物理定数ではありません。
  const CONFIG = {
    viewBox: { width: 1015, height: 1550 },
    timing: { stepMs: 1000 / 60, subSteps: 2, maxFrameMs: 100 },
    capacity: { maxBalls: 50, maxSpeed: 18 },
    engine: {
      gravity: { x: 0, y: 1, scale: 0.00025 },
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 2,
      enableSleeping: true
    },
    ball: { radius: 8, restitution: 0.35, friction: 0.025, frictionStatic: 0.01, frictionAir: 0.001, density: 0.001 },
    pin: { radius: 6, visualClearance: 1, restitution: 0.35, friction: 0.04 },
    rail: { thickness: 8, laneThickness: 5, restitution: 0.08, friction: 0.02, sampleGap: 10, segmentSizeFactor: 1.5 },
    lcdGuard: { thickness: 7, restitution: 0.15, friction: 0.005 },
    launcher: {
      position: { x: 145, y: 1280 },
      angleDegrees: -101.31,
      defaultStrength: "medium",
      speeds: { weak: 13.2, medium: 15.3, strong: 17 }
    },
    entry: { selector: "[data-physics-role='entry-sensor']", ballClearance: 0 },
    exit: { margin: 8 },
    targetHitRatePercent: null
  };

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function velocityForStrength(strength = CONFIG.launcher.defaultStrength) {
    const speed = CONFIG.launcher.speeds[strength];
    if (typeof speed !== "number") throw new RangeError(`Unknown launch strength: ${strength}`);
    const radians = CONFIG.launcher.angleDegrees * Math.PI / 180;
    return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
  }

  const api = Object.freeze({
    values: Object.freeze(CONFIG),
    copy,
    velocityForStrength
  });
  root.PachinkoPhysicsConfig = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
