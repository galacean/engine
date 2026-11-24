import {
  attachMobileFrameCapture,
  type MobileFrameCaptureRunOptions,
  type PerfCumulativeCounters,
  type PerfFrameObserver
} from "./MobileFrameCapture";
import { ShadowType, type Camera, type DirectLight, type Entity, type Scene, type WebGLEngine } from "@galacean/engine";
import type { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";

const GL_TRIANGLES = 4;
const GL_TRIANGLE_STRIP = 5;
const GL_TRIANGLE_FAN = 6;
const GL_FRAMEBUFFER = 0x8d40;
const GL_DRAW_FRAMEBUFFER = 0x8ca9;
const GL_FRAMEBUFFER_BINDING = 0x8ca6;

/** Exact triangle count submitted by a single WebGL draw call (TRIANGLES, TRIANGLE_STRIP, TRIANGLE_FAN). */
export function primitiveTriangleCount(mode: number, count: number): number {
  if (count <= 0) return 0;
  if (mode === GL_TRIANGLES) return (count / 3) | 0;
  if (mode === GL_TRIANGLE_STRIP || mode === GL_TRIANGLE_FAN) return count > 2 ? count - 2 : 0;
  return 0;
}

/**
 * Exact byte length uploaded by `gl.bufferData(target, srcData, usage, srcOffset?, length?)`
 * or `gl.bufferSubData(target, dstByteOffset, srcData, srcOffset?, length?)`.
 * Follows WebGL2 semantics where `srcOffset` and `length` are in elements of `srcData` and `length === 0` means "to end".
 */
export function bufferSourceByteLength(
  srcData: BufferSource | null | undefined,
  srcOffset?: number,
  length?: number
): number {
  if (!srcData) return 0;
  if (ArrayBuffer.isView(srcData)) {
    const bpe = (srcData as Uint8Array).BYTES_PER_ELEMENT || 1;
    const offsetBytes = srcOffset && srcOffset > 0 ? srcOffset * bpe : 0;
    const remaining = srcData.byteLength - offsetBytes;
    if (remaining <= 0) return 0;
    if (length !== undefined && length > 0) {
      const requested = length * bpe;
      return requested < remaining ? requested : remaining;
    }
    return remaining;
  }
  return typeof (srcData as ArrayBuffer).byteLength === "number" ? (srcData as ArrayBuffer).byteLength : 0;
}

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
  readonly setBuildingVisible: (visible: boolean) => void;
  readonly setDprOverride: (dpr: number | null) => void;
  readonly onStartPerfTour?: () => void;
  readonly suppressAutoBoot?: boolean;
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

  private readonly startedAt = performance.now();
  // Monotonic cumulative totals updated strictly on completed engine.update() boundaries and GL hooks.
  private totalFrames = 0;
  private totalCpuMs = 0;
  private totalDc = 0;
  private totalTris = 0;
  private totalDrawFboSwitches = 0;
  private totalAllFboBinds = 0;
  private totalBufUploads = 0;
  private totalBufUploadBytes = 0;
  private totalBufOrphans = 0;
  private totalBufOrphanBytes = 0;
  private currentDrawFbo: WebGLFramebuffer | null = null;

  // 1-second live HUD window anchored strictly on engine.update() frame boundaries (zero mid-frame skew).
  private winStartAt = performance.now();
  private winFrames = 0;
  private winCpuSum = 0;
  private winCpuMax = 0;
  private winStartDc = 0;
  private winStartTris = 0;
  private winStartFbo = 0;
  private winStartBufUploads = 0;
  private winStartBufUploadBytes = 0;
  private winStartBufOrphans = 0;

  private dprIdx = 0;
  private currentDprOverride: number | null = null;
  private refreshDprButton: (() => void) | null = null;
  private disposed = false;
  private frameObserver: PerfFrameObserver | null = null;
  private mobileCapture: ReturnType<typeof attachMobileFrameCapture> | null = null;

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
      ssr: camera.enableScreenSpaceReflection,
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

    const rawCaptureSec =
      typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("captureSec") || "") : NaN;
    const captureSec = Number.isFinite(rawCaptureSec) && rawCaptureSec > 0 ? Math.min(15, Math.max(1, rawCaptureSec)) : 6;

    this.mobileCapture = attachMobileFrameCapture({
      engine: options.engine,
      scene: options.scene,
      camera: options.camera,
      canvas: options.canvas,
      readLiveState: () => ({ ...this.liveState }),
      readCumulativeCounters: (out) => this.readCumulativeCounters(out),
      setFrameObserver: (observer) => {
        this.frameObserver = observer;
      },
      readPerfText: () => this.badge.textContent || "",
      manualDurationMs: captureSec * 1000,
      ...(options.suppressAutoBoot ? { autoBootDelayMs: null } : {})
    });

    this.panelWrap = this.buildPanelDom();
    document.body.append(this.panelWrap);
  }

  runTimedCapture(trigger: string, durationMs: number, runOptions?: MobileFrameCaptureRunOptions): void {
    this.mobileCapture?.captureNow(trigger, durationMs, runOptions);
  }

  setModuleEnabled(key: SeedWorldPerfModuleKey, on: boolean): void {
    this.applyToggle(key, on);
    this.refreshButtons();
  }

  isModuleEnabled(key: SeedWorldPerfModuleKey): boolean {
    return this.liveState[key];
  }

  setSubGroupVisible(group: "trees" | "details" | "terrain", on: boolean): void {
    const published = this.options.readPublished();
    if (group === "trees") {
      if (published) published.world.population.trees.isActive = on;
    } else if (group === "details") {
      if (published) published.world.population.details.isActive = on;
    } else if (group === "terrain") {
      const terrain = this.options.scene.findEntityByName("Terrain");
      if (terrain) terrain.isActive = on;
    }
  }

  isSubGroupVisible(group: "trees" | "details" | "terrain"): boolean {
    const published = this.options.readPublished();
    if (group === "trees") return published ? published.world.population.trees.isActive : true;
    if (group === "details") return published ? published.world.population.details.isActive : true;
    const terrain = this.options.scene.findEntityByName("Terrain");
    return terrain ? terrain.isActive : true;
  }

  setDpr(dpr: number | null): void {
    this.currentDprOverride = dpr;
    const idx = DPR_STEPS.indexOf(dpr);
    if (idx >= 0) this.dprIdx = idx;
    this.options.setDprOverride(dpr);
    this.refreshDprButton?.();
  }

  getDpr(): number | null {
    return this.currentDprOverride;
  }

  isPaused(key: SeedWorldPerfModuleKey): boolean {
    return this.paused.has(key);
  }

  /** Writes monotonic engine + WebGL totals into `out` with zero heap allocations. */
  readCumulativeCounters(out: PerfCumulativeCounters): PerfCumulativeCounters {
    out.frames = this.totalFrames;
    out.cpuMs = this.totalCpuMs;
    out.dc = this.totalDc;
    out.tris = this.totalTris;
    out.fbo = this.totalDrawFboSwitches;
    out.fboAll = this.totalAllFboBinds;
    out.bufUploads = this.totalBufUploads;
    out.bufUploadBytes = this.totalBufUploadBytes;
    out.bufOrphans = this.totalBufOrphans;
    out.bufOrphanBytes = this.totalBufOrphanBytes;
    return out;
  }

  /** Retained as a no-op for caller compatibility; HUD sampling is driven strictly by engine.update() boundaries. */
  tick(): void {}

  private flushHudWindow(now: number): void {
    const frames = this.winFrames;
    if (frames <= 0) return;
    const dtSec = Math.max(1e-6, (now - this.winStartAt) / 1000);
    const fps = frames / dtSec;
    const cpuAvg = this.winCpuSum / frames;
    const dcAvg = (this.totalDc - this.winStartDc) / frames;
    const fboAvg = (this.totalDrawFboSwitches - this.winStartFbo) / frames;
    const trisK = (this.totalTris - this.winStartTris) / frames / 1000;
    const bufAvg = (this.totalBufUploads - this.winStartBufUploads) / frames;
    const bufKB = (this.totalBufUploadBytes - this.winStartBufUploadBytes) / frames / 1024;
    const orphanAvg = (this.totalBufOrphans - this.winStartBufOrphans) / frames;
    const orphanPart = orphanAvg >= 0.5 ? ` orph=${orphanAvg.toFixed(0)}` : "";
    const elapsedS = Math.round((now - this.startedAt) / 1000);
    const { width, height } = this.options.engine.canvas;

    const summary =
      `PERF | t=${elapsedS}s | ${width}x${height}\n` +
      `${fps.toFixed(1)}fps | cpu=${cpuAvg.toFixed(1)}ms(max ${this.winCpuMax.toFixed(1)}) | ` +
      `dc=${dcAvg.toFixed(0)} fbo=${fboAvg.toFixed(0)} tris=${trisK.toFixed(0)}k buf=${bufAvg.toFixed(0)}(${bufKB.toFixed(0)}KB)${orphanPart}`;
    this.badge.textContent = summary;
    this.options.canvas.dataset.perfHud = summary;

    this.winStartAt = now;
    this.winFrames = 0;
    this.winCpuSum = 0;
    this.winCpuMax = 0;
    this.winStartDc = this.totalDc;
    this.winStartTris = this.totalTris;
    this.winStartFbo = this.totalDrawFboSwitches;
    this.winStartBufUploads = this.totalBufUploads;
    this.winStartBufUploadBytes = this.totalBufUploadBytes;
    this.winStartBufOrphans = this.totalBufOrphans;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frameObserver = null;
    this.currentDrawFbo = null;
    this.refreshDprButton = null;
    this.mobileCapture?.dispose();
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
      if (typeof gl.getParameter === "function") {
        try {
          this.currentDrawFbo = (gl.getParameter(GL_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null) ?? null;
        } catch {
          this.currentDrawFbo = null;
        }
      }

      const restoreProp = (targetObj: object, key: string, wrapped: unknown, prev: unknown, hadOwn: boolean) => {
        const rec = targetObj as Record<string, unknown>;
        if (rec[key] === wrapped) {
          if (hadOwn) rec[key] = prev;
          else delete rec[key];
        }
      };

      // Guard against cycles when another debug monitor (e.g. TerrainRenderSubmissionMonitor)
      // installs or re-installs GL hooks on the same context. Use fixed-arity wrappers to avoid
      // per-call rest-argument array allocations.
      {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl, "drawElements");
        const prev = gl.drawElements;
        const nativeFn = proto?.drawElements ?? prev;
        let active = false;
        const wrapped: typeof gl.drawElements = (mode, count, type, offset) => {
          if (active || this.disposed) return nativeFn.call(gl, mode, count, type, offset);
          active = true;
          try {
            this.totalDc++;
            this.totalTris += primitiveTriangleCount(mode, count);
            return prev.call(gl, mode, count, type, offset);
          } finally {
            active = false;
          }
        };
        gl.drawElements = wrapped;
        this.restoreHooks.push(() => restoreProp(gl, "drawElements", wrapped, prev, hadOwn));
      }
      {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl, "drawArrays");
        const prev = gl.drawArrays;
        const nativeFn = proto?.drawArrays ?? prev;
        let active = false;
        const wrapped: typeof gl.drawArrays = (mode, first, count) => {
          if (active || this.disposed) return nativeFn.call(gl, mode, first, count);
          active = true;
          try {
            this.totalDc++;
            this.totalTris += primitiveTriangleCount(mode, count);
            return prev.call(gl, mode, first, count);
          } finally {
            active = false;
          }
        };
        gl.drawArrays = wrapped;
        this.restoreHooks.push(() => restoreProp(gl, "drawArrays", wrapped, prev, hadOwn));
      }
      if (typeof gl2.drawElementsInstanced === "function") {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl2, "drawElementsInstanced");
        const prev = gl2.drawElementsInstanced;
        const nativeFn = proto?.drawElementsInstanced ?? prev;
        let active = false;
        const wrapped: typeof gl2.drawElementsInstanced = (mode, count, type, offset, instanceCount) => {
          if (active || this.disposed) return nativeFn.call(gl2, mode, count, type, offset, instanceCount);
          active = true;
          try {
            this.totalDc++;
            if (instanceCount > 0) {
              this.totalTris += primitiveTriangleCount(mode, count) * instanceCount;
            }
            return prev.call(gl2, mode, count, type, offset, instanceCount);
          } finally {
            active = false;
          }
        };
        gl2.drawElementsInstanced = wrapped;
        this.restoreHooks.push(() => restoreProp(gl2, "drawElementsInstanced", wrapped, prev, hadOwn));
      }
      if (typeof gl2.drawArraysInstanced === "function") {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl2, "drawArraysInstanced");
        const prev = gl2.drawArraysInstanced;
        const nativeFn = proto?.drawArraysInstanced ?? prev;
        let active = false;
        const wrapped: typeof gl2.drawArraysInstanced = (mode, first, count, instanceCount) => {
          if (active || this.disposed) return nativeFn.call(gl2, mode, first, count, instanceCount);
          active = true;
          try {
            this.totalDc++;
            if (instanceCount > 0) {
              this.totalTris += primitiveTriangleCount(mode, count) * instanceCount;
            }
            return prev.call(gl2, mode, first, count, instanceCount);
          } finally {
            active = false;
          }
        };
        gl2.drawArraysInstanced = wrapped;
        this.restoreHooks.push(() => restoreProp(gl2, "drawArraysInstanced", wrapped, prev, hadOwn));
      }
      {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl, "bindFramebuffer");
        const prev = gl.bindFramebuffer;
        const nativeFn = proto?.bindFramebuffer ?? prev;
        let active = false;
        const wrapped: typeof gl.bindFramebuffer = (target, framebuffer) => {
          if (active || this.disposed) return nativeFn.call(gl, target, framebuffer);
          active = true;
          try {
            this.totalAllFboBinds++;
            if (target === GL_FRAMEBUFFER || target === GL_DRAW_FRAMEBUFFER) {
              const nextFbo = framebuffer ?? null;
              if (nextFbo !== this.currentDrawFbo) {
                this.currentDrawFbo = nextFbo;
                this.totalDrawFboSwitches++;
              }
            }
            return prev.call(gl, target, framebuffer);
          } finally {
            active = false;
          }
        };
        gl.bindFramebuffer = wrapped;
        this.restoreHooks.push(() => restoreProp(gl, "bindFramebuffer", wrapped, prev, hadOwn));
      }
      {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl, "bufferData");
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
            if (typeof srcData === "number") {
              // Size-only allocation / SetDataOptions.Discard orphan (0 bytes copied from CPU).
              this.totalBufOrphans++;
              if (srcData > 0) this.totalBufOrphanBytes += srcData;
            } else if (srcData) {
              this.totalBufUploads++;
              this.totalBufUploadBytes += bufferSourceByteLength(srcData, srcOffset, length);
            }
            if (srcOffset === undefined) return prev.call(gl, target, srcData, usage);
            if (length === undefined) return prev.call(gl, target, srcData, usage, srcOffset);
            return prev.call(gl, target, srcData, usage, srcOffset, length);
          } finally {
            active = false;
          }
        };
        gl.bufferData = wrapped as typeof gl.bufferData;
        this.restoreHooks.push(() => restoreProp(gl, "bufferData", wrapped, prev, hadOwn));
      }
      if (typeof gl.bufferSubData === "function") {
        const hadOwn = Object.prototype.hasOwnProperty.call(gl, "bufferSubData");
        const prev = gl.bufferSubData as (
          target: number,
          dstByteOffset: number,
          srcData: BufferSource,
          srcOffset?: number,
          length?: number
        ) => void;
        const nativeFn = (proto?.bufferSubData as typeof prev | undefined) ?? prev;
        let active = false;
        const wrapped = (
          target: number,
          dstByteOffset: number,
          srcData: BufferSource,
          srcOffset?: number,
          length?: number
        ) => {
          if (active || this.disposed) {
            if (srcOffset === undefined) return nativeFn.call(gl, target, dstByteOffset, srcData);
            if (length === undefined) return nativeFn.call(gl, target, dstByteOffset, srcData, srcOffset);
            return nativeFn.call(gl, target, dstByteOffset, srcData, srcOffset, length);
          }
          active = true;
          try {
            this.totalBufUploads++;
            this.totalBufUploadBytes += bufferSourceByteLength(srcData, srcOffset, length);
            if (srcOffset === undefined) return prev.call(gl, target, dstByteOffset, srcData);
            if (length === undefined) return prev.call(gl, target, dstByteOffset, srcData, srcOffset);
            return prev.call(gl, target, dstByteOffset, srcData, srcOffset, length);
          } finally {
            active = false;
          }
        };
        gl.bufferSubData = wrapped as typeof gl.bufferSubData;
        this.restoreHooks.push(() => restoreProp(gl, "bufferSubData", wrapped, prev, hadOwn));
      }
    }

    const hadOwnUpdate = Object.prototype.hasOwnProperty.call(engine, "update");
    const origUpdate = engine.update;
    const wrappedUpdate = () => {
      if (this.disposed) {
        origUpdate.call(engine);
        return;
      }
      const t0 = performance.now();
      if (this.winFrames === 0 && this.totalFrames === 0) {
        // Anchor Window 1 to frame 1 start so pre-frame async GL work never contaminates frame 1 averages.
        this.winStartAt = t0;
        this.winStartDc = this.totalDc;
        this.winStartTris = this.totalTris;
        this.winStartFbo = this.totalDrawFboSwitches;
        this.winStartBufUploads = this.totalBufUploads;
        this.winStartBufUploadBytes = this.totalBufUploadBytes;
        this.winStartBufOrphans = this.totalBufOrphans;
      }
      this.frameObserver?.onFrameBegin(t0);
      try {
        origUpdate.call(engine);
      } finally {
        const t1 = performance.now();
        const dtMs = t1 - t0;
        this.totalFrames++;
        this.totalCpuMs += dtMs;
        this.winFrames++;
        this.winCpuSum += dtMs;
        if (dtMs > this.winCpuMax) this.winCpuMax = dtMs;
        this.frameObserver?.onFrameEnd(dtMs, t1);
        if (t1 - this.winStartAt >= 1000) {
          this.flushHudWindow(t1);
        }
      }
    };
    engine.update = wrappedUpdate;
    this.restoreHooks.push(() => {
      if (engine.update === wrappedUpdate) {
        if (hadOwnUpdate) engine.update = origUpdate;
        else delete (engine as unknown as { update?: unknown }).update;
      }
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
        camera.enableScreenSpaceReflection = on;
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
      case "building":
        this.options.setBuildingVisible(on);
        break;
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
    for (const ev of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "touchstart",
      "touchmove",
      "touchend",
      "mousedown",
      "wheel"
    ]) {
      wrap.addEventListener(ev, stopEvt, { passive: true });
    }

    const compactStart = typeof window !== "undefined" && (window.innerWidth <= 900 || "ontouchstart" in window);

    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex;gap:6px;align-items:center;";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = compactStart ? "模块开关 ▾" : "收起开关 ▲";
    toggleBtn.style.cssText =
      "background:rgba(15,23,42,0.88);color:#f8fafc;border:1px solid rgba(148,163,184,0.5);border-radius:8px;padding:6px 10px;font:600 12px/1.2 sans-serif;cursor:pointer;";

    const drawer = document.createElement("div");
    drawer.style.cssText = `margin-top:6px;width:240px;max-height:70vh;overflow-y:auto;background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.4);border-radius:10px;padding:8px;display:${compactStart ? "none" : "block"};`;

    toggleBtn.onclick = () => {
      const open = drawer.style.display === "none";
      drawer.style.display = open ? "block" : "none";
      toggleBtn.textContent = open ? "收起开关 ▲" : "模块开关 ▾";
    };

    topRow.append(toggleBtn);
    if (this.mobileCapture) {
      this.mobileCapture.button.style.cssText =
        "background:#0f766e;color:#f0fdfa;border:1px solid #2dd4bf;border-radius:8px;padding:6px 10px;font:600 11px/1.2 sans-serif;cursor:pointer;";
      this.mobileCapture.exportButton.style.cssText =
        "background:rgba(15,23,42,0.88);color:#cbd5e1;border:1px solid rgba(148,163,184,0.5);border-radius:8px;padding:6px 8px;font:600 11px/1.2 sans-serif;cursor:pointer;";
      topRow.append(this.mobileCapture.button, this.mobileCapture.exportButton);
    }
    if (this.options.onStartPerfTour) {
      const tourBtn = document.createElement("button");
      tourBtn.type = "button";
      tourBtn.textContent = "巡游跑分";
      tourBtn.title = "沿固定路线自动巡游 20s，统计 Avg/1% Low FPS、P95/Max、Jank 与 Shader 编译并自动上报";
      tourBtn.style.cssText =
        "background:#1d4ed8;color:#eff6ff;border:1px solid #60a5fa;border-radius:8px;padding:6px 10px;font:600 11px/1.2 sans-serif;cursor:pointer;";
      tourBtn.onclick = () => this.options.onStartPerfTour?.();
      topRow.append(tourBtn);
    }

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
        this.mobileCapture?.schedule(`preset:${label}`, 1200);
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
      const cur = this.currentDprOverride;
      const rawNative = window.devicePixelRatio || 1;
      const fmt = (v: number) => v.toFixed(1).replace(/\.0$/, "");
      const effective = fmt(Math.min(rawNative, cur ?? 2));
      const label =
        cur === null ? `≤2x(${effective}x)` : cur === Infinity ? `原生(${fmt(rawNative)}x)` : `≤${cur}x(${effective}x)`;
      dprBtn.textContent = `渲染分辨率 DPR: ${label}`;
    };
    this.refreshDprButton = updateDprLabel;
    dprBtn.style.cssText =
      "width:100%;margin-bottom:7px;background:#1d4ed8;color:#eff6ff;border:1px solid #60a5fa;border-radius:6px;padding:6px 8px;font:600 11px/1.2 sans-serif;cursor:pointer;";
    updateDprLabel();
    dprBtn.onclick = () => {
      this.dprIdx = (this.dprIdx + 1) % DPR_STEPS.length;
      this.currentDprOverride = DPR_STEPS[this.dprIdx]!;
      this.options.setDprOverride(this.currentDprOverride);
      updateDprLabel();
      this.mobileCapture?.schedule("dpr", 1200);
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
        this.mobileCapture?.schedule(`toggle:${key}=${this.liveState[key] ? "on" : "off"}`, 1200);
      };
      this.btnMap.set(key, b);
      grid.append(b);
    }
    this.refreshButtons();

    drawer.append(presetRow, dprBtn, grid);
    wrap.append(topRow, drawer);
    return wrap;
  }
}
