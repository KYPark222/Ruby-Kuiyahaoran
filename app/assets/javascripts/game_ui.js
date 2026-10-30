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
  let holdCount = 0;

  function renderHoldCount(count) {
    holdCount = Math.max(0, Math.min(4, Number(count) || 0));
    document.querySelectorAll(".hold-lights i, .lcd-holds i").forEach((light, index) => {
      light.classList.toggle("hold-on", index < holdCount);
    });
    document.querySelector(".hold-lights")?.setAttribute("aria-label", `保留${holdCount}個`);
    document.querySelector(".lcd-holds")?.setAttribute("aria-label", `保留${holdCount}個`);
    const summary = document.querySelector(".hold-summary small");
    if (summary) summary.textContent = `${holdCount} / 4`;
  }

  function setGameMessage(message) {
    const lcdMessage = document.querySelector("#lcd-message");
    if (lcdMessage) lcdMessage.textContent = message;
    const machineState = document.querySelector(".machine-state strong");
    if (machineState) machineState.textContent = message;
  }

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

  if (simulation) {
    document.querySelectorAll("[data-launch-strength]").forEach((button) => {
      button.addEventListener("click", () => {
        const ball = simulation.launchBall({ kind: "game", strength: button.dataset.launchStrength });
        if (!ball) setGameMessage("玉の上限に達しています");
        else setGameMessage("発射中");
      });
    });

    document.querySelector("[data-simulation-action='stop']")?.addEventListener("click", () => {
      simulation.stop();
      setGameMessage("停止中");
    });
    document.querySelector("[data-simulation-action='pause']")?.addEventListener("click", () => {
      if (simulation.isRunning) {
        simulation.stop();
        setGameMessage("一時停止中");
      } else {
        simulation.start();
        setGameMessage("遊技中");
      }
    });
    document.querySelector("[data-simulation-action='reset']")?.addEventListener("click", async () => {
      const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
      const response = await fetch("/pachinko/reset", { method: "POST", headers: { "X-CSRF-Token": csrfToken || "" } });
      if (response.ok) window.location.reload();
    });
  }

  document.addEventListener("pachinko:entry", async ({ detail }) => {
    try {
      const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
      const response = await fetch("/pachinko/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": csrfToken || "" },
        body: JSON.stringify({ ball_id: detail.ballId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "入賞処理に失敗しました");
      renderHoldCount(result.hold_count);
      if (result.accepted) setGameMessage(result.result === "jackpot" ? "大当たり" : "抽選：はずれ");
      else if (result.full) setGameMessage("保留満タン");
    } catch (error) {
      setGameMessage("入賞処理に失敗しました");
      console.error(error);
    }
  });

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
