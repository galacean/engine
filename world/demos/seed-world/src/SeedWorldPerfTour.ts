import { observeWebGPUDraws } from "@galacean/engine-terrain/terrain/performance/WebGPUDrawCounters";
import { Vector3, type Camera, type Engine } from "@galacean/engine";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PerfCumulativeCounters } from "./MobileFrameCapture";
import type { AuditedShaderCompile, SeedWorldShaderAuditSnapshot } from "./SeedWorldShaderAudit";

const GL_TRIANGLES = 4;
const GL_TRIANGLE_STRIP = 5;
const GL_TRIANGLE_FAN = 6;
const GL_FRAMEBUFFER = 0x8d40;
const GL_DRAW_FRAMEBUFFER = 0x8ca9;
const GL_FRAMEBUFFER_BINDING = 0x8ca6;

export type PerfTourSegmentId = "spawn-pan" | "approach-village" | "village-orbit" | "water-sweep";

export interface PerfTourPoint2D {
  readonly x: number;
  readonly z: number;
}

export interface PerfTourSegmentPlan {
  readonly id: PerfTourSegmentId;
  readonly label: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly kind: "pan" | "walk" | "orbit";
  readonly startPos: PerfTourPoint2D;
  readonly endPos: PerfTourPoint2D;
  readonly startLook: PerfTourPoint2D;
  readonly endLook: PerfTourPoint2D;
  readonly orbitCenter?: PerfTourPoint2D;
  readonly orbitRadius?: number;
  readonly orbitStartAngle?: number;
  readonly orbitDeltaAngle?: number;
  readonly heightOffsetM: number;
  readonly lookHeightOffsetM: number;
}

export interface PerfTourRouteInput {
  readonly spawnEye: readonly [number, number, number];
  readonly spawnForward: readonly [number, number, number];
  readonly plan?: IslandPlan;
  readonly durationSec?: number;
}

export interface PerfTourPose {
  readonly segmentId: PerfTourSegmentId;
  readonly segmentLabel: string;
  readonly segmentIndex: number;
  readonly segmentCount: number;
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface PerfTourFrameSample {
  readonly frameIndex: number;
  readonly tMs: number;
  readonly intervalMs: number;
  readonly cpuMs: number;
  readonly segmentId: PerfTourSegmentId;
  readonly dc: number;
  readonly tris: number;
  readonly fbo: number;
  readonly unmeasuredIndexedStrips?: number;
}

export interface PerfTourMetricsBlock {
  readonly frames: number;
  readonly durationMs: number;
  readonly avgFps: number;
  readonly onePercentLowFps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly jank50Count: number;
  readonly jank50Pct: number;
  readonly bigJank100Count: number;
  readonly bigJank100Pct: number;
  readonly hitchTimeMs: number;
  readonly hitchTimePct: number;
  readonly avgCpuMs: number;
  readonly p95CpuMs: number;
  readonly maxCpuMs: number;
  readonly avgDc: number;
  readonly maxDc: number;
  readonly avgTrisK: number;
  readonly maxTrisK: number;
  readonly avgFbo: number | null;
}

export interface PerfTourSegmentSummary extends PerfTourMetricsBlock {
  readonly id: PerfTourSegmentId;
  readonly label: string;
}

export interface PerfTourSpikeRecord {
  readonly frameIndex: number;
  readonly tMs: number;
  readonly intervalMs: number;
  readonly cpuMs: number;
  readonly segmentId: PerfTourSegmentId;
  readonly dc: number;
  readonly trisK: number;
}

export interface PerfTourShaderSummary {
  readonly shader: string;
  readonly stage: string;
  readonly phase: string;
  readonly caller: string;
  readonly elapsedMs: number;
  readonly macros: readonly string[];
}

export interface SeedWorldPerfTourReport {
  readonly kind: "seed-world-perf-tour";
  readonly drawScope?: "webgpu-direct";
  readonly unmeasuredIndexedStrips?: number;
  readonly schemaVersion: 1;
  readonly ts: number;
  readonly url: string;
  readonly ua: string;
  readonly dpr: number;
  readonly canvas: readonly [number, number, number, number];
  readonly templateId: string;
  readonly seed: string;
  readonly durationSec: number;
  readonly aborted: boolean;
  readonly hasVillage: boolean;
  readonly hasWater: boolean;
  readonly overall: PerfTourMetricsBlock;
  readonly segments: readonly PerfTourSegmentSummary[];
  readonly topSpikes: readonly PerfTourSpikeRecord[];
  readonly shaderCompilesDuringTour: number;
  readonly shaderCompileMsDuringTour: number;
  readonly shaderCompiles: readonly PerfTourShaderSummary[];
}

export interface SeedWorldPerfTourOptions {
  readonly engine: Engine;
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement;
  readonly templateId: string;
  readonly seed: string;
  readonly durationSec?: number;
  readonly eyeHeight: number;
  readonly sampleHeight: (x: number, z: number) => number | undefined;
  readonly readPlan: () => IslandPlan | undefined;
  readonly readCumulativeCounters?: (out: PerfCumulativeCounters) => PerfCumulativeCounters;
  readonly readShaderAudit?: () => SeedWorldShaderAuditSnapshot | undefined;
  readonly setControlsSuspended: (suspended: boolean) => void;
  readonly onRunningChange?: (running: boolean) => void;
  readonly endpointUrl?: string;
}

export interface SeedWorldPerfTourHandle {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  dispose(): void;
}

interface PerfTourWindowHost {
  __seedWorldPerfTourResult?: SeedWorldPerfTourReport;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx]!;
}

