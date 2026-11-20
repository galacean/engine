import { ShadowType, type Camera, type DirectLight, type Entity, type Scene, type WebGLEngine } from "@galacean/engine";
import type { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";

export type SeedWorldPerfModuleKey =
  | "bloom"
  | "hdr"
  | "tone"
  | "flare"
  | "shadow"
  | "ssr"
  | "clouds"
  | "wind"
  | "water"
  | "animals"
  | "vegetation"
  | "solids"
  | "building"
  | "farming"
  | "template"
  | "vista"
  | "hud";

export interface SeedWorldPerfPanelOptions {
  readonly engine: WebGLEngine;
  readonly scene: Scene;
  readonly canvas: HTMLCanvasElement;
  readonly root: Entity;
  readonly camera: Camera;
  readonly sun: DirectLight;
  readonly post: TerrainPostProcessRuntime;
  readonly wind: TerrainWindRuntime;
  readonly environment: WorldEnvironmentRuntime;
  readonly water?: PlanningWaterRuntime;
  readonly readPublished: () => PublishedPlanningSeedScene | undefined;
  readonly setVistaVisible: (visible: boolean) => void;
  readonly getVistaVisible: () => boolean;
  readonly setHudVisible: (visible: boolean) => void;
  readonly getBuildingEntity: () => Entity | undefined;
  readonly setDprOverride: (dpr: number | null) => void;
}

const MODULE_DEFS: readonly { readonly key: SeedWorldPerfModuleKey; readonly label: string }[] = [
  { key: "bloom", label: "Bloom" },
  { key: "hdr", label: "HDR(16F)" },
  { key: "tone", label: "调色/TM" },
  { key: "flare", label: "太阳光晕" },
  { key: "shadow", label: "阴影" },
  { key: "ssr", label: "SSR反射" },
  { key: "clouds", label: "体积云" },
  { key: "wind", label: "GPU风场" },
  { key: "water", label: "水体" },
  { key: "animals", label: "动物" },
  { key: "vegetation", label: "植被/草皮" },
  { key: "solids", label: "岩石地貌" },
  { key: "building", label: "原生建筑" },
  { key: "farming", label: "农场" },
  { key: "template", label: "模板装饰" },
  { key: "vista", label: "远景环山" },
  { key: "hud", label: "AI界面" }
];

const DPR_STEPS: readonly (number | null)[] = [null, 1.5, 1, Infinity];

/**
 * Opt-in runtime performance HUD and live module toggle panel (?debug=1&panel=1).
 * Dynamically imported only when enabled so production sessions pay zero overhead.
 */
export class SeedWorldPerfPanel {
  private readonly paused = new Set<SeedWorldPerfModuleKey>();
  private readonly liveState: Record<SeedWorldPerfModuleKey, boolean>;
  private readonly savedShadowType: ShadowType;
  private savedVolumetricClouds: unknown = null;
  private readonly badge: HTMLDivElement;
  private readonly panelWrap: HTMLDivElement;
  private readonly btnMap = new Map<SeedWorldPerfModuleKey, HTMLButtonElement>();
  private readonly restoreHooks: (() => void)[] = [];

  private frames = 0;
  private lastSampleAt = performance.now();
  private readonly startedAt = performance.now();
  private cpuSum = 0;
  private cpuMax = 0;
  private dcCount = 0;
  private trisCount = 0;
  private fboCount = 0;
  private bufCount = 0;
  private bufBytes = 0;
  private dprIdx = 0;
  private disposed = false;

  constructor(private readonly options: SeedWorldPerfPanelOptions) {
    const { sun, environment, post, camera } = options;
    this.savedShadowType = sun.shadowType !== ShadowType.None ? sun.shadowType : ShadowType.SoftLow;
    const skyMat = options.scene.background.sky.material as { volumetricClouds?: unknown } | null;
    this.savedVolumetricClouds = skyMat?.volumetricClouds ?? null;
    const cloud = environment.weatherSystem.state.cloud;

    const postSnap = post.getDebugSnapshot();
    this.liveState = {
      bloom: postSnap.enabled && postSnap.bloom.enabled,
      hdr: camera.enableHDR,
      tone: postSnap.enabled && (postSnap.tonemapping || postSnap.colorAdjustments.enabled),
      flare: postSnap.enabled && postSnap.sunLensFlare.enabled,
      shadow: sun.shadowType !== ShadowType.None,
      ssr: camera.screenSpaceReflection.enabled,
      clouds: Boolean(this.savedVolumetricClouds) && cloud.cloudCoverage > 0,
      wind: options.wind.enabled,
      water: true,
      animals: true,
      vegetation: true,
      solids: true,
      building: true,
      farming: true,
      template: true,
      vista: options.getVistaVisible(),
      hud: true
    };

    this.installMetricsHooks();

    this.badge = document.createElement("div");
    this.badge.dataset.seedWorldPerfHud = "1";
    this.badge.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:100000;pointer-events:none;background:rgba(0,0,0,0.8);color:#4ade80;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;padding:5px 8px;border-radius:6px;white-space:pre;";
    this.badge.textContent = "PERF PANEL | sampling...";
    document.body.append(this.badge);

    this.panelWrap = this.buildPanelDom();
    document.body.append(this.panelWrap);
  }

  isPaused(key: SeedWorldPerfModuleKey): boolean {
    return this.paused.has(key);
  }

  tick(): void {
    if (this.disposed) return;
    this.frames++;
    const now = performance.now();
    if (now - this.lastSampleAt < 1000) return;

    const dtSec = (now - this.lastSampleAt) / 1000;
    const fps = this.frames / dtSec;
    const cpuAvg = this.cpuSum / this.frames;
    const dcAvg = this.dcCount / this.frames;
    const fboAvg = this.fboCount / this.frames;
    const trisK = this.trisCount / this.frames / 1000;
    const bufAvg = this.bufCount / this.frames;
    const bufKB = this.bufBytes / this.frames / 1024;
    const elapsedS = Math.round((now - this.startedAt) / 1000);
    const { width, height } = this.options.engine.canvas;

    const summary =
      `PERF | t=${elapsedS}s | ${width}x${height}\n` +
      `${fps.toFixed(1)}fps | cpu=${cpuAvg.toFixed(1)}ms(max ${this.cpuMax.toFixed(1)}) | dc=${dcAvg.toFixed(0)} fbo=${fboAvg.toFixed(0)} tris=${trisK.toFixed(0)}k buf=${bufAvg.toFixed(0)}(${bufKB.toFixed(0)}KB)`;
    this.badge.textContent = summary;
    this.options.canvas.dataset.perfHud = summary;

    this.frames = 0;
    this.lastSampleAt = now;
    this.cpuSum = 0;
    this.cpuMax = 0;
    this.dcCount = 0;
    this.trisCount = 0;
    this.fboCount = 0;
    this.bufCount = 0;
    this.bufBytes = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.restoreHooks.length - 1; i >= 0; i--) {
      this.restoreHooks[i]();
    }
    this.restoreHooks.length = 0;
    this.badge.remove();
    this.panelWrap.remove();
    delete this.options.canvas.dataset.perfHud;
  }

  private installMetricsHooks(): void {
    const engine = this.options.engine;
    const rhi = (engine as unknown as { _hardwareRenderer?: { gl?: WebGL2RenderingContext | WebGLRenderingContext } })
      ._hardwareRenderer;
    const gl = rhi?.gl;
    if (gl) {
      const proto = Object.getPrototypeOf(gl) as WebGL2RenderingContext | null;
      const gl2 = gl as WebGL2RenderingContext;

      // Guard against cycles when another debug monitor (e.g. TerrainRenderSubmissionMonitor)
      // installs or re-installs GL hooks on the same context. Use fixed-arity wrappers to avoid
      // per-call rest-argument array allocations.
      {
        const prev = gl.drawElements;
        const nativeFn = proto?.drawElements ?? prev;
        let active = false;
        const wrapped: typeof gl.drawElements = (mode, count, type, offset) => {
          if (active || this.disposed) return nativeFn.call(gl, mode, count, type, offset);
          active = true;
          try {
            this.dcCount++;
            if (mode === 4) this.trisCount += (count / 3) | 0;
            return prev.call(gl, mode, count, type, offset);
          } finally {
            active = false;
          }
        };
        gl.drawElements = wrapped;
        this.restoreHooks.push(() => {
          if (gl.drawElements === wrapped) gl.drawElements = prev;
        });
      }
      {
        const prev = gl.drawArrays;
        const nativeFn = proto?.drawArrays ?? prev;
        let active = false;
        const wrapped: typeof gl.drawArrays = (mode, first, count) => {
          if (active || this.disposed) return nativeFn.call(gl, mode, first, count);
          active = true;
          try {
            this.dcCount++;
            if (mode === 4) this.trisCount += (count / 3) | 0;
            return prev.call(gl, mode, first, count);
          } finally {
            active = false;
          }
        };
        gl.drawArrays = wrapped;
        this.restoreHooks.push(() => {
          if (gl.drawArrays === wrapped) gl.drawArrays = prev;
        });
      }
      if (typeof gl2.drawElementsInstanced === "function") {
        const prev = gl2.drawElementsInstanced;
        const nativeFn = proto?.drawElementsInstanced ?? prev;
        let active = false;
        const wrapped: typeof gl2.drawElementsInstanced = (mode, count, type, offset, instanceCount) => {
          if (active || this.disposed) return nativeFn.call(gl2, mode, count, type, offset, instanceCount);
          active = true;
          try {
            this.dcCount++;
            if (mode === 4) this.trisCount += ((count / 3) | 0) * instanceCount;
            return prev.call(gl2, mode, count, type, offset, instanceCount);
          } finally {
            active = false;
          }
        };
        gl2.drawElementsInstanced = wrapped;
        this.restoreHooks.push(() => {
          if (gl2.drawElementsInstanced === wrapped) gl2.drawElementsInstanced = prev;
        });
      }
      if (typeof gl2.drawArraysInstanced === "function") {
        const prev = gl2.drawArraysInstanced;
        const nativeFn = proto?.drawArraysInstanced ?? prev;
        let active = false;
        const wrapped: typeof gl2.drawArraysInstanced = (mode, first, count, instanceCount) => {
          if (active || this.disposed) return nativeFn.call(gl2, mode, first, count, instanceCount);
          active = true;
          try {
            this.dcCount++;
            if (mode === 4) this.trisCount += ((count / 3) | 0) * instanceCount;
            return prev.call(gl2, mode, first, count, instanceCount);
          } finally {
            active = false;
          }
        };
        gl2.drawArraysInstanced = wrapped;
        this.restoreHooks.push(() => {
          if (gl2.drawArraysInstanced === wrapped) gl2.drawArraysInstanced = prev;
        });
      }
      {
        const prev = gl.bindFramebuffer;
        const nativeFn = proto?.bindFramebuffer ?? prev;
        let active = false;
        const wrapped: typeof gl.bindFramebuffer = (target, framebuffer) => {
          if (active || this.disposed) return nativeFn.call(gl, target, framebuffer);
          active = true;
          try {
            this.fboCount++;
            return prev.call(gl, target, framebuffer);
          } finally {
            active = false;
          }
        };
        gl.bindFramebuffer = wrapped;
        this.restoreHooks.push(() => {
          if (gl.bindFramebuffer === wrapped) gl.bindFramebuffer = prev;
        });
      }
      {
        const prev = gl.bufferData as (
          target: number,
          srcData: BufferSource | number | null,
          usage: number,
          srcOffset?: number,
          length?: number
        ) => void;
        const nativeFn = (proto?.bufferData as typeof prev | undefined) ?? prev;
        let active = false;
        const wrapped = (
          target: number,
          srcData: BufferSource | number | null,
          usage: number,
          srcOffset?: number,
          length?: number
        ) => {
          if (active || this.disposed) {
            if (srcOffset === undefined) return nativeFn.call(gl, target, srcData, usage);
            if (length === undefined) return nativeFn.call(gl, target, srcData, usage, srcOffset);
            return nativeFn.call(gl, target, srcData, usage, srcOffset, length);
          }
          active = true;
          try {
            this.bufCount++;
            if (typeof srcData === "number") this.bufBytes += srcData;
            else if (srcData && typeof (srcData as ArrayBufferView).byteLength === "number") {
              this.bufBytes += (srcData as ArrayBufferView).byteLength;
            }
            if (srcOffset === undefined) return prev.call(gl, target, srcData, usage);
            if (length === undefined) return prev.call(gl, target, srcData, usage, srcOffset);
            return prev.call(gl, target, srcData, usage, srcOffset, length);
          } finally {
            active = false;
          }
        };
        gl.bufferData = wrapped as typeof gl.bufferData;
        this.restoreHooks.push(() => {
          if ((gl.bufferData as unknown) === wrapped) gl.bufferData = prev as typeof gl.bufferData;
        });
      }
    }

    const origUpdate = engine.update;
    const wrappedUpdate = () => {
      if (this.disposed) {
        origUpdate.call(engine);
        return;
      }
      const t0 = performance.now();
      origUpdate.call(engine);
      const dtMs = performance.now() - t0;
      this.cpuSum += dtMs;
      if (dtMs > this.cpuMax) this.cpuMax = dtMs;
    };
    engine.update = wrappedUpdate;
    this.restoreHooks.push(() => {
      if (engine.update === wrappedUpdate) engine.update = origUpdate;
    });
  }

  private syncPostProfile(): void {
    const { post } = this.options;
    const anyPost = this.liveState.bloom || this.liveState.tone || this.liveState.flare;
    post.setProfileEnabled(anyPost);
    post.setBloomEnabled(this.liveState.bloom);
    post.setTonemappingEnabled(this.liveState.tone);
    post.setColorAdjustmentsEnabled(this.liveState.tone);
    post.setSunLensFlareEnabled(this.liveState.flare);
  }

  private applyToggle(key: SeedWorldPerfModuleKey, on: boolean): void {
    this.liveState[key] = on;
    if (on) this.paused.delete(key);
    else this.paused.add(key);

    const { camera, sun, wind, environment, water, root, scene } = this.options;
    const published = this.options.readPublished();

    switch (key) {
      case "bloom":
      case "tone":
      case "flare":
        this.syncPostProfile();
        break;
      case "hdr":
        camera.enableHDR = on;
        break;
      case "shadow":
        sun.shadowType = on ? this.savedShadowType : ShadowType.None;
        break;
      case "ssr":
        camera.screenSpaceReflection.enabled = on;
        break;
      case "clouds": {
        const skyMat = scene.background.sky.material as { volumetricClouds?: unknown } | null;
        if (skyMat && "volumetricClouds" in skyMat) {
          if (!on && skyMat.volumetricClouds) {
            this.savedVolumetricClouds = skyMat.volumetricClouds;
          }
          skyMat.volumetricClouds = on ? this.savedVolumetricClouds : null;
        }
        const envDriver = (environment as unknown as { _driver?: { enabled: boolean } })._driver;
        if (envDriver) envDriver.enabled = on;
        if (on) {
          environment.invalidateCloudHistory();
          environment.update(0);
        }
        break;
      }
      case "wind":
        wind.enabled = on;
        wind.setGpuRenderCamera(on ? camera : null);
        break;
      case "water":
        water?.setVisible(on, on);
        water?.update(0);
        break;
      case "animals": {
        const entity = root.findByName("Seed animals");
        if (entity) entity.isActive = on;
        break;
      }
      case "vegetation": {
        if (published) {
          published.world.population.trees.isActive = on;
          published.world.population.details.isActive = on;
        }
        break;
      }
      case "solids": {
        if (published) published.solids.root.isActive = on;
        break;
      }
      case "building": {
        const entity = this.options.getBuildingEntity();
        if (entity) entity.isActive = on;
        break;
      }
      case "farming": {
        const entity = scene.findEntityByName("Farming Runtime");
        if (entity) entity.isActive = on;
        break;
      }
      case "template": {
        if (published?.template) published.template.root.isActive = on;
        break;
      }
      case "vista":
        this.options.setVistaVisible(on);
        break;
      case "hud":
        this.options.setHudVisible(on);
        break;
    }
  }

  private refreshButtons(): void {
    for (const { key, label } of MODULE_DEFS) {
      const btn = this.btnMap.get(key);
      if (!btn) continue;
      const on = this.liveState[key];
      btn.textContent = `${on ? "● " : "○ "}${label}`;
      btn.style.background = on ? "#15803d" : "rgba(51,65,85,0.85)";
      btn.style.color = on ? "#f0fdf4" : "#94a3b8";
      btn.style.borderColor = on ? "#4ade80" : "rgba(100,116,139,0.5)";
    }
  }

  private buildPanelDom(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.dataset.seedWorldPerfPanel = "1";
    wrap.style.cssText =
      "position:fixed;top:48px;left:8px;z-index:100000;font:600 12px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;touch-action:manipulation;user-select:none;";

    const stopEvt = (e: Event) => e.stopPropagation();
    for (const ev of ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "mousedown", "wheel"]) {
      wrap.addEventListener(ev, stopEvt, { passive: true });
    }

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = "收起开关 ▲";
    toggleBtn.style.cssText =
      "background:rgba(15,23,42,0.88);color:#f8fafc;border:1px solid rgba(148,163,184,0.5);border-radius:8px;padding:6px 10px;font:600 12px/1.2 sans-serif;cursor:pointer;";

    const drawer = document.createElement("div");
    drawer.style.cssText =
      "margin-top:6px;width:240px;max-height:70vh;overflow-y:auto;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.4);border-radius:10px;padding:8px;display:block;";

    toggleBtn.onclick = () => {
      const open = drawer.style.display === "none";
      drawer.style.display = open ? "block" : "none";
      toggleBtn.textContent = open ? "收起开关 ▲" : "模块开关 ▾";
    };

    const presetRow = document.createElement("div");
    presetRow.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:7px;";
    const makePreset = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:6px;padding:5px 4px;font:600 11px/1.2 sans-serif;cursor:pointer;";
      b.onclick = () => {
        onClick();
        this.refreshButtons();
      };
      presetRow.append(b);
    };
    makePreset("全开", () => {
      for (const { key } of MODULE_DEFS) this.applyToggle(key, true);
    });
    makePreset("仅关Bloom", () => {
      for (const { key } of MODULE_DEFS) this.applyToggle(key, key !== "bloom");
    });
    makePreset("全关裸地", () => {
      for (const { key } of MODULE_DEFS) this.applyToggle(key, false);
    });

    const dprBtn = document.createElement("button");
    dprBtn.type = "button";
    const updateDprLabel = () => {
      const cur = DPR_STEPS[this.dprIdx];
      const rawNative = window.devicePixelRatio || 1;
      const fmt = (v: number) => v.toFixed(1).replace(/\.0$/, "");
      const effective = fmt(Math.min(rawNative, cur ?? 2));
      const label =
        cur === null
          ? `≤2x(${effective}x)`
          : cur === Infinity
            ? `原生(${fmt(rawNative)}x)`
            : `≤${cur}x(${effective}x)`;
      dprBtn.textContent = `渲染分辨率 DPR: ${label}`;
    };
    dprBtn.style.cssText =
      "width:100%;margin-bottom:7px;background:#1d4ed8;color:#eff6ff;border:1px solid #60a5fa;border-radius:6px;padding:6px 8px;font:600 11px/1.2 sans-serif;cursor:pointer;";
    updateDprLabel();
    dprBtn.onclick = () => {
      this.dprIdx = (this.dprIdx + 1) % DPR_STEPS.length;
      this.options.setDprOverride(DPR_STEPS[this.dprIdx]);
      updateDprLabel();
    };

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:5px;";
    for (const { key, label } of MODULE_DEFS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.toggleKey = key;
      b.style.cssText =
        "border:1px solid;border-radius:6px;padding:6px 5px;font:600 11px/1.2 sans-serif;text-align:left;cursor:pointer;";
      b.onclick = () => {
        this.applyToggle(key, !this.liveState[key]);
        this.refreshButtons();
      };
      this.btnMap.set(key, b);
      grid.append(b);
    }
    this.refreshButtons();

    drawer.append(presetRow, dprBtn, grid);
    wrap.append(toggleBtn, drawer);
    return wrap;
  }
}
