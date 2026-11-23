import { observeWebGPUDraws, WebGPURenderSubmissionMonitor } from "@galacean/engine-terrain/terrain/performance/WebGPUDrawCounters";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisorderedArray } from "@galacean/engine-core";
import { sha256Portable } from "@galacean/engine-building/building/runtime/Sha256.js";
import {
  attachMobileFrameCapture,
  type MobileFrameCaptureRecord,
  type MobileSeedTickHost,
  type PerfCumulativeCounters,
  type PerfFrameObserver
} from "../../demos/seed-world/src/MobileFrameCapture.ts";
import {
  SeedWorldPerfPanel,
  bufferSourceByteLength,
  primitiveTriangleCount
} from "../../demos/seed-world/src/SeedWorldPerfPanel.ts";
import { createMobileDiagMiddleware } from "../../scripts/mobile-diag-middleware.mjs";

interface FakeElement {
  tagName: string;
  id: string;
  className: unknown;
  type?: string;
  textContent: string;
  title: string;
  disabled: boolean;
  href?: string;
  download?: string;
  dataset: Record<string, string>;
  style: { cssText: string; display?: string; background?: string; color?: string; borderColor?: string };
  onclick: (() => void) | null;
  children: FakeElement[];
  attributes: Record<string, string>;
  append(...nodes: FakeElement[]): void;
  remove(): void;
  click(): void;
  addEventListener(): void;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

function makeFakeElement(tag: string, attrs: Record<string, string> = {}): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id: attrs.id ?? "",
    className: attrs.class ?? "",
    textContent: "",
    title: "",
    disabled: false,
    dataset: {},
    style: { cssText: "" },
    onclick: null,
    children: [],
    attributes: { ...attrs },
    append(...nodes: FakeElement[]) {
      this.children.push(...nodes);
    },
    remove() {},
    click() {
      this.onclick?.();
    },
    addEventListener() {},
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name]! : null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    }
  };
  return el;
}

function installMinimalDom(hitElement?: FakeElement) {
  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  const origFetch = globalThis.fetch;

  const body = makeFakeElement("body");
  const fakeDoc = {
    body,
    createElement: (tag: string) => makeFakeElement(tag),
    elementFromPoint: () => hitElement ?? makeFakeElement("canvas", { id: "c", class: "viewport" })
  };
  Object.defineProperty(globalThis, "document", { value: fakeDoc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", {
    value: { devicePixelRatio: 2, innerWidth: 1280, setTimeout, clearTimeout },
    configurable: true,
    writable: true
  });

  return () => {
    Object.defineProperty(globalThis, "document", { value: origDocument, configurable: true, writable: true });
    Object.defineProperty(globalThis, "window", { value: origWindow, configurable: true, writable: true });
    globalThis.fetch = origFetch;
  };
}

function createFakeGl() {
  const proto = {
    FRAMEBUFFER: 0x8d40,
    DRAW_FRAMEBUFFER: 0x8ca9,
    READ_FRAMEBUFFER: 0x8ca8,
    FRAMEBUFFER_BINDING: 0x8ca6,
    getParameter(_pname: number) {
      return null;
    },
    drawElements(_mode: number, _count: number, _type: number, _offset: number) {},
    drawArrays(_mode: number, _first: number, _count: number) {},
    drawElementsInstanced(_mode: number, _count: number, _type: number, _offset: number, _instanceCount: number) {},
    drawArraysInstanced(_mode: number, _first: number, _count: number, _instanceCount: number) {},
    bindFramebuffer(_target: number, _framebuffer: unknown) {},
    bufferData(_target: number, _srcData: unknown, _usage: number, _srcOffset?: number, _length?: number) {},
    bufferSubData(_target: number, _dstOffset: number, _srcData: unknown, _srcOffset?: number, _length?: number) {}
  };
  const gl = Object.create(proto) as typeof proto;
  return { gl, proto };
}

