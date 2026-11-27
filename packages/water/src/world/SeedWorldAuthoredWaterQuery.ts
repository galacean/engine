/** Renderer-neutral query shape published together with one authored Water body. */
export type SeedWorldAuthoredWaterQueryBodyV1 =
  | Readonly<{
      kind: "basin";
      originX: number;
      originZ: number;
      cellSizeX: number;
      cellSizeZ: number;
      width: number;
      height: number;
      /** Dense row-major surface field. NaN marks a dry texel. */
      surfaceHeightByTexel: Float32Array;
    }>
  | Readonly<{
      kind: "river";
      points: readonly Readonly<{
        x: number;
        z: number;
        surfaceElevationMetres: number;
        widthMetres: number;
      }>[];
    }>;

export interface SeedWorldAuthoredWaterQueryResultV1 {
  readonly water: boolean;
  readonly bodyId?: string;
  readonly surfaceElevationMetres?: number;
  readonly nearestRiverDistanceMetres?: number;
}

/**
 * Query registry mirrors only Water bodies that have completed runtime publication.
 * It is the spatial-query view of the same body set used by rendering, not a second
 * authoring store.
 */
export class SeedWorldAuthoredWaterQueryRegistryV1 {
  private _revision = 0;
  private _structureRevision = 0;

  /** Body addition, replacement or removal; excludes water-level-only publications. */
  get structureRevision(): number {
    return this._structureRevision;
  }

  /** Version of the committed query shapes, including effective water-level publications. */
  get revision(): number {
    return this._revision;
  }

  private readonly _bodies = new Map<string, SeedWorldAuthoredWaterQueryBodyV1>();
  private readonly _navigationBodyIds: string[] = [];
  private readonly _navigationBodies: SeedWorldAuthoredWaterQueryBodyV1[] = [];
  private readonly _navigationBodyIndexById = new Map<string, number>();

  /** Read-only iteration over successfully published renderer query shapes. */
  entries(): IterableIterator<[string, SeedWorldAuthoredWaterQueryBodyV1]> {
    return this._bodies.entries();
  }

  upsert(bodyId: string, body: Readonly<SeedWorldAuthoredWaterQueryBodyV1>): void {
    if (!bodyId) throw new TypeError("Authored Water query bodyId must not be empty.");
    this._structureRevision++;
    this.publish(bodyId, body);
  }

  /** Replaces the surface of an existing basin without changing its grid or identity. */
  updateBasinWaterLevel(bodyId: string, body: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>): void {
    const previous = this._bodies.get(bodyId);
    if (
      !previous ||
      previous.kind !== "basin" ||
      previous.originX !== body.originX ||
      previous.originZ !== body.originZ ||
      previous.cellSizeX !== body.cellSizeX ||
      previous.cellSizeZ !== body.cellSizeZ ||
      previous.width !== body.width ||
      previous.height !== body.height
    ) {
      throw new Error("Water-level publication requires the same published basin grid.");
    }
    this.publish(bodyId, body);
  }

  private publish(bodyId: string, body: SeedWorldAuthoredWaterQueryBodyV1): void {
    this._bodies.set(bodyId, body);
    this._revision++;
    const navigationIndex = this._navigationBodyIndexById.get(bodyId);
    if (navigationIndex === undefined) {
      this._navigationBodyIndexById.set(bodyId, this._navigationBodies.length);
      this._navigationBodyIds.push(bodyId);
      this._navigationBodies.push(body);
    } else {
      this._navigationBodies[navigationIndex] = body;
    }
  }

  remove(bodyId: string): void {
    if (this._bodies.delete(bodyId)) {
      this._revision++;
      this._structureRevision++;
    }
    const navigationIndex = this._navigationBodyIndexById.get(bodyId);
    if (navigationIndex === undefined) return;
    const lastIndex = this._navigationBodies.length - 1;
    if (navigationIndex !== lastIndex) {
      const lastBodyId = this._navigationBodyIds[lastIndex]!;
      this._navigationBodyIds[navigationIndex] = lastBodyId;
      this._navigationBodies[navigationIndex] = this._navigationBodies[lastIndex]!;
      this._navigationBodyIndexById.set(lastBodyId, navigationIndex);
    }
    this._navigationBodyIds.pop();
    this._navigationBodies.pop();
    this._navigationBodyIndexById.delete(bodyId);
  }

  clear(): void {
    if (this._bodies.size) {
      this._revision++;
      this._structureRevision++;
    }
    this._bodies.clear();
    this._navigationBodyIds.length = 0;
    this._navigationBodies.length = 0;
    this._navigationBodyIndexById.clear();
  }

