import { AudioBoundsIndex, type AudioBounds } from "@galacean/engine-terrain/terrain/audio/AudioBoundsIndex";
import {
  audioDistance,
  AudioDistanceResult,
  nearestAudioPoint,
  AudioPoint,
  type AudioSegment
} from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioMath";
import { sampleSeedWorldHeightInto, SeedWorldHeightSample, type SeedWorldFields } from "./SeedWorldFields.ts";
import type { SeedWorldHydrologyArtifactV1 } from "./hydrology-v1/SeedWorldHydrologyArtifact.ts";
import type { SeedWorldWaterRuntime } from "./SeedWorldWaterRuntime.ts";
import type { SeedWorldAuthoredWaterQueryBodyV1 } from "@galacean/engine-water/world/SeedWorldAuthoredWaterQuery";
import type { AudioCandidateBuffer } from "../world/SeedWorldAudioCandidates.ts";

type Basin = Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>;
class WaterContact {
  x = 0;
  z = 0;
  valid = false;
  wet = false;
  kind: "lake" | "ocean" = "lake";
  y = 0;
}
interface Shore extends AudioSegment {
  id: string;
  kind: "lake" | "ocean";
  cellX: number;
  cellZ: number;
}
interface River extends AudioSegment, AudioBounds {
  readonly order: number;
}
interface ShoreCell {
  x: number;
  z: number;
  valid: boolean;
  count: number;
  readonly segments: readonly Shore[];
}
const CELL = 8,
  SIZE = 40;

/** Includes cache visits, contact sampling, crossing refinement and publication copies. */
export const AUDIO_SHORE_CELLS_PER_FRAME = 256;

function shore(): Shore {
  return { id: "shore:1", a: new AudioPoint(), b: new AudioPoint(), kind: "lake", cellX: 0, cellZ: 0 };
}

