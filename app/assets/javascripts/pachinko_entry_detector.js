(function (root) {
  "use strict";

  function readEllipse(element) {
    if (!element) return null;
    const values = ["cx", "cy", "rx", "ry"].map((name) => Number(element.getAttribute(name)));
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
    return { cx: values[0], cy: values[1], rx: values[2], ry: values[3] };
  }

  function containsCenter(x, y, aperture, ballRadius, clearance = 0) {
    const rx = aperture.rx - ballRadius - clearance;
    const ry = aperture.ry - ballRadius - clearance;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (x - aperture.cx) / rx;
    const dy = (y - aperture.cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function passedThrough(previous, current, aperture, ballRadius, clearance = 0) {
    if (!previous || !current || !aperture || current.y <= previous.y) return false;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const samples = Math.max(1, Math.ceil(distance / Math.max(1, ballRadius / 2)));
    for (let index = 1; index <= samples; index += 1) {
      const ratio = index / samples;
      const x = previous.x + (current.x - previous.x) * ratio;
      const y = previous.y + (current.y - previous.y) * ratio;
      if (containsCenter(x, y, aperture, ballRadius, clearance)) return true;
    }
    return false;
  }

  const api = Object.freeze({ readEllipse, containsCenter, passedThrough });
  root.PachinkoEntryDetector = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
