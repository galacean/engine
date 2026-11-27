import type { FarmingService } from "./FarmingService";
import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { FarmChange } from "../domain/FarmCommands";
import type { FarmSnapshot } from "../domain/FarmState";

export interface FarmingActivityEntry {
  readonly time: number;
  readonly level: "info" | "success" | "warning" | "error";
  readonly message: string;
}

/** Bounded session diagnostics. Observes confirmed agriculture events, never writes gameplay state. */
export class FarmingActivityLog {
  readonly entries: FarmingActivityEntry[] = [];
  private readonly observers = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.observers.add(listener);
    return () => this.observers.delete(listener);
  }
  private source?: FarmingService;
  private releases: (() => void)[] = [];
  private readonly matured = new Set<string>();
  constructor(
    private readonly changed: () => void,
    private readonly limit = 100
  ) {}
  append(level: FarmingActivityEntry["level"], message: string): void {
    this.entries.push({ time: Date.now(), level, message });
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    this.changed();
    for (const observer of this.observers) observer();
  }
  clear(): void {
    this.entries.length = 0;
    this.changed();
    for (const observer of this.observers) observer();
  }
  bind(source: FarmingService | undefined, definitions: FarmingDefinitionSet): void {
    if (this.source === source) return;
    this.dispose();
    this.source = source;
    if (!source) return;
    let revision = source.getSnapshot().revision;
    const observe = (snapshot: FarmSnapshot, changes: readonly FarmChange[]) => {
      for (const change of changes) {
        const plot =
          "plotId" in change ? (snapshot.plots.find((p) => p.plotId === change.plotId)?.label ?? change.plotId) : "";
        const crop =
          "cropId" in change
            ? (definitions.catalog.crops.find((c) => c.id === change.cropId)?.name ?? change.cropId)
            : "";
        switch (change.kind) {
          case "crop-planted":
            this.append("success", `${plot} · ${crop}播种成功`);
            break;
          case "crop-matured": {
            const key = `${snapshot.farmId}/${change.cropInstanceId}`;
            if (this.matured.has(key)) break;
            this.matured.add(key);
            if (this.matured.size > 512) this.matured.delete(this.matured.values().next().value!);
            this.append("success", `${plot} · ${crop}已成熟，可以收获`);
            break;
          }
          case "crop-harvested":
            this.append("success", `${plot} · ${crop}收获成功，${change.quantity}份进入收获篮子`);
            break;
          case "soil-irrigated":
            this.append("success", `${plot} · 浇水成功`);
            break;
          case "plot-created":
            this.append("success", `${plot} · 开垦成功`);
            break;
          case "plot-updated":
            if (
              changes.some(
                (entry) =>
                  entry.kind === "crop-removed" && entry.reason === "destroyed" && entry.plotId === change.plotId
              )
            )
              break;
            this.append("success", `${plot} · 土地更新成功`);
            break;
          case "crop-removed":
            this.append(
              "info",
              `${plot} · ${crop}${change.reason === "destroyed" ? "健康归零，已自动清理" : "已移除"}，无收获产物`
            );
            break;
          case "basket-unloaded":
            this.append(
              "success",
              `整篮卸货成功：${change.allocations.reduce((n, entry) => n + entry.quantity, 0)}份已入库`
            );
            break;
          case "container-created":
            this.append("success", `仓储容器已创建：${change.containerId}`);
            break;
          case "container-removed":
            this.append("info", `仓储容器已移除：${change.containerId}`);
            break;
        }
      }
    };
    const snapshot = source.getSnapshot();
    observe(
      snapshot,
      Object.values(snapshot.crops)
        .filter((crop) => {
          const definition = definitions.catalog.crops.find((d) => d.id === crop.cropId);
          return definition && crop.growthUnits >= definition.cycle.growthTarget;
        })
        .map((crop) => ({
          kind: "crop-matured",
          plotId: crop.anchorPlotId,
          cropId: crop.cropId,
          cropInstanceId: crop.instanceId
        }))
    );
    this.releases.push(
      source.subscribeFailures((message) => this.append("error", message)),
      source.subscribe((event) => {
        const changes = event.changes.length
          ? event.changes
          : event.snapshot.recentReceipts.filter((r) => r.committedRevision > revision).flatMap((r) => r.changes);
        revision = Math.max(revision, event.snapshot.revision);
        observe(event.snapshot, changes);
      }),
      source.subscribeErrors((failure) =>
        this.append("error", `种植系统 ${failure.operation} 失败：${String(failure.error)}`)
      )
    );
  }
  dispose(): void {
    for (const release of this.releases) release();
    this.releases = [];
    this.source = undefined;
  }
}
