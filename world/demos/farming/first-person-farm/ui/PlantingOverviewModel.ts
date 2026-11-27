import type {
  CropStatusView,
  FarmSnapshot,
  FarmingDefinitionSet,
  PlotStatusView
} from "@galacean/engine-farming/farming/domain/index";

export interface PlantingGroup {
  readonly cropId: string;
  readonly name: string;
  readonly crops: readonly CropStatusView[];
  readonly matureCount: number;
}

/** One entry per live crop instance, never one entry per terrain cell. */
export function buildPlantingOverview(
  snapshot: FarmSnapshot,
  statuses: readonly PlotStatusView[],
  definitions: FarmingDefinitionSet
): PlantingGroup[] {
  const byInstance = new Map(statuses.flatMap(({ crop }) => (crop ? [[crop.instanceId, crop] as const] : [])));
  const ordered = Object.values(snapshot.crops).sort((a, b) => a.plantedOrder! - b.plantedOrder!);
  const grouped = new Map<string, CropStatusView[]>();
  for (const crop of ordered) {
    const status = byInstance.get(crop.instanceId);
    if (!status) continue;
    const group = grouped.get(crop.cropId) ?? [];
    group.push(status);
    grouped.set(crop.cropId, group);
  }
  return definitions.catalog.crops.flatMap((definition) => {
    const crops = grouped.get(definition.id);
    return crops?.length
      ? [
          {
            cropId: definition.id,
            name: definition.name,
            crops,
            matureCount: crops.filter((crop) => crop.mature).length
          }
        ]
      : [];
  });
}

export function plantingState(crop: CropStatusView): string {
  return crop.mature
    ? "可采摘"
    : crop.pausedReason === "soil-too-dry"
      ? "缺水 · 生长暂停"
      : crop.pausedReason === "soil-too-wet"
        ? "过湿 · 生长暂停"
        : crop.pausedReason
          ? "生长暂停"
          : "生长中";
}

export function clampOverviewOffset(offset: number, length: number, capacity: number): number {
  return Math.max(0, Math.min(Math.floor(offset), Math.max(0, length - capacity)));
}
