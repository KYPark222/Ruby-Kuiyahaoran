(function (root) {
  "use strict";

  function createRegistry({ targetRatePercent = null, now = () => new Date() } = {}) {
    let target = targetRatePercent;
    let sequence = 0;
    const attempts = new Map();
    const events = [];

    function timestamp() { return now().toISOString(); }

    function setTargetRate(percent) {
      if (percent !== null && (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100)) {
        throw new RangeError("Target hit rate must be null or between 0 and 100 percent");
      }
      target = percent;
      return target;
    }

    function recordLaunch({ ballId, strength, parameters }) {
      if (attempts.has(ballId)) throw new Error(`Ball ${ballId} is already registered`);
      sequence += 1;
      const record = {
        id: `${timestamp()}-${sequence}`,
        ballId,
        strength,
        parameters: JSON.parse(JSON.stringify(parameters)),
        launchedAt: timestamp(),
        outcome: null,
        resolvedAt: null
      };
      attempts.set(ballId, record);
      events.push(record);
      return record.id;
    }

    function resolve(ballId, outcome) {
      if (!["hit", "escaped", "cancelled"].includes(outcome)) throw new RangeError(`Unknown outcome: ${outcome}`);
      const record = attempts.get(ballId);
      if (!record || record.outcome) return false;
      record.outcome = outcome;
      record.resolvedAt = timestamp();
      return true;
    }

    function aggregate(records) {
      const launched = records.length;
      const hits = records.filter((record) => record.outcome === "hit").length;
      const escaped = records.filter((record) => record.outcome === "escaped").length;
      const cancelled = records.filter((record) => record.outcome === "cancelled").length;
      const completed = hits + escaped;
      const measuredRatePercent = completed === 0 ? null : hits / completed * 100;
      return {
        launched,
        completed,
        pending: launched - completed - cancelled,
        hits,
        escaped,
        cancelled,
        measuredRatePercent,
        targetRatePercent: target,
        differencePercentagePoints: target === null || measuredRatePercent === null ? null : measuredRatePercent - target
      };
    }

    function snapshot() {
      const byStrength = {};
      for (const strength of new Set(events.map((record) => record.strength))) {
        byStrength[strength] = aggregate(events.filter((record) => record.strength === strength));
      }
      return {
        sessionId: `physics-${events[0]?.launchedAt || timestamp()}`,
        targetRatePercent: target,
        overall: aggregate(events),
        byStrength,
        trials: events.map((record) => ({ ...record, parameters: JSON.parse(JSON.stringify(record.parameters)) }))
      };
    }

    function reset() {
      attempts.clear();
      events.length = 0;
      sequence = 0;
    }

    return { setTargetRate, recordLaunch, resolve, snapshot, reset };
  }

  const api = Object.freeze({ createRegistry });
  root.PachinkoTrialStats = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
