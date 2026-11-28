import {
  inspectGround,
  inspectFarmingOperation,
  GROUND_REASON_MESSAGES,
  type FarmingGroundView,
  type FarmingStarterPlacement,
  type FarmStorageState,
  type FarmingStorageDefinitions,
  type FarmingDiagnosticIssue
} from "@galacean/engine-farming/farming/api/index";
import { containerBounds, inspectContainerGround } from "@galacean/engine-farming/farming/storage/StoragePlacement";

/** Validates accepted facilities against final published facts. Never searches or moves saved state. */
export function inspectPublishedPlanningFarm(
  view: FarmingGroundView,
  farmId: string,
  groundId: string,
  placement: FarmingStarterPlacement,
  definitions: FarmingStorageDefinitions,
  operationView: FarmingGroundView = view
): { readonly issues: readonly FarmingDiagnosticIssue[]; readonly initialStorage?: FarmStorageState } {
  const issues: FarmingDiagnosticIssue[] = [];
  for (const plot of placement.plots.map((p) => ({ ...p.target!, plotId: p.id }))) {
    const check = inspectGround(view, placement.grid, plot, plot.plotId);
    if (!check.canCultivate)
      issues.push({
        code: check.reason!,
        source: "farming",
        target: plot.plotId,
        message: `已发布耕地检查失败：${GROUND_REASON_MESSAGES[check.reason!]}`
      });
  }
  const storage = placement.storage;
  const initialContainers = [...storage.containers];
  const footprints = [];
  for (const [index, container] of storage.containers.entries()) {
    const type = definitions.containers.find((t) => t.id === container.typeId);
    if (!type) {
      issues.push({
        code: "UNKNOWN_CONTAINER_TYPE",
        source: "farming",
        target: container.id,
        message: `未知仓储容器类型：${container.typeId}`
      });
      continue;
    }
    const bounds = containerBounds(container, type);
    footprints.push(bounds);
    const support = inspectContainerGround(view, container.groundId, bounds, placement.grid.maximumSlopeDegrees);
    if (!support.valid)
      issues.push({
        code: support.reason!,
        source: "farming",
        target: container.id,
        message: `已发布容器支撑检查失败：${support.reason}`
      });
    // Final Terrain decoding can differ slightly from analytic planning height. The accepted initial storage consumes this height.
    else
      initialContainers[index] = {
        ...container,
        position: [container.position[0], support.supportHeight!, container.position[2]]
      };
  }
  const operation = inspectFarmingOperation(
    operationView,
    groundId,
    placement.operationBounds,
    placement.grid.maximumSlopeDegrees,
    `${farmId}/operation`,
    footprints
  );
  if (operation) issues.push(operation);
  return issues.length ? { issues } : { issues, initialStorage: { ...storage, containers: initialContainers } };
}
