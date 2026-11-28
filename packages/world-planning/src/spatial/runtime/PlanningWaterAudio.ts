import { AudioBoundsIndex, type AudioBounds } from "@galacean/engine-terrain/terrain/audio/AudioBoundsIndex";
import {
  AudioPoint,
  nearestAudioPoint,
  type AudioSegment
} from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioMath";
import type { AudioCandidateBuffer } from "../../world/SeedWorldAudioCandidates";
import type { SeedWorldAudioSolid, SeedWorldWaterAudioSource } from "../../world/SeedWorldAudioRuntime";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { planningGroundSurface } from "../../semantic-study/PlanningHeightmap";

interface WaterSegment extends AudioBounds, AudioSegment {
  readonly kind: "river" | "ocean";
  readonly order: number;
}

/** Audio consumes the same published coast and river profiles as rendering, without inventing legacy hydrology. */
export class PlanningWaterAudio implements SeedWorldWaterAudioSource {
  invalidationRevision = 0;
  private readonly index: AudioBoundsIndex<WaterSegment>;
  private readonly count: number;
  private riverVisible = false;
  private oceanVisible = false;
  private point!: AudioPoint;
  private result!: AudioCandidateBuffer;
  private readonly nearest = new AudioPoint();
  private readonly visit = (segment: WaterSegment): void => {
    if (!(segment.kind === "river" ? this.riverVisible : this.oceanVisible)) return;
    nearestAudioPoint(segment, this.point, this.nearest);
    const reach = segment.kind === "river" ? 140 : 160;
    if (
      Math.hypot(this.nearest.x - this.point.x, this.nearest.y - this.point.y, this.nearest.z - this.point.z) >= reach
    )
      return;
    const candidate = this.result.items[this.result.count++]!;
    candidate.id = segment.id;
    candidate.cellX = candidate.cellZ = undefined;
    candidate.segment = segment;
    candidate.clip = segment.kind === "river" ? "stream" : "ocean";
    candidate.position.x = this.nearest.x;
    candidate.position.y = this.nearest.y;
    candidate.position.z = this.nearest.z;
    candidate.gain = segment.kind === "river" ? 0.65 : 0.45;
    candidate.reach = reach;
    candidate.order = segment.order;
  };

  constructor(
    plan: IslandPlan,
    private readonly visible: (kind: "river" | "ocean") => boolean
  ) {
    const segments: WaterSegment[] = [];
    const append = (id: string, kind: WaterSegment["kind"], points: readonly AudioPoint[], closed = false) => {
      for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        segments.push({
          id: `${id}:${i}`,
          kind,
          a,
          b,
          order: segments.length,
          minX: Math.min(a.x, b.x),
          minY: Math.min(a.y, b.y),
          minZ: Math.min(a.z, b.z),
          maxX: Math.max(a.x, b.x),
          maxY: Math.max(a.y, b.y),
          maxZ: Math.max(a.z, b.z)
        });
      }
    };
    for (const [index, coast] of [plan.land, ...plan.islands].entries())
      append(
        `planning-ocean-shore:${index}`,
        "ocean",
        coast.map((p) => new AudioPoint(p.x, 0.1, p.z)),
        true
      );
    for (const water of plan.waters) {
      const profile = plan.planning?.profiles.find((p) => p.ownerId === water.id && p.kind === "water");
      if (profile)
        append(
          water.id,
          "river",
          profile.points.map((p) => new AudioPoint(p.x, p.y, p.z))
        );
    }
    this.count = segments.length;
    this.index = new AudioBoundsIndex(segments);
    this.update();
  }
  prepareBuffer(result: AudioCandidateBuffer): void {
    result.reserve(this.count);
  }
  /** Visibility invalidates previously selected emitters immediately; publication owns geometry changes. */
  update(): void {
    const river = this.visible("river"),
      ocean = this.visible("ocean");
    if (river !== this.riverVisible || ocean !== this.oceanVisible) this.invalidationRevision++;
    this.riverVisible = river;
    this.oceanVisible = ocean;
  }
  collect(point: AudioPoint, result: AudioCandidateBuffer): void {
    this.prepareBuffer(result);
    this.point = point;
    this.result = result;
    this.index.queryRadius(point, 160, this.visit);
  }
  /** Geometry is immutable for this publication; terrain edits publish a replacement adapter. */
  invalidateTerrain(): void {
    this.invalidationRevision++;
  }
}

/** Acoustic occlusion uses the identical solid OBBs as native and whitebox rendering. */
export function planningAudioSolids(plan: IslandPlan): SeedWorldAudioSolid[] {
  let sample: ((point: PlanPoint) => number) | undefined;
  const ground = (point: PlanPoint) => (sample ??= planningGroundSurface(plan).sample)(point);
  // Trees are not acoustic blockers. Exclude them before whitebox adaptation so
  // a local tree edit cannot allocate trunk/canopy boxes or request terrain.
  const acousticPlan = { ...plan, landscapes: plan.landscapes?.filter((part) => part.kind !== "tree") };
  return planningWhiteboxes(acousticPlan, ground).flatMap((part) =>
    part.boxes
      .filter((box) => box.occlusion !== false)
      .map((box) => ({
        obbCenter: [box.center.x, (box.elevation ?? ground(box.center)) + box.sizeY / 2, box.center.z] as const,
        obbSizeMetres: [box.sizeX, box.sizeY, box.sizeZ] as const,
        obbRotationQuaternion: [0, Math.sin(box.yaw / 2), 0, Math.cos(box.yaw / 2)] as const
      }))
  );
}
