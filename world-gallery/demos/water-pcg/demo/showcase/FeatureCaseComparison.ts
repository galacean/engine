interface FeatureComparisonLabels {
  readonly off: string;
  readonly on: string;
}

const FEATURE_LABELS: Readonly<Record<string, FeatureComparisonLabels>> = Object.freeze({
  "feature-refraction": Object.freeze({ off: "折射 Off", on: "折射 On" }),
  "feature-reflection": Object.freeze({ off: "Sky", on: "Planar" }),
  "feature-ripples": Object.freeze({ off: "波纹 Off", on: "波纹 On" }),
  "feature-wake-foam": Object.freeze({ off: "尾迹 Off", on: "尾迹 On" }),
  "feature-underwater": Object.freeze({ off: "水上", on: "水下" }),
  "feature-buoyancy": Object.freeze({ off: "浮力 Off", on: "浮力 On" }),
  "feature-current-drift": Object.freeze({ off: "Current Off", on: "Current On" }),
  "feature-gerstner-waves": Object.freeze({ off: "平静水面", on: "Gerstner" }),
  "feature-ocean-nearshore-waves": Object.freeze({
    off: "深水波形",
    on: "近岸折射"
  }),
  "feature-ocean-breakers": Object.freeze({
    off: "Breaker Off",
    on: "Breaker On"
  }),
  "feature-ocean-shore-foam": Object.freeze({
    off: "岸线泡沫 Off",
    on: "岸线泡沫 On"
  }),
  "feature-ocean-rock-contact": Object.freeze({
    off: "礁石接触 Off",
    on: "礁石接触 On"
  }),
  "feature-ocean-micro-surface": Object.freeze({
    off: "微表面 Off",
    on: "微表面 On"
  }),
  "feature-ocean-wetness": Object.freeze({
    off: "湿沙 Off",
    on: "湿沙 On"
  }),
  "feature-shore-foam": Object.freeze({ off: "泡沫 Off", on: "泡沫 On" }),
  "feature-heightfield": Object.freeze({ off: "静态表面", on: "动态高度场" }),
  "feature-river-confluence": Object.freeze({ off: "汇流 Off", on: "汇流 On" })
});

function setButtonState(buttons: readonly HTMLButtonElement[], enabled: boolean): void {
  for (const button of buttons) {
    button.dataset.active = String(button.dataset.featureVariant === (enabled ? "on" : "off"));
  }
}

/** Mounts the one-variable public A/B surface after the selected Runtime module has started. */
export function mountFeatureCaseComparison(): () => void {
  const html = document.documentElement;
  const caseId = html.dataset.waterPcgCase ?? "";
  if (html.dataset.waterPcgGroup !== "feature") return () => undefined;
  const host = document.getElementById("case-intro");
  const labels = FEATURE_LABELS[caseId];
  if (!host || !labels) return () => undefined;

  const comparison = document.createElement("div");
  comparison.id = "feature-comparison";
  comparison.setAttribute("aria-label", "功能 A/B 对照");
  comparison.innerHTML = `
    <span class="feature-comparison-label">A / B</span>
    <button type="button" data-feature-variant="off">${labels.off}</button>
    <button type="button" data-feature-variant="on">${labels.on}</button>
    <button type="button" data-feature-reset>重置</button>
    <span class="feature-comparison-status" role="status">连接场景…</span>
  `;
  host.appendChild(comparison);
  host.dataset.interactive = "true";

  const variantButtons = Array.from(comparison.querySelectorAll<HTMLButtonElement>("[data-feature-variant]"));
  const resetButton = comparison.querySelector<HTMLButtonElement>("[data-feature-reset]");
  const status = comparison.querySelector<HTMLElement>(".feature-comparison-status");
  let disposed = false;
  let pollTimer = 0;

  const synchronize = (): void => {
    const api = window.waterPcgFeature;
    const ready = api?.ready === true;
    for (const button of variantButtons) button.disabled = !ready;
    if (resetButton) resetButton.disabled = !ready;
    if (status) {
      const snapshot = ready ? api.snapshot() : undefined;
      status.textContent = !ready
        ? "连接场景…"
        : snapshot?.runtimeError
          ? `异常：${snapshot.runtimeError}`
          : api.enabled
            ? "效果已开启"
            : "对照状态";
    }
    if (api) setButtonState(variantButtons, api.enabled);
    if (!disposed && !ready) pollTimer = window.setTimeout(synchronize, 100);
  };

  const handleVariant = async (event: Event): Promise<void> => {
    const button = event.currentTarget;
    const api = window.waterPcgFeature;
    if (!(button instanceof HTMLButtonElement) || !api?.ready) return;
    for (const candidate of variantButtons) candidate.disabled = true;
    await api.setEnabled(button.dataset.featureVariant === "on");
    synchronize();
  };
  const handleReset = async (): Promise<void> => {
    const api = window.waterPcgFeature;
    if (!api?.ready) return;
    await api.reset();
    synchronize();
  };
  for (const button of variantButtons) button.addEventListener("click", handleVariant);
  resetButton?.addEventListener("click", handleReset);
  synchronize();

  return () => {
    disposed = true;
    window.clearTimeout(pollTimer);
    for (const button of variantButtons) button.removeEventListener("click", handleVariant);
    resetButton?.removeEventListener("click", handleReset);
    comparison.remove();
    delete host.dataset.interactive;
  };
}
