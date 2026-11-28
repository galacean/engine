import { containerBounds } from "@galacean/engine-farming/farming/storage/StoragePlacement";
import { storageDefinitions } from "@galacean/engine-farming/farming/storage/StorageRules";
import type { Camera } from "@galacean/engine";
import { Ray, Vector2, Vector3 } from "@galacean/engine-math";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import type { PlanningFarmingRuntime } from "./PlanningFarmingRuntime.ts";
import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/FarmDefinitions";
import { farmingDefinitions } from "@galacean/engine-farming/farming/native/FarmingResources";
import { simulationSoilProfile } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import { targetAtPoint, type GroundTarget } from "@galacean/engine-farming/farming/api/index";
import type { FarmingRequest } from "@galacean/engine-farming/farming/native/FarmingAPIContract";
import { FarmingActivityLog } from "@galacean/engine-farming/farming/application/FarmingActivityLog";
import { summarizeFarmingPlot } from "@galacean/engine-farming/farming/presentation/FarmingPlotStatusSummary";

export const FARMING_DEBUG_ACTIONS = [
  ["plant", "播种"],
  ["irrigate", "浇水"],
  ["harvest", "收获"],
  ["hoe", "锄地"],
] as const;
export type FarmingDebugAction = (typeof FARMING_DEBUG_ACTIONS)[number][0];
export interface PlanningFarmingControlsOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  navigation: TerrainNavigationRuntime;
  readonly runtime: PlanningFarmingRuntime | undefined;
  readCurrent(): PublishedPlanningSeedScene | undefined;
  isInputEnabled(): boolean;
  beforeTravel?(): void;
  readEnabled?(): boolean;
  readSwitchError?(): string | undefined;
  setEnabled?(enabled: boolean): Promise<void>;
}

/** Debug-session state. Only the panel is replaced when the inspector rebinds a published World. */
export class PlanningFarmingControls {
  readonly state = { enabled: true, cropGrowthMultiplier: 1, damagePermille: 200, plotId: "", seedId: "", picking: false };
  private readonly fallbackActivity = new FarmingActivityLog(() => this.emit());
  private activitySource?: FarmingActivityLog;
  private releaseActivity?: () => void;
  get activity(): FarmingActivityLog {
    return this.options.runtime?.activity ?? this.fallbackActivity;
  }
  private definitions?: FarmingDefinitionSet;
  get seeds(): FarmingDefinitionSet["seeds"] {
    return this.definitions?.seeds ?? [];
  }
  plots: { plotId: string; label: string }[] = [];
  status = "正在接入农场…";
  message = "";
  diagnostics = "农场准备中";
  inventory = "空";
  environment = "环境尚未就绪";
  selectedStatus = "将视角对准 8 米内的地块，或开启点击选地";
  selectionLabel = "未选择";
  travelReason = "农场尚未就绪";
  busy = false;
  availability: readonly {
    action: string;
    enabled: boolean;
    reason?: string;
  }[] = [];
  toggling = false;
  get switchError(): string | undefined { return this.options.readSwitchError?.(); }
  private groundTarget: GroundTarget | null = null;
  private visible = false;
  private disposed = false;
  private area?: PlanningFarmingRuntime["activeArea"];
  private publication?: PublishedPlanningSeedScene;
  private generation = 0;
  private nextRefresh = 0;
  private pending?: Promise<void>;
  private refreshAgain = false;
  private diagnosticKey = "";
  private growthSettingsKey = "";
  private pollError = "";
  private readonly listeners = new Set<() => void>();
  private inputAbort?: AbortController;
  private pointer?: { id: number; x: number; y: number; moved: boolean };
  private ownsHighlight = false;
  private highlightPresentation?: PlanningFarmingRuntime["worldPresentation"];
  private highlightKey = "";

  get active(): boolean {
    return !!this.area;
  }

