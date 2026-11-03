import type { FarmingGroundView, GroundBounds, GroundTarget, PlotGrid } from "../domain/FarmingGround";
import { plotBounds as cellBounds } from "../domain/FarmingGround";
export { cellBounds };
import type { StorageContainerDefinition, StorageContainerState, StorageLayout } from "./StorageTypes";

/** Upright props cannot follow the slope: limit exposed bottom gaps to 15 cm. No terrain modification. */
export const CONTAINER_SUPPORT_TOLERANCE_M = 0.15;
export const CONTAINER_SUPPORT_SAMPLE_STEP_M = 0.25;
export interface ContainerPlacementDiagnostics {
  attempted: number;
  reasons: Record<string, number>;
  minimumHeightVariation?: number;
  budgetExhausted?: boolean;
}

export class ContainerPlacementError extends Error {
  constructor(
    readonly containerType: StorageContainerDefinition,
    readonly diagnostics: ContainerPlacementDiagnostics
  ) {
    super(
      `NO_STORAGE_SPACE: ${containerType.name}${diagnostics.budgetExhausted ? "搜索预算耗尽，尚未找到合法位置" : "没有合法位置"}（检查 ${diagnostics.attempted} 个位置/朝向）`
    );
  }
}
export interface ContainerGroundInspection {
  readonly valid: boolean;
  readonly reason:
    | "GROUND_MISSING"
    | "GROUND_BLOCKED"
    | "GROUND_UNDERWATER"
    | "GROUND_UNSUPPORTED"
    | "GROUND_TOO_STEEP"
    | "CONTAINER_UNSUPPORTED"
    | null;
  readonly supportHeight: number | null;
  readonly heightVariation: number | null;
}

/** One shared check for candidate placement and the exact accepted runtime footprint. */
export function inspectContainerGround(
  view: FarmingGroundView,
  groundId: string,
  bounds: GroundBounds,
  maximumSlopeDegrees: number
): ContainerGroundInspection {
  const facts = view.inspectBounds(groundId, bounds);
  const reason: ContainerGroundInspection["reason"] = !facts.covered
    ? "GROUND_MISSING"
    : facts.blocked
      ? "GROUND_BLOCKED"
      : facts.underwater
        ? "GROUND_UNDERWATER"
        : !facts.surfaces.length || facts.surfaces.some((s) => s !== "soil" && s !== "grass")
          ? "GROUND_UNSUPPORTED"
          : !Number.isFinite(facts.maximumSlopeDegrees) || facts.maximumSlopeDegrees >= maximumSlopeDegrees
            ? "GROUND_TOO_STEEP"
            : null;
  if (reason) return { valid: false, reason, supportHeight: null, heightVariation: null };
  const nx = Math.max(1, Math.ceil((bounds.maximumX - bounds.minimumX) / CONTAINER_SUPPORT_SAMPLE_STEP_M));
  const nz = Math.max(1, Math.ceil((bounds.maximumZ - bounds.minimumZ) / CONTAINER_SUPPORT_SAMPLE_STEP_M));
  let minimum = Infinity,
    maximum = -Infinity;
  if (Number.isFinite(facts.minimumHeight) && Number.isFinite(facts.maximumHeight)) {
    minimum = facts.minimumHeight!;
    maximum = facts.maximumHeight!;
  }
  for (let iz = 0; iz <= nz; iz++)
    for (let ix = 0; ix <= nx; ix++) {
      const sample = view.sample(
        groundId,
        bounds.minimumX + ((bounds.maximumX - bounds.minimumX) * ix) / nx,
        bounds.minimumZ + ((bounds.maximumZ - bounds.minimumZ) * iz) / nz
      );
      if (!sample || !Number.isFinite(sample.position[1]))
        return { valid: false, reason: "GROUND_MISSING", supportHeight: null, heightVariation: null };
      minimum = Math.min(minimum, sample.position[1]);
      maximum = Math.max(maximum, sample.position[1]);
    }
  const heightVariation = maximum - minimum;
  return {
    valid: heightVariation <= CONTAINER_SUPPORT_TOLERANCE_M,
    reason: heightVariation > CONTAINER_SUPPORT_TOLERANCE_M ? "CONTAINER_UNSUPPORTED" : null,
    supportHeight: maximum,
    heightVariation
  };
}

