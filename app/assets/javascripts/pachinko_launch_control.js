(function (root, factory) {
  "use strict";

  const api = factory(root);
  root.PachinkoLaunchControl = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    holdLimit: 4,
    resumeHoldCount: 3,
    stopDelayMs: 600
  });

  function defaultNow() {
    return root.performance && typeof root.performance.now === "function"
      ? root.performance.now()
      : Date.now();
  }

  function defaultSetTimer(callback, delayMs) {
    return root.setTimeout(callback, delayMs);
  }

  function createLaunchControl(options = {}) {
    const config = Object.freeze({
      holdLimit: Number(options.holdLimit) || DEFAULTS.holdLimit,
      resumeHoldCount: Number.isFinite(Number(options.resumeHoldCount))
        ? Number(options.resumeHoldCount)
        : DEFAULTS.resumeHoldCount,
      stopDelayMs: Math.max(600, Number(options.stopDelayMs) || DEFAULTS.stopDelayMs)
    });
    const now = typeof options.now === "function" ? options.now : defaultNow;
    const setTimer = typeof options.setTimer === "function" ? options.setTimer : defaultSetTimer;

    let manualStopped = false;
    let holdStopped = false;
    let pendingStopAt = null;
    let stopToken = 0;
    let listener = null;

    function snapshot() {
      return {
        manualStopped,
        holdStopped,
        pending: pendingStopAt !== null,
        stopped: manualStopped || holdStopped,
        canLaunch: !manualStopped && !holdStopped,
        holdLimit: config.holdLimit,
        resumeHoldCount: config.resumeHoldCount,
        stopDelayMs: config.stopDelayMs,
        remainingStopDelayMs: pendingStopAt === null ? 0 : Math.max(0, pendingStopAt - now())
      };
    }

    function notify(reason) {
      if (listener) listener(snapshot(), reason);
    }

    function resume() {
      stopToken += 1;
      pendingStopAt = null;
      manualStopped = false;
      notify("resumed");
      return snapshot();
    }

    function requestStop() {
      // The button never stops the launch loop immediately. Firing continues for
      // at least `stopDelayMs` (0.6s by default, matching the 600ms launch pace).
      if (holdStopped && !manualStopped && pendingStopAt === null) {
        manualStopped = true;
        notify("stopped");
        return snapshot();
      }
      if (manualStopped || pendingStopAt !== null) return resume();

      const token = ++stopToken;
      pendingStopAt = now() + config.stopDelayMs;
      notify("stop-pending");
      setTimer(() => {
        if (token !== stopToken) return;
        pendingStopAt = null;
        manualStopped = true;
        notify("stopped");
      }, config.stopDelayMs);
      return snapshot();
    }

    function setHoldCount(value) {
      const count = Math.max(0, Number(value) || 0);
      if (count >= config.holdLimit) {
        if (!holdStopped) {
          holdStopped = true;
          notify("hold-full");
        }
      } else if (count <= config.resumeHoldCount && holdStopped) {
        holdStopped = false;
        notify("hold-resumed");
      }
      return snapshot();
    }

    function canLaunch() {
      return !manualStopped && !holdStopped;
    }

    function subscribe(callback) {
      listener = typeof callback === "function" ? callback : null;
      return () => {
        if (listener === callback) listener = null;
      };
    }

    return {
      config,
      requestStop,
      resume,
      setHoldCount,
      canLaunch,
      snapshot,
      subscribe
    };
  }

  return Object.freeze({ DEFAULTS, createLaunchControl });
});
