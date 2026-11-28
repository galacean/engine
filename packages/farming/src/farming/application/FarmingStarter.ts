import { createDefaultFarmingLayout, DEFAULT_STORAGE_DEFINITIONS } from "../storage/StorageDefaults";
import { createInitialStorage } from "../storage/StorageRules";
import {
  boundsTooClose,
  cellBounds,
  containerBounds,
  ContainerPlacementError,
  CONTAINER_SUPPORT_TOLERANCE_M
} from "../storage/StoragePlacement";
import type { FarmStorageState, FarmingStorageDefinitions } from "../storage/StorageTypes";
import {
  GROUND_REASON_MESSAGES,
  inspectGround,
  type FarmingGroundView,
  type GroundBounds,
  type PlotGrid
} from "../domain/FarmingGround";
import type { FarmingDiagnosticIssue } from "../domain/FarmingDiagnostics";

export const STARTER_OPERATION_WIDTH_M = 2;

/** The accepted grid and occupied footprints define the same corridor before and after persistence. */
export function farmingOperationBounds(
  grid: PlotGrid,
  plots: readonly GroundBounds[],
  storage: readonly GroundBounds[]
): GroundBounds {
  return {
    minimumX: grid.originX - STARTER_OPERATION_WIDTH_M,
    maximumX: grid.originX,
    minimumZ: Math.min(grid.originZ, ...storage.map((b) => b.minimumZ)) - 1,
    maximumZ: Math.max(grid.originZ, ...plots.map((b) => b.maximumZ), ...storage.map((b) => b.maximumZ)) + 1
  };
}
export interface FarmingStarterPlacement extends ReturnType<typeof createDefaultFarmingLayout> {
  readonly storage: FarmStorageState;
  /** Reserved walking corridor alongside the cultivated cells and warehouse. */
  readonly operationBounds: GroundBounds;
  readonly facilityBounds: GroundBounds;
  readonly occupiedBounds: readonly { readonly id: string; readonly label: string; readonly bounds: GroundBounds }[];
  readonly entrances: readonly { readonly x: number; readonly z: number }[];
}
export type FarmingStarterInspection =
  | { readonly ok: true; readonly placement: FarmingStarterPlacement; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly FarmingDiagnosticIssue[] };

/** Shared by planning preflight and final published-ground validation. */
export function inspectFarmingOperation(
  view: FarmingGroundView,
  groundId: string,
  bounds: GroundBounds,
  maximumSlopeDegrees: number,
  target: string,
  occupiedBounds: readonly GroundBounds[] = []
): FarmingDiagnosticIssue | null {
  if (occupiedBounds.some((b) => boundsTooClose(b, bounds, 0)))
    return { code: "OPERATION_BLOCKED", message: "容器占据农场操作通道", source: "farming", target };
  const operation = view.inspectBounds(groundId, bounds);
  const reason = !operation.covered
    ? "GROUND_MISSING"
    : operation.blocked
      ? "GROUND_BLOCKED"
      : operation.underwater
        ? "GROUND_UNDERWATER"
        : operation.maximumSlopeDegrees >= maximumSlopeDegrees
          ? "GROUND_TOO_STEEP"
          : !Number.isFinite(operation.maximumSlopeDegrees) ||
              !operation.surfaces.length ||
              operation.surfaces.some((s) => s !== "soil" && s !== "grass")
            ? "GROUND_UNSUPPORTED"
            : null;
  return reason
    ? { code: reason, message: `农场操作通道：${GROUND_REASON_MESSAGES[reason]}`, source: "farming", target }
    : null;
}

