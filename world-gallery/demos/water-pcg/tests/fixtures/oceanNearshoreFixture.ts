import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import {
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion
} from "../../authoring/ocean/OceanNearshoreTypes";

export function createOceanNearshoreFixture(): OceanNearshoreDescriptorV1 {
  const width = 5;
  const height = 5;
  const bedHeights = new Float32Array(width * height);
  const baseCurrentsXZ = new Float32Array(width * height * 2);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      bedHeights[index] = -4 + z * 1.5 + Math.abs(x - 2) * 0.05;
      baseCurrentsXZ[index * 2] = (x - 2) * 0.05;
      baseCurrentsXZ[index * 2 + 1] = -0.2 - z * 0.02;
    }
  }
  return {
    schemaVersion: OceanNearshoreSchemaVersion.V1,
    id: "unit-beach-nearshore",
    waterLevel: 0,
    grid: {
      originXZ: [-2, -2],
      cellSizeXZ: [1, 1],
      width,
      height
    },
    bedHeights,
    baseCurrentsXZ,
    wetSource: { kind: "water-level", minimumDepth: 0.05 },
    outsidePolicy: {
      negativeX: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveX: OceanNearshoreOutsidePolicy.DeepOcean,
      negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
      positiveZ: OceanNearshoreOutsidePolicy.Dry
    },
    obstacles: [
      {
        id: "unit-rock",
        shape: "circle",
        centerXZ: [0, -1.5],
        height: 2.5,
        radius: 0.35
      }
    ]
  };
}