function primitiveTriangleCount(mode: number, count: number): number {
  if (count <= 0) return 0;
  if (mode === GL_TRIANGLES) return (count / 3) | 0;
  if (mode === GL_TRIANGLE_STRIP || mode === GL_TRIANGLE_FAN) return count > 2 ? count - 2 : 0;
  return 0;
}

/**
 * Deterministically builds a 4-segment fixed camera tour route from the world plan:
 * 1. `spawn-pan` (20%): sweeps left/right from the exact opening spawn pose.
 * 2. `approach-village` (25%): walks smoothly from spawn to the nearest village perimeter (or forward vista).
 * 3. `village-orbit` (35%): walks a 240-degree arc around the village cluster looking inward.
 * 4. `water-sweep` (20%): walks toward the nearest water body (or returns toward open terrain).
 */
export function buildPerfTourSegments(input: PerfTourRouteInput): {
  readonly segments: readonly PerfTourSegmentPlan[];
  readonly hasVillage: boolean;
  readonly hasWater: boolean;
} {
  const durationSec = clamp(Number.isFinite(input.durationSec) ? input.durationSec! : 20, 8, 120);
  const spawnX = input.spawnEye[0];
  const spawnZ = input.spawnEye[2];
  let fwdX = input.spawnForward[0];
  let fwdZ = input.spawnForward[2];
  const fwdLen = Math.hypot(fwdX, fwdZ);
  if (fwdLen > 1e-4) {
    fwdX /= fwdLen;
    fwdZ /= fwdLen;
  } else {
    fwdX = 0;
    fwdZ = -1;
  }

  const spawnPos: PerfTourPoint2D = { x: spawnX, z: spawnZ };
  const spawnLook: PerfTourPoint2D = { x: spawnX + fwdX * 24, z: spawnZ + fwdZ * 24 };

  // Find the nearest village cluster from plan.buildings (deterministic tie-break by building index).
  const buildings = input.plan?.buildings ?? [];
  let hasVillage = false;
  let focusCenter: PerfTourPoint2D = { x: spawnX + fwdX * 32, z: spawnZ + fwdZ * 32 };
  let orbitRadius = 18;

  if (buildings.length > 0) {
    hasVillage = true;
    let nearest = buildings[0]!;
    let nearestDist = dist2D(spawnX, spawnZ, nearest.center.x, nearest.center.z);
    for (let i = 1; i < buildings.length; i++) {
      const b = buildings[i]!;
      const d = dist2D(spawnX, spawnZ, b.center.x, b.center.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = b;
      }
    }
    const cluster = buildings.filter((b) => dist2D(nearest.center.x, nearest.center.z, b.center.x, b.center.z) <= 55);
    let sumX = 0;
    let sumZ = 0;
    for (const b of cluster) {
      sumX += b.center.x;
      sumZ += b.center.z;
    }
    const cx = sumX / cluster.length;
    const cz = sumZ / cluster.length;
    let maxR = 8;
    for (const b of cluster) {
      const halfExtent = Math.max(b.width ?? 6, b.depth ?? 6) * 0.5;
      const r = dist2D(cx, cz, b.center.x, b.center.z) + halfExtent;
      if (r > maxR) maxR = r;
    }
    focusCenter = { x: cx, z: cz };
    orbitRadius = clamp(maxR + 8, 16, 40);
  }

  // Approach point on the safe perimeter facing spawn.
  const toSpawnX = spawnX - focusCenter.x;
  const toSpawnZ = spawnZ - focusCenter.z;
  const toSpawnLen = Math.hypot(toSpawnX, toSpawnZ);
  const orbitStartAngle = toSpawnLen > 1e-3 ? Math.atan2(toSpawnZ, toSpawnX) : Math.atan2(-fwdZ, -fwdX);
  const approachEnd: PerfTourPoint2D = {
    x: focusCenter.x + Math.cos(orbitStartAngle) * orbitRadius,
    z: focusCenter.z + Math.sin(orbitStartAngle) * orbitRadius
  };

  const orbitDeltaAngle = (Math.PI * 4) / 3; // 240 degrees around the village/landmark
  const orbitEndAngle = orbitStartAngle + orbitDeltaAngle;
  const orbitEnd: PerfTourPoint2D = {
    x: focusCenter.x + Math.cos(orbitEndAngle) * orbitRadius,
    z: focusCenter.z + Math.sin(orbitEndAngle) * orbitRadius
  };

  // Find nearest water point relative to orbitEnd for the final sweep.
  let hasWater = false;
  let waterLook: PerfTourPoint2D = spawnLook;
  let waterWalkEnd: PerfTourPoint2D = {
    x: lerp(orbitEnd.x, spawnX, 0.45),
    z: lerp(orbitEnd.z, spawnZ, 0.45)
  };
  const waters = input.plan?.waters ?? [];
  let bestWaterPt: PerfTourPoint2D | undefined;
  let bestWaterDist = Infinity;
  for (const water of waters) {
    const pts = water.centerline?.length ? water.centerline : water.outline;
    if (!pts?.length) continue;
    for (const pt of pts) {
      const d = dist2D(orbitEnd.x, orbitEnd.z, pt.x, pt.z);
      if (d < bestWaterDist) {
        bestWaterDist = d;
        bestWaterPt = pt;
      }
    }
  }
  if (bestWaterPt && bestWaterDist < 240) {
    hasWater = true;
    const dx = bestWaterPt.x - orbitEnd.x;
    const dz = bestWaterPt.z - orbitEnd.z;
    const d = Math.max(1e-3, Math.hypot(dx, dz));
    const step = clamp(d - 10, 8, 28);
    waterWalkEnd = {
      x: orbitEnd.x + (dx / d) * step,
      z: orbitEnd.z + (dz / d) * step
    };
    waterLook = { x: bestWaterPt.x, z: bestWaterPt.z };
  }

  const t0 = 0;
  const t1 = durationSec * 0.2;
  const t2 = durationSec * 0.45;
  const t3 = durationSec * 0.8;
  const t4 = durationSec;

  const segments: PerfTourSegmentPlan[] = [
    {
      id: "spawn-pan",
      label: "出生点环视",
      startSec: t0,
      endSec: t1,
      kind: "pan",
      startPos: spawnPos,
      endPos: spawnPos,
      startLook: spawnLook,
      endLook: focusCenter,
      heightOffsetM: 0,
      lookHeightOffsetM: 0.4
    },
    {
      id: "approach-village",
      label: hasVillage ? "进村接近" : "前景推进",
      startSec: t1,
      endSec: t2,
      kind: "walk",
      startPos: spawnPos,
      endPos: approachEnd,
      startLook: focusCenter,
      endLook: focusCenter,
      heightOffsetM: 0.4,
      lookHeightOffsetM: 1.4
    },
    {
      id: "village-orbit",
      label: hasVillage ? "村庄绕行" : "地标绕行",
      startSec: t2,
      endSec: t3,
      kind: "orbit",
      startPos: approachEnd,
      endPos: orbitEnd,
      startLook: focusCenter,
      endLook: focusCenter,
      orbitCenter: focusCenter,
      orbitRadius,
      orbitStartAngle,
      orbitDeltaAngle,
      heightOffsetM: 0.9,
      lookHeightOffsetM: 1.8
    },
    {
      id: "water-sweep",
      label: hasWater ? "水岸远景" : "回望远景",
      startSec: t3,
      endSec: t4,
      kind: "walk",
      startPos: orbitEnd,
      endPos: waterWalkEnd,
      startLook: focusCenter,
      endLook: waterLook,
      heightOffsetM: 0.9,
      lookHeightOffsetM: 0.4
    }
  ];

  return { segments, hasVillage, hasWater };
}