/** Pure preflight. Accepted grids and exact containers are passed to runtime, never searched a second time. */
export function inspectFarmingStarter(
  view: FarmingGroundView,
  farmId: string,
  groundId: string,
  centerX: number,
  centerZ: number,
  storageDefinitions: FarmingStorageDefinitions = DEFAULT_STORAGE_DEFINITIONS,
  options: {
    readonly plotCount?: number;
    readonly initialContainers?: boolean;
    readonly maximumContainerPlacementAttempts?: number;
  } = {}
): FarmingStarterInspection {
  const layout = createDefaultFarmingLayout(groundId, centerX, centerZ, options.plotCount);
  const issues: FarmingDiagnosticIssue[] = [];
  for (const plot of layout.plots) {
    const check = inspectGround(view, layout.grid, plot.target!, plot.id);
    if (!check.canCultivate)
      issues.push({
        code: check.reason!,
        message: GROUND_REASON_MESSAGES[check.reason!],
        source: "farming",
        target: plot.id,
        ...(check.reason === "GROUND_TOO_STEEP"
          ? { expected: `<${layout.grid.maximumSlopeDegrees}`, actual: check.maximumSlopeDegrees }
          : {})
      });
  }
  if (issues.length) return { ok: false, issues };
  let storage: FarmStorageState;
  try {
    storage = createInitialStorage(
      farmId,
      layout.grid,
      layout.plots.map((p) => p.target!),
      { storage: storageDefinitions },
      view,
      {},
      options.initialContainers === false
        ? Object.fromEntries(storageDefinitions.containers.map((type) => [type.id, 0]))
        : undefined,
      options.maximumContainerPlacementAttempts
    );
  } catch (error) {
    if (!(error instanceof ContainerPlacementError)) throw error;
    const { containerType, diagnostics } = error;
    const reasonMessages: Record<string, string> = {
      ...GROUND_REASON_MESSAGES,
      PLOT_CLEARANCE: "与耕地或预留农田间距不足",
      CONTAINER_CLEARANCE: "与其他容器间距不足",
      CONTAINER_UNSUPPORTED: "底部高差超过支撑容差"
    };
    return {
      ok: false,
      issues: [
        {
          code: "NO_STORAGE_SPACE",
          message: error.message,
          source: "farming",
          target: `${farmId}/storage`,
          suggestion: "调整设施位置，使容器完整底部、坡度和耕地间距同时满足要求"
        },
        ...(diagnostics.budgetExhausted
          ? [
              {
                code: "STORAGE_SEARCH_EXHAUSTED",
                message: "初始容器搜索预算耗尽，不代表没有可行位置",
                source: "farming" as const,
                target: `${farmId}/storage/${containerType.id}`,
                actual: diagnostics.attempted
              }
            ]
          : []),
        ...Object.entries(diagnostics.reasons).map(
          ([code, count]): FarmingDiagnosticIssue => ({
            code,
            source: "farming",
            target: `${farmId}/storage/${containerType.id}`,
            message:
              `${containerType.name}：${reasonMessages[code] ?? code}（${count} 个位置/朝向）` +
              (code === "CONTAINER_UNSUPPORTED" && diagnostics.minimumHeightVariation !== undefined
                ? `；底部最小高差 ${(diagnostics.minimumHeightVariation * 100).toFixed(1)} 厘米，要求 ≤${CONTAINER_SUPPORT_TOLERANCE_M * 100} 厘米`
                : ""),
            ...(code === "CONTAINER_UNSUPPORTED"
              ? { expected: CONTAINER_SUPPORT_TOLERANCE_M, actual: diagnostics.minimumHeightVariation }
              : {})
          })
        )
      ]
    };
  }
  const plotFootprints = layout.plots.map((p) => cellBounds(layout.grid, p.target!));
  const storageFootprints = storage.containers.map((c) =>
    containerBounds(c, storageDefinitions.containers.find((t) => t.id === c.typeId)!)
  );
  const operationBounds = farmingOperationBounds(layout.grid, plotFootprints, storageFootprints);
  const operationIssue = inspectFarmingOperation(
    view,
    groundId,
    operationBounds,
    layout.grid.maximumSlopeDegrees,
    `${farmId}/operation`,
    storageFootprints
  );
  if (operationIssue) return { ok: false, issues: [operationIssue] };
  const footprints = [...plotFootprints, ...storageFootprints, operationBounds];
  const facilityBounds: GroundBounds = {
    minimumX: Math.min(...footprints.map((b) => b.minimumX)),
    maximumX: Math.max(...footprints.map((b) => b.maximumX)),
    minimumZ: Math.min(...footprints.map((b) => b.minimumZ)),
    maximumZ: Math.max(...footprints.map((b) => b.maximumZ))
  };
  const x = (operationBounds.minimumX + operationBounds.maximumX) / 2;
  return {
    ok: true,
    issues: [],
    placement: {
      ...layout,
      storage,
      operationBounds,
      facilityBounds,
      occupiedBounds: [
        ...layout.plots.map((p, i) => ({ id: p.id, label: `耕地 ${p.label}`, bounds: plotFootprints[i] })),
        ...storage.containers.map((c, i) => ({ id: c.id, label: "仓储容器", bounds: storageFootprints[i] }))
      ],
      entrances: [
        { x, z: operationBounds.minimumZ },
        { x, z: operationBounds.maximumZ }
      ]
    }
  };
}