export function containerBounds(
  container: Pick<StorageContainerState, "position" | "yaw">,
  type: StorageContainerDefinition
): GroundBounds {
  const width = container.yaw === 90 ? type.depth : type.width,
    depth = container.yaw === 90 ? type.width : type.depth;
  return {
    minimumX: container.position[0] - width / 2,
    maximumX: container.position[0] + width / 2,
    minimumZ: container.position[2] - depth / 2,
    maximumZ: container.position[2] + depth / 2
  };
}
export function boundsTooClose(a: GroundBounds, b: GroundBounds, gap: number): boolean {
  const dx = Math.max(a.minimumX - b.maximumX, b.minimumX - a.maximumX, 0);
  const dz = Math.max(a.minimumZ - b.maximumZ, b.minimumZ - a.maximumZ, 0);
  return (dx === 0 && dz === 0) || Math.hypot(dx, dz) < gap - 1e-8;
}
export function findContainerPlacement(
  view: FarmingGroundView,
  grid: PlotGrid,
  plots: readonly GroundTarget[],
  layout: StorageLayout,
  type: StorageContainerDefinition,
  types: readonly StorageContainerDefinition[],
  containers: readonly StorageContainerState[],
  diagnostics?: ContainerPlacementDiagnostics,
  maximumAttempts?: number
): Pick<StorageContainerState, "groundId" | "position" | "yaw"> | null {
  if (maximumAttempts !== undefined && (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1))
    throw new Error("Invalid container placement attempt budget");
  let attempts = 0;
  const radius = Math.floor(layout.searchRadius / layout.searchStep),
    candidates: { x: number; z: number; distance: number }[] = [];
  for (let z = -radius; z <= radius; z++)
    for (let x = -radius; x <= radius; x++) {
      const distance = x * x + z * z;
      if (distance <= radius * radius) candidates.push({ x, z, distance });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.z - b.z || a.x - b.x);
  const fields = plots.filter((p) => p.groundId === layout.groundId).map((p) => cellBounds(grid, p));
  const protectedAreas = layout.protectedAreas.filter((p) => p.groundId === layout.groundId);
  const occupied = containers
    .filter((c) => c.groundId === layout.groundId)
    .map((c) => containerBounds(c, types.find((t) => t.id === c.typeId)!));
  const reject = (reason: string) => {
    if (diagnostics) diagnostics.reasons[reason] = (diagnostics.reasons[reason] ?? 0) + 1;
  };
  for (const candidate of candidates)
    for (const yaw of [0, 90] as const) {
      if (maximumAttempts !== undefined && attempts >= maximumAttempts) {
        if (diagnostics) diagnostics.budgetExhausted = true;
        return null;
      }
      attempts++;
      if (diagnostics) diagnostics.attempted++;
      const x = layout.anchorX + candidate.x * layout.searchStep,
        z = layout.anchorZ + candidate.z * layout.searchStep;
      const position = [x, 0, z] as const,
        bounds = containerBounds({ position, yaw }, type);
      if (
        fields.some((f) => boundsTooClose(bounds, f, layout.plotClearance)) ||
        protectedAreas.some((f) => boundsTooClose(bounds, f, layout.plotClearance))
      ) {
        reject("PLOT_CLEARANCE");
        continue;
      }
      if (occupied.some((f) => boundsTooClose(bounds, f, layout.containerClearance))) {
        reject("CONTAINER_CLEARANCE");
        continue;
      }
      const inspection = inspectContainerGround(view, layout.groundId, bounds, grid.maximumSlopeDegrees);
      if (!inspection.valid) {
        reject(inspection.reason!);
        if (diagnostics && inspection.heightVariation !== null)
          diagnostics.minimumHeightVariation = Math.min(
            diagnostics.minimumHeightVariation ?? Infinity,
            inspection.heightVariation
          );
        continue;
      }
      return { groundId: layout.groundId, position: [x, inspection.supportHeight!, z], yaw };
    }
  return null;
}
