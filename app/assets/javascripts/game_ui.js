document.addEventListener("DOMContentLoaded", () => {
  const power = document.querySelector("#launch-power");
  const readout = document.querySelector("#power-readout");
  const toggle = document.querySelector("#launch-toggle");
  const state = document.querySelector("#run-state");
  const modeStatus = document.querySelector("#mode-status");

  if (!power || !readout || !toggle || !state || !modeStatus) return;

  power.addEventListener("input", () => {
    readout.value = `${power.value}%`;
  });

  toggle.addEventListener("click", () => {
    const running = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(running));
    toggle.textContent = running ? "打ち出し停止" : "打ち出し開始";
    state.textContent = running ? "打ち出し中" : "停止中";
    modeStatus.textContent = running ? "打ち出し中" : "停止中";
  });
});