/** Evaluates a smooth, ground-clamped camera pose along the tour at `elapsedSec`. */
export function samplePerfTourPose(
  segments: readonly PerfTourSegmentPlan[],
  elapsedSec: number,
  sampleHeight: (x: number, z: number) => number | undefined,
  eyeHeight: number,
  fallbackY = 1.6
): PerfTourPose {
  const totalSec = segments.length > 0 ? segments[segments.length - 1]!.endSec : 1;
  const clamped = clamp(elapsedSec, 0, totalSec);
  let segIndex = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    if (clamped <= segments[i]!.endSec) {
      segIndex = i;
      break;
    }
  }
  const seg = segments[segIndex]!;
  const span = Math.max(1e-6, seg.endSec - seg.startSec);
  const rawU = clamp((clamped - seg.startSec) / span, 0, 1);
  const u = smoothstep01(rawU);

  let x = seg.startPos.x;
  let z = seg.startPos.z;
  let lookX = seg.startLook.x;
  let lookZ = seg.startLook.z;

  if (seg.kind === "pan") {
    // Sweep -32deg -> +32deg -> align smoothly with endLook (focusCenter) so segment 2 starts seamlessly.
    const baseDx = seg.startLook.x - x;
    const baseDz = seg.startLook.z - z;
    const baseAngle = Math.atan2(baseDz, baseDx);
    const endAngle = Math.atan2(seg.endLook.z - z, seg.endLook.x - x);
    let deltaToEnd = endAngle - baseAngle;
    while (deltaToEnd > Math.PI) deltaToEnd -= Math.PI * 2;
    while (deltaToEnd < -Math.PI) deltaToEnd += Math.PI * 2;
    const sweep = Math.sin(rawU * Math.PI * 2) * 0.52 * (1 - rawU);
    const angle = baseAngle + deltaToEnd * u + sweep;
    lookX = x + Math.cos(angle) * 24;
    lookZ = z + Math.sin(angle) * 24;
  } else if (seg.kind === "orbit" && seg.orbitCenter && seg.orbitRadius !== undefined) {
    const angle = (seg.orbitStartAngle ?? 0) + (seg.orbitDeltaAngle ?? 0) * u;
    x = seg.orbitCenter.x + Math.cos(angle) * seg.orbitRadius;
    z = seg.orbitCenter.z + Math.sin(angle) * seg.orbitRadius;
    lookX = seg.orbitCenter.x;
    lookZ = seg.orbitCenter.z;
  } else {
    x = lerp(seg.startPos.x, seg.endPos.x, u);
    z = lerp(seg.startPos.z, seg.endPos.z, u);
    lookX = lerp(seg.startLook.x, seg.endLook.x, u);
    lookZ = lerp(seg.startLook.z, seg.endLook.z, u);
  }

  const groundEye = sampleHeight(x, z);
  const eyeY =
    (groundEye !== undefined && Number.isFinite(groundEye) ? groundEye : fallbackY - eyeHeight) +
    eyeHeight +
    seg.heightOffsetM;
  const groundLook = sampleHeight(lookX, lookZ);
  const lookY =
    (groundLook !== undefined && Number.isFinite(groundLook) ? groundLook : eyeY - eyeHeight) + seg.lookHeightOffsetM;

  return {
    segmentId: seg.id,
    segmentLabel: seg.label,
    segmentIndex: segIndex,
    segmentCount: segments.length,
    eye: [x, eyeY, z],
    target: [lookX, lookY, lookZ]
  };
}