/** A bounded rolling shoreline cache; published geometry is independent of the moving nearest sound point. */
export class SeedWorldAudioWater {
  /** Changes when existing candidate references must be withdrawn, even between query phases. */
  invalidationRevision = 0;
  private readonly generatedRivers: AudioBoundsIndex<River>;
  private authoredRivers = new AudioBoundsIndex<River>([]);
  private authoredRevision = -1;
  private authoredStructureRevision = -1;
  private basins: Basin[] = [];
  private readonly levels: Float64Array;
  private readonly generatedRiverCount: number;
  private authoredRiverCount = 0;
  private riverVisible = false;
  private lakeVisible = false;
  private oceanVisible = false;
  private readonly points = Array.from({ length: (SIZE + 1) ** 2 }, () => new WaterContact());
  private readonly cells: ShoreCell[] = Array.from({ length: SIZE ** 2 }, () => ({
    x: 0,
    z: 0,
    valid: false,
    count: 0,
    segments: [
      { id: "shore:1", a: new AudioPoint(), b: new AudioPoint(), kind: "lake", cellX: 0, cellZ: 0 },
      { id: "shore:3", a: new AudioPoint(), b: new AudioPoint(), kind: "lake", cellX: 0, cellZ: 0 }
    ]
  }));
  // Neither the rolling cache nor the in-progress buffer is borrowed by playback.
  private shores = Array.from({ length: SIZE * SIZE * 2 }, shore);
  private staging = Array.from({ length: SIZE * SIZE * 2 }, shore);
  private stagingCount = 0;
  private cursor = SIZE * SIZE;
  private ready = false;
  private buildingX = 0;
  private buildingZ = 0;
  private shoreCount = 0;
  private readonly corners: WaterContact[] = new Array(4);
  private readonly crossings = Array.from({ length: 4 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    kind: "lake" as "lake" | "ocean"
  }));
  private readonly contactScratch = new WaterContact();
  private originX = Infinity;
  private originZ = Infinity;
  private dirty = false;
  private readonly dirtyBounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  private queryPoint!: AudioPoint;
  private queryResult!: AudioCandidateBuffer;
  private readonly distance = new AudioDistanceResult();
  private readonly heightSample = new SeedWorldHeightSample();
  private readonly projected = new AudioPoint();
  private readonly addRiver = (s: River): void => {
    nearestAudioPoint(s, this.queryPoint, this.projected);
    audioDistance(this.projected, this.queryPoint, this.distance);
    if (this.distance.distance >= 140) return;
    const c = this.queryResult.items[this.queryResult.count++]!;
    c.id = s.id;
    c.cellX = c.cellZ = undefined;
    c.segment = s;
    c.clip = "stream";
    c.position.x = this.projected.x;
    c.position.y = this.projected.y;
    c.position.z = this.projected.z;
    c.gain = 0.65;
    c.reach = 140;
    c.order = s.order;
  };
  private readonly minX: number;
  private readonly minZ: number;

  constructor(
    private readonly fields: SeedWorldFields,
    private readonly artifact: SeedWorldHydrologyArtifactV1,
    private readonly water: Pick<
      SeedWorldWaterRuntime,
      | "isAudioBodyVisible"
      | "authoredWaterRevision"
      | "authoredWaterStructureRevision"
      | "getPublishedAuthoredWaterShapes"
      | "getEffectiveGeneratedWaterLevelMetres"
    >
  ) {
    this.levels = new Float64Array(artifact.waterBodyCatalog.length).fill(NaN);
    this.minX = artifact.ownershipView.transform.worldMinXMillimetres / 1000;
    this.minZ = artifact.ownershipView.transform.worldMinZMillimetres / 1000;
    const rivers: River[] = [];
    for (const profile of artifact.riverProfileCatalog) {
      appendRiver(
        rivers,
        profile.bodyId,
        profile.samples.map(
          (s) =>
            new AudioPoint(
              this.minX + s.xOffsetMillimetres / 1000,
              s.surfaceHeightMillimetres / 1000,
              this.minZ + s.zOffsetMillimetres / 1000
            )
        )
      );
    }
    this.generatedRivers = new AudioBoundsIndex(rivers);
    this.generatedRiverCount = rivers.length;
    this.synchronizeWater();
  }

  prepareBuffer(result: AudioCandidateBuffer): void {
    result.reserve(this.generatedRiverCount + this.authoredRiverCount + SIZE * SIZE * 2);
  }

  /** Bounds include the bilinear support of changed height samples. Coalesce animation frames until the next query. */
  invalidateTerrain(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const d = this.dirtyBounds;
    if (this.dirty) {
      d.minX = Math.min(d.minX, minX);
      d.minZ = Math.min(d.minZ, minZ);
      d.maxX = Math.max(d.maxX, maxX);
      d.maxZ = Math.max(d.maxZ, maxZ);
    } else {
      d.minX = minX;
      d.minZ = minZ;
      d.maxX = maxX;
      d.maxZ = maxZ;
      this.dirty = true;
    }
  }

  collect(p: AudioPoint, result: AudioCandidateBuffer): void {
    // Only a newly published river catalog can raise this capacity. Shore capacity is fixed.
    this.prepareBuffer(result);
    this.queryPoint = p;
    this.queryResult = result;
    if (this.riverVisible) {
      this.generatedRivers.queryRadius(p, 140, this.addRiver);
      this.authoredRivers.queryRadius(p, 140, this.addRiver);
    }
    // Swap only at discovery: previous candidates have finished their publication phases.
    if (this.ready) {
      const previous = this.shores;
      this.shores = this.staging;
      this.staging = previous;
      this.shoreCount = this.stagingCount;
      this.ready = false;
    }
    for (let i = 0; i < this.shoreCount; i++) {
      const s = this.shores[i]!;
      const c = result.items[result.count++]!;
      c.id = s.id;
      c.cellX = s.cellX;
      c.cellZ = s.cellZ;
      c.segment = s;
      c.clip = s.kind;
      nearestAudioPoint(s, p, c.position);
      c.gain = s.kind === "ocean" ? 0.45 : 0.32;
      c.reach = s.kind === "ocean" ? 160 : 110;
      c.order = undefined;
    }
  }

  /** Advance at most one bounded batch per rendered frame, independent of discovery frequency. */
  update(p: AudioPoint): void {
    const structuralChange =
      this.lakeVisible !== this.water.isAudioBodyVisible("lake") ||
      this.oceanVisible !== this.water.isAudioBodyVisible("ocean") ||
      this.authoredStructureRevision !== this.water.authoredWaterStructureRevision;
    if (structuralChange) {
      // A removed body or changed kind must never be republished by an old pending job.
      this.invalidationRevision++;
      this.cursor = SIZE * SIZE;
      this.ready = false;
      this.shoreCount = 0;
      this.synchronizeWater();
    }
    if (this.ready) return;
    if (this.cursor === SIZE * SIZE) {
      // Level changes coalesce while a batch is in progress; every job can finish.
      this.synchronizeWater();
      // Terrain is live: edits during a build are coalesced for the next pass.
      // Publication is a complete spatial result, not a transactional snapshot of the height field.
      this.invalidateDirtyCells();
      let hasShore = this.lakeVisible && this.basins.length > 0;
      const bodies = this.artifact.waterBodyCatalog;
      for (let i = 0; !hasShore && i < bodies.length; i++) {
        const type = bodies[i]!.waterType;
        hasShore = (type === "lake" && this.lakeVisible) || (type === "ocean" && this.oceanVisible);
      }
      if (!hasShore) return;
      const x = Math.floor((p.x - 160) / CELL),
        z = Math.floor((p.z - 160) / CELL);
      if (x === this.originX && z === this.originZ) return;
      this.buildingX = x;
      this.buildingZ = z;
      this.cursor = 0;
      this.stagingCount = 0;
    }
    const end = Math.min(SIZE * SIZE, this.cursor + AUDIO_SHORE_CELLS_PER_FRAME);
    for (; this.cursor < end; this.cursor++) {
      const x = this.buildingX + (this.cursor % SIZE);
      const z = this.buildingZ + Math.floor(this.cursor / SIZE);
      const cell = this.cells[ringSlot(x, z, SIZE)]!;
      if (!cell.valid || cell.x !== x || cell.z !== z) this.buildShore(x, z, cell);
      for (let i = 0; i < cell.count; i++) {
        const from = cell.segments[i]!,
          to = this.staging[this.stagingCount++]!;
        to.id = from.id;
        to.kind = from.kind;
        to.cellX = from.cellX;
        to.cellZ = from.cellZ;
        to.a.x = from.a.x;
        to.a.y = from.a.y;
        to.a.z = from.a.z;
        to.b.x = from.b.x;
        to.b.y = from.b.y;
        to.b.z = from.b.z;
      }
    }
    if (this.cursor === SIZE * SIZE) {
      this.originX = this.buildingX;
      this.originZ = this.buildingZ;
      this.ready = true;
    }
  }

  private synchronizeWater(): void {
    let changed = false;
    const river = this.water.isAudioBodyVisible("river"),
      lake = this.water.isAudioBodyVisible("lake"),
      ocean = this.water.isAudioBodyVisible("ocean");
    if (lake !== this.lakeVisible || ocean !== this.oceanVisible) changed = true;
    this.riverVisible = river;
    this.lakeVisible = lake;
    this.oceanVisible = ocean;
    for (let i = 0; i < this.artifact.waterBodyCatalog.length; i++) {
      const body = this.artifact.waterBodyCatalog[i]!;
      if (body.waterType !== "lake" && body.waterType !== "ocean") continue;
      const level = this.water.getEffectiveGeneratedWaterLevelMetres(body.bodyId, body.waterType) ?? NaN;
      if (!Object.is(this.levels[i], level)) changed = true;
      this.levels[i] = level;
    }
    if (this.authoredRevision !== this.water.authoredWaterRevision) {
      this.authoredRevision = this.water.authoredWaterRevision;
      const structureChanged = this.authoredStructureRevision !== this.water.authoredWaterStructureRevision;
      this.authoredStructureRevision = this.water.authoredWaterStructureRevision;
      this.basins.length = 0;
      // A water-level publication does not invalidate the river index.
      if (structureChanged) {
        const rivers: River[] = [];
        let offset = 0;
        for (const profile of this.artifact.riverProfileCatalog) offset += Math.max(0, profile.samples.length - 1);
        for (const [id, body] of this.water.getPublishedAuthoredWaterShapes()) {
          if (body.kind === "basin") this.basins.push(body);
          else
            appendRiver(
              rivers,
              id,
              body.points.map((s) => new AudioPoint(s.x, s.surfaceElevationMetres, s.z)),
              offset
            );
        }
        this.authoredRivers = new AudioBoundsIndex(rivers);
        this.authoredRiverCount = rivers.length;
      } else {
        for (const [, body] of this.water.getPublishedAuthoredWaterShapes())
          if (body.kind === "basin") this.basins.push(body);
      }
      changed = true;
    }
    if (changed) {
      for (let i = 0; i < this.points.length; i++) this.points[i]!.valid = false;
      for (let i = 0; i < this.cells.length; i++) this.cells[i]!.valid = false;
      this.originX = Infinity;
      this.dirty = false;
    }
  }

  private invalidateDirtyCells(): void {
    if (!this.dirty) return;
    const d = this.dirtyBounds;
    this.dirty = false;
    let changed = false;
    for (let i = 0; i < this.points.length; i++) {
      const c = this.points[i]!;
      if (c.valid && c.x * CELL >= d.minX && c.x * CELL <= d.maxX && c.z * CELL >= d.minZ && c.z * CELL <= d.maxZ)
        c.valid = false;
    }
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      if (
        c.valid &&
        (c.x + 1) * CELL >= d.minX &&
        c.x * CELL <= d.maxX &&
        (c.z + 1) * CELL >= d.minZ &&
        c.z * CELL <= d.maxZ
      ) {
        c.valid = false;
        changed = true;
      }
    }
    if (changed) this.originX = Infinity;
  }

  private gridContact(x: number, z: number): WaterContact {
    const c = this.points[ringSlot(x, z, SIZE + 1)]!;
    if (!c.valid || c.x !== x || c.z !== z) {
      c.x = x;
      c.z = z;
      this.heightSample.x = x * CELL;
      this.heightSample.z = z * CELL;
      c.wet = this.contact(this.heightSample, c);
      c.valid = true;
    }
    return c;
  }

  private contact(height: SeedWorldHeightSample, out: WaterContact): boolean {
    const x = height.x,
      z = height.z;
    if (!sampleSeedWorldHeightInto(this.fields, height)) return false;
    const ground = height.height;
    const view = this.artifact.ownershipView,
      t = view.transform;
    const ix = Math.floor((x - this.minX) / (t.ownershipCellMillimetres / 1000));
    const iz = Math.floor((z - this.minZ) / (t.ownershipCellMillimetres / 1000));
    if (ix < 0 || iz < 0 || ix >= view.resolution || iz >= view.resolution) return false;
    const bodyIndex = view.sampleBodyIndex(ix, iz) - 1;
    const body = this.artifact.waterBodyCatalog[bodyIndex];
    if (
      body &&
      ((body.waterType === "lake" && this.lakeVisible) || (body.waterType === "ocean" && this.oceanVisible))
    ) {
      const y = this.levels[bodyIndex]!;
      if (y >= ground) {
        out.kind = body.waterType as "lake" | "ocean";
        out.y = y;
        return true;
      }
    }
    if (!this.lakeVisible) return false;
    for (let i = 0; i < this.basins.length; i++) {
      const shape = this.basins[i]!;
      const sx = Math.round((x - shape.originX) / shape.cellSizeX),
        sz = Math.round((z - shape.originZ) / shape.cellSizeZ);
      if (sx < 0 || sz < 0 || sx >= shape.width || sz >= shape.height) continue;
      const y = shape.surfaceHeightByTexel[sz * shape.width + sx]!;
      if (Number.isFinite(y) && y >= ground) {
        out.kind = "lake";
        out.y = y;
        return true;
      }
    }
    return false;
  }

  private buildShore(x: number, z: number, cell: ShoreCell): void {
    cell.x = x;
    cell.z = z;
    cell.valid = true;
    cell.count = 0;
    const corners = this.corners;
    corners[0] = this.gridContact(x, z);
    corners[1] = this.gridContact(x + 1, z);
    corners[2] = this.gridContact(x + 1, z + 1);
    corners[3] = this.gridContact(x, z + 1);
    const a = corners[0]!,
      b = corners[1]!,
      c = corners[2]!,
      d = corners[3]!;
    if (a.wet === b.wet && a.wet === c.wet && a.wet === d.wet) return;
    let count = 0;
    for (let e = 0; e < 4; e++) {
      const a = corners[e]!,
        b = corners[(e + 1) % 4]!;
      if (a.wet === b.wet) continue;
      const wet = a.wet ? a : b,
        dry = a.wet ? b : a;
      let wetX = wet.x * CELL,
        wetZ = wet.z * CELL,
        dryX = dry.x * CELL,
        dryZ = dry.z * CELL;
      this.heightSample.x = dryX;
      this.heightSample.z = dryZ;
      if (!sampleSeedWorldHeightInto(this.fields, this.heightSample)) continue;
      for (let j = 0; j < 4; j++) {
        const midX = (wetX + dryX) / 2,
          midZ = (wetZ + dryZ) / 2;
        this.heightSample.x = midX;
        this.heightSample.z = midZ;
        if (this.contact(this.heightSample, this.contactScratch)) {
          wetX = midX;
          wetZ = midZ;
        } else {
          dryX = midX;
          dryZ = midZ;
        }
      }
      const crossing = this.crossings[count++]!;
      crossing.x = (wetX + dryX) / 2;
      crossing.y = wet.y + 0.1;
      crossing.z = (wetZ + dryZ) / 2;
      crossing.kind = wet.kind;
    }
    for (let i = 1; i < count; i += 2) {
      const a = this.crossings[i - 1]!,
        b = this.crossings[i]!;
      const s = cell.segments[cell.count++]!;
      s.cellX = x;
      s.cellZ = z;
      s.kind = a.kind;
      s.a.x = a.x;
      s.a.y = a.y;
      s.a.z = a.z;
      s.b.x = b.x;
      s.b.y = b.y;
      s.b.z = b.z;
    }
  }
}

function ringSlot(x: number, z: number, size: number): number {
  return (((z % size) + size) % size) * size + (((x % size) + size) % size);
}

function appendRiver(result: River[], id: string, points: readonly AudioPoint[], offset = 0): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    result.push({
      id: `${id}:${i}`,
      a,
      b,
      order: offset + result.length,
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      minZ: Math.min(a.z, b.z),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
      maxZ: Math.max(a.z, b.z)
    });
  }
}