function invokeMiddleware(
  handler: (req: EventEmitter & { method: string; url: string }, res: any) => void,
  options: { method: string; url?: string; chunks?: (Buffer | string)[] }
): Promise<{ statusCode: number; headers: Record<string, string>; bodyText: string; json: any }> {
  return new Promise((resolve) => {
    const req = Object.assign(new EventEmitter(), {
      method: options.method,
      url: options.url ?? "/"
    });
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      writableEnded: false,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      end(chunk?: string) {
        this.writableEnded = true;
        const bodyText = chunk ?? "";
        let json: any = null;
        try {
          json = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          json = null;
        }
        resolve({ statusCode: this.statusCode, headers, bodyText, json });
      }
    };
    handler(req, res);
    if (options.chunks) {
      for (const chunk of options.chunks) {
        req.emit("data", chunk);
      }
      req.emit("end");
    }
  });
}

describe("Seed World perf capture accuracy & first-principles invariants", () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("computes exact triangle counts across TRIANGLES, TRIANGLE_STRIP, TRIANGLE_FAN and non-triangle topologies", () => {
    expect(primitiveTriangleCount(4, 300)).toBe(100);
    expect(primitiveTriangleCount(4, 5)).toBe(1);
    expect(primitiveTriangleCount(5, 10)).toBe(8); // TRIANGLE_STRIP
    expect(primitiveTriangleCount(6, 10)).toBe(8); // TRIANGLE_FAN
    expect(primitiveTriangleCount(5, 2)).toBe(0);
    expect(primitiveTriangleCount(1, 100)).toBe(0); // LINES
    expect(primitiveTriangleCount(0, 100)).toBe(0); // POINTS
  });

  it("computes exact WebGL2 buffer upload byte lengths including srcOffset, length, length=0, subarray and DataView", () => {
    expect(bufferSourceByteLength(new ArrayBuffer(64))).toBe(64);
    const full = new Float32Array(100); // 400 bytes
    expect(bufferSourceByteLength(full)).toBe(400);
    expect(bufferSourceByteLength(full, 0, 16)).toBe(64); // 16 floats
    expect(bufferSourceByteLength(full, 10, 20)).toBe(80); // 20 floats starting at element 10
    expect(bufferSourceByteLength(full, 10, 0)).toBe(360); // WebGL2 length=0 means to end
    expect(bufferSourceByteLength(full, 90, 50)).toBe(40); // clamped to remaining
    expect(bufferSourceByteLength(full.subarray(10, 20))).toBe(40);
    expect(bufferSourceByteLength(new DataView(full.buffer, 16, 32))).toBe(32);
    expect(bufferSourceByteLength(null)).toBe(0);
  });

  it("counts successful instanced WebGPU primitives and reports indexed strips separately", () => {
    const original = vi.fn();
    const rhi = { backend: "webgpu", drawPrimitive: original };
    const engine = { _hardwareRenderer: rhi } as any;
    const counts = observeWebGPUDraws(engine)!;
    const panel = new WebGPURenderSubmissionMonitor(engine, 2);
    panel.start();
    rhi.drawPrimitive({ instanceCount: 3 }, { topology: 4, count: 12 }, {});
    rhi.drawPrimitive({ instanceCount: 0 }, { topology: 5, count: 6 }, {});
    rhi.drawPrimitive({ indexBufferBinding: {} }, { topology: 5, count: 12 }, {});
    original.mockImplementationOnce(() => { throw new Error("pipeline error"); });
    expect(() => rhi.drawPrimitive({}, { topology: 4, count: 3 }, {})).toThrow("pipeline error");
    expect(counts).toMatchObject({ draws: 3, instancedDraws: 1, instances: 3, triangles: 16, indexedStrips: 1 });
    panel.endFrame();
    counts.dispose();
    rhi.drawPrimitive({ instanceCount: 5 }, { topology: 4, count: 12 }, {});
    panel.endFrame();
    expect(panel.takeSnapshot()).toEqual({
      scope: "webgpu-direct", sampledFrames: 2, drawCalls: 2, instancedDrawCalls: 1,
      instances: 4, triangles: 18, trianglesLowerBound: true, shadowTileSize: null, shadowCascades: null
    });
    expect(counts.draws).toBe(3);
    expect(rhi.drawPrimitive).toBe(original);
  });

  it("tracks gl.bufferSubData uploads separately from Discard orphans, deduplicates FBO draw switches, and aligns HUD window 1 strictly to engine frames", () => {
    cleanups.push(installMinimalDom());
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, file: "tmp/seed-world-perf-diag.jsonl", count: 1 })
    }) as unknown as typeof fetch;

    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);

    const { gl } = createFakeGl();
    const fbA = { id: "A" } as unknown as WebGLFramebuffer;
    const fbB = { id: "B" } as unknown as WebGLFramebuffer;
    const canvasEl = Object.assign(makeFakeElement("canvas"), {
      width: 1000,
      height: 500,
      clientWidth: 500,
      clientHeight: 250
    });

    class FakeEngine {
      _hardwareRenderer = { gl };
      canvas = { width: 1000, height: 500 };
      update(): void {
        clock += 5; // 5ms CPU per frame
        // Draws: 100 TRIANGLES + 8 TRIANGLE_STRIP + 10*20 instanced TRIANGLES + 3*4 instanced TRIANGLE_FAN = 320 tris, 4 DCs
        gl.drawElements(4, 300, 5123, 0);
        gl.drawArrays(5, 0, 10);
        gl.drawElementsInstanced(4, 60, 5123, 0, 10);
        gl.drawArraysInstanced(6, 0, 6, 3);
        // FBO transitions: null -> fbA (+1), fbA -> fbA (+0 redundant), READ fbB (+0), DRAW fbB (+1), null (+1) => 3 draw switches, 5 raw binds
        gl.bindFramebuffer(0x8d40, fbA);
        gl.bindFramebuffer(0x8d40, fbA);
        gl.bindFramebuffer(0x8ca8, fbB);
        gl.bindFramebuffer(0x8ca9, fbB);
        gl.bindFramebuffer(0x8d40, null);
        // Buffers: Discard orphan 65536 bytes + bufferSubData 16 floats (64B) + bufferData(Uint8Array(128)) => 2 uploads (192B), 1 orphan (65536B)
        gl.bufferData(0x8892, 65536, 0x88e8);
        gl.bufferSubData(0x8892, 0, new Float32Array(100), 0, 16);
        gl.bufferData(0x8892, new Uint8Array(128), 0x88e4);
      }
    }

    const engine = new FakeEngine();
    const panel = new SeedWorldPerfPanel({
      engine: engine as any,
      scene: { background: { sky: { material: null } } } as any,
      canvas: canvasEl as any,
      root: { findByName: () => null } as any,
      camera: { enableHDR: true, enableScreenSpaceReflection: false } as any,
      sun: { shadowType: 0 } as any,
      post: { getDebugSnapshot: () => ({ enabled: false, bloom: { enabled: false }, tonemapping: false, colorAdjustments: { enabled: false }, sunLensFlare: { enabled: false } }) } as any,
      wind: { enabled: false } as any,
      environment: { weatherSystem: { state: { cloud: { cloudCoverage: 0 } } } } as any,
      readPublished: () => undefined,
      setVistaVisible: () => {},
      getVistaVisible: () => true,
      setHudVisible: () => {},
      setBuildingVisible: () => {},
      setDprOverride: () => {}
    });
    cleanups.push(() => panel.dispose());

    // Pre-frame async upload BEFORE frame 1 starts must not pollute Window 1 HUD average.
    gl.drawElements(4, 30000, 5123, 0);
    gl.bufferSubData(0x8892, 0, new Uint8Array(4096));

    // Run 10 frames spaced by 125ms => total span from frame 1 start to frame 10 end = 9*125 + 5 = 1130ms (>= 1000ms)
    for (let i = 0; i < 10; i++) {
      clock = 2000 + i * 125;
      engine.update();
    }

    const hud = canvasEl.dataset.perfHud ?? "";
    expect(hud).toContain("cpu=5.0ms(max 5.0)");
    // Exact 4 dc / frame and 3 draw FBO switches / frame (NOT 3.6 dc from (K-1)/K bug, and NOT 5 raw binds!)
    expect(hud).toContain("dc=4 fbo=3");
    // Exact 2 buffer uploads/frame (not 1, and not 65KB orphan falsely counted as upload!)
    expect(hud).toContain("buf=2(0KB) orph=1");

    const counters: PerfCumulativeCounters = {
      frames: 0,
      cpuMs: 0,
      dc: 0,
      tris: 0,
      fbo: 0,
      fboAll: 0,
      bufUploads: 0,
      bufUploadBytes: 0,
      bufOrphans: 0,
      bufOrphanBytes: 0
    };
    panel.readCumulativeCounters(counters);
    expect(counters.frames).toBe(10);
    expect(counters.dc).toBe(41); // 1 pre-frame + 10*4
    expect(counters.tris).toBe(10000 + 10 * 320);
    expect(counters.fbo).toBe(30);
    expect(counters.fboAll).toBe(50);
    expect(counters.bufUploads).toBe(21); // 1 pre-frame + 10*2
    expect(counters.bufUploadBytes).toBe(4096 + 10 * 192);
    expect(counters.bufOrphans).toBe(10);
    expect(counters.bufOrphanBytes).toBe(10 * 65536);

    panel.dispose();
    // Prototype methods cleanly restored (no leftover own wrappers).
    expect(Object.prototype.hasOwnProperty.call(gl, "drawElements")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(gl, "bufferSubData")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(engine, "update")).toBe(false);
  });

  it("separates RenderQueue time by PipelineStage, computes exact FPS & window-aligned renderStats, avoids Script mutation, queues overlapping schedules, and guards upload races", async () => {
    vi.useFakeTimers();
    const svgHit = makeFakeElement("svg", { id: "joy", class: "icon-btn" });
    svgHit.className = { baseVal: "icon-btn", animVal: "icon-btn" }; // real SVGAnimatedString shape
    cleanups.push(installMinimalDom(svgHit));

    let resolveFirstFetch!: (value: any) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstFetch = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        // SPA static fallback returning 200 OK HTML (non-JSON) must NOT show "已上报".
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        }
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, file: "tmp/seed-world-perf-diag.jsonl", count: 3 })
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let clock = 5000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);

    class RenderQueueMock {
      elements = [{ id: 1 }, { id: 2 }, { id: 3 }];
      batchedElements = [{ id: 1 }];
      render(_ctx: unknown, stage: string): void {
        if (stage === "ShadowCaster") clock += 0.5;
        else if (stage === "DepthOnly") clock += 0.25;
        else if (stage === "SSRReceiver") clock += 0.75;
        else if (stage === "Forward") clock += 1.0;
      }
    }

    class ScriptA {
      entity = { name: "Seed World Runtime" };
      onUpdate(): void {
        clock += 0.4;
      }
    }
    class b {
      entity = { name: "Dynamic Helper" };
      onUpdate(): void {
        clock += 0.2;
      }
    }
    class u {
      static readonly UBER_SHADER_NAME = "PostProcess/Uber";
      onRender(): void {
        clock += 0.3;
      }
    }

    const updateScripts = new DisorderedArray<any>();
    const scriptA = new ScriptA();
    const staleScript = new ScriptA();
    updateScripts.add(scriptA);
    updateScripts.add(staleScript);
    updateScripts.deleteByIndex(1); // Leaves length = 1, _elements.length = 2
    const lateScripts = new DisorderedArray<any>();
    lateScripts.add({
      constructor: { name: "TerrainNavigationRuntime" },
      enabled: true,
      inputEnabled: true,
      inputMode: "joystick",
      movementGestureEnabled: true,
      onLateUpdate() {}
    });

    const opaqueQueue = new RenderQueueMock();
    const alphaTestQueue = new RenderQueueMock();
    const transparentQueue = new RenderQueueMock();

    const uberPass = new u();
    let refreshedPostPasses = false;
    const engineMock: any = {
      _postProcessPasses: [uberPass],
      _activePostProcessPasses: [],
      _getActivePostProcessPasses() {
        refreshedPostPasses = true;
        this._activePostProcessPasses = [uberPass];
        return this._activePostProcessPasses;
      },
      _batcherManager: { uploadBuffer() {} },
      _render() {
        pipeMock.render();
      }
    };

    const pipeMock: any = {
      _cullingResults: {
        opaqueQueue,
        alphaTestQueue,
        transparentQueue,
        sortBatch() {}
      },
      _cascadedShadowCasterPass: {
        onRender() {
          // 4 shadow cascades invoking opaqueQueue + alphaTestQueue
          for (let c = 0; c < 4; c++) {
            opaqueQueue.render(null, "ShadowCaster");
            alphaTestQueue.render(null, "ShadowCaster");
          }
        }
      },
      _depthOnlyPass: {
        onRender() {
          opaqueQueue.render(null, "DepthOnly");
        },
        onResolveForwardDepth() {}
      },
      _saoPass: { onRender() {} },
      _opaqueTexturePass: { onRender() {} },
      _finalPass: { onRender() {} },
      _ssrPass: {
        prepare() {},
        renderPreForward() {
          transparentQueue.render(null, "SSRReceiver");
        },
        captureHistory() {},
        releaseFrameTargets() {}
      },
      _prepareRender() {},
      _prepareCameraRenderViewCulling() {},
      _renderRegisteredPasses() {},
      _drawRenderPass() {
        opaqueQueue.render(null, "Forward");
        alphaTestQueue.render(null, "Forward");
        transparentQueue.render(null, "Forward");
        sceneMock.postProcessManager._render();
      },
      render() {
        this._cascadedShadowCasterPass.onRender();
        this._prepareRender();
        this._prepareCameraRenderViewCulling();
        this._cullingResults.sortBatch();
        engineMock._batcherManager.uploadBuffer();
        this._renderRegisteredPasses();
        this._ssrPass.prepare();
        this._depthOnlyPass.onRender();
        this._ssrPass.renderPreForward();
        this._drawRenderPass();
        this._ssrPass.releaseFrameTargets();
      }
    };

    const sceneMock: any = {
      physics: { _update() {} },
      _updateRendering() {},
      _componentsManager: {
        _onUpdateScripts: updateScripts,
        _onLateUpdateScripts: lateScripts,
        callScriptOnStart() {},
        callScriptOnUpdate(dt: number) {
          this._onUpdateScripts._forEachWithContext(dt, (s: any) => s.onUpdate(dt), () => {});
        },
        callAnimationUpdate() {},
        callScriptOnLateUpdate(dt: number) {
          this._onLateUpdateScripts._forEachWithContext(dt, (s: any) => s.onLateUpdate(dt), () => {});
        },
        callRendererOnUpdate() {},
        callCameraOnBeginRender() {},
        callCameraOnEndRender() {},
        sortOverlayUICanvases() {}
      },
      postProcessManager: {
        _render() {
          for (const p of engineMock._getActivePostProcessPasses()) p.onRender();
        }
      },
      background: { sky: { _render() {}, material: null } },
      _maskManager: { clearMask() {} }
    };

    const cameraMock: any = { _renderPipeline: pipeMock, screenSpaceReflectionDiagnostics: { active: true } };
    const canvasEl = Object.assign(makeFakeElement("canvas"), {
      width: 1200,
      height: 600,
      clientWidth: 600,
      clientHeight: 300
    });

    let observer: PerfFrameObserver | null = null;
    const cumulative: PerfCumulativeCounters = {
      frames: 100,
      cpuMs: 999,
      dc: 5000, // Pre-capture DC total must be subtracted cleanly
      tris: 999999,
      fbo: 800,
      fboAll: 1600,
      bufUploads: 300,
      bufUploadBytes: 512 * 1024,
      bufOrphans: 50,
      bufOrphanBytes: 2 * 1024 * 1024
    };

    const runEngineFrame = (frameStartMs: number, extraCpu = 0, dcPerFrame = 40) => {
      clock = frameStartMs;
      const t0 = clock;
      observer?.onFrameBegin(t0);
      sceneMock._componentsManager.callScriptOnUpdate(0.016);
      sceneMock._componentsManager.callScriptOnLateUpdate(0.016);
      engineMock._render();
      clock += extraCpu;
      cumulative.frames += 1;
      cumulative.dc += dcPerFrame;
      cumulative.tris += 12000;
      cumulative.fbo += 5;
      cumulative.fboAll += 9;
      cumulative.bufUploads += 3;
      cumulative.bufUploadBytes += 3 * 1024;
      cumulative.bufOrphans += 1;
      cumulative.bufOrphanBytes += 16 * 1024;
      const t1 = clock;
      observer?.onFrameEnd(t1 - t0, t1);
    };

    const controller = attachMobileFrameCapture({
      engine: engineMock,
      scene: sceneMock,
      camera: cameraMock,
      canvas: canvasEl as any,
      readLiveState: () => ({ water: true, bloom: false }),
      readCumulativeCounters: (out) => Object.assign(out, cumulative),
      setFrameObserver: (next) => {
        observer = next;
      },
      targetFrames: 10,
      captureTimeoutMs: 5000,
      autoBootDelayMs: null
    });
    cleanups.push(() => controller.dispose());

    // Capture #1: 10 frames at exact 60Hz (16.6667ms interval), adding a new script dynamically at frame 5.
    controller.captureNow("manual");
    // While Capture #1 is mid-flight, schedule a toggle capture — must NOT be silently dropped!
    controller.schedule("toggle:water=off", 0);
    vi.advanceTimersByTime(10);

    const dynamicScript = new b();
    for (let f = 0; f < 10; f++) {
      if (f === 5) updateScripts.add(dynamicScript);
      runEngineFrame(10_000 + f * (1000 / 60), f === 9 ? 5.0 : 0, 40);
      // Verify Script instances NEVER get mutated with own properties!
      expect(Object.prototype.hasOwnProperty.call(scriptA, "onUpdate")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(scriptA, "__mobCapWrapped")).toBe(false);
    }

    const host = globalThis as unknown as MobileSeedTickHost;
    expect(host.__seedWorldPerfCaptures).toHaveLength(1);
    const rec1: MobileFrameCaptureRecord = host.__seedWorldPerfCaptures![0]!;

    expect(rec1.schemaVersion).toBe(2);
    expect(rec1.partial).toBe(false);
    expect(rec1.capturedFrames).toBe(10);
    expect(rec1.frameIntervalsMs).toHaveLength(9);
    expect(rec1.frameIntervalsMs.every((dt) => dt === 16.7)).toBe(true);
    expect(rec1.renderStats.fps).toBe(60);
    expect(rec1.renderStats.dc).toBe(40); // Zero contamination from pre-capture 5000 DCs
    expect(rec1.renderStats.tris).toBe(12000);
    expect(rec1.renderStats.fbo).toBe(5);
    expect(rec1.renderStats.fboAll).toBe(9);
    expect(rec1.renderStats.bufUploads).toBe(3);
    expect(rec1.renderStats.bufUploadKB).toBe(3);
    expect(rec1.renderStats.bufOrphans).toBe(1);
    expect(rec1.renderStats.bufOrphanKB).toBe(16);
    expect(rec1.disabledModules).toEqual(["bloom"]);

    // CR-001: queueByStageMs separates ShadowCaster (4*0.5=2.0ms), DepthOnly (0.25ms), SSRReceiver (0.75ms), Forward (1.0ms)
    expect(rec1.queueByStageMs["ShadowCaster.opaque"]).toBe(2);
    expect(rec1.queueByStageMs["ShadowCaster.alphaTest"]).toBe(2);
    expect(rec1.queueByStageMs["DepthOnly.opaque"]).toBe(0.25);
    expect(rec1.queueByStageMs["SSRReceiver.transparent"]).toBe(0.75);
    expect(rec1.queueByStageMs["Forward.opaque"]).toBe(1);
    expect(rec1.queueByStageMs["Forward.alphaTest"]).toBe(1);
    expect(rec1.queueByStageMs["Forward.transparent"]).toBe(1);
    // drawPassStagesMs ONLY contains Forward queues (not ShadowCaster/DepthOnly/SSRReceiver)
    expect(rec1.drawPassStagesMs["opaqueQueue:Forward"]).toBe(1);
    expect(rec1.pipelineStagesMs["opaqueQueue"]).toBeUndefined();
    expect(rec1.pipelineStagesMs["shadowPass"]).toBe(4);
    expect(rec1.pipelineStagesMs["drawRenderPass"]).toBe(3.3);
    // CR-004: dynamically added script (frames 5..9 => 5 * 0.2 / 10 = 0.1ms/f) was captured with readable minified name!
    expect(rec1.scriptUpdMs["ScriptA"]).toBe(0.4);
    expect(rec1.scriptUpdMs["b(Dynamic Helper)"]).toBe(0.1);
    // CR-005: refreshed post passes with readable minified label + clean SVG touchDiag
    expect(refreshedPostPasses).toBe(true);
    expect(rec1.postPassesMs["u(PostProcess/Uber)"]).toBe(0.3);
    expect(rec1.touchDiag.joystickHit).toBe("SVG#joy.icon-btn");

    // Mutating the engine's reused screenSpaceReflectionDiagnostics object after capture #1 must not corrupt rec1!
    cameraMock.screenSpaceReflectionDiagnostics.active = false;
    expect((rec1.ssrDiag as { active: boolean }).active).toBe(true);

    // Queued "toggle:water=off" automatically starts after 250ms delay!
    vi.advanceTimersByTime(250);
    expect(controller.button.textContent).toBe("采样中(toggle:water=off)...");

    const flushMicrotasks = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    };

    // CR-003 race guard: Capture #1's late fetch resolves while Capture #2 is actively sampling -> MUST NOT overwrite button!
    resolveFirstFetch({
      ok: true,
      json: async () => ({ ok: true, file: "tmp/seed-world-perf-diag.jsonl", count: 1 })
    });
    await flushMicrotasks();
    expect(controller.button.textContent).toBe("采样中(toggle:water=off)...");

    // Complete Capture #2 with different DC count (15 DC/f) — fetch #2 returns SPA HTML (non-JSON 200 OK)
    for (let f = 0; f < 10; f++) {
      runEngineFrame(20_000 + f * 33.3333, 0, 15);
    }
    await flushMicrotasks();
    expect(host.__seedWorldPerfCaptures).toHaveLength(2);
    expect(host.__seedWorldPerfCaptures![1]!.trigger).toBe("toggle:water=off");
    expect(host.__seedWorldPerfCaptures![1]!.renderStats.dc).toBe(15);
    expect(host.__seedWorldPerfCaptures![1]!.renderStats.fps).toBe(30);
    // Non-JSON 200 OK must display "已采样" (NOT false "已上报")!
    expect(controller.button.textContent).toMatch(/^已采样 #2 /);

    // Partial timeout test: engine pauses after 4 frames -> flushes partial record normalized by 4 frames!
    controller.captureNow("pause_test");
    for (let f = 0; f < 4; f++) {
      runEngineFrame(30_000 + f * 20, 0, 22);
    }
    // Simulate post-pause unrelated GL calls BEFORE timeout fires — must NOT leak into frame-4 snapshot!
    cumulative.dc += 9999;
    vi.advanceTimersByTime(5000);
    await flushMicrotasks();
    expect(host.__seedWorldPerfCaptures).toHaveLength(3);
    const rec3 = host.__seedWorldPerfCaptures![2]!;
    expect(rec3.partial).toBe(true);
    expect(rec3.capturedFrames).toBe(4);
    expect(rec3.renderStats.dc).toBe(22);
    expect(rec3.queueByStageMs["Forward.opaque"]).toBe(1);
    expect(controller.button.textContent).toMatch(/^已上报 #3 /);

    // After dispose, prototype-inherited methods are cleanly removed back to prototype.
    controller.dispose();
    expect(Object.prototype.hasOwnProperty.call(opaqueQueue, "render")).toBe(false);
    expect(host.__seedWorldPerfCaptures).toBeUndefined();
  });

  it("mobile-diag middleware handles split UTF-8 chunks, canonicalizes pretty JSON to single-line JSONL, preserves count across restarts, and surfaces DELETE errors", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-world-diag-test-"));
    cleanups.push(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const diagLog = path.join(tmpDir, "diag.jsonl");

    const handler1 = createMobileDiagMiddleware({ diagLog, root: tmpDir, maxBodyBytes: 512, log: () => {} });

    // 1. Split a 3-byte Chinese UTF-8 character ('全' = E5 85 A8) right across two Buffer chunks + pretty multi-line JSON
    const prettyPayload = JSON.stringify({ trigger: "preset:全关裸地", avgCpuMs: 9.5 }, null, 2);
    const fullBytes = Buffer.from(prettyPayload, "utf8");
    const splitIdx = fullBytes.indexOf(Buffer.from("全", "utf8")) + 1; // cuts right inside 3-byte UTF-8 sequence
    const post1 = await invokeMiddleware(handler1, {
      method: "POST",
      chunks: [fullBytes.subarray(0, splitIdx), fullBytes.subarray(splitIdx)]
    });
    expect(post1.statusCode).toBe(200);
    expect(post1.json).toEqual({ ok: true, file: "diag.jsonl", count: 1 });

    // File must be strictly single-line JSONL (not pretty multi-line) with intact Chinese!
    const rawLines = fs.readFileSync(diagLog, "utf8").trim().split("\n");
    expect(rawLines).toHaveLength(1);
    expect(JSON.parse(rawLines[0]!)).toEqual({ trigger: "preset:全关裸地", avgCpuMs: 9.5 });

    // 2. Restart middleware on existing log file -> next POST count must continue from 2, matching GET!
    const handler2 = createMobileDiagMiddleware({ diagLog, root: tmpDir, maxBodyBytes: 512, log: () => {} });
    const post2 = await invokeMiddleware(handler2, {
      method: "POST",
      chunks: [Buffer.from(JSON.stringify({ trigger: "manual", avgCpuMs: 8.1 }), "utf8")]
    });
    expect(post2.statusCode).toBe(200);
    expect(post2.json.count).toBe(2);

    const getRes = await invokeMiddleware(handler2, { method: "GET", url: "/?tail=10" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json.count).toBe(2);
    expect(getRes.json.records).toEqual([
      { trigger: "preset:全关裸地", avgCpuMs: 9.5 },
      { trigger: "manual", avgCpuMs: 8.1 }
    ]);

    // 3. Guardrails: 413 too large, 400 invalid JSON, 400 empty, 204 OPTIONS, 405 PUT
    expect((await invokeMiddleware(handler2, { method: "POST", chunks: [Buffer.alloc(600, 0x61)] })).statusCode).toBe(413);
    expect((await invokeMiddleware(handler2, { method: "POST", chunks: [Buffer.from("{bad")] })).statusCode).toBe(400);
    expect((await invokeMiddleware(handler2, { method: "POST", chunks: [Buffer.from("   ")] })).statusCode).toBe(400);
    expect((await invokeMiddleware(handler2, { method: "OPTIONS" })).statusCode).toBe(204);
    expect((await invokeMiddleware(handler2, { method: "PUT" })).statusCode).toBe(405);

    // 4. DELETE clears cleanly; DELETE against an un-unlinkable directory returns 500 instead of lying ok:true
    const delOk = await invokeMiddleware(handler2, { method: "DELETE" });
    expect(delOk.statusCode).toBe(200);
    expect(fs.existsSync(diagLog)).toBe(false);

    const dirHandler = createMobileDiagMiddleware({ diagLog: tmpDir, root: tmpDir, log: () => {} });
    const delErr = await invokeMiddleware(dirHandler, { method: "DELETE" });
    expect(delErr.statusCode).toBe(500);
    expect(delErr.json.ok).toBe(false);
  });

  it("sha256Portable matches Node crypto bit-for-bit across Uint8Array, subarray, ArrayBuffer, TypedArrays and DataView", () => {
    const hex = (ab: ArrayBuffer) => Buffer.from(ab).toString("hex");
    const ref = (buf: Uint8Array) => crypto.createHash("sha256").update(buf).digest("hex");

    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(hex(sha256Portable(bytes))).toBe(ref(bytes));
    expect(hex(sha256Portable(bytes.buffer))).toBe(ref(bytes));
    expect(hex(sha256Portable(bytes.subarray(3, 11)))).toBe(ref(bytes.subarray(3, 11)));

    const u32 = new Uint32Array([0x12345678, 0xdeadbeef, 0x00ff00aa]);
    expect(hex(sha256Portable(u32))).toBe(ref(new Uint8Array(u32.buffer, u32.byteOffset, u32.byteLength)));

    const f32 = new Float32Array([1.5, -2.25, 3.125]);
    expect(hex(sha256Portable(f32))).toBe(ref(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)));

    const dv = new DataView(bytes.buffer, 4, 8);
    expect(hex(sha256Portable(dv))).toBe(ref(new Uint8Array(bytes.buffer, 4, 8)));
  });
});