function summarizeFrames(frames: readonly PerfTourFrameSample[]): PerfTourMetricsBlock {
  const n = frames.length;
  if (n === 0) {
    return {
      frames: 0,
      durationMs: 0,
      avgFps: 0,
      onePercentLowFps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      jank50Count: 0,
      jank50Pct: 0,
      bigJank100Count: 0,
      bigJank100Pct: 0,
      hitchTimeMs: 0,
      hitchTimePct: 0,
      avgCpuMs: 0,
      p95CpuMs: 0,
      maxCpuMs: 0,
      avgDc: 0,
      maxDc: 0,
      avgTrisK: 0,
      maxTrisK: 0,
      avgFbo: 0
    };
  }

  const intervals: number[] = new Array(n);
  const cpus: number[] = new Array(n);
  let totalIntervalMs = 0;
  let totalCpuMs = 0;
  let jank50Count = 0;
  let bigJank100Count = 0;
  let hitchTimeMs = 0;
  let totalDc = 0;
  let maxDc = 0;
  let totalTris = 0;
  let maxTris = 0;
  let totalFbo = 0;

  for (let i = 0; i < n; i++) {
    const f = frames[i]!;
    intervals[i] = f.intervalMs;
    cpus[i] = f.cpuMs;
    totalIntervalMs += f.intervalMs;
    totalCpuMs += f.cpuMs;
    if (f.intervalMs > 50) jank50Count++;
    if (f.intervalMs > 100) bigJank100Count++;
    if (f.intervalMs > 33.3333) hitchTimeMs += f.intervalMs - 33.3333;
    totalDc += f.dc;
    if (f.dc > maxDc) maxDc = f.dc;
    totalTris += f.tris;
    if (f.tris > maxTris) maxTris = f.tris;
    totalFbo += f.fbo;
  }

  intervals.sort((a, b) => a - b);
  cpus.sort((a, b) => a - b);

  // 1% Low FPS = 1000 / mean(slowest 1% frames)
  const lowCount = Math.max(1, Math.ceil(n * 0.01));
  let slowestSum = 0;
  for (let i = n - lowCount; i < n; i++) slowestSum += intervals[i]!;
  const slowestMean = slowestSum / lowCount;

  return {
    frames: n,
    durationMs: round1(totalIntervalMs),
    avgFps: totalIntervalMs > 0 ? round1((n * 1000) / totalIntervalMs) : 0,
    onePercentLowFps: slowestMean > 0 ? round1(1000 / slowestMean) : 0,
    p50Ms: round1(percentileSorted(intervals, 0.5)),
    p95Ms: round1(percentileSorted(intervals, 0.95)),
    p99Ms: round1(percentileSorted(intervals, 0.99)),
    maxMs: round1(intervals[n - 1]!),
    jank50Count,
    jank50Pct: round2((jank50Count / n) * 100),
    bigJank100Count,
    bigJank100Pct: round2((bigJank100Count / n) * 100),
    hitchTimeMs: round1(hitchTimeMs),
    hitchTimePct: totalIntervalMs > 0 ? round2((hitchTimeMs / totalIntervalMs) * 100) : 0,
    avgCpuMs: round2(totalCpuMs / n),
    p95CpuMs: round2(percentileSorted(cpus, 0.95)),
    maxCpuMs: round2(cpus[n - 1]!),
    avgDc: round1(totalDc / n),
    maxDc,
    avgTrisK: round1(totalTris / n / 1000),
    maxTrisK: round1(maxTris / 1000),
    avgFbo: Number.isFinite(totalFbo) ? round1(totalFbo / n) : null
  };
}

/** Computes overall, per-segment, and top-spike metrics from recorded tour frames. */
export function computePerfTourStats(
  frames: readonly PerfTourFrameSample[],
  segments: readonly PerfTourSegmentPlan[],
  topSpikeLimit = 5
): {
  readonly overall: PerfTourMetricsBlock;
  readonly segments: readonly PerfTourSegmentSummary[];
  readonly topSpikes: readonly PerfTourSpikeRecord[];
} {
  const overall = summarizeFrames(frames);
  const segSummaries: PerfTourSegmentSummary[] = segments.map((seg) => ({
    id: seg.id,
    label: seg.label,
    ...summarizeFrames(frames.filter((f) => f.segmentId === seg.id))
  }));
  const topSpikes: PerfTourSpikeRecord[] = [...frames]
    .sort((a, b) => b.intervalMs - a.intervalMs)
    .slice(0, topSpikeLimit)
    .map((f) => ({
      frameIndex: f.frameIndex,
      tMs: round1(f.tMs),
      intervalMs: round1(f.intervalMs),
      cpuMs: round1(f.cpuMs),
      segmentId: f.segmentId,
      dc: f.dc,
      trisK: round1(f.tris / 1000)
    }));

  return { overall, segments: segSummaries, topSpikes };
}

