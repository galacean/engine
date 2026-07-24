/** Deterministically compiles validated obstacle footprints into bounded immutable records. */
import type { OceanObstacleDescriptor } from "../../authoring/ocean/OceanObstacleTypes";
import type {
  CompiledOceanObstacle,
  OceanNearshoreCompiledData
} from "./OceanNearshoreCompiledTypes";

function computeBounds(
  descriptor: OceanObstacleDescriptor
): readonly [number, number, number, number] {
  if (descriptor.shape === "circle") {
    return Object.freeze([
      descriptor.centerXZ[0] - descriptor.radius,
      descriptor.centerXZ[1] - descriptor.radius,
      descriptor.centerXZ[0] + descriptor.radius,
      descriptor.centerXZ[1] + descriptor.radius
    ] as const);
  }
  const cosine = Math.cos(descriptor.rotationRadians);
  const sine = Math.sin(descriptor.rotationRadians);
  const extentX = Math.hypot(
    descriptor.radiiXZ[0] * cosine,
    descriptor.radiiXZ[1] * sine
  );
  const extentZ = Math.hypot(
    descriptor.radiiXZ[0] * sine,
    descriptor.radiiXZ[1] * cosine
  );
  return Object.freeze([
    descriptor.centerXZ[0] - extentX,
    descriptor.centerXZ[1] - extentZ,
    descriptor.centerXZ[0] + extentX,
    descriptor.centerXZ[1] + extentZ
  ] as const);
}

export function compileOceanObstacleField(
  descriptors: readonly OceanObstacleDescriptor[]
): readonly CompiledOceanObstacle[] {
  return Object.freeze(
    descriptors.map((descriptor, index) =>
      Object.freeze({
        id: descriptor.id,
        index,
        descriptor,
        bounds: computeBounds(descriptor)
      })
    )
  );
}

export function getCompiledOceanObstacleCount(
  data: Pick<OceanNearshoreCompiledData, "obstacles">
): number {
  return data.obstacles.length;
}
