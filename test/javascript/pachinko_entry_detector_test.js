const test = require("node:test");
const assert = require("node:assert/strict");
const detector = require("../../app/assets/javascripts/pachinko_entry_detector.js");

const apertureElement = {
  getAttribute(name) { return ({ cx: "508", cy: "1392", rx: "23", ry: "13" })[name]; }
};

test("requires a radius-adjusted downward passage through the SVG opening", () => {
  const aperture = detector.readEllipse(apertureElement);
  assert.deepEqual(aperture, { cx: 508, cy: 1392, rx: 23, ry: 13 });
  assert.equal(detector.passedThrough({ x: 508, y: 1370 }, { x: 508, y: 1410 }, aperture, 8), true);
  assert.equal(detector.passedThrough({ x: 530, y: 1370 }, { x: 530, y: 1410 }, aperture, 8), false);
  assert.equal(detector.passedThrough({ x: 508, y: 1410 }, { x: 508, y: 1370 }, aperture, 8), false);
});
