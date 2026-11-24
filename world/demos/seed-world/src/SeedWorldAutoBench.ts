import { Vector3, type Camera } from "@galacean/engine";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type {
  MobileFrameCaptureRecord,
  MobileFrameCaptureRunOptions,
  PerfCumulativeCounters
} from "./MobileFrameCapture";
import type { SeedWorldPerfModuleKey } from "./SeedWorldPerfPanel";

export interface SeedWorldAutoAblateDeps {
  readonly autoStart?: boolean;
  readonly canvas: HTMLCanvasElement;
  readonly setModule: (key: SeedWorldPerfModuleKey, on: boolean) => void;
  readonly setSubGroup: (group: "trees" | "details" | "terrain", on: boolean) => void;
  readonly setDpr: (dpr: number | null) => void;
  readonly readCounters: (out: PerfCumulativeCounters) => PerfCumulativeCounters;
}

export interface SeedWorldAutoBenchDeps {
  readonly durationSec: number;
  readonly camera: Camera;
  readonly navigation: TerrainNavigationRuntime;
  readonly bgWarmupDone: Promise<void>;
  readonly readPlan: () => IslandPlan | undefined;
  readonly sampleHeight: (x: number, z: number) => number | undefined;
  readonly isWater: (x: number, z: number) => boolean;
  readonly runCapture: (trigger: string, durationMs: number, options: MobileFrameCaptureRunOptions) => void;
  readonly ablate?: SeedWorldAutoAblateDeps;
  readonly signal?: AbortSignal;
}

export interface SeedWorldAutoBenchHandle {
  rerun(): void;
  runAblation(): void;
  dispose(): void;
}

type Pt2 = { readonly x: number; readonly z: number };

interface VillageBenchRoute {
  readonly villageCenter: Pt2;
  readonly walkStart: Pt2;
  readonly walkEnd: Pt2;
  readonly openPos: Pt2;
  readonly openAwayPos: Pt2;
  readonly openApproachPos: Pt2;
}

export function parseAutoBenchSeconds(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get("autoBench");
  if (raw === null) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "" || trimmed === "0" || trimmed === "false" || trimmed === "off") return null;
  if (trimmed === "1" || trimmed === "true" || trimmed === "village") return 20;
  const sec = Number(trimmed);
  if (!Number.isFinite(sec) || sec <= 0) return 20;
  return Math.min(60, Math.max(5, Math.round(sec)));
}

