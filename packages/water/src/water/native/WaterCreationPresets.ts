import { compileWaterShape, type WaterShapeAuthoring } from "./WaterAuthoring";
import type { WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";

/** Complete CPU-only creation input. The bed is computational data, not visible terrain or a carving request. */
export function createWaterCreationPreset(kind: WaterShapeAuthoring["kind"]): {
  shape: WaterShapeAuthoring;
  terrain: WaterTerrainSnapshot;
} {
  const terrain: WaterTerrainSnapshot = {
    id: `${kind}-bed`,
    revision: 1,
    origin: [-16, -16],
    spacing: 1,
    columns: 33,
    rows: 33,
    heights: Array(33 * 33).fill(-2)
  };
  const shape: WaterShapeAuthoring =
    kind === "lake"
      ? {
          kind,
          referenceLevel: 0,
          levelOffsetM: 0,
          shoreline: [
            [-6, -6],
            [6, -6],
            [6, 6],
            [-6, 6]
          ].map(([x, z], index) => ({ id: `p${index}`, ring: "shore", x, z }))
        }
      : kind === "river"
        ? {
            kind,
            speed: 0,
            course: {
              id: "river",
              points: [
                { id: "head", x: -6, z: 0, elevation: 0, width: 4, depth: 2 },
                { id: "tail", x: 6, z: 0, elevation: 0, width: 4, depth: 2 }
              ]
            }
          }
        : kind === "ocean"
          ? {
              kind,
              waterLevel: 0,
              layout: {
                schemaVersion: 1,
                kind: "ocean-surface-layout",
                centerXZ: [0, 0],
                size: 64,
                surfaceTopology: "finite",
                finitePatchGridSize: 16
              }
            }
          : (() => {
              throw new TypeError("INVALID_ARGUMENT: Unknown Water kind.");
            })();
  compileWaterShape(shape, terrain, `preset-${kind}`);
  return { shape, terrain };
}
