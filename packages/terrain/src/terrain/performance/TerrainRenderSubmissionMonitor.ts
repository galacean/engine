interface MutableSubmissionCounts {
  drawCalls: number;
  instancedDrawCalls: number;
  instances: number;
  triangles: number;
}

interface MutablePassCounts extends MutableSubmissionCounts {
  readonly framebuffer: number;
  readonly viewport: readonly [x: number, y: number, width: number, height: number];
}

interface MutableFrameCounts extends MutableSubmissionCounts {
  readonly passes: Map<string, MutablePassCounts>;
}

interface MutableSampleCounts extends MutableFrameCounts {
  frames: number;
}

const DEFAULT_SAMPLE_FRAME_LIMIT = 120;

/** Per-cascade submissions observed in the directional-light shadow atlas. */
export interface TerrainShadowCascadeSubmission {
  /** Zero-based cascade index in the engine's atlas layout. */
  readonly cascade: number;
  /** Draw calls submitted to this cascade. */
  readonly drawCalls: number;
  /** Instance count submitted through instanced draws to this cascade. */
  readonly instances: number;
  /** Instance-weighted triangle count submitted to this cascade. */
  readonly triangles: number;
}

/** Average WebGL submissions per rendered frame over one panel sample. */
export interface TerrainRenderSubmissionSnapshot {
  /** Number of rendered frames included in this sample. */
  readonly sampledFrames: number;
  /** All regular and instanced WebGL draw calls. */
  readonly drawCalls: number;
  /** WebGL draw calls that use hardware instancing. */
  readonly instancedDrawCalls: number;
  /** Sum of `primcount` across instanced WebGL draw calls. */
  readonly instances: number;
  /** Primitive triangles multiplied by each draw's instance count. */
  readonly triangles: number;
  /** Detected directional-shadow tile size, or zero when no cascade atlas was submitted. */
  readonly shadowTileSize: number;
  /** Average submissions for each detected shadow cascade. */
  readonly shadowCascades: readonly TerrainShadowCascadeSubmission[];
}

/**
 * Observes actual WebGL draw submissions without changing renderer ownership.
 *
 * The monitor is activated only while the performance panel is visible. It
 * restores the exact functions that were installed before sampling stops.
 */
export class TerrainRenderSubmissionMonitor {
  private readonly _gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly _isWebGL2: boolean;
  private readonly _sampleFrameLimit: number;
  private _frame = createFrameCounts();
  private _sample = createSampleCounts();
  private _framebufferIds = new WeakMap<WebGLFramebuffer, number>();
  private _nextFramebufferId = 1;
  private _framebuffer = 0;
  private _viewport: [x: number, y: number, width: number, height: number];
  private _currentPass!: MutablePassCounts;
  private _active = false;
  private _drawElements?: WebGLRenderingContext["drawElements"];
  private _drawArrays?: WebGLRenderingContext["drawArrays"];
  private _drawElementsInstanced?: WebGL2RenderingContext["drawElementsInstanced"];
  private _drawArraysInstanced?: WebGL2RenderingContext["drawArraysInstanced"];
  private _viewportFunction?: WebGLRenderingContext["viewport"];
  private _bindFramebuffer?: WebGLRenderingContext["bindFramebuffer"];

