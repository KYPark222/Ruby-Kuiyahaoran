document.addEventListener("DOMContentLoaded", () => {
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
  const CHART_WIDTH = 220;
  const CHART_HEIGHT = 92;
  const integerFormatter = new Intl.NumberFormat("ja-JP");
  const historyKindLabels = { first: "初当たり", st: "ST", lush: "LUSH" };
  let holdCount = 0;
  let pendingSpins = 0;
  let spinInProgress = false;
  let outOfBalls = false;
  let lastHistorySignature = "";
  let launchControl = null;
  const gameCore = window.PachinkoGameCore;
  const statsStore = window.PachinkoSessionStats;
  let useGameCore = Boolean(gameCore && gameCore.isEnabled());

  function renderHoldCount(count) {
    holdCount = Math.max(0, Math.min(4, Number(count) || 0));
    document.querySelectorAll(".hold-lights i, .lcd-holds i").forEach((light, index) => {
      light.classList.toggle("hold-on", index < holdCount);
    });
    document.querySelector(".hold-lights")?.setAttribute("aria-label", `保留${holdCount}個`);
    document.querySelector(".lcd-holds")?.setAttribute("aria-label", `保留${holdCount}個`);
    const summary = document.querySelector(".hold-summary small");
    if (summary) summary.textContent = `${holdCount} / 4`;
    launchControl?.setHoldCount(holdCount);
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

  function formatInteger(value) {
    return integerFormatter.format(Math.abs(Number(value) || 0));
  }

  function formatYen(value) {
    return `¥${formatInteger(value)}`;
  }

  function formatSignedInteger(value) {
    const number = Number(value) || 0;
    const sign = number > 0 ? "+" : number < 0 ? "−" : "±";
    return `${sign}${formatInteger(number)}`;
  }

  function formatSignedYen(value) {
    return formatSignedInteger(value).replace(/^([+−±])/, "$1¥");
  }

  function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  function toggleAmountClass(element, value) {
    if (!element) return;
    element.classList.toggle("positive", value > 0);
    element.classList.toggle("negative", value < 0);
  }

  function renderJackpotHistory(snapshot) {
    const list = document.querySelector("#jackpot-history");
    setText("#jackpot-count", String(snapshot.jackpotCount));
    if (!list) return;

    list.replaceChildren();
    if (snapshot.jackpots.length === 0) {
      const empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "まだ大当たりはありません";
      list.append(empty);
      return;
    }

    snapshot.jackpots.forEach((record) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      const date = new Date(record.at);
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      const type = document.createElement("span");
      type.className = "history-type";
      type.textContent = `${record.roundCount}R`;
      const mode = document.createElement("span");
      mode.className = "history-mode";
      mode.textContent = historyKindLabels[record.kind] || "通常";
      item.title = `払出 ${formatInteger(record.payoutBalls)}玉`;
      item.append(time, type, mode);
      list.append(item);
    });
  }

  function renderBalanceChart(snapshot, metrics) {
    const panel = document.querySelector("#balance-chart-panel");
    const line = document.querySelector("#balance-chart-line");
    const area = document.querySelector("#balance-chart-area");
    const zero = document.querySelector("#balance-chart-zero");
    const dot = document.querySelector("#balance-chart-dot");
    if (!statsStore || !panel || !line || !area || !zero || !dot) return;

    const geometry = statsStore.chartGeometry({
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      paddingX: 6,
      paddingY: 10,
      minRangeYen: 1000
    });
    line.setAttribute("d", geometry.linePath);
    area.setAttribute("d", geometry.areaPath);
    zero.setAttribute("y1", String(geometry.zeroY));
    zero.setAttribute("y2", String(geometry.zeroY));
    dot.setAttribute("cx", String(geometry.lastX));
    dot.setAttribute("cy", String(geometry.lastY));
    dot.style.display = geometry.pointCount > 0 ? "" : "none";
    panel.classList.toggle("is-negative", metrics.balanceYen < 0);
    panel.classList.toggle("is-positive", metrics.balanceYen > 0);

    const current = document.querySelector("#balance-chart-current");
    if (current) {
      current.textContent = formatSignedYen(metrics.balanceYen);
      current.classList.toggle("negative", metrics.balanceYen < 0);
    }

    const history = snapshot.balanceHistory;
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const delta = previous ? metrics.balanceYen - previous.balanceYen : 0;
    const trend = delta > 0 ? "▲" : delta < 0 ? "▼" : "±";
    setText("#balance-chart-points", `${trend}${formatYen(Math.abs(delta))}`);
  }

  function renderSessionStats() {
    if (!statsStore) return;
    const snapshot = statsStore.snapshot();
    const metrics = statsStore.metrics();

    setText("#current-balls", formatInteger(metrics.currentBalls));
    setText("#invested-yen", formatYen(metrics.investedYen));
    setText("#payout-balls", formatInteger(metrics.payoutBalls));
    setText("#difference-balls", formatSignedInteger(metrics.differenceBalls));
    setText("#balance-yen", formatSignedYen(metrics.balanceYen));
    toggleAmountClass(document.querySelector("#difference-balls-cell"), metrics.differenceBalls);
    toggleAmountClass(document.querySelector("#balance-yen-cell"), metrics.balanceYen);

    setText("#normal-spins", formatInteger(metrics.normalSpins));
    setText("#st-spins", formatInteger(metrics.stSpins));
    setText("#first-hits", formatInteger(metrics.firstHits));
    setText("#lush-entries", formatInteger(metrics.lushEntries));
    setText("#current-streak", formatInteger(metrics.currentStreak > 1 ? metrics.currentStreak : 0));
    setText("#max-streak", formatInteger(metrics.maxStreak));
    setText("#launched-balls", formatInteger(metrics.launchedBalls));

    const historySignature = `${snapshot.jackpotCount}:${snapshot.jackpots[0]?.id || ""}`;
    if (historySignature !== lastHistorySignature) {
      renderJackpotHistory(snapshot);
      lastHistorySignature = historySignature;
    }
    renderBalanceChart(snapshot, metrics);
  }

  function hasBallsForLaunch() {
    return !statsStore || statsStore.metrics().currentBalls > 0;
  }

  function recordLaunch() {
    statsStore?.recordLaunch();
    renderSessionStats();
  }

  function recordConsumedSpin(phase, outcome) {
    if (!statsStore) return;
    statsStore.recordSpin(phase === "st" ? "st" : "normal");
    if (outcome === "jackpot") {
      const info = gameCore?.jackpotInfo?.();
      if (info) {
        statsStore.recordJackpot({
          roundCount: info.roundCount,
          payoutBalls: info.payoutBalls,
          phase: phase === "st" || phase === "lush" ? phase : "normal"
        });
      }
    }
    renderSessionStats();
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

  async function mirrorCoreEntry(ballId) {
    try {
      const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
      const response = await fetch("/pachinko/entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": csrfToken || ""
        },
        body: JSON.stringify({ ball_id: ballId })
      });
      if (!response.ok) throw new Error("Rails保留のミラーに失敗しました");
    } catch (error) {
      // The TypeScript core is authoritative; the Rails session is only a
      // display mirror during the staged migration.
      console.warn("Rails entry mirror failed", error);
    }
  }

  async function consumeRailsHoldWithoutDraw() {
    try {
      const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
      const response = await fetch("/pachinko/consume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": csrfToken || ""
        },
        body: JSON.stringify({ draw: false })
      });
      if (!response.ok) throw new Error("Rails保留の同期に失敗しました");
    } catch (error) {
      console.warn("Rails consume mirror failed", error);
    }
  }

  async function consumeCoreHoldAndSpin() {
    const phaseBefore = gameCore.phase();
    const result = gameCore.consumeHold();
    renderHoldCount(result.holdCount);
    if (!result.consumed || !result.hold) {
      pendingSpins = 0;
      return null;
    }
    pendingSpins = Math.max(0, pendingSpins - 1);
    recordConsumedSpin(phaseBefore, result.hold.draw.outcome);
    await consumeRailsHoldWithoutDraw();
    await spinReels(result.hold.draw.outcome);
    return result;
  }

  async function consumeHoldAndSpin() {
    if (useGameCore) return consumeCoreHoldAndSpin();
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
    recordConsumedSpin("normal", result.result);
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
    ["left", "right"].forEach((mode) => {
      const result = stats.byMode[mode] || { completed: 0, hits: 0, measuredRatePercent: null };
      document.querySelector(`#physics-${mode}-stats`).textContent = result.measuredRatePercent === null
        ? `${result.completed}件 / —`
        : `${result.hits}/${result.completed}件・${result.measuredRatePercent.toFixed(1)}%`;
    });
  }

  if (simulation) simulation.setStatsListener(renderPhysicsStats);

  if (simulation) {
    const autoConfig = window.PachinkoPhysicsConfig?.values?.autoLaunch || {
      intervalMs: 600,
      stopDelayMs: 600,
      holdLimit: 4,
      resumeHoldCount: 3,
      maxConcurrent: 20,
      angleJitterDegrees: 1.2
    };
    let autoMode = window.PachinkoPhysicsConfig?.values?.launcher?.defaultMode || "left";
    const stopDelaySeconds = Math.max(0, Number(autoConfig.stopDelayMs) || 600) / 1000;
    const stopButton = document.querySelector("[data-simulation-action='stop']");

    launchControl = window.PachinkoLaunchControl.createLaunchControl({
      holdLimit: autoConfig.holdLimit,
      resumeHoldCount: autoConfig.resumeHoldCount,
      stopDelayMs: autoConfig.stopDelayMs
    });

    function launchMessage() {
      if (!simulation.isRunning) return "一時停止中";
      const launch = launchControl.snapshot();
      if (launch.manualStopped) return "打ち出し停止中";
      if (launch.holdStopped) return "保留満タン・打ち出し停止";
      return "自動発射中";
    }

    function renderStopButton(state = launchControl.snapshot()) {
      if (!stopButton) return;
      const active = state.manualStopped || state.pending;
      stopButton.classList.toggle("is-active", active);
      stopButton.setAttribute("aria-pressed", String(active));
      if (stopButton.firstChild?.nodeType === 3) {
        stopButton.firstChild.nodeValue = state.manualStopped ? "▶ " : "■ ";
      }
      const label = stopButton.querySelector("span");
      if (label) {
        label.textContent = state.manualStopped
          ? "打ち出し再開"
          : state.pending
            ? "停止をキャンセル"
            : "打ち出し停止";
      }
    }

    launchControl.subscribe((state, reason) => {
      renderStopButton(state);
      if (!simulation.isRunning) return;
      if (reason === "stop-pending") setGameMessage(`${stopDelaySeconds.toFixed(1)}秒後まで発射継続`);
      else if (reason === "stopped") setGameMessage("打ち出し停止中");
      else if (reason === "resumed") setGameMessage(launchMessage());
      else if (reason === "hold-resumed") {
        setGameMessage(state.manualStopped ? "打ち出し停止中" : "保留3個以下・発射再開");
      }
      else if (reason === "hold-full") setGameMessage("保留満タン・打ち出し停止");
    });
    renderStopButton();

    function renderLaunchMode() {
      document.querySelectorAll("[data-launch-mode]").forEach((button) => {
        const active = button.dataset.launchMode === autoMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    renderLaunchMode();
    const initialHoldCount = Number(document.querySelector("#lcd-holds")?.dataset.holdCount);
    if (Number.isFinite(initialHoldCount)) {
      if (useGameCore) {
        const coreHoldCount = gameCore.holdCount();
        if (coreHoldCount === 0 && initialHoldCount > 0) {
          // Holds restored from an older Rails session have no stored draw in
          // the core. Keep using the legacy path for this session so an
          // existing hold is neither lost nor drawn twice.
          useGameCore = false;
          renderHoldCount(initialHoldCount);
          pendingSpins = initialHoldCount;
          processPendingSpins();
        } else {
          renderHoldCount(coreHoldCount);
          if (coreHoldCount > 0) {
            pendingSpins = coreHoldCount;
            processPendingSpins();
          }
        }
      } else {
        renderHoldCount(initialHoldCount);
        if (initialHoldCount > 0) {
          pendingSpins = initialHoldCount;
          processPendingSpins();
        }
      }
    }

    function launchAutomatically() {
      if (!simulation.isRunning || simulation.isDestroyed) return;
      if (!launchControl.canLaunch()) return;
      if (simulation.ballCount >= autoConfig.maxConcurrent) return;
      if (!hasBallsForLaunch()) {
        if (!outOfBalls) {
          outOfBalls = true;
          setGameMessage("持ち玉なし・追加投資");
        }
        return;
      }
      outOfBalls = false;
      const base = window.PachinkoPhysicsConfig.velocityForMode(autoMode);
      const jitter = (Math.random() * 2 - 1) * autoConfig.angleJitterDegrees * Math.PI / 180;
      const cos = Math.cos(jitter);
      const sin = Math.sin(jitter);
      const ball = simulation.launchBall({
        kind: "game",
        mode: autoMode,
        velocity: { x: base.x * cos - base.y * sin, y: base.x * sin + base.y * cos }
      });
      if (ball) recordLaunch();
    }

    setInterval(launchAutomatically, autoConfig.intervalMs);
    if (simulation.isRunning) setGameMessage(launchMessage());

    document.querySelectorAll("[data-launch-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        autoMode = button.dataset.launchMode;
        renderLaunchMode();
        if (!hasBallsForLaunch()) {
          outOfBalls = true;
          setGameMessage("持ち玉なし・追加投資");
          return;
        }
        const ball = simulation.launchBall({ kind: "game", mode: autoMode });
        if (!ball) setGameMessage("玉の上限に達しています");
        else {
          outOfBalls = false;
          recordLaunch();
          setGameMessage(autoMode === "left" ? "左打ちで発射" : "右打ちで発射");
        }
      });
    });

    stopButton?.addEventListener("click", () => {
      const state = launchControl.snapshot();
      if (state.manualStopped || state.pending) launchControl.resume();
      else launchControl.requestStop();
    });
    document.querySelector("[data-simulation-action='pause']")?.addEventListener("click", () => {
      if (simulation.isRunning) {
        simulation.stop();
        setGameMessage("一時停止中");
      } else {
        simulation.start();
        setGameMessage(launchMessage());
      }
    });
    document.querySelector("[data-simulation-action='invest']")?.addEventListener("click", () => {
      if (!statsStore) return;
      statsStore.addInvestment();
      outOfBalls = false;
      renderSessionStats();
      setGameMessage(`追加投資（累計 ${formatYen(statsStore.metrics().investedYen)}）`);
    });
    document.querySelector("[data-simulation-action='reset']")?.addEventListener("click", async () => {
      const csrfToken = document.querySelector("meta[name='csrf-token']")?.content;
      const response = await fetch("/pachinko/reset", { method: "POST", headers: { "X-CSRF-Token": csrfToken || "" } });
      gameCore?.clear();
      statsStore?.clear();
      if (response.ok) window.location.reload();
    });
  }

  renderSessionStats();

  document.addEventListener("pachinko:entry", async ({ detail }) => {
    if (useGameCore) {
      try {
        const result = gameCore.handleEntry({ ballId: detail.ballId });
        renderHoldCount(result.holdCount);
        if (result.accepted) {
          // Mirror the hold into the Rails session before a consume request can
          // arrive, keeping the legacy display counter in the same order.
          await mirrorCoreEntry(detail.ballId);
          enqueueSpin();
        } else if (result.full) {
          setGameMessage("保留満タン");
        }
      } catch (error) {
        setGameMessage("入賞処理に失敗しました");
        console.error(error);
      }
      return;
    }

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