  constructor(private readonly options: PlanningFarmingControlsOptions) {}

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.toggling || !this.options.setEnabled) return;
    this.toggling = true;
    let message = "";
    this.setPicking(false);
    this.emit();
    try {
      await this.options.setEnabled(enabled);
      message = enabled ? "农场已开启" : "农场已关闭，运行、交互与渲染已卸载";
    } catch (error) {
      message = `农场切换失败：${String(error)}`;
    } finally {
      this.state.enabled = this.options.readEnabled?.() ?? true;
      this.toggling = false;
      await this.refresh(true);
      this.message = message;
      this.emit();
    }
  }

  private bindInput(): void {
    const options = this.options;
    const { signal } = (this.inputAbort = new AbortController());
    options.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button === 0)
          this.pointer = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false
          };
      },
      { capture: true, signal }
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        const p = this.pointer;
        if (p && p.id === event.pointerId && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 5) p.moved = true;
      },
      { capture: true, signal }
    );
    window.addEventListener(
      "pointercancel",
      () => {
        this.pointer = undefined;
      },
      { signal }
    );
    // Window capture precedes the existing canvas/object selection handlers.
    window.addEventListener("click", this.click, { capture: true, signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.state.picking) {
          this.setPicking(false);
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      },
      { capture: true, signal }
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    if (!this.disposed) for (const listener of this.listeners) listener();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.setPicking(false);
      this.clearHighlight();
    } else {
      this.updateTarget();
      void this.refresh(true);
    }
  }
  setPicking(enabled: boolean): void {
    this.state.picking = enabled && this.visible && !!this.options.runtime?.activeArea;
    this.pointer = undefined;
    if (this.state.picking) {
      if (!this.inputAbort) this.bindInput();
      this.updateTarget();
    } else {
      this.inputAbort?.abort();
      this.inputAbort = undefined;
      this.clearHighlight();
      this.readState();
    }
    this.emit();
  }
  selectPlot(id: string): void {
    this.synchronize();
    this.state.plotId = id;
    this.groundTarget = null;
    this.setPicking(true);
    this.updateTarget();
    void this.refresh(true);
  }
  private clearHighlight(): void {
    if (this.ownsHighlight && this.highlightPresentation === this.options.runtime?.worldPresentation)
      this.highlightPresentation?.releaseTargetOverride();
    this.ownsHighlight = false;
    this.highlightPresentation = undefined;
    this.highlightKey = "";
  }
  private updateTarget(): void {
    if (!this.visible || !this.state.picking) return;
    const presentation = this.options.runtime?.worldPresentation;
    const target = { plotId: this.state.plotId || null, ground: this.groundTarget };
    const key = JSON.stringify(target);
    if (this.highlightPresentation === presentation && this.highlightKey === key) return;
    presentation?.setTarget(target, { lock: true });
    this.highlightPresentation = presentation;
    this.highlightKey = key;
    this.ownsHighlight = !!presentation;
  }
  private synchronize(): void {
    this.state.enabled = this.options.readEnabled?.() ?? true;
    if (this.activitySource !== this.activity) {
      this.releaseActivity?.();
      this.activitySource = this.activity;
      this.releaseActivity = this.activitySource.subscribe(() => this.emit());
    }
    const publication = this.options.readCurrent(),
      area = this.options.runtime?.activeArea;
    if (publication === this.publication && area === this.area) return;
    this.clearHighlight();
    this.publication = publication;
    this.area = area;
    this.generation++;
    this.busy = false;
    this.inputAbort?.abort();
    this.inputAbort = undefined;
    this.pointer = undefined;
    this.state.picking = false;
    this.state.plotId = "";
    this.groundTarget = null;
    this.message = "";
    this.diagnosticKey = "";
    this.growthSettingsKey = "";
    this.nextRefresh = 0;
    if (area) {
      const { catalog, rules } = area.configuration!;
      const definitions = farmingDefinitions(catalog, rules);
      this.definitions = {
        ...definitions,
        soilProfile: simulationSoilProfile(definitions.soilProfile, area.service.simulationConfig)
      };
      if (!this.seeds.some((seed) => seed.id === this.state.seedId)) this.state.seedId = this.seeds[0]?.id ?? "";
      this.activity.bind(area.service, this.definitions);
    } else {
      this.definitions = undefined;
      this.state.seedId = "";
    }
  }

  refresh(force = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.synchronize();
    if (this.pending) {
      this.refreshAgain ||= force;
      return this.pending;
    }
    if (!force && performance.now() < this.nextRefresh) return Promise.resolve();
    this.nextRefresh = performance.now() + 500;
    const generation = this.generation,
      publication = this.publication,
      area = this.area;
    this.readState();
    const pending = this.readDiagnostics(generation)
      .catch((error) => {
        if (
          this.disposed ||
          generation !== this.generation ||
          publication !== this.options.readCurrent() ||
          area !== this.options.runtime?.activeArea
        )
          return;
        const message = String(error);
        if (message !== this.pollError) this.activity.append("error", `种植状态读取失败：${message}`);
        this.pollError = message;
        this.diagnostics = `种植状态读取失败：${message}`;
        this.emit();
      })
      .finally(() => {
        if (this.pending !== pending) return;
        this.pending = undefined;
        if (this.refreshAgain && !this.disposed) {
          this.refreshAgain = false;
          void this.refresh(true);
        }
      });
    this.pending = pending;
    return pending;
  }

  private readState(): void {
    const area = this.area,
      current = this.publication;
    this.travelReason = !area ? "农场尚未就绪" : !current ? "场景尚未就绪" : "";
    this.plots = area?.service.queryPlots().map((p) => ({ plotId: p.plotId, label: p.label })) ?? [];
    if (!this.state.picking) {
      const target = this.options.runtime?.worldPresentation?.port.getTarget?.();
      this.state.plotId = target?.plotId ?? "";
      this.groundTarget = target?.ground ?? null;
    }
    if (this.groundTarget && area) {
      const p = area.service
        .queryPlots()
        .find(
          (p) =>
            p.groundId === this.groundTarget!.groundId &&
            p.cellX === this.groundTarget!.cellX &&
            p.cellZ === this.groundTarget!.cellZ
        );
      this.state.plotId = p?.plotId ?? "";
    } else if (!this.plots.some((p) => p.plotId === this.state.plotId)) this.state.plotId = "";
    const selected = area?.service.getPlot(this.state.plotId);
    this.selectionLabel = selected
      ? selected.label
      : this.groundTarget
        ? `选中地面 · ${this.groundTarget.cellX}, ${this.groundTarget.cellZ}`
        : "未选择";
    this.selectedStatus = selected
      ? summarizeFarmingPlot(selected, this.definitions!)
          .map(([k, v]) => `${k}：${v}`)
          .join("\n")
      : this.groundTarget
        ? "尚未开垦；可用操作以地面检查结果为准"
        : "将视角对准 8 米内的地块，或开启点击选地";
    this.availability =
      area && (selected || this.groundTarget)
        ? area.service.getAvailableActions(this.groundTarget ?? selected!.plotId)
        : [];
    this.inventory = area
      ? Object.entries(area.service.getInventory())
          .map(
            ([id, n]) =>
              `${this.definitions!.catalog.crops.find((c) => c.harvest.itemId === id)?.harvest.itemName ?? id}：${n}`
          )
          .join("\n") || "空"
      : "农场尚未就绪";
    if (area) {
      const config = area.service.simulationConfig;
      const growthSettingsKey = `${config.cropGrowthMultiplier}`;
      if (this.growthSettingsKey !== growthSettingsKey) {
        this.growthSettingsKey = growthSettingsKey;
        this.state.cropGrowthMultiplier = config.cropGrowthMultiplier;
      }
      const e = area.service.getEnvironment();
      const water = e.nearWater;
      this.environment = `${e.availability === "live" ? "实时输入" : "静态基线"} · ${e.season ?? "季节不可用"} · 基准 ${e.baseTemperatureCelsius ?? "不可用"}°C
气温 ${e.airTemperatureTenths / 10}°C · 光照 ${e.lightUnits}/100 · ${e.snowing ? "下雪" : "无雪"} · 雨强 ${e.rainRate.toFixed(2)}
农业时间 ${Math.round(e.agriculturalTimeMs)}ms · 已模拟 ${e.simulatedTimeMs}ms${water ? `\n近水${water.refreshing ? "刷新中" : "就绪"} · 地面 ${water.completedGroundRevision ?? "无"}→${water.requestedGroundRevision} · 累计采样 ${water.totalSampleCalls} · 最大切片 ${water.maximumSliceCalls} 次/${water.maximumSliceMs.toFixed(2)}ms · 超预算 ${water.overBudgetSlices} 次` : ""}`;
    }
    this.updateTarget();
    this.emit();
  }
  private async readDiagnostics(generation: number): Promise<void> {
    if (this.switchError) {
      this.status = this.state.enabled ? "农场开启未完成" : "农场关闭未完成";
      this.diagnostics = `切换失败，不能确认完全卸载：${this.switchError}。请点击“重试农场切换”。`;
      delete this.options.canvas.dataset.farming;
      this.emit();
      return;
    }
    const publication = this.publication,
      area = this.area,
      farmId = publication?.plan.farming?.farmId;
    const report = this.options.runtime?.available
      ? await this.options.runtime!.api.getDiagnostics(farmId ? { farmId } : {})
      : undefined;
    if (
      this.disposed ||
      generation !== this.generation ||
      publication !== this.options.readCurrent() ||
      area !== this.options.runtime?.activeArea
    )
      return;
    if (!report) {
      this.pollError = "";
      this.status = this.state.enabled ? "种植系统未启用" : "农场已关闭（诊断）";
      this.diagnostics = this.state.enabled ? "种植系统尚未就绪" : "运行、交互与渲染已卸载；开启后重新接入";
      delete this.options.canvas.dataset.farming;
      this.emit();
      return;
    }
    if (!report.ok) throw new Error(report.error.message);
    this.pollError = "";
    this.options.canvas.dataset.farming = JSON.stringify(report.value);
    const farm = report.value.farms.find((f) => f.phase === "published" && f.farmId === farmId);
    if (!farm) {
      this.status = "正在接入农场…";
      this.diagnostics = "等待农场诊断";
      this.emit();
      return;
    }
    const checks = [
      ["设施", farm.placement],
      ["接入", farm.access],
      ["运行", farm.runtime],
      ["表现", farm.presentation]
    ] as const;
    const names: Record<string, string> = {
      ready: "就绪",
      pending: "准备中",
      blocked: "不可用",
      failed: "失败"
    };
    this.diagnostics = checks
      .map(
        ([name, check]) =>
          `${name}：${names[check.state] ?? check.state}${check.issues.length ? `\n${check.issues.map((i) => i.message).join("\n")}` : ""}`
      )
      .join("\n");
    const issues = checks.flatMap(([, c]) => c.issues);
    this.status =
      farm.runtime.state === "ready" && farm.presentation.state === "ready"
        ? "农场已生效"
        : issues.length
          ? "农场未完全生效"
          : "正在准备农场…";
    const key = JSON.stringify(checks);
    if (key !== this.diagnosticKey) {
      this.diagnosticKey = key;
      if (issues.length) this.activity.append("warning", `农场诊断：${issues.map((i) => i.message).join("；")}`);
      else if (checks.every(([, c]) => c.state === "ready")) this.activity.append("success", "农场已生效");
    }
    this.emit();
  }

  private readonly click = (event: MouseEvent): void => {
    if (event.target !== this.options.canvas || !this.visible || !this.state.picking) return;
    this.synchronize();
    if (!this.state.picking || !this.options.isInputEnabled()) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const p = this.pointer;
    this.pointer = undefined;
    if (!p || p.moved || event.button !== 0 || Math.hypot(event.clientX - p.x, event.clientY - p.y) > 5 || this.busy)
      return;
    const area = this.area;
    if (!area) return;
    const rect = this.options.canvas.getBoundingClientRect(),
      ray = new Ray();
    this.options.camera.screenPointToRay(
      new Vector2(
        ((event.clientX - rect.left) * this.options.canvas.width) / rect.width,
        ((event.clientY - rect.top) * this.options.canvas.height) / rect.height
      ),
      ray
    );
    const hit = this.options.runtime?.sampleTarget(
      {
        origin: [ray.origin.x, ray.origin.y, ray.origin.z],
        direction: [ray.direction.x, ray.direction.y, ray.direction.z]
      },
      8
    );
    if (!hit) {
      this.message = "未命中 8 米内的可选地面，请靠近后重试";
      this.emit();
      return;
    }
    this.groundTarget = targetAtPoint(area.service.getSnapshot().grid, hit.groundId, hit.position[0], hit.position[2]);
    this.readState();
    this.message = `已选择${this.selectionLabel}`;
    void this.refresh(true);
  };

  async setGrowthMultiplier(key: "cropGrowthMultiplier", value: number): Promise<void> {
    this.synchronize();
    const area = this.area;
    if (this.busy || this.disposed || !area) return;
    const generation = this.generation;
    this.busy = true;
    this.emit();
    try {
      await area.service.setGrowthMultipliers({ [key]: value });
      if (this.disposed || generation !== this.generation) return;
      this.message = `作物生长倍数已设为 ${value} 倍`;
      this.activity.append("success", this.message);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.message = `生长参数修改失败：${String(error)}`;
      this.activity.append("error", this.message);
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.busy = false;
        this.growthSettingsKey = "";
        this.readState();
      }
    }
  }

  async execute(action: FarmingDebugAction): Promise<void> {
    this.synchronize();
    const area = this.area;
    if (this.busy || this.disposed) return;
    const label = FARMING_DEBUG_ACTIONS.find(([id]) => id === action)![1];
    const reject = (reason: string) => {
      this.message = `${label}失败：${reason}`;
      this.activity.append("error", this.message);
      this.emit();
    };
    if (!area) {
      reject("农场尚未就绪");
      return;
    }
    this.readState();
    const available = this.availability.find((a) => a.action === action);
    if (!available?.enabled) {
      reject(available?.reason ?? "请先选择可操作的耕地或地面");
      return;
    }
    const plot = area.service.getPlot(this.state.plotId);
    if (!plot && !(action === "hoe" && this.groundTarget)) {
      reject("当前选中的是未开垦地面，请先锄地");
      return;
    }
    const input =
      action === "hoe"
        ? {
            farmId: area.farmId,
            target: this.groundTarget ?? {
              groundId: plot!.groundId,
              cellX: plot!.cellX,
              cellZ: plot!.cellZ
            },
            expectedCropInstanceId: plot?.crop?.instanceId ?? null
          }
        : action === "plant"
          ? {
              farmId: area.farmId,
              plotId: plot!.plotId,
              seedId: this.state.seedId
            }
          : action === "harvest"
            ? {
                farmId: area.farmId,
                plotId: plot!.plotId,
                cropInstanceId: plot?.crop?.instanceId ?? "missing-crop"
              }
            : { farmId: area.farmId, plotId: plot!.plotId };
    const generation = this.generation,
      publication = this.publication;
    const valid = () =>
      !this.disposed &&
      this.generation === generation &&
      this.options.runtime?.activeArea === area &&
      this.options.readCurrent() === publication;
    this.busy = true;
    this.message = `${this.selectionLabel} · 正在${label}…`;
    this.activity.append("info", this.message);
    this.emit();
    try {
      const runtime = this.options.runtime;
      if (!runtime?.available) throw new Error("农场组件已移除");
      const result = await runtime.api.execute({ operation: action, input } as FarmingRequest);
      if (!valid()) return;
      this.message = result.ok ? `${label}成功，已保存` : `${label}失败：${result.error.message}`;
      this.activity.append(result.ok ? "success" : "error", this.message);
    } catch (error) {
      if (!valid()) return;
      this.message = `${label}失败：${String(error)}`;
      this.activity.append("error", this.message);
    } finally {
      if (valid()) {
        this.busy = false;
        await this.refresh(true);
      }
    }
  }
  async damageCrop(): Promise<void> {
    this.synchronize();
    if (this.busy || this.disposed) return;
    this.readState();
    const runtime = this.options.runtime,
      area = this.area,
      plot = area?.service.getPlot(this.state.plotId);
    if (!runtime || !area || !plot?.crop) {
      this.message = "受损失败：请先选择作物";
      this.emit();
      return;
    }
    const generation = this.generation;
    this.busy = true;
    this.emit();
    try {
      const result = await runtime.api.execute({
        operation: "damageCrop",
        input: {
          farmId: area.farmId,
          plotId: plot.plotId,
          cropInstanceId: plot.crop.instanceId,
          damagePermille: this.state.damagePermille,
          source: "animal"
        },
        options: { expectedRevision: plot.revision }
      });
      if (this.disposed || generation !== this.generation) return;
      this.message = result.ok
        ? `受损成功：健康 ${result.value.damage.previousHealthPermille} → ${result.value.damage.healthPermille}，实际伤害 ${result.value.damage.actualDamagePermille}，revision ${result.value.receipt.revision}，重放 ${result.value.receipt.replayed}`
        : `受损失败：${result.error.message}`;
      this.activity.append(result.ok ? "success" : "error", this.message);
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.message = `受损失败：${String(error)}`;
        this.activity.append("error", this.message);
      }
    } finally {
      if (!this.disposed && generation === this.generation) {
        this.busy = false;
        await this.refresh(true);
      }
    }
  }

  travel(): void {
    this.synchronize();
    const current = this.publication;
    if (!current || !this.area) return;
    const snapshot = this.area.service.getSnapshot(),
      grid = snapshot.grid;
    // Frame the connected home plots; remote player clearings must not pull travel away from storage.
    const plots = this.area.service.queryPlots();
    const home = plots.reduce<(typeof plots)[number] | undefined>(
      (best, plot) => (!best || Math.hypot(plot.cellX, plot.cellZ) < Math.hypot(best.cellX, best.cellZ) ? plot : best),
      undefined
    );
    const cells = new Map(plots.filter((p) => p.groundId === home?.groundId).map((p) => [`${p.cellX},${p.cellZ}`, p]));
    const connected = home ? [home] : [];
    if (home) cells.delete(`${home.cellX},${home.cellZ}`);
    for (let i = 0; i < connected.length; i++) {
      const p = connected[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const key = `${p.cellX + dx},${p.cellZ + dz}`,
          next = cells.get(key);
        if (next) {
          cells.delete(key);
          connected.push(next);
        }
      }
    }
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    const include = (x: number, z: number, radius: number) => {
      minX = Math.min(minX, x - radius);
      maxX = Math.max(maxX, x + radius);
      minZ = Math.min(minZ, z - radius);
      maxZ = Math.max(maxZ, z + radius);
    };
    for (const p of connected)
      include(
        grid.originX + (p.cellX + 0.5) * grid.cellSize,
        grid.originZ + (p.cellZ + 0.5) * grid.cellSize,
        grid.cellSize / 2
      );
    for (const container of snapshot.storage.containers) {
      const type = storageDefinitions(this.definitions!).containers.find((t) => t.id === container.typeId);
      if (!type) continue;
      const bounds = containerBounds(container, type);
      minX = Math.min(minX, bounds.minimumX);
      maxX = Math.max(maxX, bounds.maximumX);
      minZ = Math.min(minZ, bounds.minimumZ);
      maxZ = Math.max(maxZ, bounds.maximumZ);
    }
    if (!Number.isFinite(minX)) include(grid.originX, grid.originZ, grid.cellSize);
    const centerX = (minX + maxX) / 2,
      centerZ = (minZ + maxZ) / 2;
    const { camera, navigation } = this.options;
    const verticalFov = (camera.fieldOfView * Math.PI) / 180;
    const halfFov = Math.min(verticalFov / 2, Math.atan(Math.tan(verticalFov / 2) * camera.aspectRatio));
    const distance = Math.max(4, (Math.hypot(maxX - minX, maxZ - minZ, 2) / 2 / Math.sin(halfFov)) * 1.15);
    const planned = current.plan.farming;
    const plannedGrid = planned?.placement?.grid;
    // A published entrance is relevant only while it describes the running farm's grid.
    const entry =
      plannedGrid?.originX === grid.originX && plannedGrid?.originZ === grid.originZ ? planned?.entrance : undefined;
    let dx = entry ? entry.x - centerX : 0,
      dz = entry ? entry.z - centerZ : -1;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) {
      dx = 0;
      dz = -1;
    } else {
      dx /= length;
      dz /= length;
    }
    const x = centerX + dx * distance,
      z = centerZ + dz * distance;
    const y = current.navigation.sampleHeightInterpolated(x, z);
    const centerY = current.navigation.sampleHeightInterpolated(centerX, centerZ);
    if (!Number.isFinite(y) || !Number.isFinite(centerY)) {
      this.message = "农场取景位置的地面尚未就绪";
      this.emit();
      return;
    }
    this.options.beforeTravel?.();
    this.setPicking(false);
    camera.entity.transform.setWorldPosition(x, y + navigation.groundClearance, z);
    camera.entity.transform.lookAt(new Vector3(centerX, centerY + 0.6, centerZ));
    navigation.synchronizeView();
    this.message = "已前往农场";
    this.activity.append("info", this.message);
  }
  destroy(): void {
    if (this.disposed) return;
    this.clearHighlight();
    this.disposed = true;
    this.inputAbort?.abort();
    this.inputAbort = undefined;
    this.releaseActivity?.();
    this.listeners.clear();
    delete this.options.canvas.dataset.farming;
  }
}
