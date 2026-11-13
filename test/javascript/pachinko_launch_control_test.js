const test = require("node:test");
const assert = require("node:assert/strict");
const { createLaunchControl, DEFAULTS } = require("../../app/assets/javascripts/pachinko_launch_control.js");

function createHarness(options = {}) {
  let time = 0;
  const timers = [];
  const control = createLaunchControl({
    ...options,
    now: () => time,
    setTimer: (callback, delayMs) => {
      const timer = { at: time + delayMs, callback };
      timers.push(timer);
      return timer;
    }
  });

  function advance(ms) {
    const target = time + ms;
    while (true) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      time = next.at;
      next.callback();
    }
    time = target;
  }

  return { control, advance, timers };
}

test("defaults match the hold limit and 0.6 second stop rule", () => {
  assert.equal(DEFAULTS.holdLimit, 4);
  assert.equal(DEFAULTS.resumeHoldCount, 3);
  assert.equal(DEFAULTS.stopDelayMs, 600);
  const { control } = createHarness();
  assert.equal(control.config.stopDelayMs, 600);
  assert.equal(control.canLaunch(), true);
});

test("keeps launching for at least 600ms after the stop button is pressed", () => {
  const { control, advance } = createHarness();
  control.setHoldCount(0);

  control.requestStop();
  assert.equal(control.snapshot().pending, true);
  assert.equal(control.canLaunch(), true);

  advance(599);
  assert.equal(control.canLaunch(), true, "still launching just before 0.6 seconds");
  assert.equal(control.snapshot().manualStopped, false);

  advance(1);
  assert.equal(control.canLaunch(), false);
  assert.equal(control.snapshot().manualStopped, true);
});

test("cancels a pending stop and resumes when pressed again", () => {
  const { control, advance } = createHarness();
  control.requestStop();
  advance(300);
  control.resume();
  advance(1000);

  assert.equal(control.canLaunch(), true);
  assert.equal(control.snapshot().pending, false);
  assert.equal(control.snapshot().manualStopped, false);
});

test("stops immediately when holds reach 4 and resumes at 3 or fewer", () => {
  const { control } = createHarness();
  const reasons = [];
  control.subscribe((state, reason) => reasons.push(reason));

  control.setHoldCount(3);
  assert.equal(control.canLaunch(), true);

  control.setHoldCount(4);
  assert.equal(control.canLaunch(), false);
  assert.equal(control.snapshot().holdStopped, true);

  control.setHoldCount(4);
  assert.deepEqual(reasons, ["hold-full"], "does not notify repeatedly while full");

  control.setHoldCount(3);
  assert.equal(control.canLaunch(), true);
  assert.equal(control.snapshot().holdStopped, false);
  assert.deepEqual(reasons, ["hold-full", "hold-resumed"]);
});

test("hold auto-resume does not override an explicit manual stop", () => {
  const { control, advance } = createHarness();
  control.requestStop();
  advance(600);
  assert.equal(control.canLaunch(), false);

  control.setHoldCount(4);
  control.setHoldCount(1);
  assert.equal(control.canLaunch(), false, "manual stop remains in effect");
  assert.equal(control.snapshot().manualStopped, true);
});

test("pressing stop while hold-full makes the stop immediate", () => {
  const { control } = createHarness();
  control.setHoldCount(4);
  assert.equal(control.canLaunch(), false);
  assert.equal(control.snapshot().manualStopped, false);

  control.requestStop();
  assert.equal(control.snapshot().manualStopped, true);
  assert.equal(control.snapshot().pending, false);
});

test("never accepts a stop delay shorter than 0.6 seconds", () => {
  const { control } = createHarness({ stopDelayMs: 100 });
  assert.equal(control.config.stopDelayMs, 600);
});