function emptyCounters(): PerfCumulativeCounters {
  return {
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
}

function restoreProp<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  wrapped: T[K],
  prev: T[K],
  hadOwn: boolean
): void {
  if (obj[key] !== wrapped) return;
  if (hadOwn) obj[key] = prev;
  else delete obj[key];
}

/** Lightweight GL draw/triangle/FBO counter fallback used only when SeedWorldPerfPanel is not mounted. */
function installLightweightCounters(engine: Engine): {
  read(out: PerfCumulativeCounters): PerfCumulativeCounters;
  dispose(): void;
} {
  const gpu = observeWebGPUDraws(engine);
  if (gpu) {
    return {
      read(out) {
        out.drawScope = "webgpu-direct";
        out.indexedStrips = gpu.indexedStrips;
        out.dc = gpu.draws;
        out.tris = gpu.triangles;
        out.fbo = NaN;
        return out;
      },
      dispose: gpu.dispose
    };
  }
  const rhi = (engine as unknown as { _hardwareRenderer?: { gl?: WebGLRenderingContext | WebGL2RenderingContext } })
    ._hardwareRenderer;
  const gl = rhi?.gl;
  let totalDc = 0;
  let totalTris = 0;
  let totalFbo = 0;
  let currentFbo: WebGLFramebuffer | null = null;
  const restores: (() => void)[] = [];
  let disposed = false;

  if (gl) {
    try {
      currentFbo = (gl.getParameter(GL_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null) ?? null;
    } catch {
      currentFbo = null;
    }
    const proto = Object.getPrototypeOf(gl) as WebGL2RenderingContext | null;
    const hookDraw = <K extends "drawElements" | "drawArrays" | "drawElementsInstanced" | "drawArraysInstanced">(
      key: K
    ) => {
      const target = gl as unknown as Record<string, unknown>;
      if (typeof target[key] !== "function") return;
      const hadOwn = Object.prototype.hasOwnProperty.call(gl, key);
      const prev = target[key] as (...args: number[]) => void;
      const nativeFn = proto && typeof proto[key] === "function" ? (proto[key] as unknown as typeof prev) : prev;
      let active = false;
      const wrapped = (...args: number[]) => {
        if (active || disposed) return nativeFn.apply(gl, args);
        active = true;
        try {
          totalDc++;
          if (key === "drawElements") totalTris += primitiveTriangleCount(args[0]!, args[1]!);
          else if (key === "drawArrays") totalTris += primitiveTriangleCount(args[0]!, args[2]!);
          else if (key === "drawElementsInstanced")
            totalTris += primitiveTriangleCount(args[0]!, args[1]!) * Math.max(0, args[4]!);
          else if (key === "drawArraysInstanced")
            totalTris += primitiveTriangleCount(args[0]!, args[2]!) * Math.max(0, args[3]!);
          return prev.apply(gl, args);
        } finally {
          active = false;
        }
      };
      target[key] = wrapped;
      restores.push(() => restoreProp(target, key, wrapped, prev, hadOwn));
    };

    hookDraw("drawElements");
    hookDraw("drawArrays");
    hookDraw("drawElementsInstanced");
    hookDraw("drawArraysInstanced");

    const hadOwnFbo = Object.prototype.hasOwnProperty.call(gl, "bindFramebuffer");
    const prevFbo = gl.bindFramebuffer;
    const nativeFbo = proto?.bindFramebuffer ?? prevFbo;
    let activeFbo = false;
    const wrappedFbo: typeof gl.bindFramebuffer = (target, fb) => {
      if (activeFbo || disposed) return nativeFbo.call(gl, target, fb);
      activeFbo = true;
      try {
        if (target === GL_FRAMEBUFFER || target === GL_DRAW_FRAMEBUFFER) {
          const next = fb ?? null;
          if (next !== currentFbo) {
            currentFbo = next;
            totalFbo++;
          }
        }
        return prevFbo.call(gl, target, fb);
      } finally {
        activeFbo = false;
      }
    };
    gl.bindFramebuffer = wrappedFbo;
    restores.push(() => restoreProp(gl, "bindFramebuffer", wrappedFbo, prevFbo, hadOwnFbo));
  }

  return {
    read(out: PerfCumulativeCounters) {
      out.dc = totalDc;
      out.tris = totalTris;
      out.fbo = totalFbo;
      return out;
    },
    dispose() {
      disposed = true;
      for (let i = restores.length - 1; i >= 0; i--) restores[i]!();
      restores.length = 0;
    }
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });
}

