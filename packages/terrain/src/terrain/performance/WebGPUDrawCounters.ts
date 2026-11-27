import { MeshTopology, RHIBackend, type Engine } from "@galacean/engine";

interface DirectDrawCounts {
  draws: number;
  instancedDraws: number;
  instances: number;
  triangles: number;
  indexedStrips: number;
}

type HardwareRenderer = Engine["_hardwareRenderer"];
const observations = new WeakMap<
  HardwareRenderer,
  {
    counters: Set<DirectDrawCounts>;
    release(): void;
  }
>();

/** Count successful direct WebGPU RHI submissions while one or more product diagnostics are active. */
export function observeWebGPUDraws(engine: Engine) {
  const rhi = engine._hardwareRenderer;
  if (rhi?.backend !== RHIBackend.WebGPU) return;
  let observation = observations.get(rhi);
  if (!observation) {
    const previous = rhi.drawPrimitive;
    const owned = Object.prototype.hasOwnProperty.call(rhi, "drawPrimitive");
    const counters = new Set<DirectDrawCounts>();
    const observe: typeof previous = function (primitive, sub, program) {
      previous.call(this, primitive, sub, program);
      if (!sub) return;
      const instanceCount = primitive.instanceCount || 1;
      const indexedStrip = sub.topology === MeshTopology.TriangleStrip && !!primitive.indexBufferBinding;
      let triangles = 0;
      if (sub.topology === MeshTopology.Triangles) triangles = Math.floor(sub.count / 3);
      if (!indexedStrip && (sub.topology === MeshTopology.TriangleFan || sub.topology === MeshTopology.TriangleStrip)) {
        triangles = Math.max(sub.count - 2, 0);
      }
      for (const counter of counters) {
        counter.draws++;
        if (primitive.instanceCount > 0) {
          counter.instancedDraws++;
          counter.instances += instanceCount;
        }
        counter.triangles += triangles * instanceCount;
        if (indexedStrip) counter.indexedStrips++;
      }
    };
    rhi.drawPrimitive = observe;
    observation = {
      counters,
      release() {
        observations.delete(rhi);
        if (rhi.drawPrimitive !== observe) return;
        if (owned) rhi.drawPrimitive = previous;
        else Reflect.deleteProperty(rhi, "drawPrimitive");
      }
    };
    observations.set(rhi, observation);
  }
  const subscription = observation;
  const counters = {
    draws: 0,
    instancedDraws: 0,
    instances: 0,
    triangles: 0,
    indexedStrips: 0,
    dispose() {
      if (subscription.counters.delete(counters) && !subscription.counters.size) subscription.release();
    }
  };
  subscription.counters.add(counters);
  return counters;
}

/** Sample direct primitive submissions for a bounded number of drawn frames, then remove the hook. */
export class WebGPURenderSubmissionMonitor {
  private counts?: ReturnType<typeof observeWebGPUDraws>;
  private frames = 0;
  private previousDraws = 0;

  constructor(
    private readonly engine: Engine,
    private readonly sampleFrameLimit: number
  ) {}

  start(): void {
    this.counts ??= observeWebGPUDraws(this.engine);
  }

  endFrame(): void {
    const counts = this.counts;
    if (!counts || this.previousDraws === counts.draws) return;
    this.previousDraws = counts.draws;
    if (++this.frames >= this.sampleFrameLimit) counts.dispose();
  }

  takeSnapshot() {
    const counts = this.counts;
    const frames = this.frames;
    const average = (value: number) => (frames > 0 ? Math.round(value / frames) : 0);
    const snapshot = {
      scope: "webgpu-direct" as const,
      sampledFrames: frames,
      drawCalls: average(counts?.draws ?? 0),
      instancedDrawCalls: average(counts?.instancedDraws ?? 0),
      instances: average(counts?.instances ?? 0),
      triangles: average(counts?.triangles ?? 0),
      trianglesLowerBound: (counts?.indexedStrips ?? 0) > 0,
      shadowTileSize: null,
      shadowCascades: null
    };
    this.stop();
    return snapshot;
  }

  stop(): void {
    this.counts?.dispose();
    this.counts = undefined;
    this.previousDraws = this.frames = 0;
  }
}
