export type WaterCurrentFieldSnapshotKind = "uniform" | "grid";

interface WaterCurrentFieldSnapshotBase {
  readonly kind: WaterCurrentFieldSnapshotKind;
  /** Monotonic source revision used by consumers to detect rebuilt current data. */
  readonly revision: number;
}

/** Constant horizontal current. It is intentionally data-only so dense consumers cannot trigger point queries. */
export interface UniformWaterCurrentFieldSnapshot extends WaterCurrentFieldSnapshotBase {
  readonly kind: "uniform";
  readonly currentX: number;
  readonly currentZ: number;
}

/** Body-local current grid sampled at texel centers. `currentVectorsXZ` is an owned copy consumers must not mutate. */
export interface GridWaterCurrentFieldSnapshot extends WaterCurrentFieldSnapshotBase {
  readonly kind: "grid";
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly currentVectorsXZ: Float32Array;
}

export type WaterCurrentFieldSnapshot = UniformWaterCurrentFieldSnapshot | GridWaterCurrentFieldSnapshot;

export interface WaterCurrentFieldSample {
  currentX: number;
  currentZ: number;
}

export interface UniformWaterCurrentFieldSnapshotOptions {
  readonly revision: number;
  readonly currentX: number;
  readonly currentZ: number;
}

export interface GridWaterCurrentFieldSnapshotOptions {
  readonly revision: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
  readonly resolutionX: number;
  readonly resolutionZ: number;
  readonly currentVectorsXZ: ArrayLike<number>;
}

function validateRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Water current snapshot revision must be a non-negative safe integer.");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createWaterCurrentFieldSample(): WaterCurrentFieldSample {
  return { currentX: 0, currentZ: 0 };
}

export function createUniformWaterCurrentFieldSnapshot(
  options: UniformWaterCurrentFieldSnapshotOptions
): UniformWaterCurrentFieldSnapshot {
  validateRevision(options.revision);
  if (!Number.isFinite(options.currentX) || !Number.isFinite(options.currentZ)) {
    throw new Error("Uniform water current must be finite.");
  }
  return Object.freeze({
    kind: "uniform",
    revision: options.revision,
    currentX: options.currentX,
    currentZ: options.currentZ
  });
}

export function createGridWaterCurrentFieldSnapshot(
  options: GridWaterCurrentFieldSnapshotOptions
): GridWaterCurrentFieldSnapshot {
  validateRevision(options.revision);
  if (
    !Number.isFinite(options.centerX) ||
    !Number.isFinite(options.centerZ) ||
    !Number.isFinite(options.length) ||
    options.length <= 0 ||
    !Number.isFinite(options.width) ||
    options.width <= 0 ||
    !Number.isInteger(options.resolutionX) ||
    options.resolutionX < 2 ||
    !Number.isInteger(options.resolutionZ) ||
    options.resolutionZ < 2
  ) {
    throw new Error("Grid water current snapshot region is invalid.");
  }
  const expectedValueCount = options.resolutionX * options.resolutionZ * 2;
  if (options.currentVectorsXZ.length !== expectedValueCount) {
    throw new Error(`Grid water current snapshot requires ${expectedValueCount} XZ values.`);
  }
  const currentVectorsXZ = new Float32Array(expectedValueCount);
  for (let index = 0; index < expectedValueCount; index++) {
    const value = options.currentVectorsXZ[index];
    if (!Number.isFinite(value)) throw new Error("Grid water current snapshot values must be finite.");
    currentVectorsXZ[index] = value;
  }
  return Object.freeze({
    kind: "grid",
    revision: options.revision,
    centerX: options.centerX,
    centerZ: options.centerZ,
    length: options.length,
    width: options.width,
    resolutionX: options.resolutionX,
    resolutionZ: options.resolutionZ,
    currentVectorsXZ
  });
}

/** Allocation-free current lookup for visual field simulation; never calls a surface or local-field Provider. */
export function sampleWaterCurrentFieldSnapshot(
  snapshot: WaterCurrentFieldSnapshot,
  worldX: number,
  worldZ: number,
  outSample: WaterCurrentFieldSample
): boolean {
  outSample.currentX = 0;
  outSample.currentZ = 0;
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
  if (snapshot.kind === "uniform") {
    outSample.currentX = snapshot.currentX;
    outSample.currentZ = snapshot.currentZ;
    return true;
  }

  const minimumX = snapshot.centerX - snapshot.length * 0.5;
  const minimumZ = snapshot.centerZ - snapshot.width * 0.5;
  const maximumX = minimumX + snapshot.length;
  const maximumZ = minimumZ + snapshot.width;
  if (worldX < minimumX || worldX > maximumX || worldZ < minimumZ || worldZ > maximumZ) return false;

  const pixelX = clamp(
    ((worldX - minimumX) / snapshot.length) * snapshot.resolutionX - 0.5,
    0,
    snapshot.resolutionX - 1
  );
  const pixelZ = clamp(
    ((worldZ - minimumZ) / snapshot.width) * snapshot.resolutionZ - 0.5,
    0,
    snapshot.resolutionZ - 1
  );
  const x0 = Math.floor(pixelX);
  const z0 = Math.floor(pixelZ);
  const x1 = Math.min(snapshot.resolutionX - 1, x0 + 1);
  const z1 = Math.min(snapshot.resolutionZ - 1, z0 + 1);
  const blendX = pixelX - x0;
  const blendZ = pixelZ - z0;
  const values = snapshot.currentVectorsXZ;
  const bottomLeft = (z0 * snapshot.resolutionX + x0) * 2;
  const bottomRight = (z0 * snapshot.resolutionX + x1) * 2;
  const topLeft = (z1 * snapshot.resolutionX + x0) * 2;
  const topRight = (z1 * snapshot.resolutionX + x1) * 2;
  const bottomX = values[bottomLeft] * (1 - blendX) + values[bottomRight] * blendX;
  const bottomZ = values[bottomLeft + 1] * (1 - blendX) + values[bottomRight + 1] * blendX;
  const topX = values[topLeft] * (1 - blendX) + values[topRight] * blendX;
  const topZ = values[topLeft + 1] * (1 - blendX) + values[topRight + 1] * blendX;
  outSample.currentX = bottomX * (1 - blendZ) + topX * blendZ;
  outSample.currentZ = bottomZ * (1 - blendZ) + topZ * blendZ;
  return true;
}
