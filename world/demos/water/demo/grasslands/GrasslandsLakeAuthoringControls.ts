import { GRASSLANDS_LAKE_WATER_LEVEL_EDIT_RANGE } from "./GrasslandsWaterBodyAuthoring.ts";
import type { HeightfieldWaterDescriptorV1, LakeBoundaryV1, LakePointXZ } from "@galacean/engine-water/water/index";

import type { WaterControlDescriptor } from "@galacean/engine-water/water/devtools/index";

/** Reflects the published terrain mode, including undo/reset and edits submitted outside the panel. */
export function withLakeTerrainEditAvailability(
  control: WaterControlDescriptor,
  canEditTerrain: () => boolean
): WaterControlDescriptor {
  return {
    ...control,
    get availability() {
      return canEditTerrain() ? "active" : "readonly";
    },
    get availabilityReason() {
      return canEditTerrain() ? undefined : "现有湖盆的地面只读；切换到雕刻模式后可编辑。";
    }
  };
}

/** Scene-owned authoring edits use Loader replacement; the last valid resource survives errors. */
export function createGrasslandsLakeAuthoringControls(
  readDescriptor: () => HeightfieldWaterDescriptorV1,
  applyBoundary: (boundary: LakeBoundaryV1) => Promise<void>,
  canEditTerrain: () => boolean = () => true
): readonly WaterControlDescriptor[] {
  let selectedControlPointIndex = 0;
  const authoringControlMetadata = {
    group: "Lake" as const,
    owner: "authoring" as const,
    effect: "authoring" as const,
    updateMode: "commit" as const,
    sessionScope: "transient" as const
  };
  const readBoundary = (): LakeBoundaryV1 => readDescriptor().lakeBoundary!;
  const moveSelectedControlPoint = (axis: 0 | 1, value: number): Promise<void> => {
    const currentBoundary = readBoundary();
    const offset = value - currentBoundary.rings[0][selectedControlPointIndex].position[axis];
    const translatePoint = (p: LakePointXZ): LakePointXZ =>
      axis === 0 ? [p[0] + offset, p[1]] : [p[0], p[1] + offset];
    return applyBoundary({
      ...currentBoundary,
      rings: currentBoundary.rings.map((ring, index) =>
        index !== 0
          ? ring
          : ring.map((p, i) =>
              i !== selectedControlPointIndex
                ? p
                : {
                    position: translatePoint(p.position),
                    ...(p.incoming ? { incoming: translatePoint(p.incoming) } : {}),
                    ...(p.outgoing ? { outgoing: translatePoint(p.outgoing) } : {})
                  }
            )
      )
    });
  };
  const controls: WaterControlDescriptor[] = [
    {
      ...authoringControlMetadata,
      kind: "number",
      id: "scene.lake.waterLevel",
      label: "Water level (m)",
      minimum: -GRASSLANDS_LAKE_WATER_LEVEL_EDIT_RANGE,
      maximum: GRASSLANDS_LAKE_WATER_LEVEL_EDIT_RANGE,
      step: 0.05,
      description: "One horizontal base datum. Bed heights stay independent. Recompiles through WaterBody Loader.",
      read: () => readBoundary().waterLevel,
      write: (waterLevel) => applyBoundary({ ...readBoundary(), waterLevel })
    },
    {
      ...authoringControlMetadata,
      kind: "number",
      id: "scene.lake.chordError",
      label: "Shore sampling error (m)",
      minimum: 0.005,
      maximum: 0.3,
      step: 0.005,
      read: () => readBoundary().maxChordError,
      write: (maxChordError) => applyBoundary({ ...readBoundary(), maxChordError })
    },
    {
      ...authoringControlMetadata,
      kind: "number",
      id: "scene.lake.point",
      label: "Shore control point",
      minimum: 0,
      maximum: readBoundary().rings[0].length - 1,
      step: 1,
      updateMode: "live",
      read: () => selectedControlPointIndex,
      write: (index) => {
        const nextIndex = Math.round(index);
        if (!Number.isFinite(nextIndex) || nextIndex < 0 || nextIndex >= readBoundary().rings[0].length) {
          throw new RangeError("Lake control point index is outside the shoreline ring.");
        }
        selectedControlPointIndex = nextIndex;
      }
    },
    {
      ...authoringControlMetadata,
      kind: "number",
      id: "scene.lake.x",
      label: "Control point X (m)",
      minimum: -35,
      maximum: 35,
      step: 0.1,
      read: () => readBoundary().rings[0][selectedControlPointIndex].position[0],
      write: (value) => moveSelectedControlPoint(0, value)
    },
    {
      ...authoringControlMetadata,
      kind: "number",
      id: "scene.lake.z",
      label: "Control point Z (m)",
      minimum: -36,
      maximum: 36,
      step: 0.1,
      read: () => readBoundary().rings[0][selectedControlPointIndex].position[1],
      write: (value) => moveSelectedControlPoint(1, value)
    }
  ];
  return controls.map((control) =>
    control.id === "scene.lake.waterLevel" ? control : withLakeTerrainEditAvailability(control, canEditTerrain)
  );
}
