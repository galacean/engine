import { inspectFarmingAgronomy } from "../application/FarmingAgronomy";
import type { FarmingAgronomyReport } from "../domain/FarmingAgronomy";
import { FarmingCatalogResource, FarmingRulesResource, retainFarmingResource } from "./FarmingResources";
import { Script, ignoreClone, type Scene, type JSONAsset } from "@galacean/engine-core";
import { FarmingDebugMode } from "../application/FarmingDebugMode";
import {
  FARMING_DIAGNOSTIC_COVERAGE,
  FarmingDiagnostics,
  summarizeFarmingDiagnostics,
  type FarmingDiagnosticReport
} from "../domain/FarmingDiagnostics";
import {
  FarmingAreaComponent,
  nativeFarmingOwners,
  type FarmingAreaDependencies,
  type NativeFarmingOwner
} from "./FarmingAreaComponent";

/** Scene-local registry. Host dependencies never enter serialized Component props. */
export class FarmingSystem extends Script implements NativeFarmingOwner {
  /** Optional for standalone hosts; project-backed systems author these as virtual-path asset references. */
  private _catalog: FarmingCatalogResource | null = null;
  private _rules: FarmingRulesResource | null = null;
  get catalog() {
    return this._catalog;
  }
  set catalog(value: FarmingCatalogResource | null) {
    if (value === this._catalog) return;
    if (value && (!(value instanceof FarmingCatalogResource) || value.engine !== this.engine || value.destroyed))
      throw new Error("Invalid farming catalog reference");
    retainFarmingResource(value, 1);
    retainFarmingResource(this._catalog, -1);
    this._catalog = value;
  }
  get rules() {
    return this._rules;
  }
  set rules(value: FarmingRulesResource | null) {
    if (value === this._rules) return;
    if (value && (!(value instanceof FarmingRulesResource) || value.engine !== this.engine || value.destroyed))
      throw new Error("Invalid farming rules reference");
    retainFarmingResource(value, 1);
    retainFarmingResource(this._rules, -1);
    this._rules = value;
  }
  state: JSONAsset | null = null;
  readonly debug = new FarmingDebugMode();
  readonly diagnostics = new FarmingDiagnostics();
  /** Available before any area is created; querying never starts/retries initialization. */
  getDiagnostics(farmId?: string): FarmingDiagnosticReport {
    this.assertScene();
    const records = [...this.diagnostics.get(farmId).farms];
    for (const area of [...this._areas.values()].filter(
      (area) => !area.destroyed && !area.isDisposed && (!farmId || area.farmId === farmId)
    )) {
      const index = records.findIndex((r) => r.farmId === area.farmId && r.phase === "published");
      const spatial = index < 0 ? undefined : records[index];
      const record = {
        ...(spatial ?? {
          farmId: area.farmId,
          phase: "published" as const,
          planningRevision: 0,
          publicationRevision: 0,
          placement: { state: "pending" as const, issues: [] },
          access: { state: "pending" as const, issues: [] }
        }),
        runtime: spatial ? combinePresentation(spatial.runtime, area.runtimeDiagnostic) : area.runtimeDiagnostic,
        presentation: spatial
          ? combinePresentation(spatial.presentation, area.presentationDiagnostic)
          : area.presentationDiagnostic
      };
      // A retained inactive area must not turn a failed new spatial publication into a ready farm.
      if (spatial && (spatial.placement.state !== "ready" || spatial.access.state !== "ready")) continue;
      if (index < 0) records.push(record);
      else records[index] = record;
    }
    const ids = [
      ...new Set([...records.map((r) => r.farmId), ...[...this._areas.keys()].filter((id) => !farmId || id === farmId)])
    ];
    const agronomy: FarmingAgronomyReport[] = ids.map((id) => {
      const area = this._areas.get(id);
      if (!area || area.destroyed || area.isDisposed || !area.initialized)
        return { farmId: id, status: "unavailable", reason: "Farm area is absent or not initialized" };
      try {
        return { farmId: id, status: "observed", evidence: inspectFarmingAgronomy(area.service) };
      } catch (error) {
        return { farmId: id, status: "unavailable", reason: String(error) };
      }
    });
    return {
      agronomy,
      coverage: FARMING_DIAGNOSTIC_COVERAGE,
      current: summarizeFarmingDiagnostics(records),
      scope: { kind: farmId ? "farm" : "system", farmId: farmId ?? null },
      farms: records
    };
  }
  /** Scene-local UI switch; defaults to false and is not part of a farm snapshot. */
  get debugMode(): boolean {
    return this.debug.enabled;
  }
  set debugMode(enabled: boolean) {
    this.assertScene();
    this.debug.setEnabled(enabled);
  }
  get presentationActive(): boolean {
    return !this._disposed && this.enabled && this.entity.isActiveInHierarchy;
  }
  private _areas = new Map<string, FarmingAreaComponent>();
  private _resolve?: (area: FarmingAreaComponent) => FarmingAreaDependencies;
  private _disposed = false;
  private _disposeTask?: Promise<void>;
  private _registrationError?: Error;
  private _ownerScene?: Scene;
  assertScene(): void {
    if (this._ownerScene && this.entity.scene !== this._ownerScene) {
      this._registrationError ??= new Error("CONFLICT: FarmingSystem 不能迁移 Scene，请在目标 Scene 创建新系统");
      void this.dispose();
      throw this._registrationError;
    }
    if (this._registrationError) throw this._registrationError;
  }
  get isDisposed(): boolean {
    return this._disposed;
  }
  configureRuntime(resolve: (area: FarmingAreaComponent) => FarmingAreaDependencies): () => void {
    this.assertScene();
    if (this._registrationError) throw this._registrationError;
    if (this._disposed) throw new Error("DESTROYED: FarmingSystem 已销毁");
    if (this._resolve && this._resolve !== resolve) throw new Error("NOT_SUPPORTED: 请在区域启动前配置宿主依赖");
    const existing = this.currentOwner();
    if (existing && existing !== this) throw new Error("CONFLICT: 每个 Scene 只允许一个 FarmingSystem");
    this._resolve = resolve;
    nativeFarmingOwners.set(this.entity.scene!, this);
    for (const area of this.areas) if (area.enabled && area.entity.isActiveInHierarchy) area.start();
    return () => {
      if (this._resolve === resolve) this._resolve = undefined;
    };
  }
  dependencies(area: FarmingAreaComponent): FarmingAreaDependencies {
    this.assertScene();
    if (!this._resolve) throw new Error("MISSING_DEPENDENCY: 宿主必须提供地形与时钟/仓储依赖");
    return this._resolve(area);
  }
  get areas(): readonly FarmingAreaComponent[] {
    if (this._disposed) return [];
    this.assertScene();
    for (const area of this._areas.values()) {
      if (area.destroyed || area.isDisposed) this.forget(area);
      else if (area.entity.scene !== this._ownerScene)
        area.rejectRegistration(new Error("CONFLICT: 已注册的种植区域不能迁移 Scene"));
    }
    const visit = (entity: import("@galacean/engine-core").Entity) => {
      const area = entity.getComponent(FarmingAreaComponent);
      if (area?.configuration && !area.destroyed && !area.isDisposed) {
        try {
          this.register(area);
        } catch (error) {
          area.rejectRegistration(error as Error);
        }
      }
      for (const child of entity.children) visit(child);
    };
    for (const root of this.entity.scene!.rootEntities) visit(root);
    return [...this._areas.values()].filter((a) => !a.destroyed && a.entity.scene === this.entity.scene);
  }
  register(area: FarmingAreaComponent): void {
    this.assertScene();
    if (this._disposed) throw new Error("DESTROYED: FarmingSystem 已销毁");
    if (!area.farmId) return;
    if (area.entity.scene !== this.entity.scene) throw new Error("CONFLICT: 种植区域属于其他 Scene");
    const existing = this._areas.get(area.farmId);
    if (existing && existing !== area && !existing.destroyed) throw new Error("CONFLICT: 重复种植区域 ID");
    area.bindOwner(this, this.entity.scene!);
    this._areas.set(area.farmId, area);
  }
  getArea(farmId: string): FarmingAreaComponent {
    this.assertScene();
    const registered = this._areas.get(farmId);
    if (registered && !registered.destroyed && !registered.isDisposed && registered.entity.scene === this.entity.scene)
      return registered;
    const area = this.areas.find((a) => a.farmId === farmId);
    if (!area) throw new Error("NOT_FOUND: 种植区域不存在");
    return area;
  }
  forget(area: FarmingAreaComponent): void {
    if (this._areas.get(area.farmId) === area) this._areas.delete(area.farmId);
  }
  onAwake(): void {
    this._ownerScene = this.entity.scene!;
    const existing = this.currentOwner();
    if (existing && existing !== this) {
      this._registrationError = new Error("CONFLICT: 每个 Scene 只允许一个 FarmingSystem");
      this._disposed = true;
      return;
    }
    nativeFarmingOwners.set(this.entity.scene!, this);
  }
  onDestroy(): void {
    void this.dispose();
  }
  onDisable(): void {
    for (const area of this._areas.values()) {
      if (area.entity.scene !== this._ownerScene)
        area.rejectRegistration(new Error("CONFLICT: 已注册的种植区域不能迁移 Scene"));
      else if (area.initialized) area.onDisable();
    }
  }
  /** Scene-only activation does not invoke the public Script onEnable callback. */
  onUpdate(): void {
    if (this._disposed) return;
    try {
      this.assertScene();
    } catch (error) {
      this._registrationError = error as Error;
      void this.dispose();
    }
  }
  dispose(): Promise<void> {
    if (this._disposeTask) return this._disposeTask;
    const areas = [...this._areas.values()];
    this._disposed = true;
    this.debug.dispose();
    this.diagnostics.clear();
    if (this._ownerScene && nativeFarmingOwners.get(this._ownerScene) === this)
      nativeFarmingOwners.delete(this._ownerScene);
    this._disposeTask = Promise.all(areas.map((a) => a.dispose())).then(() => {
      this._areas.clear();
      this.catalog = null;
      this.rules = null;
      this.state = null;
    });
    return this._disposeTask;
  }
  private currentOwner(): NativeFarmingOwner | undefined {
    const existing = nativeFarmingOwners.get(this.entity.scene!);
    // Engine destruction callbacks may run after a replacement component awakens.
    // Release the destroyed owner's registry immediately, before registering its successor.
    if (existing instanceof FarmingSystem && (existing.destroyed || existing.isDisposed)) {
      void existing.dispose();
      if (nativeFarmingOwners.get(this.entity.scene!) === existing) nativeFarmingOwners.delete(this.entity.scene!);
      return undefined;
    }
    if (existing && existing !== this) {
      try {
        existing.assertScene();
      } catch {
        if (nativeFarmingOwners.get(this.entity.scene!) === existing) nativeFarmingOwners.delete(this.entity.scene!);
      }
    }
    return nativeFarmingOwners.get(this.entity.scene!);
  }
}
function combinePresentation(
  a: import("../domain/FarmingDiagnostics").FarmingDiagnosticCheck,
  b: import("../domain/FarmingDiagnostics").FarmingDiagnosticCheck
) {
  const severity = { ready: 0, pending: 1, blocked: 2, failed: 3 };
  return { state: severity[a.state] >= severity[b.state] ? a.state : b.state, issues: [...a.issues, ...b.issues] };
}
for (const key of [
  "debug",
  "diagnostics",
  "_areas",
  "_resolve",
  "_disposed",
  "_disposeTask",
  "_registrationError",
  "_ownerScene"
])
  ignoreClone(FarmingSystem.prototype, key);