export function buildPerfTourScorecardHtml(report: SeedWorldPerfTourReport, uploadState: string): string {
  const o = report.overall;
  const gradeColor =
    o.bigJank100Count === 0 && o.onePercentLowFps >= 25 ? "#4ade80" : o.bigJank100Count <= 1 ? "#facc15" : "#f87171";

  const segRows = report.segments
    .map(
      (s) =>
        `<tr><td style="padding:3px 4px;">${escapeHtml(s.label)}</td>` +
        `<td style="padding:3px 4px;text-align:right;">${s.avgFps}</td>` +
        `<td style="padding:3px 4px;text-align:right;">${s.onePercentLowFps}</td>` +
        `<td style="padding:3px 4px;text-align:right;">${s.p95Ms}/${s.maxMs}</td>` +
        `<td style="padding:3px 4px;text-align:right;">${s.jank50Count}/${s.bigJank100Count}</td>` +
        `<td style="padding:3px 4px;text-align:right;">${s.avgTrisK}k</td></tr>`
    )
    .join("");

  const spikeRows = report.topSpikes
    .slice(0, 3)
    .map(
      (s) =>
        `#${s.frameIndex} @${(s.tMs / 1000).toFixed(1)}s [${escapeHtml(s.segmentId)}] <b>${s.intervalMs}ms</b> (cpu ${s.cpuMs}ms, ${s.dc}dc/${s.trisK}k)`
    )
    .join("<br>");

  return (
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">` +
    `<div style="font-weight:700;font-size:13px;color:${gradeColor};">固定路线巡游成绩单${report.aborted ? " (已中止)" : ""}</div>` +
    `<div style="font-size:11px;color:#94a3b8;">${escapeHtml(report.templateId)} · ${report.canvas[0]}×${report.canvas[1]}</div></div>` +
    `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">` +
    `<div style="background:rgba(30,41,59,0.9);border-radius:8px;padding:6px 8px;"><div style="color:#94a3b8;font-size:10px;">Avg / 1% Low</div><div style="font-size:14px;font-weight:700;color:#4ade80;">${o.avgFps} / ${o.onePercentLowFps}</div></div>` +
    `<div style="background:rgba(30,41,59,0.9);border-radius:8px;padding:6px 8px;"><div style="color:#94a3b8;font-size:10px;">P95 / Max (ms)</div><div style="font-size:14px;font-weight:700;color:#38bdf8;">${o.p95Ms} / ${o.maxMs}</div></div>` +
    `<div style="background:rgba(30,41,59,0.9);border-radius:8px;padding:6px 8px;"><div style="color:#94a3b8;font-size:10px;">&gt;50 / &gt;100ms 冻帧</div><div style="font-size:14px;font-weight:700;color:${o.bigJank100Count > 0 ? "#f87171" : "#4ade80"};">${o.jank50Count} / ${o.bigJank100Count}</div></div>` +
    `</div>` +
    `<div style="font-size:11px;color:#cbd5e1;margin-bottom:8px;">` +
    `Hitch(&gt;33ms): <b>${o.hitchTimePct}%</b> (${o.hitchTimeMs}ms) · CPU均值: <b>${o.avgCpuMs}ms</b> (max ${o.maxCpuMs})<br>` +
    `均值负载: <b>${report.drawScope ? "RHI " : ""}${o.avgDc}dc / ${report.unmeasuredIndexedStrips ? "≥" : ""}${o.avgTrisK}k tris${o.avgFbo === null ? "" : ` / ${o.avgFbo}fbo`}</b> · 巡游期新编译 Shader: <b>${report.shaderCompilesDuringTour}</b> (${report.shaderCompileMsDuringTour}ms)` +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">` +
    `<thead><tr style="color:#94a3b8;border-bottom:1px solid rgba(148,163,184,0.3);"><th style="text-align:left;padding:3px 4px;">路段</th><th style="text-align:right;padding:3px 4px;">FPS</th><th style="text-align:right;padding:3px 4px;">1%Low</th><th style="text-align:right;padding:3px 4px;">P95/Max</th><th style="text-align:right;padding:3px 4px;">50/100</th><th style="text-align:right;padding:3px 4px;">Tris</th></tr></thead>` +
    `<tbody>${segRows}</tbody></table>` +
    `<div style="font-size:10px;color:#94a3b8;margin-bottom:8px;background:rgba(15,23,42,0.7);padding:6px 8px;border-radius:6px;">Top 3 慢帧:<br>${spikeRows || "无"}</div>` +
    `<div data-upload-status="1" style="font-size:11px;color:#93c5fd;margin-bottom:8px;">${escapeHtml(uploadState)}</div>`
  );
}

