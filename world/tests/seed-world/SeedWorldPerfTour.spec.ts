import { describe, expect, it } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  buildPerfTourScorecardHtml,
  buildPerfTourSegments,
  computePerfTourStats,
  samplePerfTourPose,
  type PerfTourFrameSample,
  type SeedWorldPerfTourReport
} from "../../demos/seed-world/src/SeedWorldPerfTour";

describe("SeedWorldPerfTour", () => {
  it("builds a deterministic 4-segment village & water tour with safe perimeter clearance", () => {
    const plan = {
      buildings: [
        { id: "b1", center: { x: 100, z: 100 }, width: 10, depth: 8 },
        { id: "b2", center: { x: 112, z: 106 }, width: 12, depth: 10 },
        // Distant second cluster (>55m away) should not pull the nearest village centroid.
        { id: "b3", center: { x: 400, z: 400 }, width: 10, depth: 10 }
      ],
      waters: [
        {
          id: "w1",
          kind: "river",
          label: "river",
          outline: [],
          centerline: [
            { x: 160, z: 95 },
            { x: 180, z: 110 }
          ]
        }
      ]
    } as unknown as IslandPlan;

    const a = buildPerfTourSegments({
      spawnEye: [50, 10, 100],
      spawnForward: [1, 0, 0],
      plan,
      durationSec: 20
    });
    const b = buildPerfTourSegments({
      spawnEye: [50, 10, 100],
      spawnForward: [1, 0, 0],
      plan,
      durationSec: 20
    });

    expect(a).toEqual(b);
    expect(a.hasVillage).toBe(true);
    expect(a.hasWater).toBe(true);
    expect(a.segments.map((s) => s.id)).toEqual(["spawn-pan", "approach-village", "village-orbit", "water-sweep"]);
    expect(a.segments[0]!.startSec).toBe(0);
    expect(a.segments[a.segments.length - 1]!.endSec).toBe(20);

    // Orbit radius stays outside the 2-house cluster (centroid at (106, 103), max extent ~13m + 8m = 21m).
    const orbit = a.segments[2]!;
    expect(orbit.orbitCenter!.x).toBeCloseTo(106, 3);
    expect(orbit.orbitCenter!.z).toBeCloseTo(103, 3);
    expect(orbit.orbitRadius!).toBeGreaterThanOrEqual(16);

    // Pose evaluation stays ground-clamped and continuous across segment boundaries.
    const flatHeight = () => 12;
    const pEndSeg1 = samplePerfTourPose(a.segments, a.segments[0]!.endSec, flatHeight, 1.6);
    const pStartSeg2 = samplePerfTourPose(a.segments, a.segments[1]!.startSec + 1e-4, flatHeight, 1.6);
    expect(Math.hypot(pEndSeg1.eye[0] - pStartSeg2.eye[0], pEndSeg1.eye[2] - pStartSeg2.eye[2])).toBeLessThan(0.1);
    expect(pEndSeg1.eye[1]).toBeCloseTo(13.6, 2);
  });

  it("falls back cleanly for building-free and water-free templates", () => {
    const route = buildPerfTourSegments({
      spawnEye: [0, 5, 0],
      spawnForward: [0, 0, -1],
      plan: { buildings: [], waters: [] } as unknown as IslandPlan,
      durationSec: 16
    });
    expect(route.hasVillage).toBe(false);
    expect(route.hasWater).toBe(false);
    expect(route.segments.length).toBe(4);
    expect(route.segments[3]!.endSec).toBe(16);

    const midPose = samplePerfTourPose(route.segments, 8, () => undefined, 1.6, 5);
    expect(Number.isFinite(midPose.eye[0])).toBe(true);
    expect(Number.isFinite(midPose.eye[1])).toBe(true);
    expect(Number.isFinite(midPose.eye[2])).toBe(true);
  });

  it("computes Avg FPS, 1% Low FPS, P95/P99/Max, Jank/BigJank, Hitch%, and per-segment stats accurately", () => {
    const route = buildPerfTourSegments({
      spawnEye: [0, 2, 0],
      spawnForward: [0, 0, -1],
      durationSec: 20
    });

    const frames: PerfTourFrameSample[] = [];
    let tMs = 0;
    // 98 smooth 16ms frames + 1 jank 60ms frame + 1 bigJank 200ms frame = 100 frames
    for (let i = 0; i < 100; i++) {
      const intervalMs = i === 50 ? 60 : i === 80 ? 200 : 16;
      const segmentId = i < 25 ? "spawn-pan" : i < 50 ? "approach-village" : i < 75 ? "village-orbit" : "water-sweep";
      tMs += intervalMs;
      frames.push({
        frameIndex: i,
        tMs,
        intervalMs,
        cpuMs: i === 80 ? 12 : 8,
        segmentId,
        dc: 100,
        tris: 300_000,
        fbo: 20
      });
    }

    const { overall, segments, topSpikes } = computePerfTourStats(frames, route.segments, 3);
    expect(overall.frames).toBe(100);
    // Total time = 98*16 + 60 + 200 = 1828ms => Avg FPS = 100000 / 1828 = 54.7
    expect(overall.durationMs).toBeCloseTo(1828, 1);
    expect(overall.avgFps).toBeCloseTo(54.7, 1);
    // Slowest 1% of 100 frames = 1 frame (200ms) => 1% Low FPS = 5.0
    expect(overall.onePercentLowFps).toBeCloseTo(5.0, 1);
    expect(overall.p50Ms).toBe(16);
    expect(overall.maxMs).toBe(200);
    expect(overall.jank50Count).toBe(2);
    expect(overall.jank50Pct).toBe(2);
    expect(overall.bigJank100Count).toBe(1);
    expect(overall.bigJank100Pct).toBe(1);
    // Hitch time = (60 - 33.3333) + (200 - 33.3333) = 193.3334ms => 10.58%
    expect(overall.hitchTimeMs).toBeCloseTo(193.3, 1);
    expect(overall.hitchTimePct).toBeCloseTo(10.58, 1);
    expect(overall.avgDc).toBe(100);
    expect(overall.avgTrisK).toBe(300);

    expect(segments.length).toBe(4);
    expect(segments[2]!.id).toBe("village-orbit");
    expect(segments[2]!.jank50Count).toBe(1);
    expect(segments[2]!.bigJank100Count).toBe(0);
    expect(segments[3]!.id).toBe("water-sweep");
    expect(segments[3]!.bigJank100Count).toBe(1);

    expect(topSpikes.length).toBe(3);
    expect(topSpikes[0]!.frameIndex).toBe(80);
    expect(topSpikes[0]!.intervalMs).toBe(200);
    expect(topSpikes[1]!.frameIndex).toBe(50);
    expect(topSpikes[1]!.intervalMs).toBe(60);
  });

  it("escapes HTML special characters in scorecard templateId, segment labels, spike segmentIds, and uploadState", () => {
    const payload = `<img src=x onerror="window.__xss=1">`;
    const report: SeedWorldPerfTourReport = {
      kind: "seed-world-perf-tour",
      schemaVersion: 1,
      ts: 1,
      url: "http://localhost/",
      ua: "test",
      dpr: 2,
      canvas: [411, 801],
      templateId: payload,
      seed: "1",
      durationSec: 20,
      aborted: false,
      hasVillage: true,
      hasWater: true,
      overall: {
        frames: 10,
        durationMs: 160,
        avgFps: 60,
        onePercentLowFps: 60,
        p50Ms: 16,
        p95Ms: 16,
        p99Ms: 16,
        maxMs: 16,
        jank50Count: 0,
        jank50Pct: 0,
        bigJank100Count: 0,
        bigJank100Pct: 0,
        hitchTimeMs: 0,
        hitchTimePct: 0,
        avgCpuMs: 4,
        maxCpuMs: 5,
        avgDc: 100,
        avgTrisK: 200,
        avgFbo: 10
      },
      segments: [
        {
          id: "spawn-pan",
          label: `<b>${payload}</b>`,
          frames: 10,
          durationMs: 160,
          avgFps: 60,
          onePercentLowFps: 60,
          p50Ms: 16,
          p95Ms: 16,
          p99Ms: 16,
          maxMs: 16,
          jank50Count: 0,
          jank50Pct: 0,
          bigJank100Count: 0,
          bigJank100Pct: 0,
          hitchTimeMs: 0,
          hitchTimePct: 0,
          avgCpuMs: 4,
          maxCpuMs: 5,
          avgDc: 100,
          avgTrisK: 200,
          avgFbo: 10
        }
      ],
      topSpikes: [
        {
          frameIndex: 1,
          tMs: 100,
          intervalMs: 20,
          cpuMs: 5,
          segmentId: payload as any,
          dc: 100,
          trisK: 200
        }
      ],
      shaderCompilesDuringTour: 0,
      shaderCompileMsDuringTour: 0,
      compiledShadersDuringTour: []
    };

    const html = buildPerfTourScorecardHtml(report, `<script>alert('x')</script>`);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });
});
