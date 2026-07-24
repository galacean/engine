/** Bounded owner for compiled obstacle footprints; contact lookup is added by the Ocean runtime. */
import type { CompiledOceanObstacle } from "../../compiler/ocean/OceanNearshoreCompiledTypes";

export interface OceanObstacleBoundarySample {
  worldX: number;
  worldZ: number;
  normalX: number;
  normalZ: number;
  localRadius: number;
  height: number;
}

export function createOceanObstacleBoundarySample(): OceanObstacleBoundarySample {
  return {
    worldX: 0,
    worldZ: 0,
    normalX: 1,
    normalZ: 0,
    localRadius: 0,
    height: 0
  };
}

export class OceanObstacleFieldResource {
  private _obstacles?: readonly CompiledOceanObstacle[];

  constructor(obstacles: readonly CompiledOceanObstacle[]) {
    this._obstacles = obstacles;
  }

  get obstacles(): readonly CompiledOceanObstacle[] {
    if (!this._obstacles) throw new Error("Ocean obstacle field resource has been disposed.");
    return this._obstacles;
  }

  get count(): number {
    return this._obstacles?.length ?? 0;
  }

  get byteLength(): number {
    // id/index references plus four bounds and the normalized descriptor fields.
    return this._obstacles ? this._obstacles.length * 64 : 0;
  }

  get isDisposed(): boolean {
    return this._obstacles === undefined;
  }

  /**
   * Samples one compiled circle/ellipse perimeter without allocating.
   * `normalizedAngle` wraps in turns, so deterministic fixed budgets can use
   * evenly spaced values in [0, 1).
   */
  sampleBoundary(
    obstacleIndex: number,
    normalizedAngle: number,
    out: OceanObstacleBoundarySample
  ): boolean {
    const obstacles = this.obstacles;
    if (
      !Number.isInteger(obstacleIndex) ||
      obstacleIndex < 0 ||
      obstacleIndex >= obstacles.length ||
      !Number.isFinite(normalizedAngle)
    ) {
      return false;
    }
    const descriptor = obstacles[obstacleIndex].descriptor;
    const angle =
      (normalizedAngle - Math.floor(normalizedAngle)) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    if (descriptor.shape === "circle") {
      out.worldX =
        descriptor.centerXZ[0] + cosine * descriptor.radius;
      out.worldZ =
        descriptor.centerXZ[1] + sine * descriptor.radius;
      out.normalX = cosine;
      out.normalZ = sine;
      out.localRadius = descriptor.radius;
      out.height = descriptor.height;
      return true;
    }
    const rotationCosine = Math.cos(descriptor.rotationRadians);
    const rotationSine = Math.sin(descriptor.rotationRadians);
    const localX = cosine * descriptor.radiiXZ[0];
    const localZ = sine * descriptor.radiiXZ[1];
    out.worldX =
      descriptor.centerXZ[0] +
      localX * rotationCosine -
      localZ * rotationSine;
    out.worldZ =
      descriptor.centerXZ[1] +
      localX * rotationSine +
      localZ * rotationCosine;
    const localNormalX = cosine / descriptor.radiiXZ[0];
    const localNormalZ = sine / descriptor.radiiXZ[1];
    const localNormalLength = Math.hypot(localNormalX, localNormalZ);
    const normalizedLocalX = localNormalX / localNormalLength;
    const normalizedLocalZ = localNormalZ / localNormalLength;
    out.normalX =
      normalizedLocalX * rotationCosine -
      normalizedLocalZ * rotationSine;
    out.normalZ =
      normalizedLocalX * rotationSine +
      normalizedLocalZ * rotationCosine;
    out.localRadius = Math.hypot(localX, localZ);
    out.height = descriptor.height;
    return true;
  }

  containsPoint(obstacleIndex: number, worldX: number, worldZ: number): boolean {
    const obstacles = this.obstacles;
    if (
      !Number.isInteger(obstacleIndex) ||
      obstacleIndex < 0 ||
      obstacleIndex >= obstacles.length ||
      !Number.isFinite(worldX) ||
      !Number.isFinite(worldZ)
    ) {
      return false;
    }
    const descriptor = obstacles[obstacleIndex].descriptor;
    const offsetX = worldX - descriptor.centerXZ[0];
    const offsetZ = worldZ - descriptor.centerXZ[1];
    if (descriptor.shape === "circle") {
      return (
        offsetX * offsetX + offsetZ * offsetZ <=
        descriptor.radius * descriptor.radius
      );
    }
    const cosine = Math.cos(descriptor.rotationRadians);
    const sine = Math.sin(descriptor.rotationRadians);
    const localX = offsetX * cosine + offsetZ * sine;
    const localZ = -offsetX * sine + offsetZ * cosine;
    const normalizedX = localX / descriptor.radiiXZ[0];
    const normalizedZ = localZ / descriptor.radiiXZ[1];
    return normalizedX * normalizedX + normalizedZ * normalizedZ <= 1;
  }

  dispose(): void {
    this._obstacles = undefined;
  }
}