  /**
   * Creates a submission monitor for one engine-owned WebGL context.
   * @param gl WebGL context whose draw entry points will be observed while active.
   * @param sampleFrameLimit Rendered frames collected before hooks are released.
   */
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext, sampleFrameLimit = DEFAULT_SAMPLE_FRAME_LIMIT) {
    this._gl = gl;
    this._isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this._sampleFrameLimit = sampleFrameLimit;
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    this._viewport = [viewport[0], viewport[1], viewport[2], viewport[3]];
    this._syncPass();
  }

  /** Starts observing draw submissions. Calling this twice has no effect. */
  start(): void {
    if (this._active) return;
    const gl = this._gl;
    this._active = true;
    this._frame = createFrameCounts();
    this._sample = createSampleCounts();
    this._framebufferIds = new WeakMap();
    this._nextFramebufferId = 1;
    this._framebuffer = framebufferId(
      gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      this._framebufferIds,
      () => this._nextFramebufferId++
    );
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    this._viewport = [viewport[0], viewport[1], viewport[2], viewport[3]];

    this._drawElements = gl.drawElements;
    this._drawArrays = gl.drawArrays;
    this._viewportFunction = gl.viewport;
    this._bindFramebuffer = gl.bindFramebuffer;
    gl.drawElements = this._hookedDrawElements;
    gl.drawArrays = this._hookedDrawArrays;
    gl.viewport = this._hookedViewport;
    gl.bindFramebuffer = this._hookedBindFramebuffer;

    if (this._isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      this._drawElementsInstanced = gl2.drawElementsInstanced;
      this._drawArraysInstanced = gl2.drawArraysInstanced;
      gl2.drawElementsInstanced = this._hookedDrawElementsInstanced;
      gl2.drawArraysInstanced = this._hookedDrawArraysInstanced;
    }
  }

  /**
   * Ends the current rendered frame and adds it to the active sample.
   *
   * Frames without draw submissions are ignored so background-tab throttling
   * does not dilute the per-rendered-frame values.
   */
  endFrame(): void {
    if (!this._active || this._frame.drawCalls === 0) return;
    addCounts(this._sample, this._frame);
    this._sample.frames++;
    for (const [key, pass] of this._frame.passes) {
      const aggregate = this._sample.passes.get(key) ?? createPassCounts(pass.framebuffer, pass.viewport);
      addCounts(aggregate, pass);
      this._sample.passes.set(key, aggregate);
    }
    this._frame = createFrameCounts();
    this._syncPass();
    if (this._sample.frames >= this._sampleFrameLimit) {
      this._releaseHooks();
      this._active = false;
    }
  }

  /**
   * Returns and clears the average submission sample.
   * @param shadowCascadeCount Configured directional-shadow cascade count.
   * @returns Average actual WebGL submissions per rendered frame.
   */
  takeSnapshot(shadowCascadeCount: number): TerrainRenderSubmissionSnapshot {
    const sample = this._sample;
    this._sample = createSampleCounts();
    if (sample.frames === 0) {
      return {
        sampledFrames: 0,
        drawCalls: 0,
        instancedDrawCalls: 0,
        instances: 0,
        triangles: 0,
        shadowTileSize: 0,
        shadowCascades: []
      };
    }

    const shadowAtlas = findShadowAtlas(sample.passes, shadowCascadeCount, sample.frames);
    return {
      sampledFrames: sample.frames,
      drawCalls: average(sample.drawCalls, sample.frames),
      instancedDrawCalls: average(sample.instancedDrawCalls, sample.frames),
      instances: average(sample.instances, sample.frames),
      triangles: average(sample.triangles, sample.frames),
      shadowTileSize: shadowAtlas?.tileSize ?? 0,
      shadowCascades: shadowAtlas?.cascades ?? []
    };
  }

  /** Stops observing and restores the WebGL entry points installed before sampling. */
  stop(): void {
    if (this._active) this._releaseHooks();
    this._active = false;
    this._frame = createFrameCounts();
    this._sample = createSampleCounts();
  }

  private _releaseHooks(): void {
    const gl = this._gl;
    if (gl.drawElements === this._hookedDrawElements) gl.drawElements = this._drawElements!;
    if (gl.drawArrays === this._hookedDrawArrays) gl.drawArrays = this._drawArrays!;
    if (gl.viewport === this._hookedViewport) gl.viewport = this._viewportFunction!;
    if (gl.bindFramebuffer === this._hookedBindFramebuffer) gl.bindFramebuffer = this._bindFramebuffer!;
    if (this._isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      if (gl2.drawElementsInstanced === this._hookedDrawElementsInstanced) {
        gl2.drawElementsInstanced = this._drawElementsInstanced!;
      }
      if (gl2.drawArraysInstanced === this._hookedDrawArraysInstanced) {
        gl2.drawArraysInstanced = this._drawArraysInstanced!;
      }
    }
  }

  private readonly _hookedDrawElements: WebGLRenderingContext["drawElements"] = (mode, count, type, offset) => {
    this._drawElements!.call(this._gl, mode, count, type, offset);
    this._record(mode, count, 1, false);
  };

  private readonly _hookedDrawArrays: WebGLRenderingContext["drawArrays"] = (mode, first, count) => {
    this._drawArrays!.call(this._gl, mode, first, count);
    this._record(mode, count, 1, false);
  };

  private readonly _hookedDrawElementsInstanced: WebGL2RenderingContext["drawElementsInstanced"] = (
    mode,
    count,
    type,
    offset,
    instanceCount
  ) => {
    this._drawElementsInstanced!.call(this._gl as WebGL2RenderingContext, mode, count, type, offset, instanceCount);
    this._record(mode, count, instanceCount, true);
  };

  private readonly _hookedDrawArraysInstanced: WebGL2RenderingContext["drawArraysInstanced"] = (
    mode,
    first,
    count,
    instanceCount
  ) => {
    this._drawArraysInstanced!.call(this._gl as WebGL2RenderingContext, mode, first, count, instanceCount);
    this._record(mode, count, instanceCount, true);
  };

  private readonly _hookedViewport: WebGLRenderingContext["viewport"] = (x, y, width, height) => {
    this._viewportFunction!.call(this._gl, x, y, width, height);
    this._viewport = [x, y, width, height];
    this._syncPass();
  };

  private readonly _hookedBindFramebuffer: WebGLRenderingContext["bindFramebuffer"] = (target, framebuffer) => {
    this._bindFramebuffer!.call(this._gl, target, framebuffer);
    if (
      target === this._gl.FRAMEBUFFER ||
      (this._isWebGL2 && target === (this._gl as WebGL2RenderingContext).DRAW_FRAMEBUFFER)
    ) {
      this._framebuffer = framebufferId(framebuffer, this._framebufferIds, () => this._nextFramebufferId++);
      this._syncPass();
    }
  };

  private _record(mode: number, count: number, instanceCount: number, instanced: boolean): void {
    if (!this._active) return;
    const triangles = primitiveTriangles(this._gl, mode, count) * instanceCount;
    this._frame.drawCalls++;
    this._frame.triangles += triangles;
    if (instanced) {
      this._frame.instancedDrawCalls++;
      this._frame.instances += instanceCount;
    }

    const pass = this._currentPass;
    pass.drawCalls++;
    pass.triangles += triangles;
    if (instanced) {
      pass.instancedDrawCalls++;
      pass.instances += instanceCount;
    }
  }

  private _syncPass(): void {
    const key = passKey(this._framebuffer, this._viewport);
    let pass = this._frame.passes.get(key);
    if (!pass) {
      pass = createPassCounts(this._framebuffer, this._viewport);
      this._frame.passes.set(key, pass);
    }
    this._currentPass = pass;
  }
}