export function parseAutoAblateFlag(searchParams: URLSearchParams): boolean {
  const raw = searchParams.get("autoAblate");
  if (raw === null) return false;
  const trimmed = raw.trim().toLowerCase();
  return !["", "0", "false", "off"].includes(trimmed);
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function easeInOut(u: number): number {
  const t = clamp01(u);
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngleRad(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function computeVillageBenchRoute(
  plan: IslandPlan | undefined,
  fallbackPos: Pt2,
  sampleHeight: (x: number, z: number) => number | undefined,
  isWater: (x: number, z: number) => boolean
): VillageBenchRoute {
  const buildings = plan?.buildings ?? [];
  const buildingCircles = buildings.map((b) => ({
    x: b.center.x,
    z: b.center.z,
    r: Math.hypot(b.width || 8, b.depth || 8) * 0.5 + 2.2
  }));

  let villageCenter: Pt2 = fallbackPos;
  if (plan?.plazas && plan.plazas.length > 0) {
    villageCenter = { x: plan.plazas[0]!.center.x, z: plan.plazas[0]!.center.z };
  } else if (buildings.length > 0) {
    let sx = 0;
    let sz = 0;
    for (const b of buildings) {
      sx += b.center.x;
      sz += b.center.z;
    }
    villageCenter = { x: sx / buildings.length, z: sz / buildings.length };
  }

  const clearance = (x: number, z: number): number => {
    const h = sampleHeight(x, z);
    if (h === undefined || !Number.isFinite(h)) return -1e6;
    if (isWater(x, z)) return -1e5;
    let minC = 1e6;
    for (let i = 0; i < buildingCircles.length; i++) {
      const b = buildingCircles[i]!;
      const c = Math.hypot(x - b.x, z - b.z) - b.r;
      if (c < minC) minC = c;
    }
    return minC;
  };

  const segmentClear = (a: Pt2, b: Pt2, steps = 5): number => {
    let worst = Infinity;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const c = clearance(lerp(a.x, b.x, u), lerp(a.z, b.z, u));
      if (c < worst) worst = c;
    }
    return worst;
  };

  // 1. Safe start point near village center (avoiding building interiors & water).
  let walkStart = villageCenter;
  if (clearance(walkStart.x, walkStart.z) < 1.5) {
    let bestPt = villageCenter;
    let bestScore = -Infinity;
    for (const radius of [3, 6, 9, 12, 16, 20]) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const px = villageCenter.x + Math.cos(ang) * radius;
        const pz = villageCenter.z + Math.sin(ang) * radius;
        const c = clearance(px, pz);
        if (c >= 1.5) {
          walkStart = { x: px, z: pz };
          bestScore = Infinity;
          break;
        }
        if (c > bestScore) {
          bestScore = c;
          bestPt = { x: px, z: pz };
        }
      }
      if (bestScore === Infinity) break;
    }
    if (bestScore !== Infinity) walkStart = bestPt;
  }

  // 2. Open-space vantage point ~48-55m outside the village (away from buildings/water) with a continuous dry corridor from walkStart.
  const spawnBiasAngle = plan?.spawn
    ? Math.atan2(plan.spawn.z - villageCenter.z, plan.spawn.x - villageCenter.x)
    : 0;
  let openPos: Pt2 = {
    x: walkStart.x + Math.cos(spawnBiasAngle) * 46,
    z: walkStart.z + Math.sin(spawnBiasAngle) * 46
  };
  let bestOpenScore = -Infinity;
  for (const radius of [48, 42, 54, 36]) {
    for (let i = 0; i < 24; i++) {
      const ang = spawnBiasAngle + (i / 24) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const cand: Pt2 = { x: walkStart.x + cosA * radius, z: walkStart.z + sinA * radius };
      const away: Pt2 = { x: cand.x + cosA * 6, z: cand.z + sinA * 6 };
      const corridorC = segmentClear(walkStart, away, 10);
      const openC = clearance(away.x, away.z);
      if (corridorC < -100 || openC < -100) continue;
      // Prefer a dry, building-clear continuous corridor from village center out into open space.
      const angleDiff = Math.abs(Math.atan2(Math.sin(ang - spawnBiasAngle), Math.cos(ang - spawnBiasAngle)));
      const score = Math.min(corridorC, 4) * 8 + Math.min(openC, 25) * 1.5 - angleDiff * 3;
      if (score > bestOpenScore) {
        bestOpenScore = score;
        openPos = cand;
      }
    }
    if (bestOpenScore > 30) break;
  }

  // Continuous waypoints along the same corridor: walkStart -> walkEnd (village edge) -> openPos -> openAwayPos -> openApproachPos -> walkStart.
  const walkEnd: Pt2 = {
    x: lerp(walkStart.x, openPos.x, 0.5),
    z: lerp(walkStart.z, openPos.z, 0.5)
  };
  const outAngle = Math.atan2(openPos.z - walkStart.z, openPos.x - walkStart.x);
  const openAwayPos: Pt2 = {
    x: openPos.x + Math.cos(outAngle) * 6,
    z: openPos.z + Math.sin(outAngle) * 6
  };
  const openApproachPos: Pt2 = {
    x: lerp(openAwayPos.x, walkEnd.x, 0.45),
    z: lerp(openAwayPos.z, walkEnd.z, 0.45)
  };

  return { villageCenter, walkStart, walkEnd, openPos, openAwayPos, openApproachPos };
}

