import type { V2Point3, WorldSnapshot } from "../spatial/V2Model.ts";
import type { V2Meter } from "./V2Budget";
import { distance, sampleHeight } from "./V2Geometry";
import { buildTargetSight, poiMarkerBox, traceSight } from "./V2Validation";

/** Explicit diagnostic sampling policy; these values do not constitute aesthetic approval. */
export interface V2ExperienceConfig {
  stationsPerRoute: number;
  firstVisibleFraction: number;
  minimumAngle: number;
  nearDistance: number;
  farDistance: number;
}

/** One ground-level observation along an actual compiled route. Angles are degrees, distances metres. */
export interface V2ExperienceStation {
  distance: number;
  visibleFraction: number;
  angularSize: number;
  nearCount: number;
  midCount: number;
  farCount: number;
  headingError: number;
  clearSkyFraction: number;
}

/** Measured progression toward a route destination, independent of artistic preference. */
export interface V2ExperienceRoute {
  id: string;
  target: string;
  length: number;
  firstVisibleAt: number | null;
  visibleSpan: number;
  largestReveal: number;
  stations: V2ExperienceStation[];
}

/** Evidence tied to one snapshot and a disclosed finite set of observation stations. */
export interface V2ExperienceReport {
  config: V2ExperienceConfig;
  routes: V2ExperienceRoute[];
  sampleCount: number;
  limitations: string[];
}

/**
 * Measures destination reveal and occupied depth bands along compiled physical routes.
 * @param snapshot Candidate geometry, including final terrain and placed volumes.
 * @param meter The compilation transaction's shared computation budget.
 * @param options Optional sampling thresholds, independent of the random profile.
 * @returns Diagnostic evidence; no beauty score or guarantee between sampled stations.
 */
export function buildExperience(
  snapshot: WorldSnapshot,
  meter: V2Meter,
  options: Partial<V2ExperienceConfig> = {}
): V2ExperienceReport {
  const config: V2ExperienceConfig = {
    stationsPerRoute: 9,
    firstVisibleFraction: 1 / 3,
    minimumAngle: 0.25,
    nearDistance: 40,
    farDistance: 160,
    ...options
  };
  const count = Math.max(2, Math.min(33, Math.round(config.stationsPerRoute)));
  config.stationsPerRoute = count;
  let sampleCount = 0;
  const routes: V2ExperienceRoute[] = [];
  for (const road of snapshot.roads) {
    const poi = snapshot.pois.find((value) => value.id === road.to);
    if (!poi || road.centerline.length < 2) continue;
    const lengths = [0];
    for (let i = 1; i < road.centerline.length; i++) {
      meter.spend();
      lengths.push(lengths[i - 1] + distance(road.centerline[i - 1], road.centerline[i]));
    }
    const total = lengths[lengths.length - 1],
      stations: V2ExperienceStation[] = [];
    for (let index = 0; index < count; index++) {
      meter.spend();
      const along = (total * index) / (count - 1);
      let segment = 1;
      while (segment < lengths.length - 1 && lengths[segment] < along) {
        meter.spend();
        segment++;
      }
      const a = road.centerline[segment - 1],
        b = road.centerline[segment];
      const t = (along - lengths[segment - 1]) / Math.max(1e-6, lengths[segment] - lengths[segment - 1]);
      const x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      const eye: V2Point3 = { x, z, y: sampleHeight(snapshot.heightfield, x, z) + snapshot.player.eyeHeight };
      const marker = poiMarkerBox(poi);
      const dx = marker.center.x - x,
        dz = marker.center.z - z,
        d = Math.max(0.01, Math.hypot(dx, dz));
      const targetSight = buildTargetSight(snapshot, eye, poi.id, meter);
      sampleCount += targetSight.samples.length;
      const heading = Math.atan2(b.z - a.z, b.x - a.x),
        targetHeading = Math.atan2(dz, dx);
      const difference = Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading));
      let nearCount = 0,
        midCount = 0,
        farCount = 0,
        clearSky = 0;
      for (const box of snapshot.boxes) {
        meter.spend();
        if (!box.occlusion) continue;
        const bx = box.center.x - x,
          bz = box.center.z - z,
          bd = Math.hypot(bx, bz);
        const angle = Math.atan2(Math.sin(Math.atan2(bz, bx) - heading), Math.cos(Math.atan2(bz, bx) - heading));
        if (Math.abs(angle) > Math.PI / 3) continue;
        if (bd < config.nearDistance) nearCount++;
        else if (bd < config.farDistance) midCount++;
        else farCount++;
      }
      const reach = Math.min(snapshot.size * 0.35, 250);
      for (const offset of [-Math.PI / 4, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4]) {
        const target = {
          x: x + Math.cos(heading + offset) * reach,
          z: z + Math.sin(heading + offset) * reach,
          y: eye.y + Math.tan(Math.PI / 6) * reach
        };
        // Restrict the ray to the authored world: no extrapolated terrain outside its boundary.
        const half = snapshot.size / 2;
        const scaleX =
          target.x > half ? (half - x) / (target.x - x) : target.x < -half ? (-half - x) / (target.x - x) : 1;
        const scaleZ =
          target.z > half ? (half - z) / (target.z - z) : target.z < -half ? (-half - z) / (target.z - z) : 1;
        const scale = Math.min(scaleX, scaleZ, 1);
        target.x = x + (target.x - x) * scale;
        target.z = z + (target.z - z) * scale;
        target.y = eye.y + (target.y - eye.y) * scale;
        if (traceSight(snapshot, eye, target, meter).clear) clearSky++;
        sampleCount++;
      }
      stations.push({
        distance: along,
        visibleFraction: targetSight.visibleFraction,
        angularSize: targetSight.angularSize,
        nearCount,
        midCount,
        farCount,
        headingError: d <= poi.radius ? 0 : (Math.abs(difference) * 180) / Math.PI,
        clearSkyFraction: clearSky / 5
      });
    }
    const isVisible = (station: V2ExperienceStation) =>
      station.visibleFraction >= config.firstVisibleFraction && station.angularSize >= config.minimumAngle;
    let visibleLength = 0,
      largestReveal = 0;
    for (let i = 1; i < stations.length; i++) {
      meter.spend();
      const previous = stations[i - 1],
        current = stations[i];
      // Trapezoidal estimate; report it as sampled coverage, never continuous visibility proof.
      visibleLength +=
        ((current.distance - previous.distance) * (Number(isVisible(previous)) + Number(isVisible(current)))) / 2;
      largestReveal = Math.max(largestReveal, current.visibleFraction - previous.visibleFraction);
    }
    routes.push({
      id: road.id,
      target: poi.id,
      length: total,
      firstVisibleAt: stations.find(isVisible)?.distance ?? null,
      visibleSpan: total > 0 ? visibleLength / total : 0,
      largestReveal,
      stations
    });
  }
  return {
    config,
    routes,
    sampleCount,
    limitations: [
      "每条动线最多 9 个默认观察站；可见行程为采样估计，不保证站点之间始终可见。",
      "远中近统计前方 120° 内遮挡白盒中心的距离分布，不代表真实剪影或图像构图。",
      "上方净空来自仰角 30° 的 5 条射线；它不是屏幕留白面积，也不是美感评分。",
      "目标可见与方向偏差不能证明玩家理解前进方向；POI 的吸引力和空间回报须由人漫游判断。"
    ]
  };
}
