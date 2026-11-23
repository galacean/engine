import type { Engine, RHIMode } from "@galacean/engine-core";
import { planningPageUrl } from "./planning/spatial/PlanningPageUrl";
import { replaceSeedWorldDocumentUrl } from "./SeedWorldDocumentUrl";
import "./SeedWorldRenderHud.css";

// The DOM exposes string option values. Keep the choices exhaustive without loading the engine on the template screen.
const rhiLabels: Record<RHIMode, string> = { auto: "自动", webgl2: "WebGL2", webgpu: "WebGPU" };

export function mountSeedRenderHud(url: URL) {
  const debug = url.searchParams.get("debug") === "1";
  if (!debug && url.searchParams.get("fps") !== "1") return;

  const element = document.createElement("div");
  element.className = "seed-render-hud";
  const fps = document.createElement("span");
  fps.dataset.seedFps = "";
  fps.textContent = "FPS —";
  element.append(fps);

  const active = document.createElement("span");
  if (debug) {
    const select = document.createElement("select");
    select.dataset.seedRhi = "";
    select.setAttribute("aria-label", "选择渲染后端");
    for (const [rhi, label] of Object.entries(rhiLabels)) select.add(new Option(label, rhi));
    select.value = url.searchParams.get("rhi") ?? "auto";
    select.onchange = () => {
      const page = planningPageUrl();
      if (select.value === "auto") page.url.searchParams.delete("rhi");
      else page.url.searchParams.set("rhi", select.value);
      if (document.body.dataset.mode === "template") replaceSeedWorldDocumentUrl(page);
      else location.assign(page.url.href);
    };
    active.dataset.seedActiveRhi = "";
    active.setAttribute("aria-label", "实际渲染后端");
    active.textContent = "—";
    element.append(select, active);
  }
  document.body.append(element);

  let engine: Engine | undefined;
  let since = 0;
  let frames = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function resetSample() {
    since = performance.now();
    frames = engine?.time.frameCount ?? 0;
    fps.textContent = "FPS —";
  }
  function sample() {
    if (engine?.destroyed) {
      engine = undefined;
      active.textContent = "—";
      clearInterval(timer);
      timer = undefined;
      resetSample();
    } else if (engine && !document.hidden) {
      if (engine.isPaused) {
        resetSample();
        return;
      }
      const now = performance.now();
      const current = engine.time.frameCount;
      fps.textContent = "FPS " + (((current - frames) * 1000) / (now - since)).toFixed(1);
      since = now;
      frames = current;
    }
  }

  function dispose() {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", resetSample);
    window.removeEventListener("pagehide", dispose);
    element.remove();
    engine = undefined;
  }
  window.addEventListener("pagehide", dispose);
  document.addEventListener("visibilitychange", resetSample);
  return {
    element,
    track(value: Engine) {
      engine = value;
      active.textContent = value.graphicsBackend === "null" ? "—" : rhiLabels[value.graphicsBackend];
      resetSample();
      timer ??= setInterval(sample, 500);
    },
    dispose
  };
}