function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForFpsStable(
  onStatus: (text: string) => void,
  signal?: AbortSignal,
  minWaitMs = 2000,
  maxWaitMs = 5500
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const startAt = performance.now();
    let lastAt = startAt;
    let rafId = 0;
    const recent: { t: number; dt: number }[] = [];
    const done = () => {
      if (rafId) cancelAnimationFrame(rafId);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    signal?.addEventListener("abort", done, { once: true });

    const step = (now: number) => {
      if (signal?.aborted) {
        done();
        return;
      }
      const dt = now - lastAt;
      lastAt = now;
      if (dt > 0 && dt < 2000) recent.push({ t: now, dt });
      while (recent.length > 0 && now - recent[0]!.t > 1500) recent.shift();
      const elapsed = now - startAt;
      const maxDt = recent.reduce((m, r) => (r.dt > m ? r.dt : m), 0);
      const fps = recent.length >= 2 ? (recent.length * 1000) / Math.max(1, now - recent[0]!.t) : 0;
      onStatus(`自动压测 | 等待帧率稳定 (${(elapsed / 1000).toFixed(1)}s · ${fps.toFixed(0)}fps)`);
      if (elapsed >= maxWaitMs || (elapsed >= minWaitMs && recent.length >= 25 && maxDt <= 75)) {
        done();
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  });
}

export function startSeedWorldAutoBench(deps: SeedWorldAutoBenchDeps): SeedWorldAutoBenchHandle {
  const { durationSec, camera, navigation, bgWarmupDone, readPlan, sampleHeight, isWater, runCapture, ablate, signal } =
    deps;
  const durationMs = durationSec * 1000;
  let disposed = false;
  let running = false;
  const lookTarget = new Vector3();

  // Floating status HUD (top-center, non-intrusive; becomes clickable only when finished so user can re-run).
  const banner = document.createElement("div");
  banner.dataset.seedWorldAutoBench = "1";
  banner.style.cssText =
    "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:100002;" +
    "display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;" +
    "background:rgba(15,23,42,0.86);color:#f8fafc;border:1px solid rgba(74,222,128,0.55);" +
    "font:600 12px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.35);";
  const label = document.createElement("span");
  label.textContent = ablate?.autoStart ? "模块消融 | 初始化..." : "自动压测 | 初始化...";
  const rerunBtn = document.createElement("button");
  rerunBtn.type = "button";
  rerunBtn.textContent = `重跑 ${durationSec}s`;
  rerunBtn.style.cssText =
    "display:none;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.3);" +
    "background:rgba(34,197,94,0.25);color:#bbf7d0;font:600 11px/1.4 inherit;cursor:pointer;";
  const ablateBtn = document.createElement("button");
  ablateBtn.type = "button";
  ablateBtn.textContent = "消融测大头";
  ablateBtn.style.cssText =
    "display:none;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.3);" +
    "background:rgba(56,189,248,0.25);color:#bae6fd;font:600 11px/1.4 inherit;cursor:pointer;";
  banner.append(label, rerunBtn, ablateBtn);
  document.body.append(banner);

  const setBanner = (text: string, showRerun = false, borderColor = "rgba(74,222,128,0.55)") => {
    if (disposed || signal?.aborted) return;
    label.textContent = text;
    rerunBtn.style.display = showRerun ? "inline-block" : "none";
    ablateBtn.style.display = showRerun && ablate ? "inline-block" : "none";
    banner.style.borderColor = borderColor;
    banner.style.pointerEvents = showRerun ? "auto" : "none";
  };

  const applyCameraPose = (x: number, z: number, yawRad: number, pitchDeg: number): void => {
    const groundY = sampleHeight(x, z);
    const eyeY = (groundY !== undefined && Number.isFinite(groundY) ? groundY : camera.entity.transform.worldPosition.y - navigation.eyeHeight) + navigation.eyeHeight;
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const cosP = Math.cos(pitchRad);
    const fx = Math.cos(yawRad) * cosP;
    const fy = Math.sin(pitchRad);
    const fz = Math.sin(yawRad) * cosP;
    camera.entity.transform.setWorldPosition(x, eyeY, z);
    lookTarget.set(x + fx * 20, eyeY + fy * 20, z + fz * 20);
    camera.entity.transform.lookAt(lookTarget);
    navigation.synchronizeView();
  };

  const runSequence = async (skipWarmupWait: boolean): Promise<void> => {
    if (disposed || signal?.aborted || running) return;
    running = true;
    navigation.setInputEnabled(false);

    try {
      if (!skipWarmupWait) {
        const warmupStart = performance.now();
        let warmupTimer: number | undefined = window.setInterval(() => {
          const sec = Math.floor((performance.now() - warmupStart) / 1000);
          setBanner(`自动压测 | 等待后台着色器预热 (${sec}s)...`, false, "rgba(250,204,21,0.65)");
        }, 500);
        setBanner("自动压测 | 等待后台着色器预热 (0s)...", false, "rgba(250,204,21,0.65)");
        try {
          await Promise.race([bgWarmupDone, waitMs(120_000, signal)]);
        } finally {
          if (warmupTimer !== undefined) {
            window.clearInterval(warmupTimer);
            warmupTimer = undefined;
          }
        }
        if (disposed || signal?.aborted) return;
      }

      await waitForFpsStable((txt) => setBanner(txt, false, "rgba(250,204,21,0.65)"), signal, 2000, 10_000);
      if (disposed || signal?.aborted) return;

      const curPos = camera.entity.transform.worldPosition;
      const route = computeVillageBenchRoute(
        readPlan(),
        { x: curPos.x, z: curPos.z },
        sampleHeight,
        isWater
      );

      const yawToVillageFromStart = Math.atan2(
        route.villageCenter.z - route.walkStart.z,
        route.villageCenter.x - route.walkStart.x
      );
      const yawWalkDir = Math.atan2(route.walkEnd.z - route.walkStart.z, route.walkEnd.x - route.walkStart.x);
      const yawOutFromVillage = Math.atan2(
        route.openPos.z - route.villageCenter.z,
        route.openPos.x - route.villageCenter.x
      );
      const yawIntoVillage = yawOutFromVillage + Math.PI;
      const yawReturnDir = Math.atan2(route.walkStart.z - route.walkEnd.z, route.walkStart.x - route.walkEnd.x);

      // Position camera cleanly in the village and allow 1.0s residency settle before t=0.
      applyCameraPose(route.walkStart.x, route.walkStart.z, yawToVillageFromStart, -4);
      setBanner("自动压测 | 定位村庄起点，稳定 1s 后开始...", false, "rgba(56,189,248,0.7)");
      await waitMs(1000, signal);
      if (disposed || signal?.aborted) return;

      let lastHudUpdate = 0;
      const triggerName = `auto_bench_${durationSec}s`;

      await new Promise<void>((resolve) => {
        runCapture(triggerName, durationMs, {
          onFrame: (elapsedMs) => {
            if (disposed || signal?.aborted) return undefined;
            const u = clamp01(elapsedMs / durationMs);
            let phase: string;
            let phaseCn: string;

            if (u < 0.25) {
              // Phase 1 (0-5s): Standing inside village, smooth 360° look-around + gentle pitch wave.
              phase = "p1_village_look";
              phaseCn = "村内 360° 环视";
              const t = u / 0.25;
              const yaw = yawToVillageFromStart + easeInOut(t) * Math.PI * 2;
              const pitch = -4 + Math.sin(t * Math.PI * 2) * 5;
              applyCameraPose(route.walkStart.x, route.walkStart.z, yaw, pitch);
            } else if (u < 0.5) {
              // Phase 2 (5-10s): Walking through village (~22m) while panning ±65° across buildings.
              phase = "p2_village_walk_turn";
              phaseCn = "村内移动 + 转向";
              const t = (u - 0.25) / 0.25;
              const e = easeInOut(t);
              const px = lerp(route.walkStart.x, route.walkEnd.x, e);
              const pz = lerp(route.walkStart.z, route.walkEnd.z, e);
              const yaw = yawWalkDir + Math.sin(t * Math.PI * 2) * ((65 * Math.PI) / 180);
              const pitch = -3 + Math.sin(t * Math.PI * 4) * 3;
              applyCameraPose(px, pz, yaw, pitch);
            } else if (u < 0.75) {
              // Phase 3 (10-15s): Smoothly continue out to open space facing away -> 180° turn to face village cluster -> walk toward buildings.
              phase = "p3_open_to_village_turn";
              const t = (u - 0.5) / 0.25;
              if (t < 0.45) {
                // Walk continuously from village edge out into open space facing away from buildings.
                phaseCn = "走向空阔区外望";
                const k = easeInOut(t / 0.45);
                const px = lerp(route.walkEnd.x, route.openAwayPos.x, k);
                const pz = lerp(route.walkEnd.z, route.openAwayPos.z, k);
                applyCameraPose(px, pz, yawOutFromVillage, -2);
              } else if (t < 0.75) {
                // Smooth 180° turn straight into the village building cluster.
                phaseCn = "空阔区转身看建筑群";
                const k = easeInOut((t - 0.45) / 0.3);
                const yaw = yawOutFromVillage + k * Math.PI;
                applyCameraPose(route.openAwayPos.x, route.openAwayPos.z, yaw, -3);
              } else {
                // Walk forward directly toward the village buildings.
                phaseCn = "朝建筑群推进";
                const k = easeInOut((t - 0.75) / 0.25);
                const px = lerp(route.openAwayPos.x, route.openApproachPos.x, k);
                const pz = lerp(route.openAwayPos.z, route.openApproachPos.z, k);
                applyCameraPose(px, pz, yawIntoVillage, -3);
              }
            } else {
              // Phase 4 (15-20s): Smoothly walk back into village center with gentle 180° scan (zero teleport).
              phase = "p4_village_cruise";
              phaseCn = "返回村内稳态环视";
              const t = (u - 0.75) / 0.25;
              const e = easeInOut(t);
              const px = lerp(route.openApproachPos.x, route.walkStart.x, e);
              const pz = lerp(route.openApproachPos.z, route.walkStart.z, e);
              const yaw = lerpAngleRad(yawReturnDir - Math.PI * 0.45, yawReturnDir + Math.PI * 0.45, e);
              const pitch = -4 + Math.cos(t * Math.PI * 2) * 3;
              applyCameraPose(px, pz, yaw, pitch);
            }

            if (elapsedMs - lastHudUpdate >= 200 || elapsedMs === 0) {
              lastHudUpdate = elapsedMs;
              setBanner(
                `自动压测 ${(elapsedMs / 1000).toFixed(1)}/${durationSec}s · ${phaseCn} (请勿操作)`,
                false,
                "rgba(74,222,128,0.85)"
              );
            }
            return phase;
          },
          onComplete: (record: MobileFrameCaptureRecord | null, uploaded: boolean) => {
            if (!disposed) {
              if (record) {
                const statusIcon = uploaded ? "✅ 已自动上报" : "⚠️ 已采样(未连上本地服务)";
                const compiles = record.shaderCompileSpikes?.length ?? 0;
                const compileSuffix = compiles > 0 ? ` · 编译${compiles}` : "";
                setBanner(
                  `${statusIcon} #${record.seq} | ${record.renderStats.fps}fps | cpu ${record.avgCpuMs}ms (max ${record.maxCpuMs}ms)${compileSuffix}`,
                  true,
                  uploaded ? "rgba(74,222,128,0.9)" : "rgba(251,146,60,0.85)"
                );
              } else {
                setBanner("自动压测未采到有效帧", true, "rgba(248,113,113,0.85)");
              }
            }
            resolve();
          }
        });
      });
    } finally {
      running = false;
      if (!disposed && !signal?.aborted) {
        navigation.setInputEnabled(true);
      }
    }
  };

  const makeEmptyCounters = (): PerfCumulativeCounters => ({
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
  });

  const measureStaticWindow = (
    readCounters: (out: PerfCumulativeCounters) => PerfCumulativeCounters,
    settleMs: number,
    sampleMs: number
  ): Promise<{
    frames: number;
    windowMs: number;
    fps: number;
    p50DtMs: number;
    p95DtMs: number;
    avgCpuMs: number;
    dc: number;
    tris: number;
    fbo: number;
    orph: number;
  }> =>
    new Promise((resolve) => {
      const c0 = makeEmptyCounters();
      const c1 = makeEmptyCounters();
      const dts: number[] = [];
      let rafId = 0;
      let sampling = false;
      let startAt = performance.now();
      let sampleStartAt = 0;
      let lastAt = 0;

      const finish = () => {
        if (rafId) cancelAnimationFrame(rafId);
        signal?.removeEventListener("abort", finish);
        readCounters(c1);
        const now = performance.now();
        const windowMs = Math.max(1, now - sampleStartAt);
        const frames = Math.max(1, c1.frames - c0.frames);
        const sorted = [...dts].sort((a, b) => a - b);
        const pct = (p: number) =>
          sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : 0;
        resolve({
          frames,
          windowMs: Math.round(windowMs),
          fps: Number(((frames * 1000) / windowMs).toFixed(1)),
          p50DtMs: Number(pct(0.5).toFixed(1)),
          p95DtMs: Number(pct(0.95).toFixed(1)),
          avgCpuMs: Number(((c1.cpuMs - c0.cpuMs) / frames).toFixed(2)),
          dc: Number(((c1.dc - c0.dc) / frames).toFixed(1)),
          tris: Math.round((c1.tris - c0.tris) / frames),
          fbo: Number(((c1.fbo - c0.fbo) / frames).toFixed(1)),
          orph: Number(((c1.bufOrphans - c0.bufOrphans) / frames).toFixed(1))
        });
      };

      signal?.addEventListener("abort", finish, { once: true });

      const step = (now: number) => {
        if (disposed || signal?.aborted) {
          finish();
          return;
        }
        if (!sampling) {
          if (now - startAt >= settleMs) {
            sampling = true;
            sampleStartAt = now;
            lastAt = now;
            readCounters(c0);
          }
        } else {
          const dt = now - lastAt;
          lastAt = now;
          if (dt > 0 && dt < 2000) dts.push(dt);
          if (now - sampleStartAt >= sampleMs) {
            finish();
            return;
          }
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    });

  const runAblationSequence = async (skipWarmupWait: boolean, moveToEndPose: boolean): Promise<void> => {
    if (disposed || signal?.aborted || running || !ablate) return;
    running = true;
    navigation.setInputEnabled(false);
    const activeRestores: (() => void)[] = [];

    try {
      if (!skipWarmupWait) {
        const warmupStart = performance.now();
        let warmupTimer: number | undefined = window.setInterval(() => {
          const sec = Math.floor((performance.now() - warmupStart) / 1000);
          setBanner(`模块消融 | 等待后台着色器预热 (${sec}s)...`, false, "rgba(250,204,21,0.65)");
        }, 500);
        setBanner("模块消融 | 等待后台着色器预热 (0s)...", false, "rgba(250,204,21,0.65)");
        try {
          await Promise.race([bgWarmupDone, waitMs(120_000, signal)]);
        } finally {
          if (warmupTimer !== undefined) {
            window.clearInterval(warmupTimer);
            warmupTimer = undefined;
          }
        }
        if (disposed || signal?.aborted) return;
      }

      if (moveToEndPose) {
        const curPos = camera.entity.transform.worldPosition;
        const route = computeVillageBenchRoute(readPlan(), { x: curPos.x, z: curPos.z }, sampleHeight, isWater);
        const yawReturnDir = Math.atan2(route.walkStart.z - route.walkEnd.z, route.walkStart.x - route.walkEnd.x);
        // Exact p4 end pose (u = 1.0) where village buildings fill the frame.
        applyCameraPose(route.walkStart.x, route.walkStart.z, yawReturnDir + Math.PI * 0.45, -1);
      }

      await waitForFpsStable((txt) => setBanner(txt.replace("自动压测", "模块消融"), false, "rgba(250,204,21,0.65)"), signal, 1500, 7000);
      if (disposed || signal?.aborted) return;

      const cases: readonly {
        readonly id: string;
        readonly label: string;
        readonly apply: () => () => void;
      }[] = [
        { id: "baseline_start", label: "基线(全开)", apply: () => () => {} },
        { id: "off:building", label: "关 原生建筑", apply: () => { ablate.setModule("building", false); return () => ablate.setModule("building", true); } },
        { id: "off:trees", label: "关 树木", apply: () => { ablate.setSubGroup("trees", false); return () => ablate.setSubGroup("trees", true); } },
        { id: "off:details", label: "关 草皮/林下", apply: () => { ablate.setSubGroup("details", false); return () => ablate.setSubGroup("details", true); } },
        { id: "off:terrain", label: "关 地形网格", apply: () => { ablate.setSubGroup("terrain", false); return () => ablate.setSubGroup("terrain", true); } },
        { id: "off:shadow", label: "关 阴影", apply: () => { ablate.setModule("shadow", false); return () => ablate.setModule("shadow", true); } },
        { id: "off:clouds", label: "关 体积云", apply: () => { ablate.setModule("clouds", false); return () => ablate.setModule("clouds", true); } },
        { id: "off:water", label: "关 水体", apply: () => { ablate.setModule("water", false); return () => ablate.setModule("water", true); } },
        { id: "off:bloom", label: "关 Bloom", apply: () => { ablate.setModule("bloom", false); return () => ablate.setModule("bloom", true); } },
        { id: "off:hdr", label: "关 HDR", apply: () => { ablate.setModule("hdr", false); return () => ablate.setModule("hdr", true); } },
        { id: "off:animals", label: "关 动物", apply: () => { ablate.setModule("animals", false); return () => ablate.setModule("animals", true); } },
        { id: "off:solids", label: "关 岩石地貌", apply: () => { ablate.setModule("solids", false); return () => ablate.setModule("solids", true); } },
        { id: "off:farming", label: "关 农场", apply: () => { ablate.setModule("farming", false); return () => ablate.setModule("farming", true); } },
        { id: "off:hud", label: "关 AI/HUD", apply: () => { ablate.setModule("hud", false); return () => ablate.setModule("hud", true); } },
        { id: "off:ssr", label: "关 SSR", apply: () => { ablate.setModule("ssr", false); return () => ablate.setModule("ssr", true); } },
        { id: "dpr:1.5", label: "DPR=1.5", apply: () => { ablate.setDpr(1.5); return () => ablate.setDpr(null); } },
        { id: "dpr:1.0", label: "DPR=1.0", apply: () => { ablate.setDpr(1); return () => ablate.setDpr(null); } },
        { id: "baseline_end", label: "基线复测(全开)", apply: () => () => {} }
      ];

      const steps: Array<{
        id: string;
        label: string;
        fps: number;
        fpsGain: number;
        p50DtMs: number;
        p95DtMs: number;
        avgCpuMs: number;
        dc: number;
        tris: number;
        fbo: number;
        orph: number;
      }> = [];
      let baseFps = 0;

      for (let i = 0; i < cases.length; i++) {
        if (disposed || signal?.aborted) return;
        const c = cases[i]!;
        setBanner(`模块消融 ${i + 1}/${cases.length} · ${c.label} (请勿操作)`, false, "rgba(56,189,248,0.85)");
        const restore = c.apply();
        activeRestores.push(restore);
        try {
          const m = await measureStaticWindow(ablate.readCounters, 600, 1800);
          if (disposed || signal?.aborted) return;
          if (i === 0) baseFps = m.fps;
          steps.push({
            id: c.id,
            label: c.label,
            fps: m.fps,
            fpsGain: Number((m.fps - baseFps).toFixed(1)),
            p50DtMs: m.p50DtMs,
            p95DtMs: m.p95DtMs,
            avgCpuMs: m.avgCpuMs,
            dc: m.dc,
            tris: m.tris,
            fbo: m.fbo,
            orph: m.orph
          });
        } finally {
          activeRestores.pop();
          try {
            restore();
          } catch {}
        }
      }

      if (disposed || signal?.aborted) return;

      const ranked = [...steps]
        .filter((s) => s.id !== "baseline_start" && s.id !== "baseline_end")
        .sort((a, b) => b.fpsGain - a.fpsGain);

      const camPos = camera.entity.transform.worldPosition;
      const payload = {
        kind: "module_ablation",
        ts: Date.now(),
        url: location.href,
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        canvas: [ablate.canvas.width, ablate.canvas.height, ablate.canvas.clientWidth, ablate.canvas.clientHeight],
        pose: [Number(camPos.x.toFixed(2)), Number(camPos.y.toFixed(2)), Number(camPos.z.toFixed(2))],
        baseFps,
        steps,
        rankedByFpsGain: ranked.map((s) => ({
          id: s.id,
          label: s.label,
          fps: s.fps,
          fpsGain: s.fpsGain,
          p50DtMs: s.p50DtMs,
          avgCpuMs: s.avgCpuMs,
          dc: s.dc,
          tris: s.tris
        }))
      };

      let uploaded = false;
      try {
        const res = await fetch("/__mobile-diag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        uploaded = res.ok;
      } catch {}

      const top3 = ranked
        .slice(0, 3)
        .map((s) => `${s.label.replace(/^关 /, "")}+${s.fpsGain}fps`)
        .join(" | ");
      setBanner(
        `${uploaded ? "✅ 消融已上报" : "⚠️ 消融完成"} 基线${baseFps}fps · ${top3}`,
        true,
        uploaded ? "rgba(74,222,128,0.9)" : "rgba(251,146,60,0.85)"
      );
    } finally {
      while (activeRestores.length > 0) {
        try {
          activeRestores.pop()!();
        } catch {}
      }
      running = false;
      if (!disposed && !signal?.aborted) {
        navigation.setInputEnabled(true);
      }
    }
  };

  rerunBtn.onclick = () => {
    void runSequence(true);
  };
  ablateBtn.onclick = () => {
    void runAblationSequence(true, false);
  };

  const onAbort = () => {
    banner.remove();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  if (ablate?.autoStart) {
    void runAblationSequence(false, true);
  } else {
    void runSequence(false);
  }

  return {
    rerun: () => {
      void runSequence(true);
    },
    runAblation: () => {
      void runAblationSequence(true, false);
    },
    dispose: () => {
      disposed = true;
      signal?.removeEventListener("abort", onAbort);
      banner.remove();
    }
  };
}
