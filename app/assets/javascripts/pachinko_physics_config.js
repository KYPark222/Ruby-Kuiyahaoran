(function (root) {
  "use strict";

  // 見た目合わせ用の仮初期値。形状は実機の実測値ではありませんが、重力と発射速度は
  // 玉径11mm・表示半径8px（1px≒0.6875mm）を基準に実スケールへ換算し、視認性のため
  // 時間スケールを1/3（3倍スロー）にして表示しています。
  const CONFIG = {
    viewBox: { width: 1015, height: 1550 },
    timing: { stepMs: 1000 / 60, subSteps: 6, maxFrameMs: 100 },
    capacity: { maxBalls: 50, maxSpeed: 46, stallSpeed: 0.2, stallSteps: 720 },
    engine: {
      // 実重力換算は 9.80665m/s² × 1.4545px/mm ≒ 14,264px/s²（scale 0.01426）。
      // Matter.jsの有効加速度は scale × 10^6 px/s²。3倍スローなので 1/9 の 0.001585。
      gravity: { x: 0, y: 1, scale: 0.001585 },
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 2,
      enableSleeping: true
    },
    ball: { radius: 8, restitution: 0.35, friction: 0.025, frictionStatic: 0.01, frictionAir: 0.001, density: 0.001 },
    pin: { radius: 6, visualClearance: 1, restitution: 0.35, friction: 0.04 },
    rail: { thickness: 8, laneThickness: 5, restitution: 0.08, friction: 0.02, frictionStatic: 0.01, sampleGap: 10, segmentSizeFactor: 1.5 },
    lcdGuard: { thickness: 7, restitution: 0.15, friction: 0.005 },
    launcher: {
      position: { x: 145, y: 1280 },
      angleDegrees: -101.31,
      defaultStrength: "medium",
      // 実スケール（弱99.7 / 中115.6 / 強128.4）の1/3。中打ちは約1.6m/s。
      speeds: { weak: 33.24, medium: 38.53, strong: 42.81 }
    },
    entry: {
      selector: "[data-physics-role='entry-sensor']",
      ballClearance: 0,
      guideWalls: { offsetX: 26, startY: -15, endY: 18, thickness: 6 }
    },
    autoLaunch: { intervalMs: 1800, maxConcurrent: 3, angleJitterDegrees: 1.2 },
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
