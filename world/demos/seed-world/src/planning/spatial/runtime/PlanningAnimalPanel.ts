import type * as dat from "dat.gui";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import {
  ANIMAL_POPULATION_COMPONENT,
  readAnimalPopulationConfig,
  readAnimalPopulationSettings,
  SEED_ANIMAL_SPECIES
} from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import type { EditReceipt, PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { SpatialField } from "@galacean/engine-world-planning/spatial/SpatialDocument";

/** One live instance shown by the Seed animal inspector; no model objects cross the UI boundary. */
export interface PlanningAnimalPanelInstance {
  id: string;
  typeId: string;
  name: string;
  appearanceId: string;
  visible: boolean;
  loaded?: boolean;
  position: readonly [number, number, number];
  action: string;
  task?: string;
  movementSpeed?: number;
  animationRate?: number;
}

/** Read-only runtime evidence. Hosts may include more fields in the captured JSON snapshot. */
export interface PlanningAnimalPanelSnapshot {
  seed: number;
  loading: boolean;
  total: number;
  loaded?: number;
  visible: number;
  sharedResources: number;
  fireflies?: { visible: number; visibility: number; maximumCount: number };
  origin: { x: number; z: number } | null;
  range: { spawnRadius?: number; roamRadius?: number; activationDistance: number; simulationDistance?: number; worldWidth?: number } | null;
  errors: readonly string[];
  animals: readonly PlanningAnimalPanelInstance[];
}

/** Scene-owned panel services; parameter edits must pass through the same PlanningSession transaction as LLM tools. */
export interface PlanningAnimalPanelOptions {
  host: DebugInspectorPanelHost;
  planning: PlanningSession;
  apply(commands: PlanningParameterCommand[]): Promise<EditReceipt>;
  inspect(evidence?: boolean): PlanningAnimalPanelSnapshot;
  focus(id: string): void;
  command(id: string, skillId: "idle" | "startle" | "eat"): void;
  /** Move the observer back to the published spawn without changing population parameters. */
  returnToSpawn?: () => void;
}

/** Animal controls owned by the existing Seed gameplay inspector and its shared refresh cadence. */
export class PlanningAnimalPanel {
  readonly element: HTMLElement;
  private readonly folder: dat.GUI;
  private readonly abort = new AbortController();
  private readonly fields = new Map<string, { input: HTMLInputElement; controller: dat.GUIController }>();
  private readonly draft: Record<string, string | boolean> = {};
  private readonly selection = { id: "" };
  private readonly selectionController: dat.GUIController;
  private readonly selectedActions: HTMLButtonElement[];
  private readonly applyButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly discardButton: HTMLButtonElement;
  private readonly writeSummary: (value: string) => void;
  private readonly writeRange: (value: string) => void;
  private readonly writeErrors: (value: string) => void;
  private readonly writeInspection: (value: string) => void;
  private readonly writeEditStatus: (value: string) => void;
  private dirty = false;
  private readonly dirtyFields = new Set<string>();
  private applying = false;
  private disposed = false;
  private revision = -1;
  private listSignature = "";

  /** Mounts one gameplay folder; the caller owns the enclosing dat.gui and schedules refresh. */
  constructor(private readonly options: PlanningAnimalPanelOptions) {
    const host = options.host;
    const folder = (this.folder = host.folder("动物", false));
    this.element = folder.domElement;
    this.element.id = "animal-runtime-controls";
    this.element.setAttribute("aria-label", "动物参数与检查");
    this.writeSummary = host.addReadout(folder, "运行状态", "animal-runtime-summary");
    this.writeRange = host.addReadout(folder, "范围（米）", "animal-runtime-range");
    this.writeErrors = host.addReadout(folder, "诊断", "animal-runtime-errors");
    this.createInput(folder, ANIMAL_POPULATION_COMPONENT.fields.find((field) => field.key === "enabled")!);
    this.writeEditStatus = host.addReadout(folder, "参数状态", "animal-runtime-edit-status");
    const inspection = host.subfolder(folder, "动物检查", true);
    this.selectionController = inspection
      .add(this.selection, "id", { 等待动物进入场景: "" })
      .name("场景实例")
      .onChange(() => this.refresh());
    this.select().setAttribute("aria-label", "动物实例");
    this.selectedActions = [
      host.addAction(inspection, "观察这只", () => options.focus(this.selection.id)),
      host.addAction(inspection, "闲逛", () => options.command(this.selection.id, "idle")),
      host.addAction(inspection, "寻找食物并进食", () => options.command(this.selection.id, "eat")),
      host.addAction(inspection, "受惊", () => options.command(this.selection.id, "startle"))
    ];
    if (options.returnToSpawn) host.addAction(inspection, "回出生点", options.returnToSpawn);
    this.writeInspection = host.addReadout(inspection, "当前实例", "animal-runtime-inspection");
    const settings = host.subfolder(folder, "分布参数", false);
    host.addReadout(
      settings,
      "范围规则"
    )(
      "启用开关立即生效；下方数值修改后点击「应用分布参数」一起生效。\n在全图按噪声与水陆栖息地生成；动物可在全图合法区域活动。\n物种数先按 seed 抽取，每种数量再独立抽取；模型和外观变体不重复计为物种。所有动物统一在模拟圈内预加载和运动，显示圈外隐藏；模拟圈外已加载动物共用同一行为树和时钟，按需决策、粗步更新位置；不计算骨骼和动态避让，返回缓冲区提前恢复。未加载动物只保留分布信息。"
    );
    for (const field of ANIMAL_POPULATION_COMPONENT.fields.filter(
      (field) => field.key !== "enabled" && (!field.key.includes(".") || /^(species|birdCount)\.(min|max)$/.test(field.key))
    ))
      this.createInput(settings, field);
    const fireflies = host.subfolder(settings, "夏夜萤火虫", false);
    for (const field of ANIMAL_POPULATION_COMPONENT.fields.filter(field => field.key.startsWith("fireflies.")))
      this.createInput(fireflies, field);
    const species = host.subfolder(settings, "各类数量", false);
    host.addReadout(
      species,
      "数量规则"
    )(
      "鸟类按全图总数分配，至少一个鸟种能飞；以下为非鸟类数量。最少 ≤ 最多；0 / 0 禁用该类。世界 seed 与参数相同时，刷新复现同一种类和数量；落点不足会显示诊断。所有数量一起应用。"
    );
    for (const type of SEED_ANIMAL_SPECIES.filter(s => !s.canFly)) {
      const typeFolder = host.subfolder(species, type.label, false);
      for (const suffix of ["min", "max"])
        this.createInput(
          typeFolder,
          ANIMAL_POPULATION_COMPONENT.fields.find((field) => field.key === `species.${type.speciesId}.${suffix}`)!,
          suffix === "min" ? "最少数量" : "最多数量"
        );
    }
    this.applyButton = host.addAction(settings, "应用分布参数", () => void this.apply(false));
    this.resetButton = host.addAction(settings, "恢复默认", () => void this.apply(true));
    this.discardButton = host.addAction(settings, "撤销输入", () => {
      this.dirty = false;
      this.readFields();
      this.setEditStatus("已恢复为当前生效参数");
      this.refresh();
    });
    const evidence = host.subfolder(folder, "运行快照", false);
    const capture = host.addAction(evidence, "采集当前快照", () => {
      writeSnapshot(JSON.stringify(options.inspect(true), null, 2));
      host.refreshLayout();
    });
    capture.dataset.action = "capture";
    const writeSnapshot = host.addReadout(evidence, "当前快照", "animal-runtime-snapshot");
    this.element.querySelector<HTMLElement>("#animal-runtime-snapshot")!.tabIndex = 0;
    for (const event of ["keydown", "keyup", "pointerdown", "pointerup", "wheel"])
      this.element.addEventListener(event, (event) => event.stopPropagation(), { signal: this.abort.signal });
    this.readFields();
    this.setEditStatus("开关立即生效；分布参数修改后统一应用");
    this.refresh();
    host.refreshLayout();
  }

  /** Refreshes readouts without overwriting an unapplied parameter draft. */
  refresh(): void {
    if (this.disposed) return;
    if (!this.applying && this.revision !== this.options.planning.document.revision) this.readFields(this.dirty);
    const snapshot = this.options.inspect();
    this.writeSummary(
      `${snapshot.loading ? "加载中…" : `Seed ${snapshot.seed}`}\n显示 ${snapshot.visible} / ${snapshot.total} 只 · 已加载 ${snapshot.loaded ?? snapshot.total} 只 · 共享 GLB ${snapshot.sharedResources} 个` +
      (snapshot.fireflies ? `\n萤火虫 ${snapshot.fireflies.visible} / ${snapshot.fireflies.maximumCount} 只` : "")
    );
    this.writeRange(
      snapshot.origin && snapshot.range
        ? `出生与活动：全图 ${snapshot.range.worldWidth ?? "—"} 米\n显示距离 ${snapshot.range.activationDistance} 米 · 完整模拟 ${snapshot.range.simulationDistance ?? snapshot.range.activationDistance} 米`
        : "动物范围尚未初始化"
    );
    this.writeErrors(snapshot.errors.join("\n") || "无异常");
    const signature = JSON.stringify(
      snapshot.animals.map((animal) => [animal.id, animal.name, animal.visible, animal.loaded])
    );
    if (signature !== this.listSignature) {
      this.select().replaceChildren(
        ...snapshot.animals.map(
          (animal, index) =>
            new Option(
              `${index + 1}. ${animal.name}${animal.visible ? "" : animal.loaded === false ? " · 未加载" : " · 隐藏"}`,
              animal.id
            )
        )
      );
      if (!snapshot.animals.some((animal) => animal.id === this.selection.id))
        this.selection.id = snapshot.animals[0]?.id ?? "";
      // Keep the native option controller and its listener while replacing only its displayed choices.
      this.select().value = this.selection.id;
      this.listSignature = signature;
      this.options.host.refreshLayout();
    }
    const selected = snapshot.animals.find((animal) => animal.id === this.selection.id);
    this.selectedActions.forEach((action, index) => {
      action.disabled = !selected || (index > 0 && (!selected.visible || selected.loaded === false));
    });
    this.select().disabled = snapshot.animals.length === 0;
    this.writeInspection(
      selected
        ? `${selected.appearanceId} · ${selected.visible ? "显示" : selected.loaded === false ? "尚未加载" : "隐藏（详见运行快照）"}\n${selected.action}${selected.task ? ` · ${selected.task}` : ""}\n坐标（米） ${selected.position.map((value) => value.toFixed(1)).join(", ")}${selected.movementSpeed === undefined ? "" : `\n速度 ${selected.movementSpeed.toFixed(2)} m/s`}${selected.animationRate === undefined ? "" : ` · 动画速率 ${selected.animationRate.toFixed(2)}`}`
        : "等待动物进入场景"
    );
    const busy = this.applying || this.options.planning.pending;
    for (const { input } of this.fields.values()) input.disabled = busy;
    this.applyButton.disabled = busy || !this.dirty;
    this.resetButton.disabled = busy;
    this.discardButton.disabled = busy || !this.dirty;
  }

  /** Removes only the animal folder before its enclosing inspector is destroyed. */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.options.host.gui.removeFolder(this.folder);
    this.options.host.refreshLayout();
  }

  private createInput(folder: dat.GUI, field: SpatialField, label = field.label): void {
    // String-backed numeric inputs preserve invalid drafts for the schema to reject; dat.gui's
    // numeric controller would otherwise silently clamp or round before the atomic transaction.
    this.draft[field.key] = field.type === "boolean" ? false : "";
    const controller = folder.add(this.draft, field.key).name(field.unit === "米" ? `${label}（米）` : label);
    const input = controller.domElement.querySelector<HTMLInputElement>("input")!;
    input.setAttribute("aria-label", field.label);
    input.title = field.description ?? field.label;
    input.dataset.animalField = field.key;
    if (field.type !== "boolean") {
      input.type = "number";
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      input.step = field.integer ? "1" : String(field.step ?? "any");
      input.required = true;
    }
    const changed = () => {
      this.dirty = true;
      this.dirtyFields.add(field.key);
      this.setEditStatus("有未应用修改");
      this.refresh();
    };
    if (field.type === "boolean") {
      // Native BooleanController owns its change event; do not also mutate its value on input.
      controller.onChange((value: boolean) => void this.apply(false, { [field.key]: value }));
    } else {
      input.addEventListener(
        "input",
        () => {
          this.draft[field.key] = input.value;
          changed();
        },
        { signal: this.abort.signal }
      );
    }
    this.fields.set(field.key, { input, controller });
  }

  private readFields(preserveDistributionDraft = false): void {
    const { values } = readAnimalPopulationSettings(this.options.planning.document);
    if (!preserveDistributionDraft) this.dirtyFields.clear();
    for (const [key, { input, controller }] of this.fields) {
      if (preserveDistributionDraft && input.type !== "checkbox") continue;
      this.draft[key] = input.type === "checkbox" ? Boolean(values[key]) : String(values[key]);
      controller.updateDisplay();
      // A focused input is deliberately skipped by dat.gui; explicit discard/reset still replaces it.
      if (input.type === "checkbox") input.checked = Boolean(values[key]);
      else input.value = String(values[key]);
    }
    this.revision = this.options.planning.document.revision;
  }

  private async apply(reset: boolean, immediateValues?: Record<string, boolean>): Promise<void> {
    if (this.disposed) return;
    if (this.applying || this.options.planning.pending) {
      // A native controller can fire before the shared refresh disables it.
      if (immediateValues) {
        this.readFields(this.dirty);
        this.setEditStatus("上一笔参数修改仍在处理中；开关保持当前生效状态");
      }
      return;
    }
    // An immediate switch must neither submit nor discard an unfinished numeric draft.
    const values =
      immediateValues ??
      Object.fromEntries(
        [...this.fields]
          .filter(([key, { input }]) => input.type !== "checkbox" && this.dirtyFields.has(key))
          .map(([key, { input }]) => [key, input.valueAsNumber])
      );
    const commands: PlanningParameterCommand[] = reset
      ? [
          { op: "base", entity: "world", component: "animals" },
          { op: "reset", entity: "world", component: "animals" }
        ]
      : [{ op: "set", entity: "world", component: "animals", values }];
    this.applying = true;
    this.setEditStatus("正在应用…");
    this.refresh();
    try {
      const receipt = await this.options.apply(commands);
      if (this.disposed) return;
      if (receipt.status === "accepted") {
        if (!immediateValues) this.dirty = false;
        this.readFields(this.dirty);
        this.setEditStatus(
          immediateValues
            ? `动物已${readAnimalPopulationConfig(this.options.planning.document).enabled ? "启用" : "停用"}${this.dirty ? "；分布参数仍有未应用修改" : ""}`
            : reset
              ? "已恢复默认参数"
              : "分布参数已生效"
        );
      } else
        this.setEditStatus(
          receipt.message ?? (receipt.status === "superseded" ? "已被更新的参数事务替代" : "参数未通过校验"),
          true
        );
    } catch (error) {
      if (!this.disposed) this.setEditStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      if (immediateValues && !this.disposed) this.readFields(this.dirty);
      this.applying = false;
      this.refresh();
    }
  }

  private setEditStatus(message: string, error = false): void {
    this.writeEditStatus(`${error ? "错误：" : ""}${message}`);
    const status = this.element.querySelector<HTMLElement>("#animal-runtime-edit-status")!;
    status.dataset.error = String(error);
    status.dataset.editStatus = "";
    status.setAttribute("role", "status");
  }

  private select(): HTMLSelectElement {
    return this.selectionController.domElement.querySelector<HTMLSelectElement>("select")!;
  }
}
