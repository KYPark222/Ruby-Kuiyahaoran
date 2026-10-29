document.addEventListener("DOMContentLoaded", () => {
  const power = document.querySelector("#launch-power");
  const readout = document.querySelector("#power-readout");

  if (power && readout) {
    power.addEventListener("input", () => {
      readout.value = `${power.value}%`;
    });
  }

  const board = document.querySelector("[data-board-scene]");
  const simulation = board ? window.PachinkoPhysics?.get(board) : null;
  const targetInput = document.querySelector("#target-hit-rate");
  const applyTarget = document.querySelector("#apply-target-rate");
  const targetStatus = document.querySelector("#target-rate-status");

  function renderPhysicsStats(stats) {
    const overall = stats.overall;
    document.querySelector("#physics-completed").textContent = overall.completed.toLocaleString("ja-JP");
    document.querySelector("#physics-pending").textContent = overall.pending.toLocaleString("ja-JP");
    document.querySelector("#physics-hits").textContent = overall.hits.toLocaleString("ja-JP");
    document.querySelector("#physics-rate").textContent = overall.measuredRatePercent === null
      ? "—"
      : `${overall.measuredRatePercent.toFixed(2)}%`;
    document.querySelector("#physics-rate-difference").textContent = overall.differencePercentagePoints === null
      ? "—"
      : `${overall.differencePercentagePoints > 0 ? "+" : ""}${overall.differencePercentagePoints.toFixed(2)}pt`;
    ["weak", "medium", "strong"].forEach((strength) => {
      const result = stats.byStrength[strength] || { completed: 0, hits: 0, measuredRatePercent: null };
      document.querySelector(`#physics-${strength}-stats`).textContent = result.measuredRatePercent === null
        ? `${result.completed}件 / —`
        : `${result.hits}/${result.completed}件・${result.measuredRatePercent.toFixed(1)}%`;
    });
  }

  if (simulation) simulation.setStatsListener(renderPhysicsStats);

  if (simulation && targetInput && applyTarget && targetStatus) {
    applyTarget.addEventListener("click", () => {
      if (targetInput.value.trim() === "") {
        simulation.stats.setTargetRate(null);
        targetStatus.textContent = "目標値は未設定";
      } else {
        const target = Number(targetInput.value);
        if (!Number.isFinite(target) || target < 0 || target > 100) {
          targetStatus.textContent = "0〜100の数値を入力してください";
          return;
        }
        simulation.stats.setTargetRate(target);
        targetStatus.textContent = `目標 ${target.toFixed(1)}% を設定しました`;
      }
      renderPhysicsStats(simulation.stats.snapshot());
    });
  }
});