function createCounts(): MutableSubmissionCounts {
  return { drawCalls: 0, instancedDrawCalls: 0, instances: 0, triangles: 0 };
}

function createFrameCounts(): MutableFrameCounts {
  return { ...createCounts(), passes: new Map() };
}

function createSampleCounts(): MutableSampleCounts {
  return { ...createFrameCounts(), frames: 0 };
}

function createPassCounts(
  framebuffer: number,
  viewport: readonly [x: number, y: number, width: number, height: number]
): MutablePassCounts {
  return { ...createCounts(), framebuffer, viewport: [...viewport] };
}

function addCounts(target: MutableSubmissionCounts, source: MutableSubmissionCounts): void {
  target.drawCalls += source.drawCalls;
  target.instancedDrawCalls += source.instancedDrawCalls;
  target.instances += source.instances;
  target.triangles += source.triangles;
}

function primitiveTriangles(gl: WebGLRenderingContext | WebGL2RenderingContext, mode: number, count: number): number {
  if (mode === gl.TRIANGLES) return count / 3;
  if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) return Math.max(0, count - 2);
  return 0;
}

function framebufferId(
  framebuffer: WebGLFramebuffer | null,
  ids: WeakMap<WebGLFramebuffer, number>,
  allocate: () => number
): number {
  if (!framebuffer) return 0;
  let id = ids.get(framebuffer);
  if (id === undefined) {
    id = allocate();
    ids.set(framebuffer, id);
  }
  return id;
}

function passKey(
  framebuffer: number,
  viewport: readonly [x: number, y: number, width: number, height: number]
): string {
  return `${framebuffer}:${viewport.join(",")}`;
}

function average(total: number, frames: number): number {
  return Math.round(total / frames);
}

function findShadowAtlas(
  passes: ReadonlyMap<string, MutablePassCounts>,
  cascadeCount: number,
  frames: number
): { readonly tileSize: number; readonly cascades: readonly TerrainShadowCascadeSubmission[] } | null {
  if (cascadeCount !== 1 && cascadeCount !== 2 && cascadeCount !== 4) return null;
  const byFramebuffer = new Map<number, Map<string, MutablePassCounts>>();
  for (const pass of passes.values()) {
    if (pass.framebuffer === 0) continue;
    const framebufferPasses = byFramebuffer.get(pass.framebuffer) ?? new Map();
    framebufferPasses.set(viewportKey(pass.viewport), pass);
    byFramebuffer.set(pass.framebuffer, framebufferPasses);
  }

  let best: {
    readonly tileSize: number;
    readonly cascades: readonly TerrainShadowCascadeSubmission[];
    readonly draws: number;
  } | null = null;
  for (const framebufferPasses of byFramebuffer.values()) {
    for (const originPass of framebufferPasses.values()) {
      const [x, y, width, height] = originPass.viewport;
      if (x !== 0 || y !== 0 || width <= 0 || width !== height) continue;
      const offsets =
        cascadeCount === 4
          ? ([
              [0, 0],
              [width, 0],
              [0, width],
              [width, width]
            ] as const)
          : cascadeCount === 2
            ? ([
                [0, 0],
                [width, 0]
              ] as const)
            : ([[0, 0]] as const);
      const cascadePasses = offsets.map(([offsetX, offsetY]) =>
        framebufferPasses.get(`${offsetX},${offsetY},${width},${width}`)
      );
      if (cascadePasses.some((pass) => pass === undefined)) continue;
      const cascades = cascadePasses.map((pass, cascade) => ({
        cascade,
        drawCalls: average(pass!.drawCalls, frames),
        instances: average(pass!.instances, frames),
        triangles: average(pass!.triangles, frames)
      }));
      const draws = cascades.reduce((sum, cascade) => sum + cascade.drawCalls, 0);
      if (!best || draws > best.draws) best = { tileSize: width, cascades, draws };
    }
  }
  return best && { tileSize: best.tileSize, cascades: best.cascades };
}

function viewportKey(viewport: readonly [x: number, y: number, width: number, height: number]): string {
  return viewport.join(",");
}
