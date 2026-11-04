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
  const lcdInterface = document.querySelector("#lcd-interface");
  const reels = document.querySelector("#symbol-reels");
  const reelColumns = Array.from(document.querySelectorAll("#symbol-reels [data-symbol-column]"));
  const lcdHint = document.querySelector(".lcd-hint");
  const REEL_TICK_MS = 70;
  const REEL_STOP_DELAYS_MS = [700, 1050, 1400];
  let holdCount = 0;
  let pendingSpins = 0;
  let spinInProgress = false;

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

  function setLcdState(state) {
    if (lcdInterface) lcdInterface.setAttribute("data-lcd-state", state);
    if (!lcdHint) return;
    lcdHint.textContent = {
      spinning: "抽選中",
      jackpot: "大当たり",
      miss: "抽選完了",
      normal: "静止画面"
    }[state] || "静止画面";
  }

  function randomDigit() {
    return 1 + Math.floor(Math.random() * 9);
  }

  function setColumnDigit(column, digit) {
    const strong = column.querySelector("strong");
    if (strong) strong.textContent = String(digit);
    const neighbors = column.querySelectorAll(".neighbor-symbol");
    if (neighbors[0]) neighbors[0].textContent = String(digit === 1 ? 9 : digit - 1);
    if (neighbors[1]) neighbors[1].textContent = String(digit === 9 ? 1 : digit + 1);
  }

  function finalDigitsFor(result) {
    if (result === "jackpot") return [7, 7, 7];
    const digits = [randomDigit(), randomDigit(), randomDigit()];
    if (digits[0] === digits[1] && digits[1] === digits[2]) digits[2] = (digits[2] % 9) + 1;
    return digits;
  }

  function spinReels(result) {
    return new Promise((resolve) => {
      if (!reels || reelColumns.length !== 3) {
        resolve();
        return;
      }

      const finalDigits = finalDigitsFor(result);
      const stopped = [false, false, false];
      let elapsed = 0;

      reels.classList.remove("is-jackpot", "is-miss");
      reels.classList.add("is-spinning");
      reels.setAttribute("aria-label", "図柄回転中");
      setLcdState("spinning");
      setGameMessage("抽選中…");

      const timer = window.setInterval(() => {
        elapsed += REEL_TICK_MS;
        reelColumns.forEach((column, index) => {
          if (!stopped[index]) setColumnDigit(column, randomDigit());
        });
        REEL_STOP_DELAYS_MS.forEach((delay, index) => {
          if (stopped[index] || elapsed < delay) return;
          stopped[index] = true;
          setColumnDigit(reelColumns[index], finalDigits[index]);
          reelColumns[index].classList.add("is-stopped");
        });

        if (!stopped.every(Boolean)) return;
        window.clearInterval(timer);
        reels.classList.remove("is-spinning");
        reels.classList.add(result === "jackpot" ? "is-jackpot" : "is-miss");
        reels.setAttribute("aria-label", `図柄 ${finalDigits.join("・")}`);
        setLcdState(result === "jackpot" ? "jackpot" : "miss");
        setGameMessage(result === "jackpot" ? "大当たり" : "抽選：はずれ");

        window.setTimeout(() => {
          reelColumns.forEach((column) => column.classList.remove("is-stopped"));
          resolve();
        }, result === "jackpot" ? 1200 : 600);
      }, REEL_TICK_MS);
    });
  }

  async function consumeHoldAndSpin() {
    const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
    const response = await fetch("/pachinko/consume", {
      method: "POST",
      headers: { "Accept": "application/json", "X-CSRF-Token": csrfToken || "" }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保留の消費に失敗しました");
    renderHoldCount(result.hold_count);
    if (!result.consumed) {
      pendingSpins = 0;
      return null;
    }
    pendingSpins = Math.max(0, pendingSpins - 1);
    await spinReels(result.result);
    return result;
  }

  async function processPendingSpins() {
    if (spinInProgress) return;
    spinInProgress = true;
    try {
      while (pendingSpins > 0) {
        await consumeHoldAndSpin();
      }
    } catch (error) {
      pendingSpins = 0;
      setGameMessage("抽選処理に失敗しました");
      console.error(error);
    } finally {
      spinInProgress = false;
      if (pendingSpins > 0) processPendingSpins();
    }
  }

  function enqueueSpin() {
    pendingSpins += 1;
    processPendingSpins();
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
    const autoConfig = window.PachinkoPhysicsConfig?.values?.autoLaunch || { intervalMs: 1000, maxConcurrent: 10, angleJitterDegrees: 1.2 };
    let autoStrength = window.PachinkoPhysicsConfig?.values?.launcher?.defaultStrength || "medium";
    const initialHoldCount = Number(document.querySelector("#lcd-holds")?.dataset.holdCount);
    if (Number.isFinite(initialHoldCount)) {
      renderHoldCount(initialHoldCount);
      if (initialHoldCount > 0) {
        pendingSpins = initialHoldCount;
        processPendingSpins();
      }
    }

    function launchAutomatically() {
      if (!simulation.isRunning || simulation.isDestroyed) return;
      if (simulation.ballCount >= autoConfig.maxConcurrent) return;
      const base = window.PachinkoPhysicsConfig.velocityForStrength(autoStrength);
      const jitter = (Math.random() * 2 - 1) * autoConfig.angleJitterDegrees * Math.PI / 180;
      const cos = Math.cos(jitter);
      const sin = Math.sin(jitter);
      simulation.launchBall({
        kind: "game",
        strength: autoStrength,
        velocity: { x: base.x * cos - base.y * sin, y: base.x * sin + base.y * cos }
      });
    }

    setInterval(launchAutomatically, autoConfig.intervalMs);
    if (simulation.isRunning) setGameMessage("自動発射中");

    document.querySelectorAll("[data-launch-strength]").forEach((button) => {
      button.addEventListener("click", () => {
        autoStrength = button.dataset.launchStrength;
        const ball = simulation.launchBall({ kind: "game", strength: autoStrength });
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
      if (result.accepted) enqueueSpin();
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