  /** Allocation-free height-only path used by per-frame navigation grounding. */
  sampleSurfaceHeight(worldX: number, worldZ: number): number | undefined {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      throw new RangeError("Authored Water query position must be finite.");
    }
    let highestSurface: number | undefined;
    for (let index = 0; index < this._navigationBodies.length; index++) {
      const body = this._navigationBodies[index]!;
      const surface =
        body.kind === "basin"
          ? sampleBasinSurfaceHeight(body, worldX, worldZ)
          : sampleRiverSurfaceHeight(body, worldX, worldZ);
      if (surface === undefined) continue;
      if (highestSurface === undefined || surface > highestSurface) highestSurface = surface;
    }
    return highestSurface;
  }

  query(worldX: number, worldZ: number): Readonly<SeedWorldAuthoredWaterQueryResultV1> {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      throw new RangeError("Authored Water query position must be finite.");
    }
    let bodyId: string | undefined;
    let surfaceElevationMetres: number | undefined;
    let nearestRiverDistanceMetres = Number.POSITIVE_INFINITY;
    for (const [candidateBodyId, body] of this._bodies) {
      const sample = body.kind === "basin" ? sampleBasin(body, worldX, worldZ) : sampleRiver(body, worldX, worldZ);
      if (sample.nearestRiverDistanceMetres !== undefined) {
        nearestRiverDistanceMetres = Math.min(nearestRiverDistanceMetres, sample.nearestRiverDistanceMetres);
      }
      if (!sample.water || sample.surfaceElevationMetres === undefined) continue;
      if (surfaceElevationMetres === undefined || sample.surfaceElevationMetres > surfaceElevationMetres) {
        bodyId = candidateBodyId;
        surfaceElevationMetres = sample.surfaceElevationMetres;
      }
    }
    return Object.freeze({
      water: surfaceElevationMetres !== undefined,
      ...(bodyId ? { bodyId } : {}),
      ...(surfaceElevationMetres !== undefined ? { surfaceElevationMetres } : {}),
      ...(Number.isFinite(nearestRiverDistanceMetres) ? { nearestRiverDistanceMetres } : {})
    });
  }
}

function sampleBasin(
  body: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>,
  worldX: number,
  worldZ: number
): Readonly<SeedWorldAuthoredWaterQueryResultV1> {
  const surfaceElevationMetres = sampleBasinSurfaceHeight(body, worldX, worldZ);
  return surfaceElevationMetres !== undefined
    ? Object.freeze({ water: true, surfaceElevationMetres })
    : Object.freeze({ water: false });
}

function sampleBasinSurfaceHeight(
  body: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "basin" }>,
  worldX: number,
  worldZ: number
): number | undefined {
  const column = Math.round((worldX - body.originX) / body.cellSizeX);
  const row = Math.round((worldZ - body.originZ) / body.cellSizeZ);
  if (column < 0 || row < 0 || column >= body.width || row >= body.height) return undefined;
  const surfaceElevationMetres = body.surfaceHeightByTexel[row * body.width + column];
  return Number.isFinite(surfaceElevationMetres) ? surfaceElevationMetres : undefined;
}

function sampleRiver(
  body: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "river" }>,
  worldX: number,
  worldZ: number
): Readonly<SeedWorldAuthoredWaterQueryResultV1> {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestSurface: number | undefined;
  let nearestHalfWidth = 0;
  for (let index = 1; index < body.points.length; index += 1) {
    const start = body.points[index - 1]!;
    const end = body.points[index]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const t =
      lengthSquared <= 1e-9 ? 0 : clamp01(((worldX - start.x) * deltaX + (worldZ - start.z) * deltaZ) / lengthSquared);
    const distance = Math.hypot(worldX - (start.x + deltaX * t), worldZ - (start.z + deltaZ * t));
    if (distance >= nearestDistance) continue;
    nearestDistance = distance;
    nearestSurface = lerp(start.surfaceElevationMetres, end.surfaceElevationMetres, t);
    nearestHalfWidth = lerp(start.widthMetres, end.widthMetres, t) * 0.5;
  }
  const water = nearestSurface !== undefined && nearestDistance <= nearestHalfWidth;
  return Object.freeze({
    water,
    ...(water ? { surfaceElevationMetres: nearestSurface } : {}),
    ...(Number.isFinite(nearestDistance) ? { nearestRiverDistanceMetres: nearestDistance } : {})
  });
}

function sampleRiverSurfaceHeight(
  body: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "river" }>,
  worldX: number,
  worldZ: number
): number | undefined {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestSurface: number | undefined;
  let nearestHalfWidth = 0;
  for (let index = 1; index < body.points.length; index += 1) {
    const start = body.points[index - 1]!;
    const end = body.points[index]!;
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const t =
      lengthSquared <= 1e-9 ? 0 : clamp01(((worldX - start.x) * deltaX + (worldZ - start.z) * deltaZ) / lengthSquared);
    const distance = Math.hypot(worldX - (start.x + deltaX * t), worldZ - (start.z + deltaZ * t));
    if (distance >= nearestDistance) continue;
    nearestDistance = distance;
    nearestSurface = lerp(start.surfaceElevationMetres, end.surfaceElevationMetres, t);
    nearestHalfWidth = lerp(start.widthMetres, end.widthMetres, t) * 0.5;
  }
  return nearestSurface !== undefined && nearestDistance <= nearestHalfWidth ? nearestSurface : undefined;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