export function createSeedWorldPerfTour(options: SeedWorldPerfTourOptions): SeedWorldPerfTourHandle {
  const {
    engine,
    camera,
    canvas,
    templateId,
    seed,
    durationSec = 20,
    eyeHeight,
    sampleHeight,
    readPlan,
    readCumulativeCounters,
    readShaderAudit,
    setControlsSuspended,
    onRunningChange,
    endpointUrl = "/__mobile-diag"
  } = options;

  let disposed = false;
  let running = false;
  let restoreRunHooks: (() => void) | null = null;
  let bannerEl: HTMLDivElement | null = null;
  let modalEl: HTMLDivElement | null = null;

  const lookTargetVec = new Vector3();
  const savedEye = new Vector3();
  const savedForward = new Vector3();

  const clearUi = () => {
    bannerEl?.remove();
    bannerEl = null;
  };

  const clearModal = () => {
    modalEl?.remove();
    modalEl = null;
  };

  const renderScorecard = (report: SeedWorldPerfTourReport, uploadState: string) => {
    clearModal();
    if (disposed) return;
    const modal = document.createElement("div");
    modal.dataset.seedWorldPerfTourModal = "1";
    modal.style.cssText =
      "position:fixed;inset:12px;z-index:100020;display:flex;align-items:center;justify-content:center;pointer-events:none;";

    const card = document.createElement("div");
    card.style.cssText =
      "pointer-events:auto;width:min(420px,96vw);max-height:88vh;overflow-y:auto;background:rgba(15,23,42,0.95);color:#f8fafc;border:1px solid rgba(96,165,250,0.45);border-radius:12px;padding:12px 14px;font:500 12px/1.45 -apple-system,BlinkMacSystemFont,ui-monospace,monospace;box-shadow:0 16px 40px rgba(0,0,0,0.55);";

    const stopEvt = (e: Event) => e.stopPropagation();
    for (const ev of ["pointerdown", "touchstart", "wheel", "mousedown"]) {
      card.addEventListener(ev, stopEvt, { passive: true });
    }

    card.innerHTML = buildPerfTourScorecardHtml(report, uploadState);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
    const makeBtn = (text: string, bg: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText = `background:${bg};color:#f8fafc;border:1px solid rgba(148,163,184,0.4);border-radius:7px;padding:6px 10px;font:600 11px/1.2 sans-serif;cursor:pointer;`;
      b.onclick = onClick;
      return b;
    };
    const copyBtn = makeBtn("复制 JSON", "#1e293b", () => {
      const json = JSON.stringify(report, null, 2);
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(json).then(() => {
          copyBtn.textContent = "已复制 ✓";
          setTimeout(() => {
            copyBtn.textContent = "复制 JSON";
          }, 1500);
        });
      }
    });
    const rerunBtn = makeBtn("重跑一次", "#0f766e", () => {
      clearModal();
      start();
    });
    const closeBtn = makeBtn("关闭", "#334155", () => clearModal());
    btnRow.append(copyBtn, rerunBtn, closeBtn);
    card.append(btnRow);
    modal.append(card);
    document.body.append(modal);
    modalEl = modal;
  };

  const finishTour = (
    aborted: boolean,
    frames: readonly PerfTourFrameSample[],
    segments: readonly PerfTourSegmentPlan[],
    hasVillage: boolean,
    hasWater: boolean,
    shaderStartCount: number
  ) => {
    if (!running) return;
    running = false;
    restoreRunHooks?.();
    restoreRunHooks = null;
    clearUi();
    setControlsSuspended(false);
    onRunningChange?.(false);

    const { overall, segments: segSummaries, topSpikes } = computePerfTourStats(frames, segments);
    const shaderSnap = readShaderAudit?.();
    const compiledDuring: AuditedShaderCompile[] = shaderSnap ? shaderSnap.compiled.slice(shaderStartCount) : [];
    const shaderCompileMsDuringTour = round1(compiledDuring.reduce((sum, item) => sum + item.elapsedMs, 0));

    const rect = canvas.getBoundingClientRect();
    const report: SeedWorldPerfTourReport = {
      kind: "seed-world-perf-tour",
      ...(engine.graphicsBackend === "webgpu" && {
        drawScope: "webgpu-direct" as const,
        unmeasuredIndexedStrips: frames.reduce((sum, frame) => sum + (frame.unmeasuredIndexedStrips ?? 0), 0)
      }),
      schemaVersion: 1,
      ts: Date.now(),
      url: typeof location !== "undefined" ? location.href : "",
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      canvas: [canvas.width, canvas.height, Math.round(rect.width), Math.round(rect.height)],
      templateId,
      seed,
      durationSec,
      aborted,
      hasVillage,
      hasWater,
      overall,
      segments: segSummaries,
      topSpikes,
      shaderCompilesDuringTour: compiledDuring.length,
      shaderCompileMsDuringTour,
      shaderCompiles: compiledDuring.slice(0, 32).map((item) => ({
        shader: item.shader,
        stage: item.stage,
        phase: item.phase,
        caller: item.caller,
        elapsedMs: round1(item.elapsedMs),
        macros: item.macros
      }))
    };

    (globalThis as unknown as PerfTourWindowHost).__seedWorldPerfTourResult = report;
    canvas.dataset.perfTourStatus = aborted ? "aborted" : "done";

    renderScorecard(report, "正在上报 tmp/seed-world-perf-diag.jsonl ...");

    const updateStatus = (text: string) => {
      const el = modalEl?.querySelector("[data-upload-status]");
      if (el) el.textContent = text;
    };

    if (typeof fetch === "function") {
      void fetch(endpointUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report)
      })
        .then((res) => {
          updateStatus(
            res.ok ? "✓ 已自动上报至 tmp/seed-world-perf-diag.jsonl" : `上报返回 HTTP ${res.status}（可点复制 JSON）`
          );
        })
        .catch(() => {
          updateStatus("未连接本地上报端点（可点复制 JSON）");
        });
    } else {
      updateStatus("已完成（结果已写入 window.__seedWorldPerfTourResult）");
    }
  };

  const start = () => {
    if (disposed || running) return;
    clearModal();
    clearUi();

    savedEye.copyFrom(camera.entity.transform.worldPosition);
    savedForward.copyFrom(camera.entity.transform.worldForward);

    const { segments, hasVillage, hasWater } = buildPerfTourSegments({
      spawnEye: [savedEye.x, savedEye.y, savedEye.z],
      spawnForward: [savedForward.x, savedForward.y, savedForward.z],
      plan: readPlan(),
      durationSec
    });

    const shaderStartCount = readShaderAudit?.()?.compiled.length ?? 0;
    const fallbackCounters = readCumulativeCounters ? null : installLightweightCounters(engine);
    const readCounters = readCumulativeCounters ?? ((out: PerfCumulativeCounters) => fallbackCounters!.read(out));

    running = true;
    canvas.dataset.perfTourStatus = "running";
    setControlsSuspended(true);
    onRunningChange?.(true);

    // Build compact top progress banner.
    const banner = document.createElement("div");
    banner.dataset.seedWorldPerfTourBanner = "1";
    banner.style.cssText =
      "position:fixed;top:52px;right:8px;max-width:calc(100vw - 16px);z-index:100015;display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.92);color:#f8fafc;border:1px solid #38bdf8;border-radius:10px;padding:6px 10px;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;";
    const statusText = document.createElement("span");
    statusText.textContent = `巡游准备中 (0.0/${durationSec}s)`;
    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.textContent = "停止";
    stopBtn.style.cssText =
      "background:#991b1b;color:#fef2f2;border:1px solid #f87171;border-radius:6px;padding:3px 7px;font:600 11px/1.2 sans-serif;cursor:pointer;";
    banner.append(statusText, stopBtn);
    document.body.append(banner);
    bannerEl = banner;

    const frames: PerfTourFrameSample[] = [];
    const prevCounter = emptyCounters();
    const curCounter = emptyCounters();
    let tourStartMs = -1;
    let prevFrameStartMs = -1;
    let lastHudUpdateMs = 0;
    let recentBigJank = 0;
    let finished = false;

    const hadOwnUpdate = Object.prototype.hasOwnProperty.call(engine, "update");
    const origUpdate = engine.update;

    const cleanupHooks = () => {
      if (engine.update === wrappedUpdate) {
        if (hadOwnUpdate) engine.update = origUpdate;
        else delete (engine as unknown as { update?: unknown }).update;
      }
      fallbackCounters?.dispose();
    };

    stopBtn.onclick = () => {
      if (finished) return;
      finished = true;
      finishTour(true, frames, segments, hasVillage, hasWater, shaderStartCount);
    };

    const wrappedUpdate = () => {
      if (disposed || !running || finished) {
        origUpdate.call(engine);
        return;
      }
      const frameStartMs = performance.now();
      if (tourStartMs < 0) {
        tourStartMs = frameStartMs;
      }
      const elapsedMs = frameStartMs - tourStartMs;
      const elapsedSec = elapsedMs / 1000;

      const pose = samplePerfTourPose(segments, elapsedSec, sampleHeight, eyeHeight, savedEye.y);
      camera.entity.transform.setWorldPosition(pose.eye[0], pose.eye[1], pose.eye[2]);
      lookTargetVec.set(pose.target[0], pose.target[1], pose.target[2]);
      camera.entity.transform.lookAt(lookTargetVec);

      readCounters(prevCounter);
      try {
        origUpdate.call(engine);
      } finally {
        const frameEndMs = performance.now();
        const cpuMs = frameEndMs - frameStartMs;
        readCounters(curCounter);

        if (prevFrameStartMs >= 0) {
          const intervalMs = frameStartMs - prevFrameStartMs;
          if (intervalMs > 100) recentBigJank++;
          frames.push({
            frameIndex: frames.length,
            tMs: elapsedMs,
            intervalMs,
            cpuMs,
            segmentId: pose.segmentId,
            dc: Math.max(0, curCounter.dc - prevCounter.dc),
            tris: Math.max(0, curCounter.tris - prevCounter.tris),
            fbo: Math.max(0, curCounter.fbo - prevCounter.fbo),
            unmeasuredIndexedStrips: (curCounter.indexedStrips ?? 0) - (prevCounter.indexedStrips ?? 0)
          });
        }
        prevFrameStartMs = frameStartMs;

        if (frameEndMs - lastHudUpdateMs >= 200) {
          lastHudUpdateMs = frameEndMs;
          const liveFps = elapsedMs > 200 && frames.length > 0 ? ((frames.length * 1000) / elapsedMs).toFixed(1) : "--";
          statusText.textContent = `巡游 [${pose.segmentIndex + 1}/${pose.segmentCount} ${pose.segmentLabel}] ${Math.min(elapsedSec, durationSec).toFixed(1)}/${durationSec}s · ${liveFps}fps · 冻帧:${recentBigJank}`;
        }

        if (elapsedSec >= durationSec && !finished) {
          finished = true;
          finishTour(false, frames, segments, hasVillage, hasWater, shaderStartCount);
        }
      }
    };

    engine.update = wrappedUpdate;
    restoreRunHooks = cleanupHooks;
  };

  const stop = () => {
    if (!running) return;
    const stopBtn = bannerEl?.querySelector("button");
    if (stopBtn) stopBtn.click();
    else {
      running = false;
      restoreRunHooks?.();
      restoreRunHooks = null;
      clearUi();
      setControlsSuspended(false);
      onRunningChange?.(false);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (running) {
      running = false;
      restoreRunHooks?.();
      restoreRunHooks = null;
      setControlsSuspended(false);
      onRunningChange?.(false);
    }
    clearUi();
    clearModal();
  };

  return {
    start,
    stop,
    isRunning: () => running,
    dispose
  };
}
